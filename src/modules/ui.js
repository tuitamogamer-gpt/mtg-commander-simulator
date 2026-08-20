// ===== ui.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Desktop-only Commander UI (browser only)
(function () {
  if (typeof document === 'undefined') return;
  const U = MTG;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const COLHEX = { W: '#e8e3c8', U: '#4a90d9', B: '#7a5f8a', R: '#d95a4a', G: '#5aa860', C: '#9a9a9a' };
  const MANA_SYM = { W: '☀', U: '💧', B: '💀', R: '🔥', G: '🌳', C: '◇' };

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = U.uiText(html);
    return e;
  };
  const esc = (s) => U.uiText(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  function imgURL(name, big) {
    const face = String(name).split(' // ')[0];
    // Tokeni imaju fiksiran tačan print: exact-name lookup za "Treasure" i
    // slična imena zna vratiti dvostrani token sa pogrešnim licem (dinosaurus).
    const tokenPrint = MTG.TOKEN_IMG && MTG.TOKEN_IMG[face];
    if (tokenPrint) return `https://api.scryfall.com/cards/${tokenPrint}?format=image&version=${big ? 'normal' : 'small'}`;
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(face)}&format=image&version=${big ? 'normal' : 'small'}`;
  }
  const LOCAL_MANA = new Set(['W', 'U', 'B', 'R', 'G', 'C', 'X', 'T']);
  const MANA_PATH = '/assets/mana/';
  function manaGlyph(code, extraClass = '') {
    const safe = String(code || '').toUpperCase();
    if (LOCAL_MANA.has(safe)) {
      return `<img class="msym mana-glyph ${extraClass}" src="${MANA_PATH}${safe}.svg" alt="{${safe}}" title="{${safe}}">`;
    }
    if (/^\d+$/.test(safe)) {
      return `<span class="msym mana-glyph mana-generic ${extraClass}" role="img" aria-label="${safe} generic mana" title="{${safe}}">${safe}</span>`;
    }
    if (safe.includes('/')) {
      const [left, right] = safe.split('/');
      const leftCol = COLHEX[left] || '#b9b4a6';
      const rightCol = COLHEX[right] || (right === 'P' ? '#7f5a72' : '#78756d');
      return `<span class="msym mana-glyph mana-combo ${extraClass}" role="img" aria-label="{${esc(safe)}}" title="{${esc(safe)}}" ` +
        `style="--mana-left:${leftCol};--mana-right:${rightCol}"><b>${esc(left)}</b><i>/</i><b>${esc(right)}</b></span>`;
    }
    return `<span class="msym mana-glyph mana-generic ${extraClass}" role="img" aria-label="{${esc(safe)}}">${esc(safe)}</span>`;
  }

  // Potpuno lokalni mana set. Troškovi ostaju čitljivi i bez mreže, uključujući
  // generičku, X, hibridnu i phyrexian manu.
  function costHTML(cost) {
    if (!cost) return '';
    return cost.replace(/\{([^}]+)\}/g, (m, t) => manaGlyph(t));
  }

  function manualManaSourceText(source) {
    const cost = source.extraCost || {};
    const parts = [];
    if (cost.tap) parts.push('tap');
    if (cost.sacSelf) parts.push('sacrifice');
    if (cost.life) parts.push(`-${cost.life} life`);
    if (cost.mana) parts.push(typeof cost.mana === 'string' ? cost.mana : 'pay mana');
    const optionText = option => option.ANY
      ? `${option.n || 1} of any color`
      : Object.entries(option).filter(([key]) => key !== 'n')
        .map(([color, amount]) => `${amount}×${MANA_SYM[color] || color}`).join(' + ');
    const produces = (source.produce || []).map(optionText).join(' or ');
    const via = source.m && source.m.viaConvoke ? 'convoke/improvise · ' : '';
    return `${via}${parts.length ? parts.join(' + ') + ' → ' : ''}${produces}`;
  }

  class UI {
    constructor() {
      this.game = null;
      this.me = null;
      this.pending = null;   // {q, resolve, state}
      this.sheet = null;     // card sheet data
      this.playerSheet = null;
      this.zoneBrowse = null;
      this.showLog = false;
      // desktop paneli — pamte se između partija; kad su oba ugašena
      // sidebar nestaje i tabla dobija punu širinu ekrana
      this.showThreat = localStorage.getItem('mtgThreat') !== '0';
      this.showSideLog = localStorage.getItem('mtgSideLog') !== '0';
      this.sidebarTab = 'table';
      this.diplomacyComposer = null;
      // THE STACK kao popup na sredini — sam iskoči kad nešto stane na stack
      this.stackPopup = localStorage.getItem('mtgStackPop') !== '0';
      this.stackPopDismissed = 0;   // dužina stacka na kojoj je igrač zatvorio popup
      this.stackPopPos = null;      // {x,y} ako ga je odvukao sa sredine
      // podesive AI table (pamti se između partija)
      this.oppHeight = parseInt(localStorage.getItem('mtgOppH') || '42', 10);
      this.oppScale = parseFloat(localStorage.getItem('mtgOppS') || '1');
      this.prioMode = localStorage.getItem('mtgStopProfile') || 'end';
      this.manaMode = localStorage.getItem('mtgManaMode') === 'manual' ? 'manual' : 'auto';
      this.holdNext = false;     // ručni "stani na sljedećem prioritetu"
      this.react = null;         // otvoren prozor za reakciju
      this.actionStageDismissed = new WeakSet();
      this.attackPicker = null;  // napadač za kojeg biramo branitelja u popupu
      this.showStops = false;
      this.renderQueued = false;
      this.imgCache = {};
    }

    // ---------- controller protocol ----------
    get pending() { return this.pendings && this.pendings.length ? this.pendings[this.pendings.length - 1] : null; }
    set pending(v) {
      this.pendings = this.pendings || [];
      if (v === null) this.pendings.pop();
      else this.pendings.push(v);
    }

    controllerFor(p) {
      const ui = this;
      return {
        decide(g, q) {
          return new Promise(resolve => {
            // auto-handling for smoothness
            const auto = ui.autoAnswer(g, q);
            if (auto !== undefined) { resolve(auto); return; }
            // "auto" mod: ne blokiraj — daj kratak prozor sa dugmetom REAGUJ
            if (ui.openReactWindow(g, q, resolve)) return;
            ui.pendings = ui.pendings || [];
            ui.pendings.push({ q, resolve, sel: [], assigns: new Map(), mode: null });
            ui.render();
            ui.scrollPromptIntoView();
          });
        },
      };
    }

    autoAnswer(g, q) {
      if (q.type === 'threatAlert') return undefined;   // uvijek pauziraj i pokaži kartu
      if (q.type === 'priority') {
        // ručni HOLD: staje tačno jednom, u bilo kom modu
        if (this.holdNext) { this.holdNext = false; this._forceStop = true; return undefined; }
        const mode = this.prioMode || 'auto';
        if (MTG.autoPassPolicy(mode, g, q, this.me)) return { kind: 'pass' };
      }
      return undefined;
    }

    // ---------- prozor za reakciju (auto mod) ----------
    // BEZ odbrojavanja: prozor se otvara samo kad zaista imaš šta odigrati, i
    // čeka tebe. Igra nastavlja tek kad klikneš REAGUJ ili Pusti.
    openReactWindow(g, q, resolve) {
      if (q.type !== 'priority') return false;
      if (this._forceStop) { this._forceStop = false; return false; }   // ručni HOLD → pravi prompt
      if (!['end', 'combat', 'auto', 'smart'].includes(this.prioMode || 'end')) return false;
      // sigurnosno: ako je nekim čudom već otvoren prozor, zatvori ga (pusti dalje)
      if (this.react) this.skipReactWindow();
      this.react = { q, resolve };
      this.render();
      return true;
    }
    takeReactWindow() {
      const w = this.react;
      if (!w) return;
      this.react = null;
      this.pendings = this.pendings || [];
      this.pendings.push({ q: w.q, resolve: w.resolve, sel: [], assigns: new Map(), mode: null });
      this.render();
    }
    skipReactWindow() {
      const w = this.react;
      if (!w) return;
      this.react = null;
      w.resolve({ kind: 'pass' });
      this.render();
    }

    resolvePending(val) {
      const pd = this.pendings && this.pendings.pop();
      if (!pd) return;
      this.sheet = null;
      this.attackPicker = null;
      pd.resolve(val);
      this.render();
    }

    // razriješi TAČNO ODREĐENU odluku (ne nužno onu na vrhu niza)
    resolvePendingEntry(pd, val) {
      if (!pd) return;
      const i = (this.pendings || []).indexOf(pd);
      if (i >= 0) this.pendings.splice(i, 1);
      this.sheet = null;
      this.attackPicker = null;
      pd.resolve(val);
      this.render();
    }

    scrollPromptIntoView() { }

    // ---------- rendering ----------
    queueRender() {
      if (this.renderQueued) return;
      this.renderQueued = true;
      requestAnimationFrame(() => { this.renderQueued = false; this.render(); });
    }

    render() {
      const g = this.game;
      if (!g) return;
      const root = $('#game');
      if (!root) return;
      // set of my cards with available activations (for ⚙ badges)
      this.actable = new Set();
      if (this.pending && (this.pending.q.type === 'main' || this.pending.q.type === 'priority')) {
        for (const a of (this.pending.q.acts || [])) this.actable.add(a.card.iid);
      }
      root.innerHTML = '';
      root.dataset.phase = g.phase || 'idle';
      root.classList.toggle('human-turn', g.turnPlayer === this.me);
      root.classList.toggle('ai-turn', !!(g.turnPlayer && g.turnPlayer.isAI));
      root.classList.toggle('combat-phase', g.phase === 'combat');
      root.style.setProperty('--arena-turn-accent', g.turnPlayer === this.me ? '#d3974c' : '#778f63');
      // oba panela ugašena → sidebar se uklanja i tabla ide preko cijele širine
      const diplomacyEnabled = !!(g.diplomacy && g.diplomacy.enabled);
      root.classList.toggle('nosidebar', !diplomacyEnabled && !this.showThreat && !this.showSideLog);
      root.appendChild(this.renderTopbar(g));
      // action ticker — zadnji log
      const last = g.log.length ? g.log[g.log.length - 1] : null;
      if (last) {
        const tick = el('div', 'ticker', `» ${esc(last.msg)}`);
        tick.onclick = () => { this.showLog = true; this.render(); };
        root.appendChild(tick);
      }
      root.appendChild(this.renderOpponents(g));
      root.appendChild(this.renderCenter(g));
      root.appendChild(this.renderMyBoard(g));
      root.appendChild(this.renderPromptBar(g));
      root.appendChild(this.renderHand(g));
      root.appendChild(this.renderSidebar(g));
      this.initHoverPreview();
      this.initKeys();
      if (this.sheet) root.appendChild(this.renderCardSheet(g));
      if (this.playerSheet) root.appendChild(this.renderPlayerSheet(g));
      if (this.zoneBrowse) root.appendChild(this.renderZoneBrowser(g));
      if (this.showLog) root.appendChild(this.renderLog(g));
      if (this.showHelp) root.appendChild(this.renderHelp(g));
      if (this.showJudge) root.appendChild(this.renderJudge(g));
      if (this.showStops) root.appendChild(this.renderStopSettings(g));
      const reveal = this.renderRevealPopup(g);
      if (reveal) root.appendChild(reveal);
      const diplomacyModal = this.renderDiplomacyModal(g);
      const modal = diplomacyModal || this.renderAttackTargetPopup(g) || this.renderBlockersModal(g) || this.renderDecisionModal(g);
      // stack popup stoji na sredini, pa se sklanja kad je otvoren bilo koji drugi
      // overlay — inače bi se preklapali baš na istom mjestu
      const blocked = !!modal || !!reveal || !!this.sheet || !!this.playerSheet || !!this.zoneBrowse ||
        this.showLog || this.showHelp || this.showJudge || this.showStops;
      const stage = blocked ? null : this.renderActionStage(g);
      if (stage) root.appendChild(stage);
      const sp = blocked ? null : this.renderStackPopup(g);
      if (sp && !stage) root.appendChild(sp);
      if (modal) root.appendChild(modal);
      // Game-over overlay se sklanja dok je otvoren log/zona/sheet — inače je
      // prekrivao "View log" i igra je izgledala zamrznuto na kraju partije.
      const gameOverHidden = this.showLog || this.sheet || this.playerSheet || this.zoneBrowse;
      if (g.gameOver && !gameOverHidden) root.appendChild(this.renderGameOver(g));
      U.localizeTree(root);
    }

    // Centralni action stage: svaka protivnička nonland karta na stacku dobija
    // puni prikaz i eksplicitni Proceed. Ovo je pregled akcije, odvojen od
    // stop-preseta: čak i profil "samo end step" ne smije sakriti odigranu kartu.
    renderActionStage(g) {
      const pending = this.pending && this.pending.q.type === 'priority' ? this.pending : null;
      const reaction = !pending && this.react && this.react.q.type === 'priority' ? this.react : null;
      const entry = pending || reaction;
      if (!entry) return null;
      const top = g.stack[g.stack.length - 1];
      if (!top || top.ctrl === this.me || this.actionStageDismissed.has(top)) return null;
      const source = top.card || top.srcCard || (top.ctx && top.ctx.src);
      if (!source || source.is && source.is('Land')) return null;

      const q = entry.q;
      const canAct = ((q.casts || []).length + (q.acts || []).length) > 0;
      const kind = top.kind === 'spell' ? 'Card on the stack' : top.kind === 'trigger' ? 'Trigger on the stack' : 'Ability on the stack';
      const targetGroups = top.targets || top.ctx && top.ctx.targets || [];
      const targets = targetGroups.flat().filter(Boolean);
      const damageDivision = top.damageDivision || top.ctx && top.ctx.damageDivision || [];
      const dividedTargets = damageDivision.length
        ? (Array.isArray(targetGroups[0]) ? targetGroups[0].filter(Boolean) : targets.slice(0, damageDivision.length))
        : [];
      const damageFor = target => damageDivision.find(entry =>
        target instanceof MTG.Player ? entry.playerIdx === target.idx : entry.iid === target.iid);
      const targetText = targets.length
        ? targets.map((t, index) => {
          const assignment = index < dividedTargets.length ? damageFor(t) : null;
          const name = t instanceof MTG.Player ? t.name : `${t.name}${t.ctrl ? ` (${t.ctrl.name})` : ''}`;
          return assignment ? `${name} — ${assignment.n} damage` : name;
        }).join(', ')
        : 'no target';
      const def = source.def || {};
      const wrap = el('div', 'actionstagewrap');
      const stage = el('div', 'actionstage');
      const art = el('div', 'actionstageart');
      art.innerHTML = `<img src="${imgURL(source.name, true)}" onerror="MTG.imgFail(this)">`;
      stage.appendChild(art);
      const info = el('div', 'actionstageinfo');
      info.appendChild(el('div', 'actionstageeyebrow', `${esc(kind)} · ${esc(top.ctrl ? top.ctrl.name : '')}`));
      info.appendChild(el('div', 'actionstagename', esc(top.name || source.name)));
      info.appendChild(el('div', 'actionstagetype', `${costHTML(def.cost || '')}<span>${esc([...(def.super || []), ...(def.types || [])].join(' '))}${(def.subtypes || []).length ? ' - ' + esc(def.subtypes.join(' ')) : ''}</span>`));
      info.appendChild(el('div', 'actionstagetarget', `🎯 ${esc(targetText)}`));
      if (damageDivision.length) {
        const split = el('div', 'actionstagedivision');
        dividedTargets.forEach((target, index) => {
          const assignment = damageFor(target);
          if (!assignment) return;
          split.appendChild(el('div', 'actionstagedamagetarget',
            `<span>${index + 1}</span><b>${esc(target.name)}</b><strong>${assignment.n}<small>damage</small></strong>`));
        });
        info.appendChild(split);
      }
      info.appendChild(el('div', 'actionstageoracle', esc(def.oracle || top.name || '').replace(/\n/g, '<br>')));
      info.appendChild(el('div', 'actionstagestack', `STACK ${g.stack.length} · this action resolves ${g.stack.length === 1 ? 'next' : 'before ' + (g.stack.length - 1) + ' older actions'}`));
      const buttons = el('div', 'actionstagebuttons');
      if (canAct) {
        const respond = el('button', 'pbtn actionrespond', '⚡ Open responses');
        respond.onclick = () => {
          this.actionStageDismissed.add(top);
          if (reaction) this.takeReactWindow(); else this.render();
        };
        buttons.appendChild(respond);
      }
      const proceed = el('button', 'pbtn primary', 'Proceed ▶');
      proceed.onclick = () => {
        this.actionStageDismissed.add(top);
        if (reaction) this.skipReactWindow();
        else this.resolvePendingEntry(pending, { kind: 'pass' });
      };
      buttons.appendChild(proceed);
      info.appendChild(buttons);
      stage.appendChild(info);
      wrap.appendChild(stage);
      return wrap;
    }

    // ---------- Karte/tokeni koji ne prolaze kroz stack ----------
    // Isti centar ekrana kao stack popup: vidiš šta je protivnik dobio i sam
    // klikneš Proceed. Landove engine uopšte ne šalje ovamo.
    renderRevealPopup(g) {
      // Traži reveal bilo gdje u nizu odluka, ne samo na vrhu — da ga druga
      // odluka ne može zakloniti i ostaviti igru da visi.
      const list = this.pendings || [];
      let pd = null;
      for (let i = list.length - 1; i >= 0; i--) if (list[i].q.type === 'cardReveal') { pd = list[i]; break; }
      if (!pd) return null;
      const cards = pd.q.cards || [];
      if (!cards.length) return null;
      const who = pd.q.ctrl ? pd.q.ctrl.name : '';
      const wrap = el('div', 'stackpopwrap revealwrap');
      const pop = el('div', 'stackpop reveal');
      const head = el('div', 'stackpophead');
      head.appendChild(el('div', 'stackpoptitle',
        pd.q.kind === 'tokens' ? 'Tokens' : 'Enters the battlefield'));
      head.appendChild(el('div', 'stackpopn', String(cards.length)));
      pop.appendChild(head);

      const body = el('div', 'stackpopbody');
      // grupiši iste (npr. 8× Soldier) da lista ostane čitljiva
      const groups = new Map();
      for (const c of cards) {
        const k = c.name;
        if (!groups.has(k)) groups.set(k, { card: c, n: 0 });
        groups.get(k).n++;
      }
      for (const { card, n } of groups.values()) {
        const it = el('div', 'stackpopitem');
        const img = el('img');
        img.loading = 'lazy';
        img.src = imgURL(card.name);
        img.onerror = () => MTG.imgFail(img);
        it.appendChild(img);
        const info = el('div', 'stackpopinfo');
        info.appendChild(el('div', 'stackpopname', esc(card.name)));
        const pt = card.cur && card.is('Creature') ? ` · ${card.cur.power}/${card.cur.toughness}` : '';
        info.appendChild(el('div', 'stackpopsub', esc(who) + pt));
        it.appendChild(info);
        if (n > 1) it.appendChild(el('div', 'stackpopidx', '×' + n));
        it.onclick = () => { this.sheet = { card }; this.render(); };
        body.appendChild(it);
      }
      pop.appendChild(body);
      const foot = el('div', 'stackpopfoot');
      const btn = el('button', 'pbtn primary wide', 'Proceed ▶');
      btn.onclick = () => this.resolvePendingEntry(pd, null);
      foot.appendChild(btn);
      pop.appendChild(foot);
      wrap.appendChild(pop);
      return wrap;
    }

    // ---------- THE STACK: popup na sredini ekrana ----------
    // Iskače sam čim nešto stane na stack i nestaje kad se stack isprazni.
    // Wrapper ne hvata klikove, pa tabla ispod ostaje upotrebljiva.
    renderStackPopup(g) {
      if (!this.stackPopup || !g.stack.length || g.gameOver) return null;
      if (this.stackPopDismissed === g.stack.length) return null;
      if (this.stackPopDismissed && this.stackPopDismissed !== g.stack.length) this.stackPopDismissed = 0;

      const wrap = el('div', 'stackpopwrap');
      const pop = el('div', 'stackpop');
      if (this.stackPopPos) {
        pop.style.position = 'fixed';
        pop.style.left = this.stackPopPos.x + 'px';
        pop.style.top = this.stackPopPos.y + 'px';
      }
      const head = el('div', 'stackpophead');
      head.appendChild(el('div', 'stackpoptitle', 'The Stack'));
      head.appendChild(el('div', 'stackpopn', String(g.stack.length)));
      const x = el('button', 'stackpopx', '✕');
      x.title = 'Hide until the stack changes';
      x.onclick = (e) => { e.stopPropagation(); this.stackPopDismissed = g.stack.length; this.render(); };
      head.appendChild(x);
      pop.appendChild(head);

      const body = el('div', 'stackpopbody');
      const items = g.stack.slice().reverse();   // vrh stacka prvi — prvi se i rješava
      items.forEach((so, i) => {
        const it = el('div', 'stackpopitem' + (so.ctrl === this.me ? ' mine' : '') + (i === 0 ? ' next' : ''));
        const nm = so.name || (so.card && so.card.name) || 'Effect';
        const kind = so.kind === 'trigger' ? 'trigger' : so.kind === 'ability' ? 'ability' : 'spell';
        if (so.card) {
          const img = el('img');
          img.loading = 'lazy';
          img.src = imgURL(so.card.name);
          img.onerror = () => MTG.imgFail(img);
          it.appendChild(img);
        }
        const info = el('div', 'stackpopinfo');
        info.appendChild(el('div', 'stackpopname', esc(nm)));
        info.appendChild(el('div', 'stackpopsub', `${esc(so.ctrl ? so.ctrl.name : '')} · ${kind}`));
        it.appendChild(info);
        it.appendChild(el('div', 'stackpopidx', i === 0 ? 'NEXT' : '#' + (items.length - i)));
        if (so.card) it.onclick = () => { this.sheet = { card: so.card, stack: true }; this.render(); };
        body.appendChild(it);
      });
      pop.appendChild(body);
      pop.appendChild(el('div', 'stackpopfoot', 'resolves from top to bottom'));

      // povlačenje popupa (da ne smeta ako stoji preko nečega)
      const onDown = (ev) => {
        if (ev.target.closest('.stackpopx')) return;
        const r = pop.getBoundingClientRect();
        const sx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
        const sy = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
        pop.classList.add('dragging');
        const move = (e2) => {
          const cx = e2.touches ? e2.touches[0].clientX : e2.clientX;
          const cy = e2.touches ? e2.touches[0].clientY : e2.clientY;
          const nx = Math.max(4, Math.min(window.innerWidth - r.width - 4, cx - sx));
          const ny = Math.max(4, Math.min(window.innerHeight - r.height - 4, cy - sy));
          this.stackPopPos = { x: nx, y: ny };
          pop.style.position = 'fixed'; pop.style.left = nx + 'px'; pop.style.top = ny + 'px';
          if (e2.cancelable) e2.preventDefault();
        };
        const up = () => {
          pop.classList.remove('dragging');
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
          window.removeEventListener('touchmove', move);
          window.removeEventListener('touchend', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', up);
      };
      head.addEventListener('mousedown', onDown);
      head.addEventListener('touchstart', onDown, { passive: true });

      wrap.appendChild(pop);
      return wrap;
    }

    // ---------- desktop sidebar: threat panel + tok igre ----------
    renderSidebar(g) {
      const side = el('div', 'sidebar');
      const diplomacyEnabled = !!(g.diplomacy && g.diplomacy.enabled);
      if (diplomacyEnabled) {
        const tabs = el('div', 'sidebartabs');
        for (const [key, label] of [['table', 'TABLE'], ['diplomacy', 'DIPLOMACY'], ['log', 'LOG']]) {
          const tab = el('button', 'sidebartab' + (this.sidebarTab === key ? ' on' : ''), label);
          tab.onclick = () => { this.sidebarTab = key; this.render(); };
          tabs.appendChild(tab);
        }
        side.appendChild(tabs);
        if (this.sidebarTab === 'diplomacy') {
          side.appendChild(this.renderDiplomacyPanel(g));
          return side;
        }
        if (this.sidebarTab === 'log') {
          side.appendChild(this.renderSidebarLog(g));
          return side;
        }
      }
      // THE STACK — šta trenutno čeka na rezoluciju
      {
        const sp = el('div', 'stackpanel');
        const head = el('div', 'sidehead');
        head.appendChild(el('div', 'sidetitle', 'The Stack'));
        head.appendChild(el('div', 'sidecount', String(g.stack.length)));
        sp.appendChild(head);
        const body = el('div', 'stacklist');
        if (!g.stack.length) {
          body.classList.add('empty');
          body.innerHTML = '<div class="stackempty"><span>◇</span>the stack is empty</div>';
        } else {
          for (const so of g.stack.slice().reverse()) {
            const it = el('div', 'stackitem' + (so.ctrl === this.me ? ' mine' : ''));
            it.innerHTML = `<div class="siname">${esc(so.name || (so.card && so.card.name) || 'Effect')}</div>` +
              `<div class="sisub">${esc(so.ctrl ? so.ctrl.name : '')}${so.kind ? ' · ' + esc(so.kind) : ''}</div>`;
            if (so.card) it.onclick = () => { this.sheet = { card: so.card, stack: true }; this.render(); };
            body.appendChild(it);
          }
        }
        sp.appendChild(body);
        side.appendChild(sp);
      }
      // COMMANDER DAMAGE — matrica igrač × komander
      {
        const cd = el('div', 'cmddmgpanel');
        cd.appendChild(el('div', 'sidetitle', 'Commander damage'));
        const cmds = [];
        for (const p of g.players) for (const c of (p.commanders || [])) cmds.push({ p, c });
        if (!cmds.length) cd.appendChild(el('div', 'sidenote', 'No commanders at the table.'));
        else {
          const tbl = el('div', 'cdgrid');
          tbl.style.gridTemplateColumns = `minmax(0,1fr) repeat(${cmds.length}, 30px)`;
          tbl.appendChild(el('div', 'cdh', ''));
          for (const { c } of cmds) tbl.appendChild(el('div', 'cdh', esc(c.name.split(/[ ,]/)[0].slice(0, 4))));
          for (const p of g.players) {
            tbl.appendChild(el('div', 'cdname' + (p === this.me ? ' me' : '') + (p.lost ? ' lost' : ''), esc(p.name)));
            for (const { c } of cmds) {
              const n = (p.commanderDamage || {})[c.iid] || 0;
              tbl.appendChild(el('div', 'cdv' + (n >= 21 ? ' lethal' : n >= 12 ? ' warn' : n ? '' : ' zero'), n ? String(n) : '·'));
            }
          }
          cd.appendChild(tbl);
        }
        side.appendChild(cd);
      }
      // THREAT
      if (diplomacyEnabled || this.showThreat) {
      const tp = el('div', 'threatpanel');
      tp.appendChild(el('div', 'sidetitle', '🎯 Threat: who is most dangerous?'));
      const table = MTG.threatTable ? MTG.threatTable(g) : [];
      const max = Math.max(1, ...table.map(t => t.score));
      const min = Math.min(...table.map(t => t.score), max);
      table.forEach((t, i) => {
        const styleMeta = t.p.isAI && t.p.aiStyle && MTG.AI_STYLES && MTG.AI_STYLES[t.p.aiStyle];
        const row = el('div', 'threatrow' + (t.p === this.me ? ' me' : '') + (i === 0 ? ' top' : ''));
        const pct = max === min ? 60 : Math.round(12 + 88 * (t.score - min) / (max - min));
        const grudgeMe = this.me && t.p.isAI && ((t.p.grudges || {})[this.me.idx] || 0) >= 2;
        row.innerHTML = `
          <span class="trank">${['🥇', '🥈', '🥉', '4.'][i] || (i + 1) + '.'}</span>
          <span class="tname">${esc(t.p.name)}${styleMeta ? ` <span class="persona" title="${esc(styleMeta.label)}">${styleMeta.icon}</span>` : ''}${grudgeMe ? ' <span class="persona" title="Remembers your attacks and holds a grudge!">💢</span>' : ''}</span>
          <span class="tbarwrap"><span class="tbar" style="width:${pct}%"></span></span>
          <span class="tscore">${t.score}</span>`;
        row.onclick = () => { this.playerSheet = t.p; this.render(); };
        tp.appendChild(row);
      });
      tp.appendChild(el('div', 'sidenote', 'Bots use this estimate and personal grudge memory of past attackers.'));
      side.appendChild(tp);
      }
      // TOK IGRE
      if (!diplomacyEnabled && this.showSideLog) {
        const lp = el('div', 'sidelog');
        lp.appendChild(el('div', 'sidetitle', '📜 Game log'));
        const list = el('div', 'sideloglist');
        for (const entry of g.log.slice(-90)) {
          list.appendChild(el('div', 'll k-' + (entry.cls || entry.kind || 'x'), esc(entry.msg)));
        }
        lp.appendChild(list);
        side.appendChild(lp);
        requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
      }
      return side;
    }

    renderSidebarLog(g) {
      const lp = el('div', 'sidelog diplomacylog');
      lp.appendChild(el('div', 'sidetitle', 'GAME LOG'));
      const list = el('div', 'sideloglist');
      for (const entry of g.log.slice(-120)) list.appendChild(el('div', 'll k-' + (entry.cls || entry.kind || 'x'), esc(entry.msg)));
      lp.appendChild(list);
      requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
      return lp;
    }

    beginDiplomacyOffer(g, to) {
      const st = g.diplomacyStatus ? g.diplomacyStatus() : { unlocked: false, reason: 'Diplomacy is unavailable.' };
      if (!st.unlocked) { this.toast(st.reason); return; }
      const requests = g.diplomacyClauseOptions(to, this.me);
      const offers = g.diplomacyClauseOptions(this.me, to);
      if (!requests.length || !offers.length) {
        this.toast('There is no meaningful, measurable exchange available with this player right now.');
        return;
      }
      this.diplomacyComposer = { toId: to.idx, requestKey: requests[0].key, offerKey: offers[0].key };
      this.sidebarTab = 'diplomacy';
      this.render();
    }

    renderDiplomacyPanel(g) {
      const panel = el('div', 'diplomacypanel');
      const view = g.diplomacyView(this.me);
      panel.appendChild(el('div', 'diplomacyhero', `
        <span>🕊️</span><div><b>Diplomacy &amp; Politics</b><small>Short, public, binding agreements. Every player still plays to win.</small></div>`));

      if (!view.status.unlocked) {
        const progress = Math.min(view.status.unlockRounds, view.status.rounds);
        const lock = el('div', 'diplomacylock');
        lock.innerHTML = `<b>🔒 Negotiations locked</b><span>${esc(view.status.reason)}</span>` +
          `<div class="dipprogress"><i style="width:${Math.round(100 * progress / view.status.unlockRounds)}%"></i></div>` +
          `<small>${progress} / ${view.status.unlockRounds} full table rounds completed</small>`;
        panel.appendChild(lock);
      }

      if (view.incoming.length) {
        panel.appendChild(el('div', 'dipsectiontitle', `INCOMING · ${view.incoming.length}`));
        for (const proposal of view.incoming) {
          const card = el('div', 'dipincoming');
          card.innerHTML = `<b>${esc(proposal.fromName)} proposes:</b>` +
            `<p><span>THEY ASK</span>${esc(proposal.request)}</p>` +
            `<p><span>THEY OFFER</span>${esc(proposal.offer)}</p>` +
            (proposal.reason ? `<small>${esc(proposal.reason)}</small>` : '');
          const row = el('div', 'dipactions');
          const accept = el('button', 'pbtn primary', 'Accept');
          accept.onclick = () => {
            const result = g.respondToDiplomacyProposal(proposal.id, true, this.me);
            this.toast(result.status === 'accepted' ? '🤝 Agreement accepted and active.' : result.reason || 'The proposal expired.');
            this.render();
          };
          const decline = el('button', 'pbtn', 'Decline');
          decline.onclick = () => { g.respondToDiplomacyProposal(proposal.id, false, this.me); this.toast('Proposal declined.'); this.render(); };
          row.appendChild(accept); row.appendChild(decline); card.appendChild(row); panel.appendChild(card);
        }
      }

      panel.appendChild(el('div', 'dipsectiontitle', `ACTIVE AGREEMENTS · ${view.activeContracts.length}`));
      if (!view.activeContracts.length) panel.appendChild(el('div', 'dipempty', 'No active agreements.'));
      for (const contract of view.activeContracts) {
        const item = el('div', 'dipcontract');
        item.appendChild(el('b', '', `Agreement #${contract.id}`));
        for (const clause of contract.clauses) item.appendChild(el('p', 'state-' + clause.state, `${clause.state === 'active' ? '◆' : '✓'} ${esc(clause.label)}`));
        panel.appendChild(item);
      }

      panel.appendChild(el('div', 'dipsectiontitle', `PLAYERS · ${view.offersRemaining} OFFER${view.offersRemaining === 1 ? '' : 'S'} LEFT THIS ROUND`));
      for (const row of view.opponents) {
        const other = g.players.find(player => player.idx === row.id);
        const item = el('div', 'dipplayer relation-' + row.relation.key);
        item.innerHTML = `<div><b>${esc(row.name)}</b><small>${esc(row.relation.label)}</small></div>`;
        const make = el('button', 'pbtn', 'Make offer');
        make.disabled = !view.status.unlocked || !view.offersRemaining || !other || other.lost;
        make.onclick = () => this.beginDiplomacyOffer(g, other);
        item.appendChild(make); panel.appendChild(item);
      }
      panel.appendChild(el('div', 'diprules', 'No alliances, open-ended favors, secret-vote deals, concessions, or promises beyond one combat or one turn. Forced Magic actions override agreements without blame.'));
      return panel;
    }

    renderDiplomacyModal(g) {
      const composer = this.diplomacyComposer;
      if (!composer || !g.diplomacy || !g.diplomacy.enabled || !this.me) return null;
      const to = g.players.find(player => player.idx === composer.toId && !player.lost);
      if (!to) { this.diplomacyComposer = null; return null; }
      const requests = g.diplomacyClauseOptions(to, this.me);
      const offers = g.diplomacyClauseOptions(this.me, to);
      if (!requests.length || !offers.length) { this.diplomacyComposer = null; return null; }
      if (!requests.some(option => option.key === composer.requestKey)) composer.requestKey = requests[0].key;
      if (!offers.some(option => option.key === composer.offerKey)) composer.offerKey = offers[0].key;

      const ov = el('div', 'overlay dark diplomacyov');
      const modal = el('div', 'modal diplomacymodal');
      ov.appendChild(modal);
      ov.onclick = event => { if (event.target === ov) { this.diplomacyComposer = null; this.render(); } };
      modal.appendChild(el('div', 'combatkicker', 'STRUCTURED AGREEMENT'));
      modal.appendChild(el('div', 'mtitle', `Offer to ${esc(to.name)}`));
      modal.appendChild(el('div', 'dippreamble', 'Choose one exact promise from each side. The game enforces accepted promises and displays them to the whole table.'));

      const field = (title, sub, options, value, onChange) => {
        const label = el('label', 'dipfield');
        label.innerHTML = `<span>${esc(title)}<small>${esc(sub)}</small></span>`;
        const select = el('select', 'styleselect');
        for (const option of options) {
          const node = el('option', '', option.label); node.value = option.key; node.selected = option.key === value; select.appendChild(node);
        }
        select.onchange = () => onChange(select.value);
        label.appendChild(select);
        return label;
      };

      const fields = el('div', 'dipfields');
      fields.appendChild(field('I ASK', `${to.name} promises`, requests, composer.requestKey, value => { composer.requestKey = value; this.render(); }));
      fields.appendChild(field('I OFFER', 'You promise', offers, composer.offerKey, value => { composer.offerKey = value; this.render(); }));
      modal.appendChild(fields);

      const request = requests.find(option => option.key === composer.requestKey);
      const offer = offers.find(option => option.key === composer.offerKey);
      modal.appendChild(el('div', 'dipreview', `<b>EXACT CONTRACT</b><p><span>${esc(to.name)}</span>${esc(request.label)}</p><p><span>You</span>${esc(offer.label)}</p>`));
      modal.appendChild(el('div', 'dipwarning', 'Accepted terms are binding for voluntary choices. If a Magic rule forces an incompatible action, that clause ends without a penalty.'));

      const actions = el('div', 'btnrow');
      const send = el('button', 'pbtn primary', 'Send offer');
      send.onclick = () => {
        const result = g.proposeDiplomacy(this.me, to, composer.requestKey, composer.offerKey);
        this.diplomacyComposer = null;
        if (result.status === 'accepted') this.toast(`🤝 ${to.name} accepted. Agreement #${result.contract.id} is active.`);
        else if (result.status === 'countered') this.toast(`🕊️ ${to.name} made a counteroffer. Review it in Diplomacy.`);
        else this.toast(`Proposal rejected: ${result.reason || 'No deal.'}`);
        this.sidebarTab = 'diplomacy';
        this.render();
      };
      const cancel = el('button', 'pbtn', 'Cancel');
      cancel.onclick = () => { this.diplomacyComposer = null; this.render(); };
      actions.appendChild(send); actions.appendChild(cancel); modal.appendChild(actions);
      return ov;
    }

    // tastatura: Space/Enter = glavno dugme, Esc = zatvori panele
    initKeys() {
      if (this._keysInit) return;
      this._keysInit = true;
      document.addEventListener('keydown', ev => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName)) return;
        if (ev.key === 'Escape') {
          if (this.sheet || this.playerSheet || this.zoneBrowse || this.showLog || this.showHelp || this.showJudge || this.diplomacyComposer) {
            this.sheet = null; this.playerSheet = null; this.zoneBrowse = null;
            this.showLog = false; this.showHelp = false; this.showJudge = false;
            this.diplomacyComposer = null;
            this.render();
            ev.preventDefault();
          }
          return;
        }
        // R = reaguj / armiraj HOLD; Space u prozoru reakcije = pusti dalje
        if (ev.key === 'r' || ev.key === 'R') {
          if (this.react) { this.takeReactWindow(); ev.preventDefault(); return; }
          if (!this.pending) {
            this.holdNext = !this.holdNext;
            this.toast(this.holdNext ? '🖐️ HOLD: stajem na sljedećem prioritetu.' : 'HOLD otkazan.');
            this.render(); ev.preventDefault();
          }
          return;
        }
        if (this.pending && this.pending.q.type === 'chooseX' && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
          const pd = this.pending, q = pd.q;
          const current = pd.xVal === undefined ? q.min : pd.xVal;
          pd.xVal = Math.max(q.min, Math.min(q.max, current + (ev.key === 'ArrowRight' ? 1 : -1)));
          this.render(); ev.preventDefault(); return;
        }
        if (ev.key === ' ' || ev.key === 'Enter') {
          const visibleProceed = document.querySelector('.actionstage .pbtn.primary, .reveal .pbtn.primary');
          if (visibleProceed && !visibleProceed.disabled) {
            visibleProceed.click(); ev.preventDefault(); return;
          }
        }
        if (this.react && (ev.key === ' ' || ev.key === 'Enter')) {
          this.skipReactWindow(); ev.preventDefault(); return;
        }
        if (ev.key === ' ' || ev.key === 'Enter') {
          const modal = document.querySelector('.overlay .modal, .overlay .sheet');
          if (modal) {
            let btn = modal.querySelector('.pbtn.primary:not(:disabled)');
            if (btn) { btn.click(); ev.preventDefault(); return; }
            // Desktop tastatura: ako odluka prvo traži izbor karte, Space/Enter
            // bira prvu još neizabranu. Sljedeći pritisak potvrđuje. Za modale
            // sa običnim opcijama bira prvu dostupnu opciju.
            const card = modal.querySelector('.cardgrid .bigcard:not(.selected)');
            if (card && typeof card.onclick === 'function') { card.click(); ev.preventDefault(); return; }
            btn = modal.querySelector('.pbtn:not(:disabled)');
            if (btn) { btn.click(); ev.preventDefault(); }
            return;
          }
          const bar = document.querySelector('.promptbar');
          if (!bar) return;
          let btn = bar.querySelector('.pbtn.primary');
          if (!btn) {
            const all = bar.querySelectorAll('.pbtn:not(:disabled)');
            if (all.length === 1) btn = all[0];
          }
          if (btn && !btn.disabled) { btn.click(); ev.preventDefault(); }
        }
      });
    }

    // hover-preview velikih karata (samo desktop / miš)
    initHoverPreview() {
      if (this._hoverInit) return;
      this._hoverInit = true;
      if (!window.matchMedia || !window.matchMedia('(pointer:fine)').matches) return;
      const gameEl = $('#game');
      let prev = document.getElementById('hoverprev');
      if (!prev) { prev = document.createElement('div'); prev.id = 'hoverprev'; document.body.appendChild(prev); }
      let curName = null;
      gameEl.addEventListener('mouseover', ev => {
        const m = ev.target.closest ? ev.target.closest('.mini,[data-cname]') : null;
        const nm = m && m.dataset ? m.dataset.cname : null;
        if (!nm) { prev.style.display = 'none'; curName = null; return; }
        if (nm !== curName) {
          curName = nm;
          prev.innerHTML = `<img src="${imgURL(nm, true)}" onerror="MTG.imgFail(this)">`;
        }
        prev.style.display = 'block';
      });
      gameEl.addEventListener('mousemove', ev => {
        if (prev.style.display !== 'block') return;
        const w = 300, h = 420;
        let x = ev.clientX + 26;
        if (x + w > window.innerWidth - 8) x = ev.clientX - w - 26;
        const y = Math.max(8, Math.min(window.innerHeight - h - 8, ev.clientY - h / 2));
        prev.style.left = x + 'px'; prev.style.top = y + 'px';
      });
      gameEl.addEventListener('mouseleave', () => { prev.style.display = 'none'; curName = null; });
    }

    phaseName(g) {
      const map = { untap: 'Untap', upkeep: 'Upkeep', draw: 'Draw', main1: 'Main 1', combat: 'Combat', main2: 'Main 2', end: 'End', cleanup: 'Cleanup' };
      let s = map[g.phase] || g.phase;
      if (g.phase === 'combat' && g.step) {
        const smap = { begin: '', attackers: 'attackers', blockers: 'blockers', firstStrike: 'first strike', damage: 'damage', endCombat: '' };
        s += ' ' + (smap[g.step] || '');
      }
      return s;
    }

    renderTopbar(g) {
      const bar = el('div', 'topbar');
      const left = el('div', 'phasewrap');
      left.appendChild(el('div', 'phase', `<b>Turn ${g.turnNo}</b> · ${esc(g.turnPlayer ? g.turnPlayer.name : '')}${g.phase === 'combat' && g.step ? ' · ' + this.phaseName(g) : ''}`));
      // EDHLAB-style phase stepper
      const steps = [['untap', 'UT'], ['upkeep', 'UK'], ['draw', 'DR'], ['main1', 'M1'], ['combat', '⚔'], ['main2', 'M2'], ['end', 'END']];
      const cur = g.phase === 'cleanup' ? 'end' : g.phase;
      const stepper = el('div', 'stepper');
      for (const [key, label] of steps) {
        stepper.appendChild(el('span', 'step' + (cur === key ? ' on' : ''), label));
      }
      left.appendChild(stepper);
      bar.appendChild(left);
      const btns = el('div', 'topbtns');
      // brzina AI poteza
      const speeds = MTG.SPEEDS;
      this.speed = this.speed || 'normal';
      const spB = el('button', 'tbtn', speeds[this.speed][0]);
      spB.title = 'AI turn speed: ' + speeds[this.speed][2];
      spB.onclick = () => {
        const order = ['normal', 'slow', 'fast'];
        this.speed = order[(order.indexOf(this.speed) + 1) % order.length];
        this.applySpeed();
        this.toast('AI turn speed: ' + speeds[this.speed][2]);
        this.render();
      };
      const helpB = el('button', 'tbtn', '❓');
      helpB.onclick = () => { this.showHelp = true; this.render(); };
      btns.appendChild(spB);
      const logB = el('button', 'tbtn', '📜');
      logB.onclick = () => { this.showLog = !this.showLog; this.render(); };
      // ručni HOLD — "stani na sljedećem prioritetu"
      const holdB = el('button', 'tbtn' + (this.holdNext ? ' armed' : ''), '🖐️');
      holdB.title = this.holdNext
        ? 'HOLD armed. The game stops at the next priority window. Click to cancel.'
        : 'HOLD: stop at the next priority window when you want to cast an instant.';
      holdB.onclick = () => {
        if (this.react) { this.takeReactWindow(); return; }
        this.holdNext = !this.holdNext;
        this.toast(this.holdNext ? '🖐️ HOLD: stopping at the next priority window.' : 'HOLD cancelled.');
        this.render();
      };
      btns.appendChild(holdB);
      const manaB = el('button', 'tbtn manamode' + (this.manaMode === 'manual' ? ' on' : ''),
        this.manaMode === 'manual' ? '🖐 MANA' : '✨ MANA');
      manaB.title = this.manaMode === 'manual'
        ? 'Manual mana: choose the exact lands and mana sources for every spell. Click for automatic mana.'
        : 'Automatic mana: the engine chooses sources. Click for manual selection.';
      manaB.onclick = () => {
        this.manaMode = this.manaMode === 'manual' ? 'auto' : 'manual';
        localStorage.setItem('mtgManaMode', this.manaMode);
        if (this.me) this.me.manualMana = this.manaMode === 'manual';
        this.toast(this.manaMode === 'manual'
          ? '🖐 Manual mana enabled. Choose sources for every spell.'
          : '✨ Automatic mana enabled.');
        this.render();
      };
      btns.appendChild(manaB);
      const modes = MTG.PRIO_MODES;
      const curMode = modes.find(m => m.key === (this.prioMode || 'end')) || modes[0];
      const setB = el('button', 'tbtn stopbtn', `${curMode.icon} ${curMode.short}`);
      setB.title = `Stops: ${curMode.label}. ${curMode.desc}`;
      setB.onclick = () => { this.showStops = true; this.render(); };
      const diplomacyEnabled = !!(g.diplomacy && g.diplomacy.enabled);
      // desktop panel toggle-i: gase threat/tok igre da tabla dobije punu širinu
      const thB = el('button', 'tbtn deskonly' + (diplomacyEnabled ? (this.sidebarTab === 'table' ? ' on' : '') : (this.showThreat ? ' on' : '')), '🎯');
      thB.title = diplomacyEnabled ? 'Open table information' : (this.showThreat ? 'Hide' : 'Show') + ' Threat panel';
      thB.onclick = () => {
        if (diplomacyEnabled) { this.sidebarTab = 'table'; this.render(); return; }
        this.showThreat = !this.showThreat;
        localStorage.setItem('mtgThreat', this.showThreat ? '1' : '0');
        this.render();
      };
      const slB = el('button', 'tbtn deskonly' + (diplomacyEnabled ? (this.sidebarTab === 'log' ? ' on' : '') : (this.showSideLog ? ' on' : '')), '📋');
      slB.title = diplomacyEnabled ? 'Open sidebar game log' : (this.showSideLog ? 'Hide' : 'Show') + ' game log';
      slB.onclick = () => {
        if (diplomacyEnabled) { this.sidebarTab = 'log'; this.render(); return; }
        this.showSideLog = !this.showSideLog;
        localStorage.setItem('mtgSideLog', this.showSideLog ? '1' : '0');
        this.render();
      };
      const dipB = diplomacyEnabled ? el('button', 'tbtn deskonly' + (this.sidebarTab === 'diplomacy' ? ' on' : ''), '🕊️') : null;
      if (dipB) {
        const incoming = g.diplomacyView ? g.diplomacyView(this.me).incoming.length : 0;
        dipB.textContent = incoming ? `🕊️ ${incoming}` : '🕊️';
        dipB.title = incoming ? `${incoming} unanswered diplomacy proposal${incoming === 1 ? '' : 's'}` : 'Open Diplomacy & Politics';
        dipB.onclick = () => { this.sidebarTab = 'diplomacy'; this.render(); };
      }
      const stB = el('button', 'tbtn' + (this.stackPopup ? ' on' : ''), '🃏');
      stB.title = (this.stackPopup ? 'Disable' : 'Enable') + ' the centered stack popup';
      stB.onclick = () => {
        this.stackPopup = !this.stackPopup;
        this.stackPopDismissed = 0;
        localStorage.setItem('mtgStackPop', this.stackPopup ? '1' : '0');
        this.toast(this.stackPopup ? '🃏 Stack popup enabled' : '🃏 Stack popup disabled');
        this.render();
      };
      const newB = el('button', 'tbtn', '↺');
      newB.onclick = () => { if (confirm('Start a new game? The current game will be lost.')) location.reload(); };
      btns.appendChild(helpB); btns.appendChild(logB);
      btns.appendChild(stB);
      btns.appendChild(thB); if (dipB) btns.appendChild(dipB); btns.appendChild(slB);
      btns.appendChild(setB); btns.appendChild(newB);
      bar.appendChild(btns);
      return bar;
    }

    renderOpponents(g) {
      this.collapsed = this.collapsed || new Set();
      const outer = el('div', 'oppsouter');
      const activeAiTurn = !!(g.turnPlayer && g.turnPlayer.isAI && g.turnPlayer !== this.me);
      const wrap = el('div', 'oppswrap' + (activeAiTurn ? ' active-ai-turn' : ''));
      // podesivo: visina zone (povlačenjem) i veličina karata (− / +)
      wrap.style.setProperty('--opp-h', this.oppHeight + 'dvh');
      wrap.style.setProperty('--opp-scale', String(this.oppScale));
      let seatNo = 0;
      for (const p of g.players) {
        if (p === this.me) continue;
        seatNo++;
        const meta = MTG.DECK_META[p.deckName] || {};
        const isActiveAi = activeAiTurn && g.turnPlayer === p;
        const row = el('div', `opprow seat-${seatNo}` + (p.lost ? ' lost' : '') + (g.turnPlayer === p ? ' active' : '') + (isActiveAi ? ' activeai' : ''));
        row.dataset.seat = String(seatNo).padStart(2, '0');
        row.style.setProperty('--seat-accent', COLHEX[(meta.colors || [])[0]] || '#778f63');
        if (isActiveAi) row.style.setProperty('--opp-scale', String(Math.min(2, this.oppScale * 1.2)));
        const isCandidate = this.isCandidate(p);
        const isSelectedTarget = this.selectedTargetIndex(p) >= 0;
        const collapsed = this.collapsed.has(p.idx);
        // header
        const head = el('div', 'opphead' + (isCandidate ? ' targetable' : ''));
        const cmdList = (p.commanders && p.commanders.length) ? p.commanders : p.command;
        const cmdState = cmdList.map(c => c.zone === 'battlefield' ? 'battlefield' : c.zone === 'command' ? 'CZ' : '🪦')
          .join(' / ') || '-';
        const cmdTitle = cmdList.map(c => `${c.name} (${c.zone})`).join(' · ');
        const styleMeta = p.isAI && p.aiStyle && MTG.AI_STYLES && MTG.AI_STYLES[p.aiStyle];
        head.innerHTML = `
          <span class="chev">${collapsed ? '▸' : '▾'}</span>
          <span class="seatindex">${String(seatNo).padStart(2, '0')}</span>
          <span class="oppname">${meta.icon || '🤖'} ${esc(p.name)}</span>
          ${isActiveAi ? '<span class="activeaitag">ACTIVE TURN</span>' : ''}
          ${styleMeta ? `<span class="personachip" title="Style: ${esc(styleMeta.label)}">${styleMeta.icon} ${esc(styleMeta.label)}</span>` : ''}
          <span class="opplife" role="button">${p.life}❤</span>
          <span class="oppmeta">✋${p.hand.length} 📚${p.library.length}</span>
          <span class="oppcmd" title="${esc(cmdTitle)}">👑${esc(cmdState)}</span>
          <button class="tbtn small">ℹ️</button>`;
        head.querySelector('button').onclick = (e) => { e.stopPropagation(); this.playerSheet = p; this.render(); };
        // EDHLAB-style: life tap = detalji (commander dmg itd.), ostatak = collapse
        head.querySelector('.opplife').onclick = (e) => {
          if (isCandidate || isSelectedTarget) return; // pusti glavni handler
          e.stopPropagation(); this.playerSheet = p; this.render();
        };
        head.onclick = () => {
          if (isSelectedTarget) { this.removeTargetCandidate(p); return; }
          if (isCandidate) { this.pickCandidate(p); return; }
          if (this.collapsed.has(p.idx)) this.collapsed.delete(p.idx); else this.collapsed.add(p.idx);
          this.render();
        };
        if (isSelectedTarget) this.markSelectedTarget(head, p);
        row.appendChild(head);
        // board strip (always visible unless collapsed)
        if (!collapsed && !p.lost) {
          const strip = el('div', 'oppstrip');
          const allPerms = g.bf().filter(c => c.ctrl === p && !c.is('Land'));
          const perms = allPerms.filter(c => !this.attachedHost(g, c));
          const creatures = perms.filter(c => c.is('Creature'));
          const others = perms.filter(c => !c.is('Creature'));
          for (const entry of this.groupPerms(creatures.concat(others))) {
            strip.appendChild(this.permanentPile(g, entry.card, { sm: true, stackN: entry.n }));
          }
          // lands summary chip
          const lands = g.lands(p);
          const untapped = lands.filter(l => !l.tapped).length;
          if (lands.length) {
            const lc = el('div', 'oppLands', `🌍<br>${untapped}/${lands.length}`);
            lc.title = 'Lands (untapped/total)';
            lc.onclick = () => { this.playerSheet = p; this.render(); };
            strip.appendChild(lc);
          }
          if (!allPerms.length && !lands.length) strip.appendChild(el('div', 'emptystrip', 'empty battlefield'));
          row.appendChild(strip);
        }
        wrap.appendChild(row);
      }
      outer.appendChild(wrap);

      // --- kontrole veličine AI tabli ---
      const bar = el('div', 'oppsizebar');
      const setScale = (v) => {
        this.oppScale = Math.max(0.6, Math.min(2, Math.round(v * 20) / 20));
        localStorage.setItem('mtgOppS', String(this.oppScale));
        wrap.style.setProperty('--opp-scale', String(this.oppScale));
        val.textContent = Math.round(this.oppScale * 100) + '%';
      };
      const minus = el('button', 'zbtn', '−');
      minus.title = 'Smaller opponent cards';
      minus.onclick = () => setScale(this.oppScale - 0.1);
      const plus = el('button', 'zbtn', '+');
      plus.title = 'Larger opponent cards';
      plus.onclick = () => setScale(this.oppScale + 0.1);
      const val = el('div', 'zval', Math.round(this.oppScale * 100) + '%');
      const reset = el('button', 'zbtn', '↺');
      reset.title = 'Reset to default (100%, 42% height)';
      reset.onclick = () => {
        setScale(1);
        this.oppHeight = 42;
        localStorage.setItem('mtgOppH', '42');
        wrap.style.setProperty('--opp-h', '42dvh');
      };
      bar.appendChild(el('div', '', 'AI table'));
      bar.appendChild(el('div', 'zspacer'));
      bar.appendChild(minus); bar.appendChild(val); bar.appendChild(plus); bar.appendChild(reset);
      outer.appendChild(bar);

      // --- hvatište: povlačenjem se mijenja visina zone protivnika ---
      const grip = el('div', 'oppresize');
      grip.title = 'Drag to change the AI battlefield height';
      const startDrag = (ev) => {
        const startY = ev.touches ? ev.touches[0].clientY : ev.clientY;
        const startH = this.oppHeight;
        grip.classList.add('drag');
        const move = (e2) => {
          const cy = e2.touches ? e2.touches[0].clientY : e2.clientY;
          const dvh = ((cy - startY) / window.innerHeight) * 100;
          this.oppHeight = Math.max(14, Math.min(74, Math.round(startH + dvh)));
          wrap.style.setProperty('--opp-h', this.oppHeight + 'dvh');
          if (e2.cancelable) e2.preventDefault();
        };
        const up = () => {
          grip.classList.remove('drag');
          localStorage.setItem('mtgOppH', String(this.oppHeight));
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
          window.removeEventListener('touchmove', move);
          window.removeEventListener('touchend', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', up);
      };
      grip.addEventListener('mousedown', startDrag);
      grip.addEventListener('touchstart', startDrag, { passive: true });
      outer.appendChild(grip);
      return outer;
    }

    renderCenter(g) {
      const wrap = el('div', 'center');
      if (g.combat && g.combat.attackers && g.combat.attackers.length) {
        const map = el('div', 'combatmap');
        map.appendChild(el('div', 'combatmaptitle', `Combat · ${esc(this.phaseName(g))}`));
        const lanes = new Map();
        for (const attacker of g.combat.attackers) {
          const target = attacker.attacking instanceof MTG.Player ? attacker.attacking : attacker.attacking && attacker.attacking.ctrl;
          if (!target) continue;
          if (!lanes.has(target)) lanes.set(target, []);
          lanes.get(target).push(attacker);
        }
        for (const [target, attackers] of lanes) {
          const lane = el('div', 'combatlane' + (target === this.me ? ' tome' : ''));
          const cards = el('div', 'combatattackers');
          let rawDamage = 0;
          for (const attacker of attackers) {
            rawDamage += g.dmgAmount(attacker, 'normal');
            const item = el('div', 'combatunit');
            const blocked = attacker.blockedBy && attacker.blockedBy.length;
            item.innerHTML = `<img src="${imgURL(attacker.name)}" onerror="MTG.imgFail(this)">
              <span><b>${esc(attacker.name)}</b><small>${attacker.power}/${attacker.toughness}${blocked ? ` · blocked by ${esc(attacker.blockedBy.map(b => b.name).join(', '))}` : ''}</small></span>`;
            item.onclick = () => { this.sheet = { card: attacker }; this.render(); };
            cards.appendChild(item);
          }
          lane.appendChild(cards);
          lane.appendChild(el('div', 'combatarrow', '<span></span>'));
          lane.appendChild(el('div', 'combatdefender', `<b>${esc(target.name)}</b><span>${attackers.length} attacker${attackers.length === 1 ? '' : 's'} · up to ${rawDamage} damage</span>`));
          map.appendChild(lane);
        }
        wrap.appendChild(map);
      }
      if (g.stack.length) {
        const st = el('div', 'stack');
        st.appendChild(el('div', 'stacktitle', `STACK (${g.stack.length})`));
        for (let i = g.stack.length - 1; i >= 0; i--) {
          const so = g.stack[i];
          const item = el('div', 'stackitem' + (i === g.stack.length - 1 ? ' top' : ''));
          item.innerHTML = `<b>${esc(so.name)}</b><span class="who">${esc(so.ctrl.name)}</span>`;
          if (this.markSelectedTarget(item, so)) { /* selected stack target remains removable */ }
          else if (this.isCandidate(so)) { item.classList.add('targetable'); item.onclick = () => this.pickCandidate(so); }
          else if (so.card) item.onclick = () => { this.sheet = { card: so.card, stack: true }; this.render(); };
          st.appendChild(item);
        }
        wrap.appendChild(st);
      }
      return wrap;
    }

    // EDHLAB-style stacking of identical cards (tokens etc.)
    groupPerms(perms) {
      const pd = this.pending;
      const expand = pd && ['attackers', 'blockers', 'chooseTargets'].includes(pd.q.type);
      if (expand) return perms.map(c => ({ card: c, n: 1 }));
      const groups = new Map();
      const out = [];
      for (const c of perms) {
        const key = c.commander || c.attachments.length || c.attacking || c.blocking
          ? 'solo' + c.iid
          : `${c.name}|${c.tapped}|${c.sick}|${c.is('Creature') ? c.power + '/' + c.toughness : ''}|${JSON.stringify(c.counters)}|${c.isToken}`;
        if (groups.has(key)) groups.get(key).n++;
        else { const entry = { card: c, n: 1 }; groups.set(key, entry); out.push(entry); }
      }
      return out;
    }

    attachedHost(g, card) {
      if (!card || !card.attachedTo) return null;
      const host = g.byIid(card.attachedTo);
      return host && host.zone === 'battlefield' && !host.phasedOut ? host : null;
    }

    attachedCards(g, host) {
      return (host.attachments || []).map(iid => g.byIid(iid)).filter(card =>
        card && card.zone === 'battlefield' && !card.phasedOut && card.attachedTo === host.iid);
    }

    attachedCard(g, card, host, opts = {}) {
      const equipment = card.hasSub('Equipment');
      const item = el('div', 'attachedcard' + (opts.sm ? ' sm' : '') +
        (card.tapped ? ' tapped' : '') + (equipment ? ' equipment' : ' aura'));
      item.dataset.cname = card.name;
      item.title = `${card.name}: ${equipment ? 'equipped' : 'attached'} to ${host.name}`;
      item.innerHTML = `<img loading="lazy" src="${imgURL(card.name)}" onerror="MTG.imgFail(this)">
        <span><small>${equipment ? 'EQUIPMENT' : 'AURA'}</small><b>${esc(card.name.split(' // ')[0])}</b></span>`;
      if (this.actable && this.actable.has(card.iid)) item.classList.add('actable');
      if (this.markSelectedTarget(item, card)) {
        return item;
      } else if (this.isCandidate(card)) {
        item.classList.add('targetable');
        item.onclick = () => this.pickCandidate(card);
      } else {
        item.onclick = () => { this.sheet = { card }; this.render(); };
      }
      return item;
    }

    permanentPile(g, card, opts = {}) {
      const attachments = this.attachedCards(g, card);
      if (!attachments.length) return this.miniCard(g, card, opts);
      const pile = el('div', 'permanentpile' + (opts.sm ? ' sm' : '') + ' equipped');
      pile.dataset.host = card.name;
      pile.appendChild(this.miniCard(g, card, opts));
      const tray = el('div', 'attachmenttray');
      for (const attached of attachments) tray.appendChild(this.attachedCard(g, attached, card, opts));
      pile.appendChild(tray);
      return pile;
    }

    landGroups(g, p) {
      const groups = {};
      for (const l of g.lands(p)) {
        const key = l.name;
        (groups[key] = groups[key] || []).push(l);
      }
      return groups;
    }

    renderMyBoard(g) {
      const me = this.me;
      const wrap = el('div', 'myboard');
      // permanents (nonland)
      const allPerms = g.bf().filter(c => c.ctrl === me && !c.is('Land'));
      const perms = allPerms.filter(c => !this.attachedHost(g, c));
      const row1 = el('div', 'cardrow');
      const creatures = perms.filter(c => c.is('Creature'));
      const others = perms.filter(c => !c.is('Creature'));
      for (const entry of this.groupPerms(creatures.concat(others))) {
        row1.appendChild(this.permanentPile(g, entry.card, { stackN: entry.n }));
      }
      if (!allPerms.length) row1.appendChild(el('div', 'emptyrow', 'Your battlefield is empty'));
      wrap.appendChild(row1);
      // lands & info row
      const row2 = el('div', 'landrow');
      const groups = this.landGroups(g, me);
      for (const [name, lands] of Object.entries(groups)) {
        const untapped = lands.filter(l => !l.tapped).length;
        const lc = el('div', 'landstack' + (untapped === 0 ? ' tapped' : ''));
        const cols = (lands[0].def.producesColors || []).map(c => `<span class="dot" style="background:${COLHEX[c]}"></span>`).join('');
        lc.innerHTML = `<div class="lname">${esc(name)}</div><div>${cols}</div><div class="lcount">${untapped}/${lands.length}</div>`;
        const selectedLand = lands.find(l => this.selectedTargetIndex(l) >= 0);
        const cand = lands.find(l => this.isCandidate(l));
        if (selectedLand) this.markSelectedTarget(lc, selectedLand);
        else if (cand) { lc.classList.add('targetable'); lc.onclick = () => this.pickCandidate(cand); }
        else lc.onclick = () => { this.sheet = { card: lands[0] }; this.render(); };
        row2.appendChild(lc);
      }
      // mana pool
      const pool = me.pool;
      const poolStr = Object.entries(pool).filter(([k, v]) => v > 0)
        .map(([k, v]) => `<span class="manapoolchip">${manaGlyph(k, 'poolglyph')}<b>${v}</b></span>`).join('');
      const maySeeLibraryTop = g.bf().some(card => card.ctrl === me && card.def.revealOwnTop);
      const libraryTop = maySeeLibraryTop ? me.library[me.library.length - 1] : null;
      const info = el('div', 'meinfo');
      info.innerHTML = `<div class="seatyou"><span>04</span><small>YOU</small></div><div class="melife">${me.life}<small>life</small></div>
        <div class="manapool">${poolStr}</div>
        <div class="zbtns">
          <button class="zbtn" data-z="library-top">📚${me.library.length}${libraryTop ? ' · 👁' : ''}</button>
          <button class="zbtn" data-z="graveyard">🪦${me.graveyard.length}</button>
          <button class="zbtn" data-z="exile">🌀${me.exile.length}</button>
        </div>`;
      info.querySelectorAll('.zbtn[data-z]').forEach(b => {
        b.onclick = () => {
          if (b.dataset.z === 'library-top') {
            if (libraryTop) this.sheet = { card: libraryTop };
          } else this.zoneBrowse = { player: me, zone: b.dataset.z };
          this.render();
        };
      });
      const myLife = info.querySelector('.melife');
      if (this.markSelectedTarget(myLife, me)) {
        // selected player target can be removed directly
      } else if (this.isCandidate(me)) {
        myLife.classList.add('targetable');
        myLife.title = `Choose ${me.name} as the target`;
        myLife.onclick = () => this.pickCandidate(me);
      } else {
        myLife.onclick = () => { this.playerSheet = me; this.render(); };
      }
      row2.appendChild(info);
      wrap.appendChild(row2);
      // COMMAND ZONE — always visible when commander is there.
      // The Ring emblem stoji uz komandera i ostaje vidljiv i kad je
      // komander na bojnom polju (tj. kad je command zona prazna).
      const ringEm = (me.emblems || []).find(e => e.ring);
      if (me.command.length || ringEm) {
        const czRow = el('div', 'czrow');
        for (const cmd of me.command) {
          const cz = el('div', 'czcard');
          const castEntry = this.pending && this.pending.q.casts && this.pending.q.casts.find(e => e.card === cmd);
          const cost = this.game.spellCost(me, cmd, {});
          cz.innerHTML = `
            <img loading="lazy" src="${imgURL(cmd.name)}" onerror="MTG.imgFail(this)">
            <div class="czinfo">
              <div class="czlabel">👑 COMMAND ZONE</div>
              <div class="czname">${esc(cmd.name.split(',')[0])}</div>
              <div class="czcost">Cost: ${costHTML(U.costStr(cost))}${cmd.cmdCasts ? ` <span class="tax">(tax +${2 * cmd.cmdCasts})</span>` : ''}</div>
            </div>
            ${castEntry ? '<div class="czgo">CAST ▶</div>' : ''}`;
          if (castEntry) cz.classList.add('castable');
          cz.onclick = () => { this.sheet = { card: cmd }; this.render(); };
          czRow.appendChild(cz);
        }
        if (ringEm) czRow.appendChild(this.ringCard(me, ringEm));
        wrap.appendChild(czRow);
      }
      return wrap;
    }

    // The Ring — emblem uz komandera. Prikazuje nivo i koje su od četiri
    // sposobnosti već stečene (kumulativno se dobijaju odozgo nadolje).
    ringCard(me, em) {
      const bearer = this.game.bf().find(c => c.ctrl === me && c.meta.ringBearer);
      const abil = [
        "Your Ring-bearer is legendary and can't be blocked by creatures with greater power.",
        'Whenever your Ring-bearer attacks, draw a card, then discard a card.',
        'Whenever your Ring-bearer becomes blocked by a creature, its controller sacrifices it at end of combat.',
        'Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life.',
      ];
      const d = el('div', 'czcard ringcard');
      d.innerHTML = `
        <div class="ringart">💍</div>
        <div class="czinfo">
          <div class="czlabel">THE RING · LEVEL ${em.level}/4</div>
          <div class="czname">${bearer ? esc(bearer.name.split(',')[0]) : '<span class="ringnone">no Ring-bearer</span>'}</div>
          <div class="ringpips">${abil.map((_, i) => `<span class="ringpip${i < em.level ? ' on' : ''}"></span>`).join('')}</div>
        </div>`;
      d.onclick = () => {
        this.sheet = {
          custom: {
            title: `💍 The Ring: level ${em.level}/4`,
            body: abil.map((t, i) => `<div class="ringab${i < em.level ? ' on' : ''}">${i < em.level ? '✓' : '○'} ${t}</div>`).join('')
              + `<div class="ringab on" style="margin-top:8px">Ring-bearer: <b>${bearer ? esc(bearer.name) : '-'}</b></div>`,
          },
        };
        this.render();
      };
      return d;
    }

    canLookFaceDown(c) {
      if (!c || !c.faceDown || !this.me) return !c || !c.faceDown;
      const meta = c.meta || {};
      return !!(c.ctrl === this.me && meta.faceDownDef) || meta.revealedTo === 'all' ||
        Array.isArray(meta.revealedTo) && meta.revealedTo.includes(this.me.idx);
    }

    visibleFaceDownDef(c) {
      if (!this.canLookFaceDown(c)) return null;
      return c.meta && c.meta.faceDownDef || c.def;
    }

    miniCard(g, c, opts = {}) {
      const threatened = this.threatTargets && this.threatTargets.has(c.iid);
      const shownFaceDownDef = this.visibleFaceDownDef(c);
      const mayLookFaceDown = !!shownFaceDownDef;
      const faceName = mayLookFaceDown ? shownFaceDownDef.name : c.name;
      const d = el('div', 'mini' + (opts.sm ? ' sm' : '') + (c.tapped ? ' tapped' : '') + (c.sick && c.is('Creature') && !c.kw('haste') ? ' sick' : '') + (threatened ? ' threatened' : '') + (c.faceDown ? ' facedown' : ''));
      d.dataset.iid = String(c.iid);
      const colors = c.colors.length ? c.colors : ['C'];
      const grad = colors.length > 1
        ? `linear-gradient(135deg, ${colors.map(x => COLHEX[x]).join(',')})`
        : COLHEX[colors[0]];
      d.style.setProperty('--frame', grad);
      const pd = this.pending;
      const badges = [];
      if (c.commander) badges.push('👑');
      if (c.meta.ringBearer) badges.push('💍');
      if (c.attacking) badges.push('⚔️');
      if (c.blocking) badges.push('🛡️');
      if (this.actable && this.actable.has(c.iid)) { badges.push('⚙️'); d.classList.add('actable'); }
      if (c.commander) d.classList.add('cmdr');
      const pt = c.is('Creature') ? `<div class="pt">${c.power}/${c.toughness}</div>` : (c.is('Planeswalker') ? `<div class="pt">◆${c.counters['loyalty'] || 0}</div>` : '');
      const cnt = (c.counters['+1/+1'] || 0) ? `<div class="cnt">+${c.counters['+1/+1']}</div>` : '';
      // Ostali counteri (charge, soul, lore, stun…) su ranije bili nevidljivi —
      // nisi mogao vidjeti koliko charge-a ima Inspirit. Charge ide prvi jer je
      // vezan za win condition i station pragove.
      const CNT_ICON = { charge: '⚡', soul: '💀', page: '📖', hour: '⏳', stun: '💫',
        shield: '🛡️', vow: '💍', loot: '🎁', stash: '📦', quest: '❖', lore: '📜' };
      const other = Object.entries(c.counters)
        .filter(([k, v]) => v > 0 && k !== '+1/+1' && k !== 'loyalty' && k !== 'flying' && k !== 'indestructible')
        .sort((a, b) => (a[0] === 'charge' ? -1 : b[0] === 'charge' ? 1 : b[1] - a[1]));
      const oc = other.length
        ? `<div class="cnt2" title="${esc(other.map(([k, v]) => v + ' ' + k).join(', '))}">${
          other.slice(0, 2).map(([k, v]) => `${CNT_ICON[k] || '◆'}${v}`).join(' ')}</div>`
        : '';
      // Vehicle koji je posadu dobio ovaj potez — da se vidi da je stvorenje
      const crewed = (c.hasSub('Vehicle') && c.meta.crewedTurn === g.turnNo)
        ? '<div class="crewtag" title="Crewed this turn">CREW</div>' : '';
      const att = c.attachments.length ? `<div class="att">🔗${c.attachments.length}</div>` : '';
      const tok = c.isToken ? `<div class="toktag">TOKEN</div>` : '';
      const fd = c.faceDown ? `<div class="facedowntag">${mayLookFaceDown ? 'FACE-DOWN · ' + esc(faceName.split(' // ')[0]) : 'FACE-DOWN'}</div>` : '';
      const stackN = opts.stackN && opts.stackN > 1 ? `<div class="stackn">×${opts.stackN}</div>` : '';
      if (opts.stackN > 1) d.classList.add('stacked');
      d.innerHTML = `
        <img loading="lazy" src="${c.faceDown && !mayLookFaceDown ? MTG.BLANK_PX : imgURL(faceName)}" onerror="MTG.imgFail(this)">
        <div class="mname">${esc(c.faceDown ? 'Face-down creature' : c.name.split(' // ')[0])}</div>
        ${pt}${cnt}${oc}${crewed}${att}${tok}${fd}${stackN}
        ${badges.length ? `<div class="badge">${badges.join('')}</div>` : ''}`;
      d.dataset.cname = mayLookFaceDown ? faceName : c.name;
      // interactions
      if (this.markSelectedTarget(d, c)) {
        return d;
      }
      if (this.isCandidate(c)) {
        d.classList.add('targetable');
        d.onclick = () => this.pickCandidate(c);
        return d;
      }
      if (pd && pd.q.type === 'attackers' && c.ctrl === this.me) {
        const sel = pd.sel.find(s => s.card === c);
        if (pd.q.eligible.includes(c)) {
          d.classList.add('eligible');
          if (sel) {
            d.classList.add('attacking');
            const tname = sel.target instanceof MTG.Player ? sel.target.name : sel.target.name;
            d.appendChild(el('div', 'atkchip', `⚔ ${esc(tname)}`));
          }
          d.onclick = () => this.toggleAttacker(c);
          return d;
        }
      }
      if (pd && pd.q.type === 'blockers') {
        if (pd.q.potential.includes(c)) {
          d.classList.add('eligible');
          const assigned = pd.assigns.get(c);
          if (assigned) {
            d.classList.add('blocking');
            d.appendChild(el('div', 'atkchip', `🛡 ${esc(assigned.name)}`));
          }
          d.onclick = () => this.assignBlocker(c);
          return d;
        }
      }
      d.onclick = () => { this.sheet = { card: c }; this.render(); };
      return d;
    }

    renderHand(g) {
      const me = this.me;
      const wrap = el('div', 'handwrap');
      const row = el('div', 'hand');
      const pd = this.pending;
      const castable = new Map();
      if (pd && (pd.q.type === 'main' || pd.q.type === 'priority')) {
        for (const e of (pd.q.casts || [])) {
          if (!castable.has(e.card)) castable.set(e.card, []);
          castable.get(e.card).push(e);
        }
        for (const l of (pd.q.lands || [])) castable.set(l, castable.get(l) || []);
        for (const a of (pd.q.acts || [])) {
          if ((a.cycling || a.plot || a.suspend) && a.card.zone === 'hand') {
            if (!castable.has(a.card)) castable.set(a.card, []);
          }
        }
      }
      // 🌀 IMPULSE / PLOT: karte u egzilu koje trenutno smiješ igrati moraju
      // biti stalno vidljive — inače igrač ne zna ŠTA je egzilirano i da li
      // to još može baciti. Zelene su kad su bacive baš sada.
      {
        const exilePlayable = [];
        for (const owner of g.players) {
          for (const c of owner.exile) {
            const meta = c.meta || {};
            if ((meta.playableBy === me && g.hasExilePlayPermission(me, c)) ||
              (owner === me && meta.plotted)) exilePlayable.push(c);
          }
        }
        if (exilePlayable.length) {
          const tray = el('div', 'exiletray');
          tray.appendChild(el('div', 'exiletraytitle', '🌀 Exiled — you may play:'));
          const list = el('div', 'exiletraylist');
          for (const c of exilePlayable) {
            const meta = c.meta || {};
            const now = castable.has(c);
            const until = meta.plotted ? 'plotted — cast in your main phase'
              : meta.playableUntilOwnTurn !== undefined ? 'until the end of your turn'
                : meta.playableUntil !== undefined && meta.playableUntil <= g.turnNo ? 'until end of THIS turn'
                  : 'for a limited time';
            const item = el('button', 'exiletraycard' + (now ? ' castable' : ''));
            item.dataset.cname = c.name;
            item.title = `${c.name}: playable from exile ${until}${meta.freePlay ? ' · FREE' : ''}`;
            item.innerHTML = `
              <img loading="lazy" src="${imgURL(c.name)}" onerror="MTG.imgFail(this)">
              <span><b>${esc(c.name.split(' // ')[0])}</b><small>${meta.freePlay ? 'free · ' : ''}${esc(until)}</small></span>
              ${now ? '<i class="exgo">PLAY ▶</i>' : ''}`;
            item.onclick = () => { this.sheet = { card: c }; this.render(); };
            list.appendChild(item);
          }
          tray.appendChild(list);
          wrap.appendChild(tray);
        }
      }
      for (const c of me.hand) {
        const d = el('div', 'hcard' + (this.threatTargets && this.threatTargets.has(c.iid) ? ' threatened' : ''));
        const colors = c.colors.length ? c.colors : ['C'];
        d.style.setProperty('--frame', colors.length > 1 ? `linear-gradient(135deg, ${colors.map(x => COLHEX[x]).join(',')})` : COLHEX[colors[0]]);
        d.innerHTML = `
          <img loading="lazy" src="${imgURL(c.name)}" onerror="MTG.imgFail(this)">
          <div class="hcost">${costHTML(c.def.cost || '')}</div>
          <div class="mname">${esc(c.name.split(' // ')[0])}</div>`;
        d.dataset.cname = c.name;
        if (this.markSelectedTarget(d, c)) {
          // selected target can be removed directly
        } else if (this.isCandidate(c)) {
          d.classList.add('targetable');
          d.onclick = () => this.pickCandidate(c);
        } else {
          if (castable.has(c)) d.classList.add('castable');
          d.onclick = () => { this.sheet = { card: c }; this.render(); };
        }
        row.appendChild(d);
      }
      if (!me.hand.length) row.appendChild(el('div', 'emptyrow', 'Empty hand'));
      wrap.appendChild(row);
      return wrap;
    }

    // ---------- prompt bar ----------
    renderPromptBar(g) {
      const bar = el('div', 'promptbar');
      const pd = this.pending;
      if (!pd) {
        // prozor za reakciju — ne blokira, samo ponudi
        if (this.react) {
          const w = this.react;
          const top = g.stack[g.stack.length - 1];
          bar.classList.add('reacting');
          const rq = this.react.q || {};
          const canAct = ((rq.casts || []).length + (rq.acts || []).length) > 0;
          // Posljednji end step prije mog poteza dobija svoj tekst i dugme —
          // to nije "odgovor na spell", nego zadnja prilika da nešto odigram.
          const preTurn = !top && MTG.isLastEndStepBeforeMyTurn(g, this.me);
          if (preTurn) {
            bar.appendChild(el('div', 'ptext',
              `🌙 End step: <b>${esc(g.turnPlayer ? g.turnPlayer.name : '')}</b>. Last chance before your turn.`));
          } else if (!top && g.phase === 'combat' && canAct) {
            const stepLabel = g.step === 'attackers' ? 'attackers have been declared' :
              g.step === 'blockers' ? 'blockers have been declared' :
                g.step === 'firstStrike' ? 'first-strike damage is complete' : 'combat is in progress';
            bar.appendChild(el('div', 'ptext',
              `⚡ <b>Combat response</b>: ${stepLabel}. You have ${(rq.casts || []).length + (rq.acts || []).length} legal options.`));
          } else {
            const who = top && top.ctrl ? top.ctrl.name : 'opponent';
            const what = top ? (top.name || (top.card && top.card.name) || 'something') : 'action';
            bar.appendChild(el('div', 'ptext', canAct
              ? `⚡ <b>${esc(who)}</b>: ${esc(what)}. Do you want to respond?`
              : `⚡ <b>${esc(who)}</b>: ${esc(what)}. You have no response.`));
          }
          const row = el('div', 'btnrow');
          if (canAct) {
            const yes = el('button', 'pbtn primary', preTurn ? '🎴 PLAY SOMETHING' : '⚡ RESPOND');
            yes.onclick = () => this.takeReactWindow();
            row.appendChild(yes);
          }
          // Kad nemam čime da odgovorim, jedino dugme je Proceed — ali igra i
          // dalje čeka mene, bez odbrojavanja.
          const no = el('button', 'pbtn' + (canAct ? '' : ' primary'),
            preTurn ? 'Continue to my turn ▶' : 'Proceed ▶');
          no.onclick = () => this.skipReactWindow();
          row.appendChild(no);
          bar.appendChild(row);
          return bar;
        }
        const hint = this.holdNext ? '🖐️ HOLD armed. Stopping at the next priority window.' : '⏳ Opponents are playing…';
        bar.appendChild(el('div', 'ptext dim', g.gameOver ? 'The game is over.' : hint));
        return bar;
      }
      const q = pd.q;
      const btn = (label, fn, cls) => {
        const b = el('button', 'pbtn ' + (cls || ''), label);
        b.onclick = fn;
        return b;
      };
      if (this.manualPick) {
        bar.appendChild(el('div', 'ptext', `🎯 <b>${esc(this.manualPick.label)}</b>: click a target`));
        bar.appendChild(btn('Cancel', () => { this.manualPick = null; this.render(); }, 'danger'));
        return bar;
      }
      // ponude van ruke (groblje/egzil) — inače bi bile nevidljive
      const offZoneRow = () => {
        const list = MTG.offZoneCasts ? MTG.offZoneCasts(q.casts) : [];
        if (!list.length) return null;
        const row = el('div', 'btnrow offzone');
        const ZONE = { graveyard: '🪦', exile: '🌀', battlefield: '🎴' };
        for (const e of list.slice(0, 4)) {
          const zi = ZONE[e.card.zone] || '•';
          const owner = e.card.owner !== this.me ? `, owned by ${e.card.owner.name}` : '';
          const alt = e.alt && e.alt.label ? ` · ${e.alt.label}` : (e.alt && e.alt.free ? ' · free' : '');
          const b = btn(`${zi} ${esc(e.card.name.split(' // ')[0])}${esc(alt)}${esc(owner)}`, () => {
            this.resolvePending({ kind: 'cast', card: e.card, alt: e.alt, from: e.from });
          });
          b.title = `Play from zone: ${e.card.zone}`;
          row.appendChild(b);
        }
        return row;
      };
      const judgeBtn = () => {
        const hasCustom = this.me && this.me.deckName && MTG.DECKS[this.me.deckName] && MTG.DECKS[this.me.deckName].custom;
        if (!hasCustom && q.type !== 'manualResolve') return null;
        return btn('⚒️ Judge', () => { this.showJudge = true; this.render(); });
      };
      if (q.type === 'threatAlert') {
        bar.appendChild(el('div', 'ptext', '⏸️ Paused. Review what the bot is sending at you.'));
        return bar;
      }
      switch (q.type) {
        case 'manualResolve': {
          bar.appendChild(el('div', 'ptext', `⚒️ <b>${esc(q.card.name)}</b>: perform the effect manually, then confirm`));
          const row = el('div', 'btnrow');
          row.appendChild(btn('⚒️ Open Judge panel', () => { this.showJudge = true; this.render(); }, 'primary'));
          row.appendChild(btn('Done ✔', () => this.resolvePending(true)));
          bar.appendChild(row);
          break;
        }
        case 'main': {
          let hint = g.phase === 'main1' ? '🎴 Main phase 1: click a card for actions' : '🎴 Main phase 2';
          if (this.actable && this.actable.size) hint += ` · <span class="hintact">⚙️ = ability (${this.actable.size})</span>`;
          bar.appendChild(el('div', 'ptext', hint));
          const oz = offZoneRow();
          if (oz) bar.appendChild(oz);
          const row = el('div', 'btnrow');
          const jb = judgeBtn();
          if (jb) row.appendChild(jb);
          row.appendChild(btn(g.phase === 'main1' ? 'Continue ▶ (combat)' : 'End turn ▶', () => this.resolvePending({ kind: 'done' }), 'primary'));
          bar.appendChild(row);
          break;
        }
        case 'priority': {
          const top = g.stack[g.stack.length - 1];
          const nOpt = (q.casts || []).length + (q.acts || []).length;
          let label;
          if (top) {
            label = `⚡ On the stack: <b>${esc(top.name)}</b> <span class="who">(${esc(top.ctrl.name)})</span>. Respond?`;
          } else if (g.phase === 'combat' && g.step === 'attackers') {
            const atk = (g.combat && g.combat.attackers) || [];
            const dmg = atk.filter(a => a.attacking === this.me).reduce((s, a) => s + g.dmgAmount(a, 'normal'), 0);
            label = `⚔️ <b>Attackers declared</b> (${atk.length}). ${dmg} damage is coming at you. This is your instant window.`;
          } else if (g.phase === 'combat' && g.step === 'blockers') {
            label = '🛡️ <b>Blockers declared</b>. Last chance for a trick before damage.';
          } else if (g.phase === 'combat' && g.step === 'firstStrike') {
            label = '⚔️ <b>First-strike damage complete</b>. You may respond before normal combat damage.';
          } else if (MTG.isLastEndStepBeforeMyTurn(g, this.me)) {
            label = `🌙 <b>End step</b> (${esc(g.turnPlayer.name)}). Last chance before your turn.`;
          } else if (g.phase === 'end') {
            label = `🌙 <b>End step</b> (${esc(g.turnPlayer.name)}). A good time to cast an instant.`;
          } else {
            label = '⚡ Priority: you may respond.';
          }
          const ozc = MTG.offZoneCasts ? MTG.offZoneCasts(q.casts) : [];
          const inHandN = (q.casts || []).length - ozc.length;
          const hint = nOpt
            ? ` <span class="hintact">${nOpt} option${nOpt === 1 ? '' : 's'}${inHandN ? ': click a card in your hand' : ''}</span>`
            : '';
          bar.appendChild(el('div', 'ptext', label + hint));
          const oz2 = offZoneRow();
          if (oz2) bar.appendChild(oz2);
          const row = el('div', 'btnrow');
          row.appendChild(btn(MTG.isLastEndStepBeforeMyTurn(g, this.me) ? 'Continue to my turn ▶' : 'Proceed ▶',
            () => this.resolvePending({ kind: 'pass' }), 'primary'));
          row.appendChild(btn('🔕 Stop interrupting me', () => {
            this.prioMode = 'off';
            this.toast('🔕 No more prompts. Stop manually with 🖐️ or the R key.');
            this.resolvePending({ kind: 'pass' });
          }));
          bar.appendChild(row);
          break;
        }
        case 'attackers': {
          const n = pd.sel.length;
          bar.appendChild(el('div', 'ptext', `⚔️ Attack: choose attackers (${n}). Click a creature, then choose a defender in the popup.`));
          bar.appendChild(btn(n ? `Attack! (${n})` : 'No attacks ▶', () => this.resolvePending(pd.sel.map(s => ({ card: s.card, target: s.target }))), 'primary'));
          break;
        }
        case 'blockers': {
          bar.appendChild(el('div', 'ptext', '🛡️ Blocks: click an attacker above, then click your blocker.'));
          const atkRow = el('div', 'atkrow');
          for (const a of q.attackers) {
            const chip = el('div', 'atkchipbig' + (pd.mode === a ? ' selchip' : ''), `⚔ ${esc(a.name)} ${a.power}/${a.toughness}${a.kw('flying') ? '✈' : ''}${a.kw('menace') ? '👿' : ''}${a.kw('trample') ? '💢' : ''}`);
            chip.onclick = () => { pd.mode = pd.mode === a ? null : a; this.render(); };
            atkRow.appendChild(chip);
          }
          bar.appendChild(atkRow);
          const blocks = [];
          for (const [b, a] of pd.assigns) blocks.push({ blocker: b, attacker: a });
          const brow = el('div', 'btnrow');
          brow.appendChild(btn('🛡 Back to block overview', () => { pd.boardPeek = false; this.render(); }));
          brow.appendChild(btn(blocks.length ? `Confirm blocks (${blocks.length})` : 'No blocks ▶', () => this.resolvePending(blocks), 'primary'));
          bar.appendChild(brow);
          break;
        }
        case 'chooseTargets': {
          const min = q.min, max = q.max;
          bar.classList.add('targetprompt');
          bar.dataset.testid = 'target-selection';
          const source = q.src || q.card;
          bar.appendChild(el('div', 'targetprompthead',
            `<span>🎯 ${source && source.name ? esc(source.name) + ' · ' : ''}${esc(q.prompt || 'Choose a target')}</span>` +
            `<strong>${pd.sel.length} / ${max}</strong>`));
          bar.appendChild(el('div', 'targetprompthint',
            pd.sel.length < min
              ? `Choose ${min - pd.sel.length} more target${min - pd.sel.length === 1 ? '' : 's'}. Glowing cards and players are legal.`
              : 'Review the numbered targets, then confirm. Click a selected target or × to remove it.'));
          const picked = el('div', 'targetpickchips');
          pd.sel.forEach((target, index) => {
            const chip = el('button', 'targetpickchip',
              `<span>${index + 1}</span><b>${esc(target.name || target.card && target.card.name || 'Stack object')}</b><i>×</i>`);
            chip.type = 'button';
            chip.title = `Remove target ${index + 1}`;
            chip.onclick = () => this.removeTargetCandidate(target);
            picked.appendChild(chip);
          });
          if (!pd.sel.length) picked.appendChild(el('div', 'targetpickempty', 'No targets selected yet'));
          bar.appendChild(picked);
          const actions = el('div', 'btnrow targetpromptactions');
          if (pd.sel.length >= min) actions.appendChild(btn(
            pd.sel.length ? `Lock ${pd.sel.length} target${pd.sel.length === 1 ? '' : 's'} ✓` : 'Choose no targets ✓',
            () => this.resolvePending(pd.sel.slice()), 'primary'));
          if (pd.sel.length) actions.appendChild(btn('Clear', () => { pd.sel = []; this.render(); }));
          if (min === 0 && !pd.sel.length) actions.appendChild(btn('Skip', () => this.resolvePending([])));
          bar.appendChild(actions);
          break;
        }
        default: {
          bar.appendChild(el('div', 'ptext', esc(q.prompt || '…')));
        }
      }
      return bar;
    }

    // ---------- decision modals ----------
    // ---------- PRIJETNJA: bot je uperio spell/sposobnost u mene ----------
    renderThreatAlert(g, q) {
      const k = q.kind || { icon: '🎯', label: 'Targeting you', cls: 'target', hint: '' };
      const d = q.card.def || {};
      const ov = el('div', 'overlay dark threatov');
      const m = el('div', 'modal threatmodal ' + k.cls);
      ov.appendChild(m);

      m.appendChild(el('div', 'threathead',
        `<span class="threatkind">${k.icon} ${esc(k.label)}</span>
         <span class="threatby">${esc(q.by.name)} ${q.source === 'ability' ? 'activates' : 'casts'} this at you</span>`));

      const body = el('div', 'threatbody');
      body.innerHTML = `
        <img class="threatart" src="${imgURL(q.card.name, true)}" onerror="MTG.imgFail(this)">
        <div class="threatinfo">
          <div class="threatname">${esc(q.card.name)}${q.abilityLabel ? ` <span class="threatab">: ${esc(q.abilityLabel)}</span>` : ''}</div>
          <div class="threatcost">${costHTML(d.cost || '')} <span class="threattype">${esc([(d.super || []).join(' '), (d.types || []).join(' ')].filter(Boolean).join(' '))}${(d.subtypes || []).length ? ' - ' + esc(d.subtypes.join(' ')) : ''}</span></div>
          <div class="threattargets">🎯 Target: <b>${(q.names || []).map(n => esc(n)).join(', ')}</b></div>
          <div class="threatoracle">${esc(d.oracle || '').replace(/\n/g, '<br>')}</div>
          ${k.hint ? `<div class="threathint">💡 ${esc(k.hint)}</div>` : ''}
        </div>`;
      m.appendChild(body);

      const canAnswer = this.myInstantCount(g) > 0;
      const row = el('div', 'btnrow');
      const ok = el('button', 'pbtn primary', 'Got it ▶');
      ok.onclick = () => { this.threatTargets = null; this.resolvePending(null); };
      const hold = el('button', 'pbtn' + (canAnswer ? ' hot' : ''),
        canAnswer ? '⚡ I will respond (HOLD)' : '⚡ HOLD (no response in hand)');
      hold.onclick = () => {
        this.holdNext = true;
        this.threatTargets = null;
        this.toast('🖐️ HOLD armed. The game stops when you receive priority.');
        this.resolvePending(null);
      };
      row.appendChild(ok); row.appendChild(hold);
      m.appendChild(row);
      m.appendChild(el('div', 'threatfoot',
        canAnswer
          ? 'You have cards that can be cast in response. “I will respond” stops at the next priority window.'
          : 'You have no instant-speed response in hand, but HOLD still works for abilities and other actions.'));

      // označi mete na tabli dok je modal otvoren
      this.threatTargets = new Set((q.targets || []).filter(t => t && t.iid).map(t => t.iid));
      return ov;
    }

    myInstantCount(g) {
      if (!this.me) return 0;
      try {
        return g.castableList(this.me).filter(e => {
          const c = e.card;
          return c.is('Instant') || c.kw('flash') || (e.alt && e.alt.flash);
        }).length;
      } catch (e) { return 0; }
    }

    renderDecisionModal(g) {
      const pd = this.pending;
      if (!pd) return null;
      const q = pd.q;
      if (q.type === 'threatAlert') return this.renderThreatAlert(g, q);
      const types = ['mulligan', 'bottomCards', 'chooseCards', 'chooseOption', 'chooseMulti', 'chooseX', 'scry', 'orderTriggers', 'combatReview', 'effectReview', 'chooseManaSources'];
      if (!types.includes(q.type)) return null;
      const ov = el('div', 'overlay');
      const m = el('div', 'modal');
      ov.appendChild(m);
      const btn = (label, fn, cls) => { const b = el('button', 'pbtn ' + (cls || ''), label); b.onclick = fn; return b; };

      if (q.type === 'effectReview') {
        const damage = q.effectKind === 'damageAllOpponents';
        const source = q.source;
        const targets = (q.targets || []).filter(player => player && !player.lost);
        m.classList.add('wide', 'effectreviewmodal', damage ? 'damage' : 'lifeloss');
        m.dataset.testid = 'global-effect-review';
        m.appendChild(el('div', 'effectreviewkicker', damage
          ? '🔥 GLOBAL DAMAGE · ALL OPPONENTS'
          : '☠ GLOBAL LIFE LOSS · ALL OPPONENTS'));
        const hero = el('div', 'effectreviewhero');
        if (source && source.name) {
          hero.innerHTML = `<img src="${imgURL(source.name)}" onerror="MTG.imgFail(this)">` +
            `<div><small>EFFECT SOURCE</small><b>${esc(source.name)}</b><span>${esc(q.controller ? q.controller.name : '')}</span></div>`;
        } else {
          hero.innerHTML = '<div><small>EFFECT SOURCE</small><b>Global effect</b></div>';
        }
        hero.appendChild(el('div', 'effectreviewamount',
          `<strong>${Number(q.amount) || 0}</strong><span>${damage ? 'damage each' : 'life each'}</span>`));
        m.appendChild(hero);
        const victims = el('div', 'effectreviewtargets');
        for (const player of targets) {
          const hit = el('div', 'effectreviewtarget' + (player === this.me ? ' human' : ''));
          hit.innerHTML = `<span>${player === this.me ? 'YOU' : 'OPPONENT'}</span>` +
            `<b>${esc(player.name)}</b><strong>${player.life} ❯ ${Math.max(0, player.life - (Number(q.amount) || 0))}</strong>`;
          victims.appendChild(hit);
        }
        m.appendChild(victims);
        m.appendChild(el('div', 'effectreviewnote', damage
          ? 'The announced damage is shown here. Prevention and replacement effects apply after you confirm.'
          : 'The effect applies to all opponents after you confirm.'));
        m.appendChild(btn('Proceed ▶', () => this.resolvePendingEntry(pd, null), 'primary wide effectproceed'));
        return ov;
      }

      if (q.type === 'chooseManaSources') {
        if (!pd.manaInit) {
          pd.sel = (q.suggested || []).slice();
          pd.manaInit = true;
        }
        m.classList.add('wide', 'manapickmodal');
        m.appendChild(el('div', 'mtitle', `🖐 ${esc(q.prompt || 'Choose mana sources')}`));
        m.appendChild(el('div', 'manapickcost', `Cost: ${costHTML(U.costStr(q.cost))}`));
        const poolText = Object.entries(q.player.pool || {}).filter(([, n]) => n > 0)
          .map(([color, n]) => `${MANA_SYM[color] || color}${n}`).join(' ');
        m.appendChild(el('div', 'manapickhint', poolText
          ? `Mana in your pool (${poolText}) is spent before selected sources. Choose the exact permanents for the rest.`
          : 'Choose the exact lands, mana rocks, Treasure, or convoke/improvise sources you want to use.'));
        const byCard = new Map();
        for (const source of q.sources || []) {
          if (!byCard.has(source.card)) byCard.set(source.card, []);
          byCard.get(source.card).push(source);
        }
        const list = el('div', 'manasourcelist');
        for (const card of q.candidates || []) {
          const selected = pd.sel.includes(card);
          const row = el('button', 'manasourcerow' + (selected ? ' selected' : ''));
          const labels = (byCard.get(card) || []).map(source => manualManaSourceText(source)).join(' · ');
          row.innerHTML = `<span class="manacheck">${selected ? '✓' : ''}</span>` +
            `<img src="${imgURL(card.name)}" onerror="MTG.imgFail(this)">` +
            `<span><b>${esc(card.name)}</b><small>${esc(labels)}${card.tapped ? ' · TAPPED' : ''}</small></span>`;
          row.onclick = () => {
            if (selected) pd.sel.splice(pd.sel.indexOf(card), 1); else pd.sel.push(card);
            this.render();
          };
          list.appendChild(row);
        }
        m.appendChild(list);
        const valid = g.manualManaSelectionSolution(q.player, q.cost, q.forSpell, pd.sel, q.opts || {});
        m.appendChild(el('div', 'manavalid ' + (valid ? 'ok' : 'bad'), valid
          ? `✓ This selection pays the cost with ${pd.sel.length} source${pd.sel.length === 1 ? '' : 's'}.`
          : '⚠ This selection cannot pay the cost exactly yet.'));
        const actions = el('div', 'btnrow');
        const confirm = btn('Tap selected sources ✓', () => this.resolvePendingEntry(pd, { cards: pd.sel.slice() }), 'primary');
        confirm.disabled = !valid;
        actions.appendChild(confirm);
        actions.appendChild(btn('Use automatic mana this time', () => this.resolvePendingEntry(pd, { auto: true })));
        m.appendChild(actions);
        return ov;
      }

      if (q.type === 'combatReview') {
        const attackers = (q.attackers || []).filter(c => c && c.zone === 'battlefield');
        const attacker = q.attackingPlayer || (attackers[0] && attackers[0].ctrl);
        const atMe = attackers.filter(c => c.attacking === this.me || (c.attacking && c.attacking.ctrl === this.me));
        const lanes = new Map();
        for (const card of attackers) {
          const target = card.attacking instanceof MTG.Player ? card.attacking : card.attacking && card.attacking.ctrl;
          if (!target) continue;
          if (!lanes.has(target)) lanes.set(target, []);
          lanes.get(target).push(card);
        }
        m.classList.add('wide', 'combatreviewmodal');
        m.appendChild(el('div', 'combatkicker', 'COMBAT · ATTACKERS DECLARED'));
        m.appendChild(el('div', 'combatreviewhead',
          `<div><b>${esc(attacker ? attacker.name : 'Player')}</b> attacks with ${attackers.length} creature${attackers.length === 1 ? '' : 's'}.</div>` +
          `<span class="${atMe.length ? 'danger' : 'safe'}">${atMe.length ? `${atMe.length} ATTACKING YOU` : 'YOU ARE NOT IN COMBAT'}</span>`));
        const body = el('div', 'combatreviewlanes');
        for (const [target, cards] of lanes) {
          const rawDamage = cards.reduce((sum, card) => sum + g.dmgAmount(card, 'normal'), 0);
          const lane = el('div', 'combatreviewlane' + (target === this.me ? ' tome' : ''));
          const laneHead = el('div', 'combatreviewtarget');
          laneHead.innerHTML = `<div><small>DEFENDER</small><b>${esc(target.name)}</b></div>` +
            `<div class="combatestimate"><strong>${rawDamage}</strong><span>possible damage</span></div>`;
          lane.appendChild(laneHead);
          const grid = el('div', 'combatreviewcards');
          for (const card of cards) {
            const unit = el('button', 'combatreviewcard');
            const kws = ['flying', 'trample', 'menace', 'first strike', 'double strike', 'deathtouch']
              .filter(k => card.kw(k)).join(' · ');
            unit.innerHTML = `<img src="${imgURL(card.name)}" onerror="MTG.imgFail(this)">` +
              `<span><b>${esc(card.name)}</b><strong>${card.power}/${card.toughness}</strong>${kws ? `<small>${esc(kws)}</small>` : ''}</span>`;
            unit.onclick = () => { this.sheet = { card }; this.render(); };
            grid.appendChild(unit);
          }
          lane.appendChild(grid);
          body.appendChild(lane);
        }
        m.appendChild(body);
        m.appendChild(el('div', 'combatreviewnote', atMe.length
          ? 'Review the attackers. After Proceed, attack triggers, priority, and blocker selection follow.'
          : 'This attack is not aimed at you, but combat remains visible and under your control.'));
        m.appendChild(btn('Proceed ▶', () => this.resolvePendingEntry(pd, null), 'primary wide combatproceed'));
        return ov;
      }

      if (q.type === 'orderTriggers') {
        pd.order = pd.order || q.triggers.slice();
        m.classList.add('triggerordermodal');
        m.appendChild(el('div', 'mtitle', esc(q.prompt)));
        m.appendChild(el('div', 'orderhint', 'The first row goes on the bottom; the last row resolves first.'));
        const list = el('div', 'triggerorder');
        pd.order.forEach((tr, index) => {
          const row = el('div', 'triggerorderrow');
          row.appendChild(el('div', 'triggerordern', String(index + 1)));
          row.appendChild(el('div', 'triggerordertext', `<b>${esc(tr.src ? tr.src.name : 'Trigger')}</b><span>${esc(tr.name || 'trigger')}</span>`));
          const controls = el('div', 'triggerordercontrols');
          const up = btn('↑', () => {
            if (index > 0) [pd.order[index - 1], pd.order[index]] = [pd.order[index], pd.order[index - 1]];
            this.render();
          });
          const down = btn('↓', () => {
            if (index < pd.order.length - 1) [pd.order[index + 1], pd.order[index]] = [pd.order[index], pd.order[index + 1]];
            this.render();
          });
          up.disabled = index === 0; down.disabled = index === pd.order.length - 1;
          controls.appendChild(up); controls.appendChild(down); row.appendChild(controls); list.appendChild(row);
        });
        m.appendChild(list);
        m.appendChild(btn('Confirm order', () => this.resolvePending(pd.order.slice()), 'primary wide'));
        return ov;
      }

      if (q.type === 'mulligan') {
        m.appendChild(el('div', 'mtitle', `Opening hand (${q.free ? 'free mulligan' : 'mulligan #' + (q.mulls + 1)})`));
        m.appendChild(this.cardGrid(g, q.player.hand, null));
        const row = el('div', 'btnrow');
        row.appendChild(btn('Keep ✓', () => this.resolvePending(false), 'primary'));
        row.appendChild(btn('Mulligan ↺', () => this.resolvePending(true), 'danger'));
        m.appendChild(row);
        return ov;
      }
      if (q.type === 'bottomCards') {
        m.appendChild(el('div', 'mtitle', `Put ${q.n} on the bottom of your library`));
        m.appendChild(this.cardGrid(g, q.player.hand, { min: q.n, max: q.n }));
        const row = el('div', 'btnrow');
        const b = btn('Confirm ✓', () => { if (pd.sel.length === q.n) this.resolvePending(pd.sel.slice()); }, 'primary');
        row.appendChild(b);
        m.appendChild(row);
        return ov;
      }
      if (q.type === 'chooseCards') {
        m.appendChild(el('div', 'mtitle', esc(q.prompt || 'Choose cards') + ` (${q.min}-${q.max})`));
        m.appendChild(this.cardGrid(g, q.from, { min: q.min, max: q.max }));
        const row = el('div', 'btnrow');
        if (pd.sel.length >= q.min) row.appendChild(btn(`Confirm ✓ (${pd.sel.length})`, () => this.resolvePending(pd.sel.slice()), 'primary'));
        if (q.min === 0) row.appendChild(btn('None', () => this.resolvePending([])));
        // Sigurnosni izlaz: ako ponuda NE MOŽE zadovoljiti minimum (manje
        // karata nego što se traži), prozor ne smije zarobiti igru — vrati
        // prazan izbor, a pozivalac tretira nedovoljan izbor kao odustajanje.
        if (q.min > 0 && (q.from || []).length < q.min) {
          m.appendChild(el('div', 'sidenote', `⚠ Only ${(q.from || []).length} available — the requirement of ${q.min} cannot be met.`));
          row.appendChild(btn('Cancel ✕', () => this.resolvePending([]), 'danger'));
        }
        m.appendChild(row);
        return ov;
      }
      if (q.type === 'chooseOption') {
        m.appendChild(el('div', 'mtitle', esc(q.prompt || 'Choose')));
        for (const o of q.options) {
          m.appendChild(btn(esc(o.label), () => this.resolvePending(o.key), 'wide'));
        }
        return ov;
      }
      if (q.type === 'chooseMulti') {
        m.appendChild(el('div', 'mtitle', esc(q.prompt || 'Choose')));
        const chosen = pd.sel;
        for (const o of q.options) {
          const n = chosen.filter(k => k === o.key).length;
          const b = btn(`${esc(o.label)}${n ? ' ✓' + (n > 1 ? n : '') : ''}`, () => {
            if (q.repeats || !chosen.includes(o.key)) chosen.push(o.key);
            else chosen.splice(chosen.indexOf(o.key), 1);
            if (chosen.length > q.max) chosen.shift();
            this.render();
          }, 'wide' + (n ? ' selected' : ''));
          m.appendChild(b);
        }
        if (chosen.length >= (q.min ?? 1)) m.appendChild(btn('Confirm ✓', () => this.resolvePending(chosen.slice()), 'primary wide'));
        return ov;
      }
      if (q.type === 'chooseX') {
        pd.xVal = pd.xVal === undefined
          ? Math.max(q.min, Math.min(q.max, Number.isFinite(q.suggested) ? q.suggested : q.min))
          : pd.xVal;
        if (q.allocation && q.allocation.kind === 'damage') {
          const allocation = q.allocation;
          const targets = allocation.targets || [];
          const assigned = allocation.assigned || [];
          const current = targets[allocation.index];
          const assignedBefore = assigned.reduce((sum, entry) => sum + (Number(entry.n) || 0), 0);
          const previewAssigned = assignedBefore + pd.xVal;
          m.classList.add('wide', 'damageallocationmodal');
          m.dataset.testid = 'damage-allocation';
          const source = allocation.source || q.src || q.card;
          m.appendChild(el('div', 'damageallocationkicker', '🔥 DIVIDED DAMAGE · LOCK TARGETS'));
          const hero = el('div', 'damageallocationhero');
          hero.innerHTML = source && source.name
            ? `<img src="${imgURL(source.name)}" onerror="MTG.imgFail(this)">` +
              `<div><small>EFFECT SOURCE</small><b>${esc(source.name)}</b><span>${targets.length} target${targets.length === 1 ? '' : 's'} selected</span></div>`
            : '<div><small>EFFECT SOURCE</small><b>Damage effect</b></div>';
          hero.appendChild(el('div', 'damageallocationtotal',
            `<strong>${allocation.total}</strong><span>damage total</span>`));
          m.appendChild(hero);
          m.appendChild(el('div', 'damageallocationprogress',
            `<span style="width:${allocation.total ? Math.min(100, previewAssigned / allocation.total * 100) : 0}%"></span>`));
          const list = el('div', 'damageallocationlist');
          targets.forEach((target, index) => {
            const prior = assigned[index];
            const isCurrent = index === allocation.index;
            const row = el('div', 'damageallocationrow' + (isCurrent ? ' current' : prior ? ' locked' : ' pending'));
            const targetVisual = target instanceof MTG.Player
              ? `<div class="damageplayericon">${esc((MTG.DECK_META[target.deckName] || {}).icon || '♟')}</div>`
              : `<img src="${imgURL(target.name)}" onerror="MTG.imgFail(this)">`;
            const targetMeta = target instanceof MTG.Player
              ? `${target.life} life · player`
              : target.is && target.is('Creature') ? `${target.power}/${target.toughness} · ${esc(target.ctrl && target.ctrl.name || '')}` : esc(target.ctrl && target.ctrl.name || 'permanent');
            const shown = prior ? prior.n : isCurrent ? pd.xVal : null;
            row.innerHTML = `<span class="damagetargetnumber">${index + 1}</span>${targetVisual}` +
              `<div class="damagetargetinfo"><b>${esc(target.name)}</b><small>${targetMeta}</small></div>` +
              `<div class="damageamount${shown === null ? ' waiting' : ''}"><strong>${shown === null ? '—' : shown}</strong><span>${shown === 1 ? 'damage' : 'damage'}</span></div>`;
            if (isCurrent) {
              const controls = el('div', 'damagecontrols');
              const minus = btn('−', () => { pd.xVal = Math.max(q.min, pd.xVal - 1); this.render(); });
              const plus = btn('+', () => { pd.xVal = Math.min(q.max, pd.xVal + 1); this.render(); });
              minus.disabled = pd.xVal <= q.min;
              plus.disabled = pd.xVal >= q.max;
              controls.appendChild(minus); controls.appendChild(plus);
              row.appendChild(controls);
            }
            list.appendChild(row);
          });
          m.appendChild(list);
          const remainingAfter = allocation.left - pd.xVal;
          m.appendChild(el('div', 'damageallocationsummary',
            `<span><b>${previewAssigned}/${allocation.total}</b> assigned in this preview</span>` +
            `<span><b>${remainingAfter}</b> left for ${Math.max(0, targets.length - allocation.index - 1)} target${targets.length - allocation.index - 1 === 1 ? '' : 's'}</span>`));
          m.appendChild(el('div', 'damageallocationnote',
            allocation.index === targets.length - 1
              ? 'This is the complete damage split. Confirm to lock it on the stack.'
              : 'Every selected target must receive at least 1 damage. The remaining amount stays reserved for later targets.'));
          const label = allocation.index === targets.length - 1
            ? `Lock complete split · ${allocation.total} damage ✓`
            : `Assign ${pd.xVal} to target ${allocation.index + 1} ▶`;
          m.appendChild(btn(label, () => this.resolvePending(pd.xVal), 'primary wide damageconfirm'));
          return ov;
        }
        m.appendChild(el('div', 'mtitle', esc(q.prompt || 'Choose X') + ` (${q.min}-${q.max})`));
        const xrow = el('div', 'xrow');
        const minus = btn('−', () => { pd.xVal = Math.max(q.min, pd.xVal - 1); this.render(); });
        const plus = btn('+', () => { pd.xVal = Math.min(q.max, pd.xVal + 1); this.render(); });
        xrow.appendChild(minus);
        xrow.appendChild(el('div', 'xval', String(pd.xVal)));
        xrow.appendChild(plus);
        m.appendChild(xrow);
        m.appendChild(btn(`Confirm X=${pd.xVal} ✓`, () => this.resolvePending(pd.xVal), 'primary wide'));
        return ov;
      }
      if (q.type === 'scry') {
        pd.scryState = pd.scryState || q.cards.map(() => 'top');
        pd.scryOrder = pd.scryOrder || q.cards.slice();
        m.appendChild(el('div', 'mtitle', esc(q.prompt || 'Scry') + ': click to switch top/bottom'));
        m.appendChild(el('div', 'orderhint', 'Arrows change the order. TOP: the first card is drawn first. BOTTOM: the first card is deepest.'));
        const grid = el('div', 'cardgrid');
        pd.scryOrder.forEach((c, orderIndex) => {
          const i = q.cards.indexOf(c);
          const cc = this.bigCardEl(c);
          cc.classList.add(pd.scryState[i] === 'top' ? 'scrytop' : 'scrybottom');
          cc.appendChild(el('div', 'scrylabel', pd.scryState[i] === 'top' ? 'TOP' : 'BOTTOM'));
          cc.onclick = () => { pd.scryState[i] = pd.scryState[i] === 'top' ? 'bottom' : 'top'; this.render(); };
          const controls = el('div', 'triggerordercontrols');
          const left = btn('←', event => {
            event.stopPropagation();
            if (orderIndex > 0) [pd.scryOrder[orderIndex - 1], pd.scryOrder[orderIndex]] = [pd.scryOrder[orderIndex], pd.scryOrder[orderIndex - 1]];
            this.render();
          });
          const right = btn('→', event => {
            event.stopPropagation();
            if (orderIndex < pd.scryOrder.length - 1) [pd.scryOrder[orderIndex + 1], pd.scryOrder[orderIndex]] = [pd.scryOrder[orderIndex], pd.scryOrder[orderIndex + 1]];
            this.render();
          });
          left.disabled = orderIndex === 0; right.disabled = orderIndex === pd.scryOrder.length - 1;
          controls.appendChild(left); controls.appendChild(right); cc.appendChild(controls);
          grid.appendChild(cc);
        });
        m.appendChild(grid);
        m.appendChild(btn('Confirm ✓', () => {
          const top = [], bottom = [];
          pd.scryOrder.forEach(c => {
            const i = q.cards.indexOf(c);
            (pd.scryState[i] === 'top' ? top : bottom).push(c);
          });
          this.resolvePending({ top, bottom });
        }, 'primary wide'));
        return ov;
      }
      return null;
    }

    cardGrid(g, cards, selOpts) {
      const pd = this.pending;
      const grid = el('div', 'cardgrid');
      for (const c of cards) {
        const cc = this.bigCardEl(c);
        if (selOpts) {
          if (pd.sel.includes(c)) cc.classList.add('selected');
          cc.onclick = () => {
            if (pd.sel.includes(c)) pd.sel.splice(pd.sel.indexOf(c), 1);
            else {
              pd.sel.push(c);
              if (pd.sel.length > selOpts.max) pd.sel.shift();
            }
            this.render();
          };
        }
        grid.appendChild(cc);
      }
      return grid;
    }

    bigCardEl(c) {
      const cc = el('div', 'bigcard');
      const shown = c instanceof MTG.CardInst ? this.visibleFaceDownDef(c) : null;
      const hidden = c instanceof MTG.CardInst && c.faceDown && !shown;
      const name = hidden ? 'Face-down card' : (shown ? shown.name : (c.name || (c.card && c.card.name) || '?'));
      const faceDownNote = c instanceof MTG.CardInst && c.faceDown && shown ? ' · FACE-DOWN (vidljivo tebi)' : '';
      cc.innerHTML = `
        <img loading="lazy" src="${hidden ? MTG.BLANK_PX : imgURL(name)}" onerror="MTG.imgFail(this,'noimg')">
        <div class="bcname">${esc(name + faceDownNote)}</div>`;
      return cc;
    }

    // ---------- targeting ----------
    isCandidate(x) {
      if (this.manualPick) {
        if (x instanceof MTG.Player) return this.manualPick.players !== false;
        return x instanceof MTG.CardInst && x.zone === 'battlefield';
      }
      const pd = this.pending;
      if (!pd || pd.q.type !== 'chooseTargets') return false;
      if (pd.q.spec && pd.q.spec.distinctCtrl && x && x.ctrl && pd.sel.some(s => s !== x && s.ctrl === x.ctrl)) return false;
      return pd.sel.length < pd.q.max && pd.q.candidates.includes(x) && !pd.sel.includes(x);
    }
    selectedTargetIndex(x) {
      const pd = this.pending;
      if (!pd || pd.q.type !== 'chooseTargets') return -1;
      return pd.sel.indexOf(x);
    }
    markSelectedTarget(node, target) {
      const index = this.selectedTargetIndex(target);
      if (index < 0) return false;
      node.classList.add('target-selected');
      node.dataset.targetNumber = String(index + 1);
      node.setAttribute('aria-label', `Target ${index + 1}: ${target.name || 'selected target'}`);
      node.appendChild(el('div', 'targetorderbadge', `<span>🎯</span><b>${index + 1}</b>`));
      node.onclick = () => this.removeTargetCandidate(target);
      return true;
    }
    removeTargetCandidate(target) {
      const pd = this.pending;
      if (!pd || pd.q.type !== 'chooseTargets') return;
      const index = pd.sel.indexOf(target);
      if (index >= 0) pd.sel.splice(index, 1);
      this.render();
    }
    pickCandidate(x) {
      if (this.manualPick) {
        const mp = this.manualPick;
        this.manualPick = null;
        Promise.resolve(mp.cb(x)).then(() => this.queueRender());
        this.render();
        return;
      }
      const pd = this.pending;
      if (!pd) return;
      if (pd.sel.includes(x)) { this.removeTargetCandidate(x); return; }
      if (pd.sel.length >= pd.q.max) return;
      if (pd.q.type === 'chooseTargets' && pd.q.spec && pd.q.spec.distinctCtrl && x && x.ctrl && pd.sel.some(s => s.ctrl === x.ctrl)) return;
      pd.sel.push(x);
      this.render();
    }

    startManualPick(label, cb, opts = {}) {
      this.showJudge = false;
      this.manualPick = { label, cb, players: opts.players };
      this.render();
      this.toast('🎯 ' + label + ': click a target');
    }

    // ---------- DECLARE BLOCKERS — veliki pregledni prozor ----------
    // Svaki napadač je "lane" sa slikom, P/T, keywordima i predviđenim ishodom
    // bloka. Ispod su svi tvoji slobodni blokeri. Klik na lane → klik na
    // blokera. "Show battlefield" privremeno skloni prozor i vrati stari tok.
    blockOutcome(g, attacker, blockers) {
      const atkPow = Math.max(0, g.dmgAmount(attacker, 'normal'));
      const totalBlockPow = blockers.reduce((sum, b) => sum + Math.max(0, g.dmgAmount(b, 'normal')), 0);
      const attackerDies = blockers.length > 0 && (
        totalBlockPow >= Math.max(1, attacker.toughness - attacker.damage) ||
        blockers.some(b => b.kw('deathtouch') && g.dmgAmount(b, 'normal') > 0));
      const dying = [];
      let rem = atkPow;
      const ordered = blockers.slice().sort((x, y) => (x.toughness - x.damage) - (y.toughness - y.damage));
      for (const b of ordered) {
        const lethal = attacker.kw('deathtouch') ? 1 : Math.max(1, b.toughness - b.damage);
        if (rem >= lethal) { dying.push(b); rem -= lethal; } else break;
      }
      const trampleThrough = attacker.kw('trample') ? Math.max(0, rem) : 0;
      return { attackerDies, dying, trampleThrough };
    }

    renderBlockersModal(g) {
      const pd = this.pending;
      if (!pd || pd.q.type !== 'blockers' || pd.boardPeek) return null;
      const q = pd.q;
      if (!pd.mode && q.attackers.length) pd.mode = q.attackers[0];
      const KW = ['flying', 'trample', 'menace', 'first strike', 'double strike', 'deathtouch', 'lifelink'];
      const assignedTo = attacker => [...pd.assigns.entries()].filter(([, a]) => a === attacker).map(([b]) => b);
      const ov = el('div', 'overlay dark blockov');
      const m = el('div', 'modal blockmodal');
      ov.appendChild(m);
      m.dataset.testid = 'blockers-modal';

      const attackerName = q.attackers[0] && q.attackers[0].ctrl ? q.attackers[0].ctrl.name : 'Opponent';
      m.appendChild(el('div', 'combatkicker', 'COMBAT · DECLARE BLOCKERS'));
      let unblockedDamage = 0;
      for (const a of q.attackers) {
        if (!assignedTo(a).length) unblockedDamage += Math.max(0, g.dmgAmount(a, 'normal')) * (a.kw('double strike') ? 2 : 1);
        else unblockedDamage += this.blockOutcome(g, a, assignedTo(a)).trampleThrough * (a.kw('double strike') ? 2 : 1);
      }
      const me = this.me;
      m.appendChild(el('div', 'blockhead',
        `<div><b>${esc(attackerName)}</b> attacks you with ${q.attackers.length} creature${q.attackers.length === 1 ? '' : 's'}.</div>` +
        `<div class="blockdmg ${unblockedDamage >= me.life ? 'lethal' : unblockedDamage > 0 ? 'warn' : 'safe'}">` +
        `Unblocked damage: <strong>${unblockedDamage}</strong> · your life: <strong>${me.life}</strong>` +
        `${unblockedDamage >= me.life ? ' · ☠️ LETHAL WITHOUT BLOCKS' : ''}</div>`));

      const lanes = el('div', 'blocklanes');
      for (const a of q.attackers) {
        const mine = assignedTo(a);
        const outcome = this.blockOutcome(g, a, mine);
        const lane = el('div', 'blocklane' + (pd.mode === a ? ' sel' : ''));
        const kws = KW.filter(k => a.kw(k)).join(' · ');
        const hitTarget = a.attacking === me ? 'YOU' : (a.attacking && a.attacking.name ? a.attacking.name : 'you');
        let outcomeText;
        if (!mine.length) {
          const dmg = Math.max(0, g.dmgAmount(a, 'normal')) * (a.kw('double strike') ? 2 : 1);
          outcomeText = `<span class="bo warn">UNBLOCKED → ${esc(hitTarget)} take${hitTarget === 'YOU' ? '' : 's'} ${dmg}</span>`;
        } else {
          const parts = [];
          parts.push(outcome.attackerDies ? '<span class="bo good">attacker dies</span>' : '<span class="bo">attacker survives</span>');
          if (outcome.dying.length) parts.push(`<span class="bo bad">${esc(outcome.dying.map(b => b.name).join(', '))} ${outcome.dying.length === 1 ? 'dies' : 'die'}</span>`);
          if (outcome.trampleThrough > 0) parts.push(`<span class="bo warn">trample: ${outcome.trampleThrough} through</span>`);
          outcomeText = parts.join(' ');
        }
        lane.innerHTML = `
          <img src="${imgURL(a.name)}" onerror="MTG.imgFail(this)">
          <div class="blocklaneinfo">
            <b>${esc(a.name)}</b>
            <span>${a.power}/${a.toughness}${kws ? ' · ' + esc(kws) : ''}</span>
            <div class="blockassigned">${mine.length
              ? mine.map(b => `<span class="blockchip" data-biid="${b.iid}">🛡 ${esc(b.name)} <i>×</i></span>`).join('')
              : '<span class="blocknone">no blockers — click this row, then a blocker below</span>'}</div>
            <div class="blockoutcome">${outcomeText}</div>
          </div>`;
        lane.onclick = ev => {
          const chip = ev.target.closest('.blockchip');
          if (chip) {
            const b = mine.find(x => String(x.iid) === chip.dataset.biid);
            if (b) { pd.assigns.delete(b); this.render(); return; }
          }
          pd.mode = a; this.render();
        };
        lanes.appendChild(lane);
      }
      m.appendChild(lanes);

      m.appendChild(el('div', 'mtitle small blockyourstitle',
        pd.mode ? `Your untapped creatures — click to block <b>${esc(pd.mode.name)}</b>:` : 'Your untapped creatures:'));
      const row = el('div', 'blockcandidates');
      for (const b of q.potential) {
        const assigned = pd.assigns.get(b);
        const canNow = pd.mode ? g.canBlock(b, pd.mode) : true;
        const bkws = KW.concat(['reach', 'defender']).filter(k => b.kw(k)).join(' · ');
        const cell = el('button', 'blockcand' + (assigned ? ' assigned' : '') + (!canNow && !assigned ? ' cant' : ''));
        cell.innerHTML = `
          <img src="${imgURL(b.name)}" onerror="MTG.imgFail(this)">
          <span><b>${esc(b.name)}</b><small>${b.power}/${b.toughness}${bkws ? ' · ' + esc(bkws) : ''}</small>
          ${assigned ? `<i class="assignedto">🛡 blocks ${esc(assigned.name)}</i>` : ''}</span>`;
        cell.onclick = () => {
          if (assigned) { pd.assigns.delete(b); this.render(); return; }
          if (!pd.mode) { this.toast('First click the attacker row you want to block.'); return; }
          if (!g.canBlock(b, pd.mode)) { this.toast(`${b.name} cannot block ${pd.mode.name} (flying, menace, or another restriction).`); return; }
          pd.assigns.set(b, pd.mode);
          this.render();
        };
        row.appendChild(cell);
      }
      if (!q.potential.length) row.appendChild(el('div', 'emptyrow', 'You have no creatures able to block.'));
      m.appendChild(row);

      // menace upozorenje
      const menaceBroken = q.attackers.filter(a => a.kw('menace') && assignedTo(a).length === 1);
      if (menaceBroken.length) {
        m.appendChild(el('div', 'blockmenacewarn',
          `👿 Menace: ${esc(menaceBroken.map(a => a.name).join(', '))} needs at least TWO blockers — a single block will be ignored.`));
      }

      const foot = el('div', 'btnrow blockfoot');
      const blocks = [];
      for (const [b, a] of pd.assigns) blocks.push({ blocker: b, attacker: a });
      const peek = el('button', 'pbtn', '🗺 Show battlefield');
      peek.onclick = () => { pd.boardPeek = true; this.render(); };
      foot.appendChild(peek);
      const confirm = el('button', 'pbtn primary', blocks.length ? `Confirm blocks (${blocks.length}) ✓` : 'No blocks ▶');
      confirm.onclick = () => this.resolvePending(blocks);
      foot.appendChild(confirm);
      m.appendChild(foot);
      return ov;
    }

    renderAttackTargetPopup(g) {
      const pd = this.pending;
      const attacker = this.attackPicker;
      if (!pd || pd.q.type !== 'attackers' || !attacker || !pd.q.eligible.includes(attacker)) {
        this.attackPicker = null;
        return null;
      }
      const selected = pd.sel.find(s => s.card === attacker);
      const ov = el('div', 'overlay dark attackpickov');
      const modal = el('div', 'modal attackpickmodal');
      ov.appendChild(modal);
      ov.onclick = e => { if (e.target === ov) { this.attackPicker = null; this.render(); } };

      modal.appendChild(el('div', 'combatkicker', 'DECLARE ATTACKER'));
      modal.appendChild(el('div', 'attackpicktitle', 'Who does <b>' + esc(attacker.name) + '</b> attack?'));
      const body = el('div', 'attackpickbody');
      const card = el('div', 'attackpickcard');
      const keywords = ['flying', 'trample', 'menace', 'first strike', 'double strike', 'deathtouch', 'lifelink']
        .filter(k => attacker.kw(k));
      card.innerHTML = `<img src="${imgURL(attacker.name, true)}" onerror="MTG.imgFail(this)">` +
        `<div><b>${esc(attacker.name)}</b><span>${attacker.power}/${attacker.toughness}</span>` +
        `<small>${keywords.length ? esc(keywords.join(' · ')) : 'no combat keywords'}</small></div>`;
      body.appendChild(card);

      const choices = el('div', 'attacktargets');
      const forced = (pd.q.forced || []).includes(attacker);
      const diplomacyTargets = g.diplomacyAttackTargetsFor
        ? g.diplomacyAttackTargetsFor(attacker, pd.q.opponents, forced)
        : pd.q.opponents;
      for (const target of diplomacyTargets) {
        const creatures = g.creatures(target);
        const blockers = creatures.filter(c => !c.tapped && !c.cur.cantBlock && g.canBlock(c, attacker));
        const option = el('button', 'attacktarget' + (selected && selected.target === target ? ' selected' : ''));
        const meta = MTG.DECK_META[target.deckName] || {};
        option.innerHTML = `<span class="attacktargeticon">${meta.icon || '🛡️'}</span>` +
          `<span class="attacktargetmain"><b>${esc(target.name)}</b><small>${esc(target.deckName || '')}</small></span>` +
          `<span class="attacktargetstats"><strong>${target.life}❤</strong><small>${blockers.length} possible blocker${blockers.length === 1 ? '' : 's'} · ✋${target.hand.length}</small></span>` +
          `<span class="attacktargetgo">→</span>`;
        option.onclick = () => {
          if (selected) selected.target = target;
          else pd.sel.push({ card: attacker, target });
          this.attackPicker = null;
          this.render();
        };
        choices.appendChild(option);
      }
      if (!diplomacyTargets.length) choices.appendChild(el('div', 'emptyrow', 'Every legal defender is protected by an active agreement.'));
      body.appendChild(choices);
      modal.appendChild(body);
      const foot = el('div', 'attackpickfoot');
      if (selected) {
        const remove = el('button', 'pbtn danger', 'Do not attack');
        remove.onclick = () => {
          pd.sel.splice(pd.sel.indexOf(selected), 1);
          this.attackPicker = null;
          this.render();
        };
        foot.appendChild(remove);
      }
      const cancel = el('button', 'pbtn', 'Cancel');
      cancel.onclick = () => { this.attackPicker = null; this.render(); };
      foot.appendChild(cancel);
      modal.appendChild(foot);
      return ov;
    }

    toggleAttacker(c) {
      const pd = this.pending;
      if (!pd || pd.q.type !== 'attackers' || !pd.q.eligible.includes(c)) return;
      this.attackPicker = c;
      this.render();
    }

    assignBlocker(b) {
      const pd = this.pending;
      if (pd.assigns.has(b)) { pd.assigns.delete(b); this.render(); return; }
      const a = pd.mode || pd.q.attackers[0];
      if (!a) return;
      if (!this.game.canBlock(b, a)) { this.toast('Cannot block because of flying, menace, or another restriction.'); return; }
      pd.assigns.set(b, a);
      this.render();
    }

    // ---------- card sheet ----------
    renderCardSheet(g) {
      const { card } = this.sheet;
      const ov = el('div', 'overlay');
      ov.onclick = (e) => { if (e.target === ov) { this.sheet = null; this.render(); } };
      // sheet bez karte (npr. The Ring emblem)
      if (this.sheet.custom) {
        const cm = el('div', 'sheet');
        const ci = el('div', 'sheetinfo');
        ci.innerHTML = `<div class="sname">${this.sheet.custom.title}</div><div class="soracle">${this.sheet.custom.body}</div>`;
        cm.appendChild(ci);
        const cb = el('button', 'pbtn wide', 'Close');
        cb.onclick = () => { this.sheet = null; this.render(); };
        cm.appendChild(cb);
        ov.appendChild(cm);
        return ov;
      }
      const m = el('div', 'sheet');
      ov.appendChild(m);
      const visibleFaceDownDef = this.visibleFaceDownDef(card);
      const mayLookFaceDown = !!visibleFaceDownDef;
      const hiddenFaceDown = card.faceDown && !mayLookFaceDown;
      const shownDef = hiddenFaceDown
        ? { name: 'Face-down card', cost: null, super: [], types: ['Card'], subtypes: [], oracle: 'The identity of this card is unknown.' }
        : (mayLookFaceDown ? visibleFaceDownDef : card.def);
      const shownName = shownDef.name;
      const img = el('img', 'sheetimg');
      img.src = card.faceDown && !mayLookFaceDown ? MTG.BLANK_PX : imgURL(shownName, true);
      img.onerror = () => img.classList.add('noimg');
      m.appendChild(img);
      const info = el('div', 'sheetinfo');
      const typeLine = [(shownDef.super || []).join(' '), shownDef.types.join(' '), shownDef.subtypes.length ? '- ' + shownDef.subtypes.join(' ') : ''].join(' ');
      const faceDownLabel = card.zone === 'battlefield' ? 'FACE-DOWN 2/2' : 'FACE-DOWN EXILE';
      info.innerHTML = `${card.faceDown ? `<div class="facedownsheet">🃏 ${faceDownLabel}${mayLookFaceDown ? ' · only you can see its identity' : ''}</div>` : ''}` +
        `<div class="sname">${esc(shownName)} ${costHTML(shownDef.cost || '')}</div>
        <div class="stype">${esc(typeLine)}</div>
        ${card.is('Creature') && card.cur ? `<div class="spt">${card.power}/${card.toughness}${card.tapped ? ' · TAPPED' : ''}${Object.entries(card.counters).filter(([k, v]) => v > 0).map(([k, v]) => ` · ${v}×${k}`).join('')}</div>` : ''}
        <div class="soracle">${esc(shownDef.oracle || '').replace(/\n/g, '<br>')}</div>
        ${shownDef.simplified ? `<div class="simplified">⚠️ ${esc(shownDef.simplified)}</div>` : ''}`;
      m.appendChild(info);
      // actions
      const acts = el('div', 'sheetacts');
      const pd = this.pending;
      if (pd && (pd.q.type === 'main' || pd.q.type === 'priority')) {
        const q = pd.q;
        for (const e of (q.casts || [])) {
          if (e.card !== card) continue;
          const cost = g.spellCost(card.owner, card, e.alt ? Object.assign({}, e.alt) : {});
          let label = e.alt ? (e.alt.adventure ? `Adventure: ${e.alt.name} ${U.costStr(U.parseCost(e.alt.cost || ''))}` : (e.alt.label || 'Alternative cost')) : `Cast ${U.costStr(cost)}`;
          if (e.from === 'command') label += ' (commander)';
          if (e.from === 'graveyard') label += ' (from graveyard)';
          if (e.from === 'exile') label = 'Play from exile' + (e.alt && e.alt.free ? ' (free)' : '');
          const b = el('button', 'pbtn primary wide', esc(label));
          b.onclick = () => { this.sheet = null; this.resolvePending({ kind: 'cast', card, alt: e.alt, from: e.from }); };
          acts.appendChild(b);
        }
        for (const l of (q.lands || [])) {
          if (l !== card) continue;
          const b = el('button', 'pbtn primary wide', 'Play land');
          b.onclick = () => { this.sheet = null; this.resolvePending({ kind: 'land', card }); };
          acts.appendChild(b);
        }
        const usedAbilities = new Set();
        for (const a of (q.acts || [])) {
          if (a.card !== card) continue;
          if (a.ability) usedAbilities.add(a.ability);
          let label = a.turnFaceUp ? a.label : a.manaAbility ? a.label : a.handAbility ? card.def.handAbility.label :
            a.gyAbility ? (a.gyAbilityOverride || card.def.gyAbility).label : a.cycling ? 'Cycling' : a.plot ? `Plot ${U.costStr(U.parseCost(card.def.plot))}` : a.suspend ? 'Suspend' :
            a.equip ? `Equip ${U.costStr(U.parseCost(card.def.equip))}` : a.crew ? `Crew ${card.def.crew}` :
              (a.ability && a.ability.label) || 'Activate';
          const b = el('button', 'pbtn wide', (a.turnFaceUp ? '🃏 ' : a.manaAbility ? '⚡ ' : '⚙️ ') + esc(label));
          b.onclick = () => { this.sheet = null; this.resolvePending({ kind: 'activate', entry: a }); };
          acts.appendChild(b);
        }
        // show unavailable abilities greyed-out, so igrač vidi šta karta može
        if (card.zone === 'battlefield' && card.ctrl === this.me && card.def.abilities) {
          for (const ab of card.def.abilities) {
            if (usedAbilities.has(ab) || !ab.label) continue;
            const b = el('button', 'pbtn wide disabled', `⚙️ ${esc(ab.label)}: unavailable now`);
            b.disabled = true;
            acts.appendChild(b);
          }
        }
        if (card.zone === 'command' && !(q.casts || []).some(e => e.card === card)) {
          const cost = g.spellCost(card.owner, card, {});
          const b = el('button', 'pbtn wide disabled', `Cast ${U.costStr(cost)}: not enough mana or not your main phase`);
          b.disabled = true;
          acts.appendChild(b);
        }
      }
      const close = el('button', 'pbtn wide', 'Close');
      close.onclick = () => { this.sheet = null; this.render(); };
      acts.appendChild(close);
      m.appendChild(acts);
      return ov;
    }

    renderPlayerSheet(g) {
      const p = this.playerSheet;
      const ov = el('div', 'overlay');
      ov.onclick = (e) => { if (e.target === ov) { this.playerSheet = null; this.render(); } };
      const m = el('div', 'sheet tall');
      ov.appendChild(m);
      const meta = MTG.DECK_META[p.deckName] || {};
      const rows = MTG.cmdDamageRows(g, p);
      const summed = !!(g.houseRules && g.houseRules.sumPartnerDamage);
      const cmdDmg = rows.length ? rows.map(r => {
        const pct = Math.min(100, Math.round(r.n / 21 * 100));
        return `<div class="cdrow" title="${esc(r.detail || '')}"><span>${esc(r.label)}</span>
          <span class="cdbar"><span class="cdfill${r.n >= 15 ? ' hot' : ''}" style="width:${pct}%"></span></span>
          <b>${r.n}/21</b></div>`;
      }).join('') : '<div class="cdnone">None yet.</div>';
      m.appendChild(el('div', 'mtitle', `${meta.icon || ''} ${esc(p.name)}: ${esc(p.deckName)} · ${p.life}❤${p.lost ? ' · ☠️ ELIMINATED' : ''}`));
      const own = (p.commanders && p.commanders.length) ? p.commanders : p.command;
      if (own.length) {
        const ZN = { battlefield: 'battlefield', command: 'CZ', graveyard: 'graveyard', exile: 'exile', hand: 'hand', library: 'library', stack: 'stack' };
        m.appendChild(el('div', 'cmdhint',
          `👑 Commander${own.length > 1 ? 's (partners)' : ''}: ` +
          own.map(c => `<b>${esc(c.name)}</b> <span style="color:#8a95a8">(${ZN[c.zone] || c.zone}${c.cmdCasts ? `, tax +${2 * c.cmdCasts}` : ''})</span>`).join(' · ')));
      }
      m.appendChild(el('div', 'cmddmg',
        `<b>Commander damage received (21 = loss):</b>` +
        (summed
          ? `<div class="cdnote">🏠 House rule: partner damage is COMBINED by owner.</div>`
          : `<div class="cdnote">Rule 903.10a: each commander tracks its own 21 damage. Partners are not combined.</div>`) +
        cmdDmg));
      const zrow = el('div', 'btnrow');
      for (const z of ['graveyard', 'exile']) {
        const b = el('button', 'pbtn', `${z === 'graveyard' ? '🪦' : '🌀'} ${p[z].length}`);
        b.onclick = () => { this.playerSheet = null; this.zoneBrowse = { player: p, zone: z }; this.render(); };
        zrow.appendChild(b);
      }
      m.appendChild(zrow);
      m.appendChild(el('div', 'mtitle small', 'Battlefield'));
      const grid = el('div', 'cardgrid');
      for (const c of g.bf().filter(c => c.ctrl === p)) {
        const cc = this.miniCard(g, c);
        grid.appendChild(cc);
      }
      if (!g.bf().some(c => c.ctrl === p)) grid.appendChild(el('div', 'emptyrow', 'Empty'));
      m.appendChild(grid);
      const close = el('button', 'pbtn wide', 'Close');
      close.onclick = () => { this.playerSheet = null; this.render(); };
      m.appendChild(close);
      return ov;
    }

    renderZoneBrowser(g) {
      const { player, zone } = this.zoneBrowse;
      const ov = el('div', 'overlay');
      ov.onclick = (e) => { if (e.target === ov) { this.zoneBrowse = null; this.render(); } };
      const m = el('div', 'sheet tall');
      ov.appendChild(m);
      const names = { graveyard: 'Graveyard', exile: 'Exile', command: 'Command zone' };
      m.appendChild(el('div', 'mtitle', `${esc(player.name)}: ${names[zone] || zone} (${player[zone].length})`));
      const grid = el('div', 'cardgrid');
      const judgeReturn = this.zoneBrowse.judgeReturn;
      const pd = this.pending;
      const actionQ = pd && (pd.q.type === 'main' || pd.q.type === 'priority') ? pd.q : null;
      for (const c of player[zone]) {
        const cc = this.bigCardEl(c);
        if (judgeReturn) {
          cc.classList.add('targetable');
          cc.onclick = async () => {
            this.zoneBrowse = null;
            await g.move(c, 'battlefield', { ctrl: player });
            g.lg('⚒️ ručno: ' + c.name + ' vraćen na tablu.');
            this.queueRender();
          };
        } else if (this.isCandidate(c)) { cc.classList.add('targetable'); cc.onclick = () => { this.zoneBrowse = null; this.pickCandidate(c); }; }
        else {
          const playableNow = !!actionQ &&
            ((actionQ.casts || []).some(entry => entry.card === c) || (actionQ.lands || []).includes(c));
          cc.classList.add('inspectable');
          if (playableNow) {
            cc.classList.add('castable');
            cc.appendChild(el('div', 'zoneplay', 'PLAY ▶'));
          }
          cc.onclick = () => {
            this.zoneBrowse = null;
            this.sheet = { card: c };
            this.render();
          };
        }
        grid.appendChild(cc);
      }
      if (!player[zone].length) grid.appendChild(el('div', 'emptyrow', 'Empty'));
      m.appendChild(grid);
      const close = el('button', 'pbtn wide', 'Close');
      close.onclick = () => { this.zoneBrowse = null; this.render(); };
      m.appendChild(close);
      return ov;
    }

    renderLog(g) {
      const ov = el('div', 'logpanel');
      const head = el('div', 'mtitle', '📜 Game log');
      ov.appendChild(head);
      if (g.aiDecisionLog && g.aiDecisionLog.length) {
        const aiBox = el('div', 'logbox');
        aiBox.appendChild(el('div', 'logline effect', '<b>🧠 AI V2: latest decisions</b>'));
        for (const decision of g.aiDecisionLog.slice(-5).reverse()) {
          const alternatives = (decision.alternatives || []).slice(0, 2)
            .map(alt => `${esc(alt.action)} ${Number(alt.score).toFixed(1)}`).join(' · ');
          aiBox.appendChild(el('div', 'logline',
            `<span class="lt">[${decision.turn}]</span> <b>${esc(decision.playerName)}</b>: ${esc(decision.chosen)} ` +
            `(${Number(decision.score).toFixed(1)}) · ${decision.analyzedNodes} nodes / d${decision.reachedDepth}` +
            `${decision.fallback ? ' · FALLBACK' : ''}${alternatives ? `<br><small>${alternatives}</small>` : ''}`));
        }
        ov.appendChild(aiBox);
      }
      const box = el('div', 'logbox');
      for (let i = g.log.length - 1; i >= Math.max(0, g.log.length - 250); i--) {
        const e = g.log[i];
        box.appendChild(el('div', 'logline ' + (e.cls || ''), `<span class="lt">[${e.t}]</span> ${esc(e.msg)}`));
      }
      ov.appendChild(box);
      const close = el('button', 'pbtn wide', 'Close');
      close.onclick = () => { this.showLog = false; this.render(); };
      ov.appendChild(close);
      return ov;
    }

    renderJudge(g) {
      const ov = el('div', 'overlay');
      ov.onclick = (e) => { if (e.target === ov) { this.showJudge = false; this.render(); } };
      const m = el('div', 'sheet tall');
      ov.appendChild(m);
      const me = this.me;
      const pd = this.pending;
      if (pd && pd.q.type === 'manualResolve') {
        const c = pd.q.card;
        m.appendChild(el('div', 'mtitle', `⚒️ ${esc(c.name)}`));
        m.appendChild(el('div', 'soracle', esc(c.def.oracle || '').replace(/\n/g, '<br>')));
        m.appendChild(el('div', 'importnote', 'Perform the card instructions with the controls below, then click "Done".'));
      } else {
        m.appendChild(el('div', 'mtitle', '⚒️ Judge panel: manual actions'));
      }
      const grid = el('div', 'judgegrid');
      const jb = (label, fn) => {
        const b = el('button', 'pbtn', label);
        b.onclick = () => fn();
        grid.appendChild(b);
      };
      const askN = (def) => {
        const v = window.prompt('How many?', String(def || 1));
        const n = parseInt(v, 10);
        return isNaN(n) ? null : n;
      };
      const log = (msg) => { g.lg('⚒️ manual: ' + msg); };

      jb('🎴 Draw a card', async () => { await g.draw(me, 1); log('draw 1'); this.queueRender(); });
      jb('💥 Damage a target…', () => {
        const n = askN(3); if (n === null) return;
        this.startManualPick(`${n} damage`, async (t) => { await g.damageAny(null, t, n); log(`${n} damage`); });
      });
      jb('☠️ Destroy a target…', () => {
        this.startManualPick('Destroy', async (t) => { if (t instanceof MTG.CardInst) { await g.destroy(t); log('destroyed: ' + t.name); } }, { players: false });
      });
      jb('🌀 Exile a target…', () => {
        this.startManualPick('Exile', async (t) => { if (t instanceof MTG.CardInst) { await g.exileCard(t); log('exile: ' + t.name); } }, { players: false });
      });
      jb('↩️ Return to hand…', () => {
        this.startManualPick('Return to hand', async (t) => { if (t instanceof MTG.CardInst) { await g.move(t, 'hand'); log('bounce: ' + t.name); } }, { players: false });
      });
      jb('➕ Add +1/+1 counters…', () => {
        const n = askN(1); if (n === null) return;
        this.startManualPick(`+${n} counters`, async (t) => { if (t instanceof MTG.CardInst) { g.addCounters(t, '+1/+1', n); } }, { players: false });
      });
      jb('📈 Pump ±X/±X…', () => {
        const p = askN(2); if (p === null) return;
        const t2 = askN(2); if (t2 === null) return;
        this.startManualPick(`${p >= 0 ? '+' : ''}${p}/${t2 >= 0 ? '+' : ''}${t2} until end of turn`, async (t) => {
          if (t instanceof MTG.CardInst) { MTG.E.pumpUntilEOT(g, t, p, t2); await g.checkSBA(); log(`pump ${p}/${t2}: ${t.name}`); }
        }, { players: false });
      });
      jb('🔄 Tap or untap a target…', () => {
        this.startManualPick('Tap/untap', async (t) => { if (t instanceof MTG.CardInst) { t.tapped = !t.tapped; log((t.tapped ? 'tap ' : 'untap ') + t.name); } }, { players: false });
      });
      jb('❤️ Life ±N…', () => {
        const n = askN(-3); if (n === null || !n) return;
        this.startManualPick(`Life ${n > 0 ? '+' : ''}${n}`, async (t) => {
          const pl = t instanceof MTG.Player ? t : t.ctrl;
          if (n > 0) await g.gainLife(pl, n); else await g.loseLife(pl, -n);
          log(`life ${n} → ${pl.name}`);
        });
      });
      jb('🔮 Add mana…', async () => {
        const col = window.prompt('Color (W/U/B/R/G/C)?', 'G');
        if (col && me.pool[col.toUpperCase()] !== undefined) { me.pool[col.toUpperCase()]++; log('+1 {' + col.toUpperCase() + '}'); this.queueRender(); }
      });
      jb('🪦 Return from graveyard…', () => {
        this.showJudge = false;
        this.zoneBrowse = { player: me, zone: 'graveyard', judgeReturn: true };
        this.render();
        this.toast('Click a card in the graveyard to return it to the battlefield.');
      });
      // tokeni
      m.appendChild(el('div', 'mtitle small', 'Create a token'));
      const tokRow = el('div', 'judgegrid');
      const tokBtn = (label, spec) => {
        const b = el('button', 'pbtn', label);
        b.onclick = async () => { await g.makeTokens(spec, me); log('token: ' + label); this.queueRender(); };
        tokRow.appendChild(b);
      };
      tokBtn('Treasure', 'treasure'); tokBtn('Clue', 'clue'); tokBtn('Food', 'food');
      tokBtn('1/1 Soldier', 'soldierW'); tokBtn('2/2 Drake ✈', 'drake'); tokBtn('3/3 Beast', 'beast33');
      const custB = el('button', 'pbtn', '✏️ Custom P/T…');
      custB.onclick = async () => {
        const spec = window.prompt('P/T Ime (npr: 4/4 Angel flying)', '2/2 Zombie');
        if (!spec) return;
        const mm = /^(\d+)\/(\d+)\s+(\S+)\s*(flying)?/.exec(spec.trim());
        if (!mm) { this.toast('Format: 2/2 Ime [flying]'); return; }
        const def = { name: mm[3], cost: null, types: ['Creature'], subtypes: [mm[3]], super: [], power: mm[1], toughness: mm[2], oracle: '', kws: mm[4] ? ['flying'] : [], isTokenDef: true, colorsOverride: [] };
        await g.makeTokens(def, me);
        log('token: ' + spec);
        this.queueRender();
      };
      tokRow.appendChild(custB);
      m.appendChild(grid);
      m.appendChild(tokRow);
      const close = el('button', 'pbtn wide', 'Close');
      close.onclick = () => { this.showJudge = false; this.render(); };
      m.appendChild(close);
      m.querySelectorAll('.judgegrid .pbtn').forEach(() => {});
      // klik na akcije koje otvaraju target mod treba zatvoriti panel
      grid.querySelectorAll('.pbtn').forEach(b => {
        const orig = b.onclick;
        b.onclick = () => { orig(); if (this.manualPick) { this.showJudge = false; this.render(); } };
      });
      return ov;
    }

    renderHelp(g) {
      const ov = el('div', 'overlay');
      ov.onclick = (e) => { if (e.target === ov) { this.showHelp = false; this.render(); } };
      const m = el('div', 'sheet tall');
      ov.appendChild(m);
      m.appendChild(el('div', 'mtitle', '❓ How to play'));
      m.appendChild(el('div', 'helptext', `
<b>🎴 Playing cards:</b> click a card in your hand to open its available actions, such as Cast, Play land, or Cycling. Cards with a <span style="color:#5aa860">green frame</span> can be played now. The <b>✨/🖐 MANA</b> button switches between automatic payment and choosing exact mana sources.<br><br>
<b>👑 Commander:</b> your commander stays in the COMMAND ZONE above your hand until cast. Click it, then choose Cast. When it dies, you may return it to the command zone; each recast adds {2} commander tax.<br><br>
<b>⚙️ Abilities and tokens:</b> a permanent with a ⚙️ badge has an available activated ability. Click it, then choose an action such as creating Food, equipping, or crewing.<br><br>
<b>⚔️ Attacking:</b> during combat, click one of your creatures, then choose the player or planeswalker it attacks. Every declared combat gets a review and waits for <b>Proceed</b>, even when you are not being attacked. <b>🛡️ Blocking:</b> click an attacker first, then one of your blockers.<br><br>
<b>🎯 Targets:</b> legal targets <span style="color:#e8c05a">glow gold</span>. Click a card or an opponent panel to select it.<br><br>
<b>Opponents:</b> their battlefields stay visible under their names. Click a header to collapse or expand it; ℹ️ opens graveyard and commander-damage details.<br><br>
<b>⚡ Instants and priority:</b> each opposing nonland card appears on the central action stage and waits for your <b>Proceed</b>. Legal combat responses open a reaction window automatically. The <b>STOP</b> button controls additional priority windows.<br>
<b>🃏 Manifest and cloak:</b> a face-down permanent is a real hidden 2/2 card, not a token. You may inspect your own card and turn a creature face up when legal. Cloak also grants ward {2}.<br>
<b>🖐️ HOLD (R key):</b> arm HOLD whenever you want the game to stop at your next priority window.<br>
<b>🐢 Speed:</b> ▶️/🐢/⏩ changes bot pacing. A red spotlight clearly shows actions that target you, attack you, or block your attack.<br>
Sorceries and creatures can normally be cast only during your main phase. Instants and cards with flash can be cast whenever you have priority.`));
      const close = el('button', 'pbtn primary wide', 'Got it! ▶');
      close.onclick = () => { this.showHelp = false; this.render(); };
      m.appendChild(close);
      return ov;
    }

    renderStopSettings(g) {
      const ov = el('div', 'overlay dark stopoverlay');
      ov.onclick = e => { if (e.target === ov) { this.showStops = false; this.render(); } };
      const m = el('div', 'modal stopmodal');
      ov.appendChild(m);
      m.appendChild(el('div', 'mtitle', 'Priority stops'));
      m.appendChild(el('div', 'stopintro', 'Opposing nonland cards always appear on the action stage. Choose any additional empty priority windows here.'));
      const list = el('div', 'stopprofiles');
      for (const mode of MTG.PRIO_MODES) {
        const selected = mode.key === this.prioMode;
        const row = el('button', 'stopprofile' + (selected ? ' selected' : ''));
        row.innerHTML = `<span class="stopicon">${mode.icon}</span><span><b>${esc(mode.label)}</b><small>${esc(mode.desc)}</small></span><i>${selected ? 'ACTIVE' : ''}</i>`;
        row.onclick = () => {
          this.prioMode = mode.key;
          localStorage.setItem('mtgStopProfile', mode.key);
          this.showStops = false;
          this.toast(`${mode.icon} Stops: ${mode.label}`);
          this.render();
        };
        list.appendChild(row);
      }
      m.appendChild(list);
      const close = el('button', 'pbtn wide', 'Close');
      close.onclick = () => { this.showStops = false; this.render(); };
      m.appendChild(close);
      return ov;
    }

    renderGameOver(g) {
      const ov = el('div', 'overlay dark');
      const m = el('div', 'modal');
      const won = g.winner === this.me;
      m.appendChild(el('div', 'gameover', won ? '🏆 YOU WON!' : `☠️ ${g.winner ? esc(g.winner.name) + ' wins' : 'Game over'}`));
      const b = el('button', 'pbtn primary wide', 'New game');
      b.onclick = () => location.reload();
      m.appendChild(b);
      const l = el('button', 'pbtn wide', 'View log');
      l.onclick = () => { this.showLog = true; ov.remove(); this.render(); };
      m.appendChild(l);
      ov.appendChild(m);
      return ov;
    }

    toast(msg) {
      const t = el('div', 'toastmsg', esc(msg));
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 2500);
    }

    showEffectNotice(text, kind) {
      if (!text) return;
      let stack = document.querySelector('.effectnoticestack');
      if (!stack) {
        stack = el('div', 'effectnoticestack');
        document.body.appendChild(stack);
      }
      const item = el('div', 'effectnotice ' + (kind || 'effect'), esc(text));
      stack.appendChild(item);
      while (stack.children.length > 5) stack.firstElementChild.remove();
      setTimeout(() => {
        item.classList.add('leaving');
        setTimeout(() => {
          item.remove();
          if (!stack.children.length) stack.remove();
        }, 220);
      }, 4200);
    }

    showBattlefieldArrival(event) {
      const card = event && event.card;
      if (!card || !card.name) return;
      const previous = document.querySelector('.battlefieldarrival');
      if (previous) previous.remove();
      const commander = event.kind === 'commander';
      const splash = el('div', `battlefieldarrival ${commander ? 'commander' : 'powerhouse'}`);
      splash.dataset.iid = String(card.iid);
      splash.innerHTML = `
        <div class="arrivalflare" aria-hidden="true"></div>
        <img src="${imgURL(card.name, true)}" onerror="MTG.imgFail(this)">
        <div class="arrivalcopy">
          <small>${commander ? '👑 COMMANDER ENTERS' : '✦ POWERHOUSE ENTERS'}</small>
          <b>${esc(card.name)}</b>
          <span>${esc(event.player ? event.player.name : '')}${event.power !== null && event.power !== undefined ? ` · ${event.power}/${event.toughness}` : ''}</span>
        </div>`;
      document.body.appendChild(splash);
      requestAnimationFrame(() => {
        const permanent = document.querySelector(`.mini[data-iid="${card.iid}"]`);
        if (permanent) permanent.classList.add('arrival-highlight');
      });
      setTimeout(() => {
        splash.classList.add('leaving');
        document.querySelector(`.mini[data-iid="${card.iid}"]`)?.classList.remove('arrival-highlight');
        setTimeout(() => splash.remove(), 320);
      }, 3200);
    }

    showBanner(text, gold) {
      const b = el('div', 'turnbanner' + (gold ? ' gold' : ''), esc(text));
      document.body.appendChild(b);
      setTimeout(() => b.remove(), 1500);
    }

    applySpeed() {
      this.speed = this.speed || 'normal';
      if (this.game) this.game.speedFactor = (MTG.SPEEDS[this.speed] || MTG.SPEEDS.normal)[1];
    }

    // "reflektor" — bot je uradio nešto usmjereno na tebe
    showSpot(text, kind) {
      const old = document.querySelector('.spotbar');
      if (old) old.remove();
      const b = el('div', 'spotbar ' + (kind || 'info'), esc(text));
      document.body.appendChild(b);
      const ms = Math.round(1900 * (this.game ? this.game.speedFactor : 1));
      b._t = setTimeout(() => b.remove(), ms);
    }
  }
  MTG.UI = UI;
})();
