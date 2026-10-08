'use strict';
((M) => {
  const H = M.OracleV20.helpers;
  const basic = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
  async function choose(ctx, player, from, min, max, kind = 'recur') {
    if (!from.length) return [];
    const versions = new Map(from.map(card => [card, card.zoneVersion]));
    const picked = await player.controller.decide(ctx.g, {type: 'chooseCards', from, min, max, prompt: ctx.src.name + ': choose cards', aiHint: {kind, src: ctx.src, optional: min === 0}});
    if (!Array.isArray(picked) || picked.length < min || picked.length > max || new Set(picked).size !== picked.length || picked.some(card => !from.includes(card) || card.zoneVersion !== versions.get(card))) throw Error('Invalid v32 cohort choice');
    return picked;
  }
  async function yes(ctx, player, prompt, kind = 'pay', cost) {
    const choice = await player.controller.decide(ctx.g, {type: 'chooseOption', prompt: ctx.src.name + ': ' + prompt, options: [{key: 'no', label: 'Decline'}, {key: 'yes', label: 'Accept'}], aiHint: {kind, src: ctx.src, ...(cost ? {cost} : {})}});
    if (!['yes', 'no'].includes(choice)) throw Error('Invalid v32 optional choice');
    return choice === 'yes';
  }
  M.OracleV20.handlers.push({targetHint(e) {
    if (e.action !== 'spell-cohort-v32') return null;
    if (e.mode === 'return-artifact-animate-vehicle') return {goal: 'recur'};
    if (e.mode.startsWith('bounce-or-top')) return {goal: 'bounce'};
    if (e.mode === 'damage-discard-controller') return {goal: 'damage', amount: 3, n: 3};
    if (e.mode === 'damage-optional-equipment') return {goal: 'damage', amount: 6, n: 6};
    if (e.mode === 'block-and-walls') return {goal: 'debuff'};
    return {goal: 'damage', amount: 0, n: 0};
  }, async effect(ctx, e, h) {
    if (e.action !== 'spell-cohort-v32') return false;
    const g = ctx.g, cards = h.genericEffectSubjects(ctx, 0), c = cards[0];
    const src = h.oracleDamageSource(ctx);
    const run = (effects, targets = ctx.targets) => h.runGenericEffects({...ctx, targets}, effects, true);
    const players = () => g.apnapFrom(g.turnPlayer || ctx.you);
    switch (e.mode) {
      case 'block-and-walls':
        await run([{action: 'cant-block-until-eot', target: 0}]);
        await g.destroyMany(cards.filter(card => card.hasSub('Wall')), {source: ctx.src});
        break;
      case 'reveal-hand-qualities':
        if (c) {
          const hand = c.hand.slice();
          await g.revealToHuman({cards: hand, ctrl: c, source: ctx.src, kind: 'reveal'});
          await g.draw(ctx.you, hand.filter(card => card.hasSub(e.subtype) || card.colors.includes(e.color)).length, ctx.src);
        }
        break;
      case 'counter-opponent-stack': {
        const objects = g.stack.filter(object => object !== ctx.so && object.ctrl !== ctx.you);
        const protectedObjects = new Set();
        // Each opponent selects a cohort and pays its total in turn order;
        // the unpaid stack objects are countered together after all payments.
        for (const player of players().filter(p => p !== ctx.you)) {
          const selected = [];
          for (const object of objects.filter(so => so.ctrl === player && g.stack.includes(so))) {
            const total = '{' + (selected.length + 1) * 4 + '}';
            if (g.canPayMana(player, M.parseCost(total), null)
              && await yes(ctx, player, 'Pay for ' + object.name + '? Total payment ' + total, 'pay', total)) selected.push(object);
          }
          if (selected.length && await g.payMana(player, M.parseCost('{' + selected.length * 4 + '}'), null)) for (const object of selected) protectedObjects.add(object);
        }
        await g.withGraveyardEntryBatch(async () => {for (const object of objects) if (!protectedObjects.has(object)) await g.counterStackObject(object, {source: ctx.src});});
        break;
      }
      case 'bounce-half-creatures':
        if (c) { const pool = g.creatures(c), n = Math.ceil(pool.length / 2); await g.bounceMany(await choose(ctx, ctx.you, pool, n, n, 'bounce')); }
        break;
      case 'keep-one-blocker':
        if (c) { const pool = g.creatures(c), keep = await choose(ctx, c, pool, Math.min(1, pool.length), Math.min(1, pool.length), 'keep'); await run([{action: 'cant-block-until-eot', target: 0}], [pool.filter(card => !keep.includes(card))]); }
        break;
      case 'any-player-damage-or-mill': {
        let accepting;
        for (const player of players()) if (await yes(ctx, player, 'Take ' + e.damage + ' damage?', 'optionalDamage')) { accepting = player; break; }
        if (accepting) await g.damageBatch([{src, target: accepting, n: e.damage}], {deferSBA: true});
        else await run([{action: 'mill', who: 0, n: e.mill}]);
        break;
      }
      case 'colors-and-land-types-win':
        if (basic.every(type => g.bf().some(card => card.ctrl === ctx.you && card.is('Land') && card.hasSub(type))) && ['W', 'U', 'B', 'R', 'G'].every(color => g.creatures(ctx.you).some(card => card.colors.includes(color)))) await run([{action: 'win-game-v9'}]);
        break;
      case 'world-exile-life':
        await g.exileMany(g.bf());
        await g.withGraveyardEntryBatch(async () => { for (const player of players()) for (const card of [...player.hand, ...player.graveyard]) await g.move(card, 'exile'); });
        await run([{action: 'set-life-v9', who: 'each-player', n: 1}]);
        break;
      case 'nonblack-green-damage':
        await g.damageBatch(g.bf().filter(card => card.is('Creature')).map(target => ({src, target, n: Number(!target.colors.includes('B')) + Number(target.colors.includes('G'))})), {deferSBA: true});
        break;
      case 'choose-basic-land-types': {
        const groups = [];
        for (const player of players()) {
          const lands = g.bf().filter(card => card.ctrl === player && card.is('Land')), chosen = new Set();
          for (const type of basic) { const pool = lands.filter(card => card.hasSub(type)); for (const card of await choose(ctx, player, pool, Math.min(1, pool.length), Math.min(1, pool.length), 'keep')) chosen.add(card); }
          groups.push({player, cards: e.operation === 'bounce-chosen' ? [...chosen] : lands.filter(card => !chosen.has(card) && g.canSacrifice(card))});
        }
        if (e.operation === 'bounce-chosen') await g.bounceMany(groups.flatMap(group => group.cards));
        else await g.sacrificeMany(null, groups.flatMap(group => group.cards));
        break;
      }
      case 'borrow-artifacts': {
        const pool = g.bf().filter(card => card.ctrl !== ctx.you && card.is('Artifact'));
        await run([{action: 'gain-control', target: 0, temporary: true}, {action: 'untap', target: 0}, {action: 'pump', target: 0, power: 0, toughness: 0, keywords: ['haste']}], [pool]);
        break;
      }
      case 'return-artifact-animate-vehicle':
        if (c?.zone === 'graveyard') {
          await g.putPermanentOntoBattlefield(c, ctx.you);
          if (c.zone === 'battlefield' && c.hasSub('Vehicle')) await run([{action: 'animate', target: 0, types: ['Artifact', 'Creature'], subtypes: [], keywords: [], retainTypes: true, retainAllSubtypes: true, replaceCreatureSubtypes: false, temporary: false}], [c]);
        }
        break;
      case 'damage-discard-controller':
        if (c) { const player = c instanceof M.Player ? c : c.ctrl; await g.damageBatch([{src, target: c, n: 3}], {deferSBA: true}); await run([{action: 'discard', who: 0, n: 2}], [player]); }
        break;
      case 'bounce-or-top-color':
        if (c) await g.move(c, c.colors.some(color => e.colors.includes(color)) ? 'library' : 'hand');
        break;
      case 'bounce-or-top-attacker':
        if (c) await g.move(c, c.attacking && await yes(ctx, ctx.you, 'Put the attacking creature on top of its owner\'s library?', 'optTrigger') ? 'library' : 'hand');
        break;
      case 'damage-optional-equipment':
        if (c) {
          await g.damageBatch([{src, target: c, n: 6}], {deferSBA: true});
          const pool = g.bf().filter(card => card.hasSub('Equipment') && card.attachedTo === c.iid && c.zone === 'battlefield');
          await g.destroyMany(await choose(ctx, ctx.you, pool, 0, Math.min(1, pool.length), 'destroy'), {source: ctx.src});
        }
        break;
      default: throw Error('Unknown v32 spell cohort: ' + e.mode);
    }
    return true;
  }});
})(globalThis.MTG ||= {});
