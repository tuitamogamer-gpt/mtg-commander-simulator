import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { loadEngine } from './helpers/load-engine.mjs';
import { context, put } from './helpers/oracle-v8-fixtures.mjs';
import { assertGameStateInvariants } from './helpers/game-state-invariants.mjs';

const M = loadEngine();
const UI = { ...M };
runInNewContext(readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8'), {
  MTG: UI,
  document: { readyState: 'loading', addEventListener() {} },
  window: { addEventListener() {} },
});

// Use the real controller's autoAnswer/openReactWindow/pending protocol while
// supplying the same choices a player makes. No combat or priority method is
// mocked: a missing automatic pause therefore cannot activate the Ninja.
function combatFixture({ mode = 'end', zone = 'command', blocked = false, affordable = true,
  manaSources = ['Island', 'Swamp'], suppressionField = false } = {}) {
  const f = context(M, 'human', 3);
  const { game, a, b, others } = f;
  delete game.priorityRound; // context intentionally replaces it for card proofs.
  game.paced = false;
  game.speedFactor = 0;
  const attacker = put(M, game, a, blocked ? 'Grizzly Bears' : 'Changeling Outcast');
  const ninja = put(M, game, a,
    zone === 'command' ? "Yuriko, the Tiger's Shadow" : 'Ninja of the Deep Hours', zone);
  if (zone === 'command') {
    ninja.commander = true;
    ninja.cmdCasts = 3;
    a.commanders.push(ninja);
  }
  const lands = manaSources.slice(0, affordable ? undefined : 1)
    .map(name => put(M, game, a, name));
  for (const land of lands) if (['Secluded Courtyard', 'Unclaimed Territory'].includes(land.name)) {
    land.meta.chosenType = 'Ninja';
  }
  if (suppressionField) put(M, game, b, 'Suppression Field');
  const revealed = put(M, game, a, 'Temporal Trespass', 'library');
  let blocker;
  for (const [index, opponent] of others.entries()) {
    const prior = opponent.controller.decide.bind(opponent.controller);
    if (index === 0 && blocked) blocker = put(M, game, opponent, 'Grizzly Bears');
    opponent.controller = { decide: (g, q) => q.type === 'blockers'
      ? (blocked && opponent === b ? [{ blocker, attacker }] : []) : prior(g, q) };
  }
  const windows = [], questions = [], damage = [];
  const ui = Object.assign(Object.create(UI.UI.prototype), {
    game, me: a, prioMode: mode, manaMode: 'auto', pendings: [],
    activated: false, focusDecisionView() {}, scrollPromptIntoView() {},
    render() {
      if (this.react) {
        windows.push({ step: game.step, question: this.react.q, type: 'reaction' });
        this.takeReactWindow();
        return;
      }
      const pending = this.pending;
      if (!pending) return;
      const q = pending.q;
      questions.push({ step: game.step, q });
      let result;
      if (q.type === 'priority') {
        windows.push({ step: game.step, question: q, type: 'prompt' });
        const entry = q.acts.find(row => row.card === ninja && row.ninjutsu);
        if (entry && game.step === 'blockers' && !this.activated) {
          this.activated = true;
          result = { kind: 'activate', entry };
        } else result = { kind: 'pass' };
      } else if (q.type === 'attackers') result = [{ card: attacker, target: b }];
      else if (q.type === 'chooseCards') result = q.from.slice(0, q.min || 0);
      else if (q.type === 'chooseTargets') result = q.candidates.slice(0, q.min || 0);
      else if (q.type === 'chooseOption') result = q.options.find(row => row.key === 'yes')?.key || q.options[0]?.key;
      else if (q.type === 'orderTriggers') result = q.triggers;
      else if (q.type === 'scry') result = { top: q.cards, bottom: [] };
      else if (q.type === 'chooseX') result = q.min || 0;
      else if (['blockers', 'combatReview'].includes(q.type)) result = [];
      else result = null;
      this.resolvePending(result);
    },
  });
  a.controller = ui.controllerFor(a);
  const emit = game.emit.bind(game);
  game.emit = async (event, data, ...rest) => {
    if (event === 'damageToPlayer' && data.src === ninja) {
      damage.push({ target: data.player, amount: data.n, tapped: ninja.tapped,
        attacking: ninja.attacking, pool: { ...a.pool }, landTaps: lands.map(card => card.tapped) });
    }
    return emit(event, data, ...rest);
  };
  return { ...f, attacker, ninja, lands, revealed, ui, windows, questions, damage };
}

async function play(f) {
  await f.game.combatPhase(f.a);
  assert.equal(f.game.stack.length, 0);
  assert.equal(f.game.pendingTriggers.length, 0);
  assertGameStateInvariants(f.game);
}

for (const mode of ['end', 'off']) {
  test(`${mode}: full unblocked combat pauses for commander ninjutsu and pays UB without commander tax`, async () => {
    const f = combatFixture({ mode });
    await play(f);
    assert.ok(f.windows.some(row => row.step === 'blockers' &&
      row.question.acts.some(entry => entry.card === f.ninja && entry.ninjutsu)),
    'after blockers, an automatic priority stop must offer Yuriko in the command zone');
    assert.equal(f.ui.activated, true);
    assert.equal(f.attacker.zone, 'hand');
    assert.equal(f.ninja.zone, 'battlefield');
    assert.equal(f.ninja.cmdCasts, 3, 'ninjutsu is an activation and does not add a command-zone cast');
    assert.equal(f.damage.length, 1);
    assert.equal(f.damage[0].attacking, f.b, 'the returned attacker keeps its original defender');
    assert.equal(f.damage[0].tapped, true);
    assert.deepEqual(f.damage[0].landTaps, [true, true]);
    assert.equal(Object.values(f.damage[0].pool).reduce((n, value) => n + value, 0), 0);
    assert.equal(f.revealed.zone, 'hand', 'the normal Yuriko combat-damage trigger takes the revealed card');
    assert.equal(f.b.life, 28, 'one commander damage plus the revealed card mana value of eleven');
    for (const opponent of f.others.slice(1)) assert.equal(opponent.life, 29);
    assert.equal(f.b.commanderDamage[f.ninja.iid], 1);
  });
}

test('ACTIONS profile still pauses for hand ninjutsu after blockers', async () => {
  const f = combatFixture({ mode: 'off', zone: 'hand' });
  await play(f);
  assert.ok(f.windows.some(row => row.step === 'blockers' &&
    row.question.acts.some(entry => entry.card === f.ninja && entry.ninjutsu)));
  assert.equal(f.ui.activated, true);
  assert.equal(f.attacker.zone, 'hand');
  assert.equal(f.ninja.zone, 'battlefield');
  assert.equal(f.b.life, 38);
  assert.equal(f.revealed.zone, 'hand', 'Ninja of the Deep Hours resolves its draw trigger normally');
});

for (const scenario of [{ blocked: true }, { affordable: false }]) {
  test(`ACTIONS profile does not invent ninjutsu with ${scenario.blocked ? 'a blocked attacker' : 'insufficient mana'}`, async () => {
    const f = combatFixture({ mode: 'off', ...scenario });
    await play(f);
    assert.equal(f.ui.activated, false);
    assert.equal(f.ninja.zone, 'command');
    assert.equal(f.ninja.cmdCasts, 3);
    assert.equal(f.windows.some(row => row.question.acts.some(entry =>
      entry.card === f.ninja && entry.ninjutsu)), false);
    assert.equal(f.revealed.zone, 'library');
  });
}

test('commander ninjutsu can use Secluded Courtyard mana restricted to Ninja abilities', async () => {
  const f = combatFixture({ manaSources: ['Secluded Courtyard', 'Swamp'] });
  await play(f);
  assert.ok(f.windows.some(row => row.step === 'blockers' &&
    row.question.acts.some(entry => entry.card === f.ninja && entry.ninjutsu)),
  'the affordability check must include the activated ability source for Courtyard');
  assert.equal(f.ui.activated, true);
  assert.equal(f.ninja.zone, 'battlefield');
  assert.equal(f.attacker.zone, 'hand');
  assert.deepEqual(f.damage[0].landTaps, [true, true]);
  assert.equal(f.b.life, 28);
});

for (const scenario of [
  { label: 'Unclaimed Territory creature-spell-only mana', manaSources: ['Unclaimed Territory', 'Swamp'] },
  { label: 'the unpaid Suppression Field ability tax', suppressionField: true },
]) {
  test(`commander ninjutsu is not offered with ${scenario.label}`, async () => {
    const f = combatFixture(scenario);
    await play(f);
    assert.equal(f.questions.some(row => row.q.type === 'priority' &&
      row.q.acts.some(entry => entry.card === f.ninja && entry.ninjutsu)), false);
    assert.equal(f.ui.activated, false);
    assert.equal(f.ninja.zone, 'command');
  });
}
