import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v18-compositions.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9936,limit:absent.length,compilerVersion:18});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);}
M.initData(M.RAW_DATA);
function choose(player,handler){const prior=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>{const answer=handler(g,q);return answer===undefined?prior(g,q):answer;};}
function fund(player){for(const color of ['W','U','B','R','G','C'])player.pool[color]=40;}
async function cast(f,name,targets=[],options={}){const card=put(M,f.game,f.a,name,'hand');fund(f.a);choose(f.a,(g,q)=>q.type==='chooseTargets'?targets.filter(target=>q.candidates.includes(target)).slice(0,q.max??q.count??1):undefined);assert.equal(await f.game.castSpell(f.a,card,{from:'hand',...options}),true,name);return card;}
async function activate(f,source,targets=[],pick=()=>true){fund(f.a);source.sick=false;choose(f.a,(g,q)=>q.type==='chooseTargets'?targets.filter(target=>q.candidates.includes(target)).slice(0,q.max??q.count??1):undefined);const action=f.game.activatableList(f.a).find(row=>row.card===source&&pick(row));assert.ok(action,source.name);assert.equal(await f.game.activateAbility(f.a,action),true);return action;}
function sturdy(f,player,name='Craw Wurm',extra={}){const card=put(M,f.game,player,name);card.def={...card.def,toughness:'30',...extra};f.game.recalc();return card;}
function faceDown(f,card){M.C14.faceDown(f.game,card);f.game.recalc();return card;}

test('v18 compiles complete source cards and rejects an unsupported suffix',()=>{
 for(const card of rows){assert.ok(semanticClass(card,{compilerVersion:18}).semanticClass,card.name);assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nDo an unsupported thing.',...(card.card_faces?{card_faces:card.card_faces.map(face=>({...face,oracle_text:face.oracle_text+'\nDo an unsupported thing.'}))}:{})},{compilerVersion:18}).semanticClass,undefined,card.name);}
});
for(const role of ['human','ai']){
 test(role+': returning an uncounterable spell and changing its color are separate Stack actions',async()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,b,"Gaea's Revenge",'hand');fund(b);game.turnPlayer=b;assert.equal(await game.castSpell(b,c,{from:'hand'}),true);game.turnPlayer=a;
  const object=game.stack.at(-1);await cast(f,'Chaoslace',[object]);await game.resolveTop();assert.deepEqual(Array.from(c.colors),['R']);await cast(f,'Unsubstantiate',[object]);await game.resolveTop();assert.equal(c.zone,'hand');assert.equal(game.stack.includes(object),false);assert.deepEqual(Array.from(c.colors),['G']);assertGameStateInvariants(game);
 });
 test(role+': Stack color changes follow a resolving permanent but stop on a later zone change',async()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,b,'Grizzly Bears','hand');fund(b);game.turnPlayer=b;await game.castSpell(b,c,{from:'hand'});game.turnPlayer=a;await cast(f,'Moonlace',[game.stack.at(-1)]);await game.resolveTop();assert.deepEqual(Array.from(c.colors),[]);await settle(game);assert.equal(c.zone,'battlefield');assert.deepEqual(Array.from(c.colors),[]);await game.move(c,'exile');await game.move(c,'battlefield',{ctrl:b});assert.deepEqual(Array.from(c.colors),['G']);assertGameStateInvariants(game);
 });
 test(role+': mixed targets still enforce hexproof and mana value',async()=>{
  const f=context(M,role),{game,a,b}=f,c=sturdy(f,b,'Grizzly Bears',{kws:['hexproof']}),source=put(M,game,a,'Divide by Zero','hand');const spec=source.def.targets[0];assert.equal(game.legalTargets(spec,source,a).includes(c),false);c.def={...c.def,kws:[],cost:'{0}'};game.recalc();assert.equal(game.legalTargets(spec,source,a).includes(c),false);c.def.cost='{1}';game.recalc();assert.equal(game.legalTargets(spec,source,a).includes(c),true);
 });
 test(role+': zero counters still produce the Battery base mana and automatic payment removes only the excess',async()=>{
  const f=context(M,role),{game,a}=f,c=put(M,game,a,'Red Mana Battery');for(const color of Object.keys(a.pool))a.pool[color]=0;assert.equal(await game.payMana(a,M.parseCost('{R}')),true);assert.equal(c.tapped,true);assert.equal(c.counters.charge||0,0);c.tapped=false;game.addCounters(c,'charge',3);assert.equal(await game.payMana(a,M.parseCost('{3}')),true);assert.equal(c.counters.charge,1);assert.equal(a.pool.R,0);assertGameStateInvariants(game);
 });
 test(role+': counter prohibitions apply during entry, normal effects, and counter payment',async()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,a,'Tatterkite','hand');await game.move(c,'battlefield',{ctrl:a,additionalCounters:{'+1/+1':2,charge:2}});assert.equal(Object.values(c.counters).reduce((s,n)=>s+n,0),0);c.def={...c.def,abilities:[{label:'Counter cost',cost:{counter:'-1/-1'},run:async ctx=>ctx.g.draw(ctx.you,1)}]};game.recalc();assert.equal(game.activatableList(a).some(r=>r.card===c),false);const beetle=put(M,game,a,'Blightbeetle'),other=put(M,game,b,'Grizzly Bears','hand');await game.move(other,'battlefield',{ctrl:b,additionalCounters:{'+1/+1':3}});assert.equal(other.plus1(),0);await game.move(beetle,'exile');game.addCounters(other,'+1/+1',2);assert.equal(other.plus1(),2);assertGameStateInvariants(game);
 });
 test(role+': Spirit prevents a second draw before Dredge can replace it',async()=>{
  const f=context(M,role),{game,a}=f,spirit=put(M,game,a,'Spirit of the Labyrinth'),imp=put(M,game,a,'Stinkweed Imp','graveyard');a.turnState.drewThisTurn=1;const n=a.library.length,hand=a.hand.length;await game.draw(a,1);assert.equal(a.library.length,n);assert.equal(a.hand.length,hand);assert.equal(imp.zone,'graveyard');M.OracleV8AbilityLoss.add(game,[spirit],{});await game.draw(a,1);assert.ok(a.hand.length>hand||imp.zone==='hand');assertGameStateInvariants(game);
 });
 test(role+': Upwelling retains restricted mana and Horizon Stone preserves its restrictions after conversion',async()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,a,'Upwelling'),restrict=()=>false;a.pool.U=2;a.poolMeta=[{color:'U',n:1,restrict,persist:'eot'}];b.pool.G=3;game.expirePersistentMana();game.emptyPool();assert.equal(a.pool.U,2);assert.equal(b.pool.G,3);assert.equal(a.poolMeta[0].restrict,restrict);await game.move(c,'exile');put(M,game,a,'Horizon Stone');game.emptyPool();assert.equal(a.pool.C,2);assert.equal(a.pool.U,0);assert.equal(a.poolMeta[0].color,'C');assert.equal(a.poolMeta[0].restrict,restrict);assert.equal(b.pool.G,0);assertGameStateInvariants(game);
 });
 test(role+': a zero-mana activation pays Suppression Field before its tap cost',async()=>{
  const f=context(M,role),{game,a}=f;put(M,game,a,'Suppression Field');const c=put(M,game,a,'Grizzly Bears');c.def={...c.def,abilities:[{label:'Tap to draw',cost:{tap:true},run:async ctx=>ctx.g.draw(ctx.you,1)}]};game.recalc();assert.equal(game.activatableList(a).some(r=>r.card===c),false);a.pool.C=2;const action=game.activatableList(a).find(r=>r.card===c);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(a.pool.C,0);assert.equal(c.tapped,true);await settle(game);assert.equal(a.hand.length,1);assertGameStateInvariants(game);
 });
 test(role+': activated cost increases precede all reductions, and mana abilities remain exempt',()=>{
  const f=context(M,role),{game,a}=f;put(M,game,a,'Suppression Field');const reducer=put(M,game,a,'Grizzly Bears'),source=put(M,game,a,'Craw Wurm');reducer.def={...reducer.def,abilityCostReduction:()=>3};assert.equal(game.abilityManaCost(a,source,'{1}',{ability:{}}).generic,0);assert.equal(game.abilityManaCost(a,source,'{2}',{isMana:true}).generic,0);assert.equal(game.abilityManaCost(a,source,'{1}{U}',{ability:{}}).pips.length,1);
 });
 test(role+': loyalty with no printed mana still pays Eidolon and the Immortal Sun suppresses it',async()=>{
  const f=context(M,role),{game,a,b}=f,walker=put(M,game,a,"Chandra, Flame's Fury");walker.counters.loyalty=6;put(M,game,b,'Eidolon of Obstruction');assert.equal(game.activatableList(a).some(r=>r.card===walker),false);a.pool.C=1;const action=game.activatableList(a).find(r=>r.card===walker&&r.ability.loyalty===1);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(a.pool.C,0);await settle(game);const sun=put(M,game,a,'The Immortal Sun');walker.meta._loyUsed=-1;walker.meta.lcLoyaltyCount=0;assert.equal(game.canActivateLoyalty(walker),false);M.OracleV8AbilityLoss.add(game,[sun],{});assert.equal(game.canActivateLoyalty(walker),true);assertGameStateInvariants(game);
 });
 test(role+': Mirror Gallery stops applying when its abilities are removed',async()=>{
  const f=context(M,role),{game,a}=f,gallery=put(M,game,a,'Mirror Gallery'),first=put(M,game,a,'Venser, Shaper Savant'),second=put(M,game,a,'Venser, Shaper Savant');await game.checkSBA();assert.equal(first.zone,'battlefield');assert.equal(second.zone,'battlefield');M.OracleV8AbilityLoss.add(game,[gallery],{});await game.checkSBA();assert.equal([first,second].filter(c=>c.zone==='battlefield').length,1);assertGameStateInvariants(game);
 });
 test(role+': actual damage history expires on a new turn and a new source object',async()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,a,'Wicked Akuba'),spec=c.def.abilities[0].targets[0];assert.equal(game.legalTargets(spec,c,a).includes(b),false);await game.damagePlayer(c,b,0);assert.equal(game.legalTargets(spec,c,a).includes(b),false);await game.damagePlayer(c,b,2);assert.equal(game.legalTargets(spec,c,a).includes(b),true);game.turnNo++;assert.equal(game.legalTargets(spec,c,a).includes(b),false);await game.damagePlayer(c,b,1);await game.move(c,'hand');await game.move(c,'battlefield',{ctrl:a});assert.equal(game.legalTargets(spec,c,a).includes(b),false);assertGameStateInvariants(game);
 });
 test(role+': Raid Bombardment remembers the attacked planeswalker after its attacker leaves',async()=>{
  const f=context(M,role),{game,a,b}=f;put(M,game,a,'Raid Bombardment');const attacker=put(M,game,a,'Llanowar Elves'),walker=put(M,game,b,"Chandra, Flame's Fury");walker.counters.loyalty=10;attacker.attacking=walker;await game.emit('attacks',{player:a,card:attacker,defender:walker});await game.flushTriggers();assert.equal(game.stack.length,1);await game.move(attacker,'exile');await settle(game);assert.equal(walker.counters.loyalty,9);assertGameStateInvariants(game);
 });
 test(role+': mana based on graveyard colors excludes another player and nonlegendary creatures',async()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,a,'The Grey Havens');put(M,game,a,'Grizzly Bears','graveyard');put(M,game,b,'Venser, Shaper Savant','graveyard');let options=game.manaSources(a).filter(s=>s.card===c).flatMap(s=>s.produce);assert.equal(options.some(o=>o.G||o.U),false);put(M,game,a,'Venser, Shaper Savant','graveyard');options=game.manaSources(a).filter(s=>s.card===c).flatMap(s=>s.produce);assert.equal(options.some(o=>o.U===1),true);assert.equal(options.some(o=>o.G),false);
 });
 test(role+': life exchange is all or nothing when the lower player cannot gain life',async()=>{
  const f=context(M,role),{game,a,b}=f;a.life=12;b.life=30;game.untilEffects.push({kind:'lifeGainProhibitionV9',players:[a],expires:'eot'});await cast(f,'Profane Transfusion',[a,b]);await settle(game);assert.equal(a.life,12);assert.equal(b.life,30);const horror=game.bf().find(c=>c.isToken&&c.hasSub('Horror'));assert.ok(horror);assert.equal(horror.power,18);assertGameStateInvariants(game);
 });
 test(role+': losing one life-exchange target prevents the exchange',async()=>{
  const f=context(M,role,2),{game,a,b,others}=f;a.life=12;b.life=30;await cast(f,'Profane Transfusion',[a,b]);b.lost=true;await settle(game);assert.equal(a.life,12);assert.equal(others[1].life,40);assertGameStateInvariants(game);
 });
 test(role+': keyword prohibitions beat later grants, and leave no restriction after their source leaves',async()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,a,'Archetype of Endurance'),target=put(M,game,b,'Grizzly Bears');M.E.grantUntilEOT(game,target,['hexproof']);assert.equal(target.kw('hexproof'),false);M.OracleV8AbilityLoss.add(game,[c],{});assert.equal(target.kw('hexproof'),true);assertGameStateInvariants(game);
 });
 test(role+': Exhaust can be used once per incarnation and grants its controller real activation triggers',async()=>{
  const f=context(M,role),{game,a}=f,c=put(M,game,a,"Rangers' Refueler");await activate(f,c,[],r=>r.ability?.exhaustV18);await settle(game);assert.equal(c.is('Creature'),true);assert.equal(c.plus1(),1);assert.equal(a.hand.length,1);assert.equal(game.activatableList(a).some(r=>r.card===c&&r.ability?.exhaustV18),false);await game.move(c,'hand');await game.move(c,'battlefield',{ctrl:a});await activate(f,c,[],r=>r.ability?.exhaustV18);await settle(game);assert.equal(c.plus1(),1);assert.equal(a.hand.length,2);assertGameStateInvariants(game);
 });
 test(role+': Repopulate shuffles only creatures in the targeted graveyard',async()=>{
  const f=context(M,role),{game,a,b}=f,creature=put(M,game,b,'Grizzly Bears','graveyard'),land=put(M,game,b,'Forest','graveyard'),own=put(M,game,a,'Grizzly Bears','graveyard');await cast(f,'Repopulate',[b]);await settle(game);assert.equal(creature.zone,'library');assert.equal(land.zone,'graveyard');assert.equal(own.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': Hurkyl returns artifacts owned by the target, including ones controlled elsewhere',async()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,b,'Sol Ring'),owned=put(M,game,a,'Sol Ring');c.ctrl=a;owned.ctrl=b;game.recalc();await cast(f,"Hurkyl's Recall",[b]);await settle(game);assert.equal(c.zone,'hand');assert.equal(b.hand.includes(c),true);assert.equal(owned.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': random discard is a mandatory paid additional cost and unavailable casts consume nothing',async()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,a,'Sonic Burst','hand');fund(a);assert.equal(await game.castSpell(a,c,{from:'hand'}),false);assert.equal(c.zone,'hand');const first=put(M,game,a,'Forest','hand'),second=put(M,game,a,'Island','hand');choose(a,(g,q)=>q.type==='chooseTargets'?[b]:undefined);assert.equal(await game.castSpell(a,c,{from:'hand'}),true);assert.equal([first,second].filter(x=>x.zone==='graveyard').length,1);assert.equal(game.stack.at(-1).card,c);await settle(game);assert.equal(b.life,36);assertGameStateInvariants(game);
 });
 test(role+': mandatory blight cannot be paid with a creature that forbids counters',async()=>{
  const f=context(M,role),{game,a}=f;put(M,game,a,'Tatterkite');const c=put(M,game,a,'Scarscale Ritual','hand');fund(a);const pool={...a.pool};assert.equal(await game.castSpell(a,c,{from:'hand'}),false);assert.deepEqual({...a.pool},pool);assert.equal(c.zone,'hand');assertGameStateInvariants(game);
 });
 test(role+': Search Party Captain counts its controller’s attackers even if an opponent attacked',()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,a,'Search Party Captain','hand');game.turnPlayer=b;b.turnState.oracleAttackersV10={turn:game.turnNo,count:4};assert.equal(game.spellCost(a,c,{}).generic,3);a.turnState.oracleAttackersV10={turn:game.turnNo,count:2};assert.equal(game.spellCost(a,c,{}).generic,1);
 });
 test(role+': Swift Silence draws only for spells actually countered',async()=>{
  const f=context(M,role),{game,a,b}=f,first=put(M,game,b,"Gaea's Revenge",'hand'),second=put(M,game,b,'Opt','hand');fund(b);game.turnPlayer=b;await game.castSpell(b,first,{from:'hand'});await game.castSpell(b,second,{from:'hand'});game.turnPlayer=a;await cast(f,'Swift Silence');await game.resolveTop();assert.equal(a.hand.length,1);assert.equal(second.zone,'graveyard');assert.equal(first.zone,'stack');await settle(game);assert.equal(first.zone,'battlefield');assertGameStateInvariants(game);
 });
}

