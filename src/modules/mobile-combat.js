// Phone combat uses the same declaration drafts and confirmation callbacks as
// the battlefield, in a dedicated tab with touch-sized public card controls.
const node = (tag, cls, text) => {
  const item = document.createElement(tag);
  item.className = cls;
  if (text !== undefined) item.textContent = text;
  return item;
};
const button = (label, action, cls = '') => {
  const item = node('button', cls, label);
  item.type = 'button'; item.onclick = action;
  return item;
};
const inspect = (ui, card) => { ui.sheet = { card }; ui.render(); };
const keywords = card => ['flying', 'reach', 'menace', 'trample', 'deathtouch', 'first strike', 'double strike', 'lifelink']
  .filter(key => card.kw(key)).join(' · ');
const face = card => {
  const art = node('span', 'ct-mobile-combat-art');
  art.innerHTML = globalThis.MTG.cardArtHTML(card);
  return art;
};

// Reuse public card faces for both the editable draft and declared blocks.
// Inspection and removal are separate controls so looking at a card is safe.
function blockerCards(ui, attacker, blockers, pd = null) {
  const list = node('div', 'ct-mobile-combat-blockers');
  list.setAttribute('aria-label', `Blocking ${attacker.name}`);
  for (const blocker of blockers) {
    const row = node('article', 'ct-mobile-combat-unit ct-mobile-combat-blocker');
    row.dataset.blockerId = String(blocker.iid);
    const card = button('', () => inspect(ui, blocker), 'ct-mobile-combat-card');
    card.setAttribute('aria-label', `Inspect ${blocker.name}, blocking ${attacker.name}`);
    const copy = node('span', 'ct-mobile-combat-unit-copy');
    copy.append(node('b', '', blocker.name), node('strong', '', `${blocker.power}/${blocker.toughness}`));
    const abilities = keywords(blocker);
    if (abilities) copy.append(node('small', '', abilities));
    card.append(face(blocker), copy);
    row.append(card);
    if (pd) {
      const remove = button('×', () => {
        if (ui.pending === pd) ui.assignBlocker(blocker, attacker);
      }, 'ct-block-link ct-mobile-combat-remove');
      remove.setAttribute('aria-label', `Remove ${blocker.name} from blocking ${attacker.name}`);
      row.append(remove);
    }
    list.append(row);
  }
  return list;
}

export function createMobileCombat(ui, game, root, pd) {
  const pane = node('section', 'ct-mobile-combat');
  pane.setAttribute('aria-label', 'Combat');
  const head = node('header', 'ct-mobile-combat-head');
  const title = pd?.q.type === 'attackers' ? 'Declare attackers' : pd?.q.type === 'blockers' ? 'Assign blockers'
    : pd ? 'Review attack' : game.phase === 'combat' ? 'Combat in progress' : 'Combat';
  head.append(node('h2', '', title));
  const targets = node('div', 'ct-mobile-combat-targets');
  pane.append(head, targets);
  const roster = node('div', 'ct-mobile-combat-roster');
  roster.tabIndex = 0;
  roster.setAttribute('role', 'region');
  roster.setAttribute('aria-label', pd?.q.type === 'blockers' ? 'Your blockers' : 'Your attackers');
  const cards = pd?.q.type === 'attackers' ? pd.q.eligible.filter(card => card.zone === 'battlefield')
    : pd?.q.type === 'blockers' ? pd.q.potential : [];
  const blocks = pd?.q.type === 'blockers' ? ui.blockAssignments(pd) : [];
  if (pd?.q.type === 'blockers') {
    const assigned = new Set(blocks.map(pair => pair.blocker)).size;
    roster.append(node('h3', 'ct-mobile-combat-roster-title', `Your blockers · ${assigned}/${cards.length} assigned`));
  }
  for (const card of cards) {
    const row = node('article', 'ct-mobile-combat-unit');
    const pick = button('', () => {}, 'ct-mobile-combat-card');
    pick.dataset.iid = String(card.iid);
    const copy = node('span', 'ct-mobile-combat-unit-copy');
    copy.append(node('b', '', card.name), node('strong', '', `${card.power}/${card.toughness}`));
    const abilities = keywords(card);
    if (abilities) copy.append(node('small', '', abilities));
    const assigned = pd.q.type === 'attackers' ? pd.sel.find(entry => entry.card === card)?.target : null;
    const blocked = blocks.filter(pair => pair.blocker === card).map(pair => pair.attacker.name);
    const waiting = (pd.attackPending || []).includes(card) || (pd.blockPending || []).includes(card);
    const unavailable = pd.q.type === 'attackers' ? pd.attackTarget && !ui.arenaLegalAttackTargets(card, pd).includes(pd.attackTarget)
      : pd.mode && !game.canBlock(card, pd.mode);
    pick.disabled = !!unavailable && !assigned && !blocked.length && !waiting;
    const state = assigned ? `→ ${assigned.name}` : blocked.length ? `Blocks ${blocked.join(', ')}`
      : waiting ? 'Selected · choose a target' : unavailable ? `Cannot ${pd.q.type === 'attackers' ? `attack ${pd.attackTarget.name}` : `block ${pd.mode.name}`}`
        : pd.q.type === 'attackers' && pd.attackTarget ? `Tap to attack ${pd.attackTarget.name}`
        : pd.q.type === 'blockers' && pd.mode ? `Tap to block ${pd.mode.name}` : 'Tap to select';
    copy.append(node('span', 'ct-mobile-combat-assignment', state));
    if ((pd.q.forced || []).includes(card)) copy.append(node('small', 'ct-mobile-combat-required', 'Must attack if able'));
    pick.append(face(card), copy);
    const details = button('Inspect', () => inspect(ui, card), 'ct-mobile-combat-inspect');
    details.setAttribute('aria-label', `Inspect ${card.name}`);
    row.append(pick, details);
    roster.append(row);
  }
  if (pd && pd.q.type !== 'combatReview') {
    if (!cards.length) roster.append(node('p', 'ct-mobile-combat-empty', pd.q.type === 'attackers' ? 'No creatures can attack.' : 'No creatures can block.'));
    pane.append(roster);
  }
  if (!pd) {
    const history = node('div', 'ct-mobile-combat-history');
    const attackers = game.phase === 'combat' ? (game.combat?.attackers || []).filter(card => card.zone === 'battlefield' && card.attacking) : [];
    if (!attackers.length) {
      history.append(node('p', 'ct-mobile-combat-empty', game.phase === 'combat'
        ? 'Waiting for attackers. Combat choices will open here when it is your turn to decide.'
        : 'Your attacks, blocks and combat assignments appear here during combat.'));
    }
    for (const attacker of attackers) {
      const group = node('article', 'ct-mobile-combat-matchup');
      group.dataset.attackerId = String(attacker.iid);
      const card = button('', () => inspect(ui, attacker), 'ct-mobile-combat-card');
      card.setAttribute('aria-label', `Inspect ${attacker.name}`);
      const copy = node('span', 'ct-mobile-combat-unit-copy');
      const blockers = (attacker.blockedBy || []).filter(blocker => blocker.zone === 'battlefield');
      const afterBlocks = ['firstStrike', 'damage', 'endCombat'].includes(game.step)
        || game.step === 'blockers' && (ui.pending?.q.type === 'priority' || ui.react?.q.type === 'priority');
      copy.append(node('b', '', attacker.name), node('strong', '', `${attacker.power}/${attacker.toughness}`),
        node('span', 'ct-mobile-combat-assignment', `→ ${attacker.attacking === ui.me ? 'You' : attacker.attacking.name}`),
        node('small', 'ct-mobile-combat-block-status', blockers.length ? `Blocked by ${blockers.length} creature${blockers.length === 1 ? '' : 's'}`
          : attacker.wasBlocked ? 'Blocked · blocker left combat' : afterBlocks ? 'Unblocked' : 'Awaiting blocks'));
      card.append(face(attacker), copy);
      group.append(card);
      if (blockers.length) group.append(blockerCards(ui, attacker, blockers));
      history.append(group);
    }
    const actions = node('div', 'ct-mobile-combat-links');
    actions.append(button('View battlefield', () => ui.showMobileView('mine'), 'pbtn'),
      button('View hand', () => ui.showMobileView('hand'), 'pbtn'));
    history.append(actions);
    pane.append(history);
  }
  root.append(pane);
  return pane;
}

export function finishMobileCombat(ui, root, pd, pane, heading, actions, prompt) {
  const targets = pane.querySelector('.ct-mobile-combat-targets');
  const defenders = heading.querySelector('.ct-defender-choices');
  if (defenders) targets.append(defenders);
  const incoming = root.querySelector('.ct-battle-line');
  if (incoming) {
    if (pd.q.type === 'blockers') [...incoming.querySelectorAll('.ct-battle-pair')].forEach((pair, index) => {
      const attacker = pd.q.attackers[index];
      const row = node('div', 'ct-mobile-combat-incoming');
      const pick = pair.querySelector('.ct-battle-attacker');
      pick.before(row);
      const details = button('Inspect', () => inspect(ui, attacker), 'ct-mobile-combat-inspect');
      details.setAttribute('aria-label', `Inspect ${attacker.name}`);
      row.append(pick, details);
      const assigned = ui.blockAssignments(pd).filter(block => block.attacker === attacker).map(block => block.blocker);
      pick.querySelector('.ct-battle-copy').append(node('small', 'ct-mobile-combat-pick-hint',
        pd.mode === attacker ? 'Selected · choose blockers below' : 'Tap to assign blockers'));
      const blocks = blockerCards(ui, attacker, assigned, pd);
      blocks.classList.add('ct-battle-blocks');
      if (!assigned.length) blocks.append(node('span', 'ct-unblocked', attacker.cur.unblockable ? 'Unblockable' : 'No blockers assigned'));
      pair.querySelector('.ct-battle-blocks').replaceWith(blocks);
    });
    targets.append(incoming);
  }
  pane.querySelector('.ct-mobile-combat-head').append(heading);
  if (ui.mobileView === 'combat') prompt.replaceChildren(actions);
  else {
    const copy = node('span', 'ct-mobile-combat-return', pd.q.type === 'attackers' ? 'Assign your attackers in Combat'
      : pd.q.type === 'blockers' ? 'Assign your blockers in Combat' : 'Review the attack in Combat');
    const back = button('Open Combat', () => ui.showMobileView('combat'), 'pbtn primary');
    back.dataset.testid = 'open-mobile-combat';
    prompt.replaceChildren(copy, back);
  }
}
