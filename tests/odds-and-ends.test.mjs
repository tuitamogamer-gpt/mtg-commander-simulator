import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,event} from './helpers/c21-fixtures.mjs';
import {buildIntake} from '../scripts/import-odds-and-ends.mjs';

test('Odds and Ends preserves all three independent source lists and passes runtime import checks',()=>{
  const {deck,validation}=buildIntake(M);
  assert.deepEqual(JSON.parse(JSON.stringify(M.DECKS[deck.name])),JSON.parse(JSON.stringify(deck)));
  assert.equal(validation.summary.inputCards,100);
  assert.equal(validation.summary.engineCertified,91);
  assert.equal(validation.interactions.unsupported.length,0);
  assert.ok(M.DECK_META[deck.name]);
  assert.ok(M.AI_DECK_PROFILE_HINTS[deck.name]);
  assert.equal(M.DECK_GUIDE_ROUTES[M.DECK_GUIDES[deck.name].route].length,3);
});

for(const role of ['human','ai']){
  test(`${role}: Yennett casts an odd-mana threat during combat without paying mana`,async()=>{
    const f=setup(role),yennett=card(f,'Yennett, Cryptic Sovereign'),threat=card(f,'Void Winnower','library');
    f.game.phase='combat';yennett.attacking=f.b;
    const before=f.a.hand.length;
    await event(f,'attacks',{card:yennett,player:f.a,defender:f.b});
    assert.equal(threat.zone,'battlefield');
    assert.equal(threat.castMeta.manaSpent,0);
    assert.equal(f.a.hand.length,before);
  });
  for(const name of ['Arcane Signet','Island'])test(`${role}: Yennett draws ${name} instead of casting it`,async()=>{
    const f=setup(role),yennett=card(f,'Yennett, Cryptic Sovereign'),top=card(f,name,'library');
    f.game.phase='combat';yennett.attacking=f.b;
    await event(f,'attacks',{card:yennett,player:f.a,defender:f.b});
    assert.equal(top.zone,'hand');
  });
}

test('Declining Yennett’s optional free spell draws that same card',async()=>{
  const f=setup(),yennett=card(f,'Yennett, Cryptic Sovereign'),top=card(f,'Void Winnower','library');
  f.decide=(p,q)=>q.type==='chooseCards'&&q.min===0?[]:undefined;
  f.game.phase='combat';yennett.attacking=f.b;
  await event(f,'attacks',{card:yennett,player:f.a,defender:f.b});
  assert.equal(top.zone,'hand');
});
