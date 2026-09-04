import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {fixtureEngine, context, put, settle} from './helpers/oracle-v8-fixtures.mjs';

const MTG=fixtureEngine([
  ['Random Discard Pair', 'Target opponent discards two cards at random.', 'Sorcery', '{B}{B}'],
  ['Random Discard Self', 'Discard two cards at random.', 'Sorcery', '{B}'],
  ...['Alpha','Beta','Gamma','Delta'].map(name=>[name,'','Creature — Bear','{G}']),
]);

for(const role of ['human','ai']){
  for(const self of [false,true]){
    test(`random discard ${role}: ${self?'own':'opponent'} hand uses seeded randomness without a card-choice prompt`,async()=>{
      async function run(){
        const ctx=context(MTG,role),victim=self?ctx.a:ctx.b,queries=[];
        const decide=victim.controller.decide.bind(victim.controller);
        victim.controller.decide=async(g,q)=>{queries.push(q);return decide(g,q);};
        for(const name of ['Alpha','Beta','Gamma','Delta'])put(MTG,ctx.game,victim,name,'hand');
        const card=put(MTG,ctx.game,ctx.a,self?'Random Discard Self':'Random Discard Pair','hand');
        ctx.a.pool={W:0,U:0,B:2,R:0,G:0,C:0};
        assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);
        assert.equal(victim.hand.length,4,'discard happens on resolution, after the paid cast');
        await settle(ctx.game);
        assert.equal(victim.hand.length,2);
        assert.equal(queries.some(q=>q.type==='chooseCards'),false,'neither controller selects the random cards');
        assert.equal(ctx.a.pool.B,self?1:0,'exact printed black cost paid');
        return victim.graveyard.filter(c=>c!==card).map(c=>c.name);
      }
      const first=await run(),second=await run();
      assert.equal(first.length,2);
      assert.deepEqual(first,second,'same game seed produces the same discarded cards');
    });
  }
  test(`random discard ${role}: a short or empty hand discards only available cards`,async()=>{
    const ctx=context(MTG,role),only=put(MTG,ctx.game,ctx.b,'Alpha','hand');
    for(let i=0;i<2;i++){
      const card=put(MTG,ctx.game,ctx.a,'Random Discard Pair','hand');
      ctx.a.pool={W:0,U:0,B:2,R:0,G:0,C:0};
      assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);
      await settle(ctx.game);
      assert.equal(ctx.b.hand.length,0);
      assert.equal(ctx.b.graveyard.length,1);
      assert.equal(ctx.b.graveyard[0],only);
    }
  });
}

test('random discard grammar retains exact quantity, target, and full-clause rejection',()=>{
  const card={name:'Random Probe',layout:'normal',type_line:'Sorcery',mana_cost:'{X}{B}'};
  const result=semanticClass({...card,oracle_text:'Target player discards X cards at random.'});
  assert.deepEqual(result.implementation[0].effects,[{action:'discard',who:0,n:'X',random:true}]);
  for(const oracle_text of ['Target opponent discards two cards at random unless they smile.',
    'Discard two cards at random and give them back.']){
    assert.equal(semanticClass({...card,oracle_text}).semanticClass,undefined);
  }
});
