export function stageCommonEffectV22(M,ctx,effect,h){
 if(effect.action!=='resolved-sequence-v22')return false;
 for(const program of effect.programs)if(program.ordinal===null||program.ordinal===1)for(const child of program.effects)h.stageEffect(child);
 return true;
}
export function stageCommonTargetV22(M,ctx,target,index,effect,h){
 if(target.v20?.kind!=='common-current-grave-v22')return null;
 const {v20,...base}=target,selected=h.stageGenericTarget(M,ctx,base,index,effect);
 for(const card of [selected].flat())card.meta.oracleGraveEntryV22={turn:ctx.game.turnNo,version:card.zoneVersion,fromBattlefield:v20.origin==='battlefield',discarded:v20.origin==='discard-or-cycle',cycled:false};
 return selected;
}
export async function assertCommonEffectV22(M,ctx,entry,effect,source,targets,damaged,before,trace,label,h){
 if(effect.action!=='resolved-sequence-v22')return false;
 for(const program of effect.programs)if(program.ordinal===null||program.ordinal===1)for(const child of program.effects)await h.assertGenericEffectEvidence(M,ctx,entry,child,source,targets,damaged,before,trace,label+' first resolution');
 return true;
}
import assert from 'node:assert/strict';
export function commonCountValueV22(ctx,node){
 if(node?.kind!=='common-count-v22')return undefined;
 if(node.test==='unspent-mana')return (node.color?[node.color]:['W','U','B','R','G','C']).reduce((sum,color)=>sum+(ctx.a.pool[color]||0),0);
 throw Error('Unknown shared count proof');
}
export function stageCommonCountV22(M,ctx,node){
 if(node?.kind!=='common-count-v22')return false;
 for(const color of ['W','U','B','R','G','C'])ctx.a.pool[color]=color===(node.color||'G')?3:0;
 return true;
}
export async function operationProofV22(M,entry,operation,role,h){
 if(operation.kind!=='mana-retention-v22')return null;
 const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx,source=h.permanent(M,game,a,entry.raw.name);
 for(const player of [a,b])for(const color of ['W','U','B','R','G','C'])player.pool[color]=3;
 a.poolMeta=[{color:operation.color,n:2,restricted:true,restriction:'creature'}];game.emptyPool();
 assert.equal(a.pool[operation.color],3);assert.equal(a.poolMeta[0]?.restriction,'creature');assert.equal(a.poolMeta[0]?.n,2);
 for(const color of ['W','U','B','R','G','C']){if(color!==operation.color)assert.equal(a.pool[color],0);assert.equal(b.pool[color],0);}
 await game.move(source,'graveyard');game.emptyPool();assert.equal(a.pool[operation.color],0);assert.equal(a.poolMeta.length,0);
 h.assertControllerRole(M,ctx,entry.raw.name+'/'+role);return 2;
}
