import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const rows=[
 ['Owner All','When this creature enters, each player may search their library for up to two basic land cards, put them onto the battlefield, then shuffle.'],
 ['Owner Opponents','When this creature enters, each opponent may search their library for a basic land card, put it onto the battlefield tapped, then shuffle.'],
 ['Owner Unrestricted','When this creature dies, each player may search their library for a card and put that card into their hand. Then each player who searched their library this way shuffles.'],
 ['Owner Destroy','Destroy target land. Its controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle.','Sorcery'],
];
const M=fixtureEngine(rows);
function world(role){const ctx=context(M,role,2);ctx.searchTrace=[];for(const p of ctx.game.players){if(role==='ai'&&p!==ctx.a){p.isAI=true;p.controller=new M.AIController(p,{difficulty:'hard',style:'balanced'});}const decide=p.controller.decide.bind(p.controller);p.controller.decide=async(g,q)=>{const result=role==='human'&&q.type==='chooseCards'&&q.search?q.from.slice(0,q.max):await decide(g,q);ctx.searchTrace.push({p,q,result});return result;};p.library=[];p.testLands=[put(M,ctx.game,p,'Forest','library'),put(M,ctx.game,p,'Forest','library')];put(M,ctx.game,p,'Grizzly Bears','library');}return ctx;}
async function cast(ctx,name){const source=put(M,ctx.game,ctx.a,name,'hand');ctx.a.pool.G=1;assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand'}),true);await settle(ctx.game);return source;}
for(const role of ['human','ai']){
 test(`${role}: each player chooses only their own library and all chosen lands enter simultaneously`,async()=>{
  const ctx=world(role),entries=[],emit=ctx.game.emit;ctx.game.emit=async function(event,data,...rest){if(event==='etb'&&data.card.is('Land'))entries.push(ctx.game.players.flatMap(p=>p.testLands).map(c=>c.zone));return emit.call(this,event,data,...rest);};
  await cast(ctx,'Owner All');const q=ctx.searchTrace.filter(r=>r.q.search);assert.equal(q.length,3);assert.deepEqual(q.map(r=>r.p),[...ctx.game.players]);for(const r of q){assert.deepEqual(new Set(r.q.from),new Set(r.p.testLands));assert.equal(r.result.length,2);assert.ok(r.result.every(c=>c.zone==='battlefield'&&c.ctrl===r.p));}
  assert.equal(entries.length,6);assert.ok(entries.every(zones=>zones.every(zone=>zone==='battlefield')));
 });
 test(`${role}: each-opponent search never exposes the source controller's library`,async()=>{
  const ctx=world(role);await cast(ctx,'Owner Opponents');const q=ctx.searchTrace.filter(r=>r.q.search);assert.equal(q.length,2);assert.ok(q.every(r=>r.p!==ctx.a&&r.q.from.every(c=>c.owner===r.p)));assert.ok(ctx.a.testLands.every(c=>c.zone==='library'));for(const r of q){assert.equal(r.result.length,1);assert.equal(r.result[0].ctrl,r.p);assert.equal(r.result[0].tapped,true);}
 });
 test(`${role}: destroyed stolen land grants search to its captured controller, not its owner`,async()=>{
  const ctx=world(role),land=put(M,ctx.game,ctx.a,'Forest');land.ctrl=ctx.b;ctx.game.recalc();assert.equal(land.ctrl,ctx.b);await cast(ctx,'Owner Destroy');assert.equal(land.zone,'graveyard');assert.equal(land.owner,ctx.a);const q=ctx.searchTrace.filter(r=>r.q.search);assert.equal(q.length,1);assert.equal(q[0].p,ctx.b);assert.ok(q[0].q.from.every(c=>c.owner===ctx.b));assert.equal(q[0].result[0].ctrl,ctx.b);
 });
 test(`${role}: an unrestricted search that is accepted must find a card`,async()=>{
  const ctx=world(role),source=put(M,ctx.game,ctx.a,'Owner Unrestricted');await ctx.game.sacrifice(ctx.a,source);await settle(ctx.game);const q=ctx.searchTrace.filter(r=>r.q.search);assert.equal(q.length,3);for(const r of q){assert.equal(r.q.min,1);assert.equal(r.result[0].zone,'hand');assert.equal(r.result[0].owner,r.p);}
 });
}
test('declining one owner search neither exposes nor shuffles that library',async()=>{
 const ctx=world('human'),before=ctx.b.library.slice(),decide=ctx.b.controller.decide;ctx.b.controller.decide=async(g,q)=>q.prompt==='Search your library?'?'no':decide(g,q);await cast(ctx,'Owner All');assert.deepEqual(ctx.b.library,before);assert.equal(ctx.searchTrace.some(r=>r.p===ctx.b&&r.q.search),false);assert.equal(ctx.a.testLands[0].zone,'battlefield');
});
test('a search choice cannot bind to a card moved out and back while choosing',async()=>{
 const ctx=world('human'),decide=ctx.a.controller.decide;ctx.a.controller.decide=async(g,q)=>{if(q.search){const card=q.from[0];await g.move(card,'exile');await g.move(card,'library');return [card];}return decide(g,q);};const c=put(M,ctx.game,ctx.a,'Owner All','hand');ctx.a.pool.G=1;assert.equal(await ctx.game.castSpell(ctx.a,c,{from:'hand'}),true);await ctx.game.resolveTop();await ctx.game.flushTriggers();await assert.rejects(()=>ctx.game.resolveTop(),/Invalid library search selection/);assert.ok(ctx.a.testLands.every(c=>c.zone==='library'));
});
