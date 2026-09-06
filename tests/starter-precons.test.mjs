import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
import {starterPrecons,buildStarterIntake,starterSourceDir} from '../scripts/import-starter-precons.mjs';
const M=loadEngine(),covered=new Set();
const mana=p=>Object.values(p.pool).reduce((n,v)=>n+v,0);
const fuel=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=20;};
function setup(role='human',n=2){
  const f=context(M,role,n);f.x=3;
  for(const player of f.game.players){
    const original=player.controller.decide.bind(player.controller);
    player.controller={decide:async(g,q)=>{
      const override=f.decide?.(player,q);if(override!==undefined)return override;
      if(player.isAI)return original(g,q);
      if(q.type==='chooseTargets')return q.quickTarget?[q.quickTarget]:q.candidates.slice(0,Math.min(q.max,q.candidates.length));
      if(q.type==='chooseCards')return q.from.slice(0,q.min||Math.min(q.max,q.from.length));
      if(q.type==='chooseMulti')return (f.modes||q.options.slice(0,q.min).map(o=>o.key)).map(String);
      if(q.type==='chooseX')return Math.min(f.x,q.max);
      return original(g,q);
    }};
  }
  return f;
}
function card(f,name,zone='battlefield',player=f.a){return put(M,f.game,player,name,zone);}
async function play(f,name,opts={}){
  const player=opts.player||f.a,c=opts.card||card(f,name,opts.from||'hand',player);fuel(player);
  const before=mana(player);assert.equal(await f.game.castSpell(player,c,{from:c.zone,...opts}),true,name+' casts');
  assert.ok(f.game.stack.some(so=>so.card===c),name+' uses Stack');assert.ok(mana(player)<before,name+' pays mana');
  await settle(f.game);covered.add(name);return c;
}
async function activate(f,c,index=0){
  fuel(c.ctrl);const entry=f.game.activatableList(c.ctrl).find(e=>e.card===c&&(e.ability===c.def.abilities?.[index]||index==='gy'&&e.gyAbility));
  assert.ok(entry,c.name+' activation available');assert.equal(await f.game.activateAbility(c.ctrl,entry),true,c.name+' activates');
  await settle(f.game);covered.add(c.name);
}
async function event(f,name,data){await f.game.emit(name,data);await settle(f.game);}
const body=(f,player=f.a)=>card(f,'Grizzly Bears','battlefield',player);
const flier=(f,player=f.a)=>card(f,'Air Elemental','battlefield',player);
function check(f){assertGameStateInvariants(f.game);assert.equal((f.game.aiDecisionLog||[]).some(d=>d.fallback),false);}

test('five direct Moxfield exports are exact 100-card selectable precons and introduce only the 61 missing names',()=>{
  const intake=buildStarterIntake(M),report=JSON.parse(fs.readFileSync(starterSourceDir+'/intake.json'));
  assert.equal(report.baselineCards,19484);assert.equal(report.reusedCards,276);assert.equal(report.newCards,61);
  assert.equal(intake.names.length,337);assert.equal(intake.newNames.length,0);
  for(const source of starterPrecons){
    const expected=intake.decks.find(d=>d.name===source.name),actual=M.DECKS[source.name];
    assert.equal(actual.commander,source.commander);assert.equal(actual.cards.reduce((n,c)=>n+c.n,0),100);
    assert.deepEqual(JSON.parse(JSON.stringify(actual.cards)),expected.cards);assert.ok(M.DECK_META[source.name]);
    const colors=intake.oracle.get(source.commander).colorIdentity;
    for(const row of actual.cards){assert.ok(M.DEFS[row.name]);assert.ok(intake.oracle.get(row.name).colorIdentity.every(c=>colors.includes(c)),row.name+' color identity');}
  }
  for(const name of report.newNames){assert.ok(M.SCRIPTS[name]);assert.ok(!M.DEFS[name].autoScripted&&!M.DEFS[name].simplified,name);}
});

for(const role of ['human','ai'])test(role+': Gisa casts one paid Zombie per own turn; source blink restores permission and stale offers fail',async()=>{
  const f=setup(role),gisa=await play(f,'Gisa and Geralf');assert.equal(f.a.graveyard.length,4);
  const zombie=card(f,'Walking Corpse','graveyard'),other=card(f,'Walking Corpse','graveyard');fuel(f.a);
  const offer=f.game.castableList(f.a).find(e=>e.card===zombie&&e.alt?.starterPermission==='gisa');assert.ok(offer);
  assert.equal(await f.game.castSpell(f.a,zombie,{from:offer.from,alt:offer.alt}),true);await settle(f.game);
  assert.equal(zombie.zone,'battlefield');assert.ok(!f.game.castableList(f.a).some(e=>e.card===other));
  await f.game.move(gisa,'exile');await f.game.move(gisa,'battlefield');await settle(f.game);
  assert.ok(f.game.castableList(f.a).some(e=>e.card===other));
  await f.game.move(gisa,'exile');assert.equal(await f.game.castSpell(f.a,other,{from:'graveyard',alt:{...offer.alt,starterCardVersion:other.zoneVersion}}),false);
  check(f);
});
for(const role of ['human','ai'])test(role+': Scourge sacrifices exactly two creatures and Sephara taps four fliers as paid alternatives',async()=>{
  const f=setup(role);body(f);body(f);const scourge=card(f,'Scourge of Nel Toth','graveyard');fuel(f.a);
  const offer=f.game.castableList(f.a).find(e=>e.card===scourge&&e.alt?.starterPermission==='scourge');assert.ok(offer);
  const before=mana(f.a);assert.equal(await f.game.castSpell(f.a,scourge,{from:offer.from,alt:offer.alt}),true);assert.equal(before-mana(f.a),2);
  assert.equal(f.a.graveyard.filter(c=>c.name==='Grizzly Bears').length,2);await settle(f.game);assert.equal(scourge.zone,'battlefield');covered.add(scourge.name);
  const flyers=[scourge,flier(f),flier(f),flier(f)];const sephara=card(f,"Sephara, Sky's Blade",'hand');fuel(f.a);
  const alt=f.game.castableList(f.a).find(e=>e.card===sephara&&e.alt?.starterPermission==='sephara');assert.ok(alt);
  const pre=mana(f.a);assert.equal(await f.game.castSpell(f.a,sephara,{from:'hand',alt:alt.alt}),true);assert.equal(pre-mana(f.a),1);
  assert.ok(flyers.every(c=>c.tapped));await settle(f.game);assert.ok(flyers.every(c=>c.kw('indestructible')));assert.equal(sephara.kw('indestructible'),false);
  covered.add(sephara.name);check(f);
});
test('alternative payment fails atomically when mana is unavailable or a selected permanent leaves',async()=>{
  const f=setup();const a=body(f),b=body(f),scourge=card(f,'Scourge of Nel Toth','graveyard');
  const offer=M.StarterCasting.offers(f.game,f.a).find(e=>e.card===scourge);
  assert.equal(await f.game.castSpell(f.a,scourge,{from:'graveyard',alt:offer.alt}),false);assert.equal(a.zone,'battlefield');assert.equal(b.zone,'battlefield');
  fuel(f.a);const before=mana(f.a);f.decide=(p,q)=>{if(q.type==='chooseCards'&&q.prompt==='Sacrifice two creatures'){b.zoneVersion++;return[a,b];}};
  assert.equal(await f.game.castSpell(f.a,scourge,{from:'graveyard',alt:offer.alt}),false);assert.equal(mana(f.a),before);
});
test('Jubilant Skybonder charges the actual flying targets before mana is spent',async()=>{
  const f=setup();card(f,'Jubilant Skybonder','battlefield',f.b);const target=flier(f,f.b),spell=card(f,'Murder','hand');
  f.a.pool.B=2;f.a.pool.C=1;f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:undefined;
  assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),false);assert.equal(mana(f.a),3);assert.equal(target.zone,'battlefield');
  f.a.pool.C=3;assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);assert.equal(mana(f.a),0);await settle(f.game);assert.equal(target.zone,'graveyard');
  covered.add('Jubilant Skybonder');
});
test('Coastal Tower enters tapped; Leafkin and Heraldic Banner produce the right colors and amounts',async()=>{
  const f=setup(),tower=card(f,'Coastal Tower','hand');await f.game.move(tower,'battlefield');assert.ok(tower.tapped);f.game.untap(tower);
  assert.deepEqual(JSON.parse(JSON.stringify(tower.def.mana.produce)),[{W:1},{U:1}]);covered.add(tower.name);
  const druid=await play(f,'Leafkin Druid');assert.equal(druid.def.mana.produce(f.game,druid,f.a)[0].G,1);body(f);body(f);body(f);
  assert.equal(druid.def.mana.produce(f.game,druid,f.a)[0].G,2);
  f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='G')?'G':undefined;
  const banner=await play(f,'Heraldic Banner');assert.equal(banner.meta.starterBannerColor,'G');assert.equal(f.game.creatures(f.a).find(c=>c.name==='Grizzly Bears').power,3);
  assert.equal(banner.def.mana.produce(f.game,banner)[0].G,1);check(f);
});
test('Archon, Cartographer’s Hawk and Ever-Watching Threshold use combat and entry triggers',async()=>{
  const f=setup(),archon=await play(f,'Archon of Redemption');assert.equal(f.a.life,43);
  await play(f,'Air Elemental');assert.equal(f.a.life,47);
  const hawk=await play(f,"Cartographer's Hawk");card(f,'Plains','library');card(f,'Forest','battlefield',f.b);
  await event(f,'combatDamageToPlayer',{card:hawk,player:f.b,n:2});assert.equal(hawk.zone,'hand');assert.ok(f.game.lands(f.a).some(c=>c.name==='Plains'&&c.tapped));
  await play(f,'Ever-Watching Threshold');const attacker=body(f,f.b);attacker.attacking=f.a;const before=f.a.hand.length;
  await event(f,'attackersDeclared',{player:f.b,attackers:[attacker]});assert.equal(f.a.hand.length,before+1);check(f);
});
test('Army, White Sun, Aura Mutation, Felidar Retreat and Trostani create exact tokens',async()=>{
  {const f=setup();const army=await play(f,'Army of the Damned');assert.equal(f.game.creatures(f.a).length,13);assert.ok(f.game.creatures(f.a).every(c=>c.tapped&&c.hasSub('Zombie')));
    fuel(f.a);const offer=f.game.castableList(f.a).find(e=>e.card===army);assert.ok(offer);assert.equal(await f.game.castSpell(f.a,army,{from:offer.from,alt:offer.alt}),true);await settle(f.game);assert.equal(army.zone,'exile');assert.equal(f.game.creatures(f.a).length,26);}
  {const f=setup();const zenith=await play(f,"White Sun's Zenith",{xVal:3});assert.equal(f.game.creatures(f.a).length,3);assert.equal(zenith.zone,'library');assert.ok(f.game.creatures(f.a).every(c=>c.hasSub('Cat')&&c.power===2));}
  {const f=setup();const enchant=card(f,'Glorious Anthem','battlefield',f.b);await play(f,'Aura Mutation',{quickTargets:[enchant]});assert.equal(enchant.zone,'graveyard');assert.equal(f.game.creatures(f.a).length,3);}
  {const f=setup();await play(f,'Felidar Retreat');const land=card(f,'Forest','hand');await f.game.move(land,'battlefield');await settle(f.game);assert.ok(f.game.creatures(f.a)[0].hasSub('Cat')&&f.game.creatures(f.a)[0].hasSub('Beast'));
    f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt?.includes('Felidar')?'1':undefined;
    await f.game.move(card(f,'Forest','hand'),'battlefield');await settle(f.game);assert.equal(f.game.creatures(f.a)[0].counters['+1/+1'],1);assert.ok(f.game.creatures(f.a)[0].kw('vigilance'));}
  {const f=setup();const stolen=body(f);M.OracleV8Control.gain(f.game,stolen,f.b);f.game.recalc();await play(f,'Trostani Discordant');const soldiers=f.game.creatures(f.a).filter(c=>c.hasSub('Soldier'));assert.equal(soldiers.length,2);assert.ok(soldiers.every(c=>c.power===2&&c.kw('lifelink')));
    await event(f,'endStep',{player:f.a});assert.equal(stolen.ctrl,f.a);}
});
test('Condemn, Crippling Fear, Deadly Tempest, Soul Shatter and Magmaquake resolve their distinct removal rules',async()=>{
  {const f=setup(),target=body(f,f.b);target.attacking=f.a;await play(f,'Condemn',{quickTargets:[target]});assert.equal(target.zone,'library');assert.equal(f.b.library[0],target);assert.equal(f.b.life,42);}
  {const f=setup(),bear=body(f),zombie=card(f,'Walking Corpse','battlefield',f.b);f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='Bear')?'Bear':undefined;
    await play(f,'Crippling Fear');assert.equal(bear.zone,'battlefield');assert.equal(zombie.zone,'graveyard');}
  {const f=setup();body(f);body(f,f.b);body(f,f.b);await play(f,'Deadly Tempest');assert.equal(f.a.life,39);assert.equal(f.b.life,38);assert.equal(f.game.creatures().length,0);}
  {const f=setup(),small=body(f,f.b),big=flier(f,f.b);await play(f,'Soul Shatter');assert.equal(small.zone,'battlefield');assert.equal(big.zone,'graveyard');}
  {const f=setup(),ground=body(f,f.b),flying=flier(f,f.b),pw=card(f,'Gideon Jura','hand',f.b);await f.game.move(pw,'battlefield');const loyalty=pw.counters.loyalty;
    await play(f,'Magmaquake',{xVal:3});assert.equal(ground.zone,'graveyard');assert.equal(flying.damage,0);assert.equal(pw.counters.loyalty,loyalty-3);}
});
test('Syphon Flesh, Reign of the Pit and Dredge the Mire use each player’s choices',async()=>{
  {const f=setup();body(f,f.b);body(f,f.others[1]);await play(f,'Syphon Flesh');assert.equal(f.game.creatures(f.a).length,2);assert.equal(f.game.creatures(f.b).length,0);}
  {const f=setup();body(f);body(f,f.b);flier(f,f.others[1]);await play(f,'Reign of the Pit');const token=f.game.creatures(f.a)[0];assert.equal(token.power,8);assert.equal(token.toughness,8);assert.ok(token.kw('flying'));}
  {const f=setup();const a=card(f,'Grizzly Bears','graveyard',f.b),b=card(f,'Air Elemental','graveyard',f.others[1]);await play(f,'Dredge the Mire');assert.equal(a.ctrl,f.a);assert.equal(b.ctrl,f.a);assert.equal(f.game.creatures(f.a).length,2);}
});
test('Curses and Geode Rager trigger on attacks and landfall, preserving distinct players',async()=>{
  {const f=setup(),own=body(f),attacker=body(f,f.b);own.tapped=true;attacker.tapped=true;attacker.attacking=f.others[1];
    await play(f,'Curse of Bounty',{quickTargets:[f.others[1]]});await event(f,'attackersDeclared',{player:f.b,attackers:[attacker]});assert.equal(own.tapped,false);assert.equal(attacker.tapped,false);}
  {const f=setup(),attacker=body(f,f.b);attacker.attacking=f.others[1];await play(f,'Curse of Disturbance',{quickTargets:[f.others[1]]});
    await event(f,'attackersDeclared',{player:f.b,attackers:[attacker]});assert.equal(f.game.creatures(f.a).length,1);assert.equal(f.game.creatures(f.b).length,2);}
  {const f=setup(),target=body(f,f.b);await play(f,'Geode Rager');f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(f.b)?[f.b]:undefined;
    await f.game.move(card(f,'Forest','hand'),'battlefield');await settle(f.game);assert.ok(f.game.isForcedToAttack(target));assert.deepEqual(Array.from(f.game.legalDeclarationAttackTargets(target),p=>p.idx),[f.others[1].idx]);}
});
test('Great Oak, Hoard-Smelter, Scavenging Ooze, Lotleth Giant, Voice of Many and Thundermaw have observable effects',async()=>{
  {const f=setup(),bear=body(f);bear.tapped=true;f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(f.a)?[f.a]:undefined;
    await play(f,'Great Oak Guardian');assert.equal(bear.power,4);assert.equal(bear.tapped,false);}
  {const f=setup(),target=card(f,'Sol Ring','battlefield',f.b),dragon=await play(f,'Hoard-Smelter Dragon');await activate(f,dragon);assert.equal(target.zone,'graveyard');assert.equal(dragon.power,6);}
  {const f=setup(),dead=card(f,'Grizzly Bears','graveyard',f.b),ooze=await play(f,'Scavenging Ooze');await activate(f,ooze);assert.equal(dead.zone,'exile');assert.equal(ooze.power,3);assert.equal(f.a.life,41);}
  {const f=setup();card(f,'Grizzly Bears','graveyard');card(f,'Walking Corpse','graveyard');await play(f,'Lotleth Giant');assert.equal(f.b.life,38);}
  {const f=setup();body(f);await play(f,'Voice of Many');assert.equal(f.a.hand.length,2);}
  {const f=setup(),target=flier(f,f.b);await play(f,'Thundermaw Hellkite');assert.equal(target.damage,1);assert.equal(target.tapped,true);}
});
test('Archfiend, Indulgent Tormentor, Titan Hunter and Scythe Specter resolve upkeep, end-step and discard effects',async()=>{
  {const f=setup();body(f,f.b);body(f,f.b);body(f,f.b);await play(f,'Archfiend of Depravity');await event(f,'endStep',{player:f.b});assert.equal(f.game.creatures(f.b).length,2);}
  {const f=setup();await play(f,'Indulgent Tormentor');await event(f,'upkeep',{player:f.a});assert.equal(f.a.hand.length,1);}
  {const f=setup();const titan=await play(f,'Titan Hunter');await event(f,'endStep',{player:f.b});assert.equal(f.b.life,36);body(f);await activate(f,titan);assert.equal(f.a.life,44);
    const before=f.b.life;await event(f,'endStep',{player:f.b});assert.equal(f.b.life,before);}
  {const f=setup();card(f,'Grizzly Bears','hand',f.b);card(f,'Air Elemental','hand',f.others[1]);const specter=await play(f,'Scythe Specter');
    await event(f,'combatDamageToPlayer',{card:specter,player:f.b,n:4});assert.equal(f.b.hand.length,0);assert.equal(f.others[1].hand.length,0);assert.equal(f.others[1].life,35);assert.equal(f.b.life,40);}
});

test('Grimoire pays discard and counters, reanimates every graveyard, and adds black Zombie characteristics before entry triggers',async()=>{
  const f=setup(),grimoire=await play(f,'Grimoire of the Dead');
  for(let i=0;i<3;i++){card(f,'Forest','hand');f.game.untap(grimoire);await activate(f,grimoire,0);}
  assert.equal(grimoire.counters.study,3);assert.equal(f.a.hand.length,0);
  const bear=card(f,'Grizzly Bears','graveyard'),air=card(f,'Air Elemental','graveyard',f.b);f.game.untap(grimoire);
  await activate(f,grimoire,1);assert.equal(grimoire.zone,'graveyard');
  for(const c of [bear,air]){assert.equal(c.zone,'battlefield');assert.equal(c.ctrl,f.a);assert.ok(c.hasSub('Zombie'));assert.ok(c.colors.includes('B'));}
  assert.ok(bear.colors.includes('G'));assert.ok(air.colors.includes('U'));check(f);
});
test('Havengul grants a paid cast of the exact graveyard object and borrows its mana ability; Laboratory Drudge sees the cast',async()=>{
  const f=setup(),druid=card(f,'Leafkin Druid','graveyard',f.b),lich=await play(f,'Havengul Lich'),lab=await play(f,'Laboratory Drudge');
  await activate(f,lich);fuel(f.a);const offer=f.game.castableList(f.a).find(e=>e.card===druid&&e.alt?.starterPermission==='lich');assert.ok(offer);
  const before=mana(f.a);assert.equal(await f.game.castSpell(f.a,druid,{from:offer.from,alt:offer.alt}),true);assert.equal(before-mana(f.a),2);
  await settle(f.game);assert.equal(druid.ctrl,f.a);assert.equal(druid.zone,'battlefield');assert.ok(lich.cur.extraMana.length);
  const hand=f.a.hand.length;await event(f,'endStep',{player:f.b});assert.equal(f.a.hand.length,hand+1);
  await f.game.move(druid,'graveyard');assert.equal(await f.game.castSpell(f.a,druid,{from:'graveyard',alt:offer.alt}),false);check(f);
});
test('Unbreathing Horde counts other Zombies and graveyards, prevents a whole damage event, and loses one counter',async()=>{
  const f=setup();card(f,'Walking Corpse');card(f,'Walking Corpse','graveyard');const horde=await play(f,'Unbreathing Horde');
  assert.equal(horde.counters['+1/+1'],2);assert.equal(horde.power,2);const enemy=body(f,f.b);
  assert.equal(await f.game.damageAny(enemy,horde,8),0);assert.equal(horde.counters['+1/+1'],1);assert.equal(horde.damage,0);
  await f.game.damageAny(enemy,horde,1);assert.equal(horde.zone,'graveyard');check(f);
});
test('Slate discards the complete hand as a cost, including a legal empty hand',async()=>{
  const f=setup();body(f);body(f);const slate=await play(f,'Slate of Ancestry');card(f,'Forest','hand');card(f,'Island','hand');
  await activate(f,slate);assert.equal(f.a.hand.length,2);assert.equal(f.a.graveyard.length,2);
  for(const c of f.a.hand.slice())await f.game.move(c,'exile');f.game.untap(slate);await activate(f,slate);assert.equal(f.a.hand.length,2);check(f);
});
test('Sepulchral and Diluvian Primordial announce separate opponent targets and resolve reanimation and free casts',async()=>{
  {const f=setup(),bear=card(f,'Grizzly Bears','graveyard',f.b),air=card(f,'Air Elemental','graveyard',f.others[1]);
    await play(f,'Sepulchral Primordial');assert.equal(bear.ctrl,f.a);assert.equal(air.ctrl,f.a);assert.equal(f.game.creatures(f.a).length,3);}
  {const f=setup(),draw=card(f,'Divination','graveyard',f.b),ramp=card(f,'Rampant Growth','graveyard',f.others[1]);
    await play(f,'Diluvian Primordial');assert.equal(draw.zone,'exile');assert.equal(ramp.zone,'exile');assert.equal(f.a.hand.length,2);assert.equal(f.game.lands(f.a).length,1);check(f);}
});
test('Loaming Shaman binds graveyard targets to the chosen player',async()=>{
  const f=setup(),bear=card(f,'Grizzly Bears','graveyard'),island=card(f,'Island','graveyard'),opponent=card(f,'Air Elemental','graveyard',f.b);
  await play(f,'Loaming Shaman');assert.equal(bear.zone,'library');assert.equal(island.zone,'library');assert.equal(opponent.zone,'graveyard');check(f);
});
test('Hunter’s Insight draws for actual combat damage to players and planeswalkers and does not follow a blink',async()=>{
  const f=setup(),bear=body(f),pw=card(f,'Gideon Jura','hand',f.b);await f.game.move(pw,'battlefield');
  await play(f,"Hunter's Insight",{quickTargets:[bear]});const start=f.a.hand.length;
  await f.game.damageAny(bear,pw,2,{combat:true});await settle(f.game);assert.equal(f.a.hand.length,start+2);
  await f.game.damageAny(bear,f.b,2,{combat:true});await settle(f.game);assert.equal(f.a.hand.length,start+4);
  await f.game.move(bear,'exile');await f.game.move(bear,'battlefield');await f.game.damageAny(bear,f.b,2,{combat:true});await settle(f.game);
  assert.equal(f.a.hand.length,start+4);check(f);
});
test('Provoke the Trolls grows only an actual damaged creature, with damage prevention respected',async()=>{
  {const f=setup(),target=flier(f,f.b);await play(f,'Provoke the Trolls',{quickTargets:[target]});assert.equal(target.damage,3);assert.equal(target.power,9);}
  {const f=setup(),target=flier(f,f.b);f.game.untilEffects.push({kind:'preventToCreature',iid:target.iid,zoneVersion:target.zoneVersion,expires:'eot'});
    await play(f,'Provoke the Trolls',{quickTargets:[target]});assert.equal(target.damage,0);assert.equal(target.power,4);}
});
test('Dream Pillager permits spells only, charges their costs, and expires at end of turn',async()=>{
  const f=setup(),pillager=await play(f,'Dream Pillager'),land=card(f,'Forest','library'),spell=card(f,'Grizzly Bears','library');
  await event(f,'combatDamageToPlayer',{card:pillager,player:f.b,n:2});assert.equal(land.zone,'exile');assert.equal(spell.zone,'exile');fuel(f.a);
  assert.ok(!f.game.castableList(f.a).some(e=>e.card===land));const offer=f.game.castableList(f.a).find(e=>e.card===spell);assert.ok(offer);
  assert.equal(await f.game.castSpell(f.a,spell,{from:offer.from,alt:offer.alt}),true);await settle(f.game);assert.equal(spell.zone,'battlefield');
  f.game.turnNo++;assert.equal(f.game.hasExilePlayPermission(f.a,land),false);check(f);
});
test('Drakuseth deals 4 and 3 damage to distinct targets; Foe-Razer fights and adds delayed counters',async()=>{
  {const f=setup(),dragon=await play(f,'Drakuseth, Maw of Flames');await event(f,'attacks',{card:dragon,player:f.a,defender:f.b});
    assert.deepEqual(Array.from(f.game.players,p=>p.life),[36,37,37]);}
  {const f=setup(),opponent=body(f,f.b),regent=await play(f,'Foe-Razer Regent');assert.equal(opponent.zone,'graveyard');assert.equal(regent.damage,2);
    assert.equal(regent.counters['+1/+1']||0,0);await event(f,'endStep',{player:f.a});assert.equal(regent.counters['+1/+1'],2);
    const other=body(f,f.b);await f.game.fight(regent,other);await settle(f.game);await f.game.move(regent,'exile');await f.game.move(regent,'battlefield');await settle(f.game);
    await event(f,'endStep',{player:f.a});assert.equal(regent.counters['+1/+1']||0,0);}
});
test('Dragonkin Boast needs a recorded attack, discounts for Dragons, and is used once per turn',async()=>{
  const f=setup(),berserker=await play(f,'Dragonkin Berserker');fuel(f.a);
  assert.ok(!f.game.activatableList(f.a).some(e=>e.card===berserker));const dragon=card(f,'Hoard-Smelter Dragon');
  f.game.recordCombatObjectEvent(berserker,'attacks');await event(f,'attacks',{card:berserker,player:f.a,defender:f.b});
  const before=mana(f.a),entry=f.game.activatableList(f.a).find(e=>e.card===berserker);assert.ok(entry);
  assert.equal(await f.game.activateAbility(f.a,entry),true);assert.equal(before-mana(f.a),4);await settle(f.game);
  assert.ok(f.game.creatures(f.a).some(c=>c.isToken&&c.power===5&&c.kw('flying')));assert.ok(!f.game.activatableList(f.a).some(e=>e.card===berserker));check(f);
});
test('Savage Ventmaw retains only unspent generated mana through phases and expires it at cleanup',async()=>{
  const f=setup(),ventmaw=await play(f,'Savage Ventmaw');for(const c of Object.keys(f.a.pool))f.a.pool[c]=0;
  await event(f,'attacks',{card:ventmaw,player:f.a,defender:f.b});assert.equal(f.a.pool.R,3);assert.equal(f.a.pool.G,3);
  f.game.emptyPool();assert.equal(mana(f.a),6);assert.equal(await f.game.payMana(f.a,M.parseCost('{R}{G}'),{card:ventmaw,isAbility:true}),true);
  f.a.pool.R+=5;f.game.emptyPool();assert.equal(f.a.pool.R,2);assert.equal(f.a.pool.G,2);
  f.game.expirePersistentMana();f.game.emptyPool();assert.equal(mana(f.a),0);
});
test('Rakshasa Debaser targets the defending graveyard and Encore makes and sacrifices one copy per opponent',async()=>{
  const f=setup(),bear=card(f,'Grizzly Bears','graveyard',f.b),debaser=await play(f,'Rakshasa Debaser');
  await event(f,'attacks',{card:debaser,player:f.a,defender:f.b});assert.equal(bear.zone,'battlefield');assert.equal(bear.ctrl,f.a);
  await f.game.move(debaser,'graveyard');fuel(f.a);const entry=f.game.activatableList(f.a).find(e=>e.card===debaser);assert.ok(entry);
  assert.equal(await f.game.activateAbility(f.a,entry),true);await settle(f.game);assert.equal(debaser.zone,'exile');
  const copies=f.game.creatures(f.a).filter(c=>c.name===debaser.name);assert.equal(copies.length,2);assert.ok(copies.every(c=>c.kw('haste')&&f.game.isForcedToAttack(c)));
  assert.notDeepEqual(f.game.legalDeclarationAttackTargets(copies[0]),f.game.legalDeclarationAttackTargets(copies[1]));
  await event(f,'endStep',{player:f.a});assert.ok(copies.every(c=>c.zone!=='battlefield'));check(f);
});
test('all four new planeswalkers reject loyalty outside the main phase, on an opponent turn, with a spell on the Stack and twice in one turn',async()=>{
  for(const name of ['Gideon Jura','Liliana, Untouched by Death','Ob Nixilis Reignited','Sarkhan, the Dragonspeaker']){
    const f=setup(),walker=await play(f,name),entry=f.game.activatableList(f.a).find(e=>e.card===walker&&e.ability.loyalty>0);
    assert.ok(entry,name);const before=walker.counters.loyalty;
    for(const state of [{turnPlayer:f.b,phase:'main1'},{turnPlayer:f.a,phase:'combat'}]){
      Object.assign(f.game,state);
      assert.ok(!f.game.activatableList(f.a).some(e=>e.card===walker),name+' is not offered');
      assert.equal(await f.game.activateAbility(f.a,entry),false,name+' rejects a stale action');
      assert.equal(walker.counters.loyalty,before);
    }
    f.game.turnPlayer=f.a;f.game.phase='main1';
    const opt=card(f,'Opt','hand');assert.equal(await f.game.castSpell(f.a,opt,{from:'hand'}),true);
    assert.ok(!f.game.activatableList(f.a).some(e=>e.card===walker));
    assert.equal(await f.game.activateAbility(f.a,entry),false);assert.equal(walker.counters.loyalty,before);
    await settle(f.game);assert.equal(await f.game.activateAbility(f.a,entry),true);await settle(f.game);
    const after=walker.counters.loyalty;assert.equal(await f.game.activateAbility(f.a,entry),false);
    assert.equal(walker.counters.loyalty,after);check(f);
  }
});
test('Gideon’s loyalty modes, next-turn requirement and animation preserve correct card types and damage prevention',async()=>{
  {const f=setup(),gideon=await play(f,'Gideon Jura'),attacker=body(f,f.b);await activate(f,gideon,0);assert.equal(gideon.counters.loyalty,8);
    assert.equal(f.game.isForcedToAttack(attacker),false);f.game.turnPlayer=f.b;f.b.turnsStarted++;
    assert.equal(f.game.isForcedToAttack(attacker),true);assert.deepEqual(Array.from(f.game.legalDeclarationAttackTargets(attacker),c=>c.iid),[gideon.iid]);
    await f.game.move(gideon,'exile');assert.equal(f.game.isForcedToAttack(attacker),false);}
  {const f=setup(),gideon=await play(f,'Gideon Jura'),target=body(f,f.b);target.tapped=true;await activate(f,gideon,1);assert.equal(target.zone,'graveyard');assert.equal(gideon.counters.loyalty,4);}
  {const f=setup(),gideon=await play(f,'Gideon Jura');await activate(f,gideon,2);assert.ok(gideon.is('Creature')&&gideon.is('Planeswalker'));assert.equal(gideon.power,6);
    await f.game.damageAny(body(f,f.b),gideon,20);assert.equal(gideon.damage,0);assert.equal(gideon.counters.loyalty,6);}
});
test('Liliana mills and drains, shrinks by Zombie count, and authorizes multiple paid graveyard casts',async()=>{
  {const f=setup(),liliana=await play(f,'Liliana, Untouched by Death');card(f,'Walking Corpse','library');await activate(f,liliana,0);assert.equal(f.a.life,42);assert.equal(f.b.life,38);assert.equal(liliana.counters.loyalty,5);}
  {const f=setup(),liliana=await play(f,'Liliana, Untouched by Death');card(f,'Walking Corpse');card(f,'Walking Corpse');const victim=body(f,f.b);
    f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(victim)?[victim]:undefined;await activate(f,liliana,1);assert.equal(victim.zone,'graveyard');}
  {const f=setup(),liliana=await play(f,'Liliana, Untouched by Death'),zombies=[card(f,'Walking Corpse','graveyard'),card(f,'Walking Corpse','graveyard')];await activate(f,liliana,2);
    for(const zombie of zombies){fuel(f.a);const offer=f.game.castableList(f.a).find(e=>e.card===zombie);assert.ok(offer);assert.equal(await f.game.castSpell(f.a,zombie,{from:offer.from,alt:offer.alt}),true);await settle(f.game);}
    assert.ok(zombies.every(c=>c.zone==='battlefield'));}
});
test('Ob Nixilis and Sarkhan emblems persist independently of their planeswalker sources',async()=>{
  {const f=setup(),ob=await play(f,'Ob Nixilis Reignited');await activate(f,ob,0);assert.equal(f.a.hand.length,1);assert.equal(f.a.life,39);}
  {const f=setup(),ob=await play(f,'Ob Nixilis Reignited'),victim=body(f,f.b);await activate(f,ob,1);assert.equal(victim.zone,'graveyard');}
  {const f=setup(),ob=await play(f,'Ob Nixilis Reignited');f.game.addCounters(ob,'loyalty',3);await activate(f,ob,2);assert.equal(f.b.emblems.length,1);assert.equal(ob.zone,'graveyard');
    await f.game.draw(f.a,1);await settle(f.game);assert.equal(f.b.life,38);}
  {const f=setup(),sarkhan=await play(f,'Sarkhan, the Dragonspeaker');await activate(f,sarkhan,0);assert.ok(sarkhan.is('Creature')&&!sarkhan.is('Planeswalker'));assert.equal(sarkhan.power,4);assert.ok(sarkhan.kw('indestructible')&&sarkhan.kw('haste'));
    await f.game.damageAny(body(f,f.b),sarkhan,2);assert.equal(sarkhan.counters.loyalty,5);}
  {const f=setup(),sarkhan=await play(f,'Sarkhan, the Dragonspeaker'),victim=flier(f,f.b);await activate(f,sarkhan,1);assert.equal(victim.zone,'graveyard');}
  {const f=setup(),sarkhan=await play(f,'Sarkhan, the Dragonspeaker');f.game.addCounters(sarkhan,'loyalty',2);await activate(f,sarkhan,2);assert.equal(sarkhan.zone,'graveyard');
    await event(f,'drawStep',{player:f.a});assert.equal(f.a.hand.length,2);await event(f,'endStep',{player:f.a});assert.equal(f.a.hand.length,0);}
});
test('Fiery Confluence can repeat modes; Profane Command handles X and two different modes',async()=>{
  {const f=setup();f.modes=[1,1,1];await play(f,'Fiery Confluence');assert.equal(f.b.life,34);assert.equal(f.others[1].life,34);assert.equal(f.a.life,40);}
  {const f=setup(),target=card(f,'Sol Ring','battlefield',f.b);f.modes=[2,1,1];await play(f,'Fiery Confluence');assert.equal(target.zone,'graveyard');assert.equal(f.b.life,36);}
  {const f=setup(),dead=card(f,'Grizzly Bears','graveyard');f.modes=[0,1];await play(f,'Profane Command',{xVal:3,quickTargets:[f.b,dead]});assert.equal(f.b.life,37);assert.equal(dead.zone,'battlefield');}
  {const f=setup(),victim=body(f,f.b),own=body(f);f.modes=[2,3];f.decide=(p,q)=>q.type==='chooseTargets'?q.min?[victim]:[own]:undefined;
    await play(f,'Profane Command',{xVal:2});assert.equal(victim.zone,'graveyard');assert.ok(own.kw('fear'));}
});
test('Explosion of Riches makes one random-target Stack trigger per actual draw and Wildfire copies an exiled card',async()=>{
  {const f=setup();let targetPrompts=0;f.decide=(p,q)=>{if(q.type==='chooseTargets'){targetPrompts++;return[q.candidates[0]];}};
    await play(f,'Explosion of Riches');assert.equal(targetPrompts,0);assert.equal(f.game.players.reduce((n,p)=>n+(40-p.life),0),15);assert.ok(f.game.players.every(p=>p.hand.length===1));}
  {const f=setup();for(const p of f.game.players)card(f,'Divination','graveyard',p);await play(f,'Wildfire Devils');assert.equal(f.game.players.reduce((n,p)=>n+p.exile.length,0),1);assert.equal(f.a.hand.length,2);
    await event(f,'upkeep',{player:f.a});assert.equal(f.game.players.reduce((n,p)=>n+p.exile.length,0),2);assert.equal(f.a.hand.length,4);check(f);}
});
test('Wild Ricochet lets its controller redirect an opponent’s spell while the original controller stays unchanged',async()=>{
  const f=setup(),target=flier(f),spell=card(f,'Lightning Strike','hand',f.b);fuel(f.b);f.game.turnPlayer=f.b;
  f.decide=(p,q)=>q.type==='chooseTargets'&&p===f.b?[target]:undefined;
  assert.equal(await f.game.castSpell(f.b,spell,{from:'hand'}),true);const original=f.game.stack[0];f.decide=(p,q)=>{
    if(q.type==='chooseTargets')return q.candidates.includes(original)?[original]:[f.b];
  };
  await play(f,'Wild Ricochet');assert.equal(original.ctrl,f.b);assert.equal(target.damage,0);assert.equal(f.b.life,34);check(f);
});
test('Archon uses the entering object’s last known power when it leaves before the trigger reaches the Stack',async()=>{
  const f=setup();await play(f,'Archon of Redemption');const air=card(f,'Air Elemental','hand');
  await f.game.move(air,'battlefield');M.E.pumpUntilEOT(f.game,air,5,0);await f.game.move(air,'hand');await settle(f.game);
  assert.equal(f.a.life,52);
});
test('Foe-Razer watches paid Oracle and native fights, with one delayed ability per owned fighter',async()=>{
  for(const name of ['Prey Upon','Primal Might']){
    const f=setup(),regent=await play(f,'Foe-Razer Regent'),opponent=body(f,f.b);f.x=0;
    await play(f,name,{quickTargets:[regent,opponent],xVal:0});assert.equal(opponent.zone,'graveyard');
    await event(f,'endStep',{player:f.a});assert.equal(regent.counters['+1/+1'],2);
  }
  const f=setup(),regent=await play(f,'Foe-Razer Regent'),a=flier(f),b=flier(f);
  M.E.grantUntilEOT(f.game,a,['indestructible']);M.E.grantUntilEOT(f.game,b,['indestructible']);
  await f.game.fight(a,b);assert.equal(f.game.pendingTriggers.filter(t=>t.src===regent).length,2);await settle(f.game);
  await event(f,'endStep',{player:f.a});assert.equal(a.counters['+1/+1'],2);assert.equal(b.counters['+1/+1'],2);
});
test('each of the 61 added names has an executed, asserted mechanic scenario',()=>{
  const names=JSON.parse(fs.readFileSync(starterSourceDir+'/intake.json')).newNames;
  assert.deepEqual(names.filter(name=>!covered.has(name)),[]);
});
