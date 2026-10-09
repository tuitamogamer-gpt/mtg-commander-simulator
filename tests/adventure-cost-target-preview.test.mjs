import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M=loadEngine();
function fixture(){
  const g=M.newGame({humanDeck:'Multiverse Reforged',aiDecks:['Quandrix Unlimited','Enduring Enchantments','Peace Offering'],aiStyles:['balanced','balanced','balanced'],difficulty:'normal',seed:2078951849,paced:true,maxTurns:200});
  g.speedFactor=0;
  const p=g.players.find(p=>p.deckName==='Quandrix Unlimited');
  g.turnPlayer=p;g.turnNo=1;g.phase='main1';
  return {g,p};
}

test('native Elusive Otter Adventure options preview targets without treating the generator as chosen objects',async()=>{
  const {g,p}=fixture(),otter=p.library.find(c=>c.name==='Elusive Otter');
  assert.ok(otter);
  await g.move(otter,'hand');p.pool.G=5;
  const alt={adventure:true,...otter.def.adventure};
  assert.equal(typeof alt.targets,'function');
  const cost=g.spellCost(p,otter,alt);
  assert.equal(cost.generic,0);assert.equal(cost.x,1);
  assert.deepEqual(Array.from(cost.pips,option=>Array.from(option)),[['G']]);
  assert.equal(typeof alt.targets,'function','preview must preserve the original cast metadata');
  assert.doesNotThrow(()=>g.castableList(p));
});

test("Kaervek's Torch surcharge preserves actual target identities and preview choices",()=>{
  const {g,p}=fixture(),opponent=p.opponents(g)[0];
  const spell=name=>{const c=new M.CardInst(M.DEFS[name],opponent);c.zone='stack';return {kind:'spell',name,card:c,ctrl:opponent,castOpts:{},targets:[]};};
  const torch=spell("Kaervek's Torch"),other=spell('Shock');
  g.stack.push(torch,other);
  const counter=new M.CardInst(M.DEFS.Counterspell,p);counter.zone='hand';p.hand.push(counter);
  assert.equal(g.spellCost(p,counter,{targets:[[torch]],from:'hand'}).generic,2);
  assert.equal(g.spellCost(p,counter,{targets:[[torch,torch]],from:'hand'}).generic,2,'one stack identity incurs one surcharge');
  assert.equal(g.spellCost(p,counter,{targets:[[other]],from:'hand'}).generic,0);
  assert.equal(g.spellCost(p,counter,{from:'hand'}).generic,0,'another legal spell avoids the surcharge in preview');
  g.stack.splice(1,1);
  assert.equal(g.spellCost(p,counter,{from:'hand'}).generic,2,'a forced Torch target incurs the surcharge in preview');
});
