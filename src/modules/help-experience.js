// Presentation-only guidance. Priority choices retain the engine's callbacks.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG;
  if (typeof document === 'undefined' || !U.UI) return;
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const icon = name => {
    const element = node('span', 'guideicon');
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML = U.icon(name);
    return element;
  };
  const active = (ui, game, overlay, flag) => overlay.isConnected && ui.game === game && ui[flag] &&
    (typeof window === 'undefined' || !window._ui || window._ui === ui);
  const closeButton = (label, dismiss) => {
    const button = node('button', 'guideclose', '×');
    button.type = 'button'; button.setAttribute('aria-label', label); button.onclick = dismiss;
    return button;
  };
  const header = (kicker, title, dismiss, closeLabel) => {
    const head = node('header', 'guidehead'), copy = node('div', 'guideheading');
    copy.append(node('span', 'guidekicker', kicker), node('h2', 'guidetitle', title));
    head.append(copy, closeButton(closeLabel, dismiss));
    return head;
  };
  const containEscape = (panel, dismiss) => panel.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation(); dismiss();
  });

  U.UI.prototype.renderHelp = function (game) {
    const ui = this, overlay = node('div', 'overlay helpoverlay'), panel = node('section', 'sheet tall helpguide');
    const isCurrent = () => active(ui, game, overlay, 'showHelp');
    const dismiss = () => { if (isCurrent()) { ui.showHelp = false; ui.render(); } };
    panel.appendChild(header('Field guide', 'Make your next move.', dismiss, 'Close help'));
    const navigation = node('nav', 'guidenav'); navigation.setAttribute('aria-label', 'Help topics');
    const body = node('div', 'guidebody');
    const intro = node('p', 'guideintro', 'A quick guide to the table. Your current decision stays waiting while you read.');
    body.appendChild(intro);
    const sections = [
      ['essentials', 'Essentials', 'cards', 'Your cards. Your choices.'],
      ['timing', 'Timing & reveals', 'hold', 'Take the time you need.'],
      ['keyboard', 'Keyboard', 'menu', 'Keep your next move close.'],
    ];
    const content = new Map();
    for (const [id, label, symbol, subtitle] of sections) {
      const section = node('section', 'guidesection'); section.id = `help-${id}`;
      const head = node('div', 'guidesectionhead'), title = node('h3', '', label);
      title.tabIndex = -1; title.id = `help-${id}-title`; section.setAttribute('aria-labelledby', title.id);
      const copy = node('div', ''); copy.append(title, node('p', '', subtitle)); head.append(icon(symbol), copy); section.appendChild(head);
      content.set(id, section); body.appendChild(section);
      const button = node('button', 'guidenavlink', label); button.type = 'button'; button.dataset.guideTopic = id;
      button.setAttribute('aria-controls', section.id);
      button.onclick = () => {
        if (!isCurrent()) return;
        title.focus({ preventScroll: true });
        const reduced = ui.reducedMotion || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const scale = body.offsetWidth ? body.getBoundingClientRect().width / body.offsetWidth : 1;
        const top = body.scrollTop + (section.getBoundingClientRect().top - body.getBoundingClientRect().top) / (scale || 1) - 16;
        body.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
      };
      navigation.appendChild(button);
    }
    const entry = (section, symbol, title, detail) => {
      const row = node('div', 'guideentry'), copy = node('div', 'guideentrycopy');
      copy.append(node('h4', '', title), node('p', '', detail)); row.append(icon(symbol), copy); section.appendChild(row);
    };
    const basics = content.get('essentials');
    entry(basics, 'cards', 'Play and inspect', 'Select a card in your hand to see its available actions, such as Cast, Play land, or Cycling. Highlighted actions are legal now. Inspecting a card does not play it.');
    entry(basics, 'mana', 'Choose how to pay', 'MANA switches between automatic payment and choosing exact mana sources. You still choose targets and any other required options before a spell is cast.');
    entry(basics, 'crown', 'Your commander', 'Select your commander in the command zone to cast it. Each previous cast from the command zone adds {2} to its cost. When it changes zones, the game offers the command-zone choice when the rules allow it.');
    entry(basics, 'effects', 'Abilities and targets', 'Select a permanent to inspect its available abilities, including Equip, Crew, and token creation. When choosing targets, select a highlighted card or player, then confirm your choice.');
    entry(basics, 'attack', 'Attack, block, review', 'Choose your attacking creatures and what they attack. To block, choose an attacker and assign your blockers. Combat reviews wait for Proceed so you can follow the result.');
    entry(basics, 'player', 'Read the table', 'Open a player’s name or information control for their public overview. Graveyards, exile, and command zones can be inspected. Find searches your hand, public cards, and table commands.');
    const timing = content.get('timing');
    entry(timing, 'stack', 'Respond when you have priority', 'Instants and cards with flash can be cast when you have priority. Other spells normally require your main phase and an empty stack. Available actions always follow the game rules.');
    entry(timing, 'hold', 'Set your priority stops', 'Open Menu → Controls → Priority stops to choose additional response windows. HOLD, or R between decisions, arms a stop at your next priority window. Required reviews still wait for your confirmation.');
    entry(timing, 'menu', 'Adjust the pace', 'Open Menu → Controls → AI turn speed for Slow, Normal, or Fast. Speed changes the pacing of bot actions; it does not answer your choices or advance your reveal checkpoints.');
    const reveal = node('div', 'guidereveal');
    reveal.append(node('span', 'guidekicker', 'Cascade · Etali · Discover'), node('h4', '', 'Every revealed card gets its moment.'));
    const steps = node('ol', 'guiderevealsteps');
    for (const [title, detail] of [
      ['Start the reveal', 'Choose Exile top card or Reveal cards when the effect asks.'],
      ['Look at each card', 'Select the large card or a card in the history to inspect it. Closing the inspection returns to the same reveal.'],
      ['Continue when ready', 'Continue advances one checkpoint. Casting choices and the remaining effects follow after the cards have been reviewed.'],
    ]) {
      const step = node('li', ''), copy = node('div', ''); copy.append(node('b', '', title), node('p', '', detail)); step.appendChild(copy); steps.appendChild(step);
    }
    reveal.appendChild(steps); timing.appendChild(reveal);
    entry(timing, 'shield', 'Face-down cards stay private', 'Manifest and cloak create hidden creatures. You may inspect your own card and turn it face up when legal. An opponent’s hidden identity is never included in Find or a card back.');
    const keyboard = content.get('keyboard'), shortcuts = node('dl', 'guideshortcuts');
    for (const [keys, label] of [
      [['⌘ K', 'Ctrl K', '/'], 'Find a card or command'],
      [['?'], 'Open this guide'],
      [['R'], 'Arm HOLD between decisions, or take an open response window'],
      [['Space', 'Enter'], 'Activate the focused control; otherwise, use the current Proceed action'],
      [['Tab', 'Shift Tab'], 'Move between available controls'],
      [['Esc'], 'Close an inspection or utility panel when dismissal is allowed'],
    ]) {
      const row = node('div', 'guideshortcut'), term = node('dt', ''), definition = node('dd', '', label);
      for (const key of keys) term.appendChild(node('kbd', '', key));
      row.append(term, definition); shortcuts.appendChild(row);
    }
    keyboard.appendChild(shortcuts);
    keyboard.appendChild(node('p', 'guidenote', 'Shortcuts leave text entry alone. Space and Enter never answer a decision behind this guide or another open inspection.'));
    const foot = node('footer', 'guidefooter'), settings = node('button', 'pbtn guidecontrols', 'Arena controls'), done = node('button', 'pbtn primary guidedone', 'Back to game');
    settings.type = 'button'; settings.onclick = () => {
      if (!isCurrent()) return;
      ui.showHelp = false; ui.arenaSettingsTab = 'controls'; ui.quickMenuOpen = true; ui.render();
    };
    done.type = 'button'; done.onclick = dismiss;
    foot.append(settings, done); panel.append(navigation, body, foot); overlay.appendChild(panel);
    overlay.onclick = event => { if (event.target === overlay) dismiss(); };
    containEscape(panel, dismiss);
    return overlay;
  };

  const renderStops = U.UI.prototype.renderStopSettings;
  U.UI.prototype.renderStopSettings = function (game) {
    const ui = this, overlay = renderStops.call(this, game), panel = overlay?.querySelector('.stopmodal');
    if (!panel) return overlay;
    const isCurrent = () => active(ui, game, overlay, 'showStops');
    overlay.classList.add('priorityoverlay'); panel.classList.add('priorityguide');
    const originalClose = panel.querySelector('.pbtn');
    const closeAction = originalClose.onclick;
    const dismiss = () => { if (isCurrent()) closeAction.call(originalClose); };
    panel.querySelector('.mtitle')?.remove();
    const body = node('div', 'prioritybody'), intro = panel.querySelector('.stopintro'), list = panel.querySelector('.stopprofiles');
    intro.textContent = 'Choose when to pause for an extra response. Required card reviews and your reveal checkpoints always wait for you.';
    list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Priority stop profiles');
    const symbols = { end: 'hold', combat: 'attack', off: 'stack', full: 'menu' };
    let applying = false;
    [...list.querySelectorAll('.stopprofile')].forEach((row, index) => {
      const mode = U.PRIO_MODES[index]; if (!mode) return;
      const selected = mode.key === ui.prioMode, action = row.onclick;
      row.type = 'button'; row.dataset.stopMode = mode.key; row.setAttribute('aria-pressed', String(selected));
      row.setAttribute('aria-label', `${mode.label}${selected ? ', selected' : ''}`);
      const description = row.querySelector('small'); description.id = `priority-mode-${mode.key}-description`; row.setAttribute('aria-describedby', description.id);
      const symbol = row.querySelector('.stopicon'); symbol.replaceChildren(icon(symbols[mode.key] || 'hold'));
      const badge = row.querySelector('i'); badge.textContent = selected ? 'Selected' : 'Choose'; badge.setAttribute('aria-hidden', 'true');
      row.onclick = event => {
        if (!isCurrent() || row.disabled || applying) return;
        applying = true;
        try { return action.call(row, event); } finally { applying = false; }
      };
    });
    const note = node('div', 'prioritynote');
    const copy = node('div', ''); copy.append(node('b', '', 'Need one extra moment?'), node('p', '', 'Use HOLD to stop at your next priority window without changing this profile.'));
    note.append(icon('hold'), copy); body.append(intro, list, note);
    const foot = node('footer', 'guidefooter priorityfooter');
    foot.appendChild(node('span', 'priorityhint', 'Selecting a profile applies it immediately.'));
    originalClose.textContent = 'Back to game'; originalClose.classList.remove('wide'); originalClose.classList.add('primary', 'prioritydone'); originalClose.onclick = dismiss;
    foot.appendChild(originalClose);
    panel.append(header('At your pace', 'Priority stops', dismiss, 'Close priority stops'), body, foot);
    overlay.onclick = event => { if (event.target === overlay) dismiss(); };
    containEscape(panel, dismiss);
    return overlay;
  };
})();
