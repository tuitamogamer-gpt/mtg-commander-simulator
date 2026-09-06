import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { context, put, settle } from './helpers/oracle-v8-fixtures.mjs';
import { assertGameStateInvariants } from './helpers/game-state-invariants.mjs';

const M = loadEngine();
const totalMana = player => Object.values(player.pool).reduce((sum, n) => sum + n, 0);

async function cast(f, player, name, targets = []) {
  const card = put(M, f.game, player, name, 'hand');
  // A controlled legal main phase, with real casting costs and Stack objects.
  f.game.turnPlayer = player;
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) player.pool[color] = 20;
  const before = totalMana(player);
  assert.equal(await f.game.castSpell(player, card, { from: 'hand', quickTargets: targets }), true, name);
  assert.ok(totalMana(player) < before, `${name}: paid mana`);
  return card;
}

async function setup(role = 'human', exileChoice = 'cz') {
  const f = context(M, role);
  for (const player of f.game.players) if (!player.isAI) {
    const decide = player.controller.decide.bind(player.controller);
    player.controller.decide = (game, q) => q.type === 'chooseTargets' && q.quickTarget && q.candidates.includes(q.quickTarget)
      ? [q.quickTarget] : decide(game, q);
  }
  const prior = f.a.controller.decide.bind(f.a.controller);
  f.choices = [];
  f.a.controller.decide = async (game, q) => {
    if (q.aiHint?.kind === 'commanderZone') {
      f.choices.push({ zone: q.aiHint.toZone, version: q.aiHint.card.zoneVersion });
      assert.equal(game._stackResolutionDepth || 0, 0, 'choose only after the complete effect');
      assert.equal(q.aiHint.card.zone, q.aiHint.toZone);
      // Exercise the reported decision; other AI targets/options remain real.
      if (q.aiHint.toZone === 'graveyard') return 'stay';
      return role === 'ai' && exileChoice === 'cz' ? prior(game, q) : exileChoice;
    }
    return prior(game, q);
  };
  const zurgo = put(M, f.game, f.a, 'Zurgo Stormrender', 'command');
  zurgo.commander = true;
  zurgo.cmdCasts = 2;
  f.a.commanders.push(zurgo);
  f.a.pool.W = 1; f.a.pool.B = 1; f.a.pool.R = 1; f.a.pool.C = 4;
  assert.equal(await f.game.castSpell(f.a, zurgo, { from: 'command' }), true);
  assert.equal(totalMana(f.a), 0, 'third command cast pays the four-mana tax');
  await settle(f.game);
  assert.equal(zurgo.zone, 'battlefield');
  f.zurgo = zurgo;
  return f;
}

async function kill(f) {
  await cast(f, f.b, 'Murder', [f.zurgo]);
  await f.game.resolveTop();
  assert.equal(f.zurgo.zone, 'graveyard');
  assert.equal(f.a.graveyard.includes(f.zurgo), true);
  assert.equal(f.a.exile.includes(f.zurgo), false);
}

for (const role of ['human', 'ai']) {
  for (const trigger of ['enters', 'attacks']) {
    test(`${role}: taxed Zurgo stays in the graveyard and Sun Titan ${trigger} returns him`, async () => {
      const f = await setup(role);
      let titan;
      if (trigger === 'attacks') {
        titan = await cast(f, f.a, 'Sun Titan');
        await settle(f.game);
      }
      await kill(f);
      const version = f.zurgo.zoneVersion;
      assert.equal(f.zurgo.mv, 3, 'commander tax does not change mana value');
      await f.game.checkSBA();
      assert.equal(f.choices.length, 1, 'staying does not repeat the choice');
      if (trigger === 'enters') {
        titan = await cast(f, f.a, 'Sun Titan');
        await f.game.resolveTop();
      } else {
        f.game.turnPlayer = f.a;
        titan.sick = false;
        const prior = f.a.controller.decide.bind(f.a.controller);
        if (role === 'human') f.a.controller.decide = (g, q) => q.type === 'attackers'
          ? [{ card: titan, target: f.b }] : prior(g, q);
        let announced = false;
        f.game.priorityRound = async () => {
          const ability = f.game.stack.find(so => so.srcCard === titan);
          if (ability) { announced = true; assert.equal(ability.targets[0], f.zurgo); }
          await settle(f.game);
        };
        await f.game.combatPhase(f.a);
        assert.equal(announced, true, 'real attacker declaration creates the return trigger');
      }
      if (trigger === 'enters') {
        assert.equal(f.game.stack.at(-1).targets[0], f.zurgo);
        await settle(f.game);
      }
      assert.equal(f.zurgo.zone, 'battlefield');
      assert.equal(f.zurgo.zoneVersion, version + 1);
      assert.equal(f.zurgo.ctrl, f.a);
      assert.equal(f.zurgo.cmdCasts, 3, 'reanimation is not a commander cast');
      assert.equal(f.a.graveyard.includes(f.zurgo), false);
      assert.equal(f.a.exile.includes(f.zurgo), false);
      assertGameStateInvariants(f.game);
    });
  }

  for (const exileChoice of ['cz', 'stay']) {
    test(`${role}: Mari exiles the graveyard Zurgo and offers a fresh ${exileChoice} choice`, async () => {
      const f = await setup(role, exileChoice);
      await cast(f, f.b, 'Mari, the Killing Quill');
      await settle(f.game);
      await kill(f);
      const version = f.zurgo.zoneVersion;
      assert.equal(f.game.stack.at(-1).srcCard.name, 'Mari, the Killing Quill');
      await settle(f.game);
      assert.deepEqual(f.choices.map(choice => choice.zone), ['graveyard', 'exile']);
      assert.equal(f.zurgo.zone, exileChoice === 'cz' ? 'command' : 'exile');
      assert.equal(f.zurgo.zoneVersion, version + (exileChoice === 'cz' ? 2 : 1));
      assert.equal(f.zurgo.counters.hit || 0, exileChoice === 'cz' ? 0 : 1);
      assert.equal(f.zurgo.cmdCasts, 3);
      await cast(f, f.a, 'Sun Titan');
      await settle(f.game);
      assert.equal(f.zurgo.zone, exileChoice === 'cz' ? 'command' : 'exile', 'Titan cannot return an exiled commander');
      await f.game.checkSBA();
      assert.equal(f.choices.length, 2);
      assertGameStateInvariants(f.game);
    });
  }

  for (const sourceName of ['Soul-Guide Lantern', 'Scavenger Grounds', 'Ultimate Nullification']) {
    test(`${role}: ${sourceName} offers a new command choice after exiling the graveyard`, async () => {
      const f = await setup(role);
      let source;
      if (sourceName === 'Soul-Guide Lantern') {
        source = await cast(f, f.b, sourceName);
        await settle(f.game); // Empty graveyards: the ETB has no legal target.
      }
      await kill(f);
      const version = f.zurgo.zoneVersion;
      const other = put(M, f.game, f.a, 'Sol Ring', 'graveyard');
      if (sourceName === 'Ultimate Nullification') {
        await cast(f, f.b, 'Captain America, Team Leader');
        await settle(f.game);
        const spell = await cast(f, f.b, sourceName);
        await settle(f.game);
        assert.equal(spell.zone, 'library');
      } else {
        if (sourceName === 'Scavenger Grounds') {
          source = put(M, f.game, f.b, sourceName, 'hand');
          f.game.turnPlayer = f.b;
          assert.equal(await f.game.playLand(f.b, source), true);
        }
        const ability = f.game.activatableList(f.b).find(action => action.card === source && /exile.*graveyards/.test(action.ability.label));
        assert.ok(ability);
        assert.equal(await f.game.activateAbility(f.b, ability), true);
        assert.equal(source.zone, 'graveyard', 'activation sacrifice paid');
        await settle(f.game);
      }
      assert.equal(f.zurgo.zone, 'command');
      assert.equal(f.zurgo.zoneVersion, version + 2);
      assert.deepEqual(f.choices.map(choice => choice.zone), ['graveyard', 'exile']);
      assert.equal(other.zone, 'exile');
      assertGameStateInvariants(f.game);
    });
  }
}

test('an older Mari death trigger cannot exile Zurgo after Sun Titan returns him and he dies again', async () => {
  const f = await setup();
  const titan = await cast(f, f.a, 'Sun Titan');
  await settle(f.game);
  const mari = await cast(f, f.b, 'Mari, the Killing Quill');
  await settle(f.game);
  await kill(f);
  const oldTrigger = f.game.stack.at(-1);
  await cast(f, f.a, 'Cloudshift', [titan]);
  await f.game.resolveTop();
  assert.equal(f.game.stack.at(-1).srcCard, titan);
  await f.game.resolveTop();
  assert.equal(f.zurgo.zone, 'battlefield');
  assert.equal(f.game.stack.at(-1), oldTrigger);
  await cast(f, f.a, 'Murder', [mari]);
  await f.game.resolveTop();
  await kill(f);
  assert.equal(f.game.stack.at(-1), oldTrigger);
  await settle(f.game);
  assert.equal(f.zurgo.zone, 'graveyard', 'the old death trigger cannot find the new graveyard object');
  assert.equal(f.zurgo.counters.hit || 0, 0);
  assert.deepEqual(f.choices.map(choice => choice.zone), ['graveyard', 'graveyard']);
  assertGameStateInvariants(f.game);
});
