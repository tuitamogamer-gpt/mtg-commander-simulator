import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v20-rules.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(row=>!M.DEFS[row.name]);
if(absent.length){M.registerOracleBatch(createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9937,limit:absent.length,compilerVersion:20}).report);M.initData(M.RAW_DATA);}
const fund=player=>{for(const color of ['W','U','B','R','G','C'])player.pool[color]=40;};
async function cast(game,player,name,targets=[]){fund(player);const card=put(M,game,player,name,'hand'),decide=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>q.type==='chooseTargets'&&targets.length?targets.filter(t=>q.candidates.includes(t)):decide(g,q);try{assert.equal(await game.castSpell(player,card,{from:'hand',quickTargets:targets}),true,name+': legal paid cast');}finally{player.controller.decide=decide;}return card;}
for(const role of ['human','ai']){
 test(role+': One Ring grants protection only for its actual cast entry',async()=>{
  const {game,a,b}=context(M,role),enemy=put(M,game,b,'Grizzly Bears'),ring=await cast(game,a,'The One Ring');await settle(game);assert.equal(game.isProtectedFrom(a,enemy),true);
  await game.move(ring,'hand');game.untilEffects=[];await game.move(ring,'battlefield',{ctrl:a});await settle(game);assert.equal(game.isProtectedFrom(a,enemy),false);assertGameStateInvariants(game);
 });
 test(role+': Stasis Coffin protection outlives its source and expires at its controller next turn',async()=>{
  const {game,a,b}=context(M,role),coffin=put(M,game,a,'The Stasis Coffin'),enemy=put(M,game,b,'Grizzly Bears');fund(a);const action=game.activatableList(a).find(row=>row.card===coffin&&row.ability);assert.ok(action);
  assert.equal(await game.activateAbility(a,action),true);assert.equal(coffin.zone,'exile');await settle(game);assert.equal(game.isProtectedFrom(a,enemy),true);
  game.turnPlayer=b;await game.runBeginningPhase(b);await settle(game);assert.equal(game.isProtectedFrom(a,enemy),true);game.turnPlayer=a;await game.runBeginningPhase(a);await settle(game);assert.equal(game.isProtectedFrom(a,enemy),false);assertGameStateInvariants(game);
 });
 test(role+': Venser Diffusion targets a genuinely suspended card and stops matching at zero time counters',async()=>{
  const {game,a,b}=context(M,role),card=put(M,game,b,'Grizzly Bears','hand');card.def={...card.def,suspend:{n:3,cost:'{1}'}};game.turnPlayer=b;fund(b);const action=game.activatableList(b).find(row=>row.card===card&&row.suspend);assert.ok(action);assert.equal(await game.activateAbility(b,action),true);assert.equal(card.zone,'exile');assert.equal(card.counters.time,3);
  const spec=M.OracleV20.helpers.genericTargetSpec({what:'card',zone:'exile',suspendedV20:true,controller:'any',min:1},[],0),spell=put(M,game,a,"Venser's Diffusion",'hand');assert.ok(game.legalTargets(spec,spell,a).includes(card));card.counters.time=0;assert.equal(game.legalTargets(spec,spell,a).includes(card),false);card.counters.time=3;
  game.turnPlayer=a;game.phase='main1';await cast(game,a,"Venser's Diffusion",[card]);await settle(game);assert.equal(card.zone,'hand');assertGameStateInvariants(game);
 });
 test(role+': Vines of Vastwood changes target legality at resolution and expires at cleanup',async()=>{
  const {game,a,b}=context(M,role),host=put(M,game,a,'Grizzly Bears');fund(b);
  const shock=await cast(game,b,'Shock',[host]);await cast(game,a,'Vines of Vastwood',[host]);await game.resolveTop();
  assert.equal(game.stack.length,1);await game.resolveTop();assert.equal(shock.zone,'graveyard');assert.equal(host.damage,0);
  game.untilEffects=game.untilEffects.filter(effect=>effect.expires!=='eot');game.recalc();await cast(game,b,'Shock',[host]);await settle(game);assert.equal(host.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': Fiendslayer Paladin denies the printed spell colors and permits activated abilities',async()=>{
  const {game,a,b}=context(M,role),host=put(M,game,a,'Fiendslayer Paladin');fund(b);const shock=put(M,game,b,'Shock','hand');
  const decide=b.controller.decide.bind(b.controller);b.controller.decide=(g,q)=>{if(q.type==='chooseTargets'){assert.equal(q.candidates.includes(host),false);return [];}return decide(g,q);};assert.equal(await game.castSpell(b,shock,{from:'hand',quickTargets:[host]}),false);assert.equal(shock.zone,'hand');b.controller.decide=decide;
  let resolved=false;const source=put(M,game,b,'Grizzly Bears');source.def={...source.def,abilities:[{cost:{mana:'{1}'},targets:[{what:'creature',zone:'battlefield',min:1,count:1,filter:(_g,c)=>c.iid===host.iid}],run:async()=>{resolved=true;}}]};game.recalc();
  assert.equal(await game.activateAbility(b,{card:source,ability:source.def.abilities[0]}),true);await settle(game);assert.equal(resolved,true);
  M.OracleV8AbilityLoss.add(game,[host],{});b.controller.decide=(g,q)=>q.type==='chooseTargets'?[host]:decide(g,q);assert.equal(await game.castSpell(b,shock,{from:'hand',quickTargets:[host]}),true);await settle(game);assert.equal(host.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': life locks reject payments and preserve full damage events until ability loss',async()=>{
  const {game,a,b}=context(M,role),emperor=put(M,game,a,'Platinum Emperion'),enemy=put(M,game,b,'Grizzly Bears'),life=a.life;
  assert.equal(game.canPayLife(a,1),false);assert.equal(game.canPayLife(a,0),true);assert.equal(await game.damageAny(enemy,a,5),5);assert.equal(a.life,life);
  assert.equal(await game.gainLife(a,3,enemy),0);M.OracleV8AbilityLoss.add(game,[emperor],{});assert.equal(game.canPayLife(a,1),true);assert.equal(await game.loseLife(a,3,'effect'),3);assert.equal(a.life,life-3);assertGameStateInvariants(game);
 });
 test(role+': Worship checks the live creature condition and does not replace nondamage loss',async()=>{
  const {game,a,b}=context(M,role);put(M,game,a,'Worship');const host=put(M,game,a,'Grizzly Bears'),enemy=put(M,game,b,'Grizzly Bears');a.life=3;
  assert.equal(await game.damageAny(enemy,a,5,{cantBePrevented:true}),5);assert.equal(a.life,1);assert.equal(await game.loseLife(a,1,'effect'),1);assert.equal(a.life,0);
  a.life=3;await game.move(host,'exile');assert.equal(await game.damageAny(enemy,a,2),2);assert.equal(a.life,1);assertGameStateInvariants(game);
 });
 test(role+': Bloodletter applies each replacement once and respects turn and controller',async()=>{
  const {game,a,b}=context(M,role);put(M,game,a,'Bloodletter of Aclazotz');const second=put(M,game,a,'Bloodletter of Aclazotz');
  assert.equal(await game.loseLife(b,2,'effect'),8);assert.equal(await game.loseLife(a,2,'effect'),2);game.turnPlayer=b;assert.equal(await game.loseLife(b,2,'effect'),2);
  game.turnPlayer=a;M.OracleV8AbilityLoss.add(game,[second],{});assert.equal(await game.loseLife(b,2,'effect'),4);assertGameStateInvariants(game);
 });
}
test('v20 rule grammar keeps incomplete conditions and unsupported target qualifiers closed',()=>{
 for(const oracle_text of ["Your life total can't change while it is raining.","This creature can't be the target of spells with an unknown quality.","If the moon is full, damage that would reduce your life total to less than 1 reduces it to 1 instead."]){
  const result=semanticClass({name:'Closed rules witness',layout:'normal',mana_cost:'{2}',type_line:'Enchantment',oracle_text},{compilerVersion:20});assert.equal(result.semanticClass,undefined);
 }
});
test('spell-zone compositions require a complete spell body and an explicit nonbattlefield trigger zone',()=>{
 const base={name:'Zone trigger witness',layout:'normal',mana_cost:'{U}',type_line:'Instant',oracle_text:'Draw a card.\nWhen you discard this card, draw a card.'};
 const result=semanticClass(base,{compilerVersion:20});assert.ok(result.semanticClass);assert.ok(result.implementation.some(op=>op.kind==='generic-trigger'&&op.event==='discarded'&&op.zone==='event-source-v20'));assert.ok(result.implementation.length>1);
 assert.equal(!!semanticClass({...base,oracle_text:'Draw a card and invent an unknown reward.\nWhen you discard this card, draw a card.'},{compilerVersion:20}).semanticClass,false);
 assert.equal(!!semanticClass({...base,oracle_text:'Draw a card.\nWhen this enchantment enters, draw a card.'},{compilerVersion:20}).semanticClass,false);
});
