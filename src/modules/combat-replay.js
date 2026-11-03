// Frozen combat outcomes in a viewport-owned presentation. No rules decisions
// are answered here, and replaying never runs damage a second time.
'use strict';
(() => {
  const U = globalThis.MTG;
  if (typeof document === 'undefined' || !U?.UI) return;
  const histories = new WeakMap();
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let active = null;
  const node = (tag, cls = '', text) => {
    const el = document.createElement(tag); el.className = cls;
    if (text !== undefined) el.textContent = String(text);
    return el;
  };
  const button = (text, action, cls = '') => {
    const el = node('button', cls, text); el.type = 'button'; el.onclick = action; return el;
  };
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  // "AI Dragon" → "D", "Jordan Lee" → "JL": every bot name starts with AI.
  const initials = name => String(name || '?').replace(/^AI\s+/i, '').split(/\s+/).filter(Boolean)
    .slice(0, 2).map(word => word[0]).join('').toUpperCase() || '?';
  const label = keyword => U.KEYWORD_VISUALS?.[keyword.toLowerCase()]?.label || keyword.charAt(0).toUpperCase() + keyword.slice(1);
  const keywords = card => [...new Set((card?.keywords || []).filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))];
  const category = keyword => /first strike|double strike|trample|flanking|rampage|frenzy|bushido/.test(keyword) ? 'strike'
    : /flying|reach|menace|haste|vigilance|walk|unblockable|skulk|shadow|fear|horsemanship/.test(keyword) ? 'evasion'
    : /indestructible|protection|hexproof|ward|shroud|absorb|regenerat|shield/.test(keyword) ? 'shield'
    : /deathtouch|infect|wither|toxic|poison/.test(keyword) ? 'poison'
    : /lifelink|extort|life/.test(keyword) ? 'life'
    : /counter|prowess|adapt|evolve|mentor|training|exalted|battle cry|melee/.test(keyword) ? 'growth'
    : /persist|undying|blink|exile|ninjutsu|unearth|phasing/.test(keyword) ? 'zone' : 'ability';
  const icons = {strike: 'attack', evasion: 'flying', shield: 'shield', poison: 'deathtouch', life: 'life', growth: 'proliferate', zone: 'exile', ability: 'effects'};
  function icon(name) {
    const wrap = node('span', 'combat-replay-icon');
    wrap.setAttribute('aria-hidden', 'true');
    if (U.icon) wrap.innerHTML = U.icon(name);
    return wrap;
  }
  function history(ui) {
    let state = histories.get(ui);
    if (!state || state.game !== ui.game) {
      if (active?.ui === ui) close(false);
      state = {game: ui.game, seen: new Set(), replays: []}; histories.set(ui, state);
    }
    return state;
  }
  function remember(ui, replay) {
    if (!replay?.id || !Array.isArray(replay.clashes) || !replay.clashes.length || !ui.game) return false;
    const state = history(ui);
    if (state.seen.has(replay.id)) return false;
    state.seen.add(replay.id);
    if (state.seen.size > 100) state.seen.delete(state.seen.values().next().value);
    if (state.replays.at(-1)?.combatId !== replay.combatId) state.replays = [];
    // Damage steps are small; retain a bounded history even for custom games.
    state.replays.push(replay); state.replays = state.replays.slice(-8);
    return true;
  }
  const entries = replays => replays.flatMap(replay => replay.clashes.map((clash, index) => ({replay, clash, index})));
  const reduced = state => !!state.ui.reducedMotion || motion.matches || document.body.classList.contains('reduced-motion');
  const stale = state => state.ui.game !== state.game || !document.body.classList.contains('game-active');
  function clearTimers(state) {
    clearTimeout(state.hitTimer); clearTimeout(state.nextTimer); clearTimeout(state.closeTimer);
    state.hitTimer = state.nextTimer = state.closeTimer = null;
  }
  // A Solo game waits for each recorded step (bindCombatReplayGate). Release
  // every step whose strikes have all been shown, and everything on close.
  function release(state, all = false) {
    const waiting = state.waits || [];
    state.waits = all ? [] : waiting.filter(wait => wait.last >= state.index);
    for (const wait of waiting) if (all || wait.last < state.index) wait.resolve();
  }
  // Seconds per strike follow the game's speed: Normal keeps the authored
  // timing, Fast shortens and Slow lengthens the time after the hit. The hit
  // itself stays in step with the card animation.
  function dwell(state, ms) {
    const normal = U.SPEEDS?.normal?.[1] || 1.5625, factor = Number(state.game?.speedFactor);
    // An instant game (speed 0) has no viewer pace of its own: authored timing.
    const scale = Math.min(1.6, Math.max(0.6, factor > 0 ? factor / normal : 1));
    return Math.round(650 + (ms - 650) * scale);
  }
  function close(restore = true) {
    const state = active; if (!state) return;
    active = null; clearTimers(state); release(state, true);
    state.overlay.remove();
    state.gameRoot?.removeAttribute('data-combat-replay-covered');
    if (state.gameRoot) state.gameRoot.inert = state.previousInert;
    document.body.style.overflow = state.previousOverflow;
    document.removeEventListener('keydown', state.onKey, true);
    document.removeEventListener('focusin', state.onFocus, true);
    if (restore && state.previousFocus?.isConnected && !state.previousFocus.closest('[inert]')) state.previousFocus.focus({preventScroll: true});
  }
  function schedule(state) {
    if (active !== state || state.paused) return;
    state.started = Date.now();
    if (!state.impact) state.hitTimer = setTimeout(() => {
      if (active !== state) return;
      state.impact = true; state.stage.classList.add('is-impact'); state.stage.dataset.impact = 'true';
    }, state.hitRemaining);
    state.nextTimer = setTimeout(() => next(state), state.nextRemaining);
  }
  function pause(state, paused = true) {
    if (active !== state || state.paused === paused) return;
    if (paused) {
      const elapsed = Date.now() - state.started;
      state.hitRemaining = Math.max(0, state.hitRemaining - elapsed);
      state.nextRemaining = Math.max(0, state.nextRemaining - elapsed);
      clearTimers(state);
    }
    state.paused = paused;
    state.overlay.classList.toggle('is-paused', paused);
    state.pause.textContent = paused ? 'Resume' : 'Pause'; state.pause.setAttribute('aria-pressed', String(paused));
    updateProgress(state);
    if (!paused && state.ended) { close(); return; }
    if (!paused) schedule(state);
  }
  function next(state) {
    if (active !== state) return;
    if (state.ended) { close(); return; }
    clearTimers(state);
    ++state.index;
    release(state);
    if (state.index >= state.entries.length) {
      // After first-strike damage the regular step follows at once; keep the
      // window open briefly so the two steps play as one combat.
      const last = state.entries.at(-1)?.replay;
      if (last?.step === 'first' && !state.paused && !stale(state) && !state.game?.gameOver) {
        state.ended = true; state.closeTimer = setTimeout(() => { if (active === state) close(); }, 700);
      } else close();
      return;
    }
    show(state);
  }
  // A rendering failure must never leave a waiting game behind the window.
  function show(state) {
    try { render(state); } catch (error) { console.error(error); close(false); }
  }
  function updateProgress(state) {
    const entry = state.entries[state.index]; if (!entry) return;
    state.progress.textContent = `${state.entries.length === 1 ? '1 strike' : `Strike ${state.index + 1} of ${state.entries.length}`}${state.paused ? ' · Paused' : ''}`;
    state.next.textContent = state.index + 1 < state.entries.length ? 'Next strike' : 'Finish';
    state.meter.setAttribute('aria-valuenow', String(state.index + 1));
    state.meter.setAttribute('aria-valuemax', String(state.entries.length));
    state.meter.firstChild.style.width = `${100 * (state.index + 1) / state.entries.length}%`;
  }
  function abilities(card, state) {
    const values = keywords(card); if (!values.length) return null;
    const group = node('div', 'combat-replay-abilities'); group.setAttribute('aria-label', 'Abilities at damage');
    const badges = node('div', 'combat-replay-badges');
    for (const keyword of values.slice(0, 3)) {
      const theme = category(keyword.toLowerCase()), visual = U.KEYWORD_VISUALS?.[keyword.toLowerCase()];
      const badge = node('span', `combat-replay-badge effect-${theme}`);
      badge.dataset.keyword = keyword; badge.title = `${label(keyword)} · ability at this damage step`;
      badge.append(icon(visual?.icon || icons[theme]), document.createTextNode(label(keyword))); badges.append(badge);
    }
    group.append(badges);
    if (values.length > 3) {
      const details = node('details', 'combat-replay-details');
      details.append(node('summary', '', `All abilities (${values.length})`));
      const list = node('ul'); for (const keyword of values) list.append(node('li', `effect-${category(keyword.toLowerCase())}`, label(keyword)));
      details.append(list); details.ontoggle = () => { if (details.open) pause(state); }; group.append(details);
    }
    return group;
  }
  function aura(card, entry) {
    const art = node('div', 'combat-replay-aura'); art.setAttribute('aria-hidden', 'true');
    const values = keywords(card).map(keyword => keyword.toLowerCase());
    for (const theme of new Set(values.map(category))) {
      const field = node('i', `combat-replay-field effect-${theme}`); field.dataset.effectCue = theme; art.append(field);
    }
    for (const ability of ['flying', 'reach', 'menace', 'haste', 'vigilance']) if (values.includes(ability)) {
      const cue = node('i', `combat-replay-cue cue-${ability}`); cue.dataset.effectCue = ability; art.append(cue);
    }
    const hit = number(card.dealtDamage) > 0;
    for (const ability of ['first strike', 'double strike', 'deathtouch']) if (hit && values.includes(ability) && (ability !== 'first strike' || entry.replay.step === 'first')) {
      const cue = node('i', `combat-replay-result result-${ability.replaceAll(' ', '-')}`); cue.dataset.effectCue = ability; art.append(cue);
    }
    if ((entry.replay.effects || []).some(effect => effect.kind === 'lifeGain' && effect.sourceId === card.id && effect.lifelink && effect.amount > 0)) {
      const cue = node('i', 'combat-replay-result result-lifelink'); cue.dataset.effectCue = 'lifelink'; art.append(cue);
    }
    if (number(card.receivedDamage) > 0 && !card.leftBattlefield && values.includes('indestructible')) {
      const cue = node('i', 'combat-replay-result result-indestructible'); cue.dataset.effectCue = 'indestructible'; art.append(cue);
    }
    return art;
  }
  function fighter(card, role, state) {
    const el = node('article', `combat-replay-fighter fighter-${role}`);
    el.dataset.testid = `combat-replay-${role}`; el.dataset.cardId = String(card.id || card.iid || '');
    const name = card.faceDown ? 'Face-down creature' : card.name || 'Creature';
    el.setAttribute('aria-label', name);
    // Shared blockers can appear in several clashes. Their stats below are
    // whole-step totals, but the impact shows only this clash's actual hit.
    const incoming = (state.entries[state.index].clash.damage || []).filter(hit => hit.targetId === card.id && hit.combat !== false)
      .reduce((total, hit) => total + number(hit.amount), 0);
    const art = node('div', `combat-replay-card${card.died ? ' is-defeated' : ''}${incoming > 0 ? ' has-damage' : ''}${number(card.preventedDamage) > 0 ? ' has-prevention' : ''}`);
    if (U.cardArtHTML) art.innerHTML = U.cardArtHTML({...card, name, owner: {idx: card.ownerIdx}}).replace('loading="lazy"', 'loading="eager"');
    if (!card.faceDown && card.image && art.querySelector('img')) art.querySelector('img').src = card.image;
    if (!art.children.length) art.append(node('strong', 'combat-replay-fallback', name));
    art.append(aura(card, state.entries[state.index]));
    if (incoming > 0) {
      const contact = node('span', 'combat-replay-contact'); contact.setAttribute('aria-hidden', 'true'); art.append(contact);
      const hit = node('span', 'combat-replay-hit', `−${incoming}`);
      hit.setAttribute('aria-label', `${name} received ${incoming} damage in this clash`); art.append(hit);
    }
    el.append(art, node('h3', 'combat-replay-card-name', name));
    const stats = node('div', 'combat-replay-stats');
    const targetCounter = role === 'target' ? (card.types || []).includes('Battle') ? 'defense' : (card.types || []).includes('Planeswalker') ? 'loyalty' : null : null;
    stats.append(node('strong', '', targetCounter ? `${number(card.countersBefore?.[targetCounter])} ${targetCounter}` : `${card.power ?? '?'}/${card.toughness ?? '?'}`),
      node('span', '', role === 'target' ? `${number(card.receivedDamage)} damage this step` : `${number(card.dealtDamage)} dealt · ${number(card.receivedDamage)} taken this step`));
    stats.title = 'Recorded totals for this creature in this damage step'; el.append(stats);
    const outcomes = node('div', 'combat-replay-outcomes');
    if (number(card.preventedDamage) > 0) outcomes.append(node('span', 'effect-shield', `${number(card.preventedDamage)} prevented`));
    if (number(card.lifeGain) > 0) outcomes.append(node('span', 'effect-life', `+${number(card.lifeGain)} life this step`));
    for (const key of card.leftBattlefield || card.countersAfter == null ? [] : new Set([...Object.keys(card.countersBefore || {}), ...Object.keys(card.countersAfter || {})])) {
      const before = number(card.countersBefore?.[key]), after = number(card.countersAfter?.[key]);
      if (before !== after) outcomes.append(node('span', 'effect-growth', `${key} counters: ${before} → ${after}`));
    }
    if (card.died) outcomes.append(node('span', 'combat-replay-death', 'Died'));
    else if (card.leftBattlefield) outcomes.append(node('span', 'effect-zone', `Moved to ${card.zoneAfter || 'another zone'}`));
    if (outcomes.children.length) el.append(outcomes);
    const badges = abilities(card, state); if (badges) el.append(badges);
    return el;
  }
  function target(entry, state) {
    const {clash} = entry, defender = clash.defender || {};
    const hits = (clash.damage || []).filter(hit => hit.targetId === defender.id && hit.sourceId === clash.attacker?.id);
    const damage = hits.reduce((total, hit) => total + number(hit.amount), 0);
    if (defender.kind === 'removed') return node('p', 'combat-replay-empty', 'Attack destination left combat. No player damage is assumed.');
    if (defender.kind === 'permanent') {
      const result = fighter(defender, 'target', state); result.classList.add('combat-replay-permanent-target');
      result.prepend(node('p', 'combat-replay-owner', (defender.types || []).includes('Battle') ? 'BATTLE' : 'PLANESWALKER'));
      return result;
    }
    const result = node('div', `combat-replay-player${damage > 0 ? ' has-damage' : ''}`);
    result.dataset.testid = 'combat-replay-defender';
    const avatar = node('div', 'combat-replay-avatar');
    const seat = state.game?.players?.find(player => player.idx === defender.idx);
    const commander = seat && (seat.commanders?.length ? seat.commanders : seat.command || [])[0];
    if (commander && !commander.faceDown && U.cardImageURL) {
      // Commander identity is public, as in the seat portraits on the table.
      // Without a local art crop the art URL is the whole card: zoom to its art.
      const face = String(commander.name).split(' // ')[0];
      const wholeCard = !U.CARD_ART_PATHS?.[face] && !!U.CARD_IMAGE_PATHS?.[face];
      const frame = node('span', 'combat-replay-portrait-frame');
      const art = node('img', `combat-replay-portrait${wholeCard ? ' is-card' : ''}`); art.alt = ''; art.src = U.cardImageURL(commander.name, 'art');
      art.onerror = () => { frame.remove(); avatar.prepend(node('span', 'combat-replay-initials', initials(defender.name))); };
      frame.append(art); avatar.append(frame);
    } else avatar.append(node('span', 'combat-replay-initials', initials(defender.name)));
    if (damage > 0) {
      // Infect still deals damage, but does not remove life. Keep the impact
      // number explicitly about damage; the step totals show life/poison.
      const hit = node('span', `combat-replay-face-hit${hits.some(hit => hit.infect) ? ' is-poison' : ''}`);
      hit.setAttribute('aria-hidden', 'true');
      hit.append(node('strong', '', damage), node('small', '', 'damage')); avatar.append(hit);
    }
    result.append(avatar, node('h3', '', defender.name || 'Defender'));
    result.append(node('span', 'combat-replay-player-damage', damage > 0 ? `${damage} damage` : clash.blocked ? 'No damage reached player' : 'No damage dealt'));
    if (damage > 0 && hits.some(hit => hit.keywords?.includes('trample'))) { result.append(node('span', 'combat-replay-trample', 'Trample')); result.dataset.effectCue = 'trample'; }
    return result;
  }
  function totals(entry) {
    if (entry.index !== entry.replay.clashes.length - 1) return null;
    const players = (entry.replay.players || []).filter(player => player.lifeBefore !== player.lifeAfter || player.poisonBefore !== player.poisonAfter);
    if (!players.length) return null;
    const section = node('section', 'combat-replay-totals'); section.setAttribute('aria-label', 'Damage step totals');
    section.append(node('h3', '', 'Step totals · all attackers'));
    for (const player of players) {
      const row = node('p'); row.append(node('b', '', player.name), node('span', '', `Life ${player.lifeBefore} → ${player.lifeAfter}`));
      if (player.poisonBefore !== player.poisonAfter) row.append(node('span', 'effect-poison', `Poison ${player.poisonBefore} → ${player.poisonAfter}`));
      section.append(row);
    }
    return section;
  }
  function render(state) {
    if (stale(state)) { close(false); return; }
    const entry = state.entries[state.index], {replay, clash} = entry;
    // Manual stepping while paused should reveal the chosen outcome, not
    // freeze new cards at the invisible start of their entrance animation.
    state.impact = state.paused || reduced(state); state.hitRemaining = state.impact ? 0 : 650;
    state.nextRemaining = dwell(state, clash.blockers?.length > 2 ? 4600 : 3300);
    state.overlay.classList.toggle('is-reduced', reduced(state));
    state.overlay.classList.toggle('is-preview', state.paused);
    state.overlay.classList.toggle('is-paused', state.paused);
    state.title.textContent = clash.blocked ? 'Clash of creatures' : 'Direct strike';
    state.kicker.textContent = `TURN ${replay.turn ?? '—'} · COMBAT`;
    state.step.textContent = replay.step === 'first' ? 'First-strike damage' : 'Combat damage';
    state.matchup.textContent = `${clash.attacker?.name || 'Attacker'}${replay.clashes.length > 1 ? ` · attacker ${entry.index + 1} of ${replay.clashes.length}` : ''}`;
    state.stage = node('div', `combat-replay-stage${(clash.blockers || []).length > 1 ? ' is-multiple' : ''}${clash.blocked ? ' is-blocked' : ' is-direct'}${state.impact ? ' is-impact' : ''}`);
    state.stage.dataset.testid = 'combat-replay-clash'; state.stage.dataset.impact = String(state.impact);
    state.stage.tabIndex = 0; state.stage.setAttribute('aria-label', 'Combat cards; scroll for all blockers and results');
    state.stage.onwheel = () => pause(state); state.stage.ontouchmove = () => pause(state);
    const attack = node('section', 'combat-replay-side combat-replay-attacking');
    attack.setAttribute('aria-label', 'Attacker'); attack.append(node('p', 'combat-replay-owner', `${replay.attackerPlayer?.name || 'Attacker'} · ATTACKING`), fighter(clash.attacker, 'attacker', state));
    const versus = node('div', 'combat-replay-versus', 'VS'); versus.setAttribute('aria-hidden', 'true');
    const defend = node('section', 'combat-replay-side combat-replay-defending'); defend.setAttribute('aria-label', 'Defenders');
    defend.append(node('p', 'combat-replay-owner', `${clash.defender?.name || 'Defender'} · ${clash.blocked ? `${clash.blockers.length} BLOCKER${clash.blockers.length === 1 ? '' : 'S'}` : 'UNBLOCKED'}`));
    if (clash.blocked) {
      const blockers = node('div', 'combat-replay-blockers');
      for (const blocker of clash.blockers || []) blockers.append(fighter(blocker, 'blocker', state));
      if (!blockers.children.length) blockers.append(node('p', 'combat-replay-empty', 'Blockers left combat. Attack remains blocked.'));
      defend.append(blockers);
      if ((clash.damage || []).some(hit => hit.targetId === clash.defender?.id && hit.sourceId === clash.attacker?.id && hit.amount > 0)) defend.append(target(entry, state));
    } else defend.append(target(entry, state));
    state.stage.append(attack, versus, defend);
    const summary = totals(entry); if (summary) state.stage.append(summary);
    state.body.replaceChildren(state.stage);
    state.pause.textContent = state.paused ? 'Resume' : 'Pause'; state.pause.setAttribute('aria-pressed', String(state.paused));
    // The centred window keeps the tallest height it has had, so a strike
    // with less content (no step totals) does not make it jump.
    const height = Number(state.dialog.offsetHeight);
    if (height > (state.minHeight || 0)) { state.minHeight = height; state.dialog.style.minHeight = `min(${height}px, calc(100dvh - 40px))`; }
    updateProgress(state); schedule(state);
  }
  function start(ui, replays) {
    if (active) close(false);
    const all = entries(replays); if (!all.length) return;
    const state = {ui, game: ui.game, entries: all, index: 0, paused: false, impact: false, waits: [],
      previousFocus: document.activeElement, previousOverflow: document.body.style.overflow,
      gameRoot: document.getElementById('game')};
    active = state;
    const overlay = state.overlay = node('div', 'combat-replay-overlay'); overlay.dataset.testid = 'combat-replay';
    const dialog = state.dialog = node('div', 'combat-replay-window');
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', 'Combat replay');
    const head = node('header', 'combat-replay-header'), heading = node('div');
    state.kicker = node('span', 'combat-replay-kicker'); state.title = node('h2'); heading.append(state.kicker, state.title);
    state.skip = button('Skip', () => close(), 'combat-replay-skip'); head.append(heading, state.skip);
    const step = node('div', 'combat-replay-step'); state.step = node('strong'); state.matchup = node('span'); step.append(state.step, state.matchup);
    state.body = node('div', 'combat-replay-body');
    const foot = node('footer', 'combat-replay-footer'); foot.append(node('p', '', 'Recorded combat · results already applied'));
    const controls = node('div', 'combat-replay-controls');
    state.pause = button('Pause', () => pause(state, !state.paused)); state.progress = node('span'); state.next = button('Next strike', () => next(state));
    controls.append(state.pause, state.progress, state.next); foot.append(controls);
    state.meter = node('div', 'combat-replay-progress'); state.meter.setAttribute('role', 'progressbar'); state.meter.setAttribute('aria-label', 'Combat playback'); state.meter.setAttribute('aria-valuemin', '0'); state.meter.append(node('span')); foot.append(state.meter);
    dialog.append(head, step, state.body, foot); overlay.append(dialog);
    document.body.append(overlay); document.body.style.overflow = 'hidden';
    state.previousInert = !!state.gameRoot?.inert;
    if (state.gameRoot) { state.gameRoot.inert = true; state.gameRoot.setAttribute('data-combat-replay-covered', 'true'); }
    state.onKey = event => {
      if (active !== state) return;
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const items = [...dialog.querySelectorAll('button, summary, [tabindex="0"]')].filter(el => el.getClientRects().length && (!el.closest('details:not([open])') || el.tagName === 'SUMMARY'));
        const index = items.indexOf(document.activeElement);
        if (index < 0 || (event.shiftKey ? index === 0 : index === items.length - 1)) { event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0]?.focus(); }
      }
    };
    state.onFocus = event => { if (active === state && !dialog.contains(event.target)) state.skip.focus({preventScroll: true}); };
    document.addEventListener('keydown', state.onKey, true); document.addEventListener('focusin', state.onFocus, true);
    show(state); state.skip.focus({preventScroll: true});
  }
  function enqueue(ui, replay) {
    if (ui.combatAnimationEnabled === false || ui.game?._simulation || ui.accountReplay || document.hidden || !document.body.classList.contains('game-active')) return;
    if (active?.ui === ui && active.game === ui.game) {
      // Avoid an unbounded presentation backlog while AI combat advances.
      if (active.entries.length < 400) active.entries.push(...entries([replay]));
      if (active.ended && active.index < active.entries.length) {
        // The regular damage step arrived during the first-strike grace.
        clearTimers(active); active.ended = false; show(active);
      } else updateProgress(active);
      return;
    }
    start(ui, [replay]);
  }
  U.UI.prototype.showCombatReplay = function (replay) { if (remember(this, replay)) enqueue(this, replay); };
  U.UI.prototype.syncCombatReplays = function (replays, {autoplay = false} = {}) {
    for (const replay of replays || []) if (remember(this, replay) && autoplay) enqueue(this, replay);
  };
  // Solo only (main.js): the game holds each damage step until this view has
  // shown it, so turns never run on behind the window. Live hosts publish
  // events instead and never wait for a viewer.
  U.UI.prototype.bindCombatReplayGate = function (game) {
    if (!game || game._simulation || game.onlinePresentation) return;
    game.uiHooks = game.uiHooks || {};
    game.uiHooks.combatReplay = {
      enabled: () => this.game === game && this.combatAnimationEnabled !== false && !this.accountReplay &&
        !document.hidden && document.body.classList.contains('game-active'),
      wait: replay => this.waitForCombatReplay(replay),
    };
  };
  U.UI.prototype.waitForCombatReplay = function (replay) {
    const state = active;
    const last = state?.ui === this ? state.entries.findLastIndex(entry => entry.replay.id === replay?.id) : -1;
    if (last < 0 || last < state.index) return Promise.resolve();
    return new Promise(resolve => state.waits.push({last, resolve}));
  };
  U.UI.prototype.hasCombatReplay = function (game = this.game) {
    const state = history(this); return state.game === game && state.replays.length > 0;
  };
  U.UI.prototype.replayLastCombat = function () {
    const state = history(this); if (state.replays.length) start(this, state.replays);
  };
  const renderUI = U.UI.prototype.render;
  U.UI.prototype.render = function (...args) {
    if (active && (active.ui !== this || stale(active))) close(false);
    const result = renderUI.apply(this, args);
    // Arena renders may update accessibility ownership; the replay keeps it.
    if (active?.ui === this && active.gameRoot) active.gameRoot.inert = true;
    return result;
  };
  new MutationObserver(() => {
    if (active && stale(active)) close(false);
    else if (active) active.overlay.classList.toggle('is-reduced', reduced(active));
  }).observe(document.body, {attributes: true, attributeFilter: ['class']});
  document.addEventListener('visibilitychange', () => { if (document.hidden && active) close(false); });
  motion.addEventListener?.('change', () => { if (active) active.overlay.classList.toggle('is-reduced', reduced(active)); });
})();
