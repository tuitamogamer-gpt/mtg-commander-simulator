// Presentation-only settings. Existing table/session actions retain their callbacks.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG;
  if (typeof document === 'undefined' || !U.UI) return;
  const node = (tag, cls, text) => {
    const element = document.createElement(tag);
    element.className = cls;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const icon = name => {
    const holder = node('span', 'settingsicon');
    holder.setAttribute('aria-hidden', 'true');
    holder.innerHTML = name === 'next'
      ? '<svg class="gameicon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
      : U.icon(name);
    return holder;
  };
  const persist = (key, value) => {
    try { localStorage.setItem(key, String(value)); return true; } catch { return false; }
  };
  const originalMenu = U.UI.prototype.renderQuickMenu;
  U.UI.prototype.renderQuickMenu = function (game) {
    if (this.quickMenuOpen === 'cardbacks') return this.renderCardBacks();
    if (['backgrounds', 'playmats', 'audio'].includes(this.quickMenuOpen)) this.arenaSettingsTab = 'appearance';
    const overlay = originalMenu.call(this, game);
    if (!overlay || this.quickMenuOpen !== true) return overlay;
    const ui = this, panel = overlay.querySelector('.quickmenu');
    if (!panel) return overlay;
    const isCurrent = () => overlay.isConnected && ui.quickMenuOpen === true && ui.game === game;
    overlay.classList.add('experiencesettingsov');
    panel.classList.add('experiencesettings');
    const originalList = panel.querySelector('.quickmenulist');
    const actions = new Map([...originalList.querySelectorAll('.quickmenuitem')].map(button => [button.querySelector('span')?.textContent, button]));
    originalList.remove();
    const heading = panel.querySelector('.quickmenuhead h2');
    heading.textContent = 'Your table, your way';
    const close = panel.querySelector('.quickmenuclose');
    const dismiss = () => {
      if (!isCurrent()) return;
      ui.quickMenuOpen = false; ui.render();
      document.querySelector('.menubutton')?.focus({ preventScroll: true });
    };
    close.onclick = dismiss;
    overlay.onclick = event => { if (event.target === overlay) dismiss(); };
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    });
    const tabs = [['table', 'Table', 'stack'], ['appearance', 'Appearance', 'playmat'], ['controls', 'Controls', 'menu'], ['help', 'Help', 'info']];
    const current = tabs.some(([id]) => id === ui.arenaSettingsTab) ? ui.arenaSettingsTab : 'table';
    ui.arenaSettingsTab = current;
    const navigation = node('div', 'settingstabs');
    navigation.setAttribute('role', 'tablist'); navigation.setAttribute('aria-label', 'Arena settings');
    const body = node('section', 'settingsbody');
    body.id = 'arena-settings-panel'; body.setAttribute('role', 'tabpanel');
    body.setAttribute('aria-labelledby', `arena-settings-${current}`);
    for (const [id, label, symbol] of tabs) {
      const button = node('button', 'settingstab');
      button.type = 'button'; button.id = `arena-settings-${id}`; button.dataset.settingsTab = id;
      button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', body.id);
      button.setAttribute('aria-selected', String(id === current)); button.tabIndex = id === current ? 0 : -1;
      button.append(icon(symbol), node('span', '', label));
      button.onclick = () => {
        if (!isCurrent()) return;
        ui.arenaSettingsTab = id; ui._settingsFeedback = ''; ui.render();
        // Arena reconciliation restores the old path in a microtask. Tab
        // navigation deliberately moves focus to a different control after it.
        queueMicrotask(() => document.querySelector(`[data-settings-tab="${id}"]`)?.focus({ preventScroll: true }));
      };
      navigation.appendChild(button);
    }
    navigation.addEventListener('keydown', event => {
      const buttons = [...navigation.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].click();
    });
    const intro = (title, detail) => {
      const header = node('div', 'settingsintro');
      header.append(node('h3', '', title), node('p', '', detail)); body.appendChild(header);
    };
    const section = title => {
      const group = node('section', 'settingsgroup');
      if (title) group.appendChild(node('h4', '', title));
      body.appendChild(group); return group;
    };
    const action = (parent, label, symbol = 'info') => {
      const button = actions.get(label);
      if (!button) return;
      const run = button.onclick;
      button.onclick = event => { if (isCurrent()) return run?.call(button, event); };
      const title = button.querySelector('span'), detail = button.querySelector('small');
      const copy = node('span', 'settingsactioncopy'); copy.append(title, detail);
      button.replaceChildren(icon(symbol), copy, icon('next'));
      button.classList.add('settingsaction'); parent.appendChild(button);
    };
    const status = node('p', 'settingsstatus', ui._settingsFeedback || 'Appearance and controls are saved on this device.');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const change = (id, label, run) => {
      if (!isCurrent()) return;
      const saved = run();
      ui._settingsFeedback = saved === false ? `${label} applied for this session. Device storage is unavailable.` : `${label} updated · saved on this device`;
      const scroll = body.scrollTop;
      ui.render();
      const nextBody = document.querySelector('.settingsbody'); if (nextBody) nextBody.scrollTop = scroll;
      document.querySelector(`[data-setting="${id}"]`)?.focus({ preventScroll: true });
    };
    const row = (parent, label, detail) => {
      const line = node('div', 'settingsrow'), copy = node('div', 'settingscopy');
      copy.append(node('b', '', label), node('small', '', detail)); line.appendChild(copy); parent.appendChild(line);
      return { line, copy };
    };
    const select = (parent, id, label, detail, value, values, apply) => {
      const { line, copy } = row(parent, label, detail), labelId = `settings-label-${id}`;
      copy.querySelector('b').id = labelId;
      const input = node('select', 'settingsselect'); input.dataset.setting = id; input.setAttribute('aria-labelledby', labelId);
      for (const [key, text] of values) {
        const option = node('option', '', text); option.value = key; option.selected = String(value) === String(key); input.appendChild(option);
      }
      input.onchange = () => change(id, label, () => apply(input.value)); line.appendChild(input);
    };
    const toggle = (parent, id, label, detail, checked, apply) => {
      const { line, copy } = row(parent, label, detail), labelId = `settings-label-${id}`, detailId = `settings-detail-${id}`;
      copy.querySelector('b').id = labelId; copy.querySelector('small').id = detailId;
      const button = node('button', 'settingsswitch'); button.type = 'button'; button.dataset.setting = id;
      button.setAttribute('role', 'switch'); button.setAttribute('aria-checked', String(!!checked));
      button.setAttribute('aria-labelledby', labelId); button.setAttribute('aria-describedby', detailId);
      button.append(node('span', 'settingsswitchtrack'), node('span', 'settingsswitchvalue', checked ? 'On' : 'Off'));
      button.onclick = () => change(id, label, () => apply(!checked)); line.appendChild(button);
    };
    if (current === 'table') {
      intro('At the table', 'Review the game, find a card, or return to your profile.');
      const context = node('div', 'settingscontext');
      context.append(icon('crown'), node('b', '', ui.me?.name || 'Your seat'), node('span', '', `Turn ${game.turnNo || 1} · ${ui.me?.life ?? 40} life`)); body.appendChild(context);
      const tools = section('Game tools');
      for (const [label, symbol] of [['Find a card or command', 'cards'], ['Table information', 'stack'], ['Game log', 'log'], ['Dungeons & routes', 'library'], ['Diplomacy & Politics', 'deals']]) action(tools, label, symbol);
      const session = section('Your session');
      for (const label of ['Save & exit', 'Sign in to save', 'Profile & stats', 'I lost', 'Main menu']) action(session, label, label === 'Main menu' ? 'player' : 'crown');
    } else if (current === 'appearance') {
      intro('Set the atmosphere', 'Choose the artwork and sound that make this table yours.');
      const art = section('Table style');
      const backs = node('button', 'quickmenuitem settingsaction cardbacksopen'); backs.type = 'button';
      const thumb = node('img', 'settingscardbackthumb'); thumb.src = U.cardBackURL(); thumb.alt = '';
      const copy = node('span', 'settingsactioncopy'); copy.append(node('span', '', 'Card backs'), node('small', '', U.selectedCardBack().label));
      backs.append(thumb, copy, icon('next')); backs.onclick = () => { if (isCurrent()) { ui.quickMenuOpen = 'cardbacks'; ui.render(); } }; art.appendChild(backs);
      action(art, 'Arena background', 'playmat'); action(art, 'Playmats', 'cards'); action(art, 'Music & sound', 'mana');
      const readability = section('Readability');
      select(readability, 'hand-size', 'Hand card size', 'Make the cards in your hand easier to inspect.', ui.handSize, [['standard', 'Standard'], ['large', 'Large']], value => {
        ui.handSize = value; return U.savePlayerPreferences({ handSize: value });
      });
      toggle(readability, 'contrast', 'High contrast', 'Stronger boundaries and brighter text.', document.body.classList.contains('high-contrast'), value => {
        document.body.classList.toggle('high-contrast', value); return U.savePlayerPreferences({ contrast: value });
      });
      toggle(readability, 'motion', 'Reduced motion', 'Keep the interface still during card effects.', ui.reducedMotion, value => {
        ui.reducedMotion = value; document.body.classList.toggle('reduced-motion', value); return persist('mtgReducedMotion', value ? '1' : '0');
      });
      if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) readability.appendChild(node('p', 'settingsnote', 'Your device also requests reduced motion. That preference stays respected.'));
    } else if (current === 'controls') {
      intro('Play at your pace', 'Adjust how you follow the game and interact with cards.');
      const pace = section('Pace & decisions');
      select(pace, 'speed', 'AI turn speed', 'Every action stays visible at every speed.', ui.speed, [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], value => {
        ui.speed = value; ui.applySpeed(); return U.savePlayerPreferences({ speed: value });
      });
      action(pace, 'Priority stops', 'hold');
      const interaction = section('Card interaction');
      toggle(interaction, 'drag', 'Arena drag controls', 'Drag cards to play or select them. Tap still works.', ui.arenaDragEnabled, value => {
        ui.arenaDragEnabled = value; return persist('mtgArenaDrag', value ? '1' : '0');
      });
      toggle(interaction, 'stack-preview', 'Centered stack preview', 'Inspect spells and abilities as they arrive.', ui.stackPopup, value => {
        ui.stackPopup = value; ui.stackPopDismissed = 0; return persist('mtgStackPop', value ? '1' : '0');
      });
      const sizing = node('details', 'settingsadvanced'); sizing.appendChild(node('summary', '', 'Opponent display sizes'));
      const sizes = node('div', 'settingsadvancedbody'); sizing.appendChild(sizes); body.appendChild(sizing);
      // Preserve the existing optional sizes and defaults; no table geometry changes.
      // Table drag/zoom controls also save values between these presets.
      const withCurrentSize = (options, value, label) => options.some(([key]) => key === value)
        ? options : [...options, [value, `${label} (current)`]].sort((a, b) => a[0] - b[0]);
      select(sizes, 'opponent-size', 'Opponent card size', 'Scale the cards in opponent areas.', ui.oppScale, withCurrentSize([[.8, '80%'], [1, '100%'], [1.2, '120%'], [1.4, '140%']], ui.oppScale, `${Math.round(ui.oppScale * 100)}%`), value => {
        ui.oppScale = Number(value); ui._settingsSizingOpen = true; return persist('mtgOppS', value);
      });
      select(sizes, 'opponent-height', 'Opponent area height', 'Choose how much space opponent areas use.', ui.oppHeight, withCurrentSize([[30, '30%'], [36, '36%'], [42, '42%'], [50, '50%']], ui.oppHeight, `${ui.oppHeight}%`), value => {
        ui.oppHeight = Number(value); ui._settingsSizingOpen = true; return persist('mtgOppH', value);
      });
      sizing.open = !!ui._settingsSizingOpen; sizing.ontoggle = () => { if (sizing.isConnected) ui._settingsSizingOpen = sizing.open; };
    } else {
      intro('A little help', 'Find the controls, report a problem, or recover a blocked game.');
      const help = section('Guides & support');
      action(help, 'Help & shortcuts', 'info'); action(help, 'Report a problem', 'log'); action(help, 'Support & diagnostics', 'library');
      const recovery = section('Recovery'); action(recovery, 'Judge', 'shield'); action(recovery, 'Last Resort', 'hold');
    }
    const footer = node('footer', 'settingsfooter');
    const done = node('button', 'pbtn primary settingsdone', 'Return to game'); done.type = 'button'; done.onclick = dismiss;
    footer.append(status, done); panel.append(navigation, body, footer);
    return overlay;
  };

  U.UI.prototype.renderCardBacks = function () {
    const ui = this, overlay = node('div', 'quickmenuov cardbackov'), panel = node('section', 'quickmenu cardbackpicker');
    const game = ui.game, isCurrent = () => overlay.isConnected && ui.quickMenuOpen === 'cardbacks' && ui.game === game;
    const head = node('header', 'quickmenuhead'), title = node('div', '');
    title.append(node('span', '', 'Choose your signature'), node('h2', '', 'Card backs'));
    const dismiss = () => { if (!isCurrent()) return; ui.quickMenuOpen = false; ui.render(); document.querySelector('.menubutton')?.focus({ preventScroll: true }); };
    const close = node('button', 'quickmenuclose', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close card backs'); close.onclick = dismiss;
    head.append(title, close);
    const body = node('div', 'cardbackbody');
    body.appendChild(node('p', 'cardbackintro', 'Three original designs. One signature for your hidden cards and library reveals.'));
    const grid = node('div', 'cardbackgrid'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Card back designs');
    const status = node('p', 'cardbackstatus', 'Applied immediately · saved on this device'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const update = () => grid.querySelectorAll('button').forEach(button => {
      const selected = button.dataset.cardBack === U.selectedCardBack().id;
      button.setAttribute('aria-pressed', String(selected)); button.querySelector('.cardbackselected').textContent = selected ? 'Selected' : 'Select';
    });
    for (const back of U.CARD_BACKS) {
      const button = node('button', 'cardbackchoice'); button.type = 'button'; button.dataset.cardBack = back.id; button.setAttribute('aria-label', `${back.label} card back`);
      const art = node('img', 'cardbackpreview'); art.src = back.url; art.alt = ''; art.width = 600; art.height = 840; art.decoding = 'async';
      button.append(art, node('b', '', back.label), node('small', '', back.detail), node('span', 'cardbackselected'));
      button.onclick = () => {
        if (!isCurrent()) return;
        const saved = U.selectCardBack(back.id); update();
        status.textContent = saved ? `${back.label} selected · saved on this device` : `${back.label} selected for this session. Device storage is unavailable.`;
      };
      grid.appendChild(button);
    }
    update(); body.append(grid, status);
    const foot = node('footer', 'cardbackfooter');
    const back = node('button', 'pbtn cardbackback', 'Arena controls'); back.type = 'button';
    back.onclick = () => { if (!isCurrent()) return; ui.arenaSettingsTab = 'appearance'; ui.quickMenuOpen = true; ui.render(); document.querySelector('.cardbacksopen')?.focus({ preventScroll: true }); };
    const done = node('button', 'pbtn primary cardbackdone', 'Done'); done.type = 'button'; done.onclick = dismiss;
    foot.append(back, done); panel.append(head, body, foot); overlay.appendChild(panel);
    overlay.onclick = event => { if (event.target === overlay) dismiss(); };
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); } });
    return overlay;
  };
})();
