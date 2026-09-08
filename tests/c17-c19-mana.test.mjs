import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,fuel,mana,settle,target} from './helpers/c17-c19-fixtures.mjs';
const enchant=async(f,name,l,p=f.a)=>{const c=card(f,name,'hand',p);await f.game.move(c,'battlefield',{ctrl:p,attachTo:l});return c;};
for(const role of ['human','ai']){
 for(const [aura,spell]of [['Wild Growth','Grizzly Bears'],['Overgrowth','Cultivate'],["Dawn's Reflection",'Anje Falkenrath']])test(role+': '+aura+' is included in actual automatic mana payment for '+spell,async()=>{
  const f=setup(role),l=card(f,'Forest');await enchant(f,aura,l);const s=card(f,spell,'hand');assert.ok(f.game.castableList(f.a).some(e=>e.card===s));assert.equal(await f.game.castSpell(f.a,s,{from:'hand'}),true);assert.ok(l.tapped);assert.ok(f.game.stack.some(e=>e.card===s));await settle(f.game);assert.equal(mana(f.a),0);
 });
 test(role+': Wake and Resurgent each add one of a type the land actually produced, while Resurgent draws for a cast creature',async()=>{
  const f=setup(role),l=card(f,'Forest');card(f,"Mirari's Wake");card(f,'Zendikar Resurgent');const s=card(f,'Eternal Witness','hand');assert.equal(await f.game.castSpell(f.a,s,{from:'hand'}),true);await settle(f.game);assert.equal(s.zone,'battlefield');assert.equal(s.power,3);assert.equal(f.a.hand.length,1);assert.equal(mana(f.a),0);
 });
 test(role+': Crucible spends only five storage counters for a seven-mana Dragon when Dawn Reflection supplies two unrestricted mana',async()=>{
  const f=setup(role),l=card(f,'Crucible of the Spirit Dragon');l.counters.storage=7;await enchant(f,"Dawn's Reflection",l);const s=card(f,'Bladewing the Risen','hand');assert.equal(await f.game.castSpell(f.a,s,{from:'hand'}),true);await settle(f.game);assert.equal(l.counters.storage,2);assert.equal(s.zone,'battlefield');assert.equal(mana(f.a),0);
 });
 test(role+': Forge rewards an entered commander and Sanctum returns an owned commander even under another controller',async()=>{
  const f=setup(role),c=await play(f,'Edgar Markov');c.commander=true;const forge=card(f,'Forge of Heroes');target(f,c);await activate(f,forge);assert.equal(c.counters['+1/+1'],1);const sanctum=card(f,'Sanctum of Eternity');M.C14.control(f.game,c,f.b,false);f.decide=(p,q)=>q.type==='chooseTargets'?[c]:q.type==='chooseOption'&&q.options.some(o=>o.key==='stay')?'stay':undefined;await activate(f,sanctum);assert.equal(c.zone,'hand');assert.ok(f.a.hand.includes(c));
 });
 test(role+': Isolated Watchtower checks the two-land deficit, scries and puts a revealed basic into play tapped',async()=>{
  const f=setup(role),w=card(f,'Isolated Watchtower');fuel(f.a);assert.ok(!f.game.activatableList(f.a).some(e=>e.card===w&&e.ability));for(let n=0;n<3;n++)card(f,'Forest','battlefield',f.b);await activate(f,w);assert.equal(f.game.lands(f.a).length,2);assert.ok(f.game.lands(f.a).find(c=>c!==w).tapped);
 });
}
test('A mana Aura rewards the land controller; restricted Crucible mana stays restricted while Aura mana is unrestricted',async()=>{
 const f=setup(),l=card(f,'Crucible of the Spirit Dragon','battlefield',f.b);l.counters.storage=2;await enchant(f,'Overgrowth',l);const s=f.game.manaSources(f.b).find(s=>s.card===l&&s.extraCost.removeManaCounters);await f.game.activateManaSource(f.b,s,{ANY:true,n:2},null,['B','R']);assert.equal(l.counters.storage,0);assert.equal(f.b.pool.G,2);assert.equal(mana(f.a),0);const nonDragon=card(f,'Grizzly Bears','hand',f.b);assert.equal(f.game.canPayMana(f.b,M.parseCost('{G}{G}'),{card:nonDragon}),true);assert.equal(f.game.canPayMana(f.b,M.parseCost('{B}'),{card:nonDragon}),false);
});
test('Wake cannot copy a mana type supplied by another trigger, and untapped non-mana actions do not add mana',async()=>{
 const f=setup(),l=card(f,'Island');await enchant(f,'Wild Growth',l);card(f,"Mirari's Wake");const s=f.game.manaSources(f.a).find(s=>s.card===l);await f.game.activateManaSource(f.a,s,{U:1});assert.equal(f.a.pool.U,2);assert.equal(f.a.pool.G,1);assert.equal(mana(f.a),3);l.tapped=false;f.game.tap(l);assert.equal(mana(f.a),3);
});
test('Crucible can add and spend zero storage without creating mana, and storage mana can pay Dragon abilities',async()=>{
 const f=setup(),l=card(f,'Crucible of the Spirit Dragon');await activate(f,l);assert.equal(l.counters.storage,1);for(const k of Object.keys(f.a.pool))f.a.pool[k]=0;l.tapped=false;let s=f.game.manaSources(f.a).find(s=>s.card===l&&s.extraCost.removeManaCounters);await f.game.activateManaSource(f.a,s,{C:0});assert.equal(mana(f.a),0);assert.equal(l.counters.storage,1);l.tapped=false;l.counters.storage=2;s=f.game.manaSources(f.a).find(s=>s.card===l&&s.extraCost.removeManaCounters);await f.game.activateManaSource(f.a,s,{ANY:true,n:2},null,['B','R']);const dragon=card(f,'Bladewing the Risen');assert.equal(f.game.canPayMana(f.a,M.parseCost('{B}{R}'),{card:dragon,isAbility:true}),true);const bear=body(f);assert.equal(f.game.canPayMana(f.a,M.parseCost('{B}'),{card:bear,isAbility:true}),false);
});
