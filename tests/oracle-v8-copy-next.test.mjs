import test from 'node:test';import assert from 'node:assert/strict';
import{fixtureEngine,context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
const M=fixtureEngine([
 ['Echoing Spell','When you cast this spell, copy it.\nYou gain 2 life.','Sorcery','{G}'],
 ['Many Echoes','When you cast this spell, copy it X times. You may choose new targets for the copies.\nYou gain 1 life.','Sorcery','{X}{G}'],
 ['Commander Echoes',"When you cast this spell, copy it for each time you've cast your commander from the command zone this game.\nYou gain 2 life.",'Sorcery','{G}'],
 ['Artifact Copier','Whenever you cast a creature spell, copy it, except the copy is an artifact in addition to its other types.','Enchantment','{G}'],
 ['Spirit Copier','Whenever you cast a creature spell, copy it, except the copy is a 1/1 Spirit in addition to its other types.','Enchantment','{G}'],
 ['Legend Copier',"Whenever you cast a creature spell, copy it, except the copy isn't legendary. You may choose new targets for the copy.",'Enchantment','{G}'],
 ['Tribal Copier','Whenever you cast a Beast or Bird creature spell, copy it.','Enchantment','{G}'],
 ['Artifact Probe','Counter target artifact spell.','Instant','{U}'],
 ['Legend Probe','Counter target legendary spell.','Instant','{U}'],
 ['Echo Legend','Flying','Legendary Creature — Bird','{G}'],
]);
for(const role of ['human','ai']){
 test(`${role}: a spell's cast trigger copies the actual spell and copying does not trigger another cast`,async()=>{
  const {game,a}=context(M,role),spell=put(M,game,a,'Echoing Spell','hand');a.pool.G=1;
  let casts=0,copies=0;const emit=game.emit;game.emit=async function(event,data){if(event==='cast')casts++;if(event==='spellCopied')copies++;return emit.call(this,event,data);};
  assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);assert.equal(a.life,44);assert.equal(casts,1);assert.equal(copies,1);assert.equal(a.pool.G,0);assert.equal(spell.zone,'graveyard');
 });
 test(`${role}: X on a cast trigger is captured from that spell's announcement`,async()=>{
  const {game,a}=context(M,role),spell=put(M,game,a,'Many Echoes','hand');a.pool.G=1;a.pool.C=3;
  assert.equal(await game.castSpell(a,spell,{from:'hand',xVal:3}),true);spell.castMeta.x=9;await settle(game);assert.equal(a.life,44,'original and three copies each gain one');
 });
 test(`${role}: commander-count copies use the actual number of command-zone casts`,async()=>{
  const {game,a}=context(M,role),commander=put(M,game,a,'Echo Legend','command');commander.commander=true;a.commanders.push(commander);a.pool.G=2;a.pool.C=10;
  assert.equal(await game.castSpell(a,commander,{from:'command'}),true);await settle(game);await game.move(commander,'command');
  assert.equal(await game.castSpell(a,commander,{from:'command'}),true);await settle(game);assert.equal(a.commanderCasts,2);
  const spell=put(M,game,a,'Commander Echoes','hand');a.pool.G=1;assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);assert.equal(a.life,46);
 });
 for(const [copier,check]of[['Artifact Copier',token=>assert.equal(token.is('Artifact'),true)],['Spirit Copier',token=>{assert.equal(token.power,1);assert.equal(token.toughness,1);assert.equal(token.hasSub('Spirit'),true);}],['Legend Copier',token=>assert.equal(token.def.super.includes('Legendary'),false)]])test(`${role}: ${copier} applies copiable exceptions before the copied permanent enters`,async()=>{
  const {game,a}=context(M,role);put(M,game,a,copier);const original=put(M,game,a,copier==='Legend Copier'?'Echo Legend':'Grizzly Bears','hand');if(copier==='Legend Copier')original.def={...original.def,super:['Legendary'],types:['Creature']};a.pool.G=2;a.pool.C=2;
  const copies=[];const emit=game.emit;game.emit=async function(event,data){if(event==='etb'&&data.card.isToken)copies.push(data.card);return emit.call(this,event,data);};
  assert.equal(await game.castSpell(a,original,{from:'hand'}),true);await settle(game);assert.equal(copies.length,1);const token=copies[0];assert.equal(token.zone,'battlefield');assert.equal(token.ctrl,a);assert.equal(original.zone,'battlefield');check(token);
  if(copier==='Artifact Copier')assert.equal(original.is('Artifact'),false);if(copier==='Spirit Copier'){assert.equal(original.power,2);assert.equal(original.hasSub('Spirit'),false);}if(copier==='Legend Copier')assert.equal(original.def.super.includes('Legendary'),true);
 });
 test(`${role}: an original countered before its cast trigger resolves cannot be copied`,async()=>{
  const {game,a}=context(M,role),spell=put(M,game,a,'Echoing Spell','hand');a.pool.G=1;assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);
  const index=game.stack.findIndex(row=>row.kind==='spell'&&row.card===spell);assert.ok(index>=0);game.stack.splice(index,1);await game.move(spell,'graveyard');await settle(game);assert.equal(a.life,40);
 });
}

for(const role of ['human','ai'])test(`${role}: shared Beast or Bird creature restriction excludes noncreature Kindred spells`,async()=>{
 const {game,a}=context(M,role);put(M,game,a,'Tribal Copier');let copied=0;const emit=game.emit;game.emit=async function(event,data){if(event==='spellCopied')copied++;return emit.call(this,event,data);};
 for(const [types,subtype,expected] of [[['Kindred','Sorcery'],'Beast',0],[['Creature'],'Bird',1],[['Creature'],'Bear',1],[['Creature'],'Beast',2]]){
  const card=put(M,game,a,'Grizzly Bears','hand');card.def={...card.def,types,subtypes:[subtype],cost:'{0}'};await game.castSpell(a,card,{from:'hand'});await settle(game);assert.equal(copied,expected);
 }
});
for(const role of ['human','ai'])test(`${role}: target qualities on Stack use a copy's modified definition`,async()=>{
 const {game,a}=context(M,role);put(M,game,a,'Artifact Copier');const original=put(M,game,a,'Echo Legend','hand');original.def={...original.def,super:['Legendary'],types:['Creature']};a.pool.G=1;await game.castSpell(a,original,{from:'hand'});await game.flushTriggers();await game.resolveTop();
 const copy=game.stack.find(row=>row.isCopy),spell=game.stack.find(row=>!row.isCopy&&row.kind==='spell');assert.ok(copy);assert.ok(spell);
 const probe=put(M,game,a,'Artifact Probe','hand'),spec=(typeof probe.def.targets==='function'?probe.def.targets(game,probe,{},a):probe.def.targets)[0];assert.equal(spec.filter(game,copy,a,probe),true);assert.equal(spec.filter(game,spell,a,probe),false);
 const unlegend=M.OracleV8Copies.modifiedDefinition(copy.oracleDefinition,{nonlegendary:true},{});copy.oracleDefinition=unlegend;
 const legend=put(M,game,a,'Legend Probe','hand'),legendSpec=(typeof legend.def.targets==='function'?legend.def.targets(game,legend,{},a):legend.def.targets)[0];assert.equal(legendSpec.filter(game,copy,a,legend),false);assert.equal(legendSpec.filter(game,spell,a,legend),true);
});
