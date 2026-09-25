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
  U.UI.prototype.applyArenaBackground = function (root = document.querySelector('#game')) {
    if (!root) return;
    const preset = U.ARENA_BACKGROUNDS.find(item => item.id === this.arenaBackground) || U.ARENA_BACKGROUNDS[0];
    root.dataset.arenaBackground = preset.id;
    root.style.setProperty('--arena-shade', String(U.normalizeArenaDim(this.arenaDim) / 100));
  };
  U.UI.prototype.renderArenaBackgrounds = function () {
    const ui = this, overlay = node('div', 'quickmenuov arenabackgroundov');
    const panel = node('section', 'quickmenu arenabackgroundpicker');
    const head = node('header', 'quickmenuhead');
    const heading = node('div', '');
    heading.append(node('span', '', 'Make it your table'), node('h2', '', 'Arena background'));
    const close = node('button', 'quickmenuclose', '×');
    close.type = 'button'; close.setAttribute('aria-label', 'Close arena backgrounds');
    const dismiss = () => {
      ui.quickMenuOpen = false; ui.render();
      document.querySelector('.menubutton')?.focus({ preventScroll: true });
    };
    close.onclick = dismiss;
    head.append(heading, close);
    const body = node('div', 'arenabackgroundbody');
    const preview = node('div', 'arenabackgroundpreview');
    const caption = node('div', 'arenabackgroundcaption');
    const name = node('b', ''), detail = node('span', '');
    caption.append(name, detail); preview.appendChild(caption); body.appendChild(preview);
    const status = node('div', 'arenabackgroundstatus', 'Applied immediately · saved on this device');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const selectPreset = id => {
      ui.arenaBackground = id;
      const saved = U.savePlayerPreferences({ arenaBackground: id, arenaDim: ui.arenaDim });
      ui.applyArenaBackground();
      update();
      status.textContent = saved ? `${name.textContent} applied · saved on this device` : `${name.textContent} applied for this session · device storage is unavailable`;
    };
    for (const group of ['Mana colors', 'Scenes']) {
      const section = node('section', 'arenabackgroundsection');
      const label = node('h3', '', group); label.id = group === 'Scenes' ? 'arena-scenes-label' : 'arena-colors-label';
      const grid = node('div', `arenabackgroundgrid ${group === 'Scenes' ? 'scenes' : 'colors'}`);
      grid.setAttribute('role', 'group'); grid.setAttribute('aria-labelledby', label.id);
      for (const preset of U.ARENA_BACKGROUNDS.filter(item => item.group === group)) {
        const button = node('button', 'arenabackgroundchoice');
        button.type = 'button'; button.dataset.arenaBackground = preset.id;
        button.setAttribute('aria-label', `${preset.label} background`);
        const art = node('span', 'arenabackgroundart'); art.setAttribute('aria-hidden', 'true');
        if (preset.mana) {
          const mana = node('img', ''); mana.src = `./assets/mana/${preset.mana}.svg`; mana.alt = ''; art.appendChild(mana);
        }
        const selected = node('span', 'arenabackgroundcheck', '✓'); selected.setAttribute('aria-hidden', 'true');
        button.append(art, node('span', 'arenabackgroundlabel', preset.label), selected);
        button.onclick = () => selectPreset(preset.id);
        grid.appendChild(button);
      }
      section.append(label, grid); body.appendChild(section);
    }
    const dimmer = node('div', 'arenabackgrounddimmer');
    const dimLabel = node('label', '', 'Dim background'); dimLabel.htmlFor = 'arena-background-dim';
    const dimValue = node('output', ''); dimValue.htmlFor = 'arena-background-dim';
    const input = node('input', ''); input.id = 'arena-background-dim'; input.type = 'range';
    input.min = '0'; input.max = '75'; input.step = '5'; input.value = String(ui.arenaDim);
    input.oninput = () => {
      ui.arenaDim = U.normalizeArenaDim(Number(input.value));
      const saved = U.savePlayerPreferences({ arenaBackground: ui.arenaBackground, arenaDim: ui.arenaDim });
      ui.applyArenaBackground(); update();
      status.textContent = saved ? 'Applied immediately · saved on this device' : 'Applied for this session · device storage is unavailable';
    };
    dimmer.append(dimLabel, dimValue, input); body.appendChild(dimmer);
    const foot = node('footer', 'arenabackgroundfooter');
    const back = node('button', 'pbtn arenabackgroundback', '← Arena controls'); back.type = 'button';
    back.onclick = () => { ui.quickMenuOpen = true; ui.render(); document.querySelector('.arenabackgroundopen')?.focus({ preventScroll: true }); };
    const done = node('button', 'pbtn primary arenabackgrounddone', 'Done'); done.type = 'button'; done.onclick = dismiss;
    foot.append(back, done);
    body.append(status); panel.append(head, body, foot); overlay.appendChild(panel);
    overlay.onclick = event => { if (event.target === overlay) dismiss(); };
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    });
    function update() {
      const preset = U.ARENA_BACKGROUNDS.find(item => item.id === ui.arenaBackground) || U.ARENA_BACKGROUNDS[0];
      preview.dataset.arenaBackground = preset.id;
      preview.style.setProperty('--arena-shade', String(ui.arenaDim / 100));
      name.textContent = preset.label; detail.textContent = preset.detail;
      dimValue.textContent = `${ui.arenaDim}%`;
      input.setAttribute('aria-valuetext', `${ui.arenaDim}% dimmed`);
      panel.querySelectorAll('.arenabackgroundchoice').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.arenaBackground === preset.id));
      });
    }
    update();
    return overlay;
  };
  U.UI.prototype.applyPlaymat = function (root = document.querySelector('#game')) {
    if (!root) return;
    const preset = U.PLAYMATS.find(item => item.id === this.playmat) || U.PLAYMATS[0];
    root.dataset.playmat = preset.id;
    root.style.setProperty('--playmat-cover', String(1 - U.normalizePlaymatStrength(this.playmatStrength) / 100));
  };
  U.UI.prototype.renderPlaymats = function () {
    const ui = this, overlay = node('div', 'quickmenuov playmatov');
    const panel = node('section', 'quickmenu arenabackgroundpicker playmatpicker');
    const head = node('header', 'quickmenuhead');
    const heading = node('div', '');
    heading.append(node('span', '', 'A little atmosphere. A clear battlefield.'), node('h2', '', 'Playmats'));
    const dismiss = () => {
      ui.quickMenuOpen = false; ui.render();
      document.querySelector('.menubutton')?.focus({ preventScroll: true });
    };
    const close = node('button', 'quickmenuclose', '×');
    close.type = 'button'; close.setAttribute('aria-label', 'Close playmats'); close.onclick = dismiss;
    head.append(heading, close);
    const body = node('div', 'arenabackgroundbody');
    const preview = node('div', 'playmatpreview');
    const previewLabel = node('span', 'playmatpreviewlabel', 'BATTLEFIELD PREVIEW');
    const previewCard = node('div', 'playmatpreviewcard');
    previewCard.innerHTML = `${U.icon('cards')}<b>Cards stay clear</b><small>Artwork sits beneath the board</small>`;
    const previewZones = node('div', 'playmatpreviewzones');
    for (const [key, label, count] of [['cards', 'Hand', 7], ['graveyard', 'Graveyard', 3], ['exile', 'Exile', 2]]) {
      const stat = node('span', ''); stat.innerHTML = `${U.icon(key)}<span>${label}</span><b>${count}</b>`; previewZones.append(stat);
    }
    preview.append(previewLabel, previewCard, previewZones); body.append(preview);
    body.append(node('p', 'playmathint', 'One motif across every battlefield. Cards, life totals and zone counters keep their own solid surfaces.'));
    if (document.body.classList.contains('high-contrast')) body.append(node('p', 'playmathint', 'High contrast is on: battlefield artwork is hidden. Your playmat choice is kept.'));
    const choices = node('div', 'arenabackgroundgrid scenes playmatchoices');
    choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', 'Playmat design');
    const status = node('div', 'arenabackgroundstatus'); status.setAttribute('role', 'status');
    const save = () => {
      const saved = U.savePlayerPreferences({ playmat: ui.playmat, playmatStrength: ui.playmatStrength });
      ui.applyPlaymat(); update();
      status.textContent = saved ? 'Applied immediately · saved on this device' : 'Applied for this session · device storage is unavailable';
    };
    for (const preset of U.PLAYMATS) {
      const choice = node('button', 'arenabackgroundchoice playmatchoice');
      choice.type = 'button'; choice.dataset.playmat = preset.id;
      choice.setAttribute('aria-label', preset.id === 'none' ? 'No playmat' : `${preset.label} playmat`); choice.title = preset.detail;
      const art = node('span', 'arenabackgroundart playmatart'); art.setAttribute('aria-hidden', 'true');
      const selected = node('span', 'arenabackgroundcheck', '✓'); selected.setAttribute('aria-hidden', 'true');
      choice.append(art, node('span', 'arenabackgroundlabel', preset.label), selected);
      choice.onclick = () => { ui.playmat = preset.id; save(); };
      choices.append(choice);
    }
    body.append(choices);
    const dimmer = node('div', 'arenabackgrounddimmer');
    const label = node('label', '', 'Artwork strength'); label.htmlFor = 'playmat-strength';
    const amount = node('output', ''); amount.htmlFor = 'playmat-strength';
    const input = node('input', ''); input.id = 'playmat-strength'; input.type = 'range';
    input.min = '0'; input.max = '35'; input.step = '5'; input.value = String(ui.playmatStrength);
    input.oninput = () => { ui.playmatStrength = U.normalizePlaymatStrength(Number(input.value)); save(); };
    dimmer.append(label, amount, input); body.append(dimmer, status);
    const foot = node('footer', 'arenabackgroundfooter');
    const back = node('button', 'pbtn', '← Arena controls'); back.type = 'button';
    back.onclick = () => { ui.quickMenuOpen = true; ui.render(); document.querySelector('.playmatsopen')?.focus({ preventScroll: true }); };
    const done = node('button', 'pbtn primary', 'Done'); done.type = 'button'; done.onclick = dismiss;
    foot.append(back, done); panel.append(head, body, foot); overlay.append(panel);
    overlay.onclick = event => { if (event.target === overlay) dismiss(); };
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    });
    function update() {
      preview.dataset.playmat = ui.playmat;
      preview.style.setProperty('--playmat-cover', String(1 - ui.playmatStrength / 100));
      amount.textContent = `${ui.playmatStrength}%`;
      input.disabled = ui.playmat === 'none';
      input.setAttribute('aria-valuetext', `${ui.playmatStrength}% artwork strength`);
      choices.querySelectorAll('.playmatchoice').forEach(choice => {
        choice.setAttribute('aria-pressed', String(choice.dataset.playmat === ui.playmat));
      });
    }
    update();
    return overlay;
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
      ['Music & sound', 'Fantasy lo-fi, volume, and mute', () => { ui.quickMenuOpen = 'audio'; ui.render(); }],
      ['Arena background', 'Mana colors, scenes, and brightness', () => { ui.quickMenuOpen = 'backgrounds'; ui.render(); }],
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
          button.insertAdjacentHTML('beforeend', U.cardArtHTML(card));
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
    const title = node('span', 'handtoolstitle');
    title.innerHTML = `${U.icon('cards')}<span>Your hand</span><b>${this.me.hand.length}</b>`;
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
    const expand = node('button', 'handexpand', this.mobileView === 'hand' ? 'Back to board' : 'View all');
    expand.type = 'button';
    expand.setAttribute('aria-label', this.mobileView === 'hand' ? 'Return to your battlefield' : 'Show all hand cards');
    expand.setAttribute('aria-expanded', String(this.mobileView === 'hand'));
    expand.onclick = () => this.showMobileView(this.mobileView === 'hand' ? 'mine' : 'hand');
    tools.append(title, label, expand);
    return tools;
  };
})();
