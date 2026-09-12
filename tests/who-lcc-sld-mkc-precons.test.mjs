import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M,setup,card,body,play,activate,event,settle,fuel,mana} from './helpers/c21-fixtures.mjs';
import {buildIntake,sourceDir} from '../scripts/import-who-lcc-sld-mkc-precons.mjs';
import {assertGameStateInvariants,assertRecalculationStable} from './helpers/game-state-invariants.mjs';
const context=(f,c)=>({g:f.game,you:f.a,src:c,sourceMeta:c.meta,sourceZoneVersion:c.zoneVersion});

test('ten original 100-card precons preserve source lists, native implementations, guides, images and default pairs',()=>{
 const i=buildIntake(M),intake=JSON.parse(fs.readFileSync(sourceDir+'/intake.json'));
 assert.equal(i.decks.length,10);assert.equal(i.names.length,681);assert.equal(i.newNames.length,0);assert.equal(intake.newCards,209);assert.equal(intake.reusedCards,472);
 for(const d of i.decks){
  assert.deepEqual(JSON.parse(JSON.stringify(M.DECKS[d.name].cards)),d.cards);assert.equal(d.cards.reduce((n,c)=>n+c.n,0),100);
  assert.ok(M.DECK_META[d.name]);assert.ok(M.DECK_GUIDE_ROUTES[M.DECK_GUIDES[d.name].route]);
  const pair=[d.commander,...(d.partner?[d.partner]:[])];assert.deepEqual(Array.from(M.defaultCommanders(M.DECKS[d.name])),pair);
  assert.equal(M.validateCommanders(M.DECKS[d.name],pair,M.DEFS).ok,true);
  for(const name of pair)assert.ok(fs.existsSync(M.CARD_ART_PATHS[name]),name+' commander art');
 }
 for(const name of intake.newNames){assert.ok(M.SCRIPTS[name],name);assert.ok(!M.DEFS[name].autoScripted&&!M.DEFS[name].simplified,name);assert.ok(M.CARD_CATALOG[name].deckImportEligible,name);}
 assert.equal(Object.keys(M.DECKS).length,150);assert.equal(M.CATALOG_SUMMARY.importableCards,21541);
});

for(const role of ['human','ai']){
 test(`${role}: a permitted top-library Merfolk can pay kicker without allowing pre-injected payment flags`,async()=>{const f=setup(role);card(f,'Emperor Mihail II');const a=card(f,'Arcane Signet','battlefield',f.b),c=card(f,'Thieving Skydiver','library');fuel(f.a);const row=f.game.castableList(f.a).find(r=>r.card===c);assert.ok(row);assert.equal(await f.game.castSpell(f.a,c,{from:'library',alt:{...row.alt,_kicked:true,_kickerX:2}}),false);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt?.includes('Kicker')?'yes':q.type==='chooseX'?2:q.type==='chooseTargets'?[a]:undefined;assert.equal(await f.game.castSpell(f.a,c,{from:'library',alt:row.alt}),true);await settle(f.game);assert.equal(c.castMeta.manaSpent,4);assert.equal(a.ctrl,f.a);});
 test(`${role}: March of the Canonized rechecks devotion and resolves without a callback error`,async()=>{const f=setup(role);card(f,'March of the Canonized');const w=card(f,'Clavileño, First of the Blessed');card(f,'Order of Sacred Dusk');card(f,'Dusk Legion Zealot');assert.equal(f.game.devotion(f.a,['W','B']),7);await event(f,'upkeep',{player:f.a});assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.hasSub('Demon')).length,1);await f.game.emit('upkeep',{player:f.a});await f.game.flushTriggers();await f.game.move(w,'hand');await settle(f.game);assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.hasSub('Demon')).length,1);});
 test(`${role}: Skydiver pays positive X kicker and steals only an affordable artifact`,async()=>{const f=setup(role),a=card(f,'Arcane Signet','battlefield',f.b);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt?.includes('Kicker')?'yes':q.type==='chooseX'?2:q.type==='chooseTargets'?[a]:undefined;const c=await play(f,'Thieving Skydiver');assert.equal(c.castMeta.manaSpent,4);assert.equal(a.ctrl,f.a);assert.equal(c.castMeta.alt._kickerX,2);});
 test(`${role}: Skydiver rejects zero kicker before spending mana`,async()=>{const f=setup(role),c=card(f,'Thieving Skydiver','hand');fuel(f.a);const before=mana(f.a);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt?.includes('Kicker')?'yes':q.type==='chooseX'?0:undefined;assert.equal(await f.game.castSpell(f.a,c,{from:'hand'}),false);assert.equal(mana(f.a),before);assert.equal(c.zone,'hand');});
 test(`${role}: evolve uses the entering creature's last battlefield characteristics`,async()=>{const f=setup(role),egg=card(f,'Dinosaur Egg'),big=card(f,'Grizzly Bears','hand');await f.game.putPermanentOntoBattlefield(big,f.a);await f.game.flushTriggers();await f.game.move(big,'graveyard');await settle(f.game);assert.equal(egg.counters['+1/+1'],1);});
 test(`${role}: Deeproot Historian retraces Druids and pays a discarded land`,async()=>{const f=setup(role);card(f,'Deeproot Historian');const c=card(f,'Llanowar Elves','graveyard'),land=card(f,'Forest','hand');fuel(f.a);const r=f.game.castableList(f.a).find(r=>r.card===c&&r.alt.wlmKind==='retrace');assert.ok(r);f.decide=(p,q)=>q.type==='chooseCards'&&q.from.includes(land)?[land]:undefined;assert.equal(await f.game.castSpell(f.a,c,{from:c.zone,alt:r.alt}),true);await settle(f.game);assert.equal(c.zone,'battlefield');assert.equal(land.zone,'graveyard');});
 test(`${role}: Indomitable requires three tapped Pirates or Vehicles, including uncrewed Vehicles`,()=>{const f=setup(role),c=card(f,'The Indomitable','graveyard');fuel(f.a);const ships=[card(f,'Smuggler\'s Copter'),card(f,'Sol Ring'),card(f,'Malcolm, Keen-Eyed Navigator')];ships.forEach(c=>c.tapped=true);assert.ok(!f.game.castableList(f.a).some(r=>r.card===c));const third=card(f,'Breeches, Brazen Plunderer');third.tapped=true;assert.ok(f.game.castableList(f.a).some(r=>r.card===c));ships[0].tapped=false;assert.ok(!f.game.castableList(f.a).some(r=>r.card===c));});
 test(`${role}: Fourth Doctor permits the historic face, excluding its nonhistoric Adventure`,()=>{const f=setup(role);card(f,'The Fourth Doctor');const c=card(f,M.resolveDeckCardName('Karvanista, Loyal Lupari'),'library');fuel(f.a);const rows=f.game.castableList(f.a).filter(r=>r.card===c);assert.ok(rows.length);assert.ok(rows.every(r=>!r.alt.adventure));});
 test(`${role}: River Song triggers once for searching, including a failed search`,async()=>{const f=setup(role),river=card(f,'River Song');const before=f.b.life;await M.E.searchBasic(f.game,f.b,{filter:()=>false});await settle(f.game);assert.equal(river.counters['+1/+1'],1);assert.equal(f.b.life,before-river.power);await M.WLM.search({...context(f,river),you:f.b},f.b,()=>false,1);await settle(f.game);assert.equal(river.counters['+1/+1'],2);});
 test(`${role}: Leela skips only the first draw in an opponent's draw step`,async()=>{const f=setup(role),c=card(f,'Leela, Sevateem Warrior');f.game.turnPlayer=f.b;f.game.phase='draw';await f.game.draw(f.b,2);await settle(f.game);assert.equal(c.counters['+1/+1'],1);});
 test(`${role}: First Doctor sees cascade granted to the next spell`,async()=>{const f=setup(role),d=card(f,'The First Doctor');f.a.nextCascade=[()=>true];await play(f,'Sol Ring');assert.equal(d.counters['+1/+1'],1);});
 test(`${role}: Ace's Bat requires one legal Dalek blocker without forcing every Dalek`,async()=>{const f=setup(role),a=body(f),bat=card(f,"Ace's Baseball Bat"),[d1,d2]=await f.game.makeTokens(M.WLM.dalek,f.b,{n:2});await f.game.attach(bat,a);a.attacking=f.b;f.game.recalc();a.blockedBy=[d1];d1.blocking=a.iid;f.game.completeRequiredBlocks([a],[d1,d2]);assert.equal(a.blockedBy.length,1);assert.ok(a.blockedBy[0].hasSub('Dalek'));assertGameStateInvariants(f.game);});
 test(`${role}: Foragers fixes X to the exiled target and pays X plus white`,async()=>{const f=setup(role),c=card(f,'Bronzebeak Foragers'),target=card(f,'Grizzly Bears','exile',f.b);c.meta.wlmExiled=[{iid:target.iid,version:target.zoneVersion}];fuel(f.a);const before=mana(f.a),life=f.a.life;f.decide=(p,q)=>q.type==='chooseTargets'?[target]:undefined;await activate(f,c);assert.equal(target.zone,'graveyard');assert.equal(f.a.life,life+2);assert.equal(before-mana(f.a),3);});
 test(`${role}: Lazav pays the selected creature's mana value and retains its copy ability`,async()=>{const f=setup(role),c=card(f,'Lazav, the Multifarious'),target=card(f,'Grizzly Bears','graveyard');f.decide=(p,q)=>q.type==='chooseTargets'?[target]:undefined;await activate(f,c);assert.equal(c.name,'Lazav, the Multifarious');assert.equal(c.power,2);assert.equal(c.def.abilities.length,1);});
 test(`${role}: simultaneous damage to two players creates two separate Quartzwood triggers`,async()=>{const f=setup(role,3),c=card(f,'Quartzwood Crasher');await f.game.damageBatch([{src:c,target:f.b,n:2},{src:c,target:f.game.players[2],n:3}],{combat:true});assert.equal(f.game.pendingTriggers.filter(t=>t.src===c||t.srcCard===c).length,2);await settle(f.game);assert.equal(f.game.creatures(f.a).filter(t=>t.isToken&&t.hasSub('Dinosaur')).length,2);});
 test(`${role}: mass graveyard return triggers Skeleton Crew once per batch`,async()=>{const f=setup(role),c=card(f,'Skeleton Crew'),a=card(f,'Grizzly Bears','graveyard'),b=card(f,'Llanowar Elves','graveyard');await M.WLM.enterMany(context(f,c),[a,b]);await settle(f.game);assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.hasSub('Skeleton')).length,1);assertRecalculationStable(f.game);});
 test(`${role}: Diary's resolved imprint trigger remains effective after the Diary leaves`,async()=>{const f=setup(role),d=card(f,"River Song's Diary"),c=card(f,'Divination','hand');fuel(f.a);await f.game.castSpell(f.a,c,{from:'hand'});await f.game.flushTriggers();await f.game.resolveTop();await f.game.move(d,'graveyard');await settle(f.game);assert.equal(c.zone,'exile');});
 test(`${role}: temporary graveyard permission blocks a lossy checkpoint and expires`,()=>{const f=setup(role),c=card(f,'Divination','graveyard');M.WLM.castGrant(context(f,body(f)),c);assert.ok(M.gameStateSnapshotBlockers(f.game).some(s=>s.includes('graveyard casting')));f.game.turnNo++;assert.ok(!M.WLM.snapshotBlockers(f.game).length);});
}

test('Clara commander color is per game and contributes exactly one missing identity color',async()=>{
 const deck=M.DECKS['Paradox Power'],pair=['The Thirteenth Doctor','Clara Oswald'];assert.ok(M.validateCommanders(deck,pair,M.DEFS).ok);
 const f=setup();f.a.library=[];f.game.buildDeck(f.a,deck,M.DEFS,pair);f.game.recalc();const c=f.a.commanders.find(c=>c.def.wlmClara);
 assert.equal(f.a.wlmClaraColor,'R');assert.deepEqual(Array.from(c.colors),['R']);assert.ok(f.a.colorIdentity.includes('R'));
 assert.deepEqual(Array.from(M.cardColorIdentity(M.DEFS['Clara Oswald'])),[]);
 await f.game.move(c,'battlefield');assert.deepEqual(Array.from(c.colors),['R']);await f.game.move(c,'hand',{skipCommanderReplacement:true});assert.deepEqual(Array.from(c.colors),['R']);
});

test('AI simulation owns its graveyard grants and Necromancy cleanup objects independently',async()=>{
 const f=setup('ai'),target=card(f,'Grizzly Bears','graveyard');f.game.phase='upkeep';
 f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:undefined;
 const aura=await play(f,'Necromancy'),spell=card(f,'Divination','graveyard');M.WLM.castGrant(context(f,aura),spell);
 const clone=M.cloneGameForAISimulation(f.game,551),clonedSpell=clone.byIid(spell.iid);
 assert.notEqual(clone.wlmCastGrants,f.game.wlmCastGrants);clone.wlmCastGrants[0].turn++;
 assert.equal(f.game.wlmCastGrants[0].turn,f.game.turnNo);assert.notEqual(clonedSpell,spell);
 await clone.emit('cleanupStep',{player:clone.turnPlayer});await settle(clone);
 assert.equal(clone.byIid(aura.iid).zone,'graveyard');assert.equal(aura.zone,'battlefield');assert.equal(target.zone,'battlefield');
 assertGameStateInvariants(f.game);assertGameStateInvariants(clone);
});

test('a JSON checkpoint preserves Clara’s chosen color and commander identity',()=>{
 const f=setup(),deck=M.DECKS['Paradox Power'];f.a.library=[];f.a.deck=deck;f.a.deckName=deck.name;
 f.game.buildDeck(f.a,deck,M.DEFS,['The Thirteenth Doctor','Clara Oswald']);
 const snapshot=M.captureGameState(f.game);assert.ok(snapshot);
 const restored=new M.Game({seed:1,paced:false});for(const p of f.game.players)restored.addPlayer(p.name,p.deck,null,p.isAI);M.restoreGameState(restored,JSON.parse(JSON.stringify(snapshot)));
 const player=restored.players[f.a.idx],clara=player.commanders.find(c=>c.def.wlmClara);
 assert.equal(player.wlmClaraColor,'R');assert.deepEqual(Array.from(clara.colors),['R']);assert.ok(player.colorIdentity.includes('R'));
});

test('top-library commanders use the shared private library visibility path',()=>{for(const name of ['The Fourth Doctor','Emperor Mihail II'])assert.equal(M.DEFS[name].revealOwnTop,true);});
