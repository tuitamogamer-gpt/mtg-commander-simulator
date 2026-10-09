import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

// Actual runtime definitions and paid casting/entry/priority/search paths run.
// Only the initial position and player decisions are supplied; no card rules,
// costs, static effects, cast method, or priority method are replaced.
function fixture() {
  const game = new M.Game({seed: 10102026, paced: false});
  game.speedFactor = 0;
  const state = {type: 'Goblin', wanted: null, questions: []};
  const decide = async (g, q) => {
    state.questions.push(q);
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'main') return {kind: 'done'};
    if (q.type === 'chooseOption') return q.options.find(o => o.key === state.type)?.key
      || q.options.find(o => o.key === 'yes')?.key || q.options[0]?.key;
    if (q.type === 'chooseTargets') {
      const wanted = q.candidates.find(c => c === state.wanted || c.iid === state.wanted?.iid);
      return wanted ? [wanted] : q.candidates.slice(0, q.min || 0);
    }
    if (q.type === 'chooseCards') {
      const wanted = q.from.find(c => c === state.wanted || c.iid === state.wanted?.iid);
      return wanted ? [wanted] : q.from.slice(0, q.min || 0);
    }
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (q.type === 'chooseX') return q.min || 0;
    if (q.type === 'attackers' && state.attack) return [state.attack];
    if (['attackers', 'blockers', 'combatReview'].includes(q.type)) return [];
    return null;
  };
  const players = ['You', 'Rival', 'Rival 2', 'Rival 3'].map(name =>
    game.addPlayer(name, {name}, {decide}, false));
  const [me, rival] = players;
  game.turnPlayer = me; game.turnNo = 10; game.phase = 'main1'; game.step = 'main';
  const put = (name, zone = 'battlefield', owner = me) => {
    assert.ok(M.DEFS[name], `real card definition: ${name}`);
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.ctrl = owner; card.sick = false;
    if (zone === 'battlefield') game.battlefield.push(card); else owner[zone].push(card);
    game.recalc(); return card;
  };
  for (const player of players) for (let i = 0; i < 8; i++) put('Forest', 'library', player);
  const paid = async (name, {command = false} = {}) => {
    const card = put(name, command ? 'command' : 'hand');
    if (command) { card.commander = true; me.commanders.push(card); }
    const lands = [];
    for (const [, symbol] of card.def.cost.matchAll(/\{([^}]+)\}/g)) {
      if (/^\d+$/.test(symbol)) for (let i = 0; i < Number(symbol); i++) lands.push(put('Wastes'));
      else lands.push(put({W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest'}[symbol]));
    }
    assert.equal(await game.castSpell(me, card, {from: command ? 'command' : 'hand'}), true, `${name}: native paid cast`);
    assert.equal(card.zone, 'battlefield', `${name}: native priority resolves the spell`);
    assert.ok(lands.some(c => c.tapped), `${name}: real land mana was spent`);
    for (const land of lands) await game.move(land, 'exile');
    return card;
  };
  const finished = () => {
    assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0);
    assertGameStateInvariants(game);
  };
  return {game, me, rival, players, state, put, paid, finished};
}

for (const sourceName of ['Maskwood Nexus', 'Arcane Adaptation']) {
  test(`${sourceName}: a real paid grant enables native Horde of Notions graveyard casting`, async () => {
    const f = fixture(); f.state.type = 'Elemental';
    const source = await f.paid(sourceName), horde = await f.paid('Horde of Notions');
    const target = f.put('Grizzly Bears', 'graveyard'); f.state.wanted = target;
    ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].forEach(n => f.put(n));
    const entry = f.game.activatableList(f.me).find(e => e.card === horde);
    assert.ok(entry, 'Horde has a legal target through the shared native ability list');
    assert.equal(await f.game.activateAbility(f.me, entry, [target]), true);
    assert.equal(target.zone, 'battlefield', 'the granted Elemental is actually cast and resolves');
    await f.game.move(source, 'exile');
    assert.equal(target.hasSub('Elemental'), false, 'source removal stops the grant');
    f.finished();
  });

  test(`${sourceName}: native Flamekin Harbinger can search a granted Elemental in the library`, async () => {
    const f = fixture(); f.state.type = 'Elemental'; await f.paid(sourceName);
    const target = f.put('Grizzly Bears', 'library'); f.put('Forest', 'library');
    f.state.wanted = target;
    await f.paid('Flamekin Harbinger');
    assert.equal(f.me.library.at(-1), target, 'native ETB search puts the chosen granted Elemental on top');
    assert.ok(f.state.questions.some(q => q.type === 'chooseCards' && q.from.includes(target)),
      'the native library search actually offered the card');
    f.finished();
  });

  test(`${sourceName}: native chosen-tribe mana pays for a creature card in hand`, async () => {
    const f = fixture(); f.state.type = 'Goblin';
    const target = f.put('Grizzly Bears', 'hand');
    f.put('Raging Goblin', 'hand'); // printed Goblin permits the land's real type choice
    const source = await f.paid(sourceName);
    const land = f.put('Unclaimed Territory', 'hand');
    assert.equal(await f.game.playLand(f.me, land), true);
    assert.equal(land.meta.chosenType, 'Goblin');
    const generic = f.put('Wastes');
    assert.equal(await f.game.castSpell(f.me, target, {from: 'hand'}), true);
    assert.equal(target.zone, 'battlefield');
    assert.equal(land.tapped, true); assert.equal(generic.tapped, true);
    await f.game.move(source, 'exile');
    const next = f.put('Grizzly Bears', 'hand'); land.tapped = false; generic.tapped = false;
    assert.equal(await f.game.castSpell(f.me, next, {from: 'hand'}), false,
      'after source removal Goblin-only colored mana cannot pay for a Bear');
    assert.equal(land.tapped, false); assert.equal(generic.tapped, false);
    f.finished();
  });

  test(`${sourceName}: the real entry grant follows printed scope and ends on removal`, async () => {
    const f = fixture(); f.state.type = 'Goblin';
    const source = await f.paid(sourceName);
    const own = ['hand', 'library', 'graveyard', 'exile', 'command'].map(zone => f.put('Grizzly Bears', zone));
    const foreign = f.put('Grizzly Bears', 'graveyard', f.rival), noncreature = f.put('Sol Ring', 'hand');
    for (const card of own) {
      assert.equal(card.hasSub('Goblin'), true, `${card.zone}: grant applies`);
      assert.equal(card.hasSub('Bear'), true, `${card.zone}: original subtype is retained`);
      assert.deepEqual([...card.colors], ['G']); assert.equal(card.mv, 2);
      assert.equal(card.hasSub('Equipment'), false);
    }
    assert.equal(foreign.hasSub('Goblin'), false); assert.equal(noncreature.hasSub('Goblin'), false);
    await f.game.move(source, 'exile');
    assert.ok(own.every(c => !c.hasSub('Goblin')), 'a source removed from battlefield grants nothing');
    assert.equal(M.DEFS['Grizzly Bears'].subtypes.includes('Goblin'), false, 'shared definitions remain unchanged');
    f.finished();
  });

  for (const grantIsLater of [false, true]) {
    test(`${sourceName}: native Horde target legality respects ${grantIsLater ? 'grant after replacement' : 'replacement after grant'} timestamps`, async () => {
      const f = fixture();
      if (grantIsLater) { f.state.type = 'Elf'; await f.paid('Conspiracy'); }
      f.state.type = 'Elemental'; await f.paid(sourceName);
      if (!grantIsLater) { f.state.type = 'Elf'; await f.paid('Conspiracy'); }
      const horde = await f.paid('Horde of Notions'), target = f.put('Grizzly Bears', 'graveyard');
      f.state.wanted = target;
      const lands = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].map(n => f.put(n));
      const entry = f.game.activatableList(f.me).find(e => e.card === horde);
      assert.equal(!!entry, grantIsLater, 'type layers use source timestamps across zones');
      if (grantIsLater) {
        assert.equal(await f.game.activateAbility(f.me, entry, [target]), true);
        assert.equal(target.zone, 'battlefield'); assert.ok(lands.every(c => c.tapped));
      } else {
        assert.equal(target.zone, 'graveyard'); assert.ok(lands.every(c => !c.tapped));
      }
      f.finished();
    });
  }

  test(`${sourceName}: a real Song of the Dryads suppresses outside grants and removal restores native casting`, async () => {
    const f = fixture(); f.state.type = 'Elemental';
    const source = await f.paid(sourceName), horde = await f.paid('Horde of Notions');
    const target = f.put('Grizzly Bears', 'graveyard');
    f.state.wanted = source; const song = await f.paid('Song of the Dryads');
    assert.equal(song.attachedTo, source.iid); assert.equal(source.cur.abilitiesDisabled, true);
    const lands = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].map(n => f.put(n));
    assert.equal(f.game.activatableList(f.me).some(e => e.card === horde), false,
      'the suppressed source cannot supply a graveyard target');
    assert.equal(target.hasSub('Elemental'), false);
    await f.game.move(song, 'exile'); f.state.wanted = target;
    assert.equal(source.cur.abilitiesDisabled, false);
    const entry = f.game.activatableList(f.me).find(e => e.card === horde);
    assert.ok(entry); assert.equal(await f.game.activateAbility(f.me, entry, [target]), true);
    assert.equal(target.zone, 'battlefield'); assert.ok(lands.every(c => c.tapped));
    f.finished();
  });
}

test('a native paid Sculpting Steel copy of Nexus retains outside grants after the original leaves', async () => {
  const f = fixture(), source = await f.paid('Maskwood Nexus');
  f.state.wanted = source; const copy = await f.paid('Sculpting Steel');
  assert.equal(copy.name, 'Maskwood Nexus', 'native entry copy persists after castSpell returns');
  await f.game.move(source, 'exile');
  const target = f.put('Grizzly Bears', 'graveyard'), horde = await f.paid('Horde of Notions');
  f.state.wanted = target;
  ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].forEach(n => f.put(n));
  const entry = f.game.activatableList(f.me).find(e => e.card === horde);
  assert.ok(entry, 'the native copied definition retains the semantic outside-grant marker');
  assert.equal(await f.game.activateAbility(f.me, entry, [target]), true);
  assert.equal(target.zone, 'battlefield'); await f.game.move(copy, 'exile');
  assert.equal(target.hasSub('Elemental'), false); f.finished();
});

test('Conspiracy replacement prevents Ancient Cellarspawn from discounting a Changeling as Demon/Horror/Nightmare', async () => {
  const f = fixture(); f.state.type = 'Goblin';
  await f.paid('Conspiracy'); await f.paid('Ancient Cellarspawn');
  const target = f.put('Universal Automaton', 'hand');
  assert.equal(target.hasSub('Goblin'), true); assert.equal(target.hasSub('Demon'), false);
  assert.equal(await f.game.castSpell(f.me, target, {from: 'hand'}), false,
    'replacement removed Changeling, so zero mana cannot pay its generic one');
  assert.equal(target.zone, 'hand');
  const land = f.put('Wastes');
  assert.equal(await f.game.castSpell(f.me, target, {from: 'hand'}), true);
  assert.equal(land.tapped, true); assert.equal(target.zone, 'battlefield');
  f.finished();
});

test("Herald's Horn discounts a matching native Changeling spell", async () => {
  const f = fixture(); f.state.type = 'Elf'; f.put('Llanowar Elves', 'hand');
  await f.paid("Herald's Horn");
  const target = f.put('Universal Automaton', 'hand');
  assert.equal(await f.game.castSpell(f.me, target, {from: 'hand'}), true,
    'Elf Horn makes the matching one-mana Changeling spell free');
  assert.equal(target.zone, 'battlefield'); f.finished();
});

test('Door of Destinies charges on a matching native Changeling cast', async () => {
  const f = fixture(); f.state.type = 'Elf'; f.put('Llanowar Elves', 'hand');
  const door = await f.paid('Door of Destinies');
  const target = f.put('Universal Automaton', 'hand'); const land = f.put('Wastes');
  assert.equal(await f.game.castSpell(f.me, target, {from: 'hand'}), true);
  assert.equal(land.tapped, true); assert.equal(door.counters.charge, 1);
  assert.equal(target.power, 2); assert.equal(target.toughness, 2); f.finished();
});

test("Herald's Horn sees Conspiracy's removed printed tribe before actual payment", async () => {
  const f = fixture(); f.state.type = 'Goblin'; f.put('Raging Goblin', 'hand');
  await f.paid("Herald's Horn"); f.state.type = 'Elf'; await f.paid('Conspiracy');
  const target = f.put('Goblin Warchief', 'hand');
  const lands = [f.put('Mountain'), f.put('Mountain')];
  assert.equal(target.hasSub('Goblin'), false);
  assert.equal(await f.game.castSpell(f.me, target, {from: 'hand'}), false,
    'the former Goblin still costs three, so two Mountains do not pay');
  assert.ok(lands.every(c => !c.tapped));
  f.put('Wastes'); assert.equal(await f.game.castSpell(f.me, target, {from: 'hand'}), true);
  f.finished();
});

test('Door of Destinies ignores a printed tribe removed by a real Conspiracy cast', async () => {
  const f = fixture(); f.state.type = 'Goblin'; f.put('Raging Goblin', 'hand');
  const door = await f.paid('Door of Destinies');
  f.state.type = 'Elf'; await f.paid('Conspiracy');
  const target = f.put('Goblin Warchief', 'hand');
  ['Mountain', 'Mountain', 'Wastes'].forEach(n => f.put(n));
  assert.equal(await f.game.castSpell(f.me, target, {from: 'hand'}), true);
  assert.equal(door.counters.charge || 0, 0, 'Elf spell does not charge a Goblin Door');
  f.finished();
});

test("Herald's Horn's actual upkeep trigger retrieves a matching native Changeling from the library", async () => {
  const f = fixture(); f.state.type = 'Elf'; f.put('Llanowar Elves', 'hand');
  await f.paid("Herald's Horn");
  const target = f.put('Universal Automaton', 'library');
  await f.game.emit('upkeep', {player: f.me}); await f.game.priorityRound(f.me);
  assert.equal(target.zone, 'hand', 'the native reveal-and-put trigger recognizes Changeling');
  assert.ok(f.me.hand.includes(target)); f.finished();
});

test('Director Nick Fury discounts a matching Changeling, while an ordinary Bear keeps its printed cost', async () => {
  const f = fixture(); await f.paid('Director Nick Fury');
  const ordinary = f.put('Grizzly Bears', 'hand'), controlLand = f.put('Forest');
  assert.equal(await f.game.castSpell(f.me, ordinary, {from: 'hand'}), false,
    'an ordinary Bear still needs its second mana');
  assert.equal(controlLand.tapped, false); await f.game.move(controlLand, 'exile');
  const target = f.put('Universal Automaton', 'hand');
  assert.equal(await f.game.castSpell(f.me, target, {from: 'hand'}), true,
    'Changeling makes this a Hero spell and its one generic mana is discounted');
  assert.equal(target.zone, 'battlefield'); f.finished();
});

test('Folk Hero sees a Changeling cast after a nonmatching creature and draws only once per turn', async () => {
  const f = fixture(); await f.paid("Abdel Adrian, Gorion's Ward", {command: true});
  await f.paid('Folk Hero');
  const ordinary = await f.paid('Grizzly Bears'), before = f.me.library.length;
  assert.equal(ordinary.zone, 'battlefield');
  assert.equal(before, 8, 'nonmatching Bear cast did not consume the background trigger');
  const target = await f.paid('Universal Automaton');
  assert.equal(f.me.library.length, before - 1, 'Changeling shares Human and Warrior with the real commander');
  assert.ok(f.me.hand.length > 0); assert.equal(target.zone, 'battlefield');
  await f.paid('Universal Automaton');
  assert.equal(f.me.library.length, before - 1, 'a second matching cast does not bypass once-per-turn');
  f.finished();
});

test('Nexus types follow the controller of a native Etali spell, then stop in its foreign-owned graveyard', async () => {
  const f = fixture(); f.state.type = 'Elf'; f.put('Llanowar Elves', 'hand');
  await f.paid('Maskwood Nexus'); const door = await f.paid('Door of Destinies');
  const etali = await f.paid('Etali, Primal Storm'), before = door.counters.charge || 0;
  const foreign = f.put('Grizzly Bears', 'library', f.rival);
  f.state.attack = {card: etali, target: f.rival};
  await f.game.runTurn(f.me);
  assert.equal(foreign.zone, 'battlefield'); assert.equal(foreign.owner, f.rival);
  assert.equal(foreign.ctrl, f.me); assert.equal(foreign.castMeta.manaSpent, 0);
  assert.equal(door.counters.charge, before + 1, 'native foreign-owned Elf spell charges our Door');
  await f.game.move(foreign, 'graveyard');
  assert.equal(foreign.hasSub('Elf'), false, 'the same card in another owner graveyard receives no grant');
  f.finished();
});

test('Ashes of the Fallen changes the graveyard card without discounting its native Karador creature spell', async () => {
  const f = fixture(); f.state.type = 'Elf'; f.put('Llanowar Elves', 'hand');
  await f.paid('Ashes of the Fallen'); await f.paid("Herald's Horn");
  await f.paid('Karador, Ghost Chieftain');
  const target = f.put('Grizzly Bears', 'graveyard'), forest = f.put('Forest'), sampleGeneric = f.put('Wastes');
  assert.equal(target.hasSub('Elf'), true, 'the actual graveyard-only effect changes this card');
  const offer = f.game.castableList(f.me).find(row => row.card === target && row.alt?.cslMode === 'karador');
  assert.ok(offer, 'the native Karador permission offers the creature');
  await f.game.move(sampleGeneric, 'exile');
  assert.equal(await f.game.castSpell(f.me, target, {from: offer.from, alt: offer.alt}), false,
    'the creature spell is a Bear again and needs two mana');
  assert.equal(forest.tapped, false); assert.equal(target.zone, 'graveyard');
  const generic = f.put('Wastes');
  assert.equal(await f.game.castSpell(f.me, target, {from: offer.from, alt: offer.alt}), true);
  assert.equal(target.zone, 'battlefield'); assert.equal(target.hasSub('Elf'), false);
  assert.equal(forest.tapped, true); assert.equal(generic.tapped, true); f.finished();
});

test('native Gonti permission prices a foreign creature spell under our Nexus/Horn, with source removal control', async () => {
  for (const grantPresent of [true, false]) {
    const f = fixture(); f.state.type = 'Elf'; f.put('Llanowar Elves', 'hand');
    const source = await f.paid('Maskwood Nexus'); await f.paid("Herald's Horn");
    const foreign = f.put('Grizzly Bears', 'library', f.rival); f.state.wanted = foreign;
    await f.paid('Gonti, Lord of Luxury');
    assert.equal(foreign.zone, 'exile', 'the native Gonti trigger grants its actual exile permission');
    if (!grantPresent) await f.game.move(source, 'exile');
    assert.equal(foreign.hasSub('Elf'), false, 'foreign-owned exile card itself receives no own-card type grant');
    const forest = f.put('Forest'), sampleGeneric = f.put('Wastes');
    const offer = f.game.castableList(f.me).find(row => row.card === foreign);
    assert.ok(offer, 'native Gonti cast permission is presented');
    await f.game.move(sampleGeneric, 'exile');
    assert.equal(await f.game.castSpell(f.me, foreign, {from: offer.from, alt: offer.alt}), grantPresent,
      'with Nexus the proposed creature spell is an Elf and costs only green');
    assert.equal(forest.tapped, grantPresent);
    if (grantPresent) { assert.equal(foreign.zone, 'battlefield'); assert.equal(foreign.ctrl, f.me); }
    else {
      assert.equal(foreign.zone, 'exile'); const generic = f.put('Wastes');
      assert.equal(await f.game.castSpell(f.me, foreign, {from: offer.from, alt: offer.alt}), true);
      assert.equal(forest.tapped, true); assert.equal(generic.tapped, true);
    }
    f.finished();
  }
});
