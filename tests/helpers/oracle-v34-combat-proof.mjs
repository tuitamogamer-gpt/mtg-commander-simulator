import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose,targets,source} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
import {fundSnow} from './oracle-snow-proof.mjs';

export const names=['Hunt Down','Feral Contest','Monstrous Step','Impetuous Devils','Turntimber Basilisk','Tower Above','Mark for Death','Undercover Butler','Canal Courier','Lairwatch Giant','Rashka the Slayer','Hundred-Handed One','Vortex Elemental','Righteous Indignation','Act of Heroism','Yare','Rimehorn Aurochs'];
export async function proveCombatV34(M,name,role,h,assert=strict){
  const f=h?h.gameFor(M,undefined,{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
  const third=g.addPlayer('Third',{name:'Third'},b.controller,false);
  for(const p of g.players){fund(p);while(p.library.length<30)put(M,p,'Forest');}
  g.reviewCombatWithHuman=async()=>{};g.spotlight=async()=>{};
  const donor=(p,extra={})=>permanent(M,g,p,def('Combat witness',['Creature'],{power:'2',toughness:'20',...extra}));
  const combat=(attackers,defender=b)=>{
    g.phase='combat';g.step='attackers';g.combat={attackers,defenders:new Map(),declaredAttackTargets:[defender],blockersDeclared:false,hadAttackers:true};
    for(const card of attackers){card.attacking=defender;card.blockedBy=[];card.wasBlocked=false;}
  };
  const castWith=async selections=>{
    let index=0;choose(a,q=>{if(q.type!=='chooseTargets'||index>=selections.length)return null;const selected=selections[index++];return {...q,candidates:q.candidates.filter(c=>c===selected),min:1,max:1};});
    return source(M,f,name,settle);
  };
  const activate=async(c,index)=>{
    const action=g.activatableList(a).find(row=>row.card===c&&row.ability===c.def.abilities[index]);assert.ok(action);
    const before=total(a);assert.equal(await g.activateAbility(a,action),true);await settle(g);assert.ok(total(a)<before);
  };
  if(name==='Rimehorn Aurochs'){
    const c=await source(M,f,name,settle),attacker=donor(a),blocker=donor(b);c.sick=false;
    let i=0;choose(a,q=>{if(q.type!=='chooseTargets')return null;const wanted=[blocker,attacker][i++];return {...q,candidates:q.candidates.filter(card=>card===wanted),min:1,max:1};});
    await fundSnow(M,g,a,c.def);await activate(c,0);combat([attacker]);g.completeRequiredBlocks([attacker],[blocker]);assert.ok(attacker.blockedBy.includes(blocker));
    await g.move(attacker,'exile');await g.putPermanentOntoBattlefield(attacker,a);attacker.sick=false;combat([attacker]);g.completeRequiredBlocks([attacker],[blocker]);assert.equal(attacker.blockedBy.length,0);
  }else if(['Hunt Down','Feral Contest','Monstrous Step','Tower Above'].includes(name)){
    const attacker=donor(a),blocker=donor(b),other=donor(b),power=attacker.power;
    await castWith(name==='Hunt Down'?[blocker,attacker]:name==='Tower Above'?[attacker]:[attacker,blocker]);
    if(name==='Feral Contest')assert.equal(attacker.counters['+1/+1'],1);
    if(name==='Monstrous Step')assert.equal(attacker.power,power+7);
    if(name==='Tower Above'){
      assert.equal(attacker.power,power+4);assert.equal(attacker.kw('wither'),true);assert.equal(attacker.kw('trample'),true);
      targets(a,[blocker]);combat([attacker]);await g.emit('attacks',{player:a,card:attacker,defender:b});await settle(g);
    }else combat([attacker]);
    g.completeRequiredBlocks([attacker],[blocker,other]);assert.ok(attacker.blockedBy.includes(blocker));assert.equal(!!other.cur.requiredBlockSources?.length,false);
    const version=attacker.zoneVersion;await g.move(attacker,'exile');await g.putPermanentOntoBattlefield(attacker,a);attacker.sick=false;
    assert.ok(attacker.zoneVersion>version);combat([attacker]);g.completeRequiredBlocks([attacker],[blocker,other]);assert.equal(attacker.blockedBy.length,0);
  }else if(name==='Mark for Death'){
    const attacker=donor(a),blocker=donor(b),other=donor(b),foreign=donor(third);g.tap(blocker);
    await castWith([blocker]);assert.equal(blocker.tapped,false);assert.equal(other.cur.cantBlock,true);assert.equal(foreign.cur.cantBlock,false);
    combat([attacker]);g.completeRequiredBlocks([attacker],[blocker,other]);assert.ok(attacker.blockedBy.includes(blocker));assert.equal(g.canBlock(other,attacker),false);
  }else if(name==='Act of Heroism'||name==='Yare'){
    const blocker=donor(a),attackers=[donor(b),donor(b),donor(b),donor(b)];g.tap(blocker);combat(attackers,a);g.turnPlayer=b;
    if(name==='Yare')g.untap(blocker);
    const power=blocker.power,toughness=blocker.toughness;await castWith([blocker]);
    assert.equal(blocker.tapped,false);assert.equal(blocker.power,power+(name==='Yare'?3:2));assert.equal(blocker.toughness,toughness+(name==='Yare'?0:2));
    const n=name==='Yare'?3:2;assert.equal(g.blockerCapacity(blocker),n);
    assert.equal(g.blockDeclarationLegal(attackers,attackers.slice(0,n).map(attacker=>({attacker,blocker}))),true);
    assert.equal(g.blockDeclarationLegal(attackers,attackers.slice(0,n+1).map(attacker=>({attacker,blocker}))),false);
    if(name==='Yare'){
      const spell=put(M,a,name,'hand'),spec=spell.def.targets[0];assert.equal(g.legalTargets(spec,spell,a).includes(attackers[0]),false);
      await g.endCombatStep(b);assert.equal(g.legalTargets(spec,spell,a).length,0);
    }
  }else if(name==='Hundred-Handed One'){
    const c=await source(M,f,name,settle);assert.equal(g.blockerCapacity(c),1);assert.equal(c.kw('reach'),false);assert.equal(c.kw('vigilance'),true);
    await activate(c,0);assert.equal(c.counters['+1/+1'],3);assert.equal(g.blockerCapacity(c),100);assert.equal(c.kw('reach'),true);
    await activate(c,0);assert.equal(c.counters['+1/+1'],3);
  }else if(name==='Turntimber Basilisk'||name==='Impetuous Devils'){
    const c=await source(M,f,name,settle),blocker=donor(b);c.sick=false;targets(a,[blocker]);
    assert.equal(c.kw(name==='Turntimber Basilisk'?'deathtouch':'haste'),true);
    if(name==='Turntimber Basilisk'){
      await g.putPermanentOntoBattlefield(put(M,b,'Forest','hand'),b);await settle(g);assert.equal(!!blocker.cur.requiredBlockSources?.length,false);
      await g.playLand(a,put(M,a,'Forest','hand'));await settle(g);
    }
    combat([c]);if(name==='Impetuous Devils'){await g.emit('attacks',{player:a,card:c,defender:b});await settle(g);assert.equal(c.kw('trample'),true);}
    g.completeRequiredBlocks([c],[blocker]);assert.ok(c.blockedBy.includes(blocker));
    await g.endCombatStep(a);if(name==='Impetuous Devils'){
      assert.equal(!!blocker.cur.requiredBlockSources?.length,false);await g.emit('endStep',{player:a});await settle(g);assert.equal(c.zone,'graveyard');
    }
  }else if(name==='Undercover Butler'||name==='Canal Courier'){
    const c=await source(M,f,name,settle),other=donor(a);c.sick=false;combat([c,other]);
    if(name==='Undercover Butler'){
      third.life=b.life+1;await g.emit('attacks',{player:a,card:c,defender:b});await settle(g);assert.equal(!!c.cur.unblockable,false);
      b.life=third.life;await g.emit('attacks',{player:a,card:other,defender:b});await settle(g);assert.equal(!!c.cur.unblockable,false);
      await g.emit('attacks',{player:a,card:c,defender:b});await settle(g);assert.equal(c.cur.unblockable,true);
    }else{
      assert.equal(g.monarch,a);await g.emit('attackersDeclared',{player:a,attackers:[c,other]});await settle(g);assert.equal(!!c.cur.unblockable,false);
      other.attacking=third;await g.emit('attackersDeclared',{player:a,attackers:[c,other]});await settle(g);assert.equal(c.cur.unblockable,true);
    }
    await g.endCombatStep(a);assert.equal(!!c.cur.unblockable,name==='Undercover Butler');
  }else if(name==='Lairwatch Giant'||name==='Rashka the Slayer'){
    const c=await source(M,f,name,settle),first=donor(b),second=donor(b),power=c.power,toughness=c.toughness;
    combat([first,second],a);first.blockedBy=[c];g.combat.blockersDeclared=true;
    await g.emit('blockersDeclared',{player:b,attackers:[first,second]});await settle(g);
    if(name==='Lairwatch Giant'){
      assert.equal(g.blockerCapacity(c),2);assert.equal(c.kw('first strike'),false);second.blockedBy=[c];
      await g.emit('blockersDeclared',{player:b,attackers:[first,second]});await settle(g);assert.equal(c.kw('first strike'),true);
    }else{
      assert.equal(c.power,power);first.def.colorsOverride=['B'];second.def.colorsOverride=['B'];g.recalc();second.blockedBy=[c];
      await g.emit('blockersDeclared',{player:b,attackers:[first,second]});await settle(g);assert.equal(c.power,power+1);assert.equal(c.toughness,toughness+2);assert.equal(c.kw('reach'),true);
    }
  }else if(name==='Righteous Indignation'){
    await source(M,f,name,settle);const attacker=donor(b),blocker=donor(a),power=blocker.power;
    await g.emit('blocks',{player:a,attacker,blocker});await settle(g);assert.equal(blocker.power,power);
    attacker.def.colorsOverride=['R'];g.recalc();await g.emit('blocks',{player:a,attacker,blocker});await settle(g);assert.equal(blocker.power,power+1);
    await g.emit('blocks',{player:a,attacker,blocker});await g.move(blocker,'exile');await g.putPermanentOntoBattlefield(blocker,a);await settle(g);assert.equal(blocker.power,power);
  }else if(name==='Vortex Elemental'){
    const c=await source(M,f,name,settle),blocker=donor(b),other=donor(third);c.sick=false;targets(a,[blocker]);await activate(c,1);
    combat([c]);g.completeRequiredBlocks([c],[blocker]);assert.ok(c.blockedBy.includes(blocker));
    let shuffles=0;const shuffle=M.shuffle;M.shuffle=(...args)=>{shuffles++;return shuffle(...args);};
    try{await activate(c,0);}finally{M.shuffle=shuffle;}
    assert.equal(c.zone,'library');assert.equal(blocker.zone,'library');assert.equal(other.zone,'battlefield');assert.equal(shuffles,2);
  }else throw Error('Missing combat proof '+name);
  assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV34(M,entry,op,role,h){
  if(!names.includes(entry.raw.name)||op.kind==='cycling'||entry.raw.name==='Rimehorn Aurochs'&&op.kind!=='generic-ability')return null;
  let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));
  await proveCombatV34(M,entry.raw.name,role,h,assert);return count;
}
