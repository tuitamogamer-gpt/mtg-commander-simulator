import assert from 'node:assert/strict';

export function stageCondition(MTG,ctx,condition,source,helpers) {
  if(!condition)return;
  const {game,a,b}=ctx;
  const {permanent,fixtureDefinition,zoneCard}=helpers;
  const add=(what='Creature',extras={})=>permanent(MTG,game,a,fixtureDefinition('V5 condition '+what,[what],{power:'5',toughness:'20',...extras}));
  switch(condition.kind){
    case 'not': break;
    case 'all': for(const item of condition.conditions)stageCondition(MTG,ctx,item,source,helpers);break;
    case 'count-comparison': if(condition.min){for(let i=0;i<condition.min&&countValue(ctx,source,condition.count)<condition.min;i++)stageCount(MTG,ctx,condition.count,helpers);}else if(condition.count.zone==='hand'){while(a.hand.length>(condition.max||0)){const card=a.hand.pop();card.zone='library';a.library.push(card);}}break;
    case 'turn-stat': a.turnState[condition.field]=condition.min;break;
    case 'opponent-life': b.life=condition.max;break;
    case 'graveyard-count': while(a.graveyard.length<condition.min)zoneCard(MTG,a,'Forest','graveyard');break;
    case 'graveyard-types': for(const name of ['Forest','Grizzly Bears','Sol Ring','Doom Blade','Rancor'])zoneCard(MTG,a,name,'graveyard');break;
    case 'permanent-count': for(let i=0;i<condition.min;i++)add(condition.type[0].toUpperCase()+condition.type.slice(1));break;
    case 'land-subtype': permanent(MTG,game,a,condition.subtype);break;
    case 'your-turn': game.turnPlayer=a;break;
    case 'not-your-turn': game.turnPlayer=b;break;
    case 'attacked': a.turnState.attacked=true;break;
    case 'opponent-lost-life': b.turnState.lifeLost=1;break;
    case 'creature-died': game.diedThisTurn.push({types:['Creature']});break;
    case 'ferocious': case 'formidable': add('Creature',{power:'8'});break;
    case 'coven': for(const power of ['1','3','5'])add('Creature',{power});break;
    case 'pack-tactics': source.attacking=b;game.combat={...(game.combat||{}),attackers:[source,add('Creature',{power:'8'})]};break;
    case 'cast-from-hand': source.castMeta={...(source.castMeta||{}),from:'hand'};break;
    case 'kicked': source.castMeta={...(source.castMeta||{}),kicked:true};break;
    case 'source-status':
      if(condition.status==='attacking')source.attacking=b;
      else if(condition.status==='blocking')source.blocking=1;
      else if(condition.status==='tapped'||condition.status==='untapped')source.tapped=condition.status==='tapped';
      else {const attachment=add(condition.status==='equipped'?'Artifact':'Enchantment',{subtypes:[condition.status==='equipped'?'Equipment':'Aura']});attachment.attachedTo=source.iid;source.attachments.push(attachment.iid);}break;
    case 'has-permanent': {
      const type=['artifact','creature','enchantment'].includes(condition.what.toLowerCase())?condition.what[0].toUpperCase()+condition.what.slice(1).toLowerCase():'Creature';
      add(type,{subtypes:[condition.what]});break;
    }
    case 'life': a.life=condition.threshold;break;
    case 'no-other-creatures': for(const card of game.creatures(a))if(card!==source){game.battlefield.splice(game.battlefield.indexOf(card),1);card.zone='hand';a.hand.push(card);}break;
    case 'hand-count': while(a.hand.length>condition.n){const card=a.hand.pop();card.zone='library';a.library.push(card);}while(a.hand.length<condition.n)zoneCard(MTG,a,'Forest','hand');break;
    case 'filtered-permanent-count': for(let i=0;i<condition.min;i++){const c=add('Creature',{subtypes:[condition.what]});c.tapped=!!condition.tapped;}break;
    default: assert.fail('Missing condition driver '+condition.kind);
  }
  game.recalc();
}

export function countValue(ctx,source,node,snapshot=null){
  const {game,a}=ctx;
  if(node.kind==='source-counters')return (snapshot?.cards.get(source)?.counters||source.counters)[node.counter]||0;
  if(node.kind==='died-count')return game.diedThisTurn.filter(row=>row.types.includes('Creature')).length;
  if(node.kind==='max-stat')return Math.max(0,...(snapshot?.battlefield||game.bf()).filter(card=>node.filters.some(filter=>matchesTarget(card,filter,ctx,source))).map(card=>snapshot?.cards.get(card)?.[node.stat]??card[node.stat]));
  if(node.kind==='sum')return node.values.reduce((sum,item)=>sum+countValue(ctx,source,item,snapshot),0);
  if(node.kind==='life-total')return a.life;
  const players=node.controller==='all'?game.players:node.controller==='opponents'?game.players.filter(p=>p!==a):[a];
  const cards=node.zone==='battlefield'?(snapshot?.battlefield||game.battlefield).filter(c=>players.includes(c.ctrl)):players.flatMap(p=>snapshot?snapshot.players.get(p)[node.zone+'Cards']:p[node.zone]);
  const rows=cards.filter(card=>(!node.other||card!==source)&&(!node.name||card.name===node.name)&&matches(card,node.what)&&(!node.filters||node.filters.some(filter=>matchesTarget(card,filter,ctx,source)))).filter(card=>{
    if(!node.color)return true;
    if(node.color==='nonbasic')return !card.def.super.includes('Basic');
    if(node.color==='colorless')return card.colors.length===0;
    if(node.color==='multicolored')return card.colors.length>1;
    return card.colors.includes({white:'W',blue:'U',black:'B',red:'R',green:'G'}[node.color]);
  });
  if(node.unique==='types')return new Set(rows.flatMap(c=>c.def.types.map(t=>t==='Tribal'?'Kindred':t))).size;
  if(node.unique==='colors')return new Set(rows.flatMap(c=>c.colors)).size;
  if(node.unique==='basic-land-types')return ['Plains','Island','Swamp','Mountain','Forest'].filter(t=>rows.some(c=>c.hasSub(t))).length;
  return rows.length;
}
export function matches(card,what){
  if(what==='card')return true;
  if(what==='basic land')return card.is('Land')&&card.def.super.includes('Basic');
  if(what==='nonland permanent')return !card.is('Land')&&!card.is('Instant')&&!card.is('Sorcery');
  if(what==='permanent')return !card.is('Instant')&&!card.is('Sorcery');
  return what.replace(/ permanent$/,'').split(' or ').some(t=>/^(artifact|creature|land|instant|sorcery|enchantment|planeswalker)$/i.test(t)?card.is(t[0].toUpperCase()+t.slice(1).toLowerCase()):card.hasSub(t));
}
export function matchesTarget(card,f,ctx,source){
 const {a}=ctx;
 if(f.alternatives&&!f.alternatives.some(alternative=>matchesTarget(card,alternative,ctx,source)))return false;
 if(!matches(card,f.what)||f.controller==='you'&&card.ctrl!==a||f.controller==='opponent'&&card.ctrl===a||f.excludeSelf&&card===source)return false;
 const sup=card.cur?.super||card.def.super||[];
 if(f.subtype&&!card.hasSub(f.subtype)||f.notSubtype&&card.hasSub(f.notSubtype)||f.alsoType&&!card.is(f.alsoType)||f.notType&&card.is(f.notType))return false;
 if(f.token&&!card.isToken||f.nontoken&&card.isToken||f.tapped&&!card.tapped||f.untapped&&card.tapped)return false;
 if(f.hasCounter&&!(card.counters[f.hasCounter]>0)||f.withKeyword&&!card.kw(f.withKeyword)||f.withoutKeyword&&card.kw(f.withoutKeyword))return false;
 if(f.snow&&!sup.includes('Snow')||f.nonsnow&&sup.includes('Snow')||f.legendary&&!sup.includes('Legendary')||f.nonlegendary&&sup.includes('Legendary')||f.nonbasic&&sup.includes('Basic'))return false;
 if(f.nonblack&&card.colors.includes('B')||f.nonartifact&&card.is('Artifact'))return false;
 if(f.color){const symbol={white:'W',blue:'U',black:'B',red:'R',green:'G'}[f.color];if(symbol?!card.colors.includes(symbol):f.color==='colorless'?card.colors.length>0:f.color==='multicolored'?card.colors.length<2:card.colors.length!==1)return false;}
 if(f.notColor){const symbol={white:'W',blue:'U',black:'B',red:'R',green:'G'}[f.notColor];if(symbol?card.colors.includes(symbol):!card.colors.length)return false;}
 if(f.colorsAny&&!f.colorsAny.some(c=>card.colors.includes(c)))return false;
 if(f.stat&&(f.comparison==='less'?card[f.stat]>f.threshold:card[f.stat]<f.threshold))return false;
 if(f.attacking&&!card.attacking||f.blocking&&!card.blocking||f.attackingOrBlocking&&!card.attacking&&!card.blocking)return false;
 if(f.enchanted&&!card.attachments.some(id=>ctx.game.byIid(id)?.hasSub('Aura'))||f.equipped&&!card.attachments.some(id=>ctx.game.byIid(id)?.hasSub('Equipment')))return false;
 return true;
}
export function stageCount(MTG,ctx,node,helpers){
  if(typeof node!=='object'||node===null)return;
  if(node.kind==='died-count'){ctx.game.diedThisTurn.push({types:['Creature']},{types:['Creature']});return;}
  if(['source-stat','target-stat','source-counters'].includes(node.kind))return;
  if(node.kind==='life-total')return;
  if(node.kind==='sum'){for(const item of node.values)stageCount(MTG,ctx,item,helpers);return;}
  if(node.unique==='types'){for(const name of ['Forest','Grizzly Bears','Sol Ring','Doom Blade','Rancor','Divination'])helpers.zoneCard(MTG,ctx.a,name,'graveyard');return;}
  if(node.unique==='basic-land-types'){for(const name of ['Plains','Island','Swamp','Mountain','Forest'])helpers.permanent(MTG,ctx.game,ctx.a,name);return;}
  if(node.filters){for(const target of node.filters)for(let i=0;i<3;i++)helpers.stageGenericTarget(MTG,ctx,target,i);return;}
  const {game,a,b}=ctx;
  const p=node.controller==='opponents'?b:a;
  const types=['Artifact','Creature','Enchantment','Land','Instant','Sorcery'].filter(type=>new RegExp(type,'i').test(node.what));
  const type=types[0]||'Creature';
  for(let i=0;i<3;i++){
    const def=helpers.fixtureDefinition(node.name||'V5 counted '+i,[type],{subtypes:[node.what.replace(/ permanent$/,''),'Forest'],colorsOverride:['G','W'],power:'3',toughness:'20'});
    const card=new MTG.CardInst(def,p);card.zone=node.zone;card.ctrl=p;
    if(node.zone==='battlefield')game.battlefield.push(card);else p[node.zone].push(card);
  }
  game.recalc();
}

export async function characteristicProof(MTG,entry,op,role,h){
  const ctx=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'});
  const {game,a}=ctx;h.fund(a);h.fillLibrary(MTG,a,30);
  if(op.count.kind!=='life-total')stageCount(MTG,ctx,op.count,h);
  const source=h.zoneCard(MTG,a,entry.raw.name,'hand');
  const check=()=>{
    const value=countValue(ctx,source,op.count)*op.multiply+op.offset;
    if(op.power)assert.equal(source.power,value,entry.raw.name+': CDA power in '+source.zone);
    if(op.toughness)assert.equal(source.toughness,value+op.toughnessOffset,entry.raw.name+': CDA toughness in '+source.zone);
  };
  check();await game.move(source,'graveyard');check();await game.move(source,'hand');
  assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);
  if(source.zone==='battlefield'){
    // Continuous bonuses are separate operation proofs. CDA is evaluated before them.
    const modifiers=(entry.implementation||[]).filter(o=>o.kind==='generic-static');
    if(!modifiers.length)check();
    await game.move(source,'exile');check();
  }else check();
  return 4;
}

export async function staticProof(MTG,entry,op,role,h){
 const ctx=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;
 const source=h.permanent(MTG,game,a,entry.raw.name);
 stageCondition(MTG,ctx,op.condition,source,h);
 if(op.multiplier)stageCount(MTG,ctx,op.multiplier,h);
 game.recalc();
 if(op.scope==='filtered-permanents'){
   const targets=op.filters.map((filter,index)=>h.stageGenericTarget(MTG,ctx,{...filter,controller:filter.controller==='any'?'opponent':filter.controller},index));
   for(const target of targets)for(const kw of op.removeKeywords||[])target.def.kws=[...(target.def.kws||[]),kw];
   game.recalc();
   const original=source.def.statics,selected=original.find(layer=>layer.oracleOperation===op);assert.ok(selected);
   const prior=targets.map(card=>({power:card.power,toughness:card.toughness}));
   for(const target of targets){
     for(const kw of op.keywords||[])assert.equal(target.kw(kw),true,entry.raw.name+': filtered keyword');
     for(const kw of op.removeKeywords||[])assert.equal(target.kw(kw),false,entry.raw.name+': filtered removed keyword');
     if(op.cantAttack)assert.equal(target.cur.cantAttack,true);
     if(op.cantBlock)assert.equal(target.cur.cantBlock,true);
   }
   try{source.def.statics=original.filter(layer=>layer!==selected);game.recalc();
     targets.forEach((target,index)=>{assert.equal(prior[index].power-target.power,op.power||0);assert.equal(prior[index].toughness-target.toughness,op.toughness||0);});
   }finally{source.def.statics=original;game.recalc();}
   return Math.max(2,targets.length*2);
 }
 if(op.protectionQualities){
   for(const quality of op.protectionQualities){
     const type=quality.kind==='type'?quality.value:'Creature';
     const colors=quality.kind==='color'?[quality.value]:quality.kind==='multicolored'?['W','U']:quality.kind==='colored'||quality.kind==='monocolored'?['W']:[];
     const hostile=new MTG.CardInst(h.fixtureDefinition('V6 protection source',[type],{subtypes:[quality.kind==='subtype'?quality.value:'Test'],colorsOverride:colors}),b);
     hostile.zone='hand';b.hand.push(hostile);
     assert.equal(game.isProtectedFrom(source,hostile),true,entry.raw.name+': protection recognizes '+JSON.stringify(quality));
     assert.equal(await game.damageCreature(hostile,source,3),0,entry.raw.name+': protection prevents damage');
   }
   for(const kw of op.keywords||[])assert.equal(source.kw(kw),true,entry.raw.name+': accompanying keyword');
   return op.protectionQualities.length*2;
 }
 if(op.evasionMinBlockerPower!==undefined||op.evasionLessThanOwnPower||op.excludedBlockers||op.blockedOnlyByFlyingOrReach){
   const make=extras=>h.permanent(MTG,game,b,h.fixtureDefinition('V5 blocker',['Creature'],{power:'2',toughness:'20',kws:['flying','reach',...(source.kw('shadow')?['shadow']:[]),...(source.kw('horsemanship')?['horsemanship']:[])],colorsOverride:[],...extras}));
   let forbidden,legal;
   if(op.evasionMinBlockerPower!==undefined){forbidden=make({power:String(op.evasionMinBlockerPower)});legal=make({power:String(op.evasionMinBlockerPower-1)});}
   else if(op.evasionLessThanOwnPower){forbidden=make({power:String(source.power-1)});legal=make({power:String(source.power)});}
   else if(op.blockedOnlyByFlyingOrReach){forbidden=make({kws:[]});legal=make({kws:['flying']});}
   else if(op.excludedBlockers==='walls'){forbidden=make({subtypes:['Wall']});legal=make({subtypes:['Bear']});}
   else if(op.excludedBlockers==='artifact creatures'){forbidden=make({types:['Artifact','Creature']});legal=make({types:['Creature']});}
   else {forbidden=make({colorsOverride:[{white:'W',blue:'U',black:'B',red:'R',green:'G'}[op.excludedBlockers.split(' ')[0]]]});legal=make({colorsOverride:[]});}
   game.recalc();assert.equal(game.canBlock(forbidden,source),false,entry.raw.name+': excluded blocker');
   assert.equal(game.canBlock(legal,source),true,entry.raw.name+': legal blocker remains');return 2;
 }
 if(op.scope==='self'){
   for(const kw of op.keywords||[])assert.equal(source.kw(kw),true,entry.raw.name+': conditional keyword '+kw);
   const original=source.def.statics;
   const generic=(entry.implementation||[]).filter(o=>o.kind==='generic-static');
   const index=generic.indexOf(op);
   // Remove only this continuous layer to measure its contribution, then
   // restore it. Card identity, zones, other abilities, and game state remain.
   const selected=original.find(s=>s.oracleOperation===op);assert.ok(selected,entry.raw.name+': continuous descriptor');
   const before={power:source.power,toughness:source.toughness};
   const multiple=op.multiplier?countValue(ctx,source,op.multiplier):1;
   try {source.def.statics=original.filter(s=>s!==selected);game.recalc();
     if(op.power)assert.equal(before.power-source.power,op.power*multiple,entry.raw.name+': power contribution');
     if(op.toughness)assert.equal(before.toughness-source.toughness,op.toughness*multiple,entry.raw.name+': toughness contribution');
   }finally{source.def.statics=original;game.recalc();}
   return 2;
 }
 const p=op.scope==='opponent-creatures'?b:a;
 const subtypes=op.subtype?[op.subtype]:[];
 const target=h.permanent(MTG,game,p,h.semanticSubtypeFixture(op));
 const opposite=h.permanent(MTG,game,p===a?b:a,h.semanticSubtypeFixture(op));
 if(op.subtype==='tapped'){target.tapped=true;opposite.tapped=true;}
 if(op.subtype==='attacking'){target.attacking=b;opposite.attacking=a;}
 if(op.subtype==='token'){target.isToken=true;opposite.isToken=true;}
 if(op.subtype?.toLowerCase()==='enchanted')for(const card of [target,opposite]){const aura=h.permanent(MTG,game,card.ctrl,h.fixtureDefinition('V6 attached Aura',['Enchantment'],{subtypes:['Aura']}));aura.attachedTo=card.iid;card.attachments.push(aura.iid);}
 game.recalc();
 const prior={power:target.power,toughness:target.toughness,opposite:opposite.power,source:source.power};
 const statics=source.def.statics,selected=statics.find(s=>s.oracleOperation===op);assert.ok(selected);
 try{source.def.statics=statics.filter(s=>s!==selected);game.recalc();
   assert.equal(prior.power-target.power,op.power||0,entry.raw.name+': selected controller receives power');
   assert.equal(prior.toughness-target.toughness,op.toughness||0,entry.raw.name+': selected controller receives toughness');
   assert.equal(prior.opposite-opposite.power,['all-creatures','all-other-creatures'].includes(op.scope)?(op.power||0):0,entry.raw.name+': opposite controller scope');
   if(['your-other-creatures','all-other-creatures'].includes(op.scope))assert.equal(source.power,prior.source,entry.raw.name+': source excluded');
 }finally{source.def.statics=statics;game.recalc();}
 for(const keyword of op.keywords||[])assert.equal(target.kw(keyword),true,entry.raw.name+': matching creature receives keyword');
 return 3;
}

export const mechanicKinds=new Set(['mechanic-unearth','mechanic-grave-return-self','mechanic-embalm','mechanic-eternalize','mechanic-soulshift','mechanic-modular','mechanic-fabricate','mechanic-living-weapon','mechanic-for-mirrodin','mechanic-offspring','mechanic-afflict','mechanic-ingest','mechanic-ninjutsu','mechanic-foretell','mechanic-retrace','doesnt-untap']);
for(const kind of ['evoke','kicker','multikicker','escape','additional-costs','no-max-hand','echo','dash','dredge','plot','devour','graft','surge','spectacle'])mechanicKinds.add('mechanic-'+kind);
export async function mechanicProof(MTG,entry,op,role,h){
 const controller=h.decision({chooseX:(g,q)=>Math.min(3,q.max??3),chooseCards:(g,q)=>q.from.slice(0,q.max??q.min??1),chooseTargets:(g,q)=>q.candidates.slice(0,q.max??q.min??1),chooseOption:(g,q)=>q.options.find(o=>o.key==='yes')?.key||q.options[0].key});
 const ctx=h.gameFor(MTG,[controller,h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;
 h.fund(a,100);h.fillLibrary(MTG,a,60);h.fillLibrary(MTG,b,60);
 for(let i=0;i<5;i++)h.zoneCard(MTG,a,'Forest','hand');
 const additionalFixtures=[];
 const stageAdditional=cost=>{
   if(cost.kind==='sacrifice'){
     const card=h.permanent(MTG,game,a,h.fixtureDefinition('V6 additional cost permanent',cost.object.types||['Creature'],{super:['Legendary'],power:'0',toughness:'20'}));additionalFixtures.push(card);
   }
   for(const child of cost.options||cost.costs||[])stageAdditional(child);
 };
 for(const operation of entry.implementation)if(operation.kind==='mechanic-additional-costs')for(const cost of operation.costs)stageAdditional(cost);
 for(const operation of entry.implementation){
   if(operation.kind==='aura-target')h.permanent(MTG,game,a,'Grizzly Bears');
   for(const [i,target] of (operation.targets||[]).entries())h.stageGenericTarget(MTG,ctx,target,i,operation.effects?.find(e=>e.target===i));
   const v4=operation.kind==='spell-v4'?operation:operation.v4Body;
   if(v4)for(const [i,target] of v4.targets.entries())await h.stageSpellV4Target(MTG,ctx,{name:entry.raw.name},target,v4.effects.find(e=>e.targetIds.includes(target.id)),h.spellV4TargetVariants(target)[0],i);
   if(operation.kind==='spell-counter'&&op.kind!=='mechanic-foretell'){
     await h.stageSpellV4Target(MTG,ctx,{name:entry.raw.name},{kind:'spell',zone:'stack',quantity:{min:1,max:1}},{kind:'counterSpell',targetIds:[]},'Instant',0);
   }else if(['spell-pump','spell-damage','spell-destroy','spell-bounce','spell-exile'].includes(operation.kind)){
     const what=(operation.what||'creature').replace(/^target /,'');
     h.stageGenericTarget(MTG,ctx,{what,controller:'any'},0,{action:operation.kind.slice(6),n:operation.n});
   }
 }
 for(const operation of entry.implementation||[])if(operation.kind==='attachment-grant'&&operation.multiplier)stageCount(MTG,ctx,operation.multiplier,h);
 const source=h.zoneCard(MTG,a,entry.raw.name,['mechanic-unearth','mechanic-grave-return-self','mechanic-embalm','mechanic-eternalize','mechanic-retrace','mechanic-escape'].includes(op.kind)?'graveyard':'hand');
 const cast=async()=>{assert.equal(await game.castSpell(a,source,{from:'hand',xVal:3}),true,entry.raw.name+': mechanic paid cast');await h.resolveAll(game);};
 if(op.kind==='mechanic-surge'||op.kind==='mechanic-spectacle'){
   const kind=op.kind.slice(9),definition=source.def.altCosts.find(alt=>alt[kind]);assert.ok(definition);
   assert.equal(await game.castSpell(a,source,{from:'hand',alt:definition}),false,entry.raw.name+': inactive alternate cost rejected');
   if(kind==='surge')a.turnState.spellsCast=1;else await game.loseLife(b,1,'spectacle test');
   const offer=game.castableList(a).find(row=>row.card===source&&row.alt?.[kind]);assert.ok(offer);
   const before=Object.values(a.pool).reduce((x,y)=>x+y,0);assert.equal(await game.castSpell(a,source,{from:'hand',alt:offer.alt}),true);assert.ok(Object.values(a.pool).reduce((x,y)=>x+y,0)<before);await h.resolveAll(game);return 3;
 }
 if(op.kind==='mechanic-dredge'){
   await game.move(source,'graveyard');
   if(role==='human'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.aiHint?.kind==='dredge'?'dredge:'+source.iid:decide(g,q);}
   const n=a.library.length;await game.draw(a,1);assert.equal(source.zone,'hand',entry.raw.name+': dredge returns exact card');assert.equal(a.library.length,n-op.n);return 2;
 }
 if(op.kind==='mechanic-plot'){
   const action=game.activatableList(a).find(row=>row.card===source&&row.plot);assert.ok(action,entry.raw.name+': plot offered');
   assert.equal(await game.activateAbility(a,action),true);assert.equal(source.zone,'exile');
   assert.equal(game.castableList(a).some(row=>row.card===source),false,entry.raw.name+': no plotted cast on same turn');
   game.turnNo++;const offer=game.castableList(a).find(row=>row.card===source&&row.alt?.plotPlay);assert.ok(offer,entry.raw.name+': plotted cast on later turn');
   assert.equal(await game.castSpell(a,source,{from:'exile',alt:offer.alt}),true);await h.resolveAll(game);return 4;
 }
 if(op.kind==='mechanic-dash'){
   const offer=game.castableList(a).find(row=>row.card===source&&row.alt?.dash);assert.ok(offer);
   assert.equal(await game.castSpell(a,source,{from:'hand',alt:offer.alt}),true);await h.resolveAll(game);
   assert.equal(source.kw('haste'),true);await game.emit('endStep',{player:a});await h.resolveAll(game);assert.equal(source.zone,'hand');return 3;
 }
 if(op.kind==='mechanic-echo'){
   await cast();assert.equal(source.meta.oracleEchoPending,true);
   await game.emit('upkeep',{player:a});await h.resolveAll(game);assert.equal(source.meta.oracleEchoPending,false);
   assert.ok(source.zone==='battlefield'||source.zone==='graveyard');
   if(source.zone==='battlefield'){assert.equal(source.counters.echo,undefined);await game.emit('upkeep',{player:a});assert.equal(game.pendingTriggers.some(row=>String(row.name).startsWith('Echo')),false);}
   return 3;
 }
 if(op.kind==='mechanic-devour'){
   h.permanent(MTG,game,a,h.fixtureDefinition('Devour fodder',['Creature'],{power:'0',toughness:'1'}));
   h.permanent(MTG,game,a,h.fixtureDefinition('Devour fodder 2',['Creature'],{power:'0',toughness:'1'}));
   await cast();assert.ok(source.meta.oracleDevoured>=0);assert.equal(source.counters['+1/+1']||0,source.meta.oracleDevoured*op.n);return 2;
 }
 if(op.kind==='mechanic-graft'){
   await cast();const before=source.counters['+1/+1'];assert.ok(before>=op.n);
   const target=new MTG.CardInst(MTG.DEFS['Grizzly Bears'],a);target.zone='nowhere';await game.move(target,'battlefield',{ctrl:a});await h.resolveAll(game);
   assert.equal(target.counters['+1/+1'],1);assert.equal(source.counters['+1/+1']||0,before-1);return 3;
 }
 if(op.kind==='mechanic-escape'){
   const fodder=Array.from({length:op.n},()=>h.zoneCard(MTG,a,'Forest','graveyard'));
   const option=game.castableList(a).find(row=>row.card===source&&row.alt?.escape);assert.ok(option,entry.raw.name+': escape offered');
   const prior=Object.values(a.pool).reduce((x,y)=>x+y,0);
   assert.equal(await game.castSpell(a,source,{from:'graveyard',alt:option.alt,xVal:3}),true);
   assert.equal(fodder.filter(card=>card.zone==='exile').length,op.n);assert.equal(source.zone,'stack');
   assert.ok(Object.values(a.pool).reduce((x,y)=>x+y,0)<prior);await h.resolveAll(game);return 4;
 }
 if(op.kind==='mechanic-kicker'||op.kind==='mechanic-multikicker'){
   const prior=Object.values(a.pool).reduce((x,y)=>x+y,0);
   assert.equal(await game.castSpell(a,source,{from:'hand',xVal:3}),true);
   const object=game.stack.find(row=>row.card===source);assert.ok(object);
   if(op.kind==='mechanic-kicker')assert.equal(object.kicked,true,entry.raw.name+': kicker paid');
   else assert.ok(source.castMeta.paidTimes>0,entry.raw.name+': multikicker payment count');
   assert.ok(Object.values(a.pool).reduce((x,y)=>x+y,0)<prior);await h.resolveAll(game);return 3;
 }
 if(op.kind==='mechanic-additional-costs'){
   const prior={hand:a.hand.filter(card=>card!==source),life:a.life};
   assert.equal(await game.castSpell(a,source,{from:'hand',xVal:3}),true);assert.equal(source.zone,'stack');
   const paid=cost=>cost.kind==='sacrifice'?additionalFixtures.filter(card=>card.zone==='graveyard').length>=cost.quantity.min:cost.kind==='discard'?prior.hand.filter(card=>card.zone==='graveyard').length>=cost.quantity.min:cost.kind==='payLife'?a.life<prior.life:cost.kind==='choice'?cost.options.some(paid):cost.kind==='sequence'?cost.costs.every(paid):false;
   assert.ok(op.costs.every(paid),entry.raw.name+': every mandatory additional cost is paid before resolution');await h.resolveAll(game);return 3;
 }
 if(op.kind==='mechanic-no-max-hand'){
   await cast();while(a.hand.length<12)h.zoneCard(MTG,a,'Forest','hand');
   game.mainPhase=async()=>{};game.combatPhase=async()=>{};await game.runTurn();
   assert.ok(a.hand.length>7,entry.raw.name+': cleanup keeps cards beyond seven');return 2;
 }
 if(op.kind==='mechanic-evoke'){
   const option=game.castableList(a).find(row=>row.card===source&&row.alt?.evoke);assert.ok(option,entry.raw.name+': evoke offered');
   const prior=Object.values(a.pool).reduce((x,y)=>x+y,0);
   assert.equal(await game.castSpell(a,source,{from:'hand',alt:option.alt}),true,entry.raw.name+': paid evoke cast');
   assert.ok(Object.values(a.pool).reduce((x,y)=>x+y,0)<prior,entry.raw.name+': evoke mana paid');
   let sacrificed=false;const sacrifice=game.sacrifice;
   game.sacrifice=async function(p,card,...rest){if(card===source)sacrificed=true;return sacrifice.call(this,p,card,...rest);};
   await h.resolveAll(game);assert.equal(sacrificed,true,entry.raw.name+': evoke sacrifice resolved');
   sacrificed=false;await game.move(source,'hand');await cast();assert.equal(sacrificed,false,entry.raw.name+': normal cast does not evoke-sacrifice');
   return 3;
 }
 if(['mechanic-unearth','mechanic-grave-return-self','mechanic-embalm','mechanic-eternalize'].includes(op.kind)){
   const beforeMana=Object.values(a.pool).reduce((x,y)=>x+y,0);
   const action=game.activatableList(a).find(row=>row.card===source&&row.gyAbility);assert.ok(action,entry.raw.name+': graveyard activation available');
   assert.equal(await game.activateAbility(a,action),true,entry.raw.name+': graveyard activation');
   assert.ok(game.stack.some(row=>row.kind==='ability'&&(row.srcCard===source||row.ctx?.src===source)),entry.raw.name+': graveyard ability uses Stack');
   if(op.cost!=='{0}')assert.ok(Object.values(a.pool).reduce((x,y)=>x+y,0)<beforeMana,entry.raw.name+': mana cost paid');
   await h.resolveAll(game);
   if(op.kind==='mechanic-grave-return-self')assert.equal(source.zone,'hand');
   else if(op.kind==='mechanic-unearth'){
     assert.equal(source.zone,'battlefield');assert.equal(source.kw('haste'),true);await game.emit('endStep',{player:a});await h.resolveAll(game);assert.equal(source.zone,'exile');
   }else{
     assert.equal(source.zone,'exile');const token=game.creatures(a).find(c=>c.isToken&&c.name===source.name);assert.ok(token,entry.raw.name+': token copy');
     assert.equal(token.hasSub('Zombie'),true);assert.deepEqual([...token.colors],op.kind==='mechanic-embalm'?['W']:['B']);assert.equal(token.def.cost,'');
     if(op.kind==='mechanic-eternalize'){assert.equal(token.def.power,'4');assert.equal(token.def.toughness,'4');}
   }return 4;
 }
 if(op.kind==='mechanic-foretell'){
   const action=game.activatableList(a).find(row=>row.card===source&&row.foretell);assert.ok(action,entry.raw.name+': foretell available');assert.equal(await game.activateAbility(a,action),true);
   assert.equal(source.zone,'exile');assert.equal(source.faceDown,true);assert.equal(game.castableList(a).some(row=>row.card===source),false);
   game.turnNo++;
   if(entry.implementation.some(o=>o.kind==='spell-counter'))await h.stageSpellV4Target(MTG,ctx,{name:entry.raw.name},{kind:'spell',zone:'stack',quantity:{min:1,max:1}},{kind:'counterSpell',targetIds:[]},'Instant',0);
   const option=game.castableList(a).find(row=>row.card===source&&row.alt?.foretell);assert.ok(option,entry.raw.name+': later foretell cast');assert.equal(option.alt.altCostStr,op.cost);
   assert.equal(await game.castSpell(a,source,{from:'exile',alt:option.alt,xVal:3}),true);await h.resolveAll(game);assert.equal(source.faceDown,false);assert.notEqual(source.zone,'exile');return 4;
 }
 if(op.kind==='mechanic-retrace'){
   const lands=a.hand.slice();const option=game.castableList(a).find(row=>row.card===source&&row.alt?.retrace);assert.ok(option,entry.raw.name+': retrace cast offered');
   assert.equal(await game.castSpell(a,source,{from:'graveyard',alt:option.alt,xVal:3}),true);assert.ok(lands.some(c=>c.zone==='graveyard'),entry.raw.name+': land discarded as cost');
   await h.resolveAll(game);assert.equal(source.zone,'graveyard');return 3;
 }
 if(op.kind==='mechanic-ninjutsu'){
   const attacker=h.permanent(MTG,game,a,h.fixtureDefinition('V5 unblocked attacker',['Creature'],{power:'2',toughness:'20'}));attacker.attacking=b;attacker.wasBlocked=false;
   game.combat={attackers:[attacker],defenders:new Map()};game.phase='combat';game.step='blockers';
   const action=game.activatableList(a).find(row=>row.card===source&&row.ninjutsu);assert.ok(action,entry.raw.name+': ninjutsu offered');assert.equal(await game.activateAbility(a,action),true);
   assert.equal(attacker.zone,'hand');await h.resolveAll(game);assert.equal(source.zone,'battlefield');assert.equal(source.tapped,true);assert.equal(source.attacking,b);return 4;
 }
 if(op.kind==='mechanic-soulshift'){
   const def=h.fixtureDefinition('V5 Spirit to return',['Creature'],{cost:'{0}',subtypes:['Spirit'],power:'1',toughness:'1'});const spirit=new MTG.CardInst(def,a);spirit.zone='graveyard';a.graveyard.push(spirit);
   await cast();await game.move(source,'graveyard');await h.resolveAll(game);assert.equal(spirit.zone,'hand',entry.raw.name+': Soulshift legal Spirit returns');return 2;
 }
 if(op.kind==='mechanic-modular'){
   await cast();const count=source.counters['+1/+1']||0;assert.ok(count>=op.n,entry.raw.name+': modular entry counters');
   const receiver=h.permanent(MTG,game,a,h.fixtureDefinition('V5 Modular recipient',['Artifact','Creature'],{power:'10',toughness:'20'}));
   await game.move(source,'graveyard');await h.resolveAll(game);assert.equal(receiver.counters['+1/+1'],count,entry.raw.name+': modular LKI counters');return 2;
 }
 await cast();
 if(op.kind==='mechanic-fabricate')assert.ok((source.counters['+1/+1']||0)>=op.n||game.creatures(a).filter(c=>c.isToken&&c.hasSub('Servo')).length>=op.n,entry.raw.name+': fabricate outcome');
 else if(op.kind==='mechanic-living-weapon'||op.kind==='mechanic-for-mirrodin'){
   const token=game.byIid(source.attachedTo);assert.ok(token?.isToken,entry.raw.name+': equipment attached to token');assert.equal(token.hasSub(op.kind==='mechanic-living-weapon'?'Germ':'Rebel'),true);
 }else if(op.kind==='mechanic-offspring'){
   assert.ok(game.creatures(a).some(c=>c!==source&&c.isToken&&c.name===source.name&&String(c.def.power)==='1'&&String(c.def.toughness)==='1'),entry.raw.name+': offspring 1/1 copy');
 }else if(op.kind==='mechanic-afflict'){
   const life=b.life;source.attacking=b;await game.emit('becomesBlocked',{attacker:source,blockers:[h.permanent(MTG,game,b,'Grizzly Bears')]});await h.resolveAll(game);assert.equal(b.life,life-op.n);
 }else if(op.kind==='mechanic-ingest'){
   const card=b.library.at(-1);await game.damagePlayer(source,b,1,{combat:true});await game.emit('combatDamageToPlayer',{card:source,player:b,n:1,step:'normal'});await h.resolveAll(game);assert.equal(card.zone,'exile');
 }else if(op.kind==='doesnt-untap'){
   source.tapped=true;const stop=Symbol('stop after real untap');const emit=game.emit;
   game.emit=async function(event,...args){if(event==='upkeep')throw stop;return emit.call(this,event,...args);};
   try{await game.runTurn();assert.fail('Expected upkeep boundary');}catch(error){if(error!==stop)throw error;}finally{game.emit=emit;}
   assert.equal(source.tapped,true,entry.raw.name+': normal untap prohibited');
 }else assert.fail('Missing mechanic driver '+op.kind);
 return 2;
}
