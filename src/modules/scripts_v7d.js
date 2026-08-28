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
      const controller = t.ctrl;
      await ctx.g.destroy(t);
      const search = await controller.controller.decide(ctx.g, {
        type: 'chooseOption', prompt: `Assassin's Trophy: ${controller.name} može naći basic land`,
        options: [{ key: 'yes', label: 'Da, traži basic' }, { key: 'no', label: 'Ne' }],
        aiHint: { kind: 'rampChoice' },
      });
      if (search === 'yes') await E.searchBasic(ctx.g, controller, { tapped: false });
    },
  };
  SC['Terminate'] = {
    targets: [T.creature({ prompt: 'Uništi', aiHint: { goal: 'removal' } })],
    resolve: async ctx => { const t = ctx.targets[0]; if (t) { t.regenShield = 0; await ctx.g.destroy(t); } },
  };
  SC['Chain Reaction'] = {
    resolve: async ctx => {
      const x = ctx.g.bf().filter(c => c.is('Creature')).length;
      for (const c of ctx.g.bf().filter(c => c.is('Creature')).slice()) {
        await ctx.g.damageCreature(ctx.src, c, x, { deferSBA: true });
      }
      await ctx.g.checkSBA();
    },
  };
  SC["Night's Whisper"] = {
    resolve: async ctx => { await ctx.g.draw(ctx.you, 2); await ctx.g.loseLife(ctx.you, 2, 'whisper'); },
  };
  SC['Painful Truths'] = {
    resolve: async ctx => {
      const x = Math.min(3, (ctx.src.meta._payColors || []).length);
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
      if (!await g.counterStackObject(so, { source: ctx.src, message: `${so.name} is countered by Swan Song.` })) return;
      await g.makeTokens('birdU', caster);
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
        {
          label: '4 damage to a player or planeswalker',
          targets: [T.any({
            prompt: 'Igrač ili planeswalker',
            filter: (g, target) => target instanceof MTG.Player || target instanceof MTG.CardInst && target.is('Planeswalker'),
            aiHint: { goal: 'damage', n: 4 },
          })],
        },
        { label: 'Permanenti indestructible' },
        { label: 'Double strike', targets: [T.creature({ prompt: 'Double strike', aiHint: { goal: 'buff' } })] },
      ],
    },
    resolve: async ctx => {
      const mi = ctx.mode[0];
      if (mi === 0) { if (ctx.targets[0]) await ctx.g.damageAny(ctx.src, ctx.targets[0], 4); }
      else if (mi === 1) { for (const c of ctx.g.bf().filter(c => c.ctrl === ctx.you)) E.grantUntilEOT(ctx.g, c, ['indestructible']); }
      else { if (ctx.targets[0]) E.grantUntilEOT(ctx.g, ctx.targets[0], ['double strike']); }
    },
  };
  SC["Heliod's Intervention"] = {
    xCost: true,
    modes: {
      pick: 1,
      aiHint: { kind: 'heliodIntervention' },
      list: [
        {
          label: 'Destroy X artifacts and/or enchantments',
          targets: (g, card, castOpts) => [T.permanent(
            (g2, target) => target.is('Artifact') || target.is('Enchantment'),
            { count: castOpts.xVal || 0, prompt: `Tačno ${castOpts.xVal || 0} meta`, aiHint: { goal: 'removal' } },
          )],
        },
        {
          label: 'Ciljani igrač dobija 2X života',
          targets: [T.player({ prompt: 'Who gains the life?', aiHint: { goal: 'lifegain' } })],
        },
      ],
    },
    resolve: async ctx => {
      const x = ctx.x || 0;
      if (ctx.mode[0] === 0) {
        const targets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : [ctx.targets[0]].filter(Boolean);
        for (const target of targets) {
          if (target.zone === 'battlefield') await ctx.g.destroy(target);
        }
      } else if (ctx.targets[0]) await ctx.g.gainLife(ctx.targets[0], 2 * x);
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
        await E.searchLandByName(ctx.g, ctx.you, ['Island'], { toHand: true });
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
    entersTapped: async (g, card) => {
      const revealable = card.ctrl.hand.filter(candidate => candidate !== card &&
        (candidate.def.subtypes.includes('Forest') || candidate.def.subtypes.includes('Island')));
      if (!revealable.length) return true;
      const picked = await card.ctrl.controller.decide(g, {
        type: 'chooseCards', from: revealable, min: 0, max: 1,
        prompt: 'Vineglimmer Snarl: otkrij Forest ili Island da uđe untapped?',
        aiHint: { kind: 'revealLand', source: card },
      });
      if (!picked[0]) return true;
      g.lg(`${card.ctrl.name} otkriva ${picked[0].name} za Vineglimmer Snarl.`);
      return false;
    },
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
