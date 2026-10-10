import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants, assertRecalculationStable} from './helpers/game-state-invariants.mjs';

const M = loadEngine();
const traces = [];

// Actual cards, actual mana sources, and the normal native priority pipeline.
// The fixture establishes the initial game position; controllers choose only
// actions/targets offered by the live engine. No rule helpers are installed.
function table() {
  const g = new M.Game({seed: 10102671, paced: false, maxTurns: 10});
  const players = ['Caster', 'Opponent', 'Third', 'Fourth'].map(name =>
    g.addPlayer(name, {name: 'Target resolution audit'}, null, false));
  const [a, b, c, d] = players;
  const f = {g, a, b, c, d, players, questions: [], castEvents: [], responses: [], copies: []};
  for (const p of players) p.controller = {decide: async (game, q) => {
    f.questions.push({p, q});
    if (q.type === 'priority') {
      const answer = f.priority?.(p, q) || {kind: 'pass'};
      if (answer.kind !== 'pass') f.responses.push({p, answer});
      return answer;
    }
    if (q.type === 'chooseTargets') return f.targets?.(p, q) ?? q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return f.cards?.(p, q) ?? q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return f.option?.(p, q) ?? q.options.find(row => row.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseMulti') return f.multi?.(p, q) ?? q.options.slice(0, q.min || 0).map(row => row.key);
    if (q.type === 'chooseX') return f.x?.(p, q) ?? q.min ?? 0;
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (q.type === 'main') return {kind: 'done'};
    if (['cardReveal', 'combatReview'].includes(q.type)) return null;
    if (q.type === 'attackers') return f.attackers?.(p, q) ?? [];
    if (q.type === 'blockers') return [];
    throw Error('Unhandled audit choice: ' + q.type);
  }};
  g.turnPlayer = a; g.turnNo = 6; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  const emit = g.emit.bind(g);
  g.emit = async (event, data, ...rest) => {
    if (event === 'cast') f.castEvents.push(data);
    if (event === 'spellCopied') f.copies.push(data.so);
    return emit(event, data, ...rest);
  };
  f.put = (name, zone = 'battlefield', owner = a) => {
    assert.ok(M.DEFS[name], 'native definition: ' + name);
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') g.battlefield.push(card);
    else owner[zone].push(card);
    g.recalc();
    return card;
  };
  f.lands = (names, p = a) => names.map(name => f.put(name, 'battlefield', p));
  for (const p of players) for (let n = 0; n < 12; n++) f.put('Forest', 'library', p);
  return f;
}

function respondOnce(f, p, card, predicate = () => true) {
  let used = false;
  const previous = f.priority;
  f.priority = (player, q) => {
    if (player === p && !used) {
      const row = q.casts.find(row => row.card === card && predicate(row, q));
      if (row) { used = true; return {kind: 'cast', card, from: row.from, alt: row.alt}; }
    }
    return previous?.(player, q);
  };
  return () => used;
}

async function cast(f, p, card, predicate = () => true) {
  const row = f.g.castableList(p).find(row => row.card === card && predicate(row));
  assert.ok(row, 'native cast offer for ' + card.name);
  assert.equal(await f.g.castSpell(p, card, {from: row.from, alt: row.alt}), true);
  assert.equal(f.g.stack.length, 0);
  assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, card.name);
  assertRecalculationStable(f.g, card.name);
}

for (const copierName of ['Fork', 'Reverberate']) {
  test(`${copierName} pays its native response cost and chooses a new Giant Growth target`, async () => {
    const f = table(), originalTarget = f.put('Grizzly Bears'), copyTarget = f.put('Grizzly Bears', 'battlefield', f.b);
    const growth = f.put('Giant Growth', 'hand'), copier = f.put(copierName, 'hand', f.b);
    const forest = f.lands(['Forest'])[0], mountains = f.lands(['Mountain', 'Mountain'], f.b);
    f.targets = (p, q) => q.candidates.includes(growth.iid === q.src?.iid ? originalTarget : null)
      ? [q.so?.isCopy ? copyTarget : originalTarget]
      : q.candidates.find(row => row.kind === 'spell' && row.card === growth)
        ? [q.candidates.find(row => row.kind === 'spell' && row.card === growth)] : undefined;
    const used = respondOnce(f, f.b, copier);
    await cast(f, f.a, growth);
    assert.equal(used(), true);
    assert.equal(forest.tapped, true); assert.ok(mountains.every(card => card.tapped));
    assert.equal(growth.zone, 'graveyard'); assert.equal(copier.zone, 'graveyard');
    assert.equal(originalTarget.power, 5, 'the original Growth resolves on its originally announced creature');
    assert.equal(copyTarget.power, 5, 'the copy resolves on the separately chosen creature');
    assert.equal(f.questions.some(({q}) => q.aiHint?.kind === 'newTargets'), true, 'the native copy exposes its printed target-change choice');
    traces.push({label: copierName + ' native retarget', originalPower: originalTarget.power, copyPower: copyTarget.power, copiedCount: f.copies.length});
  });
}

test('Fork changes only the copy to red and leaves the original green card unchanged', async () => {
  const f = table(), bear = f.put('Grizzly Bears'), growth = f.put('Giant Growth', 'hand'), fork = f.put('Fork', 'hand', f.b);
  const printedDef = growth.def;
  f.lands(['Forest']); f.lands(['Mountain', 'Mountain'], f.b);
  f.targets = (p, q) => q.candidates.includes(bear) ? [bear]
    : q.candidates.find(row => row.kind === 'spell' && row.card === growth)
      ? [q.candidates.find(row => row.kind === 'spell' && row.card === growth)] : undefined;
  f.option = (p, q) => q.aiHint?.kind === 'newTargets' ? 'no' : undefined;
  respondOnce(f, f.b, fork);
  await cast(f, f.a, growth);
  assert.equal(growth.def === printedDef, true, 'a spell copy cannot mutate the physical original definition');
  assert.deepEqual(Array.from(growth.colors), ['G'], 'the original is still green in the graveyard');
  assert.equal(bear.power, 8);
});

test('Fork retained target is rechecked against the red copy rather than the original green spell', async () => {
  const f = table(), akroma = f.put('Akroma, Angel of Wrath'), growth = f.put('Giant Growth', 'hand'), fork = f.put('Fork', 'hand', f.b);
  f.lands(['Forest']); f.lands(['Mountain', 'Mountain'], f.b);
  f.targets = (p, q) => q.candidates.includes(akroma) ? [akroma]
    : q.candidates.find(row => row.kind === 'spell' && row.card === growth)
      ? [q.candidates.find(row => row.kind === 'spell' && row.card === growth)] : undefined;
  f.option = (p, q) => q.aiHint?.kind === 'newTargets' ? 'no' : undefined;
  respondOnce(f, f.b, fork);
  await cast(f, f.a, growth);
  assert.equal(akroma.power, 9, 'protection from red makes the Fork copy illegal while the green original still resolves');
});

test('Fork new targets exclude protection from red and permit protection from blue', async () => {
  const f = table(), bear = f.put('Grizzly Bears'), redProtected = f.put('Akroma, Angel of Wrath', 'battlefield', f.b), blueProtected = f.put('Scragnoth', 'battlefield', f.b);
  const unsummon = f.put('Unsummon', 'hand'), fork = f.put('Fork', 'hand', f.b);
  f.lands(['Island']); f.lands(['Mountain', 'Mountain'], f.b);
  let copyTargetPrompt = false;
  f.targets = (p, q) => {
    if (q.so?.isCopy && q.src?.iid === unsummon.iid) {
      copyTargetPrompt = true;
      assert.equal(q.candidates.includes(redProtected), false, 'red copy cannot target Akroma');
      assert.equal(q.candidates.includes(blueProtected), true, 'red copy can target Scragnoth');
      return [blueProtected];
    }
    if (q.candidates.includes(bear)) return [bear];
    const so = q.candidates.find(row => row.kind === 'spell' && row.card === unsummon);
    return so ? [so] : undefined;
  };
  respondOnce(f, f.b, fork);
  await cast(f, f.a, unsummon);
  assert.equal(copyTargetPrompt, true);
  assert.equal(bear.zone, 'hand'); assert.equal(blueProtected.zone, 'hand'); assert.equal(redProtected.zone, 'battlefield');
});

test('a red Fork copy that loses its protected target does not perform Psionic Blast self-damage', async () => {
  const f = table(), akroma = f.put('Akroma, Angel of Wrath', 'battlefield', f.c), blast = f.put('Psionic Blast', 'hand'), fork = f.put('Fork', 'hand', f.b);
  f.lands(['Island', 'Island', 'Forest']); f.lands(['Mountain', 'Mountain'], f.b);
  f.targets = (p, q) => q.candidates.includes(akroma) ? [akroma]
    : q.candidates.find(row => row.kind === 'spell' && row.card === blast)
      ? [q.candidates.find(row => row.kind === 'spell' && row.card === blast)] : undefined;
  f.option = (p, q) => q.aiHint?.kind === 'newTargets' ? 'no' : undefined;
  respondOnce(f, f.b, fork);
  await cast(f, f.a, blast);
  assert.equal(f.a.life, 38, 'blue original resolves including its self-damage');
  assert.equal(f.b.life, 40, 'the illegal red copy fails before all of its instructions');
  assert.equal(akroma.damage, 4);
});

test('Spellskite offers only Decimate target instructions for which it is a legal new target', async () => {
  const f = table(), skite = f.put('Spellskite'), ring = f.put('Sol Ring', 'battlefield', f.b), bear = f.put('Grizzly Bears', 'battlefield', f.b), arena = f.put('Phyrexian Arena', 'battlefield', f.b);
  const island = f.lands(['Island'])[0], mana = f.lands(['Forest', 'Mountain', 'Forest', 'Mountain'], f.b), land = mana[0];
  const decimate = f.put('Decimate', 'hand', f.b);
  f.g.turnPlayer = f.b;
  let activated = false, choices;
  f.priority = (p, q) => {
    if (p !== f.a || activated) return;
    const so = q.stack.find(row => row.card === decimate), entry = q.acts.find(row => row.card === skite);
    if (so && entry) {activated = true; return {kind: 'activate', entry, targets: [[so]]};}
  };
  f.targets = (p, q) => {
    if (q.src === decimate) return [{Artifact: ring, Creature: bear, Enchantment: arena, Land: land}[q.prompt]];
    return undefined;
  };
  f.option = (p, q) => {
    if (/choose which target to change/.test(q.prompt || '')) {
      choices = q.options.map(row => row.label);
      assert.equal(q.options.some(row => /target [34]$/.test(row.label)), false, 'Spellskite is neither an enchantment nor a land');
      return q.options[0]?.key;
    }
    return undefined;
  };
  await cast(f, f.b, decimate);
  assert.equal(activated, true); assert.equal(island.tapped, true);
  assert.equal(land.zone, 'graveyard', 'the original legal land target is still destroyed');
  assert.equal(arena.zone, 'graveyard');
  assert.equal(choices.length, 2, 'artifact and creature are the two legal target instructions');
});

test('Spellskite changing one Common Bond target preserves the old identity of a blinked other target', async () => {
  const f = table(), skite = f.put('Spellskite'), first = f.put('Grizzly Bears', 'battlefield', f.b), second = f.put('Grizzly Bears', 'battlefield', f.b);
  const bond = f.put('Common Bond', 'hand'), blink = f.put('Momentary Blink', 'hand', f.b);
  f.lands(['Plains', 'Forest', 'Forest', 'Island']); f.lands(['Plains', 'Forest'], f.b);
  const firstVersion = first.zoneVersion;
  let blinked = false, redirected = false;
  f.priority = (p, q) => {
    const original = q.stack.find(row => row.kind === 'spell' && row.card === bond);
    if (!original) return;
    if (p === f.b && !blinked) {
      const row = q.casts.find(row => row.card === blink && !row.alt?.flashback);
      if (row) {blinked = true; return {kind: 'cast', card: blink, from: row.from, alt: row.alt};}
    }
    if (p === f.a && blinked && first.zoneVersion !== firstVersion && !redirected) {
      const entry = q.acts.find(row => row.card === skite);
      if (entry) {redirected = true; return {kind: 'activate', entry, targets: [[original]]};}
    }
  };
  f.targets = (p, q) => q.src?.iid === bond.iid ? [q.targetStep === 1 ? first : second]
    : q.src?.iid === blink.iid ? [first] : undefined;
  f.option = (p, q) => /choose which target to change/.test(q.prompt || '') ? '1:0' : undefined;
  await cast(f, f.a, bond);
  assert.equal(blinked, true); assert.equal(redirected, true);
  assert.equal(first.zone, 'battlefield'); assert.ok(first.zoneVersion > firstVersion);
  assert.equal(first.counters['+1/+1'] || 0, 0, 'unchanged target retains the pre-blink identity and is illegal');
  assert.equal(skite.counters['+1/+1'], 1, 'the new legal second target receives its counter');
  assert.equal(second.counters['+1/+1'] || 0, 0);
});

test('Spellskite cannot make itself occur twice in the single six-target instruction of Hex', async () => {
  const f = table(), skite = f.put('Spellskite'), bears = Array.from({length: 5}, () => f.put('Grizzly Bears'));
  const hex = f.put('Hex', 'hand', f.b), island = f.lands(['Island'])[0];
  f.lands(Array(6).fill('Swamp'), f.b); f.g.turnPlayer = f.b;
  let activated = false;
  f.priority = (p, q) => {
    if (p !== f.a || activated) return;
    const so = q.stack.find(row => row.card === hex), entry = q.acts.find(row => row.card === skite);
    if (so && entry) {activated = true; return {kind: 'activate', entry, targets: [[so]]};}
  };
  f.targets = (p, q) => q.src === hex ? [skite, ...bears] : undefined;
  f.option = (p, q) => {
    if (/choose which target to change/.test(q.prompt || '')) {
      assert.equal(q.options.some(row => row.key !== '0:0'), false, 'every other replacement would duplicate Spellskite in one target instruction');
      return '0:0';
    }
    return undefined;
  };
  await cast(f, f.b, hex);
  assert.equal(activated, true); assert.equal(island.tapped, true);
  assert.ok([skite, ...bears].every(card => card.zone === 'graveyard'));
});

for (const modifier of ['Torbran, Thane of Red Fell', 'Firesong and Sunspeaker', 'Hostility']) {
  test(`Reverberate copy uses its own controller for native ${modifier}`, async () => {
    const f = table(), source = f.put(modifier, 'battlefield', f.b), shock = f.put('Shock', 'hand'), reverberate = f.put('Reverberate', 'hand', f.b);
    f.lands(['Mountain']); f.lands(['Mountain', 'Mountain'], f.b);
    f.targets = (p, q) => {
      if (q.src?.iid === shock.iid) return [q.so?.isCopy ? f.d : f.c];
      const so = q.candidates.find(row => row.kind === 'spell' && row.card === shock);
      return so ? [so] : undefined;
    };
    respondOnce(f, f.b, reverberate);
    await cast(f, f.a, shock);
    assert.equal(source.zone, 'battlefield');
    assert.equal(f.c.life, 38, 'the opposing original is not modified by this controller\'s permanent');
    if (modifier.startsWith('Torbran')) assert.equal(f.d.life, 36, 'the red copy controlled by Torbran\'s controller deals two extra damage');
    if (modifier.startsWith('Firesong')) {assert.equal(f.d.life, 38); assert.equal(f.b.life, 42, 'lifelink belongs to the copy controller'); assert.equal(f.a.life, 40);}
    if (modifier === 'Hostility') {
      assert.equal(f.d.life, 40, 'Hostility prevents damage only from its controller\'s copy');
      assert.equal(f.g.creatures(f.b).filter(card => card.isToken && card.hasSub('Elemental') && card.power === 3 && card.toughness === 1).length, 2);
    }
  });
}

test('paid Boltbender Disguise trigger keeps the one target originally chosen for Blessed Alliance', async () => {
  const f = table(), elf = f.put('Llanowar Elves'), mystic = f.put('Elvish Mystic'), bender = f.put('Boltbender', 'hand');
  f.lands(['Forest']);
  await cast(f, f.a, bender, row => row.alt?.faceDownCast === 'disguise');
  assert.equal(bender.faceDown, true); assert.equal(elf.tapped, true); assert.equal(mystic.tapped, true);
  f.lands(['Forest', 'Mountain']); f.lands(['Plains', 'Forest'], f.b);
  const alliance = f.put('Blessed Alliance', 'hand', f.b);
  let turned = false, choices = 0;
  f.priority = (p, q) => {
    if (p !== f.a || turned || !q.stack.some(row => row.card === alliance)) return;
    const entry = q.acts.find(row => row.card === bender && row.turnFaceUp);
    if (entry) {turned = true; return {kind: 'activate', entry};}
  };
  f.option = (p, q) => q.aiHint?.kind === 'mode' ? q.options.find(row => /Untap/.test(row.label))?.key : undefined;
  f.multi = (p, q) => q.aiHint?.kind === 'modes' ? [q.options.find(row => /Untap/.test(row.label))?.key] : undefined;
  f.targets = (p, q) => {
    if (q.src?.iid !== alliance.iid) return undefined;
    choices += 1;
    if (choices === 1) return [elf];
    assert.equal(q.min, 1, 'choosing new targets retains the announced target count');
    assert.equal(q.max, 1, 'printed up-to-two does not authorize adding a second target when retargeting');
    return [mystic];
  };
  await cast(f, f.b, alliance);
  assert.equal(turned, true); assert.equal(bender.faceDown, false);
  assert.equal(choices, 2);
  assert.equal(elf.tapped, true); assert.equal(mystic.tapped, false);
});

test('Boltbender retaining the same Blessed Alliance target does not trigger its native Ward again', async () => {
  const f = table(), bender = f.put('Boltbender', 'hand');
  f.lands(['Forest', 'Forest', 'Forest']);
  await cast(f, f.a, bender, row => row.alt?.faceDownCast === 'disguise');
  f.lands(['Forest', 'Mountain']);
  f.put('Bronze Guardian');
  const skite = f.put('Spellskite'), alliance = f.put('Blessed Alliance', 'hand', f.b);
  const lands = f.lands(Array(6).fill('Plains'), f.b);
  assert.ok(skite.cur.wardCost || skite.cur.extraWards.length);
  let turned = false;
  f.priority = (p, q) => {
    if (p !== f.a || turned || !q.stack.some(row => row.card === alliance) || !f.questions.some(({q}) => q.aiHint?.kind === 'ward')) return;
    const entry = q.acts.find(row => row.card === bender && row.turnFaceUp);
    if (entry) {turned = true; return {kind: 'activate', entry};}
  };
  f.multi = (p, q) => q.aiHint?.kind === 'modes' ? [q.options.find(row => /Untap/.test(row.label))?.key] : undefined;
  f.option = (p, q) => q.aiHint?.kind === 'mode' ? q.options.find(row => /Untap/.test(row.label))?.key
    : q.aiHint?.kind === 'newTargets' ? 'no' : undefined;
  f.targets = (p, q) => q.src?.iid === alliance.iid ? [skite] : undefined;
  await cast(f, f.b, alliance);
  assert.equal(turned, true); assert.equal(bender.faceDown, false);
  assert.equal(f.questions.filter(({q}) => q.aiHint?.kind === 'ward').length, 1,
    'same object remains the target of the same spell, so it never becomes a target again');
  assert.equal(lands.filter(card => card.tapped).length, 4, 'pay the two-mana spell and one actual two-mana Ward');
  assert.equal(skite.zone, 'battlefield');
});

for (const copied of [false, true]) {
  test(`${copied ? 'opposing copied' : 'original'} native Stomp Adventure receives spell lifelink from its controller's Firesong`, async () => {
    const f = table(), caster = copied ? f.b : f.a;
    f.put('Firesong and Sunspeaker', 'battlefield', caster);
    const giant = f.put('Bonecrusher Giant', 'hand');
    f.lands(['Mountain', 'Forest']);
    f.targets = (p, q) => {
      if (q.src?.iid === giant.iid) return [q.so?.isCopy ? f.d : f.c];
      const so = q.candidates.find(row => row.kind === 'spell' && row.card === giant);
      return so ? [so] : undefined;
    };
    if (copied) {
      const reverberate = f.put('Reverberate', 'hand', f.b);
      f.lands(['Mountain', 'Mountain'], f.b);
      respondOnce(f, f.b, reverberate);
    }
    await cast(f, f.a, giant, row => row.alt?.adventure);
    assert.equal(giant.zone, 'exile'); assert.equal(giant.meta.adventureExiled, true);
    assert.equal(caster.life, 42, 'the resolving face is a red Instant spell and has lifelink');
    assert.equal(f.c.life, 38);
    if (copied) {assert.equal(f.d.life, 38); assert.equal(f.a.life, 40);}
  });
}

test('native Stomp receives the ordinary Instant spell lifelink grant from Radiant Scrollwielder', async () => {
  const f = table(), giant = f.put('Bonecrusher Giant', 'hand');
  f.put('Radiant Scrollwielder'); f.lands(['Mountain', 'Forest']);
  f.targets = (p, q) => q.src?.iid === giant.iid ? [f.b] : undefined;
  await cast(f, f.a, giant, row => row.alt?.adventure);
  assert.equal(f.b.life, 38); assert.equal(f.a.life, 42);
});

test('Firesong spell lifelink does not grant lifelink to its own native creature combat damage', async () => {
  const f = table(), source = f.put('Firesong and Sunspeaker');
  f.attackers = p => p === f.a ? [{card: source, target: f.b}] : [];
  await f.g.combatPhase(f.a);
  assert.equal(f.b.life, 36); assert.equal(f.a.life, 40);
  assertGameStateInvariants(f.g, 'Firesong creature combat lifelink negative');
});

test('Spellskite preserves both counters assigned to the one target of native Contagion', async () => {
  const f = table(), skite = f.put('Spellskite'), bear = f.put('Grizzly Bears', 'battlefield', f.b);
  const contagion = f.put('Contagion', 'hand', f.b), island = f.lands(['Island'])[0];
  f.lands(Array(5).fill('Swamp'), f.b); f.g.turnPlayer = f.b;
  let activated = false;
  f.priority = (p, q) => {
    if (p !== f.a || activated) return;
    const so = q.stack.find(row => row.card === contagion), entry = q.acts.find(row => row.card === skite);
    if (so && entry) {activated = true; return {kind: 'activate', entry, targets: [[so]]};}
  };
  f.targets = (p, q) => q.src?.iid === contagion.iid ? [bear] : undefined;
  await cast(f, f.b, contagion);
  assert.equal(activated, true); assert.equal(island.tapped, true);
  assert.equal(skite.counters['-2/-1'], 2, 'redirecting the target preserves the two counters announced for that slot');
  assert.equal(bear.counters['-2/-1'] || 0, 0); assert.equal(bear.zone, 'battlefield');
});

test('Boltbender preserves native Contagion counter divisions when changing one target and retaining another', async () => {
  const f = table(), bender = f.put('Boltbender', 'hand'), first = f.put('Grizzly Bears'), second = f.put('Grizzly Bears'), fresh = f.put('Grizzly Bears');
  f.lands(['Forest', 'Forest', 'Forest']);
  await cast(f, f.a, bender, row => row.alt?.faceDownCast === 'disguise');
  f.lands(['Forest', 'Mountain']); f.lands(Array(5).fill('Swamp'), f.b);
  const contagion = f.put('Contagion', 'hand', f.b);
  let turned = false, keepQueries = 0;
  f.priority = (p, q) => {
    if (p !== f.a || turned || !q.stack.some(row => row.card === contagion)) return;
    const entry = q.acts.find(row => row.card === bender && row.turnFaceUp);
    if (entry) {turned = true; return {kind: 'activate', entry};}
  };
  f.targets = (p, q) => q.src?.iid === contagion.iid ? q.prompt?.includes('choose a new target') ? [fresh] : [first, second] : undefined;
  f.option = (p, q) => q.aiHint?.kind === 'newTargets' ? (++keepQueries === 1 ? 'yes' : 'no') : undefined;
  await cast(f, f.b, contagion);
  assert.equal(turned, true); assert.equal(keepQueries, 2);
  assert.equal(first.counters['-2/-1'] || 0, 0);
  assert.equal(fresh.counters['-2/-1'], 1, 'the changed slot keeps its assigned one counter');
  assert.equal(second.counters['-2/-1'], 1, 'the unchanged slot keeps its assigned one counter');
});

test('Boltbender retargets a red Fork copy using the copy colors rather than its blue physical original', async () => {
  const f = table(), bear = f.put('Grizzly Bears'), redProtected = f.put('Akroma, Angel of Wrath', 'battlefield', f.c), blueProtected = f.put('Scragnoth', 'battlefield', f.c);
  const bender = f.put('Boltbender', 'hand', f.c);
  f.lands(['Forest', 'Forest', 'Forest'], f.c);
  f.g.turnPlayer = f.c;
  await cast(f, f.c, bender, row => row.alt?.faceDownCast === 'disguise');
  f.g.turnPlayer = f.a;
  f.lands(['Forest', 'Mountain'], f.c); f.lands(['Island']); f.lands(['Mountain', 'Mountain'], f.b);
  const unsummon = f.put('Unsummon', 'hand'), fork = f.put('Fork', 'hand', f.b);
  let copied = false, turned = false, changed = false;
  f.priority = (p, q) => {
    if (p === f.b && !copied) {
      const row = q.casts.find(row => row.card === fork);
      if (row) {copied = true; return {kind: 'cast', card: fork, from: row.from, alt: row.alt};}
    }
    if (p === f.c && !turned && q.stack.some(row => row.isCopy && row.card === unsummon)) {
      const entry = q.acts.find(row => row.card === bender && row.turnFaceUp);
      if (entry) {turned = true; return {kind: 'activate', entry};}
    }
  };
  f.option = (p, q) => q.aiHint?.kind === 'newTargets' ? p === f.b ? 'no' : 'yes' : undefined;
  f.targets = (p, q) => {
    if (q.so?.isCopy && q.src?.iid === unsummon.iid) {
      changed = true;
      assert.equal(q.candidates.includes(redProtected), false, 'red Fork copy cannot target Akroma');
      assert.equal(q.candidates.includes(blueProtected), true, 'red Fork copy can target Scragnoth');
      return [blueProtected];
    }
    if (q.src?.iid === unsummon.iid) return [bear];
    const copy = q.candidates.find(row => row.isCopy && row.card === unsummon);
    if (copy && q.src?.iid === bender.iid) return [copy];
    const original = q.candidates.find(row => row.kind === 'spell' && row.card === unsummon);
    return original ? [original] : undefined;
  };
  await cast(f, f.a, unsummon);
  assert.equal(copied, true); assert.equal(turned, true); assert.equal(changed, true);
  assert.equal(bear.zone, 'hand'); assert.equal(blueProtected.zone, 'hand'); assert.equal(redProtected.zone, 'battlefield');
});

for (const modifier of ['Torbran, Thane of Red Fell', 'Firesong and Sunspeaker']) {
  test(`paid Etali casts an opponent-owned Shock with source control for its own ${modifier}`, async () => {
    const f = table(), etali = f.put('Etali, Primal Conqueror // Etali, Primal Sickness', 'hand');
    f.put(modifier); const lands = f.lands(['Mountain', 'Mountain', ...Array(5).fill('Forest')]);
    const shock = f.put('Shock', 'library', f.b);
    for (const p of [f.a, f.c, f.d]) f.put('Ornithopter', 'library', p);
    f.cards = (p, q) => q.from.includes(shock) ? [shock] : undefined;
    f.targets = (p, q) => q.src?.iid === shock.iid ? [f.c] : undefined;
    await cast(f, f.a, etali);
    assert.equal(etali.zone, 'battlefield'); assert.ok(lands.every(card => card.tapped));
    assert.equal(shock.zone, 'graveyard'); assert.ok(f.b.graveyard.includes(shock));
    assert.equal(shock.ctrl.idx, f.b.idx, 'leaving the stack restores the owner controller in its private graveyard');
    const event = f.castEvents.find(event => event.card === shock);
    assert.ok(event, 'Etali offered and actually cast the exiled nonland card');
    assert.equal(event.player.idx, f.a.idx); assert.equal(event.so.ctrl.idx, f.a.idx);
    assert.equal(f.c.life, modifier.startsWith('Torbran') ? 36 : 38);
    assert.equal(f.a.life, modifier.startsWith('Firesong') ? 42 : 40);
    assert.equal(f.b.life, 40, 'ownership of the physical card does not grant control of the spell damage');
  });
}

for (const recast of [false, true]) {
  test(`Narset's Reversal copy keeps its Fire colors ${recast ? 'after the physical original is recast as Ice' : 'while the physical original remains in hand'}`, async () => {
    const f = table(), split = f.put('Fire // Ice', 'hand'), reversal = f.put("Narset's Reversal", 'hand', f.b), iceTarget = f.put('Forest', 'battlefield', f.c);
    f.put('Torbran, Thane of Red Fell', 'battlefield', f.b);
    const originalMana = f.lands(['Mountain', 'Forest']), iceMana = f.lands(['Island', 'Forest']);
    f.lands(['Island', 'Island'], f.b);
    let reversed = false, castIce = false;
    f.priority = (p, q) => {
      if (p === f.b && !reversed) {
        const row = q.casts.find(row => row.card === reversal);
        if (row) {reversed = true; return {kind: 'cast', card: reversal, from: row.from, alt: row.alt};}
      }
      if (recast && p === f.a && !castIce && split.zone === 'hand' && q.stack.some(row => row.isCopy && row.card === split)) {
        const row = q.casts.find(row => row.card === split && row.alt?.splitHalf === 'right');
        if (row) {castIce = true; return {kind: 'cast', card: split, from: row.from, alt: row.alt};}
      }
    };
    f.targets = (p, q) => {
      if (q.src?.iid === split.iid) return q.so?.castOpts?.splitHalf === 'right' ? [iceTarget] : [q.so?.isCopy ? f.d : f.c];
      const original = q.candidates.find(row => row.kind === 'spell' && row.card === split);
      return original ? [original] : undefined;
    };
    await cast(f, f.a, split, row => row.alt?.splitHalf === 'left');
    assert.equal(reversed, true); assert.equal(castIce, recast); assert.ok(originalMana.every(card => card.tapped));
    assert.equal(f.c.life, 40, 'the original Fire was returned to hand and never resolves');
    assert.equal(f.d.life, 36, 'the red copy keeps its captured characteristics and receives Torbran plus two damage');
    assert.equal(split.zone, recast ? 'graveyard' : 'hand');
    assert.equal(iceTarget.tapped, recast); if (recast) assert.ok(iceMana.every(card => card.tapped));
  });
}

test('Boltbender changing Blessed Alliance to a new opposing Ward creature triggers and pays Ward once', async () => {
  const f = table(), elf = f.put('Llanowar Elves'), mystic = f.put('Elvish Mystic'), bender = f.put('Boltbender', 'hand');
  f.lands(['Forest']);
  await cast(f, f.a, bender, row => row.alt?.faceDownCast === 'disguise');
  assert.equal(elf.tapped, true); assert.equal(mystic.tapped, true);
  f.put('Bronze Guardian', 'battlefield', f.b);
  const skite = f.put('Spellskite', 'battlefield', f.b), alliance = f.put('Blessed Alliance', 'hand');
  const lands = f.lands(['Forest', 'Forest', 'Mountain', 'Plains', 'Plains', 'Plains']);
  let turned = false, targetQuestions = 0;
  f.priority = (p, q) => {
    if (p !== f.a || turned || !q.stack.some(row => row.card === alliance)) return;
    const entry = q.acts.find(row => row.card === bender && row.turnFaceUp);
    if (entry) {turned = true; return {kind: 'activate', entry};}
  };
  f.multi = (p, q) => q.aiHint?.kind === 'modes' ? [q.options.find(row => /Untap/.test(row.label))?.key] : undefined;
  f.option = (p, q) => q.aiHint?.kind === 'mode' ? q.options.find(row => /Untap/.test(row.label))?.key : undefined;
  f.targets = (p, q) => q.src?.iid === alliance.iid ? [++targetQuestions === 1 ? elf : skite] : undefined;
  await cast(f, f.a, alliance);
  assert.equal(turned, true); assert.equal(targetQuestions, 2);
  assert.equal(f.questions.filter(({q}) => q.aiHint?.kind === 'ward').length, 1);
  assert.ok(lands.every(card => card.tapped), 'pay Alliance2, face-up2, and exactly the newly triggered Ward2');
  assert.equal(elf.tapped, true); assert.equal(skite.zone, 'battlefield');
});

test('a copy of the Narset Fire copy inherits red after the physical original became a blue Ice spell', async () => {
  const f = table(), split = f.put('Fire // Ice', 'hand'), reversal = f.put("Narset's Reversal", 'hand', f.b), reverberate = f.put('Reverberate', 'hand', f.c), land = f.put('Forest', 'battlefield', f.d);
  f.put('Torbran, Thane of Red Fell', 'battlefield', f.b); f.put('Torbran, Thane of Red Fell', 'battlefield', f.c);
  f.lands(['Mountain', 'Forest', 'Island', 'Forest']); f.lands(['Island', 'Island'], f.b); f.lands(['Mountain', 'Mountain'], f.c);
  let reversed = false, castIce = false, copied = false;
  f.priority = (p, q) => {
    if (p === f.b && !reversed) {
      const row = q.casts.find(row => row.card === reversal);
      if (row) {reversed = true; return {kind: 'cast', card: reversal, from: row.from, alt: row.alt};}
    }
    if (p === f.a && !castIce && split.zone === 'hand' && q.stack.some(row => row.isCopy && row.card === split)) {
      const row = q.casts.find(row => row.card === split && row.alt?.splitHalf === 'right');
      if (row) {castIce = true; return {kind: 'cast', card: split, from: row.from, alt: row.alt};}
    }
    if (p === f.c && castIce && !copied && split.zone === 'graveyard' && q.stack.some(row => row.isCopy && row.card === split)) {
      const row = q.casts.find(row => row.card === reverberate);
      if (row) {copied = true; return {kind: 'cast', card: reverberate, from: row.from, alt: row.alt};}
    }
  };
  f.targets = (p, q) => {
    if (q.src?.iid === split.iid) return q.so?.castOpts?.splitHalf === 'right' ? [land] : [q.so?.isCopy ? p === f.c ? f.a : f.d : f.c];
    const copy = q.candidates.find(row => row.isCopy && row.card === split);
    if (q.src?.iid === reverberate.iid && copy) return [copy];
    const original = q.candidates.find(row => row.kind === 'spell' && row.card === split);
    return original ? [original] : undefined;
  };
  await cast(f, f.a, split, row => row.alt?.splitHalf === 'left');
  assert.equal(reversed, true); assert.equal(castIce, true); assert.equal(copied, true);
  assert.equal(f.copies.length, 2); assert.equal(f.a.life, 36); assert.equal(f.d.life, 36); assert.equal(f.c.life, 40);
  assert.equal(land.tapped, true); assert.equal(split.zone, 'graveyard'); assert.deepEqual(Array.from(split.castMeta.spellColors), ['U']);
});

test('native Circle of Protection Red can choose the red Fork copy of a blue Psionic Blast as a damage source', async () => {
  const f = table(), circle = f.put('Circle of Protection: Red'), blast = f.put('Psionic Blast', 'hand', f.b), fork = f.put('Fork', 'hand', f.c);
  f.put('Torbran, Thane of Red Fell', 'battlefield', f.c);
  const mana = f.lands(['Forest']); f.lands(['Island', 'Forest', 'Forest'], f.b); f.lands(['Mountain', 'Mountain'], f.c);
  let copied = false, activated = false, offered = false;
  f.priority = (p, q) => {
    if (p === f.c && !copied) {
      const row = q.casts.find(row => row.card === fork);
      if (row) {copied = true; return {kind: 'cast', card: fork, from: row.from, alt: row.alt};}
    }
    if (p === f.a && !activated && q.stack.some(row => row.isCopy && row.card === blast)) {
      const entry = q.acts.find(row => row.card === circle);
      if (entry) {activated = true; return {kind: 'activate', entry};}
    }
  };
  f.targets = (p, q) => q.src?.iid === blast.iid ? [f.a] : q.candidates.find(row => row.kind === 'spell' && row.card === blast) ? [q.candidates.find(row => row.kind === 'spell' && row.card === blast)] : undefined;
  f.option = (p, q) => {
    if (q.aiHint?.kind === 'newTargets') return 'no';
    if (q.aiHint?.kind === 'damagePreventionSource') {
      const row = q.options.find(row => row.card?.iid === blast.iid); offered = !!row;
      return row?.key ?? q.options[0]?.key;
    }
    return undefined;
  };
  await cast(f, f.b, blast);
  assert.equal(copied, true); assert.equal(activated, true); assert.ok(mana.every(card => card.tapped));
  assert.equal(f.a.life, 36, 'prevent the red copy six damage; the blue original still deals four');
  assert.equal(offered, true, 'the red copy is an offered red damage source despite the original being blue');
  assert.equal(f.b.life, 38); assert.equal(f.c.life, 38);
});

test('native Circle of Protection Red distinguishes the chosen original Shock from an opposing Reverberate copy', async () => {
  const f = table(), circle = f.put('Circle of Protection: Red'), shock = f.put('Shock', 'hand', f.b), reverberate = f.put('Reverberate', 'hand', f.c);
  f.put('Torbran, Thane of Red Fell', 'battlefield', f.c);
  f.lands(['Forest']); f.lands(['Mountain'], f.b); f.lands(['Mountain', 'Mountain'], f.c);
  let copied = false, activated = false, sources = 0;
  f.priority = (p, q) => {
    if (p === f.c && !copied) {
      const row = q.casts.find(row => row.card === reverberate);
      if (row) {copied = true; return {kind: 'cast', card: reverberate, from: row.from, alt: row.alt};}
    }
    if (p === f.a && !activated && q.stack.some(row => row.isCopy && row.card === shock)) {
      const entry = q.acts.find(row => row.card === circle);
      if (entry) {activated = true; return {kind: 'activate', entry};}
    }
  };
  f.targets = (p, q) => q.src?.iid === shock.iid ? [f.a] : q.candidates.find(row => row.kind === 'spell' && row.card === shock) ? [q.candidates.find(row => row.kind === 'spell' && row.card === shock)] : undefined;
  f.option = (p, q) => {
    if (q.aiHint?.kind === 'newTargets') return 'no';
    if (q.aiHint?.kind === 'damagePreventionSource') {
      sources = q.options.filter(row => row.card?.iid === shock.iid).length;
      return q.options.find(row => row.card === shock)?.key ?? q.options[0]?.key;
    }
    return undefined;
  };
  await cast(f, f.b, shock);
  assert.equal(copied, true); assert.equal(activated, true);
  assert.equal(f.a.life, 36, 'the chosen original two damage is prevented; the unchosen copy deals four');
  assert.equal(sources, 2, 'the original and the copy are distinct selectable damage sources');
});

for (const blinked of [false, true]) {
  test(`a native Circle shield chosen on a Goblin Guide spell ${blinked ? 'does not follow its later blinked incarnation' : 'follows the actual noncopy permanent it becomes'}`, async () => {
    const f = table(), circle = f.put('Circle of Protection: Red'), guide = f.put('Goblin Guide', 'hand', f.b);
    const circleMana = f.lands(['Forest']), guideMana = f.lands(['Mountain'], f.b);
    f.g.turnPlayer = f.b;
    let activated = false;
    f.priority = (p, q) => {
      if (p !== f.a || activated || !q.stack.some(row => row.card === guide)) return;
      const entry = q.acts.find(row => row.card === circle);
      if (entry) {activated = true; return {kind: 'activate', entry};}
    };
    f.option = (p, q) => q.aiHint?.kind === 'damagePreventionSource' ? q.options.find(row => row.card === guide)?.key : undefined;
    f.attackers = p => p === f.b ? [{card: guide, target: f.a}] : [];
    await cast(f, f.b, guide);
    assert.equal(activated, true); assert.ok([...circleMana, ...guideMana].every(card => card.tapped));
    if (blinked) {
      const blink = f.put('Momentary Blink', 'hand', f.b); f.lands(['Plains', 'Forest'], f.b);
      f.targets = (p, q) => q.src?.iid === blink.iid ? [guide] : undefined;
      await cast(f, f.b, blink, row => !row.alt?.flashback);
    }
    await f.g.combatPhase(f.b);
    assert.equal(f.a.life, blinked ? 38 : 40);
    assert.equal(guide.zone, 'battlefield'); assertGameStateInvariants(f.g, 'spell-to-permanent chosen source');
  });
}

test('native Circle source shield follows Goblin Arsonist last-known information through its death trigger', async () => {
  const f = table(), circle = f.put('Circle of Protection: Red'), arsonist = f.put('Goblin Arsonist', 'battlefield', f.b), shock = f.put('Shock', 'hand', f.b);
  const lands = [...f.lands(['Forest']), ...f.lands(['Mountain'], f.b)];
  let activated = false;
  f.priority = (p, q) => {
    if (p !== f.a || activated || !q.stack.some(row => row.card === shock)) return;
    const entry = q.acts.find(row => row.card === circle);
    if (entry) {activated = true; return {kind: 'activate', entry};}
  };
  f.option = (p, q) => q.aiHint?.kind === 'damagePreventionSource' ? q.options.find(row => row.card === arsonist)?.key : undefined;
  f.targets = (p, q) => q.src?.iid === shock.iid ? [arsonist] : q.src?.iid === arsonist.iid ? [f.a] : undefined;
  await cast(f, f.b, shock);
  assert.equal(activated, true); assert.ok(lands.every(card => card.tapped));
  assert.equal(arsonist.zone, 'graveyard'); assert.equal(f.a.life, 40, 'the departed red source death-trigger damage is prevented');
});

test('native Circle source choice distinguishes and prevents only the selected copy of a Shock copy', async () => {
  const f = table(), circle = f.put('Circle of Protection: Red'), shock = f.put('Shock', 'hand', f.b), reverberate = f.put('Reverberate', 'hand', f.c), fork = f.put('Fork', 'hand', f.d);
  f.put('Torbran, Thane of Red Fell', 'battlefield', f.c); f.put('Torbran, Thane of Red Fell', 'battlefield', f.d);
  f.lands(['Forest']); f.lands(['Mountain'], f.b); f.lands(['Mountain', 'Mountain'], f.c); f.lands(['Mountain', 'Mountain'], f.d);
  let first = false, second = false, activated = false, sources = 0;
  f.priority = (p, q) => {
    if (p === f.c && !first) {
      const row = q.casts.find(row => row.card === reverberate);
      if (row) {first = true; return {kind: 'cast', card: reverberate, from: row.from, alt: row.alt};}
    }
    if (p === f.d && !second && q.stack.some(row => row.isCopy && row.ctrl === f.c && row.card === shock)) {
      const row = q.casts.find(row => row.card === fork);
      if (row) {second = true; return {kind: 'cast', card: fork, from: row.from, alt: row.alt};}
    }
    if (p === f.a && !activated && q.stack.some(row => row.isCopy && row.ctrl === f.d && row.card === shock)) {
      const entry = q.acts.find(row => row.card === circle);
      if (entry) {activated = true; return {kind: 'activate', entry};}
    }
  };
  f.targets = (p, q) => {
    if (q.src?.iid === shock.iid) return [f.a];
    const original = q.candidates.find(row => row.kind === 'spell' && row.card === shock && (q.src?.iid !== fork.iid || row.isCopy && row.ctrl === f.c));
    return original ? [original] : undefined;
  };
  f.option = (p, q) => {
    if (q.aiHint?.kind === 'newTargets') return 'no';
    if (q.aiHint?.kind === 'damagePreventionSource') {
      sources = q.options.filter(row => row.card?.iid === shock.iid).length;
      return q.options.find(row => row.card?.iid === shock.iid && row.card.ctrl === f.d)?.key ?? q.options[0]?.key;
    }
    return undefined;
  };
  await cast(f, f.b, shock);
  assert.equal(first, true); assert.equal(second, true); assert.equal(activated, true);
  assert.equal(f.a.life, 34, 'prevent only the chosen four damage; the other copy four and original two remain');
  assert.equal(sources, 3);
});

for (const copied of [false, true]) {
  test(`paid Blue Sun's Zenith ${copied ? 'and its opposing copy each draw and shuffle only their own physical library' : 'draws before shuffling its actual physical card into its owner library'}`, async () => {
    const f = table(), zenith = f.put("Blue Sun's Zenith", 'hand'), top = f.put('Sol Ring', 'library');
    const mana = f.lands(['Island', 'Island', 'Island', 'Forest']);
    let used;
    if (copied) {
      const reverb = f.put('Reverberate', 'hand', f.b);
      const copyMana = f.lands(['Mountain', 'Mountain'], f.b);
      used = respondOnce(f, f.b, reverb);
      f.copyMana = copyMana;
    }
    f.x = (p, q) => q.card?.iid === zenith.iid || q.aiHint?.card?.iid === zenith.iid ? 1 : undefined;
    f.targets = (p, q) => {
      if (q.src?.iid === zenith.iid) return [q.so?.isCopy ? f.b : f.a];
      const original = q.candidates.find(row => row.kind === 'spell' && row.card === zenith);
      return original ? [original] : undefined;
    };
    const offer = f.g.castableList(f.a).find(row => row.card === zenith);
    assert.ok(offer, 'native X spell cast offer');
    assert.equal(await f.g.castSpell(f.a, zenith, {from: offer.from, alt: offer.alt}), true);
    assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
    assert.ok(mana.every(card => card.tapped), 'the actual X=1 plus UUU cost was paid');
    if (copied) {assert.equal(used(), true); assert.ok(f.copyMana.every(card => card.tapped));}
    assert.equal(f.a.hand.includes(top), true, 'the original draws its unchanged top card before its own shuffle');
    assert.equal(f.b.hand.length, copied ? 1 : 0, 'only the opposing copy draws the opposing player one card');
    assert.equal(zenith.zone, 'library'); assert.equal(zenith.owner.idx, f.a.idx);
    assert.equal(f.a.library.filter(card => card.iid === zenith.iid).length, 1, 'only the actual original exists in its owner library');
    assert.equal(f.b.library.some(card => card.iid === zenith.iid), false, 'a spell copy is never inserted into a physical library');
    assertGameStateInvariants(f.g, "Blue Sun's Zenith self shuffle");
    assertRecalculationStable(f.g, "Blue Sun's Zenith self shuffle");
  });
}

test("paid Blue Sun's Zenith copy shuffles its creator library and triggers that player's native Widespread Panic", async () => {
  const f = table(), zenith = f.put("Blue Sun's Zenith", 'hand'), reverb = f.put('Reverberate', 'hand', f.b);
  f.put('Widespread Panic');
  const topA = f.put('Sol Ring', 'library'), topB = f.put('Lotus Petal', 'library', f.b);
  const mana = [...f.lands(['Island', 'Island', 'Island', 'Forest']), ...f.lands(['Mountain', 'Mountain'], f.b)];
  f.x = (p, q) => q.card?.iid === zenith.iid || q.aiHint?.card?.iid === zenith.iid ? 1 : undefined;
  f.targets = (p, q) => {
    if (q.src?.iid === zenith.iid) return [q.so?.isCopy ? f.b : f.a];
    const original = q.candidates.find(row => row.kind === 'spell' && row.card === zenith);
    return original ? [original] : undefined;
  };
  const used = respondOnce(f, f.b, reverb);
  const offer = f.g.castableList(f.a).find(row => row.card === zenith);
  assert.ok(offer); assert.equal(await f.g.castSpell(f.a, zenith, {from: offer.from, alt: offer.alt}), true);
  assert.equal(used(), true); assert.ok(mana.every(card => card.tapped));
  assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
  assert.equal(f.b.hand.length, 0, 'the copy owner shuffled their own library and put their drawn card back through Panic');
  assert.equal(f.b.library.at(-1) === topB, true, 'the copied spell shuffled b, and native Panic restored b\'s drawn Lotus Petal to the top');
  assert.equal(f.a.hand.length, 0); assert.equal(f.a.library.at(-1) === topA, true);
  assertGameStateInvariants(f.g, 'copied Zenith library ownership');
});

for (const copied of [false, true]) {
  test(`paid Commandeer ${copied ? 'changes only its targeted Shock copy controller' : 'changes the targeted physical Shock controller but retains its owner'}`, async () => {
    const f = table(), shock = f.put('Shock', 'hand'), commandeer = f.put('Commandeer', 'hand', f.c);
    f.put('Torbran, Thane of Red Fell'); f.put('Firesong and Sunspeaker', 'battlefield', f.c);
    const mana = [...f.lands(['Mountain']), ...f.lands(['Island', 'Island', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest'], f.c)];
    let first = false, taken = false, controlled;
    let reverb;
    if (copied) {reverb = f.put('Reverberate', 'hand', f.b); mana.push(...f.lands(['Mountain', 'Mountain'], f.b));}
    f.priority = (p, q) => {
      if (copied && p === f.b && !first) {
        const row = q.casts.find(row => row.card === reverb);
        if (row) {first = true; return {kind: 'cast', card: reverb, from: row.from, alt: row.alt};}
      }
      if (p === f.c && !taken && q.stack.some(row => row.card === shock && !!row.isCopy === copied)) {
        const row = q.casts.find(row => row.card === commandeer && !row.alt?.oracleAlternativeCost);
        if (row) {taken = true; return {kind: 'cast', card: commandeer, from: row.from, alt: row.alt};}
      }
    };
    f.targets = (p, q) => {
      if (q.src?.iid === shock.iid) return [f.d];
      const object = q.candidates.find(row => row.kind === 'spell' && row.card === shock && (q.src?.iid !== commandeer.iid || !!row.isCopy === copied));
      if (q.src?.iid === commandeer.iid) controlled = object;
      return object ? [object] : undefined;
    };
    await cast(f, f.a, shock);
    assert.equal(taken, true); if (copied) assert.equal(first, true);
    assert.ok(mana.every(card => card.tapped), 'Shock, copy response and full Commandeer mana costs are paid');
    assert.equal(f.d.life, copied ? 34 : 38, 'the original keeps its own Torbran controller unless it was the actually controlled spell');
    assert.equal(f.c.life, 42, 'Firesong grants lifelink only to the taken spell object');
    assert.equal(controlled.ctrl.idx, f.c.idx); assert.equal(shock.owner.idx, f.a.idx);
    assert.equal(shock.zone, 'graveyard'); assert.equal(shock.ctrl.idx, f.a.idx);
    if (copied) assert.equal(controlled.owner?.idx, f.b.idx, 'a copy remains owned by its creator after its controller changes');
  });
}

for (const name of ["White Sun's Zenith", 'Beacon of Destruction']) {
  test(`copied self-shuffle ${name} still shuffles its creator library through native Widespread Panic`, async () => {
    const f = table(), original = f.put(name, 'hand'), reverb = f.put('Reverberate', 'hand', f.b), marker = f.put('Sol Ring', 'hand', f.b);
    f.put('Widespread Panic');
    const mana = [...f.lands(name === "White Sun's Zenith" ? ['Plains', 'Plains', 'Plains', 'Forest'] : ['Mountain', 'Mountain', 'Forest', 'Forest', 'Forest']), ...f.lands(['Mountain', 'Mountain'], f.b)];
    f.x = (p, q) => q.card?.iid === original.iid || q.aiHint?.card?.iid === original.iid ? 1 : undefined;
    f.targets = (p, q) => {
      if (q.src?.iid === original.iid) return [f.d];
      const object = q.candidates.find(row => row.kind === 'spell' && row.card === original);
      return object ? [object] : undefined;
    };
    const used = respondOnce(f, f.b, reverb);
    await cast(f, f.a, original);
    assert.equal(used(), true); assert.ok(mana.every(card => card.tapped));
    assert.equal(f.b.hand.length, 0, 'the copied printed shuffle triggers Panic on the copy creator');
    assert.equal(f.b.library.at(-1) === marker, true);
    assert.equal(f.a.library.filter(card => card.iid === original.iid).length, 1);
    assert.equal(f.b.library.some(card => card.iid === original.iid), false);
    if (name === "White Sun's Zenith") {
      assert.equal(f.g.creatures(f.a).filter(card => card.hasSub('Cat') && card.isToken).length, 1);
      assert.equal(f.g.creatures(f.b).filter(card => card.hasSub('Cat') && card.isToken).length, 1);
    } else assert.equal(f.d.life, 30);
  });
}

test("paid Commandeer of a Blue Sun's Zenith copy retains its creator's library ownership", async () => {
  const f = table(), zenith = f.put("Blue Sun's Zenith", 'hand'), reverb = f.put('Reverberate', 'hand', f.b), commandeer = f.put('Commandeer', 'hand', f.c);
  f.put('Widespread Panic');
  const topA = f.put('Sol Ring', 'library'), topB = f.put('Lotus Petal', 'library', f.b), retained = f.put('Mox Diamond', 'hand', f.c);
  const mana = [...f.lands(['Island', 'Island', 'Island', 'Forest']), ...f.lands(['Mountain', 'Mountain'], f.b), ...f.lands(['Island', 'Island', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest'], f.c)];
  let copied = false, taken = false, object;
  f.priority = (p, q) => {
    if (p === f.b && !copied) {const row = q.casts.find(row => row.card === reverb); if (row) {copied = true; return {kind: 'cast', card: reverb, from: row.from, alt: row.alt};}}
    if (p === f.c && !taken && q.stack.some(row => row.card === zenith && row.isCopy)) {
      const row = q.casts.find(row => row.card === commandeer && !row.alt?.oracleAlternativeCost);
      if (row) {taken = true; return {kind: 'cast', card: commandeer, from: row.from, alt: row.alt};}
    }
  };
  f.x = (p, q) => q.card?.iid === zenith.iid || q.aiHint?.card?.iid === zenith.iid ? 1 : undefined;
  f.targets = (p, q) => {
    if (q.src?.iid === zenith.iid) return [q.so?.isCopy ? f.b : f.a];
    const target = q.candidates.find(row => row.kind === 'spell' && row.card === zenith && (q.src?.iid !== commandeer.iid || row.isCopy));
    if (q.src?.iid === commandeer.iid) object = target;
    return target ? [target] : undefined;
  };
  f.option = (p, q) => q.aiHint?.kind === 'newTargets' && p === f.c ? 'no' : undefined;
  await cast(f, f.a, zenith);
  assert.equal(copied, true); assert.equal(taken, true); assert.ok(mana.every(card => card.tapped));
  assert.equal(object.ctrl.idx, f.c.idx); assert.equal(object.owner?.idx, f.b.idx);
  assert.equal(f.b.hand.includes(topB), true, 'c controls the copy, so b keeps the card drawn before its library was shuffled');
  assert.equal(f.c.hand.includes(retained), true, 'the copy shuffles b\'s library, so c never triggers Panic on its own library');
  assert.equal(f.a.library.at(-1) === topA, true);
  assert.equal(f.a.library.filter(card => card.iid === zenith.iid).length, 1);
  assert.equal(f.b.library.some(card => card.iid === zenith.iid), false);
});

test("a paid copy of a Blue Sun's Zenith copy shuffles each new creator's own library", async () => {
  const f = table(), zenith = f.put("Blue Sun's Zenith", 'hand'), first = f.put('Reverberate', 'hand', f.b), second = f.put('Reverberate', 'hand', f.c);
  f.put('Widespread Panic');
  const topA = f.put('Sol Ring', 'library'), topB = f.put('Lotus Petal', 'library', f.b), topC = f.put('Chrome Mox', 'library', f.c);
  const mana = [...f.lands(['Island', 'Island', 'Island', 'Forest']), ...f.lands(['Mountain', 'Mountain'], f.b), ...f.lands(['Mountain', 'Mountain'], f.c)];
  let one = false, two = false;
  f.priority = (p, q) => {
    if (p === f.b && !one) {const row = q.casts.find(row => row.card === first); if (row) {one = true; return {kind: 'cast', card: first, from: row.from, alt: row.alt};}}
    if (p === f.c && !two && q.stack.some(row => row.card === zenith && row.isCopy && row.ctrl === f.b)) {
      const row = q.casts.find(row => row.card === second);
      if (row) {two = true; return {kind: 'cast', card: second, from: row.from, alt: row.alt};}
    }
  };
  f.x = (p, q) => q.card?.iid === zenith.iid || q.aiHint?.card?.iid === zenith.iid ? 1 : undefined;
  f.targets = (p, q) => {
    if (q.src?.iid === zenith.iid) return [q.so?.isCopy ? p : f.a];
    const object = q.candidates.find(row => row.kind === 'spell' && row.card === zenith && (q.src?.iid !== second.iid || row.isCopy && row.ctrl === f.b));
    return object ? [object] : undefined;
  };
  await cast(f, f.a, zenith);
  assert.equal(one, true); assert.equal(two, true); assert.ok(mana.every(card => card.tapped));
  for (const [p, top] of [[f.a, topA], [f.b, topB], [f.c, topC]]) {assert.equal(p.hand.length, 0); assert.equal(p.library.at(-1) === top, true);}
  assert.equal(f.a.library.filter(card => card.iid === zenith.iid).length, 1);
  assert.equal(f.b.library.some(card => card.iid === zenith.iid), false); assert.equal(f.c.library.some(card => card.iid === zenith.iid), false);
});

test('native paid Triskelavus sacrifice damage remains usable across consecutive matches', async () => {
  for (let match = 0; match < 2; match++) {
    const f = table(), triskelavus = f.put('Triskelavus', 'hand'), mana = f.lands(Array(8).fill('Forest'));
    await cast(f, f.a, triskelavus);
    const make = f.g.activatableList(f.a).find(row => row.card === triskelavus && row.ability === triskelavus.def.abilities[0]);
    assert.ok(make, 'native remove-a-counter token activation offer');
    assert.equal(await f.g.activateAbility(f.a, make), true);
    const token = f.g.creatures(f.a).find(card => card.isToken && card.hasSub('Triskelavite'));
    assert.ok(token); assert.equal(triskelavus.counters['+1/+1'], 2);
    f.targets = (p, q) => q.src?.iid === token.iid ? [f.b] : undefined;
    const damage = f.g.activatableList(f.a).find(row => row.card === token);
    assert.ok(damage, 'native sacrifice Triskelavite damage offer');
    assert.equal(await f.g.activateAbility(f.a, damage), true);
    assert.equal(f.b.life, 39); assert.equal(token.zone, 'ceased');
    assert.ok(mana.every(card => card.tapped), 'pay seven for Triskelavus and one for the printed token ability');
    assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
    assertGameStateInvariants(f.g, 'Triskelavite damage match ' + match);
  }
});

test.after(() => {
  const out = new URL('../output/extended-engine-audit-2026-10-10/targets-resolution/', import.meta.url);
  mkdirSync(out, {recursive: true});
  writeFileSync(new URL('native-proof.json', out), JSON.stringify({traces}, null, 2));
});
