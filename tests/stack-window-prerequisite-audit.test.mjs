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
  MTG: UI, document: { readyState: 'loading', addEventListener() {} },
  window: { addEventListener() {} },
});

function fixture() {
  const f = context(M, 'human', 3);
  const { game, a, b } = f;
  delete game.priorityRound;
  game.speedFactor = 0;
  const ui = Object.assign(Object.create(UI.UI.prototype), {
    game, me: a, prioMode: 'end', manaMode: 'auto', pendings: [],
    ready: false, activations: 0, offers: [],
    focusDecisionView() {}, scrollPromptIntoView() {},
    render() {
      if (this.react) { this.takeReactWindow(); return; }
      if (!this.pending) return;
      const q = this.pending.q;
      let answer;
      if (q.type === 'priority') {
        const entry = q.acts.find(row => row.card === this.source && !row.manaAbility);
        if (this.ready) this.offers.push(!!entry);
        if (this.ready && !this.activations && entry) {
          this.activations++;
          answer = { kind: 'activate', entry };
        } else answer = { kind: 'pass' };
      } else if (q.type === 'chooseTargets') {
        const preferred = game.stack.find(object => object.card === this.spell) || b;
        answer = q.candidates.includes(preferred) ? [preferred] : q.candidates.slice(0, q.min || 0);
      } else if (q.type === 'chooseCards') {
        answer = this.linkedMatch && q.from.includes(this.linkedMatch)
          ? [this.linkedMatch] : q.from.slice(0, q.min || 0);
      } else if (q.type === 'chooseOption') answer = q.options.find(option => option.key === 'yes')?.key || q.options[0]?.key;
      else if (q.type === 'orderTriggers') answer = q.triggers;
      else if (q.type === 'chooseX') answer = q.min || 0;
      else answer = null;
      this.resolvePending(answer);
    },
  });
  a.controller = ui.controllerFor(a);
  return { ...f, ui };
}

for (const name of ['Lightning Bolt', 'Grizzly Bears', 'Sol Ring']) {
  test(`native Jester's Scepter acquires its paid linked card and exposes the response to ${name}`, async () => {
    const { game, a, b, ui } = fixture();
    const lands = Array.from({ length: 5 }, () => put(M, game, a, 'Forest'));
    const linkedMatch = put(M, game, b, name, 'library');
    for (let i = 0; i < 4; i++) put(M, game, b, 'Island', 'library');
    const source = put(M, game, a, "Jester's Scepter", 'hand');
    ui.source = source;
    ui.linkedMatch = linkedMatch;
    assert.equal(await game.castSpell(a, source, { from: 'hand' }), true);
    assert.equal(source.zone, 'battlefield');
    assert.equal(lands.filter(card => card.tapped).length, 3, 'the source was really cast for three mana');
    const linked = M.OracleV25Permanents.linked(game, source, 'permanent-linked-v25');
    assert.equal(linked.length, 5);
    assert.ok(linked.includes(linkedMatch));
    assert.ok(linked.every(card => card.faceDown), 'ETB created actual face-down linked exiles');
    const payment = name === 'Lightning Bolt' ? ['Mountain'] : name === 'Grizzly Bears' ? ['Forest', 'Forest'] : ['Forest'];
    for (const land of payment) put(M, game, b, land);
    const spell = put(M, game, b, name, 'hand');
    ui.spell = spell;
    ui.ready = true;
    game.turnPlayer = b;
    assert.equal(await game.castSpell(b, spell, { from: 'hand', quickTargets: name === 'Lightning Bolt' ? [a] : undefined }), true);
    assert.ok(ui.offers.includes(true), 'the legal activation reaches the production UI controller');
    assert.equal(ui.activations, 1);
    assert.equal(linkedMatch.zone, 'graveyard', 'the exact linked-name card is paid');
    assert.equal(spell.zone, 'graveyard', 'the matching spell is countered');
    assert.equal(a.life, 40);
    assert.equal(source.tapped, true);
    assert.equal(lands.filter(card => card.tapped).length, 5, 'the activation pays its additional two mana');
    assert.equal(M.OracleV25Permanents.linked(game, source, 'permanent-linked-v25').length, 4);
    assertGameStateInvariants(game, name);
  });
}

for (const name of ['Grizzly Bears', 'Sol Ring']) {
  test(`native hand-cast Myojin earns its counter and exposes the own ${name} copy response`, async () => {
    const { game, a, ui } = fixture();
    const lands = Array.from({ length: 8 }, () => put(M, game, a, 'Island'));
    const extra = Array.from({ length: name === 'Grizzly Bears' ? 2 : 1 }, () => put(M, game, a, 'Forest'));
    const source = put(M, game, a, 'Myojin of Cryptic Dreams', 'hand');
    ui.source = source;
    assert.equal(await game.castSpell(a, source, { from: 'hand' }), true);
    assert.equal(source.zone, 'battlefield');
    assert.equal(source.counters.indestructible, 1, 'the printed hand-cast replacement supplies the cost counter');
    assert.equal(lands.concat(extra).filter(card => card.tapped).length, 8);
    const spell = put(M, game, a, name, 'hand');
    ui.spell = spell;
    ui.ready = true;
    assert.equal(await game.castSpell(a, spell, { from: 'hand' }), true);
    assert.ok(ui.offers.includes(true), 'copying an own spell receives the native UI response window');
    assert.equal(ui.activations, 1);
    assert.equal(source.counters.indestructible, 0);
    assert.equal(spell.zone, 'battlefield');
    assert.equal(game.bf().filter(card => card.name === name).length, 4);
    assert.equal(game.bf().filter(card => card.name === name && card.isToken).length, 3);
    assertGameStateInvariants(game, name);
  });
}

for (const name of ["Jester's Scepter", 'Myojin of Cryptic Dreams']) {
  test(`direct battlefield fixture of ${name} correctly lacks the printed activation prerequisite`, async () => {
    const { game, a, b, ui } = fixture();
    const source = put(M, game, a, name);
    const caster = name === "Jester's Scepter" ? b : a;
    for (let i = 0; i < 3; i++) put(M, game, a, 'Forest');
    if (caster === b) put(M, game, b, 'Forest');
    const spell = put(M, game, caster, 'Sol Ring', 'hand');
    ui.source = source;
    ui.spell = spell;
    ui.ready = true;
    game.turnPlayer = caster;
    assert.equal(await game.castSpell(caster, spell, { from: 'hand' }), true);
    assert.equal(ui.offers.includes(true), false);
    assert.equal(ui.activations, 0);
    assert.equal(spell.zone, 'battlefield');
    assertGameStateInvariants(game, name);
  });
}
