import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {extractRawData, readSource} from './source-audit.mjs';

export const sourceDir=fileURLToPath(new URL('../reports/decks/precon-candidates-2026-10-27',import.meta.url));
export function buildIntake(M=loadEngine()) {
  const source=JSON.parse(fs.readFileSync(sourceDir+'/sources.json'));
  const oracle=JSON.parse(fs.readFileSync(sourceDir+'/oracle.json'));
  const cards=source.decks.find(d=>d.slug==='odd').cards;
  const names=new Map();
  const normalize=n=>{if(!names.has(n))names.set(n,M.resolveDeckCardName(n)||n);return names.get(n);};
  const counts=rows=>{const map=new Map();for(const c of rows){const name=normalize(c.name);map.set(name,(map.get(name)||0)+c.n);}return [...map].sort(([a],[b])=>a.localeCompare(b));};
  const text=fs.readFileSync(sourceDir+'/odds-and-ends.txt','utf8');
  const parsed=M.parseDeckText(text);
  assert.deepEqual(counts(cards),counts(source.official.find(d=>d.slug==='odd').cards),'Wizards/Moxfield lists must match');
  assert.deepEqual(counts(cards),counts(source.mtgjson.cards),'MTGJSON/Moxfield lists must match');
  assert.deepEqual(counts(cards),counts(parsed.cards),'Pinned text export must preserve every card and quantity');
  assert.equal(cards.reduce((sum,c)=>sum+c.n,0),100);
  assert.deepEqual(Array.from(parsed.commanders),['Yennett, Cryptic Sovereign']);
  const validation=M.validateImportedDeck(parsed,{name:'Odds and Ends'});
  assert.equal(validation.ok,true,JSON.stringify(validation.errors));
  for(const entry of cards) {
    const name=normalize(entry.name),record=oracle.cards.find(c=>normalize(c.name)===name),catalog=M.CARD_CATALOG[name];
    assert.ok(record,'Pinned Oracle missing: '+entry.name);
    assert.equal(record.legalities.commander,'legal',entry.name);
    assert.equal(catalog.deckImportEligible,true,name);
    if(catalog.oracleId)assert.equal(catalog.oracleId,record.oracle_id,'Oracle identity: '+name);
  }
  const deck={name:'Odds and Ends',set:'SLD',commander:'Yennett, Cryptic Sovereign',cards:validation.draftDeck.cards.map(c=>({name:c.name,n:c.n,sec:c.name==='Yennett, Cryptic Sovereign'?'Commander':['Creature','Planeswalker','Instant','Sorcery','Artifact','Enchantment','Land'].find(type=>M.DEFS[c.name].types.includes(type))}))};
  assert.ok(deck.cards.every(c=>c.sec),'Every card requires its existing deck-selector section');
  return {deck,validation,counts};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const M=loadEngine(),{deck,validation,counts}=buildIntake(M),raw=extractRawData(readSource());
  const equivalent=raw.decks.filter(d=>JSON.stringify(counts(d.cards))===JSON.stringify(counts(deck.cards)));
  const existing=raw.decks.find(d=>d.name===deck.name);
  if(existing)assert.deepEqual(JSON.parse(JSON.stringify(existing)),JSON.parse(JSON.stringify(deck)),'Do not overwrite a different existing list');
  assert.ok(equivalent.every(d=>d.name===deck.name),'This list is already registered under another name');
  if(process.argv.includes('--write')&&!existing){
    raw.decks.push(deck);
    fs.writeFileSync(new URL('../src/data.js',import.meta.url),"'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});\nMTG.RAW_DATA = "+JSON.stringify(raw)+';\n');
  }
  console.log(JSON.stringify({name:deck.name,alreadyPresent:!!existing,write:process.argv.includes('--write'),newCardDefinitions:0,summary:validation.summary,warnings:validation.warnings},null,2));
}
