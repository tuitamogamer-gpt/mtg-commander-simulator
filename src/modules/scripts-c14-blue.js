// Peer Through Time: planeswalker, morph, linked exile and copy effects.
'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
  const M=MTG,E=M.E,T=M.T,SC=M.SCRIPTS,C=M.C14;
  const {choose,option,token,enterTrigger,same,grave,row,current,flat,loyalty,effectOn}=C;
  const faced=(g,c,d)=>d.card===c;
  const frostTap=async ctx=>{const c=ctx.targets[0];ctx.g.tap(c);c.meta.noUntapOnce=true;};
  SC['Teferi, Temporal Archmage']={abilities:[
    loyalty(1,'Look at two; take one and bottom the other',async ctx=>{const cards=ctx.you.library.slice(-2).reverse();const [picked]=await choose(ctx.g,ctx.you,cards,1,1,'Teferi: put one card into your hand','bestCard');
      if(picked)await ctx.g.move(picked,'hand');for(const c of cards)if(c!==picked&&c.zone==='library')await ctx.g.move(c,'library',{toBottom:true});}),
    loyalty(-1,'Untap up to four permanents',async ctx=>{for(const c of flat(ctx.targets))ctx.g.untap(c);},{targets:[T.permanent(()=>true,{count:4,min:0,upTo:true,aiHint:{goal:'untap'}})]}),
    loyalty(-10,'Emblem: activate loyalty abilities at instant speed',ctx=>{ctx.you.emblems.push({name:'Teferi, Temporal Archmage emblem',c14Teferi:true});}),
  ]};
  SC['Brine Elemental']={morph:'{5}{U}{U}',triggers:[{on:'turnedFaceUp',filter:faced,desc:'Opponents skip their next untap step',run:async ctx=>{for(const p of C.opponents(ctx))await C.skipUntap(ctx.g,p);}}]};
  SC['Deep-Sea Kraken']={statics:[{apply:(g,c)=>{c.cur.unblockable=true;}}],suspend:{cost:'{2}{U}',n:9},triggers:[{
    on:'cast',zone:'exile',filter:(g,c,d)=>d.player!==c.owner&&c.meta.suspended>0,desc:'Remove a time counter',run:async ctx=>{
      if(ctx.src.zone==='exile'&&ctx.src.zoneVersion===ctx.sourceZoneVersion)await C.removeSuspend(ctx,ctx.src);
    }}]};
  SC['Dulcet Sirens']={morph:'{U}',abilities:[{label:'A creature must attack a target opponent this turn',cost:{mana:'{U}',tap:true},targets:[T.creature(),T.opponent()],run:ctx=>{
    const c=ctx.targets[0],p=ctx.targets[1];ctx.g.untilEffects.push({kind:'mustAttackPlayerCard',iid:c.iid,timestamp:c.timestamp,targetPlayer:p,expires:'eot'});ctx.g.recalc();
  },aiScore:()=>3}]};
  SC['Domineering Will']={targets:[T.player(),T.creature({filter:(g,c)=>c.is('Creature')&&!c.attacking,count:3,min:0,upTo:true})],resolve:async ctx=>{
    const p=ctx.targets[0];if(!p)return;for(const c of flat(ctx.targets[1])){C.control(ctx.g,c,p);ctx.g.untap(c);effectOn(ctx,c,(g,c)=>{c.cur.mustBlock=true;});}
  }};
  SC["Fool's Demise"]={auraTarget:[T.creature()],triggers:[
    {on:'dies',filter:(g,c,d)=>d.card.iid===c.attachedTo||d.card.iid===c.meta._lastAttachedTo,desc:'Return enchanted creature',run:ctx=>C.returnDeath(ctx)},
    {on:'lto',filter:(g,c,d)=>d.card===c&&c.zone==='graveyard',desc:'Return Fool’s Demise to its owner’s hand',prepareTargets:ctx=>{ctx.c14AuraReturn=row(ctx.src);},run:async ctx=>{if(current(ctx.c14AuraReturn))await ctx.g.move(ctx.src,'hand');}},
  ]};
  SC['Frost Titan']={triggers:[
    {on:'targeted',filter:(g,c,d)=>d.card===c&&d.byPlayer!==c.ctrl,desc:'Counter unless the controller pays {2}',run:async ctx=>{
      const so=ctx.data.so||C.targetStackObjects.get(ctx.data.targetContext);if(!so||!ctx.g.stack.includes(so))return;
      if(await C.pay({...ctx,you:so.ctrl},'{2}'))return;await ctx.g.counterStackObject(so);
    }},enterTrigger('Tap a permanent; it skips its next untap',frostTap,{targets:[T.permanent(()=>true)]}),
    {on:'attacks',filter:faced,desc:'Tap a permanent; it skips its next untap',targets:[T.permanent(()=>true)],run:frostTap},
  ]};
  SC['Infinite Reflection']={c14Reflection:true,auraTarget:[T.creature()],triggers:[enterTrigger('Your other nontoken creatures become copies',async ctx=>{
    const host=ctx.g.byIid(ctx.sourceAttachedTo);let def;
    if(host?.zone==='battlefield'&&host.zoneVersion===ctx.sourceAttachedToZoneVersion)def=M.OracleV8Faces.copyTokenDefinition(host);
    else {const lki=host?.battlefieldLKI?.get(ctx.sourceAttachedToZoneVersion);def=lki?.def;}
    if(!def)return;for(const c of ctx.g.creatures(ctx.you).filter(c=>c!==host&&!c.isToken))M.OracleV8Copies.applyCopy(ctx.g,c,def);ctx.g.recalc();
  })]};
  SC['Intellectual Offering']={resolve:async ctx=>{
    await C.offering(ctx,p=>ctx.g.draw(p,3),'choose an opponent to draw three');
    await C.offering(ctx,async p=>{for(const c of ctx.g.bf())if(c.ctrl===p&&!c.is('Land'))ctx.g.untap(c);},'choose an opponent to untap permanents');
  }};
  const faceCount=g=>g.bf().filter(c=>c.faceDown).length;
  SC['Ixidron']={oracleCharacteristicPT:true,cdaPower:faceCount,cdaToughness:faceCount,asEnters:async(g,c)=>{
    for(const other of g._battlefieldEntryReplacementSnapshot||g.bf())if(other!==c&&other.is('Creature')&&!other.isToken)C.faceDown(g,other);g.recalc();
  }};
  SC['Phyrexian Ingester']={triggers:[enterTrigger('Exile a nontoken creature',async ctx=>{const c=ctx.targets[0];await ctx.g.move(c,'exile');if(same(ctx)&&c.zone==='exile'){ctx.src.meta.c14Ingester=row(c);ctx.g.recalc();}},
    {opt:true,targets:[T.creature({filter:(g,c)=>c.is('Creature')&&!c.isToken,aiHint:{goal:'exile'}})]})],statics:[{apply:(g,c)=>{
      const r=c.meta.c14Ingester;if(r&&current(r)&&r.card.is('Creature')){c.cur.power+=r.card.power;c.cur.toughness+=r.card.toughness;}
    }}]};
  SC['Shaper Parasite']={morph:'{2}{U}',triggers:[{on:'turnedFaceUp',filter:faced,desc:'Give a creature +2/-2 or -2/+2',targets:[T.creature()],run:async ctx=>{
    const plus=await option(ctx,[{key:'power',label:'+2/-2'},{key:'toughness',label:'-2/+2'}],'choose power or toughness');E.pumpUntilEOT(ctx.g,ctx.targets[0],plus==='power'?2:-2,plus==='power'?-2:2);
  }}]};
  SC['Sphinx of Jwar Isle']={revealOwnTop:true};
  SC['Sphinx of Uthuun']={triggers:[enterTrigger('Reveal five; an opponent makes two piles',async ctx=>{
    const cards=ctx.you.library.slice(-5).reverse();await ctx.g.revealToHuman({cards,ctrl:ctx.you,kind:'reveal'});if(!cards.length)return;
    const p=await C.choosePlayer(ctx,C.opponents(ctx),'choose an opponent to separate the piles');if(!p)return;
    const one=await choose(ctx.g,p,cards,0,cards.length,'Sphinx of Uthuun: choose the first pile','splitPile'),two=cards.filter(c=>!one.includes(c));
    const which=await option(ctx,[{key:'one',label:'Pile 1: '+(one.map(c=>c.name).join(', ')||'(empty)')},{key:'two',label:'Pile 2: '+(two.map(c=>c.name).join(', ')||'(empty)')}],'choose a pile');
    const hand=which==='one'?one:two;for(const c of hand)if(c.zone==='library')await ctx.g.move(c,'hand');await ctx.g.withGraveyardEntryBatch(async()=>{for(const c of cards)if(!hand.includes(c)&&c.zone==='library')await ctx.g.move(c,'graveyard');});
  })]};
  SC['Stitcher Geralf']={abilities:[{label:'Each player mills three; exile up to two creatures for a Zombie',cost:{mana:'{2}{U}',tap:true},run:async ctx=>{
    const milled=[];for(const p of ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you)){const cards=p.library.slice(-3);await ctx.g.mill(p,3);milled.push(...cards.filter(c=>c.zone==='graveyard').map(row));}
    const picked=await choose(ctx.g,ctx.you,milled.filter(r=>current(r)&&r.card.is('Creature')).map(r=>r.card),0,2,'Stitcher Geralf: exile up to two milled creatures','bestCard');
    let n=0;for(const c of picked){await ctx.g.move(c,'exile');if(c.zone==='exile')n+=c.power;}
    await ctx.g.makeTokens(token('Zombie',['Zombie'],n,n,['U']),ctx.you);
  },aiScore:()=>5}]};
  SC['Well of Ideas']={triggers:[enterTrigger('Draw two cards',ctx=>ctx.g.draw(ctx.you,2)),{
    on:'drawStep',desc:'Additional cards for the active player',run:ctx=>ctx.g.draw(ctx.data.player,ctx.data.player===ctx.you?2:1),
  }]};
  SC['Willbender']={morph:'{1}{U}',triggers:[{on:'turnedFaceUp',filter:faced,desc:'Change a spell or ability’s single target',targets:[{zone:'stack',what:'spell',filter:(g,so)=>flat(so.targets).length===1,aiHint:{goal:'counter'}}],run:ctx=>ctx.g.c14RetargetSingle(ctx.targets[0],ctx.you)}]};
})();
