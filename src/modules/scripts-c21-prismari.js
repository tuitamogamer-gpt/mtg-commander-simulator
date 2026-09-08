'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
  const M=MTG,E=M.E,T=M.T,SC=M.SCRIPTS,C=M.C21;
  const {same,choose,option,token,artifactToken,enterTrigger,grave,isIS,own,castIS,selfEvent,row,current,immediate,grantExile,exileTop,loyalty,rummage}=C;
  const exileSelf=async ctx=>{if(!ctx.so.isCopy&&ctx.src.zone==='stack')await ctx.g.move(ctx.src,'exile');};
  const elemental=token('Elemental',['Elemental'],4,4,['U','R']);
  const magecraft=async ctx=>{const n=ctx.g.stackSpellManaValue(ctx.data.so);await E.scry(ctx.g,ctx.you,1);
    if(n>=5)await ctx.g.makeTokens(elemental,ctx.you);
    if(n>=10){const players=E.eachOpp(ctx.g,ctx.you);if(players.length)await ctx.g.damageAny(ctx.src,players[Math.floor(ctx.g.rnd()*players.length)],10);}
  };
  SC['Zaffai, Thunder Conductor']={triggers:['cast','spellCopied'].map(on=>({on,filter:castIS,desc:'Scry, create an Elemental, and deal damage for a large spell',run:magecraft}))};
  SC['Jaya Ballard']={abilities:[
    loyalty(1,'Add three red mana for instant and sorcery spells',async ctx=>{ctx.you.pool.R+=3;ctx.you.poolMeta.push({color:'R',n:3,source:ctx.src,
      restrict:(g,payment)=>!!payment?.card&&!payment.isAbility&&g.isInstantSorceryCast(payment.card,payment.castOpts||{})});}),
    loyalty(1,'Discard up to three, then draw',ctx=>rummage(ctx,3)),
    loyalty(-8,'Emblem: cast instants and sorceries from your graveyard',async ctx=>{ctx.you.c21JayaEmblem=true;ctx.you.emblems.push({name:'Jaya Ballard emblem',triggers:[]});}),
  ]};
  SC['Sly Instigator']={abilities:[{label:'Make an opposing creature unblockable and goad it',cost:{mana:'{U}',tap:true},targets:[T.oppCreature()],run:async ctx=>{
    const target=ctx.targets[0],iid=target.iid,version=target.zoneVersion;E.goad(ctx.g,target,ctx.you);ctx.g.untilEffects.push({kind:'c21Instigator',expires:'untilTurnOf',whoTurn:ctx.you,iid:target.iid,version:target.zoneVersion,apply:(g,bf)=>{
      const c=bf.find(c=>c.iid===iid&&c.zoneVersion===version);if(c)c.cur.unblockable=true;
    }});ctx.g.recalc();
  },aiScore:()=>4}]};
  function singleTarget(so){const targets=(so.targets||so.ctx?.targets||[]).flat(Infinity).filter(Boolean);return targets.length===1&&(targets[0] instanceof M.Player||targets[0] instanceof M.CardInst&&targets[0].zone==='battlefield');}
  SC['Radiant Performer']={triggers:[enterTrigger('Copy a spell or ability for every other legal target',async ctx=>{
    const original=ctx.targets[0];if(!ctx.g.stack.includes(original)||!singleTarget(original))return;
    const targets=(original.targets||original.ctx.targets).flat(Infinity).filter(Boolean),source=original.card||original.srcCard;
    const specs=original.targetSpecs||(original.kind==='spell'?ctx.g.spellTargetSpecs(original.card,original.castOpts||{},original.ctrl):[]);
    const slot=(original.targets||original.ctx.targets).findIndex(t=>[t].flat().filter(Boolean).length);
    const candidates=ctx.g.legalTargets(specs[slot],source,ctx.you).filter(t=>t!==targets[0]&&(t instanceof M.Player||t.zone==='battlefield'));
    for(const target of candidates)if(original.kind==='spell')await ctx.g.copySpell(original,ctx.you,{forceTarget:target});else await ctx.g.copyStackAbility(original,ctx.you,{forceTarget:target});
  },{filter:(g,c,d)=>d.card===c&&c.castMeta?.from==='hand',targets:[{zone:'stack',what:'stack',filter:(g,so)=>singleTarget(so)}]})]};
  SC['Charmbreaker Devils']={triggers:[{on:'upkeep',filter:own,desc:'Return a random instant or sorcery',run:async ctx=>{
    const pool=ctx.you.graveyard.filter(isIS);if(pool.length)await ctx.g.move(pool[Math.floor(ctx.g.rnd()*pool.length)],'hand');
  }},{on:'cast',filter:castIS,desc:'+4/+0',run:ctx=>{if(same(ctx))E.pumpUntilEOT(ctx.g,ctx.src,4,0);}}]};
  SC['Erratic Cyclops']={triggers:[{on:'cast',filter:castIS,desc:'Power equal to spell mana value',run:ctx=>{
    if(same(ctx))E.pumpUntilEOT(ctx.g,ctx.src,ctx.g.stackSpellManaValue(ctx.data.so),0);
  }}]};
  SC['Living Lore']={asEnters:async(g,card)=>{
    const [picked]=await choose(g,card.ctrl,card.ctrl.graveyard.filter(isIS),1,1,'Living Lore: exile an instant or sorcery','recur');
    if(picked){await g.move(picked,'exile');card.meta.c21Lore={...row(picked),manaValue:picked.mv};}
  },cdaPower:(g,c)=>c.meta.c21Lore?.manaValue||0,cdaToughness:(g,c)=>c.meta.c21Lore?.manaValue||0,
    triggers:[{on:'oracleDamageBySource',filter:(g,c,d)=>d.hits.some(h=>h.src===c&&h.combat&&h.sourceVersion===c.zoneVersion),desc:'Sacrifice Living Lore to cast the exiled spell',opt:true,run:async ctx=>{
      const linked=ctx.sourceMeta.c21Lore;if(!same(ctx)||!await ctx.g.sacrifice(ctx.you,ctx.src))return;
      if(linked&&current(linked))await immediate(ctx,[linked.card]);
    }}]};
  SC['Crackling Drake']={cdaPower:(g,c)=>[...c.owner.graveyard,...c.owner.exile].filter(isIS).length,
    triggers:[enterTrigger('Draw a card',ctx=>ctx.g.draw(ctx.you,1))]};
  SC['Inspiring Refrain']={suspend:{n:3,cost:'{2}{U}'},resolve:async ctx=>{await ctx.g.draw(ctx.you,2);if(!ctx.so.isCopy&&ctx.src.zone==='stack'){
    await ctx.g.move(ctx.src,'exile');if(ctx.src.zone==='exile')ctx.src.meta.suspended=3;
  }}};
  SC['Muse Vortex']={resolve:async ctx=>{
    const exiled=(await exileTop(ctx,ctx.you,ctx.x)).map(row);
    await immediate(ctx,exiled.filter(r=>isIS(r.card)).map(r=>r.card),{filter:(so,g)=>g.isInstantSorcerySpell(so)&&g.stackSpellManaValue(so)<=ctx.x});
    const rest=[];for(const r of exiled.filter(current))if(isIS(r.card))await ctx.g.move(r.card,'hand');else rest.push(r.card);
    M.shuffle(rest,ctx.g.rnd);for(const c of rest)await ctx.g.move(c,'library',{toBottom:true});
  }};
  SC['Fiery Encore']={storm:true,resolve:async ctx=>{
    const [discarded]=await choose(ctx.g,ctx.you,ctx.you.hand,1,1,'Fiery Encore: discard a card','discard');
    const nonland=discarded&&!discarded.is('Land'),n=discarded?.mv||0;
    if(discarded)await ctx.g.discard(ctx.you,[discarded]);await ctx.g.draw(ctx.you,1);
    if(nonland)ctx.g.queueTrigger({src:ctx.src,ctrl:ctx.you,name:'Fiery Encore: discarded card damage',targets:[T.permanent((g,c)=>c.is('Creature')||c.is('Planeswalker'),{aiHint:{goal:'damage'}})],run:next=>next.g.damageAny(next.src,next.targets[0],n)});
  }};
  SC["Mind's Desire"]={storm:true,resolve:async ctx=>{M.shuffle(ctx.you.library,ctx.g.rnd);grantExile(ctx,await exileTop(ctx,ctx.you,1),{free:true});}};
  SC['Apex of Power']={resolve:async ctx=>{
    grantExile(ctx,await exileTop(ctx,ctx.you,7),{spellsOnly:true});if(ctx.so.from==='hand'&&!ctx.so.isCopy){
      const colors=['W','U','B','R','G'];const key=await option(ctx,colors.map(key=>({key,label:key})),'choose a color for ten mana',ctx.you,'manaColor');if(!colors.includes(key))throw Error('Invalid mana color');ctx.you.pool[key]+=10;
    }
  }};
  SC["Brass's Bounty"]={resolve:ctx=>ctx.g.makeTokens('treasure',ctx.you,{n:ctx.g.lands(ctx.you).length})};
  SC['Volcanic Vision']={targets:[grave((g,c,p)=>c.owner===p&&isIS(c))],resolve:async ctx=>{
    const n=ctx.targets[0].mv;await ctx.g.move(ctx.targets[0],'hand');await ctx.g.damageBatch(ctx.g.creatures().filter(c=>c.ctrl!==ctx.you).map(target=>({src:ctx.src,target,n})),{deferSBA:true});await exileSelf(ctx);
  }};
  SC['Reinterpret']={targets:[T.spell()],resolve:async ctx=>{
    const spell=ctx.targets[0],n=ctx.g.stackSpellManaValue(spell);await ctx.g.counterStackObject(spell,{source:ctx.src});
    await immediate(ctx,ctx.you.hand.slice(),{filter:(so,g)=>g.stackSpellManaValue(so)<=n});
  }};
  SC['Aetherspouts']={resolve:async ctx=>{
    const cards=ctx.g.creatures().filter(c=>c.attacking).map(row),choices=[];
    for(const r of cards){const key=await option(ctx,[{key:'top',label:'Top of library'},{key:'bottom',label:'Bottom of library'}],'put '+r.card.name+' on top or bottom',r.card.owner,'libraryOrder');choices.push({...r,bottom:key==='bottom'});}
    for(const p of ctx.g.apnapFrom(ctx.g.turnPlayer))for(const bottom of [false,true]){
      const pool=choices.filter(r=>r.card.owner===p&&r.bottom===bottom&&current(r)).map(r=>r.card);
      const ordered=pool.length>1?await choose(ctx.g,p,pool,pool.length,pool.length,'Aetherspouts: order cards top to bottom','libraryOrder'):pool;
      for(const c of bottom?ordered:ordered.slice().reverse())await ctx.g.move(c,'library',{toBottom:bottom});
    }
  }};
  SC['Brainstorm']={resolve:async ctx=>{
    await ctx.g.draw(ctx.you,3);const picked=await choose(ctx.g,ctx.you,ctx.you.hand,Math.min(2,ctx.you.hand.length),2,'Brainstorm: choose cards in top-to-bottom order','putBack');
    for(const c of picked.slice().reverse())await ctx.g.move(c,'library');
  }};
  SC["Pyromancer's Goggles"]={mana:{manual:true,c21Goggles:true,restrict:()=>true,cost:{tap:true},produce:[{R:1}]}};
  SC['Metallurgic Summonings']={triggers:[{on:'cast',filter:castIS,desc:'Create a Construct equal to the spell mana value',run:async ctx=>{
    const n=ctx.g.stackSpellManaValue(ctx.data.so);await ctx.g.makeTokens(artifactToken(MTG.c1719TextType(ctx,'Construct'),[MTG.c1719TextType(ctx,'Construct')],n,n),ctx.you);
  }}],abilities:[{label:'Return all instants and sorceries from your graveyard',cost:{mana:'{3}{U}{U}',exileSelf:true},cond:(g,c,p)=>g.bf().filter(x=>x.ctrl===p&&x.is('Artifact')).length>=6,
    run:async ctx=>{for(const c of ctx.you.graveyard.filter(isIS))await ctx.g.move(c,'hand');},aiScore:()=>6}]};
})();
