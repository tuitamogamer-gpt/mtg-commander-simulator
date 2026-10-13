// Portable, opt-in Solo reproduction alongside the existing public snapshot.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const clone = value => JSON.parse(JSON.stringify(value));
  MTG.PROBLEM_REPORT_SCHEMA = 'commander-problem/v1';
  MTG.PROBLEM_REPORT_MAX_BYTES = 10 * 1024 * 1024;
  // Match the native iOS file bridge as well as ordinary browser downloads.
  MTG.PROBLEM_REPORT_DOWNLOAD_MAX_BYTES = 8 * 1024 * 1024;

  MTG.problemReportBuild = function () {
    const build = MTG.BUILD_INFO || {};
    return {
      version: typeof build.version === 'string' ? build.version : 'development',
      revision: typeof build.revision === 'string' ? build.revision : null,
      source: typeof build.source === 'string' ? build.source : 'development',
      dirty: typeof build.dirty === 'boolean' ? build.dirty : null,
    };
  };

  MTG.buildProblemReport = function (game, state, options = {}) {
    const diagnostics = MTG.buildDebugBundle(game, state, options.createdAt);
    const solo = diagnostics.reproduction.mode === 'solo';
    const report = {
      schema: MTG.PROBLEM_REPORT_SCHEMA,
      createdAt: diagnostics.createdAt,
      build: MTG.problemReportBuild(),
      description: String(options.description || '').trim().slice(0, 2000),
      diagnostics,
      replay: solo && options.save ? clone(options.save) : null,
      replayUnavailable: !solo ? 'Live reports include public diagnostics only.'
        : options.save ? null : 'No Solo replay checkpoint is available for this table.',
    };
    if (options.presentationError) report.presentationError = clone(options.presentationError);
    return report;
  };

  MTG.problemReportForDownload = function (captured, description, includeReplay) {
    const report = clone(captured);
    report.description = String(description || '').trim().slice(0, 2000);
    if (!includeReplay) report.replay = null;
    report.privacy = report.replay
      ? 'Solo reproduction includes deck lists, all saved cards and recorded choices. No account credentials are included.'
      : 'Public diagnostics only; no saved private board or recorded choices are attached.';
    return report;
  };

  MTG.parseProblemReport = function (input) {
    let report = input;
    if (typeof input === 'string') {
      let bytes = 0;
      for (const character of input) {
        const code = character.codePointAt(0);
        bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
        if (bytes > MTG.PROBLEM_REPORT_MAX_BYTES)
          throw new Error('Problem report: the selected file is larger than 10 MB.');
      }
      try { report = JSON.parse(input); }
      catch { throw new Error('Problem report: the selected file is not valid JSON.'); }
    }
    if (!report || report.schema !== MTG.PROBLEM_REPORT_SCHEMA)
      throw new Error('Problem report: unsupported file format.');
    if (report.diagnostics?.reproduction?.mode !== 'solo' || !report.replay)
      throw new Error('This report has public diagnostics only. A Solo replay was not attached.');
    // The existing checkpoint validator also carries and validates imported
    // deck lists. A report never supplies executable rules or controller code.
    const save = MTG.validateAccountSave(clone(report.replay));
    const build = report.build && typeof report.build === 'object' ? report.build : {};
    const current = MTG.problemReportBuild();
    return {
      save,
      description: String(report.description || '').slice(0, 2000),
      revision: typeof build.revision === 'string' ? build.revision : null,
      versionMismatch: !!(build.revision && current.revision && build.revision !== current.revision),
      checkpoint: report.diagnostics.checkpoint || {},
    };
  };
})();
