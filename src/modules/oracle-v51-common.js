'use strict';
((M)=>{
 const H=M.OracleV20.helpers;
 async function choose(ctx,p,from,n,max=n){if(!from.length)return [];const cards=await p.controller.decide(ctx.g,{type:'chooseCards',from,min:Math.min(n,from.length),max:Math.min(max,from.length),prompt:ctx.src.name+': choose cards',aiHint:{kind:'sacCost',src:ctx.src}});if(!Array.isArray(cards)||cards.length<Math.min(n,from.length)||cards.length>max||new Set(cards).size!==cards.length||cards.some(c=>!from.includes(c)))throw Error('Invalid v51 cards');return cards;}
 async function option(ctx,p,prompt,options=[{key:'yes',label:'Yes'},{key:'no',label:'No'}]){const v=await p.controller.decide(ctx.g,{type:'chooseOption',prompt:ctx.src.name+': '+prompt,options,aiHint:{kind:'confirm',src:ctx.src}});if(!options.some(o=>o.key===v))throw Error('Invalid v51 option');return v;}
 M.OracleV20.handlers.push({
  count(g,s,p,v){if(v.kind==='worker-mana-v51')return ['Mine Worker','Power Plant Worker'].every(name=>g.creatures(p).some(c=>M.OracleV8NameGroups.names(c).includes(name)))?3:1;},
  amount(v,ctx){if(v.kind==='worker-mana-v51')return ['Mine Worker','Power Plant Worker'].every(name=>ctx.g.creatures(ctx.you).some(c=>M.OracleV8NameGroups.names(c).includes(name)))?3:1;},
  condition(g,s,c){if(c.kind==='blue-combat-partner-v51'){const r=s.meta.oracleBlockHistoryV19;return r?.turn===g.turnNo&&r.version===s.zoneVersion&&r.blocks.concat(r.blockedBy).some(x=>x.colors?.includes('U'));}},
  target(g,c,p,s,v){if(v.kind==='uncast-v51')return c.kind==='spell'&&!!c.isCopy;},
  compile(op,script,entry,h){if(op.kind!=='generic-trigger'||!op.eventTestV51)return false;const t=h.compileGenericTrigger(op),f=t.filter;t.filter=(g,s,d)=>f(g,s,d)&&s.meta.cursedPlayer===d.card?.ctrl;h.triggers.push(t);return true;},
  targetHint(e){if(e.action==='common-effects-v51')return {goal:e.mode.startsWith('copy')?'copy':'buff'};},
  async effect(ctx,e){
   if(e.action!=='common-effects-v51')return false;const g=ctx.g,p=ctx.you,s=ctx.src,c=H.genericEffectSubjects(ctx,e.target)[0],players=()=>g.apnapFrom(g.turnPlayer||p),damage=H.oracleDamageSource(ctx);
   switch(e.mode){
    case 'copy':case 'copy-controller':if(c&&g.stack.includes(c))await g.copySpell(c,e.mode==='copy'?p:c.ctrl,{mayNewTargets:true});break;
    case 'unlock':if(c){const doors=(c.def.bdfRoom||[]).filter(d=>!c.meta.bdfUnlocked?.includes(d.key));if(doors.length){const key=await option(ctx,p,'Unlock a door',doors.map(d=>({key:d.key,label:d.name})));(c.meta.bdfUnlocked ||= []).push(key);g.recalc();await g.emit('unlockDoor',{card:c,key,ctrl:c.ctrl});}}break;
    case 'pay-or-damage':{const unpaid=[];for(const q of players()){const choices=['{B}','{3}'].filter(cost=>g.canPayMana(q,M.parseCost(cost),null)).map(key=>({key,label:'Pay '+key}));choices.push({key:'no',label:'Take 1 damage'});const key=await option(ctx,q,'Pay to prevent damage?',choices);if(key==='no'||!await g.payMana(q,M.parseCost(key),null))unpaid.push(q);}await g.damageBatch(unpaid.map(target=>({src:damage,target,n:1})),{deferSBA:true});break;}
    case 'exile-shuffle-creatures':if(s.zone==='graveyard'&&s.zoneVersion===ctx.sourceZoneVersion){await g.move(s,'exile');await g.moveGraveyardBatch(p.graveyard.filter(c=>c.is('Creature')),'library');M.shuffle(p.library,g.rnd);}break;
    case 'lands-unless-life':{const unpaid=[];for(const land of g.bf().filter(c=>c.is('Land'))){let paid=false;for(const q of players())if(g.canPayLife(q,1)&&await option(ctx,q,'Pay 1 life to preserve '+land.name+'?')==='yes'){await g.loseLife(q,1,s.name);paid=true;break;}if(!paid)unpaid.push(land);}await g.destroyMany(unpaid);break;}
    case 'creatures-pay-sacrifice':{
     const groups=players().map(player=>({player,n:g.creatures(player).length})),sacrifices=[];
     for(const {player:q,n} of groups){let unpaid=0;for(let i=0;i<n;i++)if(!g.canPayMana(q,M.parseCost('{1}'),null)||await option(ctx,q,'Pay {1} for creature '+(i+1)+' of '+n+'?')!=='yes'||!await g.payMana(q,M.parseCost('{1}'),null))unpaid++;if(unpaid)sacrifices.push(...await choose(ctx,q,g.bf().filter(c=>c.ctrl===q&&g.canSacrifice(c)),unpaid));}
     await g.sacrificeMany(null,sacrifices);break;
    }
    default:throw Error('Unknown v51 effect '+e.mode);
   }return true;
  }
 });
})(globalThis.MTG ||= {});
