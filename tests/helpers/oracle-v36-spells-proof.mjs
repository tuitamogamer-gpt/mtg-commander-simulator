import strict from 'node:assert/strict';
import TEXT from '../../scripts/oracle-v36-spell-text.json' with {type:'json'};
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose,cards as chooseCards} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=Object.keys(TEXT);

export async function proveSpellV36(M,name,role,positive=true,h,assert=strict){
  const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
  for(const p of g.players){fund(p);while(p.library.length<40)put(M,p,'Forest');}
  g.reviewCombatWithHuman=async()=>{};g.spotlight=async()=>{};
  let picks=[],x=2,scried=0;
  choose(a,q=>{
    if(q.type==='chooseTargets'&&picks.length){const requested=[picks.shift()].flat();assert.ok(requested.every(c=>q.candidates.includes(c)),'requested target is legal');return {...q,candidates:requested,min:requested.length,max:requested.length};}
    if(q.type==='chooseX')return {...q,min:x,max:x};
    if(q.type==='scry')scried+=q.cards.length;
    return null;
  });
  const donor=(p=a,extra={})=>permanent(M,g,p,def('V36 witness',['Creature'],{power:'3',toughness:'20',...extra}));
  const cast=async(n=name,{player=a,targets=[],resolve=true,from='hand',alt,card,keepTurn=false}={})=>{
    if(player===a)picks=targets.slice();
    card ||=put(M,player,typeof n==='string'?n:n,from);const before=total(player),turn=g.turnPlayer;
    if(!keepTurn)g.turnPlayer=player;
    assert.equal(await g.castSpell(player,card,{from,...(alt?{alt}:{})}),true,n.name||n);
    assert.ok(total(player)<before,'paid actual mana');const so=g.stack.find(o=>o.card===card);if(resolve)await settle(g);g.turnPlayer=turn;
    return {card,so};
  };
  const harmless=(label='Witness spell',type='Instant',extra={})=>def(label,[type],{cost:'{1}',resolve:async()=>{},...extra});
  const cleanup=async()=>{g.mainPhase=async()=>{};g.combatPhase=async()=>{};await g.runTurn();await settle(g);};
  if(name==='High Tide'||name==='Bubbling Muck'){
    const basic=name==='High Tide'?'Island':'Swamp',color=name==='High Tide'?'U':'B';
    await cast();if(positive)await cast();
    const land=permanent(M,g,a,M.DEFS[basic]),other=permanent(M,g,b,M.DEFS[basic]),wrong=permanent(M,g,a,M.DEFS.Forest);
    for(const p of [a,b])for(const key of Object.keys(p.pool))p.pool[key]=0;
    const n=positive?3:2,cost=('{'+color+'}').repeat(n),spell=put(M,a,harmless('Paid using a single land','Instant',{cost}),'hand');
    assert.equal(g.canPayMana(a,M.parseCost(cost),{card:spell}),true);assert.equal(await g.castSpell(a,spell,{from:'hand'}),true);assert.equal(land.tapped,true);assert.equal(wrong.tapped,false);await settle(g);
    assert.equal(await g.activateManaSource(b,g.manaSources(b).find(row=>row.card===other),{[color]:1}),true);assert.equal(b.pool[color],n);assert.equal(g.stack.length,0);assert.equal(g.pendingTriggers.length,0);
    await cleanup();fund(a);const fresh=permanent(M,g,a,M.DEFS[basic]),before=a.pool[color];assert.equal(await g.activateManaSource(a,g.manaSources(a).find(row=>row.card===fresh),{[color]:1}),true);assert.equal(a.pool[color],before+1);
  }else if(name==='Cone of Flame'){
    const one=donor(b),two=donor(b),life=b.life;const {so}=await cast(name,{targets:[one,two,b],resolve:false});
    assert.equal(new Set(so.targets.flat()).size,3);if(!positive)await g.move(two,'exile');await settle(g);assert.equal(one.damage,1);assert.equal(two.damage,positive?2:0);assert.equal(b.life,life-3);
  }else if(name==='Dash Hopes'){
    for(const p of g.players)choose(p,q=>q.type==='chooseOption'&&q.prompt.startsWith('Dash Hopes:')?{...q,options:q.options.filter(o=>o.key===(positive?'yes':'no'))}:null);
    let resolved=0;const {so,card:target}=await cast(harmless('Counter witness','Instant',{resolve:async()=>{resolved++;}}),{player:b,resolve:false});
    const life=g.players.reduce((n,p)=>n+p.life,0);await cast(name,{targets:[so]});assert.equal(resolved,positive?1:0);assert.equal(target.zone,'graveyard');assert.equal(g.players.reduce((n,p)=>n+p.life,0),life-(positive?5:0));
  }else if(name==='Day of Black Sun'||name==='Spectacular Pileup'){
    const affected=donor(b,{cost:'{2}',kws:['indestructible']}),expensive=donor(b,{cost:'{4}',kws:['indestructible']}),vehicle=donor(b,{types:['Artifact'],subtypes:['Vehicle'],kws:['indestructible']}),land=permanent(M,g,b,M.DEFS.Forest);
    if(!positive){x=1;affected.def={...affected.def,cost:'{1}'};g.recalc();}
    await cast();assert.equal(affected.zone,'graveyard');assert.equal(expensive.zone,name==='Spectacular Pileup'?'graveyard':'battlefield');assert.equal(vehicle.zone,name==='Spectacular Pileup'?'graveyard':'battlefield');assert.equal(land.zone,'battlefield');
  }else if(name==='Double Major'){
    const original=put(M,a,def('Legendary copy witness',['Creature'],{super:['Legendary'],cost:'{2}'}),'hand');
    const {so}=await cast(original.def,{card:original,resolve:false});const {card:copySpell}=await cast(name,{targets:[so],resolve:false});
    await g.resolveTop();const copy=g.stack.find(o=>o.isCopy);assert.ok(copy);assert.equal(copy.oracleDefinition.super.includes('Legendary'),false);assert.equal(original.def.super.includes('Legendary'),true);
    if(!positive)await g.counterStackObject(so);await settle(g);assert.equal(g.bf().filter(c=>c.name==='Legendary copy witness').length,positive?2:1);assert.equal(g.bf().filter(c=>c.name==='Legendary copy witness'&&c.isToken).length,1);assert.equal(copySpell.zone,'graveyard');
  }else if(name==='Empty City Ruse'||name==='False Peace'){
    const victim=name==='False Peace'&&!positive?a:b;await cast(name,{targets:[victim]});assert.equal(g.oracleShouldSkipV10(victim,'combat'),false);assert.equal(g.oracleShouldSkipV10(victim===a?b:a,'combat'),false);
    g.turnPlayer=victim;let skipped=0;g.mainPhase=async()=>{};g.combatPhase=async p=>{for(let i=0;i<2;i++)if(g.oracleShouldSkipV10(p,'combat'))skipped++;};await g.runTurn();assert.equal(skipped,2);assert.equal(g.untilEffects.some(row=>row.kind==='oracleSkipCombatsV36'),false);assert.equal(g.oracleShouldSkipV10(victim,'combat'),false);
  }else if(name==='False Cure'){
    await cast();if(!positive)await cleanup();const life=b.life;await g.gainLife(b,3);await settle(g);assert.equal(b.life,life+(positive?-3:3));
    if(positive){const own=a.life;await g.gainLife(a,2);await settle(g);assert.equal(a.life,own-2);}
  }else if(name==='Fatal Fissure'){
    const victim=donor(b),land=permanent(M,g,a,M.DEFS.Forest);await cast(name,{targets:[victim]});
    if(!positive){await g.move(victim,'exile');await g.putPermanentOntoBattlefield(victim,b);}picks=[land];await g.destroy(victim);await settle(g);assert.equal(land.is('Creature'),positive);assert.equal(land.counters['+1/+1']||0,positive?4:0);
    if(positive){assert.equal(land.kw('haste'),true);await g.move(land,'exile');await settle(g);assert.equal(land.zone,'battlefield');assert.equal(land.tapped,true);assert.equal(land.is('Creature'),false);}
  }else if(name==='Fire and Brimstone'){
    const attacker=donor(b);attacker.attacking=a;b.turnState.attacked=true;const life=a.life,other=b.life;
    if(!positive)a.turnState.attacked=true;await cast(name,{targets:[positive?b:a]});assert.equal(a.life,life-(positive?4:8));assert.equal(b.life,other-(positive?4:0));
  }else if(name==='Flay'){
    const hand=[put(M,b,harmless('Discard A'),'hand'),put(M,b,harmless('Discard B'),'hand')];
    choose(b,q=>q.type==='chooseOption'&&q.prompt.startsWith('Flay:')?{...q,options:q.options.filter(o=>o.key===(positive?'yes':'no'))}:null);
    const before=total(b);await cast(name,{targets:[b]});assert.equal(hand.filter(c=>c.zone==='graveyard').length,positive?1:2);assert.equal(total(b),before-(positive?1:0));
  }else if(name==='Incriminate'){
    const first=donor(b),second=donor(b),wrong=donor(a);const {so}=await cast(name,{targets:[[first,second]],resolve:false});assert.equal(so.targetSpecs[0].oracleGroupFilterV22(g,[first,wrong]),false);
    if(!positive)await g.move(first,'exile');chooseCards(b,[second]);await settle(g);assert.equal(second.zone,'graveyard');assert.equal(first.zone,positive?'battlefield':'exile');assert.equal(wrong.zone,'battlefield');
  }else if(name==='Meddle'||name==='Rebound'){
    const first=name==='Rebound'||!positive?b:donor(b),second=name==='Rebound'?a:donor(a);let victim;
    const original=harmless('Retarget witness','Instant',{targets:[name==='Rebound'?M.T.player():M.T.any()],resolve:async ctx=>{victim=ctx.targets[0];}});
    const {so}=await cast(original,{targets:[first],resolve:false});
    await cast(name,{targets:[so,...(positive||name==='Rebound'?[second]:[])]});assert.equal(victim?.iid??victim?.idx,(positive||name==='Rebound'?second:b).iid??(positive||name==='Rebound'?second:b).idx);
  }else if(name==='Noxious Vapors'){
    const multi=put(M,b,harmless('Multicolored kept','Instant',{cost:'{W}{U}'}),'hand'),same=put(M,b,harmless('White discarded','Instant',{cost:'{W}'}),'hand'),none=put(M,b,harmless('Colorless discarded'),'hand'),land=put(M,b,'Forest','hand');chooseCards(b,[multi]);
    if(!positive){await g.move(same,'graveyard');}
    await cast();assert.equal(multi.zone,'hand');assert.equal(same.zone,'graveyard');assert.equal(none.zone,'graveyard');assert.equal(land.zone,'hand');
  }else if(name==='Panther Pounce'){
    const creature=donor(a);g.tap(creature);const power=creature.power;const {so}=await cast(name,{targets:[b,creature],resolve:false});if(!positive)await g.move(creature,'exile');await settle(g);
    assert.equal(g.bf().filter(c=>c.ctrl===b&&c.hasSub('Clue')).length,1);if(positive){assert.equal(creature.power,power+1);assert.equal(creature.kw('flying'),true);assert.equal(creature.tapped,false);}assert.ok(so);
  }else if(name==='Parallel Evolution'){
    const [token]=await g.makeTokens(def('Copied token',['Creature'],{power:'2',toughness:'3'}),a,{n:1});await g.makeTokens(def('Foreign token',['Creature']),b,{n:1});await g.makeTokens(def('Noncreature token',['Artifact']),a,{n:1});donor(a);g.addCounters(token,'+1/+1',3);
    if(!positive)await g.move(token,'exile');await cast();assert.equal(g.bf().filter(c=>c.isToken&&c.is('Creature')).length,positive?4:2);assert.equal(g.bf().filter(c=>c.name==='Noncreature token').length,1);
    if(positive){const copy=g.bf().find(c=>c.name==='Copied token'&&c!==token);assert.equal(copy.power,2);assert.equal(copy.counters['+1/+1']||0,0);}
  }else if(name==='Play with Fire'){
    const creature=donor(b),life=b.life;await cast(name,{targets:[positive?b:creature]});assert.equal(scried,positive?1:0);assert.equal(b.life,life-(positive?2:0));assert.equal(creature.damage,positive?0:2);
  }else if(name==='Quicken'||name==="Scout's Warning"){
    const type=name==='Quicken'?'Sorcery':'Creature',card=put(M,a,harmless('Flash witness',type),'hand');g.turnPlayer=b;assert.equal(g.canCastTiming(a,card),false);const hand=a.hand.length;
    await cast(name,{keepTurn:true});assert.equal(a.hand.length,hand+1);await cast(name,{keepTurn:true});assert.equal(g.canCastTiming(a,card),true);
    await cast(harmless('Unrelated instant'),{keepTurn:true});assert.equal(a.turnState.oracleFlashUntilTurn.length,2);
    if(!positive){g.turnNo++;assert.equal(g.canCastTiming(a,card),false);}else{await cast(card.def,{card,keepTurn:true});assert.equal(a.turnState.oracleFlashUntilTurn.length,0);const next=put(M,a,harmless('Another spell',type),'hand');assert.equal(g.canCastTiming(a,next),false);}
  }else if(name==='Scheming Symmetry'){
    const chosenA=put(M,a,harmless('Search A')),chosenB=put(M,b,harmless('Search B'));chooseCards(a,[chosenA]);chooseCards(b,[chosenB]);
    if(!positive)permanent(M,g,b,def('Library search restriction',['Enchantment'],{oraclePlayerRulesV10:[{rule:'no-search',players:'opponents'}]}));
    await cast(name,{targets:[[a,b]]});assert.equal(b.library.at(-1),chosenB);if(positive)assert.equal(a.library.at(-1),chosenA);else assert.equal(a.library.includes(chosenA),true);
  }else if(name==='Scrounge'||name==='Visions of Dread'){
    const card=put(M,b,def('Graveyard choice',[name==='Scrounge'?'Artifact':'Creature']),'graveyard'),wrong=put(M,b,harmless('Wrong graveyard type'),'graveyard');
    if(!positive)await g.move(card,'exile');await cast(name,{targets:[b]});assert.equal(card.zone,positive?'battlefield':'exile');if(positive)assert.equal(card.ctrl,a);assert.equal(wrong.zone,'graveyard');
  }else if(name==='Seismic Wave'){
    const creature=donor(b),artifact=donor(b,{types:['Artifact','Creature']}),own=donor(a);await cast(name,{targets:[positive?creature:artifact,b]});assert.equal(creature.damage,positive?3:1);assert.equal(artifact.damage,positive?0:2);assert.equal(own.damage,0);
  }else if(name==='Self-Destruct'){
    const creature=donor(a,{power:'5',kws:['lifelink']}),enemy=donor(b),life=a.life;await cast(name,{targets:[creature,enemy],resolve:false});if(!positive)await g.move(enemy,'exile');await settle(g);assert.equal(creature.damage,5);assert.equal(enemy.damage,positive?5:0);assert.equal(a.life,life+(positive?10:5));
  }else if(name==='Singularity Rupture'){
    const creature=donor(a),enemy=donor(b),before=b.library.length;await cast(name,{targets:[positive?[b]:[]]});assert.equal(creature.zone,'graveyard');assert.equal(enemy.zone,'graveyard');assert.equal(b.library.length,positive?Math.ceil(before/2):before);
  }else if(name==='Spiritualize'){
    const creature=donor(b),enemy=donor(a),hand=a.hand.length;await cast(name,{targets:[creature]});assert.equal(a.hand.length,hand+1);const life=a.life;
    if(!positive){await g.move(creature,'exile');await g.putPermanentOntoBattlefield(creature,b);}else{creature.ctrl=a;g.recalc();}
    await g.damageBatch([{src:creature,target:b,n:2},{src:creature,target:enemy,n:3}],{deferSBA:true});await settle(g);assert.equal(a.life,life+(positive?5:0));
  }else if(name==="Rivals' Duel"){
    const one=donor(a,{subtypes:['Bear'],power:'4'}),two=donor(b,{subtypes:['Human'],power:'2'}),same=donor(b,{subtypes:['Bear']});
    const {so}=await cast(name,{targets:[[one,two]],resolve:false});assert.equal(so.targetSpecs[0].oracleGroupFilterV22(g,[one,same]),false);
    if(!positive)await g.move(two,'exile');await settle(g);assert.equal(one.damage,positive?2:0);assert.equal(two.damage,positive?4:0);
  }else if(name==='Second Guess'){
    const first=await cast(harmless('First spell'),{player:b,resolve:false}),second=await cast(harmless('Second spell'),{resolve:false});
    await cast(harmless('Third spell'),{player:b,resolve:false});const own=put(M,a,name,'hand'),spec=g.spellTargetSpecs(own,{},a)[0];assert.equal(g.legalTargets(spec,own,a).includes(first.so),false);assert.equal(g.legalTargets(spec,own,a).includes(second.so),true);
    if(!positive){const copy=await g.copySpell(second.so,a,{mayNewTargets:false});assert.equal(g.legalTargets(spec,own,a).includes(copy),false);}
    await cast(name,{card:own,targets:[second.so]});assert.equal(second.card.zone,'graveyard');
  }else throw Error('Missing v36 spell proof '+name);
  assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV36(M,entry,op,role,h){
  if(!names.includes(entry.raw.name)||!['spell-generic','generic-trigger'].includes(op.kind))return null;
  let count=0;const assert=Object.fromEntries(['ok','equal','deepEqual'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));
  for(const positive of [true,false])await proveSpellV36(M,entry.raw.name,role,positive,h,assert);return count;
}
