// Shared, object-bound rules for the original Commander 2015/2016 lists.
'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
  const M=MTG,G=M.Game.prototype,C=M.C14,E=M.E;
  const own=(g,c,d)=>d.player===c.ctrl;
  const sourceState=ctx=>C.same(ctx)?ctx.src:ctx.src.battlefieldLKI?.get(ctx.sourceZoneVersion);
  async function searchUnshuffled(ctx,p,filter,n,to='hand'){const cards=await C.choose(ctx.g,p,p.library.filter(filter),0,n,ctx.src.name+': search your library','searchLand');await ctx.g.revealToHuman({cards,ctrl:p,kind:'reveal'});await enterManyOrMove(ctx,cards,p,to);return cards;}
  async function enterManyOrMove(ctx,cards,p,to){if(to==='battlefield')return enterMany(ctx,cards,p);for(const c of cards)await ctx.g.move(c,to);}
  const hit=(g,c,d)=>d.src===c&&d.combat;
  const exp=p=>p.counters.experience||0;
  // Meren's existing native implementation uses this historical property.
  // Keep it as an alias so proliferate and persistence see the same counters.
  Object.defineProperty(M.Player.prototype,'experienceCounters',{configurable:true,get(){return this.counters.experience||0;},set(n){this.counters.experience=n;}});
  const experience=ctx=>{ctx.you.counters.experience=exp(ctx.you)+1;ctx.g.recalc();ctx.g.note('counter',{p:ctx.you,kind:'experience'});};
  const counters=(ctx,c,n)=>{if(c&&n>0)ctx.g.addCounters(c,'+1/+1',n,false,ctx.you);};
  const life=async(g,p,n)=>{if(n>p.life)await g.gainLife(p,n-p.life);else if(n<p.life)await g.loseLife(p,p.life-n,'life total change');};
  async function enterMany(ctx,cards,ctrl=ctx.you,opts={}){await ctx.g.withBattlefieldEntryBatch(async()=>{for(const c of cards.filter(Boolean)){const p=ctrl||c.owner;await ctx.g.putPermanentOntoBattlefield(c,p,opts);}});}
  async function shuffleSelf(ctx){if(ctx.src.zone==='stack'&&!ctx.src.isToken){await ctx.g.move(ctx.src,'library');M.shuffle(ctx.src.owner.library,ctx.g.rnd);}}
  async function basicCycle(ctx){return C.search(ctx,ctx.you,c=>c.is('Land')&&c.def.super.includes('Basic'),1);}
  const cycling={cost:'{2}',noDraw:true,effect:basicCycle};
  const undaunted=(g,c,p)=>-p.opponents(g).length;
  const draw=(ctx,p,n)=>ctx.g.draw(p,n,ctx.src);
  const host=(g,c)=>g.byIid(c.attachedTo);
  const target=(fn,extra={})=>M.T.permanent(fn,extra);
  const oppTargets=(g,c,opts,p=c.ctrl)=>p.opponents(g).map(o=>target((g,x)=>x.ctrl===o,{prompt:'Permanent controlled by '+o.name}));
  const gyCreatures=g=>g.players.flatMap(p=>p.graveyard).filter(c=>c.is('Creature'));
  const revealLand=type=>async(g,c)=>{const [chosen]=await C.choose(g,c.ctrl,c.ctrl.hand.filter(x=>x.hasSub(type)),0,1,c.name+': reveal a '+type+' to enter untapped');if(chosen)await g.revealToHuman({cards:[chosen],ctrl:c.ctrl,kind:'reveal'});return !chosen;};
  const manaExplorer={cost:{tap:true},produce:(g,c,p)=>[...new Set(p.opponents(g).flatMap(o=>M.C21Rules.landManaTypes(g,o)))].filter(color=>color!=='C').map(color=>({[color]:1}))};
  async function wheel(ctx){const players=ctx.g.apnapFrom(ctx.you),hands=players.map(p=>({p,cards:p.hand.slice()}));let max=0;for(const r of hands){const before=r.p.turnState.discardedN||0;await ctx.g.discard(r.p,r.cards);max=Math.max(max,(r.p.turnState.discardedN||0)-before);}for(const p of players)await draw(ctx,p,max);}
  const modal=(list,pick=1)=>C.modalSpell({pick,repeats:pick>1,list});
  const addCombat=ctx=>ctx.g.scheduleAdditionalCombat();
  const landLimit=G.landPlayLimit;
  G.landPlayLimit=function(p){return landLimit.call(this,p)+this.bf().filter(c=>C.live(c)&&c.def.c1516ExtraLand).length;};
  const manaSources=G.manaSources;
  G.manaSources=function(p,spell,...args){const sources=manaSources.call(this,p,spell,...args);
    if(spell?.card&&!spell.isAbility&&this.castHasType(spell.card,spell.castOpts||{},'Artifact')&&this.bf().some(c=>C.live(c)&&c.ctrl===p&&c.def.c1516Convoke)){
      for(const c of this.creatures(p))if(!c.tapped&&!sources.some(s=>s.card===c&&s.m?.viaConvoke))sources.push({card:c,m:{cost:{tap:true},viaConvoke:true},produce:[{C:1},...c.colors.map(color=>({[color]:1}))],extraCost:{tap:true}});
    }return sources;
  };
  const activatable=G.activatableList,activate=G.activateAbility;
  G.activatableList=function(p,...args){return activatable.call(this,p,...args).filter(e=>!e.card.cur?.c1516NoNonMana||e.turnFaceUp);};
  G.activateAbility=function(p,e,...args){if(e.card.cur?.c1516NoNonMana&&!e.turnFaceUp)return Promise.resolve(false);return activate.call(this,p,e,...args);};
  const attackTax=G.c21AttackTax;
  G.c21AttackTax=function(c,t){const p=t instanceof M.Player?t:t?.ctrl;return attackTax.call(this,c,t)+(p?this.bf().filter(x=>C.live(x)&&x.ctrl===p&&x.def.c1516Safety).length*this.bf().filter(x=>x.ctrl===p&&x.is('Enchantment')).length:0);};
  const collect=G.collectTriggers;
  G.collectTriggers=function(name,data){if((['etb','landfall'].includes(name)||data.enters===true)&&data.card?.is('Creature')&&this.bf().some(c=>C.live(c)&&c.def.c1516Gryff))return [];return collect.call(this,name,data);};
  const emit=G.emit;
  G.emit=function(name,data){if(name==='attacks'){const p=data.player||data.card?.ctrl;if(p)p.turnState.c1516Attacked=(p.turnState.c1516Attacked||0)+1;}const result=emit.call(this,name,data);if(['countersPlaced','countersRemoved'].includes(name)&&data.kind==='time'&&data.card.zone==='exile'&&data.card.def.c1516SuspendX&&Object.hasOwn(data.card.meta,'suspended')){data.card.meta.suspended=data.card.counters.time||0;if(name==='countersRemoved'&&data.before>0&&data.after===0)this.queueSuspendCast(data.card,data.card.owner);}return result;};
  const activateMana=G.activateManaSource;
  G.activateManaSource=async function(p,s,...args){const ok=await activateMana.call(this,p,s,...args);if(ok&&s.m?.c1516TapTrigger&&!s.card.is('Land'))await this.emit('tappedForMana',{card:s.card,player:p});return ok;};
  async function revealCreatures(ctx,p,n,rest='graveyard'){
    const cards=[];let hits=0;for(const c of p.library.slice().reverse()){if(hits>=n)break;cards.push(c);if(c.is('Creature'))hits++;}
    const locked=cards.map(C.row);await ctx.g.revealToHuman({cards,ctrl:p,kind:'reveal'});
    await enterMany(ctx,locked.filter(r=>C.current(r)&&r.card.is('Creature')).map(r=>r.card),p);
    const remainder=locked.filter(C.current).map(r=>r.card);if(rest==='graveyard')await ctx.g.withGraveyardEntryBatch(async()=>{for(const c of remainder)await ctx.g.move(c,'graveyard');});else M.shuffle(p.library,ctx.g.rnd);
  }
  async function piles(ctx,opponentSplits){
    const cards=ctx.you.library.slice(-5).reverse(),locked=cards.map(C.row);await ctx.g.revealToHuman({cards,ctrl:ctx.you,kind:'reveal'});if(!cards.length)return;
    const p=await C.choosePlayer(ctx,ctx.you.opponents(ctx.g),'choose an opponent');if(!p)return;
    const one=await C.choose(ctx.g,opponentSplits?p:ctx.you,cards,0,cards.length,ctx.src.name+': choose the first pile','splitPile'),two=cards.filter(c=>!one.includes(c));
    const key=await C.option(ctx,[{key:'one',label:'Pile 1: '+(one.map(c=>c.name).join(', ')||'(empty)')},{key:'two',label:'Pile 2: '+(two.map(c=>c.name).join(', ')||'(empty)')}],'choose a pile',opponentSplits?ctx.you:p);
    if(!['one','two'].includes(key))throw Error('Invalid pile');const hand=key==='one'?one:two;
    await ctx.g.withGraveyardEntryBatch(async()=>{for(const r of locked)if(C.current(r))await ctx.g.move(r.card,hand.includes(r.card)?'hand':'graveyard');});
  }
  async function joinForces(ctx,run){let total=0;for(const p of ctx.g.apnapFrom(ctx.you)){
    const max=ctx.g.maxAffordableX(p,M.parseCost('{X}'),ctx.src),n=await p.controller.decide(ctx.g,{type:'chooseX',min:0,max,prompt:ctx.src.name+': contribute mana',aiHint:{kind:'chooseX',card:ctx.src}});
    if(!Number.isInteger(n)||n<0||n>max)throw Error('Invalid join forces payment');if(n&&await ctx.g.payMana(p,M.parseCost('{'+n+'}'),{card:ctx.src,isAbility:true}))total+=n;
  }for(const p of ctx.g.apnapFrom(ctx.you))await run(p,total);}
  const uiControllers=new WeakMap();
  G.c1516Decide=async function(p,q,raw){
    const controlled=this.c1516ActiveControl?.subject===p.idx?this.players[this.c1516ActiveControl.controller]:null;
    const blockEffect=q.type==='blockers'?this.untilEffects.filter(e=>e.kind==='c1516ChooseBlocks'&&e.who!==p&&!e.who.lost).at(-1):null;
    const actor=blockEffect?.who||controlled,delegate=actor&&!actor.lost?actor._controller:raw;
    const ui=uiControllers.get(delegate)||uiControllers.get(actor||p),previous=ui?.me;
    if(ui&&ui.me!==p){ui.me=p;ui.render();}
    try{
      const pilot=delegate!==raw&&delegate instanceof M.AIController?Object.assign(Object.create(delegate),{p}):delegate;
      return await pilot.decide(this,actor?{...q,player:p,c1516ControlledBy:actor.idx}:q);
    }finally{if(ui&&ui.me!==previous){ui.me=previous;ui.render();}}
  };
  const runTurn=G.runTurn;
  G.runTurn=async function(){const p=this.turnPlayer,grants=(this.c1516TurnControls||[]).filter(r=>r.subject===p.idx),latest=grants.filter(r=>!this.players[r.controller].lost).at(-1),prior=this.c1516ActiveControl;
    this.c1516TurnControls=(this.c1516TurnControls||[]).filter(r=>r.subject!==p.idx);this.c1516ActiveControl=latest||null;
    const actor=latest?this.players[latest.controller]:null,ui=actor?(uiControllers.get(actor._controller)||uiControllers.get(actor)):null,previous=ui?.me;if(ui){ui.me=p;ui.render();}
    try{return await runTurn.call(this);}finally{this.c1516ActiveControl=prior||null;if(ui){ui.me=previous;ui.render();}}
  };
  const resolveTop=G.resolveTop;
  G.resolveTop=async function(){const previous=this.c1516Resolving;this.c1516Resolving=this.stack.at(-1);try{return await resolveTop.call(this);}finally{this.c1516Resolving=previous;}};
  const losses=G.playerLoses;
  G.playerLoses=async function(p,why){if(!p.lost&&(!this.canLoseGame||this.canLoseGame(p)||/conced|quit/i.test(why||'')))await this.emit('c1516PlayerLoses',{player:p});return losses.call(this,p,why);};
  const destroyed=async(g,rows,source,controller,justice)=>{
    if(!source||!controller)return;
    for(const r of rows)if(r.card.zoneVersion!==r.version&&!r.snap.types.includes('Creature')&&r.snap.ctrl!==controller){
      r.snap.ctrl.turnState.c1516DestroyedByOpponent=true;
      for(const j of justice)if(j.snap.ctrl===r.snap.ctrl)g.queueTrigger({src:j.card,ctrl:j.snap.ctrl,sourceZoneVersion:j.version,sourceMeta:j.snap.sourceMeta,name:'Karmic Justice: destroy a permanent',opt:true,targets:[target((g,c)=>c.ctrl===controller,{aiHint:{goal:'destroy'}})],run:ctx=>ctx.targets[0]&&ctx.g.destroy(ctx.targets[0],{source:j.card})});
    }
  };
  for(const key of ['destroy','destroyMany']){const original=G[key];G[key]=async function(input,opts={}){
    const cards=(key==='destroy'?[input]:input).filter(c=>c?.zone==='battlefield'),rows=cards.map(card=>({card,version:card.zoneVersion,snap:this.snapshot(card)})),justice=this.bf().filter(c=>C.live(c)&&c.def.c1516Justice).map(card=>({card,version:card.zoneVersion,snap:this.snapshot(card)}));
    const source=opts.source||this.c1516Resolving?.card||this.c1516Resolving?.src||this.c1516Resolving?.srcCard,controller=this.c1516Resolving?.ctrl||source?.ctrl;
    const value=await original.call(this,input,opts);await destroyed(this,rows,source,controller,justice);return value;
  };}
  const entryCounters=M.C21Rules.entryCounters;
  M.C21Rules.entryCounters=function(g,c){return entryCounters(g,c)+(c.is('Creature')?(g._battlefieldEntryReplacementSnapshot||g.bf()).filter(s=>s!==c&&C.live(s)&&s.ctrl===c.ctrl&&s.def.c1516Bloodspore).reduce((n,s)=>n+(s.counters['+1/+1']||0),0):0);};
  const move=G.move;
  G.move=function(c,to,opts={}){if(to==='graveyard'&&c.zone!=='graveyard'&&c.owner.c1516MagusTurn===this.turnNo)to='exile';
    if(c.zone==='battlefield'&&to!=='battlefield'&&to!=='exile'&&this.untilEffects.some(e=>e.kind==='c1516Unearth'&&e.card===c&&e.version===c.zoneVersion))to='exile';
    return move.call(this,c,to,opts);
  };
  const playableLands=G.playableLands;
  G.playableLands=function(p){const cards=playableLands.call(this,p);if(p.c1516MagusTurn===this.turnNo&&p.landsPlayed<this.landPlayLimit(p))for(const c of p.graveyard)if(c.is('Land')&&!cards.includes(c))cards.push(c);return cards;};
  function detach(g,c){const h=g.byIid(c.attachedTo);if(h)h.attachments=h.attachments.filter(i=>i!==c.iid);c.attachedTo=null;g.recalc();}
  function snapshotBlockers(g){
    const blockers=[];
    if(g.c1516ActiveControl||(g.c1516TurnControls||[]).length)blockers.push('a controlled player turn');
    if(g.players.some(p=>p.c1516MagusTurn===g.turnNo))blockers.push('Magus of the Will permission');
    if(g.bf().some(c=>c.meta.c1516Servant||(c.meta.c1516Dragons||[]).length||(c.meta.c1516Artisans||[]).length))blockers.push('linked C15/C16 objects');
    if((g.oracleExileDurations||[]).some(r=>r.source.name==='Grasp of Fate'&&r.source.zone==='battlefield'&&r.source.zoneVersion===r.sourceZoneVersion))blockers.push('Grasp of Fate exile duration');
    if(g.bf().some(c=>c.isToken&&c.isCopyOf&&(c.def.types||[]).join(',')!==(M.DEFS[c.name]?.types||c.def.types||[]).join(',')))blockers.push('a token copy with added card types');
    return blockers;
  }
  M.C1516={...C,snapshotBlockers,sourceState,searchUnshuffled,own,hit,exp,experience,counters,life,enterMany,shuffleSelf,cycling,undaunted,draw,host,target,oppTargets,gyCreatures,revealLand,manaExplorer,wheel,modal,addCombat,revealCreatures,piles,joinForces,uiControllers,detach};
})();
