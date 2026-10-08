(function(){
  'use strict';
  const M=globalThis.MTG;
  function matches(g,s,d,test){
    if(test==='opponent-player')return d.player!==s.ctrl;
    if(test==='source-minus-counter')return (s.counters['-1/-1']||0)>0;
    if(test==='entered-from-exile')return d.card?.meta._enteredFromZone==='exile';
    if(test==='played-from-exile')return d.from==='exile';
    if(test==='power-up')return !!(d.ability?.powerUp||d.ability?.powerUpV20);
    if(test==='graveyard-activation')return d.stackObject?.ctx.sourceZone==='graveyard';
    if(test==='foreign-owner')return d.card?.owner!==s.ctrl;
    if(test==='you-targeted-spell')return d.card===s.ctrl&&d.isSpell;
    if(test==='you-targeted-opponent')return d.card===s.ctrl&&d.byPlayer!==s.ctrl;
    if(test==='creature-targeted-opponent'){
      const spell=d.card?.kind==='spell'?d.card:g.stack.find(row=>row.kind==='spell'&&row.card===d.card);
      return d.byPlayer!==s.ctrl&&(d.card?.zone==='battlefield'&&d.card.ctrl===s.ctrl&&d.card.is('Creature')||spell?.ctrl===s.ctrl&&g.isCreatureSpell(spell));
    }
    if(test==='you-or-permanent-targeted-opponent')return d.byPlayer!==s.ctrl&&(d.card===s.ctrl||d.card?.zone==='battlefield'&&d.card.ctrl===s.ctrl);
    if(test==='opponent-first-noncreature')return d.player!==s.ctrl&&!d.isCreature&&(d.player.turnState.spellsCastList||[]).filter(row=>!row.isCreature).length===1;
    throw Error('Unknown v35 event: '+test);
  }
  M.OracleV20.handlers.unshift({
    compile(op,script,entry,h){
      if(op.kind!=='generic-trigger'||!op.eventTestV35)return false;
      const t=h.compileGenericTrigger(op),base=t.filter;t.filter=(g,s,d)=>base(g,s,d)&&matches(g,s,d,op.eventTestV35);h.triggers.push(t);return true;
    },
    target(g,c,you,s,predicate){if(predicate.kind==='suspected-v35')return !!c.meta.suspected;},
  });
})();
