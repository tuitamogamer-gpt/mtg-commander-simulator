import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const MTG = loadEngine();
function setup({paced = true, humans = 1, review} = {}) {
  const reviews = [];
  const game = new MTG.Game({seed: 23, paced});
  game.pace = async () => {};
  const decide = async (g, q) => {
    if (q.type === 'effectReview' && q.recap) {
      reviews.push(q);
      return review?.(g, q);
    }
    if (q.type === 'chooseCards') return q.from.slice(0, q.max || 1);
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 1);
    if (q.type === 'chooseOption') return q.options.some(o => o.key === 'cz') ? 'cz' : q.options[0]?.key;
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'priority') return {kind: 'pass'};
    return null;
  };
  const players = ['You', 'Opponent', 'Third'].map((name, index) => game.addPlayer(name, {name}, {decide}, index >= humans));
  game.turnPlayer = players[0]; game.turnNo = 8; game.phase = 'main1';
  return {game, players, reviews};
}
function card(game, owner, name, zone = 'battlefield', definition) {
  const c = new MTG.CardInst(definition || MTG.DEFS[name], owner);
  c.zone = zone; c.sick = false;
  (zone === 'battlefield' ? game.battlefield : owner[zone]).push(c);
  game.recalc();
  return c;
}
function stack(game, owner, name, targets = []) {
  const c = new MTG.CardInst(MTG.DEFS[name], owner); c.zone = 'stack';
  game.stack.push({name, kind: 'spell', card: c, ctrl: owner, targets,
    targetSpecs: c.def.targets || [], castOpts: {}});
  return c;
}
const prose = q => JSON.stringify(q.recap);

for (const type of ['Creature', 'Land', 'Artifact', 'Enchantment', 'Planeswalker', 'Battle']) {
  test(`Chaos Warp puts a revealed ${type} onto the battlefield and reports it`, async () => {
    const {game, players: [human, owner], reviews} = setup();
    const target = card(game, owner, 'Sol Ring');
    const name = `Revealed ${type}`;
    const def = {name, types: [type], super: [], subtypes: [], cost: '{2}', oracle: '',
      power: '3', toughness: '3', loyalty: 5, defense: 5};
    const top = card(game, owner, name, 'library', def);
    game.rnd = () => 0;
    stack(game, human, 'Chaos Warp', [target]);
    await game.resolveTop();
    assert.equal(top.zone, 'battlefield');
    assert.equal(top.ctrl, owner);
    assert.equal(target.zone, 'library');
    assert.equal(owner.exile.length, 0);
    assert.equal(reviews.length, 1);
    assert.match(prose(reviews[0]), new RegExp(`revealed ${name}`));
    assert.match(prose(reviews[0]), /entered the battlefield/);
  });
}

test('a paid Chaos Warp cast pauses after its instant reveal, and Proceed is required', async () => {
  let proceed;
  const {game, players: [human, owner], reviews} = setup({review: () => new Promise(resolve => {proceed = resolve;})});
  const target = card(game, owner, 'Sol Ring');
  const top = card(game, owner, 'Arcane Denial', 'library');
  const warp = card(game, human, 'Chaos Warp', 'hand');
  human.pool.R = 3; game.rnd = () => 0;
  let done = false;
  const resolution = game.castSpell(human, warp, {from: 'hand'}).then(result => {assert.equal(result, true); done = true;});
  for (let i = 0; i < 100 && !proceed; i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(proceed);
  assert.equal(done, false);
  assert.equal(human.pool.R, 0);
  assert.equal(warp.zone, 'graveyard');
  assert.equal(top.zone, 'library');
  assert.equal(owner.library.at(-1), top);
  assert.equal(target.zone, 'library');
  assert.match(prose(reviews[0]), /not a permanent card/);
  assert.match(prose(reviews[0]), /not exiled/);
  proceed(); await resolution; assert.equal(done, true);
});

test('Chaos Warp can return the same shuffled permanent and handles a stolen commander', async () => {
  const {game, players: [human, owner], reviews} = setup();
  const target = card(game, owner, 'Sol Ring');
  target.ctrl = human;
  stack(game, human, 'Chaos Warp', [target]);
  await game.resolveTop();
  assert.equal(target.zone, 'battlefield'); assert.equal(target.ctrl, owner);
  target.commander = true;
  card(game, owner, 'Island', 'library');
  stack(game, human, 'Chaos Warp', [target]);
  await game.resolveTop();
  assert.equal(target.zone, 'command');
  assert.match(prose(reviews[1]), /command zone/);
  assert.match(prose(reviews[1]), /Island/);
});

test('illegal Chaos Warp target never reveals a card', async () => {
  const {game, players: [human, owner], reviews} = setup();
  const target = card(game, owner, 'Sol Ring');
  const top = card(game, owner, 'Island', 'library');
  stack(game, human, 'Chaos Warp', [target]);
  await game.move(target, 'graveyard');
  await game.resolveTop();
  assert.equal(top.zone, 'library');
  assert.match(prose(reviews[0]), /fizzles/);
  assert.doesNotMatch(prose(reviews[0]), /revealed Island/);
});

test('Cultivate reports both searched lands and their actual destinations, including tapped status', async () => {
  const {game, players: [, owner], reviews} = setup();
  card(game, owner, 'Forest', 'library'); card(game, owner, 'Island', 'library');
  stack(game, owner, 'Cultivate');
  await game.resolveTop();
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].recap.searches.length, 2);
  assert.equal(reviews[0].recap.impact.level, 'minor', 'ordinary land searches stay quiet');
  assert.match(prose(reviews[0]), /Forest → battlefield, tapped/);
  assert.match(prose(reviews[0]), /Island → hand/);
});

test('empty fetch is visible and an ordinary land play does not create a recap', async () => {
  const {game, players: [, owner], reviews} = setup();
  stack(game, owner, 'Rampant Growth'); await game.resolveTop();
  assert.match(prose(reviews[0]), /no card found/);
  const land = card(game, owner, 'Forest', 'hand');
  await game.move(land, 'battlefield');
  assert.equal(reviews.length, 1);
});

test('an activated fetch names its sacrificed source and fetched land after resolution', async () => {
  const {game, players: [, owner], reviews} = setup();
  const fetch = card(game, owner, 'Evolving Wilds');
  const land = card(game, owner, 'Forest', 'library');
  game.turnPlayer = owner;
  const ability = game.activatableList(owner).find(entry => entry.card === fetch && !entry.manaAbility);
  assert.ok(ability);
  assert.equal(await game.activateAbility(owner, ability), true);
  assert.equal(fetch.zone, 'graveyard');
  assert.equal(land.zone, 'battlefield'); assert.equal(land.tapped, true);
  assert.equal(reviews[0].recap.source.name, 'Evolving Wilds');
  assert.equal(reviews[0].recap.impact.level, 'minor');
  assert.match(prose(reviews[0]), /Forest → battlefield, tapped/);
});

test('a large prevented damage event still explains the completed outcome', async () => {
  const {game, players: [human, owner], reviews} = setup();
  const bank = card(game, human, 'Fog Bank');
  const attacker = card(game, owner, 'Grizzly Bears');
  attacker.counters['+1/+1'] = 11; game.recalc();
  attacker.attacking = human; attacker.blockedBy = [bank]; attacker.wasBlocked = true;
  bank.blocking = attacker.iid; game.combat = {attackers: [attacker]};
  await game.combatDamage(owner, 'normal');
  assert.equal(bank.zone, 'battlefield'); assert.equal(bank.damage, 0);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].recap.totalDamage, 0);
  assert.equal(reviews[0].recap.impact.level, 'major');
  assert.equal(reviews[0].recap.impact.headline, 'Damage stopped');
  assert.match(prose(reviews[0]), /13 damage prevented/);
});

test('secret tutor stays private for opponents, but its owner and public reveal see the card', async () => {
  const {game, players: [human, owner], reviews} = setup({humans: 2});
  const secret = card(game, owner, 'Sol Ring', 'library');
  const source = card(game, owner, 'Arcane Signet');
  game.stack.push({kind: 'ability', name: 'Private tutor', ctrl: owner, srcCard: source, targets: [],
    ctx: {g: game, you: owner, src: source}, run: async () => {
      const [chosen] = await owner.controller.decide(game, {type: 'chooseCards', search: true, from: owner.library, min: 1, max: 1});
      await game.move(chosen, 'hand');
    }});
  await game.resolveTop();
  assert.equal(reviews.length, 2);
  assert.doesNotMatch(prose(reviews[0]), /Sol Ring/);
  assert.match(prose(reviews[0]), /not revealed/);
  assert.match(prose(reviews[1]), /Sol Ring → hand/);
  const descriptor = MTG.completeOnlineDecision(game, reviews[0], human, {legal: {}});
  assert.doesNotMatch(JSON.stringify(descriptor), /Sol Ring/);
  assert.equal(descriptor.ui.recap.controllerName, owner.name);
  assert.equal(descriptor.ui.recap.impact.level, 'minor', 'Live receives the same public presentation level');
  await game.move(secret, 'library');
  game.stack.push({kind: 'ability', name: 'Public tutor', ctrl: owner, srcCard: source, targets: [],
    ctx: {g: game, you: owner, src: source}, run: async () => {
      const [chosen] = await owner.controller.decide(game, {type: 'chooseCards', search: true, from: owner.library, min: 1, max: 1});
      await game.revealToHuman({cards: [chosen], ctrl: owner, kind: 'reveal'});
      await game.move(chosen, 'hand');
    }});
  await game.resolveTop();
  assert.match(prose(reviews[2]), /Sol Ring → hand/);
});

test('Blasphemous Act recap includes deaths, an indestructible survivor and queued death triggers', async () => {
  const {game, players: [human, owner], reviews} = setup();
  card(game, human, 'Llanowar Elves'); card(game, owner, 'Birds of Paradise');
  card(game, human, 'Blood Artist');
  const survivor = card(game, owner, 'Darksteel Myr');
  stack(game, owner, 'Blasphemous Act');
  await game.resolveTop();
  const recap = reviews.at(-1).recap;
  assert.equal(survivor.zone, 'battlefield');
  assert.equal(recap.changes.filter(row => row.text.includes('graveyard')).length, 3);
  assert.equal(recap.totalDamage, 52);
  assert.equal(recap.impact.level, 'major');
  assert.equal(recap.impact.headline, 'Board wipe');
  assert.deepEqual(JSON.parse(JSON.stringify(recap.impact.stats)), [
    {value: 3, label: 'permanents removed'}, {value: 52, label: 'damage dealt'},
  ], 'headline totals count actual removals, excluding the indestructible survivor');
  assert.match(JSON.stringify(recap.changes), /Darksteel Myr remained on the battlefield with indestructible/);
  assert.ok(recap.stack.length > 0);
  assert.ok(game.stack.length > 0, 'death triggers have not resolved while the recap is displayed');
});

test('combat damage recap is a separate checkpoint after actual damage', async () => {
  const {game, players: [human, owner], reviews} = setup();
  const attacker = card(game, owner, 'Colossal Dreadmaw');
  attacker.counters['+1/+1'] = 4; game.recalc();
  attacker.attacking = human; attacker.blockedBy = []; attacker.wasBlocked = false;
  game.combat = {attackers: [attacker]};
  await game.combatDamage(owner, 'normal');
  assert.equal(human.life, 30);
  assert.equal(reviews[0].recap.combat, true);
  assert.equal(reviews[0].recap.totalDamage, 10);
  assert.equal(reviews[0].recap.impact.level, 'major');
  assert.equal(reviews[0].recap.impact.headline, 'Massive damage');
  assert.equal(reviews[0].recap.players[0].after, 30);
});

test('headless simulations skip recap capture and decisions', async () => {
  const {game, players: [human, owner], reviews} = setup({paced: false});
  const target = card(game, owner, 'Sol Ring');
  card(game, owner, 'Forest', 'library');
  stack(game, human, 'Chaos Warp', [target]); await game.resolveTop();
  assert.equal(reviews.length, 0);
  assert.equal(game._resolutionRecap, undefined);
});

test('a global life-loss announcement is followed by an actual result recap', async () => {
  const {game, players: [human, owner], reviews} = setup();
  const source = card(game, owner, 'Blood Artist');
  game.stack.push({kind: 'ability', name: 'Global life loss', ctrl: owner, srcCard: source, targets: [],
    ctx: {g: game, you: owner, src: source}, run: () => game.loseLifeOpponents(source, owner, 2)});
  await game.resolveTop();
  assert.equal(human.life, 38);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].recap.players.find(row => row.name === human.name).after, 38);
  assert.equal(reviews[0].recap.impact.level, 'minor', 'a small global effect does not demand a dramatic presentation');
});
