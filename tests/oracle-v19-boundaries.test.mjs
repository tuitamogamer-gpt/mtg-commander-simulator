import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v19-compositions.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9937,limit:absent.length,compilerVersion:19});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);}
M.initData(M.RAW_DATA);
function choose(player,handler){const prior=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>{const answer=handler(g,q);return answer===undefined?prior(g,q):answer;};}
function fund(player){for(const color of ['W','U','B','R','G','C'])player.pool[color]=40;}
function targets(player,wanted){choose(player,(g,q)=>q.type==='chooseTargets'?wanted.filter(card=>q.candidates.includes(card)).slice(0,q.max??q.count??1):undefined);}
async function cast(f,name,wanted=[],options={}){const card=put(M,f.game,f.a,name,'hand');fund(f.a);targets(f.a,wanted);assert.equal(await f.game.castSpell(f.a,card,{from:'hand',...options}),true,name);return card;}
function sturdy(f,player,name='Grizzly Bears',extra={}){const card=put(M,f.game,player,name);card.def={...card.def,toughness:'30',...extra};f.game.recalc();return card;}
async function block(game,attacker,blocker){attacker.attacking=blocker.ctrl;attacker.blockedBy=[blocker];attacker.wasBlocked=true;blocker.blocking=attacker.iid;await game.emit('blocks',{player:blocker.ctrl,attacker,blocker});}

test('v19 consumes every complete Oracle card and rejects unsupported trailing rules',()=>{
 assert.equal(rows.length,107);
 for(const card of rows){assert.ok(semanticClass(card,{compilerVersion:19}).semanticClass,card.name);assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nDo an unsupported thing.',...(card.card_faces?{card_faces:card.card_faces.map(face=>({...face,oracle_text:face.oracle_text+'\nDo an unsupported thing.'}))}:{})},{compilerVersion:19}).semanticClass,undefined,card.name);}
});
for(const role of ['human','ai']){
 test(role+': entry keyword grants survive copying, obey ability loss, and end on a new object',async()=>{
  const f=context(M,role),{game,a}=f;choose(a,(g,q)=>q.aiHint?.kind==='kicker'?'yes':undefined);
  const c=await cast(f,'Pouncing Wurm');await settle(game);assert.equal(c.plus1(),3);assert.equal(c.kw('haste'),true);
  M.OracleV8Copies.applyCopy(game,c,M.DEFS['Grizzly Bears']);game.recalc();assert.equal(c.kw('haste'),true);assert.equal(c.plus1(),3);
  M.OracleV8AbilityLoss.add(game,[c],{temporary:true});assert.equal(c.kw('haste'),false);game.untilEffects=game.untilEffects.filter(e=>e.kind!=='oracleAbilityLoss');game.recalc();assert.equal(c.kw('haste'),true);
  await game.move(c,'exile');await game.move(c,'battlefield',{ctrl:a});assert.equal(c.kw('haste'),false);assert.equal(c.plus1(),0);assertGameStateInvariants(game);
 });
 test(role+': a creature entering without paid kicker receives neither counters nor granted flying',async()=>{
  const f=context(M,role),{game,a}=f;choose(a,(g,q)=>q.aiHint?.kind==='kicker'?'no':undefined);const c=await cast(f,'Faerie Squadron');await settle(game);assert.equal(c.plus1(),0);assert.equal(c.kw('flying'),false);assertGameStateInvariants(game);
 });
 test(role+': Firestorm pays X discards for X distinct targets and does not refund a fizzled target',async()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,a,'Firestorm','hand'),one=put(M,game,a,'Forest','hand'),two=put(M,game,a,'Island','hand'),victim=sturdy(f,b);fund(a);targets(a,[b,victim]);
  assert.equal(await game.castSpell(a,c,{from:'hand',xVal:2}),true);assert.equal(one.zone,'graveyard');assert.equal(two.zone,'graveyard');await game.move(victim,'exile');await settle(game);assert.equal(b.life,38);assert.equal(c.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': variable land discard rejects an unavailable payment without consuming mana or other cards',async()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,a,'Scorched Earth','hand'),land=put(M,game,a,'Forest','hand'),creature=put(M,game,a,'Grizzly Bears','hand'),x=put(M,game,b,'Forest'),y=put(M,game,b,'Island');fund(a);targets(a,[x,y]);const pool={...a.pool};
  assert.equal(await game.castSpell(a,c,{from:'hand',xVal:2}),false);assert.deepEqual({...a.pool},pool);for(const card of [c,land,creature])assert.equal(card.zone,'hand');assertGameStateInvariants(game);
 });
 test(role+': a new graveyard incarnation cannot satisfy the original Restless Dreams target',async()=>{
  const f=context(M,role),{game,a}=f,victim=put(M,game,a,'Grizzly Bears','graveyard'),payment=put(M,game,a,'Forest','hand');await cast(f,'Restless Dreams',[victim],{xVal:1});assert.equal(payment.zone,'graveyard');await game.move(victim,'exile');await game.move(victim,'graveyard');await settle(game);assert.equal(victim.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': zero-creature sacrifice is a legal Krav activation with no fabricated counters or draw',async()=>{
  const f=context(M,role),{game,a}=f,c=put(M,game,a,'Krav, the Unredeemed');fund(a);targets(a,[a]);choose(a,(g,q)=>q.type==='chooseX'?0:undefined);const action=game.activatableList(a).find(row=>row.card===c);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(c.plus1(),0);assert.equal(a.hand.length,0);assert.equal(a.life,40);assert.equal(c.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': Hum of the Radix counts artifacts of the spell caster, including opponents',()=>{
  const f=context(M,role),{game,a,b}=f,hum=put(M,game,a,'Hum of the Radix');put(M,game,a,'Sol Ring');for(let i=0;i<3;i++)put(M,game,b,'Sol Ring');const x=put(M,game,a,'Sol Ring','hand'),y=put(M,game,b,'Sol Ring','hand');assert.equal(game.spellCost(a,x,{}).generic,2);assert.equal(game.spellCost(b,y,{}).generic,4);M.OracleV8AbilityLoss.add(game,[hum],{});assert.equal(game.spellCost(b,y,{}).generic,1);
 });
 test(role+': Mox Amber excludes nonlegendary creatures, opposing legends and legendary lands',async()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,a,'Mox Amber');put(M,game,a,'Grizzly Bears');put(M,game,b,'Venser, Shaper Savant');put(M,game,a,'The Grey Havens');assert.equal(game.manaSources(a).filter(s=>s.card===c).flatMap(s=>s.produce).length,0);const legend=put(M,game,a,'Venser, Shaper Savant');assert.deepEqual(Array.from(game.manaSources(a).filter(s=>s.card===c).flatMap(s=>s.produce),x=>({...x})),[{U:1}]);await game.move(legend,'exile');assert.equal(game.manaSources(a).filter(s=>s.card===c).flatMap(s=>s.produce).length,0);assertGameStateInvariants(game);
 });
 test(role+': entry prohibition neither changes the object nor fires entry or graveyard-leave events',async()=>{
  const f=context(M,role),{game,a,b}=f,cage=put(M,game,a,"Grafdigger's Cage"),c=put(M,game,b,'Grizzly Bears','graveyard'),version=c.zoneVersion;let observed=0;const watch=put(M,game,b,'Sol Ring');watch.def={...watch.def,triggers:['etb','cardLeftGraveyard'].map(on=>({on,run:async()=>observed++}))};game.recalc();assert.equal(await game.putPermanentOntoBattlefield(c,b),false);await settle(game);assert.equal(c.zoneVersion,version);assert.equal(c.zone,'graveyard');assert.equal(observed,0);M.OracleV8AbilityLoss.add(game,[cage],{});assert.equal(await game.putPermanentOntoBattlefield(c,b),true);await settle(game);assert.equal(observed,2);assertGameStateInvariants(game);
 });
 test(role+': Weathered Runestone allows lands from the graveyard and other permanents from exile',async()=>{
  const f=context(M,role),{game,a,b}=f;put(M,game,a,'Weathered Runestone');const land=put(M,game,b,'Forest','graveyard'),artifact=put(M,game,b,'Sol Ring','library'),exiled=put(M,game,b,'Grizzly Bears','exile');assert.equal(await game.putPermanentOntoBattlefield(land,b),true);assert.equal(await game.putPermanentOntoBattlefield(artifact,b),false);assert.equal(await game.putPermanentOntoBattlefield(exiled,b),true);assertGameStateInvariants(game);
 });
 test(role+': Leyline replaces cards going to the opponent graveyard, including controlled-away cards',async()=>{
  const f=context(M,role),{game,a,b}=f;put(M,game,a,'Leyline of the Void');const stolen=put(M,game,b,'Grizzly Bears');stolen.ctrl=a;const own=put(M,game,a,'Forest','hand'),opponent=put(M,game,b,'Forest','hand');game.recalc();await game.move(stolen,'graveyard');await game.discard(a,[own]);await game.discard(b,[opponent]);assert.equal(stolen.zone,'exile');assert.equal(own.zone,'graveyard');assert.equal(opponent.zone,'exile');assertGameStateInvariants(game);
 });
 test(role+': Harness Infinity exchanges snapshots under replacement effects without discard events',async()=>{
  const f=context(M,role),{game,a,b}=f;put(M,game,b,'Leyline of the Void');const hand=put(M,game,a,'Island','hand'),grave=put(M,game,a,'Grizzly Bears','graveyard');let discards=0;const watcher=put(M,game,b,'Sol Ring');watcher.def={...watcher.def,triggers:[{on:'discarded',run:async()=>discards++}]};game.recalc();const spell=await cast(f,'Harness Infinity');await settle(game);assert.equal(hand.zone,'exile');assert.equal(grave.zone,'hand');assert.equal(spell.zone,'exile');assert.equal(discards,0);assertGameStateInvariants(game);
 });
 test(role+': redirected damage applies protection at the new recipient and still respects unpreventable damage',async()=>{
  const f=context(M,role),{game,a,b}=f,source=sturdy(f,b,'Grizzly Bears',{kws:['lifelink']}),recipient=put(M,game,a,'Progenitus'),shield=put(M,game,a,"Pariah's Shield");
  // Equip an ordinary creature, then make it a copy: protection would forbid a new attachment.
  recipient.def=M.DEFS['Grizzly Bears'];game.recalc();assert.equal(await game.attach(shield,recipient),true);recipient.def=M.DEFS['Progenitus'];game.recalc();await game.damagePlayer(source,a,3,{deferSBA:true});assert.equal(a.life,40);assert.equal(recipient.damage,0);assert.equal(b.life,40);await game.damagePlayer(source,a,2,{cantBePrevented:true,deferSBA:true});assert.equal(a.life,40);assert.equal(recipient.damage,2);assert.equal(b.life,42);
 });
 test(role+': opposed redirections apply once each without looping or losing damage',async()=>{
  const f=context(M,role),{game,a,b}=f,protector=sturdy(f,a,'Empyrial Archangel'),link=put(M,game,b,'Treacherous Link'),source=put(M,game,b,'Grizzly Bears');protector.def={...protector.def,kws:[]};game.recalc();assert.equal(await game.attach(link,protector),true);await game.damagePlayer(source,a,3,{deferSBA:true});assert.equal((40-a.life)+protector.damage,3);assertGameStateInvariants(game);
 });
 test(role+': Torpor Orb suppresses entry triggers but not counters, casting triggers or ordinary artifact entry',async()=>{
  const f=context(M,role),{game,a}=f;put(M,game,a,'Torpor Orb');let etb=0,casts=0;const watcher=put(M,game,a,'Sol Ring');watcher.def={...watcher.def,triggers:[{on:'etb',run:async()=>etb++},{on:'cast',run:async()=>casts++}]};game.recalc();choose(a,(g,q)=>q.aiHint?.kind==='kicker'?'yes':undefined);const c=await cast(f,'Kavu Titan');await settle(game);assert.equal(c.plus1(),3);assert.equal(etb,0);assert.equal(casts,1);await cast(f,'Memory Crystal');await settle(game);assert.equal(etb,1);assert.equal(casts,2);assertGameStateInvariants(game);
 });
 test(role+': an entering Tocatli Honor Guard stops its own creature-entry event',async()=>{
  const f=context(M,role),{game,a}=f;let fired=0;const watcher=put(M,game,a,'Sol Ring');watcher.def={...watcher.def,triggers:[{on:'etb',run:async()=>fired++}]};game.recalc();const c=put(M,game,a,'Tocatli Honor Guard','hand');await game.putPermanentOntoBattlefield(c,a);await settle(game);assert.equal(fired,0);M.OracleV8AbilityLoss.add(game,[c],{});const next=put(M,game,a,'Grizzly Bears','hand');await game.putPermanentOntoBattlefield(next,a);await settle(game);assert.equal(fired,1);assertGameStateInvariants(game);
 });
 test(role+': batched Dinosaur attacks capture their number before those attackers leave',async()=>{
  const f=context(M,role),{game,a,b}=f;put(M,game,a,'Poetic Ingenuity');const dinosaurs=[sturdy(f,a,'Grizzly Bears',{subtypes:['Dinosaur']}),sturdy(f,a,'Craw Wurm',{subtypes:['Dinosaur']})],plain=put(M,game,a,'Grizzly Bears');for(const c of [...dinosaurs,plain])c.attacking=b;await game.emit('attackersDeclared',{player:a,attackers:[...dinosaurs,plain]});await game.flushTriggers();assert.equal(game.stack.length,1);for(const c of dinosaurs)await game.move(c,'exile');await settle(game);assert.equal(game.bf().filter(c=>c.ctrl===a&&c.hasSub('Treasure')).length,2);assertGameStateInvariants(game);
 });
 test(role+': a legendary blocking partner is remembered for that turn, not for a blinked object or later turn',async()=>{
  const f=context(M,role),{game,a,b}=f,attacker=put(M,game,a,'Grizzly Bears'),legend=put(M,game,b,'Venser, Shaper Savant'),spell=put(M,game,a,'You Cannot Pass!','hand'),spec=spell.def.targets[0];await block(game,attacker,legend);legend.def=M.DEFS['Grizzly Bears'];game.recalc();assert.equal(game.legalTargets(spec,spell,a).includes(attacker),true);game.turnNo++;assert.equal(game.legalTargets(spec,spell,a).includes(attacker),false);await block(game,attacker,legend);await game.move(attacker,'exile');await game.move(attacker,'battlefield',{ctrl:a});assert.equal(game.legalTargets(spec,spell,a).includes(attacker),false);assertGameStateInvariants(game);
 });
 test(role+': Fyndhorn Druid uses its battlefield history after moving to the graveyard',async()=>{
  const f=context(M,role),{game,a,b}=f,druid=put(M,game,a,'Fyndhorn Druid'),blocker=put(M,game,b,'Grizzly Bears');await block(game,druid,blocker);await game.destroy(druid);await settle(game);assert.equal(druid.zone,'graveyard');assert.equal(a.life,44);assertGameStateInvariants(game);
 });
 test(role+': Laccolith trigger suppresses assignment for this turn even when damage cannot be prevented',async()=>{
  const f=context(M,role),{game,a,b}=f,whelp=sturdy(f,a,'Laccolith Whelp'),blocker=sturdy(f,b);targets(a,[blocker]);await block(game,whelp,blocker);await game.emit('becomesBlocked',{player:a,attacker:whelp,blockers:[blocker]});await settle(game);assert.equal(blocker.damage,1);game.untilEffects.push({kind:'noDamagePrevention',expires:'eot'});await game.combatDamage(a,'normal');assert.equal(blocker.damage,1);assert.equal(game.dmgAmount(whelp,'normal'),0);game.mainPhase=async()=>{};game.combatPhase=async()=>{};await game.runTurn();assert.equal(game.dmgAmount(whelp,'normal'),whelp.power);assertGameStateInvariants(game);
 });
 test(role+': declining Laccolith leaves its ordinary combat assignment intact',async()=>{
  const f=context(M,role),{game,a,b}=f,whelp=sturdy(f,a,'Laccolith Whelp'),blocker=sturdy(f,b);targets(a,[blocker]);choose(a,(g,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='no')?'no':undefined);await block(game,whelp,blocker);await game.emit('becomesBlocked',{player:a,attacker:whelp,blockers:[blocker]});await settle(game);assert.equal(blocker.damage,0);assert.equal(game.dmgAmount(whelp,'normal'),1);assertGameStateInvariants(game);
 });
 test(role+': Wall of Corpses keeps a legal blocked target after sacrificing itself as the cost',async()=>{
  const f=context(M,role),{game,a,b}=f,wall=put(M,game,a,'Wall of Corpses'),attacker=put(M,game,b,'Grizzly Bears'),other=put(M,game,b,'Craw Wurm');await block(game,attacker,wall);fund(a);const action=game.activatableList(a).find(row=>row.card===wall);assert.ok(action);assert.equal(game.legalTargets(action.ability.targets[0],wall,a).includes(other),false);targets(a,[attacker]);assert.equal(await game.activateAbility(a,action),true);assert.equal(wall.zone,'graveyard');await settle(game);assert.equal(attacker.zone,'graveyard');assert.equal(other.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': Dragon Hunter blocking permission does not ignore flying on other creature types or ability loss',()=>{
  const f=context(M,role),{game,a,b}=f,hunter=put(M,game,a,'Dragon Hunter'),dragon=sturdy(f,b,'Grizzly Bears',{kws:['flying'],subtypes:['Dragon']}),bird=sturdy(f,b,'Craw Wurm',{kws:['flying'],subtypes:['Bird']});dragon.attacking=a;bird.attacking=a;assert.equal(game.canBlock(hunter,dragon),true);assert.equal(game.canBlock(hunter,bird),false);M.OracleV8AbilityLoss.add(game,[hunter],{});assert.equal(game.canBlock(hunter,dragon),false);
 });
 test(role+': Mishra Domination immediately changes between pump and blocking restriction when control changes',async()=>{
  const f=context(M,role),{game,a,b}=f,host=put(M,game,a,'Grizzly Bears'),aura=put(M,game,a,"Mishra's Domination");assert.equal(await game.attach(aura,host),true);game.recalc();assert.equal(host.power,4);assert.equal(!!host.cur.cantBlock,false);host.ctrl=b;game.recalc();assert.equal(host.power,2);assert.equal(host.cur.cantBlock,true);host.ctrl=a;game.recalc();assert.equal(host.power,4);assert.equal(!!host.cur.cantBlock,false);assertGameStateInvariants(game);
 });
 test(role+': Urban Burgeoning untaps its host in another turn and stops when the Aura loses abilities',async()=>{
  const f=context(M,role),{game,a,b}=f,land=put(M,game,a,'Forest'),aura=put(M,game,a,'Urban Burgeoning');assert.equal(await game.attach(aura,land),true);land.tapped=true;game.turnPlayer=b;await game.runBeginningPhase(b);assert.equal(land.tapped,false);land.tapped=true;M.OracleV8AbilityLoss.add(game,[land],{});await game.runBeginningPhase(b);assert.equal(land.tapped,true);const other=put(M,game,a,'Forest');await game.attach(aura,other);await game.attach(aura,land);await game.runBeginningPhase(b);assert.equal(land.tapped,false);land.tapped=true;M.OracleV8AbilityLoss.add(game,[aura],{});await game.runBeginningPhase(b);assert.equal(land.tapped,true);assertGameStateInvariants(game);
 });
 test(role+': granting improvise cannot pay a colored pip or a creature spell and ends with the source',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Ironheart, Clever Champion'),material=put(M,game,a,'Sol Ring');material.def={...material.def,mana:[]};game.recalc();const colored=put(M,game,a,'Opt','hand');assert.equal(await game.castSpell(a,colored,{from:'hand'}),false);assert.equal(material.tapped,false);const creature=put(M,game,a,'Grizzly Bears','hand');creature.def={...creature.def,cost:'{1}'};assert.equal(await game.castSpell(a,creature,{from:'hand'}),false);const artifact=put(M,game,a,'Sol Ring','hand');assert.equal(await game.castSpell(a,artifact,{from:'hand'}),true);assert.equal(material.tapped,true);await settle(game);await game.move(source,'exile');assertGameStateInvariants(game);
 });
 test(role+': Doctor Doom wins during resolution before an empty draw or zero life can cause a loss',async()=>{
  const f=context(M,role),{game,a,b}=f,doom=put(M,game,a,'Doctor Doom, Unrivaled');a.library=[];a.life=1;const action=game.activatableList(a).find(row=>row.card===doom);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(b.lost,true);assert.equal(a.lost,false);assert.equal(game.winner,a);assertGameStateInvariants(game);
 });
 test(role+': Hexdrinker changes protection at each level threshold and loses the granted abilities normally',async()=>{
  const f=context(M,role),{game,a,b}=f,hex=put(M,game,a,'Hexdrinker'),instant=put(M,game,b,'Lightning Bolt','hand'),creature=put(M,game,b,'Grizzly Bears');game.addCounters(hex,'level',3);assert.equal(hex.power,4);assert.equal(await game.damageAny(instant,hex,2,{deferSBA:true}),0);assert.equal(await game.damageAny(creature,hex,1,{deferSBA:true}),1);game.addCounters(hex,'level',5);assert.equal(hex.power,6);assert.equal(await game.damageAny(creature,hex,2,{deferSBA:true}),0);M.OracleV8AbilityLoss.add(game,[hex],{});assert.equal(await game.damageAny(creature,hex,1,{deferSBA:true}),1);
 });
 test(role+': Tezzeret pays exactly the chosen loyalty X and cannot search above that mana value',async()=>{
  const f=context(M,role),{game,a}=f,walker=put(M,game,a,'Tezzeret the Seeker'),small=put(M,game,a,'Sol Ring','library'),large=put(M,game,a,'Memory Crystal','library');walker.counters.loyalty=4;choose(a,(g,q)=>q.type==='chooseX'?2:q.type==='chooseCards'?(assert.equal(q.from.includes(large),false),q.from.filter(c=>c===small)):undefined);const action=game.activatableList(a).find(row=>row.card===walker&&row.ability.loyalty==='-X');assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(walker.counters.loyalty,2);await settle(game);assert.equal(small.zone,'battlefield');assert.equal(large.zone,'library');assertGameStateInvariants(game);
 });
 test(role+': Ricochet Trap requires an opponent blue spell, using its color at the time of casting',async()=>{
  const f=context(M,role),{game,a,b}=f,trap=put(M,game,a,'Ricochet Trap','hand');const alternative=trap.def.altCosts.find(row=>row.altCostStr==='{R}');assert.ok(alternative);assert.equal(!!alternative.cond(game,a,trap),false);await cast(f,'Opt');await settle(game);assert.equal(!!alternative.cond(game,a,trap),false);const opposing=put(M,game,b,'Opt','hand');fund(b);game.turnPlayer=b;assert.equal(await game.castSpell(b,opposing,{from:'hand'}),true);game.turnPlayer=a;opposing.def={...opposing.def,colors:['R']};game.recalc();await settle(game);assert.equal(!!alternative.cond(game,a,trap),true);game.turnNo++;for(const p of game.players)p.turnState=p.freshTurnState();assert.equal(!!alternative.cond(game,a,trap),false);
 });
 test(role+': Wall of Vapor prevents damage only from the creatures it is blocking',async()=>{
  const f=context(M,role),{game,a,b}=f,wall=sturdy(f,a,'Wall of Vapor'),blocked=put(M,game,b,'Grizzly Bears'),unblocked=put(M,game,b,'Craw Wurm');await block(game,blocked,wall);assert.equal(await game.damageAny(blocked,wall,3,{deferSBA:true}),0);assert.equal(await game.damageAny(unblocked,wall,2,{deferSBA:true}),2);assert.equal(await game.damageAny(blocked,wall,1,{cantBePrevented:true,deferSBA:true}),1);M.OracleV8AbilityLoss.add(game,[wall],{});assert.equal(await game.damageAny(blocked,wall,1,{deferSBA:true}),1);assertGameStateInvariants(game);
 });
 test(role+': an opponent can activate Wall of Vipers and both legal creatures are destroyed',async()=>{
  const f=context(M,role),{game,a,b}=f,wall=put(M,game,b,'Wall of Vipers'),attacker=put(M,game,a,'Grizzly Bears');await block(game,attacker,wall);fund(a);targets(a,[attacker]);const action=game.activatableList(a).find(row=>row.card===wall);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(wall.zone,'graveyard');assert.equal(attacker.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': Emeritus prepares at its end step only after the second creature death',async()=>{
  const f=context(M,role),{game,a,b}=f,c=put(M,game,a,'Emeritus of Woe // Demonic Tutor');c.meta.prepared=false;const own=put(M,game,a,'Grizzly Bears'),other=put(M,game,b,'Grizzly Bears');await game.destroy(own);await game.emit('endStep',{player:a});await settle(game);assert.equal(!!c.meta.prepared,false);await game.destroy(other);await game.emit('endStep',{player:a});await settle(game);assert.equal(c.meta.prepared,true);assertGameStateInvariants(game);
 });
 test(role+': Last One Standing chooses its survivor before destruction and cannot destroy indestructible creatures',async()=>{
  const f=context(M,role),{game,a,b}=f;const c1=sturdy(f,a,'Grizzly Bears',{kws:['indestructible']}),c2=put(M,game,a,'Craw Wurm'),c3=put(M,game,b,'Grizzly Bears');game.rnd=()=>0.5;await cast(f,'Last One Standing');await settle(game);assert.equal(c1.zone,'battlefield');assert.equal(c2.zone,'battlefield');assert.equal(c3.zone,'graveyard');assertGameStateInvariants(game);
 });
}
