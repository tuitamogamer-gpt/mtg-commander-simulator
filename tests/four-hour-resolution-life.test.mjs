import test from 'node:test';
import assert from 'node:assert/strict';
import {table, paidCast, stable} from './helpers/second-audit-combat-fixtures.mjs';

for(const name of ['Corpses of the Lost','Elenda and Azor'])for(const pay of [true,false])test(`${name} native end step ${pay?'pays its exact life cost':'declines without spending life'}`,async()=>{
  const f=table(),{g,a}=f,corpses=name==='Corpses of the Lost';
  f.lands(corpses?['Swamp','Wastes','Wastes']:['Plains','Island','Swamp','Wastes','Wastes','Wastes']);
  const source=f.put(name,'hand');await paidCast(f,a,source);
  if(corpses){
    const card=f.put('Forest','hand');await g.discard(a,[card]);
    assert.ok(a.turnState.descended>0,'native permanent-card discard enables descent');
  }else{
    await g.draw(a,2,source);
    assert.equal(a.turnState.drewThisTurn,2,'native draws determine the Vampire count');
  }
  const receipts=[],nativePay=g.payLifeV92;
  g.payLifeV92=async function(player,n,...args){
    const before=player.life,receipt=await nativePay.call(this,player,n,...args);
    receipts.push({player,n,before,after:player.life,receipt});return receipt;
  };
  f.option=(player,q)=>q.prompt===name+': pay for the following effect?'
    ?pay?q.options.find(row=>row.key!=='no').key:'no'
    :q.options.find(row=>row.key==='yes')?.key??q.options[0]?.key;
  const life=a.life;
  await g.runEndStepV90(a);
  assert.equal(a.life,life-(pay?(corpses?1:4):0));
  assert.equal(receipts.length,pay?1:0);
  if(pay){
    const receipt=receipts[0];assert.ok(receipt.player===a);
    assert.equal(receipt.n,corpses?1:4);
    assert.equal(receipt.receipt.paid,receipt.n);assert.equal(receipt.receipt.lifePaid,receipt.n);
    assert.equal(receipt.receipt.exiled,0);assert.equal(receipt.before-receipt.after,receipt.n);
  }
  if(corpses)assert.equal(source.zone,pay?'hand':'battlefield');
  else{
    const tokens=g.creatures(a).filter(card=>card.isToken&&card.hasSub('Vampire')&&card.hasSub('Knight'));
    assert.equal(tokens.length,pay?2:0);
    for(const token of tokens){assert.equal(token.power,1);assert.equal(token.toughness,1);assert.equal(token.kw('lifelink'),true);}
  }
  stable(f,name+' end-step life payment');
});
