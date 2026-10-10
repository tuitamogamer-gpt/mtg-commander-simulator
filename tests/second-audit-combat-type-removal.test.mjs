import test from 'node:test';
import assert from 'node:assert/strict';
import {M,table,paidCast,paidAbility,stable} from './helpers/second-audit-combat-fixtures.mjs';

for(const mode of ['planeswalker becomes a land','blocking hybrid loses creature but remains planeswalker','blocking hybrid loses planeswalker but remains creature'])test('second combat: native paid '+mode,async()=>{
  const f=table(),attacker=f.put('Colossal Dreadmaw','hand'),walker=f.put('Jace Beleren','hand',f.b);
  // Count dispatch, after the simultaneous batch finishes. Damage wrappers
  // may clone data while queuing, so payload identity cannot deduplicate it.
  const hits=[],emit=f.g.emit.bind(f.g);
  f.g.emit=async(event,data,...args)=>{
    if(event==='dealtDamage'&&!f.g._damageEventQueue&&data.combat&&data.src===attacker&&data.target===walker)hits.push(data);
    return emit(event,data,...args);
  };
  f.lands([...Array(4).fill('Island'),...Array(20).fill('Forest')]);
  f.lands([...Array(6).fill('Island'),...Array(6).fill('Plains'),...Array(24).fill('Forest')],f.b);
  f.lands([...Array(18).fill('Island'),...Array(16).fill('Forest')],f.c);
  const landMode=mode==='planeswalker becomes a land',creatureLost=mode.includes('loses creature');
  const source=f.put(landMode?"Sigarda's Aid":'Ensoul Artifact','hand',f.b);
  const response=f.put(landMode?'Imprisoned in the Moon':creatureLost?'Naturalize':"Luxior, Giada's Gift",'hand',f.b);
  const blocker=landMode?f.put('Ornithopter','hand',f.b):walker;
  const shikari=!landMode&&!creatureLost?f.put('Leonin Shikari','hand',f.b):null;
  const indestructible=shikari?f.put('Indestructibility','hand',f.b):null;
  const growth=shikari?f.put('Giant Growth','hand'):null;
  let removalPaid=false,growthPaid=false,blocked=false,observed;
  f.targets=(p,q)=>{
    if(q.src===growth&&q.candidates.includes(attacker))return [attacker];
    if(q.src===response&&q.candidates.includes(creatureLost?source:walker))return [creatureLost?source:walker];
    if(!landMode&&q.src===source&&q.candidates.includes(walker))return [walker];
    if(q.src===indestructible&&q.candidates.includes(walker))return [walker];
    if(q.src?.name==='Memnarch'&&q.candidates.includes(walker))return [walker];
    return undefined;
  };
  f.g.turnPlayer=f.b;await paidCast(f,f.b,walker);
  if(!landMode){
    const memnarch=f.put('Memnarch','hand',f.c);f.g.turnPlayer=f.c;
    await paidCast(f,f.c,memnarch);await paidAbility(f,f.c,memnarch,ab=>ab.cost?.mana==='{1}{U}{U}');
    assert.equal(walker.is('Artifact'),true);f.g.turnPlayer=f.b;
  }
  await paidCast(f,f.b,source);
  if(landMode)await paidCast(f,f.b,blocker);
  if(shikari){await paidCast(f,f.b,shikari);await paidCast(f,f.b,response);await paidCast(f,f.b,indestructible);}
  f.g.turnPlayer=f.a;
  f.main=(p,q)=>{
    if(p===f.a&&q.phase==='main1'&&attacker.zone==='hand'){
      const row=q.casts.find(row=>row.card===attacker);assert.ok(row);return {kind:'cast',card:attacker,from:row.from,alt:row.alt};
    }
    return {kind:'done'};
  };
  f.attackers=(p,q)=>p===f.a&&f.a.turnsStarted===2&&q.eligible.includes(attacker)?[{card:attacker,target:walker}]:[];
  f.blockers=(p,q)=>{
    if(p===f.b&&q.attackers.includes(attacker)&&q.potential.includes(blocker)){
      blocked=true;return [{blocker,attacker}];
    }
    return [];
  };
  f.priority=(p,q)=>{
    if(!f.g.combat?.attackers.includes(attacker))return {kind:'pass'};
    if(!removalPaid&&p===f.b&&f.g.step===(landMode?'attackers':'blockers')){
      removalPaid=true;
      if(shikari){
        const entry=q.acts.find(row=>row.card===response&&(row.equip||row.ability?.oracleEquip));assert.ok(entry,'real Shikari permits a printed equip ability at priority');
        return {kind:'activate',entry};
      }
      const row=q.casts.find(row=>row.card===response);assert.ok(row,'real paid type-removal response');
      return {kind:'cast',card:response,from:row.from,alt:row.alt};
    }
    if(growth&&removalPaid&&!growthPaid&&p===f.a){
      const row=q.casts.find(row=>row.card===growth);assert.ok(row);growthPaid=true;
      return {kind:'cast',card:growth,from:row.from,alt:row.alt};
    }
    if(f.g.step==='blockers'&&!f.g.stack.length&&removalPaid){
      observed={attacking:!!attacker.attacking,retained:f.g.combat.attackers.includes(attacker),sameDestination:attacker.attacking===walker,
        creature:walker.is('Creature'),walker:walker.is('Planeswalker'),blocking:attacker.blockedBy.includes(walker)};
    }
    return {kind:'pass'};
  };
  await f.g.runTurn();for(let n=0;n<4;n++)await f.g.runTurn();
  assert.equal(removalPaid,true);assert.equal(blocked,true);assert.ok(observed);
  assert.equal(observed.attacking,true);assert.equal(observed.retained,true);
  if(landMode){
    assert.equal(walker.zone,'battlefield');assert.equal(walker.is('Land'),true);assert.equal(walker.is('Planeswalker'),false);
    assert.equal(hits.length,0,'a former planeswalker that is now a land is no damage destination');
    assert.equal(blocker.zone,'graveyard');assert.equal(observed.sameDestination,false);
  }else if(creatureLost){
    assert.equal(observed.creature,false);assert.equal(observed.walker,true);assert.equal(observed.blocking,false);
    assert.equal(observed.sameDestination,true,'CR506.4d preserves the attacked planeswalker when only its blocking creature type disappears');
    assert.equal(walker.zone,'graveyard','trample still reaches the planeswalker after its blocker role ends');
  }else{
    assert.equal(growthPaid,true);assert.equal(observed.creature,true);assert.equal(observed.walker,false);assert.equal(observed.blocking,true);
    assert.equal(observed.sameDestination,false,'the permanent keeps blocking as a creature while its attacked planeswalker role ends');
    assert.equal(walker.zone,'battlefield');assert.equal(walker.kw('indestructible'),true);
    assert.equal(hits.reduce((n,hit)=>n+hit.n,0),8,'only lethal blocker damage reaches the former planeswalker creature; ordinary trample overflow has no destination');
  }
  assert.equal(f.b.life,40);assert.equal(f.c.life,40);
  stable(f,'native combat role type change '+mode);
});
