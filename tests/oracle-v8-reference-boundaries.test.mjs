import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';

test('a revealed creature cannot silently borrow the original source identity or power',()=>{
  for(const name of ['Aspiring Champion','Selected reference boundary']){
    const result=semanticClass({name,layout:'normal',type_line:'Creature — Warrior',mana_cost:'{3}{R}',power:'3',toughness:'3',
      oracle_text:'Menace\nWhen this creature deals combat damage to a player, sacrifice it. If you do, reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield, then shuffle the rest into your library. If that creature is a Demon, it deals damage equal to its power to each opponent.'});
    assert.equal(result.semanticClass,undefined);
    assert.equal(result.reason,'library-selected-reference-needs-binding');
  }
});

const selected='Reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield, then shuffle the rest into your library.';
const probe=(oracle_text,type_line='Creature')=>semanticClass({name:'Selected reference probe',layout:'normal',type_line,mana_cost:'{3}{G}',power:'3',toughness:'3',oracle_text},{compilerVersion:8});

test('selected-card references are rejected inside modal bodies and ordinary trigger continuations',()=>{
  for(const continuation of [
    'If that creature is a Demon, it deals damage equal to its power to each opponent.',
    'Draw a card for each charge counter on it.',
    'That creature gains flying until end of turn.',
    'Put a +1/+1 counter on that creature.',
  ]){
    for(const [type,text]of [['Creature','When this creature enters, '+selected[0].toLowerCase()+selected.slice(1)+' '+continuation],
      ['Sorcery','Choose one —\n• '+selected+' '+continuation+'\n• Draw a card.']]){
      const result=probe(text,type);
      assert.equal(result.semanticClass,undefined,text);assert.equal(result.reason,'library-selected-reference-needs-binding',text);
    }
  }
});

test('explicit source stats after a library operation retain their source binding',()=>{
  const result=probe('When this creature enters, '+selected[0].toLowerCase()+selected.slice(1)+" You gain life equal to this creature's power.");
  assert.ok(result.semanticClass);assert.equal(result.implementation[0].effects.at(-1).n.kind,'explicit-source-stat');
});

test('library references are checked inside attachment and temporary granted abilities',()=>{
  const ability='When this creature attacks, '+selected[0].toLowerCase()+selected.slice(1)+' If that creature is a Demon, it deals damage equal to its power to each opponent.';
  for(const [type,text]of [
    ['Enchantment — Aura',`Enchant creature\nEnchanted creature has "${ability}"`],
    ['Sorcery',`Target creature gains "${ability}" until end of turn.`],
    ['Creature',`{T}: Target creature gains "${ability}" until end of turn.`],
  ]){
    const result=probe(text,type);
    assert.equal(result.semanticClass,undefined,text);assert.equal(result.reason,'library-selected-reference-needs-binding',text);
  }
});
