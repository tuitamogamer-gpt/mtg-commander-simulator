'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.CWW,G=M.Game.prototype,SC=M.SCRIPTS;
 const sources=(g,p,key)=>g.bf().filter(c=>(!p||c.ctrl===p)&&C.live(c)&&c.def[key]);
 const flags=(g,c,field)=>g.untilEffects.filter(e=>e.kind==='cwwFlag'&&e.iid===c.iid&&e.zoneVersion===c.zoneVersion&&e.field===field);
 const grant=C.grant;C.grant=(ctx,c,kw,expires='object',extra={})=>{if(!extra.field?.startsWith('cww'))return grant(ctx,c,kw,expires,extra);ctx.g.untilEffects.push({kind:'cwwFlag',expires,iid:c.iid,zoneVersion:c.zoneVersion,...extra});ctx.g.recalc();};
 const damageBatch=G.damageBatch;G.damageBatch=async function(...args){const prior=this.cwwDamageBatch;this.cwwDamageBatch=new Set();try{return await damageBatch.apply(this,args);}finally{this.cwwDamageBatch=prior;}};
 C.firstDamage=(g,c,d)=>{if(!g.cwwDamageBatch)return true;const memo=(d.cwwFaerieHit||={}),source=c.iid+':'+c.zoneVersion;if(Object.hasOwn(memo,source))return memo[source];const key=source+':'+d.player.idx,seen=g.cwwDamageBatch,first=!seen.has(key);seen.add(key);return memo[source]=first;};
 G.withCWWExileBatch=async function(run){if(this.cwwExileBatch)return run();const batch=[];this.cwwExileBatch=batch;try{return await run();}finally{delete this.cwwExileBatch;if(batch.length)await this.emit('cwwExiled',{cards:batch});}};
 const move=G.move;G.move=async function(c,to,o={}){const from=c.zone,v=c.zoneVersion;const r=await move.call(this,c,to,o);if(c.zone==='exile'&&(from!=='exile'||c.zoneVersion!==v)){if(this.cwwExileBatch)this.cwwExileBatch.push(c);else await this.emit('cwwExiled',{cards:[c]});}return r;};
 const exileMany=G.exileMany;G.exileMany=function(...args){return this.withCWWExileBatch(()=>exileMany.apply(this,args));};
 const exileTop=C.exileTop;C.exileTop=(ctx,...args)=>ctx.g.withCWWExileBatch(()=>exileTop(ctx,...args));
 const phaseOut=G.phaseOutMany;G.phaseOutMany=function(...args){const out=phaseOut.apply(this,args);if(out.length)void this.emit('cwwPhased',{cards:out});return out;};
 const recalc=G.recalc;G.recalc=function(){const r=recalc.call(this);const bf=this.bf();for(const c of bf){
  if(flags(this,c,'cwwCoward').length&&!c.cur.subtypes.includes('Coward'))c.cur.subtypes.push('Coward');
  if(flags(this,c,'cwwUnblockable').length)c.cur.unblockable=true;
  if(flags(this,c,'cwwNoCombat').length){c.cur.cantAttack=true;c.cur.cantBlock=true;}
  if(c.def.cwwCantBlock||flags(this,c,'cwwCantBlock').length)c.cur.cantBlock=true;
  if(flags(this,c,'cwwLegendary').length&&!c.cur.super.includes('Legendary'))c.cur.super.push('Legendary');
  for(const e of flags(this,c,'cwwGoaded'))(c.cur.goadedBy||=[]).push(this.players[e.cwwGoadedBy]);
  for(const e of flags(this,c,'cwwForcedAttack')){c.cur.mustAttack=true;(c.cur.c14CannotAttack||=[]).push(this.players[e.cwwAvoid]);}
  if(C.live(c)&&c.def.cwwWhale)for(const x of bf)if(x!==c&&x.ctrl===c.ctrl&&x.is('Creature'))this.grantWard(x,{mana:'{2}'});
  if(C.live(c)&&c.def.cwwIdris){const link=c.meta.cwwImprint,x=link&&this.byIid(link.iid);if(x?.zone==='exile'&&x.zoneVersion===link.version){c.cur.power+=x.mv;c.cur.toughness+=x.mv;c.cur.extraAbilities.push(...(x.def.abilities||[]));c.cur.extraTriggers.push(...(x.def.triggers||[]));if(x.def.mana)c.cur.extraMana.push(...[x.def.mana].flat());}}
 }return r;};
 const canBlock=G.canBlock;G.canBlock=function(b,a){if(C.live(a)&&a.def.cwwNoOxBlock&&b.hasSub('Ox'))return false;return canBlock.call(this,b,a);};
 SC['Not of This World'].selfTargetCostAdjust=(g,c,p,a)=>{const targets=a.targets?C.flat(a.targets):g.legalTargets(c.def.targets[0],c,p);return targets.some(s=>C.flat(s.targets||[]).some(x=>x?.zone==='battlefield'&&x.ctrl===p&&x.is('Creature')&&x.power>=7))?-7:0;};
 SC['Destiny Spinner'].uncounterableSpells=(g,c,so)=>C.live(c)&&c.ctrl===so.ctrl&&['Creature','Enchantment'].some(t=>g.castHasType(so.card,so.castOpts||{},t));
 SC['Starfield of Nyx'].statics=[{phase:1,apply:(g,c,bf)=>{if(C.enchantments(g,c.ctrl).length>=5)for(const x of bf)if(x!==c&&x.ctrl===c.ctrl&&x.is('Enchantment')&&!x.hasSub('Aura')&&!x.cur.types.includes('Creature'))x.cur.types.push('Creature');}},{phase:7,apply:(g,c,bf)=>{if(C.enchantments(g,c.ctrl).length>=5)for(const x of bf)if(x!==c&&x.ctrl===c.ctrl&&x.is('Enchantment')&&!x.hasSub('Aura')){x.cur.basePower=x.mv;x.cur.baseToughness=x.mv;}}}];
 SC['Judoon Enforcers'].statics=[{apply:(g,c,bf)=>{for(const x of bf)if(x.is('Creature'))(x.cur.attackGroupRestrictions||=[]).push(cards=>cards.filter(a=>a.attacking===c.ctrl).length<=1);}}];
 SC['Courser of Kruphix'].revealAllTop=true;
 SC['Mazemind Tome'].triggers=[{on:'state',stateTest:(g,c)=>(c.counters.page||0)>=4,desc:'Exile Mazemind Tome and gain four life',run:async ctx=>{if(!C.same(ctx))return;await ctx.g.move(ctx.src,'exile');if(ctx.src.zone==='exile')await ctx.g.gainLife(ctx.you,4,ctx.src);}}];
 SC['Love Song of Night and Day'].asEnters=async(g,c)=>{const ctx={g,src:c,you:c.ctrl},key=await C.option(ctx,[1,2,3].map(n=>({key:String(n),label:'Begin at chapter '+n})),'Read ahead');const n=Number(key);if(![1,2,3].includes(n))throw Error('Invalid read ahead');c.counters.lore=n-1;c.meta.cwwReadAhead=n;};
 const chapters=G.queueSagaChapters;G.queueSagaChapters=function(c,before,after){if(before===0&&c.meta.cwwReadAhead){before=c.meta.cwwReadAhead-1;delete c.meta.cwwReadAhead;}return chapters.call(this,c,before,after);};
 const allLive=g=>g.untilEffects.some(e=>e.kind==='cwwEverybodyLives');
 for(const key of ['canLoseGame','canWinGame']){const old=G[key];G[key]=function(p){return !allLive(this)&&old.call(this,p);};}
 const loseLife=G.loseLife;G.loseLife=function(p,n,...args){return allLive(this)?Promise.resolve(0):loseLife.call(this,p,n,...args);};
 const payLife=G.canPayLife;G.canPayLife=function(p,n){return !(n>0&&allLive(this))&&payLife.call(this,p,n);};
 const targets=G.legalTargets;G.legalTargets=function(spec,s,p,...a){return targets.call(this,spec,s,p,...a).filter(t=>!(t instanceof M.Player&&t!==p&&allLive(this)));};
 const replacers=G.replacers;G.replacers=function(kind){const out=replacers.call(this,kind);if(kind==='damage')for(const c of this.bf())if(c.def.cwwPreventDamage&&C.live(c))out.push({key:c,src:c,ctrl:c.ctrl,prevent:true,applies:(g,d)=>d.target===c,run:()=>0});return out;};
 C.abilityTax=(g,p)=>sources(g,null,'cwwTithe').filter(s=>s.ctrl!==p&&g.turnPlayer===s.ctrl).length;
 const cost=G.abilityManaCost;G.abilityManaCost=function(p,c,raw,ctx={}){const r=cost.call(this,p,c,raw,ctx);if(!ctx.isMana)r.generic+=C.abilityTax(this,p);return r;};
 const spellCost=G.spellCost;G.spellCost=function(p,c,a={}){const r=spellCost.call(this,p,c,a);r.generic+=sources(this,null,'cwwTithe').filter(s=>s.ctrl!==p&&this.turnPlayer===s.ctrl).length;return r;};
 const timing=G.canCastTiming;G.canCastTiming=function(p,c,a={}){if(c.def.cwwGambit&&!(this.turnPlayer!==p&&this.phase==='combat'&&this.step==='blockers'))return false;if(sources(this,p,'cwwColorlessFlash').length&&!C.castColors(this,c,a).length)return timing.call(this,p,c,{...a,speed:'instant'});return timing.call(this,p,c,a);};
 const manaSources=G.manaSources;G.manaSources=function(p,...a){const out=manaSources.call(this,p,...a),n=sources(this,p,'cwwMonument').length;if(!n)return out;return out.map(s=>s.card&&s.m.cost?.tap&&!s.m.viaConvoke?{...s,produce:s.produce.map(o=>o.C>0?{...o,C:o.C+n}:o),cwwMonument:n}:s);};
 const mana=G.activateManaSource;G.activateManaSource=async function(p,s,...a){const r=await mana.call(this,p,s,...a);if(r&&s.card?.def.cwwClocktower)C.add({g:this,you:p},s.card,'time');return r;};
 const attached=G.attach;G.attach=async function(c,h,...args){if(c.def.cwwPaper){const ctx={g:this,src:c,you:c.ctrl};c.meta.cwwPaperType=await C.chooseType(ctx);const names=Object.values(M.DEFS).filter(d=>d.types.includes('Creature')).map(d=>d.name).sort();c.meta.cwwPaperName=await C.option(ctx,names.map(key=>({key,label:key})),'Choose a creature card name');}return attached.call(this,c,h,...args);};
 C.forceFaceUp=async(ctx,c)=>{if(!c.faceDown||!c.meta.faceDownDef)return;const d=c.meta.faceDownDef;c.def=d;c.faceDown=false;delete c.meta.faceDownDef;delete c.meta.faceDownKind;if(d.asTurnFaceUp)await d.asTurnFaceUp(ctx.g,c);ctx.g.recalc();await ctx.g.emit('turnedFaceUp',{card:c,player:c.ctrl,x:0});};
})();
