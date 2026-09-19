import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { context, put, settle } from './helpers/oracle-v8-fixtures.mjs';

const M = loadEngine();
const names = [
  'Baron Strucker, HYDRA Overlord', 'Cosmic Crucible', "G'raha Tia, Scion Reborn",
  'Krile Baldesion', 'Emet-Selch of the Third Seat', "Puca's Covenant", 'The Reaper, King No More',
  'Screeching Scorchbeast', "Tidus, Yuna's Guardian", 'Ondu Spiritdancer',
  'Donal, Herald of Wings', 'Deep Gnome Terramancer', 'Pantlaza, Sun-Favored',
  'Ancient Cornucopia', 'Nykthos Paragon',
];
const named = (cards, name) => cards.filter(card => card.name === name).length;

function fixture(name, role) {
  const f = context(M, role), { game, a, b } = f;
  put(M, game, a, 'Vedalken Orrery');
  const source = put(M, game, a, name);
  const add = (name, zone = 'battlefield', owner = a) => put(M, game, owner, name, zone);
  const enter = async (name, owner = a) => game.putPermanentOntoBattlefield(add(name, 'hand', owner), owner);
  const cast = async name => {
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) a.pool[color] = 30;
    assert.equal(await game.castSpell(a, add(name, 'hand'), { from: 'hand' }), true);
  };
  let fire, result, alternate;
  if (name === 'Ancient Cornucopia') {
    fire = () => cast('Opt');
    result = () => a.life - 40;
  } else if (name === 'Nykthos Paragon') {
    const witness = add('Grizzly Bears');
    fire = () => game.gainLife(a, 1, source);
    result = () => witness.counters['+1/+1'] || 0;
  } else if (name.startsWith('Baron Strucker')) {
    fire = () => enter('Aerial Doombot');
    result = () => a.graveyard.length;
  } else if (name === 'Cosmic Crucible') {
    fire = () => cast('Sol Ring');
    result = () => game.bf().filter(c => c.isToken && c.name === 'Sol Ring').length;
  } else if (name.startsWith("G'raha")) {
    fire = () => cast('Sol Ring');
    result = () => game.creatures(a).filter(c => c.isToken && c.hasSub('Hero')).length;
  } else if (name === 'Krile Baldesion') {
    fire = async () => { add('Llanowar Elves', 'graveyard'); await cast('Sol Ring'); };
    alternate = () => add('Llanowar Elves', 'graveyard');
    result = () => named(a.hand, 'Llanowar Elves');
  } else if (name.startsWith('Emet-Selch')) {
    fire = async () => { add('Opt', 'graveyard'); a.pool.U = 30; await game.loseLife(b, 1, source); };
    alternate = () => add('Opt', 'graveyard');
    result = () => named(a.exile, 'Opt');
  } else if (name === "Puca's Covenant") {
    fire = async () => {
      add('Sol Ring', 'graveyard');
      const bear = add('Grizzly Bears'); bear.counters.charge = 1;
      await game.destroy(bear);
    };
    alternate = () => add('Sol Ring', 'graveyard');
    result = () => named(a.hand, 'Sol Ring');
  } else if (name.startsWith('The Reaper')) {
    fire = async () => {
      const bear = add('Grizzly Bears', 'battlefield', b); bear.counters['-1/-1'] = 1;
      await game.destroy(bear);
    };
    result = () => named(game.creatures(a), 'Grizzly Bears');
  } else if (name === 'Screeching Scorchbeast') {
    fire = async () => { add('Grizzly Bears', 'library', b); await game.mill(b, 1); };
    result = () => game.creatures(a).filter(c => c.isToken && c.hasSub('Zombie')).length;
  } else if (name.startsWith('Tidus')) {
    const bear = add('Grizzly Bears'); bear.counters['+1/+1'] = 1;
    fire = () => game.damageAny(bear, b, 1, { combat: true });
    result = () => a.hand.length;
  } else if (name === 'Ondu Spiritdancer') {
    fire = () => enter('Glorious Anthem');
    result = () => game.bf().filter(c => c.isToken && c.is('Enchantment')).length;
  } else if (name.startsWith('Donal')) {
    fire = () => cast('Shivan Dragon');
    result = () => game.creatures(a).filter(c => c.isToken).length;
  } else if (name.startsWith('Deep Gnome')) {
    fire = async () => { add('Plains', 'library'); await enter('Forest', b); };
    result = () => named(game.lands(a), 'Plains');
  } else {
    fire = async () => { add('Sol Ring', 'library'); await enter('Colossal Dreadmaw'); };
    result = () => named(a.hand, 'Sol Ring') + named(game.bf(), 'Sol Ring');
  }
  const choices = [];
  let decline = false;
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, q) => {
    if (role === 'human' && q.type === 'chooseCards' && q.from.some(c => c.zone === 'library')) return q.from.slice(0, 1);
    const offer = q.type === 'chooseOption' && q.options?.some(o => o.key === 'yes') &&
      q.options.some(o => o.key === 'no') &&
      (q.aiHint?.src === source || /Copy this spell with Donal\?|Search for a Plains\?|Discover now\?|Copy Glorious Anthem\?/.test(q.prompt));
    if (offer) {
      const answer = decline ? 'no' : role === 'human' ? 'yes' : await decide(g, q);
      choices.push({ q, answer });
      return answer;
    }
    return decide(g, q);
  };
  return { ...f, source, fire, result, alternate, choices, decline: value => { decline = value; } };
}

for (const role of ['human', 'ai']) for (const name of names) {
  test(`${role}: ${name} can decline, use a later trigger, and stop triggering after use`, async () => {
    const f = fixture(name, role);
    f.decline(true);
    await f.fire(); await settle(f.game);
    assert.equal(f.choices.length, 1, 'the first qualifying event offers the effect');
    assert.equal(f.result(), 0);
    f.decline(false);
    await f.fire(); await settle(f.game);
    assert.equal(f.choices.length, 2, 'declining must leave another opportunity this turn');
    assert.equal(f.result(), 1);
    await f.fire(); await f.game.flushTriggers();
    assert.equal(f.game.stack.filter(so => so.kind === 'trigger' && so.srcCard === f.source).length, 0,
      'CR 603.2h: the ability stops triggering after its optional action is taken');
    await settle(f.game);
    assert.equal(f.choices.length, 2);
    assert.equal(f.result(), 1);
    f.game.turnNo++; f.game.turnPlayer = f.b;
    await f.fire(); await settle(f.game);
    assert.equal(f.choices.length, 3, 'the next player turn permits the effect again');
    assert.equal(f.result(), 2);
  });

  test(`${role}: ${name} shares one use among queued and copied triggers`, async () => {
    const f = fixture(name, role);
    await f.fire(); await f.fire(); await f.game.flushTriggers();
    const triggers = f.game.stack.filter(so => so.kind === 'trigger' && so.srcCard === f.source);
    assert.ok(triggers.length, 'qualifying events produce a trigger');
    const target = f.alternate?.();
    await f.game.copyStackAbility(triggers.at(-1), f.a, target ? { forceTarget: target } : {});
    assert.equal(f.choices.length, 0, 'choice occurs only during resolution');
    await settle(f.game);
    assert.equal(f.choices.length, 1, 'used queued or copied triggers must not offer another choice');
    assert.equal(f.result(), 1, 'the optional effect happens only once');
  });
}

test('the once-on-use regression cases cover every such Oracle card in the catalog', () => {
  const actual = Object.values(M.DEFS).filter(d => /Do this only once each turn\./.test(d.oracle || '')).map(d => d.name).sort();
  assert.deepEqual(actual, [...names, 'Leonardo, the Balance'].sort());
});

for (const name of ['Welcoming Vampire', 'Tocasia\'s Welcome', 'Elvish Warmaster']) {
  test(`${name}: Panharmonicon cannot bypass an explicit trigger limit, but a trigger copy still resolves`, async () => {
    const f = context(M), { game, a } = f;
    const source = put(M, game, a, name);
    put(M, game, a, 'Panharmonicon');
    await game.makeTokens('elfWarrior', a, { n: 5 });
    await game.flushTriggers();
    const triggers = game.stack.filter(so => so.kind === 'trigger' && so.srcCard === source);
    assert.equal(triggers.length, 1);
    await game.copyStackAbility(triggers[0], a);
    await settle(game);
    if (name === 'Elvish Warmaster') assert.equal(game.creatures(a).filter(c => c.isToken).length, 7);
    else assert.equal(a.hand.length, 2, 'copying an ability is different from triggering it again');
  });
}

for (const name of names.filter(name => !name.startsWith('Pantlaza'))) {
  test(`${name}: a blink cannot let already-used old triggers consume the returned source's use`, async () => {
    const f = fixture(name, 'human');
    await f.fire(); await f.fire(); await f.game.flushTriggers();
    const trigger = f.game.stack.find(so => so.kind === 'trigger' && so.srcCard === f.source);
    const target = f.alternate?.();
    await f.game.copyStackAbility(trigger, f.a, target ? { forceTarget: target } : {});
    await f.game.resolveTop();
    await f.game.move(f.source, 'exile');
    await f.game.move(f.source, 'battlefield', { ctrl: f.a });
    await settle(f.game);
    assert.equal(f.choices.length, 1, 'old pending triggers retain their used state after the source returns');
    await f.fire(); await settle(f.game);
    assert.equal(f.choices.length, 2, 'the returned source has an independent use');
    assert.equal(f.result(), 2);
  });
}

test('Deep Gnome captures its use record when it triggers, before a blink and stack placement', async () => {
  const f = fixture('Deep Gnome Terramancer', 'human');
  await f.fire();
  assert.equal(f.game.stack.length, 0);
  await f.game.move(f.source, 'exile');
  await f.game.move(f.source, 'battlefield', { ctrl: f.a });
  await f.fire();
  await settle(f.game);
  assert.equal(f.choices.length, 2);
  assert.equal(f.result(), 2);
});

test('Emet-Selch retains its use after an offered spell cannot be paid for', async () => {
  const { game, a, b } = context(M);
  const source = put(M, game, a, 'Emet-Selch of the Third Seat');
  const spell = put(M, game, a, 'Divination', 'graveyard');
  await game.loseLife(b, 1, source); await settle(game);
  assert.equal(spell.zone, 'graveyard');
  a.pool.U = 1;
  await game.loseLife(b, 1, source); await settle(game);
  assert.equal(spell.zone, 'exile');
  assert.equal(a.hand.length, 2);
});

test("G'raha can pay zero life for a zero-mana spell, and it still consumes the turn's use", async () => {
  const { game, a } = context(M);
  put(M, game, a, "G'raha Tia, Scion Reborn");
  const chalice = put(M, game, a, 'Everflowing Chalice', 'hand');
  assert.equal(await game.castSpell(a, chalice, { from: 'hand' }), true);
  await settle(game);
  assert.equal(game.creatures(a).filter(c => c.isToken && c.hasSub('Hero')).length, 1);
  assert.equal(a.life, 40);
  a.pool.C = 1;
  assert.equal(await game.castSpell(a, put(M, game, a, 'Sol Ring', 'hand'), { from: 'hand' }), true);
  await settle(game);
  assert.equal(game.creatures(a).filter(c => c.isToken && c.hasSub('Hero')).length, 1);
});

test('Elvish Archivist has separate artifact and enchantment trigger limits even with Panharmonicon', async () => {
  const { game, a } = context(M);
  const archivist = put(M, game, a, 'Elvish Archivist');
  put(M, game, a, 'Panharmonicon');
  const token = { name: 'Artifact Enchantment', types: ['Artifact', 'Enchantment'], subtypes: [], super: [], cost: null, oracle: '', kws: [] };
  await game.makeTokens(token, a, { n: 5 }); await settle(game);
  assert.equal(archivist.counters['+1/+1'], 2);
  assert.equal(a.hand.length, 1);
  await game.makeTokens(token, a); await settle(game);
  assert.equal(archivist.counters['+1/+1'], 2);
  assert.equal(a.hand.length, 1);
});

test('Veyran cannot multiply Whispering Wizard, but can double the first-spell trigger of Valeria', async () => {
  const { game, a } = context(M);
  const wizard = put(M, game, a, 'Whispering Wizard');
  const valeria = put(M, game, a, 'Valeria Richards, Precocious');
  put(M, game, a, 'Veyran, Voice of Duality');
  a.pool.U = 2;
  assert.equal(await game.castSpell(a, put(M, game, a, 'Opt', 'hand'), { from: 'hand' }), true);
  assert.equal(game.stack.filter(so => so.srcCard === wizard).length, 1);
  assert.equal(game.stack.filter(so => so.srcCard === valeria).length, 2);
  await settle(game);
  assert.equal(a.hand.length, 3);
});

test('an imported first-target event can still trigger twice with Veyran', async () => {
  const { game, a } = context(M);
  const cub = put(M, game, a, 'Angelic Cub');
  put(M, game, a, 'Veyran, Voice of Duality');
  a.pool.G = 2;
  const castGrowth = () => game.castSpell(a, put(M, game, a, 'Giant Growth', 'hand'), { from: 'hand', quickTargets: [cub] });
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = (g, q) => q.type === 'chooseTargets' ? [cub] : decide(g, q);
  assert.equal(await castGrowth(), true); await settle(game);
  assert.equal(cub.counters['+1/+1'], 2);
  assert.equal(await castGrowth(), true); await settle(game);
  assert.equal(cub.counters['+1/+1'], 2);
});

test('Ainok Strike Leader triggers once for the attack group and again in another combat', async () => {
  const { game, a, b } = context(M);
  const source = put(M, game, a, 'Ainok Strike Leader');
  const commander = put(M, game, a, 'Grizzly Bears'); commander.commander = true;
  for (let combat = 1; combat <= 2; combat++) {
    await game.emit('attackersDeclared', { player: a, attackers: [{ card: source, target: b }, { card: commander, target: b }] });
    await settle(game);
    assert.equal(game.creatures(a).filter(c => c.isToken && c.hasSub('Goblin')).length, combat);
  }
});
