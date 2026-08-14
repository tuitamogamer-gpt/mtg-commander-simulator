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
    return `${(def.super || []).join(' ')} ${(def.types || []).join(' ')}${(def.subtypes || []).length ? ' - ' + def.subtypes.join(' ') : ''}`.trim();
  }

  function renderSetup() {
    const root = $('#setup');
    root.innerHTML = '';
    const nDecks = Object.keys(MTG.DECKS).filter(d => !MTG.DECKS[d].custom).length;
    // Desktop war-room zaglavlje: proizvod ostaje jasan, a zadatak je u prvom planu.
    const head = el('div', 'menuhead');
    head.innerHTML = `
      <div class="menumark" aria-hidden="true"></div>
      <div class="menutitles">
        <div class="menu-kicker">Commander Simulator <span>Desktop klijent</span></div>
        <h1 class="title">Sastavi svoj Commander pod.</h1>
        <div class="subtitle">${nDecks} precon deckova iz perioda 2021-2026, spremnih za puni četveroigrački sto.</div>
      </div>
      <div class="menupill"><span class="menupillmark" aria-hidden="true"></span><span><b>Main menu</b>Priprema partije</span></div>`;
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

    left.appendChild(el('div', 'seclabel', '<i>Precon</i> Izaberi svoj deck <em>Komandna biblioteka</em>'));
    const deckList = el('div', 'decklist');
    for (const [name, deck] of Object.entries(MTG.DECKS)) {
      const meta = MTG.DECK_META[name] || {};
      const card = el('button', 'deckcard');
      card.type = 'button';
      card.setAttribute('aria-pressed', 'false');
      card.innerHTML = `
        <img class="deckart" loading="lazy" decoding="async" alt="${esc(deck.commander)}" src="${commanderImg(name)}" onerror="MTG.imgFail(this)">
        <div class="deckinfo">
          <div class="deckname">${esc(name)}</div>
          <div class="deckcmd"><span>Commander</span>${esc(deck.commander)}</div>
          <div class="deckcolors">${(meta.colors || []).map(c => `<img class="deckmana" src="/assets/mana/${c}.svg" alt="{${c}}" title="{${c}}">`).join('')} <span class="deckstyle">${esc(meta.style || '').replace(/[—–]/g, '-')}</span></div>
          <div class="deckblurb">${esc(meta.blurb || '').replace(/[—–]/g, '-')}</div>
          <div class="deckset">${esc(meta.set || '').replace(/[—–]/g, '-')}</div>
        </div>`;
      card.onclick = () => {
        state.deck = name;
        state.commanders = [deck.commander];
        deckList.querySelectorAll('.deckcard').forEach(c => {
          c.classList.remove('selected');
          c.setAttribute('aria-pressed', 'false');
        });
        card.classList.add('selected');
        card.setAttribute('aria-pressed', 'true');
        startBtn.disabled = false;
        renderCmdBox();
        updateStartLabel();
      };
      deckList.appendChild(card);
    }
    left.appendChild(deckList);

    // ---------- 2 · KOMANDER ----------
    right.appendChild(el('div', 'controlintro', `
      <span>Postavke poda</span>
      <h2>Konfiguriši partiju</h2>
      <p>Izbori ostaju ovdje dok pregledavaš biblioteku. Pokreni partiju kada je pod spreman.</p>`));
    right.appendChild(el('div', 'seclabel', '<i>Izbor</i> Komander'));
    const cmdBox = el('div', 'cmdbox');
    right.appendChild(cmdBox);
    const updateStartLabel = () => {
      if (!state.deck) return;
      const c = state.commanders;
      startBtn.textContent = 'Pokreni partiju';
      startBtn.title = `${state.deck}: ${c.map(n => n.split(',')[0]).join(' + ')}`;
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
            <div class="cmdchipname">${esc(nm)}</div>
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

    right.appendChild(el('div', 'seclabel', '<i>Pod</i> Protivnici <em>AI dobijaju nasumične precone</em>'));
    const aiRow = el('div', 'btnrow center');
    const botStyles = el('div', 'botstyles');
    const styleOptions = [['random', 'Nasumičan stil']]
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
            ? '' : (k === 'random' ? '?' : '=');
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
      const b = el('button', 'pbtn choice' + (n === 3 ? ' selected' : ''), n === 1 ? '1 AI duel' : n === 3 ? '3 AI pod' : '2 AI');
      b.onclick = () => { state.ai = n; aiRow.querySelectorAll('.pbtn').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); renderBotStyles(); };
      aiRow.appendChild(b);
    }
    right.appendChild(aiRow);
    right.appendChild(el('div', 'seclabel', '<i>AI</i> Stil botova'));
    right.appendChild(botStyles);
    renderBotStyles();

    const randRow = el('label', 'cmdcheck');
    randRow.innerHTML = '<input type="checkbox"> <span>AI botovi biraju nasumične (i partner) komandere</span>';
    randRow.querySelector('input').onchange = e => { state.aiRandomCommanders = e.target.checked; };
    right.appendChild(randRow);

    const houseRow = el('label', 'cmdcheck');
    houseRow.title = 'Zvanično pravilo 903.10a: 21 šteta od ISTOG komandera. ' +
      'Uključi ovo ako tvoja grupa igra da se šteta oba partnera zbraja.';
    houseRow.innerHTML = '<input type="checkbox"> <span>Kućno pravilo: šteta oba partnera se ZBRAJA (nije po 903.10a)</span>';
    houseRow.querySelector('input').onchange = e => { state.sumPartnerDamage = e.target.checked; };
    right.appendChild(houseRow);

    right.appendChild(el('div', 'seclabel', '<i>AI</i> Težina'));
    const diffRow = el('div', 'btnrow center');
    for (const [k, label] of [['easy', 'Laka'], ['normal', 'Normalna'], ['hard', 'Teška']]) {
      const b = el('button', 'pbtn choice' + (k === 'normal' ? ' selected' : ''), label);
      b.onclick = () => { state.difficulty = k; diffRow.querySelectorAll('.pbtn').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); };
      diffRow.appendChild(b);
    }
    right.appendChild(diffRow);

    const startBtn = el('button', 'pbtn primary start', 'Prvo izaberi deck');
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
      m.appendChild(el('div', 'mtitle', `👑 Komanderi: ${esc(deckName)}`));
      m.appendChild(el('div', 'cmdhint',
        'Klikni kartu da je izabereš. Karte sa 🤝 <b>Partner</b> mogu ići u paru. ' +
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
          ? `✅ ${sel.map(n => esc(n)).join(' <b>+</b> ')}${sel.length === 2 ? ' (dva komandera)' : ''}`
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
    const forcedAIDecks = [...new Set(state.aiDecks || [])]
      .filter(deckName => deckName !== state.deck && MTG.DECKS[deckName] && !MTG.DECKS[deckName].custom);
    const allDecks = Object.keys(MTG.DECKS)
      .filter(d => d !== state.deck && !forcedAIDecks.includes(d) && !MTG.DECKS[d].custom);
    const seed = state.seed ? parseInt(state.seed, 10) : Math.floor(Math.random() * 1e9);
    const rnd = MTG.mulberry32(seed);
    MTG.shuffle(allDecks, rnd);
    const aiDecks = forcedAIDecks.concat(allDecks).slice(0, state.ai);

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
      humanController: (p) => {
        ui.me = p;
        p.manualMana = ui.manaMode === 'manual';
        return ui.controllerFor(p);
      },
      onEvent: (e) => {
        if (e.type === 'turn' && e.p) ui.showBanner(e.p === ui.me ? '⭐ TVOJ POTEZ' : `Potez ${g.turnNo}: ${e.p.name}`, e.p === ui.me);
        if (e.type === 'spotlight') ui.showSpot(e.text, e.kind);
        if (e.type === 'effectNotice') ui.showEffectNotice(e.text, e.kind);
        ui.queueRender();
      },
    });
    ui.game = g;
    ui.applySpeed();
    window._game = g;
    window._ui = ui;
    ui.render();
    const cmdTxt = (state.commanders || []).map(n => n.split(',')[0]).join(' + ');
    const smokeScenario = new URLSearchParams(window.location.search).get('smokeScenario');
    if (!smokeScenario) ui.toast(`Seed: ${seed} · 👑 ${cmdTxt} · Protivnici: ${aiDecks.join(', ')}`);
    // Deterministički browser scenario za card-sheet interakcije koje bi kroz
    // nasumičnu biblioteku bilo teško pouzdano dovesti na ekran. Aktivira se
    // isključivo eksplicitnim smokeScenario query parametrom.
    if (smokeScenario === 'resourceChoice') {
      const pizza = new MTG.CardInst(MTG.DEFS['Ninja Pizza'], ui.me);
      pizza.ctrl = ui.me; pizza.zone = 'battlefield';
      const food = new MTG.CardInst(MTG.TOKENS.food, ui.me);
      food.ctrl = ui.me; food.zone = 'battlefield'; food.isToken = true;
      g.battlefield.push(pizza, food);
      g.turnPlayer = ui.me; g.turnNo = 1; g.phase = 'main1'; g.step = 'main';
      ui.me.pool.C = 2;
      g.recalc();
      const acts = g.activatableList(ui.me);
      void ui.me.controller.decide(g, {
        type: 'main', player: ui.me, casts: [], acts, lands: [], phase: g.phase,
      }).then(action => g.performAction(ui.me, action));
      ui.sheet = { card: food };
      ui.render();
      return;
    }
    if (smokeScenario === 'opponentChoice') {
      g.turnPlayer = ui.me; g.turnNo = 1; g.phase = 'main1'; g.step = 'main';
      void MTG.E.chooseOpponent(g, ui.me, {
        prompt: 'Sylvan Offering: ko dobija Treefolk?', goal: 'gift',
      }).then(opponent => {
        if (opponent) ui.toast(`Izabran protivnik: ${opponent.name}`);
        ui.render();
      });
      ui.render();
      return;
    }
    if (smokeScenario === 'manualMana') {
      ui.manaMode = 'manual';
      ui.me.manualMana = true;
      localStorage.setItem('mtgManaMode', 'manual');
      const lands = ['Plains', 'Plains', 'Plains', 'Island'].map(name => {
        const land = new MTG.CardInst(MTG.DEFS[name], ui.me);
        land.ctrl = ui.me; land.zone = 'battlefield'; land.sick = false;
        g.battlefield.push(land);
        return land;
      });
      const spell = new MTG.CardInst(MTG.DEFS['Cut a Deal'], ui.me);
      spell.zone = 'hand'; ui.me.hand.push(spell);
      g.turnPlayer = ui.me; g.turnNo = 1; g.phase = 'main1'; g.step = 'main';
      g.recalc();
      void g.castSpell(ui.me, spell, { from: 'hand' });
      ui.render();
      return;
    }
    if (smokeScenario === 'manifest') {
      void (async () => {
        const hidden = new MTG.CardInst(MTG.DEFS['Stalwart Pathlighter'], ui.me);
        hidden.zone = 'library'; ui.me.library.push(hidden);
        g.turnPlayer = ui.me; g.turnNo = 1; g.phase = 'main1'; g.step = 'main';
        ui.me.pool.W = 2; ui.me.pool.C = 1;
        await g.manifestTop(ui.me);
        g.recalc();
        const acts = g.activatableList(ui.me);
        void ui.me.controller.decide(g, {
          type: 'main', player: ui.me, casts: [], acts, lands: [], phase: g.phase,
        }).then(action => g.performAction(ui.me, action));
        ui.sheet = { card: hidden };
        ui.render();
      })();
      return;
    }
    if (smokeScenario === 'combatReaction') {
      const attackerPlayer = g.players.find(player => player !== ui.me);
      const attacker = new MTG.CardInst(MTG.DEFS['Stalwart Pathlighter'], attackerPlayer);
      attacker.ctrl = attackerPlayer; attacker.zone = 'battlefield'; attacker.sick = false;
      attacker.attacking = ui.me;
      const plains = new MTG.CardInst(MTG.DEFS['Plains'], ui.me);
      plains.ctrl = ui.me; plains.zone = 'battlefield'; plains.sick = false;
      const answer = new MTG.CardInst(MTG.DEFS['Swords to Plowshares'], ui.me);
      answer.zone = 'hand'; ui.me.hand.push(answer);
      g.battlefield.push(attacker, plains);
      g.turnPlayer = attackerPlayer; g.turnNo = 1; g.phase = 'combat'; g.step = 'blockers';
      g.combat = { attackers: [attacker], defenders: new Map() };
      g.recalc();
      void g.askPriorityAction(ui.me);
      ui.render();
      return;
    }
    if (smokeScenario === 'doomMoonstoneExile') {
      void (async () => {
        const take = (name, zone) => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me;
          card.zone = zone;
          if (zone === 'battlefield') {
            card.sick = false;
            g.battlefield.push(card);
          } else ui.me[zone].push(card);
          return card;
        };
        const moonstone = take('Moonstone, Harsh Mistress', 'battlefield');
        const spell = take("Night's Whisper", 'graveyard');
        g.turnPlayer = ui.me; g.turnNo = 20; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        ui.me.turnsStarted = 5;
        await moonstone.def.triggers[0].run({ g, src: moonstone, you: ui.me, data: { player: ui.me, card: spell } });

        // Reprodukuj screenshot: tri protivnička poteza su prošla, sada je
        // Doomov sljedeći potez. Karta i dalje mora biti legalna iz exilea.
        g.turnNo = 24;
        ui.me.turnsStarted = 6;
        ui.me.pool.B = 1;
        ui.me.pool.C = 1;
        g.recalc();
        const q = {
          type: 'main', player: ui.me,
          casts: g.castableList(ui.me), acts: g.activatableList(ui.me), lands: g.playableLands(ui.me), phase: g.phase,
        };
        void ui.me.controller.decide(g, q).then(action => g.performAction(ui.me, action));
        const smokeView = new URLSearchParams(window.location.search).get('smokeView');
        if (smokeView === 'exile') ui.zoneBrowse = { player: ui.me, zone: 'exile' };
        if (smokeView === 'sheet') ui.sheet = { card: spell };
        ui.toast(`Moonstone: ${spell.name} je legalan iz exilea do kraja ovog poteza.`);
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'doomCombat') {
      void (async () => {
        const doom = new MTG.CardInst(MTG.DEFS['Doctor Doom, King of Latveria'], ui.me);
        doom.ctrl = ui.me; doom.zone = 'battlefield'; doom.sick = false;
        const prowler = new MTG.CardInst(MTG.DEFS['Prowler, Clawed Thief'], ui.me);
        prowler.ctrl = ui.me; prowler.zone = 'battlefield'; prowler.sick = false;
        g.battlefield.push(doom, prowler);
        g.turnPlayer = ui.me; g.turnNo = 4; g.phase = 'combat'; g.step = 'begin';
        g.combat = { attackers: [], defenders: new Map() };
        g.recalc();
        await g.emit('beginCombat', { player: ui.me });
        await g.flushTriggers();
        await g.priorityRound(ui.me);
        ui.render();
      })();
      return;
    }
    if (smokeScenario === 'doomDeluge') {
      const doom = new MTG.CardInst(MTG.DEFS['Doctor Doom, King of Latveria'], ui.me);
      doom.ctrl = ui.me; doom.zone = 'battlefield'; doom.sick = false;
      doom.counters['+1/+1'] = 2;
      const opponent = g.players.find(player => player !== ui.me);
      const threat = new MTG.CardInst(MTG.DEFS['Red Ghost, Intangible Genius'], opponent);
      threat.ctrl = opponent; threat.zone = 'battlefield'; threat.sick = false;
      const deluge = new MTG.CardInst(MTG.DEFS['Toxic Deluge'], ui.me);
      deluge.zone = 'hand'; ui.me.hand.push(deluge);
      g.battlefield.push(doom, threat);
      ui.me.pool.B = 1; ui.me.pool.C = 2;
      g.turnPlayer = ui.me; g.turnNo = 4; g.phase = 'main1'; g.step = 'main';
      g.recalc();
      void g.castSpell(ui.me, deluge, { from: 'hand' });
      ui.render();
      return;
    }
    if (smokeScenario === 'doomHiddenExile') {
      void (async () => {
        const klaw = new MTG.CardInst(MTG.DEFS['Klaw, Master of Sound'], ui.me);
        klaw.ctrl = ui.me; klaw.zone = 'battlefield'; klaw.sick = false;
        const victim = g.players.find(player => player !== ui.me);
        const secret = new MTG.CardInst(MTG.DEFS['Sol Ring'], victim);
        secret.zone = 'library'; victim.library.push(secret);
        g.battlefield.push(klaw);
        g.turnPlayer = ui.me; g.turnNo = 4; g.phase = 'main1'; g.step = 'main';
        g.recalc();
        await klaw.def.triggers[0].run({ g, src: klaw, you: ui.me, data: { player: victim } });
        ui.zoneBrowse = { player: victim, zone: 'exile' };
        ui.render();
      })();
      return;
    }
    if (smokeScenario === 'doomAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Doom Prevails');
        const opponent = ui.me;
        if (!bot) throw new Error('doomAI scenario zahtijeva smokeAIDeck=Doom Prevails');
        const doom = new MTG.CardInst(MTG.DEFS['Doctor Doom, King of Latveria'], bot);
        doom.ctrl = bot; doom.zone = 'battlefield'; doom.sick = false; doom.counters['+1/+1'] = 2;
        const threat = new MTG.CardInst(MTG.DEFS['Red Ghost, Intangible Genius'], opponent);
        threat.ctrl = opponent; threat.zone = 'battlefield'; threat.sick = false;
        const deluge = new MTG.CardInst(MTG.DEFS['Toxic Deluge'], bot);
        deluge.zone = 'hand'; bot.hand.push(deluge);
        g.battlefield.push(doom, threat);
        bot.life = 12; bot.pool.B = 1; bot.pool.C = 2;
        g.turnPlayer = bot; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        await g.castSpell(bot, deluge, { from: 'hand' });
        ui.showLog = true;
        ui.toast(`Doom AI je razriješio Toxic Deluge; život: ${bot.life}.`);
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'elvenHuman') {
      void (async () => {
        const take = name => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        take('Galadriel, Elven-Queen');
        take('Erestor of the Council');
        take('Model of Unity');
        const visionary = take('Elvish Visionary');
        g.turnPlayer = ui.me; g.turnNo = 6; g.phase = 'combat'; g.step = 'begin'; g.paced = false;
        ui.me.turnState.elfEntries = [visionary.iid];
        g.recalc();
        await g.emit('beginCombat', { player: ui.me });
        await g.flushTriggers();
        await g.resolveTop();
        await g.priorityRound(ui.me);
        ui.showLog = true;
        ui.toast(`Elven human scenario završen: Ring ${ui.me.emblems.find(emblem => emblem.ring)?.level || 0}.`);
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'elvenAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Elven Council');
        if (!bot) throw new Error('elvenAI scenario zahtijeva smokeAIDeck=Elven Council');
        const takeBot = name => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const radagast = takeBot('Radagast, Wizard of Wilds');
        const flyer = new MTG.CardInst(MTG.TOKENS.birdU, ui.me);
        flyer.ctrl = ui.me; flyer.zone = 'battlefield'; flyer.isToken = true; flyer.sick = false;
        g.battlefield.push(flyer);
        const farsight = new MTG.CardInst(MTG.DEFS['Elven Farsight'], bot);
        const forest = new MTG.CardInst(MTG.DEFS.Forest, bot);
        bot.library.length = 0; forest.zone = 'library'; bot.library.push(forest);
        g.turnPlayer = bot; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        await radagast.def.triggers[0].run({ g, src: radagast, you: bot, data: { player: bot, mv: 5 } });
        const handBefore = bot.hand.length;
        await farsight.def.resolve({ g, src: farsight, you: bot });
        const madeBird = g.creatures(bot).some(card => card.isToken && card.hasSub('Bird'));
        const declinedBadReveal = bot.hand.length === handBefore;
        g.lg(`Elven AI provjera: Radagast ${madeBird ? 'Bird ✓' : 'nije Bird'}; Farsight loš reveal ${declinedBadReveal ? 'odbijen ✓' : 'prihvaćen'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Elven AI scenario: kontekstualne odluke razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'counterHuman') {
      void (async () => {
        const take = name => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const inspirit = take('Inspirit, Flagship Vessel');
        const reactor = take('Darksteel Reactor');
        const kilo = take('Kilo, Apogee Mind');
        const opponent = g.players.find(player => player !== ui.me);
        const weakened = new MTG.CardInst(MTG.DEFS['Kilo, Apogee Mind'], opponent);
        weakened.ctrl = opponent; weakened.zone = 'battlefield'; weakened.sick = false;
        g.battlefield.push(weakened);
        inspirit.counters.charge = 8; reactor.counters.charge = 17;
        kilo.counters['+1/+1'] = 2; weakened.counters['-1/-1'] = 1; opponent.poison = 2;
        g.turnPlayer = ui.me; g.turnNo = 10; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Counter human: izaberi svaki permanent/player koji želiš proliferirati.');
        await MTG.E.proliferate(g, ui.me);
        ui.showLog = true;
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'counterAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Counter Intelligence');
        if (!bot) throw new Error('counterAI scenario zahtijeva smokeAIDeck=Counter Intelligence');
        const takeBot = name => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const inspirit = takeBot('Inspirit, Flagship Vessel');
        const reactor = takeBot('Darksteel Reactor');
        const kilo = takeBot('Kilo, Apogee Mind');
        const weakened = new MTG.CardInst(MTG.DEFS['Kilo, Apogee Mind'], ui.me);
        weakened.ctrl = ui.me; weakened.zone = 'battlefield'; weakened.sick = false;
        g.battlefield.push(weakened);
        inspirit.counters.charge = 8; reactor.counters.charge = 17;
        kilo.counters['+1/+1'] = 2; weakened.counters['-1/-1'] = 1; ui.me.poison = 2;
        g.turnPlayer = bot; g.turnNo = 12; g.phase = 'combat'; g.step = 'begin'; g.paced = false;
        g.recalc();
        await MTG.E.proliferate(g, bot);
        await g.emit('beginCombat', { player: bot });
        await g.flushTriggers();
        while (g.stack.length && !g.gameOver) await g.resolveTop();
        g.lg(`Counter AI provjera: Reactor ${reactor.counters.charge || 0}; neprijateljski -1/-1 ${weakened.counters['-1/-1'] || 0}; poison ${ui.me.poison}.`, 'ai');
        ui.showLog = true;
        ui.toast('Counter AI scenario: proliferate i Inspirit odluke razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'covenHuman') {
      void (async () => {
        const take = name => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const vanguard = take("Sigarda's Vanguard");
        take("Avacyn's Pilgrim");
        take('Dawnhart Wardens');
        take('Wall of Mourning');
        g.turnPlayer = ui.me; g.turnNo = 12; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Coven human: izaberi bilo koji broj stvorenja, ali svako mora imati različitu snagu.');
        await g.emit('etb', { card: vanguard });
        await g.flushTriggers();
        await g.resolveTop();
        g.lg(`Coven human provjera: ${g.creatures(ui.me).filter(card => card.kw('double strike')).map(card => card.name).join(', ') || 'niko'} dobija double strike.`, 'ai');
        ui.showLog = true;
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'covenAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Coven Counters');
        if (!bot) throw new Error('covenAI scenario zahtijeva smokeAIDeck=Coven Counters');
        const takeBot = name => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const leinore = takeBot('Leinore, Autumn Sovereign');
        const pilgrim = takeBot("Avacyn's Pilgrim");
        const wardens = takeBot('Dawnhart Wardens');
        const siege = new MTG.CardInst(MTG.DEFS['Citadel Siege'], bot);
        siege.ctrl = bot; siege.zone = 'battlefield'; siege.sick = false;
        g.battlefield.push(siege);
        g.turnPlayer = bot; g.turnNo = 13; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        await siege.def.asEnters(g, siege);
        const upgrade = [bot.hand, bot.library, bot.graveyard, bot.exile].flat()
          .find(card => card.name === 'Biogenic Upgrade') || new MTG.CardInst(MTG.DEFS['Biogenic Upgrade'], bot);
        g.remove(upgrade); upgrade.zone = 'hand'; bot.hand.push(upgrade);
        bot.pool.G = 2; bot.pool.C = 4;
        await g.castSpell(bot, upgrade, { from: 'hand' });
        g.phase = 'combat'; g.step = 'begin';
        await g.emit('beginCombat', { player: bot });
        await g.flushTriggers();
        while (g.stack.length && !g.gameOver) await g.resolveTop();
        g.lg(`Coven AI provjera: Siege=${siege.meta.siege}; Leinore ${leinore.power}; Pilgrim ${pilgrim.power}; Wardens ${wardens.power}.`, 'ai');
        ui.showLog = true;
        ui.toast('Coven AI scenario: Citadel režim, raspodjela countera i combat Coven su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'blightHuman') {
      void (async () => {
        const take = name => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        take('Auntie Ool, Cursewretch');
        take('Hapatra, Vizier of Poisons');
        const tools = take("Wickersmith's Tools");
        take('Flourishing Defenses');
        take('Lasting Tarfire');
        const goat = take('Oft-Nabbed Goat');
        g.turnPlayer = ui.me; g.turnNo = 10; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        await g.addM1(goat, 3, ui.me);
        await g.flushTriggers();
        await g.priorityRound(ui.me);
        await g.emit('endStep', { player: ui.me });
        await g.flushTriggers();
        await g.priorityRound(ui.me);
        g.lg(`Blight human provjera: Goat ${goat.counters['-1/-1'] || 0} m1; Tools ${tools.counters.charge || 0} charge.`, 'ai');
        ui.showLog = true;
        ui.toast('Blight human scenario: one-or-more triggeri i izbor Elf tokena razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'blightWard') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Blight Curse');
        if (!bot) throw new Error('blightWard scenario zahtijeva smokeAIDeck=Blight Curse');
        const ool = new MTG.CardInst(MTG.DEFS['Auntie Ool, Cursewretch'], bot);
        ool.ctrl = bot; ool.zone = 'battlefield'; ool.sick = false;
        const recipient = new MTG.CardInst(MTG.DEFS['Grave Titan'], ui.me);
        recipient.ctrl = ui.me; recipient.zone = 'battlefield'; recipient.sick = false;
        const trophy = new MTG.CardInst(MTG.DEFS["Assassin's Trophy"], ui.me);
        trophy.zone = 'hand'; ui.me.hand.push(trophy);
        g.battlefield.push(ool, recipient);
        ui.me.pool.B = 1; ui.me.pool.G = 1;
        g.turnPlayer = ui.me; g.turnNo = 11; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        // Headless smoke nema canvas metu za klik, zato samo prvi izbor mete
        // zaključaj deterministički. Ward—Blight i svi naredni izbori i dalje
        // prolaze kroz pravi ljudski controller/UI.
        const humanController = ui.me.controller;
        let trophyTargetPending = true;
        ui.me.controller = {
          decide(game, request) {
            if (trophyTargetPending && request.type === 'chooseTargets') {
              trophyTargetPending = false;
              return Promise.resolve([ool]);
            }
            return humanController.decide(game, request);
          },
        };
        try {
          await g.castSpell(ui.me, trophy, { from: 'hand' });
        } finally {
          ui.me.controller = humanController;
        }
        ui.showLog = true;
        ui.toast(`Ward—Blight scenario: ${recipient.name} ima ${recipient.counters['-1/-1'] || 0} m1 countera.`);
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'blightAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Blight Curse');
        if (!bot) throw new Error('blightAI scenario zahtijeva smokeAIDeck=Blight Curse');
        const takeBot = name => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        takeBot('Auntie Ool, Cursewretch');
        const goat = takeBot('Oft-Nabbed Goat');
        const glissa = takeBot('Glissa Sunslayer');
        const reactor = new MTG.CardInst(MTG.DEFS['Darksteel Reactor'], ui.me);
        reactor.ctrl = ui.me; reactor.zone = 'battlefield'; reactor.sick = false; reactor.counters.charge = 5;
        const defenses = new MTG.CardInst(MTG.DEFS['Flourishing Defenses'], ui.me);
        defenses.ctrl = ui.me; defenses.zone = 'battlefield'; defenses.sick = false;
        g.battlefield.push(reactor, defenses);
        goat.counters['-1/-1'] = 1;
        g.turnPlayer = bot; g.turnNo = 12; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        await MTG.DEFS["Eventide's Shadow"].resolve({ g, src: null, you: bot, targets: [] });
        await g.emit('combatDamageToPlayer', { card: glissa, player: ui.me, n: 3, combat: true });
        await g.flushTriggers();
        await g.priorityRound(bot);
        const curiosity = [bot.hand, bot.library, bot.graveyard, bot.exile].flat()
          .find(card => card.name === 'Burning Curiosity') || new MTG.CardInst(MTG.DEFS['Burning Curiosity'], bot);
        g.remove(curiosity); curiosity.zone = 'hand'; bot.hand.push(curiosity);
        bot.pool.C = 2; bot.pool.R = 1;
        await g.castSpell(bot, curiosity, { from: 'hand' });
        g.lg(`Blight AI provjera: Goat ${goat.counters['-1/-1'] || 0} m1; Reactor ${reactor.counters.charge || 0}; Glissa enchantment ${defenses.zone}.`, 'ai');
        ui.showLog = true;
        ui.toast('Blight AI scenario: Eventide, Glissa i Burning Curiosity odluke razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'mostHuman') {
      void (async () => {
        const take = name => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        take('Olivia, Opulent Outlaw');
        take('Academy Manufactor');
        const marauder = take('Aetherborn Marauder');
        const defector = take('Humble Defector');
        const marchesa = take('Queen Marchesa');
        defector.counters['+1/+1'] = 2;
        marchesa.counters['+1/+1'] = 3;
        g.turnPlayer = ui.me; g.turnNo = 14; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Most Wanted human: izaberi sa kojih permanenata i koliko countera premještaš na Maraudera.');
        await g.emit('etb', { card: marauder });
        await g.flushTriggers();
        await g.resolveTop();
        g.lg(`Most Wanted human provjera: Marauder ima ${marauder.counters['+1/+1'] || 0} +1/+1 countera.`, 'ai');
        ui.showLog = true;
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'mostAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Most Wanted');
        if (!bot) throw new Error('mostAI scenario zahtijeva smokeAIDeck=Most Wanted');
        const takeBot = name => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const grenzo = takeBot('Grenzo, Havoc Raiser');
        const pilferer = takeBot('Impulsive Pilferer');
        const victim = new MTG.CardInst(MTG.DEFS['Grave Titan'], ui.me);
        victim.ctrl = ui.me; victim.zone = 'battlefield'; victim.sick = false;
        g.battlefield.push(victim);
        pilferer.counters.stun = 1;
        bot.life = 8;
        g.turnPlayer = bot; g.turnNo = 15; g.phase = 'combat'; g.step = 'damage'; g.paced = false;
        g.recalc();

        await g.emit('combatDamageToPlayer', { card: grenzo, player: ui.me, n: grenzo.power, combat: true });
        await g.flushTriggers();
        while (g.stack.length && !g.gameOver) await g.resolveTop();

        const heliod = await bot.controller.decide(g, {
          type: 'chooseOption',
          options: [{ key: '0', label: 'Uništi X artefakata/enchantmenta' }, { key: '1', label: 'Dobij 2X života' }],
          aiHint: { kind: 'heliodIntervention', x: 4 },
        });
        const rankle = await bot.controller.decide(g, {
          type: 'chooseMulti', min: 0, max: 3,
          options: [{ key: 'disc', label: 'Svi odbacuju' }, { key: 'draw', label: 'Svi vuku' }, { key: 'sac', label: 'Svi žrtvuju' }],
          aiHint: { kind: 'rankleModes' },
        });
        const fain = await bot.controller.decide(g, {
          type: 'chooseCards', from: [pilferer], min: 1, max: 1,
          aiHint: { kind: 'fainCounterCost' }, prompt: 'Fain counter cijena',
        });
        g.lg(`Most Wanted AI: Grenzo=${g.isGoaded(victim) ? 'goad' : 'exile'}; Heliod mod=${heliod}; Rankle=${(rankle || []).join(',') || 'bez moda'}; Fain=${fain[0]?.name || 'bez izbora'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Most Wanted AI scenario: Grenzo, Heliod, Rankle i Fain odluke razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'prismariHuman') {
      void (async () => {
        const take = (name, owner = ui.me, zone = 'battlefield') => {
          const zones = [owner.command, owner.hand, owner.library, owner.graveyard, owner.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], owner);
          g.remove(card);
          card.ctrl = owner; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card);
          else owner[zone].push(card);
          return card;
        };
        const opponent = g.players.find(player => player !== ui.me && !player.lost);
        if (!opponent) throw new Error('Prismari human scenario zahtijeva protivnika');
        take('Veyran, Voice of Duality');
        take('Storm-Kiln Artist');
        take('Manaform Hellkite');
        const goldspan = take('Goldspan Dragon');
        const ownRock = take('Arcane Signet');
        const enemyCreature = take('Stormcatch Mentor', opponent);
        const enemyRock = take('Sol Ring', opponent);
        const opus = take('Magma Opus', ui.me, 'hand');
        ui.me.pool.C = 6; ui.me.pool.U = 1; ui.me.pool.R = 1;
        g.turnPlayer = ui.me; g.turnNo = 20; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Prismari human: Magma Opus — izaberi Goldspan + protivničko stvorenje za štetu, zatim oba mana artefakta za tapovanje i podijeli 4 štete.');
        ui.render();
        if (!await g.castSpell(ui.me, opus, { from: 'hand' })) throw new Error('Magma Opus cast nije uspio');
        const dragons = g.creatures(ui.me).filter(card => card.isToken && card.hasSub('Dragon'));
        const treasures = g.bf().filter(card => card.ctrl === ui.me && card.hasSub('Treasure'));
        g.lg(`Prismari human provjera: Manaform zmajevi=${dragons.length}; Treasure=${treasures.length}; Goldspan šteta=${goldspan.damage}; protivnički ${enemyCreature.name} zona=${enemyCreature.zone}; tap artefakti=${Number(ownRock.tapped) + Number(enemyRock.tapped)}.`, 'ai');
        ui.showLog = true;
        ui.toast('Prismari human scenario: mete, podjela štete, Veyran, magecraft, Manaform i Goldspan su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'prismariAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Prismari Artistry');
        if (!bot) throw new Error('prismariAI scenario zahtijeva smokeAIDeck=Prismari Artistry');
        const takeBot = (name, zone = 'battlefield') => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card);
          else bot[zone].push(card);
          return card;
        };
        const addHuman = name => {
          const card = new MTG.CardInst(MTG.DEFS[name], ui.me);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        takeBot('Veyran, Voice of Duality');
        takeBot('Storm-Kiln Artist');
        takeBot('Manaform Hellkite');
        takeBot('Goldspan Dragon');
        takeBot('Brudiclad, Telchor Engineer');
        await g.makeTokens('treasure', bot);
        await g.makeTokens('elementalUR44', bot);
        addHuman('Stormcatch Mentor');
        addHuman('Harmonic Prodigy');
        addHuman('Sol Ring');
        addHuman('Arcane Signet');
        const opus = takeBot('Magma Opus', 'hand');
        bot.pool.C = 6; bot.pool.U = 1; bot.pool.R = 1;
        g.turnPlayer = bot; g.turnNo = 21; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        if (!await g.castSpell(bot, opus, { from: 'hand' })) throw new Error('Prismari AI nije castovao Magma Opus');

        g.phase = 'combat'; g.step = 'begin';
        await g.emit('beginCombat', { player: bot });
        await g.flushTriggers();
        await g.priorityRound(bot);

        g.phase = 'main2'; g.step = 'main';
        const command = takeBot('Prismari Command', 'hand');
        bot.pool.C = 1; bot.pool.U = 1; bot.pool.R = 1;
        if (!await g.castSpell(bot, command, { from: 'hand' })) throw new Error('Prismari AI nije castovao Prismari Command');
        const recent = (g.aiDecisionLog || []).filter(entry => entry.playerName === bot.name).slice(-20);
        const tokenNames = [...new Set(g.bf().filter(card => card.ctrl === bot && card.isToken).map(card => card.name))];
        g.lg(`Prismari AI provjera: tokeni=${tokenNames.join(', ') || 'nema'}; odluke=${recent.length}; fallback=${recent.some(entry => entry.fallback) ? 'DA' : 'NE'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Prismari AI scenario: Magma Opus, Veyran/magecraft, Brudiclad i Command odluke su razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'marduHuman') {
      void (async () => {
        const take = name => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const addFreshToken = tokenName => {
          const token = new MTG.CardInst(MTG.TOKENS[tokenName], ui.me);
          token.ctrl = ui.me; token.zone = 'battlefield'; token.isToken = true; token.sick = false;
          token.meta._enteredTurn = 18;
          g.battlefield.push(token);
          return token;
        };
        const settle = async () => {
          let guard = 0;
          while ((g.pendingTriggers.length || g.stack.length) && guard++ < 120) {
            await g.flushTriggers();
            if (g.stack.length) await g.resolveTop();
          }
          if (guard >= 120) throw new Error('Mardu human scenario trigger guard');
        };
        const zurgo = take('Zurgo Stormrender');
        zurgo.commander = true;
        const storm = take('Redoubled Stormsinger');
        addFreshToken('servo'); addFreshToken('servo'); addFreshToken('warriorR');
        const first = g.players.find(player => player !== ui.me && !player.lost);
        const walkerOwner = g.players.find(player => player !== ui.me && player !== first && !player.lost) || first;
        const walker = new MTG.CardInst(MTG.DEFS['Kaya, Geist Hunter'], walkerOwner);
        walker.ctrl = walkerOwner; walker.zone = 'battlefield'; walker.sick = false; walker.counters.loyalty = 6;
        g.battlefield.push(walker);
        g.turnPlayer = ui.me; g.turnNo = 18; g.phase = 'combat'; g.step = 'attackers'; g.paced = false;
        g.combat = { attackers: [zurgo, storm], defenders: new Map() };
        zurgo.attacking = first; zurgo.tapped = true;
        storm.attacking = first; storm.tapped = true;
        g.recalc();
        ui.toast('Mardu human: poredaj Zurgo/Stormsinger triggere, pa za svaki novi token izaberi igrača ili planeswalkera kojeg napada.');
        await g.emit('attacks', { card: zurgo, player: ui.me, defender: first });
        await g.emit('attacks', { card: storm, player: ui.me, defender: first });
        await settle();
        for (const card of g.bf()) card.attacking = null;
        g.combat = null;
        g.step = '';
        await g.emit('endStep', { player: first });
        await settle();
        const temporary = g.bf().filter(card => card.isToken && card.attacking).length;
        g.lg(`Mardu human provjera: privremeni napadači na tabli=${temporary}; ruka=${ui.me.hand.length}.`, 'ai');
        ui.showLog = true;
        ui.toast('Mardu human scenario: attack izbori, simultani sacrifice i Zurgo LKI su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'marduAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Mardu Surge');
        if (!bot) throw new Error('marduAI scenario zahtijeva smokeAIDeck=Mardu Surge');
        const takeBot = name => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const addBotToken = tokenName => {
          const token = new MTG.CardInst(MTG.TOKENS[tokenName], bot);
          token.ctrl = bot; token.zone = 'battlefield'; token.isToken = true; token.sick = false;
          token.meta._enteredTurn = 19;
          g.battlefield.push(token);
          return token;
        };
        const settle = async () => {
          let guard = 0;
          while ((g.pendingTriggers.length || g.stack.length) && guard++ < 160) {
            await g.flushTriggers();
            if (g.stack.length) await g.resolveTop();
          }
          if (guard >= 160) throw new Error('Mardu AI scenario trigger guard');
        };
        const zurgo = takeBot('Zurgo Stormrender');
        zurgo.commander = true;
        const storm = takeBot('Redoubled Stormsinger');
        const angel = takeBot('Angel of Invention');
        takeBot('Bastion of Remembrance');
        const sphere = takeBot('Myr Battlesphere');
        addBotToken('servo'); addBotToken('servo');
        addBotToken('myr'); addBotToken('myr'); addBotToken('myr');
        const walker = new MTG.CardInst(MTG.DEFS['Kaya, Geist Hunter'], ui.me);
        walker.ctrl = ui.me; walker.zone = 'battlefield'; walker.sick = false; walker.counters.loyalty = 8;
        g.battlefield.push(walker);
        g.turnPlayer = bot; g.turnNo = 19; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        await g.emit('etb', { card: angel });
        await settle();
        g.phase = 'combat'; g.step = 'attackers';
        g.combat = { attackers: [zurgo, storm, sphere], defenders: new Map() };
        zurgo.attacking = ui.me; zurgo.tapped = true;
        storm.attacking = ui.me; storm.tapped = true;
        sphere.attacking = walker; sphere.tapped = true;
        await g.emit('attacks', { card: zurgo, player: bot, defender: ui.me });
        await g.emit('attacks', { card: storm, player: bot, defender: ui.me });
        await g.emit('attacks', { card: sphere, player: bot, defender: walker });
        await settle();
        const tokenRoutes = [...new Set(g.bf().filter(card => card.isToken && card.attacking)
          .map(card => card.attacking.name))];
        for (const card of g.bf()) card.attacking = null;
        g.combat = null;
        g.step = '';
        await g.emit('endStep', { player: ui.me });
        await settle();
        const recent = (g.aiDecisionLog || []).filter(entry => entry.playerName === bot.name).slice(-12);
        g.lg(`Mardu AI provjera: Servi=${g.creatures(bot).filter(card => card.isToken && card.hasSub('Servo')).length}; token mete=${tokenRoutes.join(', ') || 'nema'}; Kaya loyalty=${walker.counters.loyalty || 0}; odluke=${recent.length}; fallback=${recent.some(entry => entry.fallback) ? 'DA' : 'NE'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Mardu AI scenario: Fabricate, Stormsinger, Mobilize i Battlesphere odluke su razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'clueHuman') {
      void (async () => {
        const take = name => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        take('Morska, Undersea Sleuth');
        take('Academy Manufactor');
        take('Adrix and Nev, Twincasters');
        take('Esix, Fractal Bloom');
        take('Graf Mole');
        take('Armed with Proof');
        g.turnPlayer = ui.me; g.turnNo = 22; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Deep Clue human: izaberi redoslijed Academy / Adrix / Esix, pa stvorenje za Esix kopije.');
        ui.render();
        await MTG.E.investigate(g, ui.me);
        let guard = 0;
        while ((g.pendingTriggers.length || g.stack.length) && guard++ < 100) {
          await g.flushTriggers();
          if (g.stack.length) await g.resolveTop();
        }
        const tokens = g.bf().filter(card => card.ctrl === ui.me && card.isToken);
        g.lg(`Deep Clue human: tokeni=${tokens.length}; ${tokens.map(card => card.name).join(', ')}.`, 'ai');
        ui.showLog = true;
        ui.toast('Deep Clue human scenario: replacement redoslijed i Esix izbor su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'cluePrepared') {
      void (async () => {
        const take = (name, owner = ui.me, zone = 'battlefield') => {
          const zones = [owner.command, owner.hand, owner.library, owner.graveyard, owner.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], owner);
          g.remove(card);
          card.ctrl = owner; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card); else owner[zone].push(card);
          return card;
        };
        const opponent = g.players.find(player => player !== ui.me && !player.lost);
        const focusmage = take('Dirgur Focusmage');
        take('Aerial Extortionist', opponent);
        for (let i = 0; i < 8; i++) {
          const card = new MTG.CardInst(MTG.DEFS[i % 2 ? 'Island' : 'Forest'], ui.me);
          card.zone = 'library'; ui.me.library.push(card);
        }
        g.turnPlayer = ui.me; g.turnNo = 23; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        ui.me.pool.C = 3; ui.me.pool.U = 2;
        g.recalc();
        await focusmage.def.triggers[0].run({ g, src: focusmage, you: ui.me });
        const prepared = ui.me.exile.find(card => card.meta && card.meta.preparedBy === focusmage.iid);
        if (!prepared) throw new Error('Prepared Braingeyser nije napravljen');
        const q = {
          type: 'main', player: ui.me,
          casts: g.castableList(ui.me), acts: g.activatableList(ui.me), lands: g.playableLands(ui.me), phase: g.phase,
        };
        ui.toast('Prepared: klikni Braingeyser iz egzila, izaberi X i target playera.');
        const action = await ui.me.controller.decide(g, q);
        await g.performAction(ui.me, action);
        g.lg(`Prepared UI: Braingeyser=${prepared.zone}; tvoja ruka=${ui.me.hand.length}; ${opponent.name} ruka=${opponent.hand.length}.`, 'ai');
        ui.toast('Prepared Braingeyser je razriješen; privremena kopija je prestala postojati.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'clueAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Deep Clue Sea');
        if (!bot) throw new Error('clueAI scenario zahtijeva smokeAIDeck=Deep Clue Sea');
        const takeBot = name => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        takeBot('Academy Manufactor');
        takeBot('Adrix and Nev, Twincasters');
        takeBot('Esix, Fractal Bloom');
        takeBot('Graf Mole');
        const focusmage = takeBot('Dirgur Focusmage');
        const aerial = new MTG.CardInst(MTG.DEFS['Aerial Extortionist'], ui.me);
        aerial.ctrl = ui.me; aerial.zone = 'battlefield'; aerial.sick = false;
        g.battlefield.push(aerial);
        for (let i = 0; i < 8; i++) {
          const card = new MTG.CardInst(MTG.DEFS[i % 2 ? 'Island' : 'Forest'], bot);
          card.zone = 'library'; bot.library.push(card);
        }
        g.turnPlayer = bot; g.turnNo = 24; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        const priorityRound = g.priorityRound;
        g.priorityRound = async () => {};
        await MTG.E.investigate(g, bot);
        await focusmage.def.triggers[0].run({ g, src: focusmage, you: bot });
        const prepared = bot.exile.find(card => card.meta && card.meta.preparedBy === focusmage.iid);
        bot.pool.C = 2; bot.pool.U = 2;
        if (!prepared || !await g.castSpell(bot, prepared, { from: 'exile', xVal: 2 })) {
          throw new Error('Deep Clue AI Prepared cast nije uspio');
        }
        let guard = 0;
        while ((g.pendingTriggers.length || g.stack.length) && guard++ < 120) {
          await g.flushTriggers();
          if (g.stack.length) await g.resolveTop();
        }
        g.priorityRound = priorityRound;
        const recent = (g.aiDecisionLog || []).filter(entry => entry.playerName === bot.name).slice(-20);
        const tokens = g.bf().filter(card => card.ctrl === bot && card.isToken);
        g.lg(`Deep Clue AI: tokeni=${tokens.map(card => card.name).join(', ') || 'nema'}; Prepared=${prepared.zone}; odluke=${recent.length}; fallback=${recent.some(entry => entry.fallback) ? 'DA' : 'NE'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Deep Clue AI scenario: replacement redoslijed i Prepared Braingeyser su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'scionsHuman') {
      void (async () => {
        const take = (name, zone = 'battlefield') => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card); else ui.me[zone].push(card);
          return card;
        };
        const settle = async () => {
          let guard = 0;
          while ((g.pendingTriggers.length || g.stack.length) && guard++ < 120) {
            await g.flushTriggers();
            if (g.stack.length) await g.resolveTop();
          }
          if (guard >= 120) throw new Error('Scions human scenario trigger guard');
        };
        const alisaie = take('Alisaie Leveilleur');
        const alphinaud = take('Alphinaud Leveilleur', 'library');
        g.turnPlayer = ui.me; g.turnNo = 26; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Scions Partner: izaberi SEBE kao target igrača, zatim potvrdi pretragu za Alphinauda.');
        ui.render();
        await g.emit('etb', { card: alisaie, ctrl: ui.me });
        await settle();

        const planisphere = take("Astrologian's Planisphere");
        await g.emit('etb', { card: planisphere, ctrl: ui.me });
        await settle();
        ui.me.turnState.drewThisTurn = 2;
        await g.draw(ui.me, 1);
        await settle();
        const hero = planisphere.attachedTo && g.byIid(planisphere.attachedTo);
        g.lg(`Scions human: Partner=${alphinaud.zone}; Planisphere host=${hero ? hero.name : 'nema'}; counteri=${hero && hero.counters['+1/+1'] || 0}.`, 'ai');
        ui.showLog = true;
        ui.toast('Scions human scenario: Partner search i Planisphere treći draw su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'scionsAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Scions & Spellcraft');
        if (!bot) throw new Error('scionsAI scenario zahtijeva smokeAIDeck=Scions & Spellcraft');
        const takeBot = (name, zone = 'battlefield') => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card); else bot[zone].push(card);
          return card;
        };
        const settle = async () => {
          let guard = 0;
          while ((g.pendingTriggers.length || g.stack.length) && guard++ < 180) {
            await g.flushTriggers();
            if (g.stack.length) await g.resolveTop();
          }
          if (guard >= 180) throw new Error('Scions AI scenario trigger guard');
        };
        const alisaie = takeBot('Alisaie Leveilleur');
        const alphinaud = takeBot('Alphinaud Leveilleur', 'library');
        takeBot("G'raha Tia, Scion Reborn");
        takeBot('Fandaniel, Telophoroi Ascian');
        const victim = g.players.find(player => player.isAI && player !== bot);
        if (victim) {
          const creature = new MTG.CardInst(MTG.DEFS['Baleful Strix'], victim);
          creature.ctrl = victim; creature.zone = 'battlefield'; creature.sick = false;
          g.battlefield.push(creature);
          for (const name of ['Arcane Signet', 'Sol Ring', 'Thought Vessel']) {
            const artifact = new MTG.CardInst(MTG.DEFS[name], victim);
            artifact.ctrl = victim; artifact.zone = 'battlefield'; artifact.sick = false;
            g.battlefield.push(artifact);
          }
        }
        for (const name of ['Swords to Plowshares', 'Void Rend', 'Snuff Out']) takeBot(name, 'graveyard');
        g.turnPlayer = bot; g.turnNo = 27; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        await g.emit('etb', { card: alisaie, ctrl: bot });
        await settle();

        const nova = takeBot('Cleansing Nova', 'hand');
        bot.pool.C = 3; bot.pool.W = 2;
        if (!await g.castSpell(bot, nova, { from: 'hand' })) throw new Error('Scions AI Cleansing Nova cast nije uspio');
        await settle();
        g.phase = 'end'; g.step = 'end';
        await g.emit('endStep', { player: bot });
        await settle();
        const recent = (g.aiDecisionLog || []).filter(entry => entry.playerName === bot.name).slice(-24);
        g.lg(`Scions AI: Partner=${alphinaud.zone}; Hero=${g.creatures(bot).filter(card => card.isToken && card.hasSub('Hero')).length}; Nova=${nova.zone}; odluke=${recent.length}; fallback=${recent.some(entry => entry.fallback) ? 'DA' : 'NE'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Scions AI scenario: Partner, G\'raha, wipe mod i Fandaniel odluke su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
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
      faceDown: !!c.faceDown,
      hiddenIdentity: c.faceDown && c.ctrl === ui.me && c.meta && c.meta.faceDownDef
        ? c.meta.faceDownDef.name : undefined,
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
      manaPool: Object.fromEntries(Object.entries(p.pool || {}).filter(([, amount]) => amount > 0)),
      commanders: p.commanders.map(card),
      battlefield: g.battlefield.filter(c => c.ctrl === p).map(card),
      hand: p === ui.me ? p.hand.map(card) : undefined,
      exile: p === ui.me ? p.exile.map(card) : undefined,
      visibleLibraryTop: p === ui.me && g.bf().some(source => source.ctrl === p && source.def.revealOwnTop) && p.library.length
        ? card(p.library[p.library.length - 1]) : undefined,
    }));
    const pending = ui && ui.pending ? ui.pending.q : (ui && ui.react ? ui.react.q : null);
    return {
      mode: g.gameOver ? 'gameover' : 'game',
      manaMode: ui ? ui.manaMode : 'auto',
      coordinateSystem: 'Commander seats are ordered by players[]; the human seat is marked isAI=false.',
      turn: g.turnNo, activePlayer: g.turnPlayer ? g.turnPlayer.name : null,
      phase: g.phase, step: g.step, winner: g.winner ? g.winner.name : null,
      pending: pending ? {
        type: pending.type,
        prompt: pending.prompt || null,
        actions: (pending.casts || []).map(entry => ({
          card: entry.card && entry.card.name,
          from: entry.from,
          label: entry.from === 'exile'
            ? `Igraj ${entry.card && entry.card.name} iz egzila`
            : `Baci ${entry.card && entry.card.name}`,
        })).concat((pending.acts || []).map(entry => ({
          card: entry.card && entry.card.name,
          label: entry.manaAbility ? entry.label :
            entry.turnFaceUp ? entry.label :
            entry.handAbility ? entry.card.def.handAbility.label :
              entry.gyAbility ? (entry.gyAbilityOverride || entry.card.def.gyAbility).label :
            entry.ability ? entry.ability.label :
              entry.equip ? 'Equip' : entry.crew ? 'Crew' : entry.cycling ? 'Cycling' : 'Aktiviraj',
        }))),
      } : null,
      priority: g.priorityState ? {
        holder: g.priorityState.holder ? g.priorityState.holder.name : null,
        consecutivePasses: g.priorityState.consecutivePasses,
        neededPasses: g.priorityState.neededPasses,
      } : null,
      stack: g.stack.map((item, index) => ({ index, kind: item.kind, name: item.name, controller: item.ctrl && item.ctrl.name })),
      combat: g.combat ? {
        attackers: g.combat.attackers.map(card),
      } : null,
      aiDecisions: (g.aiDecisionLog || []).slice(-3).map(entry => ({
        turn: entry.turn, player: entry.playerName, chosen: entry.chosen,
        score: entry.score, reason: entry.scoreBreakdown,
        nodes: entry.analyzedNodes, depth: entry.reachedDepth,
        tieBreak: entry.tieBreak, fallback: entry.fallback,
      })),
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
      const smokeAIDeck = smoke.get('smokeAIDeck');
      startGame({
        deck: smokeDeck,
        commanders: [MTG.DECKS[smokeDeck].commander],
        ai: 3,
        aiDecks: smokeAIDeck && MTG.DECKS[smokeAIDeck] ? [smokeAIDeck] : [],
        aiStyles: ['balanced', 'balanced', 'balanced'],
        aiRandomCommanders: false,
        sumPartnerDamage: false,
        difficulty: 'normal',
        seed: smoke.get('seed') || '11081',
      });
    }
  });
})();
