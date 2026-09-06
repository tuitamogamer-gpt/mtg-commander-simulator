// Guided by Nature.
'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
  const M=MTG,E=M.E,T=M.T,SC=M.SCRIPTS,C=M.C14;
  const {choose,option,token,enterTrigger,row,current,loyalty,same}=C;
  const wolf=token('Wolf',['Wolf'],2,2,['G']),beast=token('Beast',['Beast'],3,3,['G']);
  const elf={...token('Elf Druid',['Elf','Druid'],1,1,['G']),oracle:'{T}: Add {G}.',mana:{cost:{tap:true},produce:[{G:1}]}};
  M.TOKENS.c14ElfDruid=elf;
  M.TOKEN_IMG['Elf Druid']='01b1f130-2e12-4e57-876b-fc81619ff01f';
  SC["Freyalise, Llanowar's Fury"]={abilities:[
    loyalty(2,'Create an Elf Druid that taps for green mana',ctx=>ctx.g.makeTokens(elf,ctx.you)),
    loyalty(-2,'Destroy an artifact or enchantment',ctx=>ctx.g.destroy(ctx.targets[0]),{targets:[T.permanent((g,c)=>c.is('Artifact')||c.is('Enchantment'),{aiHint:{goal:'destroy'}})]}),
    loyalty(-6,'Draw for each green creature you control',ctx=>ctx.g.draw(ctx.you,ctx.g.creatures(ctx.you).filter(c=>c.colors.includes('G')).length)),
  ]};
  SC['Fresh Meat']={resolve:ctx=>ctx.g.makeTokens(beast,ctx.you,{n:ctx.g.diedThisTurn.filter(s=>s.owner===ctx.you&&s.types.includes('Creature')).length})};
  SC['Grave Sifter']={triggers:[enterTrigger('Each player chooses a creature type and returns cards',async ctx=>{
    const selections=[];for(const p of ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you)){
      const counts={};for(const c of p.graveyard)for(const t of c.def.subtypes||[])counts[t]=(counts[t]||0)+1;
      const types=[...M.CREATURE_SUBTYPES].sort((a,b)=>(counts[b]||0)-(counts[a]||0)||a.localeCompare(b));
      const kind=await option(ctx,types.map(key=>({key,label:key})),'choose a creature type',p,'chooseType');if(!types.includes(kind))throw Error('Invalid creature type');
      const chosen=await choose(ctx.g,p,p.graveyard.filter(c=>c.hasSub(kind)),0,p.graveyard.length,'Grave Sifter: return cards of type '+kind,'recur');selections.push(...chosen.map(row));
    }for(const r of selections)if(current(r))await ctx.g.move(r.card,'hand');
  })]};
  SC['Haunted Fengraf']={mana:{cost:{tap:true},produce:[{C:1}]},abilities:[{label:'Return a random creature from your graveyard',cost:{mana:'{3}',tap:true,sacSelf:true},run:async ctx=>{
    const cards=ctx.you.graveyard.filter(c=>c.is('Creature'));if(cards.length)await ctx.g.move(cards[Math.floor(ctx.g.rnd()*cards.length)],'hand');
  },aiScore:()=>4}]};
  SC["Praetor's Counsel"]={resolve:async ctx=>{for(const c of ctx.you.graveyard.slice())await ctx.g.move(c,'hand');if(!ctx.so.isCopy&&ctx.src.zone==='stack')await ctx.g.move(ctx.src,'exile');ctx.you.noMaxHandForever=true;}};
  SC['Siege Behemoth']={statics:[{apply:(g,c,bf)=>{if(c.attacking)for(const x of bf)if(x.ctrl===c.ctrl&&x.is('Creature'))x.cur.mayAssignUnblocked=true;}}]};
  const dryads={kind:'v8-land-types',types:['Forest'],retain:false,attached:true,contract:'continuous-basic-land-types'};
  SC['Song of the Dryads']={auraTarget:[T.permanent(()=>true)],statics:[{phase:1,oracleBasicLandTypes:true,oracleOperation:dryads,affects:(g,c,h)=>h.iid===c.attachedTo,apply:(g,c,bf)=>{
    const h=bf.find(x=>x.iid===c.attachedTo);if(!h)return;
    h.cur.types=['Land'];h.cur.subtypes=[];h.cur.colors=[];M.OracleV8LandTypes.change(h,dryads);
  }}]};
  SC['Wave of Vitriol']={resolve:async ctx=>{
    const sacrificed=await C.sacrificeAll(ctx,ctx.g.bf().filter(c=>c.is('Artifact')||c.is('Enchantment')||c.is('Land')&&!c.def.super.includes('Basic')));
    for(const p of ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you)){
      const n=sacrificed.filter(r=>r.ctrl===p&&r.snap.types.includes('Land')).length;if(!n)continue;
      if(await option(ctx,[{key:'yes',label:'Search for basic lands'},{key:'no',label:'Decline'}],'search for up to '+n+' basic lands',p,'searchLand')==='yes')await C.search(ctx,p,c=>c.is('Land')&&c.def.super.includes('Basic'),n,'battlefield',true);
    }
  }};
  SC['Wolfbriar Elemental']={multikicker:'{G}',triggers:[enterTrigger('Create Wolves for each multikicker payment',ctx=>ctx.g.makeTokens(wolf,ctx.you,{n:ctx.data.card.castMeta?.paidTimes||0}))]};
  SC["Wolfcaller's Howl"]={triggers:[{on:'upkeep',filter:(g,c,d)=>d.player===c.ctrl,desc:'Wolves for opponents with four or more cards',run:ctx=>ctx.g.makeTokens(wolf,ctx.you,{n:C.opponents(ctx).filter(p=>p.hand.length>=4).length})}]};
  SC["Wren's Run Packmaster"]={abilities:[{label:'Create a 2/2 Wolf',cost:{mana:'{2}{G}'},run:ctx=>ctx.g.makeTokens(wolf,ctx.you),aiScore:()=>4}],statics:[{apply:(g,c,bf)=>{for(const x of bf)if(x.ctrl===c.ctrl&&x.hasSub('Wolf'))x.cur.kw.add('deathtouch');}}],triggers:[
    enterTrigger('Champion another Elf or sacrifice this creature',async ctx=>{
      const [elf]=await choose(ctx.g,ctx.you,ctx.g.bf().filter(c=>c!==ctx.src&&c.ctrl===ctx.you&&c.hasSub('Elf')),0,1,'Champion another Elf');
      if(!elf){if(same(ctx))await ctx.g.sacrifice(ctx.you,ctx.src);return;}
      await ctx.g.move(elf,'exile');if(elf.zone==='exile')(ctx.sourceMeta.c14Champion||=[]).push(row(elf));
    }),{on:'lto',filter:(g,c,d)=>d.card===c,desc:'Return the championed Elf',run:async ctx=>{
      await ctx.g.withBattlefieldEntryBatch(async()=>{for(const r of ctx.sourceMeta.c14Champion||[])if(current(r))await ctx.g.move(r.card,'battlefield',{ctrl:r.card.owner});});
    }},
  ]};
})();
