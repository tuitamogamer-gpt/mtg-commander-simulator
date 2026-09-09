'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.CDK,G=M.Game.prototype,SC=M.SCRIPTS;
 const sources=(g,key,p)=>g.bf().filter(c=>C.live(c)&&c.def[key]&&(!p||c.ctrl===p));
 G.searchableLibrary=function(chooser,owner=chooser){if(this.canSearchLibrary?.(chooser)===false)return [];return sources(this,'cdkMindcensor').some(c=>c.ctrl!==chooser)?owner.library.slice(-4):owner.library.slice();};
 SC['Archelos, Lagoon Mystic'].replace=[{event:'etbTapped',applies:(g,c,s)=>c!==s,run:(g,c,s)=>{c.tapped=s.tapped;}}];
 SC['Plague Drone'].replace=[{event:'lifegain',opponents:true,applies:(g,n,p,s)=>p!==s.ctrl,run:async(g,n,p,s)=>{await g.loseLife(p,n,s.name);return 0;}}];
 SC['Khârn the Betrayer'].replace=[{event:'damage',applies:(g,d,s)=>d.target===s,run:async(g,d,s)=>{const p=await C.choosePlayer({g,src:s,you:s.ctrl},s.ctrl.opponents(g),'choose who gains control');if(p)C.control(g,s,p,false);return d.preventionAllowed?0:d.n;}}];
 const playLand=G.playLand;G.playLand=async function(p,c,o){const old=this.cdkLandPlay;this.cdkLandPlay={card:c,from:c.zone};try{return await playLand.call(this,p,c,o);}finally{this.cdkLandPlay=old;}};
 const is=M.CardInst.prototype.is;M.CardInst.prototype.is=function(type){return is.call(this,type)||type==='Artifact'&&this.zone!=='battlefield'&&is.call(this,'Creature')&&!!this.owner.game&&sources(this.owner.game,'cdkBiotransference',this.zone==='stack'?this.ctrl:this.owner).length>0;};
 const castType=G.castHasType;G.castHasType=function(c,a,t){return castType.call(this,c,a,t)||t==='Artifact'&&castType.call(this,c,a,'Creature')&&sources(this,'cdkBiotransference',c.zone==='stack'?c.ctrl:c.owner).length>0;};
 const snap=G.snapshot;G.snapshot=function(c){return {...snap.call(this,c),cdkGoaded:this.isGoaded(c)};};
 const mill=G.mill;G.mill=async function(p,n){const cards=await mill.call(this,p,n);if(cards.length)await this.emit('cdkMilled',{player:p,cards});return cards;};
 const move=G.move;G.move=async function(c,to,o={}){
  if(to==='battlefield'&&c.def.cdkPrimeval&&!(c.zone==='stack'&&c.castMeta?.wasCast&&c.castMeta.manaSpent>0))to='exile';
  const from=c.zone,v=c.zoneVersion,result=await move.call(this,c,to,o);
  if(c.zoneVersion!==v&&c.zone==='exile'&&!c.exileFaceDown&&!c.faceDown)for(const s of sources(this,'cdkBell')){if(s.meta.cdkBellTurn!==this.turnNo){s.meta.cdkBellTurn=this.turnNo;s.meta.cdkBellMax=0;}s.meta.cdkBellMax=Math.max(s.meta.cdkBellMax||0,c.mv);}
  if(from==='battlefield'&&c.zone==='graveyard')c.meta.cdkBattlefieldGraveTurn=this.turnNo;
  return result;
 };
 const advance=G.advanceTurnPlayer;G.advanceTurnPlayer=function(p){if(sources(this,'cdkSkipExtraTurns').length&&this.extraTurns?.length){this.lg("Gerrard's Hourglass Pendant skips the extra turns.");this.extraTurns=[];}return advance.call(this,p);};
 const lose=G.playerLoses;G.playerLoses=async function(p,why){
  const thrones=sources(this,'cdkThrone',p);if(thrones.length&&this.canLoseGame(p)){const selected=await this.chooseReplacement(p,thrones.map(src=>({src,key:src.iid,label:src.name})),'loseGame',1);await this.move(selected.src,'exile');p.life=1;return;}
  const holder=this.initiative===p,result=await lose.call(this,p,why);if(holder&&p.lost){const next=this.turnPlayer===p?this.nextPlayer(p):this.turnPlayer;if(next&&!next.lost)await this.takeInitiative(next);}return result;
 };
 C.openingPermanents=async g=>{for(const p of g.players)for(const c of p.hand.slice().filter(c=>c.def.cdkLeyline))if(await C.yes({g,src:c,you:p},'Begin with '+c.name+' on the battlefield?'))await g.putPermanentOntoBattlefield(c,p);};
 const recalc=G.recalc;G.recalc=function(){const prev=new Map((this.battlefield||[]).filter(c=>c.zone==='battlefield').map(c=>[c,{player:c.ctrl,v:c.zoneVersion,kharn:c.def.cdkKharn&&!c.cur?.abilitiesDisabled}]));const result=recalc.call(this);
  for(const[c,r]of prev)if(c.zone==='battlefield'&&c.zoneVersion===r.v&&c.ctrl!==r.player&&r.kharn)this.queueTrigger({src:c,ctrl:r.player,name:'Khârn: draw two after losing control',run:ctx=>ctx.g.draw(ctx.you,2,ctx.src)});
  for(const r of this.cdkRowanTurns||[])if(r.player.turnsStarted===r.turn&&this.turnPlayer===r.player)for(const c of this.creatures(r.player))c.cur.mustAttack=true;
  return result;
 };
 const oldLegal=G.legalTargets;G.legalTargets=function(s,c,p,o){if(s.cdkSpellOrPermanent)return [...oldLegal.call(this,{...s,cdkSpellOrPermanent:false,zone:'battlefield',what:'permanent'},c,p,o),...oldLegal.call(this,{...s,cdkSpellOrPermanent:false,zone:'stack',what:'spell'},c,p,o)];return oldLegal.call(this,s,c,p,o);};
 const revoker=(g,c)=>sources(g,'cdkRevoker').some(s=>M.OracleV8NameGroups.names(c).includes(s.meta.cdkRevoker));
 const manaSources=G.manaSources;G.manaSources=function(p,...args){return manaSources.call(this,p,...args).filter(s=>!s.card||!revoker(this,s.card)).flatMap(s=>s.m?.cdkIlluminor?this.creatures(p).filter(c=>c!==s.card&&this.canSacrifice(c)).map(c=>{const v=c.zoneVersion,extraCost={...s.extraCost,sac:(g,x)=>x===c&&x.zoneVersion===v};return {...s,extraCost,produce:[{B:c.mv}],m:{...s.m,cost:extraCost,produce:[{B:c.mv}]}};}):[s]);};
 const activateMana=G.activateManaSource;G.activateManaSource=function(p,s,...args){return s.card&&revoker(this,s.card)?Promise.resolve(false):activateMana.call(this,p,s,...args);};
 const list=G.activatableList,activate=G.activateAbility,unearth=C.unearth('{3}').gyAbility;
 G.activatableList=function(p,...args){const out=list.call(this,p,...args).filter(e=>!revoker(this,e.card));
  if(!this.hasSplitSecond())for(const r of this.cdkUnearthGrants||[])if(r.player===p&&r.turn===this.turnNo&&C.current(r)&&this.turnPlayer===p&&!this.stack.length&&['main1','main2'].includes(this.phase)&&this.canPayMana(p,this.abilityManaCost(p,r.card,'{3}')))out.push({card:r.card,gyAbility:true,gyAbilityOverride:unearth,cdkUnearth:r});
  for(const c of p.exile)if(c.def.cdkSuspendedSacrifice&&c.meta.suspended>0&&!this.hasSplitSecond()&&this.bf().some(x=>x.ctrl===p&&['Artifact','Creature','Land'].some(t=>x.is(t))&&this.canSacrifice(x)))out.push({card:c,cdkGargadon:true,label:'Sacrifice a permanent: remove a time counter'});return out;
 };
 G.activateAbility=async function(p,e,...args){if(revoker(this,e.card))return false;if(e.cdkUnearth&&(!(this.cdkUnearthGrants||[]).includes(e.cdkUnearth)||!C.current(e.cdkUnearth)||e.cdkUnearth.turn!==this.turnNo))return false;
  if(e.cdkGargadon){const c=e.card,v=c.zoneVersion;if(!p.exile.includes(c)||!c.def.cdkSuspendedSacrifice||!(c.meta.suspended>0)||this.hasSplitSecond())return false;const pool=this.bf().filter(x=>x.ctrl===p&&['Artifact','Creature','Land'].some(t=>x.is(t))&&this.canSacrifice(x)),[s]=await C.choose(this,p,pool,1,1,'Greater Gargadon: sacrifice a permanent','sacCost');if(!s||!await this.sacrifice(p,s))return false;const ctx={g:this,you:p,src:c,sourceZoneVersion:v,targets:[]},so={kind:'ability',ctrl:p,srcCard:c,ctx,targets:[],name:'Greater Gargadon: remove a time counter',run:next=>c.zone==='exile'&&c.zoneVersion===v&&C.removeSuspend(next,c,1)};this.stack.push(so);await this.emit('abilityActivated',{player:p,card:c,isMana:false,ability:{},stackObject:so});await this.flushTriggers();return true;}
  return activate.call(this,p,e,...args);
 };
 const abilityCost=G.abilityManaCost;G.abilityManaCost=function(p,s,raw,ctx={}){const r=abilityCost.call(this,p,s,raw,ctx);if(s?.zone==='graveyard'&&this.bf().some(c=>c.ctrl===p&&c.commander)&&sources(this,'cdkConvergence',p).length)r.generic=Math.max(r.pips.length||r.x?0:1,r.generic-2*sources(this,'cdkConvergence',p).length);if(ctx.ability?.cdkBlueMana)r.pips=r.pips.map(pip=>pip.some(k=>'WUBRG'.includes(k))?[...new Set([...pip,'U'])]:pip);return r;};
 C.snapshotBlockers=g=>{const rows=[];if(g.players.some(p=>p.nextCascade?.some(f=>f.cdkTurn===g.turnNo)))rows.push('next-spell cascade permission');if((g.cdkUnearthGrants||[]).some(r=>r.turn===g.turnNo&&C.current(r)))rows.push('Ghost Ark unearth permissions');if((g.cdkRowanTurns||[]).some(r=>r.player.turnsStarted<=r.turn))rows.push('Rowan next-turn attack requirement');if(g.bf().some(c=>['cdkSwordCard','cdkRedemptor'].some(k=>c.meta[k]&&C.current(c.meta[k]))))rows.push('CLB or 40K linked exile');return rows;};
 C.spent=(g,p,action,entry)=>{if(entry.cdkBiophagus&&action?.card&&!action.isAbility&&g.castHasType(action.card,action.castOpts||{},'Creature'))action.cdkBiophagus=(action.cdkBiophagus||0)+1;};
 const queue=G.queueTrigger;G.queueTrigger=function(tr){queue.call(this,tr);const ev=this.cdkEvent;if(ev?.name==='etb'&&tr.src===ev.data.card&&tr.src.is('Creature'))for(const src of sources(this,'cdkAboleth').filter(c=>c.ctrl!==tr.ctrl)){tr.cdkCapture=true;queue.call(this,{src,ctrl:src.ctrl,name:'Aboleth Spawn: copy the entering creature’s trigger',run:async ctx=>{if(tr.cdkStack&&await C.yes(ctx,'Copy '+tr.cdkStack.name+'?'))await ctx.g.copyStackAbility(tr.cdkStack,ctx.you,{mayNewTargets:true});}});}};
 const resolve=G.resolveTriggerNow;G.resolveTriggerNow=async function(tr){const before=new Set(this.stack),r=await resolve.call(this,tr);if(tr.cdkCapture&&r)tr.cdkStack=this.stack.find(s=>!before.has(s)&&s.srcCard===tr.src&&s.run===tr.run);return r;};
 const emit=G.emit;G.emit=async function(name,d){
  if(name==='beginCombat')this.cdkCombatSerial=(this.cdkCombatSerial||0)+1;
  if(name==='attacks'){if(this.isForcedToAttack(d.card)){d.card.meta.cdkRequiredAttackTurn=this.turnNo;d.card.meta.cdkRequiredCombat=this.cdkCombatSerial||0;}if(d.card.name==='Bloodthirster'){if(d.card.meta.cdkBloodTurn!==this.turnNo){d.card.meta.cdkBloodTurn=this.turnNo;d.card.meta.cdkBloodAttacked=[];}const p=d.card.attacking;if(p instanceof M.Player)d.card.meta.cdkBloodAttacked.push(p.idx);}}
  if(name==='cast'&&d.so?.card){
   const so=d.so,p=d.player,copy=(src,label)=>this.queueTrigger({src,ctrl:p,name:label,run:ctx=>ctx.g.copySpell(so,ctx.you,{mayNewTargets:true})});
   if(this.isInstantSorcerySpell(so)){for(let i=0;i<(p.turnState.cdkTzaangor||0);i++)copy(d.card,'Tzaangor Shaman: copy instant or sorcery');delete p.turnState.cdkTzaangor;for(const e of p.emblems.filter(e=>e.cdkWill))copy(e.source,'Will Kenrith emblem: copy the spell');}
   if(C.spellHasX(this,so)){for(const r of p.turnState.cdkMagus||[])copy(r.source,'Magus Lucea Kane: copy X spell');delete p.turnState.cdkMagus;}
   if(so.castOpts?.cdkTlincalli){const s=this.byIid(so.castOpts.cdkTlincalli);if(s)s.meta.cdkFreeTurn=this.turnNo;}
   const grant=(this.c1719Permissions||[]).find(r=>r.id===so.castOpts?.c1719Id);if(grant?.cdkRuinous)this.queueTrigger({src:d.card,ctrl:p,name:'The Ruinous Powers: owner loses life',run:ctx=>ctx.g.loseLife(d.card.owner,d.mv,d.card.name)});
   if(so.cdkPsionic)for(let i=0;i<so.cdkPsionic;i++)copy(d.card,'Psionic Ritual: replicate');
  }
  if(name==='abilityActivated'&&!d.isMana&&d.stackObject){const p=d.player,so=d.stackObject;for(const e of p.emblems.filter(e=>e.cdkRowan))this.queueTrigger({src:e.source,ctrl:p,name:'Rowan Kenrith emblem: copy the ability',run:ctx=>ctx.g.copyStackAbility(so,ctx.you,{mayNewTargets:true})});if(/\{X\}/.test(typeof d.ability?.cost==='string'?d.ability.cost:d.ability?.cost?.mana||'')){for(const r of p.turnState.cdkMagus||[])this.queueTrigger({src:r.source,ctrl:p,name:'Magus Lucea Kane: copy X ability',run:ctx=>ctx.g.copyStackAbility(so,ctx.you,{mayNewTargets:true})});delete p.turnState.cdkMagus;}}
  if(name==='draw'&&d.nth===1)for(const src of sources(this,'cdkEisenhorn',d.player)){const r=C.row(d.card);this.queueTrigger({src,ctrl:d.player,name:'Eisenhorn: reveal your first draw to create Cherubael',run:async ctx=>{if(C.current(r)&&await C.yes(ctx,'Reveal '+r.card.name+'?')){await ctx.g.revealToHuman({cards:[r.card],ctrl:ctx.you,kind:'reveal'});if(!r.card.is('Land'))await ctx.g.makeTokens(C.token('Cherubael',['Demon'],4,4,['B'],['flying'],{super:['Legendary'],explicitTokenName:true,tokenImageName:'Cherubael'}),ctx.you);}}});}
  if(name==='etb'&&d.card.castMeta?.cdkWhiteTurn===this.turnNo)C.effectOn({g:this,src:d.card,you:d.card.ctrl},d.card,(g,c)=>{c.cur.colors=['W'];});
  const prior=this.cdkEvent;this.cdkEvent={name,data:d};try{return await emit.call(this,name,d);}finally{this.cdkEvent=prior;}
 };
 C.requireSeekerAttack=async(g,p,attackers,eligible,forced)=>{if(attackers.length||!sources(g,'cdkSeeker').some(c=>c.ctrl!==p))return;const pool=eligible.filter(c=>g.legalDeclarationAttackTargets(c).some(t=>g.c21AttackTax(c,t)===0));if(!pool.length)return;const[c]=await C.choose(g,p,pool,1,1,'Seeker of Slaanesh: choose at least one attacker','attack');if(!c)return;const ts=g.legalDeclarationAttackTargets(c).filter(t=>g.c21AttackTax(c,t)===0),t=await C.choosePlayer({g,src:c,you:p},ts,'choose an attack destination');if(t){c.attacking=t;c.meta.cdkRequiredAttackTurn=g.turnNo;c.meta.cdkRequiredCombat=g.cdkCombatSerial||0;attackers.push(c);forced.push(c);}};
 C.redirectOne=async(ctx,so,target)=>{
  if(!C.same(ctx)||!ctx.g.stack.includes(so))return;const src=so.card||so.srcCard,specs=so.targetSpecs||(so.kind==='spell'?ctx.g.spellTargetSpecs(so.card,so.castOpts,so.ctrl):so.ctx?.boundTargetSpecs)||[],old=so.targets||so.ctx?.targets||[],choices=[];
  for(let i=0;i<old.length;i++)for(let j=0;j<(Array.isArray(old[i])?old[i].length:1);j++){const next=old.map(x=>Array.isArray(x)?x.slice():x);if(Array.isArray(next[i]))next[i][j]=target;else next[i]=target;if(ctx.g.targetsStillOk(next,specs,src,so.ctrl))choices.push({key:i+':'+j,label:'Replace target '+(i+1)+(Array.isArray(old[i])?'.'+(j+1):''),next});}
  if(!choices.length)return;const key=choices.length===1?choices[0].key:await C.option(ctx,choices,'choose which target to change'),chosen=choices.find(c=>c.key===key);if(!chosen)return;so.targets=chosen.next;so.targetIdentities=ctx.g.captureTargetIdentities(chosen.next);if(so.ctx){so.ctx.targets=chosen.next;so.ctx.targetIdentities=so.targetIdentities;}for(const field of ['damageDivision','counterDistribution'])if(so[field])so[field]=so[field].map((r,i)=>({...r,iid:chosen.next.flat(Infinity)[i]?.iid,playerIdx:chosen.next.flat(Infinity)[i] instanceof M.Player?chosen.next.flat(Infinity)[i].idx:null}));await ctx.g.emit('targeted',{card:target,byPlayer:so.ctrl,src,isSpell:so.kind==='spell',isInstantSorcery:so.kind==='spell'&&ctx.g.isInstantSorcerySpell(so),so});ctx.g.queueWardTriggers(so,{wardTargets:ctx.g.captureWardTargets([target],so.ctrl)});
 };
})();
