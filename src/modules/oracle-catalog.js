// ===== oracle-catalog.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

// Oracle batches are generated from Scryfall's Oracle Cards bulk feed.  The
// registry keeps three concerns together without confusing them:
//   1. exact Oracle/raw data used by the rules engine,
//   2. an explicit, auditable engine implementation marker, and
//   3. searchable metadata that can later power the deckbuilder.
(function () {
  const batches = MTG.ORACLE_BATCHES = MTG.ORACLE_BATCHES || [];
  const registeredNames = new Map();
  const COLORS = ['W', 'U', 'B', 'R', 'G'];

  function permanentSpec(what, prompt) {
    const kinds = what === 'creature or planeswalker' ? ['Creature', 'Planeswalker']
      : what === 'artifact or enchantment' ? ['Artifact', 'Enchantment']
        : what === 'nonland permanent' ? ['nonland']
          : what === 'permanent' ? ['permanent']
            : [what.charAt(0).toUpperCase() + what.slice(1)];
    return {
      what: 'permanent',
      prompt,
      filter: (game, card) => card && card.zone === 'battlefield' && kinds.some(kind =>
        kind === 'permanent' ? true : kind === 'nonland' ? !card.is('Land') : card.is(kind)),
    };
  }

  function damageSpec(what) {
    if (what === 'any target') return { what: 'any', prompt: 'Damage target' };
    if (what === 'target creature') return permanentSpec('creature', 'Damage creature');
    if (what === 'target creature or planeswalker') return permanentSpec('creature or planeswalker', 'Damage creature or planeswalker');
    if (what === 'target opponent') return { what: 'opponent', prompt: 'Damage opponent' };
    if (what === 'target player') return { what: 'player', prompt: 'Damage player' };
    if (what === 'target player or planeswalker') {
      return {
        what: 'any',
        prompt: 'Damage player or planeswalker',
        filter: (game, target) => target instanceof MTG.Player || target && target.is && target.is('Planeswalker'),
      };
    }
    throw new Error('Unknown Oracle damage target class: ' + what);
  }

  function compileSpell(script, operation) {
    const amount = ctx => operation.n === 'X' ? Math.max(0, Number(ctx.x) || 0) : operation.n;
    if (operation.kind === 'spell-draw') {
      script.resolve = async ctx => { await ctx.g.draw(ctx.you, operation.n); };
      return;
    }
    if (operation.kind === 'spell-counter') {
      script.targets = [{
        zone: 'stack',
        what: 'spell',
        prompt: 'Counter target spell',
        filter: (game, stackObject) => stackObject && stackObject.kind === 'spell',
      }];
      script.resolve = async ctx => {
        const target = ctx.targets[0];
        if (target && ctx.g.stack.includes(target) && !MTG.isUncounterable(ctx.g, target)) {
          await ctx.g.counterStackObject(target, { source: ctx.src });
        }
      };
      return;
    }
    if (operation.kind === 'spell-destroy' || operation.kind === 'spell-exile') {
      script.targets = [permanentSpec(operation.what, operation.kind === 'spell-destroy' ? 'Destroy target' : 'Exile target')];
      script.resolve = async ctx => {
        const target = ctx.targets[0];
        if (!target) return;
        if (operation.kind === 'spell-destroy') await ctx.g.destroy(target, { noRegen: !!operation.noRegen });
        else await ctx.g.exileCard(target);
      };
      return;
    }
    if (operation.kind === 'spell-damage') {
      if (operation.what !== 'each opponent') script.targets = [damageSpec(operation.what)];
      script.resolve = async ctx => {
        const n = amount(ctx);
        if (operation.what === 'each opponent') await ctx.g.damageOpponents(ctx.src, ctx.you, n);
        else if (ctx.targets[0]) await ctx.g.damageAny(ctx.src, ctx.targets[0], n);
      };
      return;
    }
    if (operation.kind === 'spell-pump') {
      script.targets = [permanentSpec('creature', 'Target creature')];
      script.resolve = async ctx => {
        MTG.E.pumpUntilEOT(ctx.g, ctx.targets[0], operation.power, operation.toughness, operation.keywords || []);
        await ctx.g.checkSBA();
      };
      return;
    }
    if (operation.kind === 'spell-team-pump') {
      script.resolve = async ctx => {
        MTG.E.pumpAllUntilEOT(ctx.g, (game, card) => card.ctrl === ctx.you,
          operation.power, operation.toughness, operation.keywords || []);
        await ctx.g.checkSBA();
      };
      return;
    }
    if (operation.kind === 'spell-life-gain') {
      script.resolve = async ctx => { await ctx.g.gainLife(ctx.you, operation.n, ctx.src); };
      return;
    }
    if (operation.kind === 'spell-bounce') {
      script.targets = [permanentSpec(operation.what, 'Return target to hand')];
      script.resolve = async ctx => {
        if (ctx.targets[0]) await ctx.g.move(ctx.targets[0], 'hand');
      };
      return;
    }
    if (operation.kind === 'spell-discard') {
      script.targets = [{ what: operation.what, prompt: 'Choose player to discard' }];
      script.resolve = async ctx => {
        const player = ctx.targets[0];
        if (!player) return;
        const n = Math.min(operation.n, player.hand.length);
        if (!n) return;
        const cards = await player.controller.decide(ctx.g, {
          type: 'chooseCards',
          from: player.hand,
          min: n,
          max: n,
          prompt: 'Discard ' + n + (n === 1 ? ' card' : ' cards'),
          aiHint: { kind: 'cleanupDiscard' },
        });
        await ctx.g.discard(player, cards);
      };
      return;
    }
    if (operation.kind === 'spell-mill') {
      script.targets = [{ what: 'player', prompt: 'Choose player to mill' }];
      script.resolve = async ctx => {
        if (ctx.targets[0]) await ctx.g.mill(ctx.targets[0], operation.n);
      };
      return;
    }
    throw new Error('Unknown Oracle spell implementation: ' + operation.kind);
  }

  function compileOracleScript(batch, entry) {
    const script = {
      oracleBatch: batch.id,
      oracleId: entry.oracleId,
      oracleImplemented: true,
      semanticClass: entry.semanticClass,
      implementedKeywords: (entry.implementedKeywords || []).slice(),
      oracleContracts: (entry.oracleContracts || []).slice(),
      oracleImplementation: (entry.implementation || []).map(operation => Object.assign({}, operation)),
    };
    const mana = [];
    const triggers = [];
    const statics = [];
    for (const operation of entry.implementation || []) {
      if (operation.kind === 'mana-source') {
        mana.push({ cost: { tap: true }, produce: operation.produce.map(option => Object.assign({}, option)) });
        continue;
      }
      if (operation.kind === 'enters-tapped') {
        script.entersTapped = true;
        continue;
      }
      if (operation.kind === 'cant-block') {
        statics.push({ apply: (game, self) => { self.cur.cantBlock = true; } });
        continue;
      }
      if (operation.kind === 'must-attack') {
        script.mustAttack = true;
        continue;
      }
      if (operation.kind === 'etb-draw') {
        triggers.push({
          on: 'etb',
          desc: 'Draw ' + operation.n,
          filter: (game, self, data) => data.card === self,
          run: async ctx => { await ctx.g.draw(ctx.you, operation.n); },
        });
        continue;
      }
      if (operation.kind === 'etb-life-gain') {
        triggers.push({
          on: 'etb',
          desc: 'Gain ' + operation.n + ' life',
          filter: (game, self, data) => data.card === self,
          run: async ctx => { await ctx.g.gainLife(ctx.you, operation.n, ctx.src); },
        });
        continue;
      }
      if (operation.kind === 'dies-draw') {
        triggers.push({
          on: 'dies',
          desc: 'Draw ' + operation.n,
          filter: (game, self, data) => data.card === self,
          run: async ctx => { await ctx.g.draw(ctx.you, operation.n); },
        });
        continue;
      }
      if (operation.kind === 'etb-scry' || operation.kind === 'etb-surveil') {
        triggers.push({
          on: 'etb',
          desc: (operation.kind === 'etb-scry' ? 'Scry ' : 'Surveil ') + operation.n,
          filter: (game, self, data) => data.card === self,
          run: async ctx => {
            if (operation.kind === 'etb-scry') await MTG.E.scry(ctx.g, ctx.you, operation.n);
            else await MTG.E.surveil(ctx.g, ctx.you, operation.n);
          },
        });
        continue;
      }
      if (operation.kind === 'etb-token') {
        const token = operation.token;
        const tokenDef = {
          name: token.name,
          cost: null,
          super: (token.super || []).slice(),
          types: (token.types || ['Creature']).slice(),
          subtypes: (token.subtypes || []).slice(),
          power: String(token.power),
          toughness: String(token.toughness),
          oracle: '',
          kws: (token.keywords || []).slice(),
          colorsOverride: (token.colors || []).slice(),
          isTokenDef: true,
        };
        triggers.push({
          on: 'etb',
          desc: 'Create ' + operation.n + ' ' + token.name,
          filter: (game, self, data) => data.card === self,
          run: async ctx => { await ctx.g.makeTokens(tokenDef, ctx.you, { n: operation.n }); },
        });
        continue;
      }
      if (operation.kind.startsWith('spell-')) {
        compileSpell(script, operation);
        continue;
      }
      throw new Error(batch.id + '/' + entry.raw.name + ': unknown Oracle implementation ' + operation.kind);
    }
    if (mana.length) {
      script.mana = mana.length === 1 ? mana[0] : mana;
      const colors = new Set();
      for (const source of mana) {
        for (const option of source.produce) {
          if (option.ANY) COLORS.forEach(color => colors.add(color));
          else Object.keys(option).filter(color => COLORS.includes(color)).forEach(color => colors.add(color));
        }
      }
      script.producesColors = [...colors];
    }
    if (triggers.length) script.triggers = triggers;
    if (statics.length) script.statics = statics;
    return script;
  }

  MTG.registerOracleBatch = function (batch) {
    if (!batch || !batch.id || !Array.isArray(batch.cards)) {
      throw new Error('Oracle batch needs an id and cards array.');
    }
    if (batches.some(existing => existing.id === batch.id)) {
      throw new Error(`Duplicate Oracle batch id: ${batch.id}`);
    }

    for (const entry of batch.cards) {
      const name = entry && entry.raw && entry.raw.name;
      if (!name || !entry.oracleId || !entry.semanticClass) {
        throw new Error(`${batch.id}: every Oracle card needs name, oracleId, and semanticClass.`);
      }
      if (registeredNames.has(name)) {
        throw new Error(`${name} is already registered by ${registeredNames.get(name)}.`);
      }
      if (MTG.SCRIPTS[name]) {
        throw new Error(`${name} already has a manual engine script; Oracle batches never overwrite it.`);
      }

      registeredNames.set(name, batch.id);
      MTG.SCRIPTS[name] = compileOracleScript(batch, entry);
    }

    batches.push(batch);
  };

  MTG.applyOracleBatches = function (rawDB) {
    if (!rawDB || !rawDB.cards) throw new Error('Oracle batches need MTG raw card data.');
    const applied = new Set(rawDB.oracleBatches || []);
    for (const batch of batches) {
      for (const entry of batch.cards) {
        const raw = entry.raw;
        const existing = rawDB.cards[raw.name];
        if (existing) {
          if (existing._oracleId === entry.oracleId) continue;
          throw new Error(`${batch.id}: ${raw.name} collides with an existing raw definition.`);
        }
        rawDB.cards[raw.name] = Object.assign({}, raw, {
          _oracleBatch: batch.id,
          _oracleId: entry.oracleId,
          _scryfallId: entry.scryfallId,
        });
      }
      applied.add(batch.id);
    }
    rawDB.oracleBatches = [...applied];
    return rawDB;
  };

  function typeLine(raw) {
    const left = [...(raw.super || []), ...(raw.types || [])].join(' ');
    return `${left}${(raw.subtypes || []).length ? ` — ${raw.subtypes.join(' ')}` : ''}`;
  }

  MTG.buildCardCatalog = function (rawDB, defs) {
    const imported = new Map();
    for (const batch of batches) {
      for (const entry of batch.cards) imported.set(entry.raw.name, { batch, entry });
    }

    const catalog = {};
    for (const [name, raw] of Object.entries(rawDB.cards || {})) {
      const found = imported.get(name);
      const def = defs && defs[name];
      const metadata = found ? found.entry.catalog || {} : {};
      catalog[name] = Object.assign({
        name,
        oracleId: raw._oracleId || null,
        scryfallId: raw._scryfallId || null,
        manaCost: raw.cost || '',
        typeLine: metadata.typeLine || typeLine(raw),
        oracleText: raw.oracle || '',
        colorIdentity: metadata.colorIdentity || (MTG.cardColorIdentity && def ? MTG.cardColorIdentity(def) : raw._ci || []),
        keywords: metadata.keywords || [],
        commanderLegality: metadata.commanderLegality || null,
        set: metadata.set || null,
        setName: metadata.setName || null,
        collectorNumber: metadata.collectorNumber || null,
        rarity: metadata.rarity || null,
        releasedAt: metadata.releasedAt || null,
        engineStatus: found ? 'certified' : 'certified-legacy',
        engineBatch: found ? found.batch.id : null,
        semanticClass: found ? found.entry.semanticClass : 'manual',
        implementedKeywords: found ? (found.entry.implementedKeywords || []).slice() : [],
        oracleContracts: found ? (found.entry.oracleContracts || []).slice() : [],
        implementationKinds: found ? (found.entry.implementation || []).map(operation => operation.kind) : [],
      }, metadata);
    }
    MTG.CARD_CATALOG = catalog;
    return catalog;
  };
})();
