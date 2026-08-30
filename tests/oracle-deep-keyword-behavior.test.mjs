import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];

function keywordRows() {
  return MTG.ORACLE_BATCHES.flatMap(batch => batch.cards
    .filter(entry => entry.semanticClass !== 'manual-deck-semantic' &&
      (entry.implementedKeywords || []).length > 0)
    .map(entry => ({ batch, entry })));
}

function mechanic(rawKeyword) {
  const keyword = String(rawKeyword || '').trim().toLowerCase();
  return keyword.startsWith('ward ') ? 'ward' : keyword;
}

function fallbackDecision(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'mulligan') return false;
  if (query.type === 'bottomCards') return [];
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseX') return Math.min(query.max, Math.max(query.min || 0, 1));
  if (query.type === 'chooseMulti') {
    return query.options.slice(0, query.min || query.count || 0).map(option => option.key);
  }
  if (query.type === 'chooseManaSources') {
    return (query.sources || query.candidates || []).slice(0, query.count || query.min || 0);
  }
  if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
  if (query.type === 'orderTriggers') return query.triggers.slice();
  if (query.type === 'cardReveal' || query.type === 'threatAlert' || query.type === 'manualResolve') return 'ok';
  return null;
}

function fixtureDefinition(name, types = ['Creature'], extras = {}) {
  return Object.assign({
    name,
    cost: types.includes('Land') ? null : '{1}',
    super: [],
    types,
    subtypes: [],
    oracle: '',
    power: types.includes('Creature') ? '2' : undefined,
    toughness: types.includes('Creature') ? '2' : undefined,
  }, extras);
}

function zoneCard(player, definition, zone) {
  const def = typeof definition === 'string' ? MTG.DEFS[definition] : definition;
  const card = new MTG.CardInst(def, player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function permanent(game, player, definition, opts = {}) {
  const def = typeof definition === 'string' ? MTG.DEFS[definition] : definition;
  const card = new MTG.CardInst(def, player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = !!opts.sick;
  if (opts.plusCounters) card.counters['+1/+1'] = opts.plusCounters;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function fillLibrary(player, n = 100) {
  for (let index = 0; index < n; index++) zoneCard(player, 'Forest', 'library');
}

function seedFor(name, role, salt = 0) {
  let seed = role === 'ai' ? 860_000 : 850_000;
  for (const char of name) seed = (seed * 33 + char.codePointAt(0)) % 2_000_000_000;
  return seed + salt;
}

function humanCastController(card, state) {
  return {
    decide: async (game, query) => {
      state.trace.push(query.type);
      if (query.type === 'chooseTargets' && state.preferredTargets?.length) {
        const legal = state.preferredTargets.filter(target => query.candidates.includes(target));
        if (legal.length >= (query.min || 0)) return legal.slice(0, query.max || legal.length);
      }
      if (query.type === 'main' && !state.submitted) {
        const cast = query.casts.find(candidate => candidate.card === card);
        if (cast) {
          state.submitted = true;
          return { kind: 'cast', card: cast.card, alt: cast.alt, from: cast.from };
        }
      }
      if (query.type === 'priority' && !state.submitted) {
        const cast = query.casts.find(candidate => candidate.card === card);
        if (cast) {
          state.submitted = true;
          return { kind: 'cast', card: cast.card, alt: cast.alt, from: cast.from };
        }
      }
      return fallbackDecision(query);
    },
  };
}

async function castThroughController(entry, role) {
  const state = { submitted: false, trace: [], preferredTargets: [] };
  const game = new MTG.Game({
    seed: seedFor(entry.raw.name, role), paced: false, maxTurns: 4, difficulty: 'hard',
  });
  const player = game.addPlayer(
    role === 'ai' ? 'Keyword bot' : 'Keyword human',
    { name: `${role} keyword ${entry.raw.name}` },
    null,
    role === 'ai',
  );
  const opponent = game.addPlayer(
    'Keyword pass opponent',
    { name: 'Keyword pass opponent' },
    { decide: async (currentGame, query) => fallbackDecision(query) },
    false,
  );
  player.life = 1000;
  opponent.life = 1000;
  fillLibrary(player);
  fillLibrary(opponent);
  for (const color of COLORS) player.pool[color] = 20;
  const card = zoneCard(player, entry.raw.name, 'hand');
  if (entry.raw.subtypes.includes('Aura')) {
    // Flash Auras need an actual legal host before priority can expose them.
    // Keep both attachment directions available so the real AI can choose the
    // beneficial own or harmful opposing target from the card semantics.
    const friendlyAuraHost = permanent(game, player, fixtureDefinition(`${entry.raw.name} friendly Aura host`));
    const hostileAuraHost = permanent(game, opponent, fixtureDefinition(`${entry.raw.name} hostile Aura host`, ['Creature'], {
      power: '6', toughness: '100',
    }));
    hostileAuraHost.tapped = true;
    const grants = (entry.implementation || []).filter(operation => operation.kind === 'attachment-grant');
    const harmful = grants.some(grant => grant.skipUntap || grant.cantAttack || grant.cantBlock ||
      Number(grant.power || 0) < 0 || Number(grant.toughness || 0) < 0);
    state.preferredTargets = [harmful ? hostileAuraHost : friendlyAuraHost];
  }
  if ((entry.implementation || []).some(operation => operation.kind === 'controlled-creature-pump-static')) {
    permanent(game, player, fixtureDefinition(`${entry.raw.name} robust anthem beneficiary`, ['Creature'], {
      cost: '{6}', power: '6', toughness: '100', oracle: '',
    }));
  }
  player.controller = role === 'ai'
    ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
    : humanCastController(card, state);

  game.turnNo = 8;
  game.turnPlayer = player;
  game.phase = 'main1';
  game.step = 'main';
  game.recalc();

  const hasFlash = (entry.implementedKeywords || []).some(keyword => mechanic(keyword) === 'flash');
  if (hasFlash) {
    game.turnPlayer = opponent;
    game.phase = 'end';
    game.step = 'end';
    await game.priorityRound(opponent);
  } else {
    await game.mainPhase(player);
  }

  if (role === 'human') {
    assert.equal(state.submitted, true, `${entry.raw.name}/${role}: human was offered and cast the exact keyword card`);
  } else {
    assert.ok(player.controller instanceof MTG.AIController, `${entry.raw.name}/${role}: genuine local AI controller`);
    const decisions = (game.aiDecisionLog || []).filter(decision => decision.playerId === player.idx);
    assert.ok(decisions.some(decision => String(decision.chosen).includes(entry.raw.name)),
      `${entry.raw.name}/${role}: local AI chose the exact card (${decisions.map(decision => decision.chosen).join(' | ')})`);
    assert.equal(decisions.some(decision => decision.fallback), false,
      `${entry.raw.name}/${role}: keyword-card cast used no AI fallback`);
  }

  assert.ok(card.castMeta, `${entry.raw.name}/${role}: real paid cast metadata`);
  assert.equal(card.castMeta.alt.free, undefined, `${entry.raw.name}/${role}: controller cast was not free`);
  const expectedZone = Number(entry.raw.toughness) <= 0 ? 'graveyard' : 'battlefield';
  assert.equal(card.zone, expectedZone, `${entry.raw.name}/${role}: keyword creature resolves and SBA completes`);
  if (card.zone === 'battlefield') {
    game.recalc();
    for (const declared of entry.implementedKeywords) {
      const keyword = mechanic(declared);
      if (keyword === 'ward') assert.ok(card.cur.wardCost, `${entry.raw.name}/${role}: Ward is active after resolution`);
      else assert.equal(card.kw(keyword), true, `${entry.raw.name}/${role}: ${declared} is active after resolution`);
    }
  }
  return { game, player, opponent, card, state, hasFlash };
}

function combatHumanController(state) {
  return {
    decide: async (game, query) => {
      if (query.type === 'attackers') {
        return state.source && query.eligible.includes(state.source)
          ? [{ card: state.source, target: state.opponent }]
          : [];
      }
      return fallbackDecision(query);
    },
  };
}

function blockingController(state) {
  return {
    decide: async (game, query) => {
      if (query.type === 'blockers' && state.blocker && query.potential.includes(state.blocker) &&
        query.attackers.includes(state.source)) {
        return [{ blocker: state.blocker, attacker: state.source }];
      }
      return fallbackDecision(query);
    },
  };
}

function behaviorGame(entry, role) {
  const state = { source: null, opponent: null, blocker: null };
  const game = new MTG.Game({
    seed: seedFor(entry.raw.name, role, 101), paced: false, maxTurns: 4, difficulty: 'hard',
  });
  const player = game.addPlayer(
    role === 'ai' ? 'Keyword behavior bot' : 'Keyword behavior human',
    { name: `${role} behavior ${entry.raw.name}` },
    null,
    role === 'ai',
  );
  const opponent = game.addPlayer(
    'Keyword behavior opponent',
    { name: 'Keyword behavior opponent' },
    blockingController(state),
    false,
  );
  state.opponent = opponent;
  player.controller = role === 'ai'
    ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
    : combatHumanController(state);
  player.life = 1000;
  opponent.life = 1000;
  fillLibrary(player);
  fillLibrary(opponent);
  for (const color of COLORS) player.pool[color] = 20;
  game.turnNo = 8;
  game.turnPlayer = player;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  game.reviewCombatWithHuman = async () => {};

  // Force of Savagery is the sole zero-toughness keyword card.  Its normal
  // controller cast is proven above (including the real SBA death); one
  // +1/+1 counter keeps a second real CardInst alive solely for its Trample
  // rules probe.
  const plusCounters = Number(entry.raw.toughness) <= 0 ? 1 : 0;
  const source = permanent(game, player, entry.raw.name, { plusCounters });
  source.sick = false;
  source.tapped = false;
  state.source = source;
  game.recalc();
  return { game, player, opponent, source, state };
}

function colorsNotShared(source) {
  return ['W', 'U', 'B', 'R', 'G'].filter(color => !source.colors.includes(color));
}

function compatibleBlocker(context, label, opts = {}) {
  const { game, opponent, source } = context;
  const keywords = [];
  if (source.kw('flying') && !opts.omitFlyingAnswer) keywords.push('reach');
  if (source.kw('shadow') && !opts.omitShadowAnswer) keywords.push('shadow');
  if (source.kw('horsemanship') && !opts.omitHorsemanshipAnswer) keywords.push('horsemanship');
  for (const keyword of opts.keywords || []) if (!keywords.includes(keyword)) keywords.push(keyword);
  // Default to a colorless, nonartifact creature so a probe for Flying,
  // Menace, Skulk, etc. is not accidentally answered by the source card's
  // independent protection ability. Fear/Intimidate request the relevant
  // colors and artifact type explicitly below.
  const colorsOverride = opts.colorsOverride || [];
  const types = opts.artifact === true ? ['Artifact', 'Creature'] : ['Creature'];
  return permanent(game, opponent, fixtureDefinition(label, types, {
    colorsOverride,
    kws: keywords,
    power: String(opts.power ?? Math.max(0, source.power)),
    toughness: String(opts.toughness ?? 100),
  }));
}

async function settle(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 100) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 100, 'keyword behavior Stack settled');
}

async function proveAttackKeyword(context, keyword, role) {
  const { game, player, opponent, source, state } = context;
  if (source.power < 5) game.addCounters(source, '+1/+1', 5 - source.power, false, player);
  source.tapped = false;
  source.sick = keyword === 'haste';
  opponent.life = Math.max(1, source.power);

  if (keyword === 'menace') {
    state.blocker = compatibleBlocker(context, `${source.name} single menace blocker`, {
      power: 0, toughness: 100,
    });
    assert.equal(game.canBlock(state.blocker, source), true,
      `${source.name}/${role}: the proposed single blocker is otherwise legal`);
  }

  const lifeBefore = opponent.life;
  await game.combatPhase(player);
  assert.equal(player.turnState.attacked, true, `${source.name}/${role}: ${keyword} card attacks through real combat`);
  assert.ok(opponent.life < lifeBefore, `${source.name}/${role}: ${keyword} attack deals combat damage`);
  if (keyword === 'haste') {
    assert.ok(game.log.some(item => item.msg.includes(`${source.name} attacks`)),
      `${source.name}/${role}: summoning-sick Haste creature was declared`);
  } else if (keyword === 'vigilance') {
    assert.equal(source.tapped, false, `${source.name}/${role}: Vigilance attack does not tap`);
  } else {
    assert.ok(game.log.some(item => item.msg.includes('has menace') && item.msg.includes('one blocker')),
      `${source.name}/${role}: a single otherwise-legal blocker is rejected by Menace`);
  }
}

async function proveKeywordBehavior(entry, declared, role, runtimeOccurrences) {
  const keyword = mechanic(declared);
  const context = behaviorGame(entry, role);
  const { game, player, opponent, source } = context;

  // Printed combat keywords on Vehicles are only operational after the
  // Vehicle becomes a creature. Exercise the actual Crew activated ability
  // (including its cost and Stack resolution) before probing those keywords.
  if (source.hasSub('Vehicle')) {
    const crewPower = Math.max(1, Number(source.def.crew) || 1);
    const crewMember = permanent(game, player, fixtureDefinition(`${source.name} keyword crew`, ['Creature'], {
      power: String(crewPower), toughness: String(crewPower),
    }));
    const crewAction = game.activatableList(player).find(action => action.card === source && action.crew);
    assert.ok(crewAction, `${source.name}/${role}: printed Crew action is available for keyword proof`);
    assert.equal(await game.activateAbility(player, crewAction), true,
      `${source.name}/${role}: Crew cost is paid through the real activation path`);
    await settle(game);
    assert.equal(crewMember.tapped, true, `${source.name}/${role}: Crew taps the selected creature`);
    assert.equal(source.is('Creature'), true, `${source.name}/${role}: Crew resolution animates the Vehicle`);
  }

  if (keyword === 'ward') assert.ok(source.cur.wardCost, `${source.name}/${role}: active Ward cost`);
  else assert.equal(source.kw(keyword), true, `${source.name}/${role}: active ${declared}`);

  switch (keyword) {
    case 'flying': {
      const ground = compatibleBlocker(context, `${source.name} ground blocker`, {
        omitFlyingAnswer: true,
      });
      const reach = compatibleBlocker(context, `${source.name} reach blocker`, { keywords: ['reach'] });
      assert.equal(game.canBlock(ground, source), false, `${source.name}/${role}: Flying evades a ground blocker`);
      assert.equal(game.canBlock(reach, source), true, `${source.name}/${role}: Reach answers that Flying instance`);
      break;
    }
    case 'reach': {
      const attackerKeywords = ['flying'];
      if (source.kw('shadow')) attackerKeywords.push('shadow');
      if (source.kw('horsemanship')) attackerKeywords.push('horsemanship');
      const flyer = permanent(game, opponent, fixtureDefinition(`${source.name} flying attacker`, ['Creature'], {
        kws: attackerKeywords, power: '2', toughness: '2',
      }));
      assert.equal(game.canBlock(source, flyer), true, `${source.name}/${role}: Reach blocks Flying`);
      break;
    }
    case 'forestwalk':
    case 'plainswalk':
    case 'islandwalk':
    case 'swampwalk':
    case 'mountainwalk': {
      const blocker = compatibleBlocker(context, `${source.name} landwalk blocker`);
      assert.equal(game.canBlock(blocker, source), true,
        `${source.name}/${role}: blocker is legal before the named land exists`);
      const land = keyword.replace('walk', '');
      const basic = land.charAt(0).toUpperCase() + land.slice(1);
      permanent(game, opponent, basic);
      assert.equal(game.canBlock(blocker, source), false,
        `${source.name}/${role}: ${keyword} turns on only against the matching land controller`);
      break;
    }
    case 'fear': {
      const nonblack = compatibleBlocker(context, `${source.name} nonblack nonartifact`, {
        artifact: false, colorsOverride: ['W'],
      });
      const black = compatibleBlocker(context, `${source.name} black blocker`, {
        artifact: false, colorsOverride: ['B'],
      });
      const artifact = compatibleBlocker(context, `${source.name} artifact blocker`, { artifact: true });
      assert.equal(game.canBlock(nonblack, source), false, `${source.name}/${role}: Fear excludes nonblack nonartifact`);
      assert.equal(game.canBlock(black, source), true, `${source.name}/${role}: black creature blocks Fear`);
      assert.equal(game.canBlock(artifact, source), true, `${source.name}/${role}: artifact creature blocks Fear`);
      break;
    }
    case 'intimidate': {
      const otherColor = colorsNotShared(source)[0] || 'W';
      const nonshared = compatibleBlocker(context, `${source.name} nonshared-color blocker`, {
        artifact: false, colorsOverride: [otherColor],
      });
      const artifact = compatibleBlocker(context, `${source.name} artifact blocker`, { artifact: true });
      assert.equal(game.canBlock(nonshared, source), false,
        `${source.name}/${role}: Intimidate excludes a nonartifact without a shared color`);
      assert.equal(game.canBlock(artifact, source), true, `${source.name}/${role}: artifact blocks Intimidate`);
      if (source.colors.length) {
        const shared = compatibleBlocker(context, `${source.name} shared-color blocker`, {
          artifact: false, colorsOverride: [source.colors[0]],
        });
        assert.equal(game.canBlock(shared, source), true, `${source.name}/${role}: shared color blocks Intimidate`);
      }
      break;
    }
    case 'skulk': {
      const stronger = compatibleBlocker(context, `${source.name} stronger blocker`, {
        power: source.power + 1,
      });
      const equal = compatibleBlocker(context, `${source.name} equal blocker`, { power: source.power });
      assert.equal(game.canBlock(stronger, source), false, `${source.name}/${role}: greater power cannot block Skulk`);
      assert.equal(game.canBlock(equal, source), true, `${source.name}/${role}: equal power can block Skulk`);
      break;
    }
    case 'shadow': {
      const normal = compatibleBlocker(context, `${source.name} non-Shadow blocker`, { omitShadowAnswer: true });
      const shadow = compatibleBlocker(context, `${source.name} Shadow blocker`, { keywords: ['shadow'] });
      assert.equal(game.canBlock(normal, source), false, `${source.name}/${role}: non-Shadow cannot block Shadow`);
      assert.equal(game.canBlock(shadow, source), true, `${source.name}/${role}: Shadow blocks Shadow`);
      break;
    }
    case 'horsemanship': {
      const normal = compatibleBlocker(context, `${source.name} unmounted blocker`, { omitHorsemanshipAnswer: true });
      const mounted = compatibleBlocker(context, `${source.name} Horsemanship blocker`, { keywords: ['horsemanship'] });
      assert.equal(game.canBlock(normal, source), false, `${source.name}/${role}: creature without Horsemanship cannot block`);
      assert.equal(game.canBlock(mounted, source), true, `${source.name}/${role}: Horsemanship blocks Horsemanship`);
      break;
    }
    case 'menace':
    case 'haste':
    case 'vigilance':
      await proveAttackKeyword(context, keyword, role);
      break;
    case 'first strike': {
      if (source.power < 1) game.addCounters(source, '+1/+1', 1 - source.power, false, player);
      assert.ok(game.dmgAmount(source, 'first') > 0, `${source.name}/${role}: First strike deals in the first step`);
      source.meta._dealtFirstStrike = true;
      if (!source.kw('double strike')) {
        assert.equal(game.dmgAmount(source, 'normal'), 0,
          `${source.name}/${role}: First strike alone does not deal normal-step damage`);
      }
      break;
    }
    case 'double strike': {
      if (source.power < 1) game.addCounters(source, '+1/+1', 1 - source.power, false, player);
      assert.ok(game.dmgAmount(source, 'first') > 0, `${source.name}/${role}: Double strike deals in first step`);
      source.meta._dealtFirstStrike = true;
      assert.ok(game.dmgAmount(source, 'normal') > 0, `${source.name}/${role}: Double strike also deals in normal step`);
      break;
    }
    case 'deathtouch': {
      const victim = permanent(game, opponent, fixtureDefinition(`${source.name} deathtouch victim`, ['Creature'], {
        power: '0', toughness: '100',
      }));
      await game.damageCreature(source, victim, 1);
      assert.equal(victim.zone, 'graveyard', `${source.name}/${role}: one Deathtouch damage is lethal`);
      break;
    }
    case 'lifelink': {
      const lifeBefore = player.life;
      await game.damagePlayer(source, opponent, 2);
      assert.equal(player.life, lifeBefore + 2, `${source.name}/${role}: Lifelink gains the exact damage dealt`);
      break;
    }
    case 'trample': {
      if (source.power < 5) game.addCounters(source, '+1/+1', 5 - source.power, false, player);
      const victim = permanent(game, opponent, fixtureDefinition(`${source.name} trample blocker`, ['Creature'], {
        power: '0', toughness: '2',
      }));
      source.attacking = opponent;
      source.blockedBy = [victim];
      source.wasBlocked = true;
      victim.blocking = source.iid;
      game.combat = { attackers: [source], defenders: new Map([[opponent.idx, [source]]]) };
      const lifeBefore = opponent.life;
      await game.combatDamage(player, 'normal');
      assert.ok(opponent.life < lifeBefore, `${source.name}/${role}: excess combat damage Tramples over`);
      break;
    }
    case 'wither': {
      const victim = permanent(game, opponent, fixtureDefinition(`${source.name} wither victim`, ['Creature'], {
        power: '0', toughness: '100',
      }));
      await game.damageCreature(source, victim, 2);
      assert.equal(victim.damage, 0, `${source.name}/${role}: Wither does not mark ordinary damage`);
      assert.equal(victim.counters['-1/-1'], 2, `${source.name}/${role}: Wither deals damage as -1/-1 counters`);
      break;
    }
    case 'defender': {
      if (source.power < 5) game.addCounters(source, '+1/+1', 5 - source.power, false, player);
      source.sick = false;
      const lifeBefore = opponent.life;
      assert.equal(game.canAttackAtAll(source), false, `${source.name}/${role}: Defender attack restriction is active`);
      await game.combatPhase(player);
      assert.equal(!!player.turnState.attacked, false, `${source.name}/${role}: Defender is absent from real attackers choice`);
      assert.equal(opponent.life, lifeBefore, `${source.name}/${role}: Defender deals no combat damage`);
      break;
    }
    case 'indestructible': {
      await game.destroy(source);
      assert.equal(source.zone, 'battlefield', `${source.name}/${role}: Indestructible survives destroy`);
      await game.damageCreature(null, source, source.toughness + 5);
      assert.equal(source.zone, 'battlefield', `${source.name}/${role}: Indestructible survives lethal damage SBA`);
      break;
    }
    case 'hexproof': {
      const hostile = permanent(game, opponent, fixtureDefinition(`${source.name} hostile targeting source`));
      assert.equal(game.legalTargets({ what: 'creature' }, hostile, opponent).includes(source), false,
        `${source.name}/${role}: opponent cannot target Hexproof`);
      assert.equal(game.legalTargets({ what: 'creature' }, source, player).includes(source), true,
        `${source.name}/${role}: controller can target its own Hexproof permanent`);
      break;
    }
    case 'shroud': {
      const hostile = permanent(game, opponent, fixtureDefinition(`${source.name} hostile targeting source`));
      assert.equal(game.legalTargets({ what: 'creature' }, hostile, opponent).includes(source), false,
        `${source.name}/${role}: opponent cannot target Shroud`);
      assert.equal(game.legalTargets({ what: 'creature' }, source, player).includes(source), false,
        `${source.name}/${role}: controller also cannot target Shroud`);
      break;
    }
    case 'ward': {
      opponent.controller = {
        decide: async (currentGame, query) => {
          if (query.type === 'chooseTargets' && query.candidates.includes(source)) return [source];
          return fallbackDecision(query);
        },
      };
      for (const color of COLORS) opponent.pool[color] = 0;
      const murder = zoneCard(opponent, 'Murder', 'hand');
      assert.equal(await game.castSpell(opponent, murder, { from: 'hand', alt: { free: true } }), true,
        `${source.name}/${role}: hostile target spell enters the actual Stack`);
      await settle(game);
      assert.equal(murder.zone, 'graveyard', `${source.name}/${role}: unpaid Ward counters the hostile spell`);
      assert.equal(source.zone, 'battlefield', `${source.name}/${role}: Ward target survives the countered spell`);
      assert.ok(game.log.some(item => item.msg.includes('Ward counters')),
        `${source.name}/${role}: Ward counter outcome is recorded`);
      break;
    }
    case 'flash': {
      const card = zoneCard(player, entry.raw.name, 'hand');
      if (entry.raw.subtypes.includes('Aura')) {
        permanent(game, player, fixtureDefinition(`${source.name} Flash timing host`));
        permanent(game, opponent, fixtureDefinition(`${source.name} hostile Flash timing host`));
      }
      game.turnPlayer = opponent;
      game.phase = 'end';
      game.step = 'end';
      assert.equal(game.canCastTiming(player, card), true,
        `${source.name}/${role}: Flash grants legal off-turn timing`);
      assert.ok(game.castableList(player).some(candidate => candidate.card === card),
        `${source.name}/${role}: Flash card is exposed in the real castable list`);
      break;
    }
    case 'prowess': {
      const triggerCount = (source.def.triggers || []).filter(trigger => trigger.desc === 'Prowess').length;
      assert.equal(triggerCount, runtimeOccurrences,
        `${source.name}/${role}: every printed Prowess instance compiled as its own trigger`);
      const powerBefore = source.power;
      const spell = zoneCard(player, 'Brilliant Plan', 'hand');
      assert.equal(await game.castSpell(player, spell, { from: 'hand', alt: { free: true } }), true,
        `${source.name}/${role}: real noncreature spell enters the Stack`);
      await settle(game);
      assert.equal(source.power, powerBefore + runtimeOccurrences,
        `${source.name}/${role}: all ${runtimeOccurrences} Prowess runtime instance(s) resolve`);
      break;
    }
    default:
      assert.fail(`${entry.raw.name}/${role}: no deep behavior proof for ${declared}`);
  }
  return runtimeOccurrences;
}

test('svih 1.008 keyword karata prolazi human/AI cast, a svaka sposobnost rules probe u oba konteksta', async t => {
  const rows = keywordRows();
  const singleKeywordRows = rows.filter(({ entry }) => entry.implementedKeywords.length === 1);
  const multiKeywordRows = rows.filter(({ entry }) => entry.implementedKeywords.length > 1);
  const declarations = rows.reduce((sum, { entry }) => sum + entry.implementedKeywords.length, 0);
  const runtimeInstances = rows.reduce((sum, { entry }) => sum + entry.implementedKeywords.reduce((inner, declared) => {
    if (mechanic(declared) !== 'prowess') return inner + 1;
    return inner + Math.max(1, (MTG.DEFS[entry.raw.name].triggers || [])
      .filter(trigger => trigger.desc === 'Prowess').length);
  }, 0), 0);

  assert.deepEqual(
    { cards: rows.length, single: singleKeywordRows.length, multi: multiKeywordRows.length, declarations, runtimeInstances },
    { cards: 1008, single: 789, multi: 219, declarations: 1261, runtimeInstances: 1262 },
    'frozen 2,600-card keyword cohort',
  );

  let controllerCasts = 0;
  let declarationChecks = 0;
  let runtimeBehaviorProofs = 0;
  const mechanicCounts = {};
  for (const { batch, entry } of rows) {
    for (const role of ['human', 'ai']) {
      const castContext = await castThroughController(entry, role);
      controllerCasts++;
      if ((entry.implementedKeywords || []).some(keyword => mechanic(keyword) === 'flash')) {
        assert.equal(castContext.game.turnPlayer, castContext.opponent,
          `${batch.id}/${entry.raw.name}/${role}: Flash cast was completed on the opponent's turn`);
      }

      for (const declared of entry.implementedKeywords) {
        const keyword = mechanic(declared);
        const occurrences = keyword === 'prowess'
          ? Math.max(1, (MTG.DEFS[entry.raw.name].triggers || []).filter(trigger => trigger.desc === 'Prowess').length)
          : 1;
        runtimeBehaviorProofs += await proveKeywordBehavior(entry, declared, role, occurrences);
        declarationChecks++;
        mechanicCounts[keyword] = (mechanicCounts[keyword] || 0) + occurrences;
      }
    }
  }

  assert.equal(controllerCasts, rows.length * 2, 'one genuine controller cast per keyword card and role');
  assert.equal(declarationChecks, declarations * 2, 'one functional check per declared card keyword and role');
  assert.equal(runtimeBehaviorProofs, runtimeInstances * 2, 'every runtime keyword instance functionally executed in both roles');
  t.diagnostic(`ORACLE_KEYWORD_BEHAVIOR cards=${rows.length}/${rows.length} controllerCasts=${controllerCasts}/${rows.length * 2} ` +
    `singleKeywordCards=${singleKeywordRows.length} singleControllerRuns=${singleKeywordRows.length * 2} ` +
    `declarations=${declarationChecks}/${declarations * 2} runtimeInstances=${runtimeBehaviorProofs}/${runtimeInstances * 2} failures=0`);
  t.diagnostic(`ORACLE_KEYWORD_BEHAVIOR_MATRIX ${JSON.stringify(Object.fromEntries(Object.entries(mechanicCounts).sort()))}`);
});
