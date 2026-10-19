import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionTable, M } from './helpers/ui-decision-fixtures.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const markup = node => `${node.innerHTML || ''}${(node.children || []).map(markup).join('')}`;

test('a Curse shows its enchanted player separately from its controller', () => {
  const { game, me, rival, ui, put } = decisionTable();
  const curse = put('Curse of Conformity');
  curse.meta.cursedPlayer = rival;
  ui.sheet = { card: curse };
  const mini = ui.miniCard(game, curse);
  assert.match(mini.innerHTML, /Enchants: Opponent/);
  assert.match(mini.getAttribute('aria-label'), /Enchants: Opponent/);
  assert.match(markup(ui.renderCardSheet(game)), /Battlefield<span>You<\/span>/);
  assert.match(markup(ui.renderCardSheet(game)), /enchantplayerstate">Enchants: Opponent/);

  curse.ctrl = rival;
  curse.meta.cursedPlayer = me;
  assert.match(markup(ui.renderCardSheet(game)), /Battlefield<span>Opponent<\/span>/);
  assert.match(markup(ui.renderCardSheet(game)), /enchantplayerstate">Enchants: You/);

  rival.name = '<Opponent>';
  curse.meta.cursedPlayer = rival;
  assert.match(ui.miniCard(game, curse).innerHTML, /Enchants: &lt;Opponent>/);
  assert.match(markup(ui.renderCardSheet(game)), /Enchants: &lt;Opponent>/);
});

test('player Auras remain individually inspectable when their names match', () => {
  const { me, rival, ui, put } = decisionTable();
  const first = put('Curse of Conformity'), second = put('Curse of Conformity');
  first.meta.cursedPlayer = rival;
  second.meta.cursedPlayer = me;
  assert.equal(ui.groupPerms([first, second]).length, 2);
});

test('Live retains the public enchanted-player reference across seat remapping', () => {
  const { game, me, rival, ui, put } = decisionTable();
  me.onlineSeat = 1; rival.onlineSeat = 3;
  const curse = put('Curse of Conformity');
  curse.meta.cursedPlayer = rival;
  const model = new M.OnlineArenaView();
  model.update(plain(M.onlineGameViewFor(game, rival)), rival.onlineSeat);
  const shown = model.byIid(curse.iid);
  assert.equal(shown.meta.cursedPlayer, model.viewer);
  assert.notEqual(shown.ctrl, model.viewer);
  ui.game = model; ui.me = model.viewer; ui.sheet = { card: shown };
  assert.match(ui.miniCard(model, shown).innerHTML, /Enchants: Opponent/);
  assert.match(markup(ui.renderCardSheet(model)), /enchantplayerstate">Enchants: Opponent/);
});

test('hidden and nonbattlefield cards do not expose stale enchanted-player metadata', () => {
  const { game, me, rival, ui, put } = decisionTable();
  const curse = put('Curse of Conformity');
  curse.meta.cursedPlayer = rival;
  ui.sheet = { card: curse };
  ui.me = rival;
  for (const state of [{ zone: 'hand', faceDown: false }, { zone: 'battlefield', faceDown: true }]) {
    Object.assign(curse, state);
    if (state.faceDown) curse.meta.faceDownDef = curse.def;
    assert.equal(M.onlineCardPresentation(curse, rival).meta.cursedPlayer, undefined);
    assert.equal(M.onlineCardPresentation(curse, me, true).meta.cursedPlayer, undefined);
    assert.doesNotMatch(ui.miniCard(game, curse).innerHTML, /enchantplayertag/);
    assert.doesNotMatch(markup(ui.renderCardSheet(game)), /enchantplayerstate/);
  }
});
