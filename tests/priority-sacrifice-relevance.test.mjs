import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runInNewContext} from 'node:vm';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle} from './helpers/oracle-v8-fixtures.mjs';

const M = loadEngine();
runInNewContext(fs.readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8'),
  {MTG: M, document: {}, console, setTimeout, clearTimeout});
const automaticModes = ['end', 'combat', 'auto', 'smart', 'fast'];

function table(name = 'Ainok Strike Leader') {
  const f = context(M);
  f.source = put(M, f.game, f.a, name);
  f.game.turnPlayer = f.b;
  f.game.phase = 'combat';
  f.game.step = 'attackers';
  f.add = (name = 'Grizzly Bears', player = f.a) => put(M, f.game, player, name);
  f.token = (name = 'Grizzly Bears', player = f.a) => {
    const card = f.add(name, player);
    card.isToken = true;
    return card;
  };
  f.question = async () => {
    let question;
    f.a.controller = {decide: async (g, q) => { question = q; return {kind: 'pass'}; }};
    await f.game.askPriorityAction(f.a);
    return question;
  };
  return f;
}

async function expectAutomaticPass(f, expected) {
  const q = await f.question();
  assert.ok(q.acts.some(entry => entry.card === f.source), 'the sacrifice remains a legal manual action');
  for (const mode of automaticModes)
    assert.equal(M.autoPassPolicy(mode, f.game, q, f.a), expected, mode);
  assert.ok(q.acts.some(entry => entry.card === f.source), 'checking relevance must not remove the action');
  return q;
}

for (const step of ['begin', 'attackers', 'blockers', 'firstStrike', 'damage', 'endCombat']) {
  test(`Ainok does not interrupt ${step} with no creature tokens`, async () => {
    const f = table();
    f.game.step = step;
    f.add();
    await expectAutomaticPass(f, true);
  });
}

for (const state of ['opponent token', 'noncreature token', 'phased token', 'protected token', 'only source is a token']) {
  test(`Ainok does not interrupt for ${state}`, async () => {
    const f = table();
    if (state === 'opponent token') f.token('Grizzly Bears', f.b);
    if (state === 'noncreature token') f.token('Sol Ring');
    if (state === 'phased token') { f.token().phasedOut = true; f.game.recalc(); }
    if (state === 'protected token') M.E.grantUntilEOT(f.game, f.token(), ['indestructible']);
    if (state === 'only source is a token') f.source.isToken = true;
    await expectAutomaticPass(f, true);
  });
}

test('Ainok starts and stops prompting as eligible tokens enter, gain protection and leave', async () => {
  const f = table();
  await expectAutomaticPass(f, true);
  const [token] = await f.game.makeTokens('goblin', f.a);
  await expectAutomaticPass(f, false);
  M.E.grantUntilEOT(f.game, token, ['indestructible']);
  await expectAutomaticPass(f, true);
  const [second] = await f.game.makeTokens('goblin', f.a);
  await expectAutomaticPass(f, false);
  await f.game.move(second, 'exile');
  await expectAutomaticPass(f, true);
});

test('an empty Ainok effect does not cause an end-step or targeted-ability response stop', async () => {
  const f = table();
  f.game.phase = 'end';
  await expectAutomaticPass(f, true);
  f.game.stack.push({kind: 'ability', ctrl: f.b, name: 'Opponent ability', targets: [f.source]});
  await expectAutomaticPass(f, true);
  f.token();
  await expectAutomaticPass(f, false);
});

test('other legal actions and opposing spell reviews still stop with an irrelevant sacrifice', async () => {
  const f = table();
  const draw = f.add('Mind Stone');
  f.a.pool.C = 1;
  const q = await expectAutomaticPass(f, false);
  assert.ok(q.acts.some(entry => entry.card === draw));
  await f.game.move(draw, 'graveyard');
  const spell = new M.CardInst(M.DEFS['Grizzly Bears'], f.b);
  spell.zone = 'stack';
  f.game.stack.push({kind: 'spell', ctrl: f.b, card: spell, srcCard: spell, name: spell.name, targets: []});
  await expectAutomaticPass(f, false);
});

for (const mode of ['end', 'combat', 'off', 'full']) {
  test(`HOLD and Full control preserve an empty sacrifice in ${mode} mode`, async () => {
    const f = table();
    const q = await f.question();
    const ui = Object.create(M.UI.prototype);
    Object.assign(ui, {me: f.a, game: f.game, prioMode: mode, holdNext: true});
    assert.equal(ui.autoAnswer(f.game, q), undefined);
    assert.equal(ui.holdNext, false);
    assert.equal(ui.autoAnswer(f.game, q)?.kind, mode === 'full' ? undefined : 'pass');
    assert.equal(await f.game.activateAbility(f.a, q.acts.find(entry => entry.card === f.source)), true);
    await settle(f.game);
    assert.equal(f.source.zone, 'graveyard', 'manual sacrifice still pays its cost');
  });
}

for (const name of ['Selfless Spirit', 'Dauntless Escort', 'Hajar, Loyal Bodyguard', 'Jirina, Dauntless General', 'Dora Milaje Elite']) {
  test(`${name} needs a surviving beneficiary for automatic stops`, async () => {
    const f = table(name);
    await expectAutomaticPass(f, true);
    const beneficiary = f.add();
    if (['Jirina, Dauntless General', 'Hajar, Loyal Bodyguard', 'Dora Milaje Elite'].includes(name))
      await expectAutomaticPass(f, true);
    if (name === 'Jirina, Dauntless General') beneficiary.def = {...beneficiary.def, subtypes: ['Human']};
    if (['Hajar, Loyal Bodyguard', 'Dora Milaje Elite'].includes(name))
      beneficiary.def = {...beneficiary.def, super: ['Legendary']};
    f.game.recalc();
    await expectAutomaticPass(f, false);
    M.E.grantUntilEOT(f.game, beneficiary, ['indestructible']);
    await expectAutomaticPass(f, !['Hajar, Loyal Bodyguard', 'Jirina, Dauntless General'].includes(name));
    M.E.grantUntilEOT(f.game, beneficiary, ['hexproof']);
    await expectAutomaticPass(f, name !== 'Hajar, Loyal Bodyguard');
  });
}

test('a targetable sacrifice does not prompt just to protect its own sacrificed source', async () => {
  const f = table('Resolute Watchdog');
  f.a.pool.C = 1;
  await expectAutomaticPass(f, true);
  f.token();
  await expectAutomaticPass(f, false);
});

for (const name of ['Yahenni, Undying Partisan', "Thalia's Geistcaller", 'Pitiless Pontiff']) {
  test(`${name} skips redundant protection while preserving additional keywords`, async () => {
    const f = table(name);
    const fodder = f.token();
    fodder.def = {...fodder.def, subtypes: ['Spirit']};
    f.game.recalc();
    f.a.pool.C = 1;
    await expectAutomaticPass(f, false);
    M.E.grantUntilEOT(f.game, f.source, ['indestructible']);
    await expectAutomaticPass(f, name !== 'Pitiless Pontiff');
    M.E.grantUntilEOT(f.game, f.source, ['deathtouch']);
    await expectAutomaticPass(f, true);
  });
}

test('sacrifices with an additional effect retain their response window', async () => {
  const f = table('Boromir, Warden of the Tower');
  await expectAutomaticPass(f, false); // The Ring still tempts you without another creature.
});

test('sacrifice and death triggers keep an otherwise empty buff relevant', async () => {
  const f = table();
  const artist = f.add('Blood Artist');
  await expectAutomaticPass(f, false);
  assert.equal(f.source.zone, 'battlefield');
  assert.equal(f.game.pendingTriggers.length, 0, 'checking relevance never emits the previewed event');
  await f.game.move(artist, 'exile');
  await expectAutomaticPass(f, true);
});

test('Flight Spellbomb can still be sacrificed for its draw trigger when every target already flies', async () => {
  const f = table('Flight Spellbomb');
  f.add('Grizzly Bears');
  for (const creature of f.game.creatures(f.a)) M.E.grantUntilEOT(f.game, creature, ['flying']);
  f.a.pool.U = 1;
  await expectAutomaticPass(f, false);
});

test('a source-dependent protection filter uses the current power of Lena', async () => {
  const f = table('Lena, Selfless Champion');
  f.add('Colossal Dreadmaw');
  await expectAutomaticPass(f, true);
  f.token();
  await expectAutomaticPass(f, false);
});

test('the relevant Ainok response protects tokens when an actual sweeper resolves', async () => {
  const f = table();
  const [token] = await f.game.makeTokens('goblin', f.a);
  const sweeper = put(M, f.game, f.b, 'Wrath of God', 'hand');
  f.b.pool.W = 4;
  f.game.phase = 'main1';
  assert.equal(await f.game.castSpell(f.b, sweeper, {from: 'hand'}), true);
  const q = await expectAutomaticPass(f, false);
  assert.equal(await f.game.activateAbility(f.a, q.acts.find(entry => entry.card === f.source)), true);
  await settle(f.game);
  assert.equal(f.source.zone, 'graveyard');
  assert.equal(token.zone, 'battlefield');
  assert.equal(token.kw('indestructible'), true);
  assert.equal(sweeper.zone, 'graveyard');
});

test('Live publishes the same relevance policy while preserving the manual action', async () => {
  const f = table();
  f.a.onlineSeat = 0;
  f.b.onlineSeat = 1;
  for (const hasToken of [false, true]) {
    if (hasToken) f.token();
    const q = await f.question();
    const descriptor = M.onlineDecisionDescriptor(f.game, q, f.a, `sacrifice-${hasToken}`);
    assert.equal(descriptor.ui.autoPass.end, !hasToken);
    assert.equal(descriptor.ui.autoPass.full, false);
    const activation = descriptor.actions.find(action => action.kind === 'activate');
    assert.ok(activation);
    assert.ok(descriptor.legal.tokens.includes(activation.token));
  }
});

test('the UI advances automatically without tokens and opens a usable response when one enters', async () => {
  const f = table();
  const ui = Object.create(M.UI.prototype);
  Object.assign(ui, {me: f.a, game: f.game, prioMode: 'end', pendings: [],
    render() {}, scrollPromptIntoView() {}});
  f.a.controller = ui.controllerFor(f.a);
  assert.equal((await f.game.askPriorityAction(f.a)).kind, 'pass');
  assert.equal(ui.react, undefined);
  assert.equal(ui.pending, null);
  const [token] = await f.game.makeTokens('goblin', f.a);
  const response = f.game.askPriorityAction(f.a);
  assert.equal(ui.react?.q.type, 'priority');
  ui.takeReactWindow();
  const entry = ui.pending.q.acts.find(entry => entry.card === f.source);
  assert.ok(entry);
  ui.resolvePending({kind: 'activate', entry});
  assert.equal(await f.game.performAction(f.a, await response), true);
  await settle(f.game);
  assert.equal(token.kw('indestructible'), true);
  assert.equal(f.source.zone, 'graveyard');
  assert.equal(ui.pending, null);
});
