'use strict';
((M)=>{
 const G=M.Game.prototype,H=M.OracleV20.helpers;
 const current=r=>r.card.zone==='battlefield'&&r.card.zoneVersion===r.version;
 async function yes(ctx,p,prompt){const options=[{key:'yes',label:'Yes'},{key:'no',label:'No'}],v=await p.controller.decide(ctx.g,{type:'chooseOption',prompt:ctx.src.name+': '+prompt,options,aiHint:{kind:'confirm',src:ctx.src}});if(!options.some(o=>o.key===v))throw Error('Invalid v49 choice');return v==='yes';}
 async function pick(ctx,p,from,n=1,max=n){if(!from.length)return [];n=Math.min(n,from.length);max=Math.min(max,from.length);const cards=await p.controller.decide(ctx.g,{type:'chooseCards',from,min:n,max,prompt:ctx.src.name+': choose cards',aiHint:{kind:'bestCard',src:ctx.src}});if(!Array.isArray(cards)||cards.length<n||cards.length>max||new Set(cards).size!==cards.length||cards.some(c=>!from.includes(c)))throw Error('Invalid v49 card choice');return cards;}
 const emit=G.emit;G.emit=async function(event,d,...args){
  if(event==='etb'&&d.card?.hasSub('Zombie'))(d.card.ctrl.turnState.zombieEntriesV49 ||= []).push({card:d.card,version:d.card.zoneVersion});
  if(event==='attackersDeclared')d.player.turnState.pirateVehicleAttackV49={combat:this.combat,pirate:d.attackers.some(c=>c.hasSub('Pirate')),vehicle:d.attackers.some(c=>c.hasSub('Vehicle'))};
  if(event==='draw'&&d.nth===1){const watchers=this.bf().filter(c=>c.ctrl===d.player&&!c.cur.abilitiesDisabled&&c.def.revealFirstDrawV49);if(watchers.length){await this.revealToHuman({cards:[d.card],ctrl:d.player,kind:'reveal'});for(const s of watchers)await emit.call(this,'revealedFirstDrawV49',{player:d.player,card:d.card,source:s,sourceVersion:s.zoneVersion,creature:d.card.is('Creature'),basicLand:d.card.is('Land')&&(d.card.cur?.super||d.card.def.super||[]).includes('Basic')});}}
  return emit.call(this,event,d,...args);
 };
 M.OracleV20.handlers.push({
  amount(v,ctx){if(v.kind==='speed-v49')return ctx.you.counters.speed||0;if(v.kind==='snow-spent-v49')return ctx.so?.snowSpent||0;},
  condition(g,s,c,p){if(c.kind==='pirate-vehicle-attacked-v49'){const r=p.turnState.pirateVehicleAttackV49;return !!r&&r.combat===g.combat&&r.pirate&&r.vehicle;}},
  compile(op,script,entry,h){
   if(op.kind==='reveal-first-draw-v49'){script.revealFirstDrawV49=true;return true;}
   if(op.kind!=='generic-trigger'||!op.eventTestV49)return false;
   const t=h.compileGenericTrigger(op),filter=t.filter;t.filter=(g,s,d)=>filter(g,s,d)&&(op.eventTestV49==='ferocious'?g.creatures(s.ctrl).some(c=>c.power>=4):d.source===s&&d.sourceVersion===s.zoneVersion&&(op.eventTestV49==='revealed-creature'?d.creature:d.basicLand));h.triggers.push(t);return true;
  },
  targetHint(e){if(e.action==='common-effects-v49')return {goal:e.mode==='destroy-undamaged'?'destroy':'draw'};},
  async effect(ctx,e){
   if(e.action!=='common-effects-v49')return false;
   const g=ctx.g,c=H.genericEffectSubjects(ctx,e.target)[0],p=ctx.you,s=ctx.src,cap=ctx.oracleSourceCapture||{},run=(effects,targets=ctx.targets)=>H.runGenericEffects({...ctx,targets},effects,true);
   switch(e.mode){
    case 'greatest-toughness':{const all=g.bf().filter(c=>c.is('Creature')),greatest=Math.max(...all.map(c=>c.toughness));if(all.some(c=>c.ctrl===p&&c.toughness===greatest))await g.draw(p,1);break;}
    case 'discard-hand-attacked':await g.discard(p,p.hand.slice());await g.draw(p,new Set((g.combat?.attackers||[]).filter(c=>c.zone==='battlefield'&&c.attacking instanceof M.Player).map(c=>c.attacking)).size);break;
    case 'vehicle-flying':{const card=H.genericEffectSubjects(ctx,'event-card')[0];if(card){if(card.kw('flying'))await g.draw(p,1);else g.addCounters(card,'flying',1,false,p);}break;}
    case 'attacking-death':if(cap.eventSnap?.attacking)await g.draw(p,1);else await g.damageBatch(g.alivePlayers().filter(q=>q!==p).map(target=>({src:H.oracleDamageSource(ctx),target,n:1})),{deferSBA:true});break;
    case 'destroy-undamaged':if(c){const controller=c.ctrl,r=c.meta.oracleDamageReceivedV42,damaged=r?.turn===g.turnNo&&r.version===c.zoneVersion&&r.n>0;await g.destroy(c);if(!damaged)await g.draw(controller,2);}break;
    case 'sacrifice-caster-opponents':if(H.sameBattlefieldSource(ctx)&&s.ctrl===p&&await g.sacrifice(p,s))for(const q of g.apnapFrom(g.turnPlayer||p).filter(q=>q!==cap.eventPlayer))await g.draw(q,3);break;
    case 'pay-delayed-draw':{const q=cap.eventPlayer;if(q&&g.canPayMana(q,M.parseCost('{1}'),null)&&await yes(ctx,q,'Pay {1} for a card at the next end step?')&&await g.payMana(q,M.parseCost('{1}'),null))g.delayed.push({on:'endStep',once:true,src:s,ctrl:q,name:s.name+' — draw',run:later=>later.g.draw(later.you,1)});break;}
    case 'random-discard-draw':{const q=cap.eventPlayer;if(q?.hand.length){const card=q.hand[Math.floor(g.rnd()*q.hand.length)],before=q.turnState.discardedN||0;await g.discard(q,[card]);if((q.turnState.discardedN||0)>before)await g.draw(q,1);}break;}
    case 'damage-own-draw':{const from=g.creatures(p).filter(c=>c!==s);if(from.length&&await yes(ctx,p,'Deal 2 damage to another creature to draw a card?')){const [target]=await pick(ctx,p,from);await g.damageBatch([{src:H.oracleDamageSource(ctx),target,n:2}],{deferSBA:true});await g.draw(p,1);}break;}
    case 'defender-draw-remove':{const q=cap.defendingPlayer;if(q&&await yes(ctx,q,'Have the attacking player draw a card?')){await g.draw(p,1);if(H.sameBattlefieldSource(ctx)){await g.untap(s);s.attacking=null;s.blockedBy=[];s.wasBlocked=false;if(g.combat)g.combat.attackers=g.combat.attackers.filter(c=>c!==s);}}break;}
    case 'mill-lands-draw':if(c){const rows=await g.mill(c,3);await g.draw(p,rows.filter(x=>x.zone==='graveyard'&&x.owner===c&&x.is('Land')).length);}break;
    case 'opponent-exile-or-draw':if(c){let paid=false;if(c.graveyard.length&&await yes(ctx,c,'Exile a card from your graveyard?')){const [card]=await pick(ctx,c,c.graveyard.slice());await g.move(card,'exile');paid=true;}if(!paid&&await yes(ctx,p,'Draw a card?'))await g.draw(p,1);}break;
    case 'loot-artifact-untap':if(c){await g.draw(c,1);const [card]=await pick(ctx,c,c.hand.slice());if(card){const artifact=card.is('Artifact'),before=c.turnState.discardedN||0;await g.discard(c,[card]);if(artifact&&(c.turnState.discardedN||0)>before&&H.sameBattlefieldSource(ctx))await g.untap(s);}}break;
    case 'give-draw':{const q=H.genericEffectSubjects(ctx,e.player)[0];if(c&&q){M.OracleV8Control.gain(g,c,q,{temporary:false});g.recalc();if(c.zone==='battlefield'&&c.ctrl===q)await g.draw(p,1);}break;}
    case 'zombie-entry-counters':{const card=H.genericEffectSubjects(ctx,'event-card')[0];if(card)g.addCounters(card,'+1/+1',(p.turnState.zombieEntriesV49||[]).filter(r=>r.card!==cap.eventCard||r.version!==cap.eventCardZoneVersion).length,false,p);break;}
    case 'surge-return':{await g.bounceMany(g.bf().filter(c=>!c.is('Land')));if(ctx.so?.castOpts?.surge)await g.makeTokens({name:'Octopus',types:['Creature'],subtypes:['Octopus'],colors:['U'],power:8,toughness:8,kws:[]},p);break;}
    case 'search-exile-offer':{let card;if(g.canSearchLibrary(p)){[card]=await pick(ctx,p,p.library.slice());if(card)await g.move(card,'exile');}M.shuffle(p.library,g.rnd);const version=card?.zoneVersion;let accept=false;for(const q of g.apnapFrom(g.turnPlayer||p).filter(q=>q!==p)){if(await yes(ctx,q,'Put the exiled card into its owner’s hand?')){accept=true;break;}}if(accept){if(card?.zone==='exile'&&card.zoneVersion===version)await g.move(card,'hand');}else await g.draw(p,3);break;}
    case 'optional-wheel':{const accepted=[];for(const q of g.apnapFrom(g.turnPlayer||p))if(await yes(ctx,q,'Shuffle your hand and graveyard into your library?'))accepted.push(q);for(const q of accepted){await g.withGraveyardEntryBatch(async()=>{for(const card of q.hand.concat(q.graveyard))await g.move(card,'library');});M.shuffle(q.library,g.rnd);}for(const q of accepted)await g.draw(q,7);if(s.zone==='stack')await g.move(s,'exile');break;}
    default:throw Error('Unknown v49 effect '+e.mode);
   }return true;
  }
 });
})(globalThis.MTG ||= {});
