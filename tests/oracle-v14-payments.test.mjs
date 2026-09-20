import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v14-payments.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9930,limit:absent.length,compilerVersion:14});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);}
M.initData(M.RAW_DATA);
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=20;};
function choose(player,handler){const old=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>{const answer=handler(g,q);return answer===undefined?old(g,q):answer;};}
async function cast(f,name,{paid=false,targets=[]}={}){const card=put(M,f.game,f.a,name,'hand');fund(f.a);choose(f.a,(g,q)=>q.type==='chooseTargets'?targets.filter(card=>q.candidates.includes(card)):undefined);assert.equal(await f.game.castSpell(f.a,card,{from:'hand',alt:paid?{oracleOptionalCostV14:true}:{}}),true);await settle(f.game);return card;}
test('optional costs require a complete printed payment and an exact supported quantity',()=>{
 for(const card of rows){assert.ok(semanticClass(card,{compilerVersion:14}).semanticClass,card.name);assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nPerform an unsupported action.'},{compilerVersion:14}).semanticClass,undefined);}
 const card=rows.find(card=>card.name==='Requiting Hex');assert.equal(semanticClass({...card,oracle_text:card.oracle_text.split('\n').slice(1).join('\n')},{compilerVersion:14}).semanticClass,undefined);
});
for(const role of ['human','ai']){
 test(role+': blight is paid before resolution and grants only the paid life bonus',async()=>{
  for(const paid of [false,true]){const f=context(M,role),{game,a,b}=f,donor=put(M,game,a,'Craw Wurm'),victim=put(M,game,b,'Runeclaw Bear'),life=a.life;await cast(f,'Requiting Hex',{paid,targets:[victim]});assert.equal(victim.zone,'graveyard');assert.equal(donor.counters['-1/-1']||0,paid?1:0);assert.equal(a.life,life+(paid?2:0));assert.equal(donor.tapped,false);assertGameStateInvariants(game);}
 });
 test(role+': blight may kill its recipient and the paid spell still resolves',async()=>{
  const f=context(M,role),{game,a,b}=f,donor=put(M,game,a,'Llanowar Elves'),victim=put(M,game,b,'Runeclaw Bear'),source=put(M,game,a,'Requiting Hex','hand');fund(a);choose(a,(g,q)=>q.type==='chooseTargets'?[victim]:undefined);const life=a.life;assert.equal(await game.castSpell(a,source,{from:'hand',alt:{oracleOptionalCostV14:true}}),true);assert.equal(donor.zone,'graveyard');assert.equal(victim.zone,'battlefield');await settle(game);assert.equal(victim.zone,'graveyard');assert.equal(a.life,life+2);assertGameStateInvariants(game);
 });
 test(role+': Cinder Strike replaces two damage with four after blight, rather than adding them',async()=>{
  for(const paid of [false,true]){const f=context(M,role),{game,a,b}=f;put(M,game,a,'Craw Wurm');const victim=put(M,game,b,'Craw Wurm');await cast(f,'Cinder Strike',{paid,targets:[victim]});assert.equal(victim.zone,paid?'graveyard':'battlefield');if(!paid)assert.equal(victim.damage,2);assertGameStateInvariants(game);}
 });
 test(role+': behold can reveal a Dragon from hand or choose a tapped Dragon on the battlefield',async()=>{
  for(const zone of ['hand','battlefield']){const f=context(M,role),{game,a,b}=f,dragon=put(M,game,a,'Shivan Dragon',zone),victim=put(M,game,b,'Craw Wurm');if(zone==='battlefield')dragon.tapped=true;victim.attacking=a;const version=dragon.zoneVersion,reveals=[],life=a.life;game.revealToHuman=async query=>{reveals.push(query);};await cast(f,'Osseous Exhale',{paid:true,targets:[victim]});assert.equal(a.life,life+2);assert.equal(dragon.zone,zone);assert.equal(dragon.zoneVersion,version);assert.equal(reveals.some(query=>query.cards?.includes(dragon)),zone==='hand');assertGameStateInvariants(game);}
 });
 test(role+': an ordinary creature cannot pay a Dragon behold cost',async()=>{
  const f=context(M,role),{game,a,b}=f;put(M,game,a,'Craw Wurm');const victim=put(M,game,b,'Craw Wurm');victim.attacking=a;const source=put(M,game,a,'Osseous Exhale','hand');fund(a);choose(a,(g,q)=>q.type==='chooseTargets'?[victim]:undefined);const before={...a.pool};assert.equal(await game.castSpell(a,source,{from:'hand',alt:{oracleOptionalCostV14:true}}),false);assert.equal(source.zone,'hand');assert.deepEqual({...a.pool},before);assertGameStateInvariants(game);
 });
 test(role+': collected evidence animates a noncreature artifact with the paid power and toughness',async()=>{
  for(const paid of [false,true]){const f=context(M,role),{game,a}=f,donor=put(M,game,a,'Craw Wurm','graveyard'),artifact=put(M,game,a,'Sol Ring');await cast(f,'Behind the Mask',{paid,targets:[artifact]});assert.equal(artifact.is('Artifact'),true);assert.equal(artifact.is('Creature'),true);assert.equal(artifact.power,paid?1:4);assert.equal(artifact.toughness,paid?1:3);assert.equal(donor.zone,paid?'exile':'graveyard');assertGameStateInvariants(game);}
 });
 test(role+': evidence counts graveyard mana value and cannot be paid with zero-value lands',async()=>{
  const f=context(M,role),{game,a}=f;for(let i=0;i<8;i++)put(M,game,a,'Forest','graveyard');const source=put(M,game,a,'Vitu-Ghazi Inspector','hand');fund(a);const before={...a.pool};assert.equal(game.castableList(a).some(row=>row.card===source&&row.alt?.oracleOptionalCostV14),false);assert.equal(await game.castSpell(a,source,{from:'hand',alt:{oracleOptionalCostV14:true}}),false);assert.deepEqual({...a.pool},before);assert.equal(a.graveyard.length,8);assertGameStateInvariants(game);
 });
 test(role+': stale evidence is rejected without consuming a different graveyard incarnation',async()=>{
  const f=context(M,role),{game,a}=f,donor=put(M,game,a,'Craw Wurm','graveyard'),source=put(M,game,a,'Vitu-Ghazi Inspector','hand');fund(a);const before={...a.pool};choose(a,(g,q)=>q.type==='chooseCards'&&q.aiHint?.evidenceV14?(async()=>{await game.move(donor,'hand');await game.move(donor,'graveyard');return [donor];})():undefined);assert.equal(await game.castSpell(a,source,{from:'hand',alt:{oracleOptionalCostV14:true}}),false);assert.equal(donor.zone,'graveyard');assert.equal(source.zone,'hand');assert.deepEqual({...a.pool},before);assertGameStateInvariants(game);
 });
 test(role+': Gutsplitter Gang loses life only when its resolution payment is declined',async()=>{
  for(const pay of [false,true]){const f=context(M,role),{game,a}=f,source=await cast(f,'Gutsplitter Gang'),donor=put(M,game,a,'Craw Wurm'),life=a.life;choose(a,(g,q)=>q.type==='chooseOption'&&q.options.some(option=>option.payment)?pay?'yes':'no':q.type==='chooseCards'&&q.prompt.endsWith(': choose cards to blight-v14')?[donor]:undefined);await game.emit('precombatMain',{player:a});await settle(game);assert.equal(a.life,life-(pay?0:3));assert.equal(donor.counters['-1/-1']||0,pay?2:0);assert.equal(source.zone,'battlefield');assertGameStateInvariants(game);}
 });
 test(role+': Warren Torchmaster chooses the reflexive target after paying blight',async()=>{
  const f=context(M,role),{game,a,b}=f,source=await cast(f,'Warren Torchmaster'),donor=put(M,game,a,'Craw Wurm'),victim=put(M,game,b,'Runeclaw Bear');let targetAfterPayment=false;
  choose(a,(g,q)=>{if(q.type==='chooseOption'&&q.prompt==='Pay the reflexive ability cost?')return 'yes';if(q.type==='chooseCards'&&q.prompt==='Choose cards for the reflexive ability cost')return [donor];if(q.type==='chooseTargets'){targetAfterPayment=donor.counters['-1/-1']===1;return [victim];}});
  await game.emit('beginCombat',{player:a});await game.flushTriggers();const first=game.stack.find(row=>row.srcCard===source);assert.ok(first);assert.equal(first.targets?.length||0,0);await settle(game);assert.equal(targetAfterPayment,true);assert.equal(victim.kw('haste'),true);assertGameStateInvariants(game);
 });
}
