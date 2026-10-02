import assert from 'node:assert/strict';
const total=p=>Object.values(p.pool).reduce((n,x)=>n+x,0);
const hasNames=entry=>entry.implementation.some(op=>op.kind==='permanent-name-entry-v22'||op.effects?.some(e=>e.action==='permanent-choose-name-v22'));
const containsName=op=>/permanent-chosen-name-v22|permanentNamedTriggerV22/.test(JSON.stringify(op));
function forceName(player,name){
 const prior=player.controller.decide.bind(player.controller);
 player.controller.decide=async(g,q)=>{
  if(q.type==='chooseOption'&&q.searchableChoices){const options=q.options.filter(row=>row.key===name);assert.equal(options.length,1,'the intended Oracle name is offered');return prior(g,{...q,options});}
  return prior(g,q);
 };
}
function scene(M,entry,role,h){const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'});h.assertControllerRole(M,ctx,entry.raw.name);h.fillLibrary(M,ctx.a,40);h.fillLibrary(M,ctx.b,40);h.fund(ctx.a,100);h.fund(ctx.b,100);return ctx;}
function witness(M,ctx,h,name,player=ctx.b,zone='battlefield',land=false){const def=h.fixtureDefinition(name,land?['Land']:['Creature'],{cost:land?null:'{4}{G}',power:'2',toughness:'20',abilities:[{label:'Name witness ability',cost:{mana:'{1}'},run:async c=>c.g.gainLife(c.you,1,c.src)}],mana:[{produce:[{C:1}],cost:{tap:true}}]});return zone==='battlefield'?h.permanent(M,ctx.game,player,def):h.zoneCard(M,player,def,zone);}
async function enter(M,entry,ctx,h){
 const {game,a,b}=ctx,entryOp=entry.implementation.find(row=>row.kind==='permanent-name-entry-v22'),land=entry.raw.types.includes('Land'),name=land?'Bojuka Bog':entryOp?.quality==='noncreature-nonland'?'Opt':'Grizzly Bears';
 forceName(a,name);forceName(b,name);witness(M,ctx,h,name,b,'hand',land);
 const source=h.zoneCard(M,a,entry.raw.name,'hand'),prior=a.controller.decide.bind(a.controller);
 a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?prior(g,{...q,candidates:[b]}):prior(g,q);
 const before=total(a);assert.equal(await (land?game.playLand(a,source):game.castSpell(a,source,{from:'hand'})),true,entry.raw.name+': actual paid entry');
 if(!land&&M.parseCost(source.def.cost).generic+M.parseCost(source.def.cost).pips.length)assert.ok(total(a)<before,'entry consumes actual mana');
 await h.resolveAll(game);assert.equal(source.zone,'battlefield');assert.ok(M.OracleV22Permanents.selected(source).includes(name),'chosen name is tied to the current source incarnation');
 return {source,name,entryOp};
}
export function stagePermanentEffectV22(M,ctx,effect,h){
 if(effect.action!=='permanent-choose-name-v22')return false;
 forceName(ctx.a,effect.quality==='land'?'Bojuka Bog':'Grizzly Bears');ctx.permanentNameProofV22=effect.quality==='land'?'Bojuka Bog':'Grizzly Bears';return true;
}
export async function assertPermanentEffectV22(M,ctx,entry,effect,source,targets,damaged,before,trace,label,h){
 if(effect.action!=='permanent-choose-name-v22')return false;
 if(effect.temporarySpellTax!==undefined){const row=ctx.game.untilEffects.find(row=>row.kind==='oracleNamedSpellTaxV22'&&row.names.includes(ctx.permanentNameProofV22));assert.ok(row,label+': named reduction exists');assert.equal(row.n,effect.temporarySpellTax);assert.equal(row.expires,'eot');}
 else assert.ok(M.OracleV22Permanents.selected(source).includes(ctx.permanentNameProofV22),label+': source stores the resolution name');return true;
}
export async function operationProofV22(M,entry,op,role,h){
 if(op.kind==='permanent-grantor-operation-v22'){
  let checks=0;for(const branch of ['resolve','detach-before-activation','blink-before-resolution']){
   const ctx=scene(M,entry,role,h),{game,a,b}=ctx,host=h.permanent(M,game,a,h.fixtureDefinition('V22 grantor host',['Creature'],{power:'3',toughness:'20'})),victim=h.permanent(M,game,b,h.fixtureDefinition('V22 grantor victim',['Creature'],{power:'2',toughness:'20'})),source=h.zoneCard(M,a,entry.raw.name,'hand');
   assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(await game.attach(source,host),true);const ability=game.activatableList(a).find(row=>row.card===host&&row.ability?.oracleGrantorV22?.card===source);assert.ok(ability);
   if(branch==='detach-before-activation'){M.C1516.detach(game,source);const tapped=host.tapped;assert.equal(await game.activateAbility(a,ability,op.operation.targets.length?[victim]:[]),false);assert.equal(host.tapped,tapped);checks+=4;continue;}
   const target=entry.raw.name==='Surestrike Trident'?b:victim,life=b.life,power=host.power;assert.equal(await game.activateAbility(a,ability,op.operation.targets.length?[target]:[]),true);assert.equal(source.attachedTo,null,'the exact granting Equipment is unattached as a cost');assert.equal(host.tapped,!!op.operation.cost.tap);assert.equal(game.stack.some(row=>row.kind==='ability'&&row.srcCard===host),true);
   if(branch==='blink-before-resolution'){await game.move(source,'exile');await game.putPermanentOntoBattlefield(source,a);}
   await h.resolveAll(game);
   if(entry.raw.name==='Heartseeker')assert.equal(victim.zone,'graveyard');if(entry.raw.name==='Leonin Bola')assert.equal(victim.tapped,true);if(entry.raw.name==='Surestrike Trident')assert.equal(b.life,life-power);if(entry.raw.name==='Razor Boomerang'){assert.equal(victim.damage,1);assert.equal(source.zone,branch==='resolve'?'hand':'battlefield','a returned grantor cannot follow a new incarnation');}
   if(entry.raw.name==='Blinding Powder'){assert.equal(await game.damageAny(victim,host,3,{combat:true}),0);assert.equal(await game.damageAny(victim,host,3,{combat:false}),3);}checks+=8;
  }return checks;
 }
 if(op.kind==='permanent-propagated-static-v22'){
  const ctx=scene(M,entry,role,h),{game,a,b}=ctx,host=h.permanent(M,game,b,h.fixtureDefinition('V22 nested host',['Creature'],{power:'3',toughness:'20'})),equipment=h.permanent(M,game,b,h.fixtureDefinition('V22 nested equipment',['Artifact'],{subtypes:['Equipment']})),source=h.zoneCard(M,a,entry.raw.name,'hand'),prior=a.controller.decide.bind(a.controller);
  assert.equal(await game.attach(equipment,host),true);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(equipment)?prior(g,{...q,candidates:[equipment]}):prior(g,q);
  const hand=a.hand.length;assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(source.attachedTo,equipment.iid);assert.equal(a.hand.length,hand,'Aura ETB draw compensates the paid card');
  assert.equal(host.power,3+(op.operation.power||0));assert.equal(host.toughness,20+(op.operation.toughness||0));for(const kw of op.operation.keywords)assert.equal(host.kw(kw),true);
  await game.move(equipment,'hand');assert.equal(host.power,3);for(const kw of op.operation.keywords)assert.equal(host.kw(kw),false);return 8;
 }
 const shared=op.effects?.find(effect=>effect.action==='permanent-shared-host-v22');
 if(shared){
  let checks=0;for(const branch of ['live','host-departs','host-reincarnates']){
   const ctx=scene(M,entry,role,h),{game,a,b}=ctx,definition=(name,type)=>h.fixtureDefinition(name,['Creature'],{subtypes:[type],power:'3',toughness:'20'}),host=h.permanent(M,game,a,definition('V22 Crown host','Bear')),same=h.permanent(M,game,b,definition('V22 Crown shared','Bear')),other=h.permanent(M,game,b,definition('V22 Crown distinct','Elf')),source=h.zoneCard(M,a,entry.raw.name,'hand'),prior=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(host)?prior(g,{...q,candidates:[host]}):prior(g,q);
   assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);const ability=game.activatableList(a).find(row=>row.card===source&&row.ability);assert.ok(ability);assert.equal(await game.activateAbility(a,ability,[]),true);assert.equal(source.zone,'graveyard','sacrifice occurs before the effect uses the stack');
   if(branch!=='live')await game.move(host,'exile');if(branch==='host-reincarnates')await game.putPermanentOntoBattlefield(host,a);await h.resolveAll(game);
   const dp=shared.effects.reduce((n,e)=>n+(e.power||0),0),dt=shared.effects.reduce((n,e)=>n+(e.toughness||0),0),keywords=shared.effects.flatMap(e=>e.keywords||[]);assert.equal(same.power,3+dp);assert.equal(same.toughness,20+dt);assert.equal(other.power,3);for(const kw of keywords){assert.equal(same.kw(kw),true);assert.equal(other.kw(kw),false);}if(branch==='live'){assert.equal(host.power,3+dp);for(const kw of keywords)assert.equal(host.kw(kw),true);}checks+=8;
  }return checks;
 }
 if(!hasNames(entry))return null;
 if(op.kind==='generic-trigger'&&op.effects?.some(effect=>effect.action==='permanent-choose-name-v22'))return h.genericRuntimeOperationProof(M,entry,op,role);
 if(!['permanent-name-entry-v22','permanent-name-rule-v22'].includes(op.kind)&&!containsName(op))return null;
 const ctx=scene(M,entry,role,h),{game,a,b}=ctx,{source,name}=await enter(M,entry,ctx,h);let checks=3;
 const live=()=>assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false,'local AI completes without fallback');
 if(op.kind==='permanent-name-entry-v22'){
  assert.ok(M.OracleV22Permanents.choices(op.quality).includes(name));
  if(op.quality==='nonland')assert.equal(M.OracleV22Permanents.choices(op.quality).includes('Forest'),false);
  if(op.quality==='noncreature-nonland')assert.equal(M.OracleV22Permanents.choices(op.quality).includes('Grizzly Bears'),false);
  if(op.quality==='not-basic-land')assert.equal(M.OracleV22Permanents.choices(op.quality).includes('Forest'),false);
  assert.ok(M.OracleV22Permanents.choices('any').includes('Black Lotus'),'format legality does not restrict Oracle names');
  await game.move(source,'exile');assert.equal(M.OracleV22Permanents.selected(source).length,0,'a departed incarnation no longer provides a name');live();return checks+4;
 }
 if(op.kind==='permanent-name-rule-v22'){
  if(['spell-ban','spell-land-ban'].includes(op.mode)){
   for(const p of [a,b]){game.turnPlayer=p;const spell=witness(M,ctx,h,name,p,'hand'),blocked=op.who==='all'||op.who==='opponents'&&p!==a;assert.equal(game.canCastTiming(p,spell,{from:'hand'}),!blocked);if(blocked){const before=total(p);assert.equal(await game.castSpell(p,spell,{from:'hand'}),false);assert.equal(total(p),before);assert.equal(spell.zone,'hand');}checks+=3;}
   if(op.mode==='spell-land-ban'){game.turnPlayer=b;const land=witness(M,ctx,h,name,b,'hand',true);assert.equal(await game.playLand(b,land),false);checks++;}
   const donor=witness(M,ctx,h,name==='Opt'?'Grizzly Bears':'Opt',b,'hand');assert.equal(game.canCastTiming(b,donor,{from:'hand'}),true);await game.move(source,'exile');assert.equal(game.canCastTiming(b,witness(M,ctx,h,name,b,'hand'),{from:'hand'}),true);checks+=2;
  }else if(op.mode==='spell-tax'){
   for(const p of [a,b]){game.turnPlayer=p;const card=witness(M,ctx,h,name,p,'hand'),affected=op.who==='all'||op.who==='you'&&p===a||op.who==='opponents'&&p===b||op.who==='enchanted-player'&&p===b,delta=affected?op.n:0;assert.equal(game.spellCost(p,card,{from:'hand'}).generic,Math.max(0,4+delta));const before=total(p),legal=game.canCastTiming(p,card,{from:'hand'});assert.equal(await game.castSpell(p,card,{from:'hand'}),legal);assert.equal(before-total(p),legal?Math.max(0,4+delta)+1:0,'real spell payment includes the printed named adjustment when casting is permitted');await h.resolveAll(game);checks+=3;}
   await game.move(source,'exile');const card=witness(M,ctx,h,name,b,'hand');assert.equal(game.spellCost(b,card,{from:'hand'}).generic,4);checks++;
  }else if(['ability-ban','ability-tax'].includes(op.mode)){
   const donor=witness(M,ctx,h,name,b),other=witness(M,ctx,h,'Opt',b),entry=game.activatableList(b).find(row=>row.card===donor&&row.ability?.label==='Name witness ability'),ability=donor.def.abilities[0],isBan=op.mode==='ability-ban';
   assert.equal(!!entry,!isBan);assert.ok(game.activatableList(b).some(row=>row.card===other));checks+=2;
   const mana=game.manaSources(b).find(row=>row.card===donor);assert.equal(!!mana,!isBan||op.exceptMana);checks++;
   if(isBan){assert.equal(await game.activateAbility(b,{card:donor,ability},[]),false);if(!op.exceptMana)assert.equal(await game.activateManaSource(b,{card:donor,m:donor.def.mana[0],produce:[{C:1}]},{C:1}),false);checks+=2;}
   else{assert.equal(game.abilityManaCost(b,donor,'{1}',{ability}).generic,1+op.n);assert.equal(game.abilityManaCost(b,donor,'{1}',{isMana:true}).generic,1+(op.exceptMana?0:op.n));const before=total(b),life=b.life;assert.equal(await game.activateAbility(b,entry,[]),true);assert.equal(before-total(b),1+op.n);await h.resolveAll(game);assert.equal(b.life,life+1);checks+=5;}
   await game.move(source,'exile');assert.ok(game.activatableList(b).some(row=>row.card===donor&&row.ability?.label==='Name witness ability'));assert.equal(game.abilityManaCost(b,donor,'{1}',{ability}).generic,1);checks+=2;
  }else if(op.mode==='player-protection'){
   const donor=witness(M,ctx,h,name,b),other=witness(M,ctx,h,'Opt',b),life=a.life;assert.equal(game.isProtectedFrom(a,donor),true);assert.equal(game.isProtectedFrom(b,donor),false);assert.equal(await game.damageAny(donor,a,3),0);assert.equal(a.life,life);assert.equal(await game.damageAny(other,a,3),3);await game.move(source,'exile');assert.equal(game.isProtectedFrom(a,donor),false);checks+=6;
  }else throw Error('Missing named permanent proof '+op.mode);
 }else if(op.kind==='damage-rule-v20'){
  const donor=witness(M,ctx,h,name,b),host=witness(M,ctx,h,'Opt',a);assert.equal(await game.damageAny(donor,a,3),0);assert.equal(await game.damageAny(donor,host,3),0);assert.equal(await game.damageAny(donor,b,3),3);assert.equal(await game.damageAny(witness(M,ctx,h,'Opt',b),a,3),3);await game.move(source,'exile');assert.equal(await game.damageAny(donor,a,3),3);checks+=5;
 }else if(op.kind==='generic-ability'){
  game.turnPlayer=b;const card=witness(M,ctx,h,name,b,'hand');assert.equal(await game.castSpell(b,card,{from:'hand'}),true);const so=game.stack.find(row=>row.card===card),ability=game.activatableList(a).find(row=>row.card===source);assert.ok(ability);const before=total(a);assert.equal(await game.activateAbility(a,ability,[so]),true);assert.equal(before-total(a),1);await game.move(source,'exile');await h.resolveAll(game);assert.equal(card.zone,'graveyard','chosen-name target retains its announcement binding after the source leaves');checks+=5;
 }else if(op.kind==='generic-trigger'){
  game.turnPlayer=b;const wrong=witness(M,ctx,h,'Opt',b,'hand');assert.equal(await game.castSpell(b,wrong,{from:'hand'}),true);await game.flushTriggers();assert.equal(game.stack.some(row=>row.srcCard===source&&row.kind==='trigger'),false,'a different spell name does not trigger');await h.resolveAll(game);
  const card=witness(M,ctx,h,name,b,'hand'),life=b.life,hand=a.hand.length;assert.equal(await game.castSpell(b,card,{from:'hand'}),true);await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===source&&row.kind==='trigger'));await h.resolveAll(game);
  if(op.effects.some(effect=>effect.action==='lose-life'))assert.equal(b.life,life-3);assert.equal(a.hand.length,hand+1);checks+=6;
 }else if(op.kind==='generic-static'){
  const donor=witness(M,ctx,h,name,b,'battlefield',true);assert.ok(game.manaSources(b).some(row=>row.card===donor&&row.produce?.some(pool=>pool.C===1)));await game.move(source,'exile');checks+=2;
 }else return null;
 live();return checks;
}
