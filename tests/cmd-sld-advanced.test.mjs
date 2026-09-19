import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,settle,fuel,mana} from './helpers/c21-fixtures.mjs';
const count=c=>c.counters['+1/+1']||0;
const aim=(f,...targets)=>{f.decide=(p,q)=>q.type==='chooseTargets'?targets.filter(c=>q.candidates.includes(c)).slice(0,q.max):undefined;};
const tokens=(f,p,t)=>f.game.creatures(p).filter(c=>c.isToken&&c.hasSub(t));
for(const role of ['human','ai']){
 test(role+': join forces totals all contributions for Soldiers, mill and a blocking Dragon',async()=>{
  const f=setup(role);for(const p of f.game.players)fuel(p);f.decide=(p,q)=>q.type==='chooseX'?1:undefined;
  await play(f,'Alliance of Arms');for(const p of f.game.players)assert.equal(tokens(f,p,'Soldier').length,3);
  await play(f,'Shared Trauma');for(const p of f.game.players)assert.equal(p.graveyard.filter(c=>c.name==='Forest').length,3);
  const s=card(f,'Mana-Charged Dragon'),b=body(f,f.b);await event(f,'blocks',{blocker:s,attacker:b});assert.equal(s.power,8);
 });
 test(role+': Archangel choices affect both sides and Voice of All prevents damage of its chosen color',async()=>{
  const f=setup(role),a=body(f),b=body(f,f.b);f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='war')?p===f.a?'war':'peace':q.type==='chooseOption'&&/color/i.test(q.prompt)?'R':undefined;
  await play(f,'Archangel of Strife');assert.equal(a.power,5);assert.equal(b.toughness,5);const s=await play(f,'Voice of All'),red=card(f,'Dragon Whelp','battlefield',f.b);await f.game.damageCreature(red,s,3);assert.equal(s.damage,0);
 });
 test(role+': Bathe in Light shares protection by color and Cleansing Beam uses radiance',async()=>{
  const f=setup(role),a=body(f),b=body(f,f.b),blue=card(f,'Wind Drake','battlefield',f.b);f.decide=(p,q)=>q.type==='chooseTargets'?[a]:q.type==='chooseOption'&&/color/i.test(q.prompt)?'R':undefined;
  await play(f,'Bathe in Light');const red=card(f,'Dragon Whelp','battlefield',f.b);await f.game.damageCreature(red,b,2);assert.equal(b.damage,0);await f.game.damageCreature(red,blue,1);assert.equal(blue.damage,1);
  const other=setup(role),x=body(other),y=body(other,other.b),safe=card(other,'Wind Drake','battlefield',other.b);aim(other,x);await play(other,'Cleansing Beam');assert.equal(x.zone,'graveyard');assert.equal(y.zone,'graveyard');assert.equal(safe.zone,'battlefield');
 });
 test(role+': Firespout distinguishes green and red actually spent',async()=>{
  const f=setup(role),a=body(f),b=card(f,'Wind Drake'),s=card(f,'Firespout','hand');f.a.pool.G=3;
  assert.ok(await f.game.castSpell(f.a,s,{from:'hand'}));await settle(f.game);assert.equal(a.zone,'battlefield');assert.equal(b.zone,'graveyard');
 });
 test(role+': Goblin Lackey works with noncombat damage and Cadets leave combat on control change',async()=>{
  const f=setup(role),s=card(f,'Goblin Lackey'),c=card(f,'Krenko, Mob Boss','hand');f.decide=(p,q)=>q.type==='chooseCards'&&q.from.includes(c)?[c]:undefined;
  await f.game.damagePlayer(s,f.b,1);await settle(f.game);assert.equal(c.zone,'battlefield');
  const cadet=card(f,'Goblin Cadets'),blocker=body(f,f.b);cadet.attacking=f.b;cadet.blockedBy=[blocker];aim(f,f.b);await event(f,'becomesBlocked',{attacker:cadet,blockers:[blocker]});assert.equal(cadet.ctrl,f.b);assert.equal(cadet.attacking,null);
 });
 test(role+': Howlsquad starts speed, advances once per turn and creates an attacking requirement',async()=>{
  const f=setup(role),s=await play(f,'Howlsquad Heavy');assert.equal(f.a.counters.speed,1);await f.game.loseLife(f.b,1);await f.game.loseLife(f.b,1);assert.equal(f.a.counters.speed,2);
  await event(f,'beginCombat',{player:f.a});const token=tokens(f,f.a,'Goblin')[0];assert.ok(token.kw('haste'));f.game.recalc();assert.ok(f.game.isForcedToAttack(token));f.game.afcCombatId++;f.game.recalc();assert.equal(f.game.isForcedToAttack(token),false);
  f.a.counters.speed=4;s.sick=false;assert.ok(f.game.manaSources(f.a).some(m=>m.card===s&&m.produce[0].R===2));
 });
 test(role+': Roaming Throne doubles only the chosen creature type’s trigger',async()=>{
  const f=setup(role);f.decide=(p,q)=>q.type==='chooseOption'&&q.aiHint?.kind==='chooseType'?'Goblin':q.type==='chooseCards'?q.from.slice(0,1):undefined;await play(f,'Roaming Throne');const s=card(f,'Goblin Lackey');card(f,'Goblin Cadets','hand');card(f,'Goblin Lackey','hand');await f.game.damagePlayer(s,f.b,1);await settle(f.game);assert.equal(f.a.hand.length,0);assert.equal(f.game.creatures(f.a).length,4);
 });
 test(role+': Rundvelt keeps exiled Goblin casting available through the next own turn',async()=>{
  const f=setup(role),s=card(f,'Rundvelt Hordemaster'),goblin=card(f,'Goblin Lackey','library');await f.game.sacrifice(f.a,s);await settle(f.game);assert.equal(goblin.zone,'exile');fuel(f.a);assert.ok(f.game.castableList(f.a).some(r=>r.card===goblin));f.game.turnNo++;f.a.turnsStarted++;assert.ok(f.game.castableList(f.a).some(r=>r.card===goblin));f.a.turnsStarted++;assert.equal(f.game.castableList(f.a).some(r=>r.card===goblin),false);
 });
 test(role+': Snoop casts Goblins from the top and borrows their activated abilities',async()=>{
  const f=setup(role),s=card(f,'Conspicuous Snoop'),top=card(f,'Krenko, Mob Boss','library');fuel(f.a);assert.ok(f.game.castableList(f.a).some(r=>r.card===top));f.game.recalc();const entry=f.game.activatableList(f.a).find(r=>r.card===s&&r.ability?.label===top.def.abilities[0].label);assert.ok(entry);assert.ok(await f.game.activateAbility(f.a,entry));await settle(f.game);assert.equal(tokens(f,f.a,'Goblin').length,1);
 });
 test(role+': Damia refills to seven, Dreamborn mills by hand size and Magus adds mana only in first main',async()=>{
  const f=setup(role);card(f,'Damia, Sage of Stone');await event(f,'upkeep',{player:f.a});assert.equal(f.a.hand.length,7);card(f,'Dreamborn Muse');card(f,'Forest','hand',f.b);await event(f,'upkeep',{player:f.b});assert.equal(f.b.graveyard.length,1);
  card(f,'Magus of the Vineyard');await event(f,'precombatMain',{player:f.b,ordinal:1});assert.equal(f.b.pool.G,2);await event(f,'precombatMain',{player:f.b,ordinal:2});assert.equal(f.b.pool.G,2);
 });
 test(role+': Dragon Whelp is sacrificed on the fourth activation and Lightkeeper counts multikicker',async()=>{
  const f=setup(role),s=card(f,'Dragon Whelp');for(let i=0;i<4;i++)await activate(f,s);assert.equal(s.power,6);await event(f,'endStep',{player:f.a});assert.equal(s.zone,'graveyard');
  f.decide=(p,q)=>q.type==='chooseX'?2:undefined;const keeper=await play(f,'Lightkeeper of Emeria');assert.equal(keeper.castMeta.paidTimes,2);assert.equal(f.a.life,44);
 });
 test(role+': Malfegor discards the hand and forces one sacrifice per actual discarded card',async()=>{
  const f=setup(role);card(f,'Forest','hand');card(f,'Mountain','hand');body(f,f.b);body(f,f.b);body(f,f.others[1]);await play(f,'Malfegor');assert.equal(f.a.hand.length,0);assert.equal(f.game.creatures(f.b).length,0);assert.equal(f.game.creatures(f.others[1]).length,0);
 });
 test(role+': Reiver Demon distinguishes black and artifact creatures and only triggers when cast from hand',async()=>{
  const f=setup(role),b=body(f,f.b),black=card(f,'Nezumi Graverobber','battlefield',f.b),artifact=card(f,'Solemn Simulacrum','battlefield',f.b);const s=await play(f,'Reiver Demon');assert.equal(b.zone,'graveyard');assert.equal(black.zone,'battlefield');assert.equal(artifact.zone,'battlefield');await f.game.move(s,'exile');const survivor=body(f,f.b);await f.game.putPermanentOntoBattlefield(s,f.a);await settle(f.game);assert.equal(survivor.zone,'battlefield');
 });
 test(role+': Processor pays life before making a sized token and Catapult gives the damaged player a Squirrel',async()=>{
  const f=setup(role);f.decide=(p,q)=>q.type==='chooseX'?5:undefined;const s=await play(f,'Phyrexian Processor');assert.equal(f.a.life,35);await activate(f,s);const t=tokens(f,f.a,'Minion')[0];assert.equal(t.power,5);assert.ok(t.hasSub('Phyrexian'));
  const cat=card(f,'Acorn Catapult');aim(f,f.b);await activate(f,cat);assert.equal(f.b.life,39);assert.equal(tokens(f,f.b,'Squirrel').length,1);
 });
 test(role+': Valley Rannet chooses its cycling ability before payment and searches the matching land type',async()=>{
  for(const [id,type]of [['printed','Mountain'],['cslForest','Forest']]){const f=setup(role),s=card(f,'Valley Rannet','hand'),land=card(f,type,'library');fuel(f.a);f.decide=(p,q)=>q.type==='chooseCards'&&q.from.includes(land)?[land]:undefined;const entries=f.game.activatableList(f.a).filter(e=>e.card===s&&e.cycling);assert.equal(entries.length,2);const before=mana(f.a);assert.ok(await f.game.activateAbility(f.a,entries.find(e=>e.cyclingId===id)));await settle(f.game);assert.equal(s.zone,'graveyard');assert.equal(land.zone,'hand');assert.equal(f.a.hand.length,1);assert.equal(mana(f.a),before-2);}
 });
 test(role+': Vengeful Rebirth has two targets but deals damage only when a nonland is returned',async()=>{
  const f=setup(role),s=card(f,'Wind Drake','graveyard');aim(f,s,f.b);const spell=await play(f,'Vengeful Rebirth');assert.equal(s.zone,'hand');assert.equal(f.b.life,37);assert.equal(spell.zone,'exile');const land=card(f,'Forest','graveyard');aim(f,land,f.b);await play(f,'Vengeful Rebirth');assert.equal(land.zone,'hand');assert.equal(f.b.life,37);
 });
 test(role+': Dazzling Theater grants convoke and Prop Room grants other-turn creature untaps',async()=>{
  const f=setup(role),s=await play(f,'Dazzling Theater // Prop Room',{alt:{bdfDoor:'left',altCostStr:'{3}{W}'}}),bear=body(f),spell=card(f,'Grizzly Bears','hand');assert.ok(M.CDK.convoke(f.game,f.a,spell,{}));assert.equal(M.ZK.otherUntap(f.game,bear,f.b,f.game.bf()),false);await activate(f,s,1);assert.ok(M.ZK.otherUntap(f.game,bear,f.b,f.game.bf()));
 });
 test(role+': Song grants mana abilities and its final chapter grants counters and combat keywords',async()=>{
  const f=setup(role),b=body(f),s=await play(f,'Song of Freyalise');assert.ok(f.game.manaSources(f.a).some(m=>m.card===b));f.game.addCounters(s,'lore',2,false,f.a);await settle(f.game);assert.equal(s.zone,'graveyard');assert.equal(count(b),1);assert.ok(b.kw('indestructible')&&b.kw('trample')&&b.kw('vigilance'));
 });
 test(role+': Spurnmage returns two cards from one opponent and destroys an attacking creature',async()=>{
  const f=setup(role),s=card(f,'Spurnmage Advocate'),a=card(f,'Forest','graveyard',f.b),b=card(f,'Sol Ring','graveyard',f.b),attacker=body(f,f.b);attacker.attacking=f.a;aim(f,a,b,attacker);await activate(f,s);assert.equal(a.zone,'hand');assert.equal(b.zone,'hand');assert.equal(attacker.zone,'graveyard');
 });
 test(role+': Tariel reanimates a random opposing creature and Trench Gorger sets base size to exiled lands',async()=>{
  const f=setup(role),s=card(f,'Tariel, Reckoner of Souls'),b=card(f,'Grizzly Bears','graveyard',f.b);aim(f,f.b);await activate(f,s);assert.equal(b.ctrl,f.a);assert.equal(b.zone,'battlefield');f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':q.type==='chooseCards'?q.from.slice(0,3):undefined;const gorger=await play(f,'Trench Gorger');assert.equal(gorger.power,3);assert.equal(f.a.exile.length,3);
 });
 test(role+': Ray of Command taps through a delayed trigger when temporary control ends',async()=>{
  const f=setup(role),b=body(f,f.b);b.tapped=true;aim(f,b);await play(f,'Ray of Command');assert.equal(b.ctrl,f.a);assert.ok(!b.tapped&&b.kw('haste'));
  f.game.untilEffects=f.game.untilEffects.filter(e=>!e.layeredControl);f.game.recalc();assert.equal(b.ctrl,f.b);assert.equal(b.tapped,false);assert.equal(f.game.pendingTriggers.length,1);await settle(f.game);assert.ok(b.tapped);
 });
 test(role+': Insurrection and Dominus untap stolen permanents and grant haste',async()=>{
  const f=setup(role),a=body(f),b=body(f,f.b);a.tapped=b.tapped=true;await play(f,'Insurrection');assert.equal(b.ctrl,f.a);assert.ok(!a.tapped&&!b.tapped&&a.kw('haste')&&b.kw('haste'));
  const ring=card(f,'Sol Ring','battlefield',f.b);ring.tapped=true;card(f,'Dominus of Fealty');aim(f,ring);await event(f,'upkeep',{player:f.a});assert.equal(ring.ctrl,f.a);assert.equal(ring.tapped,false);
 });
 test(role+': Finale searches the graveyard even under Stranglehold and grants the X=10 bonus',async()=>{
  const f=setup(role);card(f,'Stranglehold','battlefield',f.b);const b=card(f,'Grizzly Bears','graveyard');f.decide=(p,q)=>q.type==='chooseCards'&&q.from.includes(b)?[b]:undefined;await play(f,'Finale of Devastation',{xVal:10});assert.equal(b.zone,'battlefield');assert.equal(b.power,12);assert.ok(b.kw('haste'));
 });
 test(role+': Trench Gorger retains printed size when an opponent prevents the library search',async()=>{
  const f=setup(role);card(f,'Stranglehold','battlefield',f.b);const s=await play(f,'Trench Gorger');assert.equal(s.power,6);assert.equal(f.a.exile.length,0);
 });
 test(role+': Death by Dragons skips the targeted player and Crescendo boosts attackers and friendly blockers',async()=>{
  const f=setup(role);aim(f,f.b);await play(f,'Death by Dragons');assert.equal(tokens(f,f.a,'Dragon').length,1);assert.equal(tokens(f,f.b,'Dragon').length,0);assert.equal(tokens(f,f.others[1],'Dragon').length,1);
  const s=card(f,'Crescendo of War'),a=body(f),b=body(f,f.b);await event(f,'upkeep',{player:f.b});a.blocking=b;b.attacking=f.a;f.game.recalc();assert.equal(a.power,3);assert.equal(b.power,3);assert.equal(s.counters.strife,1);
 });
 test(role+': Ancient Cornucopia counts spell colors once each turn and Hag returns greatest-power creature',async()=>{
  const f=setup(role);card(f,'Ancient Cornucopia');f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;await play(f,'Voice of Resurgence');await play(f,'Grizzly Bears');assert.equal(f.a.life,42);card(f,'Grizzly Bears','graveyard');const big=card(f,'Symbiotic Wurm','graveyard');await play(f,'Desecrator Hag');assert.equal(big.zone,'hand');
 });
 test(role+': Svogthos changes size with graveyard creatures and Gomazoa shuffles both combatants away',async()=>{
  const f=setup(role),s=card(f,'Svogthos, the Restless Tomb'),dead=card(f,'Grizzly Bears','graveyard');await activate(f,s);assert.equal(s.power,1);card(f,'Wind Drake','graveyard');f.game.recalc();assert.equal(s.power,2);await f.game.move(dead,'exile');assert.equal(s.power,1);
  const gom=card(f,'Gomazoa'),attacker=body(f,f.b);attacker.blockedBy=[gom];gom.blocking=attacker;await activate(f,gom);assert.equal(gom.zone,'library');assert.equal(attacker.zone,'library');
 });
 test(role+': Avatar of Woe costs only two black with ten creature cards in graveyards',async()=>{
  const f=setup(role);for(let i=0;i<10;i++)card(f,'Grizzly Bears','graveyard',i%2?f.a:f.b);const s=await play(f,'Avatar of Woe');assert.equal(s.castMeta.manaSpent,2);s.sick=false;const b=body(f,f.b);aim(f,b);await activate(f,s);assert.equal(b.zone,'graveyard');
 });
 test(role+': Murmurs lets the opponent choose the discarded card and Trade Secrets permits finite repetition',async()=>{
  const f=setup(role);f.decide=(p,q)=>q.type==='chooseCards'?q.from.slice(0,1):q.type==='chooseOption'&&q.options.some(o=>o.key===String(f.b.idx))?String(f.b.idx):undefined;await play(f,'Murmurs from Beyond');assert.equal(f.a.hand.length,2);assert.equal(f.a.graveyard.filter(c=>c.name==='Forest').length,1);
  let repeats=0;f.decide=(p,q)=>q.type==='chooseTargets'?[f.b]:q.type==='chooseX'?4:/Repeat Trade Secrets/.test(q.prompt||'')?repeats++===0?'yes':'no':undefined;await play(f,'Trade Secrets');assert.equal(f.a.hand.length,10);assert.equal(f.b.hand.length,4);
 });
 test(role+': Great Train Heist charges spree costs and makes tapped Treasures for the chosen opponent',async()=>{
  const f=setup(role),b=body(f);f.decide=(p,q)=>q.type==='chooseMulti'?['1','2']:q.type==='chooseTargets'?[f.b]:undefined;const s=await play(f,'Great Train Heist');assert.equal(s.castMeta.manaSpent,4);assert.equal(b.power,3);assert.ok(b.kw('first strike'));await f.game.damagePlayer(b,f.b,3,{combat:true});await settle(f.game);const treasure=f.game.bf().find(c=>c.hasSub('Treasure'));assert.ok(treasure?.tapped);
 });
 test(role+': Den of the Bugbear animates and creates an attacking Goblin',async()=>{
  const f=setup(role),s=card(f,'Den of the Bugbear');await activate(f,s);assert.equal(s.power,3);assert.ok(s.is('Land')&&s.hasSub('Goblin'));f.game.combat={attackers:[s]};s.attacking=f.b;f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key===String(f.b.idx))?String(f.b.idx):undefined;await event(f,'attacks',{card:s,player:f.a,target:f.b});const token=tokens(f,f.a,'Goblin')[0];assert.ok(token.tapped&&token.attacking);
 });
 test(role+': Sazacap’s Brew pays a discard and delivers its tapped Fish before draw and pump',async()=>{
  const f=setup(role),b=body(f),discard=card(f,'Forest','hand');f.decide=(p,q)=>q.type==='chooseTargets'?[f.a,b].filter(c=>q.candidates.includes(c)):q.type==='chooseOption'&&q.options.some(o=>o.key===String(f.b.idx))?String(f.b.idx):q.type==='chooseCards'&&q.from.includes(discard)?[discard]:undefined;
  await play(f,"Sazacap's Brew",{alt:{bdfGift:true}});assert.equal(discard.zone,'graveyard');assert.equal(f.a.hand.length,2);assert.equal(b.power,4);const fish=tokens(f,f.b,'Fish')[0];assert.ok(fish?.tapped);
 });
 test(role+': Pollen Lullaby prevents combat damage and a winning clash freezes opposing creatures',async()=>{
  const f=setup(role),b=body(f,f.b);card(f,'Symbiotic Wurm','library');f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key===String(f.b.idx))?String(f.b.idx):undefined;await play(f,'Pollen Lullaby');await f.game.damagePlayer(b,f.a,2,{combat:true});assert.equal(f.a.life,40);assert.ok(b.meta.noUntapOnce);
 });
 test(role+': Scattering Stroke counters a spell and pays its clash reward only in the next own main phase',async()=>{
  const f=setup(role),bolt=card(f,'Lightning Bolt','hand',f.b);card(f,'Symbiotic Wurm','library');fuel(f.b);aim(f,f.a);assert.ok(await f.game.castSpell(f.b,bolt,{from:'hand'}));const so=f.game.stack.at(-1);
  f.decide=(p,q)=>q.type==='chooseTargets'?[so]:q.type==='chooseOption'&&q.options.some(o=>o.key===String(f.b.idx))?String(f.b.idx):q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;await play(f,'Scattering Stroke');assert.equal(bolt.zone,'graveyard');const before=f.a.pool.C;await event(f,'postcombatMain',{player:f.b});assert.equal(f.a.pool.C,before);await event(f,'postcombatMain',{player:f.a});assert.equal(f.a.pool.C,before+1);await event(f,'precombatMain',{player:f.a});assert.equal(f.a.pool.C,before+1);
 });
 test(role+': Whirlpool Whelm can put a creature on top after winning its clash',async()=>{
  const f=setup(role),b=body(f,f.b);card(f,'Symbiotic Wurm','library');f.decide=(p,q)=>q.type==='chooseTargets'?[b]:q.type==='chooseOption'&&q.options.some(o=>o.key===String(f.b.idx))?String(f.b.idx):q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;await play(f,'Whirlpool Whelm');assert.equal(f.b.library.at(-1),b);
 });
}
