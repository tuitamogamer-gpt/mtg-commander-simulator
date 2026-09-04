import assert from 'node:assert/strict';
export async function proveOracleEquipReduction(MTG,ctx,entry,operation,source,h){
 const {game,a}=ctx;
 assert.equal(await game.castSpell(a,source,{from:'hand'}),true,entry.raw.name+': actual reducer cast');await h.resolveAll(game);
 const host=h.permanent(MTG,game,a,'Grizzly Bears');
 const equipment=h.permanent(MTG,game,a,h.fixtureDefinition('Equip reduction payment probe',['Artifact'],{subtypes:['Equipment'],equip:'{'+(operation.n+2)+'}'}));
 for(const color of ['W','U','B','R','G','C'])a.pool[color]=color==='C'?2:0;
 const target=operation.scope==='target-self'?source:host;
 const amount=game.abilityManaCost(a,equipment,equipment.def.equip,{kind:'equip',targets:[target]});assert.equal(amount.generic,2);
 assert.equal(game.abilityManaCost(a,equipment,equipment.def.equip,{ability:{},targets:[target]}).generic,operation.n+2,entry.raw.name+': unrelated abilities do not receive the Equip reduction');
 const action=game.activatableList(a).find(row=>row.card===equipment&&row.equip);assert.ok(action,entry.raw.name+': genuinely payable reduced Equip offered');
 assert.equal(await game.activateAbility(a,action),true);const stack=game.stack.find(row=>row.srcCard===equipment&&row.kind==='ability');assert.ok(stack);assert.equal(a.pool.C,0,entry.raw.name+': reduced Equip mana was really spent');
 if(operation.scope==='target-self')assert.equal(stack.targets[0],source);
 await h.resolveAll(game);assert.equal(equipment.attachedTo,stack.targets[0].iid);
 return 7;
}
