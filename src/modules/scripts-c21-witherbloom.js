'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
  const M=MTG,E=M.E,T=M.T,SC=M.SCRIPTS,C=M.C21;
  const {same,choose,option,token,enterTrigger,grave,own,selfEvent,row,current,immediate,snapshotEvent,eventStats}=C;
  const gained=p=>p.turnState.lifeGained||0;
  const exileSelf=async ctx=>{if(!ctx.so.isCopy&&ctx.src.zone==='stack')await ctx.g.move(ctx.src,'exile');};
  SC['Willowdusk, Essence Seer']={abilities:[{label:'Counters equal to life gained or lost this turn',sorcery:true,cost:{mana:'{1}',tap:true},
    targets:[T.creature({filter:(g,c,p,src)=>c!==src,aiHint:{goal:'pump'}})],run:ctx=>ctx.g.addCounters(ctx.targets[0],'+1/+1',Math.max(gained(ctx.you),ctx.you.turnState.lifeLost||0),false,ctx.you),aiScore:(g,c,p)=>Math.max(gained(p),p.turnState.lifeLost||0)}]};
  SC['Gyome, Master Chef']={triggers:[{on:'endStep',filter:own,desc:'A Food for each nontoken creature that entered this turn',run:ctx=>ctx.g.makeTokens('food',ctx.you,{n:ctx.you.turnState.c21CreatureEntries||0})}],
    abilities:[{label:'Sacrifice a Food: indestructible, then tap a creature',cost:{mana:'{1}',sac:(g,c)=>c.hasSub('Food')},targets:[T.creature({aiHint:{goal:'protect'}})],
      run:async ctx=>{E.pumpUntilEOT(ctx.g,ctx.targets[0],0,0,['indestructible']);ctx.g.tap(ctx.targets[0]);},aiScore:()=>3}]};
  SC['Tivash, Gloom Summoner']={triggers:[{on:'endStep',filter:(g,c,d)=>own(g,c,d)&&gained(c.ctrl)>0,onlyIf:(g,c,d,ctx)=>gained(ctx.you)>0,
    desc:'Pay life gained this turn for a flying Demon',run:async ctx=>{const n=gained(ctx.you);if(ctx.you.life<n)return;
      if(await option(ctx,[{key:'yes',label:'Pay '+n+' life for a '+n+'/'+n+' Demon'},{key:'no',label:'Decline'}],'create a Demon',ctx.you,'optTrigger')==='yes'){
        await ctx.g.loseLife(ctx.you,n,ctx.src.name);await ctx.g.makeTokens(token('Demon',['Demon'],n,n,['B'],['flying']),ctx.you);
      }
    }}]};
  SC['Sproutback Trudge']={c21EndStepCast:true,selfCostAdjust:(g,c,p)=>-gained(p),triggers:[{on:'endStep',zone:'graveyard',filter:(g,c,d)=>own(g,c,d)&&gained(c.ctrl)>0,
    onlyIf:(g,c,d,ctx)=>c.zone==='graveyard'&&gained(ctx.you)>0,desc:'You may cast Sproutback Trudge from your graveyard',run:async ctx=>{
      if(ctx.src.zone==='graveyard'&&ctx.src.zoneVersion===ctx.sourceZoneVersion)await immediate(ctx,[ctx.src],{free:false});
    }}]};
  SC['Yedora, Grave Gardener']={triggers:[{on:'dies',filter:(g,c,d)=>d.card!==c&&d.snap.ctrl===C.controllerAt(g,c,d)&&!d.card.isToken&&d.snap.types.includes('Creature'),opt:true,
    desc:'Return the creature face down as a Forest',run:async ctx=>{const c=ctx.data.card;if(c.zone!=='graveyard'||c.zoneVersion!==ctx.data.graveyardZoneVersion)return;
      const def=c.def;c.def={name:'Face-down land',rulesNoName:true,cost:null,super:[],types:['Land'],subtypes:['Forest'],colorsOverride:[],kws:[],oracle:''};
      await ctx.g.move(c,'battlefield',{ctrl:c.owner,faceDownDef:def,faceDownKind:'c21Forest'});
    }}]};
  SC["Verdant Sun's Avatar"]={triggers:[{on:'etb',filter:(g,c,d)=>d.card.ctrl===c.ctrl&&d.card.is('Creature'),desc:'Gain life equal to the entering creature’s toughness',prepareTargets:snapshotEvent,
    run:ctx=>ctx.g.gainLife(ctx.you,Math.max(0,eventStats(ctx)?.toughness||0))}]};
  SC['Essence Pulse']={resolve:async ctx=>{await ctx.g.gainLife(ctx.you,2);const n=gained(ctx.you);for(const c of ctx.g.creatures())E.pumpUntilEOT(ctx.g,c,-n,-n);}};
  SC['Healing Technique']={demonstrate:true,targets:[grave((g,c,p)=>c.owner===p)],resolve:async ctx=>{const n=ctx.targets[0].mv;await ctx.g.move(ctx.targets[0],'hand');await ctx.g.gainLife(ctx.you,n);await exileSelf(ctx);}};
  SC['Revival Experiment']={resolve:async ctx=>{
    const chosen=[];for(const type of ['Artifact','Battle','Creature','Enchantment','Land','Planeswalker']){
      const cards=await choose(ctx.g,ctx.you,ctx.you.graveyard.filter(c=>c.is(type)&&!chosen.includes(c)),0,1,'Revival Experiment: choose up to one '+type,'recur');chosen.push(...cards);
    }
    let returned=0;await ctx.g.withBattlefieldEntryBatch(async()=>{for(const c of chosen){await ctx.g.putPermanentOntoBattlefield(c,ctx.you);if(c.zone==='battlefield')returned++;}});
    await ctx.g.loseLife(ctx.you,3*returned,ctx.src.name);await exileSelf(ctx);
  }};
  SC['Suffer the Past']={targets:(g,c,opts={})=>[T.player(),grave(()=>true,{count:opts.xVal||0,min:opts.xVal||0,dependentFilter:(g,c,previous)=>c.owner===previous[0],aiHint:{goal:'exile'}})],resolve:async ctx=>{
    const cards=[ctx.targets[1]].flat().filter(Boolean);let n=0;await ctx.g.withC21ExileBatch(async()=>{for(const c of cards){await ctx.g.move(c,'exile');if(c.zone==='exile')n++;}});
    if(ctx.targets[0])await ctx.g.loseLife(ctx.targets[0],n,ctx.src.name);await ctx.g.gainLife(ctx.you,n);
  }};
  SC['Elixir of Immortality']={abilities:[{label:'Gain five life and shuffle this and your graveyard into libraries',cost:{mana:'{2}',tap:true},run:async ctx=>{
    await ctx.g.gainLife(ctx.you,5);const cards=ctx.you.graveyard.slice();if(same(ctx))cards.push(ctx.src);const owners=new Set();
    for(const c of cards){await ctx.g.move(c,'library');owners.add(c.owner);}for(const p of owners)M.shuffle(p.library,ctx.g.rnd);
  },aiScore:()=>4}]};
  SC['Paradise Plume']={asEnters:async(g,c)=>{const colors=['W','U','B','R','G'],key=await option({g,src:c,you:c.ctrl},colors.map(key=>({key,label:key})),'choose a color',c.ctrl,'manaColor');if(!colors.includes(key))throw Error('Invalid color');c.meta.c21Color=key;},
    mana:{cost:{tap:true},produce:(g,c)=>c.meta.c21Color?[{[c.meta.c21Color]:1}]:[]},triggers:[{on:'cast',filter:(g,c,d)=>M.colorsOfCost(g.castDefinition(d.card,d.so?.castOpts||{}).cost||'').includes(c.meta.c21Color),
      desc:'Gain one life for a spell of the chosen color',opt:true,run:ctx=>ctx.g.gainLife(ctx.you,1)}]};
})();
