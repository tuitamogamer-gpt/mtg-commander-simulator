import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
import {createImportPlan,runtimeBatch} from '../scripts/import-oracle-batch.mjs';
import {proveRandomV25} from './helpers/oracle-v25-common-proof.mjs';
const M=loadEngine(),rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v25-common.json',import.meta.url),'utf8'));
const plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},limit:rows.length,sequence:9956,compilerVersion:25});const batch=runtimeBatch(plan.report),absent=batch.cards.filter(entry=>!M.DEFS[entry.raw.name]);if(absent.length)M.registerOracleBatch({...batch,cards:absent});M.initData(M.RAW_DATA);const draft={batches:[batch]};
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=100;},total=p=>Object.values(p.pool).reduce((a,b)=>a+b,0);
for(const role of ['human','ai'])for(const name of ['Cinderheart Giant','Scab-Clan Giant','Goblin Test Pilot'])test(role+': '+name+' pays and uses its printed random choice timing',async()=>{
 const f=context(M,role);await proveRandomV25(M,f,name,{fund,permanent:(M,g,p,n)=>put(M,g,p,n),zoneCard:(M,p,n,z)=>put(M,f.game,p,n,z),resolveAll:settle});
 if(role==='ai')assert.ok(f.a.controller instanceof M.AIController);
});
for(const role of ['human','ai'])test(role+': Scab-Clan Giant cannot fight a target that leaves and returns',async()=>{
 const {game,a,b}=context(M,role);fund(a);const host=put(M,game,b,'Grizzly Bears'),source=put(M,game,a,'Scab-Clan Giant','hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await game.resolveTop();await game.flushTriggers();assert.equal(game.stack[0].targets[0],host);await game.move(host,'exile');await game.putPermanentOntoBattlefield(host,b);await settle(game);assert.equal(host.zone,'battlefield');assert.equal(host.damage,0);assert.equal(source.damage,0);assertGameStateInvariants(game);
});
for(const role of ['human','ai'])for(const entry of draft.batches[0].cards.filter(e=>!['Captivating Glance','Gilt-Leaf Ambush','Mesmeric Sliver','Spin into Myth','Cinderheart Giant','Scab-Clan Giant','Goblin Test Pilot'].includes(e.raw.name)))test(role+': '+entry.raw.name+' pays and executes its complete hand program',async()=>{
 const {game,a,b}=context(M,role);fund(a);const seen=[];game.revealToHuman=async row=>{seen.push(row);};
 const bear=put(M,game,b,'Grizzly Bears','hand'),duplicate=put(M,game,b,'Grizzly Bears','hand'),land=put(M,game,b,'Forest','hand'),shock=put(M,game,b,'Shock','hand'),counter=put(M,game,b,'Counterspell','hand');
 const graveBear=put(M,game,b,'Grizzly Bears','graveyard'),graveShock=put(M,game,b,'Shock','graveyard');
 const host=put(M,game,b,'Grizzly Bears');
 const sacrificed=new M.CardInst({...M.DEFS['Grizzly Bears'],name:'Cost LKI fixture',cost:'{R}{G}',colors:['R','G']},a);sacrificed.zone='battlefield';sacrificed.ctrl=a;sacrificed.sick=false;game.battlefield.push(sacrificed);game.recalc();
 const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'?q.candidates.includes(b)?[b]:q.candidates.includes(host)?[host]:decide(g,q):q.type==='chooseCards'?q.from.includes(sacrificed)&&q.min?[sacrificed]:q.from.includes(bear)?[bear]:q.from.includes(graveBear)?[graveBear]:decide(g,q):decide(g,q);
 const source=put(M,game,a,entry.raw.name,'hand'),before=total(a);assert.equal(await game.castSpell(a,source,{from:'hand',quickTargets:[host]}),true);assert.ok(total(a)<before);await settle(game);
 if(entry.raw.name==='Rag Man'){source.sick=false;const activation=game.activatableList(a).find(e=>e.card===source);assert.ok(activation);assert.equal(await game.activateAbility(a,activation,[b]),true);await settle(game);assert.equal([bear,duplicate].filter(c=>c.zone==='graveyard').length,1);assert.equal(shock.zone,'hand');assert.equal(land.zone,'hand');}
 else if(entry.raw.name==='Mind Extraction'){assert.equal(sacrificed.zone,'graveyard');assert.equal(bear.zone,'graveyard');assert.equal(duplicate.zone,'graveyard');assert.equal(shock.zone,'graveyard');assert.equal(counter.zone,'hand');assert.equal(land.zone,'hand');}
 else if(entry.raw.name==='Hint of Insanity'){assert.equal(bear.zone,'graveyard');assert.equal(duplicate.zone,'graveyard');assert.equal(shock.zone,'hand');assert.equal(land.zone,'hand');}
 else if(entry.raw.name==='Thought Distortion'){assert.equal(shock.zone,'exile');assert.equal(counter.zone,'exile');assert.equal(graveShock.zone,'exile');assert.equal(graveBear.zone,'graveyard');assert.equal(land.zone,'hand');assert.equal(bear.zone,'hand');}
 else if(entry.raw.name==='Dreams of Steel and Oil'){assert.equal(bear.zone,'exile');assert.equal(graveBear.zone,'exile');assert.equal(shock.zone,'hand');assert.equal(graveShock.zone,'graveyard');}
 else if(entry.raw.name==='Vendilion Clique'){assert.equal(bear.zone,'library');assert.equal(b.library[0],bear);assert.equal(b.hand.length,5);assert.equal(seen.filter(r=>r.kind==='look')[0].ctrl,a);assert.ok(seen.some(r=>r.cards.length===1&&r.cards[0]===bear&&r.kind==='reveal'));}
 else if(entry.raw.name==='Oildeep Gearhulk'){assert.equal(bear.zone,'graveyard');assert.equal(b.hand.length,5);assert.equal(seen.filter(r=>r.kind==='look')[0].ctrl,a);}
 else if(entry.raw.name==='Cracked Skull'){assert.equal(bear.zone,'graveyard');assert.equal(source.attachedTo,host.iid);await game.damageCreature(shock,host,1);await settle(game);assert.equal(host.zone,'graveyard');assert.equal(source.zone,'graveyard');}
 else throw Error('No whole-body fixture');assertGameStateInvariants(game);
});
for(const role of ['human','ai'])for(const name of ['Captivating Glance','Gilt-Leaf Ambush'])for(const outcome of ['win','tie','lose'])test(role+': '+name+' applies the exact clash '+outcome+' branch',async()=>{
 const {game,a,b}=context(M,role);fund(a);const host=put(M,game,b,'Grizzly Bears'),older=put(M,game,a,'Grizzly Bears');
 put(M,game,a,outcome==='win'?'Colossal Dreadmaw':outcome==='tie'?'Shock':'Forest','library');put(M,game,b,outcome==='lose'?'Colossal Dreadmaw':outcome==='tie'?'Shock':'Forest','library');
 const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(host)?[host]:q.aiHint?.kind==='clashPlace'?'top':decide(g,q);
 const oldIds=new Set(game.bf().map(c=>c.iid)),source=put(M,game,a,name,'hand'),before=total(a);assert.equal(await game.castSpell(a,source,{from:'hand',quickTargets:[host]}),true);assert.ok(total(a)<before);await settle(game);
 if(name==='Captivating Glance'){await game.emit('endStep',{player:a});await settle(game);assert.equal(host.ctrl,outcome==='win'?a:b);await game.move(source,'graveyard');game.recalc();assert.equal(host.ctrl,outcome==='win'?a:b);}
 else{const created=game.bf().filter(c=>!oldIds.has(c.iid)&&c.isToken);assert.equal(created.length,2);for(const token of created){assert.equal(token.power,1);assert.equal(token.toughness,1);assert.equal(token.hasSub('Elf'),true);assert.equal(token.hasSub('Warrior'),true);assert.equal(token.kw('deathtouch'),outcome==='win');}assert.equal(older.kw('deathtouch'),false);}
 assertGameStateInvariants(game);
});
for(const role of ['human','ai'])for(const name of ['Mesmeric Sliver','Spin into Myth'])test(role+': '+name+' fateseals only the chosen opponent and keeps the private ordering',async()=>{
 const {game,a,b,others}=context(M,role,2);fund(a);fund(b);const untouched=others[1].library.slice(),choices=[];const host=put(M,game,b,'Grizzly Bears'),top=put(M,game,b,'Shock','library');
 const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(host)?[host]:q.aiHint?.kind==='chooseOpponent'?String(b.idx):q.type==='scry'&&q.libraryOwner?(choices.push(q),{top:[],bottom:q.cards}):decide(g,q);
 const source=put(M,game,a,name,'hand'),before=total(a);assert.equal(await game.castSpell(a,source,{from:'hand',quickTargets:[host]}),true);assert.ok(total(a)<before);await settle(game);
 assert.equal(choices.length,1);assert.equal(choices[0].player,a);assert.equal(choices[0].libraryOwner,b);assert.equal(b.library[0],name==='Spin into Myth'?host:top);assert.equal(choices[0].cards.length,name==='Spin into Myth'?2:1);assert.deepEqual(others[1].library,untouched);
 if(name==='Mesmeric Sliver'){
  const ownSliver=new M.CardInst({...M.DEFS['Grizzly Bears'],name:'Granted fateseal witness',subtypes:['Sliver']},b);ownSliver.ctrl=b;ownSliver.zone='hand';b.hand.push(ownSliver);game.turnPlayer=b;
  const old=b.controller.decide.bind(b.controller);b.controller.decide=(g,q)=>q.aiHint?.kind==='chooseOpponent'?String(a.idx):q.type==='scry'&&q.libraryOwner?{top:q.cards,bottom:[]}:old(g,q);
  let grantedChoice;const cdecide=b.controller.decide;b.controller.decide=(g,q)=>{if(q.type==='scry'&&q.libraryOwner)grantedChoice=q;return cdecide(g,q);};assert.equal(await game.castSpell(b,ownSliver,{from:'hand'}),true);await settle(game);assert.ok(grantedChoice);assert.equal(grantedChoice.player,b);assert.equal(grantedChoice.libraryOwner,a);
 }assertGameStateInvariants(game);
});
for(const role of ['human','ai']){
 for(const name of ['Vendilion Clique','Oildeep Gearhulk','Cracked Skull'])test(role+': '+name+' may decline its hand choice without drawing or moving a card',async()=>{
  const {game,a,b}=context(M,role);fund(a);const host=put(M,game,b,'Grizzly Bears'),chosen=put(M,game,b,'Shock','hand'),size=b.library.length;
  const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'?q.candidates.includes(b)?[b]:q.candidates.includes(host)?[host]:decide(g,q):q.type==='chooseCards'&&q.from.includes(chosen)?[]:decide(g,q);
  assert.equal(await game.castSpell(a,put(M,game,a,name,'hand'),{from:'hand'}),true);await settle(game);assert.equal(chosen.zone,'hand');assert.equal(b.hand.length,1);assert.equal(b.library.length,size);assertGameStateInvariants(game);
 });
 test(role+': Spin into Myth with an illegal sole target never fateseals',async()=>{
  const {game,a,b}=context(M,role);fund(a);const host=put(M,game,b,'Grizzly Bears');const decide=a.controller.decide.bind(a.controller);let choices=0;a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(host)?[host]:q.type==='scry'&&q.libraryOwner?(choices++,{top:q.cards,bottom:[]}):decide(g,q);
  assert.equal(await game.castSpell(a,put(M,game,a,'Spin into Myth','hand'),{from:'hand'}),true);await game.move(host,'exile');await settle(game);assert.equal(choices,0);assert.equal(host.zone,'exile');assertGameStateInvariants(game);
 });
 test(role+': Vendilion Clique skips a card that leaves and returns during its choice',async()=>{
  const {game,a,b}=context(M,role);fund(a);const card=put(M,game,b,'Shock','hand'),size=b.library.length,decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>{if(q.type==='chooseTargets'&&q.candidates.includes(b))return[b];if(q.type==='chooseCards'&&q.from.includes(card)){await g.move(card,'exile');await g.move(card,'hand');return[card];}return decide(g,q);};
  assert.equal(await game.castSpell(a,put(M,game,a,'Vendilion Clique','hand'),{from:'hand'}),true);await settle(game);assert.equal(card.zone,'hand');assert.equal(b.hand.length,1);assert.equal(b.library.length,size);assertGameStateInvariants(game);
 });
 test(role+': Mind Extraction and its copy retain sacrificed colors without paying the sacrifice again',async()=>{
  const {game,a,b}=context(M,role);fund(a);const red=put(M,game,b,'Shock','hand'),green=put(M,game,b,'Grizzly Bears','hand'),blue=put(M,game,b,'Counterspell','hand');const victim=new M.CardInst({...M.DEFS['Grizzly Bears'],name:'Sacrifice color LKI witness',cost:'{R}{G}',colorsOverride:['R','G']},a);victim.zone='battlefield';victim.ctrl=a;game.battlefield.push(victim);game.recalc();const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:q.type==='chooseCards'&&q.from.includes(victim)?[victim]:decide(g,q);
  assert.equal(await game.castSpell(a,put(M,game,a,'Mind Extraction','hand'),{from:'hand'}),true);const original=game.stack[0];assert.equal(victim.zone,'graveyard');victim.def={...victim.def,cost:'{U}',colorsOverride:['U']};assert.ok(await game.copySpell(original,a,{mayNewTargets:false}));await settle(game);assert.equal(red.zone,'graveyard');assert.equal(green.zone,'graveyard');assert.equal(blue.zone,'hand');assert.equal(a.graveyard.filter(c=>c===victim).length,1);assertGameStateInvariants(game);
 });
}
