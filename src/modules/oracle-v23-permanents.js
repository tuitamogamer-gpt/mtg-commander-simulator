(function(){
 'use strict';const M=globalThis.MTG,G=M.Game.prototype,H=M.OracleV20.helpers;
 const live=s=>s?.zone==='battlefield'&&!s.phasedOut&&!s.cur?.abilitiesDisabled;
 const bindings=new WeakMap(),cache=new WeakMap();
 const identity=s=>s.zoneVersion+':'+(s.copyEpoch||0)+':'+s.def.name;
 function operations(source){return live(source)?source.def.oracleZoneKeywordsV23||[]:[];}
 function eligible(game,p,card,source,operation){
  if(!live(source)||card.zone!==operation.zone||card.owner!==p||!p[operation.zone].includes(card)||operation.who==='you'&&source.ctrl!==p)return false;
  if(operation.subtype&&!card.hasSub(operation.subtype))return false;
  if(operation.filter&&!H.genericTargetSpec(operation.filter).filter(game,card,source.ctrl,source))return false;
  return true;
 }
 function native(source,operation,index){
  let rows=cache.get(source);if(!rows){rows=new Map();cache.set(source,rows);}
  const key=identity(source)+':'+index;
  if(rows.has(key))return rows.get(key);
  const script={};
  if(operation.keyword==='unearth')M.applyOracleMechanic(script,{kind:'mechanic-unearth',cost:operation.cost,contract:'mechanic-unearth'});
  else if(operation.keyword==='typecycling')M.applyOracleMechanic(script,{kind:'mechanic-typecycling',subtype:operation.subtype,cost:operation.cost,contract:'mechanic-typecycling'});
  else throw Error('Unsupported hidden-zone keyword');
  const definition=operation.keyword==='unearth'?script.gyAbility:script.cycling;
  const record={source,binding:identity(source),operation,index};bindings.set(definition,record);rows.set(key,definition);return definition;
 }
 function grantedAbilityAllowed(game,p,card,ability,entry){
  const row=bindings.get(ability);
  return !!row&&entry?.oracleZoneKeywordV23===row&&row.binding===identity(row.source)&&operations(row.source)[row.index]===row.operation&&eligible(game,p,card,row.source,row.operation);
 }
 const cyclingOptions=G.cyclingOptions;
 G.cyclingOptions=function(p,card){const result=cyclingOptions.call(this,p,card);for(const source of this.bf())operations(source).forEach((operation,index)=>{if(operation.keyword==='typecycling'&&eligible(this,p,card,source,operation)){const definition=native(source,operation,index);result.push({cyclingId:'zone-grant-v23:'+source.iid+':'+identity(source)+':'+index,definition,label:operation.subtype+'cycling '+operation.cost});}});return result;};
 function graveyardEntries(game,p){const result=[];if(game.turnPlayer!==p||game.stack.length||!['main1','main2'].includes(game.phase))return result;
  for(const source of game.bf())operations(source).forEach((operation,index)=>{if(operation.keyword!=='unearth')return;for(const card of p.graveyard){if(!eligible(game,p,card,source,operation))continue;const ability=native(source,operation,index),cost=game.abilityManaCost(p,card,ability.cost,{ability});if(game.canPayMana(p,cost,{card,isAbility:true,ability}))result.push({card,gyAbility:true,gyAbilityOverride:ability,oracleZoneKeywordV23:bindings.get(ability),label:ability.label});}});return result;
 }
 const activateAbility=G.activateAbility;
 G.activateAbility=async function(p,entry,...args){if(entry.oracleZoneKeywordV23&&!grantedAbilityAllowed(this,p,entry.card,entry.gyAbilityOverride,entry))return false;return activateAbility.call(this,p,entry,...args);};
 M.OracleV20.handlers.push({async effect(ctx,effect){
  if(effect.action==='permanent-cursed-damage-v23'){const player=ctx.sourceMeta?.cursedPlayer||(ctx.src.zoneVersion===(ctx.sourceZoneVersion??ctx.src.zoneVersion)?ctx.src.meta.cursedPlayer:null);if(player&&!player.lost)await H.runGenericEffects({...ctx,targets:[player]},[{action:'damage',n:effect.n,target:0}]);return true;}
  if(effect.action!=='permanent-sacrifice-host-v23')return false;const player=H.genericEffectSubjects(ctx,effect.who)[0],cards=H.genericEffectSubjects(ctx,effect.target).filter(card=>card.zone==='battlefield'&&card.ctrl===player);if(player&&cards.length)await ctx.g.sacrificeMany(player,cards);return true;},compile(operation,script,entry,h){
  if(operation.kind==='generic-trigger'&&operation.permanentAttachedPhaseV23){const bind=node=>Array.isArray(node)?node.map(bind):node&&typeof node==='object'?{...Object.fromEntries(Object.entries(node).map(([key,value])=>[key,bind(value)])),...(node.action==='conditional'&&node.condition?.kind==='source-turn-v9'&&node.condition.field==='_attackedTurn'&&node.effects?.length===1&&node.effects[0].action==='destroy'&&node.effects[0].target==='attached-host'?{conditionTarget:'attached-host'}:{})}:node;const trigger=h.compileGenericTrigger({...operation,effects:bind(operation.effects)}),filter=trigger.filter;trigger.filter=(game,source,data)=>{if(!live(source))return false;const host=game.byIid(source.attachedTo),player=operation.permanentAttachedPhaseV23.subject==='player'?source.meta.cursedPlayer:host?.zone==='battlefield'?host.ctrl:null;return data.player===player&&(!filter||filter(game,source,data));};h.triggers.push(trigger);return true;}
  if(operation.kind==='permanent-attached-type-set-v23'){if(JSON.stringify(operation.types)!=='["Enchantment"]')throw Error('Unsupported attached type replacement');h.statics.push({phase:1,oracleOperation:operation,apply(game,source,bf){const host=bf.find(card=>card.iid===source.attachedTo);if(!host)return;host.cur.types=operation.types.slice();host.cur.subtypes=host.cur.subtypes.filter(type=>operation.allowedSubtypes.includes(type));host.cur.allCreatureTypes=false;host.cur.allCreatureTypesFromOtherEffects=false;host.cur.suppressPrintedChangeling=true;}});return true;}
  if(operation.kind==='permanent-attached-name-v23'){if(!operation.name)throw Error('Missing attached name');h.statics.push({phase:1,oracleOperation:operation,apply(game,source,bf){const host=bf.find(card=>card.iid===source.attachedTo);if(host)host.cur.name=operation.name;}});return true;}
  if(operation.kind==='permanent-attached-mechanic-v23'){const child={};if(operation.operation.kind!=='mechanic-cumulative-upkeep'||!M.applyOracleMechanic(child,operation.operation)||!child.triggers?.length)throw Error('Unsupported attached mechanic');for(const trigger of child.triggers)h.attachmentGrants.push({grantedOperation:{kind:'trigger',value:trigger}});return true;}
  if(operation.kind!=='permanent-zone-keyword-v23')return false;if(operation.contract!=='permanent-zone-keyword-v23'||!/^((?:\{(?:[0-9]+|[WUBRGC])\})+)$/.test(operation.cost)||!(operation.keyword==='unearth'&&operation.zone==='graveyard'&&operation.who==='you'&&operation.filter?.zone==='graveyard'||operation.keyword==='typecycling'&&operation.zone==='hand'&&operation.who==='all'&&operation.subtype))throw Error('Invalid hidden-zone keyword');(script.oracleZoneKeywordsV23||=[]).push(operation);return true;}});
 M.OracleV23Permanents={grantedAbilityAllowed,graveyardEntries,eligible,operations};
})();
