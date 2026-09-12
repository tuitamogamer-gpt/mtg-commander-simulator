import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M,setup,card,body,play,activate,event,settle,fuel,mana} from './helpers/c21-fixtures.mjs';
import {buildIntake,sourceDir} from '../scripts/import-pip-otc-m3c-precons.mjs';
const intake=JSON.parse(fs.readFileSync(sourceDir+'/intake.json'));
test('ten original lists, 214 native additions and complete player guides',()=>{
 const now=buildIntake(M);assert.equal(now.decks.length,10);assert.equal(now.names.length,726);assert.equal(intake.newCards,214);assert.equal(intake.reusedCards,512);
 assert.equal(Object.keys(M.DECKS).length,140);assert.equal(Object.keys(M.DEFS).length,21385);
 for(const d of now.decks){assert.equal(d.cards.reduce((n,c)=>n+c.n,0),100);assert.ok(M.DECK_META[d.name]);const guide=M.DECK_GUIDES[d.name];assert.ok(guide.plan&&guide.mulligan&&guide.tip);assert.equal(M.DECK_GUIDE_ROUTES[guide.route].length,3);for(const key of guide.keys)assert.ok(d.cards.some(c=>c.name===key),d.name+': '+key);}
 for(const n of intake.newNames){assert.ok(M.SCRIPTS[n],n);assert.equal(M.CARD_CATALOG[n].deckImportEligible,true,n);assert.equal(!!M.DEFS[n].auto,false,n);assert.equal(!!M.DEFS[n]._simplified,false,n);}
});
for(const role of ['human','ai']){
 test(role+': Satya copies a creature and sacrifices it if energy is declined',async()=>{
  const f=setup(role),satya=card(f,'Satya, Aetherflux Genius'),b=body(f);satya.attacking=f.b;f.game.combat={attackers:[satya]};
  f.decide=(p,q)=>q.type==='chooseTargets'?[b]:q.type==='chooseOption'&&q.prompt?.includes('Pay ')?'no':undefined;
  await event(f,'attacks',{card:satya,player:f.a,target:f.b});const copy=f.game.bf().find(c=>c.isToken&&c.name===b.name);assert.ok(copy);assert.ok(copy.attacking);assert.equal(f.a.counters.energy,2);
  await event(f,'endStep',{player:f.a});assert.notEqual(copy.zone,'battlefield');assert.equal(b.zone,'battlefield');
 });
 test(role+': Ulalek pays two colorless and copies an Eldrazi spell',async()=>{
  const f=setup(role);card(f,'Ulalek, Fused Atrocity');f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt?.includes('{C}{C}')?'yes':undefined;
  await play(f,'Void Attendant');assert.equal(f.game.bf().filter(c=>c.name==='Void Attendant').length,2);
 });
 test(role+': Gonti grants foreign-card permission independently of source survival',async()=>{
  const f=setup(role);const gonti=card(f,'Gonti, Canny Acquisitor'),b=body(f),hit=card(f,'Grizzly Bears','library',f.b);
  await f.game.damageBatch([{src:b,target:f.b,n:2,opts:{combat:true}}]);await settle(f.game);assert.equal(hit.zone,'exile');fuel(f.a);
  const cost=f.game.spellCost(f.a,hit,{});assert.equal(cost.generic,0);
  const offer=f.game.castableList(f.a).find(e=>e.card===hit);assert.ok(offer);await f.game.move(gonti,'graveyard');
  assert.equal(await f.game.castSpell(f.a,hit,{from:'exile',alt:offer.alt}),true);await settle(f.game);assert.equal(hit.ctrl,f.a);
 });
 test(role+': Caesar sacrifices a creature before creating Soldiers and drawing',async()=>{
  const f=setup(role),caesar=card(f,"Caesar, Legion's Emperor"),victim=body(f);victim.attacking=f.b;f.game.combat={attackers:[victim]};
  f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.includes('Caesar')?[victim]:q.type==='chooseOption'&&q.prompt.includes('reward')?q.options[0].key:undefined;
  const hand=f.a.hand.length;await event(f,'attackersDeclared',{player:f.a,attackers:[victim]});
  assert.equal(victim.zone,'graveyard');assert.equal(f.a.hand.length,hand+1);assert.equal(f.a.life,39);assert.equal(f.game.bf().filter(c=>c.isToken&&c.hasSub('Soldier')&&c.attacking).length,2);assert.equal(caesar.zone,'battlefield');
 });
 test(role+': Wastescape pays G and 1U kickers and announces both triggers',async()=>{
  const f=setup(role),artifact=card(f,'Sol Ring','battlefield',f.b),creature=body(f,f.b),c=card(f,'Wastescape Battlemage','hand');
  fuel(f.a);const before=mana(f.a);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt?.includes('kicker')?'yes':q.type==='chooseTargets'?[q.candidates.includes(artifact)?artifact:creature]:undefined;
  assert.equal(await f.game.castSpell(f.a,c,{from:'hand'}),true);assert.equal(before-mana(f.a),5);assert.equal(f.game.stack.length,3);await settle(f.game);assert.equal(artifact.zone,'exile');assert.equal(creature.zone,'hand');
 });
 test(role+': Thrill-Kill squad discards one card and pays one mana per copy',async()=>{
  const f=setup(role);const a=card(f,'Forest','hand'),b=card(f,'Forest','hand');f.decide=(p,q)=>q.type==='chooseX'&&q.prompt.includes('squad')?2:undefined;
  const c=card(f,'Thrill-Kill Disciple','hand');fuel(f.a);const before=mana(f.a);assert.equal(await f.game.castSpell(f.a,c,{from:'hand'}),true);assert.equal(before-mana(f.a),5);await settle(f.game);assert.equal(a.zone,'graveyard');assert.equal(b.zone,'graveyard');assert.equal(f.game.bf().filter(c=>c.name==='Thrill-Kill Disciple').length,3);
 });
 test(role+': Talon Gates hand ability retains the card until resolution',async()=>{
  const f=setup(role),c=card(f,'Talon Gates of Madara','hand');fuel(f.a);const e=f.game.activatableList(f.a).find(e=>e.card===c&&e.handAbility);assert.ok(e);assert.equal(await f.game.activateAbility(f.a,e),true);assert.equal(c.zone,'hand');await settle(f.game);assert.equal(c.zone,'battlefield');assert.equal(f.a.turnState.discarded||0,0);
 });
 test(role+': Strong Back makes an Aura affordable only for its enchanted creature',async()=>{
  const f=setup(role),bear=body(f),aura=card(f,'Strong Back');await f.game.attach(aura,bear);const spell=card(f,'Nerd Rage','hand');f.a.pool.U=1;
  assert.ok(f.game.castableList(f.a).some(e=>e.card===spell));f.decide=(p,q)=>q.type==='chooseTargets'?[bear]:undefined;
  assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);await settle(f.game);assert.equal(f.a.pool.U,0);assert.equal(f.game.maximumHandSize(f.a),Infinity);
 });
 test(role+': Twins adds bloodthirst to another colorless creature after damage',async()=>{
  const f=setup(role);card(f,'Twins of Discord');await f.game.damageAny(null,f.b,1);const c=await play(f,'Void Attendant');assert.equal(c.counters['+1/+1'],2);
 });
 test(role+': Gluttonous Hellkite receives twice the sacrificed creature count',async()=>{
  const f=setup(role);body(f);body(f,f.b);f.x=1;const c=await play(f,'Gluttonous Hellkite');assert.equal(c.counters['+1/+1'],4);
 });
 test(role+': The Mimeoplasm copies one exiled creature and uses the other power',async()=>{
  const f=setup(role);const a=card(f,'Grizzly Bears','graveyard'),b=card(f,'Colossal Dreadmaw','graveyard',f.b);
  f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt?.includes('Exile two')?'yes':q.type==='chooseCards'&&q.prompt.includes('creature to copy')?[a]:undefined;
  const c=await play(f,'The Mimeoplasm');assert.equal(a.zone,'exile');assert.equal(b.zone,'exile');assert.equal(c.name,'Grizzly Bears');assert.equal(c.counters['+1/+1'],6);
 });
 test(role+': Grist is an Insect creature in the graveyard but a planeswalker on the battlefield',async()=>{
  const f=setup(role),c=card(f,'Grist, the Hunger Tide','graveyard');assert.ok(c.is('Creature'));assert.ok(c.hasSub('Insect'));assert.equal(c.power,1);await f.game.putPermanentOntoBattlefield(c,f.a);assert.equal(c.is('Creature'),false);assert.ok(c.is('Planeswalker'));
 });
 test(role+': Brotherhood Outcast announces its chosen mode and target before resolution',async()=>{
  const f=setup(role),bear=body(f);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('mod')?'1':q.type==='chooseTargets'?[bear]:undefined;
  const c=card(f,'Brotherhood Outcast','hand');fuel(f.a);assert.equal(await f.game.castSpell(f.a,c,{from:'hand'}),true);await f.game.resolveTop();await f.game.flushTriggers();assert.ok(f.game.stack.some(so=>so.targets.includes(bear)));assert.equal(bear.counters.shield||0,0);await settle(f.game);assert.equal(bear.counters.shield,1);
 });
 test(role+': Bladegriff gives the damaged opponent the only target decision',async()=>{
  const f=setup(role),source=card(f,'Bladegriff Prototype'),artifact=card(f,'Sol Ring','battlefield',f.b);const choosers=[];
  f.decide=(p,q)=>q.type==='chooseTargets'?(choosers.push(p),[artifact]):undefined;
  await event(f,'damageToPlayer',{src:source,player:f.b,n:3,combat:true});assert.deepEqual(choosers,[f.b]);assert.equal(artifact.zone,'graveyard');
 });
 test(role+': Winding Constrictor adds counters to each proliferated player kind',async()=>{
  const f=setup(role);card(f,'Winding Constrictor');f.a.poison=1;f.a.counters.rad=1;f.a.counters.energy=1;f.a.counters.experience=1;f.decide=(p,q)=>q.type==='chooseTargets'?[f.a]:undefined;
  await M.E.proliferate(f.game,f.a);assert.equal(f.a.poison,3);assert.equal(f.a.counters.rad,3);assert.equal(f.a.counters.energy,3);assert.equal(f.a.counters.experience,3);
 });
 test(role+': one-per-card milling triggers remain separate on the stack',async()=>{
  const f=setup(role);card(f,'Glowing One');card(f,'Grizzly Bears','library');card(f,'Sol Ring','library');await f.game.mill(f.a,2);await f.game.flushTriggers();assert.equal(f.game.stack.length,2);await settle(f.game);assert.equal(f.a.life,42);
 });
 test(role+': Lair of the Hydra rejects zero X and animates with a legal X',async()=>{
  const f=setup(role),c=card(f,'Lair of the Hydra');fuel(f.a);const e=f.game.activatableList(f.a).find(e=>e.card===c&&e.ability);assert.ok(e);
  f.decide=(p,q)=>q.type==='chooseX'?0:undefined;const before=mana(f.a);assert.equal(await f.game.activateAbility(f.a,e),false);assert.equal(mana(f.a),before);
  f.decide=(p,q)=>q.type==='chooseX'?3:undefined;assert.equal(await f.game.activateAbility(f.a,e),true);await settle(f.game);assert.equal(c.power,3);assert.ok(c.hasSub('Hydra'));
 });
 test(role+': two Sunken Palaces cannot exile the same seven graveyard cards',async()=>{
  const f=setup(role),a=card(f,'Sunken Palace'),b=card(f,'Sunken Palace');for(let i=0;i<7;i++)card(f,'Forest','graveyard');
  const sources=f.game.manaSources(f.a).filter(s=>s.m.pomCopyMana);assert.equal(sources.length,2);
  fuel(f.a);assert.equal(await f.game.activateManaSource(f.a,sources[0],{U:1}),true);const before=mana(f.a);assert.equal(await f.game.activateManaSource(f.a,sources[1],{U:1}),false);assert.equal(mana(f.a),before);assert.equal(f.a.exile.length,7);assert.equal(b.tapped,false);
 });
 test(role+': Animal Friend grows its Squirrel for other attachments',async()=>{
  const f=setup(role),bear=body(f),friend=card(f,'Animal Friend'),gear=card(f,'Bonesplitter');
  await f.game.attach(friend,bear);await f.game.attach(gear,bear);bear.attacking=f.b;
  await event(f,'attacks',{player:f.a,card:bear,target:f.b});
  const squirrel=f.game.bf().find(c=>c.isToken&&c.hasSub('Squirrel'));assert.ok(squirrel);assert.equal(squirrel.counters['+1/+1'],1);assert.equal(squirrel.power,2);
 });
 test(role+': Final Act exiles both graveyards and removes only opponents’ counters',async()=>{
  const f=setup(role),a=card(f,'Forest','graveyard'),b=card(f,'Grizzly Bears','graveyard',f.b);f.a.counters.rad=2;f.b.counters.energy=4;f.b.counters.rad=3;f.b.poison=2;
  f.decide=(p,q)=>q.type==='chooseMulti'?['3','4']:undefined;
  const spell=await play(f,'Final Act');assert.equal(a.zone,'exile');assert.equal(b.zone,'exile');assert.equal(spell.zone,'graveyard');assert.equal(f.a.counters.rad,2);assert.equal(f.b.poison,0);assert.equal(Object.keys(f.b.counters).length,0);assert.equal(f.b.turnState.energyLost,4);assert.equal(f.b.turnState.energyPaid||0,0);
 });
 test(role+': Summary Dismissal exiles an uncounterable spell',async()=>{
  const f=setup(role),c=card(f,'Carnage Tyrant','hand');fuel(f.a);assert.equal(await f.game.castSpell(f.a,c,{from:'hand'}),true);const so=f.game.stack.find(s=>s.card===c);assert.ok(so);assert.equal(await f.game.counterStackObject(so),false);
  await play(f,'Summary Dismissal');assert.equal(c.zone,'exile');assert.equal(f.game.stack.length,0);
 });
 test(role+': Sunken Palace copies a cycling activation paid with its mana',async()=>{
  const f=setup(role),palace=card(f,'Sunken Palace');for(let n=0;n<7;n++)card(f,'Forest','graveyard');fuel(f.a);
  const source=f.game.manaSources(f.a).find(s=>s.card===palace&&s.m.pomCopyMana);assert.equal(await f.game.activateManaSource(f.a,source,{U:1}),true);
  for(const k of Object.keys(f.a.pool))f.a.pool[k]=0;f.a.pool.U=1;
  const c=card(f,'Ash Barrens','hand'),before=f.a.hand.length;const e=f.game.activatableList(f.a).find(e=>e.card===c&&e.cycling);assert.ok(e);assert.equal(await f.game.activateAbility(f.a,e),true);assert.ok(f.game.stack.some(s=>s.name.includes('Sunken Palace: copy')));await settle(f.game);assert.equal(f.a.hand.length,before+1);
 });
 test(role+': Sunken Palace copies a graveyard scavenge activation',async()=>{
  const f=setup(role),palace=card(f,'Sunken Palace');card(f,'Young Deathclaws');for(let n=0;n<7;n++)card(f,'Forest','graveyard');fuel(f.a);
  const source=f.game.manaSources(f.a).find(s=>s.card===palace&&s.m.pomCopyMana);assert.equal(await f.game.activateManaSource(f.a,source,{U:1}),true);
  for(const k of Object.keys(f.a.pool))f.a.pool[k]=0;f.a.pool.U=1;f.a.pool.G=1;
  const c=card(f,'Grizzly Bears','graveyard'),target=body(f);f.decide=(p,q)=>q.type==='chooseTargets'?[target]:undefined;const e=f.game.activatableList(f.a).find(e=>e.card===c&&e.gyAbility);assert.ok(e);assert.equal(await f.game.activateAbility(f.a,e),true);await settle(f.game);assert.equal(target.counters['+1/+1'],4);
 });
 test(role+': Caesar announces the chosen opponent before the damage reward resolves',async()=>{
  const f=setup(role),caesar=card(f,"Caesar, Legion's Emperor"),victim=body(f);victim.attacking=f.b;f.game.combat={attackers:[victim]};
  f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.includes('Caesar')?[victim]:q.type==='chooseOption'&&q.prompt.includes('reward')?(q.options.some(o=>o.key==='damage')?'damage':'soldiers'):q.type==='chooseTargets'?[f.b]:undefined;
  await f.game.emit('attackersDeclared',{player:f.a,attackers:[victim]});await f.game.flushTriggers();await f.game.resolveTop();await f.game.flushTriggers();
  assert.equal(victim.zone,'graveyard');assert.ok(f.game.stack.some(s=>s.targets.includes(f.b)));assert.equal(f.b.life,40);await settle(f.game);assert.equal(f.b.life,38);assert.equal(caesar.zone,'battlefield');
 });
 test(role+': Expert-Level Safe returns its hidden cards when both numbers match',async()=>{
  const f=setup(role);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('Secretly choose')?'2':q.type==='chooseTargets'?[f.b]:undefined;
  const safe=await play(f,'Expert-Level Safe'),hidden=f.a.exile.slice();assert.equal(hidden.length,2);assert.equal(safe.meta.wlmExiled.length,2);
  await activate(f,safe);assert.equal(safe.zone,'graveyard');for(const c of hidden)assert.equal(c.zone,'hand');
 });
 test(role+': Expert-Level Safe adds a hidden card on mismatch and survives',async()=>{
  const f=setup(role);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('Secretly choose')?(p===f.a?'1':'3'):q.type==='chooseTargets'?[f.b]:undefined;
  const safe=await play(f,'Expert-Level Safe');await activate(f,safe);assert.equal(safe.zone,'battlefield');assert.equal(f.a.exile.length,3);assert.equal(safe.meta.wlmExiled.length,3);
 });
 test(role+': a blinked Safe retains separate links from its old pending activation',async()=>{
  const f=setup(role);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('Secretly choose')?'1':q.type==='chooseTargets'?[f.b]:undefined;
  const safe=await play(f,'Expert-Level Safe'),hidden=f.a.exile.slice();fuel(f.a);const e=f.game.activatableList(f.a).find(e=>e.card===safe&&e.ability);assert.equal(await f.game.activateAbility(f.a,e),true);
  await f.game.move(safe,'exile');await f.game.putPermanentOntoBattlefield(safe,f.a);await settle(f.game);
  assert.equal(safe.zone,'battlefield');for(const c of hidden)assert.equal(c.zone,'hand');assert.equal(f.a.exile.length,2);
 });
}
