'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.LC,G=M.Game.prototype;
 C.right=(g,p)=>{const all=g.players.filter(p=>!p.lost),i=all.indexOf(p);return all[(i+all.length-1)%all.length];};
 C.neighbor=(g,p,dir)=>{const all=g.players.filter(p=>!p.lost),i=all.indexOf(p);return all[(i+(dir==='right'?all.length-1:1))%all.length];};
 // Mutable consumption belongs to the game graph, so AI clones receive their
 // own state. Spell and loyalty listeners share one first-event permission.
 C.nextCopy=(ctx,rule)=>{const shared={event:null};for(const event of [...(rule.spell?['cast']:[]),...(rule.loyalty||rule.walkerType?['abilityActivated']:[])])ctx.g.delayed.push({on:event,once:false,expires:'eot',src:ctx.src,ctrl:ctx.you,lcCopyState:shared,name:'Copy the spell or ability',filter:(g,d,row)=>{if(d.player!==row.ctrl||!(event==='cast'?g.isInstantSorcerySpell(d.so):!d.isMana&&(rule.walkerType?d.card.is('Planeswalker')&&d.card.hasSub(rule.walkerType):d.ability?.loyalty!==undefined)))return false;if(rule.once===false)return true;const state=row.lcCopyState;if(state.event&&state.event!==d)return false;state.event=d;return true;},run:async next=>{const so=next.data.so||next.data.stackObject;if(!so)return;if(so.kind==='spell')await next.g.copySpells(so,next.you,rule.n,{mayNewTargets:true});else for(let i=0;i<rule.n;i++)await next.g.copyStackAbility(so,next.you,{mayNewTargets:true});}});};
 G.canActivateLoyalty=function(c){const used=c.meta.lcLoyaltyTurn===this.turnNo?c.meta.lcLoyaltyCount||0:c.meta._loyUsed===this.turnNo?1:0;const walker=c.is('Planeswalker'),base=walker&&this.bf().some(s=>s.ctrl===c.ctrl&&C.live(s)&&s.def.lcOathTeferi)?2:1;return used<base+(walker&&c.ctrl.turnState.lcVeilTurn===this.turnNo?c.ctrl.turnState.lcVeil||0:0);};
 G.recordLoyaltyActivation=function(c){const used=c.meta.lcLoyaltyTurn===this.turnNo?c.meta.lcLoyaltyCount||0:c.meta._loyUsed===this.turnNo?1:0;c.meta.lcLoyaltyTurn=this.turnNo;c.meta.lcLoyaltyCount=used+1;};
 const drawOne=G.drawOne;G.drawOne=async function(p,...a){if(p.turnState.drewThisTurn>=1&&this.bf().some(c=>c.ctrl!==p&&C.live(c)&&c.def.lcNarsetDraw))return null;return drawOne.call(this,p,...a);};
 const emit=G.emit;G.emit=async function(name,data){
  if(name==='monarchChanged')this.recalc();
  if(name==='damageToPlayer'){data.player.turnState.lcDamageTaken=(data.player.turnState.lcDamageTaken||0)+data.n;data.lcSourceVersion??=data.src?.zoneVersion;}
  if(name==='etb')data.lcCastMeta=data.card.castMeta;
  if(name==='tokensCreated')for(const token of data.tokens)await emit.call(this,'lcTokenCreated',{player:data.ctrl,token});
  return emit.call(this,name,data);
 };
 const canAttack=G.canAttackTarget;G.canAttackTarget=function(c,t){
  if(this.untilEffects.some(e=>e.kind==='lcCantAttackPlayer'&&e.who===c.ctrl&&e.target===t&&(e.combat===undefined||e.combat===this.afcCombatId)))return false;
  const teyo=this.untilEffects.filter(e=>e.kind==='lcTeyo').sort((a,b)=>b.timestamp-a.timestamp)[0];if(teyo){const p=t instanceof M.Player?t:t.ctrl;if(p!==C.neighbor(this,c.ctrl,teyo.direction))return false;}
  return canAttack.call(this,c,t);
 };
 const canBlock=G.canBlock;G.canBlock=function(b,a){if(this.untilEffects.some(e=>e.kind==='lcUnblockableBy'&&e.iid===a.iid&&e.version===a.zoneVersion&&e.player===b.ctrl))return false;return canBlock.call(this,b,a);};
 const attackTax=G.c21AttackTax;G.c21AttackTax=function(c,t){return attackTax.call(this,c,t)+(t?.is?.('Planeswalker')?this.bf().filter(s=>s.ctrl===t.ctrl&&C.live(s)&&s.def.lcOnakke).length:0);};
 const move=G.move;G.move=async function(c,to,o={}){
  if(c.zone==='battlefield'&&to==='graveyard'&&this.untilEffects.some(e=>e.kind==='lcExileDying'&&e.iid===c.iid&&e.version===c.zoneVersion))to='exile';
  return move.call(this,c,to,o);
 };
 const replacers=G.replacers;G.replacers=function(kind){const out=replacers.call(this,kind);if(kind==='damage')for(const p of this.players)for(const e of p.emblems)if(e.lcAjani)out.push({key:e,src:e.source,ctrl:p,prevent:true,applies:(g,d)=>d.target===p||d.target?.is?.('Planeswalker')&&d.target.ctrl===p,run:(g,d)=>Math.min(1,d.n)});return out;};
 const baseSliver=c=>(c.zone==='battlefield'?c.cur?.subtypes:c.def.subtypes)?.includes('Sliver')||!!c.def.changeling;
 C.extraTypes=(g,c)=>{if(!g||!c.is('Creature'))return [];return g.bf().filter(s=>C.live(s)&&s.def.lcRukarumel&&s.meta.lcType&&(c.zone==='battlefield'?c.ctrl===s.ctrl&&(!c.isToken||baseSliver(c)):c.zone==='stack'?c.ctrl===s.ctrl:c.owner===s.ctrl)).map(s=>s.meta.lcType);};
 const hasSub=M.CardInst.prototype.hasSub;M.CardInst.prototype.hasSub=function(t){return hasSub.call(this,t)||C.extraTypes(this.owner?.game,this).includes(t);};
 const castDefinition=G.castDefinition;G.castDefinition=function(c,o){const d=castDefinition.call(this,c,o),types=C.extraTypes(this,c);return types.length?{...d,subtypes:[...new Set(d.subtypes.concat(types))]}:d;};
 const encoreCache=new Map();M.SCRIPTS['Sliver Gravemother'].grantsGraveyardAbility={filter:(g,s,c,p)=>C.live(s)&&c.is('Creature')&&c.hasSub('Sliver'),make:(g,s,c)=>{const cost='{'+c.mv+'}';if(!encoreCache.has(cost)){const script={};M.OracleV8Encore.install(script,{kind:'mechanic-encore-v8',contract:'mechanic-encore-v8',cost});encoreCache.set(cost,script.gyAbility);}return encoreCache.get(cost);}};
 // Hatchery gives a separate replicate instance, including to itself.
 const replicate=M.C1920.replicatePayments;M.C1920.replicatePayments=async(g,p,c,a,cost,x)=>{const plans=await replicate(g,p,c,a,cost,x);if(!plans)return null;if(!g.castHasType(c,a,'Creature')||!c.hasSub('Sliver'))return plans;for(const source of g.bf().filter(s=>s.ctrl===p&&C.live(s)&&s.def.lcReplicateSlivers)){
  const str=g.castDefinition(c,a).cost;if(!str)continue;const r=M.parseCost(str);r.generic+=(r.x||0)*x;r.x=0;
  const zero=!r.generic&&!r.pips.length;let max=Number.MAX_SAFE_INTEGER;if(!zero){let low=0,high=g.maxAffordableX(p,{...cost,generic:cost.generic+(cost.x||0)*x,x:1},c,{castOpts:a})+1;while(low+1<high){const n=low+Math.floor((high-low)/2),combined={...cost,generic:cost.generic+r.generic*n,pips:cost.pips.concat(Array.from({length:n},()=>r.pips).flat())};if(g.canPayMana(p,combined,{card:c,castOpts:a},{xVal:x}))low=n;else high=n;}max=low;}
  if(!max)continue;const n=await p.controller.decide(g,{type:'chooseX',min:0,max,card:c,prompt:'Hatchery Sliver: replicate '+str+' how many times?',aiHint:{kind:'replicate',card:c}});if(!Number.isSafeInteger(n)||n<0||n>max)return null;if(n){cost.generic+=r.generic*n;if(r.pips.length)for(let i=0;i<n;i++)cost.pips=cost.pips.concat(r.pips);plans.push({count:n,source:{iid:source.iid,version:source.zoneVersion,controller:p.idx}});}
 }return plans;};
 C.prepareLinkedCost=async ctx=>{const key=ctx.ability.cost.lcReturnLinked,pool=C.linked(C.linkState(ctx.src,key)).filter(r=>r.card.is('Creature'));const[c]=await C.choose(ctx.g,ctx.you,pool.map(r=>r.card),1,1,'Put a creature exiled with Shelob into its owner’s graveyard');if(!c||!pool.some(r=>r.card===c&&C.current(r)))return false;ctx.lcLinkedCost=C.row(c);return true;};
})();
