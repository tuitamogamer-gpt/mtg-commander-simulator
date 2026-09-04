import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { assertGameStateInvariants } from './helpers/game-state-invariants.mjs';

const M = loadEngine();
const roles = ['human', 'local-ai'];

function decision(q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'chooseTargets') return q.candidates.slice(0, Math.max(1, q.min ?? 1));
  if (q.type === 'chooseCards') return q.from.slice(0, q.min ?? 0);
  if (q.type === 'chooseOption') return q.options.find(o => o.key === 'yes')?.key ?? q.options[0]?.key;
  if (q.type === 'chooseMulti') return q.options.slice(0, q.min ?? 1).map(o => o.key);
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'chooseX') return q.min || 0;
  return null;
}

function fixture(role) {
  const g = new M.Game({ seed: 90471, paced: false, maxTurns: 10 });
  const p = g.addPlayer('Native caster', { name: 'Native audit' }, null, role === 'local-ai');
  const o = g.addPlayer('Native opponent', { name: 'Opponent' }, { decide: async (_g, q) => decision(q) }, false);
  p.controller = role === 'local-ai' ? new M.AIController(p, { difficulty: 'hard', style: 'balanced' })
    : { decide: async (_g, q) => decision(q) };
  g.turnPlayer = p; g.turnNo = 4; g.phase = 'main1'; g.step = 'main';
  // Preserve announced objects for actual response/fizzle checks.
  g.priorityRound = async () => {};
  return { g, p, o };
}

function put(ctx, name, owner = ctx.o, zone = 'battlefield') {
  assert.ok(M.DEFS[name], `real card definition: ${name}`);
  const c = new M.CardInst(M.DEFS[name], owner);
  c.zone = zone; c.ctrl = owner; c.sick = false;
  if (zone === 'battlefield') { ctx.g.battlefield.push(c); ctx.g.recalc(); }
  else owner[zone].push(c);
  return c;
}

async function cast(ctx, name, mana, { zone = 'hand', alt } = {}) {
  const card = put(ctx, name, ctx.p, zone);
  Object.assign(ctx.p.pool, mana);
  const before = Object.values(ctx.p.pool).reduce((a, b) => a + b, 0);
  assert.equal(await ctx.g.castSpell(ctx.p, card, { from: zone, alt }), true, `${name} legally casts`);
  const so = ctx.g.stack.at(-1);
  assert.equal(so.card === card, true);
  assert.equal(so.manaSpent, before, `${name} pays its actual mana cost`);
  assert.equal(Object.values(ctx.p.pool).reduce((a, b) => a + b, 0), 0);
  return { card, so };
}

async function settle(g) {
  for (let n = 0; n < 40 && (g.stack.length || g.pendingTriggers.length); n++) {
    await g.flushTriggers();
    if (g.stack.length) await g.resolveTop();
  }
  assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0);
}

for (const role of roles) {
  test(`Horde of Notions/${role}: paid activation casts only its controller's Elemental directly from the graveyard`, async () => {
    const ctx = fixture(role), horde = put(ctx, 'Horde of Notions', ctx.p);
    const foreign = put(ctx, 'Wavesifter', ctx.o, 'graveyard');
    const own = put(ctx, 'Wavesifter', ctx.p, 'graveyard');
    if (role === 'human') ctx.p.controller = { decide: async (_g, q) => q.type === 'chooseCards' && q.aiHint?.kind === 'recur' ? q.from.slice(0, 1) : decision(q) };
    const spec = horde.def.abilities[0].targets[0];
    assert.equal(ctx.g.legalTargets(spec, horde, ctx.p).includes(foreign), false, 'opponent graveyards are not eligible');
    assert.equal(ctx.g.legalTargets(spec, horde, ctx.p).includes(own), true);
    Object.assign(ctx.p.pool, { W: 1, U: 1, B: 1, R: 1, G: 1 });
    const action = ctx.g.activatableList(ctx.p).find(row => row.card === horde);
    assert.ok(action); assert.equal(await ctx.g.activateAbility(ctx.p, action), true);
    assert.equal(Object.values(ctx.p.pool).reduce((a, b) => a + b, 0), 0, 'actual WUBRG activation cost paid');
    await ctx.g.resolveTop();
    const spell = ctx.g.stack.find(row => row.card === own && row.kind === 'spell');
    assert.ok(spell, 'free spell is separately respondable on the Stack');
    assert.equal(spell.from, 'graveyard', 'no artificial cast-from-hand event');
    assert.equal(spell.manaSpent, 0); assert.equal(own.zone, 'stack');
    assert.equal(ctx.p.hand.includes(own), false); assert.equal(ctx.p.graveyard.includes(own), false);
    assertGameStateInvariants(ctx.g, 'Horde free cast');
    await settle(ctx.g);
    assert.equal(own.zone, 'battlefield'); assert.equal(own.ctrl === ctx.p, true);
    assert.equal(foreign.zone, 'graveyard'); assert.equal(ctx.o.graveyard.includes(foreign), true);
    assert.equal(ctx.g.bf().filter(card => card.ctrl === ctx.p && card.hasSub('Clue')).length, 2);
    assertGameStateInvariants(ctx.g, 'Horde resolved');
  });

  test(`Horde of Notions/${role}: a changed graveyard incarnation cannot be cast by the old activation`, async () => {
    const ctx = fixture(role), horde = put(ctx, 'Horde of Notions', ctx.p);
    const own = put(ctx, 'Wavesifter', ctx.p, 'graveyard');
    Object.assign(ctx.p.pool, { W: 1, U: 1, B: 1, R: 1, G: 1 });
    const action = ctx.g.activatableList(ctx.p).find(row => row.card === horde);
    assert.equal(await ctx.g.activateAbility(ctx.p, action), true);
    await ctx.g.move(own, 'exile'); await ctx.g.move(own, 'graveyard'); await settle(ctx.g);
    assert.equal(own.zone, 'graveyard'); assert.equal(ctx.p.turnState.spellsCast || 0, 0);
    assertGameStateInvariants(ctx.g, 'Horde stale target');
  });

  test(`Disorder in the Court/${role}: delayed return rejects a card that left and reentered exile`, async () => {
    const ctx = fixture(role), target = put(ctx, 'Grizzly Bears');
    const subject = put(ctx, 'Disorder in the Court', ctx.p, 'hand');
    Object.assign(ctx.p.pool, { W: 1, U: 1, C: 1 });
    assert.equal(await ctx.g.castSpell(ctx.p, subject, { from: 'hand', xVal: 1 }), true);
    assert.equal(ctx.g.stack.at(-1).manaSpent, 3); await settle(ctx.g);
    assert.equal(target.zone, 'exile');
    await ctx.g.move(target, 'hand'); await ctx.g.move(target, 'exile');
    await ctx.g.emit('endStep', { player: ctx.p }); await settle(ctx.g);
    assert.equal(target.zone, 'exile', 'delayed return is linked to the original exiled object');
    assertGameStateInvariants(ctx.g, 'Disorder stale exile');
  });

  test(`Disorder in the Court/${role}: linked creatures return tapped together under their owners' control`, async () => {
    const ctx = fixture(role), creatures = [put(ctx, 'Grizzly Bears'), put(ctx, 'Wind Drake')];
    creatures[0].ctrl = ctx.p; ctx.g.recalc();
    const subject = put(ctx, 'Disorder in the Court', ctx.p, 'hand');
    Object.assign(ctx.p.pool, { W: 1, U: 1, C: 2 });
    assert.equal(await ctx.g.castSpell(ctx.p, subject, { from: 'hand', xVal: 2 }), true);
    assert.equal(ctx.g.stack.at(-1).manaSpent, 4); await settle(ctx.g);
    assert.equal(creatures.every(card => card.zone === 'exile'), true);
    const entrantsSeen = [], emit = ctx.g.emit.bind(ctx.g);
    ctx.g.emit = async (event, data) => {
      if (event === 'etb' && creatures.includes(data.card)) entrantsSeen.push(creatures.filter(c => c.zone === 'battlefield').length);
      return emit(event, data);
    };
    await ctx.g.emit('endStep', { player: ctx.p }); await settle(ctx.g);
    assert.equal(creatures.every(card => card.zone === 'battlefield' && card.ctrl === card.owner && card.tapped), true);
    assert.deepEqual(entrantsSeen, [2, 2]); assertGameStateInvariants(ctx.g, 'Disorder return batch');
  });

  for (const name of ['Pongify', 'Rapid Hybridization']) {
    for (const protection of ['indestructible', 'shield']) {
      test(`${name}/${role}: legal ${protection} target still produces the controller's token`, async () => {
        const ctx = fixture(role), target = put(ctx, 'Grizzly Bears');
        if (protection === 'shield') ctx.g.addCounters(target, 'shield', 1);
        else M.E.grantUntilEOT(ctx.g, target, ['indestructible']);
        const { card } = await cast(ctx, name, { U: 1 });
        await settle(ctx.g);
        assert.equal(target.zone, 'battlefield');
        const tokens = ctx.g.creatures(ctx.o).filter(c => c.isToken);
        assert.equal(tokens.length, 1, 'creation does not depend on successful destruction');
        assert.equal(tokens[0].power, 3); assert.equal(tokens[0].toughness, 3);
        assert.deepEqual(Array.from(tokens[0].colors), ['G']);
        assert.equal(tokens[0].hasSub(name === 'Pongify' ? 'Ape' : 'Frog'), true);
        assert.equal(card.zone, 'graveyard');
        if (protection === 'shield') assert.equal(target.counters.shield || 0, 0);
      });
    }
    test(`${name}/${role}: a blinked illegal target produces no token`, async () => {
      const ctx = fixture(role), target = put(ctx, 'Grizzly Bears');
      await cast(ctx, name, { U: 1 });
      await ctx.g.move(target, 'exile'); await ctx.g.move(target, 'battlefield', { ctrl: ctx.o });
      await settle(ctx.g);
      assert.equal(target.zone, 'battlefield');
      assert.equal(ctx.g.creatures(ctx.o).filter(c => c.isToken).length, 0);
    });
  }

  for (const name of ['Hull Breach', "It's Clobberin' Time!"]) {
    test(`${name}/${role}: an artifact land is a legal artifact target`, async () => {
      const ctx = fixture(role), target = put(ctx, 'Great Furnace');
      await cast(ctx, name, name === 'Hull Breach' ? { R: 1, G: 1 } : { C: 2, G: 1 });
      assert.equal(ctx.g.stack.at(-1).targets.flat().includes(target), true);
      await settle(ctx.g);
      assert.equal(target.zone, 'graveyard');
    });
  }

  test(`Saw in Half/${role}: a finality replacement does not count as dying`, async () => {
    const ctx = fixture(role), target = put(ctx, 'Colossal Dreadmaw');
    ctx.g.addCounters(target, 'finality', 1);
    await cast(ctx, 'Saw in Half', { C: 2, B: 1 }); await settle(ctx.g);
    assert.equal(target.zone, 'exile');
    assert.equal(ctx.g.creatures(ctx.o).filter(c => c.isToken).length, 0);
  });

  test(`Saw in Half/${role}: token copies retain the deceased object's copy effect`, async () => {
    const ctx = fixture(role), target = put(ctx, 'Llanowar Elves');
    M.OracleV8Copies.applyCopy(ctx.g, target, M.DEFS['Colossal Dreadmaw']); ctx.g.recalc();
    assert.equal(target.name, 'Colossal Dreadmaw');
    await cast(ctx, 'Saw in Half', { C: 2, B: 1 }); await settle(ctx.g);
    assert.equal(target.zone, 'graveyard'); assert.equal(target.name, 'Llanowar Elves');
    const tokens = ctx.g.creatures(ctx.o).filter(c => c.isToken);
    assert.equal(tokens.length, 2);
    for (const token of tokens) {
      assert.equal(token.name, 'Colossal Dreadmaw');
      assert.equal(token.power, 3); assert.equal(token.toughness, 3); assert.equal(token.kw('trample'), true);
    }
  });

  test(`Saw in Half/${role}: fixed copied P/T replaces characteristic-defining abilities`, async () => {
    const ctx = fixture(role);
    for (let n = 0; n < 4; n++) put(ctx, 'Forest', ctx.p, 'graveyard');
    const target = put(ctx, 'Consuming Aberration');
    assert.equal(target.power, 4); assert.equal(target.toughness, 4);
    await cast(ctx, 'Saw in Half', { C: 2, B: 1 }); await settle(ctx.g);
    const tokens = ctx.g.creatures(ctx.o).filter(c => c.isToken);
    assert.equal(tokens.length, 2);
    for (const token of tokens) { assert.equal(token.power, 2); assert.equal(token.toughness, 2); }
  });

  test(`Sevinne's Reclamation/${role}: flashback creates a retargeted, respondable spell copy`, async () => {
    const ctx = fixture(role);
    const first = put(ctx, 'Grizzly Bears', ctx.p, 'graveyard');
    const second = put(ctx, 'Grizzly Bears', ctx.p, 'graveyard');
    const { card, so } = await cast(ctx, "Sevinne's Reclamation", { C: 4, W: 1 },
      { zone: 'graveyard', alt: { flashback: true, altCostStr: '{4}{W}' } });
    const original = so.targets[0]; assert.equal([first, second].includes(original), true);
    await ctx.g.resolveTop();
    assert.equal(original.zone, 'battlefield'); assert.equal(card.zone, 'exile');
    const copy = ctx.g.stack.find(s => s.isCopy && s.copyOf === so);
    assert.ok(copy, 'copy must exist on the Stack after original resolution');
    assert.equal(copy.targets[0] === (original === first ? second : first), true);
    assert.equal(copy.targets[0].zone, 'graveyard', 'copy target waits for resolution');
    await ctx.g.move(copy.targets[0], 'exile');
    await settle(ctx.g);
    assert.equal(ctx.g.creatures(ctx.p).length, 1, 'response removes the copy target, so the copy fizzles');
    assert.equal(ctx.p.turnState.spellsCast, 1, 'creating a copy does not cast it');
  });

  test(`Sevinne's Reclamation/${role}: resolving its copy does not recursively create another`, async () => {
    const ctx = fixture(role);
    put(ctx, 'Grizzly Bears', ctx.p, 'graveyard'); put(ctx, 'Llanowar Elves', ctx.p, 'graveyard');
    await cast(ctx, "Sevinne's Reclamation", { C: 4, W: 1 },
      { zone: 'graveyard', alt: { flashback: true, altCostStr: '{4}{W}' } });
    await ctx.g.resolveTop();
    assert.equal(ctx.g.stack.filter(s => s.isCopy).length, 1);
    await settle(ctx.g);
    assert.equal(ctx.g.creatures(ctx.p).length, 2);
    assert.equal(ctx.p.turnState.spellsCast, 1);
  });

  test(`Sevinne's Reclamation/${role}: an illegal original target prevents the copy`, async () => {
    const ctx = fixture(role), target = put(ctx, 'Grizzly Bears', ctx.p, 'graveyard');
    put(ctx, 'Llanowar Elves', ctx.p, 'graveyard');
    const { so } = await cast(ctx, "Sevinne's Reclamation", { C: 4, W: 1 },
      { zone: 'graveyard', alt: { flashback: true, altCostStr: '{4}{W}' } });
    await ctx.g.move(so.targets[0], 'exile'); await settle(ctx.g);
    assert.equal(ctx.g.creatures(ctx.p).length, 0);
    assert.equal(ctx.p.turnState.spellsCast, 1);
  });

  test(`Colfenor's Urn/${role}: captures its owner's creature that an opponent controlled`, async () => {
    const ctx = fixture(role);
    await cast(ctx, "Colfenor's Urn", { C: 3 }); await settle(ctx.g);
    const creature = put(ctx, 'Colossal Dreadmaw', ctx.p); creature.ctrl = ctx.o; ctx.g.recalc();
    await ctx.g.destroy(creature); await settle(ctx.g);
    assert.equal(creature.zone, 'exile', 'the Urn follows your graveyard, not battlefield control');
  });

  test(`Colfenor's Urn/${role}: cannot capture a stolen opponent-owned creature`, async () => {
    const ctx = fixture(role);
    await cast(ctx, "Colfenor's Urn", { C: 3 }); await settle(ctx.g);
    const creature = put(ctx, 'Colossal Dreadmaw'); creature.ctrl = ctx.p; ctx.g.recalc();
    await ctx.g.destroy(creature); await settle(ctx.g);
    assert.equal(creature.zone, 'graveyard', 'the creature went to its owner’s opposing graveyard');
  });

  test(`Colfenor's Urn/${role}: removing the source in response prevents its sacrifice and return`, async () => {
    const ctx = fixture(role), { card: urn } = await cast(ctx, "Colfenor's Urn", { C: 3 });
    await settle(ctx.g);
    const creatures = [];
    for (let n = 0; n < 3; n++) {
      const c = put(ctx, 'Colossal Dreadmaw', ctx.p); creatures.push(c);
      await ctx.g.destroy(c); await settle(ctx.g);
    }
    assert.equal(creatures.every(c => c.zone === 'exile'), true);
    await ctx.g.emit('endStep', { player: ctx.p }); await ctx.g.flushTriggers();
    assert.equal(ctx.g.stack.length, 1);
    await ctx.g.move(urn, 'hand'); await settle(ctx.g);
    assert.equal(creatures.every(c => c.zone === 'exile'), true, 'if you do requires an actual sacrifice');
  });

  test(`Colfenor's Urn/${role}: a card leaving and reentering exile is no longer linked`, async () => {
    const ctx = fixture(role), { card: urn } = await cast(ctx, "Colfenor's Urn", { C: 3 });
    await settle(ctx.g);
    const creatures = [];
    for (let n = 0; n < 3; n++) {
      const c = put(ctx, 'Colossal Dreadmaw', ctx.p); creatures.push(c);
      await ctx.g.destroy(c); await settle(ctx.g);
    }
    await ctx.g.move(creatures[0], 'hand'); await ctx.g.move(creatures[0], 'exile');
    await ctx.g.emit('endStep', { player: ctx.p }); await settle(ctx.g);
    assert.equal(urn.zone, 'battlefield', 'only two linked card objects remain exiled');
    assert.equal(creatures.every(c => c.zone === 'exile'), true);
  });

  test(`Colfenor's Urn/${role}: three linked creatures return together after its actual sacrifice`, async () => {
    const ctx = fixture(role), { card: urn } = await cast(ctx, "Colfenor's Urn", { C: 3 });
    await settle(ctx.g);
    const creatures = [];
    for (let n = 0; n < 3; n++) {
      const c = put(ctx, 'Colossal Dreadmaw', ctx.p); creatures.push(c);
      await ctx.g.destroy(c); await settle(ctx.g);
    }
    const entrantsSeen = [], emit = ctx.g.emit.bind(ctx.g);
    ctx.g.emit = async (event, data) => {
      if (event === 'etb' && creatures.includes(data.card)) entrantsSeen.push(creatures.filter(c => c.zone === 'battlefield').length);
      return emit(event, data);
    };
    await ctx.g.emit('endStep', { player: ctx.p }); await settle(ctx.g);
    assert.equal(urn.zone, 'graveyard');
    assert.equal(creatures.every(c => c.zone === 'battlefield' && c.ctrl === c.owner), true);
    assert.deepEqual(entrantsSeen, [3, 3, 3], 'all three creatures exist before any entry trigger observes the batch');
  });

  test(`Colfenor's Urn/${role}: the three-card condition is checked again after a response`, async () => {
    const ctx = fixture(role), { card: urn } = await cast(ctx, "Colfenor's Urn", { C: 3 });
    await settle(ctx.g);
    const creatures = [];
    for (let n = 0; n < 3; n++) {
      const c = put(ctx, 'Colossal Dreadmaw', ctx.p); creatures.push(c);
      await ctx.g.destroy(c); await settle(ctx.g);
    }
    await ctx.g.emit('endStep', { player: ctx.p }); await ctx.g.flushTriggers();
    assert.equal(ctx.g.stack.length, 1);
    await ctx.g.move(creatures[0], 'hand'); await settle(ctx.g);
    assert.equal(urn.zone, 'battlefield');
    assert.equal(creatures.slice(1).every(c => c.zone === 'exile'), true);
  });

  test(`Skyclave Apparition/${role}: blink keeps the departing trigger linked to the old exile`, async () => {
    const ctx = fixture(role), first = put(ctx, 'Grizzly Bears');
    const { card: apparition } = await cast(ctx, 'Skyclave Apparition', { C: 1, W: 2 });
    await settle(ctx.g); assert.equal(first.zone, 'exile');
    const second = put(ctx, 'Leatherback Baloth');
    await cast(ctx, 'Cloudshift', { W: 1 }); await settle(ctx.g);
    assert.equal(apparition.zone, 'battlefield'); assert.equal(second.zone, 'exile');
    const tokens = ctx.g.creatures(ctx.o).filter(c => c.isToken && c.hasSub('Illusion'));
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].power, 2, 'old LTB uses the old exiled card, not the new ETB metadata');
    assert.equal(tokens[0].toughness, 2);
  });

  test(`Skyclave Apparition/${role}: an exiled card leaving that zone no longer creates an Illusion`, async () => {
    const ctx = fixture(role), target = put(ctx, 'Grizzly Bears');
    const { card: apparition } = await cast(ctx, 'Skyclave Apparition', { C: 1, W: 2 });
    await settle(ctx.g); assert.equal(target.zone, 'exile');
    await ctx.g.move(target, 'hand'); await ctx.g.move(target, 'exile');
    await ctx.g.destroy(apparition); await settle(ctx.g);
    assert.equal(ctx.g.creatures(ctx.o).filter(c => c.isToken).length, 0);
  });
}

test('Horde of Notions/human: declining its optional free cast leaves the card in the original graveyard object', async () => {
  const ctx = fixture('human'), horde = put(ctx, 'Horde of Notions', ctx.p);
  const own = put(ctx, 'Wavesifter', ctx.p, 'graveyard'), version = own.zoneVersion;
  Object.assign(ctx.p.pool, { W: 1, U: 1, B: 1, R: 1, G: 1 });
  const action = ctx.g.activatableList(ctx.p).find(row => row.card === horde);
  assert.equal(await ctx.g.activateAbility(ctx.p, action), true); await settle(ctx.g);
  assert.equal(own.zone, 'graveyard'); assert.equal(own.zoneVersion, version);
  assert.equal(ctx.p.turnState.spellsCast || 0, 0); assertGameStateInvariants(ctx.g, 'Horde declined');
});
