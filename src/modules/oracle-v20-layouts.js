(() => {
 const M=globalThis.MTG,V=M.OracleV20,H=V.helpers;
 const designation=(card,key,fallback)=>card.meta[key]?.version===card.zoneVersion?card.meta[key].value:fallback;
 const level=card=>designation(card,'oracleClassLevelV20',1);
 const solved=card=>designation(card,'oracleCaseSolvedV20',false);
 const set=(card,key,value)=>{card.meta[key]={version:card.zoneVersion,value};};
 const metadata=new Set(['oracleBatch','oracleId','oracleImplemented','semanticClass','implementedKeywords','oracleContracts','oracleImplementation','kws']);
 function gate(script,body,active){
  for(const [key,value] of Object.entries(body)){
   if(metadata.has(key))continue;
   if(['statics','triggers','abilities'].includes(key)){
    const property=key==='triggers'?'filter':'cond';
    (script[key]||=[]).push(...value.map(item=>{const previous=item[property];return {...item,[property]:(g,c,...args)=>active(g,c)&&(!previous||previous(g,c,...args))};}));
   }else if(key==='mana'){
    const current=script.mana?(Array.isArray(script.mana)?script.mana:[script.mana]):[];
    const incoming=(Array.isArray(value)?value:[value]).map(item=>({...item,cond:(g,c,...args)=>active(g,c)&&(!item.cond||item.cond(g,c,...args))}));
    script.mana=current.concat(incoming);
   }else if(key==='producesColors'){
    // Potential mana colors are an AI hint; each actual mana ability retains
    // its tier condition above, including for mana-source discovery/payment.
    script.producesColors=[...new Set([...(script.producesColors||[]),...value])];
   }else if(key==='oracleTriggerDoublersV20'){
    (script[key]||=[]).push(...value.map(fn=>(g,c,...args)=>active(g,c)&&fn(g,c,...args)));
   }else if(key==='plusCountersAdjust'){
    const previous=script[key];script[key]=(n,g,card,self)=>{n=previous?.(n,g,card,self)??n;return active(g,self)?value(n,g,card,self):n;};
   }else if(key==='noMaxHand'){
    const previous=script[key];script[key]=(g,c)=>M.oracleLibraryFlagV20(previous,g,c)||active(g,c)&&M.oracleLibraryFlagV20(value,g,c);
   }else if(key==='oracleHandSizeRules'){
    (script[key]||=[]).push(...value.map(rule=>({...rule,activeV20:active})));
   }else if(key==='oracleCastPermissionsV20'){
    (script[key]||=[]).push(...value.map(rule=>({...rule,activeV20:(g,c,p)=>active(g,c)&&(!rule.activeV20||rule.activeV20(g,c,p))})));
   }else if(key==='replace'){
    (script.replace||=[]).push(...value.map(rule=>({...rule,applies:(g,...args)=>{
     const source=['createToken','lifegain'].includes(rule.event)?args[2]:args[1];
     return active(g,source)&&(!rule.applies||rule.applies(g,...args));
    }})));
   }else if(key==='costMods'){
    (script.costMods||=[]).push(...value.map(fn=>(g,c,...args)=>active(g,c)?fn(g,c,...args):0));
   }else if(key==='abilityCostReduction'){
    const previous=script[key];script[key]=(g,c,...args)=>(typeof previous==='function'?previous(g,c,...args):previous||0)+(active(g,c)?typeof value==='function'?value(g,c,...args):value||0:0);
   }else if(key==='playTop'){
    const previous=script.playTop;script.playTop=(g,c,...args)=>!!previous?.(g,c,...args)||active(g,c)&&value(g,c,...args);
   }else if(['revealOwnTop','revealAllTop','oracleRevealAllLibrariesV17'].includes(key)){
    const previous=script[key];script[key]=(g,c)=>M.oracleLibraryFlagV20(previous,g,c)||active(g,c)&&M.oracleLibraryFlagV20(value,g,c);
   }else if(key==='additionalLandPlays'){
    const previous=script[key];script[key]=(g,c,p)=>(typeof previous==='function'?previous(g,c,p):previous||0)+(active(g,c)?typeof value==='function'?value(g,c,p):value:0);
   }else throw new Error('Oracle staged rules cannot gate '+key);
  }
  if(body.kws?.length)(script.statics||=[]).push({apply:(g,c)=>{if(active(g,c))for(const kw of body.kws)c.cur.kw.add(kw);}});
 }
 V.compileStagedV20=(batch,entry,compile)=>{
  const flip=entry.implementation?.find(op=>op.kind==='flip-faces-v20');
  if(flip){
   const [front,back]=flip.faces,base=compile({...entry,...front,raw:{...front.raw,name:entry.raw.name}});
   const backScript=compile({...entry,...back}),backRaw={...back.raw,cost:front.raw.cost,colorsOverride:M.colorsOfCost(front.raw.cost||'')};
   const definition=M.buildDefs({[backRaw.name]:backRaw},{[backRaw.name]:backScript},{registerTypes:false})[backRaw.name];
   base.c1719FlipBack={...Object.fromEntries(Object.keys(base).map(key=>[key,undefined])),...definition};
   return {...base,oracleImplementation:entry.implementation,oracleContracts:entry.oracleContracts,oracleStagedV20:'flip-faces-v20'};
  }
  const operation=entry.implementation?.find(op=>['class-levels-v20','case-solved-v20','station-tiers-v20','room-doors-v20'].includes(op.kind));
  if(!operation)return null;
  const base=compile({...entry,implementation:entry.implementation.filter(op=>op!==operation)});
  const compilePart=part=>compile({...entry,...part,oracleContracts:part.oracleContracts||[]});
  if(operation.kind==='room-doors-v20'){
   base.oracleRoomV20=true;
   base.bdfRoom=operation.doors.map(({key,name,cost})=>({key,name,cost}));
   base.altCosts=base.bdfRoom.map(door=>({label:'Cast '+door.name+' '+door.cost,altCostStr:door.cost,bdfDoor:door.key}));
   base.asEnters=(g,c)=>{const key=c.castMeta?.wasCast||c.castMeta?.bdfSpellCopy?c.castMeta.alt?.bdfDoor:null;c.meta.bdfUnlocked=key?[key]:[];};
   for(const door of operation.doors){
    const body=compilePart(door);
    for(const trigger of body.triggers||[])if(trigger.on==='unlockDoor'){const prior=trigger.filter;trigger.filter=(g,c,d)=>d.key===door.key&&(!prior||prior(g,c,d));}
    gate(base,body,(g,c)=>c.meta.bdfUnlocked?.includes(door.key));
   }
  }else if(operation.kind==='station-tiers-v20'){
   const threshold=operation.tiers.at(-1).min;
   const station=compile({...entry,implementation:[{kind:'mechanic-station-v9',threshold,contract:'mechanic-station-v9'}],implementedKeywords:[]});
   base.stationCreatureAt=threshold;
   (base.abilities||=[]).push(...station.abilities);
   if(operation.creature)base.dynTypes=station.dynTypes;
   for(const tier of operation.tiers)gate(base,compilePart(tier),(g,c)=>(c.counters.charge||0)>=tier.min);
  }else if(operation.kind==='class-levels-v20'){
   for(const stage of operation.levels){
    gate(base,compilePart(stage),(g,c)=>level(c)>=stage.level);
    for(const op of stage.levelTriggers){
     const trigger=H.compileGenericTrigger({...op,event:'oracleClassLevelV20'}),prior=trigger.filter;
     (base.triggers||=[]).push({...trigger,filter:(g,c,d)=>d.level===stage.level&&(!prior||prior(g,c,d))});
    }
    (base.abilities||=[]).push({label:'Level '+stage.level+' '+stage.cost,cost:{mana:stage.cost},sorcery:true,
     cond:(g,c)=>level(c)===stage.level-1,aiScore:()=>3,
     run:async ctx=>{if(!H.sameBattlefieldSource(ctx)||level(ctx.src)!==stage.level-1)return;set(ctx.src,'oracleClassLevelV20',stage.level);ctx.g.recalc();await ctx.g.emit('oracleClassLevelV20',{card:ctx.src,player:ctx.you,level:stage.level});}});
   }
  }else{
   gate(base,compilePart(operation),(g,c)=>solved(c));
   (base.triggers||=[]).push({on:'endStep',desc:'Solve this Case',
    filter:(g,c,d)=>d.player===c.ctrl&&!solved(c)&&H.genericCondition(g,c,operation.condition,c.ctrl,d),
    run:async ctx=>{if(!H.sameBattlefieldSource(ctx)||solved(ctx.src)||!H.genericCondition(ctx.g,ctx.src,operation.condition,ctx.you,ctx.data))return;set(ctx.src,'oracleCaseSolvedV20',true);ctx.g.recalc();await ctx.g.emit('oracleCaseSolvedV20',{card:ctx.src,player:ctx.you});}});
  }
  return {...base,oracleImplementation:entry.implementation,oracleContracts:entry.oracleContracts,oracleStagedV20:operation.kind};
 };
 V.classLevel=level;V.caseSolved=solved;
 M.oracleLibraryFlagV20=(value,game,source)=>typeof value==='function'?value(game,source):!!value;
 V.handlers.push({compile(operation,script){if(operation.kind!=='cast-disturb-v20')return false;script.bomDisturb=operation.cost;return true;},async effect(ctx,effect){
  if(effect.action==='return-transformed-v20'){
   if(H.sameBattlefieldSource(ctx)&&ctx.src.oracleFaces?.layout==='transform'){
    const card=ctx.src,version=card.zoneVersion;await ctx.g.move(card,'exile');
    if(card.zone==='exile'&&card.zoneVersion===version+1&&!card.isToken)await ctx.g.move(card,'battlefield',{ctrl:effect.controller==='you'?ctx.you:card.owner,oracleFace:'back'});
   }return true;
  }
  if(effect.action!=='flip-permanent-v20')return false;if(H.sameBattlefieldSource(ctx)){ctx.src.meta.c1719Flipped=true;ctx.g.recalc();}return true;
 }});
 // Unlocking is a special action with a printed mana payment, so it bypasses
 // activated-ability taxes, prohibitions, copying, and the Stack.
 const G=M.Game.prototype,list=G.activatableList,activate=G.activateAbility;
 const roomTiming=(g,p)=>g.turnPlayer===p&&!g.stack.length&&['main1','main2'].includes(g.phase);
 const roomDoor=(g,p,c,key,version)=>c?.def.oracleRoomV20&&c.zone==='battlefield'&&!c.phasedOut&&c.ctrl===p&&c.zoneVersion===version&&roomTiming(g,p)&&!c.meta.bdfUnlocked?.includes(key)&&c.def.bdfRoom.find(h=>h.key===key);
 G.activatableList=function(p,...args){const out=list.call(this,p,...args);if(roomTiming(this,p))for(const c of this.bf())if(c.def.oracleRoomV20&&c.ctrl===p)for(const door of c.def.bdfRoom)if(roomDoor(this,p,c,door.key,c.zoneVersion)&&this.canPayMana(p,M.parseCost(door.cost),{card:c,isSpecialAction:true,oracleUnlockRoomV20:true}))out.push({card:c,oracleUnlockRoomV20:door.key,oracleRoomVersionV20:c.zoneVersion,label:'Unlock '+door.name+' '+door.cost});return out;};
 G.activateAbility=async function(p,entry,...args){
  if(!entry.oracleUnlockRoomV20)return activate.call(this,p,entry,...args);
  const c=entry.card,door=roomDoor(this,p,c,entry.oracleUnlockRoomV20,entry.oracleRoomVersionV20);if(!door)return false;
  if(!await this.payMana(p,M.parseCost(door.cost),{card:c,isSpecialAction:true,oracleUnlockRoomV20:true}))return false;
  if(roomDoor(this,p,c,door.key,entry.oracleRoomVersionV20)){(c.meta.bdfUnlocked||=[]).push(door.key);this.recalc();await this.emit('unlockDoor',{card:c,key:door.key,ctrl:p});}
  this.note('specialAction',{card:c,player:p});await this.checkSBA();await this.flushTriggers();return true;
 };
})();
