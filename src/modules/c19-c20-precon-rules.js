'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.C1719,G=M.Game.prototype;
 const keywords=['flying','first strike','double strike','deathtouch','haste','hexproof','indestructible','lifelink','menace','reach','trample','vigilance'];
 const type=(ctx,s)=>M.c1719TextType(ctx,s);
 const basic=c=>c.is('Land')&&c.def.super.includes('Basic');
 const human=ctx=>C.token('Human Soldier',[type(ctx,'Human'),type(ctx,'Soldier')],1,1,['W']);
 const beast=ctx=>C.token('Beast',[type(ctx,'Beast')],3,3,['G']);
 const intrinsicCache=new WeakMap();
 function intrinsicKeywords(def){if(intrinsicCache.has(def))return intrinsicCache.get(def);const result=new Set(def.kws||[]),known=new Set([...keywords,'defender','flash','prowess','shroud','fear','intimidate','skulk','shadow','horsemanship','wither','infect','forestwalk','islandwalk','mountainwalk','plainswalk','swampwalk','nonbasic landwalk','legendary landwalk']);
  for(const line of (def.oracle||'').split('\n')){const parts=line.replace(/\s*\([^)]*\)/g,'').trim().toLowerCase().split(/\s*[,;]\s*/);if(parts.every(s=>known.has(s)||/^protection from /.test(s)||/^ward(?:\s|$)/.test(s)))for(const s of parts)if(known.has(s))result.add(s);}
  const values=[...result];intrinsicCache.set(def,values);return values;
 }
 const keyword=(c,k)=>c.zone==='battlefield'?c.kw(k):intrinsicKeywords(c.def).includes(k);
 async function randomBottom(ctx,cards,p=ctx.you){const shuffled=cards.slice();M.shuffle(shuffled,ctx.g.rnd);for(const c of shuffled)await ctx.g.move(c,'library',{toBottom:true});}
 async function castMany(ctx,cards,options={}){const rows=cards.map(C.row);while(true){const current=rows.filter(C.current).map(r=>r.card);if(!current.length)break;const c=await M.OracleV8PlayPermissions.castOne(ctx,current,options,{target:filter=>({filter:(g,s)=>filter(s,g)})});if(!c)break;}}
 async function color(ctx){const colors=['W','U','B','R','G'],key=await C.option(ctx,colors.map(key=>({key,label:key})),'choose a color',ctx.you,'color');if(!colors.includes(key))throw Error('Invalid color');return key;}
 const landLimit=G.landPlayLimit;
 G.landPlayLimit=function(p){return landLimit.call(this,p)+(p.turnState.c1920ExtraLands||0);};
 const move=G.move;
 G.move=async function(c,to,opts={}){const from=opts.c1920MergedOrigin?'battlefield':c.zone,version=c.zoneVersion,result=await move.call(this,c,to,opts);if(c.zone==='graveyard'&&c.zoneVersion!==version)c.meta.c1920GraveEntry={turn:this.turnNo,version:c.zoneVersion,from};return result;};
 const graveThisTurn=(g,c,from)=>c.zone==='graveyard'&&c.meta.c1920GraveEntry?.version===c.zoneVersion&&c.meta.c1920GraveEntry.turn===g.turnNo&&(!from||c.meta.c1920GraveEntry.from===from);
 const spellHasX=(g,so)=>{const o=so.castOpts||{},d=g.castDefinition(so.card,o);if(o.faceDownCast)return false;return String(o.adventure?d.adventure?.cost:d.oracleSplit?g.oracleSplitPrintedCost(so.card,o):d.cost).includes('{X}');};
 const nextOwnGrant=(ctx,c,opts={})=>C.playGrant(ctx,c,{...opts,c1920UntilOwnTurn:ctx.you.turnsStarted+1});
 const expire=G.expireOwnTurnExilePermissions;
 G.expireOwnTurnExilePermissions=function(p){expire.call(this,p);this.c1719Permissions=(this.c1719Permissions||[]).filter(r=>r.player!==p.idx||r.c1920UntilOwnTurn===undefined||r.c1920UntilOwnTurn>p.turnsStarted);};
 const recalc=G.recalc;
 G.recalc=function(){this.untilEffects=this.untilEffects.filter(e=>!e.c1920UntilFaceDown||!this.byIid(e.iid)?.faceDown);return recalc.call(this);};
 const canBlock=G.canBlock;
 G.canBlock=function(blocker,attacker){if(!attacker.cur?.abilitiesDisabled&&attacker.def.c1920Silumgar&&blocker.power>attacker.power)return false;return canBlock.call(this,blocker,attacker);};
 function delayedUntilNext(ctx,trigger){const marker={kind:'c1920TriggerDuration',expires:'untilTurnOf',whoTurn:ctx.you};ctx.g.untilEffects.push(marker);ctx.g.delayed.push({once:false,src:ctx.src,ctrl:ctx.you,...trigger,c1920Duration:marker,filter:(g,d)=>g.untilEffects.includes(marker)&&(!trigger.filter||trigger.filter(g,d))});}
 const emit=G.emit;
 G.emit=function(name,data){this.delayed=this.delayed.filter(d=>!d.c1920Duration||this.untilEffects.includes(d.c1920Duration));return emit.call(this,name,data);};
 M.C1920={...C,keywords,type,basic,human,beast,keyword,intrinsicKeywords,tokenImage:(def,alias)=>({...def,tokenImageName:alias}),randomBottom,castMany,color,graveThisTurn,spellHasX,nextOwnGrant,delayedUntilNext};

 Object.assign(M.TOKEN_IMG,{"Chandra Elemental": "e4a9051b-f964-43f9-877b-ea4f17620ecb", "Vraska Assassin": "4401437c-23ea-44ac-a8e7-eb033e1d61eb", "Dinosaur Cat": "cb87f3e1-f4ba-459d-9bb9-6651fe073a0a", "Oona Faerie Rogue": "fb01ca03-8784-4f05-a19e-59d12949cf85", "Notorious Faerie Rogue": "01e6b701-d7a4-400d-b5f1-b6ef725248d1", "C20 Hydra": "d50eb149-015c-49c9-a3de-c62189c5582d"});
 M.TOKENS.c1920Token0={...C.token("Elemental",["Elemental"],"3","1",["R"],["haste"]),tokenImageName:"Chandra Elemental"};
 M.TOKENS.c1920Token1={...C.token("Assassin",["Assassin"],"1","1",["B"],[]),tokenImageName:"Vraska Assassin"};
 M.TOKENS.c1920Token2={...C.token("Dinosaur Cat",["Dinosaur", "Cat"],"2","2",["R", "W"],[]),tokenImageName:"Dinosaur Cat"};
 M.TOKENS.c1920Token3={...C.token("Faerie Rogue",["Faerie", "Rogue"],"1","1",["B", "U"],["flying"]),tokenImageName:"Oona Faerie Rogue"};
 M.TOKENS.c1920Token4={...C.token("Faerie Rogue",["Faerie", "Rogue"],"1","1",["B"],["flying"]),tokenImageName:"Notorious Faerie Rogue"};
 M.TOKENS.c1920Token5={...C.token("Hydra",["Hydra"],"0","0",["G"],[]),tokenImageName:"C20 Hydra"};
})();
