import assert from 'node:assert/strict';
import {put,settle} from './oracle-v8-fixtures.mjs';
export const soulbondFund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=100;};
const total=p=>Object.values(p.pool).reduce((sum,n)=>sum+n,0);
export async function soulbondCast(M,ctx,name,player=ctx.a,{resolve=true}={}){
  soulbondFund(player);const source=put(M,ctx.game,player,name,'hand'),before=total(player);
  assert.equal(await ctx.game.castSpell(player,source,{from:'hand'}),true);assert.ok(total(player)<before,name+': actual cast payment');
  if(resolve)await settle(ctx.game);return source;
}
export function soulbondChoices(ctx){
  const decide=ctx.a.controller.decide.bind(ctx.a.controller);
  ctx.a.controller.decide=async(g,q)=>{
    if(!ctx.a.isAI&&q.type==='chooseCards'&&q.prompt?.includes(': pair with another creature?'))return q.from.slice(0,1);
    if(!ctx.a.isAI&&q.type==='chooseTargets')return q.candidates.filter(card=>card===ctx.b||card.ctrl===ctx.b).slice(0,q.max||q.min||1);
    if(!ctx.a.isAI&&q.type==='attackers')return g.creatures(ctx.a).filter(card=>g.canAttackAtAll(card)).map(card=>({card,target:ctx.b}));
    return decide(g,q);
  };
}
export async function soulbondScenario(M,entry,ctx){
  const {game,a,b}=ctx; soulbondChoices(ctx);
  const source=await soulbondCast(M,ctx,entry.raw.name);
  assert.equal(M.OracleV8Soulbond.partner(game,source),null,'entry without a second creature cannot pair');
  const other=await soulbondCast(M,ctx,'Grizzly Bears');
  assert.equal(M.OracleV8Soulbond.partner(game,source),other,'other creature entry pairs with paid source');
  assert.equal(M.OracleV8Soulbond.partner(game,other),source);
  const operation=entry.implementation.find(op=>op.kind==='soulbond-grant-v8').operation;
  for(const card of [source,other]){
    assert.equal(card.power,Number(card.def.power)+(operation.power||0));assert.equal(card.toughness,Number(card.def.toughness)+(operation.toughness||0));
    for(const keyword of operation.keywords||[])assert.equal(card.kw(keyword),true);
    if(operation.protectionQualities){const zombie=put(M,game,b,'Gravecrawler');assert.equal(game.isProtectedFrom(card,zombie),true);const bear=put(M,game,b,'Grizzly Bears');assert.equal(game.isProtectedFrom(card,bear),false);}
  }
  const granted=operation.grantedOperation;
  if(granted?.kind==='generic-ability')for(const card of [source,other]){
    card.sick=false;if(entry.raw.name==='Galvanic Alchemist')card.tapped=true;
    const action=game.activatableList(a).find(row=>row.card===card&&row.ability.oracleCompiled);assert.ok(action,'both paired creatures receive a real activatable ability');
    soulbondFund(a);const before=total(a),power=card.power,version=card.zoneVersion,library=b.library.length;
    assert.equal(await game.activateAbility(a,action),true);if(granted.cost.mana)assert.ok(total(a)<before);if(granted.cost.tap)assert.equal(card.tapped,true);
    await settle(game);
    if(entry.raw.name==='Stonewright')assert.equal(card.power,power+1);
    if(entry.raw.name==='Galvanic Alchemist')assert.equal(card.tapped,false);
    if(entry.raw.name==='Stern Mentor')assert.equal(b.library.length,library-2);
    if(entry.raw.name==='Deadeye Navigator'){assert.ok(card.zoneVersion>version);assert.equal(card.zone,'battlefield');assert.equal(M.OracleV8Soulbond.partner(game,card),card===source?other:source);}
  }
  if(entry.raw.name==='Tandem Lookout')for(const card of [source,other]){const before=a.hand.length;await game.damageAny(card,b,1);await settle(game);assert.equal(a.hand.length,before+1);}
  if(entry.raw.name==='Doom Weaver'){const before=a.hand.length,n=source.power+other.power;await game.destroyMany([source,other]);await settle(game);assert.equal(a.hand.length,before+n,'simultaneous death uses each recipient power and granted-trigger LKI');}
  if(entry.raw.name==='Imperious Mindbreaker'){source.sick=false;other.sick=false;const before=b.library.length,n=source.toughness+other.toughness;await game.combatPhase(a);await settle(game);assert.equal(b.library.length,before-n);}
  if(entry.raw.name==='Thundering Mightmare'){const oldTurn=game.turnPlayer;game.turnPlayer=b;game.phase='main1';await soulbondCast(M,ctx,'Opt',b);game.turnPlayer=oldTurn;for(const card of [source,other])assert.equal(card.counters['+1/+1'],1);}
  if(source.zone==='battlefield'&&other.zone==='battlefield'){
    await game.move(source,'exile');assert.equal(M.OracleV8Soulbond.partner(game,other),null);
    for(const keyword of operation.keywords||[])assert.equal(other.kw(keyword),false);
    assert.equal(other.cur.extraAbilities.length,0);assert.equal(other.cur.extraTriggers.length,0);
  }
  assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);return 18;
}
export async function soulbondProof(M,entry,operation,role,h){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'});h.assertControllerRole(M,ctx,entry.raw.name+'/'+role);
  for(const player of [ctx.a,ctx.b])h.fillLibrary(M,player,30);
  return soulbondScenario(M,entry,ctx);
}
