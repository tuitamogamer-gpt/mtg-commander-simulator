import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M=loadEngine();
function deck(commander,card,colors='') {
  return `Commander\n1 ${commander} *CMDR*\n\nDeck\n1 ${card}${colors}\n98 Island`;
}

test('ordinary repeated complete-deck imports reuse the catalog index and preserve printed CardInst definitions',()=>{
  const original=M.CARD_CATALOG;let enumerations=0;
  M.CARD_CATALOG=new Proxy(original,{ownKeys(target){enumerations++;return Reflect.ownKeys(target);}});
  try {
    M.resolveDeckCardName('Talion, the Kindly Lord');enumerations=0;
    for(const name of ['Sol Ring','Brainstorm','Thassa\'s Oracle','Consign // Oblivion']) {
      for(let repeat=0;repeat<5;repeat++) {
        const imported=M.importCommanderDeck(deck('Talion, the Kindly Lord',name));
        assert.equal(imported.ok,true,JSON.stringify(imported.errors));
        const game=new M.Game({seed:3,paced:false,maxTurns:2});
        const player=game.addPlayer('Importer',imported.deck,null,true);
        game.buildDeck(player,imported.deck,M.DEFS,imported.commanders);
        assert.equal(player.command[0].name,'Talion, the Kindly Lord');assert.equal(player.library.length,99);
        const canonical=M.resolveDeckCardName(name),card=player.library.find(c=>c.name===canonical);
        assert.ok(card,name);assert.equal(card.def.oracle,M.CARD_CATALOG[canonical].oracleText);
      }
    }
    assert.equal(enumerations,0,'warming the index once must avoid rescanning all catalog names for ordinary complete imports');
  } finally {M.CARD_CATALOG=original;}
});

test('chosen-color deck validation keeps Cryptic Spires overrides isolated across valid and rejected imports',()=>{
  const defs=M.DEFS,printed=defs['Cryptic Spires'],before=JSON.stringify(printed);
  const valid=M.importCommanderDeck(deck('Talion, the Kindly Lord','Cryptic Spires',' [colors=U,B]'));
  assert.equal(valid.ok,true,JSON.stringify(valid.errors));
  assert.deepEqual(Array.from(valid.deck.auxiliaryV87.colors['Cryptic Spires']),['U','B']);
  assert.equal(M.DEFS,defs);assert.equal(M.DEFS['Cryptic Spires'],printed);assert.equal(JSON.stringify(printed),before);
  const invalid=M.importCommanderDeck(deck('Talion, the Kindly Lord','Cryptic Spires',' [colors=W,U]'));
  assert.equal(invalid.ok,false);assert.ok(invalid.errors.some(e=>e.code==='invalid-commanders'));
  assert.equal(M.DEFS,defs);assert.equal(JSON.stringify(printed),before);
  const ordinary=M.importCommanderDeck(deck('Talion, the Kindly Lord','Sol Ring'));
  assert.equal(ordinary.ok,true,JSON.stringify(ordinary.errors));assert.equal(M.DEFS,defs);
});

test('a chosen-color import restores global definitions when the native commander validator throws',()=>{
  const defs=M.DEFS,validate=M.validateCommanders,marker=new Error('validator interrupted');
  M.validateCommanders=()=>{throw marker;};
  try {assert.throws(()=>M.importCommanderDeck(deck('Talion, the Kindly Lord','Cryptic Spires',' [colors=U,B]')),e=>e===marker);}
  finally {M.validateCommanders=validate;}
  assert.equal(M.DEFS,defs);
  const result=M.importCommanderDeck(deck('Talion, the Kindly Lord','Sol Ring'));
  assert.equal(result.ok,true,JSON.stringify(result.errors));
});

test('an imported Siege is paid, enters with its native protector and exposes its permanent casting contract',async()=>{
  const name='Invasion of Gobakhan // Lightshield Array';
  const result=M.importCommanderDeck(deck('Ashling, the Limitless',name));
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  const game=new M.Game({seed:10102026,paced:false});game.speedFactor=0;
  const decide=async(_g,q)=>{
    if(q.type==='priority')return {kind:'pass'};
    if(q.type==='chooseOption')return q.options[0].key;
    if(q.type==='chooseTargets')return q.candidates.slice(0,q.min||0);
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    if(q.type==='chooseManaSources')return {auto:true};
    if(q.type==='orderTriggers')return q.triggers;
    return null;
  };
  const me=game.addPlayer('Importer',result.deck,{decide},true);
  const rival=game.addPlayer('Protector',{name:'Native Siege opponent'},{decide},true);
  game.buildDeck(me,result.deck,M.DEFS,result.commanders);
  game.turnPlayer=me;game.turnNo=8;game.phase='main1';game.step='main';
  const battle=me.library.find(c=>c.is('Battle'));assert.ok(battle);
  await game.move(battle,'hand');
  const lands=[0,1].map(()=>{const c=new M.CardInst(M.DEFS.Plains,me);c.zone='battlefield';c.sick=false;game.battlefield.push(c);return c;});
  game.recalc();
  assert.ok(game.castableList(me).some(row=>row.card===battle));
  assert.equal(await game.castSpell(me,battle,{from:'hand'}),true);
  assert.equal(battle.zone,'battlefield');assert.equal(battle.castMeta.manaSpent,2);
  assert.ok(lands.every(c=>c.tapped));assert.equal(battle.protector,rival);
  assert.equal(battle.counters.defense,3);assert.equal(game.stack.length,0);assert.equal(game.pendingTriggers.length,0);
  assert.ok(result.interactions.contracts.some(row=>row.id==='permanent-casting'&&row.cards.includes(name)),
    'the actual imported and paid Battle must include its base permanent-casting contract');
});
