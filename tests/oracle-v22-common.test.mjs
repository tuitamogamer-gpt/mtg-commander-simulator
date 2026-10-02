import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import * as v22 from '../scripts/oracle-extensions-v22.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v22-common.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(row=>!M.DEFS[row.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9952,limit:absent.length,compilerVersion:22});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);M.initData(M.RAW_DATA);}
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=100;};
async function event(ctx,name){
 const {game,a}=ctx;
 if(name==='Belladonna Took'){await game.makeTokens(M.TOKENS.soldier11||{name:'Soldier',types:['Creature'],subtypes:['Soldier'],power:'1',toughness:'1',kws:[],cost:'',colorsOverride:['W']},a);}
 else if(name==='Vito, Fanatic of Aclazotz'){const card=put(M,game,a,'Grizzly Bears');await game.sacrifice(a,card);}
 else {const card=put(M,game,a,name==='Tannuk, Memorial Ensign'?'Forest':'Grizzly Bears','hand');if(name==='Harvestrite Host'||name==='South Pole Voyager')card.def={...card.def,subtypes:[name==='Harvestrite Host'?'Rabbit':'Ally'],toughness:'30'};if(name==='Teething Wurmlet')card.def={...card.def,types:['Artifact'],power:undefined,toughness:undefined};await game.move(card,'battlefield',{ctrl:a});}
 await settle(game);
}
const basic=rows.filter(row=>!['Soulbright Flamekin','Soulbright Seeker','Ashling, Flame Dancer','Omnath, Locus of Mana','Omnath, Locus of Creation','Nissa, Resurgent Animist'].includes(row.name));
for(const role of ['human','ai'])for(const row of basic)test(role+': '+row.name+' counts completed resolutions through the first four events',async()=>{
 const ctx=context(M,role),{game,a,b}=ctx,source=put(M,game,a,row.name),ally=put(M,game,a,'Grizzly Bears');fund(a);
 const prior=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'?[ally]:prior(g,q);
 const life=a.life,hand=a.hand.length,opponentLife=b.life,base=ally.power;
 for(let ordinal=1;ordinal<=4;ordinal++){
  if(row.name==='Inner-Flame Igniter'){const action=game.activatableList(a).find(item=>item.card===source&&item.ability);assert.ok(action);const red=a.pool.R;assert.equal(await game.activateAbility(a,action),true);assert.equal(a.pool.R,red-1);await settle(game);}else await event(ctx,row.name);
  if(row.name==='Belladonna Took'){assert.equal(a.life,life+1);assert.equal(a.hand.length,hand+Number(ordinal>=2));assert.equal(ally.counters['+1/+1']||0,Number(ordinal>=3));}
  if(row.name==='Vito, Fanatic of Aclazotz'){assert.equal(a.life,life+2);assert.equal(b.life,opponentLife-(ordinal>=2?2:0));assert.equal(game.bf().filter(card=>card.isToken&&card.hasSub('Demon')).length,Number(ordinal>=3));}
  if(row.name==='Teething Wurmlet'){assert.equal(a.life,life+ordinal);assert.equal(source.counters['+1/+1'],1);}
  if(row.name==='South Pole Voyager'){assert.equal(a.life,life+ordinal);assert.equal(a.hand.length,hand+Number(ordinal>=2));}
  if(row.name==='Tannuk, Memorial Ensign'){assert.equal(b.life,opponentLife-ordinal);assert.equal(a.hand.length,hand+Number(ordinal>=2));}
  if(row.name==='Harvestrite Host'){assert.equal(ally.power,base+ordinal);assert.equal(a.hand.length,hand+Number(ordinal>=2));}
  if(row.name==='Venom Connoisseur'){assert.equal(source.kw('deathtouch'),true);assert.equal(ally.kw('deathtouch'),ordinal>=2);}
  if(row.name==='Inner-Flame Igniter'){assert.equal(ally.power,base+ordinal);assert.equal(ally.kw('first strike'),ordinal>=3);}
  assertGameStateInvariants(game);
 }
 game.turnNo++;const resetLife=a.life,resetHand=a.hand.length;
 if(row.name!=='Inner-Flame Igniter')await event(ctx,row.name);
 if(['Belladonna Took','Vito, Fanatic of Aclazotz','Teething Wurmlet','South Pole Voyager'].includes(row.name))assert.ok(a.life>resetLife);
 if(['Belladonna Took','South Pole Voyager','Tannuk, Memorial Ensign','Harvestrite Host'].includes(row.name))assert.equal(a.hand.length,resetHand);
});
for(const role of ['human','ai']){
 test(role+': Soulbright targeted mana uses the Stack and counts only resolved abilities',async()=>{
  const ctx=context(M,role),{game,a}=ctx,source=put(M,game,a,'Soulbright Flamekin'),ally=put(M,game,a,'Grizzly Bears');fund(a);a.pool.R=0;
  const prior=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'?[ally]:q.type==='chooseOption'&&q.aiHint?.kind==='optTrigger'?'yes':prior(g,q);
  const action=()=>game.activatableList(a).find(item=>item.card===source&&item.ability);
  assert.equal(await game.activateAbility(a,action()),true);assert.equal(game.stack.length,1);await game.move(ally,'exile');await settle(game);assert.equal(a.pool.R,0);
  await game.move(ally,'battlefield',{ctrl:a});await settle(game);
  for(let n=1;n<=4;n++){assert.equal(await game.activateAbility(a,action()),true);assert.equal(game.stack.length,1);await settle(game);assert.equal(ally.kw('trample'),true);assert.equal(a.pool.R,n>=3?8:0);}
  assertGameStateInvariants(game);
 });
 test(role+': Ashling retains restricted red mana and executes the exact ordinal branches',async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,source=put(M,game,a,'Ashling, Flame Dancer'),victim=put(M,game,b,'Grizzly Bears');victim.def={...victim.def,toughness:'20'};game.recalc();fund(a);a.pool.R=12;
  for(let n=0;n<5;n++)put(M,game,a,'Forest','hand');const hand=a.hand.length,life=b.life;
  const prior=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'?[b]:prior(g,q);
  for(let n=1;n<=4;n++){const shock=put(M,game,a,'Shock','hand');assert.equal(await game.castSpell(a,shock,{from:'hand'}),true);await settle(game);assert.equal(a.hand.length,hand);assert.equal(b.life,life-2*n-(n>=2?2:0));assert.equal(victim.damage,n>=2?2:0);assert.equal(a.pool.R,12-n+(n>=3?4:0));}
  a.poolMeta=[{color:'R',n:2,restricted:true,restriction:'creature'}];const red=a.pool.R;game.emptyPool();assert.equal(a.pool.R,red);assert.equal(a.pool.U,0);assert.equal(a.poolMeta[0].restriction,'creature');assert.equal(a.poolMeta[0].n,2);
  await game.move(source,'graveyard');await settle(game);game.emptyPool();assert.equal(a.pool.R,0);assert.equal(a.poolMeta.length,0);assertGameStateInvariants(game);
 });
 test(role+': Omnath resolves one life, mana and damage branch for four lands',async()=>{
  const ctx=context(M,role),{game,a,b}=ctx;put(M,game,a,'Omnath, Locus of Creation');const life=a.life,enemy=b.life;
  for(let n=1;n<=4;n++){const land=put(M,game,a,'Forest','hand');await game.move(land,'battlefield',{ctrl:a});await settle(game);assert.equal(a.life,life+4);assert.equal(a.pool.R,n>=2?1:0);assert.equal(a.pool.G,n>=2?1:0);assert.equal(b.life,enemy-(n>=3?4:0));}
  game.turnNo++;const land=put(M,game,a,'Forest','hand');await game.move(land,'battlefield',{ctrl:a});await settle(game);assert.equal(a.life,life+8);assertGameStateInvariants(game);
 });
 test(role+': Omnath Locus of Mana tracks retained green mana continuously',async()=>{
  const {game,a,b}=context(M,role),source=put(M,game,a,'Omnath, Locus of Mana');a.pool.G=4;a.pool.R=3;b.pool.G=2;game.recalc();assert.equal(source.power,5);assert.equal(source.toughness,5);
  game.emptyPool();game.recalc();assert.equal(a.pool.G,4);assert.equal(a.pool.R,0);assert.equal(b.pool.G,0);assert.equal(source.power,5);
  assert.equal(await game.payMana(a,M.parseCost('{G}'),{card:source}),true);game.recalc();assert.equal(source.power,4);assertGameStateInvariants(game);
 });
 test(role+': graveyard history tracks the exact current incarnation and origin',async()=>{
  const {game,a,b}=context(M,role),source=put(M,game,a,'Forest'),card=put(M,game,a,'Grizzly Bears');fund(a);
  const base={what:'card',zone:'graveyard',controller:'you',min:1};
  const fromBattlefield=M.OracleV20.helpers.genericTargetSpec({...base,v20:{kind:'common-current-grave-v22',origin:'battlefield'}},[],0);
  const discarded=M.OracleV20.helpers.genericTargetSpec({...base,v20:{kind:'common-current-grave-v22',origin:'discard-or-cycle'}},[],0);
  const accepts=spec=>game.legalTargets(spec,source,a).includes(card);
  await game.move(card,'graveyard');assert.equal(accepts(fromBattlefield),true);assert.equal(accepts(discarded),false);
  await game.move(card,'exile');await game.move(card,'graveyard');assert.equal(accepts(fromBattlefield),false);
  await game.move(card,'hand');await game.discard(a,[card]);assert.equal(accepts(discarded),true);assert.equal(accepts(fromBattlefield),false);
  await game.move(card,'exile');await game.move(card,'graveyard');assert.equal(accepts(discarded),false);
  const other=put(M,game,b,'Grizzly Bears');await game.move(other,'graveyard');assert.equal(game.legalTargets(fromBattlefield,source,a).includes(other),false);
  game.turnNo++;assert.equal(accepts(fromBattlefield),false);assert.equal(accepts(discarded),false);assertGameStateInvariants(game);
 });
 test(role+': Nissa reveals the bounded Elf or Elemental cohort only on the second land resolution',async()=>{
  const {game,a}=context(M,role);put(M,game,a,'Nissa, Resurgent Animist');const elf=put(M,game,a,'Llanowar Elves','library'),miss=put(M,game,a,'Forest','library'),size=a.library.length,hand=a.hand.length;
  for(let n=1;n<=4;n++){const land=put(M,game,a,'Forest','hand');await game.move(land,'battlefield',{ctrl:a});await settle(game);assert.equal(Object.values(a.pool).reduce((sum,value)=>sum+value,0),n);assert.equal(a.hand.length,hand+Number(n>=2));if(n===1)assert.equal(a.library.at(-1),miss);if(n>=2){assert.equal(elf.zone,'hand');assert.equal(a.library.length,size-1);assert.equal(miss.zone,'library');}}
  game.turnNo++;const land=put(M,game,a,'Forest','hand');await game.move(land,'battlefield',{ctrl:a});await settle(game);assert.equal(a.hand.length,hand+1);assertGameStateInvariants(game);
 });
}
test('v22 quantity normalization preserves printed source and bounded name text',()=>{
 const original={name:'Quantity fixture',layout:'normal',type_line:'Instant',mana_cost:'{U}',oracle_text:'Draw thirteen cards. Choose a card named Thirteen Cards.'};
 const normalized=v22.normalizeCard(original);assert.equal(original.oracle_text,'Draw thirteen cards. Choose a card named Thirteen Cards.');assert.equal(normalized.oracle_text,'Draw 13 cards. Choose a card named Thirteen Cards.');
});
test('v22 ordinal programs reject incomplete later branches',()=>{
 for(const row of rows)assert.equal(semanticClass({...row,oracle_text:row.oracle_text+'\nIf this is the fourth time this ability has resolved this turn, do an unsupported thing.'},{compilerVersion:22}).semanticClass,undefined,row.name);
});
