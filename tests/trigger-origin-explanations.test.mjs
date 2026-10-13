import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {M, table, paidCast, stable} from './helpers/second-audit-combat-fixtures.mjs';
import {aiIsolationFingerprint} from './helpers/run-ai-adversarial-games.mjs';

const wire = value => JSON.parse(JSON.stringify(value));
const uiSource = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');

async function fixture(throneCount = 1, chosenType = 'Ninja') {
  const f = table(131031);
  f.g.emit = M.Game.prototype.emit;
  f.option = (_player, q) => q.aiHint?.kind === 'chooseType' ? chosenType : undefined;
  f.yuriko = f.put("Yuriko, the Tiger's Shadow", 'hand');
  f.lands(['Island', 'Swamp', 'Wastes']);
  await paidCast(f, f.a, f.yuriko);
  f.outcast = f.put('Changeling Outcast', 'hand');
  f.lands(['Swamp']); await paidCast(f, f.a, f.outcast);
  f.thrones = [];
  for (let n = 0; n < throneCount; n++) {
    const throne = f.put('Roaming Throne', 'hand'); f.lands(Array(4).fill('Wastes'));
    await paidCast(f, f.a, throne); f.thrones.push(throne);
    assert.equal(throne.meta.cslType, chosenType);
  }
  f.g._prioritySessionActive = true;
  return f;
}

async function combat(f, rows = [{card: f.outcast, defender: f.b}], step = 'normal') {
  f.g.phase = 'combat';
  f.g.combat = {attackers: rows.map(row => row.card)};
  for (const {card, defender} of rows) {
    card.sick = false; card.tapped = true; card.attacking = defender;
    f.g.recordCombatDestination(card);
  }
  await f.g.combatDamage(f.a, step);
  return f.g.pendingTriggers.filter(row => row.src === f.yuriko);
}

async function settle(g) {
  for (let n = 0; (g.stack.length || g.pendingTriggers.length) && n < 40; n++) {
    await g.flushTriggers(); if (g.stack.length) await g.resolveTop();
  }
  assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0);
}

for (const [n, type, expected] of [[0, 'Ninja', 1], [1, 'Ninja', 2], [2, 'Ninja', 3], [1, 'Dragon', 1]]) {
  test(`native Yuriko explains ${expected} trigger(s) from one Ninja damage event with ${n} ${type} Throne(s)`, async () => {
    const f = await fixture(n, type), handBefore = f.a.hand.length;
    const triggers = await combat(f);
    assert.equal(triggers.length, expected);
    for (const [index, trigger] of triggers.entries()) {
      const origin = trigger.triggerOrigin;
      assert.ok(origin, 'the actual queued trigger includes its public event explanation');
      assert.equal(origin.event, 'damageToPlayer');
      assert.equal(origin.combat, true); assert.equal(origin.combatStep, 'normal');
      assert.equal(origin.cause.name, f.outcast.name); assert.equal(origin.cause.iid, f.outcast.iid);
      assert.equal(origin.player.name, f.b.name); assert.equal(origin.player.index, f.b.idx);
      assert.equal(origin.amount, 1); assert.equal(origin.nativeCount, 1);
      assert.equal(origin.index, index + 1); assert.equal(origin.total, expected);
      assert.deepEqual(wire(origin.additional.map(row => row.source?.iid)), type === 'Ninja' ? f.thrones.map(card => card.iid) : []);
      assert.ok(origin.additional.every(row => row.count === 1 && row.source.name === 'Roaming Throne'));
      assert.equal(origin.addedBy?.iid || null, index ? f.thrones[index - 1].iid : null);
      assert.deepEqual(wire(origin), wire(JSON.parse(JSON.stringify(origin))));
    }
    await f.g.flushTriggers();
    assert.equal(f.g.stack.length, expected);
    assert.deepEqual(wire(f.g.stack.map(row => row.ctx.triggerOrigin)), wire(triggers.map(row => row.triggerOrigin)));
    await settle(f.g);
    assert.equal(f.a.hand.length, handBefore + expected, 'provenance does not change native Yuriko draws');
    stable(f);
  });
}

test('two Ninja damage events retain distinct causes and defenders with additive Throne triggers', async () => {
  const f = await fixture(2);
  const triggers = await combat(f, [{card: f.outcast, defender: f.b}, {card: f.yuriko, defender: f.c}]);
  assert.equal(triggers.length, 6);
  for (const [card, player] of [[f.outcast, f.b], [f.yuriko, f.c]]) {
    const group = triggers.filter(row => row.triggerOrigin?.cause.iid === card.iid);
    assert.equal(group.length, 3);
    assert.deepEqual(wire(group.map(row => row.triggerOrigin.index)), [1, 2, 3]);
    assert.ok(group.every(row => row.triggerOrigin.player.index === player.idx && row.triggerOrigin.total === 3));
  }
  await settle(f.g); stable(f);
});

test('actual double strike labels first and normal damage as separate Yuriko events', async () => {
  const f = await fixture(1);
  f.g._prioritySessionActive = false;
  f.targets = (_p, q) => q.candidates.includes(f.outcast) ? [f.outcast] : undefined;
  const rage = f.put('Temur Battle Rage', 'hand'); f.lands(['Mountain', 'Wastes']);
  await paidCast(f, f.a, rage); f.g._prioritySessionActive = true;
  const first = await combat(f, undefined, 'first');
  assert.equal(first.length, 2); assert.ok(first.every(row => row.triggerOrigin?.combatStep === 'first'));
  await settle(f.g);
  const normal = await combat(f);
  assert.equal(normal.length, 2); assert.ok(normal.every(row => row.triggerOrigin?.combatStep === 'normal'));
  await settle(f.g); stable(f);
});

test('native copied Yuriko ability and Opt simulation retain JSON-only origin without live mutation', async () => {
  const f = await fixture(2); await combat(f); await f.g.flushTriggers();
  const original = f.g.stack.at(-1), copied = await f.g.copyStackAbility(original, f.c);
  assert.ok(copied); assert.deepEqual(wire(copied.ctx.triggerOrigin), wire(original.ctx.triggerOrigin));
  const opt = f.put('Opt', 'hand', f.b); f.lands(['Island'], f.b);
  const before = aiIsolationFingerprint(f.g), originBefore = wire(original.ctx.triggerOrigin);
  const simulation = await M.simulateAction(f.g, {kind: 'cast', card: opt, from: 'hand'}, {playerId: f.b.idx, seed: 131032});
  assert.equal(simulation.applied, true); assert.equal(simulation.error, null);
  assert.equal(aiIsolationFingerprint(f.g), before);
  assert.deepEqual(wire(original.ctx.triggerOrigin), originBefore);
  assert.equal(opt.zone, 'hand');
  const clone = M.cloneGameForAISimulation(f.g, 131033);
  assert.deepEqual(wire(clone.stack.map(row => row.ctx.triggerOrigin)), wire(f.g.stack.map(row => row.ctx.triggerOrigin)));
  assert.notEqual(clone.stack[0].ctx.triggerOrigin, f.g.stack[0].ctx.triggerOrigin);
  await settle(f.g); stable(f);
});

test('a native manifested Ninja exposes only its public face-down identity in trigger explanations', async () => {
  const f = await fixture(1); f.g._prioritySessionActive = false;
  const nexus = f.put('Maskwood Nexus', 'hand'); f.lands(Array(4).fill('Wastes')); await paidCast(f, f.a, nexus);
  f.put('Blightsteel Colossus', 'library');
  const manifested = await f.g.manifestTop(f.a); assert.equal(manifested.faceDown, true);
  f.g._prioritySessionActive = true;
  const triggers = await combat(f, [{card: manifested, defender: f.b}]);
  assert.equal(triggers.length, 2);
  assert.ok(triggers.every(row => row.triggerOrigin?.cause.name === 'Face-down creature'));
  assert.equal(JSON.stringify(triggers.map(row => row.triggerOrigin)).includes('Blightsteel'), false);
  await settle(f.g); stable(f);
});

test('native draw provenance does not publish the private card that just entered its owner hand', async () => {
  const f = await fixture(0); f.g._prioritySessionActive = false;
  f.put('Opt', 'hand');
  const crawler = f.put('Psychosis Crawler', 'hand'); f.lands(Array(5).fill('Wastes'));
  await paidCast(f, f.a, crawler);
  const hidden = f.put('Blightsteel Colossus', 'library');
  f.g._prioritySessionActive = true; await f.g.draw(f.a, 1);
  const trigger = f.g.pendingTriggers.find(row => row.src === crawler);
  assert.ok(trigger?.triggerOrigin); assert.equal(hidden.zone, 'hand');
  assert.equal(trigger.triggerOrigin.cause.name, 'Card in hand');
  assert.equal(JSON.stringify(trigger.triggerOrigin).includes('Blightsteel'), false);
  await settle(f.g); stable(f);
});

test('native once-per-turn trigger limits have no attributed extra occurrence after an ETB doubler', async () => {
  const f = await fixture(0); f.g._prioritySessionActive = false;
  const panharmonicon = f.put('Panharmonicon', 'hand'); f.lands(Array(4).fill('Wastes'));
  await paidCast(f, f.a, panharmonicon);
  const welcome = f.put("Tocasia's Welcome", 'hand'); f.lands(['Plains', 'Wastes', 'Wastes']);
  await paidCast(f, f.a, welcome);
  f.g._prioritySessionActive = true;
  const elf = f.put('Elvish Mystic', 'hand'); f.lands(['Forest']);
  const row = f.g.castableList(f.a).find(entry => entry.card === elf); assert.ok(row);
  assert.equal(await f.g.castSpell(f.a, elf, {from: row.from, alt: row.alt}), true);
  await f.g.resolveTop();
  const triggers = f.g.stack.filter(entry => entry.srcCard === welcome);
  assert.equal(triggers.length, 1); assert.equal(triggers[0].ctx.triggerOrigin.total, 1);
  assert.deepEqual(wire(triggers[0].ctx.triggerOrigin.additional), []);
  assert.equal(triggers[0].ctx.triggerOrigin.addedBy, null);
  await settle(f.g); stable(f);
});

test('settled native Yuriko and Throne combat remains a compatible checkpoint with identical restored state', async () => {
  const f = await fixture(2); await combat(f); await settle(f.g);
  f.g.combat = null; f.g.phase = 'main2'; f.g.step = 'main';
  assert.deepEqual(wire(M.gameStateSnapshotBlockers(f.g)), []);
  const saved = M.captureGameState(f.g); assert.ok(saved);
  const fresh = table(131033); M.restoreGameState(fresh.g, wire(saved));
  assert.equal(M.gameStateFingerprint(fresh.g), M.gameStateFingerprint(f.g));
  stable(fresh);
});

function renderOrder(game, triggers) {
  const doc = {createElement(tag) {
    const node = {tagName: tag, children: [], className: '', innerHTML: '', dataset: {}, style: {},
      appendChild(child) {this.children.push(child); return child;},
      append(...children) {children.forEach(child => this.appendChild(child));}, setAttribute() {}, addEventListener() {}};
    node.classList = {add(...classes) {node.className += ' ' + classes.join(' ');}};
    return node;
  },querySelector() {return null;},addEventListener() {}};
  const uiMTG = {...M};
  runInNewContext(uiSource, {MTG: uiMTG, document: doc, console, setTimeout, clearTimeout,
    localStorage: {getItem() {return null;}}, window: {addEventListener() {}}});
  const ui = Object.assign(Object.create(uiMTG.UI.prototype), {game, me: game.players[0],
    pendings: [{q: {type: 'orderTriggers', prompt: 'Order your triggers', triggers}}]});
  return ui.renderDecisionModal(game);
}

test('actual trigger ordering UI explains each additional Throne trigger without calling it an ability copy', async () => {
  const f = await fixture(2), triggers = await combat(f);
  const tree = renderOrder(f.g, triggers);
  const all = node => [node, ...node.children.flatMap(all)];
  const text = all(tree).map(node => node.innerHTML).join(' ');
  assert.match(text, /Changeling Outcast.*combat damage.*Opponent/);
  assert.match(text, /Trigger 1 of 3/); assert.match(text, /Trigger 2 of 3/); assert.match(text, /Trigger 3 of 3/);
  assert.match(text, /Additional trigger from Roaming Throne/);
  assert.doesNotMatch(text, /copied ability|ability copy|doubled twice/);
  await settle(f.g);
});
