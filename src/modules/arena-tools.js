// Arena tools use the same card sheets and commands as the visible interface.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  if (typeof document === 'undefined' || !MTG.UI) return;
  const U = MTG;
  const node = (tag, cls, text) => {
    const item = document.createElement(tag);
    item.className = cls;
    if (text !== undefined) item.textContent = text;
    return item;
  };
  U.UI.prototype.openCommandPalette = function () {
    if (this.commandPaletteOpen || this.fatalError) return;
    this.commandPaletteOpen = true;
    const ui = this, gameRoot = document.querySelector('#game');
    const returnFocus = document.activeElement;
    const overlay = node('div', 'commandpaletteov');
    const panel = node('section', 'commandpalette');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Find a card or command');
    const head = node('header', 'commandpalettehead');
    const title = node('div', '', 'Find a card or command');
    const hint = node('small', '', 'Your hand, public zones, and table controls');
    title.appendChild(hint);
    const close = node('button', 'commandclose', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close search');
    head.append(title, close);
    const input = node('input', 'commandsearch');
    input.type = 'search';
    input.placeholder = 'Search cards, graveyard, settings…';
    input.setAttribute('aria-label', 'Search cards and commands');
    input.setAttribute('aria-controls', 'command-results');
    input.autocomplete = 'off';
    input.spellcheck = false;
    const results = node('div', 'commandresults');
    results.id = 'command-results';
    const status = node('div', 'commandstatus');
    status.setAttribute('role', 'status');
    const foot = node('footer', 'commandfooter', '↑ ↓ Navigate   ·   Enter Open   ·   Esc Close');
    panel.append(head, input, status, results, foot);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    gameRoot.inert = true;
    let active = -1;
    const dismiss = () => {
      overlay.remove();
      gameRoot.inert = false;
      ui.commandPaletteOpen = false;
      ui.closeCommandPalette = null;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      else document.querySelector('.commandbutton')?.focus({ preventScroll: true });
    };
    ui.closeCommandPalette = dismiss;
    close.onclick = dismiss;
    overlay.onclick = event => { if (event.target === overlay) dismiss(); };
    const commands = [
      ['Arena settings', 'Display, pacing, and accessibility', () => { ui.quickMenuOpen = true; ui.render(); }],
      ['Game log', 'Review every public event', () => ui.openUtility('log')],
      ['Stack and table', 'Stack, commander damage, and threat', () => ui.openUtility('table')],
      ['Priority stops', 'Choose when the game waits for you', () => { ui.showStops = true; ui.render(); }],
      ['Help and shortcuts', 'Controls and a quick rules guide', () => { ui.showHelp = true; ui.render(); }],
      ['Your graveyard', 'Browse cards in your graveyard', () => { ui.zoneBrowse = { player: ui.me, zone: 'graveyard' }; ui.render(); }],
    ];
    const draw = () => {
      const query = input.value.trim().toLowerCase();
      results.replaceChildren();
      active = -1;
      const actions = commands.filter(([label, description]) => `${label} ${description}`.toLowerCase().includes(query));
      const cards = query ? U.searchableCards(ui.game, ui.me).filter(item => query.split(/\s+/).every(word => item.text.includes(word))) : [];
      const add = (label, detail, run, card) => {
        const button = node('button', 'commandresult');
        button.type = 'button';
        if (card) {
          button.dataset.cardId = String(card.iid);
          const img = node('img', '');
          img.src = U.cardImageURL(card.name, 'art');
          img.alt = '';
          img.onerror = () => U.imgFail(img);
          button.appendChild(img);
        } else button.appendChild(node('span', 'commandresulticon', '↗'));
        const copy = node('span', 'commandresultcopy');
        copy.append(node('b', '', label), node('small', '', detail));
        button.append(copy, node('span', 'commandresultgo', '↵'));
        button.onclick = () => { dismiss(); run(); };
        results.appendChild(button);
      };
      actions.forEach(([label, detail, run]) => add(label, detail, run));
      cards.slice(0, 40).forEach(({ card, zone, owner }) => add(card.name, `${zone} · ${(owner || card.ctrl || card.owner)?.name || ''}`, () => {
        if (U.searchableCards(ui.game, ui.me).some(item => item.card === card)) {
          ui.sheet = { card, fromSearch: true }; ui.render();
        } else ui.toast('That card is no longer in a visible zone.');
      }, card));
      status.textContent = query ? `${cards.length} card${cards.length === 1 ? '' : 's'} · ${actions.length} command${actions.length === 1 ? '' : 's'}${cards.length > 40 ? ' · first 40 cards shown' : ''}` : 'Table shortcuts';
      if (!results.childElementCount) results.appendChild(node('p', 'commandempty', 'No matches. Try a card name, a zone, or “settings”.'));
    };
    input.oninput = draw;
    panel.onkeydown = event => {
      const buttons = [...results.querySelectorAll('button')];
      if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) { event.preventDefault(); event.stopPropagation(); dismiss(); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const current = buttons.indexOf(document.activeElement);
        if (current >= 0) active = current;
        active = Math.max(0, Math.min(buttons.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
        buttons.forEach((button, i) => button.classList.toggle('active', i === active));
        buttons[active]?.focus();
        buttons[active]?.scrollIntoView({ block: 'nearest' });
      }
      if (event.key === 'Enter' && event.target === input) { event.preventDefault(); buttons[0]?.click(); }
      if (event.key === 'Tab') {
        const controls = [close, input, ...buttons];
        if (event.shiftKey && event.target === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
        else if (!event.shiftKey && event.target === controls.at(-1)) { event.preventDefault(); close.focus(); }
      }
    };
    draw();
    input.focus();
  };

  U.UI.prototype.renderHandTools = function () {
    const tools = node('div', 'handtools');
    const title = node('span', 'handtoolstitle', `Your hand · ${this.me.hand.length}`);
    const label = node('label', 'handsortlabel');
    label.appendChild(node('span', '', 'Sort'));
    const select = node('select', 'handsort');
    select.setAttribute('aria-label', 'Sort your hand');
    for (const [value, name] of [['draw', 'Draw order'], ['mana', 'Mana value'], ['type', 'Card type'], ['name', 'Name']]) {
      const option = node('option', '', name); option.value = value; option.selected = value === this.handSort; select.appendChild(option);
    }
    select.onchange = () => {
      this.handSort = select.value;
      U.savePlayerPreferences({ handSort: this.handSort });
      this.render();
      document.querySelector('.handsort')?.focus({ preventScroll: true });
    };
    label.appendChild(select);
    tools.append(title, label);
    return tools;
  };
})();
