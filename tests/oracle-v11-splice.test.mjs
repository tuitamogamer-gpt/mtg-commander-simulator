import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const sources=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v11-splice.json',import.meta.url),'utf8'));
const M=loadEngine();
const absent=sources.filter(card=>!M.DEFS[card.name]);
if(absent.length)M.registerOracleBatch(createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9923,limit:absent.length,compilerVersion:11}).report);
M.initData(M.RAW_DATA);
const fund=p=>{for(const color of Object.keys(p.pool))p.pool[color]=20;};
const total=p=>Object.values(p.pool).reduce((a,b)=>a+b,0);
function carrier(f,{arcane=true,cost='{U}',resolve=ctx=>ctx.g.draw(ctx.you,1),targets}={}){
  const card=new M.CardInst({name:'Splice carrier',cost,types:['Instant'],subtypes:arcane?['Arcane']:[],super:[],kws:[],oracle:'Draw a card.',resolve,...(targets?{targets}:{})},f.a);
  card.zone='hand';f.a.hand.push(card);return card;
}
function select(f,names,target){
  const choose=f.a.controller.decide.bind(f.a.controller),selected=[];
  f.a.controller.decide=(g,q)=>{
    if(q.aiHint?.kind==='splice-v11'){
      const name=names.find(name=>!selected.includes(name)),option=q.options.find(option=>option.card?.name===name);
      if(!option)return 'done';selected.push(name);return option.key;
    }
    if(q.type==='chooseTargets'&&target&&q.candidates.includes(target))return [target];
    return choose(g,q);
  };
  return selected;
}

test('splice remains additive and rejects unknown splice costs and unknown effect text',()=>{
  for(const source of sources){
    assert.ok(semanticClass(source,{compilerVersion:11}).semanticClass,source.name);
    assert.equal(semanticClass({...source,oracle_text:source.oracle_text+'\nUnsupported effect.'},{compilerVersion:11}).semanticClass,undefined);
    assert.equal(semanticClass(source,{compilerVersion:10}).semanticClass,undefined);
  }
  const base=sources.find(c=>c.name==='Everdream');
  assert.equal(semanticClass({...base,oracle_text:'Draw a card.\nSplice onto instant or sorcery {X}{U}'},{compilerVersion:11}).semanticClass,undefined);
});

for(const role of ['human','ai']){
  test(role+': a spliced spell pays the combined cost, keeps the revealed card and draws through a copy',async()=>{
    const f=context(M,role),{game,a}=f,spell=carrier(f),extra=put(M,game,a,'Everdream','hand');fund(a);
    const selected=select(f,['Everdream']),reveals=[];game.revealToHuman=async q=>reveals.push(q);
    const mana=total(a);assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);
    const so=game.stack.at(-1);assert.equal(mana-total(a),4);assert.deepEqual(selected,['Everdream']);
    assert.equal(extra.zone,'hand');assert.equal(reveals.length,1);assert.equal(reveals[0].cards[0],extra);
    assert.equal(so.oracleSpliceV11.parts.length,1);assert.equal(game.stackSpellManaValue(so),1);
    const copy=await game.copySpell(so,a,{mayNewTargets:false});assert.equal(copy.oracleSpliceV11.parts[0].name,'Everdream');
    await game.move(extra,'exile');const hand=a.hand.length;await settle(game);
    assert.equal(a.hand.length,hand+4);assert.equal(extra.zone,'exile');assert.equal(spell.zone,'graveyard');assertGameStateInvariants(game);
  });
  test(role+': added damage uses the original spell as its source, including its color',async()=>{
    const f=context(M,role),{game,a,b}=f,spell=carrier(f),extra=put(M,game,a,'Glacial Ray','hand');fund(a);select(f,['Glacial Ray'],b);
    const hits=[],damage=game.damageAny;game.damageAny=async function(source,target,n,...rest){hits.push({source,target,n});return damage.call(this,source,target,n,...rest);};
    const life=b.life;assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);
    assert.equal(b.life,life-2);assert.equal(hits.length,1);assert.equal(hits[0].source,spell);assert.equal(hits[0].target,b);
    assert.equal(spell.colors.includes('U'),true);assert.equal(spell.colors.includes('R'),false);assert.equal(extra.zone,'hand');assertGameStateInvariants(game);
  });
  test(role+': an added target can make the whole spell fizzle',async()=>{
    const f=context(M,role),{game,a,b}=f,spell=carrier(f),extra=put(M,game,a,'Glacial Ray','hand'),target=put(M,game,b,'Runeclaw Bear');fund(a);select(f,['Glacial Ray'],target);
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await game.move(target,'exile');const hand=a.hand.length;
    await settle(game);assert.equal(a.hand.length,hand);assert.equal(spell.zone,'graveyard');assert.equal(extra.zone,'hand');assertGameStateInvariants(game);
  });
  test(role+': an illegal original target does not stop a legal spliced target',async()=>{
    const f=context(M,role),{game,a,b}=f,spell=put(M,game,a,"Kodama's Might",'hand'),extra=put(M,game,a,'Glacial Ray','hand'),target=put(M,game,a,'Runeclaw Bear');fund(a);
    const choose=a.controller.decide.bind(a.controller);let targets=0;
    a.controller.decide=(g,q)=>q.aiHint?.kind==='splice-v11'?q.options.find(o=>o.card===extra)?.key||'done':q.type==='chooseTargets'?[(targets++===0?target:b)]:choose(g,q);
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await game.move(target,'exile');const life=b.life;await settle(game);
    assert.equal(b.life,life-2);assert.equal(extra.zone,'hand');assertGameStateInvariants(game);
  });
  test(role+': the player chooses splice order, each physical card is available only once',async()=>{
    const f=context(M,role),{game,a}=f,spell=carrier(f),draw=put(M,game,a,'Evermind','hand'),mana=put(M,game,a,'Desperate Ritual','hand');fund(a);
    select(f,['Desperate Ritual','Evermind']);const reveals=[];game.revealToHuman=async q=>reveals.push(q);
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);const so=game.stack.at(-1);
    assert.equal(JSON.stringify(so.oracleSpliceV11.parts.map(p=>p.name)),JSON.stringify(['Desperate Ritual','Evermind']));
    assert.equal(reveals.length,1);assert.equal(reveals[0].cards.length,2);
    const events=[],originalDraw=game.draw;game.draw=async function(p,n,...rest){events.push({n,red:p.pool.R});return originalDraw.call(this,p,n,...rest);};
    const red=a.pool.R;await settle(game);assert.equal(events.length,2);assert.equal(events[0].red,red);assert.equal(events[1].red,red+3);
    assert.equal(draw.zone,'hand');assert.equal(mana.zone,'hand');assertGameStateInvariants(game);
  });
  test(role+': ineligible or unaffordable splice is not offered and free casting still pays splice',async()=>{
    for(const mode of ['nonarcane','poor','free']){
      const f=context(M,role),{game,a}=f,spell=carrier(f,{arcane:mode!=='nonarcane'}),name=mode==='free'?'Everdream':'Evermind',extra=put(M,game,a,name,'hand');
      for(const color of Object.keys(a.pool))a.pool[color]=0;a.pool.U=1;if(mode==='free')a.pool.C=2;
      const picked=select(f,[name]);const mana=total(a);
      assert.equal(await game.castSpell(a,spell,mode==='free'?{from:'hand',free:true}:{from:'hand'}),true);
      assert.equal(picked.length,mode==='free'?1:0);assert.equal(mana-total(a),mode==='free'?3:1);await settle(game);assert.equal(extra.zone,'hand');assertGameStateInvariants(game);
    }
  });
  test(role+': cancelled target choices and stale hand objects consume no mana or cards',async()=>{
    for(const mode of ['cancel','stale']){
      const f=context(M,role),{game,a,b}=f,spell=carrier(f),extra=put(M,game,a,'Glacial Ray','hand');fund(a);let reveal=0;game.revealToHuman=async()=>{reveal++;};
      const choose=a.controller.decide.bind(a.controller);
      a.controller.decide=async(g,q)=>{
        if(q.aiHint?.kind==='splice-v11')return q.options.find(o=>o.card===extra)?.key||'done';
        if(q.type==='chooseTargets'){if(mode==='stale'){await game.move(extra,'exile');return [b];}return null;}
        return choose(g,q);
      };
      const mana=total(a);assert.equal(await game.castSpell(a,spell,{from:'hand'}),false);assert.equal(total(a),mana);assert.equal(spell.zone,'hand');assert.equal(reveal,0);assert.equal(game.stack.length,0);assertGameStateInvariants(game);
    }
  });
  test(role+': a spell that returns a target does not let its spliced pump follow the new zone object',async()=>{
    const f=context(M,role),{game,a,b}=f,spell=put(M,game,a,'Consuming Vortex','hand'),extra=put(M,game,a,"Kodama's Might",'hand'),target=put(M,game,b,'Runeclaw Bear');fund(a);select(f,[extra.name],target);
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);
    assert.equal(target.zone,'hand');assert.equal(target.power,2);assert.equal(extra.zone,'hand');assertGameStateInvariants(game);
  });
}

test('local AI chooses an affordable useful splice and simulation copies preserve its text',async()=>{
  const f=context(M,'ai'),{game,a}=f,spell=carrier(f),extra=put(M,game,a,'Everdream','hand');fund(a);
  assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);assert.equal(game.stack.at(-1).oracleSpliceV11.parts[0].name,'Everdream');
  const copy=M.cloneGameForAISimulation(game,11811),clonePlayer=copy.players[a.idx],hand=clonePlayer.hand.length;
  await copy.resolveTop();assert.equal(clonePlayer.hand.length,hand+2);assert.equal(game.stack.length,1);assert.equal(extra.zone,'hand');
  await settle(game);assertGameStateInvariants(copy);assertGameStateInvariants(game);
});
