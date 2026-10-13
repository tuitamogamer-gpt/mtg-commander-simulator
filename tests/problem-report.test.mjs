import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {loadEngine} from './helpers/load-engine.mjs';

const MTG = loadEngine();
const copy = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const options = {humanDeck: 'Abzan Armor', aiDecks: ['Turtle Power'], aiStyles: ['balanced'],
    difficulty: 'normal', seed: 11081, paced: true, humanController: () => ({decide: async () => null})};
  const game = MTG.newGame(options);
  game.turnPlayer = game.players[0];
  const you = game.players.find(player => !player.isAI);
  const setup = {deck: options.humanDeck, commanders: you.commanders.map(card => card.name), ai: 1,
    aiDecks: options.aiDecks, aiStyles: options.aiStyles, seed: String(options.seed)};
  const board = MTG.captureGameState(game);
  assert.ok(board, MTG.gameStateSnapshotBlockers(game).join('; '));
  const decision = MTG.recordSaveDecision({type: 'mulligan'}, you, false);
  const save = MTG.buildAccountSave(game, setup, [decision], 'report-native-match-001', board, 0);
  const visible = {mode: 'game', players: [{name: 'You', hand: [{name: 'PRIVATE-HAND-MARKER'}],
    library: [{name: 'PRIVATE-LIBRARY-MARKER'}]}], pending: {type: 'mulligan', secret: 'PRIVATE-CHOICE-MARKER'}};
  return {game, options, save, visible};
}

test('Solo report freezes the native checkpoint and recorded choices without changing the live game', () => {
  const f = fixture();
  const before = MTG.gameStateFingerprint(f.game);
  const report = MTG.buildProblemReport(f.game, f.visible, {save: f.save, createdAt: '2026-10-13T12:00:00.000Z'});
  assert.equal(report.schema, 'commander-problem/v1');
  assert.equal(report.createdAt, '2026-10-13T12:00:00.000Z');
  assert.deepEqual(copy(report.replay), copy(f.save));
  assert.notEqual(report.replay, f.save);
  f.save.decisions.push({later: true});
  assert.equal(report.replay.decisions.length, 1, 'typing a description cannot move the captured replay forward');
  assert.equal(MTG.gameStateFingerprint(f.game), before);
  assert.doesNotMatch(JSON.stringify(report.diagnostics), /PRIVATE-/);
});

test('download can omit all private replay data without modifying the captured report', () => {
  const f = fixture();
  const captured = MTG.buildProblemReport(f.game, f.visible, {save: f.save});
  const publicReport = MTG.problemReportForDownload(captured, '  Yuriko <&> 🥷  ', false);
  assert.equal(publicReport.description, 'Yuriko <&> 🥷');
  assert.equal(publicReport.replay, null);
  assert.ok(captured.replay);
  assert.doesNotMatch(JSON.stringify(publicReport), /PRIVATE-|commander-save\/v1/);
  assert.throws(() => MTG.parseProblemReport(JSON.stringify(publicReport)), /Solo replay was not attached/);
  const full = MTG.problemReportForDownload(captured, 'x'.repeat(2200), true);
  assert.equal(full.description.length, 2000);
  assert.match(full.privacy, /all saved cards and recorded choices/);
});

test('Live reports cannot attach a supplied private checkpoint', () => {
  const f = fixture();
  f.game.players.find(player => player.isAI).isAI = false;
  const report = MTG.buildProblemReport(f.game, f.visible, {save: f.save});
  assert.equal(report.diagnostics.reproduction.mode, 'online');
  assert.equal(report.replay, null);
  assert.match(report.replayUnavailable, /public diagnostics only/);
});

test('a downloaded report restores its native board and preserves its replay offset', () => {
  const f = fixture();
  const report = MTG.problemReportForDownload(MTG.buildProblemReport(f.game, f.visible, {save: f.save}), 'Replay this choice', true);
  const parsed = MTG.parseProblemReport(JSON.stringify(report));
  assert.equal(parsed.save.checkpointTimelineIndex, 0);
  assert.equal(parsed.save.decisions.length, 1);
  const restored = MTG.newGame(f.options);
  MTG.restoreGameState(restored, parsed.save.state);
  assert.equal(MTG.gameStateFingerprint(restored), MTG.gameStateFingerprint(f.game));
  const you = restored.players.find(player => !player.isAI);
  assert.equal(MTG.restoreSaveDecision({type: 'mulligan'}, you, parsed.save.decisions[0]), false);
});

test('report import rejects malformed, unavailable and oversized replay data', () => {
  const f = fixture();
  const report = MTG.buildProblemReport(f.game, f.visible, {save: f.save});
  assert.throws(() => MTG.parseProblemReport('{'), /not valid JSON/);
  assert.throws(() => MTG.parseProblemReport({schema: 'unknown'}), /unsupported file/);
  assert.throws(() => MTG.parseProblemReport({...report, replay: {...report.replay, checkpointTimelineIndex: 5}}), /checkpoint decision offset/);
  assert.throws(() => MTG.parseProblemReport({...report, replay: {...report.replay, setup: {...report.replay.setup, deck: 'Missing deck'}}}), /human deck is unavailable/);
  assert.throws(() => MTG.parseProblemReport('🥷'.repeat(MTG.PROBLEM_REPORT_MAX_BYTES / 4 + 1)), /larger than 10 MB/);
});

test('report import identifies a different loaded build without accepting executable metadata', () => {
  const f = fixture();
  const context = {MTG: {...MTG, BUILD_INFO: {version: '0.1.0', revision: 'a'.repeat(40), source: 'vercel', dirty: false}}};
  context.globalThis = context;
  vm.runInNewContext(readFileSync(new URL('../src/modules/problem-report.js', import.meta.url), 'utf8'), context);
  const report = context.MTG.buildProblemReport(f.game, f.visible, {save: f.save});
  assert.equal(report.build.revision, 'a'.repeat(40));
  assert.equal(context.MTG.parseProblemReport(report).versionMismatch, false);
  report.build.revision = 'b'.repeat(40);
  assert.equal(context.MTG.parseProblemReport(report).versionMismatch, true);
});

test('report download refuses a 9 MiB export before invoking the native file bridge', () => {
  let blobSize = 9 * 1024 * 1024;
  const actions = [];
  const context = {
    MTG: {...MTG},
    Blob: class { constructor() { this.size = blobSize; } },
    URL: {
      createObjectURL() { actions.push('url'); return 'blob:problem-report'; },
      revokeObjectURL() { actions.push('revoke'); },
    },
    document: {
      createElement() { return {click() { actions.push('click'); }, remove() { actions.push('remove'); }}; },
      body: {appendChild() { actions.push('append'); }},
    },
    setTimeout(callback) { callback(); },
  };
  vm.runInNewContext(readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8'), context);
  const ui = Object.create(context.MTG.UI.prototype);
  const report = {createdAt: '2026-10-13T12:00:00.000Z', replay: null};
  assert.throws(() => ui.downloadProblemReport(report), /larger than 8 MB.*public diagnostics/);
  assert.deepEqual(actions, [], 'Oversized exports must not display a successful native download');

  // Removing the replay produces the usual small public report, which keeps
  // the real anchor download and object-URL cleanup path.
  blobSize = 250;
  ui.downloadProblemReport(report);
  assert.deepEqual(actions, ['url', 'append', 'click', 'remove', 'revoke']);
});
