import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { assertGameStateInvariants, assertRecalculationStable } from './helpers/game-state-invariants.mjs';
const M = loadEngine();
function fixture(role = 'human') {
  const g = new M.Game({ seed: 90477, paced: false });
  const decide = async (_g,q) => {
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='chooseOption')return q.options.find(o=>o.key==='yes')?.key ?? q.options[0]?.key;
    if(q.type==='chooseTargets')return q.candidates.slice(0,q.min??q.count??1);
    if(q.type==='chooseCards')return q.from.slice(0,q.min??0);
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='chooseX')return 1;
    return null;
  };
  const p=g.addPlayer('A',{name:'A'},{decide},role==='ai'), o=g.addPlayer('B',{name:'B'},{decide},false);
  if(role==='ai')p.controller=new M.AIController(p,{difficulty:'hard',style:'balanced'});
  g.turnPlayer=p;g.turnNo=4;g.phase='main1';g.step='main';g.priorityRound=async()=>{};
  return {g,p,o};
}
function put(f,name,owner=f.p,zone='battlefield') {
  assert.ok(M.DEFS[name]);const c=new M.CardInst(M.DEFS[name],owner);c.zone=zone;c.sick=false;
  if(zone==='battlefield')f.g.battlefield.push(c);else owner[zone].push(c);f.g.recalc();return c;
}
async function settle(g){for(let n=0;n<80&&(g.stack.length||g.pendingTriggers.length);n++){await g.flushTriggers();if(g.stack.length)await g.resolveTop();}assert.equal(g.stack.length,0);assert.equal(g.pendingTriggers.length,0);assertGameStateInvariants(g);assertRecalculationStable(g);}
for(const role of ['human','ai']) {
  test(`fixed offspring P/T replaces Maro CDA and remains copiable/${role}`,async()=>{
    const f=fixture(role),{g,p}=f;put(f,"Zinnia, Valley's Voice");
    for(let i=0;i<5;i++)put(f,'Forest',p,'hand');
    const maro=put(f,'Maro',p,'hand');Object.assign(p.pool,{C:4,G:2});
    assert.equal(await g.castSpell(p,maro,{from:'hand'}),true);
    assert.equal(g.stack.at(-1).offspring,true,'real controller pays optional offspring cost');
    await settle(g);
    const token=g.creatures(p).find(c=>c.isToken&&c.name==='Maro');assert.ok(token);
    assert.equal(maro.power,5);assert.equal(token.power,1);assert.equal(token.toughness,1);
    const [copy]=await g.copyPermanentToken(token,p);await settle(g);
    assert.equal(copy.power,1);assert.equal(copy.toughness,1);
    await g.move(p.hand[0],'graveyard');g.recalc();assert.equal(maro.power,4);assert.equal(token.power,1);assert.equal(copy.power,1);
  });
  test(`Disorder in the Court offered with excess mana and resolves chosen smaller X/${role}`,async()=>{
    const f=fixture(role),{g,p}=f;put(f,'Grizzly Bears',f.o);put(f,'Wind Drake',f.o);
    const spell=put(f,'Disorder in the Court',p,'hand');Object.assign(p.pool,{C:20,U:1,W:1});
    assert.ok(g.castableList(p).some(row=>row.card===spell),'maximum mana must not hide a smaller legal X');
    assert.equal(await g.castSpell(p,spell,{from:'hand',xVal:1}),true);
    const targets=g.stack.at(-1).targets.flat();assert.equal(targets.length,1);
    await settle(g);assert.equal(targets[0].zone,'exile');
    assert.equal(g.bf().filter(c=>c.ctrl===p&&c.hasSub('Clue')).length,1);
    assert.equal(p.pool.C,19);assert.equal(spell.zone,'graveyard');
    await g.emit('endStep',{player:p});await settle(g);assert.equal(targets[0].zone,'battlefield');
  });
}
test('X target filters retain a smaller legal offer and reject when no X has a target',()=>{
  const f=fixture(),{g,p}=f;put(f,'Grizzly Bears',f.o);
  const spell=put(f,'Entrancing Melody',p,'hand');Object.assign(p.pool,{C:20,U:2});
  assert.ok(g.castableList(p).some(row=>row.card===spell));
  for(const c of g.battlefield.slice()) {g.battlefield.splice(g.battlefield.indexOf(c),1);c.zone='graveyard';c.owner.graveyard.push(c);}
  g.recalc();assert.equal(g.castableList(p).some(row=>row.card===spell),false);
});
test('queued trigger retains event-time controller, incarnation, metadata and attachment',async()=>{
  const f=fixture(),{g,p,o}=f,source=put(f,'Sol Ring'),host=put(f,'Grizzly Bears');
  source.attachedTo=host.iid;source.meta.auditLinked={iid:host.iid,zoneVersion:host.zoneVersion};
  const version=source.zoneVersion,meta=source.meta;let result;
  g.queueTrigger({src:source,name:'capture regression',run:async ctx=>{result=ctx;}});
  await g.move(source,'exile');await g.move(source,'battlefield',{ctrl:o});await settle(g);
  assert.ok(result.you===p);assert.equal(result.sourceZoneVersion,version);assert.ok(result.sourceMeta===meta);
  assert.equal(result.sourceAttachedTo,host.iid);assert.equal(result.sourceAttachedToZoneVersion,host.zoneVersion);
  assert.notEqual(source.zoneVersion,version);assert.ok(source.meta!==meta);
});
test('physical-card invariant permits a spell copy but detects duplicate original stack records',async()=>{
  const f=fixture(),{g,p}=f;const spell=put(f,'Divination',p,'hand');
  for(let n=0;n<8;n++)put(f,'Forest',p,'library');Object.assign(p.pool,{C:2,U:1});
  assert.equal(await g.castSpell(p,spell,{from:'hand'}),true);const original=g.stack.at(-1);
  await g.copySpell(original,p,{mayNewTargets:false});assert.doesNotThrow(()=>assertGameStateInvariants(g));
  g.stack.push(original);assert.throws(()=>assertGameStateInvariants(g),/duplicate zone membership/);g.stack.pop();await settle(g);
});
for(const role of ['human','ai'])test(`Bootleggers' Stash requires an untapped land before offering its ability/${role}`,async()=>{
 const f=fixture(role),{g,p}=f,stash=put(f,"Bootleggers' Stash"),land=put(f,'Forest');
 land.tapped=true;g.recalc();assert.equal(g.activatableList(p).some(row=>row.card===stash),false);
 land.tapped=false;g.recalc();const entry=g.activatableList(p).find(row=>row.card===stash);assert.ok(entry);
 assert.equal(await g.activateAbility(p,entry),true);await settle(g);assert.equal(land.tapped,true);
 assert.equal(g.bf().filter(c=>c.ctrl===p&&c.hasSub('Treasure')).length,1);
 assert.equal(g.activatableList(p).some(row=>row.card===stash),false);
});
for(const role of ['human','ai'])test(`Ancestral Vision has no payable printed cost but Baral's Expertise casts it legally/${role}`,async()=>{
 const f=fixture(role),{g,p}=f,vision=put(f,'Ancestral Vision',p,'hand');
 Object.assign(p.pool,{C:3,U:2});for(let n=0;n<8;n++)put(f,'Forest',p,'library');
 assert.equal(g.castableList(p).some(row=>row.card===vision),false);
 assert.equal(await g.castSpell(p,vision,{from:'hand'}),false);assert.equal(p.pool.U,2);
 if(role==='human'){const old=p.controller.decide;p.controller.decide=async(game,q)=>q.type==='chooseCards'&&q.from.includes(vision)?[vision]:old(game,q);}
 const expertise=put(f,"Baral's Expertise",p,'hand');
 assert.equal(await g.castSpell(p,expertise,{from:'hand'}),true);await settle(g);
 assert.equal(vision.zone,'graveyard');assert.equal(expertise.zone,'graveyard');assert.equal(p.hand.length,3);
 assert.equal(p.pool.U,0);assert.equal(p.pool.C,0);
});
for(const role of ['human','ai'])test(`copied Charmed Sleep enters already attached and preserves its ETB host/${role}`,async()=>{
 const f=fixture(role),{g,p}=f,host=put(f,'Grizzly Bears',f.o),spell=put(f,'Charmed Sleep',p,'hand');
 Object.assign(p.pool,{C:1,U:2});assert.equal(await g.castSpell(p,spell,{from:'hand'}),true);
 await g.copySpell(g.stack.at(-1),p,{mayNewTargets:false});await g.resolveTop();
 const copy=g.bf().find(c=>c.isToken&&c.name==='Charmed Sleep');assert.ok(copy);assert.equal(copy.attachedTo,host.iid);
 assert.equal(g.stack.at(-1).ctx.sourceAttachedTo,host.iid);assert.equal(host.tapped,false);
 await g.move(copy,'graveyard');await g.resolveTop();assert.equal(host.tapped,true);await settle(g);
});
for(const role of ['human','ai'])test(`Curtains' Call needs two distinct creatures before a legal cast offer/${role}`,async()=>{
 const f=fixture(role),{g,p}=f,first=put(f,'Grizzly Bears',f.o),spell=put(f,"Curtains' Call",p,'hand');
 Object.assign(p.pool,{C:4,B:1});assert.equal(g.castableList(p).some(row=>row.card===spell),false);
 const second=put(f,'Wind Drake',f.o);assert.ok(g.castableList(p).some(row=>row.card===spell));
 assert.equal(await g.castSpell(p,spell,{from:'hand'}),true);assert.equal(new Set(g.stack.at(-1).targets).size,2);
 await settle(g);assert.equal(first.zone,'graveyard');assert.equal(second.zone,'graveyard');assert.equal(p.pool.C+p.pool.B,0);
});
for(const role of ['human','ai'])test(`Mycosynth Gardens chooses an affordable target and resolution ignores spent mana/${role}`,async()=>{
 const f=fixture(role),{g,p}=f,gardens=put(f,'The Mycosynth Gardens'),cheap=put(f,'Sol Ring'),expensive=put(f,'Meteor Golem');
 cheap.tapped=true;Object.assign(p.pool,{C:1});const entry=g.activatableList(p).find(row=>row.card===gardens&&row.ability);assert.ok(entry);
 let choices;const old=p.controller.decide.bind(p.controller);p.controller.decide=async(game,q)=>{if(q.type==='chooseTargets')choices=q.candidates;return old(game,q);};
 assert.equal(await g.activateAbility(p,entry),true);assert.ok(choices.includes(cheap));assert.equal(choices.includes(expensive),false);
 assert.equal(p.pool.C,0);await settle(g);assert.equal(gardens.name,'Sol Ring');assert.equal(gardens.tapped,true);
});
