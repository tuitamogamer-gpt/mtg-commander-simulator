// Findings from a hand-played browser match and the catalog fuzz
// (2026-09-02): a token explosion froze the engine, a reveal popup left the
// prompt bar reading "…", the combat-response text said "1 legal options",
// and Slaughter the Strong asked a seat with no creatures to keep some.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const decks = Object.keys(MTG.DECKS).filter(name => !MTG.DECKS[name].custom);

function setup(seed) {
  const game = MTG.newGame({
    humanDeck: decks[0], aiDecks: decks.slice(1, 4), aiStyles: ['balanced', 'balanced', 'balanced'],
    difficulty: 'normal', seed, maxTurns: 80, paced: false,
  });
  const me = game.players[0];        // headless: the human seat is played by the local AI
  game.turnPlayer = me; game.turnNo = 12; game.phase = 'main1';
  return { game, me };
}

function put(game, player, def) {
  const card = new MTG.CardInst(def, player);
  card.zone = 'battlefield'; card.ctrl = player; card.sick = false;
  game.battlefield.push(card);
  return card;
}

test('a seat never keeps more than the table token limit', async () => {
  const { game, me } = setup(501);
  const limit = MTG.TOKEN_LIMIT_PER_PLAYER;
  assert.ok(limit >= 200 && limit <= 1000, `limit ${limit} stays generous but finite`);
  const tokens = () => game.battlefield.filter(card => card.isToken && card.ctrl === me).length;
  await game.makeTokens('squirrel', me, { n: limit - 5 });
  assert.equal(tokens(), limit - 5);
  const before = game.log.length;
  await game.makeTokens('squirrel', me, { n: 50 });
  assert.equal(tokens(), limit, 'creation stops exactly at the limit');
  const notice = game.log.slice(before).find(entry => /table limit/.test(entry.msg));
  assert.ok(notice, 'the log explains why the tokens were not created');
  const again = game.log.length;
  await game.makeTokens('squirrel', me, { n: 50 });
  assert.equal(tokens(), limit);
  assert.ok(!game.log.slice(again).some(entry => /table limit/.test(entry.msg)), 'the notice is logged once per turn');
  // Other seats keep their own budget.
  const rival = me.opponents(game)[0];
  await game.makeTokens('squirrel', rival, { n: 3 });
  assert.equal(game.battlefield.filter(card => card.isToken && card.ctrl === rival).length, 3);
});

test('Slaughter the Strong skips seats with no creatures and still sacrifices the big ones', async () => {
  const { game, me } = setup(502);
  const [rival] = me.opponents(game);
  await game.makeTokens('squirrel', rival, { n: 1 });   // 1/1
  await game.makeTokens('golem99', rival, { n: 1 });    // 9/9 can never be kept
  const prompts = [];
  const original = me.controller.decide.bind(me.controller);
  me.controller.decide = async (g, q) => { prompts.push(q.type); return original(g, q); };
  await MTG.SCRIPTS['Slaughter the Strong'].resolve({ g: game, you: me, src: null });
  assert.ok(!prompts.includes('chooseCards'), 'a seat with no creatures is not asked what to keep');
  const left = game.battlefield.filter(card => card.ctrl === rival && card.is('Creature')).map(card => card.name);
  assert.equal(left.join(','), 'Squirrel Token', 'the 1/1 stays, the 9/9 is sacrificed');
});

test('the prompt bar names reveals and counts legal options in the singular', () => {
  const ui = fs.readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /case 'cardReveal': \{[\s\S]*?Review the cards, then Proceed\./, 'cardReveal has its own prompt text');
  assert.doesNotMatch(ui, /esc\(q\.prompt \|\| '…'\)/, 'no bare ellipsis fallback');
  assert.match(ui, /legal option\$\{[^}]*=== 1 \? '' : 's'\}/, 'singular/plural legal option(s)');
});

test('Continue never strands the loading veil and a desynced replay keeps the table alive', () => {
  const entry = fs.readFileSync(new URL('../src/public-entry.js', import.meta.url), 'utf8');
  assert.match(entry, /setGameLoader\(async save => \{[\s\S]*?try \{[\s\S]*?resumeAccountSave\(save\);[\s\S]*?\} finally \{\s*hideLoading\(\);/, 'the resume loader always removes the veil');
  assert.match(entry, /function hideLoading\(\) \{[\s\S]*?page\.inert = false;/, 'the page is made interactive again');
  const main = fs.readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
  assert.match(main, /const abandonReplay = error => \{[\s\S]*?savedTimeline\.length = replayCursor;/, 'a mismatching recorded decision stops the replay instead of the game');
  assert.match(main, /\} catch \(error\) \{\s*if \(!replayingSave\) throw error;\s*abandonReplay\(error\);/, 'only replay-time failures are absorbed');
});
