'use strict';
((M)=>{
 const handlers=M.OracleV20.handlers;
 const noRegeneration=new WeakMap(),priorCantRegenerate=M.oracleCantRegenerateV15;
 M.oracleCantRegenerateV15=(game,card)=>noRegeneration.get(game)?.some(row=>row.card===card&&row.version===card.zoneVersion)||priorCantRegenerate?.(game,card)||false;
 const maximumHandSize=M.Game.prototype.maximumHandSize;
 M.Game.prototype.maximumHandSize=function(player){return player.emblems.some(emblem=>emblem.oracleNoHandLimitV20)?Infinity:maximumHandSize.call(this,player);};
 const players=(ctx,who,h)=>who==='each-player'?ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you):who==='each-opponent'?ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you).filter(p=>p!==ctx.you):h.genericEffectSubjects(ctx,who);
 // A retarget is one transaction. Retained targets keep their original object
 // identities, even if illegal; new targets use the ordinary legality filters.
 async function retarget(ctx,object){
  const game=ctx.g,source=object.card||object.srcCard,rule=ctx.oracleRetargetV20;
  if(!game.stack.includes(object)||!source)return false;
  const previous=(object.targets||object.ctx?.targets||[]).map(row=>Array.isArray(row)?row.slice():row),identities=game.cloneTargetIdentities(object.targetIdentities||object.ctx?.targetIdentities||game.captureTargetIdentities(previous));
  const announced=previous.flat(Infinity).filter(Boolean);if(!announced.length)return false;
  const specs=object.targetSpecs||object.ctx?.boundTargetSpecs||(object.kind==='spell'?game.spellTargetSpecs(source,object.castOpts,object.ctrl):[]);
  if(!specs?.length||specs.length!==previous.length)return false;
  const next=[],nextIdentities=[],changed=[];
  const equalIdentity=(card,identity,old,oldIdentity)=>card instanceof M.CardInst?card.iid===old?.iid&&identity?.zoneVersion===oldIdentity?.zoneVersion:card===old;
  for(const [index,raw]of specs.entries()){
   const boundContext={...(object.ctx||{}),g:game,src:source,you:object.ctrl,so:object,x:object.x??object.ctx?.x,targets:next},spec=raw.bindOracleContext?raw.bindOracleContext(boundContext):raw;
   const original=[previous[index]].flat().filter(Boolean),oldIds=Array.isArray(identities[index])?identities[index]:[identities[index]],picks=[],ids=[],flags=[];
   for(const [ordinal,old]of original.entries()){
    const legal=game.legalTargets(spec,source,object.ctrl).filter(card=>{
     if(picks.includes(card))return false;
     if(spec.dependentFilter&&!spec.dependentFilter(game,card,next,object.ctrl,source))return false;
     if(spec.differentFromPrevious&&[next.at(-1)].flat().includes(card)||spec.differentFromAllPrevious&&next.flat(Infinity).includes(card))return false;
     if(spec.distinctCtrl&&picks.some(prior=>prior.ctrl===card.ctrl)||spec.sameGraveyard&&picks.some(prior=>prior.owner!==card.owner))return false;
     if(rule.playerOnly&&!(card instanceof M.Player))return false;
     if(rule.force&&card!==rule.force)return false;
     return !rule.mustChange||!equalIdentity(card,game.captureTargetIdentity(card),old,oldIds[ordinal]);
    });
    let keep=false;
    if(rule.optional){const answer=await ctx.you.controller.decide(game,{type:'chooseOption',prompt:source.name+': keep or change target '+(index+1)+'.'+(ordinal+1)+'?',options:[{key:'no',label:'Keep '+(old.name||'target')},{key:'yes',label:'Choose a new target'}],aiHint:{kind:'newTargets',so:object}});if(!['yes','no'].includes(answer))throw Error('Invalid retarget choice');keep=answer==='no';}
    if(keep){picks.push(old);ids.push(oldIds[ordinal]);flags.push(false);continue;}
    if(!legal.length)return false;
    const answer=rule.force?[rule.force]:await ctx.you.controller.decide(game,{type:'chooseTargets',spec:{...spec,min:1,count:1},candidates:legal,min:1,max:1,src:source,so:object,prompt:source.name+': choose a new target',previousTargets:next,aiHint:spec.aiHint});
    if(!Array.isArray(answer)||answer.length!==1||!legal.includes(answer[0]))return false;
    const card=answer[0],identity=game.captureTargetIdentity(card),isChanged=!equalIdentity(card,identity,old,oldIds[ordinal]);picks.push(card);ids.push(isChanged?identity:oldIds[ordinal]);flags.push(isChanged);
   }
   // Retained illegal targets are exempt. Every changed target must still
   // satisfy group relationships after all the group's choices are known.
   for(let i=0;i<picks.length;i++)if(flags[i]){
    if(picks.some((card,j)=>j!==i&&card===picks[i]))return false;
    if(spec.distinctCtrl&&picks.some((card,j)=>j!==i&&card.ctrl===picks[i].ctrl))return false;
    if(spec.sameGraveyard&&picks.some(card=>card.owner!==picks[i].owner))return false;
   }
   next.push(Array.isArray(previous[index])?picks:picks[0]);nextIdentities.push(Array.isArray(previous[index])?ids:ids[0]);changed.push(...flags);
  }
  if(!changed.some(Boolean))return false;
  object.targets=next;object.targetIdentities=nextIdentities;
  if(object.ctx){object.ctx.targets=next;object.ctx.targetIdentities=nextIdentities;}
  const flattenIdentities=(targets,ids)=>targets.flatMap((row,i)=>[row].flat().flatMap((card,j)=>card?[Array.isArray(ids[i])?ids[i][j]:ids[i]]:[]));
  const flatNew=next.flat(Infinity).filter(Boolean),flatIds=flattenIdentities(next,nextIdentities),flatOldIds=flattenIdentities(previous,identities),fresh=flatNew.filter((card,i)=>!announced.some((old,j)=>equalIdentity(card,flatIds[i],old,flatOldIds[j])));
  for(const holder of [object,object.ctx].filter(Boolean))for(const field of ['damageDivision','counterDistribution'])if(holder[field])holder[field]=holder[field].map((row,index)=>{const card=row.targetSlot!==undefined?[next[row.targetSlot]].flat().filter(Boolean)[row.targetOrdinal||0]:flatNew[index];return {...row,iid:card?.iid,playerIdx:card instanceof M.Player?card.idx:null,...('target' in row?{target:card}:{})};});
  for(const card of [...new Set(fresh)])await game.emit('targeted',{card,byPlayer:object.ctrl,src:source,isSpell:object.kind==='spell',isInstantSorcery:object.kind==='spell'&&game.isInstantSorcerySpell(object),isActivatedAbility:object.kind==='ability',isTriggeredAbility:object.kind==='trigger',so:object});
  game.queueWardTriggers(object,{wardTargets:game.captureWardTargets([...new Set(fresh)],object.ctrl)});return true;
 }
 async function chooseName(ctx,quality='any'){
  const defs=Object.values(M.DEFS).filter(Boolean).flatMap(def=>def.oracleFaces?def.oracleFaces.faces.map(face=>face.def):def.oracleSplit?def.oracleSplit.faces:[def]).filter(Boolean);
  const valid=def=>{if(quality==='any')return true;if(quality==='nonland')return !def.types?.includes('Land');if(quality==='not-basic-land')return !(def.types?.includes('Land')&&def.super?.includes('Basic'));if(quality==='nonartifact, nonland')return !def.types?.some(type=>['Artifact','Land'].includes(type));return def.types?.includes(quality[0].toUpperCase()+quality.slice(1));};
  const names=[...new Set(defs.filter(valid).map(def=>def.name).filter(Boolean))].sort(),answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:ctx.src.name+': choose a card name',searchableChoices:true,options:names.map(key=>({key,label:key})),aiHint:{kind:'cardName'}});
  if(!names.includes(answer))throw Error('Invalid declared card name');return answer;
 }
 M.OracleV20Spells={retarget,chooseName};
 async function pay(ctx,player,cost){
  const n=cost.life;
  if(n!==undefined&&(n>player.life||ctx.g.canPayLife&&!ctx.g.canPayLife(player,n)))return false;
  if(cost.mana&&!ctx.g.canPayMana(player,M.parseCost(cost.mana)))return false;
  const answer=await player.controller.decide(ctx.g,{type:'chooseOption',prompt:'Pay '+(cost.mana||n+' life')+'?',options:[{key:'yes',label:'Pay '+(cost.mana||n+' life')},{key:'no',label:'Decline'}],aiHint:{kind:'pay',cost:cost.mana||'{0}',life:n||0}});
  if(answer!=='yes')return false;
  if(cost.mana)return !!await ctx.g.payMana(player,M.parseCost(cost.mana));
  await ctx.g.loseLife(player,n,ctx.src.name);return true;
 }
 handlers.push({
  spellsV20:true,
  compile(operation,script,entry,h){
   if(operation.kind!=='generic-trigger'||!operation.modeHistoryV20)return false;
   const rule=operation.modeHistoryV20;
   const history=(game,meta,epoch)=>{const saved=meta.oracleModalHistoryV20?.[rule.key+'|'+epoch];return saved&&(rule.scope==='object'||saved.turn===game.turnNo)?saved.chosen:[];};
   for(const event of [].concat(operation.event)){
    const trigger=h.compileGenericTrigger({...operation,event}),prepare=trigger.prepareTargets,filter=trigger.filter,captures=Symbol('oracleModalHistoryCaptureV20');
    trigger.filter=(game,source,data)=>{if(!filter(game,source,data))return false;let capture=data[captures];if(!capture){capture=new Map();Object.defineProperty(data,captures,{value:capture});}capture.set(source.iid,source.copyEpoch||0);return true;};
    trigger.modes.list=trigger.modes.list.map((mode,index)=>({...mode,cond:(game,source,data,controller,tr)=>!history(game,tr?.sourceMeta||source.meta,data[captures]?.get(source.iid)??source.copyEpoch??0).includes(index)}));
    trigger.prepareTargets=async ctx=>{
     if(await prepare?.(ctx)===false)return false;
     const meta=ctx.sourceMeta||ctx.src.meta,epoch=ctx.sourceCopyEpoch??ctx.src.copyEpoch??0,chosen=history(ctx.g,meta,epoch);
     if(chosen.includes(ctx.mode))return false;
     (meta.oracleModalHistoryV20||={})[rule.key+'|'+epoch]={turn:ctx.g.turnNo,chosen:[...chosen,ctx.mode]};return true;
    };
    h.triggers.push(trigger);
   }return true;
  },
  target(game,candidate,controller,source,predicate){if(predicate.kind==='no-counters-v20')return !Object.values(candidate.counters||{}).some(n=>n>0);},
  amount(value,ctx,h){if(value.kind==='snapshot-amount-v20')return (Number(ctx.oracleAmountV20)||0)*(value.multiply??1);if(value.kind==='target-counters-v20')return h.genericEffectSubjects(ctx,value.target).reduce((n,c)=>n+(c.counters[value.counter]||0),0);if(value.kind==='stack-stat-v20'){const spell=h.genericEffectSubjects(ctx,value.target)[0];return spell?.kind==='spell'?Math.max(0,value.stat==='mv'?ctx.g.stackSpellManaValue(spell):Number(spell.card?.[value.stat])||0):0;}},
  condition(game,source,value){if(value.kind==='any-grave-size-v20')return game.players.some(player=>player.graveyard.length>=value.min);},
  async effect(ctx,effect,h){
   if(effect.action==='creature-no-regeneration-sweep-v20'){
    const prior=noRegeneration.get(ctx.g),filter=h.genericTargetSpec(effect.filter,[],0),creatures=ctx.g.bf().filter(card=>card.is('Creature')&&filter.filter(ctx.g,card,ctx.you,ctx.src)).map(card=>({card,version:card.zoneVersion}));noRegeneration.set(ctx.g,[...(prior||[]),...creatures]);try{await h.runGenericEffect(ctx,{action:'battlefield-group',operation:'destroy',filters:[effect.filter]});}finally{if(prior)noRegeneration.set(ctx.g,prior);else noRegeneration.delete(ctx.g);}return true;
   }
   if(effect.action==='parity-sweep-v20'){
    const cards=ctx.g.bf().filter(card=>card.is('Creature')&&Math.floor(card.mv)%2===(effect.parity==='odd'?1:0)&&!(effect.excludeSource&&card===ctx.src&&h.sameBattlefieldSource(ctx)));await h.runGenericEffects({...ctx,targets:[cards]},[{action:effect.operation,target:0}]);return true;
   }
   if(effect.action==='player-consequence-v20'){
    const rows=[];
    for(const player of players(ctx,effect.who,h)){
     const from=effect.first==='discard'?player.hand.slice():ctx.g.bf().filter(card=>card.ctrl===player&&ctx.g.canSacrifice(card)&&!(effect.excludeSource&&card===ctx.src&&h.sameBattlefieldSource(ctx))&&h.genericTargetSpec(effect.filter,[],0).filter(ctx.g,card,player,ctx.src)),required=effect.n==='all'?from.length:effect.n,n=Math.min(from.length,required);let selected=[];
     if(n){if(effect.n==='all')selected=from;else if(effect.random){const shuffled=from.slice();M.shuffle(shuffled,ctx.g.rnd);selected=shuffled.slice(0,n);}else{selected=await player.controller.decide(ctx.g,{type:'chooseCards',from,min:n,max:n,prompt:effect.first==='discard'?'Discard for a conditional result':'Sacrifice for a conditional result',aiHint:{kind:effect.first==='discard'?'discard':'sacCost'}});if(!Array.isArray(selected)||selected.length!==n||new Set(selected).size!==selected.length||selected.some(card=>!from.includes(card)))throw Error('Invalid conditional-result selection');}}
     rows.push({player,required,selected:selected.map(card=>({card,version:card.zoneVersion,qualifies:!effect.successFilter||h.genericTargetSpec({...effect.successFilter,zone:card.zone,controller:'any'},[],0).filter(ctx.g,card,player,ctx.src)}))});
    }
    if(effect.first==='sacrifice')await ctx.g.sacrificeMany(null,rows.flatMap(row=>row.selected.map(selected=>selected.card)));
    else for(const row of rows)await ctx.g.discard(row.player,row.selected.map(selected=>selected.card));
    for(const row of rows){const changed=row.selected.filter(selected=>selected.card.zoneVersion!==selected.version),success=changed.filter(selected=>selected.qualifies).length>=row.required;if((effect.always||!success)&&(!effect.opponentsOnly||row.player!==ctx.you)){const index=(ctx.targets||[]).length,bind=node=>Array.isArray(node)?node.map(bind):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,bind(value)])):node==='result-player-v20'?index:node;await h.runGenericEffects({...ctx,targets:[...(ctx.targets||[]),row.player],oracleAmountV20:changed.length},bind(effect.effects));}}
    return true;
   }
   if(effect.action==='named-card-v20'){
    const name=await chooseName(ctx,effect.quality),matches=card=>M.OracleV8NameGroups.names(card).includes(name),affected=effect.who===undefined?[ctx.you]:players(ctx,effect.who,h);
    for(const player of affected){
     if(effect.mode==='search'){
      const hand=player.hand.map(card=>({card,version:card.zoneVersion})),model={rulesNames:[name],ctrl:player,owner:player};
      if(effect.beforeHandDamage){await ctx.g.revealToHuman({cards:player.hand.slice(),ctrl:player,kind:'reveal',includeLands:true});await h.runGenericEffect({...ctx,targets:[player]},{action:'damage',target:0,n:player.hand.filter(matches).length*effect.beforeHandDamage});}
      await M.OracleV8NameSearch.run(ctx,{declaredNameV20:true,target:0,prior:'none',owner:'controller',zones:['graveyard','hand','library'],quantity:effect.quantity,max:effect.max,destination:'exile'},{subjects:()=>[model]});
      if(effect.handReward){const n=hand.filter(row=>row.card.zone==='exile'&&row.card.zoneVersion===row.version+1).length,index=(ctx.targets||[]).length,bind=node=>Array.isArray(node)?node.map(bind):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([k,v])=>[k,bind(v)])):node==='named-player-v20'?index:node;await h.runGenericEffects({...ctx,targets:[...(ctx.targets||[]),player],oracleAmountV20:n},[bind(effect.handReward)]);}
     }else if(effect.mode==='check'){
      const pool=player[effect.zone],cards=effect.all?pool.slice():effect.random?(pool.length?[pool[Math.floor(ctx.g.rnd()*pool.length)]]:[]):pool.length?[pool.at(-1)]:[],selected=cards.map(card=>({card,version:card.zoneVersion}));await ctx.g.revealToHuman({cards,ctrl:player,kind:'reveal',includeLands:true});if(cards.some(matches)){if(effect.effects[0]?.action==='named-discard-v20'){const chosen=selected.filter(row=>row.card.zone==='hand'&&row.card.zoneVersion===row.version);await ctx.g.discard(player,chosen.map(row=>row.card));}else await h.runGenericEffects(ctx,effect.effects);}
     }else if(effect.mode==='discard'){
      await ctx.g.revealToHuman({cards:player.hand.slice(),ctrl:player,kind:'reveal',includeLands:true});const from=player.hand.filter(matches);let selected=from;
      if(!effect.all&&from.length){selected=await player.controller.decide(ctx.g,{type:'chooseCards',from,min:1,max:1,prompt:'Discard a card with the declared name',aiHint:{kind:'discard'}});if(!Array.isArray(selected)||selected.length!==1||!from.includes(selected[0]))throw Error('Invalid named discard');}
      const versions=selected.map(card=>({card,version:card.zoneVersion}));await ctx.g.discard(player,selected);if(effect.drawIfNone&&!versions.some(row=>row.card.zoneVersion!==row.version))await ctx.g.draw(ctx.you,1);
     }else if(effect.mode==='mill'){
      const card=player.library.at(-1),version=card?.zoneVersion,mv=card?.mv;await ctx.g.mill(player,1);if(card&&card.zone==='graveyard'&&card.zoneVersion===version+1&&matches(card)){if(effect.reward==='draw')await ctx.g.draw(ctx.you,1);else await ctx.g.gainLife(ctx.you,mv,ctx.src);}
     }else if(['top','until','tunnel'].includes(effect.mode)){
      for(let i=0;i<(effect.prefixExile||0);i++){const card=player.library.at(-1);if(card)await ctx.g.move(card,'exile');}
      let cards=player.library.slice().reverse();if(effect.mode==='top')cards=cards.slice(0,effect.n);else{const index=cards.findIndex(matches);if(index>=0)cards=cards.slice(0,index+1);}
      const locked=cards.map(card=>({card,version:card.zoneVersion})),present=row=>row.card.zone==='library'&&row.card.zoneVersion===row.version&&player.library.includes(row.card);await ctx.g.revealToHuman({cards,ctrl:player,kind:'reveal',includeLands:true});
      if(effect.mode==='tunnel'&&!cards.some(matches))M.shuffle(player.library,ctx.g.rnd);
      else{let exiled=0;for(const row of locked)if(present(row)){if(matches(row.card)){if(effect.mode!=='tunnel')await ctx.g.move(row.card,'hand');}else{const destination=effect.mode==='tunnel'?'graveyard':effect.mode==='top'?effect.rest:'exile';await ctx.g.move(row.card,destination);if(destination==='exile'&&row.card.zone==='exile')exiled++;}}if(effect.losePerExiled)await ctx.g.loseLife(player,exiled);}
     }else throw Error('Unknown named-card operation');
    }return true;
   }
   if(effect.action==='hand-subset-v20'){
    for(const player of players(ctx,effect.who,h)){
     let visible=player.hand.slice();
     if(effect.revealN!==undefined){const n=Math.min(visible.length,h.genericAmount(effect.revealN,ctx)),answer=await player.controller.decide(ctx.g,{type:'chooseCards',from:visible,min:n,max:n,prompt:'Choose hand cards to reveal',aiHint:{kind:'discard'}});if(!Array.isArray(answer)||answer.length!==n||new Set(answer).size!==answer.length||answer.some(card=>!visible.includes(card)))throw Error('Invalid partial hand reveal');visible=answer;}
     await ctx.g.revealToHuman({cards:visible.slice(),ctrl:effect.look?ctx.you:player,kind:effect.look?'look':'reveal',includeLands:true});
     let selected=[];for(const selection of effect.selections){const from=visible.filter(card=>!selected.includes(card)&&h.genericTargetSpec({...selection.filter,zone:'hand',controller:'any'},[],0).filter(ctx.g,card,player,ctx.src)),n=Math.min(from.length,h.genericAmount(selection.n,ctx)),answer=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:n,max:n,prompt:'Choose revealed hand cards',aiHint:{kind:'discard'}});if(!Array.isArray(answer)||answer.length!==n||new Set(answer).size!==answer.length||answer.some(card=>!from.includes(card)))throw Error('Invalid revealed hand selection');selected.push(...answer);}
     if(effect.destination==='discard')await ctx.g.discard(player,selected);
     else if(effect.destination==='library'){if(selected.length>1){const order=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:selected,min:selected.length,max:selected.length,prompt:'Order chosen hand cards, top first',aiHint:{kind:'orderBottom'}});if(!Array.isArray(order)||order.length!==selected.length||new Set(order).size!==order.length||order.some(card=>!selected.includes(card)))throw Error('Invalid hand card order');selected=order;}for(const card of selected.slice().reverse())await ctx.g.move(card,'library');}
     else throw Error('Unsupported hand selection destination');
     if(effect.returnSelfWhenMoreHand&&player.hand.length>ctx.you.hand.length)await ctx.g.move(ctx.src,'hand');
    }return true;
   }
   if(effect.action==='inspect-top-v20'){
    const card=ctx.you.library.at(-1);if(!card)return true;const version=card.zoneVersion;
    await ctx.g.revealToHuman({cards:[card],ctrl:ctx.you,kind:effect.reveal?'reveal':'look',includeLands:true});
    const view=Object.create(card);Object.defineProperty(view,'zone',{value:'graveyard'});
    const yes=async prompt=>{const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt,options:[{key:'yes',label:'Move card'},{key:'no',label:'Leave card'}],aiHint:{kind:'optTrigger',src:ctx.src}});if(!['yes','no'].includes(answer))throw Error('Invalid inspected-card choice');return answer==='yes';};
    let moved=false;if(h.genericTargetSpec(effect.filter,[],0).filter(ctx.g,view,ctx.you,ctx.src)&&(!effect.optional||await yes('Move the inspected card?'))){if(effect.revealSelected)await ctx.g.revealToHuman({cards:[card],ctrl:ctx.you,kind:'reveal',includeLands:true});if(card.zone==='library'&&card.zoneVersion===version){if(effect.destination==='battlefield')await ctx.g.putPermanentOntoBattlefield(card,ctx.you,{tapped:effect.tapped});else await ctx.g.move(card,effect.destination);moved=true;}}
    if(!moved&&effect.otherwise&&card.zone==='library'&&card.zoneVersion===version&&(!effect.otherwiseOptional||await yes('Move the inspected card to '+effect.otherwise+'?')))await ctx.g.move(card,effect.otherwise==='bottom'?'library':effect.otherwise,{toBottom:effect.otherwise==='bottom'});return true;
   }
   if(effect.action==='bound-reveal-v20'){
    for(const player of players(ctx,effect.who,h)){
     const cards=player[effect.zone],card=effect.random?cards[Math.floor(ctx.g.rnd()*cards.length)]:cards.at(-1);if(!card)continue;
     const stats={mv:card.mv,power:card.power,toughness:card.toughness},targets=[...(ctx.targets||[]),player],playerIndex=targets.length-1;
     await ctx.g.revealToHuman({cards:[card],ctrl:player,kind:'reveal',includeLands:true});
     const bind=node=>Array.isArray(node)?node.map(bind):node&&typeof node==='object'?node.kind==='revealed-card-stat-v8'?stats[node.stat]:Object.fromEntries(Object.entries(node).map(([k,v])=>[k,bind(v)])):node==='bound-reveal-player-v20'?playerIndex:node;
     for(const clause of effect.clauses){const view=Object.create(card);Object.defineProperty(view,'zone',{value:'graveyard'});const match=!clause.filter||h.genericTargetSpec({...clause.filter,controller:'any'},[],0).filter(ctx.g,view,ctx.you,ctx.src);await h.runGenericEffects({...ctx,targets},bind((clause.invert?!match:match)?clause.effects:clause.elseEffects||[]));}
    }return true;
   }
   if(effect.action==='hand-count-v20'){
    const from=ctx.you.hand.filter(card=>h.genericTargetSpec({...effect.filter,zone:'hand',controller:'you'},[],0).filter(ctx.g,card,ctx.you,ctx.src));
    const saved=ctx.oracleHandChoiceV20;
    if(saved&&saved.some(row=>row.card.zoneVersion!==row.zoneVersion||!from.includes(row.card)))throw Error('Counted hand selection changed before mana resolution');
    const chosen=saved?saved.map(row=>row.card):await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:0,max:from.length,prompt:effect.discard?'Choose any number of cards to discard':'Choose any number of cards to reveal',aiHint:{kind:effect.discard?'addlDiscard':'bestCard'}});
    if(!Array.isArray(chosen)||new Set(chosen).size!==chosen.length||chosen.some(card=>!from.includes(card)))throw Error('Invalid counted hand selection');
    if(effect.discard)await ctx.g.discard(ctx.you,chosen);else if(chosen.length)await ctx.g.revealToHuman({cards:chosen.slice(),ctrl:ctx.you,kind:'reveal',includeLands:true});
    await h.runGenericEffects({...ctx,oracleAmountV20:chosen.length},effect.effects);return true;
   }
   if(effect.action==='retarget-stack-v20'||effect.action==='control-stack-v20'){
    for(const object of h.genericEffectSubjects(ctx,effect.target))if(ctx.g.stack.includes(object)){
     if(effect.action==='control-stack-v20'){object.ctrl=ctx.you;if(object.card)object.card.ctrl=ctx.you;if(object.ctx)object.ctx.you=ctx.you;}
     if(effect.forceTarget==='self'&&!h.sameBattlefieldSource(ctx))continue;
     if(effect.action==='retarget-stack-v20'||effect.retarget)await M.C1719.retarget({...ctx,oracleRetargetV20:{optional:effect.optional!==false,mustChange:effect.optional===false,playerOnly:!!effect.playerOnly,force:effect.forceTarget?h.genericEffectSubjects(ctx,effect.forceTarget)[0]:null}},object);
    }return true;
   }
   if(effect.action==='per-player-targets-v20'){
    const cards=h.genericEffectSubjects(ctx,effect.target),captured=ctx._oracleTargetControllers?.[effect.target]||[];
    const replace=node=>Array.isArray(node)?node.map(replace):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,value==='per-player-subject-v20'?0:value==='per-player-player-v20'?1:replace(value)])):node;
    for(const raw of effect.effects){const next=replace(raw),individual=/target-stat|target-count|per-player-player-v20|target-controller/.test(JSON.stringify(raw));
     if(individual)for(const card of cards){const record=captured.find(row=>row.subject===card);await h.runGenericEffect({...ctx,targets:[card,record?.controller||card.ctrl],_oracleTargetControllers:record?[[record]]:undefined},next);}
     else await h.runGenericEffect({...ctx,targets:[cards],_oracleTargetControllers:[captured]},next);
    }return true;
   }
   if(effect.action==='choice-table-v20'){
    const options=effect.options.map(({key,label})=>({key,label}));if(effect.optional)options.push({key:'none',label:'Decline'});
    const chosen=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose a '+effect.kind,options,aiHint:{kind:'oracleChoice',src:ctx.src}});
    if(chosen==='none'&&effect.optional)return true;const branch=effect.options.find(option=>option.key===chosen);if(!branch)throw new Error('Invalid characteristic choice');await h.runGenericEffects(ctx,branch.effects,true);return true;
   }
   if(effect.action==='exchange-shuffle-v20'){
    await h.runGenericEffect(ctx,{action:'zone-exchange-v19',zones:effect.zones});await h.runGenericEffect({...ctx,targets:[ctx.you],_oracleTargetControllers:undefined},{action:'shuffle-library-v9',who:0});return true;
   }
   if(effect.action==='zone-choice-v20'){
    const replace=node=>Array.isArray(node)?node.map(replace):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,value==='zone-choice-card-v20'?0:value==='zone-choice-player-v20'?1:replace(value)])):node;
    const boundFilter=filter=>({...filter,...(filter.threshold==='X'?{threshold:h.genericAmount('X',ctx)}:{}),...(filter.alternatives?{alternatives:filter.alternatives.map(boundFilter)}:{})});
    for(const player of players(ctx,effect.who,h)){
     if(effect.revealHand||effect.lookHand)await ctx.g.revealToHuman({cards:player.hand.slice(),ctrl:effect.lookHand?ctx.you:player,kind:effect.lookHand?'look':'reveal',includeLands:true});
     if(effect.revealTop)await ctx.g.revealToHuman({cards:player.library.slice(-effect.revealTop),ctrl:player,kind:'reveal',includeLands:true});
     const from=effect.selections.flatMap(({zone,filter,top})=>(top?player[zone].slice(-top):player[zone]).filter(card=>h.genericTargetSpec({...boundFilter(filter),zone,controller:'any'},[],0).filter(ctx.g,card,player,ctx.src))),minimum=effect.optional?0:Math.min(1,from.length);
     const picked=from.length?await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:minimum,max:1,prompt:'Choose a card from the indicated zones',aiHint:{kind:effect.destination==='battlefield'?'recur':'bestCard'}}):[];
     if(!Array.isArray(picked)||picked.length<minimum||picked.length>1||picked.some(card=>!from.includes(card)))throw new Error('Invalid zone card choice');
     const card=picked[0],child={...ctx,targets:[card||null,player],_oracleTargetControllers:undefined};
     if(!card){if(effect.elseEffects)await h.runGenericEffects(child,replace(effect.elseEffects));if(effect.effects)await h.runGenericEffects(child,replace(effect.effects));continue;}
     if(effect.beforeEffects)await h.runGenericEffects(child,replace(effect.beforeEffects));
     if(effect.untilSourceLeaves){if(!h.sameBattlefieldSource(ctx))continue;(ctx.g.oracleExileDurations||=[]).push({source:ctx.src,sourceZoneVersion:ctx.sourceZoneVersion??ctx.src.zoneVersion,cards:[{card,zoneVersion:card.zoneVersion+1}],returnZone:'hand'});}
     if(effect.destination==='discard')await ctx.g.discard(player,[card]);else if(effect.destination==='battlefield')await ctx.g.putPermanentOntoBattlefield(card,ctx.you,{tapped:!!effect.tapped});else if(effect.destination==='library'&&effect.depthV9!==undefined)await h.runGenericEffect(child,{action:'move-to-library',target:0,depthV9:effect.depthV9});else await ctx.g.move(card,effect.destination,{toBottom:!!effect.toBottom});
     if(effect.play&&card.zone==='exile'){card.meta.playableBy=ctx.you;card.meta.playableUntil=Infinity;card.meta.spellsOnly=true;card.meta.anyColor=!!effect.play.anyColor;}
     if(effect.effects)await h.runGenericEffects(child,replace(effect.effects));
     if(effect.afterChoice){const rule=effect.afterChoice,yes=rule.mvMax!==undefined?card.mv<=rule.mvMax:card.zone==='exile'&&(card.is('Instant')||card.kw('flash'));await h.runGenericEffects(child,replace(yes?rule.effects:rule.elseEffects||[]));}
    }return true;
   }
   if(effect.action==='hand-limit-emblem-v20'){
    const emblem=new M.CardInst({name:ctx.src.name+' emblem',cost:null,types:[],subtypes:[],super:[],kws:[],oracle:'You have no maximum hand size.'},ctx.you);emblem.zone='command';emblem.timestamp=ctx.g.nextOracleTimestamp();emblem.oracleNoHandLimitV20=true;ctx.you.emblems.push(emblem);ctx.g.recalc();return true;
   }
   if(effect.action==='hand-redraw-v20'){
    const groups=[];
    for(const player of players(ctx,effect.who,h)){
     const from=player.hand.slice();let chosen=from;
     if(effect.selection==='any'||effect.destination==='bottom'&&from.length>1){
      chosen=await player.controller.decide(ctx.g,{type:'chooseCards',from,min:effect.selection==='any'?0:from.length,max:from.length,prompt:effect.destination==='bottom'?'Choose hand cards for the bottom of your library, bottom first':'Choose hand cards to shuffle into your library',aiHint:{kind:'addlDiscard'}});
      if(!Array.isArray(chosen)||new Set(chosen).size!==chosen.length||chosen.length>from.length||effect.selection==='all'&&chosen.length!==from.length||chosen.some(c=>!from.includes(c)))throw new Error('Invalid hand redraw choice');
     }
     groups.push({player,chosen:chosen.map(card=>({card,version:card.zoneVersion})),n:chosen.length});
    }
    for(const group of groups){
     const ordered=effect.destination==='bottom'?group.chosen.slice().reverse():group.chosen;
     for(const {card,version} of ordered)if(card.zone==='hand'&&card.zoneVersion===version){
      await ctx.g.move(card,effect.destination==='exile'?'exile':'library',{toBottom:effect.destination==='bottom'});
      if(effect.playNextTurn&&card.zone==='exile'){card.meta.playableBy=group.player;card.meta.spellsOnly=false;card.meta.playableUntilOwnTurn=group.player.turnsStarted+1;}
     }
     if(effect.destination==='shuffle')M.shuffle(group.player.library,ctx.g.rnd);
    }
    for(const group of groups)await h.runGenericEffect({...ctx,targets:[group.player]},{action:'draw',who:0,n:group.n+(effect.bonus||0)});return true;
   }
   if(effect.action==='optional-effect-v20'){
    const choice=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Use this optional effect?',options:[{key:'yes',label:'Use effect'},{key:'no',label:'Decline'}],aiHint:{kind:'optTrigger',src:ctx.src}});
    if(choice==='yes')await h.runGenericEffects(ctx,effect.effects,true);return true;
   }
   if(effect.action==='exile-choice-v20'){
    const exiled=[];for(const card of ctx.you.library.slice(-h.genericAmount(effect.n,ctx)).reverse()){await ctx.g.move(card,'exile');if(card.zone==='exile')exiled.push(card);}
    if(!exiled.length)return true;
    const choice=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:exiled,min:1,max:1,prompt:'Choose an exiled card you may play',aiHint:{kind:'draw'}});
    if(!Array.isArray(choice)||choice.length!==1||!exiled.includes(choice[0]))throw new Error('Invalid exiled card choice');
    const card=choice[0];card.meta.playableBy=ctx.you;card.meta.spellsOnly=false;if(effect.nextOwnTurn)card.meta.playableUntilOwnTurn=ctx.you.turnsStarted+1;else card.meta.playableUntil=ctx.g.turnNo;return true;
   }
   if(effect.action==='delay-effect-v20'){
    const body=effect.body,original=(ctx.targets||[]).map(row=>[row].flat().filter(Boolean).map(card=>({card,version:card.zoneVersion}))),controller=ctx.you;
    ctx.g.delayed.push({on:effect.event,once:true,src:ctx.src,ctrl:controller,name:ctx.src.name+' — delayed effect',filter:(game,data)=>!effect.own||data.player===controller,
     targets:body.targets.map((target,index)=>h.genericTargetSpec(target,body.effects,index,ctx.data)),
     prepareTargets:async child=>{for(const key of ['sourceIid','sourceTimestamp','sourceZoneVersion','oracleSourceCapture','sourceMeta','eventCardZoneVersion','x','sacd'])if(ctx[key]!==undefined)child[key]=ctx[key];if(effect.captureTargets)child.targets=original.map(row=>row.filter(({card,version})=>card instanceof M.Player||card.zoneVersion===version).map(({card})=>card));return h.prepareGenericDivisions(child,body.effects);},
     run:async child=>h.runGenericEffects(child,body.effects)});return true;
   }
   if(effect.action==='controller-group-v20'){
    const controllers=h.genericEffectSubjects(ctx,effect.who),spec=h.genericTargetSpec(effect.filter,[],0),cards=ctx.g.bf().filter(card=>controllers.includes(card.ctrl)&&spec.filter(ctx.g,card,ctx.you,ctx.src));
    await h.runGenericEffects({...ctx,targets:[cards],_oracleTargetControllers:undefined},effect.effects.map(e=>({...e,target:e.target==='controller-group-subject-v20'?0:e.target})));return true;
   }
   if(effect.action==='self-reflexive-v20'||effect.action==='exile-reflexive-v20'){
    if(effect.action==='self-reflexive-v20'){
     if(!h.sameBattlefieldSource(ctx)||ctx.src.ctrl!==ctx.you||!ctx.g.canSacrifice(ctx.src))return true;
     if(!await ctx.g.sacrifice(ctx.you,ctx.src))return true;
    }else{
     const card=h.genericEffectSubjects(ctx,effect.target)[0];if(!card||card.zone!=='graveyard')return true;
     const version=card.zoneVersion,creature=card.is('Creature');await h.runGenericEffect(ctx,effect.exileEffect);
     if(!creature||card.zone!=='exile'||card.zoneVersion!==version+1)return true;
    }
    const body=effect.body;
    ctx.g.queueTrigger({src:ctx.src,ctrl:ctx.you,data:ctx.data,name:'When you do',targets:body.targets.map((target,index)=>{const spec=h.genericTargetSpec(target,body.effects,index,ctx.data);return spec.bindOracleContext?spec.bindOracleContext(ctx):spec;}),
     prepareTargets:async child=>{for(const key of ['sourceIid','sourceTimestamp','sourceZoneVersion','oracleSourceCapture','eventCardZoneVersion','x','sacd'])if(ctx[key]!==undefined)child[key]=ctx[key];return h.prepareGenericDivisions(child,body.effects);},
     run:async child=>h.runGenericEffects(child,body.effects)});return true;
   }
   if(effect.action==='roll-table-v20'||effect.action==='roll-value-v20'){
    const [n]=await ctx.g.rollDice(ctx.you,effect.sides,1,{source:ctx.src});
    const effects=effect.action==='roll-value-v20'?effect.effects:effect.branches.find(branch=>n>=branch.min&&n<=branch.max)?.effects;
    if(!effects)throw new Error('Oracle dice result is outside the complete outcome table');
    await h.runGenericEffects({...ctx,oracleAmountV20:n},effects);return true;
   }
   if(effect.action==='target-dies-v20'){
    for(const card of h.genericEffectSubjects(ctx,effect.target)){
     if(card.zone!=='battlefield')continue;
     const iid=card.iid,version=card.zoneVersion,controller=ctx.you;
     ctx.g.delayed.push({on:'dies',expires:'eot',once:true,src:ctx.src,ctrl:controller,name:ctx.src.name+' — dies this turn',
      filter:(game,data)=>data.card?.iid===iid&&data.snap?.zoneVersion===version&&(!effect.underYou||data.snap.ctrl===controller),
      run:async later=>{
       const dead=later.g.byIid(iid),snap=later.data.snap;
       const record={subject:dead,controller:snap.ctrl,zoneVersion:version,stats:{power:snap.power,toughness:snap.toughness,mv:snap.mv},snapshotV10:snap};
       await h.runGenericEffects({...later,targets:[dead],_oracleTargetControllers:[[record]],oracleDeadV20:{iid,version:version+1,owner:dead.owner.idx}},effect.effects);
      }});
    }return true;
   }
   if(effect.action==='death-return-v20'){
    const saved=ctx.oracleDeadV20,card=saved&&ctx.g.byIid(saved.iid);
    if(card?.zone==='graveyard'&&card.zoneVersion===saved.version)await ctx.g.putPermanentOntoBattlefield(card,ctx.g.players[saved.owner]);return true;
   }
   if(effect.action==='delay-subject-v20'){
    const locked=h.genericEffectSubjects(ctx,effect.target).filter(c=>c.zone==='battlefield').map(c=>({iid:c.iid,version:c.zoneVersion})),player=ctx.you.idx;
    ctx.g.delayed.push({on:effect.event,once:true,src:ctx.src,ctrl:ctx.you,name:ctx.src.name+' — delayed '+effect.operation,filter:(game,data)=>effect.player!=='you'||data.player?.idx===player,run:async later=>{
     for(const row of locked){const card=later.g.byIid(row.iid);if(card?.zone!=='battlefield'||card.zoneVersion!==row.version)continue;
      if(effect.operation==='sacrifice'){if(card.ctrl===later.you)await later.g.sacrifice(later.you,card);}else if(effect.operation==='destroy')await later.g.destroy(card);else await later.g.move(card,effect.operation==='exile'?'exile':'hand');
     }}});return true;
   }
   if(effect.action==='selected-group-damage-v20'){
    const selected=h.genericEffectSubjects(ctx,effect.target)[0];if(selected?.zone!=='battlefield'||!selected.is('Creature'))return true;
    const matching=filter=>ctx.g.bf().filter(c=>h.genericTargetSpec(filter,[],0).filter(ctx.g,c,ctx.you,ctx.src));
    const sources=effect.sources?matching(effect.sources).filter(c=>c.is('Creature')):[selected],targets=effect.sources?[selected]:matching(effect.filter).filter(c=>!effect.excludeSource||c!==selected);
    await ctx.g.damageBatch(sources.flatMap(src=>targets.map(target=>({src,target,n:effect.n===undefined?Math.max(0,src.power):h.genericAmount(effect.n,ctx)}))),{deferSBA:true});return true;
   }
   if(effect.action==='multiple-bite-v20'){
    const sources=h.genericEffectSubjects(ctx,effect.target).filter(c=>c.zone==='battlefield'&&c.is('Creature')),recipients=h.genericEffectSubjects(ctx,effect.otherTarget).filter(c=>c.zone==='battlefield');
    await ctx.g.damageBatch(sources.flatMap(src=>recipients.map(target=>({src,target,n:Math.max(0,src.power)}))),{deferSBA:true});return true;
   }
   if(effect.action==='choose-source-v20'){
    const from=ctx.g.bf().filter(c=>h.genericTargetSpec(effect.filter,[],0).filter(ctx.g,c,ctx.you,ctx.src));if(!from.length)return true;
    const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:1,max:1,prompt:'Choose a permanent',aiHint:{kind:effect.effects.some(e=>e.action==='bite')?'fight':'counterTarget'}});
    if(!Array.isArray(answer)||answer.length!==1||!from.includes(answer[0]))throw new Error('Invalid permanent choice');
    await h.runGenericEffects({...ctx,targets:[answer[0],...(ctx.targets||[])],_oracleTargetControllers:undefined},effect.effects);return true;
   }
   if(effect.action==='reveal-discard-v20'){
    for(const player of players(ctx,effect.who,h)){
     await ctx.g.revealToHuman({cards:player.hand.slice(),ctrl:player,kind:'reveal',includeLands:true});
     const filter={...effect.filter,zone:'hand',controller:'any'};
     await ctx.g.discard(player,player.hand.filter(c=>h.genericTargetSpec(filter,[],0).filter(ctx.g,c,player,ctx.src)));
    }return true;
   }
   if(effect.action==='sacrifice-categories-v20'){
    const groups=[];
    for(const player of players(ctx,effect.who,h)){
     const chosen=[];
     for(const filter of effect.filters){
      const from=ctx.g.bf().filter(c=>c.ctrl===player&&!chosen.includes(c)&&ctx.g.canSacrifice(c)&&h.genericTargetSpec(filter,[],0).filter(ctx.g,c,player,ctx.src));if(!from.length)continue;
      const answer=await player.controller.decide(ctx.g,{type:'chooseCards',from,min:1,max:1,prompt:'Choose a permanent to sacrifice',aiHint:{kind:'sacCost'}});
      if(!Array.isArray(answer)||answer.length!==1||!from.includes(answer[0]))throw new Error('Invalid sacrifice choice');chosen.push(answer[0]);
     }groups.push({player,chosen});
    }
    await ctx.g.sacrificeMany(null,groups.flatMap(group=>group.chosen));return true;
   }
   if(effect.action==='choose-number-v20'){
    const options=Array.from({length:effect.max-effect.min+1},(_,i)=>({key:String(effect.min+i),label:String(effect.min+i)}));
    const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose a number',options,aiHint:{kind:'oracleNumber',src:ctx.src}});
    if(!options.some(o=>o.key===answer))throw new Error('Invalid number choice');
    await h.runGenericEffects({...ctx,oracleAmountV20:Number(answer)},effect.effects);return true;
   }
   if(effect.action==='each-unless-v20'){
    const cards=ctx.g.bf().filter(c=>h.genericTargetSpec(effect.filter,[],0).filter(ctx.g,c,ctx.you,ctx.src));
    const unpaid=[],cost=effect.payment.life!==undefined?{life:h.genericAmount(effect.payment.life,ctx)}:effect.payment;
    for(const player of ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you))for(const card of cards.filter(c=>c.ctrl===player)){
     if(!await pay(ctx,player,cost))unpaid.push(card);
    }
    if(effect.operation==='sacrifice')await ctx.g.sacrificeMany(null,unpaid);else await ctx.g.bounceMany(unpaid);return true;
   }
   if(effect.action==='any-pay-v20'){
    for(const player of ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you))if(await pay(ctx,player,{mana:effect.cost}))return true;
    await h.runGenericEffects(ctx,effect.effects);return true;
   }
   if(effect.action==='snapshot-amount-v20'){
    const amount=h.genericAmount(effect.value,ctx);
    await h.runGenericEffects({...ctx,oracleAmountV20:amount},effect.effects);return true;
   }
   if(effect.action==='player-group-v20'){
    const players=h.genericEffectSubjects(ctx,effect.who),excluded=effect.excludeTarget===undefined?[]:h.genericEffectSubjects(ctx,effect.excludeTarget);
    const e=effect.effect,cards=ctx.g.bf().filter(card=>players.includes(card.ctrl)&&!excluded.includes(card)&&e.filters.some(filter=>h.genericTargetSpec(filter,[],0).filter(ctx.g,card,ctx.you,ctx.src)));
    if(e.operation!=='pump')throw new Error('Unsupported player group operation');
    const multiplier=e.multiplier?h.genericAmount(e.multiplier,ctx):1;
    for(const card of cards)await h.runGenericEffect({...ctx,targets:[card]},{...e,action:'pump',target:0,power:h.genericAmount(e.power,ctx,true)*multiplier,toughness:h.genericAmount(e.toughness,ctx,true)*multiplier});
    return true;
   }
   if(effect.action==='sacrifice-stat-v20'){
    for(const player of h.genericEffectSubjects(ctx,effect.who)){
     const from=ctx.g.bf().filter(card=>card.ctrl===player&&ctx.g.canSacrifice(card)&&h.genericTargetSpec(effect.filter,[],0).filter(ctx.g,card,player,ctx.src));
     if(!from.length)continue;
     const answer=await player.controller.decide(ctx.g,{type:'chooseCards',from,min:1,max:1,prompt:'Choose a creature to sacrifice',aiHint:{kind:'sacCost'}});
     if(!Array.isArray(answer)||answer.length!==1||!from.includes(answer[0]))throw new Error('Invalid sacrifice choice');
     const card=answer[0],amount=Math.max(0,Number(card[effect.stat])||0),version=card.zoneVersion;
     await ctx.g.sacrifice(player,card);
     if(card.zoneVersion!==version)await h.runGenericEffect({...ctx,oracleAmountV20:amount},effect.effect);
    }return true;
   }
   if(effect.action==='order-graveyard-v20'){
    const from=ctx.you.graveyard.slice();if(from.length<2)return true;
    const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:from.length,max:from.length,prompt:'Order your graveyard from bottom to top',aiHint:{kind:'recur'}});
    if(!Array.isArray(answer)||answer.length!==from.length||new Set(answer).size!==from.length||answer.some(card=>!from.includes(card)))throw new Error('Invalid graveyard order');
    ctx.you.graveyard.splice(0,ctx.you.graveyard.length,...answer);return true;
   }
   return false;
  }
 });
})(globalThis.MTG||={});
