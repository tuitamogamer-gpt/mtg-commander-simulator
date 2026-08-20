// ===== main.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Setup screen + game bootstrap (browser only)
(function () {
  if (typeof document === 'undefined') return;
  const U = MTG;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = U.uiText(html); return e; };
  const esc = s => U.uiText(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

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
        <div class="menu-kicker">Commander Simulator <span>Desktop Client</span></div>
        <h1 class="title">Assemble your Commander pod.</h1>
        <div class="subtitle">${nDecks} preconstructed decks from 2021-2026, ready for a full four-player table.</div>
        <div class="menu-mana-showcase" aria-label="Official white, blue, black, red, green, and colorless mana symbols">
          <span>Mana identities</span>
          <div>${['W', 'U', 'B', 'R', 'G', 'C'].map(color => `<img src="/assets/mana/${color}.svg" alt="{${color}}" title="{${color}}">`).join('')}</div>
        </div>
      </div>
      <div class="menupill"><span class="menupillmark" aria-hidden="true"></span><span><b>Main Menu</b>Game setup</span></div>`;
    root.appendChild(head);

    const state = {
      deck: null, ai: 3, difficulty: 'normal', seed: '',
      aiDecks: ['', '', ''],
      aiStyles: ['random', 'random', 'random'],
      commanders: [], aiRandomCommanders: false, sumPartnerDamage: false,
      diplomacyEnabled: false,
    };

    const grid = el('div', 'setupgrid');
    root.appendChild(grid);
    const left = el('div', 'setupleft');
    const right = el('div', 'setupright');
    grid.appendChild(left); grid.appendChild(right);

    left.appendChild(el('div', 'seclabel', '<i>Precon</i> Choose your deck <em>Command library</em>'));
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
        for (let i = 0; i < state.aiDecks.length; i++) if (state.aiDecks[i] === name) state.aiDecks[i] = '';
        renderBotStyles();
        updateStartLabel();
      };
      deckList.appendChild(card);
    }
    left.appendChild(deckList);

    // ---------- 2 · KOMANDER ----------
    right.appendChild(el('div', 'controlintro', `
      <span>Pod settings</span>
      <h2>Configure the game</h2>
      <p>Your choices remain here while you browse the library. Start when the pod is ready.</p>`));
    right.appendChild(el('div', 'seclabel', '<i>Choice</i> Commander'));
    const cmdBox = el('div', 'cmdbox');
    right.appendChild(cmdBox);
    const updateStartLabel = () => {
      if (!state.deck) return;
      const c = state.commanders;
      startBtn.textContent = 'Start game';
      startBtn.title = `${state.deck}: ${c.map(n => n.split(',')[0]).join(' + ')}`;
    };
    function renderCmdBox() {
      cmdBox.innerHTML = '';
      if (!state.deck) { cmdBox.appendChild(el('div', 'cmdhint', 'Choose a deck on the left first.')); return; }
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
        `${legals.length} legal commander${legals.length === 1 ? '' : 's'} in this deck` +
        (partnerable ? ` · ${partnerable} with a partner ability 🤝` : '') +
        (state.commanders.length === 2 ? ' · you are playing TWO commanders' : '')));
      const btn = el('button', 'pbtn wide', legals.length > 1 ? '🔄 Change commander / partners' : '🔒 This deck has only one');
      btn.disabled = legals.length <= 1;
      btn.onclick = async () => {
        const res = await pickCommanders(state.deck, state.commanders);
        if (res) { state.commanders = res; renderCmdBox(); updateStartLabel(); }
      };
      cmdBox.appendChild(btn);
    }

    right.appendChild(el('div', 'seclabel', '<i>Pod</i> Opponents <em>Choose each AI deck</em>'));
    const aiRow = el('div', 'btnrow center');
    const botStyles = el('div', 'botstyles');
    const styleOptions = [['random', 'Random style']]
      .concat(Object.entries(MTG.AI_STYLES).map(([k, s]) => [k, `${s.icon} ${s.label}`]));
    const STYLE_DESC = {
      aggressive: 'Attacks relentlessly, hunts wounded players, and dislikes blocking.',
      opportunist: 'Avoids the leader and overwhelms wounded players.',
      passive: 'Builds its board, keeps blockers, and attacks when it is safe.',
      teaser: 'Spreads chaos, changes targets, and loves goad and politics.',
      balanced: 'Standard, balanced AI logic.',
      random: 'Each bot receives a random personality, revealed in game.',
    };
    const renderBotStyles = () => {
      botStyles.innerHTML = '';
      const botNames = ['AI Dragon', 'AI Wolf', 'AI Raven'];
      const deckNames = Object.keys(MTG.DECKS).filter(name => !MTG.DECKS[name].custom).sort((a, b) => a.localeCompare(b));
      for (let i = 0; i < state.ai; i++) {
        const config = el('div', 'botconfig');
        const row = el('div', 'botstylerow');
        const badge = el('span', 'pbadge');
        const setBadge = k => {
          badge.className = 'pbadge ' + (['aggressive', 'opportunist', 'passive', 'teaser'].includes(k) ? 'p-' + k : 'p-none');
          badge.textContent = ['aggressive', 'opportunist', 'passive', 'teaser'].includes(k)
            ? '' : (k === 'random' ? '?' : '=');
          badge.title = STYLE_DESC[k] || '';
        };
        setBadge(state.aiStyles[i]);
        const identity = el('div', 'botidentity', `<span class="botname">${esc(botNames[i])}</span><small>Seat 0${i + 1}</small>`);
        const fields = el('div', 'botfields');
        const deckField = el('label', 'botfield', '<span>Deck</span>');
        const deckSelect = el('select', 'styleselect deckselect');
        deckSelect.setAttribute('aria-label', `${botNames[i]} deck`);
        const randomDeck = el('option', '', 'Random deck');
        randomDeck.value = '';
        deckSelect.appendChild(randomDeck);
        const unavailable = new Set([state.deck, ...state.aiDecks.filter((deckName, index) => index !== i && deckName)]);
        for (const deckName of deckNames) {
          const option = el('option', '', deckName);
          option.value = deckName;
          option.disabled = unavailable.has(deckName);
          option.selected = state.aiDecks[i] === deckName;
          deckSelect.appendChild(option);
        }
        deckSelect.onchange = () => {
          state.aiDecks[i] = deckSelect.value;
          renderBotStyles();
        };
        deckField.appendChild(deckSelect);

        const styleField = el('label', 'botfield', '<span>Play style</span>');
        const sel = el('select', 'styleselect');
        sel.setAttribute('aria-label', `${botNames[i]} play style`);
        for (const [k, label] of styleOptions) {
          const o = el('option', '', label);
          o.value = k;
          if (state.aiStyles[i] === k) o.selected = true;
          sel.appendChild(o);
        }
        styleField.appendChild(sel);
        const desc = el('div', 'styledesc', STYLE_DESC[state.aiStyles[i]] || '');
        sel.onchange = () => { state.aiStyles[i] = sel.value; desc.textContent = STYLE_DESC[sel.value] || ''; setBadge(sel.value); };
        fields.appendChild(deckField); fields.appendChild(styleField);
        row.appendChild(badge); row.appendChild(identity); row.appendChild(fields);
        config.appendChild(row); config.appendChild(desc);
        botStyles.appendChild(config);
      }
    };
    for (const n of [1, 2, 3]) {
      const b = el('button', 'pbtn choice' + (n === 3 ? ' selected' : ''), n === 1 ? '1 AI duel' : n === 3 ? '3 AI pod' : '2 AI players');
      b.onclick = () => { state.ai = n; aiRow.querySelectorAll('.pbtn').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); renderBotStyles(); };
      aiRow.appendChild(b);
    }
    right.appendChild(aiRow);
    right.appendChild(el('div', 'seclabel', '<i>AI</i> Bot loadouts'));
    right.appendChild(botStyles);
    renderBotStyles();

    const randRow = el('label', 'cmdcheck');
    randRow.innerHTML = '<input type="checkbox"> <span>AI bots choose random commanders (including partners)</span>';
    randRow.querySelector('input').onchange = e => { state.aiRandomCommanders = e.target.checked; };
    right.appendChild(randRow);

    const houseRow = el('label', 'cmdcheck');
    houseRow.title = 'Official rule 903.10a: 21 damage from the SAME commander. ' +
      'Enable this only if your group combines damage from both partners.';
    houseRow.innerHTML = '<input type="checkbox"> <span>House rule: COMBINE damage from both partners (not rule 903.10a)</span>';
    houseRow.querySelector('input').onchange = e => { state.sumPartnerDamage = e.target.checked; };
    right.appendChild(houseRow);

    const diplomacyRow = el('label', 'cmdcheck diplomacysetup');
    diplomacyRow.title = 'Optional structured agreements between every player. Disabled for the first three full table rounds.';
    diplomacyRow.innerHTML = `<input type="checkbox"> <span><b>Diplomacy &amp; Politics</b><small>Short public deals between you and bots, and between bots. Unlocks after every player completes turn 3.</small></span>`;
    diplomacyRow.querySelector('input').onchange = e => {
      state.diplomacyEnabled = e.target.checked;
      diplomacyRow.classList.toggle('enabled', state.diplomacyEnabled);
    };
    right.appendChild(diplomacyRow);

    right.appendChild(el('div', 'seclabel', '<i>AI</i> Difficulty'));
    const diffRow = el('div', 'btnrow center');
    for (const [k, label] of [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']]) {
      const b = el('button', 'pbtn choice' + (k === 'normal' ? ' selected' : ''), label);
      b.onclick = () => { state.difficulty = k; diffRow.querySelectorAll('.pbtn').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); };
      diffRow.appendChild(b);
    }
    right.appendChild(diffRow);

    const startBtn = el('button', 'pbtn primary start', 'Choose a deck first');
    startBtn.disabled = true;
    startBtn.onclick = () => startGame(state);
    right.appendChild(startBtn);
    renderCmdBox();

    right.appendChild(el('div', 'credits',
      'All cards and images: <b>Scryfall</b>. The fixed set of official WotC precons passes separate card-by-card certification.'));
  }

  // ---------- Izbor komandera (1 ili 2 partnera) ----------
  function pickCommanders(deckName, current) {
    const deck = MTG.DECKS[deckName];
    const legals = MTG.legalCommanders(deck, MTG.DEFS);
    let sel = (current && current.length ? current : [deck.commander]).slice(0, 2);

    return new Promise(resolve => {
      const ov = el('div', 'overlay dark');
      const m = el('div', 'modal wide');
      m.appendChild(el('div', 'mtitle', `👑 Commanders: ${esc(deckName)}`));
      m.appendChild(el('div', 'cmdhint',
        'Click a card to select it. Cards with 🤝 <b>Partner</b> may be paired. ' +
        'Choose one, then click a compatible second card outlined in green. ' +
        'The rest of the deck stays unchanged; unselected legends go into the library.'));

      const grid = el('div', 'cmdgrid');
      m.appendChild(grid);
      const status = el('div', 'cmdstatus');
      m.appendChild(status);

      const row = el('div', 'btnrow');
      const okBtn = el('button', 'pbtn primary', 'Confirm ✔');
      const defBtn = el('button', 'pbtn', '↩ Original');
      const cancel = el('button', 'pbtn danger', 'Cancel');
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
              <div class="cmdoptname">${on ? '👑 ' : ''}${esc(L.name)}${L.isDefault ? ' <span class="deft">(original)</span>' : ''}</div>
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
          ? `✅ ${sel.map(n => esc(n)).join(' <b>+</b> ')}${sel.length === 2 ? ' (two commanders)' : ''}`
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
    const seed = state.seed ? parseInt(state.seed, 10) : Math.floor(Math.random() * 1e9);
    const rnd = MTG.mulberry32(seed);
    const aiDecks = MTG.selectAIDecks(state.deck, state.ai, state.aiDecks, rnd);

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
      diplomacyEnabled: state.diplomacyEnabled,
      seed,
      difficulty: state.difficulty,
      humanName: 'You',
      maxTurns: 200,
      paced: true,
      humanController: (p) => {
        ui.me = p;
        p.manualMana = ui.manaMode === 'manual';
        return ui.controllerFor(p);
      },
      onEvent: (e) => {
        if (e.type === 'turn' && e.p) ui.showBanner(e.p === ui.me ? '⭐ YOUR TURN' : `Turn ${g.turnNo}: ${e.p.name}`, e.p === ui.me);
        if (e.type === 'spotlight') ui.showSpot(e.text, e.kind);
        if (e.type === 'effectNotice') ui.showEffectNotice(e.text, e.kind);
        if (e.type === 'battlefieldArrival') ui.showBattlefieldArrival(e);
        if (e.type === 'diplomacy' && e.text) ui.toast(`🕊️ ${e.text}`);
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
    if (!smokeScenario) ui.toast(`Seed: ${seed} · 👑 ${cmdTxt} · Opponents: ${aiDecks.join(', ')}`);
    // Deterministički browser scenario za card-sheet interakcije koje bi kroz
    // nasumičnu biblioteku bilo teško pouzdano dovesti na ekran. Aktivira se
    // isključivo eksplicitnim smokeScenario query parametrom.
    if (smokeScenario === 'diplomacy') {
      // Stabilna javna tabla za provjeru optional toggle-a, otključavanja,
      // offer buildera i aktivnog ugovora bez čekanja dvanaest prirodnih
      // poteza. Dostupno isključivo eksplicitnom browser-smoke parametru.
      if (!g.diplomacy || !g.diplomacy.enabled) MTG.initDiplomacy(g, true);
      for (const player of g.players) {
        player.turnsStarted = 3;
        const creature = new MTG.CardInst(MTG.DEFS['Stormcatch Mentor'], player);
        creature.ctrl = player; creature.zone = 'battlefield'; creature.sick = false; creature.tapped = false;
        g.battlefield.push(creature);
      }
      g.turnPlayer = ui.me; g.turnNo = 13; g.phase = 'main1'; g.step = 'main'; g.paced = false;
      g.recalc();
      if (new URLSearchParams(window.location.search).get('botDiplomacy') === '1') {
        // Poseban vizuelni canary: napravi objektivnog runaway lidera i pusti
        // dva bota da sama sklope javni, vremenski ograničen ugovor.
        ui.me.life = 500;
        const initiator = g.players.find(player => player.isAI && !player.lost);
        g.processDiplomacyCheckpoint(initiator);
      }
      ui.sidebarTab = 'diplomacy';
      ui.render();
      return;
    }
    if (smokeScenario === 'infernoTargeting') {
      void (async () => {
        const titan = new MTG.CardInst(MTG.DEFS['Inferno Titan'], ui.me);
        titan.ctrl = ui.me; titan.zone = 'battlefield'; titan.sick = false;
        g.battlefield.push(titan);
        const opponents = g.players.filter(player => player !== ui.me && !player.lost);
        const names = ['Stormcatch Mentor', 'Ignoble Hierarch', 'Oft-Nabbed Goat'];
        opponents.forEach((player, index) => {
          const card = new MTG.CardInst(MTG.DEFS[names[index]], player);
          card.ctrl = player; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          ui.collapsed = ui.collapsed || new Set();
          ui.collapsed.delete(player.idx);
        });
        g.turnPlayer = ui.me; g.turnNo = 12; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Inferno Titan: choose 1-3 glowing targets, confirm the numbered set, then divide exactly 3 damage.');
        ui.render();
        await g.emit('etb', { card: titan });
        await g.flushTriggers();
        g.lg('Inferno Titan targeting smoke: targets and damage split are locked on the stack.', 'effect');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
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
    if (smokeScenario === 'xManaHaldir') {
      void (async () => {
        const forest = new MTG.CardInst(MTG.DEFS.Forest, ui.me);
        forest.ctrl = ui.me; forest.zone = 'battlefield'; forest.sick = false; forest.tapped = false;
        const haldir = new MTG.CardInst(MTG.DEFS['Haldir, Lórien Lieutenant'], ui.me);
        haldir.zone = 'hand'; ui.me.hand.push(haldir);
        g.battlefield.push(forest);
        g.turnPlayer = ui.me; g.turnNo = 1; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Haldir browser canary: one Forest means the only legal choice is X=0.');
        ui.render();
        if (!await g.castSpell(ui.me, haldir, { from: 'hand' })) {
          throw new Error('Haldir X=0 cast was unexpectedly rejected.');
        }
        const result = haldir.zone === 'graveyard' ? '0/0 and died immediately ✓' : `unexpectedly ended in ${haldir.zone}`;
        g.lg(`Haldir X=0 browser check: ${result}.`, 'ai');
        ui.showLog = true;
        ui.toast(`Haldir X=0: ${result}.`);
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
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
        g.lg(`Elven AI check: Radagast ${madeBird ? 'Bird ✓' : 'not a Bird'}; bad Farsight reveal ${declinedBadReveal ? 'declined ✓' : 'accepted'}.`, 'ai');
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
    if (smokeScenario === 'chaosWarp') {
      void (async () => {
        const opponent = g.players.find(player => player !== ui.me && !player.lost);
        if (!opponent) throw new Error('Chaos Warp scenario requires an opponent');
        const warp = [ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile]
          .flat().find(card => card.name === 'Chaos Warp') || new MTG.CardInst(MTG.DEFS['Chaos Warp'], ui.me);
        g.remove(warp);
        warp.zone = 'hand';
        ui.me.hand.push(warp);

        for (const card of ui.me.library) card.zone = 'nowhere';
        ui.me.library.length = 0;
        const haven = new MTG.CardInst(MTG.DEFS['Wolfwillow Haven'], ui.me);
        haven.zone = 'library';
        ui.me.library.push(haven);

        const island = new MTG.CardInst(MTG.DEFS.Island, ui.me);
        island.ctrl = ui.me; island.zone = 'battlefield'; island.sick = false;
        const stolenRing = new MTG.CardInst(MTG.DEFS['Sol Ring'], ui.me);
        stolenRing.ctrl = opponent; stolenRing.zone = 'battlefield'; stolenRing.sick = false;
        // Keep Sol Ring first so keyboard-only smoke QA can select the intended
        // Chaos Warp target before the Aura choice offers the lone Island.
        g.battlefield.push(stolenRing, island);
        ui.collapsed.delete(opponent.idx);

        g.rnd = () => 0;
        g.turnPlayer = ui.me; g.turnNo = 9; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        ui.me.pool.R = 1; ui.me.pool.C = 2;
        g.recalc();
        ui.toast('Chaos Warp: target the Sol Ring controlled by an opponent, then attach the revealed Wolfwillow Haven to Island.');
        ui.render();

        await g.castSpell(ui.me, warp, { from: 'hand' });
        await g.checkSBA();
        const attached = haven.zone === 'battlefield' && haven.attachedTo === island.iid;
        g.lg(`Chaos Warp browser check: owner library used; Aura ${attached ? 'attached correctly' : 'attachment failed'}.`, 'effect');
        ui.showLog = true;
        ui.sheet = { card: haven };
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
    if (smokeScenario === 'enchantPlayer') {
      void (async () => {
        const opponent = g.players.find(player => player !== ui.me && !player.lost);
        if (!opponent) throw new Error('Enchant player scenario requires an opponent');
        const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
        const curse = zones.flat().find(card => card.name === 'Curse of Clinging Webs') ||
          new MTG.CardInst(MTG.DEFS['Curse of Clinging Webs'], ui.me);
        g.remove(curse);
        curse.ctrl = ui.me; curse.zone = 'hand'; ui.me.hand.push(curse);
        g.turnPlayer = ui.me; g.turnNo = 12; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        ui.collapsed = ui.collapsed || new Set();
        ui.collapsed.delete(opponent.idx);
        const resolveMode = new URLSearchParams(window.location.search).get('smokeResolve') || 'target';
        if (resolveMode === 'stack') g.priorityRound = async () => {};
        if (resolveMode === 'resolved') ui.prioMode = 'off';
        g.recalc();

        const casting = g.castSpell(ui.me, curse, { from: 'hand', free: true });
        const targetDecision = ui.pending;
        if (!targetDecision || targetDecision.q.type !== 'chooseTargets') {
          throw new Error('Enchant player scenario did not open target selection');
        }
        targetDecision.sel = [opponent];
        ui.toast(`Curse of Clinging Webs: review ${opponent.name} as the enchanted player, then lock the target.`);
        ui.render();

        await casting;
        ui.showLog = true;
        if (resolveMode === 'stack') {
          if (!g.stack.some(item => item.card === curse)) throw new Error('Enchant player Aura is not on the stack');
          g.lg(`Enchant player smoke: ${opponent.name} is locked as the target.`, 'effect');
          ui.toast('Enchant player scenario: target is locked and the Aura is on the stack.');
        } else if (resolveMode === 'resolved') {
          if (curse.zone !== 'battlefield' || curse.meta.cursedPlayer !== opponent) {
            throw new Error('Enchant player Aura did not resolve attached to the chosen player');
          }
          g.lg(`Enchant player smoke: ${curse.name} now enchants ${opponent.name}.`, 'effect');
          ui.toast(`Resolved: ${curse.name} enchants ${opponent.name}.`);
        }
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
    if (smokeScenario === 'avengersHuman') {
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
          if (guard >= 120) throw new Error('Avengers human scenario trigger guard');
        };
        const quinjet = take('Avengers Quinjet');
        const ironMan = take('Iron Man, Armored Avenger', 'hand');
        const jocasta = take('Jocasta, Automaton Avenger', 'graveyard');
        take('Captain Marvel, Apex Avenger');
        g.turnPlayer = ui.me; g.turnNo = 28; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        const resolveHandChoice = new URLSearchParams(window.location.search).get('smokeResolve') === 'hand';
        ui.toast(resolveHandChoice
          ? 'Avengers Quinjet: choose the real Hero card that will move from hand to the battlefield.'
          : 'Avengers Quinjet: choose the hand mode or the graveyard mode, then choose its real card.');
        ui.render();
        if (resolveHandChoice) {
          await quinjet.def.triggers[0].run({ g, src: quinjet, you: ui.me, mode: 0, targets: [], data: { card: quinjet } });
        } else {
          await g.emit('etb', { card: quinjet, ctrl: ui.me });
          await settle();
        }
        g.lg(`Avengers human: Iron Man=${ironMan.zone}; Jocasta=${jocasta.zone}; Quinjet=${quinjet.zone}.`, 'ai');
        ui.showLog = true;
        ui.toast('Avengers human scenario: the chosen Quinjet mode and card resolved through the stack.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'avengersAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Avengers Assemble');
        if (!bot) throw new Error('avengersAI scenario zahtijeva smokeAIDeck=Avengers Assemble');
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
          while ((g.pendingTriggers.length || g.stack.length) && guard++ < 160) {
            await g.flushTriggers();
            if (g.stack.length) await g.resolveTop();
          }
          if (guard >= 160) throw new Error('Avengers AI scenario trigger guard');
        };
        const captainMarvel = takeBot('Captain Marvel, Apex Avenger');
        const antMan = takeBot('Ant-Man, Elusive Avenger');
        const door = takeBot('Door of Destinies', 'hand');
        g.remove(door); door.zone = 'nowhere';
        const quinjet = takeBot('Avengers Quinjet');
        const ironMan = takeBot('Iron Man, Armored Avenger', 'hand');
        const jocasta = takeBot('Jocasta, Automaton Avenger', 'graveyard');
        g.turnPlayer = bot; g.turnNo = 29; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        await g.move(door, 'battlefield', { ctrl: bot });
        g.addCounters(antMan, 'shield', 2, false, bot);
        await settle();
        await g.emit('etb', { card: quinjet, ctrl: bot });
        await settle();
        const recent = (g.aiDecisionLog || []).filter(entry => entry.playerName === bot.name).slice(-20);
        g.lg(`Avengers AI: Door=${door.meta.chosenType || 'nema'}; Marvel shield=${captainMarvel.counters.shield || 0}; Iron Man=${ironMan.zone}; Jocasta=${jocasta.zone}; odluke=${recent.length}; fallback=${recent.some(entry => entry.fallback) ? 'DA' : 'NE'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Avengers AI scenario: Hero type, Captain Marvel counters, and Quinjet mode resolved.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'fantasticHuman') {
      void (async () => {
        const take = (name, zone = 'battlefield') => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card); else ui.me[zone].push(card);
          return card;
        };
        const willie = take('Willie Lumpkin, Postman');
        take('Mister Fantastic, Reed Richards');
        const opponent = g.players.find(player => player !== ui.me);
        const threat = new MTG.CardInst(MTG.DEFS["Silver Surfer, Galactus's Herald"], opponent);
        threat.ctrl = opponent; threat.zone = 'battlefield'; threat.sick = false;
        g.battlefield.push(threat);
        const effort = take('Collective Effort', 'hand');
        ui.me.pool.W = 3;
        g.turnPlayer = ui.me; g.turnNo = 30; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Collective Effort: choose removal plus counters, then lock the target/player and tap one creature for escalate.');
        ui.render();
        await g.castSpell(ui.me, effort, { from: 'hand' });
        while (g.pendingTriggers.length || g.stack.length) {
          await g.flushTriggers();
          if (g.stack.length) await g.resolveTop();
        }
        g.lg(`Fantastic human: Surfer=${threat.zone}; Willie +1/+1=${willie.counters['+1/+1'] || 0}.`, 'ai');
        ui.showLog = true;
        ui.toast('Fantastic Four human scenario: modalni targeti i escalate trošak su potpuno razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'fantasticAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'The Fantastic Four');
        if (!bot) throw new Error('fantasticAI scenario zahtijeva smokeAIDeck=The Fantastic Four');
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
          while ((g.pendingTriggers.length || g.stack.length) && guard++ < 160) {
            await g.flushTriggers();
            if (g.stack.length) await g.resolveTop();
          }
          if (guard >= 160) throw new Error('Fantastic AI scenario trigger guard');
        };
        const surfer = takeBot("Silver Surfer, Galactus's Herald");
        const thing = takeBot('The Thing');
        takeBot('Cosmic Crucible');
        const opponents = g.players.filter(player => player !== bot && !player.lost);
        const victim = opponents[0];
        const third = opponents[1];
        const victimCreature = new MTG.CardInst(MTG.DEFS['Galactus, Devourer of Worlds'], victim);
        victimCreature.ctrl = victim; victimCreature.zone = 'battlefield'; victimCreature.sick = false;
        const thirdCreature = new MTG.CardInst(MTG.DEFS['Mister Fantastic, Reed Richards'], third);
        thirdCreature.ctrl = third; thirdCreature.zone = 'battlefield'; thirdCreature.sick = false;
        g.battlefield.push(victimCreature, thirdCreature);
        g.turnPlayer = bot; g.turnNo = 31; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.priorityRound = async () => {};
        g.recalc();

        await g.emit('combatDamageToPlayer', { card: surfer, player: victim, n: 4 });
        await settle();
        bot.pool = { W: 1, U: 1, B: 0, R: 1, G: 1, C: 0 };
        await g.emit('attacks', { card: thing, player: bot, defender: victim });
        await settle();
        const thingPaid = bot.pool.W === 0 && bot.pool.U === 0 && bot.pool.R === 0 && bot.pool.G === 0;
        bot.pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 };
        const signet = takeBot('Arcane Signet', 'hand');
        if (!await g.castSpell(bot, signet, { from: 'hand' })) throw new Error('Fantastic AI Arcane Signet cast nije uspio');
        await settle();
        const forced = g.untilEffects.some(effect => effect.kind === 'mustAttackPlayerCard' &&
          effect.iid === thirdCreature.iid && effect.targetPlayer === victim);
        const copies = g.bf().filter(card => card.ctrl === bot && card.name === 'Arcane Signet').length;
        const recent = (g.aiDecisionLog || []).filter(entry => entry.playerName === bot.name).slice(-24);
        g.lg(`Fantastic AI: Surfer third-party force=${forced ? 'DA' : 'NE'}; Thing empty pay=${thingPaid ? 'DA' : 'NE'}; Signet copies=${copies}; odluke=${recent.length}; fallback=${recent.some(entry => entry.fallback) ? 'DA' : 'NE'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Fantastic Four AI scenario: Surfer, Thing i Cosmic Crucible odluke su razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'wakandaHuman') {
      void (async () => {
        const take = (name, zone = 'battlefield') => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card); else ui.me[zone].push(card);
          return card;
        };
        const revealed = [
          take('Harmonize', 'library'),
          take('Fight for the Throne', 'library'),
          take('Birds of Paradise', 'library'),
          take('Sol Ring', 'library'),
          take('Forest', 'library'),
          take('Canopy Vista', 'library'),
        ];
        const spell = take('Wakanda Forever!', 'graveyard');
        g.turnPlayer = ui.me; g.turnNo = 32; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.priorityRound = async () => {};
        g.recalc();
        ui.toast('Wakanda Forever!: pregledaj šest karata, zatim odvojeno izaberi permanent za battlefield i drugi permanent za ruku.');
        ui.render();
        await spell.def.resolve({ g, src: spell, you: ui.me, targets: [], so: { card: spell } });
        const battlefield = revealed.find(card => card.zone === 'battlefield');
        const hand = revealed.find(card => card.zone === 'hand');
        const graveyard = revealed.filter(card => card.zone === 'graveyard').length;
        g.lg(`Wakanda human: battlefield=${battlefield ? battlefield.name : 'none'} (${battlefield && battlefield.counters.indestructible || 0} indestructible); hand=${hand ? hand.name : 'none'}; graveyard=${graveyard}.`, 'ai');
        ui.showLog = true;
        ui.toast('Wakanda human scenario: oba nezavisna izbora i indestructible counter su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'wakandaAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Wakanda Forever');
        if (!bot) throw new Error('wakandaAI scenario zahtijeva smokeAIDeck=Wakanda Forever');
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
          while ((g.pendingTriggers.length || g.stack.length) && guard++ < 160) {
            await g.flushTriggers();
            if (g.stack.length) await g.resolveTop();
          }
          if (guard >= 160) throw new Error('Wakanda AI scenario trigger guard');
        };
        const revealed = [
          takeBot('Harmonize', 'library'),
          takeBot('Fight for the Throne', 'library'),
          takeBot('Birds of Paradise', 'library'),
          takeBot('Sol Ring', 'library'),
          takeBot('Forest', 'library'),
          takeBot('Canopy Vista', 'library'),
        ];
        const spell = takeBot('Wakanda Forever!', 'graveyard');
        const conduit = takeBot('Conduit of Worlds');
        const conduitCard = takeBot("Black Panther's Claws", 'graveyard');
        takeBot('Kimoyo Beads');
        g.turnPlayer = bot; g.turnNo = 33; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.priorityRound = async () => {};
        g.recalc();
        await spell.def.resolve({ g, src: spell, you: bot, targets: [], so: { card: spell } });
        bot.pool.C = 4;
        const conduitEntry = g.activatableList(bot).find(entry => entry.card === conduit && entry.ability);
        if (!conduitEntry || !await g.activateAbility(bot, conduitEntry)) throw new Error('Wakanda AI Conduit activation nije uspjela');
        await settle();
        bot.life = 8;
        g.phase = 'end'; g.step = 'end';
        await g.emit('endStep', { player: bot });
        await settle();
        const battlefield = revealed.find(card => card.zone === 'battlefield');
        const hand = revealed.find(card => card.zone === 'hand');
        const recent = (g.aiDecisionLog || []).filter(entry => entry.playerName === bot.name).slice(-24);
        g.lg(`Wakanda AI: battlefield=${battlefield ? battlefield.name : 'none'} (${battlefield && battlefield.counters.indestructible || 0} indestructible); hand=${hand ? hand.name : 'none'}; Conduit=${conduitCard.zone}; life=${bot.life}; odluke=${recent.length}; fallback=${recent.some(entry => entry.fallback) ? 'DA' : 'NE'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Wakanda AI scenario: Wakanda Forever!, Conduit i Kimoyo odluke su razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'generalEffects') {
      void (async () => {
        g.turnPlayer = ui.me; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.paced = true;
        const commander = ui.me.commanders[0];
        if (!commander) throw new Error('General effects scenario nema komandera');
        await g.move(commander, 'battlefield', { ctrl: ui.me });
        await g.damageOpponents(commander, ui.me, 2);
        g.lg('General effects smoke: globalna šteta potvrđena i primijenjena.', 'effect');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'planeswalkerCombat') {
      const makePermanent = (name, ctrl, loyalty) => {
        const card = new MTG.CardInst(MTG.DEFS[name], ctrl);
        card.ctrl = ctrl; card.zone = 'battlefield'; card.sick = false; card.tapped = false;
        g.battlefield.push(card);
        if (loyalty !== undefined) card.counters.loyalty = loyalty;
        return card;
      };
      const attackers = [
        makePermanent('Riders of Gavony', ui.me),
        makePermanent('Humble Defector', ui.me),
        makePermanent('Stormcatch Mentor', ui.me),
        makePermanent('Academy Manufactor', ui.me),
        makePermanent('Whirler Rogue', ui.me),
      ];
      const walkers = [
        makePermanent("Vraska, Betrayal's Sting", g.players[1], 6),
        makePermanent("Elspeth, Sun's Champion", g.players[2], 4),
        makePermanent('Tezzeret, Betrayer of Flesh', g.players[3], 4),
      ];
      g.turnPlayer = ui.me; g.turnNo = 20; g.phase = 'combat'; g.step = 'attackers'; g.paced = false;
      g.combat = { attackers: [], defenders: new Map() };
      g.recalc();
      const opponents = ui.me.opponents(g);
      void ui.me.controller.decide(g, {
        type: 'attackers', eligible: attackers, opponents,
        attackTargets: opponents.concat(walkers), forced: [attackers[0]],
      }).then(declared => {
        const valid = Array.isArray(declared) ? declared.filter(entry =>
          attackers.includes(entry.card) && g.legalDeclarationAttackTargets(entry.card).includes(entry.target)) : [];
        for (const entry of valid) {
          entry.card.attacking = entry.target;
          if (!entry.card.kw('vigilance')) g.tap(entry.card);
        }
        g.combat.attackers = valid.map(entry => entry.card);
        g.lg(`Planeswalker combat smoke: ${valid.length} attackers assigned.`, 'attack');
        ui.render();
      });
      // Browser canary namjerno fokusira planeswalkera: prvi klik na eligible
      // kartu mora je dodijeliti upravo Vraska laneu, bez per-card popupa.
      if (ui.pending) {
        ui.pending.attackTarget = walkers[0];
        if (new URLSearchParams(window.location.search).get('smokePreset') === 'assigned') {
          ui.pending.sel.push({ card: attackers[0], target: walkers[0] });
        }
      }
      ui.render();
      return;
    }
    g.start().catch(err => {
      console.error(err);
        ui.toast('Game error: ' + err.message);
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
      enchantedPlayer: c.meta && c.meta.cursedPlayer ? c.meta.cursedPlayer.name : null,
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
      diplomacy: g.diplomacy && g.diplomacy.enabled && ui && ui.me ? (() => {
        const view = g.diplomacyView(ui.me);
        return {
          enabled: true, unlocked: view.status.unlocked, completedRounds: view.status.rounds,
          unlockRounds: view.status.unlockRounds, reason: view.status.reason,
          offersRemaining: view.offersRemaining,
          incoming: view.incoming.map(proposal => ({ id: proposal.id, from: proposal.fromName })),
          activeContracts: view.activeContracts.map(contract => ({
            id: contract.id,
            clauses: contract.clauses.map(clause => ({ state: clause.state, label: clause.label })),
          })),
        };
      })() : { enabled: false },
      pending: pending ? {
        type: pending.type,
        prompt: pending.prompt || null,
        xChoice: pending.type === 'chooseX' ? {
          min: pending.min, max: pending.max,
          legalValues: pending.values || undefined,
          current: ui.pending && ui.pending.xVal,
        } : undefined,
        selectedTargets: pending.type === 'chooseTargets' && ui.pending
          ? (ui.pending.sel || []).map((target, index) => ({
            order: index + 1, name: target.name || target.card && target.card.name || 'stack object',
          })) : undefined,
        allocation: pending.type === 'chooseX' && pending.allocation ? {
          kind: pending.allocation.kind,
          source: pending.allocation.source && pending.allocation.source.name,
          total: pending.allocation.total,
          currentTarget: pending.allocation.targets[pending.allocation.index] &&
            pending.allocation.targets[pending.allocation.index].name,
          currentValue: ui.pending && ui.pending.xVal,
          assigned: (pending.allocation.assigned || []).map(entry => ({
            name: entry.target && entry.target.name, amount: entry.n,
          })),
          remaining: pending.allocation.left,
        } : undefined,
        effect: pending.type === 'effectReview' ? {
          kind: pending.effectKind,
          source: pending.source && pending.source.name,
          amount: pending.amount,
          targets: (pending.targets || []).map(player => ({ name: player.name, life: player.life })),
        } : undefined,
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
      stack: g.stack.map((item, index) => ({
        index, kind: item.kind, name: item.name, controller: item.ctrl && item.ctrl.name,
        damageDivision: (item.damageDivision || item.ctx && item.ctx.damageDivision || []).map(entry => ({
          target: entry.playerIdx !== null && entry.playerIdx !== undefined
            ? g.players.find(player => player.idx === entry.playerIdx)?.name
            : g.byIid(entry.iid)?.name,
          amount: entry.n,
        })),
      })),
      combat: g.combat ? {
        attackers: g.combat.attackers.map(card),
      } : null,
      aiDecisions: (g.aiDecisionLog || []).slice(-3).map(entry => ({
        turn: entry.turn, player: entry.playerName, chosen: entry.chosen,
        score: entry.score, reason: entry.scoreBreakdown,
        nodes: entry.analyzedNodes, depth: entry.reachedDepth,
        tieBreak: entry.tieBreak, fallback: entry.fallback,
      })),
      pendingDecision: ui && ui.pending ? {
        type: ui.pending.q.type,
        eligible: (ui.pending.q.eligible || []).map(card => card.name),
        forced: (ui.pending.q.forced || []).map(card => card.name),
        assignments: (ui.pending.sel || []).map(entry => ({ card: entry.card.name, target: entry.target.name })),
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
      const smokeAIDeck = smoke.get('smokeAIDeck');
      startGame({
        deck: smokeDeck,
        commanders: [MTG.DECKS[smokeDeck].commander],
        ai: 3,
        aiDecks: smokeAIDeck && MTG.DECKS[smokeAIDeck] ? [smokeAIDeck] : [],
        aiStyles: ['balanced', 'balanced', 'balanced'],
        aiRandomCommanders: false,
        sumPartnerDamage: false,
        diplomacyEnabled: smoke.get('diplomacy') === '1',
        difficulty: 'normal',
        seed: smoke.get('seed') || '11081',
      });
    }
  });
})();
