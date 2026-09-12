'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.WLM,G=M.Game.prototype,S=M.StarterCasting,SC=M.SCRIPTS;
 const live=C.sources,previous={offers:S.offers,allowed:S.allowed,prepare:S.prepare,validate:S.validate,commit:S.commit};
 const source=(s)=>({wlmSource:s.iid,wlmSourceVersion:s.zoneVersion});
 function offers(g,p){
  const out=[],add=(c,kind,extra={})=>{for(const variant of C.castVariants(g,c,{})){
   const def=g.castDefinition(c,variant);
   if(variant.faceDownCast||variant.adventure&&['merfolk','retrace'].includes(kind)||(['fourth','eighth'].includes(kind)&&!C.historicSpell(g,c,variant))||kind==='eighth'&&!def.types.some(t=>['Creature','Artifact','Enchantment','Planeswalker','Battle'].includes(t))||kind==='merfolk'&&!def.subtypes?.includes('Merfolk')||kind==='retrace'&&!def.subtypes?.some(t=>['Merfolk','Druid'].includes(t)))continue;
   out.push({card:c,from:c.zone,alt:{...variant,starterPermission:'wlm',starterCardVersion:c.zoneVersion,wlmKind:kind,...extra,label:extra.label||'Cast with '+kind}});
  }};
  for(const s of live(g,p,'wlmFourth'))if(s.meta.wlmPlayTurn!==g.turnNo){const c=p.library.at(-1);if(c&&!c.is('Land')&&C.historic(c))add(c,'fourth',source(s));}
  for(const s of live(g,p,'wlmEighth'))if(g.turnPlayer===p&&s.meta.wlmPlayTurn!==g.turnNo)for(const c of p.graveyard)if(!c.is('Land')&&C.permanent(g,c)&&C.historic(c))add(c,'eighth',source(s));
  for(const s of live(g,p,'wlmMerfolkTop')){const c=p.library.at(-1);if(c?.hasSub('Merfolk'))add(c,'merfolk',source(s));}
  for(const c of p.graveyard){
   if(c.def.wlmMe&&p.hand.length>=2)add(c,'me');
   if(c.def.wlmLunar&&p.graveyard.length>=6&&g.lands(p).length)add(c,'lunar',{escape:true,altCostStr:'{4}{G}{U}',exileN:5});
   if(c.def.wlmOathsworn&&p.turnState.lifeGained>0)add(c,'oathsworn');
   if(c.def.wlmIndomitable&&g.bf().filter(c=>c.ctrl===p&&c.tapped&&(c.hasSub('Pirate')||c.hasSub('Vehicle'))).length>=3)add(c,'indomitable');
   if((c.hasSub('Merfolk')||c.hasSub('Druid'))&&p.hand.some(c=>c.is('Land')))for(const s of live(g,p,'wlmRetrace'))if(!c.is('Land'))add(c,'retrace',{...source(s),retrace:true});
   if(C.isIS(c)&&g.turnPlayer===p)for(const s of live(g,p,'wlmReturnPast'))add(c,'past',{...source(s),flashback:true,altCostStr:c.def.cost});
   if(c.meta.wlmSurveilledTurn===g.turnNo&&!c.is('Land')&&g.canPayLife(p,c.mv))for(const s of live(g,p,'wlmEye'))add(c,'eye',{...source(s),free:true,lifeCost:c.mv});
   for(const r of g.wlmCastGrants||[])if(r.player===p.idx&&r.card===c.iid&&r.version===c.zoneVersion&&r.turn===g.turnNo&&(!r.alt.escape||p.graveyard.length>=(r.alt.exileN||0)+1))add(c,'grant',{wlmGrant:r.id,...r.alt});
  }
  return out;
 }
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 S.offers=(g,p)=>previous.offers(g,p).concat(offers(g,p));
 S.allowed=(g,p,c,a)=>{if(a.starterPermission!=='wlm')return previous.allowed(g,p,c,a);return g.canCastTiming(p,c,a)&&offers(g,p).some(r=>r.card===c&&Object.keys(r.alt).every(k=>equal(a[k],r.alt[k]))&&Object.keys(a).every(k=>k==='from'?a[k]===c.zone:k==='xVal'?Number.isSafeInteger(a[k])&&a[k]>=0:equal(a[k],r.alt[k])));};
 S.prepare=async(ctx,paid)=>{
  const a=ctx.so.castOpts;if(a.starterPermission!=='wlm')return previous.prepare(ctx,paid);
  if(a.wlmKind==='me'){const cs=await C.choose(ctx.g,ctx.you,ctx.you.hand,2,2,'Me, the Immortal: discard two cards','discard');if(cs.length!==2)return false;ctx.so.wlmDiscard=cs.map(C.row);paid.discarded.push(...cs);}
  if(a.wlmKind==='lunar'){const[c]=await C.choose(ctx.g,ctx.you,ctx.g.lands(ctx.you),1,1,'Lunar Hatchling: exile a land you control','sacCost');if(!c)return false;ctx.so.wlmExileLand=C.row(c);}
  return true;
 };
 S.validate=ctx=>ctx.so.castOpts.starterPermission!=='wlm'?previous.validate(ctx):S.allowed(ctx.g,ctx.you,ctx.src,Object.fromEntries(Object.entries(ctx.so.castOpts).filter(([k])=>!['_kicked','_kickerX','buybackPaid'].includes(k))))&&(!ctx.so.wlmDiscard||ctx.so.wlmDiscard.every(r=>C.current(r)&&r.card.owner===ctx.you))&&(!ctx.so.wlmExileLand||C.current(ctx.so.wlmExileLand)&&ctx.so.wlmExileLand.card.ctrl===ctx.you&&ctx.so.wlmExileLand.card.is('Land'));
 S.commit=ctx=>{const a=ctx.so.castOpts;if(a.starterPermission!=='wlm')return previous.commit(ctx);if(['fourth','eighth'].includes(a.wlmKind)){const s=ctx.g.byIid(a.wlmSource);if(s)s.meta.wlmPlayTurn=ctx.g.turnNo;if(a.wlmKind==='fourth')food(ctx.g,ctx.you,s);}};
 const face=M.OracleV8Faces.castChoiceAllowed;M.OracleV8Faces.castChoiceAllowed=(g,p,c,a)=>a.starterPermission==='wlm'?S.allowed(g,p,c,a):face(g,p,c,a);
 const commit=M.CDK.commitCosts;M.CDK.commitCosts=async(g,p,c,so)=>{await commit(g,p,c,so);if(so.wlmExileLand)await g.move(so.wlmExileLand.card,'exile');};
 function food(g,p,s){g.queueTrigger({src:s,ctrl:p,name:'The Fourth Doctor: create a Food',run:ctx=>ctx.g.makeTokens(M.TOKENS.food,ctx.you)});}
 C.castGrant=(ctx,c,alt)=>{if(!c)return;const id=(ctx.g.wlmCastGrantId=(ctx.g.wlmCastGrantId||0)+1);(ctx.g.wlmCastGrants||=[]).push({id,player:ctx.you.idx,card:c.iid,version:c.zoneVersion,turn:ctx.g.turnNo,alt});};
 const grant=C.playGrant;C.playGrant=(ctx,c,opts={})=>{if(c.zone==='graveyard'){C.castGrant(ctx,c,{...(opts.exileAfter?{oracleExileOnGraveyard:true}:{}),...(opts.anyColor?{asThoughAnyColor:true}:{})});return;}const row=grant(ctx,c,opts);if(opts.wlmUntilEnd!==undefined)ctx.g.delayed.push({on:'endStep',once:true,src:ctx.src,ctrl:ctx.you,name:'Yasmin Khan: play permission ends',filter:(g,d)=>d.player.idx===opts.wlmUntilEnd,run:ctx=>{ctx.g.c1719Permissions=ctx.g.c1719Permissions.filter(r=>r.id!==row.id);}});return row;};
 function landSources(g,p,c){return g.bf().filter(s=>s.ctrl===p&&C.live(s)&&(s.def.wlmFourth&&c===p.library.at(-1)&&C.historic(c)&&s.meta.wlmPlayTurn!==g.turnNo||s.def.wlmEighth&&g.turnPlayer===p&&c.zone==='graveyard'&&C.historic(c)&&s.meta.wlmPlayTurn!==g.turnNo||s.def.wlmEye&&c.zone==='graveyard'&&c.meta.wlmSurveilledTurn===g.turnNo));}
 const lands=G.playableLands;G.playableLands=function(p){const out=lands.call(this,p);if(p.landsPlayed<this.landPlayLimit(p))for(const c of [p.library.at(-1),...p.graveyard].filter(Boolean))if(c.is('Land')&&landSources(this,p,c).length)out.push(c);return [...new Set(out)];};
 const land=G.playLand;G.playLand=async function(p,c,...a){const s=landSources(this,p,c)[0],v=c.zoneVersion,r=await land.call(this,p,c,...a);if(s&&c.zoneVersion!==v){if(s.def.wlmFourth||s.def.wlmEighth)s.meta.wlmPlayTurn=this.turnNo;if(s.def.wlmFourth)food(this,p,s);if(s.def.wlmEighth&&c.zone==='battlefield'){c.meta.unearth=true;this.recalc();}}return r;};
 const timing=G.canCastTiming;G.canCastTiming=function(p,c,a={}){if(c.def.wlmTwice&&!a.adventure&&this.creatures(p).filter(c=>c.hasSub('Doctor')).length<2)return false;if(this.phase==='end'&&this.turnPlayer!==p&&live(this,p,'wlmEndFlash').length)a={...a,speed:'instant'};return timing.call(this,p,c,a);};
 const casualty=G.vnCasualties;G.vnCasualties=function(p,c,a){const out=casualty.call(this,p,c,a);if(!p.turnState.wlmNonlegendArtifacts&&this.castHasType(c,a,'Artifact')&&!this.castDefinition(c,a).super?.includes('Legendary'))for(const s of live(this,p,'wlmAshad'))out.push({n:2,source:s,version:s.zoneVersion});return out;};
 const convoke=M.CDK.convoke;M.CDK.convoke=(g,p,c,a)=>convoke(g,p,c,a)||!p.turnState.wlmHistoric&&C.historicSpell(g,c,a)&&live(g,p,'wlmHistoricConvoke').length>0;
 const conspire=M.C1920.conspireSources;M.C1920.conspireSources=(g,p,c,a)=>conspire(g,p,c,a).concat(c.zone==='exile'&&!g.castHasType(c,a,'Creature')?live(g,p,'wlmRassilon').map(s=>({iid:s.iid,version:s.zoneVersion,controller:p.idx})):[]);
 const replicate=M.C1920.replicatePayments;M.C1920.replicatePayments=async(g,p,c,a,cost,x)=>{
  const plans=await replicate(g,p,c,a,cost,x);if(!plans||!g.castDefinition(c,a).subtypes?.includes('Saga'))return plans;
  for(const s of live(g,p,'wlmSagaReplicate')){const r=M.parseCost(g.castDefinition(c,a).cost);r.generic+=(r.x||0)*x;r.x=0;let low=0,high=g.maxAffordableX(p,{...cost,x:1},c,{castOpts:a})+1;while(low+1<high){const n=low+Math.floor((high-low)/2),combined={...cost,generic:cost.generic+r.generic*n,pips:cost.pips.concat(Array.from({length:n},()=>r.pips).flat())};if(g.canPayMana(p,combined,{card:c,castOpts:a},{xVal:x}))low=n;else high=n;}const n=await p.controller.decide(g,{type:'chooseX',min:0,max:low,card:c,prompt:'Ian Chesterton: replicate how many times?',aiHint:{kind:'replicate',card:c}});if(!Number.isSafeInteger(n)||n<0||n>low)return null;if(n){cost.generic+=r.generic*n;for(let i=0;i<n;i++)cost.pips=cost.pips.concat(r.pips);plans.push({count:n,source:{iid:s.iid,version:s.zoneVersion,controller:p.idx}});}}
  return plans;
 };
 C.demonstrate=(g,p,so)=>so.from!=='hand'&&!p.turnState.wlmParadox&&live(g,p,'wlmDemonstrate').length>0;
 SC['Exterminate!'].cdkAdditionalCost='wlmDalek';
 const prepareCosts=M.CDK.prepareCosts,validateCosts=M.CDK.validateCosts,cast=G.castSpell,dalekPlans=new WeakMap();
 M.CDK.prepareCosts=async(g,p,c,so,paid)=>{if(!await prepareCosts(g,p,c,so,paid))return false;const rs=dalekPlans.get(c);if(rs){so.wlmDaleks=rs;paid.tapped.push(...rs.map(r=>r.card));}return true;};
 M.CDK.validateCosts=(g,p,c,so)=>validateCosts(g,p,c,so)&&(!so.wlmDaleks||so.wlmDaleks.every(r=>C.current(r)&&r.card.ctrl===p&&!r.card.tapped&&r.card.hasSub('Dalek')));
 G.castSpell=async function(p,c,o={}){if(!c.def.wlmDalekReplicate)return cast.call(this,p,c,o);if(!this.canCastTiming(p,c,o.alt||{}))return false;const pool=this.bf().filter(c=>c.ctrl===p&&!c.tapped&&c.hasSub('Dalek')),cs=await C.choose(this,p,pool,0,pool.length,'Exterminate!: tap Daleks to replicate','addlTap');dalekPlans.set(c,cs.map(C.row));try{return await cast.call(this,p,c,o);}finally{dalekPlans.delete(c);}};
 const emit=G.emit;G.emit=function(name,d){if(name==='cast'&&d.so?.wlmDaleks?.length){const n=d.so.wlmDaleks.length;this.queueTrigger({src:d.card,ctrl:d.player,name:'Exterminate!: replicate '+n,data:d,run:ctx=>ctx.g.copySpells(ctx.data.so,ctx.you,n,{mayNewTargets:true})});}return emit.call(this,name,d);};
})();
