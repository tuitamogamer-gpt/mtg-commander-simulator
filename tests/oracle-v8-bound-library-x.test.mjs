import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { context, put, settle } from './helpers/oracle-v8-fixtures.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();
const cards = [['0131','Emergent Woodwurm'],['0134','Hatchery Spider']].map(([batch,name]) => {
  const row = JSON.parse(fs.readFileSync(new URL('../reports/oracle-import/batch-'+batch+'.json',import.meta.url))).cards.find(row=>row.raw.name===name);
  return {row, card:{name,oracle_text:row.raw.oracle,type_line:row.catalog.typeLine,mana_cost:row.raw.cost,
    power:row.raw.power,toughness:row.raw.toughness,layout:'normal',keywords:row.catalog.keywords}};
});
test('locally defined library X preserves both historical source descriptors and rejects unknown bindings', () => {
  for (const {row,card} of cards) {
    const compiled = semanticClass(card);
    assert.equal(compiled.semanticClass,row.semanticClass);
    assert.deepEqual(compiled.implementation,row.implementation);
    const invalid = card.oracle_text.replace(/where X is (?:its power|the number of creature cards in your graveyard)/,'where X is the number of dreams you control');
    assert.equal(semanticClass({...card,oracle_text:invalid}).semanticClass,undefined);
  }
});

test('specific library and life/combat observation clauses preserve the full historical descriptor', () => {
  for (const [batch,name] of [['0137','Mystery Key'],['0145','Vampire Scrivener'],['0146','Wilfred Mott']]) {
    const row=JSON.parse(fs.readFileSync(new URL('../reports/oracle-import/batch-'+batch+'.json',import.meta.url))).cards.find(row=>row.raw.name===name);
    assert.ok(row,name);
    const result=semanticClass({name,oracle_text:row.raw.oracle,type_line:row.catalog.typeLine,mana_cost:row.raw.cost,
      power:row.raw.power,toughness:row.raw.toughness,layout:'normal',keywords:row.catalog.keywords});
    assert.equal(result.semanticClass,row.semanticClass,name);
    assert.deepEqual(result.implementation,row.implementation,name);
  }
});

for (const role of ['human','ai']) test(`${role}: Hatchery Spider's paid cast uses its graveyard count and green permanent filter`, async () => {
  const ctx = context(M,role), {game,a} = ctx;
  for (let n=0;n<3;n++) put(M,game,a,'Grizzly Bears','graveyard');
  const spell=put(M,game,a,'Hatchery Spider','hand');
  // The final item in the library is its top. All three inspected cards have
  // a different rules outcome: legal, too expensive, and wrong color.
  const valid=put(M,game,a,'Grizzly Bears','library');
  const tooLarge=put(M,game,a,'Emergent Woodwurm','library');
  const colorless=put(M,game,a,'Sol Ring','library');
  const original=a.controller.decide.bind(a.controller);let offered=false;
  a.controller.decide=async(g,q)=>{
    if(q.type==='chooseCards'&&q.prompt==='Choose a card from the top of your library') {
      offered=true;assert.equal(q.from.includes(valid),true);
      assert.equal(q.from.includes(tooLarge),false);assert.equal(q.from.includes(colorless),false);
      if(role==='human')return [valid];
    }
    return original(g,q);
  };
  a.pool.G=2;a.pool.C=5;
  assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);
  assert.equal(a.pool.G,0);assert.equal(a.pool.C,0);
  await settle(game);
  assert.equal(offered,true);assert.equal(valid.zone,'battlefield');assert.equal(spell.zone,'battlefield');
  assert.equal(tooLarge.zone,'library');assert.equal(colorless.zone,'library');
  assert.equal(a.library.slice(0,2).includes(tooLarge),true);assert.equal(a.library.slice(0,2).includes(colorless),true);
});
