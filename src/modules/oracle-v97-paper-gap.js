// Each imperative below corresponds to one exact printed source in the v97
// compiler. All choices, payments, moves and damage use native engine routes.
(function(M){
 'use strict';
 const H=M.OracleV20.helpers,G=M.Game.prototype;
 const E=(name,extra={})=>({action:'paper-effect-v97',name,...extra});
 const T=(what='creature',controller='any',extra={})=>({what,zone:what==='player'?'player':'battlefield',controller,min:1,max:1,...extra});
 const pred=fn=>({v20:{kind:'paper-predicate-v97',fn}});
 const lock=c=>({card:c,zone:c.zone,version:c.zoneVersion});
 const current=r=>r.card.zone===r.zone&&r.card.zoneVersion===r.version;
 const live=c=>c?.zone==='battlefield'&&!c.phasedOut;
 const subjects=(ctx,index=0)=>H.genericEffectSubjects(ctx,index);
 const run=(ctx,e)=>H.runGenericEffect(ctx,e);
 const players=(g,p)=>g.apnapFrom(p).filter(q=>!q.lost);
 async function option(ctx,options,p=ctx.you,prompt=ctx.src.name){const key=await p.controller.decide(ctx.g,{type:'chooseOption',options,prompt,aiHint:{kind:'optTrigger',src:ctx.src}});if(!options.some(o=>o.key===key))throw Error('Invalid v97 option');return key;}
 const yes=(ctx,prompt,p=ctx.you)=>option(ctx,[{key:'yes',label:'Yes'},{key:'no',label:'No'}],p,prompt).then(key=>key==='yes');
 async function pick(ctx,from,min=0,max=1,p=ctx.you,prompt=ctx.src.name){const rows=from.map(lock);min=Math.min(min,rows.length);max=Math.min(max,rows.length);if(!max)return [];const cards=await p.controller.decide(ctx.g,{type:'chooseCards',from,min,max,prompt,aiHint:{kind:'bestCard',src:ctx.src}});if(!Array.isArray(cards)||cards.length<min||cards.length>max||new Set(cards).size!==cards.length||cards.some(c=>!rows.some(r=>r.card===c&&current(r))))throw Error('Invalid v97 card choice');return cards;}
 async function number(ctx,min,max,p=ctx.you,prompt=ctx.src.name){const n=await p.controller.decide(ctx.g,{type:'chooseX',min,max,prompt,card:ctx.src,aiHint:{kind:'chooseX',card:ctx.src,min,max}});if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('Invalid v97 number');return n;}
 const reveal=(ctx,cards,p=ctx.you)=>cards.length?ctx.g.revealToHuman({cards,ctrl:p,kind:'reveal',includeLands:true}):Promise.resolve();
 const delayed=(ctx,on,fn,filter,extra={})=>ctx.g.delayed.push({on,once:true,src:ctx.src,ctrl:ctx.you,name:ctx.src.name,run:fn,filter,...extra});
 const nextUpkeepDraw=(ctx,n)=>delayed(ctx,'upkeep',later=>later.g.draw(later.you,n,later.src));
 const pay=async(ctx,mana,p=ctx.you)=>ctx.g.canPayMana(p,M.parseCost(mana),null)&&await yes(ctx,'Pay '+mana+'?',p)&&await ctx.g.payMana(p,M.parseCost(mana),null);
 const token=(name,power,toughness,subtypes,colors,kws=[])=>({name,cost:'',types:['Creature'],super:[],subtypes,power:String(power),toughness:String(toughness),colorsOverride:colors,kws});
 const exileSelf=ctx=>!ctx.so?.isCopy&&ctx.src.zone==='stack'?ctx.g.move(ctx.src,'exile'):Promise.resolve();
 const removeCombat=(g,c)=>g.removeFromCombat(c);
 async function orderTop(ctx,cards,p=ctx.you){const arranged=await pick(ctx,cards,cards.length,cards.length,p,'Order cards on top (first chosen is topmost)');for(const c of arranged.slice().reverse())await ctx.g.move(c,'library');}
 const damage=(ctx,targets,n,src=ctx.src,extra={})=>ctx.g.damageBatch(targets.filter(Boolean).map(target=>({src,target,n,...extra})),{});
 const freeze=(ctx,cards,n=1)=>{for(const c of cards)if(live(c)){c.meta.v97UntapSkips=(c.meta.v97UntapSkips||0)+n;}};
 const beforeBlocks=g=>g.phase==='combat'&&!g.combat?.blockersDeclared;
 const attacked=(g,p)=>g.phase==='combat'&&g.step==='attackers'&&(g.combat?.attackers||[]).some(c=>M.defendingPlayerV92(c.attacking)===p);
 function specs(n){
  if(['Blaze of Glory','Blood Lust','Broken Visage','Disharmony','Panic','Riding the Dilu Horse','Sacred Boon','Telekinesis','Word of Undoing'].includes(n))return [T('creature','any',{...(['Broken Visage','Disharmony'].includes(n)?{attacking:true}:{}),...(n==='Broken Visage'?{notType:'Artifact'}:{}),...(n==='Blaze of Glory'?pred((g,c)=>players(g,g.turnPlayer).some(p=>p===c.ctrl&&(g.combat?.attackers||[]).some(a=>M.defendingPlayerV92(a.attacking)===p))):{})})];
  if(['Bounty of the Hunt','Contagion'].includes(n))return [T('creature','any',{min:1,max:n==='Bounty of the Hunt'?3:2})];
  if(['Cannibalize','Retribution'].includes(n))return [T('creature',n==='Retribution'?'opponent':'any'),T('creature',n==='Retribution'?'opponent':'any',{sameControllerAsV20:0,differentFromAllPrevious:true})];
  if(['Crumble','Detonate'].includes(n))return [T('artifact')];
  if(['Death Spark',"Kaervek's Torch",'Lava Burst','Scars of the Veteran','Psychic Purge'].includes(n))return [T('any')];
  if(['Drain Power','Juxtapose','Leeches','Martyr-player','Mogg Infestation','Stunted Growth'].includes(n))return [T('player')];
  if(['Burning of Xinye','Dwarven Catapult','Forgotten Lore','Intuition','Word of Command'].includes(n))return [T('player','opponent')];
  if(n==='Energy Arc')return [T('creature','any',{min:0,max:Infinity})];
  if(n==='Flame Wave')return [T('any','any',pred((g,c)=>c instanceof M.Player||c.is?.('Planeswalker')))];
  if(n==='Fork')return [T('spell','any',{zone:'stack',...pred((g,c)=>g.isInstantSorcerySpell(c))})];
  if(n==='Power Sink')return [T('spell','any',{zone:'stack'})];
  if(n==='Kor Chant')return [T('creature','you'),T('creature','any',{differentFromAllPrevious:true})];
  if(n==='Legerdemain')return [T('permanent','any',pred((g,c)=>c.is('Creature')||c.is('Artifact'))),T('permanent','any',{differentFromAllPrevious:true})];
  if(n==='Meteor Shower')return [T('any','any',{min:1,max:Infinity})];
  if(n==='Misinformation')return [T('card','opponent',{zone:'graveyard',min:0,max:3,sameGraveyardV9:true})];
  if(n==='Primitive Justice')return [T('artifact'),T('artifact','any',{min:0,max:Infinity,differentFromAllPrevious:true}),T('artifact','any',{min:0,max:Infinity,differentFromAllPrevious:true})];
  if(n==='Soul Exchange')return [T('creature','you',{zone:'graveyard'})];
  if(n==='Winter Blast')return [T('creature','any',{min:0,max:Infinity})];
  return [];
 }
 const handler={
  compile(op,script,entry,h){
   if(op.kind!=='paper-spell-v97')return false;
   const n=op.name;script.paperSpellV97=n;
   const f=h.compileSpell({kind:'spell-generic',targets:specs(n),effects:[E(n)],optional:false});f.oracleOperation=op;f.targetOffset=h.spellFragments.reduce((sum,f)=>sum+(f.targets||[]).length,0);h.spellFragments.push(f);
   if(['Blaze of Glory','Disharmony','Gorilla War Cry','Panic'].includes(n))script.oracleCastRestriction=g=>beforeBlocks(g);
   if(n==='Harsh Justice')script.oracleCastRestriction=(g,c,p)=>attacked(g,p);
   if(n==='Reset')script.oracleCastRestriction=(g,c,p)=>g.turnPlayer!==p&&['draw','main1','combat','main2','end','cleanup'].includes(g.phase);
   if(n==='Necrologia')script.oracleCastRestriction=(g,c,p)=>g.turnPlayer===p&&g.phase==='end'&&['','endStep'].includes(g.step);
   if(n==='Detonate'){const spec=f.targets[0];f.targets[0]={...spec,bindOracleContext:ctx=>({...spec,filter:(g,c,p,s)=>spec.filter(g,c,p,s)&&c.mv===(ctx.so.x||0)})};}
   if(n==='Legerdemain'){const spec=f.targets[1];f.targets[1]={...spec,dependentFilter:(g,c,previous)=>['Artifact','Creature'].some(t=>previous[0]?.is(t)&&c.is(t))};}
   if(['Bounty of the Hunt','Contagion','Meteor Shower'].includes(n))f.prepareTargets=async ctx=>{const total=n==='Bounty of the Hunt'?3:n==='Contagion'?2:(ctx.so.x||0)+1,cards=subjects(ctx);if(!cards.length||cards.length>total)return false;ctx.so.v97Division=await M.E.divideDamage(ctx.g,ctx.you,ctx.src,cards,total,{...(['Bounty of the Hunt','Contagion'].includes(n)?{aiKind:'dividedCounters',resource:'counters'}:{})});return ctx.so.v97Division.reduce((sum,r)=>sum+r.n,0)===total&&ctx.so.v97Division.every(r=>Number.isSafeInteger(r.n)&&r.n>=1);};
   if(n==='Meteor Shower'){const spec=f.targets[0];f.targets[0]={...spec,bindOracleContext:ctx=>({...spec,max:(ctx.so.x||0)+1,count:(ctx.so.x||0)+1})};}
   if(n==='Winter Blast'){const spec=f.targets[0];f.targets[0]={...spec,bindOracleContext:ctx=>({...spec,min:ctx.so.x||0,count:ctx.so.x||0,max:ctx.so.x||0})};}
   if(['Soul Exchange','Primitive Justice'].includes(n))script.oracleCastingChoice={v97:n};
   if(n==='Primitive Justice')for(const [i,color]of [[1,'R'],[2,'G']]){const spec=f.targets[i];f.targets[i]={...spec,bindOracleContext:ctx=>{const count=ctx.so.oracleCastingChoicePlan?.counts?.[color]??ctx.so.oracleCastingChoicePaid?.counts?.[color]??0;return {...spec,min:count,max:count,count};}};}
   if(n==='Death Spark'){const t=H.compileGenericTrigger({kind:'generic-trigger',event:'upkeep',eventFilter:'your-player',zone:'graveyard',targets:[],effects:[E('death-spark-return')],optional:false});const prior=t.filter;t.filter=(g,s,d)=>prior(g,s,d)&&s.owner.graveyard[s.owner.graveyard.indexOf(s)+1]?.is('Creature');h.triggers.push(t);}
   if(n==='Psychic Purge'){const t=H.compileGenericTrigger({kind:'generic-trigger',event:'discarded',zone:'event-source-v20',effects:[E('psychic-discard')],targets:[],optional:false});t.filter=(g,s,d)=>d.card===s&&d.oracleDiscardCauseV20&&d.oracleDiscardCauseV20!==d.player;h.triggers.push(t);}
   return true;
  },
  target(g,c,p,s,f){if(f.kind==='paper-predicate-v97')return f.fn(g,c,p,s);},
  alternativeZonePermission(g,p,c,a){if(v97Permission(a))return permissionOptions(g,p,c,a)||undefined;},
  zoneReplacements(g,c,to){if(to==='graveyard'&&g.untilEffects.some(r=>r.kind==='yawgmothV97'&&r.player===c.owner))return [{key:'yawgmoth-v97:'+c.iid,label:"Yawgmoth's Will — exile instead",run:async()=>({toZone:'exile'})}];return [];},
  async damagePreventionRider(g,s,p,rule,data,attempted,prevented){
   if(rule.kind!=='paper-prevention-counter-v97')return false;
   if(prevented&&data.target instanceof M.CardInst){rule.row.total+=prevented;}
   return true;
  },
  async effect(ctx,e){
   if(e.action!=='paper-effect-v97')return false;
   const {g,src:s,you:p}=ctx,n=e.name,c=subjects(ctx)[0],other=subjects(ctx,1)[0],x=ctx.so?.x??ctx.x??0;
   switch(n){
    case 'Blaze of Glory':if(c){const row=lock(c);g.untilEffects.push({expires:'eot',apply:()=>{if(current(row)){c.cur.blockAnyNumber=true;c.cur.mustBlock=true;for(const a of g.combat?.attackers||[])(c.cur.requiredBlockSources||=[]).push({iid:a.iid,version:a.zoneVersion});}}});}break;
    case 'Blood Lust':if(c)M.E.pumpUntilEOT(g,c,4,c.toughness>=5?-4:1-c.toughness,[]);break;
    case 'Bounty of the Hunt':case 'Contagion':{const cards=subjects(ctx),kind=n==='Bounty of the Hunt'?'+1/+1':'-2/-1',rows=[];for(const allocation of ctx.so.v97Division||[]){const card=cards.find(c=>c.iid===allocation.iid);if(!card)continue;const before=card.counters[kind]||0;await g.putCountersV91(card,kind,allocation.n,{by:p});if(n==='Bounty of the Hunt')rows.push({...lock(card),n:Math.max(0,(card.counters[kind]||0)-before)});}if(rows.length)delayed(ctx,'cleanupStep',async later=>{for(const r of rows)if(current(r))later.g.removeCounters(r.card,'+1/+1',r.n);});break;}
    case 'Broken Visage':if(c){const power=c.power,toughness=c.toughness;await g.destroy(c,{source:s,noRegen:true});const cards=await g.makeTokens(token('Spirit',power,toughness,['Spirit'],['B']),p),rows=cards.map(lock);delayed(ctx,'endStep',async later=>{for(const r of rows)if(current(r))await later.g.sacrifice(r.card.ctrl,r.card);});}break;
    case 'Burning of Xinye':{for(const q of [p,c].filter(Boolean)){const from=g.lands(q),chosen=await pick(ctx,from,4,4,q,'Choose four lands you control to destroy');await g.destroyMany(chosen,{source:s});}await damage(ctx,g.creatures(),4);break;}
    case 'Cannibalize':if(c||other){const cards=[c,other].filter(Boolean),[exiled]=await pick(ctx,cards,1,1);if(exiled)await g.move(exiled,'exile');for(const card of cards.filter(q=>q!==exiled))await g.putCountersV91(card,'+1/+1',2,{by:p});}break;
    case 'Cataclysm':{const rows=g.bf().map(lock),kept=new Set();for(const q of players(g,g.turnPlayer||p))for(const type of ['Artifact','Creature','Enchantment','Land'])for(const card of await pick(ctx,rows.filter(current).map(r=>r.card).filter(c=>c.ctrl===q&&c.is(type)),1,1,q,'Keep an '+type))kept.add(card);await g.withGraveyardEntryBatch(async()=>{for(const q of players(g,g.turnPlayer||p))await g.sacrificeMany(q,rows.filter(r=>current(r)&&r.card.ctrl===q&&!kept.has(r.card)).map(r=>r.card));});break;}
    case 'Corpse Dance':{const card=p.graveyard.findLast(c=>c.is('Creature'));if(card){await g.putPermanentOntoBattlefield(card,p);if(live(card)){const row=lock(card);M.E.pumpUntilEOT(g,card,0,0,['haste']);delayed(ctx,'endStep',later=>current(row)?later.g.move(card,'exile'):Promise.resolve());}}break;}
    case 'Crumble':case 'Detonate':if(c){const q=c.ctrl,mv=c.mv;await g.destroy(c,{source:s,noRegen:true});if(n==='Crumble')await g.gainLife(q,mv,s);else await damage(ctx,[q],x);}break;
    case 'Death Spark':case 'Psychic Purge':await damage(ctx,[c],1);break;
    case 'death-spark-return':if(s.zone==='graveyard'&&s.zoneVersion===ctx.sourceZoneVersion&&await pay(ctx,'{1}'))await g.move(s,'hand');break;
    case 'psychic-discard':{const q=ctx.data.oracleDiscardCauseV20;if(q&&!q.lost)await g.loseLife(q,5,s);break;}
    case 'Disharmony':if(c){g.untap(c);removeCombat(g,c);M.OracleV8Control.gain(g,c,p,{temporary:true});}break;
    case 'Drain Power':if(c){await drainLands(ctx,c);const amounts={...c.pool};clearMana(g,c);await run(ctx,{action:'add-mana',produce:Object.fromEntries(Object.entries(amounts).filter(([,n])=>n>0))});}break;
    case 'Dwarven Catapult':if(c){const cards=g.creatures(c);if(cards.length)await damage(ctx,cards,Math.floor(x/cards.length));}break;
    case 'Energy Arc':{const cards=subjects(ctx);for(const card of cards)g.untap(card);for(const card of cards){await run({...ctx,targets:[card]},{action:'damage-rule-v20',mode:'prevent',source:{ref:0},recipient:{all:true},n:'all',combat:'combat'});await run({...ctx,targets:[card]},{action:'damage-rule-v20',mode:'prevent',source:{all:true},recipient:{ref:0},n:'all',combat:'combat'});}break;}
    case 'Errand of Duty':await g.makeTokens(token('Knight',1,1,['Knight'],['W'],['banding']),p);break;
    case 'Essence Filter':{const mode=await option(ctx,[{key:'all',label:'Destroy all enchantments'},{key:'nonwhite',label:'Destroy all nonwhite enchantments'}]);await g.destroyMany(g.bf().filter(c=>c.is('Enchantment')&&(mode==='all'||!c.colors.includes('W'))),{source:s});break;}
    case 'Eureka':{let entered;do{entered=false;for(const q of players(g,p)){const from=q.hand.filter(c=>['Creature','Artifact','Enchantment','Land','Planeswalker','Battle'].some(t=>c.is(t))),[card]=await pick(ctx,from,0,1,q,'You may put a permanent onto the battlefield');if(card){const v=card.zoneVersion;await g.putPermanentOntoBattlefield(card,q);entered ||= card.zone==='battlefield'&&card.zoneVersion===v+1;}}}while(entered);break;}
    case 'Eye for an Eye':{const choices=M.OracleV8SourcePrevention.candidates(g,{},ctx);if(!choices.length)break;const key=await option(ctx,choices.map((r,i)=>({key:String(i),label:r.card.name}))),source=choices[Number(key)];g.untilEffects.push({kind:'eyeV97',player:p,source:s,chosen:source,expires:'eot',used:false});break;}
    case 'Flame Wave':if(c){const q=c instanceof M.Player?c:c.ctrl;await damage(ctx,[c,...g.creatures(q)],4);}break;
    case 'Forgotten Lore':if(c){const excluded=new Set();let chosen;while(true){const from=p.graveyard.filter(c=>!excluded.has(c));if(!from.length)break;[chosen]=await pick(ctx,from,1,1,c,'Choose a graveyard card');excluded.add(chosen);if(!await pay(ctx,'{G}'))break;chosen=null;}if(chosen?.zone==='graveyard'&&chosen.owner===p)await g.move(chosen,'hand');}break;
    case 'Fork':if(c){const copy=await g.copySpell(c,p,{retarget:true});if(copy){copy.oracleColorOverrideV97=['R'];copy.card.meta.v97ForkColors=copy.card.zoneVersion;copy.card.def={...copy.card.def,colorsOverride:['R']};copy.oracleDefinition={...(copy.oracleDefinition||copy.card.def),colorsOverride:['R']};}}break;
    case 'Gorilla War Cry':for(const card of g.creatures())M.E.pumpUntilEOT(g,card,0,0,['menace']);nextUpkeepDraw(ctx,1);break;
    case 'Harsh Justice':{const matching=hit=>hit.target===p&&hit.combat&&hit.n>0&&hit.sourceSnap?.types.includes('Creature')&&hit.sourceSnap.attacking;delayed(ctx,'oracleDamageBySource',async later=>{const hits=later.data.hits.filter(matching),hit=hits[0];if(!hit)return;const source=hit.src,stillHere=source.zone==='battlefield'&&source.zoneVersion===hit.sourceVersion,snap=stillHere?later.g.snapshot(source,false):source.battlefieldLKI?.get(hit.sourceVersion)||hit.sourceSnap,controller=snap?.ctrl||source.ctrl,n=hits.reduce((sum,h)=>sum+h.n,0);if(!controller||controller.lost)return;await later.g.damageBatch([{src:source,target:controller,n}],stillHere?{}:{_damageReplacementSource:{src:source,snapshot:snap,traits:{controller,toxic:0,keywords:new Set((snap?.kw||[]).filter(k=>['lifelink','deathtouch','wither','infect'].includes(k)))}}});},(game,data)=>data.hits?.some(matching),{once:false,expires:'eot'});break;}
    case 'Hellfire':{const rows=g.creatures().filter(c=>!c.colors.includes('B')).map(lock),died=[];const old=g.emit;g.emit=async function(event,data,...args){if(event==='dies'&&rows.some(r=>r.card===data.card&&r.version===data.snap.zoneVersion))died.push(data.card);return old.call(this,event,data,...args);};try{await g.destroyMany(rows.map(r=>r.card),{source:s});}finally{g.emit=old;}await damage(ctx,[p],died.length+3);break;}
    case 'Intuition':if(c){let cards=[];const finish=await M.OracleV8Library.search(ctx,{n:3,unrestricted:true,reveal:false,optionalSearch:false,placements:[{n:'all',destination:'hand'}]},{target:H.genericTargetSpec,amount:H.genericAmount},p,p,{deferPlacement:true,selectCards:async(from,min,max)=>{cards=await pick(ctx,from,min,max,p,'Find three cards');return cards;}});const rows=cards.map(lock);await reveal(ctx,cards);const [kept]=await pick(ctx,cards,1,1,c,'Choose a card for '+p.name+' to keep');await g.withGraveyardEntryBatch(async()=>{for(const row of rows)if(current(row))await g.move(row.card,g.oppositionFoundV89?.has(row.card)?'exile':row.card===kept?'hand':'graveyard');});if(finish)await finish();}break;
    case 'Juxtapose':if(c){for(const type of ['Creature','Artifact']){const chosen=[];for(const q of [p,c]){const pool=g.bf().filter(x=>x.ctrl===q&&x.is(type)),max=Math.max(-1,...pool.map(x=>x.mv)),[card]=await pick(ctx,pool.filter(x=>x.mv===max),1,1,q,'Choose your highest mana value '+type);chosen.push(card);}if(chosen.every(Boolean)&&M.OracleV8Control.exchange(g,chosen[0],chosen[1]))g.recalc();}}break;
    case "Kaervek's Torch":await damage(ctx,[c],x);break;
    case 'Kor Chant':if(c&&other)await run(ctx,{action:'damage-rule-v20',mode:'redirect',source:{ref:'chosen-source-v20'},recipient:{ref:0},destination:{ref:1},n:'all'});break;
    case "Lat-Nam's Legacy":{const [card]=await pick(ctx,p.hand.slice(),1,1);if(card){const v=card.zoneVersion;await g.move(card,'library');M.shuffle(p.library,g.rnd);if(card.zone==='library'&&card.zoneVersion===v+1)nextUpkeepDraw(ctx,2);}break;}
    case 'Lava Burst':{const prior=g.v97Lava;g.v97Lava=c?.is?.('Creature')?s:null;try{await g.damageBatch(c?[{src:s,target:c,n:x}]:[],{cantBePrevented:!!c?.is?.('Creature')});}finally{g.v97Lava=prior;}break;}
    case 'Leeches':if(c){const amount=c.poison||0;c.poison=0;g.note('counter',{p:c,kind:'poison'});await damage(ctx,[c],amount);}break;
    case 'Legerdemain':if(c&&other)M.OracleV8Control.exchange(g,c,other);break;
    case "Martyr's Cry":{const rows=g.creatures().filter(c=>c.colors.includes('W')).map(c=>({...lock(c),controller:c.ctrl}));await g.exileMany(rows.map(r=>r.card));for(const r of rows)if(r.card.zone==='exile'&&r.card.zoneVersion===r.version+1)await g.draw(r.controller,1,s);break;}
    case 'Meteor Shower':{const cards=subjects(ctx);await g.damageBatch((ctx.so.v97Division||[]).map(r=>({src:s,target:cards.find(c=>c instanceof M.Player?c.idx===r.playerIdx:c.iid===r.iid),n:r.n})).filter(r=>r.target),{});break;}
    case 'Misinformation':await orderTop(ctx,subjects(ctx));break;
    case 'Mogg Infestation':if(c){const rows=g.creatures(c).map(lock),died=[];const old=g.emit;g.emit=async function(event,data,...args){if(event==='dies'&&rows.some(r=>r.card===data.card&&r.version===data.snap.zoneVersion))died.push(data.card);return old.call(this,event,data,...args);};try{await g.destroyMany(rows.map(r=>r.card),{source:s});}finally{g.emit=old;}if(died.length)await g.makeTokens(token('Goblin',1,1,['Goblin'],['R']),c,{n:died.length*2});}break;
    case 'Necrologia':await g.draw(p,x,s);break;
    case 'Panic':if(c)await run(ctx,{action:'combat-restriction',target:0,restriction:{cantBlock:true},duration:'eot'});nextUpkeepDraw(ctx,1);break;
    case 'Power Sink':if(c&&!await pay(ctx,'{'+x+'}',c.ctrl)){const q=c.ctrl;await g.counterStackObject(c,{source:s});for(const land of g.lands(q).filter(c=>[].concat(c.def.mana||[],c.cur.extraMana||[]).length))g.tap(land);clearMana(g,q);}break;
    case 'Pox':{const qs=players(g,g.turnPlayer||p);for(const q of qs)await g.loseLife(q,Math.ceil(q.life/3),s);const discards=[];for(const q of qs){const n=Math.ceil(q.hand.length/3);discards.push({player:q,rows:(await pick(ctx,q.hand.slice(),n,n,q,'Discard a third of your hand')).map(lock)});}await g.withGraveyardEntryBatch(async()=>{for(const row of discards)await g.discard(row.player,row.rows.filter(current).map(r=>r.card));});for(const type of ['Creature','Land']){const sacrifices=[];for(const q of qs){const pool=g.bf().filter(c=>c.ctrl===q&&c.is(type)),n=Math.ceil(pool.length/3);sacrifices.push({player:q,rows:(await pick(ctx,pool.filter(c=>g.canSacrifice(c)),n,n,q,'Sacrifice a third of your '+type+'s')).map(lock)});}await g.withGraveyardEntryBatch(async()=>{for(const row of sacrifices)await g.sacrificeMany(row.player,row.rows.filter(current).map(r=>r.card));});}break;}
    case 'Primitive Justice':await g.destroyMany([...subjects(ctx),...subjects(ctx,1),...subjects(ctx,2)],{source:s});if(subjects(ctx,2).length)await g.gainLife(p,subjects(ctx,2).length,s);break;
    case 'Recall':{const n=Math.min(x,p.hand.length),rows=(await pick(ctx,p.hand.slice(),n,n)).map(lock);await g.discard(p,rows.map(r=>r.card));const actual=rows.filter(r=>r.card.zoneVersion!==r.version).length;for(const card of await pick(ctx,p.graveyard.slice(),actual,actual))await g.move(card,'hand');await exileSelf(ctx);break;}
    case 'Reset':for(const card of g.lands(p))g.untap(card);break;
    case 'Retribution':{const cards=[c,other].filter(Boolean);if(cards.length){const q=cards[0].ctrl,[sac]=await pick(ctx,cards,1,1,q,'Choose one creature to sacrifice');if(sac)await g.sacrifice(q,sac);for(const card of cards.filter(x=>x!==sac))await g.putCountersV91(card,'-1/-1',1,{by:p});}break;}
    case 'Riding the Dilu Horse':if(c){const row=lock(c);g.untilEffects.push({kind:'diluV97',iid:c.iid,zoneVersion:c.zoneVersion,expires:'object',apply:()=>{if(current(row)){c.cur.power+=2;c.cur.toughness+=2;c.cur.kw.add('horsemanship');}}});}break;
    case 'Rites of Initiation':{const n=await number(ctx,0,p.hand.length),random=M.shuffle(p.hand.slice(),g.rnd).slice(0,n),rows=random.map(lock);await g.discard(p,random);const actual=rows.filter(r=>r.card.zoneVersion!==r.version).length;for(const card of g.creatures(p))M.E.pumpUntilEOT(g,card,actual,0,[]);break;}
    case 'Sacred Boon':case 'Scars of the Veteran':if(c){const row={...lock(c),total:0};await run(ctx,{action:'damage-rule-v20',mode:'prevent',source:{all:true},recipient:{ref:0},n:n==='Sacred Boon'?3:7,rider:{kind:'paper-prevention-counter-v97',row}});delayed(ctx,'endStep',async later=>{if(current(row)&&row.card.is('Creature')&&row.total)await later.g.putCountersV91(row.card,'+0/+1',row.total,{by:p});});}break;
    case 'Soul Exchange':if(c){await g.putPermanentOntoBattlefield(c,p);if(live(c)&&ctx.so.oracleCastingChoicePaid?.thrull)await g.putCountersV91(c,'+2/+2',1,{by:p});}break;
    case 'Spore Cloud':case 'Tangle':{const cards=g.creatures().filter(c=>c.attacking||n==='Spore Cloud'&&c.blocking);if(n==='Spore Cloud')for(const c of g.creatures().filter(c=>c.blocking))g.tap(c);await run(ctx,{action:'damage-rule-v20',mode:'prevent',source:{all:true},recipient:{all:true},combat:'combat',n:'all'});freeze(ctx,cards);break;}
    case 'Stunted Growth':if(c){const cards=await pick(ctx,c.hand.slice(),3,3,c,'Choose three cards to put on top');await orderTop(ctx,cards,c);}break;
    case 'Telekinesis':if(c){g.tap(c);await run(ctx,{action:'damage-rule-v20',mode:'prevent',source:{ref:0},recipient:{all:true},combat:'combat',n:'all'});freeze(ctx,[c],2);}break;
    case 'Transmute Artifact':{const [artifact]=await pick(ctx,g.bf().filter(c=>c.ctrl===p&&c.is('Artifact')&&g.canSacrifice(c)),1,1);if(!artifact)break;const value=artifact.mv;if(!await g.sacrifice(p,artifact))break;await M.OracleV8Library.search(ctx,{n:1,filter:T('artifact','any',{zone:'library'}),optionalSearch:true,placements:[{n:'all',destination:'battlefield'}]},{target:H.genericTargetSpec,amount:H.genericAmount},p,p,{placeBattlefield:async card=>{const cost=Math.max(0,card.mv-value);if(g.oppositionFoundV89?.has(card))await g.move(card,'exile');else if(!cost||await pay(ctx,'{'+cost+'}'))await g.putPermanentOntoBattlefield(card,p);else await g.move(card,'graveyard');}});break;}
    case "Tyrant's Choice":{const ballots=await M.VN.vote(ctx,[{key:'death',label:'Death'},{key:'torture',label:'Torture'}]),votes={death:ballots.filter(r=>r.key==='death').length,torture:ballots.filter(r=>r.key==='torture').length};if(votes.death>votes.torture){for(const q of players(g,p).filter(q=>q!==p)){const [card]=await pick(ctx,g.creatures(q).filter(c=>g.canSacrifice(c)),1,1,q,'Choose a creature to sacrifice');if(card)await g.sacrifice(q,card);}}else for(const q of players(g,p).filter(q=>q!==p))await g.loseLife(q,4,s);break;}
    case 'Winter Blast':{const cards=subjects(ctx);for(const c of cards)g.tap(c);await damage(ctx,cards.filter(c=>c.kw('flying')),2);break;}
    case 'Word of Command':if(c)await command(ctx,c);break;
    case 'Word of Undoing':if(c){const cards=[c,...g.bf().filter(a=>a.hasSub('Aura')&&a.colors.includes('W')&&a.owner===p&&a.attachedTo===c.iid)];for(const card of cards)await g.move(card,'hand');}break;
    case "Yawgmoth's Will":g.untilEffects.push({kind:'yawgmothV97',player:p,source:s,expires:'eot'});break;
    default:throw Error('Missing v97 executable spell: '+n);
   }
   g.recalc();return true;
  }
 };
 M.OracleV20.handlers.unshift(handler);
 function clearMana(g,p){for(const k of Object.keys(p.pool))p.pool[k]=0;p.poolMeta=[];p.coloredOnlyPool={W:0,U:0,B:0,R:0,G:0,C:0};g.note('mana',{p});}
 async function drainLands(ctx,p){for(const land of ctx.g.lands(p)){const rows=ctx.g.manaSources(p,null,{includeRestricted:true}).filter(r=>r.card===land);if(!rows.length)continue;const key=await option(ctx,rows.map((r,i)=>({key:String(i),label:r.m.label||land.name+' mana ability'})),p),row=rows[Number(key)],produce=typeof row.m.produce==='function'?row.m.produce(ctx.g,land,p):row.m.produce||[];if(!produce.length)continue;const out=produce.length===1?produce[0]:produce[Number(await option(ctx,produce.map((r,i)=>({key:String(i),label:JSON.stringify(r)})),p,'Choose mana'))];await ctx.g.activateManaSource(p,row,out);}}
 // Spell-copy characteristics and target-dependent casting surcharges.
 const adjustment=M.oracleSpellTargetAdjustmentV65;M.oracleSpellTargetAdjustmentV65=function(g,p,c,opts={}){const out=adjustment?.(g,p,c,opts)||{},torch=so=>so?.kind==='spell'&&(so.oracleDefinition||so.card.def).paperSpellV97==="Kaervek's Torch";let n=0;if(opts.targets)n=new Set(opts.targets.flat(Infinity).filter(torch)).size;else{const specs=g.spellTargetSpecs(c,opts,p)||[];for(const spec of specs){const pool=g.legalTargets(spec,c,p),need=spec.min??spec.count??1;if(!spec.upTo&&need>0&&pool.length&&pool.every(torch))n=Math.max(n,1);}}return {...out,generic:(out.generic||0)+n*2};};
 const copy=G.copySpell;G.copySpell=async function(so,p,opts={}){const result=await copy.call(this,so,p,opts);if(result){if(so.v97Division){const old=(so.targets||[]).flat(Infinity),targets=(result.targets||[]).flat(Infinity);result.v97Division=so.v97Division.map(r=>{const i=old.findIndex(c=>c instanceof M.Player?c.idx===r.playerIdx:c?.iid===r.iid),target=targets[i];return {...r,iid:target instanceof M.Player?undefined:target?.iid??r.iid,playerIdx:target instanceof M.Player?target.idx:undefined};});}if(so.oracleCastingChoicePaid?.kind==='v97')result.oracleCastingChoicePaid={...so.oracleCastingChoicePaid,counts:{...so.oracleCastingChoicePaid.counts}};if(so.oracleColorOverrideV97)result.oracleColorOverrideV97=so.oracleColorOverrideV97.slice();}return result;};
 // Shields and damage triggers participate in the native replacement and event
 // pipelines, including source identities and actual damage after prevention.
 const eyeSource=(r,data)=>{if(data.src!==r.chosen.card)return false;const version=(data.sourceSnapshot||data.src._oracleDamageSnapshot)?.zoneVersion??data.src.zoneVersion;return version===r.chosen.version||r.chosen.spell&&data.src.zone==='battlefield'&&version===r.chosen.version+1&&data.src.meta?._enteredFromZone==='stack';};
 const candidates=M.OracleV20Damage.temporaryCandidates;M.OracleV20Damage.temporaryCandidates=function(g,data){const out=candidates(g,data);for(const r of g.untilEffects.filter(r=>r.kind==='eyeV97'&&!r.used&&data.target===r.player&&eyeSource(r,data)&&data.n>0))out.push({key:r,src:r.source,label:'Eye for an Eye — damage both players',apply:async()=>{r.used=true;const amount=data.n,controller=(data.sourceSnapshot||data.src._oracleDamageSnapshot)?.ctrl||data.src.ctrl;await g.damageBatch([{src:r.source,target:controller,n:amount}],{deferSBA:true});}});return out;};
 const redirect=M.oracleDamageMayRedirectV88;M.oracleDamageMayRedirectV88=(g,data)=>g.v97Lava===data.src?false:redirect?.(g,data);
 const nativeCandidates=M.OracleV20Damage.temporaryCandidates;M.OracleV20Damage.temporaryCandidates=(g,data)=>nativeCandidates(g,data).filter(r=>g.v97Lava!==data.src||r.key?.op?.mode!=='redirect');
 const untapActions=M.oracleUntapActionsV60;M.oracleUntapActionsV60=async(g,p)=>{await untapActions?.(g,p);for(const c of g.bf().filter(c=>c.ctrl===p&&(c.meta.v97UntapSkips||0)>0)){c.meta.v97UntapSkips--;c.meta.noUntapOnce=true;}};
 // Mandatory announcements share the transactional native casting-choice path.
 const C=M.OracleV8CastingChoices,old={canPay:C.canPay,prepare:C.prepare,validate:C.validate,commit:C.commit};
 const soulPool=ctx=>ctx.g.creatures(ctx.you).filter(c=>M.OracleV91.costBan(ctx.g,ctx.you,{exiles:[c],isCost:true})!==false);
 C.canPay=(ctx,compiled)=>compiled?.v97?compiled.v97!=='Soul Exchange'||soulPool(ctx).length>0:old.canPay(ctx,compiled);
 const appliedMana=new WeakMap();
 C.prepare=async(ctx,compiled)=>{if(!compiled?.v97)return old.prepare(ctx,compiled);if(ctx.so.oracleCastingChoicePlan?.kind==='v97'){const plan=ctx.so.oracleCastingChoicePlan;if(compiled.v97==='Primitive Justice'&&ctx.manaCost&&appliedMana.get(ctx.manaCost)!==plan){ctx.manaCost.generic+=plan.counts.R+plan.counts.G;for(const color of ['R','G'])for(let i=0;i<plan.counts[color];i++)ctx.manaCost.pips.push([color]);appliedMana.set(ctx.manaCost,plan);}return C.validate(ctx,compiled);}const plan={kind:'v97',name:compiled.v97,source:lock(ctx.src),rows:[],counts:{R:0,G:0}};
  if(compiled.v97==='Soul Exchange'){const [c]=await pick(ctx,soulPool(ctx),1,1);if(!c)return false;plan.rows=[lock(c)];plan.thrull=c.hasSub('Thrull');}
  else{while(true){const options=[{key:'done',label:'Finish additional payments'}];for(const color of ['R','G']){const candidate={...ctx.manaCost,generic:ctx.manaCost.generic+1,pips:[...(ctx.manaCost.pips||[]),[color]]};if(ctx.g.canPayMana(ctx.you,candidate,{card:ctx.src,castOpts:ctx.so.castOpts},{xVal:ctx.so.x||0}))options.unshift({key:color,label:'Pay {1}{'+color+'} for another artifact'});}const key=await option(ctx,options);if(key==='done')break;plan.counts[key]++;ctx.manaCost.generic++;ctx.manaCost.pips.push([key]);}}
  ctx.so.oracleCastingChoicePlan=plan;if(ctx.manaCost)appliedMana.set(ctx.manaCost,plan);return C.validate(ctx,compiled);
 };
 C.validate=(ctx,compiled)=>{if(!compiled?.v97)return old.validate(ctx,compiled);const r=ctx.so.oracleCastingChoicePlan;return !!r&&r.kind==='v97'&&r.name===compiled.v97&&current(r.source)&&r.rows.every(row=>current(row)&&soulPool(ctx).includes(row.card));};
 C.commit=async(ctx,compiled)=>{if(!compiled?.v97)return old.commit(ctx,compiled);if(!C.validate(ctx,compiled))throw Error('Changed v97 announced cost');const plan=ctx.so.oracleCastingChoicePlan;if(plan.rows.length)await ctx.g.exileMany(plan.rows.map(r=>r.card));ctx.so.oracleCastingChoicePaid={kind:'v97',name:plan.name,counts:{...plan.counts},thrull:plan.thrull};delete ctx.so.oracleCastingChoicePlan;return true;};
 const chooseTargets=G.pickTargets;G.pickTargets=async function(ctx,specs,src,p){if(ctx.so?.kind==='spell'&&src.def.paperSpellV97==='Primitive Justice'&&!ctx.so.oracleCastingChoicePlan&&!await C.prepare({...ctx,manaCost:this.spellCost(p,src,ctx.so.castOpts)},src.def.oracleCastingChoice))return false;return chooseTargets.call(this,ctx,specs,src,p);};
 // Persistent graveyard play permission uses ordinary timing and land limits.
 const ownGrave=(g,p)=>g.untilEffects.some(r=>r.kind==='yawgmothV97'&&r.player===p);
 const S=M.StarterCasting,priorStarter={offers:S.offers,allowed:S.allowed,prepare:S.prepare,validate:S.validate,commit:S.commit};
 const permissionVariants=(g,p,c,base)=>M.VN.castVariants(g,c,{...base,starterCardVersion:c.zoneVersion}).filter(a=>!g.castHasType(c,a,'Land')).flatMap(a=>[a,...(g.castDefinition(c,a).altCosts||[]).filter(cost=>!cost.cond||cost.cond(g,p,c)).map(cost=>({...a,...cost}))]).map(alt=>({card:c,from:c.zone,alt}));
 const offers=(g,p)=>[...(ownGrave(g,p)?p.graveyard.flatMap(c=>permissionVariants(g,p,c,{starterPermission:'yawgmoth-v97'})):[]),...(g.v97Command?.player===p&&current(g.v97Command.source)?permissionVariants(g,p,g.v97Command.card,{starterPermission:'word-command-v97',speed:'instant'}):[])];
 const v97Permission=a=>['yawgmoth-v97','word-command-v97'].includes(a.starterPermission);
 const plain=o=>!!o&&typeof o==='object'&&(Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
 const sameOption=(a,b)=>a===b||Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>sameOption(v,b[i]))||plain(a)&&plain(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&sameOption(a[k],b[k]));
 const copyOption=value=>Array.isArray(value)?value.map(copyOption):plain(value)?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,copyOption(v)])):value;
 const permissionCasts=new WeakMap();
 function permissionSource(g,p,c,a){return c.owner===p&&a.starterCardVersion===c.zoneVersion&&p[c.zone]?.includes(c)&&(a.from===undefined||a.from===c.zone)&&(a.starterPermission==='yawgmoth-v97'?c.zone==='graveyard'&&ownGrave(g,p):a.starterPermission==='word-command-v97'&&c.zone==='hand'&&g.v97Command?.player===p&&g.v97Command.card===c&&current(g.v97Command.source));}
 function expandedPermissionRows(g,p,c,kind){
  const base={starterPermission:kind,...(kind==='word-command-v97'?{speed:'instant'}:{})},rows=permissionVariants(g,p,c,base),out=[];
  for(let i=0;i<rows.length;i++){const row=rows[i];if(out.some(r=>sameOption(r.alt,row.alt)))continue;out.push(row);for(const alt of g.oracleDerivedCastOptionsV97(p,c,row.from,row.alt))if(!out.some(r=>sameOption(r.alt,alt)))rows.push({card:c,from:row.from,alt});}
  return out;
 }
 function withoutAnnouncements(g,p,c,a){
  const out=copyOption(a),d=g.castDefinition(c,a),stickerKicker=()=>g.castHasType(c,a,'Creature')&&g.bf().some(s=>s.ctrl===p&&!s.phasedOut&&!s.cur?.abilitiesDisabled&&s.def.stickerKickerV89);
  if(out.xVal!==undefined&&(!Number.isSafeInteger(out.xVal)||out.xVal<0))return null;
  if(out._kicked!==undefined){if(out._kicked!==true||a.faceDownCast||!(d.kicker||d.multikicker||d.oracleDualKickerV24?.length||stickerKicker()))return null;delete out._kicked;}
  if(out._kickerX!==undefined){if(!a._kicked||!d.kicker||!M.parseCost(d.kicker.cost).x||!Number.isSafeInteger(out._kickerX)||out._kickerX<(d.kicker.minX||0))return null;delete out._kickerX;}
  if(out.buybackPaid!==undefined){if(out.buybackPaid!==true||!d.buyback||a.faceDownCast)return null;delete out.buybackPaid;}
  if(out.entwined!==undefined){if(out.entwined!==true||!d.entwine||a.faceDownCast)return null;delete out.entwined;}
  if(out.delve!==undefined){const printed=!a.faceDownCast&&!a.adventure&&d.altCosts?.some(cost=>cost.delve),granted=M.OracleV20.handlers.some(h=>h.grantsDelve?.(g,p,c,a)===true);if(out.delve!==true||!printed&&!granted)return null;delete out.delve;}
  if(out.oracleCastingCreatureTypeChoiceV65!==undefined){if(!d.oracleCastingCreatureTypeV65||!M.CREATURE_SUBTYPES.has(out.oracleCastingCreatureTypeChoiceV65))return null;delete out.oracleCastingCreatureTypeChoiceV65;}
  return out;
 }
 function permissionOptions(g,p,c,input,announced=true){
  if(!permissionSource(g,p,c,input)||!g.canCastTiming(p,c,input))return null;
  const clean=withoutAnnouncements(g,p,c,input);if(!clean)return null;
  const base=M.oracleAdditionalCastBaseV65(g,p,c,clean);if(!base)return null;
  const supplied={...base,from:c.zone};
  for(const row of expandedPermissionRows(g,p,c,base.starterPermission)){const expected=withoutAnnouncements(g,p,c,{...row.alt,from:row.from});if(!expected)continue;if(supplied.xVal!==undefined&&expected.xVal===undefined)expected.xVal=supplied.xVal;if(!announced&&['_kicked','_kickerX','buybackPaid','entwined','delve'].some(key=>input[key]!==undefined&&!sameOption(input[key],row.alt[key])))continue;if(sameOption(supplied,expected))return {...copyOption(input),from:c.zone};}
  return null;
 }
 function authorizedPermission(ctx){const frame=permissionCasts.get(ctx.g);return frame&&frame.player===ctx.you&&frame.source.card===ctx.src&&current(frame.source)?permissionOptions(ctx.g,ctx.you,ctx.src,frame.options):permissionOptions(ctx.g,ctx.you,ctx.src,ctx.so.castOpts);}
 S.offers=(g,p)=>priorStarter.offers(g,p).concat(offers(g,p));
 S.allowed=(g,p,c,a)=>!v97Permission(a)?priorStarter.allowed(g,p,c,a):!!permissionOptions(g,p,c,a);
 S.prepare=(ctx,paid)=>v97Permission(ctx.so.castOpts)?Promise.resolve(!!authorizedPermission(ctx)):priorStarter.prepare(ctx,paid);
 S.validate=ctx=>v97Permission(ctx.so.castOpts)?!!authorizedPermission(ctx):priorStarter.validate(ctx);
 S.commit=ctx=>v97Permission(ctx.so.castOpts)?undefined:priorStarter.commit(ctx);
 const authorizedCast=G.castSpell;G.castSpell=async function(p,c,o={}){const input={...(o.alt||o),...(o.from!==undefined?{from:o.from}:{})};if(!v97Permission(input))return authorizedCast.call(this,p,c,o);const options=permissionOptions(this,p,c,input,false);if(!options)return false;const prior=permissionCasts.get(this);permissionCasts.set(this,{player:p,source:lock(c),options:copyOption(options)});try{return await authorizedCast.call(this,p,c,o);}finally{if(prior)permissionCasts.set(this,prior);else permissionCasts.delete(this);}};
 const faceAllowed=M.OracleV8Faces.castChoiceAllowed;M.OracleV8Faces.castChoiceAllowed=(g,p,c,a)=>v97Permission(a)?S.allowed(g,p,c,a):faceAllowed(g,p,c,a);
 const gravePlay=M.oracleGravePlayV60;M.oracleGravePlayV60=(g,p,c)=>c.owner===p&&c.zone==='graveyard'&&ownGrave(g,p)||gravePlay(g,p,c);
 const lands=G.playableLands;G.playableLands=function(p){return [...new Set([...lands.call(this,p),...(ownGrave(this,p)&&p.landsPlayed<this.landPlayLimit(p)?p.graveyard.filter(c=>c.is('Land')||M.OracleV8Faces.landFaces(this,p,c).length):[])])];};
 async function command(ctx,p){const {g,you:controller}=ctx;if(!p.hand.length)return;await controller.controller.decide(g,{type:'cardReveal',player:controller,cards:p.hand.slice(),private:true,kind:'look'});const [chosen]=await pick(ctx,p.hand.slice(),1,1,controller,'Choose the card '+p.name+' must play');if(!chosen)return;const prior=g.c1516ActiveControl,priorCommand=g.v97Command;g.c1516ActiveControl={subject:p.idx,controller:controller.idx};g.v97Command={player:p,card:chosen,source:lock(chosen),manaAbilities:new WeakMap()};const before=new Set(g.stack);try{const choices=g.castableList(p).filter(r=>r.card===chosen&&r.alt?.starterPermission==='word-command-v97');if(choices.length){const key=choices.length===1?'0':await option({...ctx,you:p},choices.map((r,i)=>({key:String(i),label:r.alt.label||r.alt.name||chosen.name})),p,'Choose how to play '+chosen.name),choice=choices[Number(key)];await g.castSpell(p,chosen,{from:choice.from,alt:choice.alt});}else if(chosen.is('Land')||M.OracleV8Faces.landFaces(g,p,chosen).length)await M.OracleV8PlayPermissions.castOne({...ctx,you:p},[chosen],{free:false,mandatory:true,selected:true,playLand:true},{target:H.genericTargetSpec});for(const so of g.stack)if(!before.has(so)&&so.kind==='spell'&&so.card===chosen)so.v97CommandControl={subject:p.idx,controller:controller.idx};}finally{g.c1516ActiveControl=prior;g.v97Command=priorCommand;}}
 const sourceRows=G.manaSources;G.manaSources=function(p,forSpell,...args){const rows=sourceRows.call(this,p,forSpell,...args),command=this.v97Command;if(command?.player!==p)return rows;const allowed=record=>!!record&&(record.isAbility?record.card?.ctrl===p&&record.card.is('Land')&&!!(record.ability?.produce||record.ability?.v97ManaAbility):record.card===command.card&&current(command.source));return rows.filter(r=>r.card?.ctrl===p&&r.card.is('Land')).map(row=>{let m=command.manaAbilities.get(row.m);if(!m){const prior=row.m;m={...prior,v97ManaAbility:true,restrictAbilities:true,restrict:(g,record,source)=>allowed(record)&&(!prior.restrict||prior.restrict(g,record,source)),freezeRestrictV20:(g,source)=>{const restriction=prior.freezeRestrictV20?.(g,source)||prior.restrict;return (game,record,card)=>allowed(record)&&(!restriction||restriction(game,record,card));}};command.manaAbilities.set(prior,m);}return {...row,m};});};
 const resolve=G.resolveTop;G.resolveTop=async function(...args){const control=this.stack.at(-1)?.v97CommandControl,prior=this.c1516ActiveControl;if(control)this.c1516ActiveControl=control;try{return await resolve.apply(this,args);}finally{this.c1516ActiveControl=prior;}};
})(globalThis.MTG||={});
