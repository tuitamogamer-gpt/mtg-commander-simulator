import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {extensionCondition} from '../scripts/oracle-v8-casting-rules.mjs';

const MTG=fixtureEngine([
 ['Cast Rule Colored',"This spell costs {2}{U} less to cast if you've cast an instant or sorcery spell this turn.\nDraw a card.",'Instant','{3}{U}{U}'],
 ['Cast Rule Green','This spell costs {G} less to cast for each green creature you control.\nTrample','Creature — Hydra','{G}{G}{G}'],
 ['Cast Rule Combined','This spell costs {1} less to cast if you control a Spirit and {1} less to cast if you control an enchantment.\nDraw a card.','Instant','{2}{U}'],
 ['Cast Rule Surcharge','This spell costs {2} more to cast if it targets a Dragon.\nDestroy target creature.','Instant','{1}{B}'],
 ['Cast Rule Return','This spell costs {3} less to cast if it targets a creature card with mana value 3 or less.\nReturn target creature card from your graveyard to the battlefield.','Sorcery','{4}{B}'],
 ['Cast Rule Restriction',"Cast this spell only if you've cast another spell this turn.\nDraw a card.",'Sorcery','{U}'],
 ['Cast Rule Upkeep',"Cast this spell only during an opponent's upkeep.\nDraw a card.",'Instant','{U}'],
 ['Cast Rule Vampire','Cast this spell only if you control two or more Vampires.\nDraw a card.','Sorcery','{B}'],
 ['Cast Rule Opponent',"This spell costs {U}{U}{U} less to cast if an opponent has drawn four or more cards this turn.\nDraw a card.",'Instant','{X}{U}{U}{U}'],
 ['Cast Rule Land Names','This spell costs {X} less to cast, where X is the number of differently named lands you control.','Creature — Fungus','{5}{G}'],
 ['Cast Rule Modified','This spell costs {1} less to cast for each modified creature you control.','Artifact Creature — Construct','{5}'],
 ['Cast Rule Own Zones','This spell costs {1} less to cast for each creature card you own in exile and in your graveyard.','Creature — Insect','{5}{B}'],
 ['Cast Rule Opponent Damage','This spell costs {1} less to cast for each opponent who was dealt damage this turn.','Creature — Gnoll','{5}{R}'],
 ['Cast Rule Draw Trap','If an opponent has drawn three or more cards this turn, you may pay {R} rather than pay this spell\'s mana cost.\nDraw a card.','Instant','{5}{R}'],
 ['Cast Rule Entry Trap','If an opponent had two or more creatures enter the battlefield under their control this turn, you may pay {U} rather than pay this spell\'s mana cost.\nDraw a card.','Instant','{3}{U}{U}'],
 ['Cast Rule Kicker','This spell costs {U}{U} less to cast if an opponent has drawn three or more cards this turn.\nKicker {U}\nDraw a card.\nIf this spell was kicked, draw a card.','Instant','{U}'],
 ['Cast Rule Stack Exile','Exile any number of target spells.','Instant','{U}'],
 ['Cast Rule Draw Modified','Draw a card for each modified creature you control.','Sorcery','{U}'],
 ['Cast Rule Draw Land Names','{T}: Draw cards equal to the number of differently named lands you control.','Artifact','{0}'],
 ['Cast Rule Draw Damaged','Draw a card for each opponent who was dealt damage this turn.','Sorcery','{U}'],
 ['Cast Rule Seed','Draw a card.','Instant','{0}'],
 ['Cast Rule Spirit','','Creature — Spirit','{G}'],
 ['Cast Rule Enchantment','','Enchantment','{0}'],
 ['Cast Rule Dragon','','Creature — Dragon','{3}{R}'],
 ['Cast Rule Bear','','Creature — Bear','{1}{G}'],
 ['Cast Rule Vampire Body','','Creature — Vampire','{B}'],
]);
const own=(ctx,name,zone='battlefield')=>put(MTG,ctx.game,ctx.a,name,zone);
function ready(role,name,opponents=1){const ctx=context(MTG,role,opponents);ctx.a.pool={W:0,U:0,B:0,R:0,G:0,C:0};return {...ctx,source:own(ctx,name,'hand')};}
const cost=ctx=>ctx.game.spellCost(ctx.a,ctx.source,{from:'hand'});
const row=ctx=>ctx.game.castableList(ctx.a).find(entry=>entry.card===ctx.source&&!entry.alt?.oracleAlternativeId);
async function cast(ctx){const offered=row(ctx);assert.ok(offered);if(ctx.a.isAI){const action=await ctx.a.controller.decide(ctx.game,{type:'main',player:ctx.a,phase:ctx.game.phase,casts:[offered],acts:[],lands:[]});assert.equal(action.kind,'cast');return ctx.game.performAction(ctx.a,action);}return ctx.game.castSpell(ctx.a,ctx.source,{from:'hand',alt:offered.alt});}

for(const role of ['human','ai']){
 test(`casting rules ${role}: exact colored and generic reductions follow a real previous spell`,async()=>{
  const ctx=ready(role,'Cast Rule Colored');ctx.a.pool.C=1;ctx.a.pool.U=1;
  assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand'}),false);
  const prior=own(ctx,'Cast Rule Seed','hand');assert.equal(await ctx.game.castSpell(ctx.a,prior,{from:'hand'}),true);await settle(ctx.game);
  assert.equal(cost(ctx).generic,1);assert.deepEqual(Array.from(cost(ctx).pips,p=>Array.from(p)),[['U']]);
  assert.equal(await cast(ctx),true);assert.equal(ctx.a.pool.C+ctx.a.pool.U,0);await settle(ctx.game);assert.equal(ctx.a.hand.length,2);
 });
 test(`casting rules ${role}: colored counts floor at zero without converting other colored pips`,async()=>{
  const ctx=ready(role,'Cast Rule Green');own(ctx,'Cast Rule Bear');own(ctx,'Cast Rule Bear');put(MTG,ctx.game,ctx.b,'Cast Rule Bear');
  assert.equal(cost(ctx).pips.length,1);ctx.a.pool.C=1;assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand'}),false);
  ctx.a.pool.C=0;ctx.a.pool.G=1;assert.equal(await cast(ctx),true);assert.equal(ctx.a.pool.G,0);await settle(ctx.game);
  const free=ready(role,'Cast Rule Green');for(let n=0;n<5;n++)own(free,'Cast Rule Bear');assert.equal(cost(free).pips.length,0);assert.equal(await cast(free),true);await settle(free.game);
 });
 test(`casting rules ${role}: two discounts stack and a stale restriction cannot bypass payment authority`,async()=>{
  const ctx=ready(role,'Cast Rule Combined');ctx.a.pool.U=1;own(ctx,'Cast Rule Spirit');own(ctx,'Cast Rule Enchantment');assert.equal(cost(ctx).generic,0);assert.equal(await cast(ctx),true);await settle(ctx.game);
  const restricted=ready(role,'Cast Rule Restriction');restricted.a.pool.U=1;assert.equal(!!row(restricted),false);assert.equal(await restricted.game.castSpell(restricted.a,restricted.source,{from:'hand',free:true}),false);
  restricted.a.turnState.spellsCast=1;const offered=row(restricted);assert.ok(offered);restricted.a.turnState.spellsCast=0;
  assert.equal(await restricted.game.castSpell(restricted.a,restricted.source,{from:'hand',alt:offered.alt}),false);assert.equal(restricted.a.pool.U,1);assert.equal(restricted.source.zone,'hand');
  const prior=own(restricted,'Cast Rule Seed','hand');assert.equal(await restricted.game.castSpell(restricted.a,prior,{from:'hand'}),true);await settle(restricted.game);
  assert.equal(await cast(restricted),true);await settle(restricted.game);
 });
 test(`casting rules ${role}: target surcharge availability considers affordable alternatives and payment uses announced target`,async()=>{
  const ctx=ready(role,'Cast Rule Surcharge');ctx.a.pool.B=1;ctx.a.pool.C=1;const dragon=put(MTG,ctx.game,ctx.b,'Cast Rule Dragon'),bear=put(MTG,ctx.game,ctx.b,'Cast Rule Bear');
  assert.ok(row(ctx),'non-Dragon target keeps normal cost available');assert.equal(cost(ctx).generic,1);
  const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>q.type==='chooseTargets'?Promise.resolve([dragon]):decide(g,q);
  assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand'}),false);assert.equal(ctx.a.pool.B+ctx.a.pool.C,2);assert.equal(dragon.zone,'battlefield');
  ctx.a.pool.C=3;assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand'}),true);assert.equal(ctx.a.pool.B+ctx.a.pool.C,0);await settle(ctx.game);assert.equal(dragon.zone,'graveyard');assert.equal(bear.zone,'battlefield');
 });
 test(`casting rules ${role}: opponent draw Trap preserves normal payment and rechecks exact per-player records`,async()=>{
  const ctx=ready(role,'Cast Rule Draw Trap',2);ctx.a.pool.R=1;
  await ctx.game.draw(ctx.a,3);await ctx.game.draw(ctx.b,2);await ctx.game.draw(ctx.others[1],1);
  assert.equal(ctx.game.castableList(ctx.a).some(entry=>entry.card===ctx.source),false,'neither our draws nor sums across opponents satisfy one opponent');
  await ctx.game.draw(ctx.b,1);const alternative=ctx.game.castableList(ctx.a).find(entry=>entry.card===ctx.source&&entry.alt?.oracleAlternativeId);assert.ok(alternative);
  ctx.b.turnState.drewThisTurn=0;assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand',alt:alternative.alt}),false);assert.equal(ctx.a.pool.R,1);
  await ctx.game.draw(ctx.b,3);assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand',alt:alternative.alt}),true);assert.equal(ctx.a.pool.R,0);await settle(ctx.game);
  const normal=ready(role,'Cast Rule Draw Trap');normal.a.pool.R=1;normal.a.pool.C=5;assert.equal(await cast(normal),true);assert.equal(normal.a.pool.R+normal.a.pool.C,0);await settle(normal.game);
 });
}

test('casting restriction upkeep and subtype counts are exact across controllers',async()=>{
 const ctx=ready('human','Cast Rule Upkeep');ctx.a.pool.U=1;assert.equal(!!row(ctx),false);ctx.game.phase='upkeep';assert.equal(!!row(ctx),false);ctx.game.turnPlayer=ctx.b;assert.equal(await cast(ctx),true);await settle(ctx.game);
 const vampires=ready('human','Cast Rule Vampire');vampires.a.pool.B=1;own(vampires,'Cast Rule Vampire Body');put(MTG,vampires.game,vampires.b,'Cast Rule Vampire Body');assert.equal(!!row(vampires),false);own(vampires,'Cast Rule Vampire Body');assert.equal(await cast(vampires),true);await settle(vampires.game);
});

test('casting count primitives count current modified creatures, distinct lands, owner zones and damaged opponents',async()=>{
 const modified=ready('human','Cast Rule Modified');const body=own(modified,'Cast Rule Bear');own(modified,'Cast Rule Bear');assert.equal(cost(modified).generic,5);modified.game.addCounters(body,'+1/+1',1,false,modified.a);assert.equal(cost(modified).generic,4);body.ctrl=modified.b;modified.game.recalc();assert.equal(cost(modified).generic,5);
 const lands=ready('human','Cast Rule Land Names');own(lands,'Forest');own(lands,'Forest');own(lands,'Island');put(MTG,lands.game,lands.b,'Swamp');assert.equal(cost(lands).generic,3);
 const zones=ready('human','Cast Rule Own Zones');own(zones,'Cast Rule Bear','graveyard');own(zones,'Cast Rule Bear','exile');own(zones,'Forest','exile');put(MTG,zones.game,zones.b,'Cast Rule Bear','graveyard');assert.equal(cost(zones).generic,3);
 const damage=ready('human','Cast Rule Opponent Damage',2);await damage.game.damageAny(null,damage.b,4);await damage.game.damageAny(null,damage.b,2);await damage.game.damageAny(null,damage.a,2);assert.equal(cost(damage).generic,4);await damage.game.damageAny(null,damage.others[1],1);assert.equal(cost(damage).generic,3);
});

test('casting colored X reduction leaves X unchanged and reduces commander tax only by generic reductions',()=>{
 const ctx=ready('human','Cast Rule Opponent');ctx.b.turnState.drewThisTurn=4;assert.equal(cost(ctx).pips.length,0);assert.equal(cost(ctx).x,1);assert.equal(cost(ctx).generic,0);
 const commander=ready('human','Cast Rule Green');commander.a.hand.splice(0,1);commander.source.zone='command';commander.a.command.push(commander.source);commander.source.commander=true;commander.source.cmdCasts=2;for(let n=0;n<5;n++)own(commander,'Cast Rule Bear');assert.equal(cost(commander).generic,4);assert.equal(cost(commander).pips.length,0);
});

test('casting entry records survive departure and creature entries exclude noncreatures',async()=>{
 const ctx=ready('human','Cast Rule Entry Trap');ctx.a.pool.U=1;
 const creature=put(MTG,ctx.game,ctx.b,'Cast Rule Bear','hand');await ctx.game.move(creature,'battlefield');await ctx.game.move(creature,'graveyard');
 const artifact=put(MTG,ctx.game,ctx.b,'Sol Ring','hand');await ctx.game.move(artifact,'battlefield');assert.equal(ctx.game.castableList(ctx.a).some(entry=>entry.card===ctx.source),false);
 const second=put(MTG,ctx.game,ctx.b,'Cast Rule Bear','hand');await ctx.game.move(second,'battlefield');await ctx.game.move(second,'graveyard');const alternative=ctx.game.castableList(ctx.a).find(entry=>entry.card===ctx.source&&entry.alt?.oracleAlternativeId);assert.ok(alternative);assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand',alt:alternative.alt}),true);await settle(ctx.game);
});

for(const role of ['human','ai'])test(`casting rules ${role}: a residual colored reduction pays a chosen kicker exactly once`,async()=>{
 const ctx=ready(role,'Cast Rule Kicker');await ctx.game.draw(ctx.b,3);
 assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand'}),true);
 const spell=ctx.game.stack.find(row=>row.card===ctx.source);assert.equal(spell.kicked,true);assert.equal(spell.manaSpent,0);
 assert.ok(ctx.trace.some(row=>row.q.type==='chooseOption'&&row.q.prompt.startsWith('Kicker')&&row.result==='yes'));
 await settle(ctx.game);assert.equal(ctx.a.hand.length,2);
});

for(const role of ['human','ai'])test(`casting rules ${role}: exile removes an uncounterable spell and a copy without countering or moving the original twice`,async()=>{
 const ctx=ready(role,'Cast Rule Stack Exile');ctx.a.pool.U=1;
 const target=put(MTG,ctx.game,ctx.b,'Cast Rule Seed','hand');target.def={...target.def,uncounterable:true};
 assert.equal(await ctx.game.castSpell(ctx.b,target,{from:'hand'}),true);const original=ctx.game.stack.find(row=>row.card===target);
 const copy={...original,isCopy:true,name:original.name+' copy',castOpts:{...original.castOpts}};ctx.game.stack.push(copy);
 assert.equal(await ctx.game.counterStackObject(original),false,'uncounterable check is live');
 if(role==='human'){const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>q.type==='chooseTargets'?Promise.resolve([original,copy]):decide(g,q);}
 assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand'}),true);const spell=ctx.game.stack.at(-1);assert.equal(spell.targets.flat().length,2);
 await ctx.game.resolveTop();assert.equal(ctx.game.stack.includes(original),false);assert.equal(ctx.game.stack.includes(copy),false);assert.equal(target.zone,'exile');assert.equal(ctx.b.exile.filter(card=>card===target).length,1);assert.equal(ctx.b.hand.length,0);assert.equal(ctx.source.zone,'graveyard');
});

for(const role of ['human','ai'])test(`casting count values ${role}: shared effect amounts execute nonzero live and turn counts`,async()=>{
 const modified=ready(role,'Cast Rule Draw Modified');modified.a.pool.U=1;const body=own(modified,'Cast Rule Bear');own(modified,'Cast Rule Bear');modified.game.addCounters(body,'+1/+1',1,false,modified.a);
 assert.equal(await cast(modified),true);await settle(modified.game);assert.equal(modified.a.hand.length,1);
 const lands=context(MTG,role),scroll=own(lands,'Cast Rule Draw Land Names');own(lands,'Forest');own(lands,'Forest');own(lands,'Island');put(MTG,lands.game,lands.b,'Swamp');
 assert.equal(await lands.game.activateAbility(lands.a,lands.game.activatableList(lands.a).find(row=>row.card===scroll)),true);await settle(lands.game);assert.equal(lands.a.hand.length,2);
 const damaged=ready(role,'Cast Rule Draw Damaged',2);damaged.a.pool.U=1;await damaged.game.damageAny(null,damaged.b,3);await damaged.game.damageAny(null,damaged.others[1],2);
 assert.equal(await cast(damaged),true);await settle(damaged.game);assert.equal(damaged.a.hand.length,2);
});

test('casting grammar fails closed on unknown history, bound values, malformed verbs and hybrid costs',()=>{
 assert.equal(extensionCondition('an opponent drew three or more spells this turn',{}),null);
 for(const text of [
  'This spell costs {1} less to cast for each creature that attacked this turn.',
  'This spell costs {1} less to cast for each permanent you sacrificed this turn.',
  'Cast this spell only if a creature left your graveyard this turn.',
  'This spell costs {U} less to cast if it targets a tapped creature.',
 ])assert.equal(!!semanticClass({name:'Unknown Cast Rule',layout:'normal',type_line:'Instant',mana_cost:'{2}{U}',oracle_text:text+'\nDraw a card.'}).semanticClass,false,text);
 assert.equal(!!semanticClass({name:'Hybrid Cast Rule',layout:'normal',type_line:'Instant',mana_cost:'{2}{U/R}',oracle_text:'This spell costs {U} less to cast if an opponent cast two or more spells this turn.\nDraw a card.'}).semanticClass,false);
});
