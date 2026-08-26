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

  function deckCatalog() {
    return Object.entries(MTG.DECKS || {}).filter(([, deck]) => !deck.custom).map(([name, deck]) => ({
      id: name, commander: deck.commander, meta: MTG.DECK_META && MTG.DECK_META[name] || {},
    }));
  }

  function deckOptions(selected, unavailable = new Set()) {
    return deckCatalog().map(deck => `<option value="${esc(deck.id)}"${deck.id === selected ? ' selected' : ''}${unavailable.has(deck.id) && deck.id !== selected ? ' disabled' : ''}>${esc(deck.id)} — ${esc(deck.commander)}</option>`).join('');
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
        await this.perform({
          type: 'configure', deckId: this.initial.deck,
          commanderNames: this.initial.commanders || [], name: this.initial.name || 'Host', ready: true,
        });
        const botDecks = MTG.selectOnlineBotDecks([this.initial.deck], this.initial.aiDecks || [], MTG.mulberry32(this.initial.seed || 1));
        for (let index = 0; index < 2; index++) await this.perform({
          type: 'configureBot', seat: index + 2, deckId: botDecks[index],
          aiStyle: (this.initial.aiStyles || [])[index] || 'balanced',
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
        <div class="onlineseatstatus"><i></i>${seat.kind === 'bot' ? 'LOCAL AI V2' : seat.connected ? 'CONNECTED' : 'WAITING'}</div>
        ${deck ? `<img src="${artURL(deck.commander)}" alt="${esc(deck.commander)}" onerror="MTG.imgFail(this)">` : '<div class="onlineseatempty">+</div>'}
        <div class="onlineseatcopy"><small>${esc(seat.role)}</small><b>${esc(seat.name)}</b><span>${seat.deckId ? esc(seat.deckId) : 'No deck selected'}</span></div>`;
      const unavailable = new Set(view.seats.filter(item => item.seat !== seat.seat).map(item => item.deckId).filter(Boolean));
      if ((seat.kind === 'human' && mine && view.phase === 'lobby') || (seat.kind === 'bot' && view.you === 0 && view.phase === 'lobby')) {
        const select = el('select', 'online-deck-select');
        select.setAttribute('aria-label', `${seat.name} deck`);
        select.innerHTML = `<option value="">Choose deck</option>${deckOptions(seat.deckId, unavailable)}`;
        select.onchange = () => {
          const deckId = select.value;
          if (!deckId) return;
          const commanders = MTG.defaultCommanders(MTG.DECKS[deckId], MTG.DEFS);
          if (seat.kind === 'bot') this.perform({ type: 'configureBot', seat: seat.seat, deckId, aiStyle: seat.aiStyle || 'balanced', commanderNames: commanders });
          else this.perform({ type: 'configure', deckId, commanderNames: commanders, name: seat.name, ready: true });
        };
        card.appendChild(select);
      }
      return card;
    }

    renderLobby(view) {
      const shell = el('main', 'online-lobby');
      const share = this.client.shareUrl || location.href;
      shell.innerHTML = `
        <header class="online-lobby-head">
          <button type="button" class="online-back">← Back</button>
          <div><span>COMMANDER LIVE</span><h1>${view.you === 0 ? 'Your table is open.' : 'You joined the table.'}</h1><p>Two live players. Two deterministic AI V2 bots. One private Commander pod.</p></div>
          <div class="online-room-state"><i></i>${view.phase === 'paused' ? 'PAUSED' : 'ROOM ONLINE'}</div>
        </header>
        ${view.you === 0 ? `<section class="online-invite"><div><small>PRIVATE INVITE LINK</small><b>${esc(share)}</b></div><button type="button" class="online-copy">Copy friend link</button></section>` : ''}
        <section class="online-seats" aria-label="Commander seats"></section>
        <footer class="online-lobby-actions">
          <div><small>TABLE STATUS</small><b>${view.seats.slice(0, 2).every(seat => seat.connected && seat.ready) ? 'Both players ready' : 'Waiting for Player 2'}</b><span>Every seat must use a different deck.</span></div>
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
        const ready = view.seats.slice(0, 2).every(seat => seat.connected && seat.ready) &&
          view.seats.every(seat => seat.deckId) && new Set(view.seats.map(seat => seat.deckId)).size === 4;
        if (view.phase === 'paused') {
          const resume = el('button', 'online-start', this.busy ? 'Working…' : 'Resume live game');
          resume.disabled = this.busy || !view.seats.slice(0, 2).every(seat => seat.connected);
          resume.onclick = () => this.perform({ type: 'resume' });
          actions.appendChild(resume);
        } else {
          const start = el('button', 'online-start', this.busy ? 'Working…' : 'Start live game');
          start.disabled = this.busy || !ready;
          start.onclick = () => this.perform({ type: 'start', seed: Number.isSafeInteger(this.initial && this.initial.seed) ? this.initial.seed : Math.floor(Math.random() * 1e9) });
          actions.appendChild(start);
        }
      } else {
        actions.appendChild(el('div', 'online-guest-wait', '<i></i> Host starts when all four decks are ready'));
      }
      return shell;
    }

    renderGame(view) {
      const game = view.gameView;
      const shell = el('main', 'online-remote-game');
      if (!game) {
        shell.innerHTML = '<div class="online-waiting-game"><i></i><h1>Synchronizing the table…</h1><p>The host is preparing the Commander engine.</p></div>';
        return shell;
      }
      const active = game.players.find(player => player.seat === game.activeSeat);
      shell.innerHTML = `
        <header class="online-game-head"><div><span>COMMANDER LIVE · PLAYER 2</span><b>${esc(active ? active.name : 'Table')} ${game.phase ? `· ${esc(game.phase)}` : ''}</b></div><div class="online-room-state"><i></i>${view.phase === 'paused' ? 'PAUSED — RECONNECTING' : 'LIVE'}</div></header>
        <section class="online-player-strip"></section>
        <section class="online-remote-board"><div class="online-battlefield"><div class="online-section-title">Battlefield <span>${game.battlefield.length} permanents</span></div><div class="online-card-row battlefield"></div></div><div class="online-stack"><div class="online-section-title">The Stack <span>${game.stack.length}</span></div><div class="online-stack-list"></div></div></section>
        <section class="online-own-hand"><div class="online-section-title">Your hand <span>${(game.players.find(player => player.seat === 1)?.hand || []).length} cards</span></div><div class="online-card-row hand"></div></section>
        <section class="online-decision-stage"></section>`;
      const strip = shell.querySelector('.online-player-strip');
      game.players.forEach(player => strip.appendChild(el('article', `online-player ${player.seat === game.activeSeat ? 'active' : ''} ${player.lost ? 'lost' : ''}`, `<small>SEAT 0${player.seat + 1}${player.isAI ? ' · AI V2' : ''}</small><b>${esc(player.name)}</b><span>${esc(player.deckId || '')}</span><strong>${player.life} <em>LIFE</em></strong><i>${player.handCount} cards · ${player.libraryCount} library</i>`)));
      const battlefield = shell.querySelector('.online-card-row.battlefield');
      game.battlefield.forEach(card => battlefield.appendChild(this.remoteCard(card)));
      const own = game.players.find(player => player.seat === 1);
      const hand = shell.querySelector('.online-card-row.hand');
      (own && own.hand || []).forEach(card => hand.appendChild(this.remoteCard(card)));
      const stack = shell.querySelector('.online-stack-list');
      if (!game.stack.length) stack.appendChild(el('div', 'online-empty-stack', 'Stack is empty'));
      game.stack.slice().reverse().forEach(item => stack.appendChild(el('article', 'online-stack-item', `<small>${esc(item.kind)}</small><b>${esc(item.name)}</b><span>Seat 0${Number(item.controllerSeat) + 1}</span>`)));
      shell.querySelector('.online-decision-stage').appendChild(this.renderDecision(view.pendingDecision));
      return shell;
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
        stage.innerHTML = '<div><i></i><small>TABLE RUNNING</small><b>Waiting for your next decision</b><span>You can inspect the public board and your hand while the host or bots act.</span></div>';
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
      if (!this.root) return;
      this.root.innerHTML = '';
      if (!this.view) {
        this.root.appendChild(el('main', 'online-lobby loading', '<div class="online-waiting-game"><i></i><h1>Opening your private table…</h1></div>'));
        return;
      }
      const content = this.view.phase === 'lobby' ? this.renderLobby(this.view) : this.view.you === 1 ? this.renderGame(this.view) : this.renderLobby(this.view);
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
