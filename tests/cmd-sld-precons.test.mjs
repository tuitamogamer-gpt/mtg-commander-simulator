import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M,setup,card,body,play,activate,event,settle,fuel,mana} from './helpers/c21-fixtures.mjs';
import {buildIntake,precons,sourceDir} from '../scripts/import-cmd-sld-precons.mjs';
const count=c=>c.counters['+1/+1']||0;
const aim=(f,...targets)=>{f.decide=(p,q)=>q.type==='chooseTargets'?targets.filter(c=>q.candidates.includes(c)).slice(0,q.max):undefined;};
const tokens=(f,p,type)=>f.game.creatures(p).filter(c=>c.isToken&&c.hasSub(type));
const emptyMana=p=>{p.poolMeta=[];for(const k of Object.keys(p.pool))p.pool[k]=0;};

test('seven original lists, native definitions, guides and AI profiles are complete; import is idempotent',()=>{
 const original=JSON.parse(fs.readFileSync(sourceDir+'/intake.json'));
 assert.equal(original.newNames.length,79);
 const current=buildIntake(M);assert.equal(current.newNames.length,0);
 assert.equal(Object.keys(M.DECKS).length,160);assert.equal(Object.keys(M.DEFS).length,22668);
 for(const d of precons){const deck=M.DECKS[d.name];assert.ok(deck);assert.equal(deck.cards.reduce((n,c)=>n+c.n,0),100);assert.equal(deck.commander,d.commander);assert.ok(M.DECK_META[d.name]);assert.ok(M.DECK_GUIDES[d.name]);assert.ok(M.AI_DECK_PROFILE_HINTS[d.name]);for(const key of M.DECK_GUIDES[d.name].keys)assert.ok(deck.cards.some(c=>c.name===key),key);}
 for(const name of original.newNames){const d=M.DEFS[name];assert.ok(d);assert.ok(!d.autoScripted&&!d.simplified,name);}
});

for(const role of ['human','ai']){
 test(role+': Zada copies a single-target spell to other legal creatures',async()=>{
  const f=setup(role),z=card(f,'Zada, Hedron Grinder'),a=body(f),b=body(f),enemy=body(f,f.b);aim(f,z);
  await play(f,'Giant Growth');assert.equal(z.power,6);assert.equal(a.power,5);assert.equal(b.power,5);assert.equal(enemy.power,2);
 });
 test(role+': Frontline Heroism creates a token and copies a targeted cantrip',async()=>{
  const f=setup(role),s=await play(f,'Frontline Heroism'),b=body(f);aim(f,b);const before=f.a.hand.length;
  await play(f,'Expedite');assert.equal(tokens(f,f.a,'Soldier').length,2);assert.equal(f.a.hand.length,before+2);assert.ok(tokens(f,f.a,'Soldier').every(c=>c.kw('haste')));
 });
 test(role+': Gruff Triplets copies itself only from the nontoken entry and shares dying power',async()=>{
  const f=setup(role),s=await play(f,'Gruff Triplets');assert.equal(f.game.creatures(f.a).length,3);f.game.addCounters(s,'+1/+1',2);
  await f.game.sacrifice(f.a,s);await settle(f.game);assert.deepEqual(Array.from(f.game.creatures(f.a),count),[5,5]);
 });
 test(role+': Skullbriar keeps counters across graveyard, exile and return but loses them in hand',async()=>{
  const f=setup(role),s=card(f,'Skullbriar, the Walking Grave');f.game.addCounters(s,'+1/+1',3);
  for(const zone of ['graveyard','exile','battlefield']){await f.game.move(s,zone);assert.equal(count(s),3,zone);}
  await f.game.move(s,'hand');assert.equal(count(s),0);
 });
 test(role+': Kaalia puts a chosen creature into combat against the attacked opponent',async()=>{
  const f=setup(role),s=card(f,'Kaalia of the Vast'),dragon=card(f,'Dragon Whelp','hand');f.decide=(p,q)=>q.type==='chooseCards'&&q.from.includes(dragon)?[dragon]:undefined;
  f.game.combat={attackers:[s]};await event(f,'attacks',{card:s,player:f.a,target:f.b});assert.equal(dragon.zone,'battlefield');assert.equal(dragon.attacking,f.b);assert.ok(dragon.tapped);
 });
 test(role+': Karador permits exactly one graveyard creature cast during each own turn',async()=>{
  const f=setup(role),s=card(f,'Karador, Ghost Chieftain'),a=card(f,'Grizzly Bears','graveyard'),b=card(f,'Wind Drake','graveyard');fuel(f.a);
  const offer=f.game.castableList(f.a).find(r=>r.card===a);assert.ok(offer);assert.ok(await f.game.castSpell(f.a,a,{from:'graveyard',alt:offer.alt}));await settle(f.game);
  assert.equal(f.game.castableList(f.a).some(r=>r.card===b),false);f.game.turnNo++;assert.ok(f.game.castableList(f.a).some(r=>r.card===b));f.game.turnPlayer=f.b;assert.equal(f.game.castableList(f.a).some(r=>r.card===b),false);
 });
 test(role+': Invigorate alternate cost requires a Forest and gives the chosen opponent life',async()=>{
  const f=setup(role),b=body(f),c=card(f,'Invigorate','hand');aim(f,b);card(f,'Forest');emptyMana(f.a);
  const offer=M.StarterCasting.offers(f.game,f.a).find(r=>r.card===c&&r.alt.cslOpponent===f.b.idx);assert.ok(offer);
  assert.ok(await f.game.castSpell(f.a,c,{from:'hand',alt:offer.alt}));await settle(f.game);assert.equal(b.power,6);assert.equal(f.b.life,43);assert.equal(mana(f.a),0);
 });
 test(role+': Rat offering sacrifices the chosen Rat and reduces the Patron cost',async()=>{
  const f=setup(role),rat=card(f,'Nezumi Graverobber'),c=card(f,'Patron of the Nezumi','hand');emptyMana(f.a);f.a.pool.B=1;f.a.pool.C=4;
  const offer=M.StarterCasting.offers(f.game,f.a).find(r=>r.card===c);assert.ok(offer);assert.ok(await f.game.castSpell(f.a,c,{from:'hand',alt:offer.alt}));await settle(f.game);
  assert.equal(c.zone,'battlefield');assert.equal(rat.zone,'graveyard');assert.equal(mana(f.a),0);
 });
 test(role+': Nezumi exiles the last opposing graveyard card, flips, and reanimates',async()=>{
  const f=setup(role),s=card(f,'Nezumi Graverobber'),c=card(f,'Forest','graveyard',f.b);aim(f,c);await activate(f,s);assert.equal(s.name,'Nighteyes the Desecrator');assert.equal(s.power,4);
  const bear=card(f,'Grizzly Bears','graveyard',f.b);aim(f,bear);await activate(f,s);assert.equal(bear.zone,'battlefield');assert.equal(bear.ctrl,f.a);
 });
 test(role+': Voice of Resurgence makes a dynamically sized token on opposing casts and on death',async()=>{
  const f=setup(role),s=card(f,'Voice of Resurgence');await play(f,'Opt',{player:f.b});let t=tokens(f,f.a,'Elemental');assert.equal(t.length,1);assert.equal(t[0].power,2);
  await f.game.sacrifice(f.a,s);await settle(f.game);t=tokens(f,f.a,'Elemental');assert.equal(t.length,2);assert.ok(t.every(c=>c.power===2));
 });
 test(role+': Spike Feeder pays counters as costs and Triskelavus makes flying artifact tokens',async()=>{
  const f=setup(role),s=await play(f,'Spike Feeder');assert.equal(count(s),2);await activate(f,s,1);assert.equal(count(s),1);assert.equal(f.a.life,42);
  const t=await play(f,'Triskelavus');await activate(f,t);const token=tokens(f,f.a,'Triskelavite')[0];assert.ok(token.is('Artifact')&&token.kw('flying'));assert.equal(count(t),2);aim(f,f.b);await activate(f,token);assert.equal(f.b.life,39);
 });
 test(role+': Cleric Class adds life, levels, and returns a creature with life gain',async()=>{
  const f=setup(role),s=await play(f,'Cleric Class'),b=body(f);aim(f,b);await f.game.gainLife(f.a,2);await settle(f.game);assert.equal(f.a.life,43);
  await activate(f,s,0);await f.game.gainLife(f.a,1);await settle(f.game);assert.equal(count(b),1);
  const dead=card(f,'Wind Drake','graveyard');aim(f,dead,b);await activate(f,s,1);assert.equal(dead.zone,'battlefield');assert.equal(f.a.life,48);
 });
 test(role+': Nykthos Paragon can be used once per turn and Lathiel distributes counters at each end step',async()=>{
  const f=setup(role),s=card(f,'Nykthos Paragon'),b=body(f);f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;
  await f.game.gainLife(f.a,2);await settle(f.game);await f.game.gainLife(f.a,3);await settle(f.game);assert.equal(count(b),2);
  card(f,'Lathiel, the Bounteous Dawn');f.decide=(p,q)=>q.type==='chooseTargets'?[b]:q.type==='chooseX'?q.max:undefined;await event(f,'endStep',{player:f.b});assert.equal(count(b),7);
 });
 test(role+': Szadek replaces combat damage with counters and mill',async()=>{
  const f=setup(role),s=card(f,'Szadek, Lord of Secrets');const before=f.b.library.length;await f.game.damagePlayer(s,f.b,5,{combat:true});await settle(f.game);
  assert.equal(f.b.life,40);assert.equal(count(s),5);assert.equal(f.b.library.length,before-5);
 });
 test(role+': Stranglehold stops opposing searches and Arbiter restricts casting after attacks',async()=>{
  const f=setup(role);card(f,'Stranglehold');assert.equal(f.game.canSearchLibrary(f.b),false);assert.ok(f.game.canSearchLibrary(f.a));card(f,'Angelic Arbiter');
  const bear=body(f,f.b),bolt=card(f,'Lightning Bolt','hand',f.b);f.game.turnPlayer=f.b;await event(f,'attackersDeclared',{player:f.b,attackers:[bear]});fuel(f.b);assert.equal(f.game.castableList(f.b).some(r=>r.card===bolt),false);
 });
 test(role+': Prison Term disables activated abilities and may move to an opposing entrant',async()=>{
  const f=setup(role),elf=card(f,'Llanowar Elves','battlefield',f.b);aim(f,elf);const aura=await play(f,'Prison Term');assert.equal(f.game.manaSources(f.b).some(r=>r.card===elf),false);
  f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;f.game.turnPlayer=f.b;const bear=await play(f,'Grizzly Bears',{player:f.b});assert.equal(aura.attachedTo,bear.iid);assert.equal(f.game.canAttackAtAll(bear),false);
 });
 test(role+': Martyr’s Bond sacrifices matching types and Symbiotic Wurm leaves seven insects',async()=>{
  const f=setup(role);card(f,"Martyr's Bond");const s=card(f,'Symbiotic Wurm'),b=body(f,f.b);card(f,'Sol Ring','battlefield',f.b);await f.game.sacrifice(f.a,s);await settle(f.game);assert.equal(b.zone,'graveyard');assert.equal(tokens(f,f.a,'Insect').length,7);assert.ok(f.game.bf().some(c=>c.ctrl===f.b&&c.name==='Sol Ring'));
 });
 test(role+': Glimpse allows play from exile then replaces remaining cards with Spawn',async()=>{
  const f=setup(role);await play(f,'Glimpse the Impossible');assert.equal(f.a.exile.length,3);const land=f.a.exile[0];assert.ok(f.game.playableLands(f.a).includes(land));assert.ok(await f.game.playLand(f.a,land));await event(f,'endStep',{player:f.a});assert.equal(tokens(f,f.a,'Spawn').length,2);assert.equal(f.a.exile.length,0);
 });
 test(role+': Goblin Negotiation creates tokens only for actual excess damage',async()=>{
  const f=setup(role),b=body(f,f.b);aim(f,b);await play(f,'Goblin Negotiation',{xVal:5});assert.equal(b.zone,'graveyard');assert.equal(tokens(f,f.a,'Goblin').length,3);
 });
 test(role+': Spell Crumple counters and puts both spell cards on the bottom',async()=>{
  const f=setup(role),bolt=card(f,'Lightning Bolt','hand',f.b);fuel(f.b);aim(f,f.a);assert.ok(await f.game.castSpell(f.b,bolt,{from:'hand'}));const so=f.game.stack.at(-1);aim(f,so);const c=await play(f,'Spell Crumple');assert.equal(f.b.library[0],bolt);assert.equal(f.a.library[0],c);assert.equal(f.a.life,40);
 });
 test(role+': Punishing Fire pays red to return from the graveyard after opposing lifegain',async()=>{
  const f=setup(role),s=card(f,'Punishing Fire','graveyard');fuel(f.a);f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;const before=mana(f.a);await f.game.gainLife(f.b,1);await settle(f.game);assert.equal(s.zone,'hand');assert.equal(mana(f.a),before-1);
 });
 test(role+': Ruhan’s random attack requirement is scoped to the current combat',async()=>{
  const f=setup(role),s=card(f,'Ruhan of the Fomori');f.game.afcCombatId=1;await event(f,'beginCombat',{player:f.a});const targets=f.game.legalAttackTargets(s);assert.equal(targets.length,1);assert.ok(f.game.isForcedToAttack(s));f.game.afcCombatId++;assert.equal(f.game.isForcedToAttack(s),false);assert.equal(f.game.legalAttackTargets(s).length,2);
 });
 test(role+': Vorinclex adds mana and makes an opposing land skip its next untap',async()=>{
  const f=setup(role);card(f,'Vorinclex, Voice of Hunger');const a=card(f,'Forest'),b=card(f,'Forest','battlefield',f.b);emptyMana(f.a);emptyMana(f.b);
  for(const c of [a,b]){const m=f.game.manaSources(c.ctrl).find(s=>s.card===c);assert.ok(await f.game.activateManaSource(c.ctrl,m,m.produce[0]));}await settle(f.game);assert.equal(f.a.pool.G,2);assert.equal(f.b.pool.G,1);assert.ok(b.meta.noUntapOnce);
 });
 test(role+': Chorus pays additional mana and applies entry counters',async()=>{
  const f=setup(role);card(f,'Chorus of the Conclave');f.decide=(p,q)=>q.type==='chooseX'&&/Chorus/.test(q.prompt)?2:undefined;const c=await play(f,'Grizzly Bears');assert.equal(count(c),2);assert.equal(c.castMeta.manaSpent,4);
 });
 test(role+': Arena mana grants haste to the creature it pays for and marks exertion',async()=>{
  const f=setup(role),arena=card(f,'Arena of Glory'),c=card(f,'Grizzly Bears','hand');emptyMana(f.a);f.a.pool.R=1;f.a.pool.G=1;
  const m=f.game.manaSources(f.a).find(s=>s.card===arena&&s.m.cslHasteMana);assert.ok(m);assert.ok(await f.game.activateManaSource(f.a,m,{R:2}));assert.ok(arena.meta.oracleExertedBy.includes(f.a.idx));
  assert.ok(await f.game.castSpell(f.a,c,{from:'hand'}));await settle(f.game);assert.ok(c.kw('haste'));assert.equal(c.castMeta.cslHasteMana,1);
 });
 test(role+': Throne mana is restricted to the chosen monocolor and its draw cost uses that color',async()=>{
  const f=setup(role);f.decide=(p,q)=>q.type==='chooseOption'&&/color/i.test(q.prompt)?'G':undefined;const s=await play(f,'Throne of Eldraine');s.sick=false;emptyMana(f.a);const m=f.game.manaSources(f.a).find(m=>m.card===s);assert.ok(await f.game.activateManaSource(f.a,m,{G:4}));
  const green=card(f,'Grizzly Bears','hand'),blue=card(f,'Wind Drake','hand');assert.ok(f.game.canPayMana(f.a,M.parseCost('{1}{G}'),{card:green}));assert.equal(f.game.canPayMana(f.a,M.parseCost('{1}'),{card:blue}),false);
  s.tapped=false;emptyMana(f.a);f.a.pool.C=3;assert.equal(f.game.activatableList(f.a).some(e=>e.card===s&&e.ability===s.def.abilities[0]),false);f.a.pool.G=3;assert.ok(f.game.activatableList(f.a).some(e=>e.card===s&&e.ability===s.def.abilities[0]));
 });
}
