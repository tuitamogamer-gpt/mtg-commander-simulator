'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,V=M.OracleV20,G=M.Game.prototype,H=V.helpers;
 const live=s=>s?.zone==='battlefield'&&!s.phasedOut&&!s.cur?.abilitiesDisabled;
 const grantorCurrent=(ctx,row)=>!!row&&row.card.zone==='battlefield'&&!row.card.phasedOut&&row.card.zoneVersion===row.version&&row.card.attachedTo===ctx.src.iid&&ctx.src.zone==='battlefield'&&ctx.src.zoneVersion===ctx.sourceZoneVersion;
 const C=M.OracleV20Costs;
 const feasible=C.activationFeasible;
 C.activationFeasible=function(g,p,s,cost,mana,a){if(cost.additionalCostV20?.kind!=='grantor-v22')return feasible.call(this,g,p,s,cost,mana,a);return grantorCurrent({g,src:s,sourceZoneVersion:s.zoneVersion},a.oracleGrantorV22)&&(!mana||g.canPayMana(p,mana,{card:s,isAbility:true,ability:a},{excludeCards:cost.tap?[s]:[],protectedSacrifices:[a.oracleGrantorV22.card]}));};
 const prepare=C.prepareActivation,validate=C.validateActivation,commit=C.commitActivation;
 C.prepareActivation=async function(ctx,cost){if(cost.additionalCostV20?.kind!=='grantor-v22')return prepare.call(this,ctx,cost);const row=ctx.ability?.oracleGrantorV22;if(!grantorCurrent(ctx,row))return false;ctx.oracleGrantorV22={...row};ctx.oracleActivationPlanV20={kind:'grantor-v22',sourceVersion:ctx.src.zoneVersion,sourceZone:ctx.src.zone,rows:[{card:row.card,zone:'battlefield',version:row.version}]};return true;};
 C.validateActivation=function(ctx,cost){return cost.additionalCostV20?.kind==='grantor-v22'?grantorCurrent(ctx,ctx.oracleGrantorV22):validate.call(this,ctx,cost);};
 C.commitActivation=async function(ctx,cost){if(cost.additionalCostV20?.kind!=='grantor-v22')return commit.call(this,ctx,cost);if(!grantorCurrent(ctx,ctx.oracleGrantorV22))return false;M.C1516.detach(ctx.g,ctx.oracleGrantorV22.card);return true;};
 const binding=s=>s.zoneVersion+':'+(s.copyEpoch||0)+':'+s.def.name;
 const aliases=new Map((M.OracleV22CardNames?.aliases||[]).flatMap(group=>group.map(name=>[name,group])));
 const expand=names=>[...new Set(names.flatMap(name=>aliases.get(name)||[name]))];
 const names=object=>{
  const card=object?.kind==='spell'?object.card:object,def=object?.oracleDefinition||card?.def;
  if(object?.castOpts?.faceDownCast)return [];
  if(def?.bdfRoom){
   if(object?.kind==='spell')return expand(def.bdfRoom.filter(door=>door.key===object.castOpts?.bdfDoor).map(door=>door.name));
   return expand(M.OracleV8NameGroups.names(object).flatMap(name=>name==='Room'?[]:name.split(' // ')));
  }
  return expand(M.OracleV8NameGroups.names(object));
 };
 function selected(s,evidence){
  const ctx=evidence?.oracleContext;
  if(ctx?.oracleChosenNameV22)return ctx.oracleChosenNameV22.names;
  const row=s?.meta?.oracleChosenNameV22;
  return row?.binding===binding(s)?row.names:[];
 }
 const matches=(s,object,evidence)=>names(object).some(name=>selected(s,evidence).includes(name));
 function spellNames(g,c,a={}){
  a ||= {};if(a.faceDownCast)return [];
  const d=g.castDefinition(c,a);
  if(a.adventure)return expand([d.adventure?.name].filter(Boolean));
  if(d.oracleSplit){const faces=a.splitHalf?d.oracleSplit.faces.filter(face=>face.key===a.splitHalf):d.oracleSplit.faces;return expand(faces.map(face=>face.name));}
  return expand([d.name||c.name]);
 }
 const spellMatches=(g,s,c,a)=>spellNames(g,c,a).some(name=>selected(s).includes(name));
 const scope=(s,p,who)=>who==='all'||who==='you'&&p===s.ctrl||who==='opponents'&&p!==s.ctrl||who==='enchanted-player'&&p===s.meta.cursedPlayer;
 const rules=(g,mode)=>g.bf().filter(live).flatMap(s=>(s.def.oracleNamedRulesV22||[]).filter(rule=>rule.mode===mode).map(rule=>({s,rule})));
 const qualifies=(flags,quality)=>quality==='any'||quality==='nonland'&&!(flags&1)||quality==='land'&&!!(flags&1)||quality==='nonbasic-land'&&!!(flags&1)&&!(flags&4)||quality==='not-basic-land'&&!((flags&1)&&(flags&4))||quality==='noncreature-nonland'&&!(flags&3);
 function choices(quality){if(!M.OracleV22CardNames)throw Error('Missing certified Oracle name index');return M.OracleV22CardNames.entries.filter(([,flags])=>qualifies(flags,quality)).map(([name])=>name);}
 async function chooseName(g,s,p,quality='any',restricted,known=[]){
  const options=restricted||choices(quality),preferred=known.flatMap(card=>names(card)).find(name=>options.includes(name));
  if(!options.length)return null;
  const answer=await p.controller.decide(g,{type:'chooseOption',prompt:s.name+': choose a card name',searchableChoices:true,options:options.map(key=>({key,label:key})),aiHint:{kind:'cardName',nameV20:preferred||'Forest'}});
  if(!options.includes(answer))throw Error('Invalid declared permanent card name');return answer;
 }
 async function nameEntry(g,s,op){
  const p=s.ctrl,opponents=g.apnapFrom(g.turnPlayer||p).filter(q=>q!==p),known=[];let restricted;
  if(op.lookHand&&opponents.length){const key=await p.controller.decide(g,{type:'chooseOption',prompt:s.name+': choose an opponent whose hand to look at',options:opponents.map(q=>({key:String(q.idx),label:q.name})),aiHint:{kind:'choosePlayer',source:s}}),other=opponents.find(q=>String(q.idx)===String(key));if(!other)throw Error('Invalid name choice hand opponent');known.push(...other.hand);await g.revealToHuman({cards:other.hand.slice(),ctrl:p,kind:'look',includeLands:true});}
  if(op.revealedOpponents){for(const q of opponents){known.push(...q.hand);await g.revealToHuman({cards:q.hand.slice(),ctrl:q,kind:'reveal',includeLands:true});}restricted=[...new Set(known.filter(c=>!c.is('Land')).flatMap(c=>names(c)))];}
  let choosers=[p];
  if(op.eachYouAndOpponent&&opponents.length){const key=await p.controller.decide(g,{type:'chooseOption',prompt:s.name+': choose an opponent to choose a name',options:opponents.map(q=>({key:String(q.idx),label:q.name})),aiHint:{kind:'choosePlayer',source:s}}),other=opponents.find(q=>String(q.idx)===String(key));if(!other)throw Error('Invalid second name chooser');choosers=g.apnapFrom(g.turnPlayer||p).filter(q=>q===p||q===other);}
  const chosen=[];for(const q of choosers){const name=await chooseName(g,s,q,op.quality,restricted,known);if(name)chosen.push(name);}
  s.meta.oracleChosenNameV22={binding:binding(s),names:expand(chosen)};g.lg(s.name+': '+(chosen.length?'chosen '+chosen.join(', '):'no card name could be chosen')+'.');
 }
 M.OracleV22Permanents={names,selected,matches,choices,chooseName,spellNames};
 const timing=G.canCastTiming;
 G.canCastTiming=function(p,c,a){return !rules(this,'spell-ban').concat(rules(this,'spell-land-ban')).some(({s,rule})=>scope(s,p,rule.who)&&spellMatches(this,s,c,a))&&timing.call(this,p,c,a);};
 const playLand=G.playLand;
 G.playLand=async function(p,c,opts={}){const face=opts.oracleFace?M.OracleV8Faces.faceDefinition(c.oracleFaces,opts.oracleFace):c.def;if(rules(this,'spell-land-ban').some(({s,rule})=>scope(s,p,rule.who)&&expand([face.name||c.name]).some(name=>selected(s).includes(name))))return false;return playLand.call(this,p,c,opts);};
 const special=e=>['turnFaceUp','foretell','plot','suspend','channelMana','oracleUnlockRoomV20','bdfUnlock'].some(key=>e[key]);
 function activationBlocked(g,c,mana){return rules(g,'ability-ban').some(({s,rule})=>(!rule.exceptMana||!mana)&&matches(s,c));}
 const list=G.activatableList;
 G.activatableList=function(p,instantOnly){return list.call(this,p,instantOnly).filter(e=>special(e)||!activationBlocked(this,e.card,!!e.manaAbility));};
 const activate=G.activateAbility;
 G.activateAbility=async function(p,e,targets){if(!special(e)&&activationBlocked(this,e.card,!!e.manaAbility))return false;return activate.call(this,p,e,targets);};
 const manaSources=G.manaSources;
 G.manaSources=function(p,action,opts){return manaSources.call(this,p,action,opts).filter(s=>s.virtual||s.m?.viaConvoke||!activationBlocked(this,s.card,true));};
 const activateMana=G.activateManaSource;
 G.activateManaSource=async function(p,s,...rest){if(!s.virtual&&!s.m?.viaConvoke&&activationBlocked(this,s.card,true))return false;return activateMana.call(this,p,s,...rest);};
 const protection=G.isProtectedFrom;
 G.isProtectedFrom=function(target,source,options){return !!source&&target instanceof M.Player&&rules(this,'player-protection').some(({s})=>s.ctrl===target&&matches(s,source))||protection.call(this,target,source,options);};
 V.handlers.push({
  target(g,c,p,s,node,evidence){if(node.kind==='permanent-chosen-name-v22')return matches(s,c,evidence);return undefined;},
  async effect(ctx,effect){
   if(effect.action==='permanent-grantor-return-v22'){const row=ctx.oracleGrantorV22;if(row?.card.zone==='battlefield'&&row.card.zoneVersion===row.version)await ctx.g.move(row.card,'hand');return true;}
   if(effect.action==='permanent-shared-host-v22'){
    const sourceVersion=ctx.sourceZoneVersion??ctx.oracleSourceCapture?.zoneVersion,source=ctx.src.zone==='battlefield'&&ctx.src.zoneVersion===sourceVersion?ctx.src:ctx.src.battlefieldLKI?.get(sourceVersion),host=ctx.g.byIid(source?.attachedTo);
    if(!host)return true;
    const version=source===ctx.src?host.zoneVersion:source.attachedHostVersion,current=host.zone==='battlefield'&&host.zoneVersion===version,view=current?host:host.battlefieldLKI?.get(version);
    if(!view)return true;
    const types=[...M.CREATURE_SUBTYPES].filter(type=>current?host.hasSub(type):view.changeling||view.subtypes.includes(type));
    const group=ctx.g.bf().filter(card=>card.is('Creature')&&(current&&card===host||types.some(type=>card.hasSub(type))));
    await H.runGenericEffects({...ctx,targets:[group]},effect.effects);return true;
   }
   if(effect.action!=='permanent-choose-name-v22')return false;
   const name=await chooseName(ctx.g,ctx.src,ctx.you,effect.quality);if(!name)return true;
   if(effect.temporarySpellTax!==undefined){ctx.g.untilEffects.push({kind:'oracleNamedSpellTaxV22',expires:'eot',names:expand([name]),n:effect.temporarySpellTax});}
   else if(ctx.src.zone==='battlefield'&&ctx.src.zoneVersion===ctx.sourceZoneVersion){ctx.src.meta.oracleChosenNameV22={binding:binding(ctx.src),names:expand([name])};ctx.g.recalc();}
   return true;
  },
  compile(op,script,entry,h){
   if(op.kind==='permanent-grantor-operation-v22'){
    const base=h.compileGenericAbility(op.operation),grant=op.grant,prior=script.attachGrant;
    script.attachGrant=(g,s,host)=>{prior?.(g,s,host);host.cur.power+=grant.power||0;host.cur.toughness+=grant.toughness||0;for(const keyword of grant.keywords||[])host.cur.kw.add(keyword);host.cur.extraAbilities.push({...base,oracleGrantorV22:{card:s,version:s.zoneVersion}});};return true;
   }
   if(op.kind==='permanent-propagated-static-v22'){
    h.statics.push({oracleOperation:op,apply(g,s,bf){
     const equipment=bf.find(card=>card.iid===s.attachedTo&&card.hasSub('Equipment'));
     if(!equipment||equipment.cur.oracleAbilityLossTimestamp>s.timestamp)return;
     const host=bf.find(card=>card.iid===equipment.attachedTo);
     if(!host)return;
     host.cur.power+=op.operation.power||0;host.cur.toughness+=op.operation.toughness||0;
     for(const keyword of op.operation.keywords||[])host.cur.kw.add(keyword);
    }});return true;
   }
   if(op.kind==='permanent-name-entry-v22'){const prior=script.asEnters;script.asEnters=async(g,s)=>{if(prior)await prior(g,s);await nameEntry(g,s,op);};return true;}
   if(op.kind==='permanent-name-rule-v22'){
    (script.oracleNamedRulesV22||=[]).push(op);
    if(op.mode==='spell-tax')(script.costMods||=[]).push((g,s,{player,card,castOpts})=>live(s)&&scope(s,player,op.who)&&spellMatches(g,s,card,castOpts)?op.n:0);
    if(op.mode==='ability-tax'){const prior=script.oracleAbilityCostV18;script.oracleAbilityCostV18=(g,s,ctx)=>(prior?.(g,s,ctx)||0)+(live(s)&&(!op.exceptMana||!ctx.isMana)&&matches(s,ctx.source)?op.n:0);}
    return true;
   }
   if(op.kind==='generic-trigger'&&op.permanentNamedTriggerV22){const tr=h.compileGenericTrigger(op),prior=tr.filter;tr.filter=(g,s,data)=>(!op.permanentNamedTriggerV22.who||scope(s,data.player,op.permanentNamedTriggerV22.who))&&matches(s,data.so||data.card)&&(!prior||prior(g,s,data));h.triggers.push(tr);return true;}
   if(op.kind==='generic-ability'&&op.targets.some(target=>target.v20?.kind==='permanent-chosen-name-v22')){const ability=h.compileGenericAbility(op),prior=ability.prepareTargets;ability.prepareTargets=async ctx=>{ctx.oracleChosenNameV22={names:selected(ctx.src).slice()};return prior?prior(ctx):true;};h.abilities.push(ability);return true;}
   return false;
  }
 });
 const cost=G.spellCost;
 G.spellCost=function(p,c,a={}){const result=cost.call(this,p,c,a);const n=this.untilEffects.filter(row=>row.kind==='oracleNamedSpellTaxV22'&&spellNames(this,c,a).some(name=>row.names.includes(name))).reduce((total,row)=>total+row.n,0),raw=result.generic-(result.xReduction||0)+n;result.generic=Math.max(0,raw);result.xReduction=Math.max(0,-raw);return result;};
})();
