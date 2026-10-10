'use strict';
((M)=>{
 if(M.OracleV28Common)return;
 const choice=source=>source.meta.oracleEntryLandTypeV28?.version===source.zoneVersion?source.meta.oracleEntryLandTypeV28.types:[];
 const creatureChoice=source=>source.meta.oracleEntryCreatureTypeV28?.version===source.zoneVersion?source.meta.oracleEntryCreatureTypeV28.type:null;
 const proposedCasters=new WeakMap();
 // Native cost and mana calculations know the proposed caster before a spell
 // object exists. Scope that view to each synchronous call, including nesting.
 const withProposedCaster=(player,card,calculate)=>{
  if(!card||!player)return calculate();
  const previous=proposedCasters.get(card);proposedCasters.set(card,player);
  try{return calculate();}
  finally{if(previous)proposedCasters.set(card,previous);else proposedCasters.delete(card);}
 };
 const spellCost=M.Game.prototype.spellCost;
 M.Game.prototype.spellCost=function(player,card,...args){
  return withProposedCaster(player,card,()=>spellCost.call(this,player,card,...args));
 };
 for(const method of ['manaSolve','deductPool']){
  const native=M.Game.prototype[method];
  M.Game.prototype[method]=function(player,cost,action,...args){
   const spellCard=action&&!action.isAbility&&!action.isSpecialAction&&!action.foretellAction&&!action.turnFaceUp?action.card:null;
   return withProposedCaster(player,spellCard,()=>native.call(this,player,cost,action,...args));
  };
 };
 // Creature-card and creature-spell effects share a timestamp-ordered type
 // layer. Independent wrappers must not re-add an earlier type after Conspiracy.
 const outsideEffects=(card,{asSpell=false}={})=>{
  if(card.zone==='battlefield'&&!asSpell)return [];
  const game=card.owner.game;
  // Foreign-owned cards retain their owner as CardInst.ctrl on the stack;
  // the native spell object carries the actual controller (for example Etali).
  const spell=card.zone==='stack'?game?.stack.find(row=>row.kind==='spell'&&!row.isCopy&&row.card===card):null;
  const controller=(asSpell||card.zone==='stack')?((asSpell&&proposedCasters.get(card))||spell?.ctrl||card.ctrl):card.owner;
  return (game?.bf()||[]).filter(source=>!source.cur?.abilitiesDisabled)
   .sort((a,b)=>a.timestamp-b.timestamp).flatMap(source=>{
    const effects=[];
    if(source.ctrl===controller){
     if(source.def.oracleAllCreatureTypesV28)effects.push({all:true,retain:true});
     if(source.def.bdfAdaptation&&source.meta.bdfType)effects.push({type:source.meta.bdfType,retain:true});
    }
    const type=creatureChoice(source);
    if(type)for(const op of source.def.oracleChosenCreatureTypesV28||[]){
     const applies=op.scope==='graveyard'
      ? !asSpell&&card.zone==='graveyard'&&card.owner===source.ctrl
      : controller===source.ctrl;
     if(applies)effects.push({type,retain:op.retain});
    }
    return effects;
   });
 };
 const nativeHasSub=M.CardInst.prototype.hasSub;
 function outsideCharacteristics(card,definition=card.def,options={}){
  let subs=definition.subtypes.slice(),all=!!definition.changeling,changeling=all;
  for(const effect of outsideEffects(card,options)){
   if(!effect.retain){subs=subs.filter(type=>!M.CREATURE_SUBTYPES.has(type));all=false;changeling=false;}
   if(effect.all)all=true;
   if(effect.type&&!subs.includes(effect.type))subs.push(effect.type);
  }
  return {subtypes:all?[...new Set(subs.concat(M.RULES_CREATURE_TYPES))]:subs,changeling};
 }
 M.oracleFaceDownSpellSubtypesV28=card=>outsideCharacteristics(card,{subtypes:[],changeling:false},{asSpell:true}).subtypes;
 M.CardInst.prototype.hasSub=function(type){return this.is('Creature')&&outsideEffects(this).length?outsideCharacteristics(this).subtypes.includes(type):nativeHasSub.call(this,type);};
 const snapshot=M.Game.prototype.snapshot;M.Game.prototype.snapshot=function(card,...args){const row=snapshot.call(this,card,...args);if(card.is('Creature')&&outsideEffects(card).length)Object.assign(row,outsideCharacteristics(card));return row;};
 const castDefinition=M.Game.prototype.castDefinition;M.Game.prototype.castDefinition=function(card,...args){const def=castDefinition.call(this,card,...args);return def.types.includes('Creature')&&outsideEffects(card,{asSpell:true}).length?{...def,...outsideCharacteristics(card,def,{asSpell:true})}:def;};
 M.OracleV20.handlers.push({commonV28:true,compile(op,script,entry,h){
  if(op.kind==='entry-creature-type-v28'){
   const prior=script.asEnters;script.asEnters=async(game,source)=>{if(prior)await prior(game,source);const types=M.RULES_CREATURE_TYPES,visible=game.bf().filter(card=>card.ctrl===source.ctrl&&card.is('Creature')).concat(source.ctrl.hand,source.ctrl.graveyard).filter(card=>card.is('Creature')),result=await source.ctrl.controller.decide(game,{type:'chooseOption',prompt:'Choose a creature type',options:types.map(type=>({key:type,label:type,keepValue:visible.filter(card=>card.hasSub(type)).length})),aiHint:{kind:'creatureType',source}});if(!types.includes(result))throw Error('Invalid chosen creature type');source.meta.oracleEntryCreatureTypeV28={version:source.zoneVersion,type:result};};return true;
  }
  if(op.kind==='chosen-creature-types-v28'){
   (script.oracleChosenCreatureTypesV28||=[]).push(op);
   if(op.scope==='all-owned')h.statics.push({phase:1,apply(game,source,bf){const type=creatureChoice(source);if(type)for(const card of bf)if(card.ctrl===source.ctrl&&card.is('Creature'))M.oracleV8ApplyStaticCharacteristics(card,op.retain?{addCreatureTypes:[type]}:{replaceCreatureTypesV10:[type]});}});return true;
  }
  if(op.kind==='entry-land-type-v28'){
   const prior=script.asEnters;script.asEnters=async(game,source)=>{
    if(prior)await prior(game,source);const selected=[];
    for(let i=0;i<op.quantity;i++){
     const types=op.choices.filter(type=>!selected.includes(type));
     const basic=op.choices.every(type=>['Plains','Island','Swamp','Mountain','Forest'].includes(type));
     const result=await source.ctrl.controller.decide(game,{type:'chooseOption',prompt:'Choose '+(i?'another ':'')+(basic?'basic land type':'land type'),options:types.map(type=>({key:type,label:type})),aiHint:{kind:'basicLandType',source,cards:[source],types}});
     if(!types.includes(result))throw Error('Invalid chosen basic land type');selected.push(result);
    }
    source.meta.oracleEntryLandTypeV28={version:source.zoneVersion,types:selected};
    if(op.payLife){let paid=false;if(game.canPayLife(source.ctrl,op.payLife)){const result=await source.ctrl.controller.decide(game,{type:'chooseOption',prompt:source.name+': pay '+op.payLife+' life?',options:[{key:'pay',label:'Pay '+op.payLife+' life'},{key:'tapped',label:'Enter tapped'}],aiHint:{kind:'payLife',src:source,amount:op.payLife}});if(result==='pay'){await game.loseLife(source.ctrl,op.payLife,source.name);paid=true;}}if(!paid)source.tapped=true;}
   };return true;
  }
  if(op.kind==='chosen-land-types-v28'){
   const affects=(game,source,card)=>card.is('Land')&&choice(source).length>0&&(op.scope==='self'?card===source:op.scope==='attached'?card.iid===source.attachedTo:op.scope==='your-lands'?card.ctrl===source.ctrl:card.cur.super.includes('Basic')&&card.hasSub(choice(source)[0]));
   h.statics.push({phase:1,oracleOperation:{...op,types:['Plains']},oracleBasicLandTypes:true,affects,apply(game,source,bf){const types=choice(source);if(!types.length)return;for(const card of bf)if(affects(game,source,card))M.OracleV8LandTypes.change(card,{types:[types[op.scope==='basic-first'?1:0]],retain:op.retain});}});return true;
  }
  if(op.kind==='mana-activation-life-v28'){h.statics.push({phase:2,apply(game,source){source.cur.oracleManaLifeV28=op.life;}});return true;}
  if(op.kind==='chosen-landwalk-v28'){h.statics.push({phase:2,apply(game,source,bf){const type=choice(source)[0],target=bf.find(card=>card.iid===source.attachedTo);if(type&&target){target.cur.kw.add(type.toLowerCase()+'walk');(target.cur.oracleChosenLandwalkTypesV28||=[]).push(type);}}});return true;}
  if(op.kind==='chosen-land-phasing-v28'){h.statics.push({phase:2,apply(game,source,bf){const type=choice(source)[0];if(type)for(const card of bf)if(card.is('Land')&&card.hasSub(type))card.cur.kw.add('phasing');}});return true;}
  if(op.kind==='chosen-land-tap-life-v28'){h.triggers.push({on:'becameTapped',filter:(game,source,data)=>!!choice(source)[0]&&data.card?.is('Land')&&data.card.ctrl!==source.ctrl&&data.card.hasSub(choice(source)[0]),run:async ctx=>ctx.g.gainLife(ctx.you,1,ctx.src)});return true;}
  return false;
 }});
 const manaSources=M.Game.prototype.manaSources;
 M.Game.prototype.manaSources=function(player,spell,options){return manaSources.call(this,player,spell,options).flatMap(row=>{
  const extra=!row.m?.viaConvoke&&row.card?.cur?.oracleManaLifeV28||0;if(!extra)return [row];
  const life=(row.extraCost.life||0)+extra;if(!this.canPayLife(player,life))return [];
  return [{...row,extraCost:{...row.extraCost,life}}];
 });};
 const canBlock=M.Game.prototype.canBlock;
 M.Game.prototype.canBlock=function(blocker,attacker){
  const player=blocker.ctrl;
  if(player&&(attacker.cur?.oracleChosenLandwalkTypesV28||[]).some(type=>M.oracleLandwalkActiveV15(attacker,blocker,type.toLowerCase()+'walk')&&this.lands(player).some(land=>land.hasSub(type))))return false;
  return canBlock.call(this,blocker,attacker);
 };
 M.OracleV28Common={choice};
})(MTG);
