import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

// A slow Station deck is judged by what its Spacecraft do now: the reminder
// text's charge counters are not a combo, a tier below its threshold is not
// an engine yet, and a stationed ship is a creature that can attack.
const M = loadEngine();
function table() {
  const game = new M.Game({seed: 3, paced: false});
  const bot = game.addPlayer('Bot', {name: 'bot'}, null, true);
  const station = game.addPlayer('Station', {name: 'station'}, null, true);
  const aggro = game.addPlayer('Aggro', {name: 'aggro'}, null, true);
  const put = (name, player, charge = 0, tapped = false) => {
    const card = new M.CardInst(M.DEFS[name], player);
    assert.ok(card.def, name);
    card.zone = 'battlefield'; card.ctrl = player; card.sick = false; card.tapped = tapped;
    if (charge) card.counters.charge = charge;
    game.battlefield.push(card); return card;
  };
  for (const player of [bot, station, aggro]) for (let i = 0; i < 5; i++) put('Plains', player);
  game.turnPlayer = bot; game.turnNo = 12; game.phase = 'main1'; game.step = 'main';
  const threat = player => { game.recalc(); return M.assessPlayerThreat(M.createBotPlayerView(game, bot.idx, null), bot.idx, player.idx); };
  return {game, bot, station, aggro, put, threat};
}

test('Station reminder text does not make a Spacecraft a combo piece; other charge-counter cards keep the role', () => {
  for (const name of ['Inspirit, Flagship Vessel', 'Uthros Research Craft', 'Pinnacle Kill-Ship', 'Exploration Broodship'])
    assert.equal(M.inferCardSemantics(M.DEFS[name]).roles.includes('combo-piece'), false, name);
  assert.equal(M.inferCardSemantics(M.DEFS['Everflowing Chalice']).roles.includes('combo-piece'), true);
});

test('a slow Station board with unstationed ships is less of a threat than a real attacking board', () => {
  const t = table();
  t.put('Inspirit, Flagship Vessel', t.station, 2); t.put('Uthros Research Craft', t.station);
  t.put('Pinnacle Kill-Ship', t.station, 3); t.put('Exploration Broodship', t.station, 1);
  t.put('Grizzly Bears', t.station, 0, true); t.put('Grizzly Bears', t.station, 0, true);
  t.put('Grizzly Bears', t.aggro); t.put('Hill Giant', t.aggro); t.put('Serra Angel', t.aggro);
  const station = t.threat(t.station), aggro = t.threat(t.aggro);
  assert.ok(station.totalScore < aggro.totalScore, `station ${station.totalScore} < aggro ${aggro.totalScore}`);
  assert.ok(station.engineProgress <= 4, `only Inspirit's unlocked 1+ tier is an engine (${station.engineProgress})`);
});

test('a ship below its first tier is no engine; reaching the tier makes it one', () => {
  const t = table();
  const ship = t.put('Inspirit, Flagship Vessel', t.station, 0);
  assert.equal(t.threat(t.station).engineProgress, 0);
  ship.counters.charge = 1;
  assert.ok(t.threat(t.station).engineProgress > 0);
});

test('a stationed Spacecraft counts as an attacking body', () => {
  const t = table();
  const ship = t.put('Inspirit, Flagship Vessel', t.station, 2);
  const before = t.threat(t.station).boardPower;
  ship.counters.charge = 8;
  t.game.recalc();
  assert.equal(ship.is('Creature'), true);
  assert.equal(t.threat(t.station).boardPower, before + ship.power);
});
