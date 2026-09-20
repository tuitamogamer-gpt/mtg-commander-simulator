import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M,setup,card,body,play,activate,event,settle,fuel,mana} from './helpers/c21-fixtures.mjs';
import {precons,sourceDir,buildIntake} from '../scripts/import-c13-td0-sld-precons.mjs';
const count=c=>c.counters['+1/+1']||0;
const tokens=(f,p,type)=>f.game.creatures(p).filter(c=>c.isToken&&c.hasSub(type));
const aim=(f,...targets)=>{f.decide=(p,q)=>q.type==='chooseTargets'?targets.filter(c=>q.candidates.includes(c)).slice(0,q.max):q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;};
const empty=p=>{p.poolMeta=[];for(const k of Object.keys(p.pool))p.pool[k]=0;};
test('eight original lists, artwork, native cards, guides, AI profiles and repeatable intake',()=>{
 assert.equal(Object.keys(M.DECKS).length,169);assert.equal(Object.keys(M.DEFS).length,3949+M.ORACLE_BATCHES.filter(batch=>/^oracle-\d{4}$/.test(batch.id)).reduce((n,batch)=>n+batch.cards.length,0));
 assert.equal(buildIntake(M).newNames.length,0);const names=JSON.parse(fs.readFileSync(sourceDir+'/intake.json')).newNames;assert.equal(names.length,81);
 for(const d of precons){const deck=M.DECKS[d.name];assert.equal(deck.commander,d.commander);assert.equal(deck.cards.reduce((n,c)=>n+c.n,0),100);assert.ok(M.DECK_META[d.name]&&M.DECK_GUIDES[d.name]&&M.AI_DECK_PROFILE_HINTS[d.name]);assert.ok(fs.existsSync(M.CARD_ART_PATHS[d.commander]));for(const key of M.DECK_GUIDES[d.name].keys)assert.ok(deck.cards.some(c=>c.name===key),key);}
 for(const name of names){assert.ok(M.DEFS[name]&&!M.DEFS[name].autoScripted&&!M.DEFS[name].simplified,name);assert.ok(fs.existsSync(M.CARD_IMAGE_PATHS[name]),name);}
 assert.ok(M.DECKS['Blame Game']);assert.equal(M.CARD_CATALOG['Brisela, Voice of Nightmares'].deckImportEligible,false);
});
for(const role of ['human','ai']){
 test(role+': Derevi command ability pays four, uses the stack, and avoids commander tax',async()=>{
  const f=setup(role),d=card(f,'Derevi, Empyrial Tactician','command'),land=card(f,'Forest');d.commander=true;d.cmdCasts=3;land.tapped=true;f.decide=(p,q)=>q.type==='chooseTargets'?[land]:q.aiHint?.kind==='tapUntap'?'untap':q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;fuel(f.a);
  const entry=f.game.activatableList(f.a).find(e=>e.card===d&&e.c13Command);assert.ok(entry);const before=mana(f.a);assert.ok(await f.game.activateAbility(f.a,entry));assert.equal(mana(f.a),before-4);assert.ok(f.game.stack.some(s=>s.kind==='ability'));await settle(f.game);assert.equal(d.zone,'battlefield');assert.equal(d.cmdCasts,3);assert.equal(land.tapped,false);
 });
 test(role+': Oloro gains life in the command zone but draws only on the battlefield',async()=>{
  const f=setup(role),d=card(f,'Oloro, Ageless Ascetic','command');fuel(f.a);await event(f,'upkeep',{player:f.a});assert.equal(f.a.life,42);assert.equal(f.a.hand.length,0);
  await f.game.move(d,'battlefield');f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='pay')?'pay':q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;
  await event(f,'upkeep',{player:f.a});assert.equal(f.a.life,44);assert.equal(f.a.hand.length,1);assert.equal(f.b.life,39);
 });
 test(role+': Prossh makes six Kobolds on cast and can sacrifice one for power',async()=>{
  const f=setup(role),c=card(f,'Prossh, Skyraider of Kher','hand');fuel(f.a);assert.ok(await f.game.castSpell(f.a,c,{from:'hand'}));await f.game.flushTriggers();await f.game.resolveTop();assert.equal(tokens(f,f.a,'Kobold').length,6);assert.equal(c.zone,'stack');await settle(f.game);await activate(f,c);assert.equal(tokens(f,f.a,'Kobold').length,5);assert.equal(c.power,6);
 });
 test(role+': Marath counts paid mana, pays counters, and rejects zero',async()=>{
  const f=setup(role),c=await play(f,'Marath, Will of the Wild');assert.equal(count(c),3);f.x=2;aim(f,f.b);f.decide=(p,q)=>q.type==='chooseTargets'?[f.b]:q.type==='chooseX'?Math.min(2,q.max):undefined;await activate(f,c,1);assert.equal(count(c),1);assert.equal(f.b.life,38);
  f.decide=(p,q)=>q.type==='chooseX'?0:undefined;const e=f.game.activatableList(f.a).find(e=>e.card===c&&e.ability===c.def.abilities[2]);assert.equal(await f.game.activateAbility(f.a,e),false);assert.equal(count(c),1);
 });
 test(role+': Jeleva records paid mana and casts only a linked exiled spell on attack',async()=>{
  const f=setup(role),bolt=card(f,'Lightning Bolt','library',f.b),c=await play(f,"Jeleva, Nephalia's Scourge");assert.equal(f.a.exile.length,4);assert.equal(f.b.exile.length,4);assert.equal(bolt.zone,'exile');
  aim(f,f.b);await event(f,'attacks',{card:c,player:f.a,target:f.b});assert.equal(bolt.zone,'graveyard');assert.equal(f.b.life,37);
 });
 test(role+': meld yields one 9/10 permanent, mana value eleven and two physical cards on death',async()=>{
  const f=setup(role),a=card(f,'Gisela, the Broken Blade'),b=card(f,'Bruna, the Fading Light');await event(f,'endStep',{player:f.a});assert.equal(a.name,'Brisela, Voice of Nightmares');assert.equal(a.mv,11);assert.equal(a.power,9);assert.equal(a.toughness,10);assert.equal(f.game.creatures(f.a).length,1);assert.equal(b.zone,'merged');
  const cheap=card(f,'Grizzly Bears','hand',f.b);fuel(f.b);f.game.turnPlayer=f.b;assert.equal(await f.game.castSpell(f.b,cheap,{from:'hand'}),false);
  assert.deepEqual(Array.from(a.colors),['W']);await f.game.destroy(a);await settle(f.game);assert.equal(a.name,'Gisela, the Broken Blade');assert.equal(a.zone,'graveyard');assert.equal(b.zone,'graveyard');
 });
 test(role+': a token copy of Gisela cannot meld with a physical Bruna',async()=>{
  const f=setup(role),a=card(f,'Gisela, the Broken Blade'),b=card(f,'Bruna, the Fading Light');a.isToken=true;await event(f,'endStep',{player:f.a});assert.equal(a.zone,'ceased');assert.equal(b.zone,'exile');assert.equal(f.game.creatures(f.a).length,0);
 });
 test(role+': Naya Soulbeast cast trigger sets entry counters from all revealed mana values',async()=>{
  const f=setup(role);card(f,'Grizzly Bears','library');card(f,'Wind Drake','library',f.b);const c=await play(f,'Naya Soulbeast');assert.equal(count(c),5);assert.equal(c.power,5);
 });
 test(role+': both Stormscape kicker costs are independent and paid',async()=>{
  const f=setup(role),b=body(f,f.b);aim(f,b);const c=await play(f,'Stormscape Battlemage');assert.ok(c.castMeta.c13KickWhite&&c.castMeta.c13KickBlack);assert.equal(f.a.life,43);assert.equal(b.zone,'graveyard');
 });
 test(role+': Djinn exchanges control and Brooding Saurian restores owners',async()=>{
  const f=setup(role),s=card(f,'Djinn of Infinite Deceits'),a=body(f),b=body(f,f.b);aim(f,a,b);await activate(f,s);assert.equal(a.ctrl,f.b);assert.equal(b.ctrl,f.a);card(f,'Brooding Saurian');await event(f,'endStep',{player:f.b});assert.equal(a.ctrl,f.a);assert.equal(b.ctrl,f.b);
 });
 test(role+': Magus lets the opponent select their creature and then taps and fights',async()=>{
  const f=setup(role),s=card(f,'Magus of the Arena'),a=body(f),b=body(f,f.b);aim(f,a,b);await activate(f,s);assert.equal(a.zone,'graveyard');assert.equal(b.zone,'graveyard');assert.ok(s.tapped);
 });
 test(role+': Illusionary Mask spends matching colored mana, casts face down, and reveals before tapping',async()=>{
  const f=setup(role),s=card(f,'Illusionary Mask'),b=card(f,'Grizzly Bears','hand');f.x=2;f.decide=(p,q)=>q.type==='chooseCards'&&q.from.includes(b)?[b]:q.type==='chooseX'?2:undefined;empty(f.a);f.a.pool.G=2;
  const e=f.game.activatableList(f.a).find(e=>e.card===s);assert.ok(await f.game.activateAbility(f.a,e));await settle(f.game);assert.equal(b.zone,'battlefield');assert.ok(b.faceDown);assert.equal(b.mv,0);assert.equal(f.game.faceUpCosts(b).length,0);f.game.tap(b);await f.game.flushTriggers();assert.equal(b.faceDown,false);assert.equal(b.name,'Grizzly Bears');assert.ok(b.tapped);
  assert.equal(M.C13.maskAffordable('{G}',{U:9}),false);assert.ok(M.C13.maskAffordable('{1}{G}',{G:1,U:1}));assert.equal(M.StarterCasting.allowed(f.game,f.a,card(f,'Grizzly Bears','hand'),{starterPermission:'c13Mask',faceDownCast:'c13Mask',free:true}),false);
 });
 test(role+': Mask reveals before damage and before assigning combat damage',async()=>{
  const f=setup(role),c=card(f,'Rootbreaker Wurm','hand');await f.game.putFaceDown(f.a,c,'c13Mask');assert.equal(c.power,2);assert.equal(f.game.dmgAmount(c,'normal'),6);assert.equal(c.faceDown,false);
  const b=body(f);await f.game.putFaceDown(f.a,b,'c13Mask');await f.game.damageAny(c,b,1);assert.equal(b.faceDown,false);assert.equal(b.damage,1);
 });
 test(role+': Mask accounts for snow and hybrid mana without spending activation taxes as X',()=>{
  assert.ok(M.C13.maskAffordable('{W}{S}',{W:1,U:1},{W:1,U:1},2));assert.equal(M.C13.maskAffordable('{W}{S}',{W:1,U:1},{W:1},2),false);
  assert.ok(M.C13.maskAffordable('{2/G}',{G:1},{},1));assert.equal(M.C13.maskAffordable('{2}',{G:2},{},1),false);assert.ok(M.C13.maskAffordable('{0}',{}, {},0));
 });
 test(role+': Mask reveals before simultaneous damage snapshots collect lifelink',async()=>{
  const f=setup(role),c=card(f,'Gisela, the Broken Blade','hand');await f.game.putFaceDown(f.a,c,'c13Mask');await f.game.damageBatch([{src:c,target:f.b,n:2}]);await settle(f.game);assert.equal(c.faceDown,false);assert.equal(f.a.life,42);assert.equal(f.b.life,38);
 });
 test(role+': Primal Vigor doubles tokens and counters for every player',async()=>{
  const f=setup(role);card(f,'Primal Vigor');const a=body(f),b=body(f,f.b);f.game.addCounters(a,'+1/+1',2,false,f.a);f.game.addCounters(b,'+1/+1',1,false,f.b);assert.equal(count(a),4);assert.equal(count(b),2);await f.game.makeTokens(M.TOKENS.saproling,f.b,{n:2});assert.equal(tokens(f,f.b,'Saproling').length,4);
 });
 test(role+': All Hallow’s Eve counts two own upkeeps then returns all graveyard creatures',async()=>{
  const f=setup(role),a=card(f,'Grizzly Bears','graveyard'),b=card(f,'Wind Drake','graveyard',f.b),s=await play(f,"All Hallow's Eve");assert.equal(s.zone,'exile');assert.equal(s.counters.scream,2);await event(f,'upkeep',{player:f.b});assert.equal(s.counters.scream,2);await event(f,'upkeep',{player:f.a});assert.equal(s.counters.scream,1);await event(f,'upkeep',{player:f.a});assert.equal(s.zone,'graveyard');assert.equal(a.zone,'battlefield');assert.equal(b.zone,'battlefield');
 });
 test(role+': Night Soil exiles exactly two creatures as its activation cost',async()=>{
  const f=setup(role),s=card(f,'Night Soil'),a=card(f,'Grizzly Bears','graveyard',f.b),b=card(f,'Wind Drake','graveyard',f.b);fuel(f.a);const e=f.game.activatableList(f.a).find(e=>e.card===s);assert.ok(await f.game.activateAbility(f.a,e));assert.equal(a.zone,'exile');assert.equal(b.zone,'exile');assert.equal(tokens(f,f.a,'Saproling').length,0);await settle(f.game);assert.equal(tokens(f,f.a,'Saproling').length,1);
 });
 test(role+': Hinder counters to the library and Overwhelming Intellect draws its mana value',async()=>{
  const f=setup(role),c=card(f,'Grizzly Bears','hand',f.b);f.game.turnPlayer=f.b;fuel(f.b);assert.ok(await f.game.castSpell(f.b,c,{from:'hand'}));aim(f,f.game.stack.at(-1));await play(f,'Hinder');assert.equal(c.zone,'library');
  const b=card(f,'Wind Drake','hand',f.b);assert.ok(await f.game.castSpell(f.b,b,{from:'hand'}));aim(f,f.game.stack.at(-1));const n=f.a.hand.length;await play(f,'Overwhelming Intellect');assert.equal(b.zone,'graveyard');assert.equal(f.a.hand.length,n+3);
 });
 test(role+': Fireball divides X and charges for every target beyond the first',async()=>{
  const f=setup(role),c=card(f,'Fireball','hand');f.x=6;aim(f,f.b,f.others[1]);fuel(f.a);const before=mana(f.a);assert.ok(await f.game.castSpell(f.a,c,{from:'hand',xVal:6}));assert.equal(mana(f.a),before-8);await settle(f.game);assert.equal(f.b.life,37);assert.equal(f.others[1].life,37);
 });
 test(role+': Book grants the Angel a lasting ability independent of the counter',async()=>{
  const f=setup(role),s=card(f,'The Book of Exalted Deeds'),a=card(f,'Gisela, the Broken Blade');aim(f,a);await activate(f,s);assert.equal(s.zone,'exile');assert.equal(f.game.canLoseGame(f.a),false);assert.equal(f.game.canWinGame(f.b),false);f.game.removeCounters(a,'enlightened',1);assert.equal(f.game.canLoseGame(f.a),false);await f.game.move(a,'hand');assert.equal(f.game.canLoseGame(f.a),true);
 });
 test(role+': Angel of Destiny rewards combat damage and eliminates only attacked players',async()=>{
  const f=setup(role),s=card(f,'Angel of Destiny'),b=body(f);await f.game.damagePlayer(b,f.b,2,{combat:false});await settle(f.game);assert.equal(f.a.life,40);await f.game.damagePlayer(b,f.b,2,{combat:true});await settle(f.game);assert.equal(f.a.life,42);assert.equal(f.b.life,38);
  await event(f,'attacks',{card:s,player:f.a,target:f.b});f.a.life=55;await event(f,'endStep',{player:f.a});assert.ok(f.b.lost);assert.equal(f.others[1].lost,false);
 });
 test(role+': Curse of Predation counts each attacker and Shallow Graves only once per attack',async()=>{
  const f=setup(role);aim(f,f.b);await play(f,'Curse of Predation');await play(f,'Curse of Shallow Graves');const a=body(f),b=body(f);a.attacking=b.attacking=f.b;await event(f,'attacks',{card:a,player:f.a,target:f.b});await event(f,'attacks',{card:b,player:f.a,target:f.b});await event(f,'attackersDeclared',{player:f.a,attackers:[a,b]});assert.equal(count(a),1);assert.equal(count(b),1);assert.equal(tokens(f,f.a,'Zombie').length,1);assert.ok(tokens(f,f.a,'Zombie')[0].tapped);
 });
 test(role+': Surveyor Scope counts opposing land advantage at resolution',async()=>{
  const f=setup(role),s=card(f,"Surveyor's Scope");card(f,'Forest','battlefield',f.b);card(f,'Island','battlefield',f.b);await activate(f,s);assert.equal(s.zone,'exile');assert.equal(f.game.lands(f.a).length,1);assert.equal(f.game.lands(f.a)[0].tapped,false);
 });
 test(role+': Surveyor Scope searches for zero basics when no opponent has the required land advantage',async()=>{
  const f=setup(role),s=card(f,"Surveyor's Scope"),before=f.a.library.length;
  await activate(f,s);
  assert.equal(s.zone,'exile');assert.equal(f.game.lands(f.a).length,0);assert.equal(f.a.library.length,before);
 });
 test(role+': Widespread Panic follows a resolving search with a hand-to-library trigger',async()=>{
  const f=setup(role);card(f,'Widespread Panic');const b=card(f,'Grizzly Bears','hand');await play(f,'Rampant Growth');assert.equal(b.zone,'library');assert.equal(f.a.hand.length,0);
 });
 test(role+': Search for Glory counts mana from snow sources',async()=>{
  const f=setup(role),s=card(f,'Search for Glory','hand'),a=card(f,'Gisela, the Broken Blade','library');for(let i=0;i<3;i++)card(f,'Snow-Covered Plains');empty(f.a);f.decide=(p,q)=>q.type==='chooseCards'&&q.from.includes(a)?[a]:undefined;assert.ok(await f.game.castSpell(f.a,s,{from:'hand'}));await settle(f.game);assert.equal(a.zone,'hand');assert.equal(f.a.life,43);
 });
 test(role+': Genesis returns a targeted creature from the graveyard on payment',async()=>{
  const f=setup(role);card(f,'Genesis','graveyard');const b=card(f,'Grizzly Bears','graveyard');aim(f,b);fuel(f.a);await event(f,'upkeep',{player:f.a});assert.equal(b.zone,'hand');
 });
 test(role+': Jeleva reanimation exiles zero cards and cannot use a previous incarnation’s cards',async()=>{
  const f=setup(role),s=await play(f,"Jeleva, Nephalia's Scourge");const n=f.a.exile.length;await f.game.move(s,'graveyard');await f.game.putPermanentOntoBattlefield(s,f.a);await settle(f.game);assert.equal(f.a.exile.length,n);assert.equal(s.meta.c13Jeleva.length,0);assert.equal(f.a.library.length,26);
 });
 test(role+': Serene Master sets exchanged power only until the end of combat',async()=>{
  const f=setup(role),s=card(f,'Serene Master'),a=card(f,'Rootbreaker Wurm','battlefield',f.b);aim(f,a);f.game.combat={attackers:[a]};a.blockedBy=[s];s.blocking=a;await event(f,'blocks',{blocker:s,attacker:a});assert.equal(s.power,6);assert.equal(a.power,0);await f.game.endCombatStep(f.b);assert.equal(s.power,0);assert.equal(a.power,6);
 });
 test(role+': Breathkeeper’s paired creatures return at their controller’s next upkeep',async()=>{
  const f=setup(role),b=body(f);f.decide=(p,q)=>q.type==='chooseCards'&&q.from.includes(b)?[b]:q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;const s=await play(f,'Breathkeeper Seraph');assert.equal(M.OracleV8Soulbond.partner(f.game,s),b);await f.game.destroyMany([b,s]);await settle(f.game);await event(f,'upkeep',{player:f.b});assert.equal(b.zone,'graveyard');await event(f,'upkeep',{player:f.a});assert.equal(b.zone,'battlefield');assert.equal(s.zone,'battlefield');
 });
 test(role+': a simultaneously entering Primal Vigor does not double its co-entrant’s counters',async()=>{
  const f=setup(role),v=card(f,'Primal Vigor','hand'),c=card(f,'Spike Feeder','hand');await f.game.withBattlefieldEntryBatch(async()=>{await f.game.putPermanentOntoBattlefield(v,f.a);await f.game.putPermanentOntoBattlefield(c,f.a);});await settle(f.game);assert.equal(count(c),2);f.game.addCounters(c,'+1/+1',1,false,f.a);assert.equal(count(c),4);
 });
 test(role+': Righteous Valkyrie counts entering toughness and grants the life-threshold bonus',async()=>{
  const f=setup(role),s=card(f,'Righteous Valkyrie'),b=await play(f,'Gisela, the Broken Blade');assert.equal(f.a.life,43);await f.game.gainLife(f.a,4);f.game.recalc();assert.equal(s.power,4);assert.equal(b.power,6);
 });
 test(role+': Ajani creates a named Pridemate with its own life-gain trigger',async()=>{
  const f=setup(role),s=await play(f,'Ajani, Strength of the Pride');await activate(f,s,1);const b=tokens(f,f.a,'Cat')[0];assert.ok(b.hasSub('Soldier'));assert.equal(b.name,"Ajani's Pridemate");await f.game.gainLife(f.a,1);await settle(f.game);assert.equal(count(b),1);
 });
 test(role+': all tempting opponents add another benefit for the caster',async()=>{
  const f=setup(role),a=body(f),b=body(f,f.b);aim(f,a);await play(f,'Tempt with Glory');assert.equal(count(a),3);assert.equal(count(b),1);await play(f,'Tempt with Reflections');assert.equal(tokens(f,f.a,'Bear').length,3);assert.equal(tokens(f,f.b,'Bear').length,1);assert.equal(tokens(f,f.others[1],'Bear').length,1);
 });
 test(role+': tempting decisions finish before any opponent receives a token',async()=>{
  const f=setup(role),a=body(f);let choices=0;f.decide=(p,q)=>{
   if(q.type==='chooseTargets')return [a];
   if(q.type==='chooseOption'&&q.prompt.includes('Accept the tempting offer')){assert.equal(tokens(f,f.b,'Bear').length,0);assert.equal(tokens(f,f.others[1],'Bear').length,0);choices++;return 'yes';}
  };await play(f,'Tempt with Reflections');assert.equal(choices,2);assert.equal(tokens(f,f.a,'Bear').length,3);
 });
 test(role+': From the Ashes replaces destroyed nonbasics and leaves basic lands',async()=>{
  const f=setup(role),a=card(f,'Command Tower'),b=card(f,'Command Tower','battlefield',f.b),basic=card(f,'Forest');aim(f);await play(f,'From the Ashes');assert.equal(a.zone,'graveyard');assert.equal(b.zone,'graveyard');assert.equal(basic.zone,'battlefield');assert.equal(f.game.lands(f.a).length,2);assert.equal(f.game.lands(f.b).length,1);
 });
 test(role+': Jar of Eyeballs with zero counters looks at nothing; deaths fund its later activation',async()=>{
  const f=setup(role),s=card(f,'Jar of Eyeballs');await activate(f,s);assert.equal(f.a.hand.length,0);s.tapped=false;const b=body(f);await f.game.sacrifice(f.a,b);await settle(f.game);assert.equal(s.counters.eyeball,2);await activate(f,s);assert.equal(s.counters.eyeball,0);assert.equal(f.a.hand.length,1);
 });
 test(role+': Fell Shepherd returns only cards still in the graveyard from this turn’s deaths',async()=>{
  const f=setup(role),s=card(f,'Fell Shepherd'),a=body(f),b=body(f);await f.game.sacrifice(f.a,a);await f.game.sacrifice(f.a,b);await f.game.move(b,'hand');await f.game.move(b,'graveyard');aim(f);await f.game.damagePlayer(s,f.b,8,{combat:true});await settle(f.game);assert.equal(a.zone,'hand');assert.equal(b.zone,'graveyard');
 });
 test(role+': Plague Boiler sacrifices itself before destroying nonland permanents',async()=>{
  const f=setup(role),s=card(f,'Plague Boiler'),b=body(f),land=card(f,'Forest');for(let i=0;i<3;i++)await event(f,'upkeep',{player:f.a});assert.equal(s.zone,'graveyard');assert.equal(b.zone,'graveyard');assert.equal(land.zone,'battlefield');
 });
 test(role+': Act of Authority exiles then gives itself to the exiled permanent’s controller',async()=>{
  const f=setup(role),a=card(f,'Sol Ring','battlefield',f.b);aim(f,a);const s=await play(f,'Act of Authority');assert.equal(a.zone,'exile');const b=card(f,'Sol Ring','battlefield',f.b);aim(f,b);await event(f,'upkeep',{player:f.a});assert.equal(b.zone,'exile');assert.equal(s.ctrl,f.b);
 });
 test(role+': Cradle turns a paid life-gain trigger into that many counters',async()=>{
  const f=setup(role),s=card(f,'Cradle of Vitality'),b=body(f);aim(f,b);fuel(f.a);await f.game.gainLife(f.a,3);await settle(f.game);assert.equal(count(b),3);
 });
 test(role+': Vile Requiem uses counters before sacrifice and destroys the selected nonblack creatures',async()=>{
  const f=setup(role),s=card(f,'Vile Requiem'),a=body(f,f.b),b=card(f,'Wind Drake','battlefield',f.b);s.counters.verse=2;aim(f,a,b);await activate(f,s);assert.equal(s.zone,'graveyard');assert.equal(a.zone,'graveyard');assert.equal(b.zone,'graveyard');
 });
 test(role+': Witch Hunt prevents all life gain, damages its controller and changes control',async()=>{
  const f=setup(role),s=card(f,'Witch Hunt');await f.game.gainLife(f.a,4);await f.game.gainLife(f.b,4);assert.equal(f.a.life,40);assert.equal(f.b.life,40);await event(f,'upkeep',{player:f.a});assert.equal(f.a.life,36);await event(f,'endStep',{player:f.a});assert.notEqual(s.ctrl,f.a);
 });
 test(role+': Crawlspace, Mystic Barrier and Tithes constrain attacks; unpaid block taxes remove blockers',async()=>{
  const f=setup(role),space=card(f,'Crawlspace'),atks=[body(f,f.b),body(f,f.b),body(f,f.b)];for(const a of atks)a.attacking=f.a;assert.equal(f.game.attackGroupLegal(atks),false);assert.ok(f.game.attackGroupLegal(atks.slice(0,2)));const barrier=card(f,'Mystic Barrier');barrier.meta.c13Direction='left';assert.equal(f.game.canAttackTarget(atks[0],f.a),false);assert.ok(f.game.canAttackTarget(atks[0],f.others[1]));
  card(f,'Archangel of Tithes');assert.equal(f.game.c21AttackTax(atks[0],f.a),1);const b=body(f);atks[0].blockedBy=[b];b.blocking=atks[0];f.game.untilEffects.push({kind:'c13BlockTax',n:2,expires:'eot'});empty(f.a);await f.game.c13PayBlockTaxes(atks,f.a);assert.equal(atks[0].blockedBy.length,0);
 });
 test(role+': Sword of the Paruns changes its bonus when its equipped creature taps',async()=>{
  const f=setup(role),s=card(f,'Sword of the Paruns'),a=body(f),b=body(f);await f.game.attach(s,a);f.game.recalc();assert.equal(a.toughness,4);assert.equal(b.toughness,4);f.game.tap(a);f.game.recalc();assert.equal(a.power,4);assert.equal(a.toughness,2);assert.equal(b.power,2);
 });
 test(role+': Flickerform returns its creature and Auras attached under their owners’ control',async()=>{
  const f=setup(role),b=body(f);aim(f,b);const s=await play(f,'Flickerform');await activate(f,s);assert.equal(b.zone,'exile');assert.equal(s.zone,'exile');await event(f,'endStep',{player:f.b});assert.equal(b.zone,'battlefield');assert.equal(s.zone,'battlefield');assert.equal(s.attachedTo,b.iid);
 });
 test(role+': Reincarnation returns a creature from the dead creature’s owner’s graveyard',async()=>{
  const f=setup(role),b=body(f);aim(f,b);await play(f,'Reincarnation');await f.game.destroy(b);await settle(f.game);assert.equal(b.zone,'battlefield');
 });
 test(role+': Endrek creates Thrulls from mana value and sacrifices itself at seven',async()=>{
  const f=setup(role),s=card(f,'Endrek Sahr, Master Breeder');await play(f,'Rootbreaker Wurm');assert.equal(s.zone,'graveyard');assert.equal(tokens(f,f.a,'Thrull').length,7);
 });
 test(role+': Capsize’s paid buyback returns the spell to hand',async()=>{
  const f=setup(role),b=body(f,f.b);aim(f,b);const s=await play(f,'Capsize');assert.equal(s.zone,'hand');assert.equal(b.zone,'hand');
 });
 test(role+': paid Chain Lightning copy belongs to the damaged player',async()=>{
  const f=setup(role),s=card(f,'Chain Lightning','hand');f.decide=(p,q)=>q.type==='chooseTargets'?[p===f.a?f.b:f.a]:q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;fuel(f.a);f.b.pool.R=2;assert.ok(await f.game.castSpell(f.a,s,{from:'hand'}));empty(f.a);await settle(f.game);assert.equal(f.b.life,37);assert.equal(f.a.life,37);assert.equal(f.b.pool.R,0);
 });
 test(role+': Springjack sacrifices Goats for one color and gains that much life',async()=>{
  const f=setup(role),s=card(f,'Springjack Pasture');await f.game.makeTokens(M.C13.goat,f.a,{n:2});f.game.recalc();const source=f.game.manaSources(f.a).find(r=>r.card===s&&r.m.cost.sacN===2);assert.ok(source);empty(f.a);assert.notEqual(await f.game.activateManaSource(f.a,source,{G:2},null,[]),false);assert.equal(tokens(f,f.a,'Goat').length,0);assert.equal(f.a.pool.G,2);assert.equal(f.a.life,42);
 });
 test(role+': Nykthos pays two and produces the chosen devotion',async()=>{
  const f=setup(role),s=card(f,'Nykthos, Shrine to Nyx');card(f,'Genesis');card(f,'Rootbreaker Wurm');empty(f.a);f.a.pool.C=2;f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.mana?.G===3)?q.options.find(o=>o.mana?.G===3).key:undefined;const entry=f.game.activatableList(f.a).find(r=>r.card===s&&r.manaSource?.m.cost.mana);assert.ok(entry);assert.ok(await f.game.activateAbility(f.a,entry));assert.equal(f.a.pool.C,0);assert.equal(f.a.pool.G,3);
 });
}
