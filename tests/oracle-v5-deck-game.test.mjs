import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
const text=fs.readFileSync(new URL('./fixtures/oracle-v5-maja-deck.txt',import.meta.url),'utf8');

test('Maja v5 deck is legal, persists, reloads and builds exactly 100 supported cards',()=>{
  const MTG=loadEngine();MTG.initData(MTG.RAW_DATA);
  const imported=MTG.importCommanderDeck(text,{name:'Maja — Oracle 6600 Test'});
  assert.equal(imported.ok,true,JSON.stringify(imported.errors));
  assert.equal(imported.summary.inputCards,100);assert.equal(imported.summary.engineCertified,69);
  assert.equal(imported.interactions.ready,true);assert.deepEqual(Array.from(imported.commanders),['Maja, Bretagard Protector']);
  const record=MTG.createImportedDeckRecord(imported,{id:'deck-maja-v5-test',now:'2026-08-31T12:00:00.000Z'});
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  MTG.upsertGuestImportedDeck(record,{storage});MTG.initData(MTG.RAW_DATA);
  const library=MTG.loadGuestImportedDeckLibrary({storage});assert.equal(library.entries.length,1);assert.equal(library.entries[0].ready,true);
  const checked=MTG.validateImportedDeckRecord(library.entries[0].record);assert.equal(checked.ok,true);
  const game=new MTG.Game({seed:660047,paced:false});const p=game.addPlayer('Maja pilot',checked.deck,null,false);
  game.buildDeck(p,checked.deck,MTG.DEFS,checked.commanders);assert.equal(p.library.length,99);assert.equal(p.command.length,1);
  assert.equal(p.library.filter(c=>c.is('Land')).length,37);
});

for(const seed of [660047,660066])test(`Maja import completes a four-player local AI game: ${seed}`,{timeout:120_000},async t=>{
  const MTG=loadEngine();MTG.initData(MTG.RAW_DATA);
  const imported=MTG.importCommanderDeck(text,{name:'Maja — Oracle 6600 Test',register:true});assert.equal(imported.ok,true);
  const game=MTG.newGame({humanDeck:imported.deck.name,humanCommanders:imported.commanders,
    aiDecks:['Elven Council','Quick Draw','Coven Counters'],aiStyles:['balanced','aggressive','josh'],
    difficulty:'normal',seed,maxTurns:240,paced:false});
  const decisions=[],seen=new Set();const note=game.note;
  game.note=function(kind,data){if(kind==='aiDecision')decisions.push(data.decision);return note.call(this,kind,data);};
  const emit=game.emit;game.emit=async function(event,data){if(event==='cast'&&data.card)seen.add(data.card.name);return emit.call(this,event,data);};
  await game.start();assert.equal(game.gameOver,true);assert.ok(game.winner);assert.ok(game.turnNo<game.maxTurns);
  assert.equal(game.pendingTriggers.length,0);assert.equal(decisions.some(d=>d.fallback),false);
  assert.ok(seen.has('Maja, Bretagard Protector'),'commander was actually cast');
  t.diagnostic(JSON.stringify({seed,turns:game.turnNo,winner:game.winner.name,decisions:decisions.length,newCardsCast:[...seen].filter(name=>Number(MTG.CARD_CATALOG[name]?.engineBatch?.replace('oracle-',''))>=47)}));
});
