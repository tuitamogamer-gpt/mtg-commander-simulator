'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.POM,G=M.Game.prototype,T=M.T;
 for(const s of Object.values(M.SCRIPTS))if(s.miracle)s.oracleMiracle=true;
 const types=cs=>[...new Set(cs.flatMap(c=>c.zone==='battlefield'&&c.cur?c.cur.types:c.def.types))];
 const ownPermanents=(g,p)=>g.bf().filter(c=>c.ctrl===p);
 const winAt=(on,desc,condition)=>C.trigger(on,desc,ctx=>condition(ctx.g,ctx.src,ctx.data)&&C.win(ctx),{filter:(g,c,d)=>d.player===c.ctrl&&condition(g,c,d)});
 const dread=ctx=>ctx.g.manifestDread(ctx.you);
 const counterKinds=c=>Object.keys(c.counters).filter(k=>c.counters[k]>0);
 const moveCounter=async(ctx,from,to)=>{if(!from||!to||from===to)return;const kinds=counterKinds(from);if(!kinds.length)return;const key=await C.option(ctx,kinds.map(key=>({key,label:key+' counter'})),'Choose a counter to move');if(!kinds.includes(key))throw Error('Invalid counter kind');const before=from.counters[key];ctx.g.removeCounters(from,key,1);const n=before-(from.counters[key]||0);if(n)C.add(ctx,to,key,n);};
 const exileInstead=(g,c)=>{c.meta.unearth=true;};
 const token=(name,...args)=>{const key=name==='Bird'&&args[3]?.includes('U')?'Bird Blue':name;return {...C.token(name,...args),...(['Zombie','Zombie Warrior','Elemental','Moogle','Bird','Bird Blue','Demon','Glimmer','Nalaar Aetherjet','The Blackjack','Treefolk','Ox','Wurm','Fish','Shark','Octopus','Shapeshifter','Samurai','Horror'].includes(key)?{tokenImageName:'BDF '+key}:{})};};
 const zombie=C.registerToken('bdfZombie',token('Zombie',['Zombie'],1,1,['W']));
 const moogle=C.registerToken('bdfMoogle',token('Moogle',['Moogle'],1,2,['W'],['lifelink']));
 const demon=C.registerToken('bdfDemon',token('Demon',['Demon'],5,5,['B'],['flying']));
 const bird=C.registerToken('bdfBird',token('Bird',['Bird'],2,2,['B'],['flying']));
 const glimmer=C.registerToken('bdfGlimmer',token('Glimmer',['Glimmer'],1,1,['W'],[],{types:['Enchantment','Creature']}));
 const support=(n,other=false)=>({targets:(g,c)=>[T.creature({count:typeof n==='function'?n(g,c):n,min:0,upTo:true,filter:(g,x,p,s)=>!other||x!==s})],run:ctx=>{for(const c of C.flat(ctx.targets))C.add(ctx,c,'+1/+1');}});
 const emit=G.emit;G.emit=function(on,d){
  if(on==='countersPlaced'&&d.n>0&&d.card){d.card.meta.bdfCounterTurn=this.turnNo;const p=d.by||d.player;if(d.card.is('Creature')&&p?.turnState)p.turnState.bdfCreatureCounter=true;}
  if(on==='cardsLeftGraveyard')for(const c of d.cards||[])c.owner.turnState.bdfGraveLeft=true;
  if(on==='damageToPlayer'&&d.combat&&d.src?.hasSub('Zombie'))for(const p of this.players)p.turnState.bdfZombieHit=true;
  return emit.call(this,on,d);
 };
 const move=G.move;G.move=async function(c,to,opts={}){const from=c.zone,version=c.zoneVersion,p=c.owner;const r=await move.call(this,c,to,opts);if(c.zoneVersion!==version){if(c.zone==='graveyard'){c.meta.bdfGraveFrom=from;c.meta.bdfGraveTurn=this.turnNo;}if(from==='graveyard')p.turnState.bdfGraveLeft=true;}return r;};
 M.BDF={...C,token,types,ownPermanents,winAt,dread,counterKinds,moveCounter,exileInstead,zombie,moogle,demon,bird,glimmer,support};
})();
