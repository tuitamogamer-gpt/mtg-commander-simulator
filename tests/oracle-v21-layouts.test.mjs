import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v21-layouts.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(c=>!M.DEFS[c.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9951,limit:absent.length,compilerVersion:21});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);M.initData(M.RAW_DATA);}
const fund=p=>{for(const c of ['W','U','B','R','G','C'])p.pool[c]=40;};
const token=(game,p,name)=>game.bf().find(c=>c.ctrl===p&&c.isToken&&c.name===name);
const choose=(p,test,value)=>{const prior=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>test(q)?value(q):prior(g,q);};
const levelUp=async(game,p,card,n)=>{const action=game.activatableList(p).find(r=>r.card===card&&r.ability?.label?.startsWith('Level '+n+' '));assert.ok(action);assert.equal(await game.activateAbility(p,action),true);await settle(game);assert.equal(M.OracleV20.classLevel(card),n);};
test('v21 staged and branching layouts consume the complete printed rules',()=>{
 for(const row of rows){assert.ok(semanticClass(row,{compilerVersion:21}).semanticClass,row.name);const mutated=row.card_faces?{...row,card_faces:row.card_faces.map((face,i)=>i?face:{...face,oracle_text:face.oracle_text+'\nDo an unsupported thing.'})}:{...row,oracle_text:row.oracle_text+'\nDo an unsupported thing.'};assert.equal(semanticClass(mutated,{compilerVersion:21}).semanticClass,undefined,row.name);}
});
for(const role of ['human','ai']){
 test(role+': a tapped Fish Gift is a blue 1/1 and resolves before the promised exile body',async()=>{
  const {game,a,b}=context(M,role);fund(a);const source=put(M,game,a,'Parting Gust','hand'),victim=put(M,game,b,'Grizzly Bears');
  assert.equal(await game.castSpell(a,source,{from:'hand',alt:{bdfGift:true},quickTargets:[victim]}),true);await settle(game);
  const fish=game.bf().find(c=>c.ctrl===b&&c.isToken&&c.hasSub('Fish'));assert.ok(fish);assert.equal(fish.name,'Fish Token');assert.equal(fish.tapped,true);assert.equal(fish.power,1);assert.equal(fish.toughness,1);assert.deepEqual(Array.from(fish.colors),['U']);assert.equal(victim.zone,'exile');assertGameStateInvariants(game);
 });
 test(role+': Avengers damages non-Villain creatures and every opponent while its Villains survive',async()=>{
  const {game,a,b,others}=context(M,role,2);fund(a);const source=put(M,game,a,'Avengers: Under Siege','hand'),friendly=put(M,game,a,'Grizzly Bears'),hostile=put(M,game,b,'Grizzly Bears');
  for(const c of [friendly,hostile])c.def={...c.def,toughness:'6'};game.recalc();const life=new Map(game.players.map(p=>[p,p.life]));
  assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);const villains=game.bf().filter(c=>c.ctrl===a&&c.hasSub('Villain'));assert.equal(villains.length,2);
  await game.advanceSagas(a);await settle(game);assert.equal(friendly.damage,2);assert.equal(hostile.damage,2);for(const c of villains){assert.equal(c.zone,'battlefield');assert.equal(c.damage,0);}for(const p of [b,...others])assert.equal(p.life,life.get(p)-2);assert.equal(a.life,life.get(a));
  await game.advanceSagas(a);await settle(game);assert.equal(game.bf().filter(c=>c.ctrl===a&&c.hasSub('Treasure')).length,2);assert.equal(source.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': a Saga transforms by exiling and returning its physical card and exposes only the back mana ability',async()=>{
  const {game,a}=context(M,role);fund(a);const source=put(M,game,a,'Life of Toshiro Umezawa // Memory of Toshiro','hand'),bear=put(M,game,a,'Grizzly Bears');
  choose(a,q=>q.type==='chooseOption'&&q.aiHint?.kind==='mode',()=> '0');choose(a,q=>q.type==='chooseTargets'&&q.candidates.includes(bear),()=>[bear]);
  assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);assert.equal(bear.power,4);await game.advanceSagas(a);await settle(game);assert.equal(bear.power,6);
  const version=source.zoneVersion;await game.advanceSagas(a);await settle(game);assert.equal(source.zone,'battlefield');assert.equal(source.oracleFace,'back');assert.equal(source.name,'Memory of Toshiro');assert.equal(source.zoneVersion,version+2);assert.equal(source.counters.lore||0,0);assert.equal(source.power,2);assert.equal(source.toughness,3);
  source.sick=false;const mana=game.manaSources(a).find(r=>r.card===source);assert.ok(mana);const life=a.life,pool=a.pool.B;assert.equal(await game.activateManaSource(a,mana,mana.produce[0],{card:put(M,game,a,'Opt','hand')}),true);assert.equal(a.life,life-1);assert.equal(a.pool.B,pool+1);assertGameStateInvariants(game);
 });
 test(role+': Bard Class gives legendary entrants an additional counter and activates only paid levels',async()=>{
  const {game,a}=context(M,role);fund(a);const source=put(M,game,a,'Bard Class','hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);
  const legendary=put(M,game,a,'Grizzly Bears','hand');legendary.def={...legendary.def,name:'Legendary Bard witness',super:['Legendary'],cost:'{1}{R}{G}'};assert.equal(await game.castSpell(a,legendary,{from:'hand'}),true);await settle(game);assert.equal(legendary.counters['+1/+1'],1);
  await levelUp(game,a,source,2);const other=put(M,game,a,'Grizzly Bears','hand');other.def={...other.def,name:'Other legendary witness',super:['Legendary'],cost:'{1}{R}{G}'};assert.deepEqual(Array.from(game.spellCost(a,other).oracleColoredReductionV20,r=>r.color),['R','G']);assert.equal(game.spellCost(a,other).generic,1);
  await levelUp(game,a,source,3);const top=put(M,game,a,'Opt','library'),land=put(M,game,a,'Forest','library');for(const color of Object.keys(a.pool))a.pool[color]=0;a.pool.C=1;assert.equal(await game.castSpell(a,other,{from:'hand'}),true);assert.equal(Object.values(a.pool).reduce((n,x)=>n+x,0),0);await settle(game);assert.equal(top.zone,'exile');assert.equal(land.zone,'exile');assert.equal(game.hasExilePlayPermission(a,top),true);
  await game.move(source,'hand');await game.move(source,'battlefield',{ctrl:a});assert.equal(M.OracleV20.classLevel(source),1);const next=put(M,game,a,'Grizzly Bears','hand');next.def={...next.def,super:['Legendary'],cost:'{1}{R}{G}'};assert.equal(game.spellCost(a,next).pips.length,2);assertGameStateInvariants(game);
 });
 test(role+': Paladin Class taxes opponents only during its controller turn and counts other attackers',async()=>{
  const {game,a,b,others}=context(M,role,2);fund(a);fund(b);const source=put(M,game,a,'Paladin Class','hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);
  const spell=put(M,game,b,'Opt','hand');assert.equal(game.spellCost(b,spell).generic,1);game.turnPlayer=b;assert.equal(game.spellCost(b,spell).generic,0);game.turnPlayer=a;assert.equal(game.spellCost(others[1],spell).generic,1);
  await levelUp(game,a,source,2);const bear=put(M,game,a,'Grizzly Bears'),other=put(M,game,a,'Grizzly Bears');assert.equal(bear.power,3);await levelUp(game,a,source,3);bear.attacking=b;other.attacking=b;game.combat={attackers:[bear,other],defenders:new Map()};choose(a,q=>q.type==='chooseTargets'&&q.candidates.includes(bear),()=>[bear]);await game.emit('attackersDeclared',{player:a,attackers:[bear,other]});await settle(game);assert.equal(bear.power,4);assert.equal(bear.toughness,4);assert.equal(bear.kw('double strike'),true);assert.equal(other.power,3);assertGameStateInvariants(game);
 });
 test(role+': Monk Class retains exile access but permits casting only after another spell this turn',async()=>{
  const {game,a,b}=context(M,role);fund(a);const source=put(M,game,a,'Monk Class','hand'),victim=put(M,game,b,'Grizzly Bears');choose(a,q=>q.type==='chooseTargets'&&q.candidates.includes(victim),()=>[victim]);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);await levelUp(game,a,source,2);assert.equal(victim.zone,'hand');await levelUp(game,a,source,3);
  const top=put(M,game,a,'Opt','library');a.turnState.spellsCast=0;a.turnState.spellsCastList=[];await game.emit('upkeep',{player:a});await settle(game);assert.equal(top.zone,'exile');assert.equal(game.castableList(a).some(r=>r.card===top),false);assert.equal(await game.castSpell(a,top,{from:'exile'}),false);
  const first=put(M,game,a,'Grizzly Bears','hand');assert.equal(await game.castSpell(a,first,{from:'hand'}),true);await settle(game);assert.ok(game.castableList(a).some(r=>r.card===top));assert.equal(await game.castSpell(a,top,{from:'exile'}),true);await settle(game);assert.equal(top.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': Gift uses its announced branch, gives the selected opponent its Treasure before the printed body, and keeps the branch on copies',async()=>{
  for(const promise of [false,true]){
   const {game,a,b,others}=context(M,role,2);fund(a);const source=put(M,game,a,'Blooming Blast','hand'),victim=put(M,game,b,'Grizzly Bears'),recipient=others[1];victim.def={...victim.def,toughness:'10'};game.recalc();
   choose(a,q=>q.type==='chooseOption'&&q.options.some(o=>o.key===String(recipient.idx)),()=>String(recipient.idx));
   const beforeHand=recipient.hand.length,beforeLife=b.life;
   assert.equal(await game.castSpell(a,source,{from:'hand',alt:promise?{bdfGift:true}:undefined,quickTargets:[victim]}),true);const original=game.stack.find(o=>o.card===source);assert.equal(!!original.castOpts.bdfGift,promise);
   if(promise){assert.equal(original.bdfGiftPlayer,recipient.idx);await game.copySpell(original,a,{mayNewTargets:false});}
   await settle(game);assert.equal(recipient.hand.length,beforeHand);assert.equal(game.bf().filter(c=>c.ctrl===recipient&&c.isToken&&c.hasSub('Treasure')).length,promise?2:0);assert.equal(victim.damage,promise?4:2);assert.equal(beforeLife-b.life,promise?6:0);assert.equal(source.zone,'graveyard');assertGameStateInvariants(game);
  }
 });
 test(role+': a countered Gift spell gives no gift and a promised gift retains its branch after the selected opponent leaves',async()=>{
  const {game,a,b,others}=context(M,role,2);fund(a);const victim=put(M,game,b,'Grizzly Bears');victim.def={...victim.def,toughness:'10'};game.recalc();const recipient=others[1];choose(a,q=>q.type==='chooseOption'&&q.options.some(o=>o.key===String(recipient.idx)),()=>String(recipient.idx));
  const countered=put(M,game,a,'Blooming Blast','hand'),hand=recipient.hand.length;assert.equal(await game.castSpell(a,countered,{from:'hand',alt:{bdfGift:true},quickTargets:[victim]}),true);const so=game.stack.find(o=>o.card===countered);await game.counterStackObject(so);await settle(game);assert.equal(recipient.hand.length,hand);assert.equal(token(game,recipient,'Treasure'),undefined);assert.equal(victim.damage,0);
  const cast=put(M,game,a,'Blooming Blast','hand');assert.equal(await game.castSpell(a,cast,{from:'hand',alt:{bdfGift:true},quickTargets:[victim]}),true);recipient.lost=true;const life=b.life;await settle(game);assert.equal(recipient.hand.length,hand);assert.equal(victim.damage,2);assert.equal(life-b.life,3);assertGameStateInvariants(game);
 });
 test(role+': Read ahead skips earlier chapters, advances normally, and asks again for a new battlefield object',async()=>{
  const {game,a}=context(M,role);fund(a);choose(a,q=>q.aiHint?.kind==='readAhead',()=> '2');const saga=put(M,game,a,'The Weatherseed Treaty','hand'),queued=[],queue=game.queueTrigger;
  game.queueTrigger=function(row){if(row.sagaChapter?.iid===saga.iid)queued.push(row.data.chapter);return queue.call(this,row);};
  assert.equal(await game.castSpell(a,saga,{from:'hand'}),true);await game.resolveTop();assert.equal(saga.counters.lore,2);assert.deepEqual(queued,[2]);await settle(game);assert.ok(game.creatures(a).some(c=>c.hasSub('Saproling')));assert.equal(game.lands(a).length,0);
  queued.length=0;await game.advanceSagas(a);assert.deepEqual(queued,[3]);await settle(game);assert.equal(saga.zone,'graveyard');await game.move(saga,'battlefield',{ctrl:a});assert.equal(saga.counters.lore,2);await settle(game);assertGameStateInvariants(game);
 });
 test(role+': Homura returns physically flipped from its first death and cannot return a later graveyard incarnation',async()=>{
  const {game,a}=context(M,role);fund(a);const name="Homura, Human Ascendant // Homura's Essence",homura=put(M,game,a,name),bear=put(M,game,a,'Grizzly Bears');await game.destroy(homura);await settle(game);assert.equal(homura.zone,'battlefield');assert.equal(homura.name,"Homura's Essence");assert.equal(bear.power,4);assert.equal(bear.kw('flying'),true);assert.ok(game.activatableList(a).some(row=>row.card===bear&&row.ability?.cost?.mana==='{R}'));
  await game.move(homura,'hand');await game.move(homura,'battlefield',{ctrl:a});await game.destroy(homura);await game.flushTriggers();assert.ok(game.stack.length);await game.move(homura,'exile');await game.move(homura,'graveyard');await settle(game);assert.equal(homura.zone,'graveyard');assert.equal(bear.power,2);assertGameStateInvariants(game);
 });
 test(role+': mandatory Waterbend adds the printed mana and allows only its generic amount to be replaced by tapping artifacts or creatures',async()=>{
  const {game,a}=context(M,role),source=put(M,game,a,'Benevolent River Spirit','hand'),donors=[];
  a.pool.U=2;for(let i=0;i<5;i++){const donor=put(M,game,a,'Grizzly Bears');donor.sick=true;donors.push(donor);}const cost=game.spellCost(a,source,{from:'hand'});assert.equal(cost.generic,5);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);assert.equal(donors.filter(c=>c.tapped).length,5);assert.equal(a.pool.U,0);await settle(game);assert.equal(source.zone,'battlefield');assert.equal(source.kw('flying'),true);assertGameStateInvariants(game);
 });
 test(role+': Seek the Beast permits its cards through opponents end steps and expires as the caster next end step begins',async()=>{
  const {game,a,b}=context(M,role);fund(a);const top=put(M,game,a,'Opt','library'),land=put(M,game,a,'Forest','library'),source=put(M,game,a,'Questing Druid // Seek the Beast','hand');
  assert.equal(await game.castSpell(a,source,{from:'hand',alt:{adventure:true}}),true);await settle(game);assert.equal(source.zone,'exile');assert.equal(source.meta.adventureExiled,true);assert.equal(top.zone,'exile');assert.equal(land.zone,'exile');assert.ok(game.castableList(a).some(r=>r.card===top));assert.ok(game.playableLands(a).includes(land));
  await game.emit('endStep',{player:b});await settle(game);assert.equal(game.hasExilePlayPermission(a,top),true);await game.emit('endStep',{player:a});assert.equal(game.hasExilePlayPermission(a,top),false);assert.equal(game.hasExilePlayPermission(a,land),false);assert.equal(game.pendingTriggers.some(r=>r.name==='Exile play permission expires'),false);assert.equal(await game.castSpell(a,source,{from:'exile'}),true);await settle(game);assert.equal(source.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': Expensive Taste grants lasting face-down access to the caster and never to the card owner or a later exile object',async()=>{
  const {game,a,b}=context(M,role);fund(a);const spell=put(M,game,b,'Opt','library'),land=put(M,game,b,'Forest','library'),source=put(M,game,a,'Decadent Dragon // Expensive Taste','hand');
  assert.equal(await game.castSpell(a,source,{from:'hand',alt:{adventure:true},quickTargets:[b]}),true);await settle(game);for(const card of [spell,land]){assert.equal(card.zone,'exile');assert.equal(card.faceDown,true);assert.ok(card.meta.revealedTo.includes(a.idx));assert.equal(card.meta.revealedTo.includes(b.idx),false);assert.equal(game.hasExilePlayPermission(a,card),true);assert.equal(game.hasExilePlayPermission(b,card),false);}
  game.turnNo+=10;await game.emit('endStep',{player:a});assert.equal(game.hasExilePlayPermission(a,spell),true);const offered=game.castableList(a).find(r=>r.card===spell);assert.ok(offered);assert.equal(await game.castSpell(a,spell,{from:offered.from,alt:offered.alt}),true);await settle(game);assert.equal(spell.zone,'graveyard');assert.ok(b.graveyard.includes(spell));
  await game.move(land,'hand');await game.move(land,'exile');assert.equal(game.hasExilePlayPermission(a,land),false);assertGameStateInvariants(game);
 });
}
