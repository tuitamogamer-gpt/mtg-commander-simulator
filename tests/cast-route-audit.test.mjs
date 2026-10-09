import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { assertGameStateInvariants } from './helpers/game-state-invariants.mjs';

const M = loadEngine();

// Native definitions, untapped lands, and the real priority/Stack pipeline.
// Controllers only select actions/choices that the engine presents; no rule
// helpers or replacement priority/cost/target implementations are installed.
function table() {
  const g = new M.Game({ seed: 9100947, paced: false, maxTurns: 20 });
  const a = g.addPlayer('Caster', { name: 'Cast route audit' }, null, false);
  const b = g.addPlayer('Opponent', { name: 'Cast route audit' }, null, false);
  const f = { g, a, b, questions: [], responses: [], casts: [] };
  for (const p of [a, b]) p.controller = { decide: async (game, q) => {
    f.questions.push({ player: p, q });
    if (q.type === 'priority') {
      const action = f.priority?.(p, q);
      if (action && action.kind !== 'pass') f.responses.push(action);
      return action || { kind: 'pass' };
    }
    if (q.type === 'main') return { kind: 'done' };
    if (q.type === 'attackers') return f.attackers?.(p, q) || [];
    if (q.type === 'blockers' || q.type === 'combatReview') return [];
    if (q.type === 'chooseTargets') return f.targets?.(p, q) || q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return f.cards?.(p, q) || q.from.slice(0, q.min || 0);
    if (q.type === 'chooseManaSources') return { cards: q.suggested };
    if (q.type === 'chooseOption') return f.option?.(p, q) ?? q.options.find(o => o.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseX') return q.min || 0;
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return { top: q.cards, bottom: [] };
    if (q.type === 'cardReveal') return null;
    throw new Error('Unhandled audit decision: ' + q.type);
  } };
  g.turnPlayer = a; g.turnNo = 8; g.phase = 'main1'; g.step = 'main';
  const emit = g.emit.bind(g);
  g.emit = async (event, data, ...rest) => {
    if (event === 'cast') f.casts.push(data);
    return emit(event, data, ...rest);
  };
  f.put = (name, zone = 'battlefield', owner = a) => {
    assert.ok(M.DEFS[name], 'native definition: ' + name);
    const c = new M.CardInst(M.DEFS[name], owner);
    c.zone = zone; c.sick = false;
    if (zone === 'battlefield') g.battlefield.push(c);
    else owner[zone].push(c);
    g.recalc();
    return c;
  };
  f.lands = (names, p = a) => names.map(name => f.put(name, 'battlefield', p));
  for (const p of [a, b]) for (let i = 0; i < 16; i++) f.put('Forest', 'library', p);
  return f;
}

function offer(f, card, predicate = () => true) {
  const row = f.g.castableList(f.a).find(entry => entry.card === card && predicate(entry.alt || {}));
  assert.ok(row, 'native cast offer for ' + card.name);
  return row;
}

async function castOffered(f, row) {
  assert.equal(await f.g.castSpell(f.a, row.card, { from: row.from, alt: row.alt }), true);
  assert.equal(f.g.stack.length, 0, 'real priority resolves the Stack');
  assertGameStateInvariants(f.g);
}

function respondOnce(f, card, predicate = () => true) {
  let used = false;
  f.priority = (p, q) => {
    if (p !== f.a || used) return;
    const row = q.casts.find(entry => entry.card === card && predicate(entry.alt || {}));
    if (!row) return;
    used = true;
    return { kind: 'cast', card, from: row.from, alt: row.alt };
  };
}

async function attackEtali(f, hit) {
  const etali = f.put('Etali, Primal Storm');
  const control = f.put('Grizzly Bears', 'library', f.b);
  f.attackers = p => p === f.a ? [{ card: etali, target: f.b }] : [];
  await f.g.combatPhase(f.a);
  assert.equal(control.zone, 'battlefield', 'ordinary exiled rival spell casts through the same trigger');
  assert.equal(control.ctrl, f.a);
  assert.equal(hit.owner, f.a);
  assert.equal(f.g.stack.length, 0);
  assertGameStateInvariants(f.g);
  return etali;
}

for (const name of ['Boggart Trawler // Boggart Bog', 'Sea Gate Restoration // Sea Gate, Reborn']) {
  test(`Etali combat trigger can free-cast the native MDFC ${name}`, async () => {
    const f = table(), hit = f.put(name, 'library');
    await attackEtali(f, hit);
    assert.ok(f.casts.some(data => data.card === hit), 'accepting the free cast actually casts the selected face');
    assert.equal(hit.zone, name.startsWith('Boggart') ? 'battlefield' : 'graveyard');
    assert.equal(hit.castMeta.alt.oracleFace, 'front');
    assert.equal(hit.castMeta.manaSpent, 0);
  });
}

test('Etali free-cast choice includes the Adventure half instead of forcing the creature', async () => {
  const f = table(), hit = f.put('Bonecrusher Giant', 'library');
  f.option = (p, q) => q.options.find(row => /Stomp/.test(row.label))?.key;
  f.targets = (p, q) => q.candidates.includes(f.b) ? [f.b] : undefined;
  await attackEtali(f, hit);
  assert.equal(hit.zone, 'exile', 'Stomp resolves and grants the later creature cast');
  assert.equal(hit.meta.adventureExiled, true);
  assert.equal(hit.castMeta.alt.adventure, true);
  assert.equal(f.b.life, 32, 'Stomp deals two plus Etali deals six combat damage');
});

test('Etali still respects declining a free cast', async () => {
  const f = table(), hit = f.put('Boggart Trawler // Boggart Bog', 'library');
  f.option = (p, q) => q.aiHint?.kind === 'freeCast' && q.card === hit ? 'no' : undefined;
  await attackEtali(f, hit);
  assert.equal(hit.zone, 'exile');
  assert.equal(f.casts.some(data => data.card === hit), false);
});

test("paid Mizzix's Mastery casts a native MDFC copy and preserves the exiled original", async () => {
  const f = table(), original = f.put('Sea Gate Restoration // Sea Gate, Reborn', 'graveyard');
  const lands = f.lands(['Mountain', 'Mountain', 'Mountain', 'Mountain']);
  const mastery = f.put("Mizzix's Mastery", 'hand');
  await castOffered(f, offer(f, mastery));
  assert.equal(original.zone, 'exile');
  assert.equal(mastery.zone, 'exile');
  const copied = f.casts.find(data => data.card !== original && data.so.name === 'Sea Gate Restoration');
  assert.ok(copied, 'the MDFC copy becomes a separately cast spell');
  assert.equal(copied.card.castMeta.alt.oracleFace, 'front');
  assert.equal(copied.card.castMeta.manaSpent, 0);
  assert.deepEqual(lands.map(c => c.tapped), [true, true, true, true]);
});

test("Mizzix's Mastery may-copy cast can be declined while the original remains exiled", async () => {
  const f = table(), original = f.put('Ponder', 'graveyard');
  f.lands(['Mountain', 'Mountain', 'Mountain', 'Mountain']);
  const mastery = f.put("Mizzix's Mastery", 'hand');
  f.option = (p, q) => q.aiHint?.kind === 'freeCast' && q.card?.name === 'Ponder' ? 'no' : undefined;
  f.cards = (p, q) => /may cast/i.test(q.prompt || '') ? [] : undefined;
  await castOffered(f, offer(f, mastery));
  assert.equal(original.zone, 'exile');
  assert.equal(f.casts.length, 1, 'declining does not silently cast the copy');
});

test("Mizzix's Mastery targets only the caster's graveyard", () => {
  const f = table(), other = f.put('Ponder', 'graveyard', f.b);
  f.lands(['Mountain', 'Mountain', 'Mountain', 'Mountain']);
  const mastery = f.put("Mizzix's Mastery", 'hand');
  assert.equal(f.g.castableList(f.a).some(row => row.card === mastery && !row.alt?.overloaded), false,
    'a rival graveyard card cannot enable the ordinary targeted cast');
  const own = f.put('Brainstorm', 'graveyard');
  const row = offer(f, mastery, alt => !alt.overloaded);
  const specs = f.g.spellTargetSpecs(mastery, row.alt || {}, f.a);
  assert.deepEqual(Array.from(f.g.legalTargets(specs[0], mastery, f.a)), [own]);
  assert.equal(other.zone, 'graveyard');
});

test("Mizzix's Mastery casts the legal Consign half of a split copy without granting Aftermath from exile", async () => {
  const f = table(), original = f.put('Consign // Oblivion', 'graveyard');
  const bear = f.put('Grizzly Bears', 'battlefield', f.b);
  f.lands(['Mountain', 'Mountain', 'Mountain', 'Mountain']);
  const mastery = f.put("Mizzix's Mastery", 'hand');
  f.targets = (p, q) => q.candidates.includes(original) ? [original]
    : q.candidates.includes(bear) ? [bear] : undefined;
  await castOffered(f, offer(f, mastery));
  assert.equal(original.zone, 'exile'); assert.equal(bear.zone, 'hand');
  const copied = f.casts.find(data => data.card !== original && data.so.name === 'Consign');
  assert.ok(copied);
  assert.equal(copied.card.castMeta.alt.splitHalf, 'left');
  assert.equal(copied.card.castMeta.manaSpent, 0);
  assert.equal(f.questions.some(({q}) => q.type === 'chooseOption' &&
    q.aiHint?.kind === 'oracleSpellFace' && q.options.some(row => /Oblivion/.test(row.label))), false,
  'copying does not permit an Aftermath-only half from exile');
});

test("Mizzix's Mastery MDFC copy binds real graveyard targets to the selected front face", async () => {
  const f = table(), original = f.put('Bala Ged Recovery // Bala Ged Sanctuary', 'graveyard');
  const bear = f.put('Grizzly Bears', 'graveyard');
  f.lands(['Mountain', 'Mountain', 'Mountain', 'Mountain']);
  const mastery = f.put("Mizzix's Mastery", 'hand');
  f.targets = (p, q) => q.candidates.includes(original) ? [original]
    : q.candidates.includes(bear) ? [bear] : undefined;
  await castOffered(f, offer(f, mastery));
  assert.equal(original.zone, 'exile');
  assert.equal(bear.zone, 'hand', 'the copied Sorcery resolves its real chosen target');
  const copied = f.casts.find(data => data.card !== original && data.so.name === 'Bala Ged Recovery');
  assert.ok(copied);
  assert.equal(copied.card.castMeta.alt.oracleFace, 'front');
  assert.equal(copied.card.castMeta.manaSpent, 0);
});

test('Etali free-cast Wear // Tear offers individual halves but forbids Fuse outside the hand', async () => {
  const f = table(), hit = f.put('Wear // Tear', 'library');
  const ring = f.put('Sol Ring', 'battlefield', f.b), arena = f.put('Phyrexian Arena', 'battlefield', f.b);
  f.option = (p, q) => q.options.find(row => /Tear/.test(row.label) && !/Wear/.test(row.label))?.key;
  f.targets = (p, q) => q.candidates.includes(arena) ? [arena]
    : q.candidates.includes(ring) ? [ring] : undefined;
  await attackEtali(f, hit);
  assert.equal(hit.castMeta.alt.splitHalf, 'right');
  assert.equal(hit.castMeta.alt.splitFuse, undefined);
  assert.equal(arena.zone, 'graveyard'); assert.equal(ring.zone, 'battlefield');
});

test('Psionic Ritual lets its caster decline the copy after exiling an opposing original', async () => {
  const f = table(), original = f.put('Ponder', 'graveyard', f.b);
  f.lands(['Island', 'Island', 'Island', 'Island', 'Island', 'Island']);
  const ritual = f.put('Psionic Ritual', 'hand');
  f.option = (p, q) => q.aiHint?.kind === 'freeCast' && q.card?.name === 'Ponder' ? 'no' : undefined;
  await castOffered(f, offer(f, ritual));
  assert.equal(original.zone, 'exile'); assert.equal(ritual.zone, 'exile');
  assert.equal(f.casts.length, 1, 'printed may-cast choice is independent from exiling the original');
  assert.equal(f.a.exile.some(c => c.isCopySpell), false, 'declined temporary copy is removed');
});

test('Bloodthirsty Adversary can pay and exile a chosen original while declining its copy cast', async () => {
  const f = table(), original = f.put('Ponder', 'graveyard');
  const lands = f.lands(['Mountain', 'Mountain', 'Mountain', 'Island', 'Island']);
  const adversary = f.put('Bloodthirsty Adversary', 'hand');
  f.option = (p, q) => q.aiHint?.kind === 'freeCast' && q.card?.name === 'Ponder' ? 'no' : undefined;
  f.cards = (p, q) => q.from.includes(original) ? [original] : undefined;
  await castOffered(f, offer(f, adversary));
  assert.equal(adversary.zone, 'battlefield'); assert.equal(original.zone, 'exile');
  assert.equal(adversary.counters['+1/+1'], 1);
  assert.equal(lands.every(c => c.tapped), true, 'printed cast and one {2}{R} payment consume actual lands');
  assert.equal(f.casts.length, 1, 'selecting originals for exile must not force casting their copies');
  assert.equal(f.a.exile.some(c => c.isCopySpell), false);
});

test('Spelltwine retains its mandatory copy casts even when optional free casts would be declined', async () => {
  const f = table(), own = f.put('Ponder', 'graveyard'), other = f.put('Preordain', 'graveyard', f.b);
  f.lands(['Island', 'Island', 'Island', 'Island', 'Island', 'Island']);
  const twine = f.put('Spelltwine', 'hand');
  f.option = (p, q) => q.aiHint?.kind === 'freeCast' ? 'no' : undefined;
  await castOffered(f, offer(f, twine));
  assert.equal(own.zone, 'exile'); assert.equal(other.zone, 'exile'); assert.equal(twine.zone, 'exile');
  assert.equal(f.casts.length, 3, 'both copied Sorceries are separately cast as instructed');
  assert.equal(f.casts.filter(data => data.card.isCopySpell).length, 2);
  assert.equal(f.a.exile.some(c => c.isCopySpell), false);
});

test('native Hypnotic Sprite Adventure counters on an opposing turn then offers its creature from exile', async () => {
  const f = table(), sprite = f.put('Hypnotic Sprite', 'hand');
  const lands = f.lands(['Island', 'Island', 'Island']);
  respondOnce(f, sprite, alt => alt.adventure);
  f.g.turnPlayer = f.b;
  const bolt = f.put('Lightning Bolt', 'hand', f.b);
  f.lands(['Mountain'], f.b);
  assert.equal(await f.g.castSpell(f.b, bolt), true);
  assert.equal(f.responses.length, 1, 'real priority offered Mesmeric Glare');
  assert.equal(bolt.zone, 'graveyard');
  assert.equal(sprite.zone, 'exile');
  assert.equal(sprite.meta.adventureExiled, true);
  assert.equal(sprite.castMeta.manaSpent, 3);
  assert.deepEqual(lands.map(c => c.tapped), [true, true, true]);
  f.lands(['Island', 'Island']);
  assert.equal(f.g.castableList(f.a).some(row => row.card === sprite), false, 'creature timing remains restricted');
  f.g.turnPlayer = f.a;
  await castOffered(f, offer(f, sprite, alt => !alt.adventure));
  assert.equal(sprite.zone, 'battlefield');
  assert.equal(sprite.castMeta.manaSpent, 2);
});

test('split Consign responds to a spell and its Aftermath half uses paid own-main timing', async () => {
  const f = table(), split = f.put('Consign // Oblivion', 'hand');
  const bear = f.put('Grizzly Bears', 'battlefield', f.b);
  f.lands(['Island', 'Island']); f.lands(['Mountain'], f.b);
  f.targets = (p, q) => p === f.a && q.candidates.includes(bear) ? [bear] : undefined;
  respondOnce(f, split, alt => alt.splitHalf === 'left');
  f.g.turnPlayer = f.b;
  assert.equal(await f.g.castSpell(f.b, f.put('Lightning Bolt', 'hand', f.b)), true);
  assert.equal(split.zone, 'graveyard'); assert.equal(bear.zone, 'hand');
  f.lands(['Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp']);
  f.put('Island', 'hand', f.b);
  assert.equal(f.g.castableList(f.a).some(row => row.card === split), false, 'Aftermath is a Sorcery');
  f.g.turnPlayer = f.a;
  await castOffered(f, offer(f, split, alt => alt.isAftermath));
  assert.equal(split.zone, 'exile');
  assert.equal(split.castMeta.manaSpent, 5);
  assert.equal(f.b.hand.length, 0);
});

test('Wear // Tear Fuse pays both halves and destroys two different native targets', async () => {
  const f = table(), split = f.put('Wear // Tear', 'hand');
  const ring = f.put('Sol Ring', 'battlefield', f.b), arena = f.put('Phyrexian Arena', 'battlefield', f.b);
  f.lands(['Mountain', 'Mountain', 'Plains']);
  f.targets = (p, q) => q.candidates.includes(ring) ? [ring] : q.candidates.includes(arena) ? [arena] : undefined;
  f.g.turnPlayer = f.b;
  await castOffered(f, offer(f, split, alt => alt.splitFuse));
  assert.equal(ring.zone, 'graveyard'); assert.equal(arena.zone, 'graveyard');
  assert.equal(split.zone, 'graveyard'); assert.equal(split.castMeta.manaSpent, 3);
});

for (const name of ['Force of Will', 'Force of Negation']) {
  test(`${name} pays a real blue-card pitch and counters through the native response window`, async () => {
    const f = table(), force = f.put(name, 'hand'), pitch = f.put('Brainstorm', 'hand');
    f.g.turnPlayer = f.b;
    f.lands(['Mountain'], f.b);
    respondOnce(f, force, alt => alt.oracleAlternativeCost);
    const bolt = f.put('Lightning Bolt', 'hand', f.b);
    assert.equal(await f.g.castSpell(f.b, bolt), true);
    assert.equal(f.responses.length, 1);
    assert.equal(force.zone, 'graveyard'); assert.equal(pitch.zone, 'exile');
    assert.equal(force.castMeta.manaSpent, 0);
    assert.equal(bolt.zone, name === 'Force of Negation' ? 'exile' : 'graveyard');
    assert.equal(f.a.life, name === 'Force of Will' ? 39 : 40);
    assertGameStateInvariants(f.g);
  });
}

test('Force of Negation forbids its alternative on the owner turn even with a pitch card', () => {
  const f = table(), force = f.put('Force of Negation', 'hand');
  f.put('Brainstorm', 'hand');
  assert.equal(force.def.altCosts[0].cond(f.g, f.a, force), false);
  assert.equal(f.g.castableList(f.a).some(row => row.card === force), false);
});

test('Subtlety Evoke pays its pitch, moves the actual creature spell to its library and sacrifices itself', async () => {
  const f = table(), subtlety = f.put('Subtlety', 'hand'), pitch = f.put('Brainstorm', 'hand');
  f.g.turnPlayer = f.b; f.lands(['Forest', 'Forest'], f.b);
  const bear = f.put('Grizzly Bears', 'hand', f.b);
  respondOnce(f, subtlety, alt => alt.evoke);
  f.targets = (p, q) => q.candidates.find(row => row.card === bear) ? [q.candidates.find(row => row.card === bear)] : undefined;
  f.option = (p, q) => q.options.find(row => row.key === 'bottom')?.key;
  assert.equal(await f.g.castSpell(f.b, bear), true);
  assert.equal(f.responses.length, 1); assert.equal(pitch.zone, 'exile');
  assert.equal(subtlety.zone, 'graveyard', 'real Evoke sacrifice trigger resolves');
  assert.equal(bear.zone, 'library'); assert.equal(f.b.library[0], bear);
  assert.equal(subtlety.castMeta.manaSpent, 0);
  assertGameStateInvariants(f.g);
});

test('Commandeer pitches two real blue cards and changes control of an actual permanent spell', async () => {
  const f = table(), command = f.put('Commandeer', 'hand');
  const pitches = [f.put('Brainstorm', 'hand'), f.put('Ponder', 'hand')];
  f.g.turnPlayer = f.b; f.lands(['Swamp', 'Swamp', 'Swamp'], f.b);
  respondOnce(f, command, alt => alt.oracleAlternativeCost);
  const arena = f.put('Phyrexian Arena', 'hand', f.b);
  assert.equal(await f.g.castSpell(f.b, arena), true);
  assert.equal(f.responses.length, 1); assert.equal(arena.zone, 'battlefield');
  assert.equal(arena.ctrl, f.a); assert.equal(arena.owner, f.b);
  assert.deepEqual(pitches.map(c => c.zone), ['exile', 'exile']);
  assert.equal(command.castMeta.manaSpent, 0);
  assertGameStateInvariants(f.g);
});

test('Snapcaster grants an actual Sorcery flashback without granting Instant timing', async () => {
  const f = table(), ponder = f.put('Ponder', 'graveyard'), mage = f.put('Snapcaster Mage', 'hand');
  f.g.turnPlayer = f.b; f.lands(['Island', 'Island']);
  f.targets = (p, q) => q.candidates.includes(ponder) ? [ponder] : undefined;
  await castOffered(f, offer(f, mage));
  assert.equal(mage.zone, 'battlefield'); assert.equal(ponder.meta.flashbackUntil, f.g.turnNo);
  f.lands(['Island']);
  assert.equal(f.g.castableList(f.a).some(row => row.card === ponder), false);
  f.g.turnPlayer = f.a;
  await castOffered(f, offer(f, ponder, alt => alt.flashback));
  assert.equal(ponder.zone, 'exile'); assert.equal(ponder.castMeta.manaSpent, 1);
});

test("Bolas's Citadel offers the native MDFC spell face and pays its printed life value", async () => {
  const f = table(); f.put("Bolas's Citadel");
  const awakening = f.put("Agadeem's Awakening // Agadeem, the Undercrypt", 'library');
  await castOffered(f, offer(f, awakening, alt => alt.starterPermission === 'citadel-v78'));
  assert.equal(awakening.zone, 'graveyard'); assert.equal(awakening.castMeta.x, 0);
  assert.equal(awakening.castMeta.alt.oracleFace, 'front');
  assert.equal(awakening.castMeta.manaSpent, 0); assert.equal(f.a.life, 37);
});

async function songcrafterGrant(f) {
  const divination = f.put('Divination', 'graveyard');
  const mage = f.put('Songcrafter Mage', 'hand');
  f.lands(['Forest', 'Island', 'Mountain']);
  f.targets = (p, q) => q.candidates.includes(divination) ? [divination] : undefined;
  await castOffered(f, offer(f, mage));
  assert.equal(mage.zone, 'battlefield');
  assert.equal(divination.meta.harmonizeGrantV89.version, divination.zoneVersion);
  assert.equal(divination.meta.harmonizeGrantV89.turn, f.g.turnNo);
  f.cards = (p, q) => q.aiHint?.kind === 'harmonize' ? [mage] : undefined;
  return { divination, mage };
}

test('native Songcrafter grant restores the printed definition after a paid Harmonize draw', async () => {
  const f = table(), { divination, mage } = await songcrafterGrant(f);
  const printed = divination.def, hand = f.a.hand.length;
  const [island] = f.lands(['Island']);
  await castOffered(f, offer(f, divination, alt => alt.harmonize));
  assert.equal(divination.zone, 'exile'); assert.equal(f.a.hand.length, hand + 2);
  assert.equal(island.tapped, true); assert.equal(mage.tapped, true);
  assert.equal(divination.castMeta.manaSpent, 1, 'Mage power pays only the two generic mana');
  assert.equal(divination.def, printed);
  assert.equal(divination.def.harmonize, undefined);
  assert.equal(M.DEFS.Divination.harmonize, undefined, 'temporary grant never mutates the catalog definition');
});

test('a failed native granted Harmonize payment restores its temporary definition without tapping its donor', async () => {
  const f = table(), { divination, mage } = await songcrafterGrant(f);
  const printed = divination.def, [island] = f.lands(['Island']);
  const row = offer(f, divination, alt => alt.harmonize);
  await f.g.move(island, 'graveyard');
  assert.equal(await f.g.castSpell(f.a, divination, { from: row.from, alt: row.alt }), false);
  assert.equal(divination.zone, 'graveyard'); assert.equal(mage.tapped, false);
  assert.equal(divination.def, printed); assert.equal(divination.def.harmonize, undefined);
  assert.equal(f.g.stack.length, 0);
  assertGameStateInvariants(f.g);
});

test('a native paid Prototype retains its chosen body and ETB amount until an actual blink', async () => {
  const f = table(), golem = f.put('Boulderbranch Golem', 'hand');
  const printed = golem.def, life = f.a.life;
  const lands = f.lands(['Forest', 'Forest', 'Forest', 'Forest']);
  await castOffered(f, offer(f, golem, alt => alt.oraclePrototypeV10));
  f.g.recalc();
  assert.equal(golem.zone, 'battlefield'); assert.equal(golem.power, 3); assert.equal(golem.toughness, 3);
  assert.equal(golem.mv, 4); assert.deepEqual(Array.from(golem.colors), ['G']);
  assert.equal(golem.castMeta.manaSpent, 4); assert.equal(f.a.life, life + 3);
  assert.equal(lands.every(c => c.tapped), true);
  assert.notEqual(golem.def, printed);
  await f.g.move(golem, 'exile');
  await f.g.putPermanentOntoBattlefield(golem, f.a);
  await f.g.priorityRound(f.a);
  f.g.recalc();
  assert.equal(golem.def, printed); assert.equal(golem.power, 6); assert.equal(golem.toughness, 5);
  assert.equal(golem.mv, 7); assert.deepEqual(Array.from(golem.colors), []);
  assert.equal(f.a.life, life + 9, 'blink uses the full printed six-power ETB');
  assertGameStateInvariants(f.g);
});

test('native Prototype with insufficient actual mana leaves the printed card and every land unchanged', async () => {
  const f = table(), golem = f.put('Boulderbranch Golem', 'hand');
  const printed = golem.def, lands = f.lands(['Forest', 'Forest', 'Forest']);
  assert.equal(f.g.castableList(f.a).some(row => row.card === golem), false);
  assert.equal(await f.g.castSpell(f.a, golem, { from: 'hand', alt: { oraclePrototypeV10: true } }), false);
  assert.equal(golem.zone, 'hand'); assert.equal(golem.def, printed);
  assert.equal(lands.every(c => !c.tapped), true); assert.equal(f.g.stack.length, 0);
  assertGameStateInvariants(f.g);
});
