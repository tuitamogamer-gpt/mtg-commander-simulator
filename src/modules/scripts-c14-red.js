// Built from Scratch and colorless cards shared by the five lists.
'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
  const M=MTG,E=M.E,T=M.T,SC=M.SCRIPTS,C=M.C14;
  const {choose,option,enterTrigger,grave,row,current,flat,same}=C;
  SC['Bitter Feud']={asEnters:async(g,c)=>{const ctx={g,src:c,you:c.ctrl};const first=await C.choosePlayer(ctx,g.alivePlayers(),'choose the first player');const second=await C.choosePlayer(ctx,g.alivePlayers().filter(p=>p!==first),'choose the second player');c.meta.c14Feud=[first,second];},replace:[{
    event:'damage',applies:(g,d,c)=>{const [a,b]=c.meta.c14Feud||[];const from=d.sourceSnapshot?.ctrl||d.src?.ctrl,to=d.target instanceof M.Player?d.target:d.target?.ctrl;return !!a&&!!b&&(from===a&&to===b||from===b&&to===a);},run:(g,d)=>d.n*2,
  }]};
  SC['Caged Sun']={c14Sun:true,asEnters:async(g,c)=>{c.meta.c14Color=await option({g,src:c,you:c.ctrl},['W','U','B','R','G'].map(key=>({key,label:key})),'choose a color');},statics:[{apply:(g,c,bf)=>{for(const x of bf)if(x.ctrl===c.ctrl&&x.is('Creature')&&x.colors.includes(c.meta.c14Color)){x.cur.power++;x.cur.toughness++;}}}],
    landTapHook:async(g,c,land,p,produced)=>{if(C.live(c)&&c.ctrl===p&&produced[c.meta.c14Color]>0)p.pool[c.meta.c14Color]++;}};
  SC['Crown of Doom']={triggers:[{on:'attacks',filter:(g,c,d)=>d.card.attacking===c.ctrl||d.card.attacking?.is?.('Planeswalker')&&d.card.attacking.ctrl===c.ctrl,desc:'Attacking creature gets +2/+0',run:ctx=>{
    const c=ctx.data.card;if(c.zone==='battlefield'&&c.zoneVersion===ctx.c14AttackerVersion)E.pumpUntilEOT(ctx.g,c,2,0);
  },prepareTargets:ctx=>{ctx.c14AttackerVersion=ctx.data.card.zoneVersion;}}],abilities:[{label:'Give Crown of Doom to a player other than its owner',cost:{mana:'{2}'},cond:(g,c,p)=>g.turnPlayer===p,targets:[T.player({filter:(g,p,ctrl,src)=>p!==src?.owner})],
    prepareTargets:async ctx=>{if(ctx.targets[0]===ctx.src.owner)return false;},run:ctx=>{if(same(ctx))C.control(ctx.g,ctx.src,ctx.targets[0],false);},aiScore:()=>3}]};
  SC['Epochrasite']={etbCounters:{kind:'+1/+1',n:(g,c)=>c.castMeta?.from==='hand'?0:3},triggers:[{on:'dies',filter:(g,c,d)=>d.card===c,desc:'Exile with three time counters and suspend',run:async ctx=>{
    if(!C.currentDeath(ctx))return;await ctx.g.move(ctx.src,'exile');if(ctx.src.zone==='exile')ctx.src.meta.suspended=3;
  }}]};
  SC['Goblin Welder']={abilities:[{label:'Exchange a battlefield artifact and a graveyard artifact',cost:{tap:true},targets:[T.permanent((g,c)=>c.is('Artifact')),grave((g,c)=>c.is('Artifact'),{
    dependentFilter:(g,c,previous)=>c.owner===previous[0]?.ctrl,
  })],run:async ctx=>{
    const [permanent,card]=ctx.targets;if(!permanent||!card||permanent.ctrl!==card.owner)return;const p=permanent.ctrl;
    // The sacrifice and return are one instruction; sacrifice prevention does
    // not prevent the second instruction once both targets are legal.
    const prior=ctx.g._simultaneousLeaveSources;ctx.g._simultaneousLeaveSources=[...(prior||[]),{card:permanent,ctrl:p,snap:ctx.g.snapshot(permanent)}];
    try{await ctx.g.withBattlefieldEntryBatch(async()=>{await ctx.g.sacrifice(p,permanent);await ctx.g.move(card,'battlefield',{ctrl:p});});}
    finally{ctx.g._simultaneousLeaveSources=prior;}
  },aiScore:()=>5}]};
  SC['Impact Resonance']={targets:(g,c)=>[T.creature({count:C.damageMaximum(g),min:0,upTo:true,aiHint:{goal:'removal'}})],prepareTargets:async ctx=>{
    ctx.so.damageDivision=await E.divideDamage(ctx.g,ctx.you,ctx.src,flat(ctx.so.targets),C.damageMaximum(ctx.g));return ctx.so.damageDivision!==null;
  },resolve:async ctx=>{const targets=flat(ctx.targets);await ctx.g.damageBatch((ctx.so.damageDivision||[]).map(r=>({src:ctx.src,target:targets.find(c=>c.iid===r.iid),n:r.n})).filter(r=>r.target),{deferSBA:true});}};
  SC['Incite Rebellion']={resolve:async ctx=>{const hits=[];for(const p of ctx.g.alivePlayers()){const creatures=ctx.g.creatures(p),n=creatures.length;for(const target of [p,...creatures])hits.push({src:ctx.src,target,n});}await ctx.g.damageBatch(hits,{deferSBA:true});}};
  SC['Scrap Mastery']={resolve:async ctx=>{
    const exiled=[];await ctx.g.withC21ExileBatch(async()=>{for(const p of ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you))for(const c of p.graveyard.filter(c=>c.is('Artifact'))){await ctx.g.move(c,'exile');if(c.zone==='exile')exiled.push(row(c));}});
    await C.sacrificeAll(ctx,ctx.g.bf().filter(c=>c.is('Artifact')));
    await ctx.g.withBattlefieldEntryBatch(async()=>{for(const r of exiled)if(current(r))await ctx.g.move(r.card,'battlefield',{ctrl:r.card.owner});});
  }};
  const land=T.permanent((g,c,p)=>c.is('Land')&&!c.def.super.includes('Basic')&&c.ctrl!==p,{aiHint:{goal:'destroy'}});
  const creature=T.creature({filter:(g,c,p)=>c.is('Creature')&&c.ctrl!==p,aiHint:{goal:'removal'}});
  SC['Volcanic Offering']={targets:[land,{...land,chooseByOpponent:true},creature,{...creature,chooseByOpponent:true}],resolve:async ctx=>{
    await ctx.g.destroyMany(flat(ctx.targets.slice(0,2)));await ctx.g.damageBatch(flat(ctx.targets.slice(2)).map(target=>({src:ctx.src,target,n:7})),{deferSBA:true});
  }};
  SC['Word of Seizing']={splitSecond:true,targets:[T.permanent(()=>true)],resolve:ctx=>{const c=ctx.targets[0];ctx.g.untap(c);C.control(ctx.g,c,ctx.you);E.grantUntilEOT(ctx.g,c,['haste']);}};
})();
