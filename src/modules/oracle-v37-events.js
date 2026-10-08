'use strict';
((M)=>{
  const exileCount=(data,player)=>(data.cards||[]).filter((card,i)=>card.owner===player&&(data.destinations?.[i]||data.to)==='exile').length;
  const spellTypes=(g,d)=>g.castDefinition(d.card,d.so?.castOpts||{});
  const spellCost=(g,d)=>{const opts=d.so?.castOpts||{},definition=spellTypes(g,d);return opts.faceDownCast?'':opts.adventure?definition.adventure?.cost||'':opts.splitHalf||opts.splitFuse?g.oracleSplitPrintedCost(d.card,opts):definition.cost||'';};
  const groups=(g,s,d,test)=>{
    if(test==='opponent-planeswalker-groups')return d.player===s.ctrl?0:new Set((d.attackers||[]).map(card=>card.attacking).filter(c=>c instanceof M.CardInst&&c.is('Planeswalker')&&c.ctrl===s.ctrl)).size;
    if(test==='two-creature-player-groups'){
      if(d.player!==s.ctrl)return 0;const counts=new Map();for(const c of d.attackers||[])if(c.ctrl===s.ctrl&&c.is('Creature')&&c.attacking instanceof M.Player)counts.set(c.attacking,(counts.get(c.attacking)||0)+1);return [...counts.values()].filter(n=>n>=2).length;
    }
  };
  function matches(g,s,d,test){
    const group=groups(g,s,d,test);if(group!==undefined)return group>0;
    if(test==='doctor-companion')return d.player===s.ctrl&&(g.castSubtypesV16(d.card,d.so.castOpts).includes('Doctor')||d.isCreature&&spellTypes(g,d).oracleCommanderPairing?.variant==='doctorsCompanion');
    if(test==='phyrexian-spell')return d.player===s.ctrl&&/\{(?:[WUBRG](?:\/[WUBRG])?\/P|H)\}/.test(spellCost(g,d));
    if(test==='later-opponent-instant')return d.player!==s.ctrl&&d.types?.includes('Instant')&&(d.player.turnState.spellsCastList||[]).filter(row=>row.types.includes('Instant')).length>1;
    if(test==='grave-name-creature-pw')return d.player!==s.ctrl&&(d.isCreature||d.types?.includes('Planeswalker'))&&d.player.graveyard.some(card=>M.OracleV8NameGroups.names(card).some(name=>M.OracleV8NameGroups.names(d.card).includes(name)));
    if(test==='one-own-creature-target'){const targets=[...new Set((d.so.targets||[]).flat().filter(Boolean))];return d.player===s.ctrl&&d.isInstantSorcery&&targets.length===1&&targets[0] instanceof M.CardInst&&targets[0].zone==='battlefield'&&targets[0].is('Creature')&&targets[0].ctrl===s.ctrl;}
    if(test==='no-shared-creature-type'){
      if(d.player!==s.ctrl||!d.isCreature)return false;
      const types=g.castChangelingV16(d.card,d.so.castOpts)?[...M.CREATURE_SUBTYPES]:g.castSubtypesV16(d.card,d.so.castOpts).filter(type=>M.CREATURE_SUBTYPES.has(type));
      return ![...g.creatures(s.ctrl),...s.ctrl.graveyard.filter(card=>card.is('Creature'))].some(card=>types.some(type=>card.hasSub(type)));
    }
    if(test==='spirit-or-disturb')return d.card.hasSub('Spirit')||!!(d.card.def.bomDisturb||d.card.def.disturb);
    if(test==='first-discard-batch')return d.player.turnState.discardedN===1;
    if(test==='exiled-grave-batch')return exileCount(d,s.ctrl)>0;
    if(test==='creature-player-ability')return (d.stackObject?.targets||[]).flat().some(card=>card instanceof M.Player||card instanceof M.CardInst&&card.zone==='battlefield'&&card.is('Creature'));
    if(test==='own-artifact-graveyard')return d.card.owner===s.ctrl&&d.card.is('Artifact');
    if(test==='own-other-artifact-dies')return d.card.owner===s.ctrl&&d.card.iid!==s.iid&&!!d.snap?.types.includes('Artifact');
    if(test==='died-or-exiled')return d.to==='graveyard'||d.to==='exile';
    if(test==='monarch')return g.monarch===s.ctrl;
    if(test==='renowned-damage-source')return !!d.card?.meta.renowned;
    if(test==='exact-toughness-damage'){const hit=d.hits?.[0];return !!hit&&hit.n===hit.targetSnap?.toughness;}
    throw Error('Unknown v37 event test '+test);
  }
  M.OracleV20.handlers.unshift({
    compile(op,script,entry,h){
      if(op.kind!=='generic-trigger'||!op.eventTestV37)return false;
      const t=h.compileGenericTrigger(op),base=t.filter;t.filter=(g,s,d)=>base(g,s,d)&&matches(g,s,d,op.eventTestV37);
      if(['opponent-planeswalker-groups','two-creature-player-groups'].includes(op.eventTestV37))t.times=(g,s,d)=>groups(g,s,d,op.eventTestV37);
      h.triggers.push(t);return true;
    },
    amount(value,ctx){
      if(value.kind==='discard-batch-count-v37')return ctx.data?.oracleBatch?.cards?.length||0;
      if(value.kind==='exiled-grave-count-v37')return exileCount(ctx.data||{},ctx.you);
    },
    target(g,c,you,s,predicate){if(predicate.kind==='blocking-source-v37')return !!s.blockedBy?.some(card=>card.iid===c.iid&&card.zoneVersion===c.zoneVersion);}
  });
})(globalThis.MTG ||= {});
