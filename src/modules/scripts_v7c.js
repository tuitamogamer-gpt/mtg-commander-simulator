// ===== scripts_v7c.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// v7c — MOST WANTED (OTC) + ELVEN COUNCIL (LTC)
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS, E7 = MTG.E7;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const etbSelf = (g, self, d) => d.card === self;
  const isOutlaw = E7.isOutlaw;
  const partnerWith = otherName => ({
    on: 'etb', desc: `Partner with ${otherName}`, filter: etbSelf,
    targets: [T.player({ prompt: `Who may search for ${otherName}?`, aiHint: { goal: 'gift' } })],
    run: async ctx => {
      const player = ctx.targets[0];
      if (!player) return;
      const card = player.library.find(candidate => candidate.name === otherName);
      if (card) {
        const use = await player.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Partner with: put ${otherName} into hand?`,
          options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
          aiHint: { kind: 'partnerSearch', card },
        });
        if (use === 'yes') {
          player.library.splice(player.library.indexOf(card), 1);
          card.zone = 'hand'; player.hand.push(card);
          ctx.g.lg(`${otherName} goes to ${player.name}'s hand.`);
        }
      }
      U.shuffle(player.library, ctx.g.rnd);
    },
  });

  // ============================================================
  // MOST WANTED (OTC) — commander: Olivia, Opulent Outlaw
  // ============================================================
  SC['Olivia, Opulent Outlaw'] = {
    triggers: [{
      on: 'combatDamageGroupToPlayer', desc: 'Treasure',
      filter: (g, self, d) => (d.cards || []).some(card => card.ctrl === self.ctrl && isOutlaw(card)),
      run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
    }],
    abilities: [{
      label: 'Two +1/+1 counters on each creature (sac 2 Treasures)', sorcery: true,
      cost: { mana: '{3}', sac: (g, x, c) => x.hasSub('Treasure'), sacN: 2 },
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) ctx.g.addCounters(c, '+1/+1', 2); },
      aiScore: (g, c, p) => g.creatures(p).length >= 3 ? 6 : 2,
    }],
  };
  SC['Aetherborn Marauder'] = {
    triggers: [{
      on: 'etb', desc: 'Move any number of +1/+1 counters', filter: etbSelf,
      run: async ctx => {
        const pool = ctx.g.bf().filter(card => card.ctrl === ctx.you && card !== ctx.src &&
          (card.counters['+1/+1'] || 0) > 0);
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 0, max: pool.length,
          prompt: 'Aetherborn Marauder: move counters from:',
          aiHint: { kind: 'aetherbornSources', src: ctx.src },
        });
        let moved = 0;
        for (const card of picked || []) {
          const available = card.counters['+1/+1'] || 0;
          if (!available) continue;
          const n = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseX', min: 1, max: available, card,
            prompt: `${card.name}: how many +1/+1 counters do you move?`,
            aiHint: { kind: 'moveCounters', source: card, counterKind: '+1/+1' },
          });
          const amount = Math.max(1, Math.min(available, Number(n) || 1));
          ctx.g.removeCounters(card, '+1/+1', amount);
          moved += amount;
        }
        if (moved) ctx.g.addCounters(ctx.src, '+1/+1', moved);
      },
    }],
  };
  SC['Angelic Sell-Sword'] = {
    triggers: [
      {
        on: 'etb', desc: 'Mercenary',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.is('Creature') && !d.card.isToken && (d.card === self || d.card !== self),
        run: async ctx => { if (!ctx.data.card.isToken) await ctx.g.makeTokens('mercenaryR', ctx.you); },
      },
      {
        on: 'attacks', desc: 'Draw (power 6+)', filter: (g, self, d) => d.card === self && self.power >= 6,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };
  SC["Angrath's Marauders"] = {
    replace: [{
      event: 'damage',
      applies: (g, ev, self) => !!ev.src && ev.src.ctrl === self.ctrl,
      run: (g, ev, src) => {
        const s = ev.src;
        if (s && ((s.ctrl && s.ctrl === src.ctrl) || s === src)) return ev.n * 2;
        return ev.n;
      },
    }],
  };
  SC['Breena, the Demagogue'] = {
    triggers: [{
      on: 'attackedPlayer', desc: 'Card + counters',
      filter: (g, self, d) => d.defender !== self.ctrl && E.eachOpp(g, self.ctrl).includes(d.defender) &&
        E.eachOpp(g, self.ctrl).some(other => other !== d.defender && d.defender.life > other.life),
      onlyIf: (g, self, d) => d.player && !d.player.lost && d.defender && !d.defender.lost &&
        E.eachOpp(g, self.ctrl).some(other => other !== d.defender && d.defender.life > other.life),
      run: async ctx => {
        if (!ctx.data.defender || ctx.data.defender.lost ||
          !E.eachOpp(ctx.g, ctx.you).some(other => other !== ctx.data.defender && ctx.data.defender.life > other.life)) return;
        const attacker = ctx.data.player;
        if (attacker && !attacker.lost) await ctx.g.draw(attacker, 1);
        const mine = ctx.g.creatures(ctx.you);
        if (mine.length) {
          const pick = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: mine, min: 1, max: 1, prompt: 'Breena: 2× +1/+1 on:', aiHint: { kind: 'buffPick' },
          });
          if (pick[0]) ctx.g.addCounters(pick[0], '+1/+1', 2);
        }
      },
    }],
  };
  SC['Captain Lannery Storm'] = {
    triggers: [
      { on: 'attacks', desc: 'Treasure', filter: (g, self, d) => d.card === self, run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); } },
      {
        on: 'sacrificed', desc: '+1/+0', filter: (g, self, d) => d.player === self.ctrl && d.card.hasSub && d.card.hasSub('Treasure'),
        run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, 1, 0); },
      },
    ],
  };
  SC['Captivating Crew'] = {
    abilities: [{
      label: 'Steal a creature (EOT)', sorcery: true, cost: { mana: '{3}{R}' },
      targets: [T.oppCreature({ prompt: 'Steal', aiHint: { goal: 'steal' } })],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t) return;
        const orig = t.ctrl;
        t.ctrl = ctx.you; t.tapped = false; t.meta.tempHaste = true;
        ctx.g.lg(`${ctx.you.name} steals ${t.name} until end of turn!`);
        ctx.g.recalc();
        const iid = t.iid;
        ctx.g.delayed.push({
          on: 'endStep', name: 'Return the stolen creature', ctrl: ctx.you,
          run: async c2 => {
            const x = c2.g.byIid(iid);
            if (x && x.zone === 'battlefield') { x.ctrl = orig; x.meta.tempHaste = false; c2.g.recalc(); c2.g.lg(`${x.name} returns.`); }
          },
        });
      },
      aiScore: (g, c, p) => {
        const best = g.bf().filter(x => x.is('Creature') && x.ctrl !== p).sort((a, b) => b.power - a.power)[0];
        return best && best.power >= 4 && (g.phase === 'main1') ? 6 : 0.5;
      },
    }],
  };
  SC['Changeling Outcast'] = {
    statics: [{
      apply: (g, self, bf) => { self.cur.allCreatureTypes = true; self.cur.cantBlock = true; self.cur.unblockable = true; },
    }],
  };
  SC['Charred Graverobber'] = {
    escape: { cost: '{3}{B}', altCostStr: '{3}{B}', exileN: 4, speed: 'sorcery' },
    escapeCounters: 1,
    triggers: [{
      on: 'etb', desc: 'Outlaw from graveyard', filter: etbSelf,
      targets: [{
        zone: 'graveyard', what: 'card', prompt: 'Target an outlaw card in your graveyard',
        filter: (g, card) => isOutlaw(card), aiHint: { goal: 'recur' },
      }],
      run: async ctx => {
        const card = ctx.targets[0];
        if (card && card.zone === 'graveyard') {
          ctx.g.remove(card); card.zone = 'hand'; card.owner.hand.push(card);
        }
      },
    }],
  };
  SC['Dire Fleet Daredevil'] = {
    triggers: [{
      on: 'etb', desc: 'Steal an instant or sorcery from a graveyard', filter: etbSelf,
      targets: [{
        zone: 'graveyard', anyGraveyard: true, what: 'card',
        prompt: "Target an opponent's instant or sorcery",
        filter: (g, card, ctrl) => card.owner !== ctrl && (card.is('Instant') || card.is('Sorcery')),
        aiHint: { goal: 'recur' },
      }],
      run: async ctx => {
        const card = ctx.targets[0];
        if (!card || card.zone !== 'graveyard') return;
        await ctx.g.move(card, 'exile');
        card.meta.playableBy = ctx.you;
        card.meta.playableUntil = ctx.g.turnNo;
        card.meta.anyColor = true;
        card.meta.exileAfterPlay = true;
        ctx.g.lg(`${ctx.you.name} may cast ${card.name} until end of turn.`);
      },
    }],
  };
  SC['Dire Fleet Ravager'] = {
    triggers: [{
      on: 'etb', desc: 'Everyone loses a third', filter: etbSelf,
      run: async ctx => {
        for (const q of ctx.g.alivePlayers()) await ctx.g.loseLife(q, Math.ceil(q.life / 3), 'ravager');
      },
    }],
  };
  SC['Fain, the Broker'] = {
    abilities: [
      {
        label: 'Sac creature: 2× +1/+1', cost: { tap: true, sacCreature: true, sacOther: true },
        targets: [T.creature({ prompt: '2× +1/+1', aiHint: { goal: 'buff' } })],
        run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 2); },
        aiScore: () => 0.4,
      },
      {
        label: 'Remove a counter: Treasure', cost: { tap: true, removeCounterFromCreature: true },
        run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
        aiScore: () => 1.5,
      },
      {
        label: 'Sac artifact: Inkling', cost: { tap: true, sac: (g, x, c) => x.is('Artifact') },
        run: async ctx => { await ctx.g.makeTokens('inkling', ctx.you); },
        aiScore: () => 0.5,
      },
      {
        label: 'Untap', cost: { mana: '{3}{B}' },
        cond: (g, c) => c.tapped,
        run: async ctx => { ctx.src.tapped = false; },
        aiScore: () => 0.3,
      },
    ],
  };
  SC["Graywater's Fixer"] = {
    grantsGraveyardAbility: {
      filter: (g, source, card, p) => card.is('Creature') && isOutlaw(card),
      make: (g, source, card, p) => ({
        label: `Encore {${card.mv}}`, sorcery: true, cost: `{${card.mv}}`,
        run: async ctx => {
          const c = ctx.src;
        const madeAll = [];
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          const made = await ctx.g.copyPermanentToken(c, ctx.you, { haste: true, attacking: ctx.g.combat ? o : undefined });
          for (const m of made) m.meta.mustAttackPlayer = o;
          madeAll.push(...made);
        }
        E7.sacAtNextEnd(ctx.g, madeAll, ctx.you);
        ctx.g.lg(`Encore: ${c.name} ×${madeAll.length}!`);
        },
        aiScore: (g2, c2) => c2.mv <= 4 ? 4 : 0.5,
      }),
    },
  };
  SC['Humble Defector'] = {
    abilities: [{
      label: 'Draw 2, give one to an opponent', cost: { tap: true },
      cond: (g, c, p) => g.turnPlayer === p,
      targets: [T.opponent({ prompt: 'Who gets Humble Defector?', aiHint: { goal: 'gift' } })],
      run: async ctx => {
        await ctx.g.draw(ctx.you, 2);
        const o = ctx.targets[0];
        if (o) { ctx.src.ctrl = o; ctx.g.recalc(); ctx.g.lg(`Humble Defector goes to ${o.name}.`); }
      },
      aiScore: () => 3,
    }],
  };
  SC['Impulsive Pilferer'] = {
    triggers: [{
      on: 'dies', desc: 'Treasure', filter: (g, self, d) => d.card === self,
      run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
    }],
    gyAbility: {
      label: 'Encore {3}{R}', cost: '{3}{R}', sorcery: true,
      run: async ctx => {
        const madeAll = [];
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          const made = await ctx.g.copyPermanentToken(ctx.src, ctx.you, { haste: true });
          for (const token of made) token.meta.mustAttackPlayer = o;
          madeAll.push(...made);
        }
        E7.sacAtNextEnd(ctx.g, madeAll, ctx.you);
        ctx.g.lg(`Encore: Impulsive Pilferer ×${madeAll.length}.`);
      },
    },
  };
  SC['Kamber, the Plunderer'] = {
    triggers: [
      partnerWith('Laurine, the Diversion'),
      {
        on: 'dies', desc: '+1 life and Blood', filter: (g, self, d) => d.snap.ctrl !== self.ctrl && d.snap.types.includes('Creature'),
        run: async ctx => { await ctx.g.gainLife(ctx.you, 1); await ctx.g.makeTokens('blood', ctx.you); },
      },
    ],
  };
  SC['Laurine, the Diversion'] = {
    triggers: [partnerWith('Kamber, the Plunderer')],
    abilities: [{
      label: 'Sac: goad', cost: { mana: '{2}', sac: (g, x, c) => (x.is('Artifact') || x.is('Creature')) && x !== c },
      targets: [T.oppCreature({ prompt: 'Goad', aiHint: { goal: 'goad' } })],
      run: async ctx => { if (ctx.targets[0]) E.goad(ctx.g, ctx.targets[0], ctx.you); },
      aiScore: (g, c, p) => g.bf().some(x => x.is('Creature') && x.ctrl !== p && x.power >= 5) ? 3 : 0.5,
    }],
  };
  SC['Mari, the Killing Quill'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) {
          if (c.ctrl === self.ctrl && c.is('Creature') && (c.hasSub('Assassin') || c.hasSub('Mercenary') || c.hasSub('Rogue'))) c.cur.kw.add('deathtouch');
        }
      },
    }],
    triggers: [
      {
        on: 'dies', desc: 'Exile + hit counter', filter: (g, self, d) => d.snap.ctrl !== self.ctrl && d.snap.types.includes('Creature'),
        run: async ctx => {
          const c = ctx.data.card;
          if (c.zone === 'graveyard' && !c.isToken) {
            c.owner.graveyard.splice(c.owner.graveyard.indexOf(c), 1);
            c.zone = 'exile'; c.owner.exile.push(c);
            c.counters = c.counters || {}; ctx.g.addCounters(c, 'hit', 1);
            ctx.g.lg(`Mari exiles ${c.name} (hit counter).`);
          }
        },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Hit → card + 2 Treasures',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && (d.card.hasSub('Assassin') || d.card.hasSub('Mercenary') || d.card.hasSub('Rogue')),
        run: async ctx => {
          const victim = ctx.data.player;
          if (!victim) return;
          const pool = victim.exile.filter(card => (card.counters && card.counters.hit || 0) > 0);
          const picked = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: pool, min: 0, max: 1,
            prompt: 'Mari: remove a hit counter?', aiHint: { kind: 'mariHit' },
          });
          const hit = picked[0];
          if (hit && pool.includes(hit)) {
            ctx.g.removeCounters(hit, 'hit', 1);
            await ctx.g.draw(ctx.you, 1);
            await ctx.g.makeTokens('treasure', ctx.you, { n: 2 });
          }
        },
      },
    ],
  };
  SC['Marshland Bloodcaster'] = {
    abilities: [{
      label: 'Pay life for the next spell', cost: { tap: true, mana: '{1}{B}' },
      run: async ctx => {
        ctx.you.bloodcasterAlternative = { turn: ctx.g.turnNo, source: ctx.src.iid };
        ctx.g.lg('Bloodcaster: pay life for the next spell (mv).');
      },
      aiScore: (g, c, p) => p.hand.some(x => x.mv >= 5) && p.life > 15 ? 5 : 0.2,
    }],
  };
  SC['Mirror Entity'] = {
    statics: [{ apply: (g, self) => { self.cur.allCreatureTypes = true; } }],
    abilities: [{
      label: 'X: all become X/X', xCost: true, cost: { mana: '{X}' },
      run: async ctx => {
        const chosenX = ctx.x || 0;
        for (const c of ctx.g.creatures(ctx.you)) {
          const iid = c.iid;
          ctx.g.untilEffects.push({
            expires: 'eot', kind: 'mirror',
            apply: (g2, bf) => {
              const x = bf.find(y => y.iid === iid);
              if (x) {
                const powerDelta = chosenX - x.cur.basePower;
                const toughnessDelta = chosenX - x.cur.baseToughness;
                x.cur.basePower = chosenX;
                x.cur.baseToughness = chosenX;
                x.cur.power += powerDelta;
                x.cur.toughness += toughnessDelta;
                x.cur.allCreatureTypes = true;
                x.cur.allCreatureTypesFromOtherEffects = true;
              }
            },
          });
        }
        ctx.g.recalc();
      },
      aiScore: (g, c, p) => g.creatures(p).filter(x => x.power < 3).length >= 3 ? 4 : 0.3,
    }],
  };
  SC['Misfortune Teller'] = {
    triggers: [
      {
        on: 'etb', desc: 'Exile from graveyard', filter: etbSelf,
        targets: [misfortuneTarget()], run: async ctx => { await misfortune(ctx); },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Exile from graveyard', filter: (g, self, d) => d.card === self,
        targets: [misfortuneTarget()], run: async ctx => { await misfortune(ctx); },
      },
    ],
  };
  function misfortuneTarget() {
    return {
      zone: 'graveyard', anyGraveyard: true, what: 'card', prompt: 'Target a card in a graveyard',
      aiHint: { goal: 'gyHate' },
    };
  }
  async function misfortune(ctx) {
    const c = ctx.targets[0];
    if (!c || c.zone !== 'graveyard') return;
    await ctx.g.move(c, 'exile');
    if (c.is('Creature')) await ctx.g.makeTokens('rogue22', ctx.you);
    else if (c.is('Land')) await ctx.g.makeTokens('treasure', ctx.you);
    else await ctx.g.gainLife(ctx.you, 3);
  }
  SC['Mistmeadow Skulk'] = {
    statics: [{
      apply: (g, self) => {
        self.cur.protectionFrom.push((g2, source) => source.mv >= 3);
      },
    }],
  };
  SC['Nighthawk Scavenger'] = {
    cdaPower: (g, c) => {
      const types = new Set();
      for (const o of E.eachOpp(g, c.ctrl)) for (const x of o.graveyard) for (const t of x.def.types) types.add(t);
      return 1 + types.size;
    },
  };
  SC['Ogre Slumlord'] = {
    triggers: [{
      // "Whenever ANOTHER nontoken creature dies" — bez d.card !== self
      // Ogre Slumlord je pravio pacova i na vlastitu smrt.
      on: 'dies', desc: 'Rat', filter: (g, self, d) => d.card !== self && d.snap.types.includes('Creature') && !d.snap.isToken, opt: true,
      run: async ctx => { await ctx.g.makeTokens('rat', ctx.you); },
    }],
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature') && c.hasSub('Rat')) c.cur.kw.add('deathtouch');
      },
    }],
  };
  SC['Queen Marchesa'] = {
    triggers: [
      { on: 'etb', desc: 'Monarch', filter: etbSelf, run: async ctx => { await ctx.g.becomeMonarch(ctx.you); } },
      {
        on: 'upkeep', desc: 'Assassin', filter: (g, self, d) => d.player === self.ctrl && g.monarch && g.monarch !== self.ctrl,
        onlyIf: (g, self) => g.monarch && g.monarch !== self.ctrl,
        run: async ctx => { await ctx.g.makeTokens('assassinB', ctx.you); },
      },
    ],
  };
  SC['Rankle, Master of Pranks'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Choose any', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const ks = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseMulti', prompt: 'Rankle: choose (0-3)',
          options: [{ key: 'disc', label: 'Everyone discards' }, { key: 'draw', label: 'Everyone loses 1 and draws' }, { key: 'sac', label: 'Everyone sacrifices a creature' }],
          min: 0, max: 3, aiHint: { kind: 'rankleModes', src: ctx.src },
        });
        for (const k of ks || []) {
          if (k === 'disc') {
            for (const q of ctx.g.alivePlayers()) {
              if (!q.hand.length) continue;
              const pick = await q.controller.decide(ctx.g, { type: 'chooseCards', from: q.hand, min: 1, max: 1, prompt: 'Discard', aiHint: { kind: 'cleanupDiscard' } });
              await ctx.g.discard(q, pick);
            }
          } else if (k === 'draw') {
            for (const q of ctx.g.alivePlayers()) { await ctx.g.loseLife(q, 1, 'rankle'); await ctx.g.draw(q, 1); }
          } else {
            for (const q of ctx.g.alivePlayers()) {
              const cs = ctx.g.creatures(q);
              if (!cs.length) continue;
              const pick = await q.controller.decide(ctx.g, { type: 'chooseCards', from: cs, min: 1, max: 1, prompt: 'Sacrifice', aiHint: { kind: 'sacCost' } });
              if (pick[0]) await ctx.g.sacrifice(q, pick[0]);
            }
          }
        }
      },
    }],
  };
  SC['Tenured Inkcaster'] = {
    triggers: [
      {
        on: 'etb', desc: '+1/+1', filter: etbSelf,
        targets: [T.creature({ prompt: '+1/+1', aiHint: { goal: 'buff' } })],
        run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1); },
      },
      {
        on: 'attacks', desc: 'Drain 1',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && (d.card.counters['+1/+1'] || 0) > 0,
        run: async ctx => {
          await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 1, 'inkcaster');
          await ctx.g.gainLife(ctx.you, 1);
        },
      },
    ],
  };
  SC['Veinwitch Coven'] = {
    triggers: [{
      on: 'lifeGain', desc: 'Return from graveyard', filter: (g, self, d) => d.player === self.ctrl,
      targets: [T.gyCreature({ prompt: 'Target a creature card for Veinwitch', aiHint: { goal: 'recur' } })],
      run: async ctx => {
        if (!ctx.g.canPayMana(ctx.you, U.parseCost('{B}'))) return;
        const choice = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Veinwitch Coven: pay {B} for ${ctx.targets[0]?.name || 'the target'}?`,
          options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
          aiHint: { kind: 'veinwitchPay', card: ctx.targets[0] },
        });
        if (choice !== 'yes') return;
        const ok = await ctx.g.payMana(ctx.you, U.parseCost('{B}'));
        if (!ok) return;
        const card = ctx.targets[0];
        if (card && card.zone === 'graveyard') {
          ctx.g.remove(card); card.zone = 'hand'; card.owner.hand.push(card);
        }
      },
    }],
  };
  SC['Vihaan, Goldwaker'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) {
          if (c.ctrl === self.ctrl && c.is('Creature') && c !== self && isOutlaw(c)) { c.cur.kw.add('vigilance'); c.cur.kw.add('haste'); }
        }
      },
    }],
    triggers: [{
      on: 'beginCombat', desc: 'Treasures become 3/3', filter: (g, self, d) => d.player === self.ctrl, opt: true,
      run: async ctx => {
        for (const c of ctx.g.bf().filter(c => c.ctrl === ctx.you && c.hasSub('Treasure'))) {
          const iid = c.iid;
          ctx.g.untilEffects.push({
            expires: 'eot', kind: 'animate',
            apply: (g2, bf) => {
              const x = bf.find(y => y.iid === iid);
              if (!x) return;
              if (!x.cur.types.includes('Creature')) x.cur.types.push('Creature');
              x.cur.subtypes.push('Construct', 'Assassin');
              x.cur.basePower = 3; x.cur.baseToughness = 3;
            },
          });
        }
        ctx.g.recalc();
      },
    }],
  };
  SC['Witch of the Moors'] = {
    triggers: [{
      on: 'endStep', desc: 'Edict + reanimation',
      filter: (g, self, d) => d.player === self.ctrl && self.ctrl.turnState.lifeGained > 0,
      targets: [{
        zone: 'graveyard', what: 'card', upTo: true, count: 1,
        prompt: 'Up to one target creature in your graveyard',
        filter: (g, card) => card.is('Creature'), aiHint: { goal: 'recur' },
      }],
      run: async ctx => {
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          const cs = ctx.g.creatures(o);
          if (!cs.length) continue;
          const pick = await o.controller.decide(ctx.g, { type: 'chooseCards', from: cs, min: 1, max: 1, prompt: 'Sacrifice', aiHint: { kind: 'sacCost' } });
          if (pick[0]) await ctx.g.sacrifice(o, pick[0]);
        }
        const card = ctx.targets[0];
        if (card && card.zone === 'graveyard') {
          ctx.g.remove(card); card.zone = 'hand'; card.owner.hand.push(card);
        }
      },
    }],
  };
  SC["Curtains' Call"] = {
    selfCostAdjust: (g, card, p) => -E.eachOpp(g, p).length,
    targets: [
      T.creature({ prompt: 'Destroy #1', aiHint: { goal: 'removal' } }),
      T.creature({ prompt: 'Destroy #2', differentFromAllPrevious: true, aiHint: { goal: 'removal' } }),
    ],
    resolve: async ctx => {
      const [a, b] = ctx.targets;
      if (a) await ctx.g.destroy(a);
      if (b && b !== a) await ctx.g.destroy(b);
    },
  };
  SC['Dead Before Sunrise'] = {
    resolve: async ctx => {
      for (const c of ctx.g.creatures(ctx.you)) {
        if (isOutlaw(c)) {
          E.pumpUntilEOT(ctx.g, c, 1, 0);
          c.meta._gunslinger = ctx.g.turnNo;
        }
      }
      ctx.g.lg('Dead Before Sunrise: outlaws get +1/+0 and can tap to deal damage equal to their power to a creature.');
    },
  };
  SC['Shoot the Sheriff'] = {
    targets: [T.creature({ prompt: 'Non-outlaw', filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && !isOutlaw(c), aiHint: { goal: 'removal' } })],
    resolve: async ctx => { await ctx.g.destroy(ctx.targets[0]); },
  };
  SC['Back in Town'] = {
    xCost: true,
    xMax: (g, card, p) => p.graveyard.filter(target => target.is('Creature') && isOutlaw(target)).length,
    targets: (g, card, castOpts) => [{
      zone: 'graveyard', what: 'card', count: castOpts.xVal || 0,
      prompt: `Target exactly ${castOpts.xVal || 0} outlaw creatures`,
      filter: (g2, target) => target.is('Creature') && isOutlaw(target), aiHint: { goal: 'recur' },
    }],
    resolve: async ctx => {
      const targets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : [ctx.targets[0]].filter(Boolean);
      for (const target of targets) {
        if (target.zone === 'graveyard') await ctx.g.move(target, 'battlefield', { ctrl: ctx.you });
      }
    },
  };
  SC["Council's Judgment"] = {
    resolve: async ctx => {
      const g = ctx.g, you = ctx.you;
      // svaki igrač glasa za nonland permanent koji NE kontroliše
      const votes = new Map();
      for (const q of g.apnapFrom(you)) {
        if (q.lost) continue;
        const cands = g.bf().filter(c => !c.is('Land') && c.ctrl !== q);
        if (!cands.length) continue;
        const pick = await q.controller.decide(g, {
          type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Vote: exile for...', aiHint: { kind: 'voteExile' },
        });
        if (pick[0]) {
          votes.set(pick[0], (votes.get(pick[0]) || 0) + 1);
          votes['_by_' + q.idx] = pick[0];
          g.lg(`${q.name} votes: ${pick[0].name}.`);
        }
      }
      let best = 0;
      for (const n of votes.values()) best = Math.max(best, n);
      for (const [c, n] of votes) if (n === best && c.zone === 'battlefield') await g.exileCard(c);
      await g.emit('voteEnd', { src: ctx.src, by: you, votes });
    },
  };
  SC['Hex'] = {
    targets: [T.creature({ count: 6, prompt: 'Six different creatures', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      for (const creature of ctx.targets[0] || []) {
        if (creature.zone === 'battlefield') await ctx.g.destroy(creature);
      }
    },
  };
  SC['Mass Mutiny'] = {
    targets: (g, card) => E.eachOpp(g, card.ctrl).map(opponent => T.creature({
      upTo: true, count: 1, prompt: `Up to one creature ${opponent.name} controls`,
      filter: (g2, target) => target.zone === 'battlefield' && target.is('Creature') && target.ctrl === opponent,
      aiHint: { goal: 'steal' },
    })),
    resolve: async ctx => {
      const stolen = [];
      for (const t of ctx.targets) {
        if (!t) continue;
        const orig = t.ctrl;
        t.ctrl = ctx.you; t.tapped = false; t.meta.tempHaste = true;
        stolen.push({ iid: t.iid, orig });
        ctx.g.lg(`${ctx.you.name} steals ${t.name}!`);
      }
      ctx.g.recalc();
      ctx.g.delayed.push({
        on: 'endStep', name: 'Return the stolen creatures', ctrl: ctx.you,
        run: async c2 => {
          for (const s of stolen) {
            const x = c2.g.byIid(s.iid);
            if (x && x.zone === 'battlefield') { x.ctrl = s.orig; x.meta.tempHaste = false; }
          }
          c2.g.recalc();
        },
      });
    },
  };
  SC['Requisition Raid'] = {
    modes: {
      pick: 'any',
      list: [
        { label: '+{1}: Destroy an artifact', targets: [T.permanent((g, c) => c.is('Artifact'), { prompt: 'Artifact', aiHint: { goal: 'removal' } })] },
        { label: '+{1}: Destroy an enchantment', targets: [T.permanent((g, c) => c.is('Enchantment'), { prompt: 'Enchantment', aiHint: { goal: 'removal' } })] },
        { label: '+{1}: +1/+1 counters to a player', targets: [T.player({ prompt: 'Who gets the counters?', aiHint: { goal: 'self' } })] },
      ],
    },
    spreeCost: 1,
    resolve: async ctx => {
      let ti = 0;
      for (const mi of ctx.mode || []) {
        const t = ctx.targets[ti++];
        if (mi === 0 && t) await ctx.g.destroy(t);
        else if (mi === 1 && t) await ctx.g.destroy(t);
        else if (mi === 2 && t) { for (const c of ctx.g.creatures(t)) ctx.g.addCounters(c, '+1/+1', 1); }
      }
    },
  };
  SC['Seize the Spotlight'] = {
    resolve: async ctx => {
      const stolen = [];
      for (const o of E.eachOpp(ctx.g, ctx.you)) {
        const k = await o.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Seize the Spotlight: fame or fortune?`,
          options: [{ key: 'fame', label: '🎭 Fame (they steal your creature)' }, { key: 'fortune', label: '💰 Fortune (card+Treasure to opponent)' }],
          aiHint: { kind: 'fameFortune', forWhom: ctx.you },
        });
        if (k === 'fame') {
          const cs = ctx.g.creatures(o);
          if (cs.length) {
            const pick = await ctx.you.controller.decide(ctx.g, {
              type: 'chooseCards', from: cs, min: 1, max: 1, prompt: `Steal from ${o.name}`, aiHint: { kind: 'stealPick' },
            });
            const t = pick[0];
            if (t) {
              const orig = t.ctrl;
              t.ctrl = ctx.you; t.tapped = false; t.meta.tempHaste = true;
              stolen.push({ iid: t.iid, orig });
              ctx.g.lg(`${ctx.you.name} steals ${t.name} (fame).`);
            }
          }
        } else {
          await ctx.g.draw(ctx.you, 1);
          await ctx.g.makeTokens('treasure', ctx.you);
        }
      }
      if (stolen.length) {
        ctx.g.recalc();
        ctx.g.delayed.push({
          on: 'endStep', name: 'Return the stolen creatures', ctrl: ctx.you,
          run: async c2 => {
            for (const s of stolen) {
              const x = c2.g.byIid(s.iid);
              if (x && x.zone === 'battlefield') { x.ctrl = s.orig; x.meta.tempHaste = false; }
            }
            c2.g.recalc();
          },
        });
      }
    },
  };
  SC["Bandit's Haul"] = {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    triggers: [{
      on: 'crime', desc: 'Loot counter', oncePerTurn: true,
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { ctx.g.addCounters(ctx.src, 'loot', 1); },
    }],
    abilities: [{
      label: 'Remove 2 loot: draw', cost: { tap: true, mana: '{2}', rmCounter: { kind: 'loot', n: 2 } },
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      aiScore: () => 4,
    }],
  };
  SC['Bounty Board'] = {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    abilities: [{
      label: 'Bounty counter', sorcery: true, cost: { tap: true, mana: '{1}' },
      targets: [T.creature({ prompt: 'Bounty on:', aiHint: { goal: 'removal' } })],
      run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], 'bounty', 1); },
      aiScore: (g, c, p) => g.bf().some(x => x.is('Creature') && x.ctrl !== p && x.power >= 4) ? 3 : 0.5,
    }],
    triggers: [{
      on: 'dies', desc: 'Bounty reward',
      filter: (g, self, d) => d.snap.types.includes('Creature') && (d.snap.counters.bounty || 0) > 0,
      run: async ctx => {
        const owner = ctx.data.snap.ctrl;
        for (const q of ctx.g.alivePlayers()) {
          if (q !== owner) { await ctx.g.draw(q, 1); await ctx.g.gainLife(q, 2); }
        }
      },
    }],
  };
  SC['Glittering Stockpile'] = {
    mana: [
      { cost: { tap: true, counter: 'stash' }, produce: [{ R: 1 }] },
      {
        cost: { tap: true, sacSelf: true },
        produce: (g, c, p) => { const n = c.counters['stash'] || 0; return n > 0 ? COLORS.map(col => ({ [col]: n })) : []; },
      },
    ],
  };
  SC["Trailblazer's Boots"] = {
    equip: '{2}',
    statics: [{
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (!host) return;
        host.cur.cantBeBlockedBy = ((prev) => (g2, blocker) => {
          if (prev && prev(g2, blocker)) return true;
          return g2.lands(blocker.ctrl).some(l => !(l.def.super || []).includes('Basic'));
        })(host.cur.cantBeBlockedBy);
      },
    }],
  };
  SC['Discreet Retreat'] = {
    auraTarget: [T.permanent((g, card) => card.is('Land'), { prompt: 'Enchant land', aiHint: { goal: 'ramp' } })],
    statics: [{
      phase: 2,
      apply: (g, self, bf) => {
        const land = bf.find(card => card.iid === self.attachedTo);
        if (!land) return;
        land.cur.extraMana.push({
          cost: { tap: true }, produce: [{ ANY: true, n: 2 }], restrictAbilities: true,
          restrict: (g2, action) => action && action.card && action.card.is('Creature') && isOutlaw(action.card),
        });
      },
    }],
    triggers: [{
      on: 'cast', desc: 'Outlaw spell → card', oncePerTurn: true,
      filter: (g, self, d) => d.player === self.ctrl && d.card.is('Creature') && isOutlaw(d.card),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); await ctx.g.loseLife(ctx.you, 1, 'retreat'); },
    }],
  };
  SC['Life Insurance'] = {
    triggers: [
      {
        on: 'cast', desc: 'Extort', filter: (g, self, d) => d.player === self.ctrl, opt: true,
        run: async ctx => {
          if (!ctx.g.canPayMana(ctx.you, U.parseCost('{W/B}'))) return;
          const ok = await ctx.g.payMana(ctx.you, U.parseCost('{W/B}'));
          if (!ok) return;
          const gained = await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 1, 'extort');
          if (gained) await ctx.g.gainLife(ctx.you, gained);
        },
      },
      {
        on: 'dies', desc: 'Treasure', filter: (g, self, d) => d.snap.types.includes('Creature') && !d.snap.isToken,
        run: async ctx => { await ctx.g.loseLife(ctx.you, 1, 'insurance'); await ctx.g.makeTokens('treasure', ctx.you); },
      },
    ],
  };
  SC['We Ride at Dawn'] = {
    grantsConvokeLegendary: true,
    triggers: [{
      on: 'attacks', desc: 'Mercenary', filter: (g, self, d) => d.card.commander && d.card.ctrl === self.ctrl,
      run: async ctx => { await ctx.g.makeTokens('mercenaryR', ctx.you); },
    }],
  };

  // ============================================================
  // ELVEN COUNCIL (LTC) — commander: Galadriel, Elven-Queen
  // ============================================================
  function auraEntryCandidates(g, card, ctrl) {
    const spec = card.def.auraTarget && card.def.auraTarget[0];
    if (!spec) return [];
    // An Aura put directly onto the battlefield does not target. It may be
    // attached to shroud/hexproof permanents, so use only the enchant filter,
    // not the spell-target protection checks.
    return g.bf().filter(candidate => (!spec.filter || spec.filter(g, candidate, ctrl, card)));
  }

  async function chooseAuraEntryHost(g, card, ctrl) {
    const candidates = auraEntryCandidates(g, card, ctrl);
    if (!candidates.length) return null;
    const picked = await ctrl.controller.decide(g, {
      type: 'chooseCards', from: candidates, min: 1, max: 1,
      prompt: `${card.name}: choose what the Aura enchants`, aiHint: { kind: 'auraHost', card },
    });
    return picked[0] || null;
  }

  async function putPermanentDirectly(g, card, ctrl, auraHost) {
    const isAura = card.hasSub && card.hasSub('Aura');
    const host = isAura ? (auraHost || await chooseAuraEntryHost(g, card, ctrl)) : null;
    if (isAura && !host) return false;
    await g.move(card, 'battlefield', { ctrl });
    if (host) await g.attach(card, host);
    return true;
  }

  async function chooseElvenCreatureType(g, you, source, prompt) {
    const cards = [...new Set([
      ...g.bf(), ...you.hand, ...you.library, ...you.graveyard, ...you.exile, ...you.command,
    ])].filter(card => card && card.def && card.is('Creature'));
    const counts = new Map();
    for (const card of cards) for (const type of (card.cur ? card.cur.subtypes : card.def.subtypes || [])) {
      counts.set(type, (counts.get(type) || 0) + (card.ctrl === you || card.owner === you ? 1 : 0));
    }
    if (!counts.size) counts.set('Elf', 1);
    const options = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([type, n]) => ({ key: type, label: `${type} (${n})`, keepValue: n }));
    const picked = await you.controller.decide(g, {
      type: 'chooseOption', prompt, options,
      aiHint: { kind: 'creatureType', source },
    });
    return counts.has(picked) ? picked : options[0].key;
  }

  SC['Galadriel, Elven-Queen'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Council: dominion/guidance',
      filter: (g, self, d) => d.player === self.ctrl &&
        (self.ctrl.turnState.elfEntries || []).some(iid => iid !== self.iid),
      run: async ctx => {
        const votes = await E7.vote(ctx.g, ctx.you, ctx.src, [
          { key: 'dominion', label: '👑 Dominion (Ring + counter)' },
          { key: 'guidance', label: '📜 Guidance (card)' },
        ], (voter) => voter === ctx.you ? 'dominion' : 'guidance');
        if (E7.voteBeats(votes, 'dominion', 'guidance')) {
          const rb = await E7.ringTempts(ctx.g, ctx.you);
          if (rb) ctx.g.addCounters(rb, '+1/+1', 1);
        } else {
          await ctx.g.draw(ctx.you, 1);
        }
      },
    }],
  };
  SC['Arbor Elf'] = {
    abilities: [{
      label: 'Untap Forest', cost: { tap: true }, manaAbilityOnly: false,
      cond: (g, c, p) => g.lands(p).some(l => l.hasSub('Forest') && l.tapped),
      targets: [T.permanent((g, land, ctrl) => land.is('Land') && land.ctrl === ctrl && land.hasSub('Forest') && land.tapped, {
        prompt: 'Target Forest to untap', aiHint: { goal: 'untapLand' },
      })],
      run: async ctx => {
        const l = ctx.targets[0];
        if (l) { l.tapped = false; ctx.g.lg('Arbor Elf: untap Forest.'); }
      },
      aiScore: () => 0.5,
    }],
  };
  SC['Arwen, Weaver of Hope'] = {
    replace: [{
      event: 'etbCounters',
      run: (g, card, src) => card.ctrl === src.ctrl && card !== src,
      n: (g, card, src) => Math.max(0, src.toughness),
    }],
  };
  SC['Celeborn the Wise'] = {
    triggers: [
      {
        on: 'attackersDeclared', desc: 'Scry 1', filter: (g, self, d) => d.player === self.ctrl && d.attackers.some(a => a.hasSub('Elf')),
        run: async ctx => { await E.scry(ctx.g, ctx.you, 1); },
      },
      {
        on: 'scry', desc: '+X/+X from scry', filter: (g, self, d) => d.player === self.ctrl && d.n > 0,
        run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, ctx.data.n, ctx.data.n); },
      },
    ],
  };
  SC['Colossal Whale'] = {
    statics: [{
      apply: (g, self, bf) => {
        self.cur.cantBeBlockedBy = ((prev) => (g2, blocker) => {
          if (prev && prev(g2, blocker)) return true;
          return g2.lands(blocker.ctrl).some(l => l.hasSub('Island'));
        })(self.cur.cantBeBlockedBy);
      },
    }],
    triggers: [{
      on: 'attacks', desc: 'Swallow a creature', opt: true,
      filter: (g, self, d) => {
        if (d.card !== self) return false;
        const defender = d.defender instanceof MTG.Player ? d.defender : d.defender && d.defender.ctrl;
        return !!defender && g.creatures(defender).length > 0;
      },
      targets: (g, self, d) => {
        const defender = d.defender instanceof MTG.Player ? d.defender : d.defender && d.defender.ctrl;
        return [T.creature({
          prompt: 'Target creature defending player controls',
          filter: (g2, card) => card.zone === 'battlefield' && card.is('Creature') && card.ctrl === defender,
          aiHint: { goal: 'removal' },
        })];
      },
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t) return;
        const sourceZoneVersion = ctx.sourceZoneVersion ?? ctx.src.zoneVersion;
        // CR 610.3b: the duration cannot begin after this Whale has left.
        if (ctx.src.zone !== 'battlefield' || ctx.src.zoneVersion !== sourceZoneVersion) return;
        // Use the engine's immediate return effect, with both zone identities,
        // so leaving never creates a response window or returns a later exile.
        (ctx.g.oracleExileDurations ||= []).push({
          source: ctx.src, sourceZoneVersion,
          cards: [{ card: t, zoneVersion: t.zoneVersion + 1 }],
        });
        await ctx.g.exileMany([t]);
      },
    }],
  };
  SC['Círdan the Shipwright'] = {
    triggers: [
      { on: 'etb', desc: 'Secret council', filter: etbSelf, run: async ctx => { await cirdanCouncil(ctx); } },
      { on: 'attacks', desc: 'Secret council', filter: (g, self, d) => d.card === self, run: async ctx => { await cirdanCouncil(ctx); } },
    ],
  };
  async function cirdanCouncil(ctx) {
    const g = ctx.g, players = g.alivePlayers();
    const opts = players.map(q => ({ key: String(q.idx), label: q.name }));
    const { votes } = await E7.secretVote(g, ctx.you, ctx.src, opts);
    for (const q of players) {
      const n = votes.get(String(q.idx)) || 0;
      if (n > 0) await g.draw(q, n);
      else {
        const pool = q.hand.filter(c =>
          (c.is('Creature') || c.is('Artifact') || c.is('Enchantment') || c.is('Land')) &&
          (!c.hasSub('Aura') || auraEntryCandidates(g, c, q).length > 0));
        if (pool.length) {
          const pick = await q.controller.decide(g, {
            type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Permanent onto the battlefield (free)', aiHint: { kind: 'rampPick' },
          });
          if (pick[0]) await putPermanentDirectly(g, pick[0], q);
        }
      }
    }
  }
  SC['Elrond of the White Council'] = {
    triggers: [{
      on: 'etb', desc: 'Secret council: fellowship/aid', filter: etbSelf,
      run: async ctx => {
        const g = ctx.g;
        const { votes, picks } = await E7.secretVote(g, ctx.you, ctx.src, [
          { key: 'fellowship', label: '🤝 Fellowship (give a creature)' },
          { key: 'aid', label: '⚔️ Aid (counters on Elrond)' },
        ]);
        for (const [q, k] of picks) {
          if (k === 'fellowship') {
            const cs = g.creatures(q);
            if (cs.length) {
              const pick = await q.controller.decide(g, {
                type: 'chooseCards', from: cs, min: 1, max: 1, prompt: "Give a creature to Elrond's owner", aiHint: { kind: 'sacCost' },
              });
              if (pick[0]) {
                const chosen = pick[0];
                chosen.ctrl = ctx.you;
                g.untilEffects.push({
                  kind: 'cantAttackPlayerCard', iid: chosen.iid, timestamp: chosen.timestamp,
                  notPlayer: chosen.owner, expires: 'never',
                });
                g.recalc();
                g.lg(`${chosen.name} goes to ${ctx.you.name} and can't attack its owner ${chosen.owner.name}.`);
              }
            }
          }
        }
        const aidN = votes.get('aid') || 0;
        for (let i = 0; i < aidN; i++) for (const c of g.creatures(ctx.you)) g.addCounters(c, '+1/+1', 1);
      },
    }],
  };
  SC['Elvish Archdruid'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c !== self && c.hasSub('Elf')) { c.cur.power++; c.cur.toughness++; }
      },
    }],
    mana: {
      cost: { tap: true },
      produce: (g, c, p) => {
        const n = g.bf().filter(x => x.ctrl === p && x.hasSub('Elf')).length;
        return n > 0 ? [{ G: n }] : [];
      },
    },
  };
  SC['Elvish Piper'] = {
    abilities: [{
      label: 'Creature from hand onto the battlefield', cost: { tap: true, mana: '{G}' },
      cond: (g, c, p) => p.hand.some(x => x.is('Creature')),
      run: async ctx => {
        const pool = ctx.you.hand.filter(x => x.is('Creature'));
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Onto the battlefield:', aiHint: { kind: 'piperPick' },
        });
        if (pick[0]) await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you });
      },
      aiScore: (g, c, p) => p.hand.some(x => x.is('Creature') && x.mv >= 5) ? 8 : 0.5,
    }],
  };
  SC['Elvish Visionary'] = {
    triggers: [{ on: 'etb', desc: 'Draw', filter: etbSelf, run: async ctx => { await ctx.g.draw(ctx.you, 1); } }],
  };
  SC['Elvish Warmaster'] = {
    triggers: [{
      on: 'etb', desc: 'Elf token', oncePerTurn: true,
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.hasSub('Elf'),
      run: async ctx => { await ctx.g.makeTokens('elfWarrior', ctx.you); },
    }],
    abilities: [{
      label: 'Elves +2/+2 deathtouch', cost: { mana: '{5}{G}{G}' },
      run: async ctx => {
        for (const c of ctx.g.creatures(ctx.you)) if (c.hasSub('Elf')) E.pumpUntilEOT(ctx.g, c, 2, 2, ['deathtouch']);
      },
      aiScore: (g, c, p) => g.creatures(p).filter(x => x.hasSub('Elf')).length >= 4 && g.phase === 'main1' ? 6 : 0.5,
    }],
  };
  SC['Erestor of the Council'] = {
    triggers: [{
      on: 'voteEnd', desc: 'Voting reward', filter: (g, self, d) => true,
      run: async ctx => {
        const votes = ctx.data.votes;
        const mine = votes && votes['_by_' + ctx.you.idx];
        let differed = 0;
        if (votes && mine !== undefined) {
          for (const o of E.eachOpp(ctx.g, ctx.you)) {
            const theirs = votes['_by_' + o.idx];
            if (theirs === undefined) continue;
            if (theirs === mine) await ctx.g.makeTokens('treasure', o);
            else differed++;
          }
        }
        if (differed) await E.scry(ctx.g, ctx.you, differed);
        await ctx.g.draw(ctx.you, 1);
      },
    }],
  };
  SC['Farhaven Elf'] = {
    triggers: [{
      on: 'etb', desc: 'Basic (tapped)', filter: etbSelf, opt: true,
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: true }); },
    }],
  };
  SC['Gandalf, Westward Voyager'] = {
    triggers: [{
      on: 'cast', desc: 'MV5+ → maybe a copy',
      filter: (g, self, d) => d.player === self.ctrl && d.mv >= 5,
      run: async ctx => {
        const g = ctx.g, so = ctx.data.so, spell = ctx.data.card;
        const revealed = [];
        let match = null;
        for (const o of E.eachOpp(g, ctx.you)) {
          const top = o.library[o.library.length - 1];
          if (!top) continue;
          revealed.push(top);
          g.lg(`${o.name} reveals ${top.name}.`);
          if (!match && top.def.types.some(t => spell.def.types.includes(t))) match = top;
        }
        // The reveal is the whole point of the trigger: show the human what
        // came up instead of only logging it.
        if (revealed.length) {
          await g.revealToHuman({ cards: revealed, ctrl: revealed[0].owner, kind: 'reveal', includeLands: true, title: 'Gandalf: opponents reveal' });
        }
        if (match && so && g.stack.includes(so)) {
          g.lg(`Gandalf, Westward Voyager: ${match.name} shares a card type with ${spell.name}; the spell is copied and each opponent draws a card.`);
          await g.copySpell(so, ctx.you, { mayNewTargets: true });
          for (const o of E.eachOpp(g, ctx.you)) await g.draw(o, 1);
        } else {
          g.lg(`Gandalf, Westward Voyager: no revealed card shares a type with ${spell.name}; you draw a card.`);
          await g.draw(ctx.you, 1);
        }
      },
    }],
  };
  SC['Haldir, Lórien Lieutenant'] = {
    xCost: true,
    etbCounters: { kind: '+1/+1', n: (g, card) => card.castMeta ? (card.castMeta.x || 0) : 0 },
    abilities: [{
      label: 'Elves +N/+N (N=counters)', cost: { mana: '{5}{G}' },
      run: async ctx => {
        const n = ctx.src.counters['+1/+1'] || 0;
        if (!n) return;
        for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src && c.hasSub('Elf')) E.pumpUntilEOT(ctx.g, c, n, n, ['vigilance']);
      },
      aiScore: (g, c, p) => (c.counters['+1/+1'] || 0) >= 3 && g.phase === 'main1' ? 6 : 0.5,
    }],
  };
  SC['Legolas Greenleaf'] = {
    statics: [{
      apply: (g, self) => {
        self.cur.cantBeBlockedBy = ((prev) => (g2, blocker) => {
          if (prev && prev(g2, blocker)) return true;
          return blocker.power <= 2;
        })(self.cur.cantBeBlockedBy);
      },
    }],
    triggers: [
      {
        on: 'etb', desc: '+1/+1 (legendary)',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Creature') && (d.card.def.super || []).includes('Legendary'),
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Draw', filter: (g, self, d) => d.card === self,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };
  SC['Mirkwood Elk'] = {
    triggers: [
      {
        on: 'etb', desc: 'Elf from graveyard', filter: etbSelf,
        targets: [{ zone: 'graveyard', what: 'card', prompt: 'Target Elf card from your graveyard',
          filter: (g, card) => card.def.subtypes.includes('Elf'), aiHint: { goal: 'reanimate' } }],
        run: async ctx => { await elkReturn(ctx); },
      },
      {
        on: 'attacks', desc: 'Elf from graveyard', filter: (g, self, d) => d.card === self,
        targets: [{ zone: 'graveyard', what: 'card', prompt: 'Target Elf card from your graveyard',
          filter: (g, card) => card.def.subtypes.includes('Elf'), aiHint: { goal: 'reanimate' } }],
        run: async ctx => { await elkReturn(ctx); },
      },
    ],
  };
  async function elkReturn(ctx) {
    const card = ctx.targets[0];
    if (card && card.zone === 'graveyard') {
      ctx.g.remove(card); card.zone = 'hand'; ctx.you.hand.push(card);
      await ctx.g.gainLife(ctx.you, parseInt(card.def.power || '0', 10) || 0);
    }
  }
  SC['Mirkwood Trapper'] = {
    triggers: [
      {
        on: 'attackersDeclared', desc: '-2/-0 to attacker',
        filter: (g, self, d) => d.attackers.some(a => a.attacking === self.ctrl),
        targets: (g, self, d) => [T.creature({
          prompt: 'Target attacking creature gets -2/-0',
          filter: (g2, card) => card.zone === 'battlefield' && d.attackers.includes(card),
          aiHint: { goal: 'debuff' },
        })],
        run: async ctx => {
          const a = ctx.targets[0];
          if (a) E.pumpUntilEOT(ctx.g, a, -2, 0);
        },
      },
      {
        on: 'attackersDeclared', desc: "+2/+0 to another player's attacker",
        filter: (g, self, d) => d.player !== self.ctrl && d.attackers.length && !d.attackers.some(a => a.attacking === self.ctrl),
        run: async ctx => {
          const attacker = ctx.data.player;
          const candidates = ctx.data.attackers.filter(card => card.zone === 'battlefield');
          const picked = candidates.length ? await attacker.controller.decide(ctx.g, {
            type: 'chooseCards', from: candidates, min: 1, max: 1,
            prompt: 'Mirkwood Trapper: choose your attacker for +2/+0', aiHint: { kind: 'buffPick' },
          }) : [];
          const a = picked[0];
          if (a) E.pumpUntilEOT(ctx.g, a, 2, 0);
        },
      },
    ],
  };
  SC['Radagast, Wizard of Wilds'] = {
    ward: { mana: '{1}' },
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) {
          if (c.ctrl === self.ctrl && (c.hasSub('Beast') || c.hasSub('Bird')) && !c.cur.wardCost) c.cur.wardCost = { mana: '{1}' };
        }
      },
    }],
    triggers: [{
      on: 'cast', desc: 'MV5+ → token', filter: (g, self, d) => d.player === self.ctrl && d.mv >= 5,
      run: async ctx => {
        const k = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Radagast:',
          options: [{ key: 'beast', label: '3/3 Beast' }, { key: 'bird', label: '2/2 Bird (flying)' }],
          aiHint: { kind: 'radagastToken', source: ctx.src },
        });
        await ctx.g.makeTokens(k === 'beast' ? 'beast33' : 'birdU', ctx.you);
      },
    }],
  };
  SC['Realm Seekers'] = {
    etbCounters: { kind: '+1/+1', n: (g, card) => g.players.reduce((s, q) => s + q.hand.length, 0) },
    abilities: [{
      label: 'Search for a land to hand', cost: { mana: '{2}{G}', rmCounter: { kind: '+1/+1', n: 1 } },
      run: async ctx => {
        const pool = ctx.you.library.filter(c => c.is('Land'));
        if (!pool.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Land to hand', aiHint: { kind: 'searchBasic' }, search: true,
        });
        if (pick[0]) {
          ctx.you.library.splice(ctx.you.library.indexOf(pick[0]), 1);
          pick[0].zone = 'hand'; ctx.you.hand.push(pick[0]);
        }
        U.shuffle(ctx.you.library, ctx.g.rnd);
      },
      aiScore: (g, c, p) => g.lands(p).length < 6 ? 3 : 0.3,
    }],
  };
  SC['Wood Elves'] = {
    triggers: [{
      on: 'etb', desc: 'Search for a Forest', filter: etbSelf,
      run: async ctx => { await E.searchLandByName(ctx.g, ctx.you, ['Forest'], { tapped: false }); },
    }],
  };
  SC['Wose Pathfinder'] = {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    abilities: [{
      label: '+3/+3 trample', cost: { tap: true, mana: '{6}{G}' },
      targets: [T.creature({ prompt: 'Another target creature +3/+3', filter: (g, c, ctrl, src) => c.zone === 'battlefield' && c.is('Creature') && c !== src, aiHint: { goal: 'buff' } })],
      run: async ctx => { if (ctx.targets[0]) E.pumpUntilEOT(ctx.g, ctx.targets[0], 3, 3, ['trample']); },
      aiScore: () => 1,
    }],
  };
  SC['Galadhrim Ambush'] = {
    resolve: async ctx => {
      const n = ctx.g.combat ? ctx.g.combat.attackers.length : 0;
      if (n > 0) await ctx.g.makeTokens('elfWarrior', ctx.you, { n });
      ctx.g.untilEffects.push({ expires: 'eot', kind: 'preventNonElfCombat' });
      ctx.g.lg('Galadhrim Ambush: Elves appear, non-Elf combat damage prevented!');
    },
  };
  SC['Growth Spiral'] = {
    resolve: async ctx => {
      await ctx.g.draw(ctx.you, 1);
      const lands = ctx.you.hand.filter(c => c.is('Land'));
      if (lands.length) {
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: lands, min: 0, max: 1, prompt: 'Land onto the battlefield?', aiHint: { kind: 'rampPick' },
        });
        if (pick[0]) await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you });
      }
    },
  };
  SC['Inscription of Abundance'] = {
    kicker: { cost: '{2}{G}' },
    modes: {
      // Unkicked: choose one. Kicked: "choose any number instead", including
      // zero, with every chosen mode and target locked in while casting.
      pick: (g, p, card, castOpts) => castOpts._kicked ? 'any' : 1,
      min: 0,
      list: [
        { label: '2× +1/+1 counters', targets: [T.creature({ prompt: 'Target creature for two counters', aiHint: { goal: 'buff' } })] },
        { label: 'Target player gains life', targets: [T.player({ prompt: 'Target player for life', aiHint: { goal: 'lifegain' } })] },
        { label: 'Fight', targets: [
          T.yourCreature({ prompt: 'Your target creature for the fight', aiHint: { goal: 'fightMine' } }),
          T.oppCreature({ prompt: "Target creature you don't control", aiHint: { goal: 'removal' } }),
        ] },
      ],
    },
    resolve: async ctx => {
      let ti = 0;
      for (const mode of ctx.mode || []) {
        if (mode === 0) {
          const target = ctx.targets[ti++];
          if (target && target.zone === 'battlefield') ctx.g.addCounters(target, '+1/+1', 2);
        } else if (mode === 1) {
          const player = ctx.targets[ti++];
          if (player && !player.lost) {
            const greatest = Math.max(0, ...ctx.g.creatures(player).map(card => card.power));
            await ctx.g.gainLife(player, greatest);
          }
        } else if (mode === 2) {
          const mine = ctx.targets[ti++], theirs = ctx.targets[ti++];
          if (mine && theirs && mine.zone === 'battlefield' && theirs.zone === 'battlefield') {
            const minePower = Math.max(0, mine.power), theirPower = Math.max(0, theirs.power);
            await ctx.g.damageCreature(mine, theirs, minePower, { deferSBA: true });
            await ctx.g.damageCreature(theirs, mine, theirPower, { deferSBA: true });
            await ctx.g.checkSBA();
          }
        }
      }
    },
  };
  SC['Learn from the Past'] = {
    targets: [T.player({ prompt: 'Who shuffles their graveyard?', aiHint: { goal: 'self' } })],
    resolve: async ctx => {
      const q = ctx.targets[0] || ctx.you;
      while (q.graveyard.length) {
        const c = q.graveyard.pop();
        c.zone = 'library'; q.library.push(c);
      }
      U.shuffle(q.library, ctx.g.rnd);
      ctx.g.lg(`${q.name} shuffles their graveyard into their library.`);
      await ctx.g.draw(ctx.you, 1);
    },
  };
  SC['Mystic Confluence'] = {
    modes: {
      pick: 3, repeats: true,
      list: [
        { label: 'Counter unless its controller pays {3}', targets: [T.spell(null, { prompt: 'Counter', aiHint: { goal: 'counter' } })] },
        { label: 'Bounce a creature', targets: [T.creature({ prompt: 'Bounce', aiHint: { goal: 'bounce' } })] },
        { label: 'Draw a card', targets: null },
      ],
    },
    resolve: async ctx => {
      let ti = 0;
      for (const mi of ctx.mode || []) {
        if (mi === 0) {
          const so = ctx.targets[ti++];
          if (so && ctx.g.stack.includes(so) && !MTG.isUncounterable(ctx.g, so)) {
            const payer = so.ctrl;
            if (ctx.g.canPayMana(payer, U.parseCost('{3}'))) {
              const yes = await payer.controller.decide(ctx.g, {
                type: 'chooseOption', prompt: `Pay {3} to save ${so.name}?`,
                options: [{ key: 'yes', label: 'Pay' }, { key: 'no', label: 'No' }],
                aiHint: { kind: 'taxCounter' },
              });
              if (yes === 'yes' && await ctx.g.payMana(payer, U.parseCost('{3}'))) continue;
            }
            await ctx.g.counterStackObject(so, { source: ctx.src });
          }
        } else if (mi === 1) {
          const t = ctx.targets[ti++];
          if (t && t.zone === 'battlefield') await ctx.g.move(t, 'hand');
        } else {
          await ctx.g.draw(ctx.you, 1);
        }
      }
    },
  };
  SC['Sail into the West'] = {
    exileOnResolve: true,
    resolve: async ctx => {
      const votes = await E7.vote(ctx.g, ctx.you, ctx.src, [
        { key: 'return', label: '↩️ Return (return 2 from graveyard)' },
        { key: 'embark', label: '🚢 Embark (new hand of 7)' },
      ], (voter) => voter.graveyard.length >= 3 ? 'return' : 'embark');
      if (E7.voteBeats(votes, 'return', 'embark')) {
        for (const q of ctx.g.alivePlayers()) {
          const pool = q.graveyard.slice();
          if (!pool.length) continue;
          const pick = await q.controller.decide(ctx.g, {
            type: 'chooseCards', from: pool, min: 0, max: 2, prompt: 'Return up to 2 to hand', aiHint: { kind: 'reanimate' },
          });
          for (const c of pick) { ctx.g.remove(c); c.zone = 'hand'; q.hand.push(c); }
        }
      } else {
        for (const q of ctx.g.alivePlayers()) {
          const yes = await q.controller.decide(ctx.g, {
            type: 'chooseOption', prompt: 'Discard your hand and draw 7?',
            options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
            aiHint: { kind: 'wheel' },
          });
          if (yes === 'yes') {
            await ctx.g.discard(q, q.hand.slice());
            await ctx.g.draw(q, 7);
          }
        }
      }
    },
  };
  SC['Trap the Trespassers'] = {
    resolve: async ctx => {
      const g = ctx.g;
      const votes = new Map();
      for (const q of g.alivePlayers()) {
        const cands = g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you);
        if (!cands.length) break;
        const pick = await q.controller.decide(g, {
          type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Secret vote: stun for...', aiHint: { kind: 'voteExile' },
        });
        if (pick[0]) {
          votes.set(pick[0], (votes.get(pick[0]) || 0) + 1);
          votes['_by_' + q.idx] = pick[0];
        }
      }
      for (const [c, n] of votes) {
        if (c.zone !== 'battlefield') continue;
        ctx.g.addCounters(c, 'stun', n);
        c.tapped = true;
        g.lg(`${c.name}: ${n} stun counters + tap.`);
      }
      await g.emit('voteEnd', { src: ctx.src, by: ctx.you, votes });
    },
  };
  SC['Windswift Slice'] = {
    targets: [
      T.yourCreature({ prompt: 'Windswift Slice: your creature that will deal damage equal to its power', aiHint: { goal: 'buff' } }),
      T.oppCreature({ prompt: 'Windswift Slice: creature to damage; excess damage creates 1/1 green Elf Warriors', aiHint: { goal: 'removal' } }),
    ],
    resolve: async ctx => {
      const [a, b] = ctx.targets;
      if (!a || !b) return;
      const damageResults = [];
      // Finish both instructions before SBA so a lethally damaged creature
      // still applies its abilities when the Elf Warriors enter (CR 704.4).
      const dealt = await ctx.g.damageCreature(a, b, a.power, { deferSBA: true, damageResults });
      const excess = damageResults.reduce((total, result) => total + result.excess, 0);
      ctx.g.lg(`Windswift Slice: ${dealt} damage dealt, ${excess} excess damage — create ${excess} 1/1 green Elf Warrior token${excess === 1 ? '' : 's'}.`, 'token');
      if (excess > 0) await ctx.g.makeTokens('elfWarrior', ctx.you, { n: excess });
    },
  };
  SC['Devastation Tide'] = {
    miracle: '{1}{U}',
    resolve: async ctx => {
      for (const c of ctx.g.bf().filter(c => !c.is('Land')).slice()) {
        if (c.isToken) { await ctx.g.move(c, 'graveyard'); continue; }
        await ctx.g.move(c, 'hand');
      }
      ctx.g.lg('Devastation Tide: all nonland permanents returned to hands!');
    },
  };
  SC['Elven Farsight'] = {
    resolve: async ctx => {
      await E.scry(ctx.g, ctx.you, 3);
      const top = ctx.you.library[ctx.you.library.length - 1];
      if (!top) return;
      const reveal = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseOption', prompt: `Elven Farsight: reveal the top card (${top.name})?`,
        options: [{ key: 'yes', label: 'Reveal' }, { key: 'no', label: "Don't reveal" }],
        aiHint: { kind: 'elvenFarsight', card: top },
      });
      if (reveal !== 'yes') return;
      ctx.g.lg(`Elven Farsight reveals ${top.name}.`);
      if (top.is('Creature')) await ctx.g.draw(ctx.you, 1);
    },
  };
  SC['Genesis Wave'] = {
    xCost: true,
    resolve: async ctx => {
      const x = ctx.x || 0;
      const revealed = [];
      for (let i = 0; i < x && ctx.you.library.length; i++) revealed.push(ctx.you.library.pop());
      ctx.g.lg(`Genesis Wave reveals ${revealed.length} cards.`);
      const eligible = revealed.filter(card => {
        const permanent = card.is('Creature') || card.is('Artifact') || card.is('Enchantment') || card.is('Land') || card.is('Planeswalker');
        return permanent && card.mv <= x && (!card.hasSub('Aura') || auraEntryCandidates(ctx.g, card, ctx.you).length > 0);
      });
      const selected = eligible.length ? await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: eligible, min: 0, max: eligible.length,
        prompt: `Genesis Wave: choose permanents with MV ${x} or less for the battlefield`,
        aiHint: { kind: 'genesisWave', x },
      }) : [];
      // Aura attachment choices are made before any selected permanent enters,
      // preserving the simultaneous-entry rule.
      const auraHosts = new Map();
      for (const card of selected.filter(candidate => candidate.hasSub('Aura'))) {
        const host = await chooseAuraEntryHost(ctx.g, card, ctx.you);
        if (host) auraHosts.set(card, host);
      }
      const entering = selected.filter(card => !card.hasSub('Aura') || auraHosts.has(card));
      for (const card of entering) {
        card.zone = 'nowhere';
        await putPermanentDirectly(ctx.g, card, ctx.you, auraHosts.get(card));
      }
      for (const card of revealed.filter(candidate => !entering.includes(candidate))) {
        card.zone = 'graveyard'; ctx.you.graveyard.push(card);
      }
    },
  };
  SC['Overwhelming Stampede'] = {
    resolve: async ctx => {
      const best = Math.max(0, ...ctx.g.creatures(ctx.you).map(c => c.power));
      for (const c of ctx.g.creatures(ctx.you)) E.pumpUntilEOT(ctx.g, c, best, best, ['trample']);
    },
  };
  SC['Plea for Power'] = {
    resolve: async ctx => {
      const votes = await E7.vote(ctx.g, ctx.you, ctx.src, [
        { key: 'time', label: '⏰ Time (extra turn)' },
        { key: 'knowledge', label: '📚 Knowledge (3 cards)' },
      ], (voter) => voter === ctx.you ? 'time' : 'knowledge');
      if (E7.voteBeats(votes, 'time', 'knowledge')) {
        ctx.g.scheduleExtraTurn(ctx.you);
        ctx.g.lg(`${ctx.you.name} gets an EXTRA TURN!`);
      } else {
        await ctx.g.draw(ctx.you, 3);
      }
    },
  };
  SC['Raise the Palisade'] = {
    resolve: async ctx => {
      const type = await chooseElvenCreatureType(ctx.g, ctx.you, ctx.src, 'Raise the Palisade: choose a creature type');
      ctx.g.lg(`Raise the Palisade: chosen type ${type}.`);
      for (const c of ctx.g.bf().filter(c => c.is('Creature') && !c.hasSub(type)).slice()) {
        if (c.isToken) await ctx.g.move(c, 'graveyard');
        else await ctx.g.move(c, 'hand');
      }
    },
  };
  SC['Seeds of Renewal'] = {
    selfCostAdjust: (g, card, p) => -E.eachOpp(g, p).length,
    exileOnResolve: true,
    targets: [{
      zone: 'graveyard', what: 'card', count: 2, upTo: true,
      prompt: 'Up to two target cards from your graveyard', aiHint: { goal: 'reanimate' },
    }],
    resolve: async ctx => {
      for (const card of (ctx.targets[0] || [])) {
        if (card.zone !== 'graveyard') continue;
        ctx.g.remove(card); card.zone = 'hand'; ctx.you.hand.push(card);
      }
    },
  };
  SC['Sylvan Offering'] = {
    xCost: true,
    resolve: async ctx => {
      const x = ctx.x || 0;
      const o1 = await E.chooseOpponent(ctx.g, ctx.you, {
        prompt: 'Sylvan Offering — who gets the Treefolk?', goal: 'gift',
      });
      const treeDef = Object.assign({}, TK.beast33, { name: 'Treefolk', subtypes: ['Treefolk'], power: String(x), toughness: String(x) });
      await ctx.g.makeTokens(treeDef, ctx.you);
      if (o1) await ctx.g.makeTokens(treeDef, o1);
      const o2 = await E.chooseOpponent(ctx.g, ctx.you, {
        prompt: 'Sylvan Offering — who gets the Elf Warriors?', goal: 'gift',
      });
      await ctx.g.makeTokens('elfWarrior', ctx.you, { n: x });
      if (o2) await ctx.g.makeTokens('elfWarrior', o2, { n: x });
    },
  };
  SC['Travel Through Caradhras'] = {
    exileOnResolve: true,
    resolve: async ctx => {
      const votes = await E7.vote(ctx.g, ctx.you, ctx.src, [
        { key: 'pass', label: '⛰️ Redhorn Pass (lands for you)' },
        { key: 'mines', label: '⚒️ Mines of Moria (graveyard cards for you)' },
      ], (voter) => 'pass');
      const passN = votes.get('pass') || 0;
      const minesN = votes.get('mines') || 0;
      for (let i = 0; i < passN; i++) await E.searchBasic(ctx.g, ctx.you, { tapped: true });
      for (let i = 0; i < minesN && ctx.you.graveyard.length; i++) {
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: ctx.you.graveyard, min: 1, max: 1, prompt: 'Return a card to hand:', aiHint: { kind: 'reanimate' },
        });
        if (!pick[0]) break;
        ctx.g.remove(pick[0]); pick[0].zone = 'hand'; ctx.you.hand.push(pick[0]);
      }
    },
  };
  SC['Lothlórien Blade'] = {
    equip: '{5}',
    equipAlt: { filter: c => c.hasSub('Elf'), cost: '{2}' },
    triggers: [{
      on: 'attacks', desc: 'Damage to the defender',
      filter: (g, self, d) => {
        if (d.card.iid !== self.attachedTo) return false;
        const defender = d.defender instanceof MTG.Player ? d.defender : d.defender && d.defender.ctrl;
        return !!defender && g.creatures(defender).length > 0;
      },
      targets: (g, self, d) => {
        const defender = d.defender instanceof MTG.Player ? d.defender : d.defender && d.defender.ctrl;
        return [T.creature({
          prompt: 'Target creature defending player controls',
          filter: (g2, card) => card.zone === 'battlefield' && card.is('Creature') && card.ctrl === defender,
          aiHint: { goal: 'removal' },
        })];
      },
      run: async ctx => {
        const host = ctx.data.card;
        const target = ctx.targets[0];
        if (host && host.zone === 'battlefield' && target) await ctx.g.damageCreature(host, target, host.power);
      },
    }],
  };
  SC['Mirror of Galadriel'] = {
    abilities: [{
      label: 'Scry 1 + draw', cost: { tap: true, mana: (g, c) => '{' + Math.max(0, 5 - g.creatures(c.ctrl).filter(x => (x.cur.super || []).includes('Legendary')).length) + '}' },
      run: async ctx => { await E.scry(ctx.g, ctx.you, 1); await ctx.g.draw(ctx.you, 1); },
      aiScore: () => 3,
    }],
  };
  SC['Model of Unity'] = {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    triggers: [{
      on: 'voteEnd', desc: 'Scry 2 for matching votes', filter: (g, self, d) => !!d.votes,
      run: async ctx => {
        const votes = ctx.data.votes;
        const mine = votes['_by_' + ctx.you.idx];
        if (mine === undefined) return;
        const eligible = [ctx.you, ...E.eachOpp(ctx.g, ctx.you).filter(player => votes['_by_' + player.idx] === mine)];
        for (const player of eligible) {
          const use = await player.controller.decide(ctx.g, {
            type: 'chooseOption', prompt: `Model of Unity: ${player.name} — scry 2?`,
            options: [{ key: 'yes', label: 'Scry 2' }, { key: 'no', label: 'No' }],
            aiHint: { kind: 'mayScry', source: ctx.src },
          });
          if (use === 'yes') await E.scry(ctx.g, player, 2);
        }
      },
    }],
  };
  SC['Asceticism'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature')) c.cur.hexproof = true;
      },
    }],
    abilities: [{
      label: 'Regenerate', cost: { mana: '{1}{G}' },
      targets: [T.creature({ prompt: 'Target creature for a regen shield', aiHint: { goal: 'protect' } })],
      run: async ctx => { if (ctx.targets[0]) ctx.targets[0].regenShield++; },
      aiScore: () => 0.5,
    }],
  };
  SC['Lignify'] = {
    aura: true,
    auraTarget: [T.creature({ prompt: 'Enchant creature', aiHint: { goal: 'debuff' } })],
    statics: [{
      oracleLegacyAbilityLoss: true,
      // phase 1 = layer 7b (CR 613.4b): base P/T se mora postaviti PRIJE nego
      // recalc kopira base → cur, inače se upis tiho izgubi.
      phase: 1,
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (!host) return;
        host.cur.basePower = 0; host.cur.baseToughness = 4;
        host.cur.kw.clear();
        host.cur.subtypes = ['Treefolk'];
        host.cur.allCreatureTypes = false;
        host.cur.allCreatureTypesFromOtherEffects = false;
        host.cur.suppressPrintedChangeling = true;
        host.cur.extraAbilities = [];
        host.cur.abilitiesDisabled = true;
      },
    }],
  };
  SC['Song of Eärendil'] = {
    saga: [
      { run: async ctx => { await E.scry(ctx.g, ctx.you, 2); await ctx.g.draw(ctx.you, 2); } },
      { run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); await ctx.g.makeTokens('birdU', ctx.you); } },
      {
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) if (!c.kw('flying')) ctx.g.addCounters(c, 'flying', 1);
          ctx.g.lg('Song of Eärendil III: flying counters to all!');
        },
      },
    ],
    triggers: [],
  };
})();
