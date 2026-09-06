// Object-bound casting permissions and rules used by Starter Commander cards.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, G = M.Game.prototype;
  const live = (g, id, version) => {
    const card = g.byIid(id);
    return card?.zone === 'battlefield' && card.zoneVersion === version && !card.phasedOut && !card.cur?.abilitiesDisabled ? card : null;
  };
  const permission = (card, kind, extra = {}) => ({starterPermission: kind, starterCardVersion: card.zoneVersion, ...extra});
  function offers(g, player) {
    const out = [], add = (card, kind, extra) => out.push({card, from: card.zone, alt: permission(card, kind, extra)});
    if(g.creatures(player).filter(c=>!c.tapped&&c.kw('flying')).length>=4)
      for(const card of [...player.hand,...player.command])if(card.def.starterSephara)
        add(card,'sephara',{altCostStr:'{W}',label:'Pay {W} and tap four untapped fliers'});
    const sources = g.bf().filter(c => c.ctrl === player && c.def.starterGisa && !c.cur?.abilitiesDisabled &&
      c.meta.starterGisaCastTurn !== g.turnNo && g.turnPlayer === player);
    for (const card of player.graveyard) {
      if (card.hasSub('Zombie')) {
        if (card.is('Creature')) for (const source of sources) add(card, 'gisa', {
          starterSource: source.iid, starterSourceVersion: source.zoneVersion, label: 'Gisa and Geralf: cast a Zombie'});
        if (player.starterLilianaCastTurn === g.turnNo) add(card, 'liliana', {label: 'Liliana: cast a Zombie from your graveyard'});
      }
      if (card.def.starterScourge && g.creatures(player).filter(c => g.canSacrifice(c)).length >= 2)
        add(card, 'scourge', {altCostStr: '{B}{B}', label: 'Pay {B}{B} and sacrifice two creatures'});
    }
    for (const grant of g.starterLichGrants || []) {
      const card = g.byIid(grant.card);
      if (grant.player === player.idx && grant.turn === g.turnNo && card?.zone === 'graveyard' && card.zoneVersion === grant.version)
        add(card, 'lich', {starterGrant: grant.id, label: 'Havengul Lich: cast the chosen creature'});
    }
    return out;
  }
  function allowed(g, player, card, alt) {
    if (alt.starterCardVersion !== card.zoneVersion || alt.from && alt.from !== card.zone || !g.canCastTiming(player, card, alt)) return false;
    let expected;
    if (alt.starterPermission === 'sephara') {
      if (!card.def.starterSephara || !['hand', 'command'].includes(card.zone) || !player[card.zone].includes(card) ||
          g.creatures(player).filter(c => !c.tapped && c.kw('flying')).length < 4) return false;
      expected = permission(card, 'sephara', {altCostStr: '{W}', label: 'Pay {W} and tap four untapped fliers'});
    } else expected = offers(g, player).find(row => row.card === card && row.alt.starterPermission === alt.starterPermission &&
      row.alt.starterSource === alt.starterSource && row.alt.starterGrant === alt.starterGrant)?.alt;
    if (!expected) return false;
    const keys = new Set([...Object.keys(expected), 'from', 'xVal']);
    return Object.keys(alt).every(key => keys.has(key) && (key === 'from' || key==='xVal'&&Number.isInteger(alt[key])&&alt[key]>=0 || alt[key] === expected[key]));
  }
  async function prepare(ctx, paidAddl) {
    const kind = ctx.so.castOpts.starterPermission;
    if (!['scourge', 'sephara'].includes(kind)) return true;
    const tapping = kind === 'sephara', n = tapping ? 4 : 2;
    const pool = ctx.g.creatures(ctx.you).filter(c => tapping ? !c.tapped && c.kw('flying') : ctx.g.canSacrifice(c));
    const versions=new Map(pool.map(card=>[card,card.zoneVersion]));
    const cards = await M.StarterPrecons.choose(ctx.g, ctx.you, pool, n, n,
      tapping ? 'Tap four untapped creatures with flying' : 'Sacrifice two creatures', tapping ? 'addlTap' : 'sacCost');
    if (cards.length !== n || cards.some(card=>card.zoneVersion!==versions.get(card))) return false;
    ctx.so.starterPayment = cards.map(card => ({card, version: versions.get(card), tapping}));
    if (tapping) paidAddl.tapped.push(...cards); else paidAddl.sacd.push(...cards);
    return true;
  }
  function validate(ctx) {
    return allowed(ctx.g, ctx.you, ctx.src, ctx.so.castOpts) && (ctx.so.starterPayment || []).every(row =>
      row.card.zone === 'battlefield' && row.card.zoneVersion === row.version && row.card.ctrl === ctx.you &&
      (row.tapping ? !row.card.tapped && row.card.kw('flying') : ctx.g.canSacrifice(row.card)));
  }
  function commit(ctx) {
    const alt = ctx.so.castOpts;
    if (alt.starterPermission === 'gisa') {
      const source = live(ctx.g, alt.starterSource, alt.starterSourceVersion);
      if (source) source.meta.starterGisaCastTurn = ctx.g.turnNo;
    }
    if (alt.starterPermission === 'lich') {
      // Each activation creates its own delayed trigger for that exact card.
      for (const grant of (ctx.g.starterLichGrants || []).filter(row => row.card === ctx.src.iid &&
        row.version === ctx.src.zoneVersion && row.player === ctx.you.idx && row.turn === ctx.g.turnNo)) {
        const source = live(ctx.g, grant.source, grant.sourceVersion);
        if (!source) continue;
        const abilities = [...(ctx.src.def.abilities || [])];
        const mana = ctx.src.def.mana ? (Array.isArray(ctx.src.def.mana) ? ctx.src.def.mana : [ctx.src.def.mana]) : [];
        ctx.g.queueTrigger({src: source, ctrl: ctx.you, name: 'Gain the cast creature’s activated abilities', run: async next => {
          if (!live(next.g, grant.source, grant.sourceVersion)) return;
          next.g.untilEffects.push({kind: 'starterLichAbilities', expires: 'eot', apply: (game, bf) => {
            const current = bf.find(c => c.iid === grant.source && c.zoneVersion === grant.sourceVersion);
            if (current) { current.cur.extraAbilities.push(...abilities); current.cur.extraMana.push(...mana); }
          }});
          next.g.recalc();
        }});
      }
    }
  }
  M.StarterCasting = {offers, allowed, prepare, validate, commit};

  // A targeting surcharge is a cost increase, not a Ward trigger.
  G.starterTargetTax = function (player, spell, opts = {}) {
    const sources = this.bf().filter(c => c.ctrl !== player && c.def.starterFlyingTargetTax && !c.cur?.abilitiesDisabled);
    if (!sources.length) return 0;
    const tax = targets => sources.reduce((sum, source) => sum + [...new Set(targets.flat(Infinity))].filter(c =>
      c instanceof M.CardInst && c.zone === 'battlefield' && c.ctrl === source.ctrl && c.is('Creature') && c.kw('flying')).length * 2, 0);
    if (opts.targets !== undefined) return tax(opts.targets);
    const targets = (this.spellTargetSpecs(spell, opts, player) || []).flatMap(spec => this.legalTargets(spec, spell, player));
    return targets.length ? Math.min(...targets.map(c => tax([c]))) : 0;
  };
  function gideonRequirements(g, card) {
    return g.untilEffects.filter(e => e.kind === 'starterGideonRequirement' && e.player === card.ctrl &&
      g.turnPlayer === e.player && e.player.turnsStarted === e.nextTurn &&
      g.byIid(e.iid)?.zone==='battlefield' && g.byIid(e.iid).zoneVersion===e.version &&
      !g.byIid(e.iid).phasedOut && g.byIid(e.iid).is('Planeswalker'));
  }
  M.StarterCombat = {
    forced: (g, card) => gideonRequirements(g, card).some(e => g.canAttackTarget(card, g.byIid(e.iid))),
    targets: (g, card, targets) => {
      const requirements = gideonRequirements(g, card);
      if (!requirements.length) return null;
      const goaders = [...new Set(g.goadersOf(card))];
      for(const effect of g.untilEffects)if(((effect.kind==='mustAttack'&&effect.who===card.ctrl)||
        (effect.kind==='goadCard'&&effect.iid===card.iid))&&effect.notPlayer&&!goaders.includes(effect.notPlayer))goaders.push(effect.notPlayer);
      const encore=g.untilEffects.filter(e=>e.kind==='oracleEncoreAttack'&&e.iid===card.iid&&e.version===card.zoneVersion&&e.turn===g.turnNo);
      const score = target => requirements.filter(e => target === g.byIid(e.iid)).length +
        encore.filter(e=>target===e.targetPlayer).length+
        goaders.filter(player => target instanceof M.Player && target !== player).length;
      const max = Math.max(0, ...targets.map(score));
      return targets.filter(target => score(target) === max);
    },
  };
  G.fight = async function (first, second, opts={}) {
    if (![first, second].every(c => c?.zone === 'battlefield' && c.is('Creature') && !c.phasedOut)) return false;
    const rows = [first, second].map(card => ({card, version: card.zoneVersion, ctrl: card.ctrl, power: Math.max(0, card.power)}));
    for(const row of rows)await this.emit('fight', {card:row.card,cards:[row]});
    const dealt=await this.damageBatch([{src: first, target: second, n: rows[0].power}, {src: second, target: first, n: rows[1].power}], {deferSBA: true});
    if(!opts.deferSBA)await this.checkSBA();
    return dealt;
  };
  G.starterRetargetSpell=async function(spell,chooser){
    if(!spell.targets.length)return false;
    const yes=await chooser.controller.decide(this,{type:'chooseOption',prompt:spell.name+': choose new targets?',
      options:[{key:'no',label:'Keep targets'},{key:'yes',label:'Choose new targets'}],aiHint:{kind:'newTargets',so:spell}});
    if(yes!=='yes')return false;
    const oldIdentities=(spell.targetIdentities||this.captureTargetIdentities(spell.targets)).flat(Infinity).filter(Boolean);
    const specs=(spell.targetSpecs||this.spellTargetSpecs(spell.card,spell.castOpts,spell.ctrl)||[]).map((spec,i)=>{
      const count=[spell.targets[i]].flat(Infinity).filter(Boolean).length;
      return {...spec,count,min:count,upTo:false};
    });
    const ctx={g:this,src:spell.card,you:spell.ctrl,so:spell,decisionPlayer:chooser,suppressTargetEvents:true};
    if(!await this.pickTargets(ctx,specs,spell.card,spell.ctrl))return false;
    spell.targets=ctx.targets;spell.targetIdentities=this.captureTargetIdentities(spell.targets);
    const fresh=spell.targets.flat(Infinity).filter(target=>target instanceof M.CardInst&&
      !oldIdentities.some(identity=>identity.iid===target.iid&&identity.zoneVersion===target.zoneVersion));
    for(const card of fresh)await this.emit('targeted',{card,byPlayer:spell.ctrl,src:spell.card,isSpell:true,isInstantSorcery:true,so:spell});
    this.queueWardTriggers(spell,{wardTargets:(ctx.wardTargets||[]).filter(row=>fresh.includes(row.target))});
    if(spell.damageDivision){const targets=spell.targets.flat(Infinity).filter(Boolean);spell.damageDivision=spell.damageDivision.map((row,i)=>({...row,
      iid:targets[i]?.iid,playerIdx:targets[i] instanceof M.Player?targets[i].idx:null}));}
    if(spell.counterDistribution){const targets=spell.targets.flat(Infinity).filter(Boolean);spell.counterDistribution=spell.counterDistribution.map((row,i)=>({...row,iid:targets[i]?.iid}));}
    return true;
  };
})();
