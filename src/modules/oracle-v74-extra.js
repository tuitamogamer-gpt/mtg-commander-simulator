'use strict';
((M)=>{
 const H=M.OracleV20.helpers;
 const live=c=>c?.zone==='battlefield'&&!c.phasedOut&&!c.cur?.abilitiesDisabled;
 const option=async(ctx,p,options,prompt)=>{const result=await p.controller.decide(ctx.g,{type:'chooseOption',options,prompt,aiHint:{kind:'confirm',src:ctx.src}});if(!options.some(o=>o.key===result))throw Error('Invalid v74 choice');return result;};
 async function voteCount(ctx,p){
  const sources=ctx.g.bf().filter(c=>live(c)&&c.ctrl===p);let count=1+sources.filter(c=>c.def.extraVoteV74).length;
  for(const c of sources.filter(c=>c.def.optionalVoteV74||c.def.vnExtraVote))if(await option(ctx,p,[{key:'yes',label:'Yes'},{key:'no',label:'No'}],c.name+': use an additional vote?')==='yes')count++;
  return count;
 }
 const record=(votes,player,key)=>{(votes.ballots||=[]).push({player,key});};
 M.OracleV74Extra={voteCount,record};
 M.VN.vote=async(ctx,options)=>{
  const ballots=[],votes=new Map();votes.ballots=ballots;
  for(const p of ctx.g.apnapFrom(ctx.you)){const count=await voteCount(ctx,p);for(let i=0;i<count;i++){
   const key=await M.AFC.option(ctx,options,'cast your vote',p,'vote');if(!options.some(o=>o.key===key))throw Error('Invalid vote');
   ballots.push({player:p,key});votes.set(key,(votes.get(key)||0)+1);votes['_by_'+p.idx]=key;
  }}
  await ctx.g.emit('voteEnd',{src:ctx.src,by:ctx.you,votes,options});return ballots;
 };
 M.OracleV20.handlers.push({compile(op,script,entry,h){
  if(op.kind!=='extra-creature-v74')return false;
  if(op.mode==='channel'){if(!op.ability?.effects?.length)throw Error('Uncompiled hand ability');const a=h.compileGenericAbility(op.ability);(script.oracleHandAbilitiesV74||=[]).push({...a,cost:a.cost.mana,label:entry.raw.name+' — '+(op.ability.cost.mana==='{2}{G}'?'return a graveyard card':'return a creature')});}
  else if(op.mode==='process-tap')h.abilities.push({label:'Process an exiled card: tap a creature',cost:{mana:'{2}{U}'},pomCost:{zone:'exile',to:'graveyard',filter:(g,c,s,p)=>c.owner!==p&&!c.owner.lost},targets:[M.T.creature()],run:async ctx=>{for(const c of ctx.targets.flat(Infinity))if(c?.zone==='battlefield')ctx.g.tap(c);}});
  else if(op.mode==='parity-entry'){const prior=script.asEnters;script.asEnters=async(g,c)=>{await prior?.(g,c);c.meta.parityV74={version:c.zoneVersion,odd:(await option({g,src:c,you:c.ctrl},c.ctrl,[{key:'odd',label:'Odd'},{key:'even',label:'Even'}],'Choose odd or even'))==='odd'};};}
  else if(op.mode==='parity-protection')h.statics.push({phase:5,apply:(g,s)=>{const r=s.meta.parityV74;if(r?.version===s.zoneVersion)s.cur.protectionFrom.push((game,c)=>!!c&&((c.mv%2)===1)===r.odd);}});
  else if(op.mode==='extra-vote')script.extraVoteV74=true;
  else if(op.mode==='optional-vote')script.optionalVoteV74=true;
  else if(op.mode==='grudge')h.triggers.push({on:'voteEnd',filter:(g,s,d)=>!!d.votes,desc:'Different votes — lose 2 life',run:async ctx=>{const votes=ctx.data.votes,ballots=votes.ballots||ctx.g.players.filter(p=>votes['_by_'+p.idx]!==undefined).map(player=>({player,key:votes['_by_'+player.idx]})),mine=new Set(ballots.filter(r=>r.player===ctx.you).map(r=>r.key));for(const p of ctx.g.alivePlayers())if(p!==ctx.you&&ballots.some(r=>r.player===p&&!mine.has(r.key)))await ctx.g.loseLife(p,2,ctx.src.name);}});
  else if(['council-guardian','lieutenants'].includes(op.mode))h.triggers.push({on:'etb',filter:(g,s,d)=>d.card===s,desc:'Council vote',run:async ctx=>{
   const guard=op.mode==='council-guardian',keys=guard?['U','B','R','G']:['strength','numbers'],ballots=await M.VN.vote(ctx,keys.map(key=>({key,label:key}))),counts=new Map(keys.map(k=>[k,ballots.filter(r=>r.key===k).length]));
   if(guard){const best=Math.max(...counts.values()),colors=keys.filter(k=>counts.get(k)===best),s=ctx.src,v=ctx.sourceZoneVersion;if(s.zone==='battlefield'&&s.zoneVersion===v){ctx.g.untilEffects.push({kind:'guardian-protection-v74',apply:(g,bf)=>{if(s.zone==='battlefield'&&s.zoneVersion===v&&!s.cur.abilitiesDisabled)s.cur.protectionFrom.push((game,c)=>c?.colors?.some(color=>colors.includes(color)));}});ctx.g.recalc();}}
   else {if(H.sameBattlefieldSource(ctx))ctx.g.addCounters(ctx.src,'+1/+1',counts.get('strength'),false,ctx.you);await ctx.g.makeTokens(M.AFC.token('Soldier',['Soldier'],1,1,['W']),ctx.you,{n:counts.get('numbers')});}
  }});
  else throw Error('Unknown v74 extra '+op.mode);
  return true;
 }});
})(globalThis.MTG||={});
