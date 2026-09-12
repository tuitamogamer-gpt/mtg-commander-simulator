'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.POM,G=M.Game.prototype,SC=M.SCRIPTS;
 const castSource=(g,p,c)=>C.sources(g,p,'pomGraveCast').filter(s=>g.turnPlayer===p&&s.meta.pomCastTurn!==g.turnNo&&(s.def.pomGraveCast==='arcade'?c.owner===p&&(c.is('Artifact')||c.hasSub('Human'))&&c.mv<=C.count(s,'quest'):c.meta.pomMilledTurn===g.turnNo&&(s.def.pomGraveCast==='coram'||c.owner===p)));
 C.landSources=(g,p,c)=>c.zone==='graveyard'&&c.is('Land')?g.bf().filter(s=>s.ctrl===p&&C.live(s)&&(s.def.pomHazezon&&c.owner===p&&c.hasSub('Desert')||s.def.pomGraveCast==='coram'&&g.turnPlayer===p&&s.meta.pomLandTurn!==g.turnNo&&c.meta.pomMilledTurn===g.turnNo)):[];
 const S=M.StarterCasting,prior={offers:S.offers,allowed:S.allowed,commit:S.commit,validate:S.validate};
 const offers=(g,p)=>g.players.flatMap(p=>p.graveyard).filter(c=>!c.is('Land')).flatMap(c=>castSource(g,p,c).flatMap(s=>C.castVariants(g,c,{}).filter(v=>s.def.pomGraveCast!=='arcade'||(g.castHasType(c,v,'Artifact')||g.castDefinition(c,v).subtypes?.includes('Human'))&&M.mv(g.castDefinition(c,v).cost||'')<=C.count(s,'quest')).map(v=>({card:c,from:'graveyard',alt:{...v,starterPermission:'pom',starterCardVersion:c.zoneVersion,pomSource:s.iid,pomVersion:s.zoneVersion,label:'Cast with '+s.name}}))));
 S.offers=(g,p)=>prior.offers(g,p).concat(offers(g,p));
 S.allowed=(g,p,c,a)=>a.starterPermission!=='pom'?prior.allowed(g,p,c,a):g.canCastTiming(p,c,a)&&offers(g,p).some(r=>r.card===c&&Object.keys(r.alt).every(k=>JSON.stringify(a[k])===JSON.stringify(r.alt[k]))&&Object.keys(a).every(k=>k==='from'?a[k]===c.zone:k==='xVal'?Number.isSafeInteger(a[k])&&a[k]>=0:JSON.stringify(a[k])===JSON.stringify(r.alt[k])));
 S.validate=ctx=>ctx.so.castOpts.starterPermission==='pom'?S.allowed(ctx.g,ctx.you,ctx.src,ctx.so.castOpts):prior.validate(ctx);
 S.commit=ctx=>{if(ctx.so.castOpts.starterPermission==='pom'){const s=ctx.g.byIid(ctx.so.castOpts.pomSource);if(s)s.meta.pomCastTurn=ctx.g.turnNo;}else prior.commit(ctx);};
 const face=M.OracleV8Faces.castChoiceAllowed;M.OracleV8Faces.castChoiceAllowed=(g,p,c,a)=>a.starterPermission==='pom'?S.allowed(g,p,c,a):face(g,p,c,a);
 const lands=G.playableLands;G.playableLands=function(p){const out=lands.call(this,p);if(p.landsPlayed<this.landPlayLimit(p))for(const c of this.players.flatMap(p=>p.graveyard))if(C.landSources(this,p,c).length)out.push(c);return [...new Set(out)];};
 const playLand=G.playLand;G.playLand=async function(p,c,...a){const sources=C.landSources(this,p,c),v=c.zoneVersion,r=await playLand.call(this,p,c,...a);if(c.zoneVersion!==v&&sources.length&&!sources.some(c=>c.def.pomHazezon))sources[0].meta.pomLandTurn=this.turnNo;return r;};
 const hasSub=M.CardInst.prototype.hasSub;M.CardInst.prototype.hasSub=function(s){if(s==='Desert'&&this.zone!=='battlefield'&&this.is('Land')&&C.sources(this.owner.game,this.owner,'pomDune').length)return true;return hasSub.call(this,s);};
 const is=M.CardInst.prototype.is;M.CardInst.prototype.is=function(t){if(t==='Creature'&&this.def.pomGrist&&this.zone!=='battlefield')return true;return is.call(this,t);};
 const canBlock=G.canBlock;G.canBlock=function(b,a){if(b.cur.pomCantBlock||a.cur.pomHasteBlockers&&!b.kw('haste')||this.untilEffects.some(e=>e.kind==='pomParity'&&b.mv%2===e.parity))return false;const p=C.defender(a);if(C.live(a)&&(a.def.pomNightkin&&C.count(p,'rad')>0||a.def.pomHazezon&&this.lands(p).some(c=>c.hasSub('Desert'))))return false;return canBlock.call(this,b,a);};
 const timing=G.canCastTiming;G.canCastTiming=function(p,c,a={}){if((this.pomSingleCombat||[]).some(r=>this.players[r.player]?.turnsStarted<=r.throughTurn)&&this.castDefinition(c,a).types.some(t=>['Creature','Planeswalker'].includes(t)))return false;return timing.call(this,p,c,a);};
 const attackTarget=G.canAttackTarget;G.canAttackTarget=function(c,t){if((this.pomNoAttack||[]).some(r=>r.player===c.ctrl.idx&&r.turn===this.turnNo&&r.combat===(this.cdkCombatSerial||0)))return false;return attackTarget.call(this,c,t);};
 const recalc=G.recalc;G.recalc=function(){const r=recalc.call(this);for(const c of this.bf()){if(c.is('Creature')&&c.ctrl.emblems.some(e=>e.pomVivien)){c.cur.power+=2;c.cur.toughness+=2;for(const k of ['vigilance','trample','indestructible'])if(c.is('Creature'))c.cur.kw.add(k);}}return r;};
 const energyGain=M.OracleV8Energy.gain;M.OracleV8Energy.gain=async(g,p,n,s)=>{if(n>0){const effects=g.bf().filter(c=>C.live(c)&&c.ctrl===p&&(c.def.pomConstrictor||c.def.pomExtraEnergy||c.def.pomDoubleEnergy));while(effects.length){const ctx={g,src:s||effects[0],you:p},options=effects.map(c=>({key:String(c.iid),label:c.name}));const key=effects.length===1?options[0].key:await C.option(ctx,options,'Choose the next energy replacement');const i=effects.findIndex(c=>String(c.iid)===key);if(i<0)throw Error('Invalid energy replacement');const c=effects.splice(i,1)[0];n=c.def.pomDoubleEnergy?n*2:n+1;}}return energyGain(g,p,n,s);};
 const add=G.addCounters;G.addCounters=function(c,k,n,...args){if(n>0&&c.zone==='battlefield'&&(c.is('Creature')||c.is('Artifact')))n+=C.sources(this,c.ctrl,'pomConstrictor').length;return add.call(this,c,k,n,...args);};
 const sourceSnapshot=G.snapshot;G.snapshot=function(c,...args){const s=sourceSnapshot.call(this,c,...args);s.basePower=c.cur?.basePower??(Number(c.def.power)||0);s.baseToughness=c.cur?.baseToughness??(Number(c.def.toughness)||0);return s;};
 const produce=G.manaSources;G.manaSources=function(p,...args){const out=produce.call(this,p,...args),n=C.sources(this,p,'pomManaReflection').length;return out.filter(s=>!s.extraCost?.pomExileGY||p.graveyard.length>=s.extraCost.pomExileGY).map(s=>n&&s.extraCost?.tap&&!s.m?.viaConvoke?{...s,produce:s.produce.map(o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,k==='n'?v:v*2**n])))}:s);};
 const spellCost=G.spellCost;G.spellCost=function(p,c,a={}){const cost=spellCost.call(this,p,c,a),n=p.turnState.pomNextDiscount||0;if(cost.x)cost.xReduction=(cost.xReduction||0)+n;else cost.generic=Math.max(0,cost.generic-n);for(const s of C.sources(this,p,'pomMorophon'))if(this.castDefinition(c,a).subtypes?.includes(s.meta.pomType)||this.castDefinition(c,a).changeling)for(const col of ['W','U','B','R','G']){const i=cost.pips.findIndex(p=>p.includes(col));if(i>=0)cost.pips.splice(i,1);}return cost;};
 const oldUntap=G.untap;G.untap=function(c,...args){if(this.phase==='untap'&&c.cur?.pomSkipUntap)return;return oldUntap.call(this,c,...args);};
 C.skipDraw=(g,p)=>C.sources(g,p,'skipDrawStep').length>0;
 const maxHand=G.maximumHandSize;G.maximumHandSize=function(p){if(this.bf().some(c=>c.ctrl===p&&c.cur?.pomNoMaxHand))return Infinity;return maxHand.call(this,p);};
 C.prepareAbility=async(ctx,cost)=>{const {g,src:s,you:p,ability:a}=ctx;
  if(a.pomEnergyX){const n=await p.controller.decide(g,{type:'chooseX',min:0,max:C.count(p,'energy'),card:s,prompt:'Choose energy to pay',aiHint:{kind:'chooseX',card:s}});if(!Number.isSafeInteger(n)||n<0||n>C.count(p,'energy'))return false;cost.energy=n;ctx.pomEnergyPaid=n;}
  if(a.pomEnergyTarget)cost.energy=ctx.targets[0]?.mv||0;
  if(a.pomCost){const i=a.pomCost,pool=(i.zone==='battlefield'?g.bf():g.players.flatMap(p=>p[i.zone])).filter(c=>i.filter(g,c,s,p));if(!pool.length)return false;const cs=await C.choose(g,p,pool,1,1,'Pay additional cost for '+s.name,'sacCost');ctx.pomCostRows=cs.map(c=>({...C.row(c),definition:C.snapshotCopy(c)}));}
  if(a.pomUniqueModes&&s.meta.pomModes?.includes(ctx.mode))return false;
  return true;
 };
 C.validateAbility=ctx=>(ctx.pomCostRows||[]).every(r=>C.current(r)&&ctx.ability.pomCost.filter(ctx.g,r.card,ctx.src,ctx.you));
 C.commitAbility=async ctx=>{for(const r of ctx.pomCostRows||[])await ctx.g.move(r.card,ctx.ability.pomCost.to);if(ctx.ability.pomUniqueModes)(ctx.src.meta.pomModes||=[]).push(ctx.mode);};
 const emit=G.emit;G.emit=function(on,d){
  if(on==='cast'&&d.player){delete d.player.turnState.pomNextDiscount;for(const r of this.pomNukeGrants||[])if(r.player===d.player.idx&&d.player.turnsStarted<=r.throughTurn){const src=this.byIid(r.source);this.queueTrigger({src,ctrl:this.players[r.controller],name:'Nuka-Nuke Launcher: two rad counters',run:ctx=>C.rad(ctx,d.player,2)});}}
  if(on==='etb'&&d.card.is('Artifact'))d.card.ctrl.turnState.pomArtifactEntered=true;
  if(on==='attackedPlayer'){const p=d.player,defender=d.defender;if(defender){const a=p.turnState.pomAttackedPlayers||=[];if(!a.includes(defender.idx))a.push(defender.idx);}}
  if(on==='etb'&&d.card.is('Creature')&&!d.card.isToken)for(const s of C.sources(this,d.card.ctrl,'pomFabricate'))if(s!==d.card){const c=d.card,t=C.mechanic('fabricate',{}, {n:1}).triggers[0];this.queueTrigger({src:c,ctrl:c.ctrl,name:'Fabricate 1',data:d,run:t.run,prepareTargets:t.prepareTargets});}
  return emit.call(this,on,d);
 };
 const demonstrate=M.WLM.demonstrate;M.WLM.demonstrate=(g,p,s)=>demonstrate(g,p,s)||g.castHasType(s.card,s.castOpts||{},'Creature')&&C.sources(g,p,'pomDemonstrate').length>0;
 C.snapshotBlockers=g=>['pomNukeGrants','pomSingleCombat','pomNoAttack'].filter(k=>g[k]?.length).map(k=>'PIP / OTC / M3C temporary rules: '+k);
})();
