import test from 'node:test';
import assert from 'node:assert/strict';
import {M, cantripPosition} from './helpers/second-audit-ai-cantrip-fixtures.mjs';

async function ownMainWindow(f) {
  f.g.turnPlayer = f.a; f.g.phase = 'main2'; f.g.step = 'main';
  f.a.controller = new M.AIController(f.a, {difficulty: 'hard', style: 'balanced'});
  await f.g.mainPhase(f.a);
}

async function paidArchive(f, owner = f.a) {
  const card = f.put("Alhammarret's Archive", 'hand', owner);
  if (owner !== f.a) for (let i = 0; i < 5; i++) f.put('Wastes', 'battlefield', owner);
  const row = f.g.castableList(owner).find(entry => entry.card === card);
  assert.ok(row, 'printed Archive is a real paid native cast');
  assert.equal(await f.g.castSpell(owner, card, {from: row.from, alt: row.alt}), true);
  assert.equal(card.zone, 'battlefield');
  assert.equal(card.castMeta.manaSpent, 5);
  return card;
}

test('Paid Titania Song disables own paid Archive so a real bot safely pays Opt with one card', async t => {
  const f = await cantripPosition(2);
  const archive = await paidArchive(f);
  for (let i = 0; i < 4; i++) f.put('Forest', 'battlefield');
  const lands = f.g.lands(f.a).slice();
  const song = f.put("Titania's Song"); await f.cast(song);
  assert.equal(song.zone, 'battlefield'); assert.equal(song.castMeta.manaSpent, 4);
  assert.equal(archive.is('Creature'), true); assert.equal(archive.cur.abilitiesDisabled, true);
  assert.equal(archive.power, 5); assert.equal(archive.toughness, 5);
  t.diagnostic(JSON.stringify({archiveTypes: archive.cur.types, songTypes: song.cur.types,
    nonartifactLands: lands.map(card => ({name: card.name, zone: card.zone, types: card.cur.types}))}));
  assert.equal(song.is('Enchantment'), true); assert.equal(song.is('Creature'), false,
    'printed Song animates noncreature artifacts, so the enchantment itself stays unchanged');
  assert.equal(lands.every(card => card.zone === 'battlefield' && card.is('Land') && !card.is('Creature')), true,
    'printed Song preserves all nonartifact lands and their native mana abilities');
  const opt = f.put('Opt');
  f.a.controller = new M.AIController(f.a, {difficulty: 'hard', style: 'balanced'});
  const originalDecide = f.a.controller.decide.bind(f.a.controller);
  let offeredOpt = false;
  f.a.controller.decide = async (g, q) => {
    if (q.type === 'main') offeredOpt ||= g.castableList(f.a).some(row => row.card === opt);
    return originalDecide(g, q);
  };
  await f.g.runTurn();
  t.diagnostic(JSON.stringify({sourceDisabled: archive.cur.abilitiesDisabled, offeredOpt,
    choices: f.g.aiDecisionLog.map(row => row.chosen)}));
  assert.equal(offeredOpt, true, 'actual next-turn untap makes safe Opt really payable');
  assert.equal(f.a.lost, false); assert.equal(opt.zone, 'graveyard');
  assert.equal(opt.castMeta.manaSpent, 1); assert.equal(f.a.library.length, 0);
  assert.equal(f.a.turnState.drewThisTurn, 2, 'one normal initial draw and one paid Opt draw');
  f.clean();
});

test('A rival actual paid Archive leaves own bot Opt with one card safe', async () => {
  const f = await cantripPosition(1);
  f.g.turnPlayer = f.b; f.g.phase = 'main1'; f.g.step = 'main';
  const archive = await paidArchive(f, f.b);
  assert.equal(archive.ctrl === f.b, true); assert.equal(archive.cur.abilitiesDisabled, false);
  const opt = f.put('Opt'); await ownMainWindow(f);
  assert.equal(f.a.lost, false); assert.equal(opt.zone, 'graveyard');
  assert.equal(opt.castMeta.manaSpent, 1); assert.equal(f.a.library.length, 0);
  assert.equal(f.a.turnState.drewThisTurn, 2);
  f.clean();
});

test('Paid Archive exempts the next actual turn draw then native bot holds Opt that requires two cards', async () => {
  const f = await cantripPosition(2), archive = await paidArchive(f);
  const originalDecide = f.a.controller.decide.bind(f.a.controller);
  f.a.controller.decide = async (g, q) => ['attackers', 'blockers'].includes(q.type) ? [] : originalDecide(g, q);
  await f.g.runTurn();
  assert.equal(archive.zone, 'battlefield'); assert.equal(f.a.lost, false);
  assert.equal(f.a.turnState.drewThisTurn, 1); assert.equal(f.a.turnState._firstDrawDone, true);
  assert.equal(f.a.library.length, 1, 'printed first normal draw is not doubled');
  const opt = f.put('Opt'); await f.botWindow(true);
  assert.equal(f.a.lost, false); assert.equal(opt.zone, 'hand');
  assert.equal(f.a.library.length, 1, 'the next paid Opt would force two draws');
  f.clean();
});
