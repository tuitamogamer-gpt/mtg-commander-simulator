import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M, setup, card, body, play, activate, event, settle, fuel, mana} from './helpers/c21-fixtures.mjs';
import {buildIntake, sourceDir} from '../scripts/import-frc-precon.mjs';
const tokens = (f, type, p = f.a) => f.game.bf().filter(c => c.ctrl === p && c.isToken && c.hasSub(type));
const choose = (f, {targets, mode, cards, option, yes} = {}) => {f.decide = (p, q) => {
  if (q.type === 'chooseTargets' && targets) return targets.filter(c => q.candidates.includes(c)).slice(0, q.max);
  if (q.type === 'chooseOption' && mode !== undefined && q.aiHint?.kind === 'mode' && q.options.some(o => o.key === String(mode))) return String(mode);
  if (q.type === 'chooseCards' && cards && cards.some(c => q.from.includes(c))) return cards.filter(c => q.from.includes(c)).slice(0, q.max);
  if (q.type === 'chooseOption' && option && q.options.some(o => o.key === option)) return option;
  if (q.type === 'chooseOption' && yes !== undefined && q.options.some(o => o.key === 'yes')) return yes ? 'yes' : 'no';
};};
const resetMana = p => {for (const c of Object.keys(p.pool)) p.pool[c] = 0; p.poolMeta = [];};

test('FRC preserves the published 100-card list and implements 26 new identities', () => {
  const i = buildIntake(M), original = JSON.parse(fs.readFileSync(sourceDir + '/intake.json'));
  assert.equal(original.newCards, 26); assert.equal(original.reusedCards, 67); assert.equal(i.newNames.length, 0);
  assert.equal(M.DECKS['Multiverse Reforged'].cards.reduce((n, c) => n + c.n, 0), 100);
  assert.deepEqual(Array.from(M.defaultCommanders(M.DECKS['Multiverse Reforged'])), ['Jace, Multiverse Architect']);
  for (const n of original.newNames) {assert.ok(M.SCRIPTS[n], n); assert.equal(!!M.DEFS[n].simplified, false, n); assert.ok(M.CARD_CATALOG[n].deckImportEligible, n);}
  const text = fs.readFileSync(sourceDir + '/multiverse-reforged.txt', 'utf8');
  assert.equal(M.importCommanderDeck(text, {name: 'FRC test'}).ok, true);
  const alternate = text.replace('Commander\n1 Jace, Multiverse Architect', 'Commander\n1 Nissa, Leyline Tamer').replace('Deck\n1 Nissa, Leyline Tamer', 'Deck\n1 Jace, Multiverse Architect');
  assert.equal(M.importCommanderDeck(alternate, {name: 'FRC alternate'}).ok, true);
});

for (const role of ['human', 'ai']) {
  test(role + ': Jace casts as a planeswalker commander, draws and bottoms a card', async () => {
    const f = setup(role), c = card(f, 'Jace, Multiverse Architect', 'command'); c.commander = true; f.a.commanders = [c];
    await play(f, c.name, {card: c}); assert.equal(c.counters.loyalty, 4);
    await activate(f, c, 0); assert.equal(c.counters.loyalty, 5); assert.equal(f.a.hand.length, 1);
  });
  test(role + ': Jace exiles a token and reveals through lands into a planeswalker', async () => {
    const f = setup(role), c = await play(f, 'Jace, Multiverse Architect');
    const [token] = await f.game.makeTokens(M.TOKENS.soldierW, f.a), hit = card(f, "Elspeth, Sun's Champion", 'library'), rest = card(f, 'Forest', 'library');
    choose(f, {targets: [token]}); await activate(f, c, 1);
    assert.notEqual(token.zone, 'battlefield'); assert.equal(hit.zone, 'battlefield'); assert.equal(f.a.library[0], rest); assert.equal(c.counters.loyalty, 1);
  });
  test(role + ': unpaid Jace tax shields all your Jaces for the turn, even after the source leaves', async () => {
    const f = setup(role), c = await play(f, 'Jace, Multiverse Architect'), b = body(f, f.b);
    await M.FRC.empower({g: f.game, src: c, you: f.a}, 2); const token = tokens(f, 'Jace')[0];
    resetMana(f.b); await event(f, 'beginCombat', {player: f.b});
    assert.equal(f.game.canAttackTarget(b, c), false); assert.equal(f.game.canAttackTarget(b, token), false);
    await f.game.move(c, 'exile'); assert.equal(f.game.canAttackTarget(b, token), false); assert.equal(f.game.canAttackTarget(b, f.a), true);
  });
  test(role + ': an opponent can pay Jace’s combat tax', async () => {
    const f = setup(role), c = await play(f, 'Jace, Multiverse Architect'), b = body(f, f.b); f.b.pool.C = 2; choose(f, {yes: true});
    await event(f, 'beginCombat', {player: f.b}); assert.equal(f.b.pool.C, 0); assert.equal(f.game.canAttackTarget(b, c), true);
  });
  test(role + ': empower creates a nonlegendary Jace and grows that token instead of the commander', async () => {
    const f = setup(role), c = await play(f, 'Jace, Multiverse Architect'); choose(f, {mode: 0});
    await play(f, 'Fatehold Charm'); const token = tokens(f, 'Jace')[0]; assert.ok(token); assert.equal(token.name, 'Jace Token'); assert.equal(token.counters.loyalty, 2); assert.equal(c.counters.loyalty, 4);
    await play(f, 'Fatehold Charm'); assert.equal(tokens(f, 'Jace').length, 1); assert.equal(token.counters.loyalty, 4);
    const n = f.a.hand.length; await activate(f, token, 1); assert.equal(token.counters.loyalty, 1); assert.equal(f.a.hand.length, n + 1);
  });
  test(role + ': Fatehold Charm bounces a creature and its other mode buffs the team', async () => {
    const f = setup(role), b = body(f, f.b); choose(f, {mode: 1, targets: [b]}); await play(f, 'Fatehold Charm'); assert.equal(b.zone, 'hand');
    const a = body(f); choose(f, {mode: 2}); await play(f, 'Fatehold Charm'); assert.equal(a.power, 3); assert.equal(a.toughness, 4);
  });
  test(role + ': Fatehold Charm returns an uncounterable spell to hand without countering it', async () => {
    const f = setup(role), c = card(f, 'Akroma, Angel of Fury', 'hand', f.b); f.game.turnPlayer = f.b; fuel(f.b); assert.ok(await f.game.castSpell(f.b, c, {from: 'hand'}));
    const so = f.game.stack.find(s => s.card === c); choose(f, {mode: 1, targets: [so]}); await play(f, 'Fatehold Charm'); assert.equal(c.zone, 'hand');
  });
  test(role + ': Plan for All Outcomes lets the owner choose bottom and empowers on the first noncreature cast', async () => {
    const f = setup(role), c = body(f, f.b); choose(f, {targets: [c], option: 'bottom'}); await play(f, 'Plan for All Outcomes'); assert.equal(f.b.library[0], c);
    await play(f, 'Sol Ring'); assert.equal(tokens(f, 'Jace').length, 0, 'the enchantment was the first spell before it entered');
    f.a.turnState = f.a.freshTurnState(); f.game.turnNo++; await play(f, 'Arcane Signet'); assert.equal(tokens(f, 'Jace')[0].counters.loyalty, 1);
    await play(f, 'Dimir Signet'); assert.equal(tokens(f, 'Jace')[0].counters.loyalty, 1);
  });
  test(role + ': Nissa draws for every land but reveals a creature only on the first resolution', async () => {
    const f = setup(role), nissa = card(f, 'Nissa, Leyline Tamer'), hit = card(f, 'Grizzly Bears', 'library'); card(f, 'Forest', 'library');
    const land = card(f, 'Plains'); await event(f, 'etb', {card: land}); assert.equal(hit.zone, 'battlefield'); assert.equal(f.a.hand.length, 1);
    const second = card(f, 'Rootbreaker Wurm', 'library'); card(f, 'Forest', 'library'); await event(f, 'etb', {card: card(f, 'Island')});
    assert.equal(second.zone, 'library'); assert.equal(f.a.hand.length, 2); assert.ok(nissa.kw('deathtouch'));
  });
  test(role + ': Avacyn returns herself and a simultaneous nontoken death at the next end step', async () => {
    const f = setup(role), c = card(f, 'Avacyn, Angel of Horror'), b = body(f); await f.game.destroyMany([c, b]); await settle(f.game);
    assert.equal(c.zone, 'graveyard'); await event(f, 'endStep', {player: f.b}); assert.equal(c.zone, 'battlefield'); assert.equal(b.zone, 'battlefield');
  });
  test(role + ': Avacyn does not return a graveyard card that changed zones again', async () => {
    const f = setup(role); card(f, 'Avacyn, Angel of Horror'); const b = body(f); await f.game.destroy(b); await settle(f.game);
    await f.game.move(b, 'hand'); await f.game.move(b, 'graveyard'); await event(f, 'endStep', {player: f.b}); assert.equal(b.zone, 'graveyard');
  });
  test(role + ': Dack enters creatures under your control, then gives a different one to each opponent and goads them', async () => {
    const f = setup(role), a = card(f, 'Grizzly Bears', 'library'), b = card(f, 'Rootbreaker Wurm', 'library'); await play(f, 'Dack Fayden, Helping Hand');
    assert.equal(a.zone, 'battlefield'); assert.equal(b.zone, 'battlefield'); assert.notEqual(a.ctrl, b.ctrl); assert.notEqual(a.ctrl, f.a); assert.ok(f.game.goadersOf(a).includes(f.a));
  });
  test(role + ': Darksteel Angel prevents losses, opposing wins and new minus counters while present', async () => {
    const f = setup(role), a = await play(f, 'Darksteel Angel'), b = body(f); f.game.addCounters(b, '-1/-1', 2);
    assert.equal(b.counters['-1/-1'] || 0, 0); assert.equal(f.game.canLoseGame(f.a), false); assert.equal(f.game.canWinGame(f.b), false);
    await f.game.move(a, 'exile'); assert.equal(f.game.canLoseGame(f.a), true); assert.equal(f.game.canWinGame(f.b), true);
  });
  test(role + ': Ginger creates a real one-mana Gingerbrute on every upkeep while monarch', async () => {
    const f = setup(role), c = await play(f, 'Ginger, Queen of Sweets'); assert.equal(f.game.monarch, f.a);
    await event(f, 'upkeep', {player: f.b}); const t = tokens(f, 'Golem')[0]; assert.equal(t.mv, 1); assert.ok(t.kw('haste'));
    t.sick = false; const b = body(f, f.b); await activate(f, t, 0); assert.equal(f.game.canBlock(b, t), false);
    await activate(f, t, 1); assert.equal(f.a.life, 43); c.sick = false; await activate(f, c); assert.equal(f.a.life, 49);
  });
  test(role + ': Jhoira steals a historic permanent and loses its mana value in life', async () => {
    const f = setup(role), hit = card(f, 'Sol Ring', 'library', f.b), rest = card(f, 'Forest', 'library', f.b); choose(f, {targets: [f.b]});
    await play(f, 'Jhoira, Weatherlight Corsair'); assert.equal(hit.ctrl, f.a); assert.equal(hit.owner, f.b); assert.equal(f.a.life, 39); assert.equal(f.b.library[0], rest);
  });
  test(role + ': Memnarch creates Myr and draws for artifacts when attacking', async () => {
    const f = setup(role), c = await play(f, 'Memnarch, the Warden'); assert.equal(tokens(f, 'Myr').length, 2); await event(f, 'attacks', {card: c, player: f.a}); assert.equal(f.a.hand.length, 3);
  });
  test(role + ': Niv-Mizzet drains and optionally spends gained life to draw', async () => {
    const f = setup(role), c = card(f, 'Niv-Mizzet, Ghost Counsel'); choose(f, {yes: true}); await activate(f, c);
    assert.equal(f.a.life, 40); assert.equal(f.b.life, 39); assert.equal(f.a.hand.length, 1);
  });
  test(role + ': Ob Nixilis destroys tapped enemies and creates Angels on opposing end steps', async () => {
    const f = setup(role), b = body(f, f.b), safe = card(f, 'Darksteel Myr', 'battlefield', f.b); b.tapped = safe.tapped = true;
    await play(f, 'Ob Nixilis, the Ascended'); assert.equal(b.zone, 'graveyard'); assert.equal(safe.zone, 'battlefield'); assert.equal(f.a.life, 41);
    await event(f, 'endStep', {player: f.b}); assert.equal(tokens(f, 'Angel').length, 1);
  });
  test(role + ': Omnath adds landfall mana, grows, and converts mana to persistent colorless', async () => {
    const f = setup(role), c = card(f, 'Omnath, Locus of the Void'); resetMana(f.a); f.a.pool.U = 3;
    await event(f, 'etb', {card: card(f, 'Plains')}); assert.equal(f.a.pool.C, 2); f.game.recalc(); assert.equal(c.power, 11);
    f.game.emptyPool(); assert.equal(f.a.pool.C, 5); assert.equal(f.a.pool.U, 0); f.game.emptyPool(); assert.equal(f.a.pool.C, 5);
    await f.game.move(c, 'exile'); f.game.emptyPool(); assert.equal(f.a.pool.C, 0);
  });
  test(role + ': Overlord can be cast for impending and becomes a creature only after its final time counter', async () => {
    const f = setup(role), c = card(f, 'Overlord of the Mistmoors', 'hand'); fuel(f.a);
    const offer = f.game.castableList(f.a).find(r => r.card === c && r.alt?.frcImpending); assert.ok(offer);
    const n = mana(f.a); assert.ok(await f.game.castSpell(f.a, c, {from: 'hand', alt: offer.alt})); await settle(f.game); assert.equal(n - mana(f.a), 4);
    assert.equal(c.is('Creature'), false); assert.equal(c.counters.time, 4); assert.equal(tokens(f, 'Insect').length, 2);
    for (let i = 0; i < 4; i++) await event(f, 'endStep', {player: f.a}); assert.equal(c.is('Creature'), true);
    f.game.addCounters(c, 'time', 1); assert.equal(c.is('Creature'), false, 'impending applies while there are time counters');
    await event(f, 'endStep', {player: f.a}); assert.equal(c.is('Creature'), true);
  });
  test(role + ': Overlord cheated into play is a creature with its ETB tokens', async () => {
    const f = setup(role), c = card(f, 'Overlord of the Mistmoors', 'hand'); await f.game.putPermanentOntoBattlefield(c, f.a); await settle(f.game);
    assert.equal(c.is('Creature'), true); assert.equal(c.counters.time || 0, 0); assert.equal(tokens(f, 'Insect').length, 2);
  });
  test(role + ': impending entry triggers respect whether time counters were actually placed', async () => {
    for (const prohibit of [false, true]) {
      const f = setup(role); card(f, 'Soul Warden');
      if (prohibit) {
        const allowed = f.game.canPutCountersV18.bind(f.game);
        f.game.canPutCountersV18 = (c, kind) => kind !== 'time' && allowed(c, kind);
      }
      const c = card(f, 'Overlord of the Mistmoors', 'hand'); fuel(f.a);
      const offer = f.game.castableList(f.a).find(r => r.card === c && r.alt?.frcImpending);
      assert.ok(await f.game.castSpell(f.a, c, {from: 'hand', alt: offer.alt})); await settle(f.game);
      assert.equal(c.is('Creature'), prohibit); assert.equal(f.a.life, prohibit ? 43 : 42);
      f.game.removeCounters(c, 'time', 4);
      let observed;
      const entrant = new M.CardInst({...M.DEFS.Forest, asEnters: g => {g.recalc(); observed = c.is('Creature');}}, f.a);
      entrant.zone = 'hand'; f.a.hand.push(entrant);
      await f.game.putPermanentOntoBattlefield(entrant, f.a);
      assert.equal(observed, true, 'another entry does not change an Overlord with no time counters');
    }
  });
  test(role + ': a copied impending spell keeps its alternative cost choice', async () => {
    const f = setup(role), c = card(f, 'Overlord of the Mistmoors', 'hand'); fuel(f.a);
    const offer = f.game.castableList(f.a).find(r => r.card === c && r.alt?.frcImpending);
    assert.ok(await f.game.castSpell(f.a, c, {from: 'hand', alt: offer.alt}));
    await f.game.copySpell(f.game.stack.find(s => s.card === c), f.a, {mayNewTargets: false}); await settle(f.game);
    const copy = f.game.bf().find(t => t.isToken && t.name === c.name); assert.ok(copy); assert.equal(copy.is('Creature'), false); assert.equal(copy.counters.time, 4);
  });
  test(role + ': copying an impending permanent does not copy its noncreature status', async () => {
    const f = setup(role), c = card(f, 'Overlord of the Mistmoors', 'hand'); fuel(f.a);
    const offer = f.game.castableList(f.a).find(r => r.card === c && r.alt?.frcImpending);
    assert.ok(await f.game.castSpell(f.a, c, {from: 'hand', alt: offer.alt})); await settle(f.game);
    const [copy] = await M.FRC.copy({g: f.game, src: c, you: f.a}, c); await settle(f.game);
    assert.equal(copy.is('Creature'), true); assert.equal(copy.counters.time || 0, 0);
  });
  test(role + ': Serra’s Emissary protects its controller and their creatures from the chosen type', async () => {
    const f = setup(role); choose(f, {option: 'Creature'}); const c = await play(f, "Serra's Emissary"), b = body(f, f.b);
    assert.equal(f.game.isProtectedFrom(f.a, b), true); assert.equal(f.game.isProtectedFrom(c, b), true);
    await f.game.damageAny(b, f.a, 5); assert.equal(f.a.life, 40); await f.game.move(c, 'exile'); assert.equal(f.game.isProtectedFrom(f.a, b), false);
  });
  test(role + ': Sunfall exiles creatures and creates an Incubator with the exact count', async () => {
    const f = setup(role), a = body(f), b = body(f, f.b); await play(f, 'Sunfall'); assert.equal(a.zone, 'exile'); assert.equal(b.zone, 'exile');
    const t = tokens(f, 'Incubator')[0]; assert.equal(t.counters['+1/+1'], 2); await activate(f, t); assert.ok(t.is('Creature')); assert.equal(t.power, 2);
  });
  test(role + ': Mass Polymorph reveals one creature for each creature exiled', async () => {
    const f = setup(role); body(f); body(f); const a = card(f, 'Rootbreaker Wurm', 'library'), b = card(f, 'Grizzly Bears', 'library');
    await play(f, 'Mass Polymorph'); assert.equal(a.zone, 'battlefield'); assert.equal(b.zone, 'battlefield'); assert.equal(f.game.creatures(f.a).length, 2);
  });
  test(role + ': Tamiyo taps and stuns a creature that damages its monarch controller', async () => {
    const f = setup(role); await play(f, 'Tamiyo, Upriser Crowned'); const b = body(f, f.b);
    await f.game.damageAny(b, f.a, 2, {combat: true}); await settle(f.game); assert.equal(b.tapped, true); assert.equal(b.counters.stun, 1);
  });
  test(role + ': Tamiyo triggers once for a simultaneous damage group and stuns every attacking source', async () => {
    const f = setup(role); const s = await play(f, 'Tamiyo, Upriser Crowned'), a = body(f, f.b), b = body(f, f.b);
    await f.game.damageBatch([{src: a, target: f.a, n: 1}, {src: b, target: f.a, n: 1}], {combat: true});
    await f.game.flushTriggers(); assert.equal(f.game.stack.filter(t => t.srcCard === s).length, 1); await settle(f.game);
    assert.equal(a.counters.stun, 1); assert.equal(b.counters.stun, 1);
  });
  test(role + ': Teferi’s Reproach protects an opponent and phases out only nonlands', async () => {
    const f = setup(role), b = body(f, f.b), land = card(f, 'Forest', 'battlefield', f.b); choose(f, {targets: [f.b]});
    const c = await play(f, "Teferi's Reproach"); assert.equal(c.zone, 'exile'); assert.equal(b.phasedOut, true); assert.equal(!!land.phasedOut, false);
    await f.game.loseLife(f.b, 4); await f.game.gainLife(f.b, 4); assert.equal(f.b.life, 40); assert.equal(f.game.isProtectedFrom(f.b, c), true);
  });
  test(role + ': Ur-Sphinx discounts other Sphinxes in the command zone and mills on attacks', async () => {
    const f = setup(role), s = card(f, 'The Ur-Sphinx', 'command'), c = card(f, 'Sphinx of Uthuun', 'hand');
    assert.equal(f.game.spellCost(f.a, c).generic, 4); assert.equal(f.game.spellCost(f.a, s).generic, 6);
    await f.game.putPermanentOntoBattlefield(s, f.a); await settle(f.game); const n = f.b.library.length;
    await event(f, 'attackersDeclared', {player: f.a, attackers: [s]}); assert.equal(f.b.library.length, n - 1); assert.equal(f.b.graveyard.length, 1);
  });
  test(role + ': Venser creates two opposing permanent copies with haste, then sacrifices them', async () => {
    const f = setup(role), b = body(f, f.b); choose(f, {mode: 1, targets: [b]}); await play(f, 'Venser, Fervent Forger');
    const copies = f.game.creatures(f.a).filter(c => c.isToken); assert.equal(copies.length, 2); assert.ok(copies.every(c => c.kw('haste')));
    await event(f, 'endStep', {player: f.b}); assert.equal(f.game.creatures(f.a).filter(c => c.isToken).length, 0);
  });
  test(role + ': Venser copies an opponent’s instant twice with separate controllers', async () => {
    const f = setup(role), c = card(f, 'Brainstorm', 'hand', f.b); fuel(f.b); assert.ok(await f.game.castSpell(f.b, c, {from: 'hand'}));
    choose(f, {mode: 0, targets: [f.game.stack.find(s => s.card === c)]}); await play(f, 'Venser, Fervent Forger');
    assert.equal(f.a.hand.length, 2); assert.equal(f.b.hand.length, 1);
  });
  test(role + ': Ur-Sphinx casts at most one milled spell per player and permission ends during resolution', async () => {
    const f = setup(role), s = card(f, 'The Ur-Sphinx'), other = card(f, 'Sphinx of Uthuun');
    const mine = card(f, 'Sol Ring', 'library'), uncast = card(f, 'Arcane Signet', 'library');
    const theirs = card(f, 'Dimir Signet', 'library', f.b);
    f.decide = (p, q) => q.type === 'chooseCards' && q.aiHint?.kind === 'recur' ? [mine, theirs].filter(c => q.from.includes(c)).slice(0, 1) : undefined;
    await event(f, 'attackersDeclared', {player: f.a, attackers: [s, other]});
    assert.equal(mine.zone, 'battlefield'); assert.equal(theirs.zone, 'battlefield'); assert.equal(theirs.ctrl, f.a); assert.equal(uncast.zone, 'graveyard');
    assert.equal(f.game.castableList(f.a).some(r => r.card === uncast), false);
  });
  test(role + ': empower with token doubling puts counters on only one of the created Jaces', async () => {
    const f = setup(role), source = card(f, 'Parallel Lives');
    await M.FRC.empower({g: f.game, src: source, you: f.a}, 2); await f.game.checkSBA(); await settle(f.game);
    const jaces = tokens(f, 'Jace'); assert.equal(jaces.length, 1); assert.equal(jaces[0].counters.loyalty, 2);
  });
  test(role + ': Nissa doubled landfall resolutions draw twice but reveal only one creature', async () => {
    const f = setup(role), nissa = card(f, 'Nissa, Leyline Tamer'), hit = card(f, 'Grizzly Bears', 'library'); card(f, 'Forest', 'library');
    const land = card(f, 'Plains'); await f.game.emit('etb', {card: land}); await f.game.emit('etb', {card: land}); await settle(f.game);
    assert.equal(hit.zone, 'battlefield'); assert.equal(f.a.hand.length, 2); assert.equal(f.game.creatures(f.a).length, 2); assert.equal(nissa.zone, 'battlefield');
  });
  test(role + ': Windcrag Siege Mardu adds another attack trigger, while Jeskai makes a temporary lifelink Goblin', async () => {
    const f = setup(role); choose(f, {option: 'mardu'}); const siege = await play(f, 'Windcrag Siege'), c = card(f, 'Memnarch, the Warden');
    await event(f, 'attacks', {card: c, player: f.a}); assert.equal(f.a.hand.length, 2);
    await f.game.move(siege, 'graveyard'); choose(f, {option: 'jeskai'}); await play(f, 'Windcrag Siege'); await event(f, 'upkeep', {player: f.a});
    const t = tokens(f, 'Goblin')[0]; assert.ok(t.kw('haste')); assert.ok(t.kw('lifelink'));
  });
  for (const name of ['Turbulent Crater', 'Turbulent Shore', 'Turbulent Wetlands']) test(role + ': ' + name + ' counts opponents’ lands together', async () => {
    const f = setup(role), a = card(f, name, 'hand'); await f.game.putPermanentOntoBattlefield(a, f.a); assert.equal(a.tapped, true);
    for (let i = 0; i < 4; i++) {card(f, 'Forest', 'battlefield', f.b); card(f, 'Forest', 'battlefield', f.others[1]);}
    const b = card(f, name, 'hand'); await f.game.putPermanentOntoBattlefield(b, f.a); assert.equal(b.tapped, false);
    const sources = f.game.manaSources(f.a).filter(s => s.card === b); assert.ok(sources.length > 0);
  });
  test(role + ': Archfiend prevents opposing life gain and repeats losses at every end step', async () => {
    const f = setup(role); card(f, 'Archfiend of Despair'); await f.game.loseLife(f.b, 3); await f.game.gainLife(f.b, 2); assert.equal(f.b.life, 37);
    await event(f, 'endStep', {player: f.b}); assert.equal(f.b.life, 34);
  });
}

test('local AI targets an expendable token for Jace while preserving a large finisher', async () => {
  const f = setup('ai'), c = await play(f, 'Jace, Multiverse Architect'), large = card(f, 'Darksteel Angel');
  const [token] = await f.game.makeTokens(M.TOKENS.soldierW, f.a); card(f, 'Rootbreaker Wurm', 'library');
  await activate(f, c, 1); assert.equal(large.zone, 'battlefield'); assert.notEqual(token.zone, 'battlefield');
});
