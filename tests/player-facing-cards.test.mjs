import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

// A card only works for the player if the questions it asks are readable and
// nothing it does throws mid-resolution. These sweeps drive every card in the
// catalog through the human decision path and inspect what the player is shown.

const MTG = loadEngine();
const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];

// Bosnian is the source language of the codebase; the interface is English and
// MTG.uiText() is the presentation layer that translates it.
const BOSNIAN = /\b(izaberi|izaberite|biraj|odaberi|kartu|karata|stvorenje|stvorenja|protivnik|protivnika|koliko|poteza|ruci|groblje|groblja|table|plati|žrtvuj|odbaci|uništi|meta|mete|metu|tvoj|tvoja|tvoje|vlastiti|nijedan|nema|dodaj|vrati|pomjeri|snaga|žilavost|tačno|najviše|najmanje|redoslijed|sposobnost|trošak|iz ruke|na tablu|u groblje|sa table|bilo koji)\b/i;
const DIACRITIC = /[šđčćžŠĐČĆŽ]/;
const INTERNALS = /undefined|\[object |NaN|\bnull\b/;

function unreadable(text) {
  const raw = String(text ?? '');
  // An empty prompt is legitimate for question types whose prompt bar writes
  // its own sentence (card reveals, combat reviews).
  if (!raw.trim()) return null;
  const shown = MTG.uiText(raw);
  if (INTERNALS.test(shown)) return `internals leak: ${shown.slice(0, 80)}`;
  if (DIACRITIC.test(shown) || BOSNIAN.test(shown)) return `not English: ${shown.slice(0, 80)}`;
  return null;
}

function defaultAnswer(question, player) {
  switch (question.type) {
    case 'chooseOption': return (question.options[0] || {}).key;
    case 'chooseMulti': return (question.options || []).slice(0, question.min || 1).map(option => option.key);
    case 'chooseTargets': return (question.candidates || [])
      .slice(0, Math.min(question.max ?? 1, Math.max(question.min || 0, 1)));
    case 'chooseCards': return (question.from || [])
      .slice(0, Math.max(question.min || 0, Math.min(1, question.max ?? 0)));
    case 'chooseX': return Math.min(2, question.max ?? 0);
    case 'scry': return { top: (question.cards || []).slice(), bottom: [] };
    case 'orderTriggers': return question.triggers;
    case 'bottomCards': return (question.player || player).hand.slice(0, question.n || 0);
    case 'priority': return { kind: 'pass' };
    case 'main': return { kind: 'done' };
    case 'attackers': case 'blockers': case 'combatReview': return [];
    default: return null;
  }
}

function fundedTable(capture) {
  const game = new MTG.Game({ seed: 13, paced: false, maxTurns: 100 });
  const players = [];
  for (let index = 0; index < 2; index++) {
    players.push(game.addPlayer(index ? 'Rival' : 'You', { name: index ? 'Rival' : 'You' }, {
      decide: async (currentGame, question) => {
        capture(question);
        return defaultAnswer(question, players[index]);
      },
    }, index > 0));
  }
  players[0].isAI = false;
  const [me, rival] = players;
  game.turnPlayer = me;
  game.turnNo = 10;
  game.phase = 'main1';
  game.step = 'main';
  const permanent = (player, name) => {
    const card = new MTG.CardInst(MTG.DEFS[name], player);
    card.ctrl = player;
    card.zone = 'battlefield';
    card.sick = false;
    game.battlefield.push(card);
    return card;
  };
  const zoneCard = (player, name, zone) => {
    const card = new MTG.CardInst(MTG.DEFS[name], player);
    card.zone = zone;
    player[zone].push(card);
    return card;
  };
  for (let index = 0; index < 15; index++) { zoneCard(me, 'Forest', 'library'); zoneCard(rival, 'Forest', 'library'); }
  for (let index = 0; index < 6; index++) { permanent(me, 'Island'); permanent(rival, 'Island'); }
  for (let index = 0; index < 3; index++) { permanent(me, 'Grizzly Bears'); permanent(rival, 'Grizzly Bears'); }
  for (let index = 0; index < 2; index++) { permanent(me, 'Sol Ring'); permanent(rival, 'Sol Ring'); }
  for (let index = 0; index < 4; index++) {
    zoneCard(me, 'Lightning Bolt', 'hand');
    zoneCard(me, 'Lightning Bolt', 'graveyard');
    zoneCard(rival, 'Lightning Bolt', 'graveyard');
  }
  for (const color of COLORS) { me.pool[color] = 40; rival.pool[color] = 40; }
  me.turnState.spellsCast = 5;
  return { game, me, rival, permanent, zoneCard };
}

async function settle(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 60) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
    await game.checkSBA();
  }
}

// Question types whose prompt bar composes its own sentence from the payload.
const SELF_DESCRIBING = new Set(['priority', 'main', 'attackers', 'blockers',
  'cardReveal', 'combatReview', 'threatAlert', 'effectReview']);

function inspector(problems, cardName) {
  return question => {
    if (!SELF_DESCRIBING.has(question.type)) {
      const bad = unreadable(question.prompt);
      if (bad) problems.push(`${cardName} · ${question.type} prompt · ${bad}`);
    }
    for (const option of question.options || []) {
      const bad = unreadable(option.label);
      if (bad) problems.push(`${cardName} · ${question.type} option · ${bad}`);
    }
  };
}

test('svaka karta koju igrač baci pita razumljiva pitanja i ne ruši partiju', { timeout: 300_000 }, async () => {
  const problems = [];
  let cast = 0;
  let questions = 0;
  for (const [name, def] of Object.entries(MTG.DEFS)) {
    if (def.types.includes('Land')) continue;
    const inspect = inspector(problems, name);
    const { game, me, zoneCard } = fundedTable(question => { questions++; inspect(question); });
    const card = zoneCard(me, name, 'hand');
    game.recalc();
    try {
      if (await game.castSpell(me, card, { from: 'hand' })) {
        cast++;
        await settle(game);
      }
    } catch (error) {
      problems.push(`${name} · throws while a player casts it · ${String(error.message).slice(0, 90)}`);
    }
  }
  assert.ok(cast > 12_000, `premalo karata je stvarno bačeno: ${cast}`);
  assert.ok(questions > 20_000, `premalo pitanja je pregledano: ${questions}`);
  assert.deepEqual(problems.slice(0, 30), [], `nečitljiva ili slomljena pitanja (${problems.length}):\n${problems.slice(0, 30).join('\n')}`);
});

test('svaka aktivirana sposobnost koju igrač koristi pita razumljiva pitanja', { timeout: 180_000 }, async () => {
  const problems = [];
  let activations = 0;
  for (const [name, def] of Object.entries(MTG.DEFS)) {
    if (!(def.abilities || []).length && !def.gyAbility && !def.handAbility) continue;
    const inspect = inspector(problems, name);
    const { game, me, permanent, zoneCard } = fundedTable(inspect);
    const zone = def.gyAbility ? 'graveyard' : def.handAbility ? 'hand' : 'battlefield';
    const card = zone === 'battlefield' ? permanent(me, name) : zoneCard(me, name, zone);
    game.recalc();
    let entries;
    try { entries = game.activatableList(me).filter(entry => entry.card === card && !entry.manaAbility); }
    catch (error) {
      problems.push(`${name} · activatableList throws · ${String(error.message).slice(0, 90)}`);
      continue;
    }
    for (const entry of entries.slice(0, 4)) {
      try {
        if (await game.activateAbility(me, entry)) {
          activations++;
          await settle(game);
        }
      } catch (error) {
        problems.push(`${name} · throws while a player activates it · ${String(error.message).slice(0, 90)}`);
      }
    }
  }
  assert.ok(activations > 2_500, `premalo aktivacija: ${activations}`);
  assert.deepEqual(problems.slice(0, 30), [], `nečitljiva ili slomljena pitanja (${problems.length}):\n${problems.slice(0, 30).join('\n')}`);
});

test('odgovor pogrešnog oblika ne ruši partiju nego se svede na siguran izbor', async () => {
  const { game, me, zoneCard } = fundedTable(() => {});
  // a controller that answers nothing at all — the shape every card script assumed
  for (const player of game.players) player.controller = { decide: async () => null };
  const card = zoneCard(me, "Council's Judgment", 'hand');
  game.recalc();
  assert.equal(await game.castSpell(me, card, { from: 'hand' }), true);
  await settle(game);
  assert.ok((game._decisionFallbacks || 0) > 0, 'siguran izbor mora biti zabilježen');
  assert.ok(game.log.some(entry => /no usable answer/i.test(String(entry.msg || entry))),
    'igrač mora vidjeti zašto je izbor preskočen');
});

test('dinamični iznos u plaćanju se prikazuje kao broj, ne kao interni objekat', async () => {
  const seen = [];
  const { game, me, zoneCard } = fundedTable(question => {
    for (const option of question.options || []) seen.push(option.label);
  });
  const card = zoneCard(me, 'Champion of Wits', 'hand');
  game.recalc();
  assert.equal(await game.castSpell(me, card, { from: 'hand' }), true);
  await settle(game);
  const payLabel = seen.find(label => /^Pay:/.test(String(label)));
  assert.ok(payLabel, 'plaćanje mora biti ponuđeno');
  assert.doesNotMatch(payLabel, /\[object /);
  assert.match(payLabel, /^Pay: draw \d+$/);
});
