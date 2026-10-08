import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose,cards,targets,source} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';

export const names=['Edea, Possessed Sorceress','Fire Lord Zuko','Gleaming Splendor','Marvel Boy, Noh-Varr','Moonshadow','Neerdiv, Devious Diver','Pia Nalaar, Consul of Revival','Rayne, Academy Chancellor','Rune-Brand Juggler','The Queen of Dale','Amulet of Safekeeping','Dormant Gomazoa','Surrak, Elusive Hunter'];
export async function proveCommonV35(M,name,role,h,assert=strict){
  const f=h?h.gameFor(M,undefined,{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
  for(const p of g.players){fund(p);while(p.library.length<40)put(M,p,'Forest');}
  g.reviewCombatWithHuman=async()=>{};g.spotlight=async()=>{};
  const donor=(p,extra={})=>permanent(M,g,p,def('Event witness',['Creature'],{toughness:'12',...extra}));
  const suspected=name==='Rune-Brand Juggler'?donor(a):null;if(suspected)targets(a,[suspected]);
  const c=await source(M,f,name,settle);c.sick=false;
  const cast=async(p,d,from='hand',resolve=true)=>{
    const card=typeof d==='string'||!d.zone?put(M,p,d,from):d,paid=total(p);
    const turn=g.turnPlayer;g.turnPlayer=p;assert.equal(await g.castSpell(p,card,{from}),true);assert.ok(total(p)<paid);if(resolve)await settle(g);g.turnPlayer=turn;return card;
  };
  const activate=async(card,predicate=()=>true)=>{
    const row=g.activatableList(a).find(row=>row.card===card&&predicate(row));assert.ok(row);const paid=total(a);
    assert.equal(await g.activateAbility(a,row),true);await settle(g);assert.ok(total(a)<paid);return row;
  };
  if(name==='Edea, Possessed Sorceress'){
    const victim=donor(b);targets(a,[victim]);await g.emit('beginCombat',{player:a});await settle(g);
    assert.equal(victim.ctrl,a);assert.equal(victim.kw('haste'),true);const hand=a.hand.length;
    await g.destroy(victim);await settle(g);assert.equal(victim.zone,'battlefield');assert.equal(victim.ctrl,b);assert.equal(a.hand.length,hand+1);
    await g.destroy(donor(a));await settle(g);assert.equal(a.hand.length,hand+1);
  }else if(name==='Fire Lord Zuko'||name==='Pia Nalaar, Consul of Revival'){
    const fromHand=await cast(a,def('Hand creature',['Creature']));assert.equal(c.counters['+1/+1']||0,0);assert.equal(g.bf().filter(x=>x.isToken).length,0);
    const exiledCreature=put(M,a,def('Exiled creature',['Creature'])),land=put(M,a,'Forest');
    await source(M,f,'Light Up the Stage',settle);assert.equal(exiledCreature.zone,'exile');assert.equal(land.zone,'exile');
    assert.equal(await g.playLand(a,land),true);await settle(g);await cast(a,exiledCreature,'exile');
    if(name==='Fire Lord Zuko'){
      assert.equal(c.counters['+1/+1'],2);assert.equal(fromHand.counters['+1/+1'],2);assert.equal(exiledCreature.counters['+1/+1']||0,0);
    }else{
      const tokens=g.bf().filter(x=>x.isToken&&x.hasSub('Thopter'));assert.equal(tokens.length,2);assert.ok(tokens.every(x=>x.kw('haste')));
    }
  }else if(name==='Gleaming Splendor'){
    await g.draw(a,2);await settle(g);assert.equal(g.bf().filter(x=>x.isToken).length,0);
    await g.draw(b,1);await settle(g);assert.equal(g.bf().filter(x=>x.isToken).length,0);
    await g.draw(b,1);await settle(g);assert.equal(g.bf().filter(x=>x.hasSub('Treasure')).length,1);
    await g.draw(b,1);await settle(g);assert.equal(g.bf().filter(x=>x.hasSub('Treasure')).length,1);
    const own=a.hand.length,opponent=b.hand.length;await activate(c);assert.equal(a.hand.length,own+1);assert.equal(b.hand.length,opponent+1);
  }else if(name==='Marvel Boy, Noh-Varr'){
    const hero=await source(M,f,'Brave Brawler',settle);assert.equal(c.counters['+1/+1'],1);
    await activate(hero,row=>row.ability?.powerUpV20||row.ability?.powerUp);assert.equal(c.counters['+1/+1'],2);
    const ordinary=donor(a,{abilities:[{cost:{mana:'{1}'},run:async()=>{}}]});await activate(ordinary);assert.equal(c.counters['+1/+1'],2);
    await cast(b,'Brave Brawler');assert.equal(c.counters['+1/+1'],2);
  }else if(name==='Moonshadow'){
    assert.equal(c.counters['-1/-1'],6);
    put(M,a,'Forest');put(M,a,def('Milled artifact',['Artifact']));await g.mill(a,2);await settle(g);assert.equal(c.counters['-1/-1'],5);
    put(M,a,def('Milled instant',['Instant']));await g.mill(a,1);await settle(g);assert.equal(c.counters['-1/-1'],5);
    await g.mill(b,1);await settle(g);assert.equal(c.counters['-1/-1'],5);
    g.removeCounters(c,'-1/-1',5);let count=0;const queue=g.queueTrigger.bind(g);g.queueTrigger=row=>{if(row.src===c)count++;return queue(row);};
    await g.mill(a,1);await settle(g);assert.equal(count,0);
  }else if(name==='Neerdiv, Devious Diver'){
    const skeleton=put(M,a,'Reassembling Skeleton','graveyard'),hand=a.hand.length;await activate(skeleton,row=>row.gyAbility);
    assert.equal(skeleton.zone,'battlefield');assert.equal(c.counters['+1/+1'],1);assert.equal(a.hand.length,hand+1);
    const ordinary=donor(a,{abilities:[{cost:{mana:'{1}'},run:async()=>{}}]});await activate(ordinary);assert.equal(c.counters['+1/+1'],1);assert.equal(a.hand.length,hand+1);
    const twice=put(M,a,'Think Twice','graveyard'),offer=g.castableList(a).find(row=>row.card===twice);assert.ok(offer);
    assert.equal(await g.castSpell(a,twice,{from:offer.from,alt:offer.alt}),true);await settle(g);assert.equal(c.counters['+1/+1'],2);assert.equal(a.hand.length,hand+3);
  }else if(name==='Rune-Brand Juggler'){
    const sacrifice=suspected,victim=donor(b,{toughness:'4'});assert.equal(sacrifice.meta.suspected,true);await g.move(sacrifice,'exile');await g.putPermanentOntoBattlefield(sacrifice,a);targets(a,[victim]);
    assert.equal(g.activatableList(a).some(row=>row.card===c),false);
    const second=put(M,a,name,'hand');targets(a,[sacrifice]);assert.equal(await g.castSpell(a,second,{from:'hand'}),true);await settle(g);assert.equal(sacrifice.meta.suspected,true);
    targets(a,[victim]);cards(a,[sacrifice]);await activate(c);assert.equal(sacrifice.zone,'graveyard');assert.equal(victim.zone,'graveyard');
  }else if(name==='The Queen of Dale'){
    const nonland=put(M,a,def('Recruit discard',['Instant']),'hand');cards(a,[nonland]);const hand=a.hand.length;
    await cast(b,def('Opponent creature',['Creature']));assert.equal(a.hand.length,hand);assert.equal(nonland.zone,'hand');
    await cast(b,def('First opposing noncreature',['Instant'],{resolve:async()=>{}}));assert.equal(nonland.zone,'graveyard');assert.equal(a.hand.length,hand);
    assert.equal(g.bf().filter(x=>x.isToken&&x.hasSub('Soldier')).length,1);
    const after=a.library.length;await cast(b,def('Second opposing noncreature',['Instant'],{resolve:async()=>{}}));assert.equal(a.library.length,after);
    await cast(a,def('Own noncreature',['Instant'],{resolve:async()=>{}}));assert.equal(a.library.length,after);
  }else if(['Rayne, Academy Chancellor','Amulet of Safekeeping','Dormant Gomazoa','Surrak, Elusive Hunter'].includes(name)){
    const own=donor(a),foreign=donor(b),targetSpell=async(p,target)=>{
      targets(p,[target]);const spec=target instanceof M.Player?M.T.player():target.kind==='spell'?M.T.spell():M.T.creature();let resolved=false;
      await cast(p,def('Targeting witness',['Instant'],{targets:[spec],resolve:async()=>{resolved=true;}}));return resolved;
    };
    if(name==='Amulet of Safekeeping'){
      let pay=false;choose(b,q=>q.type==='chooseOption'&&q.prompt.startsWith('Pay {1} to prevent counter')?{...q,options:q.options.filter(o=>o.key===(pay?'yes':'no'))}:null);
      assert.equal(await targetSpell(b,a),false);assert.equal(await targetSpell(b,b),true);assert.equal(await targetSpell(a,a),true);
      pay=true;
      assert.equal(await targetSpell(b,a),true);
    }else if(name==='Dormant Gomazoa'){
      assert.equal(c.tapped,true);await targetSpell(b,b);assert.equal(c.tapped,true);await targetSpell(b,a);assert.equal(c.tapped,false);
      g.tap(c);await g.runBeginningPhase(a);await settle(g);assert.equal(c.tapped,true);
    }else if(name==='Rayne, Academy Chancellor'){
      const hand=a.hand.length;await targetSpell(b,foreign);assert.equal(a.hand.length,hand);await targetSpell(b,a);assert.equal(a.hand.length,hand+1);
      targets(a,[c]);await source(M,f,'Curiosity',settle);const before=a.hand.length;await targetSpell(b,own);assert.equal(a.hand.length,before+2);
    }else{
      const hand=a.hand.length;await targetSpell(b,foreign);assert.equal(a.hand.length,hand);await targetSpell(b,own);assert.equal(a.hand.length,hand+1);
      const creature=await cast(a,def('Creature on Stack',['Creature']), 'hand',false),object=g.stack.find(row=>row.card===creature),before=a.hand.length;
      assert.ok(object);await targetSpell(b,object);assert.equal(a.hand.length,before+1);assert.equal(creature.zone,'battlefield');
    }
  }else throw Error('Missing v35 proof '+name);
  assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV35(M,entry,op,role,h){
  if(!names.includes(entry.raw.name)||!op.eventTestV35&&!(entry.raw.name==='Rune-Brand Juggler'&&op.kind==='generic-ability'))return null;
  let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));
  await proveCommonV35(M,entry.raw.name,role,h,assert);return count;
}
