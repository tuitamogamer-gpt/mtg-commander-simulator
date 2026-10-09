import strict from 'node:assert/strict';
import fs from 'node:fs';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=JSON.parse(fs.readFileSync(new URL('../fixtures/oracle-v74-static.json',import.meta.url))).map(c=>c.name);
export async function proveStaticV74(M,name,role,positive=true,h){
  let checks=0;const assert=Object.fromEntries(['equal','ok','deepEqual'].map(k=>[k,(...a)=>{checks++;strict[k](...a);} ]));
  const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
  h?.assertControllerRole?.(M,f,name);
  for(const p of g.players){fund(p);while(p.library.length<40)put(M,p,'Forest');}g.spotlight=async()=>{};
  const cast=async(c,p=a)=>{const n=total(p);assert.equal(await g.castSpell(p,c,{from:c.zone}),true);assert.ok(total(p)<n||!M.mv(c.def.cost));await settle(g);return c;};
  const source=()=>cast(put(M,a,name,'hand'));
  const donor=(p=a,extra={})=>permanent(M,g,p,def('V74 static witness',['Creature'],{power:'2',toughness:'8',...extra}));
  const suppress=c=>{M.OracleV8AbilityLoss.add(g,[c],{temporary:true});g.recalc();};
  const activate=async(c,index=0,resolve=true)=>{c.sick=false;const row=g.activatableList(a).find(r=>r.card===c&&r.ability===c.def.abilities[index]);assert.ok(row,name+' native activation offered');assert.equal(await g.activateAbility(a,row),true);if(resolve)await settle(g);};
  if(name==='Sigarda, Host of Herons'){
    const c=await source(),victim=donor(),own=donor();if(!positive)suppress(c);
    const edict=put(M,b,def('V74 opposing actual sacrifice spell',['Instant'],{cost:'{B}',resolve:async ctx=>{ctx.you.v74Sacrifice=await ctx.g.sacrifice(a,victim);}}),'hand');await cast(edict,b);
    assert.equal(victim.zone,positive?'battlefield':'graveyard');assert.equal(b.v74Sacrifice,!positive);
    const cost=put(M,a,def('V74 own sacrifice ability',['Artifact'],{cost:'{1}',abilities:[{cost:{sac:(game,card)=>card===own,sacN:1},run:async ctx=>ctx.g.draw(ctx.you,1,ctx.src)}]}),'hand');await cast(cost);
    const before=a.hand.length;await activate(cost);assert.equal(own.zone,'graveyard');assert.equal(a.hand.length,before+1);
  }else if(name==='Zilortha, Strength Incarnate'){
    const c=await source(),small=donor(a,{power:'2',toughness:'8'}),large=donor(a,{power:'8',toughness:'2'}),zero=donor(a,{power:'0',toughness:'3'}),enemy=donor(b);
    if(!positive)suppress(c);await g.checkSBA();assert.equal(zero.zone,'battlefield','zero power without damage lives');
    const result=[];await g.damageAny(enemy,small,3,{damageResults:result});await g.checkSBA();assert.equal(small.zone,positive?'graveyard':'battlefield');
    await g.damageAny(enemy,large,3);await g.checkSBA();assert.equal(large.zone,positive?'battlefield':'graveyard');
    await g.damageAny(enemy,zero,1);await g.checkSBA();assert.equal(zero.zone,positive?'graveyard':'battlefield');
    assert.equal(g.lethalDamageThreshold(enemy),8,'opponent still uses toughness');
  }else if(name==='Yurlok of Scorch Thrash'){
    const c=await source();for(const p of g.players)for(const k of Object.keys(p.pool))p.pool[k]=0;a.pool.C=1;c.sick=false;
    const row=g.manaSources(a).find(r=>r.card===c);assert.ok(row);const life=[a.life,b.life];
    assert.equal(await g.activateAbility(a,{card:c,manaAbility:true,manaSource:row}),true);assert.equal(total(a),3);assert.equal(total(b),3);
    if(!positive)suppress(c);a.persistMana={R:1};g.emptyPool();await settle(g);
    assert.equal(total(a),1);assert.equal(total(b),0);assert.equal(a.life,life[0]-(positive?2:0));assert.equal(b.life,life[1]-(positive?3:0));
  }else if(name==='Thelon of Havenwood'){
    const c=await source(),own=donor(a,{subtypes:['Fungus']}),foreign=donor(b,{subtypes:['Fungus']}),wrong=donor(a,{subtypes:['Elf']}),grave=put(M,b,def('V74 actual grave Fungus',['Creature'],{subtypes:['Fungus']}),'graveyard');
    choose(a,q=>q.type==='chooseCards'&&q.from.includes(grave)?{...q,from:[grave],min:1,max:1}:null);
    const mana=total(a);await activate(c);assert.equal(total(a),mana-2);assert.equal(grave.zone,'exile');assert.equal(own.counters.spore,1);assert.equal(foreign.counters.spore,1);assert.equal(wrong.counters.spore||0,0);
    if(!positive)suppress(c);g.recalc();assert.equal(own.power,positive?3:2);assert.equal(foreign.toughness,positive?9:8);
  }else if(name==='Captain America, Super-Soldier'){
    const c=await source(),hero=donor(a,{subtypes:['Hero']}),ordinary=donor(),foreign=donor(b,{subtypes:['Hero']}),hostile=donor(b);
    assert.equal(c.counters.shield,1);if(!positive)g.removeCounters(c,'shield',1);g.recalc();
    assert.equal(hero.kw('hexproof'),positive);assert.equal(ordinary.kw('hexproof'),false);assert.equal(foreign.kw('hexproof'),false);assert.equal(c.kw('hexproof'),false);
    assert.equal(g.legalTargets(M.T.player(),hostile,b).includes(a),!positive);
    if(positive){await g.damageAny(hostile,c,1);await settle(g);assert.equal(c.counters.shield||0,0);assert.equal(c.damage,0);assert.equal(hero.kw('hexproof'),false);}
  }else if(name==='Tomik, Distinguished Advokist'){
    const c=await source(),land=permanent(M,g,a,M.DEFS.Forest),grave=put(M,b,'Forest','graveyard'),hostile=donor(b),crucible=permanent(M,g,b,M.DEFS['Crucible of Worlds']);
    if(!positive)suppress(c);const target={what:'permanent',zone:'battlefield'};assert.equal(g.legalTargets(target,hostile,b).includes(land),!positive);assert.equal(g.legalTargets(target,c,a).includes(land),true);
    assert.equal(g.legalTargets({what:'card',zone:'graveyard'},hostile,b).includes(grave),!positive);
    g.turnPlayer=b;g.phase='main1';g.step='main';assert.equal(g.playableLands(b).includes(grave),!positive);assert.equal(await g.playLand(b,grave,{from:'graveyard'}),!positive);assert.equal(grave.zone,positive?'graveyard':'battlefield');
  }else if(name==='Tomik, Orzhov Lawmage'){
    const c=await source(),walker=permanent(M,g,a,def('V74 protected planeswalker',['Planeswalker'],{loyalty:5})),first=donor(b),second=donor(b),host=donor();g.addCounters(walker,'loyalty',5);g.addCounters(host,'+1/+1',1);g.recalc();
    choose(a,q=>q.type==='chooseTargets'?{...q,candidates:[host],min:1,max:1}:null);await activate(c,0,false);if(!positive){await g.move(host,'exile');await g.putPermanentOntoBattlefield(host,a);}await settle(g);assert.equal(host.kw('flying'),positive);
    if(!positive)suppress(c);g.turnPlayer=b;first.attacking=walker;assert.equal(g.canAttackTarget(second,walker),!positive);first.attacking=second.attacking=walker;const attackers=[first,second];M.OracleV74Static.pruneAttackers(g,attackers);assert.equal(attackers.length,positive?1:2);
    if(positive){suppress(walker);first.attacking=walker;assert.equal(g.canAttackTarget(second,walker),true,'later ability loss removes granted restriction');await g.move(c,'exile');await g.putPermanentOntoBattlefield(c,a);g.recalc();first.attacking=walker;assert.equal(g.canAttackTarget(second,walker),false,'later Tomik grants restriction after ability loss');}
  }else if(name==='Winter, Misanthropic Guide'){
    const c=await source();for(const [i,type]of ['Artifact','Creature','Instant',...(positive?['Sorcery']:[])].entries())put(M,a,def('V74 grave type '+i,[type]),'graveyard');
    assert.equal(g.maximumHandSize(b),positive?3:7);assert.equal(g.maximumHandSize(a),7);
    const hand=[a.hand.length,b.hand.length];await g.emit('upkeep',{player:a});await settle(g);assert.equal(a.hand.length,hand[0]+2);assert.equal(b.hand.length,hand[1]+2);
    await g.putPermanentOntoBattlefield(put(M,b,'Reliquary Tower','hand'),b);assert.equal(g.maximumHandSize(b),Infinity);
  }else if(name==='Haktos the Unscarred'){
    const random=g.rnd;g.rnd=()=>positive?0.4:0.9;const c=await source();g.rnd=random;const chosen=positive?3:4;assert.equal(c.meta.haktosV74.number,chosen);
    for(const n of [0,2,3,4,5]){const origin=donor(b,{cost:'{'+n+'}'});assert.equal(g.isProtectedFrom(c,origin),n!==chosen);}
    assert.equal(g.hasAttackRequirement(c),true);suppress(c);assert.equal(g.isProtectedFrom(c,donor(b,{cost:'{1}'})),false);
  }else if(name==='Jasmine Boreal of the Seven'){
    const c=await source(),plain=donor(a),flying=donor(b,{kws:['flying']}),blank=donor(b);if(!positive)suppress(c);
    assert.equal(g.canBlock(flying,plain),!positive);assert.equal(g.canBlock(blank,plain),true);
    if(positive){for(const k of Object.keys(a.pool))a.pool[k]=0;c.sick=false;const row=g.manaSources(a).find(r=>r.card===c);assert.ok(row);assert.equal(await g.activateAbility(a,{card:c,manaAbility:true,manaSource:row}),true);assert.equal(total(a),2);
      const bad=put(M,a,def('V74 forbidden ability creature',['Creature'],{cost:'{G}{W}',kws:['flying']}),'hand');assert.equal(await g.castSpell(a,bad),false);assert.equal(total(a),2);await cast(put(M,a,def('V74 paid vanilla',['Creature'],{cost:'{G}{W}'}),'hand'));assert.equal(total(a),0);}
  }else if(name==='Reed Richards, Smartest Man'){
    const c=await source();g.phase='draw';a.turnState.c1920DrawStepN=0;const n=a.hand.length;await g.draw(a,1);assert.equal(a.hand.length,n+1);
    a.turnState.c1920DrawStepN=0;await g.draw(a,1);assert.equal(a.hand.length,n+2,'first draw of an additional draw step is exempt');g.phase='main1';if(!positive)suppress(c);
    const hand=a.hand.length;await g.draw(a,2);assert.equal(a.hand.length,hand+(positive?5:2));assert.equal(g.maximumHandSize(a),positive?Infinity:7);
  }else if(name==='Brothers Yamazaki'){
    const first=await source(),second=await source();assert.equal(first.zone,'battlefield');assert.equal(second.zone,'battlefield');assert.equal(first.power,4);assert.equal(second.kw('haste'),true);
    if(positive){await g.checkSBA();assert.equal(g.creatures(a).filter(c=>c.name===name).length,2);}else {await source();await g.checkSBA();assert.equal(g.creatures(a).filter(c=>c.name===name).length,1);}
  }else throw Error('Missing complete static legend proof '+name);
  await settle(g);assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return checks;
}
