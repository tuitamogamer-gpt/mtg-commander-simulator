// ===== diplomacy.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG;
  const G = MTG.Game.prototype;
  const UNLOCK_ROUNDS = 3;
  const PROTECTION_TYPES = new Set(['no_attack', 'no_target_player', 'protect_permanent', 'let_resolve']);
  const COMBAT_TYPES = new Set(['no_attack', 'pressure_player']);
  const TURN_TYPES = new Set(['no_target_player', 'protect_permanent']);

  const REASONS = {
    disabled: 'Diplomacy & Politics is disabled for this game.',
    locked: 'Diplomacy unlocks after every active player completes turn 3.',
    headsup: 'Diplomacy ends when only two players remain.',
    activePair: 'These players already have an active agreement.',
    shield: 'A player can benefit from only one combat-immunity agreement at a time.',
    leader: 'The leading threat cannot buy protection from the table.',
    pressure: 'A third player may be pressured only when they are the objective runaway threat.',
    rate: 'You have used both proposals for this table round.',
    pairRate: 'You may make only one proposal to the same bot per table round.',
    unchanged: 'That bot already rejected this offer and the public board has not meaningfully changed.',
    pending: 'The table already has an unanswered bot proposal.',
    empty: 'A promise must have a visible, meaningful effect on the current game.',
    conflict: 'That promise conflicts with another active agreement.',
    invalid: 'That agreement is no longer legal or measurable.',
    oneSided: 'The exchange is too one-sided.',
    unsafe: 'The deal would help the leading threat too much.',
  };

  function state(game) {
    return game && game.diplomacy && game.diplomacy.enabled ? game.diplomacy : null;
  }

  function player(game, id) {
    return game.players.find(candidate => candidate.idx === Number(id)) || null;
  }

  function defenderOf(target) {
    return target instanceof U.Player ? target : target && target.ctrl;
  }

  function activePlayers(game) {
    return game.players.filter(candidate => !candidate.lost);
  }

  function completedRounds(game) {
    const alive = activePlayers(game);
    if (!alive.length) return 0;
    return Math.min(...alive.map(candidate => candidate.turnsStarted || 0));
  }

  function status(game) {
    const d = state(game);
    if (!d) return { enabled: false, unlocked: false, reason: REASONS.disabled, rounds: 0, unlockRounds: UNLOCK_ROUNDS };
    const alive = activePlayers(game);
    const rounds = completedRounds(game);
    if (alive.length <= 2) return { enabled: true, unlocked: false, reason: REASONS.headsup, rounds, unlockRounds: UNLOCK_ROUNDS };
    if (rounds < UNLOCK_ROUNDS) return { enabled: true, unlocked: false, reason: REASONS.locked, rounds, unlockRounds: UNLOCK_ROUNDS };
    return { enabled: true, unlocked: true, reason: '', rounds, unlockRounds: UNLOCK_ROUNDS };
  }

  function threatRows(game) {
    return (U.threatTable ? U.threatTable(game) : activePlayers(game).map(candidate => ({ p: candidate, score: candidate.life })))
      .filter(row => row.p && !row.p.lost);
  }

  function runawayThreat(game) {
    const rows = threatRows(game);
    if (rows.length < 3) return null;
    const first = rows[0], second = rows[1];
    const gap = first.score - second.score;
    return gap >= Math.max(15, Math.max(1, second.score) * 0.2) ? first : null;
  }

  function publicPermanentValue(game, card) {
    if (!card || card.zone !== 'battlefield') return 0;
    let value = 1 + (card.commander ? 5 : 0) + (card.is('Planeswalker') ? 5 : 0);
    if (card.is('Creature')) value += Math.max(0, card.power || 0) * 0.8 + Math.max(0, card.toughness || 0) * 0.25;
    const oracle = String(card.def && card.def.oracle || '').toLowerCase();
    if (/whenever|at the beginning/.test(oracle)) value += 2;
    if (/draw|create .*token|search your library/.test(oracle)) value += 1.5;
    if (card.def && card.def.mana) value += 0.6;
    return value;
  }

  function visibleAttackPower(game, actor, beneficiary) {
    return game.creatures(actor).filter(card => !card.tapped && game.canAttackAtAll(card))
      .reduce((sum, card) => {
        const canReach = !beneficiary || game.canAttackTarget(card, beneficiary);
        return sum + (canReach ? Math.max(0, game.dmgAmount(card, 'normal')) : 0);
      }, 0);
  }

  function boardSignature(game) {
    return JSON.stringify({
      alive: activePlayers(game).map(candidate => [candidate.idx, candidate.life, candidate.lost]),
      battlefield: game.bf().map(card => [card.iid, card.name, card.ctrl && card.ctrl.idx, card.tapped,
        card.is('Creature') ? card.power : null, card.is('Creature') ? card.toughness : null,
        Object.entries(card.counters || {}).filter(([, amount]) => amount > 0).sort()]).sort((a, b) => a[0] - b[0]),
      stack: game.stack.map(item => [item.kind, item.name, item.ctrl && item.ctrl.idx]),
    });
  }

  function pairKey(a, b) {
    return [a.idx, b.idx].sort((x, y) => x - y).join(':');
  }

  function roundKey(game, from) {
    return `${completedRounds(game)}:${from.idx}`;
  }

  function stackKey(game, item) {
    const d = state(game);
    if (!item || !d) return '';
    if (!item._diplomacyId) item._diplomacyId = `stack-${d.nextStackId++}`;
    return item._diplomacyId;
  }

  function stackByKey(game, key) {
    return game.stack.find(item => stackKey(game, item) === key) || null;
  }

  function clauseTargetName(game, clause) {
    if (clause.type === 'protect_permanent') return game.byIid(clause.targetCardId)?.name || clause.targetName || 'the named permanent';
    if (clause.type === 'let_resolve') return stackByKey(game, clause.stackId)?.name || clause.targetName || 'the named stack object';
    if (clause.type === 'pressure_player') return player(game, clause.targetPlayerId)?.name || 'the leading threat';
    return player(game, clause.beneficiaryId)?.name || 'that player';
  }

  function clauseLabel(game, clause) {
    const actor = player(game, clause.actorId);
    const beneficiary = player(game, clause.beneficiaryId);
    const actorName = actor ? actor.name : 'A player';
    const beneficiaryName = beneficiary ? beneficiary.name : 'the other player';
    if (clause.type === 'no_attack') return `${actorName} will not voluntarily attack ${beneficiaryName} during their next combat.`;
    if (clause.type === 'no_target_player') return `${actorName} will not choose ${beneficiaryName} or their permanents as harmful targets through their next turn.`;
    if (clause.type === 'protect_permanent') return `${actorName} will not choose ${clauseTargetName(game, clause)} as a harmful target through their next turn.`;
    if (clause.type === 'let_resolve') return `${actorName} will not counter or harmfully target ${clauseTargetName(game, clause)} on the stack.`;
    if (clause.type === 'pressure_player') return `${actorName} will attack ${clauseTargetName(game, clause)} with at least one creature during their next combat, if able.`;
    return `${actorName} made a short-term commitment to ${beneficiaryName}.`;
  }

  function optionLabel(game, actor, beneficiary, type, target) {
    if (type === 'no_attack') return `Do not attack ${beneficiary.name} during your next combat`;
    if (type === 'no_target_player') return `Do not harmfully target ${beneficiary.name} or their permanents through your next turn`;
    if (type === 'protect_permanent') return `Do not harmfully target ${target.name} through your next turn`;
    if (type === 'let_resolve') return `Let ${target.name} resolve`;
    if (type === 'pressure_player') return `Attack ${target.name} during your next combat, if able`;
    return 'Short-term promise';
  }

  function clauseOptions(game, actor, beneficiary) {
    const d = state(game);
    if (!d || !actor || !beneficiary || actor === beneficiary || actor.lost || beneficiary.lost) return [];
    const out = [];
    if (visibleAttackPower(game, actor, beneficiary) > 0) {
      out.push({ key: `no_attack:${beneficiary.idx}`, type: 'no_attack', label: optionLabel(game, actor, beneficiary, 'no_attack') });
    }
    out.push({ key: `no_target_player:${beneficiary.idx}`, type: 'no_target_player', label: optionLabel(game, actor, beneficiary, 'no_target_player') });
    game.bf().filter(card => card.ctrl === beneficiary && !card.is('Land'))
      .sort((a, b) => publicPermanentValue(game, b) - publicPermanentValue(game, a) || a.iid - b.iid)
      .slice(0, 5)
      .forEach(card => out.push({
        key: `protect_permanent:${card.iid}`, type: 'protect_permanent', targetCardId: card.iid,
        label: optionLabel(game, actor, beneficiary, 'protect_permanent', card),
      }));
    game.stack.filter(item => item.ctrl === beneficiary).slice().reverse().forEach(item => out.push({
      key: `let_resolve:${stackKey(game, item)}`, type: 'let_resolve', stackId: stackKey(game, item),
      label: optionLabel(game, actor, beneficiary, 'let_resolve', item),
    }));
    const runaway = runawayThreat(game);
    if (runaway && runaway.p !== actor && runaway.p !== beneficiary && visibleAttackPower(game, actor, runaway.p) > 0) {
      out.push({
        key: `pressure_player:${runaway.p.idx}`, type: 'pressure_player', targetPlayerId: runaway.p.idx,
        label: optionLabel(game, actor, beneficiary, 'pressure_player', runaway.p),
      });
    }
    return out;
  }

  function clauseFromKey(game, actor, beneficiary, key) {
    return clauseOptions(game, actor, beneficiary).find(option => option.key === key)
      ? buildClause(game, actor, beneficiary, key) : null;
  }

  function buildClause(game, actor, beneficiary, key) {
    const split = String(key || '').indexOf(':');
    if (split < 1) return null;
    const type = key.slice(0, split), raw = key.slice(split + 1);
    const clause = { type, actorId: actor.idx, beneficiaryId: beneficiary.idx, state: 'proposed' };
    if (type === 'no_attack' || type === 'no_target_player') {
      if (Number(raw) !== beneficiary.idx) return null;
    } else if (type === 'protect_permanent') {
      const card = game.byIid(Number(raw));
      if (!card || card.zone !== 'battlefield' || card.ctrl !== beneficiary) return null;
      clause.targetCardId = card.iid; clause.targetName = card.name; clause.targetControllerId = beneficiary.idx;
    } else if (type === 'let_resolve') {
      const item = stackByKey(game, raw);
      if (!item || item.ctrl !== beneficiary) return null;
      clause.stackId = raw; clause.targetName = item.name;
    } else if (type === 'pressure_player') {
      const target = player(game, Number(raw));
      if (!target || target === actor || target === beneficiary || target.lost) return null;
      clause.targetPlayerId = target.idx;
    } else return null;
    return clause;
  }

  function activeContracts(game) {
    const d = state(game);
    return d ? d.contracts.filter(contract => contract.status === 'active') : [];
  }

  function activeClauses(game, predicate) {
    return activeContracts(game).flatMap(contract => contract.clauses.map(clause => ({ contract, clause })))
      .filter(entry => entry.clause.state === 'active' && (!predicate || predicate(entry.clause, entry.contract)));
  }

  function hasPairContract(game, a, b) {
    const key = pairKey(a, b);
    return activeContracts(game).some(contract => contract.pairKey === key);
  }

  function promiseConflict(game, clause) {
    return activeClauses(game).some(({ clause: current }) => {
      if (current.actorId !== clause.actorId) return false;
      if (current.type === 'no_attack' && clause.type === 'pressure_player' && current.beneficiaryId === clause.targetPlayerId) return true;
      if (current.type === 'pressure_player' && clause.type === 'no_attack' && current.targetPlayerId === clause.beneficiaryId) return true;
      return false;
    });
  }

  function validateProposal(game, proposal, opts = {}) {
    const d = state(game), st = status(game);
    if (!d) return { ok: false, reason: REASONS.disabled };
    if (!st.unlocked) return { ok: false, reason: st.reason };
    const from = player(game, proposal.fromId), to = player(game, proposal.toId);
    if (!from || !to || from === to || from.lost || to.lost) return { ok: false, reason: REASONS.invalid };
    if (hasPairContract(game, from, to)) return { ok: false, reason: REASONS.activePair };
    const request = proposal.request, offer = proposal.offer;
    if (!request || !offer || request.actorId !== to.idx || request.beneficiaryId !== from.idx ||
      offer.actorId !== from.idx || offer.beneficiaryId !== to.idx) return { ok: false, reason: REASONS.invalid };
    for (const clause of [request, offer]) {
      if (promiseConflict(game, clause)) return { ok: false, reason: REASONS.conflict };
      if (clause.type === 'no_attack' && visibleAttackPower(game, player(game, clause.actorId), player(game, clause.beneficiaryId)) <= 0)
        return { ok: false, reason: REASONS.empty };
      if (clause.type === 'protect_permanent') {
        const card = game.byIid(clause.targetCardId);
        if (!card || card.zone !== 'battlefield' || card.ctrl.idx !== clause.targetControllerId) return { ok: false, reason: REASONS.invalid };
      }
      if (clause.type === 'let_resolve' && !stackByKey(game, clause.stackId)) return { ok: false, reason: REASONS.invalid };
      if (clause.type === 'pressure_player') {
        const runaway = runawayThreat(game);
        if (!runaway || runaway.p.idx !== clause.targetPlayerId) return { ok: false, reason: REASONS.pressure };
      }
      if (PROTECTION_TYPES.has(clause.type)) {
        const runaway = runawayThreat(game);
        if (runaway && runaway.p.idx === clause.beneficiaryId) return { ok: false, reason: REASONS.leader };
      }
    }
    for (const clause of [request, offer]) {
      if (clause.type !== 'no_attack') continue;
      const alreadyShielded = activeClauses(game, current => current.type === 'no_attack' && current.beneficiaryId === clause.beneficiaryId).length;
      if (alreadyShielded) return { ok: false, reason: REASONS.shield };
    }
    if (!opts.botInitiated && !from.isAI) {
      const key = roundKey(game, from);
      if ((d.proposalCounts[key] || 0) >= 2) return { ok: false, reason: REASONS.rate };
      const pairRound = `${key}:${to.idx}`;
      if (d.pairProposalCounts[pairRound]) return { ok: false, reason: REASONS.pairRate };
      const rejected = d.rejectedPairs[pairKey(from, to)];
      if (rejected && rejected === boardSignature(game)) return { ok: false, reason: REASONS.unchanged };
    }
    if (opts.pendingHuman && d.proposals.some(item => item.status === 'pending-human')) return { ok: false, reason: REASONS.pending };
    return { ok: true, reason: '' };
  }

  function expectedAttackValue(game, actor, target) {
    const power = visibleAttackPower(game, actor, target);
    const blockers = game.creatures(target).filter(card => !card.tapped && !card.cur.cantBlock).length;
    return Math.max(0, power * (blockers ? 0.12 : 0.32));
  }

  function targetInteractionValue(game, actor, beneficiary) {
    const publicTargets = game.bf().filter(card => card.ctrl === beneficiary && !card.is('Land'))
      .reduce((best, card) => Math.max(best, publicPermanentValue(game, card)), 0);
    const ownKnownInteraction = actor.isAI
      ? actor.hand.filter(card => /destroy target|exile target|counter target|deals? .* damage to target|return target .* hand/i.test(card.def.oracle || '')).length
      : 0;
    return Math.min(7, publicTargets * 0.18 + ownKnownInteraction * 0.7 + 0.8);
  }

  function clauseDelta(game, clause, perspective) {
    const actor = player(game, clause.actorId), beneficiary = player(game, clause.beneficiaryId);
    if (!actor || !beneficiary) return -20;
    let benefit = 0, cost = 0;
    if (clause.type === 'no_attack') {
      const value = expectedAttackValue(game, actor, beneficiary) + 1;
      if (perspective === beneficiary) benefit += value;
      if (perspective === actor) cost += value * 0.8;
    } else if (clause.type === 'no_target_player') {
      const value = targetInteractionValue(game, actor, beneficiary);
      if (perspective === beneficiary) benefit += value;
      if (perspective === actor) cost += value * 0.75;
    } else if (clause.type === 'protect_permanent') {
      const card = game.byIid(clause.targetCardId);
      const value = Math.max(1, publicPermanentValue(game, card) * 0.38);
      if (perspective === beneficiary) benefit += value;
      if (perspective === actor) cost += value * 0.6;
    } else if (clause.type === 'let_resolve') {
      const item = stackByKey(game, clause.stackId);
      const value = Math.max(2, item && item.card ? U.mv(item.card.def.cost || '') + (item.card.commander ? 2 : 0) : 3);
      if (perspective === beneficiary) benefit += value;
      if (perspective === actor) cost += value * 0.7;
    } else if (clause.type === 'pressure_player') {
      const target = player(game, clause.targetPlayerId);
      const runaway = runawayThreat(game);
      const value = runaway && target === runaway.p ? Math.min(8, 3 + (runaway.score - threatRows(game)[1].score) * 0.15) : 0;
      if (perspective === beneficiary) benefit += value;
      if (perspective === actor) cost += Math.max(0.4, 2.2 - value * 0.3);
    }
    return benefit - cost;
  }

  function rapportValue(game, a, b) {
    const d = state(game);
    return d && d.rapport[`${a.idx}:${b.idx}`] || 0;
  }

  function evaluateProposal(game, proposal, bot) {
    const net = clauseDelta(game, proposal.request, bot) + clauseDelta(game, proposal.offer, bot) +
      Math.min(1.2, rapportValue(game, bot, player(game, proposal.fromId)) * 0.35);
    const runaway = runawayThreat(game);
    const benefitsLeader = runaway && [proposal.request, proposal.offer].some(clause =>
      clause.beneficiaryId === runaway.p.idx && PROTECTION_TYPES.has(clause.type));
    if (benefitsLeader) return { status: 'rejected', reason: REASONS.unsafe, net };
    if (net >= 0.15) return { status: 'accepted', reason: 'The exchange is short, measurable, and mutually useful.', net };
    if (net >= -3.5) return { status: 'countered', reason: 'The bot wants a more balanced reciprocal promise.', net };
    return { status: 'rejected', reason: REASONS.oneSided, net };
  }

  function bumpRapport(game, a, b, amount) {
    const d = state(game);
    if (!d) return;
    const key = `${a.idx}:${b.idx}`;
    d.rapport[key] = Math.max(-2, Math.min(2, (d.rapport[key] || 0) + amount));
  }

  function finishContract(game, contract) {
    if (!contract || contract.status !== 'active' || contract.clauses.some(clause => clause.state === 'active')) return;
    contract.status = contract.clauses.some(clause => clause.state === 'void') ? 'completed-with-exception' : 'completed';
    contract.completedTurn = game.turnNo;
    const a = player(game, contract.fromId), b = player(game, contract.toId);
    if (a && b && contract.status === 'completed') {
      bumpRapport(game, a, b, 1); bumpRapport(game, b, a, 1);
    }
    game.lg(`🤝 Agreement #${contract.id} completed${contract.status === 'completed' ? '.' : ' with a forced exception.'}`, 'diplomacy');
    game.note('diplomacy', { text: `Agreement #${contract.id} completed.`, contract });
  }

  function setClauseState(game, contract, clause, nextState, reason) {
    if (!clause || clause.state !== 'active') return;
    clause.state = nextState;
    clause.completedTurn = game.turnNo;
    clause.completionReason = reason || '';
    if (nextState === 'void') game.lg(`⚖️ Agreement exception: ${clauseLabel(game, clause)} (${reason || 'no longer possible'})`, 'diplomacy');
    finishContract(game, contract);
  }

  function activateProposal(game, proposal) {
    const d = state(game);
    const contract = {
      id: d.nextContractId++, fromId: proposal.fromId, toId: proposal.toId,
      pairKey: pairKey(player(game, proposal.fromId), player(game, proposal.toId)),
      createdTurn: game.turnNo, createdRound: completedRounds(game), status: 'active',
      clauses: [proposal.request, proposal.offer].map(clause => Object.assign({}, clause, {
        state: 'active', createdActorTurns: player(game, clause.actorId).turnsStarted,
      })),
    };
    d.contracts.push(contract);
    proposal.status = 'accepted'; proposal.contractId = contract.id;
    game.lg(`🤝 Agreement #${contract.id}: ${contract.clauses.map(clause => clauseLabel(game, clause)).join(' ')}`, 'diplomacy');
    game.note('diplomacy', { text: `Agreement #${contract.id} is active.`, contract });
    return contract;
  }

  function makeProposal(game, from, to, request, offer, source) {
    const d = state(game);
    return {
      id: d.nextProposalId++, fromId: from.idx, toId: to.idx, request, offer,
      source: source || 'human', status: 'created', createdTurn: game.turnNo,
      createdRound: completedRounds(game),
    };
  }

  function recordHumanAttempt(game, from, to) {
    const d = state(game), key = roundKey(game, from), pairRound = `${key}:${to.idx}`;
    d.proposalCounts[key] = (d.proposalCounts[key] || 0) + 1;
    d.pairProposalCounts[pairRound] = (d.pairProposalCounts[pairRound] || 0) + 1;
  }

  function reciprocalCounter(game, original, bot, human) {
    const botPromise = Object.assign({}, original.request, { state: 'proposed' });
    let humanKey = `no_attack:${bot.idx}`;
    let humanPromise = clauseFromKey(game, human, bot, humanKey);
    if (!humanPromise) {
      humanKey = `no_target_player:${bot.idx}`;
      humanPromise = clauseFromKey(game, human, bot, humanKey);
    }
    if (!humanPromise) return null;
    const counter = makeProposal(game, bot, human, humanPromise, botPromise, 'bot-counter');
    counter.status = 'pending-human';
    counter.reason = 'Counteroffer: the bot asks for a reciprocal short promise.';
    return counter;
  }

  function closeAllForHeadsUp(game) {
    for (const contract of activeContracts(game)) {
      for (const clause of contract.clauses) setClauseState(game, contract, clause, 'void', 'only two players remain');
    }
    const d = state(game);
    if (d) for (const proposal of d.proposals) if (proposal.status === 'pending-human') proposal.status = 'expired';
  }

  function refresh(game) {
    const d = state(game);
    if (!d) return;
    if (activePlayers(game).length <= 2) { closeAllForHeadsUp(game); return; }
    for (const { contract, clause } of activeClauses(game)) {
      const actor = player(game, clause.actorId), beneficiary = player(game, clause.beneficiaryId);
      if (!actor || !beneficiary || actor.lost || beneficiary.lost) {
        setClauseState(game, contract, clause, 'void', 'a party left the game');
        continue;
      }
      if (clause.type === 'protect_permanent') {
        const card = game.byIid(clause.targetCardId);
        if (!card || card.zone !== 'battlefield' || card.ctrl.idx !== clause.targetControllerId)
          setClauseState(game, contract, clause, 'void', 'the named permanent left or changed controller');
      } else if (clause.type === 'let_resolve' && !stackByKey(game, clause.stackId)) {
        setClauseState(game, contract, clause, 'fulfilled', 'the stack object left the stack');
      }
    }
  }

  function targetOwner(target) {
    if (target instanceof U.Player) return target;
    if (target && target.ctrl) return target.ctrl;
    return null;
  }

  function likelyHostile(spec, src, ctrl, target) {
    if (!target || targetOwner(target) === ctrl) return false;
    if (spec && spec.diplomacyHostile === false) return false;
    if (spec && spec.diplomacyHostile === true) return true;
    const hint = String(spec && spec.aiHint && (spec.aiHint.goal || spec.aiHint.kind) || '');
    const prompt = String(spec && spec.prompt || '');
    const oracle = String(src && src.def && src.def.oracle || '');
    const text = `${hint} ${prompt} ${oracle}`.toLowerCase();
    if (/destroy|exile|damage|counter target|return target .* hand|tap target|goad|loses? life|sacrifice|discard|remove .* counter|can't attack|can't block|doesn't untap|fight/.test(text)) return true;
    if (/gain life|draw|put .*\+1\/\+1|indestructible|hexproof|protection|untap target|attach|equip|copy target .* you control/.test(text)) return false;
    return true;
  }

  function targetBlockingEntries(game, ctrl, target, src, spec) {
    if (!state(game) || !ctrl || !target || !likelyHostile(spec, src, ctrl, target)) return [];
    const owner = targetOwner(target);
    return activeClauses(game, clause => {
      if (clause.actorId !== ctrl.idx) return false;
      if (clause.type === 'no_target_player') return owner && owner.idx === clause.beneficiaryId;
      if (clause.type === 'protect_permanent') return target && target.iid === clause.targetCardId;
      if (clause.type === 'let_resolve') return target && !(target instanceof U.Player) && !target.zone && stackKey(game, target) === clause.stackId;
      return false;
    });
  }

  function relation(game, viewer, other) {
    const active = hasPairContract(game, viewer, other);
    if (active) return { key: 'active', label: 'Agreement active' };
    const grudge = (viewer.grudges || {})[other.idx] || 0;
    if (grudge >= 2) return { key: 'wary', label: 'Wary' };
    const rapport = rapportValue(game, viewer, other);
    if (rapport >= 2) return { key: 'reliable', label: 'Reliable' };
    return { key: 'neutral', label: 'Neutral' };
  }

  U.initDiplomacy = function (game, enabled) {
    game.diplomacy = {
      enabled: !!enabled, unlockAfterRounds: UNLOCK_ROUNDS,
      contracts: [], proposals: [], history: [], rapport: {},
      proposalCounts: {}, pairProposalCounts: {}, rejectedPairs: {},
      botOfferRound: -1, nextProposalId: 1, nextContractId: 1, nextStackId: 1,
    };
    return game.diplomacy;
  };

  U.DIPLOMACY_UNLOCK_ROUNDS = UNLOCK_ROUNDS;
  U.diplomacyClauseLabel = clauseLabel;
  U.evaluateDiplomacyProposal = evaluateProposal;

  G.diplomacyStatus = function () { refresh(this); return status(this); };
  G.diplomacyClauseOptions = function (actor, beneficiary) { refresh(this); return clauseOptions(this, actor, beneficiary); };
  G.diplomacyRunawayThreat = function () { return runawayThreat(this); };
  G.diplomacyStackKey = function (item) { return stackKey(this, item); };

  G.proposeDiplomacy = function (from, to, requestKey, offerKey) {
    refresh(this);
    const request = clauseFromKey(this, to, from, requestKey);
    const offer = clauseFromKey(this, from, to, offerKey);
    if (!request || !offer) return { status: 'rejected', reason: REASONS.invalid };
    const proposal = makeProposal(this, from, to, request, offer, from.isAI ? 'bot' : 'human');
    const check = validateProposal(this, proposal);
    if (!check.ok) return { status: 'rejected', reason: check.reason };
    if (!from.isAI) recordHumanAttempt(this, from, to);
    state(this).proposals.push(proposal);
    if (!to.isAI) {
      proposal.status = 'pending-human';
      this.lg(`🕊️ ${from.name} sent ${to.name} a diplomacy proposal.`, 'diplomacy');
      this.note('diplomacy', { text: `${from.name} sent you a diplomacy proposal.`, proposal });
      return { status: proposal.status, proposal };
    }
    const verdict = evaluateProposal(this, proposal, to);
    proposal.reason = verdict.reason;
    if (verdict.status === 'accepted') return { status: 'accepted', proposal, contract: activateProposal(this, proposal), reason: verdict.reason };
    if (verdict.status === 'countered' && !from.isAI) {
      proposal.status = 'countered';
      const counter = reciprocalCounter(this, proposal, to, from);
      if (counter) {
        state(this).proposals.push(counter);
        this.lg(`🕊️ ${to.name} made ${from.name} a counteroffer.`, 'diplomacy');
        this.note('diplomacy', { text: `${to.name} made a counteroffer.`, proposal: counter });
        return { status: 'countered', proposal: counter, reason: counter.reason };
      }
    }
    proposal.status = 'rejected';
    state(this).rejectedPairs[pairKey(from, to)] = boardSignature(this);
    state(this).history.push({ turn: this.turnNo, kind: 'rejected', fromId: from.idx, toId: to.idx, reason: verdict.reason });
    return { status: 'rejected', proposal, reason: verdict.reason };
  };

  G.respondToDiplomacyProposal = function (proposalId, accept, responder) {
    refresh(this);
    const d = state(this);
    const proposal = d && d.proposals.find(item => item.id === Number(proposalId) && item.status === 'pending-human');
    if (!proposal || proposal.toId !== responder.idx) return { status: 'rejected', reason: REASONS.invalid };
    if (!accept) {
      proposal.status = 'declined';
      d.history.push({ turn: this.turnNo, kind: 'declined', fromId: proposal.fromId, toId: proposal.toId });
      this.lg(`🕊️ ${responder.name} declined the diplomacy proposal.`, 'diplomacy');
      return { status: 'declined', proposal };
    }
    const check = validateProposal(this, proposal, { botInitiated: true });
    if (!check.ok) { proposal.status = 'expired'; return { status: 'rejected', reason: check.reason, proposal }; }
    return { status: 'accepted', proposal, contract: activateProposal(this, proposal) };
  };

  G.diplomacyRefresh = function () { refresh(this); };

  G.diplomacyAttackBlocked = function (actor, target) {
    refresh(this);
    const defender = defenderOf(target);
    if (!actor || !defender) return false;
    return activeClauses(this, clause => clause.type === 'no_attack' && clause.actorId === actor.idx && clause.beneficiaryId === defender.idx).length > 0;
  };

  G.diplomacyAttackTargetsFor = function (card, targets, forced) {
    const raw = (targets || []).filter(target => this.canAttackTarget(card, target));
    const allowed = raw.filter(target => !this.diplomacyAttackBlocked(card.ctrl, target));
    return allowed.length || !forced ? allowed : raw;
  };

  G.diplomacyRequiredAttackTarget = function (actor) {
    refresh(this);
    const entry = activeClauses(this, clause => clause.type === 'pressure_player' && clause.actorId === actor.idx)[0];
    return entry ? player(this, entry.clause.targetPlayerId) : null;
  };

  G.diplomacyVoidAttackPromise = function (actor, target, reason) {
    const defender = defenderOf(target);
    for (const { contract, clause } of activeClauses(this, current => current.actorId === actor.idx &&
      ((current.type === 'no_attack' && defender && current.beneficiaryId === defender.idx) ||
       (current.type === 'pressure_player' && current.targetPlayerId === (target && target.idx))))) {
      setClauseState(this, contract, clause, 'void', reason || 'a Magic requirement made the promise impossible');
    }
  };

  G.diplomacyAfterCombat = function (actor) {
    refresh(this);
    for (const { contract, clause } of activeClauses(this, current => current.actorId === actor.idx && COMBAT_TYPES.has(current.type)))
      setClauseState(this, contract, clause, 'fulfilled', 'the promised combat ended');
  };

  G.diplomacyEndTurn = function (actor) {
    refresh(this);
    // A promise made during the actor's current turn lasts through their next
    // complete turn; one made outside it also ends only after their next turn.
    // `createdActorTurns` prevents cleanup on the creation turn from shortening
    // "through your next turn" to only a few remaining phases.
    for (const { contract, clause } of activeClauses(this, current => current.actorId === actor.idx &&
      TURN_TYPES.has(current.type) && actor.turnsStarted > current.createdActorTurns))
      setClauseState(this, contract, clause, 'fulfilled', 'the promised turn ended');
    refresh(this);
  };

  G.diplomacyFilterTargets = function (candidates, spec, src, ctrl, opts = {}) {
    refresh(this);
    if (!state(this) || !status(this).unlocked || opts.allowForced) return candidates;
    return candidates.filter(target => !targetBlockingEntries(this, ctrl, target, src, spec).length);
  };

  G.diplomacyHandleForcedTarget = function (ctrl, target, src, spec) {
    for (const { contract, clause } of targetBlockingEntries(this, ctrl, target, src, spec))
      setClauseState(this, contract, clause, 'void', 'a mandatory Magic target made the promise impossible');
  };

  G.diplomacyView = function (viewer) {
    refresh(this);
    const d = state(this), st = status(this);
    if (!d) return { status: st, activeContracts: [], incoming: [], opponents: [], recent: [], offersRemaining: 0 };
    const key = roundKey(this, viewer);
    return {
      status: st,
      activeContracts: activeContracts(this).map(contract => ({
        id: contract.id, status: contract.status, fromId: contract.fromId, toId: contract.toId,
        clauses: contract.clauses.map(clause => ({ state: clause.state, label: clauseLabel(this, clause) })),
      })),
      incoming: d.proposals.filter(proposal => proposal.status === 'pending-human' && proposal.toId === viewer.idx).map(proposal => ({
        id: proposal.id, fromId: proposal.fromId, fromName: player(this, proposal.fromId)?.name || 'Bot',
        request: clauseLabel(this, proposal.request), offer: clauseLabel(this, proposal.offer), reason: proposal.reason || '',
      })),
      opponents: viewer.opponents(this).map(other => ({ id: other.idx, name: other.name, relation: relation(this, viewer, other) })),
      recent: d.history.slice(-5),
      offersRemaining: Math.max(0, 2 - (d.proposalCounts[key] || 0)),
    };
  };

  G.processDiplomacyCheckpoint = function (active) {
    refresh(this);
    const d = state(this), st = status(this);
    if (!d || !st.unlocked || d.botOfferRound === st.rounds || d.proposals.some(proposal => proposal.status === 'pending-human')) return null;
    const runaway = runawayThreat(this);
    if (!runaway) return null;
    const bots = activePlayers(this).filter(candidate => candidate.isAI && candidate !== runaway.p)
      .sort((a, b) => a.idx - b.idx);
    if (!bots.length) return null;
    const from = bots.includes(active) ? active : bots[0];
    const recipients = bots.filter(candidate => candidate !== from && !hasPairContract(this, from, candidate));
    const human = activePlayers(this).find(candidate => !candidate.isAI && candidate !== runaway.p && candidate !== from);
    const to = recipients[0] || (human && !hasPairContract(this, from, human) ? human : null);
    if (!to) return null;
    const request = clauseFromKey(this, to, from, `pressure_player:${runaway.p.idx}`);
    const offerOptions = clauseOptions(this, from, to);
    const offer = clauseFromKey(this, from, to,
      (offerOptions.find(option => option.type === 'no_attack') || offerOptions.find(option => option.type === 'no_target_player') || {}).key);
    if (!request || !offer) return null;
    const proposal = makeProposal(this, from, to, request, offer, 'bot');
    const check = validateProposal(this, proposal, { botInitiated: true, pendingHuman: !to.isAI });
    if (!check.ok) return null;
    d.botOfferRound = st.rounds;
    d.proposals.push(proposal);
    if (!to.isAI) {
      proposal.status = 'pending-human';
      proposal.reason = `${from.name} wants short-term help against the objective leading threat.`;
      this.lg(`🕊️ ${from.name} sent ${to.name} a diplomacy proposal.`, 'diplomacy');
      this.note('diplomacy', { text: `${from.name} sent you a diplomacy proposal.`, proposal });
      return { status: proposal.status, proposal };
    }
    const verdict = evaluateProposal(this, proposal, to);
    proposal.reason = verdict.reason;
    if (verdict.status === 'accepted') return { status: 'accepted', proposal, contract: activateProposal(this, proposal) };
    proposal.status = 'rejected';
    d.history.push({ turn: this.turnNo, kind: 'bot-rejected', fromId: from.idx, toId: to.idx, reason: verdict.reason });
    return { status: 'rejected', proposal, reason: verdict.reason };
  };
})();
