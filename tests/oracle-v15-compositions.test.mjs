import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v15-compositions.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9932,limit:absent.length,compilerVersion:15});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);}
M.initData(M.RAW_DATA);
function choose(player,handler){const prior=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>{const answer=handler(g,q);return answer===undefined?prior(g,q):answer;};}
async function announce(f,name,targets=[],options={}){const card=put(M,f.game,f.a,name,'hand');for(const color of ['W','U','B','R','G','C'])f.a.pool[color]=30;choose(f.a,(g,q)=>q.type==='chooseTargets'?targets.filter(target=>q.candidates.includes(target)).slice(0,q.max??q.count??1):undefined);assert.equal(await f.game.castSpell(f.a,card,{from:'hand',...options}),true);return card;}
test('v15 complete source clauses reject every unsupported suffix',()=>{for(const card of rows){assert.ok(semanticClass(card,{compilerVersion:15}).semanticClass,card.name);assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:15}).semanticClass,undefined,card.name);}});
for(const role of ['human','ai']){
 test(role+': manifest counters belong to the newly manifested object',async()=>{
  for(const [name,x,n]of [['Fierce Invocation',0,2],['Formless Nurturing',0,1],['Wildcall',3,3]]){const f=context(M,role),{game,a}=f,unrelated=put(M,game,a,'Craw Wurm'),top=a.library.at(-1);await announce(f,name,[],{xVal:x});await settle(game);assert.equal(top.zone,'battlefield');assert.equal(top.faceDown,true);assert.equal(top.plus1(),n);assert.equal(unrelated.plus1(),0);assertGameStateInvariants(game);}
 });
 test(role+': Harried Dronesmith gives haste and a delayed sacrifice only to its new token',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Harried Dronesmith'),other=put(M,game,a,'Ornithopter');await game.emit('beginCombat',{player:a});await settle(game);const made=game.creatures(a).filter(card=>card.isToken);assert.equal(made.length,1);assert.equal(made[0].kw('haste'),true);assert.equal(source.kw('haste'),false);assert.equal(other.kw('haste'),false);await game.emit('endStep',{player:a});await settle(game);assert.notEqual(made[0].zone,'battlefield');assert.equal(source.zone,'battlefield');assert.equal(other.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': Waiting in the Weeds counts each player’s untapped Forests',async()=>{
  const f=context(M,role,2),{game}=f;for(const [i,p]of game.players.entries()){for(let j=0;j<i+1;j++)put(M,game,p,'Forest');put(M,game,p,'Forest').tapped=true;put(M,game,p,'Island');}await announce(f,'Waiting in the Weeds');await settle(game);assert.deepEqual(Array.from(game.players,p=>game.creatures(p).filter(card=>card.isToken&&card.hasSub('Cat')).length),[1,2,3]);assertGameStateInvariants(game);
 });
 test(role+': Folio mills a different amount for each opponent’s hand',async()=>{
  const f=context(M,role,2),{game,a,others}=f,source=put(M,game,a,'Folio of Fancies');for(const [i,p]of others.entries())for(let j=0;j<i+2;j++)put(M,game,p,'Island','hand');a.pool.C=20;a.pool.U=3;const before=others.map(p=>p.library.length),action=game.activatableList(a).find(row=>row.card===source&&row.ability?.oracleOperation?.effects?.some(effect=>effect.action==='player-sequence-v9'));assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.deepEqual(others.map((p,i)=>before[i]-p.library.length),[2,3]);assertGameStateInvariants(game);
 });
 test(role+': Reaper’s Talisman observes only its equipped creature attacking alone',async()=>{
  for(const variant of ['alone','other','together']){const f=context(M,role),{game,a,b}=f,source=put(M,game,a,"Reaper's Talisman"),host=put(M,game,a,'Craw Wurm'),other=put(M,game,a,'Runeclaw Bear');assert.equal(await game.attach(source,host),true);const attackers=variant==='alone'?[host]:variant==='other'?[other]:[host,other];for(const card of attackers)card.attacking=b;const before=[a.life,b.life];await game.emit('attackersDeclared',{player:a,attackers});await settle(game);assert.deepEqual([a.life-before[0],before[1]-b.life],variant==='alone'?[2,2]:[0,0]);assertGameStateInvariants(game);}
 });
 test(role+': Jace’s emblem counters the first opposing spell and permits the second',async()=>{
  const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Jace, Unraveler of Secrets');source.counters.loyalty=9;game.recalc();const action=game.activatableList(a).find(row=>row.card===source&&row.ability?.oracleOperation?.loyalty===-8);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(a.emblems.length,1);game.turnPlayer=b;b.pool.C=10;for(let i=0;i<2;i++){const spell=put(M,game,b,'Ornithopter','hand');assert.equal(await game.castSpell(b,spell,{from:'hand'}),true);await settle(game);assert.equal(spell.zone,i===0?'graveyard':'battlefield');}assertGameStateInvariants(game);
 });
 test(role+': Ashenmoor Liege’s targeted trigger punishes the actual opposing caster',async()=>{
  const f=context(M,role,2),{game,a,others}=f,source=put(M,game,a,'Ashenmoor Liege'),caster=others[1],spell=put(M,game,caster,'Lightning Bolt','hand');caster.pool.R=1;choose(caster,(g,q)=>q.type==='chooseTargets'?[source]:undefined);const before=game.players.map(p=>p.life);assert.equal(await game.castSpell(caster,spell,{from:'hand'}),true);await settle(game);assert.deepEqual(Array.from(game.players,(p,i)=>before[i]-p.life),[0,0,4]);assertGameStateInvariants(game);
 });
 test(role+': Gift of the Viper places three different counters and untaps the same creature',async()=>{
  const f=context(M,role),{game,a}=f,host=put(M,game,a,'Craw Wurm'),other=put(M,game,a,'Runeclaw Bear');host.tapped=true;await announce(f,'Gift of the Viper',[host]);await settle(game);for(const kind of ['+1/+1','reach','deathtouch'])assert.equal(host.counters[kind],1);assert.equal(host.tapped,false);assert.equal(other.plus1(),0);assert.equal(host.kw('reach'),true);assert.equal(host.kw('deathtouch'),true);assertGameStateInvariants(game);
 });
 test(role+': Ghoulraiser chooses randomly only among Zombie cards',async()=>{
  const f=context(M,role),{game,a}=f,one=put(M,game,a,'Walking Corpse','graveyard'),two=put(M,game,a,'Walking Corpse','graveyard'),land=put(M,game,a,'Forest','graveyard'),creature=put(M,game,a,'Craw Wurm','graveyard');await announce(f,'Ghoulraiser');await settle(game);assert.equal([one,two].filter(card=>card.zone==='hand').length,1);assert.equal(land.zone,'graveyard');assert.equal(creature.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': Immortal Servitude returns exactly the creatures with the paid mana value',async()=>{
  const f=context(M,role),{game,a}=f,two=put(M,game,a,'Runeclaw Bear','graveyard'),six=put(M,game,a,'Craw Wurm','graveyard'),artifact=put(M,game,a,'Mind Stone','graveyard');await announce(f,'Immortal Servitude',[],{xVal:2});await settle(game);assert.equal(two.zone,'battlefield');assert.equal(six.zone,'graveyard');assert.equal(artifact.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': Flux lets every player select their own discard count before anyone draws',async()=>{
  const f=context(M,role,2),{game,a}=f,selected=[];for(const [i,p]of game.players.entries()){const cards=Array.from({length:3},()=>put(M,game,p,'Island','hand'));selected.push(cards.slice(0,i));choose(p,(g,q)=>q.prompt==='Discard cards, then draw that many'?cards.slice(0,i):undefined);}const events=[],draw=game.draw.bind(game),discard=game.discard.bind(game);game.draw=async(p,n,...rest)=>{events.push('draw:'+p.idx+':'+n);return draw(p,n,...rest);};game.discard=async(p,cards,...rest)=>{events.push('discard:'+p.idx);return discard(p,cards,...rest);};await announce(f,'Flux');await settle(game);assert.deepEqual(events.slice(0,3),['discard:0','discard:1','discard:2']);for(const [i,cards]of selected.entries())for(const card of cards)assert.equal(card.zone,'graveyard');assert.deepEqual(Array.from(game.players,p=>p.hand.length),[4,3,3]);assertGameStateInvariants(game);
 });
 test(role+': Donatello’s Science Lesson resolves both target groups independently',async()=>{
  const f=context(M,role,2),{game,a,b,others}=f,one=put(M,game,b,'Craw Wurm'),two=put(M,game,b,'Runeclaw Bear');await announce(f,"Donatello's Science Lesson",[one,two,a,others[1]]);await settle(game);assert.equal(one.tapped,true);assert.equal(two.tapped,true);assert.deepEqual(Array.from(game.players,p=>p.hand.length),[1,0,1]);assertGameStateInvariants(game);
 });
 test(role+': Plague Spores destroys both selected permanents without regeneration',async()=>{
  const f=context(M,role),{game,b}=f,host=put(M,game,b,'Craw Wurm'),land=put(M,game,b,'Forest'),other=put(M,game,b,'Runeclaw Bear');host.regenShield=1;await announce(f,'Plague Spores',[host,land]);await settle(game);assert.equal(host.zone,'graveyard');assert.equal(land.zone,'graveyard');assert.equal(other.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': Pack Mastiff pumps each matching creature its controller owns on the battlefield',async()=>{
  const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Pack Mastiff'),ally=put(M,game,a,'Pack Mastiff'),enemy=put(M,game,b,'Pack Mastiff'),other=put(M,game,a,'Runeclaw Bear');a.pool.R=1;a.pool.C=1;const action=game.activatableList(a).find(row=>row.card===source);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.deepEqual([source.power,ally.power,enemy.power,other.power],[3,3,2,2]);assertGameStateInvariants(game);
 });
 test(role+': Flame Sweep excludes only flying creatures controlled by the caster',async()=>{
  const f=context(M,role),{game,a,b}=f,protectedFlyer=put(M,game,a,'Suntail Hawk'),enemyFlyer=put(M,game,b,'Suntail Hawk'),ground=put(M,game,a,'Runeclaw Bear');await announce(f,'Flame Sweep');await settle(game);assert.equal(protectedFlyer.zone,'battlefield');assert.equal(enemyFlyer.zone,'graveyard');assert.equal(ground.zone,'graveyard');assertGameStateInvariants(game);
 });
}
