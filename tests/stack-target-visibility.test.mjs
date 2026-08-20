import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function permanent(game, player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

test('Stella Lee copies retain visible lineage, order, target mode, source and locked targets', async () => {
  const notices = [];
  let wanted;
  const game = new MTG.Game({
    seed: 8202601,
    paced: false,
    maxTurns: 30,
    onEvent: event => { if (event.type === 'effectNotice') notices.push(event); },
  });
  const human = game.addPlayer('You', { name: 'Human deck' }, { decide: async () => null }, false);
  const opponent = game.addPlayer('Quick Draw', { name: 'Quick Draw' }, {
    decide: async (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'newTargets') return 'yes';
      if (q.type === 'chooseTargets' && q.candidates.includes(wanted)) return [wanted];
      return null;
    },
  }, true);
  game.turnPlayer = opponent;
  game.turnNo = 12;
  game.phase = 'main1';

  const ring = permanent(game, human, 'Sol Ring');
  const jailer = permanent(game, human, 'Palace Jailer');
  const signet = permanent(game, human, 'Arcane Signet');
  const stella = permanent(game, opponent, 'Stella Lee, Wild Card');
  const warp = new MTG.CardInst(MTG.DEFS['Chaos Warp'], opponent);
  warp.zone = 'stack';
  const targetSpec = {
    zone: 'battlefield', what: 'permanent', count: 1,
    filter: (g, card) => card.ctrl === human,
  };
  const original = {
    kind: 'spell', card: warp, ctrl: opponent, name: warp.name,
    targets: [ring], targetSpecs: [targetSpec], castOpts: {}, copyOf: null,
  };
  game.stack.push(original);

  wanted = jailer;
  await stella.def.abilities[0].run({ g: game, you: opponent, src: stella, targets: [original] });
  wanted = signet;
  await stella.def.abilities[0].run({ g: game, you: opponent, src: stella, targets: [original] });

  const copies = game.stack.filter(item => item.isCopy);
  assert.equal(copies.length, 2);
  assert.equal(copies[0].copyIndex, 1);
  assert.equal(copies[1].copyIndex, 2);
  assert.equal(copies[0].copyRoot, original);
  assert.equal(copies[1].copyRoot, original);
  assert.equal(copies[0].copySource, stella);
  assert.equal(copies[1].copySource, stella);
  assert.equal(copies[0].targetMode, 'new');
  assert.equal(copies[1].targetMode, 'new');
  assert.equal(copies[0].targets[0], jailer);
  assert.equal(copies[1].targets[0], signet);

  assert.equal(notices.length, 2);
  assert.equal(notices[0].kind, 'spellCopy');
  assert.equal(notices[0].spell, copies[0]);
  assert.equal(notices[0].original, original);
  assert.equal(notices[0].targets[0], jailer);
  assert.match(notices[0].text, /copy #1.*Chaos Warp.*Stella Lee.*new targets/i);
});

test('same-target copies are explicitly marked and preserve their public target map', async () => {
  const game = new MTG.Game({ seed: 8202602, paced: false, maxTurns: 30 });
  const human = game.addPlayer('You', { name: 'Human deck' }, { decide: async () => null }, false);
  const opponent = game.addPlayer('Opponent', { name: 'Quick Draw' }, { decide: async () => null }, true);
  const target = permanent(game, human, 'Sol Ring');
  const spell = new MTG.CardInst(MTG.DEFS['Chaos Warp'], opponent);
  spell.zone = 'stack';
  const original = {
    kind: 'spell', card: spell, ctrl: opponent, name: spell.name,
    targets: [target], targetSpecs: [], castOpts: {}, copyOf: null,
  };

  const copy = await game.copySpell(original, opponent, { mayNewTargets: false });
  assert.equal(copy.targetMode, 'same');
  assert.equal(copy.targets[0], target);
  assert.equal(copy.copyIndex, 1);
});

test('target and copy presentation is wired through the central action-stage and every stack view', () => {
  const ui = fs.readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');

  assert.match(ui, /renderStackTargetFlow\(top\)/);
  assert.match(ui, /LOCKED TARGET MAP/);
  assert.match(ui, /stackpoptargetsummary/);
  assert.match(ui, /showSpellCopy\(event\)/);
  assert.match(css, /\.stacktargetflow/);
  assert.match(css, /\.spellcopynotice/);
  assert.match(main, /targets: \(item\.targets/);
});
