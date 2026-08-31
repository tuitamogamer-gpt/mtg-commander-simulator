import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
const text=fs.readFileSync(new URL('./fixtures/oracle-v6-dwynen-deck.txt',import.meta.url),'utf8');

test('Dwynen v6 deck validates 100 cards, persists and rebuilds after reload',()=>{
  const M=loadEngine();M.initData(M.RAW_DATA);
  const imported=M.importCommanderDeck(text,{name:'Dwynen — Oracle 9600'});
  assert.equal(imported.ok,true,JSON.stringify(imported.errors));assert.equal(imported.summary.inputCards,100);assert.equal(imported.interactions.ready,true);
  const newNames=imported.deck.cards.filter(row=>Number(M.CARD_CATALOG[row.name]?.engineBatch?.replace('oracle-',''))>=67);
  assert.ok(newNames.length>=60,'the deck exercises at least sixty new catalog definitions');
  const record=M.createImportedDeckRecord(imported,{id:'deck-dwynen-v6',now:'2026-08-31T18:00:00.000Z'});
  const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};M.upsertGuestImportedDeck(record,{storage});M.initData(M.RAW_DATA);
  const library=M.loadGuestImportedDeckLibrary({storage});assert.equal(library.entries.length,1);assert.equal(library.entries[0].ready,true);
  const checked=M.validateImportedDeckRecord(library.entries[0].record);assert.equal(checked.ok,true);
  const game=new M.Game({seed:960067,paced:false}),p=game.addPlayer('Dwynen',checked.deck,null,false);game.buildDeck(p,checked.deck,M.DEFS,checked.commanders);
  assert.equal(p.library.length,99);assert.equal(p.command.length,1);assert.equal(p.library.filter(c=>c.is('Land')).length,39);
});

for(const seed of [960067,960096])test(`Dwynen v6 four-player game completes with real local AI: ${seed}`,{timeout:180_000},async t=>{
  const M=loadEngine();M.initData(M.RAW_DATA);const imported=M.importCommanderDeck(text,{name:'Dwynen — Oracle 9600',register:true});assert.equal(imported.ok,true,JSON.stringify(imported.errors));
  const game=M.newGame({humanDeck:imported.deck.name,humanCommanders:imported.commanders,aiDecks:['Elven Council','Quick Draw','Coven Counters'],aiStyles:['balanced','aggressive','josh'],difficulty:'normal',seed,maxTurns:240,paced:false});
  const seen=new Set(),decisions=[];const emit=game.emit,note=game.note;
  game.emit=async function(event,data){if(event==='cast'&&data.card)seen.add(data.card.name);return emit.call(this,event,data);};
  game.note=function(kind,data){if(kind==='aiDecision')decisions.push(data.decision);return note.call(this,kind,data);};
  await game.start();assert.equal(game.gameOver,true);assert.ok(game.winner);assert.ok(game.turnNo<game.maxTurns);assert.equal(game.pendingTriggers.length,0);assert.equal(decisions.some(d=>d.fallback),false);
  assert.ok(seen.has('Dwynen, Gilt-Leaf Daen'),'commander is actually cast');
  const newCards=[...seen].filter(name=>Number(M.CARD_CATALOG[name]?.engineBatch?.replace('oracle-',''))>=67);assert.ok(newCards.length>=5);
  t.diagnostic(JSON.stringify({seed,turns:game.turnNo,winner:game.winner.name,decisions:decisions.length,newCards}));
});
