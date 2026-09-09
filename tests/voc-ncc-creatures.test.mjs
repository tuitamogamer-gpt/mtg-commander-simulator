import assert from 'node:assert/strict';
import test from 'node:test';
import {M,setup,card,body,play,activate,event,settle} from './helpers/voc-ncc-fixtures.mjs';

for(const role of ['human','ai']){
  test(role+': Bloodtithe counts Blood tokens when its sacrifice ability resolves',async()=>{
    const f=setup(role),target=card(f,'Colossal Dreadmaw','battlefield',f.b),c=await play(f,'Bloodtithe Harvester');
    assert.equal(f.game.bf().filter(c=>c.hasSub('Blood')).length,1);c.sick=false;
    f.decide=(p,q)=>q.type==='chooseTargets'?[target]:undefined;
    await activate(f,c);assert.equal(c.zone,'graveyard');assert.equal(target.toughness,4);
  });
  test(role+': Chishiro makes Spirits for Equipment entry and grows only modified creatures',async()=>{
    const f=setup(role),c=await play(f,'Chishiro, the Shattered Blade'),plain=body(f);
    await play(f,'Sol Ring');assert.equal(f.game.creatures(f.a).filter(c=>c.isToken).length,0);
    const eq=await play(f,'Swiftfoot Boots');const spirit=f.game.creatures(f.a).find(c=>c.isToken);assert.equal(spirit.power,2);assert.equal(spirit.kw('menace'),true);
    f.game.attach(eq,c);await event(f,'endStep',{player:f.a});assert.equal(c.counters['+1/+1'],1);assert.equal(plain.counters['+1/+1']||0,0);
  });
  test(role+': Krenko grows before counting Goblins and Kresh uses the dead creature power',async()=>{
    const f=setup(role),k=await play(f,'Krenko, Tin Street Kingpin'),kresh=await play(f,'Kresh the Bloodbraided');
    k.attacking=f.b;await event(f,'attacks',{card:k,player:f.a});assert.equal(k.counters['+1/+1'],1);assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.hasSub('Goblin')).length,2);
    const victim=card(f,'Colossal Dreadmaw','battlefield',f.b);await f.game.destroy(victim);await settle(f.game);assert.equal(kresh.counters['+1/+1'],6);
  });
  test(role+': Graveblade counts graveyard creatures and Gahiji rewards attacks toward opponents',async()=>{
    const f=setup(role,3),m=await play(f,'Graveblade Marauder');card(f,'Grizzly Bears','graveyard');card(f,'Forest','graveyard');
    const life=f.b.life;await event(f,'damageToPlayer',{src:m,player:f.b,combat:true,n:1});assert.equal(f.b.life,life-1);
    const g=await play(f,'Gahiji, Honored One'),attacker=body(f,f.b);attacker.attacking=f.game.players[2];await event(f,'attacks',{card:attacker,player:f.b});assert.equal(attacker.power,4);
  });
  test(role+': first responder returns another creature and adds its last known power',async()=>{
    const f=setup(role),other=body(f),c=await play(f,'First Responder');
    f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt?.includes('First Responder')?[other]:undefined;
    await event(f,'endStep',{player:f.a});assert.equal(other.zone,'hand');assert.equal(c.counters['+1/+1'],2);
  });
  test(role+': Priest counts opposing land advantages and Field of Souls ignores tokens',async()=>{
    const f=setup(role),priest=await play(f,'Priest of the Blessed Graf');card(f,'Forest','battlefield',f.b);
    await event(f,'endStep',{player:f.a});assert.equal(f.game.creatures(f.a).filter(c=>c.isToken).length,1);
    await play(f,'Field of Souls');await f.game.destroy(priest);await settle(f.game);assert.equal(f.game.creatures(f.a).filter(c=>c.isToken).length,2);
    const token=f.game.creatures(f.a).find(c=>c.isToken);await f.game.destroy(token);await settle(f.game);assert.equal(f.game.creatures(f.a).filter(c=>c.isToken).length,1);
  });
  test(role+': Perrie counts counter kinds rather than quantities; Bribe Taker offers each kind',async()=>{
    const f=setup(role),c=await play(f,'Perrie, the Pulverizer'),other=body(f);f.game.addCounters(other,'+1/+1',3,false,f.a);
    f.decide=(p,q)=>q.type==='chooseTargets'?[other]:undefined;c.attacking=f.b;
    await event(f,'attacks',{card:c,player:f.a});assert.equal(other.power,7);assert.equal(other.kw('trample'),true);
    f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':q.type==='chooseOption'&&q.options.some(o=>o.key==='+1/+1')?'+1/+1':undefined;
    const bribe=await play(f,'Bribe Taker');assert.equal(bribe.counters['+1/+1'],2);
  });
  test(role+': Crystalline Giant never randomly repeats an existing counter kind',async()=>{
    const f=setup(role),c=await play(f,'Crystalline Giant');f.game.rnd=()=>0;
    await event(f,'beginCombat',{player:f.a});await event(f,'beginCombat',{player:f.a});assert.equal(c.counters.flying,1);assert.equal(c.counters['first strike'],1);
  });
  test(role+': Aven Courier copies one kind only if target lacks it',async()=>{
    const f=setup(role),c=await play(f,'Aven Courier'),source=body(f),target=card(f,'Sol Ring');f.game.addCounters(source,'shield',3,false,f.a);
    f.decide=(p,q)=>q.type==='chooseTargets'?[target]:undefined;c.attacking=f.b;
    await event(f,'attacks',{card:c,player:f.a});await event(f,'attacks',{card:c,player:f.a});assert.equal(target.counters.shield,1);
  });
  test(role+': Tivit votes in player order and may vote an additional time',async()=>{
    const f=setup(role,3);f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':q.type==='chooseOption'&&q.options.some(o=>o.key==='evidence')?'evidence':undefined;
    const c=await play(f,'Tivit, Seller of Secrets');assert.equal(f.game.bf().filter(c=>c.hasSub('Clue')).length,5);
    await event(f,'damageToPlayer',{src:c,player:f.b,n:6,combat:true});assert.equal(f.game.bf().filter(c=>c.hasSub('Clue')).length,10);
  });
  test(role+': connive X draws before discarding and emits one event',async()=>{
    const f=setup(role),c=body(f);card(f,'Grizzly Bears','hand');card(f,'Forest','hand');let events=0;const original=f.game.emit;
    f.game.emit=function(name,data){if(name==='connive')events++;return original.call(this,name,data);};
    const hand=f.a.hand.length;f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt?.startsWith('Connive')?q.from.slice(0,2):undefined;
    await f.game.connive(c,2);assert.equal(f.a.hand.length,hand);assert.equal(c.counters['+1/+1'],1);assert.equal(events,1);
  });
}
