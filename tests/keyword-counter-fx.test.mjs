import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pod(decide = null) {
  const events = [];
  const game = new MTG.Game({ seed: 8282602, paced: false, maxTurns: 10, onEvent: event => events.push(event) });
  const players = ['First', 'Second'].map((name, index) => {
    const player = game.addPlayer(name, { name: `${name} test` }, null, index > 0);
    player.controller = { decide: async (g, q) => decide ? decide(g, q) : q.candidates?.slice(0, q.min || 0) || q.options?.[0]?.key || null };
    return player;
  });
  game.turnPlayer = players[0]; game.phase = 'main1'; game.step = 'main';
  return { game, players, events };
}

function permanent(game, player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player; card.zone = 'battlefield'; card.sick = false;
  game.battlefield.push(card); game.recalc();
  return card;
}

test('requested keyword visual map keeps every effect distinct', () => {
  assert.deepEqual(Object.keys(MTG.KEYWORD_VISUALS).sort(),
    ['double strike', 'first strike', 'hexproof', 'indestructible', 'shroud']);
  assert.equal(new Set(Object.values(MTG.KEYWORD_VISUALS).map(entry => entry.icon)).size, 5);
});

test('central counter helper moves a real spell and emits the counterspell visual event', async () => {
  const { game, players: [caster, counterer], events } = pod();
  const spell = new MTG.CardInst(MTG.DEFS['Swords to Plowshares'], caster);
  spell.ctrl = caster; spell.zone = 'stack'; caster.hand = caster.hand.filter(card => card !== spell);
  const so = { kind: 'spell', name: spell.name, card: spell, ctrl: caster, targets: [], targetSpecs: [] };
  game.stack.push(so);
  const source = permanent(game, counterer, 'Stormcatch Mentor');

  assert.equal(await game.counterStackObject(so, { source }), true);
  assert.equal(spell.zone, 'graveyard');
  const event = events.find(entry => entry.type === 'gameEffect' && entry.kind === 'counterspell');
  assert.equal(event.card, spell); assert.equal(event.source, source);
});

test('indestructible prevention and minus counters emit their exact visual events', async () => {
  const { game, players: [first], events } = pod();
  const reactor = permanent(game, first, 'Darksteel Reactor');
  const creature = permanent(game, first, 'Academy Manufactor');
  events.splice(0);

  assert.equal(await game.destroy(reactor), false);
  await game.addM1(creature, 1, first);
  assert.ok(events.some(event => event.type === 'gameEffect' && event.kind === 'keyword' && event.keyword === 'indestructible' && event.state === 'prevented'));
  assert.ok(events.some(event => event.type === 'gameEffect' && event.kind === 'counterChange' && event.counterKind === '-1/-1' && event.amount === 1));
});

test('legacy hexproof and shroud flags synchronize into keywords and gained-keyword FX', () => {
  const { game, players: [first], events } = pod();
  const hex = permanent(game, first, 'Academy Manufactor');
  const veil = permanent(game, first, 'Stormcatch Mentor');
  events.splice(0);
  game.untilEffects.push({ expires: 'eot', apply: () => { hex.cur.hexproof = true; veil.cur.shroud = true; } });
  game.recalc();
  assert.equal(hex.kw('hexproof'), true); assert.equal(veil.kw('shroud'), true);
  assert.ok(events.some(event => event.type === 'gameEffect' && event.kind === 'keyword' && event.keyword === 'hexproof'));
  assert.ok(events.some(event => event.type === 'gameEffect' && event.kind === 'keyword' && event.keyword === 'shroud'));
});

test('first and double strike FX come from their actual combat-damage steps', async () => {
  const { game, players: [first, second], events } = pod();
  const make = (name, keyword) => {
    const card = new MTG.CardInst({
      name, cost: '{1}', super: [], types: ['Creature'], subtypes: ['Knight'],
      kws: [keyword], power: '2', toughness: '2', oracle: keyword,
    }, first);
    card.ctrl = first; card.zone = 'battlefield'; card.sick = false;
    card.attacking = second; card.blockedBy = []; card.wasBlocked = false;
    game.battlefield.push(card); return card;
  };
  const firstStrike = make('Single Blade', 'first strike');
  const doubleStrike = make('Twin Blade', 'double strike');
  game.recalc(); game.combat = { attackers: [firstStrike, doubleStrike] };
  events.splice(0);

  await game.combatDamage(first, 'first');
  await game.combatDamage(first, 'normal');
  assert.equal(second.life, 34, 'first strike deals once and double strike deals in both steps');
  assert.ok(events.some(event => event.type === 'gameEffect' && event.kind === 'combatStrike' && event.mode === 'firstStrike'));
  assert.ok(events.some(event => event.type === 'gameEffect' && event.kind === 'combatStrike' && event.mode === 'doubleStrike'));
});

test('proliferate event lists each chosen object and every counter kind it expands', async () => {
  let reactor;
  const { game, players: [first, second], events } = pod((g, q) => q.spec?.what === 'proliferate' ? [reactor, second] : []);
  reactor = permanent(game, first, 'Darksteel Reactor');
  reactor.counters.charge = 2; reactor.counters.vow = 1; second.poison = 3; game.recalc();
  events.splice(0);
  await MTG.E.proliferate(game, first);
  const event = events.find(entry => entry.type === 'gameEffect' && entry.kind === 'proliferate');
  assert.equal(event.count, 2);
  assert.deepEqual(new Set(event.additions.find(entry => entry.target === reactor).kinds), new Set(['charge', 'vow']));
  assert.deepEqual(Array.from(event.additions.find(entry => entry.target === second).kinds), ['poison']);
});

test('UI copy distinguishes proliferate choice from targeting and reviews multi-select confirmations', () => {
  const ui = fs.readFileSync(path.join(root, 'src/modules/ui.js'), 'utf8');
  assert.match(ui, /This is a choice, not targeting — hexproof, shroud and ward do not apply/);
  assert.match(ui, /Confirm proliferate with no selections/);
  assert.match(ui, /class="m1counter"/);
  assert.match(ui, /el\('div', 'selectionreview'/);
  for (const kind of ['counterspell', 'keyword', 'counterChange', 'combatStrike', 'proliferate']) {
    assert.match(ui, new RegExp(`event\\.kind === '${kind}'`));
  }
});
