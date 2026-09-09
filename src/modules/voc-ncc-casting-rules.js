'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,G=M.Game.prototype,C=M.VN,S=M.StarterCasting;
 const sources=(g,p,key)=>g.bf().filter(c=>c.ctrl===p&&C.live(c)&&c.def[key]);
 const henzie=(g,p,c,a)=>g.castHasType(c,a,'Creature')&&M.mv(g.castDefinition(c,a).cost||'',a.xVal||0)>=4&&sources(g,p,'vnHenzie').length>0;
 function offers(g,p){const out=[],add=(c,id,extra={},filter=()=>true)=>{for(const a of C.castVariants(g,c,{}))if(!g.castHasType(c,a,'Land')&&filter(a))out.push({card:c,from:c.zone,alt:{...a,starterPermission:'vn',starterCardVersion:c.zoneVersion,vnPermission:id,...extra}});};
  for(const c of [...p.graveyard,...p.exile])if(c.def.vnSquee)add(c,'squee',{label:'Squee: cast from '+c.zone});
  if(p.turnState.vnYusri)for(const c of p.hand)add(c,'yusri',{free:true,label:'Yusri: cast without paying mana'});
  for(const c of [...p.hand,...p.command])for(const a of C.castVariants(g,c,{}))if(henzie(g,p,c,a))out.push({card:c,from:c.zone,alt:{...a,starterPermission:'vn',starterCardVersion:c.zoneVersion,vnPermission:'henzie',blitz:true,vnBlitz:true,altCostStr:g.castDefinition(c,a).cost,label:'Henzie: blitz'}});
  for(const r of g.c1920CastGrants||[]){if(!r.vnPact||r.player!==p.idx||r.turn!==g.turnNo)continue;const c=g.byIid(r.card);if(c?.zone===r.zone&&c.zoneVersion===r.version&&c.owner[c.zone].includes(c))add(c,'pact:'+r.id,{free:true,vnPact:true,label:'Xander’s Pact: pay life instead of mana'});}
  return out;
 }
 const henzieBase=a=>{if(!a.vnBlitz||a.vnPermission==='henzie')return a;const base={...a};for(const k of ['vnBlitz','blitz','altCostStr','label'])delete base[k];return base;};
 const prevOffers=S.offers,prevAllowed=S.allowed,prevPrepare=S.prepare,prevValidate=S.validate,prevCommit=S.commit;
 S.offers=(g,p)=>prevOffers(g,p).filter(r=>!(r.alt?.c1920Permission?.startsWith('grant:')&&(g.c1920CastGrants||[]).some(x=>x.vnPact&&'grant:'+x.id===r.alt.c1920Permission))).concat(offers(g,p));
 S.allowed=(g,p,c,a)=>{if(a.starterPermission!=='vn')return (!a.vnBlitz||henzie(g,p,c,a)&&a.blitz===true&&!a.free&&a.altCostStr===g.castDefinition(c,a).cost)&&prevAllowed(g,p,c,henzieBase(a));const row=offers(g,p).find(r=>r.card===c&&r.alt.vnPermission===a.vnPermission&&r.alt.oracleFace===a.oracleFace&&r.alt.splitHalf===a.splitHalf&&r.alt.adventure===a.adventure);if(!row||!g.canCastTiming(p,c,a))return false;const keys=new Set([...Object.keys(row.alt),'from','xVal']);return Object.keys(a).every(k=>keys.has(k)&&(k==='from'?a[k]===c.zone:k==='xVal'?Number.isInteger(a[k])&&a[k]>=0:a[k]===row.alt[k]));};
 S.prepare=async(ctx,paid)=>{const a=ctx.so.castOpts;if(a.starterPermission!=='vn')return prevPrepare(ctx,paid);if(a.vnPact){const n=M.mv(ctx.g.castDefinition(ctx.src,a).cost||'',ctx.so.x||0);if(ctx.you.life<n||!ctx.g.canPayLife(ctx.you,n))return false;paid.life=(paid.life||0)+n;}return true;};
 S.validate=ctx=>{const a={...henzieBase(ctx.so.castOpts)};delete a._kicked;const clean={...ctx,so:{...ctx.so,castOpts:a}};return a.starterPermission==='vn'?S.allowed(ctx.g,ctx.you,ctx.src,a):prevValidate(clean);};
 S.commit=ctx=>ctx.so.castOpts.starterPermission==='vn'?undefined:prevCommit(ctx);
 const face=M.OracleV8Faces.castChoiceAllowed;M.OracleV8Faces.castChoiceAllowed=(g,p,c,a)=>a.starterPermission==='vn'?S.allowed(g,p,c,a):face(g,p,c,a);
 const cost=G.spellCost;G.spellCost=function(p,c,a={}){const r=cost.call(this,p,c,a),d=this.castDefinition(c,a);let reduction=0;if(d.vnOskar)reduction+=new Set(p.graveyard.map(c=>c.mv)).size;if(a.blitz)reduction+=sources(this,p,'vnHenzie').length*p.commanderCasts;if(this.isInstantSorceryCast(c,a))reduction+=p.turnState.vnSoprano||0;r.generic=Math.max(0,r.generic-reduction);return r;};
 G.vnCasualties=function(p,c,a){if(!this.isInstantSorceryCast(c,a)||p.turnState.spellsCastList.some(r=>r.isInstantSorcery))return [];return sources(this,p,'vnAnhelo').map(c=>({n:2,source:c,version:c.zoneVersion}));};
 G.vnMadnessCost=function(c){return c.def.madness||c.is('Creature')&&c.hasSub('Vampire')&&sources(this,c.owner,'vnGorger').length&&c.def.cost||null;};
 const recalc=G.recalc;G.recalc=function(){const result=recalc.call(this);for(const c of this.bf())if(c.castMeta?.alt?.vnBlitz&&!c.cur.abilitiesDisabled){c.cur.kw.add('haste');c.cur.extraTriggers.push({on:'dies',filter:(g,c,d)=>d.card===c,desc:'Blitz: draw a card',run:ctx=>ctx.g.draw(ctx.you,1,ctx.src)});}return result;};
 const emit=G.emit;G.emit=function(name,data){if(name==='cardsLeftGraveyard')for(let i=0;i<data.cards.length;i++){const snap=data.snapshots?.[i],c=data.cards[i];if((snap?.types||c.def.types).includes('Creature'))c.owner.turnState.vnCreatureLeftGraveyard=true;}return emit.call(this,name,data);};
 Object.assign(C,{henzie,henzieBase,sources});
})();
