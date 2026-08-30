import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './helpers/load-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function genericBatches(MTG) {
  return MTG.ORACLE_BATCHES.filter(batch => batch.cards.some(entry => entry.semanticClass !== 'manual-deck-semantic'));
}

function genericEntries(MTG) {
  return genericBatches(MTG).flatMap(batch => batch.cards
    .filter(entry => entry.semanticClass !== 'manual-deck-semantic')
    .map(entry => ({ batch, entry })));
}

function decision(overrides = {}) {
  return {
    decide: async (game, query) => {
      if (overrides[query.type]) return overrides[query.type](game, query);
      if (query.type === 'priority') return { kind: 'pass' };
      if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
      if (query.type === 'chooseOption') return query.options[0]?.key;
      if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
      if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
      if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
      return null;
    },
  };
}

function gameFor(MTG, controllers = [decision(), decision()]) {
  const game = new MTG.Game({ seed: 1007, paced: false, maxTurns: 5 });
  const a = game.addPlayer('Oracle A', { name: 'Oracle A' }, controllers[0], false);
  const b = game.addPlayer('Oracle B', { name: 'Oracle B' }, controllers[1], true);
  game.turnPlayer = a;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  game.reviewCombatWithHuman = async () => {};
  return { game, a, b };
}

function permanent(MTG, game, player, definition) {
  const def = typeof definition === 'string' ? MTG.DEFS[definition] : definition;
  const card = new MTG.CardInst(def, player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function zoneCard(MTG, player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 100) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 100, 'Oracle interaction stack did not settle');
}

function mechanic(keyword) {
  const value = String(keyword).toLowerCase();
  return value.startsWith('ward ') ? 'ward' : value;
}

function declaredKeywordOccurrences(MTG, entry) {
  const occurrences = [];
  for (const declared of entry.implementedKeywords || []) {
    const key = mechanic(declared);
    const count = key === 'prowess'
      ? Math.max(1, (MTG.DEFS[entry.raw.name].triggers || []).filter(trigger => trigger.desc === 'Prowess').length)
      : 1;
    for (let index = 0; index < count; index++) occurrences.push(declared);
  }
  return occurrences;
}

function fixtureDefinition(name, types = ['Creature'], extras = {}) {
  return Object.assign({
    name,
    cost: types.includes('Land') ? null : '{1}',
    super: [],
    types,
    subtypes: [],
    oracle: '',
    power: types.includes('Creature') ? '20000' : undefined,
    toughness: types.includes('Creature') ? '20000' : undefined,
  }, extras);
}

function fillLibrary(MTG, player, n) {
  for (let index = 0; index < n; index++) zoneCard(MTG, player, 'Forest', 'library');
}

function poolTotal(player) {
  return Object.values(player.pool).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function baseContract(entry) {
  if (entry.raw.types.includes('Land')) return 'land-play';
  if (entry.raw.types.some(type => type === 'Instant' || type === 'Sorcery')) return 'spell-casting';
  if (entry.raw.types.includes('Creature')) return 'creature-casting';
  return null;
}

async function enterPermanentProof(MTG, context, entry) {
  const { game, a } = context;
  const card = zoneCard(MTG, a, entry.raw.name, 'hand');
  if (entry.raw.types.includes('Land')) {
    assert.equal(await game.playLand(a, card), true, `${card.name}: real land-play path`);
    assert.equal(card.zone, 'battlefield', `${card.name}: land enters battlefield`);
  } else {
    assert.equal(await game.castSpell(a, card, { alt: { free: true } }), true, `${card.name}: free cast enters the real stack`);
    assert.equal(card.zone, 'stack', `${card.name}: stack zone`);
    await resolveAll(game);
    const expectedZone = Number(entry.raw.toughness) <= 0 ? 'graveyard' : 'battlefield';
    assert.equal(card.zone, expectedZone,
      `${card.name}: resolves and state-based actions are applied (library=${a.library.length}, lost=${a.lost}, log=${game.log.slice(-4).map(item => item.msg).join(' | ')})`);
  }
  await resolveAll(game);
  return card;
}

async function cardProof(MTG, entry) {
  const context = gameFor(MTG);
  if (entry.raw.types.includes('Land') || entry.raw.types.includes('Creature')) {
    const card = await enterPermanentProof(MTG, context, entry);
    if (entry.semanticClass === 'vanilla' && card.zone === 'battlefield') {
      assert.equal(card.power, Number(entry.raw.power), `${card.name}: vanilla power`);
      assert.equal(card.toughness, Number(entry.raw.toughness), `${card.name}: vanilla toughness`);
    }
    return 1;
  }
  assert.fail(`${entry.raw.name}: spell-template card must be executed by its operation proof`);
}

function targetPermanent(MTG, game, player, what) {
  if (what === 'land') return permanent(MTG, game, player, 'Forest');
  if (what === 'artifact' || what === 'artifact or enchantment') {
    return permanent(MTG, game, player, fixtureDefinition('Oracle Artifact Target', ['Artifact']));
  }
  if (what === 'enchantment') {
    return permanent(MTG, game, player, fixtureDefinition('Oracle Enchantment Target', ['Enchantment']));
  }
  return permanent(MTG, game, player, fixtureDefinition('Oracle Creature Target'));
}

async function operationProof(MTG, entry, operation) {
  let wantedTarget = null;
  let selectionQuery = null;
  let selectedLibraryCard = null;
  const chooser = decision({
    chooseTargets: (game, query) => {
      if (wantedTarget && query.candidates.includes(wantedTarget)) return [wantedTarget];
      return query.candidates.slice(0, query.min || 0);
    },
    scry: (game, query) => {
      selectionQuery = query;
      selectedLibraryCard = query.cards[0] || null;
      return { top: query.cards.slice(1), bottom: selectedLibraryCard ? [selectedLibraryCard] : [] };
    },
  });
  const context = gameFor(MTG, [chooser, decision()]);
  const { game, a, b } = context;
  const name = entry.raw.name;

  if (!operation.kind.startsWith('spell-')) {
    fillLibrary(MTG, a, Math.max(12, (Number(operation.n) || 0) + 2));
    const lifeBefore = a.life;
    const libraryBefore = a.library.length;
    const tokenBefore = game.battlefield.filter(card => card.isToken && card.ctrl === a).length;
    const source = await enterPermanentProof(MTG, context, entry);

    if (operation.kind === 'enters-tapped') {
      assert.equal(source.tapped, true, `${name}: enters-tapped replacement`);
      return 1;
    }
    if (operation.kind === 'etb-life-gain') {
      assert.equal(a.life, lifeBefore + operation.n, `${name}: exact ETB life gain`);
      return 1;
    }
    if (operation.kind === 'etb-draw') {
      assert.equal(a.library.length, libraryBefore - operation.n, `${name}: exact ETB draw`);
      return 1;
    }
    if (operation.kind === 'etb-scry' || operation.kind === 'etb-surveil') {
      assert.ok(selectionQuery, `${name}: library selection decision executed`);
      assert.equal(selectionQuery.cards.length, operation.n, `${name}: exact ${operation.kind} count`);
      assert.equal(!!selectionQuery.surveil, operation.kind === 'etb-surveil', `${name}: scry/surveil mode`);
      if (operation.kind === 'etb-surveil') assert.equal(selectedLibraryCard.zone, 'graveyard', `${name}: surveil selection moves to graveyard`);
      else {
        assert.equal(selectedLibraryCard.zone, 'library', `${name}: scry selection remains in library`);
        assert.equal(a.library[0], selectedLibraryCard, `${name}: scry selection moves to bottom`);
      }
      return 1;
    }
    if (operation.kind === 'etb-token') {
      const made = game.battlefield.filter(card => card.isToken && card.ctrl === a).slice(tokenBefore);
      assert.equal(made.length, operation.n, `${name}: exact token count`);
      for (const token of made) {
        assert.equal(token.name, operation.token.name, `${name}: token name`);
        assert.equal(token.power, Number(operation.token.power), `${name}: token power`);
        assert.equal(token.toughness, Number(operation.token.toughness), `${name}: token toughness`);
        for (const type of operation.token.types || ['Creature']) assert.equal(token.is(type), true, `${name}: token type ${type}`);
        for (const subtype of operation.token.subtypes || []) assert.equal(token.hasSub(subtype), true, `${name}: token subtype ${subtype}`);
        for (const keyword of operation.token.keywords || []) assert.equal(token.kw(keyword), true, `${name}: token keyword ${keyword}`);
      }
      return 1;
    }
    if (operation.kind === 'dies-draw') {
      const beforeDeath = a.library.length;
      await game.destroy(source);
      await resolveAll(game);
      assert.equal(source.zone, 'graveyard', `${name}: dies event source`);
      assert.equal(a.library.length, beforeDeath - operation.n, `${name}: exact dies draw`);
      return 1;
    }
    if (operation.kind === 'cant-block') {
      const attacker = permanent(MTG, game, b, 'Elite Vanguard');
      game.recalc();
      assert.equal(source.cur.cantBlock, true, `${name}: static cant-block marker`);
      assert.equal(game.canBlock(source, attacker), false, `${name}: blocker legality`);
      return 1;
    }
    if (operation.kind === 'must-attack') {
      source.sick = false;
      const before = b.life;
      await game.combatPhase(a);
      assert.ok(b.life < before, `${name}: omitted declaration is auto-forced into combat`);
      return 1;
    }
    if (operation.kind === 'mana-source') {
      source.tapped = false;
      source.sick = false;
      game.recalc();
      const sources = game.manaSources(a).filter(descriptor => descriptor.card === source);
      const wanted = JSON.stringify(operation.produce);
      const descriptor = sources.find(candidate => JSON.stringify(candidate.produce) === wanted);
      assert.ok(descriptor, `${name}: compiled mana source is discoverable`);
      const before = poolTotal(a);
      assert.equal(await game.activateManaSource(a, descriptor, descriptor.produce[0], null, []), true, `${name}: mana ability activates`);
      const expected = descriptor.produce[0].ANY ? Number(descriptor.produce[0].n || 1)
        : Object.entries(descriptor.produce[0]).filter(([key]) => key !== 'n')
          .reduce((sum, [, value]) => sum + Number(value || 0), 0);
      assert.equal(poolTotal(a), before + expected, `${name}: exact mana production`);
      assert.equal(source.tapped, true, `${name}: tap cost paid`);
      return 1;
    }
    assert.fail(`${name}: no executable operation proof for ${operation.kind}`);
  }

  let effectTarget = null;
  let counterTarget = null;
  if (operation.kind === 'spell-counter') {
    fillLibrary(MTG, b, 5);
    game.turnPlayer = b;
    const bait = zoneCard(MTG, b, 'Brilliant Plan', 'hand');
    assert.equal(await game.castSpell(b, bait, { alt: { free: true } }), true, `${name}: real opposing spell on stack`);
    counterTarget = game.stack.at(-1);
    wantedTarget = counterTarget;
    game.turnPlayer = a;
  } else if (operation.kind === 'spell-pump') {
    effectTarget = targetPermanent(MTG, game, a, 'creature');
    wantedTarget = effectTarget;
  } else if (operation.kind === 'spell-team-pump') {
    effectTarget = targetPermanent(MTG, game, a, 'creature');
  } else if (operation.kind === 'spell-discard') {
    for (let index = 0; index < operation.n + 2; index++) zoneCard(MTG, b, 'Forest', 'hand');
    wantedTarget = b;
  } else if (operation.kind === 'spell-mill') {
    fillLibrary(MTG, b, operation.n + 2);
    wantedTarget = b;
  } else if (operation.kind === 'spell-destroy' || operation.kind === 'spell-exile' || operation.kind === 'spell-bounce') {
    effectTarget = targetPermanent(MTG, game, b, operation.what);
    if (operation.kind === 'spell-destroy' && operation.noRegen) effectTarget.regenShield = 1;
    wantedTarget = effectTarget;
  } else if (operation.kind === 'spell-damage' && operation.what !== 'each opponent') {
    if (operation.what === 'target creature' || operation.what === 'target creature or planeswalker') {
      effectTarget = targetPermanent(MTG, game, b, 'creature');
      wantedTarget = effectTarget;
    } else wantedTarget = b;
  }

  if (operation.kind === 'spell-draw') fillLibrary(MTG, a, operation.n + 2);
  const lifeA = a.life;
  const lifeB = b.life;
  const libraryA = a.library.length;
  const libraryB = b.library.length;
  const handB = b.hand.length;
  const powerBefore = effectTarget && effectTarget.power;
  const toughnessBefore = effectTarget && effectTarget.toughness;
  const spell = zoneCard(MTG, a, name, 'hand');
  const castOptions = operation.n === 'X' ? { from: 'hand', xVal: 3 } : { from: 'hand', alt: { free: true } };
  if (operation.n === 'X') for (const color of Object.keys(a.pool)) a.pool[color] = 20;
  assert.equal(await game.castSpell(a, spell, castOptions), true, `${name}: spell-template casts through real target/Stack path`);
  assert.equal(spell.zone, 'stack', `${name}: spell card is on Stack`);
  await resolveAll(game);
  assert.equal(spell.zone, 'graveyard', `${name}: instant/sorcery resolves to graveyard`);

  if (operation.kind === 'spell-draw') assert.equal(a.library.length, libraryA - operation.n, `${name}: exact spell draw`);
  else if (operation.kind === 'spell-counter') assert.equal(counterTarget.card.zone, 'graveyard', `${name}: targeted spell is countered`);
  else if (operation.kind === 'spell-destroy') {
    assert.equal(effectTarget.zone, 'graveyard', operation.noRegen
      ? `${name}: target with a regeneration shield is still destroyed`
      : `${name}: target destroyed`);
  }
  else if (operation.kind === 'spell-exile') assert.equal(effectTarget.zone, 'exile', `${name}: target exiled`);
  else if (operation.kind === 'spell-bounce') assert.equal(effectTarget.zone, 'hand', `${name}: target returned to hand`);
  else if (operation.kind === 'spell-life-gain') assert.equal(a.life, lifeA + operation.n, `${name}: exact spell life gain`);
  else if (operation.kind === 'spell-discard') assert.equal(b.hand.length, handB - operation.n, `${name}: exact discard`);
  else if (operation.kind === 'spell-mill') assert.equal(b.library.length, libraryB - operation.n, `${name}: exact mill`);
  else if (operation.kind === 'spell-pump' || operation.kind === 'spell-team-pump') {
    assert.equal(effectTarget.power, powerBefore + operation.power, `${name}: exact power modifier`);
    assert.equal(effectTarget.toughness, toughnessBefore + operation.toughness, `${name}: exact toughness modifier`);
    for (const keyword of operation.keywords || []) assert.equal(effectTarget.kw(keyword), true, `${name}: grants ${keyword}`);
  } else if (operation.kind === 'spell-damage') {
    const amount = operation.n === 'X' ? 3 : operation.n;
    if (operation.what === 'target creature' || operation.what === 'target creature or planeswalker') {
      assert.equal(effectTarget.damage, amount, `${name}: exact creature damage`);
    } else assert.equal(b.life, lifeB - amount, `${name}: exact player/opponent damage`);
  } else assert.fail(`${name}: no post-resolution proof for ${operation.kind}`);
  return 1;
}

async function keywordProof(MTG, entry, rawKeyword) {
  const keyword = mechanic(rawKeyword);
  let attacker;
  let blocker;
  const attackController = decision({
    attackers: (game) => [{ card: attacker, target: game.players[1] }],
  });
  const blockController = decision({
    blockers: () => blocker ? [{ blocker, attacker }] : [],
  });
  const { game, a, b } = gameFor(MTG, [attackController, blockController]);
  const source = permanent(MTG, game, a, entry.raw.name);

  switch (keyword) {
    case 'flying': {
      const ground = permanent(MTG, game, b, 'Elite Vanguard');
      assert.equal(game.canBlock(ground, source), false, `${source.name}: flying evasion`);
      break;
    }
    case 'reach': {
      const flyer = permanent(MTG, game, b, 'A.I.M. Bot');
      assert.equal(game.canBlock(source, flyer), true, `${source.name}: reach blocks flying`);
      break;
    }
    case 'forestwalk':
    case 'plainswalk':
    case 'islandwalk':
    case 'swampwalk':
    case 'mountainwalk': {
      const land = keyword.replace('walk', '');
      const basic = land.charAt(0).toUpperCase() + land.slice(1);
      permanent(MTG, game, b, basic);
      const ground = permanent(MTG, game, b, 'Elite Vanguard');
      assert.equal(game.canBlock(ground, source), false, `${source.name}: ${keyword} evasion`);
      break;
    }
    case 'fear': {
      const ground = permanent(MTG, game, b, 'Elite Vanguard');
      const black = permanent(MTG, game, b, fixtureDefinition('Oracle Black Blocker', ['Creature'], { colorsOverride: ['B'], power: '2', toughness: '2' }));
      const artifact = permanent(MTG, game, b, fixtureDefinition('Oracle Artifact Creature', ['Artifact', 'Creature'], { power: '2', toughness: '2' }));
      assert.equal(game.canBlock(ground, source), false, `${source.name}: nonblack nonartifact cannot block fear`);
      assert.equal(game.canBlock(black, source), true, `${source.name}: black creature blocks fear`);
      assert.equal(game.canBlock(artifact, source), true, `${source.name}: artifact creature blocks fear`);
      break;
    }
    case 'intimidate': {
      const otherColor = ['W', 'U', 'B', 'R', 'G'].find(color => !source.colors.includes(color)) || 'W';
      const ground = permanent(MTG, game, b, fixtureDefinition('Oracle Nonshared Color Blocker', ['Creature'], {
        colorsOverride: [otherColor], power: '2', toughness: '2',
      }));
      const artifact = permanent(MTG, game, b, fixtureDefinition('Oracle Intimidate Artifact', ['Artifact', 'Creature'], { power: '2', toughness: '2' }));
      assert.equal(game.canBlock(ground, source), false, `${source.name}: nonartifact without shared color cannot block intimidate`);
      assert.equal(game.canBlock(artifact, source), true, `${source.name}: artifact creature blocks intimidate`);
      if (source.colors.length) {
        const shared = permanent(MTG, game, b, fixtureDefinition('Oracle Shared Color Blocker', ['Creature'], {
          colorsOverride: [source.colors[0]], power: '2', toughness: '2',
        }));
        assert.equal(game.canBlock(shared, source), true, `${source.name}: shared-color creature blocks intimidate`);
      }
      break;
    }
    case 'skulk': {
      const stronger = permanent(MTG, game, b, fixtureDefinition('Oracle Stronger Blocker', ['Creature'], {
        power: String(source.power + 1), toughness: '20',
      }));
      const equal = permanent(MTG, game, b, fixtureDefinition('Oracle Equal Blocker', ['Creature'], {
        power: String(source.power), toughness: '20',
      }));
      assert.equal(game.canBlock(stronger, source), false, `${source.name}: greater-power creature cannot block skulk`);
      assert.equal(game.canBlock(equal, source), true, `${source.name}: equal-power creature can block skulk`);
      break;
    }
    case 'shadow': {
      const normal = permanent(MTG, game, b, 'Elite Vanguard');
      const shadow = permanent(MTG, game, b, fixtureDefinition('Oracle Shadow Blocker', ['Creature'], {
        kws: ['shadow'], power: '2', toughness: '2',
      }));
      assert.equal(game.canBlock(normal, source), false, `${source.name}: non-shadow creature cannot block shadow`);
      assert.equal(game.canBlock(shadow, source), true, `${source.name}: shadow creature blocks shadow`);
      break;
    }
    case 'horsemanship': {
      const normal = permanent(MTG, game, b, 'Elite Vanguard');
      const mounted = permanent(MTG, game, b, fixtureDefinition('Oracle Horsemanship Blocker', ['Creature'], {
        kws: ['horsemanship'], power: '2', toughness: '2',
      }));
      assert.equal(game.canBlock(normal, source), false, `${source.name}: creature without horsemanship cannot block`);
      assert.equal(game.canBlock(mounted, source), true, `${source.name}: horsemanship creature can block`);
      break;
    }
    case 'menace': {
      attacker = source;
      blocker = permanent(MTG, game, b, 'Arachnoid');
      if (source.power < 1) game.addCounters(source, '+1/+1', 2, false, a);
      const life = b.life;
      await game.combatPhase(a);
      assert.ok(b.life < life, `${source.name}: a single blocker is rejected by menace`);
      break;
    }
    case 'first strike': {
      assert.ok(game.dmgAmount(source, 'first') > 0, `${source.name}: first-strike damage`);
      source.meta._dealtFirstStrike = true;
      if (!source.kw('double strike')) assert.equal(game.dmgAmount(source, 'normal'), 0, `${source.name}: no normal damage`);
      break;
    }
    case 'double strike': {
      assert.ok(game.dmgAmount(source, 'first') > 0, `${source.name}: first damage step`);
      source.meta._dealtFirstStrike = true;
      assert.ok(game.dmgAmount(source, 'normal') > 0, `${source.name}: normal damage step`);
      break;
    }
    case 'deathtouch': {
      const victim = permanent(MTG, game, b, 'Aegis Turtle');
      await game.damageCreature(source, victim, 1);
      assert.equal(victim.zone, 'graveyard', `${source.name}: one damage is lethal`);
      break;
    }
    case 'lifelink': {
      const life = a.life;
      await game.damagePlayer(source, b, 1);
      assert.equal(a.life, life + 1, `${source.name}: controller gains dealt damage`);
      break;
    }
    case 'trample': {
      const victim = permanent(MTG, game, b, 'Elite Vanguard');
      game.addCounters(source, '+1/+1', 5, false, a);
      source.attacking = b;
      source.blockedBy = [victim];
      source.wasBlocked = true;
      victim.blocking = source.iid;
      game.combat = { attackers: [source], defenders: new Map() };
      const life = b.life;
      await game.combatDamage(a, 'normal');
      assert.ok(b.life < life, `${source.name}: excess combat damage tramples over`);
      break;
    }
    case 'wither': {
      const victim = permanent(MTG, game, b, 'Aegis Turtle');
      await game.damageCreature(source, victim, 1);
      assert.equal(victim.counters['-1/-1'], 1, `${source.name}: creature damage becomes -1/-1 counter`);
      break;
    }
    case 'haste': {
      attacker = source;
      source.sick = true;
      if (source.power < 1) game.addCounters(source, '+1/+1', 2, false, a);
      await game.combatPhase(a);
      assert.equal(a.turnState.attacked, true, `${source.name}: attacks through summoning sickness`);
      break;
    }
    case 'vigilance': {
      attacker = source;
      await game.combatPhase(a);
      assert.equal(source.tapped, false, `${source.name}: does not tap to attack`);
      break;
    }
    case 'defender':
      assert.equal(game.canAttackAtAll(source), false, `${source.name}: defender attack restriction`);
      break;
    case 'indestructible':
      await game.destroy(source);
      assert.equal(source.zone, 'battlefield', `${source.name}: survives destroy`);
      break;
    case 'hexproof': {
      const hostile = permanent(MTG, game, b, 'Elite Vanguard');
      assert.equal(game.legalTargets({ what: 'creature' }, hostile, b).includes(source), false, `${source.name}: opponent cannot target`);
      break;
    }
    case 'shroud':
      assert.equal(game.legalTargets({ what: 'creature' }, source, a).includes(source), false, `${source.name}: no player can target`);
      break;
    case 'ward': {
      const hostileCard = zoneCard(MTG, b, 'Murder', 'exile');
      const spell = { kind: 'spell', name: 'Murder', card: hostileCard, ctrl: b, targets: [source] };
      game.stack.push(spell);
      game.queueWardTriggers(spell, { wardTargets: [{ target: source, ward: source.cur.wardCost }] });
      const ward = game.pendingTriggers.find(trigger => trigger.src === source);
      assert.ok(ward, `${source.name}: targeting creates a Ward trigger`);
      await ward.run({ g: game, src: source, you: a, data: ward.data, targets: [] });
      assert.equal(spell.countered, true, `${source.name}: unpaid Ward counters the spell`);
      break;
    }
    case 'flash': {
      const card = new MTG.CardInst(source.def, a);
      card.zone = 'hand';
      a.hand.push(card);
      game.turnPlayer = b;
      game.phase = 'main1';
      assert.equal(game.canCastTiming(a, card), true, `${source.name}: casts outside sorcery timing`);
      break;
    }
    case 'prowess': {
      const before = source.power;
      const instances = (source.def.triggers || []).filter(trigger => trigger.desc === 'Prowess').length;
      assert.ok(instances > 0, `${source.name}: compiled prowess trigger instances`);
      const spell = zoneCard(MTG, a, 'Murder', 'exile');
      await game.emit('castNonCreature', { player: a, card: spell, mv: 3, so: { card: spell, ctrl: a } });
      await resolveAll(game);
      assert.equal(source.power, before + instances, `${source.name}: noncreature cast resolves every printed prowess instance`);
      break;
    }
    default:
      assert.fail(`${entry.raw.name}: no executable proof for declared keyword ${rawKeyword}`);
  }
  return 1;
}

test('svaki Oracle report je učitan u runtime i nightly minimum je eksplicitno podesiv', (t) => {
  const MTG = loadEngine();
  const reportNames = fs.readdirSync(path.join(root, 'reports', 'oracle-import'))
    .filter(name => /^batch-\d{4}\.json$/.test(name)).sort();
  const reports = reportNames.map(name => JSON.parse(fs.readFileSync(path.join(root, 'reports', 'oracle-import', name), 'utf8')));
  const runtime = new Map(genericBatches(MTG).map(batch => [batch.id, batch]));
  let reportCards = 0;
  for (const report of reports) {
    const batch = report.batch && Array.isArray(report.batch.cards) ? report.batch : report;
    reportCards += batch.cards.length;
    assert.ok(runtime.has(batch.id), `${batch.id}: report exists but runtime batch is not loaded`);
    assert.equal(runtime.get(batch.id).cards.length, batch.cards.length, `${batch.id}: report/runtime card count`);
    const modulePath = path.join(root, 'src', 'oracle-batches', `batch-${String(batch.sequence).padStart(4, '0')}.js`);
    assert.equal(fs.existsSync(modulePath), true, `${batch.id}: generated runtime module exists`);
  }
  const runtimeCards = [...runtime.values()].reduce((sum, batch) => sum + batch.cards.length, 0);
  const baselineCards = [...runtime.values()]
    .filter(batch => Number(batch.sequence) <= 3)
    .reduce((sum, batch) => sum + batch.cards.length, 0);
  const newCards = runtimeCards - baselineCards;
  assert.equal(runtimeCards, reportCards, 'every generic runtime card has exactly one report row');
  const nightlyMinimum = Number(process.env.ORACLE_MIN_CARDS || 0);
  const nightlyNewMinimum = Number(process.env.ORACLE_MIN_NEW_CARDS || 0);
  if (nightlyMinimum) assert.ok(runtimeCards >= nightlyMinimum, `nightly Oracle target ${nightlyMinimum}, found ${runtimeCards}`);
  if (nightlyNewMinimum) assert.ok(newCards >= nightlyNewMinimum, `nightly new-card target ${nightlyNewMinimum}, found ${newCards} above baseline ${baselineCards}`);
  t.diagnostic(`ORACLE_BATCH_COVERAGE batches=${runtime.size} cards=${runtimeCards} baseline=${baselineCards} new=${newCards} totalTarget=${nightlyMinimum || 'not-enforced'} newTarget=${nightlyNewMinimum || 'not-enforced'}`);
});

test('svaka generička Oracle karta i svaki deklarisani keyword imaju izvršni dokaz', async (t) => {
  const MTG = loadEngine();
  const rows = genericEntries(MTG);
  let cardExecutions = 0;
  let keywordExecutions = 0;
  let operationExecutions = 0;
  const keywordCounts = {};
  const operationCounts = {};
  const templateCounts = {};

  for (const { batch, entry } of rows) {
    const audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: entry.raw.name }] }, MTG.DEFS);
    assert.equal(audit.ready, true, `${batch.id}/${entry.raw.name}: ${JSON.stringify(audit.unsupported)}`);
    const cardContract = baseContract(entry);
    assert.ok(cardContract, `${entry.raw.name}: known runtime card type`);
    assert.ok(audit.contracts.some(contract => contract.id === cardContract), `${entry.raw.name}: ${cardContract} contract`);
    const operations = entry.implementation || [];
    if (operations.length) {
      for (const operation of operations) {
        operationExecutions += await operationProof(MTG, entry, operation);
        operationCounts[operation.kind] = (operationCounts[operation.kind] || 0) + 1;
      }
      cardExecutions += 1;
    } else {
      cardExecutions += await cardProof(MTG, entry);
    }
    templateCounts[entry.semanticClass] = (templateCounts[entry.semanticClass] || 0) + 1;
    for (const declared of declaredKeywordOccurrences(MTG, entry)) {
      const key = mechanic(declared);
      const contract = MTG.ORACLE_KEYWORD_CONTRACTS[key];
      assert.ok(contract, `${entry.raw.name}: declared ${declared} has a contract`);
      assert.ok(audit.contracts.some(item => item.id === contract), `${entry.raw.name}: audit exposes ${contract}`);
      keywordExecutions += await keywordProof(MTG, entry, declared);
      keywordCounts[key] = (keywordCounts[key] || 0) + 1;
    }
  }

  const declaredKeywordTotal = rows.reduce((sum, row) => sum + declaredKeywordOccurrences(MTG, row.entry).length, 0);
  const declaredOperationTotal = rows.reduce((sum, row) => sum + (row.entry.implementation || []).length, 0);
  assert.equal(cardExecutions, rows.length, 'one real land-play/cast/resolution proof per Oracle card');
  assert.equal(keywordExecutions, declaredKeywordTotal, 'one executed proof per declared keyword occurrence');
  assert.equal(operationExecutions, declaredOperationTotal, 'one executed proof per compiled operation occurrence');
  t.diagnostic(`ORACLE_INTERACTION_COVERAGE cards=${cardExecutions}/${rows.length} keywords=${keywordExecutions}/${declaredKeywordTotal} operations=${operationExecutions}/${declaredOperationTotal} pct=100`);
  t.diagnostic(`ORACLE_TEMPLATE_COVERAGE ${JSON.stringify(Object.fromEntries(Object.entries(templateCounts).sort()))}`);
  t.diagnostic(`ORACLE_INTERACTION_MATRIX ${JSON.stringify(Object.fromEntries(Object.entries(keywordCounts).sort()))}`);
  t.diagnostic(`ORACLE_OPERATION_MATRIX ${JSON.stringify(Object.fromEntries(Object.entries(operationCounts).sort()))}`);
});

test('interaction gate odbija lažni marker, nepoznat keyword i nevažeće manual/template contracte', () => {
  const MTG = loadEngine();
  const generic = genericEntries(MTG)[0].entry.raw.name;
  const genericScript = MTG.SCRIPTS[generic];
  const genericCatalog = MTG.CARD_CATALOG[generic];
  const originalMarker = genericScript.oracleImplemented;
  const originalKeywords = genericCatalog.implementedKeywords;
  try {
    genericScript.oracleImplemented = false;
    let audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: generic }] }, MTG.DEFS);
    assert.equal(audit.ready, false);
    assert.ok(audit.unsupported.some(item => item.reason === 'missing-oracle-implementation-marker'));

    genericScript.oracleImplemented = true;
    genericCatalog.implementedKeywords = ['future-unsupported-keyword'];
    audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: generic }] }, MTG.DEFS);
    assert.equal(audit.ready, false);
    assert.ok(audit.unsupported.some(item => item.reason === 'no-interaction-contract:future-unsupported-keyword'));
  } finally {
    genericScript.oracleImplemented = originalMarker;
    genericCatalog.implementedKeywords = originalKeywords;
  }

  const manual = 'Sauron, the Dark Lord';
  const manualScript = MTG.SCRIPTS[manual];
  const originalContracts = manualScript.oracleContracts;
  try {
    manualScript.oracleContracts = [];
    let audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: manual }] }, MTG.DEFS);
    assert.ok(audit.unsupported.some(item => item.reason === 'missing-manual-interaction-contracts'));
    manualScript.oracleContracts = ['not-a-real-contract'];
    audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: manual }] }, MTG.DEFS);
    assert.ok(audit.unsupported.some(item => item.reason === 'unknown-manual-contract:not-a-real-contract'));
  } finally {
    manualScript.oracleContracts = originalContracts;
  }

  const template = genericEntries(MTG).find(row => (row.entry.implementation || []).length).entry.raw.name;
  const templateScript = MTG.SCRIPTS[template];
  const templateContracts = templateScript.oracleContracts;
  const templateImplementation = templateScript.oracleImplementation;
  try {
    templateScript.oracleContracts = [];
    let audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: template }] }, MTG.DEFS);
    assert.ok(audit.unsupported.some(item => item.reason === 'missing-template-interaction-contracts'));

    templateScript.oracleContracts = templateContracts;
    templateScript.oracleImplementation = templateImplementation.slice(0, -1);
    audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: template }] }, MTG.DEFS);
    assert.ok(audit.unsupported.some(item => item.reason === 'compiled-template-mismatch'));

    templateScript.oracleImplementation = templateImplementation;
    templateScript.oracleContracts = ['not-a-real-template-contract'];
    audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: template }] }, MTG.DEFS);
    assert.ok(audit.unsupported.some(item => item.reason === 'unknown-template-contract:not-a-real-template-contract'));
  } finally {
    templateScript.oracleContracts = templateContracts;
    templateScript.oracleImplementation = templateImplementation;
  }
});

test('Tunnel Surveyor pravi 1/1 bijeli Enchantment Creature — Glimmer token', async () => {
  const MTG = loadEngine();
  const context = gameFor(MTG);
  fillLibrary(MTG, context.a, 5);
  await enterPermanentProof(MTG, context, genericEntries(MTG).find(row => row.entry.raw.name === 'Tunnel Surveyor').entry);
  const tokens = context.game.battlefield.filter(card => card.isToken && card.ctrl === context.a && card.hasSub('Glimmer'));
  assert.equal(tokens.length, 1);
  const token = tokens[0];
  assert.equal(token.is('Enchantment'), true);
  assert.equal(token.is('Creature'), true);
  assert.deepEqual(Array.from(token.def.subtypes), ['Glimmer']);
  assert.deepEqual(Array.from(token.colors), ['W']);
  assert.equal(token.power, 1);
  assert.equal(token.toughness, 1);
});

test('Thor Odinson ima dvije odvojene prowess instance i dobija +2/+2 po noncreature castu', async () => {
  const MTG = loadEngine();
  const { game, a } = gameFor(MTG);
  fillLibrary(MTG, a, 5);
  const thor = permanent(MTG, game, a, 'Thor Odinson');
  const prowess = thor.def.triggers.filter(trigger => trigger.desc === 'Prowess');
  assert.equal(prowess.length, 2, 'printed prowess, prowess creates two trigger instances');
  const beforePower = thor.power;
  const beforeToughness = thor.toughness;
  const spell = zoneCard(MTG, a, 'Brilliant Plan', 'hand');
  assert.equal(await game.castSpell(a, spell, { from: 'hand', alt: { free: true } }), true);
  await resolveAll(game);
  assert.equal(thor.power, beforePower + 2);
  assert.equal(thor.toughness, beforeToughness + 2);
});

test('ukradeni Oracle dies-draw crta LKI kontroloru, a ne owneru', async () => {
  const MTG = loadEngine();
  const { game, a: owner, b: controller } = gameFor(MTG);
  fillLibrary(MTG, owner, 5);
  fillLibrary(MTG, controller, 5);
  const stolen = permanent(MTG, game, owner, 'Buzz Bots');
  stolen.ctrl = controller;
  game.recalc();
  const ownerLibrary = owner.library.length;
  const controllerLibrary = controller.library.length;
  await game.destroy(stolen);
  await resolveAll(game);
  assert.equal(stolen.owner, owner);
  assert.equal(stolen.zone, 'graveyard');
  assert.equal(owner.library.length, ownerLibrary, 'owner does not draw');
  assert.equal(controller.library.length, controllerLibrary - 1, 'last known controller draws');
});

test('two-brid plaćanje pokriva krajnje, miješane i normal-plus-two-brid kombinacije', async () => {
  const MTG = loadEngine();
  const printedCost = '{2/R}{2/R}{2/R}';
  assert.equal(MTG.mv(printedCost), 6);
  assert.equal(MTG.costStr(MTG.parseCost(printedCost)), printedCost, 'public mana-cost text never leaks the internal TWO marker');
  const definition = MTG.DEFS['Flame Javelin'];
  const probe = new MTG.CardInst(definition, null);
  assert.equal(probe.mv, 6);

  const castWith = async pool => {
    let target = null;
    const chooser = decision({
      chooseTargets: (game, query) => query.candidates.includes(target) ? [target] : query.candidates.slice(0, query.min || 0),
    });
    const { game, a, b } = gameFor(MTG, [chooser, decision()]);
    target = b;
    Object.assign(a.pool, pool);
    const before = b.life;
    const spell = zoneCard(MTG, a, 'Flame Javelin', 'hand');
    assert.equal(await game.castSpell(a, spell, { from: 'hand' }), true, `cast with ${JSON.stringify(pool)}`);
    assert.equal(spell.zone, 'stack');
    await resolveAll(game);
    assert.equal(spell.zone, 'graveyard');
    assert.equal(b.life, before - 4);
    assert.equal(poolTotal(a), 0, 'all supplied mana is paid');
  };

  await castWith({ R: 3 });
  await castWith({ R: 2, C: 2 });
  await castWith({ R: 1, C: 4 });
  await castWith({ C: 6 });

  const castMixedCost = async (pool, expected) => {
    const { game, a } = gameFor(MTG);
    Object.assign(a.pool, pool);
    const definition = fixtureDefinition('Oracle Normal Plus Two-Brid', ['Instant'], {
      cost: '{1}{U}{2/R}',
    });
    const spell = new MTG.CardInst(definition, a);
    spell.zone = 'hand';
    a.hand.push(spell);
    const beforePool = poolTotal(a);
    assert.equal(await game.castSpell(a, spell, { from: 'hand' }), expected,
      `normal plus two-brid with ${JSON.stringify(pool)}`);
    if (expected) {
      assert.equal(spell.zone, 'stack');
      await resolveAll(game);
      assert.equal(spell.zone, 'graveyard');
      assert.equal(poolTotal(a), 0);
    } else {
      assert.equal(spell.zone, 'hand');
      assert.equal(poolTotal(a), beforePool, 'rejected mixed payment spends no mana');
    }
  };

  await castMixedCost({ U: 1, R: 1, C: 1 }, true);
  await castMixedCost({ U: 1, C: 3 }, true);
  await castMixedCost({ U: 1, C: 2 }, false);
});

test('Oracle any-target burn vidi Battle, stvarni handleETB postavlja defense i damage ga skida', async () => {
  const MTG = loadEngine();

  const castAtBattle = async (name, amount, castOptions, pool = {}) => {
    let battle = null;
    const chooser = decision({
      chooseTargets: (game, query) => query.candidates.includes(battle) ? [battle] : query.candidates.slice(0, query.min || 0),
    });
    const { game, a, b } = gameFor(MTG, [chooser, decision()]);
    Object.assign(a.pool, pool);
    battle = new MTG.CardInst(fixtureDefinition('Oracle Battle Target', ['Battle'], { defense: '10' }), b);
    battle.zone = 'hand';
    b.hand.push(battle);
    await game.move(battle, 'battlefield');
    assert.equal(battle.counters.defense, 10, `${name}: handleETB initializes printed defense`);
    const spell = zoneCard(MTG, a, name, 'hand');
    const specs = game.spellTargetSpecs(spell, castOptions.alt || {}, a);
    assert.ok(specs && specs.length, `${name}: any-target spec`);
    assert.equal(game.legalTargets(specs[0], spell, a).includes(battle), true, `${name}: Battle is a legal any target`);
    assert.equal(await game.castSpell(a, spell, castOptions), true, `${name}: casts targeting Battle`);
    assert.equal(game.stack.at(-1).targets[0], battle, `${name}: Battle target is locked on Stack`);
    await resolveAll(game);
    assert.equal(battle.counters.defense, 10 - amount, `${name}: damage removes defense counters`);
    assert.equal(battle.damage, 0, `${name}: Battle does not receive creature marked damage`);
    assert.equal(battle.zone, 'battlefield');
  };

  await castAtBattle('Lightning Bolt', 3, { from: 'hand', alt: { free: true } });
  await castAtBattle('Blaze', 3, { from: 'hand', xVal: 3 }, { R: 1, C: 3 });
});

test('Oracle composite targeti izvršavaju svaku alternativu i permanent/nonland filtere', async () => {
  const MTG = loadEngine();
  const rows = genericEntries(MTG);
  const find = (kind, what) => {
    for (const { entry } of rows) {
      const operation = (entry.implementation || []).find(candidate =>
        candidate.kind === kind && candidate.what === what && candidate.n !== 'X');
      if (operation) return { entry, operation };
    }
    assert.fail(`missing Oracle fixture for ${kind}/${what}`);
  };

  const castAt = async ({ entry, operation }, buildTarget, verify, verifyCandidates) => {
    let target = null;
    const chooser = decision({
      chooseTargets: (game, query) => query.candidates.includes(target) ? [target] : [],
    });
    const { game, a, b } = gameFor(MTG, [chooser, decision()]);
    target = buildTarget(game, a, b);
    game.recalc();
    const spell = zoneCard(MTG, a, entry.raw.name, 'hand');
    const spec = MTG.SCRIPTS[entry.raw.name].targets[0];
    const candidates = game.legalTargets(spec, spell, a);
    assert.ok(candidates.includes(target), `${entry.raw.name}: alternate ${operation.what} target is legal`);
    if (verifyCandidates) verifyCandidates({ game, a, b, spell, candidates });
    const before = {
      loyalty: target.counters.loyalty || 0,
      life: target.life,
    };
    assert.equal(await game.castSpell(a, spell, { from: 'hand', alt: { free: true } }), true);
    await resolveAll(game);
    await verify({ game, a, b, target, before, operation });
  };

  await castAt(find('spell-exile', 'artifact or enchantment'),
    (game, a, b) => permanent(MTG, game, b, fixtureDefinition('Oracle Enchantment Alternative', ['Enchantment'])),
    async ({ target }) => assert.equal(target.zone, 'exile'));

  await castAt(find('spell-destroy', 'creature or planeswalker'),
    (game, a, b) => {
      const target = permanent(MTG, game, b, fixtureDefinition('Oracle Planeswalker Alternative', ['Planeswalker'], { loyalty: '8' }));
      target.counters.loyalty = 8;
      return target;
    },
    async ({ target }) => assert.equal(target.zone, 'graveyard'));

  for (const what of ['target creature or planeswalker', 'target player or planeswalker']) {
    await castAt(find('spell-damage', what),
      (game, a, b) => {
        const target = permanent(MTG, game, b, fixtureDefinition(`Oracle ${what} Alternative`, ['Planeswalker'], { loyalty: '20' }));
        target.counters.loyalty = 20;
        return target;
      },
      async ({ target, before, operation }) => {
        assert.equal(target.counters.loyalty, before.loyalty - operation.n,
          `${operation.what}: Planeswalker loses loyalty`);
      });
  }

  let excludedLand = null;
  await castAt(find('spell-bounce', 'nonland permanent'),
    (game, a, b) => {
      excludedLand = permanent(MTG, game, b, 'Forest');
      return permanent(MTG, game, b, fixtureDefinition('Oracle Nonland Alternative', ['Enchantment']));
    },
    async ({ target }) => assert.equal(target.zone, 'hand'),
    ({ candidates }) => assert.equal(candidates.includes(excludedLand), false, 'nonland filter excludes a land'));

  await castAt(find('spell-destroy', 'permanent'),
    (game, a, b) => permanent(MTG, game, b, 'Forest'),
    async ({ target }) => assert.equal(target.zone, 'graveyard'));
});

test('Oracle spell resolver guardovi su sigurni za stale/uncounterable/empty target stanja', async () => {
  const MTG = loadEngine();
  const rows = genericEntries(MTG).map(row => row.entry);
  const scriptFor = kind => {
    const entry = rows.find(candidate => (candidate.implementation || []).some(operation => operation.kind === kind));
    assert.ok(entry, `fixture for ${kind}`);
    return MTG.SCRIPTS[entry.raw.name];
  };
  let chooseCardsCalled = false;
  const { game, a, b } = gameFor(MTG, [decision(), decision({
    chooseCards: () => {
      chooseCardsCalled = true;
      throw new Error('empty discard guard should not ask for cards');
    },
  })]);
  const source = zoneCard(MTG, a, 'Forest', 'exile');

  const counter = scriptFor('spell-counter');
  await counter.resolve({ g: game, src: source, you: a, targets: [] });
  const staleCard = zoneCard(MTG, b, 'Brilliant Plan', 'exile');
  const stale = { kind: 'spell', card: staleCard, ctrl: b, targets: [] };
  await counter.resolve({ g: game, src: source, you: a, targets: [stale] });
  assert.equal(staleCard.zone, 'exile', 'stale stack target is untouched');

  const uncounterableCard = new MTG.CardInst(fixtureDefinition('Oracle Uncounterable Guard', ['Instant'], {
    uncounterable: true,
  }), b);
  uncounterableCard.zone = 'stack';
  const uncounterable = { kind: 'spell', card: uncounterableCard, ctrl: b, targets: [] };
  game.stack.push(uncounterable);
  await counter.resolve({ g: game, src: source, you: a, targets: [uncounterable] });
  assert.ok(game.stack.includes(uncounterable), 'uncounterable target remains on Stack');

  for (const kind of ['spell-destroy', 'spell-exile', 'spell-damage', 'spell-bounce', 'spell-mill']) {
    await scriptFor(kind).resolve({ g: game, src: source, you: a, targets: [] });
  }
  await scriptFor('spell-discard').resolve({ g: game, src: source, you: a, targets: [] });
  await scriptFor('spell-discard').resolve({ g: game, src: source, you: a, targets: [b] });
  assert.equal(chooseCardsCalled, false, 'empty hand exits before discard choice');
});

test('svih osam Oracle Phyrexian-cost karata traži dva života po neplaćenom PHY pipu', async () => {
  const MTG = loadEngine();
  const entries = genericEntries(MTG).map(row => row.entry)
    .filter(entry => /\{[WUBRG]\/P\}/.test(entry.raw.cost || ''));
  assert.equal(entries.length, 8);

  const attempt = async (entry, { life, pool, expected, resolve = true }) => {
    let wantedTarget = null;
    const chooser = decision({
      chooseTargets: (game, query) => query.candidates.includes(wantedTarget)
        ? [wantedTarget] : query.candidates.slice(0, query.min || 0),
    });
    const { game, a, b } = gameFor(MTG, [chooser, decision()]);
    a.life = life;
    Object.assign(a.pool, pool);
    if (entry.raw.name === 'Dismember') wantedTarget = targetPermanent(MTG, game, b, 'creature');
    else if (entry.raw.name === 'Mutagenic Growth') wantedTarget = targetPermanent(MTG, game, a, 'creature');
    else if (entry.raw.name === 'Gut Shot') wantedTarget = b;
    const card = zoneCard(MTG, a, entry.raw.name, 'hand');
    const lifeBefore = a.life;
    const poolBefore = poolTotal(a);
    const cast = await game.castSpell(a, card, { from: 'hand' });
    assert.equal(cast, expected, `${entry.raw.name}: payment ${JSON.stringify({ life, pool })}`);
    if (!expected) {
      assert.equal(card.zone, 'hand', `${entry.raw.name}: rejected cast leaves card in hand`);
      assert.equal(a.life, lifeBefore, `${entry.raw.name}: rejected cast pays no life`);
      assert.equal(poolTotal(a), poolBefore, `${entry.raw.name}: rejected cast pays no mana`);
      return { game, a, card };
    }
    assert.equal(card.zone, 'stack', `${entry.raw.name}: accepted payment puts spell on Stack`);
    if (resolve) {
      await resolveAll(game);
      const destination = entry.raw.types.includes('Creature') ? 'battlefield' : 'graveyard';
      assert.equal(card.zone, destination, `${entry.raw.name}: resolves through its real card-type path`);
    }
    return { game, a, card };
  };

  for (const entry of entries) {
    const parsed = MTG.parseCost(entry.raw.cost);
    const phy = parsed.pips.filter(pip => pip.includes('PHY'));
    assert.ok(phy.length > 0, `${entry.raw.name}: parsed PHY pips`);
    const genericPool = parsed.generic ? { C: parsed.generic } : {};

    await attempt(entry, {
      life: phy.length * 2 - 1,
      pool: genericPool,
      expected: false,
    });

    const lifePayment = await attempt(entry, {
      life: phy.length * 2 + 5,
      pool: genericPool,
      expected: true,
    });
    assert.equal(lifePayment.a.life, 5, `${entry.raw.name}: exactly two life per PHY pip`);

    const manaPool = { C: parsed.generic };
    for (const pip of phy) {
      const color = pip.find(symbol => ['W', 'U', 'B', 'R', 'G'].includes(symbol));
      manaPool[color] = (manaPool[color] || 0) + 1;
    }
    const manaPayment = await attempt(entry, { life: 9, pool: manaPool, expected: true });
    assert.equal(manaPayment.a.life, 9, `${entry.raw.name}: colored mana pays PHY without life`);

    if (phy.length > 1) {
      const mixedPool = { C: parsed.generic };
      const color = phy[0].find(symbol => ['W', 'U', 'B', 'R', 'G'].includes(symbol));
      mixedPool[color] = 1;
      const mixed = await attempt(entry, { life: 7, pool: mixedPool, expected: true });
      assert.equal(mixed.a.life, 5, `${entry.raw.name}: mixed mana plus life payment`);
    }
  }

  const gutShot = entries.find(entry => entry.raw.name === 'Gut Shot');
  await attempt(gutShot, { life: 1, pool: {}, expected: false, resolve: false });
  const exactBoundary = await attempt(gutShot, { life: 2, pool: {}, expected: true, resolve: false });
  assert.equal(exactBoundary.a.life, 0, 'Gut Shot may pay exactly two life down to zero');
});
