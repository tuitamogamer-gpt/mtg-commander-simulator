import assert from 'node:assert/strict';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
const LINK='permanent-linked-v24',total=player=>Object.values(player.pool).reduce((sum,n)=>sum+n,0);
const fixture=(h,name,extra={})=>h.fixtureDefinition(name,['Creature'],{cost:'{2}',power:'2',toughness:'3',...extra});
const contains=(node,action)=>JSON.stringify(node).includes('"action":"'+action+'"');
const setup=(M,role,h)=>{const ctx=h.gameFor(M,undefined,{ai:role==='ai'});h.fund(ctx.a);h.fund(ctx.b);for(const player of [ctx.a,ctx.b])while(player.library.length<40)h.zoneCard(M,player,'Forest','library');h.assertControllerRole?.(M,ctx);return ctx;};
function choose(player,fn){const prior=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>prior(g,fn(q)||q);}
async function source(M,entry,ctx,h){const card=h.zoneCard(M,ctx.a,entry.raw.name,'hand'),before=total(ctx.a);if(card.is('Land'))assert.equal(await ctx.game.playLand(ctx.a,card),true);else{assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);if(card.def.cost!=='{0}')assert.ok(total(ctx.a)<before,'source cast spends actual mana');}await h.resolveAll(ctx.game);return card;}
function targets(ctx,cards){choose(ctx.a,q=>q.type==='chooseTargets'&&cards.some(card=>q.candidates.includes(card))?{...q,candidates:q.candidates.filter(card=>cards.includes(card)),min:Math.min(cards.length,q.candidates.filter(card=>cards.includes(card)).length),max:cards.length}:null);}
function choices(ctx,cards){choose(ctx.a,q=>q.type==='chooseCards'&&cards.some(card=>q.from.includes(card))?{...q,from:q.from.filter(card=>cards.includes(card)),min:Math.min(cards.length,q.from.filter(card=>cards.includes(card)).length),max:cards.length}:q.type==='chooseOption'&&q.options.some(option=>option.key==='yes')?{...q,options:q.options.filter(option=>option.key==='yes')}:null);}
async function departure(ctx,source,mode,h){if(mode==='blink'){await ctx.game.move(source,'exile');await ctx.game.putPermanentOntoBattlefield(source,ctx.a);return;}await ctx.game.move(source,mode==='dies'?'graveyard':'exile');await h.resolveAll(ctx.game);}
export async function operationProofV24(M,entry,op,role,h){
 if(!contains(op,'permanent-linked-acquire-v24')&&!contains(op,'linked-return')&&!contains(op,'permanent-linked-play-v24')&&!contains(op,'permanent-linked-reveal-return-v24')&&!op.kind.startsWith('permanent-linked-')&&!op.permanentLinkedEventTypeV24&&!op.permanentDrawStepFirstV24&&op.count?.kind!=='permanent-linked-count-v24'&&!(entry.raw.name==='Unlicensed Hearse'&&op.kind==='crew')&&!(entry.raw.name==='Thief of Existence'&&op.kind==='generic-trigger'))return null;
 const name=entry.raw.name;
 if(name==='Safe Haven'){
  let checks=0;for(const branch of ['decline','return','stale-card','blink-source']){
   const ctx=setup(M,role,h),{game:g,a,b}=ctx,first=h.permanent(M,g,a,fixture(h,'V24 Haven own creature')),second=h.permanent(M,g,b,fixture(h,'V24 Haven stolen creature'));second.ctrl=a;g.recalc();const permanent=await source(M,entry,ctx,h);
   for(const card of [first,second]){g.untap(permanent);targets(ctx,[card]);const option=g.activatableList(a).find(row=>row.card===permanent);assert.ok(option);const before=total(a);assert.equal(await g.activateAbility(a,option),true);assert.equal(total(a),before-2,'Safe Haven spends two actual mana');await h.resolveAll(g);assert.equal(card.zone,'exile');}
   if(branch==='stale-card'){await g.move(first,'hand');await g.move(first,'exile');}
   if(branch==='blink-source'){await g.move(permanent,'exile');await g.putPermanentOntoBattlefield(permanent,a);}
   choose(a,q=>q.type==='chooseOption'&&q.options.some(option=>option.key=== (branch==='decline'?'no':'yes'))?{...q,options:q.options.filter(option=>option.key===(branch==='decline'?'no':'yes'))}:null);
   await g.runBeginningPhase(a);await h.resolveAll(g);const returns=branch!=='decline'&&branch!=='blink-source';assert.equal(permanent.zone,branch==='decline'?'battlefield':'graveyard','the optional upkeep sacrifice is paid only when chosen');assert.equal(first.zone,returns&&branch!=='stale-card'?'battlefield':'exile');assert.equal(second.zone,returns?'battlefield':'exile');if(returns)assert.equal(second.ctrl,b,'each card returns under its owner control');assertGameStateInvariants(g);checks+=14;
  }return checks;
 }
 if(name==='Thief of Existence'){
  let checks=0;for(const branch of ['decline','grant','countered','copied-trigger','copied-spell','blink']){
   const ctx=setup(M,role,h),{game:g,a,b}=ctx,host=h.permanent(M,g,b,fixture(h,'V24 Thief exile host',{types:['Artifact'],cost:'{3}'}));if(branch==='decline')choose(a,q=>q.type==='chooseTargets'&&q.candidates.includes(host)?{...q,candidates:[],min:0,max:0}:null);else targets(ctx,[host]);
   const permanent=h.zoneCard(M,a,name,'hand'),before=total(a);assert.equal(await g.castSpell(a,permanent,{from:'hand'}),true);assert.equal(total(a),before-3,'Thief paid cast consumes its generic, colorless and green mana');await g.flushTriggers();const trigger=g.stack.find(row=>row.kind==='trigger'&&row.srcCard===permanent);assert.ok(trigger);
   if(branch==='copied-trigger')assert.ok(await g.copyStackAbility(trigger,a,{mayNewTargets:false}));await g.resolveTop();if(branch==='copied-trigger'){await g.resolveTop();assert.equal(permanent.meta.oracleStackGrantsV24.operations.length,1,'the stale original target cannot grant an extra ability');}
   assert.equal(host.zone,branch==='decline'?'battlefield':'exile');const spell=g.stack.find(row=>row.kind==='spell'&&!row.isCopy&&row.card===permanent);assert.ok(spell);
   if(branch==='countered'){assert.equal(await g.counterStackObject(spell),true);assert.equal(permanent.zone,'graveyard');assert.equal(permanent.meta.oracleStackGrantsV24,undefined);await g.putPermanentOntoBattlefield(permanent,a);await g.move(permanent,'exile');await h.resolveAll(g);assert.equal(b.hand.length,0,'a countered spell does not transfer the grant to a later battlefield incarnation');assertGameStateInvariants(g);checks+=12;continue;}
   if(branch==='copied-spell')assert.ok(await g.copySpell(spell,a,{mayNewTargets:false}));await h.resolveAll(g);assert.equal(permanent.zone,'battlefield');assert.equal(permanent.cur.extraTriggers.length,branch==='decline'?0:1);const copied=branch==='copied-spell'?g.bf().find(card=>card.isToken&&card.name===name):null;if(branch==='copied-spell'){assert.ok(copied,'copying a modified permanent spell retains its granted ability');assert.equal(copied.def.triggers.filter(row=>row.on==='lto').length,1);targets(ctx,[b]);await g.move(copied,'exile');await h.resolveAll(g);assert.equal(b.hand.length,1);}
   const hand=b.hand.length;targets(ctx,[b]);await g.move(permanent,'exile');await h.resolveAll(g);assert.equal(b.hand.length,hand+(branch==='decline'?0:1),'the granted local opponent target draws the printed card');if(branch==='blink'){await g.putPermanentOntoBattlefield(permanent,a);assert.equal(permanent.cur.extraTriggers.length,0);await g.move(permanent,'exile');await h.resolveAll(g);assert.equal(b.hand.length,hand+1,'the grant ends on the previous battlefield incarnation');}assertGameStateInvariants(g);checks+=17;
  }return checks;
 }
 if(["Summoner's Egg",'Clone Shell'].includes(name)){
  let checks=0;for(const creature of [false,true]){
   const ctx=setup(M,role,h),{game:g,a}=ctx,card=h.zoneCard(M,a,fixture(h,'V24 linked incubation',{types:creature?['Creature']:['Sorcery'],cost:'{6}'}),name==='Clone Shell'?'library':'hand');
   const rest=name==='Clone Shell'?Array.from({length:3},(_,i)=>h.zoneCard(M,a,fixture(h,'V24 shell bottom '+i),'library')):[];choices(ctx,[card]);const permanent=await source(M,entry,ctx,h);assert.equal(card.zone,'exile');assert.equal(card.faceDown,true);assert.deepEqual(Array.from(card.meta.revealedTo),name==='Clone Shell'?[a.idx]:[],'only an explicit look instruction preserves later look permission');if(rest.length)assert.deepEqual(Array.from(a.library.slice(0,3)),rest.slice().reverse(),'the chosen ordering determines the library bottom');
   await departure(ctx,permanent,'dies',h);assert.equal(card.faceDown,false);assert.equal(card.zone,creature?'battlefield':'exile');if(creature)assert.equal(card.ctrl,a);assertGameStateInvariants(g);checks+=10;
  }return checks;
 }
 if(['Semblance Anvil','Cemetery Prowler'].includes(name)){
  const ctx=setup(M,role,h),{game:g,a,b}=ctx,donor=h.zoneCard(M,name==='Cemetery Prowler'?b:a,fixture(h,'V24 cost imprint',{types:['Artifact','Creature']}),name==='Cemetery Prowler'?'graveyard':'hand');choices(ctx,[donor]);const permanent=await source(M,entry,ctx,h);assert.equal(donor.zone,'exile');
  const match=h.zoneCard(M,a,fixture(h,'V24 cost matching spell',{types:['Artifact','Creature'],cost:'{5}{G}'}),'hand'),wrong=h.zoneCard(M,a,fixture(h,'V24 nonmatching spell',{types:['Sorcery'],cost:'{4}{G}'}),'hand');assert.equal(g.spellCost(a,match).generic,3,'overlapping linked card types apply the printed reduction exactly');assert.equal(g.spellCost(a,wrong).generic,4);let before=total(a);assert.equal(await g.castSpell(a,match,{from:'hand'}),true);assert.equal(total(a),before-4);await h.resolveAll(g);before=total(a);assert.equal(await g.castSpell(a,wrong,{from:'hand'}),true);assert.equal(total(a),before-5);await h.resolveAll(g);
  await g.move(donor,'hand');await g.move(donor,'exile');assert.equal(g.spellCost(a,h.zoneCard(M,a,match.def,'hand')).generic,5,'a later exile incarnation does not receive the reduction');await g.move(permanent,'exile');assertGameStateInvariants(g);return 11;
 }
 if(['Cemetery Protector','Cemetery Gatekeeper'].includes(name)){
  let checks=0;for(const land of [false,true])for(const branch of ['ordinary','linked-left','source-left']){
   const ctx=setup(M,role,h),{game:g,a,b}=ctx,donor=h.zoneCard(M,b,land?'Forest':fixture(h,'V24 shared types',{types:['Artifact','Creature']}),'graveyard');choices(ctx,[donor]);const permanent=await source(M,entry,ctx,h);assert.equal(donor.zone,'exile');const player=name==='Cemetery Gatekeeper'?b:a;g.turnPlayer=player;
   const wrong=h.zoneCard(M,player,fixture(h,'V24 wrong type',{types:['Instant'],cost:'{2}'}),'hand'),life=player.life;assert.equal(await g.castSpell(player,wrong,{from:'hand'}),true);await h.resolveAll(g);assert.equal(player.life,life);assert.equal(g.bf().filter(card=>card.isToken&&card.hasSub('Human')).length,0);
   if(land){const card=h.zoneCard(M,player,'Forest','hand');assert.equal(await g.playLand(player,card),true);}else{const card=h.zoneCard(M,player,fixture(h,'V24 matching two types',{types:['Artifact','Creature']}),'hand');assert.equal(await g.castSpell(player,card,{from:'hand'}),true);}await g.flushTriggers();assert.ok(g.stack.some(row=>row.srcCard===permanent&&row.kind==='trigger'));
   if(branch==='linked-left')await g.move(donor,'graveyard');else if(branch==='source-left')await g.move(permanent,'exile');await h.resolveAll(g);
   const resolves=branch!=='linked-left';if(name==='Cemetery Gatekeeper')assert.equal(player.life,life-(resolves?2:0),'the intervening type condition is checked again using the captured source incarnation');else{const made=g.bf().filter(card=>card.isToken&&card.hasSub('Human'));assert.equal(made.length,resolves?1:0);if(resolves){assert.equal(made[0].power,1);assert.equal(made[0].toughness,1);assert.deepEqual(Array.from(made[0].colors),['W']);}}
   assertGameStateInvariants(g);checks+=13;
  }return checks;
 }
 if(name==='Unlicensed Hearse'){
  const ctx=setup(M,role,h),{game:g,a,b}=ctx,first=h.zoneCard(M,a,fixture(h,'V24 Hearse first'),'graveyard'),second=h.zoneCard(M,a,fixture(h,'V24 Hearse second'),'graveyard'),other=h.zoneCard(M,b,fixture(h,'V24 other graveyard'),'graveyard'),permanent=await source(M,entry,ctx,h);assert.equal(permanent.power,0);targets(ctx,[first,second]);const option=g.activatableList(a).find(row=>row.card===permanent&&!row.crew);assert.ok(option);assert.equal(await g.activateAbility(a,option),true);await h.resolveAll(g);assert.equal(first.zone,'exile');assert.equal(second.zone,'exile');assert.equal(other.zone,'graveyard');assert.equal(permanent.power,2);assert.equal(permanent.toughness,2);
  const crew=h.permanent(M,g,a,fixture(h,'V24 actual Hearse crewer'));choices(ctx,[crew]);const crewOption=g.activatableList(a).find(row=>row.card===permanent&&row.crew);assert.ok(crewOption);assert.equal(await g.activateAbility(a,crewOption),true);await h.resolveAll(g);assert.equal(crew.tapped,true);assert.equal(permanent.is('Creature'),true);assert.equal(permanent.power,2);
  await g.move(first,'hand');await g.move(first,'exile');g.recalc();assert.equal(permanent.power,1,'CDA counts only the exact current linked exile incarnation');assertGameStateInvariants(g);return 15;
 }
 if(/Hideaway [0-9]+/.test(entry.raw.oracle)){
  let checks=0;for(const branch of ['false','true','decline']){
   const ctx=setup(M,role,h),{game:g,a,b}=ctx,n=Number(/Hideaway ([0-9]+)/.exec(entry.raw.oracle)[1]),chosen=h.zoneCard(M,a,fixture(h,'V24 hidden spell',{cost:'{10}',power:'7',toughness:'9'}),'library'),rest=Array.from({length:n-1},(_,i)=>h.zoneCard(M,a,fixture(h,'V24 hideaway rest '+i),'library'));
   choices(ctx,[chosen]);const permanent=await source(M,entry,ctx,h);assert.equal(chosen.zone,'exile');assert.equal(chosen.faceDown,true);assert.ok(rest.every(card=>a.library.slice(0,n-1).includes(card)),'unselected inspected cards go to the random library bottom');assert.equal(M.OracleV24Permanents.linked(g,permanent,LINK).length,1);assert.deepEqual(Array.from(chosen.meta.revealedTo),[a.idx]);
   const controller=permanent.ctrl;permanent.ctrl=b;g.recalc();assert.deepEqual(Array.from(chosen.meta.revealedTo).sort(),[a.idx,b.idx].sort(),'current and prior source controllers retain look permission under CR406.3');permanent.ctrl=controller;g.recalc();
   if(name==='Watcher for Tomorrow'){assert.equal(permanent.tapped,true);await departure(ctx,permanent,'exile',h);assert.equal(chosen.zone,'hand');assert.equal(chosen.faceDown,false);assertGameStateInvariants(g);checks+=11;continue;}
   const allowed=branch!=='false',cast=branch==='true';
   if(branch==='decline')choose(a,q=>q.type==='chooseCards'&&q.from.includes(chosen)?{...q,from:[],min:0,max:0}:null);
   let host;
   if(name==="Clive's Hideaway"&&allowed)for(let i=0;i<4;i++)h.permanent(M,g,a,fixture(h,'V24 legendary '+i,{super:['Legendary']}));
   if(name==='Howltooth Hollow'){if(allowed)for(const player of [a,b])for(const card of player.hand.slice())await g.move(card,'graveyard');else h.zoneCard(M,b,'Forest','hand');}
   if(name==='Shelldock Isle'&&allowed)while(a.library.length>20)await g.move(a.library.at(-1),'graveyard');
   if(name==="Collector's Cage"){host=h.permanent(M,g,a,fixture(h,'V24 cage counter host'));targets(ctx,[host]);if(allowed){h.permanent(M,g,a,fixture(h,'V24 distinct low',{power:'1'}));h.permanent(M,g,a,fixture(h,'V24 distinct high',{power:'7'}));}}
   if(name==='Wiretapping'){
    const before=a.hand.length;await g.draw(a,1);await h.resolveAll(g);assert.equal(a.hand.length,before+1,'drawing outside the draw step does not trigger Wiretapping');
    if(allowed)while(a.hand.length<9)h.zoneCard(M,a,'Forest','hand');const hand=a.hand.length;await g.runBeginningPhase(a);await h.resolveAll(g);assert.equal(a.hand.length,hand+2,'only the first draw of the draw step adds one draw');
   }else if(name==='Rabble Rousing'){
    for(let i=0;i<(allowed?10:1);i++)h.permanent(M,g,a,fixture(h,'V24 Rabble attacker '+i,{power:'1',toughness:'12'}));const attacker=g.creatures(a)[0],prior=a.controller.decide.bind(a.controller);a.controller.decide=(game,q)=>q.type==='attackers'?(role==='ai'?prior(game,{...q,eligible:[attacker]}):[{card:attacker,target:b}]):prior(game,q);await g.combatPhase(a);await h.resolveAll(g);assert.equal(g.bf().filter(card=>card.isToken&&card.hasSub('Citizen')).length,1,'token count is the number declared attacking');
   }else if(name==='Widespread Thieving'){
    choose(a,q=>q.type==='chooseOption'&&q.options.some(option=>option.key==='no')&&!allowed?{...q,options:q.options.filter(option=>option.key==='no')}:null);const spell=h.zoneCard(M,a,fixture(h,'V24 multicolored trigger',{cost:'{W}{U}'}),'hand'),before=total(a);assert.equal(await g.castSpell(a,spell,{from:'hand'}),true);await h.resolveAll(g);assert.equal(total(a),before-2-(allowed?5:0),'actual five-color payment is made only when accepted');assert.equal(g.bf().filter(card=>card.isToken&&card.hasSub('Treasure')).length,1);
   }else{
    permanent.tapped=false;const ability=g.activatableList(a).find(row=>row.card===permanent&&row.ability.oracleOperationV20===undefined);assert.ok(ability);const before=total(a);assert.equal(await g.activateAbility(a,ability),true);assert.ok(total(a)<before,'linked play ability spends printed mana');await h.resolveAll(g);if(host)assert.equal(host.counters['+1/+1'],1);
   }
   assert.equal(chosen.zone,cast?'battlefield':'exile','the play condition and optional choice both matter');if(cast){assert.equal(chosen.faceDown,false);assert.equal(chosen.ctrl,a);}
   assertGameStateInvariants(g);checks+=16;
  }return checks;
 }
 if(['Chrome Mox',"Ugin's Labyrinth",'Pit of Offerings'].includes(name)){
  let checks=0;for(const use of [false,true]){
   const ctx=setup(M,role,h),{game:g,a,b}=ctx;
   const card=h.zoneCard(M,a,fixture(h,'V24 linked mana card',{cost:name==="Ugin's Labyrinth"?'{8}':'{U}{R}'}),name==='Pit of Offerings'&&use?'graveyard':'hand');
   const wrong=h.zoneCard(M,a,fixture(h,'V24 rejected imprint',{cost:'{7}{G}',types:['Artifact','Creature']}),'hand');
   if(name==='Pit of Offerings')targets(ctx,use?[card]:[]);else if(use)choices(ctx,[card]);else choose(a,q=>q.type==='chooseOption'&&q.options.some(option=>option.key==='no')?{...q,options:q.options.filter(option=>option.key==='no')}:q.type==='chooseTargets'&&q.min===0?{...q,candidates:[],max:0}:null);
   const permanent=await source(M,entry,ctx,h);assert.equal(card.zone,use?'exile':'hand');assert.equal(wrong.zone,'hand');
   const linked=M.OracleV24Permanents.linked(g,permanent,LINK);assert.equal(linked.includes(card),use);
   permanent.tapped=false;g.recalc();const mana=g.manaSources(a).filter(row=>row.card===permanent),manaOptions=mana.flatMap(row=>row.produce);
   if(name==='Chrome Mox')assert.deepEqual(Array.from(manaOptions,choice=>Object.keys(choice)[0]).sort(),use?['R','U']:[]);else if(name==="Ugin's Labyrinth")assert.equal(JSON.stringify(manaOptions),JSON.stringify([{C:use?2:1}]));else assert.deepEqual(Array.from(manaOptions,choice=>Object.keys(choice)[0]).sort(),use?['C','R','U']:['C']);
   if(mana.length&&manaOptions.length){const row=mana.find(row=>row.produce.length),color=Object.keys(manaOptions[0])[0],before=a.pool[color];assert.equal(await g.activateManaSource(a,row,manaOptions[0]),true);assert.equal(a.pool[color],before+manaOptions[0][color]);assert.equal(permanent.tapped,true);}
   if(use&&name==="Ugin's Labyrinth"){permanent.tapped=false;const option=g.activatableList(a).find(row=>row.card===permanent);assert.ok(option);assert.equal(await g.activateAbility(a,option),true);await h.resolveAll(g);assert.equal(card.zone,'hand');assert.equal(M.OracleV24Permanents.linked(g,permanent,LINK).length,0);}
   assertGameStateInvariants(g);checks+=10;
  }return checks;
 }
 if(['Mesmeric Fiend','Tidehollow Sculler','Wormfang Behemoth','Hypnox','Induced Amnesia'].includes(name)){
  let checks=0;for(const mode of ['ordinary','leaves-before-acquire','old-card-incarnation']){
   const ctx=setup(M,role,h),{game:g,a,b}=ctx,owner=name==='Wormfang Behemoth'?a:b;
   const first=h.zoneCard(M,owner,fixture(h,'V24 linked hand card'),'hand'),second=h.zoneCard(M,owner,fixture(h,'V24 linked hand second'),'hand'),land=h.zoneCard(M,owner,'Forest','hand');
   targets(ctx,[b]);choices(ctx,[first]);const permanent=h.zoneCard(M,a,name,'hand'),before=total(a);assert.equal(await g.castSpell(a,permanent,{from:'hand'}),true);assert.ok(total(a)<before);await g.resolveTop();await g.flushTriggers();assert.ok(g.stack.some(row=>row.srcCard===permanent&&row.kind==='trigger'));
   if(mode==='leaves-before-acquire'){await g.move(permanent,name==='Induced Amnesia'?'graveyard':'exile');await g.flushTriggers();await g.resolveTop();assert.equal(first.zone,'hand','LTB resolves before acquisition and finds no linked card');}
   await h.resolveAll(g);assert.equal(first.zone,'exile');const cohort=M.OracleV24Permanents.linked(g,permanent,LINK,{sourceZoneVersion:mode==='leaves-before-acquire'?permanent.zoneVersion-1:permanent.zoneVersion});assert.ok(cohort.includes(first));
   const all=['Wormfang Behemoth','Hypnox','Induced Amnesia'].includes(name);assert.equal(second.zone,all?'exile':'hand');assert.equal(land.zone,all?'exile':'hand');if(name==='Induced Amnesia')assert.equal(b.hand.length,3,'the targeted player draws the actual exiled cohort size');
   if(mode==='old-card-incarnation'){await g.move(first,'hand');await g.move(first,'exile');}
   if(mode!=='leaves-before-acquire'){await departure(ctx,permanent,name==='Induced Amnesia'?'dies':'exile',h);assert.equal(first.zone,mode==='old-card-incarnation'?'exile':'hand','linked return excludes a later exile incarnation');if(all){assert.equal(second.zone,'hand');assert.equal(land.zone,'hand');}}
   assertGameStateInvariants(g);checks+=11;
  }return checks;
 }
 if(['Wormfang Crab','Wormfang Drake','Exclusion Ritual'].includes(name)){
  let checks=0;for(const use of name==='Wormfang Drake'?[false,true]:[true]){
   const ctx=setup(M,role,h),{game:g,a,b}=ctx,owner=name==='Exclusion Ritual'?b:a,host=h.permanent(M,g,owner,fixture(h,'V24 linked battlefield host'));
   if(name==='Exclusion Ritual')targets(ctx,[host]);else if(name==='Wormfang Crab')choose(b,q=>q.type==='chooseCards'&&q.from.includes(host)?{...q,from:[host]}:null);else if(use)choices(ctx,[host]);else choose(a,q=>q.type==='chooseCards'&&q.from.includes(host)?{...q,from:[],max:0}:null);
   const permanent=await source(M,entry,ctx,h);assert.equal(host.zone,use?'exile':'battlefield');assert.equal(permanent.zone,use?'battlefield':'graveyard');
   if(use&&name==='Exclusion Ritual'){g.turnPlayer=b;const matching=h.zoneCard(M,b,host.def,'hand'),other=h.zoneCard(M,b,fixture(h,'V24 unrelated spell'),'hand');assert.equal(await g.castSpell(b,matching,{from:'hand'}),false,'linked name prohibition rejects the matching spell');assert.equal(await g.castSpell(b,other,{from:'hand'}),true);await h.resolveAll(g);await g.move(permanent,'exile');assert.equal(await g.castSpell(b,matching,{from:'hand'}),true);await h.resolveAll(g);assert.equal(host.zone,'exile','Exclusion Ritual has no return ability');}
   else if(use){await departure(ctx,permanent,'exile',h);assert.equal(host.zone,'battlefield');assert.equal(host.ctrl,host.owner);}
   assertGameStateInvariants(g);checks+=9;
  }return checks;
 }
 if(name==="Ashiok's Erasure"){
  const ctx=setup(M,role,h),{game:g,a,b}=ctx,spell=h.zoneCard(M,b,fixture(h,'V24 erased spell'),'hand');g.turnPlayer=b;assert.equal(await g.castSpell(b,spell,{from:'hand'}),true);const target=g.stack.find(row=>row.card===spell);g.turnPlayer=a;targets(ctx,[target]);
  const permanent=await source(M,entry,ctx,h);assert.equal(spell.zone,'exile');assert.equal(g.stack.includes(target),false);g.turnPlayer=b;const match=h.zoneCard(M,b,spell.def,'hand');assert.equal(await g.castSpell(b,match,{from:'hand'}),false);await departure(ctx,permanent,'exile',h);assert.equal(spell.zone,'hand');assert.equal(await g.castSpell(b,match,{from:'hand'}),true);await h.resolveAll(g);assertGameStateInvariants(g);return 9;
 }
 return null;
}
