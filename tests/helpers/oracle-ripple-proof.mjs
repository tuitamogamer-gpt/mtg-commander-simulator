import assert from 'node:assert/strict';
import {put,settle} from './oracle-v8-fixtures.mjs';
const total=player=>Object.values(player.pool).reduce((sum,value)=>sum+value,0);
export function rippleFund(player){for(const color of ['W','U','B','R','G','C'])player.pool[color]=50;}
export function rippleChoices(ctx){
  const decide=ctx.a.controller.decide.bind(ctx.a.controller);
  ctx.a.controller.decide=async(game,q)=>{
    if(!ctx.a.isAI&&q.type==='chooseCards'&&q.prompt?.startsWith('You may cast one'))return q.from.slice(0,1);
    if(!ctx.a.isAI&&q.type==='chooseTargets'){
      const helpful=q.aiHint?.kind==='buff'||q.prompt?.includes('Surging Might');
      const preferred=q.candidates.filter(card=>helpful?card.ctrl===ctx.a:card===ctx.b||card.ctrl===ctx.b);
      return (preferred.length?preferred:q.candidates).slice(0,q.min||1);
    }
    return decide(game,q);
  };
}
export async function ripplePaid(M,ctx,name,{resolve=false}={}){
  rippleFund(ctx.a);const card=put(M,ctx.game,ctx.a,name,'hand'),before=total(ctx.a);
  const previous=ctx.game.turnPlayer;if(!ctx.game.stack.length)ctx.game.turnPlayer=ctx.a;
  try{assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);assert.ok(total(ctx.a)<before,name+': real mana payment');
    if(resolve)await settle(ctx.game);return card;
  }finally{ctx.game.turnPlayer=previous;}
}
export async function rippleScenario(M,entry,ctx){
  const {game,a,b}=ctx;rippleChoices(ctx);
  const name=entry.raw.name,stone=name==='Thrumming Stone';
  if(stone){const source=await ripplePaid(M,ctx,name,{resolve:true});assert.equal(source.zone,'battlefield');}
  const spellName=stone?'Grizzly Bears':name;
  const host=name==='Surging Might'?put(M,game,a,'Grizzly Bears'):null;
  const victim=name==='Surging Aether'?put(M,game,b,'Serra Angel'):null;
  if(name==='Surging Dementia')for(let i=0;i<4;i++)put(M,game,b,'Forest','hand');
  const copies=[put(M,game,a,spellName,'library'),put(M,game,a,spellName,'library')];
  const rest=[put(M,game,a,'Island','library'),put(M,game,a,'Mountain','library')];
  const library=a.library.length,life=b.life,hand=b.hand.length;
  const reveals=[];game.revealToHuman=async payload=>{if(payload.title?.startsWith('Ripple'))reveals.push(payload.cards.slice());};
  let priority=0;game.priorityRound=async()=>{priority++;};
  const source=await ripplePaid(M,ctx,spellName),pool=total(a);
  assert.equal(game.stack.length,2,'paid spell and its independent Ripple trigger');
  assert.equal(reveals.length,0,'casting does not reveal early');assert.equal(priority,1);
  await game.resolveTop();
  assert.equal(reveals.length,1,'nested Ripple waits for the resolving parent');
  assert.deepEqual(new Set(reveals[0]),new Set([...copies,...rest]));
  assert.equal(game.stack.filter(row=>row.kind==='spell').length,3,'two actual cards cast from the revealed cohort');
  assert.equal(game.stack.filter(row=>row.kind!=='spell').length,2,'new Ripple triggers appear after the parent completes');
  assert.equal(priority,1,'no intervening priority during Ripple');assert.equal(total(a),pool,'free casting pays no printed mana');
  assert.equal(a.library.length,library-2);
  assert.deepEqual(new Set(a.library.slice(0,2)),new Set(rest));
  for(const card of copies){assert.equal(card.zone,'stack');assert.equal(card.castMeta.from,'library');assert.equal(card.castMeta.alt.free,true);}
  await settle(game);assert.equal(reveals.length,3);assert.equal(a.turnState.spellsCast,stone?4:3);
  if(host){assert.equal(host.power,8);assert.equal(host.toughness,8);assert.ok([source,...copies].every(card=>card.attachedTo===host.iid));}
  if(victim)assert.equal(victim.zone,'hand');
  if(name==='Surging Flame')assert.equal(b.life,life-6);
  if(name==='Surging Dementia')assert.equal(b.hand.length,hand-3);
  if(stone||name==='Surging Sentinels')for(const card of [source,...copies]){assert.equal(card.zone,'battlefield');if(!stone)assert.equal(card.kw('first strike'),true);}
  assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);
  return 24;
}
export async function rippleProof(M,entry,operation,role,h){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'});h.assertControllerRole(M,ctx,entry.raw.name+'/'+role);
  for(const player of [ctx.a,ctx.b])h.fillLibrary(M,player,30);
  return rippleScenario(M,entry,ctx);
}
