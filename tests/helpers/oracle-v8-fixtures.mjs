import assert from 'node:assert/strict';
import { loadEngine } from './load-engine.mjs';
import { semanticClass } from '../../scripts/import-oracle-batch.mjs';

export function fixtureEngine(rows) {
  const MTG=loadEngine();
  const cards=rows.map(([name,oracle,type='Creature — Bear',cost='{G}'],index)=>{
    const input={name,oracle_text:oracle,type_line:type,mana_cost:cost,layout:'normal',power:'2',toughness:'3'};
    const semantic=semanticClass(input);
    assert.ok(semantic.semanticClass,name+': '+semantic.reason);
    return {position:index+1,oracleId:name,scryfallId:name,...semantic,
      raw:{name,oracle,cost,types:type.split(' — ')[0].split(' '),subtypes:type.split(' — ')[1]?.split(' ')||[],super:[],power:'2',toughness:'3',_ci:['G']},
      catalog:{commanderLegality:'legal',typeLine:type}};
  });
  MTG.registerOracleBatch({id:'oracle-v8-primitives-test',sequence:9991,cards});MTG.initData(MTG.RAW_DATA);
  return MTG;
}
export function put(MTG,game,player,name,zone='battlefield') {
  const card=new MTG.CardInst(MTG.DEFS[name],player);card.zone=zone;card.sick=false;card.ctrl=player;
  if(zone==='battlefield'){game.battlefield.push(card);game.recalc();}else player[zone].push(card);
  return card;
}
export function context(MTG,role='human',opponents=1) {
  const trace=[];
  const human={decide:async(game,q)=>{
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='chooseTargets')return q.candidates.slice(0,q.min||0);
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    if(q.type==='chooseOption')return q.options.find(option=>option.key==='yes')?.key||q.options[0]?.key;
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='scry')return {top:q.cards,bottom:[]};
    if(q.type==='chooseX')return q.min||0;
    if(['attackers','blockers','combatReview'].includes(q.type))return [];
    return null;
  }};
  const game=new MTG.Game({seed:127156,paced:false});
  const a=game.addPlayer('A',{name:'A'},human,role==='ai');
  const others=Array.from({length:opponents},(_,i)=>game.addPlayer('Opponent '+i,{name:'Opponent '+i},human,false));
  if(role==='ai')a.controller=new MTG.AIController(a,{difficulty:'hard',style:'balanced'});
  const decide=a.controller.decide.bind(a.controller);
  a.controller.decide=async(g,q)=>{const result=await decide(g,q);trace.push({q,result});return result;};
  game.turnPlayer=a;game.turnNo=4;game.phase='main1';game.step='main';
  game.priorityRound=async()=>{};game.revealToHuman=async()=>{};game.reviewGlobalEffectWithHuman=async()=>{};
  for(const player of game.players)for(let i=0;i<30;i++)put(MTG,game,player,'Forest','library');
  return {game,a,b:others[0],others,trace};
}
export async function settle(game) {
  for(let n=0;n<100&&(game.stack.length||game.pendingTriggers.length);n++){
    await game.flushTriggers();if(game.stack.length)await game.resolveTop();
  }
  assert.equal(game.stack.length,0);assert.equal(game.pendingTriggers.length,0);
  assert.equal((game.aiDecisionLog||[]).some(item=>item.fallback),false);
}
export async function paidCast(MTG,ctx,name) {
  const card=put(MTG,ctx.game,ctx.a,name,'hand');
  ctx.a.pool.G+=1;ctx.a.pool.C+=8;
  const before=Object.values(ctx.a.pool).reduce((a,b)=>a+b,0);
  assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);
  if(card.def.cost!=='{0}')assert.ok(Object.values(ctx.a.pool).reduce((a,b)=>a+b,0)<before);
  await settle(ctx.game);return card;
}
