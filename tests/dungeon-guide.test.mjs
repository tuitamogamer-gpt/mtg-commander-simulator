import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card, settle} from './helpers/afc-mic-fixtures.mjs';
const plain = value => JSON.parse(JSON.stringify(value));

test('every dungeon room has a readable effect and one map position, with lengths from legal routes', () => {
  const lengths = {mine:[4,4], mage:[7,7], tomb:[3,4], undercity:[5,5]};
  for (const [key, dungeon] of Object.entries(M.AFC.dungeons)) {
    const guide = M.dungeonGuide(key);
    assert.deepEqual(plain(guide.length), lengths[key]);
    assert.deepEqual(plain(guide.rows.flat().filter(Boolean).sort()), Object.keys(dungeon.rooms).sort());
    for (const [roomKey, room] of Object.entries(dungeon.rooms)) {
      assert.ok(guide.effects[roomKey]?.length > 5, `${key}/${roomKey} explains its effect`);
      assert.equal(guide.rooms[roomKey], room, 'maps use the engine room graph');
    }
  }
});
test('deck discovery covers all five precons plus imported venture and initiative lists', () => {
  const decks = Object.entries(M.DECKS).filter(([,d]) => M.deckDungeonCards(d).length).map(([name]) => name);
  assert.deepEqual(decks.sort(), ['Dungeons of Death','Mind Flayarrrs','Party Time','Draconic Dissent','Exit from Exile'].sort());
  assert.deepEqual(plain(M.deckDungeonCards({custom:true, commander:'Sefris of the Hidden Ways', cards:[{name:'Seasoned Dungeoneer'}]})), ['Sefris of the Hidden Ways','Seasoned Dungeoneer']);
  assert.equal(M.deckDungeonCards({cards:[{name:'Venture Forth'}, {name:'Forest'}]}).length, 0, 'Adventure and names alone do not imply dungeon mechanics');
});
test('dungeon and room decisions expose maps but retain exact legal keys, including Live hydration', async () => {
  const f = setup(); let questions = [];
  f.a.onlineSeat=0; f.b.onlineSeat=1;
  f.decide=(p,q)=>{if(q.dungeonChoice){questions.push(q);return q.dungeonChoice.kind==='dungeon'?'mine':'tunnels';}};
  await f.game.venture(f.a); await settle(f.game); await f.game.venture(f.a); await settle(f.game);
  assert.deepEqual(plain(questions[0].options.map(o=>o.key)), ['mine','mage','tomb']);
  assert.deepEqual(plain(questions[1].options.map(o=>o.key)), ['goblin','tunnels']);
  assert.deepEqual(plain(questions[1].dungeonChoice), {kind:'room',key:'mine',room:'entrance',path:['entrance']});
  const descriptor = M.onlineDecisionDescriptor(f.game,questions[1],f.a,'dungeon-route');
  const model=new M.OnlineArenaView(); model.update(plain(M.onlineGameViewFor(f.game,f.a)),0);
  const q=model.decision(plain(descriptor));
  assert.deepEqual(plain(q.dungeonChoice), plain(questions[1].dungeonChoice));
  assert.equal(M.hydrateOnlineDecision(f.game,questions[1],descriptor,'tunnels'),'tunnels');
  assert.throws(()=>M.hydrateOnlineDecision(f.game,questions[1],descriptor,'temple'));
});
test('visited paths survive save and Live views without exposing private cards', async () => {
  const f=setup(); f.a.onlineSeat=0;f.b.onlineSeat=1;
  card(f,'Grizzly Bears','hand'); const keys=['mine','tunnels','fungi'];
  f.decide=(p,q)=>q.dungeonChoice?keys.shift():undefined;
  for(let i=0;i<3;i++){await f.game.venture(f.a);await settle(f.game);}
  assert.deepEqual(plain(f.a.afcDungeon.path),['entrance','tunnels','fungi']);
  const save=plain(M.captureGameState(f.game)); assert.ok(save);
  const fresh=setup(); M.restoreGameState(fresh.game,save);
  assert.deepEqual(plain(fresh.a.afcDungeon.path),['entrance','tunnels','fungi']);
  const model=new M.OnlineArenaView();model.update(plain(M.onlineGameViewFor(f.game,f.b)),1);
  assert.deepEqual(plain(model.players[0].afcDungeon.path),['entrance','tunnels','fungi']);
  assert.equal(model.players[0].hand[0].name,'Hidden card');
  save.players[0].afcDungeon.path=['entrance','storeroom','fungi'];
  assert.throws(()=>M.restoreGameState(fresh.game,save),/invalid dungeon path/);
});
test('old saves continue from their known room without inventing visited rooms', async () => {
  const f=setup();f.a.afcDungeon={id:1,key:'mine',room:'tunnels'};f.a.afcDungeonSerial=1;
  const save=plain(M.captureGameState(f.game)),fresh=setup();M.restoreGameState(fresh.game,save);
  fresh.decide=(p,q)=>q.dungeonChoice?'pool':undefined;
  await fresh.game.venture(fresh.a);await settle(fresh.game);
  assert.deepEqual(plain(fresh.a.afcDungeon.path),['tunnels','pool']);
});
test('initiative advances an existing dungeon; ordinary venture advances an existing Undercity', async () => {
  const f=setup();const keys=['mine','tunnels'];
  f.decide=(p,q)=>q.dungeonChoice?keys.shift():undefined;
  await f.game.venture(f.a);await settle(f.game);await f.game.takeInitiative(f.a);await settle(f.game);
  assert.equal(f.a.afcDungeon.key,'mine');assert.equal(f.a.afcDungeon.room,'tunnels');
  await f.game.venture(f.b,null,true);await settle(f.game);
  f.decide=(p,q)=>q.dungeonChoice?'well':undefined;
  await f.game.venture(f.b);await settle(f.game);
  assert.equal(f.b.afcDungeon.key,'undercity');assert.equal(f.b.afcDungeon.room,'well');
});
test('completing a dungeon clears its map and starting another resets the visited path', async () => {
  const f=setup(),keys=['mine','tunnels','pool','tomb'];
  f.decide=(p,q)=>q.dungeonChoice?keys.shift():undefined;
  for(let i=0;i<4;i++){await f.game.venture(f.a);await settle(f.game);}
  assert.equal(f.a.afcDungeon,null);assert.equal(f.a.afcCompletedDungeons,1);
  await f.game.venture(f.a);await settle(f.game);
  assert.deepEqual(plain(f.a.afcDungeon.path),['entry']);assert.equal(f.a.afcDungeon.key,'tomb');
});
