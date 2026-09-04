import test from'node:test';import assert from'node:assert/strict';
import{fixtureEngine,context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';import{semanticClass}from'../scripts/import-oracle-batch.mjs';
const M=fixtureEngine([
 ['Exact X Tap','Tap X target creatures.','Sorcery','{X}{G}'],
 ['Exact X Untapper','{X}, {T}: Untap X target lands.','Creature','{G}'],
 ['Tiny Spell Counter','Counter target spell with mana value 1 or less.','Instant','{U}'],
 ['Big Spell Counter','Counter target spell with mana value 4 or greater.','Instant','{U}'],
]);
for(const role of ['human','ai']){
 test(`${role}: exactly three distinct targets bind to paid X`,async()=>{
  const {game,a,b}=context(M,role),cards=Array.from({length:3},()=>put(M,game,b,'Grizzly Bears')),spell=put(M,game,a,'Exact X Tap','hand');a.pool.G=1;a.pool.C=3;
  assert.equal(await game.castSpell(a,spell,{from:'hand',xVal:3}),true);const so=game.stack.at(-1);assert.equal(so.x,3);assert.equal(so.targets[0].length,3);assert.equal(new Set(so.targets[0]).size,3);spell.castMeta.x=8;await settle(game);assert.ok(cards.every(card=>card.tapped));assert.equal(a.pool.G,0);assert.equal(a.pool.C,0);
 });
 test(`${role}: X zero is legal with no target objects`,async()=>{
  const {game,a}=context(M,role),spell=put(M,game,a,'Exact X Tap','hand');a.pool.G=1;assert.equal(await game.castSpell(a,spell,{from:'hand',xVal:0}),true);const so=game.stack.at(-1);assert.equal(so.targets.flat().length,0);await settle(game);assert.equal(spell.zone,'graveyard');assert.equal(a.pool.G,0);
 });
 test(`${role}: insufficient distinct targets reject X before payment`,async()=>{
  const {game,a,b}=context(M,role);put(M,game,b,'Grizzly Bears');const spell=put(M,game,a,'Exact X Tap','hand');a.pool.G=1;a.pool.C=2;assert.equal(await game.castSpell(a,spell,{from:'hand',xVal:2}),false);assert.equal(spell.zone,'hand');assert.equal(a.pool.G,1);assert.equal(a.pool.C,2);
 });
 test(`${role}: activated X binds before choosing exactly two lands`,async()=>{
  const {game,a}=context(M,role),source=put(M,game,a,'Exact X Untapper'),lands=Array.from({length:2},()=>put(M,game,a,'Forest'));for(const land of lands)land.tapped=true;a.pool.C=2;const action=game.activatableList(a).find(row=>row.card===source);assert.ok(action);
  const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.type==='chooseX'?2:decide(g,q);
  assert.equal(await game.activateAbility(a,action),true);assert.equal(game.stack.at(-1).ctx.targets[0].length,2);await settle(game);assert.ok(lands.every(land=>!land.tapped));assert.equal(source.tapped,true);assert.equal(a.pool.C,0);
 });
 test(`${role}: spell mana-value qualifiers include and exclude printed boundaries`,async()=>{
  const {game,a,b}=context(M,role),low=put(M,game,a,'Tiny Spell Counter','hand'),high=put(M,game,a,'Big Spell Counter','hand');const ls=low.def.targets[0],hs=high.def.targets[0];for(const [cost,lowOK,highOK]of[['{1}',true,false],['{2}',false,false],['{4}',false,true],['{5}',false,true]]){
   const card=put(M,game,b,'Grizzly Bears','hand');card.def={...card.def,cost};const so={kind:'spell',card,ctrl:b,castOpts:{},x:0};assert.equal(ls.filter(game,so,a,low),lowOK);assert.equal(hs.filter(game,so,a,high),highOK);
  }
 });
}
test('target X is rejected without a scoped printed X cost',()=>{
 for(const [type,oracle]of[['Sorcery','Tap X target creatures.'],['Creature','{T}: Tap X target creatures.'],['Creature','When this creature dies, tap X target creatures.']])assert.equal(semanticClass({name:'Unbound quantity',type_line:type,oracle_text:oracle,mana_cost:'{G}',layout:'normal'}).semanticClass,undefined);
});
