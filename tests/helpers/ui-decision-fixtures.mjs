import fs from 'node:fs';
import vm from 'node:vm';
import {loadEngine} from './load-engine.mjs';

export const M = loadEngine();
const source = fs.readFileSync(process.env.DECISION_UI_SOURCE || new URL('../../src/modules/ui.js', import.meta.url), 'utf8');

// Rendering uses the production decision controls. Only browser layout,
// localization and image parsing are omitted from this small DOM fixture.
export function decisionTable() {
  const document = {activeElement: null, addEventListener() {}};
  class Node {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.attributes = new Map(); this.listeners = new Map();
      this.inert = false; this.style = {setProperty() {}};
      this.classList = {add: (...names) => {this.className = [...new Set([...String(this.className || '').split(' ').filter(Boolean), ...names])].join(' ');},
        contains: name => String(this.className || '').split(' ').includes(name)};
      this.dataset = new Proxy({}, {set: (data, key, value) => {
        data[key] = String(value); this.setAttribute('data-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), value); return true;
      }});
    }
    appendChild(child) {child.remove(); this.children.push(child); child.parentNode = this; return child;}
    replaceChildren(...children) {for (const child of [...this.children]) child.remove(); for (const child of children) this.appendChild(child);}
    remove() {if (this.contains(document.activeElement)) document.activeElement = document.body;
      if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null;}
    get isConnected() {return this === document.body || !!this.parentNode?.isConnected;}
    get textContent() {return this._text || String(this.innerHTML || '').replace(/<[^>]*>/g, '') + this.children.map(child => child.textContent).join('');}
    set textContent(text) {this._text = String(text);}
    setAttribute(key, value) {this.attributes.set(key, String(value));}
    getAttribute(key) {return this.attributes.get(key) ?? null;}
    removeAttribute(key) {this.attributes.delete(key);}
    addEventListener(type, fn) {this.listeners.set(type, fn);}
    insertAdjacentHTML(_position, html) {this.innerHTML = String(this.innerHTML || '') + html;}
    contains(node) {return node === this || this.children.some(child => child.contains(node));}
    matches(selector) {
      if (selector.includes(':not(:disabled)') && this.disabled) return false;
      selector = selector.replace(':not(:disabled)', '');
      if (selector === '*') return true;
      if (selector.startsWith('[')) {const match = /^\[([^=]+)="([^"]+)"\]$/.exec(selector); return !!match && this.getAttribute(match[1]) === match[2];}
      const parts = selector.split('.'), tag = parts.shift();
      return (!tag || tag.toUpperCase() === this.tagName) && parts.every(cls => this.classList.contains(cls));
    }
    descendants() {return this.children.flatMap(child => [child, ...child.descendants()]);}
    querySelectorAll(selector) {return this.descendants().filter(node => selector.split(',').some(part => {
      const chain = part.trim().split(' ').reverse(); if (!node.matches(chain.shift())) return false;
      let parent = node.parentNode;
      return chain.every(ancestor => {while (parent && !parent.matches(ancestor)) parent = parent.parentNode;
        if (!parent) return false; parent = parent.parentNode; return true;});
    }));}
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
    focus() {for (let node = this; node; node = node.parentNode) if (node.inert) return; document.activeElement = this;}
    click() {if (!this.disabled) return this.onclick?.({target: this});}
  }
  document.body = new Node('body'); document.activeElement = document.body;
  const root = document.body.appendChild(new Node('div'));
  document.createElement = tag => new Node(tag);
  document.querySelector = selector => selector === '#game' ? root : null;
  const library = {...M, localizeTree() {}};
  vm.runInNewContext(source, {MTG: library, document, Error, console, setTimeout, clearTimeout, requestAnimationFrame: callback => callback()});
  const game = new M.Game({seed: 131028, paced: false});
  const me = game.addPlayer('You', {name: 'Decision callbacks'}, null, false);
  const rival = game.addPlayer('Opponent', {name: 'Decision callbacks'}, {decide: async (_g, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'orderTriggers') return q.triggers;
    throw Error(`Unexpected opponent decision: ${q.type}`);
  }}, true);
  game.turnPlayer = me; game.turnNo = 7; game.phase = 'main1'; game.step = 'main'; game.speedFactor = 0;
  const ui = Object.assign(Object.create(library.UI.prototype), {game, me, pendings: [], prioMode: 'off', renderArena() {
    root.replaceChildren();
    const modal = this.renderDecisionModal(game);
    if (modal) root.appendChild(modal);
    else if (this.pending?.q.type === 'chooseTargets') root.appendChild(this.renderPromptBar(game));
  }});
  me.controller = ui.controllerFor(me);
  const put = (name, zone = 'battlefield', owner = me) => {
    const card = new M.CardInst(M.DEFS[name], owner); card.zone = zone; card.sick = false;
    (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card); game.recalc(); return card;
  };
  return {game, me, rival, ui, root, document, put};
}

export async function until(predicate) {
  for (let n = 0; n < 100; n++) {if (predicate()) return; await new Promise(resolve => setImmediate(resolve));}
  if (!predicate()) throw Error('Expected native decision was not reached');
}

export function button(f, label) {
  const node = f.root.querySelectorAll('button').find(node => label instanceof RegExp ? label.test(node.textContent) : node.textContent === label);
  if (!node) throw Error(`Missing rendered control ${label}: ${f.ui.renderError?.message || f.root.textContent}`);
  return node;
}
