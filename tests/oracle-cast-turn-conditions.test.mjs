import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
const cards=['Eyes of the Wisent','Hermit of the Natterknolls // Lone Wolf of the Natterknolls'];

for(const role of ['human','ai'])for(const name of cards){
 test(`${name}: opponent casting on your turn is distinct from opponent turn or your own cast/${role}`,async()=>{
  for(const scenario of ['opponent-on-your-turn','opponent-on-own-turn','your-own-cast']){
   const ctx=context(M,role),{game,a,b}=ctx;
   const source=put(M,game,a,name,'hand');
   a.pool.G=1;a.pool.C=2;
   const printed=M.parseCost(source.def.cost),initialMana=Object.values(a.pool).reduce((sum,n)=>sum+n,0);
   assert.equal(await game.castSpell(a,source,{from:'hand'}),true,'source uses its actual paid hand cast');
   assert.equal(initialMana-Object.values(a.pool).reduce((sum,n)=>sum+n,0),printed.generic+printed.pips.length);
   await settle(game);assert.equal(source.zone,'battlefield');

   const caster=scenario==='your-own-cast'?a:b;
   game.turnPlayer=scenario==='opponent-on-own-turn'?b:a;
   const opt=put(M,game,caster,'Opt','hand');caster.pool.U=1;
   const libraryBefore=a.library.length,tokensBefore=game.bf().filter(card=>card.ctrl===a&&card.isToken).length;
   assert.equal(await game.castSpell(caster,opt,{from:'hand'}),true,'real blue instant can be paid during either player\'s turn');
   assert.equal(caster.pool.U,0,'Opt pays its printed blue mana');
   assert.ok(game.stack.some(object=>object.card===opt&&object.kind==='spell'));
   await game.flushTriggers();
   const positive=scenario==='opponent-on-your-turn';
   assert.equal(game.stack.filter(object=>object.kind==='trigger'&&object.srcCard===source).length,positive?1:0,
     scenario+': the real cast event respects both caster and active player');
   await settle(game);

   const expectedDraw=(caster===a?1:0)+(positive&&name!==cards[0]?1:0);
   assert.equal(a.library.length,libraryBefore-expectedDraw,scenario+': only the printed draw and own Opt change your library');
   const tokens=game.bf().filter(card=>card.ctrl===a&&card.isToken);
   assert.equal(tokens.length,tokensBefore+(positive&&name===cards[0]?1:0),scenario+': token trigger requires both conditions');
   if(positive&&name===cards[0]){
    const token=tokens.at(-1);assert.equal(token.power,4);assert.equal(token.toughness,4);
    assert.ok(token.hasSub('Elemental'));assert.ok(token.colors.includes('G'));
   }
   assertGameStateInvariants(game,name+'/'+role+'/'+scenario);
  }
 });
}
