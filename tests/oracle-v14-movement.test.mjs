import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v14-movement.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9931,limit:absent.length,compilerVersion:14});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);}
M.initData(M.RAW_DATA);
function choose(player,handler){const old=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>{const answer=handler(g,q);return answer===undefined?old(g,q):answer;};}
async function announce(f,name,targets=[],options={}){const card=put(M,f.game,f.a,name,'hand');for(const color of ['W','U','B','R','G','C'])f.a.pool[color]=30;choose(f.a,(g,q)=>q.type==='chooseTargets'?targets.filter(card=>q.candidates.includes(card)):undefined);assert.equal(await f.game.castSpell(f.a,card,{from:'hand',...options}),true);return card;}
async function attach(f,name,host,player=f.a){const card=put(M,f.game,player,name);assert.equal(await f.game.attach(card,host),true);return card;}
test('v14 movement clauses preserve the exact full text and reject unknown tails',()=>{for(const card of rows){assert.ok(semanticClass(card,{compilerVersion:14}).semanticClass,card.name);assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:14}).semanticClass,undefined,card.name);}});
for(const role of ['human','ai']){
 test(role+': Hubris returns the chosen creature and every attached Aura to their owners',async()=>{
  const f=context(M,role),{game,a,b}=f,host=put(M,game,b,'Craw Wurm'),aura=await attach(f,'Pacifism',host),other=await attach(f,'Flight',host,b),equipment=await attach(f,'Bonesplitter',host),unrelated=put(M,game,b,'Runeclaw Bear');
  await announce(f,'Hubris',[host]);await settle(game);assert.equal(host.zone,'hand');assert.equal(aura.zone,'hand');assert.equal(other.zone,'hand');assert.ok(a.hand.includes(aura));assert.ok(b.hand.includes(other));assert.equal(equipment.zone,'battlefield');assert.equal(unrelated.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': an illegal Hubris target prevents the attached Aura from returning',async()=>{
  const f=context(M,role),{game,a,b}=f,host=put(M,game,b,'Craw Wurm'),aura=await attach(f,'Pacifism',host);await announce(f,'Hubris',[host]);M.E.pumpUntilEOT(game,host,0,0,['hexproof']);game.recalc();await settle(game);assert.equal(host.zone,'battlefield');assert.equal(aura.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': Silence exiles all selected creatures and their Auras in the same event',async()=>{
  const f=context(M,role),{game,a,b}=f,first=put(M,game,b,'Craw Wurm'),second=put(M,game,b,'Runeclaw Bear'),one=await attach(f,'Pacifism',first),two=await attach(f,'Flight',second),equipment=await attach(f,'Bonesplitter',first);
  await announce(f,'Silence the Believers',[first,second]);await settle(game);for(const card of [first,second,one,two])assert.equal(card.zone,'exile',card.name);assert.equal(equipment.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': End Hostilities destroys attachments even when their creature is indestructible',async()=>{
  const f=context(M,role),{game,a,b}=f,host=put(M,game,b,'Darksteel Myr'),equipment=await attach(f,'Bonesplitter',host),aura=await attach(f,'Pacifism',host),unattached=put(M,game,a,'Bonesplitter'),bear=put(M,game,b,'Runeclaw Bear');
  await announce(f,'End Hostilities');await settle(game);assert.equal(host.zone,'battlefield');for(const card of [equipment,aura,bear])assert.equal(card.zone,'graveyard');assert.equal(unattached.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': Mark of Eviction returns itself, the enchanted creature and its other Auras',async()=>{
  const f=context(M,role),{game,a,b}=f,host=put(M,game,b,'Craw Wurm'),aura=await attach(f,'Pacifism',host),source=await announce(f,'Mark of Eviction',[host]);await settle(game);await game.emit('upkeep',{player:a});await settle(game);for(const card of [host,aura,source])assert.equal(card.zone,'hand',card.name);assertGameStateInvariants(game);
 });
 test(role+': Biorhythm counts creatures separately for three players',async()=>{
  const f=context(M,role,2),{game,a}=f;for(const [i,player]of game.players.entries())for(let n=0;n<i+1;n++)put(M,game,player,'Runeclaw Bear');await announce(f,'Biorhythm');await settle(game);assert.deepEqual(Array.from(game.players,p=>p.life),[1,2,3]);assertGameStateInvariants(game);
 });
 test(role+': Repay in Kind uses the lowest life total and emits real life-loss events',async()=>{
  const f=context(M,role,2),{game}=f;for(const [i,p]of game.players.entries())p.life=[31,7,18][i];await announce(f,'Repay in Kind');await settle(game);assert.deepEqual(Array.from(game.players,p=>p.life),[7,7,7]);assert.deepEqual(Array.from(game.players,p=>p.turnState.lifeLost),[24,0,11]);assertGameStateInvariants(game);
 });
 test(role+': the targeted player chooses the card retained by Monomania',async()=>{
  const f=context(M,role),{game,a,b}=f,cards=['Forest','Craw Wurm','Sol Ring'].map(name=>put(M,game,b,name,'hand'));let chose=false;choose(b,(g,q)=>{if(q.prompt==='Choose cards to keep in hand'){chose=true;return [cards[1]];}});await announce(f,'Monomania',[b]);await settle(game);assert.equal(chose,true);assert.equal(cards[1].zone,'hand');assert.equal(cards[0].zone,'graveyard');assert.equal(cards[2].zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': Breakthrough draws four before choosing zero or two cards to keep',async()=>{
  for(const x of [0,2]){const f=context(M,role),{game,a}=f;put(M,game,a,'Craw Wurm','hand');const before=a.library.length;await announce(f,'Breakthrough',[],{xVal:x});await settle(game);assert.equal(a.library.length,before-4);assert.equal(a.hand.length,x);assert.equal(a.graveyard.length,6-x);assertGameStateInvariants(game);}
 });
 test(role+': Exponential Growth doubles the current power exactly X times, including negative power',async()=>{
  for(const [x,negative]of [[0,false],[3,false],[3,true]]){const f=context(M,role),{game,a}=f,host=put(M,game,a,'Craw Wurm');if(negative)M.E.pumpUntilEOT(game,host,-8,0,[]);game.recalc();const power=host.power;await announce(f,'Exponential Growth',[host],{xVal:x});await settle(game);assert.equal(host.power,power*2**x);assert.equal(host.toughness,4);assertGameStateInvariants(game);}
 });
}
