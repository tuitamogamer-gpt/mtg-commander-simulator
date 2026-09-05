import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {semanticClass, createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle} from './helpers/oracle-v8-fixtures.mjs';

const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-divided-damage-source.json', import.meta.url)));
const M = loadEngine();
const entries = rows.map((card, index) => {
  const semantic = semanticClass(card), words = card.type_line.split(' — ')[0].split(' ');
  assert.ok(semantic.semanticClass, card.name + ': ' + semantic.reason);
  return {position:index+1,oracleId:card.oracle_id,scryfallId:card.id,...semantic,
    raw:{name:card.name,cost:card.mana_cost,oracle:card.oracle_text,
      types:words.filter(word=>!['Legendary','Basic','Snow','World'].includes(word)),
      super:words.filter(word=>['Legendary','Basic','Snow','World'].includes(word)),
      subtypes:card.type_line.split(' — ')[1]?.split(' ')||[],power:card.power,toughness:card.toughness,loyalty:card.loyalty,_ci:card.color_identity},
    catalog:{typeLine:card.type_line,commanderLegality:'legal'}};
});
const faceRows = JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-divided-damage-faces.json', import.meta.url)));
const facePlan = createImportPlan({cards:faceRows,bulk:{updated_at:'2026-08-30T09:01:56.964+00:00',type:'oracle_cards'},baseNames:[],sequence:9996,limit:faceRows.length});
entries.push(...facePlan.report.cards);
M.registerOracleBatch({id:'oracle-divided-source-tests',sequence:9997,cards:entries.filter(entry=>!M.DEFS[entry.raw.name])});
M.initData(M.RAW_DATA);

function choices(ctx, targets, x = 0) {
  const original = ctx.a.controller.decide.bind(ctx.a.controller);
  ctx.a.controller.decide = async (game, query) => {
    if (query.type === 'chooseTargets') return targets.filter(target=>query.candidates.includes(target)).slice(0,query.max);
    if (query.type === 'chooseX' && !query.allocation) return x;
    if (query.type === 'chooseX' && query.allocation) return query.min;
    return original(game, query);
  };
}
async function cast(ctx, name) {
  const spell = put(M,ctx.game,ctx.a,name,'hand');
  for (const color of ['W','U','B','R','G','C']) ctx.a.pool[color] = 15;
  assert.equal(await ctx.game.castSpell(ctx.a,spell,{from:'hand'}),true,name+': actual cast');
  assert.ok(Object.values(ctx.a.pool).reduce((sum,n)=>sum+n,0)<90,name+': cost paid');
  return spell;
}
const division = game => game.stack.at(-1).damageDivision || game.stack.at(-1).ctx.damageDivision;

for (const role of ['human','ai']) {
  test(`${role}: Fire and Ice announce only the chosen split face`, async () => {
    const ctx = context(M,role), target = put(M,ctx.game,ctx.b,'Colossal Dreadmaw');
    choices(ctx,[target,ctx.b]);
    const fire = put(M,ctx.game,ctx.a,'Fire // Ice','hand');ctx.a.pool.C=1;ctx.a.pool.R=1;
    const action = ctx.game.castableList(ctx.a).find(row=>row.card===fire&&row.alt?.splitHalf==='left');assert.ok(action);
    assert.equal(await ctx.game.castSpell(ctx.a,fire,{from:'hand',alt:action.alt}),true);
    assert.deepEqual(Array.from(division(ctx.game),row=>row.n),[1,1]);assert.equal(ctx.a.pool.C+ctx.a.pool.R,0);
    await settle(ctx.game);assert.equal(target.damage,1);assert.equal(ctx.b.life,39);
    const ice = put(M,ctx.game,ctx.a,'Fire // Ice','hand');ctx.a.pool.C=1;ctx.a.pool.U=1;
    const right = ctx.game.castableList(ctx.a).find(row=>row.card===ice&&row.alt?.splitHalf==='right');assert.ok(right);
    const library = ctx.a.library.length;
    assert.equal(await ctx.game.castSpell(ctx.a,ice,{from:'hand',alt:right.alt}),true);
    assert.equal(ctx.game.stack.at(-1).damageDivision,undefined);await settle(ctx.game);
    assert.equal(target.tapped,true);assert.equal(target.damage,1);assert.equal(ctx.a.library.length,library-1);
  });
  test(`${role}: Explosive Crystal divides before exile and later casts the Dragon without a division`, async () => {
    const ctx = context(M,role), target = put(M,ctx.game,ctx.b,'Colossal Dreadmaw');
    choices(ctx,[target,ctx.b]);
    const card = put(M,ctx.game,ctx.a,'Amethyst Dragon // Explosive Crystal','hand');ctx.a.pool.C=4;ctx.a.pool.R=1;
    const adventure = ctx.game.castableList(ctx.a).find(row=>row.card===card&&row.alt?.adventure);assert.ok(adventure);
    assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand',alt:adventure.alt}),true);
    assert.deepEqual(Array.from(division(ctx.game),row=>row.n),[1,3]);assert.equal(ctx.a.pool.C+ctx.a.pool.R,0);
    await settle(ctx.game);assert.equal(target.damage,1);assert.equal(ctx.b.life,37);assert.equal(card.zone,'exile');
    ctx.a.pool.C=4;ctx.a.pool.R=2;
    const creature = ctx.game.castableList(ctx.a).find(row=>row.card===card&&row.from==='exile'&&!row.alt?.adventure);assert.ok(creature);
    assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'exile',alt:creature.alt}),true);
    assert.equal(ctx.game.stack.at(-1).damageDivision,undefined);await settle(ctx.game);
    assert.equal(card.zone,'battlefield');assert.equal(card.kw('flying'),true);assert.equal(card.kw('haste'),true);assert.equal(ctx.b.life,37);
  });
  test(`${role}: partial target loss does not reassign announced Arc Lightning damage`, async () => {
    const ctx = context(M,role), left = put(M,ctx.game,ctx.b,'Grizzly Bears'), right = put(M,ctx.game,ctx.b,'Grizzly Bears');
    choices(ctx,[left,right]); await cast(ctx,'Arc Lightning');
    assert.deepEqual(Array.from(division(ctx.game),row=>row.n),[1,2]);
    assert.equal(left.damage,0); assert.equal(right.damage,0);
    await ctx.game.move(right,'hand'); await settle(ctx.game);
    assert.equal(left.damage,1); assert.equal(left.zone,'battlefield'); assert.equal(right.zone,'hand');
  });
  test(`${role}: Electrolyze fizzles when all targets blink and does not draw`, async () => {
    const ctx = context(M,role), target = put(M,ctx.game,ctx.b,'Grizzly Bears');
    choices(ctx,[target]); const size = ctx.a.library.length;
    await cast(ctx,'Electrolyze'); await ctx.game.move(target,'exile'); await ctx.game.move(target,'battlefield');
    await settle(ctx.game); assert.equal(target.damage,0); assert.equal(ctx.a.library.length,size);
  });
  test(`${role}: paid X limits target count and locks the whole Rolling Thunder split`, async () => {
    const ctx = context(M,role), target = put(M,ctx.game,ctx.b,'Colossal Dreadmaw');
    choices(ctx,[target,ctx.b],5); await cast(ctx,'Rolling Thunder');
    assert.equal(ctx.game.stack.at(-1).x,5);
    assert.deepEqual(Array.from(division(ctx.game),row=>row.n),[1,4]);
    await settle(ctx.game); assert.equal(target.damage,1); assert.equal(ctx.b.life,36);
  });
  test(`${role}: X zero permits no targets and produces no allocation`, async () => {
    const ctx = context(M,role); choices(ctx,[],0); await cast(ctx,'Rolling Thunder');
    assert.equal(division(ctx.game).length,0); await settle(ctx.game); assert.equal(ctx.b.life,40);
  });
  test(`${role}: a paid Reverberate retargets an existing division without dividing again`, async () => {
    const ctx = context(M,role), first = put(M,ctx.game,ctx.b,'Colossal Dreadmaw'), second = put(M,ctx.game,ctx.b,'Colossal Dreadmaw');
    const fresh = put(M,ctx.game,ctx.b,'Colossal Dreadmaw');
    choices(ctx,[first,second]); await cast(ctx,'Arc Lightning'); const original = ctx.game.stack.at(-1);
    const decide = ctx.a.controller.decide.bind(ctx.a.controller);
    let allocationsAfterOriginal = 0;
    ctx.a.controller.decide = async (game,q) => {
      if (q.allocation) allocationsAfterOriginal++;
      if (q.type==='chooseTargets') return q.candidates.includes(original) ? [original] : [fresh,ctx.b].filter(target=>q.candidates.includes(target));
      if (q.type==='chooseOption'&&q.aiHint?.kind==='newTargets') return 'yes';
      return decide(game,q);
    };
    await cast(ctx,'Reverberate'); await ctx.game.resolveTop(); const copy = ctx.game.stack.at(-1);
    assert.equal(copy.isCopy,true);assert.deepEqual(Array.from(copy.damageDivision,row=>row.n),[1,2]);
    assert.equal(allocationsAfterOriginal,0);await ctx.game.resolveTop();
    assert.equal(fresh.damage,1);assert.equal(ctx.b.life,38);assert.equal(first.damage,0);
    await settle(ctx.game);assert.equal(first.damage,1);assert.equal(second.damage,2);
  });
  test(`${role}: Fiery Justice keeps its life-gain target separate from its damage split`, async () => {
    const ctx = context(M,role,2), target = put(M,ctx.game,ctx.b,'Colossal Dreadmaw');
    const decide = ctx.a.controller.decide.bind(ctx.a.controller);
    ctx.a.controller.decide = async (game,q) => {
      if (q.type==='chooseTargets') return q.spec.what==='opponent' ? [ctx.others[1]] : [target,ctx.b];
      if (q.allocation) return q.min;
      return decide(game,q);
    };
    await cast(ctx,'Fiery Justice');assert.deepEqual(Array.from(division(ctx.game),row=>row.n),[1,4]);
    await settle(ctx.game);assert.equal(target.damage,1);assert.equal(ctx.b.life,36);assert.equal(ctx.others[1].life,45);
  });
  test(`${role}: Monstrous Onslaught captures power during casting`, async () => {
    const ctx = context(M,role), own = put(M,ctx.game,ctx.a,'Colossal Dreadmaw'), target = put(M,ctx.game,ctx.b,'Colossal Dreadmaw');
    ctx.game.addCounters(own,'+1/+1',4); ctx.game.recalc(); choices(ctx,[target]);
    await cast(ctx,'Monstrous Onslaught'); assert.equal(division(ctx.game)[0].n,10);
    await ctx.game.move(own,'hand'); await settle(ctx.game); assert.equal(target.zone,'graveyard');
  });
  test(`${role}: Mogg Mob announces its division before its sacrifice cost`, async () => {
    const ctx = context(M,role), source = put(M,ctx.game,ctx.a,'Mogg Mob');
    choices(ctx,[ctx.b]); const decide = ctx.a.controller.decide.bind(ctx.a.controller);
    ctx.a.controller.decide = async (game,q) => {if(q.allocation)assert.equal(source.zone,'battlefield');return decide(game,q);};
    const action = ctx.game.activatableList(ctx.a).find(action=>action.card===source);
    assert.ok(action); assert.equal(await ctx.game.activateAbility(ctx.a,action),true);
    assert.equal(source.zone,'graveyard'); assert.equal(division(ctx.game)[0].n,3);
    await settle(ctx.game); assert.equal(ctx.b.life,37);
  });
  test(`${role}: a real death trigger divides damage using the departing Orca's power`, async () => {
    const ctx = context(M,role), source = put(M,ctx.game,ctx.a,'Orca, Siege Demon');
    ctx.game.addCounters(source,'+1/+1',4); ctx.game.recalc(); const power = source.power;
    choices(ctx,[ctx.b]);
    const murder = put(M,ctx.game,ctx.b,'Murder','hand'); ctx.b.pool.C=1;ctx.b.pool.B=2;
    ctx.b.controller.decide = async (g,q)=>q.type==='chooseTargets'?[source]:q.type==='priority'?{kind:'pass'}:null;
    assert.equal(await ctx.game.castSpell(ctx.b,murder,{from:'hand'}),true);
    await ctx.game.resolveTop(); await ctx.game.flushTriggers();
    assert.equal(source.zone,'graveyard'); assert.equal(division(ctx.game)[0].n,power);
    await settle(ctx.game); assert.equal(ctx.b.life,40-power);
  });
}

test('hard local AI chooses a real lethal divided-damage cast and allocation', async () => {
  const ctx = context(M,'ai'); ctx.b.life = 3;
  const spell = put(M,ctx.game,ctx.a,'Arc Lightning','hand');ctx.a.pool.C=2;ctx.a.pool.R=1;
  const casts = ctx.game.castableList(ctx.a);
  const decision = await ctx.a.controller.decide(ctx.game,{type:'main',player:ctx.a,casts,acts:[],lands:[],phase:'main1'});
  assert.equal(decision.kind,'cast');assert.equal(decision.card,spell);
  assert.equal(await ctx.game.castSpell(ctx.a,spell,{from:'hand'}),true);
  assert.equal(division(ctx.game)[0].playerIdx,ctx.b.idx);assert.equal(division(ctx.game)[0].n,3);
  await settle(ctx.game);assert.equal(ctx.b.life,0);assert.equal(ctx.b.lost,true);
});

test('divided damage rejects unsupported riders and unbound X', () => {
  for (const oracle of [
    'Arc Lightning deals 3 damage divided as you choose among one, two, or three targets. Then invent a rule.',
    'Arc Lightning deals X damage divided as you choose among any number of targets.',
  ]) assert.equal(semanticClass({name:'Arc Lightning',type_line:'Sorcery',mana_cost:'{2}{R}',oracle_text:oracle}).semanticClass,undefined);
});
