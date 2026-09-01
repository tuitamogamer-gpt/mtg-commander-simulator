import assert from 'node:assert/strict';
import {countValue, matchesTarget, stageCount} from './oracle-v5-proof.mjs';

const installed = new WeakSet(), worlds = new WeakMap(), libraryWorlds = new WeakMap(), wrappedControllers = new WeakSet();
const key = value => JSON.stringify(value);
const ids = cards => Array.from(cards, card => card.iid);
const permanentTypes = ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Land', 'Planeswalker'];
const cardTypes = new Set([...permanentTypes, 'Instant', 'Kindred', 'Sorcery']);

function snapshot(card) {
  const types = Array.from(card.cur?.types || card.def.types || []), subtypes = Array.from(card.cur?.subtypes || card.def.subtypes || []);
  const keywords = Array.from(card.cur?.kw || card.def.kws || []), superTypes = Array.from(card.cur?.super || card.def.super || []);
  return {card, iid: card.iid, zone: card.zone, version: card.zoneVersion, ctrl: card.ctrl, owner: card.owner,
    tapped: card.tapped, name: card.name, mv: card.mv, power: card.power, toughness: card.toughness,
    colors: Array.from(card.colors), def: {...card.def, super: superTypes}, cur: {super: superTypes},
    isToken: card.isToken, commander: card.commander, counters: {...card.counters}, meta: {...card.meta},
    attachments: Array.from(card.attachments || []), attacking: card.attacking, blocking: card.blocking,
    is: type => types.includes(type), hasSub: type => subtypes.includes(type) || keywords.includes('changeling'), kw: keyword => keywords.includes(keyword)};
}

const definition = object => object?.def || object?.definition || null;
function relationMatches(card, relation, reference) {
  if (!relation) return true;
  if (!reference) return false;
  if (relation.kind === 'stat') {
    const stat = relation.stat || 'mv', value = Number(card?.[stat]), threshold = Number(reference?.[stat]);
    return Number.isFinite(value) && Number.isFinite(threshold) &&
      (relation.comparison === 'greater' ? value > threshold : relation.comparison === 'lesser' ? value < threshold : false);
  }
  if (relation.kind === 'shares-card-type') {
    const types = new Set((definition(reference)?.types || reference.types || []).filter(type => cardTypes.has(type)));
    return (definition(card)?.types || []).some(type => types.has(type));
  }
  return false;
}
function relationReference(engine, relation) {
  const reference = relation?.reference;
  if (reference?.kind === 'target') {
    const saved = engine._oracleTargetControllers?.[reference.index]?.[0], card = saved?.subject;
    if (!saved || !card) return null;
    const object = card.zoneVersion === saved.zoneVersion ? card : card.battlefieldLKI?.get(saved.zoneVersion) || saved.stats;
    return object?.iid && typeof object.is === 'function' ? snapshot(object) : object;
  }
  if (reference?.kind === 'payment-card') return engine.oraclePaymentCapture?.cards?.[reference.index]?.before || null;
  if (reference?.kind === 'event-card') {
    const card = engine.oracleSourceCapture?.eventCard || engine.data?.card;
    return engine.data?.card === card && engine.data?.snap ? engine.data.snap
      : card?.zoneVersion === engine.eventCardZoneVersion ? snapshot(card) : card?.battlefieldLKI?.get(engine.eventCardZoneVersion) || null;
  }
  return null;
}

function amount(value, engine, context, before) {
  if (typeof value === 'number') return Math.max(0, value);
  if (value === 'X') return Math.max(0, engine.x ?? engine.src?.castMeta?.x ?? 0);
  if (value?.kind === 'sum') return value.values.reduce((sum, child) => sum + amount(child, engine, context, before), 0);
  return countValue({...context, a: engine.you}, engine.src, value, before);
}

function expectedOwners(engine, effect) {
  const who = effect.who;
  return who === undefined || who === 'you' ? [engine.you]
    : typeof who === 'number' ? [engine.targets?.[who]].flat().filter(Boolean)
    : who === 'each-player' || who === 'each-opponent' ? engine.g.apnapFrom(engine.g.turnPlayer || engine.you).filter(player => who === 'each-player' || player !== engine.you)
    : who?.kind === 'target-controller' ? [...new Set((engine._oracleTargetControllers?.[who.index] || []).map(record => record.subject?.zoneVersion === record.zoneVersion ? record.subject.ctrl : record.controller))]
    : who === 'event-player' ? [engine.oracleSourceCapture?.eventPlayer]
    : who === 'event-card-controller' ? [engine.oracleSourceCapture?.eventController] : [];
}

const resolveFilter = (filter, x) => ({...filter, controller: 'any', ...(filter.threshold === 'X' ? {threshold: x} : {}),
  ...(filter.alternatives ? {alternatives: filter.alternatives.map(child => resolveFilter(child, x))} : {})});

// These wrappers observe only real runtime calls in the registered game. AI
// simulation clones have no WeakMap entry and cannot manufacture proof rows.
export function installLibraryProof(MTG, context, helpers) {
  if (!context.libraryProof) {
    const proof = context.libraryProof = {rows: [], queries: [], reveals: [], entries: [], graveyardEntries: [], graveyardLeaves: [], shuffles: [], staged: new WeakSet()};
    const reveal = context.game.revealToHuman.bind(context.game);
    context.game.revealToHuman = async query => {
      proof.reveals.push({cards: Array.from(query.cards || []), ctrl: query.ctrl, kind: query.kind});
      return reveal(query);
    };
    const emit = context.game.emit.bind(context.game);
    context.game.emit = async (event, data) => {
      if (event === 'etb') proof.entries.push({card: data.card, battlefield: context.game.battlefield.map(snapshot)});
      if (event === 'cardsToGraveyard') proof.graveyardEntries.push({cards: Array.from(data.cards || []),
        froms: Array.from(data.froms || data.cards?.map(() => data.from) || []), states: Array.from(data.cards || [], snapshot)});
      if (event === 'cardsLeftGraveyard') proof.graveyardLeaves.push({cards: Array.from(data.cards || []), snapshots: Array.from(data.snapshots || []),
        destinations: Array.from(data.destinations || data.cards?.map(() => data.to) || []), states: Array.from(data.cards || [], snapshot)});
      return emit(event, data);
    };
  }
  if (helpers) context.libraryProof.helpers = helpers;
  for (const player of context.game.players) {
    libraryWorlds.set(player.library, {context, owner: player});
    const controller = player.controller;
    if (wrappedControllers.has(controller)) continue;
    wrappedControllers.add(controller);
    const decide = controller.decide.bind(controller);
    controller.decide = async (game, query) => {
      const record = {player, query, from: Array.from(query.from || []), cards: Array.from(query.cards || [])};
      if (game === context.game) context.libraryProof.queries.push(record);
      record.answer = await decide(game, query);
      return record.answer;
    };
  }
  worlds.set(context.game, context);
  if (installed.has(MTG)) return;
  installed.add(MTG);
  const shuffle = MTG.shuffle;
  MTG.shuffle = (cards, rnd) => {
    const bound = libraryWorlds.get(cards);
    if (!bound) return shuffle(cards, rnd);
    const record = {owner: bound.owner, cards, before: Array.from(cards)};
    bound.context.libraryProof.shuffles.push(record);
    const result = shuffle(cards, rnd); record.after = Array.from(cards); return result;
  };
  const process = MTG.OracleV8Library.process;
  MTG.OracleV8Library.process = async (engine, effect, runtimeHelpers, owner, chooser, execution) => {
    const current = worlds.get(engine.g);
    if (!current) return process(engine, effect, runtimeHelpers, owner, chooser, execution);
    const proof = current.libraryProof, before = proof.helpers?.genericProofSnapshot?.(current, owner.library);
    const row = {effect, source: engine.src, you: engine.you, owner, chooser, execution, x: engine.x ?? engine.src?.castMeta?.x ?? 0, before,
      library: Array.from(owner.library), states: new Map(owner.library.map(card => [card, snapshot(card)])),
      otherLibraries: new Map(engine.g.players.filter(player => player !== owner).map(player => [player, Array.from(player.library)])),
      queryStart: proof.queries.length,
      revealStart: proof.reveals.length, entryStart: proof.entries.length, engine};
    row.relationReference = effect.until?.relation ? relationReference(engine, effect.until.relation) : null;
    row.expectedOwners = expectedOwners(engine, effect);
    if (effect.until) {
      row.matchCount = Math.floor(amount(effect.until.n, engine, current, before)); row.top = []; let found = 0;
      if (row.matchCount) for (const card of row.library.slice().reverse()) {
        row.top.push(card);
        if (matchesTarget(row.states.get(card), resolveFilter(effect.until.filter, row.x), {...current, a: engine.you, countSnapshot: before}, engine.src) &&
            relationMatches(row.states.get(card), effect.until.relation, row.relationReference)) found++;
        if (found >= row.matchCount) break;
      }
      row.n = row.top.length;
    } else {row.n = Math.floor(amount(effect.n, engine, current, before)); row.top = row.n ? row.library.slice(-row.n).reverse() : [];}
    proof.rows.push(row);
    const result = await process(engine, effect, runtimeHelpers, owner, chooser, execution);
    row.after = new Map(row.library.map(card => [card, snapshot(card)])); row.afterLibrary = Array.from(owner.library);
    row.queries = proof.queries.slice(row.queryStart); row.reveals = proof.reveals.slice(row.revealStart);
    row.entries = proof.entries.slice(row.entryStart);
    row.afterOtherLibraries = new Map([...row.otherLibraries.keys()].map(player => [player, Array.from(player.library)]));
    return result;
  };
  const shuffleZones = MTG.OracleV8Library.shuffleZones;
  MTG.OracleV8Library.shuffleZones = async (engine, effect, runtimeHelpers, owners, execution) => {
    const current = worlds.get(engine.g);
    if (!current) return shuffleZones(engine, effect, runtimeHelpers, owners, execution);
    const proof = current.libraryProof, ownerSet = new Set(owners);
    const before = new Map(owners.map(owner => [owner, {
      library: Array.from(owner.library), hand: Array.from(owner.hand), graveyard: Array.from(owner.graveyard),
      states: new Map([...owner.library, ...owner.hand, ...owner.graveyard].map(card => [card, snapshot(card)])),
    }]));
    const row = {kind: 'zone-shuffle', effect, source: engine.src, you: engine.you, owners: Array.from(owners), expectedOwners: expectedOwners(engine, effect),
      execution, before, otherPlayers: new Map(engine.g.players.filter(player => !ownerSet.has(player)).map(player => [player, {
        library: Array.from(player.library), hand: Array.from(player.hand), graveyard: Array.from(player.graveyard), exile: Array.from(player.exile),
      }])), queryStart: proof.queries.length, revealStart: proof.reveals.length, shuffleStart: proof.shuffles.length,
      graveyardLeaveStart: proof.graveyardLeaves.length, engine};
    proof.rows.push(row);
    const result = await shuffleZones(engine, effect, runtimeHelpers, owners, execution);
    row.after = new Map(owners.map(owner => [owner, {
      library: Array.from(owner.library), hand: Array.from(owner.hand), graveyard: Array.from(owner.graveyard),
      states: new Map([...before.get(owner).states.keys()].map(card => [card, snapshot(card)])),
    }]));
    row.afterOtherPlayers = new Map([...row.otherPlayers.keys()].map(player => [player, {
      library: Array.from(player.library), hand: Array.from(player.hand), graveyard: Array.from(player.graveyard), exile: Array.from(player.exile),
    }]));
    row.queries = proof.queries.slice(row.queryStart); row.reveals = proof.reveals.slice(row.revealStart);
    row.shuffles = proof.shuffles.slice(row.shuffleStart); row.graveyardLeaves = proof.graveyardLeaves.slice(row.graveyardLeaveStart);
    return result;
  };
  const search = MTG.OracleV8Library.search;
  MTG.OracleV8Library.search = async (engine, effect, runtimeHelpers, owner, chooser, execution) => {
    const current = worlds.get(engine.g);
    if (!current) return search(engine, effect, runtimeHelpers, owner, chooser, execution);
    const proof = current.libraryProof, library = Array.from(owner.library);
    const before = {
      library, hand: Array.from(owner.hand), graveyard: Array.from(owner.graveyard), battlefield: engine.g.bf().slice(),
      states: new Map(library.map(card => [card, snapshot(card)])),
    };
    const row = {kind: 'search', effect, source: engine.src, you: engine.you, owner, chooser, execution,
      x: engine.x ?? engine.src?.castMeta?.x ?? 0, before, expectedOwners: expectedOwners(engine, effect),
      otherPlayers: new Map(engine.g.players.filter(player => player !== owner).map(player => [player, {
        library: Array.from(player.library), hand: Array.from(player.hand), graveyard: Array.from(player.graveyard), exile: Array.from(player.exile),
      }])), queryStart: proof.queries.length, revealStart: proof.reveals.length, shuffleStart: proof.shuffles.length,
      entryStart: proof.entries.length, graveyardEntryStart: proof.graveyardEntries.length, engine};
    proof.rows.push(row);
    const result = await search(engine, effect, runtimeHelpers, owner, chooser, execution);
    row.after = {library: Array.from(owner.library), hand: Array.from(owner.hand), graveyard: Array.from(owner.graveyard),
      battlefield: engine.g.bf().slice(), states: new Map(library.map(card => [card, snapshot(card)]))};
    row.afterOtherPlayers = new Map([...row.otherPlayers.keys()].map(player => [player, {
      library: Array.from(player.library), hand: Array.from(player.hand), graveyard: Array.from(player.graveyard), exile: Array.from(player.exile),
    }]));
    row.queries = proof.queries.slice(row.queryStart); row.reveals = proof.reveals.slice(row.revealStart);
    row.shuffles = proof.shuffles.slice(row.shuffleStart); row.entries = proof.entries.slice(row.entryStart);
    row.graveyardEntries = proof.graveyardEntries.slice(row.graveyardEntryStart);
    return result;
  };
}

export function stageLibraryEffect(MTG, context, effect, helpers) {
  if (!['library-select-v8', 'library-zone-shuffle-v8', 'library-search-v8'].includes(effect.action)) return false;
  installLibraryProof(MTG, context, helpers);
  if (context.libraryProof.staged.has(effect)) return true;
  context.libraryProof.staged.add(effect);
  if (effect.action === 'library-zone-shuffle-v8') {
    assert.ok(Array.isArray(effect.zones) && effect.zones.length && effect.zones.every(zone => ['hand', 'graveyard'].includes(zone)) &&
      new Set(effect.zones).size === effect.zones.length, 'library zone shuffle uses only closed source zones');
    const target = typeof effect.who === 'number' ? [context.oracleProofTargets?.[effect.who]].flat(2).find(candidate => candidate instanceof MTG.Player) : null;
    const owners = effect.who === undefined || effect.who === 'you' ? [context.a]
      : effect.who === 'each-player' ? context.game.players.filter(player => !player.lost)
      : effect.who === 'each-opponent' ? context.game.players.filter(player => player !== context.a && !player.lost)
      : target ? [target] : context.game.players.filter(player => !player.lost);
    for (const owner of owners) for (const zone of effect.zones) for (let index = 0; index < 2; index++) {
      const card = new MTG.CardInst(helpers.fixtureDefinition(`Library ${zone} shuffle ${owner.idx}-${index}`, ['Creature'], {cost: '{2}', power: '2', toughness: '2'}), owner);
      card.zone = zone; owner[zone].push(card);
    }
    context.game.recalc();
    return true;
  }
  if (effect.action === 'library-search-v8') {
    assert.ok(effect.who === undefined || effect.who === 'you', 'library search proof stages only its closed self-library scope');
    assert.ok(Array.isArray(effect.placements) && effect.placements.length && effect.placements.every(placement =>
      ['hand', 'graveyard', 'battlefield', 'top'].includes(placement.destination) &&
      (typeof placement.n === 'number' || ['all', 'rest'].includes(placement.n)) &&
      (placement.destination !== 'top' || [0, 2].includes(placement.offset || 0))), 'library search uses only closed placements');
    assert.equal(!!effect.unrestricted, !effect.filter, 'library search has exactly one closed candidate domain');
    if (effect.n !== 'all') stageCount(MTG, context, effect.n, helpers);
    const owner = context.a, relative = {...context, a: owner, b: context.game.players.find(player => player !== owner)};
    const desired = effect.n === 'all' ? 4 : Math.min(8, Math.max(3, typeof effect.n === 'number' ? effect.n : 4));
    const candidates = [];
    for (let index = 0; index < desired; index++) {
      let card;
      if (effect.filter) {
        card = helpers.stageGenericTarget(MTG, relative, {...effect.filter, controller: 'you', zone: 'graveyard', min: 1, max: 1, unbounded: false}, 'library-search-' + index);
        assert.ok(card instanceof MTG.CardInst, 'library search stages a real card candidate');
        const location = card.owner.graveyard.indexOf(card); assert.ok(location >= 0);
        card.owner.graveyard.splice(location, 1); card.zone = 'library'; owner.library.push(card);
      } else {
        card = new MTG.CardInst(helpers.fixtureDefinition('Library unrestricted search ' + index, index % 2 ? ['Instant'] : ['Creature'], {
          cost: '{' + (index + 1) + '}', power: '2', toughness: '3',
        }), owner);
        card.zone = 'library'; owner.library.push(card);
      }
      candidates.push(card);
    }
    if (effect.differentNames && candidates.length) {
      const duplicate = new MTG.CardInst(candidates[0].def, owner); duplicate.zone = 'library'; owner.library.push(duplicate);
    }
    if (effect.filter) {
      for (const type of ['Instant', 'Land', 'Creature', 'Artifact']) {
        const probe = new MTG.CardInst(helpers.fixtureDefinition('Library search nonmatching ' + type, [type], {
          cost: type === 'Land' ? '' : '{R}', power: '1', toughness: '1',
        }), owner);
        probe.zone = 'library';
        if (!matchesTarget(snapshot(probe), resolveFilter(effect.filter, 3), relative, null)) {owner.library.push(probe); break;}
      }
    }
    if (effect.placements.some(placement => placement.destination === 'battlefield') && candidates.some(card => card.hasSub('Aura'))) {
      helpers.permanent(MTG, context.game, owner, 'Grizzly Bears');
    }
    context.game.recalc();
    return true;
  }
  stageCount(MTG, context, effect.until?.n ?? effect.n, helpers);
  const cards = [];
  const owners = effect.who === undefined || effect.who === 'you' ? [context.a] : context.game.players;
  const stages = effect.selections.length ? effect.selections : effect.until ? [{filter: effect.until.filter, max: effect.until.n}] : [];
  const stagedReference = relation => {
    if (relation?.reference?.kind === 'target') return [context.oracleProofTargets?.[relation.reference.index]].flat(2).find(Boolean) || null;
    if (relation?.reference?.kind === 'payment-card') return context.game.bf().find(card => card.ctrl === context.a && card.name.includes('resolution-payment-' + relation.reference.index)) || null;
    return null;
  };
  for (const owner of owners) for (const [index, selection] of stages.entries()) {
    const relative = {...context, a: owner, b: context.game.players.find(player => player !== owner)};
    const filter = {...(selection.filter || {what: selection.destination === 'battlefield' ? 'permanent' : 'card'}), controller: 'you', zone: 'graveyard', min: 1, max: 1, unbounded: false};
    const n = Math.min(8, Math.max(2, typeof selection.max === 'number' ? selection.max : 3));
    for (let i = 0; i < n; i++) {
      const card = helpers.stageGenericTarget(MTG, relative, filter, 'library-selection-' + index + '-' + i);
      const reference = stagedReference(selection.relation);
      if (selection.relation?.kind === 'stat' && reference) {
        reference.def.cost = '{3}';
        card.def.cost = selection.relation.comparison === 'greater' ? '{4}' : '{2}';
      } else if (selection.relation?.kind === 'shares-card-type' && reference) {
        const shared = (reference.def.types || []).find(type => cardTypes.has(type));
        if (shared && !card.def.types.includes(shared)) card.def.types.push(shared);
      }
      if (!filter.stat) {if (card.is('Creature')) {card.def.power = '3'; card.def.toughness = '6';} card.def.cost = card.is('Land') ? '' : '{2}';}
      card.owner.graveyard.splice(card.owner.graveyard.indexOf(card), 1); card.zone = 'library';
      owner.library.push(card); cards.push(card);
    }
  }
  // A distinct nonmatching card exercises the remainder whenever there is a
  // printed filter. Permanent choices also get a real battlefield host for
  // an Aura so entry can use its ordinary attachment rules.
  if (stages.some(selection => selection.filter)) for (const owner of owners) {
    const selectedStage = effect.until ? {filter: effect.until.filter, relation: effect.until.relation} : stages.find(selection => selection.filter);
    const filter = selectedStage.filter, reference = stagedReference(selectedStage.relation);
    for (const type of ['Instant', 'Land', 'Creature', 'Artifact']) {
      const probe = new MTG.CardInst(helpers.fixtureDefinition('Library nonmatching ' + type, [type], {cost: type === 'Land' ? '' : '{R}', power: '1', toughness: '1'}), owner);
      probe.zone = 'library';
      if (!matchesTarget(snapshot(probe), resolveFilter(filter, 3), {...context, a: owner}, null) ||
          !relationMatches(snapshot(probe), selectedStage.relation, reference && snapshot(reference))) {owner.library.push(probe); break;}
    }
  }
  if (cards.some(card => card.hasSub('Aura'))) helpers.permanent(MTG, context.game, context.a, 'Grizzly Bears');
  context.game.recalc();
  return true;
}

export function assertLibraryEffect(MTG, context, entry, effect, label, helpers) {
  if (effect.action === 'library-zone-shuffle-v8') return assertZoneShuffle(context, effect, label);
  if (effect.action === 'library-search-v8') return assertLibrarySearch(context, effect, label);
  if (effect.action !== 'library-select-v8') return false;
  const row = context.libraryProof?.rows.findLast(candidate => key(candidate.effect) === key(effect));
  assert.ok(row?.after, label + ': printed library action actually resolved');
  const rows = context.libraryProof.rows.filter(candidate => candidate.execution === row.execution);
  assert.deepEqual(rows.map(item => item.owner), [...row.expectedOwners], label + ': exactly the printed library owner or owners are affected');
  if (effect.who === 'each-player' || effect.who === 'each-opponent') assert.equal(rows.length, context.game.players.filter(player => effect.who === 'each-player' || player !== row.you).length, label + ': every printed player scope executes');
  for (const item of rows) assertLibraryRow(context, item, effect, label);
  return true;
}

function assertLibrarySearch(context, effect, label) {
  const row = context.libraryProof?.rows.findLast(candidate => candidate.kind === 'search' && key(candidate.effect) === key(effect));
  assert.ok(row?.after, label + ': printed library search actually resolved');
  const rows = context.libraryProof.rows.filter(candidate => candidate.kind === 'search' && candidate.execution === row.execution);
  const ownerIds = rows.map(item => item.owner.idx), expectedOwnerIds = row.expectedOwners.map(player => player.idx);
  assert.equal(key(ownerIds), key(expectedOwnerIds), label + ': exactly the printed search owner or owners execute');
  assert.ok(rows.every((item, index) => item.owner === row.expectedOwners[index]), label + ': search owners are the exact game objects');
  assert.ok(rows.length, label + ': at least one real library is searched');
  for (const item of rows) assertLibrarySearchRow(context, item, effect, label);
  return true;
}

function assertLibrarySearchRow(context, row, effect, label) {
  assert.equal(row.chooser, effect.chooser === 'owner' ? row.owner : row.you, label + ': printed search chooser owns every decision');
  const relative = {...context, a: row.you};
  let candidates = row.before.library.filter(card => !effect.filter ||
    matchesTarget(row.before.states.get(card), resolveFilter(effect.filter, row.x), relative, row.source));
  if (effect.differentNames) {
    const names = new Set(); candidates = candidates.filter(card => !names.has(card.name) && names.add(card.name));
  }
  const requested = effect.n === 'all' ? candidates.length : Math.max(0, Math.floor(amount(effect.n, row.engine, context, null)));
  const maximum = Math.min(candidates.length, requested), minimum = effect.upTo || !effect.unrestricted ? 0 : maximum;
  const searchQueries = row.queries.filter(record => record.query.type === 'chooseCards' && record.query.search === true);
  assert.equal(searchQueries.length, maximum ? 1 : 0, label + ': one real hidden-library search decision when candidates exist');
  let selected = [];
  if (maximum) {
    const record = searchQueries[0];
    assert.equal(record.player, row.chooser); assert.deepEqual(ids(record.from), ids(candidates), label + ': search exposes exactly the locked eligible cohort');
    assert.equal(record.query.min, minimum); assert.equal(record.query.max, maximum);
    selected = Array.from(record.answer);
    assert.ok(selected.length >= minimum && selected.length <= maximum); assert.ok(selected.length, label + ': proof makes a real search acquisition');
    assert.equal(new Set(selected).size, selected.length); assert.ok(selected.every(card => candidates.includes(card)), label + ': no outside or duplicate search result');
    if (effect.differentNames) assert.equal(new Set(selected.map(card => card.name)).size, selected.length, label + ': every acquired card has a different name');
  }

  const partitionQueries = row.queries.filter(record => record.query.type === 'chooseCards' && record.query.prompt?.startsWith('Choose searched cards for '));
  const assignments = [], remaining = selected.slice(); let partitionIndex = 0;
  for (const placement of effect.placements) {
    const count = placement.n === 'all' || placement.n === 'rest' ? remaining.length : Math.min(remaining.length, Math.max(0, Math.floor(placement.n)));
    let chosen = remaining.slice(0, count);
    if (count > 0 && count < remaining.length) {
      const record = partitionQueries[partitionIndex++]; assert.ok(record, label + ': printed destination partition is chosen');
      assert.equal(record.player, row.chooser); assert.equal(record.query.min, count); assert.equal(record.query.max, count);
      assert.deepEqual(ids(record.from), ids(remaining), label + ': partition uses exactly the still-unassigned search cohort');
      chosen = Array.from(record.answer); assert.equal(chosen.length, count); assert.equal(new Set(chosen).size, count);
      assert.ok(chosen.every(card => remaining.includes(card)), label + ': partition cannot substitute an unsearched card');
    }
    for (const card of chosen) remaining.splice(remaining.indexOf(card), 1);
    assignments.push({placement, cards: chosen});
  }
  assert.equal(partitionIndex, partitionQueries.length, label + ': no invented partition decision');
  assert.equal(remaining.length, 0, label + ': every searched card is assigned exactly once');

  const moved = new Set(assignments.filter(item => item.placement.destination !== 'top').flatMap(item => item.cards));
  const topAssignments = assignments.filter(item => item.placement.destination === 'top');
  assert.ok(topAssignments.length <= 1, label + ': top placement has one closed ordering group');
  for (const {placement, cards} of assignments) for (const card of cards) {
    const before = row.before.states.get(card), after = row.after.states.get(card);
    assert.ok(before && after, label + ': acquired card is one locked library incarnation');
    assert.equal(after.zone, placement.destination === 'top' ? 'library' : placement.destination, label + ': exact searched-card destination');
    assert.equal(after.owner, before.owner, label + ': library search preserves ownership');
    assert.equal(after.version, before.version + (placement.destination === 'top' ? 0 : 1), label + ': exact searched-card zone incarnation');
    if (placement.destination === 'battlefield') {
      assert.equal(after.ctrl, row.you, label + ": searched permanent enters under the searcher's control");
      if (placement.tapped) assert.equal(after.tapped, true, label + ': printed tapped entry is preserved');
    }
  }
  for (const card of row.before.library.filter(card => !moved.has(card))) {
    const before = row.before.states.get(card), after = row.after.states.get(card);
    assert.equal(after.zone, 'library', label + ': cards not moved by the search remain in the library');
    assert.equal(after.version, before.version, label + ': shuffling and top placement do not create zone changes');
    assert.equal(after.owner, before.owner);
  }
  assert.deepEqual(new Set(row.after.library), new Set(row.before.library.filter(card => !moved.has(card))), label + ': search conserves exact library membership');

  const shuffledCohort = row.before.library.filter(card => !selected.includes(card));
  assert.equal(row.shuffles.length, 1, label + ': the searched library is shuffled exactly once');
  const shuffle = row.shuffles[0]; assert.equal(shuffle.owner, row.owner);
  assert.deepEqual(new Set(shuffle.before), new Set(shuffledCohort), label + ': shuffle excludes every locked searched card before placement');
  assert.deepEqual(new Set(shuffle.after), new Set(shuffledCohort), label + ': real shuffle conserves the remaining library');

  const orderQueries = row.queries.filter(record => record.query.type === 'chooseCards' && record.query.prompt === 'Order searched cards, top first');
  const expectedOrderQueries = topAssignments.filter(item => item.placement.order && item.cards.length > 1);
  assert.equal(orderQueries.length, expectedOrderQueries.length, label + ': printed top ordering creates exactly its required decision');
  for (const [index, item] of expectedOrderQueries.entries()) {
    const record = orderQueries[index]; assert.equal(record.player, row.chooser);
    assert.deepEqual(new Set(record.from), new Set(item.cards)); assert.deepEqual(new Set(record.answer), new Set(item.cards));
    assert.equal(record.answer.length, item.cards.length);
  }
  let orderIndex = 0;
  for (const item of topAssignments) {
    const arranged = item.placement.order && item.cards.length > 1 ? Array.from(orderQueries[orderIndex++].answer) : item.cards;
    if ((item.placement.offset || 0) === 2) {
      assert.equal(arranged.length, 1); assert.equal(row.after.library.at(-3), arranged[0], label + ': exact searched card is third from the post-shuffle top');
    } else assert.deepEqual(ids(row.after.library.slice(-arranged.length)).reverse(), ids(arranged), label + ': searched cards occupy the post-shuffle top in chosen order');
  }

  const revealRows = row.reveals.filter(reveal => reveal.kind === 'reveal');
  assert.deepEqual(revealRows.map(reveal => ids(reveal.cards)), effect.reveal && selected.length ? [ids(selected)] : [], label + ': only the printed searched cohort is revealed');
  const battlefieldCards = assignments.filter(item => item.placement.destination === 'battlefield').flatMap(item => item.cards);
  for (const reveal of row.reveals.filter(reveal => reveal.kind !== 'reveal')) assert.ok(reveal.kind === 'enters' && reveal.cards.every(card => battlefieldCards.includes(card)), label + ': ordinary entry presentation exposes only searched permanents');

  const graveyardCards = assignments.filter(item => item.placement.destination === 'graveyard').flatMap(item => item.cards);
  assert.equal(row.graveyardEntries.length, graveyardCards.length ? 1 : 0, label + ': one search instruction emits one graveyard-entry batch');
  if (graveyardCards.length) {
    const event = row.graveyardEntries[0]; assert.deepEqual(new Set(event.cards), new Set(graveyardCards));
    assert.ok(event.froms.every(from => from === 'library')); assert.ok(event.states.every(state => state.zone === 'graveyard'));
  }
  const entrantRows = row.entries.filter(record => battlefieldCards.includes(record.card));
  assert.equal(entrantRows.length, battlefieldCards.length, label + ': every searched permanent has one real ETB');
  for (const record of entrantRows) assert.ok(battlefieldCards.every(card => record.battlefield.some(state =>
    state.card === card && state.version === row.after.states.get(card).version)), label + ': searched permanents enter as one simultaneous batch');

  const allowedQueries = new Set([...searchQueries, ...partitionQueries, ...orderQueries]);
  assert.ok(row.queries.every(record => allowedQueries.has(record)), label + ': library search creates no unrelated hidden choice');
  for (const [player, before] of row.otherPlayers) {
    const after = row.afterOtherPlayers.get(player);
    for (const zone of ['library', 'hand', 'graveyard', 'exile']) assert.deepEqual(ids(after[zone]), ids(before[zone]), label + ': unrelated player ' + zone + ' is untouched');
  }
}

function assertZoneShuffle(context, effect, label) {
  const row = context.libraryProof?.rows.findLast(candidate => candidate.kind === 'zone-shuffle' && key(candidate.effect) === key(effect));
  assert.ok(row?.after, label + ': printed zone shuffle actually resolved');
  const ownerIds = row.owners.map(player => player.idx), expectedOwnerIds = row.expectedOwners.map(player => player.idx);
  assert.equal(key(ownerIds), key(expectedOwnerIds), label + ': exactly the printed player scope is affected in APNAP order (' + key(ownerIds) + ' versus ' + key(expectedOwnerIds) + ')');
  assert.ok(row.owners.every((player, index) => player === row.expectedOwners[index]), label + ': affected players are the exact game objects');
  assert.ok(row.owners.length, label + ': at least one live library owner is affected');
  assert.equal(row.queries.length, 0, label + ': a mandatory zone shuffle creates no invented choice');
  assert.equal(row.reveals.length, 0, label + ': hidden hand and library cards are never revealed');
  assert.equal(row.shuffles.length, row.owners.length, label + ': every affected library is shuffled exactly once');
  const movedGraveyard = [];
  for (const owner of row.owners) {
    const before = row.before.get(owner), after = row.after.get(owner);
    const movedHand = effect.zones.includes('hand') ? before.hand : [];
    const movedGrave = effect.zones.includes('graveyard') ? before.graveyard : [];
    movedGraveyard.push(...movedGrave);
    const moved = [...movedHand, ...movedGrave], expectedLibrary = [...before.library, ...moved];
    assert.deepEqual(new Set(after.library), new Set(expectedLibrary), label + ': affected library conserves its original and moved cards');
    assert.deepEqual(ids(after.hand), ids(effect.zones.includes('hand') ? [] : before.hand), label + ': exact hand cohort is moved');
    assert.deepEqual(ids(after.graveyard), ids(effect.zones.includes('graveyard') ? [] : before.graveyard), label + ': exact graveyard cohort is moved');
    for (const card of moved) {
      const prior = before.states.get(card), current = after.states.get(card);
      assert.equal(current.zone, 'library', label + ': locked card reaches its owner library');
      assert.equal(current.owner, prior.owner, label + ': zone shuffle never changes ownership');
      assert.equal(current.version, prior.version + 1, label + ': moved card has exactly one new zone incarnation');
    }
    for (const card of before.library) {
      const prior = before.states.get(card), current = after.states.get(card);
      assert.equal(current.zone, 'library'); assert.equal(current.version, prior.version, label + ': original library cards do not change zones');
      assert.equal(current.owner, prior.owner);
    }
    const shuffle = row.shuffles.find(record => record.owner === owner);
    assert.ok(shuffle?.after, label + ': real seeded shuffle is invoked for the affected owner');
    assert.deepEqual(new Set(shuffle.before), new Set(expectedLibrary), label + ': shuffle sees all zones after the complete move');
    assert.deepEqual(new Set(shuffle.after), new Set(expectedLibrary), label + ': shuffle conserves the full library');
  }
  if (movedGraveyard.length) {
    assert.equal(row.graveyardLeaves.length, 1, label + ': one instruction emits one graveyard-leave batch');
    const event = row.graveyardLeaves[0];
    assert.deepEqual(new Set(event.cards), new Set(movedGraveyard), label + ': the batch contains every affected player graveyard card');
    assert.equal(event.snapshots.length, movedGraveyard.length); assert.equal(event.destinations.length, movedGraveyard.length);
    assert.ok(event.destinations.every(destination => destination === 'library'));
    assert.ok(event.states.every(state => state.zone === 'library'), label + ': all graveyard cards moved before the group event fires');
  } else assert.equal(row.graveyardLeaves.length, 0);
  for (const [player, before] of row.otherPlayers) {
    const after = row.afterOtherPlayers.get(player);
    for (const zone of ['library', 'hand', 'graveyard', 'exile']) assert.deepEqual(ids(after[zone]), ids(before[zone]), label + ': unrelated player ' + zone + ' is untouched');
  }
  return true;
}

function assertLibraryRow(context, row, effect, label) {
  assert.equal(row.chooser, effect.chooser === 'owner' ? row.owner : row.you, label + ': printed chooser owns the decision');
  if (!effect.until || row.matchCount > 0) assert.ok(row.top.length, label + ': nonempty inspected cohort');
  const selections = [], claimed = new Set(), selectionQueries = row.queries.filter(record => record.query.type === 'chooseCards' && record.query.prompt?.startsWith('Choose inspected cards'));
  const optionalQueries = row.queries.filter(record => record.query.type === 'chooseOption' && record.query.prompt === 'Move all eligible inspected cards?');
  let queryIndex = 0, optionalIndex = 0;
  const relative = {...context, a: row.you, countSnapshot: row.before};
  const shuffleChoices = row.queries.filter(record => record.query.prompt === 'Shuffle the inspected library?');
  assert.equal(shuffleChoices.length, effect.optionalShuffle ? 1 : 0);
  if (effect.optionalShuffle) {assert.equal(shuffleChoices[0].player, row.chooser); assert.ok(['yes', 'no'].includes(shuffleChoices[0].answer));}
  const shuffled = effect.rest.destination === 'shuffle' || shuffleChoices[0]?.answer === 'yes';
  for (const selection of effect.selections) {
    const eligible = row.top.filter(card => !claimed.has(card) && (!selection.filter || matchesTarget(row.states.get(card), resolveFilter(selection.filter, row.x), relative, row.source)) &&
      relationMatches(row.states.get(card), selection.relation, row.relationReference) &&
      (selection.destination !== 'battlefield' || permanentTypes.some(type => row.states.get(card).is(type))));
    const max = selection.max === 'all' ? eligible.length : Math.min(eligible.length, amount(selection.max, row.engine, context, row.before));
    const min = selection.required ? max : 0;
    let chosen = [];
    if (max && selection.allOrNone) {
      const record = optionalQueries[optionalIndex++]; assert.ok(record, label + ': all-or-none decision is offered');
      assert.equal(record.player, row.chooser); assert.ok(['yes', 'no'].includes(record.answer));
      chosen = record.answer === 'yes' ? eligible : [];
    } else if (max) {
      const record = selectionQueries[queryIndex++]; assert.ok(record, label + ': actual inspected-card decision');
      assert.equal(record.player, row.chooser); assert.deepEqual(ids(record.from), ids(eligible), label + ': exact eligible inspected candidates');
      assert.equal(record.query.min, min); assert.equal(record.query.max, max); chosen = Array.from(record.answer);
    }
    assert.ok(chosen.length >= min && chosen.length <= max); assert.equal(new Set(chosen).size, chosen.length);
    assert.ok(chosen.every(card => eligible.includes(card)), label + ': no outside or duplicate selection');
    for (const card of chosen) claimed.add(card);
    selections.push({selection, chosen});
  }
  assert.equal(queryIndex, selectionQueries.length); assert.equal(optionalIndex, optionalQueries.length);
  const rest = row.top.filter(card => !claimed.has(card));
  const expectedReveals = [...(effect.visibility === 'reveal' ? [row.top] : []), ...selections.filter(item => item.selection.reveal && item.chosen.length).map(item => item.chosen)];
  assert.deepEqual(row.reveals.filter(reveal => reveal.kind === 'reveal').map(reveal => ids(reveal.cards)), expectedReveals.map(ids), label + ': only the printed public reveals occur');
  const battlefieldSelections = selections.filter(item => item.selection.destination === 'battlefield').flatMap(item => item.chosen);
  for (const reveal of row.reveals.filter(reveal => reveal.kind !== 'reveal')) assert.ok(reveal.kind === 'enters' && reveal.cards.every(card => battlefieldSelections.includes(card)), label + ': ordinary entry presentation exposes only selected battlefield cards');
  const views = row.queries.filter(record => record.query.type === 'cardReveal');
  if (effect.visibility === 'look' && !row.chooser.isAI && row.top.length) {
    assert.equal(views.length, 1); assert.equal(views[0].player, row.chooser); assert.equal(views[0].query.private, true);
    assert.deepEqual(ids(views[0].cards), ids(row.top), label + ': exact cohort is privately inspected');
  } else assert.equal(views.length, 0);

  const moved = new Set();
  const checkDestination = (cards, destination, tapped = false, controller = row.owner) => {
    for (const card of cards) {
      const before = row.states.get(card), after = row.after.get(card), library = ['top', 'bottom', 'shuffle', 'stay'].includes(destination);
      assert.equal(after.zone, library ? 'library' : destination, label + ': exact destination for ' + before.name);
      assert.equal(after.owner, before.owner, label + ': selection never changes ownership');
      assert.equal(after.version, before.version + (library ? 0 : 1), label + ': exact zone incarnation');
      if (!library) moved.add(card);
      if (destination === 'battlefield') {assert.equal(after.ctrl, controller); if (tapped) assert.equal(after.tapped, true);}
    }
    if (!cards.length || shuffled) return;
    if (['top', 'bottom'].includes(destination)) {
      const segment = destination === 'top' ? row.afterLibrary.slice(-cards.length) : row.afterLibrary.slice(0, cards.length);
      assert.deepEqual(new Set(segment), new Set(cards), label + ': entire returned group occupies its specified library end');
    }
  };
  for (const {selection, chosen} of selections) checkDestination(chosen, selection.destination, selection.tapped, selection.controller === 'you' ? row.you : row.owner);
  checkDestination(rest, effect.rest.destination);
  assert.deepEqual(new Set(row.afterLibrary), new Set(row.library.filter(card => !moved.has(card))), label + ': library membership is conserved');
  const uninspected = row.library.filter(card => !row.top.includes(card));
  if (!shuffled) assert.deepEqual(ids(row.afterLibrary.filter(card => uninspected.includes(card))), ids(uninspected), label + ': uninspected order unchanged');
  for (const record of row.queries.filter(record => record.query.type === 'chooseCards' && record.query.prompt?.startsWith('Order inspected cards'))) {
    assert.deepEqual(new Set(record.answer), new Set(record.from)); assert.equal(record.answer.length, record.from.length);
    if (!shuffled) assert.deepEqual(ids(row.afterLibrary.filter(card => record.from.includes(card))).reverse(), ids(record.answer), label + ': chosen order is preserved');
  }
  const entrants = selections.filter(item => item.selection.destination === 'battlefield').flatMap(item => item.chosen);
  for (const record of row.entries.filter(record => entrants.includes(record.card))) assert.ok(entrants.every(card => record.battlefield.some(state => state.card === card && state.version === row.after.get(card).version)), label + ': selected permanents enter simultaneously');
  if (entrants.length) assert.equal(row.entries.filter(record => entrants.includes(record.card)).length, entrants.length);
  for (const [player, cards] of row.otherLibraries) assert.deepEqual(ids(row.afterOtherLibraries.get(player)), ids(cards), label + ': other libraries remain untouched');
  return true;
}
