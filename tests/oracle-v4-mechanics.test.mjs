import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function baseDef(name, script = {}, extra = {}) {
  return Object.assign({
    name, cost: '{2}', super: [], types: ['Creature'], subtypes: ['Test'],
    power: '2', toughness: '2', oracle: '', kws: [], triggers: [], statics: [],
  }, script, extra, {
    kws: [...(script.kws || extra.kws || [])],
    triggers: [...(script.triggers || extra.triggers || [])],
    statics: [...(script.statics || extra.statics || [])],
  });
}

function scriptedDef(name, operations, extra = {}) {
  const script = {};
  for (const operation of operations) assert.equal(MTG.applyOracleMechanic(script, operation), true, operation.kind);
  return baseDef(name, script, extra);
}

function gameWithPlayers(count = 2, aiFirst = false) {
  const game = new MTG.Game({ seed: 4404, paced: false, maxTurns: 5 });
  const players = [];
  for (let index = 0; index < count; index++) {
    const player = game.addPlayer(`P${index + 1}`, { name: 'Mechanics test' }, null, aiFirst && index === 0);
    player.controller = aiFirst && index === 0
      ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
      : {
          decide: async (current, query) => {
            if (query.type === 'priority') return { kind: 'pass' };
            if (query.type === 'main') return query.casts.length
              ? { kind: 'cast', ...query.casts[0] } : { kind: 'done' };
            if (query.type === 'attackers') return query.eligible.map(card => ({ card, target: query.opponents[0] }));
            if (query.type === 'blockers') return [];
            if (query.type === 'orderTriggers') return query.triggers.slice();
            if (query.type === 'chooseCards') return query.from.slice(0, query.max || 1);
            if (query.type === 'chooseTargets') return query.candidates.slice(0, query.max || 1);
            if (query.type === 'chooseOption') return query.options[0].key;
            return null;
          },
        };
    players.push(player);
  }
  game.turnPlayer = players[0];
  game.turnNo = 4;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players };
}

function put(game, player, def, zone = 'battlefield') {
  const card = new MTG.CardInst(def, player);
  card.ctrl = player;
  card.zone = zone;
  if (zone === 'battlefield') {
    card.sick = false;
    game.battlefield.push(card);
    game.recalc();
  } else player[zone].push(card);
  return card;
}

async function enter(game, player, def) {
  const card = new MTG.CardInst(def, player);
  card.zone = 'nowhere';
  await game.move(card, 'battlefield', { ctrl: player });
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 100) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 100, 'trigger stack settles');
}

async function castFromMain(game, player, name) {
  const def = MTG.DEFS[name];
  assert.ok(def, `${name}: actual imported definition exists`);
  const card = put(game, player, def, 'hand');
  game.phase = 'main1';
  game.step = 'main';
  const symbols = [...def.cost.matchAll(/\{(\d+|[WUBRGC])\}/g)].map(match => match[1]);
  assert.equal(symbols.map(symbol => `{${symbol}}`).join(''), def.cost,
    `${name}: funding matches the exact printed cost`);
  for (const color of Object.keys(player.pool)) player.pool[color] = 0;
  for (const symbol of symbols) {
    if (/^\d+$/.test(symbol)) player.pool.C += Number(symbol);
    else player.pool[symbol] += 1;
  }
  const action = await player.controller.decide(game, {
    type: 'main', player, phase: game.phase,
    casts: game.castableList(player), acts: game.activatableList(player), lands: [],
  });
  assert.equal(action.kind, 'cast', `${name}: controller chooses a real cast`);
  assert.equal(action.card, card, `${name}: controller chooses the intended card`);
  assert.equal(await game.performAction(player, action), true);
  await resolveAll(game);
  assert.equal(card.zone, 'battlefield');
  assert.ok(card.castMeta, `${name}: normal casting metadata exists`);
  assert.notEqual(card.castMeta.alt?.free, true, `${name}: no free-cast bypass`);
  return card;
}

function assertSettledRole(game, player, label) {
  assert.equal(game.stack.length, 0, `${label}: no Stack residue`);
  assert.equal(game.pendingTriggers.length, 0, `${label}: no pending-trigger residue`);
  if (player.isAI) {
    assert.ok(player.controller instanceof MTG.AIController, `${label}: genuine local AI`);
    const decisions = (game.aiDecisionLog || []).filter(entry => entry.playerId === player.idx);
    assert.ok(decisions.length, `${label}: real AI decisions recorded`);
    assert.equal(decisions.some(entry => entry.fallback), false, `${label}: no AI fallback`);
  }
}

async function blink(game, card) {
  const originalVersion = card.zoneVersion;
  await game.move(card, 'exile');
  await game.move(card, 'battlefield', { ctrl: card.owner });
  assert.equal(card.zoneVersion, originalVersion + 2, 'blink creates a new battlefield object');
}

async function attackUnblocked(game, player, card) {
  card.sick = false;
  card.tapped = false;
  await game.combatPhase(player);
}

test('v4 adapter closes every emitted family and rejects malformed/unknown operations', () => {
  const operations = [
    { kind: 'mechanic-myriad' }, { kind: 'mechanic-infect' }, { kind: 'mechanic-exalted' },
    { kind: 'mechanic-flanking' }, { kind: 'mechanic-battle-cry' }, { kind: 'mechanic-mentor' },
    { kind: 'mechanic-training' }, { kind: 'mechanic-riot' }, { kind: 'mechanic-unleash' },
    { kind: 'mechanic-evolve' }, { kind: 'mechanic-extort' }, { kind: 'mechanic-delve' },
    { kind: 'mechanic-improvise' }, { kind: 'mechanic-affinity-artifacts' },
    { kind: 'mechanic-afterlife', n: 2 }, { kind: 'mechanic-bushido', n: 1 },
    { kind: 'mechanic-renown', n: 2 }, { kind: 'mechanic-bloodthirst', n: 3 },
    { kind: 'mechanic-toxic', n: 1 },
    { kind: 'mechanic-typecycling', subtype: 'Plains', cost: '{2}' },
  ];
  for (const operation of operations) {
    const script = {};
    assert.equal(MTG.applyOracleMechanic(script, operation), true, operation.kind);
    if (operation.kind !== 'mechanic-improvise') {
      assert.equal(script[operation.kind.slice(9)] === true, false,
        `${operation.kind} is not represented by an inert flag`);
    }
  }
  assert.equal(MTG.applyOracleMechanic({}, { kind: 'mechanic-afterlife', n: 0 }), false);
  assert.equal(MTG.applyOracleMechanic({}, { kind: 'mechanic-typecycling', subtype: '', cost: '{2}' }), false);
  assert.equal(MTG.applyOracleMechanic({}, { kind: 'mechanic-not-implemented' }), false);
  const combinedToxic = {};
  assert.equal(MTG.applyOracleMechanic(combinedToxic, { kind: 'mechanic-toxic', n: 1 }), true);
  assert.equal(MTG.applyOracleMechanic(combinedToxic, { kind: 'mechanic-toxic', n: 2 }), true);
  assert.equal(combinedToxic.toxic, 3, 'multiple toxic instances add to the combat-damage result');
  assert.equal(combinedToxic.triggers, undefined);
});

test('infect replaces player life loss and creature damage, and poison is a real SBA loss', async () => {
  const { game, players: [attacker, defender] } = gameWithPlayers();
  const infect = put(game, attacker, scriptedDef('Infect source', [{ kind: 'mechanic-infect' }], { power: '3', toughness: '3' }));
  const victim = put(game, defender, baseDef('Victim', {}, { power: '4', toughness: '4' }));

  await game.damagePlayer(infect, defender, 3, { combat: true });
  assert.equal(defender.life, 40);
  assert.equal(defender.poison, 3);
  await game.damageCreature(infect, victim, 2);
  assert.equal(victim.damage, 0);
  assert.equal(victim.counters['-1/-1'], 2);

  defender.poison = 9;
  await game.damagePlayer(infect, defender, 1);
  assert.equal(defender.lost, true);
  assert.equal(game.log.some(entry => /ten poison counters/i.test(entry.msg)), true);
});

test('local AI makes real riot/unleash entry choices; bloodthirst and evolve alter battlefield state', async () => {
  const { game, players: [bot, opponent] } = gameWithPlayers(2, true);
  game.phase = 'main1';
  game.turnPlayer = bot;
  const riotDef = scriptedDef('Riot creature', [{ kind: 'mechanic-riot' }]);
  const riot = await enter(game, bot, riotDef);
  game.recalc();
  assert.equal(riot.kw('haste'), true, 'AI chooses haste when it can attack this main phase');
  assert.equal(riot.counters['+1/+1'] || 0, 0);

  game.phase = 'main2';
  const secondRiot = await enter(game, bot, riotDef);
  assert.equal(secondRiot.counters['+1/+1'], 1, 'AI chooses permanent stats when haste has no immediate value');

  const unleash = await enter(game, bot, scriptedDef('Unleash creature', [{ kind: 'mechanic-unleash' }]));
  game.recalc();
  assert.equal(unleash.counters['+1/+1'], 1);
  assert.equal(unleash.cur.cantBlock, true);

  const source = put(game, bot, baseDef('Damage source'));
  await game.damagePlayer(source, opponent, 1);
  const bloodthirst = await enter(game, bot, scriptedDef('Bloodthirst creature', [{ kind: 'mechanic-bloodthirst', n: 2 }]));
  assert.equal(bloodthirst.counters['+1/+1'], 2);

  const evolve = put(game, bot, scriptedDef('Evolve creature', [{ kind: 'mechanic-evolve' }], { power: '1', toughness: '1' }));
  await enter(game, bot, baseDef('Larger creature', {}, { power: '3', toughness: '3' }));
  await resolveAll(game);
  assert.equal(evolve.counters['+1/+1'], 1);
});

test('combat trigger families change legal combat objects and use controller target selection', async () => {
  const { game, players: [attacker, defender] } = gameWithPlayers();
  const mentor = put(game, attacker, scriptedDef('Mentor', [{ kind: 'mechanic-mentor' }], { power: '3', toughness: '3' }));
  const trainee = put(game, attacker, scriptedDef('Trainee', [{ kind: 'mechanic-training' }], { power: '1', toughness: '2' }));
  mentor.attacking = defender;
  trainee.attacking = defender;
  game.combat = { attackers: [mentor, trainee] };
  await game.emit('attacks', { card: mentor, player: attacker, defender });
  await resolveAll(game);
  assert.equal(trainee.counters['+1/+1'], 1, 'mentor selects the lesser-power attacker');
  await game.emit('attackersDeclared', { player: attacker, attackers: [mentor, trainee] });
  await resolveAll(game);
  assert.equal(trainee.counters['+1/+1'], 2, 'training sees the stronger fellow attacker');

  const battleCry = put(game, attacker, scriptedDef('Battle cry', [{ kind: 'mechanic-battle-cry' }]));
  battleCry.attacking = defender;
  await game.emit('attacks', { card: battleCry, player: attacker, defender });
  await resolveAll(game);
  game.recalc();
  assert.equal(mentor.power, 4, 'battle cry pumps another attacker');

  const exalted = put(game, attacker, scriptedDef('Exalted support', [{ kind: 'mechanic-exalted' }]));
  await game.emit('attackersDeclared', { player: attacker, attackers: [mentor] });
  await resolveAll(game);
  game.recalc();
  assert.equal(mentor.power, 5, 'exalted pumps the sole attacker');

  const flanker = put(game, attacker, scriptedDef('Flanker', [{ kind: 'mechanic-flanking' }]));
  const blocker = put(game, defender, baseDef('Blocker', {}, { power: '2', toughness: '2' }));
  await game.emit('blocks', { attacker: flanker, blocker });
  await resolveAll(game);
  game.recalc();
  assert.equal(blocker.power, 1);
  assert.equal(blocker.toughness, 1);

  const samurai = put(game, defender, scriptedDef('Samurai', [{ kind: 'mechanic-bushido', n: 2 }]));
  await game.emit('blocks', { attacker: flanker, blocker: samurai });
  await resolveAll(game);
  game.recalc();
  assert.equal(samurai.power, 3, 'bushido +2/+2 and opposing flanking -1/-1 both apply');
  assert.equal(samurai.toughness, 3);
});

test('afterlife and renown trigger once; toxic is an immediate combat-damage result', async () => {
  const { game, players: [attacker, defender] } = gameWithPlayers();
  const afterlife = put(game, attacker, scriptedDef('Afterlife body', [{ kind: 'mechanic-afterlife', n: 2 }]));
  await game.move(afterlife, 'graveyard');
  await resolveAll(game);
  const spirits = game.creatures(attacker).filter(card => card.isToken && card.hasSub('Spirit'));
  assert.equal(spirits.length, 2);
  assert.equal(spirits.every(card => card.kw('flying') && card.colors.includes('W') && card.colors.includes('B')), true);

  const toxic = put(game, attacker, scriptedDef('Toxic body', [{ kind: 'mechanic-toxic', n: 2 }]));
  await game.damagePlayer(toxic, defender, 1, { combat: true });
  assert.equal(defender.poison, 2);
  assert.equal(defender.life, 39);
  assert.equal(game.pendingTriggers.length, 0, 'toxic does not trigger');
  assert.equal(game.stack.length, 0, 'toxic never uses the Stack');

  const renowned = put(game, attacker, scriptedDef('Renown body', [{ kind: 'mechanic-renown', n: 2 }]));
  await game.emit('combatDamageToPlayer', { card: renowned, player: defender, n: 2 });
  await resolveAll(game);
  await game.emit('combatDamageToPlayer', { card: renowned, player: defender, n: 2 });
  await resolveAll(game);
  assert.equal(renowned.counters['+1/+1'], 2, 'renown only happens once');
  assert.equal(renowned.meta.renowned, true);
});

for (const role of ['human', 'ai']) {
  test(`${role}: actual toxic combat applies poison before priority and immediately loses at ten`, async () => {
    const { game, players: [player, opponent] } = gameWithPlayers(2, role === 'ai');
    const card = await castFromMain(game, player, 'Bilious Skulldweller');
    assert.equal(card.def.toxic, 1);
    assert.equal((card.def.triggers || []).some(trigger => /toxic/i.test(trigger.desc || '')), false);
    opponent.poison = 9;
    const damageResults = [];
    game.onEvent = event => {
      if (event.type === 'gameEffect' && event.kind === 'damage' && event.target === opponent) {
        damageResults.push({ poison: opponent.poison, life: opponent.life,
          toxic: event.toxic, pending: game.pendingTriggers.length, stack: game.stack.length });
      }
    };
    await attackUnblocked(game, player, card);
    assert.deepEqual(damageResults, [{ poison: 10, life: 39, toxic: 1, pending: 0, stack: 0 }]);
    assert.equal(opponent.lost, true, 'poison SBA is complete before a toxic response window could exist');
    assertSettledRole(game, player, role);
  });

  test(`${role}: toxic respects prevention and noncombat damage, and is independent of damage quantity`, async () => {
    const { game, players: [player, opponent] } = gameWithPlayers(2, role === 'ai');
    const card = await castFromMain(game, player, 'Bilious Skulldweller');
    game.untilEffects.push({ kind: 'preventAllCombat' });
    await attackUnblocked(game, player, card);
    assert.equal(opponent.life, 40);
    assert.equal(opponent.poison, 0, 'prevented combat damage gives no poison');
    assert.equal(await game.damagePlayer(card, opponent, 3), 3);
    assert.equal(opponent.life, 37);
    assert.equal(opponent.poison, 0, 'noncombat damage does not apply toxic');
    game.untilEffects = game.untilEffects.filter(effect => effect.kind !== 'preventAllCombat');
    MTG.E.pumpUntilEOT(game, card, 3, 3);
    await attackUnblocked(game, player, card);
    assert.equal(opponent.life, 33, 'all four combat damage still cause life loss');
    assert.equal(opponent.poison, 1, 'toxic 1 gives one counter, not four');
    assertSettledRole(game, player, role);
  });

  test(`${role}: toxic applies once per double-strike hit and combines with infect and lifelink`, async () => {
    {
      const { game, players: [player, opponent] } = gameWithPlayers(2, role === 'ai');
      const card = await castFromMain(game, player, 'Bilious Skulldweller');
      MTG.E.pumpUntilEOT(game, card, 0, 0, ['double strike']);
      await attackUnblocked(game, player, card);
      assert.equal(opponent.life, 38);
      assert.equal(opponent.poison, 2, 'both actual combat-damage steps apply toxic independently');
      assertSettledRole(game, player, role);
    }
    {
      const { game, players: [player, opponent] } = gameWithPlayers(2, role === 'ai');
      const card = await castFromMain(game, player, 'Bilious Skulldweller');
      MTG.E.pumpUntilEOT(game, card, 2, 2, ['infect', 'lifelink']);
      await attackUnblocked(game, player, card);
      assert.equal(opponent.life, 40, 'infect replaces the damage life loss');
      assert.equal(opponent.poison, 4, 'three infect counters plus the fixed one toxic counter');
      assert.equal(player.life, 43, 'lifelink still sees three damage');
      assertSettledRole(game, player, role);
    }
  });

  test(`${role}: Lignify suppresses toxic, and Bloated Contaminator proliferates already-applied poison`, async () => {
    {
      const { game, players: [player, opponent] } = gameWithPlayers(2, role === 'ai');
      const card = await castFromMain(game, player, 'Bilious Skulldweller');
      const lignify = put(game, opponent, MTG.DEFS.Lignify);
      lignify.attachedTo = card.iid;
      game.recalc();
      assert.equal(card.cur.abilitiesDisabled, true);
      MTG.E.pumpUntilEOT(game, card, 2, 0);
      await attackUnblocked(game, player, card);
      assert.equal(opponent.life, 38);
      assert.equal(opponent.poison, 0, 'losing all abilities removes toxic, not just keyword damage');
      assertSettledRole(game, player, role);
    }
    {
      const { game, players: [player, opponent] } = gameWithPlayers(2, role === 'ai');
      const card = await castFromMain(game, player, 'Bloated Contaminator');
      const damagePoison = [];
      game.onEvent = event => {
        if (event.type === 'gameEffect' && event.kind === 'damage' && event.target === opponent) {
          damagePoison.push(opponent.poison);
        }
      };
      await attackUnblocked(game, player, card);
      assert.deepEqual(damagePoison, [1], 'poison exists before the combat-damage proliferate trigger');
      assert.equal(opponent.poison, 2, 'the real controller can proliferate the first poison counter');
      assert.equal(opponent.life, 36);
      assertSettledRole(game, player, role);
    }
  });

  test(`${role}: Evolve rechecks both creatures at resolution rather than only at trigger collection`, async () => {
    const { game, players: [player] } = gameWithPlayers(2, role === 'ai');
    const raptor = await castFromMain(game, player, 'Cloudfin Raptor');
    await enter(game, player, MTG.DEFS['Grizzly Bears']);
    await game.flushTriggers();
    assert.equal(game.stack.length, 1);
    game.addCounters(raptor, '+1/+1', 2);
    game.recalc();
    assert.equal(raptor.power, 2);
    assert.equal(raptor.toughness, 3);
    await resolveAll(game);
    assert.equal(raptor.counters['+1/+1'], 2, 'equal/smaller entrant does not evolve the now larger source');

    const large = await enter(game, player, MTG.DEFS['Grizzly Bears']);
    assert.equal(game.pendingTriggers.length, 0, 'a nonqualifying ETB never triggers');
    MTG.E.pumpUntilEOT(game, large, 2, 2);
    await resolveAll(game);
    assert.equal(raptor.counters['+1/+1'], 2, 'growing later cannot invent a missed trigger');
    assertSettledRole(game, player, role);
  });

  test(`${role}: Evolve uses original-entrant LKI through repeated blink and source-incarnation changes`, async () => {
    {
      const { game, players: [player] } = gameWithPlayers(2, role === 'ai');
      const raptor = await castFromMain(game, player, 'Cloudfin Raptor');
      const bears = await enter(game, player, MTG.DEFS['Grizzly Bears']);
      await game.flushTriggers();
      assert.equal(game.stack.length, 1);
      const originalVersion = bears.zoneVersion;
      MTG.E.pumpUntilEOT(game, bears, 3, 3);
      await game.move(bears, 'exile');
      game.addCounters(raptor, '+1/+1', 3);
      game.recalc();
      assert.equal(bears.battlefieldLKI.get(originalVersion).power, 5,
        'LKI uses the last battlefield stats, not ETB stats');
      await game.move(bears, 'battlefield', { ctrl: player });
      const secondVersion = bears.zoneVersion;
      await blink(game, bears);
      assert.equal(bears.battlefieldLKI.get(secondVersion).power, 2);
      assert.equal(bears.battlefieldLKI.get(originalVersion).power, 5,
        'a later departure cannot overwrite the original object LKI');
      assert.equal(game.pendingTriggers.length, 0, 'later smaller incarnations produce no new Evolve trigger');
      const clone = MTG.cloneGameForAISimulation(game, 7731);
      assert.notEqual(clone.byIid(bears.iid).battlefieldLKI, bears.battlefieldLKI,
        'the AI simulation owns its LKI map');
      await resolveAll(clone);
      assert.equal(clone.byIid(raptor.iid).counters['+1/+1'], 4,
        'Evolve LKI still resolves correctly inside the actual AI simulation clone');
      assert.equal(raptor.counters['+1/+1'], 3, 'simulation does not mutate the live counters');
      await resolveAll(game);
      assert.equal(raptor.counters['+1/+1'], 4, 'original 5/5 entrant still beats the current 3/4 Raptor');
      assertSettledRole(game, player, role);
    }
    {
      const { game, players: [player] } = gameWithPlayers(2, role === 'ai');
      const raptor = await castFromMain(game, player, 'Cloudfin Raptor');
      await enter(game, player, MTG.DEFS['Grizzly Bears']);
      await game.flushTriggers();
      await blink(game, raptor);
      await resolveAll(game);
      assert.equal(raptor.counters['+1/+1'] || 0, 0, 'the returned source does not inherit its old trigger');
      assertSettledRole(game, player, role);
    }
  });

  test(`${role}: Evolve rejects a weakened entrant and never substitutes a stronger later incarnation`, async () => {
    const { game, players: [player] } = gameWithPlayers(2, role === 'ai');
    const raptor = await castFromMain(game, player, 'Cloudfin Raptor');
    const weakened = await enter(game, player, MTG.DEFS['Grizzly Bears']);
    await game.flushTriggers();
    assert.equal(game.stack.length, 1);
    MTG.E.pumpUntilEOT(game, weakened, -2, -1);
    await resolveAll(game);
    assert.equal(raptor.counters['+1/+1'] || 0, 0,
      'Evolve rechecks the live entrant after its power/toughness shrink to 0/1');

    const bears = await enter(game, player, MTG.DEFS['Grizzly Bears']);
    const originalVersion = bears.zoneVersion;
    await game.flushTriggers();
    await game.move(bears, 'exile');
    game.addCounters(raptor, '+1/+1', 2);
    await game.move(bears, 'battlefield', { ctrl: player });
    const laterVersion = bears.zoneVersion;
    MTG.E.pumpUntilEOT(game, bears, 5, 5);
    await blink(game, bears);
    MTG.E.pumpUntilEOT(game, bears, 5, 5);
    assert.equal(game.pendingTriggers.length, 0, 'each new entrant was only 2/2 when entering');
    assert.equal(bears.battlefieldLKI.get(originalVersion).power, 2);
    assert.equal(bears.battlefieldLKI.get(laterVersion).power, 7);
    assert.equal(bears.power, 7);
    await resolveAll(game);
    assert.equal(raptor.counters['+1/+1'], 2,
      'original 2/2 LKI fails even though both a later LKI and the current object are 7/7');
    assertSettledRole(game, player, role);
  });

  test(`${role}: Exalted and Flanking keep the original target object across blink and AI cloning`, async () => {
    for (const family of ['exalted', 'flanking']) {
      const { game, players: [player, opponent] } = gameWithPlayers(2, role === 'ai');
      const source = await castFromMain(game, player, family === 'exalted' ? 'Akrasan Squire' : 'Benalish Cavalry');
      const recipient = put(game, family === 'exalted' ? player : opponent, MTG.DEFS['Grizzly Bears']);
      const trigger = async () => family === 'exalted'
        ? game.emit('attackersDeclared', { player, attackers: [recipient] })
        : game.emit('blocks', { attacker: source, blocker: recipient });
      await trigger();
      await game.flushTriggers();
      assert.equal(game.stack.length, 1);

      const clone = MTG.cloneGameForAISimulation(game, 9821);
      const clonedRecipient = clone.byIid(recipient.iid);
      assert.notEqual(clonedRecipient, recipient);
      await resolveAll(clone);
      clone.recalc();
      assert.equal(clonedRecipient.power, family === 'exalted' ? 3 : 1,
        'the event-object capture survives genuine AI simulation cloning');
      assert.equal(recipient.power, 2, 'simulation does not mutate the live recipient');
      assert.equal(game.stack.length, 1, 'simulation does not resolve the live Stack');

      await blink(game, recipient);
      await resolveAll(game);
      game.recalc();
      assert.equal(recipient.power, 2, 'the returned recipient is not affected by the old trigger');
      assert.equal(recipient.toughness, 2);

      await trigger();
      await game.flushTriggers();
      await game.move(source, 'graveyard');
      await resolveAll(game);
      game.recalc();
      assert.equal(recipient.power, family === 'exalted' ? 3 : 1,
        'a trigger remains effective on its original recipient when its source leaves');
      assertSettledRole(game, player, `${role} ${family}`);
    }
  });
}

test('extort pays hybrid mana, drains every opponent, and gains the total life lost', async () => {
  const { game, players: [caster, opponentA, opponentB] } = gameWithPlayers(3);
  const extort = put(game, caster, scriptedDef('Extort permanent', [{ kind: 'mechanic-extort' }]));
  const spell = put(game, caster, baseDef('Cast spell', {}, { types: ['Sorcery'], power: undefined, toughness: undefined }), 'hand');
  caster.pool.W = 1;
  await game.emit('cast', { player: caster, card: spell });
  await resolveAll(game);
  assert.equal(caster.pool.W, 0);
  assert.equal(opponentA.life, 39);
  assert.equal(opponentB.life, 39);
  assert.equal(caster.life, 42);
  assert.equal(extort.zone, 'battlefield');
});

test('delve/improvise/affinity descriptors join payment paths and typecycling searches instead of drawing', async () => {
  const costScript = {};
  for (const operation of [
    { kind: 'mechanic-delve' }, { kind: 'mechanic-improvise' }, { kind: 'mechanic-affinity-artifacts' },
  ]) assert.equal(MTG.applyOracleMechanic(costScript, operation), true);
  assert.equal(costScript.altCosts.some(cost => cost.delve), true);
  assert.equal(costScript.improvise, true);

  const { game, players: [player] } = gameWithPlayers();
  const artifactDef = baseDef('Artifact', {}, { types: ['Artifact'], subtypes: [], power: undefined, toughness: undefined });
  put(game, player, artifactDef);
  put(game, player, artifactDef);
  const spell = put(game, player, baseDef('Affinity spell', costScript, { cost: '{5}' }), 'hand');
  assert.equal(spell.def.selfCostAdjust(game, spell, player), -2);
  assert.equal(game.manaSources(player, { card: spell }).some(source => source.m.viaConvoke), true,
    'improvise exposes artifacts as spell-payment sources');

  const cyclingDef = scriptedDef('Plainscycler', [
    { kind: 'mechanic-typecycling', subtype: 'Plains', cost: '{0}' },
  ], { cost: '{5}', types: ['Creature'] });
  const cycler = put(game, player, cyclingDef, 'hand');
  const plains = put(game, player, baseDef('Found Plains', {}, {
    types: ['Land'], subtypes: ['Plains'], super: ['Basic'], power: undefined, toughness: undefined,
  }), 'library');
  const filler = put(game, player, baseDef('Library filler'), 'library');
  const action = game.activatableList(player).find(entry => entry.card === cycler && entry.cycling);
  assert.ok(action);
  assert.equal(await game.activateAbility(player, action), true);
  await resolveAll(game);
  assert.equal(plains.zone, 'hand');
  assert.equal(player.hand.includes(plains), true);
  assert.equal(player.hand.includes(filler), false, 'typecycling did not draw the top card');
  assert.equal(cycler.zone, 'graveyard');
});
