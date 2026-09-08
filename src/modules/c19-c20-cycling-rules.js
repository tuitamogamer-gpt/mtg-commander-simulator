'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,G=M.Game.prototype,C=M.C1920,S=M.StarterCasting;
 const emit=G.emit;
 G.emit=function(name,data){if(name==='cycled')data.c1920Nth= data.player.turnState.c1920Cycled=(data.player.turnState.c1920Cycled||0)+1;return emit.call(this,name,data);};
 const printedOptions=G.cyclingOptions;
 G.cyclingOptions=function(p,c){
  const rows=printedOptions.call(this,p,c),sources=this.bf().filter(s=>s.ctrl===p&&C.live(s));
  if(c.zone!=='hand'||!p.hand.includes(c))return rows;
  for(const s of sources)if(s.def.c1920Tectonic&&c.is('Land'))rows.push({cyclingId:'tectonic:'+s.iid+':'+s.zoneVersion,definition:{cost:'{R}'},label:'Cycling {R} — '+s.name});
  const free=sources.filter(s=>s.def.c1920Gavi&&!p.turnState.c1920Cycled||s.def.c1920Perspectives&&p.hand.length>=7),alternatives=[];
  for(const s of free)for(const r of rows)alternatives.push({cyclingId:r.cyclingId+':free:'+s.iid+':'+s.zoneVersion,definition:{...r.definition,cost:'{0}',xCycling:false,oraclePayment:undefined,oracleAdditionalCosts:undefined},label:'Cycling {0} — '+s.name});
  return alternatives.concat(rows);
 };
 C.hasCycling=(g,c,snap)=>!!(snap?.def||c.def).cycling||c.zone==='hand'&&g.cyclingOptions(c.owner,c).length>0;
 const offers=(g,p)=>g.bf().filter(s=>s.ctrl===p&&C.live(s)&&s.def.c1920Sarcophagus).flatMap(s=>p.graveyard.filter(c=>c.def.cycling&&!c.is('Land')).map(c=>({card:c,from:'graveyard',alt:{starterPermission:'c1920cycling',starterCardVersion:c.zoneVersion,starterSource:s.iid,starterSourceVersion:s.zoneVersion,label:'Abandoned Sarcophagus: cast from your graveyard'}})));
 const oldOffers=S.offers,oldAllowed=S.allowed,oldValidate=S.validate,oldCommit=S.commit;
 S.offers=(g,p)=>oldOffers(g,p).concat(offers(g,p));
 S.allowed=function(g,p,c,a){if(a.starterPermission!=='c1920cycling')return oldAllowed(g,p,c,a);const expected=offers(g,p).find(r=>r.card===c&&r.alt.starterSource===a.starterSource)?.alt;if(!expected||!g.canCastTiming(p,c,a))return false;const keys=new Set([...Object.keys(expected),'from','xVal']);return Object.keys(a).every(k=>keys.has(k)&&(k==='from'?a[k]===c.zone:k==='xVal'?Number.isInteger(a[k])&&a[k]>=0:a[k]===expected[k]));};
 S.validate=ctx=>ctx.so.castOpts.starterPermission==='c1920cycling'?S.allowed(ctx.g,ctx.you,ctx.src,ctx.so.castOpts):oldValidate(ctx);
 S.commit=ctx=>ctx.so.castOpts.starterPermission==='c1920cycling'?undefined:oldCommit(ctx);
})();
