// Regresije za deck-by-deck audit šest dekova (2026-08-20): Squirreled Away,
// Animated Army, Family Matters, Endless Punishment, Quick Draw, Abzan Armor.
// Pokriva potvrđene nalaze: Academy Manufactor token kopije, Windgrace
// distinctCtrl, Scurry myriad na planeswalkera, Odd Acorn Gang per-player draw,
// Frugivore izbor karata, Plumb kopije, Squirrel Nest kontrolor, crew tip,
// Sunbird cast iz biblioteke, Grothama kontrolor/šteta, Esika obavezna meta,
// Loamspeaker counteri, Domri rider, hideaway land drop, loyalty ponuda,
// battlefield-exit log linije.
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

function rulesGame(deciders = [], count = 4) {
  const game = new MTG.Game({ seed: 20260820, paced: false, maxTurns: 60 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Hero',
    { name: index ? `Opp ${index}` : 'Hero deck' },
    { decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 11;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players };
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = opts.sick ?? false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function synthetic(name, { types = ['Creature'], subtypes = [], cost = '{2}', oracle = '', power = 2, toughness = 2, kws = [], sup = [] } = {}) {
  return {
    name, super: sup, types, subtypes, cost, oracle,
    power: String(power), toughness: String(toughness), kws, abilities: [], mana: null,
  };
}

function addSynthetic(game, owner, def, zone = 'battlefield') {
  const card = new MTG.CardInst(def, owner);
  card.ctrl = owner;
  card.zone = zone;
  card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else owner[zone].push(card);
  game.recalc();
  return card;
}

function inHand(player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = 'hand';
  player.hand.push(card);
  return card;
}

function inLibrary(player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = 'library';
  player.library.push(card);
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 200) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 200, 'stack/trigger petlja se nije ispraznila');
}

// ==================== SQUIRRELED AWAY ====================

test('Academy Manufactor pretvara i token KOPIJE Clue/Food/Treasure u sva tri tokena', async () => {
  const { game, players: [me] } = rulesGame();
  permanent(game, me, 'Academy Manufactor');
  const [food] = await game.makeTokens('food', me);
  assert.ok(food, 'osnovni Food nije napravljen');
  const before = game.bf().filter(c => c.ctrl === me && c.isToken).length;
  await game.copyPermanentToken(food, me, { n: 1 });
  const tokens = game.bf().filter(c => c.ctrl === me && c.isToken);
  assert.equal(tokens.length - before, 3, 'kopija Fooda mora dati Clue+Food+Treasure');
  for (const sub of ['Clue', 'Food', 'Treasure']) {
    assert.ok(tokens.some(c => c.hasSub(sub)), `nedostaje ${sub} token`);
  }
});

test("Windgrace's Judgment: mete moraju biti kod različitih protivnika (engine + UI spec)", async () => {
  let offered = null;
  const picks = [];
  const { game, players: [me, oppA, oppB] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseTargets') { offered = q; return picks.slice(); }
      return defaultDecision(g, q);
    },
  ]);
  const a1 = addSynthetic(game, oppA, synthetic('Bear A1'));
  const a2 = addSynthetic(game, oppA, synthetic('Bear A2'));
  const b1 = addSynthetic(game, oppB, synthetic('Bear B1'));
  const spell = inHand(me, "Windgrace's Judgment");
  me.pool.B = 3; me.pool.G = 3;

  // ilegalan izbor: dvije mete istog protivnika → cast pada
  picks.push(a1, a2, b1);
  const bad = await game.castSpell(me, spell, { from: 'hand' });
  assert.equal(bad, false, 'same-controller izbor mora biti odbijen');
  assert.ok(offered.spec.distinctCtrl, 'spec mora nositi distinctCtrl za UI');

  // legalan izbor: po jedna meta po protivniku → obje uništene
  picks.length = 0; picks.push(a1, b1);
  me.pool.B = 3; me.pool.G = 3;
  const ok = await game.castSpell(me, spell, { from: 'hand' });
  assert.equal(ok, true, 'legalan cast je odbijen');
  await resolveAll(game);
  assert.equal(a1.zone, 'graveyard');
  assert.equal(b1.zone, 'graveyard');
  assert.equal(a2.zone, 'battlefield', 'druga meta istog protivnika ne smije stradati');
});

test('Scurry of Squirrels myriad okida i kad napada planeswalkera', async () => {
  const { game, players: [me, oppA] } = rulesGame();
  const scurry = permanent(game, me, 'Scurry of Squirrels');
  const pw = addSynthetic(game, oppA, synthetic('Test Walker', { types: ['Planeswalker'], power: 0, toughness: 0 }));
  game.combat = { attackers: [scurry], blockers: new Map() };
  scurry.attacking = pw;
  await game.emit('attacks', { card: scurry });
  await resolveAll(game);
  const copies = game.bf().filter(c => c.isToken && c.name === scurry.name);
  assert.equal(copies.length, 4, 'myriad ×2 prema 2 preostala protivnika = 4 kopije');
  assert.ok(copies.every(c => c.meta.exileEndCombat), 'kopije se egzilaju na kraju combata');
});

test('The Odd Acorn Gang vuče po jednom za svakog igrača kojeg vjeverice udare', async () => {
  const { game, players: [me, oppA, oppB] } = rulesGame();
  permanent(game, me, 'The Odd Acorn Gang');
  const [sq] = await game.makeTokens('squirrel', me, { noReplace: true });
  game.recalc();
  for (let i = 0; i < 6; i++) inLibrary(me, 'Forest');
  const h0 = me.hand.length;
  await game.emit('combatDamageGroupToPlayer', { player: oppA, hits: [{ card: sq, n: 1 }], cards: [sq], step: 'normal' });
  await resolveAll(game);
  assert.equal(me.hand.length - h0, 1, 'prvi pogođeni igrač → 1 karta');
  await game.emit('combatDamageGroupToPlayer', { player: oppB, hits: [{ card: sq, n: 1 }], cards: [sq], step: 'normal' });
  await resolveAll(game);
  assert.equal(me.hand.length - h0, 2, 'drugi pogođeni igrač u istom potezu → još 1 karta');
});

test('Insatiable Frugivore: igrač bira KOJE tri karte egzila iz groblja', async () => {
  let exilePick = null;
  const { game, players: [me] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseOption' && /Exile 3/.test(q.prompt || '')) return exilePick ? 'yes' : 'no';
      if (q.type === 'chooseCards' && q.aiHint && q.aiHint.kind === 'exileFromGy') return exilePick.slice();
      return defaultDecision(g, q);
    },
  ]);
  for (const name of ['Forest', 'Swamp', 'Forest', 'Swamp', 'Forest']) {
    const c = new MTG.CardInst(MTG.DEFS[name], me);
    c.zone = 'graveyard';
    me.graveyard.push(c);
  }
  exilePick = [me.graveyard[0], me.graveyard[2], me.graveyard[4]];
  const expectSurvive = [me.graveyard[1], me.graveyard[3]];
  const frug = new MTG.CardInst(MTG.DEFS['Insatiable Frugivore'], me);
  frug.zone = 'nowhere';
  const picked = exilePick.slice();
  exilePick = picked; // prvi 'yes', pa nakon egzila 'no' jer groblje < 3
  await game.move(frug, 'battlefield', { ctrl: me });
  await resolveAll(game);
  for (const c of picked) assert.equal(c.zone, 'exile', `${c.name} je morao u egzil`);
  for (const c of expectSurvive) assert.equal(c.zone, 'graveyard', `${c.name} je morao ostati u groblju`);
});

test('Plumb the Forbidden se kopira po žrtvovanom stvorenju (2 žrtve → 3 rezolucije)', async () => {
  const sacrifices = [];
  const { game, players: [me] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseCards' && sacrifices.length) return sacrifices.splice(0);
      return defaultDecision(g, q);
    },
  ]);
  const c1 = addSynthetic(game, me, synthetic('Sac One'));
  const c2 = addSynthetic(game, me, synthetic('Sac Two'));
  sacrifices.push(c1, c2);
  for (let i = 0; i < 8; i++) inLibrary(me, 'Swamp');
  const spell = inHand(me, 'Plumb the Forbidden');
  me.pool.B = 2; me.pool.C = 2;
  const h0 = me.hand.length - 1;
  const l0 = me.life;
  const ok = await game.castSpell(me, spell, { from: 'hand' });
  assert.equal(ok, true, 'cast nije prošao');
  await resolveAll(game);
  assert.equal(me.hand.length - h0, 3, 'original + 2 kopije = 3 karte');
  assert.equal(l0 - me.life, 3, 'original + 2 kopije = 3 života');
});

test('Squirrel Nest daje sposobnost kontroloru enchantovanog landa, ne kontroloru Aure', async () => {
  const { game, players: [me, opp] } = rulesGame();
  const land = permanent(game, opp, 'Forest');
  const nest = permanent(game, me, 'Squirrel Nest');
  nest.attachedTo = land.iid;
  land.attachments.push(nest.iid);
  game.recalc();
  const oppActs = game.activatableList(opp).filter(e => e.ability && /Squirrel/.test(e.ability.label || ''));
  const myActs = game.activatableList(me).filter(e => e.ability && /Squirrel/.test(e.ability.label || ''));
  assert.equal(oppActs.length, 1, 'kontrolor landa mora imati sposobnost');
  assert.equal(myActs.length, 0, 'kontrolor Aure je NE smije imati');
  await game.activateAbility(opp, oppActs[0], []);
  await resolveAll(game);
  const squirrels = game.bf().filter(c => c.isToken && c.hasSub('Squirrel'));
  assert.equal(squirrels.length, 1);
  assert.equal(squirrels[0].ctrl, opp, 'token pripada kontroloru landa');
});

test('odlazak sa bojnog polja se loguje (dies / exiled)', async () => {
  const { game, players: [me] } = rulesGame();
  const bear = addSynthetic(game, me, synthetic('Log Bear'));
  await game.destroy(bear);
  assert.ok(game.log.some(entry => entry.msg === 'Log Bear dies.'), 'destroy mora ostaviti "dies." log');
  const relic = addSynthetic(game, me, synthetic('Log Relic', { types: ['Artifact'], power: 0, toughness: 0 }));
  await game.move(relic, 'exile');
  assert.ok(game.log.some(entry => entry.msg === 'Log Relic is exiled.'), 'exile mora ostaviti log liniju');
});

// ==================== ANIMATED ARMY ====================

test('crew pretvara Vehicle u creature do kraja poteza', async () => {
  const { game, players: [me] } = rulesGame();
  const chariot = permanent(game, me, "Esika's Chariot");
  assert.ok(!chariot.is('Creature'), 'Vehicle nije creature prije crewa');
  const crew1 = addSynthetic(game, me, synthetic('Crew Cat A', { power: 2, toughness: 2 }));
  const crew2 = addSynthetic(game, me, synthetic('Crew Cat B', { power: 2, toughness: 2 }));
  const entry = game.activatableList(me).find(e => e.card === chariot && e.crew);
  assert.ok(entry, 'crew akcija mora biti ponuđena');
  const deciders = me.controller.decide;
  me.controller.decide = async (g, q) => q.type === 'chooseCards' ? [crew1, crew2] : defaultDecision(g, q);
  const ok = await game.activateAbility(me, entry, []);
  me.controller.decide = deciders;
  assert.equal(ok, true, 'crew aktivacija nije prošla');
  assert.ok(chariot.is('Creature'), 'crewovan Vehicle mora biti creature');
  assert.equal(chariot.power, 4, 'printana snaga 4/4');
  game.turnNo += 1;
  game.recalc();
  assert.ok(!chariot.is('Creature'), 'crew ističe krajem poteza');
});

test("Sunbird's Invocation: besplatni cast ide iz biblioteke i ne re-okida cast-from-hand triggere", async () => {
  const { game, players: [me] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseCards' && (q.prompt || '').startsWith('Cast for free')) return q.from.slice(0, 1);
      return defaultDecision(g, q);
    },
  ]);
  permanent(game, me, "Sunbird's Invocation");
  for (let i = 0; i < 4; i++) inLibrary(me, 'Forest');
  inLibrary(me, 'Rampant Growth'); // vrh biblioteke — MV2, castable besplatno
  const spell = inHand(me, 'Explore'); // MV3 iz ruke
  me.pool.G = 3; me.pool.C = 3;
  const ok = await game.castSpell(me, spell, { from: 'hand' });
  assert.equal(ok, true);
  await resolveAll(game);
  const fires = game.log.filter(entry => entry.msg.startsWith("Sunbird's: revealed")).length;
  assert.equal(fires, 1, 'Sunbird smije okinuti samo za cast iz ruke');
});

test('Grothama: fight odluku donosi kontrolor napadača; LTB draw broji štetu ovog poteza', async () => {
  const asked = [];
  const { game, players: [me, opp] } = rulesGame([
    (g, q) => { if (q.aiHint && q.aiHint.kind === 'optTrigger') asked.push('me'); return defaultDecision(g, q); },
    (g, q) => { if (q.aiHint && q.aiHint.kind === 'optTrigger') { asked.push('opp'); return 'yes'; } return defaultDecision(g, q); },
  ]);
  const gro = permanent(game, me, 'Grothama, All-Devouring');
  const atk = addSynthetic(game, opp, synthetic('Tough Attacker', { power: 3, toughness: 11 }));
  for (let i = 0; i < 6; i++) inLibrary(opp, 'Forest');
  await game.emit('attacks', { card: atk });
  await resolveAll(game);
  assert.deepEqual(asked, ['opp'], 'opt prompt mora ići kontroloru napadača');
  assert.equal(atk.damage, 10, 'Grothama uzvraća 10');
  const h0 = opp.hand.length;
  await game.move(gro, 'graveyard');
  await resolveAll(game);
  assert.equal(opp.hand.length - h0, 3, 'kontrolor napadača vuče = šteta Grothami ovog poteza');
});

test('Grothama LTB ne broji štetu iz ranijih poteza', async () => {
  const { game, players: [me, opp] } = rulesGame();
  const gro = permanent(game, me, 'Grothama, All-Devouring');
  const atk = addSynthetic(game, opp, synthetic('Old Attacker', { power: 4, toughness: 12 }));
  for (let i = 0; i < 6; i++) inLibrary(opp, 'Forest');
  await game.damageCreature(atk, gro, 4);
  game.turnNo += 1; // novi potez — stara šteta ne vrijedi
  const h0 = opp.hand.length;
  await game.move(gro, 'graveyard');
  await resolveAll(game);
  assert.equal(opp.hand.length - h0, 0, 'šteta iz prošlog poteza ne smije dati karte');
});

test("Esika's Chariot attack trigger je obavezan kad token postoji", async () => {
  let sawMin = null;
  const { game, players: [me] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseTargets') { sawMin = q.min; return q.candidates.slice(0, Math.max(1, q.min)); }
      return defaultDecision(g, q);
    },
  ]);
  const chariot = permanent(game, me, "Esika's Chariot");
  const [cat] = await game.makeTokens('cat22', me);
  game.recalc();
  game.combat = { attackers: [chariot], blockers: new Map() };
  await game.emit('attacks', { card: chariot });
  await resolveAll(game);
  assert.equal(sawMin, 1, 'meta je obavezna (nije upTo)');
  const cats = game.bf().filter(c => c.isToken && c.name === cat.name);
  assert.equal(cats.length, 2, 'kopija tokena mora nastati');
});

test('Llanowar Loamspeaker animacija čuva +1/+1 countere na landu', async () => {
  const { game, players: [me] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' ? q.candidates.slice(0, 1) : defaultDecision(g, q),
  ]);
  permanent(game, me, 'Llanowar Loamspeaker');
  const land = permanent(game, me, 'Forest');
  game.addCounters(land, '+1/+1', 1);
  const entry = game.activatableList(me).find(e => e.ability && /3\/3/.test(e.ability.label || ''));
  assert.ok(entry, 'animacija mora biti ponuđena');
  await game.activateAbility(me, entry, [land]);
  await resolveAll(game);
  game.recalc();
  assert.equal(land.power, 4, '3/3 + counter = 4/4');
  assert.equal(land.toughness, 4);
});

test("Domri +1 čini creature spellove neprotivnim counterima ovaj potez", async () => {
  const { game, players: [me] } = rulesGame();
  const domri = permanent(game, me, 'Domri, Anarch of Bolas');
  domri.counters.loyalty = 3;
  game.recalc();
  const entry = game.activatableList(me).find(e => e.card === domri && e.ability && e.ability.loyalty === 1);
  assert.ok(entry, 'Domri +1 mora biti ponuđen');
  await game.activateAbility(me, entry, []);
  await resolveAll(game);
  const bear = new MTG.CardInst(synthetic('Counter Test Bear'), me);
  bear.zone = 'hand';
  me.hand.push(bear);
  const so = { kind: 'spell', card: bear, ctrl: me };
  assert.equal(MTG.isUncounterable(game, so), true, 'creature spell mora biti uncounterable');
  me.turnState = me.freshTurnState();
  assert.equal(MTG.isUncounterable(game, so), false, 'rider ističe s potezom');
});

test('iskorišteni planeswalker se ne nudi ponovo u istom potezu', async () => {
  const { game, players: [me] } = rulesGame();
  const domri = permanent(game, me, 'Domri, Anarch of Bolas');
  domri.counters.loyalty = 3;
  game.recalc();
  const entry = game.activatableList(me).find(e => e.card === domri && e.ability && e.ability.loyalty === 1);
  await game.activateAbility(me, entry, []);
  await resolveAll(game);
  const again = game.activatableList(me).filter(e => e.card === domri && e.ability && e.ability.loyalty !== undefined);
  assert.equal(again.length, 0, 'loyalty je potrošen — bez novih ponuda ovaj potez');
  game.turnNo += 1;
  const nextTurn = game.activatableList(me).filter(e => e.card === domri && e.ability && e.ability.loyalty !== undefined);
  assert.ok(nextTurn.length > 0, 'sljedeći potez se opet nudi');
});

test('hideaway "play" za land troši land drop i bez dropa nije dostupan', async () => {
  const { game, players: [me] } = rulesGame();
  const bridge = permanent(game, me, 'Mosswort Bridge');
  const hidden = new MTG.CardInst(MTG.DEFS['Forest'], me);
  hidden.zone = 'exile';
  me.exile.push(hidden);
  bridge.meta.hideIid = hidden.iid;
  // uslov Mosswort Bridge: ukupna snaga ≥ 10
  addSynthetic(game, me, synthetic('Big One', { power: 10, toughness: 10 }));
  me.pool.G = 2;
  me.landsPlayed = me.maxLands; // drop potrošen
  let entry = game.activatableList(me).find(e => e.card === bridge && e.ability);
  assert.ok(!entry, 'bez slobodnog land dropa sposobnost ne smije biti ponuđena');
  me.landsPlayed = 0;
  entry = game.activatableList(me).find(e => e.card === bridge && e.ability);
  assert.ok(entry, 'sa slobodnim dropom se nudi');
  await game.activateAbility(me, entry, []);
  await resolveAll(game);
  assert.equal(hidden.zone, 'battlefield', 'sakriveni land je odigran');
  assert.equal(me.landsPlayed, 1, 'land drop je potrošen');
});

// ==================== FAMILY MATTERS ====================

test('Combat Celebrant se može exertovati ponovo u kasnijem potezu', async () => {
  const { game, players: [me] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'optTrigger' ? 'yes' : defaultDecision(g, q),
  ]);
  const celebrant = permanent(game, me, 'Combat Celebrant');

  await game.emit('attacks', { card: celebrant });
  await resolveAll(game);
  assert.equal(game._extraCombats, 1, 'prvi exert mora dati extra combat');

  game.turnNo += 1;
  celebrant.tapped = false;
  await game.emit('attacks', { card: celebrant });
  await resolveAll(game);
  assert.equal(game._extraCombats, 2, 'exert se smije ponoviti u novom potezu');
});

test('Rapid Augmenter okida za creature koji nije bačen, ne samo za token', async () => {
  const { game, players: [me] } = rulesGame();
  const augmenter = permanent(game, me, 'Rapid Augmenter');
  const blinked = addSynthetic(game, me, synthetic('Blinked Bear'), 'graveyard');

  await game.move(blinked, 'battlefield', { ctrl: me });
  await resolveAll(game);
  assert.equal(augmenter.counters['+1/+1'], 1, 'reanimirani creature mora dati +1/+1 counter');
  game.recalc();
  assert.equal(augmenter.cur.unblockable, true, 'Augmenter mora biti unblockable do kraja poteza');
});

test('Aetherize je legalan ako postoji bilo koji napadač, i kad ne napada kastera', () => {
  const { game, players: [me, oppA, oppB] } = rulesGame();
  const attacker = addSynthetic(game, oppA, synthetic('Political Attacker'));
  attacker.attacking = oppB;
  game.combat = { attackers: [attacker], blockers: new Map() };
  assert.equal(MTG.SCRIPTS['Aetherize'].castCond, undefined,
    'Aetherize je instant bez dodatnog cast uslova, čak i bez napadača');
});

test('Arthur stavlja svih šest karata na dno i kad ne nađe creature', async () => {
  const { game, players: [me, opp] } = rulesGame();
  const sentinel = addSynthetic(game, me, synthetic('Library Sentinel', { types: ['Artifact'], power: 0, toughness: 0 }), 'library');
  const looked = [];
  for (let i = 0; i < 6; i++) looked.push(addSynthetic(
    game, me, synthetic(`Arthur Noncreature ${i}`, { types: ['Artifact'], power: 0, toughness: 0 }), 'library',
  ));
  const arthur = permanent(game, me, 'Arthur, Marigold Knight');
  const helper = addSynthetic(game, me, synthetic('Arthur Helper'));
  arthur.attacking = opp;
  helper.attacking = opp;
  game.combat = { attackers: [arthur, helper], blockers: new Map() };

  await game.emit('attacks', { card: arthur });
  await resolveAll(game);
  assert.ok(looked.every(c => me.library.indexOf(c) < me.library.indexOf(sentinel)),
    'pregledanih šest mora završiti ispod stare biblioteke');
});

test('Echoing Assault pravi po jednu kopiju za svakog napadnutog igrača', async () => {
  const { game, players: [me, oppA, oppB] } = rulesGame([
    (g, q) => q.type === 'chooseCards' && q.aiHint?.kind === 'echoingAssault'
      ? q.from.slice(0, 1) : defaultDecision(g, q),
  ]);
  permanent(game, me, 'Echoing Assault');
  const first = addSynthetic(game, me, synthetic('First Attacker'));
  const second = addSynthetic(game, me, synthetic('Second Attacker'));
  first.attacking = oppA;
  second.attacking = oppB;
  game.combat = { attackers: [first, second], blockers: new Map() };

  await game.emit('attackersDeclared', { player: me, attackers: [first, second] });
  await resolveAll(game);
  const copies = game.bf().filter(c => c.isToken && ['First Attacker', 'Second Attacker'].includes(c.name));
  assert.equal(copies.length, 2, 'dva napadnuta igrača moraju dati dva odvojena izbora/kopije');
  assert.deepEqual(new Set(copies.map(c => c.attacking)), new Set([oppA, oppB]));
});

// ==================== QUICK DRAW ====================

test('Stella Lee može kopirati samo svoj instant/sorcery spell', () => {
  const { game, players: [me, opp] } = rulesGame();
  const stella = permanent(game, me, 'Stella Lee, Wild Card');
  const mine = { kind: 'spell', ctrl: me, card: new MTG.CardInst(MTG.DEFS['Think Twice'], me) };
  const theirs = { kind: 'spell', ctrl: opp, card: new MTG.CardInst(MTG.DEFS['Think Twice'], opp) };
  mine.card.zone = 'stack';
  theirs.card.zone = 'stack';
  game.stack.push(mine, theirs);
  const spec = stella.def.abilities[0].targets[0];
  assert.equal(spec.filter(game, mine, me, stella), true);
  assert.equal(spec.filter(game, theirs, me, stella), false, 'protivnički spell ne smije biti legalna meta');
});

test('Crackling Spellslinger daje storm samo ako je bačen', async () => {
  const { game, players: [me] } = rulesGame();
  const reanimated = addSynthetic(game, me, MTG.DEFS['Crackling Spellslinger'], 'graveyard');
  await game.move(reanimated, 'battlefield', { ctrl: me });
  await resolveAll(game);
  assert.notEqual(me.stormNext, true, 'reanimacija/blink ne smije dati storm');

  const castCopy = new MTG.CardInst(MTG.DEFS['Crackling Spellslinger'], me);
  castCopy.zone = 'stack';
  await game.move(castCopy, 'battlefield', { ctrl: me });
  await resolveAll(game);
  assert.equal(me.stormNext, true, 'stvarno bačen Spellslinger mora dati storm');
});

test('Curse of the Swine bira najviše tačno X meta i prihvata jednu metu kao scalar', async () => {
  const { game, players: [me, opp] } = rulesGame();
  const spell = new MTG.CardInst(MTG.DEFS['Curse of the Swine'], me);
  const [spec] = spell.def.targets(game, spell, { xVal: 2 });
  assert.equal(spec.count, 2);
  assert.equal(spec.upTo, true);
  const victim = permanent(game, opp, 'Graf Mole');
  await spell.def.resolve({ g: game, you: me, targets: [victim], x: 1 });
  assert.equal(victim.zone, 'exile');
});

test('Epic Experiment baca odabrani spell iz egzila, ne iz ruke', async () => {
  let castFrom = null;
  const { game, players: [me] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'freeCast' ? 'yes' : defaultDecision(g, q),
  ]);
  inLibrary(me, 'Think Twice');
  const originalCast = game.castSpell.bind(game);
  game.castSpell = async (player, card, opts) => {
    castFrom = opts.from;
    return originalCast(player, card, opts);
  };
  await MTG.SCRIPTS['Epic Experiment'].resolve({ g: game, you: me, src: null, x: 2 });
  assert.equal(castFrom, 'exile', 'besplatni cast mora zadržati stvarnu zonu porijekla');
});

test('Ponder dozvoljava redoslijed vrha prije izvlačenja', async () => {
  const { game, players: [me] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseCards' && q.aiHint?.kind === 'ponderOrder') {
        return [q.from[1], q.from[0], q.from[2]];
      }
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'ponder') return 'keep';
      return defaultDecision(g, q);
    },
  ]);
  const bottom = addSynthetic(game, me, synthetic('Ponder Bottom', { types: ['Instant'] }), 'library');
  const middle = addSynthetic(game, me, synthetic('Ponder Middle', { types: ['Instant'] }), 'library');
  const top = addSynthetic(game, me, synthetic('Ponder Top', { types: ['Instant'] }), 'library');
  await MTG.SCRIPTS.Ponder.resolve({ g: game, you: me, src: null });
  assert.equal(me.hand[0], middle, 'izabrana prva karta mora biti izvučena');
  assert.ok(me.library.includes(bottom) && me.library.includes(top));
});

test('"do kraja tvog sljedećeg poteza" koristi igračev sljedeći potez u multiplayeru', () => {
  const { game, players: [me] } = rulesGame();
  me.turnsStarted = 4;
  const top = inLibrary(me, 'Think Twice');
  MTG.E.exileTopPlayable(game, me, null, 1, 'next');
  assert.equal(top.meta.playableUntilOwnTurn, 5);
  assert.equal(top.meta.playableUntil, undefined, 'ne smije isteći nakon samo jednog globalnog turna');
});

// ==================== ENDLESS PUNISHMENT ====================

test('tapped Barbflare Gremlin duplira manu tipa koji je land proizveo', async () => {
  const { game, players: [me] } = rulesGame();
  const gremlin = permanent(game, me, 'Barbflare Gremlin');
  gremlin.tapped = true;
  const mountain = permanent(game, me, 'Mountain');
  await game.activateManaSource(me, {
    card: mountain, m: mountain.def.mana, extraCost: { tap: true },
  }, { R: 1 }, null, []);
  assert.equal(me.pool.R, 2, 'Mountain mora proizvesti ukupno dvije crvene mane');
  assert.equal(me.life, 39, 'land nanosi 1 štetu svom kontroloru');
});

test('Syr Konrad okida kada creature card napusti groblje', async () => {
  const { game, players: [me, oppA, oppB] } = rulesGame();
  permanent(game, me, 'Syr Konrad, the Grim');
  const creature = addSynthetic(game, me, synthetic('Escaping Corpse'), 'graveyard');
  const before = [oppA.life, oppB.life];
  await game.move(creature, 'exile');
  await resolveAll(game);
  assert.deepEqual([oppA.life, oppB.life], before.map(n => n - 1));
});

test('Star Athlete može izabrati i nonland permanent svog kontrolora', () => {
  const { game, players: [me] } = rulesGame();
  const athlete = permanent(game, me, 'Star Athlete');
  const own = addSynthetic(game, me, synthetic('Own Relic', { types: ['Artifact'], power: 0, toughness: 0 }));
  const spec = athlete.def.triggers[0].targets[0];
  assert.equal(spec.filter(game, own, me, athlete), true);
});

test('Suspended Sentence uzima 3 života i kad indestructible creature preživi', async () => {
  const { game, players: [me, opp] } = rulesGame();
  const spell = new MTG.CardInst(MTG.DEFS['Suspended Sentence'], me);
  spell.zone = 'stack';
  const target = addSynthetic(game, opp, synthetic('Indestructible Target', { kws: ['indestructible'] }));
  const life = opp.life;
  await spell.def.resolve({ g: game, you: me, src: spell, targets: [target], so: { isCopy: true } });
  assert.equal(target.zone, 'battlefield');
  assert.equal(opp.life, life - 3, 'gubitak života nije uslovljen uništenjem');
});

test('Sadistic Shell Game svakom igraču nudi creature koji ON ne kontroliše', async () => {
  let oppAPool = null;
  const { game, players: [me, oppA, oppB] } = rulesGame([
    (g, q) => q.type === 'chooseCards' && q.aiHint?.kind === 'shellGame' ? [] : defaultDecision(g, q),
    (g, q) => {
      if (q.type === 'chooseCards' && q.aiHint?.kind === 'shellGame') { oppAPool = q.from.slice(); return []; }
      return defaultDecision(g, q);
    },
    (g, q) => q.type === 'chooseCards' && q.aiHint?.kind === 'shellGame' ? [] : defaultDecision(g, q),
  ], 3);
  const mine = addSynthetic(game, me, synthetic('Caster Creature'));
  const theirs = addSynthetic(game, oppA, synthetic('Chooser Creature'));
  addSynthetic(game, oppB, synthetic('Third Creature'));
  await MTG.SCRIPTS['Sadistic Shell Game'].resolve({ g: game, you: me, src: null });
  assert.ok(oppAPool.includes(mine), 'sljedeći protivnik mora moći izabrati kasterovo stvorenje');
  assert.ok(!oppAPool.includes(theirs), 'igrač ne smije birati creature koji sam kontroliše');
});

test('Fear of Burning Alive zaključava metu prije rezolucije delirium trigera', async () => {
  const { game, players: [me, opp] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' ? q.candidates.slice(0, 1) : defaultDecision(g, q),
  ]);
  const fear = permanent(game, me, 'Fear of Burning Alive');
  addSynthetic(game, me, synthetic('GY Creature', { types: ['Creature'] }), 'graveyard');
  addSynthetic(game, me, synthetic('GY Instant', { types: ['Instant'] }), 'graveyard');
  addSynthetic(game, me, synthetic('GY Sorcery', { types: ['Sorcery'] }), 'graveyard');
  addSynthetic(game, me, synthetic('GY Artifact', { types: ['Artifact'], power: 0, toughness: 0 }), 'graveyard');
  const oldTarget = addSynthetic(game, opp, synthetic('Old Delirium Target', { toughness: 5 }));
  await game.emit('damageToPlayer', { src: fear, player: opp, n: 3, combat: false });
  await game.flushTriggers();
  await game.move(oldTarget, 'graveyard');
  const newTarget = addSynthetic(game, opp, synthetic('New Delirium Target', { toughness: 5 }));
  await resolveAll(game);
  assert.equal(newTarget.damage, 0, 'nova meta ne smije biti izabrana tek na rezoluciji');
});

// ==================== ABZAN ARMOR ====================

test('Baldin cilja do 100 bilo kojih creatures, a pumpa samo izabrane', async () => {
  let chosen = null;
  const { game, players: [me, opp] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && chosen ? [chosen] : defaultDecision(g, q),
  ]);
  const baldin = permanent(game, me, 'Baldin, Century Herdmaster');
  const mine = addSynthetic(game, me, synthetic('Unchosen Defender', { toughness: 4, kws: ['defender'] }));
  const theirs = addSynthetic(game, opp, synthetic('Chosen Defender', { toughness: 4, kws: ['defender'] }));
  chosen = theirs;
  inHand(me, 'Forest');
  inHand(me, 'Plains');
  const myToughness = mine.toughness;
  const theirToughness = theirs.toughness;
  await game.emit('attacks', { card: baldin });
  await resolveAll(game);
  assert.equal(theirs.toughness, theirToughness + 2, 'protivnički target dobija +0/+X');
  assert.equal(mine.toughness, myToughness, 'neizabrani vlastiti creature ne dobija pump');
});

test('Protector of the Wastes može egzilati artifact/enchantment creatures različitih igrača', async () => {
  let offered = [];
  const { game, players: [me, oppA, oppB] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseTargets') { offered = q.candidates.slice(); return q.candidates.slice(0, 2); }
      return defaultDecision(g, q);
    },
  ]);
  const artifactCreature = addSynthetic(game, oppA, synthetic('Artifact Creature', { types: ['Artifact', 'Creature'] }));
  const enchantmentCreature = addSynthetic(game, oppB, synthetic('Enchantment Creature', { types: ['Enchantment', 'Creature'] }));
  const protector = new MTG.CardInst(MTG.DEFS['Protector of the Wastes'], me);
  protector.zone = 'nowhere';
  await game.move(protector, 'battlefield', { ctrl: me });
  await resolveAll(game);
  assert.ok(offered.includes(artifactCreature) && offered.includes(enchantmentCreature),
    'artifact/enchantment creatures moraju biti ponuđene kao mete');
  assert.equal(artifactCreature.zone, 'exile');
  assert.equal(enchantmentCreature.zone, 'exile');
});

test('Shadrix dva moda moraju ciljati dva različita igrača', async () => {
  const { game, players: [me, opp] } = rulesGame([
    (g, q) => {
      if (q.aiHint?.kind === 'optTrigger') return 'yes';
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'shadrix') return q.options[0].key;
      if (q.type === 'chooseTargets' && q.aiHint?.goal === 'shadrixTarget') {
        return q.candidates.includes(me) ? [me] : q.candidates.slice(0, 1);
      }
      return defaultDecision(g, q);
    },
  ], 2);
  permanent(game, me, 'Shadrix Silverquill');
  inLibrary(me, 'Forest');
  inLibrary(opp, 'Forest');
  await game.emit('beginCombat', { player: me });
  await resolveAll(game);
  assert.equal(game.bf().filter(c => c.isToken && c.hasSub('Inkling') && c.ctrl === me).length, 1);
  assert.equal(me.life, 40, 'drugi mod ne smije ponovo ciljati Heroja');
  assert.equal(opp.life, 39, 'drugi, različiti igrač mora izgubiti 1');
  assert.equal(opp.hand.length, 1);
});

test('Tree of Redemption exchange emituje stvarni lifegain i okida Wall of Limbs', async () => {
  const { game, players: [me] } = rulesGame();
  me.life = 5;
  const wall = permanent(game, me, 'Wall of Limbs');
  const tree = permanent(game, me, 'Tree of Redemption');
  const entry = game.activatableList(me).find(e => e.card === tree && e.ability);
  assert.ok(entry, 'Tree sposobnost mora biti dostupna');
  await game.activateAbility(me, entry, []);
  await resolveAll(game);
  assert.equal(me.life, 13);
  assert.equal(me.turnState.lifeGained, 8, 'exchange 5→13 mora biti lifegain 8');
  assert.equal(wall.counters['+1/+1'], 1, 'Wall of Limbs mora vidjeti lifeGain event');
  assert.equal(tree.toughness, 5);
});

test('Aether Channeler bira mod i zaključava bounce metu prije rezolucije', async () => {
  const { game, players: [me, opp] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'mode') return '1';
      if (q.type === 'chooseTargets') return q.candidates.slice(0, 1);
      return defaultDecision(g, q);
    },
  ]);
  const oldTarget = addSynthetic(game, opp, synthetic('Channeler Old Target', { types: ['Artifact'], power: 0, toughness: 0 }));
  const channeler = new MTG.CardInst(MTG.DEFS['Aether Channeler'], me);
  channeler.zone = 'nowhere';
  await game.move(channeler, 'battlefield', { ctrl: me });
  await game.flushTriggers();
  await game.move(oldTarget, 'graveyard');
  const newTarget = addSynthetic(game, opp, synthetic('Channeler New Target', { types: ['Artifact'], power: 0, toughness: 0 }));
  await resolveAll(game);
  assert.equal(newTarget.zone, 'battlefield', 'Channeler ne smije birati novu metu na rezoluciji');
});

test('Hanged Executioner egziluje sebe kao cijenu prije priorityja', async () => {
  const { game, players: [me, opp] } = rulesGame();
  const executioner = permanent(game, me, 'Hanged Executioner');
  const target = addSynthetic(game, opp, synthetic('Execution Target'));
  me.pool.W = 1; me.pool.C = 3;
  const entry = game.activatableList(me).find(e => e.card === executioner && e.ability);
  assert.ok(entry);
  await game.activateAbility(me, entry, [target]);
  assert.equal(executioner.zone, 'exile', 'izvor mora biti egziliran prije rezolucije sposobnosti');
  await game.move(target, 'hand');
  await resolveAll(game);
  assert.equal(executioner.zone, 'exile', 'fizzle mete ne vraća plaćenu cijenu');
});

test('Bloodthirsty Adversary egziluje izabrani original prije castanja kopije', async () => {
  const { game, players: [me] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'adversary') return 'yes';
      if (q.type === 'chooseCards' && /Copy up to/.test(q.prompt || '')) return q.from.slice(0, 1);
      return defaultDecision(g, q);
    },
  ]);
  const original = new MTG.CardInst(MTG.DEFS['Think Twice'], me);
  original.zone = 'graveyard'; me.graveyard.push(original);
  // The copied Think Twice draws a card; an empty library would eliminate the
  // hero (CR 800.4a then removes every card they own, including the exiled
  // original), so give the hero something to draw.
  const fuel = new MTG.CardInst(MTG.DEFS.Island, me);
  fuel.zone = 'library'; me.library.push(fuel);
  me.pool.R = 1; me.pool.C = 2;
  const adversary = new MTG.CardInst(MTG.DEFS['Bloodthirsty Adversary'], me);
  adversary.zone = 'nowhere';
  await game.move(adversary, 'battlefield', { ctrl: me });
  await resolveAll(game);
  assert.equal(original.zone, 'exile');
  assert.equal(adversary.counters['+1/+1'], 1);
});

test('Finale of Promise zaključava graveyard mete i za X≥10 kopira svaki spell dvaput', async () => {
  let resolutions = 0;
  const { game, players: [me] } = rulesGame();
  const instant = addSynthetic(game, me, Object.assign(synthetic('Finale Test Instant', {
    types: ['Instant'], cost: '{1}', power: 0, toughness: 0,
  }), { resolve: async () => { resolutions++; } }), 'graveyard');
  const finale = new MTG.CardInst(MTG.DEFS['Finale of Promise'], me);
  const specs = finale.def.targets(game, finale, { xVal: 10 });
  assert.equal(specs.length, 2);
  assert.equal(specs[0].zone, 'graveyard');
  assert.equal(specs[0].filter(game, instant, me, finale), true);

  game._prioritySessionActive = true;
  await finale.def.resolve({ g: game, you: me, src: finale, x: 10, targets: [instant, null] });
  game._prioritySessionActive = false;
  assert.equal(game.stack.filter(so => so.card === instant).length, 3, 'original + dvije kopije moraju biti na stacku');
  await resolveAll(game);
  assert.equal(resolutions, 3);
  assert.equal(instant.zone, 'exile');
});

test('Tectonic Giant stavlja neizabranu kartu na dno, a izabranu čuva do sljedećeg vlastitog poteza', async () => {
  const { game, players: [me] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'tectonic') return 'impulse';
      if (q.type === 'chooseCards') return q.from.slice(0, 1);
      return defaultDecision(g, q);
    },
  ]);
  const giant = permanent(game, me, 'Tectonic Giant');
  const bottomChoice = addSynthetic(game, me, synthetic('Tectonic Other', { types: ['Instant'] }), 'library');
  const kept = addSynthetic(game, me, synthetic('Tectonic Kept', { types: ['Instant'] }), 'library');
  me.turnsStarted = 3;
  await game.emit('attacks', { card: giant });
  await resolveAll(game);
  assert.equal(kept.zone, 'exile');
  assert.equal(kept.meta.playableUntilOwnTurn, 4);
  assert.equal(bottomChoice.zone, 'library');
  assert.equal(me.library[0], bottomChoice, 'druga karta ide na dno biblioteke');
});

test('Theater of Horrors dozvola je vezana za izvor i ability može ciljati planeswalkera', async () => {
  const { game, players: [me, opp] } = rulesGame();
  const theater = permanent(game, me, 'Theater of Horrors');
  const exiled = inLibrary(me, 'Mountain');
  await game.emit('upkeep', { player: me });
  await resolveAll(game);
  assert.equal(exiled.zone, 'exile');
  assert.equal(game.hasExilePlayPermission(me, exiled), true);
  const walker = addSynthetic(game, opp, synthetic('Theater Walker', { types: ['Planeswalker'], power: 0, toughness: 0 }));
  const legal = game.legalTargets(theater.def.abilities[0].targets[0], theater, me);
  assert.ok(legal.includes(walker));
  await game.move(theater, 'graveyard');
  assert.equal(game.hasExilePlayPermission(me, exiled), false, 'odlazak Theatera gasi povezanu dozvolu');
});
