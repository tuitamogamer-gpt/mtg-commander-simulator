// Starter Commander cards with graveyard, combat, and Stack interactions.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M=MTG,E=M.E,T=M.T,SC=M.SCRIPTS;
  const {same,grave,soldier,dragon,choose,option,reanimateMany,enterTrigger,attacks,ownEnd}=M.StarterPrecons;
  const flat=targets=>(targets||[]).flat(Infinity).filter(Boolean);
  const optional=ctx=>option(ctx,[{key:'yes',label:'Yes'},{key:'no',label:'No'}],'use this effect');
  const opponentGraves=(g,self,data,predicate)=>E.eachOpp(g,self.ctrl).map(player=>grave((game,card)=>card.owner===player&&predicate(card),
    {upTo:true,min:0,count:1,prompt:player.name+' — choose up to one card'}));
  const loyalty=(n,label,run,extra={})=>({loyalty:n,sorcery:true,label,run,...extra});
  function animate(ctx,change){if(same(ctx))ctx.g.addOracleAnimation(ctx.src,{keywords:[],types:['Creature'],subtypes:[],temporary:true,...change});}

  SC["Cartographer's Hawk"]={triggers:[{on:'combatDamageToPlayer',filter:(g,self,d)=>d.card===self&&g.lands(d.player).length>g.lands(self.ctrl).length,
    desc:'Return to hand, then search for a Plains',run:async ctx=>{
      if(!same(ctx))return;
      await ctx.g.move(ctx.src,'hand');
      if(ctx.src.zone==='hand'&&await optional(ctx)==='yes')await E.searchLandByName(ctx.g,ctx.you,['Plains'],{tapped:true});
    }}]};
  SC['Diluvian Primordial']={triggers:[enterTrigger('Cast spells from opponents’ graveyards',async ctx=>{
    for(const card of flat(ctx.targets))await M.OracleV8PlayPermissions.castOne(ctx,[card],{free:true,exileAfter:true},{});
  },{targets:(g,self,data)=>opponentGraves(g,self,data,c=>c.is('Instant')||c.is('Sorcery'))})]};
  SC['Sepulchral Primordial']={triggers:[enterTrigger('Return creatures from opponents’ graveyards',async ctx=>{
    await reanimateMany(ctx,flat(ctx.targets));
  },{targets:(g,self,data)=>opponentGraves(g,self,data,c=>c.is('Creature'))})]};
  SC['Gisa and Geralf']={starterGisa:true,triggers:[enterTrigger('Mill four cards',async ctx=>{await ctx.g.mill(ctx.you,4);})]};
  SC['Scourge of Nel Toth']={starterScourge:true};
  SC["Sephara, Sky's Blade"]={starterSephara:true,statics:[{apply:(g,self,bf)=>{
    for(const c of bf)if(c!==self&&c.ctrl===self.ctrl&&c.is('Creature')&&c.kw('flying'))c.cur.kw.add('indestructible');
  }}]};
  SC['Jubilant Skybonder']={starterFlyingTargetTax:true};
  SC['Havengul Lich']={abilities:[{label:'Cast a creature from a graveyard this turn',cost:{mana:'{1}'},targets:[grave((g,c)=>c.is('Creature'))],
    run:async ctx=>{
      const card=ctx.targets[0];
      ctx.g.starterLichGrants||=[];
      ctx.g.starterLichGrants.push({id:(ctx.g.starterLichSerial=(ctx.g.starterLichSerial||0)+1),
        card:card.iid,version:card.zoneVersion,player:ctx.you.idx,turn:ctx.g.turnNo,source:ctx.src.iid,sourceVersion:ctx.sourceZoneVersion});
    },aiScore:(g,c,p)=>g.players.some(player=>player.graveyard.some(card=>card.is('Creature')))?4:-2}]};
  SC['Laboratory Drudge']={triggers:[{on:'endStep',desc:'Draw after using a graveyard card',
    filter:(g,self)=>!!self.ctrl.turnState.starterGraveActivity,onlyIf:(g,self)=>!!self.ctrl.turnState.starterGraveActivity,
    run:async ctx=>{await ctx.g.draw(ctx.you,1);}}]};
  SC['Grimoire of the Dead']={abilities:[
    {label:'Study',cost:{mana:'{1}',tap:true,discard:1},run:async ctx=>{if(same(ctx))ctx.g.addCounters(ctx.src,'study',1);},aiScore:()=>3},
    {label:'Return all creatures as black Zombies',cost:{tap:true,rmCounter:{kind:'study',n:3},sacSelf:true},
      run:async ctx=>{await reanimateMany(ctx,ctx.g.players.flatMap(p=>p.graveyard.filter(c=>c.is('Creature'))),card=>{
        ctx.g.untilEffects.push({kind:'oracleCharacteristics',iid:card.iid,zoneVersion:card.zoneVersion,
          timestamp:ctx.g.nextOracleTimestamp(),expires:'object',colors:['B'],creatureType:'Zombie',retain:true});ctx.g.recalc();
      });},aiScore:()=>12},
  ]};
  SC['Unbreathing Horde']={asEnters:async(g,self)=>{
    g.addCounters(self,'+1/+1',g.bf().filter(c=>c!==self&&c.ctrl===self.ctrl&&c.hasSub('Zombie')).length+
      self.ctrl.graveyard.filter(c=>c.hasSub('Zombie')).length);
  },replace:[{event:'damage',prevent:true,applies:(g,d,self)=>d.target===self,
    run:(g,d,self)=>{g.removeCounters(self,'+1/+1',1);return 0;}}]};
  SC['Slate of Ancestry']={abilities:[{label:'Discard your hand; draw for your creatures',cost:{mana:'{4}',tap:true,discard:'all'},
    run:async ctx=>{await ctx.g.draw(ctx.you,ctx.g.creatures(ctx.you).length);},aiScore:(g,c,p)=>g.creatures(p).length-p.hand.length}]};
  SC['Trostani Discordant']={statics:[{apply:(g,self,bf)=>{for(const c of bf)if(c!==self&&c.ctrl===self.ctrl&&c.is('Creature')){c.cur.power++;c.cur.toughness++;}}}],
    triggers:[enterTrigger('Create two lifelink Soldiers',async ctx=>{await ctx.g.makeTokens(soldier,ctx.you,{n:2});}),
      {on:'endStep',filter:ownEnd,desc:'Each player regains their creatures',run:async ctx=>{
        for(const c of ctx.g.creatures())if(!c.owner.lost)M.OracleV8Control.gain(ctx.g,c,c.owner);ctx.g.recalc();
      }}]};
  SC['Loaming Shaman']={triggers:[enterTrigger('Shuffle chosen graveyard cards into a library',async ctx=>{
    const player=ctx.targets[0];
    if(!player)return;
    for(const card of flat(ctx.targets.slice(1)))await ctx.g.move(card,'library');M.shuffle(player.library,ctx.g.rnd);
  },{targets:[T.player(),grave(()=>true,{count:1000,min:0,upTo:true,
    dependentFilter:(g,card,previous)=>card.owner===flat(previous).find(c=>c instanceof M.Player),aiHint:{kind:'graveyardShuffle'}})]})]};
  SC['Provoke the Trolls']={targets:[T.any({aiHint:{goal:'damage'}})],resolve:async ctx=>{
    const results=[];await ctx.g.damageAny(ctx.src,ctx.targets[0],3,{deferSBA:true,damageResults:results});
    for(const row of results)if(row.amount>0&&row.target.is?.('Creature')&&row.target.zone==='battlefield')E.pumpUntilEOT(ctx.g,row.target,5,0);
  }};
  SC["Hunter's Insight"]={targets:[T.yourCreature({aiHint:{goal:'buff'}})],resolve:async ctx=>{
    const card=ctx.targets[0],version=card.zoneVersion;
    ctx.g.delayed.push({on:'oracleDamageBySource',expires:'eot',once:false,ctrl:ctx.you,src:ctx.src,name:'Hunter’s Insight draw',
      filter:(g,d)=>d.hits.some(h=>h.src===card&&h.sourceVersion===version&&h.combat&&(h.target instanceof M.Player||h.targetSnap?.types.includes('Planeswalker'))),
      run:async next=>{await next.g.draw(next.you,next.data.hits.filter(h=>h.src===card&&h.sourceVersion===version&&h.combat&&
        (h.target instanceof M.Player||h.targetSnap?.types.includes('Planeswalker'))).reduce((n,h)=>n+h.n,0));}});
  }};
  SC['Dream Pillager']={triggers:[{on:'combatDamageToPlayer',filter:attacks,desc:'Exile cards and cast them this turn',run:async ctx=>{
    for(let i=0;i<ctx.data.n&&ctx.you.library.length;i++){
      const card=ctx.you.library.at(-1);await ctx.g.move(card,'exile');
      if(card.zone==='exile'){card.meta.playableBy=ctx.you;card.meta.playableUntil=ctx.g.turnNo;card.meta.spellsOnly=true;}
    }
  }}]};
  SC['Drakuseth, Maw of Flames']={triggers:[{on:'attacks',filter:attacks,desc:'Deal 4, 3 and 3 damage to distinct targets',
    targets:[T.any({aiHint:{goal:'damage'}}),T.any({count:2,min:0,upTo:true,differentFromAllPrevious:true,aiHint:{goal:'damage'}})],
    run:async ctx=>{await ctx.g.damageBatch([{src:ctx.src,target:ctx.targets[0],n:4},
      ...flat(ctx.targets.slice(1)).map(target=>({src:ctx.src,target,n:3}))],{deferSBA:true});}}]};
  SC['Foe-Razer Regent']={triggers:[enterTrigger('Fight an opposing creature',async ctx=>{
    if(same(ctx))await ctx.g.fight(ctx.src,ctx.targets[0]);
  },{opt:true,targets:[T.oppCreature({aiHint:{goal:'removal'}})]}),
  {on:'fight',filter:(g,self,d)=>d.cards.some(row=>row.ctrl===self.ctrl),desc:'Counters at the next end step',run:async ctx=>{
    const rows=ctx.data.cards.filter(row=>row.ctrl===ctx.you);
    for(const row of rows)ctx.g.delayed.push({on:'endStep',ctrl:ctx.you,src:ctx.src,name:'Foe-Razer Regent: two counters',run:async next=>{
      if(row.card.zone==='battlefield'&&row.card.zoneVersion===row.version)next.g.addCounters(row.card,'+1/+1',2);
    }});
  }}]};
  SC['Dragonkin Berserker']={abilityCostReduction:(g,self,{player,ability})=>player===self.ctrl&&ability?.boast?g.creatures(player).filter(c=>c.hasSub('Dragon')).length:0,
    abilities:[{label:'Boast: create a flying Dragon',boast:true,oncePerTurn:true,cost:{mana:'{4}{R}'},
      cond:(g,c)=>c.meta.oracleCombatEventHistory?.turn===g.turnNo&&c.meta.oracleCombatEventHistory.version===c.zoneVersion&&c.meta.oracleCombatEventHistory.attacks>0,
      run:async ctx=>{await ctx.g.makeTokens(dragon,ctx.you);},aiScore:()=>6}]};
  SC['Savage Ventmaw']={triggers:[{on:'attacks',filter:attacks,desc:'Add three red and three green until end of turn',run:async ctx=>{
    for(const color of ['R','G']){ctx.you.pool[color]+=3;ctx.you.poolMeta.push({color,n:3,persist:'eot'});}
  }}]};
  SC['Rakshasa Debaser']={triggers:[{on:'attacks',filter:attacks,desc:'Reanimate from the defending player’s graveyard',
    targets:(g,self,d)=>{const player=d.defender instanceof M.Player?d.defender:d.defender?.ctrl;
      return [grave((game,card)=>card.is('Creature')&&card.owner===player)];},
    run:async ctx=>{await reanimateMany(ctx,flat(ctx.targets));}}]};
  M.OracleV8Encore.install(SC['Rakshasa Debaser'],{kind:'mechanic-encore-v8',contract:'mechanic-encore-v8',cost:'{6}{B}{B}'});
  SC['Gideon Jura']={abilities:[
    loyalty(2,'Opponent’s creatures attack Gideon next turn',async ctx=>{
      const player=ctx.targets[0];ctx.g.untilEffects.push({kind:'starterGideonRequirement',iid:ctx.src.iid,version:ctx.sourceZoneVersion,
        player,nextTurn:(player.turnsStarted||0)+1,expires:'throughTurnOf',whoTurn:player,afterTurnsStarted:(player.turnsStarted||0)+1});
    },{targets:[T.opponent()]}),
    loyalty(-2,'Destroy a tapped creature',async ctx=>{await ctx.g.destroy(ctx.targets[0]);},{targets:[T.creature({filter:(g,c)=>c.tapped,aiHint:{goal:'removal'}})]}),
    loyalty(0,'Become a 6/6 Human Soldier and prevent damage',async ctx=>{
      animate(ctx,{power:6,toughness:6,subtypes:['Human','Soldier'],retainTypes:true,retainAllSubtypes:true});
      if(same(ctx))ctx.g.untilEffects.push({kind:'preventToCreature',iid:ctx.src.iid,zoneVersion:ctx.src.zoneVersion,expires:'eot'});
    }),
  ]};
  SC['Liliana, Untouched by Death']={abilities:[
    loyalty(1,'Mill three; drain if a Zombie was milled',async ctx=>{
      const cards=await ctx.g.mill(ctx.you,3);if(cards.some(c=>c.hasSub('Zombie'))){await ctx.g.loseLifeOpponents(ctx.src,ctx.you,2);await ctx.g.gainLife(ctx.you,2);}
    }),
    loyalty(-2,'Creature gets -X/-X for your Zombies',async ctx=>{
      const n=ctx.g.bf().filter(c=>c.ctrl===ctx.you&&c.hasSub('Zombie')).length;E.pumpUntilEOT(ctx.g,ctx.targets[0],-n,-n);
    },{targets:[T.creature({aiHint:{goal:'removal'}})]}),
    loyalty(-3,'Cast Zombie spells from your graveyard this turn',async ctx=>{ctx.you.starterLilianaCastTurn=ctx.g.turnNo;}),
  ]};
  SC['Ob Nixilis Reignited']={abilities:[
    loyalty(1,'Draw a card and lose 1 life',async ctx=>{await ctx.g.draw(ctx.you,1);await ctx.g.loseLife(ctx.you,1);}),
    loyalty(-3,'Destroy a creature',async ctx=>{await ctx.g.destroy(ctx.targets[0]);},{targets:[T.creature({aiHint:{goal:'removal'}})]}),
    loyalty(-8,'Opponent gets a punishing draw emblem',async ctx=>{
      ctx.targets[0].emblems.push({name:'Ob Nixilis Reignited emblem',triggers:[{on:'draw',desc:'Lose 2 life',run:async next=>{await next.g.loseLife(next.you,2);}}]});
    },{targets:[T.opponent()]}),
  ]};
  SC['Sarkhan, the Dragonspeaker']={abilities:[
    loyalty(1,'Become a 4/4 red Dragon',async ctx=>{animate(ctx,{power:4,toughness:4,subtypes:['Dragon'],colors:['R'],keywords:['flying','indestructible','haste']});}),
    loyalty(-3,'Deal 4 damage to a creature',async ctx=>{await ctx.g.damageAny(ctx.src,ctx.targets[0],4);},{targets:[T.creature({aiHint:{goal:'damage'}})]}),
    loyalty(-6,'Draw-step and end-step emblem',async ctx=>{
      ctx.you.emblems.push({name:'Sarkhan emblem',triggers:[
        {on:'drawStep',filter:(g,e,d,p)=>d.player===p,desc:'Draw two additional cards',run:async next=>{await next.g.draw(next.you,2);}},
        {on:'endStep',filter:(g,e,d,p)=>d.player===p,desc:'Discard your hand',run:async next=>{await next.g.discard(next.you,next.you.hand.slice());}},
      ]});
    }),
  ]};
  SC['Profane Command']={xCost:true,...M.StarterPrecons.modalSpell({pick:2,list:[
    {label:'Target player loses X life',targets:[T.player({aiHint:{goal:'damage'}})],run:async ctx=>{if(ctx.targets[0])await ctx.g.loseLife(ctx.targets[0],ctx.x);}},
    {label:'Reanimate a creature with mana value X or less',targets:(g,c,opts)=>[grave((game,card,p)=>card.owner===p&&card.is('Creature')&&card.mv<=(opts.xVal||0))],
      run:async ctx=>{await reanimateMany(ctx,flat(ctx.targets));}},
    {label:'Target creature gets -X/-X',targets:[T.creature({aiHint:{goal:'removal'}})],run:async ctx=>{if(ctx.targets[0])E.pumpUntilEOT(ctx.g,ctx.targets[0],-ctx.x,-ctx.x);}},
    {label:'Up to X creatures gain fear',targets:(g,c,opts)=>[T.creature({count:opts.xVal||0,min:0,upTo:true,aiHint:{goal:'buff'}})],
      run:async ctx=>{for(const c of flat(ctx.targets))E.grantUntilEOT(ctx.g,c,['fear']);}},
  ]})};
  SC['Explosion of Riches']={resolve:async ctx=>{
    let n=await ctx.g.draw(ctx.you,1,ctx.src);
    for(const player of ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you).filter(p=>p!==ctx.you)){
      if(await option(ctx,[{key:'yes',label:'Draw a card'},{key:'no',label:'Decline'}],'draw a card',player)==='yes')n+=await ctx.g.draw(player,1,ctx.src);
    }
    for(let i=0;i<n;i++)ctx.g.queueTrigger({src:ctx.src,ctrl:ctx.you,name:'Explosion of Riches: random opponent takes 5',
      prepareTargets:async next=>{
        const legal=next.g.legalTargets(T.opponent(),next.src,next.you);if(!legal.length)return false;
        next.targets=[legal[Math.floor(next.g.rnd()*legal.length)]];
        next.boundTargetSpecs=[T.opponent()];
      },run:async next=>{await next.g.damageAny(next.src,next.targets[0],5);}});
  }};
  SC['Wildfire Devils']={triggers:['etb','upkeep'].map(on=>({on,filter:(g,self,d)=>d.card===self||d.player===self.ctrl,
    desc:'A random player exiles a spell to copy',run:async ctx=>{
      const players=ctx.g.alivePlayers(),player=players[Math.floor(ctx.g.rnd()*players.length)];
      const [card]=await choose(ctx.g,player,player.graveyard.filter(c=>c.is('Instant')||c.is('Sorcery')),1,1,'Wildfire Devils: exile a spell','discard');
      if(card){await ctx.g.move(card,'exile');if(await optional(ctx)==='yes')await E.castCopyFromZone(ctx.g,ctx.you,card);}
    }}))};
  SC['Wild Ricochet']={targets:[T.spell((g,so)=>g.isInstantSorcerySpell(so),{aiHint:{goal:'copy'}})],resolve:async ctx=>{
    const spell=ctx.targets[0];if(!spell||!ctx.g.stack.includes(spell))return;
    await ctx.g.starterRetargetSpell(spell,ctx.you);
    await ctx.g.copySpell(spell,ctx.you,{mayNewTargets:true});
  }};
})();
