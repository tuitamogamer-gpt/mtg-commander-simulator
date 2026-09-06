// Sworn to Darkness.
'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
  const M=MTG,E=M.E,T=M.T,SC=M.SCRIPTS,C=M.C14;
  const {choose,token,enterTrigger,grave,row,current,flat,loyalty,same}=C;
  const extort={on:'cast',desc:'Extort',opt:true,filter:(g,c,d)=>d.player===c.ctrl,aiHint:{kind:'extort'},run:async ctx=>{
    const cost=M.parseCost('{W/B}');if(ctx.g.canPayMana(ctx.you,cost)&&await ctx.g.payMana(ctx.you,cost)){const n=await ctx.g.loseLifeOpponents(ctx.src,ctx.you,1,'extort');await ctx.g.gainLife(ctx.you,n);}
  }};
  const needsOutlet=(g,p)=>g.creatures(p).some(c=>M.persecutorExitValue?.(g,c,p)>0);
  SC['Ob Nixilis of the Black Oath']={abilities:[
    loyalty(2,'Each opponent loses 1 life; gain that much life',async ctx=>{const n=await ctx.g.loseLifeOpponents(ctx.src,ctx.you,1,'Ob Nixilis');await ctx.g.gainLife(ctx.you,n);},{aiScore:(g,c,p)=>needsOutlet(g,p)?20:4}),
    loyalty(-2,'Create a 5/5 flying Demon and lose 2 life',async ctx=>{await ctx.g.makeTokens(token('Demon',['Demon'],5,5,['B'],['flying']),ctx.you);await ctx.g.loseLife(ctx.you,2);},{aiScore:(g,c,p)=>needsOutlet(g,p)?-20:4}),
    loyalty(-8,'Emblem: sacrifice creatures for life and cards',C.obEmblem,{aiScore:(g,c,p)=>needsOutlet(g,p)?30:6}),
  ]};
  SC['Abyssal Persecutor']={c14Persecutor:true};
  SC['Aether Snap']={resolve:async ctx=>{const cards=ctx.g.bf();for(const c of cards)for(const [kind,n]of Object.entries(c.counters))if(n>0)ctx.g.removeCounters(c,kind,n);await ctx.g.exileMany(cards.filter(c=>c.isToken));}};
  SC['Crypt Ghast']={c14Ghast:true,triggers:[extort],landTapHook:async(g,c,land,p)=>{if(C.live(c)&&c.ctrl===p&&land.hasSub('Swamp'))p.pool.B++;}};
  SC['Demon of Wailing Agonies']={statics:[{apply:(g,c)=>{if(C.controlledCommander(g,c.ctrl)){c.cur.power+=2;c.cur.toughness+=2;c.cur.extraTriggers.push({
    on:'combatDamageToPlayer',filter:(g,self,d)=>d.card===self,desc:'Damaged player sacrifices a creature',run:async ctx=>{const p=ctx.data.player;const [chosen]=await choose(ctx.g,p,ctx.g.creatures(p).filter(c=>ctx.g.canSacrifice(c)),1,1,'Demon of Wailing Agonies: sacrifice a creature','sacCost');if(chosen)await ctx.g.sacrifice(p,chosen);},
  });}}}]};
  SC['Nekrataal']={triggers:[enterTrigger('Destroy a nonartifact, nonblack creature without regeneration',ctx=>ctx.g.destroy(ctx.targets[0],{noRegen:true}),{
    targets:[T.creature({filter:(g,c)=>c.is('Creature')&&!c.is('Artifact')&&!c.colors.includes('B'),aiHint:{goal:'destroy'}})],
  })]};
  SC['Pontiff of Blight']={triggers:[extort],statics:[{apply:(g,c,bf)=>{for(const x of bf)if(x!==c&&x.ctrl===c.ctrl&&x.is('Creature'))x.cur.extraTriggers.push({...extort});}}]};
  SC['Raving Dead']={triggers:[{on:'beginCombat',filter:(g,c,d)=>d.player===c.ctrl,desc:'Random opponent must be attacked',run:ctx=>{
    const opponents=C.opponents(ctx);if(!same(ctx)||!opponents.length)return;const p=opponents[Math.floor(ctx.g.rnd()*opponents.length)];
    ctx.g.untilEffects.push({kind:'mustAttackPlayerCard',iid:ctx.src.iid,timestamp:ctx.src.timestamp,targetPlayer:p,expires:'combat'});ctx.g.recalc();
  }},{on:'combatDamageToPlayer',filter:(g,c,d)=>d.card===c,desc:'Damaged player loses half their life',run:ctx=>ctx.g.loseLife(ctx.data.player,Math.floor(Math.max(0,ctx.data.player.life)/2))}]};
  SC['Skeletal Scrying']={additionalExileGraveyardX:true,xMax:(g,c,p)=>p.graveyard.filter(x=>x!==c).length,resolve:async ctx=>{await ctx.g.draw(ctx.you,ctx.x);await ctx.g.loseLife(ctx.you,ctx.x);}};
  SC['Tragic Slip']={targets:[T.creature({aiHint:{goal:'removal'}})],resolve:ctx=>{const n=ctx.g.diedThisTurn.some(s=>s.types.includes('Creature'))?13:1;E.pumpUntilEOT(ctx.g,ctx.targets[0],-n,-n);}};
  const combatOnly=(g,c,p)=>g.turnPlayer!==p&&g.phase==='combat';
  SC['Wake the Dead']={oracleCastRestriction:combatOnly,xMax:(g,c,p)=>p.graveyard.filter(c=>c.is('Creature')).length,
    targets:(g,c,opts)=>[grave((g,c,p)=>c.owner===p&&c.is('Creature'),{count:opts.xVal||0,min:opts.xVal||0})],resolve:async ctx=>{
      const returned=[];await ctx.g.withBattlefieldEntryBatch(async()=>{for(const c of flat(ctx.targets)){await ctx.g.move(c,'battlefield',{ctrl:ctx.you});if(c.zone==='battlefield')returned.push(row(c));}});
      ctx.g.delayed.push({on:'endStep',once:true,ctrl:ctx.you,src:ctx.src,name:'Wake the Dead: sacrifice returned creatures',run:async later=>{
        await later.g.sacrificeMany(later.you,returned.filter(r=>current(r)&&r.card.ctrl===later.you).map(r=>r.card));
      }});
    }};
  SC['Xathrid Demon']={triggers:[{on:'upkeep',filter:(g,c,d)=>d.player===c.ctrl,desc:'Sacrifice another creature or lose 7 life',run:async ctx=>{
    const pool=ctx.g.creatures(ctx.you).filter(c=>c!==ctx.src&&ctx.g.canSacrifice(c));const [c]=await choose(ctx.g,ctx.you,pool,1,1,'Xathrid Demon: sacrifice another creature','sacCost');
    const n=c?Math.max(0,c.power):0;if(c&&await ctx.g.sacrifice(ctx.you,c)){await ctx.g.loseLifeOpponents(ctx.src,ctx.you,n,'Xathrid Demon');}
    else{if(same(ctx))ctx.g.tap(ctx.src);await ctx.g.loseLife(ctx.you,7);}
  }}]};
})();
