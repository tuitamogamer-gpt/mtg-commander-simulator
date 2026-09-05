import assert from 'node:assert/strict';
const names=c=>c.rulesNames||((c.faceDown||c.def?.rulesNoName)?[]:c.def?.oracleSplit?c.def.oracleSplit.faces.map(face=>face.name):c.name?[c.name]:[]);
const installed=new WeakSet(),worlds=new WeakMap();
const state=c=>({card:c,name:c.name,names:names(c),zone:c.zone,version:c.zoneVersion,power:c.power,toughness:c.toughness,damage:c.damage,ctrl:c.ctrl,token:c.isToken,types:[...(c.cur?.types||c.def.types)],indestructible:c.kw('indestructible'),shield:c.counters.shield||0,regen:c.regenShield});
export function installNameGroupsProof(M,context){
 context.nameGroupsProof||=[];worlds.set(context.game,context);if(installed.has(M))return;installed.add(M);const run=M.OracleV8NameGroups.run;
 M.OracleV8NameGroups.run=async(ctx,effect,h)=>{
  const world=worlds.get(ctx.g);if(!world)return run(ctx,effect,h);
  const primary=effect.target==='self'?ctx.src:[ctx.targets[effect.target]].flat()[0],rows=(effect.zone==='graveyard'?ctx.you.graveyard:ctx.g.bf()).map(state);
  const old=effect.target==='self'&&primary?.zoneVersion!==ctx.sourceZoneVersion?primary.battlefieldLKI?.get(ctx.sourceZoneVersion):null;
  const row={effect,source:ctx.src,primary,name:old?.name||primary?.name,names:names(old||primary),controller:old?.ctrl||primary?.ctrl,before:rows};
  await run(ctx,effect,h);row.after=rows.map(r=>state(r.card));world.nameGroupsProof.push(row);
 };
}
export function assertNameGroup(context,effect,source,label){
 if(effect.action!=='same-name-group-v8')return false;
 const row=context.nameGroupsProof.findLast(r=>r.source===source&&JSON.stringify(r.effect)===JSON.stringify(effect));assert.ok(row,label+': actual name-group resolution');assert.ok(row.primary,label+': real selected or printed source object');
 const expected=row.before.filter(r=>r.card===row.primary||r.names.some(name=>row.names.includes(name))&&(!effect.sameController||r.ctrl===row.controller)&&(effect.what==='token'?r.token:['card','permanent'].includes(effect.what)||r.types.includes(effect.what[0].toUpperCase()+effect.what.slice(1))));assert.ok(expected.length,label+': positive named group');
 for(const before of expected){const after=row.after.find(r=>r.card===before.card),action=effect.effect.action;
  if(action==='pump'){assert.equal(after.power,before.power+effect.effect.power);assert.equal(after.toughness,before.toughness+effect.effect.toughness);}
  else if(action==='damage')assert.equal(after.damage,before.damage+effect.effect.n);
  else if(action==='destroy'&&(before.indestructible||before.shield||before.regen))assert.equal(after.zone,'battlefield');
  else{const zone={destroy:'graveyard',exile:'exile',bounce:'hand','move-to-hand':'hand',reanimate:'battlefield'}[action];assert.ok(zone,label+': closed named group operation');assert.equal(before.card.zone,before.token&&zone!=='battlefield'?'ceased':zone,label+': '+before.name+' goes to printed destination');assert.ok(before.card.zoneVersion>before.version);if(effect.effect.tapped)assert.equal(before.card.tapped,true);}
 }
 return true;
}
