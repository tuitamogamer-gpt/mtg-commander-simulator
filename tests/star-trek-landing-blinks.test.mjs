// Landing Party (Commander Spock) is built on exiling permanents and bringing
// them back, and the permanent is often the commander. Every such card in the
// deck must return Spock when his owner keeps him out of the command zone,
// must say so in that choice, must let a bot keep the return, and must survive
// a bot thinking ahead while the return is pending.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M, setup, card, body, play, activate, event, settle, fuel} from './helpers/c21-fixtures.mjs';

for (const file of ['assignments-landing.json', 'assignments-federation.json']) {
  const rows = JSON.parse(fs.readFileSync(new URL(`../reports/decks/precon-trc-2026-10-29/${file}`, import.meta.url))).cards;
  if (rows.some(c => !M.DEFS[c.requestedName])) {
    for (const row of rows) M.RAW_DATA.cards[row.requestedName] ||= row.raw;
    M.initData(M.RAW_DATA);
  }
}

function spockTable(role = 'human') {
  const f = setup(role), spock = card(f, 'Commander Spock');
  spock.commander = true; f.a.commanders = [spock];
  return {f, spock};
}

// Answers for the seat; `zone: 'bot'` leaves the command-zone choice to the
// seat's own controller (a bot in the 'ai' role).
function answer(f, {targets = [], cards = [], zone = 'stay'} = {}) {
  const asked = [];
  f.decide = (p, q) => {
    asked.push(q);
    if (q.type === 'chooseTargets') return targets.filter(c => q.candidates.includes(c)).slice(0, q.max);
    if (q.type === 'chooseCards' && cards.length) return cards.filter(c => q.from.includes(c)).slice(0, q.max);
    if (q.type === 'chooseOption' && q.aiHint?.kind === 'commanderZone') return zone === 'bot' ? undefined : zone;
    // Spock's own reveal on returning: keep the land on top, cast nothing.
    if (q.type === 'chooseOption' && q.options.some(o => o.key === 'no')) return 'no';
  };
  return asked;
}

const land = async f => {const c = card(f, 'Forest', 'hand'); await f.game.putPermanentOntoBattlefield(c, f.a); await settle(f.game);};
const chapter = async (f, n) => {const saga = card(f, 'Balance of Terror'); saga.counters.lore = n - 1; f.game.addCounters(saga, 'lore', 1); await settle(f.game);};

// Each blink: what puts Spock away, the zone he waits in and the source named.
const BLINKS = [
  {name: 'Chief Kyle, Transporter Tech', zone: 'exile', setup: f => card(f, 'Chief Kyle, Transporter Tech'), act: land},
  {name: 'Balance of Terror (chapter II)', source: 'Balance of Terror', zone: 'exile', act: f => chapter(f, 2)},
  {name: 'Balance of Terror (chapter III)', source: 'Balance of Terror', zone: 'exile', act: f => chapter(f, 3)},
  {name: 'Temporal Tribulation', zone: 'exile', other: f => card(f, 'Sol Ring'), act: f => play(f, 'Temporal Tribulation')},
  {name: 'Temporal Tribulation (flashback)', source: 'Temporal Tribulation', zone: 'exile', other: f => card(f, 'Sol Ring'), act: async f => {
    const spell = card(f, 'Temporal Tribulation', 'graveyard'); fuel(f.a);
    const entry = f.game.castableList(f.a).find(e => e.card === spell && e.alt?.flashback);
    assert.ok(entry, 'flashback is offered');
    assert.ok(await f.game.castSpell(f.a, spell, {from: 'graveyard', alt: entry.alt}));
    await settle(f.game);
  }},
  {name: 'The Guardian of Forever', zone: 'graveyard', sacrifice: true, setup: f => card(f, 'The Guardian of Forever'),
    act: f => activate(f, f.game.bf().find(c => c.name === 'The Guardian of Forever'))},
];

async function blink(row, {role = 'human', zone = 'stay'} = {}) {
  const {f, spock} = spockTable(role);
  row.setup?.(f);
  const other = row.other?.(f);
  const asked = answer(f, {targets: [spock, other].filter(Boolean), cards: row.sacrifice ? [spock] : [], zone});
  await row.act(f);
  return {f, spock, other, asked, zoneChoices: asked.filter(q => q.aiHint?.kind === 'commanderZone')};
}

for (const row of BLINKS) {
  const source = row.source || row.name;
  test(`${row.name}: a commander kept out of the command zone returns at the next end step`, async () => {
    const {f, spock, other, zoneChoices} = await blink(row);
    assert.equal(spock.zone, row.zone);
    assert.equal(zoneChoices.length, 1, 'one command-zone choice');
    assert.match(zoneChoices[0].prompt, new RegExp(`Keep it in ${row.zone === 'exile' ? 'exile' : 'the graveyard'} to let ${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} return it at the beginning of the next end step`));
    assert.equal(zoneChoices[0].aiHint.pendingReturn, true);
    await event(f, 'endStep', {player: f.a});
    assert.equal(spock.zone, 'battlefield');
    assert.ok(f.game.battlefield.includes(spock), 'Spock is on the real battlefield');
    assert.ok(f.game.log.some(r => /puts Commander Spock onto the battlefield/.test(r.msg)));
    if (other) assert.equal(other.zone, 'battlefield', 'the other exiled permanent returns too');
  });

  test(`${row.name}: choosing the command zone gives up the return`, async () => {
    const {f, spock, other} = await blink(row, {zone: 'cz'});
    assert.equal(spock.zone, 'command');
    await event(f, 'endStep', {player: f.a});
    assert.equal(spock.zone, 'command');
    assert.ok(f.a.command.includes(spock));
    if (other) assert.equal(other.zone, 'battlefield');
  });

  test(`${row.name}: a bot keeps its commander for the return`, async () => {
    const {f, spock, zoneChoices} = await blink(row, {role: 'ai', zone: 'bot'});
    assert.equal(zoneChoices.length, 1, 'the bot made the command-zone choice');
    assert.equal(spock.zone, row.zone, 'the bot does not send it home');
    await event(f, 'endStep', {player: f.a});
    assert.equal(spock.zone, 'battlefield');
  });

  test(`${row.name}: a bot thinking ahead does not take the real commander`, async () => {
    const {f, spock} = await blink(row);
    const sim = M.cloneGameForAISimulation(f.game, 3);
    for (const player of sim.players) player.controller = {decide: async (g, q) => q.type === 'priority' ? {kind: 'pass'}
      : q.type === 'chooseOption' ? q.options.find(o => o.key === 'no')?.key ?? q.options[0]?.key : q.type === 'chooseTargets' ? [] : q.type === 'chooseCards' ? q.from.slice(0, q.min || 0) : null};
    sim.phase = 'end';
    await sim.emit('endStep', {player: sim.players[f.a.idx]});
    await settle(sim);
    assert.equal(spock.zone, row.zone, 'the live commander waits where it was');
    assert.ok(f.a[row.zone].includes(spock));
    assert.equal(sim.battlefield.includes(spock), false);
    await event(f, 'endStep', {player: f.a});
    assert.equal(spock.zone, 'battlefield');
    assert.ok(f.game.battlefield.includes(spock));
  });
}

test('Kyle during the end step: the choice says the next turn, and that end step returns the commander', async () => {
  const {f, spock} = spockTable();
  card(f, 'Chief Kyle, Transporter Tech');
  const asked = answer(f, {targets: [spock]});
  f.game.phase = 'end'; f.game.step = 'end';
  await land(f);
  assert.equal(spock.zone, 'exile');
  assert.match(asked.find(q => q.aiHint?.kind === 'commanderZone').prompt, /at the beginning of the next turn's end step/);
  f.game.phase = 'main1'; f.game.step = 'main';
  await event(f, 'endStep', {player: f.b});
  assert.equal(spock.zone, 'battlefield', 'the next end step (another player\'s turn) returns it');
});

test('Botany Bay names its conditional return, and bots do not wait on it', async () => {
  const {f, spock} = spockTable();
  const ship = card(f, 'S.S. Botany Bay');
  await f.game.move(spock, 'graveyard');
  // Kept in the graveyard, Spock can be exiled with the ship.
  let asked = answer(f, {cards: [spock], zone: 'stay'});
  await settle(f.game); await f.game.checkSBA();
  assert.equal(spock.zone, 'graveyard');
  asked = answer(f, {cards: [spock], zone: 'stay'});
  await activate(f, ship, 0);
  await f.game.checkSBA();
  const choice = asked.find(q => q.aiHint?.kind === 'commanderZone');
  assert.equal(spock.zone, 'exile');
  assert.match(choice.prompt, /Keep it in exile to let S\.S\. Botany Bay return it when it deals combat damage to a player/);
  assert.equal(choice.aiHint.pendingReturn, false, 'a conditional return does not hold a bot\'s commander');
  ship.counters.charge = 8; f.game.recalc();
  await event(f, 'damageToPlayer', {src: ship, player: f.b, n: 1, combat: true});
  assert.equal(spock.zone, 'battlefield');
});
