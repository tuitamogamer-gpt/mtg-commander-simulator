import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
function fixture(role) {
  const g = new M.Game({seed: 951121, paced: false});
  const a = g.addPlayer('Actor', {name: 'Test'}, null, role === 'ai');
  const b = g.addPlayer('Opponent', {name: 'Test'}, null, false);
  g.turnPlayer = a; g.turnNo = 30; g.phase = 'main1'; g.step = 'main';
  g.priorityRound = async () => {};
  const trace = [];
  const answer = q => q.type === 'chooseCards' ? q.from.slice(0, q.min || 0)
    : q.type === 'chooseTargets' ? q.candidates.slice(0, q.min || 0)
    : q.type === 'chooseOption' ? q.options[0]?.key
    : q.type === 'chooseManaSources' ? {cards: q.suggested}
    : q.type === 'orderTriggers' ? q.triggers
    : q.type === 'priority' ? {kind: 'pass'} : null;
  const ai = new M.AIController(a, {difficulty: 'easy', style: 'opportunist'});
  a.controller = {decide: async (game, q) => {
    trace.push(q); return role === 'ai' ? ai.decide(game, q) : answer(q);
  }};
  b.controller = {decide: async (game, q) => answer(q)};
  const put = (name, zone = 'library', owner = a) => {
    assert.ok(M.DEFS[name], name);
    const c = new M.CardInst(M.DEFS[name], owner); c.zone = zone;
    if (zone === 'battlefield') g.battlefield.push(c); else owner[zone].push(c);
    return c;
  };
  for (const p of [a,b]) for (let i = 0; i < 12; i++) put('Forest', 'library', p);
  return {g,a,b,put,trace};
}
const clearMana = p => {for (const key of Object.keys(p.pool)) p.pool[key] = 0;};
async function settle(g) {
  let n = 0;
  while (g.pendingTriggers.length || g.stack.length) {
    assert.ok(++n < 80, 'bounded trigger/Stack completion');
    await g.flushTriggers(); if (g.stack.length) await g.resolveTop();
  }
}
async function cast(f, name, target, player = f.a) {
  const card = f.put(name, 'hand', player);
  for (const key of Object.keys(player.pool)) player.pool[key] = 20;
  const decide = player.controller.decide;
  player.controller.decide = async (game,q) => q.type === 'chooseTargets' && target && q.candidates.includes(target)
    ? [target] : decide(game,q);
  assert.equal(await f.g.castSpell(player,card),true, `${name}: paid cast`);
  player.controller.decide = decide;
  await settle(f.g); return card;
}
async function broodshipFixture(role, name = 'Groundskeeper') {
  const f = fixture(role);
  f.ship = await cast(f,'Exploration Broodship');
  const stationer = await cast(f,'Gigantosaurus');
  const decide = f.a.controller.decide;
  f.a.controller.decide = async (g,q) => q.type === 'chooseCards' && q.from.includes(stationer)
    ? [stationer] : decide(g,q);
  const station = f.g.activatableList(f.a).find(entry => entry.card === f.ship && entry.ability?.label.startsWith('Station'));
  assert.ok(station, 'available paid Station ability');
  assert.equal(await f.g.activateAbility(f.a,station),true,'real Station activation');
  f.a.controller.decide = decide;
  await settle(f.g);
  assert.ok(f.ship.counters.charge >= 8);
  assert.equal(stationer.tapped,true);
  f.card = f.put(name,'graveyard'); f.land = f.put('Forest','battlefield');
  f.g.recalc(); clearMana(f.a);
  return f;
}
function offer(f, flag) {
  const entry = f.g.castableList(f.a).find(row => row.card === f.card &&
    row.alt?.[flag]);
  assert.ok(entry, `actual ${flag} offer`); return entry;
}
async function response(f,name,object) {
  const card = f.put(name,'hand',f.b); clearMana(f.b);
  if (name === 'Counterspell') f.b.pool.U = 2;
  else {f.b.pool.W = 1; f.b.pool.C = 1;}
  assert.equal(await f.g.castSpell(f.b,card),true);
  assert.equal(f.g.stack.at(-1).targets[0],object);
  assert.equal(f.g.stack.at(-1).manaSpent,2);
  await f.g.resolveTop();
  assert.equal(card.zone,'graveyard');
}

test('native permissions retain the exact printed source meaning', () => {
  assert.equal(M.DEFS.Gravecrawler.oracle,"This creature can't block.\nYou may cast this card from your graveyard as long as you control a Zombie.");
  assert.match(M.DEFS['Exploration Broodship'].oracle,/Once during each of your turns, you may cast a permanent spell from your graveyard by sacrificing a land in addition to paying its other costs\./);
});

for (const role of ['human','ai']) {
  for (const name of ['Counterspell','Reprieve']) {
    test(`${role}: paid Gravecrawler has a normal Stack exit under ${name}`,async () => {
      const f = fixture(role); await cast(f,'Gravecrawler');
      f.card = f.put('Gravecrawler','graveyard'); clearMana(f.a); f.a.pool.B = 1;
      const entry = offer(f,'gravecrawler');
      assert.equal(await f.g.castSpell(f.a,f.card,{from:entry.from,alt:entry.alt}),true);
      const object = f.g.stack.at(-1); assert.equal(object.manaSpent,1);
      await response(f,name,object);
      assert.equal(f.card.zone,name === 'Counterspell' ? 'graveyard' : 'hand');
      assert.equal(!!object.castOpts.flashback,false);
      assert.equal(f.card.def,M.DEFS.Gravecrawler);
      if (name === 'Counterspell') {f.a.pool.B = 1; assert.ok(offer(f,'gravecrawler'));}
    });
    test(`${role}: paid Broodship ${name} preserves the paid land and turn use`,async () => {
      const f = await broodshipFixture(role); f.a.pool.G = 1;
      const entry = offer(f,'broodship');
      assert.equal(await f.g.castSpell(f.a,f.card,{from:entry.from,alt:entry.alt}),true);
      const object = f.g.stack.at(-1); assert.equal(object.manaSpent,1);
      assert.equal(f.land.zone,'graveyard');
      await response(f,name,object);
      assert.equal(f.card.zone,name === 'Counterspell' ? 'graveyard' : 'hand');
      assert.equal(f.card.def,M.DEFS.Groundskeeper);
      assert.equal(!!object.castOpts.flashback,false);
      assert.equal(f.ship.meta._broodshipCastTurn,f.g.turnNo);
      f.put('Forest','battlefield'); f.a.pool.G = 1; f.g.recalc();
      assert.equal(f.g.castableList(f.a).some(row => row.card === f.card && row.alt?.broodship),false);
    });
  }

  test(`${role}: Gravecrawler requires a current Zombie and ordinary creature timing`,async () => {
    const f = fixture(role); f.card = f.put('Gravecrawler','graveyard'); f.a.pool.B = 1;
    assert.equal(f.g.castableList(f.a).some(row => row.card === f.card),false);
    const zombie = await cast(f,'Gravecrawler'); clearMana(f.a); f.a.pool.B = 1;
    const entry = offer(f,'gravecrawler');
    f.g.turnPlayer = f.b;
    assert.equal(await f.g.castSpell(f.a,f.card,{from:entry.from,alt:entry.alt}),false);
    f.g.turnPlayer = f.a; await cast(f,'Murder',zombie); clearMana(f.a); f.a.pool.B = 1;
    assert.equal(await f.g.castSpell(f.a,f.card,{from:entry.from,alt:entry.alt}),false);
    assert.equal(f.card.zone,'graveyard'); assert.equal(f.a.pool.B,1);
  });
  test(`${role}: the Zombie can leave after Gravecrawler was legally cast`,async () => {
    const f = fixture(role); const zombie = await cast(f,'Gravecrawler');
    f.card = f.put('Gravecrawler','graveyard'); clearMana(f.a); f.a.pool.B = 1;
    const entry = offer(f,'gravecrawler');
    assert.equal(await f.g.castSpell(f.a,f.card,{from:entry.from,alt:entry.alt}),true);
    await cast(f,'Murder',zombie,f.b);
    assert.equal(f.card.zone,'battlefield'); assert.equal(zombie.zone,'graveyard');
    assert.equal(f.card.cur.cantBlock,true);
  });
  test(`${role}: Broodship can tap its chosen Forest for mana before sacrificing it`,async () => {
    const f = await broodshipFixture(role), entry = offer(f,'broodship');
    assert.equal(await f.g.castSpell(f.a,f.card,{from:entry.from,alt:entry.alt}),true);
    const object = f.g.stack.at(-1);
    assert.equal(object.manaSpent,1); assert.equal(f.land.zone,'graveyard');
    assert.equal(object.sacdN,1);
    await settle(f.g); assert.equal(f.card.zone,'battlefield');
    assert.equal(f.card.def,M.DEFS.Groundskeeper);
  });
  test(`${role}: Broodship X affordability cannot sacrifice the same Crystal Vein for mana`,async () => {
    const f = await broodshipFixture(role,'Stonecoil Serpent');
    await f.g.move(f.land,'hand'); f.land = f.put('Crystal Vein','battlefield'); f.g.recalc();
    const entry = offer(f,'broodship');
    const maxX = f.g.maxAffordableX(f.a,f.g.spellCost(f.a,f.card,entry.alt),f.card,{castOpts:entry.alt});
    assert.equal(maxX,1,'one tap mana is available; the sacrifice mana competes with the casting cost');
    assert.equal(await f.g.castSpell(f.a,f.card,{from:entry.from,alt:entry.alt,xVal:maxX}),true);
    assert.equal(f.g.stack.at(-1).manaSpent,1); assert.equal(f.land.zone,'graveyard');
    await settle(f.g); assert.equal(f.card.zone,'battlefield'); assert.equal(f.card.counters['+1/+1'],1);
  });
  test(`${role}: a Broodship land choice with stale mana consumes neither land nor turn`,async () => {
    const f = await broodshipFixture(role); f.land.tapped = true; f.a.pool.G = 1;
    const entry = offer(f,'broodship'), decide = f.a.controller.decide;
    f.a.controller.decide = async (g,q) => {
      const answer = await decide(g,q);
      if (q.prompt?.startsWith('Exploration Broodship: sacrifice')) clearMana(f.a);
      return answer;
    };
    assert.equal(await f.g.castSpell(f.a,f.card,{from:entry.from,alt:entry.alt}),false);
    assert.equal(f.land.zone,'battlefield'); assert.equal(f.card.zone,'graveyard');
    assert.notEqual(f.ship.meta._broodshipCastTurn,f.g.turnNo);
  });
  test(`${role}: a Broodship cast with no available mana consumes no resources`,async () => {
    const f = await broodshipFixture(role); f.land.tapped = true;
    const alt = {flashback:true,...f.card.def.flashback};
    assert.equal(f.g.castableList(f.a).some(row => row.card === f.card),false);
    assert.equal(await f.g.castSpell(f.a,f.card,{from:'graveyard',alt}),false);
    assert.equal(f.land.zone,'battlefield'); assert.equal(f.card.zone,'graveyard');
    assert.notEqual(f.ship.meta._broodshipCastTurn,f.g.turnNo);
  });
  test(`${role}: a Broodship selected land incarnation cannot be replaced during choice`,async () => {
    const f = await broodshipFixture(role); f.a.pool.G = 1;
    const entry = offer(f,'broodship'), decide = f.a.controller.decide;
    f.a.controller.decide = async (g,q) => {
      const answer = await decide(g,q);
      if (q.prompt?.startsWith('Exploration Broodship: sacrifice')) {
        await g.move(f.land,'exile'); await g.move(f.land,'battlefield',{ctrl:f.a});
      }
      return answer;
    };
    assert.equal(await f.g.castSpell(f.a,f.card,{from:entry.from,alt:entry.alt}),false);
    assert.equal(f.land.zone,'battlefield'); assert.equal(f.a.pool.G,1);
    assert.notEqual(f.ship.meta._broodshipCastTurn,f.g.turnNo);
  });
  test(`${role}: Broodship excludes opponents' turns even for a flash creature`,async () => {
    const f = await broodshipFixture(role,'Ambush Viper'); f.a.pool.G = 1; f.a.pool.C = 1;
    const entry = offer(f,'broodship'); f.g.turnPlayer = f.b;
    assert.equal(f.g.castableList(f.a).some(row => row.card === f.card && row.alt?.broodship),false);
    assert.equal(await f.g.castSpell(f.a,f.card,{from:entry.from,alt:entry.alt}),false);
    assert.equal(f.land.zone,'battlefield');
  });
  test(`${role}: Broodship's grant expires on reanimation before a later death`,async () => {
    const f = await broodshipFixture(role);
    await cast(f,'Zombify',f.card); assert.equal(f.card.def,M.DEFS.Groundskeeper);
    await cast(f,'Disenchant',f.ship); await cast(f,'Murder',f.card);
    assert.equal(f.card.zone,'graveyard'); assert.equal(f.card.def,M.DEFS.Groundskeeper);
    assert.equal(f.g.castableList(f.a).some(row => row.card === f.card),false);
  });
  for (const mutation of ['phased','controller','counters','ability-loss']) {
    test(`${role}: a cached Broodship offer cannot survive ${mutation} loss of its permission`,async () => {
      const f = await broodshipFixture(role); f.a.pool.G = 1;
      const entry = offer(f,'broodship');
      if (mutation === 'phased') await f.g.phaseOut(f.ship);
      if (mutation === 'controller') {f.ship.ctrl = f.b; f.g.recalc();}
      if (mutation === 'counters') await f.g.removeCounters(f.ship,'charge',f.ship.counters.charge);
      if (mutation === 'ability-loss') await cast(f,'Darksteel Mutation',f.ship);
      clearMana(f.a); f.a.pool.G = 1;
      assert.equal(await f.g.castSpell(f.a,f.card,{from:entry.from,alt:entry.alt}),false);
      assert.equal(f.land.zone,'battlefield'); assert.equal(f.card.zone,'graveyard');
      assert.equal(f.a.pool.G,1); assert.notEqual(f.ship.meta._broodshipCastTurn,f.g.turnNo);
    });
  }
  test(`${role}: Broodship can grant Gravecrawler without an unrelated Zombie prerequisite`,async () => {
    const f = await broodshipFixture(role,'Gravecrawler'); f.a.pool.B = 1;
    const entry = offer(f,'broodship');
    assert.equal(await f.g.castSpell(f.a,f.card,{from:entry.from,alt:entry.alt}),true);
    await settle(f.g); assert.equal(f.card.zone,'battlefield');
    assert.equal(f.card.def,M.DEFS.Gravecrawler);
  });
}

test('manual mana cancellation does not sacrifice the Broodship land',async () => {
  const f = await broodshipFixture('human'); f.a.manualMana = true;
  const entry = offer(f,'broodship'), decide = f.a.controller.decide;
  f.a.controller.decide = async (g,q) => q.type === 'chooseManaSources' ? null : decide(g,q);
  assert.equal(await f.g.castSpell(f.a,f.card,{from:entry.from,alt:entry.alt}),false);
  assert.equal(f.land.zone,'battlefield'); assert.equal(f.land.tapped,false);
  assert.notEqual(f.ship.meta._broodshipCastTurn,f.g.turnNo);
});

test('declining the Broodship land selection consumes no cost',async () => {
  const f = await broodshipFixture('human'); f.a.pool.G = 1;
  const entry = offer(f,'broodship'), decide = f.a.controller.decide;
  f.a.controller.decide = async (g,q) => q.prompt?.startsWith('Exploration Broodship: sacrifice') ? [] : decide(g,q);
  assert.equal(await f.g.castSpell(f.a,f.card,{from:entry.from,alt:entry.alt}),false);
  assert.equal(f.land.zone,'battlefield'); assert.equal(f.land.tapped,false); assert.equal(f.a.pool.G,1);
  assert.notEqual(f.ship.meta._broodshipCastTurn,f.g.turnNo);
});
