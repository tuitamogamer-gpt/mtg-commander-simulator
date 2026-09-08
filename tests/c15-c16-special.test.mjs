import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,fuel,mana,settle,target,tokens} from './helpers/c15-c16-fixtures.mjs';
const castOnly=async(f,n,opts={})=>{const c=opts.card||card(f,n,'hand',opts.player||f.a),p=c.owner;fuel(p);assert.equal(await f.game.castSpell(p,c,{from:c.zone,...opts}),true,n);return c;};
const gy=async(f,c)=>activate(f,c,e=>e.gyAbility);
const clean=f=>{f.game.untilEffects=f.game.untilEffects.filter(e=>e.expires!=='eot');f.game.recalc();};
for(const role of ['human','ai'])test(role+': Aeon Chronicler pays positive X, draws per removed time counter and auto-casts with haste',async()=>{
 const f=setup(role),c=card(f,'Aeon Chronicler','hand');fuel(f.a);f.decide=(p,q)=>q.type==='chooseX'?2:undefined;
 const e=f.game.activatableList(f.a).find(e=>e.card===c&&e.suspend);assert.ok(e);const n=mana(f.a);assert.equal(await f.game.activateAbility(f.a,e),true);assert.equal(n-mana(f.a),6);assert.equal(c.zone,'exile');assert.equal(c.meta.suspended,2);assert.equal(c.counters.time,2);assert.equal(f.game.stack.length,0);
 f.game.removeCounters(c,'time',1);await settle(f.game);assert.equal(c.meta.suspended,1);assert.equal(f.a.hand.length,1);f.game.removeCounters(c,'time',1);assert.equal(f.game.pendingTriggers.length,2);await settle(f.game);assert.equal(c.zone,'battlefield');assert.equal(f.a.hand.length,2);assert.equal(c.power,2);assert.ok(c.kw('haste'));
});
test('Aeon rejects zero X without consuming mana or moving and follows the ordinary upkeep counter route',async()=>{
 const f=setup(),c=card(f,'Aeon Chronicler','hand');fuel(f.a);const n=mana(f.a);f.decide=(p,q)=>q.type==='chooseX'?0:undefined;assert.equal(await f.game.activateAbility(f.a,{card:c,suspend:true}),false);assert.equal(mana(f.a),n);assert.equal(c.zone,'hand');
 card(f,'Island','hand');f.decide=(p,q)=>q.type==='chooseX'?1:undefined;await f.game.activateAbility(f.a,{card:c,suspend:true});f.game.mainPhase=async()=>{};f.game.combatPhase=async()=>{};f.game.priorityRound=async()=>settle(f.game);await f.game.runTurn();assert.equal(c.zone,'battlefield');assert.ok(f.a.hand.length>=2);
});
test('Disaster Radius reveals only after payment, keeps the hand card and copies the chosen mana value',async()=>{
 const f=setup(),reveal=card(f,'Serra Angel','hand'),b=card(f,'Hamletback Goliath','battlefield',f.b);const seen=[];f.game.revealToHuman=async d=>seen.push(...d.cards);f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.includes('Disaster')?[reveal]:undefined;
 const c=await castOnly(f,'Disaster Radius');assert.deepEqual(seen,[reveal]);assert.equal(reveal.zone,'hand');await f.game.copySpell(f.game.stack.at(-1),f.a);await f.game.move(reveal,'graveyard');await f.game.resolveTop();assert.equal(b.damage,5);await settle(f.game);assert.equal(b.zone,'graveyard');assert.equal(c.zone,'graveyard');
 const bad=card(f,'Disaster Radius','hand');f.a.pool.R=0;f.a.pool.C=0;assert.equal(await f.game.castSpell(f.a,bad,{from:'hand'}),false);assert.equal(bad.zone,'hand');
});
test('Grasp of Fate ends immediately without a return trigger and a departed source never starts exile',async()=>{
 const f=setup(),b=body(f,f.b),d=body(f,f.others[1]);target(f,b,d);const g=await play(f,'Grasp of Fate');assert.equal(b.zone,'exile');assert.equal(d.zone,'exile');await f.game.move(g,'hand');assert.equal(b.zone,'battlefield');assert.equal(d.zone,'battlefield');assert.equal(f.game.pendingTriggers.length,0);
 const h=await castOnly(f,'Grasp of Fate');await f.game.resolveTop();await f.game.move(h,'hand');await settle(f.game);assert.equal(b.zone,'battlefield');assert.equal(d.zone,'battlefield');
});
test('Champion sacrifices exactly the chosen return count, permits zero and pays its graveyard top ability',async()=>{
 const f=setup(),c=await play(f,'Champion of Stray Souls');c.sick=false;let e=f.game.activatableList(f.a).find(e=>e.card===c);assert.ok(e);await activate(f,c);assert.equal(c.zone,'battlefield');c.tapped=false;
 const b=body(f),a=card(f,'Serra Angel','graveyard');target(f,a);await activate(f,c);assert.equal(a.zone,'battlefield');assert.equal(b.zone,'graveyard');await f.game.move(c,'graveyard');await gy(f,c);assert.equal(f.a.library.at(-1),c);
});
test('Extractor Demon mills on another departure, unearth is sorcery-only and replaces a bounce with exile',async()=>{
 const f=setup(),c=await play(f,'Extractor Demon'),b=body(f);target(f,f.b);const n=f.b.library.length;await f.game.move(b,'hand');await settle(f.game);assert.equal(f.b.library.length,n-2);await f.game.move(c,'graveyard');f.game.phase='combat';assert.ok(!f.game.activatableList(f.a).some(e=>e.card===c));f.game.phase='main1';await gy(f,c);assert.equal(c.zone,'battlefield');assert.ok(c.kw('haste'));await f.game.move(c,'hand');assert.equal(c.zone,'exile');
});
test('Magus grants paid spells and the one land play; all newly graveyard-bound cards are exiled this turn',async()=>{
 const f=setup(),m=await play(f,'Magus of the Will'),s=card(f,'Serra Angel','graveyard'),l=card(f,'Island','graveyard');m.sick=false;await activate(f,m);assert.equal(m.zone,'exile');assert.ok(f.game.castableList(f.a).some(e=>e.card===s));assert.ok(f.game.playableLands(f.a).includes(l));assert.equal(await f.game.playLand(f.a,l),true);await play(f,s.name,{card:s,from:'graveyard'});await f.game.destroy(s);assert.equal(s.zone,'exile');const opt=await play(f,'Opt');assert.equal(opt.zone,'exile');f.game.turnNo++;const later=body(f);await f.game.destroy(later);assert.equal(later.zone,'graveyard');
});
test('Silas grants only the targeted artifact; Rise adds black and Zombie until the returned object leaves',async()=>{
 const f=setup(),s=await play(f,'Silas Renn, Seeker Adept'),a=card(f,'Sol Ring','graveyard'),b=card(f,'Grizzly Bears','graveyard');target(f,a);await event(f,'damageToPlayer',{src:s,player:f.b,n:2,combat:true});assert.ok(f.game.castableList(f.a).some(e=>e.card===a));assert.ok(!f.game.castableList(f.a).some(e=>e.card===b));target(f,b);await play(f,'Rise from the Grave');assert.ok(b.colors.includes('G')&&b.colors.includes('B')&&b.hasSub('Zombie'));await f.game.move(b,'hand');assert.ok(!b.hasSub('Zombie'));
});
test('Sunforger pays by unattaching before its search/cast; Sydri uses mana value and grants two keywords',async()=>{
 const f=setup(),c=await play(f,'Sunforger'),b=body(f),s=card(f,'Lightning Bolt','library');await f.game.attach(c,b);assert.equal(b.power,6);target(f,f.b);await activate(f,c);assert.equal(c.attachedTo,null);assert.equal(b.power,2);assert.equal(s.zone,'graveyard');assert.equal(f.b.life,37);assert.ok(!f.game.activatableList(f.a).some(e=>e.card===c&&e.ability));
 const sy=await play(f,'Sydri, Galvanic Genius');target(f,c);await activate(f,sy,0);assert.ok(c.is('Creature'));assert.equal(c.power,3);await activate(f,sy,1);assert.ok(c.kw('lifelink')&&c.kw('deathtouch'));clean(f);assert.ok(!c.is('Creature'));
});
test('Karmic Justice triggers for an opposing destruction including itself; Cobra Trap discount excludes sacrifice',async()=>{
 const f=setup(),j=await play(f,'Karmic Justice'),r=card(f,'Sol Ring'),b=body(f,f.b),c=card(f,'Cobra Trap','hand');await f.game.sacrifice(f.a,r);assert.ok(!f.game.castableList(f.a).some(e=>e.card===c&&e.alt));target(f,j,b);await castOnly(f,'Disenchant',{player:f.b});await f.game.resolveTop();assert.equal(j.zone,'graveyard');assert.ok(f.a.turnState.c1516DestroyedByOpponent);target(f,b);await settle(f.game);assert.equal(b.zone,'graveyard');fuel(f.a);const e=f.game.castableList(f.a).find(e=>e.card===c&&e.alt);assert.ok(e);const n=mana(f.a);await f.game.castSpell(f.a,c,{from:'hand',alt:e.alt});assert.equal(n-mana(f.a),1);await settle(f.game);assert.equal(tokens(f).length,4);
});
test('Oath lets the active player choose and reveal under its own control; Hushwing suppresses creature ETBs',async()=>{
 const f=setup(),o=await play(f,'Oath of Druids');body(f);const c=card(f,'Grizzly Bears','library',f.b);let chooser=null;f.decide=(p,q)=>{if(q.type==='chooseTargets'){chooser=p;return [f.a];}};await event(f,'upkeep',{player:f.b});assert.equal(chooser,f.b);assert.equal(c.zone,'battlefield');assert.equal(c.ctrl,f.b);
 await f.game.move(o,'hand');const gryff=await play(f,'Hushwing Gryff');f.decide=null;const n=f.a.hand.length;await play(f,'Sandstone Oracle');assert.equal(f.a.hand.length,n);const rey=await play(f,'Reyhan, Last of the Abzan');assert.equal(rey.counters['+1/+1'],3);await f.game.move(gryff,'hand');
});
test('Cruel Entertainment delegates the next whole turn and expires after exactly that turn',async()=>{
 const f=setup(),other=f.others[1];target(f,f.a,f.b);await play(f,'Cruel Entertainment');const asked=[];f.a.controller={decide:async(g,q)=>{asked.push(['A',q.type]);return q.options?.[0]?.key||null;}};f.b.controller={decide:async(g,q)=>{asked.push(['B',q.type]);return q.options?.[0]?.key||null;}};
 f.game.mainPhase=async p=>p.controller.decide(f.game,{type:'chooseOption',options:[{key:'ok',label:'ok'}]});f.game.combatPhase=async()=>{};f.game.turnPlayer=f.b;await f.game.runTurn();assert.ok(asked.every(x=>x[0]==='A'));assert.equal(f.game.c1516ActiveControl,null);asked.length=0;f.game.turnPlayer=f.b;await f.game.runTurn();assert.ok(asked.every(x=>x[0]==='B'));asked.length=0;f.game.turnPlayer=f.a;await f.game.runTurn();assert.ok(asked.every(x=>x[0]==='B'));assert.equal(f.game.c1516TurnControls.length,0);assert.equal(other.life,40);
});
test('Brutal Hordechief redirects blocker selection and makes current opposing creatures block if able',async()=>{
 const f=setup(),h=await play(f,'Brutal Hordechief'),a=body(f),b=body(f,f.b);await event(f,'attacks',{card:a,player:f.a,defender:f.b});assert.equal(f.b.life,39);assert.equal(f.a.life,41);await activate(f,h);assert.ok(b.cur.mustBlock);let chooser=null;f.decide=(p,q)=>{if(q.type==='blockers'){chooser=p;return [{blocker:b,attacker:a}];}};const picked=await f.b.controller.decide(f.game,{type:'blockers',attackers:[a],potential:[b],player:f.b});assert.equal(chooser,f.a);assert.equal(picked[0].blocker,b);clean(f);assert.ok(!b.cur.mustBlock);
});
test('Mirror Match creates actual blockers, prevents combat damage and cleans up tokens; Trial returns blockers',async()=>{
 const f=setup(),a=body(f,f.b);a.attacking=f.a;f.game.combat={attackers:[a],hadAttackers:true,blockersDeclared:true};f.game.phase='combat';f.game.step='blockers';await play(f,'Mirror Match');assert.equal(a.blockedBy.length,1);assert.ok(a.wasBlocked);const b=a.blockedBy[0];assert.equal(b.blocking,a.iid);await f.game.combatDamage(f.b,'normal');assert.equal(f.a.life,40);assert.notEqual(a.zone,'battlefield');
 const x=body(f,f.b),y=body(f);x.attacking=f.a;x.blockedBy=[y];x.wasBlocked=true;y.blocking=x.iid;f.game.combat={attackers:[x]};target(f,x);const trial=await play(f,'Trial // Error',{alt:{splitHalf:'trial'}});assert.equal(trial.mv,4);assert.equal(y.zone,'hand');
});
test('Error counters only multicolored spells and has mana value two on the Stack',async()=>{
 const f=setup(),b=body(f);target(f,b);const s=await castOnly(f,'Terminate',{player:f.b});const so=f.game.stack.at(-1);target(f,so);const t=await castOnly(f,'Trial // Error',{alt:{splitHalf:'error'}});assert.equal(t.mv,2);await settle(f.game);assert.equal(b.zone,'battlefield');assert.equal(s.zone,'graveyard');assert.equal(t.mv,4);
});

test('recording wrappers retain the controlled hand and restore the actor for its own priority choices',async()=>{
 const f=setup(),ui={me:f.a,render(){}},seen=[];M.C1516.uiControllers.set(f.a,ui);const human={decide:async(g,q)=>{seen.push({seat:ui.me,type:q.type});return q.type==='priority'?{kind:'pass'}:'ok';}};f.a.controller={decide:(g,q)=>human.decide(g,q)};f.game.c1516ActiveControl={subject:f.b.idx,controller:f.a.idx};
 await f.b.controller.decide(f.game,{type:'chooseOption',player:f.b,options:[{key:'ok',label:'ok'}]});assert.equal(seen[0].seat,f.b);assert.equal(ui.me,f.a);ui.me=f.b;await f.a.controller.decide(f.game,{type:'priority',player:f.a});assert.equal(seen[1].seat,f.a);assert.equal(ui.me,f.b);
});
