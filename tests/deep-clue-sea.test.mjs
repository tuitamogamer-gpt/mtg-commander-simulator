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

function rulesGame(deciders = [], count = 3) {
  const game = new MTG.Game({ seed: 814270, paced: false, maxTurns: 80 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Clue',
    { name: index ? `Opp ${index}` : 'Deep Clue Sea' },
    { decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 14;
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
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 400) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 400, 'Deep Clue Sea trigger/stack petlja se nije smirila');
}

test('Deep Clue Sea ima službenih 100 karata, 89 jedinstvenih i puni Clue AI profil', () => {
  const deck = MTG.DECKS['Deep Clue Sea'];
  assert.equal(deck.commander, 'Morska, Undersea Sleuth');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 89);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
  const profile = MTG.getDeckAIProfile('Deep Clue Sea');
  assert.equal(profile.archetype, 'Clue value and card draw');
  assert.ok(profile.primarySynergies.includes('artifacts'));
  assert.ok(profile.primarySynergies.includes('tokens'));
});

test('investigate twice su odvojeni događaji, Erdwal pravi samo jednu dodatnu istragu po potezu', async () => {
  const { game, players: [clue] } = rulesGame([], 2);
  permanent(game, clue, 'Erdwal Illuminator');
  await MTG.E.investigate(game, clue, 2);
  assert.equal(tokenCount(game, clue, 'Clue'), 2);
  assert.equal(game.pendingTriggers.filter(trigger => trigger.name === 'Dodatna istraga').length, 1);
  await resolveAll(game);
  assert.equal(tokenCount(game, clue, 'Clue'), 3);
  await MTG.E.investigate(game, clue, 2);
  await resolveAll(game);
  assert.equal(tokenCount(game, clue, 'Clue'), 5, 'Erdwal ne dodaje četvrtu istragu u istom potezu');
});

test('Academy, Adrix i Esix poštuju izbor redoslijeda replacement efekata i samo prvi batch postaje kopija', async () => {
  let copyTarget;
  const replacementOrder = [];
  const { game, players: [clue] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'tokenReplacementOrder') {
        const desired = ['Academy Manufactor', 'Adrix and Nev, Twincasters', 'Esix, Fractal Bloom']
          .find(name => q.options.some(option => option.source?.name === name));
        const picked = q.options.find(option => option.source?.name === desired);
        replacementOrder.push(picked.source.name);
        return picked.key;
      }
      if (q.type === 'chooseCards' && q.aiHint?.kind === 'esixCopy') return [copyTarget];
      return defaultDecision(g, q);
    },
  ], 2);
  permanent(game, clue, 'Academy Manufactor');
  permanent(game, clue, 'Adrix and Nev, Twincasters');
  permanent(game, clue, 'Esix, Fractal Bloom');
  copyTarget = permanent(game, clue, 'Graf Mole');

  await MTG.E.investigate(game, clue);
  assert.deepEqual(replacementOrder, ['Academy Manufactor', 'Adrix and Nev, Twincasters'],
    'posljednji preostali replacement primjenjuje se bez suvišnog choice prozora');
  assert.equal(game.bf().filter(card => card.ctrl === clue && card.isToken && card.name === 'Graf Mole').length, 6);
  assert.equal(tokenCount(game, clue, 'Clue'), 0);

  replacementOrder.length = 0;
  await MTG.E.investigate(game, clue);
  assert.equal(tokenCount(game, clue, 'Clue'), 2);
  assert.equal(tokenCount(game, clue, 'Food'), 2);
  assert.equal(tokenCount(game, clue, 'Treasure'), 2);
  assert.equal(replacementOrder.includes('Esix, Fractal Bloom'), false, 'Esix je već potrošen za ovaj potez');
});

test("city's blessing zahtijeva Ascend permanent, a Detective je zadržava kad je jednom stečena", () => {
  const { game, players: [clue] } = rulesGame([], 2);
  for (let i = 0; i < 10; i++) permanent(game, clue, i % 2 ? 'Island' : 'Forest');
  assert.equal(clue.cityBlessing, false);
  const detective = permanent(game, clue, 'Detective of the Month');
  assert.equal(clue.cityBlessing, true);
  game.battlefield = game.battlefield.filter(card => card === detective);
  game.recalc();
  assert.equal(clue.cityBlessing, true);
});

test('Morska, Alandra, Detective, Ethereal, Jolrael i Psychosis vide stvarni drugi i peti draw uz Teferi', async () => {
  const { game, players: [clue, opponent] } = rulesGame([], 2);
  const morska = permanent(game, clue, 'Morska, Undersea Sleuth', { commander: true });
  permanent(game, clue, 'Alandra, Sky Dreamer');
  permanent(game, clue, 'Detective of the Month');
  permanent(game, clue, 'Ethereal Investigator');
  permanent(game, clue, 'Jolrael, Mwonvuli Recluse');
  permanent(game, clue, 'Psychosis Crawler');
  permanent(game, clue, "Teferi's Ageless Insight");
  for (let i = 0; i < 12; i++) inZone(clue, i % 2 ? 'Island' : 'Forest', 'library');
  const life = opponent.life;

  await game.draw(clue, 1);
  await resolveAll(game);
  assert.equal(clue.turnState.drewThisTurn, 2);
  assert.equal(morska.counters['+1/+1'], 2);
  assert.equal(tokenCount(game, clue, 'Drake'), 1);
  assert.equal(tokenCount(game, clue, 'Detective'), 1);
  assert.equal(tokenCount(game, clue, 'Spirit'), 1);
  assert.equal(tokenCount(game, clue, 'Cat'), 1);
  assert.equal(opponent.life, life - 2);

  await game.draw(clue, 2);
  await resolveAll(game);
  assert.equal(clue.turnState.drewThisTurn, 6);
  assert.ok(game.creatures(clue).filter(card => card.hasSub('Drake')).every(card => card.power > 2),
    'peti draw je napravio Alandra pump');
});

test('Aerial Extortionist može egzilirati vlastiti nonland, daje owneru cast i vuče na tuđi off-hand cast', async () => {
  let target;
  const { game, players: [clue, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(target) ? [target] : defaultDecision(g, q),
  ], 2);
  const extortionist = permanent(game, clue, 'Aerial Extortionist');
  target = permanent(game, clue, 'Arcane Signet');
  for (let i = 0; i < 3; i++) inZone(clue, 'Island', 'library');
  await game.emit('etb', { card: extortionist });
  await resolveAll(game);
  assert.equal(target.zone, 'exile');
  assert.equal(target.meta.playableBy, clue);

  extortionist.def.exileAndPermit && await extortionist.def.exileAndPermit(game, permanent(game, opponent, 'Sol Ring'));
  const ring = opponent.exile.find(card => card.name === 'Sol Ring');
  game.turnPlayer = opponent;
  opponent.pool.C = 1;
  const entry = game.castableList(opponent).find(candidate => candidate.card === ring);
  assert.ok(entry, 'owner vidi Aerial kartu u legalnom off-zone cast spisku');
  assert.equal(await game.castSpell(opponent, ring, { from: entry.from, alt: entry.alt }), true);
  await resolveAll(game);
  assert.equal(ring.zone, 'battlefield');
  assert.equal(clue.hand.length, 1, 'Aerial vuče jer je drugi igrač bacio iz egzila');
});

test('Junk Winder zaključava metu na triggeru i ne prebacuje tap na drugi permanent', async () => {
  let chosen;
  const { game, players: [clue, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(chosen) ? [chosen] : defaultDecision(g, q),
  ], 2);
  permanent(game, clue, 'Junk Winder');
  chosen = permanent(game, opponent, 'Arcane Signet');
  const fallback = permanent(game, opponent, 'Sol Ring');
  await game.makeTokens('clue', clue);
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).targets[0], chosen);
  await game.move(chosen, 'hand');
  await resolveAll(game);
  assert.equal(fallback.tapped, false);

  chosen = fallback;
  await game.makeTokens('food', clue);
  await resolveAll(game);
  assert.equal(fallback.tapped, true);
  assert.equal(fallback.meta.noUntapOnce, true);
});

test('Koma žrtvuje drugu Zmiju kao cijenu, zaključava permanent i gasi mana i nonmana aktivacije do EOT', async () => {
  const { game, players: [clue, opponent] } = rulesGame([], 2);
  const koma = permanent(game, clue, 'Koma, Cosmos Serpent');
  const [coil] = await game.makeTokens('serpentKoma', clue);
  const ring = permanent(game, opponent, 'Sol Ring');
  const tapMode = game.activatableList(clue).find(entry => entry.card === koma && /ugasi aktivacije/.test(entry.ability.label));
  assert.ok(tapMode);
  assert.equal(await game.activateAbility(clue, tapMode, [ring]), true);
  assert.equal(coil.zone, 'ceased', 'Zmija je žrtvovana prije priorityja');
  await resolveAll(game);
  assert.equal(ring.tapped, true);
  assert.equal(ring.cur.activationDisabled, true);
  assert.equal(game.manaSources(opponent).some(source => source.card === ring), false);
  assert.equal(game.activatableList(opponent).some(entry => entry.card === ring), false);
  game.untilEffects = game.untilEffects.filter(effect => effect.expires !== 'eot');
  game.recalc();
  assert.equal(ring.cur.activationDisabled, false);
});

test('Selvala koristi Stack i proizvodi tačno prema vrhovima na rezoluciji', async () => {
  const { game, players: [clue, opponent, other] } = rulesGame([], 3);
  const selvala = permanent(game, clue, 'Selvala, Explorer Returned');
  for (const player of [clue, opponent, other]) inZone(player, 'Forest', 'library');
  const entry = game.activatableList(clue).find(action => action.card === selvala && action.ability);
  assert.equal(game.manaSources(clue).some(action=>action.card===selvala),false);
  assert.ok(entry);
  const life = clue.life;
  assert.equal(await game.activateAbility(clue, entry), true);
  assert.equal(clue.hand.length,0);assert.ok(game.stack.some(object=>object.srcCard===selvala));
  await resolveAll(game);
  assert.equal(clue.pool.G, 0);
  assert.equal(clue.life, life);
  assert.equal(clue.hand.length, 1);
  assert.equal(opponent.hand.length, 1);
  assert.equal(other.hand.length, 1);

  inZone(clue, 'Graf Mole', 'library');
  inZone(opponent, 'Island', 'library');
  inZone(other, 'Junk Winder', 'library');
  game.untap(selvala);
  const second=game.activatableList(clue).find(action=>action.card===selvala&&action.ability);
  assert.ok(second);assert.equal(await game.activateAbility(clue,second),true);
  assert.equal(clue.pool.G,0);await resolveAll(game);
  assert.equal(clue.pool.G,2);assert.equal(clue.life,life+2);
  for(const player of [clue,opponent,other])assert.equal(player.hand.length,2);
});

test('Tangletrove animira Clue u svakom combatu, a creature Equipment se odmah odvaja', async () => {
  const { game, players: [clue, opponent] } = rulesGame([], 2);
  permanent(game, clue, 'Tangletrove Kelp');
  permanent(game, clue, 'Armed with Proof');
  const host = permanent(game, clue, 'Graf Mole');
  const [clueToken] = await game.makeTokens('clue', clue);
  game.recalc();
  await game.attach(clueToken, host);
  assert.equal(clueToken.attachedTo, host.iid);
  await game.emit('beginCombat', { player: opponent });
  await resolveAll(game);
  assert.equal(clueToken.is('Creature'), true);
  assert.equal(clueToken.power, 6);
  assert.equal(clueToken.attachedTo, null);
  assert.equal(host.attachments.includes(clueToken.iid), false);
});

test('Nettlecyst Living weapon prolazi kroz Adrix replacement i priključuje se jednom Germu', async () => {
  const { game, players: [clue] } = rulesGame([], 2);
  permanent(game, clue, 'Adrix and Nev, Twincasters');
  const nettlecyst = permanent(game, clue, 'Nettlecyst');
  const before = clue.turnState.tokensCreated;
  await game.emit('etb', { card: nettlecyst });
  await resolveAll(game);
  assert.equal(clue.turnState.tokensCreated, before + 2, 'Adrix je udvostručio Living weapon event');
  const germ = game.bf().find(card => card.ctrl === clue && card.isToken && card.hasSub('Germ'));
  assert.ok(germ);
  assert.equal(nettlecyst.attachedTo, germ.iid);
  assert.equal(tokenCount(game, clue, 'Germ'), 1, 'neopremljeni 0/0 Germ je uklonjen kroz SBA');
});

test('Merchant zaključava jedan exalted trigger po Clueu, Search broji napade na igrača i planeswalkera', async () => {
  const { game, players: [clue, opponent] } = rulesGame([], 2);
  permanent(game, clue, 'Merchant of Truth');
  permanent(game, clue, 'Search the Premises');
  const attacker = permanent(game, clue, 'Graf Mole');
  const clues = await game.makeTokens('clue', clue, { n: 3 });
  attacker.attacking = opponent;
  await game.emit('attackersDeclared', { player: clue, attackers: [attacker] });
  await game.flushTriggers();
  assert.equal(game.stack.filter(item => item.name.includes('Clue exalted')).length, 3);
  for (const token of clues) await game.sacrifice(clue, token);
  await resolveAll(game);
  assert.equal(attacker.power, 5, 'tri odvojena triggera ostaju i poslije žrtvovanja Clueova');

  const walker = permanent(game, clue, 'Tezzeret, Betrayer of Flesh');
  const first = permanent(game, opponent, 'Graf Mole');
  const second = permanent(game, opponent, 'Junk Winder');
  const misses = permanent(game, opponent, 'Erdwal Illuminator');
  first.attacking = clue;
  second.attacking = walker;
  misses.attacking = opponent;
  await game.emit('attackersDeclared', { player: opponent, attackers: [first, second, misses] });
  await resolveAll(game);
  assert.equal(tokenCount(game, clue, 'Clue'), 2);
});

test('Ongoing Investigation okida jednom po oštećenom igraču i egzilira samo creature kartu iz groblja', async () => {
  let graveChoice;
  const { game, players: [clue, opponent, other] } = rulesGame([
    (g, q) => q.type === 'chooseCards' && q.aiHint?.kind === 'delve' ? [graveChoice] : defaultDecision(g, q),
  ], 3);
  const ongoing = permanent(game, clue, 'Ongoing Investigation');
  const first = permanent(game, clue, 'Graf Mole');
  const second = permanent(game, clue, 'Junk Winder');
  await game.emit('combatDamageGroupToPlayer', { player: opponent, cards: [first, second], hits: [] });
  await game.emit('combatDamageGroupToPlayer', { player: other, cards: [first], hits: [] });
  await resolveAll(game);
  assert.equal(tokenCount(game, clue, 'Clue'), 2);

  const land = inZone(clue, 'Forest', 'graveyard');
  graveChoice = inZone(clue, 'Graf Mole', 'graveyard');
  clue.pool.C = 1;
  clue.pool.G = 1;
  const action = game.activatableList(clue).find(entry => entry.card === ongoing);
  assert.ok(action);
  const life = clue.life;
  assert.equal(await game.activateAbility(clue, action), true);
  assert.equal(graveChoice.zone, 'exile');
  assert.equal(land.zone, 'graveyard');
  await resolveAll(game);
  assert.equal(clue.life, life + 2);
  assert.equal(tokenCount(game, clue, 'Clue'), 3);
});

test('Disorder in the Court traži tačno X meta bez limita pet i vraća netokene tapped', async () => {
  let targetPrompt;
  const { game, players: [clue, opponent] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseTargets' && q.prompt?.startsWith('Egzilaj privremeno')) {
        targetPrompt = q;
        return q.candidates.slice(0, q.max);
      }
      return defaultDecision(g, q);
    },
  ], 2);
  const creatures = [];
  for (let i = 0; i < 6; i++) creatures.push(permanent(game, i % 2 ? opponent : clue, i % 2 ? 'Graf Mole' : 'Erdwal Illuminator'));
  clue.pool.C = 6;
  clue.pool.W = 1;
  clue.pool.U = 1;
  const disorder = inZone(clue, 'Disorder in the Court', 'hand');
  assert.equal(await game.castSpell(clue, disorder, { from: 'hand', xVal: 6 }), true);
  assert.equal(targetPrompt.min, 6);
  assert.equal(targetPrompt.max, 6);
  assert.equal(game.stack.find(item => item.card === disorder).targets[0].length, 6);
  await resolveAll(game);
  assert.equal(creatures.every(card => card.zone === 'exile'), true);
  assert.equal(tokenCount(game, clue, 'Clue'), 6);
  await game.emit('endStep', { player: clue });
  await resolveAll(game);
  assert.equal(creatures.every(card => card.zone === 'battlefield' && card.tapped), true);
});

test('Farewell AI ne egzilira vlastitu artifact prednost, Finale AI untapuje samo svoje tapped landove', async () => {
  const { game, players: [bot, opponent] } = rulesGame([], 2);
  bot.isAI = true;
  permanent(game, bot, 'Academy Manufactor');
  permanent(game, bot, 'Sol Ring');
  permanent(game, bot, 'Arcane Signet');
  permanent(game, opponent, 'Koma, Cosmos Serpent');
  permanent(game, opponent, 'Junk Winder');
  permanent(game, opponent, 'Aerial Extortionist');
  const farewell = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 814271,
    actionWindow: {
      type: 'chooseMulti', min: 1, max: 4,
      options: [0, 1, 2, 3].map(index => ({ key: String(index), label: ['Artefakti', 'Stvorenja', 'Enchantmenti', 'Groblja'][index] })),
      aiHint: { kind: 'farewellModes' },
    },
  });
  assert.equal(farewell.action.value.includes('0'), false);
  assert.equal(farewell.action.value.includes('1'), true);

  const ownTapped = permanent(game, bot, 'Forest');
  ownTapped.tapped = true;
  const ownUntapped = permanent(game, bot, 'Island');
  const enemyTapped = permanent(game, opponent, 'Forest');
  enemyTapped.tapped = true;
  const finale = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 814272,
    actionWindow: {
      type: 'chooseCards', from: [ownTapped, ownUntapped, enemyTapped], min: 0, max: 3,
      aiHint: { kind: 'finaleUntap' },
    },
  });
  assert.equal(finale.action.picks.map(card => card.iid).join(','), String(ownTapped.iid));
});

test('Deep Clue AI bira optimalan replacement red, korisne optional triggere i Ransom mod prema tabli', async () => {
  const { game, players: [bot, opponent] } = rulesGame([], 2);
  bot.isAI = true;
  const academy = permanent(game, bot, 'Academy Manufactor');
  const adrix = permanent(game, bot, 'Adrix and Nev, Twincasters');
  const esix = permanent(game, bot, 'Esix, Fractal Bloom');
  let choice = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 814273,
    actionWindow: {
      type: 'chooseOption',
      options: [academy, adrix, esix].map((source, index) => ({ key: String(index), label: source.name, source })),
      aiHint: { kind: 'tokenReplacementOrder' },
    },
  });
  assert.equal(choice.action.option.source, academy);

  const land = permanent(game, bot, 'Forest');
  land.tapped = true;
  choice = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 814274,
    actionWindow: { type: 'chooseOption', options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }], aiHint: { kind: 'innocuousUntap' } },
  });
  assert.equal(choice.action.value, 'yes');
  land.tapped = false;
  choice = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 814275,
    actionWindow: { type: 'chooseOption', options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }], aiHint: { kind: 'innocuousUntap' } },
  });
  assert.equal(choice.action.value, 'no');

  const threat = permanent(game, opponent, 'Koma, Cosmos Serpent');
  choice = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 814276,
    actionWindow: {
      type: 'chooseOption', options: [{ key: 'draw', label: 'Vuci' }, { key: 'goad', label: 'Goad' }, { key: 'cloak', label: 'Cloak token' }],
      aiHint: { kind: 'ransom' },
    },
  });
  assert.equal(choice.action.value, 'goad');
  assert.ok(threat);
});

test('Prepared Braingeyser stvarno bira X i metu, okida Aerial i kopija prestaje poslije resolve i countera', async () => {
  let drawTarget;
  const { game, players: [prismari, clue] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseX' && q.card?.name === 'Braingeyser') return 3;
      if (q.type === 'chooseTargets' && q.prompt?.startsWith('Braingeyser')) return [drawTarget];
      return defaultDecision(g, q);
    },
  ], 2);
  const focusmage = permanent(game, prismari, 'Dirgur Focusmage');
  permanent(game, clue, 'Aerial Extortionist');
  for (let i = 0; i < 8; i++) inZone(prismari, 'Island', 'library');
  for (let i = 0; i < 3; i++) inZone(clue, 'Forest', 'library');
  const highMv = inZone(prismari, 'Magma Opus', 'hand');
  await game.emit('castIS', { player: prismari, card: highMv, mv: 8, fromHand: true, isInstantSorcery: true });
  await resolveAll(game);
  const prepared = prismari.exile.find(card => card.meta?.preparedBy === focusmage.iid);
  assert.ok(prepared);
  drawTarget = prismari;
  prismari.pool.C = 3;
  prismari.pool.U = 2;
  assert.equal(await game.castSpell(prismari, prepared, { from: 'exile' }), true);
  const spell = game.stack.find(item => item.card === prepared);
  assert.equal(spell.x, 3);
  assert.equal(spell.targets[0], prismari);
  assert.equal(focusmage.meta.prepared, false);
  await resolveAll(game);
  assert.equal(prepared.zone, 'ceased');
  assert.equal(prismari.hand.length, 4, 'Magma Opus ostaje u ruci, a Braingeyser vuče tri');
  assert.equal(clue.hand.length, 1, 'Aerialov kontrolor vuče zbog tuđeg casta iz egzila');

  await focusmage.def.triggers[0].run({ g: game, src: focusmage, you: prismari });
  const second = prismari.exile.find(card => card.meta?.preparedBy === focusmage.iid);
  prismari.pool.C = 1;
  prismari.pool.U = 2;
  drawTarget = prismari;
  assert.equal(await game.castSpell(prismari, second, { from: 'exile', xVal: 1 }), true);
  game.stack.splice(game.stack.findIndex(item => item.card === second), 1);
  await game.move(second, 'graveyard');
  assert.equal(second.zone, 'ceased');
  assert.equal(prismari.graveyard.includes(second), false);
});

test("Prepared Maestro's Gift zaključava creature metu, fizzla bez fallbacka i uspješno pravi haste kopiju", async () => {
  let copyTarget;
  const { game, players: [prismari] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.prompt === 'Kopiraj stvorenje' ? [copyTarget] : defaultDecision(g, q),
  ], 2);
  const painter = permanent(game, prismari, 'Inspired Skypainter');
  copyTarget = permanent(game, prismari, 'Graf Mole');
  await painter.def.triggers.find(trigger => trigger.on === 'etb').run({ g: game, src: painter, you: prismari });
  let prepared = prismari.exile.find(card => card.meta?.preparedBy === painter.iid);
  prismari.pool.C = 3;
  prismari.pool.U = 1;
  prismari.pool.R = 1;
  assert.equal(await game.castSpell(prismari, prepared, { from: 'exile' }), true);
  assert.equal(game.stack.find(item => item.card === prepared).targets[0], copyTarget);
  await game.move(copyTarget, 'hand');
  await resolveAll(game);
  assert.equal(prepared.zone, 'ceased');
  assert.equal(game.bf().some(card => card.isToken && card.name === 'Graf Mole'), false);

  const token = (await game.makeTokens('elemental11', prismari))[0];
  await game.emit('combatDamageGroupToPlayer', { player: game.players[1], cards: [token], hits: [{ card: token, n: 1 }] });
  await resolveAll(game);
  prepared = prismari.exile.find(card => card.meta?.preparedBy === painter.iid);
  copyTarget = permanent(game, prismari, 'Junk Winder');
  prismari.pool.C = 3;
  prismari.pool.U = 1;
  prismari.pool.R = 1;
  assert.equal(await game.castSpell(prismari, prepared, { from: 'exile' }), true);
  await resolveAll(game);
  const copy = game.bf().find(card => card.isToken && card.name === 'Junk Winder');
  assert.ok(copy);
  assert.equal(copy.kw('haste'), true);
  assert.equal(prepared.zone, 'ceased');
});

test('Deep Clue Sea završava pune partije kao prvi deck i kao AI protivnik bez fallbacka', { timeout: 60_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Deep Clue Sea', aiDecks: ['Doom Prevails', 'Turtle Power', 'Elven Council'], seed: 814277 },
    { humanDeck: 'Doom Prevails', aiDecks: ['Deep Clue Sea', 'Turtle Power', 'Elven Council'], seed: 814278 },
  ];
  for (const scenario of scenarios) {
    const game = MTG.newGame({
      ...scenario, aiStyles: ['balanced', 'balanced', 'balanced'], difficulty: 'normal', maxTurns: 200, paced: false,
    });
    await game.start();
    assert.equal(game.gameOver, true);
    assert.ok(game.winner);
    assert.ok(game.turnNo < game.maxTurns);
    assert.equal(game.pendingTriggers.length, 0);
    const clueLogs = (game.aiDecisionLog || []).filter(entry => entry.playerName &&
      game.players.some(player => player.name === entry.playerName && player.deckName === 'Deep Clue Sea'));
    assert.equal(clueLogs.some(entry => entry.fallback), false);
  }
});
