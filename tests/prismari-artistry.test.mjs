import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'attackers' || q.type === 'blockers' || q.type === 'combatReview') return [];
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseX') return q.max;
  if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 1).map(option => option.key);
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(deciders = [], count = 4) {
  const game = new MTG.Game({ seed: 814260, paced: false, maxTurns: 80 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Prismari',
    { name: index ? `Opp ${index}` : 'Prismari Artistry' },
    { decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 12;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, players };
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = opts.sick ?? false;
  card.commander = opts.commander ?? false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function inZone(player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function tokenCount(game, player, subtype) {
  return game.bf().filter(card => card.ctrl === player && card.isToken && (!subtype || card.hasSub(subtype))).length;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 300) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 300, 'Prismari trigger/stack petlja se nije smirila');
}

test('Prismari Artistry ima službenih 100 karata, 87 jedinstvenih i puni spellslinger AI profil', () => {
  const deck = MTG.DECKS['Prismari Artistry'];
  assert.equal(deck.commander, 'Rootha, Mastering the Moment');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 87);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
  assert.equal(MTG.getDeckAIProfile('Prismari Artistry').archetype, 'Spell-copy spellslinger');
});

test('Veyran duplira magecraft, prowess i Manaform; Manaform koristi stvarno potrošenu manu', async () => {
  const { game, players: [prismari] } = rulesGame([], 2);
  const veyran = permanent(game, prismari, 'Veyran, Voice of Duality');
  permanent(game, prismari, 'Archmage Emeritus');
  permanent(game, prismari, 'Manaform Hellkite');
  for (let i = 0; i < 6; i++) inZone(prismari, 'Island', 'library');
  const spell = inZone(prismari, 'Prismari Charm', 'exile');
  const data = { player: prismari, card: spell, isInstantSorcery: true, so: { manaSpent: 3 } };

  await game.emit('cast', data);
  await game.emit('castIS', data);
  await resolveAll(game);
  assert.equal(tokenCount(game, prismari, 'Dragon'), 2, 'Veyran pravi dva Manaform triggera');
  assert.equal(game.creatures(prismari).filter(card => card.isToken && card.hasSub('Dragon')).every(card => card.power === 3), true);
  assert.equal(prismari.hand.length, 2, 'Archmage Emeritus vuče dvaput');
  assert.equal(veyran.power, 4, 'Veyranov vlastiti magecraft okida dvaput');

  const tokensBeforeFreeSpell = prismari.turnState.tokensCreated;
  await game.emit('cast', { player: prismari, card: spell, isInstantSorcery: true, so: { manaSpent: 0 } });
  await resolveAll(game);
  assert.equal(prismari.turnState.tokensCreated, tokensBeforeFreeSpell + 2, 'Veyran pravi i dva 0/0 Manaform tokena');
  assert.equal(tokenCount(game, prismari, 'Dragon'), 2, '0/0 tokeni zatim nestaju kroz state-based action');
});

test('Galazeth daje dodatnu mana sposobnost svakom artefaktu, a Goldspan reaguje samo na spell target', async () => {
  const { game, players: [prismari] } = rulesGame([], 2);
  permanent(game, prismari, 'Galazeth Prismari');
  const ring = permanent(game, prismari, 'Sol Ring');
  const dragon = permanent(game, prismari, 'Goldspan Dragon');
  const opus = inZone(prismari, 'Magma Opus', 'hand');
  const sources = game.manaSources(prismari, { card: opus });
  assert.equal(sources.filter(source => source.card === ring).length, 2,
    'Sol Ring zadržava {C}{C} i dobija odvojeno tapovanje za jednu obojenu manu');

  await game.emit('targeted', { card: dragon, isSpell: false });
  await resolveAll(game);
  assert.equal(tokenCount(game, prismari, 'Treasure'), 0);
  await game.emit('targeted', { card: dragon, isSpell: true });
  await resolveAll(game);
  assert.equal(tokenCount(game, prismari, 'Treasure'), 1);
});

test('Brudiclad dopušta izbor noncreature tokena i pretvara baš sve ostale tokene', async () => {
  let chosen;
  const { game, players: [prismari] } = rulesGame([
    (g, q) => q.type === 'chooseCards' && q.aiHint?.kind === 'brudicladToken' ? [chosen] : defaultDecision(g, q),
  ], 2);
  permanent(game, prismari, 'Brudiclad, Telchor Engineer');
  [chosen] = await game.makeTokens('treasure', prismari);
  await game.makeTokens('servo', prismari, { n: 2 });

  await game.emit('beginCombat', { player: prismari });
  await resolveAll(game);
  const tokens = game.bf().filter(card => card.ctrl === prismari && card.isToken);
  assert.equal(tokens.length, 4);
  assert.equal(tokens.every(card => card.name === 'Treasure' && card.is('Artifact') && !card.is('Creature')), true);
});

test('Muddle zaključava metu na triggeru, kopira pune karakteristike i ne bira fallback', async () => {
  let chosen;
  const { game, players: [prismari] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(chosen) ? [chosen] : defaultDecision(g, q),
  ], 2);
  const muddle = permanent(game, prismari, 'Muddle, the Ever-Changing');
  chosen = permanent(game, prismari, 'Goldspan Dragon');
  const fallback = permanent(game, prismari, 'Stormcatch Mentor');
  const spell = inZone(prismari, 'Abrade', 'exile');

  await game.emit('castIS', { player: prismari, card: spell, isInstantSorcery: true });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).targets[0], chosen);
  await game.move(chosen, 'graveyard');
  await resolveAll(game);
  assert.equal(muddle.name, 'Muddle, the Ever-Changing');
  assert.equal(fallback.name, 'Stormcatch Mentor');

  chosen = fallback;
  await game.emit('castIS', { player: prismari, card: spell, isInstantSorcery: true });
  await resolveAll(game);
  assert.equal(muddle.name, 'Stormcatch Mentor');
  assert.equal(muddle.kw('myriad'), true);
  assert.equal(muddle.meta.characteristicOriginalDef?.name, 'Muddle, the Ever-Changing');
});

test('Rionya i Renegade Bull zaključavaju ciljeve; Rionya egzilira i ukradene kopije', async () => {
  let chosen;
  let castCopy = 'yes';
  const { game, players: [prismari, opponent] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseTargets' && q.candidates.includes(chosen)) return [chosen];
      if (q.type === 'chooseOption' && q.prompt?.startsWith('Renegade Bull:')) return castCopy;
      return defaultDecision(g, q);
    },
  ], 2);
  const rionya = permanent(game, prismari, 'Rionya, Fire Dancer');
  chosen = permanent(game, prismari, 'Storm-Kiln Artist');
  prismari.turnState.spellsCastList.push({ card: inZone(prismari, 'Abrade', 'exile'), mv: 2 });
  prismari.turnState.spellsCastList.push({ card: inZone(prismari, 'Prismari Charm', 'exile'), mv: 2 });

  await game.emit('beginCombat', { player: prismari });
  await resolveAll(game);
  const copies = game.bf().filter(card => card.isToken && card.name === chosen.name);
  assert.equal(copies.length, 3);
  copies[0].ctrl = opponent;
  await game.emit('endStep', { player: prismari });
  await resolveAll(game);
  assert.equal(copies.every(card => card.zone === 'ceased'), true, 'exile nije sacrifice i prati ukradenu kopiju');

  const bull = permanent(game, prismari, 'Renegade Bull');
  chosen = inZone(prismari, 'Abrade', 'graveyard');
  bull.attacking = opponent;
  await game.emit('attacks', { card: bull, player: prismari, defender: opponent });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).targets[0], chosen);
  await game.move(chosen, 'hand');
  await resolveAll(game);
  assert.equal(game.stack.length, 0, 'nestala meta ne zamjenjuje se drugom graveyard kartom');
  assert.ok(rionya);
  assert.equal(castCopy, 'yes');
});

test('Rootha vraća sebe kao cijenu i kopira tačno ciljani vlastiti spell', async () => {
  const { game, players: [prismari] } = rulesGame([], 2);
  const rootha = permanent(game, prismari, 'Rootha, Mercurial Artist');
  prismari.pool.C = 2;
  const charm = inZone(prismari, 'Prismari Charm', 'hand');
  assert.equal(await game.castSpell(prismari, charm, { from: 'hand', alt: { free: true } }), true);
  const original = game.stack.find(item => item.card === charm);
  const entry = { card: rootha, ability: rootha.def.abilities[0], idx: 0 };

  assert.equal(await game.activateAbility(prismari, entry, [original]), true);
  assert.equal(rootha.zone, 'hand', 'Rootha je vraćena prije priorityja i rezolucije');
  assert.equal(game.stack.at(-1).kind, 'ability');
  await game.resolveTop();
  assert.equal(game.stack.filter(item => item.kind === 'spell' && item.card === charm).length, 2);
  assert.equal(game.stack.at(-1).copyOf, original);
});

test('Petty Theft je Adventure instant: koristi vlastiti cost/MV i aktivira obje Roothe', async () => {
  const { game, players: [prismari, opponent] } = rulesGame([], 2);
  permanent(game, prismari, 'Rootha, Mastering the Moment', { commander: true });
  const mercurial = permanent(game, prismari, 'Rootha, Mercurial Artist');
  const target = permanent(game, opponent, 'Sol Ring');
  const borrower = inZone(prismari, 'Brazen Borrower', 'hand');
  const adventure = Object.assign({ adventure: true }, borrower.def.adventure);

  const cost = game.spellCost(prismari, borrower, adventure);
  assert.equal(cost.generic, 1, 'Petty Theft koristi {1}{U}, ne Brazen Borrowerov {1}{U}{U}');
  assert.equal(cost.pips.length, 1);
  assert.equal(cost.pips[0].includes('U'), true);

  prismari.pool.C = 1;
  prismari.pool.U = 1;
  assert.equal(await game.castSpell(prismari, borrower, { from: 'hand', alt: adventure }), true);
  const spell = game.stack.find(item => item.kind === 'spell' && item.card === borrower);
  assert.ok(spell);
  assert.equal(spell.name, 'Petty Theft');
  assert.equal(game.isInstantSorcerySpell(spell), true);
  assert.equal(game.stackSpellManaValue(spell), 2);
  assert.equal(prismari.turnState.spellsCastList.at(-1).isInstantSorcery, true);
  assert.equal(prismari.turnState.spellsCastList.at(-1).isCreature, false);
  assert.equal(prismari.turnState.spellsCastList.at(-1).mv, 2);

  const copyAbility = mercurial.def.abilities[0];
  assert.equal(copyAbility.cond(game, mercurial, prismari), true,
    'Rootha, Mercurial Artist vidi Adventure instant na Stacku');
  assert.equal(copyAbility.targets[0].filter(game, spell, prismari), true);

  await resolveAll(game);
  assert.equal(target.zone, 'hand', 'Petty Theft se normalno rezolvira');
  await game.emit('beginCombat', { player: prismari });
  await resolveAll(game);
  const elemental = game.creatures(prismari).find(card => card.isToken && card.hasSub('Elemental'));
  assert.ok(elemental, 'Rootha, Mastering the Moment pravi Elemental nakon Adventure instanta');
  assert.equal(elemental.power, 2);
  assert.equal(elemental.toughness, 2);
});

test('Thunderclap računa commander castove kada se delayed trigger rezolvira', async () => {
  const { game, players: [prismari] } = rulesGame([], 2);
  const drake = permanent(game, prismari, 'Thunderclap Drake');
  prismari.pool.C = 2;
  prismari.pool.U = 1;
  const entry = { card: drake, ability: drake.def.abilities[0], idx: 0 };
  assert.equal(await game.activateAbility(prismari, entry), true);
  assert.equal(drake.zone, 'graveyard');
  await resolveAll(game);

  const commander = inZone(prismari, 'Rootha, Mastering the Moment', 'command');
  commander.commander = true;
  commander.cmdCasts = 2;
  prismari.commanders = [commander];
  const spell = inZone(prismari, 'Abrade', 'hand');
  const so = { kind: 'spell', card: spell, ctrl: prismari, name: spell.name, targets: [], targetSpecs: [], castOpts: {} };
  game.stack.push(so);
  await game.emit('castIS', { player: prismari, card: spell, so, isInstantSorcery: true });
  await game.flushTriggers();
  await game.resolveTop();
  assert.equal(game.stack.filter(item => item.kind === 'spell' && item.card === spell).length, 3,
    'original plus dvije kopije za dva commander casta');
});

test('Magma Opus zaključava podjelu štete i dvije tap mete prije priorityja', async () => {
  let damageTargets;
  let tapTargets;
  const { game, players: [prismari, opponent] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseTargets' && q.prompt?.startsWith('Magma Opus: do četiri')) return damageTargets;
      if (q.type === 'chooseTargets' && q.prompt?.startsWith('Magma Opus: tačno dva')) return tapTargets;
      if (q.type === 'chooseX' && q.aiHint?.kind === 'magmaOpusDamage') return 3;
      return defaultDecision(g, q);
    },
  ], 2);
  const small = permanent(game, opponent, 'Stormcatch Mentor');
  const firstTap = permanent(game, opponent, 'Sol Ring');
  const secondTap = permanent(game, prismari, 'Arcane Signet');
  damageTargets = [small, opponent];
  tapTargets = [firstTap, secondTap];
  const life = opponent.life;
  for (let i = 0; i < 3; i++) inZone(prismari, 'Island', 'library');
  const opus = inZone(prismari, 'Magma Opus', 'hand');

  assert.equal(await game.castSpell(prismari, opus, { from: 'hand', alt: { free: true } }), true);
  const so = game.stack.find(item => item.card === opus);
  assert.equal(Array.from(so.damageDivision, entry => entry.n).join(','), '3,1');
  assert.equal(so.targets[0][0], damageTargets[0]);
  assert.equal(so.targets[0][1], damageTargets[1]);
  assert.equal(so.targets[1][0], tapTargets[0]);
  assert.equal(so.targets[1][1], tapTargets[1]);
  await resolveAll(game);
  assert.equal(small.zone, 'graveyard');
  assert.equal(opponent.life, life - 1);
  assert.equal(firstTap.tapped && secondTap.tapped, true);
  assert.equal(tokenCount(game, prismari, 'Elemental'), 1);
  assert.equal(prismari.hand.length, 2);
});

test('Prismari Charm pogađa jednu ili dvije mete, a Command izvršava modove štampanim redom na ciljanim igračima', async () => {
  let charmTargets;
  let sawCommandModes;
  const { game, players: [prismari, first, second] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'prismariCharm') return '1';
      if (q.type === 'chooseTargets' && q.prompt?.startsWith('1 šteta')) return charmTargets;
      if (q.type === 'chooseMulti' && q.aiHint?.kind === 'prismariCommand') {
        sawCommandModes = q.options.map(option => option.key);
        return ['2', '1'];
      }
      if (q.type === 'chooseTargets' && q.prompt === 'Ko vuče i odbacuje?') return [first];
      if (q.type === 'chooseTargets' && q.prompt === 'Ko pravi Treasure?') return [second];
      return defaultDecision(g, q);
    },
  ], 3);
  const one = permanent(game, first, 'Stormcatch Mentor');
  const two = permanent(game, second, 'Stormcatch Mentor');
  charmTargets = [one, two];
  const charm = inZone(prismari, 'Prismari Charm', 'hand');
  assert.equal(await game.castSpell(prismari, charm, { from: 'hand', alt: { free: true } }), true);
  await resolveAll(game);
  assert.equal(one.zone, 'graveyard');
  assert.equal(two.zone, 'graveyard');

  inZone(first, 'Island', 'hand');
  for (let i = 0; i < 3; i++) inZone(first, 'Mountain', 'library');
  const command = inZone(prismari, 'Prismari Command', 'hand');
  assert.equal(await game.castSpell(prismari, command, { from: 'hand', alt: { free: true } }), true);
  const commandSO = game.stack.find(item => item.card === command);
  assert.equal(Array.from(commandSO.mode).join(','), '1,2');
  assert.equal(commandSO.targets[0], first);
  assert.equal(commandSO.targets[1], second);
  assert.equal(sawCommandModes.includes('3'), false, 'mod bez legalne artifact mete nije ponuđen');
  await resolveAll(game);
  assert.equal(first.hand.length, 1, 'ciljani igrač je vukao dvije pa odbacio dvije');
  assert.equal(tokenCount(game, second, 'Treasure'), 1);
  assert.equal(tokenCount(game, prismari, 'Treasure'), 0);
});

test('Aether Gale traži tačno šest meta i Surge zadržava cast-time graveyard metu', async () => {
  let galeTargets;
  let graveTarget;
  const { game, players: [prismari, opponent] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseTargets' && q.prompt?.startsWith('Aether Gale:')) return galeTargets;
      if (q.type === 'chooseTargets' && q.candidates.includes(graveTarget)) return [graveTarget];
      return defaultDecision(g, q);
    },
  ], 2);
  galeTargets = [
    permanent(game, prismari, 'Sol Ring'),
    permanent(game, prismari, 'Arcane Signet'),
    permanent(game, opponent, 'Sol Ring'),
    permanent(game, opponent, 'Arcane Signet'),
    permanent(game, opponent, 'Stormcatch Mentor'),
    permanent(game, opponent, 'Goldspan Dragon'),
  ];
  const gale = inZone(prismari, 'Aether Gale', 'hand');
  assert.equal(await game.castSpell(prismari, gale, { from: 'hand', alt: { free: true } }), true);
  const locked = game.stack.find(item => item.card === gale).targets[0];
  assert.equal(Array.from(locked, card => card.iid).join(','), galeTargets.map(card => card.iid).join(','));
  await resolveAll(game);
  assert.equal(galeTargets.every(card => card.zone === 'hand'), true);

  permanent(game, prismari, 'Stormcatch Mentor');
  graveTarget = inZone(prismari, 'Abrade', 'graveyard');
  const fallback = inZone(prismari, 'Prismari Charm', 'graveyard');
  const surge = inZone(prismari, 'Surge to Victory', 'hand');
  assert.equal(await game.castSpell(prismari, surge, { from: 'hand', alt: { free: true } }), true);
  await game.move(graveTarget, 'hand');
  await resolveAll(game);
  assert.equal(fallback.zone, 'graveyard');
  assert.equal(prismari.exile.includes(fallback), false);
});

test('Creative Technique poštuje may, Dance može preći 13 i Replication retargetuje protivničku kopiju', async () => {
  let ownPermanent;
  let opponentPermanent;
  const { game, players: [prismari, opponent] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseOption' && q.prompt?.startsWith('Creative Technique:')) return 'no';
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'danceContinue') return 'yes';
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'demonstrate') return 'yes';
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'newTargets') return 'no';
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'chooseOpponent') return q.options.find(option => option.player === opponent)?.key;
      return defaultDecision(g, q);
    },
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'newTargets') return 'yes';
      if (q.type === 'chooseTargets' && q.candidates.includes(opponentPermanent)) return [opponentPermanent];
      return defaultDecision(g, q);
    },
  ], 2);
  const creativeHit = inZone(prismari, 'Abrade', 'library');
  const creative = new MTG.CardInst(MTG.DEFS['Creative Technique'], prismari);
  await creative.def.resolve({ g: game, src: creative, you: prismari, so: { ctrl: prismari } });
  assert.equal(creativeHit.zone, 'exile');
  assert.equal(game.stack.length, 0, 'odbijeni may ne baca otkriveni spell');

  const expensiveA = inZone(prismari, 'Magma Opus', 'library');
  const expensiveB = inZone(prismari, 'Volcanic Salvo', 'library');
  const dance = new MTG.CardInst(MTG.DEFS['Dance with Calamity'], prismari);
  await dance.def.resolve({ g: game, src: dance, you: prismari, so: { ctrl: prismari } });
  assert.equal(expensiveA.zone, 'exile');
  assert.equal(expensiveB.zone, 'exile');
  assert.equal(game.stack.length, 0, 'prelazak ukupnog mana valuea preko 13 ne baca nijedan spell');

  ownPermanent = permanent(game, prismari, 'Sol Ring');
  opponentPermanent = permanent(game, opponent, 'Goldspan Dragon');
  const replication = new MTG.CardInst(MTG.DEFS['Replication Technique'], prismari);
  const original = {
    kind: 'spell', card: replication, ctrl: prismari, name: replication.name,
    targets: [ownPermanent], targetSpecs: replication.def.targets, castOpts: {}, mode: null,
  };
  game.stack.push(original);
  assert.equal(await game.applyDemonstrate(prismari, original, replication), true);
  const opponentCopy = game.stack.at(-1);
  assert.equal(opponentCopy.ctrl, opponent);
  assert.equal(opponentCopy.targets[0], opponentPermanent);
});

test('Twinflame naplaćuje Strive po dodatnoj meti i egzilira tokene na sljedećem end stepu', async () => {
  let targets;
  const { game, players: [prismari] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.prompt?.startsWith('Twinflame:') ? targets : defaultDecision(g, q),
  ], 2);
  targets = [
    permanent(game, prismari, 'Goldspan Dragon'),
    permanent(game, prismari, 'Storm-Kiln Artist'),
  ];
  prismari.pool.C = 3;
  prismari.pool.R = 2;
  const twinflame = inZone(prismari, 'Twinflame', 'hand');
  assert.equal(await game.castSpell(prismari, twinflame, { from: 'hand' }), true);
  const so = game.stack.find(item => item.card === twinflame);
  assert.equal(so.manaSpent, 5, '{1}{R} plus jedan {2}{R} Strive');
  assert.equal(so.striveTargets, 2);
  await resolveAll(game);
  const copies = game.bf().filter(card => card.isToken && targets.some(target => target.name === card.name));
  assert.equal(copies.length, 2);
  await game.emit('endStep', { player: prismari });
  await resolveAll(game);
  assert.equal(copies.every(card => card.zone === 'ceased'), true);
});

test('Volcanic Salvo i Volcanic Torrent rade simultanu jednostranu štetu i mogu pogoditi planeswalkera', async () => {
  const { game, players: [prismari, opponent] } = rulesGame([], 2);
  const own = permanent(game, prismari, 'Stormcatch Mentor');
  const enemy = permanent(game, opponent, 'Goldspan Dragon');
  const walker = permanent(game, opponent, 'Kaya, Geist Hunter');
  walker.counters.loyalty = 5;
  const salvo = new MTG.CardInst(MTG.DEFS['Volcanic Salvo'], prismari);
  await salvo.def.resolve({ g: game, src: salvo, you: prismari, targets: [[enemy, walker]] });
  assert.equal(enemy.zone, 'graveyard');
  assert.equal(walker.zone, 'graveyard');
  assert.equal(own.zone, 'battlefield');

  const first = permanent(game, opponent, 'Stormcatch Mentor');
  const second = permanent(game, opponent, 'Stormcatch Mentor');
  prismari.turnState.spellsCast = 2;
  const torrent = new MTG.CardInst(MTG.DEFS['Volcanic Torrent'], prismari);
  await torrent.def.resolve({ g: game, src: torrent, you: prismari });
  assert.equal(first.zone, 'graveyard');
  assert.equal(second.zone, 'graveyard');
  assert.equal(own.zone, 'battlefield');
});

test('Restless Spire dobija pune karakteristike, Fellwar Stone samo stvarne protivničke boje i Study Hall scryja prvi cast', async () => {
  const { game, players: [prismari, opponent] } = rulesGame([], 2);
  const spire = permanent(game, prismari, 'Restless Spire');
  await spire.def.abilities[0].run({ g: game, src: spire, you: prismari });
  assert.equal(spire.is('Creature'), true);
  assert.equal(spire.hasSub('Elemental'), true);
  assert.deepEqual([...spire.colors].sort(), ['R', 'U']);
  assert.equal(spire.power, 2);
  assert.equal(spire.toughness, 1);
  assert.equal(spire.kw('first strike'), true);

  const stone = permanent(game, prismari, 'Fellwar Stone');
  permanent(game, opponent, 'Island');
  opponent.colorIdentity = ['U', 'R'];
  permanent(game, opponent, 'Command Tower');
  const spell = inZone(prismari, 'Prismari Charm', 'hand');
  const source = game.manaSources(prismari, { card: spell }).find(entry => entry.card === stone);
  assert.equal(Array.from(source.produce, option => Object.keys(option)[0]).sort().join(','), 'R,U');

  const hall = permanent(game, prismari, 'Study Hall');
  const commander = inZone(prismari, 'Rootha, Mastering the Moment', 'command');
  commander.commander = true;
  prismari.commanders = [commander];
  inZone(prismari, 'Island', 'library');
  const hallSource = game.manaSources(prismari, { card: commander }).find(entry => entry.card === hall && entry.m.onProduce);
  await hallSource.m.onProduce(game, hall, prismari, { U: 1 }, { card: commander });
  assert.equal(game.pendingTriggers.length, 1, 'prvi command-zone cast računa se kao X=1 prije inkrementa');
  await resolveAll(game);
});

test('Prepare prati trenutnog kontrolora, prestaje odlaskom izvora i Inspired okida jednom po combat grupi', async () => {
  const { game, players: [prismari, opponent] } = rulesGame([], 2);
  const painter = permanent(game, prismari, 'Inspired Skypainter');
  await painter.def.triggers.find(trigger => trigger.on === 'etb').run({ g: game, src: painter, you: prismari });
  const prepared = prismari.exile.find(card => card.meta?.preparedBy === painter.iid);
  assert.ok(prepared);

  prismari.pool.C = 3; prismari.pool.U = 1; prismari.pool.R = 1;
  assert.equal(game.castableList(prismari).some(entry => entry.card === prepared), true);
  painter.ctrl = opponent;
  opponent.pool.C = 3; opponent.pool.U = 1; opponent.pool.R = 1;
  game.turnPlayer = opponent;
  game.recalc();
  assert.equal(game.castableList(opponent).some(entry => entry.card === prepared), true,
    'kontrolor prepared permanenta može baciti spell-kopiju iz tuđeg egzila');
  assert.equal(game.castableList(prismari).some(entry => entry.card === prepared), false);
  await game.move(painter, 'graveyard');
  assert.equal(prepared.zone, 'ceased');
  assert.equal(prismari.exile.includes(prepared), false);

  const secondPainter = permanent(game, prismari, 'Inspired Skypainter');
  const [firstToken, secondToken] = await game.makeTokens('elemental11', prismari, { n: 2 });
  await game.emit('combatDamageGroupToPlayer', {
    player: opponent,
    cards: [firstToken, secondToken],
    hits: [{ card: firstToken, n: 1 }, { card: secondToken, n: 1 }],
    step: 'normal',
  });
  assert.equal(game.pendingTriggers.filter(trigger => trigger.src === secondPainter).length, 1,
    'jedna grupa tokena pravi jedan Inspired trigger');
  await resolveAll(game);
  assert.equal(prismari.exile.filter(card => card.meta?.preparedBy === secondPainter.iid).length, 1);
});

test('Leitmotif utiče na sva stvorenja tog imena bez obzira na kontrolora', async () => {
  const { game, players: [prismari, opponent] } = rulesGame([], 2);
  const own = permanent(game, prismari, 'Leitmotif Composer');
  const enemy = permanent(game, opponent, 'Leitmotif Composer');
  await own.def.abilities[0].run({ g: game, src: own, you: prismari });
  assert.equal(own.cur.unblockable, true);
  assert.equal(enemy.cur.unblockable, true);
});

test('Abstract Performance skriva prvu hrpu protivniku do izbora i zatim otkriva sačuvane karte kontroloru', async () => {
  let hiddenDuringChoice = 0;
  let leakedNames = false;
  const { game, players: [prismari] } = rulesGame([
    (g, q) => q.type === 'chooseCards' ? [] : defaultDecision(g, q),
    (g, q) => {
      if (q.type === 'chooseOption' && q.prompt?.startsWith('Abstract Performance')) {
        hiddenDuringChoice = prismari.exile.filter(card => card.faceDown).length;
        leakedNames = q.options[0].label.includes('Island') || q.options[0].label.includes('Abrade');
        return 'up';
      }
      return defaultDecision(g, q);
    },
  ], 2);
  for (const name of ['Island', 'Mountain', 'Abrade', 'Prismari Charm', 'Sol Ring', 'Arcane Signet', 'Magma Opus', 'Twinflame']) {
    inZone(prismari, name, 'library');
  }
  const performance = new MTG.CardInst(MTG.DEFS['Abstract Performance'], prismari);
  await performance.def.resolve({ g: game, src: performance, you: prismari, so: { ctrl: prismari } });
  assert.equal(hiddenDuringChoice, 4);
  assert.equal(leakedNames, false);
  assert.equal([...prismari.hand, ...prismari.graveyard, ...prismari.exile].some(card => card.faceDown), false);
});

test('Veyran i Harmonic Prodigy aditivno dupliraju magecraft, a Goldspan vidi zadržane mete spell-kopije', async () => {
  const { game, players: [prismari] } = rulesGame([], 2);
  permanent(game, prismari, 'Veyran, Voice of Duality');
  const prodigy = permanent(game, prismari, 'Harmonic Prodigy');
  const artist = permanent(game, prismari, 'Storm-Kiln Artist');
  const spell = inZone(prismari, 'Abrade', 'exile');
  const castData = { player: prismari, card: spell, isInstantSorcery: true };
  await game.emit('castIS', castData);
  await resolveAll(game);
  assert.equal(tokenCount(game, prismari, 'Treasure'), 3,
    'osnovni Storm-Kiln trigger + Veyran + Harmonic Prodigy');
  await game.emit('spellCopied', { ctrl: prismari, so: {}, isInstantSorcery: true });
  await resolveAll(game);
  assert.equal(tokenCount(game, prismari, 'Treasure'), 6);

  await game.move(prodigy, 'graveyard');
  await game.move(artist, 'graveyard');

  const dragon = permanent(game, prismari, 'Goldspan Dragon');
  const twinflame = inZone(prismari, 'Twinflame', 'exile');
  const original = {
    kind: 'spell', card: twinflame, ctrl: prismari, name: twinflame.name,
    targets: [[dragon]], targetSpecs: twinflame.def.targets(game, twinflame, {}, prismari), castOpts: {},
  };
  await game.copySpell(original, prismari, { mayNewTargets: false });
  await resolveAll(game);
  assert.equal(tokenCount(game, prismari, 'Treasure'), 8,
    'zadržana I/S meta spell-kopije pravi Goldspan trigger koji Veyran duplira');
  const treasure = game.bf().find(card => card.ctrl === prismari && card.hasSub('Treasure'));
  const doubledMana = game.manaSources(prismari, { card: spell })
    .find(source => source.card === treasure && source.grantedBy === dragon);
  assert.ok(doubledMana?.produce.some(option => option.R === 2));
});

test('Magma Opus kopija zadržava tačan broj meta i preslikava zaključanu podjelu štete', async () => {
  let newDamage;
  let newTap;
  const { game, players: [prismari, opponent] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'newTargets') return 'yes';
      if (q.type === 'chooseTargets' && q.prompt?.startsWith('Magma Opus: do četiri')) return newDamage;
      if (q.type === 'chooseTargets' && q.prompt?.startsWith('Magma Opus: tačno dva')) return newTap;
      return defaultDecision(g, q);
    },
  ], 2);
  const oldA = permanent(game, opponent, 'Stormcatch Mentor');
  const oldB = permanent(game, opponent, 'Goldspan Dragon');
  const oldTapA = permanent(game, opponent, 'Sol Ring');
  const oldTapB = permanent(game, prismari, 'Arcane Signet');
  const freshA = permanent(game, opponent, 'Storm-Kiln Artist');
  const freshB = permanent(game, opponent, 'Harmonic Prodigy');
  const freshTapA = permanent(game, opponent, 'Arcane Signet');
  const freshTapB = permanent(game, prismari, 'Sol Ring');
  newDamage = [freshA, freshB];
  newTap = [freshTapA, freshTapB];
  const opus = new MTG.CardInst(MTG.DEFS['Magma Opus'], prismari);
  const original = {
    kind: 'spell', card: opus, ctrl: prismari, name: opus.name,
    targets: [[oldA, oldB], [oldTapA, oldTapB]], targetSpecs: opus.def.targets, castOpts: {},
    damageDivision: [{ iid: oldA.iid, n: 3 }, { iid: oldB.iid, n: 1 }],
  };
  const copy = await game.copySpell(original, prismari, { mayNewTargets: true });
  assert.equal(Array.from(copy.targets[0], card => card.iid).join(','), newDamage.map(card => card.iid).join(','));
  assert.equal(Array.from(copy.targets[1], card => card.iid).join(','), newTap.map(card => card.iid).join(','));
  assert.equal(Array.from(copy.damageDivision, entry => entry.n).join(','), '3,1');
  assert.equal(Array.from(copy.damageDivision, entry => entry.iid).join(','), newDamage.map(card => card.iid).join(','));
});

test('Demonstrate je cast trigger na stacku i protivnička kopija ide iznad vlastite', async () => {
  let own;
  let enemy;
  const { game, players: [prismari, opponent] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseTargets' && q.candidates.includes(own)) return [own];
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'demonstrate') return 'yes';
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'chooseOpponent') return q.options[0].key;
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'newTargets') return 'no';
      return defaultDecision(g, q);
    },
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'newTargets') return 'yes';
      if (q.type === 'chooseTargets' && q.candidates.includes(enemy)) return [enemy];
      return defaultDecision(g, q);
    },
  ], 2);
  own = permanent(game, prismari, 'Sol Ring');
  enemy = permanent(game, opponent, 'Arcane Signet');
  prismari.pool.C = 4; prismari.pool.U = 1;
  const replication = inZone(prismari, 'Replication Technique', 'hand');
  assert.equal(await game.castSpell(prismari, replication, { from: 'hand' }), true);
  const original = game.stack.find(item => item.card === replication && !item.isCopy);
  assert.ok(original);
  assert.equal(game.stack.some(item => item.isCopy), false);
  assert.match(game.stack.at(-1).name, /Demonstrate/);

  await game.resolveTop();
  const copies = game.stack.filter(item => item.isCopy);
  assert.equal(copies.length, 2);
  assert.equal(game.stack.at(-1).ctrl, opponent, 'protivnička kopija se posljednja stavlja i prva rezolvira');
  assert.equal(game.stack.at(-1).targets[0], enemy);
});

test('Dance smije stati na nuli, Surge kopija je may, Mystic i Thunderclap poštuju stack stanje', async () => {
  let sanctuaryTarget;
  let sawMysticMay = false;
  const { game, players: [prismari, opponent] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseOption' && q.prompt?.startsWith('Dance with Calamity')) return 'no';
      if (q.type === 'chooseOption' && q.prompt?.startsWith('Surge to Victory')) return 'no';
      if (q.type === 'chooseTargets' && q.candidates.includes(sanctuaryTarget)) return [sanctuaryTarget];
      if (q.type === 'chooseOption' && q.prompt?.startsWith('Mystic Sanctuary')) {
        sawMysticMay = true;
        return 'no';
      }
      return defaultDecision(g, q);
    },
  ], 2);
  const top = inZone(prismari, 'Magma Opus', 'library');
  const dance = new MTG.CardInst(MTG.DEFS['Dance with Calamity'], prismari);
  await dance.def.resolve({ g: game, src: dance, you: prismari, so: { ctrl: prismari } });
  assert.equal(top.zone, 'library');

  const attacker = permanent(game, prismari, 'Stormcatch Mentor');
  const surgeCard = inZone(prismari, 'Abrade', 'graveyard');
  const surge = new MTG.CardInst(MTG.DEFS['Surge to Victory'], prismari);
  await surge.def.resolve({ g: game, src: surge, you: prismari, targets: [surgeCard] });
  await game.emit('combatDamageToPlayer', { card: attacker, player: opponent, n: 2, step: 'normal' });
  await resolveAll(game);
  assert.equal(surgeCard.zone, 'exile');
  assert.equal(game.stack.length, 0);

  permanent(game, prismari, 'Island');
  permanent(game, prismari, 'Island');
  permanent(game, prismari, 'Island');
  const sanctuary = permanent(game, prismari, 'Mystic Sanctuary');
  sanctuaryTarget = inZone(prismari, 'Prismari Charm', 'graveyard');
  await game.emit('etb', { card: sanctuary });
  await game.flushTriggers();
  assert.equal(sawMysticMay, false, 'may odluka dolazi tek na rezoluciji triggera');
  assert.equal(game.stack.at(-1).targets[0], sanctuaryTarget);
  await game.resolveTop();
  assert.equal(sawMysticMay, true);
  assert.equal(sanctuaryTarget.zone, 'graveyard');

  const drake = permanent(game, prismari, 'Thunderclap Drake');
  prismari.pool.C = 2; prismari.pool.U = 1;
  assert.equal(await game.activateAbility(prismari, { card: drake, ability: drake.def.abilities[0], idx: 0 }), true);
  await resolveAll(game);
  const commander = inZone(prismari, 'Rootha, Mastering the Moment', 'command');
  commander.commander = true; commander.cmdCasts = 2; prismari.commanders = [commander];
  const abandoned = inZone(prismari, 'Prismari Command', 'hand');
  const so = { kind: 'spell', card: abandoned, ctrl: prismari, name: abandoned.name, targets: [], targetSpecs: [], castOpts: {} };
  game.stack.push(so);
  await game.emit('castIS', { player: prismari, card: abandoned, so, isInstantSorcery: true });
  await game.flushTriggers();
  game.stack.splice(game.stack.indexOf(so), 1);
  abandoned.zone = 'graveyard'; prismari.graveyard.push(abandoned);
  await resolveAll(game);
  assert.equal(game.stack.length, 0, 'Thunderclap ne kopira spell koji više nije na stacku');
});

test('Prismari AI bira snažan Brudiclad token, korisne Command modove i legalno retargetuje demonstrate kopiju', async () => {
  const { game, players: [bot, opponent] } = rulesGame([], 2);
  bot.isAI = true;
  const treasure = (await game.makeTokens('treasure', bot))[0];
  const elemental = (await game.makeTokens('elementalUR44', bot))[0];
  let decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 814261,
    actionWindow: {
      type: 'chooseCards', from: [treasure, elemental], min: 0, max: 1,
      aiHint: { kind: 'brudicladToken' },
    },
  });
  const tokenChoice = MTG.unwrapBotDecisionAction(decision.action);
  assert.equal(tokenChoice.length, 1);
  assert.equal(tokenChoice[0], elemental);

  permanent(game, opponent, 'Stormcatch Mentor');
  decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 814262,
    actionWindow: {
      type: 'chooseMulti', min: 2, max: 2,
      options: [0, 1, 2].map(key => ({ key: String(key), label: String(key) })),
      aiHint: { kind: 'prismariCommand' },
    },
  });
  const modes = MTG.unwrapBotDecisionAction(decision.action);
  assert.equal(modes.length, 2);
  assert.equal(new Set(modes).size, 2);

  const replication = new MTG.CardInst(MTG.DEFS['Replication Technique'], bot);
  const own = permanent(game, bot, 'Sol Ring');
  const so = { card: replication, targets: [own], targetSpecs: replication.def.targets, castOpts: {} };
  decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: opponent.idx, seed: 814263,
    actionWindow: {
      type: 'chooseOption', options: [{ key: 'no', label: 'Iste' }, { key: 'yes', label: 'Nove' }],
      aiHint: { kind: 'newTargets', so },
    },
  });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action), 'yes');

  const ownTapA = permanent(game, bot, 'Veyran, Voice of Duality');
  const ownTapB = permanent(game, bot, 'Storm-Kiln Artist');
  const enemyTapA = permanent(game, opponent, 'Sol Ring');
  const enemyTapB = permanent(game, opponent, 'Arcane Signet');
  decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 814266,
    actionWindow: {
      type: 'chooseTargets', candidates: [ownTapA, ownTapB, enemyTapA, enemyTapB], min: 2, max: 2,
      aiHint: { goal: 'tap' },
    },
  });
  const tapChoices = MTG.unwrapBotDecisionAction(decision.action);
  assert.equal(tapChoices.length, 2);
  assert.equal(tapChoices.every(card => card.ctrl === opponent), true,
    'Magma Opus ne tapuje vlastiti engine kada postoje protivničke mete');
});

test('Prismari Artistry završava pune partije kao prvi deck i kao AI protivnik bez fallbacka', { timeout: 60_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Prismari Artistry', aiDecks: ['Doom Prevails', 'Turtle Power', 'Elven Council'], seed: 814264 },
    { humanDeck: 'Doom Prevails', aiDecks: ['Prismari Artistry', 'Turtle Power', 'Elven Council'], seed: 814265 },
  ];
  for (const scenario of scenarios) {
    const game = MTG.newGame({
      ...scenario, aiStyles: ['balanced', 'balanced', 'balanced'], difficulty: 'normal', maxTurns: 220, paced: false,
    });
    await game.start();
    assert.equal(game.gameOver, true);
    assert.ok(game.winner);
    assert.ok(game.turnNo < game.maxTurns);
    assert.equal(game.pendingTriggers.length, 0);
    const logs = (game.aiDecisionLog || []).filter(entry => entry.playerName &&
      game.players.some(player => player.name === entry.playerName && player.deckName === 'Prismari Artistry'));
    assert.equal(logs.some(entry => entry.fallback), false);
  }
});
