import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function table() {
  const game = new MTG.Game({ seed: 39027, paced: false });
  const decide = async (g, q) => {
    if (q.type === 'chooseOption') return q.options[0]?.key;
    if (q.type === 'chooseCards') return q.from.slice(0, q.max ?? q.min ?? 0);
    if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
    return null;
  };
  const player = game.addPlayer('You', { name: 'Reveals' }, { decide }, false);
  game.addPlayer('Opponent', { name: 'Opponent' }, { decide }, true);
  game.turnPlayer = player; game.turnNo = 4;
  game.priorityRound = async () => {};
  const add = (name, zone) => {
    const def = MTG.DEFS[name] || {
      name, cost: '{1}{G}', super: [], types: ['Creature'], subtypes: ['Elemental'],
      power: '2', toughness: '2', oracle: '', kws: [],
    };
    const card = new MTG.CardInst(def, player);
    card.zone = zone;
    if (zone === 'battlefield') game.battlefield.push(card);
    else player[zone].push(card);
    game.recalc();
    return card;
  };
  return { game, player, add };
}

async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('expected a pending reveal');
}

for (const name of ['Kindred Summons', "Descendants' Fury", "Selvala's Stampede", 'Open the Way']) {
  test(`${name} waits on each public reveal before inspecting the next card or entering permanents`, async () => {
    const { game, player, add } = table();
    const source = new MTG.CardInst(MTG.DEFS[name], player);
    const hit = add(name === 'Open the Way' ? 'Forest' : 'Review Elemental', 'library');
    const first = add(name === 'Open the Way' ? 'Review Spell' : 'Island', 'library');
    let sacrifice;
    if (name === 'Kindred Summons' || name === "Descendants' Fury") sacrifice = add('Starting Elemental', 'battlefield');
    const pending = [];
    game.revealToHuman = payload => payload.kind === 'reveal'
      ? new Promise(resolve => pending.push({ payload, resolve })) : Promise.resolve(null);
    const ctx = { g: game, you: player, src: source, x: 1, data: { cards: [sacrifice] } };
    const script = MTG.SCRIPTS[name];
    let finished = false;
    const resolving = (script.resolve ? script.resolve(ctx) : script.triggers[0].run(ctx)).then(() => { finished = true; });
    await until(() => pending.length === 1);
    assert.deepEqual(Array.from(pending[0].payload.cards), [first]);
    assert.equal(pending[0].payload.ctrl, player);
    assert.equal(pending[0].payload.includeLands, true);
    assert.equal(pending[0].payload.kind, 'reveal');
    assert.equal(player.library.at(-1), first, 'current top remains addressable until review completes');
    assert.deepEqual(Array.from(player.library), [hit, first], 'later cards are untouched');
    assert.equal(game.byIid(first.iid), first);
    assert.equal(hit.zone, 'library');
    assert.equal(finished, false);
    pending[0].resolve();
    await until(() => pending.length === 2);
    assert.deepEqual(Array.from(pending[1].payload.cards), [hit]);
    assert.deepEqual(Array.from(player.library), [hit, first], 'revealed history remains addressable until the complete review');
    assert.equal(game.byIid(first.iid), first);
    assert.equal(game.byIid(hit.iid), hit);
    assert.equal(hit.zone, 'library', 'revealed hit has not entered yet');
    assert.equal(game.battlefield.includes(hit), false);
    pending[1].resolve();
    await resolving;
    assert.equal(hit.zone, 'battlefield');
    assert.equal(first.zone, 'library');
  });
}

for (const name of ["Animist's Awakening", 'Genesis Wave']) {
  test(`${name} waits for the complete reveal review before selecting or moving cards`, async () => {
    const { game, player, add } = table();
    const land = add('Forest', 'library');
    const creature = add('Review Elemental', 'library');
    const source = new MTG.CardInst(MTG.DEFS[name], player);
    if (name === 'Genesis Wave') {
      const decide = player.controller.decide;
      player.controller.decide = async (g, q) => {
        if (q.type === 'chooseCards') for (const card of q.from) {
          assert.equal(g.byIid(card.iid), card, 'followup selection stays addressable in Live play');
        }
        return decide(g, q);
      };
    }
    let review;
    game.revealToHuman = payload => payload.kind === 'reveal'
      ? new Promise(resolve => { review = { payload, resolve }; }) : Promise.resolve(null);
    const resolving = MTG.SCRIPTS[name].resolve({ g: game, you: player, src: source, x: 2 });
    await until(() => review);
    assert.deepEqual(Array.from(review.payload.cards), [creature, land], 'review retains library reveal order');
    assert.equal(land.zone, 'library');
    assert.equal(creature.zone, 'library');
    assert.deepEqual(Array.from(player.library), [land, creature], 'the library is unchanged while review is pending');
    assert.equal(game.battlefield.length, 0);
    review.resolve();
    await resolving;
    assert.equal(land.zone, 'battlefield');
    assert.equal(creature.zone, name === 'Genesis Wave' ? 'battlefield' : 'library');
  });
}

test('Elven Farsight reviews the public card before drawing it', async () => {
  const { game, player, add } = table();
  const creature = add('Review Elemental', 'library');
  const source = new MTG.CardInst(MTG.DEFS['Elven Farsight'], player);
  let review;
  game.revealToHuman = payload => payload.kind === 'reveal'
      ? new Promise(resolve => { review = { payload, resolve }; }) : Promise.resolve(null);
  const resolving = MTG.SCRIPTS['Elven Farsight'].resolve({ g: game, you: player, src: source });
  await until(() => review);
  assert.deepEqual(Array.from(review.payload.cards), [creature]);
  assert.equal(player.hand.length, 0);
  review.resolve();
  await resolving;
  assert.equal(creature.zone, 'hand');
});

test('Cavalier of Thorns shows every card in top-first order before choosing a land or milling', async () => {
  const { game, player, add } = table();
  const land = add('Forest', 'library');
  const creature = add('Review Elemental', 'library');
  const source = new MTG.CardInst(MTG.DEFS['Cavalier of Thorns'], player);
  let review;
  game.revealToHuman = payload => payload.kind === 'reveal'
      ? new Promise(resolve => { review = { payload, resolve }; }) : Promise.resolve(null);
  const resolving = MTG.SCRIPTS['Cavalier of Thorns'].triggers[0].run({ g: game, you: player, src: source });
  await until(() => review);
  assert.deepEqual(Array.from(review.payload.cards), [creature, land]);
  assert.equal(player.graveyard.length, 0);
  assert.equal(land.zone, 'library');
  review.resolve();
  await resolving;
  assert.equal(land.zone, 'battlefield');
  assert.equal(creature.zone, 'graveyard');
});

test('Gandalf reviews each opponent top card before revealing the next or drawing', async () => {
  const { game, player, add } = table();
  const firstOpponent = game.players[1];
  const secondOpponent = game.addPlayer('Second opponent', { name: 'Second' }, firstOpponent.controller, true);
  const tops = [firstOpponent, secondOpponent].map((owner, index) => {
    const card = new MTG.CardInst(MTG.DEFS[index ? 'Mountain' : 'Island'], owner);
    card.zone = 'library'; owner.library.push(card); return card;
  });
  add('Forest', 'library');
  const spell = add('Review Elemental', 'hand');
  const source = new MTG.CardInst(MTG.DEFS['Gandalf, Westward Voyager'], player);
  const pending = [];
  game.revealToHuman = payload => payload.kind === 'reveal'
      ? new Promise(resolve => pending.push({ payload, resolve })) : Promise.resolve(null);
  const resolving = MTG.SCRIPTS['Gandalf, Westward Voyager'].triggers[0].run({
    g: game, you: player, src: source, data: { card: spell },
  });
  await until(() => pending.length === 1);
  assert.deepEqual(Array.from(pending[0].payload.cards), [tops[0]]);
  assert.equal(game.log.some(entry => entry.msg.includes(tops[1].name)), false);
  assert.equal(player.hand.length, 1);
  pending[0].resolve();
  await until(() => pending.length === 2);
  assert.deepEqual(Array.from(pending[1].payload.cards), [tops[1]]);
  assert.equal(player.hand.length, 1);
  pending[1].resolve();
  await resolving;
  assert.equal(player.hand.length, 2);
});
