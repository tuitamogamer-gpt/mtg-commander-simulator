import test from 'node:test';
import assert from 'node:assert/strict';
import {decisionTable, until, button, M} from './helpers/ui-decision-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
import {aiIsolationFingerprint} from './helpers/run-ai-adversarial-games.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));

test('a paid human Fact or Fiction names the AI pile chooser rather than the last priority passer', async () => {
  const f = decisionTable(); f.rival.name = 'AI Dragon';
  let held;
  f.rival.controller = {decide: async (_game, q) => q.type === 'chooseCards'
    ? new Promise(resolve => {held = {q, resolve};}) : {kind: 'pass'}};
  f.game.addPlayer('AI Wolf', {name: 'Wait ownership'}, {decide: async () => ({kind: 'pass'})}, true);
  const lands = Array.from({length: 4}, () => f.put('Island'));
  for (const name of ['Forest', 'Opt', 'Island', 'Grizzly Bears', 'Mountain']) f.put(name, 'library');
  const spell = f.put('Fact or Fiction', 'hand');
  const casting = f.game.castSpell(f.me, spell, {from: 'hand'});
  await until(() => f.ui.pending?.q.prompt === 'Fact or Fiction: choose an opponent');
  f.root.querySelector(`[data-choice-key="${f.rival.idx}"]`).click();
  await until(() => !!held);
  assert.equal(f.game.priorityState.holder.name, 'AI Wolf');
  assert.equal(f.game.stack.length, 0); assert.equal(f.game._stackResolutionDepth, 1);
  const status = f.ui.waitStatus();
  assert.equal(status.kind, 'player'); assert.equal(status.playerName, 'AI Dragon');
  assert.equal(status.questionType, 'chooseCards');
  assert.match(status.detail, /Resolving Fact or Fiction/);
  const view = f.ui.renderPromptBar(f.game);
  assert.match(view.textContent, /Waiting for AI Dragon/);
  assert.doesNotMatch(view.textContent, /Opponents are playing|Waiting for AI Wolf/);
  const before = aiIsolationFingerprint(f.game);
  const clone = M.cloneGameForAISimulation(f.game, 131036);
  assert.deepEqual(Object.keys(clone.uiHooks), []);
  await clone.askPriorityAction(clone.players[1]);
  assert.equal(aiIsolationFingerprint(f.game), before);
  assert.deepEqual(f.ui.waitStatus(), status, 'simulated decisions cannot change the live wait owner');
  held.resolve(held.q.from.slice(0, 2));
  await until(() => f.ui.pending?.q.type === 'chooseOption');
  assert.equal(f.ui.waitStatus().kind, 'human');
  const key = f.ui.pending.q.options[0].key;
  f.root.querySelector(`[data-choice-key="${key}"]`).click();
  assert.equal(await casting, true);
  assert.equal(spell.castMeta.manaSpent, 4); assert.ok(lands.every(card => card.tapped));
  assert.equal(spell.zone, 'graveyard'); assert.equal(f.ui.waitStatus().kind, 'between');
  assertGameStateInvariants(f.game, 'native Fact or Fiction wait owner and completed pile choice');
});

test('the native paid Roaming Throne choice visibly waits for you until Ninja is selected', async () => {
  const f = decisionTable(), lands = Array.from({length: 4}, () => f.put('Forest'));
  const throne = f.put('Roaming Throne', 'hand');
  const casting = f.game.castSpell(f.me, throne, {from: 'hand'});
  await until(() => f.ui.pending?.q.aiHint?.kind === 'chooseType');
  const entry = f.ui.pending;
  assert.deepEqual({...f.ui.waitStatus()}, {kind: 'human', title: 'Waiting for you', detail: 'Choose a creature type.',
    playerId: f.me.idx, playerName: 'You', questionType: 'chooseOption'});
  const waiting = f.root.querySelector('[data-testid="wait-status"]');
  assert.match(waiting.textContent, /Waiting for you/); assert.equal(waiting.getAttribute('role'), 'status');
  const input = f.root.querySelector('input'); input.value = 'Ninja'; input.listeners.get('input')();
  assert.ok(f.ui.pending === entry, 'status and filtering cannot answer the engine question');
  f.root.querySelector('[data-choice-key="Ninja"]').click();
  assert.equal(await casting, true); assert.equal(throne.meta.cslType, 'Ninja');
  assert.equal(throne.zone, 'battlefield'); assert.ok(lands.every(card => card.tapped));
  assert.equal(f.ui.waitStatus().kind, 'between');
  assertGameStateInvariants(f.game, 'one paid creature-type choice with honest wait status');
});

test('nested native controller waits remove their own token even when answers return out of order', async () => {
  const f = decisionTable(); let releaseOuter, releaseInner;
  f.rival.name = 'AI Dragon'; f.rival.controller = {decide: () => new Promise(resolve => {releaseOuter = resolve;})};
  const other = f.game.addPlayer('AI Wolf', {name: 'Wait ownership'}, {decide: () => new Promise(resolve => {releaseInner = resolve;})}, true);
  const outer = f.rival.controller.decide(f.game, {type: 'chooseOption', options: [{key: 'keep', label: 'Keep'}]});
  const inner = other.controller.decide(f.game, {type: 'chooseOption', options: [{key: 'draw', label: 'Draw'}]});
  assert.equal(f.ui.waitStatus().playerName, 'AI Wolf');
  releaseOuter('keep'); assert.equal(await outer, 'keep');
  assert.equal(f.ui.waitStatus().playerName, 'AI Wolf');
  releaseInner('draw'); assert.equal(await inner, 'draw');
  assert.equal(f.ui.waitStatus().kind, 'between');
});

test('observer failures preserve legal answers and the original controller rejection', async () => {
  const f = decisionTable(), card = f.put('Grizzly Bears');
  f.rival.controller = {decide: async () => [card]};
  const phases = [];
  f.game.uiHooks.decisionWait = phase => {phases.push(phase); throw new Error('Presentation observer failed');};
  const answer = await f.rival.controller.decide(f.game, {type: 'chooseCards', from: [card], min: 1, max: 1});
  assert.equal(answer[0], card); assert.deepEqual(phases, ['begin', 'end']);
  const original = new Error('The native controller failed');
  f.rival.controller = {decide: async () => {throw original;}};
  await assert.rejects(f.rival.controller.decide(f.game, {type: 'chooseOption'}), error => error === original);
  Object.defineProperty(f.game.uiHooks, 'decisionWait', {configurable: true, get() {throw new Error('Observer lookup failed');}});
  f.rival.controller = {decide: async () => 'keep'};
  assert.equal(await f.rival.controller.decide(f.game, {type: 'chooseOption'}), 'keep');
});

test('wait status exposes neither an AI private prompt, choices nor a face-down resolving identity', async () => {
  const f = decisionTable(), privateCard = f.put('Grizzly Bears', 'hand', f.rival);
  let release;
  f.rival.controller = {decide: () => new Promise(resolve => {release = resolve;})};
  const decision = f.rival.controller.decide(f.game, {type: 'chooseOption', card: privateCard,
    prompt: 'SECRET_HAND_PROMPT Grizzly Bears', options: [{key: 'secret', label: 'SECRET_OPTION'}]});
  const text = JSON.stringify(f.ui.waitStatus()) + f.ui.renderPromptBar(f.game).textContent;
  assert.match(text, /Waiting for Opponent/); assert.doesNotMatch(text, /SECRET|Grizzly Bears/);
  release('secret'); assert.equal(await decision, 'secret');
  privateCard.faceDown = true;
  f.game.c1516Resolving = {name: 'SECRET_FACE_DOWN Grizzly Bears', card: privateCard};
  f.game._stackResolutionDepth = 1;
  assert.doesNotMatch(JSON.stringify(f.ui.waitStatus()), /SECRET|Grizzly Bears/);
  assert.match(f.ui.waitStatus().title, /face-down/);
});

test('a real combat response belongs to you and clears only after its native Proceed answer', async () => {
  const f = decisionTable(); f.ui.prioMode = 'auto';
  f.game.turnPlayer = f.rival; f.game.phase = 'combat'; f.game.step = 'blockers';
  f.put('Opt', 'hand'); f.put('Island');
  const response = f.game.askPriorityAction(f.me), reaction = f.ui.react;
  assert.equal(f.ui.waitStatus().kind, 'human'); assert.equal(f.ui.waitStatus().questionType, 'priority');
  const view = f.ui.renderPromptBar(f.game); f.root.replaceChildren(view);
  assert.match(view.textContent, /Waiting for you/); assert.ok(f.ui.react === reaction);
  button(f, /^Proceed/).click(); assert.equal((await response).kind, 'pass'); await tick();
  assert.equal(f.ui.waitStatus().kind, 'between');
  f.game._placingTriggers = [];
  assert.equal(f.ui.waitStatus().kind, 'between', 'an empty trigger-placement array does not claim activity');
  f.game.gameOver = true;
  assert.equal(f.ui.waitStatus().kind, 'complete');
});

test('paid Cruel Entertainment reports the AI controlling your native turn as the actual chooser', async () => {
  const f = decisionTable(); f.rival.name = 'AI Dragon';
  for (const player of [f.me, f.rival]) for (let n = 0; n < 12; n++) f.put('Forest', 'library', player);
  const human = f.me._controller;
  const prepare = {decide: async (_game, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'chooseTargets') return [q.candidates.includes(f.me) ? f.me : f.rival];
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    throw new Error(`Unexpected native Cruel Entertainment choice: ${q.type}`);
  }};
  f.me.controller = prepare; f.rival.controller = prepare;
  const lands = ['Swamp', 'Swamp', ...Array(5).fill('Wastes')].map(name => f.put(name));
  const spell = f.put('Cruel Entertainment', 'hand');
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand'}), true);
  assert.equal(spell.castMeta.manaSpent, 7); assert.ok(lands.every(card => card.tapped));
  f.me.controller = human;
  let held, once = false;
  f.rival.controller = {decide: async (_game, q) => {
    if (q.type === 'main') {
      if (!once) {once = true; return new Promise(resolve => {held = {q, resolve};});}
      return {kind: 'done'};
    }
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'attackers' || q.type === 'blockers') return [];
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options[0]?.key;
    if (q.type === 'orderTriggers') return q.triggers;
    throw new Error(`Unexpected controlled-turn decision: ${q.type}`);
  }};
  const turn = f.game.runTurn(); await until(() => !!held);
  assert.equal(held.q.player, f.me); assert.equal(held.q.c1516ControlledBy, f.rival.idx);
  assert.equal(f.ui.pending, null);
  assert.equal(f.ui.waitStatus().kind, 'player'); assert.equal(f.ui.waitStatus().playerName, 'AI Dragon');
  assert.equal(f.ui.waitStatus().questionType, 'main');
  held.resolve({kind: 'done'}); await turn;
  assert.equal(f.ui.waitStatus().kind, 'between');
  assertGameStateInvariants(f.game, 'actual delegated turn chooser after paid Cruel Entertainment');
});

test('paid Brutal Hordechief reports the attacker choosing your native blockers', async () => {
  const f = decisionTable(); f.rival.name = 'AI Dragon'; f.game.turnPlayer = f.rival;
  const defender = f.put('Grizzly Bears'), attacker = f.put('Grizzly Bears', 'battlefield', f.rival);
  const chief = f.put('Brutal Hordechief', 'battlefield', f.rival);
  const lands = Array.from({length: 5}, () => f.put('Mountain', 'battlefield', f.rival));
  let held;
  f.rival.controller = {decide: async (_game, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'attackers') return [{card: attacker, target: f.me}];
    if (q.type === 'blockers') return new Promise(resolve => {held = {q, resolve};});
    if (q.type === 'orderTriggers') return q.triggers;
    throw new Error(`Unexpected Hordechief decision: ${q.type}`);
  }};
  const entry = f.game.activatableList(f.rival).find(row => row.card === chief && row.ability);
  assert.ok(entry); assert.equal(await f.game.activateAbility(f.rival, entry), true);
  assert.ok(lands.every(card => card.tapped), 'the printed {3}{R/W}{R/W} activation pays five real mana');
  assert.equal(f.game.untilEffects.find(row => row.kind === 'c1516ChooseBlocks').who, f.rival);
  const combat = f.game.combatPhase(f.rival); await until(() => !!held);
  assert.equal(held.q.player, f.me); assert.equal(held.q.c1516ControlledBy, f.rival.idx);
  assert.equal(f.ui.pending, null); assert.equal(f.ui.waitStatus().playerName, 'AI Dragon');
  assert.equal(f.ui.waitStatus().questionType, 'blockers');
  held.resolve([{blocker: defender, attacker}]); await combat;
  assert.equal(f.ui.waitStatus().kind, 'between');
  assertGameStateInvariants(f.game, 'native forced-block chooser after paid Brutal Hordechief');
});

test('a lost delegated actor falls back to the original human controller and wait owner', async () => {
  const f = decisionTable(); f.rival.lost = true;
  f.game.c1516ActiveControl = {subject: f.me.idx, controller: f.rival.idx};
  const decision = f.me.controller.decide(f.game, {type: 'chooseOption', options: [{key: 'keep', label: 'Keep'}]});
  assert.equal(f.ui.pending.q.c1516ControlledBy, f.rival.idx, 'the existing routing marker is unchanged');
  assert.equal(f.ui.waitStatus().kind, 'human'); assert.equal(f.ui.waitStatus().playerId, f.me.idx);
  button(f, 'Keep').click(); assert.equal(await decision, 'keep');
  assert.equal(f.ui.waitStatus().kind, 'between');
});
