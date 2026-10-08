import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,settle} from './helpers/oracle-v8-fixtures.mjs';
import {fund,put,def,total,choose} from './helpers/oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants,assertRecalculationStable} from './helpers/game-state-invariants.mjs';

const M=loadEngine();

// Independent native descriptors exercise the shared targeting/animation
// primitives without depending on a concurrently edited family fixture.
function definition(name,types,cost,implementation,extra={}) {
  const raw=def(name,types,{cost,...extra});
  return {...raw,...M.compileOracleTextDefinition({oracleId:name,semanticClass:'spell-template'},implementation,raw)};
}

const exileDefinition=definition('Expansion boundary: twice-X exile',['Instant'],'{X}{B}',[{
  kind:'spell-generic',contract:'spell-generic-effect',optional:false,
  targets:[{what:'card',zone:'graveyard',min:0,targetCountX:true,upToXV38:true,
    targetCountMultiplierV57:2,stat:'mv',threshold:'X',comparison:'less'}],
  effects:[{action:'exile',target:0},{action:'gain-life',who:'you',n:'X'}],
}]);

function ready(role) {
  const f=context(M,role);
  fund(f.a);
  return f;
}

function graveyardCards(player,count=5) {
  return Array.from({length:count},(_,i)=>put(M,player,def('Expansion boundary: grave card '+i,['Creature'],{cost:'{2}'}),'graveyard'));
}

function select(player,picks) {
  choose(player,q=>{
    if(q.type!=='chooseTargets')return null;
    assert.ok(picks.every(card=>q.candidates.includes(card)),'the constrained choices are native legal targets');
    assert.ok(picks.length>=q.min&&picks.length<=q.max,'the constrained choice respects the offered cardinality');
    return {...q,candidates:picks,min:picks.length,max:picks.length};
  });
}

function invariant(game) {
  assertGameStateInvariants(game);
  assertRecalculationStable(game);
}

for(const role of ['human','ai']) {
  test(role+': X=2 pays for two X mana and exiles four qualifying targets',async()=>{
    const {game:g,a,b}=ready(role),cards=graveyardCards(b),tooLarge=put(M,b,def('Expansion boundary: three-mana card',['Creature'],{cost:'{3}'}),'graveyard');
    select(a,cards.slice(0,4));
    const spell=put(M,a,exileDefinition,'hand'),mana=total(a),life=a.life;
    assert.equal(await g.castSpell(a,spell,{from:'hand',xVal:2}),true);
    const so=g.stack.at(-1);
    assert.equal(so.card,spell);
    assert.equal(so.x,2,'the target multiplier must not change the announced X');
    assert.equal(total(a),mana-3,'{X}{B} with X=2 costs exactly three mana');
    assert.equal(spell.zone,'stack');
    assert.equal(so.targets[0].length,4);
    assert.equal(g.legalTargets(so.targetSpecs[0],spell,a).includes(tooLarge),false,'the X mana-value bound remains two');
    await settle(g);
    assert.equal(cards.filter(card=>card.zone==='exile').length,4);
    assert.equal(cards[4].zone,'graveyard');
    assert.equal(tooLarge.zone,'graveyard');
    assert.equal(a.life,life+2,'resolution uses the original X rather than twice X');
    assert.equal(spell.zone,'graveyard');
    assert.equal(a.controller instanceof M.AIController,role==='ai');
    invariant(g);
  });

  test(role+': an up-to-twice-X cast accepts no targets at X=0 and X=2',async()=>{
    for(const x of [0,2]) {
      const {game:g,a,b}=ready(role),cards=graveyardCards(b,2);
      select(a,[]);
      const spell=put(M,a,exileDefinition,'hand'),mana=total(a),life=a.life;
      assert.equal(await g.castSpell(a,spell,{from:'hand',xVal:x}),true);
      assert.equal(g.stack.at(-1).x,x);
      assert.equal(g.stack.at(-1).targets[0].length,0);
      assert.equal(total(a),mana-(x+1));
      await settle(g);
      assert.ok(cards.every(card=>card.zone==='graveyard'));
      assert.equal(a.life,life+x,'a spell announced with zero targets resolves its untargeted instruction');
      assert.equal(spell.zone,'graveyard');
      invariant(g);
    }
  });

  test(role+': a selected graveyard card that changes zones is excluded on resolution',async()=>{
    const {game:g,a,b}=ready(role),cards=graveyardCards(b,4);
    select(a,cards);
    const spell=put(M,a,exileDefinition,'hand'),mana=total(a),life=a.life;
    assert.equal(await g.castSpell(a,spell,{from:'hand',xVal:2}),true);
    const so=g.stack.at(-1),version=cards[0].zoneVersion;
    assert.equal(total(a),mana-3);
    assert.equal(so.targetIdentities[0][0].zoneVersion,version);
    await g.move(cards[0],'hand');
    await g.move(cards[0],'graveyard');
    assert.ok(cards[0].zoneVersion>version);
    await settle(g);
    assert.equal(cards[0].zone,'graveyard','the same CardInst in a new incarnation is not the locked target');
    assert.ok(cards.slice(1).every(card=>card.zone==='exile'),'the other three locked targets remain legal');
    assert.equal(a.life,life+2);
    assert.equal(spell.zone,'graveyard');
    invariant(g);
  });
}

test('a malformed fifth target at X=2 is rejected before costs or zones move',async()=>{
  const {game:g,a,b}=ready('human'),cards=graveyardCards(b),spell=put(M,a,exileDefinition,'hand');
  const mana=total(a),life=a.life,versions=cards.map(card=>card.zoneVersion),prior=a.controller.decide.bind(a.controller);
  // Deliberately malformed client input: native cast validation owns the limit.
  a.controller.decide=async(game,q)=>q.type==='chooseTargets'?cards:prior(game,q);
  assert.equal(await g.castSpell(a,spell,{from:'hand',xVal:2}),false);
  assert.equal(total(a),mana);
  assert.equal(a.life,life);
  assert.equal(spell.zone,'hand');
  assert.ok(a.hand.includes(spell));
  assert.equal(g.stack.length,0);
  assert.ok(cards.every((card,i)=>card.zone==='graveyard'&&card.zoneVersion===versions[i]));
  invariant(g);
});

const animationDefinition=definition('Expansion boundary: living Equipment',['Artifact','Creature'],'{3}',[{
  kind:'generic-ability',contract:'generic-activated-effect',cost:{mana:'{1}',tap:true},targets:[],
  effects:[{action:'animate',target:'self',types:['Creature'],subtypes:['Spirit'],retainTypes:true,
    retainAllSubtypes:true,removeSubtypesV60:['Equipment'],power:4,toughness:4,keywords:[],temporary:true}],
}],{subtypes:['Equipment','Vehicle','Golem'],power:'2',toughness:'3'});

for(const role of ['human','ai'])test(role+': temporary animation removes only Equipment and restores it in native cleanup',async()=>{
  const {game:g,a}=ready(role),card=put(M,a,animationDefinition,'hand'),mana=total(a);
  assert.equal(await g.castSpell(a,card,{from:'hand'}),true);
  assert.equal(total(a),mana-3);
  await settle(g);
  card.sick=false;
  const original=card.def,types=Array.from(original.types),subtypes=Array.from(original.subtypes),version=card.zoneVersion;
  const ability=g.activatableList(a).find(row=>row.card===card&&!row.manaAbility);
  assert.ok(ability);
  const activationMana=total(a);
  assert.equal(await g.activateAbility(a,ability),true);
  assert.equal(total(a),activationMana-1);
  assert.equal(card.tapped,true,'the tap cost is paid before animation resolves');
  assert.equal(g.stack.at(-1).kind,'ability');
  assert.equal(card.hasSub('Equipment'),true,'removal waits for the ability on the Stack');
  await settle(g);
  assert.equal(card.is('Artifact')&&card.is('Creature'),true);
  assert.equal(card.hasSub('Equipment'),false);
  for(const subtype of ['Vehicle','Golem','Spirit'])assert.equal(card.hasSub(subtype),true,subtype+' remains or is added');
  assert.equal(card.power,4);
  assert.equal(card.toughness,4);
  assert.equal(card.def,original);
  assert.deepEqual(Array.from(original.types),types);
  assert.deepEqual(Array.from(original.subtypes),subtypes,'animation must not rewrite the original definition');
  invariant(g);
  // Ordinary phases may pass, but the engine performs the actual cleanup.
  g.mainPhase=async()=>{};
  g.combatPhase=async()=>{};
  await g.runTurn();
  await settle(g);
  assert.equal(card.zone,'battlefield');
  assert.equal(card.zoneVersion,version);
  assert.equal(card.hasSub('Equipment'),true);
  assert.equal(card.hasSub('Vehicle')&&card.hasSub('Golem'),true);
  assert.equal(card.hasSub('Spirit'),false);
  assert.equal(card.power,2);
  assert.equal(card.toughness,3);
  assert.equal(card.def,original);
  assert.deepEqual(Array.from(card.cur.types),types);
  assert.deepEqual(Array.from(card.cur.subtypes),subtypes);
  assert.equal(g.untilEffects.some(effect=>effect.kind==='oracleAnimation'&&effect.iid===card.iid),false);
  invariant(g);
});

const unionDestroyDefinition=definition('Expansion boundary: artifact or enchantment',['Instant'],'{1}{W}',[{
  kind:'spell-generic',contract:'spell-generic-effect',optional:false,
  targets:[{what:'any',zone:'battlefield',controller:'any',min:1,alternatives:[
    {what:'artifact',zone:'battlefield',controller:'any',min:1},
    {what:'enchantment',zone:'battlefield',controller:'any',min:1},
  ]}],effects:[{action:'destroy',target:0}],
}]);
for(const role of ['human','ai'])for(const type of ['Artifact','Enchantment'])test(`${role}: permanent unions offer a pure ${type} and exclude players and creatures`,async()=>{
  const {game:g,a,b}=ready(role),target=new M.CardInst(def('Expansion boundary: pure '+type,[type]),b),creature=new M.CardInst(def('Expansion boundary: unrelated creature',['Creature']),b);
  await g.putPermanentOntoBattlefield(target,b);await g.putPermanentOntoBattlefield(creature,b);
  const spell=put(M,a,unionDestroyDefinition,'hand'),spec=g.spellTargetSpecs(spell,{})[0],candidates=g.legalTargets(spec,spell,a),mana=total(a);
  assert.equal(spec.what,'permanent');assert.equal(candidates.includes(target),true);assert.equal(candidates.includes(creature),false);assert.equal(candidates.includes(b),false);
  select(a,[target]);assert.equal(await g.castSpell(a,spell,{from:'hand'}),true);assert.equal(total(a),mana-2);await settle(g);
  assert.equal(target.zone,'graveyard');assert.equal(creature.zone,'battlefield');invariant(g);
});
