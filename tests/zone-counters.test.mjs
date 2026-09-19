import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function harness() {
  const MTG = { uiText: String, localizeTree() {} };
  const document = {
    createElement(tagName) {
      const node = { tagName, children: [], dataset: {}, attributes: {}, className: '',
        setAttribute(key, value) { this.attributes[key] = value; },
        appendChild(child) { this.children.push(child); return child; },
      };
      node.classList = { add(name) { node.className += ' ' + name; } };
      return node;
    },
  };
  const context = { MTG, document };
  for (const file of ['visuals', 'ui']) runInNewContext(readFileSync(new URL(`../src/modules/${file}.js`, import.meta.url), 'utf8'), context);
  const ui = Object.create(MTG.UI.prototype);
  ui.me = { name: 'You' };
  ui.render = () => { ui.renders = (ui.renders || 0) + 1; };
  ui.targetZoneCandidates = () => [];
  return ui;
}

test('opponent hand and library counters use only public counts and cannot open private cards', () => {
  const ui = harness();
  const countOnly = count => new Proxy({}, { get(_, key) {
    if (key === 'length') return count;
    throw new Error('Private card identity accessed');
  } });
  const opponent = { name: 'Opponent', hand: countOnly(7), library: countOnly(92) };
  for (const [zone, count] of [['hand', 7], ['library', 92]]) {
    const counter = ui.zoneCounter(opponent, zone);
    assert.equal(counter.tagName, 'span');
    assert.equal(counter.onclick, undefined);
    assert.ok(counter.attributes['aria-label'].includes(`${count} cards`));
    assert.ok(counter.innerHTML.includes(`<b>${count}</b>`));
  }
});

test('public counters open the selected owner and zone without answering a pending decision', () => {
  const ui = harness(), opponent = { name: 'Opponent', idx: 2, graveyard: [{}], exile: [], command: [{}] };
  const pending = ui.pending = { q: { type: 'chooseTargets' }, sel: [] };
  for (const zone of ['graveyard', 'exile', 'command']) {
    ui.playerSheet = opponent;
    const counter = ui.zoneCounter(opponent, zone, { returnPlayer: opponent });
    let stopped = false;
    counter.onclick({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.equal(ui.zoneBrowse.player, opponent);
    assert.equal(ui.zoneBrowse.zone, zone);
    assert.equal(ui.zoneBrowse.returnPlayer, opponent);
    assert.equal(ui.playerSheet, null);
    assert.equal(ui.pending, pending);
  }
});

test('graveyard targets keep their legal-target affordance on the shared zone counter', () => {
  const ui = harness(), opponent = { name: 'Opponent', idx: 1, graveyard: [{}, {}] };
  ui.targetZoneCandidates = (_, zone) => zone === 'graveyard' ? [opponent.graveyard[0]] : [];
  const counter = ui.zoneCounter(opponent, 'graveyard');
  assert.ok(counter.className.includes('targetzone'));
  assert.equal(counter.dataset.targetPlayer, '1');
  assert.match(counter.attributes['aria-label'], /1 legal target/);
  assert.equal(counter.children[0].innerHTML, 'CHOOSE');
});
