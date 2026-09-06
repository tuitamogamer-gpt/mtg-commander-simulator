// Shared rules required by the Commander 2021 precons.
'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
  const M=MTG,G=M.Game.prototype;
  const live=c=>c.zone==='battlefield'&&!c.phasedOut&&!c.cur?.abilitiesDisabled;
  G.withC21ExileBatch=async function(run){
    if(this._c21ExileBatch)return run();
    this._c21ExileBatch=[];let entries;
    try{return await run();}finally{entries=this._c21ExileBatch;delete this._c21ExileBatch;if(entries.length)await this.emit('c21CardsExiled',{entries});}
  };
  const graveBatch=G.withGraveyardEntryBatch;
  G.withGraveyardEntryBatch=function(run){return this.withC21ExileBatch(()=>graveBatch.call(this,run));};
  const moveGrave=G.moveGraveyardBatch;
  G.moveGraveyardBatch=function(...args){return this.withC21ExileBatch(()=>moveGrave.apply(this,args));};
  const oldFaceUp=G.faceUpCosts;
  G.faceUpCosts=function(card){const costs=oldFaceUp.call(this,card);return card.meta?.faceDownKind==='c21Forest'?costs.filter(c=>c.kind!=='mana cost'):costs;};
  const protectedFrom=G.isProtectedFrom;
  G.isProtectedFrom=function(target,source){
    if(source&&target instanceof M.Player&&this.untilEffects.some(e=>e.kind==='c21PlayerProtection'&&e.who===target&&e.from===source.ctrl))return true;
    return protectedFrom.call(this,target,source);
  };
  const canAttack=G.canAttackTarget;
  G.canAttackTarget=function(card,target){
    const defender=target instanceof M.Player?target:target?.is('Planeswalker')?target.ctrl:null;
    if(defender&&card.hasSub('Inkling')&&this.bf().some(c=>live(c)&&c.ctrl===defender&&c.def.c21Calligrapher))return false;
    return canAttack.call(this,card,target);
  };
  G.c21AttackTax=function(attacker,target){
    const defender=target instanceof M.Player?target:target?.is('Planeswalker')?target.ctrl:null;
    if(!defender)return 0;
    return this.bf().filter(c=>live(c)&&c.ctrl===defender).reduce((n,c)=>n+(target instanceof M.Player?(c.def.attackTax||0):0)+
      (c.def.c21Nils?M.C21.countCounters(attacker):0),0);
  };
  const legalTargets=G.legalTargets;
  G.legalTargets=function(spec,source,player,opts){
    if(spec.c21BattlefieldOrGraveyard)return [...legalTargets.call(this,{...spec,zone:'battlefield'},source,player,opts),...legalTargets.call(this,{...spec,zone:'graveyard',anyGraveyard:true},source,player,opts)];
    return legalTargets.call(this,spec,source,player,opts);
  };
  M.C21Rules={
    async donateMana(g,card,player,kind){const ctx={g,src:card,you:player},p=await M.C21.choosePlayer(ctx,g.alivePlayers(),'choose a player to receive mana');if(!p)return;
      const colors=['W','U','B','R','G'],color=kind==='colorless'?'C':await M.C21.option(ctx,colors.map(key=>({key,label:key})),'choose the mana color',p,'manaColor');
      if(![...colors,'C'].includes(color))throw Error('Invalid donated mana');p.pool[color]++;g.note('mana',{p});
    },
    landManaTypes(g,p){const colors=new Set();
      for(const land of g.lands(p))for(const m of [...(!land.cur?.abilitiesDisabled?[land.def.mana].flat().filter(Boolean):[]),...(land.cur?.extraMana||[])]){
        const outputs=typeof m.produce==='function'?m.produce(g,land,p):m.produce||[];
        for(const output of outputs)for(const color of output.ANY?['W','U','B','R','G']:Object.keys(output))if('WUBRGC'.includes(color)&&output[color]>0||output.ANY&&'WUBRG'.includes(color))colors.add(color);
      }return [...colors];
    },
    entryCounters(g,card){if(!card.is('Creature'))return 0;const sources=g.bf().filter(c=>c!==card&&live(c)&&c.ctrl===card.ctrl&&c.def.c21Biomancer);
      if(sources.length)card.meta.addedSubtypes=[...new Set([...(card.meta.addedSubtypes||[]),'Mutant'])];
      return sources.reduce((n,c)=>n+Math.max(0,c.power),0);
    },
    abilityHaste:(g,c)=>g.bf().some(source=>live(source)&&source.ctrl===c.ctrl&&source.def.c21AbilityHaste),
    async exile(g,card,from){if(card.zone!=='exile'||!['library','graveyard'].includes(from)||card.isToken)return;
      const entry={card,from,version:card.zoneVersion};if(g._c21ExileBatch)g._c21ExileBatch.push(entry);else await g.emit('c21CardsExiled',{entries:[entry]});},
    event(g,name,data){if(name==='etb'&&data.card?.is('Creature')&&!data.card.isToken){const p=data.card.ctrl;p.turnState.c21CreatureEntries=(p.turnState.c21CreatureEntries||0)+1;}},
    spent(g,p,payment,unit){
      if(!unit.c21Goggles||!payment||payment.isAbility||!payment.card)return;
      const card=payment.card,opts=payment.castOpts||{};
      if(g.isInstantSorceryCast(card,opts)&&!(g.castDefinition(card,opts).devoid)&&(g.castDefinition(card,opts).colorsOverride||M.colorsOfCost(g.castDefinition(card,opts).cost||'')).includes('R'))(payment.c21Goggles||=[]).push(unit.source);
    },
    copyTriggers(g,p,so,payment){for(const source of payment.c21Goggles||[])g.queueTrigger({src:source,ctrl:p,name:'Pyromancer’s Goggles: copy the red spell',data:{so},
      run:async ctx=>{await ctx.g.copySpell(ctx.data.so,ctx.you,{mayNewTargets:true});}});},
  };
})();
