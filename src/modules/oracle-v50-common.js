'use strict';
((M)=>{
 const G=M.Game.prototype,H=M.OracleV20.helpers,live=r=>r.card.zone==='battlefield'&&!r.card.phasedOut&&r.card.zoneVersion===r.version;
 async function select(ctx,p,from,n,max=n){if(from.length<n)return null;const cards=await p.controller.decide(ctx.g,{type:'chooseCards',from,min:n,max:Math.min(max,from.length),prompt:ctx.src.name+': choose cards',aiHint:{kind:'bestCard',src:ctx.src}});if(!Array.isArray(cards)||cards.length<n||cards.length>max||new Set(cards).size!==cards.length||cards.some(c=>!from.includes(c)))throw Error('Invalid v50 cards');return cards;}
 async function option(ctx,p,prompt,options=[{key:'yes',label:'Yes'},{key:'no',label:'No'}]){const answer=await p.controller.decide(ctx.g,{type:'chooseOption',prompt:ctx.src.name+': '+prompt,options,aiHint:{kind:'confirm',src:ctx.src}});if(!options.some(o=>o.key===answer))throw Error('Invalid v50 option');return answer;}
 const payment=M.OracleV20Costs.commitActivation;M.OracleV20Costs.commitActivation=async function(ctx,cost){const result=await payment.call(this,ctx,cost);if(result&&cost.additionalCostV20?.kind==='forage')await ctx.g.emit('foragedV50',{player:ctx.you,card:ctx.src});return result;};
 const attack=G.canAttackAtAll;G.canAttackAtAll=function(c,...args){return !(c.meta.attackLocksV50||[]).some(r=>r.version===c.zoneVersion&&r.player===this.turnPlayer&&r.player.turnsStarted===r.after+1)&&attack.call(this,c,...args);};
 const damage=G.recordDamageResult;G.recordDamageResult=function(src,target,n,opts={}){if(n>0&&target instanceof M.Player){const snap=src?._oracleDamageSnapshot||opts._damageBatch?.snapshots?.get(src)||this._oracleDamageBatch?.snapshots?.get(src);if(snap?snap.types?.includes('Artifact'):src?.is?.('Artifact'))target.turnState.artifactDamageV50=(target.turnState.artifactDamageV50||0)+n;}return damage.call(this,src,target,n,opts);};
 M.OracleV20.handlers.push({
  amount(v,ctx){if(v.kind==='artifact-damage-v50')return 2*(ctx.you.turnState.artifactDamageV50||0);},
  target(g,c,p,s,v){if(v.kind==='named-v50')return M.OracleV8NameGroups.names(c).includes(v.name);if(v.kind==='nonartifact-nonland-v50')return !c.is('Artifact')&&!c.is('Land');},
  compile(op,script,entry,h){
   if(op.kind==='common-entry-v50'){const previous=script.asEnters;script.asEnters=async(g,s)=>{if(previous)await previous(g,s);if(op.mode==='discard-hand')await g.discard(s.ctrl,s.ctrl.hand.slice());else if(op.mode==='sacrifice-lands')await g.sacrificeMany(s.ctrl,g.lands(s.ctrl));else throw Error('Unknown entry '+op.mode);};return true;}
   if(op.kind!=='generic-trigger'||!op.partnerV50)return false;
   const t=h.compileGenericTrigger(op),prior=t.filter,run=t.run,key=Symbol('partnerV50');
   t.filter=(g,s,d)=>{if(!prior(g,s,d))return false;const host=op.partnerV50.attached?g.byIid(s.attachedTo):s,own=op.event==='blocks'?d.blocker:d.attacker,other=op.event==='blocks'?d.attacker:d.blocker;if(!host||own!==host||!other||op.partnerV50.notWall&&other.hasSub('Wall')||op.partnerV50.equipped&&!other.attachments.some(id=>g.byIid(id)?.hasSub('Equipment')))return false;if(!d[key])Object.defineProperty(d,key,{value:new Map()});d[key].set(s.iid,{card:other,version:other.zoneVersion});return true;};
   t.run=ctx=>{ctx.partnerV50=ctx.data?.[key]?.get(ctx.src.iid);return run(ctx);};h.triggers.push(t);return true;
  },
  targetHint(e){if(e.action==='common-effects-v50')return {goal:e.mode==='destroy-blocker-trample'?'destroy':'buff'};},
  async effect(ctx,e){
   if(e.action!=='common-effects-v50')return false;const g=ctx.g,p=ctx.you,s=ctx.src,c=H.genericEffectSubjects(ctx,e.target)[0],cap=ctx.oracleSourceCapture||{},run=(effects,targets=ctx.targets)=>H.runGenericEffects({...ctx,targets},effects,true);
   switch(e.mode){
    case 'forage':{
     const grave=p.graveyard.slice(),foods=g.bf().filter(c=>c.ctrl===p&&c.hasSub('Food')&&g.canSacrifice(c)),options=[...(grave.length>=3?[{key:'grave',label:'Exile three cards from your graveyard'}]:[]),...(foods.length?[{key:'food',label:'Sacrifice a Food'}]:[])];
     if(!options.length||await option(ctx,p,'Forage?')!=='yes')break;
     const kind=options.length===1?options[0].key:await option(ctx,p,'Choose forage payment',options),chosen=await select(ctx,p,kind==='food'?foods:grave,kind==='food'?1:3);
     if(kind==='food'){if(!await g.sacrifice(p,chosen[0]))break;}else await g.moveGraveyardBatch(chosen,'exile');
     await g.emit('foragedV50',{player:p,card:s});
     if(e.reflexive){const body=e.follow;g.queueTrigger({src:s,ctrl:p,data:ctx.data,name:'When you forage',targets:body.targets.map((target,i)=>H.genericTargetSpec(target,body.effects,i,ctx.data)),prepareTargets:async child=>{for(const k of ['sourceIid','sourceTimestamp','sourceZoneVersion','oracleSourceCapture','eventCardZoneVersion'])if(ctx[k]!==undefined)child[k]=ctx[k];return H.prepareGenericDivisions(child,body.effects);},run:child=>H.runGenericEffects(child,body.effects)});}else await run(e.follow.effects);break;
    }
    case 'loot-once':{const key=s.meta.lootV50;if(key?.version===ctx.sourceZoneVersion&&key.turn===g.turnNo||!p.hand.length||await option(ctx,p,'Discard a card to draw a card?')!=='yes')break;const [card]=await select(ctx,p,p.hand.slice(),1),before=p.turnState.discardedN||0;await g.discard(p,[card]);if((p.turnState.discardedN||0)>before){s.meta.lootV50={version:ctx.sourceZoneVersion,turn:g.turnNo};await g.draw(p,1);}break;}
    case 'partner-delay':{const row=ctx.partnerV50;if(!row)throw Error('Missing combat partner');const src=H.oracleDamageSource(ctx);g.delayed.push({on:'endCombat',once:true,src:s,ctrl:p,name:s.name+' — combat partner',run:async child=>{if(!live(row))return;if(e.equipment)await child.g.destroyMany(child.g.bf().filter(c=>c.hasSub('Equipment')&&c.attachedTo===row.card.iid));else if(e.damage)await child.g.damageBatch([{src,target:row.card,n:e.damage}],{deferSBA:true});else await child.g.destroy(row.card);}});break;}
    case 'partner-next-turn':{const row=ctx.partnerV50;if(row&&live(row))(row.card.meta.attackLocksV50 ||= []).push({version:row.version,player:row.card.ctrl,after:row.card.ctrl.turnsStarted});break;}
    case 'opponent-damage-sacrifice':{for(const q of g.apnapFrom(g.turnPlayer||p).filter(q=>q!==p))if(await option(ctx,q,'Take '+e.n+' damage?')==='yes'){await g.damageBatch([{src:H.oracleDamageSource(ctx),target:q,n:e.n}],{deferSBA:true});if(H.sameBattlefieldSource(ctx)&&s.ctrl===p)await g.sacrifice(p,s);break;}break;}
    case 'entry-color-destroy':{const card=cap.eventCard,view=card?.zoneVersion===cap.eventCardZoneVersion?card:card?.battlefieldLKI?.get(cap.eventCardZoneVersion)||cap.eventSnap;if(view)await g.destroyMany(g.bf().filter(c=>c.is('Creature')&&!(c===card&&c.zoneVersion===cap.eventCardZoneVersion)&&c.colors.some(color=>view.colors.includes(color))),{noRegen:true});break;}
    case 'return-drain':if(H.sameBattlefieldSource(ctx)){await g.move(s,'hand');await run([{action:'lose-life',who:'each-opponent',n:2},{action:'gain-life',who:'you',n:2}]);}break;
    case 'grave-top':if(c){const top=c.graveyard.at(-1);if(top?.is('Creature'))await g.move(top,'library');}break;
    case 'worker-life':await g.gainLife(p,['Power Plant Worker','Tower Worker'].every(name=>g.creatures(p).some(c=>M.OracleV8NameGroups.names(c).includes(name)))?3:1,s);break;
    case 'roll-damage':{const [n]=await g.rollDice(p,6,1,{source:s});if(n<=4)await g.damageBatch([{src:H.oracleDamageSource(ctx),target:p,n}],{deferSBA:true});break;}
    case 'distinct-dice-tokens':{const rolls=await g.rollDice(p,6,3,{source:s});await g.makeTokens({name:'Clown Robot',types:['Artifact','Creature'],subtypes:['Clown','Robot'],colors:['W'],power:1,toughness:1,kws:[]},p,{n:new Set(rolls).size});break;}
    case 'destroy-blocker-trample':if(c){const pairs=(g.combatPairsV48||[]).filter(r=>r.turn===g.turnNo&&r.blocker===c&&r.bv===c.zoneVersion),targets=[...new Set(pairs.filter(r=>r.attacker.zone==='battlefield'&&r.attacker.zoneVersion===r.av).map(r=>r.attacker))];await g.destroy(c);await run([{action:'pump',target:0,power:0,toughness:0,keywords:['trample']}],[targets]);}break;
    case 'pay-or-life':{const q=cap.eventController;if(!q||!g.canPayMana(q,M.parseCost('{2}'),null)||await option(ctx,q,'Pay {2} to prevent life gain?')!=='yes'||!await g.payMana(q,M.parseCost('{2}'),null))await g.gainLife(p,2,s);break;}
    case 'search-hand-grave':{if(g.canSearchLibrary(p)){const from=p.library.filter(c=>c.is('Creature')),[card]=await select(ctx,p,from,0,1);if(card){await g.revealToHuman({cards:[card],ctrl:p,kind:'reveal'});const destination=await option(ctx,p,'Choose destination',[{key:'hand',label:'Hand'},{key:'graveyard',label:'Graveyard'}]);await g.move(card,destination);}}M.shuffle(p.library,g.rnd);break;}
    default:throw Error('Unknown v50 effect '+e.mode);
   }return true;
  }
 });
})(globalThis.MTG ||= {});
