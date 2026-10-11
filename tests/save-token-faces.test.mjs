import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {extensionEffect as predefinedTokenEffect} from '../scripts/oracle-v8-predefined-tokens.mjs';

const M=loadEngine();
function table() {
  const game=new M.Game({seed:921,paced:false});
  const controller={decide:async(_g,q)=>{
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='chooseTargets')return q.quickTarget?[q.quickTarget]:q.candidates.slice(0,q.min||1);
    if(q.type==='chooseX')return 1;
    if(q.type==='chooseOption')return q.options.find(option=>option.key==='no')?.key??q.options[0]?.key;
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    throw Error(`Unexpected token save choice: ${q.type}`);
  }};
  const player=game.addPlayer('Maker',{name:'Token save test'},controller,false);
  game.addPlayer('Witness',{name:'Token save witness'},controller,false);
  game.turnPlayer=player;game.turnNo=8;game.phase='main1';game.step='main';
  const put=(name,zone='battlefield')=>{
    const card=new M.CardInst(M.DEFS[name],player);card.zone=zone;card.sick=false;
    (zone==='battlefield'?game.battlefield:player[zone]).push(card);game.recalc();return card;
  };
  const cast=async(name,options={})=>{
    const card=put(name,'hand');assert.equal(await game.castSpell(player,card,{from:'hand',...options}),true);return card;
  };
  const restore=()=>{
    const snapshot=M.captureGameState(game);assert.ok(snapshot,M.gameStateSnapshotBlockers(game).join(', '));
    const next=table();M.restoreGameState(next.game,JSON.parse(JSON.stringify(snapshot)));return {...next,snapshot};
  };
  return {game,player,put,cast,restore};
}

test('a paid White Sun’s Zenith keeps its white Cat tokens through JSON save',async()=>{
  const f=table();for(let i=0;i<4;i++)f.put('Plains');
  await f.cast("White Sun's Zenith",{xVal:1});
  const cat=f.game.bf().find(card=>card.isToken&&card.hasSub('Cat'));
  assert.ok(cat);assert.deepEqual(Array.from(cat.colors),['W']);
  const next=f.restore(),restored=next.game.byIid(cat.iid);
  assert.deepEqual(Array.from(restored.colors),['W'],'a same-name green catalog Cat cannot replace the printed white token');
  assert.equal(restored.power,2);assert.equal(restored.toughness,2);
});

test('paid Trostani Discordant keeps the lifelink printed on its Soldier tokens after Continue',async()=>{
  const f=table();for(const name of ['Forest','Plains','Wastes','Wastes','Wastes'])f.put(name);
  await f.cast('Trostani Discordant');
  const soldiers=f.game.bf().filter(card=>card.isToken&&card.hasSub('Soldier'));
  assert.equal(soldiers.length,2);assert.ok(soldiers.every(card=>card.kw('lifelink')));
  const next=f.restore();
  for(const soldier of soldiers) {
    const restored=next.game.byIid(soldier.iid);
    assert.equal(restored.kw('lifelink'),true,'an ordinary Soldier cannot replace the lifelink token');
    assert.deepEqual(Array.from(restored.colors),['W']);
  }
});

for(const fixture of [
  {spell:"White Sun's Zenith",lands:['Plains','Plains','Plains','Plains'],subtype:'Cat',lifelink:false,options:{xVal:1}},
  {spell:'Trostani Discordant',lands:['Forest','Plains','Wastes','Wastes','Wastes'],subtype:'Soldier',lifelink:true,options:{}}
]) test(`a paid copy of ${fixture.spell}'s inline token keeps its face through Continue and another copy`,async()=>{
  const f=table();for(const name of fixture.lands)f.put(name);
  await f.cast(fixture.spell,fixture.options);
  const original=f.game.bf().find(card=>card.isToken&&card.hasSub(fixture.subtype));assert.ok(original);
  for(const name of ['Island','Island','Wastes'])f.put(name);
  await f.cast('Quasiduplicate',{quickTargets:[original]});
  const copy=f.game.bf().find(card=>card.isToken&&card!==original&&card.isCopyOf);
  assert.ok(copy);assert.equal(copy.name,original.name);
  const expected={power:original.power,toughness:original.toughness};
  const next=f.restore(),restored=next.game.byIid(copy.iid);
  assert.deepEqual(Array.from(restored.colors),['W']);
  assert.equal(restored.kw('lifelink'),fixture.lifelink);
  assert.equal(restored.power,expected.power);assert.equal(restored.toughness,expected.toughness);
  for(const name of ['Island','Island','Wastes'])next.put(name);
  const before=new Set(next.game.bf().map(card=>card.iid));
  await next.cast('Quasiduplicate',{quickTargets:[restored]});
  const recopied=next.game.bf().find(card=>card.isToken&&!before.has(card.iid));assert.ok(recopied);
  assert.deepEqual(Array.from(recopied.colors),['W']);
  assert.equal(recopied.kw('lifelink'),fixture.lifelink);
  assert.equal(recopied.power,expected.power);assert.equal(recopied.toughness,expected.toughness);
  assert.ok(next.restore().game.byIid(recopied.iid),'the next generation also produces a restorable checkpoint');
});

test('Triplicate Titan’s three native Golems retain their separate printed keywords after save',async()=>{
  const f=table();for(let i=0;i<9;i++)f.put('Wastes');
  const titan=await f.cast('Triplicate Titan');for(let i=0;i<3;i++)f.put('Swamp');
  await f.cast('Murder',{quickTargets:[titan]});
  const golems=f.game.bf().filter(card=>card.isToken&&card.hasSub('Golem'));
  assert.equal(golems.length,3);
  const expected=Array.from(golems,card=>({iid:card.iid,keywords:['flying','vigilance','trample'].filter(kw=>card.kw(kw))}));
  assert.deepEqual(expected.flatMap(row=>row.keywords).sort(),['flying','trample','vigilance']);
  const next=f.restore();
  for(const row of expected) {
    const restored=next.game.byIid(row.iid);
    assert.deepEqual(['flying','vigilance','trample'].filter(kw=>restored.kw(kw)),row.keywords);
    assert.equal(restored.is('Artifact'),true);assert.equal(restored.power,3);assert.equal(restored.toughness,3);
  }
});

test('Hofri’s linked Spirit retains the prior checkpoint until its added leave trigger resolves',async()=>{
  const f=table();for(const name of ['Plains','Mountain','Wastes','Wastes','Wastes'])f.put(name);
  await f.cast('Hofri Ghostforge');f.put('Forest');f.put('Wastes');
  const bear=await f.cast('Grizzly Bears');for(let i=0;i<3;i++)f.put('Swamp');
  await f.cast('Murder',{quickTargets:[bear]});
  const spirit=f.game.bf().find(card=>card.isToken&&card.name==='Grizzly Bears');
  assert.ok(spirit);assert.equal(bear.zone,'exile');
  assert.equal(M.captureGameState(f.game),null,'a checkpoint cannot drop the token’s linked leave trigger');
  assert.ok(M.gameStateSnapshotBlockers(f.game).includes('an unsupported token copy ability'),M.gameStateSnapshotBlockers(f.game).join(', '));
  await f.game.move(spirit,'exile');
  await f.game.flushTriggers();while(f.game.stack.length)await f.game.resolveTop();
  assert.equal(bear.zone,'graveyard','the replayed native Spirit trigger returns the original creature');
  assert.ok(M.captureGameState(f.game),'once the Spirit leaves, the board is portable again');
});

test('a copied Machine God’s Effigy retains the prior checkpoint for its added mana ability',async()=>{
  const f=table();f.put('Forest');f.put('Wastes');const bear=await f.cast('Grizzly Bears');
  const decide=f.player.controller.decide;
  f.player.controller.decide=async(g,q)=>q.type==='chooseCards'&&q.source?.name==="Machine God's Effigy"?[bear]:decide(g,q);
  for(let i=0;i<4;i++)f.put('Wastes');const effigy=await f.cast("Machine God's Effigy");
  for(let i=0;i<5;i++)f.put('Wastes');await f.cast('Replication Technique',{quickTargets:[effigy]});
  const copy=f.game.bf().find(card=>card.isToken&&card.name==='Grizzly Bears');
  assert.ok(copy);assert.equal(copy.is('Artifact'),true);assert.equal(copy.is('Creature'),false);
  assert.ok(f.game.manaSources(f.player).some(source=>source.card===copy),'the native copy can produce blue mana');
  f.put('Plains');f.put('Wastes');await f.cast('Disenchant',{quickTargets:[effigy]});
  assert.equal(effigy.zone,'graveyard','remove the non-token copy to isolate the token checkpoint');
  assert.equal(M.captureGameState(f.game),null,'a checkpoint cannot drop the copied artifact’s added mana ability');
  assert.ok(M.gameStateSnapshotBlockers(f.game).includes('an unsupported token copy ability'),M.gameStateSnapshotBlockers(f.game).join(', '));
});

test('a native Hostility token keeps its catalog damage replacement across a snapshot',async()=>{
  const f=table();for(const name of ['Mountain','Mountain','Mountain','Wastes','Wastes','Wastes'])f.put(name);
  const hostility=await f.cast('Hostility');for(const name of ['Island','Island','Wastes'])f.put(name);
  await f.cast('Quasiduplicate',{quickTargets:[hostility]});
  const copy=f.game.bf().find(card=>card.isToken&&card.name==='Hostility');assert.ok(copy);
  assert.ok(Array.isArray(copy.def.replace)&&copy.def.replace.length>0);
  const next=f.restore();next.put('Mountain');
  await next.cast('Lightning Bolt',{quickTargets:[next.game.players[1]]});
  assert.equal(next.game.players[1].life,40,'catalog token replacements still prevent damage after Continue');
  assert.equal(next.game.bf().filter(card=>card.isToken&&card.hasSub('Shaman')).length,3);
});

test('a paid Datasmith activation cannot lose its Robot’s blocking restriction in a snapshot',async()=>{
  const f=table(),smith=f.put('Cybernetica Datasmith');f.put('Island');f.put('Forest','library');
  const ability=f.game.activatableList(f.player).find(entry=>entry.card===smith&&entry.ability);
  assert.ok(ability);assert.equal(await f.game.activateAbility(f.player,ability,[f.player,f.game.players[1]]),true);
  const robot=f.game.bf().find(card=>card.isToken&&card.hasSub('Robot'));assert.ok(robot);
  assert.equal(robot.cur.cantBlock,true);
  assert.equal(M.captureGameState(f.game),null,'saved inline token bodies must not silently drop native rules');
  assert.ok(M.gameStateSnapshotBlockers(f.game).includes('an unsupported inline token ability'));
  await f.game.move(robot,'exile');
  assert.ok(M.captureGameState(f.game),'once the inline Robot leaves, the board is portable again');
});

test('Freyalise’s catalog Elf Druid keeps its native mana ability and artwork after save',async()=>{
  const f=table();for(let i=0;i<5;i++)f.put('Forest');
  const freyalise=await f.cast("Freyalise, Llanowar's Fury");
  const ability=f.game.activatableList(f.player).find(entry=>entry.card===freyalise&&entry.ability?.loyalty===2);
  assert.ok(ability);assert.equal(await f.game.activateAbility(f.player,ability),true);
  const elf=f.game.bf().find(card=>card.isToken&&card.hasSub('Elf'));assert.ok(elf);
  const next=f.restore(),restored=next.game.byIid(elf.iid);
  assert.equal(restored.def.mana,M.TOKENS.c14ElfDruid.mana);
  assert.equal(restored.def.tokenImageName,elf.def.tokenImageName);
});

test('paid Break Down creates a portable Junk token whose native activation still grants a paid spell after Continue',async()=>{
  const f=table();for(let i=0;i<3;i++)f.put('Forest');
  const artifact=f.put('Sol Ring');await f.cast('Break Down',{quickTargets:[artifact]});
  const junk=f.game.bf().find(card=>card.isToken&&card.hasSub('Junk'));assert.ok(junk);
  const next=f.restore(),restored=next.game.byIid(junk.iid),top=next.put('Lightning Bolt','library');
  const action=next.game.activatableList(next.player).find(row=>row.card===restored);assert.ok(action);
  assert.equal(await next.game.activateAbility(next.player,action),true);
  assert.equal(restored.zone,'ceased');assert.equal(top.zone,'exile');assert.equal(top.meta.playableBy,next.player);
  next.put('Mountain');const rival=next.game.players[1],life=rival.life;
  assert.equal(await next.game.castSpell(next.player,top,{from:'exile',quickTargets:[rival]}),true);
  assert.equal(top.castMeta.manaSpent,1);assert.equal(rival.life,life-3);
});

test('a same-name Junk with a different compiled ability cannot borrow the predefined token’s saved identity',async()=>{
  const f=table(),recipe=structuredClone(predefinedTokenEffect({},'Create a Junk token.',{}).effects[0].token);
  recipe.operations[0].effects[0].n=2;
  const definition=M.OracleV20.helpers.genericInlineToken(recipe);
  const [junk]=await f.game.makeTokens(definition,f.player);
  const first=f.put('Forest','library'),second=f.put('Island','library');
  assert.equal(M.captureGameState(f.game),null,'matching the visible name and text cannot erase different executable rules');
  assert.ok(M.gameStateSnapshotBlockers(f.game).includes('an unsupported inline token ability'));
  const action=f.game.activatableList(f.player).find(row=>row.card===junk);assert.ok(action);
  assert.equal(await f.game.activateAbility(f.player,action),true);
  assert.equal(first.zone,'exile');assert.equal(second.zone,'exile','the altered native activation really exiles two cards');
  assert.ok(M.captureGameState(f.game),'the unsupported rule ceases to block checkpoints when its token leaves');
});

test('predefined Junk reuse rejects extra callable or undefined recipe fields and different printed faces',async()=>{
  for(const change of [recipe=>{recipe.extra=()=>1;},recipe=>{recipe.extra=undefined;},
    recipe=>{Object.defineProperty(recipe,'__proto__',{value:undefined});},
    recipe=>{recipe.operations[0].extra=undefined;},recipe=>{recipe.colors=['R'];},recipe=>{recipe.keywords=['indestructible'];}]) {
    const f=table(),recipe=structuredClone(predefinedTokenEffect({},'Create a Junk token.',{}).effects[0].token);change(recipe);
    const [token]=await f.game.makeTokens(M.OracleV20.helpers.genericInlineToken(recipe),f.player);
    assert.notEqual(token.def,M.TOKENS.junk,'only the complete predefined recipe may reuse catalog callbacks');
    assert.equal(M.captureGameState(f.game),null,'unrecognized inline callbacks keep the prior checkpoint');
    if(recipe.colors.length)assert.deepEqual(Array.from(token.colors),['R']);
    if(recipe.keywords.length)assert.equal(token.kw('indestructible'),true);
  }
});
