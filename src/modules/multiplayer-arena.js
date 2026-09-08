// One Arena and one human decision controller for every Live seat, including
// the host. Only the transport differs; rules live in the host engine.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG;
  if (typeof document === 'undefined' || !U.UI) return;
  const ref = value => value instanceof U.Player ? `p:${value.idx}` : value?.onlineToken || `c:${value?.iid}`;
  function answerFor(q, answer) {
    if (answer?.kind === 'cancel') return { kind: 'cancel' };
    switch (q.type) {
      case 'main': case 'priority': {
        if (answer.kind === 'pass' || answer.kind === 'done') return answer.kind;
        if (answer.kind === 'land') return `land:${q.lands.indexOf(answer.card)}`;
        if (answer.kind === 'activate') return answer.entry.onlineAction;
        const entry = q.casts.find(entry => entry.card === answer.card && entry.alt === answer.alt && entry.from === answer.from);
        if (!entry) throw new Error('That cast is no longer available.');
        return answer.quickTarget ? { action: entry.onlineAction, quickTarget: ref(answer.quickTarget) } : entry.onlineAction;
      }
      case 'bottomCards': case 'chooseCards': case 'chooseTargets': return answer.map(ref);
      case 'chooseManaSources': return answer.auto ? { auto: true } : { cards: (answer.cards || answer).map(ref) };
      case 'attackers': return answer.map(pair => ({ left: ref(pair.card), right: ref(pair.target) }));
      case 'blockers': return answer.map(pair => ({ left: ref(pair.blocker), right: ref(pair.attacker) }));
      case 'orderTriggers': return answer.map(trigger => `t:${q.triggers.indexOf(trigger)}`);
      case 'scry': return { top: answer.top.map(ref), bottom: answer.bottom.map(ref) };
      default: return answer;
    }
  }

  class LiveArena {
    constructor({ client, ui, authority = null, bridge = null }) {
      this.client = client; this.ui = ui || new U.UI(); this.authority = authority; this.bridge = bridge;
      this.game = new U.OnlineArenaView(); this.game.session = this;
      this.ui.game = this.game; this.ui.liveSession = this;
      this.previewCache = new Map(); this.serial = 0; this.previewSerial = 0; this.eventCursor = null;
      this.room = client.current(); this.you = this.room.you;
      this.selectionKey = `mtgLiveSelection:${client.shareUrl || location.href}:${this.you}`;
      this.installActions();
      window._ui = this.ui;
      if (!authority) window._game = this.game;
      document.querySelector('#setup').style.display = 'none';
      document.querySelector('#game').style.display = 'flex';
      document.body.classList.add('game-active');
      U.audio?.attach(this.game);
      void U.audio?.unlock();
      this.unsubscribe = client.subscribe(view => this.update(view));
    }
    installActions() {
      const ui = this.ui;
      const render = ui.render.bind(ui);
      ui.render = () => {
        render();
        const root = document.querySelector('#game');
        if (!root) return;
        root.dataset.onlineSeat = String(this.you);
        root.dataset.onlineState = this.room?.phase || 'connecting';
        root.dataset.onlineDecision = this.descriptor?.id || '';
        root.setAttribute('aria-busy', String(!!this.sending));
        let status = root.querySelector(':scope > .live-arena-status');
        if (!status) { status = document.createElement('div'); status.className = 'live-arena-status'; status.setAttribute('role', 'status'); root.appendChild(status); }
        const paused = this.room?.phase === 'paused';
        status.textContent = this.room?.protocolMismatch ? 'The room uses another game version. Reload all players and create a new room.'
          : paused ? 'Table paused · waiting for disconnected players and the host to resume.'
          : this.sending ? 'Sending your action…' : this.error || '';
        status.hidden = !status.textContent;
        if (paused || this.sending || this.game.lastResortPaused) root.querySelectorAll('.promptbar button, .actionstage button, .reactbar button, .modal button:not([data-testid="show-combat-battlefield"])').forEach(button => { button.disabled = true; });
        if (paused || this.sending) root.querySelectorAll('.sheetacts button:not(:last-child)').forEach(button => { button.disabled = true; });
        if (this.manualSending) root.querySelectorAll('.lastresortgrid button, .lastresorttokens button, .lastresortfoot button').forEach(button => { button.disabled = true; });
        this.saveSelection();
      };
      for (const key of ['resolvePending', 'resolvePendingEntry', 'skipReactWindow']) {
        const original = ui[key].bind(ui);
        ui[key] = (...args) => {
          if (this.sending || this.game.lastResortPaused || this.room?.phase !== 'running') return;
          this.lastPending = key === 'resolvePendingEntry' ? args[0] : ui.pending;
          return original(...args);
        };
      }
      ui.runLastResort = (action, opts = {}) => {
        void this.manual(action).then(result => {
          if (opts.closeSheet) ui.sheet = null;
          if (opts.closeZone) ui.zoneBrowse = null;
          ui.lastResortStatus = { ok: true, text: result.message || 'Correction applied.' };
          ui.toast(result.message || 'Correction applied.'); ui.render();
        }).catch(error => { ui.lastResortStatus = { ok: false, text: error.message }; ui.toast(error.message); ui.render(); });
      };
      ui.setLastResortActive = (active, open = true) => {
        ui.lastResortConfirm = false; ui.quickMenuOpen = false;
        void this.manual({ type: 'setPause', value: !!active }).then(() => {
          ui.lastResortActive = !!active; ui.showJudge = !!active && open; ui.render();
        }).catch(error => { ui.toast(error.message); ui.render(); });
      };
    }
    async manual(action) {
      if (this.manualSending) throw new Error('Wait for the current correction to finish.');
      this.manualSending = true; this.ui.render();
      const previousId = this.room.lastManualAction?.id;
      try {
        const result = await this.client.dispatch({ type: 'manualAction', action });
        const completion = view => view.lastManualAction?.seat === this.you && view.lastManualAction.id !== previousId ? view.lastManualAction : null;
        let completed = completion(result || {});
        if (!completed) completed = await new Promise(resolve => {
          let unsubscribe = () => {};
          unsubscribe = this.client.subscribe(view => queueMicrotask(() => {
            const entry = completion(view);
            if (entry) { unsubscribe(); resolve(entry); }
          }));
        });
        if (!completed.ok) throw new Error(completed.message);
        return completed;
      } finally { this.manualSending = false; this.ui.render(); }
    }
    update(view) {
      if (!view || view.you !== this.you) return;
      this.room = view;
      if (view.protocolMismatch) { this.error = 'Game versions differ. Reload all players before starting a new room.'; this.ui.render(); return; }
      if (this.authority) this.updateLocal();
      else if (view.gameView) this.updateSnapshot(view.gameView);
      if (view.lastPreview && view.lastPreview.decisionId === this.descriptor?.id) {
        const entry = [...this.previewCache.values()].find(entry => entry.id === view.lastPreview.id);
        if (entry) Object.assign(entry, view.lastPreview.result, { pending: false });
        if (this.previewInFlight === entry) this.previewInFlight = null;
      }
      if (!this.authority) {
        if (view.pendingDecision) this.offer(view.pendingDecision);
        else if (this.descriptor) this.clearDecision();
      }
      this.ui.render();
      this.pumpPreview();
    }
    updateSnapshot(snapshot) {
      if (snapshot.schema !== 'commander-arena/v1') throw new Error('This room requires the current Arena version. Reload all players before starting a new room.');
      this.game.update(snapshot, this.you);
      this.ui.me = this.game.viewer;
      this.ui.lastResortActive = !!snapshot.lastResortPaused;
      const events = snapshot.events || [];
      if (this.eventCursor === null) this.eventCursor = events.at(-1)?.id || 0;
      for (const record of events) {
        if (record.id <= this.eventCursor) continue;
        this.eventCursor = record.id;
        const event = this.game.decode(record.event);
        U.audio?.handle(event, this.game, { replay: false });
        const methods = { effectNotice: 'showEffectNotice', gameEffect: 'showGameEffect', battlefieldArrival: 'showBattlefieldArrival', monarchChanged: 'showMonarchChange' };
        if (event.type === 'turn' && event.p) this.ui.showBanner(event.p === this.ui.me ? '⭐ YOUR TURN' : `Turn ${snapshot.turn}: ${event.p.name}`, event.p === this.ui.me);
        else if (event.type === 'effectNotice') this.ui.showEffectNotice(event.text, event.kind, event);
        else if (methods[event.type]) this.ui[methods[event.type]](event);
      }
    }
    updateLocal() {
      if (this.authority) this.updateSnapshot(U.onlineGameViewFor(this.authority, this.authority.players.find(p => (p.onlineSeat ?? p.idx) === this.you)));
    }
    publishEvent(event) {
      if (!this.authority) return;
      const allowed = new Set(['turn', 'gameEffect', 'effectNotice', 'battlefieldArrival', 'monarchChanged', 'gameover']);
      if (allowed.has(event.type)) {
        const g = this.authority;
        const fields = ['type', 'p', 'card', 'src', 'source', 'target', 'targets', 'amount', 'n', 'kind', 'text', 'name', 'color', 'combat', 'player', 'winner', 'from', 'to', 'previous', 'current', 'phase', 'step', 'targetKind', 'targetCard', 'targetPlayer', 'toPlayer', 'fromZone', 'toZone', 'combatStep', 'combatIndex', 'previousLife', 'life', 'count', 'counter', 'delta'];
        const entry = Object.fromEntries(fields.filter(key => event[key] !== undefined).map(key => [key, event[key]]));
        g._onlineEventSerial = (g._onlineEventSerial || 0) + 1;
        g._onlinePublicEvents = [...(g._onlinePublicEvents || []), { id: g._onlineEventSerial, event: entry }].slice(-24);
      }
      this.updateLocal(); this.ui.queueRender();
    }
    async decide(game, question, player) {
      await this.bridge.waitUntilRunning();
      this.updateLocal();
      this.localRequest = { game, question, player };
      const descriptor = U.onlineDecisionDescriptor(game, question, player, `local:${++this.serial}`);
      return new Promise((resolve, reject) => { this.localResolve = resolve; this.localReject = reject; this.offer(descriptor); });
    }
    offer(descriptor) {
      if (this.descriptor?.id === descriptor.id) return;
      this.clearDecision();
      this.descriptor = descriptor;
      this.error = descriptor.error || '';
      const q = this.game.decision(descriptor);
      this.question = q;
      const saved = this.savedSelection(descriptor);
      const auto = !saved && !this.game.lastResortPaused && this.room.phase === 'running' ? this.ui.autoAnswer(this.game, q) : undefined;
      if (auto !== undefined) { queueMicrotask(() => this.submit(auto, descriptor)); return; }
      const resolve = answer => this.submit(answer, descriptor);
      if (saved || !this.ui.openReactWindow(this.game, q, resolve)) {
        this.ui.focusDecisionView();
        this.ui.pendings = [{ q, resolve, sel: [], assigns: new Map(), mode: null }];
        if (saved) Object.assign(this.ui.pending, this.decodeSelection(saved));
      }
      this.ui.render();
    }
    clearDecision() {
      if (this.descriptor) { try { sessionStorage.removeItem(this.selectionKey); } catch { /* Storage is optional. */ } }
      this.descriptor = null; this.question = null; this.previewCache.clear(); this.game.currentQuestion = null;
      this.previewInFlight = null; this.previewWanted = null;
      if (this.game.snapshot) this.game.update(this.game.snapshot, this.you);
      this.ui.pendings = []; this.ui.react = null; this.lastPending = null;
      this.sending = false;
    }
    encodeSelection(value) {
      if (value instanceof U.CardInst || value instanceof U.Player || value?.onlineToken) return { $ref: ref(value) };
      const trigger = this.question?.triggers?.indexOf(value) ?? -1;
      if (trigger >= 0) return { $trigger: trigger };
      if (value instanceof Map) return { $map: [...value].map(pair => pair.map(item => this.encodeSelection(item))) };
      if (Array.isArray(value)) return value.map(item => this.encodeSelection(item));
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.encodeSelection(item)]));
      return value;
    }
    decodeSelection(value) {
      if (!value || typeof value !== 'object') return value;
      if (value.$ref) return this.game.ref(value.$ref);
      if (value.$trigger !== undefined) return this.question.triggers?.[value.$trigger];
      if (value.$map) return new Map(value.$map.map(pair => pair.map(item => this.decodeSelection(item))));
      if (Array.isArray(value)) return value.map(item => this.decodeSelection(item)).filter(item => item != null);
      return Object.fromEntries(Object.entries(value).filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key)).map(([key, item]) => [key, this.decodeSelection(item)]));
    }
    saveSelection() {
      const pd = this.ui.pending;
      if (!this.descriptor || !pd || this.sending) return;
      const fields = ['sel', 'assigns', 'mode', 'xVal', 'scryState', 'scryOrder', 'order', 'attackPending', 'attackTarget', 'boardPeek', 'manaInit'];
      const state = this.encodeSelection(Object.fromEntries(fields.filter(key => pd[key] !== undefined).map(key => [key, pd[key]])));
      const text = JSON.stringify({ id: this.descriptor.id, legal: this.descriptor.legal, state });
      try { if (sessionStorage.getItem(this.selectionKey) !== text) sessionStorage.setItem(this.selectionKey, text); } catch { /* Private browsing may disable storage. */ }
    }
    savedSelection(descriptor) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(this.selectionKey));
        return saved?.id === descriptor.id && JSON.stringify(saved.legal) === JSON.stringify(descriptor.legal) ? saved.state : null;
      } catch { return null; }
    }
    async submit(answer, descriptor = this.descriptor) {
      if (!descriptor || this.descriptor !== descriptor || this.sending || this.game.lastResortPaused || this.room.phase !== 'running') return;
      const q = this.question;
      this.sending = true; this.error = ''; this.ui.render();
      try {
        const response = answerFor(q, answer);
        const verdict = U.validateOnlineDecisionResponse(descriptor.legal, response);
        if (!verdict.ok) throw new Error(verdict.error);
        if (this.authority) {
          const request = this.localRequest;
          await this.bridge.waitUntilRunning();
          const result = U.hydrateOnlineDecision(request.game, request.question, descriptor, response);
          request.player.manualMana = this.ui.manaMode === 'manual';
          const done = this.localResolve;
          this.clearDecision(); done(result);
        } else {
          await this.client.dispatch({ type: 'decisionResponse', decisionId: descriptor.id, response, manaMode: this.ui.manaMode });
          if (this.descriptor === descriptor && !this.room.pendingDecision) this.clearDecision();
        }
      } catch (error) {
        if (this.descriptor !== descriptor) return;
        this.error = error.message; this.ui.toast(error.message);
        this.sending = false;
        if (this.authority) {
          const request = this.localRequest;
          request.question = U.refreshOnlineQuestion(request.game, request.question, request.player, descriptor);
          const refreshed = U.onlineDecisionDescriptor(request.game, request.question, request.player, `local:${++this.serial}`);
          refreshed.error = error.message; this.offer(refreshed); return;
        }
        if (this.lastPending) this.ui.pendings = [this.lastPending];
        else this.ui.pendings = [{ q, resolve: value => this.submit(value, descriptor), sel: [], assigns: new Map(), mode: null }];
      } finally {
        if (this.descriptor === descriptor) this.sending = false;
        this.ui.render();
      }
    }
    preview(answer) {
      if (!this.descriptor || !this.question) return { valid: false, pending: true };
      const response = answerFor(this.question, answer);
      const key = `${this.descriptor.id}:${JSON.stringify(response)}`;
      let entry = this.previewCache.get(key);
      if (!entry) {
        entry = { pending: true, valid: false, id: `preview:${++this.previewSerial}`, decisionId: this.descriptor.id, response, key };
        this.previewCache.set(key, entry);
        if (this.authority) Object.assign(entry, U.onlineDecisionPreview(this.localRequest.game, this.localRequest.question, this.descriptor, response), { pending: false });
      }
      this.previewWanted = entry;
      if (!this.authority) queueMicrotask(() => this.pumpPreview());
      return entry;
    }
    pumpPreview() {
      const entry = this.previewWanted;
      // A single in-flight preview prevents rapid source/blocker changes from
      // replacing an unanswered request and leaving a cached choice disabled.
      if (this.authority || this.previewInFlight || !entry?.pending || this.sending ||
        this.room.phase !== 'running' || this.descriptor?.id !== entry.decisionId) return;
      this.previewInFlight = entry;
      this.client.dispatch({ type: 'decisionPreview', decisionId: entry.decisionId, previewId: entry.id, response: entry.response }).catch(error => {
        if (this.previewInFlight !== entry) return;
        this.previewInFlight = null;
        this.previewCache.delete(entry.key);
        Object.assign(entry, { pending: false, valid: false, message: error.message });
        this.ui.queueRender();
      });
    }
  }
  U.createOnlineArena = options => new LiveArena(options);
  U.onlineArenaAnswer = answerFor;
})();
