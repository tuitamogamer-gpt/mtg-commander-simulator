// Every string the table shows passes through MTG.uiText, which translates the
// engine's remaining Bosnian prompts with about 1,800 patterns. Trying all of
// them on each new string took about 8 ms. A rule is now tried only when the
// text has its word or its longest plain run of characters. That shortcut must
// never change a translation: MTG.uiTextReference applies every rule in
// order, and the two are compared here on the rule tables' own phrases.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/util.js', import.meta.url), 'utf8');
function load() {
  const box = { console };
  box.globalThis = box;
  vm.createContext(box);
  new vm.Script(source).runInContext(box);
  return box.MTG;
}
const MTG = load();

// The phrases the rules translate, read from the rule tables themselves.
function rulePhrases() {
  const phrases = new Set();
  for (const match of source.matchAll(/\[\s*"((?:[^"\\]|\\.)+)"\s*,\s*"/g)) phrases.add(match[1]);
  for (const match of source.matchAll(/\[\/((?:[^/\\\n]|\\.)+)\/[a-z]*,/g)) {
    phrases.add(match[1].replace(/\\b/g, '').replace(/\(\\d\+\)/g, '3').replace(/\\([.?*+()[\]{}|^$/-])/g, '$1')
      .replace(/\(\?:([^|)]*)[^)]*\)\??/g, '$1').replace(/\\s/g, ' '));
  }
  for (const match of source.matchAll(/uiWord\('((?:[^'\\]|\\.)+)'\)/g)) phrases.add(match[1]);
  return [...phrases];
}

test('the shortcut gives the translation of the complete rule list', () => {
  const phrases = rulePhrases();
  assert.ok(phrases.length > 1500, `${phrases.length} phrases read from the rule tables`);
  const texts = new Set();
  // Each phrase alone, and a slice of them in other cases, inside tokens,
  // beside digits, possessives and each other: where a boundary decides.
  phrases.forEach((phrase, index) => {
    texts.add(phrase);
    if (index % 6) return;
    const other = phrases[(index * 7 + 3) % phrases.length];
    for (const text of [phrase.toLowerCase(), phrase.toUpperCase(), `${phrase}.`, `${phrase}'s`, `x${phrase}`, `${phrase}x`,
      `${phrase}-a`, `a-${phrase}`, `${phrase} 3`, `${phrase}3`, `${phrase} ${other}`, `Sol Ring: ${other}, ${phrase}!`, `${phrase}\n${other}`])
      texts.add(text);
  });
  for (const text of ['You zadržava 7 karata.', '——— Potez 4: AI Vuk ———', 'Leonardo da Vinci', 'da Leonardo da Vinci',
    'Ezio Auditore da Firenze', 'Tri-Sentinel', 'Tri', 'Nema Siltlurker', 'Nema', "u's turn", 'Yuan-Ti Fang-Blade', 'A i B',
    'Destroy target creature. Its controller gains life equal to its power.', '', ' ']) texts.add(text);
  let translated = 0;
  const wrong = [];
  for (const text of texts) {
    const expected = MTG.uiTextReference(text), actual = MTG.uiText(text);
    if (expected !== text) translated++;
    if (actual !== expected && wrong.length < 10) wrong.push({ text, actual, expected });
  }
  assert.deepEqual(wrong, []);
  assert.ok(translated > 1500, `${translated} of ${texts.size} texts are really translated`);
});

test('a letter with unusual case folding is checked against every rule', () => {
  // A pattern with the i flag folds the long s to "s"; toLowerCase() does not.
  for (const text of ['ſ u ruci', 'İ i ı', 'ẞ Nema', 'K u egzilu']) assert.equal(MTG.uiText(text), MTG.uiTextReference(text), text);
});

test('paths and addresses are never translated', () => {
  for (const text of ['./assets/cards/u-ruci.webp', 'https://example.com/u/ruci', 'data:u', '/u']) {
    assert.equal(MTG.uiText(text), text);
    assert.equal(MTG.uiTextReference(text), text);
  }
});

test('an English string no longer costs a pass over every pattern', () => {
  const fresh = load();
  const texts = Array.from({ length: 3000 }, (_, index) =>
    `AI Dragon casts Swords to Plowshares on creature number ${index}. Its controller gains ${index % 9} life.`);
  const started = performance.now();
  for (const text of texts) assert.equal(fresh.uiText(text), text);
  const elapsed = performance.now() - started;
  // The complete rule list takes several seconds for this many strings.
  assert.ok(elapsed < 1500, `3,000 new English strings took ${Math.round(elapsed)} ms`);
});

test('the cache drops its oldest strings, not all of them', () => {
  const fresh = load();
  const first = 'Nema karata 0';
  const translated = fresh.uiText(first);
  assert.equal(translated, fresh.uiTextReference(first));
  // Far more distinct strings than the cache holds: the answers stay right.
  for (let index = 1; index < 9000; index++) fresh.uiText(`Nema karata ${index}`);
  assert.equal(fresh.uiText(first), translated);
  assert.equal(fresh.uiText('Nema karata 8999'), fresh.uiTextReference('Nema karata 8999'));
});
