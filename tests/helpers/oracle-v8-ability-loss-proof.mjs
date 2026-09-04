import assert from 'node:assert/strict';
export async function abilityLossStaticProof(MTG,entry,operation,role,h){
  const ctx=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx,label=entry.raw.name+'/'+role;
  h.assertControllerRole(MTG,ctx,label);
  const target=h.stageGenericTarget(MTG,ctx,operation.attached?{what:'creature',zone:'battlefield',controller:'you',min:1}:operation.filters[0],'ability-loss-recipient');
  target.def={...target.def,kws:[...target.def.kws||[],'flying'],abilities:[{label:'Loss proof printed ability',cost:{mana:'{1}'},run:async context=>{context.you.life++;}}]};game.recalc();
  const source=h.permanent(MTG,game,a,entry.raw.name);
  if(operation.attached)assert.equal(await game.attach(source,target),true,label+': actual Aura attachment');
  game.recalc();assert.equal(target.cur.abilitiesDisabled,true,label+': printed abilities removed');assert.equal(target.kw('flying'),false,label+': printed flying removed');assert.equal(game.activatableList(target.ctrl).some(row=>row.card===target&&row.ability===target.def.abilities[0]),false,label+': removed activation is unavailable');
  for(const keyword of operation.keywords||[])assert.equal(target.kw(keyword),true,label+': expressly retained '+keyword);
  if(operation.power!==undefined)assert.equal(target.cur.basePower,operation.power,label+': set base power');
  if(operation.toughness!==undefined)assert.equal(target.cur.baseToughness,operation.toughness,label+': set base toughness');
  if(operation.dp)assert.equal(target.power,Number(target.def.power)+operation.dp,label+': power modifier');
  if(operation.dt)assert.equal(target.toughness,Number(target.def.toughness)+operation.dt,label+': toughness modifier');
  for(const subtype of operation.subtypes||[])assert.equal(target.hasSub(subtype),true,label+': transformed subtype');
  if(operation.types)assert.deepEqual(Array.from(target.cur.types),Array.from(operation.types),label+': replacement card types');
  if(operation.colors&&!operation.retainColors)assert.deepEqual(Array.from(target.colors),Array.from(operation.colors),label+': replacement colors');
  if(operation.cantAttack)assert.equal(target.cur.cantAttack,true,label+': cannot attack');
  if(operation.cantUntap)assert.equal(target.cur.cantUntap,true,label+': cannot untap');
  await game.move(source,'exile');assert.equal(target.cur.abilitiesDisabled,false,label+': loss ends with Aura or source');assert.equal(target.kw('flying'),true,label+': printed ability returns');assert.equal(target.cur.basePower,Number(target.def.power),label+': printed base power returns');
  return 9;
}
