(() => {
 const M=globalThis.MTG,V=M.OracleV20,H=V.helpers;
 const G=M.Game.prototype,F=M.OracleV8Faces;
 const permissionActive=(g,p,c)=>{const grant=c.meta?.oracleExilePermissionV22;if(!grant)return null;const r=grant.record;if(c.zone!=='exile'||c.zoneVersion!==grant.version||p!==r.player||r.closed||r.max!==null&&r.used.length>=r.max)return false;if(r.duration==='source-control'&&(r.source.zone!=='battlefield'||r.source.zoneVersion!==r.sourceVersion||r.source.ctrl!==r.player||(r.source.meta.oracleDurationControl?.epoch||0)!==r.controlEpoch)){r.closed=true;return false;}if(r.duration==='next-turn-start'&&p.turnsStarted>=r.ownTurn+1||r.duration==='eot'&&g.turnNo!==r.turn||r.duration==='next-turn'&&p.turnsStarted>r.ownTurn+1||r.duration==='only-next-turn'&&(p.turnsStarted!==r.ownTurn+1||g.turnPlayer!==p))return false;return true;};
 function grant(ctx,cards,e){const r={player:ctx.you,source:ctx.src,sourceVersion:ctx.sourceZoneVersion??ctx.src.zoneVersion,controlEpoch:ctx.src.meta.oracleDurationControl?.epoch||0,duration:e.duration,turn:ctx.g.turnNo,ownTurn:ctx.you.turnsStarted,max:e.max==null?null:Math.max(0,Math.floor(H.genericAmount(e.max,ctx))),filter:e.filter,free:!!e.free,anyColor:!!e.anyColor,used:[],closed:false};for(const c of cards){c.meta.playableBy=ctx.you;c.meta.spellsOnly=!!e.spellsOnly;c.meta.freePlay=!!e.free;c.meta.anyColor=!!e.anyColor;c.meta.oracleExilePermissionV22={version:c.zoneVersion,record:r};if(e.duration==='next-turn')c.meta.playableUntilOwnTurn=ctx.you.turnsStarted+1;else c.meta.playableUntil=e.duration==='eot'?ctx.g.turnNo:Infinity;if(e.filter){const version=c.zoneVersion;c.meta.playableCondition=(g,p,card)=>card.zoneVersion===version&&H.genericTargetSpec(e.filter,[],0).filter(g,{kind:'spell',card,ctrl:p,castOpts:{},x:0},p,ctx.src);}}return r;}
 const converted=(g,p,c,from=c.zone)=>c.oracleFaces?.layout==='transform'&&c.oracleFaces.faces[0].def.oracleConvertedCastingV22&&['hand','command','graveyard','exile','library'].includes(from)&&F.castCandidates(g,p,c,from).some(row=>row.oracleFace==='front');
 const candidates=F.castCandidates;
 F.castCandidates=function(g,p,c,from=c.zone){const out=candidates(g,p,c,from),front=c.oracleFaces?.faces[0]?.def;if(front?.oracleConvertedCastingV22){for(const row of out.filter(row=>row.oracleFace==='front'&&!row.altCostStr&&!row.free&&!row.flashback&&!row.foretell&&!row.escape&&!row.harmonize&&!row.mayhem)){const back=c.oracleFaces.faces[1].def;out.push({...row,oracleFace:'back',oracleConvertedV22:true,altCostStr:front.oracleConvertedCastingV22,name:back.name,label:'Cast converted '+back.name+' '+front.oracleConvertedCastingV22});}}return out;};
 const choice=F.castChoiceAllowed;
 F.castChoiceAllowed=function(g,p,c,o){if(o.oracleConvertedV22)return !o.free&&!o.faceDownCast&&o.oracleFace==='back'&&o.altCostStr===c.oracleFaces?.faces[0]?.def.oracleConvertedCastingV22&&F.castCandidates(g,p,c,o.from||c.zone).some(row=>row.oracleConvertedV22&&['consumeExilePermission','fromTop','muldrotha','emry'].every(key=>!!row[key]===!!o[key]));return choice(g,p,c,o);};
 const mv=Object.getOwnPropertyDescriptor(M.CardInst.prototype,'mv');
 Object.defineProperty(M.CardInst.prototype,'mv',{...mv,get(){return this.oracleFaces?.layout==='transform'&&!this.isToken&&this.oracleFace==='back'&&this.def.oracleConvertedFrontCostV22?M.mv(this.def.oracleConvertedFrontCostV22,this.zone==='stack'?this.castMeta?.x||0:0):mv.get.call(this);}});
 const handler={layoutsV22:true,compile(op,script){
  if(op.kind==='converted-casting-v22'){script.oracleConvertedCastingV22=op.cost;return true;}
  if(op.kind==='converted-physical-v22'){script.oracleConvertedFrontCostV22=op.frontCost;return true;}
  if(op.kind==='living-metal-v22'){(script.statics||=[]).push({apply:(g,c)=>{if(g.turnPlayer===c.ctrl&&!c.cur.abilitiesDisabled&&!c.cur.types.includes('Creature'))c.cur.types.push('Creature');}});return true;}
  return false;
 },async effect(ctx,e){
  if(e.action==='reveal-until-v22'){
   const filter=H.genericTargetSpec({...e.filter,zone:'library',controller:'any'},[],0,ctx.data),cards=[];let chosen=null;
   for(const c of ctx.you.library.slice().reverse()){cards.push(c);if(filter.filter(ctx.g,c,ctx.you,ctx.src)){chosen=c;break;}}
   const versions=new Map(cards.map(c=>[c,c.zoneVersion]));if(cards.length)await ctx.g.revealToHuman({cards,ctrl:ctx.you,kind:'reveal'});
   if(chosen?.zone==='library'&&chosen.zoneVersion===versions.get(chosen))await ctx.g.move(chosen,e.destination,{ctrl:ctx.you,tapped:e.tapped});
   let rest=cards.filter(c=>c!==chosen&&c.zone==='library'&&c.zoneVersion===versions.get(c));
   if(e.rest==='bottom-random')M.shuffle(rest,ctx.g.rnd);else if(e.rest==='bottom-order'&&rest.length>1){const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:rest,min:rest.length,max:rest.length,prompt:'Order revealed cards for the bottom of your library',aiHint:{kind:'bottomOrder'}});if(!Array.isArray(answer)||answer.length!==rest.length||new Set(answer).size!==rest.length||answer.some(c=>!rest.includes(c)))throw Error('Invalid reveal-until bottom order');rest=answer;}
   for(const c of rest)await ctx.g.move(c,e.rest==='graveyard'?'graveyard':'library',e.rest==='graveyard'?{}:{toBottom:true});return true;
  }
  if(['exile-permission-v22','exile-cast-batch-v22','exile-selected-permission-v22'].includes(e.action)){
   const owners=e.who==='each-player'?ctx.g.players:e.who==='each-opponent'?ctx.g.players.filter(p=>p!==ctx.you):H.genericEffectSubjects(ctx,e.who??'you'),n=Math.max(0,Math.floor(H.genericAmount(e.n,ctx))),cards=[];
   for(const owner of owners)for(const c of n?owner?.library?.slice(-n).reverse()||[]:[]){const version=c.zoneVersion;await ctx.g.move(c,'exile');if(c.zone==='exile'&&c.zoneVersion===version+1)cards.push(c);}
   if(e.action==='exile-permission-v22'){grant(ctx,cards,e);return true;}
   const versions=new Map(cards.map(c=>[c,c.zoneVersion]));
   if(e.action==='exile-selected-permission-v22'){
    const answer=cards.length?await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:cards,min:1,max:1,prompt:'Choose one exiled card you may play',aiHint:{kind:'draw'}}):[];
    if(!Array.isArray(answer)||answer.length!==Math.min(1,cards.length)||answer.some(c=>!cards.includes(c)||c.zone!=='exile'||c.zoneVersion!==versions.get(c)))throw Error('Invalid exiled permission selection');grant(ctx,answer,{...e,max:null});return true;
   }
   let used=0;const max=e.max===null?cards.length:e.max;
   while(used<max){const available=cards.filter(c=>c.zone==='exile'&&c.zoneVersion===versions.get(c)),cast=await M.OracleV8PlayPermissions.castOne(ctx,available,{free:e.free,filter:e.filter},{target:H.genericTargetSpec});if(!cast)break;used++;}
   const remaining=cards.filter(c=>c.zone==='exile'&&c.zoneVersion===versions.get(c));M.shuffle(remaining,ctx.g.rnd);for(const c of remaining)await ctx.g.move(c,'library',{toBottom:true});return true;
  }
  if(e.action==='inspect-exile-v22'){
   const n=Math.max(0,Math.floor(H.genericAmount(e.n,ctx))),cards=n?ctx.you.library.slice(-n).reverse():[],versions=new Map(cards.map(c=>[c,c.zoneVersion])),spec=H.genericTargetSpec({...e.filter,zone:'library',controller:'any'},[],0,{...ctx.data,oracleX:ctx.x??ctx.so?.x??0,oracleSourceCapture:ctx.oracleSourceCapture});
   if(!ctx.you.isAI&&cards.length)await ctx.you.controller.decide(ctx.g,{type:'cardReveal',player:ctx.you,cards,kind:'look',private:true});
   const from=cards.filter(c=>spec.filter(ctx.g,c,ctx.you,ctx.src)),answer=from.length?await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:e.min,max:e.max,prompt:'You may exile a card from these cards',aiHint:{kind:'draw'}}):[];
   if(!Array.isArray(answer)||answer.length<Math.min(e.min,from.length)||answer.length>e.max||new Set(answer).size!==answer.length||answer.some(c=>!from.includes(c)||c.zone!=='library'||c.zoneVersion!==versions.get(c)))throw Error('Invalid inspected exile selection');
   const selected=[];for(const c of answer){await ctx.g.move(c,'exile');if(c.zone==='exile'&&c.zoneVersion===versions.get(c)+1)selected.push(c);}
   const rest=cards.filter(c=>!answer.includes(c)&&c.zone==='library'&&c.zoneVersion===versions.get(c));if(e.rest==='bottom-random')M.shuffle(rest,ctx.g.rnd);for(const c of rest)await ctx.g.move(c,e.rest==='hand'?'hand':'library',e.rest==='hand'?{}:{toBottom:true});
   if(e.duration==='immediate')await M.OracleV8PlayPermissions.castOne(ctx,selected,{free:e.free,playLand:!e.spellsOnly},{target:H.genericTargetSpec});else grant(ctx,selected,{...e,filter:null});return true;
  }
  if(e.action==='next-cast-entry-counter-v22'){
   const card=ctx.data.card,spell=ctx.data.so;if(card&&spell?.kind==='spell'&&ctx.g.stack.includes(spell)&&ctx.g.castDefinition(card,spell.castOpts).types.includes('Creature')){const r=card.meta.oracleNextCastEntryV22?.version===card.zoneVersion?card.meta.oracleNextCastEntryV22:{version:card.zoneVersion,counters:{}};r.counters[e.counter]=(r.counters[e.counter]||0)+e.n;card.meta.oracleNextCastEntryV22=r;}return true;
  }
  if(e.action!=='install-trigger-v8'||!e.layoutsV22)return false;
  const record={kind:'temporary-trigger-v22',expires:e.duration==='eot'?'eot':'untilTurnOf',whoTurn:ctx.you,source:ctx.src,controller:ctx.you};ctx.g.untilEffects.push(record);
  for(const event of [].concat(e.trigger.event)){
   const trigger=H.compileGenericTrigger({...e.trigger,event}),source=ctx.src,controller=ctx.you,sourceVersion=ctx.sourceZoneVersion??source.zoneVersion,sourceMeta=ctx.sourceMeta||source.meta;
   const view=Object.create(source);Object.defineProperties(view,{ctrl:{value:controller},zoneVersion:{value:sourceVersion},meta:{value:sourceMeta}});
   const row={on:event,once:e.once,expires:e.duration==='eot'?'eot':undefined,src:source,ctrl:controller,name:source.name+' — temporary trigger',targets:trigger.targets,opt:trigger.opt,
    oracleTemporaryRecordV22:record,
    filter:(g,data)=>{const matches=g.untilEffects.includes(record)&&(!e.fromHand||data.so?.castOpts?.from==='hand')&&(!trigger.filter||trigger.filter(g,view,data));if(matches&&e.controllerEventPlayer)row.ctrl=data.player;return matches;},
    prepareTargets:trigger.prepareTargets,
    run:next=>trigger.run({...next,you:e.controllerEventPlayer?next.data.player:controller,sourceZoneVersion:sourceVersion,sourceMeta})};ctx.g.delayed.push(row);
  }return true;
 }};V.handlers.push(handler);
 const installTemporary=M.OracleV8DelayedTriggers.install;M.OracleV8DelayedTriggers.install=(ctx,e,compile)=>e.layoutsV22?handler.effect(ctx,e):installTemporary(ctx,e,compile);
 const asEnters=G.move;
 G.move=async function(c,to,o={}){const receipt=c.meta.oracleNextCastEntryV22;if(to==='battlefield'&&c.zone==='stack'&&receipt?.version===c.zoneVersion)o={...o,additionalCounters:Object.fromEntries([...new Set([...Object.keys(o.additionalCounters||{}),...Object.keys(receipt.counters)])].map(key=>[key,(o.additionalCounters?.[key]||0)+(receipt.counters[key]||0)]))};if(c.meta.oracleExilePermissionV22&&to!=='exile')for(const key of ['oracleExilePermissionV22','playableBy','playableUntil','playableUntilOwnTurn','freePlay','anyColor','spellsOnly','playableCondition'])delete c.meta[key];return asEnters.call(this,c,to,o);};
 const hasPermission=G.hasExilePlayPermission;G.hasExilePlayPermission=function(p,c){return permissionActive(this,p,c)!==false&&hasPermission.call(this,p,c);};
 const paidCast=G.castSpell,land=G.playLand;
 async function consume(g,call,p,c,o,isSpell){const saved=c.meta?.oracleExilePermissionV22,version=c.zoneVersion,alt=o?.alt||o||{};if(saved&&c.zone==='exile'){if(!g.hasExilePlayPermission(p,c)||isSpell&&(!g.canCastTiming(p,c,alt)||alt.free&&!saved.record.free||alt.asThoughAnyColor&&!saved.record.anyColor))return false;if(isSpell&&saved.record.filter&&!H.genericTargetSpec(saved.record.filter,[],0).filter(g,{kind:'spell',card:c,ctrl:p,castOpts:alt,x:alt.x||0},p,saved.record.source))return false;}const result=await call.call(g,p,c,o);if(result&&saved&&(c.zone!=='exile'||c.zoneVersion!==version)){const key=c.iid+':'+version;if(!saved.record.used.includes(key))saved.record.used.push(key);}return result;}
 G.castSpell=function(p,c,o){return consume(this,paidCast,p,c,o,true);};G.playLand=function(p,c,o){return consume(this,land,p,c,o,false);};
 const emit=G.emit;G.emit=async function(name,data,...rest){if(name==='endStep')for(const p of this.players)for(const c of p.exile){const r=c.meta?.oracleExilePermissionV22?.record;if(r?.duration==='next-end-step'&&r.player===data.player)r.closed=true;}return emit.call(this,name,data,...rest);};
 M.OracleV22Layouts={converted,grant,permissionActive};
})();
