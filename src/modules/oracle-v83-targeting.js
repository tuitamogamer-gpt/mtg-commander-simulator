// The Masamune grants a death-trigger multiplier to its equipped creature.
// Emblems are command-zone objects and need the same multiplier at queue time.
(function(M){
 'use strict';
 const G=M.Game.prototype;
 const live=c=>c?.zone==='battlefield'&&!c.phasedOut;
 const marker='masamune-granted-doubler-v83';
 const grants=c=>(c.cur?.extraStaticAbilitiesV66||[]).filter(r=>r.kind===marker);
 const hostRecord=(g,equipment)=>{
  const host=g.byIid(equipment.attachedTo);
  if(!live(host)||!host.is('Creature')||!grants(host).some(r=>r.equipment===equipment.iid&&r.equipmentVersion===equipment.zoneVersion))return null;
  return {iid:host.iid,version:host.zoneVersion,controller:host.ctrl};
 };
 // The existing layer-six grant array applies both source and recipient
 // ability-loss timestamps before the grant is captured in death LKI.
 M.OracleV20.handlers.unshift({compile(op,script,entry,h){
  if(op.kind==='whole-permanent-v83'&&op.mode==='The Masamune')h.statics.push({phase:5,apply:(g,s)=>{
   const host=g.byIid(s.attachedTo);
   if(live(host)&&host.is('Creature'))host.cur.extraStaticAbilitiesV66.push({kind:marker,equipment:s.iid,equipmentVersion:s.zoneVersion});
  }});
  return false;
 }});
 const snapshot=G.snapshot;
 G.snapshot=function(card,...args){
  const snap=snapshot.call(this,card,...args);
  if(card.def.v83Masamune)snap.masamuneHostV83=!card.cur?.abilitiesDisabled&&live(card)?hostRecord(this,card):null;
  return snap;
 };
 const beforeGrave=(card,version=card?.zoneVersion)=>card?.battlefieldLKI?.get(version-1)||null;
 function deathRows(event,data){
  if(event==='dies'||event==='lto'&&(data.died||data.to==='graveyard'))return data.snap?.types.includes('Creature')?[{card:data.card,snap:data.snap}]:[];
  if(event==='cardsToGraveyard')return (data.cards||[]).flatMap((card,i)=>{
   const snap=(data.froms?.[i]||data.from)==='battlefield'?beforeGrave(card):null;
   return snap?.types.includes('Creature')?[{card,snap,index:i}]:[];
  });
  if(event==='cardToGraveyard'&&data.from==='battlefield'||event==='c14EnteredGraveyard'){
   const snap=beforeGrave(data.card,data.version??data.card?.zoneVersion);
   return snap?.types.includes('Creature')?[{card:data.card,snap}]:[];
  }
  return [];
 }
 function equipmentAtDeath(g,event,data){
  const rows=new Map();
  const remember=(card,snap)=>{if((snap?.def||card?.def)?.v83Masamune)rows.set(card.iid,{card,snap});};
  for(const c of g.bf())remember(c,null);
  for(const row of g._simultaneousLeaveSources||[])remember(row.card,row.snap);
  // A dying equipped creature carries its Equipment's pre-death state even
  // after recalc has detached the surviving Equipment from the dead object.
  for(const {card,snap} of deathRows(event,data)){
   for(const row of snap.attachedSources||[])remember(row.card,row.snap);
   remember(card,snap);
  }
  if(data.card&&data.snap)remember(data.card,data.snap);
  return [...rows.values()].flatMap(({card,snap})=>{
   if(snap?snap.abilitiesDisabled:!live(card)||card.cur?.abilitiesDisabled)return [];
   const host=snap?snap.masamuneHostV83:hostRecord(g,card);
   return host?[{equipment:card,host}]:[];
  });
 }
 function deathCaused(g,event,data,trigger,source,owner){
  const rows=deathRows(event,data);
  if(!rows.length)return false;
  // A mixed graveyard batch can trigger for a land or a discarded card;
  // only the dying-creature part can cause an additional death trigger.
  if(event==='cardsToGraveyard'&&trigger?.filter){
   const reduced={...data,cards:rows.map(r=>r.card),froms:rows.map(()=> 'battlefield'),from:'battlefield'};
   if(!trigger.filter(g,source,reduced,owner))return false;
  }
  return true;
 }
 const additional=M.OracleV20Permanents.additionalTriggers;
 M.OracleV20Permanents.additionalTriggers=function(g,card,event,data,history,trigger){
  const base=additional.call(this,g,card,event,data,history,trigger);
  if(!deathCaused(g,event,data,trigger,card,history?.ctrl||card.ctrl))return base;
  const version=history?.zoneVersion??card.zoneVersion;
  return base+equipmentAtDeath(g,event,data).filter(r=>r.host.iid===card.iid&&r.host.version===version).length;
 };
 const emit=G.emit,frames=new WeakMap();
 G.emit=async function(event,data,...args){
  const previous=frames.get(this),rows=deathRows(event,data||{});
  frames.set(this,rows.length?{event,data,grants:equipmentAtDeath(this,event,data)}:null);
  try{return await emit.call(this,event,data,...args);}
  finally{if(previous===undefined)frames.delete(this);else frames.set(this,previous);}
 };
 const queue=G.queueTrigger;
 G.queueTrigger=function(tr){
  queue.call(this,tr);
  const frame=frames.get(this);
  if(!frame||tr.data!==frame.data)return;
  const owner=this.players.find(p=>!p.lost&&(p.emblems||[]).includes(tr.src));
  if(!owner)return;
  const trigger=(tr.src.triggers||[]).find(t=>t.on===frame.event&&t.run===tr.run);
  if(!trigger||trigger.oncePerTurn&&!trigger.firstTimeEachTurn||trigger.oncePerObjectTriggerV53||!deathCaused(this,frame.event,frame.data,trigger,tr.src,owner))return;
  // Each granted ability adds one occurrence; multiple Equipment add, and
  // each occurrence keeps the native trigger's targets, mode, and source.
  for(const row of frame.grants)if(row.host.controller===owner)queue.call(this,{...tr});
 };
})(globalThis.MTG||={});
