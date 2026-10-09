// Executable rules for the exact-source v95 paper land and creature cohort.
(function(M){
 'use strict';
 const H=M.OracleV20.helpers,G=M.Game.prototype;
 const E=(mode,extra={})=>({action:'paper-effects-v95',mode,...extra});
 const target=(what='creature',controller='any',extra={})=>({what,controller,zone:what==='player'?'player':'battlefield',min:1,max:1,...extra});
 const lock=card=>({card,zone:card.zone,version:card.zoneVersion}),current=r=>r&&r.card.zone===r.zone&&r.card.zoneVersion===r.version;
 const same=ctx=>H.sameBattlefieldSource(ctx),active=c=>c?.zone==='battlefield'&&!c.phasedOut&&!c.cur?.abilitiesDisabled&&!c.faceDown;
 const option=async(ctx,rows,p=ctx.you,prompt=ctx.src.name)=>{const key=await p.controller.decide(ctx.g,{type:'chooseOption',options:rows,prompt,aiHint:{kind:'optTrigger',src:ctx.src}});if(!rows.some(r=>r.key===key))throw Error('Invalid v95 choice');return key;};
 const yes=(ctx,prompt,p=ctx.you)=>option(ctx,[{key:'yes',label:'Yes'},{key:'no',label:'No'}],p,prompt).then(k=>k==='yes');
 const pick=async(ctx,from,min=0,max=1,p=ctx.you,prompt=ctx.src.name)=>{if(!from.length)return [];min=Math.min(min,from.length);max=Math.min(max,from.length);const rows=from.map(lock),cards=await p.controller.decide(ctx.g,{type:'chooseCards',from,min,max,prompt,aiHint:{kind:'bestCard',src:ctx.src}});if(!Array.isArray(cards)||cards.length<min||cards.length>max||new Set(cards).size!==cards.length||cards.some(c=>!rows.some(r=>r.card===c&&current(r))))throw Error('Invalid v95 cards');return cards;};
 const token=(name,power,toughness,subtypes,colors,extra={})=>({name,cost:'',types:['Creature'],subtypes,super:[],power:String(power),toughness:String(toughness),colorsOverride:colors,...extra});
 const ctxFor=(g,s)=>({g,src:s,you:s.ctrl,sourceZoneVersion:s.zoneVersion,sourceMeta:s.meta});
 const walk=k=>k.endsWith('walk');
 const upkeepOrdinal=(g,p)=>g.upkeepCountsV95?.get(p)||0;
 const setDuration=(g,row,p,end=false)=>{row.v95UpkeepExpiry={player:p,ordinal:upkeepOrdinal(g,p)+1,end};return row;};
 const addBase=(ctx,c,power,toughness)=>{ctx.g.addOracleBasePT(c,{...(power!==undefined?{power}:{}),...(toughness!==undefined?{toughness}:{}),temporary:false});const row=ctx.g.untilEffects.findLast(e=>e.kind==='oracleBasePT'&&e.iid===c.iid&&e.zoneVersion===c.zoneVersion);if(!row)throw Error('Missing v95 base effect');return row;};
 const grantKeywords=(ctx,c,keywords,extra={})=>{const row={kind:'oracleGrantedOperation',expires:'object',iid:c.iid,zoneVersion:c.zoneVersion,timestamp:ctx.g.nextOracleTimestamp(),field:'extraAbilities',grants:[],keywords,...extra};ctx.g.untilEffects.push(row);ctx.g.recalc();return row;};
 const capCounters=async(ctx,c,kind,n,cap)=>{if(!ctx.g.canPutCountersV18(c,kind))return 0;const r=lock(c),actual=Math.min(Math.max(0,cap-(c.counters[kind]||0)),await M.OracleV91Counters.amount(ctx.g,c,kind,n,ctx.you,{effect:true}));if(!current(r))return 0;const saved=ctx.g.v91CountersApplied;ctx.g.v91CountersApplied=true;try{ctx.g.addCounters(c,kind,actual,false,ctx.you);}finally{ctx.g.v91CountersApplied=saved;}return actual;};
 const mana=(h,cost,produce,extra={})=>{const m=H.compileGenericMana({kind:'mana-source',activationCost:cost,produce});Object.assign(m,extra);h.mana.push(m);return m;};
 function ability(h,cost,mode,targets=[],extra={}){const a=H.compileGenericAbility({kind:'generic-ability',cost,targets,effects:[E(mode)],optional:false,...extra});if(cost.additionalCostV20){const cond=a.cond;a.cond=(g,s,p)=>(!cond||cond(g,s,p))&&M.OracleV20Costs.activationFeasible(g,p,s,a.cost,a.cost.mana?g.abilityManaCost(p,s,a.cost.mana,{ability:a}):null,a);}h.abilities.push(a);return a;}
 function auraRestricted(g,c,src,opts){return !!opts?.isSpell&&!!src&&g.castSubtypesV16(src,opts.castOpts||{}).includes('Aura');}
 M.OracleV20.handlers.unshift({
  compile(op,script,entry,h){
   if(op.kind!=='paper-permanent-v95')return false;
   script.paperV95=op.name;
   const tr=(on,filter,mode,targets=[],extra={})=>{const t=H.compileGenericTrigger({kind:'generic-trigger',event:on,eventFilter:null,effects:[E(mode)],targets,optional:false,...extra}),prior=t.filter;t.filter=(g,s,d)=>prior(g,s,d)&&(!filter||filter(g,s,d));h.triggers.push(t);return t;};
   const self=(g,s,d)=>d.card===s,own=(g,s,d)=>d.player===s.ctrl;
   const etb=(mode,targets=[])=>tr('etb',self,mode,targets),upkeep=mode=>tr('upkeep',own,mode),a=(cost,mode,targets=[],extra={})=>ability(h,cost,mode,targets,extra);
   const st=(apply,phase=5)=>h.statics.push({phase,apply});
   switch(op.name){
    case 'Angus Mackenzie':a({mana:'{G}{W}{U}',tap:true},'angus',[],{activationCondition:{kind:'before-damage-v95'}});break;
    case 'Autumn Willow':a({mana:'{G}'},'autumn',[target('player')]);break;
    case 'Bartel Runeaxe':case 'Tetsuo Umezawa':st((g,s)=>{(s.cur.oracleTargetRestrictionsV18||=[]).push((src,p,opts)=>auraRestricted(g,s,src,opts));});if(op.name==='Tetsuo Umezawa')a({mana:'{U}{B}{B}{R}',tap:true},'tetsuo',[target('creature','any',{v20:{kind:'tapped-blocking-v95'}})]);break;
    case 'Bronze Horse':(script.replace||=[]).push({event:'damage',prevent:true,oraclePrevention:true,applies:(g,d,s)=>d.target===s&&g.creatures(s.ctrl).some(c=>c!==s)&&isTargetingSpell(g,d,s),run:()=>0});break;
    case 'Balduvian Trading Post':script.entrySacrificeV95={type:'Mountain',untapped:true};break;
    case 'Heart of Yavimaya':script.entrySacrificeV95={type:'Forest'};break;
    case 'Kjeldoran Outpost':script.entrySacrificeV95={type:'Plains'};break;
    case 'Lake of the Dead':script.entrySacrificeV95={type:'Swamp'};break;
    case 'Soldevi Excavations':script.entrySacrificeV95={type:'Island',untapped:true};break;
    case 'City of Shadows':a({tap:true,additionalCostV20:{kind:'exile-creature-v95'}},'shadows-counter');mana(h,{tap:true},[{C:1}],{produce:(g,s)=>[{C:s.counters.storage||0}],possibleProduce:[{C:1}],amountFlex:true});break;
    case 'City of Traitors':tr('landPlayed',(g,s,d)=>d.player===s.ctrl&&d.card!==s,'traitors');break;
    case 'Clockwork Avian':case 'Clockwork Beast':case 'Clockwork Steed':case 'Clockwork Swarm':{
     const cap=op.name==='Clockwork Beast'?7:4;script.etbCounters={kind:'+1/+0',n:cap};script.clockworkCapV95=cap;
     tr('endCombat',(g,s)=>s.meta.clockworkCombatV95===g.combat,'clockwork-remove');
     const row=a({mana:'{X}',tap:true},'clockwork-add',[],{activationCondition:{kind:'your-upkeep-v95'}});row.v95Clockwork=true;
     if(op.name==='Clockwork Steed')st((g,s)=>{const prior=s.cur.cantBeBlockedBy;s.cur.cantBeBlockedBy=(game,c)=>c.is('Artifact')||!!prior?.(game,c);});
     if(op.name==='Clockwork Swarm')st((g,s)=>{const prior=s.cur.cantBeBlockedBy;s.cur.cantBeBlockedBy=(game,c)=>c.hasSub('Wall')||!!prior?.(game,c);});break;}
    case 'Dong Zhou, the Tyrant':etb('dong',[target('creature','opponent')]);break;
    case 'Flowstone Sculpture':a({mana:'{2}',discard:1},'flowstone');break;
    case 'Gabriel Angelfire':upkeep('gabriel');break;
    case 'Guan Yu, Sainted Warrior':st((g,s)=>s.cur.kw.add('horsemanship'));tr('dies',(g,s,d)=>d.card===s&&d.card.owner===d.snap?.ctrl,'guan');break;
    case 'Halfdane':tr('upkeep',own,'halfdane',[target('creature','any',{excludeSelf:true})]);break;
    case 'Hammerheim':a({tap:true},'hammerheim',[target('creature')]);break;
    case 'Hazezon Tamar':etb('hazezon-delay');tr('lto',self,'hazezon-exile');break;
    case 'Karn, Silver Golem':tr('blocks',(g,s,d)=>d.blocker===s||d.card===s,'karn-pump');tr('becomesBlocked',(g,s,d)=>d.attacker===s,'karn-pump');a({mana:'{1}'},'karn-animate',[target('artifact','any',{excludedTypes:['Creature']})]);break;
    case 'Nebuchadnezzar':a({mana:'{X}',tap:true},'nebuchadnezzar',[target('player','opponent')],{activationCondition:{kind:'your-turn-v95'}});break;
    case 'Phyrexian Devourer':{const t=tr('state',null,'devourer-sacrifice');t.stateTest=(g,s)=>s.power>=7;a({additionalCostV20:{kind:'permanent-paid-v27',mode:'library-exile',n:1}},'devourer-counter');break;}
    case 'Rainbow Vale':for(const m of h.mana){const old=m.afterProduce;m.afterProduce=async(g,s,p,v)=>{if(old)await old(g,s,p,v);g.delayed.push({on:'endStep',once:true,src:s,ctrl:p,sourceZoneVersion:v,name:s.name+' — an opponent gains control',run:ctx=>H.runGenericEffect(ctx,E('rainbow-control'))});};}break;
    case 'Rasputin Dreamweaver':script.etbCounters={kind:'dream',n:7};script.dreamCapV95=true;mana(h,{additionalCostV20:{kind:'dream-counter-v95'}},[{C:1}],{activationPaymentV20:true,manual:true,cond:(g,s)=>s.counters.dream>0});a({oracleCounterPayment:{n:1,kinds:['dream'],self:true,among:false}},'rasputin-prevent');tr('upkeep',(g,s,d)=>d.player===s.ctrl&&s.meta.untappedAtTurnStartV95?.turn===g.turnNo&&s.meta.untappedAtTurnStartV95?.version===s.zoneVersion&&s.meta.untappedAtTurnStartV95?.untapped,'rasputin-add');break;
    case 'Reveka, Wizard Savant':for(const ab of h.abilities){const old=ab.run;ab.run=async ctx=>{await old(ctx);if(same(ctx))await H.runGenericEffect(ctx,{action:'skip-next-untap',target:'self'});};}break;
    case 'Rohgahh of Kher Keep':upkeep('rohgahh');break;
    case 'Scarecrow':a({mana:'{6}',tap:true},'scarecrow');break;
    case 'Shapeshifter':script.oracleCharacteristicPT=true;script.cdaPower=(g,s)=>Number(s.meta.chosenNumberV95)||0;script.cdaToughness=(g,s)=>7-(Number(s.meta.chosenNumberV95)||0);script.asEnters=(g,s)=>chooseShapeshifter(ctxFor(g,s),false);upkeep('shapeshifter');break;
    case 'Soldevi Golem':tr('upkeep',own,'soldevi-untap',[target('creature','opponent',{tapped:true})]);break;
    case "Sorrow's Path":a({tap:true},'sorrow-swap',[target('creature','opponent',{blocking:true}),target('creature','opponent',{blocking:true,differentFromAllPrevious:true})]);h.abilities.at(-1).targets[1].dependentFilter=(g,c,prior)=>c.ctrl===prior[0]?.ctrl;tr('becameTapped',self,'sorrow-damage');break;
    case 'Starke of Rath':a({tap:true},'starke',[target('permanent','any',{v20:{kind:'artifact-creature-v95'}})]);break;
    case 'Tetravus':upkeep('tetravus-create');upkeep('tetravus-return');break;
    case 'Thawing Glaciers':a({mana:'{1}',tap:true},'glaciers');break;
    case 'Urborg':a({tap:true},'urborg',[target('creature')]);break;
    case 'Vhati il-Dal':a({tap:true},'vhati',[target('creature')]);break;
    default:throw Error('Unknown v95 permanent '+op.name);
   }
   return true;
  },
  condition(g,s,n,p){if(n.kind==='before-damage-v95')return !g.turnPlayer.turnState.reachedCombatDamageDeadline;if(n.kind==='your-upkeep-v95')return g.turnPlayer===p&&g.phase==='upkeep';if(n.kind==='your-turn-v95')return g.turnPlayer===p;},
  target(g,c,p,s,n){if(n.kind==='tapped-blocking-v95')return c.tapped||!!c.blocking;if(n.kind==='artifact-creature-v95')return c.is('Artifact')||c.is('Creature');},
  async effect(ctx,e){
   if(e.action!=='paper-effects-v95')return false;
   const {g,src:s,you:p}=ctx,c=H.genericEffectSubjects(ctx,0)[0];
   switch(e.mode){
    case 'angus':await H.runGenericEffect(ctx,{action:'damage-rule-v20',mode:'prevent',combat:'combat',source:{all:true},recipient:{all:true},n:'all'});break;
    case 'autumn':if(c&&same(ctx))g.untilEffects.push({kind:'autumnShroudV95',expires:'eot',card:s,version:ctx.sourceZoneVersion,player:c});break;
    case 'tetsuo':if(c)await g.destroy(c);break;
    case 'shadows-counter':if(same(ctx))await g.putCountersV91(s,'storage',1,{by:p});break;
    case 'traitors':if(same(ctx)&&s.ctrl===p)await g.sacrifice(p,s);break;
    case 'clockwork-remove':if(same(ctx))g.removeCounters(s,'+1/+0',1);break;
    case 'clockwork-add':if(same(ctx)){const x=ctx.x??ctx.so?.x??0,max=Math.min(x,Math.max(0,s.def.clockworkCapV95-(s.counters['+1/+0']||0))),n=await p.controller.decide(g,{type:'chooseX',min:0,max,card:s,prompt:'Put up to X counters on '+s.name,aiHint:{kind:'chooseX',card:s}});if(!Number.isInteger(n)||n<0||n>max)throw Error('Invalid Clockwork counter amount');await capCounters(ctx,s,'+1/+0',n,s.def.clockworkCapV95);}break;
    case 'dong':if(c)await g.damageBatch([{src:c,target:c.ctrl,n:Math.max(0,c.power)}],{deferSBA:true});break;
    case 'flowstone':if(same(ctx)){const key=await option(ctx,['counter','flying','first strike','trample'].map(key=>({key,label:key==='counter'?'+1/+1 counter':key})));if(key==='counter')await g.putCountersV91(s,'+1/+1',1,{by:p});else grantKeywords(ctx,s,[key]);}break;
    case 'gabriel':if(same(ctx)){const key=await option(ctx,['flying','first strike','trample','rampage 3'].map(key=>({key,label:key})));if(key==='rampage 3'){const script={};M.applyOracleMechanic(script,{kind:'mechanic-rampage',n:3});const row={kind:'oracleGrantedOperation',expires:'object',iid:s.iid,zoneVersion:s.zoneVersion,timestamp:g.nextOracleTimestamp(),field:'extraTriggers',grants:script.triggers,keywords:['rampage']};setDuration(g,row,p);g.untilEffects.push(row);}else setDuration(g,grantKeywords(ctx,s,[key]),p);g.recalc();}break;
    case 'guan':{const version=ctx.data.graveyardZoneVersion??ctx.data.snap?.zoneVersion+1;if(s.zone==='graveyard'&&s.zoneVersion===version&&await yes(ctx,'Shuffle Guan Yu into your library?')){await g.move(s,'library');M.shuffle(s.owner.library,g.rnd);}break;}
    case 'halfdane':if(c&&same(ctx)){setDuration(g,addBase(ctx,s,c.power,c.toughness),p,true);g.recalc();}break;
    case 'hammerheim':if(c)loseKeywords(ctx,c,walk);break;
    case 'hazezon-delay':g.delayed.push({on:'upkeep',once:true,src:s,ctrl:p,name:s.name+' — create Sand Warriors',filter:(game,d)=>d.player===p,run:async later=>{await later.g.makeTokens(token('Sand Warrior',1,1,['Sand','Warrior'],['R','G','W']),p,{n:later.g.lands(p).length});}});break;
    case 'hazezon-exile':await exileBatch(ctx,g.bf().filter(x=>x.hasSub('Sand')&&x.hasSub('Warrior')));break;
    case 'karn-pump':if(same(ctx))M.E.pumpUntilEOT(g,s,-4,4,[]);break;
    case 'karn-animate':if(c)g.addOracleAnimation(c,{types:['Creature'],subtypes:[],retainTypes:true,retainAllSubtypes:true,power:c.mv,toughness:c.mv,temporary:true});break;
    case 'nebuchadnezzar':if(c){const name=await M.OracleV20Spells.chooseName(ctx),pool=c.hand.slice();M.shuffle(pool,g.rnd);const cards=pool.slice(0,ctx.x??ctx.so?.x??0),rows=cards.map(lock);await g.revealToHuman({cards,ctrl:c,kind:'reveal',includeLands:true});await g.discard(c,rows.filter(current).map(r=>r.card).filter(x=>M.OracleV8NameGroups.names(x).includes(name)));}break;
    case 'devourer-sacrifice':if(same(ctx)&&s.ctrl===p)await g.sacrifice(p,s);break;
    case 'devourer-counter':if(same(ctx)){const row=ctx.oracleActivationPaymentV27?.rows[0];if(row)await g.putCountersV91(s,'+1/+1',row.mvV95??row.card.mv,{by:p});}break;
    case 'rainbow-control':if(same(ctx)){const opponents=g.alivePlayers().filter(q=>q!==p);if(opponents.length){const key=await option(ctx,opponents.map(q=>({key:String(q.idx),label:q.name}))),q=opponents.find(q=>String(q.idx)===key);M.OracleV8Control.gain(g,s,q);g.recalc();}}break;
    case 'rasputin-prevent':await H.runGenericEffect(ctx,{action:'damage-rule-v20',mode:'prevent',source:{all:true},recipient:{ref:'self'},n:1});break;
    case 'rasputin-add':if(same(ctx))await g.putCountersV91(s,'dream',1,{by:p});break;
    case 'rohgahh':{const cost=M.parseCost('{R}{R}{R}');if(g.canPayMana(p,cost,null)&&await yes(ctx,'Pay {R}{R}{R}?')&&await g.payMana(p,cost,null))break;const cards=g.bf().filter(x=>x===s&&same(ctx)||M.OracleV8NameGroups.names(x).includes('Kobolds of Kher Keep'));for(const x of cards)g.tap(x);const opponents=g.alivePlayers().filter(q=>q!==p);if(opponents.length){const key=await option(ctx,opponents.map(q=>({key:String(q.idx),label:q.name}))),q=opponents.find(q=>String(q.idx)===key);for(const x of cards)if(x.zone==='battlefield')M.OracleV8Control.gain(g,x,q);g.recalc();}break;}
    case 'scarecrow':await H.runGenericEffect(ctx,{action:'damage-rule-v20',mode:'prevent',source:{filter:target('creature','any',{withKeyword:'flying'})},recipient:{player:'you'},n:'all'});break;
    case 'shapeshifter':if(same(ctx))await chooseShapeshifter(ctx,true);break;
    case 'soldevi-untap':if(c&&await yes(ctx,'Untap the target creature?')){if(g.untap(c)&&same(ctx))g.untap(s);}break;
    case 'sorrow-swap':{const d=H.genericEffectSubjects(ctx,1)[0];if(!c||!d||c===d||c.ctrl!==d.ctrl||c.ctrl===p)break;const attackers=g.combat?.attackers||[],ca=attackers.filter(a=>a.blockedBy.includes(c)),da=attackers.filter(a=>a.blockedBy.includes(d));if(!ca.length||!da.length||da.length>g.blockerCapacity(c)||ca.length>g.blockerCapacity(d)||!da.every(a=>g.canBlock(c,a))||!ca.every(a=>g.canBlock(d,a)))break;g.removeFromCombat(c);g.removeFromCombat(d);for(const a of ca){if(!a.blockedBy.includes(d))a.blockedBy.push(d);a.wasBlocked=true;}for(const a of da){if(!a.blockedBy.includes(c))a.blockedBy.push(c);a.wasBlocked=true;}c.blocking=da[0]?.iid||null;d.blocking=ca[0]?.iid||null;g.recalc();break;}
    case 'sorrow-damage':await g.damageBatch([p,...g.creatures(p)].map(target=>({src:H.oracleDamageSource(ctx),target,n:2})),{deferSBA:true});break;
    case 'starke':if(c){const ctrl=c.ctrl;await g.destroy(c);if(same(ctx)&&!ctrl.lost){M.OracleV8Control.gain(g,s,ctrl);g.recalc();}}break;
    case 'tetravus-create':if(same(ctx)){const max=s.counters['+1/+1']||0,n=await p.controller.decide(g,{type:'chooseX',min:0,max,card:s,prompt:'Remove any number of +1/+1 counters?',aiHint:{kind:'chooseX',card:s}});if(!Number.isInteger(n)||n<0||n>max)throw Error('Invalid Tetravus amount');if(n){g.removeCounters(s,'+1/+1',n);await g.makeTokens(token('Tetravite',1,1,['Tetravite'],[],{types:['Artifact','Creature'],kws:['flying'],tetraviteV95:true,asEnters:(game,c)=>{c.meta.tetravusV95={source:s.iid,version:ctx.sourceZoneVersion};},statics:[{apply:(game,c)=>{c.cur.cantBeEnchantedV95=true;(c.cur.oracleTargetRestrictionsV18||=[]).push((src,player,opts)=>auraRestricted(game,c,src,opts));}}]}),p,{n});}}break;
    case 'tetravus-return':if(same(ctx)){const pool=g.bf().filter(c=>c.isToken&&c.meta.tetravusV95?.source===s.iid&&c.meta.tetravusV95?.version===ctx.sourceZoneVersion),cards=await pick(ctx,pool,0,pool.length,p,'Exile any tokens created by this Tetravus'),n=cards.length;await exileBatch(ctx,cards);if(n&&same(ctx))await g.putCountersV91(s,'+1/+1',n,{by:p});}break;
    case 'glaciers':{const pool=p.library.filter(c=>c.is('Land')&&c.def.super?.includes('Basic')),[land]=await pick(ctx,pool,0,1,p,'Find a basic land');if(land){await g.revealToHuman({cards:[land],ctrl:p,kind:'search',includeLands:true});await g.putPermanentOntoBattlefield(land,p,{tapped:true});}M.shuffle(p.library,g.rnd);const r={card:s,zone:'battlefield',version:ctx.sourceZoneVersion};g.delayed.push({on:'cleanupStep',once:true,src:s,ctrl:p,name:s.name+' — return at cleanup',run:next=>current(r)?next.g.move(s,'hand'):undefined});break;}
    case 'urborg':if(c){const key=await option(ctx,['first strike','swampwalk'].map(key=>({key,label:key})));loseKeywords(ctx,c,k=>k===key);}break;
    case 'vhati':if(c){const stat=await option(ctx,[{key:'power',label:'Base power 1'},{key:'toughness',label:'Base toughness 1'}]);g.addOracleBasePT(c,{[stat]:1,temporary:true});g.recalc();}break;
    default:throw Error('Unknown v95 effect '+e.mode);
   }
   g.recalc();return true;
  }
 });
 function isTargetingSpell(g,d,s){const src=d.src;if(!src)return false;const resolving=g.c1516Resolving,so=resolving?.kind==='spell'&&resolving.card?.iid===src.iid?resolving:g.stack.find(x=>x.kind==='spell'&&x.card?.iid===src.iid);return !!so&&(so.ctx?.targets||so.targets||[]).flat(Infinity).includes(s);}
 async function exileBatch(ctx,cards){const prior=ctx.g.v90ZoneBatch;ctx.g.v90ZoneBatch={};try{return await ctx.g.exileMany(cards);}finally{ctx.g.v90ZoneBatch=prior;}}
 function loseKeywords(ctx,c,test){const all=['first strike','plainswalk','islandwalk','swampwalk','mountainwalk','forestwalk','nonbasic landwalk','legendary landwalk','snow landwalk','snow plainswalk','snow islandwalk','snow swampwalk','snow mountainwalk','snow forestwalk','desertwalk','artifact landwalk'],keys=[...new Set([...c.cur.kw,...all])].filter(test);ctx.g.addOracleAnimation(c,{types:[],subtypes:[],retainTypes:true,retainAllSubtypes:true,keywords:[],removeKeywords:keys,temporary:true});}
 async function chooseShapeshifter(ctx,optional){if(optional&&!await yes(ctx,'Choose a new number?'))return;const key=await option(ctx,Array.from({length:8},(_,n)=>({key:String(n),label:String(n)})));ctx.src.meta.chosenNumberV95=Number(key);ctx.g.recalc();}
 // Preserve entry replacement semantics before a land is structurally inserted.
 // The native C14 entry hook also runs for entries that replace the battlefield
 // destination; returning a land to hand, graveyard or library never pays here.
 const copyEntriesV95=new WeakMap();
 const entryDefinition=M.OracleV8LandTypes.entryDefinition;
 M.OracleV8LandTypes.entryDefinition=function(g,c,d){const out=entryDefinition(g,c,d),row=copyEntriesV95.get(c);return g._entryReplacementPhase&&row?.version===c.zoneVersion&&out.asEnters===row.effect?{...out,asEnters:undefined}:out;};
 function entrySuppressed(g,c,p,def){const view=Object.create(c);view.cur=null;Object.defineProperty(view,'zone',{value:'battlefield'});Object.defineProperty(view,'ctrl',{value:p});Object.defineProperty(view,'def',{value:def});return g.bf().some(s=>!s.cur?.abilitiesDisabled&&(s.def.statics||[]).some(r=>r.oracleBasicLandTypes&&!r.oracleOperation.retain&&r.affects(g,s,view)));}
 const entry=M.C14.entry;
 M.C14.entry=async function(g,c,opts){
  let result=await entry(g,c,opts);if(result.toZone&&result.toZone!=='battlefield')return result;
  let face=result.opts?.c14EntryCopy||(opts.oracleFace&&c.oracleFaces?M.OracleV8Faces.faceDefinition(c.oracleFaces,opts.oracleFace):c.def);
  const ctrl=result.opts?.ctrl||opts.ctrl||c.owner,source=lock(c),ctx={g,src:c,you:ctrl};
  // Closed native land-copy entry descriptors (including Vesuva) make their
  // original optional choice before the replacement-land payment. The copied
  // definition is carried by the existing native entry-copy option; the
  // original replacement function is suppressed for this entry incarnation.
  const copies=(face.oracleImplementation||[]).filter(op=>op.kind==='copy-as-enters-v8'),copy=copies.length===1?copies[0]:null;
  if(copy?.filter?.what==='land'&&copy.filter.zone==='battlefield'&&face.asEnters&&!entrySuppressed(g,c,ctrl,face)){
   const matches=H.genericTargetSpec(copy.filter,[],0).filter,from=(g._battlefieldEntryReplacementSnapshot||g.bf()).filter(x=>x!==c&&matches(g,x,ctrl,c));
   if(from.length){
    const [chosen]=await pick(ctx,from,0,1,ctrl,'Choose a land to copy as '+c.name+' enters');
    if(!current(source))return {...result,toZone:c.zone};
    copyEntriesV95.set(c,{version:source.version+1,effect:face.asEnters});
    if(chosen){face=M.OracleV8Copies.modifiedDefinition(chosen.isCopyOf||chosen.def,copy.modifications||{},{target:H.genericTargetSpec,compile:operations=>H.compileOracleScript({id:'v95-entry-copy'},{raw:{},implementation:operations})});result={...result,opts:{...result.opts,c14EntryCopy:face,...(copy.tapped?{tapped:true}:{})}};}
   }
  }
  const rule=face.entrySacrificeV95;if(!rule||entrySuppressed(g,c,ctrl,face))return result;
  const pool=(g._battlefieldEntryReplacementSnapshot||g.bf()).filter(x=>x!==c&&x.ctrl===ctrl&&x.is('Land')&&x.hasSub(rule.type)&&(!rule.untapped||!x.tapped)&&g.canSacrifice(x));
  const [chosen]=await pick(ctx,pool,0,1,ctrl,'Sacrifice '+(rule.untapped?'an untapped ':'a ')+rule.type+' or put '+c.name+' into your graveyard');
  if(!current(source))return {...result,toZone:c.zone};
  if(!chosen||!await g.sacrifice(ctrl,chosen))return {...result,toZone:'graveyard'};
  return result;
 };
 // A shroud exception changes only targeting by the chosen player. Other
 // targeting restrictions and protection remain authoritative.
 const legalTargets=G.legalTargets;
 G.legalTargets=function(spec,src,ctrl,opts={}){const saved=[];for(const row of this.untilEffects)if(row.kind==='autumnShroudV95'&&row.player===ctrl&&row.card.zone==='battlefield'&&row.card.zoneVersion===row.version){const c=row.card;if(!c.cur)continue;saved.push({c,shroud:c.cur.shroud,kw:c.cur.kw.has('shroud')});c.cur.shroud=false;c.cur.kw.delete('shroud');}try{return legalTargets.call(this,spec,src,ctrl,opts);}finally{for(const {c,shroud,kw} of saved){c.cur.shroud=shroud;if(kw)c.cur.kw.add('shroud');}}};
 const attachment=G.legalEntryAttachment;G.legalEntryAttachment=function(c,host,p){return !(c.hasSub('Aura')&&host?.cur?.cantBeEnchantedV95)&&attachment.call(this,c,host,p);};
 M.OracleV20.handlers.unshift({canAttach(g,c,host){if(c.hasSub('Aura')&&host?.cur?.cantBeEnchantedV95)return false;}});
 const emit=G.emit;G.emit=async function(on,d,...args){
  if(on==='upkeep'){(this.upkeepCountsV95||=new Map()).set(d.player,upkeepOrdinal(this,d.player)+1);this.untilEffects=this.untilEffects.filter(row=>{const e=row.v95UpkeepExpiry;return !e||e.end||e.player!==d.player||upkeepOrdinal(this,d.player)<e.ordinal;});this.recalc();}
  if(on==='attacks'||on==='blocks'){const c=on==='blocks'?d.blocker||d.card:d.card;if(c)c.meta.clockworkCombatV95=this.combat;}
  return emit.call(this,on,d,...args);
 };
 const upkeep=G.runUpkeepStepV90;G.runUpkeepStepV90=async function(p,...args){const result=await upkeep.call(this,p,...args);this.untilEffects=this.untilEffects.filter(row=>{const e=row.v95UpkeepExpiry;return !e||!e.end||e.player!==p||upkeepOrdinal(this,p)<e.ordinal;});this.recalc();return result;};
 const turn=G.runTurn;G.runTurn=function(...args){for(const c of this.battlefield)c.meta.untappedAtTurnStartV95={version:c.zoneVersion,turn:this.turnNo+1,untapped:!c.tapped};return turn.apply(this,args);};
 const costs=M.OracleV20Costs,old={feasible:costs.activationFeasible,prepare:costs.prepareActivation,validate:costs.validateActivation,commit:costs.commitActivation};
 const custom=cost=>['exile-creature-v95','dream-counter-v95'].includes(cost.additionalCostV20?.kind);
 const pool=(g,p,s,kind)=>kind==='dream-counter-v95'?s.counters.dream>0?[s]:[]:g.creatures(p);
 costs.activationFeasible=function(g,p,s,cost,m,a){if(!custom(cost))return old.feasible.call(this,g,p,s,cost,m,a);return pool(g,p,s,cost.additionalCostV20.kind).length>0&&(!m||g.canPayMana(p,m,{card:s,isAbility:true,ability:a},{excludeCards:cost.tap?[s]:[]}));};
 costs.prepareActivation=async function(ctx,cost){if(!custom(cost))return old.prepare.call(this,ctx,cost);const kind=cost.additionalCostV20.kind,cards=pool(ctx.g,ctx.you,ctx.src,kind),chosen=kind==='dream-counter-v95'?cards:await pick(ctx,cards,1,1,ctx.you,'Exile a creature you control');if(!chosen.length)return false;ctx.paymentV95={kind,source:lock(ctx.src),row:lock(chosen[0])};return this.validateActivation(ctx,cost);};
 costs.validateActivation=function(ctx,cost){if(!custom(cost))return old.validate.call(this,ctx,cost);const r=ctx.paymentV95;return !!r&&current(r.source)&&ctx.src.ctrl===ctx.you&&current(r.row)&&pool(ctx.g,ctx.you,ctx.src,r.kind).includes(r.row.card);};
 costs.commitActivation=async function(ctx,cost){if(!custom(cost))return old.commit.call(this,ctx,cost);if(!this.validateActivation(ctx,cost))return false;const r=ctx.paymentV95;if(r.kind==='dream-counter-v95')ctx.g.removeCounters(ctx.src,'dream',1);else await ctx.g.move(r.row.card,'exile');return true;};
 const v27Prepare=costs.prepareActivation;costs.prepareActivation=async function(ctx,cost){const result=await v27Prepare.call(this,ctx,cost);if(result&&cost.additionalCostV20?.kind==='permanent-paid-v27'&&ctx.src.def.paperV95==='Phyrexian Devourer')for(const row of ctx.oracleActivationPlanV20?.rows||[])row.mvV95=row.card.mv;return result;};
 // Rasputin's seven-counter maximum is a prohibition; it applies after all
 // counter multipliers and also to entry, proliferation and external effects.
 const cap=(g,c,kind,n)=>{if(kind!=='dream'||!c.def.dreamCapV95)return n;const entry=g._entryReplacementPhase&&c.zone==='battlefield'&&!g.bf().includes(c),applies=entry?M.OracleV8AbilityLoss.entryCharacteristics(g,c).abilityLossTimestamp===-Infinity:active(c);return applies?Math.min(n,Math.max(0,7-(c.counters.dream||0))):n;};
 const counterAmount=M.OracleV91Counters.amount;M.OracleV91Counters.amount=async function(g,c,kind,n,by,o){return cap(g,c,kind,await counterAmount(g,c,kind,n,by,o));};
 const add=G.addCounters;G.addCounters=function(c,kind,n,silent,by){if(kind!=='dream'||!c.def.dreamCapV95)return add.call(this,c,kind,n,silent,by);const saved=this.v91CountersApplied,actual=cap(this,c,kind,saved?n:M.OracleV91Counters.syncAmount(this,c,kind,n,by||this.turnPlayer,{effect:!this.v91CounterCost}));this.v91CountersApplied=true;try{return add.call(this,c,kind,actual,silent,by);}finally{this.v91CountersApplied=saved;}};
 const put=G.putCountersV91;G.putCountersV91=async function(c,kind,n,o={}){if(kind!=='dream'||!c.def.dreamCapV95)return put.call(this,c,kind,n,o);if(!this.canPutCountersV18(c,kind)||c.phasedOut)return 0;const r=lock(c),actual=await M.OracleV91Counters.amount(this,c,kind,n,o.by||this.turnPlayer,{effect:o.effect!==false});if(!current(r))return 0;const saved=this.v91CountersApplied;this.v91CountersApplied=true;try{this.addCounters(c,kind,actual,o.silent||false,o.by||this.turnPlayer);}finally{this.v91CountersApplied=saved;}return actual;};
})(globalThis.MTG||={});
