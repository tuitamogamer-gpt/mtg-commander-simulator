import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
const M=loadEngine();
const specs=[
 ['Frog','Enchant creature\nEnchanted creature loses all abilities and is a blue Frog creature with base power and toughness 1/1.','Enchantment — Aura'],
 ['Darksteel','Enchant creature\nEnchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types.','Enchantment — Aura'],
 ['Global','Creatures lose all abilities.','Enchantment'],
 ['Temporary','Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1.','Instant'],
 ['Persistent','Target creature loses all abilities.','Sorcery'],
 ['Ability','Enchant creature\nEnchanted creature has "{1}: You gain 2 life."','Enchantment — Aura'],
 ['Mana','Enchant creature\nEnchanted creature has "{T}: Add {G}."','Enchantment — Aura'],
 ['Trigger','Enchant creature\nEnchanted creature has "When this creature dies, you gain 2 life."','Enchantment — Aura'],
 ['Haste','Enchant creature\nEnchanted creature has haste.','Enchantment — Aura'],
].map(([label,oracle_text,type_line],i)=>{const card={name:'Ability Loss Proof '+label,layout:'normal',mana_cost:'{1}',oracle_text,type_line},semantic=semanticClass(card,{compilerVersion:8});assert.ok(semantic.semanticClass,label+': '+semantic.reason);return {position:i+1,oracleId:'loss-proof-'+i,scryfallId:'loss-print-'+i,...semantic,raw:{name:card.name,cost:card.mana_cost,oracle:oracle_text,types:type_line.split(' — ')[0].split(' '),subtypes:type_line.split(' — ')[1]?.split(' ')||[],super:[],_ci:[]},catalog:{typeLine:type_line,commanderLegality:'legal'}};});
M.registerOracleBatch({id:'oracle-ability-loss-fixtures',sequence:9982,cards:specs});M.initData(M.RAW_DATA);
function setup(role){const human={async decide(g,q){if(q.type==='chooseTargets')return q.candidates.slice(0,q.min??1);if(q.type==='chooseCards')return q.from.slice(0,q.min??1);if(q.type==='chooseOption')return q.options[0].key;return null;}};const game=new M.Game({seed:164,paced:false}),a=game.addPlayer('A',{name:'A'},human,role==='ai'),b=game.addPlayer('B',{name:'B'},human,false);if(role==='ai')a.controller=new M.AIController(a,{difficulty:'hard',style:'balanced'});game.turnNo=5;game.turnPlayer=a;game.phase='main1';game.step='main';game.priorityRound=async()=>{};game.spotlight=async()=>{};game.pace=async()=>{};return{game,a,b};}
const fixture=(name,extra={})=>({name,cost:'{1}',types:['Creature'],subtypes:['Elf'],super:[],power:'2',toughness:'8',kws:[],oracle:'',...extra});
function put(ctx,name,player=ctx.a,zone='battlefield'){const card=new M.CardInst(typeof name==='string'?M.DEFS[name]:name,player);card.ctrl=player;card.zone=zone;card.sick=false;if(zone==='battlefield'){ctx.game.battlefield.push(card);ctx.game.recalc();}else player[zone].push(card);return card;}
async function settle(game){for(let i=0;i<30&&(game.pendingTriggers.length||game.stack.length);i++){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.equal(game.pendingTriggers.length+game.stack.length,0);}

async function attach(ctx,label,host){const aura=put(ctx,'Ability Loss Proof '+label);await ctx.game.attach(aura,host);return aura;}
for(const role of ['human','ai']){
 test(role+': actual paid removal Aura suppresses printed mana, activation, ETB and anthem while later grants remain executable',async()=>{
  const ctx=setup(role),{game,a}=ctx;
  const host=put(ctx,fixture('Printed abilities',{kws:['flying','vigilance'],mana:{cost:{tap:true},produce:[{U:1}]},abilities:[{label:'Printed ability',cost:{mana:'{1}'},run:async c=>{c.you.life+=7;}}],statics:[{apply(g,src,bf){for(const card of bf)if(card!==src&&card.ctrl===src.ctrl)card.cur.power+=3;}}]}));
  const other=put(ctx,fixture('Anthem recipient',{kws:['shroud']}));assert.equal(other.power,5);a.pool.C=1;const stale=game.activatableList(a).find(x=>x.card===host&&!x.manaAbility);assert.ok(stale);
  const aura=put(ctx,'Ability Loss Proof Frog',a,'hand');a.pool.C=1;assert.equal(await game.castSpell(a,aura,{from:'hand',targets:[host]}),true);await settle(game);
  assert.equal(host.cur.basePower,1);assert.equal(host.cur.baseToughness,1);assert.equal(host.kw('flying'),false);assert.equal(host.hasSub('Elf'),false);assert.equal(host.hasSub('Frog'),true);assert.equal(other.power,2,'lost static ability no longer buffs other permanents');assert.equal(game.manaSources(a).some(row=>row.card===host),false);assert.equal(await game.activateAbility(a,stale),false);
  await attach(ctx,'Ability',host);a.pool.C=1;const action=game.activatableList(a).find(row=>row.card===host&&!row.manaAbility);assert.ok(action,'a later granted ability survives loss');const before=a.life;assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(a.life,before+2);
  await attach(ctx,'Mana',host);host.tapped=false;const mana=game.manaSources(a).find(row=>row.card===host);assert.ok(mana,'a later granted mana ability survives loss');assert.equal(await game.activateManaSource(a,mana,mana.produce[0]),true);assert.equal(a.pool.G,1);
  await game.move(aura,'exile');assert.equal(host.kw('flying'),true);assert.equal(other.power,5);
 });
 test(role+': resolving loss uses exact timestamps, keeps counters and modifiers, and grants after removal survive',async()=>{
  const ctx=setup(role),{game,a}=ctx,host=put(ctx,fixture('Temporal host',{types:['Artifact','Creature'],kws:['flying']}));
  const manaAura=await attach(ctx,'Mana',host);game.addCounters(host,'+1/+1',2);M.E.pumpUntilEOT(game,host,3,1,['trample']);
  const spell=put(ctx,'Ability Loss Proof Temporary',a,'hand');a.pool.C=1;assert.equal(await game.castSpell(a,spell,{from:'hand',targets:[host]}),true);await settle(game);
  assert.equal(host.power,6);assert.equal(host.toughness,4);assert.equal(host.is('Artifact'),true,'subtype-only transformation preserves artifact type');assert.equal(host.kw('flying'),false);assert.equal(host.kw('trample'),false);assert.equal(game.manaSources(a).some(row=>row.card===host),false);
  M.E.pumpUntilEOT(game,host,2,2,['trample']);assert.equal(host.power,8);assert.equal(host.kw('trample'),true);await game.move(manaAura,'hand');await game.move(manaAura,'battlefield',{attachTo:host});assert.equal(game.manaSources(a).some(row=>row.card===host),true);
  game.untilEffects=game.untilEffects.filter(effect=>effect.expires!=='eot');game.recalc();assert.equal(host.power,4);assert.equal(host.toughness,10);assert.equal(host.kw('flying'),true);assert.equal(host.hasSub('Elf'),true);
 });
 test(role+': keyword counter timestamp refreshes all counters of that kind and removing one does not restore older suppression',async()=>{
  const ctx=setup(role),{game}=ctx,host=put(ctx,fixture('Counter host'));game.addCounters(host,'flying',1);const loss=await attach(ctx,'Frog',host);assert.equal(host.kw('flying'),false);
  game.addCounters(host,'flying',1);assert.equal(host.kw('flying'),true);game.removeCounters(host,'flying',1);assert.equal(host.kw('flying'),true);game.removeCounters(host,'flying',1);assert.equal(host.kw('flying'),false);
  await game.move(loss,'hand');game.addCounters(host,'indestructible',1);await game.move(loss,'battlefield',{attachTo:host});assert.equal(host.kw('indestructible'),false);game.addCounters(host,'indestructible',1);assert.equal(host.kw('indestructible'),true);
 });
 test(role+': older global loss suppresses newly entered printed abilities but respects later granted token haste',async()=>{
  const ctx=setup(role),{game,a}=ctx;put(ctx,'Ability Loss Proof Global');let count=0;const def=fixture('New entrant',{kws:['flying'],triggers:[{on:'etb',filter:(g,s,e)=>s===e.card,run:async()=>{count++;}}]});const host=put(ctx,def,a,'hand');await game.putPermanentOntoBattlefield(host,a);await settle(game);assert.equal(count,0);assert.equal(host.kw('flying'),false);
  host.meta.oracleHaste=true;game.recalc();assert.equal(host.kw('haste'),true);const aura=await attach(ctx,'Frog',host);assert.equal(host.kw('haste'),false);await attach(ctx,'Haste',host);assert.equal(host.kw('haste'),true);await game.move(aura,'exile');assert.equal(host.kw('haste'),true);
 });
 test(role+': later death trigger survives suppression and uses last-known information after source leaves',async()=>{
  const ctx=setup(role),{game,a}=ctx,host=put(ctx,fixture('Dying host'));await attach(ctx,'Frog',host);await attach(ctx,'Trigger',host);const before=a.life;await game.move(host,'graveyard');await settle(game);assert.equal(a.life,before+2);
 });
 test(role+': legacy Lignify shares the loss pipeline with newer abilities and counter timestamps',async()=>{
  const ctx=setup(role),{game,a}=ctx,host=put(ctx,fixture('Legacy host',{kws:['flying']}));await attach(ctx,'Ability',host);await attach(ctx,'Mana',host);game.addCounters(host,'flying',1);const lignify=put(ctx,'Lignify');await game.attach(lignify,host);a.pool.C=1;assert.equal(game.activatableList(a).some(row=>row.card===host),false);assert.equal(game.manaSources(a).some(row=>row.card===host),false);assert.equal(host.kw('flying'),false);
  await attach(ctx,'Ability',host);await attach(ctx,'Mana',host);game.addCounters(host,'flying',1);assert.equal(game.activatableList(a).some(row=>row.card===host&&!row.manaAbility),true);assert.equal(game.manaSources(a).some(row=>row.card===host),true);assert.equal(host.kw('flying'),true);assert.equal(host.power,0);assert.equal(host.toughness,4);
 });
 test(role+': overlapping Auras preserve each effect and old incarnations cannot change returned permanents',async()=>{
  const ctx=setup(role),{game,a,b}=ctx,one=put(ctx,fixture('One')),two=put(ctx,fixture('Two'),b);await attach(ctx,'Darksteel',one);await attach(ctx,'Darksteel',two);assert.equal(one.kw('indestructible'),true);assert.equal(two.kw('indestructible'),true);assert.equal(one.power,0);assert.equal(two.power,0);
  const persistent=put(ctx,'Ability Loss Proof Persistent',a,'hand');a.pool.C=1;assert.equal(await game.castSpell(a,persistent,{from:'hand',targets:[one]}),true);await settle(game);assert.equal(one.kw('indestructible'),false);assert.equal(two.kw('indestructible'),true);const version=one.zoneVersion;await game.move(one,'exile');await game.move(one,'battlefield');assert.ok(one.zoneVersion>version);assert.equal(one.cur.abilitiesDisabled,false);assert.equal(one.power,2);
 });
}
test('continuous-effect timestamps are assigned at creation and survive normal array replacement without a Proxy',()=>{
 const {game}=setup('human');const first={kind:'fixture',expires:'object'},second={kind:'fixture',expires:'object'};game.untilEffects.push(first);const identity={kind:'cantAttackPlayerCard',iid:7,timestamp:123,notPlayer:0};game.untilEffects.push(identity);assert.equal(identity.timestamp,123);assert.ok(identity.oracleLayerTimestamp>first.oracleLayerTimestamp);game.untilEffects.pop();game.untilEffects=game.untilEffects.filter(()=>true);game.untilEffects.push(second);assert.ok(second.oracleLayerTimestamp>first.oracleLayerTimestamp);assert.equal(Array.isArray(game.untilEffects),true);assert.doesNotThrow(()=>structuredClone(game.untilEffects));assert.deepEqual(JSON.parse(JSON.stringify(game.untilEffects)).map(x=>x.oracleLayerTimestamp),[first.oracleLayerTimestamp,second.oracleLayerTimestamp]);
});
test('loss parser rejects extra qualifiers and unsupported linked duration without dropping clauses',()=>{
 for(const oracle_text of ['Target creature loses all abilities until your next turn.','Target creature loses all abilities and becomes your choice of a blue Frog or a red Dragon.','Target creature loses all abilities and gains flying and an unknown ability.'])assert.equal(semanticClass({name:'Rejected Loss',layout:'normal',type_line:'Instant',oracle_text,mana_cost:'{U}'},{compilerVersion:8}).semanticClass,undefined,oracle_text);
});
