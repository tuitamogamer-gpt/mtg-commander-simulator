import test from 'node:test';
import assert from 'node:assert/strict';
import {M, table, stable} from './helpers/second-audit-combat-fixtures.mjs';
import {aiIsolationFingerprint} from './helpers/run-ai-adversarial-games.mjs';

// Native first-turn casting followed by a real next-turn combat. Two paid
// ninjutsu activations share the stack, and Shadow copies the attacking Throne.
for (const [creatureType, realAI] of [['Ninja', false], ['Dragon', false], ['Ninja', true]]) {
  test(`interleaved Yuriko and Thousand-Faced Shadow ninjutsu completes with ${creatureType} Roaming Throne${realAI ? ' and native AI response evaluation' : ''}`, {timeout: 15_000}, async () => {
    const f = table(10112525);
    // The helper's event-log observer closes over its live game. AI probes
    // need native methods so cloned effects cannot reenter a test observer.
    f.g.emit = M.Game.prototype.emit;
    f.a.name = 'You';
    f.b.name = 'AI Wolf';
    const throne = f.put('Roaming Throne', 'hand');
    const outcast = f.put('Changeling Outcast', 'hand');
    const mockingbird = f.put('Mockingbird', 'hand');
    const yuriko = f.put("Yuriko, the Tiger's Shadow", 'command');
    const shadow = f.put('Thousand-Faced Shadow', 'hand');
    yuriko.commander = true;
    f.a.commanders.push(yuriko);
    f.lands([...Array(6).fill('Island'), 'Swamp', 'Swamp', ...Array(4).fill('Wastes')]);
    let announcedYuriko = false, announcedShadow = false, maxYurikoTriggers = 0, shadowTargetChoices = 0;
    let releaseTypeChoice, tokenChoiceHeld = false, responseEvaluated = false, aiDecisions = 0;
    let tokenChoiceReached;
    const tokenChoice = new Promise(resolve => { tokenChoiceReached = resolve; });
    const typeChoices = [], interleavings = [], enteringShadows = [];
    f.x = () => 0;
    f.option = (p, q) => {
      if (q.aiHint?.kind === 'chooseType') {
        assert.equal(p, f.a, 'the entering Throne controller chooses its creature type');
        assert.ok(q.options.some(row => row.key === creatureType));
        typeChoices.push({phase: f.g.phase, step: f.g.step, source: q.src?.name});
        if (!tokenChoiceHeld && f.g.phase === 'combat') {
          tokenChoiceHeld = true;
          const answer = new Promise(resolve => { releaseTypeChoice = resolve; });
          tokenChoiceReached({player: p, query: q});
          return answer;
        }
        return creatureType;
      }
      return undefined;
    };
    if (realAI) {
      const opt = f.put('Opt', 'hand', f.b);
      f.lands(['Island'], f.b);
      f.b.isAI = true;
      const scripted = f.b.controller;
      const nativeAI = new M.AIController(f.b, {difficulty: 'hard', style: 'balanced'});
      f.b.controller = {decide: async (game, q) => {
        if (q.type === 'priority' && game.stack.some(row => row.kind === 'trigger' && row.srcCard === shadow)) {
          if (!responseEvaluated) {
            responseEvaluated = true;
            const before = aiIsolationFingerprint(game);
            assert.ok(q.casts.some(row => row.card === opt));
            const simulation = await M.simulateAction(game, {kind: 'cast', card: opt, from: 'hand'}, {playerId: f.b.idx, seed: 10112526});
            assert.equal(simulation.applied, true);
            assert.equal(simulation.error, null);
            assert.equal(aiIsolationFingerprint(game), before, 'evaluating a response to the doubled Shadow ETB preserves the live game');
            assert.equal(yuriko.zone, 'command');
            assert.equal(shadow.zone, 'battlefield');
            assert.equal(simulation.state.byIid(yuriko.iid).zone, 'battlefield');
            stable({g: simulation.state}, 'AI response resolves the copied Throne entry choices in its own snapshot');
          }
          aiDecisions++;
          const action = await nativeAI.decide(game, q);
          assert.equal(nativeAI.lastV2Decision?.log.fallback, false, 'the native AI responds without falling back after an evaluation error');
          return action;
        }
        return scripted.decide(game, q);
      }};
    }
    f.cards = (p, q) => {
      if (q.source === mockingbird && q.prompt === 'Choose a permanent or card to copy as this enters') {
        assert.ok(q.from.includes(outcast));
        return [outcast];
      }
      if (q.aiHint?.kind === 'ninjutsuReturn') return [q.aiHint.card === yuriko ? mockingbird : outcast];
      if (q.aiHint?.kind === 'cleanupDiscard') return q.from.filter(card => card.is('Land')).slice(0, q.min);
      return undefined;
    };
    f.targets = (p, q) => {
      if (q.src?.name === 'Thousand-Faced Shadow' && q.candidates.includes(throne)) {
        shadowTargetChoices++;
        return [throne];
      }
      return undefined;
    };
    f.main = (p, q) => {
      if (p === f.a && f.a.turnsStarted === 1) {
        const card = [throne, outcast, mockingbird].find(card => card.zone === 'hand');
        if (card) {
          const row = q.casts.find(row => row.card === card);
          assert.ok(row, `${card.name} has a native payable casting action`);
          return {kind: 'cast', card, from: row.from, alt: row.alt};
        }
      }
      return {kind: 'done'};
    };
    f.attackers = (p, q) => p === f.a && f.a.turnsStarted === 2
      ? [throne, outcast, mockingbird].map(card => {
        assert.ok(q.eligible.includes(card));
        return {card, target: f.b};
      }) : [];
    f.priority = (p, q) => {
      maxYurikoTriggers = Math.max(maxYurikoTriggers, f.g.stack.filter(row => row.kind === 'trigger' && row.srcCard === yuriko).length);
      if (announcedShadow && shadow.zone === 'battlefield' && !enteringShadows.length) enteringShadows.push({
        tapped: shadow.tapped, attacking: shadow.attacking, step: f.g.step,
        pendingYuriko: f.g.stack.some(row => row.srcCard === yuriko && row.kind === 'ability'),
      });
      if (p !== f.a || f.g.step !== 'blockers' || !f.g.combat?.attackers.includes(throne)) return {kind: 'pass'};
      if (!announcedYuriko) {
        const row = q.acts.find(row => row.card === yuriko && row.ninjutsu);
        assert.ok(row);
        announcedYuriko = true;
        return {kind: 'activate', entry: row};
      }
      if (!announcedShadow && f.g.stack.some(row => row.srcCard === yuriko && row.kind === 'ability')) {
        assert.equal(yuriko.zone, 'command');
        assert.equal(mockingbird.zone, 'hand');
        assert.equal(mockingbird.name, 'Mockingbird');
        assert.equal(outcast.zone, 'battlefield');
        const row = q.acts.find(row => row.card === shadow && row.ninjutsu);
        assert.ok(row, 'Shadow can be activated while the earlier Yuriko ninjutsu is pending');
        interleavings.push(f.g.stack.map(row => row.name));
        announcedShadow = true;
        return {kind: 'activate', entry: row};
      }
      return {kind: 'pass'};
    };

    await f.g.runTurn();
    assert.equal(throne.zone, 'battlefield');
    assert.equal(throne.meta.cslType, creatureType);
    assert.equal(outcast.zone, 'battlefield');
    assert.equal(mockingbird.zone, 'battlefield');
    assert.equal(mockingbird.name, 'Changeling Outcast');
    assert.equal(mockingbird.kw('flying'), true);
    assert.equal(typeChoices.length, 1);
    stable(f, 'original Throne and Outcast copy cast');
    for (let n = 0; n < 3; n++) await f.g.runTurn();
    const secondTurn = f.g.runTurn();
    const paused = await Promise.race([tokenChoice, secondTurn.then(() => {
      throw new Error('The copied Roaming Throne must request its own creature type before completing entry.');
    })]);
    try {
      assert.equal(paused.player, f.a, 'the current pending action belongs to the human token controller');
      assert.equal(paused.query.type, 'chooseOption');
      assert.equal(paused.query.aiHint.kind, 'chooseType');
      assert.equal(yuriko.zone, 'command');
      assert.equal(shadow.zone, 'battlefield');
      assert.equal(outcast.zone, 'hand');
      assert.equal(mockingbird.zone, 'hand');
      assert.equal(f.g.battlefield.filter(card => card.ctrl === f.a && card.name === 'Roaming Throne').length, 2,
        'the first token is visible while waiting for its own as-enters choice');
      assert.equal(f.g.stack.length, creatureType === 'Ninja' ? 2 : 1,
        'the screenshot boundary retains Yuriko and the remaining doubled Shadow trigger');
      assert.equal(f.g.stack[0].srcCard, yuriko);
    } finally {
      releaseTypeChoice(creatureType);
    }
    await secondTurn;

    const expectedCopies = creatureType === 'Ninja' ? 2 : 1;
    const copies = f.g.creatures(f.a).filter(card => card.isToken && card.name === 'Roaming Throne');
    assert.equal(announcedYuriko, true);
    assert.equal(announcedShadow, true);
    assert.equal(responseEvaluated, realAI);
    assert.equal(aiDecisions > 0, realAI);
    assert.equal(interleavings.length, 1);
    assert.deepEqual(enteringShadows, [{tapped: true, attacking: f.b, step: 'blockers', pendingYuriko: true}],
      'Shadow and its ETB triggers resolve before the earlier Yuriko ability');
    assert.equal(shadowTargetChoices, expectedCopies);
    assert.equal(copies.length, expectedCopies, 'the original Ninja Throne doubles the Shadow entry trigger exactly once');
    assert.equal(typeChoices.length, expectedCopies + 1, 'each token Throne makes its own native as-enters creature-type choice');
    assert.ok(typeChoices.slice(1).every(row => row.phase === 'combat' && row.step === 'blockers'));
    for (const copy of copies) {
      assert.equal(copy.meta.cslType, creatureType);
      assert.equal(copy.tapped, true);
      assert.equal(copy.hasSub(creatureType), true);
    }
    assert.equal(yuriko.zone, 'battlefield');
    assert.equal(yuriko.tapped, true);
    assert.equal(shadow.zone, 'battlefield');
    assert.equal(shadow.tapped, true);
    assert.equal(mockingbird.zone, 'hand');
    assert.equal(mockingbird.name, 'Mockingbird');
    assert.equal(outcast.zone, 'hand');
    assert.equal(f.b.life, creatureType === 'Ninja' ? 26 : 30, 'all entrants actually deal combat damage; Forest reveals cost no life');
    assert.equal(maxYurikoTriggers, creatureType === 'Ninja' ? 20 : 2,
      'Ninja damage triggers once per hit plus one additional time for each live chosen-Ninja Throne');
    assert.equal(f.g.stack.length, 0, 'interleaved abilities and all copied/doubled triggers fully settle');
    assert.equal(f.g.pendingTriggers.length, 0);
    assert.equal(f.g.combat, null);
    assert.equal(f.g.gameOver, false);
    stable(f, 'completed interleaved ninjutsu and attacking Throne token copies');
  });
}
