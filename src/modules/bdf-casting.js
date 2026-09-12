'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.BDF,P=M.POM,G=M.Game.prototype,S=M.StarterCasting;
 const previous={offers:S.offers,allowed:S.allowed,prepare:S.prepare,validate:S.validate,commit:S.commit};
 const srcs=(g,p,k)=>C.sources(g,p,k);
 const variants=(g,c,a={})=>{const vs=c.def.bdfRoom?c.def.bdfRoom.map(h=>({...a,bdfDoor:h.key,...(!a.free?{altCostStr:h.cost}:{})})):C.castVariants(g,c,a);return vs.flatMap(v=>c.def.bdfGift?[v,{...v,bdfGift:true}]:[v]);};
 const source=(g,a)=>a.bdfSource?g.byIid(a.bdfSource):null;
 function offers(g,p){const out=[],add=(c,mode,s,extra={})=>{for(const a of variants(g,c,extra))out.push({card:c,from:c.zone,alt:{...a,starterPermission:'bdf',starterCardVersion:c.zoneVersion,bdfMode:mode,...(s?{bdfSource:s.iid,bdfVersion:s.zoneVersion}:{}),label:'Cast with '+(s?.name||c.name)}});};
  const own=g.turnPlayer===p;
  for(const c of p.graveyard){if(c.is('Land'))continue;
   if(c.def.bdfRuinator&&p.graveyard.filter(x=>x!==c&&x.is('Creature')).length>=3)add(c,'ruinator');
   if(c.def.bdfSabin&&p.hand.length)add(c,'sabin',null,{blitz:true,altCostStr:'{2}{R}{R}'});
   for(const s of srcs(g,p,'bdfGraveCast'))if(own&&s.meta.bdfUseTurn!==g.turnNo){const kind=s.def.bdfGraveCast;if(kind==='banon'&&c.is('Creature')&&c.meta.bdfGraveTurn===g.turnNo&&c.meta.bdfGraveFrom!=='battlefield'||kind==='edgar'&&c.is('Artifact'))add(c,kind,s);}
   if(c.is('Enchantment')&&p.graveyard.filter(x=>x!==c).length>=3)for(const s of srcs(g,p,'bdfEscape'))add(c,'escape',s,{altCostStr:c.def.cost||'{0}'});
  }
  const top=p.library.at(-1);
  if(top&&!top.is('Land')){for(const s of srcs(g,p,'bdfMultiverse'))add(top,'top',s);for(const s of srcs(g,p,'bdfPit'))if(g.bf().some(c=>c.ctrl===p&&!c.is('Land')&&g.canSacrifice(c)))add(top,'pit',s);}
  for(const s of srcs(g,p,'bdfMultiverse'))if(own&&s.meta.bdfUseTurn!==g.turnNo)for(const c of p.hand.concat(top&&!top.is('Land')?[top]:[]))if(!c.is('Land'))add(c,'multiverse',s,{free:true});
  for(const s of srcs(g,p,'bdfAccessMaze'))if(own&&C.bdfUnlocked(s,'right')&&s.meta.bdfUseTurn!==g.turnNo)for(const c of p.hand)if(!c.is('Land')&&g.canPayLife(p,c.mv))add(c,'maze',s,{free:true,lifeCost:c.mv});
  if(p.emblems.some(e=>e.bdfTamiyo))for(const c of p.hand)if(!c.is('Land'))add(c,'tamiyo',null,{free:true});
  for(const r of g.bdfPermissions||[])if(r.player===p.idx&&r.turn===g.turnNo&&!r.group.used){const c=g.byIid(r.iid);if(c&&c.zone===r.zone&&c.zoneVersion===r.version&&!c.is('Land'))add(c,'grant',null,{bdfGrant:r.id});}
  if(C.count(p,'energy')>=8){const natural=[];for(const c of p.hand.concat(p.command))if(!c.is('Land'))for(const a of variants(g,c))natural.push({card:c,from:c.zone,alt:{...a,starterPermission:'bdf',starterCardVersion:c.zoneVersion,bdfMode:'nissa'}});const base=natural.concat(out.filter(r=>['top','pit','banon','edgar','grant','ruinator'].includes(r.alt.bdfMode)));for(const s of srcs(g,p,'bdfNissa'))for(const r of base)if(g.castDefinition(r.card,r.alt).types.some(t=>['Artifact','Creature','Enchantment','Planeswalker','Battle'].includes(t))){const alt={...r.alt,free:true,pomEnergyCost:8,bdfNissa:s.iid,bdfNissaVersion:s.zoneVersion,label:'Pay eight energy with '+s.name};delete alt.altCostStr;out.push({...r,alt});}}
  return out;
 }
 S.offers=(g,p)=>previous.offers(g,p).concat(offers(g,p));
 S.allowed=(g,p,c,a)=>a.starterPermission!=='bdf'?previous.allowed(g,p,c,a):g.canCastTiming(p,c,a)&&offers(g,p).some(r=>r.card===c&&Object.keys(r.alt).every(k=>JSON.stringify(a[k])===JSON.stringify(r.alt[k]))&&Object.keys(a).every(k=>k==='from'?a[k]===c.zone:k==='xVal'?Number.isSafeInteger(a[k])&&a[k]>=0:JSON.stringify(a[k])===JSON.stringify(r.alt[k])));
 S.validate=ctx=>ctx.so.castOpts.starterPermission==='bdf'?S.allowed(ctx.g,ctx.you,ctx.src,ctx.so.castOpts):previous.validate(ctx);
 S.prepare=async(ctx,paid)=>{const a=ctx.so.castOpts;if(a.starterPermission!=='bdf')return previous.prepare(ctx,paid);if(!S.allowed(ctx.g,ctx.you,ctx.src,a))return false;if(a.bdfMode==='pit'){const pool=ctx.g.bf().filter(c=>c.ctrl===ctx.you&&!c.is('Land')&&ctx.g.canSacrifice(c));if(!pool.length)return false;const[c]=await C.choose(ctx.g,ctx.you,pool,1,1,'Sacrifice a nonland permanent for Into the Pit','sacCost');paid.sacd.push(c);ctx.so.bdfPitRow=C.row(c);}return true;};
 S.commit=ctx=>{const a=ctx.so.castOpts;if(a.starterPermission!=='bdf')return previous.commit(ctx);const s=source(ctx.g,a);if(s&&['banon','edgar','multiverse','maze'].includes(a.bdfMode))s.meta.bdfUseTurn=ctx.g.turnNo;if(a.bdfMode==='edgar')ctx.so.bdfTapped=true;if(a.bdfMode==='grant'){const r=ctx.g.bdfPermissions?.find(r=>r.id===a.bdfGrant);if(r)r.group.used=true;}};
 const face=M.OracleV8Faces.castChoiceAllowed;M.OracleV8Faces.castChoiceAllowed=(g,p,c,a)=>a.starterPermission==='bdf'?S.allowed(g,p,c,a):face(g,p,c,a);
 C.bdfGrant=(ctx,c,{group={used:false}}={})=>{const id=(ctx.g.bdfPermissionId=(ctx.g.bdfPermissionId||0)+1);(ctx.g.bdfPermissions||=[]).push({id,iid:c.iid,version:c.zoneVersion,zone:c.zone,player:ctx.you.idx,turn:ctx.g.turnNo,group});};
 const prepare=P.prepareCast;P.prepareCast=async function(g,p,c,a,cost,x){const nissa=a.starterPermission==='bdf'&&a.bdfNissa;if(nissa&&!S.allowed(g,p,c,a))return null;const input=nissa?{...a}:a;if(nissa)delete input.pomEnergyCost;const plan=await prepare(g,p,c,input,cost,x);if(!plan)return null;const d=g.castDefinition(c,a);
  if(d.bdfRoom&&!a.miracle&&a.oracleImmediateCast===undefined&&!a.starterPermission&&(a.free||a.altCostStr!==undefined&&a.altCostStr!==d.cost))return null;
  let exile=0,filter=()=>true;if(d.bdfRuinator){exile=3;filter=c=>c.is('Creature');}if(a.bdfMode==='escape')exile+=3;
  if(exile){const pool=p.graveyard.filter(t=>t!==c&&filter(t));if(pool.length<exile)return null;plan.pomExile=(plan.pomExile||[]).concat((await C.choose(g,p,pool,exile,exile,'Exile cards to pay the additional cost','delve')).map(C.row));}
  if(d.bdfSabin&&a.blitz){const pool=p.hand.filter(t=>t!==c);if(!pool.length)return null;plan.pomDiscard=(plan.pomDiscard||[]).concat((await C.choose(g,p,pool,1,1,'Discard a card to pay Sabin’s blitz cost','discard')).map(C.row));}
  if(a.bdfGift){if(!d.bdfGift)return null;const q=await C.choosePlayer({g,src:c,you:p},p.opponents(g),'Choose the opponent promised the gift');if(!q)return null;plan.bdfGiftPlayer=q.idx;}
  return plan;
 };
 const put=G.putPermanentOntoBattlefield;G.putPermanentOntoBattlefield=function(c,p,o={}){const so=this.stack.find(s=>s.card===c&&s.kind==='spell');if(so?.bdfTapped||c.castMeta?.alt?.bdfMode==='edgar')o={...o,tapped:true};return put.call(this,c,p,o);};
 const lands=G.playableLands;G.playableLands=function(p){const out=lands.call(this,p);if(p.landsPlayed<this.landPlayLimit(p)){if(srcs(this,p,'bdfForestGrave').length)out.push(...p.graveyard.filter(c=>c.hasSub('Forest')));if(srcs(this,p,'bdfMultiverse').length&&p.library.at(-1)?.is('Land'))out.push(p.library.at(-1));}return [...new Set(out)];};
 const landAllowed=M.StarterCasting.landAllowed;if(landAllowed)M.StarterCasting.landAllowed=(g,p,c,...a)=>c.zone==='graveyard'&&c.owner===p&&c.hasSub('Forest')&&srcs(g,p,'bdfForestGrave').length>0||c.zone==='library'&&p.library.at(-1)===c&&srcs(g,p,'bdfMultiverse').length>0||landAllowed(g,p,c,...a);
 const cycling=G.cyclingOptions;G.cyclingOptions=function(p,c){const rows=cycling.call(this,p,c);if(c.zone==='hand'&&c.owner===p&&c.is('Creature'))for(const s of srcs(this,p,'bdfCycling'))rows.push({cyclingId:'bdf:'+s.iid+':'+s.zoneVersion,definition:{cost:'{1}{U}'},label:'Cycling {1}{U} — '+s.name});return rows;};
 const spellCost=G.spellCost;G.spellCost=function(p,c,a={}){const cost=spellCost.call(this,p,c,a);if(a.miracle&&a.bdfMiracleXReduction)cost.xReduction=(cost.xReduction||0)+a.bdfMiracleXReduction;return cost;};
 const landSources=P.landSources;P.landSources=(g,p,c)=>landSources(g,p,c).concat(c.zone==='graveyard'&&c.owner===p&&c.hasSub('Forest')?srcs(g,p,'bdfForestGrave'):[]);
 C.miracleOptions=(g,p,c)=>{if(!c.is('Enchantment')||!srcs(g,p,'bdfMiracle').length)return [];const halves=c.def.bdfRoom||[{cost:c.def.cost}];return halves.filter(h=>h.cost).flatMap(h=>{const parsed=M.parseCost(h.cost),cost='{X}'.repeat(parsed.x||0)+'{'+Math.max(0,parsed.generic-4)+'}'+parsed.pips.map(p=>'{'+p.join('/')+'}').join(''),o={cost,...(parsed.x?{xReduction:Math.max(0,4-parsed.generic)}:{}),...(h.key?{bdfDoor:h.key}:{})};return c.def.bdfGift?[o,{...o,bdfGift:true}]:[o];});};
})();
