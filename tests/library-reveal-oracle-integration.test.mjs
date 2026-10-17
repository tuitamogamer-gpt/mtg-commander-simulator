import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
function setup() {
  const game = new M.Game({seed: 73021, paced: true});
  game.pace = async () => {};
  const questions = [];
  const controller = {decide: async (g, q) => {
    questions.push(q);
    f.inspect?.(q);
    if (q.type === 'chooseCards') return [];
    if (q.type === 'chooseOption') return q.options.find(o => o.key === 'no')?.key || q.options[0]?.key;
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'orderTriggers') return q.triggers;
    return null;
  }};
  const a = game.addPlayer('You', {name: 'You'}, controller, false);
  const b = game.addPlayer('Raven', {name: 'Raven'}, controller, true);
  game.turnPlayer = a; game.turnNo = 7; game.phase = 'main1';
  const put = (name, player = a, zone = 'library') => {
    const c = new M.CardInst(M.DEFS[name], player); c.zone = zone;
    (zone === 'battlefield' ? game.battlefield : player[zone]).push(c);
    game.recalc(); return c;
  };
  const source = put('Thran Dynamo', a, 'battlefield');
  const f = {game, a, b, put, source, questions,
    effect(run, src = source) {
      game.stack.push({kind: 'ability', name: src.name, ctrl: a, srcCard: src, targets: [],
        ctx: {g: game, you: a, src, sourceZoneVersion: src.zoneVersion, targets: []}, run});
      return game.resolveTop();
    },
    shown() { return questions.filter(q => q.libraryReveal && q.revealStage === 'card').map(q => q.card); },
  };
  return f;
}

test('Etali Conqueror reveals all players lands and hits before any free-cast selection', async () => {
  const f = setup();
  const ownHit = f.put('Sol Ring'), ownLand = f.put('Forest');
  const otherHit = f.put('Arcane Signet', f.b), otherLand = f.put('Island', f.b);
  const etali = f.put('Etali, Primal Conqueror // Etali, Primal Sickness', f.a, 'battlefield');
  const expected = [ownLand, ownHit, otherLand, otherHit];
  f.inspect = q => {
    if (q.type === 'chooseCards' && q.prompt?.startsWith('You may cast')) {
      assert.deepEqual(f.shown(), expected);
      assert.ok(expected.every(c => c.zone === 'exile'));
    }
    if (q.libraryReveal) {
      assert.equal(q.ctrl, f.a);
      assert.equal(q.libraryOwner, q.card?.owner || f.a);
      if (q.revealStage === 'start') assert.equal(f.a.library.length + f.b.library.length, 4);
    }
  };
  await f.effect(etali.def.triggers.find(t => t.on === 'etb').run, etali);
  assert.deepEqual(f.shown(), expected);
  assert.equal(f.questions.filter(q => q.libraryReveal && q.revealStage === 'start').length, 1);
  assert.equal(f.questions.filter(q => q.type === 'chooseCards').length, 1);
});

for (const kind of ['discover', 'discoverTreasure']) {
  test(`${kind}: every land appears before the hit, hand placement and Treasure effects`, async () => {
    const f = setup(), hit = f.put('Sol Ring'), land = f.put('Forest');
    f.inspect = q => {
      if (!q.libraryReveal) return;
      assert.equal(f.a.hand.length, 0);
      assert.equal(f.game.bf().filter(c => c.isToken).length, 0);
      if (q.revealStage === 'start') assert.equal(f.a.library.at(-1), land);
    };
    await f.effect(ctx => kind === 'discover' ? M.WLM.discover(ctx, 2) : M.FDC.discoverTreasure(ctx));
    assert.deepEqual(f.shown(), [land, hit]);
    assert.equal(hit.zone, 'hand');
    assert.equal(land.zone, 'library');
    assert.equal(f.a.library[0], land);
    const treasure = f.game.bf().filter(c => c.isToken && c.hasSub('Treasure'));
    assert.equal(treasure.length, kind === 'discoverTreasure' ? 9 : 0);
    assert.ok(treasure.every(c => c.tapped));
  });
}

for (const helper of ['CDK', 'C21', 'generic']) {
  test(`${helper}: public impulse batch reveals a foreign library top-first with its acting controller`, async () => {
    const f = setup(), lower = f.put('Sol Ring', f.b), top = f.put('Island', f.b);
    f.inspect = q => {
      if (!q.libraryReveal) return;
      assert.equal(q.ctrl, f.a);
      assert.equal(q.libraryOwner, f.b);
      if (q.revealStage === 'start') assert.equal(f.b.exile.length, 0);
      if (q.card === top) assert.equal(lower.zone, 'library');
    };
    await f.effect(ctx => helper === 'CDK' ? M.CDK.exileTop(ctx, 2, f.b)
      : helper === 'C21' ? M.C21.exileTop(ctx, f.b, 2)
        : M.OracleV20.helpers.runGenericEffect({...ctx, targets: [f.b]}, {action: 'exile-top', who: 0, n: 2}));
    assert.deepEqual(f.shown(), [top, lower]);
    assert.equal(f.b.exile.length, 2);
  });
}

test('private inspected cards and face-down exile remain outside public reveal sequences', async () => {
  const f = setup(), hidden = f.put('Sol Ring');
  await f.effect(async ctx => {
    await ctx.g.revealToHuman({cards: [hidden], ctrl: f.a, kind: 'look', includeLands: true});
    await ctx.g.move(hidden, 'exile', {exileFaceDown: true, exileLookers: [f.a.idx]});
  });
  assert.equal(f.questions.filter(q => q.libraryReveal).length, 0);
  const look = f.questions.find(q => q.type === 'cardReveal');
  assert.equal(look.kind, 'look'); assert.equal(look.player, f.a);
  assert.ok(hidden.faceDown);
});


test('Ashiok linked-exile bookkeeping does not expose the unrevealed cohort in Live views', async () => {
  const f = setup(), low = f.put('Sol Ring', f.b), middle = f.put('Arcane Signet', f.b), top = f.put('Island', f.b);
  const all = [top, middle, low];
  f.inspect = q => {
    if (!q.libraryReveal) return;
    const json = JSON.stringify(M.onlineArenaView(f.game, f.a));
    const shown = f.shown();
    for (const c of all.filter(c => !shown.includes(c))) assert.ok(!json.includes(c.name), c.name + ' stays hidden before its reveal');
    if (q.revealStage === 'start') assert.equal(f.game.oracleLinkedExiles[0].cards.length, 3);
  };
  await f.effect(ctx => M.OracleV20.helpers.runGenericEffect({...ctx, targets: [f.b]}, {action: 'common-effects-v69', mode: 'ashiok-exile', target: 0}));
  assert.deepEqual(f.shown(), all);
});

test('generic public inspect-top uses one sequence for its controller without a duplicate full-pile popup', async () => {
  const f = setup(), lower = f.put('Sol Ring'), top = f.put('Forest');
  await f.effect(ctx => M.OracleV20.helpers.runGenericEffect(ctx, {action: 'inspect-top', who: 'you', n: 2, reveal: true}));
  assert.deepEqual(f.shown(), [top, lower]);
  assert.equal(f.questions.filter(q => q.type === 'cardReveal').length, 3);
  assert.ok(f.questions.filter(q => q.type === 'cardReveal').every(q => q.libraryReveal));
  assert.equal(top.zone, 'library'); assert.equal(lower.zone, 'library');
});

for (const action of ['reveal-top-v16', 'zone-choice-v20']) {
  test(`${action}: public fixed-count reveals start at the top card and preserve library order`, async () => {
    const f = setup(), bottom = f.put('Arcane Signet'), lower = f.put('Sol Ring'), top = f.put('Forest');
    const effect = action === 'reveal-top-v16'
      ? {action, who: 'you', n: 2}
      : {action, who: 'you', revealTop: 2, selections: [], optional: true};
    f.inspect = q => {
      if (!q.libraryReveal) return;
      assert.deepEqual([...f.a.library], [bottom, lower, top]);
      assert.ok(!q.cards.includes(bottom));
      if (q.card === top) assert.deepEqual([...q.cards], [top]);
    };
    await f.effect(ctx => M.OracleV20.helpers.runGenericEffect(ctx, effect));
    assert.deepEqual(f.shown(), [top, lower]);
    assert.deepEqual([...f.a.library], [bottom, lower, top]);
  });
}
