import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import {semanticClass}from'../scripts/import-oracle-batch.mjs';
import {loadEngine}from'./helpers/load-engine.mjs';
import {context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
const M=loadEngine(),inputs=JSON.parse(readFileSync(new URL('./fixtures/oracle-casting-limits.json',import.meta.url)));
const cards=inputs.map((c,i)=>{const semantic=semanticClass(c,{compilerVersion:8});assert.ok(semantic.semanticClass,c.name+': '+semantic.reason);const [type,subtypes='']=c.type_line.split(' — '),words=type.split(' ');return{position:i+1,oracleId:c.oracle_id,scryfallId:c.id,...semantic,raw:{name:c.name,cost:c.mana_cost,oracle:c.oracle_text,types:words.filter(word=>word!=='Legendary'),super:words.includes('Legendary')?['Legendary']:[],subtypes:subtypes.split(' ').filter(Boolean),power:c.power,toughness:c.toughness,loyalty:c.loyalty,_ci:c.color_identity},catalog:{typeLine:c.type_line,commanderLegality:'legal'}};});
const missing=cards.filter(c=>!M.DEFS[c.raw.name]);if(missing.length){M.registerOracleBatch({id:'oracle-casting-limits-test',sequence:9998,cards:missing});M.initData(M.RAW_DATA);}
const fund=p=>{for(const c of ['W','U','B','R','G','C'])p.pool[c]=30;};
async function inWindow(game,...args){const prior=game.priorityRound;game.priorityRound=async()=>{};try{return await game.castSpell(...args);}finally{game.priorityRound=prior;}}
const pool=p=>Object.values(p.pool).reduce((a,b)=>a+b,0);
async function cast(f,name,player=f.a,opts={}){const c=put(M,f.game,player,name,'hand');fund(player);const before=pool(player);assert.equal(await f.game.castSpell(player,c,{from:'hand',...opts}),true,name+': actual source cast');assert.ok(pool(player)<before);await settle(f.game);return c;}
function declare(p,card,target){const prior=p.controller.decide.bind(p.controller);p.controller.decide=async(g,q)=>q.type==='attackers'?[{card,target}]:q.type==='blockers'?[]:prior(g,q);}
async function nextUpkeep(game,a){const emit=game.emit,stop=new Error('next upkeep');game.turnPlayer=a;game.emit=async function(event,data){if(event==='upkeep')throw stop;return emit.call(this,event,data);};try{await assert.rejects(game.runTurn(),error=>error===stop);}finally{game.emit=emit;}}

test('nineteen complete pinned casting cards compile; unsupported limits and windows fail closed',()=>{
 assert.equal(cards.length,19);const base=inputs.find(c=>c.name==='Rule of Law');
 for(const oracle_text of ["Each player can't cast more than two spells each turn.","Your opponents can't cast more than one noncreature spell each turn.","Cast this spell only if you've cast another purple spell this turn.","Cast this spell only during combat after first strike damage."])assert.equal(semanticClass({...base,oracle_text},{compilerVersion:8}).semanticClass,undefined);
 assert.throws(()=>M.OracleV8CastingLimits.apply({}, {kind:'spell-limit-v8',players:'all',max:2,contract:'spell-limit-v8'}));
});
for(const role of ['human','ai']){
 test(`${role}: empty combat still grants declare-attackers priority and a paid Teleport`,async()=>{
  const f=context(M,role),{game,a,b}=f,target=put(M,game,b,'Shivan Dragon'),spell=put(M,game,a,'Teleport','hand');fund(a);let attacks=0;const emit=game.emit;game.emit=async function(event,data){if(event==='attacks')attacks++;return emit.call(this,event,data);};const steps=[];
  game.priorityRound=async()=>{steps.push(game.step);if(game.step==='attackers'){assert.ok(game.castableList(a).some(row=>row.card===spell));assert.equal(await inWindow(game,a,spell,{from:'hand',quickTargets:[target]}),true);await settle(game);assert.equal(target.cur.unblockable,true);}};
  assert.equal(game.canCastTiming(a,spell),false);await game.combatPhase(a);assert.deepEqual(steps,['begin','attackers','endCombat']);assert.equal(attacks,0);assert.equal(spell.zone,'graveyard');
 });
 test(`${role}: choosing zero attackers preserves the attackers window but skips blockers and damage`,async()=>{
  const {game,a}=context(M,role),attacker=put(M,game,a,'Grizzly Bears');attacker.tapped=false;const prior=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.type==='attackers'?[]:prior(g,q);const steps=[];game.priorityRound=async()=>steps.push(game.step);await game.combatPhase(a);assert.deepEqual(steps,['begin','attackers','endCombat']);assert.equal(attacker.tapped,false);
 });
 test(`${role}: paid Endless Foot Assault triggers only after an actual attack, not an empty declaration`,async()=>{
  const f=context(M,role),{game,a,b}=f;await cast(f,'Endless Foot Assault');
  const sources=game.bf().filter(card=>card.name==='Endless Foot Assault').length;
  let declared=0;const emit=game.emit;game.emit=async function(event,data){if(event==='attackersDeclared')declared++;return emit.call(this,event,data);};
  const steps=[];game.priorityRound=async()=>{steps.push(game.step);await settle(game);};
  await game.combatPhase(a);assert.deepEqual(steps,['begin','attackers','endCombat']);assert.equal(declared,0);
  assert.equal(game.bf().filter(card=>card.isToken&&card.hasSub('Ninja')).length,0,'an empty combat cannot trigger whenever you attack');
  const attacker=put(M,game,a,'Grizzly Bears');declare(a,attacker,b);
  await game.combatPhase(a);assert.equal(declared,1);
  assert.equal(game.bf().filter(card=>card.isToken&&card.hasSub('Ninja')).length,sources,'each paid source sees the real attack exactly once');
 });
 test(`${role}: attacked-player history survives removal, excludes a planeswalker and another defender`,async()=>{
  for(const destination of ['player','walker','other']){const f=context(M,role,2),{game,a,b}=f,attacker=put(M,game,b,'Shivan Dragon'),host=put(M,game,a,'Grizzly Bears'),spell=put(M,game,a,'Defiant Stand','hand');fund(a);const target=destination==='player'?a:destination==='other'?f.others[1]:put(M,game,a,'Tezzeret, Betrayer of Flesh');declare(b,attacker,target);game.turnPlayer=b;let checked=false;
   game.priorityRound=async()=>{if(game.step!=='attackers')return;checked=true;await game.move(attacker,'hand');const before=pool(a);assert.equal(game.canCastTiming(a,spell),destination==='player');assert.equal(await inWindow(game,a,spell,{from:'hand',quickTargets:[host]}),destination==='player');if(destination==='player'){await settle(game);assert.equal(host.power,3);assert.equal(host.toughness,5);}else assert.equal(pool(a),before);};
   await game.combatPhase(b);assert.equal(checked,true);
  }
 });
 test(`${role}: an entering-attacking creature does not count as attacking its defender but still enables blockers`,async()=>{
  const f=context(M,role),{game,a,b}=f,spell=put(M,game,b,'Defiant Stand','hand');fund(b);const steps=[];game.priorityRound=async()=>{steps.push(game.step);if(game.step==='attackers'){const token=put(M,game,a,'Grizzly Bears','hand');await game.move(token,'battlefield',{attacking:b,ctrl:a});assert.equal(game.canCastTiming(b,spell),false);await game.move(token,'graveyard');}};await game.combatPhase(a);assert.ok(steps.includes('blockers'),'an attacker entered even though it subsequently left');
 });
 test(`${role}: after-blockers timing includes zero declared blockers and end of combat, but excludes a skipped step`,async()=>{
  for(const attack of [false,true]){const f=context(M,role),{game,a,b}=f,spell=put(M,game,a,'Chaotic Strike','hand'),target=put(M,game,b,'Shivan Dragon');fund(a);if(attack){const creature=put(M,game,a,'Grizzly Bears');declare(a,creature,b);}let casted=false;const seen=[];game.priorityRound=async()=>{seen.push(game.step);assert.equal(game.canCastTiming(a,spell),attack&&['blockers','firstStrike','damage','endCombat'].includes(game.step));if(attack&&game.step==='endCombat'){assert.equal(await inWindow(game,a,spell,{from:'hand',quickTargets:[target]}),true);await settle(game);casted=true;}};await game.combatPhase(a);assert.equal(casted,attack);assert.equal(seen.includes('blockers'),attack);}
 });
 test(`${role}: Blood Frenzy deadline excludes first strike and later combats, including an empty first combat`,async()=>{
  for(const empty of [false,true]){const f=context(M,role),{game,a,b}=f,spell=put(M,game,a,'Blood Frenzy','hand');fund(a);const attacker=empty?null:put(M,game,a,'Shivan Dragon');if(attacker){attacker.def={...attacker.def,kws:[...attacker.def.kws,'first strike']};game.recalc();declare(a,attacker,b);}const observed=[];game.priorityRound=async()=>{observed.push([game.step,game.canCastTiming(a,spell)]);if(game.step==='firstStrike'){const before=pool(a);assert.equal(await inWindow(game,a,spell,{from:'hand',alt:{free:true},quickTargets:[attacker]}),false);assert.equal(pool(a),before);}};await game.combatPhase(a);assert.ok(observed.find(([step,can])=>step==='attackers'&&can));assert.equal(observed.find(([step])=>step==='endCombat')[1],false);if(attacker)assert.equal(observed.find(([step])=>step==='firstStrike')[1],false);game.priorityRound=async()=>assert.equal(game.canCastTiming(a,spell),false);if(attacker)attacker.tapped=false;await game.combatPhase(a);}
 });
 test(`${role}: Rule of Law counts earlier casts and rejects normal/free second spells without spending`,async()=>{
  const f=context(M,role),{game,a,b}=f,source=await cast(f,'Rule of Law'),own=put(M,game,a,'Lightning Bolt','hand');fund(a);assert.equal(a.turnState.spellsCast,1);assert.equal(game.canCastTiming(a,own),false);const first=put(M,game,b,'Lightning Bolt','hand');fund(b);assert.equal(await inWindow(game,b,first,{from:'hand',quickTargets:[a]}),true);const so=game.stack.find(x=>x.card===first);await game.counterStackObject(so);const second=put(M,game,b,'Lightning Bolt','hand'),before=pool(b);for(const opts of [{},{free:true}])assert.equal(await inWindow(game,b,second,{from:'hand',...opts}),false);assert.equal(pool(b),before);assert.equal(second.zone,'hand');assert.equal(game.castableList(b).some(row=>row.card===second),false);await game.move(source,'graveyard');assert.equal(await inWindow(game,b,second,{from:'hand',quickTargets:[a]}),true);await settle(game);
 });
 test(`${role}: spell copies on Stack are permitted while casting a new copy obeys the limit`,async()=>{
  const f=context(M,role),{game,a,b}=f;await cast(f,'Rule of Law');const first=put(M,game,b,'Lightning Bolt','hand');fund(b);assert.equal(await inWindow(game,b,first,{from:'hand',quickTargets:[a]}),true);const count=b.turnState.spellsCast,so=game.stack.find(x=>x.card===first);await game.copySpell(so,b,{chooseNewTargets:false});assert.equal(b.turnState.spellsCast,count);assert.equal(game.stack.filter(row=>row.kind==='spell').length,2);const copy=put(M,game,b,'Lightning Bolt','exile');assert.equal(await inWindow(game,b,copy,{from:'copy',free:true}),false);await settle(game);
 });
 test(`${role}: own-player limits follow live control and new turns; land play and High Noon ability remain available`,async()=>{
  const f=context(M,role),{game,a,b}=f,source=await cast(f,'Moderation'),bolt=put(M,game,a,'Lightning Bolt','hand');fund(a);assert.equal(game.canCastTiming(a,bolt),false);source.ctrl=b;game.recalc();assert.equal(game.canCastTiming(a,bolt),true);source.ctrl=a;game.recalc();await nextUpkeep(game,a);game.phase='main1';assert.equal(game.canCastTiming(a,bolt),true);const land=put(M,game,a,'Forest','hand');assert.equal(await game.playLand(a,land),true);assert.equal(a.turnState.spellsCast,0);
  const f2=context(M,role),noon=await cast(f2,'High Noon'),follow=put(M,f2.game,f2.a,'Lightning Bolt','hand');fund(f2.a);assert.equal(f2.game.canCastTiming(f2.a,follow),false);const ability=f2.game.activatableList(f2.a).find(row=>row.card===noon&&row.ability);assert.ok(ability);assert.equal(await f2.game.activateAbility(f2.a,ability),true);assert.equal(noon.zone,'graveyard');assert.equal(f2.game.canCastTiming(f2.a,follow),true);await settle(f2.game);
 });
 test(`${role}: color casting history uses the spell's cast colors after it changes zones and colors`,async()=>{
  const f=context(M,role),{game,a}=f,talara=put(M,game,a,"Talara's Battalion",'hand');fund(a);assert.equal(game.canCastTiming(a,talara),false);const green=await cast(f,'Grizzly Bears');assert.equal(a.turnState.spellsCastList[0].colors.includes('G'),true);green.def={...green.def,colorsOverride:['R']};game.recalc();await game.move(green,'hand');assert.equal(green.colors.includes('G'),false);assert.equal(game.canCastTiming(a,talara),true);assert.equal(await inWindow(game,a,talara,{from:'hand'}),true);await settle(game);assert.equal(talara.zone,'battlefield');await nextUpkeep(game,a);game.phase='main1';const another=put(M,game,a,"Talara's Battalion",'hand');assert.equal(game.canCastTiming(a,another),false);
 });
 test(`${role}: paid Lignify suppresses Eidolon's limit and removing the Aura restores it immediately`,async()=>{
  const f=context(M,role),{game,a,b}=f,source=await cast(f,'Eidolon of Rhetoric'),spell=put(M,game,a,'Lightning Bolt','hand');
  game.turnPlayer=b;game.phase='main1';const aura=await cast(f,'Lignify',b,{quickTargets:[source]});
  assert.equal(source.cur.abilitiesDisabled,true);assert.equal(game.canCastTiming(a,spell),true);
  await game.move(aura,'hand');assert.equal(source.cur.abilitiesDisabled,false);assert.equal(game.canCastTiming(a,spell),false);
 });
 test(`${role}: a limit entering during target proposal rejects a stale cast before mana is paid`,async()=>{
  const f=context(M,role),{game,a,b}=f;await cast(f,'Opt');const spell=put(M,game,a,'Lightning Bolt','hand'),limit=put(M,game,b,'Rule of Law','hand');fund(a);
  const prior=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>{if(q.type==='chooseTargets'){await game.move(limit,'battlefield');return [b];}return prior(g,q);};
  assert.equal(game.canCastTiming(a,spell),true);const before=pool(a);assert.equal(await inWindow(game,a,spell,{from:'hand'}),false);assert.equal(pool(a),before);assert.equal(spell.zone,'hand');assert.equal(a.turnState.spellsCast,1);
 });
}
