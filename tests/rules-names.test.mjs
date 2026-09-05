import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const M=loadEngine(),names=c=>Array.from(M.OracleV8NameGroups.names(c));
async function cast(c,p,name,options={}){
 const card=put(M,c.game,p,name,'hand');for(const color of 'WUBRGC')p.pool[color]=20;
 const before=Object.values(p.pool).reduce((a,b)=>a+b,0);c.game.turnPlayer=p;
 const offer=options.morph?c.game.castableList(p).find(row=>row.card===card&&row.alt?.faceDownCast):null;
 if(options.morph)assert.ok(offer,'real face-down casting option');
 assert.equal(await c.game.castSpell(p,card,{from:'hand',...(offer?{alt:offer.alt}:{}),...options}),true);
 assert.ok(Object.values(p.pool).reduce((a,b)=>a+b,0)<before,'actual mana payment');
 if(options.morph)assert.deepEqual(names(c.game.stack.find(s=>s.card===card)),[]);
 if(options.resolve!==false)await settle(c.game);return card;
}
for(const role of ['human','ai']){
 test(`${role}: paid Sever the Bloodline exiles only its nameless Morph target`,async()=>{
  const c=context(M,role),first=await cast(c,c.b,'Abzan Guide',{morph:true}),second=await cast(c,c.b,'Ascending Aven',{morph:true});
  for(const card of [first,second]){assert.equal(card.faceDown,true);assert.deepEqual(names(card),[]);}
  const spell=await cast(c,c.a,'Sever the Bloodline',{resolve:false}),target=c.game.stack.find(s=>s.card===spell).targets.flat()[0];
  assert.ok([first,second].includes(target));await settle(c.game);assert.equal(target.zone,'exile');assert.equal([first,second].find(card=>card!==target).zone,'battlefield');
 });
 test(`${role}: paid Quasiduplicate copies no name and Echoing Truth leaves the other nameless object`,async()=>{
  const c=context(M,role),original=await cast(c,c.b,'Abzan Guide',{morph:true});await cast(c,c.b,'Quasiduplicate');
  const copy=c.game.bf().find(card=>card.isToken);assert.ok(copy);assert.equal(copy.faceDown,false);assert.deepEqual(names(copy),[]);
  const clone=M.cloneGameForAISimulation(c.game,314);assert.deepEqual(names(clone.byIid(copy.iid)),[]);
  const data=M.captureGameState(c.game);assert.ok(data);const fresh=context(M,role);M.restoreGameState(fresh.game,JSON.parse(JSON.stringify(data)));assert.deepEqual(names(fresh.game.byIid(copy.iid)),[]);
  const restored=fresh.game.byIid(original.iid);assert.deepEqual(names(restored),[]);assert.equal(restored.power,2);assert.equal(restored.toughness,2);assert.equal(restored.hasSub('Human'),false);
  for(const color of 'WUBRGC')restored.ctrl.pool[color]=20;assert.equal(await fresh.game.turnFaceUp(restored.ctrl,restored),true);assert.deepEqual(names(restored),['Abzan Guide']);assert.equal(restored.power,4);assert.equal(restored.kw('lifelink'),true);
  const spell=await cast(c,c.a,'Echoing Truth',{resolve:false}),target=c.game.stack.find(s=>s.card===spell).targets.flat()[0];assert.ok([copy,original].includes(target));
  await settle(c.game);assert.equal(target.zone,target.isToken?'ceased':'hand');assert.equal([copy,original].find(card=>card!==target).zone,'battlefield');
 });
 test(`${role}: an explicit copy-name exception gives a nameless model a name`,async()=>{
  const c=context(M,role),original=await cast(c,c.a,'Abzan Guide',{morph:true});
  const [copy]=await c.game.copyPermanentToken(original,c.a,{name:'Named copy'});assert.deepEqual(names(copy),['Named copy']);
  const def=M.OracleV8Copies.modifiedDefinition(original.def,{name:'Another named copy'},{});assert.deepEqual(names(def),['Another named copy']);assert.deepEqual(names(original),[]);
 });
 test(`${role}: a split card has both names in hand but only the cast half on the Stack`,async()=>{
  const c=context(M,role),card=put(M,c.game,c.a,'Fire // Ice','hand');for(const color of 'WUBRGC')c.a.pool[color]=20;
  put(M,c.game,c.b,'Sol Ring');assert.deepEqual(names(card),['Fire','Ice']);const offer=c.game.castableList(c.a).find(row=>row.card===card&&row.alt?.name==='Ice');assert.ok(offer);
  assert.equal(await c.game.castSpell(c.a,card,{from:offer.from,alt:offer.alt}),true);
  assert.deepEqual(names(c.game.stack.find(s=>s.card===card)),['Ice']);await settle(c.game);assert.equal(card.zone,'graveyard');assert.deepEqual(names(card),['Fire','Ice']);
 });
}
