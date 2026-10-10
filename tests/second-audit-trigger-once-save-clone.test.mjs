import test from 'node:test';
import assert from 'node:assert/strict';
import {M,nativeFixture} from './helpers/second-trigger-fixtures.mjs';

async function nativeCast(game,player,name,lands=[]){
 const put=(cardName,zone)=>{const card=new M.CardInst(M.DEFS[cardName],player);card.zone=zone;card.sick=false;(zone==='battlefield'?game.battlefield:player[zone]).push(card);return card;};
 for(const land of lands)put(land,'battlefield');const card=put(name,'hand');game.recalc();
 assert.equal(await game.castSpell(player,card,{from:'hand'}),true);assert.equal(card.castMeta.manaSpent,lands.length);
 for(let i=0;i<80;i++){await game.flushTriggers();if(!game.stack.length)return card;await game.resolveTop();}
 assert.fail('native restored/cloned stack must settle');
}
for(const role of ['human','ai'])for(const mode of ['save','clone'])test(`${role}: native ${mode} retains each controller's earned Iron Man action record`,async()=>{
 const f=nativeFixture(role),orrery=await f.cast('Vedalken Orrery',Array(4).fill('Wastes'));
 const source=await f.cast('Iron Man, Bleeding Edge',['Island','Island','Wastes','Wastes','Wastes']);
 await f.cast('Ornithopter',[]);assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.name==='Ornithopter').length,1);
 let game,choices=f;
 if(mode==='save'){
  const state=M.captureGameState(f.game);assert.ok(state,M.gameStateSnapshotBlockers(f.game).join(', '));
  const next=nativeFixture(role);M.restoreGameState(next.game,JSON.parse(JSON.stringify(state)));game=next.game;choices=next;
  assert.equal(M.gameStateFingerprint(game),M.gameStateFingerprint(f.game));
 }else game=M.cloneGameForAISimulation(f.game,551);
 const me=game.players[0],rival=game.players[1],iron=game.byIid(source.iid);assert.ok(iron);assert.equal(iron.zoneVersion,source.zoneVersion);
 const flash=game.byIid(orrery.iid);assert.ok(flash);
 choices.targets=q=>q.candidates.includes(flash)?[flash]:q.candidates.includes(rival)?[rival]:undefined;
 await nativeCast(game,me,'Donate',['Island','Wastes','Wastes']);assert.equal(flash.ctrl,rival);
 await nativeCast(game,me,'Ornithopter');assert.equal(game.creatures(me).filter(c=>c.isToken&&c.name==='Ornithopter').length,1,'the first controller remains used after the native round trip');
 choices.targets=q=>q.candidates.includes(iron)?[iron]:undefined;
 const aura=await nativeCast(game,rival,'Confiscate',['Island','Island','Wastes','Wastes','Wastes','Wastes']);assert.equal(iron.ctrl,rival);
 await nativeCast(game,rival,'Ornithopter');assert.equal(game.creatures(rival).filter(c=>c.isToken&&c.name==='Ornithopter').length,1,'the unused controller may take its own action after the round trip');
 choices.targets=q=>q.candidates.includes(aura)?[aura]:undefined;
 await nativeCast(game,me,'Disenchant',['Plains','Wastes']);assert.equal(iron.ctrl,me);
 await nativeCast(game,me,'Ornithopter');assert.equal(game.creatures(me).filter(c=>c.isToken&&c.name==='Ornithopter').length,1,'returning control preserves the first earned use');
 if(mode==='clone')assert.equal(source.ctrl,f.me,'simulation does not change live source control');
});
