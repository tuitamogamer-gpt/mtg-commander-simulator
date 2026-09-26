import assert from 'node:assert/strict';
function protectedCard(M,f,source,op,h,targets){
 if(op.self)return source;
 if(op.attached){const card=h.permanent(M,f.game,f.a,h.fixtureDefinition('Target restriction host',['Creature'],{power:'2',toughness:'30'}));source.attachedTo=card.iid;card.attachments.push(source.iid);return card;}
 if(op.target!==undefined)return [targets[op.target]].flat()[0];
 return h.stageGenericTarget(M,f,op.filter,'target-restriction');
}
async function attempt(M,f,card,player,action,color,h){
 const spec={what:'permanent',zone:card.zone,anyGraveyard:card.zone==='graveyard',min:1,count:1,filter:(g,c)=>c.iid===card.iid},definition=h.fixtureDefinition('Target permission witness',['Instant'],{cost:'{'+color+'}',targets:[spec],resolve:async()=>{}});
 h.fund(player,100);f.game.turnPlayer=player;f.game.phase='main1';
 if(action==='spell'){const source=h.zoneCard(M,player,definition,'hand');return f.game.castSpell(player,source,{from:'hand'});}
 const source=h.permanent(M,f.game,player,h.fixtureDefinition('Target ability witness',['Artifact'],{colorsOverride:[color],abilities:[{cost:{mana:'{1}'},targets:[spec],run:async()=>{}}]}));return f.game.activateAbility(player,{card:source,ability:source.def.abilities[0]});
}
export async function operationProofV20(M,entry,op,role,h){
 if(op.kind==='player-protection-v20'){
  const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f,source=h.permanent(M,game,a,entry.raw.name),enemy=h.permanent(M,game,b,'Grizzly Bears'),own=h.permanent(M,game,a,'Grizzly Bears');h.assertControllerRole(M,f,entry.raw.name);
  assert.equal(game.isProtectedFrom(a,enemy),true);assert.equal(game.isProtectedFrom(a,own),false);assert.equal(await game.damageAny(enemy,a,2),0);assert.equal(await game.damageAny(enemy,a,2,{cantBePrevented:true}),2);M.OracleV8AbilityLoss.add(game,[source],{});assert.equal(game.isProtectedFrom(a,enemy),false);assert.equal(await game.damageAny(enemy,a,2),2);return 6;
 }
 if(op.kind==='life-rule-v20'){
  const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f,source=h.permanent(M,game,a,entry.raw.name);h.assertControllerRole(M,f,entry.raw.name);if(op.condition)h.stageCondition(M,f,op.condition,source);
  if(op.rule==='locked'){const life=a.life;assert.equal(game.canPayLife(a,1),false);assert.equal(game.canPayLife(a,0),true);assert.equal(await game.loseLife(a,2,'effect'),0);assert.equal(await game.gainLife(a,2,source),0);assert.equal(a.life,life);M.OracleV8AbilityLoss.add(game,[source],{});assert.equal(await game.loseLife(a,2,'effect'),2);return 6;}
  if(op.rule==='survive-zero'){a.life=-2;await game.checkSBA();assert.equal(a.lost,false,'zero-life rule does not cause loss');a.poison=10;await game.checkSBA();assert.equal(a.lost,true,'poison loss remains effective');return 2;}
  if(op.rule==='double-loss'){const life=b.life;assert.equal(await game.loseLife(b,2,'effect'),4);assert.equal(b.life,life-4);game.turnPlayer=b;assert.equal(await game.loseLife(b,2,'effect'),2);assert.equal(await game.loseLife(a,2,'effect'),2);return 4;}
  if(op.rule==='damage-floor'){const enemy=h.permanent(M,game,b,'Grizzly Bears');a.life=3;assert.equal(await game.damageAny(enemy,a,5,{cantBePrevented:true}),5,'damage is still dealt in full');assert.equal(a.life,1);assert.equal(await game.loseLife(a,2,'effect'),2);assert.equal(a.life,-1,'nondamage life loss remains unchanged');return 4;}
  throw Error('Missing life rule proof '+op.rule);
 }
 if(op.kind!=='target-restriction-v20')return null;
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),source=h.permanent(M,f.game,f.a,entry.raw.name),card=protectedCard(M,f,source,op,h,[]),action=op.actionType==='ability'?'ability':'spell',color=op.colors?.[0]||'R';h.assertControllerRole(M,f,entry.raw.name);
 assert.equal(await attempt(M,f,card,f.b,action,color,h),false,'the actual targeting action is prohibited');
 if(op.actionType!=='any'){assert.equal(await attempt(M,f,card,f.b,action==='spell'?'ability':'spell',color,h),true,'the other kind of stack object remains allowed');await h.resolveAll(f.game);}
 if(op.opponentsOnly){assert.equal(await attempt(M,f,card,f.a,action,color,h),true,'the restriction uses its controller');await h.resolveAll(f.game);}
 if(op.colors){assert.equal(await attempt(M,f,card,f.b,action,['W','U','B','R','G'].find(c=>!op.colors.includes(c)),h),true,'other colors remain allowed');await h.resolveAll(f.game);}
 M.OracleV8AbilityLoss.add(f.game,[source],{});assert.equal(await attempt(M,f,card,f.b,action,color,h),true,'ability loss releases the restriction');await h.resolveAll(f.game);return 3+(op.actionType!=='any'?1:0)+(op.opponentsOnly?1:0)+(op.colors?1:0);
}
export async function assertRulesEffectV20(M,f,entry,op,source,targets,h){
 if(op.action==='player-protection-v20'){const enemy=h.permanent(M,f.game,f.b,'Grizzly Bears');assert.equal(f.game.isProtectedFrom(f.a,enemy),true);assert.equal(await f.game.damageAny(enemy,f.a,2),0);assert.equal(await f.game.damageAny(enemy,f.a,2,{cantBePrevented:true}),2);const rule=f.game.untilEffects.find(e=>e.kind==='oraclePlayerProtectionV20'&&e.who===f.a);assert.ok(rule);assert.equal(rule.expires,op.duration);assert.equal(rule.whoTurn,f.a);return true;}
 if(op.action==='lose-game-v20'){const player=typeof op.who==='number'?[targets[op.who]].flat()[0]:h.damagedPlayer||f.b;assert.equal(player.lost,true,'the actual targeted or event player lost the game');return true;}
 if(op.action==='life-rule-v20'){const life=f.a.life;if(op.rule==='locked'){assert.equal(await f.game.loseLife(f.a,2,'effect'),0);assert.equal(await f.game.gainLife(f.a,2,source),0);assert.equal(f.a.life,life);assert.equal(f.game.canPayLife(f.a,1),false);}else if(op.rule==='damage-floor'){const attacker=h.permanent(M,f.game,f.b,'Grizzly Bears');f.a.life=3;assert.equal(await f.game.damageAny(attacker,f.a,5,{cantBePrevented:true}),5);assert.equal(f.a.life,1);}else throw Error('Missing temporary life rule proof');return true;}
 if(op.action!=='target-restriction-v20')return false;
 const state=f.game.untilEffects.find(effect=>effect.kind==='oracleTargetRestrictionV20'&&effect.source.iid===source.iid);assert.ok(state,'actual resolution installed the targeting restriction');
 const card=protectedCard(M,f,source,op,h,targets),actor=f.b,action=op.actionType==='ability'?'ability':'spell';assert.equal(await attempt(M,f,card,actor,action,op.colors?.[0]||'R',h),false,'actual cast or activation cannot target the protected object');return true;
}
