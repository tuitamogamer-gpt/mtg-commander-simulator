import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(){
  const game=new M.Game({seed:10102026,paced:false});game.speedFactor=0;
  const f={};
  const decide=async(_g,q)=>{
    if(q.type==='priority')return{kind:'pass'};
    if(q.type==='chooseTargets')return f.targets?.(q)||(q.quickTarget?[q.quickTarget]:q.candidates.slice(0,q.min||0));
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    if(q.type==='chooseManaSources')return f.mana?.(q)||{auto:true};
    if(q.type==='chooseOption')return q.options.some(o=>o.key==='Spirit')?'Spirit':q.options.find(o=>o.key==='yes')?.key||q.options[0]?.key;
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='scry')return{top:q.cards,bottom:[]};
    return null;
  };
  const me=game.addPlayer('Native exile payer',{name:'Peer audit'},{decide},false);
  game.addPlayer('Native rival',{name:'Peer audit'},{decide},false);
  game.turnPlayer=me;game.turnNo=8;game.phase='main1';game.step='main';
  const put=(name,zone='battlefield')=>{assert.ok(M.DEFS[name]);const c=new M.CardInst(M.DEFS[name],me);c.zone=zone;c.ctrl=me;c.sick=false;(zone==='battlefield'?game.battlefield:me[zone]).push(c);game.recalc();return c;};
  for(const p of game.players)for(let i=0;i<20;i++){const c=new M.CardInst(M.DEFS.Island,p);c.zone='library';p.library.push(c);}
  const settle=async()=>{for(let i=0;i<60;i++){await game.flushTriggers();if(!game.stack.length){assertGameStateInvariants(game);return;}await game.resolveTop();}assert.fail('native exile stack settles');};
  const cast=async(name,lands)=>{const c=put(name,'hand');for(const n of lands)put(n);assert.equal(await game.castSpell(me,c,{from:'hand'}),true);assert.equal(c.castMeta.manaSpent,lands.length);await settle();return c;};
  return Object.assign(f,{game,me,put,cast,settle});
}

test('Ranar: an actually paid Swords exile effect creates its native Spirit',async()=>{
  const f=fixture(),ranar=await f.cast('Ranar the Ever-Watchful',['Plains','Island','Wastes','Wastes']);
  assert.equal(f.game._zkExileWatch,true);assert.ok(ranar.def.triggers.some(t=>t.on==='zkExiled'));
  const bear=f.put('Grizzly Bears');f.targets=q=>q.candidates.includes(bear)?[bear]:undefined;
  await f.cast('Swords to Plowshares',['Plains']);
  assert.equal(bear.zone,'exile');assert.equal(f.game.zkAnnouncing,0);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Spirit')).length,1);
});

test('Ranar: an actual native Food Chain activation exile cost creates no Spirit',async()=>{
  const f=fixture(),ranar=await f.cast('Ranar the Ever-Watchful',['Plains','Island','Wastes','Wastes']);
  const chain=await f.cast('Food Chain',['Forest','Wastes','Wastes']);
  assert.equal(f.game._zkExileWatch,true);
  const entry=f.game.activatableList(f.me).find(e=>e.card===chain&&e.manaAbility);
  assert.ok(entry);assert.equal(await f.game.activateAbility(f.me,entry),true);await f.settle();
  assert.equal(ranar.zone,'exile');assert.equal(Object.values(f.me.pool).reduce((n,value)=>n+value,0),5);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Spirit')).length,0);
});

test('Ranar: a native first-foretell hand exile still creates its printed Spirit',async()=>{
  const f=fixture();await f.cast('Ranar the Ever-Watchful',['Plains','Island','Wastes','Wastes']);
  const doomskar=f.put('Doomskar','hand');
  const entry=f.game.activatableList(f.me).find(e=>e.card===doomskar&&e.foretell);
  assert.ok(entry,'the printed foretell special action is offered');
  assert.equal(await f.game.activateAbility(f.me,entry),true);await f.settle();
  assert.equal(doomskar.zone,'exile');assert.equal(doomskar.meta.foretold,true);
  assert.equal(f.me.turnState.zkForetold,1);assert.equal(Object.values(f.me.pool).reduce((n,value)=>n+value,0),0);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Spirit')).length,1);
});

test('Ranar: Food Chain costs during a real Cascade resolution stay separate from exile effects',async()=>{
  const f=fixture(),ranar=await f.cast('Ranar the Ever-Watchful',['Plains','Island','Wastes','Wastes']);
  const chain=await f.cast('Food Chain',['Forest','Wastes','Wastes']);
  f.put('Sphere of Resistance');const bear=f.put('Grizzly Bears','library');
  assert.equal(M.DEFS['Volcanic Torrent'].cascade,true,'the printed outer spell exposes native Cascade');
  const spare=f.put('Wastes');f.me.manualMana=true;
  let activatedDuringPayment=false;
  f.mana=async q=>{
    if(q.forSpell?.card===bear&&!activatedDuringPayment){
      assert.equal(f.game.c1516Resolving?.kind,'trigger','the native Cascade ability is actually resolving');
      const entry=f.game.activatableList(f.me).find(e=>e.card===chain&&e.manaAbility);
      assert.ok(entry,'the native mana ability is offered while the Cascade creature pays its tax');
      activatedDuringPayment=true;assert.equal(await f.game.activateAbility(f.me,entry),true);
    }
    return{auto:true};
  };
  const torrent=await f.cast('Volcanic Torrent',['Mountain','Wastes','Wastes','Wastes','Wastes','Wastes']);
  assert.equal(torrent.zone,'graveyard');assert.equal(bear.zone,'battlefield',f.game.log.slice(-12).map(r=>r.msg).join(' | '));assert.equal(bear.castMeta.manaSpent,1,'Sphere taxes the real free Cascade creature cast');
  assert.equal(activatedDuringPayment,true,'the printed mana ability is activated during the creature payment window');
  assert.equal(ranar.zone,'exile','the chosen native mana source exiles Ranar as its activation cost');
  assert.equal(spare.tapped,true,'the outer paid spell consumes the available generic land before its Cascade choice');
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Spirit')).length,0);
});

for(const simultaneous of [false,true])test(`Ranar: paid Ghostly Flicker preserves ${simultaneous?'simultaneously departing':'remaining'} Roaming Throne trigger doubling`,async()=>{
  const f=fixture(),ranar=await f.cast('Ranar the Ever-Watchful',['Plains','Island','Wastes','Wastes']);
  const throne=await f.cast('Roaming Throne',Array(4).fill('Wastes'));
  assert.equal(throne.meta.cslType,'Spirit');assert.equal(ranar.hasSub('Spirit'),true);
  assert.equal(f.game._zkExileWatch,true);assert.ok(ranar.def.triggers.some(t=>t.on==='zkExiled'));
  const land=f.put('Island');f.targets=q=>q.max===2?[ranar,simultaneous?throne:land]:undefined;
  await f.cast('Ghostly Flicker',['Island','Wastes','Wastes']);
  assert.equal(ranar.zone,'battlefield');assert.equal(ranar.zoneVersion,3);
  assert.equal(throne.zone,'battlefield');assert.equal(throne.zoneVersion,simultaneous?3:1);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Spirit')).length,2,'the printed Ranar ability triggers an additional time using the Throne active immediately before exile');
});
