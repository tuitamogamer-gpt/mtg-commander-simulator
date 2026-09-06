import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();
const mana = player => Object.values(player.pool).reduce((sum, n) => sum + n, 0);
const fund = player => { for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) player.pool[color] = 25; };

function fixture(difficulty) {
  const f = context(M, 'ai', 3);
  const choices = [];
  for (const player of f.game.players) {
    if (player !== f.b) {
      player.isAI = true;
      player.controller = new M.AIController(player, {difficulty, style: 'balanced'});
    }
    const decide = player.controller.decide.bind(player.controller);
    player.controller.decide = async (game, query) => {
      const result = await decide(game, query);
      if (query.aiHint?.kind === 'commanderZone') choices.push({player, query, result});
      return result;
    };
    fund(player);
  }
  return {...f, choices};
}

for (const difficulty of ['easy', 'normal', 'hard']) {
  for (const spellName of ['Unsummon', 'Cyclonic Rift']) {
    test(`${difficulty}: ${spellName} keeps commanders in hand and recasts without commander tax`, async () => {
      const f = fixture(difficulty);
      const commander = put(M, f.game, f.a, 'Captain America, Team Leader', 'command');
      commander.commander = true;
      commander.cmdCasts = 2;
      f.a.commanders.push(commander);
      const initialMana = mana(f.a);
      assert.equal(await f.game.castSpell(f.a, commander, {from: 'command'}), true);
      await settle(f.game);
      assert.equal(initialMana - mana(f.a), 7, 'the command-zone cast pays four extra mana');
      assert.equal(commander.cmdCasts, 3);

      const others = f.game.players.filter(player => player !== f.a).map(player => {
        const card = put(M, f.game, player, 'Captain America, Team Leader');
        card.commander = true;
        player.commanders.push(card);
        return card;
      });
      const spell = put(M, f.game, f.b, spellName, 'hand');
      const opts = {from: 'hand', quickTargets: [commander]};
      if (spellName === 'Cyclonic Rift') {
        const offer = f.game.castableList(f.b).find(row => row.card === spell && row.alt?.overloaded);
        assert.ok(offer, 'the engine offers a legal overload cast');
        opts.alt = offer.alt;
        delete opts.quickTargets;
      }
      const beforeBounce = mana(f.b);
      assert.equal(await f.game.castSpell(f.b, spell, opts), true);
      assert.equal(beforeBounce - mana(f.b), spellName === 'Cyclonic Rift' ? 7 : 1);
      assert.equal(f.game.stack.at(-1).targets.length, spellName === 'Cyclonic Rift' ? 0 : 1);
      if (spellName === 'Unsummon') assert.equal(f.game.stack.at(-1).targets[0], commander);
      await settle(f.game);
      assert.equal(commander.zone, 'hand');
      assert.equal(f.choices.length, spellName === 'Cyclonic Rift' ? 3 : 1);
      for (const {query, result} of f.choices) {
        assert.equal(query.aiHint.toZone, 'hand');
        assert.deepEqual(Array.from(query.options, option => option.label), ['Command zone', 'Hand']);
        assert.equal(result, 'stay');
      }
      for (const card of others) {
        assert.equal(card.zone, spellName === 'Cyclonic Rift' && card.owner !== f.b ? 'hand' : 'battlefield');
      }

      fund(f.a);
      const beforeRecast = mana(f.a);
      assert.ok(f.game.castableList(f.a).some(row => row.card === commander && row.from === 'hand'));
      assert.equal(await f.game.castSpell(f.a, commander, {from: 'hand'}), true);
      await settle(f.game);
      assert.equal(beforeRecast - mana(f.a), 3, 'the hand cast pays only the printed cost');
      assert.equal(commander.cmdCasts, 3, 'casting from hand does not increase future commander tax');
      assert.equal(commander.zone, 'battlefield');
      assert.equal(f.game.diedThisTurn.length, 0);
      assert.equal(f.game.log.some(row => /AI V2 fallback/.test(row.msg)), false);
      assertGameStateInvariants(f.game);
    });
  }

  for (const zone of ['graveyard', 'exile', 'library']) {
    test(`${difficulty}: the hand preference does not keep a commander in ${zone}`, async () => {
      const f = fixture(difficulty);
      const commander = put(M, f.game, f.a, 'Captain America, Team Leader');
      commander.commander = true;
      f.a.commanders.push(commander);
      await f.game.move(commander, zone);
      await f.game.checkSBA();
      assert.equal(commander.zone, 'command');
      assert.equal(f.choices.length, 1);
      assert.equal(f.choices[0].query.aiHint.toZone, zone);
      assert.equal(f.choices[0].result, 'cz');
      assertGameStateInvariants(f.game);
    });
  }
}

test('the fallback controller also returns a bounced commander to hand', async () => {
  const f = fixture('easy');
  f.a.controller.decide = async (game, query) => f.a.controller.chooseOption(game, query);
  const commander = put(M, f.game, f.a, 'Captain America, Team Leader');
  commander.commander = true;
  f.a.commanders.push(commander);
  await f.game.move(commander, 'hand');
  assert.equal(commander.zone, 'hand');
  assertGameStateInvariants(f.game);
});
