'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,G=M.Game.prototype,C=M.AFC,E=M.E,T=M.T;
 const room=(name,next,run,targets=[])=>({name,next,run,targets});
 const scry=n=>ctx=>E.scry(ctx.g,ctx.you,n),token=(name,types,p,t,colors,n=1)=>ctx=>ctx.g.makeTokens({...C.token(name,types,p,t,colors),tokenImageName:'AFC '+name},ctx.you,{n});
 const treasure=ctx=>ctx.g.makeTokens(M.TOKENS.treasure,ctx.you);
 const debuff=(ctx,card,power,cantAttack=false)=>{const row=C.row(card);ctx.g.untilEffects.push({kind:'afcDungeonEffect',expires:'untilTurnOf',whoTurn:ctx.you,row:C.row(card),apply:(g,bf)=>{if(C.current(row)&&bf.includes(card)){card.cur.power+=power;if(cantAttack)card.cur.cantAttack=true;}}});ctx.g.recalc();};
 const dungeons={
  mine:{name:'Lost Mine of Phandelver',start:'entrance',rooms:{
   entrance:room('Cave Entrance',['goblin','tunnels'],scry(1)),
   goblin:room('Goblin Lair',['storeroom','pool'],token('Goblin',['Goblin'],1,1,['R'])),
   tunnels:room('Mine Tunnels',['pool','fungi'],treasure),
   storeroom:room('Storeroom',['temple'],ctx=>ctx.targets[0]&&ctx.g.addCounters(ctx.targets[0],'+1/+1',1),[T.creature()]),
   pool:room('Dark Pool',['temple'],async ctx=>{for(const p of ctx.you.opponents(ctx.g))await ctx.g.loseLife(p,1,'Dark Pool');await ctx.g.gainLife(ctx.you,1);}),
   fungi:room('Fungi Cavern',['temple'],ctx=>ctx.targets[0]&&debuff(ctx,ctx.targets[0],-4),[T.creature()]),
   temple:room('Temple of Dumathoin',[],ctx=>ctx.g.draw(ctx.you,1,ctx.src))
  }},
  mage:{name:'Dungeon of the Mad Mage',start:'portal',rooms:{
   portal:room('Yawning Portal',['level'],ctx=>ctx.g.gainLife(ctx.you,1)),
   level:room('Dungeon Level',['bazaar','twisted'],scry(1)),
   bazaar:room('Goblin Bazaar',['lost'],treasure),
   twisted:room('Twisted Caverns',['lost'],ctx=>ctx.targets[0]&&debuff(ctx,ctx.targets[0],0,true),[T.creature()]),
   lost:room('Lost Level',['runestone','graveyard'],scry(2)),
   runestone:room('Runestone Caverns',['mines'],async ctx=>{for(const c of ctx.you.library.slice(-2).reverse()){await ctx.g.move(c,'exile');if(c.zone==='exile')C.playGrant(ctx,c);}}),
   graveyard:room("Muiral's Graveyard",['mines'],token('Skeleton',['Skeleton'],1,1,['B'],2)),
   mines:room('Deep Mines',['lair'],scry(3)),
   lair:room("Mad Wizard's Lair",[],async ctx=>{const before=new Set(ctx.you.hand);await ctx.g.draw(ctx.you,3,ctx.src);const cards=ctx.you.hand.filter(c=>!before.has(c));await ctx.g.revealToHuman({cards,ctrl:ctx.you,kind:'reveal'});await C.immediate(ctx,cards);})
  }},
  tomb:{name:'Tomb of Annihilation',start:'entry',rooms:{
   entry:room('Trapped Entry',['veils','oubliette'],async ctx=>{for(const p of ctx.g.apnapFrom(ctx.you))await ctx.g.loseLife(p,1,'Trapped Entry');}),
   veils:room('Veils of Fear',['sandfall'],async ctx=>{for(const p of ctx.g.apnapFrom(ctx.you)){const cards=await C.choose(ctx.g,p,p.hand,0,1,'Veils of Fear: discard a card or lose 2 life','discard');if(cards.length)await ctx.g.discard(p,cards);else await ctx.g.loseLife(p,2,'Veils of Fear');}}),
   sandfall:room('Sandfall Cell',['cradle'],async ctx=>{for(const p of ctx.g.apnapFrom(ctx.you)){const rows=await C.sacrifice(ctx,p,c=>c.is('Creature')||c.is('Artifact')||c.is('Land'),1,true);if(!rows.length)await ctx.g.loseLife(p,2,'Sandfall Cell');}}),
   oubliette:room('Oubliette',['cradle'],async ctx=>{const cards=await C.choose(ctx.g,ctx.you,ctx.you.hand,Math.min(1,ctx.you.hand.length),1,'Oubliette: discard a card','discard');await ctx.g.discard(ctx.you,cards);const selected=[];for(const type of ['Creature','Artifact','Land']){const pool=ctx.g.bf().filter(c=>c.ctrl===ctx.you&&c.is(type)&&ctx.g.canSacrifice(c)&&!selected.includes(c));selected.push(...await C.choose(ctx.g,ctx.you,pool,Math.min(1,pool.length),1,'Oubliette: sacrifice a '+type,'sacCost'));}await C.sacrificeAll(ctx,selected);}),
   cradle:room('Cradle of the Death God',[],ctx=>ctx.g.makeTokens({...C.token('The Atropal',['God','Horror'],4,4,['B'],['deathtouch']),super:['Legendary'],tokenImageName:'The Atropal'},ctx.you))
  }}
 };
 G.completeAFCDungeon=async function(p){const d=p.afcDungeon;if(!d)return;p.afcDungeon=null;p.afcCompletedDungeons=(p.afcCompletedDungeons||0)+1;this.lg(p.name+' completes '+dungeons[d.key].name+'.','info');await this.emit('dungeonCompleted',{player:p,key:d.key,id:d.id});};
 G.venture=async function(p,source=null){
  let state=p.afcDungeon;
  if(state&&!dungeons[state.key].rooms[state.room].next.length){await this.completeAFCDungeon(p);state=null;}
  let roomKey;
  if(!state){const key=await C.option({g:this,src:source||{name:'Venture into the dungeon'},you:p},Object.entries(dungeons).map(([key,d])=>({key,label:d.name})),'choose a dungeon');state=p.afcDungeon={id:(p.afcDungeonSerial=(p.afcDungeonSerial||0)+1),key,room:dungeons[key].start};roomKey=state.room;}
  else{const next=dungeons[state.key].rooms[state.room].next;roomKey=next.length===1?next[0]:await C.option({g:this,src:source||{name:'Venture into the dungeon'},you:p},next.map(key=>({key,label:dungeons[state.key].rooms[key].name})),'choose the next room');state.room=roomKey;}
  const dungeon=dungeons[state.key],r=dungeon.rooms[roomKey],n=1+this.bf().filter(c=>C.live(c)&&c.ctrl===p&&c.def.afcHama).length;
  this.lg(p.name+' enters '+dungeon.name+' — '+r.name+'.','info');this.note('dungeon',{player:p,dungeon:dungeon.name,room:r.name});
  for(let i=0;i<n;i++)this.queueTrigger({src:null,ctrl:p,name:dungeon.name+' — '+r.name,data:{afcDungeonId:state.id,afcDungeonPlayer:p.idx},targets:r.targets,run:ctx=>r.run({...ctx,src:{name:dungeon.name,ctrl:p}})});
 };
 const sba=G.checkSBA;G.checkSBA=async function(...args){const result=await sba.apply(this,args);if(!this._stackResolutionDepth)for(const p of this.players){const d=p.afcDungeon;if(!d||dungeons[d.key].rooms[d.room].next.length)continue;const active=[...this.pendingTriggers,...this.stack].some(s=>{const data=s.data||s.ctx?.data;return data?.afcDungeonId===d.id&&data.afcDungeonPlayer===p.idx;});if(!active)await this.completeAFCDungeon(p);}return result;};
 C.dungeons=dungeons;
})();
