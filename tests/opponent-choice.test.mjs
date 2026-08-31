import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function choiceFixture() {
  const game = new MTG.Game({ seed: 404, paced: false, maxTurns: 20 });
  const players = ['Ti', 'Bot A', 'Bot B', 'Bot C'].map((name, index) =>
    game.addPlayer(name, { name: `${name} deck` }, null, index !== 0));
  game.turnPlayer = players[0];
  return { game, players };
}

function scriptedController(handler) {
  return { decide: async (game, question) => handler(question, game) };
}

function card(owner, name) {
  const instance = new MTG.CardInst(MTG.DEFS[name], owner);
  instance.ctrl = owner;
  return instance;
}

function allTargetSpecs(script) {
  return [
    ...(script.targets || []),
    ...(script.abilities || []).flatMap(ability => ability.targets || []),
    ...(script.triggers || []).flatMap(trigger => trigger.targets || []),
    ...(script.modes && script.modes.list || []).flatMap(mode => mode.targets || []),
    ...Object.values(script.splitHalves || {}).flatMap(half => allTargetSpecs(half)),
    ...(script.adventure ? allTargetSpecs(script.adventure) : []),
    ...(script.gyAbility ? allTargetSpecs(script.gyAbility) : []),
    ...(script.handAbility ? allTargetSpecs(script.handAbility) : []),
    ...(script.saga || []).flatMap(chapter => allTargetSpecs(chapter)),
  ];
}

test('centralni netargetirani izbor prikazuje svakog živog protivnika i poštuje ljudski izbor', async () => {
  const { game, players: [human, botA, botB, botC] } = choiceFixture();
  let seen = null;
  human.controller = scriptedController(question => {
    seen = question;
    return String(botC.idx);
  });
  botA.controller = botB.controller = botC.controller = scriptedController(() => null);

  const chosen = await MTG.E.chooseOpponent(game, human, { prompt: 'Izaberi protivnika' });

  assert.equal(chosen, botC);
  assert.equal(seen.type, 'chooseOption');
  assert.deepEqual([...seen.options].map(option => option.label), ['Bot A', 'Bot B', 'Bot C']);
  assert.deepEqual([...seen.options].map(option => option.player), [botA, botB, botC]);
});

test('svaki aktivni oracle target-opponent put ima stvarni target spec', () => {
  const targetOpponentCards = Object.values(MTG.DEFS)
    .filter(def => /target opponents?\b/i.test(def.oracle || ''));
  const intentionalRandom = new Set(['Vial Smasher the Fierce']);

  for (const def of targetOpponentCards) {
    if (intentionalRandom.has(def.name)) continue;
    const specs = allTargetSpecs(MTG.SCRIPTS[def.name] || {});
    assert.ok(
      specs.some(spec => spec.what === 'opponent' || spec.what === 'player' || spec.what === 'any'),
      `${def.name}: tekst traži target opponent, ali skripta nema player/opponent target`,
    );
  }
});

test('Blood Artist i Falkenrath Noble daju kontroloru izbor target playera', () => {
  for (const name of ['Blood Artist', 'Falkenrath Noble']) {
    const trigger = MTG.SCRIPTS[name].triggers[0];
    assert.equal(trigger.targets.length, 1, `${name}: nedostaje target`);
    assert.equal(trigger.targets[0].what, 'player', `${name}: mora moći ciljati bilo kojeg igrača`);
  }
});

test('Sylvan Offering pita odvojeno za Treefolk i Elf primaoca', async () => {
  const { game, players: [human, botA, botB, botC] } = choiceFixture();
  const prompts = [];
  human.controller = scriptedController(question => {
    prompts.push(question.prompt);
    return question.prompt.includes('Treefolk') ? String(botB.idx) : String(botC.idx);
  });
  for (const opponent of [botA, botB, botC]) opponent.controller = scriptedController(() => null);
  const made = [];
  game.makeTokens = async (definition, owner, options = {}) => { made.push({ definition, owner, options }); return []; };

  await MTG.SCRIPTS['Sylvan Offering'].resolve({ g: game, you: human, x: 3 });

  assert.equal(prompts.length, 2);
  assert.ok(prompts[0].includes('Treefolk'));
  assert.ok(prompts[1].includes('Elf'));
  assert.equal(made[1].owner, botB);
  assert.equal(made[3].owner, botC);
  assert.equal(made[3].options.n, 3);
});

test('Demonstrate kopiju daje baš izabranom protivniku', async () => {
  const { game, players: [human, botA, botB, botC] } = choiceFixture();
  human.controller = scriptedController(question =>
    question.aiHint && question.aiHint.kind === 'chooseOpponent' ? String(botC.idx) : 'yes');
  for (const opponent of [botA, botB, botC]) opponent.controller = scriptedController(() => 'no');
  const copiedFor = [];
  game.copySpell = async (spell, controller) => { copiedFor.push(controller); return {}; };

  await game.applyDemonstrate(human, { targets: [] }, { name: 'Creative Technique' });

  assert.deepEqual(copiedFor, [human, botC]);
});

test('Abstract Performance prvo bira protivnika, a taj protivnik bira hrpu bez uvida u face-down karte', async () => {
  const { game, players: [human, botA, botB, botC] } = choiceFixture();
  const hidden = Array.from({ length: 4 }, () => card(human, 'Swamp'));
  const faceUp = Array.from({ length: 4 }, () => card(human, 'Island'));
  human.library.push(...faceUp, ...hidden);
  for (const c of human.library) c.zone = 'library';
  let pileQuestion = null;
  human.controller = scriptedController(question => {
    if (question.aiHint && question.aiHint.kind === 'chooseOpponent') return String(botB.idx);
    return [];
  });
  botB.controller = scriptedController(question => { pileQuestion = question; return 'down'; });
  botA.controller = botC.controller = scriptedController(() => null);

  await MTG.SCRIPTS['Abstract Performance'].resolve({ g: game, you: human });

  assert.equal(pileQuestion.aiHint.kind, 'abstractPile');
  assert.equal('pileA' in pileQuestion.aiHint, false);
  const hiddenOption = pileQuestion.options.find(option => option.key === 'down');
  const faceUpOption = pileQuestion.options.find(option => option.key === 'up');
  assert.ok(hiddenOption.label.includes('skrivenih'));
  assert.equal(hiddenOption.hiddenCount, 4);
  assert.equal('cards' in hiddenOption, false, 'face-down pile must not expose its identities through UI metadata');
  assert.deepEqual([...faceUpOption.cards].map(c => c.name), ['Island', 'Island', 'Island', 'Island']);
  assert.deepEqual([...human.graveyard].map(c => c.name), ['Swamp', 'Swamp', 'Swamp', 'Swamp']);
  assert.deepEqual([...human.hand].map(c => c.name), ['Island', 'Island', 'Island', 'Island']);
});

test('Plargg and Nassari dozvoljava izabranom protivniku da skloni konkretnu kartu', async () => {
  const { game, players: [human, botA, botB, botC] } = choiceFixture();
  const revealed = [
    card(human, 'Sol Ring'), card(botA, 'Arcane Signet'), card(botB, 'Blasphemous Act'), card(botC, 'Cultivate'),
  ];
  for (let index = 0; index < revealed.length; index++) {
    revealed[index].zone = 'library';
    game.players[index].library.push(revealed[index]);
  }
  human.controller = scriptedController(question => {
    if (question.aiHint && question.aiHint.kind === 'chooseOpponent') return String(botC.idx);
    if (question.aiHint && question.aiHint.kind === 'castFreeUpTo') return [];
    return null;
  });
  botC.controller = scriptedController(question => question.aiHint && question.aiHint.kind === 'denyCast' ? [revealed[2]] : null);
  botA.controller = botB.controller = scriptedController(() => null);

  await MTG.SCRIPTS['Plargg and Nassari'].triggers[0].run({ g: game, you: human });

  assert.ok(game.log.some(entry => entry.msg.includes('Bot C') && entry.msg.includes('Blasphemous Act')));
  assert.equal(revealed[2].zone, 'exile');
});

test('Clash koristi izabranog protivnika i oba igrača biraju vrh ili dno', async () => {
  const { game, players: [human, botA, botB, botC] } = choiceFixture();
  const mine = card(human, 'Cultivate');
  const high = card(botA, 'Blasphemous Act');
  const low = card(botB, 'Sol Ring');
  for (const [owner, top] of [[human, mine], [botA, high], [botB, low]]) { top.zone = 'library'; owner.library.push(top); }
  const placementPrompts = [];
  const placementCards = [];
  human.controller = scriptedController(question => {
    if (question.aiHint && question.aiHint.kind === 'chooseOpponent') return String(botB.idx);
    if (question.aiHint && question.aiHint.kind === 'clashPlace') {
      placementPrompts.push(question.prompt); placementCards.push(question.card); return 'top';
    }
    return null;
  });
  botB.controller = scriptedController(question => { placementPrompts.push(question.prompt); return 'bottom'; });
  botA.controller = botC.controller = scriptedController(() => null);

  const won = await MTG.E7.clash(game, human);

  assert.equal(won, true, 'Cultivate pobjeđuje izabranog Sol Ring protivnika, ne prvog Blasphemous Act protivnika');
  assert.equal(placementPrompts.length, 2);
  assert.equal(placementCards[0], mine, 'Clash decision carries the revealed card for central visual rendering');
  assert.equal(botB.library[0], low);
});

test('Discover odluka nosi poznatu egziliranu kartu za centralni vizuelni prikaz', async () => {
  const { game, players: [human] } = choiceFixture();
  const hit = card(human, 'Night\'s Whisper');
  hit.zone = 'library'; human.library.push(hit);
  let question = null;
  human.controller = scriptedController(q => { question = q; return 'hand'; });

  await MTG.E7.discover(game, human, 2);

  assert.equal(question.aiHint.kind, 'freeCastOrHand');
  assert.equal(question.card, hit);
  assert.equal(hit.zone, 'hand');
});

test('AI V2 generator poštuje repeatable mode izbore', () => {
  const { game, players: [bot] } = choiceFixture();
  bot.isAI = true;
  const question = {
    type: 'chooseMulti', player: bot, min: 3, max: 3, repeats: true,
    options: [0, 1, 2, 3].map(value => ({ key: String(value), label: `Mode ${value}` })),
  };
  const view = MTG.createBotPlayerView(game, bot.idx, question);
  const actions = MTG.generateLegalActions(view);
  assert.ok(actions.some(action => action.value.join(',') === '3,3,3'));
});

test('AI V2 poklon daje slabijem protivniku, a neprijateljski izbor usmjerava na prijetnju', async () => {
  const { game, players: [bot, threat, weakA, weakB] } = choiceFixture();
  bot.isAI = true;
  for (let i = 0; i < 3; i++) {
    const creature = card(threat, 'Brash Taunter');
    creature.zone = 'battlefield'; creature.sick = false;
    game.battlefield.push(creature);
  }
  game.recalc();
  const options = [threat, weakA, weakB].map(player => ({ key: String(player.idx), label: player.name, player }));
  const decide = goal => MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 919,
    actionWindow: { type: 'chooseOption', player: bot, options, aiHint: { kind: 'chooseOpponent', goal } },
  });

  const gift = await decide('gift');
  const hostile = await decide('threat');

  assert.notEqual(gift.action.option.player, threat);
  assert.equal(hostile.action.option.player, threat);
});
