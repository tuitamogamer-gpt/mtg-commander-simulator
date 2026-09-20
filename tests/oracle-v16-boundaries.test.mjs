import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v16-compositions.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9934,limit:absent.length,compilerVersion:16});M.registerOracleBatch(plan.report);}
M.initData(M.RAW_DATA);
function choose(player,handler){const prior=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>{const result=handler(g,q);return result===undefined?prior(g,q):result;};}
function fund(player){for(const color of ['W','U','B','R','G','C'])player.pool[color]=40;}
async function cast(f,name,targets=[]){const card=put(M,f.game,f.a,name,'hand');fund(f.a);choose(f.a,(g,q)=>q.type==='chooseTargets'?targets.filter(target=>q.candidates.includes(target)).slice(0,q.max??q.count??1):undefined);assert.equal(await f.game.castSpell(f.a,card,{from:'hand'}),true,name);return card;}
function tribe(f,player,name,type){const card=put(M,f.game,player,name);card.def={...card.def,subtypes:[type]};f.game.recalc();return card;}
test('v16 requires complete source text and rejects unbound chosen types',()=>{
 for(const card of rows){assert.ok(semanticClass(card,{compilerVersion:16}).semanticClass,card.name);assert.equal(semanticClass({...card,...(card.card_faces?{card_faces:card.card_faces.map(face=>({...face,oracle_text:face.oracle_text+'\nDo an unsupported thing.'}))}:{oracle_text:card.oracle_text+'\nDo an unsupported thing.'})},{compilerVersion:16}).semanticClass,undefined,card.name);}
 assert.equal(semanticClass({name:'Unbound choice',layout:'normal',type_line:'Enchantment',mana_cost:'{W}',oracle_text:'Creatures of the chosen type get +1/+1.'},{compilerVersion:16}).semanticClass,undefined);
});
for(const role of ['human','ai']){
 test(role+': announced counters are not reassigned after one target leaves',async()=>{
  const f=context(M,role),{game,a}=f,one=put(M,game,a,'Grizzly Bears'),two=put(M,game,a,'Grizzly Bears');choose(a,(g,q)=>q.allocation?q.min:undefined);
  await cast(f,'Blessings of Nature',[one,two]);const item=game.stack.at(-1);assert.deepEqual(Array.from(item.damageDivision||item.ctx.damageDivision,row=>row.n),[1,3]);
  await game.move(two,'hand');await settle(game);assert.equal(one.counters['+1/+1'],1);assert.equal(two.counters['+1/+1']||0,0);assert.equal(one.damage,0);assertGameStateInvariants(game);
 });
 test(role+': the affected player orders Vortex and Remedy replacements',async()=>{
  for(const first of ['Tainted Remedy','Sulfuric Vortex']){const f=context(M,role),{game,a,b}=f;put(M,game,b,'Tainted Remedy');put(M,game,b,'Sulfuric Vortex');choose(a,(g,q)=>q.aiHint?.kind==='replacementOrder'?q.options.find(row=>row.source.name===first).key:undefined);const before=a.life;
   assert.equal(await game.gainLife(a,4),0);assert.equal(before-a.life,first==='Tainted Remedy'?4:0);assertGameStateInvariants(game);
  }
 });
 test(role+': joint ward costs spend nothing when the life payment is impossible',async()=>{
  const f=context(M,role),{game,a,b}=f,source=put(M,game,b,'Ovika, Enigma Goliath');choose(a,(g,q)=>q.aiHint?.kind==='oracleUnlessPayment'?'yes':undefined);const spell=await cast(f,'Beast Within',[source]);
  for(const color of Object.keys(a.pool))a.pool[color]=0;a.pool.C=3;a.life=2;await game.resolveTop();assert.equal(spell.zone,'graveyard');assert.equal(a.pool.C,3);assert.equal(a.life,2);assert.equal(source.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': subtype spell history is captured at casting time',async()=>{
  const f=context(M,role),{game,a}=f;put(M,game,a,'Phyrexian Censor');const exempt=put(M,game,a,'Grizzly Bears','hand');exempt.def={...exempt.def,subtypes:['Phyrexian']};fund(a);
  assert.equal(await game.castSpell(a,exempt,{from:'hand'}),true);await settle(game);exempt.def={...exempt.def,subtypes:['Bear']};game.recalc();
  await cast(f,'Grizzly Bears');await settle(game);const denied=put(M,game,a,'Grizzly Bears','hand');assert.equal(game.canCastTiming(a,denied),false);assert.equal(await game.castSpell(a,denied,{from:'hand'}),false);assert.equal(denied.zone,'hand');assertGameStateInvariants(game);
 });
 test(role+': Zubera deaths include tokens and use their departing creature types',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Floating-Dream Zubera'),ordinary=put(M,game,a,'Grizzly Bears');const token=(await game.makeTokens({...M.DEFS['Grizzly Bears'],name:'Zubera witness',subtypes:['Zubera']},a,{n:1}))[0],before=a.hand.length;
  await game.destroyMany([source,ordinary,token]);await settle(game);assert.equal(a.hand.length-before,2);assert.equal(token.zone,'ceased');assert.equal(game.diedThisTurn.length,3);assertGameStateInvariants(game);
 });
 test(role+': exile rewards the last controller even for an indestructible token',async()=>{
  const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Craw Wurm');source.ctrl=b;source.def={...source.def,kws:['indestructible']};game.recalc();
  await cast(f,'Hour of Need',[source]);await settle(game);assert.equal(source.zone,'exile');assert.equal(game.creatures(a).filter(c=>c.isToken&&c.hasSub('Sphinx')).length,0);assert.equal(game.creatures(b).filter(c=>c.isToken&&c.hasSub('Sphinx')).length,1);assertGameStateInvariants(game);
 });
 test(role+': Forest animation expires with its source and preserves counters',async()=>{
  const f=context(M,role),{game,a,b}=f,forest=put(M,game,a,'Forest'),enemy=put(M,game,b,'Forest'),source=put(M,game,a,'Ambush Commander');game.addCounters(forest,'+1/+1',2);game.recalc();
  assert.equal(forest.is('Land'),true);assert.equal(forest.is('Creature'),true);assert.equal(forest.hasSub('Elf'),true);assert.equal(forest.power,3);assert.equal(enemy.is('Creature'),false);
  await game.move(source,'exile');assert.equal(forest.is('Creature'),false);assert.equal(forest.is('Land'),true);assert.equal(forest.counters['+1/+1'],2);assertGameStateInvariants(game);
 });
 test(role+': a chosen creature type applies globally and is chosen again on reentry',async()=>{
  const f=context(M,role,2),{game,a,b}=f,elf=tribe(f,a,'Craw Wurm','Elf'),enemy=tribe(f,b,'Craw Wurm','Elf'),goblin=tribe(f,a,'Craw Wurm','Goblin');let selected='Elf';choose(a,(g,q)=>q.aiHint?.kind==='chooseType'?selected:undefined);
  const source=await cast(f,'Shared Triumph');await settle(game);assert.equal(M.oracleChosenSubtypeV16(source),'Elf');assert.deepEqual([elf.power,enemy.power,goblin.power],[7,7,6]);
  await game.move(source,'exile');assert.deepEqual([elf.power,enemy.power,goblin.power],[6,6,6]);selected='Goblin';await game.move(source,'battlefield');await settle(game);assert.deepEqual([elf.power,enemy.power,goblin.power],[6,6,7]);assertGameStateInvariants(game);
 });
 test(role+': Adaptive Automaton adds the type to itself and excludes itself from its bonus',async()=>{
  const f=context(M,role),{game,a}=f,ally=tribe(f,a,'Craw Wurm','Elf');choose(a,(g,q)=>q.aiHint?.kind==='chooseType'?'Elf':undefined);const source=await cast(f,'Adaptive Automaton');await settle(game);assert.equal(source.hasSub('Elf'),true);assert.equal(source.hasSub('Construct'),true);assert.equal(source.power,2);assert.equal(ally.power,7);assertGameStateInvariants(game);
 });
 test(role+': Belbe’s Portal captures the entry choice before the source blinks',async()=>{
  const f=context(M,role),{game,a}=f;let selected='Elf';choose(a,(g,q)=>q.aiHint?.kind==='chooseType'?selected:undefined);const source=await cast(f,"Belbe's Portal");await settle(game);
  const elf=put(M,game,a,'Llanowar Elves','hand'),goblin=put(M,game,a,'Craw Wurm','hand');goblin.def={...goblin.def,subtypes:['Goblin']};choose(a,(g,q)=>q.type==='chooseCards'&&q.from.includes(elf)?[elf]:undefined);fund(a);source.sick=false;const action=game.activatableList(a).find(row=>row.card===source);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);
  await game.move(source,'exile');selected='Goblin';await game.move(source,'battlefield');await settle(game);assert.equal(elf.zone,'battlefield');assert.equal(goblin.zone,'hand');assert.equal(M.oracleChosenSubtypeV16(source),'Goblin');assertGameStateInvariants(game);
 });
 test(role+': Brass Herald retains its choice when its source leaves before resolution',async()=>{
  const f=context(M,role),{game,a}=f;choose(a,(g,q)=>q.aiHint?.kind==='chooseType'?'Elf':undefined);const source=await cast(f,'Brass Herald');await game.resolveTop();
  const elf=put(M,game,a,'Llanowar Elves','library'),goblin=put(M,game,a,'Craw Wurm','library'),land=put(M,game,a,'Forest','library');await game.move(source,'exile');await settle(game);assert.equal(elf.zone,'hand');assert.equal(goblin.zone,'library');assert.equal(land.zone,'library');assertGameStateInvariants(game);
 });
 test(role+': a type bonus is suppressed by actual source ability loss',async()=>{
  const f=context(M,role),{game,a}=f,elf=tribe(f,a,'Craw Wurm','Elf');choose(a,(g,q)=>q.aiHint?.kind==='chooseType'?'Elf':undefined);const source=await cast(f,'Instruments of War');await settle(game);assert.equal(elf.power,7);M.OracleV8AbilityLoss.add(game,[source],{temporary:true,keywords:[]});game.recalc();assert.equal(elf.power,6);assertGameStateInvariants(game);
 });
 test(role+': Renounce and Last-Ditch Effort count only chosen sacrifices including tokens',async()=>{
  for(const name of ['Renounce','Last-Ditch Effort'])for(const n of [0,2]){
   const f=context(M,role),{game,a,b}=f,one=put(M,game,a,'Craw Wurm'),two=(await game.makeTokens({...M.DEFS['Grizzly Bears'],name:'Soldier witness',subtypes:['Soldier'],power:'1',toughness:'1'},a,{n:1}))[0],other=put(M,game,a,'Forest');const picked=[one,two].slice(0,n);choose(a,(g,q)=>q.prompt==='Choose permanents to sacrifice'?picked:undefined);const life=[a.life,b.life];await cast(f,name,[b]);await settle(game);assert.equal(a.life-life[0],name==='Renounce'?2*n:0);assert.equal(life[1]-b.life,name==='Last-Ditch Effort'?n:0);assert.equal(other.zone,'battlefield');assert.equal(two.zone,n===2?'ceased':'battlefield');assertGameStateInvariants(game);
  }
 });
 test(role+': tapping for a result excludes already tapped and unchosen creatures',async()=>{
  for(const name of ['Harmony of Nature','Devout Invocation'])for(const n of [0,2]){
   const f=context(M,role),{game,a}=f,one=put(M,game,a,'Craw Wurm'),two=put(M,game,a,'Grizzly Bears'),old=put(M,game,a,'Grizzly Bears'),other=put(M,game,a,'Llanowar Elves');old.tapped=true;const picked=[one,two].slice(0,n);choose(a,(g,q)=>q.prompt==='Choose permanents to tap'?picked:undefined);const life=a.life;await cast(f,name);await settle(game);assert.equal(a.life-life,name==='Harmony of Nature'?4*n:0);assert.equal(game.creatures(a).filter(c=>c.isToken&&c.hasSub('Angel')).length,name==='Devout Invocation'?n:0);assert.equal(other.tapped,false);assert.equal(old.tapped,true);assertGameStateInvariants(game);
  }
 });
 test(role+': March of Souls uses the last controller and skips indestructible creatures',async()=>{
  const f=context(M,role,2),{game,a,b,others}=f,stolen=put(M,game,a,'Craw Wurm'),ordinary=put(M,game,a,'Grizzly Bears'),shielded=put(M,game,others[1],'Craw Wurm');stolen.ctrl=b;ordinary.regenShield=1;shielded.def={...shielded.def,kws:['indestructible']};game.recalc();await cast(f,'March of Souls');await settle(game);assert.equal(stolen.zone,'graveyard');assert.equal(ordinary.zone,'graveyard');assert.equal(shielded.zone,'battlefield');assert.deepEqual(Array.from(game.players,p=>game.creatures(p).filter(c=>c.isToken&&c.hasSub('Spirit')).length),[1,1,0]);assertGameStateInvariants(game);
 });
 test(role+': Rampage preserves a regenerating artifact without giving its controller a token',async()=>{
  const f=context(M,role),{game,a,b}=f,artifact=put(M,game,a,'Ornithopter'),enemy=put(M,game,b,'Ornithopter');artifact.regenShield=1;await cast(f,'Rampage of the Clans');await settle(game);assert.equal(artifact.zone,'battlefield');assert.equal(artifact.regenShield,0);assert.equal(enemy.zone,'graveyard');assert.deepEqual(Array.from(game.players,p=>game.creatures(p).filter(c=>c.isToken&&c.hasSub('Centaur')).length),[0,1]);assertGameStateInvariants(game);
 });
 test(role+': Scapeshift searches for at most the actual number of lands sacrificed',async()=>{
  const f=context(M,role),{game,a}=f,one=put(M,game,a,'Forest'),two=put(M,game,a,'Island'),other=put(M,game,a,'Mountain');choose(a,(g,q)=>q.prompt==='Choose permanents to sacrifice'?[one,two]:q.search?q.from.slice(0,Math.min(2,q.max)):undefined);await cast(f,'Scapeshift');await settle(game);assert.equal(one.zone,'graveyard');assert.equal(two.zone,'graveyard');assert.equal(other.zone,'battlefield');assert.equal(game.bf().filter(c=>c.ctrl===a&&c.is('Land')&&c!==other).length,2);assert.equal(game.bf().filter(c=>c.ctrl===a&&c.is('Land')&&c!==other).every(c=>c.tapped),true);assertGameStateInvariants(game);
 });
}
