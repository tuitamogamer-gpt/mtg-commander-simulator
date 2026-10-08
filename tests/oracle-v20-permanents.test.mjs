import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {semanticClass,createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v20-permanents.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(c=>!M.DEFS[c.name]);
if(absent.length){
 const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9946,limit:absent.length,compilerVersion:20});
 assert.equal(plan.report.cards.length,absent.length,absent.filter(c=>!plan.report.cards.some(r=>r.raw.name===c.name)).map(c=>[c.name,semanticClass(c,{compilerVersion:20})]));
 M.registerOracleBatch(plan.report);M.initData(M.RAW_DATA);
}
const choose=(p,fn)=>{const prior=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>fn(g,q)??prior(g,q);};
const fund=p=>{for(const c of ['W','U','B','R','G','C'])p.pool[c]=30;};
const sturdy=(f,p,name='Grizzly Bears')=>{const c=put(M,f.game,p,name);c.def={...c.def,toughness:'30'};f.game.recalc();return c;};
test('v20 permanent source rows remain exact and unknown trailing rules reject the whole card',()=>{
 for(const c of rows){assert.ok(semanticClass(c,{compilerVersion:20}).semanticClass,c.name);assert.equal(semanticClass({...c,oracle_text:c.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:20}).semanticClass,undefined,c.name);}
});
for(const role of ['human','ai']){
 test(role+': graveyard return triggers preserve cast origin and recheck an intervening sole-creature condition',async()=>{
  const f=context(M,role),{game,a}=f;fund(a);const source=put(M,game,a,'Prized Amalgam','graveyard'),crawler=put(M,game,a,'Gravecrawler','graveyard');put(M,game,a,'Walking Corpse');const castOffer=game.castableList(a).find(row=>row.card===crawler&&row.from==='graveyard');assert.ok(castOffer,'the live Zombie grants a native paid graveyard cast');assert.equal(await game.castSpell(a,crawler,castOffer),true);await settle(game);assert.equal(crawler.zone,'battlefield');assert.equal(crawler.meta._enteredFromZone,'stack');assert.equal(source.zone,'graveyard');assert.equal(game.delayed.length,1,'casting a creature from your graveyard is independently sufficient');await game.emit('endStep',{player:a});await settle(game);assert.equal(source.zone,'battlefield');assert.equal(source.tapped,true);
  const nether=put(M,game,a,'Nether Spirit','graveyard');await game.emit('upkeep',{player:a});await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===nether));await game.move(crawler,'graveyard');await settle(game);assert.equal(nether.zone,'graveyard','a second creature arriving before resolution stops the return');await game.move(crawler,'exile');await game.emit('upkeep',{player:a});await settle(game);assert.equal(nether.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': Ichorid can decline the graveyard exile without moving either card',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Ichorid','graveyard'),other=put(M,game,a,'Walking Corpse','graveyard');choose(a,(g,q)=>q.type==='chooseOption'&&q.options.some(row=>row.key==='no')?'no':undefined);await game.emit('upkeep',{player:a});await settle(game);assert.equal(source.zone,'graveyard');assert.equal(other.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': opponent discard replacements do not mistake your activation costs for the surrounding opposing effect',async()=>{
  const f=context(M,role),{game,a,b}=f;fund(a);fund(b);const card=put(M,game,a,'Dodecapod','hand'),abilitySource=put(M,game,a,'Sol Ring');abilitySource.def={...abilitySource.def,mana:undefined,abilities:[{label:'Discard as an activation cost',cost:{discard:1},run:async()=>{}}]};game.recalc();choose(a,(g,q)=>q.type==='chooseCards'&&q.from.includes(card)?[card]:undefined);const spell=put(M,game,b,'Opt','hand');spell.def={...spell.def,resolve:async()=>{assert.equal(game.c1516Resolving.ctrl.idx,b.idx);assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===abilitySource&&row.ability)),true);}};game.turnPlayer=b;assert.equal(await game.castSpell(b,spell,{from:'hand'}),true);await settle(game);assert.equal(card.zone,'graveyard','the actual discard cost was paid by its controller, so the replacement does not apply');assert.equal(a.turnState.discardedN,1);assertGameStateInvariants(game);
 });
 test(role+': a self-discard trigger follows a public exile and the Academy replacement may be declined',async()=>{
  const f=context(M,role),{game,a,b}=f;fund(b);put(M,game,b,'Rest in Peace');const card=put(M,game,a,'Quagnoth','hand');game.turnPlayer=b;const spell=put(M,game,b,'Mind Rot','hand');assert.equal(await game.castSpell(b,spell,{from:'hand'}),true);await game.resolveTop();assert.equal(card.zone,'exile');await settle(game);assert.equal(card.zone,'hand','the return trigger tracks the discarded public-zone object');await game.move(card,'library');const academy=put(M,game,a,'Nephalia Academy'),discard=put(M,game,a,'Grizzly Bears','hand');choose(a,(g,q)=>q.type==='chooseOption'&&q.options.some(row=>row.key==='no')?'no':undefined);const second=put(M,game,b,'Mind Rot','hand');assert.equal(await game.castSpell(b,second,{from:'hand'}),true);await settle(game);assert.equal(discard.zone,'exile','declining Academy preserves the other applicable replacement');assert.equal(academy.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': a permanent leaving before a granted death trigger resolves does not remove the queued ability',async()=>{
  const f=context(M,role),{game,a}=f;fund(a);const source=put(M,game,a,'Reborn Hero');const grave=Array.from({length:7},()=>put(M,game,a,'Forest','graveyard'));game.recalc();await game.destroy(source);await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===source));for(const card of grave)await game.move(card,'hand');choose(a,(g,q)=>q.type==='chooseOption'&&q.options.some(row=>row.key==='yes')?'yes':undefined);await settle(game);assert.equal(source.zone,'battlefield','the granted ability survives losing threshold after it triggered');assert.equal(source.cur.extraTriggers.length,0,'the returning creature no longer has threshold');assertGameStateInvariants(game);
 });
 test(role+': inherited activated abilities obey live control, layered loss, self references and stable dependency cycles',async()=>{
  const f=context(M,role),{game,a,b}=f;fund(a);const mimic=put(M,game,a,'Marvin, Murderous Mimic'),donor=put(M,game,a,'Prodigal Sorcerer');const copied=()=>mimic.cur.extraAbilities.filter(ability=>ability.oracleBorrowedV20&&ability.oracleBorrowedDonorV20===donor.iid);assert.equal(copied().length,1);M.OracleV8Control.gain(game,donor,b,{});game.recalc();assert.equal(copied().length,0);M.OracleV8Control.gain(game,donor,a,{});game.recalc();assert.equal(copied().length,1);M.OracleV8AbilityLoss.add(game,[donor],{});assert.equal(copied().length,0);
  game.untilEffects.push({kind:'oracleGrantedOperation',iid:donor.iid,zoneVersion:donor.zoneVersion,expires:'eot',timestamp:game.nextOracleTimestamp(),field:'extraAbilities',grants:M.DEFS['Prodigal Sorcerer'].abilities,keywords:[]});game.recalc();assert.equal(copied().length,1,'abilities granted after removal remain inheritable');
  const kraj=put(M,game,a,'Experiment Kraj');game.addCounters(mimic,'+1/+1',1);game.addCounters(kraj,'+1/+1',1);const before=[mimic.cur.extraAbilities.length,kraj.cur.extraAbilities.length];for(let i=0;i<8;i++){game.recalc();assert.deepEqual([mimic.cur.extraAbilities.length,kraj.cur.extraAbilities.length],before,'a cyclic inheritance dependency is stable across recalculation');}
  M.OracleV8AbilityLoss.add(game,[mimic],{});assert.equal(mimic.cur.extraAbilities.length,0,'removing the inheriting static removes its grants');
  const ooze=put(M,game,a,'Necrotic Ooze'),dragon=put(M,game,b,'Shivan Dragon','graveyard');game.recalc();const pump=game.activatableList(a).find(row=>row.card===ooze&&row.ability?.oracleBorrowedDonorV20===dragon.iid);assert.ok(pump);const power=ooze.power;assert.equal(await game.activateAbility(a,pump),true);await settle(game);assert.equal(ooze.power,power+1,'a borrowed self-reference affects its new source');assert.equal(dragon.power,5);assertGameStateInvariants(game);
 });
 test(role+': a top-card ability requires an artifact or creature and graveyard land inheritance includes intrinsic basic mana',async()=>{
  const f=context(M,role),{game,a}=f,borrower=put(M,game,a,'Skill Borrower'),instant=put(M,game,a,'Lightning Bolt','library');instant.def={...instant.def,abilities:M.DEFS['Prodigal Sorcerer'].abilities};game.recalc();assert.equal(borrower.cur.extraAbilities.length,0);const creature=put(M,game,a,'Prodigal Sorcerer','library');game.recalc();assert.equal(borrower.cur.extraAbilities.length,1);await game.move(creature,'hand');assert.equal(borrower.cur.extraAbilities.length,0);
  const safe=put(M,game,a,'Mirran Safehouse'),forest=put(M,game,a,'Forest','graveyard');forest.def={...forest.def,mana:undefined};game.recalc();const mana=game.manaSources(a).find(row=>row.card===safe&&row.m.oracleBorrowedDonorV20===forest.iid);assert.ok(mana);const before=a.pool.G;assert.equal(await game.activateManaSource(a,mana,mana.produce[0]),true);assert.equal(a.pool.G,before+1);assertGameStateInvariants(game);
 });
 test(role+': Genju animation grants real activated and damage-triggered abilities and clears at cleanup',async()=>{
  const f=context(M,role),{game,a,b}=f;fund(a);const plains=put(M,game,a,'Plains'),fields=put(M,game,a,'Genju of the Fields','hand');choose(a,(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(plains)?[plains]:undefined);assert.equal(await game.castSpell(a,fields,{from:'hand'}),true);await settle(game);assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===fields)),true);await settle(game);assert.equal(plains.is('Creature'),true);assert.equal(plains.power,2);const before=a.life;await game.damagePlayer(plains,b,3);assert.equal(a.life,before,'the granted Spirit ability uses the stack');await settle(game);assert.equal(a.life,before+3);
  const swamp=put(M,game,a,'Swamp'),fens=put(M,game,a,'Genju of the Fens','hand');choose(a,(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(swamp)?[swamp]:undefined);assert.equal(await game.castSpell(a,fens,{from:'hand'}),true);await settle(game);assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===fens)),true);await settle(game);const pump=game.activatableList(a).find(row=>row.card===swamp&&row.ability);assert.ok(pump);assert.equal(await game.activateAbility(a,pump),true);await settle(game);assert.equal(swamp.power,3);await game.runTurn();assert.equal(plains.is('Creature'),false);assert.equal(swamp.is('Creature'),false);assert.equal(swamp.cur.extraAbilities.length,0);assertGameStateInvariants(game);
 });
 test(role+': Genju of the Realm adds and removes legendary and returns after the enchanted land dies',async()=>{
  const f=context(M,role),{game,a}=f;fund(a);const land=put(M,game,a,'Forest'),aura=put(M,game,a,'Genju of the Realm','hand');assert.equal(await game.castSpell(a,aura,{from:'hand'}),true);await settle(game);assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===aura)),true);await settle(game);assert.equal(land.cur.super.includes('Legendary'),true);assert.equal(land.power,8);assert.equal(land.toughness,12);await game.runTurn();assert.equal(land.cur.super.includes('Legendary'),false);await game.destroy(land);await settle(game);assert.equal(aura.zone,'hand');assertGameStateInvariants(game);
 });
 test(role+': dying source predicates preserve subtype and counter LKI across reentry',async()=>{
  const f=context(M,role),{game,a}=f;for(const name of ['Infernal Vessel',"Fang, Roku's Companion",'Unstoppable Slasher','Hellcat, Undying Vigilante']){const source=put(M,game,a,name,'hand');fund(a);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);await game.destroy(source);await settle(game);assert.equal(source.zone,'battlefield',name);await game.destroy(source);await settle(game);assert.equal(source.zone,'graveyard',name+': returned subtype, counters or removed ability stop a second return');}assertGameStateInvariants(game);
 });
 test(role+': Nine-Lives Familiar returns exactly eight times and Phytotitan uses its owner upkeep',async()=>{
  const f=context(M,role),{game,a,b}=f,cat=put(M,game,a,'Nine-Lives Familiar','hand');fund(a);assert.equal(await game.castSpell(a,cat,{from:'hand'}),true);await settle(game);assert.equal(cat.counters.revival,8);for(let remaining=7;remaining>=0;remaining--){await game.destroy(cat);await settle(game);assert.equal(cat.zone,'graveyard');await game.emit('endStep',{player:a});await settle(game);assert.equal(cat.zone,'battlefield');assert.equal(cat.counters.revival||0,remaining);}await game.destroy(cat);await settle(game);await game.emit('endStep',{player:a});await settle(game);assert.equal(cat.zone,'graveyard');
  const phyto=put(M,game,a,'Phytotitan');M.OracleV8Control.gain(game,phyto,b,{});await game.destroy(phyto);await settle(game);await game.emit('upkeep',{player:b});await settle(game);assert.equal(phyto.zone,'graveyard');await game.emit('upkeep',{player:a});await settle(game);assert.equal(phyto.zone,'battlefield');assert.equal(phyto.ctrl,a);assert.equal(phyto.tapped,true);assertGameStateInvariants(game);
 });
 test(role+': entry and attack history conditions observe real flying and Spacecraft events',async()=>{
  const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Grizzly Bears'),check=test=>M.OracleV20.helpers.genericCondition(game,source,{kind:'permanent-condition-v20',test},a);assert.equal(check('another-flying-entry'),false);const bird=put(M,game,a,'Storm Crow','hand');await game.putPermanentOntoBattlefield(bird,a);await settle(game);assert.equal(check('another-flying-entry'),true);await game.move(bird,'hand');assert.equal(check('another-flying-entry'),true);
  assert.equal(check('attacked-spacecraft'),false);source.def={...source.def,subtypes:['Spacecraft'],power:'1',toughness:'10'};game.recalc();choose(a,(g,q)=>q.type==='attackers'?[{card:source,target:b}]:undefined);await game.combatPhase(a);assert.equal(check('attacked-spacecraft'),true);assert.equal(check('shared-creature-type'),false);const copy=put(M,game,a,'Grizzly Bears');copy.def={...copy.def,changeling:true};source.def={...source.def,subtypes:['Bear']};game.recalc();assert.equal(check('shared-creature-type'),true);for(const player of game.players)player.turnState=player.freshTurnState();assert.equal(check('attacked-spacecraft'),false);assert.equal(check('another-flying-entry'),false);assertGameStateInvariants(game);
 });
 test(role+': chosen-opponent characteristics preserve the choice across control changes and clear it outside the battlefield',async()=>{
  const f=context(M,role),{game,a,b}=f;put(M,game,b,'Forest','hand');put(M,game,b,'Forest','hand');put(M,game,b,'Grizzly Bears','graveyard');for(let i=0;i<3;i++)put(M,game,b,'Command Tower').tapped=true;game.recalc();
  for(const [name,power]of [['Nyxathid',5],['Entropic Specter',2],['Skyshroud War Beast',3],['Pallimud',3],['Haunting Apparition',2]]){const source=put(M,game,a,name,'hand');fund(a);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);assert.equal(source.power,power,name);assert.equal(source.meta.oracleChosenOpponentV20.player,b.idx);M.OracleV8Control.gain(game,source,b,{});game.recalc();assert.equal(source.power,power,name+': the original chosen player remains bound');await game.move(source,'hand');assert.notEqual(source.meta.oracleChosenOpponentV20?.version,source.zoneVersion);assert.equal(source.power,name==='Nyxathid'?7:name==='Haunting Apparition'?1:0,name+': a new zone has no chosen player');}assertGameStateInvariants(game);
 });
 test(role+': chosen-upkeep damage uses the bound player and the departed Vortex counter snapshot',async()=>{
  const f=context(M,role),{game,a,b}=f,rack=put(M,game,a,'The Rack','hand');await game.putPermanentOntoBattlefield(rack,a);await settle(game);const life=b.life;await game.emit('upkeep',{player:a});await settle(game);assert.equal(b.life,life);await game.emit('upkeep',{player:b});await game.flushTriggers();await game.move(rack,'hand');await settle(game);assert.equal(b.life,life-3);
  const vortex=put(M,game,a,'Energy Vortex','hand');await game.putPermanentOntoBattlefield(vortex,a);await settle(game);game.addCounters(vortex,'vortex',4);fund(b);const mana=Object.values(b.pool).reduce((n,x)=>n+x,0);await game.emit('upkeep',{player:b});await game.flushTriggers();await game.move(vortex,'hand');await settle(game);assert.equal(b.life,life-3);assert.equal(Object.values(b.pool).reduce((n,x)=>n+x,0),mana-4);assertGameStateInvariants(game);
 });
 test(role+': granted dynamic animation respects later base setting, cleanup and grants after ability loss',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Myth Realized');fund(a);game.addCounters(source,'lore',3);const action=game.activatableList(a).find(row=>row.card===source&&row.ability.oracleOperation?.effects?.[0]?.action==='permanent-dynamic-animation-v20');assert.ok(action);assert.equal(await game.activateAbility(a,action),true);M.OracleV8AbilityLoss.add(game,[source],{temporary:true});await settle(game);assert.equal(source.is('Enchantment'),true);assert.equal(source.is('Creature'),true);assert.equal(source.power,3);assert.equal(source.hasSub('Monk'),true);game.addCounters(source,'lore',2);assert.equal(source.power,5);game.addOracleBasePT(source,{power:7,toughness:7,temporary:true});game.addCounters(source,'lore',1);assert.equal(source.power,7);await game.runTurn();assert.equal(source.is('Creature'),false);assert.equal(source.counters.lore,6);assertGameStateInvariants(game);
 });
 test(role+': Chimeric Mass activation cannot animate a new battlefield incarnation',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Chimeric Mass','hand');fund(a);assert.equal(await game.castSpell(a,source,{from:'hand',xVal:4}),true);await settle(game);assert.equal(source.counters.charge,4);assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===source)),true);await game.move(source,'hand');await game.putPermanentOntoBattlefield(source,a);await settle(game);assert.equal(source.is('Creature'),false);assert.equal(source.counters.charge||0,0);assertGameStateInvariants(game);
 });
 test(role+': permanent dynamic animation updates with lands and ends only for its original object',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,"Beorn's Hospitality");put(M,game,a,'Forest');put(M,game,a,'Forest');fund(a);assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===source)),true);await settle(game);assert.equal(source.power,2);assert.equal(source.hasSub('Bear'),true);put(M,game,a,'Forest');assert.equal(source.power,3);await game.runTurn();assert.equal(source.is('Creature'),true);assert.equal(source.cur.basePower,game.bf().filter(card=>card.ctrl===a&&card.is('Land')).length);await game.move(source,'hand');await game.putPermanentOntoBattlefield(source,a);await settle(game);assert.equal(source.is('Creature'),false);assertGameStateInvariants(game);
 });
 test(role+': Roiling Horror retains signed characteristic values in every zone and follows the highest opponent life',async()=>{
  const f=context(M,role,2),{game,a,b,others}=f,source=put(M,game,a,'Roiling Horror','hand');a.life=43;b.life=37;others[1].life=39;game.recalc();assert.equal(source.power,4);assert.equal(source.toughness,4);fund(a);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);assert.equal(source.power,4);await game.gainLife(b,5,source);game.recalc();assert.equal(source.power,1);await game.move(source,'graveyard');a.life=35;game.recalc();assert.equal(source.power,-7);assert.equal(source.toughness,-7);assertGameStateInvariants(game);
 });
 test(role+': printed token characteristic abilities remain dynamic and use the token controller',async()=>{
  const f=context(M,role),{game,a,b}=f;put(M,game,a,'Forest');put(M,game,a,'Forest');put(M,game,b,'Forest');
  const tree=put(M,game,a,'Kalonian Twingrove','hand');await game.putPermanentOntoBattlefield(tree,a);await settle(game);const token=game.bf().find(card=>card.isToken&&card.hasSub('Treefolk'));assert.ok(token);assert.equal(token.power,2);put(M,game,a,'Forest');assert.equal(token.power,3);M.OracleV8Control.gain(game,token,b,{});game.recalc();assert.equal(token.power,1);assert.equal(token.toughness,1);
  put(M,game,a,'Grizzly Bears','graveyard');put(M,game,b,'Grizzly Bears','graveyard');put(M,game,b,'Llanowar Elves','graveyard');const spell=put(M,game,a,'Elephant Resurgence','hand');fund(a);assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);const elephantA=game.creatures(a).find(card=>card.isToken&&card.hasSub('Elephant')),elephantB=game.creatures(b).find(card=>card.isToken&&card.hasSub('Elephant'));assert.equal(elephantA.power,1);assert.equal(elephantB.power,2);const dead=put(M,game,a,'Grizzly Bears');await game.destroy(dead);await settle(game);assert.equal(elephantA.power,2);assert.equal(elephantB.power,2);assertGameStateInvariants(game);
 });
 test(role+': graveyard card-type and flashback counts update created tokens after later zone changes',async()=>{
  const f=context(M,role),{game,a}=f;put(M,game,a,'Forest','graveyard');const blob=put(M,game,a,'Consuming Blob');await game.emit('endStep',{player:a});await settle(game);const ooze=game.bf().find(card=>card.isToken&&card.hasSub('Ooze'));assert.equal(ooze.power,1);assert.equal(ooze.toughness,2);const bolt=put(M,game,a,'Lightning Bolt','hand');await game.discard(a,[bolt]);game.recalc();assert.equal(ooze.power,2);assert.equal(ooze.toughness,3);
  const storm=put(M,game,a,'Seize the Storm','hand');fund(a);assert.equal(await game.castSpell(a,storm,{from:'hand'}),true);await settle(game);const elemental=game.bf().find(card=>card.isToken&&card.hasSub('Elemental'));assert.equal(elemental.power,2);assert.equal(elemental.kw('trample'),true);const flashback=put(M,game,a,'Ancient Grudge','exile');game.recalc();assert.equal(elemental.power,3);await game.move(bolt,'library');game.recalc();assert.equal(elemental.power,2);await game.move(flashback,'hand');game.recalc();assert.equal(elemental.power,1);assertGameStateInvariants(game);
 });
 test(role+': Hallowed Haunting token growth counts the newly created Spirits and earlier tokens',async()=>{
  const f=context(M,role),{game,a}=f;put(M,game,a,'Hallowed Haunting');for(let i=1;i<=2;i++){const enchantment=put(M,game,a,'Dawn of Hope','hand');fund(a);assert.equal(await game.castSpell(a,enchantment,{from:'hand'}),true);await settle(game);const spirits=game.creatures(a).filter(card=>card.isToken&&card.hasSub('Spirit'));assert.equal(spirits.length,i);for(const token of spirits){assert.equal(token.power,i);assert.equal(token.toughness,i);assert.equal(token.hasSub('Cleric'),true);}}assertGameStateInvariants(game);
 });
 test(role+': individual-counter triggers fire per counter while one-or-more triggers capture the entire amount',async()=>{
  const f=context(M,role),{game,a,b}=f,hoplite=put(M,game,a,'Bloodcrazed Hoplite'),enemy=put(M,game,b,'Grizzly Bears');game.addCounters(enemy,'+1/+1',3);choose(a,(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(enemy)?[enemy]:q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:undefined);game.addCounters(hoplite,'+1/+1',2);await settle(game);assert.equal(enemy.plus1(),1);
  const hydra=put(M,game,a,'Protean Hydra','hand');fund(a);assert.equal(await game.castSpell(a,hydra,{from:'hand',xVal:3}),true);await settle(game);game.removeCounters(hydra,'+1/+1',2);await settle(game);assert.equal(hydra.plus1(),1);await game.emit('endStep',{player:b});await settle(game);assert.equal(hydra.plus1(),5);
  const chandra=put(M,game,a,'Chandra, Fire Artisan','hand');await game.putPermanentOntoBattlefield(chandra,a);await settle(game);const life=b.life;game.removeCounters(chandra,'loyalty',2);await settle(game);assert.equal(b.life,life-2);assertGameStateInvariants(game);
 });
 test(role+': Bioessence Hydra counts entering planeswalker loyalty and exact later positive placements',async()=>{
  const f=context(M,role),{game,a,b}=f,walker=put(M,game,a,'Chandra, Fire Artisan','hand');await game.putPermanentOntoBattlefield(walker,a);await settle(game);const hydra=put(M,game,a,'Bioessence Hydra','hand');await game.putPermanentOntoBattlefield(hydra,a);await settle(game);assert.equal(hydra.plus1(),walker.counters.loyalty);const n=hydra.plus1();game.addCounters(walker,'loyalty',3);await settle(game);assert.equal(hydra.plus1(),n+3);const other=put(M,game,b,'Chandra, Fire Artisan','hand');await game.putPermanentOntoBattlefield(other,b);await settle(game);assert.equal(hydra.plus1(),n+3);game.addCounters(other,'loyalty',2);await settle(game);assert.equal(hydra.plus1(),n+3);assertGameStateInvariants(game);
 });
 for(const name of ["Captain's Hook","Stitcher's Graft",'Grafted Wargear'])test(role+': '+name+' triggers on detachment and respects the old host incarnation',async()=>{
  const f=context(M,role),{game,a}=f,equipment=put(M,game,a,name),first=put(M,game,a,'Grizzly Bears'),second=put(M,game,a,'Grizzly Bears');await game.attach(equipment,first);await game.attach(equipment,second);await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===equipment));await game.move(first,'exile');await game.putPermanentOntoBattlefield(first,a);await settle(game);assert.equal(first.zone,'battlefield');await game.move(equipment,'hand');await settle(game);assert.equal(second.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': day/night cards start day without a transition, then trigger on each actual change',async()=>{
  const f=context(M,role),{game,a}=f,sage=put(M,game,a,'Firmament Sage','hand');const hand=a.hand.length;await game.putPermanentOntoBattlefield(sage,a);await settle(game);assert.equal(game.bomDayNight,'day');assert.equal(a.hand.length,hand-1);
  game.bomPreviousActive=a.idx;a.lastTurnSpellsCast=0;await game.bomUpdateDayNight();await settle(game);assert.equal(game.bomDayNight,'night');assert.equal(a.hand.length,hand);
  const cav=put(M,game,a,'Sunrise Cavalier','hand');await game.putPermanentOntoBattlefield(cav,a);await settle(game);assert.equal(game.bomDayNight,'night');assert.equal(cav.plus1(),0);choose(a,(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(cav)?[cav]:undefined);
  a.lastTurnSpellsCast=2;await game.bomUpdateDayNight();await settle(game);assert.equal(game.bomDayNight,'day');assert.equal(a.hand.length,hand+1);assert.equal(cav.plus1(),1);await game.bomUpdateDayNight();await settle(game);assert.equal(cav.plus1(),1);assertGameStateInvariants(game);
 });
 test(role+': Sunstreak Phoenix returns from the graveyard on a transition after its actual optional payment',async()=>{
  const f=context(M,role),{game,a}=f,phoenix=put(M,game,a,'Sunstreak Phoenix','graveyard');fund(a);game.bomDayNight='day';game.bomPreviousActive=a.idx;a.lastTurnSpellsCast=0;const before=Object.values(a.pool).reduce((s,n)=>s+n,0);
  await game.bomUpdateDayNight();await settle(game);assert.equal(phoenix.zone,'battlefield');assert.equal(phoenix.tapped,true);assert.equal(Object.values(a.pool).reduce((s,n)=>s+n,0),before-2);assert.equal(game.bomDayNight,'night');assertGameStateInvariants(game);
 });
 test(role+': The Celestus activation changes day and night at sorcery speed and produces real triggered rewards',async()=>{
  const f=context(M,role),{game,a}=f,celestus=put(M,game,a,'The Celestus','hand');await game.putPermanentOntoBattlefield(celestus,a);await settle(game);fund(a);const start=a.life,action=game.activatableList(a).find(row=>row.card===celestus);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(game.bomDayNight,'night');assert.equal(a.life,start+1);game.untap(celestus);game.phase='combat';assert.equal(game.activatableList(a).some(row=>row.card===celestus&&row.ability===action.ability),false);game.phase='main1';assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===celestus)),true);await settle(game);assert.equal(game.bomDayNight,'day');assert.equal(a.life,start+2);assertGameStateInvariants(game);
 });
 test(role+': Case history conditions count distinct damage sources, real spell types, graveyard cards and attackers',async()=>{
  const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Grizzly Bears'),check=(test,min=3,extra={})=>M.OracleV20.helpers.genericCondition(game,source,{kind:'permanent-condition-v20',test,min,...extra},a);
  const second=put(M,game,a,'Grizzly Bears'),third=put(M,game,a,'Grizzly Bears');assert.equal(check('damage-sources'),false);await game.damagePlayer(source,b,1);await game.damagePlayer(source,b,1);await game.damagePlayer(second,b,1);assert.equal(check('damage-sources'),false);await game.damagePlayer(third,b,1);assert.equal(check('damage-sources'),true);
  const grave=put(M,game,a,'Grizzly Bears','hand'),enemy=put(M,game,b,'Grizzly Bears');await game.discard(a,[grave]);await game.destroy(enemy);assert.equal(check('grave-creature-total'),false);await game.destroy(second);assert.equal(check('grave-creature-total'),true);
  assert.equal(check('no-suspected-subtype',0,{subtype:'Skeleton'}),true);third.def={...third.def,subtypes:['Skeleton']};third.meta.suspected=true;game.recalc();assert.equal(check('no-suspected-subtype',0,{subtype:'Skeleton'}),false);third.meta.suspected=false;game.recalc();assert.equal(check('no-suspected-subtype',0,{subtype:'Skeleton'}),true);
  choose(a,(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:q.type==='attackers'?q.eligible.map(card=>({card,target:b})):undefined);
  for(let i=0;i<4;i++){const spell=put(M,game,a,'Lightning Bolt','hand');fund(a);assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);assert.equal(check('instant-sorcery-cast-total',4),i===3);}
  put(M,game,a,'Grizzly Bears');for(const c of game.creatures(a))c.sick=false;assert.equal(check('attacker-total'),false);await game.combatPhase(a);assert.equal(check('attacker-total'),true);
  game.turnNo++;for(const p of game.players)p.turnState=p.freshTurnState();for(const test of ['damage-sources','grave-creature-total','instant-sorcery-cast-total','attacker-total'])assert.equal(check(test),false);assertGameStateInvariants(game);
 });
 test(role+': Haunt links the actual graveyard and haunted incarnations and resolves the exiled reward',async()=>{
  const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Blind Hunter'),haunted=put(M,game,b,'Grizzly Bears');
  choose(a,(g,q)=>q.type==='chooseTargets'?q.candidates.includes(haunted)?[haunted]:q.candidates.includes(b)?[b]:undefined:undefined);
  await game.destroy(source);await game.flushTriggers();assert.equal(source.zone,'graveyard');assert.ok(game.stack.some(row=>row.srcCard===source));await settle(game);assert.equal(source.zone,'exile');assert.equal(source.meta.oracleHauntV20.hauntedIid,haunted.iid);
  const startA=a.life,startB=b.life;const unrelated=put(M,game,b,'Grizzly Bears');await game.destroy(unrelated);await settle(game);assert.equal(a.life,startA);assert.equal(b.life,startB);
  await game.destroy(haunted);await settle(game);assert.equal(a.life,startA+2);assert.equal(b.life,startB-2);assert.equal(source.zone,'exile');assertGameStateInvariants(game);
 });
 test(role+': Haunt refuses a graveyard source removed in response and a creature that blinked',async()=>{
  const f=context(M,role),{game,a,b}=f,first=put(M,game,a,'Blind Hunter'),haunted=put(M,game,b,'Grizzly Bears');
  choose(a,(g,q)=>q.type==='chooseTargets'?q.candidates.includes(haunted)?[haunted]:q.candidates.includes(b)?[b]:undefined:undefined);
  await game.destroy(first);await game.flushTriggers();await game.move(first,'hand');await settle(game);assert.equal(first.zone,'hand');assert.equal(first.meta.oracleHauntV20,undefined);
  const source=put(M,game,a,'Blind Hunter');await game.destroy(source);await settle(game);assert.equal(source.zone,'exile');const startA=a.life,startB=b.life;
  await game.move(haunted,'exile');await game.putPermanentOntoBattlefield(haunted,b);await game.destroy(haunted);await settle(game);assert.equal(a.life,startA);assert.equal(b.life,startB);assertGameStateInvariants(game);
 });
 test(role+': a Haunt card returning to exile cannot reuse an old link and Hushbringer suppresses Haunt',async()=>{
  const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Blind Hunter'),haunted=put(M,game,b,'Grizzly Bears');
  choose(a,(g,q)=>q.type==='chooseTargets'?q.candidates.includes(haunted)?[haunted]:q.candidates.includes(b)?[b]:undefined:undefined);
  await game.destroy(source);await settle(game);assert.equal(source.zone,'exile');await game.move(source,'hand');await game.move(source,'exile');const startA=a.life,startB=b.life;await game.destroy(haunted);await settle(game);assert.equal(a.life,startA);assert.equal(b.life,startB);
  put(M,game,a,'Hushbringer');const suppressed=put(M,game,a,'Blind Hunter');await game.destroy(suppressed);await settle(game);assert.equal(suppressed.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': Hushbringer suppresses creature entry and death without suppressing sacrifice events',async()=>{
  const f=context(M,role),{game,a,b}=f,hush=put(M,game,a,'Hushbringer');let deaths=0,entries=0,sacrifices=0;
  const observer=put(M,game,b,'Sol Ring');observer.def={...observer.def,triggers:[{on:'dies',run:async()=>deaths++},{on:'etb',run:async()=>entries++},{on:'sacrificed',run:async()=>sacrifices++}]};game.recalc();
  const bear=put(M,game,a,'Grizzly Bears','hand');await game.putPermanentOntoBattlefield(bear,a);await settle(game);assert.equal(entries,0);
  await game.sacrifice(a,bear);await settle(game);assert.equal(deaths,0);assert.equal(sacrifices,1);
  await game.destroy(hush);await settle(game);assert.equal(deaths,0);
  const after=put(M,game,b,'Grizzly Bears','hand');await game.putPermanentOntoBattlefield(after,b);await settle(game);assert.equal(entries,1);
  await game.destroy(after);await settle(game);assert.equal(deaths,1);assertGameStateInvariants(game);
 });
 test(role+': Hushbringer ability removal restores death events',async()=>{
  const f=context(M,role),{game,a}=f,hush=put(M,game,a,'Hushbringer');let count=0;const watcher=put(M,game,a,'Sol Ring');watcher.def={...watcher.def,triggers:[{on:'dies',run:async()=>count++}]};game.recalc();
  M.OracleV8AbilityLoss.add(game,[hush],{});await game.destroy(hush);await settle(game);assert.equal(count,1);assertGameStateInvariants(game);
 });
 test(role+': unusual P/T counters affect the two stats independently and source damage history resets on blink',async()=>{
  const f=context(M,role),{game,a,b}=f,wall=put(M,game,a,'Wall of Resistance'),attacker=put(M,game,b,'Grizzly Bears');
  await game.damageAny(attacker,wall,1,{deferSBA:true});await game.emit('endStep',{player:b});await settle(game);assert.equal(wall.counters['+0/+1'],1);assert.equal(wall.power,0);assert.equal(wall.toughness,4);
  game.addCounters(wall,'+2/+2',1);game.addCounters(wall,'-0/-2',1);assert.equal(wall.power,2);assert.equal(wall.toughness,4);
  await game.move(wall,'exile');await game.move(wall,'battlefield',{ctrl:a});await game.emit('endStep',{player:a});await settle(game);assert.equal(wall.counters['+0/+1']||0,0);assertGameStateInvariants(game);
 });
 test(role+': Mowu modifies only its own positive counters and stops when its abilities are removed',()=>{
  const f=context(M,role),{game,a}=f,mowu=put(M,game,a,'Mowu, Loyal Companion'),other=put(M,game,a,'Grizzly Bears');
  game.addCounters(mowu,'+1/+1',2);game.addCounters(other,'+1/+1',2);assert.equal(mowu.plus1(),3);assert.equal(other.plus1(),2);game.addCounters(mowu,'+1/+1',0);assert.equal(mowu.plus1(),3);
  M.OracleV8AbilityLoss.add(game,[mowu],{});game.addCounters(mowu,'+1/+1',1);assert.equal(mowu.plus1(),4);assertGameStateInvariants(game);
 });
 test(role+': Apocalypse Hydra computes the replacement from announced X before entry triggers',async()=>{
  const f=context(M,role),{game,a}=f;for(const x of [4,5]){const c=put(M,game,a,'Apocalypse Hydra','hand');fund(a);assert.equal(await game.castSpell(a,c,{from:'hand',xVal:x}),true);await settle(game);assert.equal(c.plus1(),x>=5?10:4);}assertGameStateInvariants(game);
 });
 test(role+': once-each-turn counter trigger captures each actual placement, accepts opposing placements, and excludes other types',async()=>{
  const f=context(M,role),{game,a,b}=f,cadet=put(M,game,a,'Cloaked Cadet'),human=put(M,game,a,'Bloodcrazed Hoplite'),bear=put(M,game,a,'Grizzly Bears');
  const initial=a.hand.length;game.addCounters(bear,'+1/+1',1,false,a);await settle(game);assert.equal(a.hand.length,initial);
  game.addCounters(human,'+1/+1',2,false,b);await settle(game);assert.equal(a.hand.length,initial+1);game.addCounters(cadet,'+1/+1',1,false,a);await settle(game);assert.equal(a.hand.length,initial+1);
  game.turnNo++;for(const p of game.players)p.turnState=p.freshTurnState();game.addCounters(cadet,'+1/+1',1,false,a);await settle(game);assert.equal(a.hand.length,initial+2);assertGameStateInvariants(game);
 });
 test(role+': the greatest mana value protection updates at ties and after the former largest creature leaves',async()=>{
  const f=context(M,role),{game,a,b}=f;put(M,game,a,'Favor of the Mighty');const big=put(M,game,a,'Craw Wurm'),small=put(M,game,b,'Grizzly Bears'),red=put(M,game,b,'Lightning Bolt','hand');
  assert.equal(game.isProtectedFrom(big,red),true);assert.equal(game.isProtectedFrom(small,red),false);await game.move(big,'exile');assert.equal(game.isProtectedFrom(small,red),true);assertGameStateInvariants(game);
 });
 test(role+': Archon checks both Aura and host control and preserves counters after base power changes',async()=>{
  const f=context(M,role),{game,a,b}=f,archon=put(M,game,a,'Archon of the Wild Rose'),host=put(M,game,a,'Grizzly Bears'),aura=put(M,game,a,'Pacifism');
  assert.equal(await game.attach(aura,host),true);game.addCounters(host,'+1/+1',1);assert.equal(host.power,5);assert.equal(host.kw('flying'),true);aura.ctrl=b;game.recalc();assert.equal(host.power,3);assert.equal(host.kw('flying'),false);aura.ctrl=a;game.recalc();assert.equal(host.power,5);M.OracleV8AbilityLoss.add(game,[archon],{});assert.equal(host.power,3);assertGameStateInvariants(game);
 });
 test(role+': Petroglyphs distinguish blank creatures, printed abilities and granted keyword counters',()=>{
  const f=context(M,role),{game,a}=f;put(M,game,a,'Muraganda Petroglyphs');const blank=put(M,game,a,'Grizzly Bears'),elf=put(M,game,a,'Llanowar Elves');assert.equal(blank.power,4);assert.equal(elf.power,1);game.addCounters(blank,'flying',1);assert.equal(blank.power,2);M.OracleV8AbilityLoss.add(game,[elf],{});assert.equal(elf.power,3);assertGameStateInvariants(game);
 });
 test(role+': Palladia loses hexproof only after actual dealt damage and receives a new lifetime on blink',async()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,a,'Palladia-Mors, the Ruiner'),wall=sturdy(f,b);assert.equal(c.kw('hexproof'),true);await game.damageAny(c,wall,1,{deferSBA:true});game.recalc();assert.equal(c.kw('hexproof'),false);game.turnNo++;game.recalc();assert.equal(c.kw('hexproof'),false);await game.move(c,'exile');await game.move(c,'battlefield',{ctrl:a});assert.equal(c.kw('hexproof'),true);assertGameStateInvariants(game);
 });
 test(role+': Knight of the Ebon Legion checks life lost by any player and intervening condition twice',async()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,a,'Knight of the Ebon Legion');await game.loseLife(b,3);await game.emit('endStep',{player:a});await settle(game);assert.equal(c.plus1(),0);await game.loseLife(a,4);await game.emit('endStep',{player:a});await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===c));a.turnState.lifeLost=0;await settle(game);assert.equal(c.plus1(),0);await game.loseLife(a,4);await game.emit('endStep',{player:a});await settle(game);assert.equal(c.plus1(),1);assertGameStateInvariants(game);
 });
 test(role+': Hushbringer covers simultaneous deaths and native persist while entry counters remain replacements',async()=>{
  const f=context(M,role),{game,a}=f,hush=put(M,game,a,'Hushbringer'),persist=put(M,game,a,'Kitchen Finks');let deaths=0;const watcher=put(M,game,a,'Sol Ring');watcher.def={...watcher.def,triggers:[{on:'dies',run:async()=>deaths++}]};game.recalc();
  const apprentice=put(M,game,a,'Iron Apprentice','hand');await game.putPermanentOntoBattlefield(apprentice,a);assert.equal(apprentice.plus1(),1);
  await game.destroyMany([hush,persist,apprentice]);await settle(game);assert.equal(deaths,0);assert.equal(persist.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': Annie doubles the last-known legendary source and remains effective during simultaneous death',async()=>{
  const f=context(M,role),{game,a,b}=f,annie=put(M,game,a,'Annie Joins Up'),creature=put(M,game,b,'Grizzly Bears');creature.ctrl=a;let count=0;creature.def={...creature.def,super:['Legendary'],triggers:[{on:'dies',filter:(g,c,d)=>d.card===c,run:async()=>count++}]};game.recalc();await game.destroyMany([annie,creature]);await settle(game);assert.equal(count,2);assert.equal(creature.ctrl,b);assertGameStateInvariants(game);
 });
 test(role+': counter redistribution retains every kind and refuses an intervening empty-counter event',async()=>{
  const f=context(M,role),{game,a}=f,host=put(M,game,a,'Host of the Hereafter','hand');await game.putPermanentOntoBattlefield(host,a);assert.equal(host.plus1(),2);const recipient=put(M,game,a,'Grizzly Bears'),donor=put(M,game,a,'Grizzly Bears');game.addCounters(donor,'+1/+1',2);game.addCounters(donor,'flying',1);choose(a,(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(recipient)?[recipient]:undefined);
  await game.destroy(donor);await settle(game);assert.equal(recipient.plus1(),2);assert.equal(recipient.counters.flying,1);const empty=put(M,game,a,'Grizzly Bears');await game.destroy(empty);assert.equal(game.pendingTriggers.filter(t=>t.src===host).length,0);assertGameStateInvariants(game);
 });
 test(role+': a source leaving the battlefield copies counters from its departed incarnation',async()=>{
  const f=context(M,role),{game,a}=f,captain=put(M,game,a,'Selfless Police Captain'),recipient=put(M,game,a,'Grizzly Bears');game.addCounters(captain,'+1/+1',3);game.addCounters(captain,'flying',1);choose(a,(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(recipient)?[recipient]:undefined);await game.move(captain,'hand');await settle(game);assert.equal(recipient.plus1(),3);assert.equal(recipient.counters.flying||0,0);assertGameStateInvariants(game);
 });
 for(const name of ['Urborg Scavengers','Mirror Golem'])test(role+': '+name+' uses only linked exiled incarnations',async()=>{
  const f=context(M,role),{game,a,b}=f,source=put(M,game,a,name),card=put(M,game,b,'Vampire Nighthawk','graveyard');choose(a,(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(card)?[card]:q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined);await game.emit('etb',{card:source});await settle(game);assert.equal(card.zone,'exile');game.recalc();
  const enemy=put(M,game,b,'Grizzly Bears');if(name==='Urborg Scavengers'){assert.equal(source.kw('flying'),true);assert.equal(source.kw('deathtouch'),true);assert.equal(source.kw('lifelink'),true);}else assert.equal(game.isProtectedFrom(source,enemy),true);
  await game.move(card,'hand');await game.move(card,'exile');game.recalc();if(name==='Urborg Scavengers')assert.equal(source.kw('deathtouch'),false);else assert.equal(game.isProtectedFrom(source,enemy),false);assertGameStateInvariants(game);
 });
 test(role+': plan-counter thresholds fire only when crossing and create ordinary stack triggers',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Political Triumph'),creature=put(M,game,a,'Grizzly Bears');const hand=a.hand.length;game.addCounters(source,'plan',3);await settle(game);assert.equal(source.zone,'battlefield');game.addCounters(source,'plan',2);await game.flushTriggers();assert.equal(source.zone,'battlefield');assert.ok(game.stack.some(row=>row.srcCard===source));await settle(game);assert.equal(source.zone,'graveyard');assert.equal(a.hand.length,hand+1);assert.equal(creature.plus1(),1);assertGameStateInvariants(game);
 });
 test(role+': a mandatory sacrifice queues the reward as a new reflexive trigger',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Villainous Syndication'),donor=put(M,game,a,'Grizzly Bears','graveyard');choose(a,(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(donor)?[donor]:undefined);game.addCounters(source,'plan',4);await game.flushTriggers();await game.resolveTop();assert.equal(source.zone,'graveyard');assert.equal(donor.zone,'graveyard');await game.flushTriggers();assert.ok(game.stack.length);await settle(game);assert.equal(donor.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': history predicates distinguish LKI deaths, exile departures, graveyard card arrivals and types',async()=>{
  const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Grizzly Bears'),check=(test,extras={})=>M.OracleV20.helpers.genericCondition(game,source,{kind:'permanent-condition-v20',test,...extras},a);
  assert.equal(check('no-permanent-left'),true);const exiled=put(M,game,a,'Grizzly Bears');await game.move(exiled,'exile');assert.equal(check('departed',{type:'Creature'}),true);assert.equal(check('creature-died'),false);assert.equal(check('no-permanent-left'),false);
  const zombie=put(M,game,b,'Grizzly Bears');zombie.def={...zombie.def,subtypes:['Zombie']};game.recalc();await game.destroy(zombie);assert.equal(check('creature-died',{excludeSubtype:'Zombie'}),false);
  const dead=put(M,game,b,'Grizzly Bears');await game.destroy(dead);assert.equal(check('creature-died',{excludeSubtype:'Zombie'}),true);assert.equal(check('creature-died',{excludeName:'Grizzly Bears'}),false);
  const creature=put(M,game,a,'Grizzly Bears','hand');assert.equal(check('grave-entry',{type:'Creature'}),false);await game.discard(a,[creature]);assert.equal(check('grave-entry',{type:'Creature'}),true);assert.equal(check('died-owned',{type:'Creature'}),false);
  const token=await game.makeTokens({name:'History token',types:['Creature'],subtypes:['Spirit'],power:'1',toughness:'1'},a,{n:1});game.players.forEach(p=>p.turnState=p.freshTurnState());await game.destroy(token[0]);assert.equal(check('grave-entry',{type:'Creature'}),false);assert.equal(check('creature-died'),true);assertGameStateInvariants(game);
 });
 test(role+': Flowering Lumberknot follows the actual soulbond pair and an abilityless partner',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Flowering Lumberknot'),paladin=put(M,game,a,'Silverblade Paladin','hand');assert.equal(source.cur.cantAttack,true);choose(a,(g,q)=>q.type==='chooseCards'&&q.from.includes(source)?[source]:undefined);await game.putPermanentOntoBattlefield(paladin,a);await settle(game);assert.equal(M.OracleV8Soulbond.partner(game,source),paladin);assert.equal(source.cur.cantAttack,false);M.OracleV8AbilityLoss.add(game,[paladin],{});assert.equal(source.cur.cantAttack,true);assertGameStateInvariants(game);
 });
 test(role+': Equipment restriction blocks attachment, entry attachment, and illegal existing attachment',async()=>{
  const f=context(M,role),{game,a}=f,brawler=put(M,game,a,'Goblin Brawler'),equipment=put(M,game,a,'Bonesplitter');assert.equal(await game.attach(equipment,brawler),false);assert.equal(game.legalEntryAttachment(equipment,brawler,a),false);
  equipment.attachedTo=brawler.iid;brawler.attachments.push(equipment.iid);game.recalc();await game.checkSBA();assert.equal(equipment.attachedTo,null);M.OracleV8AbilityLoss.add(game,[brawler],{});assert.equal(await game.attach(equipment,brawler),true);assertGameStateInvariants(game);
 });
 test(role+': mobile defender permission expires at end of turn',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Mobile Fort');fund(a);assert.equal(source.cur.cantAttack,true);const action=game.activatableList(a).find(row=>row.card===source);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(source.power,3);assert.equal(source.cur.cantAttack,false);game.untilEffects=[];game.recalc();assert.equal(source.cur.cantAttack,true);assert.equal(source.power,0);assertGameStateInvariants(game);
 });
 for(const [name,kw]of [['Tin-Wing Chimera','flying'],['Iron-Heart Chimera','vigilance'],['Lead-Belly Chimera','trample'],['Brass-Talon Chimera','first strike']])test(role+': '+name+' grants a permanent keyword with its physical counter',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,name),host=put(M,game,a,'Tin-Wing Chimera');host.def={...host.def,kws:[]};game.recalc();choose(a,(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(host)?[host]:undefined);assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===source)),true);await settle(game);assert.equal(source.zone,'graveyard');assert.equal(host.counters['+2/+2'],1);assert.equal(host.power,4);assert.equal(host.kw(kw),true);game.turnNo++;game.recalc();assert.equal(host.kw(kw),true);await game.move(host,'hand');await game.move(host,'battlefield',{ctrl:a});assert.equal(host.kw(kw),false);assertGameStateInvariants(game);
 });
}
