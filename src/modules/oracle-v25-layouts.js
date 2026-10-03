(() => {
 const M=globalThis.MTG,H=M.OracleV20.helpers;
 const types=['Artifact','Battle','Creature','Enchantment','Land','Planeswalker'];
 const present=(owner,row)=>row.card.zone==='library'&&row.card.zoneVersion===row.version&&owner.library.includes(row.card);
 function matches(ctx,filter,card){
  if(!filter)return true;
  if(filter.alternatives){const base={...filter};delete base.alternatives;return matches(ctx,base,card)&&filter.alternatives.some(f=>matches(ctx,f,card));}
  const base={...filter,zone:'graveyard',controller:'any'};delete base.hasXManaV25;delete base.hasAdventureV25;delete base.evenMVV25;
  return H.genericTargetSpec(base,[],0,{...ctx.data,oracleX:ctx.so?.x??ctx.x,oracleSourceCapture:ctx.oracleSourceCapture||{zoneVersion:ctx.sourceZoneVersion}}).filter(ctx.g,card,ctx.you,ctx.src)&&(!filter.hasXManaV25||/\{X\}/.test(card.def.cost||''))&&(!filter.hasAdventureV25||!!card.def.adventure)&&(!filter.evenMVV25||card.mv%2===0)&&(!filter.cardTypeV25||card.is(filter.cardTypeV25))&&(!filter.exactColorsV25||card.colors.length===filter.exactColorsV25.length&&filter.exactColorsV25.every(color=>card.colors.includes(color)));
 }
 async function millCohort(ctx,e){
  const owners=e.who==='each-player'?ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you):e.who==='you'?[ctx.you]:H.genericEffectSubjects(ctx,e.who),records=new Map(),prior=ctx.g.move;
  if(e.shuffle)for(const p of owners)M.shuffle(p.library,ctx.g.rnd);
  ctx.g.move=async function(card,destination,...args){const from=card.zone,version=card.zoneVersion,owner=card.owner,stats={power:card.power,mv:card.mv,types:card.def.types?.slice()||[],subtypes:card.def.subtypes?.slice()||[]},result=await prior.call(this,card,destination,...args);if(from==='library'&&owners.includes(owner)&&card.zoneVersion>version&&['graveyard','exile','battlefield','stack','command'].includes(card.zone))records.set(card,{card,version:card.zoneVersion,zone:card.zone,stats});return result;};
  try{await ctx.g.withGraveyardEntryBatch(async()=>{for(const owner of owners)await ctx.g.mill(owner,Math.max(0,Math.floor(H.genericAmount(e.n,ctx))));});}finally{ctx.g.move=prior;}
  const current=r=>r.card.zone===r.zone&&r.card.zoneVersion===r.version&&(r.zone==='battlefield'?ctx.g.bf().includes(r.card):r.zone==='stack'?ctx.g.stack.some(s=>s.card===r.card):r.card.owner[r.zone]?.includes(r.card)),rows=[...records.values()],pool=rows.filter(r=>current(r)&&!r.card.faceDown&&matches(ctx,e.filter,r.card)&&(e.destination!=='battlefield'||types.some(t=>r.card.is(t))));
  const maximum=e.max==='all'?pool.length:Math.max(0,Math.min(pool.length,H.genericAmount(e.max,ctx))),minimum=e.required?maximum:0;
  let chosen=[];if(maximum){const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:pool.map(r=>r.card),min:minimum,max:maximum,prompt:'Choose cards from the actual milled cohort',aiHint:{kind:'bestCard',src:ctx.src}});if(!Array.isArray(answer)||answer.length<minimum||answer.length>maximum||new Set(answer).size!==answer.length||answer.some(c=>!pool.some(r=>r.card===c&&current(r))))throw Error('Invalid milled-cohort selection');chosen=answer.map(c=>pool.find(r=>r.card===c));}
  let moved=0;const returned=[];
  await ctx.g.withBattlefieldEntryBatch(async()=>{for(const r of chosen){if(!current(r))continue;const v=r.version;if(e.destination==='battlefield')await ctx.g.putPermanentOntoBattlefield(r.card,ctx.you,{tapped:!!e.tapped});else await ctx.g.move(r.card,e.destination==='top'?'library':e.destination);if(r.card.zoneVersion!==v)moved++;
   if(e.destination==='top'&&r.card.zone==='library'&&r.card.zoneVersion===v+1)returned.push(r.card);
   if(e.destination==='battlefield'&&r.card.zone==='battlefield'&&r.card.zoneVersion===v+1){const c=r.card,newVersion=c.zoneVersion;if(e.haste)c.meta.oracleHaste=true;if(e.delayed)ctx.g.delayed.push({on:'endStep',once:true,src:ctx.src,ctrl:ctx.you,name:'Milled creature returns',run:async next=>{if(c.zone==='battlefield'&&c.zoneVersion===newVersion)await next.g.move(c,e.delayed);}});}
  }});
  if(returned.length>1){const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:returned,min:returned.length,max:returned.length,prompt:'Order returned milled cards, top first',aiHint:{kind:'orderBottom'}});if(!Array.isArray(answer)||answer.length!==returned.length||new Set(answer).size!==returned.length||answer.some(c=>!returned.includes(c)))throw Error('Invalid returned milled order');for(const c of returned)c.owner.library.splice(c.owner.library.indexOf(c),1);ctx.you.library.push(...answer.slice().reverse());}
  if(!moved&&e.elseEffects)await H.runGenericEffects(ctx,e.elseEffects);
  if(e.lessonLife&&rows.some(r=>r.stats.subtypes.includes('Lesson')))await ctx.g.gainLife(ctx.you,e.lessonLife,ctx.src);
  ctx.g.recalc();return {rows,chosen,moved};
 }
 async function cards(ctx,owner,chooser,rows,min,max,prompt){
  const pool=rows.filter(row=>present(owner,row));if(!pool.length)return [];
  const answer=await chooser.controller.decide(ctx.g,{type:'chooseCards',from:pool.map(r=>r.card),min:Math.min(min,pool.length),max:Math.min(max,pool.length),prompt,aiHint:{kind:'bestCard',src:ctx.src}});
  if(!Array.isArray(answer)||answer.length<Math.min(min,pool.length)||answer.length>Math.min(max,pool.length)||new Set(answer).size!==answer.length||answer.some(card=>!pool.some(r=>r.card===card&&present(owner,r))))throw Error('Invalid locked library choice');
  return answer.map(card=>pool.find(row=>row.card===card));
 }
 async function order(ctx,owner,chooser,rows,place,random){
  const current=rows.filter(r=>present(owner,r));let arranged=current.map(r=>r.card);
  if(random)M.shuffle(arranged,ctx.g.rnd);
  else if(arranged.length>1)arranged=(await cards(ctx,owner,chooser,current,current.length,current.length,'Order the inspected '+place+' cards')).map(r=>r.card);
  arranged=arranged.filter(c=>current.some(r=>r.card===c&&present(owner,r)));
  for(const c of arranged)owner.library.splice(owner.library.indexOf(c),1);
  if(place==='top')owner.library.push(...arranged.slice().reverse());else owner.library.unshift(...arranged.slice().reverse());
 }
 async function process(ctx,e,owner,chooser){
  const relation=(r,c)=>{if(r.sharesTargetTypeV25===undefined)return true;const saved=ctx._oracleTargetControllers?.[r.sharesTargetTypeV25]?.[0],stats=saved?.snapshotV10;if(!stats)return false;return (stats.types||stats.def?.types||[]).some(type=>types.concat(['Instant','Sorcery','Kindred']).includes(type)&&c.is(type));};
  const winThreshold=e.winLibraryAtMostV25===undefined?null:H.genericAmount(e.winLibraryAtMostV25,ctx);
  let top=[],n;if(e.until){n=Math.max(0,Math.floor(H.genericAmount(e.until.n,ctx)));let found=0;if(n)for(const c of owner.library.slice().reverse()){top.push(c);if(matches(ctx,e.until.filter,c)&&relation(e.until,c))found++;if(found>=n)break;}}
  else {n=Math.max(0,Math.floor(H.genericAmount(e.n,ctx)));top=n?owner.library.slice(-n).reverse():[];}
  const inspected=top.map(card=>({card,version:card.zoneVersion,power:card.power,mv:card.mv,legendary:card.def.super?.includes('Legendary'),types:card.def.types?.slice()||[]})),claimed=new Set(),selected=[],graveyard=[];
  if(e.visibility==='reveal')await ctx.g.revealToHuman({cards:top,ctrl:chooser,kind:'reveal'});
  else if(e.visibility==='look'&&!chooser.isAI&&top.length)await chooser.controller.decide(ctx.g,{type:'cardReveal',player:chooser,cards:top,kind:'look',private:true});
  else if(e.visibility!=='look')throw Error('Unknown library program visibility');
  const choose=async s=>{
   const eligible=inspected.filter(r=>present(owner,r)&&!claimed.has(r.card)&&matches(ctx,s.filter,r.card)&&relation(s,r.card)&&(s.destination!=='battlefield'||types.some(type=>r.card.is(type))));
   const maximum=s.max==='all'?eligible.length:Math.max(0,Math.min(eligible.length,H.genericAmount(s.max,ctx))),minimum=s.required?maximum:0;
   let chosen=[];if(maximum&&s.allOrNone){const answer=await chooser.controller.decide(ctx.g,{type:'chooseOption',options:[{key:'yes',label:'Move all eligible cards'},{key:'no',label:'Decline'}],prompt:'Move all eligible library cards?',aiHint:{kind:'optTrigger',src:ctx.src}});if(!['yes','no'].includes(answer))throw Error('Invalid library all-or-none choice');if(answer==='yes')chosen=eligible;}
   else if(maximum)chosen=await cards(ctx,owner,chooser,eligible,minimum,maximum,'Choose library cards for '+s.destination);
   for(const r of chosen)claimed.add(r.card);
   if(s.reveal&&chosen.length)await ctx.g.revealToHuman({cards:chosen.map(r=>r.card),ctrl:chooser,kind:'reveal'});
   selected.push({selection:s,rows:chosen});return chosen;
  };
  for(const s of e.selections)await choose(s);
  const move=async(r,destination,opts={})=>{if(!present(owner,r))return false;const v=r.version;if(destination==='battlefield')await ctx.g.putPermanentOntoBattlefield(r.card,opts.ctrl||owner,opts);else await ctx.g.move(r.card,destination);if(destination==='graveyard'&&r.card.zone==='graveyard'&&r.card.zoneVersion===v+1)graveyard.push(r);return r.card.zoneVersion!==v;};
  for(const destination of ['hand','exile'])for(const item of selected.filter(i=>i.selection.destination===destination))for(const r of item.rows)await move(r,destination);
  await ctx.g.withGraveyardEntryBatch(async()=>{for(const item of selected.filter(i=>i.selection.destination==='graveyard'))for(const r of item.rows)await move(r,'graveyard');});
  let battlefieldMoved=false;
  await ctx.g.withBattlefieldEntryBatch(async()=>{for(const item of selected.filter(i=>i.selection.destination==='battlefield'))for(const r of item.rows){const s=item.selection,opts={tapped:!!s.tapped,additionalCounters:s.additionalCountersV25,additionalCounterBy:ctx.you,ctrl:s.controller==='you'?ctx.you:owner};
   if(s.attackingV25&&ctx.g.combat&&ctx.g.turnPlayer===opts.ctrl){opts.attacking=s.attackingV25==='event-player'?H.genericEffectSubjects(ctx,'event-player')[0]:await ctx.g.chooseAttackingDestination(opts.ctrl,null,r.card,ctx.src.name);}
   const moved=await move(r,'battlefield',opts);battlefieldMoved||=moved;
   if(r.card.zone==='battlefield'&&r.card.zoneVersion===r.version+1&&s.keywordsV25?.length)ctx.g.untilEffects.push({kind:'oracleSourcePump',expires:'eot',iid:r.card.iid,zoneVersion:r.card.zoneVersion,timestamp:ctx.g.nextOracleTimestamp(),power:0,toughness:0,keywords:s.keywordsV25});
  }});
  if(e.fallbackHandV25&&!battlefieldMoved){const picked=await choose({max:1,required:true,destination:'hand'});for(const r of picked)await move(r,'hand');}
  for(const item of selected.filter(i=>['top','bottom'].includes(i.selection.destination)))await order(ctx,owner,chooser,item.rows,item.selection.destination,!!item.selection.random);
  const reserved=new Set(selected.filter(i=>['top','bottom'].includes(i.selection.destination)).flatMap(i=>i.rows.map(r=>r.card))),rest=inspected.filter(r=>present(owner,r)&&!reserved.has(r.card));
  if(e.rest.destination==='graveyard')await ctx.g.withGraveyardEntryBatch(async()=>{for(const r of rest)await move(r,'graveyard');});
  else if(['hand','exile'].includes(e.rest.destination))for(const r of rest)await move(r,e.rest.destination);
  else if(e.rest.destination==='shuffle')M.shuffle(owner.library,ctx.g.rnd);
  else if(['top','bottom'].includes(e.rest.destination))await order(ctx,owner,chooser,rest,e.rest.destination,!!e.rest.random);
  else if(e.rest.destination!=='stay')throw Error('Unknown library program rest destination');
  if(e.selectedLegendaryLifeV25)for(const item of selected)for(const r of item.rows)if(r.legendary)await ctx.g.gainLife(ctx.you,e.selectedLegendaryLifeV25,ctx.src);
  if(e.graveyardGreatestPowerLifeV25){const creatures=graveyard.filter(r=>r.types.includes('Creature'));if(creatures.length)await ctx.g.gainLife(ctx.you,Math.max(0,...creatures.map(r=>r.power)),ctx.src);}
  if(e.revealedCountDamageV25)await H.runGenericEffects(ctx,[{action:'damage',target:'you',n:top.length}]);
  if(winThreshold!==null&&winThreshold>=owner.library.length)await H.runGenericEffects(ctx,[{action:'win-game-v9'}]);
  ctx.g.recalc();return {inspected,selected,graveyard};
 }
 const handler={layoutsV25:true,compile(op,script,entry,h){
  if(op.kind==='generic-trigger'&&op.eventFilter?.kind==='attack-player-land-count-v25'){
   const trigger=h.compileGenericTrigger({...op,eventFilter:'self'}),prior=trigger.filter;
   trigger.filter=(game,source,data)=>prior(game,source,data)&&data.card?.attacking instanceof M.Player&&game.lands(data.card.attacking).length>=op.eventFilter.min;
   const prepare=trigger.prepareTargets;trigger.prepareTargets=async ctx=>{const player=ctx.data.card?.attacking,result=prepare?await prepare(ctx):undefined;ctx.oracleSourceCapture={...ctx.oracleSourceCapture,eventPlayer:player};return result;};
   h.triggers.push(trigger);return true;
  }
  if(op.kind==='grant-native-activation-v25'){
   const equip=op.ability==='equip'?{label:'Equip '+op.cost,cost:{mana:op.cost},equip:true,targets:[M.T.yourCreature()],cond:(g,s,p)=>g.c1719EquipTiming?.(p)??(g.turnPlayer===p&&!g.stack.length&&['main1','main2'].includes(g.phase)),run:async ctx=>{if(H.sameBattlefieldSource(ctx)&&ctx.targets[0])await ctx.g.attach(ctx.src,ctx.targets[0]);}}:null;
   h.statics.push({phase:2,oracleOperation:op,apply:(g,source,bf)=>{for(const c of bf)if(c.ctrl===source.ctrl&&c.hasSub(op.subtype)){if(equip)c.cur.extraAbilities.push(equip);else(c.cur.oracleCrewGrantedV25||=[]).push(op.cost);}}});return true;
  }
  return false;
 },async effect(ctx,e){
  if(e.action==='library-category-v25'){
   const categories=e.category==='card-type'?['Artifact','Battle','Conspiracy','Creature','Dungeon','Enchantment','Instant','Kindred','Land','Phenomenon','Plane','Planeswalker','Scheme','Sorcery','Vanguard']:e.category==='cast-noncreature-types'?[...new Set((ctx.you.turnState.spellsCastList||[]).filter(row=>!(row.types||[]).includes('Creature')).flatMap(row=>row.types||[]))]:['W','U','B','R','G'].flatMap((a,i,all)=>all.slice(i+1).map(b=>[a,b]));
   const selections=categories.map(category=>({filter:{what:'card',zone:'graveyard',controller:'you',...(e.category!=='color-pair'?{cardTypeV25:category}:{exactColorsV25:category})},max:1,required:e.required,destination:'hand',reveal:false}));
   await process(ctx,{...e,action:'library-program-v25',selections,rest:{destination:'bottom',random:true}},ctx.you,ctx.you);return true;
  }
  if(e.action==='mill-cohort-v25'){await millCohort(ctx,e);return true;}
  if(e.action==='counter-choice-v25'){for(const c of H.genericEffectSubjects(ctx,e.target)){if(c.zone!=='battlefield')continue;const version=c.zoneVersion,answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',options:e.choices.map(key=>({key,label:key})),prompt:'Choose the keyword counter',aiHint:{kind:'mode',src:ctx.src}});if(!e.choices.includes(answer))throw Error('Invalid keyword counter choice');if(c.zone==='battlefield'&&c.zoneVersion===version)ctx.g.addCounters(c,answer,1,false,ctx.you);}return true;}
  if(e.action==='return-front-source-v25'){if(H.sameBattlefieldSource(ctx)&&ctx.src.oracleFaces?.layout==='transform'){const card=ctx.src,v=card.zoneVersion;await ctx.g.move(card,'exile');if(card.zone==='exile'&&card.zoneVersion===v+1&&!card.isToken)await ctx.g.putPermanentOntoBattlefield(card,e.controller==='you'?ctx.you:card.owner,{oracleFace:'front'});}return true;}
  if(e.action==='library-kind-until-v25'){const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',options:e.choices.map(key=>({key,label:key==='land'?'Land':'Nonland'})),prompt:'Choose the card kind to reveal',aiHint:{kind:'mode',src:ctx.src}});if(!e.choices.includes(answer))throw Error('Invalid reveal kind');const filter={what:answer==='land'?'land':'card',...(answer==='nonland'?{notType:'Land'}:{}),zone:'graveyard',controller:'you',min:1};await process(ctx,{action:'library-program-v25',until:{n:1,filter},visibility:'reveal',selections:[{filter,max:'all',required:true,destination:e.destination,reveal:false}],rest:{destination:'bottom',random:e.rest==='bottom-random'}},ctx.you,ctx.you);return true;}
  if(e.action!=='library-program-v25')return false;
  const owners=e.who===undefined||e.who==='you'?[ctx.you]:H.genericEffectSubjects(ctx,e.who);
  for(const owner of owners.filter(p=>p instanceof M.Player))await process(ctx,e,owner,e.chooser==='owner'?owner:ctx.you);
  return true;
 }};
 M.OracleV20.handlers.push(handler);M.OracleV25Layouts={run:handler.effect,process,millCohort,matches};
 const list=M.Game.prototype.activatableList,activate=M.Game.prototype.activateAbility;
 M.Game.prototype.activatableList=function(p,...args){const out=list.call(this,p,...args);for(const c of this.bf())if(c.ctrl===p&&!c.cur?.activationDisabled)for(const n of new Set(c.cur?.oracleCrewGrantedV25||[])){const power=this.creatures(p).filter(x=>x!==c&&!x.tapped&&!x.cur?.cantCrewV14).reduce((sum,x)=>sum+Math.max(0,this.vehicleCrewPower(x)),0);if(power>=n&&this.canPayMana(p,this.abilityManaCost(p,c,'{0}',{ability:{crew:true}}),{card:c,isAbility:true}))out.push({card:c,crew:true,oracleGrantedCrewV25:n});}return out;};
 M.Game.prototype.activateAbility=async function(p,entry,...args){if(entry?.oracleGrantedCrewV25===undefined)return activate.call(this,p,entry,...args);const c=entry.card,n=entry.oracleGrantedCrewV25;if(c.zone!=='battlefield'||c.ctrl!==p||c.cur?.activationDisabled||!c.cur?.oracleCrewGrantedV25?.includes(n))return false;const own=Object.prototype.hasOwnProperty.call(this,'vehicleCrewCost'),previous=this.vehicleCrewCost;this.vehicleCrewCost=function(card){return card===c?n:previous.call(this,card);};try{return await activate.call(this,p,entry,...args);}finally{if(own)this.vehicleCrewCost=previous;else delete this.vehicleCrewCost;}};
})();
