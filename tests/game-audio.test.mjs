import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadEngine } from './helpers/load-engine.mjs';

const sandbox = { globalThis: null }; sandbox.globalThis = sandbox;
vm.runInNewContext(readFileSync(new URL('../src/modules/game-audio.js', import.meta.url), 'utf8'), sandbox);
const U = sandbox.MTG;
const cues = event => Array.from(U.audioCuesForEvent(event), item => item.id);
const flush = () => new Promise(resolve => setTimeout(resolve, 65));

function audioFixture() {
  const events = new Map(), downloads = [], sources = [], saved = new Map();
  const param = () => ({ value: 0, setTargetAtTime(value) { this.value = value; },
    setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime(value) { this.value = value; }, cancelScheduledValues() {} });
  const node = () => ({ connect() {}, disconnect() {}, gain: param() });
  class Context {
    state = 'suspended'; currentTime = 0; destination = {};
    createGain() { return node(); }
    createDynamicsCompressor() { return { ...node(), ...Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key => [key, param()])) }; }
    createBufferSource() {
      const source = { ...node(), playbackRate: param(), start() { sources.push(this); }, stop() { this.onended?.(); } };
      return source;
    }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
    async decodeAudioData(data) { return { duration: 88, data }; }
  }
  const env = { AudioContext: Context, performance, setTimeout, clearTimeout,
    document: { hidden: false, addEventListener(type, fn) { events.set(type, fn); }, removeEventListener(type) { events.delete(type); } },
    localStorage: { getItem(key) { return saved.get(key); }, setItem(key, value) { saved.set(key, value); } },
    fetch: async url => { downloads.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }; },
  };
  const audio = new U.GameAudio(env), game = {}; audio.attach(game);
  return { audio, game, env, sources, downloads, events, saved };
}

test('audio preferences validate corrupt storage and clamp independent levels', () => {
  const p = U.normalizeAudioPreferences({ track: '../secret', music: -5, effects: Infinity, muted: 'true' });
  assert.equal(p.track, 'moonlit-grove'); assert.equal(p.music, 0); assert.equal(p.effects, 38); assert.equal(p.muted, false);
  assert.equal(U.normalizeAudioPreferences({ music: 500 }).music, 100);
});
test('only public milestones produce effects; routine cards and outcomes stay silent', () => {
  const effect = props => cues({ type: 'gameEffect', ...props });
  assert.deepEqual(cues({ type: 'cardPlayed', kind: 'land' }), []);
  assert.deepEqual(cues({ type: 'cardPlayed', kind: 'spell' }), []);
  assert.deepEqual(cues({ type: 'combat', kind: 'attackersDeclared', count: 10 }), []);
  assert.deepEqual(cues({ type: 'effectNotice', kind: 'spellCopy' }), []);
  assert.deepEqual(effect({ kind: 'damage', amount: 0 }), []);
  assert.deepEqual(effect({ kind: 'damage', amount: 9, combat: true }), []);
  assert.deepEqual(effect({ kind: 'damage', amount: 10, combat: true }), ['heavy-impact']);
  assert.deepEqual(effect({ kind: 'damage', amount: 5, source: { colors: ['R'] } }), []);
  const hidden = { faceDown: true, get colors() { throw new Error('Hidden identity read'); }, get cur() { throw new Error('Hidden identity read'); } };
  assert.deepEqual(effect({ kind: 'damage', amount: 5, source: hidden }), []);
  assert.deepEqual(effect({ kind: 'damage', amount: 10, source: hidden }), ['explosion']);
  assert.deepEqual(cues({ type: 'battlefieldArrival', kind: 'powerhouse', card: hidden }), []);
  assert.deepEqual(cues({ type: 'battlefieldArrival', card: {} }), []);
  for (const kind of ['commander', 'powerhouse']) assert.deepEqual(cues({ type: 'battlefieldArrival', kind, card: {} }), ['summon']);
  assert.deepEqual(effect({ kind: 'boardWipe', count: 2 }), []);
  assert.deepEqual(effect({ kind: 'boardWipe', count: 3 }), ['explosion']);
  assert.deepEqual(cues({ type: 'gameover' }), ['victory']);
  assert.deepEqual(effect({ kind: 'damagePrevented', amount: 15 }), []);
  assert.deepEqual(effect({ kind: 'counterspell' }), []);
  assert.deepEqual(effect({ kind: 'zoneMove', fromZone: 'battlefield', toZone: 'graveyard' }), []);
  assert.deepEqual(effect({ kind: 'zoneMove', fromZone: 'battlefield', toZone: 'exile' }), []);
});
test('browser interaction unlocks lazy audio, levels persist, mute stops voices and replay stays quiet', async () => {
  const f = audioFixture(); assert.equal(f.downloads.length, 0);
  f.audio.handle({ type: 'gameover' }, f.game); await flush(); assert.equal(f.sources.length, 0);
  await f.audio.unlock(); await flush();
  assert.equal(f.audio.status().state, 'playing'); assert.equal(f.audio.musicVoices.size, 1);
  assert.equal(f.downloads.filter(url => url.includes('/music/')).length, 1);
  f.audio.handle({ type: 'gameover' }, f.game, { replay: true });
  f.audio.handle({ type: 'gameover' }, {});
  f.audio.handle({ type: 'cardPlayed' }, f.game); await flush(); assert.equal(f.audio.history.length, 0);
  f.audio.handle({ type: 'gameover' }, f.game); await flush(); assert.equal(f.audio.history.at(-1).id, 'victory');
  f.audio.configure({ music: 0, effects: 63 }); await flush();
  assert.equal(f.audio.effectsBus.gain.value, .63); assert.equal(f.audio.musicBus.gain.value, 0);
  f.audio.configure({ muted: true }); assert.equal(f.audio.voices.size, 0);
  f.audio.handle({ type: 'gameover' }, f.game); await flush(); assert.equal(f.audio.history.length, 1);
  assert.equal(JSON.parse(f.saved.get('mtgAudioPreferences')).muted, true);
  f.audio.dispose(); assert.equal(f.events.size, 0);
});
test('rapid track switches discard stale downloads and keep only the latest music buffer', async () => {
  const f = audioFixture(), requests = new Map();
  f.env.fetch = url => url.includes('/music/') ? new Promise(resolve => requests.set(url, resolve))
    : Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
  await f.audio.unlock();
  f.audio.configure({ track: 'astral-library' }); f.audio.configure({ track: 'ember-sanctum' });
  const respond = id => requests.get('./assets/audio/music/' + id + '.mp3')({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
  respond('ember-sanctum'); await flush(); respond('moonlit-grove'); respond('astral-library'); await flush();
  assert.equal(f.audio.musicId, 'ember-sanctum'); assert.equal(f.audio.musicVoices.size, 1);
  assert.equal([...f.audio.cache.keys()].filter(key => key.startsWith('music/')).length, 1);
  f.audio.dispose();
});
test('simultaneous explosion suppresses the damage/death pile-up and hidden tabs discard effects', async () => {
  const f = audioFixture(); await f.audio.unlock(); await flush();
  for (let n = 0; n < 30; n++) {
    f.audio.handle({ type: 'gameEffect', kind: 'damage', amount: 10, combat: true }, f.game);
    f.audio.handle({ type: 'gameEffect', kind: 'zoneMove', fromZone: 'battlefield', toZone: 'graveyard' }, f.game);
  }
  f.audio.handle({ type: 'gameEffect', kind: 'boardWipe', count: 30 }, f.game); await flush();
  assert.deepEqual(Array.from(f.audio.history, item => item.id), ['explosion']);
  f.env.document.hidden = true; f.events.get('visibilitychange')(); await flush();
  assert.equal(f.audio.context.state, 'suspended'); assert.equal(f.audio.voices.size, 0);
  f.audio.handle({ type: 'gameover' }, f.game); await flush(); assert.equal(f.audio.history.length, 1);
  f.env.document.hidden = false; f.events.get('visibilitychange')(); await flush(); assert.equal(f.audio.context.state, 'running');
  f.audio.dispose();
});
test('failed assets and blocked storage do not interrupt the game; user can retry a track', async () => {
  const f = audioFixture(); f.env.fetch = async () => ({ ok: false });
  f.env.localStorage.setItem = () => { throw new Error('blocked'); };
  assert.equal(f.audio.configure({ music: 25 }), false);
  await f.audio.unlock(); await flush(); assert.equal(f.audio.state, 'error');
  f.env.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
  f.audio.configure({ track: 'moonlit-grove' }); await flush(); assert.equal(f.audio.state, 'playing');
  f.audio.dispose();
});
test('a major effect retires a quieter tail when the voice limit is full', async () => {
  const f = audioFixture(); await f.audio.unlock(); await flush();
  for (let n = 0; n < 5; n++) await f.audio.play({ id: 'heavy-impact', priority: 1 });
  assert.equal(f.audio.voices.size, 5);
  await f.audio.play({ id: 'explosion', priority: 4 });
  assert.equal(f.audio.voices.size, 5);
  assert.equal(f.audio.history.at(-1).id, 'explosion');
  f.audio.dispose();
});

test('paid human and local-AI actions keep routine plays and prevented damage silent', async () => {
  const M = loadEngine();
  for (const ai of [false, true]) {
    const events = [];
    const game = new M.Game({ seed: 9077, paced: false, onEvent: event => events.push(event) });
    const pass = { decide: async (_g, q) => q.type === 'priority' ? { kind: 'pass' } : q.type === 'chooseOption' ? q.options[0].key : [] };
    const player = game.addPlayer('Caster', { name: 'Elven Council' }, pass, ai);
    const opponent = game.addPlayer('Opponent', { name: 'Quick Draw' }, pass, false);
    if (ai) player.controller = new M.AIController(player, { difficulty: 'hard' });
    game.turnPlayer = player; game.turnNo = 5; game.phase = 'main1'; game.step = 'main';
    const card = new M.CardInst(M.DEFS['Colossal Dreadmaw'], player); card.zone = 'hand'; player.hand.push(card);
    assert.equal(await game.castSpell(player, card, { from: 'hand' }), false);
    assert.equal(events.filter(event => event.type === 'cardPlayed').length, 0);
    player.pool.G = 6;
    if (ai) await game.mainPhase(player);
    else { assert.equal(await game.castSpell(player, card, { from: 'hand' }), true); await game.priorityRound(player); }
    assert.equal(card.zone, 'battlefield'); assert.equal(player.pool.G, 0);
    assert.equal(events.filter(event => event.type === 'cardPlayed' && event.kind === 'spell').length, 1);
    assert.ok(events.some(event => event.type === 'battlefieldArrival'));
    const land = new M.CardInst(M.DEFS.Forest, player); land.zone = 'hand'; player.hand.push(land);
    assert.equal(await game.playLand(player, land), true);
    assert.equal(events.filter(event => event.type === 'cardPlayed' && event.kind === 'land').length, 1);
    assert.ok(events.filter(event => event.type === 'cardPlayed').every(event => cues(event).length === 0));
    events.length = 0;
    await game.damageAny(card, opponent, 6, { combat: true });
    assert.equal(opponent.life, 34);
    assert.ok(events.every(event => cues(event).length === 0));
    events.length = 0;
    game.untilEffects.push({ kind: 'preventAllCombat' });
    await game.damageAny(card, opponent, 6, { combat: true });
    assert.equal(opponent.life, 34);
    assert.ok(events.every(event => cues(event).length === 0));
    events.length = 0;
    game.untilEffects = game.untilEffects.filter(effect => effect.kind !== 'preventAllCombat');
    await game.damageAny(card, opponent, 10, { combat: true });
    assert.equal(opponent.life, 24);
    assert.ok(events.some(event => cues(event).includes('heavy-impact')));
  }
});
