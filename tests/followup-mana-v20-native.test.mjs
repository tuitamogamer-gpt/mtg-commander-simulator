import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(){
 const game=new M.Game({seed:101020272,paced:false});game.speedFactor=0;
 const f={game,target:null,main:null};
 const controller={decide:async(g,q)=>{
  if(q.type==='priority'){f.priorityObserve?.(g);return {kind:'pass'};}
  if(q.type==='main'){if(f.main){const run=f.main;f.main=null;await run();}return {kind:'done'};}
  if(q.type==='chooseManaSources')return {auto:true};
  if(q.type==='chooseTargets')return q.candidates.includes(f.target)?[f.target]:q.candidates.slice(0,q.min||0);
  if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
  if(q.type==='chooseOption')return q.options[0]?.key;
  if(q.type==='chooseX')return Math.max(1,q.min||0);
  if(q.type==='orderTriggers')return q.triggers;
  if(q.type==='scry')return {top:q.cards,bottom:[]};
  if(['attackers','blockers','combatReview'].includes(q.type))return [];
  return null;
 }};
 f.me=game.addPlayer('Native V20 payer',{},controller,false);f.rival=game.addPlayer('Native V20 rival',{},controller,false);
 game.turnPlayer=f.me;game.turnNo=9;game.phase='main2';game.step='main';
 f.put=(name,zone='battlefield',owner=f.me)=>{assert.ok(M.DEFS[name],name);const c=new M.CardInst(M.DEFS[name],owner);c.zone=zone;c.sick=false;(zone==='battlefield'?game.battlefield:owner[zone]).push(c);game.recalc();return c;};
 for(const p of [f.me,f.rival])for(let i=0;i<30;i++)f.put('Forest','library',p);
 f.settle=async()=>{let n=50;while((game.stack.length||game.pendingTriggers.length)&&n--){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.ok(n>0);assertGameStateInvariants(game);};
 f.cast=async(name,lands=[])=>{const c=f.put(name,'hand');for(const land of lands)f.put(land);assert.ok(game.castableList(f.me).some(e=>e.card===c),name+' offered');assert.equal(await game.castSpell(f.me,c,{from:'hand'}),true,name+' actual paid cast');await f.settle();assert.equal(c.castMeta.manaSpent,M.mv(c.def.cost));return c;};
 f.petalCast=async name=>{for(let i=0;i<M.mv(M.DEFS[name].cost);i++)await f.cast('Lotus Petal');const c=await f.cast(name);assert.equal(game.bf().some(c=>c.name==='Lotus Petal'),false,'all native Petals were sacrificed for the printed spell');return c;};
 return f;
}

test('Actual paid Oteclan Craft pays real destroyed Sol Ring material and returns transformed after native ability activation',async t=>{
 const f=fixture(),landmark=await f.cast('Oteclan Landmark // Oteclan Levitator',['Plains']);
 const ring=await f.cast('Sol Ring',['Wastes']);f.target=ring;
 await f.cast('Disenchant',['Plains','Wastes']);assert.equal(ring.zone,'graveyard');
 const sources=['Plains','Wastes','Wastes'].map(n=>f.put(n));
 const entry=f.game.activatableList(f.me).find(e=>e.card===landmark&&e.ability?.oracleCraftV20);assert.ok(entry,'real paid Craft is offered');
 let pending;f.priorityObserve=g=>{if(g.stack.some(s=>s.kind==='ability'&&s.srcCard===landmark))pending={source:landmark.zone,material:ring.zone,face:landmark.oracleFace};};
 const paid=await f.game.activateAbility(f.me,entry);
 t.diagnostic(JSON.stringify({paid,source:landmark.zone,material:ring.zone,pool:f.me.pool,sourcesTapped:sources.filter(c=>c.tapped).length,stack:f.game.stack.map(s=>s.kind)}));
 assert.equal(paid,true,'a payable real Craft activation must commit successfully');
 assert.deepEqual(pending,{source:'exile',material:'exile',face:'front'},'the real priority window sees both paid exile costs before resolution');assert.equal(ring.zone,'exile');
 await f.settle();assert.equal(landmark.zone,'battlefield');assert.equal(landmark.oracleFace,'back');assert.equal(landmark.name,'Oteclan Levitator');assert.equal(landmark.meta.oracleCraftV20.rows.length,1);assertGameStateInvariants(f.game);
});

test('Actual paid black Craft commits the extra printed Drought Swamp sacrifice before exiling its source and returning transformed',async t=>{
 const f=fixture(),bear=await f.cast('Grizzly Bears',['Forest','Wastes']);f.target=bear;
 await f.cast('Disfigure',['Swamp']);assert.equal(bear.zone,'graveyard');
 const blade=await f.cast('Tithing Blade // Consuming Sepulcher',['Swamp','Wastes']);
 await f.cast('Drought',['Plains','Plains','Wastes','Wastes']);
 for(const name of ['Swamp','Wastes','Wastes','Wastes','Wastes'])f.put(name);
 const entry=f.game.activatableList(f.me).find(e=>e.card===blade&&e.ability?.oracleCraftV20);assert.ok(entry,'the paid black Craft and actual extra sacrifice are available');
 const paid=await f.game.activateAbility(f.me,entry);await f.settle();
 t.diagnostic(JSON.stringify({paid,source:blade.zone,face:blade.oracleFace,material:bear.zone,swamps:f.me.graveyard.filter(c=>c.name==='Swamp').length}));
 assert.equal(paid,true);assert.equal(blade.zone,'battlefield');assert.equal(blade.oracleFace,'back');assert.equal(bear.zone,'exile');assert.equal(f.me.graveyard.filter(c=>c.name==='Swamp').length,1,'Drought requires a separately paid Swamp sacrifice for the black activation');assertGameStateInvariants(f.game);
});

test('Actual paid ordinary Mazemind Tome ability pays mana and resolves beside global native cost decoration',async()=>{
 const f=fixture(),tome=await f.cast('Mazemind Tome',['Wastes','Wastes']);f.put('Wastes');f.put('Wastes');
 const entry=f.game.activatableList(f.me).find(e=>e.card===tome&&e.ability?.cost?.mana);assert.ok(entry);
 const hand=f.me.hand.length;assert.equal(await f.game.activateAbility(f.me,entry),true);assert.equal(tome.tapped,true);await f.settle();assert.equal(f.me.hand.length,hand+1);assertGameStateInvariants(f.game);
});

test('Actual paid Paintmage first native main trigger cannot fund the actual Detritivore Suspend special action',async t=>{
 const f=fixture();await f.petalCast('Abstract Paintmage');const detritivore=f.put('Detritivore','hand');const wastes=Array.from({length:5},()=>f.put('Wastes'));
 let receipt;f.main=async()=>{
  const canPay=f.game.canPayMana(f.me,M.parseCost(detritivore.def.suspend.cost),{card:detritivore,isSpecialAction:true,suspendAction:true},{xVal:1});
  const offered=f.game.activatableList(f.me).some(e=>e.card===detritivore&&e.suspend);
  const before={...f.me.pool},paid=await f.game.activateAbility(f.me,{card:detritivore,suspend:true});
  receipt={canPay,offered,paid,before,after:{...f.me.pool},zone:detritivore.zone,tapped:wastes.filter(c=>c.tapped).length,metadata:(f.me.poolMeta||[]).map(r=>({color:r.color,n:r.n,restricted:typeof r.restrict==='function',origin:r.oracleManaOriginV86?.name}))};
 };
 await f.game.runTurn();t.diagnostic(JSON.stringify(receipt));assert.ok(receipt);assert.equal(receipt.before.R,1);assert.equal(receipt.before.U,1);assert.equal(receipt.canPay,false);assert.equal(receipt.offered,false);assert.equal(receipt.paid,false);assert.equal(receipt.zone,'hand');assert.equal(receipt.tapped,0);assert.deepEqual(receipt.after,receipt.before);assert.equal(receipt.metadata.length,2);assert.ok(receipt.metadata.every(r=>r.n===1&&r.restricted&&r.origin==='Abstract Paintmage'));assertGameStateInvariants(f.game);
});

test('Actual paid Paintmage first native main trigger pays the permitted native Opt and preserves its other floating mana unit',async t=>{
 const f=fixture();await f.petalCast('Abstract Paintmage');const opt=f.put('Opt','hand');let receipt;
 f.main=async()=>{const before={...f.me.pool};assert.ok(f.game.castableList(f.me).some(e=>e.card===opt));const paid=await f.game.castSpell(f.me,opt,{from:'hand'});await f.settle();receipt={paid,before,after:{...f.me.pool},spent:opt.castMeta?.manaSpent,zone:opt.zone};};
 await f.game.runTurn();t.diagnostic(JSON.stringify(receipt));assert.ok(receipt);assert.equal(receipt.paid,true);assert.equal(receipt.before.U,1);assert.equal(receipt.before.R,1);assert.equal(receipt.spent,1);assert.equal(receipt.after.U,0);assert.equal(receipt.after.R,1);assert.equal(receipt.zone,'graveyard');assertGameStateInvariants(f.game);
});
