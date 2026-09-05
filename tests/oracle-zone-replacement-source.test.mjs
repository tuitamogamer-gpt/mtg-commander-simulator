import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {extensionLine} from '../scripts/oracle-v8-zone-replacements.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const M=loadEngine(),raw=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-zone-replacement-source.json',import.meta.url)));
const cards=raw.map((card,i)=>{const semantic=semanticClass(card),types=card.type_line.split(' — ')[0].split(' ');assert.ok(semantic.semanticClass,card.name+': '+semantic.reason);return {position:i+1,oracleId:card.oracle_id,scryfallId:card.id,...semantic,raw:{name:card.name,oracle:card.oracle_text,cost:card.mana_cost,types:types.filter(t=>!['Legendary','Basic','Snow'].includes(t)),super:types.filter(t=>['Legendary','Basic','Snow'].includes(t)),subtypes:card.type_line.split(' — ')[1]?.split(' ')||[],power:card.power,toughness:card.toughness,_ci:card.color_identity},catalog:{typeLine:card.type_line,commanderLegality:'legal'}};});
M.registerOracleBatch({id:'zone-replacement-source-proof',sequence:9993,cards:cards.filter(c=>!M.DEFS[c.raw.name])});M.initData(M.RAW_DATA);
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=100;};
function setup(role){const ctx=context(M,role);assert.equal(ctx.a.controller instanceof M.AIController,role==='ai');return ctx;}
async function cast(ctx,name,p=ctx.a){fund(p);const card=put(M,ctx.game,p,name,'hand');ctx.game.turnPlayer=p;ctx.game.phase='main1';const before=Object.values(p.pool).reduce((x,y)=>x+y,0);assert.equal(await ctx.game.castSpell(p,card,{from:'hand'}),true,name);await settle(ctx.game);assert.ok(Object.values(p.pool).reduce((x,y)=>x+y,0)<before);return card;}
for(const role of ['human','ai']){
 for(const entry of cards)test(`${role}: paid ${entry.raw.name} changes the exact proposed graveyard move without a dies event`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,op=entry.implementation.find(x=>x.kind==='zone-replacement-v8');put(M,game,a,'Grizzly Bears','graveyard');
  const source=await cast(ctx,entry.raw.name);let victim=source;
  if(source.is('Instant')||source.is('Sorcery')){assert.equal(source.zone,'library');return;}
  if(op.scope!=='self')victim=op.scope==='instant-or-sorcery'?put(M,game,b,'Lightning Bolt','hand'):put(M,game,b,'Grizzly Bears');
  if(op.scope==='damaged-by-source')await game.damageCreature(source,victim,1,{deferSBA:true});
  const version=victim.zoneVersion;let died=0;const emit=game.emit.bind(game);game.emit=async(name,data)=>{if(data.card===victim&&name==='dies')died++;return emit(name,data);};
  if(victim.zone==='battlefield')await game.sacrifice(victim.ctrl,victim);else await game.discard(b,[victim]);
  assert.equal(victim.zone,op.to);assert.equal(victim.zoneVersion,version+1);assert.equal(died,0);
  if(op.placement==='top')assert.equal(victim.owner.library.at(-1),victim);if(op.placement==='bottom')assert.equal(victim.owner.library[0],victim);
 });
 test(`${role}: Rest in Peace applies from hand, library, battlefield and to itself in a real paid board wipe`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx;put(M,game,a,'Grizzly Bears','graveyard');const rest=await cast(ctx,'Rest in Peace');assert.equal(a.graveyard.length,0,'printed ETB exiles all graveyards');
  const hand=put(M,game,b,'Forest','hand'),top=b.library.at(-1);await game.discard(b,[hand]);await game.mill(b,1);assert.equal(hand.zone,'exile');assert.equal(top.zone,'exile');
  const own=put(M,game,a,'Grizzly Bears'),enemy=put(M,game,b,'Grizzly Bears');const wipe=await cast(ctx,'Planar Cleansing',b);
  for(const card of [rest,own,enemy])assert.equal(card.zone,'exile');assert.equal(wipe.zone,'graveyard','Rest is gone when the later resolving spell card leaves the stack');assert.equal(game.diedThisTurn.length,0);
 });
 test(`${role}: owner and controller scopes, phased or suppressed sources, and permanent-only scope remain distinct`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,source=await cast(ctx,'Anafenza, the Foremost'),foreign=put(M,game,b,'Grizzly Bears');M.OracleV8Control.gain(game,foreign,a);game.recalc();await game.sacrifice(a,foreign);assert.equal(foreign.zone,'exile','opponent owns even though source controller stole it');
  const own=put(M,game,a,'Grizzly Bears');M.OracleV8Control.gain(game,own,b);game.recalc();await game.sacrifice(b,own);assert.equal(own.zone,'graveyard','own creature is excluded even under opponent control');
  game.phaseOut(source);const phased=put(M,game,b,'Grizzly Bears');await game.sacrifice(b,phased);assert.equal(phased.zone,'graveyard');game.phaseInFor(a);
  await cast(ctx,'Lignify');const blank=put(M,game,b,'Grizzly Bears');await game.sacrifice(b,blank);assert.equal(blank.zone,'graveyard','no replacement with abilities removed');
 });
 test(`${role}: a source damage mark is identity-bound across source blink, recipient blink, simulation and cleanup`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,source=await cast(ctx,"Kumano's Pupils"),target=put(M,game,b,'Wall of Frost');await game.damageCreature(source,target,1,{deferSBA:true});
  const saved=M.captureGameState(game);assert.ok(saved);const restored=setup(role).game;M.restoreGameState(restored,JSON.parse(JSON.stringify(saved)));const savedTarget=restored.byIid(target.iid);await restored.sacrifice(savedTarget.ctrl,savedTarget);assert.equal(savedTarget.zone,'exile','JSON save preserves exact damage source and target identities');
  const cloned=M.cloneGameForAISimulation(game,61512),clonedTarget=cloned.byIid(target.iid);await cloned.sacrifice(clonedTarget.ctrl,clonedTarget);assert.equal(clonedTarget.zone,'exile');assert.equal(target.zone,'battlefield');
  await game.move(source,'exile');await game.putPermanentOntoBattlefield(source,a);await game.sacrifice(b,target);assert.equal(target.zone,'graveyard','new source incarnation has no earlier damage');
  const other=put(M,game,b,'Wall of Frost');await game.damageCreature(source,other,1,{deferSBA:true});await game.move(other,'exile');await game.putPermanentOntoBattlefield(other,b);await game.sacrifice(b,other);assert.equal(other.zone,'graveyard','new recipient has no earlier damage');
  const next=put(M,game,b,'Wall of Frost');await game.damageCreature(source,next,1,{deferSBA:true});game.turnNo++;await game.sacrifice(b,next);assert.equal(next.zone,'graveyard','earlier turn is excluded');
 });
 test(`${role}: damage-marked death sees simultaneous last-known sources but stops after source removal`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,source=await cast(ctx,'Frostwielder'),target=put(M,game,b,'Wall of Frost');source.sick=false;const action=game.activatableList(a).find(row=>row.card===source);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);
  // AI can legally choose a player for this source ability; use actual damage
  // to stage the simultaneous death route independently of that target choice.
  await game.damageCreature(source,target,1,{deferSBA:true});await cast(ctx,'Wrath of God',b);assert.equal(source.zone,'graveyard');assert.equal(target.zone,'exile','pre-event source still replaces the same wipe');
  const source2=await cast(ctx,'Frostwielder'),other=put(M,game,b,'Wall of Frost');await game.damageCreature(source2,other,1,{deferSBA:true});await game.move(source2,'exile');await game.sacrifice(b,other);assert.equal(other.zone,'graveyard','a departed static source has no later effect');
 });
 test(`${role}: Nexus copies resolve without moving the original or same-name sibling`,async()=>{
  const ctx=setup(role),{game,a}=ctx;fund(a);const original=put(M,game,a,'Nexus of Fate','hand'),sibling=put(M,game,a,'Nexus of Fate','hand');
  assert.equal(await game.castSpell(a,original,{from:'hand'}),true);const version=original.zoneVersion,originalStack=game.stack.find(row=>row.card===original);
  const copySpell=put(M,game,a,'Twincast','hand');assert.equal(await game.castSpell(a,copySpell,{from:'hand'}),true);await game.resolveTop();const copy=game.stack.find(row=>row.isCopy&&row.copyOf===originalStack);assert.ok(copy);
  await game.resolveTop();assert.equal(original.zone,'stack');assert.equal(original.zoneVersion,version);assert.equal(sibling.zone,'hand');assert.equal(a.library.includes(original),false);
  await game.resolveTop();assert.equal(original.zone,'library');assert.equal(original.zoneVersion,version+1);assert.equal(sibling.zone,'hand');assert.equal(a.library.filter(card=>card===original).length,1);assert.equal(game.extraTurns.length,2);
 });
 test(`${role}: a self any-zone ability replaces actual discard and mill with reveal and shuffle`,async()=>{
  const ctx=setup(role),{game,a}=ctx;let shown=[];game.revealToHuman=async data=>{shown.push(...data.cards);};
  const hand=put(M,game,a,'Darksteel Colossus','hand');await game.discard(a,[hand]);assert.equal(hand.zone,'library');assert.ok(shown.includes(hand));assert.equal(a.turnState.discardedN,1,'it is still discarded');
  const top=put(M,game,a,'Legacy Weapon','library');await game.mill(a,1);assert.equal(top.zone,'library');assert.ok(shown.includes(top));assert.equal(a.graveyard.includes(top),false);
 });
 test(`${role}: Samurai replaces battlefield permanents and tokens but excludes ordinary discard`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,source=await cast(ctx,'Samurai of the Pale Curtain'),hand=put(M,game,b,'Grizzly Bears','hand');await game.discard(b,[hand]);assert.equal(hand.zone,'graveyard');
  const token=put(M,game,b,'Grizzly Bears');token.isToken=true;let dies=0;const emit=game.emit.bind(game);game.emit=async(name,data)=>{if(name==='dies'&&data.card===token)dies++;return emit(name,data);};await game.sacrifice(b,token);assert.equal(token.zone,'ceased');assert.equal(dies,0);assert.equal(b.graveyard.includes(token),false);assert.equal(b.exile.includes(token),false);
  const land=put(M,game,b,'Forest');await game.sacrifice(b,land);assert.equal(land.zone,'exile');await game.sacrifice(a,source);assert.equal(source.zone,'exile','its own static ability applies to its death');
 });
 test(`${role}: a paid permanent copy uses its copied replacement then returns to its printed library identity`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,original=await cast(ctx,'Darksteel Colossus',b);if(role==='human'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.type==='chooseCards'&&q.source?.name==='Clever Impersonator'?[original]:decide(g,q);}const copy=await cast(ctx,'Clever Impersonator');assert.equal(copy.name,'Darksteel Colossus');assert.ok(copy.def.oracleZoneReplacements?.length);
  await game.sacrifice(a,copy);assert.equal(copy.zone,'library');assert.equal(copy.name,'Clever Impersonator');assert.ok(a.library.includes(copy));assert.equal(original.zone,'battlefield');
 });
 test(`${role}: dying self text stops applying when its source is no longer a creature`,async()=>{
  const ctx=setup(role),{game,a}=ctx,source=await cast(ctx,'Gravebane Zombie');source.def={...source.def,types:['Artifact']};game.recalc();await game.sacrifice(a,source);assert.equal(source.zone,'graveyard','an artifact going to a graveyard did not die');
 });
 test(`${role}: self replacements compete with Dauthi, finality and unearthed departure without false death`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,source=await cast(ctx,'Darksteel Colossus'),dauthi=put(M,game,b,'Dauthi Voidwalker');
  const decide=a.controller.decide.bind(a.controller);if(role==='human')a.controller.decide=async(g,q)=>q.aiHint?.event==='zoneChange'?String(q.options.findIndex(x=>/shuffle/.test(x.label))):decide(g,q);
  await game.sacrifice(a,source);assert.ok(['library','exile'].includes(source.zone));assert.ok(ctx.trace.some(row=>row.q.aiHint?.event==='zoneChange')||role==='human');assert.equal(game.diedThisTurn.length,0);if(source.zone==='exile')assert.equal(source.counters.void,1);else assert.equal(source.counters.void,undefined);
  const next=await cast(ctx,'Darksteel Colossus');game.addCounters(next,'finality',1);next.meta.unearth=true;await game.sacrifice(a,next);assert.equal(next.zone,'exile','unearth still applies after a self-library replacement');assert.equal(game.diedThisTurn.length,0);
 });
}
test('new zone descriptors fail closed for unknown scopes, durations and riders',()=>{
 for(const line of ['If a creature would die, you may exile it instead.','If a creature an opponent controls would die, exile it instead. Draw a card.','If this creature would die this turn, exile it instead.'])assert.equal(extensionLine({name:'Example'},line),null);
 for(const extra of [{scope:'all-players'},{rider:'draw'},{to:'hand'},{from:'hand'}])assert.throws(()=>M.OracleV8ZoneReplacements.compile({kind:'zone-replacement-v8',scope:'all',from:'any',to:'exile',contract:'ordered-zone-replacement',...extra}));
});

test('damage history restore rejects malformed identities and clears history for older checkpoints',()=>{
 const ctx=setup('human'),snapshot=M.captureGameState(ctx.game);assert.ok(snapshot);
 for(const history of [{turn:snapshot.turnNo,bySource:[['bad',[]]]},{turn:snapshot.turnNo,bySource:[['1:0',['2:0','2:0']]]},{turn:snapshot.turnNo+1,bySource:[]},{turn:snapshot.turnNo,bySource:[['9007199254740992:0',[]]]}])assert.throws(()=>M.restoreGameState(ctx.game,{...snapshot,damageHistory:history}),/invalid damage history/);
 ctx.game.oracleDamageHistory={turn:ctx.game.turnNo,bySource:new Map([['1:0',new Set(['2:0'])]])};delete snapshot.damageHistory;M.restoreGameState(ctx.game,snapshot);assert.equal(ctx.game.oracleDamageHistory,undefined);
});
