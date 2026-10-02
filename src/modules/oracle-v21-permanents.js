'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const V=MTG.OracleV20;
 const oldMaximum=MTG.Game.prototype.maximumHandSize;
 MTG.Game.prototype.maximumHandSize=function(player){
  const value=oldMaximum.call(this,player);if(value===Infinity)return value;
  const source=this.bf().filter(card=>card.ctrl===player&&!card.cur.abilitiesDisabled&&card.def.oracleHandSizeSetV21).sort((a,b)=>b.timestamp-a.timestamp)[0];
  if(!source)return value;
  const rule=source.def.oracleHandSizeSetV21,n=rule.count?V.helpers.genericCount(this,source,player,rule.count):rule.n;
  let adjustment=0;
  for(const card of this.bf())if(!card.cur?.abilitiesDisabled)for(const modifier of card.def.oracleHandSizeRules||[]){
   if(modifier.activeV20&&!modifier.activeV20(this,card))continue;
   if(modifier.who==='you'&&card.ctrl!==player||modifier.who==='opponents'&&card.ctrl===player)continue;
   adjustment+=modifier.n||0;
  }
  return Math.max(0,(Number(n)||0)+adjustment);
 };
 V.handlers.push({
  condition(game,source,node,player,evidence){
   if(node.kind==='permanent-attached-condition-v21'){
    const live=source.zone==='battlefield'&&(!evidence||source.zoneVersion===evidence.zoneVersion),view=live?source:source.battlefieldLKI?.get(evidence?.zoneVersion),host=view&&game.byIid(view.attachedTo);
    return !!host&&host.zone==='battlefield'&&(live||host.zoneVersion===view.attachedHostVersion)&&V.helpers.genericCondition(game,host,node.condition,player);
   }
   if(node.kind!=='permanent-event-condition-v21')return undefined;
   if(!evidence)return false;
   if(node.test==='spell-mana-range'){const n=evidence.eventSpellMvV10;return Number.isFinite(n)&&(node.comparison==='greater'?n>=node.threshold:n<=node.threshold);}
   if(node.test!=='stat-vs-source')throw Error('Unknown event condition '+node.test);
   const card=evidence.eventCard,event=card?.zone==='battlefield'&&card.zoneVersion===evidence.eventCardZoneVersion?card:evidence.eventSnap||card?.battlefieldLKI?.get(evidence.eventCardZoneVersion);
   const self=source.zone==='battlefield'&&source.zoneVersion===evidence.zoneVersion?source:evidence.departureSnapshotV10||source.battlefieldLKI?.get(evidence.zoneVersion);
   if(!event||!self)return false;
   return node.comparison==='greater'?Number(event[node.stat])>Number(self[node.sourceStat]):Number(event[node.stat])<Number(self[node.sourceStat]);
  },
  async effect(ctx,effect,h){
   if(effect.action!=='permanent-keyword-choice-v21')return false;
   const cards=effect.programs.some(program=>program.effects.some(row=>row.action==='pump-group'||row.action==='battlefield-group'))?ctx.g.creatures(ctx.you):h.genericEffectSubjects(ctx,effect.programs[0].effects[0].target);
   const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose a keyword',options:effect.choices.map(key=>({key,label:key})),aiHint:{kind:'oracleKeyword',cards}});
   const index=Math.max(0,effect.choices.indexOf(answer));
   await h.runGenericEffects(ctx,effect.programs[index].effects);return true;
  },
  compile(operation,script,entry,h){
   if(operation.kind==='permanent-hand-size-set-v21'){script.oracleHandSizeSetV21=operation;return true;}
   if(operation.kind==='mechanic-additional-land'&&operation.permanentLandConditionV21){const prior=script.additionalLandPlays;script.additionalLandPlays=(game,source,player)=>(typeof prior==='function'?prior(game,source,player):Number(prior)||0)+(h.genericCondition(game,source,operation.condition,player)?operation.n:0);return true;}
   if(operation.kind!=='generic-trigger'||!operation.permanentOptionalModalV21)return false;
   for(const event of [].concat(operation.event)){
    const trigger=h.compileGenericTrigger({...operation,event}),run=trigger.run,prepare=trigger.prepareTargets,index=trigger.modes.list.length;
    trigger.modes.list.push({label:'Choose no mode',targets:[]});
    trigger.run=async ctx=>{if(ctx.mode!==index)return run(ctx);};
    trigger.prepareTargets=async ctx=>ctx.mode===index?true:prepare?.(ctx);
    h.triggers.push(trigger);
   }
   return true;
  }
 });
})();
