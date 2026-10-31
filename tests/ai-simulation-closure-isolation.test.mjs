// A simulation clone copies the game's objects but not its closures. A delayed
// "return it at the beginning of the next end step" holds the live card and
// player; when a bot's lookahead resolved it, the live card moved into the
// simulation. Reported from play: Chief Kyle exiled Commander Spock, a bot
// simulated the end step, and Spock was left with zone "battlefield" on no real
// battlefield and in no exile. The real return then did nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M, setup, card, event, settle} from './helpers/c21-fixtures.mjs';

const assigned = JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-trc-2026-10-29/assignments-landing.json', import.meta.url))).cards;
if (assigned.some(c => !M.DEFS[c.requestedName])) {
  for (const row of assigned) M.RAW_DATA.cards[row.requestedName] ||= row.raw;
  M.initData(M.RAW_DATA);
}

async function blinkedCommander() {
  const f = setup(), g = f.game, me = f.a;
  const kyle = card(f, 'Chief Kyle, Transporter Tech'), spock = card(f, 'Commander Spock');
  spock.commander = true; me.commanders = [spock];
  let blinks = 0;
  f.decide = (p, q) => {
    if (q.type === 'chooseTargets' && q.src === kyle) return q.candidates.includes(spock) && blinks++ === 0 ? [spock] : [];
    if (q.type === 'chooseOption' && q.aiHint?.kind === 'commanderZone') return 'stay';
  };
  await g.putPermanentOntoBattlefield(card(f, 'Forest', 'hand'), me);
  await settle(g);
  assert.equal(spock.zone, 'exile');
  return {f, g, me, spock};
}

const quiet = {decide: async (game, q) => q.type === 'priority' ? {kind: 'pass'} : q.type === 'chooseTargets' ? []
  : q.type === 'chooseOption' ? q.options[0]?.key : q.type === 'chooseCards' ? q.from.slice(0, q.min || 0) : null};

test('a lookahead that resolves a delayed return moves only its own copy of the card', async () => {
  const {f, g, me, spock} = await blinkedCommander();
  const sim = M.cloneGameForAISimulation(g, 7);
  for (const player of sim.players) player.controller = quiet;
  sim.phase = 'end';
  await sim.emit('endStep', {player: sim.players[me.idx]});
  await settle(sim);
  const copy = sim.battlefield.find(c => c.iid === spock.iid);
  assert.ok(copy && copy !== spock, 'the simulation returned its own copy');
  assert.equal(spock.zone, 'exile', 'the live card stays in exile');
  assert.ok(me.exile.includes(spock));
  assert.equal(g.battlefield.includes(spock), false);
  assert.equal(sim.battlefield.includes(spock), false, 'no live card on the simulated battlefield');

  await event(f, 'endStep', {player: me});
  assert.equal(spock.zone, 'battlefield', 'the real end step returns it');
  assert.ok(g.battlefield.includes(spock));
  assert.ok(g.log.some(row => /puts Commander Spock onto the battlefield/.test(row.msg)));
});

test('live cards and players passed to state-changing methods inside a simulation stand for their copies', async () => {
  const {g, me, spock} = await blinkedCommander();
  const sim = M.cloneGameForAISimulation(g, 11), simMe = sim.players[me.idx];
  const life = me.life;
  await sim.gainLife(me, 5);
  await sim.move(spock, 'graveyard');
  await sim.draw(me, 1);
  assert.equal(me.life, life, 'the live player keeps its life');
  assert.equal(simMe.life, life + 5);
  assert.equal(spock.zone, 'exile', 'the live card keeps its zone');
  assert.ok(simMe.graveyard.some(c => c.iid === spock.iid));
  assert.equal(sim.simulationObject(spock).zone, 'graveyard');
  // A nested lookahead translates through both generations.
  const nested = M.cloneGameForAISimulation(sim, 13);
  assert.equal(nested.simulationObject(spock).zone, 'graveyard');
  assert.notEqual(nested.simulationObject(spock), sim.simulationObject(spock));
  // A live game never translates.
  assert.equal(g.simulationObject(spock), spock);
});
