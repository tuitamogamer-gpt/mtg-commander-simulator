import assert from 'node:assert/strict';
export async function abilityCostProofV18(M,entry,op,role,h){
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;
 const source=h.permanent(M,game,a,entry.raw.name),subject=op.filter?h.stageGenericTarget(M,f,op.filter,'cost-source'):h.permanent(M,game,op.controllerOnlyV19?a:b,'Grizzly Bears'),player=subject.ctrl;
 const ability={...(op.ability==='powerUp'?{powerUp:true}:op.ability==='loyalty'?{loyalty:1}:op.ability==='exhaustV18'?{exhaustV18:true}:op.ability==='ninjutsuV19'?{ninjutsu:true}:{})},context={ability,isMana:false};
 const cost=game.abilityManaCost(player,subject,'{4}{U}',context);assert.equal(cost.generic,Math.max(0,4+op.amount));assert.deepEqual(Array.from(cost.pips,p=>Array.from(p)),[['U']]);
 if(op.ability==='nonmana')assert.equal(game.abilityManaCost(player,subject,'{4}',{isMana:true}).generic,4);
 if(op.filter?.zone==='graveyard'){await game.move(subject,'hand');assert.equal(game.abilityManaCost(player,subject,'{4}',context).generic,4);}
 await game.move(source,'exile');assert.equal(game.abilityManaCost(player,subject,'{4}',context).generic,4);return 5;
}
export async function ruleProofV18(M,entry,op,role,h){
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;
 for(const p of game.players){h.fund(p,30);h.fillLibrary(M,p,20);}
 const source=h.zoneCard(M,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);
 if(op.rule==='legend'){
  const definition=h.fixtureDefinition('V18 legend witness',['Creature'],{super:['Legendary'],power:'1',toughness:'5'}),first=h.permanent(M,game,a,definition),second=h.permanent(M,game,a,definition);await game.checkSBA();assert.equal(first.zone,'battlefield');assert.equal(second.zone,'battlefield');await game.move(source,'exile');await game.checkSBA();assert.equal([first,second].filter(c=>c.zone==='battlefield').length,1);
 }else if(op.rule==='loyalty'){
  const walker=h.permanent(M,game,b,h.fixtureDefinition('V18 walker',['Planeswalker'],{loyalty:'5'}));assert.equal(game.canActivateLoyalty(walker),false);await game.move(source,'exile');assert.equal(game.canActivateLoyalty(walker),true);
 }else if(op.rule==='draw-limit'){
  for(const p of game.players){p.turnState.drewThisTurn=0;const n=p.hand.length;await game.draw(p,3);assert.equal(p.hand.length,n+1);}await game.move(source,'exile');const n=a.hand.length;await game.draw(a,2);assert.equal(a.hand.length,n+2);
 }else if(op.rule==='mana-all'||op.rule==='mana-colorless'){
  a.pool={W:1,U:2,B:0,R:0,G:0,C:0};b.pool={W:0,U:0,B:3,R:0,G:0,C:0};const restriction=()=>false;a.poolMeta=[{color:'U',n:1,restrict:restriction}];game.emptyPool();assert.deepEqual({...a.pool},op.rule==='mana-all'?{W:1,U:2,B:0,R:0,G:0,C:0}:{W:0,U:0,B:0,R:0,G:0,C:3});assert.equal(b.pool.B,op.rule==='mana-all'?3:0);assert.equal(a.poolMeta[0].restrict,restriction);assert.equal(a.poolMeta[0].color,op.rule==='mana-all'?'U':'C');await game.move(source,'exile');game.emptyPool();assert.equal(Object.values(a.pool).reduce((n,x)=>n+x,0),0);assert.equal(a.poolMeta.length,0);
 }else assert.fail('Unproved v18 rule '+op.rule);
 return 8;
}
