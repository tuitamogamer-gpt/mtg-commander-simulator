import fs from 'node:fs';
import {randomInt} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {types} from 'node:util';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {assertGameStateInvariants, assertRecalculationStable} from '../tests/helpers/game-state-invariants.mjs';

const out=process.argv.slice(2).find(a=>a.startsWith('--output='))?.slice('--output='.length)||'output/random-match-2026-10-09';
fs.mkdirSync(out,{recursive:true});
const M=loadEngine();
const pool=Object.keys(M.DECKS).filter(name=>!M.DECKS[name].custom);
const replayPath=process.argv.slice(2).find(a=>a.startsWith('--selection-file='))?.slice('--selection-file='.length);
const selected=replayPath?JSON.parse(fs.readFileSync(replayPath,'utf8')):null;
if(!selected)for(let i=pool.length-1;i>0;i--){const j=randomInt(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
const decks=selected?.decks||pool.slice(0,4),seed=selected?.seed||randomInt(1,0x7fffffff),started=Date.now();
const metadata={generatedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTreeDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),replaysSelectionFrom:replayPath||null,selection:'Uniform random deck shuffle without replacement using node:crypto.randomInt',availableDecks:pool.length,decks,seed,difficulty:'normal',styles:['balanced','balanced','balanced','balanced'],paced:true,speedFactor:0,maxTurns:1000,internalAISearch:'native production beam search enabled',headless:true};
fs.writeFileSync(out+'/selection.json',JSON.stringify(metadata,null,2)+'\n');
const trace=fs.openSync(out+'/trace.jsonl','w');
const logs=[],decisions=[],turns=[],eliminations=[],actions=[],warnings=[],checks=[],attackMatrix=Array.from({length:4},()=>Array(4).fill(0));
let game,currentTurn=0,currentActor=null,decisionCount=0,lastPrinted=Date.now();
const perPlayer=[];
function compact(v,depth=0,seen=new Set()){
  if(v===null||['string','number','boolean'].includes(typeof v))return v;
  if(v===undefined)return null;
  if(typeof v==='function')return undefined;
  if(v instanceof M.Player)return {player:v.idx,name:v.name};
  if(v instanceof M.CardInst)return {iid:v.iid,name:v.name,zone:v.zone,controller:v.ctrl?.idx,owner:v.owner?.idx};
  if(v instanceof M.Game)return '[Game]';
  if(depth>5||seen.has(v))return '[reference]';
  seen.add(v);
  let result;
  if(Array.isArray(v)||types.isSet(v))result=[...v].map(x=>compact(x,depth+1,seen));
  else if(types.isMap(v))result=[...v].map(([k,x])=>[compact(k,depth+1,seen),compact(x,depth+1,seen)]);
  else result=Object.fromEntries(Object.entries(v).filter(([,x])=>typeof x!=='function').map(([k,x])=>[k,compact(x,depth+1,seen)]));
  seen.delete(v);return result;
}
const record=(type,data={})=>fs.writeSync(trace,JSON.stringify({type,turn:game?.turnNo||0,activePlayer:game?.turnPlayer?.idx??null,...data})+'\n');
function playerState(p){return {seat:p.idx+1,idx:p.idx,name:p.name,deck:p.deckName,commanders:p.commanders.map(c=>c.name),life:p.life,poison:p.poison,lost:!!p.lost,turns:p.turnsStarted,hand:p.hand.length,library:p.library.length,graveyard:p.graveyard.length,exile:p.exile.length,command:p.command.map(c=>c.name),battlefield:game.bf().filter(c=>c.ctrl===p).map(c=>({iid:c.iid,name:c.name,creature:c.is('Creature'),land:c.is('Land'),power:c.power,toughness:c.toughness,tapped:c.tapped,sick:c.sick,counters:{...c.counters}})),commanderDamage:{...p.commanderDamage}};}
function snapshot(){return {turn:game.turnNo,activePlayer:game.turnPlayer?.idx,phase:game.phase,step:game.step,stack:game.stack.map(s=>({kind:s.kind,name:s.name,controller:s.ctrl?.idx})),pendingTriggers:game.pendingTriggers.length,players:game.players.map(playerState)};}
function progress(force=false){if(!force&&Date.now()-lastPrinted<15000)return;lastPrinted=Date.now();const row={turn:game.turnNo,active:game.turnPlayer?.name,alive:game.alivePlayers().map(p=>`${p.name}: ${p.life}`),aiDecisions:decisions.length,elapsedSeconds:Math.round((Date.now()-started)/1000)};console.log(JSON.stringify({progress:row}));fs.writeFileSync(out+'/progress.json',JSON.stringify({...metadata,...row,snapshot:snapshot()},null,2)+'\n');}
game=M.newGame({humanDeck:decks[0],humanName:'Bot 1',aiDecks:decks.slice(1),aiNames:['Bot 2','Bot 3','Bot 4'],aiStyles:['balanced','balanced','balanced'],difficulty:'normal',seed,maxTurns:metadata.maxTurns,paced:true,onEvent:e=>{
  const turn=game?.turnNo||0;
  if(e.type==='log'){const row={turn,msg:e.msg,cls:e.cls||''};logs.push(row);record('log',row);if(/AI V2 fallback|safe-default|decision fallback|priority.*stall|Turn limit reached|TypeError|ReferenceError|fatal|guard.*limit|cleanup.*limit/i.test(e.msg)||e.cls==='error'){warnings.push(row);console.log(JSON.stringify({warning:row}));}}
  if(e.type==='turn'){currentTurn=turn;currentActor=e.p.idx;perPlayer[e.p.idx].turns++;record('turn',{player:e.p.idx,snapshot:snapshot()});progress();}
  if(e.type==='aiDecision'){const row={turn,player:e.player.idx,...compact(e.decision)};decisions.push(row);record('aiDecision',row);const p=perPlayer[e.player.idx];p.aiDecisions++;p.aiFallbacks+=Number(!!row.fallback);p.searchNodes+=row.analyzedNodes||0;p.searchDecisions+=Number((row.reachedDepth||0)>0);p.maxSearchDepth=Math.max(p.maxSearchDepth,row.reachedDepth||0);p.decisionMs.push(row.decisionTimeMs||0);}
  if(e.type==='cardPlayed'){const p=perPlayer[e.player.idx];if(e.kind==='land')p.playedLands++;if(e.kind==='spell')p.spellsCast++;record('cardPlayed',compact(e));}
  if(e.type==='combat'&&e.kind==='attackersDeclared'){for(const c of game.combat?.attackers||[]){const target=c.attacking instanceof M.Player?c.attacking:c.attacking?.ctrl;if(target){attackMatrix[c.ctrl.idx][target.idx]++;perPlayer[c.ctrl.idx].declaredAttackers++;}}record('attackersDeclared',{count:e.count,attackers:(game.combat?.attackers||[]).map(c=>compact({card:c,target:c.attacking}))});}
  if(e.type==='gameover')record('gameover',{winner:e.winner?.idx,snapshot:snapshot()});
}});
game.speedFactor=0;
perPlayer.push(...game.players.map(p=>({seat:p.idx+1,idx:p.idx,name:p.name,deck:p.deckName,turns:0,decisionQueries:0,queryTypes:{},aiDecisions:0,aiFallbacks:0,searchDecisions:0,maxSearchDepth:0,searchNodes:0,decisionMs:[],playedLands:0,spellsCast:0,activations:0,rejectedActions:0,declaredAttackers:0,blocks:0,mulligans:0})));
for(const p of game.players){const decide=p.controller.decide;p.controller.decide=async function(g,q){const real=g===game;if(real){const row=perPlayer[p.idx];row.decisionQueries++;row.queryTypes[q.type]=(row.queryTypes[q.type]||0)+1;decisionCount++;if(decisionCount>100000)throw Error('Harness decision ceiling reached; no winner fabricated');}const action=await decide.call(this,g,q);if(real){record('decision',{player:p.idx,query:q.type,choice:compact(action)});if(q.type==='mulligan'&&action)perPlayer[p.idx].mulligans++;if(q.type==='blockers'){if(types.isMap(action))perPlayer[p.idx].blocks+=action.size;else if(Array.isArray(action))perPlayer[p.idx].blocks+=action.length;}progress();}return action;};}
const performAction=game.performAction;
game.performAction=async function(p,action){const result=await performAction.call(this,p,action);if(this===game){const row={turn:this.turnNo,player:p.idx,kind:action.kind,card:action.card?.name||action.entry?.card?.name||null,result:result===false?false:true};actions.push(row);record('action',row);if(action.kind==='activate'&&result!==false)perPlayer[p.idx].activations++;if(result===false)perPlayer[p.idx].rejectedActions++;}return result;};
const playerLoses=game.playerLoses;
game.playerLoses=async function(p,why){if(this===game&&!p.lost){const row={turn:this.turnNo,player:p.idx,seat:p.idx+1,deck:p.deckName,reason:why,life:p.life,commanderDamage:{...p.commanderDamage}};eliminations.push(row);record('elimination',row);console.log(JSON.stringify({elimination:row}));}return playerLoses.call(this,p,why);};
game.onTurnCheckpoint=g=>{if(g!==game)return;const label=`end of turn ${g.turnNo}`;try{const result=assertGameStateInvariants(g,label);checks.push({turn:g.turnNo,...result});}catch(error){checks.push({turn:g.turnNo,error:error.message});throw error;}turns.push(snapshot());fs.writeFileSync(out+'/checkpoint.json',JSON.stringify(snapshot(),null,2)+'\n');progress();};
const seats=game.players.map(p=>({position:p.idx+1,idx:p.idx,name:p.name,deck:p.deckName,commanders:p.commanders.map(c=>c.name),isAI:p.isAI,controller:p.controller.constructor.name,style:p.aiStyle}));
console.log(JSON.stringify({selection:metadata,seats}));record('selection',{metadata,seats});
let failure=null,finalInvariant=null;
try{await game.start();finalInvariant=assertGameStateInvariants(game,'completed match');assertRecalculationStable(game,'completed match');if(!game.gameOver||!game.winner)throw Error('Match has not produced a natural winner');if(game.turnNo>=game.maxTurns||logs.some(l=>/Turn limit reached/i.test(l.msg)))throw Error('Artificial turn-limit winner is not a completed match');if(checks.some(c=>c.error))throw Error('State invariant failed during match');}catch(error){failure={name:error.name,message:error.message,stack:error.stack};console.error(error.stack);record('failure',failure);}
const summarize=p=>{const {decisionMs,...rest}=p;const sorted=decisionMs.slice().sort((a,b)=>a-b);return {...rest,decisionMeanMs:decisionMs.length?Math.round(decisionMs.reduce((a,b)=>a+b,0)/decisionMs.length):0,decisionP95Ms:sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*0.95))]:0};};
const result={...metadata,status:failure?'failed':'completed',durationMs:Date.now()-started,turns:game.turnNo,winner:game.winner?{seat:game.winner.idx+1,name:game.winner.name,deck:game.winner.deckName,life:game.winner.life}:null,seats,eliminations,players:game.players.map(playerState),botMetrics:perPlayer.map(summarize),attackMatrix,decisions:decisions.length,totalControllerQueries:decisionCount,actionCount:actions.length,rejectedActions:actions.filter(a=>a.result===false),fallbacks:{ai:decisions.filter(d=>d.fallback).length,safeDefault:game._decisionFallbacks||0},warnings,invariantChecks:checks.length,invariantFailures:checks.filter(c=>c.error),finalInvariant,pendingTriggers:game.pendingTriggers.length,stack:game.stack.length,failure};
fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2)+'\n');fs.writeFileSync(out+'/turns.json',JSON.stringify(turns,null,2)+'\n');fs.writeFileSync(out+'/log.json',JSON.stringify(logs,null,2)+'\n');fs.writeFileSync(out+'/decisions.json',JSON.stringify(decisions,null,2)+'\n');fs.closeSync(trace);console.log(JSON.stringify({result}));if(failure)process.exitCode=1;
