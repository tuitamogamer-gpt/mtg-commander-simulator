import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function setup({ ai = false } = {}) {
  const game = new MTG.Game({ seed: 92482, paced: false, maxTurns: 20 });
  const fixture = { game, attacks: [], blocks: [], mainWindows: [] };
  const decide = async (g, q) => {
    if (q.type === 'priority') return { kind: 'pass' };
    if (q.type === 'main') {
      fixture.mainWindows.push({ player: q.player, phase: g.phase, hand: q.player.hand.length, life: q.player.life });
      return { kind: 'done' };
    }
    if (q.type === 'attackers') return fixture.attacks;
    if (q.type === 'blockers') return fixture.blocks;
    if (q.type === 'combatReview') return [];
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'chooseOption') return q.options[0]?.key;
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
    return null;
  };
  fixture.players = Array.from({ length: 4 }, (_, i) => game.addPlayer(
    i ? `Opponent ${i}` : 'Scions', { name: 'Estinien test' }, { decide }, i ? true : ai,
  ));
  fixture.you = fixture.players[0];
  game.turnPlayer = fixture.you;
  game.turnNo = 21;
  game.phase = 'main1';
  for (const player of fixture.players) {
    for (let i = 0; i < 12; i++) zoneCard(player, 'Island', 'library');
  }
  return fixture;
}

function zoneCard(player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function permanent(f, name = 'Estinien Varlineau', player = f.you) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = 'battlefield';
  card.sick = false;
  f.game.battlefield.push(card);
  f.game.recalc();
  return card;
}

async function main(f, { precombat = false, additional = false, player = f.you } = {}) {
  f.game.phase = precombat ? 'main1' : 'main2';
  await f.game.emitMainPhase(player, { precombat, additional });
  await f.game.mainPhase(player);
  assert.equal(f.game.stack.length, 0, 'beginning-of-main triggers resolve before the main action window');
}

async function hit(f, source, player, amount = 3) {
  await f.game.damagePlayer(source, player, amount, { combat: true });
}

function result(f, cards, life = 40 - cards) {
  assert.equal(f.you.hand.length, cards, 'cards drawn');
  assert.equal(f.you.life, life, 'life after the trigger');
}

for (const ai of [false, true]) {
  test(`Estinien: ${ai ? 'AI' : 'human'} casts a noncreature, hits for 4, then draws 1 and loses 1 before main actions`, async () => {
    const f = setup({ ai });
    const estinien = permanent(f);
    await main(f, { precombat: true });
    const signet = zoneCard(f.you, 'Arcane Signet', 'hand');
    assert.equal(await f.game.castSpell(f.you, signet, { free: true }), true);
    await f.game.priorityRound(f.you);
    assert.equal(estinien.power, 4);
    assert.equal(estinien.kw('flying'), true);
    f.attacks = [{ card: estinien, target: f.players[1] }];
    await f.game.combatPhase(f.you);
    assert.equal(f.players[1].life, 36);
    result(f, 0);
    await main(f);
    result(f, 1);
    assert.equal(estinien.tapped, true);
    assert.deepEqual(f.mainWindows.at(-1), { player: f.you, phase: 'main2', hand: 1, life: 39 });
  });
}

test('Estinien counts each opponent once across Dragons, double strike and multiple attackers', async () => {
  const f = setup(), estinien = permanent(f);
  const dragon = permanent(f, 'Hraesvelgr of the First Brood');
  MTG.E.grantUntilEOT(f.game, estinien, ['double strike']);
  await main(f, { precombat: true });
  f.attacks = [{ card: estinien, target: f.players[1] }, { card: dragon, target: f.players[1] }];
  await f.game.combatPhase(f.you);
  await hit(f, dragon, f.players[2]);
  await hit(f, dragon, f.players[3]);
  await main(f);
  result(f, 3);
});

test('Estinien does not count noncombat damage, non-Dragons or damage to a planeswalker', async () => {
  const f = setup(), estinien = permanent(f);
  const bear = permanent(f, 'Grizzly Bears');
  const walker = permanent(f, 'Jace Beleren', f.players[3]);
  walker.counters.loyalty = 5;
  await main(f, { precombat: true });
  await f.game.damagePlayer(estinien, f.players[1], 3);
  await hit(f, bear, f.players[2]);
  await f.game.damageCreature(estinien, walker, 3, { combat: true });
  await main(f);
  result(f, 0);
});

test('Estinien does not draw when combat damage is prevented', async () => {
  const f = setup(), estinien = permanent(f);
  await main(f, { precombat: true });
  f.game.untilEffects.push({ kind: 'preventAllCombat', expires: 'eot' });
  f.attacks = [{ card: estinien, target: f.players[1] }];
  await f.game.combatPhase(f.you);
  assert.equal(f.players[1].life, 40);
  await main(f);
  result(f, 0);
});

for (const trample of [false, true]) {
  test(`Blocked Estinien ${trample ? 'counts trample damage that reaches the opponent' : 'does not draw for damage to the blocker'}`, async () => {
    const f = setup(), estinien = permanent(f);
    const blocker = permanent(f, 'Grizzly Bears', f.players[1]);
    if (trample) MTG.E.grantUntilEOT(f.game, estinien, ['trample']);
    await main(f, { precombat: true });
    f.attacks = [{ card: estinien, target: f.players[1] }];
    f.blocks = [{ blocker, attacker: estinien }];
    await f.game.combatPhase(f.you);
    assert.equal(blocker.zone, 'graveyard');
    assert.equal(f.players[1].life, trample ? 39 : 40);
    await main(f);
    result(f, trample ? 1 : 0);
  });
}

test('Estinien does not trigger in an opponent main phase or on entering during main 2', async () => {
  const f = setup(), estinien = permanent(f);
  await hit(f, estinien, f.players[1]);
  await main(f, { precombat: true, player: f.players[1] });
  await main(f, { player: f.players[1] });
  result(f, 0);
  await f.game.move(estinien, 'hand');
  await main(f, { precombat: true });
  await main(f);
  await f.game.putPermanentOntoBattlefield(estinien, f.you);
  await f.game.priorityRound(f.you);
  result(f, 0);
});

test('Estinien counts a Dragon hit from before Estinien entered the battlefield', async () => {
  const f = setup(), dragon = permanent(f, 'Hraesvelgr of the First Brood');
  await main(f, { precombat: true });
  await hit(f, dragon, f.players[1]);
  permanent(f);
  await main(f);
  result(f, 1);
});

test('Estinien triggers only at the second main, including when it is an additional phase', async () => {
  const f = setup(), estinien = permanent(f);
  await main(f, { precombat: true });
  await hit(f, estinien, f.players[1]);
  f.game.scheduleAdditionalPhases(['main']);
  await f.game.runAdditionalPhases(f.you);
  result(f, 1);
  await main(f);
  result(f, 1);
});

test('Estinien uses Dragon status at damage time after Eye of Nidhogg leaves', async () => {
  const f = setup();
  permanent(f);
  const bear = permanent(f, 'Grizzly Bears');
  const eye = permanent(f, 'Eye of Nidhogg');
  await f.game.attach(eye, bear);
  await main(f, { precombat: true });
  assert.equal(bear.hasSub('Dragon'), true);
  await hit(f, bear, f.players[1]);
  await f.game.move(eye, 'exile');
  assert.equal(bear.hasSub('Dragon'), false);
  await main(f);
  result(f, 1);
});

test('Estinien does not count a creature that only becomes a Dragon after dealing damage', async () => {
  const f = setup();
  permanent(f);
  const bear = permanent(f, 'Grizzly Bears');
  await main(f, { precombat: true });
  await hit(f, bear, f.players[1]);
  const eye = permanent(f, 'Eye of Nidhogg');
  await f.game.attach(eye, bear);
  assert.equal(bear.hasSub('Dragon'), true);
  await main(f);
  result(f, 0);
});

test('Estinien remembers Dragon damage granted by Maskwood Nexus after the source dies', async () => {
  const f = setup();
  permanent(f);
  const bear = permanent(f, 'Grizzly Bears');
  permanent(f, 'Maskwood Nexus');
  await main(f, { precombat: true });
  assert.equal(bear.hasSub('Dragon'), true);
  await hit(f, bear, f.players[1]);
  await f.game.destroy(bear);
  assert.equal(bear.hasSub('Dragon'), false);
  await main(f);
  result(f, 1);
});

test('Estinien counts qualifying damage dealt under another controller earlier in the turn', async () => {
  const f = setup(), estinien = permanent(f, 'Estinien Varlineau', f.players[2]);
  const dragon = permanent(f, 'Hraesvelgr of the First Brood', f.players[2]);
  await main(f, { precombat: true });
  await hit(f, estinien, f.players[1]);
  await hit(f, dragon, f.players[3]);
  estinien.ctrl = f.you;
  f.game.recalc();
  await main(f);
  result(f, 2);
});

test('Estinien excludes its controller and opponents who have left the game', async () => {
  const f = setup(), estinien = permanent(f);
  await main(f, { precombat: true });
  // The central damage API also handles redirected combat damage.
  await hit(f, estinien, f.you, 1);
  f.players[1].life = 3;
  await hit(f, estinien, f.players[1]);
  assert.equal(f.players[1].lost, true);
  await main(f);
  result(f, 0, 39);
});

test('Blinking Estinien before main 2 does not credit the new object with the old object damage', async () => {
  const f = setup(), estinien = permanent(f);
  await main(f, { precombat: true });
  await hit(f, estinien, f.players[1]);
  await f.game.move(estinien, 'exile');
  await f.game.putPermanentOntoBattlefield(estinien, f.you);
  await main(f);
  result(f, 0);
});

test('An already stacked Estinien trigger still resolves after Estinien leaves', async () => {
  const f = setup(), estinien = permanent(f);
  await main(f, { precombat: true });
  await hit(f, estinien, f.players[1]);
  f.game.phase = 'main2';
  await f.game.emitMainPhase(f.you);
  await f.game.flushTriggers();
  assert.equal(f.game.stack.length, 1);
  await f.game.move(estinien, 'exile');
  await f.game.putPermanentOntoBattlefield(estinien, f.you);
  await f.game.priorityRound(f.you);
  result(f, 1);
});

test('Estinien does not reuse combat hits on the next turn', async () => {
  const f = setup(), estinien = permanent(f);
  await main(f, { precombat: true });
  await hit(f, estinien, f.players[1]);
  await main(f);
  result(f, 1);
  await f.game.runTurn();
  result(f, 2, 39); // Only the normal draw-step card on the following turn.
  assert.equal(f.you.turnState.combatDamageHits.length, 0);
});
