import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function fixture() {
  const game = new M.Game({seed: 1092026, paced: false});
  game.speedFactor = 0;
  const f = {game, xQuestions: [], chooseX: 0};
  const decide = async (g, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'chooseX') {
      f.xQuestions.push({card: q.card, min: q.min, max: q.max});
      return f.chooseX === 'max' ? q.max : Math.min(q.max, f.chooseX);
    }
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options.find(o => o.key === 'yes')?.key || q.options[0]?.key;
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    return null;
  };
  const me = game.addPlayer('You', {name: 'Native X costs'}, {decide}, false);
  const rival = game.addPlayer('Rival', {name: 'Rival'}, {decide}, false);
  game.turnPlayer = me; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
  const put = (name, zone = 'battlefield', owner = me) => {
    assert.ok(M.DEFS[name], `native definition: ${name}`);
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.ctrl = owner; card.sick = false;
    (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card);
    game.recalc(); return card;
  };
  for (const p of [me, rival]) for (let i = 0; i < 10; i++) put('Forest', 'library', p);
  const chargedPalette = async () => {
    const palette = put("Elementalist's Palette", 'hand');
    const lands = Array.from({length: 3}, () => put('Wastes'));
    assert.equal(await game.castSpell(me, palette, {from: 'hand'}), true);
    assert.ok(lands.every(c => c.tapped));
    for (const name of ['Walking Ballista', 'Hangarback Walker']) {
      const card = put(name, 'hand');
      assert.equal(await game.castSpell(me, card, {from: 'hand', xVal: 0}), true);
      assert.equal(card.zone, 'graveyard', 'native zero-counter creature reaches state-based actions');
    }
    assert.equal(palette.counters.charge, 4, 'two actual X spell casts supply the printed counters');
    f.xQuestions.length = 0;
    return palette;
  };
  const done = () => {
    assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0);
    assertGameStateInvariants(game);
  };
  return Object.assign(f, {me, rival, put, chargedPalette, done});
}

for (const name of ['Arashi, the Sky Asunder', 'Webstrike Elite']) {
  test(`${name}: creature-spell-only mana does not inflate the off-zone X choice`, async () => {
    const f = fixture(), sage = f.put('Somberwald Sage');
    const forests = [f.put('Forest'), f.put('Forest')];
    const card = f.put(name, 'hand');
    const marker = name === 'Webstrike Elite' ? 'cycling' : 'handAbility';
    const entry = f.game.activatableList(f.me).find(e => e.card === card && e[marker]);
    assert.ok(entry);
    assert.equal(await f.game.activateAbility(f.me, entry), true);
    const choices = f.xQuestions.filter(q => q.card === card);
    assert.equal(choices.length, 1);
    assert.equal(choices[0].max, 0, 'only the two ordinary forests can pay this activated ability');
    assert.equal(sage.tapped, false); assert.ok(forests.every(c => c.tapped));
    assert.equal(card.zone, 'graveyard'); f.done();
  });
}

for (const [name, lands, victim] of [
  ['Arashi, the Sky Asunder', ['Forest', 'Forest'], 'Wind Drake'],
  ['Jiwari, the Earth Aflame', ['Mountain', 'Mountain', 'Mountain'], 'Grizzly Bears'],
]) {
  test(`${name}: real Palette counters pay the full Channel X cost and damage effect`, async () => {
    const f = fixture(), palette = await f.chargedPalette();
    const colored = lands.map(n => f.put(n));
    const target = f.put(victim, 'battlefield', f.rival), card = f.put(name, 'hand');
    f.chooseX = 'max';
    const entry = f.game.activatableList(f.me).find(e => e.card === card && e.handAbility);
    assert.ok(entry); assert.equal(await f.game.activateAbility(f.me, entry), true);
    assert.equal(f.xQuestions.find(q => q.card === card).max, 4);
    assert.equal(palette.tapped, true); assert.ok(colored.every(c => c.tapped));
    assert.equal(target.zone, 'graveyard'); assert.equal(card.zone, 'graveyard');
    assert.equal(Object.values(f.me.pool).reduce((n, value) => n + value, 0), 0); f.done();
  });
}

test('Shark Typhoon: Palette mana pays X cycling and creates the correctly sized native Shark', async () => {
  const f = fixture(), palette = await f.chargedPalette();
  const lands = [f.put('Island'), f.put('Forest')], card = f.put('Shark Typhoon', 'hand');
  f.chooseX = 'max';
  const before = f.me.library.length;
  const entry = f.game.activatableList(f.me).find(e => e.card === card && e.cycling);
  assert.ok(entry); assert.equal(await f.game.activateAbility(f.me, entry), true);
  assert.equal(f.xQuestions.find(q => q.card === card).max, 4);
  assert.equal(palette.tapped, true); assert.ok(lands.every(c => c.tapped));
  assert.equal(card.zone, 'graveyard'); assert.equal(f.me.library.length, before - 1);
  const shark = f.game.creatures(f.me).find(c => c.hasSub('Shark'));
  assert.ok(shark); assert.equal(shark.power, 4); assert.equal(shark.toughness, 4);
  assert.equal(shark.kw('flying'), true); f.done();
});

test('Rot-Curse Rakshasa: Palette mana pays an X graveyard activation after choosing a native target', async () => {
  const f = fixture(), palette = await f.chargedPalette();
  const lands = [f.put('Swamp'), f.put('Swamp')];
  const targets = Array.from({length: 4}, () => f.put('Grizzly Bears'));
  const card = f.put('Rot-Curse Rakshasa', 'graveyard');
  f.chooseX = 'max';
  const entry = f.game.activatableList(f.me).find(e => e.card === card && e.gyAbility);
  assert.ok(entry); assert.equal(await f.game.activateAbility(f.me, entry), true);
  assert.equal(palette.tapped, true); assert.ok(lands.every(c => c.tapped));
  assert.equal(f.xQuestions.find(q => q.card === card).max, 4);
  assert.equal(card.zone, 'exile');
  assert.ok(targets.every(target => target.counters.decayed === 1 && target.kw('decayed')));
  assert.equal(Object.values(f.me.pool).reduce((n, value) => n + value, 0), 0); f.done();
});

test('Palette charge mana stays unavailable to ordinary non-X cycling', async () => {
  const f = fixture(), palette = await f.chargedPalette();
  const forest = f.put('Forest'), card = f.put('Krosan Tusker', 'hand');
  assert.equal(f.game.activatableList(f.me).some(e => e.card === card && e.cycling), false,
    'four restricted charge mana cannot cover the printed {2}{G} cycling cost');
  assert.equal(palette.tapped, false); assert.equal(forest.tapped, false);
  const wastes = f.put('Wastes');
  const entry = f.game.activatableList(f.me).find(e => e.card === card && e.cycling);
  assert.ok(entry); assert.equal(await f.game.activateAbility(f.me, entry), true);
  assert.equal(palette.counters.charge, 4);
  assert.ok([palette, forest, wastes].every(c => c.tapped));
  assert.equal(card.zone, 'graveyard'); assert.equal(f.xQuestions.length, 0); f.done();
});
