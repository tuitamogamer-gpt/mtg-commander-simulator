import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'attackers' || q.type === 'blockers' || q.type === 'declareAttackers' || q.type === 'declareBlockers') return [];
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseMulti') return q.options.slice(0, q.min ?? 1).map(option => option.key);
  if (q.type === 'chooseX') return q.min || 0;
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(deciders = [], count = 4) {
  const game = new MTG.Game({ seed: 81426, paced: false, maxTurns: 40 });
  const controllers = Array.from({ length: count }, (_, index) => ({
    decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q),
  }));
  const players = controllers.map((controller, index) =>
    game.addPlayer(index ? `Opponent ${index}` : 'Elven', { name: index ? `Opp ${index}` : 'Elven Council' }, controller, index > 0));
  game.turnPlayer = players[0];
  game.turnNo = 6;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players, controllers };
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = opts.sick ?? false;
  card.tapped = opts.tapped ?? false;
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

function synthetic(game, player, def) {
  const card = new MTG.CardInst(Object.assign({
    cost: null, super: [], types: ['Creature'], subtypes: [], kws: [], oracle: '', power: '1', toughness: '1',
  }, def), player);
  card.ctrl = player; card.zone = 'battlefield'; card.sick = false;
  game.battlefield.push(card); game.recalc();
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 160) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 160, 'trigger/stack petlja se nije smirila');
}

test('Elven Council ima 100 karata, 76 jedinstvenih i puni AI profil', () => {
  const deck = MTG.DECKS['Elven Council'];
  assert.equal(deck.commander, 'Galadriel, Elven-Queen');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 76);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
  assert.equal(MTG.getDeckAIProfile('Elven Council').archetype, 'Elf voting value');
});

test('Galadriel pamti drugog Elfa koji je ušao pa napustio battlefield', async () => {
  const { game, players: [elven] } = rulesGame([], 2);
  const entered = inZone(elven, 'Elvish Mystic', 'hand');
  await game.move(entered, 'battlefield', { ctrl: elven });
  await game.move(entered, 'graveyard');
  const galadriel = permanent(game, elven, 'Galadriel, Elven-Queen');
  const trigger = galadriel.def.triggers[0];
  assert.equal(game.creatures(elven).includes(entered), false);
  assert.equal(trigger.filter(game, galadriel, { player: elven }), true);
});

test('Arbor Elf cilja konkretan tapped Forest umjesto automatskog prvog', async () => {
  let wanted;
  const { game, players: [elven] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' ? [wanted] : defaultDecision(g, q),
  ], 2);
  const arbor = permanent(game, elven, 'Arbor Elf');
  const first = permanent(game, elven, 'Forest', { tapped: true });
  wanted = permanent(game, elven, 'Forest', { tapped: true });
  const ability = arbor.def.abilities[0];
  assert.equal(game.legalTargets(ability.targets[0], arbor, elven).map(card => card.iid).join(','), [first.iid, wanted.iid].join(','));
  await ability.run({ g: game, src: arbor, you: elven, targets: [wanted] });
  assert.equal(first.tapped, true);
  assert.equal(wanted.tapped, false);
});

test('Colossal Whale targetira branioca i vraća ga kada Whale ode', async () => {
  const { game, players: [elven, defender] } = rulesGame([], 2);
  const whale = permanent(game, elven, 'Colossal Whale');
  const victim = permanent(game, defender, 'Elvish Visionary');
  inZone(defender, 'Forest', 'library');
  const trigger = whale.def.triggers[0];
  const data = { card: whale, defender };
  const spec = trigger.targets(game, whale, data)[0];
  assert.equal(game.legalTargets(spec, whale, elven).map(card => card.iid).join(','), String(victim.iid));
  await trigger.run({ g: game, src: whale, you: elven, data, targets: [victim] });
  assert.equal(victim.zone, 'exile');
  await game.move(whale, 'graveyard');
  await resolveAll(game);
  assert.equal(victim.zone, 'battlefield');
  assert.equal(victim.ctrl, defender);
});

test('Cirdan može staviti Auru iz ruke i bira legalan attachment bez targetovanja', async () => {
  let recipient;
  const deciders = [
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'vote') return String(recipient.idx);
      if (q.type === 'chooseCards') return [q.aiHint?.kind === 'auraHost' ? target : q.from[0]];
      return defaultDecision(g, q);
    },
    (g, q) => q.type === 'chooseOption' && q.aiHint?.kind === 'vote' ? String(recipient.idx) : defaultDecision(g, q),
  ];
  const { game, players: [elven, opponent] } = rulesGame(deciders, 2);
  recipient = opponent;
  const cirdan = permanent(game, elven, 'Círdan the Shipwright');
  const target = permanent(game, opponent, 'Elvish Visionary');
  target.cur.shroud = true;
  // The council makes the opponent draw; an empty library would eliminate
  // them and CR 800.4a would take the enchanted Visionary out of the game.
  inZone(opponent, 'Forest', 'library'); inZone(opponent, 'Forest', 'library');
  const lignify = inZone(elven, 'Lignify', 'hand');
  await cirdan.def.triggers[0].run({ g: game, src: cirdan, you: elven });
  assert.equal(lignify.zone, 'battlefield');
  assert.equal(lignify.attachedTo, target.iid);
});

test('Elrond obrađuje svaki Fellowship glas i ukradeno stvorenje ne može napasti vlasnika', async () => {
  let ownerAsked = false;
  const deciders = [
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'vote') return 'fellowship';
      if (q.type === 'chooseCards') { ownerAsked = true; return [q.from[0]]; }
      return defaultDecision(g, q);
    },
    (g, q) => q.type === 'chooseOption' && q.aiHint?.kind === 'vote' ? 'fellowship' : defaultDecision(g, q),
    (g, q) => q.type === 'chooseOption' && q.aiHint?.kind === 'vote' ? 'aid' : defaultDecision(g, q),
  ];
  const { game, players: [elven, owner, other] } = rulesGame(deciders, 3);
  const elrond = permanent(game, elven, 'Elrond of the White Council');
  permanent(game, elven, 'Elvish Mystic');
  const donated = permanent(game, owner, 'Elvish Visionary');
  await elrond.def.triggers[0].run({ g: game, src: elrond, you: elven });
  assert.equal(ownerAsked, true, 'Elrondov kontrolor takođe bira za vlastiti Fellowship glas');
  assert.equal(donated.ctrl, elven);
  assert.equal(game.canAttackTarget(donated, owner), false);
  assert.equal(game.canAttackTarget(donated, other), true);
});

test('Elvish Warmaster okida i kada drugi Elf token uđe', () => {
  const { game, players: [elven] } = rulesGame([], 2);
  const warmaster = permanent(game, elven, 'Elvish Warmaster');
  const token = new MTG.CardInst(MTG.TOKENS.elfWarrior, elven);
  token.ctrl = elven; token.zone = 'battlefield'; token.isToken = true;
  assert.equal(warmaster.def.triggers[0].filter(game, warmaster, { card: token }), true);
});

test('Mirkwood Elk koristi pravi graveyard target i dobija život prema njegovoj snazi', async () => {
  const { game, players: [elven] } = rulesGame([], 2);
  const elk = permanent(game, elven, 'Mirkwood Elk');
  const elf = inZone(elven, 'Elvish Visionary', 'graveyard');
  const nonElf = inZone(elven, 'Radagast, Wizard of Wilds', 'graveyard');
  const trigger = elk.def.triggers[0];
  const legal = game.legalTargets(trigger.targets[0], elk, elven);
  assert.equal(legal.map(card => card.iid).join(','), String(elf.iid));
  const life = elven.life;
  await trigger.run({ g: game, src: elk, you: elven, targets: [elf] });
  assert.equal(elf.zone, 'hand');
  assert.equal(nonElf.zone, 'graveyard');
  assert.equal(elven.life, life + 1);
});

test('Mirkwood Trapper targetira napadača, a za +2/+0 bira napadačev kontrolor', async () => {
  let boosted;
  const { game, players: [elven, attacker, other] } = rulesGame([
    null,
    (g, q) => q.type === 'chooseCards' ? [boosted] : defaultDecision(g, q),
  ], 3);
  const trapper = permanent(game, elven, 'Mirkwood Trapper');
  const atMe = permanent(game, attacker, 'Elvish Visionary'); atMe.attacking = elven;
  const elsewhere = permanent(game, attacker, 'Elvish Mystic'); elsewhere.attacking = other;
  const first = trapper.def.triggers[0];
  const data = { player: attacker, attackers: [atMe, elsewhere] };
  assert.equal(game.legalTargets(first.targets(game, trapper, data)[0], trapper, elven).map(card => card.iid).join(','), [atMe.iid, elsewhere.iid].join(','));
  await first.run({ g: game, src: trapper, you: elven, data, targets: [elsewhere] });
  assert.equal(elsewhere.power, -1);

  atMe.attacking = other; boosted = elsewhere;
  await trapper.def.triggers[1].run({ g: game, src: trapper, you: elven, data });
  assert.equal(elsewhere.power, 1);
});

test('Wood Elves nalazi nonbasic Forest, a Wose Pathfinder ne može ciljati sebe', async () => {
  const { game, players: [elven] } = rulesGame([
    (g, q) => q.type === 'chooseCards' ? [q.from.find(card => card.name === 'Canopy Vista') || q.from[0]] : defaultDecision(g, q),
  ], 2);
  const wood = permanent(game, elven, 'Wood Elves');
  permanent(game, elven, 'Forest');
  permanent(game, elven, 'Forest');
  const nonbasicForest = inZone(elven, 'Canopy Vista', 'library');
  await wood.def.triggers[0].run({ g: game, src: wood, you: elven });
  assert.equal(nonbasicForest.zone, 'battlefield');
  assert.equal(nonbasicForest.tapped, false);

  const wose = permanent(game, elven, 'Wose Pathfinder');
  const legal = game.legalTargets(wose.def.abilities[0].targets[0], wose, elven);
  assert.equal(legal.includes(wose), false);
  assert.equal(legal.includes(wood), true);
});

test('kicked Inscription zaključava jedinstvene modeove i mete pri castu', async () => {
  let buffer, fighter, enemy, opponent;
  const deciders = [
    (g, q) => {
      if (q.type === 'chooseOption' && /Kicker/.test(q.prompt)) return 'yes';
      if (q.type === 'chooseMulti') return ['0', '1', '2'];
      if (q.type === 'chooseTargets') {
        if (/two counters/.test(q.prompt)) return [buffer];
        if (q.spec?.what === 'player') return [opponent];
        if (/Your target/.test(q.prompt)) return [fighter];
        if (/you don't control/.test(q.prompt)) return [enemy];
      }
      return defaultDecision(g, q);
    },
  ];
  const fixture = rulesGame(deciders, 2);
  const { game, players: [elven, victim] } = fixture; opponent = victim;
  buffer = synthetic(game, elven, { name: 'Buffer', power: '1', toughness: '1' });
  fighter = synthetic(game, elven, { name: 'Fighter', power: '3', toughness: '3' });
  enemy = synthetic(game, victim, { name: 'Enemy', power: '3', toughness: '3' });
  synthetic(game, victim, { name: 'Large', power: '4', toughness: '4' });
  const spell = inZone(elven, 'Inscription of Abundance', 'hand');
  elven.pool.G = 2; elven.pool.C = 3;
  const life = victim.life;
  assert.equal(await game.castSpell(elven, spell, { from: 'hand' }), true);
  assert.equal(buffer.counters['+1/+1'], 2);
  assert.equal(victim.life, life + 4);
  assert.equal(fighter.zone, 'graveyard');
  assert.equal(enemy.zone, 'graveyard');
});

test('Windswift Slice pravi tokene samo iz stvarno nanesene excess štete', async () => {
  const { game, players: [elven, opponent] } = rulesGame([], 2);
  const source = synthetic(game, elven, { name: 'Strong Elf', subtypes: ['Elf'], power: '5', toughness: '5' });
  const prevented = synthetic(game, opponent, { name: 'Protected', power: '1', toughness: '2' });
  const spell = inZone(elven, 'Windswift Slice', 'hand');
  game.untilEffects.push({ kind: 'preventToCreature', iid: prevented.iid, expires: 'eot' });
  await spell.def.resolve({ g: game, src: spell, you: elven, targets: [source, prevented] });
  assert.equal(game.creatures(elven).filter(card => card.isToken && card.hasSub('Elf')).length, 0);
  game.untilEffects = [];
  const normal = synthetic(game, opponent, { name: 'Normal', power: '1', toughness: '3' });
  await spell.def.resolve({ g: game, src: spell, you: elven, targets: [source, normal] });
  assert.equal(game.creatures(elven).filter(card => card.isToken && card.hasSub('Elf')).length, 2);
});

test('Devastation Tide Miracle se nudi za prvu kartu i plaća {1}{U}', async () => {
  const { game, players: [elven, opponent] } = rulesGame([], 2);
  game.turnNo = 1;
  const tide = inZone(elven, 'Devastation Tide', 'library');
  const permanentCard = permanent(game, opponent, 'Sol Ring');
  elven.pool.U = 1; elven.pool.C = 1;
  await game.draw(elven, 1);
  await resolveAll(game);
  assert.equal(tide.zone, 'graveyard');
  assert.equal(permanentCard.zone, 'hand');
  assert.equal(elven.pool.U + elven.pool.C, 0);
});

test('Elven Farsight može odbiti reveal, a Genesis Wave poštuje izbor i Aura attachment', async () => {
  let auraTarget;
  const { game, players: [elven, opponent] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'elvenFarsight') return 'no';
      if (q.type === 'chooseCards' && q.aiHint?.kind === 'genesisWave') {
        return q.from.filter(card => ['Elvish Visionary', 'Lignify'].includes(card.name));
      }
      if (q.type === 'chooseCards' && q.aiHint?.kind === 'auraHost') return [auraTarget];
      return defaultDecision(g, q);
    },
  ], 2);
  const farsight = inZone(elven, 'Elven Farsight', 'hand');
  inZone(elven, 'Elvish Visionary', 'library');
  const handBefore = elven.hand.length;
  await farsight.def.resolve({ g: game, src: farsight, you: elven });
  assert.equal(elven.hand.length, handBefore);

  elven.library = [];
  const visionary = inZone(elven, 'Elvish Visionary', 'library');
  const opt = inZone(elven, 'Opt', 'library');
  const lignify = inZone(elven, 'Lignify', 'library');
  const solRing = inZone(elven, 'Sol Ring', 'library');
  auraTarget = permanent(game, opponent, 'Radagast, Wizard of Wilds');
  const wave = inZone(elven, 'Genesis Wave', 'hand');
  await wave.def.resolve({ g: game, src: wave, you: elven, x: 4 });
  assert.equal(visionary.zone, 'battlefield');
  assert.equal(lignify.zone, 'battlefield');
  assert.equal(lignify.attachedTo, auraTarget.iid);
  assert.equal(opt.zone, 'graveyard');
  assert.equal(solRing.zone, 'graveyard', 'legalan permanent koji igrač nije izabrao ide u graveyard');
});

test('Raise the Palisade pita tip, a Seeds of Renewal koristi stvarne graveyard mete', async () => {
  const { game, players: [elven, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseOption' && q.aiHint?.kind === 'creatureType' ? 'Human' : defaultDecision(g, q),
  ], 2);
  const elf = permanent(game, elven, 'Elvish Visionary');
  const human = permanent(game, opponent, 'Wose Pathfinder');
  const palisade = inZone(elven, 'Raise the Palisade', 'hand');
  await palisade.def.resolve({ g: game, src: palisade, you: elven });
  assert.equal(elf.zone, 'hand');
  assert.equal(human.zone, 'battlefield');

  const first = inZone(elven, 'Forest', 'graveyard');
  const second = inZone(elven, 'Island', 'graveyard');
  const ignored = inZone(elven, 'Opt', 'graveyard');
  const seeds = inZone(elven, 'Seeds of Renewal', 'hand');
  await game.move(second, 'exile');
  await seeds.def.resolve({ g: game, src: seeds, you: elven, targets: [[first, second]] });
  assert.equal(first.zone, 'hand');
  assert.equal(second.zone, 'exile');
  assert.equal(ignored.zone, 'graveyard');
});

test('Travel Through Caradhras obavezno vraća kartu za svaki Mines glas', async () => {
  const mins = [];
  const votePrompts = [];
  const voteLabels = [];
  const decider = (g, q) => {
    if (q.type === 'chooseOption' && q.aiHint?.kind === 'vote') {
      votePrompts.push(q.prompt);
      voteLabels.push(q.options.map(option => option.label));
      return 'mines';
    }
    if (q.type === 'chooseCards' && q.prompt === 'Return a card to hand:') { mins.push(q.min); return [q.from[0]]; }
    return defaultDecision(g, q);
  };
  const { game, players: [elven] } = rulesGame([decider, decider], 2);
  inZone(elven, 'Forest', 'graveyard');
  inZone(elven, 'Island', 'graveyard');
  const travel = inZone(elven, 'Travel Through Caradhras', 'hand');
  await travel.def.resolve({ g: game, src: travel, you: elven });
  assert.deepEqual(mins, [1, 1]);
  assert.equal(elven.graveyard.length, 0);
  assert.deepEqual(votePrompts, ['Travel Through Caradhras: vote', 'Travel Through Caradhras: vote']);
  assert.equal(voteLabels.flat().join('|'), [
    '⛰️ Redhorn Pass (lands for you)',
    '⚒️ Mines of Moria (graveyard cards for you)',
    '⛰️ Redhorn Pass (lands for you)',
    '⚒️ Mines of Moria (graveyard cards for you)',
  ].join('|'));
  assert.equal(game.log.every(entry => !/\b(glasa|landovi|groblje)\b/i.test(entry.msg)), true);
});

test('Lothlorien Blade targetira branioca i koristi napadača čak i nakon detachovanja', async () => {
  const { game, players: [elven, defender] } = rulesGame([], 2);
  const blade = permanent(game, elven, 'Lothlórien Blade');
  const attacker = permanent(game, elven, 'Elvish Visionary');
  const target = permanent(game, defender, 'Radagast, Wizard of Wilds');
  blade.attachedTo = attacker.iid; attacker.attachments.push(blade.iid); attacker.attacking = defender;
  const trigger = blade.def.triggers[0];
  const data = { card: attacker, defender };
  assert.equal(game.legalTargets(trigger.targets(game, blade, data)[0], blade, elven).map(card => card.iid).join(','), String(target.iid));
  blade.attachedTo = null; attacker.attachments = [];
  await trigger.run({ g: game, src: blade, you: elven, data, targets: [target] });
  assert.equal(target.damage, attacker.power);
});

test('Model of Unity nudi scry samo kontroloru i protivnicima sa istim glasom', async () => {
  const asked = [], scried = [];
  const deciders = [0, 1, 2].map(index => (g, q) => {
    if (q.type === 'chooseOption' && q.aiHint?.kind === 'mayScry') { asked.push(index); return index === 1 ? 'no' : 'yes'; }
    if (q.type === 'scry') { scried.push(index); return { top: q.cards.slice(), bottom: [] }; }
    return defaultDecision(g, q);
  });
  const { game, players: [elven, same, different] } = rulesGame(deciders, 3);
  const model = permanent(game, elven, 'Model of Unity');
  inZone(elven, 'Forest', 'library'); inZone(same, 'Island', 'library'); inZone(different, 'Forest', 'library');
  const votes = new Map([['A', 2], ['B', 1]]);
  votes['_by_' + elven.idx] = 'A'; votes['_by_' + same.idx] = 'A'; votes['_by_' + different.idx] = 'B';
  await model.def.triggers[0].run({ g: game, src: model, you: elven, data: { votes } });
  assert.deepEqual(asked, [0, 1]);
  assert.deepEqual(scried, [0]);
});

test('Asceticism smije regenerisati bilo koje target stvorenje', () => {
  const { game, players: [elven, opponent] } = rulesGame([], 2);
  const asceticism = permanent(game, elven, 'Asceticism');
  const enemy = permanent(game, opponent, 'Elvish Visionary');
  const legal = game.legalTargets(asceticism.def.abilities[0].targets[0], asceticism, elven);
  assert.equal(legal.includes(enemy), true);
});

test('Vineglimmer Snarl poštuje reveal odluku, a Lorien Revealed bira Island kartu', async () => {
  const first = rulesGame([
    (g, q) => q.type === 'chooseCards' && q.aiHint?.kind === 'revealLand' ? [] : defaultDecision(g, q),
  ], 2);
  const forest = inZone(first.players[0], 'Forest', 'hand');
  const tappedSnarl = inZone(first.players[0], 'Vineglimmer Snarl', 'hand');
  await first.game.move(tappedSnarl, 'battlefield', { ctrl: first.players[0] });
  assert.equal(tappedSnarl.tapped, true);
  assert.equal(forest.zone, 'hand');

  let wanted;
  const second = rulesGame([
    (g, q) => q.type === 'chooseCards' ? [wanted || q.from[0]] : defaultDecision(g, q),
  ], 2);
  inZone(second.players[0], 'Forest', 'hand');
  const untappedSnarl = inZone(second.players[0], 'Vineglimmer Snarl', 'hand');
  await second.game.move(untappedSnarl, 'battlefield', { ctrl: second.players[0] });
  assert.equal(untappedSnarl.tapped, false);

  inZone(second.players[0], 'Island', 'library');
  wanted = inZone(second.players[0], 'Prairie Stream', 'library');
  const lorien = inZone(second.players[0], 'Lórien Revealed', 'hand');
  await lorien.def.cycling.effect({ g: second.game, src: lorien, you: second.players[0] });
  assert.equal(wanted.zone, 'hand');
});

test('Exotic Orchard kopira stvarne Command Tower boje, ne svih pet', () => {
  const { game, players: [elven, opponent] } = rulesGame([], 2);
  opponent.colorIdentity = ['G', 'U'];
  const orchard = permanent(game, elven, 'Exotic Orchard');
  permanent(game, opponent, 'Command Tower');
  const options = orchard.def.mana.produce(game, orchard, elven);
  assert.equal(options.map(option => Object.keys(option)[0]).sort().join(','), 'G,U');
});

test('Elven AI bira Radagast Bird protiv flying pritiska i ne otkriva loš Farsight vrh', async () => {
  const { game, players: [human, bot] } = rulesGame([], 2);
  const radagast = permanent(game, bot, 'Radagast, Wizard of Wilds');
  const flyer = permanent(game, human, 'Hornet Queen');
  const tokenChoice = {
    type: 'chooseOption', prompt: 'Radagast',
    options: [{ key: 'beast', label: '3/3 Beast' }, { key: 'bird', label: '2/2 Bird flying' }],
    aiHint: { kind: 'radagastToken', source: radagast },
  };
  const bird = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 81427, actionWindow: tokenChoice });
  assert.equal(MTG.unwrapBotDecisionAction(bird.action), 'bird');
  await game.move(flyer, 'graveyard');
  const beast = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 81428, actionWindow: tokenChoice });
  assert.equal(MTG.unwrapBotDecisionAction(beast.action), 'beast');

  const noncreature = inZone(bot, 'Sol Ring', 'library');
  const revealChoice = {
    type: 'chooseOption', prompt: 'Elven Farsight',
    options: [{ key: 'yes', label: 'Reveal' }, { key: 'no', label: 'No' }],
    aiHint: { kind: 'elvenFarsight', card: noncreature },
  };
  const noReveal = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 81429, actionWindow: revealChoice });
  assert.equal(MTG.unwrapBotDecisionAction(noReveal.action), 'no');
});

test('Elven Council završava pune partije kao prvi deck i kao AI protivnik bez fallbacka', { timeout: 60_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Elven Council', aiDecks: ['Doom Prevails', 'Turtle Power', 'Coven Counters'], seed: 81430 },
    { humanDeck: 'Doom Prevails', aiDecks: ['Elven Council', 'Turtle Power', 'Coven Counters'], seed: 81431 },
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
    const elvenLogs = (game.aiDecisionLog || []).filter(entry => entry.playerName &&
      game.players.some(player => player.name === entry.playerName && player.deckName === 'Elven Council'));
    assert.equal(elvenLogs.some(entry => entry.fallback), false);
  }
});
