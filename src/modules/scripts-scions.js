// ===== scripts-scions.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// SCIONS & SPELLCRAFT (FIC) — commander: Y'shtola, Night's Blessed
// Esper spellslinger: noncreature spellovi drenaju i vuku.
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS;
  const etbSelf = (g, self, d) => d.card === self;
  const mvOf = (card) => U.mv(card.def.cost || '');
  const grantUnblockableUntilEOT = (g, card) => {
    const iid = card.iid, timestamp = card.timestamp;
    g.untilEffects.push({
      expires: 'eot', kind: 'unblockable',
      apply: (g2, bf) => {
        const current = bf.find(candidate => candidate.iid === iid && candidate.timestamp === timestamp);
        if (current) current.cur.unblockable = true;
      },
    });
    g.recalc();
  };
  const castGraveyardCard = async (g, player, card, free) => {
    if (!card || card.zone !== 'graveyard') return false;
    const cast = await g.castSpell(player, card, { from: 'graveyard', free: !!free, exileAfter: true });
    if (cast && card.zone === 'stack') {
      card.meta = card.meta || {};
      card.meta.exileIfStackLeaves = true;
    }
    return cast;
  };
  const partnerWith = otherName => ({
    on: 'etb', desc: `Partner with ${otherName}`, filter: etbSelf,
    targets: [T.player({ prompt: `Who may search for ${otherName}?`, aiHint: { goal: 'gift' } })],
    run: async ctx => {
      const player = ctx.targets[0];
      if (!player) return;
      const card = player.library.find(candidate => candidate.name === otherName);
      let use = 'no';
      if (card) {
        use = await player.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Partner with: put ${otherName} into hand?`,
          options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
          aiHint: { kind: 'partnerSearch', card },
        });
      }
      if (card && use === 'yes') {
        player.library.splice(player.library.indexOf(card), 1);
        card.zone = 'hand'; player.hand.push(card);
        ctx.g.lg(`${otherName} goes to ${player.name}'s hand.`);
      }
      U.shuffle(player.library, ctx.g.rnd);
    },
  });

  SC['Y\'shtola, Night\'s Blessed'] = {
    triggers: [{
      on: 'castNonCreature', desc: 'Drain 2 / +2 life',
      filter: (g, self, d) => d.player === self.ctrl && d.card && mvOf(d.card) >= 3,
      run: async ctx => {
        await ctx.g.damageOpponents(ctx.src, ctx.you, 2, { deferSBA: true });
        await ctx.g.gainLife(ctx.you, 2);
        await ctx.g.checkSBA();
      },
    }, {
      on: 'endStep', desc: 'Someone lost 4+ life → draw',
      filter: (g, self, d) => g.players.some(p => (p.turnState && p.turnState.lifeLost >= 4)),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };

  SC['Lyse Hext'] = {
    costMods: [(g, self, info) =>
      info.player === self.ctrl && info.card && !info.card.is('Creature') ? -1 : 0],
    statics: [{
      apply: (g, self) => {
        if ((self.ctrl.turnState.nonCreatureSpells || 0) >= 2) self.cur.kw.add('double strike');
      },
    }],
  };

  SC['G\'raha Tia, Scion Reborn'] = {
    triggers: [{
      on: 'castNonCreature', desc: 'Pay X life: Hero with X counters', opt: true, oncePerTurn: true,
      aiHint: { kind: 'scionsHeroLife' },
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const x = ctx.data.card ? mvOf(ctx.data.card) : 0;
        if (!x || ctx.you.life <= x) return;
        await ctx.g.loseLife(ctx.you, x, "G'raha Tia");
        const made = await ctx.g.makeTokens('hero11', ctx.you);
        if (made[0]) ctx.g.addCounters(made[0], '+1/+1', x);
      },
    }],
  };

  SC['Papalymo Totolymo'] = {
    triggers: [{
      on: 'castNonCreature', desc: '1 damage to everyone / +1 life',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        await ctx.g.damageOpponents(ctx.src, ctx.you, 1);
        await ctx.g.gainLife(ctx.you, 1);
      },
    }],
    abilities: [{
      label: 'Opponents who lost life sacrifice their strongest creature',
      cost: { mana: '{4}', tap: true, sacSelf: true },
      cond: (g, c, p) => E.eachOpp(g, p).some(opponent => opponent.turnState.lifeLost && g.creatures(opponent).length),
      aiScore: (g, c, p) => E.eachOpp(g, p).reduce((score, opponent) => {
        if (!opponent.turnState.lifeLost) return score;
        return score + Math.max(0, ...g.creatures(opponent).map(creature => creature.power));
      }, 0),
      run: async ctx => {
        for (const opponent of E.eachOpp(ctx.g, ctx.you)) {
          if (!opponent.turnState.lifeLost) continue;
          const creatures = ctx.g.creatures(opponent);
          if (!creatures.length) continue;
          const greatest = Math.max(...creatures.map(c => c.power));
          const choices = creatures.filter(c => c.power === greatest);
          const picked = await opponent.controller.decide(ctx.g, {
            type: 'chooseCards', from: choices, min: 1, max: 1,
            prompt: 'Papalymo: sacrifice the creature with the greatest power', aiHint: { kind: 'forcedSac' },
          });
          if (picked[0]) await ctx.g.sacrifice(opponent, picked[0]);
        }
      },
    }],
  };

  SC['Hermes, Overseer of Elpis'] = {
    triggers: [{
      on: 'castNonCreature', desc: 'Bird token',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.makeTokens('birdU', ctx.you); },
    }, {
      on: 'attackersDeclared', desc: 'Scry 2 for Birds',
      filter: (g, self, d) => d.player === self.ctrl && d.attackers.some(a => a.hasSub('Bird')),
      run: async ctx => { await E.scry(ctx.g, ctx.you, 2); },
    }],
  };

  SC['Estinien Varlineau'] = {
    triggers: [
      {
        on: 'castNonCreature', desc: 'Counter + flying',
        filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); E.grantUntilEOT(ctx.g, ctx.src, ['flying']); },
      },
      {
        on: 'postcombatMain', desc: 'Cards for opponents dealt damage',
        filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          const opponents = new Set((ctx.you.turnState.combatDamageHits || [])
            .filter(hit => hit.ctrl === ctx.you && (hit.card === ctx.src || hit.card.hasSub('Dragon')))
            .map(hit => hit.player));
          const x = opponents.size;
          if (x) { await ctx.g.draw(ctx.you, x); await ctx.g.loseLife(ctx.you, x, 'Estinien'); }
        },
      },
    ],
  };

  SC['Fandaniel, Telophoroi Ascian'] = {
    triggers: [
      {
        on: 'castIS', desc: 'Surveil 1',
        filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { await E.surveil(ctx.g, ctx.you, 1); },
      },
      {
        on: 'endStep', desc: 'Sacrifice or life loss',
        filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          const count = ctx.you.graveyard.filter(card => card.is('Instant') || card.is('Sorcery')).length;
          for (const opponent of E.eachOpp(ctx.g, ctx.you)) {
            const creatures = ctx.g.creatures(opponent).filter(card => !card.isToken);
            let sacrifice = false;
            if (creatures.length) {
              sacrifice = await opponent.controller.decide(ctx.g, {
                type: 'chooseOption', prompt: `Fandaniel: sacrifice a nontoken creature or lose ${2 * count} life?`,
                options: [{ key: 'sac', label: 'Sacrifice' }, { key: 'life', label: 'Lose life' }],
                aiHint: { kind: 'fandanielChoice', lifeLoss: 2 * count, candidates: creatures },
              }) === 'sac';
            }
            if (sacrifice) {
              const picked = await opponent.controller.decide(ctx.g, {
                type: 'chooseCards', from: creatures, min: 1, max: 1, prompt: 'Sacrifice a nontoken creature', aiHint: { kind: 'forcedSac' },
              });
              if (picked[0]) await ctx.g.sacrifice(opponent, picked[0]);
            } else if (count) await ctx.g.loseLife(opponent, 2 * count, 'Fandaniel');
          }
        },
      },
    ],
  };

  SC['Thancred Waters'] = {
    triggers: [
      {
        on: 'etb', desc: 'Royal Guard', filter: etbSelf,
        targets: [{
          what: 'permanent', prompt: 'Another legendary permanent', aiHint: { goal: 'protect' },
          filter: (g, card, ctrl, source) => card.zone === 'battlefield' && card.ctrl === ctrl && card !== source &&
            (card.cur.super || []).includes('Legendary'),
        }],
        run: async ctx => {
          const target = ctx.targets[0];
          if (!target || target === ctx.src) return;
          const sourceIid = ctx.src.iid, sourceTimestamp = ctx.src.timestamp;
          const targetIid = target.iid, targetTimestamp = target.timestamp, controller = ctx.you;
          ctx.g.untilEffects.push({
            expires: 'never', kind: 'thancredGuard',
            apply: (g2, bf) => {
              const source = bf.find(c => c.iid === sourceIid && c.timestamp === sourceTimestamp);
              const protectedPermanent = bf.find(c => c.iid === targetIid && c.timestamp === targetTimestamp);
              if (source && source.ctrl === controller && protectedPermanent) protectedPermanent.cur.kw.add('indestructible');
            },
          });
          ctx.g.recalc();
        },
      },
      {
        on: 'castNonCreature', desc: 'Indestructible',
        filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { E.grantUntilEOT(ctx.g, ctx.src, ['indestructible']); },
      },
    ],
  };

  SC['Hraesvelgr of the First Brood'] = {
    triggers: [{
      on: 'etb', desc: 'Shiva\'s Aid', filter: etbSelf,
      targets: [T.creature({ prompt: "+1/+0 and can't be blocked", aiHint: { goal: 'buff' } })],
      run: async ctx => { if (ctx.targets[0]) { E.pumpUntilEOT(ctx.g, ctx.targets[0], 1, 0); grantUnblockableUntilEOT(ctx.g, ctx.targets[0]); } },
    }, {
      on: 'castNonCreature', desc: 'Shiva\'s Aid',
      filter: (g, self, d) => d.player === self.ctrl,
      targets: [T.creature({ prompt: "+1/+0 and can't be blocked", aiHint: { goal: 'buff' } })],
      run: async ctx => { if (ctx.targets[0]) { E.pumpUntilEOT(ctx.g, ctx.targets[0], 1, 0); grantUnblockableUntilEOT(ctx.g, ctx.targets[0]); } },
    }],
  };

  SC['Baleful Strix'] = {
    triggers: [{ on: 'etb', desc: 'Draw a card', filter: etbSelf, run: async ctx => { await ctx.g.draw(ctx.you, 1); } }],
  };

  SC['Authority of the Consuls'] = {
    opponentsCreaturesEnterTapped: true,
    triggers: [{
      on: 'etb', desc: '+1 life',
      filter: (g, self, d) => d.card.ctrl !== self.ctrl && d.card.is('Creature'),
      run: async ctx => { await ctx.g.gainLife(ctx.you, 1); },
    }],
  };

  SC['Torrential Gearhulk'] = {
    triggers: [{
      on: 'etb', desc: 'Cast an instant from the graveyard',
      filter: (g, self, d) => etbSelf(g, self, d) && self.ctrl.graveyard.some(card => card.is('Instant')),
      opt: true, aiHint: { kind: 'scionsGraveCast', free: true },
      targets: [{
        zone: 'graveyard', what: 'card', prompt: 'Cast an instant for free', aiHint: { kind: 'freeCast' },
        filter: (g, card, ctrl) => card.owner === ctrl && card.zone === 'graveyard' && card.is('Instant'),
      }],
      run: async ctx => {
        const card = ctx.targets[0];
        if (card) await castGraveyardCard(ctx.g, ctx.you, card, true);
      },
    }],
  };

  SC['Vindicate'] = {
    targets: [T.permanent(null, { prompt: 'Destroy', aiHint: { goal: 'removal' } })],
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
  };
  SC['Void Rend'] = {
    uncounterable: true,
    targets: [T.permanent((g, c) => !c.is('Land'), { prompt: 'Destroy', aiHint: { goal: 'removal' } })],
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
  };
  SC['Snuff Out'] = {
    altCosts: [{
      label: 'Pay 4 life instead of the mana cost', altCostStr: '{0}', lifeCost: 4,
      cond: (g, p) => p.life >= 4 && g.lands(p).some(land => land.hasSub('Swamp')),
    }],
    targets: [T.permanent((g, c) => c.is('Creature') && !c.colors.includes('B'), { prompt: 'Destroy (nonblack)', aiHint: { goal: 'removal' } })],
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0], { noRegen: true }); },
  };
  SC['Final Judgment'] = {
    resolve: async ctx => { await ctx.g.exileMany(ctx.g.bf().filter(card => card.is('Creature'))); },
  };
  SC['Crux of Fate'] = {
    modes: {
      pick: 1, aiHint: { kind: 'scionsWipe' },
      list: [
        { label: 'Destroy all Dragons', aiMeta: { destroyKind: 'dragons' } },
        { label: 'Destroy all non-Dragons', aiMeta: { destroyKind: 'nondragons' } },
      ],
    },
    resolve: async ctx => {
      const dragons = (ctx.mode || [0])[0] === 0;
      await ctx.g.destroyMany(ctx.g.bf().filter(card => card.is('Creature') && card.hasSub('Dragon') === dragons));
    },
  };
  SC['Into the Story'] = {
    selfCostAdjust: (g, card, p) => g.players.some(o => o !== p && o.graveyard.length >= 7) ? -3 : 0,
    resolve: async ctx => { await ctx.g.draw(ctx.you, 4); },
  };
  SC['Exsanguinate'] = SC['Exsanguinate'] || {
    resolve: async ctx => {
      const x = (ctx.src && ctx.src.castMeta && ctx.src.castMeta.x) || 0;
      const tot = await ctx.g.loseLifeOpponents(ctx.src, ctx.you, x, 'Exsanguinate');
      if (tot) await ctx.g.gainLife(ctx.you, tot);
    },
  };
  SC['Transpose'] = {
    rebound: true,
    resolve: async ctx => {
      await E.mayDrawDiscard(ctx.g, ctx.you, 1, 1);
      await ctx.g.loseLife(ctx.you, 1, 'Transpose');
      if (ctx.so && ctx.so.from === 'hand') await ctx.g.makeTokens('wizard01', ctx.you);
    },
  };
  SC['Tataru Taru'] = {
    triggers: [{
      on: 'etb', desc: 'Draw; an opponent may draw', filter: etbSelf,
      targets: [T.opponent({ prompt: 'Which opponent may draw?', aiHint: { goal: 'gift' } })],
      run: async ctx => {
        await ctx.g.draw(ctx.you, 1);
        const opponent = ctx.targets[0];
        if (!opponent) return;
        const yes = await opponent.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Tataru Taru — ${opponent.name}, do you want to draw a card?`,
          options: [{ key: 'yes', label: 'Yes, draw' }, { key: 'no', label: 'No' }],
          aiHint: { kind: 'tataruDraw', source: ctx.src },
        });
        if (yes === 'yes') await ctx.g.draw(opponent, 1);
      },
    }, {
      on: 'draw', desc: "Treasure for an opponent's draw outside their turn", oncePerTurn: true,
      filter: (g, self, d) => d.player && d.player !== self.ctrl && g.turnPlayer !== d.player,
      run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you, { tapped: true }); },
    }],
  };
  SC['Krile Baldesion'] = {
    triggers: [{
      on: 'castNonCreature', desc: 'Return a creature with the same MV', opt: true, oncePerTurn: true,
      filter: (g, self, d) => d.player === self.ctrl && self.ctrl.graveyard.some(card =>
        card.is('Creature') && mvOf(card) === (d.card ? mvOf(d.card) : -1)),
      targets: (g, self, d) => [{
        zone: 'graveyard', what: 'card', prompt: 'Return a creature with the same mana value', aiHint: { kind: 'gyRecur' },
        filter: (g2, card, ctrl) => card.owner === ctrl && card.zone === 'graveyard' && card.is('Creature') &&
          mvOf(card) === (d.card ? mvOf(d.card) : -1),
      }],
      run: async ctx => {
        const card = ctx.targets[0];
        if (card && card.zone === 'graveyard') await ctx.g.move(card, 'hand');
      },
    }],
  };
  SC['Ardbert, Warrior of Darkness'] = {
    triggers: [
      {
        on: 'cast', desc: 'White spell → counters and vigilance',
        filter: (g, self, d) => d.player === self.ctrl && d.card && d.card.colors.includes('W'),
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) if ((c.def.super || []).includes('Legendary')) {
            ctx.g.addCounters(c, '+1/+1', 1); E.grantUntilEOT(ctx.g, c, ['vigilance']);
          }
        },
      },
      {
        on: 'cast', desc: 'Black spell → counters and menace',
        filter: (g, self, d) => d.player === self.ctrl && d.card && d.card.colors.includes('B'),
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) if ((c.def.super || []).includes('Legendary')) {
            ctx.g.addCounters(c, '+1/+1', 1); E.grantUntilEOT(ctx.g, c, ['menace']);
          }
        },
      },
    ],
  };

  // ============================================================
  // Job select oprema: ETB napravi 1/1 Hero i sama se zakači na njega.
  // ============================================================
  const jobSelect = {
    on: 'etb', desc: 'Job select: Hero + attach', filter: etbSelf,
    run: async ctx => {
      const made = await ctx.g.makeTokens('hero11', ctx.you);
      if (!made.length) return;
      let hero = made[0];
      if (made.length > 1) {
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: made, min: 1, max: 1,
          prompt: 'Job select: which Hero token gets the Equipment?', aiHint: { kind: 'attach' },
        });
        if (picked[0]) hero = picked[0];
      }
      await ctx.g.attach(ctx.src, hero);
    },
  };
  const addType = (host, t) => { if (!host.cur.subtypes.includes(t)) host.cur.subtypes.push(t); };
  const rememberEquippedHost = async ctx => {
    const host = ctx.src.attachedTo && ctx.g.byIid(ctx.src.attachedTo);
    if (!host || host.zone !== 'battlefield') return false;
    ctx.hostIid = host.iid;
    ctx.hostTimestamp = host.timestamp;
    return true;
  };
  const counterRememberedHost = async ctx => {
    const host = ctx.g.byIid(ctx.hostIid);
    // Trigger prati creature objekat koji je bio opremljen u trenutku
    // okidanja. Premještanje Equipmenta u odgovoru ne mijenja primaoca, a
    // blink/reanimacija hosta pravi novi objekat koji više nije isti primalac.
    if (host && host.zone === 'battlefield' && host.timestamp === ctx.hostTimestamp) {
      ctx.g.addCounters(host, '+1/+1', 1);
    }
  };

  SC["Astrologian's Planisphere"] = {
    equip: '{2}',
    triggers: [jobSelect, {
      on: 'castNonCreature', desc: 'Counter on the equipped creature',
      filter: (g, self, d) => d.player === self.ctrl && self.attachedTo,
      prepareTargets: rememberEquippedHost,
      run: counterRememberedHost,
    }, {
      on: 'draw', desc: 'Third card: counter on the equipped creature',
      filter: (g, self, d) => d.player === self.ctrl && d.nth === 3 && self.attachedTo,
      prepareTargets: rememberEquippedHost,
      run: counterRememberedHost,
    }],
    attachGrant: (g, self, host) => { addType(host, 'Wizard'); },
  };

  SC["Blue Mage's Cane"] = {
    equip: '{2}',
    triggers: [jobSelect, {
      on: 'attacks', desc: "Exile and copy the defending player's instant or sorcery",
      filter: (g, self, d) => {
        if (!self.attachedTo || d.card.iid !== self.attachedTo) return false;
        const defender = d.card.attacking instanceof MTG.Player ? d.card.attacking : d.card.attacking && d.card.attacking.ctrl;
        return !!defender;
      },
      targets: (g, self, d) => {
        const defender = d.card.attacking instanceof MTG.Player ? d.card.attacking : d.card.attacking && d.card.attacking.ctrl;
        return [{
          zone: 'graveyard', what: 'card', anyGraveyard: true, upTo: true,
          prompt: "Up to one instant/sorcery from the defending player's graveyard", aiHint: { kind: 'freeCast' },
          filter: (g2, card) => card.owner === defender && card.zone === 'graveyard' && (card.is('Instant') || card.is('Sorcery')),
        }];
      },
      run: async ctx => {
        const card = ctx.targets[0];
        if (!card || card.zone !== 'graveyard') return;
        await ctx.g.exileCard(card);
        const copy = new MTG.CardInst(card.def, ctx.you);
        copy.isCopySpell = true;
        copy.zone = 'copyspace';
        const alt = { altCostStr: '{3}', speed: 'instant' };
        const cost = ctx.g.spellCost(ctx.you, copy, alt);
        if (!ctx.g.canPayMana(ctx.you, cost, { card: copy })) return;
        const use = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Blue Mage's Cane: cast a copy of ${card.name} for {3}?`,
          options: [{ key: 'yes', label: 'Yes — pay {3}' }, { key: 'no', label: 'No' }],
          aiHint: { kind: 'scionsCastCopy', card, mana: 3 },
        });
        if (use === 'yes') await ctx.g.castSpell(ctx.you, copy, { from: 'copy', alt });
      },
    }],
    attachGrant: (g, self, host) => { host.cur.toughness += 2; addType(host, 'Wizard'); },
  };

  SC["Dancer's Chakrams"] = {
    equip: '{3}',
    triggers: [jobSelect],
    attachGrant: (g, self, host) => {
      host.cur.power += 2; host.cur.toughness += 2; host.cur.kw.add('lifelink');
      addType(host, 'Performer');
      for (const c of g.bf()) {
        if (c.ctrl !== self.ctrl || c === host || !c.commander || !c.is('Creature')) continue;
        c.cur.power += 2; c.cur.toughness += 2; c.cur.kw.add('lifelink');
      }
    },
  };

  SC["Sage's Nouliths"] = {
    equip: '{3}',
    triggers: [jobSelect, {
      on: 'attacks', desc: 'Untap attacker',
      filter: (g, self, d) => self.attachedTo && d.card.iid === self.attachedTo,
      targets: [T.yourCreature({
        prompt: 'Untap target attacking creature', aiHint: { goal: 'untap' },
        filter: (g, card, ctrl) => card.ctrl === ctrl && !!card.attacking,
      })],
      run: async ctx => { if (ctx.targets[0]) ctx.targets[0].tapped = false; },
    }],
    attachGrant: (g, self, host) => { host.cur.power += 1; addType(host, 'Cleric'); },
  };

  SC["Reaper's Scythe"] = {
    equip: '{2}',
    triggers: [jobSelect, {
      on: 'endStep', desc: 'Soul counters',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const n = ctx.g.players.filter(p => (p.turnState && p.turnState.lifeLost > 0)).length;
        if (n) ctx.g.addCounters(ctx.src, 'soul', n);
      },
    }],
    attachGrant: (g, self, host) => {
      const n = self.counters['soul'] || 0;
      host.cur.power += n; host.cur.toughness += n;
      addType(host, 'Assassin');
    },
  };

  // ============================================================
  // Ostatak Scions & Spellcraft
  // ============================================================
  SC['Alisaie Leveilleur'] = {
    // Dualcast — drugi spell svakog poteza košta {2} manje
    costMods: [(g, self, info) => (info.player === self.ctrl && info.player.turnState.spellsCast === 1) ? -2 : 0],
    triggers: [partnerWith('Alphinaud Leveilleur')],
  };

  SC['Alphinaud Leveilleur'] = {
    triggers: [partnerWith('Alisaie Leveilleur'), {
      on: 'castSecond', desc: 'Eukrasia: draw',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };

  SC["Archaeomancer's Map"] = {
    triggers: [{
      on: 'etb', desc: 'Two Plains cards to hand', filter: etbSelf,
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 2, toHand: true, filter: d => (d.subtypes || []).includes('Plains') }); },
    }, {
      on: 'etb', desc: 'Land from hand (catch-up)', opt: true,
      filter: (g, self, d) => d.card.is('Land') && d.card.ctrl !== self.ctrl &&
        g.lands(d.card.ctrl).length > g.lands(self.ctrl).length &&
        self.ctrl.hand.some(c => c.is('Land')),
      run: async ctx => {
        const cands = ctx.you.hand.filter(c => c.is('Land'));
        if (!cands.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Land onto the battlefield:', aiHint: { kind: 'landDrop' } });
        if (pick[0]) await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you });
      },
    }],
  };

  SC['Champions from Beyond'] = {
    triggers: [{
      on: 'etb', desc: 'X Hero tokens', filter: etbSelf,
      run: async ctx => {
        const x = (ctx.src.castMeta && ctx.src.castMeta.x) || 0;
        if (x) await ctx.g.makeTokens('hero11', ctx.you, { n: x });
      },
    }, {
      on: 'attackersDeclared', desc: 'Light Party: scry 2 + draw',
      filter: (g, self, d) => d.player === self.ctrl && d.attackers.length >= 4,
      run: async ctx => { await E.scry(ctx.g, ctx.you, 2); await ctx.g.draw(ctx.you, 1); },
    }, {
      on: 'attackersDeclared', desc: 'Full Party: +4/+4',
      filter: (g, self, d) => d.player === self.ctrl && d.attackers.length >= 8,
      run: async ctx => { for (const a of ctx.data.attackers) E.pumpUntilEOT(ctx.g, a, 4, 4); },
    }],
  };

  SC['Circle of Power'] = {
    resolve: async ctx => {
      await ctx.g.draw(ctx.you, 2);
      await ctx.g.loseLife(ctx.you, 2, 'Circle of Power');
      await ctx.g.makeTokens('wizard01', ctx.you);
      for (const c of ctx.g.creatures(ctx.you)) if (c.hasSub('Wizard')) E.pumpUntilEOT(ctx.g, c, 1, 0, ['lifelink']);
    },
  };

  SC['Emet-Selch of the Third Seat'] = {
    // spellovi iz groblja koštaju {2} manje
    costMods: [(g, self, info) => {
      if (info.player !== self.ctrl) return 0;
      return (info.castOpts && info.castOpts.from === 'graveyard') ? -2 : 0;
    }],
    triggers: [{
      on: 'lifeLost', desc: 'Cast an instant or sorcery from the graveyard', opt: true, oncePerTurn: true,
      aiHint: { kind: 'scionsGraveCast', free: false },
      filter: (g, self, d) => d.player && d.player !== self.ctrl &&
        self.ctrl.graveyard.some(card => card.is('Instant') || card.is('Sorcery')),
      targets: [{
        zone: 'graveyard', what: 'card', prompt: 'Cast an instant or sorcery from the graveyard', aiHint: { kind: 'gyRecur' },
        filter: (g, card, ctrl) => card.owner === ctrl && card.zone === 'graveyard' && (card.is('Instant') || card.is('Sorcery')),
      }],
      run: async ctx => {
        const card = ctx.targets[0];
        if (card) await castGraveyardCard(ctx.g, ctx.you, card, false);
      },
    }],
  };

  SC['Eye of Nidhogg'] = {
    auraTarget: [T.creature({ prompt: 'Enchant a creature', aiHint: { goal: 'aura' } })],
    statics: [{
      phase: 1,
      apply: (g, self) => {
        const host = self.attachedTo && g.byIid(self.attachedTo);
        if (!host || host.zone !== 'battlefield') return;
        host.cur.basePower = 4; host.cur.baseToughness = 2;
        host.cur.colors = ['B']; host.cur.subtypes = ['Dragon'];
      },
    }],
    attachGrant: (g, self, host) => {
      host.cur.kw.add('flying'); host.cur.kw.add('deathtouch');
      host.cur.goadedBy = (host.cur.goadedBy || []).concat([self.ctrl]);
    },
    triggers: [{
      on: 'lto', zone: 'self', desc: 'Return to hand',
      filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const c = ctx.src;
        if (c.zone === 'graveyard') { ctx.g.remove(c); c.zone = 'hand'; c.owner.hand.push(c); ctx.g.lg('Eye of Nidhogg returns to hand.'); }
      },
    }],
  };

  SC['Hildibrand Manderville'] = {
    statics: [{
      apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.isToken && c.is('Creature')) { c.cur.power++; c.cur.toughness++; } },
    }],
    triggers: [{
      on: 'dies', desc: 'Adventure from the graveyard', filter: (g, self, d) => d.card === self,
      run: async ctx => { ctx.src.meta.adventureFromGraveUntilOwnTurn = ctx.you.turnsStarted + 1; },
    }],
    adventure: {
      name: "Gentleman's Rise", cost: '{2}{W}', types: 'Instant', speed: 'instant', altCostStr: '{2}{W}',
      resolve: async ctx => { await ctx.g.makeTokens('hero11', ctx.you, { n: 2 }); },
    },
  };

  SC['Murderous Rider'] = {
    triggers: [{
      on: 'dies', desc: 'To the bottom of the library', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const c = ctx.src;
        if (c.zone !== 'graveyard') return;
        ctx.g.remove(c); c.zone = 'library'; c.owner.library.unshift(c);
        ctx.g.lg('Murderous Rider goes to the bottom of the library.');
      },
    }],
    adventure: {
      name: 'Swift End', cost: '{1}{B}{B}', types: 'Instant', speed: 'instant', altCostStr: '{1}{B}{B}',
      targets: [T.permanent((g, c) => c.is('Creature') || c.is('Planeswalker'), { prompt: 'Destroy', aiHint: { goal: 'removal' } })],
      resolve: async ctx => {
        if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]);
        await ctx.g.loseLife(ctx.you, 2, 'Swift End');
      },
    },
  };

  SC['Observed Stasis'] = {
    auraTarget: [T.oppCreature({ prompt: "Enchant an opponent's creature", aiHint: { goal: 'pacify' } })],
    statics: [{
      phase: 1,
      apply: (g, self) => {
        const host = self.attachedTo && g.byIid(self.attachedTo);
        if (!host || host.zone !== 'battlefield') return;
        host.cur.abilitiesDisabled = true;
        host.cur.activationDisabled = true;
      },
    }],
    attachGrant: (g, self, host) => {
      host.cur.kw.clear();
      host.cur.cantAttack = true; host.cur.cantBlock = true;
      host.cur.extraAbilities = [];
      host.cur.abilitiesDisabled = true; host.cur.activationDisabled = true;
    },
    triggers: [{
      on: 'attached', desc: 'Remove from combat + draw', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const h = ctx.g.byIid(ctx.src.attachedTo);
        if (!h) return;
        h.attacking = null; h.blocking = null; h.blockedBy = [];
        if (ctx.g.combat) ctx.g.combat.attackers = ctx.g.combat.attackers.filter(a => a !== h);
        const n = ctx.g.bf().filter(c => c.ctrl === h.ctrl && c.is('Creature') && c.tapped).length;
        if (n) await ctx.g.draw(ctx.you, n);
      },
    }],
  };

  SC['Sublime Epiphany'] = {
    modes: {
      pick: 'any', min: 1,
      list: [
        { label: 'Counter spell', targets: [T.spell(null, { prompt: 'Counter a spell', aiHint: { goal: 'counter' } })] },
        { label: 'Counter ability', targets: [T.ability(null, { prompt: 'Counter an activated or triggered ability', aiHint: { goal: 'counter' } })] },
        { label: 'Return a nonland permanent to hand', targets: [T.permanent((g, c) => !c.is('Land'), { prompt: 'Return to hand', aiHint: { goal: 'bounce' } })] },
        { label: 'Token copy of your creature', targets: [T.yourCreature({ prompt: 'Copy', aiHint: { goal: 'copy' } })] },
        { label: 'A player draws a card', targets: [T.player({ prompt: 'Who draws a card' })] },
      ],
    },
    resolve: async ctx => {
      const modes = ctx.mode || [];
      for (let i = 0; i < modes.length; i++) {
        const raw = ctx.targets[i];
        const t = Array.isArray(raw) ? raw[0] : raw;
        if (!t) continue;
        if (modes[i] === 0) {
          await ctx.g.counterStackObject(t, { source: ctx.src, message: `Sublime Epiphany counters ${t.name || 'the spell'}.` });
        }
        else if (modes[i] === 1) {
          await ctx.g.counterStackObject(t, { source: ctx.src, ignoreUncounterable: true, message: `Sublime Epiphany counters ${t.name || 'the ability'}.` });
        }
        else if (modes[i] === 2) { if (t.zone === 'battlefield') { await ctx.g.move(t, 'hand'); ctx.g.lg(`${t.name} returned to hand.`); } }
        else if (modes[i] === 3) { if (t.zone === 'battlefield') await ctx.g.copyPermanentToken(t, ctx.you, {}); }
        else if (modes[i] === 4) { await ctx.g.draw(t, 1); }
      }
    },
  };

  SC['Summon: Good King Mog XII'] = {
    saga: [
      { run: async ctx => { await ctx.g.makeTokens('moogle12', ctx.you, { n: 2 }); } },
      { run: async ctx => { ctx.src.meta.mogCopyThroughTurnsStarted = ctx.you.turnsStarted + 1; } },
      { run: async ctx => { ctx.src.meta.mogCopyThroughTurnsStarted = ctx.you.turnsStarted + 1; } },
      { run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src && c.hasSub('Moogle')) ctx.g.addCounters(c, '+1/+1', 2); } },
    ],
    triggers: [{
      on: 'castNonCreature', desc: 'II–III: copy a token',
      filter: (g, self, d) => d.player === self.ctrl &&
        self.meta.mogCopyThroughTurnsStarted !== undefined && self.ctrl.turnsStarted < self.meta.mogCopyThroughTurnsStarted,
      run: async ctx => {
        const toks = ctx.g.bf().filter(c => c.ctrl === ctx.you && c.isToken && !c.hasSub('Saga'));
        if (!toks.length) return;
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: toks, min: 1, max: 1,
          prompt: 'Good King Mog: copy a non-Saga token', aiHint: { kind: 'scionsCopyToken' },
        });
        if (picked[0]) await ctx.g.copyPermanentToken(picked[0], ctx.you, {});
      },
    }],
  };

  SC['Urianger Augurelt'] = {
    triggers: [{
      on: 'cast', desc: '+2 life for a spell from exile',
      filter: (g, self, d) => d.player === self.ctrl && d.so && d.so.from === 'exile',
      run: async ctx => { await ctx.g.gainLife(ctx.you, 2); },
    }, {
      on: 'landPlayed', desc: '+2 life for a land from exile',
      filter: (g, self, d) => d.player === self.ctrl && d.from === 'exile',
      run: async ctx => { await ctx.g.gainLife(ctx.you, 2); },
    }],
    abilities: [{
      label: 'Draw Arcanum: exile the top card', cost: { tap: true },
      cond: (g, c, p) => p.library.length > 0,
      aiScore: (g, c, p) => p.library.length ? 1.8 : -100,
      run: async ctx => {
        const card = ctx.you.library[ctx.you.library.length - 1];
        if (!card) return;
        const use = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Urianger: exile the top card of the library face down?',
          options: [{ key: 'yes', label: 'Yes — exile' }, { key: 'no', label: 'No — leave it' }],
          aiHint: { kind: 'uriangerExileTop', card },
        });
        if (use !== 'yes') return;
        ctx.you.library.pop();
        card.zone = 'exile'; card.faceDown = true;
        card.meta = card.meta || {}; card.meta.revealedTo = [ctx.you.idx];
        ctx.you.exile.push(card);
        ctx.src.meta.arc = (ctx.src.meta.arc || []).concat([card.iid]);
        ctx.g.lg('Urianger exiles the top card of the library.');
      },
    }, {
      label: 'Play Arcanum: play exiled cards until end of turn', cost: { tap: true },
      cond: (g, c, p) => {
        const ids = c.meta.arc || [];
        return p.exile.some(card => ids.includes(card.iid));
      },
      aiScore: (g, c, p) => (c.meta.arc || []).filter(iid => p.exile.some(card => card.iid === iid)).length * 3,
      run: async ctx => {
        const ids = ctx.src.meta.arc || [];
        const cands = ctx.you.exile.filter(c => ids.includes(c.iid));
        if (!cands.length) { ctx.g.lg('Urianger: no exiled cards.'); return; }
        for (const card of cands) {
          card.meta = card.meta || {};
          card.meta.playableBy = ctx.you;
          card.meta.playableUntil = ctx.g.turnNo;
        }
        // Jedna dozvola pokriva sve povezane karte i svaki spell castan na taj
        // način dobija zasebno {2} smanjenje do cleanup koraka.
        ctx.you.tempReductions = ctx.you.tempReductions || [];
        ctx.you.tempReductions.push({ filter: (g, card) => ids.includes(card.iid) && card.zone === 'exile', delta: -2 });
        ctx.g.lg(`Urianger allows playing ${cands.length} Arcanum ${U.plural(cands.length, 'card', 'cards')} until end of turn.`);
      },
    }],
  };

  SC['White Auracite'] = {
    mana: { cost: { tap: true }, produce: [{ W: 1 }] },
    triggers: [{
      on: 'etb', desc: "Exile an opponent's permanent", filter: etbSelf,
      targets: [T.permanent((g, c, ctrl) => c.ctrl !== ctrl && !c.is('Land'), { prompt: 'Exile until Auracite leaves', aiHint: { goal: 'removal' } })],
      prepareTargets: async ctx => { ctx.sourceTimestamp = ctx.src.timestamp; },
      run: async ctx => {
        const t = ctx.targets[0]; if (!t) return;
        const sourceTimestamp = ctx.sourceTimestamp;
        if (ctx.src.zone !== 'battlefield' || ctx.src.timestamp !== sourceTimestamp) return;
        // NE u card.meta: move() briše meta prije nego lto okine, pa bismo
        // izgubili trag šta treba vratiti. Držimo mapu na igri.
        ctx.g._auracite = ctx.g._auracite || {};
        ctx.g._auracite[ctx.src.iid] = { targetIid: t.iid, sourceTimestamp };
        await ctx.g.exileCard(t);
      },
    }, {
      on: 'lto', zone: 'self', desc: 'Return the exiled card',
      filter: (g, self, d) => d.card === self && g._auracite && g._auracite[self.iid] &&
        g._auracite[self.iid].sourceTimestamp === d.snap.timestamp,
      run: async ctx => {
        const iid = ctx.g._auracite[ctx.src.iid].targetIid;
        delete ctx.g._auracite[ctx.src.iid];
        for (const p of ctx.g.players) {
          const c = p.exile.find(x => x.iid === iid);
          if (!c) continue;
          await ctx.g.move(c, 'battlefield', { ctrl: c.owner });
          ctx.g.lg(`White Auracite returns ${c.name}.`);
          break;
        }
      },
    }],
  };
  // Adventure polovina je bila u bazi (def.alt), ali bez `adventure` bloka nikad
  // nije bila ponuđena — karta je igrala kao goli 2/1 letač.
  SC['Hypnotic Sprite'] = {
    kws: ['flying'],
    adventure: {
      name: 'Mesmeric Glare', cost: '{2}{U}', types: 'Instant',
      targets: [T.spell((g, so) => so.card && U.mv(so.card.def.cost || '', so.x || 0) <= 3,
        { prompt: 'Counter a spell with MV ≤ 3', aiHint: { goal: 'counter' } })],
      resolve: async ctx => {
        const so = ctx.targets[0], g = ctx.g;
        if (!so || !g.stack.includes(so) || MTG.isUncounterable(g, so)) return;
        await g.counterStackObject(so, { source: ctx.src, message: `${so.name} is countered by Mesmeric Glare.` });
      },
    },
  };
})();
