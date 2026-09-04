import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {extensionEffect} from '../scripts/oracle-v8-multizone-search.mjs';
import {extensionTarget} from '../scripts/oracle-extensions-v8.mjs';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const named='Multizone Relic, First Witness',other='Multizone Gem';
const search=`Search your library and/or graveyard for a card named ${named}, reveal it, and put it into your hand. If you search your library this way, shuffle.`;
const rows=[
 ['Multizone Spell',search,'Sorcery','{G}'],
 ['Multizone Trigger','When this creature enters, you may '+search[0].toLowerCase()+search.slice(1),'Creature','{G}'],
 ['Multizone Typed','Search your library and/or graveyard for an artifact card with mana value 2 or less, reveal it, and put it into your hand. If you search your library this way, shuffle.','Sorcery','{G}'],
 ['Multizone Ability',`{1}, {T}: Search your graveyard, hand, and/or library for a card named ${named} and put it onto the battlefield. If you search your library this way, shuffle.`,'Creature','{G}'],
 ['Multizone Pair',`When this creature enters, you may search your graveyard, hand and/or library for a card named ${named} and/or a card named ${other} and put them onto the battlefield. If you search your library this way, shuffle.`,'Creature','{G}'],
 ['Multizone Back','When this creature enters, look at the top three cards of your library. You may put one of those cards back on top of your library. Put the rest into your graveyard.','Creature','{G}'],
 ['Multizone One','When this creature enters, look at the top two cards of your library. Put one into your hand and the other into your graveyard.','Creature','{G}'],
 [named,'','Artifact','{2}'],[other,'','Artifact','{1}'],['Multizone Expensive','','Artifact','{5}']
];
const MTG=fixtureEngine(rows),shuffle=MTG.shuffle,shuffles=[];
MTG.shuffle=(cards,...args)=>{shuffles.push(cards);return shuffle(cards,...args);};
function world(role,options={}){
 const ctx=context(MTG,role);ctx.options=options;
 if(role==='human'){
  const decide=ctx.a.controller.decide;
  ctx.a.controller.decide=async(g,q)=>{
   let result;
   if(q.type==='chooseOption'&&q.aiHint?.kind==='oracleSearchScopes')result=q.options.find(option=>option.label===(q.aiHint.scope==='zones'?options.zones||'graveyard':options.names||named+' and '+other))?.key??q.options[0].key;
   else if(q.type==='chooseCards'&&(q.search||/inspected/.test(q.prompt||'')))result=options.failFind?[]:q.from.slice(0,q.max||0);
   else if(q.type==='chooseOption'&&options.decline&&q.options.some(option=>option.key==='no'))result='no';
   else return decide(g,q);
   ctx.trace.push({q,result});return result;
  };
 }
 ctx.shuffleCount=()=>shuffles.filter(cards=>cards===ctx.a.library).length;
 return ctx;
}
async function cast(ctx,name){const card=put(MTG,ctx.game,ctx.a,name,'hand');ctx.a.pool.G=1;assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);await settle(ctx.game);return card;}
const searches=ctx=>ctx.trace.filter(row=>row.q.type==='chooseCards'&&row.q.search);
for(const role of ['human','ai']){
 test(`${role}: public graveyard search finds the comma-bearing exact name without shuffling`,async()=>{
  const ctx=world(role),found=put(MTG,ctx.game,ctx.a,named,'graveyard'),hidden=put(MTG,ctx.game,ctx.a,named,'library');
  const wrong=put(MTG,ctx.game,ctx.a,other,'graveyard'),enemy=put(MTG,ctx.game,ctx.b,named,'graveyard'),library=ctx.a.library.slice(),reveals=[];
  ctx.game.revealToHuman=async q=>reveals.push(q);
  await cast(ctx,'Multizone Trigger');
  assert.equal(found.zone,'hand');assert.equal(hidden.zone,'library');assert.equal(wrong.zone,'graveyard');assert.equal(enemy.zone,'graveyard');
  assert.deepEqual(ctx.a.library,library);assert.equal(ctx.shuffleCount(),0);
  assert.deepEqual([...searches(ctx).at(-1).q.from],[found]);assert.equal(searches(ctx).at(-1).q.min,1);
  assert.deepEqual([...reveals[0].cards],[found]);
 });
 test(`${role}: library search is a controller choice and shuffles after moving the selected card`,async()=>{
  const ctx=world(role,{zones:'library'}),found=put(MTG,ctx.game,ctx.a,named,'library');
  await cast(ctx,'Multizone Spell');
  assert.equal(found.zone,'hand');assert.equal(ctx.shuffleCount(),1);
  const pick=searches(ctx).at(-1);assert.equal(pick.q.min,0);assert.deepEqual(pick.q.from,[found]);
  const scope=ctx.trace.find(row=>row.q.aiHint?.scope==='zones');assert.ok(scope);assert.ok(ctx.trace.indexOf(scope)<ctx.trace.indexOf(pick));
  assert.equal(JSON.stringify(scope.q.options).includes(named),false);assert.equal(JSON.stringify(scope.q.aiHint).includes(named),false);
 });
 test(`${role}: typed searches filter actual mana value and card type in the chosen zone`,async()=>{
  const ctx=world(role),found=put(MTG,ctx.game,ctx.a,other,'graveyard'),expensive=put(MTG,ctx.game,ctx.a,'Multizone Expensive','graveyard'),land=put(MTG,ctx.game,ctx.a,'Forest','graveyard');
  await cast(ctx,'Multizone Typed');assert.equal(found.zone,'hand');assert.equal(expensive.zone,'graveyard');assert.equal(land.zone,'graveyard');
  assert.deepEqual(searches(ctx).at(-1).q.from,[found]);
 });
 test(`${role}: a paid tap ability finds a named card from hand and puts it onto the battlefield`,async()=>{
  const ctx=world(role,{zones:'hand'}),ability=put(MTG,ctx.game,ctx.a,'Multizone Ability'),found=put(MTG,ctx.game,ctx.a,named,'hand');
  ctx.a.pool.C=1;const option=ctx.game.activatableList(ctx.a).find(row=>row.card===ability&&!row.manaAbility);assert.ok(option);
  assert.equal(await ctx.game.activateAbility(ctx.a,option),true);assert.equal(ability.tapped,true);assert.equal(ctx.a.pool.C,0);await settle(ctx.game);
  assert.equal(found.zone,'battlefield');assert.equal(found.ctrl,ctx.a);assert.equal(ctx.shuffleCount(),0);
 });
 test(`${role}: two named clauses choose disjoint cards and enter as one batch`,async()=>{
  const ctx=world(role),first=put(MTG,ctx.game,ctx.a,named,'graveyard'),second=put(MTG,ctx.game,ctx.a,other,'graveyard');
  const enters=[],emit=ctx.game.emit;ctx.game.emit=async function(event,data,...args){if(event==='etb'&&(data.card===first||data.card===second))enters.push([first.zone,second.zone]);return emit.call(this,event,data,...args);};
  await cast(ctx,'Multizone Pair');assert.equal(first.zone,'battlefield');assert.equal(second.zone,'battlefield');assert.equal(ctx.shuffleCount(),0);
  assert.ok(enters.length===2&&enters.every(zones=>zones.every(zone=>zone==='battlefield')));
  assert.equal(searches(ctx).length,2);assert.ok(ctx.trace.some(row=>row.q.aiHint?.scope==='qualities'));
 });
 for(const mode of ['Back','One'])test(`${role}: exact top-selection wording ${mode} preserves the inspected cohort`,async()=>{
  const ctx=world(role),top=[put(MTG,ctx.game,ctx.a,'Multizone Expensive','library'),put(MTG,ctx.game,ctx.a,named,'library'),put(MTG,ctx.game,ctx.a,other,'library')];
  const inspected=mode==='Back'?top:top.slice(-2);await cast(ctx,'Multizone '+mode);
  const picked=ctx.trace.find(row=>row.q.type==='chooseCards'&&row.q.prompt?.startsWith('Choose inspected'));assert.ok(picked);const found=picked.result[0];assert.ok(inspected.includes(found));
  assert.equal(found.zone,mode==='Back'?'library':'hand');if(mode==='Back')assert.equal(ctx.a.library.at(-1),found);
  assert.ok(inspected.filter(card=>card!==found).every(card=>card.zone==='graveyard'));assert.equal(ctx.shuffleCount(),0);
 });
}
test('a hidden-zone search may fail to find, but still shuffles the selected library',async()=>{
 const ctx=world('human',{zones:'library',failFind:true}),found=put(MTG,ctx.game,ctx.a,named,'library');await cast(ctx,'Multizone Spell');
 assert.equal(found.zone,'library');assert.equal(ctx.shuffleCount(),1);assert.equal(searches(ctx).at(-1).q.min,0);
});
test('an optional search can be declined before selecting zones or inspecting hidden cards',async()=>{
 const ctx=world('human',{decline:true}),found=put(MTG,ctx.game,ctx.a,named,'library');await cast(ctx,'Multizone Trigger');
 assert.equal(found.zone,'library');assert.equal(ctx.trace.some(row=>row.q.aiHint?.kind==='oracleSearchScopes'),false);assert.equal(ctx.shuffleCount(),0);
});
for(const mutation of ['fail-public','duplicate','foreign','stale','bad-zone'])test('invalid search choice fails closed: '+mutation,async()=>{
 const ctx=world('human'),found=put(MTG,ctx.game,ctx.a,named,'graveyard'),enemy=put(MTG,ctx.game,ctx.b,named,'graveyard');
 const effect=extensionEffect({name:'Proof'},search,{target:extensionTarget}).effects[0];
 ctx.a.controller.decide=async(g,q)=>{
  if(q.type==='chooseOption')return mutation==='bad-zone'?'invalid':q.options.find(option=>option.label==='graveyard').key;
  if(mutation==='stale'){await g.move(found,'exile');await g.move(found,'graveyard');return [found];}
  return mutation==='fail-public'?[]:mutation==='foreign'?[enemy]:[found,found];
 };
 await assert.rejects(()=>MTG.OracleV8MultizoneSearch.run({g:ctx.game,you:ctx.a,src:null,targets:[]},effect,{}),/Invalid .*search/);
 assert.equal(found.zone,'graveyard');assert.equal(enemy.zone,'graveyard');assert.equal(ctx.shuffleCount(),0);
});
test('revealing a selected card does not rebind to its replacement incarnation',async()=>{
 const ctx=world('human'),found=put(MTG,ctx.game,ctx.a,named,'graveyard');
 ctx.game.revealToHuman=async()=>{await ctx.game.move(found,'exile');await ctx.game.move(found,'graveyard');};
 await cast(ctx,'Multizone Spell');assert.equal(found.zone,'graveyard');assert.equal(searches(ctx).length,1);
});
test('additional clauses, foreign zones, ambiguous names, and attached placements remain deferred',()=>{
 for(const text of [search+' Draw seven cards, then explore twice.',search.replace('your library','an opponent\'s library'),search.replace('First Witness','First Witness with flying'),search.replace('into your hand','onto the battlefield attached to this creature')]){
  assert.equal(extensionEffect({name:'Boundary'},text,{target:extensionTarget}),null,text);
 }
});
