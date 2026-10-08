'use strict';
((M)=>{
  const H=M.OracleV20.helpers;
  async function choose(ctx,p,from,min,max,kind='bestCard'){
    if(!from.length)return [];
    const chosen=await p.controller.decide(ctx.g,{type:'chooseCards',from,min,max,prompt:ctx.src.name+': choose cards',aiHint:{kind,src:ctx.src}});
    if(!Array.isArray(chosen)||chosen.length<min||chosen.length>max||new Set(chosen).size!==chosen.length||chosen.some(c=>!from.includes(c)))throw Error('Invalid v39 choice');return chosen;
  }
  M.OracleV20.handlers.push({
    compile(op,script,entry,h){
      if(op.kind!=='generic-trigger'||!op.eventTestV39)return false;
      const t=h.compileGenericTrigger(op),base=t.filter,upper=op.upperFilterV39&&h.compileGenericTrigger({...op,eventFilter:op.upperFilterV39}).filter;
      t.filter=(g,s,d)=>base(g,s,d)&&(op.eventTestV39==='owned-death'?d.card.owner===s.ctrl:op.eventTestV39==='power-max-six'?upper(g,s,d):false);h.triggers.push(t);return true;
    },
    target(g,c,you,s,predicate){if(predicate.kind==='face-up-v39')return !c.faceDown;},
    targetHint(e){if(e.action==='common-effects-v39')return {goal:e.mode==='artifact-retaliation'?'destroy':'debuff'};},
    async effect(ctx,e){
      if(e.action!=='common-effects-v39')return false;
      const g=ctx.g,subjects=t=>H.genericEffectSubjects(ctx,t),run=(effects,targets=ctx.targets)=>H.runGenericEffects({...ctx,targets},effects,true);
      switch(e.mode){
        case 'steal-creatures':{
          const cards=g.bf().filter(c=>c.is('Creature'));await run([{action:'gain-control',target:0,temporary:true},{action:'untap',target:0},{action:'pump',target:0,power:0,toughness:0,keywords:['haste']}],[cards]);break;
        }
        case 'choose-player-mana':{
          const players=g.alivePlayers(),chosen=await ctx.you.controller.decide(g,{type:'chooseOption',prompt:ctx.src.name+': choose a player',options:players.map(p=>({key:String(p.idx),label:p.name})),aiHint:{kind:'oracleChoice',src:ctx.src}}),player=players.find(p=>String(p.idx)===chosen);
          if(!player)throw Error('Invalid v39 mana recipient');
          const color=await player.controller.decide(g,{type:'chooseOption',prompt:ctx.src.name+': choose a color',options:['W','U','B','R','G'].map(key=>({key,label:'{'+key+'}'})),aiHint:{kind:'manaColor'}});
          if(!['W','U','B','R','G'].includes(color))throw Error('Invalid v39 mana color');await H.runGenericEffect({...ctx,you:player},{action:'add-mana',produce:{[color]:2}});break;
        }
        case 'halve-life-damage':
          await g.damageBatch(g.alivePlayers().map(target=>({src:H.oracleDamageSource(ctx),target,n:Math.max(0,Math.floor(target.life/2))})),{deferSBA:true});break;
        case 'artifact-retaliation':{
          const artifact=subjects(e.target)[0];if(!artifact)break;
          const n=artifact.mv,version=artifact.zoneVersion;await g.destroy(artifact);
          if(H.sameBattlefieldSource(ctx))await g.damageBatch([{src:H.oracleDamageSource({...ctx,src:artifact,data:null,sourceZoneVersion:version}),target:ctx.src,n}],{deferSBA:true});break;
        }
        case 'shuffle-grave-four':{
          const picked=await choose(ctx,ctx.you,ctx.you.graveyard.slice(),0,Math.min(4,ctx.you.graveyard.length),'recur');await run([{action:'move-to-library',target:0,shuffleAfter:true}],[picked]);break;
        }
        case 'exile-grave-gain':{
          const player=subjects(e.target)[0];if(!player)break;const picked=await choose(ctx,player,player.graveyard.slice(),Math.min(1,player.graveyard.length),1,'addlDiscard'),creature=!!picked[0]?.is('Creature');
          if(picked.length){await g.moveGraveyardBatch(picked,'exile');if(creature)await g.gainLife(ctx.you,2,ctx.src);}break;
        }
        case 'return-or-sacrifice':{
          const pool=g.bf().filter(c=>(e.controller==='any'||c.ctrl===ctx.you)&&(e.what==='Forest'?c.hasSub('Forest'):c.is(e.what)));
          const answer=pool.length>=e.n?await ctx.you.controller.decide(g,{type:'chooseOption',prompt:ctx.src.name+': return '+e.n+' '+e.what+' instead of sacrificing?',options:[{key:'no',label:'Sacrifice'},{key:'yes',label:'Return '+e.n+' '+e.what}],aiHint:{kind:'oracleChoice',src:ctx.src}}):'no';
          if(!['yes','no'].includes(answer))throw Error('Invalid return payment choice');const picked=answer==='yes'?await choose(ctx,ctx.you,pool,e.n,e.n,'bestCard'):[];
          if(picked.length===e.n)await run([{action:'bounce',target:0}],[picked]);else if(H.sameBattlefieldSource(ctx))await g.sacrifice(ctx.you,ctx.src);break;
        }
        case 'no-life-gain':
          g.untilEffects.push({kind:'lifeGainProhibitionV9',players:subjects(e.who),expires:'never'});break;
        default:throw Error('Unknown v39 effect '+e.mode);
      }return true;
    }
  });
})(globalThis.MTG ||= {});
