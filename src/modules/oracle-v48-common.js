'use strict';
((M)=>{
 const G=M.Game.prototype,H=M.OracleV20.helpers;
 const sources=(g,mode)=>g.bf().filter(c=>!c.cur.abilitiesDisabled&&c.def.commonRulesV48?.some(r=>r.mode===mode));
 const special=e=>!!(e.turnFaceUp||e.oracleLicidEndV24||e.foretell||e.plot||e.suspend||e.oracleUnlockRoomV20||e.bdfUnlock);
 const castBlocked=(g,p,c,opts={})=>{const o={...opts,...opts.alt};return sources(g,'own-turn-actions').length&&g.turnPlayer!==p||sources(g,'combat-instants').length&&g.phase==='combat'&&g.castHasType(c,o,'Instant')||sources(g,'graveyard-actions').length&&(o.from||c.zone)==='graveyard'||sources(g,'attached-creature-cast').some(s=>g.byIid(s.attachedTo)?.ctrl===p)&&g.castHasType(c,o,'Creature')||(g.untilEffects||[]).some(e=>e.kind==='next-turn-ban-v48'&&e.player===p&&e.activeTurn===g.turnNo)&&(g.castHasType(c,o,'Instant')||g.castHasType(c,o,'Sorcery'));};
 const activationBlocked=(g,p,e)=>!special(e)&&(sources(g,'own-turn-actions').length&&g.turnPlayer!==p||sources(g,'combat-instants').length&&g.phase==='combat'&&!e.manaAbility||sources(g,'graveyard-actions').length&&e.card?.zone==='graveyard');
 const timing=G.canCastTiming;G.canCastTiming=function(p,c,o={}){return !castBlocked(this,p,c,o)&&timing.call(this,p,c,o);};
 const cast=G.castSpell;G.castSpell=async function(p,c,o={}){return castBlocked(this,p,c,o)?false:cast.call(this,p,c,o);};
 const list=G.activatableList;G.activatableList=function(p,...args){return list.call(this,p,...args).filter(e=>!activationBlocked(this,p,e));};
 const activate=G.activateAbility;G.activateAbility=async function(p,e,...args){return activationBlocked(this,p,e)?false:activate.call(this,p,e,...args);};
 const manaSources=G.manaSources;G.manaSources=function(p,...args){return sources(this,'own-turn-actions').length&&this.turnPlayer!==p?[]:manaSources.call(this,p,...args);};
 const mana=G.activateManaSource;G.activateManaSource=async function(p,...args){return sources(this,'own-turn-actions').length&&this.turnPlayer!==p?false:mana.call(this,p,...args);};
 const mill=G.mill;G.mill=function(p,n){return mill.call(this,p,n*2**sources(this,'double-opponent-mill').filter(s=>s.ctrl!==p).length);};
 const unlockCost=(g,p,c,context)=>context?.oracleUnlockRoomV20||context?.bdfUnlock?{...c,generic:Math.max(0,c.generic-sources(g,'unlock-discount').filter(s=>s.ctrl===p).length)}:c;
 const canPay=G.canPayMana;G.canPayMana=function(p,c,context,...args){return canPay.call(this,p,unlockCost(this,p,c,context),context,...args);};
 const pay=G.payMana;G.payMana=function(p,c,context,...args){return pay.call(this,p,unlockCost(this,p,c,context),context,...args);};
 const attachmentLegal=(g,c,host)=>c.cur?.abilitiesDisabled||(c.def.commonRulesV48||[]).filter(r=>r.mode==='attachment-minimum').every(r=>host.is('Creature')&&host[r.stat]>=r.min);
 const legal=G.legalEntryAttachment;G.legalEntryAttachment=function(c,host,p){return legal.call(this,c,host,p)&&attachmentLegal(this,c,host);};
 const attach=G.attach;G.attach=async function(c,host){return attachmentLegal(this,c,host)?attach.call(this,c,host):false;};
 const sba=G.checkSBA;G.checkSBA=function(...args){for(const c of this.bf())if(c.attachedTo&&c.def.commonRulesV48?.some(r=>r.mode==='attachment-minimum')){const host=this.byIid(c.attachedTo);if(host&&!attachmentLegal(this,c,host))M.C1516.detach(this,c);}return sba.apply(this,args);};
 const emit=G.emit;G.emit=async function(event,d){
  if(event==='oracleCrewedByV20'){
   const c=d.card;(c.meta.crewMembersV48 ||= []).push({turn:this.turnNo,version:c.zoneVersion,card:d.crew,memberVersion:d.crew.zoneVersion});
  }
  if(event==='oracleSaddledByV48')for(const member of d.cards)(d.card.meta.saddleMembersV48 ||= []).push({turn:this.turnNo,version:d.card.zoneVersion,card:member,memberVersion:member.zoneVersion});
  if(event==='blocks'&&d.blocker&&d.attacker){(this.combatPairsV48 ||= []).push({turn:this.turnNo,attacker:d.attacker,av:d.attacker.zoneVersion,blocker:d.blocker,bv:d.blocker.zoneVersion});}
  return emit.call(this,event,d);
 };
 const turn=G.runTurn;G.runTurn=async function(...args){const p=this.turnPlayer,number=this.turnNo+1;for(const e of this.untilEffects.filter(e=>e.kind==='next-turn-ban-v48'&&e.player===p&&e.activeTurn===undefined))e.activeTurn=number;try{return await turn.apply(this,args);}finally{this.untilEffects=this.untilEffects.filter(e=>e.kind!=='next-turn-ban-v48'||e.activeTurn!==number);}};
 M.OracleV20.handlers.push({
  count(g,s,p,v){if(v.kind==='life-shortfall-v48')return Math.max(0,(p.startingLife??40)-p.life);if(v.kind==='commander-casts-v48')return p.commanders.reduce((n,c)=>n+(c.cmdCasts||0),0);},
  condition(g,s,c,p,e){if(c.kind==='adamant-any-v48')return ['W','U','B','R','G'].some(k=>(e?.paymentColorCounts||s.castMeta?.paymentColorCounts||{})[k]>=3);if(c.kind==='treasure-mana-v48')return (e?.treasureManaV48??s.castMeta?.treasureManaV48??0)>0;},
  target(g,c,p,s,v){if(v.kind==='counter-object-v48')return c instanceof M.Player?c!==p:c.is('Artifact')||c.is('Creature')||c.is('Planeswalker');if(v.kind==='crew-member-v48'||v.kind==='saddle-member-v48')return (s.meta[v.kind==='crew-member-v48'?'crewMembersV48':'saddleMembersV48']||[]).some(r=>r.turn===g.turnNo&&r.version===s.zoneVersion&&r.card===c&&r.memberVersion===c.zoneVersion);},
  compile(op,script,entry,h){
   if(op.kind!=='common-rule-v48')return false;
   (script.commonRulesV48 ||= []).push(op);
   if(op.mode==='commander-spell-discount')(script.costMods ||= []).push((g,s,info)=>info.player===s.ctrl&&g.isInstantSorceryCast(info.card,info.castOpts||{})?-info.player.commanders.reduce((n,c)=>n+(c.cmdCasts||0),0):0);
   if(['commander-token-anthem','commander-grave-power','bushido-anthem','defending-lands','enchanted-evasion'].includes(op.mode))h.statics.push({phase:5,apply:(g,s,bf)=>{
    if(op.mode==='bushido-anthem')for(const c of bf.filter(c=>c!==s&&c.ctrl===s.ctrl&&c.is('Creature')&&c.hasSub('Samurai'))){const n=(c.cur.abilitiesDisabled?[]:(c.def.triggers||[]).concat(c.cur.extraTriggers||[])).filter(t=>t.on==='blocks'&&/^Bushido \d+$/.test(t.desc||'')).reduce((n,t)=>n+Number(t.desc.slice(8)),0);c.cur.power+=n;c.cur.toughness+=n;}
    if(op.mode==='defending-lands'&&s.attacking){const p=s.attacking instanceof M.Player?s.attacking:s.attacking.ctrl;s.cur.power+=g.lands(p).length;}
    if(op.mode==='enchanted-evasion')for(const c of bf.filter(c=>c.ctrl===s.ctrl&&c.is('Creature')&&c.attachments.some(id=>g.byIid(id)?.hasSub('Aura')))){c.cur.power++;c.cur.toughness++;const old=c.cur.cantBeBlockedBy;c.cur.cantBeBlockedBy=(g,b)=>!b.kw('defender')||!!old?.(g,b);}
    if(op.mode.startsWith('commander-'))for(const cmd of bf.filter(c=>c.commander&&c.owner===s.ctrl&&c.is('Creature')&&!c.cur.abilitiesDisabled)){
     if(op.mode==='commander-token-anthem')for(const c of bf.filter(c=>c.ctrl===cmd.ctrl&&c.is('Creature')&&c.isToken)){c.cur.power+=2;c.cur.toughness+=2;}
     else{cmd.cur.kw.add('menace');cmd.cur.power+=cmd.ctrl.graveyard.filter(c=>c.is('Creature')).length;}
    }
   }});
   return true;
  },
  targetHint(e){if(e.action==='common-effects-v48')return {goal:e.mode==='reanimate-attacking'?'reanimate':e.mode==='remove-counters'?'debuff':'destroy'};},
  async effect(ctx,e){
   if(e.action!=='common-effects-v48')return false;const g=ctx.g,c=H.genericEffectSubjects(ctx,e.target)[0];
   if(e.mode==='no-combat'){if(H.sameBattlefieldSource(ctx))g.untilEffects.push({kind:'oracleNoCombatAssignmentV19',iid:ctx.src.iid,version:ctx.src.zoneVersion,expires:'eot'});return true;}
   if(e.mode==='remove-counters'){if(!c)return true;const counters=()=>c instanceof M.Player?{...Object.fromEntries(Object.entries(c.counters||{}).filter(([key])=>key!=='speed')),poison:c.poison||0}:c.counters,n=Math.min(e.max,Object.values(counters()).reduce((n,x)=>n+x,0)),take=await ctx.you.controller.decide(g,{type:'chooseX',min:0,max:n,prompt:'Choose how many counters to remove',aiHint:{kind:'oracleResolutionX',max:n}});if(!Number.isInteger(take)||take<0||take>n)throw Error('Invalid counter removal number');for(let i=0;i<take;i++){const kinds=Object.keys(counters()).filter(k=>counters()[k]>0),kind=await ctx.you.controller.decide(g,{type:'chooseOption',options:kinds.map(key=>({key,label:key})),prompt:'Choose a counter to remove',aiHint:{kind:'counterType'}});if(!kinds.includes(kind))throw Error('Invalid counter removal choice');if(c instanceof M.Player){if(kind==='poison')c.poison--;else{c.counters[kind]--;if(kind==='energy')c.turnState.energyLost=(c.turnState.energyLost||0)+1;}g.note('counter',{p:c});g.recalc();}else g.removeCounters(c,kind,1);}return true;}
   if(e.mode==='next-turn-spell-ban'){for(const p of g.alivePlayers().filter(p=>p!==ctx.you))g.untilEffects.push({kind:'next-turn-ban-v48',player:p,createdTurn:g.turnNo});return true;}
   if(e.mode==='extra-turn'){g.scheduleExtraTurn(ctx.you,{...e,src:ctx.src});return true;}
   if(e.mode==='reanimate-attacking'){if(c){await g.putPermanentOntoBattlefield(c,ctx.you,{tapped:true});if(c.zone==='battlefield'&&c.is('Creature')&&g.combat&&g.phase==='combat'&&g.turnPlayer===ctx.you){const defender=await g.chooseAttackingDestination(ctx.you,null,c,ctx.src.name);if(defender){c.attacking=defender;c.blockedBy=[];c.wasBlocked=false;if(!g.combat.attackers.includes(c))g.combat.attackers.push(c);}}}return true;}
   if(e.mode==='delayed-destroy-partners'){
    if(c){const target={card:c,version:c.zoneVersion},turn=g.turnNo;g.delayed.push({on:'endCombat',once:true,src:ctx.src,ctrl:ctx.you,name:ctx.src.name+' — end of combat',run:async next=>{const rows=(g.combatPairsV48||[]).filter(r=>r.turn===turn),kill=[];for(const r of rows){if(!e.onlyBlocked&&r.attacker===target.card&&r.av===target.version&&r.blocker.zone==='battlefield'&&r.blocker.zoneVersion===r.bv)kill.push(r.blocker);if(r.blocker===target.card&&r.bv===target.version&&r.attacker.zone==='battlefield'&&r.attacker.zoneVersion===r.av)kill.push(r.attacker);}await g.destroyMany([...new Set(kill)]);}});}return true;
   }
   throw Error('Unknown v48 effect '+e.mode);
  }
 });
})(globalThis.MTG ||= {});
