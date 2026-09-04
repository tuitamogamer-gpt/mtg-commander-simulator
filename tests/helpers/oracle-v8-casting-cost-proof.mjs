import assert from 'node:assert/strict';
import {ORACLE_SUBTYPE_TYPES} from '../../scripts/oracle-subtypes.mjs';

// Stage each printed fixed quantity, including every branch so either human
// or the genuine local AI can choose a legal additional payment.
export function stageOracleCastingCosts(MTG,ctx,entry,h) {
  const fixtures=[];
  const stage=cost=>{
    if(cost.kind==='payLife') {
      if(cost.amount?.kind==='number')ctx.a.life=Math.max(ctx.a.life,cost.amount.value+10);
      return;
    }
    if(cost.options || cost.costs) {
      for(const child of cost.options||cost.costs)stage(child);
      return;
    }
    if(!['sacrifice','discard','exileGraveyard','returnPermanent','exileHand'].includes(cost.kind))return;
    const object=cost.object||{},q=object.qualifier||{};
    const allowed=(object.types||['Creature']).filter(type=>!(q.notTypes||[]).includes(type));
    assert.ok(allowed.length,'a staged casting cost has a satisfiable type');
    let types=object.typeMatch==='all'?allowed:[allowed[0]];
    if(q.subtypes?.length) {
      const word=ORACLE_SUBTYPE_TYPES[q.subtypes[0]]||'creature',type=word[0].toUpperCase()+word.slice(1);
      if(!object.types||object.types.includes(type))types=[type];
    }
    const zone=['discard','exileHand'].includes(cost.kind)?'hand':cost.kind==='exileGraveyard'?'graveyard':'battlefield';
    for(let i=0;i<cost.quantity.min;i++) {
      const options={super:[...new Set(['Legendary',...(q.supertypes||[])])],
        subtypes:q.subtypes||[],colorsOverride:q.colors||[],power:'0',toughness:'20'};
      const definition=h.fixtureDefinition('Oracle casting cost '+cost.id+' '+fixtures.length,types,options);
      const card=zone==='battlefield'?h.permanent(MTG,ctx.game,ctx.a,definition):h.zoneCard(MTG,ctx.a,definition,zone);
      if(q.tapped)card.tapped=true;
      if(q.unblockedAttacker){
        ctx.game.combat||={attackers:[],defenders:new Map()};
        card.attacking=ctx.b;card.blockedBy=[];card.wasBlocked=false;card.tapped=true;
        ctx.game.combat.attackers.push(card);
      }
      fixtures.push(card);
    }
  };
  for(const operation of entry.implementation||[])if(operation.kind==='mechanic-additional-costs'||operation.kind==='mechanic-keyword-payment-v8'&&operation.keyword!=='flashback')
    for(const cost of operation.costs)stage(cost);
  for(const operation of entry.implementation||[])if(operation.kind==='mechanic-casting-choice-v8')for(const option of operation.options){
    if(option.kind==='cost')option.costs.forEach(stage);
    else if(option.kind!=='mana')stage({id:'choice-'+option.kind,kind:option.kind==='revealHand'?'discard':'sacrifice',quantity:{min:1,max:1},object:option.object||{kind:'permanent',types:['Creature']}});
  }
  return fixtures;
}

export async function proveOracleCastingChoice(MTG,ctx,entry,operation,source,h){
 const {game,a}=ctx,reveals=[],reveal=game.revealToHuman;
 game.revealToHuman=async function(event,...args){reveals.push(event);return reveal.call(this,event,...args);};
 const cards=[...game.bf(),...a.hand.filter(card=>card!==source),...a.graveyard],before=new Map(cards.map(card=>[card.iid,{card,zone:card.zone,version:card.zoneVersion,counters:card.counters['-1/-1']||0,tapped:card.tapped}]));
 const base=game.spellCost(a,source,{from:'hand'});
 assert.ok(game.castableList(a).some(row=>row.card===source),entry.raw.name+': complete mandatory choice is payable');
 assert.equal(await game.castSpell(a,source,{from:'hand'}),true,entry.raw.name+': actual cast pays its mandatory choice');
 const stack=game.stack.find(row=>row.card===source),record=stack?.oracleCastingChoicePaid;assert.ok(record,entry.raw.name+': selected additional choice is recorded before Stack');
 const selected=operation.options[record.index];assert.ok(selected,entry.raw.name+': paid branch is printed');assert.equal(record.kind,selected.kind);
 if(selected.kind==='cost')assertOracleCastingCostRecord(source,stack,{implementation:[{kind:'mechanic-additional-costs',costs:selected.costs}]},cards);
 else if(selected.kind==='mana'){
  const extra=MTG.parseCost(selected.cost);assert.equal(record.cost,selected.cost);
  assert.ok(stack.manaSpent>=Math.max(0,base.generic+extra.generic-(base.xReduction||0))+base.pips.length+extra.pips.length,entry.raw.name+': chosen extra mana is actually spent');
 }else{
  const old=before.get(record.iid);assert.ok(old,entry.raw.name+': chosen payment is a real prior object');assert.equal(old.version,record.zoneVersion);
  if(selected.kind==='revealHand'){assert.equal(old.zone,'hand');assert.equal(old.card.zone,'hand');assert.ok(reveals.some(event=>event.cards?.includes(old.card)),entry.raw.name+': exact hand card was publicly revealed');}
  else if(selected.kind==='tapPermanent'){assert.equal(old.zone,'battlefield');assert.equal(old.tapped,false);assert.equal(old.card.tapped,true);}
  else if(selected.kind==='blight'){assert.equal(old.zone,'battlefield');assert.equal(old.card.counters['-1/-1']||0,old.counters+selected.n);}
  else {assert.equal(selected.kind,'beholdPermanent');assert.equal(old.zone,'battlefield');assert.equal(old.card.zone,'battlefield');}
 }
 await h.resolveAll(game);return 7;
}

export function assertOracleCastingCostRecord(source,stackObject,entry,fixtures) {
  const record=stackObject?.oracleV4AdditionalCost;
  assert.ok(record,source.name+': actual additional payment is recorded on the Stack');
  const ids=[...(record.sacrifices||[]).map(row=>row.iid),...(record.discards||[]),...(record.exiles||[]),...(record.returns||[]),...(record.handExiles||[])];
  assert.equal(new Set(ids).size,ids.length,source.name+': one object cannot pay two additional costs');
  if(entry) {
    const expected={sacrifices:0,discards:0,exiles:0,returns:0,handExiles:0,life:0};
    const count=cost=>{
      if(cost.kind==='sequence')return cost.costs.forEach(count);
      if(cost.kind==='choice') {
        const picked=(record.choices||[]).find(choice=>choice.costId===cost.id);
        const selected=cost.options.find(option=>option.id===picked?.optionId);
        assert.ok(selected,source.name+': paid choice identifies a real cost branch');
        return count(selected);
      }
      if(cost.kind==='payLife') {
        const amount=node=>{
          if(node.kind==='number')return node.value;
          if(node.kind==='variable') {
            assert.equal(node.name,'X',source.name+': variable life uses the announced X');
            assert.ok(Number.isInteger(stackObject.x)&&stackObject.x>=0,source.name+': Stack records a valid chosen X');
            return stackObject.x;
          }
          assert.equal(node.kind,'multiply',source.name+': known life amount expression');
          return node.operands.reduce((value,operand)=>value*amount(operand),1);
        };
        expected.life+=amount(cost.amount);return;
      }
      const key={sacrifice:'sacrifices',discard:'discards',exileGraveyard:'exiles',returnPermanent:'returns',exileHand:'handExiles'}[cost.kind];
      assert.ok(key,source.name+': proof knows the additional cost kind');
      assert.equal(cost.quantity.min,cost.quantity.max,source.name+': proof requires a fixed printed quantity');
      expected[key]+=cost.quantity.min;
    };
    for(const operation of entry.implementation||[])if(operation.kind==='mechanic-additional-costs')operation.costs.forEach(count);
    for(const key of ['sacrifices','discards','exiles','returns','handExiles'])
      assert.equal((record[key]||[]).length,expected[key],source.name+': exact '+key+' additional payment');
    assert.equal(record.life,expected.life,source.name+': exact life additional payment');
  }
  if(fixtures) {
    const staged=new Map(fixtures.map(card=>[card.iid,card]));
    for(const id of ids)assert.ok(staged.has(id),source.name+': payment consumes a staged legal cost object');
    for(const row of record.sacrifices||[])assert.notEqual(staged.get(row.iid).zone,'battlefield',source.name+': sacrifice left the battlefield');
    for(const id of record.discards||[])assert.notEqual(staged.get(id).zone,'hand',source.name+': discarded card left hand');
    for(const id of record.exiles||[])assert.equal(staged.get(id).zone,'exile',source.name+': graveyard payment reached exile');
    for(const id of record.handExiles||[])assert.equal(staged.get(id).zone,'exile',source.name+': hand payment reached exile');
    for(const id of record.returns||[])assert.equal(staged.get(id).zone,'hand',source.name+': returned payment reached hand');
  }
  return record;
}

// Called after the normal mechanic harness stages the source's targets and
// mandatory costs. Only the selected alternative adds optional-cost fixtures.
export async function proveOracleAlternativeCastingCost(MTG,ctx,entry,operation,source,h) {
  const {game,a}=ctx;
  const payment={kind:'mechanic-additional-costs',costs:operation.costs};
  const paymentFixtures=stageOracleCastingCosts(MTG,ctx,{implementation:[payment]},h);
  if(operation.sneak){game.turnPlayer=a;game.phase='combat';game.step='blockers';}
  if(operation.emerge){
    for(const card of paymentFixtures)card.def.cost='{3}';
    game.recalc();
  }
  if(operation.condition) {
    assert.equal(typeof h.stageCondition,'function','alternative proof needs condition staging');
    h.stageCondition(MTG,ctx,operation.condition,source,h);
  }
  const canonical=(source.def.altCosts||[]).find(option=>option.oracleAlternativeCost&&
    option.altCostStr===operation.mana&&JSON.stringify(option.oracleAdditionalCosts)===JSON.stringify(operation.costs));
  assert.ok(canonical,entry.raw.name+': registered alternative is available');
  if(operation.emerge){
    const preview=game.spellCost(a,source,{...canonical,from:'hand'});
    a.pool={W:0,U:0,B:0,R:0,G:0,C:Math.max(0,preview.generic-(preview.xReduction||0)-3)};
    for(const pip of preview.pips||[])a.pool[pip[0]]++;
  }
  const listed=game.castableList(a).find(row=>row.card===source&&row.alt?.oracleAlternativeId===canonical.oracleAlternativeId);
  assert.ok(listed,entry.raw.name+': engine lists the payable alternative with real condition');
  const legalObjects=[...a.hand.filter(card=>card!==source),...a.graveyard,...game.bf()];
  const before=new Map(legalObjects.map(card=>[card.iid,{zone:card.zone,version:card.zoneVersion}]));
  const life=a.life,mana=Object.values(a.pool).reduce((sum,n)=>sum+n,0);
  const expectedCost=game.spellCost(a,source,{...canonical,from:'hand'});
  assert.equal(await game.castSpell(a,source,{from:'hand',alt:listed.alt}),true,entry.raw.name+': actual alternative cast succeeds');
  assert.equal(source.zone,'stack',entry.raw.name+': complete alternative payment precedes Stack');
  const stack=game.stack.find(object=>object.card===source);
  const selectedEntry={...entry,implementation:[...entry.implementation.filter(op=>op.kind==='mechanic-additional-costs'),payment]};
  const record=assertOracleCastingCostRecord(source,stack,selectedEntry,legalObjects);
  assert.equal(life-a.life,record.life,entry.raw.name+': the recorded life was really paid');
  const paidMana=mana-Object.values(a.pool).reduce((sum,n)=>sum+n,0);
  const emerge=operation.emerge?stack.oracleEmergePayment:null;
  if(operation.emerge){
    assert.ok(emerge&&emerge.manaValue>=Math.min(3,expectedCost.generic),entry.raw.name+': Emerge selects a real creature that makes the reduced payment affordable');
    const sacrifice=record.sacrifices.find(row=>row.iid===emerge.iid);
    assert.ok(sacrifice,entry.raw.name+': the Emerge creature is actually sacrificed');
    assert.equal(sacrifice.snapshot.mv,emerge.manaValue,entry.raw.name+': reduction equals the sacrificed creature mana value');
  }
  const requiredMana=Math.max(0,expectedCost.generic-(expectedCost.xReduction||0)-(emerge?.manaValue||0))+(expectedCost.pips||[]).length;
  assert.ok(paidMana>=requiredMana,entry.raw.name+': alternative mana payment is spent');
  if(operation.emerge)assert.equal(paidMana,requiredMana,entry.raw.name+': Emerge reduces only the actual generic payment');
  for(const key of ['discards','exiles','handExiles','returns'])for(const id of record[key]||[])
    assert.equal(before.get(id)?.zone,{discards:'hand',exiles:'graveyard',handExiles:'hand',returns:'battlefield'}[key],entry.raw.name+': '+key+' used the exact cost zone');
  assert.equal(stack.castOpts.oracleAlternativeId,canonical.oracleAlternativeId,entry.raw.name+': Stack records canonical option');
  let evokeSacrifices=0;
  if(operation.evoke){
    assert.equal(stack.castOpts.evoke,true,entry.raw.name+': canonical option records Evoke');
    const sacrifice=game.sacrifice;
    game.sacrifice=async function(player,card,...args){if(card===source)evokeSacrifices++;return sacrifice.call(this,player,card,...args);};
  }
  await h.resolveAll(game);
  if(operation.sneak&&source.zone==='battlefield'&&source.is('Creature')){
    assert.equal(source.tapped,true,entry.raw.name+': Sneak enters tapped');
    assert.equal(source.attacking,ctx.b,entry.raw.name+': Sneak keeps the returned creature defender');
    assert.ok(game.combat.attackers.includes(source),entry.raw.name+': the entering creature joins the actual combat');
  }
  if(operation.evoke){
    assert.equal(evokeSacrifices,1,entry.raw.name+': Evoke triggers the real sacrifice once');
    assert.equal(source.zone,'graveyard',entry.raw.name+': evoked source was sacrificed');
    await game.move(source,'hand');
    assert.equal(await game.castSpell(a,source,{from:'hand'}),true,entry.raw.name+': printed normal cost remains playable');
    assert.equal(!!game.stack.find(object=>object.card===source).castOpts.evoke,false,entry.raw.name+': normal cast is not evoked');
    await h.resolveAll(game);assert.equal(evokeSacrifices,1,entry.raw.name+': normal cast never creates the Evoke sacrifice');
  }
  return operation.evoke?13:operation.emerge?12:8;
}
