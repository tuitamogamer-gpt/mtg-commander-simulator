import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M=loadEngine();
function fixture(role, {choice='yes', cancelSacrifice=false}={}) {
  const game=new M.Game({seed:111026,paced:false});
  game.speedFactor=0;
  const human={decide:async(_g,q)=>{
    if(q.type==='chooseOption')return q.options.find(o=>o.key==='yes')?.key||q.options[0]?.key;
    if(q.type==='chooseTargets')return q.candidates.slice(0,q.min||0);
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='scry')return{top:q.cards,bottom:[]};
    if(q.type==='chooseX')return q.min||0;
    return null;
  }};
  const player=game.addPlayer('Conduit',{name:'Native Conduit'},human,role==='ai');
  game.addPlayer('Opponent',{name:'Opponent'},human,false);
  if(role==='ai')player.controller=new M.AIController(player,{difficulty:'hard',style:'balanced'});
  const decide=player.controller.decide.bind(player.controller);
  const f={game,player,target:null,questions:[]};
  player.controller.decide=async(g,q)=>{
    f.questions.push(q);
    if(q.type==='priority')return{kind:'pass'};
    if(q.type==='main')return{kind:'done'};
    if(q.type==='chooseTargets'&&q.candidates.includes(f.target))return[f.target];
    if(q.aiHint?.kind==='conduitCast'&&choice==='no')return'no';
    if(q.type==='chooseCards'&&cancelSacrifice&&q.aiHint?.kind==='addlSac')return[];
    return decide(g,q);
  };
  game.turnPlayer=player;game.turnNo=8;game.phase='main1';game.step='main';
  game.priorityRound=async()=>{};
  f.put=(name,zone='battlefield')=>{
    assert.ok(M.DEFS[name],name);const card=new M.CardInst(M.DEFS[name],player);
    card.zone=zone;card.sick=false;(zone==='battlefield'?game.battlefield:player[zone]).push(card);game.recalc();return card;
  };
  for(let i=0;i<10;i++)f.put('Forest','library');
  f.conduit=f.put('Conduit of Worlds');
  f.settle=async()=>{
    for(let i=0;i<50&&(game.stack.length||game.pendingTriggers.length);i++){
      await game.flushTriggers();if(game.stack.length)await game.resolveTop();
    }
    assert.equal(game.stack.length,0);assert.equal(game.pendingTriggers.length,0);
    assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);
  };
  f.activate=async()=>{
    const entry=game.activatableList(player).find(row=>row.card===f.conduit);
    assert.ok(entry,'native sorcery-speed Conduit action is offered');
    assert.equal(await game.activateAbility(player,entry),true);
    assert.equal(game.stack.at(-1).targets[0]?.iid,f.target.iid);
  };
  f.noPermission=()=>assert.equal(M.OracleV8PlayPermissions.offers(game,player).length,0,'immediate permission is closed');
  return f;
}
for(const role of ['human','ai']) {
  test(`Conduit ${role}: pays for its selected graveyard permanent, then locks all further spells`,async()=>{
    const f=fixture(role),{game,player}=f;
    f.target=f.put('Arcane Signet','graveyard');const decoy=f.put("Black Panther's Claws",'graveyard');
    const lands=[f.put('Forest'),f.put('Forest')];
    await f.activate();await f.settle();
    assert.equal(f.target.zone,'battlefield');assert.equal(decoy.zone,'graveyard');
    assert.equal(f.target.castMeta.from,'graveyard');assert.equal(f.target.castMeta.manaSpent,2);
    assert.equal(lands.every(card=>card.tapped),true);assert.equal(player.turnState.cantCastAdditional,true);
    f.noPermission();
    const extra=f.put('Sol Ring','hand');f.put('Forest');
    assert.equal(game.castableList(player).some(row=>row.card===extra),false);
    assert.equal(await game.castSpell(player,extra,{from:'hand'}),false);assert.equal(extra.zone,'hand');
    assert.equal(await game.castSpell(player,decoy,{from:'graveyard',alt:f.target.castMeta.alt}),false);
  });
  for(const mode of ['declined','unaffordable'])test(`Conduit ${role}: ${mode} cast spends no mana and imposes no spell lock`,async()=>{
    const f=fixture(role,{choice:mode==='declined'?'no':'yes'}),{game,player}=f;
    f.target=f.put('Arcane Signet','graveyard');const land=f.put('Forest');
    if(mode==='declined')f.put('Forest');
    await f.activate();await f.settle();
    assert.equal(f.target.zone,'graveyard');assert.equal(land.tapped,false);
    assert.equal(!!player.turnState.cantCastAdditional,false);f.noPermission();
    assert.equal(await game.castSpell(player,f.target,{from:'graveyard'}),false,'unused permission cannot be used later');
    const ordinary=f.put('Sol Ring','hand');
    assert.equal(await game.castSpell(player,ordinary,{from:'hand'}),true);await f.settle();
    assert.equal(ordinary.zone,'battlefield');assert.equal(ordinary.castMeta.manaSpent,1);
  });
  for(const when of ['before activation','in response'])test(`Conduit ${role}: a spell cast ${when} prevents the graveyard cast`,async()=>{
    const f=fixture(role),{game,player}=f;f.target=f.put('Arcane Signet','graveyard');
    const lands=[f.put('Forest'),f.put('Forest')];f.put('Island');const opt=f.put('Opt','hand');
    if(when==='in response')await f.activate();
    assert.equal(await game.castSpell(player,opt,{from:'hand'}),true);
    assert.equal(opt.castMeta.manaSpent,1);
    if(when==='before activation'){await f.settle();await f.activate();}
    await f.settle();
    assert.equal(opt.zone,'graveyard');assert.equal(f.target.zone,'graveyard');
    assert.equal(lands.every(card=>!card.tapped),true);
    assert.equal(!!player.turnState.cantCastAdditional,false);f.noPermission();
  });
  for(const cancelSacrifice of [false,true])test(`Conduit ${role}: ${cancelSacrifice?'cancelled':'paid'} printed additional sacrifice ${cancelSacrifice?'does not lock casting':'is preserved'}`,async()=>{
    const f=fixture(role,{cancelSacrifice}),{player}=f;f.target=f.put('Demon of Catastrophes','graveyard');
    const sacrifice=f.put('Grizzly Bears'),lands=['Swamp','Swamp','Forest','Forest'].map(name=>f.put(name));
    await f.activate();await f.settle();f.noPermission();
    assert.equal(f.questions.some(q=>q.aiHint?.kind==='addlSac'),true,'the immediate cast reaches its printed sacrifice choice');
    assert.equal(f.target.zone,cancelSacrifice?'graveyard':'battlefield');
    assert.equal(sacrifice.zone,cancelSacrifice?'battlefield':'graveyard');
    assert.equal(!!player.turnState.cantCastAdditional,!cancelSacrifice);
    assert.equal(lands.every(card=>card.tapped===!cancelSacrifice),true,'cancelled casting leaves every mana source untapped');
    if(!cancelSacrifice)assert.equal(f.target.castMeta.manaSpent,4);
  });
  test(`Conduit ${role}: activation remains restricted to sorcery timing`,async()=>{
    const f=fixture(role),{game,player}=f;f.target=f.put('Arcane Signet','graveyard');f.put('Forest');f.put('Forest');
    const entry=game.activatableList(player).find(row=>row.card===f.conduit);assert.ok(entry);
    game.phase='combat';game.step='attackers';
    assert.equal(game.activatableList(player).some(row=>row.card===f.conduit),false);
    assert.equal(await game.activateAbility(player,entry),false);assert.equal(f.conduit.tapped,false);
    assert.equal(f.target.zone,'graveyard');f.noPermission();
  });
}
