(function () {
  'use strict';
  const MTG = globalThis.MTG;
  const kinds = new Set(['required-block', 'source-block', 'defender-permission', 'assign-unblocked','assign-toughness']);
  function validate(rule, bound = true) {
    if (!rule || !kinds.has(rule.kind)) return false;
    const fields = rule.kind === 'source-block' ? ['kind','mode',...(bound?['source']:[])] : rule.kind==='assign-toughness'?['kind','requires','defenderPermission']:['kind'];
    if (Object.keys(rule).some(key => !fields.includes(key))) throw Error('Invalid combat restriction fields');
    if(rule.kind==='assign-toughness'&&(rule.requires!==undefined&&!['toughness-greater','vigilance','defender'].includes(rule.requires)||rule.defenderPermission!==undefined&&(rule.defenderPermission!==true||rule.requires!=='defender')))throw Error('Invalid toughness assignment condition');
    if (rule.kind === 'source-block' && (!['require','forbid'].includes(rule.mode) || bound && rule.source !== null &&
      (!rule.source || !Number.isInteger(rule.source.iid) || !Number.isInteger(rule.source.version) || Object.keys(rule.source).some(key => !['iid','version'].includes(key))))) throw Error('Invalid related combat source');
    return true;
  }
  function bind(ctx, restriction) {
    const rule = restriction.combatRule;
    if (rule?.kind !== 'source-block') return restriction;
    validate(rule, false);
    const source = ctx.src, version = ctx.sourceZoneVersion ?? source?.zoneVersion;
    return {...restriction,combatRule:{...rule,source:source?.zone === 'battlefield' && source.zoneVersion === version ? {iid:source.iid,version} : null}};
  }
  const matchesSource = (card, lock) => card && lock && card.zone === 'battlefield' && card.iid === lock.iid && card.zoneVersion === lock.version;
  function apply(game, card, rule) {
    if (!validate(rule)) return false;
    if (rule.kind === 'required-block') card.cur.mustBlock = true;
    else if (rule.kind === 'defender-permission') card.cur.defenderCanAttack = true;
    else if (rule.kind === 'assign-unblocked') card.cur.mayAssignUnblocked = true;
    else if(rule.kind==='assign-toughness'){
      (card.cur.toughnessAssignmentRules||=[]).push(rule);
      if(rule.defenderPermission)card.cur.defenderCanAttack=true;
    }
    else if (rule.source) {
      if (rule.mode === 'require') (card.cur.requiredBlockSources ||= []).push(rule.source);
      else {
        const prior = card.cur.cantBlockCreature;
        card.cur.cantBlockCreature = (g, attacker) => !!prior?.(g,attacker) || matchesSource(attacker,rule.source);
      }
    }
    return true;
  }
  function requirements(blocker, attacker) {
    return (blocker.cur.mustBlock ? 1 : 0) + (blocker.cur.requiredBlockSources || []).filter(lock => matchesSource(attacker,lock)).length;
  }
  function hasRequirements(card) { return card.cur.mustBlock || card.cur.requiredBlockSources?.length; }
  function score(blockers, assignments) {
    return blockers.reduce((n, blocker) => {
      const assigned = assignments.filter(pair => pair.blocker === blocker).map(pair => pair.attacker);
      return n + (blocker.cur.mustBlock && assigned.length ? 1 : 0) + (blocker.cur.requiredBlockSources || []).filter(lock => assigned.some(attacker => matchesSource(attacker, lock))).length;
    }, 0);
  }
  function upper(blocker, legal, capacity) {
    if (!legal?.length) return 0;
    const weights = legal.map(attacker => (blocker.cur.requiredBlockSources || []).filter(lock => matchesSource(attacker, lock)).length).sort((a, b) => b - a);
    return (blocker.cur.mustBlock ? 1 : 0) + weights.slice(0, capacity).reduce((sum, n) => sum + n, 0);
  }
  async function assignUnblocked(game, attacker, blockers, amount) {
    if (!attacker.cur.mayAssignUnblocked || amount <= 0 || !attacker.wasBlocked && !blockers.length) return false;
    const choice = await attacker.ctrl.controller.decide(game, {
      type:'chooseOption',prompt:attacker.name + ': assign combat damage as though unblocked?',
      options:[{key:'yes',label:'Damage the defending player or planeswalker'},{key:'no',label:'Assign damage to blockers'}],
      aiHint:{kind:'combatAsUnblocked',card:attacker,blockers,amount,defender:attacker.attacking},
    });
    return choice === 'yes';
  }
  const usesToughness=card=>(card.cur.toughnessAssignmentRules||[]).some(rule=>!rule.requires||(rule.requires==='toughness-greater'?card.toughness>card.power:card.kw(rule.requires)));
  function blockerCount(ctx,value){
    if(value.kind!=='combat-blocker-count-v8'||!['self','event-card'].includes(value.subject)||!Number.isSafeInteger(value.multiply)||Object.keys(value).some(key=>!['kind','subject','multiply'].includes(key)))throw Error('Invalid combat blocker count');
    const card=value.subject==='self'?ctx.src:ctx.oracleSourceCapture?.eventCard||ctx.data?.attacker;
    const version=value.subject==='self'?ctx.sourceZoneVersion:ctx.eventCardZoneVersion;
    if(!card||card.zone!=='battlefield'||version!==undefined&&card.zoneVersion!==version||!card.attacking)return 0;
    return (card.blockedBy||[]).filter(blocker=>blocker.zone==='battlefield'&&!blocker.phasedOut&&blocker.is('Creature')).length*value.multiply;
  }
  function attackedOpponents(ctx,value){
    if(value.kind!=='combat-attacked-opponents-v8'||Object.keys(value).length!==1)throw Error('Invalid combat attacked-opponents count');
    if(ctx.g.turnPlayer!==ctx.you)return 0;
    // The attacked opponent still counts after leaving the game (Melee's
    // official ruling); this is declaration history, not a live-player count.
    return new Set((ctx.g.combat?.declaredAttackTargets||[]).filter(target=>target instanceof MTG.Player&&target!==ctx.you)).size;
  }
  MTG.OracleV8CombatRestrictions = {apply,bind,requirements,hasRequirements,score,upper,assignUnblocked,matchesSource,usesToughness,blockerCount,attackedOpponents};
})();
