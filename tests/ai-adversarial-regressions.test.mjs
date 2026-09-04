import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { aiIsolationFingerprint } from './helpers/run-ai-adversarial-games.mjs';

const MTG = loadEngine();
function fixture(seed = 920000) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 40 });
  const players = ['Deep Clue Sea', 'Quick Draw'].map((deck, index) => {
    const player = game.addPlayer(`AI ${index}`, MTG.DECKS[deck], null, true);
    player.deckName = deck;
    player.controller = new MTG.AIController(player, { difficulty: 'normal' });
    return player;
  });
  game.turnPlayer = players[0]; game.turnNo = 12; game.phase = 'main1'; game.step = 'main';
  return { game, players };
}
function add(game, player, name, zone = 'battlefield') {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone; card.ctrl = player; card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
  return card;
}

for (const legacy of [false, true]) for (const name of ['Whirler Rogue', 'Shimmer Dragon']) {
  test(`${legacy ? 'fallback' : 'local AI'} pays exactly two artifacts for ${name}`, async () => {
    const { game, players: [bot] } = fixture();
    const source = add(game, bot, name);
    const artifacts = [add(game, bot, 'Sol Ring'), add(game, bot, 'Arcane Signet')];
    const creature = name === 'Whirler Rogue' ? source : null;
    const draw = add(game, bot, 'Forest', 'library');
    game.recalc();
    const choices = [];
    const decide = bot.controller.decide;
    bot.controller.decide = async function (state, query) {
      const answer = legacy && query.type === 'chooseCards'
        ? this.chooseCards(state, query) : await decide.call(this, state, query);
      if (query.type === 'chooseCards') choices.push({ query, answer });
      return answer;
    };
    const entry = game.activatableList(bot).find(row => row.card === source && row.ability?.cost.tapArtifacts === 2);
    assert.ok(entry, 'real rules engine advertises the activation');
    assert.equal(await game.activateAbility(bot, entry, creature ? [creature] : undefined), true);
    assert.equal(choices.length, 1);
    assert.equal(choices[0].answer.length, 2);
    assert.equal(new Set(choices[0].answer).size, 2);
    assert.ok(artifacts.every(card => card.tapped));
    for (let i = 0; i < 10 && (game.pendingTriggers.length || game.stack.length); i++) {
      await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
    }
    if (creature) assert.equal(creature.cur.unblockable, true);
    else assert.ok(bot.hand.includes(draw));
    assert.equal(game.activatableList(bot).some(row => row.card === source), false, 'spent artifacts cannot fund another activation');
  });
}

test('beam search cannot value a draw spell using the real unknown library order', async () => {
  const { game, players: [bot, opponent] } = fixture();
  for (let i = 0; i < 4; i++) add(game, bot, 'Island');
  add(game, bot, 'Reach Through Mists', 'hand'); add(game, bot, 'Sol Ring', 'hand');
  for (let i = 0; i < 12; i++) add(game, bot, i < 6 ? 'Island' : 'Sol Ring', 'library');
  for (let i = 0; i < 12; i++) add(game, opponent, 'Forest', 'library');
  game.recalc();
  const decide = async () => {
    const before = aiIsolationFingerprint(game), clock = MTG.currentOracleTimestamp();
    const result = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 42,
      actionWindow: { type: 'main', player: bot, casts: game.castableList(bot), acts: [], lands: [], phase: game.phase },
      forceSearch: true, budgetMs: 0 });
    assert.equal(aiIsolationFingerprint(game), before, 'planning preserves all live cards, resources and effects');
    assert.equal(MTG.currentOracleTimestamp(), clock);
    assert.ok(result.log.analyzedNodes > 1, 'real recursive search ran');
    return { chosen: MTG.botActionKey(result.action), score: result.score,
      considered: result.consideredActions.map(row => [row.action, row.score]) };
  };
  const publicBefore = MTG.hashBotPlayerView(MTG.createBotPlayerView(game, bot.idx));
  const first = await decide();
  bot.library.reverse();
  assert.equal(MTG.hashBotPlayerView(MTG.createBotPlayerView(game, bot.idx)), publicBefore);
  assert.deepEqual(await decide(), first, 'the same information and seed must yield identical search values');
});

test('local AI ends a legal repeating Kodama/bounce-land/Treasure sequence', { timeout: 10000 }, async () => {
  const { game, players: [bot] } = fixture();
  add(game, bot, 'Kodama of the East Tree'); add(game, bot, 'Tireless Provisioner');
  const land = add(game, bot, 'Gruul Turf', 'hand');
  game.recalc();
  assert.equal(await game.playLand(bot, land), true);
  for (let i = 0; i < 500 && (game.pendingTriggers.length || game.stack.length); i++) {
    await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.pendingTriggers.length + game.stack.length, 0, 'the real optional sequence yields priority and finishes');
  const treasures = game.battlefield.filter(card => card.ctrl === bot && card.hasSub('Treasure'));
  assert.ok(treasures.length >= 3, 'AI actually used the repeatable resource combo');
  assert.ok(treasures.length < 100, 'AI stops the indefinite resource loop');
  assert.ok(['hand','battlefield'].includes(land.zone));
});

test('beam search hides opponent hand/library allocation while preserving revealed cards', async () => {
  const { game, players: [bot, opponent] } = fixture();
  for (let i = 0; i < 4; i++) add(game, bot, 'Island');
  add(game, bot, 'Windfall', 'hand'); add(game, bot, 'Sol Ring', 'hand');
  for (let i = 0; i < 12; i++) add(game, bot, 'Island', 'library');
  const hidden = add(game, opponent, 'Sol Ring', 'hand');
  const visible = add(game, opponent, 'Arcane Signet', 'hand'); visible.meta.revealedTo = [bot.idx];
  for (let i = 0; i < 12; i++) add(game, opponent, 'Forest', 'library');
  game.recalc();
  const decide = async () => {
    const result = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 811,
      actionWindow: { type: 'main', player: bot, casts: game.castableList(bot), acts: [], lands: [], phase: game.phase },
      forceSearch: true, budgetMs: 0 });
    return result.consideredActions.map(row => [row.action, row.score]);
  };
  const first = await decide();
  const replacement = opponent.library[0];
  opponent.hand[0] = replacement; replacement.zone = 'hand'; opponent.library[0] = hidden; hidden.zone = 'library';
  assert.deepEqual(await decide(), first);
  const land = add(game, bot, 'Island', 'hand');
  const snapshot = aiIsolationFingerprint(game);
  const simulation = await MTG.simulateAction(game, { kind:'land',card:land }, { playerId:bot.idx, seed:13,
    searchInformation:{observerId:bot.idx,seed:13,knownCardIds:[]} });
  assert.equal(simulation.state.byIid(visible.iid).zone, 'hand');
  assert.ok(simulation.state.players[opponent.idx].hand.some(card => card.iid === visible.iid));
  assert.equal(aiIsolationFingerprint(game), snapshot);
});

for (const markedDamage of [0, 2]) test(`local AI uses Diminish's actual base-P/T change${markedDamage ? ' to kill through marked damage' : ''}`, async () => {
  const { game, players: [bot, opponent] } = fixture();
  const own = add(game, bot, 'Runeclaw Bear');
  const counters = add(game, opponent, 'Runeclaw Bear');
  const largeBase = add(game, opponent, 'Colossal Dreadmaw');
  counters.counters['+1/+1'] = 5; largeBase.damage = markedDamage;
  const spell = add(game, bot, 'Diminish', 'hand'); bot.pool.U = 1; game.recalc();
  const selected = [];
  const decide = bot.controller.decide;
  bot.controller.decide = async function (state, query) {
    const answer = await decide.call(this, state, query);
    if (query.type === 'chooseTargets') selected.push(...answer);
    return answer;
  };
  assert.equal(await game.castSpell(bot, spell, {from:'hand'}), true);
  for (let i = 0; i < 20 && (game.pendingTriggers.length || game.stack.length); i++) {
    await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
  }
  assert.deepEqual(selected, [largeBase], 'the 6/6 base shrinks more than a 2/2 carrying five counters');
  assert.equal(counters.power, 7); assert.equal(own.power, 2);
  if (markedDamage) assert.equal(largeBase.zone, 'graveyard');
  else { assert.equal(largeBase.power, 1); assert.equal(largeBase.toughness, 1); }
});

test('Olivia cannot offer an activation whose two Treasures are also its only mana', async () => {
  const {game,players:[bot]} = fixture();
  const olivia = add(game,bot,'Olivia, Opulent Outlaw');
  await game.makeTokens('treasure',bot,{n:2}); game.recalc();
  assert.equal(game.activatableList(bot).some(entry=>entry.card===olivia),false);
  for(let i=0;i<3;i++)add(game,bot,'Forest');game.recalc();
  const entry=game.activatableList(bot).find(entry=>entry.card===olivia);assert.ok(entry);
  assert.equal(await game.activateAbility(bot,entry),true);
  for(let i=0;i<20&&(game.stack.length||game.pendingTriggers.length);i++){
    await game.flushTriggers();if(game.stack.length)await game.resolveTop();
  }
  assert.equal(game.battlefield.filter(card=>card.hasSub('Treasure')).length,0);
  assert.equal(olivia.counters['+1/+1'],2);
});

for(const legacy of [false,true])test(`${legacy?'fallback':'local AI'} keeps its sole green mana source out of Ravenous Squirrel's sacrifice payment`,async()=>{
  const {game,players:[bot]}=fixture();
  const squirrel=add(game,bot,'Ravenous Squirrel');
  const fodder=add(game,bot,'Runeclaw Bear');
  add(game,bot,'Swamp');add(game,bot,'Swamp');await game.makeTokens('treasure',bot);
  const treasure=game.battlefield.find(card=>card.hasSub('Treasure'));
  const draw=add(game,bot,'Forest','library');game.recalc();
  const choices=[],decide=bot.controller.decide;
  bot.controller.decide=async function(state,query){
    const answer=legacy&&query.type==='chooseCards'?this.chooseCards(state,query):await decide.call(this,state,query);
    if(query.aiHint?.kind==='sacCost')choices.push(answer);return answer;
  };
  const entry=game.activatableList(bot).find(entry=>entry.card===squirrel);assert.ok(entry);
  assert.equal(await game.activateAbility(bot,entry),true);
  for(let i=0;i<20&&(game.stack.length||game.pendingTriggers.length);i++){
    await game.flushTriggers();if(game.stack.length)await game.resolveTop();
  }
  assert.equal(choices.length,1);assert.equal(choices[0].includes(treasure),false,'Treasure must produce green mana');
  assert.ok(choices[0][0]===fodder||choices[0][0]===squirrel);
  assert.ok(bot.hand.includes(draw));assert.equal(bot.pool.G||0,0);
});

test('search preserves an already visible library top even when it cannot currently be cast',async()=>{
  const {game,players:[bot]}=fixture();
  add(game,bot,'Oracle of Mul Daya');
  add(game,bot,'Forest','library');add(game,bot,'Island','library');
  const top=add(game,bot,'Sol Ring','library');
  const land=add(game,bot,'Island','hand');game.recalc();
  assert.equal(game.castableList(bot).some(entry=>entry.card===top),false,'the visible card has no legal current cast');
  const before=aiIsolationFingerprint(game);
  assert.equal(MTG.createBotPlayerView(game,bot.idx).players.find(row=>row.id===bot.idx).visibleLibraryTop.name,'Sol Ring');
  const result=await MTG.simulateAction(game,{kind:'land',card:land},{playerId:bot.idx,seed:13,
    searchInformation:{observerId:bot.idx,seed:13,knownCardIds:[]}});
  assert.equal(result.applied,true);
  assert.equal(result.state.players[bot.idx].library.at(-1).iid,top.iid,'a known top stays the top of the hypothesis');
  assert.equal(aiIsolationFingerprint(game),before);
});

test('optional local-AI loop decisions do not depend on an opponent drawn card identity',async()=>{
  const {game,players:[bot,opponent]}=fixture();
  const parasite=add(game,bot,'Kederekt Parasite');
  const forest=add(game,opponent,'Forest','hand'),island=add(game,opponent,'Island','hand');game.recalc();
  const query={type:'chooseOption',prompt:'Kederekt Parasite: deal 1 damage — use it?',options:[{key:'yes',label:'Yes'},{key:'no',label:'No'}],
    aiHint:{kind:'optTrigger',src:parasite,name:'Deal 1 damage'},data:{player:opponent,card:forest}};
  let answer;
  for(let i=0;i<100;i++){answer=await bot.controller.decide(game,query);if(answer==='no')break;}
  assert.equal(answer,'no','an otherwise unchanged repetitive optional window eventually declines');
  const before=MTG.hashBotPlayerView(MTG.createBotPlayerView(game,bot.idx));
  query.data.card=island;
  assert.equal(MTG.hashBotPlayerView(MTG.createBotPlayerView(game,bot.idx)),before);
  assert.equal(await bot.controller.decide(game,query),'no','a secret name cannot restart the optional sequence');
});

test('opponent Oracle of Mul Daya public top remains fixed in a search hypothesis',async()=>{
  const {game,players:[bot,opponent]}=fixture();
  add(game,opponent,'Oracle of Mul Daya');
  for(let i=0;i<5;i++)add(game,opponent,'Island','library');
  const top=add(game,opponent,'Sol Ring','library'),land=add(game,bot,'Forest','hand');game.recalc();
  const before=aiIsolationFingerprint(game);
  assert.equal(MTG.createBotPlayerView(game,bot.idx).players.find(row=>row.id===opponent.idx).visibleLibraryTop.name,'Sol Ring');
  const result=await MTG.simulateAction(game,{kind:'land',card:land},{playerId:bot.idx,seed:13,
    searchInformation:{observerId:bot.idx,seed:13,knownCardIds:[]}});
  assert.equal(result.applied,true);assert.equal(result.state.players[opponent.idx].library.at(-1).iid,top.iid);
  assert.equal(aiIsolationFingerprint(game),before);
});

test('opponent private top-look permission does not disclose its library top to the bot',()=>{
  const {game,players:[bot,opponent]}=fixture();
  add(game,opponent,'Realmwalker');const top=add(game,opponent,'Sol Ring','library');game.recalc();
  assert.equal(MTG.createBotPlayerView(game,bot.idx).players.find(row=>row.id===opponent.idx).visibleLibraryTop,undefined);
  assert.equal(MTG.createBotPlayerView(game,opponent.idx).players.find(row=>row.id===opponent.idx).visibleLibraryTop.name,top.name);
});

test('local AI completes a real twenty-target Disorder in the Court beyond its search width',async()=>{
  const {game,players:[bot,opponent]}=fixture();
  const creatures=Array.from({length:25},()=>add(game,opponent,'Runeclaw Bear'));
  const spell=add(game,bot,'Disorder in the Court','hand');bot.pool.C=20;bot.pool.W=1;bot.pool.U=1;game.recalc();
  const choices=[],decide=bot.controller.decide;
  bot.controller.decide=async function(state,query){const answer=await decide.call(this,state,query);if(query.type==='chooseTargets')choices.push({query,answer});return answer;};
  assert.equal(await game.castSpell(bot,spell,{from:'hand'}),true);
  for(let i=0;i<50&&(game.stack.length||game.pendingTriggers.length);i++){
    await game.flushTriggers();if(game.stack.length)await game.resolveTop();
  }
  assert.equal(choices.length,1);assert.equal(choices[0].query.min,20);
  assert.equal(choices[0].answer.length,20);assert.equal(new Set(choices[0].answer).size,20);
  assert.equal(creatures.filter(card=>card.zone==='exile').length,20);
  assert.equal(game.battlefield.filter(card=>card.ctrl===bot&&card.hasSub('Clue')).length,20);
});

test('local AI pays a thirty-card mandatory cleanup discard beyond its search width',async()=>{
  const {game,players:[bot]}=fixture();
  for(let i=0;i<37;i++)add(game,bot,'Runeclaw Bear','hand');
  add(game,bot,'Forest','library');game.recalc();
  const choices=[],decide=bot.controller.decide;
  bot.controller.decide=async function(state,query){
    const answer=await decide.call(this,state,query);
    if(query.aiHint?.kind==='cleanupDiscard')choices.push({query,answer});return answer;
  };
  await game.runTurn(bot);
  assert.equal(choices.length,1);assert.equal(choices[0].query.min,30);
  assert.equal(choices[0].answer.length,30);assert.equal(new Set(choices[0].answer).size,30);
  assert.equal(bot.hand.length,7);assert.equal(bot.graveyard.length,30);
  assert.equal(game.battlefield.filter(card=>card.ctrl===bot&&card.is('Land')).length,1,'real main-phase land play also happened');
});

for(const legacy of [false,true])test(`${legacy?'fallback':'local AI'} completes Moxite Refinery's mandatory positive counter payment`,async()=>{
  const {game,players:[bot]}=fixture(922023);
  bot.controller=new MTG.AIController(bot,{difficulty:'easy'});
  const refinery=add(game,bot,'Moxite Refinery'),source=add(game,bot,'Astral Cornucopia'),target=add(game,bot,'Runeclaw Bear');
  source.counters['+1/+1']=1;bot.pool.C=2;game.recalc();
  const choices=[],decide=bot.controller.decide;
  bot.controller.decide=async function(state,query){
    const answer=legacy&&query.type==='chooseX'?this.chooseX(state,query):await decide.call(this,state,query);
    if(query.aiHint?.kind==='moveCounters')choices.push({query,answer});return answer;
  };
  const entry=game.activatableList(bot).find(row=>row.card===refinery&&row.ability.label==='Move as +1/+1 counters');assert.ok(entry);
  assert.equal(await game.activateAbility(bot,entry,[target]),true);
  for(let i=0;i<20&&(game.stack.length||game.pendingTriggers.length);i++){
    await game.flushTriggers();if(game.stack.length)await game.resolveTop();
  }
  assert.equal(choices.length,1);assert.equal(choices[0].answer,1);
  assert.equal(source.counters['+1/+1']||0,0);assert.equal(target.counters['+1/+1'],1);
  assert.equal(target.power,3);assert.equal(refinery.tapped,true);assert.equal(bot.pool.C||0,0);
});
