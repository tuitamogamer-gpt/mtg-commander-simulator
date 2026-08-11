// ===== scripts_v7d.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// v7d — zajednički stapleovi novih deckova
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS;
  const etbSelf = (g, self, d) => d.card === self;

  SC['Marauding Mutagen'] = { // = Acidic Slime
    triggers: [{
      on: 'etb', desc: 'Uništi art/ench/land', filter: etbSelf,
      targets: [T.permanent((g, c) => c.is('Artifact') || c.is('Enchantment') || c.is('Land'), { prompt: 'Uništi', aiHint: { goal: 'removal' } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
    }],
  };
  SC["Assassin's Trophy"] = {
    targets: [T.permanent((g, c, ctrl) => c.ctrl !== ctrl, { prompt: 'Uništi permanent', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0];
      if (!t) return;
      const owner = t.ctrl;
      await ctx.g.destroy(t);
      await E.searchBasic(ctx.g, owner, {});
    },
  };
  SC['Terminate'] = {
    targets: [T.creature({ prompt: 'Uništi', aiHint: { goal: 'removal' } })],
    resolve: async ctx => { const t = ctx.targets[0]; if (t) { t.regenShield = 0; await ctx.g.destroy(t); } },
  };
  SC['Chain Reaction'] = {
    resolve: async ctx => {
      const x = ctx.g.bf().filter(c => c.is('Creature')).length;
      for (const c of ctx.g.bf().filter(c => c.is('Creature')).slice()) await ctx.g.damageCreature(ctx.src, c, x);
    },
  };
  SC["Night's Whisper"] = {
    resolve: async ctx => { await ctx.g.draw(ctx.you, 2); await ctx.g.loseLife(ctx.you, 2, 'whisper'); },
  };
  SC['Painful Truths'] = {
    resolve: async ctx => {
      const x = Math.min(3, Math.max(1, (ctx.src.meta._payColors || []).length));
      await ctx.g.draw(ctx.you, x);
      await ctx.g.loseLife(ctx.you, x, 'truths');
    },
  };
  SC["Commander's Sphere"] = {
    mana: { cost: { tap: true }, produce: (g, c, p) => p.colorIdentity.map(col => ({ [col]: 1 })) },
    abilities: [{
      label: 'Sac: vuci', cost: { sacSelf: true },
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      aiScore: (g, c, p) => g.lands(p).length >= 6 ? 2 : 0.2,
    }],
  };
  SC['Swan Song'] = {
    targets: [T.spell((g, so) => so.card.is('Enchantment') || so.card.is('Instant') || so.card.is('Sorcery'), { prompt: 'Counter', aiHint: { goal: 'counter' } })],
    resolve: async ctx => {
      const so = ctx.targets[0], g = ctx.g;
      if (!so || !g.stack.includes(so)) return;
      const caster = so.ctrl;
      if (MTG.isUncounterable(g, so)) { g.lg(`${so.card.name} ne može biti counterovan.`); return; }
      g.stack.splice(g.stack.indexOf(so), 1);
      if (!so.isCopy) await g.move(so.card, 'graveyard');
      g.lg(`${so.name} COUNTEROVAN (Swan Song)!`, 'counter');
      await g.makeTokens('birdU', caster);
      g.note('stack', {});
    },
  };
  SC['Thirst for Knowledge'] = {
    resolve: async ctx => {
      await ctx.g.draw(ctx.you, 3);
      const arts = ctx.you.hand.filter(c => c.is('Artifact'));
      let pick;
      if (arts.length) {
        const k = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Odbaci artefakt (1) ili 2 karte?',
          options: [{ key: 'art', label: 'Artefakt' }, { key: 'two', label: '2 karte' }],
          aiHint: { kind: 'mode' },
        });
        if (k === 'art') {
          pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: arts, min: 1, max: 1, prompt: 'Odbaci artefakt', aiHint: { kind: 'addlDiscard' } });
          await ctx.g.discard(ctx.you, pick);
          return;
        }
      }
      const n = Math.min(2, ctx.you.hand.length);
      pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: ctx.you.hand, min: n, max: n, prompt: 'Odbaci 2', aiHint: { kind: 'addlDiscard' } });
      await ctx.g.discard(ctx.you, pick);
    },
  };
  SC['Boros Charm'] = {
    modes: {
      pick: 1,
      list: [
        { label: '4 štete igraču', targets: [T.opponent({ prompt: '4 štete', aiHint: { goal: 'drain' } })] },
        { label: 'Permanenti indestructible' },
        { label: 'Double strike', targets: [T.creature({ prompt: 'Double strike', aiHint: { goal: 'buff' } })] },
      ],
    },
    resolve: async ctx => {
      const mi = ctx.mode[0];
      if (mi === 0) { if (ctx.targets[0]) await ctx.g.damagePlayer(ctx.src, ctx.targets[0], 4); }
      else if (mi === 1) { for (const c of ctx.g.bf().filter(c => c.ctrl === ctx.you)) E.grantUntilEOT(ctx.g, c, ['indestructible']); }
      else { if (ctx.targets[0]) E.grantUntilEOT(ctx.g, ctx.targets[0], ['double strike']); }
    },
  };
  SC["Heliod's Intervention"] = {
    xCost: true,
    resolve: async ctx => {
      const x = ctx.x || 0;
      const cands = ctx.g.bf().filter(c => (c.is('Artifact') || c.is('Enchantment')) && c.ctrl !== ctx.you);
      if (cands.length && x > 0) {
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: cands, min: 0, max: x, prompt: `Uništi do ${x}`, aiHint: { kind: 'removalPick' },
        });
        if (pick.length) { for (const c of pick) await ctx.g.destroy(c); return; }
      }
      await ctx.g.gainLife(ctx.you, 2 * x);
    },
  };
  SC['Elvish Mystic'] = { mana: { cost: { tap: true }, produce: [{ G: 1 }] } };
  SC['Paradise Druid'] = {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    statics: [{
      cond: (g, self) => !self.tapped,
      apply: (g, self) => { self.cur.hexproof = true; },
    }],
  };
  SC['Reclamation Sage'] = {
    triggers: [{
      on: 'etb', desc: 'Uništi art/ench', filter: etbSelf, opt: true,
      targets: [T.permanent((g, c) => c.is('Artifact') || c.is('Enchantment'), { prompt: 'Uništi', upTo: true, aiHint: { goal: 'removal' } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
    }],
  };
  SC['Heroic Intervention'] = {
    resolve: async ctx => {
      for (const c of ctx.g.bf().filter(c => c.ctrl === ctx.you)) {
        E.grantUntilEOT(ctx.g, c, ['indestructible']);
        const iid = c.iid;
        ctx.g.untilEffects.push({
          expires: 'eot', kind: 'hexproof',
          apply: (g2, bf) => { const x = bf.find(y => y.iid === iid); if (x) x.cur.hexproof = true; },
        });
      }
      ctx.g.recalc();
      ctx.g.lg('Heroic Intervention: hexproof + indestructible!');
    },
  };
  SC['Lórien Revealed'] = {
    cycling: {
      cost: '{1}', noDraw: true,
      effect: async ctx => {
        const isl = ctx.you.library.find(c => c.hasSub && c.def.subtypes.includes('Island'));
        if (isl) {
          ctx.you.library.splice(ctx.you.library.indexOf(isl), 1);
          isl.zone = 'hand'; ctx.you.hand.push(isl);
          U.shuffle(ctx.you.library, ctx.g.rnd);
          ctx.g.lg(`Islandcycling: ${isl.name} u ruku.`);
        }
      },
    },
    resolve: async ctx => { await ctx.g.draw(ctx.you, 3); },
  };
  SC['Whispersilk Cloak'] = {
    equip: '{2}',
    statics: [{
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (host) { host.cur.unblockable = true; host.cur.shroud = true; }
      },
    }],
  };
  // Elven Council duali
  const dual2 = (c1, c2, tapped) => ({
    producesColors: [c1, c2], entersTapped: !!tapped,
    mana: { cost: { tap: true }, produce: [{ [c1]: 1 }, { [c2]: 1 }] },
  });
  SC['Woodland Stream'] = dual2('G', 'U', true);
  SC['Thornwood Falls'] = Object.assign(dual2('G', 'U', true), {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: '+1 život',
      run: async ctx => { await ctx.g.gainLife(ctx.you, 1); },
    }],
  });
  SC['Vineglimmer Snarl'] = Object.assign(dual2('G', 'U'), {
    entersTapped: (g, card) => !card.ctrl.hand.some(c => c.def.subtypes.includes('Forest') || c.def.subtypes.includes('Island')),
  });
  SC['Rejuvenating Springs'] = Object.assign(dual2('G', 'U'), {
    entersTapped: (g, card) => g.alivePlayers().filter(x => x !== card.ctrl).length < 2,
  });
  SC['Flooded Grove'] = {
    producesColors: ['G', 'U'],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true, mana: '{G/U}' }, produce: [{ G: 2 }, { G: 1, U: 1 }, { U: 2 }] },
    ],
  };
})();
