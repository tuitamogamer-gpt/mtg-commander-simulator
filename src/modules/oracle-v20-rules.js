(()=>{
 const M=MTG,V=M.OracleV20,H=V.helpers,G=M.Game.prototype;
 V.handlers.push({compile(op,script){if(op.kind!=='player-protection-v20')return false;(script.oraclePlayerProtectionV20||=[]).push(op);return true;},async effect(ctx,op){if(op.action!=='player-protection-v20')return false;ctx.g.untilEffects.push({kind:'oraclePlayerProtectionV20',who:ctx.you,from:op.from,expires:op.duration,whoTurn:ctx.you});return true;}});
 const protectedFrom=G.isProtectedFrom;
 G.isProtectedFrom=function(target,source,options){
  if(source&&target instanceof M.Player){
   // An exiled card can be cast by someone other than its owner. Targeting
   // uses the announced spell/ability controller; damage uses its source.
   const matches=row=>row?.kind==='spell'&&row.card?.iid===source.iid&&row.card.zoneVersion===source.zoneVersion;
   const spell=source.zone==='stack'&&(this.stack.find(matches)||(matches(this.c1516Resolving)?this.c1516Resolving:null));
   const controller=options?.targetingController||spell?.ctrl||source.ctrl||source.owner;
   const blocks=rule=>rule.from==='everything'||rule.from==='opponents'&&controller!==target;
   if(this.untilEffects.some(rule=>rule.kind==='oraclePlayerProtectionV20'&&rule.who===target&&blocks(rule))||this.bf().some(card=>card.ctrl===target&&!card.cur?.abilitiesDisabled&&card.def.oraclePlayerProtectionV20?.some(blocks)))return true;
  }
  return protectedFrom.call(this,target,source,options);
 };
 const lifeRules=(game,player,kind)=>[...[...game.bf(),...game.players.flatMap(owner=>owner.emblems)].flatMap(source=>source.cur?.abilitiesDisabled?[]:(source.def?.oracleLifeRulesV20||[]).filter(rule=>rule.rule===kind&&(rule.who==='you'?source.ctrl===player:source.ctrl!==player)&&(!rule.yourTurn||game.turnPlayer===source.ctrl)&&(!rule.condition||H.genericCondition(game,source,rule.condition,source.ctrl))).map(rule=>({source,rule}))),...game.untilEffects.filter(effect=>effect.kind==='oracleLifeRuleV20'&&effect.rule===kind&&effect.player===player)];
 V.handlers.push({compile(op,script){if(op.kind!=='life-rule-v20')return false;(script.oracleLifeRulesV20||=[]).push(op);return true;},async effect(ctx,op){
  if(op.action==='life-rule-v20'){for(const player of H.genericEffectSubjects(ctx,op.who))if(player instanceof M.Player)ctx.g.untilEffects.push({kind:'oracleLifeRuleV20',expires:'eot',player,rule:op.rule,source:ctx.src});return true;}
  if(op.action==='lose-game-v20'){for(const player of H.genericEffectSubjects(ctx,op.who))if(player instanceof M.Player)await ctx.g.playerLoses(player,'Oracle instruction');return true;}return false;
 }});
 const gainLifeAllowed=G.canGainLife,loseLife=G.loseLife;
 G.canGainLife=function(player){return !lifeRules(this,player,'locked').length&&gainLifeAllowed.call(this,player);};
 G.loseLife=async function(player,n,why){
  if(lifeRules(this,player,'locked').length)return 0;
  const used=new Map();while(n>0){
   const types=['double-loss',...(why==='damage'&&n>Math.max(0,player.life-1)?['damage-floor']:[])],candidates=types.flatMap(type=>lifeRules(this,player,type).map(row=>({...row,type}))).filter(row=>!used.get(row.source)?.has(row.rule)).map(row=>({...row,key:row.rule,label:row.source.name,src:row.source}));
   if(!candidates.length)break;const selected=await this.chooseReplacement(player,candidates,'life loss',n);if(!used.has(selected.source))used.set(selected.source,new Set());used.get(selected.source).add(selected.rule);n=selected.type==='double-loss'?n*2:Math.min(n,Math.max(0,player.life-1));
  }
  return loseLife.call(this,player,n,why);
 };
 const match=(g,source,player,rule,card)=>rule.self?card.iid===source.iid&&card.zoneVersion===source.zoneVersion:rule.attached?card.iid===source.attachedTo:rule.target!==undefined?card.iid===rule.objectIid&&card.zoneVersion===rule.objectVersion:card.zone===rule.filter.zone&&H.genericTargetSpec(rule.filter,[],0).filter(g,card,player,source);
 const denies=(g,source,player,rule,card,origin,caster,type)=>match(g,source,player,rule,card)&&(!rule.opponentsOnly||caster!==player)&&(rule.actionType==='any'||rule.actionType===type)&&(!rule.colors||rule.colors.some(color=>origin?.colors.includes(color)));
 V.handlers.push({compile(op,script){if(op.kind!=='target-restriction-v20')return false;(script.oracleTargetRestrictionsV20||=[]).push(op);return true;},async effect(ctx,op){if(op.action!=='target-restriction-v20')return false;const cards=op.target!==undefined?H.genericEffectSubjects(ctx,op.target):[null];for(const card of cards)ctx.g.untilEffects.push({kind:'oracleTargetRestrictionV20',expires:'eot',source:ctx.src,seat:ctx.you.idx,rule:{...op,...(card?{objectIid:card.iid,objectVersion:card.zoneVersion}:{})}});return true;}});
 const legalTargets=G.legalTargets;
 G.legalTargets=function(spec,source,player,options={}){
  const type=spec?.oracleTargetActionV20||options.oracleTargetActionV20;
  const origin=type==='spell'&&source?.zone!=='stack'&&spec?.oracleTargetColorsV20?{colors:spec.oracleTargetColorsV20}:source;
  return legalTargets.call(this,spec,source,player,options).filter(card=>{
   for(const permanent of this.bf())if(!permanent.cur?.abilitiesDisabled&&permanent.def.oracleTargetRestrictionsV20?.some(rule=>denies(this,permanent,permanent.ctrl,rule,card,origin,player,type)))return false;
   return !this.untilEffects.some(effect=>effect.kind==='oracleTargetRestrictionV20'&&denies(this,effect.source,this.players[effect.seat],effect.rule,card,origin,player,type));
  });
 };
 M.OracleV20Rules={lifeLocked:(game,player)=>lifeRules(game,player,'locked').length>0,survivesZero:(game,player)=>lifeRules(game,player,'survive-zero').length>0,targetMatches(game,card,descriptor,player,source){
  if(descriptor.commanderV20&&!card.commander)return false;
  if(descriptor.suspendedV20&&(card.zone!=='exile'||!card.def?.suspend||!(card.counters.time>0)))return false;
  if(descriptor.attackingAloneV20&&(!card.attacking||game.creatures(card.ctrl).filter(other=>other.attacking).length!==1))return false;
  if(descriptor.mechanicV20){const d=card.def,key={'level up':'oracleLevelUpCost',awaken:'oracleAwaken'}[descriptor.mechanicV20],has=descriptor.mechanicV20==='modular'?d?.oracleImplementation?.some(op=>op.kind==='mechanic-modular')||d?.triggers?.some(trigger=>trigger.desc==='Modular'):d?.[key]!==undefined;if(card.zone==='battlefield'&&card.cur?.abilitiesDisabled||!has)return false;}
  if(descriptor.statValuesV20&&!descriptor.statValuesV20.values.includes(Number(card[descriptor.statValuesV20.stat])))return false;
  if(descriptor.statExtremumV20){const rule=descriptor.statExtremumV20,filter=H.genericTargetSpec(rule.filter,[],0).filter,values=game.bf().filter(other=>filter(game,other,player,source)).map(other=>Number(other[rule.stat])),boundary=rule.direction==='lowest'?Math.min(...values):Math.max(...values);if(Number(card[rule.stat])!==boundary)return false;}
  return true;
 }};
})();
