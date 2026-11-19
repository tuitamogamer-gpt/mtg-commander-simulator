// A mass removal is staged: the engine says what is about to leave, waits for
// the table to play it, then moves the cards. The waits are presentation
// only: an unpaced game (tests, bot simulations, an instant game) passes
// through at once and reaches the same state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();

function fixture({paced = false, speed = 1} = {}) {
  const events = [], waits = [];
  const game = new M.Game({seed: 91177, paced, onEvent: event => events.push(event)});
  const decide = async (_g, q) => q.type === 'priority' ? {kind: 'pass'}
    : q.type === 'chooseOption' ? q.options[0].key
    : q.type === 'chooseTargets' ? q.candidates.slice(0, q.max || 1)
    : q.type === 'orderTriggers' ? q.triggers : [];
  const caster = game.addPlayer('Caster', {name: 'Test deck'}, {decide}, false);
  const opponent = game.addPlayer('Opponent', {name: 'Test deck'}, {decide}, false);
  game.turnPlayer = caster; game.turnNo = 6; game.phase = 'main1'; game.step = 'main';
  game.speedFactor = speed;
  game.priorityRound = async () => {};
  // Record what the engine waits for and what the table shows at that moment,
  // instead of sleeping.
  game.pace = async ms => { waits.push({ms: Math.round(ms), onTable: game.bf().length, events: events.length}); };
  const card = ({owner = caster, toughness = 3, name = 'Wipe fixture', types = ['Creature'], ...rest} = {}) => {
    const c = new M.CardInst({name, cost: '{2}', types, subtypes: [], kws: [], power: 2, toughness, ...rest}, owner);
    c.zone = 'battlefield'; c.sick = false; game.battlefield.push(c); game.recalc(); return c;
  };
  const effects = kind => events.filter(event => event.type === 'gameEffect' && (!kind || event.kind === kind));
  // As a resolving spell names itself to the table.
  const resolving = (name = 'Wrath of God', ctrl = caster) => {
    const source = new M.CardInst({name, cost: '{2}{W}{W}', types: ['Sorcery'], subtypes: [], kws: []}, ctrl);
    source.zone = 'stack';
    game.c1516Resolving = {card: source, ctrl, name};
    return source;
  };
  return {game, caster, opponent, card, events, effects, waits, resolving};
}

test('the beats of a wipe grow with its cards and stay readable at every game speed', () => {
  const three = M.boardWipeTiming(3, 1), twenty = M.boardWipeTiming(20, 1), sixty = M.boardWipeTiming(60, 1);
  for (const timing of [three, twenty, sixty]) {
    assert.deepEqual(Object.keys(timing).sort(), ['build', 'cascade', 'death', 'lead', 'settle', 'stagger']);
    assert.ok(Object.values(timing).every(value => Number.isFinite(value) && value >= 0));
  }
  assert.ok(three.cascade < twenty.cascade, 'more cards take longer');
  assert.equal(twenty.cascade, sixty.cascade, 'a huge board is not played longer than a large one');
  assert.ok(sixty.stagger < twenty.stagger && sixty.stagger > 10, 'its cards follow each other faster');
  assert.ok(three.stagger <= 110, 'three cards do not crawl');
  // The cards span what the cascade says: lead, the last card's turn, its leaving.
  assert.equal(Math.round(twenty.lead + twenty.stagger * 19 + twenty.death), twenty.cascade);
  // Normal is 1.5625, Slow 4.0625, Fast 0.9375 (engine2.js SPEEDS).
  const normal = M.boardWipeTiming(14, 1.5625), slow = M.boardWipeTiming(14, 4.0625), fast = M.boardWipeTiming(14, 0.9375);
  assert.ok(normal.build + normal.cascade > 2500 && normal.build + normal.cascade < 3600, JSON.stringify(normal));
  assert.ok(slow.build + slow.cascade < 2 * (normal.build + normal.cascade), 'Slow is not four times as long');
  assert.ok(fast.build + fast.cascade > 1500, 'Fast still reads');
  assert.deepEqual(M.boardWipeTiming(14, 0), M.boardWipeTiming(14, 1), 'a missing speed is the ordinary one');
});

test('a paced destroy-all waits with the cards on the table, then moves them together', async () => {
  const f = fixture({paced: true, speed: 1.5625});
  const doomed = [f.card(), f.card(), f.card({owner: f.opponent}), f.card({owner: f.opponent}), f.card({owner: f.opponent})];
  const survivor = f.card({kws: ['indestructible']});
  const source = f.resolving();
  await f.game.destroyMany([...doomed, survivor]);

  const [wipe] = f.effects('boardWipe'), [impact] = f.effects('boardWipeImpact'), [resolved] = f.effects('boardWipeResolved');
  assert.equal(f.effects('boardWipe').length, 1);
  assert.equal(wipe.mode, 'destroy'); assert.equal(wipe.count, 5); assert.deepEqual([...wipe.cards], doomed);
  assert.deepEqual(wipe.timing, M.boardWipeTiming(5, 1.5625));
  // What the table says did it: the resolving spell and its controller.
  assert.equal(wipe.name, 'Wrath of God'); assert.equal(wipe.player, f.caster); assert.equal(wipe.src, source);
  assert.equal(wipe.source, null, 'the field bots read stays what the effect passed');
  assert.equal(impact.count, 5); assert.deepEqual(impact.timing, wipe.timing);
  assert.equal(resolved.count, 5); assert.equal(resolved.audioFacts.removedCount, 5);

  // Three waits: the build-up and the cascade with every card still on the
  // battlefield, then the settle with the doomed ones gone.
  assert.equal(f.waits.length, 3);
  const [build, cascade, settle] = f.waits;
  assert.equal(build.onTable, 6); assert.equal(cascade.onTable, 6); assert.equal(settle.onTable, 1);
  // pace() multiplies by the game speed: the engine asks for the real time divided by it.
  assert.equal(build.ms, Math.round(wipe.timing.build / 1.5625));
  assert.equal(cascade.ms, Math.round(wipe.timing.cascade / 1.5625));
  assert.equal(settle.ms, Math.round(wipe.timing.settle / 1.5625));
  // The impact is said between the two waits.
  assert.ok(f.events.indexOf(wipe) < f.events.indexOf(impact) && f.events.indexOf(impact) < f.events.indexOf(resolved));
  assert.equal(build.events, f.events.indexOf(wipe) + 1); assert.equal(cascade.events, f.events.indexOf(impact) + 1);
  assert.equal(f.effects('zoneMove').length, 0, 'no card of the wipe is announced a second time');
  assert.ok(doomed.every(card => card.zone === 'graveyard')); assert.equal(survivor.zone, 'battlefield');
});

test('an unpaced game says the same and does not wait', async () => {
  for (const setup of [{paced: false, speed: 1}, {paced: true, speed: 0}]) {
    const f = fixture(setup);
    const doomed = Array.from({length: 4}, () => f.card());
    await f.game.destroyMany(doomed);
    assert.equal(f.waits.length, 0, JSON.stringify(setup));
    assert.equal(f.effects('boardWipe')[0].timing, null);
    assert.equal(f.effects('boardWipeImpact').length, 0, 'there is no beat to announce');
    assert.equal(f.effects('boardWipeResolved')[0].count, 4);
    assert.ok(doomed.every(card => card.zone === 'graveyard'));
  }
});

test('two removals are not a wipe', async () => {
  const f = fixture({paced: true});
  await f.game.destroyMany([f.card(), f.card()]);
  assert.equal(f.effects('boardWipe').length, 0); assert.equal(f.waits.length, 0);
  assert.equal(f.effects('zoneMove').length, 2, 'each card keeps its own effect');
});

test('exile-all and a mass return are staged in their own kinds', async () => {
  const f = fixture({paced: true});
  const exiled = Array.from({length: 3}, () => f.card({owner: f.opponent}));
  f.resolving('Merciless Eviction');
  await f.game.exileMany(exiled);
  assert.equal(f.effects('boardWipe')[0].mode, 'exile'); assert.equal(f.effects('boardWipe')[0].name, 'Merciless Eviction');
  assert.ok(exiled.every(card => card.zone === 'exile'));

  f.events.length = 0; f.waits.length = 0;
  const returned = [f.card(), f.card({owner: f.opponent}), f.card({owner: f.opponent})];
  f.resolving('Evacuation');
  await f.game.bounceMany(returned);
  const [wipe] = f.effects('boardWipe');
  assert.equal(wipe.mode, 'bounce'); assert.equal(wipe.count, 3); assert.equal(f.waits.length, 3);
  assert.equal(f.effects('zoneMove').length, 0);
  assert.equal(f.effects('boardWipeResolved')[0].count, 3);
  assert.ok(returned.every(card => card.zone === 'hand'));
});

test('a player returning their own cards, or a return with nothing resolving, is not a wipe', async () => {
  const f = fixture({paced: true});
  f.resolving('Own effect');
  await f.game.bounceMany([f.card(), f.card(), f.card()]);
  assert.equal(f.effects('boardWipe').length, 0);
  assert.equal(f.effects('zoneMove').length, 3);

  const g = fixture({paced: true});
  await g.game.bounceMany([g.card({owner: g.opponent}), g.card({owner: g.opponent}), g.card({owner: g.opponent})]);
  assert.equal(g.effects('boardWipe').length, 0, 'a cost or a rules action is not staged');
});

test('creatures that shrink to nothing together die as one staged wipe', async () => {
  const f = fixture({paced: true});
  const victims = [f.card(), f.card({owner: f.opponent}), f.card({owner: f.opponent}), f.card({owner: f.opponent, toughness: 2})];
  const tough = f.card({owner: f.opponent, toughness: 9});
  f.resolving('Toxic Deluge');
  f.game.untilEffects.push({expires: 'eot', apply: () => { for (const card of [...victims, tough]) card.cur.toughness -= 4; }});
  f.game.recalc();
  await f.game.checkSBA();
  const [wipe] = f.effects('boardWipe');
  assert.ok(wipe, 'a toughness wipe was one loose death per card before');
  assert.equal(wipe.mode, 'wither'); assert.equal(wipe.count, 4); assert.equal(wipe.name, 'Toxic Deluge');
  assert.equal(f.effects('zoneMove').length, 0);
  assert.equal(f.waits.length, 3); assert.equal(f.waits[1].onTable, 5, 'they are on the table while it plays');
  assert.equal(f.effects('boardWipeResolved')[0].count, 4);
  assert.ok(victims.every(card => card.zone === 'graveyard')); assert.equal(tough.zone, 'battlefield');
});

test('the same deaths with nothing resolving keep their ordinary effects', async () => {
  const f = fixture({paced: true});
  const victims = [f.card(), f.card(), f.card()];
  f.game.untilEffects.push({expires: 'eot', apply: () => { for (const card of victims) card.cur.toughness -= 4; }});
  f.game.recalc();
  await f.game.checkSBA();
  assert.equal(f.effects('boardWipe').length, 0); assert.equal(f.waits.length, 0);
  assert.equal(f.effects('zoneMove').length, 3);
});

test('shared-source lethal damage is still one damage wipe, now staged', async () => {
  const f = fixture({paced: true});
  const source = f.card(), victims = Array.from({length: 5}, () => f.card({owner: f.opponent, toughness: 1}));
  await f.game.damageBatch(victims.map(target => ({src: source, target, n: 1})));
  const wipes = f.effects('boardWipe');
  assert.equal(wipes.length, 1); assert.equal(wipes[0].mode, 'damage'); assert.equal(wipes[0].count, 5); assert.equal(wipes[0].source, source);
  assert.equal(f.waits.length, 3);
  assert.equal(f.effects('boardWipeResolved')[0].audioFacts.removedCount, 5);
});

// ---------- The sounds of the three beats ----------
const sandbox = {globalThis: null}; sandbox.globalThis = sandbox;
vm.runInNewContext(readFileSync(new URL('../src/modules/game-audio.js', import.meta.url), 'utf8'), sandbox);
const A = sandbox.MTG;
const cues = event => Array.from(A.audioCuesForEvent({type: 'gameEffect', ...event}, {}), cue => cue.id);
// The audio module runs in its own context: its arrays are compared as plain lists.
const played = audio => Array.from(audio.history, row => row.id);
const flush = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));

test('a staged wipe has a sound for each beat; an unstaged one keeps the single burst', () => {
  const timing = M.boardWipeTiming(14, 1.5625);
  assert.deepEqual(cues({kind: 'boardWipe', count: 14, timing}), ['wipe-charge']);
  assert.deepEqual(cues({kind: 'boardWipe', count: 14, timing: null}), ['explosion']);
  assert.deepEqual(cues({kind: 'boardWipe', count: 2, timing}), []);
  assert.deepEqual(cues({kind: 'boardWipeImpact', count: 14, timing}), ['wipe-impact']);
  assert.deepEqual(cues({kind: 'boardWipeImpact', count: 2, timing}), []);
  for (const id of ['wipe-charge', 'wipe-impact', 'wipe-shatter']) {
    const effect = A.SOUND_EFFECTS.find(item => item.id === id);
    assert.ok(effect, id);
    assert.ok(readFileSync(new URL(`../assets/audio/${effect.file}`, import.meta.url)).length > 2000, `${id} is a real file`);
  }
});

test('the cards break one after another at the times the table plays them', () => {
  const timing = M.boardWipeTiming(14, 1.5625);
  const sequence = A.audioSequenceForEvent({type: 'gameEffect', kind: 'boardWipeImpact', count: 14, timing});
  assert.equal(sequence.id, 'wipe-shatter'); assert.equal(sequence.times.length, 14); assert.equal(sequence.rates.length, 14);
  assert.equal(sequence.times[0], timing.lead, 'the first break is the first card');
  assert.equal(sequence.times.at(-1), Math.round(timing.lead + timing.stagger * 13), 'the last break is the last card');
  assert.ok(sequence.times.every((time, index) => !index || time > sequence.times[index - 1]));
  assert.ok(sequence.rates[0] > sequence.rates.at(-1), 'the pitch falls as the board empties');
  assert.ok(sequence.rates.every(rate => rate > .7 && rate < 1.3));
  // A board of sixty is not sixty sounds.
  const many = A.audioSequenceForEvent({type: 'gameEffect', kind: 'boardWipeImpact', count: 60, timing: M.boardWipeTiming(60, 1)});
  assert.equal(many.times.length, 18);
  for (const event of [{kind: 'boardWipe', count: 14, timing}, {kind: 'boardWipeImpact', count: 2, timing},
    {kind: 'boardWipeImpact', count: 14}, {kind: 'boardWipeImpact', count: 14, timing: {lead: 'soon'}}]) {
    assert.equal(A.audioSequenceForEvent({type: 'gameEffect', ...event}), null, JSON.stringify(event));
  }
});

function audioFixture() {
  const sources = [];
  const param = () => ({value: 0, setTargetAtTime(value) { this.value = value; }, setValueAtTime(value) { this.value = value; },
    linearRampToValueAtTime(value) { this.value = value; }, cancelScheduledValues() {}});
  const node = () => ({connect() {}, disconnect() {}, gain: param()});
  class Context {
    state = 'suspended'; currentTime = 10; destination = {};
    createGain() { return node(); }
    createDynamicsCompressor() { return {...node(), ...Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(key => [key, param()]))}; }
    createBufferSource() { return {...node(), playbackRate: param(), start(at) { this.at = at; sources.push(this); }, stop() { this.onended?.(); }}; }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
    async decodeAudioData(data) { return {duration: 1, data}; }
  }
  const env = {AudioContext: Context, performance, setTimeout, clearTimeout,
    document: {hidden: false, addEventListener() {}, removeEventListener() {}},
    localStorage: {getItem() {}, setItem() {}},
    fetch: async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(4)})};
  const audio = new A.GameAudio(env), game = {}; audio.attach(game);
  return {audio, game, sources};
}

test('the breaking cards are one voice of the mixer, scheduled ahead and gone when they end', async () => {
  const f = audioFixture();
  await f.audio.unlock(); await flush(30);
  const timing = M.boardWipeTiming(8, 1);
  f.audio.handle({type: 'gameEffect', kind: 'boardWipe', count: 8, timing}, f.game); await flush();
  assert.deepEqual(played(f.audio), ['wipe-charge']);
  f.sources.length = 0;
  f.audio.handle({type: 'gameEffect', kind: 'boardWipeImpact', count: 8, timing}, f.game); await flush(160);
  const impact = f.sources.filter(source => source.audioCueId === 'wipe-impact');
  const breaks = f.sources.filter(source => !source.audioCueId);
  assert.equal(impact.length, 1);
  // One break per card. A break whose moment passed while the sound was
  // being admitted is skipped, which a slow machine can do to the first ones.
  assert.ok(breaks.length >= 6 && breaks.length <= 8, `one break per card: ${breaks.length}`);
  assert.ok(breaks.every((source, index) => !index || source.at > breaks[index - 1].at), 'each later than the one before');
  assert.ok(breaks[0].at - 10 > (timing.lead - 60) / 1000 && breaks.at(-1).at - 10 < (timing.lead + timing.stagger * 7 + 60) / 1000);
  assert.ok(breaks.every(source => source.playbackRate.value > .7 && source.playbackRate.value < 1.3));
  // The charge is retired by the impact; the breaks count once however many they are.
  assert.equal(f.audio.status().activeEffects, 2);
  assert.deepEqual(played(f.audio).sort(), ['wipe-charge', 'wipe-impact', 'wipe-shatter']);
  assert.equal(f.audio.history.find(row => row.id === 'wipe-shatter').count, breaks.length);
  for (const source of breaks) source.onended();
  assert.equal(f.audio.status().activeEffects, 1, 'the voice leaves with its last break');
});

test('muted, replayed and simulated games stay silent through all three beats', async () => {
  const timing = M.boardWipeTiming(6, 1);
  for (const setup of ['muted', 'replay', 'simulation']) {
    const f = audioFixture();
    await f.audio.unlock(); await flush(30);
    if (setup === 'muted') f.audio.configure({muted: true});
    if (setup === 'simulation') f.game._simulation = true;
    f.sources.length = 0;
    for (const kind of ['boardWipe', 'boardWipeImpact']) f.audio.handle({type: 'gameEffect', kind, count: 6, timing}, f.game, {replay: setup === 'replay'});
    await flush(160);
    assert.equal(f.sources.length, 0, setup);
  }
});
