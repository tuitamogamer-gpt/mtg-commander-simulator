import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {chosenColorProof} from './helpers/oracle-chosen-color-proof.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const MTG=loadEngine(),cards=JSON.parse(readFileSync(new URL('./fixtures/oracle-chosen-color-source.json',import.meta.url)));
const entries=cards.map((card,index)=>{
  const semantic=semanticClass(card);assert.ok(semantic.semanticClass,card.name+': '+semantic.reason);
  return {position:index+1,oracleId:card.oracle_id,scryfallId:card.id,...semantic,raw:{name:card.name,cost:card.mana_cost,oracle:card.oracle_text,types:card.type_line.split(' — ')[0].split(' '),super:[],subtypes:card.type_line.split(' — ')[1]?.split(' ')||[],power:card.power,toughness:card.toughness,_ci:card.color_identity},catalog:{typeLine:card.type_line,commanderLegality:'legal'}};
});
MTG.registerOracleBatch({id:'oracle-chosen-color-test',sequence:9996,cards:entries.filter(entry=>!MTG.DEFS[entry.raw.name])});MTG.initData(MTG.RAW_DATA);
for(const entry of entries)assert.equal(MTG.DEFS[entry.raw.name].oracle,entry.raw.oracle,entry.raw.name+': runtime definition retains the exact pinned Oracle source');
for(const role of ['human','ai'])for(const entry of entries)test(`${role}: ${entry.raw.name} chooses on entry and produces only its selected mana`,()=>chosenColorProof(MTG,entry,null,role));
test('blink forgets the former color and makes a new noncopiable entry choice',async()=>{
  const ctx=context(MTG),card=put(MTG,ctx.game,ctx.a,'Coldsteel Heart','hand');let chosen='U';
  const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>q.aiHint?.kind==='manaColor'?chosen:decide(g,q);
  ctx.a.pool.C=2;assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);await settle(ctx.game);assert.equal(card.meta.oracleChosenColor,'U');
  await ctx.game.move(card,'exile');chosen='B';await ctx.game.move(card,'battlefield');await settle(ctx.game);assert.equal(card.meta.oracleChosenColor,'B');
  ctx.game.untap(card);const options=ctx.game.manaSources(ctx.a).filter(row=>row.card===card).flatMap(row=>row.produce);
  assert.equal(options.some(p=>p.U),false);assert.equal(options.some(p=>p.B===1),true);
});
test('chosen-color mana is rejected if no entry choice binds it',()=>{
  const result=semanticClass({name:'Unbound color',type_line:'Land',layout:'normal',oracle_text:'{T}: Add one mana of the chosen color.',mana_cost:''});
  assert.equal(!!result.semanticClass,false);
});
test('local AI chooses mana needed by its own hand while opponent cards stay hidden',async()=>{
  const ctx=context(MTG,'ai');put(MTG,ctx.game,ctx.a,'Counterspell','hand');
  for(let i=0;i<8;i++)put(MTG,ctx.game,ctx.b,'Lightning Bolt','hand');
  const land=put(MTG,ctx.game,ctx.a,'Shimmerdrift Vale','hand');
  assert.equal(await ctx.game.playLand(ctx.a,land),true);await settle(ctx.game);
  assert.equal(land.meta.oracleChosenColor,'U');
  assert.equal(ctx.trace.filter(row=>row.q.aiHint?.kind==='manaColor').length,1);
});
