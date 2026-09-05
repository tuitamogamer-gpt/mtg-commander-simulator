import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle} from './helpers/oracle-v8-fixtures.mjs';
const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-clash-source.json', import.meta.url)));
const M = loadEngine();
const entries = rows.map((card, index) => {
  const semantic = semanticClass(card), words = card.type_line.split(' — ')[0].split(' ');
  assert.ok(semantic.semanticClass,card.name + ': ' + semantic.reason);
  return {position:index+1,oracleId:card.oracle_id,scryfallId:card.id,...semantic,raw:{name:card.name,cost:card.mana_cost,oracle:card.oracle_text,
    types:words.filter(word=>!['Legendary','Basic','Snow','World'].includes(word)),super:words.filter(word=>['Legendary','Basic','Snow','World'].includes(word)),subtypes:card.type_line.split(' — ')[1]?.split(' ')||[],power:card.power,toughness:card.toughness,_ci:card.color_identity},catalog:{typeLine:card.type_line,commanderLegality:'legal'}};
});
M.registerOracleBatch({id:'oracle-clash-source-tests',sequence:9994,cards:entries.filter(entry=>!M.DEFS[entry.raw.name])});M.initData(M.RAW_DATA);
function controls(ctx, targets = []) {
  const decide = ctx.a.controller.decide.bind(ctx.a.controller);
  ctx.a.controller.decide=async(g,q)=>q.type==='chooseTargets'?targets.filter(t=>q.candidates.includes(t)).slice(0,q.max):q.type==='chooseX'?2:decide(g,q);
}
function top(ctx, winner = 'a') {
  for (const p of [ctx.a,ctx.b]) put(M,ctx.game,p,winner===(p===ctx.a?'a':'b')?'Colossal Dreadmaw':'Forest','library');
}
async function cast(ctx,name,resolve=true) {
  const card=put(M,ctx.game,ctx.a,name,'hand');for(const color of ['W','U','B','R','G','C'])ctx.a.pool[color]=12;
  assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true,name);
  assert.ok(Object.values(ctx.a.pool).reduce((a,b)=>a+b,0)<72);if(resolve)await settle(ctx.game);return card;
}
for(const role of ['human','ai']) {
  test(`${role}: shared clash reveals simultaneously, chooses APNAP, then moves together`,async()=>{
    const ctx=context(M,role),{game,a,b}=ctx;top(ctx);game.turnPlayer=b;
    const first=a.library.at(-1),second=b.library.at(-1),order=[],reveals=[];
    game.revealToHuman=async q=>reveals.push(q);
    for(const p of [a,b]){const decide=p.controller.decide.bind(p.controller);p.controller.decide=async(g,q)=>{
      if(q.aiHint?.kind!=='clashPlace')return decide(g,q);
      assert.equal(a.library.at(-1),first);assert.equal(b.library.at(-1),second);
      assert.deepEqual(Array.from(q.revealedCards),[first,second]);order.push(p);return 'bottom';
    };}
    const result=await game.clash(a,{opponent:b});assert.equal(result.won,true);assert.equal(result.opponentWon,false);
    assert.deepEqual(order,[b,a]);assert.equal(reveals.length,1);assert.deepEqual(Array.from(reveals[0].cards),[first,second]);assert.equal(reveals[0].includeLands,true);
    assert.equal(a.library[0],first);assert.equal(b.library[0],second);assert.equal(first.meta.revealedTo,undefined);
  });
  test(`${role}: an empty library remains a legal chosen opponent and no card never wins`,async()=>{
    const ctx=context(M,role,2);ctx.b.library=[];
    const choose=M.E.chooseOpponent;let offered;
    M.E.chooseOpponent=async(g,p,q)=>{offered=q.candidates;return ctx.b;};
    try{const won=await ctx.game.clash(ctx.a);assert.ok(offered.includes(ctx.b));assert.equal(won.won,true);assert.equal(won.opponent,ctx.b);
      ctx.a.library=[];const none=await ctx.game.clash(ctx.a);assert.equal(none.won,false);assert.equal(none.opponentWon,false);
    }finally{M.E.chooseOpponent=choose;}
  });
  test(`${role}: ties do not win and either participant can trigger Sylvan Echoes`,async()=>{
    const ctx=context(M,role);put(M,ctx.game,ctx.a,'Sylvan Echoes');put(M,ctx.game,ctx.b,'Sylvan Echoes');
    const tie=await ctx.game.clash(ctx.a,{opponent:ctx.b});assert.equal(tie.won,false);assert.equal(tie.opponentWon,false);assert.equal(ctx.game.pendingTriggers.length,0);
    top(ctx,'b');await ctx.game.clash(ctx.a,{opponent:ctx.b});assert.equal(ctx.game.pendingTriggers.length,1);
    const hand=ctx.b.hand.length;await settle(ctx.game);assert.equal(ctx.b.hand.length,hand+1);
  });
  test(`${role}: actual paid Lash Out retains the killed creature's controller`,async()=>{
    const ctx=context(M,role),target=put(M,ctx.game,ctx.b,'Grizzly Bears');controls(ctx,[target]);top(ctx);
    await cast(ctx,'Lash Out');assert.equal(target.zone,'graveyard');assert.equal(ctx.b.life,37);
  });
  test(`${role}: Weed Strangle uses toughness from the destroyed incarnation`,async()=>{
    const ctx=context(M,role),target=put(M,ctx.game,ctx.b,'Colossal Dreadmaw');ctx.game.addCounters(target,'+1/+1',3);ctx.game.recalc();controls(ctx,[target]);top(ctx);
    await cast(ctx,'Weed Strangle');assert.equal(target.zone,'graveyard');assert.equal(ctx.a.life,49);
  });
  for(const winner of ['a','b'])test(`${role}: Woodland Guidance always exiles itself (${winner} wins)`,async()=>{
    const ctx=context(M,role),target=put(M,ctx.game,ctx.a,'Grizzly Bears','graveyard'),forest=put(M,ctx.game,ctx.a,'Forest');forest.tapped=true;controls(ctx,[target]);top(ctx,winner);
    const source=await cast(ctx,'Woodland Guidance');assert.equal(target.zone,'hand');assert.equal(source.zone,'exile');assert.equal(forest.tapped,winner!=='a');
  });
  test(`${role}: invalidated sole target stops the whole spell before clash`,async()=>{
    const ctx=context(M,role),target=put(M,ctx.game,ctx.b,'Grizzly Bears');controls(ctx,[target]);top(ctx);let clashes=0;
    const original=ctx.game.clash;ctx.game.clash=async function(...args){clashes++;return original.apply(this,args);};
    await cast(ctx,'Lash Out',false);await ctx.game.move(target,'exile');await ctx.game.move(target,'battlefield');await settle(ctx.game);
    assert.equal(clashes,0);assert.equal(ctx.b.life,40);assert.equal(target.damage,0);
  });
  for(const winner of ['a','b'])test(`${role}: Pulling Teeth announces one target before clash (${winner} wins)`,async()=>{
    const ctx=context(M,role);for(let i=0;i<4;i++)put(M,ctx.game,ctx.b,'Forest','hand');controls(ctx,[ctx.b]);top(ctx,winner);
    await cast(ctx,'Pulling Teeth');assert.equal(ctx.b.hand.length,winner==='a'?2:3);
  });
  test(`${role}: paid Reverberate copy wins Research the Deep without returning the original spell`,async()=>{
    const ctx=context(M,role);controls(ctx);top(ctx);top(ctx);top(ctx);top(ctx);
    const source=await cast(ctx,'Research the Deep',false),original=ctx.game.stack.at(-1);
    controls(ctx,[original]);await cast(ctx,'Reverberate',false);await ctx.game.resolveTop();
    const copy=ctx.game.stack.at(-1);assert.equal(copy.isCopy,true);await ctx.game.resolveTop();
    assert.equal(source.zone,'stack');assert.ok(ctx.game.stack.includes(original));assert.equal(ctx.a.hand.includes(source),false);
    await settle(ctx.game);assert.equal(source.zone,'hand');
  });
  test(`${role}: a paid Marvo attack wins a clash and really casts the drawn spell for free`,async()=>{
    const ctx=context(M,role),marvo=await cast(ctx,'Marvo, Deep Operative');marvo.sick=false;top(ctx);top(ctx);
    const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=async(g,q)=>{
      if(q.type==='attackers')return [{card:marvo,target:ctx.b}];
      if(q.type==='chooseCards'&&q.prompt?.startsWith('You may cast one'))return q.from.filter(c=>c.name==='Colossal Dreadmaw').slice(0,1);
      return decide(g,q);
    };
    ctx.game.priorityRound=async()=>settle(ctx.game);await ctx.game.combatPhase(ctx.a);
    assert.ok(ctx.game.creatures(ctx.a).some(c=>c.name==='Colossal Dreadmaw'));assert.equal(ctx.b.life,39);
  });
  test(`${role}: Marvo keeps the original defending player when the attacked planeswalker changes control`,async()=>{
    const ctx=context(M,role,2),marvo=put(M,ctx.game,ctx.a,'Marvo, Deep Operative'),walker=put(M,ctx.game,ctx.b,'Garruk, Primal Hunter');top(ctx);marvo.attacking=walker;
    await ctx.game.emit('attacks',{card:marvo,attacker:marvo,defender:walker});walker.ctrl=ctx.others[1];
    const clash=ctx.game.clash;let opponent;ctx.game.clash=async function(p,opts){opponent=opts.opponent;return clash.call(this,p,opts);};
    await settle(ctx.game);assert.equal(opponent,ctx.b);
  });
  test(`${role}: Marvo retains the captured defender after its source leaves`,async()=>{
    const ctx=context(M,role,2),marvo=put(M,ctx.game,ctx.a,'Marvo, Deep Operative'),defender=ctx.others[1];
    put(M,ctx.game,ctx.a,'Colossal Dreadmaw','library');controls(ctx);marvo.attacking=defender;
    const spell=put(M,ctx.game,ctx.a,'Grizzly Bears','hand');const decide=ctx.a.controller.decide.bind(ctx.a.controller);
    ctx.a.controller.decide=async(g,q)=>q.type==='chooseCards'&&q.from.includes(spell)?[spell]:decide(g,q);
    let asked=false;const original=M.E.chooseOpponent;M.E.chooseOpponent=async(...args)=>{asked=true;return original(...args);};
    try{await ctx.game.emit('attacks',{card:marvo,attacker:marvo,defender});await ctx.game.move(marvo,'exile');await settle(ctx.game);}finally{M.E.chooseOpponent=original;}
    assert.equal(asked,false); // The attack trigger retains its defending player after Marvo leaves.
    assert.equal(spell.zone,'hand'); // The separate winning ability is absent when the clash occurs.
  });
}
test('clash parser rejects missing antecedents and unsupported trailing instructions',()=>{
  const card=rows.find(row=>row.name==='Lash Out');
  for(const oracle_text of ['Clash with an opponent. If you win, Lash Out deals 3 damage to that creature\'s controller.','Clash with an opponent. If you win, draw a card. Defeat an opponent.'])assert.ok(!semanticClass({...card,oracle_text}).semanticClass);
});
