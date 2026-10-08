'use strict';
((M)=>{
  const H=M.OracleV20.helpers;
  async function choose(ctx,player,from,n,kind='bestCard'){
    n=Math.min(n,from.length);if(!n)return [];
    const picked=await player.controller.decide(ctx.g,{type:'chooseCards',from,min:n,max:n,prompt:ctx.src.name+': choose cards',aiHint:{kind,src:ctx.src}});
    if(!Array.isArray(picked)||picked.length!==n||new Set(picked).size!==n||picked.some(c=>!from.includes(c)))throw Error('Invalid v38 card choice');
    return picked;
  }
  M.OracleV20.handlers.push({
    amount(value,ctx){
      if(value.kind==='power-two-v38')return 2**H.genericAmount(value.value,ctx);
      if(value.kind==='hand-shortfall-v38')return Math.max(0,value.n-ctx.you.hand.length);
    },
    condition(g,s,c,p){if(c.kind==='attacked-two-v38')return H.genericCount(g,s,p,{kind:'attacked-creature-count-v10'})>=2;},
    target(g,c,you,s,predicate){if(predicate.kind==='unblocked-v38')return !!c.attacking&&!c.wasBlocked;},
    targetHint(op){
      if(op.action!=='object-effects-v38')return null;
      if(op.mode==='damage-player-permanents')return {goal:'damage',amount:op.n,n:op.n};
      return {goal:'debuff'};
    },
    async effect(ctx,e){
      if(e.action!=='object-effects-v38')return false;
      const g=ctx.g,subjects=i=>H.genericEffectSubjects(ctx,i),players=()=>g.apnapFrom(g.turnPlayer||ctx.you),source=()=>H.sameBattlefieldSource(ctx),run=(effects,targets=ctx.targets)=>H.runGenericEffects({...ctx,targets},effects,true);
      switch(e.mode){
        case 'give-other-permanents':{
          const player=subjects(e.target)[0],cards=g.bf().filter(c=>c.ctrl===ctx.you&&c!==ctx.src);if(player)for(const c of cards)M.OracleV8Control.gain(g,c,player);g.recalc();break;
        }
        case 'control-next-turn':
          for(const player of subjects(e.target))if(player instanceof M.Player&&!player.lost)(g.c1516TurnControls||=[]).push({subject:player.idx,controller:ctx.you.idx});break;
        case 'become-blocked':{
          const cards=e.all?g.bf().filter(c=>c.is('Creature')&&c.attacking):subjects(e.target);
          for(const card of cards)if(card.zone==='battlefield'&&card.attacking&&!card.wasBlocked){card.wasBlocked=true;await g.emit('becomesBlocked',{attacker:card,blockers:[]});}break;
        }
        case 'attach-equipment':
          if(source())for(const equipment of g.bf().filter(c=>c.hasSub('Equipment')))await run([{action:'attach-v9',attachment:0,target:'self'}],[equipment]);break;
        case 'reanimate-all':{
          const cards=players().flatMap(p=>p.graveyard.filter(c=>c.is('Creature')));await g.withBattlefieldEntryBatch(async()=>{for(const card of cards)if(card.zone==='graveyard')await g.putPermanentOntoBattlefield(card,ctx.you);});break;
        }
        case 'keep-three-lands':{
          const sacrifices=[];for(const player of players()){const lands=g.lands(player),kept=await choose(ctx,player,lands,3);sacrifices.push([player,lands.filter(c=>!kept.includes(c))]);}
          await g.withGraveyardEntryBatch(async()=>{for(const [player,cards] of sacrifices)await g.sacrificeMany(player,cards);});break;
        }
        case 'keep-two-graveyard':{
          const exiled=[];for(const player of players().filter(p=>p!==ctx.you)){const cards=player.graveyard.slice(),kept=await choose(ctx,player,cards,2);exiled.push(...cards.filter(c=>!kept.includes(c)));}
          await g.moveGraveyardBatch(exiled,'exile');break;
        }
        case 'discard-or-lose':{
          const rows=[];for(const player of players())rows.push([player,await choose(ctx,player,player.hand.slice(),1,'addlDiscard')]);
          await g.withGraveyardEntryBatch(async()=>{for(const [player,cards] of rows)await g.discard(player,cards);});
          for(const [player,cards] of rows)if(player!==ctx.you&&!cards.length)await g.loseLife(player,3);break;
        }
        case 'move-all-counters':
          if(source()){
            let n=0;for(const card of g.bf().filter(c=>c.is('Creature')&&c!==ctx.src)){const count=card.counters['+1/+1']||0;g.removeCounters(card,'+1/+1',count);n+=count;}g.addCounters(ctx.src,'+1/+1',n,false,ctx.you);
          }break;
        case 'choose-player-mana':{
          const pool=players(),chosen=await ctx.you.controller.decide(g,{type:'chooseOption',prompt:ctx.src.name+': choose a player',options:pool.map(p=>({key:String(p.idx),label:p.name})),aiHint:{kind:'oracleChoice',src:ctx.src}}),player=pool.find(p=>String(p.idx)===chosen);
          if(!player)throw Error('Invalid mana recipient');await H.runGenericEffect({...ctx,you:player},{action:'add-mana',produce:{G:3}});break;
        }
        case 'opponents-choose-tap-goad':{
          const cards=[];for(const player of players().filter(p=>p!==ctx.you))cards.push(...await choose(ctx,player,g.creatures(player),1));await run([{action:'tap',target:0},{action:'goad',target:0}],[cards]);break;
        }
        case 'owner-shuffle-draw':{
          const owner=ctx.src.owner;if(source())await run([{action:'move-to-library',target:'self',shuffleAfter:true}]);await g.draw(owner,3,ctx.src);break;
        }
        case 'erase-types':
          for(const player of subjects(e.target)){const cards=g.creatures(player);await run([{action:'pump',target:0,power:-2,toughness:0,keywords:[]}],[cards]);for(const card of cards)g.addOracleAnimation(card,{types:[],subtypes:[],keywords:[],retainTypes:true,retainAllSubtypes:false,replaceCreatureSubtypes:true,temporary:true});}g.recalc();break;
        case 'lose-protection-keywords':
          await run([{action:'remove-keywords-v9',target:0,keywords:['hexproof','indestructible']}],[g.bf().filter(c=>c.ctrl!==ctx.you&&c.is('Creature'))]);break;
        case 'damage-player-permanents':{
          const targets=subjects(e.target).flatMap(p=>[p,...g.bf().filter(c=>c.ctrl===p&&(c.is('Creature')||c.is('Planeswalker')))]);await g.damageBatch(targets.map(target=>({src:H.oracleDamageSource(ctx),target,n:e.n})),{deferSBA:true});break;
        }
        case 'attacker-mana':{
          const n=(ctx.data.attackers||[]).filter(c=>c.ctrl===ctx.you&&c.hasSub(e.subtype)).length*e.multiply;await run([{action:'add-mana',produce:{G:n}}]);break;
        }
        case 'delayed-objects':{
          const cards=[...subjects(e.target),...(e.includeSource&&source()?[ctx.src]:[])].filter(c=>c.zone==='battlefield'),locked=cards.map(c=>({card:c,version:c.zoneVersion}));
          if(locked.length)g.delayed.push({on:'endCombat',once:true,src:ctx.src,ctrl:ctx.you,name:ctx.src.name+' — end of combat',run:async next=>{
            const current=locked.filter(r=>r.card.zone==='battlefield'&&r.card.zoneVersion===r.version).map(r=>r.card);
            if(e.operation==='phase')next.g.phaseOutMany(current);
            else await H.runGenericEffects({...next,targets:[current]},[{action:e.operation==='top'?'move-to-library':'bounce',target:0}],true);
          }});break;
        }
        default:throw Error('Unknown v38 effect '+e.mode);
      }
      return true;
    }
  });
})(globalThis.MTG ||= {});
