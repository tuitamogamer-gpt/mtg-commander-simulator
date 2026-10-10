(()=>{
 const M=MTG,V=M.OracleV20,H=V.helpers;
 const view=data=>{const c=data.src,s=data.sourceSnapshot||c?._oracleDamageSnapshot;if(!c)return null;if(!s)return Object.defineProperty(Object.create(c),'zone',{value:'battlefield'});return {...s,def:s.def||c.def,owner:c.owner,ctrl:s.ctrl||c.ctrl,meta:s.sourceMeta||c.meta,zoneVersion:s.zoneVersion??c.zoneVersion,zone:'battlefield',cur:{types:s.types,subtypes:s.subtypes,super:s.super||[],kw:new Set(s.kw||[])},is:t=>s.types.includes(t),hasSub:t=>s.subtypes.includes(t)||!!s.changeling&&M.CREATURE_SUBTYPES.has(t),kw:k=>(s.kw||[]).includes(k)};};
 const subject=(g,s,p,selector,c,records)=>{
  if(!selector||selector.all)return !!c;
  if(selector.player)return c instanceof M.Player&&(selector.player==='all'||(selector.player==='you'?c===p:c!==p));
  if(selector.opponentObjects)return c instanceof M.Player?c!==p:!!c?.ctrl&&c.ctrl!==p;
  if(selector.youAndCreaturesV64)return c===p||c?.ctrl===p&&!!c.is?.('Creature');
  if(selector.yourObjects)return (c===p||c?.ctrl===p)&&(!selector.other||c?.iid!==s.iid);
  if(selector.youAndSelf)return c===p||c?.iid===s.iid;
  if(selector.ref!==undefined){const rows=records?.get(selector.ref);if(rows)return rows.some(row=>row.card instanceof M.Player?row.card===c:row.card.iid===c?.iid&&(c.zoneVersion===row.version||row.spell&&c.zone==='battlefield'&&c.zoneVersion===row.version+1&&c.meta?._enteredFromZone==='stack'));return selector.ref==='self'?c?.iid===s.iid:selector.ref==='attached-host'?(c instanceof M.Player?c===s.meta.cursedPlayer:c?.iid===s.attachedTo):false;}
  if(selector.filter?.excludeSelf&&c?.iid===s.iid&&c?.zoneVersion===s.zoneVersion)return false;
  return c instanceof M.Player?false:H.genericTargetSpec(selector.filter,[],0).filter(g,c,p,s);
 };
 const destination=(g,s,p,op,data,records)=>{
  const d=op.destination;if(!d)return null;
  const row=records?.get(d.ref)?.[0],card=d.damageSourceController?view(data)?.ctrl:d.player==='you'?p:row?.card||(d.ref==='self'?s:d.ref==='attached-host'?g.byIid(s.attachedTo):null);
  return card instanceof M.Player?!card.lost&&card:card?.zone==='battlefield'&&!card.phasedOut&&(!row||card.zoneVersion===row.version)?card:null;
 };
 const matches=(g,s,p,op,data,records)=>data.n>0&&(!op.condition||H.genericCondition(g,s,op.condition,p))&&(!op.combat||(op.combat==='combat')===data.combat)&&subject(g,s,p,op.source,view(data),records)&&subject(g,s,p,op.recipient,data.target,records)&&(op.mode!=='redirect'||!!destination(g,s,p,op,data,records)&&destination(g,s,p,op,data,records)!==data.target);
 const amount=(g,s,p,n)=>H.genericAmount(n,{g,src:s,you:p,sourceMeta:s.meta,sourceZoneVersion:s.zoneVersion});
 async function rider(g,s,p,rule,data,attempted,prevented,state){
  if(!rule)return;const n=(rule.basis==='attempted'?attempted:prevented)*(rule.factor||1);if(n<=0)return;
  if(rule.kind==='gain-life')await g.gainLife(p,n,s);
  else if(rule.kind==='draw-source-controller')await g.draw(view(data)?.ctrl,n,s);
  else if(rule.kind==='source-counter'){if(s.zone==='battlefield')g.addCounters(s,rule.counter,rule.n,false,p);}
  else if(rule.kind==='target-counter'){if(data.target.zone==='battlefield')g.addCounters(data.target,rule.counter,n,false,p);}
  else if(rule.kind==='mill'){for(const player of rule.opponents?p.opponents(g):[p])await g.mill(player,n);}
  else if(rule.kind==='exile-library')for(const c of p.library.slice(-n))await g.move(c,'exile');
  else{
   for(const handler of V.handlers)if(await handler.damagePreventionRider?.(g,s,p,rule,data,attempted,prevented,{records:state?.records})===true)return;
   throw Error('Unsupported damage prevention rider');
  }
 }
 async function replace(g,s,p,op,data,state){
  if(op.mode==='sacrifice-controller'){const pool=g.bf().filter(card=>card.ctrl===p&&g.canSacrifice(card)),n=Math.min(pool.length,data.n),versions=new Map(pool.map(card=>[card,card.zoneVersion]));if(n){const chosen=await p.controller.decide(g,{type:'chooseCards',from:pool,min:n,max:n,prompt:s.name+': sacrifice '+n+' permanents instead of damage',aiHint:{kind:'sacrifice',src:s}});if(!Array.isArray(chosen)||chosen.length!==n||new Set(chosen).size!==n||chosen.some(card=>!pool.includes(card)||card.zoneVersion!==versions.get(card)||card.zone!=='battlefield'||card.ctrl!==p))throw Error('Invalid damage replacement sacrifice choice');await g.sacrificeMany(p,chosen);}return 0;}
  if(op.mode==='exile-player-library'){for(const card of data.target.library.slice(-data.n))await g.move(card,'exile');return 0;}
  if(op.mode==='redirect'){
   const to=destination(g,s,p,op,data,state?.records);
   if(!to)return data.n;
   const remaining=state?.remaining??(op.n==='all'?Infinity:amount(g,s,p,op.n)),diverted=Math.min(data.n,remaining);
   if(!(diverted>0))return data.n;
   if(diverted<data.n)(data.redirectRemainders||=[]).push({target:data.target,n:data.n-diverted});
   data.target=to;
   if(state){if(Number.isFinite(state.remaining))state.remaining-=diverted;if(op.once){state.used=true;state.batch=data.batch;}}
   return diverted;
  }
  if(op.mode==='modify'){if(state&&op.once){state.used=true;state.batch=data.batch;}return data.n*op.factor+(state?.add??amount(g,s,p,op.add));}
  if(op.mode==='counters'){if(op.counter==='+1/+1')g.addCounters(data.target,'+1/+1',data.n,false,p);else await g.addM1(data.target,data.n,p,true);return 0;}
  const before=data.n,max=state?state.remaining:op.n==='all'?Infinity:amount(g,s,p,op.n),prevented=data.preventionAllowed?Math.min(before,max):0;
  if(state&&prevented){if(Number.isFinite(state.remaining))state.remaining-=prevented;if(op.once){state.used=true;state.batch=data.batch;}}
  await rider(g,s,p,op.rider,data,before,prevented,state);return before-prevented;
 }
 V.handlers.push({compile(op,script){if(op.kind==='spell-keywords-v20'){(script.oracleSpellKeywordsV20||=[]).push(op);return true;}if(op.kind!=='damage-rule-v20')return false;(script.replace||=[]).push({event:'damage',oraclePrevention:op.mode==='prevent',applies:(g,data,s)=>matches(g,s,s.ctrl,op,data),run:(g,data,s)=>replace(g,s,s.ctrl,op,data)});return true;},async effect(ctx,op){
  if(op.action==='choose-damage-source-v20'){const quality={...op.quality};if(quality.chosenColorV10){quality.colors=[ctx.oracleSourceCapture?.chosenColorV10];delete quality.chosenColorV10;if(!'WUBRG'.includes(quality.colors[0]||'!'))return true;}if(quality.subtype?.kind==='chosen-subtype-v16'){quality.subtype=ctx.oracleSourceCapture?.chosenSubtypeV16;if(!M.CREATURE_SUBTYPES.has(quality.subtype))return true;}await M.OracleV8SourcePrevention.run(ctx,{...op,action:'choose-damage-source-v8',quality},{subjects:H.genericEffectSubjects});return true;}
  if(op.action!=='damage-rule-v20')return false;
  const records=new Map();for(const selector of [op.source,op.recipient,op.destination])if(selector?.ref!==undefined){const ref=selector.ref,actual=ref===op.source?.ref&&op.sourceTarget!==undefined?op.sourceTarget:ref===op.recipient?.ref&&op.target!==undefined?op.target:ref===op.destination?.ref&&op.redirectTarget!==undefined?op.redirectTarget:ref;records.set(ref,H.genericEffectSubjects(ctx,actual).map(c=>({card:c.card||c,version:(c.card||c).zoneVersion,spell:c.kind==='spell'||c.zone==='stack'})));}
  if(op.source?.ref==='chosen-source-v20'){
   const choices=M.OracleV8SourcePrevention.candidates(ctx.g,{},ctx).sort((a,b)=>Number(b.card.ctrl!==ctx.you)-Number(a.card.ctrl!==ctx.you)||Number(b.card.power||0)-Number(a.card.power||0));
   if(!choices.length)return true;
   const picked=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose a source of damage',options:choices.map((row,i)=>({key:String(i),label:row.card.name,card:row.card})),aiHint:{kind:'damageRedirectionSourceV20',source:ctx.src}}),row=choices[Number(picked)];
   if(!row||String(Number(picked))!==String(picked)||!M.OracleV8SourcePrevention.candidates(ctx.g,{},ctx).some(other=>other.card===row.card&&other.version===row.version))return true;records.set('chosen-source-v20',[row]);
  }
  const state={kind:'oracleDamageRuleV20',expires:'eot',source:ctx.src,sourceVersion:ctx.sourceZoneVersion,seat:ctx.you.idx,op,records,remaining:op.n==='all'?Infinity:H.genericAmount(op.n,ctx),add:H.genericAmount(op.add,ctx)};ctx.g.untilEffects.push(state);return true;
 }});
 M.OracleV20Damage={sourceThreat(g,p,c){return !c?-10000:c.ctrl===p?-1000:10+Math.max(0,Number(c.power)||0)+(c.zone==='stack'?20:0);},spellKeyword(g,source,keyword){
  if(source?.oracleFrozenSpellTraitsV64===true)return (source._oracleDamageSnapshot?.kw||[]).includes(keyword);
  const snapshot=source?._oracleDamageSnapshot,spell=snapshot?snapshot.types?.some(type=>['Instant','Sorcery'].includes(type)):source?.is?.('Instant')||source?.is?.('Sorcery');
  if(!source||source.zone!=='stack'&&snapshot?.zone!=='stack'||!spell)return false;
  const colors=snapshot?.colors||source?.colors||[],controller=snapshot?.ctrl||source?.ctrl;
  return g.bf().some(permanent=>permanent.ctrl===controller&&!permanent.cur?.abilitiesDisabled&&permanent.def.oracleSpellKeywordsV20?.some(rule=>rule.keywords.includes(keyword)&&(!rule.colors||rule.colors.some(color=>colors.includes(color)))));
 },temporaryCandidates(g,data){
  return g.untilEffects.filter(s=>s.kind==='oracleDamageRuleV20'&&(!s.used||data.batch&&s.batch===data.batch)&&(s.remaining>0||s.op.mode==='modify')&&matches(g,s.source,g.players[s.seat],s.op,data,s.records)).map(state=>({key:state,src:state.source,label:state.source.name+' — damage effect',apply:async()=>{const old=data.n;data.n=await replace(g,state.source,g.players[state.seat],state.op,data,state);if(state.op.mode==='prevent'&&old>data.n){g.note('gameEffect',{kind:'damagePrevented',target:data.target,amount:old-data.n,source:data.src});await g.emit('damagePrevented',{src:data.src,target:data.target,...(data.target instanceof M.Player?{player:data.target}:{}),n:old-data.n,combat:data.combat});}}}));
 }};
})();
