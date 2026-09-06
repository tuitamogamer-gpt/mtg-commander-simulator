'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
  const M=MTG,E=M.E,T=M.T,SC=M.SCRIPTS,C=M.C21;
  const {same,choose,token,enterTrigger,grave,own,isIS,selfEvent,row,current,makeFractal,noAbilities}=C;
  SC['Ruxa, Patient Professor']={triggers:['etb','attacks'].map(on=>({on,filter:selfEvent,desc:'Return a creature with no abilities',opt:true,
    targets:[grave((g,c,p)=>c.owner===p&&c.is('Creature')&&noAbilities(c))],run:ctx=>ctx.g.move(ctx.targets[0],'hand')})),statics:[{apply(g,self,bf){
      for(const c of bf)if(c.ctrl===self.ctrl&&c.is('Creature')&&noAbilities(c)){c.cur.power++;c.cur.toughness++;c.cur.mayAssignUnblocked=true;}
    }}]};
  SC['Crafty Cutpurse']={triggers:[enterTrigger('Create opponents’ tokens under your control this turn',async ctx=>{
    ctx.g.untilEffects.push({kind:'c21TokenController',who:ctx.you,sourceCard:ctx.src,expires:'eot'});
  })]};
  const kraken=token('Kraken',['Kraken'],9,9,['U']);
  const whale={...token('Whale',['Whale'],6,6,['U']),oracle:'When this creature dies, create a 9/9 blue Kraken creature token.',triggers:[{on:'dies',filter:selfEvent,desc:'Create a Kraken',run:ctx=>ctx.g.makeTokens(kraken,ctx.you)}]};
  const fish={...token('Fish',['Fish'],3,3,['U']),oracle:'When this creature dies, create a 6/6 blue Whale creature token with a death trigger.',triggers:[{on:'dies',filter:selfEvent,desc:'Create a Whale',run:ctx=>ctx.g.makeTokens(whale,ctx.you)}]};
  SC['Reef Worm']={triggers:[{on:'dies',filter:selfEvent,desc:'Create a Fish',run:ctx=>ctx.g.makeTokens(fish,ctx.you)}]};
  SC['Incubation Druid']={mana:{cost:{tap:true},produce:(g,c,p)=>M.C21Rules.landManaTypes(g,p).map(color=>({[color]:c.counters['+1/+1']>0?3:1}))},
    abilities:[{label:'Adapt 3',cost:{mana:'{3}{G}{G}'},run:ctx=>{if(same(ctx)&&!(ctx.src.counters['+1/+1']>0))ctx.g.addCounters(ctx.src,'+1/+1',3,false,ctx.you);},aiScore:(g,c)=>c.counters['+1/+1']?0:5}]};
  SC['Terastodon']={triggers:[enterTrigger('Destroy up to three noncreature permanents',async ctx=>{
    const targets=[ctx.targets[0]].flat().filter(Boolean).map(c=>({...row(c),ctrl:c.ctrl})),destroyed=[];
    await ctx.g.withGraveyardEntryBatch(async()=>{for(const r of targets)if(current(r)){await ctx.g.destroy(r.card);if(r.card.zone==='graveyard'&&r.card.zoneVersion===r.version+1)destroyed.push(r);}});
    for(const r of destroyed)await ctx.g.makeTokens(token('Elephant',['Elephant'],3,3,['G']),r.ctrl);
  },{targets:[T.permanent((g,c)=>!c.is('Creature'),{upTo:true,min:0,count:3,aiHint:{goal:'destroy'}})]})]};
  SC['Master Biomancer']={c21Biomancer:true};
  SC["Ezuri's Predation"]={resolve:async ctx=>{
    const enemies=ctx.g.creatures().filter(c=>c.ctrl!==ctx.you).map(row);
    const made=await ctx.g.makeTokens(token('Phyrexian Beast',['Phyrexian','Beast'],4,4,['G']),ctx.you,{n:enemies.length});
    const available=made.filter(c=>c.zone==='battlefield'&&c.is('Creature')),pairs=[];
    for(const r of enemies.filter(current))if(available.length){const [beast]=await choose(ctx.g,ctx.you,available,1,1,'Ezuri’s Predation: choose a Beast to fight '+r.card.name,'fight');available.splice(available.indexOf(beast),1);pairs.push([beast,r.card]);}
    const hits=[];
    for(const [a,b] of pairs){const rows=[a,b].map(card=>({card,version:card.zoneVersion,ctrl:card.ctrl,power:Math.max(0,card.power)}));for(const r of rows)await ctx.g.emit('fight',{card:r.card,cards:[r]});hits.push({src:a,target:b,n:rows[0].power},{src:b,target:a,n:rows[1].power});}
    await ctx.g.damageBatch(hits,{deferSBA:true});
  }};
  SC['Sequence Engine']={abilities:[{label:'Exile a creature card; create a Fractal of its mana value',sorcery:true,cost:{manaFromTarget:true,tap:true},
    targets:[grave((g,c)=>c.is('Creature'))],run:async ctx=>{const n=ctx.targets[0].mv;await ctx.g.move(ctx.targets[0],'exile');await makeFractal(ctx,n);},aiScore:()=>5}]};
  const nexusCache=new WeakMap();
  SC['Geometric Nexus']={triggers:[{on:'cast',filter:(g,c,d)=>d.isInstantSorcery,desc:'Charge counters equal to the spell mana value',run:ctx=>{
    if(same(ctx))ctx.g.addCounters(ctx.src,'charge',ctx.g.stackSpellManaValue(ctx.data.so),false,ctx.you);
  }}],statics:[{grantsSelfActivatedAbility:true,apply(g,c){
    const n=c.counters.charge||0;let cache=nexusCache.get(c);if(!cache){cache=new Map();nexusCache.set(c,cache);}if(!cache.has(n))cache.set(n,{
      label:'Remove all '+n+' charge counters: create a Fractal',cost:{mana:'{6}',tap:true,...(n?{rmCounter:{kind:'charge',n}}:{})},
      cond:(g,self)=>(self.counters.charge||0)===n,run:ctx=>makeFractal(ctx,n),aiScore:()=>n>0?5:0});c.cur.extraAbilities.push(cache.get(n));
  }}]};
  SC['Paradox Zone']={etbCounters:{kind:'growth',n:1},triggers:[{on:'endStep',filter:own,desc:'Double growth counters and create a Fractal',
    prepareTargets:ctx=>{ctx.c21Growth=ctx.src.counters.growth||0;},run:async ctx=>{let n=ctx.c21Growth;if(same(ctx)){ctx.g.addCounters(ctx.src,'growth',ctx.src.counters.growth||0,false,ctx.you);n=ctx.src.counters.growth||0;}await makeFractal(ctx,n);}}]};
  SC['Primal Empathy']={triggers:[{on:'upkeep',filter:own,desc:'Draw for greatest power, or put a +1/+1 counter',run:async ctx=>{
    const yours=ctx.g.creatures(ctx.you),theirs=ctx.g.creatures().filter(c=>c.ctrl!==ctx.you);if(!yours.length)return;
    if(yours.some(c=>theirs.every(other=>c.power>=other.power)))await ctx.g.draw(ctx.you,1);
    else {const [c]=await choose(ctx.g,ctx.you,yours,1,1,'Primal Empathy: put a counter on a creature','pump');if(c)ctx.g.addCounters(c,'+1/+1',1,false,ctx.you);}
  }}]};
})();
