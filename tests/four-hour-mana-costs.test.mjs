import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function fixture() {
  const game = new M.Game({seed: 10102026, paced: false});
  game.speedFactor = 0;
  const f = {game, decisions: [], pick: null};
  const decide = async (g, q) => {
    f.decisions.push(q);
    const selected = f.pick?.(g, q);
    if (selected !== undefined) return selected;
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options.find(o => o.key === 'G' || o.mana?.G)?.key || q.options[0]?.key;
    if (q.type === 'chooseX') return q.min || 0;
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    return null;
  };
  const me = game.addPlayer('Native payer', {name: 'Native mana audit'}, {decide}, false);
  const rival = game.addPlayer('Rival', {name: 'Rival'}, {decide}, false);
  game.turnPlayer = me; game.turnNo = 9; game.phase = 'main1'; game.step = 'main';
  const put = (name, zone = 'battlefield', owner = me) => {
    assert.ok(M.DEFS[name], `native definition: ${name}`);
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.ctrl = owner; card.sick = false;
    (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card);
    game.recalc(); return card;
  };
  for (const p of [me, rival]) for (let i = 0; i < 12; i++) put('Forest', 'library', p);
  const settled = async () => {
    let limit = 30;
    while ((game.stack.length || game.pendingTriggers.length) && limit--) {
      await game.flushTriggers();
      if (game.stack.length) await game.resolveTop();
    }
    assert.ok(limit > 0, 'native stack settles');
    assertGameStateInvariants(game);
  };
  return Object.assign(f, {me, rival, put, settled});
}

async function chosenLandBlink(f, name) {
  const elf = f.put('Llanowar Elves', 'hand'), bear = f.put('Grizzly Bears', 'hand');
  const land = f.put(name, 'hand');
  f.pick = (_g, q) => q.type === 'chooseOption' && q.options.some(o => o.key === 'Elf') ? 'Elf' : undefined;
  assert.equal(await f.game.playLand(f.me, land), true);
  const producer = f.game.manaSources(f.me).find(row => row.card === land && row.m.restrict);
  assert.ok(producer); assert.equal(await f.game.activateManaSource(f.me, producer, producer.produce[0], null, ['G']), true);
  assert.equal(f.me.pool.G, 1);
  const blank = f.put('Ornithopter');
  const blink = f.put('Ghostly Flicker', 'hand');
  const lands = [f.put('Island'), f.put('Wastes'), f.put('Wastes')];
  f.pick = (_g, q) => q.type === 'chooseTargets' ? [land, blank] :
    q.type === 'chooseOption' && q.options.some(o => o.key === 'Bear') ? 'Bear' : undefined;
  assert.equal(await f.game.castSpell(f.me, blink, {from: 'hand'}), true);
  await f.settled(); assert.ok(lands.every(c => c.tapped));
  assert.equal(land.meta.chosenType, 'Bear');
  const colorless = f.game.manaSources(f.me).find(row => row.card === land && !row.m.restrict);
  assert.ok(colorless); assert.equal(await f.game.activateManaSource(f.me, colorless, colorless.produce[0]), true);
  assert.equal(land.tapped, true); assert.equal(f.me.pool.C, 1); assert.equal(f.me.pool.G, 1);
  return {land, elf, bear};
}

for (const name of ['Unclaimed Territory', 'Secluded Courtyard']) {
  test(`${name}: old floating mana still casts its originally chosen Elf after a native land blink`, async () => {
    const f = fixture(), {elf} = await chosenLandBlink(f, name);
    assert.ok(f.game.castableList(f.me).some(e => e.card === elf));
    assert.equal(await f.game.castSpell(f.me, elf, {from: 'hand'}), true);
    await f.settled(); assert.equal(elf.zone, 'battlefield'); assert.equal(f.me.pool.G, 0); assert.equal(f.me.pool.C, 1);
  });
  test(`${name}: a new Bear choice cannot relabel mana already produced for Elf spells`, async () => {
    const f = fixture(), {bear} = await chosenLandBlink(f, name);
    const offered = f.game.castableList(f.me).some(e => e.card === bear);
    assert.equal(await f.game.castSpell(f.me, bear, {from: 'hand'}), false);
    assert.equal(bear.zone, 'hand'); assert.equal(f.me.pool.G, 1); assert.equal(f.me.pool.C, 1);
    await f.settled(); assert.equal(offered, false);
  });
}

async function chosenPillarBlink(f) {
  const elf = f.put('Llanowar Elves', 'hand'), bear = f.put('Grizzly Bears', 'hand');
  const pillar = f.put('Pillar of Origins', 'hand');
  const paymentLands = [f.put('Wastes'), f.put('Wastes')];
  f.pick = (_g, q) => q.type === 'chooseOption' && q.options.some(o => o.key === 'Elf') ? 'Elf' : undefined;
  assert.equal(await f.game.castSpell(f.me, pillar, {from: 'hand'}), true);
  await f.settled(); assert.ok(paymentLands.every(c => c.tapped));
  let row = f.game.manaSources(f.me).find(s => s.card === pillar);
  assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0], null, ['G']), true);
  const blank = f.put('Ornithopter'), blink = f.put('Ghostly Flicker', 'hand');
  const lands = [f.put('Island'), f.put('Wastes'), f.put('Wastes')];
  f.pick = (_g, q) => q.type === 'chooseTargets' ? [pillar, blank] :
    q.type === 'chooseOption' && q.options.some(o => o.key === 'Bear') ? 'Bear' : undefined;
  assert.equal(await f.game.castSpell(f.me, blink, {from: 'hand'}), true);
  await f.settled(); assert.ok(lands.every(c => c.tapped)); assert.equal(pillar.meta.lcType, 'Bear');
  row = f.game.manaSources(f.me).find(s => s.card === pillar);
  assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0], null, ['G']), true);
  assert.equal(f.me.pool.G, 2); assert.equal(pillar.tapped, true);
  return {elf, bear};
}

test('Pillar of Origins: two incarnations keep distinct Elf and Bear mana restrictions', async () => {
  const f = fixture(), {elf} = await chosenPillarBlink(f);
  assert.equal(await f.game.castSpell(f.me, elf, {from: 'hand'}), true);
  await f.settled(); assert.equal(elf.zone, 'battlefield'); assert.equal(f.me.pool.G, 1);
});

test('Pillar of Origins: a Bear cannot spend the old incarnation\'s Elf-only mana for generic cost', async () => {
  const f = fixture(), {bear} = await chosenPillarBlink(f);
  const offered = f.game.castableList(f.me).some(e => e.card === bear);
  assert.equal(await f.game.castSpell(f.me, bear, {from: 'hand'}), false);
  assert.equal(bear.zone, 'hand'); assert.equal(f.me.pool.G, 2); await f.settled(); assert.equal(offered, false);
});

async function chosenThroneBlink(f) {
  const throne = f.put('Throne of Eldraine', 'hand');
  const paymentLands = Array.from({length: 5}, () => f.put('Wastes'));
  f.pick = (_g, q) => q.type === 'chooseOption' && q.options.some(o => o.key === 'G') ? 'G' : undefined;
  assert.equal(await f.game.castSpell(f.me, throne, {from: 'hand'}), true);
  await f.settled(); assert.ok(paymentLands.every(c => c.tapped));
  const row = f.game.manaSources(f.me).find(s => s.card === throne);
  assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0]), true);
  assert.equal(f.me.pool.G, 4);
  const blank = f.put('Ornithopter'), blink = f.put('Ghostly Flicker', 'hand');
  [f.put('Island'), f.put('Wastes'), f.put('Wastes')];
  f.pick = (_g, q) => q.type === 'chooseTargets' ? [throne, blank] :
    q.type === 'chooseOption' && q.options.some(o => o.key === 'R') ? 'R' : undefined;
  assert.equal(await f.game.castSpell(f.me, blink, {from: 'hand'}), true);
  await f.settled(); assert.equal(throne.meta.cslColor, 'R');
  const twiddle = f.put('Twiddle', 'hand'); f.put('Island');
  f.pick = (_g, q) => q.type === 'chooseTargets' ? [throne] :
    q.type === 'chooseOption' && q.options.some(o => o.key === 'tap') ? 'tap' : undefined;
  assert.equal(await f.game.castSpell(f.me, twiddle, {from: 'hand'}), true);
  await f.settled(); assert.equal(throne.tapped, true); assert.equal(f.me.pool.G, 4);
  return throne;
}

test('Throne of Eldraine: old green mana keeps paying green spells after a red re-entry choice', async () => {
  const f = fixture(); await chosenThroneBlink(f);
  const spell = f.put('Harmonize', 'hand'), before = f.me.library.length;
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand'}), true);
  await f.settled(); assert.equal(f.me.pool.G, 0); assert.equal(f.me.library.length, before - 3);
});

test('Throne of Eldraine: a new red choice cannot allow old green mana to pay a red spell', async () => {
  const f = fixture(); await chosenThroneBlink(f);
  const mountain = f.put('Mountain'), target = f.put('Forest', 'battlefield', f.rival), spell = f.put('Stone Rain', 'hand');
  f.pick = (_g, q) => q.type === 'chooseTargets' ? [target] : undefined;
  const offered = f.game.castableList(f.me).some(e => e.card === spell);
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand'}), false);
  assert.equal(spell.zone, 'hand'); assert.equal(target.zone, 'battlefield'); assert.equal(mountain.tapped, false);
  assert.equal(f.me.pool.G, 4); await f.settled(); assert.equal(offered, false);
});

test('Pillar of Origins: floating Elf-only mana cannot cast Birchlore Rangers face down', async () => {
  const f = fixture(), spell = f.put('Birchlore Rangers', 'hand'), pillar = f.put('Pillar of Origins', 'hand');
  const paymentLands = [f.put('Wastes'), f.put('Wastes')];
  f.pick = (_g, q) => q.type === 'chooseOption' && q.options.some(o => o.key === 'Elf') ? 'Elf' : undefined;
  assert.equal(await f.game.castSpell(f.me, pillar, {from: 'hand'}), true);
  await f.settled(); assert.ok(paymentLands.every(c => c.tapped));
  const row = f.game.manaSources(f.me).find(s => s.card === pillar);
  assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0], null, ['G']), true);
  const lands = [f.put('Wastes'), f.put('Wastes')];
  const option = {faceDownCast: 'morph', altCostStr: '{3}', speed: 'sorcery', types: ['Creature']};
  const offered = f.game.castableList(f.me).some(e => e.card === spell && e.alt?.faceDownCast);
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand', alt: option}), false);
  assert.equal(spell.zone, 'hand'); assert.equal(f.me.pool.G, 1); assert.ok(lands.every(c => !c.tapped)); await f.settled(); assert.equal(offered, false);
});

for (const extraGoblin of [false, true]) test(`Goblin Grenade: mana and sacrifice costs reserve distinct Goblins (${extraGoblin ? 'two' : 'one'})`, async () => {
  const f = fixture(), prospector = f.put('Skirk Prospector');
  const extra = extraGoblin ? f.put('Goblin Cratermaker') : null;
  const spell = f.put('Goblin Grenade', 'hand');
  f.pick = (_g, q) => q.type === 'chooseTargets' ? [f.rival] : undefined;
  const offered = f.game.castableList(f.me).some(e => e.card === spell);
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand'}), extraGoblin);
  await f.settled(); assert.equal(f.rival.life, extraGoblin ? 35 : 40);
  assert.equal(prospector.zone, extraGoblin ? 'graveyard' : 'battlefield');
  if (extra) assert.equal(extra.zone, 'graveyard');
  assert.equal(Object.values(f.me.pool).reduce((n, value) => n + value, 0), 0);
  assert.equal(offered, extraGoblin, 'the action offer must account for both costs together');
});

test('Deadly Dispute: the sacrificed Sol Ring can tap for mana before being sacrificed', async () => {
  const f = fixture(), ring = f.put('Sol Ring'), swamp = f.put('Swamp'), spell = f.put('Deadly Dispute', 'hand');
  assert.ok(f.game.castableList(f.me).some(e => e.card === spell));
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand'}), true);
  await f.settled(); assert.equal(ring.zone, 'graveyard'); assert.equal(swamp.tapped, true);
  assert.equal(f.game.bf().filter(c => c.hasSub('Treasure')).length, 1);
  assert.equal(f.me.pool.C, 1);
});

for (const count of [2, 3]) test(`Deadly Dispute: ${count} native Treasures reserve the additional sacrifice before funding mana`, async () => {
  const f = fixture(), treasures = await f.game.makeTokens('treasure', f.me, {n: count});
  const spell = f.put('Deadly Dispute', 'hand'), before = f.me.library.length;
  assert.equal(treasures.length, count);
  const offered = f.game.castableList(f.me).some(e => e.card === spell);
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand'}), count === 3);
  await f.settled(); assert.equal(f.me.library.length, before - (count === 3 ? 2 : 0));
  if (count === 2) assert.ok(treasures.every(c => c.zone === 'battlefield'));
  else assert.ok(treasures.every(c => c.zone === 'ceased'));
  assert.equal(offered, count === 3, 'a Treasure cannot pay both a mana cost and an additional sacrifice');
});

for (const hasSwamp of [false, true]) test(`Village Rites: Blood Pet's mana and printed sacrifice costs remain distinct (${hasSwamp ? 'with land' : 'alone'})`, async () => {
  const f = fixture(), pet = f.put('Blood Pet'), spell = f.put('Village Rites', 'hand');
  const swamp = hasSwamp ? f.put('Swamp') : null;
  const offered = f.game.castableList(f.me).some(e => e.card === spell);
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand'}), hasSwamp);
  await f.settled(); assert.equal(pet.zone, hasSwamp ? 'graveyard' : 'battlefield');
  if (swamp) assert.equal(swamp.tapped, true);
  assert.equal(offered, hasSwamp, 'mana availability and the mandatory sacrifice share one payment plan');
});

for (const name of ['Unclaimed Territory', 'Secluded Courtyard', 'Pillar of Origins']) test(`${name}: Maskwood Nexus makes a face-down creature spell match its chosen Elf type`, async () => {
  const f = fixture(), nexus = f.put('Maskwood Nexus', 'hand');
  const nexusPayment = Array.from({length: 4}, () => f.put('Wastes'));
  assert.equal(await f.game.castSpell(f.me, nexus, {from: 'hand'}), true);
  await f.settled(); assert.ok(nexusPayment.every(c => c.tapped));
  const spell = f.put('Birchlore Rangers', 'hand'), source = f.put(name, 'hand');
  f.pick = (_g, q) => q.type === 'chooseOption' && q.options.some(o => o.key === 'Elf') ? 'Elf' : undefined;
  if (name === 'Pillar of Origins') {
    const payment = [f.put('Wastes'), f.put('Wastes')];
    assert.equal(await f.game.castSpell(f.me, source, {from: 'hand'}), true);
    await f.settled(); assert.ok(payment.every(c => c.tapped));
  } else assert.equal(await f.game.playLand(f.me, source), true);
  const row = f.game.manaSources(f.me).find(s => s.card === source && s.m.restrict);
  assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0], null, ['G']), true);
  const lands = [f.put('Wastes'), f.put('Wastes')];
  const entry = f.game.castableList(f.me).find(e => e.card === spell && e.alt?.faceDownCast);
  assert.ok(entry, 'Nexus modifies creature spells even when their own face-down characteristics contain no types');
  assert.equal(await f.game.castSpell(f.me, spell, {from: entry.from, alt: entry.alt}), true);
  await f.settled(); assert.ok(lands.every(c => c.tapped)); assert.equal(f.me.pool.G, 0);
  assert.equal(spell.faceDown, true); assert.equal(spell.hasSub('Elf'), true);
});

for (const ai of [false, true]) test(`Village Rites: ${ai ? 'native bot' : 'human'} preserves Blood Pet to fund mana and sacrifices the other creature`, async () => {
  const f = fixture(), pet = f.put('Blood Pet'), bear = f.put('Grizzly Bears');
  const spell = f.put('Village Rites', 'hand'), before = f.me.library.length;
  if (ai) {f.me.isAI = true; f.me.controller = new M.AIController(f.me, {difficulty: 'hard'});}
  else f.pick = (_g, q) => q.type === 'chooseCards' && q.from.includes(bear) ? [bear] : undefined;
  assert.ok(f.game.castableList(f.me).some(e => e.card === spell));
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand'}), true);
  await f.settled(); assert.equal(pet.zone, 'graveyard'); assert.equal(bear.zone, 'graveyard');
  assert.equal(f.me.library.length, before - 2); assert.equal(f.me.pool.B, 0);
});

for (const extra of [false, true]) test(`Tormenting Voice: Simian Spirit Guide cannot fund mana and be discarded (${extra ? 'with separate discard' : 'alone'})`, async () => {
  const f = fixture(), guide = f.put('Simian Spirit Guide', 'hand'), waste = f.put('Wastes');
  const discard = extra ? f.put('Ornithopter', 'hand') : null;
  const spell = f.put('Tormenting Voice', 'hand'), before = f.me.library.length;
  f.pick = (_g, q) => q.type === 'chooseCards' && discard && q.from.includes(discard) ? [discard] : undefined;
  const offered = f.game.castableList(f.me).some(e => e.card === spell);
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand'}), extra);
  await f.settled(); assert.equal(guide.zone, extra ? 'exile' : 'hand');
  assert.equal(waste.tapped, extra); assert.equal(f.me.library.length, before - (extra ? 2 : 0));
  if (discard) assert.equal(discard.zone, 'graveyard');
  assert.equal(Object.values(f.me.pool).reduce((sum, n) => sum + n, 0), 0);
  assert.equal(offered, extra);
});

for (const name of ['Smokebraider', 'Flamebraider', 'Primal Beyond']) for (const adventure of [false, true])
test(`${name}: Elemental-only mana ${adventure ? 'rejects the Scan the Clouds Adventure' : 'casts Tempest Hart as an Elemental'}`, async () => {
  const f = fixture(), spell = f.put('Tempest Hart // Scan the Clouds', 'hand'), source = f.put(name, name === 'Primal Beyond' ? 'hand' : 'battlefield');
  if (name === 'Primal Beyond') {
    f.pick = (_g, q) => q.type === 'chooseCards' && q.from.includes(spell) ? [spell] : undefined;
    assert.equal(await f.game.playLand(f.me, source), true); assert.equal(source.tapped, false);
    f.pick = null;
  }
  const row = f.game.manaSources(f.me).find(s => s.card === source && s.m.restrict);
  const color = adventure ? 'U' : 'G', count = name === 'Primal Beyond' ? 1 : 2;
  assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0], null, Array(count).fill(color)), true);
  const lands = name === 'Primal Beyond' && adventure ? [f.put('Island')] :
    adventure ? [] : Array.from({length: 4 - count}, () => f.put('Wastes'));
  const alt = adventure ? {adventure: true, ...spell.def.adventure} : undefined;
  const offered = f.game.castableList(f.me).some(e => e.card === spell && !!e.alt?.adventure === adventure);
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand', alt}), !adventure);
  await f.settled(); assert.equal(spell.zone, adventure ? 'hand' : 'battlefield');
  assert.equal(f.me.pool[color], adventure ? count : 0); assert.ok(lands.every(c => c.tapped === !adventure));
  assert.equal(offered, !adventure);
});

test('Gaea\'s Balance: twenty-four real Forests leave a payable five-land sacrifice and bounded native action generation', async () => {
  const f = fixture(), lands = Array.from({length: 24}, () => f.put('Forest')), spell = f.put('Gaea\'s Balance', 'hand');
  const began = performance.now(), entry = f.game.castableList(f.me).find(e => e.card === spell);
  assert.ok(entry); assert.ok(performance.now() - began < 2000, 'ordinary high-land-count native offers remain responsive');
  assert.equal(await f.game.castSpell(f.me, spell, {from: entry.from, alt: entry.alt}), true);
  await f.settled(); assert.equal(lands.filter(c => c.zone === 'graveyard').length, 5);
});

for (const count of [5, 6]) test(`Abhorrent Oculus: six-card graveyard cost uses the exact native minimum (${count} cards)`, async () => {
  const f = fixture(), cards = Array.from({length: count}, () => f.put('Forest', 'graveyard'));
  const lands = [f.put('Island'), f.put('Wastes'), f.put('Wastes')], spell = f.put('Abhorrent Oculus', 'hand');
  assert.equal(f.game.castableList(f.me).some(e => e.card === spell), count === 6);
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand'}), count === 6);
  await f.settled(); assert.ok(cards.every(c => c.zone === (count === 6 ? 'exile' : 'graveyard')));
  assert.ok(lands.every(c => c.tapped === (count === 6))); assert.equal(spell.zone, count === 6 ? 'battlefield' : 'hand');
});

for (const adventure of [false, true]) test(`Séance Board: a soul counter earned through the native end step funds ${adventure ? 'Petty Theft as an Instant Adventure' : 'Opt as a printed Instant'}`, async () => {
  const f = fixture(), board = f.put('Séance Board'), casualty = f.put('Ornithopter');
  const shock = f.put('Shock', 'hand'), spell = f.put(adventure ? 'Brazen Borrower' : 'Opt', 'hand'), target = f.put('Grizzly Bears', 'battlefield', f.rival);
  const mountain = f.put('Mountain'), island = f.put('Island');
  f.pick = (_g, q) => q.type === 'chooseTargets' && q.candidates.includes(casualty) ? [casualty] : undefined;
  assert.equal(await f.game.castSpell(f.me, shock, {from: 'hand'}), true);
  await f.settled(); assert.equal(casualty.zone, 'graveyard'); assert.equal(mountain.tapped, true);
  f.pick = null; await f.game.runEndStepV90(f.me); await f.settled();
  assert.equal(board.counters.soul, 1); assert.equal(f.game.phase, 'end');
  const row = f.game.manaSources(f.me).find(s => s.card === board);
  assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0], null, ['U']), true);
  f.pick = (_g, q) => q.type === 'chooseTargets' && q.candidates.includes(target) ? [target] : undefined;
  const entry = f.game.castableList(f.me).find(e => e.card === spell && !!e.alt?.adventure === adventure);
  const alt = adventure ? {adventure: true, ...spell.def.adventure} : undefined;
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand', alt}), true);
  await f.settled(); assert.ok(entry, 'the actual Instant spell has a native payable offer');
  assert.equal(target.zone, adventure ? 'hand' : 'battlefield'); assert.equal(island.tapped, adventure); assert.equal(f.me.pool.U, 0);
});

for (const bestow of [false, true]) test(`Codsworth, Handy Helper: Aura-or-Equipment mana casts ${bestow ? 'Boon Satyr with bestow' : 'Bonesplitter Equipment'}`, async () => {
  const f = fixture(), source = f.put('Codsworth, Handy Helper'), target = f.put('Grizzly Bears');
  const spell = f.put(bestow ? 'Boon Satyr' : 'Bonesplitter', 'hand');
  const row = f.game.manaSources(f.me).find(s => s.card === source && s.m.restrict);
  assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0]), true);
  const lands = bestow ? [f.put('Forest'), f.put('Forest'), f.put('Wastes')] : [];
  f.pick = (_g, q) => q.type === 'chooseTargets' && q.candidates.includes(target) ? [target] : undefined;
  const alt = bestow ? spell.def.altCosts.find(a => a.bestow) : undefined;
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand', alt}), true);
  await f.settled(); assert.equal(spell.zone, 'battlefield');
  if (bestow) {assert.equal(spell.attachedTo, target.iid); assert.equal(spell.hasSub('Aura'), true);}
  assert.ok(lands.every(c => c.tapped)); assert.equal(f.me.pool.W, bestow ? 0 : 1);
});

for (const morph of [false, true]) test(`Haven of the Spirit Dragon: Dragon-only mana ${morph ? 'rejects a face-down Shieldhide Dragon' : 'casts the face-up Dragon'}`, async () => {
  const f = fixture(), source = f.put('Haven of the Spirit Dragon'), spell = f.put('Shieldhide Dragon', 'hand');
  const row = f.game.manaSources(f.me).find(s => s.card === source && s.m.restrict);
  assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0], null, ['W']), true);
  const lands = Array.from({length: morph ? 2 : 5}, () => f.put('Wastes'));
  const alt = morph ? {faceDownCast: 'morph', altCostStr: '{3}', speed: 'sorcery', types: ['Creature']} : undefined;
  const offered = f.game.castableList(f.me).some(e => e.card === spell && !!e.alt?.faceDownCast === morph);
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand', alt}), !morph);
  await f.settled(); assert.equal(spell.zone, morph ? 'hand' : 'battlefield'); assert.equal(f.me.pool.W, morph ? 1 : 0);
  assert.ok(lands.every(c => c.tapped === !morph)); assert.equal(offered, !morph);
});

for (const adventure of [false, true]) test(`Plaza of Heroes: Legendary-only mana ${adventure ? 'rejects Birthright Boon Adventure' : 'casts Legendary Kellan'}`, async () => {
  const f = fixture(), source = f.put('Plaza of Heroes'), spell = f.put('Kellan, the Fae-Blooded // Birthright Boon', 'hand');
  const row = f.game.manaSources(f.me).find(s => s.card === source && s.m.restrict);
  const color = adventure ? 'W' : 'R';
  assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0], null, [color]), true);
  const lands = Array.from({length: adventure ? 1 : 2}, () => f.put('Wastes'));
  const alt = adventure ? {adventure: true, ...spell.def.adventure} : undefined;
  const offered = f.game.castableList(f.me).some(e => e.card === spell && !!e.alt?.adventure === adventure);
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand', alt}), !adventure);
  await f.settled(); assert.equal(spell.zone, adventure ? 'hand' : 'battlefield'); assert.equal(f.me.pool[color], adventure ? 1 : 0);
  assert.ok(lands.every(c => c.tapped === !adventure)); assert.equal(offered, !adventure);
});

for (const vibranium of [false, true]) for (const morph of [false, true]) test(`${vibranium ? 'Three native Vibranium tokens' : "Mishra's Workshop"}: Artifact-only mana ${morph ? 'rejects face-down Proteus Machine' : 'casts the Artifact face up'}`, async () => {
  const f = fixture(), spell = f.put('Proteus Machine', 'hand');
  let sources;
  if (vibranium) {
    for (const name of ["T'Challa, the Black Panther", "Shuri's Fabricator"]) {
      const creator = f.put(name, 'hand'), cost = M.parseCost(creator.def.cost);
      const basics = {W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest', C: 'Wastes'};
      const lands = [...Array.from({length: cost.generic}, () => f.put('Wastes')),
        ...cost.pips.map(pip => {assert.equal(pip.length, 1); return f.put(basics[pip[0]]);})];
      assert.equal(await f.game.castSpell(f.me, creator, {from: 'hand'}), true); await f.settled();
      assert.ok(lands.every(card => card.tapped));
    }
    sources = f.game.bf().filter(card => card.isToken && card.hasSub('Vibranium'));
    assert.equal(sources.length, 3); assert.ok(sources.every(card => card.tapped));
    const reversal = f.put('Dramatic Reversal', 'hand'), lands = [f.put('Island'), f.put('Wastes')];
    assert.equal(await f.game.castSpell(f.me, reversal, {from: 'hand'}), true); await f.settled();
    assert.ok(lands.every(card => card.tapped)); assert.ok(sources.every(card => !card.tapped));
  } else sources = [f.put("Mishra's Workshop")];
  for (const source of sources) {
    const row = f.game.manaSources(f.me).find(s => s.card === source && s.m.restrict);
    assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0]), true);
  }
  const alt = morph ? {faceDownCast: 'morph', altCostStr: '{3}', speed: 'sorcery', types: ['Creature']} : undefined;
  const offered = f.game.castableList(f.me).some(e => e.card === spell && !!e.alt?.faceDownCast === morph);
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand', alt}), !morph);
  await f.settled(); assert.equal(spell.zone, morph ? 'hand' : 'battlefield'); assert.equal(f.me.pool.C, morph ? 3 : 0);
  assert.equal(offered, !morph);
});

for (const name of ['Changeling Outcast', 'Kappa Tech-Wrecker', 'Llanowar Elves'])
test(`Turtle Lair: Ninja/Turtle-only mana uses active spell subtypes for ${name}`, async () => {
  const f = fixture(), source = f.put('Turtle Lair'), spell = f.put(name, 'hand');
  const color = name === 'Changeling Outcast' ? 'B' : 'G';
  const row = f.game.manaSources(f.me).find(s => s.card === source && s.m.restrict);
  assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0], null, [color]), true);
  const generic = name === 'Kappa Tech-Wrecker' ? f.put('Wastes') : null, payable = name !== 'Llanowar Elves';
  const offered = f.game.castableList(f.me).some(e => e.card === spell && !e.alt);
  assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand'}), payable);
  await f.settled(); assert.equal(spell.zone, payable ? 'battlefield' : 'hand'); assert.equal(f.me.pool[color], payable ? 0 : 1);
  if (generic) assert.equal(generic.tapped, true); assert.equal(offered, payable);
});

for (const name of ['Unclaimed Territory', 'Secluded Courtyard', 'Pillar of Origins']) test(`${name}: caster's Nexus gives an opponent-owned spell the chosen Bear type`, async () => {
  const f = fixture(), nexus = f.put('Maskwood Nexus', 'hand');
  const nexusPayment = Array.from({length: 4}, () => f.put('Wastes'));
  assert.equal(await f.game.castSpell(f.me, nexus, {from: 'hand'}), true);
  await f.settled(); assert.ok(nexusPayment.every(c => c.tapped));
  const spell = f.put('Llanowar Elves', 'library', f.rival), insight = f.put('Siphon Insight', 'hand');
  const insightPayment = [f.put('Island'), f.put('Swamp')];
  f.pick = (_g, q) => q.type === 'chooseTargets' && q.candidates.includes(f.rival) ? [f.rival] :
    q.type === 'chooseCards' && q.from.includes(spell) ? [spell] : undefined;
  assert.equal(await f.game.castSpell(f.me, insight, {from: 'hand'}), true);
  await f.settled(); assert.ok(insightPayment.every(c => c.tapped)); assert.equal(spell.zone, 'exile');
  f.put('Grizzly Bears', 'hand'); const source = f.put(name, 'hand');
  f.pick = (_g, q) => q.type === 'chooseOption' && q.options.some(o => o.key === 'Bear') ? 'Bear' : undefined;
  if (name === 'Pillar of Origins') {
    const payment = [f.put('Wastes'), f.put('Wastes')];
    assert.equal(await f.game.castSpell(f.me, source, {from: 'hand'}), true);
    await f.settled(); assert.ok(payment.every(c => c.tapped));
  } else assert.equal(await f.game.playLand(f.me, source), true);
  const row = f.game.manaSources(f.me).find(s => s.card === source && s.m.restrict);
  assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0], null, ['G']), true);
  const entry = f.game.castableList(f.me).find(e => e.card === spell);
  assert.ok(entry, 'the caster controls the future creature spell and supplies its Nexus characteristics');
  assert.equal(await f.game.castSpell(f.me, spell, {from: entry.from, alt: entry.alt}), true);
  await f.settled(); assert.equal(spell.ctrl, f.me); assert.equal(spell.zone, 'battlefield'); assert.equal(f.me.pool.G, 0);
});

test('Conspiracy gives a face-down creature spell the newly chosen Bear type', async () => {
  const f = fixture(), conspiracy = f.put('Conspiracy', 'hand');
  const payment = [f.put('Swamp'), f.put('Swamp'), ...Array.from({length: 3}, () => f.put('Wastes'))];
  f.pick = (_g, q) => q.type === 'chooseOption' && q.options.some(o => o.key === 'Bear') ? 'Bear' : undefined;
  assert.equal(await f.game.castSpell(f.me, conspiracy, {from: 'hand'}), true);
  await f.settled(); assert.ok(payment.every(c => c.tapped));
  const spell = f.put('Birchlore Rangers', 'hand'); f.put('Grizzly Bears', 'hand');
  const source = f.put('Unclaimed Territory', 'hand');
  assert.equal(await f.game.playLand(f.me, source), true);
  const row = f.game.manaSources(f.me).find(s => s.card === source && s.m.restrict);
  assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0], null, ['G']), true);
  const lands = [f.put('Wastes'), f.put('Wastes')];
  const entry = f.game.castableList(f.me).find(e => e.card === spell && e.alt?.faceDownCast);
  assert.ok(entry); assert.equal(await f.game.castSpell(f.me, spell, {from: entry.from, alt: entry.alt}), true);
  await f.settled(); assert.equal(spell.faceDown, true); assert.equal(spell.hasSub('Bear'), true);
  assert.ok(lands.every(c => c.tapped)); assert.equal(f.me.pool.G, 0);
});

async function stolenVarmintMana(f) {
  const varmint = f.put('Thieving Varmint'), gonti = f.put('Gonti, Canny Acquisitor');
  const hit = f.put('Grizzly Bears', 'library', f.rival), insight = f.put('Siphon Insight', 'hand');
  f.put('Island'); f.put('Swamp');
  f.pick = (_g, q) => q.type === 'chooseTargets' && q.candidates.includes(f.rival) ? [f.rival] :
    q.type === 'chooseCards' && q.from.includes(hit) ? [hit] : undefined;
  assert.equal(await f.game.castSpell(f.me, insight, {from: 'hand'}), true);
  await f.settled(); assert.equal(hit.zone, 'exile');
  f.pick = null;
  const action = f.game.activatableList(f.me).find(e => e.card === varmint && e.manaAbility);
  assert.ok(action); assert.equal(await f.game.activateAbility(f.me, action), true);
  assert.equal(f.me.life, 39); assert.equal(f.me.pool.G, 2);
  const ray = f.put('Ray of Command', 'hand', f.rival);
  [f.put('Island', 'battlefield', f.rival), ...Array.from({length: 3}, () => f.put('Wastes', 'battlefield', f.rival))];
  f.pick = (_g, q) => q.type === 'chooseTargets' && q.candidates.includes(varmint) ? [varmint] : undefined;
  assert.equal(await f.game.castSpell(f.rival, ray, {from: 'hand'}), true);
  await f.settled(); assert.equal(varmint.ctrl, f.rival);
  return {varmint, hit, gonti};
}

test('Thieving Varmint: floating mana retains the original payer after a native control change', async () => {
  const f = fixture(), {hit} = await stolenVarmintMana(f);
  const entry = f.game.castableList(f.me).find(e => e.card === hit);
  assert.ok(entry, 'the native Gonti permission and original Varmint mana remain usable');
  assert.equal(await f.game.castSpell(f.me, hit, {from: entry.from, alt: entry.alt}), true);
  await f.settled(); assert.equal(hit.zone, 'battlefield'); assert.equal(hit.ctrl, f.me); assert.equal(f.me.pool.G, 1);
});

test('Thieving Varmint: a rival gaining the source cannot make its old mana pay an owned spell', async () => {
  const f = fixture(); await stolenVarmintMana(f);
  const mine = f.put('Grizzly Bears', 'hand');
  const offered = f.game.castableList(f.me).some(e => e.card === mine);
  assert.equal(await f.game.castSpell(f.me, mine, {from: 'hand'}), false);
  assert.equal(mine.zone, 'hand'); assert.equal(f.me.pool.G, 2); await f.settled(); assert.equal(offered, false);
});

for (const name of ['Unclaimed Territory', 'Secluded Courtyard']) {
  for (const [cardName, type, mode, resources] of [
    ['Lovestruck Beast', 'Giant', 'adventure', []],
    ['Birchlore Rangers', 'Elf', 'faceDownCast', ['Wastes', 'Wastes']],
    ['Boon Satyr', 'Satyr', 'bestow', ['Wastes', 'Wastes', 'Wastes', 'Forest']],
  ]) test(`${name}: chosen-type mana rejects ${cardName}'s ${mode} spell characteristics`, async () => {
    const f = fixture(), spell = f.put(cardName, 'hand'), land = f.put(name, 'hand');
    f.pick = (_g, q) => q.type === 'chooseOption' && q.options.some(o => o.key === type) ? type : undefined;
    assert.equal(await f.game.playLand(f.me, land), true);
    const row = f.game.manaSources(f.me).find(s => s.card === land && s.m.restrict);
    assert.ok(row); assert.equal(await f.game.activateManaSource(f.me, row, row.produce[0], null, ['G']), true);
    resources.forEach(n => f.put(n)); f.put('Ornithopter');
    const option = mode === 'adventure' ? {adventure: true, ...spell.def.adventure} :
      mode === 'faceDownCast' ? {faceDownCast: 'morph', altCostStr: '{3}', speed: 'sorcery', types: ['Creature']} :
      spell.def.altCosts?.find(a => a.bestow);
    assert.ok(option, `${cardName} has its native ${mode} casting choice`);
    const offered = f.game.castableList(f.me).some(e => e.card === spell && e.alt?.[mode]);
    assert.equal(await f.game.castSpell(f.me, spell, {from: 'hand', alt: option}), false);
    assert.equal(spell.zone, 'hand'); assert.equal(f.me.pool.G, 1);
    assert.ok(resources.every((_, i) => !f.game.bf().filter(c => c !== land && c.is('Land'))[i]?.tapped));
    await f.settled(); assert.equal(offered, false,
      'the alternative spell is an untyped face-down creature or a noncreature spell');
  });
}
