'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.WLM,G=M.Game.prototype,SC=M.SCRIPTS,T=M.T;
 C.commanderColor=c=>c.commander&&c.def.wlmClara&&c.owner.wlmClaraColor?[c.owner.wlmClaraColor]:null;
 const castDefinition=G.castDefinition;G.castDefinition=function(c,a){const d=castDefinition.call(this,c,a),colors=C.commanderColor(c);return colors?{...d,colorsOverride:colors}:d;};
 // A chosen commander color belongs to this player/game, never to the shared
 // card catalog. In the printed decks the missing third color is forced.
 const build=G.buildDeck;G.buildDeck=function(p,deck,defs,chosen){
    const result=build.call(this,p,deck,defs,chosen);
  if(p.commanders.some(c=>c.def.wlmClara)){
   const outside=M.deckColorIdentity(deck,defs).filter(color=>!p.colorIdentity.includes(color));
   p.wlmClaraColor=outside[0]||p.wlmClaraColor||'W';p.wlmClaraChoose=!outside.length;
   p.colorIdentity=[...new Set([...p.colorIdentity,p.wlmClaraColor])];this.recalc();
  }return result;
 };
 const start=G.start;G.start=async function(...args){for(const p of this.players)if(p.wlmClaraChoose){const color=await C.option({g:this,you:p,src:p.commanders.find(c=>c.def.wlmClara)},['W','U','B','R','G'].map(key=>({key,label:{W:'White',U:'Blue',B:'Black',R:'Red',G:'Green'}[key]})),'Choose Clara Oswald’s color');if(!['W','U','B','R','G'].includes(color))throw Error('Invalid Clara color');p.wlmClaraColor=color;const colors=p.commanders.filter(c=>!c.def.wlmClara).flatMap(c=>M.cardColorIdentity(c.def));p.colorIdentity=[...new Set([...colors,color])];}this.recalc();return start.apply(this,args);};
 const search=C.search;const searched=async(ctx,p,...a)=>{if(ctx.g.canSearchLibrary?.(p)!==false)await ctx.g.emit('searchedLibrary',{player:p});return search(ctx,p,...a);};
 for(const helper of Object.values(M))if(helper&&typeof helper==='object'&&helper.search===search)helper.search=searched;
 const enterMany=C.enterMany;C.enterMany=async(ctx,...args)=>{const g=ctx.g,previous=g._graveyardLeaveBatch,batch=[];g._graveyardLeaveBatch=batch;try{return await enterMany(ctx,...args);}finally{g._graveyardLeaveBatch=previous;if(previous)previous.push(...batch);else if(batch.length)await g.emit('cardsLeftGraveyard',{cards:batch.map(r=>r.card),snapshots:batch.map(r=>r.snap),destinations:batch.map(r=>r.to),to:batch.every(r=>r.to===batch[0].to)?batch[0].to:null});}};
 C.snapshotBlockers=g=>[...(g.wlmCastGrants||[]).some(r=>r.turn===g.turnNo&&g.byIid(r.card)?.zoneVersion===r.version)?['temporary graveyard casting permission']:[],...(g.wlmDalekDeathTurn===g.turnNo&&g.wlmDalekDeathPower>0?['Dalek death history this turn']:[])];
 C.mechanic('mentor',SC['Danny Pink']);
 C.mechanic('afflict',SC['Neheb, the Eternal'],{n:3});
 C.mechanic('myriad',SC['The Master, Multiplied']);
 const drawOne=G.drawOne;G.drawOne=async function(p,...args){const prior=this.wlmFirstDrawStep;this.wlmFirstDrawStep=this.phase==='draw'&&this.turnPlayer===p&&!p.turnState._firstDrawDone;try{return await drawOne.call(this,p,...args);}finally{this.wlmFirstDrawStep=prior;}};
 SC['Leela, Sevateem Warrior'].triggers[0].filter=(g,c,d)=>d.player!==c.ctrl&&!g.wlmFirstDrawStep;
 const snapshot=G.snapshot;G.snapshot=function(c,...a){return {...snapshot.call(this,c,...a),wlmAlone:!!(c.attacking&&this.creatures(c.ctrl).filter(x=>x.attacking).length===1||c.blocking&&this.creatures(c.ctrl).filter(x=>x.blocking).length===1)};};
 SC['Become the Pilot'].oracleAuraControl=true;delete SC['Become the Pilot'].onAttach;
 C.reanimationAuraLegal=(g,a,h)=>{
  if(!a.def.wlmAnimate&&!a.def.wlmNecromancy)return undefined;
  const r=a.meta.wlmReanimated;if(!r)return a.def.wlmAnimate?!!h&&h.zone==='graveyard'&&h.is('Creature'):undefined;
  return !!h&&h.iid===r.iid&&h.zoneVersion===r.version&&h.zone==='battlefield'&&h.is('Creature')&&!a.is('Creature')&&!g.isProtectedFrom(h,a);
 };
 const attach=G.attach;G.attach=async function(a,h,...args){if(a.def.wlmAnimate||a.def.wlmNecromancy){if(!C.reanimationAuraLegal(this,a,h))return false;M.C1516.detach(this,a);a.attachedTo=h.iid;if(!h.attachments.includes(a.iid))h.attachments.push(a.iid);this.recalc();return true;}return attach.call(this,a,h,...args);};
 const entry=M.C14.entry;M.C14.entry=async(g,c,opts)=>{
  const r=await entry(g,c,opts);if(r.toZone&&r.toZone!=='battlefield')return r;
  const p=r.opts.ctrl||c.owner,d=r.opts.c14EntryCopy||c.def;
  if((d.types.includes('Artifact')||d.super?.includes('Legendary')||d.subtypes?.includes('Saga'))&&C.sources(g,p,'wlmDisplaced').some(s=>s!==c))r.opts={...r.opts,c14EntryCopy:{...d,types:[...new Set([...d.types,'Creature'])],subtypes:[...new Set([...d.subtypes,'Dinosaur'])],power:7,toughness:7,cdaPower:null,cdaToughness:null,oracleCharacteristicPT:false}};
  return r;
 };
 const etb=G.handleETB;G.handleETB=async function(c,o={}){
  const d=o.c14EntryCopy||c.def,p=c.ctrl;
  if(d.saga&&C.sources(this,p,'wlmReadAhead').some(s=>s!==c)){const ns=Array.from({length:d.saga.length},(_,i)=>i+1),n=Number(await C.option({g:this,src:c,you:p},ns.map(n=>({key:String(n),label:'Begin at chapter '+n})),'Read ahead'));if(!ns.includes(n))throw Error('Invalid read ahead');c.counters.lore=n-1;c.meta.cwwReadAhead=n;}
  const counters={...o.additionalCounters};
  if(c.faceDown&&d.types.includes('Creature'))counters.flying=(counters.flying||0)+C.sources(this,p,'wlmVeiled').length;
  if(d.unleash||d.subtypes?.includes('Dog')&&C.sources(this,p,'wlmTesak').some(s=>s!==c))if(await C.yes({g:this,src:c,you:p},'Unleash: enter with a +1/+1 counter?'))counters['+1/+1']=(counters['+1/+1']||0)+1;
  if(c.castMeta?.alt?.wlmKind==='eighth')o={...o,cdkExileOnLeave:true};
  return etb.call(this,c,{...o,additionalCounters:counters});
 };
 C.protectedToken=(g,c,p)=>c?.zone==='battlefield'&&c.isToken&&c.is('Creature')&&c.ctrl===p&&C.sources(g,p,'wlmMultiplied').length>0;
 const resolve=G.resolveTop;G.resolveTop=async function(...a){const prior=this.wlmResolving;this.wlmResolving=this.stack.at(-1);try{return await resolve.apply(this,a);}finally{this.wlmResolving=prior;}};
 const canSacrifice=G.canSacrifice;G.canSacrifice=function(c){return !(this.wlmResolving?.kind==='trigger'&&C.protectedToken(this,c,this.wlmResolving.ctrl))&&canSacrifice.call(this,c);};
 const move=G.move;G.move=async function(c,to,o={}){
  if(to==='exile'&&this.wlmResolving?.kind==='trigger'&&C.protectedToken(this,c,this.wlmResolving.ctrl))return c;
  if(to==='battlefield'&&c.is('Creature')&&(c.zone==='exile'||c.zone==='stack'&&c.castMeta?.from==='exile')&&this.untilEffects.some(e=>e.kind==='wlmDontBlink')){await move.call(this,c,'library');if(c.zone==='library')M.shuffle(c.owner.library,this.rnd);return c;}
  const diaries=c.zone==='stack'&&to==='graveyard'&&this.wlmResolving?.card===c&&!this.wlmResolving.isCopy&&this.wlmResolving.castOpts?.from==='hand'&&C.isIS(c)?(this.wlmResolving.wlmDiaries||[]):[];
  // The imprint trigger establishes a replacement on the particular spell;
  // countering or moving it before resolution never uses that replacement.
  if(diaries.length){const row=diaries[0];await move.call(this,c,'exile',o);if(c.zone==='exile'&&C.current(row))C.remember({g:this,sourceMeta:row.card.meta},[c]);return c;}
  return move.call(this,c,to,o);
 };
 SC['Thijarian Witness'].triggers=[C.death('Exile the creature that fought alone and investigate',async ctx=>{if(C.currentDeath(ctx)){await ctx.g.move(ctx.data.card,'exile');await C.investigate(ctx);}},{filter:(g,c,d)=>d.card!==c&&!!d.snap.wlmAlone})];
 SC['Skeleton Crew'].triggers=[C.trigger('cardsLeftGraveyard','Create a Skeleton Pirate',ctx=>ctx.g.makeTokens(C.token('Skeleton Pirate',['Skeleton','Pirate'],2,2,['B']),ctx.you),{filter:(g,c,d)=>d.snapshots.some(s=>s.owner===c.ctrl&&s.types.includes('Creature'))})];
 const damageGroups=async(g,hits)=>{await g.emit('wlmDamageGroup',{hits});for(const player of new Set(hits.map(h=>h.player)))await g.emit('wlmPlayerDamageGroup',{hits:hits.filter(h=>h.player===player),player});};
 const damageBatch=G.damageBatch;G.damageBatch=async function(...a){if(this.wlmDamageBatch)return damageBatch.apply(this,a);this.wlmDamageBatch=[];try{return await damageBatch.apply(this,a);}finally{const hits=this.wlmDamageBatch;delete this.wlmDamageBatch;if(hits.length)await damageGroups(this,hits);}};
 const emit=G.emit;G.emit=async function(name,d){
  if(name==='damageToPlayer'){
   d.wlmSnapshot||={ctrl:d.src?.ctrl,subtypes:[...(d.src?.cur?.subtypes||d.src?.def?.subtypes||[])],kw:[...(d.src?.cur?.kw||[])],creature:!!d.src?.is('Creature')};
   if(!this._damageEventQueue){const hit={player:d.player,n:d.n,combat:d.combat,...d.wlmSnapshot};if(this.wlmDamageBatch)this.wlmDamageBatch.push(hit);else await damageGroups(this,[hit]);}
  }
  if(name==='cast'&&d.card?.def.wlmNecromancy&&(this.turnPlayer!==d.player||!['main1','main2'].includes(this.phase)||this.stack.length>1))d.card.castMeta.wlmNecroCleanup=true;
  if(name==='etb'&&d.card.def.wlmNecromancy&&d.card.castMeta?.wlmNecroCleanup){const iid=d.card.iid,version=d.card.zoneVersion;this.delayed.push({on:'cleanupStep',once:true,src:d.card,ctrl:d.card.ctrl,name:'Necromancy: sacrifice at cleanup',run:ctx=>{const c=ctx.g.byIid(iid);return c?.zone==='battlefield'&&c.zoneVersion===version&&ctx.g.sacrifice(c.ctrl,c);}});}
  if(name==='cast'&&d.isInstantSorcery&&d.so.from==='hand')for(const s of C.sources(this,null,'wlmDiary'))this.queueTrigger({src:s,ctrl:s.ctrl,name:'River Song’s Diary: imprint this resolving spell',data:{so:d.so,row:C.row(s)},run:ctx=>{if(ctx.g.stack.includes(ctx.data.so))(ctx.data.so.wlmDiaries||=[]).push(ctx.data.row);}});
  return emit.call(this,name,d);
 };
 const pirates=(d,p,combat=false,opponents=false)=>d.hits.filter(h=>h.ctrl===p&&h.subtypes.includes('Pirate')&&(!combat||h.combat)&&(!opponents||h.player!==p));
 for(const name of ['Malcolm, Keen-Eyed Navigator','Breeches, Brazen Plunderer','Francisco, Fowl Marauder','Ramirez DePietro, Pillager']){
  const s=SC[name];(s.triggers||=[]).push(C.trigger(['explore','cast'].includes(s.wlmPirateDamage)?'wlmPlayerDamageGroup':'wlmDamageGroup','Pirate damage: '+s.wlmPirateDamage,async ctx=>{const kind=s.wlmPirateDamage,ps=[...new Set(pirates(ctx.data,ctx.you,kind==='cast',['treasure','play'].includes(kind)).map(h=>h.player))];if(kind==='treasure')await ctx.g.makeTokens(M.TOKENS.treasure,ctx.you,{n:ps.length});else for(const p of ps){if(kind==='explore'){if(C.same(ctx))await C.explore(ctx,ctx.src);}else for(const c of await C.exileTop(ctx,1,p))C.playGrant(ctx,c,kind==='play'?{turn:ctx.g.turnNo,anyColor:true}:{spellsOnly:true});}},{filter:(g,c,d)=>pirates(d,c.ctrl,s.wlmPirateDamage==='cast',['treasure','play'].includes(s.wlmPirateDamage)).length>0}));
 }
 SC['Quartzwood Crasher'].triggers=[C.trigger('wlmPlayerDamageGroup','Create a trampling Dinosaur Beast for each player damaged',async ctx=>{const hits=ctx.data.hits.filter(h=>h.ctrl===ctx.you&&h.combat&&h.creature&&h.kw.includes('trample'));for(const p of new Set(hits.map(h=>h.player))){const n=hits.filter(h=>h.player===p).reduce((n,h)=>n+h.n,0);await ctx.g.makeTokens(C.token('Dinosaur Beast',['Dinosaur','Beast'],n,n,['G'],['trample']),ctx.you);}},{filter:(g,c,d)=>d.hits.some(h=>h.ctrl===c.ctrl&&h.combat&&h.creature&&h.kw.includes('trample'))})];
 const recalc=G.recalc;G.recalc=function(){const r=recalc.call(this);for(const c of this.bf())if(c.is('Creature')){
  if(!C.legendary(c)&&c.is('Artifact'))for(const s of C.sources(this,c.ctrl,'wlmMyriad'))c.cur.kw.add('myriad');
  if(C.live(c)&&['Nacatl War-Pride','The Foretold Soldier'].includes(c.def.name)){c.cur.mustBeBlocked=true;c.cur.maxBlockers=Math.min(c.cur.maxBlockers??Infinity,1);}
  if(c.attacking&&this.bf().some(a=>a.def.wlmBat&&C.live(a)&&a.attachedTo===c.iid))c.cur.wlmDalekBlock=true;
  if((c.def.unleash&&C.live(c)||c.hasSub('Dog')&&C.sources(this,c.ctrl,'wlmTesak').some(s=>s!==c))&&c.counters['+1/+1']>0)c.cur.cantBlock=true;
 }return r;};
 // These are mana triggers, so the chosen color is available during payment.
 const manaSources=G.manaSources;G.manaSources=function(p,...args){const out=manaSources.call(this,p,...args),n=this.monarch===p?C.sources(this,p,'wlmRegal').length:0;if(!n)return out;return out.map(s=>{if(!s.card?.is('Land')||!s.m.cost?.tap)return s;let produce=s.produce;for(let i=0;i<n;i++)produce=[...new Map(produce.flatMap(o=>['W','U','B','R','G'].map(color=>({...o,[color]:(o[color]||0)+1}))).map(o=>[['W','U','B','R','G','C'].map(k=>o[k]||0).join(','),o])).values()];return {...s,produce};});};
 const abilityCost=G.abilityManaCost;G.abilityManaCost=function(p,c,raw,ctx={}){const r=abilityCost.call(this,p,c,raw,ctx),targets=C.flat(ctx.targets||[]);if(c.def.wlmWayta&&(targets.length?targets.every(c=>c.ctrl===p):this.creatures(p).length>=2))r.generic=Math.max(0,r.generic-2);if(!ctx.isMana)for(const s of C.sources(this,null,'wlmKopala'))if(s.ctrl!==p&&targets.some(c=>c.ctrl===s.ctrl&&c.hasSub?.('Merfolk')))r.generic+=2;return r;};
 const cost=G.spellCost;G.spellCost=function(p,c,a={}){const r=cost.call(this,p,c,a);for(const s of C.sources(this,null,'wlmKopala'))if(s.ctrl!==p&&C.flat(a.targets||[]).some(c=>c.ctrl===s.ctrl&&c.hasSub?.('Merfolk')))r.generic+=2;return r;};
 SC['Vizier of Many Faces'].gyAbility={label:'Embalm {3}{U}{U}',cost:'{3}{U}{U}',sorcery:true,run:ctx=>{const d={...ctx.src.def,cost:null,wlmEmbalmed:true,colorsOverride:['W'],subtypes:[...new Set([...ctx.src.def.subtypes,'Zombie'])]};return ctx.g.makeTokens(d,ctx.you,{copyOf:d});}};
 SC['Timestream Navigator'].abilities=[{label:'Put this creature on the bottom: take an extra turn',cost:{mana:'{2}{U}{U}',tap:true,wlmBottomSelf:true},cond:(g,c,p)=>!!p.cityBlessing,run:C.extraTurn}];
 SC['Bronzebeak Foragers'].abilities=[{label:'Put an exiled card with mana value X into its owner’s graveyard',cost:{mana:'{X}{W}'},wlmExactX:true,targets:[{zone:'exile',what:'card',anyExile:true,filter:(g,c,p,s)=>(s.meta.wlmExiled||[]).some(r=>r.iid===c.iid&&r.version===c.zoneVersion)}],run:async ctx=>{const c=ctx.targets[0];if(c?.mv===ctx.x){await ctx.g.move(c,'graveyard');await ctx.g.gainLife(ctx.you,ctx.x,ctx.src);}}}];
 // The target's printed mana value fixes X; prepare it before mana payment.
 for(const name of ['Bronzebeak Foragers','Lazav, the Multifarious'])for(const a of SC[name].abilities)a.prepareTargets=ctx=>{if(!ctx.targets?.[0])return false;ctx.x=ctx.targets[0].mv;return true;};
 C.aiPlanScore=(g,p,a)=>{
  const c=a.card;if(!c)return 0;const bf=g.bf().filter(c=>c.ctrl===p&&C.live(c)),has=name=>bf.some(c=>c.def.name===name);let score=0;
  if(a.kind==='cast'){
   if(a.from&&a.from!=='hand'&&has('The Thirteenth Doctor'))score+=4;
   if(a.from==='exile'&&M.C1719.playRecords(g,p,c).some(r=>r.turn===g.turnNo||r.wlmUntilEnd===p.idx))score+=3;
   if(a.alt?.faceDownCast&&(has('Kaust, Eyes of the Glade')||has('Duskana, the Rage Mother')))score+=4;
   if(c.hasSub('Merfolk')&&has('Hakbal of the Surging Soul')&&g.phase==='main1')score+=4;
   if(c.hasSub('Dinosaur')&&bf.some(s=>s.def.name==='Pantlaza, Sun-Favored'&&s.meta.wlmDiscoverTurn!==g.turnNo))score+=4;
   if(C.historic(c)&&(has('Sarah Jane Smith')||has('Alistair, the Brigadier')||has('Displaced Dinosaurs')))score+=3;
   if(c.is('Creature')&&c.is('Artifact')&&(has('Davros, Dalek Creator')||has('Missy')))score+=2;
   if(c.hasSub('Vampire')&&has('Clavileño, First of the Blessed'))score+=3;
   if(c.hasSub('Pirate')&&has('Admiral Brass, Unsinkable'))score+=2;
   if((c.hasSub('Cat')||c.hasSub('Dog'))&&has('Rin and Seri, Inseparable'))score+=3;
   if(/surveil/i.test(c.def.oracle||'')&&has('Mirko, Obsessive Theorist'))score+=3;
   if(a.alt?.lifeCost)score-=a.alt.lifeCost*(p.life<15?2:0.4);
  }
  if(a.kind==='activate'&&c.def.wlmProjektor&&!p.hand.some(c=>c.def.morph||c.def.disguise))score-=15;
  return score;
 };
 const token=C.token;C.token=(name,subs,p,t,colors,kws=[],extra={})=>{if(name==='Human'&&extra.ward)extra={tokenImageName:'WHO Human Ward',...extra};const aliases={'Dalek':'WHO Dalek','Vampire Demon':'LCC Vampire Demon','Merfolk':'LCC Merfolk','Alien Angel':'WHO Alien Angel','Cat Soldier':'SLD Cat Soldier','Skeleton Pirate':'LCC Skeleton Pirate','Alien Insect':'WHO Alien Insect','Alien Rhino':'WHO Alien Rhino','Dinosaur Beast':'LCC Dinosaur Beast','Mutant':'WHO Mutant','Warrior':'WHO Warrior','Ooze':'MKC Ooze'};return token(name,subs,p,t,colors,kws,{...(aliases[name]?{tokenImageName:aliases[name]}:{}),...(name==='Vampire'?{tokenImageName:colors.includes('W')?'LCC Vampire':'LCC Black Vampire'}:{}),...extra});};
 for(const [key,alias]of Object.entries({wlmDalek:'WHO Dalek',wlmVampire:'LCC Vampire',wlmVampireDemon:'LCC Vampire Demon',wlmMerfolk:'LCC Merfolk',wlmAngel:'WHO Alien Angel',wlmRaniMark:'WHO Mark of the Rani',wlmCatSoldier:'SLD Cat Soldier'}))M.TOKENS[key].tokenImageName=alias;
 C.secretVote=async(ctx,options)=>{const votes=[];for(const p of ctx.g.apnapFrom(ctx.you)){let n=1+C.sources(ctx.g,p,'vnExtraVote').length;for(let i=0;i<n;i++){if(i&& !await C.yes({...ctx,you:p},'Cast an additional vote?'))continue;const key=await C.option(ctx,options,'Secret vote',p,'wlmSecretVote');if(!options.some(o=>o.key===key))throw Error('Invalid secret vote');votes.push({player:p,key});}}ctx.g.lg('Votes revealed: '+votes.map(r=>r.player.name+' — '+r.key).join('; '));return votes;};
})();
