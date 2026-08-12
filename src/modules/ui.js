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
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  function imgURL(name, big) {
    const face = name.split(' // ')[0];
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(face)}&format=image&version=${big ? 'normal' : 'small'}`;
  }
  // Pravi mana simboli sa Scryfalla. Hibridi/phyrexian ({W/U}, {W/P}) u kodu
  // simbola nemaju kosu crtu. Ako slika ne stigne, pada nazad na obojeni pip
  // pa cijena ostaje čitljiva i offline.
  function costHTML(cost) {
    if (!cost) return '';
    return cost.replace(/\{([^}]+)\}/g, (m, t) => {
      const code = t.toUpperCase();
      const col = COLHEX[code] || (/^\d+$|^X$/.test(code) ? '#ccc' : '#c9b37a');
      const fg = code === 'B' ? '#eee' : '#222';
      const url = 'https://svgs.scryfall.io/card-symbols/' + encodeURIComponent(code.replace(/\//g, '')) + '.svg';
      // bez loading="lazy" — simboli su sitni i često van viewporta, pa bi
      // lijeno učitavanje značilo da se nikad ne dohvate
      return `<img class="msym" src="${url}" alt="{${code}}" title="{${code}}"` +
        ` onerror="MTG.symFail(this,'${col}','${fg}','${esc(code)}')">`;
    });
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
      // THE STACK kao popup na sredini — sam iskoči kad nešto stane na stack
      this.stackPopup = localStorage.getItem('mtgStackPop') !== '0';
      this.stackPopDismissed = 0;   // dužina stacka na kojoj je igrač zatvorio popup
      this.stackPopPos = null;      // {x,y} ako ga je odvukao sa sredine
      // podesive AI table (pamti se između partija)
      this.oppHeight = parseInt(localStorage.getItem('mtgOppH') || '42', 10);
      this.oppScale = parseFloat(localStorage.getItem('mtgOppS') || '1');
      this.prioMode = localStorage.getItem('mtgStopProfile') || 'end';
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
      // oba panela ugašena → sidebar se uklanja i tabla ide preko cijele širine
      root.classList.toggle('nosidebar', !this.showThreat && !this.showSideLog);
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
      const modal = this.renderAttackTargetPopup(g) || this.renderDecisionModal(g);
      // stack popup stoji na sredini, pa se sklanja kad je otvoren bilo koji drugi
      // overlay — inače bi se preklapali baš na istom mjestu
      const blocked = !!modal || !!reveal || !!this.sheet || !!this.playerSheet || !!this.zoneBrowse ||
        this.showLog || this.showHelp || this.showJudge || this.showStops;
      const stage = blocked ? null : this.renderActionStage(g);
      if (stage) root.appendChild(stage);
      const sp = blocked ? null : this.renderStackPopup(g);
      if (sp && !stage) root.appendChild(sp);
      if (modal) root.appendChild(modal);
      if (g.gameOver) root.appendChild(this.renderGameOver(g));
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
      const kind = top.kind === 'spell' ? 'Karta na stacku' : top.kind === 'trigger' ? 'Trigger na stacku' : 'Sposobnost na stacku';
      const targets = (top.targets || top.ctx && top.ctx.targets || []).flat().filter(Boolean);
      const targetText = targets.length
        ? targets.map(t => t instanceof MTG.Player ? t.name : `${t.name}${t.ctrl ? ` (${t.ctrl.name})` : ''}`).join(', ')
        : 'bez mete';
      const def = source.def || {};
      const wrap = el('div', 'actionstagewrap');
      const stage = el('div', 'actionstage');
      const art = el('div', 'actionstageart');
      art.innerHTML = `<img src="${imgURL(source.name, true)}" onerror="MTG.imgFail(this)">`;
      stage.appendChild(art);
      const info = el('div', 'actionstageinfo');
      info.appendChild(el('div', 'actionstageeyebrow', `${esc(kind)} · ${esc(top.ctrl ? top.ctrl.name : '')}`));
      info.appendChild(el('div', 'actionstagename', esc(top.name || source.name)));
      info.appendChild(el('div', 'actionstagetype', `${costHTML(def.cost || '')}<span>${esc([...(def.super || []), ...(def.types || [])].join(' '))}${(def.subtypes || []).length ? ' — ' + esc(def.subtypes.join(' ')) : ''}</span>`));
      info.appendChild(el('div', 'actionstagetarget', `🎯 ${esc(targetText)}`));
      info.appendChild(el('div', 'actionstageoracle', esc(def.oracle || top.name || '').replace(/\n/g, '<br>')));
      info.appendChild(el('div', 'actionstagestack', `STACK ${g.stack.length} · ova akcija se razrješava ${g.stack.length === 1 ? 'sljedeća' : 'prije ' + (g.stack.length - 1) + ' starijih akcija'}`));
      const buttons = el('div', 'actionstagebuttons');
      if (canAct) {
        const respond = el('button', 'pbtn actionrespond', '⚡ Otvori odgovore');
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
        pd.q.kind === 'tokens' ? 'Tokeni' : 'Ulazi na tablu'));
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
      x.title = 'Sakrij (vrati se kad se stack promijeni)';
      x.onclick = (e) => { e.stopPropagation(); this.stackPopDismissed = g.stack.length; this.render(); };
      head.appendChild(x);
      pop.appendChild(head);

      const body = el('div', 'stackpopbody');
      const items = g.stack.slice().reverse();   // vrh stacka prvi — prvi se i rješava
      items.forEach((so, i) => {
        const it = el('div', 'stackpopitem' + (so.ctrl === this.me ? ' mine' : '') + (i === 0 ? ' next' : ''));
        const nm = so.name || (so.card && so.card.name) || 'Efekat';
        const kind = so.kind === 'trigger' ? 'trigger' : so.kind === 'ability' ? 'sposobnost' : 'spell';
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
        it.appendChild(el('div', 'stackpopidx', i === 0 ? 'SLJEDEĆE' : '#' + (items.length - i)));
        if (so.card) it.onclick = () => { this.sheet = { card: so.card, stack: true }; this.render(); };
        body.appendChild(it);
      });
      pop.appendChild(body);
      pop.appendChild(el('div', 'stackpopfoot', 'rješava se odozgo nadolje'));

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
          body.innerHTML = '<div class="stackempty"><span>◇</span>stack je prazan</div>';
        } else {
          for (const so of g.stack.slice().reverse()) {
            const it = el('div', 'stackitem' + (so.ctrl === this.me ? ' mine' : ''));
            it.innerHTML = `<div class="siname">${esc(so.name || (so.card && so.card.name) || 'Efekat')}</div>` +
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
        if (!cmds.length) cd.appendChild(el('div', 'sidenote', 'Nema komandera na stolu.'));
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
      if (this.showThreat) {
      const tp = el('div', 'threatpanel');
      tp.appendChild(el('div', 'sidetitle', '🎯 Threat — ko je najopasniji?'));
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
          <span class="tname">${esc(t.p.name)}${styleMeta ? ` <span class="persona" title="${esc(styleMeta.label)}">${styleMeta.icon}</span>` : ''}${grudgeMe ? ' <span class="persona" title="Pamti tvoje napade — ima zub na tebe!">💢</span>' : ''}</span>
          <span class="tbarwrap"><span class="tbar" style="width:${pct}%"></span></span>
          <span class="tscore">${t.score}</span>`;
        row.onclick = () => { this.playerSheet = t.p; this.render(); };
        tp.appendChild(row);
      });
      tp.appendChild(el('div', 'sidenote', 'Botovi koriste ovu procjenu + ličnu „grudge" memoriju (pamte ko ih je napadao).'));
      side.appendChild(tp);
      }
      // TOK IGRE
      if (this.showSideLog) {
        const lp = el('div', 'sidelog');
        lp.appendChild(el('div', 'sidetitle', '📜 Tok igre'));
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

    // tastatura: Space/Enter = glavno dugme, Esc = zatvori panele
    initKeys() {
      if (this._keysInit) return;
      this._keysInit = true;
      document.addEventListener('keydown', ev => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName)) return;
        if (ev.key === 'Escape') {
          if (this.sheet || this.playerSheet || this.zoneBrowse || this.showLog || this.showHelp || this.showJudge) {
            this.sheet = null; this.playerSheet = null; this.zoneBrowse = null;
            this.showLog = false; this.showHelp = false; this.showJudge = false;
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
        const smap = { begin: '', attackers: '— napadači', blockers: '— blokeri', firstStrike: '— first strike', damage: '— šteta', endCombat: '' };
        s += ' ' + (smap[g.step] || '');
      }
      return s;
    }

    renderTopbar(g) {
      const bar = el('div', 'topbar');
      const left = el('div', 'phasewrap');
      left.appendChild(el('div', 'phase', `<b>Potez ${g.turnNo}</b> · ${esc(g.turnPlayer ? g.turnPlayer.name : '')}${g.phase === 'combat' && g.step ? ' · ' + this.phaseName(g) : ''}`));
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
      spB.title = 'Brzina AI poteza: ' + speeds[this.speed][2];
      spB.onclick = () => {
        const order = ['normal', 'slow', 'fast'];
        this.speed = order[(order.indexOf(this.speed) + 1) % order.length];
        this.applySpeed();
        this.toast('Brzina AI poteza: ' + speeds[this.speed][2]);
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
        ? 'HOLD armiran — igra staje na sljedećem prioritetu. Klikni da otkažeš.'
        : 'HOLD — stani na sljedećem prioritetu (kad hoćeš da ubaciš instant).';
      holdB.onclick = () => {
        if (this.react) { this.takeReactWindow(); return; }
        this.holdNext = !this.holdNext;
        this.toast(this.holdNext ? '🖐️ HOLD: stajem na sljedećem prioritetu.' : 'HOLD otkazan.');
        this.render();
      };
      btns.appendChild(holdB);
      const modes = MTG.PRIO_MODES;
      const curMode = modes.find(m => m.key === (this.prioMode || 'end')) || modes[0];
      const setB = el('button', 'tbtn stopbtn', `${curMode.icon} ${curMode.short}`);
      setB.title = `Stopovi: ${curMode.label} — ${curMode.desc}`;
      setB.onclick = () => { this.showStops = true; this.render(); };
      // desktop panel toggle-i: gase threat/tok igre da tabla dobije punu širinu
      const thB = el('button', 'tbtn deskonly' + (this.showThreat ? ' on' : ''), '🎯');
      thB.title = (this.showThreat ? 'Sakrij' : 'Prikaži') + ' Threat panel';
      thB.onclick = () => {
        this.showThreat = !this.showThreat;
        localStorage.setItem('mtgThreat', this.showThreat ? '1' : '0');
        this.render();
      };
      const slB = el('button', 'tbtn deskonly' + (this.showSideLog ? ' on' : ''), '📋');
      slB.title = (this.showSideLog ? 'Sakrij' : 'Prikaži') + ' Tok igre';
      slB.onclick = () => {
        this.showSideLog = !this.showSideLog;
        localStorage.setItem('mtgSideLog', this.showSideLog ? '1' : '0');
        this.render();
      };
      const stB = el('button', 'tbtn' + (this.stackPopup ? ' on' : ''), '🃏');
      stB.title = (this.stackPopup ? 'Isključi' : 'Uključi') + ' stack popup na sredini ekrana';
      stB.onclick = () => {
        this.stackPopup = !this.stackPopup;
        this.stackPopDismissed = 0;
        localStorage.setItem('mtgStackPop', this.stackPopup ? '1' : '0');
        this.toast(this.stackPopup ? '🃏 Stack popup uključen' : '🃏 Stack popup isključen');
        this.render();
      };
      const newB = el('button', 'tbtn', '↺');
      newB.onclick = () => { if (confirm('Nova partija? Trenutna se gubi.')) location.reload(); };
      btns.appendChild(helpB); btns.appendChild(logB);
      btns.appendChild(stB);
      btns.appendChild(thB); btns.appendChild(slB);
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
      for (const p of g.players) {
        if (p === this.me) continue;
        const meta = MTG.DECK_META[p.deckName] || {};
        const isActiveAi = activeAiTurn && g.turnPlayer === p;
        const row = el('div', 'opprow' + (p.lost ? ' lost' : '') + (g.turnPlayer === p ? ' active' : '') + (isActiveAi ? ' activeai' : ''));
        if (isActiveAi) row.style.setProperty('--opp-scale', String(Math.min(2, this.oppScale * 1.2)));
        const isCandidate = this.isCandidate(p);
        const collapsed = this.collapsed.has(p.idx);
        // header
        const head = el('div', 'opphead' + (isCandidate ? ' targetable' : ''));
        const cmdList = (p.commanders && p.commanders.length) ? p.commanders : p.command;
        const cmdState = cmdList.map(c => c.zone === 'battlefield' ? 'na tabli' : c.zone === 'command' ? 'u CZ' : '🪦')
          .join(' / ') || '—';
        const cmdTitle = cmdList.map(c => `${c.name} (${c.zone})`).join(' · ');
        const styleMeta = p.isAI && p.aiStyle && MTG.AI_STYLES && MTG.AI_STYLES[p.aiStyle];
        head.innerHTML = `
          <span class="chev">${collapsed ? '▸' : '▾'}</span>
          <span class="oppname">${meta.icon || '🤖'} ${esc(p.name)}</span>
          ${isActiveAi ? '<span class="activeaitag">AKTIVNI POTEZ</span>' : ''}
          ${styleMeta ? `<span class="personachip" title="Stil: ${esc(styleMeta.label)}">${styleMeta.icon} ${esc(styleMeta.label)}</span>` : ''}
          <span class="opplife" role="button">${p.life}❤</span>
          <span class="oppmeta">✋${p.hand.length} 📚${p.library.length}</span>
          <span class="oppcmd" title="${esc(cmdTitle)}">👑${esc(cmdState)}</span>
          <button class="tbtn small">ℹ️</button>`;
        head.querySelector('button').onclick = (e) => { e.stopPropagation(); this.playerSheet = p; this.render(); };
        // EDHLAB-style: life tap = detalji (commander dmg itd.), ostatak = collapse
        head.querySelector('.opplife').onclick = (e) => {
          if (isCandidate) return; // pusti glavni handler
          e.stopPropagation(); this.playerSheet = p; this.render();
        };
        head.onclick = () => {
          if (isCandidate) { this.pickCandidate(p); return; }
          if (this.collapsed.has(p.idx)) this.collapsed.delete(p.idx); else this.collapsed.add(p.idx);
          this.render();
        };
        row.appendChild(head);
        // board strip (always visible unless collapsed)
        if (!collapsed && !p.lost) {
          const strip = el('div', 'oppstrip');
          const perms = g.bf().filter(c => c.ctrl === p && !c.is('Land'));
          const creatures = perms.filter(c => c.is('Creature'));
          const others = perms.filter(c => !c.is('Creature'));
          for (const entry of this.groupPerms(creatures.concat(others))) {
            strip.appendChild(this.miniCard(g, entry.card, { sm: true, stackN: entry.n }));
          }
          // lands summary chip
          const lands = g.lands(p);
          const untapped = lands.filter(l => !l.tapped).length;
          if (lands.length) {
            const lc = el('div', 'oppLands', `🌍<br>${untapped}/${lands.length}`);
            lc.title = 'Landovi (untapped/ukupno)';
            lc.onclick = () => { this.playerSheet = p; this.render(); };
            strip.appendChild(lc);
          }
          if (!perms.length && !lands.length) strip.appendChild(el('div', 'emptystrip', 'prazna tabla'));
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
      minus.title = 'Manje karte kod protivnika';
      minus.onclick = () => setScale(this.oppScale - 0.1);
      const plus = el('button', 'zbtn', '+');
      plus.title = 'Veće karte kod protivnika';
      plus.onclick = () => setScale(this.oppScale + 0.1);
      const val = el('div', 'zval', Math.round(this.oppScale * 100) + '%');
      const reset = el('button', 'zbtn', '↺');
      reset.title = 'Vrati na standardno (100%, 42% visine)';
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
      grip.title = 'Povuci da promijeniš visinu AI tabli';
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
              <span><b>${esc(attacker.name)}</b><small>${attacker.power}/${attacker.toughness}${blocked ? ` · blokira ${esc(attacker.blockedBy.map(b => b.name).join(', '))}` : ''}</small></span>`;
            item.onclick = () => { this.sheet = { card: attacker }; this.render(); };
            cards.appendChild(item);
          }
          lane.appendChild(cards);
          lane.appendChild(el('div', 'combatarrow', '<span></span>'));
          lane.appendChild(el('div', 'combatdefender', `<b>${esc(target.name)}</b><span>${attackers.length} napadač${attackers.length === 1 ? '' : 'a'} · do ${rawDamage} štete</span>`));
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
          if (this.isCandidate(so)) { item.classList.add('targetable'); item.onclick = () => this.pickCandidate(so); }
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
      const perms = g.bf().filter(c => c.ctrl === me && !c.is('Land'));
      const row1 = el('div', 'cardrow');
      const creatures = perms.filter(c => c.is('Creature'));
      const others = perms.filter(c => !c.is('Creature'));
      for (const entry of this.groupPerms(creatures.concat(others))) {
        row1.appendChild(this.miniCard(g, entry.card, { stackN: entry.n }));
      }
      if (!perms.length) row1.appendChild(el('div', 'emptyrow', 'Tvoja tabla je prazna'));
      wrap.appendChild(row1);
      // lands & info row
      const row2 = el('div', 'landrow');
      const groups = this.landGroups(g, me);
      for (const [name, lands] of Object.entries(groups)) {
        const untapped = lands.filter(l => !l.tapped).length;
        const lc = el('div', 'landstack' + (untapped === 0 ? ' tapped' : ''));
        const cols = (lands[0].def.producesColors || []).map(c => `<span class="dot" style="background:${COLHEX[c]}"></span>`).join('');
        lc.innerHTML = `<div class="lname">${esc(name)}</div><div>${cols}</div><div class="lcount">${untapped}/${lands.length}</div>`;
        const cand = lands.find(l => this.isCandidate(l));
        if (cand) { lc.classList.add('targetable'); lc.onclick = () => this.pickCandidate(cand); }
        else lc.onclick = () => { this.sheet = { card: lands[0] }; this.render(); };
        row2.appendChild(lc);
      }
      // mana pool
      const pool = me.pool;
      const poolStr = Object.entries(pool).filter(([k, v]) => v > 0).map(([k, v]) => `${MANA_SYM[k]}${v}`).join(' ');
      const info = el('div', 'meinfo');
      info.innerHTML = `<div class="melife">${me.life}❤</div>
        <div>${poolStr ? '🔮 ' + poolStr : ''}</div>
        <div class="zbtns">
          <button class="zbtn">📚${me.library.length}</button>
          <button class="zbtn" data-z="graveyard">🪦${me.graveyard.length}</button>
          <button class="zbtn" data-z="exile">🌀${me.exile.length}</button>
        </div>`;
      info.querySelectorAll('.zbtn[data-z]').forEach(b => {
        b.onclick = () => { this.zoneBrowse = { player: me, zone: b.dataset.z }; this.render(); };
      });
      info.querySelector('.melife').onclick = () => { this.playerSheet = me; this.render(); };
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
              <div class="czlabel">👑 COMMAND ZONA</div>
              <div class="czname">${esc(cmd.name.split(',')[0])}</div>
              <div class="czcost">Cijena: ${costHTML(U.costStr(cost))}${cmd.cmdCasts ? ` <span class="tax">(tax +${2 * cmd.cmdCasts})</span>` : ''}</div>
            </div>
            ${castEntry ? '<div class="czgo">BACI ▶</div>' : ''}`;
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
        'Ring-bearer je legendaran i ne mogu ga blokirati stvorenja veće snage.',
        'Kad Ring-bearer napadne — vuci kartu, pa odbaci kartu.',
        'Kad Ring-bearera blokira stvorenje — vlasnik ga žrtvuje na kraju borbe.',
        'Kad Ring-bearer nanese borbenu štetu igraču — svaki protivnik gubi 3 života.',
      ];
      const d = el('div', 'czcard ringcard');
      d.innerHTML = `
        <div class="ringart">💍</div>
        <div class="czinfo">
          <div class="czlabel">THE RING · NIVO ${em.level}/4</div>
          <div class="czname">${bearer ? esc(bearer.name.split(',')[0]) : '<span class="ringnone">bez Ring-bearera</span>'}</div>
          <div class="ringpips">${abil.map((_, i) => `<span class="ringpip${i < em.level ? ' on' : ''}"></span>`).join('')}</div>
        </div>`;
      d.onclick = () => {
        this.sheet = {
          custom: {
            title: `💍 The Ring — nivo ${em.level}/4`,
            body: abil.map((t, i) => `<div class="ringab${i < em.level ? ' on' : ''}">${i < em.level ? '✓' : '○'} ${t}</div>`).join('')
              + `<div class="ringab on" style="margin-top:8px">Ring-bearer: <b>${bearer ? esc(bearer.name) : '—'}</b></div>`,
          },
        };
        this.render();
      };
      return d;
    }

    miniCard(g, c, opts = {}) {
      const threatened = this.threatTargets && this.threatTargets.has(c.iid);
      const d = el('div', 'mini' + (opts.sm ? ' sm' : '') + (c.tapped ? ' tapped' : '') + (c.sick && c.is('Creature') && !c.kw('haste') ? ' sick' : '') + (threatened ? ' threatened' : ''));
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
        ? '<div class="crewtag" title="Posada ukrcana ovaj potez">CREW</div>' : '';
      const att = c.attachments.length ? `<div class="att">🔗${c.attachments.length}</div>` : '';
      const tok = c.isToken ? `<div class="toktag">TOKEN</div>` : '';
      const stackN = opts.stackN && opts.stackN > 1 ? `<div class="stackn">×${opts.stackN}</div>` : '';
      if (opts.stackN > 1) d.classList.add('stacked');
      d.innerHTML = `
        <img loading="lazy" src="${imgURL(c.name)}" onerror="MTG.imgFail(this)">
        <div class="mname">${esc(c.name.split(' // ')[0])}</div>
        ${pt}${cnt}${oc}${crewed}${att}${tok}${stackN}
        ${badges.length ? `<div class="badge">${badges.join('')}</div>` : ''}`;
      d.dataset.cname = c.name;
      // interactions
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
      for (const c of me.hand) {
        const d = el('div', 'hcard' + (this.threatTargets && this.threatTargets.has(c.iid) ? ' threatened' : ''));
        const colors = c.colors.length ? c.colors : ['C'];
        d.style.setProperty('--frame', colors.length > 1 ? `linear-gradient(135deg, ${colors.map(x => COLHEX[x]).join(',')})` : COLHEX[colors[0]]);
        d.innerHTML = `
          <img loading="lazy" src="${imgURL(c.name)}" onerror="MTG.imgFail(this)">
          <div class="hcost">${costHTML(c.def.cost || '')}</div>
          <div class="mname">${esc(c.name.split(' // ')[0])}</div>`;
        d.dataset.cname = c.name;
        if (this.isCandidate(c)) {
          d.classList.add('targetable');
          d.onclick = () => this.pickCandidate(c);
        } else {
          if (castable.has(c)) d.classList.add('castable');
          d.onclick = () => { this.sheet = { card: c }; this.render(); };
        }
        row.appendChild(d);
      }
      if (!me.hand.length) row.appendChild(el('div', 'emptyrow', 'Prazna ruka'));
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
              `🌙 Kraj poteza — <b>${esc(g.turnPlayer ? g.turnPlayer.name : '')}</b>. Zadnja prilika prije tvog poteza.`));
          } else {
            const who = top && top.ctrl ? top.ctrl.name : 'protivnik';
            const what = top ? (top.name || (top.card && top.card.name) || 'nešto') : 'akcija';
            bar.appendChild(el('div', 'ptext', canAct
              ? `⚡ <b>${esc(who)}</b>: ${esc(what)} — želiš da odgovoriš?`
              : `⚡ <b>${esc(who)}</b>: ${esc(what)} — nemaš odgovor.`));
          }
          const row = el('div', 'btnrow');
          if (canAct) {
            const yes = el('button', 'pbtn primary', preTurn ? '🎴 ODIGRAJ NEŠTO' : '⚡ REAGUJ');
            yes.onclick = () => this.takeReactWindow();
            row.appendChild(yes);
          }
          // Kad nemam čime da odgovorim, jedino dugme je Proceed — ali igra i
          // dalje čeka mene, bez odbrojavanja.
          const no = el('button', 'pbtn' + (canAct ? '' : ' primary'),
            preTurn ? 'Nastavi na moj potez ▶' : 'Proceed ▶');
          no.onclick = () => this.skipReactWindow();
          row.appendChild(no);
          bar.appendChild(row);
          return bar;
        }
        const hint = this.holdNext ? '🖐️ HOLD armiran — stajem na sljedećem prioritetu.' : '⏳ Protivnici igraju…';
        bar.appendChild(el('div', 'ptext dim', g.gameOver ? 'Partija je gotova.' : hint));
        return bar;
      }
      const q = pd.q;
      const btn = (label, fn, cls) => {
        const b = el('button', 'pbtn ' + (cls || ''), label);
        b.onclick = fn;
        return b;
      };
      if (this.manualPick) {
        bar.appendChild(el('div', 'ptext', `🎯 <b>${esc(this.manualPick.label)}</b> — tap na metu`));
        bar.appendChild(btn('Otkaži', () => { this.manualPick = null; this.render(); }, 'danger'));
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
          const owner = e.card.owner !== this.me ? ` — od ${e.card.owner.name}` : '';
          const alt = e.alt && e.alt.label ? ` · ${e.alt.label}` : (e.alt && e.alt.free ? ' · besplatno' : '');
          const b = btn(`${zi} ${esc(e.card.name.split(' // ')[0])}${esc(alt)}${esc(owner)}`, () => {
            this.resolvePending({ kind: 'cast', card: e.card, alt: e.alt, from: e.from });
          });
          b.title = `Igraj iz zone: ${e.card.zone}`;
          row.appendChild(b);
        }
        return row;
      };
      const judgeBtn = () => {
        const hasCustom = this.me && this.me.deckName && MTG.DECKS[this.me.deckName] && MTG.DECKS[this.me.deckName].custom;
        if (!hasCustom && q.type !== 'manualResolve') return null;
        return btn('⚒️ Sudija', () => { this.showJudge = true; this.render(); });
      };
      if (q.type === 'threatAlert') {
        bar.appendChild(el('div', 'ptext', '⏸️ Pauza — pogledaj šta ti bot šalje.'));
        return bar;
      }
      switch (q.type) {
        case 'manualResolve': {
          bar.appendChild(el('div', 'ptext', `⚒️ <b>${esc(q.card.name)}</b> — izvrši efekat ručno pa potvrdi`));
          const row = el('div', 'btnrow');
          row.appendChild(btn('⚒️ Otvori sudija-panel', () => { this.showJudge = true; this.render(); }, 'primary'));
          row.appendChild(btn('Gotovo ✔', () => this.resolvePending(true)));
          bar.appendChild(row);
          break;
        }
        case 'main': {
          let hint = g.phase === 'main1' ? '🎴 Glavna faza 1 — tap na kartu za akcije' : '🎴 Glavna faza 2';
          if (this.actable && this.actable.size) hint += ` · <span class="hintact">⚙️ = sposobnost (${this.actable.size})</span>`;
          bar.appendChild(el('div', 'ptext', hint));
          const oz = offZoneRow();
          if (oz) bar.appendChild(oz);
          const row = el('div', 'btnrow');
          const jb = judgeBtn();
          if (jb) row.appendChild(jb);
          row.appendChild(btn(g.phase === 'main1' ? 'Dalje ▶ (combat)' : 'Kraj poteza ▶', () => this.resolvePending({ kind: 'done' }), 'primary'));
          bar.appendChild(row);
          break;
        }
        case 'priority': {
          const top = g.stack[g.stack.length - 1];
          const nOpt = (q.casts || []).length + (q.acts || []).length;
          let label;
          if (top) {
            label = `⚡ Na stacku: <b>${esc(top.name)}</b> <span class="who">(${esc(top.ctrl.name)})</span> — odgovoriti?`;
          } else if (g.phase === 'combat' && g.step === 'attackers') {
            const atk = (g.combat && g.combat.attackers) || [];
            const dmg = atk.filter(a => a.attacking === this.me).reduce((s, a) => s + g.dmgAmount(a, 'normal'), 0);
            label = `⚔️ <b>Napadači proglašeni</b> (${atk.length}) — na tebe ide ${dmg} štete. Trenutak za instant.`;
          } else if (g.phase === 'combat' && g.step === 'blockers') {
            label = '🛡️ <b>Blokeri proglašeni</b> — zadnja šansa za trik prije štete.';
          } else if (g.phase === 'combat' && g.step === 'firstStrike') {
            label = '⚔️ <b>First-strike šteta gotova</b> — možeš reagovati prije obične štete.';
          } else if (MTG.isLastEndStepBeforeMyTurn(g, this.me)) {
            label = `🌙 <b>Kraj poteza</b> (${esc(g.turnPlayer.name)}) — zadnja prilika prije tvog poteza.`;
          } else if (g.phase === 'end') {
            label = `🌙 <b>Kraj poteza</b> (${esc(g.turnPlayer.name)}) — najbolji trenutak za instant.`;
          } else {
            label = '⚡ Prioritet — možeš odgovoriti.';
          }
          const ozc = MTG.offZoneCasts ? MTG.offZoneCasts(q.casts) : [];
          const inHandN = (q.casts || []).length - ozc.length;
          const hint = nOpt
            ? ` <span class="hintact">${nOpt} opcija${inHandN ? ' — tap na kartu u ruci' : ''}</span>`
            : '';
          bar.appendChild(el('div', 'ptext', label + hint));
          const oz2 = offZoneRow();
          if (oz2) bar.appendChild(oz2);
          const row = el('div', 'btnrow');
          row.appendChild(btn(MTG.isLastEndStepBeforeMyTurn(g, this.me) ? 'Nastavi na moj potez ▶' : 'Proceed ▶',
            () => this.resolvePending({ kind: 'pass' }), 'primary'));
          row.appendChild(btn('🔕 Ne prekidaj me više', () => {
            this.prioMode = 'off';
            this.toast('🔕 Ne pitam više. Stani ručno dugmetom 🖐️ (ili tipkom R).');
            this.resolvePending({ kind: 'pass' });
          }));
          bar.appendChild(row);
          break;
        }
        case 'attackers': {
          const n = pd.sel.length;
          bar.appendChild(el('div', 'ptext', `⚔️ Napad: izaberi napadače (${n}) — tap na stvorenje pa izaberi branitelja u popupu`));
          bar.appendChild(btn(n ? `Napadni! (${n})` : 'Bez napada ▶', () => this.resolvePending(pd.sel.map(s => ({ card: s.card, target: s.target }))), 'primary'));
          break;
        }
        case 'blockers': {
          bar.appendChild(el('div', 'ptext', `🛡️ Blokovi: tap napadača (gore), pa tap svog blokera`));
          const atkRow = el('div', 'atkrow');
          for (const a of q.attackers) {
            const chip = el('div', 'atkchipbig' + (pd.mode === a ? ' selchip' : ''), `⚔ ${esc(a.name)} ${a.power}/${a.toughness}${a.kw('flying') ? '✈' : ''}${a.kw('menace') ? '👿' : ''}${a.kw('trample') ? '💢' : ''}`);
            chip.onclick = () => { pd.mode = pd.mode === a ? null : a; this.render(); };
            atkRow.appendChild(chip);
          }
          bar.appendChild(atkRow);
          const blocks = [];
          for (const [b, a] of pd.assigns) blocks.push({ blocker: b, attacker: a });
          bar.appendChild(btn(blocks.length ? `Potvrdi blokove (${blocks.length})` : 'Bez blokova ▶', () => this.resolvePending(blocks), 'primary'));
          break;
        }
        case 'chooseTargets': {
          const min = q.min, max = q.max;
          bar.appendChild(el('div', 'ptext', `🎯 ${esc(q.prompt || 'Izaberi metu')} (${pd.sel.length}/${max})`));
          if (pd.sel.length >= min) bar.appendChild(btn('Potvrdi ✓', () => this.resolvePending(pd.sel.slice()), 'primary'));
          if (min === 0) bar.appendChild(btn('Preskoči', () => this.resolvePending([])));
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
      const k = q.kind || { icon: '🎯', label: 'Ciljano na tebe', cls: 'target', hint: '' };
      const d = q.card.def || {};
      const ov = el('div', 'overlay dark threatov');
      const m = el('div', 'modal threatmodal ' + k.cls);
      ov.appendChild(m);

      m.appendChild(el('div', 'threathead',
        `<span class="threatkind">${k.icon} ${esc(k.label)}</span>
         <span class="threatby">${esc(q.by.name)} ${q.source === 'ability' ? 'aktivira' : 'baca'} na tebe</span>`));

      const body = el('div', 'threatbody');
      body.innerHTML = `
        <img class="threatart" src="${imgURL(q.card.name, true)}" onerror="MTG.imgFail(this)">
        <div class="threatinfo">
          <div class="threatname">${esc(q.card.name)}${q.abilityLabel ? ` <span class="threatab">— ${esc(q.abilityLabel)}</span>` : ''}</div>
          <div class="threatcost">${costHTML(d.cost || '')} <span class="threattype">${esc([(d.super || []).join(' '), (d.types || []).join(' ')].filter(Boolean).join(' '))}${(d.subtypes || []).length ? ' — ' + esc(d.subtypes.join(' ')) : ''}</span></div>
          <div class="threattargets">🎯 Meta: <b>${(q.names || []).map(n => esc(n)).join(', ')}</b></div>
          <div class="threatoracle">${esc(d.oracle || '').replace(/\n/g, '<br>')}</div>
          ${k.hint ? `<div class="threathint">💡 ${esc(k.hint)}</div>` : ''}
        </div>`;
      m.appendChild(body);

      const canAnswer = this.myInstantCount(g) > 0;
      const row = el('div', 'btnrow');
      const ok = el('button', 'pbtn primary', 'Vidio sam ▶');
      ok.onclick = () => { this.threatTargets = null; this.resolvePending(null); };
      const hold = el('button', 'pbtn' + (canAnswer ? ' hot' : ''),
        canAnswer ? '⚡ Odgovoriću (HOLD)' : '⚡ HOLD (nemam odgovor u ruci)');
      hold.onclick = () => {
        this.holdNext = true;
        this.threatTargets = null;
        this.toast('🖐️ HOLD armiran — igra staje čim dobiješ prioritet.');
        this.resolvePending(null);
      };
      row.appendChild(ok); row.appendChild(hold);
      m.appendChild(row);
      m.appendChild(el('div', 'threatfoot',
        canAnswer
          ? 'Imaš karte koje možeš baciti kao odgovor — „Odgovoriću" zaustavlja igru na sljedećem prioritetu.'
          : 'Nemaš instant-speed odgovor u ruci, ali HOLD i dalje radi (sposobnosti, landovi…).'));

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
      const types = ['mulligan', 'bottomCards', 'chooseCards', 'chooseOption', 'chooseMulti', 'chooseX', 'scry', 'orderTriggers', 'combatReview'];
      if (!types.includes(q.type)) return null;
      const ov = el('div', 'overlay');
      const m = el('div', 'modal');
      ov.appendChild(m);
      const btn = (label, fn, cls) => { const b = el('button', 'pbtn ' + (cls || ''), label); b.onclick = fn; return b; };

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
        m.appendChild(el('div', 'combatkicker', 'COMBAT · NAPADAČI PROGLAŠENI'));
        m.appendChild(el('div', 'combatreviewhead',
          `<div><b>${esc(attacker ? attacker.name : 'Igrač')}</b> napada sa ${attackers.length} ${U.plural(attackers.length, 'stvorenjem', 'stvorenjima')}.</div>` +
          `<span class="${atMe.length ? 'danger' : 'safe'}">${atMe.length ? `TEBE NAPADA ${atMe.length}` : 'NE UČESTVUJEŠ'}</span>`));
        const body = el('div', 'combatreviewlanes');
        for (const [target, cards] of lanes) {
          const rawDamage = cards.reduce((sum, card) => sum + g.dmgAmount(card, 'normal'), 0);
          const lane = el('div', 'combatreviewlane' + (target === this.me ? ' tome' : ''));
          const laneHead = el('div', 'combatreviewtarget');
          laneHead.innerHTML = `<div><small>BRANITELJ</small><b>${esc(target.name)}</b></div>` +
            `<div class="combatestimate"><strong>${rawDamage}</strong><span>moguće štete</span></div>`;
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
          ? 'Pregledaj napadače. Nakon Proceed slijede attack triggeri, priority i izbor blokova.'
          : 'Ovaj napad nije usmjeren na tebe, ali combat ostaje vidljiv i pod tvojom kontrolom.'));
        m.appendChild(btn('Proceed ▶', () => this.resolvePendingEntry(pd, null), 'primary wide combatproceed'));
        return ov;
      }

      if (q.type === 'orderTriggers') {
        pd.order = pd.order || q.triggers.slice();
        m.classList.add('triggerordermodal');
        m.appendChild(el('div', 'mtitle', esc(q.prompt)));
        m.appendChild(el('div', 'orderhint', 'Prvi red ide na dno; posljednji će se prvi razriješiti.'));
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
        m.appendChild(btn('Potvrdi redoslijed', () => this.resolvePending(pd.order.slice()), 'primary wide'));
        return ov;
      }

      if (q.type === 'mulligan') {
        m.appendChild(el('div', 'mtitle', `Početna ruka (${q.free ? 'besplatan mulligan' : 'mulligan #' + (q.mulls + 1)})`));
        m.appendChild(this.cardGrid(g, q.player.hand, null));
        const row = el('div', 'btnrow');
        row.appendChild(btn('Zadrži ✓', () => this.resolvePending(false), 'primary'));
        row.appendChild(btn('Mulligan ↺', () => this.resolvePending(true), 'danger'));
        m.appendChild(row);
        return ov;
      }
      if (q.type === 'bottomCards') {
        m.appendChild(el('div', 'mtitle', `Vrati ${q.n} na dno biblioteke`));
        m.appendChild(this.cardGrid(g, q.player.hand, { min: q.n, max: q.n }));
        const row = el('div', 'btnrow');
        const b = btn('Potvrdi ✓', () => { if (pd.sel.length === q.n) this.resolvePending(pd.sel.slice()); }, 'primary');
        row.appendChild(b);
        m.appendChild(row);
        return ov;
      }
      if (q.type === 'chooseCards') {
        m.appendChild(el('div', 'mtitle', esc(q.prompt || 'Izaberi karte') + ` (${q.min}–${q.max})`));
        m.appendChild(this.cardGrid(g, q.from, { min: q.min, max: q.max }));
        const row = el('div', 'btnrow');
        if (pd.sel.length >= q.min) row.appendChild(btn(`Potvrdi ✓ (${pd.sel.length})`, () => this.resolvePending(pd.sel.slice()), 'primary'));
        if (q.min === 0) row.appendChild(btn('Ništa', () => this.resolvePending([])));
        m.appendChild(row);
        return ov;
      }
      if (q.type === 'chooseOption') {
        m.appendChild(el('div', 'mtitle', esc(q.prompt || 'Izaberi')));
        for (const o of q.options) {
          m.appendChild(btn(esc(o.label), () => this.resolvePending(o.key), 'wide'));
        }
        return ov;
      }
      if (q.type === 'chooseMulti') {
        m.appendChild(el('div', 'mtitle', esc(q.prompt || 'Izaberi')));
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
        if (chosen.length >= (q.min || 1)) m.appendChild(btn('Potvrdi ✓', () => this.resolvePending(chosen.slice()), 'primary wide'));
        return ov;
      }
      if (q.type === 'chooseX') {
        pd.xVal = pd.xVal === undefined ? Math.min(q.max, Math.max(q.min, q.max)) : pd.xVal;
        m.appendChild(el('div', 'mtitle', esc(q.prompt || 'Izaberi X') + ` (${q.min}–${q.max})`));
        const xrow = el('div', 'xrow');
        const minus = btn('−', () => { pd.xVal = Math.max(q.min, pd.xVal - 1); this.render(); });
        const plus = btn('+', () => { pd.xVal = Math.min(q.max, pd.xVal + 1); this.render(); });
        xrow.appendChild(minus);
        xrow.appendChild(el('div', 'xval', String(pd.xVal)));
        xrow.appendChild(plus);
        m.appendChild(xrow);
        m.appendChild(btn(`Potvrdi X=${pd.xVal} ✓`, () => this.resolvePending(pd.xVal), 'primary wide'));
        return ov;
      }
      if (q.type === 'scry') {
        pd.scryState = pd.scryState || q.cards.map(() => 'top');
        m.appendChild(el('div', 'mtitle', esc(q.prompt || 'Scry') + ' — tap mijenja vrh/dno'));
        const grid = el('div', 'cardgrid');
        q.cards.forEach((c, i) => {
          const cc = this.bigCardEl(c);
          cc.classList.add(pd.scryState[i] === 'top' ? 'scrytop' : 'scrybottom');
          cc.appendChild(el('div', 'scrylabel', pd.scryState[i] === 'top' ? 'VRH' : 'DNO'));
          cc.onclick = () => { pd.scryState[i] = pd.scryState[i] === 'top' ? 'bottom' : 'top'; this.render(); };
          grid.appendChild(cc);
        });
        m.appendChild(grid);
        m.appendChild(btn('Potvrdi ✓', () => {
          const top = [], bottom = [];
          q.cards.forEach((c, i) => (pd.scryState[i] === 'top' ? top : bottom).push(c));
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
      const name = (c.name || (c.card && c.card.name) || '?');
      cc.innerHTML = `
        <img loading="lazy" src="${imgURL(name)}" onerror="MTG.imgFail(this,'noimg')">
        <div class="bcname">${esc(name)}</div>`;
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
      return pd.q.candidates.includes(x) && !pd.sel.includes(x);
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
      pd.sel.push(x);
      if (pd.sel.length >= pd.q.max) { this.resolvePending(pd.sel.slice()); return; }
      this.render();
    }

    startManualPick(label, cb, opts = {}) {
      this.showJudge = false;
      this.manualPick = { label, cb, players: opts.players };
      this.render();
      this.toast('🎯 ' + label + ' — tap na metu');
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

      modal.appendChild(el('div', 'combatkicker', 'PROGLASI NAPADAČA'));
      modal.appendChild(el('div', 'attackpicktitle', 'Koga napada <b>' + esc(attacker.name) + '</b>?'));
      const body = el('div', 'attackpickbody');
      const card = el('div', 'attackpickcard');
      const keywords = ['flying', 'trample', 'menace', 'first strike', 'double strike', 'deathtouch', 'lifelink']
        .filter(k => attacker.kw(k));
      card.innerHTML = `<img src="${imgURL(attacker.name, true)}" onerror="MTG.imgFail(this)">` +
        `<div><b>${esc(attacker.name)}</b><span>${attacker.power}/${attacker.toughness}</span>` +
        `<small>${keywords.length ? esc(keywords.join(' · ')) : 'bez combat keyworda'}</small></div>`;
      body.appendChild(card);

      const choices = el('div', 'attacktargets');
      for (const target of pd.q.opponents) {
        const creatures = g.creatures(target);
        const blockers = creatures.filter(c => !c.tapped && !c.cur.cantBlock && g.canBlock(c, attacker));
        const option = el('button', 'attacktarget' + (selected && selected.target === target ? ' selected' : ''));
        const meta = MTG.DECK_META[target.deckName] || {};
        option.innerHTML = `<span class="attacktargeticon">${meta.icon || '🛡️'}</span>` +
          `<span class="attacktargetmain"><b>${esc(target.name)}</b><small>${esc(target.deckName || '')}</small></span>` +
          `<span class="attacktargetstats"><strong>${target.life}❤</strong><small>${blockers.length} mogućih blokera · ✋${target.hand.length}</small></span>` +
          `<span class="attacktargetgo">→</span>`;
        option.onclick = () => {
          if (selected) selected.target = target;
          else pd.sel.push({ card: attacker, target });
          this.attackPicker = null;
          this.render();
        };
        choices.appendChild(option);
      }
      body.appendChild(choices);
      modal.appendChild(body);
      const foot = el('div', 'attackpickfoot');
      if (selected) {
        const remove = el('button', 'pbtn danger', 'Ne šalji u napad');
        remove.onclick = () => {
          pd.sel.splice(pd.sel.indexOf(selected), 1);
          this.attackPicker = null;
          this.render();
        };
        foot.appendChild(remove);
      }
      const cancel = el('button', 'pbtn', 'Odustani');
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
      if (!this.game.canBlock(b, a)) { this.toast('Ne može blokirati (flying/menace/…)'); return; }
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
        const cb = el('button', 'pbtn wide', 'Zatvori');
        cb.onclick = () => { this.sheet = null; this.render(); };
        cm.appendChild(cb);
        ov.appendChild(cm);
        return ov;
      }
      const m = el('div', 'sheet');
      ov.appendChild(m);
      const img = el('img', 'sheetimg');
      img.src = imgURL(card.name, true);
      img.onerror = () => img.classList.add('noimg');
      m.appendChild(img);
      const info = el('div', 'sheetinfo');
      const typeLine = [(card.def.super || []).join(' '), card.def.types.join(' '), card.def.subtypes.length ? '— ' + card.def.subtypes.join(' ') : ''].join(' ');
      info.innerHTML = `<div class="sname">${esc(card.name)} ${costHTML(card.def.cost || '')}</div>
        <div class="stype">${esc(typeLine)}</div>
        ${card.is('Creature') && card.cur ? `<div class="spt">${card.power}/${card.toughness}${card.tapped ? ' · TAPPED' : ''}${Object.entries(card.counters).filter(([k, v]) => v > 0).map(([k, v]) => ` · ${v}×${k}`).join('')}</div>` : ''}
        <div class="soracle">${esc(card.def.oracle || '').replace(/\n/g, '<br>')}</div>
        ${card.def.simplified ? `<div class="simplified">⚠️ ${esc(card.def.simplified)}</div>` : ''}`;
      m.appendChild(info);
      // actions
      const acts = el('div', 'sheetacts');
      const pd = this.pending;
      if (pd && (pd.q.type === 'main' || pd.q.type === 'priority')) {
        const q = pd.q;
        for (const e of (q.casts || [])) {
          if (e.card !== card) continue;
          const cost = g.spellCost(card.owner, card, e.alt ? Object.assign({}, e.alt) : {});
          let label = e.alt ? (e.alt.adventure ? `Avantura: ${e.alt.name} ${U.costStr(U.parseCost(e.alt.cost || ''))}` : (e.alt.label || 'Alternativno')) : `Baci ${U.costStr(cost)}`;
          if (e.from === 'command') label += ' (commander)';
          if (e.from === 'graveyard') label += ' (iz groblja)';
          if (e.from === 'exile') label = 'Igraj iz egzila' + (e.alt && e.alt.free ? ' (besplatno)' : '');
          const b = el('button', 'pbtn primary wide', esc(label));
          b.onclick = () => { this.sheet = null; this.resolvePending({ kind: 'cast', card, alt: e.alt, from: e.from }); };
          acts.appendChild(b);
        }
        for (const l of (q.lands || [])) {
          if (l !== card) continue;
          const b = el('button', 'pbtn primary wide', 'Igraj land');
          b.onclick = () => { this.sheet = null; this.resolvePending({ kind: 'land', card }); };
          acts.appendChild(b);
        }
        const usedAbilities = new Set();
        for (const a of (q.acts || [])) {
          if (a.card !== card) continue;
          if (a.ability) usedAbilities.add(a.ability);
          let label = a.cycling ? 'Cycling' : a.plot ? `Plot ${U.costStr(U.parseCost(card.def.plot))}` : a.suspend ? 'Suspend' :
            a.equip ? `Equip ${U.costStr(U.parseCost(card.def.equip))}` : a.crew ? `Crew ${card.def.crew}` :
              (a.ability && a.ability.label) || 'Aktiviraj';
          const b = el('button', 'pbtn wide', '⚙️ ' + esc(label));
          b.onclick = () => { this.sheet = null; this.resolvePending({ kind: 'activate', entry: a }); };
          acts.appendChild(b);
        }
        // show unavailable abilities greyed-out, so igrač vidi šta karta može
        if (card.zone === 'battlefield' && card.ctrl === this.me && card.def.abilities) {
          for (const ab of card.def.abilities) {
            if (usedAbilities.has(ab) || !ab.label) continue;
            const b = el('button', 'pbtn wide disabled', `⚙️ ${esc(ab.label)} — nedostupno sad`);
            b.disabled = true;
            acts.appendChild(b);
          }
        }
        if (card.zone === 'command' && !(q.casts || []).some(e => e.card === card)) {
          const cost = g.spellCost(card.owner, card, {});
          const b = el('button', 'pbtn wide disabled', `Baci ${U.costStr(cost)} — nema dovoljno mane / nije tvoja main faza`);
          b.disabled = true;
          acts.appendChild(b);
        }
      }
      const close = el('button', 'pbtn wide', 'Zatvori');
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
      }).join('') : '<div class="cdnone">— još ništa —</div>';
      m.appendChild(el('div', 'mtitle', `${meta.icon || ''} ${esc(p.name)} — ${esc(p.deckName)} · ${p.life}❤${p.lost ? ' · ☠️ ELIMINISAN' : ''}`));
      const own = (p.commanders && p.commanders.length) ? p.commanders : p.command;
      if (own.length) {
        const ZN = { battlefield: 'na tabli', command: 'u CZ', graveyard: 'groblje', exile: 'egzil', hand: 'ruka', library: 'biblioteka', stack: 'stack' };
        m.appendChild(el('div', 'cmdhint',
          `👑 Komander${own.length > 1 ? 'i (partneri)' : ''}: ` +
          own.map(c => `<b>${esc(c.name)}</b> <span style="color:#8a95a8">(${ZN[c.zone] || c.zone}${c.cmdCasts ? `, tax +${2 * c.cmdCasts}` : ''})</span>`).join(' · ')));
      }
      m.appendChild(el('div', 'cmddmg',
        `<b>Commander šteta primljena (21 = smrt):</b>` +
        (summed
          ? `<div class="cdnote">🏠 Kućno pravilo: šteta partnera se ZBRAJA po vlasniku.</div>`
          : `<div class="cdnote">Pravilo 903.10a: svaki komander ima svojih 21 — partneri se ne zbrajaju.</div>`) +
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
      if (!g.bf().some(c => c.ctrl === p)) grid.appendChild(el('div', 'emptyrow', 'Prazno'));
      m.appendChild(grid);
      const close = el('button', 'pbtn wide', 'Zatvori');
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
      const names = { graveyard: 'Groblje', exile: 'Egzil', command: 'Command zona' };
      m.appendChild(el('div', 'mtitle', `${esc(player.name)} — ${names[zone] || zone} (${player[zone].length})`));
      const grid = el('div', 'cardgrid');
      const judgeReturn = this.zoneBrowse.judgeReturn;
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
        grid.appendChild(cc);
      }
      if (!player[zone].length) grid.appendChild(el('div', 'emptyrow', 'Prazno'));
      m.appendChild(grid);
      const close = el('button', 'pbtn wide', 'Zatvori');
      close.onclick = () => { this.zoneBrowse = null; this.render(); };
      m.appendChild(close);
      return ov;
    }

    renderLog(g) {
      const ov = el('div', 'logpanel');
      const head = el('div', 'mtitle', '📜 Log partije');
      ov.appendChild(head);
      const box = el('div', 'logbox');
      for (let i = g.log.length - 1; i >= Math.max(0, g.log.length - 250); i--) {
        const e = g.log[i];
        box.appendChild(el('div', 'logline ' + (e.cls || ''), `<span class="lt">[${e.t}]</span> ${esc(e.msg)}`));
      }
      ov.appendChild(box);
      const close = el('button', 'pbtn wide', 'Zatvori');
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
        m.appendChild(el('div', 'importnote', 'Izvrši ono što karta kaže dugmadima ispod, pa "Gotovo".'));
      } else {
        m.appendChild(el('div', 'mtitle', '⚒️ Sudija-panel — ručne akcije'));
      }
      const grid = el('div', 'judgegrid');
      const jb = (label, fn) => {
        const b = el('button', 'pbtn', label);
        b.onclick = () => fn();
        grid.appendChild(b);
      };
      const askN = (def) => {
        const v = window.prompt('Koliko?', String(def || 1));
        const n = parseInt(v, 10);
        return isNaN(n) ? null : n;
      };
      const log = (msg) => { g.lg('⚒️ ručno: ' + msg); };

      jb('🎴 Vuci kartu', async () => { await g.draw(me, 1); log('draw 1'); this.queueRender(); });
      jb('💥 Šteta u metu…', () => {
        const n = askN(3); if (n === null) return;
        this.startManualPick(`${n} štete`, async (t) => { await g.damageAny(null, t, n); log(`${n} štete`); });
      });
      jb('☠️ Uništi metu…', () => {
        this.startManualPick('Uništi', async (t) => { if (t instanceof MTG.CardInst) { await g.destroy(t); log('uništeno: ' + t.name); } }, { players: false });
      });
      jb('🌀 Egzilaj metu…', () => {
        this.startManualPick('Egzilaj', async (t) => { if (t instanceof MTG.CardInst) { await g.exileCard(t); log('egzil: ' + t.name); } }, { players: false });
      });
      jb('↩️ Bounce u ruku…', () => {
        this.startManualPick('Vrati u ruku', async (t) => { if (t instanceof MTG.CardInst) { await g.move(t, 'hand'); log('bounce: ' + t.name); } }, { players: false });
      });
      jb('➕ +1/+1 counteri…', () => {
        const n = askN(1); if (n === null) return;
        this.startManualPick(`+${n} countera`, async (t) => { if (t instanceof MTG.CardInst) { g.addCounters(t, '+1/+1', n); } }, { players: false });
      });
      jb('📈 Pump ±X/±X…', () => {
        const p = askN(2); if (p === null) return;
        const t2 = askN(2); if (t2 === null) return;
        this.startManualPick(`${p >= 0 ? '+' : ''}${p}/${t2 >= 0 ? '+' : ''}${t2} do kraja poteza`, async (t) => {
          if (t instanceof MTG.CardInst) { MTG.E.pumpUntilEOT(g, t, p, t2); await g.checkSBA(); log(`pump ${p}/${t2}: ${t.name}`); }
        }, { players: false });
      });
      jb('🔄 Tap/untap metu…', () => {
        this.startManualPick('Tap/untap', async (t) => { if (t instanceof MTG.CardInst) { t.tapped = !t.tapped; log((t.tapped ? 'tap ' : 'untap ') + t.name); } }, { players: false });
      });
      jb('❤️ Život ±N…', () => {
        const n = askN(-3); if (n === null || !n) return;
        this.startManualPick(`Život ${n > 0 ? '+' : ''}${n}`, async (t) => {
          const pl = t instanceof MTG.Player ? t : t.ctrl;
          if (n > 0) await g.gainLife(pl, n); else await g.loseLife(pl, -n);
          log(`život ${n} → ${pl.name}`);
        });
      });
      jb('🔮 Dodaj manu…', async () => {
        const col = window.prompt('Boja (W/U/B/R/G/C)?', 'G');
        if (col && me.pool[col.toUpperCase()] !== undefined) { me.pool[col.toUpperCase()]++; log('+1 {' + col.toUpperCase() + '}'); this.queueRender(); }
      });
      jb('🪦 Vrati iz groblja…', () => {
        this.showJudge = false;
        this.zoneBrowse = { player: me, zone: 'graveyard', judgeReturn: true };
        this.render();
        this.toast('Tap na kartu u groblju da je vratiš na tablu');
      });
      // tokeni
      m.appendChild(el('div', 'mtitle small', 'Napravi token'));
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
      const close = el('button', 'pbtn wide', 'Zatvori');
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
      m.appendChild(el('div', 'mtitle', '❓ Kako se igra'));
      m.appendChild(el('div', 'helptext', `
<b>🎴 Igranje karata:</b> tap na kartu u ruci → otvara se prikaz sa dugmadima ("Baci", "Igraj land", "Cycling"…). Karte sa <span style="color:#5aa860">zelenim okvirom</span> se mogu igrati odmah. Mana se automatski tapuje.<br><br>
<b>👑 Commander:</b> stoji u COMMAND ZONI (panel iznad ruke) dok ga ne baciš — tap na njega pa "Baci". Kad umre, vraća se u command zonu (uz tax +2 po ponovnom bacanju). Na tabli ima 👑 značku i zlatni okvir.<br><br>
<b>⚙️ Sposobnosti i tokeni:</b> karta na tabli sa ⚙️ značkom ima sposobnost koju možeš aktivirati — tap na nju pa izaberi dugme (npr. "Napravi Food", "Vjeverica", equip, crew…). Tako se prave tokeni.<br><br>
<b>⚔️ Napad:</b> u combat fazi tap na svoje stvorenje, pa u velikom popupu izaberi kojeg igrača napada. Svaki proglašeni combat dobija pregled i čeka tvoj <b>Proceed</b>, čak i kad ne napadaju tebe. <b>🛡️ Blok:</b> prvo tap na napadača (u traci), pa na svog blokera.<br><br>
<b>🎯 Mete:</b> kad spell traži metu, legalne mete <span style="color:#e8c05a">zlatno svijetle</span> — tap na kartu ili na protivnikov panel.<br><br>
<b>Protivnici:</b> njihove table su stalno vidljive ispod imena. Tap na zaglavlje sklapa/otvara tablu, ℹ️ otvara detalje (groblje, commander šteta…).<br><br>
<b>⚡ Instanti i prioritet:</b> svaka protivnička nonland karta izlazi na centralni action stage i čeka tvoj <b>Proceed</b>. Dugme <b>STOP</b> gore bira dodatne priority prozore: samo end step prije tvog poteza, combat + end, samo obavezne akcije ili full control.<br>
<b>🖐️ HOLD (tipka R):</b> kad god hoćeš da staneš — armiraj ga i igra će stati na sljedećem prioritetu. Radi u svim režimima.<br>
<b>🐢 Brzina:</b> dugme ▶️/🐢/⏩ gore mijenja tempo botova. Kad bot cilja tebe, napada te ili blokira tvoj napad, dobiješ crvenu traku preko ekrana da se vidi šta radi.<br>
Sorcerije i stvorenja možeš igrati samo u svojoj glavnoj fazi; instanti i karte sa flash idu bilo kad kad imaš prioritet.`));
      const close = el('button', 'pbtn primary wide', 'Jasno! ▶');
      close.onclick = () => { this.showHelp = false; this.render(); };
      m.appendChild(close);
      return ov;
    }

    renderStopSettings(g) {
      const ov = el('div', 'overlay dark stopoverlay');
      ov.onclick = e => { if (e.target === ov) { this.showStops = false; this.render(); } };
      const m = el('div', 'modal stopmodal');
      ov.appendChild(m);
      m.appendChild(el('div', 'mtitle', 'Priority stopovi'));
      m.appendChild(el('div', 'stopintro', 'Odigrane protivničke nonland karte se uvijek pokažu na action stageu. Ovdje biraš dodatne prazne priority prozore.'));
      const list = el('div', 'stopprofiles');
      for (const mode of MTG.PRIO_MODES) {
        const selected = mode.key === this.prioMode;
        const row = el('button', 'stopprofile' + (selected ? ' selected' : ''));
        row.innerHTML = `<span class="stopicon">${mode.icon}</span><span><b>${esc(mode.label)}</b><small>${esc(mode.desc)}</small></span><i>${selected ? 'AKTIVNO' : ''}</i>`;
        row.onclick = () => {
          this.prioMode = mode.key;
          localStorage.setItem('mtgStopProfile', mode.key);
          this.showStops = false;
          this.toast(`${mode.icon} Stopovi: ${mode.label}`);
          this.render();
        };
        list.appendChild(row);
      }
      m.appendChild(list);
      const close = el('button', 'pbtn wide', 'Zatvori');
      close.onclick = () => { this.showStops = false; this.render(); };
      m.appendChild(close);
      return ov;
    }

    renderGameOver(g) {
      const ov = el('div', 'overlay dark');
      const m = el('div', 'modal');
      const won = g.winner === this.me;
      m.appendChild(el('div', 'gameover', won ? '🏆 POBIJEDIO SI!' : `☠️ ${g.winner ? esc(g.winner.name) + ' pobjeđuje' : 'Kraj'}`));
      const b = el('button', 'pbtn primary wide', 'Nova partija');
      b.onclick = () => location.reload();
      m.appendChild(b);
      const l = el('button', 'pbtn wide', 'Pogledaj log');
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
