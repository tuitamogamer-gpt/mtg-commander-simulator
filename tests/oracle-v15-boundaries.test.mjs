import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v15-compositions.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9933,limit:absent.length,compilerVersion:15});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);}
M.initData(M.RAW_DATA);
function choose(player,handler){const prior=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>{const result=handler(g,q);return result===undefined?prior(g,q):result;};}
async function cast(f,name,targets=[],options={}){const card=put(M,f.game,f.a,name,'hand');for(const color of ['W','U','B','R','G','C'])f.a.pool[color]=30;choose(f.a,(g,q)=>q.type==='chooseTargets'?targets.filter(target=>q.candidates.includes(target)).slice(0,q.max??q.count??1):undefined);assert.equal(await f.game.castSpell(f.a,card,{from:'hand',...options}),true,name);return card;}
async function activate(f,source,target,select=()=>true){for(const color of ['W','U','B','R','G','C'])f.a.pool[color]=20;choose(f.a,(g,q)=>q.type==='chooseTargets'&&target?[target]:undefined);const action=f.game.activatableList(f.a).find(row=>row.card===source&&select(row.ability));assert.ok(action,source.name+': activatable');assert.equal(await f.game.activateAbility(f.a,action),true);await settle(f.game);}
const shield=(game,card,n)=>game.untilEffects.push({kind:'oraclePreventNextAmount',target:card,zoneVersion:card.zoneVersion,remaining:n,direction:'to',expires:'eot',combat:false});

test('v15 rejects an X with no declared mana or additional cost and an ambiguous created object',()=>{
 const source={name:'Binding boundary',layout:'normal',type_line:'Sorcery',mana_cost:'{G}'};
 for(const oracle_text of ['Create an X/1 red Elemental creature token.','Return each creature card with mana value X from your graveyard to the battlefield.','Create a 1/1 white Soldier creature token. If you control a Forest, create a 2/2 green Bear creature token. Put a +1/+1 counter on it.'])assert.equal(semanticClass({...source,oracle_text},{compilerVersion:15}).semanticClass,undefined,oracle_text);
});
for(const role of ['human','ai']){
 test(role+': Depopulate finishes every qualifying draw before destroying all creatures',async()=>{
  const f=context(M,role,2),{game}=f;
  for(const [i,p]of game.players.entries()){const card=put(M,game,p,'Grizzly Bears');if(i!==1)card.def={...card.def,colorsOverride:['R','G']};}game.recalc();
  const draw=game.draw.bind(game),witness=[];game.draw=async(p,n,...rest)=>{witness.push({player:p,count:game.creatures().length});return draw(p,n,...rest);};
  await cast(f,'Depopulate');await settle(game);assert.deepEqual(Array.from(game.players,p=>p.hand.length),[1,0,1]);assert.deepEqual(witness.map(row=>row.count),[3,3]);assert.equal(game.creatures().length,0);assertGameStateInvariants(game);
 });
 test(role+': Thornbow Archer evaluates each defending opponent’s Elf separately',async()=>{
  const f=context(M,role,2),{game,a,others}=f,source=put(M,game,a,'Thornbow Archer');put(M,game,others[1],'Llanowar Elves');source.attacking=others[0];const life=others.map(p=>p.life);await game.emit('attacks',{card:source,defender:others[0],player:a});await settle(game);assert.deepEqual(others.map((p,i)=>life[i]-p.life),[1,0]);assertGameStateInvariants(game);
 });
 test(role+': Hidetsugu’s Second Rite checks life at resolution',async()=>{
  for(const life of [10,11]){const f=context(M,role);f.b.life=10;await cast(f,"Hidetsugu's Second Rite",[f.b]);f.b.life=life;await settle(f.game);assert.equal(f.b.life,life===10?0:11);assertGameStateInvariants(f.game);}
 });
 test(role+': life paid as X binds both targeting filters and the resolved amount',async()=>{
  for(const name of ["Fix What's Broken",'Vicious Rivalry','Bond of Agony']){const f=context(M,role,2),{game,a,b}=f,two=put(M,game,name==='Vicious Rivalry'?b:a,'Grizzly Bears',name==="Fix What's Broken"?'graveyard':'battlefield'),six=put(M,game,b,'Craw Wurm',name==="Fix What's Broken"?'graveyard':'battlefield');const life=game.players.map(p=>p.life);await cast(f,name,[],{xVal:2});await settle(game);assert.equal(a.life,life[0]-2);if(name==="Fix What's Broken"){assert.equal(two.zone,'battlefield');assert.equal(six.zone,'graveyard');}else if(name==='Vicious Rivalry'){assert.equal(two.zone,'graveyard');assert.equal(six.zone,'battlefield');}else for(const [i,p]of game.players.entries())if(i)assert.equal(p.life,life[i]-2);assertGameStateInvariants(game);}
 });
 test(role+': Debt to the Deathless doubles X and sums actual loss across opponents',async()=>{
  const f=context(M,role,2),life=f.game.players.map(p=>p.life);await cast(f,'Debt to the Deathless',[],{xVal:3});await settle(f.game);assert.deepEqual(Array.from(f.game.players,(p,i)=>p.life-life[i]),[12,-6,-6]);assertGameStateInvariants(f.game);
 });
 test(role+': Sanguine Sacrament gains twice X and puts its original card on the bottom',async()=>{
  const f=context(M,role),life=f.a.life,card=await cast(f,'Sanguine Sacrament',[],{xVal:3});await settle(f.game);assert.equal(f.a.life,life+6);assert.equal(card.zone,'library');assert.equal(f.a.library[0],card);assertGameStateInvariants(f.game);
 });
 test(role+': temporary land types supply mana, respect controllers and expire',async()=>{
  for(const name of ['Energybending','Elsewhere Flask','Terraformer','Nightcreep']){const f=context(M,role),{game,a,b}=f,land=put(M,game,a,"Mishra's Factory"),enemy=put(M,game,b,'Forest');if(['Elsewhere Flask','Terraformer'].includes(name)){const source=put(M,game,a,name);choose(a,(g,q)=>q.prompt==='Choose a basic land type'?'Island':undefined);await activate(f,source);}else {await cast(f,name);await settle(game);}const type=name==='Nightcreep'?'Swamp':name==='Energybending'?'Mountain':'Island';assert.equal(land.hasSub(type),true);assert.equal(enemy.hasSub(type),name==='Nightcreep');assert.equal(land.cur.oracleLandTypeAbilitiesRemoved===true,name!=='Energybending');for(const color of Object.keys(a.pool))a.pool[color]=0;for(const source of game.bf())if(source!==land)source.tapped=true;assert.equal(await game.payMana(a,M.parseCost('{'+({Swamp:'B',Mountain:'R',Island:'U'})[type]+'}')),true);assert.equal(land.tapped,true);game.untilEffects=game.untilEffects.filter(effect=>effect.expires!=='eot');game.recalc();assert.equal(land.hasSub(type),false);assertGameStateInvariants(game);}
 });
 test(role+': landwalk overrides preserve unrelated evasion and stop when the source loses abilities',async()=>{
  const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Ur-Drago'),attacker=put(M,game,b,'Grizzly Bears'),blocker=put(M,game,a,'Grizzly Bears');put(M,game,a,'Swamp');attacker.def={...attacker.def,kws:['swampwalk','islandwalk']};attacker.attacking=a;game.recalc();assert.equal(game.canBlock(blocker,attacker),true);put(M,game,a,'Island');assert.equal(game.canBlock(blocker,attacker),false);attacker.def={...attacker.def,kws:['swampwalk']};game.recalc();assert.equal(game.canBlock(blocker,attacker),true);await cast(f,'Humble',[source]);await settle(game);assert.equal(source.cur.abilitiesDisabled,true);assert.equal(game.canBlock(blocker,attacker),false);game.untilEffects=game.untilEffects.filter(effect=>effect.expires!=='eot');game.recalc();assert.equal(game.canBlock(blocker,attacker),true);await game.move(source,'exile');assert.equal(game.canBlock(blocker,attacker),false);assert.equal(attacker.kw('swampwalk'),true);assertGameStateInvariants(game);
 });
 test(role+': prevented damage differs from an unconditional regeneration prohibition',async()=>{
  for(const name of ['Incinerate','Engulfing Flames']){const f=context(M,role),target=put(M,f.game,f.b,'Craw Wurm');shield(f.game,target,6);target.regenShield=1;await cast(f,name,[target]);await settle(f.game);assert.equal(target.damage,0);assert.equal(M.oracleCantRegenerateV15(f.game,target),name==='Engulfing Flames');await f.game.destroy(target);assert.equal(target.zone,name==='Engulfing Flames'?'graveyard':'battlefield');assertGameStateInvariants(f.game);}
 });
 test(role+': Staff of the Ages applies to basic, nonbasic, legendary, snow, Desert and artifact landwalk',async()=>{
  for(const keyword of ['forestwalk','nonbasic landwalk','legendary landwalk','snow landwalk','snow forestwalk','desertwalk','artifact landwalk']){const f=context(M,role),{game,a,b}=f,attacker=put(M,game,b,'Grizzly Bears'),blocker=put(M,game,a,'Grizzly Bears'),land=put(M,game,a,'Forest');attacker.def={...attacker.def,kws:[keyword]};attacker.attacking=a;land.def={...land.def,types:['Land','Artifact'],super:['Legendary','Snow'],subtypes:['Forest','Desert']};game.recalc();assert.equal(game.canBlock(blocker,attacker),false,keyword);const staff=put(M,game,a,'Staff of the Ages');assert.equal(game.canBlock(blocker,attacker),true,keyword);assert.equal(attacker.kw(keyword),true);await game.move(staff,'exile');assert.equal(game.canBlock(blocker,attacker),false);assertGameStateInvariants(game);}
 });
 test(role+': regeneration restrictions expire next turn and do not follow a returning object',async()=>{
  for(const variant of ['same-turn','next-turn','returned']){const f=context(M,role),{game}=f,target=put(M,game,f.b,'Craw Wurm');target.regenShield=1;await cast(f,'Incinerate',[target]);await settle(game);assert.equal(target.zone,'battlefield');if(variant==='next-turn')game.turnNo++;if(variant==='returned'){await game.move(target,'exile');await game.putPermanentOntoBattlefield(target,f.b);target.regenShield=1;}await game.destroy(target);assert.equal(target.zone,variant==='same-turn'?'graveyard':'battlefield');assertGameStateInvariants(game);}
 });
 test(role+': Flamebreak defeats ground regeneration and does not damage flying creatures',async()=>{
  const f=context(M,role),ground=put(M,f.game,f.b,'Grizzly Bears'),flyer=put(M,f.game,f.b,'Suntail Hawk');ground.regenShield=1;flyer.regenShield=1;await cast(f,'Flamebreak');await settle(f.game);assert.equal(ground.zone,'graveyard');assert.equal(flyer.zone,'battlefield');assert.equal(flyer.damage,0);await f.game.destroy(flyer);assert.equal(flyer.zone,'battlefield');assertGameStateInvariants(f.game);
 });
 test(role+': Carbonize applies its creature restrictions even when all damage is prevented',async()=>{
  const f=context(M,role),target=put(M,f.game,f.b,'Craw Wurm');target.regenShield=1;shield(f.game,target,3);await cast(f,'Carbonize',[target]);await settle(f.game);assert.equal(target.damage,0);await f.game.destroy(target);assert.equal(target.zone,'exile');assertGameStateInvariants(f.game);
 });
 test(role+': Doppelgang pays triple X and makes X copies of each of exactly X targets',async()=>{
  const f=context(M,role),one=put(M,f.game,f.b,'Grizzly Bears'),two=put(M,f.game,f.b,'Craw Wurm');const spell=await cast(f,'Doppelgang',[one,two],{xVal:2});assert.equal(spell.castMeta.manaSpent,8);await settle(f.game);const made=f.game.bf().filter(card=>card.isToken);assert.equal(made.length,4);assert.equal(made.filter(card=>card.name===one.name).length,2);assert.equal(made.filter(card=>card.name===two.name).length,2);assert.ok(made.every(card=>card.ctrl===f.a));assertGameStateInvariants(f.game);
 });
 test(role+': Seed the Land gives tokens to the arriving land’s actual controller',async()=>{
  const f=context(M,role,2);put(M,f.game,f.a,'Seed the Land');const land=put(M,f.game,f.others[1],'Forest','hand');await f.game.putPermanentOntoBattlefield(land,f.others[1]);await settle(f.game);assert.deepEqual(Array.from(f.game.players,p=>f.game.creatures(p).filter(card=>card.isToken).length),[0,0,1]);assertGameStateInvariants(f.game);
 });
 test(role+': Graven Abomination targets only the captured defender’s graveyard',async()=>{
  const f=context(M,role,2),{game,a,others}=f,source=put(M,game,a,'Graven Abomination'),right=put(M,game,others[1],'Grizzly Bears','graveyard'),wrong=put(M,game,others[0],'Grizzly Bears','graveyard');right.ctrl=others[0];source.attacking=others[1];let offered;choose(a,(g,q)=>{if(q.type==='chooseTargets'){offered=q.candidates;return [right];}});await game.emit('attacks',{card:source,player:a,defender:others[1]});await settle(game);assert.ok(offered.includes(right));assert.equal(offered.includes(wrong),false);assert.equal(right.zone,'exile');assert.equal(wrong.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': unrestricted ability use and restricted spell use share the same produced mana',async()=>{
  for(const name of ['Automated Artificer','Purple Dragon Punks','Sage of the Unknowable']){const f=context(M,role),{game,a}=f,source=put(M,game,a,name),bear=put(M,game,a,'Grizzly Bears','hand'),artifact=put(M,game,a,'Bonesplitter','hand');const descriptor=game.manaSources(a).find(row=>row.card===source),produce=descriptor.produce[0];assert.equal(await game.activateManaSource(a,descriptor,produce,null,[]),true);assert.equal(game.canPayMana(a,M.parseCost('{1}'),{card:bear}),false);assert.equal(game.canPayMana(a,M.parseCost('{1}'),{card:artifact}),true);assert.equal(await game.payMana(a,M.parseCost('{1}'),{card:bear,isAbility:true}),true);assert.equal(game.stack.length,0);assertGameStateInvariants(game);}
 });
 // CR 614.11b, https://media.wizards.com/2026/downloads/MagicCompRules%2020260619.pdf
 test(role+': Fa’adiyah Seer and Sindbad do not reveal or discard cards from replaced draws',async()=>{
  for(const name of ["Fa'adiyah Seer",'Sindbad'])for(const replacement of [false,true]){const f=context(M,role),{game,a}=f,source=put(M,game,a,name),old=put(M,game,a,'Grizzly Bears','hand'),top=put(M,game,a,'Craw Wurm','library');if(replacement)put(M,game,a,'Thought Reflection');const revealed=[];game.revealToHuman=async data=>revealed.push(...data.cards);await activate(f,source);assert.equal(old.zone,'hand');assert.equal(top.zone,replacement?'hand':'graveyard');assert.equal(revealed.includes(top),!replacement);assert.equal(a.hand.length,replacement?3:1);assertGameStateInvariants(game);}
 });
 test(role+': Soldevi Sage discards only an unreplaced card from its own draw instruction',async()=>{
  for(const replacement of [false,true]){const f=context(M,role),{game,a}=f,source=put(M,game,a,'Soldevi Sage'),old=put(M,game,a,'Craw Wurm','hand');put(M,game,a,'Forest');put(M,game,a,'Island');if(replacement)put(M,game,a,'Thought Reflection');let options;choose(a,(g,q)=>{if(q.prompt==='Discard from the cards just drawn'){options=q.from;return [q.from[0]];}});await activate(f,source);assert.equal(old.zone,'hand');assert.equal(a.hand.length,replacement?7:3);assert.equal(!!options,!replacement);if(options)assert.equal(options.includes(old),false);assertGameStateInvariants(game);}
 });
}
