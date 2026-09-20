// A shared combat workspace. Declaration buttons keep their original engine
// callbacks; this module only arranges public cards and decision controls.
const node = (tag, cls, text) => {
  const element = document.createElement(tag);
  element.className = cls;
  if (text !== undefined) element.textContent = text;
  return element;
};
const button = (cls, text, action) => {
  const element = node('button', cls, text);
  element.type = 'button';
  element.onclick = action;
  return element;
};
const steps = active => {
  const list = node('ol', 'ct-combat-steps');
  list.setAttribute('aria-label', 'Combat progress');
  ['Attack', 'Review', 'Block', 'Damage'].forEach((label, index) => {
    const item = node('li', index === active ? 'current' : index < active ? 'done' : '');
    item.append(node('span', '', index < active ? '✓' : String(index + 1)), node('b', '', label));
    if (index === active) item.setAttribute('aria-current', 'step');
    list.append(item);
  });
  return list;
};
const cardFace = card => {
  const face = node('span', 'ct-combat-card-art');
  face.innerHTML = globalThis.MTG.cardArtHTML(card);
  return face;
};
const inspect = (ui, card) => button('ct-combat-inspect', 'Inspect', () => {
  ui.sheet = { card }; ui.render();
});
const panel = (title, help, content, roster = false) => {
  const section = node('section', 'ct-combat-panel' + (roster ? ' ct-combat-roster' : ''));
  const head = node('header', 'ct-combat-panel-head');
  head.append(node('h3', '', title), node('p', '', help));
  section.append(head, content);
  content.classList.add('ct-combat-scroll', roster ? 'attackpool' : 'attackalloclanes');
  content.tabIndex = 0;
  content.setAttribute('role', 'region');
  content.setAttribute('aria-label', title);
  return section;
};

function workspace(modal, kind, title, subtitle, active, stats, content, footer) {
  modal.classList.add('ct-combat-workspace', `ct-combat-${kind}`);
  modal.parentElement.classList.add('ct-combat-overlay');
  const head = node('header', 'ct-combat-head');
  const copy = node('div', 'ct-combat-heading');
  copy.append(node('small', '', 'COMBAT'), node('h2', '', title), node('p', '', subtitle));
  head.append(copy);
  if (stats) { stats.classList.add('ct-combat-stats'); head.append(stats); }
  const body = node('div', 'ct-combat-body');
  body.append(...content);
  footer.classList.add('ct-combat-footer');
  footer.querySelectorAll('button').forEach(control => {
    control.type = 'button';
    if (control.dataset.testid === 'show-combat-battlefield') control.textContent = 'Show battlefield';
  });
  modal.replaceChildren(head, steps(active), body, footer);
}

function attackers(ui, modal) {
  const pd = ui.pending;
  const lanes = modal.querySelector('.attackalloclanes');
  for (const target of lanes.querySelectorAll('.attackalloclane')) {
    const route = node('article', 'ct-combat-route' + (target.classList.contains('focused') ? ' selected' : ''));
    target.before(route);
    const stack = target.querySelector('.attacklaneassigned');
    route.append(target, stack);
    target.setAttribute('aria-pressed', String(target.classList.contains('focused')));
    target.querySelector('.attacklaneicon')?.remove();
    const empty = stack.querySelector('.attackdropempty');
    if (empty) empty.textContent = 'Choose creatures, then this defender';
    for (const chip of stack.querySelectorAll('.attackassignedchip')) {
      const remove = button(chip.className, undefined, chip.onclick);
      remove.title = chip.title;
      remove.setAttribute('aria-label', chip.title);
      remove.append(...chip.childNodes);
      chip.replaceWith(remove);
    }
    // The full lane remains a drop target, including its assigned cards.
    route.ondragover = target.ondragover;
    route.ondragleave = target.ondragleave;
    route.ondrop = target.ondrop;
    target.ondragover = target.ondragleave = target.ondrop = null;
  }
  const pool = modal.querySelector('.attackpool');
  for (const control of pool.querySelectorAll('.attackpoolcard')) {
    const card = pd.q.eligible.find(candidate => String(candidate.iid) === control.dataset.attacker);
    const cell = node('article', 'ct-combat-choice');
    control.before(cell);
    control.setAttribute('aria-pressed', String(control.classList.contains('assigned')));
    control.querySelector('i')?.replaceChildren(document.createTextNode(
      pd.sel.find(entry => entry.card === card)?.target.name || 'Choose a defender'));
    cell.append(control);
    if (card) cell.append(inspect(ui, card));
  }
  if (!pool.children.length) pool.append(node('p', 'ct-combat-empty', 'No creatures can attack.'));
  const stats = modal.querySelector('.attackallocscore');
  const footer = modal.querySelector('.attackallocfoot');
  workspace(modal, 'attack', 'Declare your attack', 'Choose creatures and their defender. You can attack more than one player.', 0, stats, [
    panel('Defenders', pd.attackPending.length ? 'Choose where the selected creatures will attack.' : 'Select a defender or drag creatures into its lane.', lanes),
    panel('Your creatures', pd.attackTarget ? `Assigning to ${pd.attackTarget.name}` : 'Select one or more creatures to begin.', pool, true),
  ], footer);
}

function blockers(ui, game, modal) {
  const pd = ui.pending;
  const assignments = ui.blockAssignments(pd);
  const lanes = node('div', 'ct-combat-block-lanes');
  const oldLanes = [...modal.querySelectorAll('.blocklane')];
  pd.q.attackers.forEach((attacker, index) => {
    const old = oldLanes[index];
    const mine = assignments.filter(pair => pair.attacker === attacker).map(pair => pair.blocker);
    const route = node('article', 'ct-combat-route ct-combat-duel' + (pd.mode === attacker ? ' selected' : ''));
    const target = node('div', 'ct-combat-route-label', `Attacking ${attacker.attacking === ui.me ? 'you' : attacker.attacking?.name || 'you'}`);
    const select = button('ct-combat-attacker', undefined, () => { pd.mode = attacker; ui.render(); });
    select.setAttribute('aria-pressed', String(pd.mode === attacker));
    select.setAttribute('aria-label', `Choose blockers for ${attacker.name}`);
    const copy = node('span', 'ct-combat-unit-copy');
    copy.append(node('b', '', attacker.name), node('strong', '', `${attacker.power}/${attacker.toughness}`));
    const detail = old.querySelector('.blocklaneinfo > span');
    if (detail) copy.append(node('small', '', detail.textContent.replace(/^\S+\s*(·\s*)?/, '')));
    select.append(cardFace(attacker), copy);
    const defending = node('div', 'ct-combat-blockers');
    for (const blocker of mine) {
      const remove = button('ct-combat-blocker', undefined, () => ui.assignBlocker(blocker, attacker));
      remove.setAttribute('aria-label', `Remove ${blocker.name} from blocking ${attacker.name}`);
      const label = node('span', 'ct-combat-unit-copy');
      label.append(node('b', '', blocker.name), node('small', '', `${blocker.power}/${blocker.toughness}`));
      remove.append(cardFace(blocker), label, node('i', '', '×'));
      defending.append(remove);
    }
    if (!mine.length) defending.append(node('span', 'ct-combat-open', attacker.cur.unblockable ? 'Cannot be blocked' : 'No blockers assigned'));
    const link = node('span', 'ct-combat-link', mine.length ? 'BLOCKED' : 'UNBLOCKED');
    link.setAttribute('aria-hidden', 'true');
    const outcome = old.querySelector('.blockoutcome');
    outcome.prepend(node('small', 'ct-combat-preview-label', 'Preview'));
    route.append(target, select, link, defending, outcome, inspect(ui, attacker));
    lanes.append(route);
  });
  const pool = modal.querySelector('.blockcandidates');
  [...pool.querySelectorAll('.blockcand')].forEach((control, index) => {
    const card = pd.q.potential[index];
    control.type = 'button';
    control.setAttribute('aria-pressed', String(ui.blockTargets(card, pd).includes(pd.mode)));
    if (control.classList.contains('cant')) control.title = 'Cannot block the selected attacker';
    const choice = node('article', 'ct-combat-choice');
    control.before(choice);
    choice.append(control, inspect(ui, card));
  });
  const stats = modal.querySelector('.blockdmg');
  // Existing combat estimates do not model every replacement/response.
  // Present them as a preview, never as a guaranteed result.
  stats.firstChild.textContent = 'Damage preview: ';
  const body = [
    panel('Incoming attack', 'Select an attacker, then choose its blockers on the right.', lanes),
    panel('Your blockers', pd.mode ? `Blocking ${pd.mode.name}` : 'Choose an attacker first.', pool, true),
  ];
  const footer = node('footer', 'ct-combat-block-foot');
  const notices = node('div', 'ct-combat-notices');
  notices.append(...modal.querySelectorAll('.blockmenacewarn'));
  if (!notices.children.length) notices.append(node('p', '', 'Click an assigned blocker to remove it. Responses may change the damage preview.'));
  footer.append(notices, modal.querySelector('.blockfoot'));
  workspace(modal, 'block', 'Set your defense', 'Match your creatures to the incoming attackers.', 2, stats, body, footer);
}

function review(ui, modal) {
  const pd = ui.pending;
  const attacker = pd.q.attackingPlayer || pd.q.attackers[0]?.ctrl;
  const lanes = modal.querySelector('.combatreviewlanes');
  for (const lane of lanes.querySelectorAll('.combatreviewlane')) {
    lane.classList.add('ct-combat-route');
    const target = lane.querySelector('.combatreviewtarget');
    target.querySelector('.combatestimate span').textContent = 'attack power';
    const label = node('span', 'ct-combat-review-arrow', 'ATTACKING');
    lane.append(label, target);
    for (const card of lane.querySelectorAll('.combatreviewcard')) {
      card.type = 'button';
      card.title = `Inspect ${card.querySelector('b').textContent}`;
    }
  }
  const footer = node('footer', 'ct-combat-review-foot');
  footer.append(modal.querySelector('.combatreviewnote'), modal.querySelector('.combatreviewactions'));
  workspace(modal, 'review', attacker === ui.me ? 'Your attack is declared' : `${attacker?.name || 'Opponent'} attacks`,
    'Review the attack. Responses and blocker selection come next.', 1, null,
    [panel('Attack routes', 'Each group attacks the defender shown on the right. Select a card to inspect it.', lanes)], footer);
}

function combatLedger(ui, game, root) {
  const old = root.querySelector('.center .combatmap');
  const rail = root.querySelector('.ct-decision-content');
  if (!old || !rail || window.matchMedia('(max-width: 900px)').matches) return;
  const summary = node('section', 'ct-combat-ledger');
  const active = game.step === 'damage' || game.step === 'firstStrike' || game.step === 'endCombat' ? 3
    : game.step === 'blockers' ? 2 : 1;
  summary.append(node('h3', '', 'Combat'), steps(active));
  const groups = new Map();
  for (const attacker of game.combat.attackers) {
    if (!attacker.attacking || attacker.zone !== 'battlefield') continue;
    if (!groups.has(attacker.attacking)) groups.set(attacker.attacking, []);
    groups.get(attacker.attacking).push(attacker);
  }
  for (const [target, attackers] of groups) {
    const lane = node('div', 'ct-combat-ledger-lane');
    lane.append(node('b', 'ct-combat-ledger-target', `→ ${target === ui.me ? 'You' : target.name}`));
    for (const attacker of attackers) {
      const row = button('ct-combat-ledger-card', undefined, () => { ui.sheet = { card: attacker }; ui.render(); });
      const copy = node('span', 'ct-combat-unit-copy');
      copy.append(node('b', '', attacker.name), node('small', '', `${attacker.power}/${attacker.toughness}`));
      const draftBlocks = ui.pending?.q.type === 'blockers';
      const blockers = (draftBlocks
        ? ui.blockAssignments(ui.pending).filter(pair => pair.attacker === attacker).map(pair => pair.blocker)
        : attacker.blockedBy || []).filter(card => card.zone === 'battlefield');
      copy.append(node('small', 'ct-combat-ledger-block', blockers.length
        ? `Blocked by ${blockers.map(card => card.name).join(', ')}`
        : attacker.wasBlocked ? 'Blocked · blocker left combat' : active >= 2 && !draftBlocks ? 'Unblocked' : 'Awaiting blocks'));
      row.append(cardFace(attacker), copy);
      ui.registerArenaDropTarget?.(row, { kind: 'entity', value: attacker });
      lane.append(row);
    }
    summary.append(lane);
  }
  old.remove();
  rail.prepend(summary);
}

export function renderCombatTable(ui, game, root) {
  combatLedger(ui, game, root);
  // Inspecting a card temporarily replaces the workspace; closing the sheet
  // rebuilds it from the same pending declaration and retains every selection.
  if (ui.sheet || ui.playerSheet || ui.zoneBrowse) {
    root.querySelectorAll('.attackallocmodal, .blockmodal, .combatreviewmodal')
      .forEach(modal => modal.parentElement.remove());
    return;
  }
  const attack = root.querySelector('.attackallocmodal');
  const block = root.querySelector('.blockmodal');
  const recap = root.querySelector('.combatreviewmodal');
  if (attack) attackers(ui, attack);
  if (block) blockers(ui, game, block);
  if (recap) review(ui, recap);
}
