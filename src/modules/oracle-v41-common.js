'use strict';
((M)=>{
  const H=M.OracleV20.helpers,G=M.Game.prototype;
  async function choice(ctx,player,from,min,max){
    max=Math.min(max,from.length);min=Math.min(min,max);if(!max)return [];
    const versions=new Map(from.map(c=>[c,c.zoneVersion]));
    const picked=await player.controller.decide(ctx.g,{type:'chooseCards',from,min,max,prompt:ctx.src.name+': choose cards',aiHint:{kind:'recur',src:ctx.src}});
    if(!Array.isArray(picked)||picked.length<min||picked.length>max||new Set(picked).size!==picked.length||picked.some(c=>!from.includes(c)||c.zoneVersion!==versions.get(c)))throw Error('Invalid v41 card choice');
    return picked;
  }
  async function option(ctx,player,prompt,options=[{key:'yes',label:'Yes'},{key:'no',label:'No'}]){
    const answer=await player.controller.decide(ctx.g,{type:'chooseOption',prompt:ctx.src.name+': '+prompt,options,aiHint:{kind:'confirm',src:ctx.src}});
    if(!options.some(row=>row.key===answer))throw Error('Invalid v41 option');return answer;
  }
  const castLimited=(g,p)=>p.turnState.oracleOneMoreSpellV41?.turn===g.turnNo&&(p.turnState.spellsCastList||[]).length>=p.turnState.oracleOneMoreSpellV41.max;
  const timing=G.canCastTiming;G.canCastTiming=function(p,...args){return !castLimited(this,p)&&timing.call(this,p,...args);};
  const cast=G.castSpell;G.castSpell=async function(p,...args){return castLimited(this,p)?false:cast.call(this,p,...args);};
  const copy=G.copySpell;G.copySpell=async function(so,...args){return (so.oracleDefinition||this.castDefinition(so.card,so.castOpts))?.oracleUncopyableV41?null:copy.call(this,so,...args);};
  const candidates=M.OracleV20Damage.temporaryCandidates;
  M.OracleV20Damage.temporaryCandidates=function(g,data){
    const result=candidates(g,data),snap=data.sourceSnapshot||data.src?._oracleDamageSnapshot,source=data.src,types=snap?.types||source?.cur?.types||[],subs=snap?.subtypes||source?.cur?.subtypes||[],controller=snap?.ctrl||source?.ctrl,version=snap?.zoneVersion??source?.zoneVersion;
    if(!data.combat||data.n<=0||!types.includes('Creature'))return result;
    for(const row of g.untilEffects.filter(e=>e.kind==='oracleCombatFogV41')){
      const matches=row.mode==='controller'?controller?.idx===row.seat:row.mode==='others'?!(source?.iid===row.iid&&version===row.version):!((snap?.changeling||source?.kw?.('changeling'))||subs.includes('Werewolf')||subs.includes('Wolf'));
      if(matches)result.push({key:row,src:row.source,label:row.source.name+' — prevent combat damage',oraclePrevention:true,apply:async()=>{const n=data.preventionAllowed?data.n:0;data.n-=n;if(n){g.note('gameEffect',{kind:'damagePrevented',target:data.target,amount:n,source});await g.emit('damagePrevented',{src:source,target:data.target,...(data.target instanceof M.Player?{player:data.target}:{}),n,combat:true});}}});
    }return result;
  };
  M.OracleV20.handlers.push({
    compile(op,script){if(op.kind==='uncopyable-v41'){script.oracleUncopyableV41=true;return true;}return false;},
    amount(v,ctx){if(v.kind==='named-grave-count-v41')return ctx.g.players.reduce((n,p)=>n+p.graveyard.filter(c=>c.name===v.name).length,0)*v.multiply;},
    target(g,c,you,s,p){if(p.kind==='not-brushwagg-v41')return !c.hasSub('Brushwagg');if(p.kind==='blocked-v41')return !!c.attacking&&!!c.wasBlocked;},
    targetHint(e){if(e.action==='spell-effects-v41')return {goal:['type-pump','animate-artifact','transform','prevent-others'].includes(e.mode)?'buff':'debuff'};},
    async effect(ctx,e){
      if(e.action!=='spell-effects-v41')return false;
      const g=ctx.g,subjects=i=>H.genericEffectSubjects(ctx,i),cards=subjects(e.target),c=cards[0],run=(effects,targets=ctx.targets)=>H.runGenericEffects({...ctx,targets},effects,true),damage=H.oracleDamageSource(ctx);
      const fog=(mode,extra={})=>g.untilEffects.push({kind:'oracleCombatFogV41',expires:'eot',source:ctx.src,mode,...extra});
      const transform=async card=>{const components=card.mutateState?.components||[{oracleFaces:M.OracleV8Faces.physical(card),oracleFace:card.oracleFace}],canTransform=components.some(row=>{const faces=row.oracleFaces,def=M.OracleV8Faces.faceDefinition(faces,row.oracleFace==='back'?'front':'back');return !row.faceDown&&['transform','modal_dfc'].includes(faces?.layout)&&def&&!def.types.some(type=>['Instant','Sorcery'].includes(type));});if(card.zone==='battlefield'&&canTransform)await H.runGenericEffects({...ctx,src:card,sourceZoneVersion:card.zoneVersion},[{action:'transform-self'}],true);};
      switch(e.mode){
        case 'self-grave-shuffle':await run([{action:'move-to-library',target:0,shuffleAfter:true}],[[...cards,...(ctx.src.zone==='stack'&&(ctx.sourceZoneVersion===undefined||ctx.src.zoneVersion===ctx.sourceZoneVersion)?[ctx.src]:[])]]);break;
        case 'calm-opponents':{const affected=g.bf().filter(x=>x.is('Creature')&&x.ctrl!==ctx.you);for(const card of affected)card.meta.suspected=false;await run([{action:'pump',target:0,power:-2,toughness:0,keywords:[]}],[affected]);g.recalc();break;}
        case 'damage-or-draw':if(c){if(await option(ctx,c,'Take '+e.n+' damage?')==='yes')await g.damageBatch([{src:damage,target:c,n:e.n}],{deferSBA:true});else await g.draw(ctx.you,e.draw);}break;
        case 'excess-damage':if(c){const lethal=damage.kw?.('deathtouch')?1:Math.max(0,c.toughness-c.damage),n=Math.min(e.n,lethal);await g.damageBatch([{src:damage,target:c,n},{src:damage,target:c.ctrl,n:e.n-n}],{deferSBA:true});}break;
        case 'ritual':{
          if(await option(ctx,ctx.you,'Mill three cards?')==='yes')await g.mill(ctx.you,3);
          const creatures=await choice(ctx,ctx.you,ctx.you.graveyard.filter(x=>x.is('Creature')),0,1),lands=await choice(ctx,ctx.you,ctx.you.graveyard.filter(x=>x.is('Land')&&!creatures.includes(x)),0,1);
          for(const card of [...creatures,...lands])await g.move(card,'hand');break;
        }
        case 'ember-gale':if(c){const affected=g.creatures(c);await run([{action:'cant-block-until-eot',target:0}],[affected]);await g.damageBatch(affected.filter(x=>x.colors.some(color=>['W','U'].includes(color))).map(target=>({src:damage,target,n:1})),{deferSBA:true});}break;
        case 'type-pump':if(c){const n=new Set(c.cur.super).size+new Set(c.cur.types).size+new Set(c.cur.subtypes).size;await run([{action:'pump',target:0,power:n,toughness:n,keywords:[]}]);}break;
        case 'prevent-controller':if(c)fog('controller',{seat:c.idx});break;
        case 'prevent-others':if(c)fog('others',{iid:c.iid,version:c.zoneVersion});break;
        case 'mill-steal-artifact':if(c){await g.mill(c,8);for(const card of await choice(ctx,ctx.you,c.graveyard.filter(x=>x.is('Artifact')),0,1))await g.putPermanentOntoBattlefield(card,ctx.you);}break;
        case 'look-cloak':case 'look-manifest':{
          const seen=ctx.you.library.slice(-(e.mode==='look-cloak'?5:2)).reverse(),picked=await choice(ctx,ctx.you,seen,e.mode==='look-cloak'?2:1,e.mode==='look-cloak'?2:1);
          await g.withBattlefieldEntryBatch(async()=>{for(const card of picked)await g.putFaceDown(ctx.you,card,e.mode==='look-cloak'?'cloak':'manifest');});
          const rest=seen.filter(card=>card.zone==='library'&&!picked.includes(card));
          if(e.mode==='look-cloak'){M.shuffle(rest,g.rnd);for(const card of rest)ctx.you.library.splice(ctx.you.library.indexOf(card),1);ctx.you.library.unshift(...rest);}
          else if(rest.length&&await option(ctx,ctx.you,'Place the other card',[{key:'top',label:'Top'},{key:'bottom',label:'Bottom'}])==='bottom'){const other=rest[0];ctx.you.library.splice(ctx.you.library.indexOf(other),1);ctx.you.library.unshift(other);}break;
        }
        case 'one-more-spell':{const max=(ctx.you.turnState.spellsCastList||[]).length+1,previous=ctx.you.turnState.oracleOneMoreSpellV41;ctx.you.turnState.oracleOneMoreSpellV41={turn:g.turnNo,max:previous?.turn===g.turnNo?Math.min(previous.max,max):max};break;}
        case 'animate-artifact':if(c)await run([{action:'animate',target:0,power:c.mv,toughness:c.mv,types:['Artifact','Creature'],subtypes:[],keywords:[],retainTypes:true,retainAllSubtypes:true,temporary:true}]);break;
        case 'attacker-nonbasics':for(const card of g.bf().filter(x=>x.is('Creature')&&x.attacking)){const defender=card.attacking instanceof M.Player?card.attacking:card.attacking.ctrl,n=g.lands(defender).filter(land=>!land.cur.super.includes('Basic')).length;await run([{action:'pump',target:0,power:n,toughness:0,keywords:[]}],[card]);}break;
        case 'moonmist':for(const card of g.bf().filter(x=>x.hasSub('Human')))await transform(card);fog('non-wolf');break;
        case 'transform':for(const card of cards)await transform(card);break;
        case 'amass-mill':{const army=await M.E.amass(g,ctx.you,3,'Orc');if(army)for(const player of cards)await g.mill(player,Math.max(0,army.power));break;}
        default:throw Error('Unknown v41 spell effect '+e.mode);
      }return true;
    }
  });
})(globalThis.MTG ||= {});
