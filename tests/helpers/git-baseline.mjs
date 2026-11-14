import {execFileSync} from 'node:child_process';

// A file as an earlier commit recorded it, for tests that compare today's
// data with a baseline in history. A shallow checkout (the usual cloud and CI
// clone) does not hold old commits: the answer then carries the reason and the
// test skips with it. It neither fails nor passes unseen.
export function baselineFile(commit, file) {
  const git = args => execFileSync('git', args, {encoding: 'utf8', maxBuffer: 20_000_000, stdio: ['ignore', 'pipe', 'pipe']});
  try { git(['cat-file', '-e', `${commit}^{commit}`]); }
  catch { return {missing: `commit ${commit} is not in this checkout (a shallow clone); with full history this comparison runs`}; }
  return {text: git(['show', `${commit}:${file}`])};
}
