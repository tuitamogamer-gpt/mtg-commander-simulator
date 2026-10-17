import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) {
  for (let n = 0; n < 100 && !check(); n++) await tick();
  assert.ok(check(), 'expected resolution checkpoint');
}
function setup({paced = true, humans = 1, hold = false} = {}) {
  const game = new M.Game({seed: 612, paced});
  game.pace = async () => {};
  const questions = [], waiting = [];
  const controller = {decide: async (g, q) => {
    questions.push(q);
    if (q.libraryReveal && hold) return new Promise(resolve => waiting.push({q, resolve}));
    if (q.type === 'chooseOption') return q.options.some(o => o.key === 'no') ? 'no' : q.options[0]?.key;
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'orderTriggers') return q.triggers;
    return null;
  }};
  const players = ['You', 'Raven'].map((name, i) => game.addPlayer(name, {name}, controller, i >= humans));
  game.turnPlayer = players[0]; game.turnNo = 5; game.phase = 'main1';
  const put = (name, player = players[0], zone = 'library') => {
    const card = new M.CardInst(M.DEFS[name], player); card.zone = zone;
    (zone === 'battlefield' ? game.battlefield : player[zone]).push(card);
    game.recalc(); return card;
  };
  const source = put('Thran Dynamo', players[0], 'battlefield');
  const effect = run => {
    game.stack.push({kind: 'ability', name: 'Library effect', ctrl: players[0], srcCard: source,
      targets: [], ctx: {g: game, you: players[0], src: source}, run});
    return game.resolveTop();
  };
  return {game, players, questions, waiting, put, source, effect};
}

test('Cascade gates the first exile, each land/miss/hit, then its cast decision without exposing future cards', async () => {
  const f = setup({hold: true}), {game, players: [you], put, source} = f;
  const hit = put('Sol Ring'), miss = put('Colossal Dreadmaw'), land = put('Forest');
  let done = false;
  const resolution = f.effect(() => game.doCascade(you, source)).then(() => {done = true;});
  await until(() => f.waiting.length === 1);
  let step = f.waiting.shift();
  assert.equal(step.q.revealStage, 'start'); assert.equal(step.q.cards.length, 0);
  assert.equal(step.q.card, undefined); assert.equal(you.library.length, 3); assert.equal(you.exile.length, 0);
  const initial = M.completeOnlineDecision(game, step.q, you, {legal: {}});
  assert.equal(initial.ui.libraryReveal, true); assert.equal(initial.ui.revealStage, 'start');
  assert.doesNotMatch(JSON.stringify(initial), /Sol Ring|Colossal Dreadmaw|Forest/);
  step.resolve(null);
  const expected = [land, miss, hit];
  for (let index = 0; index < expected.length; index++) {
    await until(() => f.waiting.length === 1);
    step = f.waiting.shift();
    assert.equal(step.q.card, expected[index]);
    assert.deepEqual(Array.from(step.q.cards), expected.slice(0, index + 1));
    assert.equal(you.library.length, 2 - index); assert.equal(you.exile.length, index + 1);
    assert.equal(f.questions.filter(q => q.type === 'chooseOption').length, 0);
    assert.equal(done, false);
    const online = M.completeOnlineDecision(game, step.q, you, {legal: {}});
    assert.equal(online.ui.revealStage, 'card');
    for (const future of expected.slice(index + 1)) assert.ok(!JSON.stringify(online).includes(future.name));
    const saved = M.recordSaveDecision(step.q, you, null);
    assert.equal(M.restoreSaveDecision(step.q, you, saved), null);
    step.resolve(null);
  }
  await resolution;
  assert.equal(done, true); assert.equal(you.exile.length, 0); assert.equal(you.library.length, 3);
  assert.equal(f.questions.filter(q => q.libraryReveal).length, 4, 'aggregate reveal must not replay the cards');
  assert.equal(f.questions.filter(q => q.type === 'chooseOption').length, 1);
  assert.equal(f.questions.some(q => q.type === 'priority'), false, 'review does not grant priority during resolution');
});

test('public reveal reviews include controller, other human seats, lands, and duplicate names in order', async () => {
  const f = setup({humans: 2}), {game, players, put} = f;
  const a = put('Island'), b = put('Island', players[1]);
  await f.effect(() => game.revealToHuman({cards: [a, b], ctrl: players[0], kind: 'reveal'}));
  const cards = f.questions.filter(q => q.libraryReveal && q.revealStage === 'card');
  assert.equal(cards.length, 4);
  assert.deepEqual(cards.map(q => q.player), [players[0], players[1], players[0], players[1]]);
  assert.deepEqual(cards.map(q => q.card), [a, a, b, b]);
  assert.deepEqual(Array.from(cards.at(-1).cards), [a, b]);
});

test('reveal-only batches pause before a downstream move, draw, or damage instruction', async () => {
  const f = setup({hold: true}), {game, players: [you, rival], put} = f;
  const first = put('Sol Ring'), second = put('Forest');
  const before = rival.life;
  const resolution = f.effect(async () => {
    await game.revealToHuman({cards: [second, first], ctrl: you, kind: 'reveal', includeLands: true});
    await game.move(first, 'hand'); await game.loseLife(rival, 2);
  });
  for (const expected of [null, second, first]) {
    await until(() => f.waiting.length === 1);
    const step = f.waiting.shift();
    assert.equal(step.q.card || null, expected);
    assert.equal(first.zone, 'library'); assert.equal(rival.life, before);
    step.resolve(null);
  }
  await resolution;
  assert.equal(first.zone, 'hand'); assert.equal(rival.life, before - 2);
});

test('face-down exile, ordinary moves, private looks and simultaneous clash do not enter public sequences', async () => {
  const f = setup({humans: 2}), {game, players: [you, rival], put} = f;
  const hidden = put('Sol Ring'), ordinary = put('Forest'), looked = put('Island');
  await f.effect(async () => {
    await game.move(hidden, 'exile', {revealFromLibrary: true, exileFaceDown: true, exileLookers: [you]});
    await game.revealToHuman({cards: [hidden], ctrl: you, kind: 'reveal'});
    await game.move(ordinary, 'exile');
    await game.revealToHuman({cards: [looked], ctrl: you, kind: 'look', includeLands: true});
    await game.revealToHuman({cards: [looked], ctrl: rival, kind: 'clash', includeLands: true});
  });
  assert.equal(f.questions.some(q => q.libraryReveal), false);
  assert.equal(hidden.faceDown, true);
  const looks = f.questions.filter(q => q.kind === 'look');
  assert.equal(looks.length, 1); assert.equal(looks[0].player, you);
  assert.equal(f.questions.filter(q => q.kind === 'clash').length, 1);
  assert.equal(f.questions.some(q => q.type === 'cardReveal' && q.cards?.includes(hidden)), false);
});

test('public hand reveals retain their ordinary presentation instead of claiming a library action', async () => {
  const f = setup({humans: 2});
  const card = f.put('Sol Ring', f.players[1], 'hand');
  await f.effect(() => f.game.revealToHuman({cards: [card], ctrl: f.players[1], kind: 'reveal'}));
  const questions = f.questions.filter(q => q.type === 'cardReveal');
  assert.equal(questions.length, 1); assert.equal(questions[0].libraryReveal, undefined);
  assert.equal(questions[0].cards[0], card);
});

test('new resolution starts a fresh sequence even when it reveals the same card again', async () => {
  const f = setup(), {game, players: [you], put} = f;
  const top = put('Forest');
  for (let n = 0; n < 2; n++) await f.effect(() => game.revealToHuman({cards: [top], ctrl: you, kind: 'reveal'}));
  assert.equal(f.questions.filter(q => q.revealStage === 'start').length, 2);
  assert.equal(f.questions.filter(q => q.revealStage === 'card').length, 2);
});

for (const options of [{paced: false}, {humans: 0}]) test(`headless/AI resolution stays automatic: ${JSON.stringify(options)}`, async () => {
  const f = setup(options), {game, players: [you], source, put} = f;
  put('Sol Ring'); put('Forest');
  await f.effect(() => game.doCascade(you, source));
  assert.equal(f.questions.some(q => q.libraryReveal), false);
  assert.equal(you.library.length, 2); assert.equal(you.exile.length, 0);
});

test('empty Cascade creates no reveal or cast decision', async () => {
  const f = setup();
  await f.effect(() => f.game.doCascade(f.players[0], f.source));
  assert.equal(f.questions.some(q => q.type === 'cardReveal' || q.type === 'chooseOption'), false);
});
