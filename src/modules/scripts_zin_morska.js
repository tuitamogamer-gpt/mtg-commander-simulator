// ===== scripts_zin_morska.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Card scripts: Family Matters (Zinnia) + Deep Clue Sea (Morska)
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const etbSelf = (g, self, d) => d.card === self;
  const attacksSelf = (g, self, d) => d.card === self;
  const tok = (name, types, subtypes, p, t, extra) => Object.assign({
    name, cost: null, types, subtypes: subtypes || [], super: [],
    power: p !== undefined ? String(p) : undefined, toughness: t !== undefined ? String(t) : undefined,
    oracle: '', kws: [], isTokenDef: true,
  }, extra || {});

  TK.thopter = tok('Thopter', ['Artifact', 'Creature'], ['Thopter'], 1, 1, { colorsOverride: [], kws: ['flying'] });
  TK.golem33 = tok('Phyrexian Golem', ['Artifact', 'Creature'], ['Phyrexian', 'Golem'], 3, 3, { colorsOverride: [] });
  TK.goblin = tok('Goblin', ['Creature'], ['Goblin'], 1, 1, { colorsOverride: ['R'] });
  TK.spiritW = tok('Spirit', ['Creature'], ['Spirit'], 1, 1, { colorsOverride: ['W'], kws: ['flying'] });
  TK.faerie = tok('Faerie', ['Creature'], ['Faerie'], 1, 1, { colorsOverride: ['U'], kws: ['flying'] });
  TK.frogLizard = tok('Frog Lizard', ['Creature'], ['Frog', 'Lizard'], 3, 3, { colorsOverride: ['G'] });
  TK.rabbit = tok('Rabbit', ['Creature'], ['Rabbit'], 1, 1, { colorsOverride: ['W'] });
  TK.citizen = tok('Citizen', ['Creature'], ['Citizen'], 1, 1, { colorsOverride: ['G', 'W'] });
  TK.detectiveWU = tok('Detective', ['Creature'], ['Detective'], 2, 2, { colorsOverride: ['W', 'U'] });
  TK.serpentKoma = tok("Koma's Coil", ['Creature'], ['Serpent'], 3, 3, { colorsOverride: ['U'] });
  TK.tentacle = tok('Tentacle', ['Creature'], ['Tentacle'], 1, 1, { colorsOverride: ['U'] });
  TK.tiny = tok('Tiny', ['Creature'], ['Dog', 'Detective'], 2, 2, { colorsOverride: ['G'], kws: ['trample'], super: ['Legendary'] });
  TK.rhino44 = tok('Rhino Warrior', ['Creature'], ['Rhino', 'Warrior'], 4, 4, { colorsOverride: ['G'] });
  TK.germ = tok('Germ', ['Creature'], ['Phyrexian', 'Germ'], 0, 0, { colorsOverride: ['B'] });
  TK.stormCrow = tok('Storm Crow', ['Creature'], ['Bird'], 1, 2, { colorsOverride: ['U'], kws: ['flying'] });
  TK.illusionX = tok('Illusion', ['Creature'], ['Illusion'], 0, 0, { colorsOverride: ['U'] });

  E.investigate = async function (g, p, n) {
    n = n || 1;
    // "Investigate twice/three times" su odvojeni događaji. Ovo je bitno za
    // replacement efekte (Academy/Adrix/Esix) i Erdwalov prvi investigate.
    for (let i = 0; i < n; i++) {
      await g.makeTokens('clue', p);
      await g.emit('investigated', { player: p, n: 1 });
    }
  };

  // ==================== FAMILY MATTERS (ZINNIA) ====================
  SC["Zinnia, Valley's Voice"] = {
    colorIdentityExtra: ['U', 'R', 'W'],
    cdaPower: (g, c) => 1 + g.creatures(c.ctrl).filter(x => x !== c && parseInt(x.def.power || '0', 10) === 1).length,
    grantsOffspring: '{2}',
  };
  SC['Aether Channeler'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Izbor',
      modes: {
        list: [
          { label: 'Create a 1/1 Bird token', targets: [] },
          {
            label: 'Return another nonland permanent to hand',
            targets: [{
              what: 'permanent', prompt: 'Another nonland permanent',
              filter: (g, card, ctrl, src) => card.zone === 'battlefield' && !card.is('Land') && card !== src,
              aiHint: { goal: 'bounce' },
            }],
          },
          { label: 'Draw a card', targets: [] },
        ],
      },
      run: async ctx => {
        if (ctx.mode === 0) await ctx.g.makeTokens('birdW', ctx.you);
        else if (ctx.mode === 1 && ctx.targets[0]) await ctx.g.move(ctx.targets[0], 'hand');
        else if (ctx.mode === 2) await ctx.g.draw(ctx.you, 1);
      },
    }],
  };
  SC['Agate Instigator'] = {
    offspring: '{1}{R}',
    triggers: [{
      on: 'etb', desc: '1 šteta protivnicima',
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature'),
      run: async ctx => { await ctx.g.damageOpponents(ctx.src, ctx.you, 1); },
    }],
  };
  SC['Arthur, Marigold Knight'] = {
    triggers: [{
      on: 'attacks', filter: attacksSelf, desc: 'Boost',
      onlyIf: (g, self) => g.combat && g.combat.attackers.length >= 2,
      run: async ctx => {
        const g = ctx.g, p = ctx.you;
        const top = p.library.slice(-6).reverse();
        const creatures = top.filter(c => c.is('Creature'));
        let pickedCreature = null;
        if (creatures.length) {
          const pick = await p.controller.decide(g, {
            type: 'chooseCards', from: creatures, min: 0, max: 1, prompt: 'Stavi u napad:', aiHint: { kind: 'bestCard' },
          });
          if (pick.length) {
            const c = pick[0];
            pickedCreature = c;
            p.library.splice(p.library.indexOf(c), 1);
            c.zone = 'nowhere';
            await g.move(c, 'battlefield', { ctrl: p, tapped: true, attacking: ctx.src.attacking });
            c.meta._returnEOC = true;
            g.delayed.push({
              on: 'endCombat', once: true, name: 'Arthur povratak', ctrl: p,
              run: async c2 => { if (c.zone === 'battlefield') { c2.g.remove(c); c.zone = 'hand'; p.hand.push(c); c2.g.lg(`${c.name} se vraća u ruku.`); } },
            });
          }
        }
        const rest = top.filter(c => c !== pickedCreature);
        U.shuffle(rest, g.rnd);
        for (const c of rest) { const i = p.library.indexOf(c); if (i >= 0) { p.library.splice(i, 1); c.zone = 'library'; p.library.unshift(c); } }
      },
    }],
  };
  SC['Blade Splicer'] = {
    triggers: [{ on: 'etb', filter: etbSelf, desc: 'Golem', run: async ctx => { await ctx.g.makeTokens('golem33', ctx.you); } }],
    statics: [{
      apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.hasSub('Golem')) c.cur.kw.add('first strike'); },
    }],
  };
  SC["Boss's Chauffeur"] = {
    etbCounters: { kind: '+1/+1', n: (g, card) => 1 + g.creatures(card.ctrl).filter(c => c !== card).length },
    triggers: [
      {
        on: 'etb', desc: '+1/+1',
        filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature'),
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      },
      {
        on: 'dies', filter: etbSelf, desc: 'Citizeni',
        run: async ctx => { const n = ctx.data.snap.plus1 || 0; if (n) await ctx.g.makeTokens('citizen', ctx.you, { n }); },
      },
    ],
  };
  SC['Circuit Mender'] = {
    triggers: [
      { on: 'etb', filter: etbSelf, desc: '+2 života', run: async ctx => { await ctx.g.gainLife(ctx.you, 2); } },
      { on: 'lto', filter: (g, self, d) => d.card === self, desc: 'Vuci', run: async ctx => { await ctx.g.draw(ctx.you, 1); } },
    ],
  };
  SC['Cloudblazer'] = {
    triggers: [{ on: 'etb', filter: etbSelf, desc: '2 života + 2 karte', run: async ctx => { await ctx.g.gainLife(ctx.you, 2); await ctx.g.draw(ctx.you, 2); } }],
  };
  SC['Combat Celebrant'] = {
    triggers: [{
      on: 'attacks', filter: attacksSelf, opt: true, desc: 'Exert: extra combat',
      onlyIf: (g, self) => self.meta._exertedTurn !== g.turnNo,
      run: async ctx => {
        const g = ctx.g;
        ctx.src.meta._exertedTurn = g.turnNo;
        ctx.src.meta.noUntapOnce = true;
        for (const c of g.creatures(ctx.you)) if (c !== ctx.src && c.tapped) { c.tapped = false; c.meta._untapExtra = false; }
        g.scheduleAdditionalCombat();
        g.lg('Combat Celebrant: EXERT — additional combat phase!');
      },
    }],
  };
  SC['Curiosity Crafter'] = {
    noMaxHand: true,
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Vuci',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.isToken,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Devilish Valet'] = {
    triggers: [{
      on: 'etb', desc: 'Dupli power',
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature'),
      run: async ctx => {
        const self = ctx.src, iid = self.iid, base = self.power;
        ctx.g.untilEffects.push({
          expires: 'eot',
          apply: (g2, bf) => { const c = bf.find(x => x.iid === iid); if (c) c.cur.power *= 2; },
        });
        ctx.g.recalc();
      },
    }],
  };
  SC['Hanged Executioner'] = {
    triggers: [{ on: 'etb', filter: etbSelf, desc: 'Spirit', run: async ctx => { await ctx.g.makeTokens('spiritW', ctx.you); } }],
    abilities: [{
      label: 'Egzilaj sebe: egzilaj stvorenje', cost: { mana: '{3}{W}', exileSelf: true },
      targets: [T.creature({ prompt: 'Egzilaj', aiHint: { goal: 'removal' } })],
      run: async ctx => { await ctx.g.exileCard(ctx.targets[0]); },
    }],
  };
  SC['Illusory Ambusher'] = {
    kws: ['flash'],
    triggers: [{
      on: 'dealtDamage', desc: 'Vuci karte', filter: (g, self, d) => d.target === self,
      run: async ctx => { await ctx.g.draw(ctx.you, ctx.data.n); },
    }],
  };
  SC['Inferno Titan'] = {
    abilities: [{ label: '+1/+0', cost: { mana: '{R}' }, run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, 1, 0); } }],
    triggers: ['etb', 'attacks'].map(on => ({
      on, filter: on === 'etb' ? etbSelf : attacksSelf, desc: 'Divide 3 damage',
      targets: [T.any({
        prompt: 'Inferno Titan: choose one, two, or three targets', count: 3, min: 1,
        aiHint: { goal: 'damage', n: 3 },
      })],
      prepareTargets: async ctx => {
        const targets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : [];
        const division = await E.divideDamage(ctx.g, ctx.you, ctx.src, targets, 3);
        if (!division) return false;
        ctx.damageDivision = division;
        return true;
      },
      run: async ctx => {
        const targets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : [];
        for (const target of targets) {
          const assignment = (ctx.damageDivision || []).find(entry =>
            target instanceof MTG.Player ? entry.playerIdx === target.idx : entry.iid === target.iid);
          if (!assignment) continue;
          if (target instanceof MTG.Player) await ctx.g.damagePlayer(ctx.src, target, assignment.n);
          else await ctx.g.damageCreature(ctx.src, target, assignment.n, { deferSBA: true });
        }
        await ctx.g.checkSBA();
      },
    })),
  };
  SC['Inspiring Overseer'] = {
    triggers: [{ on: 'etb', filter: etbSelf, desc: '1 život + karta', run: async ctx => { await ctx.g.gainLife(ctx.you, 1); await ctx.g.draw(ctx.you, 1); } }],
  };
  SC['Jacked Rabbit'] = {
    etbCounters: { kind: '+1/+1', n: (g, card) => (card.castMeta && card.castMeta.x) || 0 },
    triggers: [
      {
        on: 'etb', filter: etbSelf, desc: 'Ravenous draw',
        onlyIf: (g, self) => ((self.castMeta && self.castMeta.x) || 0) >= 5,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
      {
        on: 'attacks', filter: attacksSelf, desc: 'Rabbits',
        run: async ctx => { const n = Math.max(0, ctx.src.power); if (n) await ctx.g.makeTokens('rabbit', ctx.you, { n }); },
      },
    ],
  };
  SC['Jazal Goldmane'] = {
    abilities: [{
      label: 'Napadači +X/+X', cost: { mana: '{3}{W}{W}' },
      cond: (g, c, p) => g.combat && g.combat.attackers.some(a => a.ctrl === p),
      run: async ctx => {
        const mine = ctx.g.combat.attackers.filter(a => a.ctrl === ctx.you);
        const x = mine.length;
        for (const a of mine) E.pumpUntilEOT(ctx.g, a, x, x);
      },
    }],
  };
  SC['Loyal Warhound'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Nađi Plains',
      onlyIf: (g, self) => E.eachOpp(g, self.ctrl).some(o => g.lands(o).length > g.lands(self.ctrl).length),
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: true, filter: d => d.subtypes.includes('Plains') }); },
    }],
  };
  SC['Luminous Broodmoth'] = {
    triggers: [{
      on: 'dies', desc: 'Povratak sa flying',
      filter: (g, self, d) => d.snap.ctrl === self.ctrl && d.snap.types.includes('Creature') && !d.snap.isToken && d.card !== self,
      run: async ctx => {
        const c = ctx.data.card;
        if (c.zone !== 'graveyard' || c.meta._mothed) return;
        if (ctx.data.snap.flying) return;
        await ctx.g.move(c, 'battlefield', { ctrl: c.owner });
        c.meta._mothed = true;
        ctx.g.addCounters(c, 'flying', 1, true);
        c.meta.hasFlyingCounter = true;
        ctx.g.lg(`${c.name} se vraća sa flying counterom (Broodmoth).`);
        ctx.g.recalc();
      },
    }],
  };
  SC['Ornithopter of Paradise'] = { mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] } };
  SC['Plumecreed Escort'] = {
    kws: ['flash'],
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Hexproof',
      targets: [T.yourCreature({ prompt: 'Hexproof do kraja poteza', aiHint: { goal: 'protect' } })],
      run: async ctx => {
        const iid = ctx.targets[0].iid;
        ctx.g.untilEffects.push({
          expires: 'eot',
          apply: (g2, bf) => { const c = bf.find(x => x.iid === iid); if (c) { c.cur.hexproof = true; c.cur.kw.add('hexproof'); } },
        });
        ctx.g.recalc();
      },
    }],
  };
  SC['Pollywog Prodigy'] = {
    triggers: [
      {
        on: 'etb', desc: 'Evolve',
        filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature') &&
          (d.card.power > self.power || d.card.toughness > self.toughness),
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      },
      {
        on: 'castNonCreature', desc: 'Vuci',
        filter: (g, self, d) => d.player !== self.ctrl && d.mv < self.power,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };
  SC['Rapid Augmenter'] = {
    triggers: [
      {
        on: 'etb', desc: 'Haste malom',
        filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature') && parseInt(d.card.def.power || '0', 10) === 1,
        run: async ctx => { ctx.data.card.meta.tempHaste = true; ctx.g.recalc(); },
      },
      {
        on: 'etb', desc: '+1/+1 + unblockable',
        filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature') &&
          d.card.meta._enteredFromZone !== 'stack',
        run: async ctx => {
          ctx.g.addCounters(ctx.src, '+1/+1', 1);
          const iid = ctx.src.iid;
          ctx.g.untilEffects.push({ expires: 'eot', apply: (g2, bf) => { const c = bf.find(x => x.iid === iid); if (c) c.cur.unblockable = true; } });
          ctx.g.recalc();
        },
      },
    ],
  };
  SC['Restoration Angel'] = {
    kws: ['flash'],
    triggers: [{
      on: 'etb', filter: etbSelf, opt: true, desc: 'Flicker',
      targets: [{
        what: 'creature', prompt: 'Your non-Angel creature', upTo: true,
        filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl === ctrl && !c.hasSub('Angel'),
        aiHint: { goal: 'protect' },
      }],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t || t.isToken) return;
        const owner = t.owner;
        await ctx.g.move(t, 'exile');
        if (t.zone === 'exile') {
          owner.exile.splice(owner.exile.indexOf(t), 1);
          t.zone = 'nowhere';
          await ctx.g.move(t, 'battlefield', { ctrl: ctx.you });
        }
      },
    }],
  };
  SC['Rose Room Treasurer'] = {
    triggers: [{
      on: 'etb', desc: 'Treasure / šteta',
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature'),
      run: async ctx => {
        const self = ctx.src;
        self.meta._rr = (self.meta._rr || 0) + 1;
        if (self.meta._rrTurn !== ctx.g.turnNo) { self.meta._rrTurn = ctx.g.turnNo; self.meta._rr = 1; }
        if (self.meta._rr <= 2) { await ctx.g.makeTokens('treasure', ctx.you); return; }
        const maxX = ctx.g.maxAffordableX(ctx.you, { generic: 0, x: 1, pips: [] }, self);
        if (!maxX) return;
        const x = await ctx.you.controller.decide(ctx.g, { type: 'chooseX', min: 0, max: maxX, prompt: 'X štete?', aiHint: { kind: 'chooseX' } });
        if (!x) return;
        const ok = await ctx.g.payMana(ctx.you, U.parseCost('{' + x + '}'));
        if (!ok) return;
        const cands = ctx.g.legalTargets({ what: 'any' }, self, ctx.you);
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseTargets', candidates: cands, min: 1, max: 1, prompt: `${x} štete u:`, aiHint: { goal: 'damage', n: x } });
        if (pick.length) await ctx.g.damageAny(self, pick[0], x);
      },
    }],
  };
  SC['Selfless Spirit'] = {
    abilities: [{
      label: 'Žrtvuj: indestructible svima', cost: { sacSelf: true },
      run: async ctx => { E.pumpAllUntilEOT(ctx.g, (g, c) => c.ctrl === ctx.you, 0, 0, ['indestructible']); },
    }],
  };
  SC['Shield Broker'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Ukradi uz shield',
      targets: [{
        what: 'creature', prompt: 'Protivničko ne-commander stvorenje',
        filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl !== ctrl && !c.commander,
        aiHint: { goal: 'steal' }, upTo: true,
      }],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t) return;
        ctx.g.addCounters(t, 'shield', 1, true);
        t.meta._brokerOrig = t.ctrl.idx;
        t.meta._brokerBy = ctx.src.iid;      // koji Shield Broker ga je uzeo
        t.ctrl = ctx.you;
        t.sick = true;                        // CR 302.6: promjena kontrole = summoning sickness
        ctx.g.lg(`${ctx.you.name} preuzima ${t.name} (dok ima shield counter).`);
        ctx.g.recalc();
      },
    }, {
      on: 'shieldRemoved', desc: 'Vrati kontrolu',
      filter: (g, self, d) => d.card.meta && d.card.meta._brokerBy === self.iid && (d.card.counters['shield'] || 0) === 0,
      run: async ctx => {
        const c = ctx.data.card;
        // Ponovna provjera pri rezoluciji: sa dva Shield Brokera na stolu oba
        // trigera stignu na stack, a prvi već vrati kontrolu i obriše marker.
        if (!c || c.meta._brokerBy !== ctx.src.iid) return;
        const back = ctx.g.players[c.meta._brokerOrig];
        delete c.meta._brokerOrig; delete c.meta._brokerBy;
        if (!back) return;
        c.ctrl = back;
        c.sick = true;
        ctx.g.lg(`${c.name} se vraća vlasniku.`);
        ctx.g.recalc();
      },
    }],
  };
  SC['Siege-Gang Commander'] = {
    triggers: [{ on: 'etb', filter: etbSelf, desc: '3 goblina', run: async ctx => { await ctx.g.makeTokens('goblin', ctx.you, { n: 3 }); } }],
    abilities: [{
      label: 'Žrtvuj goblina: 2 štete', cost: { mana: '{1}{R}', sac: (g, x) => x.hasSub('Goblin') },
      targets: [T.any({ prompt: '2 štete u:', aiHint: { goal: 'damage', n: 2 } })],
      run: async ctx => { await ctx.g.damageAny(ctx.src, ctx.targets[0], 2); },
    }],
  };
  SC['Skyclave Apparition'] = {
    triggers: [
      {
        on: 'etb', filter: etbSelf, desc: 'Egzilaj MV≤4',
        targets: [{
          what: 'permanent', prompt: 'Nonland nontoken MV≤4', upTo: true,
          filter: (g, c, ctrl) => c.zone === 'battlefield' && !c.is('Land') && !c.isToken && c.ctrl !== ctrl && c.mv <= 4,
          aiHint: { goal: 'removal' },
        }],
        run: async ctx => {
          const t = ctx.targets[0];
          if (!t) return;
          ctx.src.meta._exiledMV = t.mv;
          ctx.src.meta._exiledOwner = t.owner.idx;
          await ctx.g.exileCard(t);
        },
      },
      {
        on: 'lto', filter: (g, self, d) => d.card === self, desc: 'Illusion',
        onlyIf: (g, self) => self.meta._exiledMV !== undefined,
        run: async ctx => {
          const x = ctx.src.meta._exiledMV;
          const owner = ctx.g.players[ctx.src.meta._exiledOwner];
          const def = Object.assign({}, TK.illusionX, { power: String(x), toughness: String(x) });
          await ctx.g.makeTokens(def, owner);
        },
      },
    ],
  };
  SC['Spirited Companion'] = {
    triggers: [{ on: 'etb', filter: etbSelf, desc: 'Vuci', run: async ctx => { await ctx.g.draw(ctx.you, 1); } }],
  };
  SC['Tetsuko Umezawa, Fugitive'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature') && (c.cur.power <= 1 || c.cur.toughness <= 1)) c.cur.unblockable = true;
      },
    }],
  };
  SC['Thopter Engineer'] = {
    triggers: [{ on: 'etb', filter: etbSelf, desc: 'Thopter', run: async ctx => { await ctx.g.makeTokens('thopter', ctx.you); } }],
    statics: [{
      apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.is('Artifact') && c.is('Creature')) c.cur.kw.add('haste'); },
    }],
  };
  SC['Aetherize'] = {
    resolve: async ctx => {
      if (!ctx.g.combat) return;
      for (const a of ctx.g.combat.attackers.slice()) if (a.zone === 'battlefield') await ctx.g.move(a, 'hand');
      ctx.g.lg('Aetherize: svi napadači vraćeni u ruke!');
    },
  };
  SC['Path to Exile'] = {
    targets: [T.creature({ prompt: 'Egzilaj', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0];
      if (!t) return;
      const c2 = t.ctrl;
      await ctx.g.exileCard(t);
      const search = await c2.controller.decide(ctx.g, {
        type: 'chooseOption', prompt: `${c2.name}: search for a basic land after Path to Exile?`,
        options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
        aiHint: { kind: 'rampChoice' },
      });
      if (search === 'yes') await E.searchBasic(ctx.g, c2, { tapped: true });
    },
  };
  SC['Pull from Tomorrow'] = {
    resolve: async ctx => {
      await ctx.g.draw(ctx.you, ctx.x || 0);
      if (ctx.you.hand.length) {
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: ctx.you.hand, min: 1, max: 1, prompt: 'Odbaci 1', aiHint: { kind: 'cleanupDiscard' },
        });
        await ctx.g.discard(ctx.you, pick);
      }
    },
  };
  SC['Rapid Hybridization'] = {
    targets: [T.creature({ prompt: 'Uništi (3/3 Frog)', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0], c2 = t.ctrl;
      if (await ctx.g.destroy(t, { noRegen: true })) await ctx.g.makeTokens('frogLizard', c2);
    },
  };
  SC['Rowdy Research'] = {
    selfCostAdjust: (g, card, p) => -(p.turnState.attackedCount || 0),
    resolve: async ctx => { await ctx.g.draw(ctx.you, 3); },
  };
  SC['Calamity of Cinders'] = {
    convoke: true,
    resolve: async ctx => {
      for (const c of ctx.g.bf().filter(c => c.is('Creature') && !c.tapped).slice()) await ctx.g.damageCreature(ctx.src, c, 6);
    },
  };
  SC['Chart a Course'] = {
    resolve: async ctx => {
      await ctx.g.draw(ctx.you, 2);
      if (!ctx.you.turnState.attacked && ctx.you.hand.length) {
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: ctx.you.hand, min: 1, max: 1, prompt: 'Odbaci 1 (nisi napao)', aiHint: { kind: 'cleanupDiscard' },
        });
        await ctx.g.discard(ctx.you, pick);
      }
    },
  };
  SC['Cut a Deal'] = {
    resolve: async ctx => {
      let n = 0;
      for (const o of E.eachOpp(ctx.g, ctx.you)) n += await ctx.g.draw(o, 1);
      await ctx.g.draw(ctx.you, n);
    },
  };
  SC['Dusk'] = {
    resolve: async ctx => {
      for (const c of ctx.g.bf().filter(c => c.is('Creature') && c.power >= 3).slice()) await ctx.g.destroy(c);
    },
    // Dawn (aftermath polovina): bez ovoga je castSpell padao nazad na `resolve`
    // i bacao DRUGI board wipe umjesto masovnog vraćanja iz groblja.
    aftermathResolve: async ctx => {
      const back = ctx.you.graveyard.filter(c => c.is('Creature') && parseInt(c.def.power || '0', 10) <= 2).slice();
      for (const c of back) await ctx.g.move(c, 'hand');
      ctx.g.lg(`Dawn: ${back.length} stvorenja nazad u ruku.`);
    },
    flashback: { cost: '{3}{W}{W}', altCostStr: '{3}{W}{W}', speed: 'sorcery', isAftermath: true },
  };
  SC['Stolen by the Fae'] = {
    // "Return target creature with mana value X" — meta mora imati MV TAČNO X.
    // Ranije je filter bio "bilo koje stvorenje", pa je za {U}{U} (X=0) bounceovao
    // i komandera protivnika.
    xValues: (g, card, p) => [...new Set(g.legalTargets(T.creature({
      filter: (g2, creature) => creature.zone === 'battlefield' && creature.is('Creature'),
    }), card, p).map(creature => creature.mv))],
    targets: (g, card, castOpts) => [{
      what: 'creature', prompt: 'Vrati u ruku (MV = X)',
      filter: (g2, c) => c.zone === 'battlefield' && c.is('Creature') &&
        c.mv === ((castOpts && castOpts.xVal) || 0),
      aiHint: { goal: 'bounce' },
    }],
    resolve: async ctx => {
      const t = ctx.targets[0], x = ctx.x || 0;
      if (t && t.zone === 'battlefield') await ctx.g.move(t, 'hand');
      if (x) await ctx.g.makeTokens('faerie', ctx.you, { n: x });
    },
  };
  SC['Storm of Souls'] = {
    exileOnResolve: true,
    resolve: async ctx => {
      const g = ctx.g, p = ctx.you;
      for (const c of p.graveyard.filter(c => c.is('Creature')).slice()) {
        await E.reanimate(g, p, c);
        if (c.zone === 'battlefield') {
          const iid = c.iid;
          g.untilEffects.push({
            expires: 'never', kind: 'spirit11',
            apply: (g2, bf) => {
              const x = bf.find(y => y.iid === iid);
              if (!x) return;
              x.cur.basePower = 1; x.cur.baseToughness = 1;
              x.cur.power = 1 + (x.counters['+1/+1'] || 0); x.cur.toughness = 1 + (x.counters['+1/+1'] || 0);
              x.cur.kw.add('flying');
              if (!x.cur.subtypes.includes('Spirit')) x.cur.subtypes.push('Spirit');
            },
          });
        }
      }
      g.recalc();
    },
  };
  SC['Time Wipe'] = {
    resolve: async ctx => {
      const g = ctx.g;
      const mine = g.creatures(ctx.you);
      if (mine.length) {
        const pick = await ctx.you.controller.decide(g, {
          type: 'chooseCards', from: mine, min: 1, max: 1, prompt: 'Vrati svoje u ruku:', aiHint: { kind: 'keepBest' },
        });
        if (pick.length) await g.move(pick[0], 'hand');
      }
      for (const c of g.bf().filter(c => c.is('Creature')).slice()) await g.destroy(c);
    },
  };
  SC['Bident of Thassa'] = {
    triggers: [{
      on: 'combatDamageToPlayer', opt: true, desc: 'Vuci',
      filter: (g, self, d) => d.card.ctrl === self.ctrl,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
    abilities: [{
      label: 'Protivnici moraju napadati', cost: { mana: '{1}{U}', tap: true },
      run: async ctx => {
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          ctx.g.untilEffects.push({ kind: 'mustAttack', who: o, expires: 'eot' });
        }
        ctx.g.lg('Bident: protivnička stvorenja napadaju ovaj potez ako mogu.');
      },
    }],
  };
  SC['Boros Signet'] = { mana: { cost: { tap: true, mana: '{1}' }, produce: [{ R: 1, W: 1 }] } };
  SC['Echoing Assault'] = {
    statics: [{
      apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.isToken && c.is('Creature')) c.cur.kw.add('menace'); },
    }],
    triggers: [{
      on: 'attackersDeclared', desc: 'Kopija napadača',
      filter: (g, self, d) => d.player === self.ctrl && d.attackers.some(a => !a.isToken && a.attacking instanceof MTG.Player),
      run: async ctx => {
        const attackedPlayers = [...new Set(ctx.data.attackers
          .filter(a => !a.isToken && a.attacking instanceof MTG.Player)
          .map(a => a.attacking))];
        for (const attacked of attackedPlayers) {
          const cands = ctx.data.attackers.filter(a => !a.isToken && a.attacking === attacked && a.zone === 'battlefield');
          if (!cands.length) continue;
          const pick = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: cands, min: 0, max: 1,
            prompt: `Kopiraj napadača koji napada ${attacked.name} (1/1):`, aiHint: { kind: 'echoingAssault' },
          });
          if (!pick.length) continue;
          const orig = pick[0];
          const made = await ctx.g.copyPermanentToken(orig, ctx.you, { modPT: [1, 1], tapped: true, attacking: attacked });
          for (const m of made) {
            ctx.g.delayed.push({
              on: 'endStep', once: true, name: 'Echoing sac', ctrl: ctx.you,
              run: async c2 => { if (m.zone === 'battlefield') await c2.g.sacrifice(ctx.you, m); },
            });
          }
        }
      },
    }],
  };
  SC["Fortune Teller's Talent"] = {
    asEnters: async (g, card) => { card.meta.level = 1; },
    revealOwnTop: true,
    playTop: (g, self) => (self.meta.level || 1) >= 2 && self.ctrl.turnState.spellsCast > 0,
    abilities: [
      { label: 'Level 2', cost: { mana: '{3}{U}' }, sorcery: true, cond: (g, c) => (c.meta.level || 1) === 1, run: async ctx => { ctx.src.meta.level = 2; ctx.g.lg('Fortune Teller → L2.'); } },
      { label: 'Level 3', cost: { mana: '{2}{U}' }, sorcery: true, cond: (g, c) => (c.meta.level || 1) === 2, run: async ctx => { ctx.src.meta.level = 3; ctx.g.lg('Fortune Teller → L3.'); } },
    ],
    costMods: [(g, self, info) => {
      if (info.player !== self.ctrl || (self.meta.level || 1) < 3) return 0;
      if (info.card.zone !== 'hand') return -2;
      return 0;
    }],
  };
  SC['Murmuration'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature') && c.hasSub('Bird')) { c.cur.power++; c.cur.toughness++; c.cur.kw.add('vigilance'); }
      },
    }],
    triggers: [{
      on: 'endStep', desc: 'Storm Crows', filter: (g, self, d) => d.player === self.ctrl,
      onlyIf: (g, self) => self.ctrl.turnState.spellsCast > 0,
      run: async ctx => { await ctx.g.makeTokens('stormCrow', ctx.you, { n: ctx.you.turnState.spellsCast }); },
    }],
  };

  // ==================== DEEP CLUE SEA (MORSKA) ====================
  SC['Morska, Undersea Sleuth'] = {
    colorIdentityExtra: ['G', 'W', 'U'],
    noMaxHand: true,
    triggers: [
      { on: 'upkeep', desc: 'Istraga', filter: (g, self, d) => d.player === self.ctrl, run: async ctx => { await E.investigate(ctx.g, ctx.you); } },
      {
        on: 'draw', desc: '+2 countera', filter: (g, self, d) => d.player === self.ctrl && d.player.turnState.drewThisTurn === 2,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 2); },
      },
    ],
  };
  SC['Adrix and Nev, Twincasters'] = {
    replace: [{
      event: 'createToken',
      run: (g, defs, ctrl, src) => defs.concat(defs),
      priority: 3,
    }],
  };
  SC['Aerial Extortionist'] = {
    exileAndPermit: async (g, card) => {
      if (!card) return;
      const owner = card.owner;
      await g.exileCard(card);
      if (card.zone !== 'exile') return;
      card.meta = card.meta || {};
      card.meta.playableBy = owner;
      card.meta.playableUntil = 9999;
    },
    triggers: [
      {
        on: 'etb', filter: etbSelf, desc: 'Egzilaj nonland',
        targets: [{ what: 'permanent', prompt: 'Nonland', upTo: true, filter: (g, c) => c.zone === 'battlefield' && !c.is('Land'), aiHint: { goal: 'removal' } }],
        run: async ctx => { await ctx.src.def.exileAndPermit(ctx.g, ctx.targets[0]); },
      },
      {
        on: 'combatDamageToPlayer', filter: (g, self, d) => d.card === self, desc: 'Egzilaj nonland',
        targets: [{ what: 'permanent', prompt: 'Nonland', upTo: true, filter: (g, c) => c.zone === 'battlefield' && !c.is('Land'), aiHint: { goal: 'removal' } }],
        run: async ctx => { await ctx.src.def.exileAndPermit(ctx.g, ctx.targets[0]); },
      },
      {
        on: 'cast', desc: 'Vuci',
        filter: (g, self, d) => d.player !== self.ctrl && !d.fromHand,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };
  SC['Alandra, Sky Dreamer'] = {
    triggers: [
      {
        on: 'draw', desc: 'Drake', filter: (g, self, d) => d.player === self.ctrl && d.player.turnState.drewThisTurn === 2,
        run: async ctx => { await ctx.g.makeTokens('drake', ctx.you); },
      },
      {
        on: 'draw', desc: '+X/+X', filter: (g, self, d) => d.player === self.ctrl && d.player.turnState.drewThisTurn === 5,
        run: async ctx => {
          const x = ctx.you.hand.length;
          E.pumpAllUntilEOT(ctx.g, (g, c) => c.ctrl === ctx.you && (c === ctx.src || c.hasSub('Drake')), x, x);
        },
      },
    ],
  };
  SC['Bennie Bracks, Zoologist'] = {
    convoke: true,
    triggers: [{
      on: 'endStep', desc: 'Vuci', filter: () => true,
      onlyIf: (g, self) => self.ctrl.turnState.tokensCreated > 0,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Chulane, Teller of Tales'] = {
    colorIdentityExtra: ['G', 'W', 'U'],
    triggers: [{
      on: 'castCreature', desc: 'Vuci + land', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        await ctx.g.draw(ctx.you, 1);
        const lands = ctx.you.hand.filter(c => c.is('Land'));
        if (lands.length) {
          const pick = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: lands, min: 0, max: 1, prompt: 'Stavi land:', aiHint: { kind: 'bestLand' },
          });
          if (pick.length) {
            ctx.you.hand.splice(ctx.you.hand.indexOf(pick[0]), 1);
            pick[0].zone = 'nowhere';
            await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you });
          }
        }
      },
    }],
    abilities: [{
      label: 'Bounce svoje stvorenje', cost: { mana: '{3}', tap: true },
      targets: [T.yourCreature({ prompt: 'Vrati u ruku', aiHint: { goal: 'protect' } })],
      run: async ctx => { await ctx.g.move(ctx.targets[0], 'hand'); },
    }],
  };
  SC['Detective of the Month'] = {
    statics: [{
      cond: (g, self) => self.ctrl.cityBlessing,
      apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.hasSub('Detective')) c.cur.unblockable = true; },
    }],
    triggers: [{
      on: 'draw', desc: 'Detective token', filter: (g, self, d) => d.player === self.ctrl && d.player.turnState.drewThisTurn === 2,
      run: async ctx => { await ctx.g.makeTokens('detectiveWU', ctx.you); },
    }],
  };
  SC['Erdwal Illuminator'] = {
    triggers: [{
      on: 'investigated', oncePerTurn: true, desc: 'Dodatna istraga',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await E.investigate(ctx.g, ctx.you); },
    }],
  };
  SC['Esix, Fractal Bloom'] = {
    replace: [{
      event: 'createToken', priority: 4,
      cond: (g, self) => g.turnPlayer === self.ctrl && self.meta._esixTurn !== g.turnNo,
      run: async (g, defs, ctrl, src) => {
        const cands = g.bf().filter(c => c.is('Creature') && c !== src);
        if (!cands.length) return defs;
        src.meta._esixTurn = g.turnNo;
        const picked = await ctrl.controller.decide(g, {
          type: 'chooseCards', from: cands, min: 0, max: 1,
          prompt: 'Esix: tokeni mogu postati kopije kojeg stvorenja?', aiHint: { kind: 'esixCopy' },
        });
        const chosen = picked[0];
        if (!chosen) return defs;
        g.lg(`Esix: tokeni postaju kopije ${chosen.name}!`);
        const base = chosen.isCopyOf ? chosen.isCopyOf : chosen.def;
        return defs.map(() => Object.assign({}, base));
      },
    }],
  };
  SC['Ethereal Investigator'] = {
    triggers: [
      { on: 'etb', filter: etbSelf, desc: 'Istrage', run: async ctx => { await E.investigate(ctx.g, ctx.you, E.eachOpp(ctx.g, ctx.you).length); } },
      {
        on: 'draw', desc: 'Spirit', filter: (g, self, d) => d.player === self.ctrl && d.player.turnState.drewThisTurn === 2,
        run: async ctx => { await ctx.g.makeTokens('spiritW', ctx.you); },
      },
    ],
  };
  SC['Graf Mole'] = {
    triggers: [{
      on: 'sacrificed', desc: '+3 života',
      filter: (g, self, d) => d.player === self.ctrl && d.card.hasSub && d.card.hasSub('Clue'),
      run: async ctx => { await ctx.g.gainLife(ctx.you, 3); },
    }],
  };
  SC['Hornet Queen'] = {
    triggers: [{ on: 'etb', filter: etbSelf, desc: '4 stršljena', run: async ctx => { await ctx.g.makeTokens('insectFD', ctx.you, { n: 4 }); } }],
  };
  SC['Hydroid Krasis'] = {
    etbCounters: { kind: '+1/+1', n: (g, card) => (card.castMeta && card.castMeta.x) || 0 },
    triggers: [{
      // zone:'stack' — izvor je spell koji se upravo baca, nije na bojnom polju
      on: 'cast', zone: 'stack', desc: 'Život + karte', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const x = (ctx.src.castMeta && ctx.src.castMeta.x) || 0;
        await ctx.g.gainLife(ctx.you, Math.floor(x / 2));
        await ctx.g.draw(ctx.you, Math.floor(x / 2));
      },
    }],
  };
  SC['Innocuous Researcher'] = {
    triggers: [
      {
        on: 'attacks', filter: attacksSelf, desc: 'Parley',
        run: async ctx => {
          const g = ctx.g;
          let inv = 0;
          for (const q of g.alivePlayers()) {
            if (!q.library.length) continue;
            const top = q.library[q.library.length - 1];
            g.lg(`${q.name} otkriva: ${top.name}.`);
            if (!top.is('Land')) inv++;
          }
          if (inv) await E.investigate(g, ctx.you, inv);
          for (const q of g.alivePlayers()) await g.draw(q, 1);
        },
      },
      {
        on: 'endStep', desc: 'Untap lands and lock spells', opt: true,
        aiHint: { kind: 'innocuousUntap' },
        filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          for (const land of ctx.g.lands(ctx.you)) land.tapped = false;
          ctx.you.cantCastUntilTurnStart = ctx.you.turnsStarted + 1;
          ctx.g.recalc();
        },
      },
    ],
  };
  SC['Jolrael, Mwonvuli Recluse'] = {
    triggers: [{
      on: 'draw', desc: 'Cat', filter: (g, self, d) => d.player === self.ctrl && d.player.turnState.drewThisTurn === 2,
      run: async ctx => { await ctx.g.makeTokens('cat22', ctx.you); },
    }],
    abilities: [{
      label: 'Sva stvorenja X/X', cost: { mana: '{4}{G}{G}' },
      run: async ctx => {
        const you = ctx.you;
        ctx.g.untilEffects.push({
          expires: 'eot',
          apply: (g2, bf) => {
            const x = you.hand.length;
            for (const c of bf) if (c.ctrl === you && c.is('Creature')) { c.cur.power = x + (c.counters['+1/+1'] || 0); c.cur.toughness = x + (c.counters['+1/+1'] || 0); }
          },
        });
        ctx.g.recalc();
      },
    }],
  };
  SC['Junk Winder'] = {
    selfCostAdjust: (g, card, p) => -g.bf().filter(c => c.ctrl === p && c.isToken).length,
    triggers: [{
      on: 'etb', desc: 'Tapni', filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.isToken,
      onlyIf: (g, self) => g.bf().some(c => c.ctrl !== self.ctrl && !c.is('Land')),
      targets: [T.permanent((g, c, ctrl) => c.ctrl !== ctrl && !c.is('Land'), {
        prompt: 'Tapni (ne untapuje se):', aiHint: { goal: 'removal' },
      })],
      run: async ctx => {
        const target = ctx.targets[0];
        if (target) { target.tapped = true; target.meta.noUntapOnce = true; ctx.g.lg(`${target.name} zaključan.`); }
      },
    }],
  };
  SC['Kappa Cannoneer'] = {
    improvise: true,
    triggers: [{
      // "Whenever THIS CREATURE or another artifact you control enters" — Kappa je
      // artefakt-stvorenje, pa okida i na vlastiti ulazak (dolazi kao 5/5 unblockable).
      on: 'etb', desc: '+1/+1 + unblockable', filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.is('Artifact'),
      run: async ctx => {
        ctx.g.addCounters(ctx.src, '+1/+1', 1);
        const iid = ctx.src.iid;
        ctx.g.untilEffects.push({ expires: 'eot', apply: (g2, bf) => { const c = bf.find(x => x.iid === iid); if (c) c.cur.unblockable = true; } });
        ctx.g.recalc();
      },
    }],
  };
  SC['Koma, Cosmos Serpent'] = {
    uncounterable: true,
    colorIdentityExtra: ['G', 'U'],
    triggers: [{
      on: 'upkeep', desc: "Koma's Coil", filter: () => true,
      run: async ctx => { await ctx.g.makeTokens('serpentKoma', ctx.you); },
    }],
    abilities: [
      {
        label: 'Žrtvuj drugu Zmiju: tapni permanent i ugasi aktivacije',
        cost: { sac: (g, x, self) => x.hasSub('Serpent') && x !== self, sacOther: true },
        targets: [T.permanent(null, { prompt: 'Tapni i ugasi aktivacije', aiHint: { goal: 'removal' } })],
        run: async ctx => {
          const target = ctx.targets[0];
          if (!target) return;
          target.tapped = true;
          const iid = target.iid;
          ctx.g.untilEffects.push({
            expires: 'eot', kind: 'komaDisable', iid,
            apply: (g2, bf) => { const card = bf.find(c => c.iid === iid); if (card) card.cur.activationDisabled = true; },
          });
          ctx.g.recalc();
          ctx.g.lg(`${target.name} je tapnut i ne može aktivirati sposobnosti ovaj potez.`);
        },
      },
      {
        label: 'Žrtvuj drugu Zmiju: Koma dobija indestructible',
        cost: { sac: (g, x, self) => x.hasSub('Serpent') && x !== self, sacOther: true },
        run: async ctx => { E.grantUntilEOT(ctx.g, ctx.src, ['indestructible']); },
      },
    ],
  };
  SC['Lonis, Cryptozoologist'] = {
    triggers: [{
      on: 'etb', desc: 'Istraga',
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature') && !d.card.isToken,
      run: async ctx => { await E.investigate(ctx.g, ctx.you); },
    }],
    abilities: [{
      label: 'Žrtvuj X Clue: ukradi', cost: { tap: true, sac: (g, x) => x.hasSub('Clue'), sacN: 'X' },
      targets: [T.opponent({ prompt: 'Whose library do you reveal?', aiHint: { goal: 'mill' } })],
      run: async ctx => {
        const g = ctx.g, x = ctx.x || 0;
        if (!x) return;
        const o = ctx.targets[0];
        if (!o) return;
        const top = o.library.slice(-x).reverse();
        g.lg(`Lonis otkriva kod ${o.name}: ${top.map(c => c.name).join(', ')}.`);
        const cands = top.filter(c => !c.is('Land') && ['Creature', 'Artifact', 'Enchantment', 'Planeswalker'].some(t => c.is(t)) && c.mv <= x);
        let stolen = null;
        if (cands.length) {
          const pick = await ctx.you.controller.decide(g, {
            type: 'chooseCards', from: cands, min: 0, max: 1, prompt: `Ukradi (MV≤${x}):`, aiHint: { kind: 'bestCard' },
          });
          stolen = pick[0] || null;
        }
        for (const c of top) o.library.splice(o.library.indexOf(c), 1);
        if (stolen) {
          stolen.zone = 'nowhere';
          await g.move(stolen, 'battlefield', { ctrl: ctx.you });
          g.lg(`${ctx.you.name} krade ${stolen.name}!`);
        }
        const rest = top.filter(c => c !== stolen);
        U.shuffle(rest, g.rnd);
        for (const c of rest) { c.zone = 'library'; o.library.unshift(c); }
      },
    }],
  };
  SC['Merchant of Truth'] = {
    triggers: [
      {
        on: 'dies', desc: 'Istraga',
        filter: (g, self, d) => d.snap.ctrl === self.ctrl && d.snap.types.includes('Creature') && !d.snap.isToken,
        run: async ctx => { await E.investigate(ctx.g, ctx.you); },
      },
      {
        on: 'attackersDeclared', desc: 'Clue exalted',
        filter: (g, self, d) => d.player === self.ctrl && d.attackers.length === 1,
        times: (g, self) => g.bf().filter(c => c.ctrl === self.ctrl && c.hasSub('Clue')).length,
        run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.data.attackers[0], 1, 1); },
      },
    ],
  };
  SC['Nadir Kraken'] = {
    triggers: [{
      on: 'draw', opt: true, desc: 'Plati {1}: pipak',
      filter: (g, self, d) => d.player === self.ctrl && g.canPayMana(self.ctrl, U.parseCost('{1}')),
      run: async ctx => {
        const ok = await ctx.g.payMana(ctx.you, U.parseCost('{1}'));
        if (!ok) return;
        ctx.g.addCounters(ctx.src, '+1/+1', 1);
        await ctx.g.makeTokens('tentacle', ctx.you);
      },
    }],
  };
  SC['Psychosis Crawler'] = {
    cdaPower: (g, c) => c.ctrl.hand.length,
    cdaToughness: (g, c) => c.ctrl.hand.length,
    triggers: [{
      on: 'draw', desc: 'Protivnici gube 1', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 1); },
    }],
  };
  SC['Selvala, Explorer Returned'] = {
    mana: {
      manual: true,
      cost: { tap: true },
      produce: (g) => [{ G: g.alivePlayers().filter(q => q.library.length && !q.library[q.library.length - 1].is('Land')).length }],
      onProduce: async (g, c, p) => {
        let nonlands = 0;
        for (const q of g.alivePlayers()) {
          if (!q.library.length) continue;
          const top = q.library[q.library.length - 1];
          if (!top.is('Land')) nonlands++;
        }
        if (nonlands) await g.gainLife(p, nonlands);
        for (const q of g.alivePlayers()) await g.draw(q, 1);
      },
    },
  };
  SC['Serene Sleuth'] = {
    triggers: [
      { on: 'etb', filter: etbSelf, desc: 'Istraga', run: async ctx => { await E.investigate(ctx.g, ctx.you); } },
      {
        on: 'beginCombat', desc: 'Goad istrage', filter: (g, self, d) => d.player === self.ctrl,
        onlyIf: (g, self) => g.creatures(self.ctrl).some(c => g.isGoaded(c)),
        run: async ctx => {
          const mine = ctx.g.creatures(ctx.you).filter(c => ctx.g.isGoaded(c));
          if (mine.length) await E.investigate(ctx.g, ctx.you, mine.length);
          ctx.g.untilEffects = ctx.g.untilEffects.filter(e => !(e.kind === 'goadCard' && mine.some(c => c.iid === e.iid)));
          for (const c of mine) if (c.meta.goadedBy) delete c.meta.goadedBy;
          ctx.g.lg('Serene Sleuth: tvoja stvorenja više nisu goadovana.');
        },
      },
    ],
  };
  SC['Shimmer Dragon'] = {
    statics: [{
      cond: (g, self) => g.bf().filter(c => c.ctrl === self.ctrl && c.is('Artifact')).length >= 4,
      apply: (g, self) => { self.cur.hexproof = true; self.cur.kw.add('hexproof'); },
    }],
    abilities: [{
      label: 'Tapni 2 artefakta: vuci', cost: { tapArtifacts: 2 },
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Sophia, Dogged Detective'] = {
    colorIdentityExtra: ['G', 'W', 'U'],
    triggers: [
      { on: 'etb', filter: etbSelf, desc: 'Tiny', run: async ctx => { await ctx.g.makeTokens('tiny', ctx.you); } },
      {
        on: 'combatDamageToPlayer', desc: 'Food + istraga',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.hasSub('Dog'),
        run: async ctx => { await ctx.g.makeTokens('food', ctx.you); await E.investigate(ctx.g, ctx.you); },
      },
    ],
    abilities: [{
      label: 'Žrtvuj art token: +1/+1 Psima', cost: { mana: '{1}', sac: (g, x) => x.isToken && x.is('Artifact') },
      run: async ctx => {
        for (const c of ctx.g.creatures(ctx.you)) if (c.hasSub('Dog')) ctx.g.addCounters(c, '+1/+1', 1, true);
        ctx.g.recalc();
      },
    }],
  };
  SC['Tangletrove Kelp'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Clue vojska', filter: () => true,
      run: async ctx => {
        const you = ctx.you, selfIid = ctx.src.iid;
        ctx.g.untilEffects.push({
          expires: 'eot',
          apply: (g2, bf) => {
            for (const c of bf) {
              if (c.ctrl === you && c.hasSub('Clue') && c.iid !== selfIid) {
                if (!c.cur.types.includes('Creature')) c.cur.types.push('Creature');
                c.cur.basePower = 6; c.cur.baseToughness = 6;
                c.cur.power = 6; c.cur.toughness = 6;
                if (!c.cur.subtypes.includes('Plant')) c.cur.subtypes.push('Plant');
              }
            }
          },
        });
        ctx.g.recalc();
      },
    }],
    abilities: [{
      label: 'Žrtvuj: vuci', cost: { mana: '{2}', sacSelf: true },
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Thought Monitor'] = {
    selfCostAdjust: (g, card, p) => -g.bf().filter(c => c.ctrl === p && c.is('Artifact')).length,
    triggers: [{ on: 'etb', filter: etbSelf, desc: 'Vuci 2', run: async ctx => { await ctx.g.draw(ctx.you, 2); } }],
  };
  SC['Tireless Tracker'] = {
    triggers: [
      { on: 'landfall', desc: 'Istraga', filter: (g, self, d) => d.card.ctrl === self.ctrl, run: async ctx => { await E.investigate(ctx.g, ctx.you); } },
      {
        on: 'sacrificed', desc: '+1/+1',
        filter: (g, self, d) => d.player === self.ctrl && d.card.hasSub && d.card.hasSub('Clue'),
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      },
    ],
  };
  SC['Wavesifter'] = {
    altCosts: [{ label: 'Evoke {G}{U}', altCostStr: '{G}{U}', evoke: true }],
    triggers: [{ on: 'etb', filter: etbSelf, desc: '2 istrage', run: async ctx => { await E.investigate(ctx.g, ctx.you, 2); } }],
  };
  SC['Whirler Rogue'] = {
    triggers: [{ on: 'etb', filter: etbSelf, desc: '2 thoptera', run: async ctx => { await ctx.g.makeTokens('thopter', ctx.you, { n: 2 }); } }],
    abilities: [{
      label: 'Tapni 2 artefakta: unblockable', cost: { tapArtifacts: 2 },
      targets: [T.creature({ prompt: 'Stvorenje', aiHint: { goal: 'evasion' } })],
      run: async ctx => {
        const iid = ctx.targets[0].iid;
        ctx.g.untilEffects.push({ expires: 'eot', apply: (g2, bf) => { const c = bf.find(x => x.iid === iid); if (c) c.cur.unblockable = true; } });
        ctx.g.recalc();
      },
    }],
  };
  SC['Tezzeret, Betrayer of Flesh'] = {
    firstArtifactAbilityDiscount: true,
    abilities: [
      {
        label: '+1: Vuci 2, odbaci', loyalty: 1, sorcery: true,
        run: async ctx => {
          await ctx.g.draw(ctx.you, 2);
          const artifacts = ctx.you.hand.filter(c => c.is('Artifact'));
          let discardArtifact = false;
          if (artifacts.length) {
            const choice = await ctx.you.controller.decide(ctx.g, {
              type: 'chooseOption', prompt: 'Tezzeret: odbaci artefakt ili dvije karte?',
              options: [{ key: 'artifact', label: 'Jedan artefakt' }, { key: 'two', label: 'Dvije karte' }],
              aiHint: { kind: 'mode' },
            });
            discardArtifact = choice === 'artifact';
          }
          const pool = discardArtifact ? artifacts : ctx.you.hand;
          const n = discardArtifact ? 1 : Math.min(2, pool.length);
          if (n) {
            const pick = await ctx.you.controller.decide(ctx.g, {
              type: 'chooseCards', from: pool, min: n, max: n, prompt: `Odbaci ${n}`, aiHint: { kind: 'cleanupDiscard' },
            });
            await ctx.g.discard(ctx.you, pick);
          }
        },
      },
      {
        label: '-2: Artefakt → 4/4', loyalty: -2, sorcery: true,
        targets: [T.permanent((g, c, ctrl) => c.is('Artifact') && c.ctrl === ctrl, { prompt: 'Artefakt', aiHint: { goal: 'buff' } })],
        run: async ctx => {
          const iid = ctx.targets[0].iid, timestamp = ctx.targets[0].timestamp;
          ctx.g.untilEffects.push({
            expires: 'never', kind: 'tezz44',
            apply: (g2, bf) => {
              const c = bf.find(x => x.iid === iid && x.timestamp === timestamp);
              if (!c) return;
              if (!c.cur.types.includes('Artifact')) c.cur.types.push('Artifact');
              if (!c.cur.types.includes('Creature')) c.cur.types.push('Creature');
              if (!c.hasSub('Vehicle')) {
                c.cur.basePower = 4; c.cur.baseToughness = 4;
                c.cur.power = 4 + (c.counters['+1/+1'] || 0); c.cur.toughness = 4 + (c.counters['+1/+1'] || 0);
              }
            },
          });
          ctx.g.recalc();
        },
      },
      {
        label: '-6: Emblem — tapovani artefakt vuče kartu', loyalty: -6, sorcery: true,
        run: async ctx => {
          ctx.you.emblems.push({
            name: 'Tezzeret, Betrayer of Flesh emblem',
            triggers: [{
              on: 'becameTapped', desc: 'Tezzeret emblem: vuci kartu',
              filter: (g, emblem, d, owner) => d.card && d.card.ctrl === owner && d.card.is('Artifact'),
              run: async emblemCtx => { await emblemCtx.g.draw(emblemCtx.you, 1); },
            }],
          });
        },
      },
    ],
  };
  SC['Confirm Suspicions'] = {
    targets: [T.spell(null, { prompt: 'Counter spell', aiHint: { goal: 'counter' } })],
    resolve: async ctx => {
      const so = ctx.targets[0], g = ctx.g;
      if (so && g.stack.includes(so) && !MTG.isUncounterable(g, so)) {
        g.stack.splice(g.stack.indexOf(so), 1);
        if (!so.isCopy) await g.move(so.card, 'graveyard');
        g.lg(`${so.name} COUNTEROVAN!`, 'counter');
        g.note('stack', {});
      }
      await E.investigate(g, ctx.you, 3);
    },
  };
  SC['Disorder in the Court'] = {
    xMax: (g) => g.bf().filter(c => c.is('Creature')).length,
    targets: (g, card, castOpts) => [{
      what: 'creature', prompt: 'Egzilaj privremeno (tačno X)', count: castOpts.xVal || 0,
      filter: (g2, c) => c.zone === 'battlefield' && c.is('Creature'),
      aiHint: { goal: 'removal' },
    }],
    resolve: async ctx => {
      const g = ctx.g, x = ctx.x || 0;
      const list = (ctx.targets[0] || []).slice(0, x);
      const flicked = [];
      for (const t of list) {
        if (t.zone !== 'battlefield' || t.isToken) { if (t.isToken) await g.exileCard(t); continue; }
        await g.move(t, 'exile');
        flicked.push(t);
      }
      if (x) await E.investigate(g, ctx.you, x);
      g.delayed.push({
        on: 'endStep', once: true, name: 'Povratak iz egzila', ctrl: ctx.you,
        run: async c2 => {
          for (const t of flicked) {
            if (t.zone === 'exile') {
              t.owner.exile.splice(t.owner.exile.indexOf(t), 1);
              t.zone = 'nowhere';
              await c2.g.move(t, 'battlefield', { ctrl: t.owner, tapped: true });
            }
          }
        },
      });
    },
  };
  SC['Farewell'] = {
    modes: {
      pick: 'any', min: 1,
      aiHint: { kind: 'farewellModes' },
      list: [
        { label: 'Egzilaj sve artefakte' },
        { label: 'Egzilaj sva stvorenja' },
        { label: 'Egzilaj sve enchantmente' },
        { label: 'Egzilaj sva groblja' },
      ],
    },
    resolve: async ctx => {
      const g = ctx.g;
      for (const mi of ctx.mode) {
        if (mi === 0) for (const c of g.bf().filter(c => c.is('Artifact')).slice()) await g.exileCard(c);
        if (mi === 1) for (const c of g.bf().filter(c => c.is('Creature')).slice()) await g.exileCard(c);
        if (mi === 2) for (const c of g.bf().filter(c => c.is('Enchantment')).slice()) await g.exileCard(c);
        if (mi === 3) for (const q of g.players) for (const c of q.graveyard.slice()) await g.move(c, 'exile');
      }
      g.lg('FAREWELL — velika čistka!');
    },
  };
  SC['Follow the Bodies'] = {
    resolve: async ctx => { await E.investigate(ctx.g, ctx.you); },
    gravestorm: true,
  };
  SC['Fumigate'] = {
    resolve: async ctx => {
      const n = await ctx.g.destroyMany(ctx.g.bf().filter(c => c.is('Creature')));
      if (n) await ctx.g.gainLife(ctx.you, n);
    },
  };
  SC['Organic Extinction'] = {
    improvise: true,
    resolve: async ctx => {
      await ctx.g.destroyMany(ctx.g.bf().filter(c => c.is('Creature') && !c.is('Artifact')));
    },
  };
  SC['Inspiring Statuary'] = { grantsImprovise: true };
  SC['Magnifying Glass'] = {
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [{
      label: 'Istraga', cost: { mana: '{4}', tap: true },
      run: async ctx => { await E.investigate(ctx.g, ctx.you); },
    }],
  };
  SC['Nettlecyst'] = {
    equip: '{2}',
    attachGrant: (g, self, host) => {
      const n = g.bf().filter(c => c.ctrl === self.ctrl && (c.is('Artifact') || c.is('Enchantment'))).length;
      host.cur.power += n; host.cur.toughness += n;
    },
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Germ',
      run: async ctx => {
        // Living weapon i dalje stvara token kroz normalne replacement efekte.
        // Ako ih nastane više, Equipment se prikači na jedan od njih.
        const made = await ctx.g.makeTokens('germ', ctx.you);
        if (made[0]) await ctx.g.attach(ctx.src, made[0]);
      },
    }],
  };
  SC['Simic Signet'] = { mana: { cost: { tap: true, mana: '{1}' }, produce: [{ G: 1, U: 1 }] } };
  SC['Talisman of Curiosity'] = {
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true }, produce: [{ G: 1 }, { U: 1 }], onProduce: async (g, c, p) => { await g.damagePlayer(c, p, 1); } },
    ],
  };
  SC['Talisman of Progress'] = {
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true }, produce: [{ W: 1 }, { U: 1 }], onProduce: async (g, c, p) => { await g.damagePlayer(c, p, 1); } },
    ],
  };
  SC['Talisman of Unity'] = {
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true }, produce: [{ G: 1 }, { W: 1 }], onProduce: async (g, c, p) => { await g.damagePlayer(c, p, 1); } },
    ],
  };
  SC['Armed with Proof'] = {
    triggers: [{ on: 'etb', filter: etbSelf, desc: '2 istrage', run: async ctx => { await E.investigate(ctx.g, ctx.you, 2); } }],
    statics: [
      {
        phase: 1,
        apply: (g, self, bf) => {
          for (const clue of bf) {
            if (clue.ctrl !== self.ctrl || !clue.hasSub('Clue') || clue.hasSub('Equipment')) continue;
            clue.cur.subtypes.push('Equipment');
          }
        },
      },
      {
        phase: 2,
        apply: (g, self, bf) => {
          for (const clue of bf) {
            if (clue.ctrl !== self.ctrl || !clue.hasSub('Clue')) continue;
            clue.cur.equipCost = '{2}';
            clue.cur.attachGrant = (g2, equipment, host) => { host.cur.power += 2; };
          }
        },
      },
    ],
  };
  SC['Killer Service'] = {
    triggers: [
      { on: 'etb', filter: etbSelf, desc: 'Foodovi', run: async ctx => { await ctx.g.makeTokens('food', ctx.you, { n: E.eachOpp(ctx.g, ctx.you).length }); } },
      {
        on: 'endStep', opt: true, desc: 'Rhino', filter: (g, self, d) => d.player === self.ctrl,
        aiHint: { kind: 'killerService' },
        onlyIf: (g, self) => g.bf().some(c => c.ctrl === self.ctrl && c.isToken) && g.canPayMana(self.ctrl, U.parseCost('{2}')),
        run: async ctx => {
          const ok = await ctx.g.payMana(ctx.you, U.parseCost('{2}'));
          if (!ok) return;
          const toks = ctx.g.bf().filter(c => c.ctrl === ctx.you && c.isToken);
          const pick = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: toks, min: 1, max: 1, prompt: 'Žrtvuj token:', aiHint: { kind: 'sacToken' },
          });
          if (pick.length) { await ctx.g.sacrifice(ctx.you, pick[0]); await ctx.g.makeTokens('rhino44', ctx.you); }
        },
      },
    ],
  };
  SC['Knowledge Is Power'] = {
    statics: [{
      apply: (g, self, bf) => {
        const x = self.ctrl.turnState.drewThisTurn;
        if (!x) return;
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature')) { c.cur.power += x; c.cur.toughness += x; }
      },
    }],
  };
  SC['Mechanized Production'] = {
    auraTarget: [{
      what: 'permanent', prompt: 'Tvoj artefakt',
      filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Artifact') && c.ctrl === ctrl,
      aiHint: { goal: 'buff' },
    }],
    triggers: [{
      on: 'upkeep', desc: 'Kopija + win check', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const host = ctx.g.byIid(ctx.src.attachedTo);
        if (host && host.zone === 'battlefield') await ctx.g.copyPermanentToken(host, ctx.you);
        const counts = {};
        for (const c of ctx.g.bf()) if (c.ctrl === ctx.you && c.is('Artifact')) counts[c.name] = (counts[c.name] || 0) + 1;
        if (Object.values(counts).some(n => n >= 8)) {
          ctx.g.lg(`🏆 MECHANIZED PRODUCTION: ${ctx.you.name} POBJEĐUJE (8 istoimenih artefakata)!`, 'win');
          for (const q of ctx.g.players) if (q !== ctx.you) await ctx.g.playerLoses(q, 'Mechanized Production');
        }
      },
    }],
  };
  SC['On the Trail'] = {
    triggers: [{
      on: 'draw', desc: 'Land', filter: (g, self, d) => d.player === self.ctrl && d.player.turnState.drewThisTurn === 2,
      run: async ctx => {
        const lands = ctx.you.hand.filter(c => c.is('Land'));
        if (!lands.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: lands, min: 0, max: 1, prompt: 'Stavi land (tapped):', aiHint: { kind: 'bestLand' },
        });
        if (pick.length) {
          ctx.you.hand.splice(ctx.you.hand.indexOf(pick[0]), 1);
          pick[0].zone = 'nowhere';
          await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you, tapped: true });
        }
      },
    }],
  };
  SC['Ongoing Investigation'] = {
    triggers: [{
      on: 'combatDamageGroupToPlayer', desc: 'Istraga',
      filter: (g, self, d) => d.cards.some(card => card.ctrl === self.ctrl && card.is('Creature')),
      run: async ctx => { await E.investigate(ctx.g, ctx.you); },
    }],
    abilities: [{
      label: 'Egzilaj creature iz groblja: istraga +2 života',
      cost: { mana: '{1}{G}', exileFromGY: { n: 1, filter: (g, card) => card.is('Creature') } },
      run: async ctx => { await E.investigate(ctx.g, ctx.you); await ctx.g.gainLife(ctx.you, 2); },
    }],
  };
  SC['Search the Premises'] = {
    triggers: [{
      on: 'attackersDeclared', desc: 'Istrage',
      filter: (g, self, d) => d.attackers.some(a => a.attacking === self.ctrl ||
        (a.attacking && a.attacking.is && a.attacking.is('Planeswalker') && a.attacking.ctrl === self.ctrl)),
      times: (g, self, d) => d.attackers.filter(a => a.attacking === self.ctrl ||
        (a.attacking && a.attacking.is && a.attacking.is('Planeswalker') && a.attacking.ctrl === self.ctrl)).length,
      run: async ctx => { await E.investigate(ctx.g, ctx.you); },
    }],
  };
  SC["Teferi's Ageless Insight"] = { drawDouble: true };
  SC['Ulvenwald Mysteries'] = {
    triggers: [
      {
        on: 'dies', desc: 'Istraga',
        filter: (g, self, d) => d.snap.ctrl === self.ctrl && d.snap.types.includes('Creature') && !d.snap.isToken,
        run: async ctx => { await E.investigate(ctx.g, ctx.you); },
      },
      {
        on: 'sacrificed', desc: 'Soldier',
        filter: (g, self, d) => d.player === self.ctrl && d.card.hasSub && d.card.hasSub('Clue'),
        run: async ctx => { await ctx.g.makeTokens('humanSoldier', ctx.you); },
      },
    ],
  };
  SC['Wilderness Reclamation'] = {
    triggers: [{
      on: 'endStep', desc: 'Untap landove', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { for (const l of ctx.g.lands(ctx.you)) l.tapped = false; ctx.g.lg('Wilderness Reclamation: landovi untapovani.'); },
    }],
  };
  // ---- lands ----
  const tapFor = (cols) => ({ cost: { tap: true }, produce: cols.map(c => (typeof c === 'object' ? c : { [c]: 1 })) });
  SC['Azorius Chancery'] = { producesColors: ['W', 'U'], entersTapped: true, mana: tapFor([{ W: 1, U: 1 }]), triggers: SC['Gruul Turf'].triggers };
  SC['Selesnya Sanctuary'] = { producesColors: ['G', 'W'], entersTapped: true, mana: tapFor([{ G: 1, W: 1 }]), triggers: SC['Gruul Turf'].triggers };
  SC['Simic Growth Chamber'] = { producesColors: ['G', 'U'], entersTapped: true, mana: tapFor([{ G: 1, U: 1 }]), triggers: SC['Gruul Turf'].triggers };
  SC['Irrigated Farmland'] = Object.assign({ producesColors: ['W', 'U'], entersTapped: true, mana: tapFor(['W', 'U']) }, { cycling: { cost: '{2}' } });
  SC['Scattered Groves'] = Object.assign({ producesColors: ['G', 'W'], entersTapped: true, mana: tapFor(['G', 'W']) }, { cycling: { cost: '{2}' } });
  SC['Lonely Sandbar'] = { producesColors: ['U'], entersTapped: true, mana: tapFor(['U']), cycling: { cost: '{U}' } };
  SC['Secluded Steppe'] = { producesColors: ['W'], entersTapped: true, mana: tapFor(['W']), cycling: { cost: '{W}' } };
  SC['Krosan Verge'] = {
    producesColors: [], entersTapped: true, mana: tapFor([{ C: 1 }]),
    abilities: [{
      label: 'Žrtvuj: Forest + Plains', cost: { mana: '{2}', tap: true, sacSelf: true },
      run: async ctx => {
        await E.searchLandByName(ctx.g, ctx.you, ['Forest'], { tapped: true });
        await E.searchLandByName(ctx.g, ctx.you, ['Plains'], { tapped: true });
      },
    }],
  };
  SC['Seaside Citadel'] = { producesColors: ['G', 'W', 'U'], entersTapped: true, mana: tapFor(['G', 'W', 'U']) };
  SC['Spire of Industry'] = {
    producesColors: COLORS,
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true, life: 1 }, produce: [{ ANY: true, n: 1 }], cond: (g, c, p) => g.bf().some(x => x.ctrl === p && x.is('Artifact')) },
    ],
  };
  SC['Temple of Mystery'] = {
    producesColors: ['G', 'U'], entersTapped: true, mana: tapFor(['G', 'U']),
    triggers: [{ on: 'etb', filter: etbSelf, desc: 'Scry 1', run: async ctx => { await E.scry(ctx.g, ctx.you, 1); } }],
  };
  SC['Temple of Enlightenment'] = {
    producesColors: ['W', 'U'], entersTapped: true, mana: tapFor(['W', 'U']),
    triggers: [{ on: 'etb', filter: etbSelf, desc: 'Scry 1', run: async ctx => { await E.scry(ctx.g, ctx.you, 1); } }],
  };
  // Family Matters lands
  SC['Adarkar Wastes'] = {
    producesColors: ['W', 'U'],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true }, produce: [{ W: 1 }, { U: 1 }], onProduce: async (g, c, p) => { await g.damagePlayer(c, p, 1); } },
    ],
  };
  SC['Battlefield Forge'] = {
    producesColors: ['R', 'W'],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true }, produce: [{ R: 1 }, { W: 1 }], onProduce: async (g, c, p) => { await g.damagePlayer(c, p, 1); } },
    ],
  };
  SC['Clifftop Retreat'] = {
    producesColors: ['R', 'W'], mana: tapFor(['R', 'W']),
    entersTapped: (g, card) => !g.lands(card.ctrl).some(l => l !== card && (l.hasSub('Mountain') || l.hasSub('Plains'))),
  };
  SC['Glacial Fortress'] = {
    producesColors: ['W', 'U'], mana: tapFor(['W', 'U']),
    entersTapped: (g, card) => !g.lands(card.ctrl).some(l => l !== card && (l.hasSub('Plains') || l.hasSub('Island'))),
  };
  SC['Mystic Monastery'] = { producesColors: ['U', 'R', 'W'], entersTapped: true, mana: tapFor(['U', 'R', 'W']) };
  SC['Rugged Prairie'] = {
    producesColors: ['R', 'W'],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true, mana: '{R/W}' }, produce: [{ R: 2 }, { R: 1, W: 1 }, { W: 2 }] },
    ],
  };
  SC['Seachrome Coast'] = {
    producesColors: ['W', 'U'], mana: tapFor(['W', 'U']),
    entersTapped: (g, card) => g.lands(card.ctrl).filter(l => l !== card).length > 2,
  };
  SC['Sunscorched Divide'] = { producesColors: ['R', 'W'], mana: { cost: { tap: true, mana: '{1}' }, produce: [{ R: 1, W: 1 }] } };
  const thriving = (col) => ({
    producesColors: COLORS, entersTapped: true,
    mana: { cost: { tap: true }, produce: (g, c, p) => {
      const other = c.meta.thrivingColor || COLORS.find(x => x !== col);
      return [{ [col]: 1 }, { [other]: 1 }];
    } },
    asEnters: async (g, card) => {
      const opts = COLORS.filter(x => x !== col).map(x => ({ key: x, label: x }));
      const k = await card.ctrl.controller.decide(g, {
        type: 'chooseOption', prompt: `${card.name}: druga boja?`, options: opts, aiHint: { kind: 'manaColor' },
      });
      card.meta.thrivingColor = k;
    },
  });
  SC['Thriving Bluff'] = thriving('R');
  SC['Thriving Heath'] = thriving('W');
  SC['Thriving Isle'] = thriving('U');
})();
