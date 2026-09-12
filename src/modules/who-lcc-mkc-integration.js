'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.WLM,G=M.Game.prototype,SC=M.SCRIPTS,T=M.T;
 C.extraTurn=ctx=>ctx.g.scheduleExtraTurn(ctx.you);
 C.protection=(ctx,c,colors)=>C.effectOn(ctx,c,(g,c)=>c.cur.protectionFrom.push((g,s)=>s.colors?.some(k=>colors.includes(k))));
 C.switchPT=(ctx,c)=>{ctx.g.untilEffects.push({kind:'oraclePTSwitch',iid:c.iid,zoneVersion:c.zoneVersion,expires:'eot'});ctx.g.recalc();};
 C.humanize=(ctx,c,opts={})=>{M.OracleV8AbilityLoss.add(ctx.g,[c],{types:['Creature'],subtypes:opts.subtypes||['Human'],...(opts.colors===undefined&&!opts.name?{colors:['W']}:{}),power:opts.power??1,toughness:opts.toughness??1});if(opts.name){ctx.g.untilEffects.push({kind:'wlmName',iid:c.iid,zoneVersion:c.zoneVersion,name:opts.name,legendary:!!opts.legendary});}ctx.g.recalc();};
 C.cyberman=async(ctx,c,p,tapped=false)=>{if(c.oracleFaces&&c.zone==='battlefield')return false;const old=c.meta.faceDownDef||c.def;if(c.zone==='battlefield'){c.meta.faceDownDef=old;c.meta.faceDownKind='wlmCyberman';c.def={...ctx.g.faceDownCreatureDef('wlmCyberman'),types:['Artifact','Creature'],subtypes:['Cyberman']};c.faceDown=true;if(tapped)ctx.g.tap(c);ctx.g.recalc();return true;}c.def={...ctx.g.faceDownCreatureDef('wlmCyberman'),types:['Artifact','Creature'],subtypes:['Cyberman']};await ctx.g.move(c,'battlefield',{ctrl:p,tapped,faceDownDef:old,faceDownKind:'wlmCyberman'});return c.zone==='battlefield';};
 C.retarget=async(ctx,so)=>{if(!ctx.g.stack.includes(so))return false;const src=so.card||so.srcCard,specs=so.targetSpecs||[];if(!src||!specs.length)return false;const next={g:ctx.g,you:so.ctrl,src,so,decisionPlayer:ctx.you,suppressTargetEvents:true};if(!await ctx.g.pickTargets(next,specs,src,so.ctrl))return false;so.targets=next.targets;so.targetIdentities=ctx.g.captureTargetIdentities(next.targets);if(so.ctx){so.ctx.targets=so.targets;so.ctx.targetIdentities=so.targetIdentities;}for(const card of C.flat(so.targets))await ctx.g.emit('targeted',{card,byPlayer:so.ctrl,src,isSpell:so.kind==='spell',isActivatedAbility:so.kind==='ability',isTriggeredAbility:so.kind==='trigger',so});ctx.g.queueWardTriggers(so,next);return true;};
 C.addBlocker=(ctx,c,a)=>{if(!a||a.zone!=='battlefield'||!a.attacking)return;c.blocking=a.iid;a.blockedBy.push(c);a.wasBlocked=true;ctx.g.recalc();};
 C.temporaryCopy=(ctx,target,def)=>{M.OracleV8Copies.applyCopy(ctx.g,ctx.src,def);const layer=ctx.g.untilEffects.filter(e=>e.oracleCopyLayer&&e.iid===ctx.src.iid).at(-1);if(layer)layer.wlmTappedTarget={iid:target.iid,version:target.zoneVersion,untapEpoch:target.meta.oracleUntapEpoch||0};};
 const costs=G.faceUpCosts;G.faceUpCosts=function(c){const rows=costs.call(this,c);return c.meta.faceDownKind==='wlmCyberman'?rows.filter(r=>r.kind!=='mana cost'):rows;};
 const oldRecalc=G.recalc;G.recalc=function(){
  this.untilEffects=this.untilEffects.filter(e=>!e.wlmTappedTarget||(()=>{const r=e.wlmTappedTarget,c=this.byIid(r.iid);return c?.zone==='battlefield'&&c.zoneVersion===r.version&&c.tapped&&(c.meta.oracleUntapEpoch||0)===r.untapEpoch;})());
  const result=oldRecalc.call(this),bf=this.bf();
  for(const e of this.untilEffects){const c=e.iid&&this.byIid(e.iid);if(!c||c.zone!=='battlefield'||c.zoneVersion!==e.zoneVersion)continue;
   if(e.kind==='wlmBase'){c.cur.power+=e.power-c.cur.basePower;c.cur.toughness+=e.toughness-c.cur.baseToughness;c.cur.basePower=e.power;c.cur.baseToughness=e.toughness;}
   if(e.kind==='wlmName'){c.cur.name=e.name;if(e.legendary&&!c.cur.super.includes('Legendary'))c.cur.super.push('Legendary');}
   if(e.kind==='wlmSourceGoad'){const s=this.byIid(e.source);if(s?.zone==='battlefield'&&s.zoneVersion===e.sourceVersion)(c.cur.goadedBy||=[]).push(this.players[e.by]);}
  }
  for(const c of bf){
   if(c.meta.wlmPermanentIsland||c.meta.wlmFlood&&c.counters.flood>0){if(!c.cur.subtypes.includes('Island'))c.cur.subtypes.push('Island');c.cur.extraMana.push({cost:{tap:true},produce:[{U:1}]});}
   if(c.meta.wlmVislor&&c.ctrl.idx===c.meta.wlmVislor.ctrl)(c.cur.goadedBy||=[]).push(this.players[c.meta.wlmVislor.by]);
   if(this.untilEffects.some(e=>e.kind==='wlmUnblockAll'))c.cur.unblockable=true;
   c.cur.power+=c.is('Creature')?c.ctrl.emblems.filter(e=>e.wlmSorin).length:0;
   if(c.meta.wlmReanimated&&c.def.wlmNecromancy&&!c.cur.subtypes.includes('Aura'))c.cur.subtypes.push('Aura');
   if(c.meta.wlmNoCreatureTurn===this.turnNo)c.cur.types=c.cur.types.filter(t=>t!=='Creature');
   if(C.live(c)&&c.def.wlmXenagos&&this.devotion(c.ctrl,['R','G'])<7)c.cur.types=c.cur.types.filter(t=>t!=='Creature');
   if(C.live(c)&&c.def.wlmFeline)for(const x of this.creatures(c.ctrl))if(x!==c&&x.hasSub('Cat'))x.cur.protectionFrom.push((g,s)=>s.hasSub?.('Dog'));
   if(C.live(c)&&c.def.wlmDanny)for(const x of this.creatures(c.ctrl))x.cur.extraTriggers.push({on:'countersPlaced',filter:(g,s,d)=>d.card===s&&d.wlmFirstCounters,desc:'Danny Pink: draw a card',run:ctx=>C.draw(ctx)});
   if(C.live(c)&&(c.def.wlmDan||c.def.wlmGemcutter))for(const a of bf)if(a.ctrl===c.ctrl&&a.is('Artifact')&&(c.def.wlmDan?!a.is('Creature')&&!a.def.subtypes.includes('Equipment'):a.hasSub('Treasure'))){if(!a.cur.subtypes.includes('Equipment'))a.cur.subtypes.push('Equipment');const bonus=c.def.wlmDan?1:2,h=this.byIid(a.attachedTo);if(h?.zone==='battlefield')h.cur.power+=bonus;for(const [cost,pirate]of c.def.wlmDan?[['{1}',false]]:[['{1}',true],['{3}',false]])a.cur.extraAbilities.push({label:pirate?'Equip Pirate {1}':'Equip '+cost,cost:{mana:cost},sorcery:true,targets:[T.yourCreature({filter:(g,t,p,s)=>t!==s&&t.ctrl===p&&(!pirate||t.hasSub('Pirate'))})],run:ctx=>ctx.targets[0]&&ctx.g.attach(ctx.src,ctx.targets[0])});}
  }
  return result;
 };
 SC['Branching Evolution'].plusCountersAdjust=(n,g,c,s)=>C.live(s)&&c.is('Creature')?n*2:n;
 SC['Duggan, Private Detective'].oracleCharacteristicPT=true;
 SC['Duggan, Private Detective'].cdaPower=SC['Duggan, Private Detective'].cdaToughness=(g,c)=>c.ctrl.hand.length;
 SC['The Cyber-Controller'].statics=[{apply:(g,c,bf)=>{for(const x of bf)if(x!==c&&x.ctrl===c.ctrl&&x.is('Creature')&&x.is('Artifact')){x.cur.power++;x.cur.toughness++;}}}];
 SC['The Dalek Emperor'].selfCostAdjust=(g,c,p)=>-g.bf().filter(c=>c.ctrl===p&&c.hasSub('Dalek')).length;
 SC['The Dalek Emperor'].statics=[C.subtype('Dalek',true,0,0,['haste'])];
 SC['The Valeyard'].vnExtraVote=true;
 const replacements=G.replacers;G.replacers=function(kind){const rows=replacements.call(this,kind);if(kind==='createToken')for(const c of C.sources(this,null,'wlmJinnie'))rows.push({key:c,src:c,ctrl:c.ctrl,run:async(g,defs,p)=>{const key=await C.option({g,src:c,you:p},[{key:'keep',label:'Create the original tokens'},{key:'cat',label:'Create 2/2 green Cats with haste'},{key:'dog',label:'Create 3/1 green Dogs with vigilance'}],'Choose token form');if(!['keep','cat','dog'].includes(key))throw Error('Invalid token form');return key==='keep'?defs:defs.map(()=>C.token(key==='cat'?'Cat':'Dog',[key==='cat'?'Cat':'Dog'],key==='cat'?2:3,key==='cat'?2:1,['G'],[key==='cat'?'haste':'vigilance']));}});
  if(kind==='damage')for(const c of this.bf().filter(C.live)){if(c.def.wlmDrums)rows.push({key:c,src:c,ctrl:c.ctrl,applies:(g,d)=>d.combat&&d.src?.iid===c.attachedTo,run:(g,d)=>d.n*2});if(c.def.wlmWeeping)rows.push({key:c,src:c,ctrl:c.ctrl,prevent:true,applies:(g,d)=>d.src===c&&d.combat&&d.target?.is?.('Creature'),run:async(g,d)=>{const target=d.target;await g.move(target,'library');M.shuffle(target.owner.library,g.rnd);return 0;}});}return rows;};
 const canBlock=G.canBlock;G.canBlock=function(b,a){if(C.live(a)&&a.def.wlmGhost&&b.toughness>=3)return false;if(C.sources(this,a.ctrl,'wlmFish').length&&a.hasSub('Fish')&&b.hasSub('Human'))return false;const pilot=this.bf().find(c=>C.live(c)&&c.def.wlmPilot&&c.attachedTo===a.iid);if(pilot&&C.defender(a)!==a.owner)return false;return canBlock.call(this,b,a);};
 const canAttack=G.canAttackTarget;G.canAttackTarget=function(c,t){const p=t instanceof M.Player?t:t?.ctrl;if(C.live(c)&&c.def.wlmPortRazer&&(c.meta.wlmAttackedPlayers||[]).some(r=>r.turn===this.turnNo&&r.idx===p?.idx))return false;if(this.untilEffects.some(e=>e.kind==='wlmPeace'&&e.player===c.ctrl.idx&&e.protected===p?.idx&&c.ctrl.turnsStarted<=e.through))return false;if(this.wlmOnlyAttackers&&!this.wlmOnlyAttackers.some(r=>r.iid===c.iid&&r.version===c.zoneVersion))return false;return canAttack.call(this,c,t);};
 const handLimit=G.maximumHandSize;if(handLimit)G.maximumHandSize=function(p){return C.sources(this,null,'wlmNoHandLimit').length?Infinity:handLimit.call(this,p);};
 const drawOne=G.drawOne;G.drawOne=async function(p,s,o){if(C.sources(this,p,'wlmRiver').length&&p.library.length)p.library.push(p.library.shift());return drawOne.call(this,p,s,o);};
 const untap=G.untap;G.untap=function(c,...a){const r=untap.call(this,c,...a);if(!c.tapped&&this.untilEffects.some(e=>e.wlmTappedTarget?.iid===c.iid))this.recalc();return r;};
 const emit=G.emit;G.emit=function(name,d){
  if(name==='attacks'){d.card.meta.wlmAttackedTurn=this.turnNo;const p=C.defender(d.card);(d.card.meta.wlmAttackedPlayers||=[]).push({turn:this.turnNo,idx:p?.idx});}
  if(name==='countersPlaced'){d.wlmFirstCounters=d.card.meta.wlmCounterTurn!==this.turnNo;d.card.meta.wlmCounterTurn=this.turnNo;}
  if(name==='abilityActivated'&&d.ability?.wlmOnce)d.card.meta[d.ability.wlmOnce]=true;
  if(name==='cast'&&d.isCreature)for(const c of this.bf())if(C.live(c)&&c.def.wlmAngel&&c.ctrl!==d.player)this.queueTrigger({src:c,ctrl:c.ctrl,name:c.name+': cease being a creature until end of turn',run:ctx=>{if(C.same(ctx)){ctx.src.meta.wlmNoCreatureTurn=ctx.g.turnNo;ctx.g.recalc();}}});
  if(name==='cast'&&d.card&&d.so){d.so.wlmFirstElsewhere=d.so.from!=='hand'&&!(d.player.turnState.wlmParadox>0);d.wlmCascade=!!d.so.cdkHasCascade;if(d.so.castOpts?.faceDownCast)d.player.turnState.wlmFaceDownDiscount=0;}
  if(name==='dies'&&d.snap?.subtypes?.includes('Dalek')){if(this.wlmDalekDeathTurn!==this.turnNo){this.wlmDalekDeathTurn=this.turnNo;this.wlmDalekDeathPower=0;}this.wlmDalekDeathPower+=Math.max(0,d.snap.power);}
  if(name==='blockersDeclared')for(const c of d.attackers||[])if(C.live(c)&&c.def.wlmCybermat&&!c.blockedBy.length)this.queueTrigger({src:c,ctrl:c.ctrl,name:'Cybermat: grow for attacking artifact creatures',run:ctx=>C.same(ctx)&&C.buff(ctx,ctx.src,ctx.g.creatures().filter(c=>c.attacking&&c.is('Artifact')).length,0)});
  if(name==='damageToPlayer'||name==='dealtDamage')if(d.n>0&&d.src&&C.live(d.src)&&d.src.def.wlmForetold)this.queueTrigger({src:d.src,ctrl:d.src.ctrl,name:'The Foretold Soldier: exile face down and foretell',run:async ctx=>{if(!C.same(ctx))return;await ctx.g.move(ctx.src,'exile',{exileFaceDown:true,exileLookers:[ctx.you.idx]});if(ctx.src.zone==='exile'){ctx.src.meta.foretold=true;ctx.src.meta.foretellTurn=ctx.g.turnNo;}}});
  return emit.call(this,name,d);
 };

 const cycling=G.cyclingOptions;G.cyclingOptions=function(p,c){const rows=cycling.call(this,p,c);if(c.zone==='hand'&&C.historic(c))for(const s of C.sources(this,p,'wlmCycling'))rows.push({cyclingId:'wlm:'+s.iid+':'+s.zoneVersion,definition:{cost:'{2}{W}'},label:'Cycling {2}{W} — '+s.name});return rows;};
 const tax=G.spellCost;G.spellCost=function(p,c,a={}){const cost=tax.call(this,p,c,a);if(a.faceDownCast)cost.generic=Math.max(0,cost.generic-(p.turnState.wlmFaceDownDiscount||0));return cost;};
 C.limitedCombat=(ctx,cs)=>{ctx.g.scheduleAdditionalCombat();const phase=ctx.g._additionalPhases.at(-1);phase.wlmOnlyAttackers=cs.map(c=>({iid:c.iid,version:c.zoneVersion}));};
 const combat=G.combatPhase;G.combatPhase=async function(...a){const prior=this.wlmOnlyAttackers;this.wlmOnlyAttackers=this.wlmNextCombat||null;delete this.wlmNextCombat;try{return await combat.apply(this,a);}finally{this.wlmOnlyAttackers=prior;}};
})();
