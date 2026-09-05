import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runInNewContext} from 'node:vm';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put} from './helpers/oracle-v8-fixtures.mjs';
const M=loadEngine();
runInNewContext(fs.readFileSync(new URL('../src/modules/ui.js',import.meta.url),'utf8'),{MTG:M,document:{},console,setTimeout,clearTimeout});
function table(mode='end'){
 const ctx=context(M),ui=Object.create(M.UI.prototype);delete ctx.game.priorityRound;
 Object.assign(ui,{me:ctx.a,game:ctx.game,prioMode:mode,pendings:[],render(){},scrollPromptIntoView(){}});
 ctx.a.controller=ui.controllerFor(ctx.a);ctx.b.isAI=true;ctx.a.pool.G=2;
 return {...ctx,ui};
}
async function until(predicate){for(let n=0;n<60;n++){if(predicate())return;await new Promise(resolve=>setImmediate(resolve));}assert.ok(predicate(),'expected a reachable priority decision');}
function startCast(ctx,name='Grizzly Bears'){
 const card=put(M,ctx.game,ctx.a,name,'hand');let done=false;
 const promise=ctx.game.castSpell(ctx.a,card,{from:'hand'}).then(value=>{done=true;return value;},error=>{done=true;throw error;});
 return{card,promise,isDone:()=>done};
}
for(const mode of ['end','combat','off','full'])test(`HOLD stops once on an own paid spell without a legal response in ${mode} mode`,async()=>{
 const ctx=table(mode),{ui,game,a}=ctx;ui.holdNext=true;const cast=startCast(ctx);
 await until(()=>ui.pending||cast.isDone());assert.equal(ui.pending?.q.type,'priority');assert.equal(cast.card.zone,'stack');assert.equal(cast.card.castMeta.manaSpent,2);assert.equal(a.hand.length,0);assert.equal(ui.pending.q.casts.length,0);assert.equal(ui.pending.q.acts.length,0);assert.equal(ui.holdNext,false);
 // Once consumed, HOLD returns to the selected mode. FULL still stops at the
 // next empty-stack window, so switch to ordinary auto before proceeding.
 if(mode==='full')ui.prioMode='end';ui.resolvePending({kind:'pass'});assert.equal(await cast.promise,true);assert.equal(cast.card.zone,'battlefield');assert.equal(ui.pending,null);assert.equal(game.stack.length,0);
});
for(const mode of ['end','combat','off','auto'])test(`${mode} retains automatic empty-action passes without HOLD`,async()=>{
 const ctx=table(mode),cast=startCast(ctx);assert.equal(await cast.promise,true);assert.equal(cast.card.zone,'battlefield');assert.equal(ctx.ui.pending,null);assert.equal(ctx.ui.react,undefined);
});
test('FULL reaches own spell, actual own triggered ability, and subsequent empty-stack priorities',async()=>{
 const ctx=table('full'),{ui,game,a}=ctx;put(M,game,a,'Soul Warden');const cast=startCast(ctx);
 await until(()=>ui.pending||cast.isDone());assert.equal(ui.pending?.q.type,'priority');assert.equal(game.stack.at(-1).kind,'spell');ui.resolvePending({kind:'pass'});
 await until(()=>ui.pending||cast.isDone());assert.equal(ui.pending?.q.type,'priority');assert.equal(game.stack.at(-1).kind,'trigger');assert.equal(a.life,40);ui.resolvePending({kind:'pass'});
 await until(()=>ui.pending||cast.isDone());assert.equal(ui.pending?.q.type,'priority');assert.equal(game.stack.length,0);assert.equal(a.life,41);assert.equal(ui.prioMode,'full');ui.resolvePending({kind:'pass'});
 assert.equal(await cast.promise,true);assert.equal(cast.card.zone,'battlefield');
 const next=game.priorityRound(a);await until(()=>ui.pending);assert.equal(ui.pending.q.stack.length,0);ui.resolvePending({kind:'pass'});await next;
});
test('HOLD is preserved during resolution and consumed only at the next real priority window',async()=>{
 const ctx=table('off'),{ui,game,a}=ctx;ui.holdNext=true;game._stackResolutionDepth=1;
 await game.priorityRound(a);assert.equal(ui.pending,null);assert.equal(ui.holdNext,true);
 game._stackResolutionDepth=0;const promise=game.priorityRound(a);await until(()=>ui.pending);assert.equal(ui.holdNext,false);ui.resolvePending({kind:'pass'});await promise;
});
test('opposing paid spell still stops without a response in ACTIONS mode',async()=>{
 const ctx=table('off'),{game,a,b,ui}=ctx;game.turnPlayer=b;b.pool.G=2;a.pool.G=0;const card=put(M,game,b,'Grizzly Bears','hand');const promise=game.castSpell(b,card,{from:'hand'});
 await until(()=>ui.pending);assert.equal(ui.pending.q.type,'priority');assert.equal(game.stack.at(-1).ctrl,b);assert.equal(card.castMeta.manaSpent,2);ui.resolvePending({kind:'pass'});assert.equal(await promise,true);assert.equal(card.zone,'battlefield');
});
test('AI retains its empty-action fast pass without consulting its controller',async()=>{
 const {game,a}=table();a.isAI=true;a.pool.G=0;let calls=0;a.controller={decide:async()=>{calls++;return{kind:'pass'};}};
 assert.equal((await game.askPriorityAction(a)).kind,'pass');assert.equal(calls,0);
});
