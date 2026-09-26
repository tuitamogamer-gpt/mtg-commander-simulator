import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine(),names=new Set(['Worship','Bloodletter of Aclazotz','Awe Strike','Fiendslayer Paladin','Absolute Virtue']);
const rows=[...new Map(['rules','damage'].flatMap(family=>JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v20-'+family+'.json',import.meta.url),'utf8'))).filter(card=>names.has(card.name)&&!M.DEFS[card.name]).map(card=>[card.name,card])).values()];
if(rows.length){M.registerOracleBatch(createImportPlan({cards:rows,bulk:{type:'oracle_cards'},sequence:9936,limit:rows.length,compilerVersion:20}).report);M.initData(M.RAW_DATA);}
const fund=player=>{for(const color of ['W','U','B','R','G','C'])player.pool[color]=20;};
const choose=(player,fn)=>{const prior=player.controller.decide.bind(player.controller);player.controller.decide=(game,query)=>fn(game,query)??prior(game,query);};

for(const role of ['human','ai']){
 test(role+': opponent protection checks the caster of a card played from another player exile',async()=>{
  for(const casterIsProtected of [false,true]){
   const {game,a,b}=context(M,role),protectedPlayer=casterIsProtected?a:b,owner=casterIsProtected?b:protectedPlayer;put(M,game,protectedPlayer,'Absolute Virtue');
   const spell=put(M,game,owner,'Shock','exile');spell.meta.playableBy=a;spell.meta.playableUntil=game.turnNo;fund(a);
   choose(a,(g,q)=>q.type==='chooseTargets'?(q.candidates.includes(protectedPlayer)?[protectedPlayer]:[]):undefined);
   const life=protectedPlayer.life,mana=a.pool.R;assert.equal(await game.castSpell(a,spell,{from:'exile'}),casterIsProtected);
   if(!casterIsProtected){assert.equal(a.pool.R,mana,'an illegal proposal pays no cost');assert.equal(spell.zone,'exile');assert.equal(game.stack.length,0);}
   await settle(game);assert.equal(protectedPlayer.life,life-(casterIsProtected?2:0));assertGameStateInvariants(game);
  }
 });
 test(role+': Worship observes the whole simultaneous damage event after prevention gains',async()=>{
  for(const shieldFirst of [false,true]){const {game,a,b}=context(M,role);put(M,game,a,'Worship');put(M,game,a,'Grizzly Bears');const first=put(M,game,b,'Grizzly Bears'),second=put(M,game,b,'Grizzly Bears'),spell=put(M,game,a,'Awe Strike','hand');fund(a);a.life=2;choose(a,(g,q)=>q.type==='chooseTargets'?[second]:undefined);assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);const hits=[{src:first,target:a,n:5},{src:second,target:a,n:5}];assert.equal(await game.damageBatch(shieldFirst?hits.reverse():hits,{combat:true}),5);assert.equal(a.life,2,'CR 120.4: five simultaneous life gained offset the five life lost in either hit order');assert.equal(a.turnState.lifeLost,5);assert.equal(a.turnState.lifeGained,5);assertGameStateInvariants(game);}
 });
 test(role+': Worship includes simultaneous lifelink gains and aggregates the actual damage loss',async()=>{
  const {game,a,b}=context(M,role);put(M,game,a,'Worship');const own=put(M,game,a,'Grizzly Bears'),enemy=put(M,game,b,'Grizzly Bears');own.def={...own.def,kws:['lifelink']};game.recalc();a.life=2;assert.equal(await game.damageBatch([{src:enemy,target:a,n:5},{src:own,target:b,n:5}]),10);assert.equal(a.life,2);assert.equal(a.turnState.lifeLost,5);assert.equal(a.turnState.lifeGained,5);assert.equal(b.life,35);assertGameStateInvariants(game);
 });
 test(role+': Worship and Bloodletter let the affected player choose the replacement order',async()=>{
  for(const first of ['Worship','Bloodletter of Aclazotz']){const {game,a,b}=context(M,role);put(M,game,a,'Worship');put(M,game,a,'Grizzly Bears');const enemy=put(M,game,b,'Bloodletter of Aclazotz');game.turnPlayer=b;a.life=5;let choices=0;choose(a,(g,q)=>{if(q.type==='chooseOption'&&q.aiHint?.kind==='replacementOrder'){choices++;return q.options.find(option=>option.label.startsWith(first))?.key;}return undefined;});assert.equal(await game.damageAny(enemy,a,5,{deferSBA:true}),5);assert.equal(choices,1);assert.equal(a.life,first==='Worship'?-3:1,'each replacement applies at most once, in the chosen order');assert.equal(a.turnState.lifeLost,first==='Worship'?8:4);assertGameStateInvariants(game);}
 });
 test(role+': colored spell restrictions use the announced Adventure face and current colors on resolution',async()=>{
  const {game,a,b}=context(M,role);fund(a);const paladin=put(M,game,b,'Fiendslayer Paladin'),spell=put(M,game,a,'Brazen Borrower','hand');
  // Keep the real Petty Theft implementation and exercise a differently
  // colored permanent face, as on native multicolor Adventure cards.
  spell.def={...spell.def,cost:'{1}{R}{R}',colorsOverride:['R']};choose(a,(g,q)=>q.type==='chooseTargets'?(q.candidates.includes(paladin)?[paladin]:[]):undefined);
  assert.equal(await game.castSpell(a,spell,{from:'hand',alt:{adventure:true}}),true);assert.deepEqual(Array.from(spell.colors),['U']);await settle(game);assert.equal(paladin.zone,'hand');assert.equal(spell.zone,'exile');
  await game.move(paladin,'battlefield',{ctrl:b});const red=put(M,game,a,'Bonecrusher Giant','hand');red.def={...red.def,cost:'{1}{U}{U}',colorsOverride:['U']};assert.equal(await game.castSpell(a,red,{from:'hand',alt:{adventure:true}}),false);assert.equal(red.zone,'hand','a blue permanent face cannot bypass the restriction for its red Adventure');
  const second=put(M,game,a,'Brazen Borrower','hand');second.def={...second.def,cost:'{1}{R}{R}',colorsOverride:['R']};assert.equal(await game.castSpell(a,second,{from:'hand',alt:{adventure:true}}),true);game.untilEffects.push({kind:'oracleAnimation',stackColorV18:true,iid:second.iid,zoneVersion:second.zoneVersion,colors:['R'],expires:'eot'});assert.deepEqual(Array.from(second.colors),['R']);await settle(game);assert.equal(paladin.zone,'battlefield','current spell color is checked again at resolution');assert.equal(second.zone,'graveyard');assertGameStateInvariants(game);
 });
}
