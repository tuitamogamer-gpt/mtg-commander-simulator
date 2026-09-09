'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,G=M.Game.prototype,C=M.C1920,S=M.StarterCasting;
 const variants=(g,c,base)=>{
  if(c.oracleFaces)return c.oracleFaces.faces.filter(f=>c.oracleFaces.layout!=='transform'||f.key==='front').map(f=>({...base,oracleFace:f.key,name:f.def.name}));
  if(c.def.oracleSplit)return g.oracleSplitCastingOptions(c,c.zone,base);
  return [base,...(c.def.adventure?[{...base,adventure:true,name:c.def.adventure.name,types:c.def.adventure.types,cost:c.def.adventure.cost}]:[])];
 };
 function spellGrant(ctx,c,opts={}){const r={id:++ctx.g.c1920GrantId||(ctx.g.c1920GrantId=1),player:ctx.you.idx,card:c.iid,version:c.zoneVersion,zone:c.zone,...opts};(ctx.g.c1920CastGrants||=[]).push(r);return r;}
 function offers(g,p){
  const out=[],add=(c,id,extra={},filter=()=>true)=>{for(const alt of variants(g,c,{starterPermission:'c1920',starterCardVersion:c.zoneVersion,c1920Permission:id,...extra}))if(!g.castHasType(c,alt,'Land')&&filter(c,alt))out.push({card:c,from:c.zone,alt});};
  const sources=g.bf().filter(c=>c.ctrl===p&&C.live(c));
  for(const c of p.graveyard)if(c.def.c1920Marang&&sources.some(s=>s.colors.some(k=>k==='B'||k==='G')))add(c,'marang',{label:'Marang River Prowler: cast from your graveyard'});
  for(const c of p.graveyard)if(c.def.c1920Strands&&g.creatures(p).some(x=>!x.tapped&&x.colors.includes('W')))add(c,'strands',{flashback:true,altCostStr:'{0}',label:'Flashback: tap an untapped white creature'});
  const top=p.library.at(-1);if(top)for(const s of sources)if(s.def.c1920Elsha)add(top,'elsha:'+s.iid+':'+s.zoneVersion,{speed:'instant',label:'Elsha: cast a noncreature spell from the top'},(c,a)=>!g.castHasType(c,a,'Creature'));
  for(const r of g.c1920CastGrants||[]){if(r.vnPact)continue;const c=g.byIid(r.card);if(r.player!==p.idx||r.used||!c||c.zone!==r.zone||c.zoneVersion!==r.version||!c.owner[c.zone]?.includes(c)||r.turn!==undefined&&r.turn!==g.turnNo)continue;
   add(c,'grant:'+r.id,{...(r.anyColor?{asThoughAnyColor:true}:{}),...(r.anyType?{asThoughAnyType:true}:{}),label:r.label||'Cast the permitted card'},(c,a)=>!r.creature||g.castHasType(c,a,'Creature'));
  }
  for(const r of p.turnState.c1920DaggerGrants||[])if(!r.used){const owner=g.players[r.owner];if(owner&&!owner.lost)for(const c of owner.graveyard)add(c,'dagger:'+r.id,{asThoughAnyColor:true,label:'Whispersteel Dagger: cast one creature'},(c,a)=>g.castHasType(c,a,'Creature'));}
  if(sources.some(s=>s.def.c1920Haldan))for(const owner of g.players)for(const c of owner.exile)if(c.counters.fetch>0&&c.meta.c1920ExiledBy===p.idx&&c.meta.c1920ExileVersion===c.zoneVersion)add(c,'haldan',{asThoughAnyColor:true,label:'Haldan: cast a fetched noncreature spell'},(c,a)=>!g.castHasType(c,a,'Creature'));
  return out;
 }
 const oldOffers=S.offers,oldAllowed=S.allowed,oldValidate=S.validate,oldCommit=S.commit,oldPrepare=S.prepare;
 S.offers=(g,p)=>oldOffers(g,p).concat(offers(g,p));
 S.allowed=function(g,p,c,a){if(a.starterPermission!=='c1920')return oldAllowed(g,p,c,a);const r=offers(g,p).find(r=>r.card===c&&r.alt.c1920Permission===a.c1920Permission&&r.alt.oracleFace===a.oracleFace&&r.alt.adventure===a.adventure&&r.alt.splitHalf===a.splitHalf&&r.alt.splitFuse===a.splitFuse);if(!r||!g.canCastTiming(p,c,a))return false;const keys=new Set([...Object.keys(r.alt),'from','xVal']);return Object.keys(a).every(k=>keys.has(k)&&(k==='from'?a[k]===c.zone:k==='xVal'?Number.isInteger(a[k])&&a[k]>=0:a[k]===r.alt[k]));};
 S.prepare=async(ctx,paid)=>{if(ctx.so.castOpts.starterPermission!=='c1920')return oldPrepare(ctx,paid);if(ctx.so.castOpts.c1920Permission!=='strands')return true;const[c]=await C.choose(ctx.g,ctx.you,ctx.g.creatures(ctx.you).filter(c=>!c.tapped&&c.colors.includes('W')),1,1,'Prismatic Strands: tap a white creature','addlTap');if(!c)return false;ctx.so.c1920TapRow=C.row(c);paid.tapped.push(c);return true;};
 S.validate=ctx=>ctx.so.castOpts.starterPermission==='c1920'?S.allowed(ctx.g,ctx.you,ctx.src,ctx.so.castOpts)&&(!ctx.so.c1920TapRow||C.current(ctx.so.c1920TapRow)&&ctx.so.c1920TapRow.card.ctrl===ctx.you&&!ctx.so.c1920TapRow.card.tapped&&ctx.so.c1920TapRow.card.is('Creature')&&ctx.so.c1920TapRow.card.colors.includes('W')):oldValidate(ctx);
 S.commit=ctx=>{const a=ctx.so.castOpts;if(a.starterPermission!=='c1920')return oldCommit(ctx);if(a.c1920Permission.startsWith('dagger:')){const r=ctx.you.turnState.c1920DaggerGrants?.find(r=>'dagger:'+r.id===a.c1920Permission);if(r)r.used=true;}};
 const faceAllowed=M.OracleV8Faces.castChoiceAllowed;
 M.OracleV8Faces.castChoiceAllowed=(g,p,c,a)=>a.starterPermission==='c1920'?S.allowed(g,p,c,a):faceAllowed(g,p,c,a);
 const blocked=(g,p,c,a)=>g.bf().filter(C.live).some(s=>s.def.c1920Archon&&s.meta.c1920CardType&&g.castHasType(c,a,s.meta.c1920CardType)||s.def.c1920Barracuda&&s.ctrl!==p&&g.turnPlayer===s.ctrl);
 const timing=G.canCastTiming;
 G.canCastTiming=function(p,c,a){a=a||{};if(blocked(this,p,c,a))return false;return timing.call(this,p,c,this.bf().some(s=>C.live(s)&&s.def.c1920Barracuda)?{...a,speed:'instant'}:a);};
 const cast=G.castSpell;
 G.castSpell=function(p,c,opts={}){const a=opts.alt||opts;if(blocked(this,p,c,a)||a.asThoughAnyType&&(a.starterPermission!=='c1920'||!S.allowed(this,p,c,a))||c.def.c1920Strands&&c.zone==='graveyard'&&a.flashback&&a.starterPermission!=='c1920'&&!(a.altCostStr===c.def.cost&&(c.meta.flashbackUntil===this.turnNo||this.bf().some(s=>s.ctrl===p&&C.live(s)&&s.def.grantsFlashback))))return Promise.resolve(false);return cast.call(this,p,c,opts);};
 const cost=G.spellCost;
 G.spellCost=function(p,c,a={}){const result=cost.call(this,p,c,a);if(a.asThoughAnyType)result.pips=result.pips.map(pip=>['C','W','U','B','R','G',...pip.filter(s=>s==='PHY'||s==='TWO')]);return result;};
 const lands=G.playableLands;
 G.playableLands=function(p){const out=lands.call(this,p);if(p.landsPlayed<this.landPlayLimit(p)&&this.bf().some(s=>s.ctrl===p&&C.live(s)&&s.def.c1920Haldan))for(const owner of this.players)for(const c of owner.exile)if(c.is('Land')&&c.counters.fetch>0&&c.meta.c1920ExiledBy===p.idx&&c.meta.c1920ExileVersion===c.zoneVersion)out.push(c);return [...new Set(out)];};
 const emit=G.emit;
 G.emit=function(name,data){if(name==='cast'&&data?.player&&data.card){const p=data.player,so=data.so||{card:data.card,castOpts:{},from:data.card.zone};if(this.castHasType(so.card,so.castOpts,'Instant'))data.c1920InstantNth=p.turnState.c1920Instants=(p.turnState.c1920Instants||0)+1;if(this.isInstantSorcerySpell(so)&&so.from==='graveyard')data.c1920GraveSpellNth=p.turnState.c1920GraveSpells=(p.turnState.c1920GraveSpells||0)+1;if(so.castOpts?.faceDownCast&&this.isCreatureSpell(so))p.turnState.c1920FaceDown=(p.turnState.c1920FaceDown||0)+1;}return emit.call(this,name,data);};
 const move=G.move;
 G.move=async function(c,to,opts={}){const from=c.zone,version=c.zoneVersion,result=await move.call(this,c,to,opts);if(c.zoneVersion!==version&&from!==c.zone)delete c.meta.flashbackUntil;return result;};
 C.spellGrant=spellGrant;C.castVariants=variants;C.elshaTop=(g,p,c)=>g.bf().some(s=>s.ctrl===p&&C.live(s)&&s.def.c1920Elsha)&&variants(g,c,{}).some(a=>!g.castHasType(c,a,'Land')&&!g.castHasType(c,a,'Creature'));
 C.captureSpell=ctx=>{const so=ctx.data.so;ctx.c1920Spell={...so,copyRoot:so.copyRoot||so,oracleDefinition:so.oracleDefinition||ctx.g.castDefinition(so.card,so.castOpts)};};
 C.partner=name=>C.enterTrigger('Target player may search for '+name,async ctx=>{const p=ctx.targets[0];if(p&&await C.option(ctx,[{key:'yes',label:'Search for '+name},{key:'no',label:'Decline'}],'search for a partner',p)==='yes')await C.search(ctx,p,c=>M.OracleV8NameGroups.names(c).includes(name),1);},{targets:[M.T.player()]});
})();
