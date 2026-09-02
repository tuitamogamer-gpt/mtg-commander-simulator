import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const definitions = [
  ['Search Land', 'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.'],
  ['Search Grave', 'Search your library for a nonlegendary card, put that card into your graveyard, then shuffle.'],
  ['Search Named', 'Search your library for a card named V8 Effects Named Relic, reveal that card, put that card into your hand, then shuffle.'],
  ['Search Union', 'Search your library for up to two basic land cards and/or Gate cards, put them onto the battlefield tapped, then shuffle.'],
  ['Search Greatest', 'Search your library for up to X basic land cards, where X is the greatest power among creatures you control. Put those cards onto the battlefield tapped, then shuffle.'],
  ['Search Exile', 'Search your library for any number of land cards, exile them, then shuffle.'],
  ['Search Any Exile', 'Search your library for three cards, exile them, then shuffle.'],
  ['Draw Pain', 'You draw a card and you lose 1 life.'],
  ['Counter Untap', 'Put a +1/+1 counter on target creature you control, then untap it.'],
  ['Power Draw', 'Draw cards equal to the power of target creature you control.'],
  ['Power Life', "You gain life equal to target creature's power."],
  ['Offering', 'Destroy target artifact. You gain life equal to its mana value.'],
  ['Destroy Power', 'Destroy target creature. You gain life equal to its power.'],
  ['Each Life', 'Each player loses 1 life for each creature they control.'],
  ['Each Opponent Life', 'Each opponent loses 2 life for each creature they control.'],
  ['Each Draw', 'Each player draws a card for each creature card in their graveyard.'],
  ['Target Draw', 'Draw a card for each tapped creature target opponent controls.'],
  ['Distinct Power', 'Draw a card for each different power among creatures you control.'],
  ['Self Bite', 'Target creature deals damage to itself equal to its power.'],
  ['Return Top', 'Return target creature card from your graveyard to the top of your library.'],
  ['Return Two', 'Put two target creature cards from your graveyard on top of your library.'],
  ['Bottom Two', 'Put two target creature cards from your graveyard on the bottom of your library.'],
  ['Footbottom', 'Put any number of target creature cards from your graveyard on top of your library. Draw a card.'],
  ['Select Grave', 'Look at the top four cards of your library. Put one of them into your hand and the rest into your graveyard.'],
  ['Select Alias', 'Look at the top three cards of your library. You may put a creature card from among those cards into your hand. Put the rest on the bottom of your library in any order.'],
  ['Select Two', 'Look at the top five cards of your library. Put two of them into your hand and the rest on the bottom of your library in any order.'],
  ['Select Other', 'Look at the top three cards of your library. Put two of those cards into your hand and the other into your graveyard.'],
  ['Select Red', 'Look at the top five cards of your library. You may reveal a red card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.'],
  ['Select Domain', 'Look at the top X cards of your library, where X is the number of basic land types among lands you control. Put one of those cards into your hand and the rest on the bottom of your library in any order.'],
  ['Select Then Damage', 'Look at the top three cards of your library. Put two of them into your hand and the other into your graveyard. V8 Effects Select Then Damage deals 2 damage to you.'],
  ['Damage Then Select', 'V8 Effects Damage Then Select deals 3 damage to target creature. Look at the top five cards of your library. You may reveal a red card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.'],
  ['Select Then Token', 'Look at the top five cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order. Create a 1/1 green and white Citizen creature token.'],
  ['Select Field Exile', 'Look at the top five cards of your library. Put any number of permanent cards from among them onto the battlefield and the rest into your hand. Exile V8 Effects Select Field Exile.'],
  ['Twin Pinger', 'Lifelink\n{T}: This creature deals 2 damage to target creature an opponent controls and 3 damage to you.', 'Creature'],
  ['Sac Pinger', 'Sacrifice this creature: This creature deals 2 damage to target creature an opponent controls and 3 damage to you.', 'Creature'],
  ['Twin Target', 'V8 Effects Twin Target deals 2 damage to target creature and 3 damage to target creature.'],
  ['Twin Legal', 'V8 Effects Twin Legal deals 2 damage to target creature you control and 3 damage to target creature an opponent controls.'],
  ['Distinct Damage', 'V8 Effects Distinct Damage deals 2 damage to any target and 1 damage to any other target.'],
  ['Drain Damage', 'V8 Effects Drain Damage deals 4 damage to target creature. You gain life equal to the damage dealt this way.'],
  ['Prevent Two', 'Prevent the next 2 damage that would be dealt to target creature this turn.'],
  ['Opponent Wave', 'V8 Effects Opponent Wave deals 1 damage to each opponent and each creature and planeswalker they control.'],
  ['Self Wave', 'Each creature deals damage to itself equal to its power.'],
  ['Toughness Duel', 'Choose target creature you control and target creature an opponent controls. Each of those creatures deals damage equal to its toughness to the other.'],
  ['Prefixed Duel', 'Untap target artifact you control. Choose target creature you control and target creature an opponent controls. Each of those creatures deals damage equal to its toughness to the other.'],
  ['Life Drain', 'Each opponent loses 3 life. You gain life equal to the total life lost this way.'],
  ['Fracturing Life', 'Destroy all artifacts and enchantments. You gain 2 life for each permanent destroyed this way.'],
  ['Rebirth', 'Destroy all creatures. Create an X/X colorless Phyrexian Horror artifact creature token, where X is the number of creatures destroyed this way.'],
  ['Cost Discard Two', 'You may discard two cards. If you do, draw three cards.'],
  ['Cost Branches', "You may discard two cards. If you do, draw three cards. If you don't, you lose 2 life."],
  ['Cost Mandatory', 'Discard two cards. If you do, draw three cards.'],
  ['Cost Hand', 'You may discard your hand. If you do, draw three cards.'],
  ['Cost Alternatives', 'You may sacrifice an artifact or discard a card. If you do, draw a card.'],
  ['Cost Sacrifice Two', 'You may sacrifice two creatures. If you do, you gain 3 life.'],
  ['Cost Sacrifice Power', 'You may sacrifice a creature. If you do, draw cards equal to the power of the sacrificed creature.'],
  ['Cost Exile', 'You may exile a creature card from your graveyard. If you do, destroy target artifact.'],
  ['Cost Target Exile', 'You may exile target creature card from a graveyard. If you do, destroy target artifact.'],
  ['Cost Reflexive', 'You may sacrifice a creature. When you do, destroy target artifact.'],
  ['Cost Tap', 'You may tap an untapped non-Human creature you control. If you do, draw a card.'],
  ['Cost Return', "{T}: You may return another creature you control to its owner's hand. If you do, this creature gains indestructible until end of turn.", 'Creature'],
  ['Cost Tuck', 'You may put a card from your hand on the bottom of your library. If you do, draw a card.'],
  ['Cost Top Two', 'You may put two cards from your hand on top of your library in any order. If you do, draw a card.'],
  ['Cost Life Else', "You may pay 3 life. If you don't, you lose 5 life."],
  ['Cost Hybrid', 'You may pay {W/B}. If you do, you gain 2 life.'],
  ['Cost Remove', '{T}: You may remove a charge counter from this creature. If you do, you gain 1 life.', 'Creature'],
  ['Composition', '{T}: You gain 2 life, then draw a card and each opponent loses 1 life.', 'Creature'],
  ['Composition Pump', '{T}: Draw a card and this creature gets +2/+0 until end of turn.', 'Creature'],
  ['Source Enchantment', "{T}: Return this enchantment to its owner's hand.", 'Enchantment'],
  ['Prefix Target Cost', 'Untap target artifact you control. You may exile target creature card from a graveyard. If you do, destroy target artifact an opponent controls.'],
  ['Cost Draw', 'You may draw a card. If you do, discard a card.'],
  ['Cost Draw Life', 'You may draw a card. If you do, you gain 5 life.'],
  ['Cost Draw Count', 'You may draw a card for each creature you control. If you do, you gain 2 life.'],
  ['Cost Draw Power', 'You may draw cards equal to the power of target creature you control. If you do, you gain 2 life.'],
  ['Cost Return Stat', "When this creature enters, you may return another target creature you control to its owner's hand. If you do, you gain life equal to that creature's mana value.", 'Creature'],
  ['Cost Library Stat', "You may put target creature card from your graveyard on top of your library. If you do, V8 Effects Cost Library Stat deals damage equal to that card's power to target creature."],
  ['Cost Hand Count', 'At the beginning of your upkeep, you may discard all the cards in your hand. If you do, draw that many cards.', 'Creature'],
  ['Cost Draw Snapshot', 'Whenever this creature attacks, you may draw cards equal to its power. If you do, discard that many cards.', 'Creature'],
  ['Cost Process', "When this creature enters, you may put a card an opponent owns from exile into that player's graveyard. If you do, you gain 5 life.", 'Creature'],
  ['Cost Process Two', "When this creature enters, you may put two cards your opponents own from exile into their owners' graveyards. If you do, draw a card.", 'Creature'],
  ['Cost Process Same Owner', "When this creature enters, you may put two cards an opponent owns from exile into that player's graveyard. If you do, draw a card.", 'Creature'],
  ['Cost Counter Target', '{W}, {T}: Remove a -1/-1 counter from target creature. If you do, you gain 2 life.', 'Creature'],
  ['Cost Relative Library', 'At the beginning of your end step, you may sacrifice another creature. If you do, reveal cards from the top of your library until you reveal a nonlegendary creature card with lesser mana value, put it onto the battlefield, then put the rest on the bottom of your library in a random order.', 'Creature'],
  ['Cost X', 'You may pay {X}{G}. If you do, draw X cards.'],
  ['Cost X Bound', "You may pay {X}. If you do, draw X cards. X can't be greater than the amount of life you gained this turn."],
  ['Cost X Fixed', "You may pay {X}, where X is the number of creatures you control. If you don't, you lose X life."],
  ['Group Counter X', "{T}: Put X +1/+1 counters on each creature you control, where X is this creature's power.", 'Creature'],
  ['Group Artifact', 'Artifact creatures you control gain deathtouch until end of turn.'],
  ['Group Retained', 'Untap all creatures you control. They gain flying and double strike until end of turn.'],
  ['Group Tapped', 'Untap all tapped creatures you control. They gain flying until end of turn.'],
  ['Group Counter Follow', 'Creatures you control gain deathtouch until end of turn. Put two +1/+1 counters on each of them.'],
  ['Poison Wave', 'Each opponent gets a poison counter. Draw a card.'],
  ['Poison Target', 'Target player gets two poison counters.'],
  ['Poison Sequence', 'Target opponent loses 2 life, gets a poison counter, then mills six cards.'],
  ['Poison Offering', 'Destroy target creature with flying. Its controller gets a poison counter.'],
  ['Poison Draw Life', 'Target player draws three cards, loses 3 life, and gets three poison counters.'],
  ['Poison Trigger', 'Whenever this creature deals damage to a player, that player gets two poison counters.', 'Creature'],
  ['Poison Unblocked', "Whenever this creature attacks and isn't blocked, defending player gets a poison counter.", 'Creature'],
  ['Poison Last', 'You get ten poison counters. Draw a card.'],
  ['Oil Marker', '{T}: Exile target card from a graveyard and put an oil counter on this artifact.', 'Artifact'],
  ['Lore Draw', '{T}: Put a lore counter on this enchantment, then draw a card for each lore counter on this enchantment.', 'Enchantment'],
  ['Oil Remove', 'Remove three oil counters from target artifact.'],
  ['Count After Token', 'Create a 1/2 green Spider creature token with reach, then each opponent loses 1 life for each Spider you control.'],
  ['Comma Sequence', 'Each opponent discards a card, you draw a card, and you gain 2 life.'],
  ['Descent Marker', '{T}: Put two descent counters on this artifact. Then each player creates X Treasure tokens and this artifact deals X damage to each player, where X is the number of descent counters on this artifact.', 'Artifact'],
  ['Delay Destroy', 'Destroy target creature at the beginning of the next end step.'],
  ['Delay Blocking', '{T}: Destroy target blocking creature at end of combat.', 'Creature'],
  ['Delay Bounce', "Target creature you control gets +2/+0 until end of turn. Return that creature to its owner's hand at the beginning of your next end step."],
  ['Delay Self', 'When this creature attacks or blocks, destroy it at end of combat.', 'Creature'],
  ['Delay Event', 'Whenever this creature blocks or becomes blocked by a nonblack creature, destroy that creature at end of combat.', 'Creature'],
  ['Delay Counter', 'Whenever this creature attacks or blocks, remove a +1/+1 counter from it at end of combat.', 'Creature'],
  ['Delay Token', 'Create a 3/1 red Elemental creature token with trample and haste. Exile it at the beginning of your next end step.'],
  ['Delay Sacrifice', 'Create two 1/1 white Soldier creature tokens. Sacrifice those tokens at end of combat.'],
  ['Remove Attacker', '{0}: Remove target attacking creature you control from combat and untap it.', 'Enchantment'],
  ['Remove Blocker', 'Remove target blocking creature from combat.'],
  ['Remove Self', 'Whenever this creature becomes blocked, you may untap it and remove it from combat.', 'Creature'],
  ['Remove Event', 'Whenever a creature you control becomes blocked, you may untap that creature and remove it from combat.', 'Creature'],
  ['Freeze Target', "Target creature doesn't untap during its controller's next untap step."],
  ['Freeze Group', "Tap all nonblue creatures. Those creatures don't untap during their controllers' next untap steps."],
  ['Freeze Two', "Tap up to two target creatures. Those creatures don't untap during their controllers' next untap steps. Scry 1."],
  ['Freeze Combat', "Whenever this creature deals combat damage to a creature, tap that creature and it doesn't untap during its controller's next untap step.", 'Creature'],
  ['Modal Entry', 'When this creature enters, choose one —\n• Target opponent gets two poison counters.\n• Draw a card.\n• Put an oil counter on target artifact.', 'Creature'],
  ['Modal Condition', 'At the beginning of your upkeep, if you control an artifact, choose one —\n• Each opponent gets a poison counter.\n• Draw a card.', 'Enchantment'],
  ['Modal Combat', 'Whenever this creature deals combat damage to a player, choose one —\n• That player gets two poison counters.\n• Create a Treasure token.', 'Creature'],
  ['Modal Event', 'Whenever another Wolf you control enters, choose one —\n• Put an oil counter on that creature.\n• Untap that creature.', 'Creature'],
  ['Modal Dies', 'When this creature dies, choose one —\n• Draw cards equal to this creature\'s power.\n• Each opponent gets a poison counter.', 'Creature'],
  ['Modal Available', 'When this creature enters, choose one —\n• Put an oil counter on target artifact an opponent controls.\n• Draw a card.', 'Creature'],
  ['Modal Activation', '{1}, {T}: Choose one —\n• Put an oil counter on target artifact an opponent controls.\n• Draw a card.', 'Artifact'],
  ['Modal Sacrifice', '{1}, Sacrifice this creature: Choose one —\n• This creature deals 2 damage to target creature.\n• Destroy target artifact.', 'Creature'],
  ['Modal Only Targets', '{1}, {T}: Choose one —\n• Destroy target artifact an opponent controls.\n• Destroy target enchantment an opponent controls.', 'Creature'],
  ['Modal More', 'Choose one or more —\n• Tap target artifact.\n• Untap target artifact.\n• Draw a card.'],
  ['Attack Token', 'Create two 1/1 white Soldier creature tokens that are tapped and attacking.', 'Instant'],
  ['Attack Ready', "Create a 1/1 white Soldier creature token that's attacking.", 'Instant'],
  ['Attack Defender', "Create a 0/1 white Wall creature token with defender that's tapped and attacking.", 'Instant'],
  ['Attack Trigger', 'Whenever this creature attacks, create a tapped and attacking 1/1 white Soldier creature token.', 'Creature'],
  ['Attack Delay', "Create a 1/1 white Soldier creature token that's tapped and attacking. Exile it at end of combat.", 'Instant'],
  ['Activation Return Land', "{1}, Return a land you control to its owner's hand: Draw a card.", 'Artifact'],
  ['Activation Return Two Islands', "{U}{U}, Return two Islands you control to their owner's hand: Return target creature to its owner's hand.", 'Enchantment'],
  ['Activation Return Artifact', "{1}, Return an artifact you control to its owner's hand: Draw a card.", 'Artifact'],
  ['Activation Random One', 'Discard a card at random: This creature gets +2/+0 until end of turn.', 'Creature'],
  ['Activation Random Two', '{1}, Discard two cards at random: Put a +1/+1 counter on target creature.', 'Enchantment'],
  ['Activation Quest Cost', 'Remove three quest counters from this enchantment and sacrifice it: Draw two cards.', 'Enchantment'],
  ['Activation Pressure Cost', '{1}{R}, {T}, Remove two pressure counters from this land and sacrifice it: Create a 4/4 red Hellion creature token with haste.', 'Land'],
  ['Activation Exert Cost', '{T}, Exert this creature: Create a 1/1 white Warrior creature token with vigilance.', 'Creature'],
  ['Activation Named Exert', '{W}, {T}, Exert V8 Effects Activation Named Exert: Draw a card.', 'Creature'],
  ['Activation Exert Mana', '{T}, Exert this creature: Add two mana of any one color.', 'Creature'],
  ['Activation Storage Mana', '{T}: Put a storage counter on this land.\n{T}, Remove any number of storage counters from this land: Add {G} for each storage counter removed this way.', 'Land'],
];

function input(name, oracle, type = 'Sorcery') {
  return { name: 'V8 Effects ' + name, oracle_text: oracle, layout: 'normal', type_line: type, mana_cost: '{1}{G}' };
}
const fixtures = definitions.map(([name, oracle, type = 'Sorcery'], i) => {
  const card = input(name, oracle, type), semantic = semanticClass({ ...card, ...(type === 'Creature' ? { power: '2', toughness: '4' } : {}) }, { compilerVersion: 8 });
  assert.ok(semantic.semanticClass, `${name}: ${semantic.reason}`);
  return { position: i + 1, oracleId: 'v8-effects-' + i, scryfallId: 'v8-effects-print-' + i, ...semantic,
    raw: { name: card.name, cost: card.mana_cost, oracle, types: [type], subtypes: [], super: [], _ci: ['G'], ...(type === 'Creature' ? { power: '2', toughness: '4' } : {}) },
    catalog: { typeLine: card.type_line, commanderLegality: 'legal' } };
});
MTG.registerOracleBatch({ id: 'oracle-v8-effects-test', sequence: 9996, cards: fixtures });
MTG.initData(MTG.RAW_DATA);

function definition(name, { power = 2, toughness = 2, types = ['Creature'], kws = [], superTypes = [], subtypes = [], cost = '{1}{G}' } = {}) {
  return { name, cost, oracle: '', types, subtypes, super: superTypes, power: String(power), toughness: String(toughness), kws };
}
function put(game, player, name, zone = 'battlefield') {
  const card = new MTG.CardInst(typeof name === 'string' ? MTG.DEFS[name] : name, player);
  card.ctrl = player; card.zone = zone; card.sick = false;
  if (zone === 'battlefield') { game.battlefield.push(card); game.recalc(); }
  else player[zone].push(card);
  return card;
}
function fill(game, player, count = 12) {
  for (let i = 0; i < count; i++) put(game, player, 'Forest', 'library');
}
function context(role = 'human', playerCount = 2) {
  const state = { decline: false }, trace = [], reveals = [];
  const human = { decide: async (game, query) => {
    if (query.type === 'priority') return { kind: 'pass' };
    if (query.type === 'chooseTargets') return (state.preferredTarget && query.candidates.includes(state.preferredTarget)
      ? [state.preferredTarget, ...query.candidates.filter(card => card !== state.preferredTarget)] : query.candidates).slice(0, state.targetCount ?? (query.min || 1));
    if (query.type === 'chooseCards') return /^Order cards /.test(query.prompt || '')
      ? query.from.slice().reverse() : query.from.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseOption' && query.aiHint?.kind === 'mode' && state.mode !== undefined) return String(state.mode);
    if (query.type === 'chooseOption' && query.aiHint?.kind === 'storageManaAmount' && state.storageN !== undefined) {
      return query.options.find(option => option.n === state.storageN)?.key;
    }
    if (query.type === 'chooseMulti' && query.aiHint?.kind === 'modes') return Object.hasOwn(state, 'modes')
      ? state.modes : query.options.slice(0, query.min || 1).map(option => option.key);
    if (query.type === 'chooseOption' && query.aiHint?.kind === 'attackDestination' && state.attackDestinationPlan) {
      const target = state.attackDestinationPlan[state.attackDestinationIndex || 0];
      state.attackDestinationIndex = (state.attackDestinationIndex || 0) + 1;
      return query.options.find(option => option.target === target)?.key;
    }
    if (query.type === 'chooseOption') return state.decline
      ? query.options.find(option => ['no', 'decline'].includes(option.key))?.key ?? query.options.at(-1).key
      : query.options.find(option => option.key === 'yes')?.key ?? query.options[0].key;
    if (query.type === 'orderTriggers') return query.triggers;
    if (query.type === 'scry') return { top: query.cards, bottom: [] };
    if (query.type === 'chooseX') return state.xValue ?? query.min ?? 0;
    if (query.type === 'attackers') return state.attackers || [];
    return [];
  } };
  const game = new MTG.Game({ seed: 127030, paced: false });
  const a = game.addPlayer('A', { name: 'A' }, human, role === 'ai');
  const b = game.addPlayer('B', { name: 'B' }, human, false);
  const c = playerCount === 3 ? game.addPlayer('C', { name: 'C' }, human, false) : null;
  if (role === 'ai') a.controller = new MTG.AIController(a, { difficulty: 'hard', style: 'balanced' });
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, query) => { const answer = await decide(g, query); trace.push({ query, answer }); return answer; };
  game.turnPlayer = a; game.turnNo = 4; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {};
  game.revealToHuman = async query => { reveals.push(query); };
  game.reviewGlobalEffectWithHuman = async () => {};
  return { game, a, b, c, state, trace, reveals };
}
async function settle(game) {
  for (let i = 0; i < 80 && (game.stack.length || game.pendingTriggers.length); i++) {
    await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0);
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
}
async function cast(ctx, name, resolve = true) {
  const card = put(ctx.game, ctx.a, 'V8 Effects ' + name, 'hand');
  ctx.a.pool.G = 1; ctx.a.pool.C = 1;
  assert.equal(await ctx.game.castSpell(ctx.a, card, { from: 'hand' }), true);
  assert.equal(ctx.a.pool.G + ctx.a.pool.C, 0, 'normal cast actually pays the printed cost');
  if (resolve) await settle(ctx.game);
  return card;
}
async function activate(ctx, source, resolve = true) {
  const action = ctx.game.activatableList(ctx.a).find(row => row.card === source);
  assert.ok(action, 'the actual engine exposes the activated ability');
  assert.equal(await ctx.game.activateAbility(ctx.a, action), true);
  if (resolve) await settle(ctx.game);
}
function combat(game, attacker, defender, blocker = null) {
  attacker.attacking = defender; attacker.blockedBy = blocker ? [blocker] : []; attacker.wasBlocked = !!blocker;
  if (blocker) blocker.blocking = attacker.iid;
  game.combat = { attackers: [attacker], defenders: new Map() };
}
async function untapStep(game, player) {
  const end = Symbol('after real untap step'), emit = game.emit;
  game.emit = async function(name, data) { if (name === 'upkeep') throw end; return emit.call(this, name, data); };
  game.turnPlayer = player;
  try { await game.runTurn(); assert.fail('the real turn reaches upkeep after untapping'); }
  catch (error) { if (error !== end) throw error; }
  finally { game.emit = emit; }
}

for (const role of ['human', 'ai']) {
  test(`v8 effects ${role}: search wording selects only a basic land, shuffles, and enters tapped`, async () => {
    const ctx = context(role), { game, a } = ctx;
    const land = put(game, a, 'Forest', 'library');
    const artifact = put(game, a, 'Sol Ring', 'library');
    const nonbasic = put(game, a, definition('V8 Effects Nonbasic', { types: ['Land'], subtypes: ['Forest'] }), 'library');
    await cast(ctx, 'Search Land');
    assert.equal(land.zone, 'battlefield'); assert.equal(land.tapped, true);
    assert.equal(artifact.zone, 'library'); assert.equal(nonbasic.zone, 'library');
    assert.equal(a.library.length, 2);
    assert.equal(ctx.trace.some(row => row.query.type === 'chooseTargets'), false, 'search never becomes targeting');
    const choice = ctx.trace.find(row => row.query.search);
    assert.equal(choice.query.from.length, 1); assert.equal(choice.query.from[0], land);
  });
  test(`v8 effects ${role}: nonlegendary and named searches retain their exact filters`, async () => {
    const ctx = context(role), { game, a } = ctx;
    const ordinary = put(game, a, 'Sol Ring', 'library');
    const legendary = put(game, a, definition('V8 Effects Legend', { superTypes: ['Legendary'] }), 'library');
    await cast(ctx, 'Search Grave');
    assert.equal(ordinary.zone, 'graveyard'); assert.equal(legendary.zone, 'library');
    const named = put(game, a, definition('V8 Effects Named Relic', { types: ['Artifact'] }), 'library');
    await cast(ctx, 'Search Named');
    assert.equal(named.zone, 'hand'); assert.equal(legendary.zone, 'library');
  });
  test(`v8 effects ${role}: a filtered search can fail to find without inventing a card`, async () => {
    const ctx = context(role); put(ctx.game, ctx.a, 'Sol Ring', 'library');
    await cast(ctx, 'Search Land');
    assert.equal(ctx.game.bf().length, 0); assert.equal(ctx.a.library.length, 1);
  });
  test(`v8 effects ${role}: search unions retain both qualities and exclude an unrelated nonbasic land`, async () => {
    const ctx = context(role), { game, a } = ctx;
    const basic = put(game, a, 'Forest', 'library');
    const gate = put(game, a, definition('V8 Effects Gate', { types: ['Land'], subtypes: ['Gate'], cost: '' }), 'library');
    const other = put(game, a, definition('V8 Effects Other Land', { types: ['Land'], cost: '' }), 'library');
    await cast(ctx, 'Search Union');
    assert.equal(basic.zone, 'battlefield'); assert.equal(gate.zone, 'battlefield');
    assert.equal(basic.tapped, true); assert.equal(gate.tapped, true); assert.equal(other.zone, 'library');
  });
  test(`v8 effects ${role}: search X uses the greatest current friendly power`, async () => {
    const ctx = context(role), { game, a, b } = ctx; fill(game, a, 6);
    const host = put(game, a, 'Grizzly Bears'); put(game, b, definition('V8 Effects Foreign Giant', { power: 9, toughness: 9 }));
    await cast(ctx, 'Search Greatest', false); MTG.E.pumpUntilEOT(game, host, 3, 0); await settle(game);
    assert.equal(game.bf().filter(card => card.ctrl === a && card.is('Land')).length, 5);
    assert.equal(a.library.length, 1); assert.ok(game.bf().filter(card => card.is('Land')).every(card => card.tapped));
  });
  test(`v8 effects ${role}: a dynamic search with no friendly creature searches for zero`, async () => {
    const ctx = context(role); fill(ctx.game, ctx.a, 3); put(ctx.game, ctx.b, 'Grizzly Bears');
    await cast(ctx, 'Search Greatest');
    assert.equal(ctx.a.library.length, 3); assert.equal(ctx.game.bf().filter(card => card.is('Land')).length, 0);
  });
  test(`v8 effects ${role}: filtered and unrestricted exile searches keep their respective selection counts`, async () => {
    const ctx = context(role), { game, a } = ctx; fill(game, a, 3);
    const nonland = put(game, a, 'Grizzly Bears', 'library');
    await cast(ctx, 'Search Exile');
    assert.equal(a.exile.length, 3); assert.equal(nonland.zone, 'library'); assert.equal(a.library.length, 1);
    const firstSearch = ctx.trace.find(row => row.query.search); assert.equal(firstSearch.query.min, 0);
    fill(game, a, 3); await cast(ctx, 'Search Any Exile');
    assert.equal(a.exile.length, 6); assert.equal(a.library.length, 1);
    const untypedSearch = ctx.trace.filter(row => row.query.search).at(-1); assert.equal(untypedSearch.query.min, 3);
  });
  test(`v8 effects ${role}: repeated subjects preserve draw then life loss`, async () => {
    const ctx = context(role); fill(ctx.game, ctx.a);
    const life = ctx.a.life; await cast(ctx, 'Draw Pain');
    assert.equal(ctx.a.hand.length, 1); assert.equal(ctx.a.library.length, 11); assert.equal(ctx.a.life, life - 1);
  });
  test(`v8 effects ${role}: joined instructions keep the same target and written order`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const creature = put(game, a, 'Grizzly Bears'), opponent = put(game, b, 'Grizzly Bears');
    creature.tapped = true; opponent.tapped = true;
    const originalUntap = game.untap.bind(game), observed = [];
    game.untap = card => { observed.push({ card, counters: card.counters['+1/+1'] || 0 }); return originalUntap(card); };
    await cast(ctx, 'Counter Untap');
    assert.equal(creature.counters['+1/+1'], 1); assert.equal(creature.tapped, false);
    assert.equal(opponent.counters['+1/+1'] || 0, 0); assert.equal(opponent.tapped, true);
    assert.deepEqual(observed, [{ card: creature, counters: 1 }]);
  });
  test(`v8 effects ${role}: target power is evaluated at resolution, not when the spell is cast`, async () => {
    const ctx = context(role), host = put(ctx.game, ctx.a, 'Grizzly Bears'); fill(ctx.game, ctx.a);
    await cast(ctx, 'Power Draw', false);
    MTG.E.pumpUntilEOT(ctx.game, host, 3, 0);
    await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 5); assert.equal(ctx.a.library.length, 7);
  });
  test(`v8 effects ${role}: target characteristic effects fizzle after the target changes zones`, async () => {
    const ctx = context(role), host = put(ctx.game, ctx.a, 'Grizzly Bears'); fill(ctx.game, ctx.a);
    await cast(ctx, 'Power Draw', false);
    await ctx.game.move(host, 'exile'); await ctx.game.move(host, 'battlefield', { ctrl: ctx.a });
    await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 0); assert.equal(ctx.a.library.length, 12);
  });
  test(`v8 effects ${role}: negative power does not become life loss`, async () => {
    const ctx = context(role), host = put(ctx.game, ctx.a, 'Grizzly Bears');
    MTG.E.pumpUntilEOT(ctx.game, host, -4, 0);
    const before = ctx.a.life; await cast(ctx, 'Power Life'); assert.equal(ctx.a.life, before);
  });
  test(`v8 effects ${role}: Offering uses the copied artifact's last battlefield mana value`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const model = put(game, b, definition('V8 Effects Six Mana Relic', { types: ['Artifact'], cost: '{6}' }));
    const copy = put(game, a, 'Sculpting Steel', 'hand'); a.pool.C = 3;
    assert.equal(await game.castSpell(a, copy, { from: 'hand' }), true); await settle(game);
    assert.equal(copy.mv, 6); assert.equal(copy.zone, 'battlefield'); assert.equal(a.pool.C, 0);
    await game.move(model, 'hand');
    const before = a.life; await cast(ctx, 'Offering');
    assert.equal(copy.zone, 'graveyard'); assert.equal(copy.mv, 3, 'the copy reverts after leaving the battlefield');
    assert.equal(a.life, before + 6, 'life gain uses the former copied value, not its graveyard value');
    assert.equal(model.zone, 'hand');
  });
  test(`v8 effects ${role}: removal followed by a target statistic preserves LKI and fizzles for a new object`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const host = put(game, b, 'Grizzly Bears'); MTG.E.pumpUntilEOT(game, host, 5, 0);
    const before = a.life; await cast(ctx, 'Destroy Power');
    assert.equal(host.zone, 'graveyard'); assert.equal(host.power, 2); assert.equal(a.life, before + 7);
    await game.move(host, 'battlefield', { ctrl: b });
    await cast(ctx, 'Destroy Power', false);
    await game.move(host, 'exile'); await game.move(host, 'battlefield', { ctrl: b });
    await settle(game);
    assert.equal(host.zone, 'battlefield'); assert.equal(a.life, before + 7);
  });
  test(`v8 effects ${role}: each-player counts use three separate uneven battlefields`, async () => {
    const ctx = context(role, 3), { game, a, b, c } = ctx;
    for (let i = 0; i < 2; i++) put(game, a, 'Grizzly Bears');
    for (let i = 0; i < 3; i++) put(game, c, 'Grizzly Bears');
    put(game, b, 'Sol Ring');
    await cast(ctx, 'Each Life');
    assert.deepEqual([a.life, b.life, c.life], [38, 40, 37]);
    put(game, b, 'Grizzly Bears'); await cast(ctx, 'Each Opponent Life');
    assert.deepEqual([a.life, b.life, c.life], [38, 38, 31], 'opponent counts exclude the caster and preserve the multiplier');
  });
  test(`v8 effects ${role}: each player's graveyard determines their own draw count`, async () => {
    const ctx = context(role, 3), { game, a, b, c } = ctx;
    for (const player of [a, b, c]) fill(game, player, 6);
    put(game, a, 'Grizzly Bears', 'graveyard');
    for (let i = 0; i < 3; i++) put(game, b, 'Grizzly Bears', 'graveyard');
    put(game, c, 'Sol Ring', 'graveyard');
    await cast(ctx, 'Each Draw');
    assert.deepEqual([a.hand.length, b.hand.length, c.hand.length], [1, 3, 0]);
    assert.deepEqual([a.library.length, b.library.length, c.library.length], [5, 3, 6]);
  });
  test(`v8 effects ${role}: target-player counts use that player's current tapped creatures`, async () => {
    const ctx = context(role), { game, a, b } = ctx; fill(game, a);
    for (let i = 0; i < 5; i++) put(game, a, 'Grizzly Bears').tapped = true;
    const enemy = Array.from({ length: 4 }, () => put(game, b, 'Grizzly Bears'));
    enemy[0].tapped = true; enemy[1].tapped = true;
    put(game, b, 'Sol Ring').tapped = true;
    await cast(ctx, 'Target Draw', false); enemy[2].tapped = true; await settle(game);
    assert.equal(a.hand.length, 3); assert.equal(a.library.length, 9);
    const selected = ctx.trace.find(row => row.query.type === 'chooseTargets');
    assert.equal(selected.answer[0], b, 'only a targeted opponent supplies this count');
  });
  test(`v8 effects ${role}: distinct powers count values, including zero and negative, only once`, async () => {
    const ctx = context(role), { game, a, b } = ctx; fill(game, a);
    for (const [i, power] of [2, 2, 0, -1].entries()) put(game, a, definition('V8 Effects Power ' + i, { power, toughness: 3 }));
    put(game, b, definition('V8 Effects Foreign Power', { power: 7, toughness: 7 }));
    await cast(ctx, 'Distinct Power');
    assert.equal(a.hand.length, 3); assert.equal(a.library.length, 9);
  });
  test(`v8 effects ${role}: self damage uses the selected creature's controller and keywords`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const victim = put(game, b, definition('V8 Effects Lifetouch', { power: 1, toughness: 7, kws: ['lifelink', 'deathtouch'] }));
    const lifeA = a.life, lifeB = b.life;
    await cast(ctx, 'Self Bite');
    assert.equal(victim.zone, 'graveyard', 'its own deathtouch makes its self damage lethal');
    assert.equal(a.life, lifeA); assert.equal(b.life, lifeB + 1, 'lifelink belongs to the damage source controller');
  });
  test(`v8 effects ${role}: self damage respects indestructible and stale object identity`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const victim = put(game, b, definition('V8 Effects Indestructible', { power: 4, toughness: 4, kws: ['indestructible'] }));
    await cast(ctx, 'Self Bite'); assert.equal(victim.zone, 'battlefield');
    const marked = victim.damage;
    await cast(ctx, 'Self Bite', false);
    await game.move(victim, 'exile'); await game.move(victim, 'battlefield', { ctrl: b });
    await settle(game);
    assert.equal(victim.zone, 'battlefield'); assert.equal(victim.damage || 0, 0); assert.ok(marked > 0);
    assert.equal(a.life, 40);
  });
  test(`v8 effects ${role}: returning a graveyard card to library top retains identity`, async () => {
    const ctx = context(role), { game, a, b } = ctx; fill(game, a, 3);
    const wanted = put(game, a, 'Grizzly Bears', 'graveyard'), enemy = put(game, b, 'Grizzly Bears', 'graveyard');
    await cast(ctx, 'Return Top');
    assert.equal(a.library.at(-1), wanted); assert.equal(wanted.zone, 'library'); assert.equal(enemy.zone, 'graveyard');
  });
  for (const position of ['top', 'bottom']) test(`v8 effects ${role}: multiple cards receive a separate ${position} library order`, async () => {
    const ctx = context(role), { game, a, b } = ctx; fill(game, a, 3);
    const cards = [put(game, a, 'Grizzly Bears', 'graveyard'), put(game, a, definition('V8 Effects Order Creature', { power: 5 }), 'graveyard')];
    const foreign = put(game, b, 'Grizzly Bears', 'graveyard');
    await cast(ctx, position === 'top' ? 'Return Two' : 'Bottom Two');
    const order = ctx.trace.find(row => /^Order cards /.test(row.query.prompt || ''));
    assert.ok(order, 'the owner orders on resolution after selecting targets');
    assert.equal(order.query.min, 2); assert.equal(order.query.max, 2);
    assert.deepEqual(Array.from(order.answer, card => card.iid).sort(), cards.map(card => card.iid).sort());
    const placed = position === 'top' ? a.library.slice(-2) : a.library.slice(0, 2);
    assert.deepEqual(Array.from(placed).reverse().map(card => card.iid), Array.from(order.answer, card => card.iid));
    assert.equal(foreign.zone, 'graveyard'); assert.equal(a.library.length, 5);
    if (role === 'human') {
      const chosen = ctx.trace.find(row => row.query.type === 'chooseTargets');
      assert.notDeepEqual(Array.from(chosen.answer, card => card.iid), Array.from(order.answer, card => card.iid), 'target order does not silently determine library order');
    }
  });
  test(`v8 effects ${role}: partial stale targets move only the original legal graveyard object`, async () => {
    const ctx = context(role), { game, a } = ctx; fill(game, a, 3);
    const first = put(game, a, 'Grizzly Bears', 'graveyard'), second = put(game, a, 'Grizzly Bears', 'graveyard');
    await cast(ctx, 'Return Two', false);
    await game.move(first, 'exile'); await game.move(first, 'graveyard'); await settle(game);
    assert.equal(first.zone, 'graveyard'); assert.equal(second.zone, 'library'); assert.equal(a.library.at(-1), second);
    assert.equal(ctx.trace.some(row => /^Order cards /.test(row.query.prompt || '')), false, 'one surviving legal target requires no order prompt');
  });
  test(`v8 effects ${role}: a mandatory pair cannot be cast with only one legal target`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    put(game, a, 'Grizzly Bears', 'graveyard'); put(game, b, 'Grizzly Bears', 'graveyard');
    const spell = put(game, a, 'V8 Effects Return Two', 'hand'); a.pool.G = 1; a.pool.C = 1;
    assert.equal(await game.castSpell(a, spell, { from: 'hand' }), false);
    assert.equal(spell.zone, 'hand'); assert.equal(a.pool.G + a.pool.C, 2); assert.equal(game.stack.length, 0);
  });
  test(`v8 effects ${role}: library selection moves exactly the inspected cards`, async () => {
    const ctx = context(role), { game, a } = ctx; fill(game, a, 2);
    const top = Array.from({ length: 4 }, (_, i) => put(game, a, definition('V8 Effects Look ' + i), 'library'));
    await cast(ctx, 'Select Grave');
    assert.equal(top.filter(card => card.zone === 'hand').length, 1);
    assert.equal(top.filter(card => card.zone === 'graveyard').length, 3);
    assert.equal(a.library.length, 2);
    const selected = put(game, a, 'Grizzly Bears', 'library');
    await cast(ctx, 'Select Alias');
    assert.equal(selected.zone, 'hand'); assert.equal(a.library.length, 2);
  });
  test(`v8 effects ${role}: a multiple-card library selection preserves exact choice and rest counts`, async () => {
    const ctx = context(role), { game, a } = ctx; fill(game, a, 7);
    await cast(ctx, 'Select Two'); assert.equal(a.hand.length, 2); assert.equal(a.library.length, 5);
    const first = ctx.trace.find(row => row.query.type === 'chooseCards');
    assert.equal(first.query.from.length, 5); assert.equal(first.query.min, 2); assert.equal(first.query.max, 2);
    await cast(ctx, 'Select Other'); assert.equal(a.hand.length, 4); assert.equal(a.library.length, 2);
    assert.equal(a.graveyard.filter(card => card.name === 'Forest').length, 1);
  });
  test(`v8 effects ${role}: a colored selection reveals only the chosen matching card`, async () => {
    const ctx = context(role), { game, a } = ctx; fill(game, a, 4);
    const red = put(game, a, definition('V8 Effects Red Relic', { types: ['Artifact'], cost: '{R}' }), 'library');
    await cast(ctx, 'Select Red');
    assert.equal(red.zone, 'hand'); assert.equal(a.library.length, 4);
    const choice = ctx.trace.find(row => row.query.type === 'chooseCards');
    assert.equal(choice.query.from.length, 1); assert.equal(choice.query.from[0], red);
    assert.equal(ctx.reveals.length, 1); assert.equal(ctx.reveals[0].cards.length, 1); assert.equal(ctx.reveals[0].cards[0], red);
  });
  test(`v8 effects ${role}: a middle-sentence X definition counts distinct basic land types`, async () => {
    const ctx = context(role), { game, a, b } = ctx; fill(game, a, 6);
    put(game, a, 'Forest'); put(game, a, definition('V8 Effects Dual', { types: ['Land'], subtypes: ['Forest', 'Island'], cost: '' }));
    put(game, b, 'Swamp'); await cast(ctx, 'Select Domain');
    const choice = ctx.trace.find(row => row.query.type === 'chooseCards');
    assert.equal(choice.query.from.length, 2); assert.equal(a.hand.length, 1); assert.equal(a.library.length, 5);
  });
  test(`v8 effects ${role}: a complete library block can be followed by damage or token creation`, async () => {
    const ctx = context(role), { game, a } = ctx; fill(game, a, 6);
    await cast(ctx, 'Select Then Damage');
    assert.equal(a.hand.length, 2); assert.equal(a.library.length, 3); assert.equal(a.life, 38);
    const creature = put(game, a, 'Grizzly Bears', 'library'); await cast(ctx, 'Select Then Token');
    assert.equal(creature.zone, 'hand'); assert.equal(a.library.length, 3);
    const tokens = game.bf().filter(card => card.isToken);
    assert.equal(tokens.length, 1); assert.ok(tokens[0].hasSub('Citizen'));
    assert.deepEqual([tokens[0].power, tokens[0].toughness], [1, 1]);
    assert.deepEqual(Array.from(tokens[0].colors).sort(), ['G', 'W']);
  });
  test(`v8 effects ${role}: targeted damage followed by a full library block shares cast legality`, async () => {
    const ctx = context(role), { game, a, b } = ctx; fill(game, a, 4);
    const red = put(game, a, definition('V8 Effects Followup Red', { cost: '{R}' }), 'library');
    const target = put(game, b, definition('V8 Effects Four Toughness', { toughness: 4 }));
    await cast(ctx, 'Damage Then Select');
    assert.equal(target.damage, 3); assert.equal(red.zone, 'hand'); assert.equal(a.library.length, 4);
    await game.move(red, 'library'); await cast(ctx, 'Damage Then Select', false);
    await game.move(target, 'exile'); await game.move(target, 'battlefield', { ctrl: b }); await settle(game);
    assert.equal(target.damage, 0); assert.equal(red.zone, 'library'); assert.equal(a.library.length, 5);
  });
  test(`v8 effects ${role}: a full permanent-selection block preserves subsequent self-exile`, async () => {
    const ctx = context(role), { game, a } = ctx; fill(game, a, 6);
    const instant = put(game, a, definition('V8 Effects Nonpermanent', { types: ['Instant'], cost: '{R}' }), 'library');
    const spell = await cast(ctx, 'Select Field Exile');
    assert.equal(spell.zone, 'exile'); assert.equal(instant.zone, 'hand');
    assert.equal(game.bf().filter(card => card.is('Land')).length, 4); assert.equal(a.library.length, 2);
  });
  test(`v8 effects ${role}: one damage instruction causes one lifelink gain event and no premature player loss`, async () => {
    const ctx = context(role), { game, a, b } = ctx; a.life = 2;
    const source = put(game, a, 'V8 Effects Twin Pinger'), pridemate = put(game, a, "Ajani's Pridemate");
    const victim = put(game, b, definition('V8 Effects Batch Victim', { toughness: 7 }));
    await activate(ctx, source);
    assert.equal(source.tapped, true); assert.equal(victim.damage, 2);
    assert.equal(a.life, 4); assert.equal(a.lost, false);
    assert.equal(pridemate.counters['+1/+1'], 1, 'simultaneous damage from one lifelink source triggers Pridemate once');
  });
  test(`v8 effects ${role}: a sacrificed damage source retains its last-known granted lifelink`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const source = put(game, a, 'V8 Effects Sac Pinger'), victim = put(game, b, definition('V8 Effects Sac Victim', { toughness: 7 }));
    MTG.E.pumpUntilEOT(game, source, 0, 0, ['lifelink']);
    await activate(ctx, source, false); assert.equal(source.zone, 'graveyard'); assert.equal(source.kw('lifelink'), false);
    await settle(game); assert.equal(victim.damage, 2); assert.equal(a.life, 42);
  });
  test(`v8 effects ${role}: two target clauses can choose the same creature and consume only one shield event`, async () => {
    const ctx = context(role), { game, b } = ctx;
    const victim = put(game, b, definition('V8 Effects Shield Victim', { toughness: 8 })); game.addCounters(victim, 'shield', 1);
    await cast(ctx, 'Twin Target');
    assert.equal(victim.zone, 'battlefield'); assert.equal(victim.damage, 0); assert.equal(victim.counters.shield || 0, 0);
    const selections = ctx.trace.filter(row => row.query.type === 'chooseTargets');
    assert.equal(selections.length, 2); assert.equal(selections[0].answer[0], victim); assert.equal(selections[1].answer[0], victim);
  });
  test(`v8 effects ${role}: a partly illegal damage batch still damages its remaining legal target`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const first = put(game, a, definition('V8 Effects Friendly Batch', { toughness: 8 })), second = put(game, b, definition('V8 Effects Enemy Batch', { toughness: 8 }));
    await cast(ctx, 'Twin Legal', false); await game.move(first, 'exile'); await game.move(first, 'battlefield', { ctrl: a }); await settle(game);
    assert.equal(first.damage, 0); assert.equal(second.damage, 3);
  });
  test(`v8 effects ${role}: any other target is distinct from the first target`, async () => {
    const ctx = context(role); await cast(ctx, 'Distinct Damage');
    const selections = ctx.trace.filter(row => row.query.type === 'chooseTargets');
    assert.equal(selections.length, 2); assert.notEqual(selections[0].answer[0], selections[1].answer[0]);
    assert.deepEqual([ctx.a.life, ctx.b.life].sort(), [38, 39]);
  });
  test(`v8 effects ${role}: gain from damage uses actual damage after partial and total prevention`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const victim = put(game, b, definition('V8 Effects Prevented Victim', { toughness: 8 }));
    await cast(ctx, 'Prevent Two'); await cast(ctx, 'Drain Damage');
    assert.equal(victim.damage, 2); assert.equal(a.life, 42);
    game.addCounters(victim, 'shield', 1); await cast(ctx, 'Drain Damage');
    assert.equal(victim.damage, 2); assert.equal(a.life, 42, 'fully prevented damage gives no life');
    await cast(ctx, 'Drain Damage', false); await game.move(victim, 'exile'); await game.move(victim, 'battlefield', { ctrl: b }); await settle(game);
    assert.equal(victim.damage, 0); assert.equal(a.life, 42, 'an illegal target cannot reuse prior damage amounts');
  });
  test(`v8 effects ${role}: opponent waves include opposing players, creatures, and planeswalkers only`, async () => {
    const ctx = context(role, 3), { game, a, b, c } = ctx;
    const friendly = put(game, a, definition('V8 Effects Friendly Wave', { toughness: 5 }));
    const enemy = put(game, b, definition('V8 Effects Enemy Wave', { toughness: 5 }));
    const walker = put(game, c, definition('V8 Effects Walker', { types: ['Planeswalker'] })); walker.counters.loyalty = 4;
    const artifact = put(game, c, 'Sol Ring'); await cast(ctx, 'Opponent Wave');
    assert.deepEqual([a.life, b.life, c.life], [40, 39, 39]);
    assert.equal(friendly.damage, 0); assert.equal(enemy.damage, 1); assert.equal(walker.counters.loyalty, 3);
    assert.equal(artifact.damage || 0, 0); assert.equal(artifact.zone, 'battlefield');
  });
  test(`v8 effects ${role}: global self damage uses every creature's own source and keywords`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const first = put(game, a, definition('V8 Effects First Lifelink', { power: 2, toughness: 7, kws: ['lifelink'] }));
    const second = put(game, a, definition('V8 Effects Second Lifelink', { power: 3, toughness: 7, kws: ['lifelink'] }));
    const touch = put(game, b, definition('V8 Effects Self Touch', { power: 1, toughness: 8, kws: ['deathtouch'] }));
    const durable = put(game, b, definition('V8 Effects Self Durable', { power: 4, toughness: 4, kws: ['indestructible'] }));
    const gain = game.gainLife.bind(game), lifeEvents = [];
    game.gainLife = async (player, n, source) => { if (n > 0) lifeEvents.push({ player, n, source }); return gain(player, n, source); };
    await cast(ctx, 'Self Wave');
    assert.deepEqual([first.damage, second.damage, durable.damage], [2, 3, 4]); assert.equal(touch.zone, 'graveyard');
    assert.equal(durable.zone, 'battlefield'); assert.equal(a.life, 45); assert.equal(b.life, 40);
    assert.equal(lifeEvents.length, 2, 'different lifelink sources produce two gain events');
    assert.deepEqual(lifeEvents.map(event => event.n).sort(), [2, 3]);
  });
  test(`v8 effects ${role}: both toughness damage amounts are fixed before wither changes either creature`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const first = put(game, a, definition('V8 Effects Wither Duelist', { power: 1, toughness: 5, kws: ['wither', 'lifelink'] }));
    const second = put(game, b, definition('V8 Effects Other Duelist', { power: 1, toughness: 6 }));
    await cast(ctx, 'Toughness Duel');
    assert.equal(first.zone, 'graveyard', 'it receives the opposing original six toughness, not the reduced one');
    assert.equal(second.zone, 'battlefield'); assert.equal(second.counters['-1/-1'], 5); assert.equal(second.toughness, 1);
    assert.equal(a.life, 45);
  });
}

test('v8 effects actual local AI aims self damage at an opposing creature', async () => {
  const ctx = context('ai');
  const own = put(ctx.game, ctx.a, 'Grizzly Bears'), enemy = put(ctx.game, ctx.b, definition('V8 Effects Enemy', { power: 5, toughness: 5 }));
  await cast(ctx, 'Self Bite');
  assert.equal(enemy.zone, 'graveyard'); assert.equal(own.zone, 'battlefield');
  assert.ok(ctx.a.controller instanceof MTG.AIController);
});

test('v8 effects human: any-number movement can choose zero and still draw a card', async () => {
  const ctx = context('human'); fill(ctx.game, ctx.a, 3); ctx.state.targetCount = 0;
  const ignored = put(ctx.game, ctx.a, 'Grizzly Bears', 'graveyard');
  await cast(ctx, 'Footbottom');
  assert.equal(ignored.zone, 'graveyard'); assert.equal(ctx.a.hand.length, 1); assert.equal(ctx.a.library.length, 2);
});

for (const role of ['human', 'ai']) {
  test(`v8 effects ${role}: a target prefix remaps every batch source, recipient and characteristic`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const relic = put(game, a, 'Sol Ring'); relic.tapped = true;
    const own = put(game, a, definition('V8 Offset Own', { toughness: 4 }));
    const enemy = put(game, b, definition('V8 Offset Enemy', { toughness: 6 }));
    await cast(ctx, 'Prefixed Duel');
    assert.equal(relic.tapped, false); assert.equal(relic.damage, 0);
    assert.equal(own.zone, 'graveyard'); assert.equal(enemy.zone, 'battlefield'); assert.equal(enemy.damage, 4);
  });
  test(`v8 effects ${role}: life-lost aggregates every opponent and is reset for the next instruction`, async () => {
    const ctx = context(role, 3), { a, b, c } = ctx;
    b.life = 11; c.life = 23;
    await cast(ctx, 'Life Drain');
    assert.equal(a.life, 46); assert.equal(b.life, 8); assert.equal(c.life, 20);
    await cast(ctx, 'Life Drain');
    assert.equal(a.life, 52); assert.equal(b.life, 5); assert.equal(c.life, 17);
  });
  test(`v8 effects ${role}: destroyed-count excludes prevention and counts an artifact enchantment once`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const ordinary = put(game, b, 'Sol Ring');
    const overlap = put(game, b, definition('V8 Artifact Enchantment', { types: ['Artifact', 'Enchantment'] }));
    const indestructible = put(game, b, definition('V8 Indestructible Artifact', { types: ['Artifact'], kws: ['indestructible'] }));
    const shielded = put(game, b, definition('V8 Shielded Enchantment', { types: ['Enchantment'] }));
    game.addCounters(shielded, 'shield', 1);
    const regenerated = put(game, b, definition('V8 Regenerated Artifact', { types: ['Artifact', 'Creature'] })); regenerated.regenShield = 1;
    await cast(ctx, 'Fracturing Life');
    assert.equal(ordinary.zone, 'graveyard'); assert.equal(overlap.zone, 'graveyard');
    assert.equal(indestructible.zone, 'battlefield'); assert.equal(shielded.zone, 'battlefield'); assert.equal(regenerated.zone, 'battlefield');
    assert.equal(shielded.counters.shield || 0, 0); assert.equal(regenerated.regenShield, 0); assert.equal(a.life, 44);
  });
  test(`v8 effects ${role}: a rebirth token uses the count of successfully destroyed creatures`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const first = put(game, a, 'Grizzly Bears'), second = put(game, b, 'Grizzly Bears');
    const survivor = put(game, b, definition('V8 Rebirth Survivor', { kws: ['indestructible'] }));
    await cast(ctx, 'Rebirth');
    const token = game.bf().find(card => card.isToken && card.hasSub('Horror'));
    assert.equal(first.zone, 'graveyard'); assert.equal(second.zone, 'graveyard'); assert.equal(survivor.zone, 'battlefield');
    assert.ok(token); assert.equal(token.power, 2); assert.equal(token.toughness, 2); assert.equal(token.ctrl, a);
  });
  test(`v8 resolution ${role}: two-card payment is exact and the payoff follows both discards`, async () => {
    const ctx = context(role), { game, a } = ctx; fill(game, a);
    const cards = [put(game, a, 'Forest', 'hand'), put(game, a, 'Forest', 'hand')];
    await cast(ctx, 'Cost Discard Two');
    assert.ok(cards.every(card => card.zone === 'graveyard')); assert.equal(a.turnState.discardedN, 2); assert.equal(a.hand.length, 3);
    const choice = ctx.trace.find(row => row.query.type === 'chooseCards' && row.query.prompt.includes('discard'));
    assert.equal(choice.query.min, 2); assert.equal(choice.query.max, 2);
  });
  test(`v8 resolution ${role}: an insufficient payment cannot discard part of the cost`, async () => {
    const ctx = context(role), { game, a } = ctx; fill(game, a);
    const card = put(game, a, 'Forest', 'hand');
    await cast(ctx, 'Cost Branches');
    assert.equal(card.zone, 'hand'); assert.equal(a.hand.length, 1); assert.equal(a.life, 38);
    assert.equal(a.turnState.discardedN || 0, 0); assert.equal(ctx.trace.some(row => row.query.type === 'chooseCards'), false);
  });
  test(`v8 resolution ${role}: discarding the whole hand can pay a zero-card cost`, async () => {
    const ctx = context(role); fill(ctx.game, ctx.a);
    await cast(ctx, 'Cost Hand');
    assert.equal(ctx.a.hand.length, 3); assert.equal(ctx.a.turnState.discardedN || 0, 0);
    const before = ctx.a.hand.slice();
    await cast(ctx, 'Cost Hand');
    assert.ok(before.every(card => card.zone === 'graveyard')); assert.equal(ctx.a.hand.length, 3); assert.equal(ctx.a.turnState.discardedN, 3);
  });
  test(`v8 resolution ${role}: only payable alternatives are offered and only one is paid`, async () => {
    for (const kind of ['sacrifice', 'discard']) {
      const ctx = context(role), { game, a } = ctx; fill(game, a);
      const payment = kind === 'sacrifice' ? put(game, a, 'Sol Ring') : put(game, a, 'Forest', 'hand');
      await cast(ctx, 'Cost Alternatives');
      assert.equal(payment.zone, 'graveyard'); assert.equal(a.hand.length, 1);
      assert.equal(a.turnState.discardedN || 0, kind === 'discard' ? 1 : 0);
      const options = ctx.trace.find(row => row.query.aiHint?.kind === 'oracleUnlessPayment').query.options;
      assert.equal(options.length, 2); assert.equal(options.filter(option => option.payment).length, 1);
    }
  });
  test(`v8 resolution ${role}: sacrifice pays with controlled creatures despite indestructible`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const own = put(game, a, 'Grizzly Bears'), tough = put(game, a, definition('V8 Sacrifice Indestructible', { kws: ['indestructible'] }));
    const enemy = put(game, b, 'Grizzly Bears'), artifact = put(game, a, 'Sol Ring');
    await cast(ctx, 'Cost Sacrifice Two');
    assert.equal(own.zone, 'graveyard'); assert.equal(tough.zone, 'graveyard'); assert.equal(enemy.zone, 'battlefield'); assert.equal(artifact.zone, 'battlefield');
    assert.equal(a.life, 43);
    const choice = ctx.trace.find(row => row.query.type === 'chooseCards'); assert.equal(choice.query.min, 2); assert.equal(choice.query.max, 2);
  });
  test(`v8 resolution ${role}: the sacrificed characteristic is captured before it changes zones`, async () => {
    const ctx = context(role), { game, a } = ctx; fill(game, a);
    const creature = put(game, a, 'Grizzly Bears'); MTG.E.pumpUntilEOT(game, creature, 5, 0);
    await cast(ctx, 'Cost Sacrifice Power');
    assert.equal(creature.zone, 'graveyard'); assert.equal(creature.power, 2); assert.equal(a.hand.length, 7);
  });
  test(`v8 resolution ${role}: If-you-do targets are selected with the spell before the graveyard payment`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const creature = put(game, a, 'Grizzly Bears', 'graveyard'), noncreature = put(game, a, 'Forest', 'graveyard'), artifact = put(game, b, 'Sol Ring');
    await cast(ctx, 'Cost Exile', false);
    assert.equal(creature.zone, 'graveyard'); assert.ok(ctx.trace.some(row => row.query.type === 'chooseTargets'));
    assert.equal(ctx.trace.some(row => row.query.type === 'chooseCards'), false);
    await settle(game);
    assert.equal(creature.zone, 'exile'); assert.equal(noncreature.zone, 'graveyard'); assert.equal(artifact.zone, 'graveyard');
  });
  test(`v8 resolution ${role}: a reflexive When-you-do target is chosen after payment`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const creature = put(game, a, 'Grizzly Bears'), artifact = put(game, b, 'Sol Ring');
    await cast(ctx, 'Cost Reflexive', false);
    assert.equal(ctx.trace.some(row => row.query.type === 'chooseTargets'), false);
    await settle(game);
    assert.equal(creature.zone, 'graveyard'); assert.equal(artifact.zone, 'graveyard');
    const costIndex = ctx.trace.findIndex(row => row.query.type === 'chooseCards'), targetIndex = ctx.trace.findIndex(row => row.query.type === 'chooseTargets');
    assert.ok(costIndex >= 0 && targetIndex > costIndex);
  });
  test(`v8 resolution ${role}: explicit payment targets retain their original indices`, async () => {
    const ctx = context(role), { game, b } = ctx;
    const creature = put(game, b, 'Grizzly Bears', 'graveyard'), artifact = put(game, b, 'Sol Ring');
    await cast(ctx, 'Cost Target Exile');
    assert.equal(creature.zone, 'exile'); assert.equal(artifact.zone, 'graveyard');
    assert.equal(ctx.trace.filter(row => row.query.type === 'chooseTargets').length, 2);
  });
  test(`v8 resolution ${role}: a blinked payment target blocks its branch while another target remains legal`, async () => {
    const ctx = context(role), { game, b } = ctx;
    const creature = put(game, b, 'Grizzly Bears', 'graveyard'), artifact = put(game, b, 'Sol Ring');
    await cast(ctx, 'Cost Target Exile', false);
    await game.move(creature, 'hand'); await game.move(creature, 'graveyard');
    await settle(game);
    assert.equal(creature.zone, 'graveyard'); assert.equal(artifact.zone, 'battlefield');
  });
  test(`v8 resolution ${role}: tap costs filter Humans and accept a summoning-sick creature without a tap symbol`, async () => {
    const ctx = context(role), { game, a, b } = ctx; fill(game, a);
    const creature = put(game, a, 'Grizzly Bears'); creature.sick = true;
    const human = put(game, a, definition('V8 Human', { subtypes: ['Human'] }));
    const tapped = put(game, a, 'Grizzly Bears'); tapped.tapped = true;
    const enemy = put(game, b, 'Grizzly Bears');
    await cast(ctx, 'Cost Tap');
    assert.equal(creature.tapped, true); assert.equal(human.tapped, false); assert.equal(enemy.tapped, false); assert.equal(a.hand.length, 1);
    const choice = ctx.trace.find(row => row.query.type === 'chooseCards'); assert.equal(choice.query.from.length, 1); assert.equal(choice.query.from[0], creature);
  });
  test(`v8 resolution ${role}: return-another cost uses the owner hand and preserves the ability source`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const source = put(game, a, 'V8 Effects Cost Return'), stolen = put(game, b, 'Grizzly Bears'); stolen.ctrl = a;
    game.recalc(); await activate(ctx, source);
    assert.equal(stolen.zone, 'hand'); assert.ok(b.hand.includes(stolen)); assert.equal(source.zone, 'battlefield'); assert.equal(source.kw('indestructible'), true);
  });
  test(`v8 resolution ${role}: hand-bottom payment precedes the independent draw`, async () => {
    const ctx = context(role), { game, a } = ctx; fill(game, a, 3);
    const bottom = put(game, a, 'Sol Ring', 'hand'), oldTop = a.library.at(-1);
    await cast(ctx, 'Cost Tuck');
    assert.equal(bottom.zone, 'library'); assert.equal(a.library[0], bottom); assert.ok(a.hand.includes(oldTop)); assert.equal(a.hand.length, 1);
  });
  test(`v8 resolution ${role}: removing a counter costs exactly one and an empty source cannot pay again`, async () => {
    const ctx = context(role), { game, a } = ctx;
    const source = put(game, a, 'V8 Effects Cost Remove'); game.addCounters(source, 'charge', 1);
    await activate(ctx, source); assert.equal(source.counters.charge || 0, 0); assert.equal(a.life, 41);
    game.untap(source); await activate(ctx, source); assert.equal(a.life, 41);
  });
  test(`v8 resolution ${role}: returning the targeted creature captures its mana value before it reaches its owner's hand`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const returned = put(game, b, definition('V8 Returned Six', { cost: '{6}' })); returned.ctrl = a; game.recalc();
    const before = a.life; await cast(ctx, 'Cost Return Stat');
    assert.equal(returned.zone, 'hand'); assert.ok(b.hand.includes(returned)); assert.equal(a.life, before + 6);
  });
  test(`v8 resolution ${role}: a paid graveyard card supplies its last power after moving to the library`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const paid = put(game, a, definition('V8 Paid Five', { power: 5, toughness: 5 }), 'graveyard');
    const victim = put(game, b, definition('V8 Paid Stat Victim', { toughness: 9 }));
    await cast(ctx, 'Cost Library Stat');
    assert.equal(a.library.at(-1), paid); assert.equal(paid.zone, 'library'); assert.equal(victim.damage, 5);
  });
  test(`v8 resolution ${role}: discarding the whole hand draws exactly its paid cardinality`, async () => {
    const ctx = context(role), { game, a } = ctx; await cast(ctx, 'Cost Hand Count'); fill(game, a, 6);
    const cards = [put(game, a, 'Forest', 'hand'), put(game, a, 'Forest', 'hand'), put(game, a, 'Sol Ring', 'hand')];
    await game.emit('upkeep', { player: a }); await settle(game);
    assert.ok(cards.every(card => card.zone === 'graveyard')); assert.equal(a.turnState.discardedN, 3);
    assert.equal(a.hand.length, 3); assert.equal(a.library.length, 3);
  });
  test(`v8 resolution ${role}: draw replacement does not change the nominal count used by the conditional discard`, async () => {
    const ctx = context(role), { game, a } = ctx; const source = await cast(ctx, 'Cost Draw Snapshot');
    const doubler = definition('V8 Payment Draw Doubler', { types: ['Enchantment'] }); doubler.drawDouble = true; put(game, a, doubler); fill(game, a, 4);
    await game.emit('attacks', { card: source, player: a }); await settle(game);
    assert.equal(a.turnState.drewThisTurn, 4); assert.equal(a.turnState.discardedN, 2);
    assert.equal(a.hand.length, 2); assert.equal(a.library.length, 0);
  });
  test(`v8 resolution ${role}: processors move exact opponent-owned exile cards to their separate owners`, async () => {
    const one = context(role, 3), first = put(one.game, one.b, 'Forest', 'exile'), untouched = put(one.game, one.c, 'Sol Ring', 'exile');
    const life = one.a.life; await cast(one, 'Cost Process');
    assert.equal(first.zone, 'graveyard'); assert.ok(one.b.graveyard.includes(first)); assert.equal(untouched.zone, 'exile'); assert.equal(one.a.life, life + 5);
    const two = context(role, 3), left = put(two.game, two.b, 'Forest', 'exile'), right = put(two.game, two.c, 'Sol Ring', 'exile'); fill(two.game, two.a, 1);
    await cast(two, 'Cost Process Two');
    assert.equal(left.zone, 'graveyard'); assert.ok(two.b.graveyard.includes(left));
    assert.equal(right.zone, 'graveyard'); assert.ok(two.c.graveyard.includes(right)); assert.equal(two.a.hand.length, 1);
  });
  test(`v8 resolution ${role}: targeted counter removal is paid on resolution before its life payoff`, async () => {
    const ctx = context(role), { game, a } = ctx, source = put(game, a, 'V8 Effects Cost Counter Target'), ally = put(game, a, 'Grizzly Bears');
    game.addCounters(source, '-1/-1', 1); game.addCounters(ally, '-1/-1', 1); ctx.state.preferredTarget = ally; a.pool.W = 1;
    const before = a.life; await activate(ctx, source);
    const target = ctx.trace.find(row => row.query.type === 'chooseTargets').answer[0];
    assert.equal(target.counters['-1/-1'] || 0, 0); assert.equal((target === source ? ally : source).counters['-1/-1'], 1);
    assert.equal(a.life, before + 2); assert.equal(source.tapped, true); assert.equal(a.pool.W, 0);
  });
  test(`v8 resolution ${role}: a sacrificed creature's LKI sets the exact lesser-mana-value library threshold`, async () => {
    const ctx = context(role), { game, a } = ctx; await cast(ctx, 'Cost Relative Library');
    const paid = put(game, a, definition('V8 Paid Five Relative', { power: 1, toughness: 1, cost: '{5}' }));
    const untouched = put(game, a, definition('V8 Relative Untouched', { types: ['Land'], cost: '' }), 'library');
    const chosen = put(game, a, definition('V8 Relative Chosen Four', { power: 8, toughness: 8, cost: '{4}' }), 'library');
    const equal = put(game, a, definition('V8 Relative Equal Five', { power: 7, toughness: 7, cost: '{5}' }), 'library');
    const legendary = put(game, a, definition('V8 Relative Legendary Two', { power: 6, toughness: 6, cost: '{2}', superTypes: ['Legendary'] }), 'library');
    const spell = put(game, a, definition('V8 Relative Top Spell', { types: ['Sorcery'], cost: '{1}' }), 'library');
    await game.emit('endStep', { player: a }); await settle(game);
    assert.equal(paid.zone, 'graveyard'); assert.equal(chosen.zone, 'battlefield'); assert.equal(chosen.ctrl, a);
    assert.equal(equal.zone, 'library'); assert.equal(legendary.zone, 'library'); assert.equal(spell.zone, 'library');
    assert.equal(a.library.at(-1), untouched, 'uninspected library order remains above the random bottom cohort');
    const reveal = ctx.reveals.find(row => row.kind === 'reveal'); assert.ok(reveal);
    assert.deepEqual(Array.from(reveal.cards, card => card.name), [spell, legendary, equal, chosen].map(card => card.name));
  });
  test(`v8 resolution ${role}: hybrid payment is spent on resolution without counting as casting mana`, async () => {
    const ctx = context(role), { game, a } = ctx;
    await cast(ctx, 'Cost Hybrid', false); a.pool.W = 1; a.pool.B = 1;
    const spent = a.turnState.manaSpentOnSpells;
    await settle(game);
    assert.equal(a.pool.W + a.pool.B, 1); assert.equal(a.life, 42); assert.equal(a.turnState.manaSpentOnSpells, spent);
    assert.ok(ctx.trace.some(row => row.query.aiHint?.kind === 'alternativeManaPayment'));
  });
}

test('v8 effects local AI aims both ordinary batch clauses at the enemy', async () => {
  const ctx = context('ai'), { game, a, b } = ctx;
  const own = put(game, a, definition('V8 AI Own', { power: 8, toughness: 8 }));
  const enemy = put(game, b, definition('V8 AI Enemy', { power: 8, toughness: 8 }));
  await cast(ctx, 'Twin Target');
  assert.equal(own.damage, 0); assert.equal(enemy.damage, 5);
  assert.ok(ctx.a.controller instanceof MTG.AIController);
});

test('v8 resolution human: declining a payable cost executes only its false branch', async () => {
  const ctx = context(); fill(ctx.game, ctx.a);
  const cards = [put(ctx.game, ctx.a, 'Forest', 'hand'), put(ctx.game, ctx.a, 'Forest', 'hand')]; ctx.state.decline = true;
  await cast(ctx, 'Cost Branches');
  assert.ok(cards.every(card => card.zone === 'hand')); assert.equal(ctx.a.hand.length, 2); assert.equal(ctx.a.life, 38);
});

test('v8 resolution human: a mandatory cost is not offered as an optional payment', async () => {
  const ctx = context(); fill(ctx.game, ctx.a);
  put(ctx.game, ctx.a, 'Forest', 'hand'); put(ctx.game, ctx.a, 'Forest', 'hand'); ctx.state.decline = true;
  await cast(ctx, 'Cost Mandatory');
  assert.equal(ctx.a.turnState.discardedN, 2); assert.equal(ctx.a.hand.length, 3);
  assert.equal(ctx.trace.some(row => row.query.aiHint?.kind === 'oracleUnlessPayment'), false);
});

for (const problem of ['too-few', 'too-many', 'duplicate', 'foreign', 'blink']) test(`v8 resolution human: ${problem} card choices cannot partially pay a cost`, async () => {
  const ctx = context(), { game, a, b } = ctx; fill(game, a);
  const first = put(game, a, 'Forest', 'hand'), second = put(game, a, 'Forest', 'hand'), third = put(game, a, 'Forest', 'hand');
  const foreign = put(game, b, 'Forest', 'hand');
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, query) => {
    if (query.type === 'chooseCards' && query.prompt.includes('discard')) {
      if (problem === 'too-few') return [first];
      if (problem === 'too-many') return [first, second, third];
      if (problem === 'duplicate') return [first, first];
      if (problem === 'foreign') return [first, foreign];
      await g.move(first, 'exile'); await g.move(first, 'hand'); return [first, second];
    }
    return decide(g, query);
  };
  await cast(ctx, 'Cost Branches');
  assert.equal(a.life, 38); assert.equal(a.turnState.discardedN || 0, 0); assert.equal(a.hand.length, 3);
  assert.ok([first, second, third, foreign].every(card => card.zone === 'hand'));
});

test('v8 resolution human: discarded cards replaced onto the library still pay the cost', async () => {
  const ctx = context(), { game, a } = ctx; fill(game, a);
  const replacement = definition('V8 Discard Replacement', { types: ['Artifact'] }); replacement.discardToLibraryTop = true; put(game, a, replacement);
  const first = put(game, a, 'Forest', 'hand'), second = put(game, a, 'Forest', 'hand');
  await cast(ctx, 'Cost Discard Two');
  assert.equal(a.turnState.discardedN, 2); assert.equal(a.hand.length, 3); assert.ok(a.hand.includes(first)); assert.ok(a.hand.includes(second));
});

test('v8 resolution human: owner ordering of a multi-card top payment is independent of selecting its cards', async () => {
  const ctx = context(), { game, a } = ctx; fill(game, a, 3);
  const first = put(game, a, 'Forest', 'hand'), second = put(game, a, 'Sol Ring', 'hand');
  await cast(ctx, 'Cost Top Two');
  assert.equal(second.zone, 'hand'); assert.equal(first.zone, 'library'); assert.equal(a.library.at(-1), first);
  assert.equal(ctx.trace.filter(row => row.query.type === 'chooseCards').length, 2);
});

test('v8 resolution human: a changed graveyard target cannot pay with its new incarnation or deal damage', async () => {
  const ctx = context(), { game, a, b } = ctx;
  const paid = put(game, a, definition('V8 Stale Paid Five', { power: 5, toughness: 5 }), 'graveyard');
  const victim = put(game, b, definition('V8 Stale Paid Victim', { toughness: 9 }));
  await cast(ctx, 'Cost Library Stat', false);
  await game.move(paid, 'hand'); await game.move(paid, 'graveyard'); await settle(game);
  assert.equal(paid.zone, 'graveyard'); assert.equal(victim.damage, 0); assert.equal(a.library.includes(paid), false);
});

test('v8 resolution human: a changed counter target keeps the new counter after the activation cost was paid', async () => {
  const ctx = context(), { game, a } = ctx, source = put(game, a, 'V8 Effects Cost Counter Target'), target = put(game, a, 'Grizzly Bears');
  game.addCounters(target, '-1/-1', 1); ctx.state.preferredTarget = target; a.pool.W = 1; const life = a.life;
  await activate(ctx, source, false); await game.move(target, 'exile'); await game.move(target, 'battlefield', { ctrl: a });
  game.addCounters(target, '-1/-1', 1); await settle(game);
  assert.equal(target.counters['-1/-1'], 1); assert.equal(a.life, life); assert.equal(source.tapped, true); assert.equal(a.pool.W, 0);
});

test('v8 resolution human: same-owner processing never mixes exiled cards from different opponents', async () => {
  const ctx = context('human', 3), { game, a, b, c } = ctx; fill(game, a, 1);
  const bCards = [put(game, b, 'Forest', 'exile'), put(game, b, 'Sol Ring', 'exile')];
  const cCards = [put(game, c, 'Forest', 'exile'), put(game, c, 'Sol Ring', 'exile')];
  await cast(ctx, 'Cost Process Same Owner');
  assert.ok(bCards.every(card => card.zone === 'graveyard' && b.graveyard.includes(card)));
  assert.ok(cCards.every(card => card.zone === 'exile')); assert.equal(a.hand.length, 1);
  const owner = ctx.trace.find(row => row.query.aiHint?.kind === 'oracleProcessOwner');
  assert.ok(owner); assert.deepEqual(Array.from(owner.query.options, option => option.label), ['B', 'C']);
});

test('v8 resolution human: a mixed-owner card answer is rejected before any process payment moves', async () => {
  const ctx = context('human', 3), { game, a, b, c } = ctx; fill(game, a, 1);
  const bCards = [put(game, b, 'Forest', 'exile'), put(game, b, 'Sol Ring', 'exile')];
  const cCards = [put(game, c, 'Forest', 'exile'), put(game, c, 'Sol Ring', 'exile')];
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, query) => query.aiHint?.kind === 'oracleProcessExile' ? [bCards[0], cCards[0]] : decide(g, query);
  await cast(ctx, 'Cost Process Same Owner');
  assert.ok([...bCards, ...cCards].every(card => card.zone === 'exile')); assert.equal(a.hand.length, 0); assert.equal(a.library.length, 1);
});

test('v8 resolution local AI processes face-down exile without using or logging hidden identities', async () => {
  const run = async reverse => {
    const ctx = context('ai'), { game, a, b } = ctx, names = reverse ? ['V8 Hidden Beta', 'V8 Hidden Alpha'] : ['V8 Hidden Alpha', 'V8 Hidden Beta'];
    for (const name of names) { const card = put(game, b, definition(name), 'exile'); card.faceDown = true; }
    await cast(ctx, 'Cost Process');
    const choice = ctx.trace.find(row => row.query.aiHint?.kind === 'oracleProcessExile'); assert.ok(choice);
    const chosenIndex = choice.query.from.indexOf(choice.answer[0]);
    const decision = (game.aiDecisionLog || []).find(row => /^Cards:/.test(row.chosen || '')); assert.ok(decision);
    assert.equal(decision.chosen, 'Cards: Face-down card');
    for (const name of names) assert.equal(JSON.stringify(decision).includes(name), false);
    return chosenIndex;
  };
  assert.equal(await run(false), await run(true), 'swapping hidden definitions cannot change the public choice position');
});

test('v8 resolution human: pay-life decline and insufficient life take the false branch', async () => {
  for (const mode of ['pay', 'decline', 'insufficient']) {
    const ctx = context(); ctx.a.life = mode === 'insufficient' ? 2 : 40; ctx.state.decline = mode === 'decline';
    await cast(ctx, 'Cost Life Else');
    assert.equal(ctx.a.life, mode === 'pay' ? 37 : mode === 'decline' ? 35 : -3);
    if (mode === 'insufficient') assert.equal(ctx.a.lost, true);
  }
});

test('v8 resolution runtime rejects unknown payment kinds before touching game state', async () => {
  const ctx = context(); const before = ctx.a.life;
  await assert.rejects(MTG.OracleV8Effects.run({ g: ctx.game, you: ctx.a }, {
    action: 'resolution-cost', payment: { kind: 'secret-payment', n: 2 }, effects: [],
  }, {}), /Unsupported resolution card payment/);
  assert.equal(ctx.a.life, before);
});

for (const role of ['human', 'ai']) {
  test(`v8 composition ${role}: independent clauses preserve their players, source and printed order`, async () => {
    const ctx = context(role, 3), { game, a, b, c } = ctx; fill(game, a);
    const source = put(game, a, 'V8 Effects Composition');
    await activate(ctx, source); assert.equal(a.life, 42); assert.equal(a.hand.length, 1); assert.equal(b.life, 39); assert.equal(c.life, 39);
    const pump = put(game, a, 'V8 Effects Composition Pump');
    await activate(ctx, pump); assert.equal(pump.power, 4); assert.equal(source.power, 2); assert.equal(a.hand.length, 2);
  });
  test(`v8 composition ${role}: an enchantment source returns to its owner and ignores a blinked incarnation`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const source = put(game, b, 'V8 Effects Source Enchantment'); source.ctrl = a; game.recalc();
    await activate(ctx, source); assert.equal(source.zone, 'hand'); assert.ok(b.hand.includes(source));
    await game.putPermanentOntoBattlefield(source, a); source.sick = false;
    await activate(ctx, source, false); await game.move(source, 'exile'); await game.putPermanentOntoBattlefield(source, a);
    await settle(game); assert.equal(source.zone, 'battlefield'); assert.equal(source.ctrl, a);
  });
  test(`v8 composition ${role}: prefix targets shift a nested payment and both conditional body targets`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const untap = put(game, a, 'Sol Ring'); untap.tapped = true;
    const payment = put(game, a, 'Grizzly Bears', 'graveyard'), destroy = put(game, b, 'Sol Ring');
    await cast(ctx, 'Prefix Target Cost');
    assert.equal(untap.zone, 'battlefield'); assert.equal(untap.tapped, false); assert.equal(payment.zone, 'exile'); assert.equal(destroy.zone, 'graveyard');
  });
  test(`v8 resolution ${role}: drawing as a cost triggers the follow-up even when the new card is discarded`, async () => {
    const ctx = context(role), { game, a } = ctx; fill(game, a, 4);
    const top = a.library.at(-1); await cast(ctx, 'Cost Draw');
    assert.equal(top.zone, 'graveyard'); assert.equal(a.hand.length, 0); assert.equal(a.turnState.drewThisTurn, 1); assert.equal(a.turnState.discardedN, 1);
  });
  test(`v8 resolution ${role}: counted zero-card draws still pay while targeted draw counts remain locked`, async () => {
    const ctx = context(role), { game, a } = ctx; fill(game, a);
    await cast(ctx, 'Cost Draw Count'); assert.equal(a.life, 42); assert.equal(a.hand.length, 0);
    const creature = put(game, a, 'Grizzly Bears'); await cast(ctx, 'Cost Draw Power', false); MTG.E.pumpUntilEOT(game, creature, 2, 0);
    await settle(game); assert.equal(a.hand.length, 4); assert.equal(a.life, 44);
  });
  test(`v8 resolution ${role}: X is chosen during resolution within affordable mana and a printed cap`, async () => {
    const ctx = context(role), { game, a } = ctx; fill(game, a, 20);
    await cast(ctx, 'Cost X', false); assert.equal(ctx.trace.some(row => row.query.type === 'chooseX'), false);
    a.pool.C = 4; a.pool.G = 1; ctx.state.xValue = 3;
    await settle(game);
    const x = role === 'human' ? 3 : 4;
    assert.equal(a.hand.length, x); assert.equal(a.pool.C, 4 - x); assert.equal(a.pool.G, 0);
    const query = ctx.trace.find(row => row.query.type === 'chooseX').query; assert.equal(query.min, 0); assert.equal(query.max, 4);
    const handBefore = a.hand.length;
    await cast(ctx, 'Cost X Bound', false); a.pool.C = 7; await game.gainLife(a, 2, null); ctx.state.xValue = 2;
    await settle(game); assert.equal(a.hand.length, handBefore + 2); assert.equal(a.pool.C, 5);
    const last = ctx.trace.filter(row => row.query.type === 'chooseX').at(-1).query; assert.equal(last.max, 2);
  });
}

test('v8 resolution human: an empty-library draw cost executes its whole payoff before the loss', async () => {
  const ctx = context(); await cast(ctx, 'Cost Draw Life');
  assert.equal(ctx.a.life, 45); assert.equal(ctx.a.deckedOut, true); assert.equal(ctx.a.lost, true);
});

test('v8 resolution human: declining a draw cost never draws, discards or takes its payoff', async () => {
  const ctx = context(); fill(ctx.game, ctx.a, 3); ctx.state.decline = true;
  await cast(ctx, 'Cost Draw Life'); assert.equal(ctx.a.library.length, 3); assert.equal(ctx.a.hand.length, 0); assert.equal(ctx.a.life, 40);
});

test('v8 resolution local AI declines a draw cost that would deck it without inspecting hidden cards', async () => {
  const ctx = context('ai'); await cast(ctx, 'Cost Draw Life');
  assert.equal(ctx.a.life, 40); assert.equal(ctx.a.lost, false); assert.equal(!!ctx.a.deckedOut, false);
  const choice = ctx.trace.find(row => row.query.aiHint?.kind === 'oracleUnlessPayment'); assert.equal(choice.answer, 'no');
});

test('v8 resolution human: a draw replaced with dredge still pays and carries out its follow-up', async () => {
  const ctx = context(), { game, a } = ctx; fill(game, a, 4);
  const def = definition('V8 Cost Dredge'); def.dredge = 2;
  const card = put(game, a, def, 'graveyard'), decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, query) => query.aiHint?.kind === 'dredge' ? 'dredge:' + card.iid : decide(g, query);
  await cast(ctx, 'Cost Draw Life');
  assert.equal(card.zone, 'hand'); assert.equal(a.library.length, 2); assert.equal(a.turnState.drewThisTurn || 0, 0); assert.equal(a.life, 45);
});

test('v8 resolution human: fixed X is still known in the declined branch and zero X is a legal payment', async () => {
  const ctx = context(), { game, a } = ctx;
  put(game, a, 'Grizzly Bears'); put(game, a, 'Grizzly Bears'); ctx.state.decline = true;
  await cast(ctx, 'Cost X Fixed'); assert.equal(a.life, 38);
  ctx.state.decline = false; ctx.state.xValue = 0;
  await cast(ctx, 'Cost X', false); a.pool.G = 1; a.pool.C = 3;
  await settle(game); assert.equal(a.pool.G, 0); assert.equal(a.pool.C, 3); assert.equal(a.hand.length, 0);
});

test('v8 resolution human: an out-of-range X never consumes mana or runs the payoff', async () => {
  const ctx = context(); fill(ctx.game, ctx.a, 6); await cast(ctx, 'Cost X', false);
  ctx.a.pool.G = 1; ctx.a.pool.C = 2; ctx.state.xValue = 3;
  await settle(ctx.game); assert.equal(ctx.a.pool.G, 1); assert.equal(ctx.a.pool.C, 2); assert.equal(ctx.a.hand.length, 0);
});

test('v8 resolution local AI keeps X within its public draw budget while the full legal range stays available', async () => {
  const ctx = context('ai'); fill(ctx.game, ctx.a, 2); await cast(ctx, 'Cost X', false);
  ctx.a.pool.G = 1; ctx.a.pool.C = 6;
  await settle(ctx.game);
  const choice = ctx.trace.find(row => row.query.type === 'chooseX');
  assert.equal(choice.query.max, 6); assert.equal(choice.answer, 2); assert.equal(ctx.a.hand.length, 2);
  assert.equal(ctx.a.pool.C, 4); assert.equal(ctx.a.lost, false); assert.equal(!!ctx.a.deckedOut, false);
});

test('v8 resolution local AI accounts for a public draw doubler before choosing a draw cost', async () => {
  const ctx = context('ai'), def = definition('V8 Public Draw Doubler', { types: ['Enchantment'] }); def.drawDouble = true;
  put(ctx.game, ctx.a, def); fill(ctx.game, ctx.a, 1);
  await cast(ctx, 'Cost Draw Life');
  assert.equal(ctx.a.hand.length, 0); assert.equal(ctx.a.library.length, 1); assert.equal(ctx.a.life, 40);
  assert.equal(ctx.trace.find(row => row.query.aiHint?.kind === 'oracleUnlessPayment').answer, 'no');
});

for (const role of ['human', 'ai']) {
  test(`v8 retained effects ${role}: a group counter X snapshots source power before the first counter changes it`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const source = put(game, a, 'V8 Effects Group Counter X'), ally = put(game, a, 'Grizzly Bears'), opponent = put(game, b, 'Grizzly Bears');
    await activate(ctx, source, false); MTG.E.pumpUntilEOT(game, source, 3, 0); await settle(game);
    assert.equal(source.counters['+1/+1'], 5); assert.equal(ally.counters['+1/+1'], 5); assert.equal(opponent.counters['+1/+1'] || 0, 0);
    assert.equal(source.power, 10); assert.equal(ally.power, 7);
  });
  test(`v8 retained effects ${role}: grouped qualities keep both artifact and creature requirements`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const robot = put(game, a, definition('V8 Group Robot', { types: ['Artifact', 'Creature'] }));
    const creature = put(game, a, 'Grizzly Bears'), artifact = put(game, a, 'Sol Ring'), enemy = put(game, b, definition('V8 Enemy Robot', { types: ['Artifact', 'Creature'] }));
    await cast(ctx, 'Group Artifact');
    assert.equal(robot.kw('deathtouch'), true); for (const card of [creature, artifact, enemy]) assert.equal(card.kw('deathtouch'), false);
  });
  test(`v8 retained effects ${role}: they grants every keyword to initially affected creatures without targeting`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const tapped = put(game, a, 'Grizzly Bears'), untapped = put(game, a, definition('V8 Shrouded Ally', { kws: ['shroud'] })), enemy = put(game, b, 'Grizzly Bears');
    game.tap(tapped); game.tap(enemy); await cast(ctx, 'Group Retained');
    assert.equal(tapped.tapped, false); assert.equal(enemy.tapped, true);
    for (const card of [tapped, untapped]) { assert.equal(card.kw('flying'), true); assert.equal(card.kw('double strike'), true); }
    assert.equal(enemy.kw('flying'), false); assert.equal(ctx.trace.some(row => row.query.type === 'chooseTargets'), false);
    await game.move(tapped, 'exile'); await game.move(tapped, 'battlefield', { ctrl: a });
    assert.equal(tapped.kw('flying'), false); assert.equal(tapped.kw('double strike'), false);
  });
  test(`v8 retained effects ${role}: tapping qualification is evaluated once before untapping the group`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const first = put(game, a, 'Grizzly Bears'), second = put(game, a, 'Grizzly Bears'), untouched = put(game, a, 'Grizzly Bears'), enemy = put(game, b, 'Grizzly Bears');
    game.tap(first); game.tap(second); game.tap(enemy); await cast(ctx, 'Group Tapped');
    for (const card of [first, second]) { assert.equal(card.tapped, false); assert.equal(card.kw('flying'), true); }
    assert.equal(untouched.kw('flying'), false); assert.equal(enemy.kw('flying'), false); assert.equal(enemy.tapped, true);
  });
  test(`v8 retained effects ${role}: each of them receives its counter after the preceding keyword grant`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const first = put(game, a, 'Grizzly Bears'), second = put(game, a, 'Grizzly Bears'), enemy = put(game, b, 'Grizzly Bears');
    await cast(ctx, 'Group Counter Follow');
    for (const card of [first, second]) { assert.equal(card.kw('deathtouch'), true); assert.equal(card.counters['+1/+1'], 2); assert.equal(card.power, 4); }
    assert.equal(enemy.counters['+1/+1'] || 0, 0); assert.equal(enemy.kw('deathtouch'), false);
  });
  test(`v8 player counters ${role}: each opponent receives poison without damage or life loss`, async () => {
    const ctx = context(role, 3), { game, a, b, c } = ctx; fill(game, a, 2);
    b.poison = 1; c.poison = 3;
    const events = [], emit = game.emit.bind(game);
    game.emit = async (name, data) => { if (name === 'playerCountersPlaced') events.push({ data, values: [b.poison, c.poison] }); return emit(name, data); };
    await cast(ctx, 'Poison Wave');
    assert.deepEqual([a.poison, b.poison, c.poison], [0, 2, 4]); assert.deepEqual([a.life, b.life, c.life], [40, 40, 40]); assert.equal(a.hand.length, 1);
    assert.equal(events.length, 2); for (const event of events) assert.deepEqual(event.values, [2, 4], 'the whole poison instruction is applied before its events');
  });
  test(`v8 player counters ${role}: one opponent remains the subject of life, poison, and mill clauses`, async () => {
    const ctx = context(role), { game, a, b } = ctx; fill(game, a, 8); fill(game, b, 8);
    await cast(ctx, 'Poison Sequence');
    assert.equal(b.life, 38); assert.equal(b.poison, 1); assert.equal(b.library.length, 2); assert.equal(b.graveyard.length, 6);
    assert.equal(a.life, 40); assert.equal(a.poison, 0); assert.equal(a.library.length, 8);
    const queries = ctx.trace.filter(row => row.query.type === 'chooseTargets'); assert.equal(queries.length, 1); assert.equal(queries[0].answer[0], b);
  });
  test(`v8 player counters ${role}: an illegal player target prevents every clause on resolution`, async () => {
    const ctx = context(role), { game, a, b } = ctx; fill(game, b, 8); await cast(ctx, 'Poison Sequence', false);
    const shield = definition('V8 Player Hexproof', { types: ['Enchantment'] }); shield.playerHexproof = true; put(game, b, shield);
    await settle(game); assert.equal(b.life, 40); assert.equal(b.poison, 0); assert.equal(b.library.length, 8);
    assert.equal(a.poison, 0);
  });
  test(`v8 player counters ${role}: destroying a stolen creature poisons its last battlefield controller`, async () => {
    const ctx = context(role, 3), { game, a, b, c } = ctx;
    const victim = put(game, b, definition('V8 Poisoned Flyer', { kws: ['flying'] })); victim.ctrl = c; game.recalc();
    await cast(ctx, 'Poison Offering');
    assert.equal(victim.zone, 'graveyard'); assert.equal(victim.owner, b); assert.equal(c.poison, 1); assert.equal(b.poison, 0); assert.equal(a.poison, 0);
  });
  test(`v8 player counters ${role}: damage-trigger poison keeps its event player after the source leaves`, async () => {
    const ctx = context(role, 3), { game, a, b, c } = ctx;
    const source = put(game, a, 'V8 Effects Poison Trigger');
    await game.damagePlayer(source, c, 1); await game.flushTriggers(); assert.equal(game.stack.length, 1);
    await game.move(source, 'graveyard'); await settle(game);
    assert.equal(c.life, 39); assert.equal(c.poison, 2); assert.equal(b.poison, 0); assert.equal(a.poison, 0);
  });
  test(`v8 player counters ${role}: an unblocked trigger keeps the original defending player`, async () => {
    const ctx = context(role, 3), { game, a, b, c } = ctx;
    const source = put(game, a, 'V8 Effects Poison Unblocked'); source.attacking = c; source.wasBlocked = false;
    await game.emit('blockersDeclared', { player: a, attackers: [source] }); await game.flushTriggers(); assert.equal(game.stack.length, 1);
    source.attacking = b; await settle(game); assert.equal(c.poison, 1); assert.equal(b.poison, 0);
  });
  test(`v8 player counters ${role}: ten poison checks state only after the remaining draw instruction`, async () => {
    const ctx = context(role); fill(ctx.game, ctx.a, 2); await cast(ctx, 'Poison Last');
    assert.equal(ctx.a.poison, 10); assert.equal(ctx.a.hand.length, 1); assert.equal(ctx.a.library.length, 1); assert.equal(ctx.a.lost, true);
  });
  test(`v8 marker effects ${role}: a marker counter is placed on the source after its chosen graveyard exile`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const source = put(game, a, 'V8 Effects Oil Marker'), card = put(game, b, 'Grizzly Bears', 'graveyard');
    await activate(ctx, source); assert.equal(card.zone, 'exile'); assert.equal(source.counters.oil, 1); assert.equal(source.kw('oil'), false);
    assert.equal(source.counters['+1/+1'] || 0, 0); assert.equal(card.counters.oil || 0, 0);
    const second = put(game, b, 'Grizzly Bears', 'graveyard'); game.untap(source); await activate(ctx, source, false);
    await game.move(source, 'exile'); await game.move(source, 'battlefield', { ctrl: a }); await settle(game);
    assert.equal(second.zone, 'exile'); assert.equal(source.counters.oil || 0, 0, 'the marker never follows the source through a blink');
  });
  test(`v8 marker effects ${role}: the following count sees a newly placed lore counter`, async () => {
    const ctx = context(role), { game, a } = ctx; fill(game, a, 10);
    const source = put(game, a, 'V8 Effects Lore Draw'); game.addCounters(source, 'lore', 1, false, a);
    await activate(ctx, source); assert.equal(source.counters.lore, 2); assert.equal(a.hand.length, 2); assert.equal(a.library.length, 8);
    game.untap(source); await activate(ctx, source); assert.equal(source.counters.lore, 3); assert.equal(a.hand.length, 5); assert.equal(a.library.length, 5);
  });
  test(`v8 marker effects ${role}: an instruction removes as many counters as possible without becoming a payment`, async () => {
    const ctx = context(role), { game, b } = ctx;
    const artifact = put(game, b, 'Sol Ring'); game.addCounters(artifact, 'oil', 1, false, b);
    await cast(ctx, 'Oil Remove'); assert.equal(artifact.counters.oil || 0, 0);
    game.addCounters(artifact, 'oil', 5, false, b); await cast(ctx, 'Oil Remove', false);
    await game.move(artifact, 'exile'); await game.move(artifact, 'battlefield', { ctrl: b }); game.addCounters(artifact, 'oil', 2, false, b); await settle(game);
    assert.equal(artifact.counters.oil, 2, 'an illegal old target cannot remove counters from its new incarnation');
  });
  test(`v8 marker effects ${role}: a then-count includes the token just created and only friendly Spiders`, async () => {
    const ctx = context(role, 3), { game, a, b, c } = ctx;
    put(game, a, definition('V8 Friendly Spider', { subtypes: ['Spider'] })); put(game, b, definition('V8 Enemy Spider', { subtypes: ['Spider'] }));
    await cast(ctx, 'Count After Token'); assert.equal(b.life, 38); assert.equal(c.life, 38); assert.equal(a.life, 40);
    assert.equal(game.creatures(a).filter(card => card.hasSub('Spider')).length, 2);
  });
  test(`v8 marker effects ${role}: every complete comma clause keeps its written player`, async () => {
    const ctx = context(role, 3), { game, a, b, c } = ctx; fill(game, a, 3);
    const bCard = put(game, b, 'Forest', 'hand'), cCard = put(game, c, 'Forest', 'hand');
    await cast(ctx, 'Comma Sequence'); assert.equal(bCard.zone, 'graveyard'); assert.equal(cCard.zone, 'graveyard');
    assert.equal(a.hand.length, 1); assert.equal(a.life, 42); assert.equal(b.life, 40); assert.equal(c.life, 40);
  });
  test(`v8 marker effects ${role}: a descent marker drives each player's token creation and one damage instruction`, async () => {
    const ctx = context(role, 3), { game, a, b, c } = ctx;
    const source = put(game, a, 'V8 Effects Descent Marker'); await activate(ctx, source);
    assert.equal(source.counters.descent, 2);
    for (const player of [a, b, c]) { assert.equal(player.life, 38); assert.equal(game.bf().filter(card => card.ctrl === player && card.hasSub('Treasure')).length, 2); }
    game.untap(source); await activate(ctx, source); assert.equal(source.counters.descent, 4);
    for (const player of [a, b, c]) { assert.equal(player.life, 34); assert.equal(game.bf().filter(card => card.ctrl === player && card.hasSub('Treasure')).length, 6); }
  });
  test(`v8 delayed effects ${role}: a legal blocker is destroyed by a separate trigger after combat`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const source = put(game, a, 'V8 Effects Delay Blocking'), attacker = put(game, a, 'Grizzly Bears'), blocker = put(game, b, 'Grizzly Bears');
    const unrelated = put(game, b, definition('V8 Idle Enemy', { power: 4, toughness: 4 }));
    combat(game, attacker, b, blocker); await activate(ctx, source);
    assert.equal(blocker.zone, 'battlefield'); assert.equal(game.delayed.length, 1);
    await game.move(source, 'graveyard'); MTG.E.pumpUntilEOT(game, blocker, 0, 0, ['hexproof']);
    const targetChoices = ctx.trace.filter(row => row.query.type === 'chooseTargets').length;
    await game.endCombatStep(a); assert.equal(game.stack.length, 1); assert.equal(game.stack[0].ctrl === a, true); assert.equal(game.stack[0].srcCard === source, true);
    assert.equal(blocker.zone, 'battlefield', 'the delayed event only puts an ability on the Stack');
    await settle(game); assert.equal(blocker.zone, 'graveyard'); assert.equal(unrelated.zone, 'battlefield');
    assert.equal(ctx.trace.filter(row => row.query.type === 'chooseTargets').length, targetChoices, 'the delayed instruction is not a second target choice');
  });
  test(`v8 delayed effects ${role}: an illegal original target creates no delayed ability`, async () => {
    const ctx = context(role), { game, b } = ctx; const victim = put(game, b, 'Grizzly Bears');
    await cast(ctx, 'Delay Destroy', false); MTG.E.pumpUntilEOT(game, victim, 0, 0, ['hexproof']); await settle(game);
    assert.equal(game.delayed.length, 0); await game.emit('endStep', { player: b }); await settle(game); assert.equal(victim.zone, 'battlefield');
  });
  test(`v8 delayed effects ${role}: blinking after the delayed trigger is stacked protects the new object`, async () => {
    const ctx = context(role), { game, b } = ctx; const victim = put(game, b, 'Grizzly Bears');
    await cast(ctx, 'Delay Destroy'); const oldVersion = victim.zoneVersion;
    await game.emit('endStep', { player: b }); await game.flushTriggers(); assert.equal(game.stack.length, 1);
    await game.move(victim, 'exile'); await game.move(victim, 'battlefield', { ctrl: b }); assert.notEqual(victim.zoneVersion, oldVersion);
    await settle(game); assert.equal(victim.zone, 'battlefield'); assert.equal(game.delayed.length, 0);
    await game.emit('endStep', { player: b }); await settle(game); assert.equal(victim.zone, 'battlefield', 'a one-shot delayed trigger does not retry next turn');
  });
  test(`v8 delayed effects ${role}: destruction reads protection when the later instruction resolves`, async () => {
    for (const protection of ['indestructible', 'shield', 'regeneration']) {
      const ctx = context(role), { game, b } = ctx; const victim = put(game, b, 'Grizzly Bears'); await cast(ctx, 'Delay Destroy');
      if (protection === 'indestructible') MTG.E.pumpUntilEOT(game, victim, 0, 0, ['indestructible']);
      else if (protection === 'shield') game.addCounters(victim, 'shield', 1, false, b);
      else victim.regenShield = 1;
      await game.emit('endStep', { player: b }); await settle(game); assert.equal(victim.zone, 'battlefield', protection);
      if (protection === 'shield') assert.equal(victim.counters.shield || 0, 0);
      if (protection === 'regeneration') { assert.equal(victim.regenShield, 0); assert.equal(victim.tapped, true); }
    }
  });
  test(`v8 delayed effects ${role}: your next end step retains its controller and returns a stolen card to its owner`, async () => {
    const ctx = context(role, 3), { game, a, b, c } = ctx; const victim = put(game, b, 'Grizzly Bears'); victim.ctrl = a; game.recalc();
    const spell = await cast(ctx, 'Delay Bounce'); assert.equal(victim.power, 4); assert.equal(game.delayed.length, 1);
    victim.ctrl = c; game.recalc(); await game.emit('endStep', { player: c }); await settle(game);
    assert.equal(victim.zone, 'battlefield'); assert.equal(game.delayed.length, 1);
    await game.emit('endStep', { player: a }); await game.flushTriggers(); assert.equal(game.stack[0].ctrl === a, true); assert.equal(game.stack[0].srcCard === spell, true);
    await settle(game); assert.equal(victim.zone, 'hand'); assert.ok(b.hand.includes(victim)); assert.equal(a.hand.includes(victim), false); assert.equal(c.hand.includes(victim), false);
  });
  test(`v8 delayed effects ${role}: a combat event locks the other creature independently of its source`, async () => {
    const ctx = context(role), { game, a, b } = ctx; const source = put(game, a, 'V8 Effects Delay Event'), other = put(game, b, 'Grizzly Bears');
    combat(game, source, b, other); await game.emit('becomesBlockedByCreature', { attacker: source, blocker: other, blockers: [other] }); await settle(game);
    assert.equal(game.delayed.length, 1); await game.move(source, 'graveyard'); await game.endCombatStep(a); await settle(game);
    assert.equal(other.zone, 'graveyard'); assert.equal(source.zone, 'graveyard');
  });
  test(`v8 delayed effects ${role}: self destruction and clockwork counters wait for combat end`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const source = put(game, a, 'V8 Effects Delay Self'), clock = put(game, a, 'V8 Effects Delay Counter'); game.addCounters(clock, '+1/+1', 3, false, a);
    source.attacking = b; clock.attacking = b;
    await game.emit('attacks', { card: source, player: a, defender: b }); await game.emit('attacks', { card: clock, player: a, defender: b }); await settle(game);
    assert.equal(source.zone, 'battlefield'); assert.equal(clock.counters['+1/+1'], 3); assert.equal(game.delayed.length, 2);
    await game.endCombatStep(a); await settle(game); assert.equal(source.zone, 'graveyard'); assert.equal(clock.counters['+1/+1'], 2);
  });
  test(`v8 delayed effects ${role}: token replacements are retained but later unrelated tokens are not exiled`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    game.untilEffects.push({ kind: 'tokenDouble', who: a, expires: 'eot' }); await cast(ctx, 'Delay Token');
    const original = game.bf().filter(card => card.isToken); assert.equal(original.length, 2); assert.ok(original.every(card => card.kw('trample') && card.kw('haste')));
    const later = await game.makeTokens(definition('V8 Later Soldier', { subtypes: ['Soldier'], power: 1, toughness: 1 }), a, { n: 1 }); assert.ok(later.length > 0);
    await game.emit('endStep', { player: b }); await settle(game); assert.ok(original.every(card => card.zone === 'battlefield'));
    await game.emit('endStep', { player: a }); await settle(game); assert.ok(original.every(card => card.zone === 'ceased')); assert.ok(later.every(card => card.zone === 'battlefield'));
  });
  test(`v8 delayed effects ${role}: sacrifice cannot remove a created token now controlled by an opponent`, async () => {
    const ctx = context(role), { game, a, b } = ctx; await cast(ctx, 'Delay Sacrifice');
    const tokens = game.bf().filter(card => card.isToken); assert.equal(tokens.length, 2); tokens[0].ctrl = b; game.recalc();
    await game.endCombatStep(a); await settle(game); assert.equal(tokens[0].zone, 'battlefield'); assert.equal(tokens[1].zone, 'ceased');
  });
  test(`v8 combat removal ${role}: reconnaissance removes its target before untapping and prevents combat damage`, async () => {
    const ctx = context(role), { game, a, b } = ctx; const source = put(game, a, 'V8 Effects Remove Attacker'), attacker = put(game, a, 'Grizzly Bears');
    combat(game, attacker, b); game.tap(attacker); await activate(ctx, source);
    assert.equal(attacker.attacking, null); assert.equal(attacker.tapped, false); assert.equal(game.combat.attackers.includes(attacker), false);
    assert.equal(ctx.trace.filter(row => row.query.type === 'chooseTargets').length, 1); await game.combatDamage(a, 'normal'); await settle(game); assert.equal(b.life, 40);
  });
  test(`v8 combat removal ${role}: removing the last blocker leaves its attacker blocked`, async () => {
    const ctx = context(role), { game, a, b } = ctx; const attacker = put(game, a, 'Grizzly Bears'), blocker = put(game, b, 'Grizzly Bears');
    combat(game, attacker, b, blocker); await cast(ctx, 'Remove Blocker');
    assert.equal(blocker.blocking, null); assert.equal(attacker.blockedBy.length, 0); assert.equal(attacker.wasBlocked, true);
    await game.combatDamage(a, 'normal'); await settle(game); assert.equal(b.life, 40); assert.equal(blocker.damage, 0); assert.equal(attacker.damage, 0);
  });
  test(`v8 combat removal ${role}: a source optional retreat can be accepted and a human can decline`, async () => {
    const ctx = context(role), { game, a, b } = ctx; const source = put(game, a, 'V8 Effects Remove Self'), blocker = put(game, b, definition('V8 Large Blocker', { power: 8, toughness: 8 }));
    combat(game, source, b, blocker); game.tap(source); await game.emit('becomesBlocked', { attacker: source, blockers: [blocker] }); await settle(game);
    assert.equal(source.attacking, null); assert.equal(source.tapped, false); assert.ok(ctx.trace.some(row => row.query.type === 'chooseOption'));
    const other = context('human'), permanent = put(other.game, other.a, 'V8 Effects Remove Event'), ally = put(other.game, other.a, 'Grizzly Bears'), enemy = put(other.game, other.b, 'Grizzly Bears');
    combat(other.game, ally, other.b, enemy); other.game.tap(ally); other.state.decline = true;
    await other.game.emit('becomesBlocked', { attacker: ally, blockers: [enemy] }); await settle(other.game);
    assert.equal(ally.attacking, other.b); assert.equal(ally.tapped, true); assert.equal(permanent.attacking, null);
    assert.ok(other.trace.some(row => row.query.type === 'chooseOption' && row.answer === 'no'));
  });
  test(`v8 next untap ${role}: a standalone restriction does not tap but prevents only the next controller untap`, async () => {
    const ctx = context(role), { game, a, b } = ctx; const target = put(game, b, 'Grizzly Bears'); await cast(ctx, 'Freeze Target');
    assert.equal(target.tapped, false); assert.equal(target.meta.noUntapOnce, true); game.tap(target);
    await untapStep(game, a); assert.equal(target.tapped, true); assert.equal(target.meta.noUntapOnce, true);
    await untapStep(game, b); assert.equal(target.tapped, true); assert.equal(target.meta.noUntapOnce, false);
    await untapStep(game, b); assert.equal(target.tapped, false);
  });
  test(`v8 next untap ${role}: controller-next follows the affected object through a control change`, async () => {
    const ctx = context(role, 3), { game, b, c } = ctx; const target = put(game, b, 'Grizzly Bears'); game.tap(target); await cast(ctx, 'Freeze Target');
    target.ctrl = c; game.recalc(); await untapStep(game, b); assert.equal(target.meta.noUntapOnce, true); assert.equal(target.tapped, true);
    await untapStep(game, c); assert.equal(target.tapped, true); assert.equal(target.meta.noUntapOnce, false);
    await untapStep(game, c); assert.equal(target.tapped, false);
  });
  test(`v8 next untap ${role}: being untapped at the next step consumes the restriction`, async () => {
    const ctx = context(role), { game, b } = ctx; const target = put(game, b, 'Grizzly Bears'); await cast(ctx, 'Freeze Target');
    await untapStep(game, b); assert.equal(target.tapped, false); assert.equal(target.meta.noUntapOnce, false);
    game.tap(target); await untapStep(game, b); assert.equal(target.tapped, false);
  });
  test(`v8 next untap ${role}: two overlapping restrictions expire together and a skipped step does not consume them`, async () => {
    const ctx = context(role), { game, b } = ctx; const target = put(game, b, 'Grizzly Bears'); game.tap(target);
    await cast(ctx, 'Freeze Target'); await cast(ctx, 'Freeze Target'); b.skipUntapOnce = true;
    await untapStep(game, b); assert.equal(target.meta.noUntapOnce, true); assert.equal(target.tapped, true);
    await untapStep(game, b); assert.equal(target.meta.noUntapOnce, false); assert.equal(target.tapped, true);
    await untapStep(game, b); assert.equal(target.tapped, false);
  });
  test(`v8 next untap ${role}: a freeze prohibits the untap event before a stun counter is used`, async () => {
    const ctx = context(role), { game, b } = ctx; const target = put(game, b, 'Grizzly Bears'); game.tap(target); game.addCounters(target, 'stun', 1, false, b);
    await cast(ctx, 'Freeze Target'); await untapStep(game, b); assert.equal(target.tapped, true); assert.equal(target.counters.stun, 1);
    await untapStep(game, b); assert.equal(target.tapped, true); assert.equal(target.counters.stun || 0, 0);
    await untapStep(game, b); assert.equal(target.tapped, false);
  });
  test(`v8 next untap ${role}: blinking removes the old restriction and invalidates an unresolved target`, async () => {
    const ctx = context(role), { game, b } = ctx; const target = put(game, b, 'Grizzly Bears'); await cast(ctx, 'Freeze Target');
    await game.move(target, 'exile'); await game.move(target, 'battlefield', { ctrl: b }); game.tap(target);
    await untapStep(game, b); assert.equal(target.tapped, false); assert.equal(!!target.meta.noUntapOnce, false);
    game.turnPlayer = ctx.a; game.phase = 'main1'; await cast(ctx, 'Freeze Target', false);
    await game.move(target, 'exile'); await game.move(target, 'battlefield', { ctrl: b }); await settle(game); assert.equal(!!target.meta.noUntapOnce, false);
  });
  test(`v8 next untap ${role}: a group retains all initial nonblue creatures and excludes later arrivals`, async () => {
    const ctx = context(role), { game, a, b } = ctx;
    const friendly = put(game, a, 'Grizzly Bears'), enemy = put(game, b, 'Grizzly Bears'); game.tap(friendly);
    const blueDef = definition('V8 Blue Untap Control'); blueDef.colorsOverride = ['U']; const blue = put(game, b, blueDef);
    await cast(ctx, 'Freeze Group'); const later = put(game, b, 'Grizzly Bears'); game.tap(later);
    assert.equal(blue.tapped, false); assert.equal(!!blue.meta.noUntapOnce, false);
    assert.equal(friendly.meta.noUntapOnce, true); assert.equal(enemy.meta.noUntapOnce, true);
    await untapStep(game, b); assert.equal(enemy.tapped, true); assert.equal(later.tapped, false); assert.equal(friendly.meta.noUntapOnce, true);
    await untapStep(game, a); assert.equal(friendly.tapped, true); assert.equal(friendly.meta.noUntapOnce, false);
  });
  test(`v8 next untap ${role}: the plural continuation preserves two original targets and a later scry`, async () => {
    const ctx = context(role), { game, b } = ctx; fill(game, ctx.a, 3); ctx.state.targetCount = 2;
    const first = put(game, b, 'Grizzly Bears'), second = put(game, b, definition('V8 Second Frozen Creature', { power: 3, toughness: 3 }));
    await cast(ctx, 'Freeze Two'); for (const target of [first, second]) { assert.equal(target.tapped, true); assert.equal(target.meta.noUntapOnce, true); }
    assert.equal(ctx.trace.filter(row => row.query.type === 'chooseTargets').length, 1); assert.ok(ctx.trace.some(row => row.query.type === 'scry'));
    await untapStep(game, b); assert.equal(first.tapped, true); assert.equal(second.tapped, true);
  });
  test(`v8 next untap ${role}: combat damage freezes the actual damaged creature without targeting it`, async () => {
    const ctx = context(role), { game, a, b } = ctx; const source = put(game, a, 'V8 Effects Freeze Combat'), blocker = put(game, b, definition('V8 Freeze Blocker', { toughness: 6, kws: ['hexproof'] }));
    combat(game, source, b, blocker); await game.combatDamage(a, 'normal'); await settle(game);
    assert.equal(blocker.damage, 2); assert.equal(blocker.tapped, true); assert.equal(blocker.meta.noUntapOnce, true); assert.equal(!!source.meta.noUntapOnce, false);
    assert.equal(ctx.trace.some(row => row.query.type === 'chooseTargets'), false); await untapStep(game, b); assert.equal(blocker.tapped, true);
  });
}

for (const mode of [0, 1, 2]) test(`v8 modal trigger human: printed entry mode ${mode} chooses only its own targets before the Stack`, async () => {
  const ctx = context(), { game, a, b } = ctx; ctx.state.mode = mode; fill(game, a);
  const artifact = put(game, b, 'Sol Ring');
  const source = await cast(ctx, 'Modal Entry', false); await game.resolveTop(); await game.flushTriggers();
  const object = game.stack.at(-1), modeChoice = ctx.trace.findIndex(row => row.query.aiHint?.kind === 'mode');
  assert.ok(object?.kind === 'trigger' && object.srcCard === source); assert.equal(object.mode, mode);
  assert.equal(object.targets.length, mode === 1 ? 0 : 1);
  assert.ok(modeChoice >= 0);
  if (mode !== 1) assert.ok(ctx.trace.findIndex(row => row.query.type === 'chooseTargets') > modeChoice);
  assert.equal(b.poison || 0, 0); assert.equal(a.hand.length, 0); assert.equal(artifact.counters.oil || 0, 0);
  await settle(game);
  assert.equal(b.poison || 0, mode === 0 ? 2 : 0); assert.equal(a.hand.length, mode === 1 ? 1 : 0);
  assert.equal(artifact.counters.oil || 0, mode === 2 ? 1 : 0);
  assert.equal(ctx.trace.filter(row => row.query.aiHint?.kind === 'mode').length, 1);
});

for (const role of ['human', 'ai']) test(`v8 modal trigger ${role}: a mode with no legal targets is absent and the actual controller selects the other mode`, async () => {
  const ctx = context(role), { game, a } = ctx; fill(game, a);
  await cast(ctx, 'Modal Available');
  const choice = ctx.trace.find(row => row.query.aiHint?.kind === 'mode');
  assert.deepEqual(Array.from(choice.query.options, option => option.key), ['1']);
  assert.equal(choice.answer, '1'); assert.equal(a.hand.length, 1);
  assert.equal(ctx.trace.some(row => row.query.type === 'chooseTargets'), false);
});

test('v8 modal trigger: a stale selected target fizzles the ability without switching to an untargeted mode', async () => {
  const ctx = context(), { game, a, b } = ctx; ctx.state.mode = 2; fill(game, a);
  const artifact = put(game, b, 'Sol Ring'); await cast(ctx, 'Modal Entry', false); await game.resolveTop(); await game.flushTriggers();
  assert.equal(game.stack.at(-1).mode, 2); await game.move(artifact, 'exile'); await game.move(artifact, 'battlefield', { ctrl: b });
  await settle(game); assert.equal(artifact.counters.oil || 0, 0); assert.equal(a.hand.length, 0); assert.equal(b.poison || 0, 0);
  assert.equal(ctx.trace.filter(row => row.query.aiHint?.kind === 'mode').length, 1);
});

test('v8 modal trigger: invalid controller mode answers fall back only to an available printed mode', async () => {
  const ctx = context(), { game, a } = ctx; ctx.state.mode = 999; fill(game, a);
  await cast(ctx, 'Modal Available'); assert.equal(a.hand.length, 1); assert.equal(ctx.trace.some(row => row.query.type === 'chooseTargets'), false);
});

for (const mode of [0, 1]) test(`v8 modal trigger: intervening condition is checked at occurrence and resolution for mode ${mode}`, async () => {
  const ctx = context(), { game, a, b } = ctx; ctx.state.mode = mode; fill(game, a);
  put(game, a, 'V8 Effects Modal Condition');
  await game.emit('upkeep', { player: a }); await settle(game); assert.equal(ctx.trace.some(row => row.query.aiHint?.kind === 'mode'), false);
  const artifact = put(game, a, 'Sol Ring'); await game.emit('upkeep', { player: a }); await game.flushTriggers();
  assert.equal(game.stack.at(-1).mode, mode); await game.move(artifact, 'graveyard'); await settle(game);
  assert.equal(a.hand.length, 0); assert.equal(b.poison || 0, 0);
  await game.move(artifact, 'battlefield', { ctrl: a }); await game.emit('upkeep', { player: a }); await settle(game);
  assert.equal(a.hand.length, mode === 1 ? 1 : 0); assert.equal(b.poison || 0, mode === 0 ? 1 : 0);
});

for (const mode of [0, 1]) test(`v8 modal trigger: combat mode ${mode} retains the damaged player after the source leaves`, async () => {
  const ctx = context('human', 3), { game, a, b, c } = ctx; ctx.state.mode = mode;
  const source = put(game, a, 'V8 Effects Modal Combat'); combat(game, source, b);
  await game.combatDamage(a, 'normal'); await game.move(source, 'graveyard'); await settle(game);
  assert.equal(b.life, 38); assert.equal(b.poison || 0, mode === 0 ? 2 : 0); assert.equal(c.poison || 0, 0);
  assert.equal(game.bf().filter(card => card.ctrl === a && card.hasSub('Treasure')).length, mode === 1 ? 1 : 0);
  assert.equal(ctx.trace.some(row => row.query.type === 'chooseTargets'), false);
});

for (const mode of [0, 1]) test(`v8 modal trigger: event object mode ${mode} affects only the other entering Wolf`, async () => {
  const ctx = context(), { game, a } = ctx; ctx.state.mode = mode;
  const source = put(game, a, 'V8 Effects Modal Event'), wolf = put(game, a, definition('V8 Modal Entering Wolf', { subtypes: ['Wolf'], kws: ['shroud'] }), 'hand');
  await game.move(wolf, 'battlefield', { ctrl: a, tapped: true }); await settle(game);
  assert.equal(wolf.counters.oil || 0, mode === 0 ? 1 : 0); assert.equal(wolf.tapped, mode === 0);
  assert.equal(source.counters.oil || 0, 0); assert.equal(source.tapped, false); assert.equal(ctx.trace.some(row => row.query.type === 'chooseTargets'), false);
});

test('v8 modal trigger: a stolen source dies with last-known power and its original trigger controller chooses and draws', async () => {
  const ctx = context(), { game, a, b } = ctx; ctx.state.mode = 0; fill(game, a); fill(game, b);
  const source = put(game, b, 'V8 Effects Modal Dies'); source.ctrl = a; game.addCounters(source, '+1/+1', 3, false, a); game.recalc();
  assert.equal(source.power, 5); await game.move(source, 'graveyard'); await game.flushTriggers();
  const object = game.stack.at(-1); assert.ok(object.ctrl === a); assert.equal(object.mode, 0);
  await settle(game); assert.equal(a.hand.length, 5); assert.equal(b.hand.length, 0); assert.ok(b.graveyard.includes(source));
});

for (const mode of [0, 1]) test(`v8 activated modal human: mode ${mode} and its targets are announced before the printed payment`, async () => {
  const ctx = context(), { game, a, b } = ctx; ctx.state.mode = mode; fill(game, a); a.pool.C = 1;
  const source = put(game, a, 'V8 Effects Modal Activation'), artifact = put(game, b, 'Sol Ring');
  await activate(ctx, source, false);
  const object = game.stack.at(-1); assert.equal(object.kind, 'ability'); assert.equal(object.mode, mode);
  assert.equal(object.ctx.mode, mode); assert.equal(object.targets.length, mode === 0 ? 1 : 0);
  assert.equal(object.targetSpecs.length, mode === 0 ? 1 : 0); assert.equal(a.pool.C, 0); assert.equal(source.tapped, true);
  assert.equal(a.hand.length, 0); assert.equal(artifact.counters.oil || 0, 0);
  const modeChoice = ctx.trace.findIndex(row => row.query.aiHint?.kind === 'mode'); assert.ok(modeChoice >= 0);
  if (mode === 0) assert.ok(ctx.trace.findIndex(row => row.query.type === 'chooseTargets') > modeChoice);
  await settle(game); assert.equal(artifact.counters.oil || 0, mode === 0 ? 1 : 0); assert.equal(a.hand.length, mode === 1 ? 1 : 0);
});

for (const role of ['human', 'ai']) test(`v8 activated modal ${role}: unavailable target modes are filtered without replacing the controller`, async () => {
  const ctx = context(role), { game, a } = ctx; fill(game, a); a.pool.C = 1;
  const source = put(game, a, 'V8 Effects Modal Activation'); await activate(ctx, source);
  const choice = ctx.trace.find(row => row.query.aiHint?.kind === 'mode');
  assert.deepEqual(Array.from(choice.query.options, option => option.key), ['1']); assert.equal(choice.answer, '1');
  assert.equal(a.hand.length, 1); assert.equal(source.tapped, true); assert.equal(a.pool.C, 0);
});

test('v8 activated modal: no legal mode removes the action and an outdated action pays nothing', async () => {
  const ctx = context(), { game, a, b } = ctx; a.pool.C = 1;
  const source = put(game, a, 'V8 Effects Modal Only Targets');
  assert.equal(game.activatableList(a).some(row => row.card === source), false);
  const artifact = put(game, b, 'Sol Ring'), action = game.activatableList(a).find(row => row.card === source); assert.ok(action);
  await game.move(artifact, 'exile'); assert.equal(await game.activateAbility(a, action), false);
  assert.equal(a.pool.C, 1); assert.equal(source.tapped, false); assert.equal(game.stack.length, 0);
});

test('v8 activated modal: invalid mode choice and illegal supplied targets do not pay any cost', async () => {
  const ctx = context(), { game, a, b } = ctx; a.pool.C = 1; fill(game, a);
  const source = put(game, a, 'V8 Effects Modal Activation'), friendly = put(game, a, 'Sol Ring'); put(game, b, 'Sol Ring');
  const action = game.activatableList(a).find(row => row.card === source); ctx.state.mode = 999;
  assert.equal(await game.activateAbility(a, action), false); assert.equal(source.tapped, false); assert.equal(a.pool.C, 1);
  ctx.state.mode = 0; assert.equal(await game.activateAbility(a, action, [friendly]), false);
  assert.equal(source.tapped, false); assert.equal(a.pool.C, 1); assert.equal(friendly.counters.oil || 0, 0);
});

test('v8 activated modal: the source can be sacrificed for payment and still deal damage with its last-known lifelink', async () => {
  const ctx = context(), { game, a, b } = ctx; ctx.state.mode = 0; a.pool.C = 1;
  const source = put(game, a, 'V8 Effects Modal Sacrifice'), target = put(game, b, definition('V8 Modal Damage Target', { toughness: 6 }));
  MTG.E.pumpUntilEOT(game, source, 0, 0, ['lifelink']); ctx.state.preferredTarget = target;
  assert.equal(source.kw('lifelink'), true); await activate(ctx, source, false);
  assert.equal(source.zone, 'graveyard'); assert.equal(a.pool.C, 0); assert.equal(game.stack.at(-1).mode, 0); assert.equal(target.damage, 0);
  await settle(game); assert.equal(target.damage, 2); assert.equal(a.life, 42);
});

test('v8 activated modal: blinking the selected object does not apply another mode or refund paid costs', async () => {
  const ctx = context(), { game, a, b } = ctx; ctx.state.mode = 0; fill(game, a); a.pool.C = 1;
  const source = put(game, a, 'V8 Effects Modal Activation'), artifact = put(game, b, 'Sol Ring'); await activate(ctx, source, false);
  await game.move(artifact, 'exile'); await game.move(artifact, 'battlefield', { ctrl: b }); await settle(game);
  assert.equal(artifact.counters.oil || 0, 0); assert.equal(a.hand.length, 0); assert.equal(a.pool.C, 0); assert.equal(source.tapped, true);
});

test('v8 activated announcement preserves opponent-only abilities and rejects their stale controller', async () => {
  const ctx = context(), { game, a, b } = ctx; fill(game, a); a.pool.C = 1;
  const goat = put(game, b, 'Oft-Nabbed Goat'), action = game.activatableList(a).find(row => row.card === goat && row.opponentAbility);
  assert.ok(action); assert.equal(await game.activateAbility(a, action), true); await settle(game);
  assert.equal(goat.ctrl, a); assert.equal(goat.counters['-1/-1'], 1); assert.equal(a.hand.length, 1); assert.equal(a.pool.C, 0);
  a.pool.C = 1; assert.equal(await game.activateAbility(a, action), false);
  assert.equal(a.pool.C, 1); assert.equal(goat.counters['-1/-1'], 1); assert.equal(game.stack.length, 0);
});

for (const chosen of [[0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]]) test(`v8 spell modes human: choose-one-or-more resolves printed modes ${chosen.join(',')} in printed order`, async () => {
  const ctx = context(), { game, a, b } = ctx; fill(game, a); ctx.state.modes = chosen.slice().reverse().map(String);
  const artifact = put(game, b, 'Sol Ring'); if (!chosen.includes(0) && chosen.includes(1)) game.tap(artifact);
  const source = await cast(ctx, 'Modal More', false), object = game.stack.at(-1);
  assert.deepEqual(Array.from(object.mode), chosen); assert.equal(object.targets.length, chosen.filter(mode => mode < 2).length);
  assert.equal(object.targets.every(target => target === artifact), true, 'distinct modes may target the same permanent');
  const choice = ctx.trace.find(row => row.query.type === 'chooseMulti'); assert.equal(choice.query.min, 1); assert.equal(choice.query.max, 3);
  assert.equal(source.zone, 'stack'); assert.equal(a.hand.length, 0);
  await settle(game); assert.equal(a.hand.length, chosen.includes(2) ? 1 : 0);
  assert.equal(artifact.tapped, chosen.includes(0) && !chosen.includes(1));
});

for (const role of ['human', 'ai']) test(`v8 spell modes ${role}: an unavailable target mode is absent and the controller chooses a legal nonempty subset`, async () => {
  const ctx = context(role), { game, a } = ctx; fill(game, a); await cast(ctx, 'Modal More');
  const choice = ctx.trace.find(row => row.query.type === 'chooseMulti');
  assert.deepEqual(Array.from(choice.query.options, option => option.key), ['2']); assert.deepEqual(Array.from(choice.answer), ['2']);
  assert.equal(a.hand.length, 1); assert.equal(ctx.trace.some(row => row.query.type === 'chooseTargets'), false);
});

test('v8 spell modes actual AI: only its selected modes resolve and all target slots remain bound', async () => {
  const ctx = context('ai'), { game, a, b } = ctx; fill(game, a);
  const artifact = put(game, b, 'Sol Ring'); await cast(ctx, 'Modal More', false);
  const choice = ctx.trace.find(row => row.query.type === 'chooseMulti'), modes = Array.from(choice.answer, Number).sort();
  assert.ok(modes.length >= 1 && modes.length <= 3); assert.equal(new Set(modes).size, modes.length);
  assert.deepEqual(Array.from(game.stack.at(-1).mode), modes); await settle(game);
  assert.equal(a.hand.length, modes.includes(2) ? 1 : 0); assert.equal(artifact.tapped, modes.includes(0) && !modes.includes(1));
});

for (const selection of [[], ['0', '0'], ['99'], ['0junk'], ['0', '1', '2', '2'], null, '0', {}]) test(`v8 spell modes rejects malformed selection ${JSON.stringify(selection)} before any payment`, async () => {
  const ctx = context(), { game, a, b } = ctx; ctx.state.modes = selection;
  put(game, b, 'Sol Ring'); const spell = put(game, a, 'V8 Effects Modal More', 'hand'); a.pool.G = 1; a.pool.C = 1;
  assert.equal(await game.castSpell(a, spell, { from: 'hand' }), false);
  assert.equal(spell.zone, 'hand'); assert.equal(game.stack.length, 0); assert.equal(a.pool.G + a.pool.C, 2);
  assert.equal(ctx.trace.some(row => row.query.type === 'chooseTargets'), false);
});

test('v8 spell modes rejects a valid index that was not offered because no target exists', async () => {
  const ctx = context(), { game, a } = ctx; ctx.state.modes = ['0'];
  const spell = put(game, a, 'V8 Effects Modal More', 'hand'); a.pool.G = 1; a.pool.C = 1;
  assert.equal(await game.castSpell(a, spell, { from: 'hand' }), false); assert.equal(a.pool.G + a.pool.C, 2); assert.equal(spell.zone, 'hand');
});

test('v8 spell modes: all selected targets becoming illegal also prevents the selected untargeted draw mode', async () => {
  const ctx = context(), { game, a, b } = ctx; fill(game, a); ctx.state.modes = ['0', '2'];
  const artifact = put(game, b, 'Sol Ring'); await cast(ctx, 'Modal More', false);
  await game.move(artifact, 'exile'); await game.move(artifact, 'battlefield', { ctrl: b }); await settle(game);
  assert.equal(artifact.tapped, false); assert.equal(a.hand.length, 0, 'all spell targets illegal means the entire spell fails to resolve, including its draw mode');
});

for (const role of ['human', 'ai']) test(`v8 attacking tokens ${role}: real declaration triggers once and the newly attacking token deals combat damage without being declared`, async () => {
  const ctx = context(role), { game, a, b } = ctx;
  const source = put(game, a, 'V8 Effects Attack Trigger'); ctx.state.attackers = [{ card: source, target: b }];
  const emitted = [], emit = game.emit;
  game.emit = async function(event, data) { if (event === 'attacks') emitted.push(data.card); return emit.call(this, event, data); };
  game.priorityRound = async () => settle(game); await game.combatPhase(a);
  const declaration = ctx.trace.find(row => row.query.type === 'attackers');
  assert.ok(declaration); assert.equal(declaration.answer.some(item => item.card === source), true);
  const tokens = game.creatures(a).filter(card => card.isToken && card.hasSub('Soldier'));
  assert.equal(tokens.length, 1); assert.deepEqual(emitted, [source]);
  assert.equal(b.life, 37); assert.equal(tokens[0].sick, true);
  assert.equal(declaration.query.eligible.includes(tokens[0]), false); assert.equal(game.combat, null);
});

for (const role of ['human', 'ai']) test(`v8 attacking tokens ${role}: each replacement-created token uses a legal independent defender choice and retains entry sickness`, async () => {
  const ctx = context(role, 3), { game, a, b, c } = ctx;
  const source = put(game, a, 'Grizzly Bears'), walker = put(game, b, { ...definition('V8 Attack Planeswalker', { types: ['Planeswalker'] }), loyalty: '8' });
  walker.counters.loyalty = 8; game.recalc(); combat(game, source, b); game.phase = 'combat'; game.step = 'blockers';
  ctx.state.attackDestinationPlan = [c, walker, b, c]; game.untilEffects.push({ kind: 'tokenDouble', who: a, expires: 'eot' });
  await cast(ctx, 'Attack Token'); const tokens = game.creatures(a).filter(card => card.isToken);
  assert.equal(tokens.length, 4); const choices = ctx.trace.filter(row => row.query.aiHint?.kind === 'attackDestination'); assert.equal(choices.length, 4);
  for (const [index, token] of tokens.entries()) {
    assert.equal(token.tapped, true); assert.equal(token.sick, true); assert.ok(game.combat.attackers.includes(token));
    const choice = choices.find(row => row.query.aiHint.token === token); assert.ok(choice);
    assert.equal(choice.query.options.find(option => option.key === String(choice.answer))?.target, token.attacking);
    if (role === 'human') assert.equal(token.attacking, ctx.state.attackDestinationPlan[index]);
  }
});

for (const role of ['human', 'ai']) test(`v8 attacking tokens ${role}: no combat or an opposing active player leaves tokens tapped without creating attackers or defender prompts`, async () => {
  for (const offTurn of [false, true]) {
    const ctx = context(role, 3), { game, a, b } = ctx;
    if (offTurn) { const attacker = put(game, b, 'Grizzly Bears'); game.turnPlayer = b; combat(game, attacker, a); game.phase = 'combat'; game.step = 'blockers'; }
    await cast(ctx, 'Attack Token'); const tokens = game.creatures(a).filter(card => card.isToken);
    assert.equal(tokens.length, 2); for (const token of tokens) { assert.equal(token.tapped, true); assert.equal(token.sick, true); assert.equal(token.attacking, null); assert.equal(!!game.combat?.attackers.includes(token), false); }
    assert.equal(ctx.trace.some(row => row.query.aiHint?.kind === 'attackDestination'), false);
  }
});

test('v8 attacking tokens: an effect that omits tapped leaves the attacker untapped and sickness prevents a new declaration after removal', async () => {
  const ctx = context(), { game, a, b } = ctx; const source = put(game, a, 'Grizzly Bears'); combat(game, source, b); game.phase = 'combat';
  await cast(ctx, 'Attack Ready'); const token = game.creatures(a).find(card => card.isToken);
  assert.equal(token.attacking, b); assert.equal(token.tapped, false); assert.equal(token.sick, true);
  game.removeFromCombat(token); game.combat = null; game.priorityRound = async () => settle(game);
  await game.combatPhase(a); const declaration = ctx.trace.find(row => row.query.type === 'attackers');
  assert.ok(declaration); assert.equal(declaration.query.eligible.includes(token), false); assert.equal(token.tapped, false);
});

test('v8 attacking tokens: defender prevents normal declaration but does not prevent the printed attacking entry', async () => {
  const ctx = context(), { game, a, b } = ctx; const source = put(game, a, 'Grizzly Bears'); combat(game, source, b); game.phase = 'combat';
  await cast(ctx, 'Attack Defender'); const token = game.creatures(a).find(card => card.isToken);
  assert.equal(token.kw('defender'), true); assert.equal(game.canAttackAtAll(token), false); assert.equal(token.attacking, b); assert.ok(game.combat.attackers.includes(token));
});

test('v8 attacking tokens: a noncreature token replacement never requests a defender or joins combat', async () => {
  const ctx = context(), { game, a, b } = ctx; const source = put(game, a, 'Grizzly Bears'); combat(game, source, b); game.phase = 'combat';
  const replacement = { ...definition('V8 Attacking Treasure Replacement', { types: ['Enchantment'] }),
    replace: [{ event: 'createToken', run: async (g, defs) => defs.map(() => MTG.TOKENS.treasure) }] };
  put(game, a, replacement); await cast(ctx, 'Attack Token'); const tokens = game.bf().filter(card => card.isToken);
  assert.equal(tokens.length, 2); assert.equal(ctx.trace.some(row => row.query.aiHint?.kind === 'attackDestination'), false);
  for (const token of tokens) { assert.equal(token.hasSub('Treasure'), true); assert.equal(token.tapped, true); assert.equal(token.attacking, null); assert.equal(game.combat.attackers.includes(token), false); }
});

test('v8 attacking tokens: continuous entry type changes remove the would-be attacker before entry observers', async () => {
  const ctx = context(), { game, a, b } = ctx; const source = put(game, a, 'Grizzly Bears'); combat(game, source, b); game.phase = 'combat';
  put(game, a, { ...definition('V8 Soldier Becomes Artifact', { types: ['Enchantment'] }),
    statics: [{ phase: 1, apply: (g, src, permanents) => { for (const card of permanents) if (card.isToken) card.cur.types = ['Artifact']; } }] });
  const observed = [], emit = game.emit;
  game.emit = async function(event, data) { if (event === 'etb' && data.card?.isToken) observed.push({ card: data.card, attacking: data.card.attacking }); return emit.call(this, event, data); };
  await cast(ctx, 'Attack Token'); const tokens = game.bf().filter(card => card.isToken); assert.equal(tokens.length, 2);
  assert.equal(observed.length, 2); for (const row of observed) assert.equal(row.attacking, null);
  for (const token of tokens) { assert.equal(token.is('Creature'), false); assert.equal(token.attacking, null); assert.equal(game.combat.attackers.includes(token), false); }
});

for (const role of ['human', 'ai']) test(`v8 attacking tokens ${role}: the retained attacking token is exiled only by the real future end-of-combat trigger`, async () => {
  const ctx = context(role), { game, a, b } = ctx; const source = put(game, a, 'Grizzly Bears'); combat(game, source, b); game.phase = 'combat';
  await cast(ctx, 'Attack Delay'); const token = game.creatures(a).find(card => card.isToken);
  assert.equal(token.attacking, b); assert.equal(token.zone, 'battlefield'); assert.equal(game.delayed.length, 1);
  await game.emit('endCombat', { player: a }); await game.flushTriggers(); assert.equal(game.stack.length, 1); assert.equal(token.zone, 'battlefield');
  await settle(game); assert.equal(token.zone, 'ceased');
});

for (const role of ['human', 'ai']) test(`v8 activated cost ${role}: a chosen land can make mana before it is returned`, async () => {
  const ctx = context(role), { game, a } = ctx; fill(game, a, 2);
  const source = put(game, a, 'V8 Effects Activation Return Land');
  const land = put(game, a, 'Forest');
  assert.equal(a.pool.G + a.pool.C, 0);
  await activate(ctx, source);
  assert.equal(land.zone, 'hand');
  assert.equal(source.zone, 'battlefield');
  assert.equal(a.pool.G + a.pool.C, 0, 'the returned land pays the printed generic mana');
  assert.equal(a.hand.length, 2, 'the returned land and the drawn card are both retained');
});

for (const role of ['human', 'ai']) test(`v8 activated cost ${role}: two subtype-filtered lands pay together before the targeted effect`, async () => {
  const ctx = context(role), { game, a, b } = ctx;
  const source = put(game, a, 'V8 Effects Activation Return Two Islands');
  const first = put(game, a, 'Island'), second = put(game, a, 'Island');
  const forest = put(game, a, 'Forest'), victim = put(game, b, 'Grizzly Bears');
  await activate(ctx, source);
  assert.equal(first.zone, 'hand'); assert.equal(second.zone, 'hand');
  assert.equal(forest.zone, 'battlefield'); assert.equal(victim.zone, 'hand');
  assert.equal(a.pool.U + a.pool.C, 0);
});

test('v8 activated return cost validates the complete choice before paying mana or changing zones', async () => {
  for (const mode of ['cancel', 'foreign', 'stale']) {
    const ctx = context(), { game, a, b } = ctx;
    const source = put(game, a, 'V8 Effects Activation Return Land');
    const own = put(game, a, 'Forest'), foreign = put(game, b, 'Forest');
    const action = game.activatableList(a).find(row => row.card === source); assert.ok(action);
    if (mode === 'stale') await game.move(own, 'hand');
    else {
      const decide = a.controller.decide.bind(a.controller);
      a.controller.decide = async (g, query) => query.aiHint?.kind === 'bounceCost'
        ? (mode === 'foreign' ? [foreign] : []) : decide(g, query);
    }
    assert.equal(await game.activateAbility(a, action), false, mode);
    assert.equal(source.zone, 'battlefield'); assert.equal(source.tapped, false);
    assert.equal(foreign.zone, 'battlefield'); assert.equal(foreign.tapped, false);
    if (mode !== 'stale') { assert.equal(own.zone, 'battlefield'); assert.equal(own.tapped, false); }
    assert.equal(a.pool.G + a.pool.C, 0);
    assert.equal(game.stack.length, 0);
  }
});

test('v8 activated return cost can return the source artifact while its ability keeps resolving', async () => {
  const ctx = context(), { game, a } = ctx; fill(game, a, 1);
  const source = put(game, a, 'V8 Effects Activation Return Artifact');
  const land = put(game, a, 'Forest');
  await activate(ctx, source);
  assert.equal(source.zone, 'hand'); assert.equal(land.zone, 'battlefield');
  assert.equal(a.hand.length, 2, 'the source return is a cost and the Stack effect still draws');
});

test('v8 activated return-cost grammar rejects optional, hostile, and unconsumed variants', () => {
  for (const oracle of [
    "Return up to one land you control to its owner's hand: Draw a card.",
    "Return a land you don't control to its owner's hand: Draw a card.",
    "Return two lands you control to one owner's hand: Draw a card.",
    "{1}, Return any number of lands you control to their owners' hands: Draw a card.",
    "{1}, Return a land you control to its owner's hand, perform an unknown cost: Draw a card.",
  ]) assert.equal(semanticClass({ ...input('Bad Return Cost', oracle, 'Artifact') }, { compilerVersion: 8 }).semanticClass, undefined, oracle);
});

for (const role of ['human', 'ai']) test(`v8 activated cost ${role}: random discard uses seeded engine randomness without a hidden-card choice`, async () => {
  const ctx = context(role), { game, a, b } = ctx;
  const source = put(game, a, 'V8 Effects Activation Random One');
  const first = put(game, a, definition('V8 Random First'), 'hand');
  const second = put(game, a, definition('V8 Random Second'), 'hand');
  const third = put(game, a, definition('V8 Random Third'), 'hand');
  const foreign = put(game, b, definition('V8 Random Foreign'), 'hand');
  game.rnd = () => 0;
  await activate(ctx, source);
  assert.equal(first.zone, 'hand'); assert.equal(second.zone, 'graveyard'); assert.equal(third.zone, 'hand');
  assert.equal(foreign.zone, 'hand'); assert.equal(source.power, 4);
  assert.equal(ctx.trace.some(row => row.query.type === 'chooseCards' && row.query.aiHint?.kind === 'addlDiscard'), false);
});

for (const role of ['human', 'ai']) test(`v8 activated cost ${role}: random two-card discard and mana are both paid before the targeted effect`, async () => {
  const ctx = context(role), { game, a, b } = ctx;
  const source = put(game, a, 'V8 Effects Activation Random Two');
  const land = put(game, a, 'Forest'), first = put(game, a, definition('V8 Random Pair A'), 'hand');
  const second = put(game, a, definition('V8 Random Pair B'), 'hand'), target = put(game, b, 'Grizzly Bears');
  await activate(ctx, source);
  assert.equal(first.zone, 'graveyard'); assert.equal(second.zone, 'graveyard');
  assert.equal(land.tapped, true); assert.equal(a.pool.G + a.pool.C, 0);
  assert.equal(target.counters['+1/+1'], 1);
});

test('v8 activated random-discard cost rechecks stale hand capacity before spending mana', async () => {
  const ctx = context(), { game, a } = ctx;
  const source = put(game, a, 'V8 Effects Activation Random Two');
  const land = put(game, a, 'Forest'), first = put(game, a, definition('V8 Random Stale A'), 'hand');
  put(game, a, definition('V8 Random Stale B'), 'hand');
  put(game, a, 'Grizzly Bears');
  const action = game.activatableList(a).find(row => row.card === source); assert.ok(action);
  await game.move(first, 'graveyard');
  assert.equal(await game.activateAbility(a, action), false);
  assert.equal(land.tapped, false); assert.equal(source.zone, 'battlefield'); assert.equal(game.stack.length, 0);
});

test('v8 activated random-discard cost remains paid when a replacement moves the random card elsewhere', async () => {
  const ctx = context(), { game, a } = ctx; fill(game, a, 1);
  const replacement = definition('V8 Random Replacement', { types: ['Artifact'] }); replacement.discardToLibraryTop = true;
  put(game, a, replacement); const source = put(game, a, 'V8 Effects Activation Random One');
  const paid = put(game, a, definition('V8 Random Replaced Card'), 'hand');
  await activate(ctx, source);
  assert.equal(paid.zone, 'library'); assert.equal(source.power, 4);
});

test('v8 activated random-discard grammar rejects chosen, optional, and unconsumed variants', () => {
  for (const oracle of [
    'Discard up to one card at random: Draw a card.',
    'Discard a nonland card at random: Draw a card.',
    'Discard a card chosen at random by an opponent: Draw a card.',
    'Discard any number of cards at random: Draw a card.',
    '{1}, Discard a card at random, perform an unknown cost: Draw a card.',
  ]) assert.equal(semanticClass({ ...input('Bad Random Cost', oracle, 'Enchantment') }, { compilerVersion: 8 }).semanticClass, undefined, oracle);
});

for (const role of ['human', 'ai']) test(`v8 activated cost ${role}: source counters and the source are one complete paid cost`, async () => {
  const ctx = context(role), { game, a } = ctx; fill(game, a, 3);
  const source = put(game, a, 'V8 Effects Activation Quest Cost');
  source.counters.quest = 3; game.recalc();
  await activate(ctx, source);
  assert.equal(source.zone, 'graveyard'); assert.equal(a.hand.length, 2);
});

for (const role of ['human', 'ai']) test(`v8 activated cost ${role}: mana, tap, source counters, and sacrifice all precede the effect`, async () => {
  const ctx = context(role), { game, a } = ctx;
  const source = put(game, a, 'V8 Effects Activation Pressure Cost');
  source.counters.pressure = 2; game.recalc();
  const first = put(game, a, 'Mountain'), second = put(game, a, 'Mountain');
  await activate(ctx, source);
  assert.equal(source.zone, 'graveyard'); assert.equal(first.tapped, true); assert.equal(second.tapped, true);
  const token = game.creatures(a).find(card => card.isToken && card.hasSub('Hellion'));
  assert.ok(token); assert.equal(token.power, 4); assert.equal(token.toughness, 4); assert.equal(token.kw('haste'), true);
});

test('v8 activated remove-and-sacrifice cost cannot partially pay after stale counter, sacrifice, or mana state', async () => {
  for (const mode of ['counter', 'sacrifice', 'mana']) {
    const ctx = context(), { game, a } = ctx;
    const source = put(game, a, 'V8 Effects Activation Pressure Cost');
    source.counters.pressure = 2; game.recalc();
    const first = put(game, a, 'Mountain'), second = put(game, a, 'Mountain');
    const action = game.activatableList(a).find(row => row.card === source); assert.ok(action, mode);
    if (mode === 'counter') game.removeCounters(source, 'pressure', 1);
    if (mode === 'sacrifice') source.cur.cantSacrifice = true;
    if (mode === 'mana') second.tapped = true;
    const counters = source.counters.pressure;
    assert.equal(await game.activateAbility(a, action), false, mode);
    assert.equal(source.zone, 'battlefield'); assert.equal(source.tapped, false);
    assert.equal(source.counters.pressure, counters); assert.equal(first.tapped, false);
    assert.equal(game.stack.length, 0);
  }
});

test('v8 activated remove-and-sacrifice cost is not offered without every printed counter', () => {
  const ctx = context(), { game, a } = ctx;
  const source = put(game, a, 'V8 Effects Activation Quest Cost'); source.counters.quest = 2; game.recalc();
  assert.equal(game.activatableList(a).some(row => row.card === source), false);
});

test('v8 activated remove-and-sacrifice grammar rejects other sources and unfinished conjunctions', () => {
  for (const oracle of [
    'Remove three quest counters from target enchantment and sacrifice it: Draw two cards.',
    'Remove three quest counters from this enchantment or sacrifice it: Draw two cards.',
    'Remove any number of quest counters from this enchantment and sacrifice it: Draw two cards.',
    'Remove three unknownthing counters from this enchantment and sacrifice it: Draw two cards.',
    'Remove three quest counters from this enchantment and sacrifice another permanent: Draw two cards.',
  ]) assert.equal(semanticClass({ ...input('Bad Remove Sacrifice Cost', oracle, 'Enchantment') }, { compilerVersion: 8 }).semanticClass, undefined, oracle);
});

for (const role of ['human', 'ai']) test(`v8 activated cost ${role}: exert is paid with the tap and creates the printed token`, async () => {
  const ctx = context(role), { game, a } = ctx;
  const source = put(game, a, 'V8 Effects Activation Exert Cost');
  const seen = []; const emit = game.emit;
  game.emit = async function(event, data) { if (event === 'exerted') seen.push(data); return emit.call(this, event, data); };
  await activate(ctx, source);
  assert.equal(source.tapped, true); assert.equal(source.meta.noUntapOnce, true);
  assert.equal(seen.length, 1); assert.equal(seen[0].card, source); assert.equal(seen[0].player, a);
  const token = game.creatures(a).find(card => card.isToken && card.hasSub('Warrior'));
  assert.ok(token); assert.equal(token.kw('vigilance'), true);
});

for (const role of ['human', 'ai']) test(`v8 activated cost ${role}: a source-named exert cost pays mana before drawing`, async () => {
  const ctx = context(role), { game, a } = ctx; fill(game, a, 1);
  const source = put(game, a, 'V8 Effects Activation Named Exert'), land = put(game, a, 'Plains');
  await activate(ctx, source);
  assert.equal(source.tapped, true); assert.equal(source.meta.noUntapOnce, true);
  assert.equal(land.tapped, true); assert.equal(a.hand.length, 1);
});

for (const role of ['human', 'ai']) test(`v8 activated cost ${role}: exert remains a real immediate mana ability`, async () => {
  const ctx = context(role), { game, a } = ctx;
  const source = put(game, a, 'V8 Effects Activation Exert Mana');
  const spell = put(game, a, 'Grizzly Bears', 'hand');
  const seen = []; const emit = game.emit;
  game.emit = async function(event, data) { if (event === 'exerted') seen.push(data); return emit.call(this, event, data); };
  assert.equal([].concat(source.def.mana || []).length, 1);
  assert.equal((source.def.abilities || []).length, 0, 'the mana ability must not use the Stack');
  assert.equal(await game.castSpell(a, spell, { from: 'hand' }), true);
  assert.equal(source.tapped, true); assert.equal(source.meta.noUntapOnce, true);
  assert.equal(seen.length, 1); assert.equal(seen[0].card, source); assert.equal(seen[0].player, a);
  assert.equal(Object.values(a.pool).reduce((sum, n) => sum + n, 0), 0);
  await settle(game); assert.equal(spell.zone, 'battlefield');
});

test('v8 activated exert cost skips exactly the next controller untap step', async () => {
  const ctx = context(), { game, a } = ctx;
  const source = put(game, a, 'V8 Effects Activation Exert Cost'); await activate(ctx, source);
  await untapStep(game, a); assert.equal(source.tapped, true); assert.equal(source.meta.noUntapOnce, false);
  await untapStep(game, a); assert.equal(source.tapped, false); assert.equal(source.meta.noUntapOnce, false);
});

test('v8 activated exert cost never installs its marker when mana becomes stale', async () => {
  const ctx = context(), { game, a } = ctx; fill(game, a, 1);
  const source = put(game, a, 'V8 Effects Activation Named Exert'), land = put(game, a, 'Plains');
  const action = game.activatableList(a).find(row => row.card === source); assert.ok(action);
  land.tapped = true;
  assert.equal(await game.activateAbility(a, action), false);
  assert.equal(source.tapped, false); assert.equal(!!source.meta.noUntapOnce, false); assert.equal(a.hand.length, 0);
});

test('v8 activated exert grammar rejects nonself, untapped, noncreature, and unconsumed variants', () => {
  for (const [oracle, type] of [
    ['{T}, Exert another creature: Draw a card.', 'Creature'],
    ['Exert this creature: Draw a card.', 'Creature'],
    ['{T}, Exert a creature you control: Draw a card.', 'Creature'],
    ['{T}, Exert Wrong Name: Draw a card.', 'Creature'],
    ['{T}, Exert this artifact: Draw a card.', 'Artifact'],
    ['{T}, Exert this creature, perform an unknown cost: Draw a card.', 'Creature'],
  ]) assert.equal(semanticClass({ ...input('Bad Exert Cost', oracle, type), ...(type === 'Creature' ? { power: '2', toughness: '2' } : {}) }, { compilerVersion: 8 }).semanticClass, undefined, oracle);
});

for (const role of ['human', 'ai']) test(`v8 storage mana ${role}: the controller chooses N and the mana ability is immediate`, async () => {
  const ctx = context(role), { game, a, state, trace } = ctx;
  const source = put(game, a, 'V8 Effects Activation Storage Mana');
  game.addCounters(source, 'storage', 3, false, a);
  if (role === 'human') state.storageN = 2;
  const action = game.activatableList(a).find(row => row.card === source && row.manaAbility && row.manaSource.m.storageCounterMana);
  assert.ok(action, 'the flexible storage mana ability is exposed through the real mana action');
  assert.equal(await game.activateAbility(a, action), true);
  const choice = trace.find(row => row.query.aiHint?.kind === 'storageManaAmount');
  assert.ok(choice, 'the actual controller chooses the public counter amount');
  const selected = choice.query.options.find(option => option.key === choice.answer);
  const n = selected?.n;
  assert.ok(Number.isInteger(n) && n > 0 && n <= 3);
  if (role === 'human') assert.equal(n, 2);
  assert.equal(source.counters.storage, 3 - n);
  assert.equal(source.tapped, true); assert.equal(a.pool.G, n);
  assert.equal(game.stack.length, 0, 'the mana ability never uses the Stack');
});

test('v8 storage mana supports the printed zero choice without inventing mana', async () => {
  const ctx = context(), { game, a, state } = ctx; state.storageN = 0;
  const source = put(game, a, 'V8 Effects Activation Storage Mana');
  const action = game.activatableList(a).find(row => row.card === source && row.manaAbility && row.manaSource.m.storageCounterMana);
  assert.ok(action); assert.equal(await game.activateAbility(a, action), true);
  assert.equal(source.tapped, true); assert.equal(source.counters.storage || 0, 0);
  assert.equal(Object.values(a.pool).reduce((sum, n) => sum + n, 0), 0); assert.equal(game.stack.length, 0);
});

for (const role of ['human', 'ai']) test(`v8 storage mana ${role}: automatic payment removes exactly the mana actually produced`, async () => {
  const ctx = context(role), { game, a } = ctx;
  const source = put(game, a, 'V8 Effects Activation Storage Mana');
  game.addCounters(source, 'storage', 3, false, a);
  const spell = put(game, a, definition('V8 Storage Payment Spell', { cost: '{G}{G}' }), 'hand');
  assert.equal(await game.castSpell(a, spell, { from: 'hand' }), true);
  assert.equal(source.tapped, true); assert.equal(source.counters.storage, 1);
  assert.equal(Object.values(a.pool).reduce((sum, n) => sum + n, 0), 0);
  await settle(game); assert.equal(spell.zone, 'battlefield');
});

test('v8 storage mana rechecks a stale public counter choice before tapping or producing', async () => {
  const ctx = context(), { game, a } = ctx;
  const source = put(game, a, 'V8 Effects Activation Storage Mana'); game.addCounters(source, 'storage', 3, false, a);
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, query) => {
    if (query.aiHint?.kind === 'storageManaAmount') {
      source.counters.storage = 1;
      return query.options.find(option => option.n === 2).key;
    }
    return decide(g, query);
  };
  const action = game.activatableList(a).find(row => row.card === source && row.manaAbility && row.manaSource.m.storageCounterMana);
  assert.ok(action); assert.equal(await game.activateAbility(a, action), false);
  assert.equal(source.tapped, false); assert.equal(source.counters.storage, 1);
  assert.equal(Object.values(a.pool).reduce((sum, n) => sum + n, 0), 0); assert.equal(game.stack.length, 0);
});

test('v8 storage mana grammar rejects other counters, other objects, bounded X cycles, and unfinished effects', () => {
  for (const [oracle, type = 'Land'] of [
    ['{T}, Remove any number of charge counters from this land: Add {G} for each charge counter removed this way.'],
    ['{T}, Remove any number of storage counters from another land: Add {G} for each storage counter removed this way.'],
    ['{T}, Remove up to three storage counters from this land: Add {G} for each storage counter removed this way.'],
    ['{1}, Remove X storage counters from this land: Add X mana in any combination of {G} and/or {G}.'],
    ['{1}, Remove X storage counters from another land: Add X mana in any combination of {G} and/or {W}.'],
    ['{1}, Remove X storage counters from this artifact: Add X mana in any combination of {G} and/or {W}.', 'Artifact'],
    ['{T}, Remove any number of storage counters from this land: Add {G}{G} for each storage counter removed this way.'],
    ['{T}, Remove any number of storage counters from this land: Add {G} for each storage counter on it.'],
    ['{T}, Remove any number of storage counters from this artifact: Add {G} for each storage counter removed this way.', 'Artifact'],
  ]) assert.equal(semanticClass({ ...input('Bad Storage Mana', oracle, type) }, { compilerVersion: 8 }).semanticClass, undefined, oracle);

  // The printed split storage land pays one counter per mana added and divides
  // the removed counters freely between its two printed colors.
  const split = semanticClass({ ...input('Split Storage Land',
    '{1}, Remove X storage counters from this land: Add X mana in any combination of {G} and/or {W}.', 'Land') },
    { compilerVersion: 8 });
  assert.equal(split.semanticClass, 'land-mana-template');
  assert.deepEqual(split.implementation[0].storageCounterMana, { kind: 'storage', colors: ['G', 'W'] });
  assert.equal(split.implementation[0].activationCost.mana, '{1}');
});

test('v8 modal parser rejects unknown modes, trailing clauses, unknown headers and unsupported choice timing', () => {
  for (const text of [
    'When this creature enters, choose one —\n• Target opponent gets a poison counter.\n• Do something unknown.',
    'When this creature enters, choose one —\n• Target opponent gets a poison counter.\n• Draw a card. Also ignore undefined rules.',
    'When this creature performs an unknown event, choose one —\n• Target opponent gets a poison counter.\n• Draw a card.',
    'When this creature enters, choose one or more —\n• Target opponent gets a poison counter.\n• Draw a card.',
    'When this creature enters, choose two —\n• Target opponent gets a poison counter.\n• Draw a card.',
    'When this creature enters, you may choose one —\n• Target opponent gets a poison counter.\n• Draw a card.',
    'When this creature enters, choose one —\n• If you control an artifact, target opponent gets a poison counter.\n• If you control an artifact, draw a card.',
    'When this creature enters, choose one —\n• Target opponent gets a poison counter.',
    '{T}: Choose one —\n• Target opponent gets a poison counter.\n• Do something unknown.',
    '{T}: Choose one —\n• Add {G}.\n• Draw a card.',
    '{X}: Choose one —\n• Destroy target creature with mana value X.\n• Draw a card.',
    '{T}: Choose one —\n• Target opponent gets a poison counter.\n• Draw a card. Activate only once each turn.',
  ]) assert.equal(semanticClass({ ...input('Bad Modal', text, 'Creature'), power: '2', toughness: '3' }, { compilerVersion: 8 }).semanticClass, undefined, text);
});

test('v8 effect parser rejects incomplete instructions and unsupported semantic suffixes', () => {
  for (const oracle of [
    'Choose one or more —\n• Draw a card.\n• Do something unknown.',
    'Choose one or more —\n• Draw a card.\n• Gain 2 life. Then do something unknown.',
    'Choose one or more —\n• Draw a card.',
    'Create a 1/1 white Soldier creature token that is attacking a player chosen secretly.',
    "Create a 1/1 white Soldier creature token that's tapped and attacking that player.",
    'Create a Treasure token that is attacking.',
    'Put a +1/+1 counter on target creature, then do something unknown.',
    'Search your library for a basic land card, put that card onto the battlefield tapped.',
    'Search your library for an unknown card quality, put that card into your hand, then shuffle.',
    'Search your library for a card named Alpha or Beta, put that card into your hand, then shuffle.',
    'Search your library for a card named Elf, reveal it, exile it, put it into your hand, then shuffle.',
    'You draw a card and you lose 1 life unless an opponent dances.',
    'Target creature deals damage to itself equal to its power. Ignore all rules.',
    'Draw cards equal to the power of target creature, then win the game without a defined condition.',
    'Each player loses 1 life for each creature they control except creatures chosen secretly.',
    'Draw a card for each tapped creature target opponent controls until end of turn.',
    'Destroy target artifact. You gain life equal to its mana value unless they pay a secret amount.',
    'Put two target creature cards from your graveyard on top of your library and exile them.',
    'Look at the top three cards of your library. Put one of them into your hand and the other into your graveyard.',
    'Search your library for up to three cards, exile them, then shuffle.',
    'Search your library for a green card with an unknown quality, put it into your hand, then shuffle.',
    'Look at the top three cards of your library. Put two of them into your hand and the other into your graveyard. Destroy everything without defined semantics.',
    'You gain 3 life. Look at the top five cards of your library. Put one card wherever you want.',
    'You may discard two cards, then exile your hand. If you do, draw three cards.',
    'You may sacrifice a creature or do something unknown. If you do, draw a card.',
    'You may exile a creature card from your graveyard without revealing it. If you do, draw a card.',
    'You may pay {E}. If you do, draw a card.',
    'Reveal cards from the top of your library until you reveal a nonlegendary creature card with lesser mana value, put it onto the battlefield, then put the rest on the bottom of your library in a random order.',
    'You may sacrifice two creatures. If you do, reveal cards from the top of your library until you reveal a nonlegendary creature card with lesser mana value, put it onto the battlefield, then put the rest on the bottom of your library in a random order.',
    'You may pay {X}. If you do, draw X cards. X cannot be larger than a secret number.',
    'Destroy all creatures. You gain 2 life for each enchantment destroyed this way.',
    'Draw a card and this creature gains an undefined ability until end of turn.',
    'Each opponent gets a poison counter unless they do something unknown.',
    'Each opponent gets an undefined counter.',
    'Target opponent loses 2 life, gets a poison counter, then reveals a secret card without a choice.',
    'Untap all creatures you control. They gain an undefined keyword until end of turn.',
    'Untap all creatures you control. They gain flying until end of turn except another player chooses one.',
    'Artifact creatures you control gain deathtouch while something unknown happens.',
    'You may pay {X}. If you do, destroy target creature with mana value X.',
    'Put an unknownthing counter on target creature.',
    'Put a finality counter on target creature.',
    'Put a hone counter on target Equipment.',
    'Put a rad counter on target player.',
    'Put an oil counter on this creature without retaining the remaining instruction.',
    'Destroy target creature at end of combat unless it pays an unknown cost.',
    "Return target card from your graveyard to your hand at the beginning of the next end step.",
    'Create a 1/1 white Soldier creature token. Exile it at the beginning of the next end step except during a secret turn.',
    'Remove target permanent from combat.',
    'Remove target creature from combat and do something undefined.',
    "Target creature doesn't untap during an unknown player's next untap step.",
    "Tap all creatures. Those creatures don't untap during a secret player's next untap step.",
  ]) assert.equal(semanticClass(input('Rejected', oracle), { compilerVersion: 8 }).semanticClass, undefined, oracle);
});
