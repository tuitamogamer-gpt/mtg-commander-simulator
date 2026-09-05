'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Browser surfaces shared by the local app and the generated Higgsfield Games
// client. The platform adapter only supplies dispatch/subscribe/current and the
// share URL; lobby and decision UX stay part of the Commander project.
(function () {
  if (typeof document === 'undefined') return;
  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const el = (tag, cls, html) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html !== undefined) node.innerHTML = html;
    return node;
  };
  const artURL = name => MTG.cardImageURL(name);

  // Imported decks join the lobby list once they are ready in My Library. The
  // host has to build every seat's deck locally, so choosing one also sends its
  // saved list to the room.
  function importedDeckNames() {
    const library = MTG.getImportedDeckLibrary ? MTG.getImportedDeckLibrary() : { entries: [] };
    return library.entries.filter(entry => entry.ready && MTG.DECKS?.[entry.name]?.custom).map(entry => entry.name);
  }

  function deckCatalog() {
    const imported = new Set(importedDeckNames());
    return Object.entries(MTG.DECKS || {})
      .filter(([name, deck]) => !deck.custom || imported.has(name))
      .map(([name, deck]) => ({
        id: name, commander: deck.commander, imported: !!deck.custom,
        meta: MTG.DECK_META && MTG.DECK_META[name] || {},
      }));
  }

  function deckOptions(selected, unavailable = new Set()) {
    return deckCatalog().map(deck => `<option value="${esc(deck.id)}"${deck.id === selected ? ' selected' : ''}${unavailable.has(deck.id) && deck.id !== selected ? ' disabled' : ''}>${esc(deck.id)} — ${esc(deck.commander)}${deck.imported ? ' (My Library)' : ''}</option>`).join('');
  }

  function configureAction(deckId, extra) {
    return Object.assign({
      type: 'configure', deckId,
      deckRecord: MTG.DECKS?.[deckId]?.custom && MTG.importedDeckRecordFor
        ? MTG.importedDeckRecordFor(deckId) : null,
    }, extra);
  }

  class OnlineLobby {
    constructor({ root, client, initialSelection, onHostStart, onBack }) {
      this.root = root;
      this.client = client;
      this.initial = initialSelection || null;
      this.onHostStart = onHostStart;
      this.onBack = onBack;
      this.view = typeof client.current === 'function' ? client.current() : null;
      this.started = false;
      this.busy = false;
      this.error = '';
      this.decisionState = null;
      this.lastResortOpen = false;
      this.lastResortPlayerSeat = 1;
      this.unsubscribe = client.subscribe(view => {
        this.view = view;
        this.render();
        if (view && view.phase === 'running' && view.you === 0 && !this.started) {
          this.started = true;
          this.onHostStart(view, this.client);
        }
      });
    }

    async mount() {
      if (!this.client.platformAutoJoin) {
        await this.perform({ type: 'join', name: this.initial && this.initial.name || (this.client.isHost ? 'Host' : 'Player 2') });
      }
      if (this.initial && this.client.isHost) {
        await this.perform(configureAction(this.initial.deck, {
          commanderNames: this.initial.commanders || [], name: this.initial.name || 'Host', ready: true,
        }));
        await this.perform({
          type: 'configureSettings', sumPartnerDamage: !!this.initial.sumPartnerDamage,
        });
      }
      this.render();
    }

    async perform(action) {
      this.busy = true;
      this.error = '';
      this.render();
      try {
        const next = await this.client.dispatch(action);
        if (next) this.view = next;
      } catch (error) {
        this.error = error && error.message || String(error);
      } finally {
        this.busy = false;
        this.render();
      }
    }

    seatCard(seat, view) {
      const mine = view.you === seat.seat;
      const card = el('article', `onlineseat ${seat.kind} ${mine ? 'mine' : ''} ${seat.connected ? 'connected' : 'waiting'}`);
      const deck = MTG.DECKS[seat.deckId];
      card.innerHTML = `
        <div class="onlineseatnum">0${seat.seat + 1}</div>
        <div class="onlineseatstatus"><i></i>${seat.connected ? 'CONNECTED' : 'WAITING'}</div>
        ${deck ? `<img src="${artURL(deck.commander)}" alt="${esc(deck.commander)}" onerror="MTG.imgFail(this)">` : '<div class="onlineseatempty">+</div>'}
        <div class="onlineseatcopy"><small>${esc(seat.role)}</small><b>${esc(seat.name)}</b><span>${seat.deckId ? esc(seat.deckId) : 'No deck selected'}${seat.deckImported ? ' <em class="onlineseatimported">imported list</em>' : ''}</span></div>`;
      const unavailable = new Set(view.seats.filter(item => item.seat !== seat.seat).map(item => item.deckId).filter(Boolean));
      if (mine && view.phase === 'lobby') {
        const select = el('select', 'online-deck-select');
        select.setAttribute('aria-label', `${seat.name} deck`);
        select.innerHTML = `<option value="">Choose deck</option>${deckOptions(seat.deckId, unavailable)}`;
        select.onchange = () => {
          const deckId = select.value;
          if (!deckId) return;
          const commanders = MTG.defaultCommanders(MTG.DECKS[deckId], MTG.DEFS);
          this.perform(configureAction(deckId, { commanderNames: commanders, name: seat.name, ready: true }));
        };
        card.appendChild(select);
      }
      return card;
    }

    renderLobby(view) {
      const shell = el('main', 'online-lobby');
      const share = this.client.shareUrl || location.href;
      const playerCount = view.settings && view.settings.playerCount || view.seats.length;
      const readySeats = view.seats.filter(seat => seat.connected && seat.ready);
      const waiting = view.seats.filter(seat => !seat.connected || !seat.ready).map(seat => seat.name);
      const status = readySeats.length === playerCount
        ? `All ${playerCount} players ready`
        : `Waiting for ${waiting.join(', ')}`;
      shell.dataset.onlineView = 'lobby';
      shell.dataset.playerCount = String(playerCount);
      shell.dataset.you = String(view.you);
      shell.dataset.phase = view.phase;
      shell.innerHTML = `
        <header class="online-lobby-head">
          <button type="button" class="online-back">← Back</button>
          <div><span>COMMANDER LIVE · ${playerCount} HUMAN SEATS</span><h1>${view.you === 0 ? 'Your table is open.' : 'You joined the table.'}</h1><p>${playerCount} live players. No bots. One private Commander table.</p></div>
          <div class="online-room-state"><i></i>${view.phase === 'paused' ? 'PAUSED' : 'ROOM ONLINE'}</div>
        </header>
        ${view.you === 0 ? `<section class="online-invite"><div><small>PRIVATE INVITE LINK · ${playerCount - 1} OPEN SEAT${playerCount === 2 ? '' : 'S'}</small><b>${esc(share)}</b></div><button type="button" class="online-copy">Copy invite link</button></section>` : ''}
        <section class="online-seats" aria-label="Commander seats"></section>
        <footer class="online-lobby-actions">
          <div><small>TABLE STATUS</small><b>${esc(status)}</b><span>Every human seat must use a different deck.</span></div>
        </footer>`;
      shell.querySelector('.online-back').onclick = () => this.onBack && this.onBack();
      const copy = shell.querySelector('.online-copy');
      if (copy) copy.onclick = async () => {
        await navigator.clipboard.writeText(share);
        copy.textContent = 'Copied ✓';
      };
      const seatsRoot = shell.querySelector('.online-seats');
      view.seats.forEach(seat => seatsRoot.appendChild(this.seatCard(seat, view)));
      const actions = shell.querySelector('.online-lobby-actions');
      if (view.you === 0) {
        const ready = view.seats.every(seat => seat.connected && seat.ready && seat.deckId) &&
          new Set(view.seats.map(seat => seat.deckId)).size === playerCount;
        if (view.phase === 'paused') {
          const resume = el('button', 'online-start', this.busy ? 'Working…' : 'Resume live game');
          resume.disabled = this.busy || !view.seats.every(seat => seat.connected);
          resume.onclick = () => this.perform({ type: 'resume' });
          actions.appendChild(resume);
        } else {
          const start = el('button', 'online-start', this.busy ? 'Working…' : 'Start live game');
          start.disabled = this.busy || !ready;
          start.onclick = () => this.perform({ type: 'start', seed: Number.isSafeInteger(this.initial && this.initial.seed) ? this.initial.seed : Math.floor(Math.random() * 1e9) });
          actions.appendChild(start);
        }
      } else {
        actions.appendChild(el('div', 'online-guest-wait', `<i></i> Host starts when all ${playerCount} players and decks are ready`));
      }
      return shell;
    }

    renderGame(view) {
      const game = view.gameView;
      const shell = el('main', 'online-remote-game');
      shell.dataset.onlineView = 'remote-game';
      shell.dataset.playerCount = String(view.settings && view.settings.playerCount || view.seats.length);
      shell.dataset.you = String(view.you);
      shell.dataset.phase = view.phase;
      if (!game) {
        shell.innerHTML = '<div class="online-waiting-game"><i></i><h1>Synchronizing the table…</h1><p>The host is preparing the Commander engine.</p></div>';
        return shell;
      }
      const active = game.players.find(player => player.seat === game.activeSeat);
      const mine = game.players.find(player => player.seat === view.you);
      const recoveryOpen = this.lastResortOpen || !!game.lastResortPaused;
      shell.innerHTML = `
        <header class="online-game-head"><div><span>COMMANDER LIVE · PLAYER ${Number(view.you) + 1}</span><b>${esc(active ? active.name : 'Table')} ${game.phase ? `· ${esc(game.phase)}` : ''}</b></div><div class="online-game-tools"><button type="button" class="online-last-resort-toggle${recoveryOpen ? ' active' : ''}">🛠️ ${recoveryOpen ? 'FINISH RECOVERY' : 'LAST RESORT'}</button><div class="online-room-state"><i></i>${view.phase === 'paused' ? 'PAUSED — RECONNECTING' : recoveryOpen ? 'RECOVERY PAUSE' : 'LIVE'}</div></div></header>
        <section class="online-player-strip"></section>
        <section class="online-remote-board"><div class="online-battlefield"><div class="online-section-title">Battlefield <span>${game.battlefield.length} permanents</span></div><div class="online-card-row battlefield"></div></div><div class="online-stack"><div class="online-section-title">The Stack <span>${game.stack.length}</span></div><div class="online-stack-list"></div></div></section>
        <section class="online-own-hand"><div class="online-section-title">Your hand <span>${(mine && mine.hand || []).length} cards</span></div><div class="online-card-row hand"></div></section>
        <section class="online-decision-stage"></section>`;
      const strip = shell.querySelector('.online-player-strip');
      game.players.forEach(player => strip.appendChild(el('article', `online-player ${player.seat === game.activeSeat ? 'active' : ''} ${player.lost ? 'lost' : ''}`, `<small>SEAT 0${player.seat + 1} · HUMAN</small><b>${esc(player.name)}</b><span>${esc(player.deckId || '')}</span><strong>${player.life} <em>LIFE</em></strong><i>${player.handCount} cards · ${player.libraryCount} library</i>`)));
      const battlefield = shell.querySelector('.online-card-row.battlefield');
      game.battlefield.forEach(card => battlefield.appendChild(this.remoteCard(card)));
      const hand = shell.querySelector('.online-card-row.hand');
      (mine && mine.hand || []).forEach(card => hand.appendChild(this.remoteCard(card)));
      const stack = shell.querySelector('.online-stack-list');
      if (!game.stack.length) stack.appendChild(el('div', 'online-empty-stack', 'Stack is empty'));
      game.stack.slice().reverse().forEach(item => stack.appendChild(el('article', 'online-stack-item', `<small>${esc(item.kind)}</small><b>${esc(item.name)}</b><span>Seat 0${Number(item.controllerSeat) + 1}</span>`)));
      const toggleRecovery = shell.querySelector('.online-last-resort-toggle');
      toggleRecovery.onclick = async () => {
        if (!recoveryOpen && !window.confirm('Enable Last Resort? This pauses the host engine and exposes only public-state corrections. Other hands, libraries, and face-down identities remain hidden.')) return;
        const next = !recoveryOpen;
        this.lastResortOpen = next;
        await this.perform({ type: 'manualAction', action: { type: 'setPause', value: next } });
      };
      if (recoveryOpen) shell.insertBefore(this.renderRemoteLastResort(view, game), shell.querySelector('.online-decision-stage'));
      shell.querySelector('.online-decision-stage').appendChild(view.phase === 'paused'
        ? el('div', 'online-decision waiting', '<div><small>TABLE PAUSED</small><b>Waiting for the host to resume</b><span>Your seat and pending decision are preserved while players reconnect.</span></div>')
        : this.renderDecision(view.pendingDecision));
      return shell;
    }

    renderHostReconnect(view) {
      // The host's lobby is hidden while the full Arena is mounted. Keep the
      // reconnect control in the document's top layer so it remains reachable.
      if (!this.started || view?.you !== 0 || view.phase !== 'paused' || !window._game) {
        if (this.reconnectDialog) {
          this.reconnectDialog.close();
          this.reconnectDialog.remove();
          this.reconnectDialog = null;
        }
        return;
      }
      if (!this.reconnectDialog) {
        const dialog = el('dialog', 'modal online-reconnect-dialog', '<h2 id="online-reconnect-title">Live game paused</h2><p class="online-reconnect-status" role="status" aria-live="polite"></p><p>The current game and player decisions are preserved. Keep this host tab open.</p><div class="btnrow"><button type="button" class="pbtn primary online-resume">Resume live game</button></div><p class="online-reconnect-error" role="alert"></p>');
        dialog.setAttribute('aria-labelledby', 'online-reconnect-title');
        Object.assign(dialog.style, { margin: 'auto', width: 'min(90vw, 540px)', color: 'inherit', borderRadius: '16px' });
        dialog.addEventListener('cancel', event => event.preventDefault());
        dialog.querySelector('.online-resume').onclick = () => this.perform({ type: 'resume' });
        document.body.appendChild(dialog);
        this.reconnectDialog = dialog;
        dialog.showModal();
      }
      const disconnected = view.seats.filter(seat => !seat.connected);
      this.reconnectDialog.querySelector('.online-reconnect-status').textContent = disconnected.length
        ? `Waiting for ${disconnected.map(seat => seat.name).join(', ')} to reconnect.`
        : 'Everyone is connected. Resume when your table is ready.';
      const resume = this.reconnectDialog.querySelector('.online-resume');
      resume.disabled = this.busy || disconnected.length > 0;
      resume.textContent = this.busy ? 'Resuming…' : 'Resume live game';
      this.reconnectDialog.querySelector('.online-reconnect-error').textContent = this.error || '';
    }

    renderRemoteLastResort(view, game) {
      const panel = el('section', 'online-last-resort');
      panel.innerHTML = '<div class="online-last-resort-head"><div><small>GAME PAUSED · PUBLIC STATE ONLY</small><b>Last Resort</b><span>Every correction is validated by the host and written to the public log.</span></div><em>Hidden hands, libraries and face-down identities stay locked.</em></div>';
      const players = game.players.filter(player => !player.lost);
      if (!players.some(player => player.seat === Number(this.lastResortPlayerSeat))) this.lastResortPlayerSeat = view.you;
      const selected = players.find(player => player.seat === Number(this.lastResortPlayerSeat)) || players[0];
      const controls = el('div', 'online-last-resort-controls');
      const select = el('select', 'online-last-resort-player');
      players.forEach(player => {
        const option = el('option', '', `${player.name} · ${player.life} life${player.isAI ? ' · AI' : ''}`);
        option.value = String(player.seat); option.selected = player.seat === selected.seat; select.appendChild(option);
      });
      select.onchange = () => { this.lastResortPlayerSeat = Number(select.value); this.render(); };
      controls.appendChild(select);
      const send = action => this.perform({ type: 'manualAction', action });
      const actionButton = (label, run) => { const button = el('button', 'online-choice', label); button.onclick = run; controls.appendChild(button); };
      const publicCards = game.battlefield.concat(...players.flatMap(player => ['graveyard', 'exile', 'command'].flatMap(zone => player[zone] || [])))
        .filter(card => card && !card.hidden);
      const chooseCard = promptText => {
        if (!publicCards.length) return null;
        const preview = publicCards.slice(0, 60).map(card => `${card.token} · ${card.name} · ${card.zone}`).join('\n');
        const answer = window.prompt(`${promptText}\n\n${preview}`, publicCards[0].token);
        return publicCards.find(card => card.token === answer || card.name === answer) || null;
      };
      actionButton(`❤️ Set life · ${selected.life}`, () => {
        const value = Number(window.prompt(`${selected.name}: exact life total`, String(selected.life)));
        if (Number.isInteger(value)) send({ type: 'setLife', playerSeat: selected.seat, value });
      });
      actionButton('🔮 Set mana…', () => {
        const color = String(window.prompt('Mana color (W/U/B/R/G/C)', 'G') || '').toUpperCase();
        const value = Number(window.prompt(`Exact {${color}} amount`, String(selected.manaPool && selected.manaPool[color] || 0)));
        if (Number.isInteger(value)) send({ type: 'setMana', playerSeat: selected.seat, color, value });
      });
      actionButton('◆ Set card counter…', () => {
        const card = chooseCard('Public card token or exact name'); if (!card) return;
        const counter = window.prompt('Counter name', '+1/+1'); if (!counter) return;
        const value = Number(window.prompt('Exact counter amount', String(card.counters && card.counters[counter] || 0)));
        if (Number.isInteger(value)) send({ type: 'setCounter', cardToken: card.token, counter, value });
      });
      actionButton('🔄 Tap / untap…', () => {
        const card = chooseCard('Battlefield card token or exact name'); if (card && card.zone === 'battlefield') send({ type: 'setTapped', cardToken: card.token, value: !card.tapped });
      });
      actionButton('🤝 Give control to selected…', () => {
        const card = chooseCard('Battlefield card token or exact name'); if (card) send({ type: 'setController', cardToken: card.token, playerSeat: selected.seat });
      });
      actionButton('← Reorder left…', () => { const card = chooseCard('Battlefield card'); if (card) send({ type: 'reorder', cardToken: card.token, direction: -1 }); });
      actionButton('Reorder right… →', () => { const card = chooseCard('Battlefield card'); if (card) send({ type: 'reorder', cardToken: card.token, direction: 1 }); });
      actionButton('🗂️ Move public card…', () => {
        const card = chooseCard('Public card token or exact name'); if (!card) return;
        const toZone = String(window.prompt('Destination: battlefield / graveyard / exile / command / hand', 'battlefield') || '').toLowerCase();
        send({ type: 'moveCard', cardToken: card.token, toZone, playerSeat: selected.seat });
      });
      actionButton('💎 Add Treasure', () => send({ type: 'createToken', playerSeat: selected.seat, tokenKey: 'treasure', count: 1 }));
      actionButton('➕ Add token…', () => { const tokenKey = window.prompt('Token key', 'drake'); if (tokenKey) send({ type: 'createToken', playerSeat: selected.seat, tokenKey, count: 1 }); });
      actionButton('➕ Add permanent…', () => { const name = window.prompt('Exact permanent card name', 'Sol Ring'); if (name) send({ type: 'addPermanent', playerSeat: selected.seat, name }); });
      panel.appendChild(controls);
      if (view.lastManualAction) panel.appendChild(el('div', `online-last-resort-result ${view.lastManualAction.ok ? 'ok' : 'error'}`, esc(view.lastManualAction.message || (view.lastManualAction.ok ? 'Correction applied.' : 'Correction rejected.'))));
      return panel;
    }

    remoteCard(card) {
      const node = el('article', `online-remote-card ${card.hidden ? 'hidden' : ''} ${card.tapped ? 'tapped' : ''}`);
      node.innerHTML = card.hidden
        ? '<div class="online-card-back">COMMANDER</div><b>Hidden card</b>'
        : `<img src="${artURL(card.name)}" alt="${esc(card.name)}" onerror="MTG.imgFail(this)"><b>${esc(card.name)}</b>${card.power !== undefined ? `<span>${card.power}/${card.toughness}</span>` : ''}`;
      return node;
    }

    renderDecision(decision) {
      const stage = el('div', `online-decision ${decision ? 'active' : 'waiting'}`);
      if (!decision) {
        stage.innerHTML = '<div><i></i><small>TABLE RUNNING</small><b>Waiting for your next decision</b><span>You can inspect the public board and your hand while another player acts.</span></div>';
        return stage;
      }
      if (!this.decisionState || this.decisionState.id !== decision.id) this.decisionState = { id: decision.id, selected: [], assignments: [], number: decision.min ?? 0 };
      const state = this.decisionState;
      stage.innerHTML = `<div class="online-decision-head"><small>YOUR DECISION · ${esc(decision.type)}</small><h2>${esc(decision.prompt || 'Choose an action')}</h2></div>`;
      const choices = el('div', 'online-decision-choices');
      const submit = response => this.perform({ type: 'decisionResponse', decisionId: decision.id, response });
      if (decision.legal.kind === 'ack') {
        const button = el('button', 'online-choice primary', 'Proceed'); button.onclick = () => submit('ok'); choices.appendChild(button);
      } else if (decision.legal.kind === 'boolean') {
        [['Keep', false], ['Mulligan', true]].forEach(([label, value]) => { const button = el('button', `online-choice ${value ? '' : 'primary'}`, label); button.onclick = () => submit(value); choices.appendChild(button); });
      } else if (decision.legal.kind === 'token') {
        (decision.options || decision.actions || []).forEach(option => {
          const button = el('button', `online-choice ${option.kind === 'pass' || option.kind === 'done' ? 'primary' : ''}`, `<b>${esc(option.label)}</b>${option.card ? `<span>${esc(option.card.name)}</span>` : ''}`);
          button.onclick = () => submit(option.token); choices.appendChild(button);
        });
      } else if (decision.legal.kind === 'number') {
        const row = el('div', 'online-number-choice');
        const input = document.createElement('input'); input.type = 'number'; input.min = String(decision.min); input.max = String(decision.max); input.value = String(state.number);
        input.oninput = () => { state.number = Number(input.value); };
        const button = el('button', 'online-choice primary', 'Confirm number'); button.onclick = () => submit(state.number);
        row.appendChild(input); row.appendChild(button); choices.appendChild(row);
      } else if (decision.legal.kind === 'tokens') {
        (decision.choices || decision.options || []).forEach(option => {
          const button = el('button', `online-choice ${state.selected.includes(option.token) ? 'selected' : ''}`, esc(option.label || option.name));
          button.onclick = () => {
            const index = state.selected.indexOf(option.token);
            if (index >= 0) state.selected.splice(index, 1); else if (state.selected.length < decision.legal.max) state.selected.push(option.token);
            this.render();
          };
          choices.appendChild(button);
        });
        const confirm = el('button', 'online-choice primary', `Confirm (${state.selected.length})`);
        confirm.disabled = state.selected.length < decision.legal.min || state.selected.length > decision.legal.max;
        confirm.onclick = () => submit(state.selected.slice()); choices.appendChild(confirm);
      } else if (decision.legal.kind === 'assignments') {
        const selectLeft = document.createElement('select'); selectLeft.innerHTML = '<option value="">Choose card</option>' + (decision.left || []).map(item => `<option value="${esc(item.token)}">${esc(item.name)}</option>`).join('');
        const selectRight = document.createElement('select'); selectRight.innerHTML = '<option value="">Choose target</option>' + (decision.right || []).map(item => `<option value="${esc(item.token)}">${esc(item.name)}</option>`).join('');
        const add = el('button', 'online-choice', 'Add assignment'); add.onclick = () => {
          if (!selectLeft.value || !selectRight.value) return;
          state.assignments = state.assignments.filter(item => item.left !== selectLeft.value);
          state.assignments.push({ left: selectLeft.value, right: selectRight.value });
          this.render();
        };
        choices.appendChild(selectLeft); choices.appendChild(selectRight); choices.appendChild(add);
        state.assignments.forEach(item => choices.appendChild(el('div', 'online-assignment', `${esc(item.left)} → ${esc(item.right)}`)));
        const confirm = el('button', 'online-choice primary', state.assignments.length ? 'Confirm assignments' : 'Declare none'); confirm.onclick = () => submit(state.assignments.slice()); choices.appendChild(confirm);
      } else if (decision.legal.kind === 'scry') {
        state.scry = state.scry || { top: (decision.choices || []).map(item => item.token), bottom: [] };
        (decision.choices || []).forEach(item => {
          const onTop = state.scry.top.includes(item.token);
          const button = el('button', `online-choice ${onTop ? 'selected' : ''}`, `${esc(item.name)} · ${onTop ? 'TOP' : 'BOTTOM'}`);
          button.onclick = () => {
            const from = onTop ? state.scry.top : state.scry.bottom;
            const to = onTop ? state.scry.bottom : state.scry.top;
            from.splice(from.indexOf(item.token), 1); to.push(item.token); this.render();
          };
          choices.appendChild(button);
        });
        const confirm = el('button', 'online-choice primary', 'Confirm scry'); confirm.onclick = () => submit({ top: state.scry.top.slice(), bottom: state.scry.bottom.slice() }); choices.appendChild(confirm);
      } else if (decision.legal.kind === 'mana') {
        const auto = el('button', 'online-choice primary', 'Use automatic mana'); auto.onclick = () => submit({ auto: true }); choices.appendChild(auto);
      }
      stage.appendChild(choices);
      return stage;
    }

    render() {
      this.renderHostReconnect(this.view);
      if (!this.root) return;
      this.root.innerHTML = '';
      if (!this.view) {
        this.root.appendChild(el('main', 'online-lobby loading', '<div class="online-waiting-game"><i></i><h1>Opening your private table…</h1></div>'));
        return;
      }
      const content = this.view.phase === 'lobby' ? this.renderLobby(this.view) : this.view.you !== 0 ? this.renderGame(this.view) : this.renderLobby(this.view);
      if (this.error) content.prepend(el('div', 'online-error', esc(this.error)));
      this.root.appendChild(content);
    }
  }

  MTG.mountOnlineLobby = async options => {
    const lobby = new OnlineLobby(options);
    await lobby.mount();
    return lobby;
  };
})();
