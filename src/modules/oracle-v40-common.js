'use strict';
((M)=>{
  const H=M.OracleV20.helpers,G=M.Game.prototype;
  const equipmentHost=(g,s)=>{const equipment=g.byIid(s.attachedTo),host=equipment&&g.byIid(equipment.attachedTo);return equipment?.zone==='battlefield'&&equipment.hasSub('Equipment')&&host?.zone==='battlefield'&&host.is('Creature')?host:null;};
  const matches=(g,s,d,test)=>{
    if(test==='self-or-own-vampire')return d.card===s||d.card?.ctrl===s.ctrl&&d.card.hasSub('Vampire');
    if(test==='opponent-player')return d.player!==s.ctrl;
    if(test==='own-other-grave')return d.card!==s&&d.card?.owner===s.ctrl;
    if(test==='equipment-attached')return !!equipmentHost(g,s);
    if(test==='died-greater-power')return (d.snap?.power??d.card?.power)>s.power;
    throw Error('Unknown v40 event qualifier '+test);
  };
  M.OracleV20.handlers.push({
    compile(op,script,entry,h){
      if(op.kind==='artifact-food-types-v40'){h.statics.push({phase:1,apply:(g,s,bf)=>{for(const c of bf)if(c.ctrl===s.ctrl&&c.is('Artifact')&&!c.cur.subtypes.includes('Food'))c.cur.subtypes.push('Food');}});return true;}
      if(op.kind==='player-hexproof-v40'){script.playerHexproof=true;script.oraclePlayerHexproofOwnTurnV40=true;return true;}
      if(op.kind!=='generic-trigger'||!op.eventTestV40)return false;
      const t=h.compileGenericTrigger(op),base=t.filter,run=t.run;t.filter=(g,s,d)=>base(g,s,d)&&matches(g,s,d,op.eventTestV40);
      if(op.interveningV40)t.run=ctx=>matches(ctx.g,ctx.src,ctx.data,op.eventTestV40)?run(ctx):undefined;h.triggers.push(t);return true;
    },
    amount(value,ctx){
      if(value.kind==='opponents-lost-life-v40')return ctx.g.alivePlayers().filter(p=>p!==ctx.you&&p.turnState.lifeLost>0).length;
      if(value.kind==='grave-creature-count-v40')return (ctx.data?.cards||[]).filter(c=>c.owner===ctx.you&&c.is('Creature')).length;
    },
    condition(g,s,c,p,capture){
      if(c.kind==='no-exile-play-v40')return !p.turnState.oraclePlayedExileV40;
      if(c.kind==='paid-three-same-color-v40')return ['W','U','B','R','G'].some(color=>(capture?.paymentColorCounts||s.castMeta?.paymentColorCounts||{})[color]>=3);
    },
    target(g,c,you,s,p){
      if(p.kind==='same-defender-v40')return !!s.attacking&&c.attacking===s.attacking;
      if(p.kind==='not-dragon-v40')return !(c instanceof M.CardInst&&c.hasSub('Dragon'));
      if(p.kind==='power-less-islands-v40')return c.power<g.lands(you).filter(land=>land.hasSub('Island')).length;
      if(p.kind==='self-or-enchantment-v40')return c.iid===s.iid||c.is('Enchantment');
    },
    targetHint(e){if(e.action==='common-effects-v40')return {goal:e.mode==='reanimate-equipment'||e.mode==='graveyard-permission'?'recur':'debuff'};},
    async effect(ctx,e){
      if(e.action!=='common-effects-v40')return false;
      const g=ctx.g,subjects=t=>H.genericEffectSubjects(ctx,t),run=(effects,targets=ctx.targets)=>H.runGenericEffects({...ctx,targets},effects,true);
      switch(e.mode){
        case 'target-controller-sacrifice':for(const card of subjects(e.target))await g.sacrifice(card.ctrl,card);break;
        case 'shuffle-grave-creatures':await run([{action:'move-to-library',target:0,shuffleAfter:true}],[ctx.you.graveyard.filter(c=>c.is('Creature'))]);break;
        case 'fblthp-draw':await g.draw(ctx.you,ctx.oracleSourceCapture?.enteredFromV40==='library'||ctx.oracleSourceCapture?.castFrom==='library'?2:1);break;
        case 'tribute':if(H.genericAmount({kind:'event-card-stat',stat:'power'},ctx)>=3)await g.draw(ctx.you,1);else await run([{action:'counter',target:'event-card',counter:'+1/+1',n:2}]);break;
        case 'reanimate-equipment':for(const c of subjects(e.target)){await g.putPermanentOntoBattlefield(c,ctx.you);if(c.zone==='battlefield'&&H.sameBattlefieldSource(ctx))await run([{action:'attach-v9',attachment:0,target:'self'}],[c]);}break;
        case 'destroy-equipment-host':{const host=equipmentHost(g,ctx.src);if(host)await g.destroy(host);break;}
        case 'drizzt-counters':{
          const n=H.genericAmount({kind:'event-card-stat',stat:'power'},ctx)-H.genericAmount({kind:'explicit-source-stat',stat:'power'},ctx);if(n>0)await run([{action:'counter',target:'self',counter:'+1/+1',n}]);break;
        }
        case 'graveyard-permission':for(const c of subjects(e.target))if(c.zone==='graveyard')c.meta.emryCastTurn=g.turnNo;break;
        case 'exile-permission':{
          const c=subjects('event-card')[0];if(!c)break;const choice=await ctx.you.controller.decide(g,{type:'chooseOption',prompt:ctx.src.name+': exile the blocked creature?',options:[{key:'no',label:'Leave it'},{key:'yes',label:'Exile it; you may play it this turn'}],aiHint:{kind:'oracleChoice',src:ctx.src}});if(choice==='no')break;if(choice!=='yes')throw Error('Invalid optional exile choice');await g.move(c,'exile');if(c.zone==='exile')M.OracleV22Layouts.grant(ctx,[c],{duration:'eot',max:null});break;
        }
        case 'shared-type-mana':{
          const event=ctx.oracleSourceCapture?.eventCard||ctx.data?.card,version=ctx.eventCardZoneVersion,view=event?.zone==='battlefield'&&event.zoneVersion===version?event:null,history=ctx.oracleSourceCapture?.eventSnap||event?.battlefieldLKI?.get(version),types=view?.cur?.subtypes||history?.subtypes||[],changeling=view?view.kw('changeling'):history?.changeling;
          const n=g.creatures(ctx.you).filter(c=>[...M.CREATURE_SUBTYPES].some(type=>(changeling||types.includes(type))&&c.hasSub(type))).length;await run([{action:'add-mana',produce:{C:n}}]);break;
        }
        default:throw Error('Unknown v40 effect '+e.mode);
      }return true;
    }
  });
  const emit=G.emit;G.emit=async function(name,d,...rest){if(name==='cast'&&d.so?.from==='exile'||name==='landPlayed'&&d.from==='exile')d.player.turnState.oraclePlayedExileV40=true;return emit.call(this,name,d,...rest);};
})(globalThis.MTG ||= {});
