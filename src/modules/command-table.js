// Command Table is presentation only. Every decision retains its engine callback.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG;
  const decisionsShowingTable = new Set(['chooseTargets', 'choosePlayer', 'attackers', 'blockers']);
  U.commandTableFocus = function (game, viewer, preferred, decision) {
    const opponents = game.players.filter(player => player !== viewer && !player.lost);
    const focused = opponents.find(player => player.idx === preferred) || opponents[0] || null;
    return { opponents, focused, showAll: decisionsShowingTable.has(decision) };
  };
  if (typeof document === 'undefined' || !U.UI) return;
  const P = U.UI.prototype;
  const node = (tag, cls, text) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const button = (cls, text, handler) => {
    const element = node('button', cls, text);
    element.type = 'button'; element.onclick = handler;
    return element;
  };
  const icon = name => {
    const element = node('span', 'ct-icon');
    element.innerHTML = U.icon(name);
    element.setAttribute('aria-hidden', 'true');
    return element;
  };
  const commanders = player => player.commanders?.length ? player.commanders : player.command || [];
  const portrait = player => {
    const commander = commanders(player)[0];
    const element = node('img', 'ct-portrait');
    element.alt = ''; element.loading = 'lazy';
    // Commander identity is public. Never derive art from hand/library contents.
    element.src = commander ? U.cardImageURL(commander.name, 'art') : U.BLANK_PX;
    element.onerror = () => U.imgFail(element);
    return element;
  };
  const scrollNodes = root => [...root.querySelectorAll('.hand, .myboard, .oppstrip, .boardlanecards, .ct-decision-content')];
  const scrollKey = element => `${element.closest('[data-player-id]')?.dataset.playerId || element.closest('.myboard') && 'you' || ''}/${element.className}/${element.closest('.boardlane')?.className || ''}`;

  P.renderCommandSeats = function (game, focus) {
    const ribbon = node('nav', 'ct-seat-ribbon');
    ribbon.setAttribute('aria-label', 'Players at the table');
    for (const player of focus.opponents) {
      const selected = player === focus.focused;
      const seat = button('ct-seat' + (selected ? ' selected' : '') + (player === game.turnPlayer ? ' active' : ''), undefined, () => {
        this.commandFocusPlayer = player.idx;
        this.mobileView = 'mine';
        this.utilityDrawerOpen = false;
        this.collapsed?.delete(player.idx);
        this.render();
        document.querySelector(`.ct-seat[data-focus-player="${player.idx}"]`)?.focus({ preventScroll: true });
      });
      seat.dataset.focusPlayer = String(player.idx);
      seat.setAttribute('aria-pressed', String(selected));
      seat.setAttribute('aria-label', `Focus ${player.name}, ${player.life} life${player.poison ? `, ${player.poison} poison` : ''}`);
      const copy = node('span', 'ct-seat-copy');
      copy.append(node('b', '', player.name), node('span', 'ct-seat-life', `${player.life} life`));
      if (player.poison) copy.append(node('small', '', `${player.poison} poison`));
      seat.append(portrait(player), copy);
      ribbon.append(seat);
    }
    return ribbon;
  };

  P.renderCommandTable = function (game, root) {
    const focus = U.commandTableFocus(game, this.me, this.commandFocusPlayer, this.pending?.q.type);
    this.commandFocusPlayer = focus.focused?.idx ?? null;
    root.dataset.tableView = this.commandTableView;
    root.classList.toggle('ct-show-all', focus.showAll);
    root.classList.toggle('ct-no-opponents', !focus.opponents.length);
    root.append(this.renderCommandSeats(game, focus));

    const views = node('div', 'ct-view-switch');
    views.setAttribute('role', 'group'); views.setAttribute('aria-label', 'Battlefield layout');
    for (const [value, label] of [['table', 'Table'], ['focus', 'Focus']]) {
      const control = button('tbtn ct-view-button', label, () => {
        this.commandTableView = value;
        try { localStorage.setItem('mtgCommandTableView', value); } catch { /* Session preference still applies. */ }
        this.render();
        document.querySelector(`[data-table-layout="${value}"]`)?.focus({ preventScroll: true });
      });
      control.dataset.tableLayout = value;
      control.setAttribute('aria-pressed', String(this.commandTableView === value));
      views.append(control);
    }
    root.querySelector('.arenaheader .topbtns')?.before(views);

    for (const row of root.querySelectorAll('.opprow')) {
      const player = game.players.find(item => String(item.idx) === row.dataset.playerId);
      if (!player) continue;
      row.classList.toggle('ct-focused', player === focus.focused);
      const head = row.querySelector('.opphead');
      head.prepend(portrait(player));
      const shortName = commanders(player).map(card => card.name.split(',')[0]).join(' + ');
      head.querySelector('.oppname')?.append(node('small', 'ct-commander-name', shortName));
      const details = button('ct-zone-link', `Graveyard ${player.graveyard.length}`, event => {
        event.stopPropagation(); this.zoneBrowse = { player, zone: 'graveyard' }; this.render();
      });
      details.setAttribute('aria-label', `${player.name}: open graveyard, ${player.graveyard.length} cards`);
      head.querySelector('.oppmeta')?.append(details);
      const landCount = row.querySelector('.oppLands');
      if (landCount) {
        const lands = game.lands(player).filter(card => !card.is('Creature'));
        landCount.replaceChildren(icon('mana'), node('span', '', `${lands.filter(card => !card.tapped).length}/${lands.length} lands`));
        this.makeKeyboardButton(landCount, `${player.name}: inspect lands and player details`);
      }
    }

    const myBoard = root.querySelector('.myboard');
    if (myBoard) {
      const heading = node('div', 'ct-player-head');
      const label = node('div', 'ct-player-name');
      label.append(node('small', '', 'Your battlefield'), node('b', '', commanders(this.me).map(card => card.name.split(',')[0]).join(' + ') || this.me.name));
      const commander = commanders(this.me)[0];
      if (commander) {
        const inspect = button('ct-inspect-commander', undefined, () => { this.sheet = { card: commander }; this.render(); });
        inspect.setAttribute('aria-label', `Inspect ${commander.name}`);
        inspect.append(portrait(this.me));
        heading.append(inspect);
      } else heading.append(portrait(this.me));
      heading.append(label);
      const info = myBoard.querySelector('.meinfo');
      if (info) {
        const pool = info.querySelector('.manapool');
        if (pool) label.append(pool);
        heading.append(info);
      }
      myBoard.prepend(heading);
    }

    const rail = node('aside', 'ct-decision-rail');
    rail.setAttribute('aria-label', 'Current decision and table tools');
    const stage = root.querySelector(':scope > .actionstagewrap');
    const popup = root.querySelector(':scope > .stackpop:not(.reveal)');
    const prompt = root.querySelector(':scope > .promptbar');
    const required = !!this.pending || !!this.react;
    const title = stage ? 'Your response' : this.pending?.q.type === 'main' ? 'Your turn' : required ? 'Your decision' : game.gameOver ? 'Game finished' : 'At the table';
    const railHead = node('header', 'ct-decision-heading');
    railHead.append(node('h2', '', title), node('span', 'ct-phase-label', this.phaseName(game)));
    rail.append(railHead);
    const content = node('div', 'ct-decision-content');
    rail.classList.toggle('has-review', !!stage);
    if (stage) {
      content.append(stage);
      const summary = node('div', 'ct-response-summary');
      const source = stage.querySelector('.actionstagename')?.textContent || 'Stack action';
      const targets = [...stage.querySelectorAll('.stackflowtargetinfo b')].map(element => element.textContent);
      summary.append(node('b', '', source), node('span', '', targets.length ? ` → ${targets.join(', ')}` : ' · no targets'));
      stage.querySelector('.actionstageinfo')?.prepend(summary);
      const actions = stage.querySelector('.actionstagebuttons');
      // Keep the original engine callbacks and the review's explicit Proceed.
      if (actions) stage.querySelector('.actionstage').append(actions);
    } else if (popup) content.append(popup);
    else if (game.stack.length) {
      const top = game.stack[game.stack.length - 1];
      content.append(node('h3', 'ct-stack-title', `Stack · ${game.stack.length}`));
      const flow = this.renderStackTargetFlow(top, { includeSource: true, maxTargets: 4 });
      if (flow) content.append(flow);
    } else if (!required) {
      const log = node('ol', 'ct-activity');
      for (const item of game.log.slice(-3)) log.append(node('li', '', item.msg));
      content.append(log);
    } else {
      content.append(node('p', 'ct-decision-hint', 'Inspect any card for its text and available actions. Your hand and battlefield stay within reach.'));
    }
    if (!stage && !popup && game.diplomacy?.enabled && game.diplomacyView) {
      const agreements = game.diplomacyView(this.me).activeContracts;
      if (agreements.length) {
        const deals = node('div', 'ct-public-deals');
        for (const agreement of agreements) {
          const control = button('ct-public-deal', undefined, () => this.openUtility('diplomacy'));
          control.append(node('b', '', agreement.title), node('span', '', agreement.participantNames.join(' · ')));
          deals.append(control);
        }
        content.prepend(deals);
      }
    }
    railHead.after(content);
    if (prompt) {
      if (stage) prompt.hidden = true;
      rail.append(prompt);
    }
    const utilities = root.querySelector(':scope > .utilityrail');
    if (utilities) rail.append(utilities);
    root.append(rail);
    const center = root.querySelector(':scope > .center');
    root.classList.toggle('ct-has-combat', !!center?.querySelector('.combatmap'));
    // The decision rail owns Stack presentation on desktop; combat remains on the table.
    center?.querySelector('.stack')?.classList.add('ct-inline-stack');
    const targetGroups = game.stack.at(-1)?.targets || game.stack.at(-1)?.ctx?.targets || [];
    for (const target of targetGroups.flat().filter(Boolean)) {
      if (target.iid != null) {
        for (const card of root.querySelectorAll('.mini[data-iid]')) {
          if (card.dataset.iid === String(target.iid)) card.classList.add('ct-spell-target');
        }
      }
    }
    U.localizeTree(root);
  };

  const originalFit = P.fitBattlefieldLanes;
  P.fitBattlefieldLanes = function (root) {
    const host = root || document.querySelector('#game');
    if (!host?.classList.contains('command-table')) return originalFit.call(this, root);
    // A crowded board scrolls at a readable card size, never shrinks to tiny art.
    for (const lane of host.querySelectorAll('.boardlanecards, .oppresourcecards, .manaartifactstrip')) {
      lane.style.zoom = ''; lane.style.maxHeight = '';
    }
  };
  const originalRender = P.render;
  P.render = function () {
    const root = document.querySelector('#game');
    if (!root || !this.game) return originalRender.call(this);
    if (!this.commandTableView) {
      let saved = null;
      try { saved = localStorage.getItem('mtgCommandTableView'); } catch { /* Default remains usable. */ }
      this.commandTableView = saved === 'focus' ? 'focus' : 'table';
    }
    const scroll = new Map(scrollNodes(root).map(element => [scrollKey(element), [element.scrollLeft, element.scrollTop]]));
    if (decisionsShowingTable.has(this.pending?.q.type)) this.collapsed?.clear();
    root.classList.add('command-table');
    originalRender.call(this);
    this.renderCommandTable(this.game, root);
    for (const element of scrollNodes(root)) {
      const position = scroll.get(scrollKey(element));
      if (position) { element.scrollLeft = position[0]; element.scrollTop = position[1]; }
    }
  };
})();
