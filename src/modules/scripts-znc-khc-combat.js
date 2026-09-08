'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, SC = M.SCRIPTS, C = M.ZK, E = M.E, T = M.T;
  SC['Murkfiend Liege'] = {zkLiege: true, statics: [{apply: (g, c, bf) => {
    for (const x of bf) if (x !== c && x.ctrl === c.ctrl && x.is('Creature')) {
      const n = x.colors.filter(color => color === 'G' || color === 'U').length;
      x.cur.power += n; x.cur.toughness += n;
    }
  }}]};
  SC['Tromokratis'] = {statics: [{apply: (g, c) => {
    if (!c.attacking && !c.blocking) c.cur.kw.add('hexproof');
    const defender = c.attacking instanceof M.Player ? c.attacking : c.attacking?.ctrl;
    if (defender) c.cur.minBlockers = Math.max(c.cur.minBlockers || 1, g.creatures(defender).length);
  }}]};
  SC['Master Warcraft'] = {oracleCastRestriction: (g) => !g.turnPlayer?.turnState.reachedDeclareAttackers,
    resolve: ctx => {ctx.g.untilEffects.push({kind: 'zkWarcraft', expires: 'eot', who: ctx.you}, {kind: 'c1516ChooseBlocks', expires: 'eot', who: ctx.you});}};
  SC['Trench Behemoth'] = {abilities: [{label: 'Return a land: untap and gain hexproof',
    cost: {returnPermanents: {n: 1, filter: (g, c) => c.is('Land')}},
    run: ctx => {if (C.same(ctx)) {ctx.g.untap(ctx.src); C.grant(ctx, ctx.src, ['hexproof'], 'eot');}},
    aiScore: (g, c) => c.tapped || g.stack.some(s => C.flat(s.targets).includes(c)) ? 4 : -5}],
    triggers: [{on: 'landfall', filter: (g, c, d) => d.card.ctrl === c.ctrl,
      targets: [T.creature({filter: (g, c, p) => c.ctrl !== p})], desc: 'Target opposing creature attacks during its controller’s next combat if able',
      run: ctx => {const c = ctx.targets[0]; if (c) ctx.g.untilEffects.push({kind:'zkNextAttack',expires:'object',row:C.row(c),player:c.ctrl.idx,active:false});}}]};
  SC['Stumpsquall Hydra'] = {asEnters: (g,c) => {c.meta.zkCastX = c.castMeta?.wasCast ? c.castMeta.x || 0 : 0;}, triggers: [C.enterTrigger('Distribute X counters among this creature and any commanders', async ctx => {
    const n = ctx.sourceMeta.zkCastX || 0;
    if (!n) return;
    const pool = ctx.g.bf().filter(c => c === ctx.src && C.same(ctx) || c.commander);
    const chosen = await C.choose(ctx.g, ctx.you, pool, Math.min(1, pool.length), Math.min(pool.length, n), 'Stumpsquall Hydra: distribute counters', 'buff');
    const rows = chosen.map(C.row), division = await E.divideDamage(ctx.g, ctx.you, ctx.src, chosen, n, {aiKind: 'dividedCounters'});
    if (division) for (const r of rows) if (C.current(r)) ctx.g.addCounters(r.card, '+1/+1', division.find(x => x.iid === r.card.iid)?.n || 0, false, ctx.you);
  })]};
  SC['Brass Squire'] = {abilities: [{label: 'Attach your Equipment to your creature', cost: {tap: true},
    targets: [T.permanent((g, c, p) => c.ctrl === p && c.hasSub('Equipment')), T.yourCreature()],
    run: ctx => ctx.targets[0] && ctx.targets[1] && ctx.g.attach(ctx.targets[0], ctx.targets[1]), aiScore: () => 4}]};
  SC["On Serra's Wings"] = {auraTarget: [T.creature()], attachGrant: (g, c, h) => {
    if (!h.cur.super.includes('Legendary')) h.cur.super.push('Legendary');
    h.cur.power++; h.cur.toughness++; for (const k of ['flying', 'vigilance', 'lifelink']) h.cur.kw.add(k);
  }};
  SC['Timely Ward'] = {zkTimely: true, auraTarget: [T.creature()], attachGrant: (g, c, h) => h.cur.kw.add('indestructible')};
  SC['Blazing Sunsteel'] = {equip: '{4}', attachGrant: (g, c, h) => {h.cur.power += c.ctrl.opponents(g).length;},
    triggers: [{on: 'dealtDamage', filter: (g, c, d) => d.target?.iid === c.attachedTo,
      targets: [T.any({aiHint: {goal: 'damage'}})], desc: 'Equipped creature deals that much damage to any target',
      prepareTargets: ctx => {ctx.sunsteelHost = ctx.data.target;},
      run: ctx => ctx.targets[0] && ctx.g.damageAny(ctx.sunsteelHost, ctx.targets[0], ctx.data.n)}]};
})();
