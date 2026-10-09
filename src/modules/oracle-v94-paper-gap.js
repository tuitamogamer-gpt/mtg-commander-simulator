'use strict';
((M) => {
  const H=M.OracleV20.helpers, G=M.Game.prototype;
  const live=(c,v=c?.zoneVersion)=>c?.zone==='battlefield'&&c.zoneVersion===v&&!c.phasedOut;
  const active=c=>live(c)&&!c.cur?.abilitiesDisabled;
  const same=ctx=>H.sameBattlefieldSource(ctx);
  const ref=c=>({card:c,version:c.zoneVersion,zone:c.zone});
  const current=r=>r.card.zone===r.zone&&r.card.zoneVersion===r.version;
  const subject=(ctx,n=0)=>H.genericEffectSubjects(ctx,n)[0];
  const target=(what='creature',controller='any',extra={})=>H.genericTargetSpec(what==='spell-or-ability'?{what:'permanent',zone:'stack',controller,min:1,max:1,alternatives:[{what:'spell',zone:'stack',controller},{what:'stack-ability',zone:'stack',controller,abilityKinds:['ability','trigger']}],...extra}:{what,zone:what==='player'?'player':'battlefield',controller,min:1,max:1,...extra},[],0);
  const filtered=(spec,filter)=>{const previous=spec.filter;return {...spec,filter:(g,c,p,s)=>previous(g,c,p,s)&&filter(g,c,p,s)};};
  const defender=s=>s.attacking instanceof M.Player?s.attacking:s.attacking?.is?.('Battle')?s.attacking.protector:s.attacking?.ctrl;
  async function option(ctx,options,p=ctx.you,prompt=ctx.src.name){const key=await p.controller.decide(ctx.g,{type:'chooseOption',options,prompt,aiHint:{kind:'optTrigger',src:ctx.src}});if(!options.some(o=>o.key===key))throw Error('Invalid v94 option');return key;}
  const yes=(ctx,prompt,p=ctx.you)=>option(ctx,[{key:'yes',label:'Yes'},{key:'no',label:'No'}],p,prompt).then(key=>key==='yes');
  async function choose(ctx,pool,min=0,max=1,p=ctx.you,prompt=ctx.src.name){max=Math.min(max,pool.length);min=Math.min(min,max);if(!max)return [];const rows=pool.map(ref),cards=await p.controller.decide(ctx.g,{type:'chooseCards',from:pool,min,max,prompt,aiHint:{kind:'bestCard',src:ctx.src}});if(!Array.isArray(cards)||cards.length<min||cards.length>max||new Set(cards).size!==cards.length||cards.some(c=>!rows.some(r=>r.card===c&&current(r))))throw Error('Invalid v94 selection');return cards;}
  const pay=async(ctx,mana,p=ctx.you)=>ctx.g.canPayMana(p,M.parseCost(mana),null)&&await yes(ctx,'Pay '+mana+'?',p)&&await ctx.g.payMana(p,M.parseCost(mana),null);
  const put=(ctx,c,kind,n)=>ctx.g.putCountersV91(c,kind,n,{by:ctx.you,effect:true});
  const pump=(ctx,c,p,t,kws=[])=>live(c)&&M.E.pumpUntilEOT(ctx.g,c,p,t,kws);
  const damage=(ctx,to,n)=>ctx.g.damageBatch([{src:H.oracleDamageSource(ctx),target:to,n}],{deferSBA:true});
  const delayed=(ctx,on,run,filter=null,extra={})=>ctx.g.delayed.push({on,once:true,src:ctx.src,ctrl:ctx.you,name:ctx.src.name+' — delayed '+on,filter,run:next=>run({...next,sourceZoneVersion:ctx.sourceZoneVersion,sourceMeta:ctx.sourceMeta,oracleSourceCapture:ctx.oracleSourceCapture}),...extra});
  const noAssignment=ctx=>ctx.g.untilEffects.push({kind:'oracleNoCombatAssignmentV19',iid:ctx.src.iid,zoneVersion:ctx.sourceZoneVersion,expires:'eot'});
  const redirection=(ctx,n,recipient,destination,extra={})=>H.runGenericEffect(ctx,{action:'damage-rule-v20',mode:'redirect',n,once:true,source:{all:true},recipient,destination,...extra});
  const prevent=(ctx,n)=>H.runGenericEffect(ctx,{action:'damage-rule-v20',mode:'prevent',n,once:false,source:{all:true},recipient:{ref:0},target:0});
  const grantTrigger=(ctx,c,trigger)=>ctx.g.untilEffects.push({kind:'oracleGrantedOperation',iid:c.iid,zoneVersion:c.zoneVersion,field:'extraTriggers',grants:[trigger],keywords:[],timestamp:ctx.g.nextOracleTimestamp(),expires:'object'});
  const sourceKeywords={
    'Mesa Pegasus':['flying','banding'],'Mistmoon Griffin':['flying'],'Nether Shadow':['haste'],'Phantasmal Mount':['flying'],'Rogue Skycaptain':['flying'],'Scarwood Bandits':['forestwalk'],'Seraph':['flying'],'Serendib Djinn':['flying'],'Shield Bearer':['banding'],'Silver Wyvern':['flying'],'Soltari Guerrillas':['shadow'],'Spire Serpent':['defender'],"Varchild's War-Riders":['trample'],'Wall of Diffusion':['defender']
  };
  function upkeepCost(tr,script,mana){script.oracleCumulativeV89=true;tr('upkeep',(g,s,d)=>d.player===s.ctrl,async ctx=>{if(!same(ctx))return;await put(ctx,ctx.src,'age',1);const n=ctx.src.counters.age||0,cost=mana(n);if(!await pay(ctx,cost)&&same(ctx))await ctx.g.sacrifice(ctx.you,ctx.src);});}
  function stateSacrifice(tr,predicate){tr('state',null,ctx=>same(ctx)&&ctx.g.sacrifice(ctx.you,ctx.src),[],{stateMandatorySacrifice:true,stateTest:predicate});}
  function musicTrigger(){return {on:'upkeep',musicV94:true,desc:'Musician — music-counter upkeep',filter:(g,s,d)=>d.player===s.ctrl,run:async ctx=>{if(same(ctx)&&!await pay(ctx,'{'+(ctx.src.counters.music||0)+'}')&&same(ctx))await ctx.g.destroy(ctx.src);}};}
  function vesuvanDefinition(model,source){const base=M.OracleV8Faces.copyTokenDefinition(model);return {...base,colorsOverride:(source.def.colorsOverride||M.colorsOfCost(source.def.cost||'')).slice(),triggers:[...(base.triggers||[]),vesuvanTrigger()],v94Vesuvan:true};}
  function vesuvanTrigger(){return {on:'upkeep',desc:'Vesuvan Doppelganger — become a copy',filter:(g,s,d)=>d.player===s.ctrl,targets:[target()],run:async ctx=>{const c=subject(ctx);if(c&&same(ctx)&&await yes(ctx,'Become a copy of '+c.name+'?')){M.OracleV8Copies.applyCopy(ctx.g,ctx.src,vesuvanDefinition(c,ctx.src));ctx.g.recalc();}}};}
  function sacrificePairs(g,p,s,snow){const creatures=g.creatures(p).filter(c=>g.canSacrifice(c)),swamps=g.lands(p).filter(c=>c.hasSub('Swamp')&&(!snow||c.cur.super.includes('Snow'))&&g.canSacrifice(c));return creatures.flatMap(a=>swamps.filter(b=>a!==b).map(b=>[a,b]));}
  const handler={compile(op,script,entry,h){
    if(op.kind!=='paper-creature-v94')return false;
    script.kws=[...new Set([...(script.kws||[]),...(sourceKeywords[op.mode]||[])])];
    const tr=(on,filter,run,targets=[],extra={})=>{const row={on,filter,run,targets,desc:op.mode,...extra};h.triggers.push(row);return row;};
    const ab=(cost,run,targets=[],extra={})=>{const a={cost,run,targets,aiScore:()=>3,oracleCompiled:true,...extra};h.abilities.push(a);return a;};
    const stat=(apply,phase=5)=>h.statics.push({phase,apply});
    const self=(g,s,d)=>d.card===s,own=(g,s,d)=>d.player===s.ctrl;
    const unblocked=(g,s)=>!!s.attacking&&!s.wasBlocked&&!(s.blockedBy||[]).length;
    const defendedTarget=what=>(g,s)=>[filtered(target(what),(_g,c)=>c.ctrl===defender(s))];
    switch(op.mode){
      case 'Mesa Pegasus':case 'Shield Bearer':break;
      case 'Minion of Leshrac':
        stat((g,s)=>s.cur.protectionFrom.push('B'));
        tr('upkeep',own,async ctx=>{const pool=ctx.g.creatures(ctx.you).filter(c=>c!==ctx.src&&ctx.g.canSacrifice(c)),[c]=pool.length&&await yes(ctx,'Sacrifice another creature?')?await choose(ctx,pool,1,1):[];if(c){await ctx.g.sacrifice(ctx.you,c);return;}const n=await ctx.g.damagePlayer(H.oracleDamageSource(ctx),ctx.you,5);if(n>0&&same(ctx))ctx.g.tap(ctx.src);});
        ab({tap:true},ctx=>{const c=subject(ctx);return c&&ctx.g.destroy(c);},[filtered(target('permanent'),(g,c)=>c.is('Creature')||c.is('Land'))]);break;
      case 'Mistmoon Griffin':
        tr('dies',self,async ctx=>{const c=ctx.src,v=ctx.data.snap?.zoneVersion;if(c.zone==='graveyard'&&c.zoneVersion===v+1)await ctx.g.move(c,'exile');const top=ctx.you.graveyard.findLast(card=>card.is('Creature'));if(top)await ctx.g.putPermanentOntoBattlefield(top,ctx.you);});break;
      case 'Musician':
        upkeepCost(tr,script,n=>'{'+n+'}');
        ab({tap:true},async ctx=>{const c=subject(ctx);if(!c)return;await put(ctx,c,'music',1);const existing=(c.def.triggers||[]).concat(c.cur.extraTriggers||[]).some(t=>t.musicV94);if(!existing&&live(c))grantTrigger(ctx,c,musicTrigger());ctx.g.recalc();},[target()]);break;
      case 'Necrite':
        tr('blockersDeclared',unblocked,async ctx=>{const c=subject(ctx);if(c&&same(ctx)&&await yes(ctx,'Sacrifice Necrite?')&&await ctx.g.sacrifice(ctx.you,ctx.src)){ctx.g.untilEffects.push({kind:'v94NoRegeneration',row:ref(c),expires:'eot'});await ctx.g.destroy(c,{noRegen:true});}},defendedTarget('creature'));break;
      case 'Nether Shadow':{
        const above=(g,s)=>s.zone==='graveyard'&&s.owner.graveyard.slice(s.owner.graveyard.indexOf(s)+1).filter(c=>c.is('Creature')).length>=3;
        tr('upkeep',(g,s,d)=>d.player===s.owner&&above(g,s),async ctx=>{const c=ctx.src;if(c.zone==='graveyard'&&c.zoneVersion===ctx.sourceZoneVersion&&above(ctx.g,c)&&await yes(ctx,'Return Nether Shadow?'))await ctx.g.putPermanentOntoBattlefield(c,ctx.you);},[],{zone:'graveyard',onlyIf:(g,s)=>above(g,s)});break;}
      case 'Old Man of the Sea':
        stat((g,s)=>s.cur.optionalUntap=true);
        ab({tap:true},ctx=>{const c=subject(ctx);if(c&&same(ctx)&&ctx.src.tapped&&c.power<=ctx.src.power){const row=M.OracleV8Control.gainWhile(ctx,c,'tapped');if(row){row.v94PowerBound={source:ref(ctx.src),target:ref(c)};ctx.g.recalc();}}},[filtered(target(),(g,c,p,s)=>c.power<=s.power)]);break;
      case 'Orcish Conscripts':
        stat((g,s)=>{(s.cur.attackGroupRestrictions||=[]).push(group=>group.filter(c=>c!==s&&c.ctrl===s.ctrl).length>=2);(s.cur.blockGroupRestrictions||=[]).push(group=>new Set(group.filter(c=>c!==s&&c.ctrl===s.ctrl)).size>=2);});break;
      case 'Orcish Farmer':
        ab({tap:true},ctx=>{const c=subject(ctx);if(!c)return;ctx.g.untilEffects.push({kind:'oracleLandTypes',iid:c.iid,zoneVersion:c.zoneVersion,timestamp:ctx.g.nextOracleTimestamp(),types:['Swamp'],retain:false,expires:'object',v94UntilUntap:c.ctrl});ctx.g.recalc();},[target('land')]);break;
      case 'Orcish Squatters':
        tr('blockersDeclared',unblocked,async ctx=>{const c=subject(ctx);if(c&&same(ctx)&&await yes(ctx,'Gain control of '+c.name+'?')){const row=M.OracleV8Control.gainWhile(ctx,c,'controlled');if(row)noAssignment(ctx);ctx.g.recalc();}},defendedTarget('land'));break;
      case 'Personal Incarnation':
        script.v94OwnerActivation=true;
        ab({mana:'{0}'},ctx=>redirection({...ctx,targets:[ctx.src.owner]},1,{ref:'self'},{ref:0}),[],{oracleAnyPlayer:true,cond:(g,s,p)=>p===s.owner});
        tr('dies',self,ctx=>ctx.g.loseLife(ctx.src.owner,Math.ceil(Math.max(0,ctx.src.owner.life)/2),ctx.src));break;
      case 'Petra Sphinx':
        ab({tap:true},async ctx=>{const p=subject(ctx);if(!p||p.lost)return;const name=await M.OracleV20Spells.chooseName({...ctx,you:p}),c=p.library.at(-1),r=c&&ref(c);if(!c)return;await ctx.g.revealToHuman({cards:[c],ctrl:p,kind:'reveal',includeLands:true});if(current(r))await ctx.g.move(c,M.OracleV8NameGroups.names(c).includes(name)?'hand':'graveyard');},[target('player')]);break;
      case 'Phantasmal Mount':
        ab({tap:true},ctx=>{const c=subject(ctx);if(!c)return;pump(ctx,c,1,1,['flying']);const source={card:ctx.src,version:ctx.sourceZoneVersion,zone:'battlefield'},mount=ref(c);delayed(ctx,'lto',next=>current(mount)&&next.g.sacrifice(mount.card.ctrl,mount.card),(g,d)=>d.card===source.card&&d.snap?.zoneVersion===source.version,{expires:'eot'});delayed(ctx,'lto',next=>current(source)&&next.g.sacrifice(source.card.ctrl,source.card),(g,d)=>d.card===mount.card&&d.snap?.zoneVersion===mount.version,{expires:'eot'});},[filtered(target('creature','you'),(g,c)=>c.toughness<=2)]);break;
      case 'Preacher':
        stat((g,s)=>s.cur.optionalUntap=true);
        ab({tap:true},ctx=>{const c=subject(ctx);if(c)M.OracleV8Control.gainWhile(ctx,c,'tapped');ctx.g.recalc();},[{...target('creature','opponent'),chooseByOpponent:true,ownByDecisionPlayerV60:true}]);break;
      case 'Predatory Nightstalker':
        tr('etb',self,async ctx=>{const p=subject(ctx);if(!p||!await yes(ctx,'Have '+p.name+' sacrifice a creature?'))return;const pool=ctx.g.creatures(p).filter(c=>ctx.g.canSacrifice(c)),[c]=await choose(ctx,pool,1,1,p);if(c)await ctx.g.sacrifice(p,c);},[target('player','opponent')]);break;
      case 'Rock Hydra':
        script.etbCounters={kind:'+1/+1',n:(g,c)=>Math.max(0,c.castMeta?.x||0)};
        (script.replace||=[]).push({event:'damage',oraclePrevention:true,applies:(g,d,s)=>d.target===s&&d.n>0&&(s.counters['+1/+1']||0)>0,run:(g,d,s)=>{const n=Math.min(d.n,s.counters['+1/+1']||0);g.removeCounters(s,'+1/+1',n);return d.n-(d.preventionAllowed?n:0);}});
        ab({mana:'{R}'},ctx=>H.runGenericEffect(ctx,{action:'damage-rule-v20',mode:'prevent',n:1,source:{all:true},recipient:{ref:'self'},once:false}));
        ab({mana:'{R}{R}{R}'},ctx=>same(ctx)&&put(ctx,ctx.src,'+1/+1',1),[],{cond:(g,s,p)=>g.turnPlayer===p&&g.phase==='upkeep'});break;
      case 'Rogue Skycaptain':
        tr('upkeep',own,async ctx=>{if(!same(ctx))return;await put(ctx,ctx.src,'wage',1);if(await pay(ctx,'{'+2*(ctx.src.counters.wage||0)+'}'))return;if(same(ctx)){ctx.g.removeCounters(ctx.src,'wage',ctx.src.counters.wage||0);const p=await M.E.chooseOpponent(ctx.g,ctx.you,{source:ctx.src});if(p&&same(ctx))M.OracleV8Control.gain(ctx.g,ctx.src,p);ctx.g.recalc();}});break;
      case 'Scarwood Bandits':
        ab({mana:'{2}{G}',tap:true},async ctx=>{const c=subject(ctx);if(!c)return;for(const p of ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you).filter(p=>p!==ctx.you))if(await pay(ctx,'{2}',p))return;M.OracleV8Control.gainWhile(ctx,c,'battlefield');ctx.g.recalc();},[target('artifact')]);break;
      case 'Seasinger':
        stateSacrifice(tr,(g,s)=>!g.lands(s.ctrl).some(c=>c.hasSub('Island')));
        stat((g,s)=>s.cur.optionalUntap=true);
        ab({tap:true},ctx=>{const c=subject(ctx);if(c)M.OracleV8Control.gainWhile(ctx,c,'controlled-tapped');ctx.g.recalc();},[filtered(target(),(g,c)=>g.lands(c.ctrl).some(l=>l.hasSub('Island')))]);break;
      case 'Seraph':
        script.v94Seraph=true;
        tr('dies',(g,s,d)=>d.snap?.types.includes('Creature')&&(d.snap.sourceMeta?.v94DamageSources||[]).some(r=>r.turn===g.turnNo&&r.iid===s.iid&&r.version===((g._simultaneousLeaveSources||[]).find(x=>x.card===s)?.snap?.zoneVersion??s.zoneVersion)),ctx=>{const card=ctx.data.card,r=ref(card),duration=M.OracleV8Untap.capture(ctx,'controlled');delayed(ctx,'endStep',async next=>{if(!current(r)||r.zone!=='graveyard')return;await next.g.putPermanentOntoBattlefield(card,next.you);if(live(card)){const row=ref(card);if(!M.OracleV8Untap.sourceValid(next.g,duration))await next.g.sacrifice(card.ctrl,card);else next.g.untilEffects.push({kind:'v94SeraphDebt',source:ctx.src,sourceVersion:ctx.sourceZoneVersion,controller:ctx.you,duration,row,expires:'object'});}});});break;
      case 'Serendib Djinn':
        tr('upkeep',own,async ctx=>{const [c]=await choose(ctx,ctx.g.lands(ctx.you).filter(c=>ctx.g.canSacrifice(c)),1,1);if(!c)return;const island=c.hasSub('Island');if(await ctx.g.sacrifice(ctx.you,c)&&island)await damage(ctx,ctx.you,3);});
        stateSacrifice(tr,(g,s)=>!g.lands(s.ctrl).length);break;
      case 'Shyft':
        tr('upkeep',own,async ctx=>{if(!same(ctx)||!await yes(ctx,'Choose new colors for Shyft?'))return;const options=Array.from({length:31},(_,i)=>{const colors='WUBRG'.split('').filter((c,j)=>(i+1)&(1<<j));return {key:colors.join(''),label:colors.join(', '),colors};}),key=await option(ctx,options),colors=options.find(o=>o.key===key).colors;if(same(ctx))ctx.g.addOracleAnimation(ctx.src,{types:[],retainTypes:true,retainAllSubtypes:true,colors,temporary:false});});break;
      case 'Silver Wyvern':{
        const spec=filtered(target('spell-or-ability'),(g,so,p,s)=>{const cards=(so.targets||so.ctx?.targets||[]).flat(Infinity).filter(Boolean);return cards.length===1&&cards[0]===s;});
        ab({mana:'{U}'},async ctx=>{const so=subject(ctx);if(!so||!ctx.g.stack.includes(so))return;const specs=so.targetSpecs||so.ctx?.boundTargetSpecs||(so.kind==='spell'?ctx.g.spellTargetSpecs(so.card,so.castOpts,so.ctrl):[]),spec=specs?.[0];if(!spec)return;const pool=ctx.g.legalTargets(spec,so.card||so.srcCard,so.ctrl).filter(c=>c instanceof M.CardInst&&c.is('Creature')&&c!==ctx.src),[c]=await choose(ctx,pool,1,1);if(c)await M.OracleV20Spells.retarget({...ctx,oracleRetargetV20:{force:c,mustChange:true}},so);},[spec]);break;}
      case 'Soldevi Machinist':h.mana.push({cost:{tap:true},produce:[{C:2}],restrictAbilities:true,restrict:(g,a)=>!!a?.isAbility&&!a.isSpecialAction&&!a.turnFaceUp&&!a.foretellAction&&!!a.card&&a.card.is('Artifact')});break;
      case 'Soltari Guerrillas':
        ab({mana:'{0}'},ctx=>redirection(ctx,'all',{player:'opponents'},{ref:0},{source:{ref:'self'},combat:'combat'}),[target()]);break;
      case 'Spectral Bears':
        tr('attacks',(g,s,d)=>d.card===s&&!!defender(s)&&!g.bf().some(c=>c.ctrl===defender(s)&&!c.isToken&&c.colors.includes('B')),ctx=>{const p=ctx.data.v94AttackDefenders?.get(ctx.src);if(p&&!ctx.g.bf().some(c=>c.ctrl===p&&!c.isToken&&c.colors.includes('B')))ctx.g.untilEffects.push({kind:'v94SkipUntap',row:{card:ctx.src,version:ctx.sourceZoneVersion,zone:'battlefield'},player:ctx.you,expires:'object'});});break;
      case 'Spined Sliver':
        tr('becomesBlocked',(g,s,d)=>d.attacker?.hasSub('Sliver'),ctx=>{const c=ctx.data.attacker;if(live(c)){const n=(c.blockedBy||[]).length;pump(ctx,c,n,n);}});break;
      case 'Spiny Starfish':
        ab({mana:'{U}'},ctx=>{if(same(ctx))ctx.src.regenShield++;});
        tr('endStep',(g,s)=>s.meta.v94Regenerated?.turn===g.turnNo&&s.meta.v94Regenerated.version===s.zoneVersion,ctx=>{const n=ctx.sourceMeta?.v94Regenerated?.n||ctx.src.meta.v94Regenerated?.n||0;return n&&ctx.g.makeTokens({name:'Starfish',cost:'',types:['Creature'],subtypes:['Starfish'],super:[],power:'0',toughness:'1',colorsOverride:['U'],kws:[]},ctx.you,{n});});break;
      case 'Spire Serpent':
        stat((g,s,bf)=>{if(bf.filter(c=>c.ctrl===s.ctrl&&c.is('Artifact')).length>=3){s.cur.power+=2;s.cur.toughness+=2;s.cur.defenderCanAttack=true;}});break;
      case 'The Fallen':
        script.v94Fallen=true;
        tr('upkeep',own,async ctx=>{const row=ctx.sourceMeta?.v94FallenDamage||ctx.src.meta.v94FallenDamage;if(row?.version!==ctx.sourceZoneVersion)return;const targets=row.rows.filter(r=>r.card instanceof M.Player?!r.card.lost&&r.card!==ctx.you:current(r)&&r.card.is('Planeswalker')).map(r=>r.card);if(targets.length)await ctx.g.damageBatch(targets.map(target=>({src:H.oracleDamageSource(ctx),target,n:1})),{deferSBA:true});});break;
      case 'The Wretched':
        tr('endCombat',(g,s)=>!!s.attacking&&(s.blockedBy||[]).length>0,ctx=>{for(const r of (ctx.data.v94WretchedBlockers?.get(ctx.src)||[]))if(current(r))M.OracleV8Control.gainWhile(ctx,r.card,'controlled');ctx.g.recalc();});break;
      case 'Time Elemental':
        for(const on of ['attacks','blocks'])tr(on,(g,s,d)=>d.card===s||d.blocker===s,ctx=>{const r={card:ctx.src,version:ctx.sourceZoneVersion,zone:'battlefield'};delayed(ctx,'endCombat',async next=>{if(current(r))await next.g.sacrifice(r.card.ctrl,r.card);await damage(next,ctx.you,5);});});
        ab({mana:'{2}{U}{U}',tap:true},ctx=>{const c=subject(ctx);return c&&ctx.g.move(c,'hand');},[filtered(target('permanent'),(g,c)=>!(c.attachments||[]).some(id=>g.byIid(id)?.hasSub('Aura')))]);break;
      case "Varchild's War-Riders":
        script.oracleCumulativeV89=true;
        tr('upkeep',own,async ctx=>{if(!same(ctx))return;await put(ctx,ctx.src,'age',1);const n=ctx.src.counters.age||0;if(!await yes(ctx,'Have an opponent create '+n+' Survivor tokens?')){if(same(ctx))await ctx.g.sacrifice(ctx.you,ctx.src);return;}for(let i=0;i<n;i++){const p=await M.E.chooseOpponent(ctx.g,ctx.you,{source:ctx.src});if(!p){if(same(ctx))await ctx.g.sacrifice(ctx.you,ctx.src);return;}await ctx.g.makeTokens({name:'Survivor',cost:'',types:['Creature'],subtypes:['Survivor'],super:[],power:'1',toughness:'1',colorsOverride:['R'],kws:[]},p);}});
        tr('becomesBlocked',(g,s,d)=>d.attacker===s,ctx=>{const n=Math.max(0,(ctx.src.blockedBy||[]).length-1);pump(ctx,ctx.src,n,n);});break;
      case 'Vesuvan Doppelganger':
        script.v94Vesuvan=true;
        script.asEnters=async(g,s)=>{const ctx={g,src:s,you:s.ctrl,sourceZoneVersion:s.zoneVersion},[c]=await choose(ctx,g.creatures().filter(c=>c!==s),0,1,s.ctrl,'Enter as a copy of a creature?');if(c){M.OracleV8Copies.applyCopy(g,s,vesuvanDefinition(c,s));g.recalc();}};break;
      case 'Viscerid Drone':
        for(const snow of [false,true])ab({tap:true,additionalCostV20:{kind:'v94-sacrifice-pair',snow}},ctx=>{const c=subject(ctx);if(c){ctx.g.untilEffects.push({kind:'v94NoRegeneration',row:ref(c),expires:'eot'});return ctx.g.destroy(c,{noRegen:true});}},[filtered(target(),(g,c)=>snow||!c.is('Artifact'))]);break;
      case "Volrath's Shapeshifter":
        script.v94Volrath=true;
        ab({mana:'{2}'},async ctx=>{const [c]=await choose(ctx,ctx.you.hand,1,1);if(c)await ctx.g.discard(ctx.you,[c]);});break;
      case 'Wall of Diffusion':
        stat((g,s)=>s.cur.v94BlocksShadow=true);break;
      case 'Wandering Mage':
        ab({mana:'{W}',life:1},ctx=>prevent(ctx,2),[target()]);
        ab({mana:'{U}'},ctx=>prevent(ctx,1),[filtered(target(),(g,c)=>c.hasSub('Cleric')||c.hasSub('Wizard'))]);
        ab({mana:'{B}',additionalCostV20:{kind:'blight',n:1}},ctx=>prevent(ctx,2),[filtered(target('any'),(g,c)=>c instanceof M.Player||c.is?.('Planeswalker'))]);break;
      case 'Wiitigo':
        script.etbCounters={kind:'+1/+1',n:6};script.v94Wiitigo=true;
        tr('upkeep',own,async ctx=>{if(!same(ctx))return;const n=ctx.data.v94WiitigoCombat?.get(ctx.src)||0;if(n>0)await put(ctx,ctx.src,'+1/+1',1);else ctx.g.removeCounters(ctx.src,'+1/+1',1);});break;
      case 'Wood Elemental':
        script.asEnters=async(g,s)=>{const ctx={g,src:s,you:s.ctrl},pool=g.lands(s.ctrl).filter(c=>c!==s&&c.hasSub('Forest')&&!c.tapped&&g.canSacrifice(c)),cards=await choose(ctx,pool,0,pool.length),snapshots=cards.map(ref);await g.sacrificeMany(s.ctrl,cards);s.meta.v94Wood={version:s.zoneVersion,n:snapshots.filter(r=>!current(r)).length};};
        script.oracleCharacteristicPT=true;script.cdaPower=(g,s)=>s.meta.v94Wood?.version===s.zoneVersion?s.meta.v94Wood.n:0;script.cdaToughness=script.cdaPower;break;
      case 'Wormwood Treefolk':
        for(const [mana,kw]of [['{G}{G}','forestwalk'],['{B}{B}','swampwalk']])ab({mana},async ctx=>{if(same(ctx))pump(ctx,ctx.src,0,0,[kw]);await damage(ctx,ctx.you,2);});break;
      case 'Xenic Poltergeist':
        ab({tap:true},ctx=>{const c=subject(ctx);if(!c)return;ctx.g.addOracleAnimation(c,{types:['Artifact','Creature'],retainTypes:true,retainAllSubtypes:true,power:c.mv,toughness:c.mv,temporary:false});const row=ctx.g.untilEffects.findLast(r=>r.kind==='oracleAnimation'&&r.iid===c.iid&&r.zoneVersion===c.zoneVersion);if(row)row.v94UntilUpkeep=ctx.you;},[filtered(target('artifact'),(g,c)=>!c.is('Creature'))]);break;
      case 'Ydwen Efreet':
        tr('blocks',(g,s,d)=>d.blocker===s,async ctx=>{if((await ctx.g.flipCoin(ctx.you,{source:ctx.src})).won||!same(ctx))return;const attackers=(ctx.g.combat?.attackers||[]).filter(c=>(c.blockedBy||[]).includes(ctx.src));ctx.g.removeFromCombat(ctx.src);for(const c of attackers)if(!(ctx.g.v80Blocks||[]).some(r=>r.combat===ctx.g.combat&&r.attacker.card===c&&r.attacker.version===c.zoneVersion&&r.blocker.card!==ctx.src))c.wasBlocked=false;const r=ref(ctx.src);ctx.g.untilEffects.push({expires:'eot',apply:()=>{if(current(r))r.card.cur.cantBlock=true;}});ctx.g.recalc();});break;
      case 'Zhalfirin Crusader':
        M.applyOracleMechanic(script,{kind:'flanking'});
        ab({mana:'{1}{W}'},ctx=>redirection(ctx,1,{ref:'self'},{ref:0}),[target('any')]);break;
      case 'Zodiac Dragon':
        tr('dies',(g,s,d)=>d.card===s&&d.card.owner===d.snap?.ctrl,async ctx=>{const c=ctx.src;if(c.zone==='graveyard'&&c.zoneVersion===(ctx.data.graveyardZoneVersion??ctx.data.snap?.zoneVersion+1)&&await yes(ctx,'Return Zodiac Dragon to your hand?'))await ctx.g.move(c,'hand');});break;
      default:throw Error('Unsupported v94 paper creature '+op.mode);
    }
    return true;
  }};
  M.OracleV20.handlers.unshift(handler);

  // Costs are chosen and locked before payment. Both sacrifices are one
  // simultaneous payment, including tapping the Drone when it is sacrificed.
  const C=M.OracleV20Costs;
  const oldFeasible=C.activationFeasible,oldPrepare=C.prepareActivation,oldValidate=C.validateActivation,oldCommit=C.commitActivation;
  C.activationFeasible=function(g,p,s,cost,mana,a){
    const d=cost.additionalCostV20;if(d?.kind!=='v94-sacrifice-pair')return oldFeasible.call(this,g,p,s,cost,mana,a);
    return sacrificePairs(g,p,s,d.snow).some(cards=>!mana||g.canPayMana(p,mana,{card:s,isAbility:true,ability:a},{excludeCards:cost.tap?[s]:[],protectedSacrifices:cards,reservedLife:cost.life||0}));
  };
  C.prepareActivation=async function(ctx,cost){
    const d=cost.additionalCostV20;if(d?.kind!=='v94-sacrifice-pair')return oldPrepare.call(this,ctx,cost);
    const pairs=sacrificePairs(ctx.g,ctx.you,ctx.src,d.snow),creatures=[...new Set(pairs.map(row=>row[0]))];if(!pairs.length)return false;
    const [creature]=await choose(ctx,creatures,1,1,ctx.you,'Sacrifice a creature'),[land]=await choose(ctx,pairs.filter(row=>row[0]===creature).map(row=>row[1]),1,1,ctx.you,'Sacrifice '+(d.snow?'a snow Swamp':'a Swamp'));
    if(!creature||!land)return false;
    ctx.v94SacrificePlan={source:ref(ctx.src),rows:[ref(creature),ref(land)]};return this.validateActivation(ctx,cost);
  };
  C.validateActivation=function(ctx,cost){
    const d=cost.additionalCostV20;if(d?.kind!=='v94-sacrifice-pair')return oldValidate.call(this,ctx,cost);
    const plan=ctx.v94SacrificePlan;return !!plan&&current(plan.source)&&active(ctx.src)&&ctx.src.ctrl===ctx.you&&plan.rows.every(current)&&sacrificePairs(ctx.g,ctx.you,ctx.src,d.snow).some(cards=>cards.every((card,i)=>card===plan.rows[i].card));
  };
  C.commitActivation=async function(ctx,cost){
    const d=cost.additionalCostV20;if(d?.kind!=='v94-sacrifice-pair')return oldCommit.call(this,ctx,cost);
    if(!this.validateActivation(ctx,cost))return false;
    const rows=ctx.v94SacrificePlan.rows;ctx.sacd=rows.map(r=>ctx.g.snapshot(r.card));if(cost.tap)ctx.g.tap(ctx.src);await ctx.g.sacrificeMany(ctx.you,rows.map(r=>r.card));return true;
  };

  // Text-changing effects occupy layer three and do not alter copiable
  // characteristics. A copied Shapeshifter receives its own controller's top.
  const beforeText=M.C1719.textDefinition,volrathDefinitions=new WeakMap();
  const volrathDiscard={cost:{mana:'{2}'},targets:[],oracleCompiled:true,run:async ctx=>{const [c]=await choose(ctx,ctx.you.hand,1,1);if(c)await ctx.g.discard(ctx.you,[c]);},aiScore:()=>2};
  M.C1719.textDefinition=function(c){
    if(c.def.v94VolrathBase)c.def=c.def.v94VolrathBase;
    const base=c.def,top=c.ctrl?.graveyard?.at(-1);
    if(c.zone==='battlefield'&&!c.faceDown&&base.v94Volrath&&top?.is('Creature')){
      let models=volrathDefinitions.get(base);if(!models)volrathDefinitions.set(base,models=new WeakMap());let def=models.get(top.def);
      if(!def){def={...top.def,oracleId:base.oracleId,oracleBatch:base.oracleBatch,oracleImportEligible:base.oracleImportEligible,v94Volrath:true,v94VolrathBase:base,abilities:[...(top.def.abilities||[]),volrathDiscard]};models.set(top.def,def);}
      c.def=def;
    }
    return beforeText(c);
  };
  const beforeCopy=M.OracleV8Faces.copyTokenDefinition;
  M.OracleV8Faces.copyTokenDefinition=function(c,...args){if(c.def.v94VolrathBase)c=Object.assign(Object.create(c),{def:c.def.v94VolrathBase,isCopyOf:c.isCopyOf?.v94VolrathBase||c.isCopyOf});return beforeCopy(c,...args);};

  const oldCantRegenerate=M.oracleCantRegenerateV15;
  M.oracleCantRegenerateV15=(g,c)=>g.untilEffects.some(r=>r.kind==='v94NoRegeneration'&&current(r.row)&&r.row.card===c)||oldCantRegenerate?.(g,c)||false;
  const beforeRegeneration=M.oracleRegeneratedV56;
  M.oracleRegeneratedV56=async(g,c)=>{const old=c.meta.v94Regenerated;if(old?.turn!==g.turnNo||old.version!==c.zoneVersion)c.meta.v94Regenerated={turn:g.turnNo,version:c.zoneVersion,n:0};c.meta.v94Regenerated.n++;return beforeRegeneration?.(g,c);};
  const canBlock=G.canBlock;
  G.canBlock=function(blocker,attacker,...args){
    if(!blocker.cur?.v94BlocksShadow||!attacker.kw('shadow')||blocker.kw('shadow'))return canBlock.call(this,blocker,attacker,...args);
    blocker.cur.kw.add('shadow');try{return canBlock.call(this,blocker,attacker,...args);}finally{blocker.cur.kw.delete('shadow');}
  };

  const beforeUntap=M.oracleUntapActionsV60;
  M.oracleUntapActionsV60=async(g,p)=>{
    g.untilEffects=g.untilEffects.filter(r=>r.v94UntilUntap!==p);
    for(const row of g.untilEffects)if(row.kind==='v94SkipUntap'&&row.player===p){row.kind='oracleNextUntapV12';row.filters=[];row.expires='nextUntapV12';}
    g.recalc();return beforeUntap?.(g,p);
  };
  const nextUntap=M.oracleNextUntapV12;
  M.oracleNextUntapV12=(g,c,p)=>g.untilEffects.some(r=>r.kind==='oracleNextUntapV12'&&r.row&&r.player===p&&r.row.card===c&&current(r.row)&&c.ctrl===p)||nextUntap?.(g,c,p)||false;

  const beforeRecalc=G.recalc;
  G.recalc=function(...args){
    let result=beforeRecalc.apply(this,args);if(this.v94ControlRecalculation)return result;
    this.v94ControlRecalculation=true;
    try{
      let changed;
      do{changed=false;this.untilEffects=this.untilEffects.filter(r=>{if(!r.v94PowerBound)return true;const {source,target}=r.v94PowerBound,keep=current(source)&&current(target)&&target.card.power<=source.card.power;if(!keep)changed=true;return keep;});if(changed)result=beforeRecalc.apply(this,args);}while(changed);
      for(const debt of this.untilEffects.filter(r=>r.kind==='v94SeraphDebt')){
        const source=debt.source,ended=source.zone!=='battlefield'||source.zoneVersion!==debt.sourceVersion||source.ctrl!==debt.controller||(source.meta.oracleDurationControl?.epoch||0)!==(debt.duration.controlEpoch||0);
        if(!ended)continue;this.untilEffects=this.untilEffects.filter(r=>r!==debt);
        if(current(debt.row))this.queueTrigger({src:source,ctrl:debt.controller,sourceZoneVersion:debt.sourceVersion,name:'Seraph — sacrifice the returned creature',run:ctx=>current(debt.row)&&ctx.g.sacrifice(debt.row.card.ctrl,debt.row.card)});
      }
    }finally{this.v94ControlRecalculation=false;}
    return result;
  };

  const beforeEmit=G.emit;
  G.emit=async function(event,data,...args){
    if(event==='attacks')data={...data,v94AttackDefenders:new Map([[data.card,defender(data.card)]])};
    if(event==='upkeep'){
      const expires=this.untilEffects.some(r=>r.v94UntilUpkeep===data.player);this.untilEffects=this.untilEffects.filter(r=>r.v94UntilUpkeep!==data.player);if(expires)this.recalc();
      const combat=new Map();for(const c of this.bf().filter(c=>c.ctrl===data.player&&c.def.v94Wiitigo)){const row=c.meta.v94WiitigoCombat;combat.set(c,row?.version===c.zoneVersion?row.n:0);c.meta.v94WiitigoCombat={version:c.zoneVersion,n:0};}data={...data,v94WiitigoCombat:combat};
    }
    if(event==='endCombat'){const blockers=new Map();for(const c of this.bf())if(c.attacking)blockers.set(c,(c.blockedBy||[]).filter(live).map(ref));data={...data,v94WretchedBlockers:blockers};}
    if(event==='blocks'||event==='becomesBlocked'){
      const c=event==='blocks'?data.blocker:data.attacker;if(c){const old=c.meta.v94WiitigoCombat;if(old?.version!==c.zoneVersion)c.meta.v94WiitigoCombat={version:c.zoneVersion,n:0};c.meta.v94WiitigoCombat.n++;}
    }
    if(['dealtDamage','damageToPlayer'].includes(event)&&data.n>0&&data.src){
      const source=data.src,snap=data.sourceSnapshot||source._oracleDamageSnapshot,version=snap?.zoneVersion??source.zoneVersion,victim=event==='damageToPlayer'?data.player:data.target;
      if(victim instanceof M.CardInst&&victim.is('Creature')){const rows=(victim.meta.v94DamageSources||[]).filter(r=>r.turn===this.turnNo&&r.victimVersion===victim.zoneVersion);if(!rows.some(r=>r.iid===source.iid&&r.version===version))rows.push({iid:source.iid,version,victimVersion:victim.zoneVersion,turn:this.turnNo});victim.meta.v94DamageSources=rows;}
      if((snap?.def||source.def).v94Fallen&&(victim instanceof M.Player||victim?.is?.('Planeswalker'))){const old=source.meta.v94FallenDamage;if(old?.version!==version)source.meta.v94FallenDamage={version,rows:[]};const rows=source.meta.v94FallenDamage.rows;if(!rows.some(r=>r.card===victim&&(victim instanceof M.Player||current(r))))rows.push(victim instanceof M.Player?{card:victim}:ref(victim));}
    }
    return beforeEmit.call(this,event,data,...args);
  };
  M.OracleV94PaperGap={handler};
})(globalThis.MTG||={});
