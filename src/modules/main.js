// ===== main.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Setup screen + game bootstrap (browser only)
(function () {
  if (typeof document === 'undefined') return;
  const U = MTG;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const COLHEX = { W: '#e8e3c8', U: '#4a90d9', B: '#8a6f9a', R: '#d95a4a', G: '#5aa860' };

  function commanderImg(deckName) {
    const d = MTG.DECKS[deckName];
    return artURL(d.commander);
  }
  function artURL(name) {
    const face = String(name).split(' // ')[0];
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(face)}&format=image&version=art_crop`;
  }
  function cardImg(name) {
    const face = String(name).split(' // ')[0];
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(face)}&format=image&version=small`;
  }
  function typeLine(def) {
    return `${(def.super || []).join(' ')} ${(def.types || []).join(' ')}${(def.subtypes || []).length ? ' — ' + def.subtypes.join(' ') : ''}`.trim();
  }

  function renderSetup() {
    const root = $('#setup');
    root.innerHTML = '';
    const nDecks = Object.keys(MTG.DECKS).filter(d => !MTG.DECKS[d].custom).length;
    // zaglavlje po dizajnu menija: romb-znak lijevo, naslov, status pilula desno
    const head = el('div', 'menuhead');
    head.innerHTML = `
      <div class="menumark" aria-hidden="true"></div>
      <div class="menutitles">
        <h1 class="title">MTG Commander Simulator</h1>
        <div class="subtitle">${nDecks} pravih precon deckova · 2023–2026 · biraj komandera i partnere</div>
      </div>
      <div class="menupill"><span class="dot"></span>Priprema partije</div>`;
    root.appendChild(head);

    const state = {
      deck: null, ai: 3, difficulty: 'normal', seed: '',
      aiStyles: ['random', 'random', 'random'],
      commanders: [], aiRandomCommanders: false, sumPartnerDamage: false,
    };

    const grid = el('div', 'setupgrid');
    root.appendChild(grid);
    const left = el('div', 'setupleft');
    const right = el('div', 'setupright');
    grid.appendChild(left); grid.appendChild(right);

    left.appendChild(el('div', 'seclabel', '<i>01</i> Izaberi svoj precon'));
    const deckList = el('div', 'decklist');
    for (const [name, deck] of Object.entries(MTG.DECKS)) {
      const meta = MTG.DECK_META[name] || {};
      const card = el('div', 'deckcard');
      card.innerHTML = `
        <img class="deckart" loading="lazy" src="${commanderImg(name)}" onerror="MTG.imgFail(this)">
        <div class="deckinfo">
          <div class="deckname">${meta.icon || ''} ${esc(name)}</div>
          <div class="deckcmd">👑 ${esc(deck.commander)}</div>
          <div class="deckcolors">${(meta.colors || []).map(c => `<span class="dot big" style="background:${COLHEX[c]}"></span>`).join('')} <span class="deckstyle">${esc(meta.style || '')}</span></div>
          <div class="deckblurb">${esc(meta.blurb || '')}</div>
          <div class="deckset">${esc(meta.set || '')}</div>
        </div>`;
      card.onclick = () => {
        state.deck = name;
        state.commanders = [deck.commander];
        deckList.querySelectorAll('.deckcard').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        startBtn.disabled = false;
        renderCmdBox();
        updateStartLabel();
      };
      deckList.appendChild(card);
    }
    left.appendChild(deckList);

    // ---------- 2 · KOMANDER ----------
    right.appendChild(el('div', 'seclabel', '<i>02</i> Komander'));
    const cmdBox = el('div', 'cmdbox');
    right.appendChild(cmdBox);
    const updateStartLabel = () => {
      if (!state.deck) return;
      const c = state.commanders;
      startBtn.textContent = `Kreni: ${state.deck} · ${c.map(n => n.split(',')[0]).join(' + ')} ▶`;
    };
    function renderCmdBox() {
      cmdBox.innerHTML = '';
      if (!state.deck) { cmdBox.appendChild(el('div', 'cmdhint', 'Prvo izaberi deck lijevo.')); return; }
      const deck = MTG.DECKS[state.deck];
      const legals = MTG.legalCommanders(deck, MTG.DEFS);
      const chosen = el('div', 'cmdchosen');
      for (const nm of state.commanders) {
        const def = MTG.DEFS[nm] || {};
        const tag = MTG.cmdTag(def);
        const chip = el('div', 'cmdchip');
        chip.innerHTML = `
          <img loading="lazy" src="${artURL(nm)}" onerror="MTG.imgFail(this)">
          <div class="cmdchipinfo">
            <div class="cmdchipname">👑 ${esc(nm)}</div>
            <div class="cmdchiptype">${esc(typeLine(def))}</div>
            ${tag.kind ? `<div class="cmdbadge">${esc(MTG.cmdTagLabel(tag))}</div>` : ''}
          </div>`;
        chosen.appendChild(chip);
      }
      cmdBox.appendChild(chosen);
      const partnerable = legals.filter(l => l.tag.kind).length;
      cmdBox.appendChild(el('div', 'cmdhint',
        `${legals.length} legalnih komandera u ovom deku` +
        (partnerable ? ` · ${partnerable} sa partner sposobnošću 🤝` : '') +
        (state.commanders.length === 2 ? ' · igraš sa DVA komandera' : '')));
      const btn = el('button', 'pbtn wide', legals.length > 1 ? '🔄 Promijeni komandera / partnere' : '🔒 Ovaj deck ima samo jednog');
      btn.disabled = legals.length <= 1;
      btn.onclick = async () => {
        const res = await pickCommanders(state.deck, state.commanders);
        if (res) { state.commanders = res; renderCmdBox(); updateStartLabel(); }
      };
      cmdBox.appendChild(btn);
    }

    right.appendChild(el('div', 'seclabel', '<i>03</i> Protivnici <em>AI dobijaju nasumične precone</em>'));
    const aiRow = el('div', 'btnrow center');
    const botStyles = el('div', 'botstyles');
    const styleOptions = [['random', '🎲 Nasumičan stil']]
      .concat(Object.entries(MTG.AI_STYLES).map(([k, s]) => [k, `${s.icon} ${s.label}`]));
    const STYLE_DESC = {
      aggressive: 'Napada bez milosti, juri ranjene igrače, ne voli da blokira.',
      opportunist: 'Izbjegava najjačeg i navaljuje na ranjene. Kljuca svakoga ko posrne.',
      passive: 'Kornjača: gradi tablu, čuva blokere, udara tek kad je sigurno.',
      teaser: 'Haos: bocka sve pomalo, mijenja mete, obožava goad i politiku.',
      balanced: 'Standardna, uravnotežena AI logika.',
      random: 'Svaki bot dobija nasumičnu ličnost (vidjećeš je u igri).',
    };
    const renderBotStyles = () => {
      botStyles.innerHTML = '';
      const botNames = ['AI Zmaj', 'AI Vuk', 'AI Gavran'];
      for (let i = 0; i < state.ai; i++) {
        const row = el('div', 'botstylerow');
        const badge = el('span', 'pbadge');
        const setBadge = k => {
          badge.className = 'pbadge ' + (['aggressive', 'opportunist', 'passive', 'teaser'].includes(k) ? 'p-' + k : 'p-none');
          badge.textContent = ['aggressive', 'opportunist', 'passive', 'teaser'].includes(k)
            ? '' : (k === 'random' ? '🎲' : '⚖️');
          badge.title = STYLE_DESC[k] || '';
        };
        setBadge(state.aiStyles[i]);
        const lbl = el('span', 'botname', esc(botNames[i]));
        const sel = el('select', 'styleselect');
        for (const [k, label] of styleOptions) {
          const o = el('option', '', label);
          o.value = k;
          if (state.aiStyles[i] === k) o.selected = true;
          sel.appendChild(o);
        }
        const desc = el('div', 'styledesc', STYLE_DESC[state.aiStyles[i]] || '');
        sel.onchange = () => { state.aiStyles[i] = sel.value; desc.textContent = STYLE_DESC[sel.value] || ''; setBadge(sel.value); };
        row.appendChild(badge); row.appendChild(lbl); row.appendChild(sel);
        botStyles.appendChild(row);
        botStyles.appendChild(desc);
      }
    };
    for (const n of [1, 2, 3]) {
      const b = el('button', 'pbtn choice' + (n === 3 ? ' selected' : ''), `${n} AI ${n === 1 ? '(duel)' : n === 3 ? '(puni pod)' : ''}`);
      b.onclick = () => { state.ai = n; aiRow.querySelectorAll('.pbtn').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); renderBotStyles(); };
      aiRow.appendChild(b);
    }
    right.appendChild(aiRow);
    right.appendChild(el('div', 'seclabel', '<i>·</i> Stil AI botova'));
    right.appendChild(botStyles);
    renderBotStyles();

    const randRow = el('label', 'cmdcheck');
    randRow.innerHTML = '<input type="checkbox"> <span>🎲 AI botovi biraju nasumične (i partner) komandere</span>';
    randRow.querySelector('input').onchange = e => { state.aiRandomCommanders = e.target.checked; };
    right.appendChild(randRow);

    const houseRow = el('label', 'cmdcheck');
    houseRow.title = 'Zvanično pravilo 903.10a: 21 šteta od ISTOG komandera. ' +
      'Uključi ovo ako tvoja grupa igra da se šteta oba partnera zbraja.';
    houseRow.innerHTML = '<input type="checkbox"> <span>🏠 Kućno pravilo: šteta oba partnera se ZBRAJA (nije po 903.10a)</span>';
    houseRow.querySelector('input').onchange = e => { state.sumPartnerDamage = e.target.checked; };
    right.appendChild(houseRow);

    right.appendChild(el('div', 'seclabel', '<i>04</i> Težina'));
    const diffRow = el('div', 'btnrow center');
    for (const [k, label] of [['normal', 'Normalna'], ['tough', 'Teška']]) {
      const b = el('button', 'pbtn choice' + (k === 'normal' ? ' selected' : ''), label);
      b.onclick = () => { state.difficulty = k; diffRow.querySelectorAll('.pbtn').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); };
      diffRow.appendChild(b);
    }
    right.appendChild(diffRow);

    const startBtn = el('button', 'pbtn primary start', 'Prvo izaberi deck…');
    startBtn.disabled = true;
    startBtn.onclick = () => startGame(state);
    right.appendChild(startBtn);
    renderCmdBox();

    right.appendChild(el('div', 'credits',
      'Sve karte i slike: <b>Scryfall</b>. Fiksni skup zvaničnih WotC precona prolazi zasebnu card-by-card certifikaciju.'));
  }

  // ---------- Izbor komandera (1 ili 2 partnera) ----------
  function pickCommanders(deckName, current) {
    const deck = MTG.DECKS[deckName];
    const legals = MTG.legalCommanders(deck, MTG.DEFS);
    let sel = (current && current.length ? current : [deck.commander]).slice(0, 2);

    return new Promise(resolve => {
      const ov = el('div', 'overlay dark');
      const m = el('div', 'modal wide');
      m.appendChild(el('div', 'mtitle', `👑 Komanderi — ${esc(deckName)}`));
      m.appendChild(el('div', 'cmdhint',
        'Klikni kartu da je izabereš. Karte sa 🤝 <b>Partner</b> mogu ići u paru — ' +
        'izaberi jednu, pa klikni drugu koja joj odgovara (obrubljene zeleno). ' +
        'Ostatak deka ostaje isti; neizabrani legendarci idu u biblioteku.'));

      const grid = el('div', 'cmdgrid');
      m.appendChild(grid);
      const status = el('div', 'cmdstatus');
      m.appendChild(status);

      const row = el('div', 'btnrow');
      const okBtn = el('button', 'pbtn primary', 'Potvrdi ✔');
      const defBtn = el('button', 'pbtn', '↩ Originalni');
      const cancel = el('button', 'pbtn danger', 'Otkaži');
      row.appendChild(okBtn); row.appendChild(defBtn); row.appendChild(cancel);
      m.appendChild(row);

      function draw() {
        grid.innerHTML = '';
        const soloDef = sel.length === 1 ? MTG.DEFS[sel[0]] : null;
        for (const L of legals) {
          const on = sel.indexOf(L.name) >= 0;
          const pairable = !!soloDef && !on && MTG.canPartner(soloDef, L.def);
          const c = el('div', 'cmdopt' + (on ? ' selected' : '') + (pairable ? ' pairable' : ''));
          c.innerHTML = `
            <img loading="lazy" src="${cardImg(L.name)}" onerror="MTG.imgFail(this)">
            <div class="cmdoptinfo">
              <div class="cmdoptname">${on ? '👑 ' : ''}${esc(L.name)}${L.isDefault ? ' <span class="deft">(originalni)</span>' : ''}</div>
              <div class="cmdopttype">${esc(typeLine(L.def))} · ${esc(L.def.cost || '')}</div>
              ${L.tag.kind ? `<div class="cmdbadge">${esc(L.partnerLabel)}</div>` : ''}
            </div>`;
          c.onclick = () => {
            const i = sel.indexOf(L.name);
            if (i >= 0) { if (sel.length > 1) sel.splice(i, 1); }
            else if (sel.length === 1 && MTG.canPartner(MTG.DEFS[sel[0]], L.def)) sel.push(L.name);
            else sel = [L.name];
            draw();
          };
          grid.appendChild(c);
        }
        const v = MTG.validateCommanders(deck, sel, MTG.DEFS);
        status.className = 'cmdstatus ' + (v.ok ? 'good' : 'bad');
        status.innerHTML = v.ok
          ? `✅ ${sel.map(n => esc(n)).join(' <b>+</b> ')}${sel.length === 2 ? ' — dva komandera' : ''}`
          : `⛔ ${esc(v.why)}`;
        okBtn.disabled = !v.ok;
      }
      draw();

      okBtn.onclick = () => { ov.remove(); resolve(sel.slice()); };
      defBtn.onclick = () => { sel = [deck.commander]; draw(); };
      cancel.onclick = () => { ov.remove(); resolve(null); };
      ov.onclick = e => { if (e.target === ov) { ov.remove(); resolve(null); } };
      ov.appendChild(m);
      document.body.appendChild(ov);
    });
  }

  function startGame(state) {
    const allDecks = Object.keys(MTG.DECKS).filter(d => d !== state.deck && !MTG.DECKS[d].custom);
    const seed = state.seed ? parseInt(state.seed, 10) : Math.floor(Math.random() * 1e9);
    const rnd = MTG.mulberry32(seed);
    MTG.shuffle(allDecks, rnd);
    const aiDecks = allDecks.slice(0, state.ai);

    const ui = new MTG.UI();
    $('#setup').style.display = 'none';
    $('#game').style.display = 'flex';

    const g = MTG.newGame({
      humanDeck: state.deck,
      aiDecks,
      aiStyles: state.aiStyles.slice(0, state.ai),
      humanCommanders: (state.commanders && state.commanders.length) ? state.commanders : undefined,
      aiRandomCommanders: state.aiRandomCommanders,
      sumPartnerDamage: state.sumPartnerDamage,
      seed,
      difficulty: state.difficulty,
      humanName: 'Ti',
      maxTurns: 200,
      paced: true,
      humanController: (p) => { ui.me = p; return ui.controllerFor(p); },
      onEvent: (e) => {
        if (e.type === 'turn' && e.p) ui.showBanner(e.p === ui.me ? '⭐ TVOJ POTEZ' : `Potez ${g.turnNo} — ${e.p.name}`, e.p === ui.me);
        if (e.type === 'spotlight') ui.showSpot(e.text, e.kind);
        ui.queueRender();
      },
    });
    ui.game = g;
    ui.applySpeed();
    window._game = g;
    window._ui = ui;
    ui.render();
    const cmdTxt = (state.commanders || []).map(n => n.split(',')[0]).join(' + ');
    ui.toast(`Seed: ${seed} · 👑 ${cmdTxt} · Protivnici: ${aiDecks.join(', ')}`);
    g.start().catch(err => {
      console.error(err);
      ui.toast('Greška u igri: ' + err.message);
    });
  }

  // Stabilan, semantički prikaz trenutno vidljivog stanja. Koriste ga desktop
  // smoke-testovi i card-by-card scenariji; ne sadrži skrivene biblioteke AI-a.
  MTG.renderGameState = function () {
    const g = window._game;
    const ui = window._ui;
    if (!g) return { mode: 'setup', deckCount: MTG.DECKS ? Object.keys(MTG.DECKS).length : 0 };
    const card = c => ({
      id: c.iid, name: c.name, zone: c.zone, tapped: !!c.tapped,
      power: c.is('Creature') ? c.power : undefined,
      toughness: c.is('Creature') ? c.toughness : undefined,
      attacking: c.attacking ? c.attacking.name : null,
      blocking: c.blocking || null,
      attachedTo: c.attachedTo ? (g.byIid(c.attachedTo)?.name || c.attachedTo) : null,
      attachments: (c.attachments || []).map(iid => g.byIid(iid)?.name || iid),
      counters: Object.fromEntries(Object.entries(c.counters || {}).filter(([, n]) => n)),
    });
    const players = g.players.map(p => ({
      name: p.name, deck: p.deckName, life: p.life, lost: !!p.lost, isAI: !!p.isAI,
      handCount: p.hand.length, libraryCount: p.library.length,
      graveyardCount: p.graveyard.length, exileCount: p.exile.length,
      commanders: p.commanders.map(card),
      battlefield: g.battlefield.filter(c => c.ctrl === p).map(card),
      hand: p === ui.me ? p.hand.map(card) : undefined,
    }));
    const pending = ui && ui.pending ? ui.pending.q : (ui && ui.react ? ui.react.q : null);
    return {
      mode: g.gameOver ? 'gameover' : 'game',
      coordinateSystem: 'Commander seats are ordered by players[]; the human seat is marked isAI=false.',
      turn: g.turnNo, activePlayer: g.turnPlayer ? g.turnPlayer.name : null,
      phase: g.phase, step: g.step, winner: g.winner ? g.winner.name : null,
      pending: pending ? { type: pending.type, prompt: pending.prompt || null } : null,
      priority: g.priorityState ? {
        holder: g.priorityState.holder ? g.priorityState.holder.name : null,
        consecutivePasses: g.priorityState.consecutivePasses,
        neededPasses: g.priorityState.neededPasses,
      } : null,
      stack: g.stack.map((item, index) => ({ index, kind: item.kind, name: item.name, controller: item.ctrl && item.ctrl.name })),
      combat: g.combat ? {
        attackers: g.combat.attackers.map(card),
      } : null,
      players,
      recentLog: g.log.slice(-10),
    };
  };
  window.render_game_to_text = () => JSON.stringify(MTG.renderGameState());

  // Card game nema kontinuiranu fiziku; ovaj hook uklanja vizuelno čekanje i
  // osvježava deterministički snapshot između automatizovanih input burstova.
  window.advanceTime = async ms => {
    const g = window._game;
    if (g) {
      g._testClock = (g._testClock || 0) + Math.max(0, Number(ms) || 0);
      g.speedFactor = 0;
    }
    await Promise.resolve();
    if (window._ui) window._ui.render();
    return MTG.renderGameState();
  };

  window.addEventListener('DOMContentLoaded', () => {
    MTG.initData(MTG.RAW_DATA);
    renderSetup();
    // Reproducibilan desktop smoke ulaz. Ne mijenja normalan UX; test otvara
    // stvarnu partiju i zaustavlja se na prvoj ljudskoj odluci (mulligan).
    const smoke = new URLSearchParams(window.location.search);
    const smokeDeck = smoke.get('smokeDeck');
    if (smokeDeck && MTG.DECKS[smokeDeck]) {
      startGame({
        deck: smokeDeck,
        commanders: [MTG.DECKS[smokeDeck].commander],
        ai: 3,
        aiStyles: ['balanced', 'balanced', 'balanced'],
        aiRandomCommanders: false,
        sumPartnerDamage: false,
        difficulty: 'normal',
        seed: smoke.get('seed') || '11081',
      });
    }
  });
})();
