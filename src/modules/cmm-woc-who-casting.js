'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.CWW,SC=M.SCRIPTS,G=M.Game.prototype,S=M.StarterCasting,boeFrames=new WeakMap();
 const oldOffers=S.offers,oldAllowed=S.allowed,oldPrepare=S.prepare,oldValidate=S.validate,oldCommit=S.commit;
 function offers(g,p){const out=[],add=(c,kind,extra={},base={})=>out.push({card:c,from:c.zone,alt:{starterPermission:'cww',starterCardVersion:c.zoneVersion,cwwKind:kind,...extra,...(Object.keys(base).length?{cwwBase:base}:{})}});
  const sources=g.bf().filter(s=>s.ctrl===p&&C.live(s)&&s.meta.cwwFreeTurn!==g.turnNo&&(s.def.cwwAsForetold||s.def.cwwMonolith||s.def.cwwDemon));
  const bases=[...[...p.hand,...p.command].filter(c=>!c.is('Land')).flatMap(card=>C.castVariants(g,card,{}).map(alt=>({card,alt}))),...oldOffers(g,p).filter(r=>!r.alt.free&&!r.alt.altCostStr&&!r.alt.bomOffering&&!r.alt.lifeCost)];
  for(const {card:c,alt:base}of bases)for(const s of sources){const mv=g.stackSpellManaValue({card:c,ctrl:p,castOpts:base}),def=g.castDefinition(c,base);let kind;
   if(s.def.cwwAsForetold&&mv<=(s.counters.time||0))kind='asForetold';
   if(s.def.cwwMonolith&&c.zone==='hand'&&!C.castColors(g,c,base).length)kind='monolith';
   if(s.def.cwwDemon&&g.turnPlayer===p&&def.types.includes('Enchantment')&&g.canPayLife(p,mv))kind='demon';
   if(kind)add(c,kind,{cwwSource:s.iid,cwwSourceVersion:s.zoneVersion,free:true,...(kind==='demon'?{lifeCost:mv}:{}),label:s.name+': '+(kind==='demon'?'pay '+mv+' life':'cast for {0}'),...Object.fromEntries(Object.entries(base).filter(([k])=>['oracleFace','adventure','splitHalf','types','name'].includes(k)))},base);
  }
  for(const c of [...p.hand,...p.command]){
   if(c.def.cwwEmerge)for(const victim of g.creatures(p).filter(x=>g.canSacrifice(x)))add(c,'emerge',{altCostStr:c.def.cwwEmerge,cwwVictim:victim.iid,cwwVictimVersion:victim.zoneVersion,label:'Emerge: sacrifice '+victim.name});
   if(c.def.cwwFlashFliers&&g.creatures(p).filter(x=>!x.tapped&&x.kw('flying')).length>=3)add(c,'flashFliers',{speed:'instant',label:'Cast with flash: tap three flying creatures'});
  }
  const frame=boeFrames.get(g);if(frame?.player===p&&C.current(frame.row)&&frame.row.card.def.suspend)add(frame.row.card,'boe',{speed:'instant',altCostStr:frame.row.card.def.suspend.cost,label:'Pay suspend cost to cast'});
  return out;
 }
 const equal=(a,b)=>JSON.stringify(a||{})===JSON.stringify(b||{});
 S.offers=(g,p)=>oldOffers(g,p).concat(offers(g,p));
 S.allowed=(g,p,c,a)=>{if(a.starterPermission!=='cww')return oldAllowed(g,p,c,a);const row=offers(g,p).find(r=>r.card===c&&r.alt.cwwKind===a.cwwKind&&r.alt.cwwSource===a.cwwSource&&r.alt.cwwVictim===a.cwwVictim&&equal(r.alt.cwwBase,a.cwwBase));if(!row||!g.canCastTiming(p,c,a))return false;return Object.keys(a).every(k=>k==='from'?a[k]===c.zone:k==='xVal'?Number.isSafeInteger(a[k])&&a[k]>=0:equal(a[k],row.alt[k]));};
 S.prepare=async(ctx,paid)=>{const a=ctx.so.castOpts;if(a.starterPermission!=='cww')return oldPrepare(ctx,paid);if(a.cwwKind==='emerge'){const c=ctx.g.byIid(a.cwwVictim);if(!c||c.zoneVersion!==a.cwwVictimVersion)return false;ctx.so.cwwVictim=C.row(c);ctx.so.cwwEmergeToughness=c.toughness;paid.sacd.push(c);}if(a.cwwKind==='flashFliers'){const cards=await C.choose(ctx.g,ctx.you,ctx.g.creatures(ctx.you).filter(c=>!c.tapped&&c.kw('flying')),3,3,'Tegwyll’s Scouring: tap three flying creatures','addlTap');if(cards.length!==3)return false;ctx.so.cwwTapped=cards.map(C.row);paid.tapped.push(...cards);}return true;};
 S.validate=ctx=>{if(ctx.so.castOpts.starterPermission!=='cww')return oldValidate(ctx);return S.allowed(ctx.g,ctx.you,ctx.src,ctx.so.castOpts)&&(!ctx.so.cwwVictim||C.current(ctx.so.cwwVictim)&&ctx.g.canSacrifice(ctx.so.cwwVictim.card))&&(!ctx.so.cwwTapped||ctx.so.cwwTapped.every(r=>C.current(r)&&!r.card.tapped&&r.card.kw('flying')));};
 S.commit=ctx=>{const a=ctx.so.castOpts;if(a.starterPermission!=='cww')return oldCommit(ctx);const s=ctx.g.byIid(a.cwwSource);if(s)s.meta.cwwFreeTurn=ctx.g.turnNo;if(a.cwwBase?.starterPermission)oldCommit({...ctx,so:{...ctx.so,castOpts:a.cwwBase}});};
 const face=M.OracleV8Faces.castChoiceAllowed;M.OracleV8Faces.castChoiceAllowed=(g,p,c,a)=>a.starterPermission==='cww'?S.allowed(g,p,c,a):face(g,p,c,a);
 const cost=G.spellCost;G.spellCost=function(p,c,a={}){const r=cost.call(this,p,c,a);if(a.cwwKind==='emerge'){const v=this.byIid(a.cwwVictim);if(v?.zoneVersion===a.cwwVictimVersion)r.generic=Math.max(0,r.generic-v.mv);}return r;};
 C.castWithSuspendCost=async(ctx,c)=>{const prior=boeFrames.get(ctx.g);boeFrames.set(ctx.g,{player:ctx.you,row:C.row(c)});try{const entry=ctx.g.castableList(ctx.you).find(r=>r.card===c&&r.alt?.cwwKind==='boe');if(entry)return await ctx.g.castSpell(ctx.you,c,{from:c.zone,alt:entry.alt});return false;}finally{if(prior)boeFrames.set(ctx.g,prior);else boeFrames.delete(ctx.g);}};
 for(const name of ['Calamity of the Titans',"Titan's Presence"]){const s=SC[name];s.c1516RevealCreature=true;s.oracleCastRestriction=(g,c,p)=>p.hand.some(x=>x!==c&&x.is('Creature')&&!x.colors.length);s.prepareTargets=async ctx=>{const[c]=await C.choose(ctx.g,ctx.you,ctx.you.hand.filter(c=>c!==ctx.src&&c.is('Creature')&&!c.colors.length),1,1,'Reveal a colorless creature card as an additional cost');if(!c)return false;ctx.so.c1516Reveal=C.row(c);ctx.so.cwwRevealed={mv:c.mv,power:Number(c.def.power)||0};};}
 const emit=G.emit;G.emit=function(name,d){if(name==='cast'&&d.card?.castMeta&&d.so?.cwwEmergeToughness!==undefined)d.card.castMeta.cwwEmergeToughness=d.so.cwwEmergeToughness;return emit.call(this,name,d);};
 const kozilekAbilities=new Map();SC['Kozilek, the Great Distortion'].statics=[{grantsSelfActivatedAbility:true,apply:(g,c)=>{for(const mv of new Set(c.ctrl.hand.map(c=>c.mv))){if(!kozilekAbilities.has(mv))kozilekAbilities.set(mv,{label:'Discard mana value '+mv+': counter a spell of that value',cost:{discard:{n:1,filter:(g,c)=>c.mv===mv}},targets:[M.T.spell((g,so)=>g.stackSpellManaValue(so)===mv)],run:ctx=>ctx.targets[0]&&ctx.g.counterStackObject(ctx.targets[0])});c.cur.extraAbilities.push(kozilekAbilities.get(mv));}}}];
})();
