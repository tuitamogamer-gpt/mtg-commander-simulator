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
  // Explicit navigation replaces the current inspection surface. Keep engine
  // questions, paused-game state, drafts, and the underlying table view intact.
  U.UI.prototype.clearInspectionViews = function () {
    this.dungeonPanel = null;
    this.sheet = null;
    this.zoneBrowse = null;
    this.playerSheet = null;
    this.lastResortConfirm = false;
    this.quickMenuOpen = false;
    this.showStops = false;
    this.showJudge = false;
    this.showHelp = false;
    this.showLog = false;
  };
  U.UI.prototype.openCommandPalette = function () {
    if (this.commandPaletteOpen || this.fatalError) return;
    this.commandPaletteOpen = true;
    const ui = this, game = this.game, viewer = this.me;
    const gameRoot = document.querySelector('#game');
    const returnFocus = document.activeElement, wasInert = !!gameRoot?.inert;
    const overlay = node('div', 'commandpaletteov');
    const panel = node('section', 'commandpalette');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Find a card or command');
    const head = node('header', 'commandpalettehead');
    const title = node('div', 'commandpalettetitle', 'Find a card or command');
    const hint = node('small', '', 'Your hand, public zones, and table controls');
    title.appendChild(hint);
    const close = node('button', 'commandclose', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close search');
    head.append(title, close);
    const search = node('div', 'commandsearchwrap');
    const input = node('input', 'commandsearch');
    input.type = 'search';
    input.placeholder = 'Card name, zone, or setting';
    input.setAttribute('aria-label', 'Search cards and commands');
    input.setAttribute('aria-controls', 'command-results');
    input.autocomplete = 'off';
    input.spellcheck = false;
    const clear = node('button', 'commandclear', 'Clear');
    clear.type = 'button';
    clear.setAttribute('aria-label', 'Clear search');
    clear.hidden = true;
    search.append(input, clear);
    const results = node('div', 'commandresults');
    results.id = 'command-results';
    const status = node('div', 'commandstatus');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    const foot = node('footer', 'commandfooter');
    for (const [key, label] of [['↑ ↓', 'Navigate'], ['Enter', 'Open'], ['Esc', 'Close']]) {
      const item = node('span', 'commandfooterhint');
      item.append(node('kbd', '', key), node('span', '', label));
      foot.appendChild(item);
    }
    panel.append(head, search, status, results, foot);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    if (gameRoot) gameRoot.inert = true;
    let active = -1, closed = false;
    const dismiss = () => {
      if (closed) return;
      closed = true;
      overlay.remove();
      if (gameRoot) gameRoot.inert = wasInert;
      ui.commandPaletteOpen = false;
      ui.closeCommandPalette = null;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      else document.querySelector('.commandbutton')?.focus({ preventScroll: true });
    };
    const isCurrent = () => !closed && overlay.isConnected && ui.closeCommandPalette === dismiss && ui.game === game && ui.me === viewer;
    ui.closeCommandPalette = dismiss;
    close.onclick = dismiss;
    overlay.onclick = event => { if (event.target === overlay) dismiss(); };
    const commands = [
      ['settings', 'Arena settings', 'Display, pacing, and accessibility', 'menu', 'preferences options contrast motion speed', () => { ui.quickMenuOpen = true; ui.render(); }],
      ['audio', 'Music & sound', 'Music, volume, and mute', 'mana', 'audio effects music sound volume mute', () => { ui.quickMenuOpen = 'audio'; ui.render(); }],
      ['backgrounds', 'Arena background', 'Mana colors, scenes, and brightness', 'playmat', 'appearance theme wallpaper dim', () => { ui.quickMenuOpen = 'backgrounds'; ui.render(); }],
      ['playmats', 'Playmats', 'Choose your battlefield material', 'playmat', 'play mats appearance table felt', () => { ui.quickMenuOpen = 'playmats'; ui.render(); }],
      ['cardbacks', 'Card backs', 'Choose a sleeve for concealed cards', 'cards', 'cardbacks sleeves appearance deck', () => { ui.quickMenuOpen = 'cardbacks'; ui.render(); }],
      ['log', 'Game log', 'Review every public event', 'log', 'history timeline activity', () => ui.openUtility('log')],
      ['table', 'Stack and table', 'Stack, commander damage, and threat', 'stack', 'battlefield information', () => ui.openUtility('table')],
      ['stops', 'Priority stops', 'Choose when the game waits for you', 'hold', 'pause response combat timing', () => { ui.showStops = true; ui.render(); }],
      ['help', 'Help and shortcuts', 'Controls and a quick rules guide', 'info', 'keyboard how play instructions', () => { ui.showHelp = true; ui.render(); }],
      ['graveyard', 'Your graveyard', 'Browse cards in your graveyard', 'graveyard', 'discard dead', () => { ui.zoneBrowse = { player: viewer, zone: 'graveyard' }; ui.render(); }],
    ];
    const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const activate = run => {
      if (!isCurrent()) return;
      dismiss();
      run();
    };
    const draw = () => {
      if (!isCurrent()) { dismiss(); return; }
      const query = normalize(input.value.trim()), words = query.split(/\s+/).filter(Boolean);
      const matches = value => words.every(word => normalize(value).includes(word));
      results.replaceChildren();
      clear.hidden = !input.value;
      active = -1;
      const actions = commands.filter(([, label, description, , aliases]) => matches(`${label} ${description} ${aliases}`));
      const cards = query ? U.searchableCards(game, viewer).filter(item => matches(item.text)) : [];
      const group = (name, count, key) => {
        const section = node('section', 'commandgroup');
        const heading = node('h2', 'commandgrouphead', name);
        heading.id = `command-group-${key}`;
        heading.appendChild(node('span', 'commandgroupcount', String(count)));
        section.setAttribute('aria-labelledby', heading.id);
        section.appendChild(heading);
        results.appendChild(section);
        return section;
      };
      const add = (parent, label, detail, run, card, icon, key) => {
        const button = node('button', 'commandresult');
        button.type = 'button';
        if (card) {
          button.dataset.cardId = String(card.iid);
          button.insertAdjacentHTML('beforeend', U.cardArtHTML(card));
        } else {
          button.dataset.command = key;
          const symbol = node('span', 'commandresulticon');
          symbol.innerHTML = U.icon(icon);
          button.appendChild(symbol);
        }
        const copy = node('span', 'commandresultcopy');
        copy.append(node('b', '', label), node('small', '', detail));
        const go = node('span', 'commandresultgo');
        go.innerHTML = U.icon('expand');
        button.append(copy, go);
        button.onclick = () => activate(run);
        button.onfocus = () => {
          const buttons = [...results.querySelectorAll('.commandresult')];
          active = buttons.indexOf(button);
          buttons.forEach((item, index) => item.classList.toggle('active', index === active));
        };
        parent.appendChild(button);
      };
      if (actions.length) {
        const section = group('Commands', actions.length, 'commands');
        actions.forEach(([key, label, detail, icon, , run]) => add(section, label, detail, () => {
          ui.clearInspectionViews();
          run();
        }, null, icon, key));
      }
      if (cards.length) {
        const section = group('Cards', cards.length, 'cards');
        cards.slice(0, 40).forEach(({ card, zone, owner }) => add(section, card.name, `${zone} · ${(owner || card.ctrl || card.owner)?.name || ''}`, () => {
          // A card can move while this dialog is open. Recheck public visibility
          // at activation rather than trusting a result captured earlier.
          if (U.searchableCards(game, viewer).some(item => item.card === card)) {
            ui.clearInspectionViews();
            ui.sheet = { card, fromSearch: true }; ui.render();
          } else ui.toast('That card is no longer in a visible zone.');
        }, card));
      }
      status.textContent = query ? `${cards.length} card${cards.length === 1 ? '' : 's'} · ${actions.length} command${actions.length === 1 ? '' : 's'}${cards.length > 40 ? ' · first 40 cards shown' : ''}` : 'Search by card name, zone, or setting';
      if (!actions.length && !cards.length) {
        const empty = node('div', 'commandempty');
        empty.append(node('h2', '', 'No matches yet'), node('p', '', 'Try a card name, a zone, or a setting. Search includes your hand and cards you can inspect.'));
        const reset = node('button', 'commandemptyreset', 'Show all commands');
        reset.type = 'button';
        reset.onclick = () => { if (isCurrent()) { input.value = ''; draw(); input.focus(); } };
        empty.appendChild(reset);
        results.appendChild(empty);
      }
    };
    input.oninput = draw;
    clear.onclick = () => { if (isCurrent()) { input.value = ''; draw(); input.focus(); } };
    panel.onkeydown = event => {
      if (!isCurrent()) return;
      const buttons = [...results.querySelectorAll('.commandresult')];
      if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) { event.preventDefault(); event.stopPropagation(); dismiss(); return; }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && buttons.length) {
        event.preventDefault();
        const current = buttons.indexOf(document.activeElement);
        if (current >= 0) active = current;
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        active = active < 0 ? (direction > 0 ? 0 : buttons.length - 1) : (active + direction + buttons.length) % buttons.length;
        buttons[active].focus();
        buttons[active].scrollIntoView({ block: 'nearest' });
      }
      if ((event.key === 'Home' || event.key === 'End') && buttons.includes(document.activeElement)) {
        event.preventDefault();
        buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus();
      }
      if (event.key === 'Enter' && event.target === input && !event.isComposing) { event.preventDefault(); buttons[active < 0 ? 0 : active]?.click(); }
      if (event.key === 'Tab') {
        const controls = [close, input, ...(!clear.hidden ? [clear] : []), ...results.querySelectorAll('button')];
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
