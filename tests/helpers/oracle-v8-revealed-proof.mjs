import assert from 'node:assert/strict';
import {matchesTarget} from './oracle-v5-proof.mjs';
const worlds=new WeakMap(),installed=new WeakSet(),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const substitute=(node,stats)=>Array.isArray(node)?node.map(child=>substitute(child,stats)):node&&typeof node==='object'?node.kind==='revealed-card-stat-v8'?stats[node.stat]:Object.fromEntries(Object.entries(node).map(([key,value])=>[key,substitute(value,stats)])):node;
function install(M,context,h){
 let state=worlds.get(context.game);if(state)return state;
 state={context,h,rows:[],current:null};worlds.set(context.game,state);
 const game=context.game,reveal=game.revealToHuman,move=game.move;
 game.revealToHuman=async function(query){if(state.current)state.current.reveals.push(query);return reveal.call(this,query);};
 game.move=async function(card,zone,options){const row=state.current,manual=row&&!row.generic,before=card.zone,version=card.zoneVersion;const result=await move.call(this,card,zone,options);if(manual&&card===row.card)row.moves.push({from:before,to:card.zone,requested:zone,options,version,newVersion:card.zoneVersion});return result;};
 if(installed.has(M.OracleV8Revealed))return state;installed.add(M.OracleV8Revealed);
 const run=M.OracleV8Revealed.run;
 M.OracleV8Revealed.run=async function(ctx,effect,helpers){
  const state=worlds.get(ctx.g);if(!state)return run.call(this,ctx,effect,helpers);
  const card=ctx.you.library.at(-1),row={card,source:ctx.src,effect,reveals:[],moves:[],children:[],choices:[],stats:card?{mv:card.mv,power:card.power,toughness:card.toughness}:null},prior=state.current;state.rows.push(row);state.current=row;
  const snapshot=()=>state.h.genericProofSnapshot(state.context,card?[card]:[]);row.before=snapshot();
  const decide=ctx.you.controller.decide;ctx.you.controller.decide=async function(g,q){const result=await decide.call(this,g,q);row.choices.push({q,result});return result;};
  try{
   row.result=await run.call(this,ctx,effect,{...helpers,run:async(childCtx,effects)=>{
    const before=snapshot();row.children.push(effects);row.generic=true;
    try{const result=await helpers.run(childCtx,effects);for(const child of effects)await state.h.assertGenericEffectEvidence(M,state.context,{raw:{name:ctx.src.name},implementation:[]},child,ctx.src,childCtx.targets||[],state.context.b,before,row.choices.map(({q,result})=>({query:q,result})),ctx.src.name+'/revealed-card');return result;}finally{row.generic=false;}
   }});row.after=snapshot();return row.result;
  }finally{ctx.you.controller.decide=decide;state.current=prior;}
 };
 return state;
}
export function stageRevealed(M,context,effect,h){
 if(effect.action!=='reveal-card-v8')return false;install(M,context,h);
 const filter=effect.clauses.find(clause=>clause.filter&&!clause.invert)?.filter||{what:'creature',zone:'graveyard'};
 const card=h.stageGenericTarget(M,context,{...filter,zone:'graveyard',controller:'you'},'revealed-card-donor');
 card.def={...card.def,cost:'{1}',...(card.def.types.includes('Creature')?{power:'2',toughness:'4'}:{})};
 card.owner.graveyard.splice(card.owner.graveyard.indexOf(card),1);card.zone='library';card.owner.library.push(card);
 return true;
}
export function assertRevealed(M,context,effect,source,label){
 if(effect.action!=='reveal-card-v8')return false;
 const row=worlds.get(context.game)?.rows.find(row=>!row.verified&&row.source===source&&same(row.effect,effect));assert.ok(row,label+': revealed-card runtime executes');row.verified=true;
 assert.ok(row.card&&row.result,label+': positive reveal branch has an actual top card');
 assert.equal(row.result.card,row.card);assert.equal(same(row.result.stats,row.stats),true,label+': exact printed top-card stats are retained');
 assert.ok(row.reveals.some(query=>query.kind==='reveal'&&query.cards.length===1&&query.cards[0]===row.card),label+': only the actual top card is revealed');
 const old=row.before.cards.get(row.card),view={...old,zone:'graveyard',owner:row.card.owner,ctrl:row.card.owner,def:{...row.card.def,types:old.types,subtypes:old.subtypes},cur:{super:old.super||[]},is:type=>old.types.includes(type),hasSub:type=>old.subtypes.includes(type),kw:keyword=>old.keywords.includes(keyword)};
 const expected=[];let move;
 for(const clause of effect.clauses){const matches=!clause.filter||matchesTarget(view,{...clause.filter,controller:'any'},context,source);for(const child of (clause.invert?!matches:matches)?clause.effects:clause.elseEffects||[]){if(child.action==='revealed-move-v8')move=child;else expected.push([substitute(child,row.stats)]);}}
 assert.equal(same(row.children,expected),true,label+': exact snapshot selects each printed branch and stat');
 if(move){const declined=move.optional&&row.choices.some(({q,result})=>q.prompt==='Move the revealed card?'&&result==='no');if(!declined){const actual=row.moves.find(entry=>entry.from==='library'&&entry.newVersion!==entry.version);assert.ok(actual,label+': mandatory/chosen revealed card really moves');assert.equal(actual.to,move.destination==='bottom'?'library':move.destination);if(move.destination==='battlefield'){assert.equal(row.card.ctrl,context.a);assert.equal(row.card.tapped,!!move.tapped);}if(move.destination==='bottom')assert.equal(context.a.library[0],row.card);}}
 return true;
}
