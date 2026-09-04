((M)=>{
 const actions=new Set(['copy-stack-v8','delay-stack-copy-v8']);
 function sourceView(object){
  const source=object.srcCard||object.ctx?.src;if(!source)return null;
  const version=object.ctx?.sourceZoneVersion??object.ctx?.oracleSourceCapture?.zoneVersion;
  if(source.zone==='battlefield'&&(version===undefined||source.zoneVersion===version))return source;
  return source.battlefieldLKI?.get(version)|| (object.ctx?.data?.card===source?object.ctx.data.snap:null)||source;
 }
 function targetSpec(target,effects=[],index,helpers={}){
  if(target.zone==='stack'&&target.what==='permanent'&&target.alternatives?.length&&target.alternatives.every(child=>child.zone==='stack')){
   const children=target.alternatives.map(child=>helpers.target(child,effects,index));
   return {what:'ability',zone:'stack',min:target.min??1,count:target.max??1,aiHint:{goal:effects.some(effect=>effect.action==='copy-stack-v8'&&effect.target===index)?'copy-stack':'counter'},filter:(game,object,controller,source)=>{
    if(target.controller==='you'&&object.ctrl!==controller||target.controller==='opponent'&&object.ctrl===controller)return false;
    return children.some(spec=>spec.filter(game,object,controller,source));
   }};
  }
  if(target.what!=='stack-ability'||target.zone!=='stack')return null;
  if(!Array.isArray(target.abilityKinds)||!target.abilityKinds.length||target.abilityKinds.some(kind=>!['ability','trigger'].includes(kind))||target.sourceQuality&&!['colorless','Creature','Enchantment'].includes(target.sourceQuality))throw new Error('Unsupported Stack ability target');
  return {what:'ability',zone:'stack',min:target.min??1,count:1,prompt:'Choose an ability to copy',aiHint:{goal:effects.some(effect=>effect.action==='copy-stack-v8'&&effect.target===index)?'copy-stack':'counter'},filter:(game,object,controller)=>{
   if(!target.abilityKinds.includes(object?.kind)||!object.ctx||typeof object.run!=='function')return false;
   if(target.controller==='you'&&object.ctrl!==controller||target.controller==='opponent'&&object.ctrl===controller)return false;
   if(!target.sourceQuality)return true;
   const source=sourceView(object);if(!source)return false;
   return target.sourceQuality==='colorless'?source.colors?.length===0:source.is?source.is(target.sourceQuality):source.types?.includes(target.sourceQuality);
  }};
 }
 async function run(ctx,effect,helpers){
  if(effect.action==='delay-stack-copy-v8'){
   if(effect.filter?.zone!=='stack'||effect.filter.what!=='spell'||effect.retarget!==true)throw new Error('Unsupported delayed Stack copy');
   const n=helpers.amount(effect.n,ctx);if(!Number.isInteger(n)||n<0)throw new Error('Invalid delayed Stack copy amount');
   const spec=helpers.target(effect.filter,[],0);
   ctx.g.delayed.push({on:'cast',src:ctx.src,ctrl:ctx.you,name:ctx.src.name+' — copy next spell',once:true,expires:'eot',
    filter:(game,data)=>data.player===ctx.you&&spec.filter(game,data.so,ctx.you,ctx.src),
    run:async next=>M.OracleV8StackCopy.run(next,{action:'copy-stack-v8',target:'event-stack-object-v8',kind:'spell',n,retarget:true},helpers)});
   return;
  }
  if(effect.action!=='copy-stack-v8'||!['spell','ability','either'].includes(effect.kind)||typeof effect.retarget!=='boolean'||!(typeof effect.target==='number'||effect.target==='event-stack-object-v8'))throw new Error('Unsupported Stack copy');
  const objects=effect.target==='event-stack-object-v8'?[ctx.data?.so||ctx.data?.stackObject]:helpers.subjects(ctx,effect.target);
  const n=helpers.amount(effect.n,ctx);if(!Number.isInteger(n)||n<0)throw new Error('Invalid Stack copy amount');
  for(const object of objects.filter(Boolean)){
   if(!ctx.g.stack.includes(object))continue;
   if(object.kind==='spell'&&effect.kind!=='ability')for(let i=0;i<n;i++)await ctx.g.copySpell(object,ctx.you,{mayNewTargets:effect.retarget,copySource:ctx.src,...(effect.modifications?{oracleDefinition:M.OracleV8Copies.modifiedDefinition(object.oracleDefinition||object.card.def,effect.modifications,{})}:{})});
   else if(['ability','trigger'].includes(object.kind)&&effect.kind!=='spell')for(let i=0;i<n;i++)await ctx.g.copyStackAbility(object,ctx.you,{mayNewTargets:effect.retarget});
  }
 }
 function triggerFilter(event,rule,helpers={}){
  if(event==='cast'&&rule?.kind==='stack-copy-cast-v8'){
   const spec=rule.target?helpers.target(rule.target,[],0):null;
   return (game,source,data)=>{
    if(data.player!==source.ctrl||data.so?.kind!=='spell')return false;
    if(spec&&!spec.filter(game,data.so,source.ctrl,source))return false;
    if(rule.adventure&&!data.so.castOpts?.adventure)return false;
    if(rule.sourceAttacking&&!source.attacking)return false;
    const targets=(data.so.targets||[]).flat().filter(Boolean);
    if(rule.selfTargetOnly&&(!targets.length||targets.some(target=>target!==source)))return false;
    return true;
   };
  }
  if(event!=='abilityActivated'||rule?.kind!=='stack-copy-activation-v8')return null;
  return (game,source,data)=>{
   const object=data?.stackObject;if(data.isMana||object?.kind!=='ability')return false;
   if(!rule.attached&&data.player!==source.ctrl)return false;
   const view=sourceView(object);if(!view)return false;
   if(rule.attached){
    const attachedNow=source.attachedTo===data.card?.iid&&data.card.zone==='battlefield'&&data.card.zoneVersion===object.ctx.sourceZoneVersion;
    if(!attachedNow&&!view.attachments?.includes(source.iid))return false;
   }
   if(rule.sourceTypes&&!rule.sourceTypes.some(type=>view.is?view.is(type):view.types?.includes(type)))return false;
   if(rule.sourceSubtype&&!(view.hasSub?view.hasSub(rule.sourceSubtype):view.subtypes?.includes(rule.sourceSubtype)))return false;
   if(rule.loyalty&&data.ability?.loyalty===undefined)return false;
   if(rule.sacrificed&&!object.ctx.sacdSelf&&!object.ctx.sacd?.length)return false;
   return true;
  };
 }
 M.OracleV8StackCopy={actions,run,targetSpec,triggerFilter};
})(globalThis.MTG||={});
