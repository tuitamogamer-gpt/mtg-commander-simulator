'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.LC,G=M.Game.prototype;
 const enchantments=(g,p)=>g.bf().filter(c=>c.ctrl===p&&c.is('Enchantment'));
 const suspended=(g,p)=>p.exile.filter(c=>c.meta.suspended>0);
 const timeCount=c=>c.zone==='exile'&&Object.hasOwn(c.meta,'suspended')?c.meta.suspended:c.counters.time||0;
 const syncTime=c=>{if(c.zone==='exile'&&Object.hasOwn(c.meta,'suspended')&&(!Object.hasOwn(c.counters,'time')||!c.def.c1516SuspendX&&c.counters.time!==c.meta.suspended))c.counters.time=c.meta.suspended;};
 const suspend=async(ctx,c,n)=>{if(c.zone!=='exile')await ctx.g.move(c,'exile');if(c.zone!=='exile')return false;c.meta.suspended=0;C.add(ctx,c,'time',Math.max(0,n));c.meta.suspended=c.counters.time||0;return true;};
 const removeTime=(ctx,c,n=1)=>{syncTime(c);ctx.g.removeCounters(c,'time',n);};
 const timeTravel=async(ctx,times=1)=>{for(let i=0;i<times;i++){
  const cards=[...suspended(ctx.g,ctx.you),...ctx.g.bf().filter(c=>c.ctrl===ctx.you&&c.counters.time>0)],rows=cards.map(C.row);
  const choices=[];
  for(const r of rows){if(!C.current(r))continue;const c=r.card;
   const defaultKey=c.zone==='exile'||c.def.cwwPreferRemoveTime?'remove':'add';
   const options=[{key:defaultKey,label:defaultKey==='add'?'Add a time counter':'Remove a time counter'},{key:defaultKey==='add'?'remove':'add',label:defaultKey==='add'?'Remove a time counter':'Add a time counter'},{key:'skip',label:'Leave unchanged'}];
   const key=await C.option(ctx,options,'Time travel: '+c.name);if(!options.some(o=>o.key===key))throw Error('Invalid time travel choice');choices.push({r,key});
  }
  for(const {r,key}of choices)if(C.current(r)){syncTime(r.card);if(key==='add')C.add(ctx,r.card,'time');else if(key==='remove')removeTime(ctx,r.card);}
 }};
 const vanish=(n,script={})=>{if(!M.applyOracleMechanic(script,{kind:'vanishing',...(n===undefined?{}:{n})}))throw Error('Vanishing unavailable');script.cwwPreferRemoveTime=true;return script;};
 const constellation=(desc,run,extra={})=>C.enterTrigger(desc,run,{filter:(g,c,d)=>d.card.ctrl===c.ctrl&&d.card.is('Enchantment'),...extra});
 const faerie=C.registerToken('cwwFaerie',C.token('Faerie Rogue',['Faerie','Rogue'],1,1,['B'],['flying'],{tokenImageName:'WOC Faerie Rogue'}));
 const alien=C.registerToken('cwwAlien',C.token('Alien',['Alien'],2,2,['W'],[],{tokenImageName:'WHO Alien'}));
 const ox=C.registerToken('cwwOx',C.token('Ox',['Ox'],2,4,['W'],[],{tokenImageName:'WOC Ox'}));
 const annihilator=(n)=>C.attack('Annihilator '+n,async ctx=>{const p=C.defender(ctx.src)||ctx.data.target?.ctrl||ctx.data.target;if(p)await C.sacrifice(ctx,p,()=>true,n);});
 const buffBase=(ctx,c,p,t,keywords=[],extra={})=>ctx.g.addOracleAnimation(c,{types:(c.cur?.types||c.def.types).slice(),subtypes:(c.cur?.subtypes||c.def.subtypes).slice(),colors:c.colors.slice(),retainTypes:true,power:p,toughness:t,temporary:true,keywords,...extra});
 const phaseLinked=(ctx,cards,{tapped=false}={})=>{
  if(!C.same(ctx)||tapped&&!ctx.src.tapped)return [];
  const all=ctx.g.phaseOutMany(cards);for(const c of all)c.meta.cwwPhaseLink={iid:ctx.src.iid,version:ctx.src.zoneVersion,tapped};return all;
 };
 const phaseCandidates=G.phaseInCandidates;G.phaseInCandidates=function(p){return phaseCandidates.call(this,p).filter(c=>!c.meta.cwwPhaseLink);};
 const returnPhased=g=>{const rows=g.battlefield.filter(c=>c.phasedOut&&c.meta.cwwPhaseLink).filter(c=>{const r=c.meta.cwwPhaseLink,s=g.byIid(r.iid);return !s||s.zone!=='battlefield'||s.zoneVersion!==r.version||r.tapped&&!s.tapped;});for(const c of rows)delete c.meta.cwwPhaseLink;if(rows.length)g.phaseInFor(rows[0].ctrl,{returning:rows});};
 const move=G.move;G.move=async function(c,to,o={}){const from=c.zone,v=c.zoneVersion;const result=await move.call(this,c,to,o);if(c.zone!==from||c.zoneVersion!==v){if(c.zone==='graveyard'&&from==='battlefield')c.meta.cwwGraveTurn=this.turnNo;returnPhased(this);}return result;};
 const untap=G.untap;G.untap=function(c,...a){const r=untap.call(this,c,...a);returnPhased(this);return r;};
 const emit=G.emit;G.emit=function(name,data){
  if(name==='cast'){data.cwwFirstOpponentSpell=this.turnPlayer!==data.player&&data.player.turnState.spellsCast===1;}
  if(['countersPlaced','countersRemoved'].includes(name)&&data.kind==='time'&&data.card.zone==='exile'&&Object.hasOwn(data.card.meta,'suspended')&&!data.card.def.c1516SuspendX){data.card.meta.suspended=data.after;if(name==='countersRemoved'&&data.before>0&&data.after===0)this.queueSuspendCast(data.card,data.card.owner);}
  return emit.call(this,name,data);
 };
 const legalTargets=G.legalTargets;G.legalTargets=function(spec,src,p,opts){if(spec.cwwTimeTarget)return [...legalTargets.call(this,{...spec,cwwTimeTarget:false,zone:'battlefield'},src,p,opts),...this.players.flatMap(p=>p.exile).filter(c=>c.meta.suspended>0)];return legalTargets.call(this,spec,src,p,opts);};
 M.CWW={...C,enchantments,suspended,timeCount,syncTime,suspend,removeTime,timeTravel,vanish,constellation,faerie,alien,ox,annihilator,buffBase,phaseLinked,returnPhased};
})();
