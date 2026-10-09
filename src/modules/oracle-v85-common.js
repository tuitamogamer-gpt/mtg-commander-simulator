(function(M){
 'use strict';
 const H=M.OracleV20.helpers,G=M.Game.prototype;
 const fx=(mode,extra={})=>({action:'common-effects-v85',mode,...extra});
 const creature={what:'creature',zone:'battlefield',controller:'any',min:1,max:1};
 const opponent={what:'player',zone:'player',controller:'opponent',min:1,max:1};
 const lock=card=>({card,zone:card.zone,version:card.zoneVersion});
 const current=r=>r.card.zone===r.zone&&r.card.zoneVersion===r.version;
 const live=(card,version)=>card?.zone==='battlefield'&&!card.phasedOut&&card.zoneVersion===version;
 const same=ctx=>H.sameBattlefieldSource(ctx);
 const option=async(ctx,options,p=ctx.you,prompt=ctx.src.name)=>{const answer=await p.controller.decide(ctx.g,{type:'chooseOption',options,prompt,aiHint:{kind:'optTrigger',src:ctx.src}});if(!options.some(o=>o.key===answer))throw Error('Invalid v85 option');return answer;};
 const yes=(ctx,prompt=ctx.src.name,p=ctx.you)=>option(ctx,[{key:'yes',label:'Yes'},{key:'no',label:'No'}],p,prompt).then(k=>k==='yes');
 const pick=async(ctx,from,min=0,max=1,p=ctx.you,prompt=ctx.src.name)=>{if(!from.length)return [];min=Math.min(min,from.length);max=Math.min(max,from.length);const rows=from.map(lock),answer=await p.controller.decide(ctx.g,{type:'chooseCards',from,min,max,prompt,aiHint:{kind:'bestCard',src:ctx.src}});if(!Array.isArray(answer)||answer.length<min||answer.length>max||new Set(answer).size!==answer.length||answer.some(c=>!rows.some(r=>r.card===c&&current(r))))throw Error('Invalid v85 card selection');return answer;};
 const token=(name,power,toughness,subtypes,colors,extra={})=>({name,cost:'',types:['Creature'],subtypes,super:[],power:String(power),toughness:String(toughness),colorsOverride:colors,...extra});
 const look=(ctx,cards,p=ctx.you,kind='look')=>cards.length?ctx.g.revealToHuman({cards,ctrl:p,kind,includeLands:true}):Promise.resolve();
 const exile=async(ctx,cards,opts={})=>{const out=[];for(const card of cards){const version=card.zoneVersion;await ctx.g.move(card,'exile',opts);if(card.zone==='exile'&&card.zoneVersion===version+1)out.push(card);}return out;};
 const grant=(ctx,cards,opts={})=>{M.OracleV22Layouts.grant(ctx,cards,{duration:'persistent',spellsOnly:false,...opts});if(opts.anyColor)for(const card of cards)card.meta.spendAnyTypeV79={version:card.zoneVersion,player:ctx.you};};
 const bottom=async(ctx,rows)=>{const cards=rows.filter(current).map(r=>r.card);M.shuffle(cards,ctx.g.rnd);for(const card of cards)await ctx.g.move(card,'library',{toBottom:true});};
 const pay=async(ctx,mana,prompt)=>{const cost=M.parseCost(mana);return ctx.g.canPayMana(ctx.you,cost,null)&&await yes(ctx,prompt||'Pay '+mana+'?')&&await ctx.g.payMana(ctx.you,cost,null);};
 const saddleRows=ctx=>(ctx.sourceMeta?.saddleMembersV48||ctx.src.meta.saddleMembersV48||[]).filter(r=>r.turn===ctx.g.turnNo&&r.version===ctx.sourceZoneVersion).map(r=>({card:r.card,zone:'battlefield',version:r.memberVersion}));
 const saddleCards=(ctx,rows=saddleRows(ctx))=>[...new Set(rows.filter(r=>current(r)&&!r.card.phasedOut&&r.card.is('Creature')).map(r=>r.card))];
 const delayed=(ctx,on,rows,run)=>ctx.g.delayed.push({on,once:true,src:ctx.src,ctrl:ctx.you,name:ctx.src.name+' delayed effect',run:next=>run(next,rows.filter(current))});
 const attacking=async(ctx,card)=>ctx.g.combat&&ctx.g.phase==='combat'&&ctx.g.turnPlayer===ctx.you?ctx.g.chooseAttackingDestination(ctx.you,null,card,ctx.src.name):null;
 const copyAttacking=async(ctx,definition)=>ctx.g.copyPermanentToken({def:definition},ctx.you,{tapped:true,chooseAttacking:(game,card)=>attacking(ctx,card)});
 const zonesources=(g,key)=>{const rows=new Map(g.bf().map(card=>[card.iid,{card,snap:g.snapshot(card,false)}]));for(const row of g._simultaneousLeaveSources||[])rows.set(row.card.iid,row);return [...rows.values()].filter(r=>(r.snap.def||r.card.def)[key]&&!r.snap.abilitiesDisabled);};
 const eventDefinition=ctx=>{const card=ctx.oracleSourceCapture?.eventCard||ctx.data.card,version=ctx.eventCardZoneVersion,snapshot=card.battlefieldLKI?.get(version);return card.zone==='battlefield'&&card.zoneVersion===version?M.OracleV8Faces.copyTokenDefinition(card):M.OracleV8Faces.copyTokenDefinition({def:snapshot?.def||ctx.data.copyDefinitionV85,oracleFaces:snapshot?.oracleFaces,oracleFace:snapshot?.oracleFace});};
 const healedBatches=new WeakMap();
 const healEarlierDamage=(g,d,s)=>{if(d.batch){let seen=healedBatches.get(d.batch);if(!seen)healedBatches.set(d.batch,seen=new Set());const key=s.iid+':'+s.zoneVersion;if(seen.has(key))return d.n;seen.add(key);}s.damage=0;s.deathtouched=false;return d.n;};
 const recordDamage=G.recordDamageResult;
 G.recordDamageResult=function(src,target,n,opts){
  if(src&&n>0){const snap=src._oracleDamageSnapshot||opts?._damageBatch?.snapshots?.get(src),version=snap?.zoneVersion??src.zoneVersion;
   if(src.zoneVersion===version){if(target instanceof M.CardInst&&target.is('Creature')&&(target.iid!==src.iid||target.zoneVersion!==version))src.meta.wolverineDamageV85={turn:this.turnNo,version};
    if(opts?.combat&&target instanceof M.Player){let r=src.meta.combatPlayersV85;if(!r||r.turn!==this.turnNo||r.version!==version)r=src.meta.combatPlayersV85={turn:this.turnNo,version,players:[]};if(!r.players.includes(target.idx))r.players.push(target.idx);}
   }
  }
  return recordDamage.call(this,src,target,n,opts);
 };
 const emit=G.emit;
 G.emit=async function(event,d,...args){
  if(event==='lto'&&d.to==='exile'&&d.card.meta.nemataExileV85?.version===d.card.zoneVersion){const r=d.card.meta.nemataExileV85;delete d.card.meta.nemataExileV85;this.queueTrigger({src:r.source,ctrl:r.player,name:'Nemata — create a Saproling',oracleReflexive:true,sourceZoneVersion:r.sourceVersion,sourceMeta:r.sourceMeta,run:ctx=>ctx.g.makeTokens(token('Saproling',1,1,['Saproling'],['G']),ctx.you)});}
  return emit.call(this,event,d,...args);
 };

 // Torgaar uses the same announced, reserved additional-cost plan as the
 // aggregate-cost engine. Its reduction is locked before mana is paid.
 const discounts=new WeakMap(),D=M.OracleV24Spells;
 const previewDiscount=D.previewDiscount,prepareDiscount=D.prepareDiscount,attachDiscount=D.attachDiscount;
 const torgaar=(g,c,a)=>!a.faceDownCast&&g.castDefinition(c,a).torgaarV85;
 D.previewDiscount=function(g,p,c,a,mana){const out=previewDiscount(g,p,c,a,mana);if(torgaar(g,c,a))out.xReduction=(out.xReduction||0)+g.creatures(p).filter(x=>g.canSacrifice(x)).length*2;return out;};
 D.prepareDiscount=async function(g,p,c,a,mana){if(!await prepareDiscount(g,p,c,a,mana))return false;if(!torgaar(g,c,a))return true;const source=lock(c),cards=await pick({g,you:p,src:c},g.creatures(p).filter(x=>g.canSacrifice(x)),0,g.creatures(p).length,p,'Torgaar: sacrifice creatures to reduce the cost');if(!current(source)||cards.some(x=>x.ctrl!==p||!g.canSacrifice(x)))return false;discounts.set(a,{source,rows:cards.map(lock)});mana.xReduction=(mana.xReduction||0)+cards.length*2;return true;};
 D.attachDiscount=function(ctx){if(!attachDiscount(ctx))return false;if(!torgaar(ctx.g,ctx.src,ctx.castOpts))return true;const plan=discounts.get(ctx.castOpts);if(!plan||!current(plan.source)||plan.rows.some(r=>!current(r)||r.card.ctrl!==ctx.you||!ctx.g.canSacrifice(r.card)))return false;const cards=plan.rows.map(r=>r.card),cost={id:'torgaar-sacrifice-v85',kind:'sacrifice',quantity:{min:cards.length,max:cards.length},object:{kind:'permanent',types:['Creature']}};(ctx.so.oracleCostPlans||=[]).push({sacrifices:cards,discards:[],exiles:[],returns:[],handExiles:[],life:0,choices:[],selections:[{cost,cards:plan.rows.map(r=>({card:r.card,zone:r.zone,zoneVersion:r.version}))}],reservedCards:[]});discounts.delete(ctx.castOpts);return true;};

 M.OracleV20.handlers.unshift({
  compile(op,script,entry,h){
   if(op.kind!=='legend-rule-v85')return false;
   const t=(event,filter,mode,targets=[],extra={})=>{const result=H.compileGenericTrigger({kind:'generic-trigger',event,eventFilter:null,effects:[fx(mode)],targets,optional:false,...extra}),prior=result.filter;result.filter=(g,s,d)=>prior(g,s,d)&&(!filter||filter(g,s,d));h.triggers.push(result);return result;};
   const a=(cost,mode,targets=[],extra={})=>{const result=H.compileGenericAbility({kind:'generic-ability',cost,effects:[fx(mode)],targets,optional:false,...extra});h.abilities.push(result);return result;};
   const self=(g,s,d)=>d.card===s,own=(g,s,d)=>d.player===s.ctrl;
   switch(op.mode){
    case 'Wolverine, Fierce Fighter':t('etb',self,'wolverine-fight',[{...creature,min:0,excludeSelf:true}]);(script.replace||=[]).push({event:'damage',applies:(g,d,s)=>d.target===s,run:healEarlierDamage});break;
    case 'Codie, Ravenous Codex':t('cast',(g,s,d)=>d.player===s.ctrl&&!!d.card.meta.preparedBy,'codie-copy');a({mana:'{W}{U}{B}{R}{G}',tap:true},'codie-prepare');break;
    case 'Ultron, Artificial Malevolence':t('etb',(g,s,d)=>{if(d.card===s||d.card.ctrl!==s.ctrl||d.card.isToken||!d.card.is('Artifact'))return false;d.copyDefinitionV85=M.OracleV8Faces.copyTokenDefinition(d.card);return true;},'ultron');break;
    case 'Fortune, Loyal Steed':t('etb',self,'fortune-scry');t('attacks',(g,s,d)=>self(g,s,d)&&M.oracleIsSaddledV10(g,s),'fortune');break;
    case 'Arni Metalbrow':for(const event of ['attacks','etb'])t(event,(g,s,d)=>{if(d.card.ctrl!==s.ctrl||!d.card.is('Creature')||event==='etb'&&!d.card.attacking)return false;d.attackerMvV85=d.card.mv;return true;},'arni');break;
    case 'Nemata, Primeval Warden':script.nemataV85=true;a({mana:'{G}',sacN:1,sacFilter:{what:'permanent',zone:'battlefield',controller:'you',subtype:'Saproling'}},'nemata-pump');a({mana:'{1}{B}',sacN:2,sacFilter:{what:'permanent',zone:'battlefield',controller:'you',subtype:'Saproling'}},'draw');break;
    case 'Sensational Spider-Man':t('attacks',self,'spiderman',[{...creature,controller:'defending-player'}]);break;
    case 'Calamity, Galloping Inferno':t('attacks',(g,s,d)=>self(g,s,d)&&M.oracleIsSaddledV10(g,s),'calamity');break;
    case 'Gollum, Riddle Master':{
     script.asEnters=async(g,s)=>{if(M.OracleV8AbilityLoss.entryCharacteristics(g,s).abilityLossTimestamp>-Infinity)return;const parity=await option({g,src:s,you:s.ctrl},[{key:'odd',label:'Odd'},{key:'even',label:'Even'}]);s.meta.gollumV85={version:s.zoneVersion,parity,chosen:[]};};
     const trigger=t('cast',(g,s,d)=>{const r=s.meta.gollumV85;if(d.player===s.ctrl||!r||r.version!==s.zoneVersion||r.chosen.length>=3||g.stackSpellManaValue(d.so)%2!==(r.parity==='odd'?1:0))return false;(d.gollumRecordsV85||={})[s.iid]=r;return true;},'gollum-riddle');
     trigger.modes={list:['Put a +1/+1 counter on Gollum','Each opponent loses 2 life and you gain 2 life','Draw a card'].map((label,index)=>({label,targets:[],cond:(g,s,d)=>!d.gollumRecordsV85[s.iid].chosen.includes(index)}))};
     const prepare=trigger.prepareTargets;trigger.prepareTargets=async ctx=>{if(await prepare(ctx)===false)return false;const r=ctx.data.gollumRecordsV85[ctx.src.iid];if(r.chosen.includes(ctx.mode))return false;r.chosen.push(ctx.mode);return true;};break;
    }
    case 'Witch-king of Angmar':t('combatDamageGroupToPlayer',(g,s,d)=>d.player===s.ctrl,'witchking');a({discard:1},'witchking-protect');break;
    case 'Torgaar, Famine Incarnate':script.torgaarV85=true;t('etb',self,'torgaar',[{what:'player',zone:'player',controller:'any',min:0,max:1}]);break;
    case 'Kassandra, Eagle Bearer':t('etb',self,'kassandra');t('combatDamageToPlayer',(g,s,d)=>d.card.ctrl===s.ctrl&&d.card.is('Creature')&&g.bf().some(x=>x.hasSub('Equipment')&&x.cur.super.includes('Legendary')&&x.attachedTo===d.card.iid),'draw');break;
    case 'The Gitrog, Ravenous Ride':t('combatDamageToPlayer',self,'gitrog');break;
    case 'Vraska, the Silencer':t('dies',(g,s,d)=>d.snap?.ctrl!==((g._simultaneousLeaveSources||[]).find(r=>r.card===s)?.snap.ctrl||s.ctrl)&&d.snap?.types.includes('Creature')&&!d.snap.isToken,'vraska');break;
    case 'Delina, Wild Mage':t('attacks',self,'delina',[{...creature,controller:'you'}]);break;
    case 'Kellan, Planar Trailblazer':a({mana:'{1}{R}'},'kellan-detective');a({mana:'{2}{R}'},'kellan-rogue');break;
    case 'Bill Ferny, Bree Swindler':{
     const trigger=t('becomesBlocked',(g,s,d)=>d.attacker===s,'bill');trigger.modes={list:[{label:'Create a Treasure token',targets:[]},{label:'Give a Horse to an opponent, remove Bill Ferny from combat, and create three Treasures',targets:H.genericTargetSpecs([opponent,{what:'permanent',zone:'battlefield',controller:'you',subtype:'Horse',min:1,max:1}],[fx('bill')])}]};break;
    }
    case "Altaïr Ibn-La'Ahad":t('attacks',self,'altair',[{what:'creature',zone:'graveyard',controller:'you',subtype:'Assassin',min:0,max:1}]);break;
    case 'Vaan, Street Thief':t('combatDamageGroupToPlayer',(g,s,d)=>(d.cards||[]).some(c=>c.ctrl===s.ctrl&&c.is('Creature')&&['Scout','Pirate','Rogue'].some(k=>c.hasSub(k))),'vaan');t('cast',(g,s,d)=>d.player===s.ctrl&&d.card.owner!==s.ctrl,'vaan-counters');break;
    case 'Asmoranomardicadaistinaculdacar':script.altCosts=[{oracleAlternativeId:'asmora-v85',oracleAlternativeCost:true,altCostStr:'{B/R}',label:'Pay {B/R} after discarding',oracleAdditionalCosts:[],cond:(g,p)=>p.turnState.discardedN>0,oraclePrepareCosts:async()=>true}];t('etb',self,'asmora-search');a({sacN:2,sacFilter:{what:'permanent',zone:'battlefield',controller:'you',subtype:'Food'}},'asmora-damage',[creature]);break;
    case 'Merieke Ri Berit':a({tap:true},'merieke',[creature]);break;
    case 'Edward Kenway':t('endStep',own,'edward-treasure');t('combatDamageToPlayer',(g,s,d)=>d.card.ctrl===s.ctrl&&d.card.hasSub('Vehicle'),'edward-exile');break;
    case 'Lazav, Familiar Stranger':t('crime',own,'lazav',[],{onceEachTurn:true});break;
    case 'Sméagol, Helpful Guide':t('endStep',own,'smeagol-ring',[],{condition:{kind:'creature-died-v85'}});t('ringTempted',own,'smeagol-reveal',[opponent]);break;
    case 'Azula, Ruthless Firebender':t('attacks',self,'azula-experience');a({mana:'{2}{B}'},'azula-pump');break;
    case 'Gollum, Scheming Guide':t('attacks',self,'gollum-guide');break;
    case 'Eladamri, Korvecdal':script.revealOwnTop=true;script.playTop=(g,s,c,p)=>s.ctrl===p&&!s.cur.abilitiesDisabled&&!s.phasedOut&&g.castHasType(c,{},'Creature');a({mana:'{G}',tap:true,tapN:2,tapFilter:{...creature,controller:'you'}},'eladamri',[],{activationCondition:{kind:'your-turn-v85'}});break;
    case 'Wolverine, Best There Is':(script.replace||=[]).push({event:'damage',applies:(g,d,s)=>d.src?.iid===s.iid&&(d.sourceSnapshot?.zoneVersion??d.src.zoneVersion)===s.zoneVersion,run:(g,d)=>d.n*2});t('endStep',null,'wolverine-counter',[],{condition:{kind:'wolverine-damaged-v85'}});a({mana:'{1}{G}'},'regenerate');break;
    case 'Rev, Tithe Extractor':t('attackersDeclared',own,'rev-deathtouch',[creature]);t('combatDamageGroupToPlayer',(g,s,d)=>(d.cards||[]).some(c=>c.ctrl===s.ctrl&&c.is('Creature')),'rev-exile');break;
    case 'Karai, Future of the Foot':{const trigger=t('combatDamageToPlayer',self,'karai',[{what:'creature',zone:'graveyard',controller:'you',min:1,max:1}]),prepare=trigger.prepareTargets;trigger.prepareTargets=async ctx=>{await prepare(ctx);ctx.karaiSneakV85=!!ctx.oracleSourceCapture?.castFlagsV10.oracleSneakCost&&ctx.oracleSourceCapture.castTurnV20===ctx.g.turnNo;return true;};break;}
    case 'Neera, Wild Mage':t('cast',own,'neera',[],{onceEachTurn:true});break;
    case 'Reno and Rude':t('combatDamageToPlayer',self,'reno');break;
    case 'Shark Shredder, Killer Clone':t('combatDamageToPlayer',self,'shredder',[{what:'creature',zone:'graveyard',controller:'event-player',min:0,max:1}]);break;
    default:throw Error('Unknown v85 legendary card: '+op.mode);
   }
   return true;
  },
  condition(g,s,node,p){if(node.kind==='creature-died-v85')return p.turnState.creaturesDiedUnder>0;if(node.kind==='your-turn-v85')return g.turnPlayer===p;if(node.kind==='wolverine-damaged-v85'){const r=s.meta.wolverineDamageV85;return r?.version===s.zoneVersion&&r.turn===g.turnNo;}},
  zoneReplacements(g,c,to,snap){if(c.zone!=='battlefield'||to!=='graveyard'||!snap?.types.includes('Creature'))return [];return zonesources(g,'nemataV85').filter(r=>r.snap.ctrl!==snap.ctrl).map(({card:source,snap:sourceSnap})=>({key:'nemata-v85:'+source.iid+':'+sourceSnap.zoneVersion,label:'Nemata — exile and create a Saproling',run:async()=>{c.meta.nemataExileV85={version:c.zoneVersion+1,source,sourceVersion:sourceSnap.zoneVersion,sourceMeta:sourceSnap.sourceMeta,player:sourceSnap.ctrl};return {toZone:'exile'};}}));},
  async effect(ctx,e){
   if(e.action!=='common-effects-v85')return false;
   const {g,you:p,src:s}=ctx,subject=n=>H.genericEffectSubjects(ctx,n)[0],c=subject(0);
   switch(e.mode){
    case 'draw':await g.draw(p,1,s);break;
    case 'wolverine-fight':if(c&&same(ctx))await H.runGenericEffect(ctx,{action:'fight',target:0});break;
    case 'codie-copy':if(g.stack.includes(ctx.data.so))await g.copySpell(ctx.data.so,p,{mayNewTargets:true});break;
    case 'codie-prepare':for(const card of g.creatures(p))M.oraclePrepareV10(g,card);break;
    case 'ultron':if(await pay(ctx,'{2}')){const made=await g.copyPermanentToken({def:eventDefinition(ctx)},p);for(const card of made)if(card.zone==='battlefield'&&!card.is('Creature'))g.addOracleAnimation(card,{types:['Creature'],subtypes:['Robot','Villain'],retainTypes:true,retainAllSubtypes:true,power:2,toughness:2,keywords:[],temporary:false});}break;
    case 'fortune-scry':await M.E.scry(g,p,2);break;
    case 'fortune':{const source={card:s,zone:'battlefield',version:ctx.sourceZoneVersion},riders=saddleRows(ctx);delayed(ctx,'endCombat',[],async next=>{const [rider]=await pick(next,saddleCards(next,riders),0,1,next.you,'Fortune: choose up to one creature that saddled it');const cards=await exile(next,[...(current(source)?[s]:[]),...(rider?[rider]:[])]),rows=cards.map(lock);await g.withBattlefieldEntryBatch(async()=>{for(const r of rows)if(current(r))await g.putPermanentOntoBattlefield(r.card,r.card.owner);});});break;}
    case 'arni':if(await pay(ctx,'{1}{R}')){const n=H.genericAmount({kind:'event-card-stat',stat:'mv'},ctx),[card]=await pick(ctx,p.hand.filter(x=>x.is('Creature')&&x.mv<n));if(card)await g.putPermanentOntoBattlefield(card,p,{tapped:true,attacking:await attacking(ctx,card)});}break;
    case 'nemata-pump':if(same(ctx))M.E.pumpUntilEOT(g,s,2,2,[]);break;
    case 'spiderman':{if(c){g.tap(c);g.addCounters(c,'stun',1,false,p);}let n=0;const blocked=new Set();while(n<3){const from=g.bf().filter(x=>(x.counters.stun||0)>0&&!blocked.has(x)),[card]=await pick(ctx,from,0,1,p,'Remove a stun counter? ('+(3-n)+' remaining)');if(!card)break;const before=card.counters.stun||0;g.removeCounters(card,'stun',1);const removed=Math.max(0,before-(card.counters.stun||0));if(removed)n+=removed;else blocked.add(card);}if(n)await g.draw(p,n,s);break;}
    case 'calamity':{const riders=saddleRows(ctx);for(let i=0;i<2;i++){const [card]=await pick(ctx,saddleCards(ctx,riders).filter(x=>!x.cur.super.includes('Legendary')),1,1,p,'Calamity: choose a creature that saddled it');if(!card)continue;const made=await copyAttacking(ctx,M.OracleV8Faces.copyTokenDefinition(card));delayed(ctx,'endStep',made.map(lock),async(next,rows)=>{await next.g.sacrificeMany(next.you,rows.map(r=>r.card).filter(card=>card.ctrl===next.you));});}break;}
    case 'gollum-riddle':if(ctx.mode===0){if(same(ctx))g.addCounters(s,'+1/+1',1,false,p);}else if(ctx.mode===1){for(const q of g.apnapFrom(g.turnPlayer).filter(q=>q!==p&&!q.lost))await g.loseLife(q,2,s);await g.gainLife(p,2,s);}else if(ctx.mode===2)await g.draw(p,1,s);break;
    case 'witchking':{const chosen=[];for(const q of g.apnapFrom(g.turnPlayer).filter(q=>q!==p&&!q.lost)){const from=g.creatures(q).filter(x=>{const r=x.meta.combatPlayersV85;return r?.turn===g.turnNo&&r.version===x.zoneVersion&&r.players.includes(p.idx)&&g.canSacrifice(x);});chosen.push(...await pick(ctx,from,1,1,q,'Sacrifice a creature that dealt combat damage to '+p.name));}await g.sacrificeMany(null,chosen);await M.E7.ringTempts(g,p);break;}
    case 'witchking-protect':if(same(ctx)){M.E.pumpUntilEOT(g,s,0,0,['indestructible']);g.tap(s);}break;
    case 'torgaar':if(c)await H.runGenericEffect(ctx,{action:'set-life-v9',who:0,n:Math.floor((c.startingLife??40)/2)});break;
    case 'kassandra':{const canSearch=g.canSearchLibrary(p,p,ctx),library=canSearch?g.searchableLibrary(p,p):[],from=[...p.graveyard,...p.hand,...library].filter(x=>M.OracleV8NameGroups.names(x).includes('The Spear of Leonidas')),[card]=await pick(ctx,from,from.some(x=>x.zone==='graveyard')?1:0,1,p,'Search for The Spear of Leonidas');if(card)await g.putPermanentOntoBattlefield(card,p);if(canSearch)await g.emit('searchedLibrary',{player:p,libraryOwner:p,source:s});M.shuffle(p.library,g.rnd);break;}
    case 'gitrog':{const [card]=await pick(ctx,saddleCards(ctx).filter(x=>x.ctrl===p&&g.canSacrifice(x)),0,1,p,'Sacrifice a creature that saddled The Gitrog');if(!card)break;const n=Math.max(0,card.power);if(!await g.sacrifice(p,card))break;await g.draw(p,n,s);const lands=await pick(ctx,p.hand.filter(x=>x.is('Land')),0,n,p,'Put up to '+n+' lands onto the battlefield tapped');await g.withBattlefieldEntryBatch(async()=>{for(const land of lands)if(land.zone==='hand'&&p.hand.includes(land))await g.putPermanentOntoBattlefield(land,p,{tapped:true});});break;}
    case 'vraska':{const card=ctx.data.card,version=ctx.data.snap.zoneVersion+1;if(!await pay(ctx,'{1}'))break;if(card.zone!=='graveyard'||card.zoneVersion!==version)break;await g.withBattlefieldEntryBatch(async()=>{await g.putPermanentOntoBattlefield(card,p,{tapped:true,entryAnimation:{types:['Artifact'],subtypes:['Treasure'],retainTypes:false,keywords:[],temporary:false}});if(card.zone==='battlefield'&&card.zoneVersion===version+1)await H.runGenericEffect({...ctx,targets:[card]},{action:'grant-operation',target:0,duration:'object-v10',operation:{kind:'mana-source',activationCost:{tap:true,sacSelf:true},produce:[{ANY:true,n:1}],contract:'mana-source'}});});break;}
    case 'delina':{if(!c)break;const r=lock(c);do{const [n]=await g.rollDice(p,20,1,{source:s});if(current(r)){const definition=M.OracleV8Faces.copyTokenDefinition(c,base=>({...base,super:(base.super||[]).filter(x=>x!=='Legendary'),triggers:[...(base.triggers||[]),H.compileGenericTrigger({kind:'generic-trigger',event:'endCombat',eventFilter:null,targets:[],effects:[fx('delina-exile')],optional:false})]}));await copyAttacking(ctx,definition);}if(n<15||!await yes(ctx,'Roll again for Delina?'))break;}while(true);break;}
    case 'delina-exile':if(same(ctx))await g.move(s,'exile');break;
    case 'kellan-detective':if(same(ctx)&&s.hasSub('Scout')){g.addOracleAnimation(s,{types:[],subtypes:['Human','Faerie','Detective'],retainTypes:true,replaceCreatureSubtypes:true,keywords:[],temporary:false});await H.runGenericEffect(ctx,{action:'grant-operation',target:'self',duration:'object-v10',operation:{kind:'generic-trigger',event:'combatDamageToPlayer',eventFilter:'self',targets:[],effects:[fx('kellan-exile')],optional:false,contract:'generic-trigger-effect'}});}break;
    case 'kellan-rogue':if(same(ctx)&&s.hasSub('Detective'))g.addOracleAnimation(s,{types:[],subtypes:['Human','Faerie','Rogue'],retainTypes:true,replaceCreatureSubtypes:true,power:3,toughness:2,keywords:['double strike'],temporary:false});break;
    case 'kellan-exile':{const top=p.library.at(-1);if(top)grant(ctx,await exile(ctx,[top]),{duration:'eot'});break;}
    case 'bill':if(ctx.mode===0)await g.makeTokens(M.TOKENS.treasure,p);else{const horse=subject(1);if(c&&horse){M.OracleV8Control.gain(g,horse,c,{temporary:false});g.recalc();if(horse.ctrl===c){if(same(ctx))g.removeFromCombat(s);await g.makeTokens(M.TOKENS.treasure,p,{n:3});}}}break;
    case 'altair':{if(c){const card=(await exile(ctx,[c]))[0];if(card)g.addCounters(card,'memory',1,false,p);}const cards=p.exile.filter(x=>x.is('Creature')&&(x.counters.memory||0)>0),rows=cards.map(lock),made=[];for(const r of rows)if(current(r))made.push(...await copyAttacking(ctx,M.OracleV8Faces.copyTokenDefinition(r.card)));delayed(ctx,'endCombat',made.map(lock),async(next,remaining)=>{for(const r of remaining)await next.g.move(r.card,'exile');});break;}
    case 'vaan':{const top=ctx.data.player.library.at(-1),cards=top?await exile(ctx,[top]):[];if(!cards.length||!await M.BOM.immediate(ctx,cards,{free:false}))await g.makeTokens(M.TOKENS.treasure,p);break;}
    case 'vaan-counters':for(const card of g.bf().filter(x=>x.ctrl===p&&['Scout','Pirate','Rogue'].some(k=>x.hasSub(k))))g.addCounters(card,'+1/+1',1,false,p);break;
    case 'asmora-search':if(await yes(ctx,'Search for The Underworld Cookbook?'))await M.OracleV8Library.search(ctx,{n:1,filter:{what:'card',zone:'graveyard',name:'The Underworld Cookbook'},reveal:true,placements:[{n:'all',destination:'hand'}]},{target:H.genericTargetSpec,amount:H.genericAmount},p,p,{});break;
    case 'asmora-damage':if(c)await g.damageBatch([{src:c,target:c,n:6}]);break;
    case 'merieke':{if(!c)break;const duration=M.OracleV8Untap.capture(ctx,'controlled');if(M.OracleV8Untap.sourceValid(g,duration))M.OracleV8Control.gain(g,c,p,{duration});const target=lock(c),sourceVersion=ctx.sourceZoneVersion,state={fired:false},rows=[];for(const on of ['lto','becameUntapped']){const row={on,once:true,src:s,ctrl:p,name:'Merieke — destroy the controlled creature',filter:(game,d)=>!state.fired&&d.card===s&&(on==='lto'?d.snap?.zoneVersion===sourceVersion:s.zoneVersion===sourceVersion),run:async next=>{if(state.fired)return;state.fired=true;next.g.delayed=next.g.delayed.filter(r=>!rows.includes(r));if(current(target))await next.g.destroy(target.card,{noRegen:true});}};rows.push(row);g.delayed.push(row);}g.recalc();break;}
    case 'edward-treasure':await g.makeTokens(M.TOKENS.treasure,p,{n:g.bf().filter(x=>x.ctrl===p&&x.tapped&&['Assassin','Pirate','Vehicle'].some(k=>x.hasSub(k))).length});break;
    case 'edward-exile':case 'rev-exile':{if(e.mode==='rev-exile')await g.makeTokens(M.TOKENS.treasure,p);const top=ctx.data.player.library.at(-1);if(top){await look(ctx,[top]);grant(ctx,await exile(ctx,[top],{exileFaceDown:true,exileLookers:[p.idx]}),{spellsOnly:e.mode==='rev-exile'});}break;}
    case 'lazav':{if(same(ctx))g.addCounters(s,'+1/+1',1,false,p);const [card]=await pick(ctx,g.players.flatMap(q=>q.graveyard),0,1,p,'Lazav: exile a card from a graveyard');if(!card)break;const out=(await exile(ctx,[card]))[0];if(out?.is('Creature')&&same(ctx)&&await yes(ctx,'Have Lazav become a copy of '+out.name+' until end of turn?')){M.OracleV8Copies.applyCopy(g,s,M.OracleV8Faces.copyTokenDefinition(out),{duration:'eot',controller:p});g.recalc();}break;}
    case 'smeagol-ring':await M.E7.ringTempts(g,p);break;
    case 'smeagol-reveal':{if(!c)break;const cards=[];for(const card of c.library.slice().reverse()){cards.push(card);if(card.is('Land'))break;}const rows=cards.map(lock);await look(ctx,cards,p,'reveal');const land=cards.at(-1)?.is('Land')?cards.at(-1):null;if(land&&rows.some(r=>r.card===land&&current(r)))await g.putPermanentOntoBattlefield(land,p,{tapped:true});await g.withGraveyardEntryBatch(async()=>{for(const r of rows)if(r.card!==land&&current(r))await g.move(r.card,'graveyard');});break;}
    case 'azula-experience':{const cards=await pick(ctx,p.hand.slice(),0,1,p,'Azula: discard a card?');if(cards.length)await g.discard(p,cards);const n=g.players.filter(q=>q.turnState.discardedN>0).length;if(n&&g.canPutPlayerCountersV66(p,'experience')){const before=p.counters.experience||0,actual=M.POM?.playerCounterBonus(g,p,n)??n;p.counters.experience=before+actual;g.recalc();g.note('counter',{p,kind:'experience'});if(actual)await g.emit('playerCountersPlaced',{player:p,kind:'experience',n:actual,before,after:p.counters.experience,by:p,source:s});}break;}
    case 'azula-pump':if(same(ctx)){const n=p.counters?.experience||0;M.E.pumpUntilEOT(g,s,n,n,['menace']);}break;
    case 'gollum-guide':{const rows=p.library.slice(-2).reverse().map(lock);await look(ctx,rows.map(r=>r.card));const order=await pick(ctx,rows.filter(current).map(r=>r.card),rows.length,rows.length,p,'Order the top cards, top first');for(const card of order.slice().reverse()){const i=p.library.indexOf(card);if(i>=0){p.library.splice(i,1);p.library.push(card);}}const kind=await option(ctx,[{key:'land',label:'Land'},{key:'nonland',label:'Nonland'}]),opponents=g.alivePlayers().filter(q=>q!==p);if(!opponents.length)break;const who=await option(ctx,opponents.map(q=>({key:String(q.idx),label:q.name})),p,'Choose an opponent to guess'),q=opponents.find(q=>String(q.idx)===who),guess=await yes(ctx,'Is the top card '+kind+'?',q),top=p.library.at(-1);if(top)await look(ctx,[top],p,'reveal');if(top&&guess===(top.is('Land')===(kind==='land'))){if(same(ctx))g.removeFromCombat(s);}else{await g.draw(p,1,s);if(same(ctx))M.E.pumpUntilEOT(g,s,0,0,['unblockable']);}break;}
    case 'eladamri':{const from=[...p.hand,...(p.library.length?[p.library.at(-1)]:[])],[card]=await pick(ctx,from,1,1,p,'Reveal a card from your hand or the top of your library');if(card){await look(ctx,[card],p,'reveal');if(card.is('Creature'))await g.putPermanentOntoBattlefield(card,p);}break;}
    case 'wolverine-counter':if(same(ctx))g.addCounters(s,'+1/+1',1,false,p);break;
    case 'regenerate':await H.runGenericEffect(ctx,{action:'regenerate',target:'self'});break;
    case 'rev-deathtouch':if(c)M.E.pumpUntilEOT(g,c,0,0,['deathtouch']);break;
    case 'karai':if(c){if(ctx.karaiSneakV85)await g.putPermanentOntoBattlefield(c,p);else await g.move(c,'hand');}break;
    case 'neera':{const so=ctx.data.so;if(!g.stack.includes(so)||!await yes(ctx,'Put the spell on the bottom of its owner’s library?'))break;const spell=so.card;g.stack.splice(g.stack.indexOf(so),1);await g.move(spell,'library',{toBottom:true});if(spell.zone==='stack')break;const cards=[];for(const card of p.library.slice().reverse()){cards.push(card);if(!card.is('Land'))break;}const rows=cards.map(lock);await look(ctx,cards,p,'reveal');const last=cards.at(-1);if(last&&!last.is('Land'))await M.BOM.immediate(ctx,[last],{free:true});await bottom(ctx,rows);break;}
    case 'reno':{const top=ctx.data.player.library.at(-1),cards=top?await exile(ctx,[top]):[],rows=cards.map(lock),[sac]=await pick(ctx,g.bf().filter(x=>x.ctrl===p&&(x!==s||!same(ctx))&&(x.is('Creature')||x.is('Artifact'))&&g.canSacrifice(x)),0,1,p,'Sacrifice another creature or artifact');if(sac&&await g.sacrifice(p,sac))grant(ctx,rows.filter(current).map(r=>r.card),{duration:'eot',anyColor:true});break;}
    case 'shredder':if(c)await g.putPermanentOntoBattlefield(c,p,{tapped:true,attacking:g.combat&&g.turnPlayer===p?ctx.data.player:null});break;
    default:return false;
   }
   return true;
  }
 });
})(globalThis.MTG||={});
