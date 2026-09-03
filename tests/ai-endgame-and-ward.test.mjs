import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function table({ paced = true, seed = 5 } = {}) {
  const game = new MTG.Game({ seed, paced, maxTurns: 100 });
  game.speedFactor = 0;
  const controllers = [0, 1].map(() => ({ decide: async () => null }));
  const players = [0, 1].map(index => game.addPlayer(index ? 'Rival' : 'Bot',
    { name: index ? 'Rival deck' : 'Quick Draw' }, controllers[index], index === 0));
  game.turnPlayer = players[0];
  game.turnNo = 14;
  game.phase = 'main1';
  game.step = 'main';
  const [bot, rival] = players;
  const permanent = (player, name) => {
    const card = new MTG.CardInst(MTG.DEFS[name], player);
    card.ctrl = player;
    card.zone = 'battlefield';
    card.sick = false;
    game.battlefield.push(card);
    return card;
  };
  const zoneCard = (player, name, zone) => {
    const card = new MTG.CardInst(MTG.DEFS[name], player);
    card.zone = zone;
    player[zone].push(card);
    return card;
  };
  for (let index = 0; index < 40; index++) {
    zoneCard(bot, 'Island', 'library');
    zoneCard(rival, 'Island', 'library');
  }
  return { game, bot, rival, permanent, zoneCard };
}

async function attackDecision(game, bot, rival) {
  game.phase = 'combat';
  game.step = 'attackers';
  const eligible = game.creatures(bot).filter(card => !card.tapped && !card.sick &&
    !card.cur.cantAttack && game.canAttackAtAll(card));
  const decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, difficulty: 'normal',
    actionWindow: { type: 'attackers', eligible, opponents: [rival], attackTargets: [rival], forced: [] },
  });
  return { eligible, assignments: decision.action.assignments || [] };
}

test('bot ne šalje cijelu tablu na protivnika kojem treba par štete', async () => {
  const { game, bot, rival, permanent } = table();
  for (let index = 0; index < 10; index++) permanent(bot, 'Grizzly Bears');
  rival.life = 3;
  game.recalc();
  const { eligible, assignments } = await attackDecision(game, bot, rival);
  assert.equal(eligible.length, 10);
  const power = assignments.reduce((sum, item) => sum + item.card.power, 0);
  assert.ok(assignments.length < eligible.length,
    `overkill: napadaju svi (${assignments.length}/${eligible.length})`);
  assert.ok(power >= rival.life, `napad mora ostati smrtonosan (${power} vs ${rival.life})`);
  assert.ok(power <= rival.life * 3,
    `napad na ${rival.life} života ne smije nositi ${power} štete`);
});

test('bot i dalje napada punom snagom kad protivnik nije na potezu smrti', async () => {
  const { game, bot, rival, permanent } = table();
  for (let index = 0; index < 6; index++) permanent(bot, 'Grizzly Bears');
  rival.life = 40;
  game.recalc();
  const { eligible, assignments } = await attackDecision(game, bot, rival);
  assert.equal(assignments.length, eligible.length,
    'bez smrtonosnog praga svaki napadač i dalje vrijedi');
});

test('siguran smrtonosni napad zatvara main fazu umjesto novih value poteza', async () => {
  const { game, bot, rival, permanent, zoneCard } = table();
  for (let index = 0; index < 9; index++) permanent(bot, 'Island');
  for (let index = 0; index < 10; index++) permanent(bot, 'Grizzly Bears');
  rival.life = 3;
  zoneCard(bot, 'Rite of Replication', 'hand');
  game.recalc();
  assert.ok(MTG.botLethalAttackReady(game, bot), 'fixture mora imati smrtonosan napad');
  const decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, difficulty: 'normal',
    actionWindow: {
      type: 'main', player: bot, casts: game.castableList(bot),
      acts: game.activatableList(bot), lands: game.playableLands(bot), phase: 'main1',
    },
  });
  assert.equal(decision.action.kind, 'done',
    `bot je odabrao ${MTG.botActionKey(decision.action)} umjesto odlaska u borbu`);
});

test('pravilo o zatvaranju main faze ne dira headless partije', () => {
  const { game, bot, rival, permanent } = table({ paced: false });
  for (let index = 0; index < 10; index++) permanent(bot, 'Grizzly Bears');
  rival.life = 3;
  game.recalc();
  assert.equal(MTG.botLethalAttackReady(game, bot), null);
});

test('bot ne cilja ward metu koju ne može platiti, ali je cilja kad ima manu', async () => {
  const { game, bot, rival, permanent, zoneCard } = table();
  for (let index = 0; index < 2; index++) permanent(bot, 'Mountain');
  const warded = permanent(rival, 'Grizzly Bears');
  const plain = permanent(rival, 'Grizzly Bears');
  const boots = permanent(rival, 'Winged Boots');
  boots.attachedTo = warded.iid;
  warded.attachments.push(boots.iid);
  const bolt = zoneCard(bot, 'Lightning Bolt', 'hand');
  game.recalc();
  assert.equal(warded.cur.wardCost && warded.cur.wardCost.mana, '{4}');
  assert.equal(plain.cur.wardCost, null);

  const window = {
    type: 'chooseTargets', src: bolt, so: { kind: 'spell', card: bolt },
    candidates: [warded, plain, rival], min: 1, max: 1,
    prompt: 'Damage target', aiHint: { goal: 'damage', amount: 3 },
  };
  const poor = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, difficulty: 'normal', actionWindow: window,
  });
  assert.ok(!poor.action.picks.includes(warded),
    'sa dvije mane bot ne smije birati metu sa Ward {4}');

  for (let index = 0; index < 8; index++) permanent(bot, 'Mountain');
  game.recalc();
  const rich = MTG.botWardTargetAdjustment(game, bot, warded, window);
  assert.ok(rich > -1000, 'sa dovoljno mane ward postaje samo cijena, ne zabrana');
  assert.ok(rich < 0, 'ward i dalje mora imati cijenu');
});

test('modalni wipe se bira po tabli, ne po redoslijedu modova', async () => {
  const { game, bot, rival, permanent } = table();
  for (let index = 0; index < 4; index++) permanent(rival, 'Sol Ring');
  game.recalc();
  const modes = MTG.DEFS['Austere Command'].modes.list;
  const artifacts = modes.find(mode => /artifacts/i.test(mode.label));
  const creatures = modes.find(mode => /creatures mv≤3/i.test(mode.label));
  assert.ok(MTG.botModeSweepValue(game, bot, artifacts) > MTG.botModeSweepValue(game, bot, creatures),
    'mod koji zaista čisti protivničku tablu mora biti vrjedniji od praznog');
  assert.equal(MTG.botModeSweepValue(game, bot, creatures), 0);

  const options = modes.map((mode, index) => Object.assign({ key: String(index), label: mode.label }, mode.aiMeta || {}));
  const decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, difficulty: 'normal',
    actionWindow: {
      type: 'chooseMulti', prompt: 'Austere Command', options, min: 2, max: 2,
      aiHint: { kind: 'modes' },
    },
  });
  assert.ok((decision.action.options || []).some(option => /artifacts/i.test(option.label)),
    'izbor mora sadržavati mod koji pogađa protivničke artefakte');
});

test('priority prozor ne prolazi tiho kad sposobnost sa table cilja stack', () => {
  const { game, bot, rival, permanent, zoneCard } = table();
  const stella = permanent(bot, 'Stella Lee, Wild Card');
  stella.commander = true;
  for (let index = 0; index < 6; index++) permanent(bot, 'Island');
  const bolt = zoneCard(bot, 'Lightning Bolt', 'hand');
  bot.turnState.spellsCast = 3;
  game.recalc();
  game.stack.push({ kind: 'spell', name: 'Lightning Bolt', card: bolt, ctrl: bot, targets: [rival] });
  const acts = game.activatableList(bot, true).filter(entry => entry.card === stella);
  assert.equal(acts.length, 1, 'Stella mora biti aktivabilna dok njen spell stoji na stacku');
  const window = { type: 'priority', player: bot, casts: [], acts, stack: game.stack, phase: 'main1' };
  assert.equal(MTG.priorityRespondsToStack(window, game, bot), true);
  assert.equal(MTG.autoPassPolicy('end', game, window, bot), false,
    'automatski pass bi učinio Stellinu sposobnost nedostupnom');
  game.stack.length = 0;
});

test('AI pretraga skalira budžet čvorova prema veličini table', () => {
  const { game, bot, permanent } = table();
  const small = MTG.aiSimulationWorkload(game);
  for (let index = 0; index < 200; index++) permanent(bot, 'Grizzly Bears');
  game.recalc();
  const large = MTG.aiSimulationWorkload(game);
  assert.ok(large > small * 3, 'mjera opterećenja mora rasti sa tablom');
});

test('deck bez ručno napisane teme uzima temu od komandera, ne od slučajnih brojeva', () => {
  // An imported list has no hand-written theme. Reading its synergies off raw
  // card counts surfaces whatever is incidentally common; the commander is the
  // thesis of a Commander deck, so its own tags must carry.
  const built = Object.keys(MTG.DECKS).filter(name => !MTG.DECKS[name].custom);
  const source = built.find(name => MTG.AI_DECK_PROFILE_HINTS[name]) || built[0];
  const deck = MTG.DECKS[source];
  const lines = ['Commander', `1 ${deck.commander}`, '', 'Deck'];
  for (const entry of deck.cards) if (entry.name !== deck.commander) lines.push(`${entry.n} ${entry.name}`);
  const imported = MTG.importCommanderDeck(lines.join('\n'),
    { name: 'Profile Probe Deck', register: true, replace: true });
  assert.ok(imported, 'the control deck must import');

  const commanderTags = MTG.inferCardSemantics(MTG.DEFS[deck.commander]).synergyTags || [];
  assert.ok(commanderTags.length, 'this fixture needs a commander with synergy tags');
  const profile = MTG.getDeckAIProfile('Profile Probe Deck');
  assert.ok(commanderTags.some(tag => profile.primarySynergies.includes(tag)),
    `imported profile ${profile.primarySynergies.join(',')} ignores the commander's own theme ${commanderTags.join(',')}`);

  // a deck that does have a hand-written theme keeps exactly that theme
  const hinted = MTG.getDeckAIProfile(source);
  for (const tag of MTG.AI_DECK_PROFILE_HINTS[source].tags || []) {
    assert.ok(hinted.primarySynergies.includes(tag), `${source} must keep its written theme ${tag}`);
  }
});
