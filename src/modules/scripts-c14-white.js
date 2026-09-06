// Forged in Stone and shared Equipment.
'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
  const M=MTG,E=M.E,T=M.T,SC=M.SCRIPTS,C=M.C14;
  const {choose,option,token,enterTrigger,same,grave,row,current,flat,loyalty,effectOn}=C;
  const soldier=token('Soldier',['Soldier'],1,1,['W']);
  const blade={name:'Stoneforged Blade',cost:null,super:[],types:['Artifact'],subtypes:['Equipment'],oracle:'Indestructible\nEquipped creature gets +5/+5 and has double strike.\nEquip {0}',kws:['indestructible'],equip:'{0}',isTokenDef:true,
    attachGrant:(g,c,h)=>{h.cur.power+=5;h.cur.toughness+=5;h.cur.kw.add('double strike');}};
  M.TOKENS.c14KorSoldier=token('Kor Soldier',['Kor','Soldier'],1,1,['W']);
  M.TOKENS.c14StoneforgedBlade=blade;
  M.TOKEN_IMG['Kor Soldier']='d9c95045-e806-4933-94a4-cb52ae1a215b';
  M.TOKEN_IMG['Stoneforged Blade']='59a00cac-53ae-46ad-8468-e6d1db40b266';
  SC['Nahiri, the Lithomancer']={abilities:[
    loyalty(2,'Create a Kor Soldier and attach an Equipment',async ctx=>{const made=await ctx.g.makeTokens(token('Kor Soldier',['Kor','Soldier'],1,1,['W']),ctx.you);const kor=made[0];if(!kor)return;
      const [equipment]=await choose(ctx.g,ctx.you,ctx.g.bf().filter(c=>c.ctrl===ctx.you&&c.hasSub('Equipment')&&!c.is('Creature')&&!ctx.g.isProtectedFrom(kor,c)),0,1,'Nahiri: attach an Equipment');if(equipment)await ctx.g.attach(equipment,kor);
    }),
    loyalty(-2,'Put an Equipment from hand or graveyard onto the battlefield',async ctx=>{const [c]=await choose(ctx.g,ctx.you,[...ctx.you.hand,...ctx.you.graveyard].filter(c=>c.hasSub('Equipment')),0,1,'Nahiri: put an Equipment onto the battlefield');if(c)await ctx.g.move(c,'battlefield',{ctrl:ctx.you});}),
    loyalty(-10,'Create Stoneforged Blade',ctx=>ctx.g.makeTokens(blade,ctx.you)),
  ]};
  SC['Adarkar Valkyrie']={abilities:[{label:'Return another creature when it dies this turn',cost:{tap:true},targets:[T.creature({filter:(g,c,p,src)=>c.is('Creature')&&c!==src})],run:async ctx=>{
    const r=row(ctx.targets[0]);ctx.g.delayed.push({on:'dies',once:false,src:ctx.src,ctrl:ctx.you,name:'Adarkar Valkyrie: return the creature',expires:'eot',
      filter:(g,d)=>d.card===r.card&&d.snap.zoneVersion===r.version,run:next=>C.returnDeath(next)});
  },aiScore:()=>4}]};
  SC['Arcane Lighthouse']={mana:{cost:{tap:true},produce:[{C:1}]},abilities:[{label:'Opposing creatures lose hexproof and shroud this turn',cost:{mana:'{1}',tap:true},run:ctx=>{
    ctx.g.untilEffects.push({kind:'c14Lighthouse',expires:'eot',rows:ctx.g.creatures().filter(c=>c.ctrl!==ctx.you).map(row)});ctx.g.recalc();
  },aiScore:()=>2}]};
  SC['Assault Suit']={equip:'{3}',attachGrant:(g,c,h)=>{h.cur.power+=2;h.cur.toughness+=2;h.cur.kw.add('haste');h.cur.c14CantSacrifice=true;(h.cur.c14CannotAttack||=[]).push(c.ctrl);},triggers:[{
    on:'upkeep',filter:(g,c,d)=>d.player!==c.ctrl&&!!c.attachedTo,desc:'Lend equipped creature to the active opponent',opt:true,run:async ctx=>{
      if(!same(ctx)||ctx.data.player.lost)return;const host=ctx.g.byIid(ctx.src.attachedTo);if(!host||host.zone!=='battlefield')return;
      C.control(ctx.g,host,ctx.data.player);ctx.g.untap(host);
    }}]};
  SC['Benevolent Offering']={resolve:async ctx=>{
    const spirit=token('Spirit',['Spirit'],1,1,['W'],['flying']);await C.offering(ctx,p=>ctx.g.makeTokens(spirit,p,{n:3}),'choose an opponent to create Spirits');
    const p=await C.choosePlayer(ctx,C.opponents(ctx),'choose an opponent to gain life');const entries=[ctx.you,...(p?[p]:[])].map(p=>({p,n:ctx.g.creatures(p).length*2}));for(const {p,n}of entries)await ctx.g.gainLife(p,n);
  }};
  SC['Celestial Crusader']={splitSecond:true,statics:[{apply:(g,c,bf)=>{for(const x of bf)if(x!==c&&x.is('Creature')&&x.colors.includes('W')){x.cur.power++;x.cur.toughness++;}}}]};
  SC['Containment Priest']={c14Priest:true};
  SC['Grand Abolisher']={c14Abolisher:true,oppCantCastYourTurn:(g,c)=>!c.cur?.abilitiesDisabled};
  SC['Decree of Justice']={resolve:ctx=>ctx.g.makeTokens(token('Angel',['Angel'],4,4,['W'],['flying']),ctx.you,{n:ctx.x}),cycling:{cost:'{2}{W}'},triggers:[{
    on:'cycled',zone:'cycling-source',filter:(g,c,d)=>d.card===c,desc:'Pay X to create X Soldiers',run:async ctx=>{
      const max=ctx.g.maxAffordableX(ctx.you,M.parseCost('{X}'),ctx.src);const n=await ctx.you.controller.decide(ctx.g,{type:'chooseX',min:0,max,card:ctx.src,prompt:'Decree of Justice: pay X for Soldiers',aiHint:{kind:'chooseX',card:ctx.src}});
      if(!Number.isInteger(n)||n<0||n>max)throw Error('Invalid cycling X');if(n&&await ctx.g.payMana(ctx.you,M.parseCost('{'+n+'}')))await ctx.g.makeTokens(soldier,ctx.you,{n});
    }}]};
  SC['Fell the Mighty']={targets:[T.creature()],resolve:ctx=>ctx.g.destroyMany(ctx.g.creatures().filter(c=>c.power>ctx.targets[0].power))};
  SC['Kemba, Kha Regent']={triggers:[{on:'upkeep',filter:(g,c,d)=>d.player===c.ctrl,desc:'Create Cats for attached Equipment',run:async ctx=>{
    const snap=same(ctx)?ctx.g.snapshot(ctx.src):ctx.src.battlefieldLKI?.get(ctx.sourceZoneVersion);const n=(snap?.attachedSources||[]).filter(r=>r.snap.subtypes.includes('Equipment')).length;await ctx.g.makeTokens(token('Cat',['Cat'],2,2,['W']),ctx.you,{n});
  }}]};
  SC["Marshal's Anthem"]={multikicker:'{1}{W}',statics:[{apply:(g,c,bf)=>{for(const x of bf)if(x.ctrl===c.ctrl&&x.is('Creature')){x.cur.power++;x.cur.toughness++;}}}],triggers:[enterTrigger('Return creatures for each multikicker payment',async ctx=>{
    await ctx.g.withBattlefieldEntryBatch(async()=>{for(const c of flat(ctx.targets))await ctx.g.move(c,'battlefield',{ctrl:ctx.you});});
  },{targets:(g,c)=>[grave((g,x,p)=>x.owner===p&&x.is('Creature'),{count:c.castMeta?.paidTimes||0,min:0,upTo:true})]})]};
  SC['Serra Avatar']={oracleCharacteristicPT:true,cdaPower:(g,c)=>c.ctrl.life,cdaToughness:(g,c)=>c.ctrl.life,triggers:[{
    on:'c14EnteredGraveyard',zone:'graveyard',filter:(g,c,d)=>d.card===c,desc:'Shuffle Serra Avatar into its owner’s library',run:async ctx=>{
      if(ctx.src.zone==='graveyard'&&ctx.src.zoneVersion===ctx.data.version){await ctx.g.move(ctx.src,'library');M.shuffle(ctx.src.owner.library,ctx.g.rnd);}
    }}]};
  SC['Strata Scythe']={equip:'{3}',triggers:[enterTrigger('Exile a land from your library',async ctx=>{
    const [card]=await choose(ctx.g,ctx.you,ctx.you.library.filter(c=>c.is('Land')),0,1,'Strata Scythe: search for a land','searchLand');
    if(card){await ctx.g.revealToHuman({cards:[card],ctrl:ctx.you,kind:'reveal'});await ctx.g.move(card,'exile');if(same(ctx)&&card.zone==='exile')ctx.src.meta.c14Scythe=row(card);}M.shuffle(ctx.you.library,ctx.g.rnd);ctx.g.recalc();
  })],attachGrant:(g,c,h)=>{const r=c.meta.c14Scythe;if(!r||!current(r))return;const n=g.lands().filter(l=>l.name===r.card.name).length;h.cur.power+=n;h.cur.toughness+=n;}};
  SC['Twilight Shepherd']={persist:true,triggers:[enterTrigger('Return cards put into your graveyard from the battlefield this turn',async ctx=>{
    const cards=ctx.you.graveyard.filter(c=>c.meta.c14GraveEntry?.turn===ctx.g.turnNo&&c.meta.c14GraveEntry.version===c.zoneVersion);for(const c of cards)await ctx.g.move(c,'hand');
  })]};
})();
