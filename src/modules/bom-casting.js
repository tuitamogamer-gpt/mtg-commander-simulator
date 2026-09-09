'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.BOM,G=M.Game.prototype,S=M.StarterCasting;
 const artifacts=(g,p)=>C.artifacts(g,p).filter(c=>g.canSacrifice(c));
 const white=(g,p)=>g.creatures(p).filter(c=>!c.tapped&&c.colors.includes('W'));
 function offers(g,p){const out=[],add=(c,kind,extra={})=>out.push({card:c,from:c.zone,alt:{starterPermission:'bom',starterCardVersion:c.zoneVersion,bomKind:kind,...extra}});
  const haakon=g.bf().some(c=>c.ctrl===p&&C.live(c)&&c.def.bomHaakon);
  for(const c of p.graveyard){if(c.def.bomHaakon||haakon&&c.hasSub('Knight'))add(c,'haakon',{label:'Haakon: cast from your graveyard'});if(c.def.bomScreech&&white(g,p).length>=3)add(c,'screech',{flashback:true,altCostStr:'{0}',label:'Flashback: tap three white creatures'});if(c.def.bomDisturb)add(c,'disturb',{oracleFace:'back',name:c.oracleFaces.faces[1].def.name,altCostStr:c.def.bomDisturb,label:'Disturb: cast transformed'});}
  for(const c of [...p.hand,...p.command])if(c.def.bomOffering)for(const s of artifacts(g,p))add(c,'offering',{bomOffering:s.iid,bomOfferingVersion:s.zoneVersion,speed:'instant',label:'Artifact offering: sacrifice '+s.name});
  return out;
 }
 const prevOffers=S.offers,prevAllowed=S.allowed,prevValidate=S.validate,prevPrepare=S.prepare,prevCommit=S.commit;
 S.offers=(g,p)=>prevOffers(g,p).concat(offers(g,p));
 S.allowed=(g,p,c,a)=>{if(a.starterPermission!=='bom')return prevAllowed(g,p,c,a);const row=offers(g,p).find(r=>r.card===c&&r.alt.bomKind===a.bomKind&&r.alt.bomOffering===a.bomOffering);if(!row||!g.canCastTiming(p,c,a))return false;const expected=row.alt;return Object.keys(a).every(k=>Object.hasOwn(expected,k)?expected[k]===a[k]:k==='from'?a[k]===c.zone:k==='xVal'&&Number.isInteger(a[k])&&a[k]>=0);};
 S.prepare=async(ctx,paid)=>{const a=ctx.so.castOpts;if(a.starterPermission!=='bom')return prevPrepare(ctx,paid);if(a.bomKind==='screech'){const cards=await C.choose(ctx.g,ctx.you,white(ctx.g,ctx.you),3,3,'Battle Screech: tap three untapped white creatures','addlTap');if(cards.length!==3)return false;ctx.so.bomTapRows=cards.map(C.row);paid.tapped.push(...cards);}if(a.bomKind==='offering'){const c=ctx.g.byIid(a.bomOffering);if(!c||c.zoneVersion!==a.bomOfferingVersion)return false;ctx.so.bomOfferingRow=C.row(c);paid.sacd.push(c);}return true;};
 S.validate=ctx=>{if(ctx.so.castOpts.starterPermission!=='bom')return prevValidate(ctx);return S.allowed(ctx.g,ctx.you,ctx.src,ctx.so.castOpts)&&(!ctx.so.bomTapRows||ctx.so.bomTapRows.every(r=>C.current(r)&&white(ctx.g,ctx.you).includes(r.card)))&&(!ctx.so.bomOfferingRow||C.current(ctx.so.bomOfferingRow)&&artifacts(ctx.g,ctx.you).includes(ctx.so.bomOfferingRow.card));};
 S.commit=ctx=>ctx.so.castOpts.starterPermission==='bom'?undefined:prevCommit(ctx);
 const face=M.OracleV8Faces.castChoiceAllowed;M.OracleV8Faces.castChoiceAllowed=(g,p,c,a)=>a.starterPermission==='bom'?S.allowed(g,p,c,a):face(g,p,c,a);
 const timing=G.canCastTiming;G.canCastTiming=function(p,c,a={}){if(c.def.bomHaakon&&c.zone!=='graveyard')return false;if(c.def.bomScreech&&c.zone==='graveyard'&&a.flashback&&a.altCostStr==='{0}'&&a.starterPermission!=='bom')return false;return timing.call(this,p,c,a);};
 const cast=G.castSpell;G.castSpell=function(p,c,o={}){const a=o.alt||o;if(c.def.bomHaakon&&c.zone!=='graveyard'||c.def.bomScreech&&c.zone==='graveyard'&&a.flashback&&a.altCostStr==='{0}'&&a.starterPermission!=='bom')return Promise.resolve(false);return cast.call(this,p,c,o);};
 const cost=G.spellCost;G.spellCost=function(p,c,a={}){const r=cost.call(this,p,c,a);if(a.bomKind!=='offering')return r;const s=this.byIid(a.bomOffering);if(!s||s.zoneVersion!==a.bomOfferingVersion)return r;const less=M.parseCost(s.def.cost||''),pips=r.pips.map(p=>p.slice());let generic=less.generic;
  for(const pip of less.pips){const type=pip.find(k=>pips.some(p=>p.includes(k))&&['W','U','B','R','G','C'].includes(k));if(type){const i=pips.findIndex(p=>p.includes(type));pips.splice(i,1);}else generic+=pip.includes('TWO')?2:1;}
  return {...r,pips,generic:Math.max(0,r.generic-generic)};
 };
})();
