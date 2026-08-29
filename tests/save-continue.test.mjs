import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

const mainSource = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
const accountSource = readFileSync(new URL('../src/account.js', import.meta.url), 'utf8');
const accountApiSource = readFileSync(new URL('../api/account.js', import.meta.url), 'utf8');
const accountCss = readFileSync(new URL('../src/public-menu.css', import.meta.url), 'utf8');

test('portable Solo decisions restore by legal-list position instead of unstable card instance ids', () => {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 29, paced: false });
  const player = game.addPlayer('You', MTG.DECKS['Quandrix Unlimited'], null, false);
  const first = new MTG.CardInst(MTG.DEFS.Cultivate, player);
  const second = new MTG.CardInst(MTG.DEFS['Arcane Signet'], player);
  player.hand = [first, second];

  const choose = { type: 'chooseCards', prompt: 'Choose a card', from: player.hand, min: 1, max: 1 };
  const recorded = MTG.recordSaveDecision(choose, player, [second]);
  assert.equal(recorded.response.kind, 'indexes');
  assert.equal(recorded.response.values.join(','), '1');

  const restoredPlayer = new MTG.Player('You', 0);
  const differentIdFirst = new MTG.CardInst(MTG.DEFS.Cultivate, restoredPlayer);
  const differentIdSecond = new MTG.CardInst(MTG.DEFS['Arcane Signet'], restoredPlayer);
  restoredPlayer.hand = [differentIdFirst, differentIdSecond];
  const restored = MTG.restoreSaveDecision({ ...choose, from: restoredPlayer.hand }, restoredPlayer, recorded);
  assert.equal(restored[0], differentIdSecond);
  assert.notEqual(second.iid, differentIdSecond.iid);
});

test('portable decision history covers actions, combat assignments, scry order, and version mismatch protection', () => {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 30, paced: false });
  const you = game.addPlayer('You', MTG.DECKS['Quandrix Unlimited'], null, false);
  const opponent = game.addPlayer('Opponent', MTG.DECKS['Elven Council'], null, false);
  const spell = new MTG.CardInst(MTG.DEFS.Cultivate, you);
  const attacker = new MTG.CardInst(MTG.DEFS['Zimone, Infinite Analyst'], you);
  const main = { type: 'main', casts: [{ card: spell, from: 'hand' }], acts: [], lands: [] };
  const mainRecord = MTG.recordSaveDecision(main, you, { kind: 'cast', card: spell, from: 'hand' });
  assert.equal(MTG.restoreSaveDecision(main, you, mainRecord).card, spell);

  const attack = { type: 'attackers', eligible: [attacker], attackTargets: [opponent], opponents: [opponent], forced: [] };
  const attackRecord = MTG.recordSaveDecision(attack, you, [{ card: attacker, target: opponent }]);
  assert.equal(JSON.stringify(attackRecord.response.values), JSON.stringify([{ left: 0, right: 0 }]));
  assert.equal(MTG.restoreSaveDecision(attack, you, attackRecord)[0].target, opponent);

  const scry = { type: 'scry', cards: [spell, attacker] };
  const scryRecord = MTG.recordSaveDecision(scry, you, { top: [attacker], bottom: [spell] });
  const restoredScry = MTG.restoreSaveDecision(scry, you, scryRecord);
  assert.equal(restoredScry.top[0], attacker);
  assert.equal(restoredScry.bottom[0], spell);
  assert.throws(() => MTG.restoreSaveDecision({ ...main, lands: [spell] }, you, mainRecord), /no longer matches this version/);
});

test('manual table corrections use stable card references and replay without saved instance ids', async () => {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 32, paced: false });
  const you = game.addPlayer('You', MTG.DECKS['Quandrix Unlimited'], null, false);
  const card = new MTG.CardInst(MTG.DEFS.Cultivate, you);
  card.zone = 'battlefield'; card.ctrl = you;
  game.battlefield.push(card);
  game.lastResortPaused = true;
  const saved = MTG.portableAccountSideAction(game, you, {
    type: 'lastResort', action: { type: 'moveCard', cardToken: `c:${card.iid}`, toZone: 'graveyard', playerSeat: you.idx },
  });
  assert.equal(saved.cardRef.name, 'Cultivate');
  assert.equal(saved.action.cardToken, undefined);

  const restoredGame = new MTG.Game({ seed: 32, paced: false });
  const restoredYou = restoredGame.addPlayer('You', MTG.DECKS['Quandrix Unlimited'], null, false);
  const restoredCard = new MTG.CardInst(MTG.DEFS.Cultivate, restoredYou);
  restoredCard.zone = 'battlefield'; restoredCard.ctrl = restoredYou;
  restoredGame.battlefield.push(restoredCard);
  restoredGame.lastResortPaused = true;
  assert.notEqual(restoredCard.iid, card.iid);
  await MTG.replayAccountSideAction(restoredGame, restoredYou, saved);
  assert.equal(restoredYou.graveyard.includes(restoredCard), true);
  assert.equal(restoredGame.battlefield.includes(restoredCard), false);
});

test('account save schema keeps deterministic setup, private decisions, and profile UX wired end to end', () => {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 31, paced: false });
  game.turnNo = 7;
  const setup = {
    deck: 'Quandrix Unlimited', commanders: ['Zimone, Infinite Analyst'], ai: 3,
    aiDecks: ['Elven Council', 'Doom Prevails', 'Quick Draw'], aiStyles: ['balanced', 'josh', 'olivia'],
    seed: '31', difficulty: 'hard', diplomacyEnabled: true,
  };
  const save = MTG.buildAccountSave(game, setup, [{ shape: { type: 'mulligan' }, response: { kind: 'boolean', value: false } }], 'match-save-schema-0001');
  assert.equal(save.schema, 'commander-save/v1');
  assert.equal(save.summary.turn, 7);
  assert.equal(save.summary.decisionCount, 1);
  assert.equal(MTG.validateAccountSave(save), save);

  assert.match(mainSource, /MTG\.restoreSaveDecision\(request, p, recorded\)/);
  assert.match(mainSource, /MTG\.replayAccountSideAction\(game, p, side\.action\)/);
  assert.match(mainSource, /MTG\.buildAccountSave\(g, saveSetup, recordedTimeline, matchId\)/);
  assert.match(mainSource, /e\.type === 'gameover'.*completeAccountMatch/s);
  assert.match(mainSource, /MTG\.resumeAccountSave = function/);
  assert.match(uiSource, /action\('Save & exit'/);
  assert.match(uiSource, /action\('Profile & stats'/);
  assert.match(uiSource, /captureAccountSideAction\?\.\(\{ type: 'lastResort'/);
  assert.match(uiSource, /type: 'diplomacyOffer'/);
  assert.match(accountSource, /FAVOURITE COMMANDERS/);
  assert.match(accountSource, /LIFETIME SCORE/);
  assert.match(accountApiSource, /commander_session/);
  assert.match(accountSource, /credentials: 'same-origin'/);
  assert.match(accountCss, /\.account-stats/);
  assert.match(accountCss, /@media \(max-width: 720px\)/);
});
