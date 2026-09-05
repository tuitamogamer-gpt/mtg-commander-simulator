import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
const M=loadEngine(),cards=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-hand-activations.json',import.meta.url))),plan=createImportPlan({cards,bulk:{type:'oracle_cards'},baseNames:new Set(),sequence:9993,limit:cards.length});
const missing=plan.report.cards.filter(row=>!M.DEFS[row.raw.name]);if(missing.length){M.registerOracleBatch({...plan.report,cards:missing});M.initData(M.RAW_DATA);}
function legend(c,n){const card=new M.CardInst({name:'Legend '+n,cost:'{W}',types:['Creature'],super:['Legendary'],subtypes:['Human'],power:'1',toughness:'4'},c.a);card.zone='battlefield';card.sick=false;c.game.battlefield.push(card);c.game.recalc();return card;}
for(const role of ['human','ai'])for(const card of cards)test(`${role}: ${card.name} pays its exact printed discard activation`,async()=>{
 const c=context(M,role),source=put(M,c.game,c.a,card.name,'hand'),entry=plan.report.cards.find(row=>row.raw.name===card.name),op=entry.implementation.find(op=>op.from==='hand');
 const target=put(M,c.game,c.b,'Colossal Dreadmaw');target.attacking=c.a;
 const ghostTargets=card.name==='Ghost-Lit Drifter'?Array.from({length:3},()=>put(M,c.game,c.a,'Grizzly Bears')):null;
 let graveDonor;
 if(card.name==='Faerie Macabre'){await c.game.move(target,'graveyard');graveDonor=put(M,c.game,c.b,'Grizzly Bears','graveyard');}
 if(card.name==='Takenuma, Abandoned Mire')graveDonor=put(M,c.game,c.a,'Grizzly Bears','library');
 if(op.cost.manaAdjustment)for(let i=0;i<3;i++)legend(c,i);
 const printed=M.parseCost(op.cost.mana);for(const pip of printed.pips)c.a.pool[pip[0]]++;c.a.pool.C=op.cost.manaAdjustment?0:printed.generic+printed.x*3;
 const beforeMana=Object.values(c.a.pool).reduce((sum,n)=>sum+n,0),beforeLibrary=c.a.library.length,life=c.a.life;
 if(role==='human'){const decide=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=async(g,q)=>q.type==='chooseX'?3:q.type==='chooseTargets'?(ghostTargets||[target,graveDonor]).filter(x=>q.candidates.includes(x)).slice(0,q.max):q.type==='chooseCards'&&q.search?q.from.slice(0,1):decide(g,q);}
 const offered=c.game.activatableList(c.a).find(row=>row.card===source&&row.handAbility);assert.ok(offered);assert.equal(await c.game.activateAbility(c.a,offered),true);assert.equal(source.zone,'graveyard');assert.equal(Object.values(c.a.pool).reduce((sum,n)=>sum+n,0),0);assert.equal(beforeMana,printed.pips.length+(op.cost.manaAdjustment?0:printed.generic+printed.x*3));
 const stack=c.game.stack.find(row=>row.srcCard===source);assert.ok(stack);await settle(c.game);
 if(card.name==='Ghost-Lit Drifter'){assert.equal(stack.ctx.x,3);assert.equal(stack.ctx.targets.flat().length,3);for(const x of stack.ctx.targets.flat())assert.equal(x.kw('flying'),true);}
 else if(card.name==='Eiganjo, Seat of the Empire')assert.equal(target.damage,4);
 else if(card.name==='Otawara, Soaring City')assert.equal(target.zone,'hand');
 else if(card.name==='Takenuma, Abandoned Mire'){assert.equal(c.a.library.length,beforeLibrary-3);assert.equal(graveDonor.zone,'hand');}
 else if(card.name==='Faerie Macabre'){assert.equal(target.zone,'exile');assert.equal(graveDonor.zone,'exile');}
 else if(card.name==='Herd Migration'){assert.equal(c.a.life,life+3);assert.equal(c.a.hand.length,1);assert.equal(c.a.hand[0].hasSub('Forest'),true);}
 else if(card.name==="Visionary's Dance"){assert.equal(c.a.hand.length,1);assert.equal(c.a.graveyard.length,2);assert.equal(c.a.library.length,beforeLibrary-2);}
 else assert.equal(c.game.bf().filter(card=>card.isToken&&card.hasSub('Treasure')).length,1);
});

test('a stale hand source cannot return as a different object and pay the announced discard cost',async()=>{
 const c=context(M),source=put(M,c.game,c.a,'Eiganjo, Seat of the Empire','hand'),target=put(M,c.game,c.b,'Colossal Dreadmaw');target.attacking=c.a;c.a.pool.W=1;c.a.pool.C=2;
 const offered=c.game.activatableList(c.a).find(row=>row.card===source&&row.handAbility);assert.ok(offered);
 c.a.controller.decide=async(g,q)=>{if(q.type==='chooseTargets'){await g.move(source,'graveyard');await g.move(source,'hand');return[target];}return null;};
 assert.equal(await c.game.activateAbility(c.a,offered),false);assert.equal(source.zone,'hand');assert.equal(c.a.pool.W,1);assert.equal(c.a.pool.C,2);assert.equal(c.game.stack.length,0);
});

for(const role of ['human','ai'])test(`${role}: legendary discounts reduce only generic mana and count only your battlefield`,async()=>{
 for(const n of [0,1,7]){
  const c=context(M,role),source=put(M,c.game,c.a,'Eiganjo, Seat of the Empire','hand'),target=put(M,c.game,c.b,'Colossal Dreadmaw');target.attacking=c.a;
  for(let i=0;i<n;i++)legend(c,i);for(let i=0;i<4;i++)legend({...c,a:c.b},'opponent '+i);
  c.a.pool.C=Math.max(0,2-n);c.a.pool.W=1;
  const offered=c.game.activatableList(c.a).find(row=>row.card===source&&row.handAbility);assert.ok(offered);
  assert.equal(await c.game.activateAbility(c.a,offered),true);assert.equal(c.a.pool.C,0);assert.equal(c.a.pool.W,0);await settle(c.game);assert.equal(target.damage,4);
 }
 const c=context(M,role),source=put(M,c.game,c.a,'Eiganjo, Seat of the Empire','hand'),target=put(M,c.game,c.b,'Colossal Dreadmaw');target.attacking=c.a;for(let i=0;i<7;i++)legend(c,i);c.a.pool.C=3;
 assert.equal(c.game.activatableList(c.a).some(row=>row.card===source&&row.handAbility),false,'colored symbol cannot be paid by the generic discount');
});

for(const role of ['human','ai'])test(`${role}: hand targets are validated before paying the exact discard cost`,async()=>{
 for(const invalid of ['wrong-zone','duplicate','too-many']){
  const c=context(M,role),source=put(M,c.game,c.a,'Faerie Macabre','hand'),a=put(M,c.game,c.b,'Grizzly Bears','graveyard'),b=put(M,c.game,c.b,'Shivan Dragon','graveyard'),d=put(M,c.game,c.b,'Colossal Dreadmaw',invalid==='wrong-zone'?'battlefield':'graveyard');
  const offered=c.game.activatableList(c.a).find(row=>row.card===source&&row.handAbility);assert.ok(offered);
  const targets=invalid==='wrong-zone'?[[d]]:invalid==='duplicate'?[[a,a]]:[[a,b,d]];
  assert.equal(await c.game.activateAbility(c.a,offered,targets),false);assert.equal(source.zone,'hand');assert.equal(c.game.stack.length,0);assert.equal(a.zone,'graveyard');assert.equal(b.zone,'graveyard');
 }
});

for(const invalid of [-1,1.5,4,NaN,null,'',true])test(`hand activation rejects invalid announced X ${String(invalid)}`,async()=>{
 const c=context(M),source=put(M,c.game,c.a,'Ghost-Lit Drifter','hand');put(M,c.game,c.a,'Grizzly Bears');Object.assign(c.a.pool,{C:3,U:1});
 const decide=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=async(g,q)=>q.type==='chooseX'?invalid:decide(g,q);
 const offered=c.game.activatableList(c.a).find(row=>row.card===source&&row.handAbility);assert.ok(offered);
 assert.equal(await c.game.activateAbility(c.a,offered),false);assert.equal(source.zone,'hand');assert.equal(c.a.pool.C,3);assert.equal(c.a.pool.U,1);assert.equal(c.game.stack.length,0);
});

for(const role of ['human','ai'])test(`${role}: exact X target count persists on the hand ability Stack object and surviving targets resolve`,async()=>{
 const c=context(M,role),source=put(M,c.game,c.a,'Ghost-Lit Drifter','hand'),targets=Array.from({length:3},()=>put(M,c.game,c.a,'Grizzly Bears'));Object.assign(c.a.pool,{C:3,U:1});
 const decide=c.a.controller.decide.bind(c.a.controller);if(role==='human')c.a.controller.decide=async(g,q)=>q.type==='chooseX'?3:decide(g,q);
 const offered=c.game.activatableList(c.a).find(row=>row.card===source&&row.handAbility);assert.equal(await c.game.activateAbility(c.a,offered),true);
 const stack=c.game.stack.find(row=>row.srcCard===source);assert.equal(stack.targetSpecs[0].min,3);assert.equal(stack.targetSpecs[0].count,3);
 await c.game.move(targets[0],'exile');await c.game.move(targets[0],'battlefield');await settle(c.game);
 assert.equal(targets[0].kw('flying'),false,'blinked target is a new object');for(const target of targets.slice(1))assert.equal(target.kw('flying'),true);
});

test('hand activation grammar rejects unsupported costs, suffixes, unbound quantities and effect references',()=>{
 const base={name:'Hand grammar boundary',layout:'normal',type_line:'Creature — Human',mana_cost:'{G}',power:'2',toughness:'2',keywords:[]};
 for(const oracle_text of [
  '{G}, Discard another card: Draw a card.',
  '{G}, Discard this card: Draw a card. Then do an unsupported action.',
  'Discard this card: Draw X cards.',
  '{X}, Discard this card: Draw X cards.\nWhen this creature enters, draw X cards.',
  '{G}, Discard this card: Draw a card. This ability costs {1} less to activate for each card in your hand.',
  'Discard this card: Draw that many cards.',
 ])assert.equal(!!semanticClass({...base,oracle_text},{compilerVersion:8}).semanticClass,false,oracle_text);
});
