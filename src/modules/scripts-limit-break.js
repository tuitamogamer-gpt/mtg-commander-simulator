// ===== scripts-limit-break.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS;
  const etbSelf = (g, self, data) => data.card === self;
  const attacksSelf = (g, self, data) => data.card === self;
  const flat = value => Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
  const legendary = card => !!card && ((card.cur?.super || card.def?.super || []).includes('Legendary'));
  const historic = card => !!card && (card.is('Artifact') || card.hasSub('Saga') || legendary(card));
  const equipmentOn = (g, host) => (host.attachments || []).map(iid => g.byIid(iid))
    .filter(card => card?.zone === 'battlefield' && card.hasSub('Equipment'));
  const equipped = (g, host) => equipmentOn(g, host).length > 0;
  const defendingPlayer = attacker => attacker?.attacking instanceof MTG.Player
    ? attacker.attacking : attacker?.attacking?.ctrl || null;
  const token = (name, colors, subtypes, power, toughness) => ({
    name, cost: null, super: [], types: ['Creature'], subtypes, power: String(power), toughness: String(toughness),
    oracle: '', kws: [], colorsOverride: colors, isTokenDef: true,
  });
  TK.limitSoldierW ||= token('Soldier', ['W'], ['Soldier'], 1, 1);
  TK.limitRebelR ||= token('Rebel', ['R'], ['Rebel'], 2, 2);

  async function chooseCards(game, player, pool, min, max, prompt, aiHint) {
    if (!pool.length || max <= 0) return [];
    const picked = await player.controller.decide(game, {
      type: 'chooseCards', from: pool, min, max: Math.min(max, pool.length), prompt,
      aiHint: aiHint || { kind: 'bestPermanent' },
    });
    return Array.isArray(picked) ? picked.filter(card => pool.includes(card)).slice(0, max) : [];
  }

  function basePTUntilEOT(game, cards, power, toughness, kind) {
    const ids = cards.map(card => ({ iid: card.iid, timestamp: card.timestamp }));
    game.untilEffects.push({ expires: 'eot', kind, apply: (g, bf) => {
      for (const id of ids) {
        const card = bf.find(item => item.iid === id.iid && item.timestamp === id.timestamp);
        if (!card) continue;
        const powerMod = card.cur.power - card.cur.basePower;
        const toughnessMod = card.cur.toughness - card.cur.baseToughness;
        card.cur.basePower = power; card.cur.baseToughness = toughness;
        card.cur.power = power + powerMod; card.cur.toughness = toughness + toughnessMod;
      }
    } });
    game.recalc();
  }

  function allowExilePlay(card, player, until, extra = {}) {
    card.meta.playableBy = player;
    card.meta.playableUntil = until;
    Object.assign(card.meta, extra);
  }

  async function exileTopPlayable(game, player, source, until = game.turnNo) {
    const card = player.library.at(-1);
    if (!card) return null;
    await game.move(card, 'exile');
    allowExilePlay(card, player, until, { impulseSource: source.iid });
    return card;
  }

  async function discardOne(game, player, source, optional = false) {
    const picked = await chooseCards(game, player, player.hand, optional ? 0 : 1, 1,
      `${source.name}: odbaci kartu`, { kind: 'discard', src: source });
    if (!picked[0]) return null;
    await game.discard(player, picked);
    return picked[0];
  }

  function equipmentScript(equip, attachGrant, extra = {}) {
    return Object.assign({ equip, attachGrant }, extra);
  }

  SC['Cloud, Ex-SOLDIER'] = {
    triggers: [{
      on: 'etb', desc: 'Attach Equipment', filter: etbSelf,
      targets: [T.permanent((g, card, ctrl) => card.ctrl === ctrl && card.hasSub('Equipment'), {
        upTo: true, prompt: 'Cloud: attach up to one Equipment you control', aiHint: { goal: 'equipBest' },
      })],
      run: async ctx => { if (ctx.targets[0] && ctx.src.zone === 'battlefield') await ctx.g.attach(ctx.targets[0], ctx.src); },
    }, {
      on: 'attacks', desc: 'Draw for equipped attackers and make Treasures', filter: attacksSelf,
      run: async ctx => {
        const n = ctx.g.creatures(ctx.you).filter(card => card.attacking && equipped(ctx.g, card)).length;
        if (n) await ctx.g.draw(ctx.you, n);
        if (ctx.src.zone === 'battlefield' && ctx.src.power >= 7) await ctx.g.makeTokens('treasure', ctx.you, { n: 2 });
      },
    }],
  };

  SC['Zack Fair'] = {
    etbCounters: { kind: '+1/+1', n: 1 },
    abilities: [{
      label: 'Legacy: protect, move counters and Equipment', cost: { mana: '{1}', sacSelf: true },
      targets: [T.yourCreature({ prompt: 'Creature inherits Zack Fair\'s legacy', aiHint: { goal: 'protect' } })],
      run: async ctx => {
        const target = ctx.targets[0]; if (!target || target.zone !== 'battlefield') return;
        E.grantUntilEOT(ctx.g, target, ['indestructible']);
        for (const [kind, n] of Object.entries(ctx.sacdSelf?.counters || {})) if (n > 0) {
          ctx.g.addCounters(target, kind, n, false, ctx.you);
        }
        const attached = (ctx.sacdSelf?.attachments || []).map(iid => ctx.g.byIid(iid))
          .filter(card => card?.zone === 'battlefield' && card.hasSub('Equipment'));
        const pick = await chooseCards(ctx.g, ctx.you, attached, attached.length ? 1 : 0, 1,
          'Zack Fair: Equipment to inherit', { kind: 'equipBest', target });
        if (pick[0]) await ctx.g.attach(pick[0], target);
      },
      aiScore: (g, self) => Object.values(self.counters).reduce((sum, n) => sum + Math.max(0, n), 0) + equipmentOn(g, self).length + 1,
    }],
  };

  SC['Bugenhagen, Wise Elder'] = {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    triggers: [{
      on: 'upkeep', desc: 'Draw with power seven',
      filter: (g, self, data) => data.player === self.ctrl && g.creatures(self.ctrl).some(card => card.power >= 7),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };

  SC['Cid, Freeflier Pilot'] = {
    costMods: [(g, self, q) => q.player === self.ctrl && (q.card.hasSub('Equipment') || q.card.hasSub('Vehicle')) ? -1 : 0],
    statics: [{ apply: (g, self) => { if (g.turnPlayer === self.ctrl) self.cur.kw.add('flying'); } }],
    abilities: [{
      label: 'Recover Equipment or Vehicle', cost: { mana: '{2}', tap: true },
      targets: [{
        zone: 'graveyard', what: 'card', prompt: 'Equipment or Vehicle from your graveyard', aiHint: { goal: 'recursion' },
        filter: (g, card, ctrl) => card.owner === ctrl && (card.hasSub('Equipment') || card.hasSub('Vehicle')),
      }],
      run: async ctx => { if (ctx.targets[0]?.zone === 'graveyard') await ctx.g.move(ctx.targets[0], 'hand'); }, aiScore: () => 4,
    }],
  };

  SC.Helitrooper = {
    abilityCostReduction: (g, self, q) => q.kind === 'equip' && q.player === self.ctrl && flat(q.targets).includes(self) ? 2 : 0,
    triggers: [{
      on: 'attacks', desc: 'Another attacker gains flying', filter: attacksSelf,
      targets: [T.yourCreature({
        prompt: 'Another attacking creature gains flying', aiHint: { goal: 'evasion' },
        filter: (g, card, ctrl, source) => card.ctrl === ctrl && card !== source && !!card.attacking,
      })],
      run: async ctx => { if (ctx.targets[0]) E.grantUntilEOT(ctx.g, ctx.targets[0], ['flying']); },
    }],
  };

  SC['Professor Hojo'] = {
    abilityCostReduction: (g, self, q) => g.turnPlayer === self.ctrl && q.player === self.ctrl &&
      (self.ctrl.turnState.targetedAbilitiesActivated || 0) === 0 && flat(q.targets).some(card =>
        card instanceof MTG.CardInst && card.zone === 'battlefield' && card.ctrl === self.ctrl && card.is('Creature')) ? 2 : 0,
    triggers: [{
      on: 'targeted', oncePerTurn: true, desc: 'Draw for targeted creature',
      filter: (g, self, data) => data.isActivatedAbility && data.byPlayer === self.ctrl &&
        data.card instanceof MTG.CardInst && data.card.zone === 'battlefield' && data.card.ctrl === self.ctrl && data.card.is('Creature'),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };

  SC['Puresteel Paladin'] = {
    triggers: [{
      on: 'etb', opt: true, desc: 'Draw for Equipment',
      filter: (g, self, data) => data.card.ctrl === self.ctrl && data.card.hasSub('Equipment'),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
    statics: [{ apply: (g, self, bf) => {
      if (bf.filter(card => card.ctrl === self.ctrl && card.is('Artifact')).length < 3) return;
      for (const card of bf) if (card.ctrl === self.ctrl && card.hasSub('Equipment')) card.cur.equipCost = '{0}';
    } }],
  };

  const automatonAttach = {
    desc: 'Attach any number of Equipment', opt: true,
    targets: [T.permanent((g, card) => card.hasSub('Equipment'), {
      count: 999, min: 0, upTo: true, prompt: 'Equipment to attach to Armory Automaton', aiHint: { goal: 'equipBest' },
    })],
    run: async ctx => {
      if (ctx.src.zone !== 'battlefield') return;
      for (const card of flat(ctx.targets[0])) if (card.zone === 'battlefield') await ctx.g.attach(card, ctx.src);
    },
  };
  SC['Armory Automaton'] = { triggers: [
    Object.assign({ on: 'etb', filter: etbSelf }, automatonAttach),
    Object.assign({ on: 'attacks', filter: attacksSelf }, automatonAttach),
  ] };

  SC['Avalanche of Sector 7'] = {
    cdaPower: (g, self) => g.bf().filter(card => card.ctrl !== self.ctrl && card.is('Artifact')).length,
    triggers: [{
      on: 'abilityActivated', desc: 'Punish artifact ability',
      filter: (g, self, data) => data.player && data.player !== self.ctrl && data.card?.ctrl === data.player && data.card.is('Artifact'),
      run: async ctx => { await ctx.g.damagePlayer(ctx.src, ctx.data.player, 1); },
    }],
  };

  SC['Elena, Turk Recruit'] = {
    triggers: [{
      on: 'etb', desc: 'Recover non-Assassin historic', filter: etbSelf,
      targets: [{
        zone: 'graveyard', what: 'card', prompt: 'Non-Assassin historic card from your graveyard', aiHint: { goal: 'recursion' },
        filter: (g, card, ctrl) => card.owner === ctrl && historic(card) && !card.hasSub('Assassin'),
      }],
      run: async ctx => { if (ctx.targets[0]?.zone === 'graveyard') await ctx.g.move(ctx.targets[0], 'hand'); },
    }, {
      on: 'cast', desc: 'Historic spell counter', filter: (g, self, data) => data.player === self.ctrl && historic(data.card),
      run: async ctx => { if (ctx.src.zone === 'battlefield') ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you); },
    }],
  };

  SC['Professional Face-Breaker'] = {
    triggers: [{
      on: 'combatDamageGroupToPlayer', desc: 'Treasure',
      filter: (g, self, data) => data.cards.some(card => card.ctrl === self.ctrl),
      run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
    }],
    abilities: [{
      label: 'Sacrifice a Treasure: impulse draw', cost: { sac: (g, card) => card.hasSub('Treasure') },
      run: async ctx => { await exileTopPlayable(ctx.g, ctx.you, ctx.src); },
      aiScore: (g, self, player) => player.library.length ? 4 : -5,
    }],
  };

  SC['Red XIII, Proud Warrior'] = {
    statics: [{ apply: (g, self, bf) => {
      for (const card of bf) if (card !== self && card.ctrl === self.ctrl && g.isModifiedCreature(card)) {
        card.cur.kw.add('vigilance'); card.cur.kw.add('trample');
      }
    } }],
    triggers: [{
      on: 'etb', desc: 'Cosmo Memory', filter: etbSelf,
      targets: [{
        zone: 'graveyard', what: 'card', prompt: 'Aura or Equipment from your graveyard', aiHint: { goal: 'recursion' },
        filter: (g, card, ctrl) => card.owner === ctrl && (card.hasSub('Aura') || card.hasSub('Equipment')),
      }],
      run: async ctx => { if (ctx.targets[0]?.zone === 'graveyard') await ctx.g.move(ctx.targets[0], 'hand'); },
    }],
  };

  SC['Vincent, Vengeful Atoner'] = { triggers: [{
    on: 'combatDamageGroupToPlayer', desc: 'Vengeful counter',
    filter: (g, self, data) => data.cards.some(card => card.ctrl === self.ctrl),
    run: async ctx => { if (ctx.src.zone === 'battlefield') ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you); },
  }, {
    on: 'combatDamageToPlayer', desc: 'Chaos damage',
    filter: (g, self, data) => data.card === self && self.power >= 7 && data.n > 0,
    run: async ctx => {
      for (const player of ctx.g.alivePlayers()) if (player !== ctx.you && player !== ctx.data.player) {
        await ctx.g.damagePlayer(ctx.src, player, ctx.data.n);
      }
    },
  }] };

  function restoreYuffieArtifact(game, self) {
    const claim = self.meta.yuffieClaim; if (!claim) return;
    const artifact = game.byIid(claim.iid);
    if (!artifact || artifact.zone !== 'battlefield' || artifact.timestamp !== claim.timestamp) {
      delete self.meta.yuffieClaim; return;
    }
    if (self.zone !== 'battlefield' || self.ctrl !== claim.durationCtrl) {
      artifact.ctrl = claim.originalCtrl;
    }
    if (self.zone !== 'battlefield' || self.ctrl !== claim.durationCtrl) delete self.meta.yuffieClaim;
  }
  SC['Yuffie, Materia Hunter'] = {
    ninjutsu: '{1}{R}',
    statics: [{ apply: (g, self) => { restoreYuffieArtifact(g, self); } }],
    triggers: [{
      on: 'etb', desc: 'Steal noncreature artifact and attach Equipment', filter: etbSelf,
      targets: [T.permanent((g, card) => card.is('Artifact') && !card.is('Creature'), {
        prompt: 'Noncreature artifact to control while you control Yuffie', aiHint: { goal: 'steal' },
      })],
      run: async ctx => {
        const artifact = ctx.targets[0]; if (!artifact || ctx.src.zone !== 'battlefield') return;
        ctx.src.meta.yuffieClaim = {
          iid: artifact.iid, timestamp: artifact.timestamp, originalCtrl: artifact.ctrl, durationCtrl: ctx.you,
        };
        artifact.ctrl = ctx.you; ctx.g.recalc();
        const pool = ctx.g.bf().filter(card => card.ctrl === ctx.you && card.hasSub('Equipment'));
        const pick = await chooseCards(ctx.g, ctx.you, pool, 0, 1, 'Yuffie: attach an Equipment you control',
          { kind: 'equipBest', target: ctx.src });
        if (pick[0] && ctx.src.zone === 'battlefield') await ctx.g.attach(pick[0], ctx.src);
      },
    }, {
      on: 'lto', zone: 'self', desc: 'Return stolen artifact', filter: (g, self, data) => data.card === self,
      run: async ctx => { restoreYuffieArtifact(ctx.g, ctx.src); ctx.g.recalc(); },
    }],
  };

  SC['Aerith, Last Ancient'] = { triggers: [{
    on: 'endStep', desc: 'Raise',
    filter: (g, self, data) => data.player === self.ctrl && self.ctrl.turnState.lifeGained > 0,
    targets: [{
      zone: 'graveyard', what: 'card', prompt: 'Creature to raise', aiHint: { goal: 'recursion' },
      filter: (g, card, ctrl) => card.owner === ctrl && card.is('Creature'),
    }],
    run: async ctx => {
      const card = ctx.targets[0]; if (!card || card.zone !== 'graveyard') return;
      if (ctx.you.turnState.lifeGained >= 7) await ctx.g.move(card, 'battlefield', { ctrl: ctx.you });
      else await ctx.g.move(card, 'hand');
    },
  }] };

  SC['Barret Wallace'] = { triggers: [{
    on: 'attacks', desc: 'Damage defending player', filter: attacksSelf,
    run: async ctx => {
      const defender = defendingPlayer(ctx.data.card); if (!defender) return;
      const n = ctx.g.creatures(ctx.you).filter(card => equipped(ctx.g, card)).length;
      if (n) await ctx.g.damagePlayer(ctx.src, defender, n);
    },
  }] };

  SC['Barret, Avalanche Leader'] = { triggers: [{
    on: 'etb', desc: 'Avalanche Rebel',
    filter: (g, self, data) => data.card !== self && data.card.ctrl === self.ctrl && data.card.hasSub('Equipment'),
    run: async ctx => { await ctx.g.makeTokens(TK.limitRebelR, ctx.you); },
  }, {
    on: 'beginCombat', desc: 'Attach Equipment to Rebel', filter: (g, self, data) => data.player === self.ctrl,
    targets: [
      T.permanent((g, card, ctrl) => card.ctrl === ctrl && card.hasSub('Equipment'), {
        upTo: true, prompt: 'Equipment to attach', aiHint: { goal: 'equipBest' },
      }),
      T.yourCreature({ prompt: 'Rebel to equip', aiHint: { goal: 'buff' },
        filter: (g, card, ctrl) => card.ctrl === ctrl && card.hasSub('Rebel') }),
    ],
    run: async ctx => { if (ctx.targets[0] && ctx.targets[1]) await ctx.g.attach(ctx.targets[0], ctx.targets[1]); },
  }] };

  SC['Cait Sith, Fortune Teller'] = { triggers: [{
    on: 'beginCombat', desc: 'Lucky Slots', filter: (g, self, data) => data.player === self.ctrl && self.ctrl.library.length > 0,
    run: async ctx => {
      await E.scry(ctx.g, ctx.you, 1);
      const card = await exileTopPlayable(ctx.g, ctx.you, ctx.src);
      if (!card) return;
      ctx.g.queueTrigger({
        src: ctx.src, ctrl: ctx.you, name: 'Lucky Slots power', data: { card, mv: card.mv },
        targets: [T.yourCreature({ prompt: `Creature gets +${card.mv}/+0`, aiHint: { goal: 'buff' } })],
        run: async powerCtx => {
          if (powerCtx.targets[0]?.zone === 'battlefield') E.pumpUntilEOT(powerCtx.g, powerCtx.targets[0], powerCtx.data.mv, 0);
        },
      });
    },
  }] };

  SC['Heidegger, Shinra Executive'] = { triggers: [{
    on: 'beginCombat', desc: 'Soldier power', filter: (g, self, data) => data.player === self.ctrl,
    targets: [T.yourCreature({ prompt: 'Creature gets +X/+0', aiHint: { goal: 'buff' } })],
    run: async ctx => {
      const n = ctx.g.creatures(ctx.you).filter(card => card.hasSub('Soldier')).length;
      if (ctx.targets[0]) E.pumpUntilEOT(ctx.g, ctx.targets[0], n, 0);
    },
  }, {
    on: 'endStep', desc: 'Create Soldiers', filter: (g, self, data) => data.player === self.ctrl,
    run: async ctx => {
      const mine = ctx.g.creatures(ctx.you).length;
      const n = ctx.g.alivePlayers().filter(player => player !== ctx.you && ctx.g.creatures(player).length > mine).length;
      if (n) await ctx.g.makeTokens(TK.limitSoldierW, ctx.you, { n });
    },
  }] };

  SC['Tifa, Martial Artist'] = { triggers: [{
    on: 'beginCombat', desc: 'Remember combat phase', filter: (g, self, data) => data.player === self.ctrl,
    run: async ctx => {
      if (ctx.src.meta.tifaCombatTurn !== ctx.g.turnNo) {
        ctx.src.meta.tifaCombatTurn = ctx.g.turnNo; ctx.src.meta.tifaCombatNumber = 1;
      } else ctx.src.meta.tifaCombatNumber++;
    },
  }, {
    on: 'attacks', desc: 'Melee', filter: attacksSelf,
    run: async ctx => {
      const attacked = new Set((ctx.g.combat?.attackers || []).filter(card => card.ctrl === ctx.you)
        .map(defendingPlayer).filter(player => player && player !== ctx.you));
      if (attacked.size) E.pumpUntilEOT(ctx.g, ctx.src, attacked.size, attacked.size);
    },
  }, {
    on: 'combatDamageGroupToPlayer', desc: 'Untap and additional combat',
    filter: (g, self, data) => data.hits.some(hit => hit.card.ctrl === self.ctrl && hit.card.power >= 7),
    run: async ctx => {
      for (const card of ctx.g.creatures(ctx.you)) card.tapped = false;
      if (ctx.src.meta.tifaCombatTurn === ctx.g.turnNo && ctx.src.meta.tifaCombatNumber === 1 &&
        ctx.src.meta.tifaExtraCombatTurn !== ctx.g.turnNo) {
        ctx.src.meta.tifaExtraCombatTurn = ctx.g.turnNo; ctx.g.scheduleAdditionalCombat();
      }
    },
  }] };

  SC['Bronze Guardian'] = {
    ward: { mana: '{2}' },
    cdaPower: (g, self) => g.bf().filter(card => card.ctrl === self.ctrl && card.is('Artifact')).length,
    statics: [{ apply: (g, self, bf) => {
      for (const card of bf) if (card !== self && card.ctrl === self.ctrl && card.is('Artifact')) card.cur.wardCost = { mana: '{2}' };
    } }],
  };

  SC['Sephiroth, Fallen Hero'] = {
    triggers: [{
      on: 'attacks', desc: 'Jenova Cells', filter: attacksSelf,
      targets: [T.creature({ upTo: true, prompt: 'Up to one creature gets a cell counter', aiHint: { goal: 'buff' } })],
      run: async ctx => {
        if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], 'cell', 1, false, ctx.you);
        const modified = ctx.g.creatures(ctx.you).filter(card => ctx.g.isModifiedCreature(card));
        basePTUntilEOT(ctx.g, modified, 7, 5, 'jenovaCells');
      },
    }],
    gyAbility: {
      label: 'The Reunion', cost: '{3}', sorcery: false, exileSelf: false,
      extraCost: { sac: (g, card) => g.isModifiedCreature(card), sacN: 1 },
      run: async ctx => { if (ctx.src.zone === 'graveyard') await ctx.g.move(ctx.src, 'battlefield', { ctrl: ctx.you, tapped: true }); },
    },
  };

  SC['Hellkite Tyrant'] = { triggers: [{
    on: 'combatDamageToPlayer', desc: 'Steal artifacts', filter: (g, self, data) => data.card === self,
    run: async ctx => {
      for (const card of ctx.g.bf().filter(card => card.ctrl === ctx.data.player && card.is('Artifact'))) card.ctrl = ctx.you;
      ctx.g.recalc();
    },
  }, {
    on: 'upkeep', desc: 'Twenty artifacts win',
    filter: (g, self, data) => data.player === self.ctrl && g.bf().filter(card => card.ctrl === self.ctrl && card.is('Artifact')).length >= 20,
    run: async ctx => { ctx.g.gameOver = true; ctx.g.winner = ctx.you; ctx.g.lg(`${ctx.you.name} wins with Hellkite Tyrant!`); },
  }] };

  SC['Summon: Kujata'] = {
    saga: [{
      targets: [T.creature({ count: 2, min: 0, upTo: true, prompt: 'Up to two creatures for Lightning', aiHint: { goal: 'removal' } })],
      run: async ctx => { for (const card of flat(ctx.targets[0])) await ctx.g.damageCreature(ctx.src, card, 3); },
    }, {
      targets: [T.creature({ count: 3, min: 0, upTo: true, prompt: 'Up to three creatures cannot block', aiHint: { goal: 'evasion' } })],
      run: async ctx => {
        const ids = flat(ctx.targets[0]).map(card => ({ iid: card.iid, timestamp: card.timestamp }));
        ctx.g.untilEffects.push({ expires: 'eot', kind: 'kujataIce', apply: (g, bf) => {
          for (const id of ids) { const card = bf.find(item => item.iid === id.iid && item.timestamp === id.timestamp); if (card) card.cur.cantBlock = true; }
        } });
        ctx.g.recalc();
      },
    }, {
      run: async ctx => {
        const discarded = await discardOne(ctx.g, ctx.you, ctx.src);
        await ctx.g.draw(ctx.you, 2);
        if (discarded) ctx.g.queueTrigger({
          src: ctx.src, ctrl: ctx.you, name: 'Fire damage from discarded card', data: { mv: discarded.mv },
          run: async fireCtx => {
            for (const player of fireCtx.g.alivePlayers()) if (player !== fireCtx.you) {
              await fireCtx.g.damagePlayer(fireCtx.src, player, fireCtx.data.mv);
            }
          },
        });
      },
    }],
    triggers: [{
      on: 'precombatMain', desc: 'Saga chapter', filter: (g, self, data) => data.player === self.ctrl,
      run: async ctx => { await ctx.g.sagaChapter(ctx.src); },
    }],
  };

  SC["Cloud's Limit Break"] = {
    modes: { pick: 1, aiHint: { kind: 'mode', goal: 'removal' }, list: [{
      label: 'Cross-Slash — {0}', tierCost: '{0}',
      targets: [T.creature({ prompt: 'Destroy target tapped creature', aiHint: { goal: 'removal' },
        filter: (g, card) => card.zone === 'battlefield' && card.is('Creature') && card.tapped })],
    }, {
      label: 'Blade Beam — {1}', tierCost: '{1}',
      targets: [T.creature({ count: 999, min: 0, upTo: true, distinctCtrl: true,
        prompt: 'Tapped creatures with different controllers', aiHint: { goal: 'removal' },
        filter: (g, card) => card.zone === 'battlefield' && card.is('Creature') && card.tapped })],
    }, {
      label: 'Omnislash — {3}{W}', tierCost: '{3}{W}',
    }] },
    resolve: async ctx => {
      const mode = (ctx.mode || [0])[0];
      if (mode === 0 && ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]);
      else if (mode === 1) await ctx.g.destroyMany(flat(ctx.targets[0]));
      else if (mode === 2) await ctx.g.destroyMany(ctx.g.creatures().filter(card => card.tapped));
    },
  };

  SC['Ultimate Magic: Holy'] = {
    foretell: { cost: '{2}{W}' },
    resolve: async ctx => {
      for (const card of ctx.g.bf().filter(card => card.ctrl === ctx.you)) E.grantUntilEOT(ctx.g, card, ['indestructible']);
      if (ctx.so.from === 'exile') {
        ctx.g.untilEffects.push({ kind: 'preventToPlayer', who: ctx.you, expires: 'eot', srcIid: ctx.src.iid });
      }
    },
  };

  SC["Lifestream's Blessing"] = {
    foretell: { cost: '{4}{G}' },
    prepareTargets: async ctx => {
      ctx.so.lifestreamX = Math.max(0, ...ctx.g.creatures(ctx.you).map(card => card.power));
    },
    resolve: async ctx => {
      const x = Math.max(0, ctx.so.lifestreamX || 0);
      await ctx.g.draw(ctx.you, x);
      if (ctx.so.from === 'exile' && x) await ctx.g.gainLife(ctx.you, 2 * x, ctx.src);
    },
  };

  SC['Secret Rendezvous'] = {
    targets: [T.opponent({ prompt: 'Opponent draws three with you', aiHint: { goal: 'gift' } })],
    resolve: async ctx => {
      await ctx.g.draw(ctx.you, 3);
      if (ctx.targets[0] && !ctx.targets[0].lost) await ctx.g.draw(ctx.targets[0], 3);
    },
  };

  SC['Unfinished Business'] = {
    targets: [{
      zone: 'graveyard', what: 'card', prompt: 'Creature to return', aiHint: { goal: 'recursion' },
      filter: (g, card, ctrl) => card.owner === ctrl && card.is('Creature'),
    }, {
      zone: 'graveyard', what: 'card', count: 2, min: 0, upTo: true,
      prompt: 'Up to two Auras and/or Equipment to attach', aiHint: { kind: 'gyRecur' },
      filter: (g, card, ctrl) => card.owner === ctrl && (card.hasSub('Aura') || card.hasSub('Equipment')),
    }],
    resolve: async ctx => {
      const creature = ctx.targets[0]; if (!creature || creature.zone !== 'graveyard') return;
      await ctx.g.move(creature, 'battlefield', { ctrl: ctx.you });
      if (creature.zone !== 'battlefield') return;
      for (const card of flat(ctx.targets[1])) {
        if (card.zone !== 'graveyard') continue;
        if (card.hasSub('Aura')) {
          const spec = card.def.auraTarget?.[0];
          if (!spec || !ctx.g.legalTargets(spec, card, ctx.you).includes(creature)) continue;
        }
        await ctx.g.move(card, 'battlefield', { ctrl: ctx.you });
        if (card.zone === 'battlefield') await ctx.g.attach(card, creature);
      }
    },
  };

  SC['Ultimate Magic: Meteor'] = {
    foretell: { cost: '{5}{R}' },
    resolve: async ctx => {
      for (const card of ctx.g.creatures().slice()) await ctx.g.damageCreature(ctx.src, card, 7, { deferSBA: true });
      await ctx.g.checkSBA();
      if (ctx.so.from !== 'exile') return;
      const chosen = [];
      for (const opponent of ctx.g.alivePlayers().filter(player => player !== ctx.you)) {
        const pool = ctx.g.bf().filter(card => card.ctrl === opponent && (card.is('Artifact') || card.is('Land')));
        const pick = await chooseCards(ctx.g, ctx.you, pool, pool.length ? 1 : 0, 1,
          `Meteor: choose an artifact or land controlled by ${opponent.name}`, { kind: 'bestRemoval' });
        if (pick[0]) chosen.push(pick[0]);
      }
      await ctx.g.destroyMany(chosen);
    },
  };

  SC['Colossus Hammer'] = equipmentScript('{8}', (g, self, host) => {
    host.cur.power += 10; host.cur.toughness += 10; host.cur.kw.delete('flying');
  });

  SC["Explorer's Scope"] = equipmentScript('{1}', null, { triggers: [{
    on: 'attacks', desc: 'Explore top land', filter: (g, self, data) => self.attachedTo === data.card.iid,
    run: async ctx => {
      const top = ctx.you.library.at(-1); if (!top || !top.is('Land')) return;
      const use = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseOption', prompt: `Explorer's Scope: put ${top.name} onto the battlefield tapped?`,
        options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
        aiHint: { kind: 'putLand', card: top, tapped: true },
      });
      if (use === 'yes' && top.zone === 'library') await ctx.g.move(top, 'battlefield', { ctrl: ctx.you, tapped: true });
    },
  }] });

  SC['Conformer Shuriken'] = equipmentScript('{2}', null, { triggers: [{
    on: 'attacks', desc: 'Tap blocker and conform',
    controller: (g, self, data) => data.card.ctrl,
    filter: (g, self, data) => self.attachedTo === data.card.iid,
    targets: (g, self, data) => {
      const defender = defendingPlayer(data.card);
      return [T.creature({
        prompt: 'Creature defending player controls', aiHint: { goal: 'tapDown' },
        filter: (g2, card) => card.zone === 'battlefield' && card.is('Creature') && card.ctrl === defender,
      })];
    },
    prepareTargets: async ctx => {
      const host = ctx.g.byIid(ctx.src.attachedTo);
      if (!host) return false;
      ctx.shurikenHost = { iid: host.iid, timestamp: host.timestamp, power: host.power };
    },
    run: async ctx => {
      const target = ctx.targets[0]; if (!target) return; ctx.g.tap(target);
      const host = ctx.g.byIid(ctx.shurikenHost.iid);
      if (!host || host.zone !== 'battlefield' || host.timestamp !== ctx.shurikenHost.timestamp) return;
      const diff = Math.max(0, target.power - host.power);
      if (diff) ctx.g.addCounters(host, '+1/+1', diff, false, ctx.you);
    },
  }] });

  SC["Conqueror's Flail"] = equipmentScript('{2}', (g, self, host) => {
    const colors = new Set(g.bf().filter(card => card.ctrl === self.ctrl).flatMap(card => card.colors || []));
    host.cur.power += colors.size; host.cur.toughness += colors.size;
  }, { oppCantCastYourTurn: (g, self) => !!self.attachedTo });

  SC["Hero's Heirloom"] = equipmentScript('{2}', (g, self, host) => {
    host.cur.power += 2; host.cur.toughness += 1;
    if (legendary(host)) { host.cur.kw.add('trample'); host.cur.kw.add('haste'); }
  });

  SC['Mask of Memory'] = equipmentScript('{1}', null, { triggers: [{
    on: 'combatDamageToPlayer', opt: true, desc: 'Draw two, discard one',
    filter: (g, self, data) => self.attachedTo === data.card.iid,
    controller: (g, self, data) => data.card.ctrl,
    run: async ctx => {
      await ctx.g.draw(ctx.you, 2);
      if (ctx.you.hand.length) {
        const picked = await chooseCards(ctx.g, ctx.you, ctx.you.hand, 1, 1, 'Mask of Memory: discard a card', { kind: 'discard' });
        if (picked[0]) await ctx.g.discard(ctx.you, picked);
      }
    },
  }] });

  SC['Sword of the Animist'] = equipmentScript('{2}', (g, self, host) => {
    host.cur.power += 1; host.cur.toughness += 1;
  }, { triggers: [{
    on: 'attacks', opt: true, desc: 'Search a basic land tapped', filter: (g, self, data) => self.attachedTo === data.card.iid,
    controller: (g, self, data) => data.card.ctrl,
    run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 1, tapped: true }); },
  }] });

  SC['Wrecking Ball Arm'] = equipmentScript('{7}', (g, self, host) => {
    const powerMod = host.cur.power - host.cur.basePower;
    const toughnessMod = host.cur.toughness - host.cur.baseToughness;
    host.cur.basePower = 7; host.cur.baseToughness = 7;
    host.cur.power = 7 + powerMod; host.cur.toughness = 7 + toughnessMod;
    const previous = host.cur.cantBeBlockedBy;
    host.cur.cantBeBlockedBy = (game, blocker) => (previous && previous(game, blocker)) || blocker.power <= 2;
  }, { equipAlt: { cost: '{3}', filter: card => legendary(card) } });

  SC['Behemoth Sledge'] = equipmentScript('{3}', (g, self, host) => {
    host.cur.power += 2; host.cur.toughness += 2; host.cur.kw.add('trample'); host.cur.kw.add('lifelink');
  });

  SC["Champion's Helm"] = equipmentScript('{1}', (g, self, host) => {
    host.cur.power += 2; host.cur.toughness += 2; if (legendary(host)) host.cur.kw.add('hexproof');
  });

  SC['Darksteel Plate'] = equipmentScript('{2}', (g, self, host) => { host.cur.kw.add('indestructible'); }, {
    kws: ['indestructible'],
  });

  SC['Summoning Materia'] = equipmentScript('{2}', (g, self, host) => {
    host.cur.power += 2; host.cur.toughness += 2; host.cur.kw.add('vigilance');
    host.cur.extraMana.push({ cost: { tap: true }, produce: [{ G: 1 }] });
  }, {
    revealOwnTop: true,
    playTop: (g, self, top) => !!self.attachedTo && top.is('Creature'),
  });

  SC['Furious Rise'] = { triggers: [{
    on: 'endStep', desc: 'Exile top until the next Rise card',
    filter: (g, self, data) => data.player === self.ctrl && g.creatures(self.ctrl).some(card => card.power >= 4) && self.ctrl.library.length > 0,
    run: async ctx => {
      const sourceKey = `${ctx.src.iid}:${ctx.src.timestamp}`;
      for (const card of ctx.you.exile) if (card.meta.furiousRiseSource === sourceKey) {
        delete card.meta.playableBy; delete card.meta.playableUntil; delete card.meta.furiousRiseSource;
      }
      const card = ctx.you.library.at(-1); if (!card) return;
      await ctx.g.move(card, 'exile');
      allowExilePlay(card, ctx.you, Number.MAX_SAFE_INTEGER, { furiousRiseSource: sourceKey });
    },
  }] };

  SC['SOLDIER Military Program'] = { triggers: [{
    on: 'beginCombat', desc: 'SOLDIER program', filter: (g, self, data) => data.player === self.ctrl,
    prepareTargets: async ctx => {
      const hasCommander = ctx.g.bf().some(card => card.ctrl === ctx.you && card.commander);
      const options = [
        { key: 'token', label: 'Create a 1/1 Soldier' },
        { key: 'counters', label: 'Counters on up to two Soldiers' },
      ];
      const chosen = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseMulti', prompt: 'SOLDIER Military Program: choose one; with a commander you may choose both',
        options, min: 1, max: hasCommander ? 2 : 1, aiHint: { kind: 'modes', card: ctx.src },
      });
      if (!Array.isArray(chosen) || chosen.length < 1 || chosen.length > (hasCommander ? 2 : 1) ||
        chosen.some(key => !options.some(option => option.key === key))) return false;
      ctx.programModes = [...new Set(chosen)];
      if (ctx.programModes.includes('counters')) {
        const soldiers = ctx.g.creatures(ctx.you).filter(card => card.hasSub('Soldier'));
        ctx.programSoldiers = await chooseCards(ctx.g, ctx.you, soldiers, 0, 2,
          'SOLDIER Military Program: up to two Soldiers', { kind: 'counterTargets', src: ctx.src });
      }
    },
    run: async ctx => {
      if (ctx.programModes.includes('token')) await ctx.g.makeTokens(TK.limitSoldierW, ctx.you);
      if (ctx.programModes.includes('counters')) for (const card of ctx.programSoldiers || []) {
        if (card.zone === 'battlefield' && card.ctrl === ctx.you && card.hasSub('Soldier')) {
          ctx.g.addCounters(card, '+1/+1', 1, false, ctx.you);
        }
      }
    },
  }] };

  SC.Brushland = { producesColors: ['G', 'W'], mana: [
    { cost: { tap: true }, produce: [{ C: 1 }] },
    { cost: { tap: true }, produce: [{ G: 1 }, { W: 1 }], onProduce: async (g, card, player) => { await g.damagePlayer(card, player, 1); } },
  ] };

  SC['Fire-Lit Thicket'] = { producesColors: ['G', 'R'], mana: [
    { cost: { tap: true }, produce: [{ C: 1 }] },
    { manual: true, cost: { mana: '{R/G}', tap: true }, produce: [{ R: 2 }, { R: 1, G: 1 }, { G: 2 }] },
  ] };

  SC['Sacred Peaks'] = {
    entersTapped: true, producesColors: ['R', 'W'],
    mana: { cost: { tap: true }, produce: [{ R: 1 }, { W: 1 }] },
  };
})();
