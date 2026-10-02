(function(){
 'use strict';const M=globalThis.MTG,G=M.Game.prototype,H=M.OracleV20.helpers;
 const live=source=>source?.zone==='battlefield'&&!source.phasedOut&&!source.cur?.abilitiesDisabled;
 const cardTypes=['Artifact','Battle','Creature','Enchantment','Instant','Kindred','Land','Planeswalker','Sorcery'];
 const sharedTypes=(game,source,link,card,options={})=>cardTypes.filter(type=>game.castHasType(card,options,type)&&linked(game,source,link).some(exiled=>exiled.is(type)));
 function binding(source,evidence={}){
  const capture=evidence.oracleSourceCapture||evidence,snap=evidence.data?.card===source?evidence.data?.snap:null;
  const copying=snap?!!snap.copying:evidence.sourceCopying??capture.copying??!!source.isCopyOf;
  const epoch=snap?snap.copyEpoch:evidence.sourceCopyEpoch??capture.copyEpoch??source.copyEpoch;
  return {iid:evidence.sourceIid??capture.iid??source.iid,version:snap?.zoneVersion??evidence.sourceZoneVersion??capture.zoneVersion??source.zoneVersion,lifetime:copying?'copy:'+(epoch||0):'native'};
 }
 function records(game,source,link,evidence={}){const key=binding(source,evidence);return (game.oracleLinkedExiles||[]).filter(row=>row.sourceIid===key.iid&&row.sourceZoneVersion===key.version&&row.link===link&&row.lifetime===key.lifetime);}
 function linked(game,source,link,evidence={}){return [...new Set(records(game,source,link,evidence).flatMap(row=>row.cards||[]).filter(row=>row.card.zone==='exile'&&row.card.zoneVersion===row.zoneVersion).map(row=>row.card))];}
 function localStackGrant(operation,offset){
  const refs=[],keys=new Set(['target','who','otherTarget','conditionTarget','excludeTargetV14']);
  const collect=node=>{if(!node||typeof node!=='object')return;for(const [key,value]of Object.entries(node)){if(keys.has(key)&&typeof value==='number')refs.push(value);else if(key!=='operation')if(Array.isArray(value))value.forEach(collect);else collect(value);}};
  collect(operation);if(!refs.some(value=>value>=(operation.targets?.length||0)))return operation;
  if(!offset||refs.some(value=>value<offset||value-offset>=(operation.targets?.length||0)))throw Error('Invalid local stack-grant target scope');
  const rebase=node=>Array.isArray(node)?node.map(rebase):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,keys.has(key)&&typeof value==='number'?value-offset:key==='operation'?value:rebase(value)])):node;
  return rebase(operation);
 }
 async function acquire(ctx,op,subjects){
  if(typeof op.link!=='string'||!op.link)throw Error('Missing exact linked ability ID');
  const key=binding(ctx.src,ctx),copies=subjects.filter(subject=>subject.kind==='spell'&&subject.isCopy&&ctx.g.stack.includes(subject));
  for(const copy of copies)ctx.g.stack.splice(ctx.g.stack.indexOf(copy),1);if(copies.length)ctx.g.note('stack',{});
  const rows=[...new Set(subjects)].map(subject=>({subject,card:subject.kind==='spell'?subject.isCopy?null:subject.card:subject})).filter(row=>row.card&&(!op.from||row.card.zone===op.from)).map(row=>({...row,version:row.card.zoneVersion}));
  if(!rows.length)return [];
  const physical=rows.flatMap(row=>row.card.zone==='battlefield'?M.Mutate?.follow(row.card)||[{card:row.card,zoneVersion:row.version+1}]:[{card:row.card,zoneVersion:row.version+1}]);
  await ctx.g.withZKExileBatch(async()=>{
   const current=rows.filter(row=>row.card.zoneVersion===row.version),field=current.filter(row=>row.card.zone==='battlefield').map(row=>row.card),grave=current.filter(row=>row.card.zone==='graveyard').map(row=>row.card),opts=op.faceDown?{exileFaceDown:true,exileLookers:op.hideaway||op.lookAllowed?[ctx.you.idx]:[]}:{};
   if(field.length)await ctx.g.exileMany(field,opts);
   if(grave.length)await ctx.g.moveGraveyardBatch(grave,'exile',opts);
   for(const row of current.filter(row=>!['battlefield','graveyard'].includes(op.from||row.card.zone))){if(row.card.zoneVersion===row.version)await ctx.g.move(row.card,'exile',opts);}
  });
  const cards=physical.filter(row=>row.card.zone==='exile'&&row.card.zoneVersion===row.zoneVersion);
  if(cards.length)(ctx.g.oracleLinkedExiles||=[]).push({source:ctx.src,sourceIid:key.iid,sourceZoneVersion:key.version,link:op.link,lifetime:key.lifetime,cards,...(op.hideaway?{hideaway:true}:{})});
  return cards.map(row=>row.card);
 }
 const selection=(ctx,op,cards)=>cards.filter(card=>!op.filter||H.genericTargetSpec({...op.filter,zone:card.zone,controller:'any'},[],0).filter(ctx.g,card,card.owner,ctx.src));
 async function choose(ctx,op,from,player=ctx.you){const need=Math.min(op.n??1,from.length),answer=await player.controller.decide(ctx.g,{type:'chooseCards',from,min:op.optional?0:need,max:need,prompt:'Choose cards for '+ctx.src.name,aiHint:{kind:op.from==='battlefield'?'exile':'bestCard',src:ctx.src}});if(!Array.isArray(answer)||new Set(answer).size!==answer.length||answer.some(card=>!from.includes(card))||answer.length>(op.n??1)||!op.optional&&answer.length!==need)throw Error('Invalid linked acquisition choice');return answer;}
 M.OracleV20.handlers.push({async effect(ctx,op){
  if(op.action==='permanent-stack-grant-v24'){
   if(ctx.src.zone!=='stack'||ctx.src.zoneVersion!==ctx.sourceZoneVersion||!ctx.g.stack.some(so=>so.kind==='spell'&&!so.isCopy&&so.card===ctx.src))return true;
   const row=ctx.src.meta.oracleStackGrantsV24;if(!row||row.version!==ctx.src.zoneVersion)ctx.src.meta.oracleStackGrantsV24={version:ctx.src.zoneVersion,operations:[]};ctx.src.meta.oracleStackGrantsV24.operations.push(op.operation);return true;
  }
  if(op.action==='permanent-linked-play-v24'){
   if(!op.condition||H.genericCondition(ctx.g,ctx.src,op.condition,ctx.you,ctx.oracleSourceCapture))for(const card of linked(ctx.g,ctx.src,op.link,ctx))await M.OracleV8PlayPermissions.castOne(ctx,[card],{free:true,playLand:true},{target:H.genericTargetSpec});return true;
  }
  if(op.action==='permanent-linked-reveal-return-v24'){for(const card of linked(ctx.g,ctx.src,op.link,ctx)){card.faceDown=false;delete card.meta.revealedTo;}await M.OracleV8Linked.run(ctx,{...op,action:'linked-return'},{});return true;}
  if(op.action!=='permanent-linked-acquire-v24')return false;
  let cards=[];
  if(op.mode==='hideaway'||op.mode==='inspect'){
   const looked=ctx.you.library.slice(-op.n).reverse(),versions=new Map(looked.map(card=>[card,card.zoneVersion]));
   if(!ctx.you.isAI&&looked.length)await ctx.you.controller.decide(ctx.g,{type:'cardReveal',player:ctx.you,cards:looked,kind:'look',private:true});
   const selected=await choose(ctx,{...op,n:1},looked),available=selected.filter(card=>card.zone==='library'&&card.zoneVersion===versions.get(card));
   await acquire(ctx,{...op,lookAllowed:true},available);let rest=looked.filter(card=>!selected.includes(card)&&card.zone==='library'&&card.zoneVersion===versions.get(card));if(op.mode==='hideaway')M.shuffle(rest,ctx.g.rnd);else if(rest.length>1){const order=await ctx.you.controller.decide(ctx.g,{type:'scry',cards:rest,player:ctx.you,prompt:'Order remaining cards on the bottom (top to bottom)'}),ordered=[...(order?.top||[]),...(order?.bottom||[])];if(ordered.length!==rest.length||new Set(ordered).size!==rest.length||ordered.some(card=>!rest.includes(card)))throw Error('Invalid linked inspection bottom order');rest=ordered.reverse();}for(const card of rest)await ctx.g.move(card,'library',{toBottom:true});return true;
  }
  if(op.mode==='target')cards=H.genericEffectSubjects(ctx,op.target);
  else if(op.mode==='select'||op.mode==='all'){
   const players=op.who==='all-graveyards'?ctx.g.alivePlayers():H.genericEffectSubjects(ctx,op.who),from=players.flatMap(player=>op.from==='battlefield'?ctx.g.bf().filter(card=>card.ctrl===player):player[op.from]||[]);cards=selection(ctx,op,from);if(op.mode==='select')cards=await choose(ctx,op,cards);
  }else if(op.mode==='reveal-hand'){
   const player=H.genericEffectSubjects(ctx,op.who)[0];if(player){const hand=player.hand.slice();await ctx.g.revealToHuman({cards:hand,ctrl:player,kind:'reveal',includeLands:true});cards=await choose(ctx,op,selection(ctx,op,hand));}
  }else if(op.mode==='opponent-choice'){
   const options=ctx.you.opponents(ctx.g);const player=options.length===1?options[0]:await ctx.you.controller.decide(ctx.g,{type:'chooseTargets',candidates:options,min:1,max:1,prompt:'Choose an opponent',aiHint:{goal:'discard'}}).then(answer=>Array.isArray(answer)?answer[0]:null);if(player)cards=await choose(ctx,op,selection(ctx,op,ctx.g.bf().filter(card=>card.ctrl===ctx.you)),player);
  }else if(op.mode==='sacrifice-unless'){
   cards=await choose(ctx,{...op,optional:true},selection(ctx,op,ctx.g.bf().filter(card=>card.ctrl===ctx.you)));if(!cards.length){if(ctx.src.zone==='battlefield'&&ctx.src.zoneVersion===binding(ctx.src,ctx).version&&ctx.src.ctrl===ctx.you)await ctx.g.sacrifice(ctx.you,ctx.src);return true;}
  }else throw Error('Unsupported linked acquisition mode');
  const moved=await acquire(ctx,op,cards);if(op.drawEqual)for(const player of H.genericEffectSubjects(ctx,op.who)){const n=moved.filter(card=>card.owner===player).length;if(n)await ctx.g.draw(player,n);}return true;
 },count(game,source,player,node){if(node.kind==='permanent-linked-count-v24')return linked(game,source,node.link).length;},condition(game,source,node,player){
  if(node.kind!=='permanent-linked-condition-v24')return undefined;
  if(node.test==='all-empty-hands')return game.alivePlayers().every(player=>player.hand.length===0);
  if(node.test==='any-small-library')return game.alivePlayers().some(player=>player.library.length<=node.n);
  if(node.test==='distinct-creature-powers')return new Set(game.creatures(player).map(card=>card.power)).size>=node.n;
  throw Error('Invalid linked play condition');
 },compile(op,script,entry,h){
  if(op.kind==='generic-trigger'&&op.event==='cast'&&op.eventFilter==='self'&&op.zone==='stack'&&JSON.stringify(op.effects).includes('"action":"grant-operation"')){
   const replace=node=>Array.isArray(node)?node.map(replace):node&&typeof node==='object'?node.action==='grant-operation'&&node.target==='self'&&node.duration==='object-v10'&&node.operation?.kind==='generic-trigger'?{action:'permanent-stack-grant-v24',operation:localStackGrant(node.operation,op.targets?.length||0)}:Object.fromEntries(Object.entries(node).map(([key,value])=>[key,replace(value)])):node;
   const effects=replace(op.effects);if(JSON.stringify(effects)!==JSON.stringify(op.effects)){h.triggers.push(h.compileGenericTrigger({...op,effects}));return true;}
  }
  if(op.kind==='generic-trigger'&&op.permanentLinkedEventTypeV24){
   for(const event of [op.event].flat()){
    const trigger=h.compileGenericTrigger({...op,event}),prior=trigger.filter,run=trigger.run,link=op.permanentLinkedEventTypeV24.link;
    trigger.filter=(game,source,data)=>{const card=data.so?.card||data.card,options=data.so?.castOpts||{};if(!card)return false;data.oracleLinkedEventTypesV24||=cardTypes.filter(type=>game.castHasType(card,options,type));return data.oracleLinkedEventTypesV24.some(type=>linked(game,source,link).some(card=>card.is(type)))&&(!prior||prior(game,source,data));};
    trigger.run=ctx=>(ctx.data?.oracleLinkedEventTypesV24||[]).some(type=>linked(ctx.g,ctx.src,link,ctx).some(card=>card.is(type)))?run(ctx):undefined;h.triggers.push(trigger);
   }return true;
  }
  if(op.kind==='permanent-linked-cost-v24'){(script.costMods||=[]).push((game,source,{player,card,castOpts={}})=>{if(!live(source)||source.ctrl!==player)return 0;const types=sharedTypes(game,source,op.link,card,castOpts);return -op.n*(op.rule==='any-shared-type'?Number(types.length>0):types.length);});return true;}
  if(op.kind==='permanent-linked-stats-v24'){script.cdaPower=script.cdaToughness=(game,source)=>linked(game,source,op.link).length;return true;}
  if(op.kind==='generic-trigger'&&op.permanentDrawStepFirstV24){const trigger=h.compileGenericTrigger(op),prior=trigger.filter;trigger.filter=(game,source,data)=>data.c1920DrawStepNth===1&&(!prior||prior(game,source,data));h.triggers.push(trigger);return true;}
  if(op.kind==='permanent-linked-mana-v24'){
   const mana=h.compileGenericMana({kind:'mana-source',produce:[{C:1}],activationMana:null,contract:'mana-source'});
   mana.produce=(game,source)=>{const cards=linked(game,source,op.link);if(op.rule==='colors')return [...new Set(cards.flatMap(card=>card.colors))].map(color=>({[color]:1}));if(op.rule==='double-colorless')return [{C:cards.length?2:1}];throw Error('Invalid linked mana rule');};h.mana.push(mana);return true;
  }
  if(op.kind==='permanent-linked-name-ban-v24'){
   (script.oracleCastingProhibitionsV9||=[]).push({players:op.players,quality:'all',matchesV12:(game,source,player,card,options={})=>{const names=linked(game,source,op.link).flatMap(card=>M.OracleV8NameGroups.names(card)),definition=game.castDefinition(card,options);return M.OracleV8NameGroups.names({card,kind:'spell',name:definition.name,oracleDefinition:definition,castOpts:options}).some(name=>names.includes(name));}});return true;
  }return false;
 }});
 const move=G.move;G.move=async function(card,to,options={}){const grants=card.zone==='stack'&&card.meta.oracleStackGrantsV24?.version===card.zoneVersion?card.meta.oracleStackGrantsV24:null,version=card.zoneVersion,result=await move.call(this,card,to,options);if(grants&&card.zoneVersion!==version){delete card.meta.oracleStackGrantsV24;if(card.zone==='battlefield')for(const operation of grants.operations)await H.runGenericEffect({g:this,src:card,you:card.ctrl,sourceZoneVersion:card.zoneVersion,targets:[]},{action:'grant-operation',target:'self',duration:'object-v10',operation});}return result;};
 const copySpell=G.copySpell;G.copySpell=function(so,player,options={}){const grants=!so.isCopy&&so.card.zone==='stack'&&so.card.meta.oracleStackGrantsV24?.version===so.card.zoneVersion?so.card.meta.oracleStackGrantsV24:null;if(grants){const base=options.oracleDefinition||so.oracleDefinition||this.castDefinition(so.card,so.castOpts||{}),triggers=grants.operations.flatMap(operation=>H.compileOracleScript({id:'oracle-v24-stack-grant-runtime'},{raw:{},implementation:[operation]}).triggers||[]);options={...options,oracleDefinition:{...base,triggers:[...(base.triggers||[]),...triggers]}};}return copySpell.call(this,so,player,options);};
 const recalc=G.recalc;G.recalc=function(...args){const result=recalc.apply(this,args);for(const row of this.oracleLinkedExiles||[])if(row.hideaway){const source=this.byIid(row.sourceIid),controller=source?.zone==='battlefield'&&source.zoneVersion===row.sourceZoneVersion?source.ctrl:source?.battlefieldLKI?.get(row.sourceZoneVersion)?.ctrl;for(const entry of row.cards)if(entry.card.zone==='exile'&&entry.card.zoneVersion===entry.zoneVersion&&entry.card.faceDown)entry.card.meta.revealedTo=[...new Set([...(entry.card.meta.revealedTo||[]),...(controller?[controller.idx]:[])])];}return result;};
 M.OracleV24Permanents={binding,records,linked,acquire,live};
})();
