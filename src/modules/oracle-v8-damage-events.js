((M)=>{
 function snapshot(game,object){
  if(!(object instanceof M.CardInst))return null;
  const snap=game.snapshot(object,false);
  return{...snap,zone:object.zone,owner:object.owner,attachedTo:object.attachedTo,modified:game.isModified?.(object)??(Object.values(object.counters||{}).some(n=>n>0)||(object.attachments||[]).some(iid=>{const c=game.byIid(iid);return c?.hasSub('Equipment')||c?.hasSub('Aura')&&c.ctrl===object.ctrl;})),basePower:object.cur?.basePower??object.def.power};
 }
 function view(object,snap){
  if(!snap)return object;
  const fields={...snap,cur:{...object.cur,types:snap.types,subtypes:snap.subtypes,super:snap.super||snap.def?.super||[]},is:t=>snap.types.includes(t),hasSub:t=>snap.subtypes.includes(t)||snap.changeling&&M.CREATURE_SUBTYPES.has(t),kw:k=>snap.kw.includes(k)};
  return Object.defineProperties(Object.create(object),Object.fromEntries(Object.entries(fields).map(([k,value])=>[k,{value}])));
 }
 function capture(game,src,target,n,opts){
  if(!game._oracleDamageWatch&&!game.delayed.some(row=>[].concat(row.on).some(event=>/^oracleDamage/.test(event))))return null;
  const sourceSnap=src?._oracleDamageSnapshot||game._oracleDamageBatch?.snapshots?.get(src)||snapshot(game,src),targetSnap=game._oracleDamageBatch?.snapshots?.get(target)||snapshot(game,target);
  return{src,target,n,combat:!!opts.combat,sourceSnap,targetSnap,spell:src?.zone==='stack',sourceVersion:sourceSnap?.zoneVersion??src?.zoneVersion,targetVersion:target?.zoneVersion};
 }
 async function emit(game,hits){
  if(!hits.length)return;
  for(const hit of hits)await game.emit('oracleDamageHit',{hits:[hit],n:hit.n});
  for(const key of ['src','target']){
   const grouped=new Map();for(const hit of hits){const id=hit[key];if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(hit);}
   for(const rows of grouped.values())await game.emit(key==='src'?'oracleDamageBySource':'oracleDamageToObject',{hits:rows,n:rows.reduce((n,row)=>n+row.n,0)});
  }
 }
 function matches(rule,object,snap,game,self,h,hit){
  if(!rule)return false;
  if(rule.another&&object===self)return false;
  if(rule.kind==='either')return rule.choices.some(choice=>matches(choice,object,snap,game,self,h,hit));
  if(rule.kind==='any')return true;
  if(rule.kind==='self')return object===self&&(object===hit.src?hit.sourceVersion:hit.targetVersion)===self.zoneVersion;
  if(rule.kind==='attached')return !!self.attachedTo&&object?.iid===self.attachedTo;
  if(rule.kind==='you')return object===self.ctrl;
  if(rule.kind==='a player')return object instanceof M.Player;
  if(rule.kind==='an opponent')return object instanceof M.Player&&object!==self.ctrl;
  const objectView=view(object,snap);
  if(rule.kind==='quality')return objectView?.is?.('Creature')&&snap?.ctrl===self.ctrl&&(rule.quality==='modified'?snap.modified:rule.quality==='historic'?objectView.is('Artifact')||snap.def?.super?.includes('Legendary')||objectView.hasSub('Saga'):rule.quality==='land'?objectView.is('Land'):rule.quality==='power-above-base'?snap.power>Number(snap.basePower):false);
  if(rule.kind==='a player or battle')return object instanceof M.Player||objectView?.is?.('Battle');
  if(rule.kind==='a creature or opponent')return object instanceof M.Player?object!==self.ctrl:objectView?.is?.('Creature');
  if(rule.kind==='source')return !!object&&(rule.controller!=='you'||(snap?.ctrl||object.ctrl)===self.ctrl)&&(!rule.noncreature||!objectView.is?.('Creature'))&&(!rule.color||objectView.colors?.includes(rule.color));
  if(rule.kind==='filtered'){
   const filterView=object===hit.src&&object instanceof M.CardInst?Object.create(objectView,{zone:{value:rule.spell?'stack':'battlefield'}}):objectView;
   return !!filterView&&(!rule.spell||hit.spell)&&(rule.controller!=='you'||(snap?.ctrl||object.ctrl)===self.ctrl)&&h.target({...rule.target,...(rule.spell?{zone:filterView.zone,controller:'any'}:{})},[],0).filter(game,filterView,self.ctrl,self);
  }
  throw new Error('Unsupported damage event selector');
 }
 function selected(rule,game,self,data,h){return(data.hits||[]).filter(hit=>(rule.combat===undefined||hit.combat===rule.combat)&&(!rule.yourTurn||game.turnPlayer===self.ctrl)&&matches(rule.source,hit.src,hit.sourceSnap,game,self,h,hit)&&matches(rule.recipient,hit.target,hit.targetSnap,game,self,h,hit));}
 function bindings(rule,game,self,data,h){
  if(rule?.kind!=='damage-event-v8')return null;
  const rows=selected(rule,game,self,data,h),hit=rows[0];if(!hit)return null;
  const eventCard=rule.bind==='source'?hit.src:hit.target,snap=rule.bind==='source'?hit.sourceSnap:hit.targetSnap;
  return{eventCard,eventController:snap?.ctrl||eventCard.ctrl,eventPlayer:hit.target instanceof M.Player?hit.target:hit.targetSnap?.ctrl||hit.target.ctrl,eventAmount:rows.reduce((n,row)=>n+row.n,0),eventSnap:snap,eventVersion:rule.bind==='source'?hit.sourceVersion:hit.targetVersion};
 }
 M.OracleV8DamageEvents={capture,emit,bindings,batchSnapshots:game=>game._oracleDamageWatch?new Map(game.bf().map(card=>[card,snapshot(game,card)])):null,triggerFilter:(rule,h)=>rule?.kind==='damage-event-v8'?(game,self,data)=>selected(rule,game,self,data,h).length>0:null};
})(globalThis.MTG||={});
