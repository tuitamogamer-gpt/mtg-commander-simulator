import assert from 'node:assert/strict';
const colors=['W','U','B','R','G'];
const fund=player=>{for(const color of [...colors,'C'])player.pool[color]=30;};
const total=player=>Object.values(player.pool).reduce((sum,n)=>sum+n,0);
// This fixture support precedes structural entry. A state trigger that has
// already triggered cannot be erased by adding a supporting permanent later.
export function stageStateSupport(M,game,player,definition,helpers){
 const rows=[];
 for(const op of definition.oracleStateOperations||[]){
  if(op.state.kind==='state-chosen-color-absence-v8'){
   for(const color of colors)rows.push(helpers.permanent(M,game,player,helpers.fixtureDefinition('State color witness '+color,['Artifact'],{cost:'{'+color+'}',colorsOverride:[color]})));
  }else if(op.state.kind==='count-comparison'&&op.state.max===0&&op.state.count.zone==='battlefield'){
   const filter=op.state.count.filters?.[0]||{what:op.state.count.what,zone:'battlefield',controller:'you'};
   rows.push(helpers.stageGenericTarget(M,{game,a:player,b:game.players.find(p=>p!==player)}, {...filter,controller:'you'},'state-support'));
  }
 }
 return rows;
}
export async function stateTriggerProof(M,entry,operation,role,h){
 const decisions=h.decision({chooseTargets:(_g,q)=>q.quickTarget?[q.quickTarget]:q.candidates.slice(0,q.max),chooseOption:(_g,q)=>q.options.find(row=>row.key==='yes')?.key||q.options[0]?.key});
 const f=h.gameFor(M,[decisions,decisions],{ai:role==='ai'}),{game,a,b}=f;
 h.assertControllerRole(M,f,entry.raw.name);h.fillLibrary(M,a,20);h.fillLibrary(M,b,20);
 const support=stageStateSupport(M,game,a,M.DEFS[entry.raw.name],h),state=operation.state;
 if(state.kind==='life')a.life=state.threshold+2;
 if(state.kind==='opponent-life')b.life=state.max+2;
 if(state.kind==='count-comparison'&&state.count.kind==='source-counters')for(let n=0;n<2;n++)h.permanent(M,game,b,'Grizzly Bears');
 const cast=async(player,name,targets=[])=>{const card=h.zoneCard(M,player,name,'hand');fund(player);const before=total(player);assert.equal(await game.castSpell(player,card,{from:'hand',quickTargets:targets}),true,entry.raw.name+': paid cast '+name);assert.ok(total(player)<before);return card;};
 const source=h.zoneCard(M,a,entry.raw.name,'hand');
 if(source.is('Land')){const before=a.landsPlayed;assert.equal(await game.playLand(a,source),true,entry.raw.name+': legal land play');assert.equal(a.landsPlayed,before+1);}
 else {fund(a);const before=total(a);assert.equal(await game.castSpell(a,source,{from:'hand'}),true,entry.raw.name+': paid source cast');assert.ok(total(a)<before);}
 await h.resolveAll(game);assert.equal(source.zone,'battlefield',entry.raw.name+': stable entry while its state condition is false');
 if(state.kind==='life'||state.kind==='opponent-life'){
  await cast(state.kind==='life'?b:a,'Shock',[state.kind==='life'?a:b]);await game.resolveTop();
 }else if(state.kind==='count-comparison'&&state.count.kind==='source-counters'){
  assert.ok(Number.isSafeInteger(state.min)&&state.min>0);fund(a);
  for(let n=0;n<state.min;n++){const action=game.activatableList(a).find(row=>row.card===source&&row.ability);assert.ok(action);const before=total(a);assert.equal(await game.activateAbility(a,action),true);assert.ok(total(a)<before);await game.resolveTop();assert.equal(source.counters[state.count.counter],n+1);}
 }else if(state.kind==='not'&&state.condition.kind==='source-quality'&&state.condition.filter.hasCounter){
  const kind=state.condition.filter.hasCounter,initial=source.counters[kind];assert.ok(Number.isSafeInteger(initial)&&initial>0);fund(a);
  for(let n=initial;n>0;n--){const action=game.activatableList(a).find(row=>row.card===source&&row.ability);assert.ok(action);const before=total(a);assert.equal(await game.activateAbility(a,action),true);assert.ok(total(a)<before);await game.resolveTop();assert.equal(source.counters[kind]||0,n-1);}
 }else{
  const witness=state.kind==='state-chosen-color-absence-v8'?support.find(card=>card.colors.includes(source.meta.oracleChosenColor)):support[0];assert.ok(witness);
  await cast(b,'Wipe Away',[witness]);await game.resolveTop();assert.equal(witness.zone,'hand');
 }
 assert.equal(source.zone,'battlefield',entry.raw.name+': state creates an answerable Stack object');assert.equal(game.stack.length,1);
 const trigger=game.stack[0];assert.equal(trigger.kind,'trigger');assert.equal(trigger.srcCard,source);assert.equal(trigger.ctrl,a);assert.ok(trigger.oracleStateTrigger);
 const targets=trigger.targets.flat().filter(Boolean);await h.resolveAll(game);
 if(/if this permanent is an enchantment, it becomes a 3\/[25] (?:Soldier|Jackal) creature\./.test(entry.raw.oracle)){
  const printed=/it becomes a (\d+)\/(\d+) (Soldier|Jackal) creature/.exec(entry.raw.oracle);assert.equal(source.zone,'battlefield');assert.equal(source.is('Enchantment'),false);assert.equal(source.is('Creature'),true);assert.equal(source.power,Number(printed[1]));assert.equal(source.toughness,Number(printed[2]));assert.equal(source.hasSub(printed[3]),true);
 }else{assert.equal(source.zone,'graveyard');if(/If you do, destroy up to two target creatures\./.test(entry.raw.oracle)){assert.ok(targets.length>0);for(const target of targets)assert.equal(target.zone,'graveyard');}}
 if(/create Marit Lage, a legendary 20\/20 black Avatar creature token with flying and indestructible\./.test(entry.raw.oracle)){const tokens=game.bf().filter(card=>card.ctrl===a&&card.isToken);assert.equal(tokens.length,1);const token=tokens[0];assert.equal(token.name,'Marit Lage');assert.equal(token.power,20);assert.equal(token.toughness,20);assert.deepEqual([...token.colors],['B']);assert.equal(token.hasSub('Avatar'),true);assert.equal(token.cur.super.includes('Legendary'),true);for(const key of ['flying','indestructible'])assert.equal(token.kw(key),true);}
 assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);
 return 1+targets.length;
}
