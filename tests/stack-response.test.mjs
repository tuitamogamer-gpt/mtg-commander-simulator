import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { priorityGame } from './helpers/load-engine.mjs';

function battlefieldCard(MTG, game, owner, name, commander = false) {
  const card = new MTG.CardInst(MTG.DEFS[name], owner);
  card.ctrl = owner;
  card.zone = 'battlefield';
  card.sick = false;
  card.tapped = false;
  card.commander = commander;
  game.battlefield.push(card);
  return card;
}

function handCard(MTG, owner, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], owner);
  card.zone = 'hand';
  owner.hand.push(card);
  return card;
}

test('Swords targeting a commander remains a visible stack target for a counterspell response', async () => {
  const { MTG, game, players: [human, opponent] } = priorityGame(['You', 'Opponent', 'Third', 'Fourth']);
  const commander = battlefieldCard(MTG, game, human, 'Riders of Gavony', true);
  battlefieldCard(MTG, game, opponent, 'Plains');
  battlefieldCard(MTG, game, human, 'Island');
  battlefieldCard(MTG, game, human, 'Island');
  const swords = handCard(MTG, opponent, 'Swords to Plowshares');
  const denial = handCard(MTG, human, 'Arcane Denial');
  game.turnPlayer = opponent;
  game.turnNo = 4;
  game.phase = 'main1';
  game.step = 'main';
  game.paced = false;
  game.recalc();
  game.priorityRound = async () => {};

  opponent.controller = {
    decide: async (_game, q) => q.type === 'chooseTargets' ? [commander] : null,
  };
  human.controller = {
    decide: async (_game, q) => q.type === 'chooseTargets'
      ? [q.candidates.find(candidate => candidate.card === swords)]
      : null,
  };

  assert.equal(await game.castSpell(opponent, swords, { from: 'hand' }), true);
  const swordsOnStack = game.stack.find(item => item.card === swords);
  assert.ok(swordsOnStack);
  assert.equal(swordsOnStack.targets[0], commander);

  const counterSpec = game.spellTargetSpecs(denial, { from: 'hand' }, human)[0];
  const counterTargets = game.legalTargets(counterSpec, denial, human);
  assert.equal(counterTargets.length, 1);
  assert.equal(counterTargets[0], swordsOnStack);

  assert.equal(await game.castSpell(human, denial, { from: 'hand' }), true);
  const denialOnStack = game.stack.at(-1);
  assert.equal(denialOnStack.card, denial);
  assert.equal(denialOnStack.targets[0], swordsOnStack);
  await game.resolveTop();

  assert.equal(swords.zone, 'graveyard');
  assert.equal(denial.zone, 'graveyard');
  assert.equal(commander.zone, 'battlefield');
  assert.ok(game.battlefield.includes(commander));
});

test('every visible stack surface selects a legal counter target instead of opening its card sheet', () => {
  const source = fs.readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
  const popup = source.slice(source.indexOf('renderStackPopup(g)'), source.indexOf('// ---------- desktop sidebar'));
  const sidebar = source.slice(source.indexOf('renderSidebar(g)'), source.indexOf('// COMMANDER DAMAGE'));
  const center = source.slice(source.indexOf('renderCenter(g)'), source.indexOf('// EDHLAB-style stacking'));
  for (const section of [popup, sidebar, center]) {
    assert.match(section, /isCandidate\(so\)[\s\S]{0,180}pickCandidate\(so\)/);
  }
});
