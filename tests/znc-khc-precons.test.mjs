import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {precons, buildIntake, sourceDir} from '../scripts/import-znc-cmr-khc-precons.mjs';
import {M, setup, card, play, settle, fuel} from './helpers/znc-khc-fixtures.mjs';
const intake = JSON.parse(fs.readFileSync(sourceDir + '/intake.json'));

test('ZNC/CMR/KHC preserves five original lists, all native definitions, guides and AI profiles', () => {
  const current = buildIntake(M);
  assert.equal(current.names.length, 333); assert.equal(current.newNames.length, 0);
  assert.equal(intake.newCards, 42); assert.equal(intake.reusedCards, 291);
  assert.equal(intake.baselineCards, 20151); assert.equal(intake.baselineDecks, 70);
  for (const entry of precons) {
    const deck = M.DECKS[entry.name], guide = M.DECK_GUIDES[entry.name];
    assert.equal(deck.commander, entry.commander);
    assert.equal(deck.cards.reduce((n, c) => n + c.n, 0), 100);
    assert.ok(guide && M.DECK_GUIDE_ROUTES[guide.route]);
    assert.ok(guide.keys.every(k => deck.cards.some(c => c.name === k)));
    assert.ok(M.AI_DECK_PROFILE_HINTS[entry.name]);
    assert.match(M.DECK_META[entry.name].set, /\(202[01]\)/);
  }
  for (const name of intake.newNames) assert.ok(M.SCRIPTS[name] && !M.DEFS[name].autoScripted && !M.DEFS[name].simplified, name);
});

test('new native runtime smoke records both controllers without prerequisite gaps', () => {
  const report = JSON.parse(fs.readFileSync(sourceDir + '/runtime-smoke.json'));
  assert.equal(report.cards, 42); assert.equal(report.results.length, 84);
  assert.deepEqual(report.counts, {'runtime-smoke-pass': 84, 'prerequisite-gap': 0, 'choice-gap': 0, error: 0});
});

test('printed foretell and Ranar first-action state survive JSON checkpoint restore', async () => {
  const f = setup(); await play(f, 'Ranar the Ever-Watchful');
  const spell = card(f, 'Tales of the Ancestors', 'hand'); fuel(f.a);
  const entry = f.game.activatableList(f.a).find(e => e.card === spell && e.foretell);
  await f.game.activateAbility(f.a, entry); await settle(f.game);
  const snapshot = M.captureGameState(f.game); assert.ok(snapshot, M.gameStateSnapshotBlockers(f.game).join(', '));
  const next = setup(); M.restoreGameState(next.game, JSON.parse(JSON.stringify(snapshot)));
  const restored = next.game.byIid(spell.iid);
  assert.equal(restored.zone, 'exile'); assert.equal(restored.faceDown, true);
  assert.equal(next.game.foretellActionCost(next.a), '{2}');
  next.game.turnNo++; assert.ok(next.game.castableList(next.a).some(e => e.card === restored && e.alt?.foretell));
});

test('a lasting granted foretell cost retains the prior safe checkpoint until that exile object leaves', async () => {
  const f = setup(), spell = card(f, 'Sol Ring', 'hand');
  await f.game.zkForetellFromHand(f.a, spell, {granted: true});
  assert.equal(M.captureGameState(f.game), null);
  assert.ok(M.gameStateSnapshotBlockers(f.game).some(reason => /foretell/.test(reason)));
  await f.game.move(spell, 'hand'); assert.equal(spell.meta.zkForetell, undefined);
  assert.ok(M.captureGameState(f.game));
});
