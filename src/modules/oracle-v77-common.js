(function(M){
 'use strict';
 const H=M.OracleV20.helpers,G=M.Game.prototype;
 const live=(c,v)=>c?.zone==='battlefield'&&c.zoneVersion===v;
 const colors=(c,snap)=>(snap?.colors||c.colors||[]);
 const choose=async(ctx,p,from,min,max,prompt)=>{if(!from.length)return [];const versions=new Map(from.map(c=>[c,c.zoneVersion])),picked=await p.controller.decide(ctx.g,{type:'chooseCards',from,min,max,prompt,aiHint:{kind:'bestCard'}});if(!Array.isArray(picked)||picked.length<min||picked.length>max||new Set(picked).size!==picked.length||picked.some(c=>!from.includes(c)||c.zoneVersion!==versions.get(c)))throw Error('Invalid v77 choice');return picked;};
 const yes=async(ctx,prompt)=>{const choice=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',options:[{key:'yes',label:'Yes'},{key:'no',label:'No'}],prompt,aiHint:{kind:'optTrigger',src:ctx.src}});if(!['yes','no'].includes(choice))throw Error('Invalid v77 option');return choice==='yes';};
 const types=p=>new Set(p.graveyard.flatMap(c=>c.def.types||[]).map(type=>type==='Tribal'?'Kindred':type)).size;
 const hasEmbalm=c=>!!c.def.eternalize||!!c.def.oracleEternalize||!!c.def.gyAbility?.oracleEternalize||/^(Embalm|Eternalize)(?: |$)/.test(c.def.gyAbility?.label||'')||(c.def.oracleImplementation||[]).some(o=>['mechanic-embalm','mechanic-eternalize'].includes(o.kind));
 const sources=g=>{const rows=new Map(g.bf().map(card=>[card.iid,{card,snap:g.snapshot(card,false)}]));for(const row of g._simultaneousLeaveSources||[])rows.set(row.card.iid,row);return [...rows.values()].filter(r=>(r.snap.def||r.card.def).sanctifierV77&&!r.snap.abilitiesDisabled);};
 const emit=G.emit;G.emit=async function(event,d,...args){
  if(event==='etb'&&d.card.faceDown){const p=d.card.ctrl;p.faceEventTurnV77=this.turnNo;}
  if(event==='turnedFaceUp'&&d.player)d.player.faceEventTurnV77=this.turnNo;
  return emit.call(this,event,d,...args);
 };
 const recalc=G.recalc;G.recalc=function(...args){this.untilEffects=this.untilEffects.filter(r=>!r.tidebinderV77||M.OracleV8Untap.sourceValid(this,r.tidebinderV77.duration));return recalc.apply(this,args);};
 M.OracleV20.handlers.push({
  compile(op,script,entry,h){
   if(M.OracleV77Choices?.compile(op,script,h))return true;
   if(op.kind==='cruelties-alone-v77'){h.statics.push({apply:(g,s)=>{(s.cur.attackGroupRestrictions||=[]).push(cards=>cards.length===1);}});return true;}
   if(op.kind==='sanctifier-replacement-v77'){script.sanctifierV77=true;return true;}
   if(op.kind==='qarsi-mana-v77'){
    const mana=h.compileGenericMana({kind:'mana-source',activationCost:{tap:true},produce:[{C:1}]},'qarsi-v77');
    mana.manual=true;mana.restrictAbilities=true;mana.restrict=(g,a)=>!!a?.card&&(!a.isAbility&&!a.isSpecialAction&&!a.turnFaceUp&&!a.foretellAction&&!!a.castOpts?.faceDownCast&&g.castHasType(a.card,a.castOpts,'Creature')||a.turnFaceUp&&(['morph','megamorph'].includes(a.faceUpKind)||a.faceUpKind==='mana cost'&&(a.card.meta.faceDownKind||'manifest')==='manifest'));
    h.mana.push(mana);return true;
   }
   if(op.kind==='generic-trigger'&&op.testV77){const trigger=h.compileGenericTrigger(op),prior=trigger.filter;trigger.filter=(g,s,d)=>{
    if(!prior(g,s,d))return false;
    if(op.testV77==='attacking-player')return s.attacking instanceof M.Player;
    if(op.testV77==='food-sacrificed')return d.player===s.ctrl&&(d.snap?.subtypes||[]).includes('Food');
    if(op.testV77==='embalm-eternalize')return !!d.ability&&(!!d.ability.oracleEternalize||!!d.ability.embalmExtraV73||/^(Embalm|Eternalize)(?: |$)/.test(d.ability.label||''));
    throw Error('Unknown v77 trigger filter');
   };h.triggers.push(trigger);return true;}
   return false;
  },
  condition(g,s,c,p){if(c.kind==='delirium-v77')return types(p)>=4;},
  target(g,c,p,s,v,evidence){
   if(v.kind==='different-first-v77'){const first=evidence?.oracleContext?.targets?.[0]||evidence?.selectedTargets?.[0];return !first||c!==first;}
   if(v.kind==='attached-permanent-v77'){const host=g.byIid(c.attachedTo);return host?.zone==='battlefield'&&!host.phasedOut;}
   if(v.kind==='blocked-by-source-v77')return (c.blockedBy||[]).includes(s);
   if(v.kind==='embalm-creature-v77')return hasEmbalm(c);
  },
  zoneReplacements(g,c,to,snap){if(to!=='graveyard'||!colors(c,snap).some(color=>color==='B'||color==='R'))return [];return sources(g).map(({card})=>({key:'sanctifierV77:'+card.iid,label:'Exile the black or red card',run:async()=>({toZone:'exile'})}));},
  async effect(ctx,e){
   if(e.action!=='common-effects-v77')return false;
   if(await M.OracleV77Choices?.effect(ctx,e))return true;
   const {g,src:s,you:p}=ctx,c=H.genericEffectSubjects(ctx,e.target??0)[0];
   switch(e.mode){
    case 'cruelties':{const defender=ctx.oracleSourceCapture?.defendingPlayer;if(defender instanceof M.Player)await H.runGenericEffect({...ctx,targets:[defender]},{action:'set-life-v9',who:0,n:1});if(H.sameBattlefieldSource(ctx))g.untilEffects.push({kind:'oracleNoCombatAssignmentV19',iid:s.iid,zoneVersion:s.zoneVersion,expires:'combat'});break;}
    case 'bookworm':if(await yes(ctx,'Draw a card?')){await g.draw(p,1,s);if(p.faceEventTurnV77!==g.turnNo)await H.runGenericEffect(ctx,{action:'discard',who:'you',n:1});}break;
    case 'plague-sacrifice':await g.sacrificeMany(p,g.creatures(p).filter(card=>card!==s||card.zoneVersion!==ctx.sourceZoneVersion));break;
    case 'plague-return':if(c instanceof M.Player){const version=ctx.sourceZoneVersion+1;g.delayed.push({on:'upkeep',once:true,src:s,ctrl:p,name:'Return Plague Reaver',filter:(game,d)=>d.player===c,run:async()=>{if(s.zone==='graveyard'&&s.zoneVersion===version&&!c.lost)await g.putPermanentOntoBattlefield(s,c);}});}break;
    case 'sanctifier-graves':await g.withGraveyardEntryBatch(async()=>{for(const card of g.players.flatMap(q=>q.graveyard).filter(card=>colors(card).some(color=>color==='B'||color==='R')))await g.move(card,'exile');});break;
    case 'simic-aura':if(c){const host=g.byIid(c.attachedTo),auraVersion=c.zoneVersion,hostVersion=host?.zoneVersion;if(host?.zone==='battlefield'){const from=g.bf().filter(card=>card!==host&&card.ctrl===host.ctrl&&g.legalEntryAttachment(c,card,c.ctrl)),picked=(await choose(ctx,p,from,Math.min(1,from.length),Math.min(1,from.length),'Choose another permanent for the Aura'))[0];if(picked&&live(c,auraVersion)&&live(host,hostVersion)&&c.attachedTo===host.iid&&picked.ctrl===host.ctrl&&g.legalEntryAttachment(c,picked,c.ctrl))await g.attach(c,picked);}}break;
    case 'hero-detective':if(H.sameBattlefieldSource(ctx))g.addOracleAnimation(s,{types:[],subtypes:['Human','Detective'],retainTypes:true,replaceCreatureSubtypes:true,retainAllSubtypes:false,power:4,toughness:4,keywords:['vigilance']});break;
    case 'hero-mileva':if(H.sameBattlefieldSource(ctx)&&s.hasSub('Detective')){const version=s.zoneVersion,timestamp=g.nextOracleTimestamp(),grant={kind:'mileva-static-v77'};g.addOracleAnimation(s,{types:['Creature'],subtypes:[],retainTypes:true,retainAllSubtypes:true,addSuperV20:['Legendary'],power:5,toughness:5,keywords:[]});g.untilEffects.push({kind:'milevaV77',iid:s.iid,zoneVersion:version,expires:'object',timestamp,oracleLayerTimestamp:timestamp,apply:(game,bf)=>{if(!bf.includes(s)||s.zoneVersion!==version)return;s.cur.name='Mileva, the Stalwart';if(s.phasedOut||(s.cur.oracleAbilityLossTimestamp??-Infinity)>timestamp)return;s.cur.extraStaticAbilitiesV66.push(grant);for(const other of bf)if(other!==s&&other.ctrl===s.ctrl&&other.is('Creature'))other.cur.kw.add('indestructible');}});g.recalc();}break;
    case 'tidebinder':if(c&&g.stack.includes(c)){const target=c.srcCard||c.ctx?.src,version=c.ctx?.sourceZoneVersion??target?.zoneVersion,duration=M.OracleV8Untap.capture(ctx,'battlefield'),qualifies=live(target,version)&&!target.phasedOut&&['Artifact','Creature','Planeswalker'].some(t=>target.is(t));if(await g.counterStackObject(c,{source:s,controller:p})&&qualifies&&live(target,version)&&!target.phasedOut&&M.OracleV8Untap.sourceValid(g,duration))M.OracleV8AbilityLoss.add(g,[target],{temporary:false,keywords:[],tidebinderV77:{duration}});}break;
    case 'merchant-search':if(await yes(ctx,'Search for a basic land?')&&g.canSearchLibrary?.(p,p)!==false){await g.emit('searchedLibrary',{player:p});const from=(g.searchableLibrary?g.searchableLibrary(p,p):p.library).filter(card=>card.is('Land')&&(card.cur?.super||card.def.super||[]).includes('Basic')),picked=(await choose(ctx,p,from,0,1,'Search for a basic land card'))[0];if(picked){await g.revealToHuman({cards:[picked],ctrl:p,kind:'reveal'});await g.putPermanentOntoBattlefield(picked,p,{tapped:true});}if(H.sameBattlefieldSource(ctx))await g.move(s,'library',{toBottom:true});M.shuffle(p.library,g.rnd);}break;
    case 'gatekeeper':if(c){const controller=c.ctrl,version=c.zoneVersion;await g.move(c,'exile');if(controller===p){if(c.zone==='exile'&&c.zoneVersion===version+1)await g.putPermanentOntoBattlefield(c,c.owner,{tapped:true});}else if(!controller.lost)await H.runGenericEffect({...ctx,you:controller},{action:'token-inline',who:'you',n:1,token:{name:'Detective',types:['Creature'],subtypes:['Detective'],power:2,toughness:2,colors:['W','U'],keywords:[]}});}break;
    case 'vizier-search':await M.OracleV8Library.search(ctx,{n:1,filter:{what:'creature',zone:'graveyard',v20:{kind:'embalm-creature-v77'}},reveal:true,optionalSearch:true,placements:[{n:'all',destination:'graveyard'}]},{target:H.genericTargetSpec,amount:H.genericAmount},p,p,{});break;
    default:throw Error('Unknown v77 effect '+e.mode);
   }
   return true;
  }
 });
})(globalThis.MTG||={});
