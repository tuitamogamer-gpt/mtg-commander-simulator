// Commander 2021: shared choices and the twelve missing Lorehold cards.
'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
  const M=MTG,E=M.E,T=M.T,SC=M.SCRIPTS,S=M.StarterPrecons;
  const {choose,option,token,enterTrigger,same,grave}=S;
  const isIS=c=>c.is('Instant')||c.is('Sorcery');
  const own=(g,c,d)=>(d.player||d.ctrl)===c.ctrl;
  const castIS=(g,c,d)=>own(g,c,d)&&d.isInstantSorcery;
  const selfEvent=(g,c,d)=>d.card===c;
  const countCounters=c=>Object.values(c.counters||{}).reduce((n,v)=>n+Math.max(0,v),0);
  const row=c=>({card:c,version:c.zoneVersion,zone:c.zone});
  const controllerAt=(g,c,d)=>d.card===c?d.snap.ctrl:(g._simultaneousLeaveSources||[]).find(r=>r.card===c)?.snap.ctrl||c.ctrl;
  const current=r=>r.card.zone===r.zone&&r.card.zoneVersion===r.version;
  const artifactToken=(name,subtypes,p,t,kws=[])=>({...token(name,subtypes,p,t,[],kws),types:['Artifact','Creature']});
  const inkling=token('Inkling',['Inkling'],2,1,['W','B'],['flying']);
  const fractal=token('Fractal',['Fractal'],0,0,['G','U']);
  async function makeFractal(ctx,n){const made=await ctx.g.makeTokens(fractal,ctx.you);for(const c of made)if(n>0)ctx.g.addCounters(c,'+1/+1',n,false,ctx.you);return made;}
  async function choosePlayer(ctx,players,prompt,by=ctx.you){
    if(!players.length)return null;
    const key=await option(ctx,players.map(p=>({key:String(p.idx),label:p.name,player:p})),prompt,by,'choosePlayer');
    const picked=players.find(p=>String(p.idx)===String(key));if(!picked)throw Error('Invalid player choice: '+prompt);return picked;
  }
  async function pay(ctx,cost){
    const parsed=M.parseCost(cost);if(!ctx.g.canPayMana(ctx.you,parsed,{card:ctx.src,isAbility:true}))return false;
    if(await option(ctx,[{key:'yes',label:'Pay '+cost},{key:'no',label:'Decline'}],'pay '+cost,ctx.you,'optTrigger')!=='yes')return false;
    return ctx.g.payMana(ctx.you,parsed,{card:ctx.src,isAbility:true});
  }
  async function rummage(ctx,n){const cards=await choose(ctx.g,ctx.you,ctx.you.hand,0,n,ctx.src.name+': discard up to '+n,'discard');await ctx.g.discard(ctx.you,cards);await ctx.g.draw(ctx.you,cards.length);}
  async function search(ctx,player,filter,n,destination='hand',tapped=false){
    const cards=await choose(ctx.g,player,player.library.filter(filter),0,n,ctx.src.name+': search your library','searchLand');
    await ctx.g.revealToHuman({cards,ctrl:player,kind:'reveal'});
    await ctx.g.withBattlefieldEntryBatch(async()=>{for(const card of cards)await ctx.g.move(card,destination,{ctrl:player,tapped});});
    M.shuffle(player.library,ctx.g.rnd);return cards;
  }
  async function reanimate(ctx,player,filter=()=>true){const cards=await choose(ctx.g,player,player.graveyard.filter(c=>c.is('Creature')&&filter(c)),1,1,ctx.src.name+': return a creature','recur');if(cards[0])await ctx.g.move(cards[0],'battlefield',{ctrl:player});return cards[0];}
  async function immediate(ctx,cards,{free=true,filter=()=>true,exileAfter=false}={}){
    return M.OracleV8PlayPermissions.castOne(ctx,cards,{free,exileAfter,filter:{}},{target:()=>({filter:(g,so)=>filter(so,g)})});
  }
  function grantExile(ctx,cards,opts={}){for(const card of cards)if(card.zone==='exile')Object.assign(card.meta,{playableBy:ctx.you,playableUntil:opts.forever?Number.MAX_SAFE_INTEGER:ctx.g.turnNo,
    ...(opts.free?{freePlay:true}:{}),...(opts.anyColor?{anyColor:true}:{}),...(opts.spellsOnly?{c21SpellsOnly:true,spellsOnly:true}: {})});}
  async function exileTop(ctx,player,n){if(!(n>0))return [];const cards=player.library.slice(-n).reverse();await ctx.g.withC21ExileBatch(async()=>{for(const c of cards)if(c.zone==='library')await ctx.g.move(c,'exile');});return cards.filter(c=>c.zone==='exile');}
  const loyalty=(n,label,run,extra={})=>({loyalty:n,sorcery:true,label,cost:{},run,aiScore:()=>n<0?5:3,...extra});
  const noAbilities=c=>{
    if(c.zone==='battlefield'&&c.cur){if(c.cur.kw.size||c.cur.extraAbilities?.length||c.cur.extraTriggers?.length||c.cur.extraMana?.length)return false;if(c.cur.abilitiesDisabled)return true;}
    return !String(c.def.oracle||'').trim()&&!(c.def.kws||[]).length&&!c.def.abilities?.length&&!c.def.triggers?.length&&!c.def.statics?.length&&!c.def.mana;
  };
  M.C21={...S,isIS,own,castIS,selfEvent,countCounters,row,current,controllerAt,artifactToken,inkling,fractal,makeFractal,choosePlayer,pay,rummage,search,reanimate,immediate,grantExile,exileTop,loyalty,noAbilities};

  const osgirCache=new WeakMap();
  SC['Osgir, the Reconstructor']={abilities:[{label:'Sacrifice an artifact: +2/+0',cost:{mana:'{1}',sac:(g,c)=>c.is('Artifact')},
    targets:[T.yourCreature()],run:ctx=>E.pumpUntilEOT(ctx.g,ctx.targets[0],2,0),aiScore:()=>3}],statics:[{grantsSelfActivatedAbility:true,apply(g,self){
      let cache=osgirCache.get(self);if(!cache){cache=new Map();osgirCache.set(self,cache);}
      for(const card of self.ctrl.graveyard.filter(c=>c.is('Artifact'))){
        const key=card.iid+':'+card.zoneVersion;
        if(!cache.has(key)){const version=card.zoneVersion,def=card.def,n=card.mv;
          cache.set(key,{label:'Exile '+card.name+': create two copies ('+n+')',sorcery:true,c21Osgir:true,
            cost:{mana:'{'+n+'}',tap:true,exileFromGY:{n:1,filter:(g,c)=>c===card&&c.zoneVersion===version}},
            cond:()=>card.zone==='graveyard'&&card.zoneVersion===version,
            run:async ctx=>{await ctx.g.makeTokens(def,ctx.you,{n:2,copyOf:def});},aiScore:()=>6+n/2});
        }
        self.cur.extraAbilities.push(cache.get(key));
      }
    }}]};
  SC['Daretti, Scrap Savant']={abilities:[
    loyalty(2,'Discard up to two, then draw',ctx=>rummage(ctx,2)),
    loyalty(-2,'Sacrifice an artifact to return an artifact',async ctx=>{
      const chosen=await choose(ctx.g,ctx.you,ctx.g.bf().filter(c=>c.ctrl===ctx.you&&c.is('Artifact')&&ctx.g.canSacrifice(c)),1,1,'Daretti: sacrifice an artifact','sacCost');
      if(chosen[0]&&await ctx.g.sacrifice(ctx.you,chosen[0]))await ctx.g.move(ctx.targets[0],'battlefield',{ctrl:ctx.you});
    },{targets:[grave((g,c,p)=>c.owner===p&&c.is('Artifact'))]}),
    loyalty(-10,'Emblem: return fallen artifacts at the next end step',async ctx=>{ctx.you.emblems.push({name:'Daretti, Scrap Savant emblem',triggers:[{
      on:'lto',filter:(g,self,d,player)=>d.card.zone==='graveyard'&&d.card.owner===player&&d.snap.types.includes('Artifact'),run:async next=>{
        const iid=next.data.card.iid,version=next.data.card.zoneVersion;next.g.delayed.push({on:'endStep',once:true,ctrl:next.you,src:next.src,name:'Daretti: return artifact',run:async later=>{const c=later.g.byIid(iid);if(c?.zone==='graveyard'&&c.zoneVersion===version)await later.g.move(c,'battlefield',{ctrl:later.you});}});
      }}]});}),
  ]};
  const construct=artifactToken('Construct',['Construct'],0,0);
  construct.statics=[{apply:(g,c)=>{const n=g.bf().filter(x=>x.ctrl===c.ctrl&&x.is('Artifact')).length;c.cur.power+=n;c.cur.toughness+=n;}}];
  construct.oracle='This token gets +1/+1 for each artifact you control.';
  SC['Digsite Engineer']={triggers:[{on:'cast',filter:(g,c,d)=>own(g,c,d)&&g.castHasType(d.card,d.so?.castOpts||{},'Artifact'),desc:'Pay {2} for a Construct',
    run:async ctx=>{if(await pay(ctx,'{2}'))await ctx.g.makeTokens(construct,ctx.you);}}]};
  SC['Audacious Reshapers']={abilities:[{label:'Sacrifice an artifact: reveal a replacement',cost:{tap:true,sac:(g,c)=>c.is('Artifact')},run:async ctx=>{
    const cards=[];for(const card of ctx.you.library.slice().reverse()){cards.push(card);if(card.is('Artifact'))break;}
    const locked=cards.map(row);await ctx.g.revealToHuman({cards,ctrl:ctx.you,kind:'reveal'});
    const hit=locked.at(-1);if(hit&&hit.card.is('Artifact')&&current(hit))await ctx.g.move(hit.card,'battlefield',{ctrl:ctx.you});
    const rest=locked.filter(current).map(r=>r.card);M.shuffle(rest,ctx.g.rnd);for(const card of rest)await ctx.g.move(card,'library',{toBottom:true});
    await ctx.g.damageAny(ctx.src,ctx.you,cards.length);
  },aiScore:()=>5}]};
  SC['Laelia, the Blade Reforged']={triggers:[{on:'attacks',filter:selfEvent,desc:'Exile the top card; play it this turn',run:async ctx=>grantExile(ctx,await exileTop(ctx,ctx.you,1))},
    {on:'c21CardsExiled',filter:(g,c,d)=>d.entries.some(r=>r.card.owner===c.ctrl&&['library','graveyard'].includes(r.from)),desc:'Put a +1/+1 counter on Laelia',
      run:ctx=>{if(same(ctx))ctx.g.addCounters(ctx.src,'+1/+1',1,false,ctx.you);}}]};
  SC['Ruin Grinder']={cycling:{cost:'{2}',noDraw:true,effect:ctx=>search(ctx,ctx.you,c=>c.hasSub('Mountain'),1)},triggers:[{on:'dies',filter:selfEvent,desc:'Each player may discard their hand and draw seven',run:async ctx=>{
    const players=[];for(const p of ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you))if(!p.lost&&await option(ctx,[{key:'yes',label:'Discard hand and draw seven'},{key:'no',label:'Keep hand'}],'replace your hand',p,'wheel')==='yes')players.push(p);
    for(const p of players)await ctx.g.discard(p,p.hand.slice());for(const p of players)await ctx.g.draw(p,7);
  }}]};
  SC['Triplicate Titan']={triggers:[{on:'dies',filter:selfEvent,desc:'Three Golem artifact tokens',run:async ctx=>{
    await ctx.g.makeTokens(['flying','vigilance','trample'].map(kw=>artifactToken(MTG.c1719TextType(ctx,'Golem'),[MTG.c1719TextType(ctx,'Golem')],3,3,[kw])),ctx.you);
  }}]};
  SC['Duplicant']={triggers:[enterTrigger('Exile a nontoken creature',async ctx=>{
    const target=ctx.targets[0];await ctx.g.move(target,'exile');
    if(same(ctx)&&target.zone==='exile'){(ctx.src.meta.c21Imprint||=[]).push(row(target));ctx.g.recalc();}
  },{opt:true,targets:[T.creature({filter:(g,c)=>c.is('Creature')&&!c.isToken,aiHint:{goal:'exile'}})]})],statics:[{phase:1,apply(g,c){
    const r=(c.meta.c21Imprint||[]).filter(current).filter(r=>r.card.is('Creature')).at(-1);if(!r)return;
    const snapshot=g.snapshot(r.card);c.cur.basePower=snapshot.power;c.cur.baseToughness=snapshot.toughness;c.cur.subtypes=[...new Set([MTG.c1719TextType(g,'Shapeshifter'),...snapshot.subtypes.filter(t=>M.CREATURE_SUBTYPES.has(t))])];
  }}]};
  SC['Scrap Trawler']={triggers:[{on:'lto',desc:'Return an artifact with lesser mana value',filter:(g,c,d)=>d.card.zone==='graveyard'&&d.snap.ctrl===controllerAt(g,c,d)&&d.snap.types.includes('Artifact'),
    targets:(game,self,data)=>[grave((g,c,p)=>c.owner===p&&c.is('Artifact')&&c.mv<data.snap.mv)],
    run:async ctx=>{await ctx.g.move(ctx.targets[0],'hand');}}]};
  SC['Excavation Technique']={demonstrate:true,targets:[T.permanent((g,c)=>!c.is('Land'),{aiHint:{goal:'destroy'}})],resolve:async ctx=>{
    const player=ctx.targets[0].ctrl;await ctx.g.destroy(ctx.targets[0]);await ctx.g.makeTokens('treasure',player,{n:2});
  }};
  SC['Reconstruct History']={targets:['Artifact','Enchantment','Instant','Sorcery','Planeswalker'].map(type=>grave((g,c,p)=>c.owner===p&&c.is(type),{min:0,count:1,upTo:true})),resolve:async ctx=>{
    for(const c of new Set(ctx.targets.flat(Infinity).filter(Boolean)))await ctx.g.move(c,'hand');if(!ctx.so.isCopy&&ctx.src.zone==='stack')await ctx.g.move(ctx.src,'exile');
  }};
  SC['Thousand-Year Elixir']={c21AbilityHaste:true,abilities:[{label:'Untap a creature',cost:{mana:'{1}',tap:true},targets:[T.creature({aiHint:{goal:'untap'}})],run:ctx=>ctx.g.untap(ctx.targets[0]),aiScore:()=>3}]};
})();
