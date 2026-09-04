import test from'node:test';import assert from'node:assert/strict';
import{fixtureEngine,context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
import{semanticClass}from'../scripts/import-oracle-batch.mjs';
const M=fixtureEngine([
 ['Five-color wipe',"Destroy each creature that isn't all colors.",'Sorcery','{3}{W}'],
 ['Islandwalk hunter','{T}: Destroy target creature with islandwalk.','Creature','{G}'],
 ['Protective counter','Counter target spell that targets a permanent you control.','Instant','{U}'],
 ['Player counter','Counter target spell that targets you.','Instant','{U}'],
 ['Creature counter','Counter target spell that targets a creature.','Instant','{U}'],
 ['Probe damage','Probe damage deals 1 damage to target creature.','Instant','{R}'],
 ['Aura hunter','{T}: Destroy target Aura attached to a land.','Creature','{G}'],
 ['Counterless wipe','Destroy all creatures with no counters on them.','Sorcery','{3}{W}'],
 ['Colored removal',"Destroy target creature that's one or more colors.",'Instant','{B}'],
]);
for(const role of ['human','ai']){
 test(`${role}: all-five-color creatures survive the qualified wipe`,async()=>{
  const {game,a,b}=context(M,role),all=put(M,game,b,'Grizzly Bears'),four=put(M,game,b,'Grizzly Bears'),colorless=put(M,game,b,'Grizzly Bears');
  all.def={...all.def,colorsOverride:['W','U','B','R','G']};four.def={...four.def,colorsOverride:['W','U','B','R']};colorless.def={...colorless.def,colorsOverride:[]};game.recalc();
  const spell=put(M,game,a,'Five-color wipe','hand');a.pool.C=3;a.pool.W=1;assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);assert.equal(all.zone,'battlefield');assert.equal(four.zone,'graveyard');assert.equal(colorless.zone,'graveyard');
 });
 test(`${role}: islandwalk target predicate uses the current keyword`,()=>{
  const {game,a,b}=context(M,role),src=put(M,game,a,'Islandwalk hunter'),target=put(M,game,b,'Grizzly Bears'),f=src.def.abilities[0].targets[0].filter;assert.equal(f(game,target,a,src),false);target.cur.kw.add('islandwalk');assert.equal(f(game,target,a,src),true);target.cur.kw.delete('islandwalk');assert.equal(f(game,target,a,src),false);
 });
 test(`${role}: reference predicates follow present controller and original target identity`,async()=>{
  const {game,a,b}=context(M,role),host=put(M,game,a,'Grizzly Bears'),other=put(M,game,b,'Grizzly Bears'),counter=put(M,game,a,'Protective counter','hand');
  const so={kind:'spell',card:put(M,game,b,'Probe damage','hand'),ctrl:b,castOpts:{},targets:[host],targetIdentities:game.captureTargetIdentities([host])};
  const f=counter.def.targets[0].filter;
  assert.equal(f(game,so,a,counter),true);host.def={...host.def,kws:[...host.def.kws||[],'shroud']};game.recalc();assert.equal(f(game,so,a,counter),true);
  host.ctrl=b;assert.equal(f(game,so,a,counter),false);host.ctrl=a;
  so.targets=[other];so.targetIdentities=game.captureTargetIdentities([other]);assert.equal(f(game,so,a,counter),false);
  so.targets=[host];so.targetIdentities=game.captureTargetIdentities([host]);await game.move(host,'exile');assert.equal(f(game,so,a,counter),false);await game.move(host,'battlefield',{controller:a});assert.equal(f(game,so,a,counter),false);
 });
 test(`${role}: original target gaining shroud still allows a paid counterspell`,async()=>{
  const {game,a,b}=context(M,role),host=put(M,game,a,'Grizzly Bears'),damage=put(M,game,b,'Probe damage','hand');b.pool.R=1;game.turnPlayer=b;
  assert.equal(await game.castSpell(b,damage,{from:'hand'}),true);host.def={...host.def,kws:[...host.def.kws||[],'shroud']};game.recalc();
  const counter=put(M,game,a,'Creature counter','hand');a.pool.U=1;assert.equal(await game.castSpell(a,counter,{from:'hand'}),true);await settle(game);assert.equal(damage.zone,'graveyard');assert.equal(host.damage,0);assert.equal(a.pool.U,0);
 });
 test(`${role}: target leaving after the counter is cast makes the counter fail`,async()=>{
  const {game,a,b}=context(M,role),host=put(M,game,a,'Grizzly Bears'),damage=put(M,game,b,'Probe damage','hand');b.pool.R=1;game.turnPlayer=b;await game.castSpell(b,damage,{from:'hand'});
  const counter=put(M,game,a,'Creature counter','hand');a.pool.U=1;assert.equal(await game.castSpell(a,counter,{from:'hand'}),true);await game.move(host,'exile');await game.resolveTop();assert.equal(game.stack.some(so=>so.card===damage),true);await settle(game);
 });
 test(`${role}: player reference matches only the counter controller`,()=>{
  const {game,a,b}=context(M,role),counter=put(M,game,a,'Player counter','hand'),so={kind:'spell',card:put(M,game,b,'Probe damage','hand'),ctrl:b,castOpts:{},targets:[b]};const f=counter.def.targets[0].filter;assert.equal(f(game,so,a,counter),false);so.targets=[a];assert.equal(f(game,so,a,counter),true);a.lost=true;assert.equal(f(game,so,a,counter),false);
 });
 test(`${role}: Aura host qualifier changes immediately after attachment moves`,()=>{
  const {game,a,b}=context(M,role),hunter=put(M,game,a,'Aura hunter'),land=put(M,game,b,'Forest'),creature=put(M,game,b,'Grizzly Bears'),aura=put(M,game,b,'Rancor');aura.attachedTo=land.iid;land.attachments.push(aura.iid);const f=hunter.def.abilities[0].targets[0].filter;assert.equal(f(game,aura,a,hunter),true);aura.attachedTo=creature.iid;assert.equal(f(game,aura,a,hunter),false);
 });
 test(`${role}: any positive counter protects from the counterless wipe`,async()=>{
  const {game,a,b}=context(M,role),bare=put(M,game,b,'Grizzly Bears'),charge=put(M,game,b,'Grizzly Bears'),zero=put(M,game,b,'Grizzly Bears');charge.counters.charge=1;zero.counters.charge=0;const spell=put(M,game,a,'Counterless wipe','hand');a.pool.C=3;a.pool.W=1;assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);assert.equal(bare.zone,'graveyard');assert.equal(zero.zone,'graveyard');assert.equal(charge.zone,'battlefield');
 });
 test(`${role}: one or more colors excludes only colorless creatures`,()=>{
  const {game,a,b}=context(M,role),spell=put(M,game,a,'Colored removal','hand'),host=put(M,game,b,'Grizzly Bears'),f=spell.def.targets[0].filter;for(const colors of[[],['G'],['U','R'],['W','U','B','R','G']]){host.cur.colors=colors;assert.equal(f(game,host,a,spell),colors.length>0);}
 });
}
test('unsupported quantifiers and host requirements remain closed',()=>{
 for(const oracle of['Counter target spell that targets only a creature.','Destroy target Aura attached to a legendary creature.'])assert.equal(semanticClass({name:'Closed predicate',type_line:'Instant',oracle_text:oracle,mana_cost:'{U}',layout:'normal'}).semanticClass,undefined);
});
