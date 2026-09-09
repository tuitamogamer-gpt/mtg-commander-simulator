// Shared rules for the ten original C17-C19 lists; intake stays fail-closed.
'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,G=M.Game.prototype,C=M.C1516;
 const eminent=c=>c.zone==='command'||C.live(c);
 const ctxFor=(g,c,p=c.ctrl)=>({g,src:c,you:p});
 const grant=(ctx,c,keywords,expires='object',extra={})=>{ctx.g.untilEffects.push({kind:'oracleGrantedOperation',expires,iid:c.iid,zoneVersion:c.zoneVersion,timestamp:ctx.g.nextOracleTimestamp(),field:'extraAbilities',grants:[],keywords,...extra});ctx.g.recalc();};
 function delayed(ctx,c,to='exile',options={}){const r=C.row(c);ctx.g.delayed.push({on:options.on||'endStep',once:true,src:ctx.src,ctrl:ctx.you,name:ctx.src.name+': '+(to==='sacrifice'?'sacrifice':to==='hand'?'return':'exile')+' '+c.name,...(options.filter?{filter:options.filter}:{}),run:async next=>{if(!C.current(r)||c.zone!=='battlefield')return;if(to==='sacrifice')await next.g.sacrifice(c.ctrl,c);else await next.g.move(c,to);}});}
 async function copy(ctx,original,options={}){const def=options.definition||M.OracleV8Faces.copyTokenDefinition(original);const made=await ctx.g.makeTokens(def,ctx.you,{copyOf:def,n:options.n??1,tapped:options.tapped,attacking:options.attacking,chooseAttacking:options.chooseAttacking});for(const c of made){if(options.haste)grant(ctx,c,['haste']);if(options.delayed)delayed(ctx,c,options.delayed,options.delayOptions);}return made;}
 async function populate(ctx,attacking=false){const [c]=await C.choose(ctx.g,ctx.you,ctx.g.creatures(ctx.you).filter(c=>c.isToken),1,1,ctx.src.name+': choose a creature token to populate');if(!c)return [];return copy(ctx,c,{tapped:attacking,chooseAttacking:attacking?(g,token)=>g.chooseAttackingDestination(ctx.you,null,token,ctx.src.name):undefined});}
 async function bottom(ctx,cards,p=ctx.you){if(!cards.length)return;const order=cards.length>1?await p.controller.decide(ctx.g,{type:'scry',cards,player:p,prompt:ctx.src.name+': order these cards on the bottom'}):{top:cards,bottom:[]};const ordered=[...(order?.top||[]),...(order?.bottom||[])];if(ordered.length!==cards.length||new Set(ordered).size!==cards.length||ordered.some(c=>!cards.includes(c)))throw Error('Invalid library order');for(const c of ordered)await ctx.g.move(c,'library',{toBottom:true});}
 async function search(ctx,p,filter,n,to='hand',tapped=false){let cards=[];if(!ctx.g.canSearchLibrary||ctx.g.canSearchLibrary(p)){const from=(ctx.g.searchableLibrary?ctx.g.searchableLibrary(p):p.library).filter(filter);cards=from.length?await p.controller.decide(ctx.g,{type:'chooseCards',from,min:0,max:Math.min(n,from.length),search:true,player:p,prompt:ctx.src.name+': search your library',aiHint:{kind:'searchLand'}}):[];if(!Array.isArray(cards)||new Set(cards).size!==cards.length||cards.length>n||cards.some(c=>!from.includes(c)))throw Error('Invalid library search');}if(cards.length)await ctx.g.revealToHuman({cards,ctrl:p,kind:'reveal'});if(typeof to==='function')await to(cards);else await ctx.g.withBattlefieldEntryBatch(async()=>{for(const c of cards)if(to==='battlefield')await ctx.g.putPermanentOntoBattlefield(c,p,{tapped});else await ctx.g.move(c,to);});M.shuffle(p.library,ctx.g.rnd);return cards;}
 const permanent=(g,c)=>['Creature','Artifact','Enchantment','Planeswalker','Land','Battle'].some(t=>c.is(t));
 const snapshotCopy=(c,version=c.zoneVersion)=>c.zone==='battlefield'&&c.zoneVersion===version?M.OracleV8Faces.copyTokenDefinition(c):c.battlefieldLKI?.get(version)?.def||c.def;
 const eminence=t=>[{...t,filter:(g,c,d)=>eminent(c)&&(!t.filter||t.filter(g,c,d)),run:ctx=>eminent(ctx.src)&&ctx.src.zoneVersion===ctx.sourceZoneVersion&&t.run(ctx)},{...t,zone:'command',filter:(g,c,d)=>eminent(c)&&(!t.filter||t.filter(g,c,d)),run:ctx=>eminent(ctx.src)&&ctx.src.zoneVersion===ctx.sourceZoneVersion&&t.run(ctx)}];
 const spellCost=G.spellCost;
 G.spellCost=function(p,c,opts={}){const cost=spellCost.call(this,p,c,opts);let reduction=0;const def=this.castDefinition(c,opts);
  for(const source of p.command)if(source!==c&&source.def.c1719UrDragon&&(def.changeling||(def.subtypes||[]).includes('Dragon')))reduction++;
  if(p.turnState.c1719AffinityNext)reduction+=p.turnState.c1719AffinityNext*this.bf().filter(x=>x.ctrl===p&&x.is('Artifact')).length;
  const remaining=cost.generic-reduction;return {...cost,generic:Math.max(0,remaining),xReduction:(cost.xReduction||0)+Math.max(0,-remaining)};
 };
 const emit=G.emit;
 G.emit=function(name,data){if(name==='cast'&&data.player?.turnState.c1719AffinityNext)delete data.player.turnState.c1719AffinityNext;return emit.call(this,name,data);};
 const legalTargets=G.legalTargets;
 G.legalTargets=function(...args){const choices=legalTargets.apply(this,args);return this.bf().some(c=>C.live(c)&&c.def.c1719GroundSeal)?choices.filter(c=>c.zone!=='graveyard'):choices;};
 const targetTax=G.starterTargetTax;
 G.starterTargetTax=function(p,c,opts={}){const previous=targetTax.call(this,p,c,opts),sources=this.bf().filter(x=>C.live(x)&&(x.def.c1719SiegeTax&&x.meta.c1719Siege==='dragons'&&x.ctrl!==p||x.def.c1719Elderwood));if(!sources.length)return previous;
  const tax=ts=>sources.reduce((n,s)=>n+(s.def.c1719Elderwood?(ts.includes(s)?s.ctrl===p?-2:2:0):ts.some(t=>t===s.ctrl||t?.zone==='battlefield'&&t.ctrl===s.ctrl)?2:0),0);
  if(opts.targets!==undefined)return previous+tax(opts.targets.flat(Infinity));const pool=(this.spellTargetSpecs(c,opts,p)||[]).flatMap(s=>this.legalTargets(s,c,p));return previous+(pool.length?Math.min(...pool.map(t=>tax([t]))):0);
 };
 M.C1719={...C,eminent,eminence,ctxFor,grant,delayed,copy,populate,bottom,search,permanent,snapshotCopy};
})();
