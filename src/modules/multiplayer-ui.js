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
        <div class="onlineseatstatus"><i></i>${seat.kind === 'bot' ? 'LOCAL AI' : seat.connected ? 'CONNECTED' : 'WAITING'}</div>
        ${deck ? `<img src="${artURL(deck.commander)}" alt="${esc(deck.commander)}" onerror="MTG.imgFail(this)">` : '<div class="onlineseatempty">+</div>'}
        <div class="onlineseatcopy"><small>${esc(seat.role)}</small><b>${esc(seat.name)}</b><span>${seat.deckId ? esc(seat.deckId) : 'No deck selected'}${seat.deckImported ? ' <em class="onlineseatimported">imported list</em>' : ''}</span></div>`;
      const unavailable = new Set(view.seats.filter(item => item.seat !== seat.seat).map(item => item.deckId).filter(Boolean));
      if (view.you === 0 && seat.seat !== 0 && !seat.occupied && view.phase === 'lobby') {
        const kind = el('select', 'online-seat-kind');
        kind.setAttribute('aria-label', `Seat ${seat.seat + 1} type`);
        kind.innerHTML = `<option value="human"${seat.kind === 'human' ? ' selected' : ''}>Human player</option><option value="bot"${seat.kind === 'bot' ? ' selected' : ''}>Local AI bot</option>`;
        kind.disabled = this.busy;
        kind.onchange = () => this.perform({ type: 'configureSeat', seat: seat.seat, kind: kind.value });
        card.appendChild(kind);
      }
      if ((mine || view.you === 0 && seat.kind === 'bot') && view.phase === 'lobby') {
        const select = el('select', 'online-deck-select');
        select.setAttribute('aria-label', `${seat.name} deck`);
        select.disabled = this.busy;
        select.innerHTML = `<option value="">Choose deck</option>${deckOptions(seat.deckId, unavailable)}`;
        select.onchange = () => {
          const deckId = select.value;
          if (!deckId) return;
          const commanders = MTG.defaultCommanders(MTG.DECKS[deckId], MTG.DEFS);
          this.perform(configureAction(deckId, { commanderNames: commanders, name: seat.name, ready: true, seat: seat.seat }));
        };
        card.appendChild(select);
      }
      return card;
    }

    renderLobby(view) {
      const shell = el('main', 'online-lobby');
      const share = this.client.shareUrl || location.href;
      const playerCount = view.settings && view.settings.playerCount || view.seats.length;
      const humanCount = view.seats.filter(seat => seat.kind === 'human').length;
      const botCount = playerCount - humanCount;
      const openSeats = view.seats.filter(seat => seat.kind === 'human' && !seat.occupied).length;
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
          <div><span>COMMANDER LIVE · ${playerCount} SEATS</span><h1>${view.you === 0 ? 'Your table is open.' : 'You joined the table.'}</h1><p>${humanCount} human${humanCount === 1 ? '' : 's'} + ${botCount} bot${botCount === 1 ? '' : 's'}. One private Commander table.</p></div>
          <div class="online-room-state"><i></i>${view.phase === 'paused' ? 'PAUSED' : 'ROOM ONLINE'}</div>
        </header>
        ${view.you === 0 ? `<section class="online-invite"><div><small>PRIVATE INVITE LINK · ${openSeats} OPEN HUMAN SEAT${openSeats === 1 ? '' : 'S'}</small><b>${esc(share)}</b></div><button type="button" class="online-copy">Copy invite link</button></section>` : ''}
        <section class="online-seats" aria-label="Commander seats"></section>
        <footer class="online-lobby-actions">
          <div><small>TABLE STATUS</small><b>${esc(status)}</b><span>Choose human or bot for each open seat. Every seat needs a different deck.</span></div>
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
        if (view.phase === 'lobby') {
          const resize = el('div', 'online-seat-count');
          if (playerCount < 4) {
            const add = el('button', 'online-choice', 'Add seat');
            add.disabled = this.busy;
            add.onclick = () => this.perform({ type: 'resizeRoom', playerCount: playerCount + 1 });
            resize.appendChild(add);
          }
          if (playerCount > 2 && !view.seats.at(-1).occupied) {
            const remove = el('button', 'online-choice', 'Remove last seat');
            remove.disabled = this.busy;
            remove.onclick = () => this.perform({ type: 'resizeRoom', playerCount: playerCount - 1 });
            resize.appendChild(remove);
          }
          actions.appendChild(resize);
        }
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

    render() {
      this.renderHostReconnect(this.view);
      if (!this.root) return;
      if (this.view?.protocolMismatch) {
        this.root.textContent = 'The room uses another game version. Reload all players and create a new room.';
        return;
      }
      if (this.view && this.view.you !== 0 && this.view.phase !== 'lobby') {
        if (this.view.gameView) {
          if (!this.arena) {
            this.root.replaceChildren();
            this.arena = MTG.createOnlineArena({ client: this.client });
          }
        } else this.root.innerHTML = '<main class="online-lobby"><div class="online-waiting-game"><h1>Synchronizing the table…</h1></div></main>';
        return;
      }
      if (this.started && this.view?.you === 0 && window._game) return;
      this.root.replaceChildren();
      if (!this.view) {
        this.root.appendChild(el('main', 'online-lobby loading', '<div class="online-waiting-game"><i></i><h1>Opening your private table…</h1></div>'));
        return;
      }
      const content = this.renderLobby(this.view);
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
