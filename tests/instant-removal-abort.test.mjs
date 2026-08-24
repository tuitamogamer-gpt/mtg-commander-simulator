import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { priorityGame } from './helpers/load-engine.mjs';

function cardInHand(MTG, owner, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], owner);
  card.zone = 'hand';
  owner.hand.push(card);
  return card;
}

function permanent(MTG, game, owner, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], owner);
  card.ctrl = owner;
  card.zone = 'battlefield';
  card.sick = false;
  card.tapped = false;
  game.battlefield.push(card);
  return card;
}

test('normal creature removal cannot target a creature spell, then can target it after resolution', async () => {
  const { MTG, game, players: [human, opponent] } = priorityGame(['Human', 'Opponent']);
  const swords = cardInHand(MTG, human, 'Swords to Plowshares');
  const creature = cardInHand(MTG, opponent, 'Ainok Bond-Kin');
  permanent(MTG, game, human, 'Plains');
  game.turnPlayer = opponent;
  game.turnNo = 4;
  game.phase = 'main1';
  game.step = 'main';
  game.paced = false;
  game.recalc();
  game.priorityRound = async () => {};

  assert.equal(await game.castSpell(opponent, creature, { free: true, from: 'hand' }), true);
  const creatureSpell = game.stack.at(-1);
  assert.equal(creatureSpell.card, creature);
  assert.equal(creature.zone, 'stack');

  const removalSpec = game.spellTargetSpecs(swords, { from: 'hand' }, human)[0];
  assert.ok(!game.legalTargets(removalSpec, swords, human).includes(creatureSpell));
  assert.ok(!game.castableList(human).some(entry => entry.card === swords),
    'removal with no battlefield creature target must not be offered against only a creature spell');

  await game.resolveTop();
  assert.equal(creature.zone, 'battlefield');
  assert.ok(game.legalTargets(removalSpec, swords, human).includes(creature));
  assert.ok(game.castableList(human).some(entry => entry.card === swords),
    'instant removal becomes a legal response option after the creature resolves and priority continues');
});

test('Abort cast during target selection preserves the card, mana, stack, and cast count', async () => {
  const { MTG, game, players: [human, opponent] } = priorityGame(['Human', 'Opponent']);
  const swords = cardInHand(MTG, human, 'Swords to Plowshares');
  const plains = permanent(MTG, game, human, 'Plains');
  permanent(MTG, game, opponent, 'Ainok Bond-Kin');
  game.turnPlayer = opponent;
  game.turnNo = 4;
  game.phase = 'main1';
  game.step = 'main';
  game.paced = false;
  game.recalc();

  let targetQuestion = null;
  human.controller = {
    decide: async (_game, question) => {
      if (question.type === 'chooseTargets') {
        targetQuestion = question;
        return { kind: 'cancel' };
      }
      return null;
    },
  };

  assert.equal(await game.castSpell(human, swords, { from: 'hand' }), false);
  assert.equal(targetQuestion.cancelable, true);
  assert.equal(swords.zone, 'hand');
  assert.ok(human.hand.includes(swords));
  assert.equal(plains.tapped, false);
  assert.equal(game.stack.length, 0);
  assert.equal(human.turnState.spellsCast, 0);
  assert.match(game.log.at(-1).msg, /casting cancelled/i);
});

test('target and priority UI explain the rule and expose a pre-payment abort', () => {
  const ui = fs.readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /still a creature <i>spell<\/i> on the Stack, not a creature on the battlefield/);
  assert.match(ui, /normal “target creature” removal can target it only after it enters the battlefield/);
  assert.match(ui, /CREATURE SPELL — NOT ON THE BATTLEFIELD YET/);
  assert.match(ui, /Normal “target creature” removal cannot select it on the Stack/);
  assert.match(ui, /Abort cast ↩/);
  assert.match(ui, /No mana or other cost has been paid yet/);
});
