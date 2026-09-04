import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { loadEngine } from './helpers/load-engine.mjs';

const uiSource = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function browserHarness() {
  const MTG = { ...loadEngine() };
  const document = {
    readyState: 'loading',
    addEventListener() {},
    querySelector() { return null; },
    createElement(tagName) {
      const node = {
        tagName, className: '', innerHTML: '', children: [], dataset: {}, attributes: {},
        style: { setProperty() {} },
        appendChild(child) { this.children.push(child); return child; },
        setAttribute(key, value) { this.attributes[key] = value; },
      };
      node.classList = {
        add(...names) { node.className += ` ${names.join(' ')}`; },
        contains(name) { return node.className.split(/\s+/).includes(name); },
      };
      return node;
    },
  };
  runInNewContext(uiSource, {
    MTG, document, window: { addEventListener() {} }, console, setTimeout, clearTimeout,
    localStorage: { getItem() { return null; }, setItem() {} },
  });
  const ui = new MTG.UI();
  const game = new MTG.Game({ seed: 40904, paced: false, maxTurns: 5 });
  const human = game.addPlayer('You', { name: 'Damage UI test' }, null, false);
  const bot = game.addPlayer('Local bot', { name: 'Damage UI test' }, null, true);
  game.turnPlayer = human;
  ui.game = game;
  ui.me = human;
  const permanent = (name, owner = human) => {
    const card = new MTG.CardInst(MTG.DEFS[name], owner);
    card.zone = 'battlefield';
    game.battlefield.push(card);
    game.recalc();
    return card;
  };
  return { MTG, game, human, bot, ui, permanent };
}

function markup(node) {
  return `${node.innerHTML || ''}${(node.children || []).map(markup).join('')}`;
}

for (const recipient of ['human', 'bot']) {
  test(`${recipient}: Tree keeps 0/40 after actual damage while mini and sheet show 6 marked damage`, async () => {
    const { game, human, bot, ui, permanent } = browserHarness();
    const tree = permanent('Tree of Perdition', recipient === 'human' ? human : bot);
    tree.meta.touOverride = 40;
    game.recalc();
    await game.damageCreature(null, tree, 6, { combat: true });
    assert.equal(tree.zone, 'battlefield');
    assert.equal(tree.toughness, 40);
    assert.equal(tree.damage, 6);
    const mini = ui.miniCard(game, tree, { sm: recipient === 'bot' });
    assert.match(mini.innerHTML, /class="pt">0\/40<\/div>/);
    assert.match(mini.innerHTML, /class="markeddamage"[^>]*data-damage="6"/);
    assert.match(mini.innerHTML, />6 DMG<\/span>/);
    assert.match(mini.attributes['aria-label'], /6 damage marked/);
    assert.match(mini.title, /34 more damage to reach lethal/);
    ui.sheet = { card: tree };
    const sheet = markup(ui.renderCardSheet(game));
    assert.match(sheet, /6 damage marked/);
    assert.match(sheet, /34 more damage to reach lethal/);
    assert.match(sheet, /Damage does not reduce toughness/);
    assert.match(sheet, /clears during cleanup/);
    assert.doesNotMatch(sheet, /0\/34/);
  });
}

test('zero, cleared damage, noncreatures and cards outside the battlefield have no marked-damage UI', () => {
  const { game, ui, permanent } = browserHarness();
  const tree = permanent('Tree of Perdition');
  ui.sheet = { card: tree };
  for (const amount of [0, undefined, -1, NaN, Infinity]) {
    tree.damage = amount;
    assert.doesNotMatch(ui.miniCard(game, tree).innerHTML, /class="markeddamage"/);
    assert.doesNotMatch(markup(ui.renderCardSheet(game)), /class="smarkeddamage"/);
  }
  tree.damage = 2;
  assert.match(ui.miniCard(game, tree).innerHTML, /2 DMG/);
  tree.damage = 0; // The cleanup step clears marked damage; the next render must remove the badge.
  assert.doesNotMatch(ui.miniCard(game, tree).innerHTML, /DMG/);
  assert.doesNotMatch(markup(ui.renderCardSheet(game)), /damage marked/);
  tree.zone = 'graveyard';
  tree.damage = 2;
  assert.doesNotMatch(ui.miniCard(game, tree).innerHTML, /DMG/);
  assert.doesNotMatch(markup(ui.renderCardSheet(game)), /damage marked/);
  const rock = permanent('Sol Ring');
  rock.damage = 2;
  ui.sheet = { card: rock };
  assert.doesNotMatch(ui.miniCard(game, rock).innerHTML, /DMG/);
  assert.doesNotMatch(markup(ui.renderCardSheet(game)), /damage marked/);
});

test('marked damage never merges with a differently damaged copy, including deathtouch state', () => {
  const { ui, permanent } = browserHarness();
  const cards = [0, 0, 1, 2, 2].map(damage => {
    const card = permanent('Tree of Perdition');
    card.damage = damage;
    card.isToken = true;
    return card;
  });
  assert.deepEqual(Array.from(ui.groupPerms(cards), entry => [entry.card.damage, entry.n]), [[0, 2], [1, 1], [2, 2]]);
  cards[4].deathtouched = true;
  assert.equal(ui.groupPerms(cards).length, 4);
  ui.pending = { q: { type: 'blockers' } };
  assert.equal(ui.groupPerms(cards).length, 5, 'combat choices still expand all copies');
});

test('indestructible and deathtouch descriptions do not pretend toughness is remaining health', () => {
  const { game, ui, permanent } = browserHarness();
  const tree = permanent('Tree of Perdition');
  tree.damage = 1;
  tree.deathtouched = true;
  tree.cur.kw.add('indestructible');
  ui.sheet = { card: tree };
  let sheet = markup(ui.renderCardSheet(game));
  assert.match(sheet, /Deathtouch damage is marked/);
  assert.match(sheet, /Indestructible prevents destruction from damage/);
  assert.doesNotMatch(sheet, /12 more damage/);
  tree.deathtouched = false;
  tree.damage = 15;
  sheet = markup(ui.renderCardSheet(game));
  assert.match(sheet, /Lethal damage is marked/);
  assert.doesNotMatch(sheet, /-2 more/);
});

test('marked damage preserves keyword and minus-counter badges without altering printed P/T semantics', () => {
  const { game, ui, permanent } = browserHarness();
  const tree = permanent('Tree of Perdition');
  tree.counters['-1/-1'] = 2;
  game.recalc();
  tree.damage = 3;
  const html = ui.miniCard(game, tree).innerHTML;
  assert.match(html, /class="pt">-2\/11<\/div>/);
  assert.match(html, />3 DMG<\/span>/);
  assert.match(html, /class="m1counter"/);
  assert.match(html, /data-keyword="defender"/);
  assert.match(html, /8 more damage to reach lethal/);
});

test('small damaged cards and their attachment piles grow to fit complete stat labels', () => {
  const { game, ui, permanent } = browserHarness();
  const tree = permanent('Tree of Perdition');
  tree.meta.touOverride = 12345;
  game.recalc();
  tree.damage = 6789;
  const mini = ui.miniCard(game, tree, { sm: true });
  assert.match(mini.className, /has-marked-damage/);
  assert.match(mini.innerHTML, />6789 DMG<\/span>/);
  assert.match(mini.innerHTML, /class="pt">0\/12345<\/div>/);
  assert.match(cssSource, /\.mini\.has-marked-damage\s*\{\s*min-width:\s*max-content\s*;/);
  assert.match(cssSource, /\.permanentpile:has\(> \.mini\.has-marked-damage\)\s*\{\s*min-width:\s*max-content\s*;/);
  const statsRule = cssSource.match(/\.mini \.markeddamagestats\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(statsRule, /position:\s*relative\s*;/, 'in-flow stats contribute to intrinsic card width');
  assert.doesNotMatch(statsRule, /position:\s*absolute|overflow:\s*hidden/, 'the stat row must not be clipped into the old fixed width');
});
