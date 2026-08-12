import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

function defaultDecision(game, q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 1).map(option => option.key);
  if (q.type === 'orderTriggers') return q.triggers;
  return null;
}

function makeGame(MTG, decide, onEvent = () => {}) {
  const game = new MTG.Game({ seed: 109, paced: false, maxTurns: 10, onEvent });
  const controller = { decide: async (g, q) => decide ? decide(g, q) : defaultDecision(g, q) };
  const player = game.addPlayer('Player', { name: 'Test' }, controller, false);
  const opponent = game.addPlayer('Opponent', { name: 'Test' }, { decide: async (g, q) => defaultDecision(g, q) }, true);
  game.turnPlayer = player;
  game.turnNo = 1;
  game.phase = 'main1';
  game.step = 'main';
  return { game, player, opponent };
}

function permanent(MTG, game, player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  return card;
}

function testCard(MTG, player, def) {
  return new MTG.CardInst(Object.assign({
    super: [], subtypes: [], kws: [], oracle: '',
  }, def), player);
}

test('manual mana bira tacne landove za spell i ostavlja ostale netaknute', async () => {
  const MTG = loadEngine();
  let chosenSources = null;
  let wanted = null;
  const { game, player } = makeGame(MTG, (g, q) => {
    if (q.type === 'chooseManaSources') {
      chosenSources = q;
      return { cards: wanted };
    }
    return defaultDecision(g, q);
  });
  const plainsA = permanent(MTG, game, player, 'Plains');
  const plainsB = permanent(MTG, game, player, 'Plains');
  const island = permanent(MTG, game, player, 'Island');
  wanted = [plainsB, island];
  player.manualMana = true;
  const spell = testCard(MTG, player, {
    name: 'Manual Mana Test', cost: '{1}{W}', types: ['Instant'],
    resolve: async () => {},
  });
  spell.zone = 'hand';
  player.hand.push(spell);
  game.recalc();

  assert.equal(await game.castSpell(player, spell, { from: 'hand' }), true);
  assert.equal(chosenSources.type, 'chooseManaSources');
  assert.deepEqual(Array.from(chosenSources.suggested).length, 2);
  assert.equal(plainsA.tapped, false);
  assert.equal(plainsB.tapped, true);
  assert.equal(island.tapped, true);
  assert.deepEqual(Object.values(player.pool), [0, 0, 0, 0, 0, 0]);
});

test('manual mana validacija odbija izbor koji ne moze platiti obojeni pip', () => {
  const MTG = loadEngine();
  const { game, player } = makeGame(MTG);
  const island = permanent(MTG, game, player, 'Island');
  const plains = permanent(MTG, game, player, 'Plains');
  game.recalc();
  const cost = MTG.parseCost('{W}');

  assert.equal(game.manualManaSelectionSolution(player, cost, { card: plains }, [island]), null);
  assert.ok(game.manualManaSelectionSolution(player, cost, { card: plains }, [plains]));
});

test('manifest koristi stvarnu kartu kao bezbojnu 2/2 i okrece creature bez stacka', async () => {
  const MTG = loadEngine();
  const { game, player } = makeGame(MTG);
  const original = testCard(MTG, player, {
    name: 'Hidden Bear', cost: '{1}{G}', types: ['Creature'], subtypes: ['Bear'],
    power: '3', toughness: '3', oracle: 'Test creature.',
  });
  original.zone = 'library';
  player.library.push(original);

  const manifested = await game.manifestTop(player);
  assert.equal(manifested, original);
  assert.equal(manifested.isToken, false);
  assert.equal(manifested.faceDown, true);
  assert.equal(manifested.name, 'Face-down creature');
  assert.equal(manifested.power, 2);
  assert.equal(manifested.toughness, 2);
  assert.deepEqual(Array.from(manifested.colors), []);
  assert.equal(manifested.meta.faceDownDef.name, 'Hidden Bear');

  player.pool.G = 1;
  player.pool.C = 1;
  const action = game.activatableList(player).find(entry => entry.card === manifested && entry.turnFaceUp);
  assert.ok(action);
  assert.equal(await game.activateAbility(player, action), true);
  assert.equal(game.stack.length, 0, 'turn face up je posebna akcija i ne koristi stack');
  assert.equal(manifested.faceDown, false);
  assert.equal(manifested.name, 'Hidden Bear');
  assert.equal(manifested.power, 3);
  assert.equal(manifested.toughness, 3);
});

test('manifestovana noncreature karta ostaje 2/2 bez turn-face-up akcije', async () => {
  const MTG = loadEngine();
  const { game, player } = makeGame(MTG);
  const hidden = testCard(MTG, player, {
    name: 'Hidden Spell', cost: '{G}', types: ['Sorcery'], oracle: 'Test sorcery.',
  });
  hidden.zone = 'library';
  player.library.push(hidden);
  await game.manifestTop(player);
  player.pool.G = 5;

  assert.equal(game.activatableList(player).some(entry => entry.card === hidden && entry.turnFaceUp), false);
  assert.equal(hidden.power, 2);
  assert.equal(hidden.toughness, 2);
});

test('manifest dread bira jednu od vršne dvije, a drugu stavlja u groblje', async () => {
  const MTG = loadEngine();
  let offered = null;
  const { game, player } = makeGame(MTG, (g, q) => {
    if (q.type === 'chooseCards' && /Manifest dread/.test(q.prompt)) {
      offered = q.from.slice();
      return [q.from[1]];
    }
    return defaultDecision(g, q);
  });
  const lower = testCard(MTG, player, { name: 'Lower', cost: '{G}', types: ['Creature'], power: '1', toughness: '1' });
  const top = testCard(MTG, player, { name: 'Top', cost: '{1}', types: ['Artifact'] });
  lower.zone = top.zone = 'library';
  player.library.push(lower, top);

  const manifested = await game.manifestDread(player);
  assert.equal(offered.length, 2);
  assert.equal(offered[0], top);
  assert.equal(offered[1], lower);
  assert.equal(manifested, lower);
  assert.equal(top.zone, 'graveyard');
  assert.ok(player.graveyard.includes(top));
  assert.equal(player.library.length, 0);
});

test('manifest dread pravilno radi sa jednom ili nijednom kartom, a cloak dodaje ward', async () => {
  const MTG = loadEngine();
  const { game, player } = makeGame(MTG);
  const only = testCard(MTG, player, {
    name: 'Only Card', cost: '{2}', types: ['Creature'], power: '2', toughness: '3',
  });
  only.zone = 'library';
  player.library.push(only);
  assert.equal(await game.manifestDread(player), only);
  assert.equal(player.graveyard.length, 0);
  assert.equal(await game.manifestDread(player), null);

  const cloaked = testCard(MTG, player, {
    name: 'Cloaked Card', cost: '{3}', types: ['Creature'], power: '4', toughness: '4',
  });
  cloaked.zone = 'library';
  player.library.push(cloaked);
  await game.cloakTop(player);
  game.recalc();
  assert.equal(cloaked.faceDown, true);
  assert.equal(cloaked.meta.faceDownKind, 'cloak');
  assert.equal(cloaked.cur.wardCost.mana, '{2}');
});

test('Black Market Connections pravi bezbojnog 3/2 Shapeshiftera sa stvarnim changelingom', async () => {
  const MTG = loadEngine();
  const { game, player } = makeGame(MTG, (g, q) => {
    if (q.type === 'chooseMulti') return ['s'];
    return defaultDecision(g, q);
  });
  const market = permanent(MTG, game, player, 'Black Market Connections');
  game.recalc();
  const trigger = market.def.triggers.find(entry => entry.on === 'upkeep');
  await trigger.run({ g: game, src: market, you: player, data: { player } });
  const token = game.creatures(player).find(card => card.isToken && card.name === 'Shapeshifter');

  assert.ok(token);
  assert.equal(token.power, 3);
  assert.equal(token.toughness, 2);
  assert.deepEqual(Array.from(token.colors), []);
  assert.equal(token.hasSub('Elf'), true);
  assert.equal(token.hasSub('Dragon'), true);
  assert.equal(player.life, 37);
});

test('copy, svaki counter i nova dodijeljena sposobnost salju effectNotice', async () => {
  const MTG = loadEngine();
  const notices = [];
  const { game, player } = makeGame(MTG, null, event => {
    if (event.type === 'effectNotice') notices.push(event);
  });
  const target = testCard(MTG, player, {
    name: 'Notice Target', cost: '{1}', types: ['Creature'], power: '2', toughness: '2',
  });
  target.ctrl = player; target.zone = 'battlefield'; target.sick = false;
  const granter = testCard(MTG, player, {
    name: 'Notice Granter', cost: '{1}', types: ['Enchantment'],
    statics: [{ apply: (g, self, bf) => {
      const card = bf.find(candidate => candidate.name === 'Notice Target');
      if (card) card.cur.extraAbilities.push({ label: 'Nova test sposobnost', run: async () => {} });
    } }],
  });
  granter.ctrl = player; granter.zone = 'battlefield';
  game.battlefield.push(target, granter);
  game.recalc();
  game.recalc();
  game.addCounters(target, '-1/-1', 1, true);
  game.addCounters(target, '+1/+1', 1);
  const spellCard = testCard(MTG, player, { name: 'Copy Test', cost: '{U}', types: ['Instant'] });
  await game.copySpell({
    kind: 'spell', card: spellCard, ctrl: player, name: spellCard.name,
    targets: [], x: 0, mode: null, castOpts: {}, kicked: false,
  }, player);

  assert.equal(notices.filter(event => event.kind === 'abilityGrant').length, 1, 'recalc ne duplira istu grant obavijest');
  assert.equal(notices.filter(event => event.kind === 'counter').length, 2);
  assert.equal(notices.filter(event => event.kind === 'spellCopy').length, 1);
});

test('default stop profil otvara combat reakciju samo kad postoji legalna akcija', () => {
  const MTG = loadEngine();
  const { game, player } = makeGame(MTG);
  game.phase = 'combat';
  game.step = 'blockers';

  assert.equal(MTG.autoPassPolicy('end', game, { type: 'priority', casts: [{}], acts: [] }, player), false);
  assert.equal(MTG.autoPassPolicy('end', game, { type: 'priority', casts: [], acts: [] }, player), true);
  assert.equal(MTG.autoPassPolicy('off', game, { type: 'priority', casts: [{}], acts: [] }, player), true);
});
