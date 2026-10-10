import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
const M = loadEngine();

function table(paced = true) {
  const g = new M.Game({seed: 19013, paced}), reviews = [], questions = [];
  const f = {g, reviews, questions};
  const players = ['You', 'Opponent', 'Third', 'Fourth'].map((name, idx) => g.addPlayer(name, {name}, null, idx !== 0));
  const [a, b] = players; Object.assign(f, {players, a, b});
  for (const p of players) p.controller = {decide: async (game, q) => {
    questions.push(q);
    if (q.type === 'effectReview') {reviews.push(q); return null;}
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'attackers') return p === a && f.attacker ? [{card: f.attacker, target: b}] : [];
    if (q.type === 'blockers') return [];
    if (q.type === 'chooseTargets') return q.candidates.filter(c => c === f.target).length >= (q.min || 1)
      ? q.candidates.filter(c => c === f.target).slice(0, q.min || 1) : q.candidates.slice(0, q.min || 1);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 1);
    if (q.type === 'chooseOption') return q.options.find(o => o.key === 'no')?.key || q.options[0]?.key;
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'main') return {kind: 'done'};
    if (['cardReveal', 'combatReview', 'threatAlert'].includes(q.type)) return null;
    throw Error('Unhandled actual highlight question ' + q.type);
  }};
  g.turnPlayer = a; g.turnNo = 6; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  f.put = (name, owner = a, zone = 'battlefield') => {
    assert.ok(M.DEFS[name], name);
    const c = new M.CardInst(M.DEFS[name], owner); c.zone = zone; c.sick = false;
    (zone === 'battlefield' ? g.battlefield : owner[zone]).push(c); return c;
  };
  for (const p of players) for (let i = 0; i < 8; i++) f.put('Forest', p, 'library');
  f.cast = async name => {const c = f.put(name, a, 'hand'); g.recalc(); assert.equal(await g.castSpell(a, c, {from: 'hand'}), true); return c;};
  return f;
}
const prose = recap => JSON.stringify(recap);

for (const name of ['Sol Ring', 'Island']) test(`native Yuriko shows the actor ${name}, mana value and each opponent's actual life loss`, async () => {
  const f = table(), {g, a, b} = f;
  f.attacker = f.put("Yuriko, the Tiger's Shadow");
  const top = f.put(name, a, 'library'); g.recalc();
  await g.combatPhase(a);
  const review = f.reviews.find(q => q.recap.source?.name === "Yuriko, the Tiger's Shadow");
  assert.ok(review, 'the acting human receives the actual trigger recap even below old numeric thresholds');
  assert.equal(top.zone, 'hand'); assert.equal(review.player, a);
  assert.equal(review.recap.impact.level, 'major');
  assert.match(prose(review.recap.highlights[0]), new RegExp(`${name}.*mana value ${top.mv}.*library → hand`));
  assert.equal(b.life, 39 - top.mv); assert.equal(f.players[2].life, 40 - top.mv);
  assert.match(review.recap.highlights[1].text, new RegExp(`Opponent: 39 → ${39 - top.mv} life \\(${top.mv} lost\\)`));
  assert.match(review.recap.highlights[1].text, new RegExp(`Third: 40 → ${40 - top.mv} life`));
  assert.match(review.recap.highlights[1].text, new RegExp(`Fourth: 40 → ${40 - top.mv} life`));
  assert.equal(review.recap.totalDamage, 0, 'Yuriko causes life loss, not damage');
  assert.doesNotMatch(review.recap.highlights[1].text, /damage/);
  assert.equal(review.recap.impact.stats[0].value, top.mv);
  assert.equal(review.recap.impact.stats[1].value, top.mv * 3);
});

test('paid Swords to Plowshares highlights the actual battlefield to exile result and life gained', async () => {
  const f = table(); f.target = f.put('Grizzly Bears', f.b); const land = f.put('Plains');
  await f.cast('Swords to Plowshares');
  assert.equal(land.tapped, true); assert.equal(f.target.zone, 'exile'); assert.equal(f.b.life, 42);
  const recap = f.reviews.at(-1).recap;
  assert.equal(recap.source.name, 'Swords to Plowshares'); assert.equal(recap.impact.level, 'major');
  assert.match(recap.highlights[0].text, /Grizzly Bears.*battlefield → exile/);
});

test('paid Soul-Guide Lantern highlights a graveyard card exiled by its real ETB trigger', async () => {
  const f = table(); f.target = f.put('Grizzly Bears', f.b, 'graveyard'); f.put('Wastes');
  await f.cast('Soul-Guide Lantern');
  assert.equal(f.target.zone, 'exile');
  const recap = f.reviews.find(q => q.recap.highlights.some(row => /graveyard → exile/.test(row.text))).recap;
  assert.equal(recap.source.name, 'Soul-Guide Lantern'); assert.match(recap.highlights[0].text, /Grizzly Bears.*graveyard → exile/);
});

test('paid Cloudshift preserves both actual exile and return transitions at the top of the recap', async () => {
  const f = table(); f.target = f.put('Grizzly Bears'); f.put('Plains');
  await f.cast('Cloudshift');
  assert.equal(f.target.zone, 'battlefield');
  const recap = f.reviews.at(-1).recap;
  assert.equal(recap.impact.headline, 'Gone and back');
  assert.match(recap.highlights[0].text, /Grizzly Bears.*battlefield → exile/);
  assert.match(recap.highlights[1].text, /Grizzly Bears.*exile → battlefield/);
});

test('paid Gonti highlights face-down library exile without exposing its private identity in local or online recap', async () => {
  const f = table(); f.target = f.b;
  for (let i = 0; i < 2; i++) f.put('Swamp'); for (let i = 0; i < 2; i++) f.put('Wastes');
  const secret = f.put('Colossal Dreadmaw', f.b, 'library');
  await f.cast('Gonti, Lord of Luxury');
  assert.equal(secret.zone, 'exile'); assert.equal(secret.faceDown, true);
  const review = f.reviews.find(q => q.recap.highlights.some(row => /library → exile/.test(row.text)));
  assert.ok(review); assert.match(prose(review.recap), /Face-down card/);
  assert.doesNotMatch(prose(review.recap), /Colossal Dreadmaw/);
  assert.doesNotMatch(JSON.stringify(M.completeOnlineDecision(f.g, review, f.a, {legal: {}})), /Colossal Dreadmaw/);
});

test('presentation guard redacts delayed face-down marking and hidden return after an actual move', async () => {
  const f = table(), secret = f.put('Colossal Dreadmaw', f.b, 'library'), source = f.put('Sol Ring');
  f.g.stack.push({kind: 'ability', name: 'Privacy presentation control', ctrl: f.a, srcCard: source, targets: [],
    ctx: {g: f.g, you: f.a, src: source}, run: async () => {
      await f.g.move(secret, 'exile'); secret.faceDown = true;
      await f.g.move(secret, 'hand');
    }});
  await f.g.resolveTop();
  assert.equal(secret.zone, 'hand');
  assert.match(prose(f.reviews[0].recap), /library → exile/);
  assert.doesNotMatch(prose(f.reviews[0].recap), /Colossal Dreadmaw/);
});

test('presentation guard uses the final public copied face instead of a transient hidden exile identity', async () => {
  const f = table(), secret = f.put('Colossal Dreadmaw', f.b, 'library'), source = f.put('Sol Ring');
  f.g.stack.push({kind: 'ability', name: 'Public-face presentation control', ctrl: f.a, srcCard: source, targets: [],
    ctx: {g: f.g, you: f.a, src: source}, run: async () => {
      await f.g.move(secret, 'exile'); secret.faceDown = true;
      await f.g.move(secret, 'battlefield', {c14EntryCopy: M.DEFS['Llanowar Elves']});
    }});
  await f.g.resolveTop();
  assert.match(prose(f.reviews[0].recap), /Llanowar Elves/);
  assert.doesNotMatch(prose(f.reviews[0].recap), /Colossal Dreadmaw/);
});

test('paid Pull from Eternity labels a public exile exit without claiming another entry', async () => {
  const f = table(); f.target = f.put('Grizzly Bears', f.b, 'exile'); f.put('Plains');
  await f.cast('Pull from Eternity');
  assert.equal(f.target.zone, 'graveyard');
  const recap = f.reviews.at(-1).recap;
  assert.equal(recap.impact.headline, 'From exile');
  assert.match(recap.highlights[0].text, /Grizzly Bears.*exile → graveyard/);
  assert.equal(recap.impact.stats[0].value, 1); assert.equal(recap.impact.stats[0].label, 'cards left exile');
});

test('headless actual Yuriko trigger changes the board without capturing or requesting highlights', async () => {
  const f = table(false); f.attacker = f.put("Yuriko, the Tiger's Shadow"); const top = f.put('Sol Ring', f.a, 'library'); f.g.recalc();
  await f.g.combatPhase(f.a); assert.equal(top.zone, 'hand'); assert.equal(f.b.life, 38);
  assert.equal(f.reviews.length, 0); assert.equal(f.g._resolutionRecap, undefined);
});
