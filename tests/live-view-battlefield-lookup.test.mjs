import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const plain = value => JSON.parse(JSON.stringify(value));

function table() {
  const game = new M.Game({seed: 19, paced: false});
  const host = game.addPlayer('Host', {name: 'Host deck'}, null, false);
  const guest = game.addPlayer('Guest', {name: 'Guest deck'}, null, false);
  host.onlineSeat = 0; guest.onlineSeat = 1;
  game.turnPlayer = host; game.phase = 'main1';
  const add = (name, zone = 'battlefield', definition = {}) => {
    const card = new M.CardInst({...M.DEFS[name], ...definition}, host);
    card.zone = zone;
    if (zone === 'battlefield') game.battlefield.push(card);
    else host[zone].push(card);
    return card;
  };
  const view = new M.OnlineArenaView();
  const sync = () => {
    game.recalc();
    view.update(plain(M.onlineGameViewFor(game, guest)), guest.onlineSeat);
  };
  return {game, view, add, sync};
}

test('Live creature subtype inspection works before combat without running a rules engine', () => {
  const {view, add, sync} = table();
  const giant = add('Hill Giant');
  sync();
  const projected = view.byIid(giant.iid);
  assert.notEqual(projected, giant);
  assert.equal(projected.hasSub('Vehicle'), false, 'ordinary creature rendering must not open view recovery');
  assert.equal(projected.hasSub('Giant'), true);
  assert.equal(typeof view.recalc, 'undefined', 'the presentation remains a read-only view');
});

test('Live definition lookup uses current public battlefield metadata and ignores phasing, other zones and hidden definitions', () => {
  const {game, view, add, sync} = table();
  const first = add('Hill Giant', 'battlefield', {lookupA: true});
  const second = add('Sol Ring', 'battlefield', {lookupB: 'present'});
  add('Wall of Omens', 'battlefield', {lookupA: false});
  const phased = add('Sol Ring', 'battlefield', {lookupA: true}); phased.phasedOut = true;
  add('Hill Giant', 'graveyard', {lookupA: true});
  const hidden = add('Hill Giant', 'battlefield', {lookupA: true}); hidden.faceDown = true;
  sync();
  const ids = (...keys) => Array.from(view.bfWithDef(...keys), card => card.iid);
  assert.deepEqual(ids('lookupA', 'lookupB'), [first.iid, second.iid]);
  assert.deepEqual(ids('missing'), []);
  assert.deepEqual(ids(), []);
  first.def = {...first.def, lookupA: false};
  phased.phasedOut = false;
  sync();
  assert.deepEqual(ids('lookupA'), [phased.iid], 'ordinary snapshot updates refresh matching sources');
  assert.equal(game.battlefield.includes(hidden), true, 'queries do not mutate authoritative state');
});
