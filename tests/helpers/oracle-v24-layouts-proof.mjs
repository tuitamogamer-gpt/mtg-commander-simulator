import assert from 'node:assert/strict';
import {put,settle} from './oracle-v8-fixtures.mjs';
const worlds=new WeakMap(),wrapped=new WeakSet();let branch=null;
const actions=new Set(['put-qualified-hand-v24','chapter-linked-search-v24','chapter-linked-choose-v24','chapter-linked-release-one-v24','chapter-linked-avacyn-v24','loyalty-twice-v24','repeat-draw-hand-land-v24','draw-greatest-power-v24','chapter-player-loses-v24','chapter-tap-cohort-v24','chapter-exile-greatest-v24']);
const nodes=value=>value&&typeof value==='object'?[value,...Object.values(value).flatMap(v=>Array.isArray(v)?v.flatMap(nodes):nodes(v))]:[];
const fund=p=>{for(const c of ['W','U','B','R','G','C'])p.pool[c]=40;};
const make=(M,role,h)=>{const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'});for(const player of f.game.players)h.fillLibrary(M,player,40);f.game.priorityRound=async()=>{};return f;};
const decide=(p,predicate,value)=>{const prior=p.controller.decide.bind(p.controller);p.controller.decide=async(g,q)=>{const answer=await prior(g,q);return predicate(q)?value(q,g):answer;};};
const witness=(M,f,name,cost,types=['Creature'],zone='library')=>{const card=put(M,f.game,f.a,'Grizzly Bears',zone);card.def={...card.def,name,cost,types,kws:[]};f.game.recalc();return card;};
const advance=async(f,source,n)=>{f.game.addCounters(source,'lore',n-source.counters.lore,false,source.ctrl);await settle(f.game);};
export function installLayoutsProofV24(M,game){worlds.set(game,{rows:[],branch,controllers:new WeakSet()});}
function instrument(M,f,h){
 let w=worlds.get(f.game);if(!w){installLayoutsProofV24(M,f.game);w=worlds.get(f.game);}w.h=h;w.f=f;
 for(const player of f.game.players)if(!w.controllers.has(player.controller)){w.controllers.add(player.controller);const prior=player.controller.decide.bind(player.controller);player.controller.decide=async(g,q)=>{const answer=await prior(g,q);if(q.prompt==='Choose a qualified permanent card from your hand')return w.branch?.hand==='decline'?[]:q.from.slice(0,1);if(q.prompt==='Choose a creature with greatest power')return q.from.slice(-1);return answer;};}
 for(const handler of M.OracleV20.handlers)if(handler.layoutsV24&&!wrapped.has(handler)){wrapped.add(handler);const prior=handler.effect;handler.effect=async function(ctx,e,...args){const w=worlds.get(ctx.g);if(!w||!actions.has(e.action))return prior.call(this,ctx,e,...args);const row={effect:e,ctx:{...ctx},life:new Map(ctx.g.players.map(p=>[p,p.life])),hands:new Map(ctx.g.players.map(p=>[p,p.hand.slice()])),field:ctx.g.bf().slice(),states:new Map(ctx.g.bf().concat(...ctx.g.players.flatMap(p=>['hand','library','graveyard','exile'].flatMap(z=>p[z]))).map(c=>[c,{zone:c.zone,version:c.zoneVersion,power:c.power,toughness:c.toughness}])),choices:[],moves:[],draws:[]};w.rows.push(row);const emit=ctx.g.emit,move=ctx.g.move,priorDecide=ctx.you.controller.decide.bind(ctx.you.controller);ctx.g.emit=function(name,data,...args){if(name==='draw'&&data.player===ctx.you)row.draws.push(data.card);return emit.call(this,name,data,...args);};ctx.g.move=async function(card,destination,...opts){const version=card.zoneVersion,result=await move.call(this,card,destination,...opts);row.moves.push({card,destination,version,after:card.zoneVersion,zone:card.zone});return result;};ctx.you.controller.decide=async(g,q)=>{const answer=await priorDecide(g,q);row.choices.push({q,answer});return answer;};try{const result=await prior.call(this,ctx,e,...args);row.after={life:new Map(ctx.g.players.map(p=>[p,p.life])),hands:new Map(ctx.g.players.map(p=>[p,p.hand.slice()])),states:new Map([...row.states.keys()].map(c=>[c,{zone:c.zone,version:c.zoneVersion,tapped:c.tapped,haste:c.kw('haste'),noUntap:!!c.meta.noUntapOnce}]))};return result;}finally{ctx.g.emit=emit;ctx.g.move=move;ctx.you.controller.decide=priorDecide;}};}
 return w;
}
export function stageLayoutsCardV24(){return [];}
export function stageLayoutsEffectV24(M,f,e,h){
 if(!actions.has(e.action))return false;const w=instrument(M,f,h);
 if(e.action==='put-qualified-hand-v24'){
  const filter={...e.filter,zone:'graveyard',controller:'you'};if(filter.threshold?.kind==='source-counters'){delete filter.stat;delete filter.threshold;delete filter.comparison;}
  const card=h.stageGenericTarget(M,f,filter,'V24 qualified hand witness');card.owner.graveyard.splice(card.owner.graveyard.indexOf(card),1);card.zone='hand';f.a.hand.push(card);if(e.totalPowerToughness!==undefined)card.def={...card.def,power:'2',toughness:'3'};if(e.filter.threshold?.kind==='source-counters'){card.def={...card.def,cost:'{2}'};const list=f.game.activatableList;let prepared=false;f.game.activatableList=function(player,...args){if(!prepared){const source=this.bf().find(c=>c.name===h.entry.raw.name);if(source){source.counters[e.filter.threshold.counter]=2;prepared=true;}}return list.call(this,player,...args);};}f.game.recalc();return true;
 }
 if(e.action==='draw-greatest-power-v24'){
  for(const [player,power]of [[f.a,w.branch?.greatest==='false'?2:30],[f.b,w.branch?.greatest==='tie'?30:w.branch?.greatest==='false'?31:3]])h.permanent(M,f.game,player,h.fixtureDefinition('V24 greatest witness '+player.idx,['Creature'],{power:String(power),toughness:'40'}));return true;
 }
 if(e.action==='chapter-exile-greatest-v24'){for(const power of [2,5,5])h.permanent(M,f.game,f.b,h.fixtureDefinition('V24 tied opponent '+power,['Creature'],{power:String(power),toughness:'30',kws:['hexproof']}));return true;}
 if(e.action==='chapter-tap-cohort-v24'){for(const player of [f.a,f.b])for(const type of ['Artifact','Land','Creature'])h.permanent(M,f.game,player,h.fixtureDefinition('V24 cohort '+type+' '+player.idx,[type],{power:'2',toughness:'30'}));return true;}
 if(e.action==='repeat-draw-hand-land-v24'){for(let i=0;i<(w.branch?.lands??7);i++)h.permanent(M,f.game,f.a,'Forest');for(let i=0;i<2;i++)h.zoneCard(M,f.a,'Forest','hand');return true;}
 if(e.action==='chapter-player-loses-v24')return true;
 return true;
}
export async function assertLayoutsEffectV24(M,f,entry,e,source,targets,damaged,before,trace,label,h){
 if(!actions.has(e.action))return false;const w=worlds.get(f.game),rows=w?.rows.filter(r=>JSON.stringify(r.effect)===JSON.stringify(e));assert.ok(rows?.length,label+': actual instruction executed');
 for(const row of rows){
  if(e.action==='put-qualified-hand-v24'){
   const choice=row.choices.find(c=>c.q.prompt==='Choose a qualified permanent card from your hand');assert.ok(choice);const selected=choice.answer;assert.ok(Array.isArray(selected)&&selected.length<=1);
   for(const card of selected){const old=row.states.get(card),after=row.after.states.get(card);assert.equal(old.zone,'hand');assert.equal(after.zone,'battlefield');assert.equal(after.version,old.version+1);assert.equal(card.ctrl,row.ctx.you);assert.equal(after.tapped,!!e.tapped);if(e.haste)assert.equal(after.haste,true);if(e.totalPowerToughness!==undefined)assert.ok(old.power+old.toughness<=e.totalPowerToughness);}
   if(!selected.length&&e.elseEffects)assert.equal(row.after.hands.get(row.ctx.you).length,row.hands.get(row.ctx.you).length+1,label+': declining executes printed draw alternative');
   if(e.delayed&&selected.length){const card=selected[0],old=row.after.states.get(card);await f.game.emit('endStep',{player:f.b});await h.resolveAll(f.game);assert.equal(card.zone,e.delayed==='sacrifice'?'graveyard':'hand');assert.equal(card.zoneVersion,old.version+1,label+': delayed instruction affects exact entered object at first end step');}continue;
  }
  if(e.action==='loyalty-twice-v24')assert.equal(f.a.turnState.oracleLoyaltyTwiceV24Turn,f.game.turnNo);
  if(e.action==='draw-greatest-power-v24'){const creatures=row.field.filter(c=>c.is('Creature')),best=Math.max(...creatures.map(c=>row.states.get(c).power)),eligible=creatures.some(c=>c.ctrl===row.ctx.you&&row.states.get(c).power===best);assert.equal(row.after.hands.get(row.ctx.you).length-row.hands.get(row.ctx.you).length,eligible?e.n:0);}
  if(e.action==='chapter-player-loses-v24')for(const player of M.OracleV20.helpers.genericEffectSubjects(row.ctx,e.who))assert.equal(player.lost,true);
  if(e.action==='chapter-tap-cohort-v24'){const players=M.OracleV20.helpers.genericEffectSubjects(row.ctx,e.who);for(const card of row.field){const eligible=players.includes(card.ctrl)&&!card.is('Land'),after=row.after.states.get(card);assert.equal(after.noUntap,eligible);if(eligible)assert.equal(after.tapped,true);}}
  if(e.action==='chapter-exile-greatest-v24'){const players=M.OracleV20.helpers.genericEffectSubjects(row.ctx,e.who),cards=row.field.filter(c=>c.is('Creature')&&players.includes(c.ctrl)),best=Math.max(...cards.map(c=>row.states.get(c).power)),choice=row.choices.find(c=>c.q.prompt==='Choose a creature with greatest power');assert.ok(choice);assert.equal(choice.answer.length,1);const card=choice.answer[0];assert.equal(row.states.get(card).power,best);assert.equal(row.after.states.get(card).zone,'exile');assert.equal(row.after.states.get(card).version,row.states.get(card).version+1);assert.equal(cards.filter(c=>row.after.states.get(c).zone==='exile').length,1);}
  if(e.action==='repeat-draw-hand-land-v24'){const lands=row.field.filter(c=>c.ctrl===row.ctx.you&&c.is('Land')).length,choices=row.choices.filter(c=>c.q.prompt==='Choose a qualified permanent card from your hand'),first=choices[0].answer.length,repeat=lands+first>=e.threshold;assert.equal(choices.length,repeat?2:1);assert.equal(row.draws.length,repeat?2:1);assert.ok(row.moves.filter(m=>m.destination==='battlefield').every(m=>row.after.states.get(m.card).tapped));}
 }
 return true;
}
async function within(value,run){const old=branch;branch=value;try{return await run();}finally{branch=old;}}
async function linkedSagaProof(M,entry,op,role,h){
 let checks=0;
 if(entry.raw.name==='The Creation of Avacyn'){
  for(const accept of [false,true])for(const creature of [false,true]){const f=make(M,role,h);h.assertControllerRole(M,f,entry.raw.name);fund(f.a);const cards=[witness(M,f,'Linked '+(creature?'creature':'enchantment'),'{2}',[creature?'Creature':'Enchantment']),witness(M,f,'Linked artifact','{5}',['Artifact']),witness(M,f,'Linked instant','{3}',['Instant'])];let next=0;decide(f.a,q=>q.search,()=>[cards[next++]]);decide(f.a,q=>q.prompt==='Put all linked permanent cards onto the battlefield?',()=>{assert.ok(creature);return accept?'yes':'no';});const source=put(M,f.game,f.a,entry.raw.name,'hand'),pool=Object.values(f.a.pool).reduce((a,b)=>a+b,0);assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await settle(f.game);assert.ok(Object.values(f.a.pool).reduce((a,b)=>a+b,0)<pool);
   for(let i=0;i<2;i++){f.game.removeCounters(source,'lore',1);f.game.addCounters(source,'lore',1,false,f.a);await settle(f.game);}assert.ok(cards.every(c=>c.zone==='exile'&&c.faceDown));assert.ok(cards.every(c=>(c.meta.revealedTo||[]).includes(f.a.idx)));assert.ok(cards.every(c=>!(c.meta.revealedTo||[]).includes(f.b.idx)));const life=f.a.life;await advance(f,source,2);assert.equal(f.a.life,life-(creature?10:0));await advance(f,source,3);assert.equal(cards[0].zone,accept&&creature?'battlefield':'hand');assert.equal(cards[1].zone,accept&&creature?'battlefield':'hand');assert.equal(cards[2].zone,'hand');assert.equal(source.zone,'graveyard');checks+=10;
  }return checks;
 }
 if(entry.raw.name==='The Princess Takes Flight'){
  for(const changed of [false,true])for(const chosen of [false,true]){const f=make(M,role,h);h.assertControllerRole(M,f,entry.raw.name);fund(f.a);const victim=put(M,f.game,f.b,'Grizzly Bears'),host=put(M,f.game,f.a,'Grizzly Bears');decide(f.a,q=>q.type==='chooseTargets'&&q.candidates.includes(victim),()=>chosen?[victim]:[]);decide(f.a,q=>q.type==='chooseTargets'&&q.candidates.includes(host)&&q.min===1,()=>[host]);const source=put(M,f.game,f.a,entry.raw.name,'hand');assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await settle(f.game);assert.equal(victim.zone,chosen?'exile':'battlefield');if(chosen&&changed){await f.game.move(victim,'hand');await f.game.move(victim,'exile');}await advance(f,source,2);assert.equal(host.power,4);assert.equal(host.kw('flying'),true);await advance(f,source,3);assert.equal(victim.zone,chosen&&changed?'exile':'battlefield');if(victim.zone==='battlefield')assert.equal(victim.ctrl,f.b);assert.equal(source.zone,'graveyard');checks+=7;
  }return checks;
 }
 if(entry.raw.name==='The Aesir Escape Valhalla'){
  for(const changed of [false,true]){const f=make(M,role,h);h.assertControllerRole(M,f,entry.raw.name);fund(f.a);const card=witness(M,f,'Linked grave permanent','{3}',['Artifact'],'graveyard'),host=put(M,f.game,f.a,'Grizzly Bears');decide(f.a,q=>q.prompt==='Choose a permanent card to exile from your graveyard',()=>[card]);decide(f.a,q=>q.type==='chooseTargets'&&q.candidates.includes(host),()=>[host]);const source=put(M,f.game,f.a,entry.raw.name,'hand'),life=f.a.life;assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await settle(f.game);assert.equal(card.zone,'exile');assert.equal(f.a.life,life+3);if(changed){await f.game.move(card,'hand');await f.game.move(card,'exile');}await advance(f,source,2);assert.equal(host.counters['+1/+1']||0,changed?0:3);await advance(f,source,3);assert.equal(card.zone,changed?'exile':'hand');assert.equal(source.zone,'hand');checks+=7;
  }return checks;
 }
 if(entry.raw.name==='Roads Go Ever, Ever On'){
  for(const selected of [0,1,2]){const f=make(M,role,h);h.assertControllerRole(M,f,entry.raw.name);fund(f.a);const plains=[put(M,f.game,f.a,'Plains','library'),put(M,f.game,f.a,'Plains','library')];decide(f.a,q=>q.search,()=>plains.slice(0,selected));decide(f.a,q=>q.prompt==='Choose a card exiled with this Saga',q=>q.from.slice(0,1));const source=put(M,f.game,f.a,entry.raw.name,'hand'),life=f.a.life;assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await settle(f.game);assert.equal(f.a.life,life+2);assert.equal(plains.filter(c=>c.zone==='exile').length,selected);await advance(f,source,2);assert.equal(plains.filter(c=>c.zone==='hand').length,Math.min(selected,1));await advance(f,source,3);assert.equal(plains.filter(c=>c.zone==='hand').length,selected);assert.equal(source.zone,'battlefield');await advance(f,source,4);assert.equal(source.zone,'graveyard');checks+=8;
  }checks+=await h.genericRuntimeOperationProof(M,entry,{kind:'generic-trigger',event:'saga-chapter',eventFilter:'self',chapterIndex:3,...op.chapters[3]},role);return checks;
 }
 return null;
}
export async function operationProofV24(M,entry,op,role,h){
 if(op.kind==='saga-chapters'&&entry.raw.name==='Waking the Trolls'){
  let count=0;for(const [own,other]of [[2,1],[0,4],[2,4]]){const f=make(M,role,h),{game,a,b}=f;h.assertControllerRole(M,f,entry.raw.name);fund(a);for(let i=0;i<own;i++)put(M,game,a,'Forest');const lands=Array.from({length:other},()=>put(M,game,b,'Forest')),victim=lands[0];decide(a,q=>q.type==='chooseTargets'&&q.candidates.includes(victim),()=>[victim]);const source=put(M,game,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);assert.equal(victim.zone,'graveyard');await advance(f,source,2);assert.equal(victim.zone,'battlefield');assert.equal(victim.ctrl,a);const expected=Math.max(0,game.bf().filter(c=>c.ctrl===a&&c.is('Land')).length-game.bf().filter(c=>c.ctrl===b&&c.is('Land')).length);await advance(f,source,3);const tokens=game.creatures(a).filter(c=>c.isToken&&c.hasSub('Troll')&&c.hasSub('Warrior'));assert.equal(tokens.length,expected);for(const token of tokens){assert.equal(token.power,4);assert.equal(token.toughness,4);assert.equal(token.kw('trample'),true);}assert.equal(source.zone,'graveyard');count+=8;}return count;
 }
 if(op.kind==='saga-chapters'&&nodes(op).some(n=>n.link==='saga-chapter-1-v24'))return linkedSagaProof(M,entry,op,role,h);
 if(!['generic-trigger','generic-ability','spell-generic'].includes(op.kind))return null;
 const own=nodes(op).find(n=>actions.has(n.action));if(!own)return null;
 if(own.action==='put-qualified-hand-v24'&&!branch?.hand){let count=0;for(const hand of ['accept','decline'])count+=await within({hand},()=>h.genericRuntimeOperationProof(M,entry,op,role));return count;}
 if(own.action==='draw-greatest-power-v24'&&!branch?.greatest){let count=0;for(const greatest of ['true','false','tie'])count+=await within({greatest},()=>h.genericRuntimeOperationProof(M,entry,op,role));return count;}
 if(own.action==='repeat-draw-hand-land-v24'&&!branch?.lands){let count=0;for(const value of [{lands:7,hand:'accept'},{lands:6,hand:'accept'},{lands:8,hand:'decline'}])count+=await within(value,()=>h.genericRuntimeOperationProof(M,entry,op,role));return count;}
 return null;
}
