// A local Solo view presents each combat damage step with its replay. The
// game holds the step until the replay has played, so no turn runs on behind
// it, and the table's own pauses for that step are skipped. Without a view
// (animation off, a Live host, simulations, instant games) nothing changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
function table({paced = true, speedFactor = 1.5625, enabled = true} = {}) {
  const events = [], paces = [], waits = [];
  const game = new M.Game({seed: 88, paced, onEvent: event => events.push(event)});
  game.speedFactor = speedFactor;
  // Record presentation pauses instead of sleeping through them.
  game.pace = async ms => { paces.push(ms); };
  const decide = async (g, q) => q.type === 'chooseOption' ? q.options[0]?.key
    : q.type === 'chooseCards' ? q.from.slice(0, q.min || 0)
    : q.type === 'chooseTargets' ? q.candidates.slice(0, q.min || 0) : null;
  const a = game.addPlayer('You', {name: 'Your deck'}, {decide}, false);
  const b = game.addPlayer('Defender', {name: 'Their deck'}, {decide}, false);
  game.turnPlayer = a; game.turnNo = 5; game.phase = 'combat'; game.step = 'damage';
  const creature = (owner, name, power, toughness) => {
    const card = new M.CardInst({name, types: ['Creature'], subtypes: [], super: [], colors: [], cost: '', oracle: '',
      power: String(power), toughness: String(toughness), kws: []}, owner);
    card.zone = 'battlefield'; card.sick = false; game.battlefield.push(card); game.recalc();
    return card;
  };
  const attacker = creature(a, 'Raider', 4, 4), blocker = creature(b, 'Guard', 2, 2), runner = creature(a, 'Runner', 3, 3);
  attacker.attacking = b; attacker.blockedBy = [blocker]; attacker.wasBlocked = true; blocker.blocking = attacker.iid;
  runner.attacking = b; runner.blockedBy = []; runner.wasBlocked = false;
  game.combat = {attackers: [attacker, runner]};
  let release;
  game.uiHooks = {combatReplay: {enabled: () => enabled,
    wait: replay => { waits.push(replay); return new Promise(resolve => { release = resolve; }); }}};
  return {game, a, b, blocker, events, paces, waits, release: () => release?.()};
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('the game holds a damage step until its replay has played', async () => {
  const f = table();
  let done = false;
  const step = f.game.combatDamage(f.a, 'normal').then(() => { done = true; });
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(f.waits.length, 1, 'the view was asked to present this step');
  assert.equal(f.waits[0].clashes.length, 2);
  assert.equal(done, false, 'nothing after the step happens while it plays');
  assert.equal(f.b.life, 37, 'damage is already dealt; the replay only shows it');
  assert.equal(f.blocker.zone, 'graveyard');
  assert.deepEqual(f.paces.filter(ms => [700, 600].includes(ms) || ms >= 450 && ms <= 1110), [],
    'the table does not pause separately for a step the replay shows');
  f.release();
  await step;
  assert.equal(done, true);
});

test('with combat animation off, the table keeps its own pauses and nothing waits', async () => {
  const f = table({enabled: false});
  await f.game.combatDamage(f.a, 'normal');
  assert.equal(f.waits.length, 0);
  assert.ok(f.paces.includes(700) && f.paces.includes(600), JSON.stringify(f.paces));
  assert.equal(f.events.filter(event => event.type === 'combatReplay').length, 1, 'Replay last combat stays available');
});

test('unpaced and instant games never wait for a view', async () => {
  for (const options of [{paced: false}, {speedFactor: 0}]) {
    const f = table(options);
    await f.game.combatDamage(f.a, 'normal');
    assert.equal(f.waits.length, 0, JSON.stringify(options));
  }
});

test('a bot thinking ahead never waits for the view', async () => {
  const f = table();
  const sim = M.cloneGameForAISimulation(f.game, 1);
  assert.equal(sim.combatReplayPresents(), false);
  await sim.combatDamage(sim.players[0], 'normal');
  assert.equal(f.waits.length, 0);
});
