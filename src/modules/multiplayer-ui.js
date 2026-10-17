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
  const artURL = name => MTG.cardImageURL(name, 'art');
  const icon = name => typeof MTG.icon === 'function' ? MTG.icon(name) : '';
  const actionLabel = type => ({ join: 'Joining the table…', configure: 'Saving deck selection…', configureSeat: 'Updating seat…', resizeRoom: 'Updating seats…', configureSettings: 'Saving table settings…', start: 'Starting the game…', resume: 'Resuming the game…' }[type] || 'Updating the table…');

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
      this.busyLabel = '';
      this.inviteFeedback = '';
      this.inviteCopyFailed = false;
      this.copyingInvite = false;
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
      if (this.busy) return;
      this.busy = true;
      this.busyLabel = actionLabel(action.type);
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
      const editable = (mine || view.you === 0 && seat.kind === 'bot') && view.phase === 'lobby';
      const ready = seat.connected && seat.ready && !!seat.deckId;
      const status = !seat.connected ? (seat.occupied ? 'Reconnecting' : 'Open seat')
        : ready ? 'Ready to play' : 'Choose a deck';
      const card = el('article', `onlineseat ${seat.kind} ${mine ? 'mine' : ''} ${seat.connected ? 'connected' : 'waiting'} ${ready ? 'ready' : ''}`);
      card.dataset.seat = String(seat.seat);
      card.setAttribute('aria-label', `Seat ${seat.seat + 1}: ${seat.name}${mine ? ', you' : ''}. ${status}.`);
      const deck = MTG.DECKS[seat.deckId];
      const commanders = seat.commanderNames?.length ? seat.commanderNames : deck ? [deck.commander] : [];
      card.innerHTML = `
        <div class="onlineseattop"><span class="onlineseatnum">SEAT <b>${String(seat.seat + 1).padStart(2, '0')}</b></span><span class="onlineseatidentity">${mine ? 'You' : seat.kind === 'bot' ? 'AI opponent' : seat.seat === 0 ? 'Host' : 'Player'}</span></div>
        <div class="onlineseatart">${commanders.length ? `<img class="${MTG.CARD_IMAGE_PATHS?.[commanders[0]] && !MTG.CARD_ART_PATHS?.[commanders[0]] ? 'full-card-art' : ''}" src="${esc(artURL(commanders[0]))}" alt="${esc(commanders.join(' and '))}" onerror="MTG.imgFail(this)">` : `<div class="onlineseatempty">${icon('player')}<span>${seat.kind === 'bot' ? 'Choose an AI deck' : mine ? 'Make this seat yours' : 'A seat for your friend'}</span></div>`}</div>
        <div class="onlineseatcopy"><small>${seat.kind === 'bot' ? 'AI OPPONENT' : seat.seat === 0 ? 'TABLE HOST' : 'HUMAN PLAYER'}</small><b>${esc(seat.name)}</b><span>${seat.deckId ? esc(seat.deckId) : 'No deck selected'}</span>${commanders.length ? `<span class="onlineseatcommander">${esc(commanders.join(' + '))}</span>` : ''}${seat.deckImported ? '<em class="onlineseatimported">From My Library</em>' : ''}</div>
        <div class="onlineseatstatus"><i aria-hidden="true"></i>${esc(status)}</div>`;
      const unavailable = new Set(view.seats.filter(item => item.seat !== seat.seat).map(item => item.deckId).filter(Boolean));
      const fields = el('div', 'onlineseatfields');
      if (view.you === 0 && seat.seat !== 0 && !seat.occupied && view.phase === 'lobby') {
        const field = el('label', 'online-field', '<span>Who plays here?</span>');
        const kind = el('select', 'online-seat-kind');
        kind.setAttribute('aria-label', `Seat ${seat.seat + 1} type`);
        kind.dataset.liveFocus = `seat-kind-${seat.seat}`;
        kind.innerHTML = `<option value="human"${seat.kind === 'human' ? ' selected' : ''}>Human player</option><option value="bot"${seat.kind === 'bot' ? ' selected' : ''}>AI opponent</option>`;
        kind.disabled = this.busy;
        kind.onchange = () => this.perform({ type: 'configureSeat', seat: seat.seat, kind: kind.value });
        field.appendChild(kind);
        fields.appendChild(field);
      }
      if (editable) {
        const field = el('label', 'online-field', `<span>${mine ? 'Your deck' : 'AI deck'}</span>`);
        const select = el('select', 'online-deck-select');
        select.setAttribute('aria-label', `${seat.name} deck`);
        select.dataset.liveFocus = `seat-deck-${seat.seat}`;
        select.disabled = this.busy;
        select.innerHTML = `<option value="">Choose a deck…</option>${deckOptions(seat.deckId, unavailable)}`;
        select.onchange = () => {
          const deckId = select.value;
          if (!deckId) return;
          const commanders = MTG.defaultCommanders(MTG.DECKS[deckId], MTG.DEFS);
          this.perform(configureAction(deckId, { commanderNames: commanders, name: seat.name, ready: true, seat: seat.seat }));
        };
        field.appendChild(select);
        fields.appendChild(field);
      }
      if (fields.children.length) card.appendChild(fields);
      else if (!ready) card.appendChild(el('p', 'onlineseathint', !seat.connected
        ? (seat.occupied ? 'Their seat is saved while they reconnect.' : 'Share the invite link to fill this seat.')
        : 'This player is choosing their deck.'));
      return card;
    }

    async copyInvite(share) {
      if (this.copyingInvite) return;
      this.copyingInvite = true;
      this.inviteFeedback = '';
      this.inviteCopyFailed = false;
      this.render();
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(share);
        this.inviteFeedback = 'Invite copied. Send it to your friends.';
      } catch {
        this.inviteCopyFailed = true;
        this.inviteFeedback = 'Copy is unavailable here. Select and copy the link below.';
      } finally {
        this.copyingInvite = false;
        // Clipboard permission may resolve after Back or a new room was opened.
        // Only update the surface that still belongs to this lobby.
        if (!this.root?.contains(this.lobbySurface)) return;
        this.render();
        if (this.inviteCopyFailed) {
          const field = this.root?.querySelector('.online-invite-manual input');
          field?.focus();
          field?.select();
        }
      }
    }

    renderLobby(view) {
      const shell = el('main', 'online-lobby');
      const share = this.client.shareUrl || location.href;
      const playerCount = view.settings && view.settings.playerCount || view.seats.length;
      const humanCount = view.seats.filter(seat => seat.kind === 'human').length;
      const botCount = playerCount - humanCount;
      const openSeats = view.seats.filter(seat => seat.kind === 'human' && !seat.occupied).length;
      const readySeats = view.seats.filter(seat => seat.connected && seat.ready && seat.deckId);
      const disconnected = view.seats.filter(seat => !seat.connected);
      const missingDecks = view.seats.filter(seat => seat.connected && (!seat.ready || !seat.deckId));
      const uniqueDecks = new Set(view.seats.map(seat => seat.deckId).filter(Boolean)).size === playerCount;
      const ready = readySeats.length === playerCount && uniqueDecks;
      const paused = view.phase === 'paused';
      const status = paused ? (disconnected.length ? 'Waiting for players to reconnect' : 'Everyone is connected')
        : ready ? 'Your pod is ready' : `${readySeats.length} of ${playerCount} seats ready`;
      const hint = paused ? (disconnected.length ? `${disconnected.map(seat => seat.name).join(', ')} will return to the same seat.` : 'The host can resume when everyone is ready.')
        : openSeats ? `Invite ${openSeats === 1 ? 'a friend' : `${openSeats} friends`}, or fill open seats with AI opponents.`
        : disconnected.length ? `Waiting for ${disconnected.map(seat => seat.name).join(', ')} to reconnect.`
        : missingDecks.length ? `${missingDecks.map(seat => seat.name).join(', ')} ${missingDecks.length === 1 ? 'needs' : 'need'} to choose a deck.`
        : !uniqueDecks ? 'Choose a different deck for each seat.'
        : view.you === 0 ? 'Start whenever your table is ready.' : 'The host will start the game.';
      shell.dataset.onlineView = 'lobby';
      shell.dataset.playerCount = String(playerCount);
      shell.dataset.you = String(view.you);
      shell.dataset.phase = view.phase;
      shell.setAttribute('aria-busy', String(this.busy));
      shell.innerHTML = `
        <header class="online-lobby-head">
          <button type="button" class="online-back" data-live-focus="back"><span aria-hidden="true">←</span> Back</button>
          <div class="online-lobby-title"><span>COMMANDER LIVE</span><h1>${paused ? 'Your table is paused.' : view.you === 0 ? 'Gather your pod.' : 'You’re at the table.'}</h1><p>${view.you === 0 ? 'Invite your friends, choose your decks, and settle in.' : 'Choose your deck below. The host starts when everyone is ready.'}</p><div class="online-pod-summary"><span>${playerCount} seats</span><span>${humanCount} human${humanCount === 1 ? '' : 's'}</span>${botCount ? `<span>${botCount} AI opponent${botCount === 1 ? '' : 's'}</span>` : ''}</div></div>
          <div class="online-room-state${paused ? ' paused' : ''}" role="status"><i aria-hidden="true"></i>${paused ? 'Game paused' : 'Room connected'}</div>
        </header>
        ${view.you === 0 ? `<section class="online-invite" aria-label="Invite friends"><div class="online-invite-copy"><small>YOUR PRIVATE TABLE</small><strong>${openSeats ? `Invite ${openSeats === 1 ? 'a friend' : 'your friends'}` : 'Everyone has a seat'}</strong><span>${openSeats ? `${openSeats} open human seat${openSeats === 1 ? '' : 's'} · Anyone with this link can join an open seat.` : 'Keep this link handy if a player needs to reconnect.'}</span><b title="${esc(share)}">${esc(share)}</b></div><button type="button" class="online-copy" data-live-focus="invite-copy"${this.copyingInvite ? ' disabled' : ''}>${this.copyingInvite ? 'Copying…' : this.inviteFeedback && !this.inviteCopyFailed ? 'Copy again' : 'Copy invite link'}</button><p class="online-invite-feedback" role="status" aria-live="polite">${esc(this.inviteFeedback)}</p>${this.inviteCopyFailed ? `<label class="online-invite-manual"><span>Invite link — select and copy</span><input type="text" readonly value="${esc(share)}" data-live-focus="invite-manual" spellcheck="false" autocomplete="off"></label>` : ''}</section>` : ''}
        <div class="online-seats-heading"><div><small>THE POD</small><h2>${paused ? 'Your players' : 'Choose your seats'}</h2></div><span>Every seat uses a different deck</span></div>
        <section class="online-seats" aria-label="Commander seats"></section>
        <footer class="online-lobby-actions">
          <div class="online-ready-summary" role="status" aria-live="polite"><small>${this.busy ? 'UPDATING TABLE' : 'TABLE STATUS'}</small><b>${esc(this.busy ? this.busyLabel : status)}</b><span>${esc(hint)}</span><div class="online-ready-track" aria-hidden="true">${view.seats.map(seat => `<i class="${seat.connected && seat.ready && seat.deckId ? 'ready' : ''}"></i>`).join('')}</div></div>
        </footer>
        <p class="online-host-note">${icon('info')}<span>${view.you === 0 ? 'Keep this host tab open during the game. The table pauses if a player disconnects.' : 'The table pauses if a player disconnects. Reopen your invite link to return to your seat.'}</span></p>`;
      shell.querySelector('.online-back').onclick = () => this.onBack && this.onBack();
      const copy = shell.querySelector('.online-copy');
      if (copy) copy.onclick = () => this.copyInvite(share);
      const seatsRoot = shell.querySelector('.online-seats');
      view.seats.forEach(seat => seatsRoot.appendChild(this.seatCard(seat, view)));
      const actions = shell.querySelector('.online-lobby-actions');
      if (view.you === 0) {
        if (view.phase === 'lobby') {
          const resize = el('div', 'online-seat-count');
          if (playerCount < 4) {
            const add = el('button', 'online-choice', '<span aria-hidden="true">+</span> Add seat');
            add.type = 'button';
            add.dataset.liveFocus = 'add-seat';
            add.disabled = this.busy;
            add.onclick = () => this.perform({ type: 'resizeRoom', playerCount: playerCount + 1 });
            resize.appendChild(add);
          }
          if (playerCount > 2 && !view.seats.at(-1).occupied) {
            const remove = el('button', 'online-choice', 'Remove last seat');
            remove.type = 'button';
            remove.dataset.liveFocus = 'remove-seat';
            remove.disabled = this.busy;
            remove.onclick = () => this.perform({ type: 'resizeRoom', playerCount: playerCount - 1 });
            resize.appendChild(remove);
          }
          if (resize.children.length) actions.appendChild(resize);
        }
        const start = el('button', 'online-start', this.busy ? this.busyLabel : paused ? 'Resume live game' : 'Start live game');
        start.type = 'button';
        start.dataset.liveFocus = 'start';
        start.disabled = this.busy || (paused ? disconnected.length > 0 : !ready);
        start.setAttribute('aria-describedby', 'online-start-hint');
        shell.querySelector('.online-ready-summary > span').id = 'online-start-hint';
        start.onclick = () => this.perform(paused ? { type: 'resume' } : { type: 'start', seed: Number.isSafeInteger(this.initial && this.initial.seed) ? this.initial.seed : Math.floor(Math.random() * 1e9) });
        actions.appendChild(start);
      } else {
        actions.appendChild(el('div', 'online-guest-wait', `<i aria-hidden="true"></i><span>${ready ? 'Ready. Waiting for your host.' : 'Your host starts the game.'}</span>`));
      }
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
        const dialog = el('dialog', 'modal online-reconnect-dialog', `<div class="online-reconnect-mark" aria-hidden="true">${icon('info')}</div><small>CONNECTION CHECK</small><h2 id="online-reconnect-title">Your table is paused</h2><p class="online-reconnect-status" role="status" aria-live="polite"></p><p>The current game and player decisions are preserved. Keep this host tab open.</p><div class="btnrow"><button type="button" class="pbtn primary online-resume">Resume live game</button></div><p class="online-reconnect-error" role="alert"></p>`);
        dialog.setAttribute('aria-labelledby', 'online-reconnect-title');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('tabindex', '-1');
        Object.assign(dialog.style, { margin: 'auto', width: 'min(calc(90 * var(--vwu)), 540px)', color: 'inherit', borderRadius: '16px' });
        dialog.addEventListener('cancel', event => event.preventDefault());
        dialog.querySelector('.online-resume').onclick = () => this.perform({ type: 'resume' });
        document.body.appendChild(dialog);
        this.reconnectDialog = dialog;
        dialog.showModal();
        dialog.focus();
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

    render() {
      this.renderHostReconnect(this.view);
      if (!this.root) return;
      if (this.view?.protocolMismatch) {
        this.root.innerHTML = '<main class="online-lobby unavailable"><section class="online-waiting-game" role="alert"><small>UPDATE NEEDED</small><h1>Your game versions differ.</h1><p>Everyone needs to reload the game, then join a new room together.</p><button type="button" class="online-back">Back to setup</button></section></main>';
        this.root.querySelector('.online-back').onclick = () => this.onBack && this.onBack();
        return;
      }
      if (this.view && this.view.you !== 0 && this.view.phase !== 'lobby') {
        if (this.view.gameView) {
          if (!this.arena) {
            this.root.replaceChildren();
            this.arena = MTG.createOnlineArena({ client: this.client });
          }
        } else this.root.innerHTML = '<main class="online-lobby"><div class="online-waiting-game" role="status" aria-live="polite"><small>JOINING YOUR GAME</small><h1>Setting the table…</h1><p>Your cards and the current turn will appear here. Keep this tab open.</p></div></main>';
        return;
      }
      if (this.started && this.view?.you === 0 && window._game) return;
      const focused = this.root.contains(document.activeElement) ? document.activeElement : null;
      const focusKey = focused?.dataset.liveFocus || (document.activeElement === document.body ? this.pendingFocusKey : null);
      this.root.replaceChildren();
      if (!this.view) {
        const loading = el('main', `online-lobby ${this.error ? 'unavailable' : 'loading'}`, `<div class="online-waiting-game" role="${this.error ? 'alert' : 'status'}"><small>COMMANDER LIVE</small><h1>${this.error ? 'The table could not open.' : 'Opening your private table…'}</h1><p>${this.error ? esc(this.error) : 'Connecting your seat. Your invite will be ready in a moment.'}</p>${this.error ? '<button type="button" class="online-back">Back to setup</button>' : ''}</div>`);
        if (this.error) loading.querySelector('.online-back').onclick = () => this.onBack && this.onBack();
        this.root.appendChild(loading);
        return;
      }
      const content = this.renderLobby(this.view);
      if (this.error) {
        const error = el('div', 'online-error', `<strong>That change could not be saved.</strong><span>${esc(this.error)}</span>`);
        error.setAttribute('role', 'alert');
        content.prepend(error);
      }
      this.root.appendChild(content);
      this.lobbySurface = content;
      this.pendingFocusKey = null;
      if (focusKey) {
        const next = Array.from(content.querySelectorAll('[data-live-focus]')).find(node => node.dataset.liveFocus === focusKey);
        if (next && !next.disabled) next.focus({ preventScroll: true });
        else if (next) this.pendingFocusKey = focusKey;
      }
    }

  }

  MTG.mountOnlineLobby = async options => {
    const lobby = new OnlineLobby(options);
    await lobby.mount();
    return lobby;
  };
})();
