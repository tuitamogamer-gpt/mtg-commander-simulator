import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {semanticClass,createImportPlan,runtimeBatch} from '../scripts/import-oracle-batch.mjs';
import {extractMainScript,readSource} from '../scripts/source-audit.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {ORACLE_CREATURE_TYPES} from '../scripts/oracle-creature-types.mjs';
import {ORACLE_SUBTYPES} from '../scripts/oracle-subtypes.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-token-forms-source.json',import.meta.url))),byName=new Map(rows.map(c=>[c.name,c]));
// Historical source rows must already contain their explicitly repaired
// semantics. Do not hide a stale production definition behind a test override.
let source=extractMainScript(readSource());const imported=new Set();
for(const file of fs.readdirSync(new URL('../reports/oracle-import/',import.meta.url)).filter(n=>/^batch-\d+\.json$/.test(n))){
 const report=JSON.parse(fs.readFileSync(new URL('../reports/oracle-import/'+file,import.meta.url))),old=JSON.stringify(runtimeBatch(report),null,2);let changed=false;
 for(const entry of report.cards||[]){const card=byName.get(entry.raw?.name);if(!card)continue;assert.equal(entry.raw.oracle,card.oracle_text);const parsed=semanticClass(card);assert.ok(parsed.semanticClass,card.name);for(const key of ['semanticClass','implementedKeywords','implementation','oracleContracts','rulesCore'])assert.deepEqual(entry[key]??(['implementation','oracleContracts'].includes(key)?[]:undefined),parsed[key]??(['implementation','oracleContracts'].includes(key)?[]:undefined),card.name+': live '+key);imported.add(card.name);}
 if(changed){assert.ok(source.includes(old),file+': exact original runtime module');source=source.replace(old,JSON.stringify(runtimeBatch(report),null,2));}
}
const box={console,setTimeout,clearTimeout,fetch:globalThis.fetch,URL,URLSearchParams,structuredClone};box.globalThis=box;vm.createContext(box);
new vm.Script(source).runInContext(box);new vm.Script(fs.readFileSync(new URL('../src/data.js',import.meta.url),'utf8')).runInContext(box);
const M=box.MTG,missing=rows.filter(c=>!imported.has(c.name));
if(missing.length){const {report}=createImportPlan({cards:missing,baseNames:new Set(),bulk:{type:'oracle_cards',updated_at:'2026-08-30T09:01:56.964+00:00'},limit:missing.length,sequence:9994,compilerVersion:8});assert.equal(report.cards.length,missing.length);M.registerOracleBatch(report);}M.initData(M.RAW_DATA);
const tokens=c=>c.game.bf().filter(card=>card.isToken);
async function cast(c,name,{player=c.a,x=0}={}){const card=put(M,c.game,player,name,'hand');for(const color of'WUBRGC')player.pool[color]=20;assert.equal(await c.game.castSpell(player,card,{from:'hand',xVal:x}),true,name+': paid cast');assert.ok(c.game.stack.some(row=>row.card===card));assert.ok(Object.values(player.pool).reduce((a,b)=>a+b,0)<120);await settle(c.game);return card;}
async function activate(c,card){for(const color of'WUBRGC')c.a.pool[color]=20;card.sick=false;const action=c.game.activatableList(c.a).find(x=>x.card===card);assert.ok(action,card.name+': printed ability available');assert.equal(await c.game.activateAbility(c.a,action),true);await settle(c.game);}
const end=async c=>{await c.game.emit('endStep',{player:c.a});await settle(c.game);};
function humanSelect(c,kind){const decide=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=(g,q)=>q.type===kind?(q.from||q.candidates).slice(0,1):decide(g,q);}
test('official creature types include token-only types, keep Time Lord whole, and exclude other subtype families',()=>{
 assert.deepEqual([...M.CREATURE_SUBTYPES].sort(),[...ORACLE_CREATURE_TYPES].sort());for(const type of ORACLE_CREATURE_TYPES)assert.ok(ORACLE_SUBTYPES.has(type),type);
 const c=context(M),changeling=put(M,c.game,c.a,'Universal Automaton');for(const type of ['Balloon','Camarid','Time Lord','Pentavite'])assert.equal(changeling.hasSub(type),true,type);
 for(const type of ['Forest','Aura','Equipment','Vehicle','Lord','creature','red,'])assert.equal(changeling.hasSub(type),false,type);
});
test('the eight token repairs retain explicit, source-specific before/after hashes and exact runtime parity',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../reports/oracle-import/repairs/token-forms-2026-09-05.json',import.meta.url))),hash=value=>createHash('sha256').update(value).digest('hex');assert.equal(manifest.repairs.length,8);
 for(const repair of manifest.repairs){assert.equal(hash(JSON.stringify(repair.before)),repair.beforeSha256);assert.equal(hash(JSON.stringify(repair.after)),repair.afterSha256);assert.notEqual(repair.beforeSha256,repair.afterSha256);assert.equal(repair.repairCompilerVersion,8);const card=byName.get(repair.name);assert.equal(card.oracle_id,repair.oracleId);assert.equal(hash(card.oracle_text),repair.sourceOracleSha256);}
 for(const file of manifest.files){assert.equal(hash(fs.readFileSync(new URL('../'+file.report,import.meta.url))),file.reportAfterSha256);assert.equal(hash(fs.readFileSync(new URL('../'+file.module,import.meta.url))),file.moduleAfterSha256);}
});
test('a token clause cannot swallow another instruction or an unsupported type adjective',()=>{
 for(const oracle of ['Create a 1/1 white Soldier creature token. Then dream a dream.','Create a 1/1 white Soldier creature token and an unknown celestial beast.'])assert.equal(semanticClass({name:'Boundary',oracle_text:oracle,type_line:'Instant',mana_cost:'{W}',layout:'normal'}).semanticClass,undefined);
});
for(const role of ['human','ai']){
 test(`${role}: paid Lazav retains its printed name, legendary status, hexproof and ability through successive real deaths`,async()=>{
  const c=context(M,role),lazav=await cast(c,'Lazav, Dimir Mastermind');
  for(const [name,power]of [['Colossal Dreadmaw',6],['Gigantosaurus',10]]){
   const victim=put(M,c.game,c.b,name);if(role==='human'){const decide=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(victim)?[victim]:decide(g,q);}
   await cast(c,'Murder');assert.equal(victim.zone,'graveyard');assert.equal(lazav.name,'Lazav, Dimir Mastermind');assert.equal(lazav.power,power);assert.equal(lazav.toughness,power);assert.ok(lazav.kw('hexproof'));assert.ok(lazav.def.super.includes('Legendary'));assert.ok(lazav.def.triggers.length);
  }
 });
 test(`${role}: historical Robot sources retain artifact type, exact size and tapped entry`,async()=>{
  for(const name of ['Gravpack Monoist','Melded Moxite',"Sami, Ship's Engineer"]){
   const c=context(M,role),card=await cast(c,name);
   if(name==='Gravpack Monoist'){const enemy={...c,a:c.b};await cast(enemy,'Murder');assert.equal(card.zone,'graveyard');}
   else if(name==='Melded Moxite'){await activate(c,card);assert.equal(card.zone,'graveyard');}
   else{const bear=put(M,c.game,c.a,'Grizzly Bears');c.game.tap(card);c.game.tap(bear);await end(c);}
   assert.equal(tokens(c).length,1,name);const token=tokens(c)[0];assert.ok(token.is('Artifact')&&token.is('Creature')&&token.hasSub('Robot'),name);assert.equal(token.tapped,true);assert.deepEqual([token.power,token.toughness],[2,2]);assert.deepEqual(Array.from(token.colors),[]);
  }
 });
 test(`${role}: paid Staff equips and creates a real Forest land through a legal combat attack`,async()=>{
  const c=context(M,role),bear=put(M,c.game,c.a,'Grizzly Bears'),staff=await cast(c,'Staff of Titania');await activate(c,staff);assert.equal(staff.attachedTo,bear.iid);assert.equal(bear.power,2);
  if(role==='human'){const decide=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=(g,q)=>q.type==='attackers'?[{card:bear,target:c.b}]:decide(g,q);}
  c.game.reviewCombatWithHuman=async()=>{};c.game.priorityRound=async()=>settle(c.game);await c.game.combatPhase(c.a);
  assert.equal(tokens(c).length,1);const token=tokens(c)[0];assert.ok(token.is('Land')&&token.is('Creature')&&token.hasSub('Forest')&&token.hasSub('Dryad'));assert.deepEqual([token.power,token.toughness],[1,1]);assert.equal(bear.power,3);assert.equal(c.b.life,37);assert.equal(token.sick,true);
 });
 test(`${role}: paid Mishra creates the named Warform with haste and its exact delayed sacrifice`,async()=>{
  const c=context(M,role);put(M,c.game,c.a,'Sol Ring');const mishra=await cast(c,'Mishra, Eminent One');await c.game.emit('beginCombat',{player:c.a});await settle(c.game);
  assert.equal(tokens(c).length,1);const token=tokens(c)[0];assert.equal(token.name,"Mishra's Warform");assert.ok(token.is('Artifact')&&token.is('Creature')&&token.hasSub('Construct')&&token.kw('haste'));assert.deepEqual([token.power,token.toughness],[4,4]);await end(c);assert.equal(token.zone,'ceased');assert.equal(mishra.zone,'battlefield');
 });
 test(`${role}: paid Specimen Collector creates two distinct token kinds in one entry event`,async()=>{
  const c=context(M,role),seen=[];const emit=c.game.emit.bind(c.game);c.game.emit=async(name,data)=>{if(name==='etb'&&data.card?.isToken)seen.push(tokens(c).map(x=>x.name));return emit(name,data);};
  await cast(c,'Specimen Collector');const made=tokens(c);assert.equal(made.length,2);const squirrel=made.find(x=>x.hasSub('Squirrel')),crab=made.find(x=>x.hasSub('Crab'));
  assert.ok(squirrel&&crab);assert.deepEqual([squirrel.power,squirrel.toughness],[1,1]);assert.deepEqual([crab.power,crab.toughness],[0,3]);assert.deepEqual(Array.from(squirrel.colors),['G']);assert.deepEqual(Array.from(crab.colors),['U']);assert.equal(seen.length,2);assert.ok(seen.every(names=>names.length===2));
 });
 test(`${role}: Godsire's paid source and tap ability create the exact three-color Beast`,async()=>{
  const c=context(M,role),card=await cast(c,'Godsire');await activate(c,card);assert.equal(card.tapped,true);const token=tokens(c)[0];assert.ok(token.hasSub('Beast'));assert.deepEqual([token.power,token.toughness],[8,8]);assert.deepEqual(Array.from(token.colors).sort(),['G','R','W']);
 });
 test(`${role}: paid Astral Dragon copies a noncreature permanent with additive creature types and flying`,async()=>{
  const c=context(M,role);put(M,c.game,c.a,'Sol Ring');await cast(c,'Astral Dragon');assert.equal(tokens(c).length,2);for(const card of tokens(c)){assert.equal(card.name,'Sol Ring');assert.ok(card.is('Artifact')&&card.is('Creature')&&card.hasSub('Dragon'));assert.deepEqual([card.power,card.toughness],[3,3]);assert.ok(card.kw('flying'));}
 });
 test(`${role}: paid Rebuild the City keeps the copied land and adds three 3/3 vigilant menace creatures`,async()=>{
  const c=context(M,role);put(M,c.game,c.a,'Forest');await cast(c,'Rebuild the City');assert.equal(tokens(c).length,3);for(const token of tokens(c)){assert.ok(token.is('Land')&&token.is('Creature'));assert.deepEqual([token.power,token.toughness],[3,3]);assert.ok(token.kw('vigilance')&&token.kw('menace'));}
 });
 test(`${role}: paid Dack's Duplicate retains haste and the printed dethrone mechanic as copiable abilities`,async()=>{
  const c=context(M,role);put(M,c.game,c.a,'Colossal Dreadmaw');if(role==='human')humanSelect(c,'chooseCards');const card=await cast(c,"Dack's Duplicate");assert.deepEqual([card.power,card.toughness],[6,6]);assert.ok(card.kw('haste')&&card.kw('trample'));assert.ok(card.def.triggers.some(t=>t.on==='attacks'));
 });
 test(`${role}: Jolly Balloon copy adds red to existing green, has correct size, and sacrifices only its token`,async()=>{
  const c=context(M,role),card=await cast(c,'The Jolly Balloon Man');put(M,c.game,c.a,'Grizzly Bears');await activate(c,card);const token=tokens(c)[0];assert.deepEqual([token.power,token.toughness],[1,1]);assert.ok(token.hasSub('Bear')&&token.hasSub('Balloon'));assert.deepEqual(Array.from(token.colors).sort(),['G','R']);assert.ok(token.kw('flying')&&token.kw('haste'));await end(c);assert.equal(token.zone,'ceased');assert.equal(card.zone,'battlefield');
 });
 test(`${role}: Applied Geometry creates its copied 0/0 then puts six counters on that same object before SBA`,async()=>{
  const c=context(M,role);put(M,c.game,c.a,'Sol Ring');await cast(c,'Applied Geometry');const token=tokens(c)[0];assert.ok(token);assert.equal(token.name,'Sol Ring');assert.equal(token.counters['+1/+1'],6);assert.deepEqual([token.power,token.toughness],[6,6]);assert.ok(token.is('Artifact')&&token.is('Creature')&&token.hasSub('Fractal'));
 });
 test(`${role}: Feldon's delayed token sacrifice resolves in the AI clone without touching the original game`,async()=>{
  const c=context(M,role),card=await cast(c,'Feldon of the Third Path');put(M,c.game,c.a,'Grizzly Bears','graveyard');await activate(c,card);const token=tokens(c)[0];assert.ok(token.is('Artifact')&&token.kw('haste'));
  const clone=M.cloneGameForAISimulation(c.game,713),clonedToken=clone.byIid(token.iid);await clone.emit('endStep',{player:clone.players[c.a.idx]});await settle(clone);assert.equal(clonedToken.zone,'ceased');assert.equal(token.zone,'battlefield');await end(c);assert.equal(token.zone,'ceased');
 });
 test(`${role}: repaired Awaken the Woods creates real land creatures with Forest mana and summoning sickness`,async()=>{
  const c=context(M,role);await cast(c,'Awaken the Woods',{x:2});const made=tokens(c);assert.equal(made.length,2);for(const token of made){assert.ok(token.is('Land')&&token.is('Creature')&&token.hasSub('Forest')&&token.hasSub('Dryad'));assert.ok(token.sick);}
  for(const color of'WUBRGC')c.a.pool[color]=0;assert.equal(await c.game.payMana(c.a,M.parseCost('{G}')),false);for(const token of made)token.sick=false;assert.equal(await c.game.payMana(c.a,M.parseCost('{G}')),true);assert.equal(made.filter(card=>card.tapped).length,1);
 });
 test(`${role}: repaired Stir the Sands casts three Zombies, while paid cycling separately draws and creates one`,async()=>{
  const c=context(M,role);await cast(c,'Stir the Sands');assert.equal(tokens(c).length,3);const card=put(M,c.game,c.a,'Stir the Sands','hand'),before=c.a.hand.length;for(const color of'WUBRGC')c.a.pool[color]=20;
  const action=c.game.activatableList(c.a).find(row=>row.card===card&&row.cycling);assert.ok(action);assert.equal(await c.game.activateAbility(c.a,action),true);await settle(c.game);assert.equal(card.zone,'graveyard');assert.equal(c.a.hand.length,before);assert.equal(tokens(c).length,4);for(const token of tokens(c))assert.deepEqual([token.power,token.toughness],[2,2]);
 });
 test(`${role}: repaired Sand Scout makes a red, green and white token once for the real graveyard event`,async()=>{
  const c=context(M,role);await cast(c,'Sand Scout');await c.game.mill(c.a,1);await settle(c.game);assert.equal(tokens(c).length,1);assert.deepEqual(Array.from(tokens(c)[0].colors).sort(),['G','R','W']);await c.game.mill(c.a,1);await settle(c.game);assert.equal(tokens(c).length,1);
 });
 test(`${role}: Tempt with Bunnies keeps each opponent's accept/decline choice and grants exact rewards`,async()=>{
  const c=context(M,role,2),[accept,decline]=c.others,order=[];const original=accept.controller.decide.bind(accept.controller);
  accept.controller={decide:async(g,q)=>{if(q.type==='chooseOption'&&q.prompt.includes('offer')){order.push({seat:accept.idx,hand:accept.hand.length});return 'yes';}return original(g,q);}};
  decline.controller={decide:async(g,q)=>{if(q.type==='chooseOption'&&q.prompt.includes('offer')){order.push({seat:decline.idx,hand:accept.hand.length});return 'no';}return original(g,q);}};
  const hands=c.game.players.map(p=>p.hand.length);await cast(c,'Tempt with Bunnies');assert.equal(c.a.hand.length,hands[0]+2);assert.equal(accept.hand.length,hands[1]+1);assert.equal(decline.hand.length,hands[2]);assert.equal(tokens(c).filter(t=>t.ctrl===c.a).length,2);assert.equal(tokens(c).filter(t=>t.ctrl===accept).length,1);assert.equal(tokens(c).filter(t=>t.ctrl===decline).length,0);assert.equal(order.length,2);assert.equal(order[0].hand,order[1].hand);
 });
}
