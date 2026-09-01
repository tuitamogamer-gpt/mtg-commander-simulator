import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {normalizeManaOperations} from '../scripts/oracle-extensions-v8.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const rows = [
  ['Artifacts', 'Sorcery', 'Look at the top five cards of your library. You may reveal any number of artifact cards from among them and put the revealed cards into your hand. Put the rest on the bottom of your library in a random order.'],
  ['Two', 'Instant', 'Look at the top five cards of your library. Put two of them into your hand and the rest on the bottom of your library in any order.'],
  ['All', 'Sorcery', 'Reveal the top five cards of your library. Choose all creature cards from among them. Put those cards into your hand. Put the rest into your graveyard.'],
  ['Optional All', 'Sorcery', 'Look at the top five cards of your library. You may put all creature cards from among them into your hand. Put the rest on the bottom of your library in any order.'],
  ['Battlefield', 'Sorcery', 'Reveal the top four cards of your library. You may put up to two creature cards from among them onto the battlefield tapped. Then shuffle the rest into your library.'],
  ['Top', 'Sorcery', 'Look at the top four cards of your library. Put up to one of them on top of your library and the rest on the bottom of your library in a random order.'],
  ['Telling', 'Instant', 'Look at the top three cards of your library. Put one of those cards into your hand, one on top of your library, and one on the bottom of your library.'],
  ['Exile', 'Sorcery', 'Look at the top four cards of your library. Exile one of those cards. Put the rest back on top of your library in any order.'],
  ['Graveyard', 'Sorcery', 'Look at the top five cards of your library. Put two of them into your graveyard and the rest into your hand.'],
  ['X', 'Sorcery', 'Reveal the top X plus one cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order.'],
  ['Revealed Two', 'Creature', 'When this creature enters, look at the top five cards of your library. You may reveal up to two creature cards from among them and put them into your hand. Put the rest on the bottom of your library in a random order.'],
  ['Ability', 'Artifact', '{1}, {T}: Look at the top three cards of your library. Put two of them into your hand and the rest into your graveyard.'],
  ['Until Artifact', 'Sorcery', 'Reveal cards from the top of your library until you reveal an artifact card. Put that card into your hand and the rest on the bottom of your library in any order.'],
  ['Until Basic', 'Sorcery', 'Reveal cards from the top of your library until you reveal a basic land card. Put that card into your hand and all other cards revealed this way into your graveyard.'],
  ['Until Field', 'Sorcery', 'Reveal cards from the top of your library until you reveal two creature cards. Put those creature cards onto the battlefield tapped and the rest on the bottom of your library in a random order.'],
  ['Until All', 'Sorcery', 'Reveal cards from the top of your library until you reveal a nonland card, then put all cards revealed this way into your hand.'],
  ['Until X', 'Sorcery', 'Reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order.'],
  ['Until Opponent', 'Sorcery', 'Target opponent reveals cards from the top of their library until they reveal two land cards, then puts those cards into their graveyard.'],
  ['Until Each', 'Sorcery', 'Each opponent reveals cards from the top of their library until they reveal a land card, then puts those cards into their graveyard.'],
  ['Until Optional', 'Sorcery', 'Reveal cards from the top of your library until you reveal a creature card. You may put that card onto the battlefield. Then shuffle.'],
  ['Until Ability', 'Artifact', '{1}, {T}: Reveal cards from the top of your library until you reveal an artifact card. Put that card into your hand and the rest on the bottom of your library in any order.'],
  ['Foreign Top', 'Sorcery', "Look at the top four cards of target opponent's library. Exile one of those cards and put the rest back on top of that player's library in any order."],
  ['Until Count', 'Sorcery', 'Reveal cards from the top of your library until you reveal X creature cards, where X is the number of creatures you control. Put those creature cards onto the battlefield and the rest on the bottom of your library in a random order.'],
  ['Until Aura', 'Sorcery', 'Reveal cards from the top of your library until you reveal an Aura card. You may put that card onto the battlefield. Then shuffle.'],
  ['Until Greater', 'Sorcery', 'Exile target creature you control, then reveal cards from the top of your library until you reveal a creature card with greater mana value. Put that card onto the battlefield and the rest on the bottom of your library in a random order.'],
  ['Until Shared Type', 'Sorcery', 'Put target permanent you own on the bottom of your library. Reveal cards from the top of your library until you reveal a card that shares a card type with that permanent. Put that card onto the battlefield and the rest on the bottom of your library in a random order.'],
  ['Polymorph', 'Sorcery', "Destroy target creature. It can't be regenerated. Its controller reveals cards from the top of their library until they reveal a creature card. The player puts that card onto the battlefield, then shuffles all other cards revealed this way into their library."],
  ['Transmogrify', 'Sorcery', "Exile target creature. That creature's controller reveals cards from the top of their library until they reveal a creature card. That player puts that card onto the battlefield, then shuffles the rest into their library."],
  ['Reorder Draw', 'Sorcery', 'Look at the top three cards of your library, then put them back in any order. You may shuffle. Draw a card.'],
  ['Reorder Count', 'Instant', 'Look at the top X cards of your library, where X is the number of cards in your hand, then put them back in any order.'],
  ['Foreign Shuffle', 'Sorcery', "Look at the top five cards of target opponent's library. You may then have that player shuffle that library."],
  ['Shuffle Target', 'Sorcery', 'Target player shuffles their graveyard into their library. Draw a card.'],
  ['Wheel Each', 'Sorcery', 'Each player shuffles their hand and graveyard into their library, then draws seven cards.'],
  ['Shuffle Ability', 'Artifact', '{1}, {T}: Shuffle your graveyard into your library.'],
  ['Search Split', 'Sorcery', 'Search your library for up to two creature cards and reveal them. Put one into your hand and the other into your graveyard. Then shuffle.'],
  ['Search Lands', 'Sorcery', 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.'],
  ['Search Different', 'Sorcery', 'Search your library for up to three creature cards with different names, reveal them, put them into your hand, then shuffle.'],
  ['Search Top', 'Instant', 'Search your library for a creature card, reveal it, then shuffle and put the card on top.'],
  ['Search Any Top', 'Sorcery', 'Search your library for any number of Dwarf cards, reveal those cards, then shuffle and put them on top in any order.'],
  ['Search Third', 'Instant', 'Search your library for a card, then shuffle and put that card third from the top.'],
  ['Search Ability', 'Artifact', '{1}, {T}: Search your library for up to two creature cards with different names, reveal them, put them into your hand, then shuffle.'],
];
const fixtures = rows.map(([name, type, oracle], index) => {
  const card = {name: 'V8 Library ' + name, type_line: type, layout: 'normal', mana_cost: name === 'X' || name === 'Until X' ? '{X}{U}' : '{2}{U}', oracle_text: oracle, power: '2', toughness: '3'};
  const semantic = semanticClass(card, {compilerVersion: 8}); assert.ok(semantic.semanticClass, name + ': ' + semantic.reason);
  assert.ok(JSON.stringify(semantic.implementation).includes('library-'), name + ': new library route');
  return {position: index + 1, oracleId: 'v8-library-' + index, scryfallId: 'v8-library-print-' + index, ...semantic,
    raw: {name: card.name, cost: card.mana_cost, oracle, types: [type], subtypes: [], super: [], _ci: ['U'],
      ...(type === 'Creature' ? {power: '2', toughness: '3'} : {})}, catalog: {typeLine: type, commanderLegality: 'legal'}};
});
M.registerOracleBatch({id: 'oracle-v8-library-test', sequence: 9992, cards: fixtures}); M.initData(M.RAW_DATA);

function context(role = 'human', fullPriority = false) {
  const trace = [], revealed = [], state = {};
  const human = {decide: async (game, query) => {
    if (query.type === 'main' || query.type === 'priority') return {kind: 'pass'};
    if (query.type === 'chooseCards') return state.cards?.(query) ?? query.from.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseTargets') return state.targets?.(query) ?? query.candidates.slice(0, query.min || 1);
    if (query.type === 'chooseOption') return state.option?.(query) ?? query.options.find(option => ['yes', 'stay'].includes(option.key))?.key ?? query.options[0].key;
    if (query.type === 'orderTriggers') return query.triggers;
    if (query.type === 'scry') return {top: query.cards, bottom: []};
    if (query.type === 'chooseX') return 2;
    return [];
  }};
  const game = new M.Game({seed: 127401, paced: false});
  const a = game.addPlayer('A', {name: 'A'}, {...human}, role === 'ai'), b = game.addPlayer('B', {name: 'B'}, {...human}, false);
  if (role === 'ai') a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'});
  for (const player of game.players) {
    const decide = player.controller.decide.bind(player.controller);
    player.controller.decide = async (g, query) => {const answer = await decide(g, query); trace.push({player, query, answer}); return answer;};
  }
  game.turnPlayer = a; game.turnNo = 7; game.phase = 'main1'; game.step = 'main';
  if (!fullPriority) game.priorityRound = async () => {};
  game.revealToHuman = async query => {revealed.push({cards: [...query.cards], ctrl: query.ctrl, kind: query.kind});};
  game.reviewGlobalEffectWithHuman = async () => {};
  return {game, a, b, trace, revealed, state};
}
function card(name, types = ['Creature'], extra = {}) {
  return {name, cost: '{3}{G}', oracle: '', types, subtypes: [], super: [], power: '4', toughness: '5', kws: [], ...extra};
}
function put(ctx, definition, zone = 'library', player = ctx.a) {
  const result = new M.CardInst(typeof definition === 'string' ? M.DEFS[definition] : definition, player);
  result.zone = zone; result.ctrl = player; result.sick = false;
  if (zone === 'battlefield') {ctx.game.battlefield.push(result); ctx.game.recalc();} else player[zone].push(result);
  return result;
}
function pile(ctx, specifications) {
  return specifications.map((types, index) => put(ctx, card('Library witness ' + index, typeof types === 'string' ? [types] : types)));
}
async function settle(game) {
  for (let n = 0; n < 100 && (game.stack.length || game.pendingTriggers.length); n++) {
    await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0);
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
}
async function cast(ctx, name, {resolve = true, pilot = false} = {}) {
  const {game, a} = ctx, source = put(ctx, 'V8 Library ' + name, 'hand'); a.pool.U = 1; a.pool.C = 2;
  if (pilot) {
    const action = await a.controller.decide(game, {type: 'main', player: a, phase: game.phase, casts: game.castableList(a), acts: game.activatableList(a), lands: []});
    assert.equal(action.kind, 'cast'); assert.equal(action.card, source); assert.equal(await game.performAction(a, action), true);
  } else assert.equal(await game.castSpell(a, source, {from: 'hand', xVal: 2}), true);
  assert.equal(a.pool.U + a.pool.C, 0, 'printed cost was paid before the library was inspected');
  if (resolve) await settle(game); return source;
}
const choices = ctx => ctx.trace.filter(row => row.query.type === 'chooseCards' && row.query.prompt.startsWith('Choose inspected cards'));

test('v8 library: every closed library action keeps a mana-producing activation on the Stack', () => {
  for (const action of ['library-zone-shuffle-v8', 'library-search-v8']) {
    const operation = {kind: 'generic-ability', cost: {tap: true}, effects: [
      {action: 'add-mana', choices: [{C: 1}]}, {action},
    ]};
    assert.equal(normalizeManaOperations([operation])[0].stackMana, true, action + ': compiler classification');
    assert.equal(M.oracleManaUsesStack({activationCost: {tap: true}, afterEffects: [{action}]}), true, action + ': runtime classification');
  }
});

test('v8 library grammar rejects unknown selection, ordering and follow-up clauses', () => {
  for (const oracle_text of [
    'Look at the top five cards of your library. Put two of them into your hand and the rest behind your chair.',
    'Look at the top five cards of your library. Put two unknown cards from among them into your hand and the rest into your graveyard.',
    'Look at the top five cards of your library. Put two of them into your hand and the rest into your graveyard. You win the secret game.',
    'Look at the top five cards of your library. Put any card you wish into your hand and the rest into your graveyard.',
    'Look at the top three cards of your library. Put one of them into your hand and the other into your graveyard.',
    'Look at the top four cards of your library. Put one of those cards into your hand, one on top of your library, and one on the bottom of your library.',
  ]) assert.equal(semanticClass({name: 'Closed Library', type_line: 'Sorcery', layout: 'normal', oracle_text}, {compilerVersion: 8}).semanticClass, undefined);
});

for (const role of ['human', 'ai']) {
  test(`v8 library ${role}: paid private look exposes only selected artifacts publicly and leaves uninspected cards in place`, async () => {
    const ctx = context(role), all = pile(ctx, ['Land', 'Land', 'Creature', 'Artifact', 'Land', ['Artifact', 'Creature'], 'Instant']);
    const top = all.slice(-5), artifacts = top.filter(card => card.is('Artifact')); await cast(ctx, 'Artifacts');
    assert.deepEqual(new Set(ctx.a.hand), new Set(artifacts)); assert.ok(artifacts.every(card => card.zone === 'hand'));
    assert.equal(ctx.revealed.length, 1); assert.deepEqual(new Set(ctx.revealed[0].cards), new Set(artifacts));
    assert.ok(ctx.trace.every(row => row.player === ctx.a || !row.query.cards?.some(card => top.includes(card))));
    const rest = top.filter(card => !artifacts.includes(card));
    assert.deepEqual(new Set(ctx.a.library.slice(0, rest.length)), new Set(rest));
    assert.deepEqual([...ctx.a.library.slice(-2)], all.slice(0, 2), 'untouched library order is preserved above the returned bottom cohort');
    assert.equal(choices(ctx)[0].query.max, artifacts.length); assert.equal(choices(ctx)[0].query.min, 0);
  });
  test(`v8 library ${role}: exact mandatory selection count and short-library behavior use legal choices`, async () => {
    const ctx = context(role), all = pile(ctx, ['Creature', 'Artifact', 'Land', 'Creature', 'Instant']);
    await cast(ctx, 'Two'); const selected = choices(ctx)[0].answer;
    assert.equal(selected.length, 2); assert.equal(choices(ctx)[0].query.min, 2); assert.equal(choices(ctx)[0].query.max, 2);
    assert.deepEqual(new Set(ctx.a.hand), new Set(selected)); assert.deepEqual(new Set(ctx.a.library), new Set(all.filter(card => !selected.includes(card))));
    const short = context(role), shortCards = pile(short, ['Artifact']); await cast(short, 'Two');
    assert.deepEqual([...short.a.hand], shortCards); assert.equal(short.a.library.length, 0); assert.equal(choices(short)[0].query.min, 1);
  });
  test(`v8 library ${role}: reveal-all makes all eligible creatures mandatory and sends the other cards together to the graveyard`, async () => {
    const ctx = context(role), all = pile(ctx, ['Creature', 'Artifact', 'Creature', 'Land', 'Instant']);
    await cast(ctx, 'All'); const creatures = all.filter(card => card.is('Creature'));
    assert.deepEqual(new Set(ctx.revealed[0].cards), new Set(all)); assert.deepEqual(new Set(ctx.a.hand), new Set(creatures));
    assert.ok(all.filter(card => !creatures.includes(card)).every(card => card.zone === 'graveyard'));
    assert.equal(choices(ctx)[0].query.min, 2); assert.equal(choices(ctx)[0].answer.length, 2);
  });
  test(`v8 library ${role}: selected permanents enter tapped simultaneously and shuffle preserves the remaining whole library`, async () => {
    const ctx = context(role), all = pile(ctx, ['Land', 'Instant', 'Creature', 'Artifact', 'Creature', 'Land']);
    const expected = all.slice(-4).filter(card => card.is('Creature')), entries = [], emit = ctx.game.emit.bind(ctx.game);
    ctx.game.emit = async (name, data) => {if (name === 'etb' && expected.includes(data.card)) entries.push(expected.every(card => card.zone === 'battlefield' && card.tapped)); return emit(name, data);};
    await cast(ctx, 'Battlefield'); assert.ok(expected.every(card => card.zone === 'battlefield' && card.ctrl === ctx.a && card.tapped));
    assert.deepEqual(entries, [true, true]); assert.deepEqual(new Set(ctx.a.library), new Set(all.filter(card => !expected.includes(card))));
  });
  test(`v8 library ${role}: Telling Time chooses distinct hand, top and bottom cards from the inspected cohort`, async () => {
    const ctx = context(role), all = pile(ctx, ['Land', 'Creature', 'Artifact', 'Instant', 'Creature']);
    await cast(ctx, 'Telling'); const selected = choices(ctx), hand = selected[0].answer[0], top = selected[1].answer[0];
    assert.notEqual(hand, top); assert.equal(hand.zone, 'hand'); assert.equal(ctx.a.library.at(-1), top);
    const bottom = all.slice(-3).find(card => card !== hand && card !== top); assert.equal(ctx.a.library[0], bottom);
    assert.deepEqual([...ctx.a.library.slice(1, -1)], all.slice(0, 2));
  });
  test(`v8 library ${role}: printed ETB and activated costs reach the Stack before inspecting or moving cards`, async () => {
    const ctx = context(role), first = pile(ctx, ['Creature', 'Land', 'Creature', 'Land', 'Creature']);
    const source = await cast(ctx, 'Revealed Two', {resolve: false}); assert.equal(ctx.a.hand.length, 0); assert.equal(ctx.a.library.length, first.length);
    await settle(ctx.game); assert.equal(source.zone, 'battlefield'); assert.equal(ctx.a.hand.length, 2);
    const other = context(role); pile(other, ['Creature', 'Land', 'Creature']); const artifact = await cast(other, 'Ability');
    other.a.pool.C = 1; const action = other.game.activatableList(other.a).find(row => row.card === artifact && row.ability);
    assert.ok(action); assert.equal(await other.game.activateAbility(other.a, action), true); assert.equal(artifact.tapped, true); assert.equal(other.a.pool.C, 0);
    assert.equal(other.a.hand.length, 0); await settle(other.game); assert.equal(other.a.hand.length, 2);
  });
}

test('v8 library zone shuffle: a paid targeted spell moves only that player graveyard and draws for the caster', async () => {
  const ctx = context(), mine = pile(ctx, ['Land', 'Creature', 'Artifact']);
  const targetLibrary = [put(ctx, card('Target library first'), 'library', ctx.b), put(ctx, card('Target library second'), 'library', ctx.b)];
  const targetGraveyard = [put(ctx, card('Target graveyard first'), 'graveyard', ctx.b), put(ctx, card('Target graveyard second'), 'graveyard', ctx.b)];
  const myGraveyard = put(ctx, card('Caster graveyard untouched'), 'graveyard', ctx.a), leaves = [];
  const emit = ctx.game.emit.bind(ctx.game); ctx.game.emit = async (event, data) => {
    if (event === 'cardsLeftGraveyard') leaves.push({cards: [...data.cards], allMoved: data.cards.every(candidate => candidate.zone === 'library')});
    return emit(event, data);
  };
  ctx.state.targets = query => query.candidates.includes(ctx.b) ? [ctx.b] : query.candidates.slice(0, query.min || 1);
  await cast(ctx, 'Shuffle Target');
  assert.equal(ctx.a.hand.length, 1); assert.ok(mine.includes(ctx.a.hand[0])); assert.equal(ctx.a.library.length, mine.length - 1);
  assert.equal(myGraveyard.zone, 'graveyard'); assert.ok(ctx.a.graveyard.includes(myGraveyard));
  assert.deepEqual(new Set([...ctx.b.library, ...ctx.b.hand]), new Set([...targetLibrary, ...targetGraveyard]));
  assert.ok(targetGraveyard.every(candidate => candidate.owner === ctx.b && !ctx.b.graveyard.includes(candidate)));
  assert.equal(leaves.length, 1); assert.deepEqual(new Set(leaves[0].cards), new Set(targetGraveyard)); assert.equal(leaves[0].allMoved, true);
});

for (const role of ['human', 'ai']) {
  test(`v8 library zone shuffle ${role}: each player locks hand and graveyard together, then draws seven`, async () => {
    const ctx = context(role), leaves = [], participants = new Map();
    for (const owner of [ctx.a, ctx.b]) {
      const originalLibrary = Array.from({length: 8}, (_, index) => put(ctx, card(owner.name + ' wheel library ' + index), 'library', owner));
      const originalHand = [put(ctx, card(owner.name + ' wheel hand 0'), 'hand', owner), put(ctx, card(owner.name + ' wheel hand 1'), 'hand', owner)];
      const originalGraveyard = [put(ctx, card(owner.name + ' wheel grave 0'), 'graveyard', owner), put(ctx, card(owner.name + ' wheel grave 1'), 'graveyard', owner)];
      participants.set(owner, {originalLibrary, originalHand, originalGraveyard,
        versions: new Map([...originalHand, ...originalGraveyard].map(candidate => [candidate, candidate.zoneVersion]))});
    }
    const emit = ctx.game.emit.bind(ctx.game); ctx.game.emit = async (event, data) => {
      if (event === 'cardsLeftGraveyard') leaves.push({cards: [...data.cards], snapshots: [...data.snapshots], allMoved: data.cards.every(candidate => candidate.zone === 'library')});
      return emit(event, data);
    };
    const source = await cast(ctx, 'Wheel Each');
    assert.equal(source.zone, 'graveyard');
    for (const [owner, group] of participants) {
      const all = [...group.originalLibrary, ...group.originalHand, ...group.originalGraveyard];
      assert.equal(owner.hand.length, 7); assert.equal(owner.library.length, all.length - 7);
      assert.deepEqual(new Set([...owner.hand, ...owner.library]), new Set(all));
      assert.ok(all.every(candidate => candidate.owner === owner && ['hand', 'library'].includes(candidate.zone)));
      assert.ok(group.originalHand.every(candidate => candidate.zoneVersion >= group.versions.get(candidate) + 1));
      assert.ok(group.originalGraveyard.every(candidate => candidate.zoneVersion >= group.versions.get(candidate) + 1));
    }
    const allGraveyard = [...participants.values()].flatMap(group => group.originalGraveyard);
    assert.equal(leaves.length, 1); assert.deepEqual(new Set(leaves[0].cards), new Set(allGraveyard));
    assert.equal(leaves[0].snapshots.length, allGraveyard.length); assert.equal(leaves[0].allMoved, true);
    assert.equal(ctx.revealed.length, 0); assert.equal((ctx.game.aiDecisionLog || []).some(row => row.fallback), false);
  });
}

test('v8 library zone shuffle: a real paid tap activation preserves its source while moving the locked graveyard', async () => {
  const ctx = context(), library = pile(ctx, ['Land', 'Creature', 'Artifact']), graveyard = [
    put(ctx, card('Activated graveyard first'), 'graveyard'), put(ctx, card('Activated graveyard second'), 'graveyard'),
  ];
  const source = await cast(ctx, 'Shuffle Ability'); ctx.a.pool.C = 1;
  const action = ctx.game.activatableList(ctx.a).find(candidate => candidate.card === source && candidate.ability);
  assert.ok(action); assert.equal(await ctx.game.activateAbility(ctx.a, action), true);
  assert.equal(ctx.a.pool.C, 0); assert.equal(source.tapped, true); assert.ok(graveyard.every(candidate => candidate.zone === 'graveyard'));
  await settle(ctx.game);
  assert.equal(source.zone, 'battlefield'); assert.equal(source.tapped, true);
  assert.deepEqual(new Set(ctx.a.library), new Set([...library, ...graveyard]));
  assert.ok(graveyard.every(candidate => candidate.owner === ctx.a && candidate.zone === 'library'));
});

for (const role of ['human', 'ai']) {
  test(`v8 library search ${role}: a paid split search reveals one cohort and partitions exact locked cards`, async () => {
    const ctx = context(role), all = pile(ctx, ['Artifact', 'Creature', 'Land', 'Creature', 'Creature']);
    await cast(ctx, 'Search Split');
    const search = ctx.trace.find(row => row.query.type === 'chooseCards' && row.query.search), selected = search.answer;
    assert.equal(selected.length, 2); assert.equal(search.query.min, 0); assert.equal(search.query.max, 2);
    assert.ok(selected.every(candidate => candidate.is('Creature'))); assert.deepEqual(ctx.revealed.filter(row => row.kind === 'reveal').map(row => ids(row.cards)), [ids(selected)]);
    const partition = ctx.trace.find(row => row.query.prompt === 'Choose searched cards for hand');
    assert.ok(partition); assert.equal(partition.answer.length, 1); assert.equal(partition.answer[0].zone, 'hand');
    const other = selected.find(candidate => candidate !== partition.answer[0]); assert.equal(other.zone, 'graveyard');
    assert.deepEqual(new Set([...ctx.a.library, ...ctx.a.hand, ...ctx.a.graveyard.filter(candidate => candidate !== other && !candidate.name.startsWith('V8 Library'))]),
      new Set([...all.filter(candidate => candidate !== other), partition.answer[0]]));
  });
  test(`v8 library search ${role}: different-name search exposes one representative per name and makes a real acquisition`, async () => {
    const ctx = context(role), first = put(ctx, card('Repeated search name')), duplicate = put(ctx, card('Repeated search name'));
    const second = put(ctx, card('Second search name')), third = put(ctx, card('Third search name')), land = put(ctx, card('Search noncreature', ['Land'], {cost: ''}));
    await cast(ctx, 'Search Different');
    const search = ctx.trace.find(row => row.query.type === 'chooseCards' && row.query.search), selected = search.answer;
    assert.equal(search.query.from.filter(candidate => candidate.name === first.name).length, 1);
    assert.equal(selected.length, 3); assert.equal(new Set(selected.map(candidate => candidate.name)).size, 3);
    assert.ok(selected.every(candidate => candidate.zone === 'hand' && candidate.owner === ctx.a));
    assert.equal([first, duplicate].filter(candidate => candidate.zone === 'library').length, 1); assert.equal(land.zone, 'library');
  });
  test(`v8 library search ${role}: a revealed tutor shuffles first and leaves the exact card on top without a zone change`, async () => {
    const ctx = context(role), all = pile(ctx, ['Land', 'Creature', 'Artifact', 'Creature']);
    const versions = new Map(all.map(candidate => [candidate, candidate.zoneVersion])); await cast(ctx, 'Search Top');
    const search = ctx.trace.find(row => row.query.type === 'chooseCards' && row.query.search), chosen = search.answer[0];
    assert.ok(chosen.is('Creature')); assert.equal(ctx.a.library.at(-1), chosen); assert.equal(chosen.zoneVersion, versions.get(chosen));
    assert.deepEqual(ctx.revealed.filter(row => row.kind === 'reveal').map(row => ids(row.cards)), [[chosen.iid]]);
    assert.deepEqual(new Set(ctx.a.library), new Set(all));
  });
}

test('v8 library search: basic lands split between a simultaneous tapped entry and the hand', async () => {
  const ctx = context(), basics = [
    put(ctx, card('Basic search first', ['Land'], {super: ['Basic'], cost: ''})),
    put(ctx, card('Basic search second', ['Land'], {super: ['Basic'], cost: ''})),
  ];
  const nonbasic = put(ctx, card('Nonbasic search land', ['Land'], {cost: ''})); await cast(ctx, 'Search Lands');
  const selected = ctx.trace.find(row => row.query.type === 'chooseCards' && row.query.search).answer;
  assert.deepEqual(new Set(selected), new Set(basics));
  const battlefield = basics.find(candidate => candidate.zone === 'battlefield'), hand = basics.find(candidate => candidate.zone === 'hand');
  assert.ok(battlefield && hand); assert.equal(battlefield.tapped, true); assert.equal(battlefield.ctrl, ctx.a); assert.equal(nonbasic.zone, 'library');
});

test('v8 library search: any-number top ordering and third-from-top insertion use the post-shuffle library', async () => {
  const ordered = context(), dwarves = [
    put(ordered, card('Dwarf search first', ['Creature'], {subtypes: ['Dwarf']})),
    put(ordered, card('Dwarf search second', ['Creature'], {subtypes: ['Dwarf']})),
    put(ordered, card('Dwarf search third', ['Creature'], {subtypes: ['Dwarf']})),
  ];
  const other = put(ordered, card('Search ordering other', ['Land'], {cost: ''})); await cast(ordered, 'Search Any Top');
  const order = ordered.trace.find(row => row.query.prompt === 'Order searched cards, top first');
  assert.ok(order); assert.deepEqual(new Set(order.answer), new Set(dwarves));
  assert.deepEqual(ids(ordered.a.library.slice(-dwarves.length)).reverse(), ids(order.answer)); assert.equal(ordered.a.library[0], other);
  const third = context(), all = pile(third, ['Land', 'Creature', 'Artifact', 'Instant', 'Enchantment']);
  await cast(third, 'Search Third'); const chosen = third.trace.find(row => row.query.type === 'chooseCards' && row.query.search).answer[0];
  assert.equal(third.a.library.at(-3), chosen); assert.deepEqual(new Set(third.a.library), new Set(all)); assert.equal(third.revealed.length, 0);
});

test('v8 library search: a paid tap activation searches only after the ability reaches the Stack', async () => {
  const ctx = context(), creatures = pile(ctx, ['Creature', 'Creature', 'Artifact']); const source = await cast(ctx, 'Search Ability');
  ctx.a.pool.C = 1; const action = ctx.game.activatableList(ctx.a).find(candidate => candidate.card === source && candidate.ability);
  assert.ok(action); assert.equal(await ctx.game.activateAbility(ctx.a, action), true); assert.equal(source.tapped, true); assert.equal(ctx.a.pool.C, 0);
  assert.equal(ctx.a.hand.length, 0); await settle(ctx.game); assert.equal(ctx.a.hand.length, 2);
  assert.ok(ctx.a.hand.every(candidate => creatures.includes(candidate) && candidate.is('Creature'))); assert.equal(source.zone, 'battlefield');
});

test('v8 library order: declining the shuffle draws the deliberately ordered top card', async () => {
  const ctx = context(), all = pile(ctx, ['Land', 'Artifact', 'Creature', 'Instant', 'Land', 'Creature']);
  ctx.state.option = query => query.prompt === 'Shuffle the inspected library?' ? 'no' : 'yes';
  ctx.state.cards = query => query.prompt === 'Order inspected cards, top first' ? query.from.slice().reverse() : query.from.slice(0, query.max);
  await cast(ctx, 'Reorder Draw');
  assert.equal(ctx.a.hand[0], all[3]); assert.equal(ctx.a.library.at(-1), all[4]); assert.equal(ctx.a.library.at(-2), all[5]);
  assert.deepEqual(ids(ctx.a.library.slice(0, 3)), ids(all.slice(0, 3))); assert.equal(ctx.revealed.length, 0);
});

test('v8 library order: a chosen shuffle precedes the draw and is deterministic for the same seeded game', async () => {
  const result = async () => {
    const ctx = context(), all = pile(ctx, ['Land', 'Artifact', 'Creature', 'Instant', 'Land', 'Enchantment']);
    await cast(ctx, 'Reorder Draw'); assert.equal(ctx.a.hand.length, 1); assert.equal(ctx.a.library.length, all.length - 1);
    assert.ok(ctx.trace.some(row => row.query.prompt === 'Shuffle the inspected library?' && row.answer === 'yes'));
    assert.deepEqual(new Set([...ctx.a.hand, ...ctx.a.library]), new Set(all));
    return {hand: ctx.a.hand[0].name, library: Array.from(ctx.a.library, card => card.name)};
  };
  assert.deepEqual(await result(), await result());
});

test('v8 library order: counted hand size is evaluated after the spell leaves the hand', async () => {
  const ctx = context(), all = pile(ctx, ['Land', 'Artifact', 'Creature', 'Instant', 'Land']);
  put(ctx, card('Retained hand first'), 'hand'); put(ctx, card('Retained hand second'), 'hand');
  await cast(ctx, 'Reorder Count'); const view = ctx.trace.find(row => row.query.type === 'cardReveal');
  assert.deepEqual(ids(view.query.cards), ids(all.slice(-2).reverse())); assert.deepEqual(ids(ctx.a.library.slice(0, 3)), ids(all.slice(0, 3)));
});

test('v8 library order: the caster may decline to shuffle a privately inspected opposing library', async () => {
  const ctx = context(), all = ['Creature', 'Land', 'Instant', 'Artifact', 'Land', 'Enchantment'].map((type, i) => put(ctx, card('Foreign unchanged ' + i, [type]), 'library', ctx.b));
  ctx.state.option = query => query.prompt === 'Shuffle the inspected library?' ? 'no' : 'yes';
  await cast(ctx, 'Foreign Shuffle'); assert.deepEqual(ids(ctx.b.library), ids(all));
  const decision = ctx.trace.find(row => row.query.prompt === 'Shuffle the inspected library?'); assert.equal(decision.player, ctx.a);
  const view = ctx.trace.find(row => row.query.type === 'cardReveal'); assert.equal(view.player, ctx.a); assert.equal(view.query.private, true);
  assert.deepEqual(ids(view.query.cards), ids(all.slice(-5).reverse())); assert.equal(ctx.revealed.length, 0);
});

test('v8 library order: the real hard AI orders and shuffles through an ordinary paid spell action', async () => {
  const ctx = context('ai', true); pile(ctx, ['Land', 'Artifact', 'Creature', 'Instant', 'Land', 'Enchantment']);
  await cast(ctx, 'Reorder Draw', {pilot: true}); assert.equal(ctx.a.hand.length, 1);
  assert.ok(ctx.trace.some(row => row.query.prompt === 'Order inspected cards, top first'));
  assert.ok(ctx.trace.some(row => row.query.prompt === 'Shuffle the inspected library?'));
});

test('v8 library: optional all means all-or-none and permits a real decline without exposing hidden creatures', async () => {
  const ctx = context(), all = pile(ctx, ['Creature', 'Land', 'Creature', 'Instant', 'Artifact']);
  ctx.state.option = query => query.prompt === 'Move all eligible inspected cards?' ? 'no' : 'yes';
  await cast(ctx, 'Optional All'); assert.equal(ctx.a.hand.length, 0); assert.equal(ctx.revealed.length, 0);
  assert.deepEqual(new Set(ctx.a.library), new Set(all)); assert.equal(choices(ctx).length, 0);
  assert.ok(ctx.trace.some(row => row.query.prompt === 'Move all eligible inspected cards?' && row.answer === 'no'));
});

test('v8 library: retaining one top card does not reveal it and preserves every library object identity', async () => {
  const ctx = context(), all = pile(ctx, ['Land', 'Creature', 'Artifact', 'Instant', 'Creature', 'Enchantment']);
  const versions = new Map(all.map(card => [card, card.zoneVersion])); await cast(ctx, 'Top'); const selected = choices(ctx)[0].answer[0];
  assert.equal(ctx.a.library.at(-1), selected); assert.equal(ctx.revealed.length, 0);
  assert.ok(all.every(card => card.zoneVersion === versions.get(card) && card.zone === 'library'));
  assert.deepEqual([...ctx.a.library.slice(-3, -1)], all.slice(0, 2));
});

test('v8 library: exiling one inspected card and ordering the rest on top gives no casting permission', async () => {
  const ctx = context(), all = pile(ctx, ['Land', 'Creature', 'Artifact', 'Creature', 'Instant']);
  await cast(ctx, 'Exile'); const selected = choices(ctx)[0].answer[0];
  assert.equal(selected.zone, 'exile'); assert.equal(selected.meta.playableBy, undefined);
  assert.deepEqual(new Set(ctx.a.library.slice(-3)), new Set(all.slice(-4).filter(card => card !== selected))); assert.equal(ctx.a.library[0], all[0]);
});

test('v8 library: selected graveyard destination and remaining hand destination preserve the full inspected partition', async () => {
  const ctx = context(), all = pile(ctx, ['Creature', 'Land', 'Artifact', 'Instant', 'Creature']);
  const source = await cast(ctx, 'Graveyard'), selected = choices(ctx)[0].answer;
  assert.equal(selected.length, 2); assert.ok(selected.every(card => card.zone === 'graveyard')); assert.equal(source.zone, 'graveyard');
  assert.deepEqual(new Set(ctx.a.hand), new Set(all.filter(card => !selected.includes(card)))); assert.equal(ctx.a.library.length, 0);
});

test('v8 library: paid X plus one uses the cast X without inspecting the rest of the library', async () => {
  const ctx = context(), all = pile(ctx, ['Land', 'Creature', 'Artifact', 'Instant', 'Creature']); await cast(ctx, 'X');
  assert.deepEqual(new Set(ctx.revealed[0].cards), new Set(all.slice(-3))); assert.equal(choices(ctx)[0].query.from.length, 3);
  assert.deepEqual([...ctx.a.library.slice(-2)], all.slice(0, 2));
});

test('v8 library: an invalid duplicate selection is rejected without moving or substituting cards', async () => {
  const ctx = context(), all = pile(ctx, ['Creature', 'Land', 'Artifact', 'Instant', 'Creature']);
  ctx.state.cards = query => query.prompt.startsWith('Choose inspected') ? [query.from[0], query.from[0]] : query.from;
  await assert.rejects(cast(ctx, 'Two'), /Invalid inspected-card selection/); assert.deepEqual([...ctx.a.library], all); assert.equal(ctx.a.hand.length, 0);
});

test('v8 library: the real hard AI chooses a paid library spell through normal priority', async () => {
  const ctx = context('ai', true); pile(ctx, ['Land', 'Creature', 'Artifact', 'Instant', 'Creature']);
  const source = await cast(ctx, 'Two', {pilot: true}); assert.equal(source.zone, 'graveyard'); assert.equal(ctx.a.hand.length, 2);
  assert.ok(ctx.trace.some(row => row.query.type === 'main' && row.answer.kind === 'cast'));
  assert.equal(ctx.game.aiDecisionLog.some(row => row.fallback), false);
});

for (const role of ['human', 'ai']) {
  test(`v8 reveal until ${role}: paid spell stops at the first eligible artifact and keeps the deeper library hidden`, async () => {
    const ctx = context(role), all = pile(ctx, ['Land', 'Artifact', 'Land', 'Artifact', 'Creature', 'Land']);
    await cast(ctx, 'Until Artifact'); assert.deepEqual(ids(ctx.revealed[0].cards), ids(all.slice(-3).reverse()));
    assert.equal(all[3].zone, 'hand'); assert.equal(all[1].zone, 'library'); assert.deepEqual(ids(ctx.a.library.slice(-3)), ids(all.slice(0, 3)));
  });
  test(`v8 reveal until ${role}: a basic-land search ignores a nonbasic land and graveyard placement is not milling`, async () => {
    const ctx = context(role); const hidden = put(ctx, card('Deeper card', ['Creature']));
    const basic = put(ctx, card('Basic witness', ['Land'], {super: ['Basic'], cost: ''}));
    const nonbasic = put(ctx, card('Nonbasic witness', ['Land'], {cost: ''})), instant = put(ctx, card('Visible instant', ['Instant']));
    const events = [], emit = ctx.game.emit.bind(ctx.game); ctx.game.emit = async (event, data) => {events.push(event); return emit(event, data);};
    await cast(ctx, 'Until Basic'); assert.deepEqual(ids(ctx.revealed[0].cards), ids([instant, nonbasic, basic]));
    assert.equal(basic.zone, 'hand'); assert.ok([instant, nonbasic].every(card => card.zone === 'graveyard')); assert.equal(hidden.zone, 'library');
    assert.equal(events.includes('milled'), false); assert.equal(ctx.a.turnState.milled || 0, 0);
  });
  test(`v8 reveal until ${role}: two matching creatures enter together tapped with intermediate cards returned to the bottom`, async () => {
    const ctx = context(role), all = pile(ctx, ['Artifact', 'Land', 'Creature', 'Instant', 'Creature', 'Land']);
    const expected = [all[2], all[4]], entries = [], emit = ctx.game.emit.bind(ctx.game);
    ctx.game.emit = async (event, data) => {if (event === 'etb' && expected.includes(data.card)) entries.push(expected.every(card => card.zone === 'battlefield' && card.tapped)); return emit(event, data);};
    await cast(ctx, 'Until Field'); assert.deepEqual(ids(ctx.revealed[0].cards), ids(all.slice(-4).reverse())); assert.deepEqual(entries, [true, true]);
    assert.deepEqual(ids(ctx.a.library.slice(-2)), ids(all.slice(0, 2)));
  });
  test(`v8 reveal until ${role}: all revealed cards including the stopping nonland card enter the hand without drawing`, async () => {
    const ctx = context(role), all = pile(ctx, ['Creature', 'Artifact', 'Land', 'Land', 'Land']);
    await cast(ctx, 'Until All'); assert.deepEqual(new Set(ctx.a.hand), new Set(all.slice(-4))); assert.deepEqual(ids(ctx.a.library), ids([all[0]]));
    assert.equal(ctx.a.turnState.drewThisTurn || 0, 0);
  });
  test(`v8 reveal until ${role}: a target opponent's library is revealed through two lands and only that owner's graveyard receives it`, async () => {
    const ctx = context(role), mine = pile(ctx, ['Artifact', 'Creature']);
    const theirs = ['Creature', 'Land', 'Instant', 'Land', 'Artifact'].map((type, i) => put(ctx, card('Opponent card ' + i, [type]), 'library', ctx.b));
    await cast(ctx, 'Until Opponent'); assert.deepEqual(ids(ctx.revealed[0].cards), ids(theirs.slice(-4).reverse()));
    assert.ok(theirs.slice(-4).every(card => card.zone === 'graveyard' && ctx.b.graveyard.includes(card) && card.owner === ctx.b));
    assert.deepEqual(ids(ctx.a.library), ids(mine)); assert.equal(ctx.b.library[0], theirs[0]);
  });
  test(`v8 reveal until ${role}: activation pays and taps before the Stack resolves its library scan`, async () => {
    const ctx = context(role); pile(ctx, ['Land', 'Artifact', 'Land']); const source = await cast(ctx, 'Until Ability');
    ctx.a.pool.C = 1; const action = ctx.game.activatableList(ctx.a).find(row => row.card === source && row.ability);
    assert.ok(action); assert.equal(await ctx.game.activateAbility(ctx.a, action), true); assert.equal(ctx.a.pool.C, 0); assert.equal(source.tapped, true);
    assert.equal(ctx.a.hand.length, 0); await settle(ctx.game); assert.equal(ctx.a.hand.length, 1);
  });
  test(`v8 reveal until ${role}: greater mana value uses the exiled target's battlefield LKI`, async () => {
    const ctx = context(role), victim = put(ctx, card('Relative mana victim', ['Creature'], {cost: '{3}'}), 'battlefield');
    const deeper = put(ctx, card('Relative deeper', ['Land'], {cost: ''}));
    const match = put(ctx, card('Relative five', ['Creature'], {cost: '{5}'}));
    const wrongType = put(ctx, card('Relative artifact', ['Artifact'], {cost: '{8}'}));
    const tooSmall = put(ctx, card('Relative two', ['Creature'], {cost: '{2}'}));
    await cast(ctx, 'Until Greater');
    assert.equal(victim.zone, 'exile'); assert.equal(match.zone, 'battlefield'); assert.equal(match.ctrl, ctx.a);
    assert.deepEqual(ids(ctx.revealed[0].cards), ids([tooSmall, wrongType, match]));
    assert.equal(deeper.zone, 'library'); assert.ok([tooSmall, wrongType].every(candidate => candidate.zone === 'library'));
  });
  test(`v8 reveal until ${role}: shared card type uses the tucked target's last battlefield definition`, async () => {
    const ctx = context(role), victim = put(ctx, card('Shared type victim', ['Artifact']), 'battlefield');
    const deeper = put(ctx, card('Shared deeper', ['Land'], {cost: ''}));
    const match = put(ctx, card('Shared artifact', ['Artifact'], {cost: '{4}'}));
    const wrongSpell = put(ctx, card('Shared instant', ['Instant'], {cost: '{4}'}));
    const wrongPermanent = put(ctx, card('Shared creature', ['Creature'], {cost: '{4}'}));
    await cast(ctx, 'Until Shared Type');
    assert.equal(victim.zone, 'library'); assert.equal(match.zone, 'battlefield'); assert.equal(match.ctrl, ctx.a);
    assert.deepEqual(ids(ctx.revealed[0].cards), ids([wrongPermanent, wrongSpell, match]));
    assert.equal(deeper.zone, 'library'); assert.ok([wrongPermanent, wrongSpell].every(candidate => candidate.zone === 'library'));
  });
}

const ids = cards => Array.from(cards, card => card.iid);

test('v8 reveal until: an absent match reveals the finite library without drawing or losing the game', async () => {
  const ctx = context(), all = pile(ctx, ['Creature', 'Instant', 'Artifact']); await cast(ctx, 'Until Basic');
  assert.deepEqual(ids(ctx.revealed[0].cards), ids(all.slice().reverse())); assert.ok(all.every(card => card.zone === 'graveyard'));
  assert.equal(ctx.a.library.length, 0); assert.equal(ctx.a.hand.length, 0); assert.equal(ctx.a.lost, false);
  const empty = context(); await cast(empty, 'Until Basic'); assert.equal(empty.a.lost, false); assert.equal(empty.a.library.length, 0);
});

test('v8 reveal until: declining the one matching permanent shuffles it with every other remaining library card', async () => {
  const ctx = context(), all = pile(ctx, ['Artifact', 'Land', 'Creature', 'Land']);
  ctx.state.option = query => query.prompt === 'Move all eligible inspected cards?' ? 'no' : 'yes';
  await cast(ctx, 'Until Optional'); assert.equal(ctx.game.battlefield.length, 0); assert.deepEqual(new Set(ctx.a.library), new Set(all));
  assert.deepEqual(ids(ctx.revealed[0].cards), ids(all.slice(-2).reverse()));
});

test('v8 reveal until: paid X uses the number of matches rather than the number of revealed cards', async () => {
  const ctx = context(), all = pile(ctx, ['Creature', 'Land', 'Creature', 'Artifact', 'Land', 'Instant']);
  await cast(ctx, 'Until X'); assert.equal(ctx.revealed[0].cards.length, 5); assert.ok([all[1], all[4]].every(card => card.zone === 'battlefield' && card.tapped));
  assert.equal(ctx.a.library.at(-1), all[0]);
  const zero = context(), untouched = pile(zero, ['Creature', 'Land']);
  const spell = put(zero, 'V8 Library Until X', 'hand'); zero.a.pool.U = 1;
  assert.equal(await zero.game.castSpell(zero.a, spell, {from: 'hand', xVal: 0}), true); await settle(zero.game);
  assert.deepEqual(ids(zero.a.library), ids(untouched)); assert.equal(zero.game.battlefield.length, 0);
  assert.ok(zero.revealed.every(event => event.cards.length === 0));
});

test('v8 reveal until: a counted X freezes the match goal before those creatures enter', async () => {
  const ctx = context(); put(ctx, card('Existing first'), 'battlefield'); put(ctx, card('Existing second'), 'battlefield');
  const all = pile(ctx, ['Creature', 'Land', 'Creature', 'Land', 'Creature', 'Land']);
  await cast(ctx, 'Until Count'); assert.equal(ctx.revealed[0].cards.length, 4); assert.equal(ctx.game.creatures(ctx.a).length, 4);
  assert.equal(all[0].zone, 'library');
});

test('v8 reveal until: each opponent runs independently in turn order, leaving the caster library untouched', async () => {
  const ctx = context(), c = ctx.game.addPlayer('C', {name: 'C'}, ctx.b.controller, true), mine = pile(ctx, ['Creature', 'Artifact']);
  const bLand = put(ctx, card('B land', ['Land']), 'library', ctx.b), bOther = put(ctx, card('B artifact', ['Artifact']), 'library', ctx.b);
  const cLand = put(ctx, card('C land', ['Land']), 'library', c); put(ctx, card('C creature'), 'library', c);
  await cast(ctx, 'Until Each'); assert.deepEqual(ids(ctx.revealed[0].cards), ids([bOther, bLand])); assert.equal(ctx.revealed[1].cards.at(-1), cLand);
  assert.equal(ctx.b.library.length, 0); assert.equal(c.library.length, 0); assert.deepEqual(ids(ctx.a.library), ids(mine));
});

test('v8 foreign library: the caster privately selects from a target opponent while preserving card ownership and untouched depth', async () => {
  const ctx = context(), mine = pile(ctx, ['Creature', 'Artifact']);
  const theirs = ['Creature', 'Land', 'Instant', 'Artifact', 'Land'].map((type, i) => put(ctx, card('Foreign card ' + i, [type]), 'library', ctx.b));
  await cast(ctx, 'Foreign Top'); const chosen = choices(ctx)[0].answer[0];
  assert.equal(chosen.zone, 'exile'); assert.equal(chosen.owner, ctx.b); assert.ok(ctx.b.exile.includes(chosen)); assert.equal(ctx.a.exile.length, 0);
  const view = ctx.trace.find(row => row.query.type === 'cardReveal'); assert.equal(view.player, ctx.a); assert.equal(view.query.private, true);
  assert.deepEqual(ids(ctx.a.library), ids(mine)); assert.equal(ctx.b.library[0], theirs[0]); assert.equal(ctx.revealed.length, 0);
});

test('v8 reveal until: an Aura with no legal host remains in the library and follows the printed remainder instruction', async () => {
  const ctx = context(), aura = put(ctx, card('Hostless Aura', ['Enchantment'], {subtypes: ['Aura'], auraTarget: [{what: 'creature', filter: (game, card) => card.is('Creature')}]}));
  const instant = put(ctx, card('Above Aura', ['Instant'])); await cast(ctx, 'Until Aura');
  assert.equal(aura.zone, 'library'); assert.equal(aura.attachedTo, null); assert.equal(ctx.game.battlefield.length, 0);
  assert.deepEqual(new Set(ctx.a.library), new Set([aura, instant]));
});

test('v8 library: a selected card that leaves and returns during its choice is a new object outside the inspected cohort', async () => {
  const ctx = context(), all = pile(ctx, ['Creature', 'Instant']); const match = all[0], version = match.zoneVersion;
  ctx.state.cards = async query => {
    if (query.prompt.startsWith('Choose inspected')) {await ctx.game.move(match, 'hand'); await ctx.game.move(match, 'library'); return [match];}
    return query.from;
  };
  await cast(ctx, 'Until Field'); assert.equal(match.zone, 'library'); assert.equal(match.zoneVersion, version + 2); assert.equal(ctx.game.battlefield.length, 0);
  assert.equal(ctx.a.library.at(-1), match);
});

for (const role of ['human', 'ai']) {
  test(`v8 library controller ${role}: a stolen creature returns to its owner's graveyard while its last controller reveals and gets the new permanent`, async () => {
    const ctx = context(role), c = ctx.game.addPlayer('C', {name: 'C'}, ctx.b.controller, true);
    const mine = pile(ctx, ['Land', 'Artifact']), ownerCard = put(ctx, card('Owner library untouched'), 'library', ctx.b);
    const victim = put(ctx, card('Stolen victim'), 'battlefield', ctx.b); victim.ctrl = c; ctx.game.recalc();
    const replacement = put(ctx, card('Last controller creature'), 'library', c), visible = put(ctx, card('Last controller instant', ['Instant']), 'library', c);
    await cast(ctx, 'Polymorph'); assert.equal(victim.zone, 'graveyard'); assert.ok(ctx.b.graveyard.includes(victim));
    assert.equal(replacement.zone, 'battlefield'); assert.equal(replacement.ctrl, c); assert.equal(replacement.owner, c);
    assert.deepEqual(ids(ctx.revealed.find(event => event.kind === 'reveal').cards), ids([visible, replacement]));
    assert.deepEqual(ids(ctx.a.library), ids(mine)); assert.deepEqual(ids(ctx.b.library), ids([ownerCard]));
  });
  test(`v8 library controller ${role}: a live target changing controllers before resolution uses the new controller's library`, async () => {
    const ctx = context(role), c = ctx.game.addPlayer('C', {name: 'C'}, ctx.b.controller, true);
    const victim = put(ctx, card('Target changes controller'), 'battlefield', ctx.b);
    const oldLibrary = put(ctx, card('Old controller library'), 'library', ctx.b), newLibrary = put(ctx, card('New controller library'), 'library', c);
    await cast(ctx, 'Transmogrify', {resolve: false}); victim.ctrl = c; ctx.game.recalc(); await settle(ctx.game);
    assert.equal(victim.zone, 'exile'); assert.ok(ctx.b.exile.includes(victim)); assert.equal(newLibrary.zone, 'battlefield'); assert.equal(newLibrary.ctrl, c);
    assert.equal(oldLibrary.zone, 'library');
  });
  test(`v8 library controller ${role}: blinking the only target before resolution makes the spell fail without revealing or moving library cards`, async () => {
    const ctx = context(role), victim = put(ctx, card('Blinking target'), 'battlefield', ctx.b);
    const mine = pile(ctx, ['Land', 'Creature']), theirs = put(ctx, card('Opponent hidden card'), 'library', ctx.b);
    const version = victim.zoneVersion, spell = await cast(ctx, 'Polymorph', {resolve: false});
    await ctx.game.move(victim, 'exile'); await ctx.game.move(victim, 'battlefield', {ctrl: ctx.a});
    const revealStart = ctx.revealed.length; await settle(ctx.game);
    assert.equal(victim.zone, 'battlefield'); assert.equal(victim.zoneVersion, version + 2); assert.equal(spell.zone, 'graveyard');
    assert.equal(ctx.revealed.length, revealStart); assert.deepEqual(ids(ctx.a.library), ids(mine)); assert.deepEqual(ids(ctx.b.library), ids([theirs]));
  });
}
