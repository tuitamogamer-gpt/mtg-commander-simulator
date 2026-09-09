'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.CDK,G=M.Game.prototype,S=M.StarterCasting,plans=new WeakMap();
 const live=(g,p,key)=>g.bf().filter(c=>c.ctrl===p&&C.live(c)&&c.def[key]);
 C.convoke=(g,p,c,a)=>C.castColors(g,c,a).length>1&&live(g,p,'cdkConvoke').length>0;
 const graveOffers=(g,p)=>p.graveyard.filter(c=>c.def.cdkGraveCast&&(!c.def.cdkAdditionalCost||p.graveyard.some(x=>x!==c&&x.is('Creature')))).map(card=>({card,from:'graveyard',alt:{starterPermission:'cdk',starterCardVersion:card.zoneVersion,cdkGrave:true,label:'Cast from your graveyard'}}));
 const offers=S.offers,allowed=S.allowed,validate=S.validate,prepare=S.prepare,commit=S.commit;
 S.offers=(g,p)=>offers(g,p).concat(graveOffers(g,p));
 const strip=a=>{const r={...a};delete r.cdkTlincalli;delete r.cdkTlincalliVersion;delete r.free;return r;};
 const hunter=(g,p,c,a)=>c.zone==='exile'&&g.castHasType(c,a,'Creature')&&live(g,p,'cdkTlincalli').some(s=>s.iid===a.cdkTlincalli&&s.zoneVersion===a.cdkTlincalliVersion&&s.meta.cdkFreeTurn!==g.turnNo);
 S.allowed=(g,p,c,a)=>a.cdkTlincalli?!!a.free&&hunter(g,p,c,a)&&allowed(g,p,c,strip(a)):a.starterPermission!=='cdk'?allowed(g,p,c,a):graveOffers(g,p).some(r=>r.card===c)&&a.starterCardVersion===c.zoneVersion&&g.canCastTiming(p,c,a)&&Object.keys(a).every(k=>['starterPermission','starterCardVersion','cdkGrave','label','from','xVal'].includes(k));
 S.validate=ctx=>ctx.so.castOpts.cdkTlincalli?hunter(ctx.g,ctx.you,ctx.src,ctx.so.castOpts)&&validate({...ctx,so:{...ctx.so,castOpts:strip(ctx.so.castOpts)}}):ctx.so.castOpts.starterPermission==='cdk'?S.allowed(ctx.g,ctx.you,ctx.src,ctx.so.castOpts):validate(ctx);
 S.prepare=(ctx,paid)=>ctx.so.castOpts.starterPermission==='cdk'?true:prepare(ctx,paid);
 S.commit=ctx=>{const a=ctx.so.castOpts;if(a.cdkTlincalli){const s=ctx.g.byIid(a.cdkTlincalli);if(s)s.meta.cdkFreeTurn=ctx.g.turnNo;return commit({...ctx,so:{...ctx.so,castOpts:strip(a)}});}return a.starterPermission==='cdk'?undefined:commit(ctx);};
 const face=M.OracleV8Faces.castChoiceAllowed;M.OracleV8Faces.castChoiceAllowed=(g,p,c,a)=>a.starterPermission==='cdk'?S.allowed(g,p,c,a):a.cdkTlincalli?hunter(g,p,c,a)&&face(g,p,c,strip(a)):face(g,p,c,a);
 const spellCost=G.spellCost;G.spellCost=function(p,c,a={}){const r=spellCost.call(this,p,c,a),plan=plans.get(c);let less=0;if(c.def.cdkAdditionalCost==='hierophant')less+=2*(plan?plan.counters.reduce((s,r)=>s+r.n,0):this.creatures(p).reduce((s,c)=>s+(c.counters['+1/+1']||0),0));const permission=(this.c1719Permissions||[]).find(r=>r.id===a.c1719Id);if(permission?.cdkUndaunted)less+=p.opponents(this).length;for(const e of this.untilEffects)if(e.kind==='cdkWillCost'&&e.who===p&&['Instant','Sorcery','Planeswalker'].some(t=>this.castHasType(c,a,t)))less+=2;r.generic=Math.max(0,r.generic-less);return r;};
 // The surcharge is applied by the shared target-cost calculation below.
 C.whaleCost=(g,p,targets)=>new Set(C.flat(targets).filter(c=>c?.zone==='battlefield'&&c.ctrl!==p&&C.live(c)&&c.def.cdkWhale)).size*3;
 C.prepareCosts=async(g,p,c,so,paid)=>{const plan=plans.get(c);if(!plan)return true;so.cdkPlan=plan;paid.sacd.push(...plan.sac.map(r=>r.card));paid.discarded.push(...plan.discard.map(r=>r.card));paid.tapped.push(...plan.tap.map(r=>r.card));paid.life+=plan.life;return C.validateCosts(g,p,c,so);};
 C.validateCosts=(g,p,c,so)=>{const plan=so.cdkPlan;if(!plan)return true;return plan.sourceVersion===c.zoneVersion&&[...plan.sac,...plan.discard,...plan.tap,...plan.exile].every(C.current)&&plan.sac.every(r=>r.card.ctrl===p&&g.canSacrifice(r.card))&&plan.tap.every(r=>r.card.ctrl===p&&!r.card.tapped)&&plan.exile.every(r=>r.card.owner===p&&r.card.is('Creature'))&&plan.counters.every(r=>C.current(r)&&r.card.ctrl===p&&(r.card.counters['+1/+1']||0)>=r.n)&&g.canPayLife(p,plan.life);};
 C.commitCosts=async(g,p,c,so)=>{const plan=so.cdkPlan;if(!plan)return;for(const r of plan.counters)g.removeCounters(r.card,'+1/+1',r.n);for(const r of plan.exile){await g.move(r.card,'exile');if(r.card.zone==='exile')so.cdkExiled=C.row(r.card);}if(plan.kind==='psionic')so.cdkPsionic=plan.tap.length;};
 const cast=G.castSpell;G.castSpell=async function(p,c,o={}){
  const a=o.alt||{},kind=c.def.cdkAdditionalCost;
  if(a.cdkTlincalli&&!hunter(this,p,c,a))return false;
  if(!kind||a.adventure||a.faceDownCast||kind==='helbrute'&&!a.cdkGrave)return cast.call(this,p,c,o);
  if(!this.canCastTiming(p,c,a))return false;const plan={kind,sourceVersion:c.zoneVersion,sac:[],discard:[],tap:[],exile:[],counters:[],life:0},ctx={g:this,you:p,src:c};
  if(kind==='dusk'){const sac=this.creatures(p).filter(c=>this.canSacrifice(c)),discard=p.hand.filter(x=>x!==c),opts=[];if(sac.length)opts.push({key:'sac',label:'Sacrifice a creature'});if(discard.length)opts.push({key:'discard',label:'Discard a card'});if(this.canPayLife(p,4))opts.push({key:'life',label:'Pay 4 life'});if(!opts.length)return false;const key=await C.option(ctx,opts,'choose the additional cost');if(key==='life')plan.life=4;else if(key==='sac'||key==='discard')plan[key]=(await C.choose(this,p,key==='sac'?sac:discard,1,1,c.name+': pay the additional cost',key==='sac'?'sacCost':'discard')).map(C.row);else return false;}
  if(kind==='helbrute'||kind==='redemptor'){const pool=p.graveyard.filter(x=>x!==c&&x.is('Creature'));plan.exile=(await C.choose(this,p,pool,kind==='helbrute'?1:0,1,c.name+': exile a creature from your graveyard','delve')).map(C.row);if(kind==='helbrute'&&!plan.exile.length)return false;}
  if(kind==='psionic')plan.tap=(await C.choose(this,p,this.creatures(p).filter(c=>!c.tapped&&c.hasSub('Horror')),0,this.creatures(p).length,'Psionic Ritual: tap a Horror for each replicate copy','addlTap')).map(C.row);
  if(kind==='hierophant')for(const c of this.creatures(p).filter(c=>c.counters['+1/+1']>0)){const n=await p.controller.decide(this,{type:'chooseX',min:0,max:c.counters['+1/+1'],card:c,prompt:'Hierophant Bio-Titan: remove how many +1/+1 counters from '+c.name+'?',aiHint:{kind:'chooseX',card:c}});if(!Number.isInteger(n)||n<0||n>c.counters['+1/+1'])return false;if(n)plan.counters.push({...C.row(c),zoneVersion:c.zoneVersion,kind:'+1/+1',n});}
  const prev=plans.get(c);plans.set(c,plan);try{return await cast.call(this,p,c,o);}finally{if(prev)plans.set(c,prev);else plans.delete(c);}
 };
 C.hunters=(g,p)=>live(g,p,'cdkTlincalli').filter(s=>s.meta.cdkFreeTurn!==g.turnNo);
})();
