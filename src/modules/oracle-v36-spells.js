'use strict';
((M)=>{
  const H=M.OracleV20.helpers,G=M.Game.prototype;
  const emit=G.emit;
  G.emit=async function(event,data,...rest){
    if(event==='cast'&&data?.so){
      data.so.oracleCastOrdinalV36={turn:this.turnNo,n:this.players.reduce((n,p)=>n+(p.turnState.spellsCastList||[]).length,0)};
      const permissions=data.player.turnState.oracleFlashUntilTurn;
      if(permissions)data.player.turnState.oracleFlashUntilTurn=permissions.filter(row=>!row.onceV36||row.turn!==this.turnNo||!(row.onceV36==='creature'?data.isCreature:data.types?.includes('Sorcery')));
    }
    return emit.call(this,event,data,...rest);
  };
  const beginning=G.runBeginningPhase;
  G.runBeginningPhase=async function(player,options={}){
    if(!options.additional)for(const row of this.untilEffects)if(row.kind==='oracleSkipCombatsV36'&&row.player===player&&player.turnsStarted===row.after+1)row.expires='eot';
    return beginning.call(this,player,options);
  };
  async function choose(ctx,player,from,min,max,kind='recur'){
    if(!from.length)return [];
    const versions=new Map(from.map(c=>[c,c.zoneVersion]));
    const picked=await player.controller.decide(ctx.g,{type:'chooseCards',from,min,max,prompt:ctx.src.name+': choose cards',aiHint:{kind,src:ctx.src}});
    if(!Array.isArray(picked)||picked.length<min||picked.length>max||new Set(picked).size!==picked.length||picked.some(c=>!from.includes(c)||c.zoneVersion!==versions.get(c)))throw Error('Invalid v36 card choice');
    return picked;
  }
  async function yes(ctx,player,prompt,extra={}){
    const answer=await player.controller.decide(ctx.g,{type:'chooseOption',prompt:ctx.src.name+': '+prompt,options:[{key:'no',label:'Decline'},{key:'yes',label:'Accept'}],aiHint:{kind:'pay',src:ctx.src,...extra}});
    if(!['yes','no'].includes(answer))throw Error('Invalid v36 payment choice');
    return answer==='yes';
  }
  const single=object=>(object.targets||[]).flat().filter(Boolean);
  M.OracleV20.handlers.push({
    target(g,c,you,src,predicate){
      if(predicate.kind==='attacked-this-turn-v36')return !!c.turnState?.attacked;
      if(predicate.kind==='single-player-target-v36'){const targets=single(c);return targets.length===1&&targets[0] instanceof M.Player;}
      if(predicate.kind==='second-spell-this-turn-v36')return c.oracleCastOrdinalV36?.turn===g.turnNo&&c.oracleCastOrdinalV36.n===2;
    },
    targetHint(e,target,index){
      if(e.action!=='spell-cohort-v36')return null;
      if(['copy-nonlegendary','damage-gain-life','next-spell-flash'].includes(e.mode))return {goal:'buff'};
      if(e.mode==='retarget-single')return {goal:'counter'};
      if(e.mode==='three-damage')return {goal:'damage',amount:index+1,n:index+1};
      if(e.mode==='power-damage-self-and-other'&&index===0)return {goal:'buff'};
      return {goal:'damage',amount:2,n:2};
    },
    async effect(ctx,e,h){
      if(e.action!=='spell-cohort-v36')return false;
      const g=ctx.g,subjects=i=>h.genericEffectSubjects(ctx,i),cards=subjects(0),c=cards[0],src=h.oracleDamageSource(ctx),players=()=>g.apnapFrom(g.turnPlayer||ctx.you);
      const run=(effects,targets=ctx.targets)=>h.runGenericEffects({...ctx,targets},effects,true);
      switch(e.mode){
        case 'temporary-land-mana':
          g.untilEffects.push({kind:'oracleTemporaryManaBonusV36',expires:'eot',subtype:e.subtype,iid:ctx.src.iid,zoneVersion:ctx.sourceZoneVersion,name:ctx.src.name,def:{c1719LandMana:{fixed:{[e.color]:1}}},cur:{super:[]}});break;
        case 'three-damage':await g.damageBatch([0,1,2].flatMap(i=>subjects(i).map(target=>({src,target,n:i+1}))),{deferSBA:true});break;
        case 'pay-life-counter-source':
          for(const player of players())if(g.canPayLife(player,5)&&await yes(ctx,player,'Pay 5 life to counter this spell?',{life:5})){await g.loseLife(player,5,ctx.src.name);const object=ctx.data?.so;if(object)await g.counterStackObject(object,{source:ctx.src});break;}break;
        case 'lose-abilities-destroy':{
          const affected=g.bf().filter(card=>card.is('Creature')&&card.mv<=h.genericAmount('X',ctx));
          await run([{action:'ability-loss-v8',target:0,temporary:true}],[affected]);await g.destroyMany(affected,{source:ctx.src});break;
        }
        case 'copy-nonlegendary':
          if(c){const definition=c.oracleDefinition||g.castDefinition(c.card,c.castOpts);await g.copySpell(c,ctx.you,{oracleDefinition:{...definition,super:(definition.super||[]).filter(type=>type!=='Legendary')},mayNewTargets:false});}break;
        case 'skip-next-turn-combats':if(c)g.untilEffects.push({kind:'oracleSkipCombatsV36',player:c,after:c.turnsStarted||0,expires:'never'});break;
        case 'false-cure':
          await run([{action:'install-trigger-v8',duration:'eot',once:false,trigger:{kind:'generic-trigger',event:'lifeGain',eventFilter:{kind:'v8-event',player:'any'},effects:[{action:'spell-cohort-v36',mode:'life-loss-twice'}],targets:[],optional:false}}]);break;
        case 'life-loss-twice':if(ctx.data?.player)await g.loseLife(ctx.data.player,2*h.genericAmount({kind:'event-amount'},ctx),ctx.src.name);break;
        case 'death-earthbend':
          if(c){const version=c.zoneVersion;g.delayed.push({on:'dies',src:ctx.src,ctrl:ctx.you,expires:'eot',once:true,name:ctx.src.name+' — earthbend',filter:(_g,data)=>data.card===c&&data.snap?.zoneVersion===version,targets:[h.genericTargetSpec({what:'land',zone:'battlefield',controller:'you',min:1,max:1},[],0)],run:async trigger=>h.runGenericEffects(trigger,[{action:'earthbend-v10',target:0,n:4}],true)});}break;
        case 'damage-attacker-and-you':await g.damageBatch([...cards,ctx.you].map(target=>({src,target,n:4})),{deferSBA:true});break;
        case 'random-discard-unless-pay':
          if(c){await run([{action:'discard',who:0,n:1,random:true}]);const cost=M.parseCost('{1}');if(!(g.canPayMana(c,cost,null)&&await yes(ctx,c,'Pay {1} to prevent another discard?',{cost:'{1}'})&&await g.payMana(c,cost,null)))await run([{action:'discard',who:0,n:1,random:true}]);}break;
        case 'sacrifice-one-of-two':
          if(c){const chosen=await choose(ctx,c.ctrl,cards,1,1,'sac');await g.sacrificeMany(c.ctrl,chosen);}break;
        case 'fight-distinct-types':if(cards.length===2)await g.fight(cards[0],cards[1]);break;
        case 'retarget-single':
          if(c){const before=single(c),matches=card=>e.what==='player'?card instanceof M.Player:card instanceof M.CardInst&&card.zone==='battlefield'&&card.is('Creature');if(before.length===1&&matches(before[0])){const original=c.targetSpecs,specs=original||g.spellTargetSpecs(c.card,c.castOpts,c.ctrl);c.targetSpecs=specs.map(spec=>({...spec,filter:(game,card,...rest)=>matches(card)&&(!spec.filter||spec.filter(game,card,...rest))}));try{await g.oracleRetargetSingleV10(c,ctx.you);}finally{c.targetSpecs=original;}}}break;
        case 'keep-hand-colors':{
          const groups=[];
          const hands=players().map(player=>({player,hand:player.hand.slice()}));
          for(const {player,hand} of hands)await g.revealToHuman({cards:hand,ctrl:player,source:ctx.src,kind:'reveal'});
          for(const {player,hand} of hands){const keep=new Set();for(const color of ['W','U','B','R','G']){const from=hand.filter(card=>card.colors.includes(color));for(const card of await choose(ctx,player,from,Math.min(1,from.length),Math.min(1,from.length),'keep'))keep.add(card);}groups.push({player,cards:hand.filter(card=>!card.is('Land')&&!keep.has(card))});}
          await g.withGraveyardEntryBatch(async()=>{for(const group of groups)await g.discard(group.player,group.cards);});break;
        }
        case 'copy-all-creature-tokens':{
          const copies=g.bf().filter(card=>card.isToken&&card.is('Creature')).map(card=>({controller:card.ctrl,definition:M.OracleV8Faces.copyTokenDefinition(card)}));
          await g.withBattlefieldEntryBatch(async()=>{for(const copy of copies)await g.copyPermanentToken({def:copy.definition},copy.controller);});break;
        }
        case 'damage-player-scry':
          if(c){const dealt=await g.damageBatch([{src,target:c,n:2}],{deferSBA:true});if(c instanceof M.Player&&dealt>0)await run([{action:'scry',who:'you',n:1}]);}break;
        case 'next-spell-flash':
          (ctx.you.turnState.oracleFlashUntilTurn||=[]).push({turn:g.turnNo,onceV36:e.what,filter:{what:e.what,zone:'graveyard',controller:'any'}});break;
        case 'opponent-grave-choice':
          if(c){const from=c.graveyard.filter(card=>card.is(e.what)),chosen=await choose(ctx,c,from,Math.min(1,from.length),Math.min(1,from.length));for(const card of chosen)await g.putPermanentOntoBattlefield(card,ctx.you);}break;
        case 'damage-and-nonartifact-creatures':
          await g.damageBatch([...cards.map(target=>({src,target,n:2})),...subjects(1).flatMap(p=>g.creatures(p).filter(card=>!card.is('Artifact')).map(target=>({src,target,n:1})))],{deferSBA:true});break;
        case 'power-damage-self-and-other':
          if(c){const n=Math.max(0,c.power);await g.damageBatch([...subjects(1),c].map(target=>({src:c,target,n})),{deferSBA:true});}break;
        case 'destroy-mill-half':
          await g.destroyMany(g.bf().filter(card=>card.is('Creature')),{source:ctx.src});for(const player of cards)await g.mill(player,Math.floor(player.library.length/2),ctx.src);break;
        case 'remove-indestructible-destroy':{
          const affected=g.bf().filter(card=>card.is('Creature')||card.hasSub('Vehicle'));
          await run([{action:'remove-keywords-v9',target:0,keywords:['indestructible']}],[affected]);await g.destroyMany(affected,{source:ctx.src});break;
        }
        case 'damage-gain-life':
          if(c)for(const event of ['damageToPlayer','dealtDamage'])await h.runGenericEffect({...ctx,src:c,sourceZoneVersion:c.zoneVersion},{action:'install-trigger-v8',duration:'eot',once:false,trigger:{kind:'generic-trigger',event,eventFilter:{kind:'v8-event',sourceSelf:true},effects:[{action:'gain-life',who:'you',n:{kind:'event-amount'}}],targets:[],optional:false}});break;
        default:throw Error('Unknown v36 spell effect: '+e.mode);
      }
      return true;
    }
  });
})(globalThis.MTG ||= {});
