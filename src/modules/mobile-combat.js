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
const keywords = card => ['flying', 'reach', 'menace', 'trample', 'deathtouch', 'first strike', 'double strike', 'lifelink', 'vigilance', 'indestructible', 'infect', 'wither']
  .filter(key => card.kw(key)).join(' · ');
const defenderText = (ui, target) => target?.iid != null
  ? `${target.name} · ${target.counters.loyalty || 0} loyalty · ${target.ctrl.name}, ${target.ctrl.life} life`
  : `${target === ui.me ? 'You' : target?.name || 'Defender'} · ${target?.life ?? '—'} life`;
function cardDetails(ui, card, copy, showTapped = false) {
  const abilities = keywords(card);
  if (abilities) copy.append(node('small', 'ct-mobile-combat-keywords', abilities));
  const state = [showTapped ? card.tapped ? 'Tapped' : 'Untapped' : '', card.cur.unblockable ? "Can't be blocked" : '',
    card.cur.cantBlock ? "Can't block" : ''].filter(Boolean);
  if (state.length) copy.append(node('small', 'ct-mobile-combat-card-state', state.join(' · ')));
  const damage = ui.markedDamageState(card);
  if (damage) {
    const marked = node('small', 'ct-mobile-combat-damage', `${damage.amount} damage marked`);
    marked.title = damage.detail;
    copy.append(marked);
  }
}
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
    cardDetails(ui, blocker, copy);
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

// Public creatures only. Untapped is a board fact, not a promise that a
// creature can block every attacker (or that all blocks are legal together).
function defendingCreatures(ui, game, pd) {
  const section = node('section', 'ct-mobile-combat-defense');
  section.setAttribute('aria-label', 'Defending creatures');
  section.append(node('h3', '', 'Defending creatures'));
  const offered = pd.q.attackTargets || pd.q.opponents || [];
  const players = [...new Set(offered.map(target => target.iid != null ? target.ctrl : target))];
  const focused = pd.attackTarget || pd.sel.at(-1)?.target;
  const focusedPlayer = focused?.iid != null ? focused.ctrl : focused;
  pd.mobileDefenseOpen ||= {};
  for (const player of players) {
    const creatures = game.creatures(player);
    const group = node('details', 'ct-mobile-combat-defense-player');
    group.dataset.defensePlayer = String(player.idx);
    group.open = pd.mobileDefenseOpen[player.idx] ?? (player === focusedPlayer);
    group.ontoggle = () => {
      if (group.isConnected && ui.pending === pd) pd.mobileDefenseOpen[player.idx] = group.open;
    };
    const summary = node('summary', '');
    summary.append(node('b', '', defenderText(ui, player)),
      node('span', '', `${creatures.filter(card => !card.tapped).length}/${creatures.length} untapped creatures`));
    group.append(summary);
    const list = node('div', 'ct-mobile-combat-defense-cards');
    for (const creature of [...creatures].sort((a, b) => Number(a.tapped) - Number(b.tapped))) {
      const card = button('', () => inspect(ui, creature), 'ct-mobile-combat-card ct-mobile-combat-defense-card');
      card.dataset.defenseCard = String(creature.iid);
      const copy = node('span', 'ct-mobile-combat-unit-copy');
      copy.append(node('b', '', creature.faceDown ? 'Face-down creature' : creature.name), node('strong', '', `${creature.power}/${creature.toughness}`));
      cardDetails(ui, creature, copy, true);
      card.setAttribute('aria-label', `Inspect ${[...copy.children].map(item => item.textContent).join(', ')}`);
      card.append(face(creature), copy);
      list.append(card);
    }
    if (!creatures.length) list.append(node('p', '', 'No creatures on the battlefield.'));
    group.append(list);
    section.append(group);
  }
  return section;
}

export function createMobileCombat(ui, game, root, pd) {
  const pane = node('section', 'ct-mobile-combat');
  pane.setAttribute('aria-label', 'Combat');
  const head = node('header', 'ct-mobile-combat-head');
  const title = pd?.q.type === 'attackers' ? 'Declare attackers' : pd?.q.type === 'blockers' ? 'Assign blockers'
    : pd ? 'Review attack' : game.phase === 'combat' ? 'Combat in progress' : 'Combat';
  head.append(node('h2', '', title));
  head.append(node('span', 'ct-mobile-combat-life', `You · ${ui.me.life} life`));
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
    cardDetails(ui, card, copy);
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
        node('span', 'ct-mobile-combat-assignment', `→ ${defenderText(ui, attacker.attacking)}`),
        node('small', 'ct-mobile-combat-block-status', blockers.length ? `Blocked by ${blockers.length} creature${blockers.length === 1 ? '' : 's'}`
          : attacker.wasBlocked ? 'Blocked · blocker left combat' : afterBlocks ? 'Unblocked' : 'Awaiting blocks'));
      cardDetails(ui, attacker, copy);
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
  if (defenders) targets.append(defenders, defendingCreatures(ui, ui.game, pd));
  const incoming = root.querySelector('.ct-battle-line');
  if (incoming) {
    [...incoming.querySelectorAll('.ct-battle-pair')].forEach((pair, index) => {
      const attacker = pd.q.attackers[index];
      const copy = pair.querySelector('.ct-battle-copy');
      copy.querySelector('small').textContent = `→ ${defenderText(ui, attacker.attacking)}`;
      copy.querySelector('.ct-combat-keywords')?.remove();
      cardDetails(ui, attacker, copy);
    });
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
