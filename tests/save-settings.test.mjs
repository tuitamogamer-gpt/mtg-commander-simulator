import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const MTG = loadEngine();
const wire = value => JSON.parse(JSON.stringify(value));

function fixture(decide, manaMode) {
  const game = new MTG.Game({seed:431,paced:false});
  const player = game.addPlayer('You',{name:'Save settings test'},{decide},false);
  game.addPlayer('Other',{name:'Save settings witness'},{decide:async()=>({kind:'pass'})},true);
  player.manualMana = manaMode === 'manual';
  game.turnPlayer = player; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
  for (const [name,zone] of [['Island','battlefield'],['Island','battlefield'],['Island','battlefield'],
    ['Moon-Circuit Hacker','hand'],['Sol Ring','hand']]) {
    const card = new MTG.CardInst(MTG.DEFS[name],player);
    card.zone=zone; card.ctrl=player; card.sick=false;
    (zone==='battlefield'?game.battlefield:player[zone]).push(card);
  }
  game.recalc(); return {game,player};
}

for (const initialMode of ['auto','manual']) test(`mana-mode changes replay native paid actions from ${initialMode} and a later board checkpoint`, async () => {
  const timeline = [], firstMode = initialMode === 'auto' ? 'manual' : 'auto';
  let mains=0, checkpoint, offset;
  const original = fixture(async (game,q) => {
    const player=game.players[0];
    let result;
    if (q.type==='main') {
      mains++;
      if(mains===2){checkpoint=MTG.captureGameState(game);offset=timeline.length;}
      if(mains<=2) {
        const manaMode=mains===1?firstMode:initialMode;
        player.manualMana=manaMode==='manual';
        timeline.push({kind:'side',action:MTG.portableAccountSideAction(game,player,{type:'settings',manaMode})});
        const cast=q.casts.find(entry=>entry.card.name===(mains===1?'Moon-Circuit Hacker':'Sol Ring'));
        assert.ok(cast,'a paid native spell is available'); result={kind:'cast',...cast};
      } else result={kind:'done'};
    } else if(q.type==='chooseManaSources') result={cards:q.suggested};
    else if(q.type==='priority') result={kind:'pass'};
    else assert.fail(`Unexpected original request: ${q.type}`);
    timeline.push({kind:'decision',...MTG.recordSaveDecision(q,player,result)});
    return result;
  },initialMode);
  await original.game.mainPhase(original.player);
  assert.equal(original.game.bf().some(c=>c.name==='Moon-Circuit Hacker'),true);
  assert.equal(original.game.bf().some(c=>c.name==='Sol Ring'),true);
  assert.equal(timeline.filter(row=>row.shape?.type==='chooseManaSources').length,1,'only the manual payment asks for sources');
  assert.ok(checkpoint,'the middle board is portable');
  const saved=wire({setup:{manaMode:initialMode,prioMode:'end'},decisions:timeline});
  for(const resumeBoard of [false,true]) {
    let cursor=resumeBoard?offset:0;
    const settings=MTG.accountSaveSettingsAt(saved,cursor);
    const restored=fixture(async(game,q)=>{
      const player=game.players[0];
      while(saved.decisions[cursor]?.kind==='side') {
        Object.assign(settings,await MTG.replayAccountSideAction(game,player,saved.decisions[cursor++].action));
      }
      const record=saved.decisions[cursor++]; assert.ok(record,`recorded ${q.type} remains available`);
      return MTG.restoreSaveDecision(q,player,record);
    },settings.manaMode);
    if(resumeBoard)MTG.restoreGameState(restored.game,wire(checkpoint));
    await restored.game.mainPhase(restored.player);
    assert.equal(cursor,timeline.length,'every decision is replayed without dropping the remainder');
    assert.equal(restored.player.manualMana,initialMode==='manual');
    assert.equal(MTG.gameStateFingerprint(restored.game),MTG.gameStateFingerprint(original.game));
    assert.deepEqual(wire(restored.player.pool),wire(original.player.pool));
  }
});

test('saved settings respect the checkpoint offset and do not rewrite the original setup', async () => {
  const save={setup:{manaMode:'auto',prioMode:'end'},decisions:[
    {kind:'side',action:{type:'settings',manaMode:'manual'}},
    {kind:'decision'},
    {kind:'side',action:{type:'settings',prioMode:'off'}},
    {kind:'side',action:{type:'settings',manaMode:'auto',prioMode:'full'}},
  ]};
  assert.deepEqual(wire(MTG.accountSaveSettingsAt(save,0)),{manaMode:'auto',prioMode:'end'});
  assert.deepEqual(wire(MTG.accountSaveSettingsAt(save,2)),{manaMode:'manual',prioMode:'end'});
  assert.deepEqual(wire(MTG.accountSaveSettingsAt(save,3)),{manaMode:'manual',prioMode:'off'});
  assert.deepEqual(wire(MTG.accountSaveSettingsAt(save,4)),{manaMode:'auto',prioMode:'full'});
  assert.deepEqual(save.setup,{manaMode:'auto',prioMode:'end'});
  assert.deepEqual(wire(MTG.accountSaveSettingsAt({setup:{},decisions:[]},0)),{manaMode:'auto',prioMode:'end'});
  for(const index of [-1,0.5,5])assert.throws(()=>MTG.accountSaveSettingsAt(save,index),/settings decision offset/);
  const {game,player}=fixture(async()=>({kind:'done'}),'auto');
  for(const entry of [{type:'settings'},{type:'settings',manaMode:'other'},{type:'settings',prioMode:'other'}])
    assert.throws(()=>MTG.portableAccountSideAction(game,player,entry),/settings are missing|mode is invalid/);
});
