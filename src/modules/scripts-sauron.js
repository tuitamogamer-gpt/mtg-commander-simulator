// ===== scripts-sauron.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

// Explicit Oracle implementations for Gustavo82's public Moxfield
// "Sauron, the dark lord (ready to play)" deck. These definitions reuse the
// normal stack, targets, combat, choices and local-controller paths.
(function () {
  const U = MTG;
  const E = MTG.E;
  const E7 = MTG.E7;
  const T = MTG.T;
  const SC = MTG.SCRIPTS;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];

  const AMASS = new Set(['Sauron, the Dark Lord', 'Grishnákh, Brash Instigator', 'Saruman, the White Hand', 'Sauron, Lord of the Rings', 'The Mouth of Sauron', 'Callous Dismissal', 'Enter the God-Eternals', 'Foray of Orcs', 'Honor the God-Pharaoh', 'Invade the City', 'Treason of Isengard', 'Widespread Brutality', 'Commence the Endgame', 'Lazotep Plating', 'Orcish Medicine', 'Book of Mazarbul', 'Dreadhorde Invasion', 'March from the Black Gate']);
  const RING = new Set(['Sauron, the Dark Lord', 'Elrond, Lord of Rivendell', 'Gandalf, Friend of the Shire', 'Sauron, Lord of the Rings', 'Ringsight', "Sauron's Ransom", 'Call of the Ring', 'One Ring to Rule Them All']);
  const GRAVEYARD = new Set(['Lobelia Sackville-Baggins', 'Sauron, Lord of the Rings', 'Sauron, the Necromancer', 'The Mouth of Sauron', 'Flood of Recollection', 'Invade the City', "Life's Finale", 'Mystic Retrieval', 'Treason of Isengard', "Sauron's Ransom", 'One Ring to Rule Them All']);
  const COMBAT = new Set(['Sauron, the Dark Lord', 'Gorbag of Minas Morgul', 'Herald of Secret Streams', 'Lord of the Nazgûl', 'Orcish Siegemaster', 'Sauron, the Necromancer', 'Infiltration Lens', 'Dreadhorde Invasion', 'March from the Black Gate']);
  const DRAW_DISCARD = new Set(['Sauron, the Dark Lord', 'Gandalf, Friend of the Shire', 'Gorbag of Minas Morgul', 'Honor the God-Pharaoh', "Altar's Reap", 'Commence the Endgame', 'Corrupted Conviction', 'Nasty End', "Sauron's Ransom", 'Library of Leng', 'Phial of Galadriel', 'Call of the Ring']);

  const define = (name, spec) => {
    const marker = SC[name] || {};
    const contracts = new Set(['manual-oracle-resolution']);
    if (spec.triggers) contracts.add('trigger-stack');
    if (spec.targets) contracts.add('target-lock-revalidation');
    if (spec.abilities) contracts.add('activated-ability-cost');
    if (spec.mana) contracts.add('mana-source');
    if (spec.statics || spec.replace) contracts.add('continuous-layer');
    if (spec.saga) contracts.add('saga-chapter-stack');
    if (spec.costMods) contracts.add('cost-modification');
    if (spec.ward) contracts.add('ward-alternative-cost');
    if (AMASS.has(name)) contracts.add('amass-army');
    if (RING.has(name)) contracts.add('ring-temptation');
    if (GRAVEYARD.has(name)) contracts.add('graveyard-zone-change');
    if (COMBAT.has(name)) contracts.add('combat-trigger');
    if (DRAW_DISCARD.has(name)) contracts.add('draw-discard-replacement');
    SC[name] = Object.assign({}, marker, spec, {
      oracleImplemented: true,
      oracleId: marker.oracleId,
      semanticClass: marker.semanticClass || 'manual-deck-semantic',
      oracleContracts: [...contracts],
    });
  };
  const etbSelf = (g, self, data) => data.card === self;
  const isLegendary = card => !!card && ((card.cur && card.cur.super) || card.def.super || []).includes('Legendary');
  const isArmy = card => !!card && card.is('Creature') && card.hasSub('Army');
  const isOrcOrGoblin = card => !!card && (card.hasSub('Orc') || card.hasSub('Goblin'));
  const ownISGrave = (prompt, upTo = false) => ({
    zone: 'graveyard', what: 'card', upTo, prompt,
    filter: (g, card, ctrl) => card.owner === ctrl && (card.is('Instant') || card.is('Sorcery')),
    aiHint: { goal: 'recursion' },
  });
  const tapFor = produces => ({ cost: { tap: true }, produce: produces });

  const armyDef = kind => ({
    name: `${kind} Army`, cost: null, super: [], types: ['Creature'], subtypes: [kind, 'Army'],
    power: '0', toughness: '0', oracle: '', colorsOverride: ['B'], kws: [], isTokenDef: true,
  });
  // Include dynamically created Armies in the shared token/image inventory.
  MTG.TOKENS.orcArmy = armyDef('Orc');
  MTG.TOKENS.zombieArmy = armyDef('Zombie');
  const wraithDef = {
    name: 'Wraith', cost: null, super: [], types: ['Creature'], subtypes: ['Wraith'],
    power: '3', toughness: '3', oracle: 'Menace', colorsOverride: ['B'], kws: ['menace'], isTokenDef: true,
  };

  E.amass = async function (game, player, n, kind = 'Orc') {
    let armies = game.creatures(player).filter(isArmy);
    let army = null;
    if (armies.length > 1) {
      const picked = await player.controller.decide(game, {
        type: 'chooseCards', from: armies, min: 1, max: 1,
        prompt: `Amass ${kind}s ${n}: choose an Army`, aiHint: { kind: 'amass', n, armyKind: kind },
      });
      army = picked[0] || armies[0];
    } else army = armies[0] || null;
    if (!army) {
      const made = await game.makeTokens(armyDef(kind), player);
      army = made[0] || null;
    }
    if (!army) return null;
    army.meta.addedSubtypes = [...new Set([...(army.meta.addedSubtypes || []), kind, 'Army'])];
    game.recalc();
    if (n > 0) game.addCounters(army, '+1/+1', n, false, player);
    game.lg(`${U.playerVerb(player, 'amass', 'amasses')} ${kind}s ${n}.`);
    await game.emit('amassed', { player, army, n, kind });
    return army;
  };

  function basePTUntilEOT(game, filter, power, toughness, kind) {
    game.untilEffects.push({
      expires: 'eot', kind,
      apply: (g, battlefield) => {
        for (const card of battlefield.filter(candidate => filter(g, candidate))) {
          card.cur.basePower = power;
          card.cur.baseToughness = toughness;
          const plus = (card.counters['+1/+1'] || 0) - (card.counters['-1/-1'] || 0);
          card.cur.power = power + plus;
          card.cur.toughness = toughness + plus - (card.counters['-0/-1'] || 0);
        }
      },
    });
    game.recalc();
  }

  function temporaryControl(game, player, card) {
    const originalCtrl = card.ctrl;
    const iid = card.iid;
    const timestamp = card.timestamp;
    card.ctrl = player;
    card.tapped = false;
    card.meta.tempHaste = true;
    game.recalc();
    game.delayed.push({
      on: 'endStep', once: true, expires: 'eot', ctrl: player, name: `${card.name}: return control`,
      run: async ctx => {
        const current = ctx.g.byIid(iid);
        if (!current || current.timestamp !== timestamp || current.zone !== 'battlefield') return;
        current.ctrl = originalCtrl;
        delete current.meta.tempHaste;
        ctx.g.recalc();
      },
    });
  }

  function queueForayDamage(game, player, source, army) {
    const lastPower = Math.max(0, army ? army.power : 0);
    game.queueTrigger({
      src: source, ctrl: player, name: `${source.name}: amassed Army damage`,
      targets: [T.oppCreature({
        prompt: `${source.name}: creature damaged by the amassed Army`,
        aiHint: { goal: 'removal' },
      })],
      run: async ctx => {
        const target = ctx.targets[0];
        if (!target) return;
        const amount = army && army.zone === 'battlefield' ? army.power : lastPower;
        await ctx.g.damageCreature(source, target, amount);
      },
    });
  }

  // Creatures
  define('Sauron, the Dark Lord', {
    ward: { sacLegendary: true },
    triggers: [{
      on: 'cast', desc: 'Opponent spell — amass Orcs 1',
      filter: (g, self, data) => data.player !== self.ctrl,
      run: async ctx => { await E.amass(ctx.g, ctx.you, 1, 'Orc'); },
    }, {
      on: 'combatDamageToPlayer', desc: 'Army hit — the Ring tempts you',
      filter: (g, self, data) => data.card.ctrl === self.ctrl && isArmy(data.card),
      run: async ctx => { await E7.ringTempts(ctx.g, ctx.you); },
    }, {
      on: 'ringTempted', desc: 'Discard your hand and draw four', opt: true,
      filter: (g, self, data) => data.player === self.ctrl,
      run: async ctx => {
        if (ctx.you.hand.length) await ctx.g.discard(ctx.you, ctx.you.hand.slice());
        await ctx.g.draw(ctx.you, 4, ctx.src);
      },
    }],
  });

  define('Elrond, Lord of Rivendell', {
    triggers: [{
      on: 'etb', desc: 'Scry 1; second resolution tempts the Ring',
      filter: (g, self, data) => data.card.ctrl === self.ctrl && data.card.is('Creature'),
      run: async ctx => {
        if (ctx.src.meta._elrondTurn !== ctx.g.turnNo) {
          ctx.src.meta._elrondTurn = ctx.g.turnNo;
          ctx.src.meta._elrondResolved = 0;
        }
        await E.scry(ctx.g, ctx.you, 1);
        ctx.src.meta._elrondResolved += 1;
        if (ctx.src.meta._elrondResolved === 2) await E7.ringTempts(ctx.g, ctx.you);
      },
    }],
  });

  define('Gandalf, Friend of the Shire', {
    grantsFlash: (g, self, card, player) => self.ctrl === player && card.is('Sorcery'),
    triggers: [{
      on: 'ringTempted', desc: 'Draw for another Ring-bearer',
      filter: (g, self, data) => data.player === self.ctrl && data.bearer && data.bearer !== self,
      run: async ctx => { await ctx.g.draw(ctx.you, 1, ctx.src); },
    }],
  });

  define('Gorbag of Minas Morgul', {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Sacrifice the Goblin or Orc for value', opt: true,
      filter: (g, self, data) => data.card.ctrl === self.ctrl && isOrcOrGoblin(data.card),
      run: async ctx => {
        const creature = ctx.data.card;
        if (!creature || creature.zone !== 'battlefield' || !await ctx.g.sacrifice(ctx.you, creature)) return;
        ctx.g.queueTrigger({
          src: ctx.src, ctrl: ctx.you, name: 'Gorbag: draw or Treasure',
          run: async next => {
            const mode = await next.you.controller.decide(next.g, {
              type: 'chooseOption', prompt: 'Gorbag: choose one',
              options: [{ key: 'draw', label: 'Draw a card' }, { key: 'treasure', label: 'Create a Treasure' }],
              aiHint: { kind: 'gorbagReward' },
            });
            if (mode === 'treasure') await next.g.makeTokens('treasure', next.you);
            else await next.g.draw(next.you, 1, next.src);
          },
        });
      },
    }],
  });

  define('Grishnákh, Brash Instigator', {
    triggers: [{
      on: 'etb', desc: 'Amass Orcs 2 and steal a smaller creature', filter: etbSelf,
      run: async ctx => {
        const army = await E.amass(ctx.g, ctx.you, 2, 'Orc');
        if (!army) return;
        ctx.g.queueTrigger({
          src: ctx.src, ctrl: ctx.you, name: 'Grishnákh: gain control',
          targets: [T.oppCreature({
            prompt: 'Nonlegendary creature with power no greater than the Army',
            filter: (g, card, ctrl) => card.zone === 'battlefield' && card.is('Creature') &&
              card.ctrl !== ctrl && !isLegendary(card) && card.power <= army.power,
            aiHint: { goal: 'steal' },
          })],
          run: async next => { if (next.targets[0]) temporaryControl(next.g, next.you, next.targets[0]); },
        });
      },
    }],
  });

  define('Herald of Secret Streams', {
    statics: [{ apply: (g, self, battlefield) => {
      for (const card of battlefield) if (card.ctrl === self.ctrl && card.is('Creature') && (card.counters['+1/+1'] || 0) > 0) {
        card.cur.unblockable = true;
      }
    } }],
  });

  define('Lobelia Sackville-Baggins', {
    triggers: [{
      on: 'etb', desc: 'Exile a creature that died this turn', filter: etbSelf,
      targets: [{
        zone: 'graveyard', anyGraveyard: true, what: 'card',
        prompt: 'Creature from an opponent graveyard put there from the battlefield this turn',
        filter: (g, card, ctrl) => card.owner !== ctrl && card.is('Creature') &&
          card.meta._fromBattlefieldTurn === g.turnNo,
        aiHint: { kind: 'gyHate' },
      }],
      run: async ctx => {
        const card = ctx.targets[0];
        if (!card || card.zone !== 'graveyard') return;
        const death = (ctx.g.diedThisTurn || []).find(snapshot => snapshot.iid === card.iid);
        const power = Math.max(0, Number(death && death.power) || Number.parseInt(card.def.power, 10) || 0);
        await ctx.g.move(card, 'exile');
        if (card.zone === 'exile' && power > 0) await ctx.g.makeTokens('treasure', ctx.you, { n: power });
      },
    }],
  });

  define('Lord of the Nazgûl', {
    statics: [{ apply: (g, self, battlefield) => {
      for (const card of battlefield) if (card.ctrl === self.ctrl && card.hasSub('Wraith')) {
        card.cur.protectionFrom.push((g2, source) => !!source && !!source.meta.ringBearer);
      }
    } }],
    triggers: [{
      on: 'castIS', desc: 'Create a Wraith', filter: (g, self, data) => data.player === self.ctrl,
      run: async ctx => {
        await ctx.g.makeTokens(wraithDef, ctx.you);
        const wraiths = ctx.g.creatures(ctx.you).filter(card => card.hasSub('Wraith'));
        if (wraiths.length >= 9) basePTUntilEOT(ctx.g,
          (g, card) => card.ctrl === ctx.you && card.hasSub('Wraith'), 9, 9, 'nazgulNine');
      },
    }],
  });

  define('Mauhúr, Uruk-hai Captain', {
    plusCountersAdjust: (n, g, card, self) => card.ctrl === self.ctrl &&
      (isArmy(card) || card.hasSub('Goblin') || card.hasSub('Orc')) ? n + 1 : n,
  });

  define('Mirkwood Bats', {
    triggers: [{
      on: 'tokenCreated', desc: 'Opponents lose life for a created token',
      filter: (g, self, data) => data.ctrl === self.ctrl,
      run: async ctx => { await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 1, 'Mirkwood Bats'); },
    }, {
      on: 'sacrificed', desc: 'Opponents lose life for a sacrificed token',
      filter: (g, self, data) => data.player === self.ctrl && data.card.isToken,
      run: async ctx => { await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 1, 'Mirkwood Bats'); },
    }],
  });

  define('Nightscape Familiar', {
    costMods: [(g, self, data) => self.ctrl === data.player &&
      data.card.colors.some(color => color === 'U' || color === 'R') ? -1 : 0],
    abilities: [{
      label: 'Regenerate Nightscape Familiar', cost: { mana: '{1}{B}' },
      run: async ctx => { ctx.src.regenShield += 1; ctx.g.lg(`${ctx.src.name} gains a regeneration shield.`); },
      aiScore: (g, card) => card.damage > 0 ? 3 : 0.2,
    }],
  });

  define('Orcish Siegemaster', {
    statics: [{ apply: (g, self, battlefield) => {
      for (const card of battlefield) if (card !== self && card.ctrl === self.ctrl && isOrcOrGoblin(card)) card.cur.kw.add('trample');
    } }],
    triggers: [{
      on: 'attacks', desc: 'Power equal to the greatest creature power', filter: (g, self, data) => data.card === self,
      run: async ctx => {
        const greatest = Math.max(0, ...ctx.g.creatures(ctx.you).map(card => card.power));
        E.pumpUntilEOT(ctx.g, ctx.src, greatest, 0);
      },
    }],
  });

  define('Pitiless Plunderer', {
    triggers: [{
      on: 'dies', desc: 'Create a Treasure',
      filter: (g, self, data) => data.card !== self && data.snap.ctrl === self.ctrl && data.snap.types.includes('Creature'),
      run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
    }],
  });

  define('Saruman, the White Hand', {
    statics: [{ apply: (g, self, battlefield) => {
      for (const card of battlefield) if (card.ctrl === self.ctrl && isOrcOrGoblin(card)) g.grantWard(card, { mana: '{2}' });
    } }],
    triggers: [{
      on: 'castNonCreature', desc: 'Amass Orcs by mana value', filter: (g, self, data) => data.player === self.ctrl,
      run: async ctx => { await E.amass(ctx.g, ctx.you, ctx.data.mv || 0, 'Orc'); },
    }],
  });

  define('Sauron, Lord of the Rings', {
    triggers: [{
      on: 'cast', zone: 'stack', desc: 'Amass, mill, and reanimate', filter: (g, self, data) => data.card === self,
      run: async ctx => {
        await E.amass(ctx.g, ctx.you, 5, 'Orc');
        await ctx.g.mill(ctx.you, 5);
        const pool = ctx.you.graveyard.filter(card => card.is('Creature'));
        if (!pool.length) return;
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 1, max: 1,
          prompt: 'Sauron: return a creature from your graveyard', aiHint: { kind: 'reanimate' },
        });
        if (picked[0] && picked[0].zone === 'graveyard') await E.reanimate(ctx.g, ctx.you, picked[0]);
      },
    }, {
      on: 'dies', desc: 'Opponent commander dies — the Ring tempts you',
      filter: (g, self, data) => data.snap.commander && data.snap.ctrl !== self.ctrl,
      run: async ctx => { await E7.ringTempts(ctx.g, ctx.you); },
    }],
  });

  define('Sauron, the Necromancer', {
    triggers: [{
      on: 'attacks', desc: 'Exile a creature and make an attacking Wraith', filter: (g, self, data) => data.card === self,
      targets: [{
        zone: 'graveyard', what: 'card', prompt: 'Creature card to exile for a Wraith copy',
        filter: (g, card, ctrl) => card.owner === ctrl && card.is('Creature'), aiHint: { kind: 'reanimate' },
      }],
      run: async ctx => {
        const original = ctx.targets[0];
        if (!original || original.zone !== 'graveyard') return;
        await ctx.g.move(original, 'exile');
        if (original.zone !== 'exile') return;
        const def = Object.assign({}, original.def, {
          power: '3', toughness: '3', subtypes: ['Wraith'], colorsOverride: ['B'],
          kws: [...new Set([...(original.def.kws || []), 'menace'])],
        });
        const made = await ctx.g.makeTokens(def, ctx.you, { tapped: true, attacking: ctx.src.attacking });
        const token = made[0];
        if (!token) return;
        const tokenId = token.iid;
        const tokenStamp = token.timestamp;
        const sourceId = ctx.src.iid;
        const sourceStamp = ctx.src.timestamp;
        ctx.g.delayed.push({
          on: 'endStep', once: true, ctrl: ctx.you, name: 'Sauron: exile the Wraith copy',
          run: async next => {
            const source = next.g.byIid(sourceId);
            if (source && source.timestamp === sourceStamp && source.zone === 'battlefield' && source.meta.ringBearer) return;
            const current = next.g.byIid(tokenId);
            if (current && current.timestamp === tokenStamp && current.zone === 'battlefield') await next.g.exileCard(current);
          },
        });
      },
    }],
  });

  define('The Mouth of Sauron', {
    triggers: [{
      on: 'etb', desc: 'Mill three, then amass', filter: etbSelf,
      targets: [T.player({ prompt: 'Player to mill three', aiHint: { goal: 'mill' } })],
      run: async ctx => {
        const player = ctx.targets[0];
        if (!player) return;
        await ctx.g.mill(player, 3);
        const n = player.graveyard.filter(card => card.is('Instant') || card.is('Sorcery')).length;
        await E.amass(ctx.g, ctx.you, n, 'Orc');
      },
    }],
  });

  define('Thryx, the Sudden Storm', {
    costMods: [(g, self, data) => self.ctrl === data.player && data.card.mv >= 5 ? -1 : 0],
    uncounterableSpells: (g, self, stackObject) => self.ctrl === stackObject.ctrl && stackObject.card.mv >= 5,
  });

  // Sorceries
  define('Callous Dismissal', {
    targets: [T.permanent((g, card) => !card.is('Land'), { prompt: 'Target nonland permanent', aiHint: { goal: 'bounce' } })],
    resolve: async ctx => {
      if (ctx.targets[0]) await ctx.g.move(ctx.targets[0], 'hand');
      await E.amass(ctx.g, ctx.you, 1, 'Zombie');
    },
  });

  define('Enter the God-Eternals', {
    targets: [T.creature({ prompt: 'Creature to take 4 damage', aiHint: { goal: 'removal' } }), T.player({ prompt: 'Player to mill four', aiHint: { goal: 'mill' } })],
    resolve: async ctx => {
      const dealt = ctx.targets[0] ? await ctx.g.damageCreature(ctx.src, ctx.targets[0], 4) : 0;
      if (dealt > 0) await ctx.g.gainLife(ctx.you, dealt, ctx.src);
      if (ctx.targets[1]) await ctx.g.mill(ctx.targets[1], 4);
      await E.amass(ctx.g, ctx.you, 4, 'Zombie');
    },
  });

  define('Flood of Recollection', {
    targets: [ownISGrave('Instant or sorcery to return')],
    exileOnResolve: true,
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.move(ctx.targets[0], 'hand'); },
  });

  define('Foray of Orcs', {
    resolve: async ctx => {
      const army = await E.amass(ctx.g, ctx.you, 2, 'Orc');
      if (army) queueForayDamage(ctx.g, ctx.you, ctx.src, army);
    },
  });

  define('Honor the God-Pharaoh', {
    addlCost: { discard: 1 },
    resolve: async ctx => { await ctx.g.draw(ctx.you, 2, ctx.src); await E.amass(ctx.g, ctx.you, 1, 'Zombie'); },
  });

  define('Invade the City', {
    resolve: async ctx => {
      const n = ctx.you.graveyard.filter(card => card.is('Instant') || card.is('Sorcery')).length;
      await E.amass(ctx.g, ctx.you, n, 'Zombie');
    },
  });

  define("Life's Finale", {
    targets: [T.opponent({ prompt: 'Opponent whose library you search', aiHint: { goal: 'mill' } })],
    resolve: async ctx => {
      await ctx.g.destroyMany(ctx.g.bf().filter(card => card.is('Creature')), { noRegen: true, source: ctx.src });
      const opponent = ctx.targets[0];
      if (!opponent || opponent.lost) return;
      const pool = opponent.library.filter(card => card.is('Creature'));
      const picked = pool.length ? await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: pool, min: 0, max: Math.min(3, pool.length),
        prompt: `Choose up to three creatures from ${opponent.name}'s library`, search: true,
        aiHint: { kind: 'millBestCreatures', player: opponent },
      }) : [];
      await ctx.g.withGraveyardEntryBatch(async () => {
        for (const card of picked.filter(card => card.zone === 'library')) await ctx.g.move(card, 'graveyard');
      });
      U.shuffle(opponent.library, ctx.g.rnd);
    },
  });

  define('Mystic Retrieval', {
    targets: [ownISGrave('Instant or sorcery to return')],
    flashback: { cost: '{2}{R}' },
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.move(ctx.targets[0], 'hand'); },
  });

  define('Ringsight', {
    resolve: async ctx => {
      await E7.ringTempts(ctx.g, ctx.you);
      const colors = new Set(ctx.g.creatures(ctx.you).filter(isLegendary).flatMap(card => card.colors));
      const pool = ctx.you.library.filter(card => card.colors.some(color => colors.has(color)));
      if (pool.length) {
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Search for a card sharing a color with a legendary creature',
          search: true, aiHint: { kind: 'tutor' },
        });
        if (picked[0] && picked[0].zone === 'library') await ctx.g.move(picked[0], 'hand');
      }
      U.shuffle(ctx.you.library, ctx.g.rnd);
    },
  });

  define("Taigam's Scheming", { resolve: async ctx => { await E.surveil(ctx.g, ctx.you, 5); } });

  define('Treason of Isengard', {
    targets: [ownISGrave('Up to one instant or sorcery for the top of your library', true)],
    resolve: async ctx => {
      if (ctx.targets[0]) await ctx.g.move(ctx.targets[0], 'library');
      await E.amass(ctx.g, ctx.you, 2, 'Orc');
    },
  });

  define('Widespread Brutality', {
    resolve: async ctx => {
      const army = await E.amass(ctx.g, ctx.you, 2, 'Zombie');
      if (!army) return;
      const power = army.power;
      for (const creature of ctx.g.creatures().filter(card => !isArmy(card)).slice()) {
        await ctx.g.damageCreature(army, creature, power, { deferSBA: true });
      }
      await ctx.g.checkSBA();
    },
  });

  // Instants
  for (const name of ["Altar's Reap", 'Corrupted Conviction']) define(name, {
    addlCost: { sacCreature: true },
    resolve: async ctx => { await ctx.g.draw(ctx.you, 2, ctx.src); },
  });

  define('Cast Down', {
    targets: [T.creature({ prompt: 'Target nonlegendary creature', filter: (g, card) => card.zone === 'battlefield' && card.is('Creature') && !isLegendary(card), aiHint: { goal: 'removal' } })],
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
  });

  define('Commence the Endgame', {
    uncounterable: true,
    resolve: async ctx => { await ctx.g.draw(ctx.you, 2, ctx.src); await E.amass(ctx.g, ctx.you, ctx.you.hand.length, 'Zombie'); },
  });

  define('Dark Ritual', {
    resolve: async ctx => {
      ctx.you.pool.B = (ctx.you.pool.B || 0) + 3;
      ctx.g.lg(`${U.playerVerb(ctx.you, 'add', 'adds')} {B}{B}{B}.`);
    },
  });

  define('Filter Out', {
    resolve: async ctx => {
      for (const card of ctx.g.bf().filter(card => !card.is('Creature') && !card.is('Land')).slice()) await ctx.g.move(card, 'hand');
    },
  });

  define('Lazotep Plating', {
    resolve: async ctx => {
      await E.amass(ctx.g, ctx.you, 1, 'Zombie');
      E.pumpAllUntilEOT(ctx.g, (g, card) => card.ctrl === ctx.you, 0, 0, ['hexproof']);
      ctx.g.untilEffects.push({ expires: 'eot', kind: 'playerHexproof', who: ctx.you });
    },
  });

  define('Murder', {
    targets: [T.creature({ prompt: 'Target creature', aiHint: { goal: 'removal' } })],
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
  });

  define('Nasty End', {
    addlCost: { sacCreature: true },
    resolve: async ctx => {
      const legendary = (ctx.so.sacdSnaps || []).some(snap => (snap.super || snap.def.super || []).includes('Legendary'));
      await ctx.g.draw(ctx.you, legendary ? 3 : 2, ctx.src);
    },
  });

  define('Orcish Medicine', {
    targets: [T.creature({ prompt: 'Creature to gain lifelink or indestructible', aiHint: { goal: 'protect' } })],
    resolve: async ctx => {
      const target = ctx.targets[0];
      if (!target) return;
      const mode = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseOption', prompt: 'Orcish Medicine: choose one',
        options: [{ key: 'indestructible', label: 'Indestructible' }, { key: 'lifelink', label: 'Lifelink' }],
        aiHint: { kind: 'keywordChoice', target, choices: ['indestructible', 'lifelink'] },
      });
      E.grantUntilEOT(ctx.g, target, [mode === 'lifelink' ? 'lifelink' : 'indestructible']);
      await E.amass(ctx.g, ctx.you, 1, 'Orc');
    },
  });

  define("Sauron's Ransom", {
    resolve: async ctx => {
      const top = [];
      for (let i = 0; i < 4 && ctx.you.library.length; i++) {
        const card = ctx.you.library[ctx.you.library.length - 1];
        await ctx.g.move(card, 'exile');
        card.faceDown = true;
        top.push(card);
      }
      const opponent = await E.chooseOpponent(ctx.g, ctx.you, { prompt: "Sauron's Ransom: choose an opponent", goal: 'delegate' });
      let faceUp = [];
      if (opponent && top.length) {
        // The chosen opponent looks at all four cards before separating them.
        // Keep that private knowledge scoped to their seat while the piles are
        // being formed; the caster still sees ordinary face-down cards.
        for (const card of top) card.meta.revealedTo = [opponent.idx];
        faceUp = await opponent.controller.decide(ctx.g, {
          type: 'chooseCards', from: top, min: 0, max: top.length,
          prompt: "Sauron's Ransom: choose the face-up pile", aiHint: { kind: 'ransomSplit', cards: top },
        });
        if (!Array.isArray(faceUp) || faceUp.some(card => !top.includes(card))) faceUp = top.slice(0, Math.ceil(top.length / 2));
      }
      const faceDown = top.filter(card => !faceUp.includes(card));
      for (const card of faceUp) {
        card.faceDown = false;
        delete card.meta.revealedTo;
      }
      const choice = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseOption', prompt: "Sauron's Ransom: choose a pile for your hand",
        options: [
          { key: 'down', label: `Face-down pile (${faceDown.length} hidden cards)`, hiddenCount: faceDown.length },
          { key: 'up', label: `Face-up pile (${faceUp.map(card => card.name).join(', ') || 'empty'})`, cards: faceUp.slice() },
        ],
        aiHint: { kind: 'ransomPile', faceDownCount: faceDown.length, faceUpCards: faceUp },
      });
      const keep = choice === 'up' ? faceUp : faceDown;
      const bury = keep === faceUp ? faceDown : faceUp;
      for (const card of keep) {
        ctx.g.remove(card); card.faceDown = false; delete card.meta.revealedTo; card.zone = 'hand'; ctx.you.hand.push(card);
      }
      await ctx.g.withGraveyardEntryBatch(async () => {
        for (const card of bury) { card.faceDown = false; delete card.meta.revealedTo; await ctx.g.move(card, 'graveyard'); }
      });
      await E7.ringTempts(ctx.g, ctx.you);
    },
  });

  define('Turn Aside', {
    targets: [T.spell((g, stackObject, ctrl) => (stackObject.targets || []).flat().some(target =>
      target instanceof MTG.CardInst && target.zone === 'battlefield' && target.ctrl === ctrl), {
      prompt: 'Spell targeting a permanent you control', aiHint: { goal: 'counter' },
    })],
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.counterStackObject(ctx.targets[0], { source: ctx.src }); },
  });

  define('Ultimate Price', {
    targets: [T.creature({
      prompt: 'Target monocolored creature',
      filter: (g, card) => card.zone === 'battlefield' && card.is('Creature') && card.colors.length === 1,
      aiHint: { goal: 'removal' },
    })],
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
  });

  define('Unlicensed Disintegration', {
    targets: [T.creature({ prompt: 'Target creature', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const target = ctx.targets[0];
      if (!target) return;
      const controller = target.ctrl;
      const hasArtifact = ctx.g.bf().some(card => card.ctrl === ctx.you && card.is('Artifact'));
      await ctx.g.destroy(target);
      if (hasArtifact && controller && !controller.lost) await ctx.g.damagePlayer(ctx.src, controller, 3);
    },
  });

  // Artifacts
  define('Dimir Signet', { mana: { cost: { tap: true, mana: '{1}' }, produce: [{ U: 1, B: 1 }] } });

  define('Infiltration Lens', {
    equip: '{1}',
    triggers: [{
      on: 'becomesBlockedByCreature', desc: 'Draw two for this blocking creature', opt: true,
      filter: (g, self, data) => self.attachedTo === data.attacker.iid,
      run: async ctx => { await ctx.g.draw(ctx.you, 2, ctx.src); },
    }],
  });

  define('Library of Leng', { noMaxHand: true, discardToLibraryTop: true });

  define('Phial of Galadriel', {
    drawWhileEmptyExtra: true,
    replace: [{
      event: 'lifegain',
      cond: (g, self) => self.ctrl.life <= 5,
      run: (g, amount, player, self) => player === self.ctrl ? amount * 2 : amount,
    }],
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
  });

  define("Seer's Lantern", {
    mana: tapFor([{ C: 1 }]),
    abilities: [{ label: 'Scry 1', cost: { mana: '{2}', tap: true }, run: async ctx => { await E.scry(ctx.g, ctx.you, 1); }, aiScore: () => 0.5 }],
  });

  define('Spinning Wheel', {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    abilities: [{
      label: 'Tap target creature', cost: { mana: '{5}', tap: true },
      targets: [T.creature({ prompt: 'Creature to tap', aiHint: { goal: 'tap' } })],
      run: async ctx => { if (ctx.targets[0] && !ctx.targets[0].tapped) ctx.g.tap(ctx.targets[0]); },
      aiScore: (g, card, player) => g.creatures().some(creature => creature.ctrl !== player && !creature.tapped) ? 1 : 0,
    }],
  });

  // Enchantments and Sagas
  define('Book of Mazarbul', {
    saga: [
      { run: async ctx => { await E.amass(ctx.g, ctx.you, 1, 'Orc'); } },
      { run: async ctx => { await E.amass(ctx.g, ctx.you, 2, 'Orc'); } },
      { run: async ctx => { E.pumpAllUntilEOT(ctx.g, (g, card) => card.ctrl === ctx.you, 1, 0, ['menace']); } },
    ],
    triggers: [],
  });

  define('Call of the Ring', {
    triggers: [{
      on: 'upkeep', desc: 'The Ring tempts you', filter: (g, self, data) => data.player === self.ctrl,
      run: async ctx => { await E7.ringTempts(ctx.g, ctx.you); },
    }, {
      on: 'ringTempted', desc: 'Pay 2 life to draw',
      filter: (g, self, data) => data.player === self.ctrl && !!data.bearer,
      run: async ctx => {
        if (ctx.you.life < 2) return;
        const choice = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Call of the Ring: pay 2 life to draw a card?',
          options: [{ key: 'yes', label: 'Pay 2 life' }, { key: 'no', label: 'Decline' }],
          aiHint: { kind: 'lifeForCard', life: 2 },
        });
        if (choice === 'yes') { await ctx.g.loseLife(ctx.you, 2, ctx.src.name); await ctx.g.draw(ctx.you, 1, ctx.src); }
      },
    }],
  });

  define('Dreadhorde Invasion', {
    triggers: [{
      on: 'upkeep', desc: 'Lose 1 life and amass Zombies 1', filter: (g, self, data) => data.player === self.ctrl,
      run: async ctx => { await ctx.g.loseLife(ctx.you, 1, ctx.src.name); await E.amass(ctx.g, ctx.you, 1, 'Zombie'); },
    }, {
      on: 'attacks', desc: 'Large Zombie token gains lifelink',
      filter: (g, self, data) => data.card.ctrl === self.ctrl && data.card.isToken && data.card.hasSub('Zombie') && data.card.power >= 6,
      run: async ctx => { E.grantUntilEOT(ctx.g, ctx.data.card, ['lifelink']); },
    }],
  });

  define('March from the Black Gate', {
    triggers: [{
      on: 'etb', desc: 'Amass Orcs 1', filter: etbSelf, run: async ctx => { await E.amass(ctx.g, ctx.you, 1, 'Orc'); },
    }, {
      on: 'attacks', desc: 'Army attacks — amass Orcs 1',
      filter: (g, self, data) => data.card.ctrl === self.ctrl && isArmy(data.card),
      run: async ctx => { await E.amass(ctx.g, ctx.you, 1, 'Orc'); },
    }],
  });

  define('One Ring to Rule Them All', {
    saga: [{
      run: async ctx => {
        const bearer = await E7.ringTempts(ctx.g, ctx.you);
        const n = bearer ? Math.max(0, bearer.power) : 0;
        for (const player of ctx.g.alivePlayers()) await ctx.g.mill(player, n);
      },
    }, {
      run: async ctx => { await ctx.g.destroyMany(ctx.g.creatures().filter(card => !isLegendary(card)), { source: ctx.src }); },
    }, {
      run: async ctx => {
        for (const opponent of E.eachOpp(ctx.g, ctx.you)) {
          const n = opponent.graveyard.filter(card => card.is('Creature')).length;
          if (n) await ctx.g.loseLife(opponent, n, ctx.src.name);
        }
      },
    }],
    triggers: [],
  });

  // Lands
  define('Dismal Backwater', {
    producesColors: ['U', 'B'], entersTapped: true, mana: tapFor([{ U: 1 }, { B: 1 }]),
    triggers: [{ on: 'etb', desc: 'Gain 1 life', filter: etbSelf, run: async ctx => { await ctx.g.gainLife(ctx.you, 1, ctx.src); } }],
  });
  define('Izzet Guildgate', { producesColors: ['U', 'R'], entersTapped: true, mana: tapFor([{ U: 1 }, { R: 1 }]) });
  define('Temple of Deceit', {
    producesColors: ['U', 'B'], entersTapped: true, mana: tapFor([{ U: 1 }, { B: 1 }]),
    triggers: [{ on: 'etb', desc: 'Scry 1', filter: etbSelf, run: async ctx => { await E.scry(ctx.g, ctx.you, 1); } }],
  });
})();
