(function(M){
 'use strict';
 const H=M.OracleV20.helpers,G=M.Game.prototype;
 const lock=card=>({card,zone:card.zone,version:card.zoneVersion});
 const current=r=>r.card.zone===r.zone&&r.card.zoneVersion===r.version;
 const option=async(ctx,p,prompt,options)=>{const result=await p.controller.decide(ctx.g,{type:'chooseOption',prompt,options,aiHint:{kind:'optTrigger',src:ctx.src}});if(!options.some(o=>o.key===result))throw Error('Invalid v79 choice');return result;};
 const yes=(ctx,p=ctx.you,prompt=ctx.src.name)=>option(ctx,p,prompt,[{key:'yes',label:'Yes'},{key:'no',label:'No'}]).then(k=>k==='yes');
 const pick=async(ctx,from,min=0,max=1,p=ctx.you,prompt=ctx.src.name)=>{if(!from.length)return [];min=Math.min(min,from.length);max=Math.min(max,from.length);const rows=from.map(lock),selected=await p.controller.decide(ctx.g,{type:'chooseCards',from,min,max,prompt,aiHint:{kind:'bestCard',src:ctx.src}});if(!Array.isArray(selected)||selected.length<min||selected.length>max||new Set(selected).size!==selected.length||selected.some(c=>!rows.some(r=>r.card===c&&current(r))))throw Error('Invalid v79 card selection');return selected;};
 const token=(name,power,toughness,subtypes,colors,extra={})=>({name,cost:'',types:['Creature'],subtypes,super:[],power:String(power),toughness:String(toughness),colorsOverride:colors,...extra});
 const bottom=async(ctx,rows)=>{const remaining=rows.filter(current).map(r=>r.card);M.shuffle(remaining,ctx.g.rnd);for(const c of remaining)await ctx.g.move(c,'library',{toBottom:true});};
 const look=async(ctx,cards,p=ctx.you)=>{if(cards.length)await ctx.g.revealToHuman({cards,ctrl:p,kind:'look',includeLands:true});};
 const exile=async(ctx,cards,opts={})=>{const out=[];for(const c of cards){const r=lock(c);await ctx.g.move(c,'exile',opts);if(c.zone==='exile'&&c.zoneVersion===r.version+1)out.push(c);}return out;};
 const grant=(ctx,cards,opts={})=>{const permission=M.OracleV22Layouts.grant(ctx,cards,{duration:'persistent',spellsOnly:false,...opts});if(opts.anyColor)for(const card of cards)card.meta.spendAnyTypeV79={version:card.zoneVersion,player:ctx.you};return permission;};
 const follow=(ctx,targets,effects)=>ctx.g.queueTrigger({src:ctx.src,ctrl:ctx.you,data:ctx.data,name:'When you do',oracleReflexive:true,sourceZoneVersion:ctx.sourceZoneVersion,sourceMeta:ctx.sourceMeta,targets:H.genericTargetSpecs(targets,effects,ctx.data),run:next=>H.runGenericEffects(next,effects)});
 const rockAbilities=new WeakMap();
 const rock={name:'Rock',cost:'',types:['Artifact'],subtypes:['Equipment'],super:[],colorsOverride:[],equip:'{1}',oracle:"Equipped creature has '{1}, {T}, Sacrifice Rock: This creature deals 2 damage to any target.' Equip {1}",attachGrant(g,source,host){
  const key=host.iid+':'+host.zoneVersion+':'+source.zoneVersion;
  if(rockAbilities.get(source)?.key!==key){const ability=H.compileGenericAbility({kind:'generic-ability',cost:{mana:'{1}',tap:true,sacN:1,sacFilter:{what:'permanent',zone:'battlefield',controller:'you',v20:{kind:'rock-cost-v79',iid:source.iid,version:source.zoneVersion}}},targets:[{what:'any',zone:'battlefield',min:1,max:1}],effects:[{action:'damage',target:0,n:2}],optional:false});ability.label='Throw Rock — deal 2 damage';rockAbilities.set(source,{key,ability});}
  host.cur.extraAbilities.push(rockAbilities.get(source).ability);
 }};
 M.TOKENS.rockV79=M.tokenDefinitionForCreation({...rock,bomTokenKey:'rockV79'});
 M.TOKEN_IMG.Rock='661cbde4-9444-4259-b2cf-7c8f9814a071';
 const emit=G.emit;
 G.emit=async function(event,d,...rest){
  if(event==='cycled'&&M.OracleV8NameGroups.names(d.card).includes('Yidaro, Wandering Monster'))d.player.yidaroCyclesV79=(d.player.yidaroCyclesV79||0)+1;
  if(event==='dungeonCompleted'&&d.key==='tomb')d.player.completedTombV79=true;
  if(event==='lto'&&d.card.zone==='exile'&&d.card.meta.darigaazEggsV79===d.card.zoneVersion){delete d.card.meta.darigaazEggsV79;this.addCounters(d.card,'egg',3,false,d.snap.ctrl);}
  return emit.call(this,event,d,...rest);
 };

 // Nahiri grants an optional alternative cost only to Equipment spells.
 // The ordinary V22 grant continues to enumerate paid spells and land plays.
 const S=M.StarterCasting,prior={offers:S.offers,allowed:S.allowed,prepare:S.prepare,validate:S.validate,commit:S.commit};
 const nahiriActive=(g,p,c)=>{const r=c.meta.nahiriPermissionV79;return c.zone==='exile'&&r?.version===c.zoneVersion&&r.turn===g.turnNo&&r.player===p&&c.owner.exile.includes(c)&&g.hasExilePlayPermission(p,c);};
 const nahiriOffers=(g,p)=>g.players.flatMap(owner=>owner.exile).filter(c=>nahiriActive(g,p,c)).flatMap(card=>{
  const base={starterPermission:'nahiri-v79',starterCardVersion:card.zoneVersion,free:true,consumeExilePermission:true,label:'Nahiri — cast Equipment without paying its mana cost'};
  return M.VN.castVariants(g,card,base).flatMap(a=>card.def.oraclePrototypeV10?[a,{...a,oraclePrototypeV10:true}]:[a]).filter(a=>!g.castHasType(card,a,'Land')&&g.castSubtypesV16(card,a).includes('Equipment')).map(alt=>({card,from:'exile',alt}));
 });
 const nahiriAllowed=(g,p,c,input)=>{const a=M.oracleAdditionalCastBaseV65(g,p,c,input);if(!a||!nahiriActive(g,p,c)||!g.canCastTiming(p,c,a))return false;return nahiriOffers(g,p).some(r=>r.card===c&&Object.keys(r.alt).every(k=>JSON.stringify(r.alt[k])===JSON.stringify(a[k]))&&Object.keys(a).every(k=>k==='from'?a[k]==='exile':k==='xVal'?a[k]===0:['_kicked','_kickerX','buybackPaid'].includes(k)?true:JSON.stringify(a[k])===JSON.stringify(r.alt[k])));};
 S.offers=(g,p)=>prior.offers(g,p).concat(nahiriOffers(g,p));
 S.allowed=(g,p,c,a)=>a.starterPermission==='nahiri-v79'?nahiriAllowed(g,p,c,a):prior.allowed(g,p,c,a);
 S.prepare=(ctx,paid)=>ctx.so.castOpts.starterPermission==='nahiri-v79'?Promise.resolve(nahiriAllowed(ctx.g,ctx.you,ctx.src,ctx.so.castOpts)):prior.prepare(ctx,paid);
 S.validate=ctx=>ctx.so.castOpts.starterPermission==='nahiri-v79'?nahiriAllowed(ctx.g,ctx.you,ctx.src,ctx.so.castOpts):prior.validate(ctx);
 S.commit=ctx=>ctx.so.castOpts.starterPermission==='nahiri-v79'?undefined:prior.commit(ctx);
 const faces=M.OracleV8Faces.castChoiceAllowed;M.OracleV8Faces.castChoiceAllowed=(g,p,c,a)=>a.starterPermission==='nahiri-v79'?nahiriAllowed(g,p,c,a):faces(g,p,c,a);
 const cast=G.castSpell;G.castSpell=async function(p,c,opts={}){const a=opts.alt||opts;if(a.starterPermission!=='nahiri-v79')return cast.call(this,p,c,opts);if(!nahiriAllowed(this,p,c,a))return false;const permission=c.meta.oracleExilePermissionV22?.record;if(!permission)return false;const original=permission.free;permission.free=true;try{return await cast.call(this,p,c,opts);}finally{permission.free=original;}};
 // Current Oracle says any type, which includes paying {C} with colored mana.
 const spellCost=G.spellCost;G.spellCost=function(p,c,a={}){const cost=spellCost.call(this,p,c,a),r=c.meta.spendAnyTypeV79;if(a.asThoughAnyColor&&c.zone==='exile'&&r?.version===c.zoneVersion&&r.player===p&&this.hasExilePlayPermission(p,c))return {...cost,pips:cost.pips.map(pip=>['C','W','U','B','R','G',...pip.filter(k=>k==='PHY'||k==='TWO')])};return cost;};
 M.OracleV20.handlers.unshift({
  compile(op,script,entry,h){
   if(op.kind==='legend-rule-v79'&&op.mode==='darigaaz-replacement'){script.darigaazV79=true;return true;}
   if(op.kind==='generic-trigger'&&op.testV79){const t=H.compileGenericTrigger(op),prior=t.filter;t.filter=(g,s,d)=>{
    if(prior&&!prior(g,s,d))return false;
    switch(op.testV79){
     case 'equipped':return g.bf().some(c=>c.hasSub('Equipment')&&c.attachedTo===d.card.iid);
     case 'god-attack':return(d.attackers||[]).some(c=>c.hasSub('God'));
     case 'god-dies':return !!d.snap&&(d.snap.subtypes.includes('God')||d.snap.changeling);
     case 'sea-from-hand':return (d.so?.castOpts?.from||d.card.castMeta?.from)==='hand'&&(g.castChangelingV16(d.card,d.so?.castOpts||{})||['Kraken','Leviathan','Octopus','Serpent'].some(type=>g.castSubtypesV16(d.card,d.so?.castOpts||{}).includes(type)));
     case 'foreign-spell':return d.card.owner!==d.player;
     case 'creature-hit-opponent':return d.player!==s.ctrl&&d.card.is('Creature');
     default:throw Error('Unknown v79 trigger filter');
    }
   };h.triggers.push(t);return true;}
   return false;
  },
  condition(g,s,c,p){if(c.kind==='tomb-incomplete-v79')return !p.completedTombV79;if(c.kind==='egg-exile-v79')return s.zone==='exile'&&(s.counters.egg||0)>0;},
  target(g,c,p,s,f){if(f.kind==='rock-cost-v79')return c.iid===f.iid&&c.zoneVersion===f.version;},
  zoneReplacements(g,c,to,snap){if(to==='graveyard'&&c.zone==='battlefield'&&snap?.types.includes('Creature')&&snap.def.darigaazV79&&!snap.abilitiesDisabled)return [{key:'darigaaz-v79:'+c.iid+':'+c.zoneVersion,label:'Exile Darigaaz with three egg counters',run:async()=>{c.meta.darigaazEggsV79=c.zoneVersion+1;return {toZone:'exile'};}}];return [];},
  async effect(ctx,e){
   if(e.action!=='common-effects-v79')return false;
   const {g,you:p,src:s}=ctx,subject=n=>H.genericEffectSubjects(ctx,n)[0],c=subject(0);
   switch(e.mode){
    case 'green':{const votes=await M.VN.vote(ctx,[{key:'profit',label:'Profit — two Treasures'},{key:'security',label:'Security — +1/+1 counters'}]),profit=votes.filter(r=>r.key==='profit').length,security=votes.filter(r=>r.key==='security').length;await g.makeTokens(M.TOKENS.treasure,p,{n:profit*2});for(const card of g.creatures(p))g.addCounters(card,'+1/+1',security,false,p);break;}
    case 'niv':{const pairs=new Set(g.bf().filter(c=>c.ctrl===p&&c.colors.length===2).map(c=>c.colors.slice().sort().join(''))),n=pairs.size;await H.runGenericEffects(ctx,[{action:'damage',target:0,n},{action:'draw',who:1,n},{action:'gain-life',who:'you',n}]);break;}
    case 'yidaro':{const present=s.zone==='graveyard'&&s.zoneVersion===ctx.sourceZoneVersion;if((p.yidaroCyclesV79||0)>=4){if(present)await g.putPermanentOntoBattlefield(s,p);}else{if(present)await g.move(s,'library');M.shuffle(p.library,g.rnd);}break;}
    case 'toggo':await g.makeTokens(M.TOKENS.rockV79,p);break;
    case 'dyadrine':{const from=g.creatures(p).filter(c=>(c.counters['+1/+1']||0)>0);if(from.length<2||!await yes(ctx,p,'Remove a +1/+1 counter from each of two creatures?'))break;const chosen=await pick(ctx,from,2,2,p,'Choose two creatures to remove counters from');if(chosen.length!==2||chosen.some(c=>c.ctrl!==p||(c.counters['+1/+1']||0)<1))break;for(const c of chosen)g.removeCounters(c,'+1/+1',1);await g.draw(p,1,s);await g.makeTokens(token('Robot',2,2,['Robot'],[],{types:['Artifact','Creature']}),p);break;}
    case 'kylox':{const from=g.creatures(p).filter(c=>(c!==s||!H.sameBattlefieldSource(ctx))&&g.canSacrifice(c)),selected=await pick(ctx,from,0,from.length,p,'Sacrifice any number of other creatures'),sacrificed=selected.filter(c=>c.ctrl===p&&g.canSacrifice(c)),n=Math.max(0,sacrificed.reduce((sum,c)=>sum+c.power,0));await g.sacrificeMany(p,sacrificed);const rows=(await exile(ctx,n?p.library.slice(-n).reverse():[])).map(lock);while(rows.some(current)){const cards=rows.filter(current).map(r=>r.card);if(!await M.BOM.immediate(ctx,cards,{free:true,filter:(card,game,so)=>game.isInstantSorcerySpell(so)}))break;}break;}
    case 'darigaaz':if(s.zone==='exile'&&s.zoneVersion===ctx.sourceZoneVersion&&(s.counters.egg||0)>0){g.removeCounters(s,'egg',1);if(!(s.counters.egg>0))await g.putPermanentOntoBattlefield(s,p);}break;
    case 'acererak-enter':if(!p.completedTombV79){if(H.sameBattlefieldSource(ctx))await g.move(s,'hand');await g.venture(p,s);}break;
    case 'acererak-attack':for(const q of g.apnapFrom(g.turnPlayer).filter(q=>q!==p&&!q.lost)){const [chosen]=await pick(ctx,g.creatures(q).filter(c=>g.canSacrifice(c)),0,1,q,'Sacrifice a creature or let a Zombie be created');if(!chosen||!await g.sacrifice(q,chosen))await g.makeTokens(token('Zombie',2,2,['Zombie'],['B']),p);}break;
    case 'nahiri':{const top=p.library.at(-1);if(top){const cards=await exile(ctx,[top]);grant(ctx,cards,{duration:'eot'});for(const c of cards)c.meta.nahiriPermissionV79={version:c.zoneVersion,turn:g.turnNo,player:p};}break;}
    case 'black-cat':{if(!c)break;const rows=c.library.slice(-9).reverse().map(lock);await look(ctx,rows.map(r=>r.card));const selected=await pick(ctx,rows.filter(current).map(r=>r.card),2,2,p,'Choose two cards to exile face down'),cards=await exile(ctx,selected,{exileFaceDown:true,exileLookers:[p.idx]});grant(ctx,cards,{anyColor:true});await bottom(ctx,rows);break;}
    case 'etrata':{if(!c)break;const player=ctx.oracleSourceCapture?.eventPlayer||ctx.data.player,card=(await exile(ctx,[c]))[0];if(card)g.addCounters(card,'hit',1,false,p);if(player&&!player.lost&&player.exile.filter(c=>(c.counters.hit||0)>0).length>=3)await g.playerLoses(player,'three cards exiled with hit counters');const owner=s.owner;if(H.sameBattlefieldSource(ctx))await g.move(s,'library');M.shuffle(owner.library,g.rnd);break;}
    case 'iroh':{const opponent=c,permanent=subject(1);if(opponent&&permanent&&await yes(ctx,p,'Give this permanent to the chosen opponent?')){M.OracleV8Control.gain(g,permanent,opponent,{temporary:false});g.recalc();if(permanent.ctrl===opponent)follow(ctx,[],[{action:'common-effects-v79',mode:'iroh-ally'}]);}break;}
    case 'iroh-ally':{const made=await g.makeTokens(token('Ally',1,1,['Ally'],['W']),p),n=g.bf().filter(c=>c.owner===p&&c.ctrl!==p).length;for(const card of made)g.addCounters(card,'+1/+1',n,false,p);break;}
    case 'borborygmos':{await g.draw(p,1,s);const chosen=await pick(ctx,p.hand.filter(c=>c.is('Land')),0,p.hand.length,p,'Discard any number of land cards'),before=p.turnState.discardedN||0;await g.discard(p,chosen);const n=(p.turnState.discardedN||0)-before;if(n>0)follow(ctx,[{what:'creature',zone:'battlefield',controller:'any',min:1,max:1}],[{action:'damage',target:0,n:n*2}]);break;}
    case 'borborygmos-library':{if(!H.sameBattlefieldSource(ctx))break;const version=s.zoneVersion;await g.move(s,'library');if(s.zone==='library'&&s.zoneVersion===version+1){const lib=s.owner.library;lib.splice(lib.indexOf(s),1);lib.splice(Math.max(0,lib.length-2),0,s);}break;}
    case 'iron-man':{await g.makeTokens(M.TOKENS.treasure,p);const [card]=await pick(ctx,g.bf().filter(c=>c.ctrl===p&&c.is('Artifact')&&!c.is('Creature')&&g.canSacrifice(c)),0,1,p,'Sacrifice a noncreature artifact');if(card){const n=card.mv+1;if(await g.sacrifice(p,card))await M.OracleV8Library.search(ctx,{n:1,filter:{what:'artifact',zone:'graveyard',stat:'mv',comparison:'equal',threshold:n},reveal:true,placements:[{n:'all',destination:'battlefield',tapped:true}]},{target:H.genericTargetSpec,amount:H.genericAmount},p,p,{});}break;}
    case 'experience':await H.runGenericEffect(ctx,{action:'common-effects-v68',mode:'native-experience'});break;
    case 'widow':{const opponent=ctx.data.player;let nonland=null;while(opponent.library.length){const card=opponent.library.at(-1),isNonland=!card.is('Land'),cards=await exile(ctx,[card]);if(isNonland&&cards.length){nonland=cards[0];break;}if(card.zone==='library')break;}let counter=false;if(H.sameBattlefieldSource(ctx)&&g.canPutCountersV18(s,'+1/+1')&&await yes(ctx,p,'Put a +1/+1 counter on Black Widow?')){g.addCounters(s,'+1/+1',1,false,p);counter=true;}if(!counter&&nonland)grant(ctx,[nonland],{duration:'eot',spellsOnly:true,anyColor:true});break;}
    case 'hidetsugu-enter':{await g.draw(p,3,s);const selected=await pick(ctx,p.hand.slice(),2,2,p,'Choose two cards for the top of your library'),order=await pick(ctx,selected,selected.length,selected.length,p,'Order these cards, top first');for(const card of order.slice().reverse())await g.move(card,'library');break;}
    case 'hidetsugu-dies':{const top=p.library.at(-1);if(!top)break;const card=(await exile(ctx,[top]))[0];if(!card)break;const mv=card.mv;if(c)await g.loseLife(c,mv,s);if(card.zone==='exile'&&(card.is('Instant')||card.is('Sorcery')))await M.BOM.immediate(ctx,[card],{free:true});break;}
    case 'kiora':{const n=ctx.oracleSourceCapture?.eventSpellMvV10??g.stackSpellManaValue(ctx.data.so),rows=(n?p.library.slice(-n).reverse():[]).map(lock);await look(ctx,rows.map(r=>r.card));await M.BOM.immediate(ctx,rows.filter(current).map(r=>r.card),{free:true,filter:(card,game,so)=>game.stackSpellManaValue(so)<n});await bottom(ctx,rows);break;}
    case 'gonti-cast':if(!ctx.data.player.lost)await g.makeTokens(M.TOKENS.treasure,ctx.data.player);break;
    case 'gonti-damage':{const attacker=ctx.data.card,borrower=attacker.zone==='battlefield'&&attacker.zoneVersion===ctx.eventCardZoneVersion?attacker.ctrl:ctx.oracleSourceCapture?.eventController,opponent=ctx.data.player,top=opponent.library.at(-1);if(!borrower||borrower.lost||!top)break;await look(ctx,[top],borrower);const cards=await exile(ctx,[top],{exileFaceDown:true,exileLookers:[borrower.idx]});grant({...ctx,you:borrower},cards,{anyColor:true});break;}
    case 'shilgengar-blood':{const row=ctx.sacd?.[0],n=row&&(row.subtypes?.includes('Angel')||row.changeling)?Math.max(0,row.toughness):1;await g.makeTokens(M.TOKENS.blood,p,{n});break;}
    case 'shilgengar-return':{const rows=p.graveyard.filter(c=>c.is('Creature')).map(lock);await g.withBattlefieldEntryBatch(async()=>{for(const r of rows)if(current(r))await g.putPermanentOntoBattlefield(r.card,p,{additionalCounters:{finality:1},additionalCounterBy:p,entryAnimation:{types:[],subtypes:['Vampire'],retainTypes:true,retainAllSubtypes:true,keywords:[],temporary:false}});});break;}
    default:return false;
   }
   return true;
  }
 });
})(globalThis.MTG||={});
