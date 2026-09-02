import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'attackers' || q.type === 'blockers') return [];
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseX') return q.max;
  if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(option => option.key);
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(deciders = [], count = 3) {
  const game = new MTG.Game({ seed: 81470, paced: false, maxTurns: 50 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Coven',
    { name: index ? `Opp ${index}` : 'Coven Counters' },
    { decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 9;
  game.phase = 'main1';
  game.step = 'main';
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

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 180) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 180, 'Coven trigger/stack petlja se nije smirila');
}

test('Coven Counters ima službenih 100 karata, 78 jedinstvenih i Coven AI profil', () => {
  const deck = MTG.DECKS['Coven Counters'];
  assert.equal(deck.commander, 'Leinore, Autumn Sovereign');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 78);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
  assert.equal(MTG.getDeckAIProfile('Coven Counters').archetype, 'Coven +1/+1 counters');
});

test('Coven razlikuje negativnu i nultu snagu, ali intervening-if ponovo provjerava na rezoluciji', async () => {
  const { game, players: [coven] } = rulesGame([], 2);
  const wardens = permanent(game, coven, 'Dawnhart Wardens');
  const pilgrim = permanent(game, coven, "Avacyn's Pilgrim");
  const wall = permanent(game, coven, 'Wall of Mourning');
  game.untilEffects.push({ expires: 'eot', apply: (g, bf) => { const card = bf.find(c => c === pilgrim); if (card) card.cur.power = -1; } });
  game.recalc();
  const trigger = wardens.def.triggers[0];
  assert.equal(trigger.filter(game, wardens, { player: coven }), true, '-1, 0 i 2 su tri različite snage');
  await game.emit('beginCombat', { player: coven });
  await game.flushTriggers();
  await game.move(wall, 'graveyard');
  await game.resolveTop();
  assert.equal(pilgrim.power, -1, 'Coven više nije istinit pa tim ne dobija +1/+0');
});

test('Sigarda Vanguard daje stvarni may izbor i sprečava dvije izabrane iste snage', async () => {
  let calls = 0;
  let chosen;
  const { game, players: [coven, opponent] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseCards' && q.aiHint?.kind === 'covenDifferentPowers') {
        calls++;
        if (calls === 1) return [chosen];
        assert.equal(q.from.some(card => card.power === chosen.power), false);
        return [];
      }
      return defaultDecision(g, q);
    },
  ], 2);
  chosen = permanent(game, coven, 'Dawnhart Wardens');
  permanent(game, coven, 'Ainok Bond-Kin');
  const vanguard = permanent(game, coven, "Sigarda's Vanguard");
  await game.emit('etb', { card: vanguard });
  await resolveAll(game);
  assert.equal(chosen.kw('double strike'), true);
  assert.equal(game.creatures(coven).filter(card => card !== chosen && card.kw('double strike')).length, 0);
});

test('Wall of Mourning egzilira stvarni vrh licem nadolje i vraća izabranu kartu tek uz Coven', async () => {
  let selected;
  const { game, players: [coven] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'wallMourning' ? [selected] : defaultDecision(g, q),
  ], 2);
  const bottom = inZone(coven, 'Forest', 'library');
  const top = inZone(coven, 'Biogenic Upgrade', 'library');
  const wall = permanent(game, coven, 'Wall of Mourning');
  await game.emit('etb', { card: wall });
  await resolveAll(game);
  assert.equal(top.zone, 'exile');
  assert.equal(top.faceDown, true);
  assert.equal(top.meta.revealedTo.length, 1);
  assert.equal(top.meta.revealedTo[0], coven.idx);
  assert.equal(bottom.zone, 'library');
  selected = top;
  permanent(game, coven, "Avacyn's Pilgrim");
  permanent(game, coven, 'Indomitable Ancients');
  await game.emit('endStep', { player: coven });
  await resolveAll(game);
  assert.equal(top.zone, 'hand');
  assert.equal(top.faceDown, false);
  assert.equal(coven.hand.includes(top), true);
});

test('Riders of Gavony nudi svaki creature type bez čitanja skrivene protivničke biblioteke', async () => {
  let options;
  const { game, players: [coven, opponent] } = rulesGame([
    (g, q) => {
      if (q.aiHint?.kind === 'creatureType') { options = q.options; return 'Human'; }
      return defaultDecision(g, q);
    },
  ], 2);
  permanent(game, opponent, 'Kyler, Sigardian Emissary');
  inZone(opponent, 'Zetalpa, Primal Dawn', 'library');
  const riders = inZone(coven, 'Riders of Gavony', 'hand');
  await game.move(riders, 'battlefield', { ctrl: coven });
  assert.ok(options.length > 20);
  assert.ok(options.find(option => option.key === 'Human').keepValue > 0);
  assert.equal(options.find(option => option.key === 'Dinosaur').keepValue, 0);
  assert.equal(riders.meta.chosenType, 'Human');
});

test('Elite Scaleguard bira bolster tie i cilja samo stvorenje defending igrača', async () => {
  let bolsterTarget;
  const { game, players: [coven, defender, bystander] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'bolster' ? [bolsterTarget] : defaultDecision(g, q),
  ]);
  const first = permanent(game, coven, "Avacyn's Pilgrim");
  bolsterTarget = permanent(game, coven, 'Gyre Sage');
  const scaleguard = permanent(game, coven, 'Elite Scaleguard');
  await game.emit('etb', { card: scaleguard });
  await resolveAll(game);
  assert.equal(bolsterTarget.counters['+1/+1'], 2);
  assert.equal(first.counters['+1/+1'] || 0, 0);

  game.addCounters(first, '+1/+1', 1);
  const defenderCreature = permanent(game, defender, 'Dawnhart Wardens');
  permanent(game, bystander, 'Indomitable Ancients');
  await game.emit('attacks', { card: first, player: coven, defender });
  await game.flushTriggers();
  const trigger = game.stack.at(-1);
  assert.equal(trigger.targets.length, 1);
  assert.equal(trigger.targets[0], defenderCreature);
});

test('Kurbis dobija countere samo za stvarno potrošenu manu i ne može ciljati sebe', async () => {
  const { game, players: [coven] } = rulesGame([], 2);
  const kurbis = inZone(coven, 'Kurbis, Harvest Celebrant', 'hand');
  coven.tempReductions = [{ delta: -2, once: true, filter: (g, card) => card === kurbis }];
  coven.pool.G = 2;
  coven.pool.C = 1;
  assert.equal(await game.castSpell(coven, kurbis, { xVal: 3 }), true);
  await resolveAll(game);
  assert.equal(kurbis.zone, 'battlefield');
  assert.equal(kurbis.castMeta.manaSpent, 3);
  assert.equal(kurbis.counters['+1/+1'], 3);
  const spec = kurbis.def.abilities[0].targets[0];
  assert.equal(game.legalTargets(spec, kurbis, coven).includes(kurbis), false);
});

test('Biogenic Upgrade zaključava raspodjelu prije priorityja i ne redistribuira nestalu metu', async () => {
  let first;
  let second;
  let prioritySeen = false;
  const { game, players: [coven, opponent] } = rulesGame([
    async (g, q) => {
      if (q.type === 'chooseTargets' && q.src?.name === 'Biogenic Upgrade') return [first, second];
      if (q.type === 'chooseX' && q.aiHint?.kind === 'counterDistribution') return 1;
      return defaultDecision(g, q);
    },
    async (g, q) => {
      if (q.type === 'priority') {
        const stackSpell = g.stack.find(item => item.card?.name === 'Biogenic Upgrade');
        if (stackSpell) {
          prioritySeen = stackSpell.counterDistribution.map(entry => entry.n).join(',') === '1,2';
          if (first.zone === 'battlefield') await g.move(first, 'graveyard');
        }
      }
      return defaultDecision(g, q);
    },
  ], 2);
  first = permanent(game, coven, "Avacyn's Pilgrim");
  second = permanent(game, coven, 'Dawnhart Wardens');
  inZone(opponent, 'Swords to Plowshares', 'hand');
  opponent.pool.W = 1;
  second.counters['+1/+1'] = 1;
  game.recalc();
  const spell = inZone(coven, 'Biogenic Upgrade', 'hand');
  coven.pool.G = 2; coven.pool.C = 4;
  assert.equal(await game.castSpell(coven, spell), true);
  await resolveAll(game);
  assert.equal(prioritySeen, true);
  assert.equal(second.counters['+1/+1'], 6, '1 postojeći + 2 raspoređena, pa dupliranje na 6');
});

test('Verdurous Gearhulk raspoređuje četiri countera među više targeta', async () => {
  let first;
  let second;
  const { game, players: [coven] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseTargets' && q.src?.name === 'Verdurous Gearhulk') return [first, second];
      if (q.type === 'chooseX' && q.aiHint?.kind === 'counterDistribution') return 3;
      return defaultDecision(g, q);
    },
  ], 2);
  first = permanent(game, coven, "Avacyn's Pilgrim");
  second = permanent(game, coven, 'Dawnhart Wardens');
  const gearhulk = permanent(game, coven, 'Verdurous Gearhulk');
  await game.emit('etb', { card: gearhulk });
  await resolveAll(game);
  assert.equal(first.counters['+1/+1'], 3);
  assert.equal(second.counters['+1/+1'], 1);
});

test('Citadel Siege bira režim as-enters, a Dragons target je vidljiv na stacku', async () => {
  let chosenTarget;
  const { game, players: [coven, active] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'citadelSiege' ? 'dragons' : defaultDecision(g, q),
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(chosenTarget) ? [chosenTarget] : defaultDecision(g, q),
  ], 2);
  const siege = inZone(coven, 'Citadel Siege', 'hand');
  await game.move(siege, 'battlefield', { ctrl: coven });
  assert.equal(siege.meta.siege, 'dragons');
  chosenTarget = permanent(game, active, 'Indomitable Ancients');
  await game.emit('beginCombat', { player: active });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).targets[0], chosenTarget);
  assert.equal(chosenTarget.tapped, false);
  await game.resolveTop();
  assert.equal(chosenTarget.tapped, true);
});

test('Coven tokeni imaju tačne tipove, statove, boje i sposobnosti', async () => {
  const { game, players: [coven] } = rulesGame([], 2);
  await MTG.DEFS['Bestial Menace'].resolve({ g: game, you: coven, targets: [] });
  await MTG.DEFS["Trostani's Summoner"].triggers[0].run({ g: game, you: coven, src: null });
  await MTG.DEFS['Growth Spasm'].resolve({ g: game, you: coven, targets: [] });
  const snake = game.creatures(coven).find(card => card.hasSub('Snake'));
  const knight = game.creatures(coven).find(card => card.hasSub('Knight'));
  const centaur = game.creatures(coven).find(card => card.hasSub('Centaur'));
  const rhino = game.creatures(coven).find(card => card.hasSub('Rhino'));
  const spawn = game.creatures(coven).find(card => card.hasSub('Spawn'));
  assert.deepEqual([snake.power, snake.toughness, snake.colors.join('')], [1, 1, 'G']);
  assert.deepEqual([knight.power, knight.toughness, knight.kw('vigilance')], [2, 2, true]);
  assert.deepEqual([centaur.power, centaur.toughness], [3, 3]);
  assert.deepEqual([rhino.power, rhino.toughness, rhino.kw('trample')], [4, 4, true]);
  assert.deepEqual([spawn.power, spawn.toughness, spawn.colors.length], [0, 1, 0]);
  assert.ok(spawn.def.mana);
});

test('Knight nalazi nonbasic Plains untapped, a Myriad drugi basic mora dijeliti tip', async () => {
  let firstSearch = true;
  let secondOptions;
  const { game, players: [coven, opponent] } = rulesGame([
    (g, q) => {
      if (q.search && q.prompt === 'Search for a land') return [q.from.find(card => card.name === 'Canopy Vista')];
      if (q.search && q.prompt === 'First basic land') { firstSearch = false; return [q.from.find(card => card.name === 'Plains')]; }
      if (q.search && q.prompt?.startsWith('Second basic')) { secondOptions = q.from.slice(); return [q.from[0]]; }
      return defaultDecision(g, q);
    },
  ], 2);
  permanent(game, coven, 'Plains');
  permanent(game, coven, 'Forest');
  permanent(game, opponent, 'Forest');
  permanent(game, opponent, 'Plains');
  permanent(game, opponent, 'Command Tower');
  const vista = inZone(coven, 'Canopy Vista', 'library');
  const knight = permanent(game, coven, 'Knight of the White Orchid');
  await game.emit('etb', { card: knight });
  await resolveAll(game);
  assert.equal(vista.zone, 'battlefield');
  assert.equal(vista.tapped, false);

  const plains1 = inZone(coven, 'Plains', 'library');
  const plains2 = inZone(coven, 'Plains', 'library');
  inZone(coven, 'Forest', 'library');
  const landscape = permanent(game, coven, 'Myriad Landscape');
  await landscape.def.abilities[0].run({ g: game, you: coven, src: landscape });
  assert.equal(firstSearch, false);
  assert.ok(secondOptions.length >= 1 && secondOptions.every(card => card.hasSub('Plains')));
  assert.equal([plains1, plains2].filter(card => card.zone === 'battlefield').length, 2);
});

test('Celestial Judgment poštuje izbor za svaku stvarnu snagu i destroy-all je simultan', async () => {
  let keepMine;
  const { game, players: [coven, opponent] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'celestialKeep' && q.from.includes(keepMine) ? [keepMine] : defaultDecision(g, q),
  ], 2);
  const doomedMine = permanent(game, coven, 'Abzan Falconer');
  keepMine = permanent(game, coven, 'Ainok Bond-Kin');
  permanent(game, opponent, 'Gyre Sage');
  await MTG.DEFS['Celestial Judgment'].resolve({ g: game, you: coven, targets: [] });
  assert.equal(keepMine.zone, 'battlefield');
  assert.equal(doomedMine.zone, 'graveyard');

  const protector = permanent(game, coven, 'Bastion Protector');
  const commander = permanent(game, coven, 'Leinore, Autumn Sovereign', { commander: true });
  game.recalc();
  await MTG.DEFS['Cleansing Nova'].resolve({ g: game, you: coven, mode: [0], targets: [] });
  assert.equal(protector.zone, 'graveyard');
  assert.equal(commander.zone, 'battlefield', 'indestructible je zaključan prije simultanog uništenja');
});

test('Eternal Witness zaključava graveyard target, Curse egzilira umrlo stvorenje i pravi Spidera', async () => {
  let witnessTarget;
  const { game, players: [coven, cursed] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(witnessTarget) ? [witnessTarget] : defaultDecision(g, q),
  ], 2);
  witnessTarget = inZone(coven, 'Biogenic Upgrade', 'graveyard');
  const witness = permanent(game, coven, 'Eternal Witness');
  await game.emit('etb', { card: witness });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).targets[0], witnessTarget);
  await game.move(witnessTarget, 'exile');
  await game.resolveTop();
  assert.equal(witnessTarget.zone, 'exile');

  const curse = permanent(game, coven, 'Curse of Clinging Webs');
  curse.meta.cursedPlayer = cursed;
  const victim = permanent(game, cursed, 'Dawnhart Wardens');
  await game.destroy(victim);
  await resolveAll(game);
  assert.equal(victim.zone, 'exile');
  assert.equal(game.creatures(coven).some(card => card.isToken && card.hasSub('Spider')), true);
});

test('Enchant player Aura ostaje na bojnom polju vezana za izabranog protivnika', async () => {
  let cursed;
  const { game, players: [coven, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.src?.name === 'Curse of Clinging Webs'
      ? [cursed]
      : defaultDecision(g, q),
  ], 2);
  cursed = opponent;
  const curse = inZone(coven, 'Curse of Clinging Webs', 'hand');
  coven.pool.G = 1;
  coven.pool.C = 2;
  game.priorityRound = async () => {};

  assert.equal(await game.castSpell(coven, curse), true);
  const stackObject = game.stack.find(item => item.card === curse);
  assert.ok(stackObject);
  assert.equal(stackObject.targets[0], cursed);

  await resolveAll(game);
  assert.equal(curse.zone, 'battlefield');
  assert.equal(curse.meta.cursedPlayer, cursed);
  assert.equal(game.bf().includes(curse), true);
});

test('Moorland Rescuer vraća izabrani paket do LKI budžeta i zatim egzilira sebe', async () => {
  let picks = 0;
  let cheap;
  let large;
  const { game, players: [coven] } = rulesGame([
    (g, q) => {
      if (q.aiHint?.kind === 'moorlandRescuer') return picks++ === 0 ? [large] : picks === 2 ? [cheap] : [];
      return defaultDecision(g, q);
    },
  ], 2);
  cheap = inZone(coven, "Avacyn's Pilgrim", 'graveyard');
  large = inZone(coven, 'Dawnhart Wardens', 'graveyard');
  const rescuer = permanent(game, coven, 'Moorland Rescuer');
  await game.destroy(rescuer);
  await resolveAll(game);
  assert.equal(large.zone, 'battlefield');
  assert.equal(cheap.zone, 'battlefield');
  assert.equal(rescuer.zone, 'exile');
});

test('Return to Dust zaključava broj različitih meta po cast fazi, Formation koristi cast snapshot i Sigarda štiti igrača', async () => {
  const { game, players: [coven, opponent] } = rulesGame([], 2);
  const dust = new MTG.CardInst(MTG.DEFS['Return to Dust'], coven);
  game.phase = 'combat';
  assert.equal(game.spellTargetSpecs(dust, {}).length, 1);
  game.phase = 'main1';
  const specs = game.spellTargetSpecs(dust, {});
  assert.equal(specs.length, 2);
  assert.equal(specs[1].differentFromAllPrevious, true);

  const pilgrim = permanent(game, coven, "Avacyn's Pilgrim");
  const formation = new MTG.CardInst(MTG.DEFS['Unbreakable Formation'], coven);
  formation.castMeta = { castPhase: 'main1' };
  game.phase = 'combat';
  await formation.def.resolve({ g: game, you: coven, src: formation, targets: [] });
  assert.equal(pilgrim.counters['+1/+1'], 1);
  assert.equal(pilgrim.kw('vigilance'), true);

  const sigarda = permanent(game, coven, "Sigarda, Heron's Grace");
  game.recalc();
  const playerSpec = MTG.T.opponent({});
  assert.equal(game.legalTargets(playerSpec, sigarda, opponent).includes(coven), false);
});

test('Coven AI bira Khans na counter tabli, javni creature type i korisne različite snage', async () => {
  const { game, players: [coven, opponent] } = rulesGame([], 2);
  coven.isAI = true;
  coven.controller = new MTG.AIController(coven, { difficulty: 'tough' });
  const pilgrim = permanent(game, coven, "Avacyn's Pilgrim");
  permanent(game, coven, 'Leinore, Autumn Sovereign');
  permanent(game, opponent, 'Dawnhart Wardens');
  const siegeChoice = await coven.controller.decide(game, {
    type: 'chooseOption', options: [{ key: 'khans', label: 'Khans' }, { key: 'dragons', label: 'Dragons' }],
    aiHint: { kind: 'citadelSiege' },
  });
  assert.equal(siegeChoice, 'khans');
  const picked = await coven.controller.decide(game, {
    type: 'chooseCards', from: [pilgrim], min: 0, max: 1,
    aiHint: { kind: 'covenDifferentPowers' }, prompt: 'Coven izbor',
  });
  assert.equal(picked.length, 1);
  assert.equal(picked[0], pilgrim);
});

test('Leinore može counterom uključiti Coven na rezoluciji i tek tada vuče kartu', async () => {
  let target;
  const { game, players: [coven] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(target) ? [target] : defaultDecision(g, q),
  ], 2);
  permanent(game, coven, 'Leinore, Autumn Sovereign');
  target = permanent(game, coven, "Avacyn's Pilgrim");
  permanent(game, coven, "Avacyn's Pilgrim");
  permanent(game, coven, 'Wall of Mourning');
  const draw = inZone(coven, 'Forest', 'library');
  await game.emit('beginCombat', { player: coven });
  await resolveAll(game);
  assert.equal(target.counters['+1/+1'], 1);
  assert.equal(draw.zone, 'hand');
});

test('Gyre Sage ponovo provjerava evolve, a Juniper ne counteruje stvorenje koje je otišlo', async () => {
  const { game, players: [coven] } = rulesGame([], 2);
  const sage = permanent(game, coven, 'Gyre Sage');
  const entrant = permanent(game, coven, 'Dawnhart Wardens');
  await game.emit('etb', { card: entrant });
  await game.flushTriggers();
  game.addCounters(sage, '+1/+1', 3);
  await game.resolveTop();
  assert.equal(sage.counters['+1/+1'], 3, 'entrant više nije veći pri rezoluciji');

  const ranger = permanent(game, coven, 'Juniper Order Ranger');
  const secondEntrant = permanent(game, coven, "Avacyn's Pilgrim");
  await game.emit('etb', { card: secondEntrant });
  await game.flushTriggers();
  await game.move(secondEntrant, 'graveyard');
  await resolveAll(game);
  assert.equal(ranger.counters['+1/+1'], 1);
  assert.equal(secondEntrant.counters['+1/+1'] || 0, 0);
});

test('Kessig Cagebreakers nema umjetni token cap, a Fortified Village reveal je stvarni may izbor', async () => {
  let reveal = false;
  const { game, players: [coven] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'revealLand' ? (reveal ? [q.from[0]] : []) : defaultDecision(g, q),
  ], 2);
  const cagebreakers = permanent(game, coven, 'Kessig Cagebreakers');
  for (let i = 0; i < 9; i++) inZone(coven, "Avacyn's Pilgrim", 'graveyard');
  await cagebreakers.def.triggers[0].run({ g: game, you: coven, src: cagebreakers });
  assert.equal(game.creatures(coven).filter(card => card.isToken && card.hasSub('Wolf')).length, 9);

  inZone(coven, 'Forest', 'hand');
  const tappedVillage = inZone(coven, 'Fortified Village', 'hand');
  await game.move(tappedVillage, 'battlefield', { ctrl: coven });
  assert.equal(tappedVillage.tapped, true);
  reveal = true;
  const untappedVillage = inZone(coven, 'Fortified Village', 'hand');
  await game.move(untappedVillage, 'battlefield', { ctrl: coven });
  assert.equal(untappedVillage.tapped, false);
  assert.ok(untappedVillage.meta.revealedLandIid);
});

test('Ruinous Intrusion koristi stvarni mana value, a may efekti odlučuju tek na rezoluciji', async () => {
  let accept = false;
  const { game, players: [coven] } = rulesGame([
    (g, q) => {
      if (q.aiHint?.kind === 'enduringScalelord' || q.aiHint?.kind === 'lifecrafterPay') return accept ? 'yes' : 'no';
      return defaultDecision(g, q);
    },
  ], 2);
  const target = permanent(game, coven, "Avacyn's Pilgrim");
  const artifact = permanent(game, coven, 'Arcane Signet');
  await MTG.DEFS['Ruinous Intrusion'].resolve({ g: game, you: coven, targets: [artifact, target] });
  assert.equal(artifact.zone, 'exile');
  assert.equal(target.counters['+1/+1'], 2);

  const scalelord = permanent(game, coven, 'Enduring Scalelord');
  const trigger = scalelord.def.triggers[0];
  assert.equal(trigger.opt, undefined, 'may odluka nije preuranjeni optional trigger');
  await trigger.run({ g: game, you: coven, src: scalelord });
  assert.equal(scalelord.counters['+1/+1'] || 0, 0);
  accept = true;
  await trigger.run({ g: game, you: coven, src: scalelord });
  assert.equal(scalelord.counters['+1/+1'], 1);

  const bestiary = permanent(game, coven, "Lifecrafter's Bestiary");
  const draw = inZone(coven, 'Forest', 'library');
  coven.pool.G = 1;
  assert.equal(bestiary.def.triggers[1].opt, undefined);
  await bestiary.def.triggers[1].run({ g: game, you: coven, src: bestiary });
  assert.equal(draw.zone, 'hand');
  assert.equal(coven.pool.G, 0);
});

test('Coven Counters završava pune partije kao prvi deck i kao AI protivnik bez fallbacka', { timeout: 60_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Coven Counters', aiDecks: ['Doom Prevails', 'Turtle Power', 'Elven Council'], seed: 81472 },
    { humanDeck: 'Doom Prevails', aiDecks: ['Coven Counters', 'Turtle Power', 'Elven Council'], seed: 81473 },
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
    const covenLogs = (game.aiDecisionLog || []).filter(entry => entry.playerName &&
      game.players.some(player => player.name === entry.playerName && player.deckName === 'Coven Counters'));
    assert.equal(covenLogs.some(entry => entry.fallback), false);
  }
});
