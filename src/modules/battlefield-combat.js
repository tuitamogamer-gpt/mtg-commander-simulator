// Combat stays on the battlefield. Drafts use the existing decision objects;
// only explicit confirmation hands a declaration back to the rules engine.
const node = (tag, cls, text) => {
  const item = document.createElement(tag);
  item.className = cls;
  if (text !== undefined) item.textContent = text;
  return item;
};
const button = (label, action, cls = '') => {
  const item = node('button', `pbtn ${cls}`, label);
  item.type = 'button'; item.onclick = action;
  return item;
};
const entityKey = entity => entity.iid != null ? `card-${entity.iid}` : `player-${entity.idx}`;
const combatDecision = pd => ['attackers', 'blockers', 'combatReview'].includes(pd?.q.type);
const inspect = (ui, card) => { ui.sheet = { card }; ui.render(); };
let connectionOwner = null;

export function prepareBattlefieldCombat(ui) {
  const pd = ui.pending;
  if (!combatDecision(pd)) return;
  if (!pd.battlefieldCombat) {
    pd.battlefieldCombat = true;
    pd.boardPeek = true;
    pd.blockPending = [];
    ui.commandMobileBoard = 'mine';
    ui.mobileView = 'mine';
  }
  if (pd.q.type === 'attackers') {
    const eligible = pd.q.eligible.filter(card => card.zone === 'battlefield');
    pd.sel = pd.sel.filter(entry => eligible.includes(entry.card) && ui.arenaLegalAttackTargets(entry.card, pd).includes(entry.target));
    pd.attackPending = (pd.attackPending || []).filter(card => eligible.includes(card) && !pd.sel.some(entry => entry.card === card));
    if (pd.attackTarget && !eligible.some(card => ui.arenaLegalAttackTargets(card, pd).includes(pd.attackTarget))) pd.attackTarget = null;
  }
}

function chooseDefender(ui, pd, target) {
  if (ui.pending !== pd) return;
  const waiting = pd.attackPending || [];
  for (const card of waiting) {
    if (!ui.arenaLegalAttackTargets(card, pd).includes(target)) continue;
    pd.sel.push({ card, target });
  }
  pd.attackPending = waiting.filter(card => !pd.sel.some(entry => entry.card === card));
  // Creature-first groups finish here; defender-first selection stays armed.
  pd.attackTarget = waiting.length ? null : pd.attackTarget === target ? null : target;
  ui.render();
}

function chooseAttacker(ui, pd, attacker) {
  if (ui.pending !== pd) return;
  const waiting = pd.blockPending || [];
  if (!waiting.length) { pd.mode = pd.mode === attacker ? null : attacker; ui.render(); return; }
  pd.blockPending = [];
  pd.mode = null;
  for (const blocker of waiting) ui.assignBlocker(blocker, attacker);
  ui.render();
}

function chooseBlocker(ui, pd, blocker) {
  if (ui.pending !== pd) return;
  if (pd.mode) { ui.assignBlocker(blocker, pd.mode); return; }
  const waiting = pd.blockPending || [];
  if (waiting.includes(blocker)) pd.blockPending = waiting.filter(card => card !== blocker);
  else if (ui.blockTargets(blocker, pd).length) pd.assigns.delete(blocker);
  else pd.blockPending = [...waiting, blocker];
  ui.render();
}

function bindEntity(ui, element, entity, action, selected, label) {
  element.dataset.combatEntity = entityKey(entity);
  if (!action) return;
  element.classList.add('ct-combat-pick');
  element.classList.toggle('ct-combat-selected', selected);
  element.setAttribute('aria-pressed', String(selected));
  element.onclick = event => { event.stopPropagation(); action(); };
  if (element.tagName !== 'BUTTON') ui.makeKeyboardButton(element, label);
  else element.setAttribute('aria-label', label);
  if (entity.iid != null) element.oncontextmenu = event => { event.preventDefault(); inspect(ui, entity); };
}

function combatTray(ui, game, root, pd) {
  const attackers = pd.q.attackers || [];
  if (!attackers.length) return;
  const center = root.querySelector('.center');
  const tray = node('section', 'ct-battle-line');
  tray.setAttribute('aria-label', 'Incoming attackers and block assignments');
  const copy = node('div', 'ct-battle-line-label');
  copy.append(node('b', '', pd.q.type === 'blockers' ? 'Incoming attack' : 'Attack declared'),
    node('small', '', `${attackers.length} creature${attackers.length === 1 ? '' : 's'}`));
  tray.append(copy);
  const cards = node('div', 'ct-battle-line-cards');
  const assignments = pd.q.type === 'blockers' ? ui.blockAssignments(pd) : [];
  for (const attacker of attackers) {
    const group = node('div', 'ct-battle-pair');
    const item = button('', () => {}, 'ct-battle-attacker');
    item.dataset.combatAttacker = String(attacker.iid);
    const face = node('span', 'ct-battle-art');
    face.innerHTML = globalThis.MTG.cardArtHTML(attacker);
    const blockers = assignments.filter(pair => pair.attacker === attacker).map(pair => pair.blocker);
    const text = node('span', 'ct-battle-copy');
    const keywords = ['flying', 'menace', 'trample', 'deathtouch', 'first strike', 'double strike'].filter(key => attacker.kw(key));
    text.append(node('b', '', attacker.name), node('strong', '', `${attacker.power}/${attacker.toughness}`),
      node('small', '', `→ ${attacker.attacking === ui.me ? 'You' : attacker.attacking?.name || 'You'}`));
    if (keywords.length) text.append(node('small', 'ct-combat-keywords', keywords.join(' · ')));
    item.append(face, text);
    bindEntity(ui, item, attacker, pd.q.type === 'blockers' ? () => chooseAttacker(ui, pd, attacker) : () => inspect(ui, attacker),
      pd.mode === attacker, `${attacker.name}, ${attacker.power}/${attacker.toughness}. ${pd.q.type === 'blockers' ? 'Choose creature to block.' : 'Inspect attacker.'}`);
    ui.registerArenaDropTarget(item, { kind: 'entity', value: attacker });
    group.append(item);
    if (pd.q.type === 'blockers') {
      const links = node('div', 'ct-battle-blocks');
      for (const blocker of blockers) links.append(button(`${blocker.name} ×`, () => ui.assignBlocker(blocker, attacker), 'ct-block-link'));
      if (!blockers.length) links.append(node('span', 'ct-unblocked', attacker.cur.unblockable ? 'Unblockable' : 'Unblocked'));
      group.append(links);
    }
    cards.append(group);
  }
  tray.append(cards);
  center.replaceChildren(tray);
}

export function renderBattlefieldCombat(ui, game, root) {
  const pd = ui.pending, active = combatDecision(pd) && pd.boardPeek;
  root.classList.toggle('ct-battlefield-combat', !!active);
  if (!active) { delete root.dataset.combatStep; return; }
  root.dataset.combatStep = pd.q.type;
  root.querySelector('.ct-combat-ledger')?.remove();
  const rail = root.querySelector('.ct-decision-rail');
  rail.classList.add('ct-combat-dock');
  const prompt = rail.querySelector('.promptbar');
  prompt.replaceChildren();
  prompt.className = 'promptbar ct-combat-prompt';
  const heading = node('div', 'ct-combat-instruction');
  const actions = node('div', 'btnrow ct-combat-actions');
  const details = button('Details', () => { pd.boardPeek = false; ui.render(); }, 'ct-quiet-action');
  details.dataset.testid = 'back-to-combat-overlay';
  actions.append(details);
  const clear = () => { pd.sel = []; pd.attackPending = []; pd.assigns.clear(); pd.blockPending = []; pd.mode = null; ui.render(); };
  let hint, title, confirm;

  if (pd.q.type === 'attackers') {
    title = 'Choose attackers';
    const waiting = pd.attackPending || [];
    hint = waiting.length ? `${waiting.length} selected · choose a defender`
      : pd.attackTarget ? `Attacking ${pd.attackTarget.name} · choose creatures`
        : 'Select creatures, then a defender';
    const offered = pd.q.attackTargets || [...(pd.q.opponents || []),
      ...game.bf().filter(card => card.is('Planeswalker') && card.ctrl !== ui.me)];
    const targets = offered.filter(target => pd.q.eligible.some(card => ui.arenaLegalAttackTargets(card, pd).includes(target)));
    const defenders = node('div', 'ct-defender-choices');
    defenders.setAttribute('aria-label', 'Choose defender');
    for (const target of targets) {
      const count = pd.sel.filter(entry => entry.target === target).length;
      const pick = button(`${target.name}${count ? ` · ${count}` : ''}`, () => chooseDefender(ui, pd, target), 'ct-defender-choice');
      pick.dataset.combatDefender = entityKey(target);
      pick.setAttribute('aria-pressed', String(pd.attackTarget === target));
      ui.registerArenaDropTarget(pick, { kind: 'entity', value: target });
      defenders.append(pick);
      const elements = target.iid != null ? root.querySelectorAll(`.mini[data-iid="${target.iid}"]`)
        : root.querySelectorAll(`.opprow[data-player-id="${target.idx}"] .opphead, .ct-seat[data-focus-player="${target.idx}"]`);
      for (const element of elements) bindEntity(ui, element, target, () => chooseDefender(ui, pd, target), pd.attackTarget === target, `Attack ${target.name}`);
    }
    heading.append(defenders);
    const all = button('All attack', () => {
      if (ui.pending !== pd) return;
      for (const card of pd.q.eligible) {
        if (pd.sel.some(entry => entry.card === card) || pd.attackPending.includes(card)) continue;
        const legal = ui.arenaLegalAttackTargets(card, pd);
        if (pd.attackTarget && legal.includes(pd.attackTarget)) pd.sel.push({ card, target: pd.attackTarget });
        else if (legal.length) pd.attackPending.push(card);
      }
      ui.render();
    }, 'ct-quiet-action');
    all.disabled = !pd.q.eligible.length;
    all.dataset.testid = 'combat-all-attack';
    actions.append(all);
    const missingForced = (pd.q.forced || []).filter(card => ui.arenaLegalAttackTargets(card, pd).length && !pd.sel.some(entry => entry.card === card));
    if (missingForced.length) hint = `${hint} · ${missingForced.length} must attack`;
    confirm = button(pd.sel.length ? `Attack (${pd.sel.length})` : 'No attacks', () => {
      if (ui.pending === pd) ui.resolvePending(pd.sel.map(entry => ({ card: entry.card, target: entry.target })));
    }, 'primary');
    confirm.disabled = !!missingForced.length || !!waiting.length;
    for (const card of pd.q.eligible) for (const element of root.querySelectorAll(`.mini[data-iid="${card.iid}"]`)) {
      const selected = pd.sel.some(entry => entry.card === card) || waiting.includes(card);
      bindEntity(ui, element, card, () => ui.toggleAttacker(card), selected, `${card.name}. ${selected ? 'Remove attacker' : 'Select attacker'}.`);
    }
  } else if (pd.q.type === 'blockers') {
    title = 'Choose blockers';
    const waiting = pd.blockPending || [];
    hint = waiting.length ? `${waiting.length} selected · choose an attacker`
      : pd.mode ? `Blocking ${pd.mode.name} · choose your creatures` : 'Select your creature, then an attacker';
    const blocks = ui.blockAssignments(pd);
    const legal = game.blockDeclarationLegal(pd.q.attackers, blocks);
    if (!legal) {
      const incomplete = pd.q.attackers.find(attacker => {
        const n = blocks.filter(pair => pair.attacker === attacker).length, bounds = game.blockerBounds(attacker);
        return n > 0 && (n < bounds.min || n > bounds.max);
      });
      hint = incomplete ? `${incomplete.name} needs ${game.blockerBounds(incomplete).min} blockers` : 'Check blocking restrictions in Details';
    }
    confirm = button(blocks.length ? `Block (${blocks.length})` : 'No blocks', () => {
      if (ui.pending === pd && game.blockDeclarationLegal(pd.q.attackers, ui.blockAssignments(pd))) ui.resolvePending(ui.blockAssignments(pd));
    }, 'primary');
    confirm.disabled = !legal || !!waiting.length;
    for (const card of pd.q.potential) for (const element of root.querySelectorAll(`.mini[data-iid="${card.iid}"]`)) {
      const selected = waiting.includes(card) || ui.blockTargets(card, pd).length > 0;
      bindEntity(ui, element, card, () => chooseBlocker(ui, pd, card), selected, `${card.name}. ${selected ? 'Change blocker' : 'Select blocker'}.`);
      element.classList.toggle('ct-block-pending', waiting.includes(card));
      element.classList.toggle('ct-block-unavailable', !!pd.mode && !game.canBlock(card, pd.mode) && !ui.blockTargets(card, pd).length);
    }
    for (const card of pd.q.attackers) for (const element of root.querySelectorAll(`.mini[data-iid="${card.iid}"]`))
      bindEntity(ui, element, card, () => chooseAttacker(ui, pd, card), pd.mode === card, `Block ${card.name}`);
    combatTray(ui, game, root, pd);
  } else {
    title = 'Attack declared';
    hint = 'Responses and blockers come next';
    confirm = button('Continue', () => { if (ui.pending === pd) ui.resolvePendingEntry(pd, null); }, 'primary');
    combatTray(ui, game, root, pd);
  }
  if (pd.q.type !== 'combatReview' && (pd.sel.length || pd.attackPending?.length || pd.assigns.size || pd.blockPending?.length)) {
    const reset = button('Clear', clear, 'ct-quiet-action');
    reset.dataset.testid = 'combat-clear'; actions.append(reset);
  }
  const copy = node('div', 'ct-combat-copy');
  copy.setAttribute('role', 'status');
  copy.append(node('b', '', title), node('span', '', hint));
  heading.prepend(copy);
  confirm.dataset.testid = 'confirm-combat-battlefield';
  actions.append(confirm);
  prompt.append(heading, actions);
}

// Draw after the stable arena DOM has been committed. Recompute on scroll and
// resize, and omit clipped endpoints rather than pointing at unrelated cards.
export function queueCombatConnections(ui) {
  if (connectionOwner !== ui) {
    connectionOwner?._combatLinesCleanup?.();
    cancelAnimationFrame(connectionOwner?._combatLinesFrame);
    connectionOwner = ui;
  }
  cancelAnimationFrame(ui._combatLinesFrame);
  ui._combatLinesFrame = requestAnimationFrame(() => drawConnections(ui));
  const root = document.querySelector('#game');
  if (ui._combatLinesRoot !== root) {
    ui._combatLinesCleanup?.();
    const refresh = () => queueCombatConnections(ui);
    root?.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', refresh);
    ui._combatLinesRoot = root;
    ui._combatLinesCleanup = () => { root?.removeEventListener('scroll', refresh, true); window.removeEventListener('resize', refresh); };
  }
}
function drawConnections(ui) {
  if (connectionOwner !== ui) return;
  const root = document.querySelector('#game');
  root?.querySelector('.ct-combat-lines')?.remove();
  const pd = ui.pending;
  if (!root || !combatDecision(pd) || !pd.boardPeek || ui.sheet || root.querySelector('.overlay')) return;
  const links = pd.q.type === 'attackers' ? pd.sel.map(entry => [entry.card, entry.target])
    : pd.q.type === 'blockers' ? ui.blockAssignments(pd).map(pair => [pair.blocker, pair.attacker]) : [];
  if (!links.length) return;
  const rect = root.getBoundingClientRect();
  const endpoint = (entity, target) => {
    const nodes = [...root.querySelectorAll(`[data-combat-entity="${entityKey(entity)}"]`)];
    if (target && pd.q.type === 'blockers') nodes.sort((a, b) => Number(b.hasAttribute('data-combat-attacker')) - Number(a.hasAttribute('data-combat-attacker')));
    for (const element of nodes) {
      const r = element.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      let clipped = false;
      for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.display === 'contents' || style.overflow === 'visible') continue;
        const box = parent.getBoundingClientRect();
        if (x < box.left || x > box.right || y < box.top || y > box.bottom) { clipped = true; break; }
      }
      if (!clipped) return { x: x - rect.left, y: (target ? r.bottom : r.top) - rect.top };
    }
    return null;
  };
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('ct-combat-lines');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  for (const [source, target] of links) {
    const a = endpoint(source, false), b = endpoint(target, true);
    if (!a || !b) continue;
    const path = document.createElementNS(ns, 'path');
    const middle = (a.y + b.y) / 2;
    path.setAttribute('d', `M ${a.x} ${a.y} C ${a.x} ${middle}, ${b.x} ${middle}, ${b.x} ${b.y}`);
    svg.append(path);
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', b.x); dot.setAttribute('cy', b.y); dot.setAttribute('r', '3'); svg.append(dot);
  }
  root.append(svg);
}
