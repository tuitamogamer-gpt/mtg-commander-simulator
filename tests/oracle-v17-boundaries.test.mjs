import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v17-compositions.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9935,limit:absent.length,compilerVersion:17});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);}
M.initData(M.RAW_DATA);
function choose(player,handler){const prior=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>{const answer=handler(g,q);return answer===undefined?prior(g,q):answer;};}
function fund(player){for(const color of ['W','U','B','R','G','C'])player.pool[color]=40;}
async function cast(f,name,targets=[],options={}){const card=put(M,f.game,f.a,name,'hand');fund(f.a);choose(f.a,(g,q)=>q.type==='chooseTargets'?targets.filter(target=>q.candidates.includes(target)).slice(0,q.max??q.count??1):undefined);assert.equal(await f.game.castSpell(f.a,card,{from:'hand',...options}),true,name);return card;}
async function activate(f,source,targets=[],pick=()=>true){fund(f.a);source.sick=false;choose(f.a,(g,q)=>q.type==='chooseTargets'?targets.filter(target=>q.candidates.includes(target)).slice(0,q.max??q.count??1):undefined);const action=f.game.activatableList(f.a).find(row=>row.card===source&&pick(row));assert.ok(action,source.name);assert.equal(await f.game.activateAbility(f.a,action),true);return action;}
function sturdy(f,player,name='Craw Wurm',extra={}){const card=put(M,f.game,player,name);card.def={...card.def,toughness:'30',...extra};f.game.recalc();return card;}
function faceDown(f,card){M.C14.faceDown(f.game,card);f.game.recalc();return card;}

test('v17 compiles every complete source and rejects unsupported appended text',()=>{
 for(const card of rows){assert.ok(semanticClass(card,{compilerVersion:17}).semanticClass,card.name);const invalid={...card,oracle_text:card.oracle_text+'\nDo an unsupported thing.'};assert.equal(semanticClass(invalid,{compilerVersion:17}).semanticClass,undefined,card.name);}
});
for(const role of ['human','ai']){
 test(role+': simultaneous damage combines overlapping recipients before a shield',async()=>{
  const f=context(M,role),{game,a,b}=f,blue=sturdy(f,b,'Craw Wurm',{kws:['flying'],colorsOverride:['U']}),ground=sturdy(f,b,'Craw Wurm',{colorsOverride:['U']}),green=sturdy(f,a);game.addCounters(blue,'shield',1);choose(a,(g,q)=>q.type==='chooseX'?5:undefined);await cast(f,'Tropical Storm',[],{X:5});await settle(game);assert.equal(blue.counters.shield,0);assert.equal(blue.damage,0);assert.equal(ground.damage,1);assert.equal(green.damage,0);assertGameStateInvariants(game);
 });
 test(role+': Hail Storm combines its two damage amounts for an attacking own creature',async()=>{
  const f=context(M,role),{game,a,b}=f,attacker=sturdy(f,a);attacker.attacking=b;game.addCounters(attacker,'shield',1);const life=a.life;await cast(f,'Hail Storm');await settle(game);assert.equal(attacker.damage,0);assert.equal(attacker.counters.shield,0);assert.equal(a.life,life-1);assertGameStateInvariants(game);
 });
 test(role+': enchanted damage retains the host source and lifelink after the Aura leaves',async()=>{
  const f=context(M,role),{game,a,b}=f,host=sturdy(f,a,'Craw Wurm',{kws:['lifelink']}),target=sturdy(f,b,'Craw Wurm',{kws:['flying']});const aura=await cast(f,'Dizzying Gaze',[host]);await settle(game);await activate(f,aura,[target]);const life=a.life;await game.move(aura,'graveyard');await settle(game);assert.equal(target.damage,1);assert.equal(a.life,life+1);assertGameStateInvariants(game);
 });
 test(role+': multicolor cast triggers Quirion once and green or colorless casts do not',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Quirion Dryad');for(const colors of [['G'],[],['W','U','R']]){const card=put(M,game,a,'Grizzly Bears','hand');card.def={...card.def,colorsOverride:colors};fund(a);assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await settle(game);}assert.equal(source.counters['+1/+1'],1);assertGameStateInvariants(game);
 });
 test(role+': partial draws belong to each opponent and can be declined',async()=>{
  const f=context(M,role,2),{game,a,b,others}=f;choose(b,(g,q)=>q.type==='chooseX'?0:undefined);choose(others[1],(g,q)=>q.type==='chooseX'?2:undefined);await cast(f,'Indentured Djinn');await settle(game);assert.deepEqual(Array.from(game.players,p=>p.hand.length),[0,0,2]);assertGameStateInvariants(game);
 });
 test(role+': Mind Warp privately selects exactly X cards from the targeted hand',async()=>{
  const f=context(M,role),{game,a,b}=f,cards=Array.from({length:4},()=>put(M,game,b,'Forest','hand')),views=[];game.revealToHuman=async q=>views.push(q);choose(a,(g,q)=>q.type==='chooseX'?2:q.type==='chooseCards'&&q.prompt==='Choose cards to discard'?cards.slice(0,2):undefined);await cast(f,'Mind Warp',[b],{X:2});await settle(game);assert.equal(b.hand.length,2);assert.equal(views.length,1);assert.equal(views[0].kind,'look');assert.equal(views[0].ctrl===a,true);assertGameStateInvariants(game);
 });
 test(role+': Extortion permits selecting zero cards from the inspected hand',async()=>{
  const f=context(M,role),{game,a,b}=f;put(M,game,b,'Forest','hand');choose(a,(g,q)=>q.type==='chooseCards'&&q.prompt==='Choose cards to discard'?[]:undefined);await cast(f,'Extortion',[b]);await settle(game);assert.equal(b.hand.length,1);assertGameStateInvariants(game);
 });
 test(role+': all graveyards are exiled and each player is subject to Calamity’s casting restriction',async()=>{
  const f=context(M,role,2),{game}=f,cards=game.players.map(p=>put(M,game,p,'Forest','graveyard'));await cast(f,"Calamity's Wake");await settle(game);for(const [i,p]of game.players.entries()){assert.equal(cards[i].zone,'exile');game.turnPlayer=p;game.phase='main1';assert.equal(game.canCastTiming(p,put(M,game,p,'Lightning Bolt','hand')),false);assert.equal(game.canCastTiming(p,put(M,game,p,'Grizzly Bears','hand')),true);}assertGameStateInvariants(game);
 });
 test(role+': player Aura effects stay on the enchanted player after their controller changes',async()=>{
  const f=context(M,role,2),{game,a,b,others}=f,enemy=sturdy(f,b),third=sturdy(f,others[1]);const aura=await cast(f,"Curse of Death's Hold",[b]);await settle(game);assert.equal(enemy.power,5);M.OracleV8Control.gain(game,aura,others[1],{});game.recalc();assert.equal(enemy.power,5);assert.equal(third.power,6);await game.move(aura,'exile');assert.equal(enemy.power,6);assertGameStateInvariants(game);
 });
 test(role+': Winter Moon and Static Orb enforce both limits',async()=>{
  const f=context(M,role),{game,a}=f;put(M,game,a,'Winter Moon');put(M,game,a,'Static Orb');const nonbasic=[put(M,game,a,'Command Tower'),put(M,game,a,'Command Tower')],basic=put(M,game,a,'Forest'),creature=put(M,game,a,'Grizzly Bears');for(const card of [...nonbasic,basic,creature])card.tapped=true;choose(a,(g,q)=>q.aiHint?.kind==='finaleUntap'?q.from.filter(card=>[nonbasic[0],basic].includes(card)).slice(0,q.max):undefined);await game.runBeginningPhase(a);assert.deepEqual([...nonbasic,basic,creature].map(card=>card.tapped),[false,true,false,true]);assertGameStateInvariants(game);
 });
 test(role+': a tapped Orb does not become active partway through its own untap',async()=>{
  const f=context(M,role),{game,a}=f,orb=put(M,game,a,'Winter Orb'),lands=Array.from({length:3},()=>put(M,game,a,'Forest'));for(const card of [orb,...lands])card.tapped=true;await game.runBeginningPhase(a);assert.equal([orb,...lands].some(card=>card.tapped),false);assertGameStateInvariants(game);
 });
 test(role+': Seedborn untaps another player’s lands without spending the active player’s allowance',async()=>{
  const f=context(M,role),{game,a,b}=f;put(M,game,a,'Winter Orb');put(M,game,b,'Seedborn Muse');const lands=Array.from({length:3},()=>put(M,game,b,'Forest'));for(const card of lands)card.tapped=true;await game.runBeginningPhase(a);assert.equal(lands.some(card=>card.tapped),false);assertGameStateInvariants(game);
 });
 test(role+': stun replacement consumes the selected land’s untap allowance',async()=>{
  const f=context(M,role),{game,a}=f;put(M,game,a,'Winter Orb');const selected=put(M,game,a,'Forest'),other=put(M,game,a,'Forest');selected.tapped=other.tapped=true;game.addCounters(selected,'stun',1);choose(a,(g,q)=>q.aiHint?.kind==='finaleUntap'?[selected]:undefined);await game.runBeginningPhase(a);assert.equal(selected.tapped,true);assert.equal(selected.counters.stun,0);assert.equal(other.tapped,true);assertGameStateInvariants(game);
 });
 test(role+': Canonist uses the types at casting time',async()=>{
  const f=context(M,role),{game,a}=f;put(M,game,a,'Ethersworn Canonist');const first=await cast(f,'Ornithopter');await settle(game);first.def={...first.def,types:['Creature']};game.recalc();await cast(f,'Grizzly Bears');await settle(game);assert.equal(game.canCastTiming(a,put(M,game,a,'Grizzly Bears','hand')),false);assert.equal(game.canCastTiming(a,put(M,game,a,'Ornithopter','hand')),true);assertGameStateInvariants(game);
 });
 test(role+': graveyard targets are tied to the chosen player and stale cards remain outside the library',async()=>{
  const f=context(M,role),{game,a,b}=f,one=put(M,game,b,'Forest','graveyard'),two=put(M,game,b,'Island','graveyard'),own=put(M,game,a,'Mountain','graveyard');await cast(f,"Memory's Journey",[b,one,two,own]);await game.move(two,'exile');await settle(game);assert.equal(one.zone,'library');assert.equal(two.zone,'exile');assert.equal(own.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': an illegal player target prevents that player’s graveyard shuffle',async()=>{
  const f=context(M,role),{game,a,b}=f,card=put(M,game,b,'Forest','graveyard');await cast(f,'Dwell on the Past',[b,card]);put(M,game,b,'Witchbane Orb');game.recalc();await settle(game);assert.equal(card.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': Aeve storm copies are nonlegendary while the physical card stays legendary',async()=>{
  const f=context(M,role),{game,a}=f;await cast(f,'Grizzly Bears');await settle(game);const source=await cast(f,'Aeve, Progenitor Ooze');await settle(game);const copies=game.creatures(a).filter(card=>card.isToken&&card.name===source.name);assert.equal(copies.length,1);assert.equal(copies[0].cur.super.includes('Legendary'),false);assert.equal(source.cur.super.includes('Legendary'),true);assert.equal(source.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': exile cast permission never exposes or permits face-down cards',async()=>{
  const f=context(M,role),{game,a,b}=f,card=put(M,game,a,'Eternal Scourge','exile');card.faceDown=true;fund(a);assert.equal(game.hasExilePlayPermission(a,card),false);assert.equal(game.hasExilePlayPermission(b,card),false);assert.equal(game.castableList(a).some(row=>row.card===card),false);assertGameStateInvariants(game);
 });
 test(role+': revealed hands update immediately when source control or abilities change',async()=>{
  const f=context(M,role,2),{game,a,b}=f,source=put(M,game,a,'Telepathy');for(const p of game.players)put(M,game,p,'Grizzly Bears','hand');assert.equal(game.revealedHandCardsV17(a).length,0);assert.equal(game.revealedHandCardsV17(b).length,1);M.OracleV8Control.gain(game,source,b,{});game.recalc();assert.equal(game.revealedHandCardsV17(a).length,1);assert.equal(game.revealedHandCardsV17(b).length,0);M.OracleV8AbilityLoss.add(game,[source],{temporary:true,keywords:[]});game.recalc();assert.equal(game.revealedHandCardsV17().length,0);assertGameStateInvariants(game);
 });
 test(role+': face-up effects preserve counters and do not add megamorph counters',async()=>{
  const f=context(M,role),{game,a,b}=f,card=put(M,game,b,'Den Protector');faceDown(f,card);game.addCounters(card,'+1/+1',2);await cast(f,'Break Open',[card]);await settle(game);assert.equal(card.faceDown,false);assert.equal(card.name,'Den Protector');assert.equal(card.counters['+1/+1'],2);assertGameStateInvariants(game);
 });
 test(role+': an instant cannot turn face up and is publicly revealed instead',async()=>{
  const f=context(M,role),{game,b}=f,card=put(M,game,b,'Lightning Bolt'),shown=[];faceDown(f,card);game.revealToHuman=async q=>shown.push(q);await cast(f,'Break Open',[card]);await settle(game);assert.equal(card.faceDown,true);assert.equal(card.zone,'battlefield');assert.ok(shown.some(q=>q.kind==='reveal'&&q.cards[0].name==='Lightning Bolt'));assertGameStateInvariants(game);
 });
 test(role+': Skirk’s delayed sacrifice ignores a creature that blinked',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Skirk Alarmist'),target=faceDown(f,put(M,game,a,'Grizzly Bears'));await activate(f,source,[target]);await settle(game);assert.equal(target.faceDown,false);await game.move(target,'exile');await game.move(target,'battlefield');await game.emit('endStep',{player:a});await settle(game);assert.equal(target.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': a private look shows the original face only to the ability controller',async()=>{
  const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Smoke Teller'),target=faceDown(f,put(M,game,b,'Craw Wurm')),shown=[];game.revealToHuman=async q=>shown.push(q);await activate(f,source,[target]);await settle(game);assert.equal(shown.length,1);assert.equal(shown[0].ctrl===a,true);assert.equal(shown[0].kind,'look');assert.equal(shown[0].cards[0].name,'Craw Wurm');assert.equal(target.faceDown,true);assert.equal(M.onlineArenaView(game,a).battlefield.find(c=>c.iid===target.iid)?.name==='Craw Wurm',false);assertGameStateInvariants(game);
 });
 test(role+': Narcolepsy checks its intervening condition at resolution',async()=>{
  const f=context(M,role),{game,a,b}=f,target=put(M,game,b,'Craw Wurm');await cast(f,'Narcolepsy',[target]);await settle(game);await game.emit('upkeep',{player:b});await game.flushTriggers();assert.equal(game.stack.length,1);game.tap(target);let taps=0;const original=game.tap.bind(game);game.tap=(...args)=>{taps++;return original(...args);};await settle(game);assert.equal(taps,0);assertGameStateInvariants(game);
 });
 test(role+': counter removal can span multiple kinds and can be declined',async()=>{
  for(const n of [0,5]){const f=context(M,role),{game,a,b}=f,target=sturdy(f,b);game.addCounters(target,'charge',2);game.addCounters(target,'stun',4);choose(a,(g,q)=>q.type==='chooseX'?n:q.aiHint?.kind==='counterRemove'?q.options[0].key:undefined);await cast(f,'Render Inert',[target]);await settle(game);assert.equal((target.counters.charge||0)+(target.counters.stun||0),6-n);assert.equal(a.hand.length,1);assertGameStateInvariants(game);}
 });
 test(role+': phase-in triggers occur through phasing and preserve the battlefield object',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Warping Wurm'),version=source.zoneVersion;game.phaseOut(source);game.phaseInFor(a);await settle(game);assert.equal(source.counters['+1/+1'],1);assert.equal(source.zoneVersion,version);game.phaseInFor(a);await settle(game);assert.equal(source.counters['+1/+1'],1);assertGameStateInvariants(game);
 });
 test(role+': Saproling Infestation distinguishes paid kicker from an ordinary cast',async()=>{
  const f=context(M,role),{game,a,b}=f;put(M,game,a,'Saproling Infestation');const target=sturdy(f,b);let paid=false;choose(a,(g,q)=>q.aiHint?.kind==='kicker'?(paid?'yes':'no'):undefined);await cast(f,'Burst Lightning',[target]);await settle(game);assert.equal(game.creatures(a).filter(card=>card.isToken).length,0);paid=true;await cast(f,'Burst Lightning',[target]);await settle(game);assert.equal(game.creatures(a).filter(card=>card.isToken&&card.hasSub('Saproling')).length,1);choose(a,(g,q)=>q.aiHint?.kind==='squad'?3:undefined);await cast(f,'Everflowing Chalice');await settle(game);assert.equal(game.creatures(a).filter(card=>card.isToken&&card.hasSub('Saproling')).length,4);assertGameStateInvariants(game);
 });
 test(role+': Gilt-Leaf Archdruid steals only the targeted player’s lands',async()=>{
  const f=context(M,role,2),{game,a,b,others}=f,source=put(M,game,a,'Gilt-Leaf Archdruid');for(let i=0;i<6;i++)put(M,game,a,'Llanowar Elves');const enemy=put(M,game,b,'Forest'),third=put(M,game,others[1],'Forest');await activate(f,source,[b]);await settle(game);assert.equal(enemy.ctrl===a,true);assert.equal(third.ctrl===others[1],true);assertGameStateInvariants(game);
 });
}
