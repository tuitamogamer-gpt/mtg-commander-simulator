import assert from 'node:assert/strict';
import {printedTokenName} from './oracle-token-name.mjs';
const installed=new WeakSet(),worlds=new WeakMap();
export function installTokenFormsProof(M,context){
 if(!context.tokenFormsProof)context.tokenFormsProof=[];worlds.set(context.game,context);
 if(installed.has(M))return;installed.add(M);const run=M.OracleV8TokenForms.run;
 M.OracleV8TokenForms.run=async(ctx,effect,h)=>{
  const world=worlds.get(ctx.g);if(!world||effect.action!=='tempting-offer-v8')return run(ctx,effect,h);
  const record={effect,source:ctx.src,you:ctx.you,choices:[],before:new Map(ctx.g.players.map(p=>[p,{hand:p.hand.length,library:p.library.length}])),tokens:ctx.g.bf().filter(c=>c.isToken)};
  const originals=[...new Set(ctx.g.players.map(p=>p.controller))].map(controller=>({controller,decide:controller.decide}));
  for(const {controller,decide}of originals)controller.decide=async function(game,q){const answer=await decide.call(this,game,q);if(game===ctx.g&&q.type==='chooseOption'&&q.aiHint?.name==='Tempting offer')record.choices.push({player:q.player,answer});return answer;};
  try{await run(ctx,effect,h);}finally{for(const {controller,decide}of originals)controller.decide=decide;}
  record.after=new Map(ctx.g.players.map(p=>[p,{hand:p.hand.length,library:p.library.length}]));record.made=ctx.g.bf().filter(c=>c.isToken&&!record.tokens.includes(c));world.tokenFormsProof.push(record);
 };
}
export function assertTemptingOffer(context,effect,source,label){
 if(effect.action!=='tempting-offer-v8')return false;
 const row=context.tokenFormsProof.find(r=>r.source===source&&JSON.stringify(r.effect)===JSON.stringify(effect));assert.ok(row,label+': actual complete tempting-offer execution');
 const opponents=context.game.players.filter(p=>p!==row.you&&!p.lost);assert.equal(row.choices.length,opponents.length);assert.deepEqual(new Set(row.choices.map(c=>c.player)),new Set(opponents));assert.ok(row.choices.every(c=>['yes','no'].includes(c.answer)));
 const accepted=row.choices.filter(c=>c.answer==='yes').map(c=>c.player);
 for(const player of context.game.players){
  const expected=player===row.you?[...effect.effects,...effect.reward.map(e=>({...e,n:e.n*accepted.length}))]:accepted.includes(player)?effect.offered:[];
  const draws=expected.filter(e=>e.action==='draw').reduce((n,e)=>n+e.n,0),made=row.made.filter(c=>c.ctrl===player);
  assert.equal(row.after.get(player).hand-row.before.get(player).hand,draws,label+': exact cards drawn by '+player.idx);assert.equal(row.before.get(player).library-row.after.get(player).library,draws);
  const creations=expected.filter(e=>['token-inline','token-key'].includes(e.action));assert.equal(made.length,creations.reduce((n,e)=>n+e.n,0),label+': exact tokens per participant');
  const grouped=new Map();for(const creation of creations)if(creation.action==='token-inline'){const key=JSON.stringify(creation.token),prior=grouped.get(key);grouped.set(key,{token:creation.token,n:(prior?.n||0)+creation.n});}
  for(const {token,n}of grouped.values()){const matching=made.filter(c=>c.name===printedTokenName(token));assert.equal(matching.length,n);for(const card of matching){assert.equal(card.power,Number(token.power));assert.equal(card.toughness,Number(token.toughness));assert.deepEqual(Array.from(card.colors),Array.from(token.colors));}}
 }
 return true;
}
