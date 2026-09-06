'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
  const M=MTG,E=M.E,T=M.T,SC=M.SCRIPTS,C=M.C21;
  const {same,choose,option,token,inkling,enterTrigger,grave,own,selfEvent,row,current,countCounters,choosePlayer,search,reanimate,grantExile,exileTop,loyalty,sacrificeAcross}=C;
  const flat=ts=>ts.flat(Infinity).filter(Boolean);
  const opponents=ctx=>E.eachOpp(ctx.g,ctx.you);
  async function landFromHand(ctx,p){const [land]=await choose(ctx.g,p,p.hand.filter(c=>c.is('Land')),0,1,ctx.src.name+': put a land onto the battlefield','ramp');if(land)await ctx.g.move(land,'battlefield',{ctrl:p});}
  SC['Gideon, Champion of Justice']={abilities:[
    loyalty(1,'Add loyalty for an opponent’s creatures',ctx=>{if(same(ctx))ctx.g.addCounters(ctx.src,'loyalty',ctx.g.creatures(ctx.targets[0]).length,false,ctx.you);},{targets:[T.opponent()]}),
    loyalty(0,'Become an indestructible Human Soldier',async ctx=>{if(!same(ctx))return;
      ctx.g.addOracleAnimation(ctx.src,{types:['Creature'],subtypes:['Human','Soldier'],retainTypes:true,retainAllSubtypes:true,keywords:['indestructible'],c21LoyaltyPT:true,temporary:true});
      ctx.g.untilEffects.push({kind:'preventToCreature',iid:ctx.src.iid,zoneVersion:ctx.sourceZoneVersion,expires:'eot'});ctx.g.recalc();
    }),
    loyalty(-15,'Exile all other permanents',async ctx=>{await ctx.g.withC21ExileBatch(async()=>{for(const c of ctx.g.bf().slice())if(!(c===ctx.src&&same(ctx)))await ctx.g.move(c,'exile');});}),
  ]};
  SC['Felisa, Fang of Silverquill']={triggers:[{on:'attacks',filter:selfEvent,desc:'Mentor',targets:[T.creature({filter:(g,c,p,src)=>!!c.attacking&&c.power<src.power,aiHint:{goal:'pump'}})],
    run:ctx=>{const source=same(ctx)?ctx.src:ctx.src.battlefieldLKI?.get(ctx.sourceZoneVersion);if(ctx.targets[0].power<(source?.power||0))ctx.g.addCounters(ctx.targets[0],'+1/+1',1,false,ctx.you);}},
    {on:'dies',filter:(g,c,d)=>d.snap.ctrl===C.controllerAt(g,c,d)&&d.snap.types.includes('Creature')&&!d.card.isToken&&countCounters(d.snap)>0,
      desc:'Create tapped Inklings for the dying creature’s counters',run:ctx=>ctx.g.makeTokens(inkling,ctx.you,{n:countCounters(ctx.data.snap),tapped:true})}]};
  SC['Combat Calligrapher']={c21Calligrapher:true,triggers:[{on:'attackersDeclared',filter:(g,c,d)=>d.attackers.some(a=>a.attacking instanceof M.Player&&a.attacking!==c.ctrl),
    desc:'An Inkling joins the attack against your opponent',run:async ctx=>{
      const defenders=[...new Set(ctx.data.attackers.map(a=>a.attacking).filter(p=>p instanceof M.Player&&p!==ctx.you))];
      for(const defender of defenders)if(!defender.lost)await ctx.g.makeTokens(inkling,ctx.data.player,{tapped:true,attacking:defender});
    }}]};
  SC['Guardian Archon']={asEnters:async(g,c)=>{const players=E.eachOpp(g,c.ctrl);if(!players.length)return;
    const value=await c.ctrl.controller.decide(g,{type:'chooseOption',prompt:'Guardian Archon: secretly choose an opponent',options:players.map(p=>({key:String(p.idx),label:p.name})),aiHint:{kind:'choosePlayer',secret:true}});
    if(!players.some(p=>String(p.idx)===String(value)))throw Error('Invalid secret opponent');c.meta.c21Secret=Number(value);
  },abilities:[{label:'Reveal the chosen player: protection until end of turn',cost:{},oncePerObject:true,c21Reveal:true,
    cond:(g,c)=>Number.isInteger(c.meta.c21Secret),targets:[T.permanent((g,c,p)=>c.ctrl===p,{aiHint:{goal:'protect'}})],run:async ctx=>{
      const from=ctx.g.players.find(p=>p.idx===ctx.c21Revealed);if(!from)return;const iid=ctx.targets[0].iid,version=ctx.targets[0].zoneVersion,fromIndex=from.idx;
      ctx.g.untilEffects.push({kind:'c21PlayerProtection',who:ctx.you,from,expires:'eot'});
      ctx.g.untilEffects.push({kind:'c21Protection',expires:'eot',apply:(g,bf)=>{const c=bf.find(c=>c.iid===iid&&c.zoneVersion===version);if(c)c.cur.protectionFrom.push((g,source)=>source.ctrl.idx===fromIndex);}});ctx.g.recalc();
    },aiScore:()=>3}]};
  SC['Nils, Discipline Enforcer']={c21Nils:true,triggers:[{on:'endStep',filter:own,desc:'A counter on up to one creature per player',
    targets:(g,c)=>g.alivePlayers().map(p=>T.creature({filter:(g,x)=>x.ctrl===p,count:1,min:0,upTo:true,prompt:p.name+': up to one creature'})),
    run:ctx=>{for(const c of flat(ctx.targets))ctx.g.addCounters(c,'+1/+1',1,false,ctx.you);}}]};
  SC['Scholarship Sponsor']={triggers:[enterTrigger('Players catch up on basic lands',async ctx=>{
    const counts=ctx.g.alivePlayers().map(p=>({p,n:ctx.g.lands(p).length})),max=Math.max(...counts.map(r=>r.n)),chosen=[];
    for(const {p,n} of counts)if(n<max){const cards=await choose(ctx.g,p,p.library.filter(c=>c.is('Land')&&c.def.super.includes('Basic')),0,max-n,'Scholarship Sponsor: search for basic lands','searchLand');await ctx.g.revealToHuman({cards,ctrl:p,kind:'reveal'});chosen.push({p,cards});}
    await ctx.g.withBattlefieldEntryBatch(async()=>{for(const {p,cards} of chosen)for(const c of cards)await ctx.g.move(c,'battlefield',{ctrl:p,tapped:true});});for(const {p} of chosen)M.shuffle(p.library,ctx.g.rnd);
  })]};
  SC['Author of Shadows']={triggers:[enterTrigger('Exile opposing graveyards and choose a spell to cast',async ctx=>{
    const exiled=[];await ctx.g.withC21ExileBatch(async()=>{for(const p of opponents(ctx))for(const c of p.graveyard.slice()){await ctx.g.move(c,'exile');if(c.zone==='exile')exiled.push(c);}});
    const picked=await choose(ctx.g,ctx.you,exiled.filter(c=>!c.is('Land')),1,1,'Author of Shadows: choose an exiled spell','recur');grantExile(ctx,picked,{forever:true,anyColor:true,spellsOnly:true});
  })]};
  SC['Bold Plagiarist']={triggers:[{on:'countersPlaced',filter:(g,c,d)=>d.by&&d.by!==c.ctrl&&d.card.ctrl===d.by&&d.card.is('Creature'),desc:'That opponent puts the same counters on this creature',
    run:ctx=>{if(same(ctx))ctx.g.addCounters(ctx.src,ctx.data.kind,ctx.data.n,false,ctx.data.by);}}]};
  SC['Keen Duelist']={triggers:[{on:'upkeep',filter:own,targets:[T.opponent()],desc:'Reveal top cards, exchange life loss, then put them into hand',run:async ctx=>{
    const p=ctx.targets[0],a=ctx.you.library.at(-1),b=p.library.at(-1),rows=[a,b].filter(Boolean).map(row),an=a?.mv||0,bn=b?.mv||0;
    await ctx.g.revealToHuman({cards:rows.map(r=>r.card),ctrl:ctx.you,kind:'reveal'});await ctx.g.loseLife(ctx.you,bn,ctx.src.name);await ctx.g.loseLife(p,an,ctx.src.name);
    for(const r of rows)if(current(r))await ctx.g.move(r.card,'hand');
  }}]};
  SC['Angel of Serenity']={triggers:[enterTrigger('Exile up to three other creatures or creature cards',async ctx=>{
    const linked=ctx.sourceMeta.c21Serenity||(ctx.sourceMeta.c21Serenity=[]);
    for(const c of flat(ctx.targets)){await ctx.g.move(c,'exile');if(c.zone==='exile')linked.push(row(c));}
  },{targets:[{c21BattlefieldOrGraveyard:true,what:'card',filter:(g,c,p,src)=>(c.zone==='graveyard'||c!==src)&&c.is('Creature'),count:3,min:0,upTo:true,aiHint:{goal:'exile'}}]}),
    {on:'lto',filter:selfEvent,desc:'Return the linked cards to their owners’ hands',run:async ctx=>{for(const r of ctx.sourceMeta.c21Serenity||[])if(current(r))await ctx.g.move(r.card,'hand');}}]};
  SC['Boreas Charger']={triggers:[{on:'lto',filter:selfEvent,desc:'Catch up on Plains',run:async ctx=>{
    const n=ctx.g.lands(ctx.you).length,p=await choosePlayer(ctx,opponents(ctx).filter(p=>ctx.g.lands(p).length>n),'choose an opponent with more lands');if(!p)return;
    const cards=await choose(ctx.g,ctx.you,ctx.you.library.filter(c=>c.hasSub('Plains')),0,ctx.g.lands(p).length-n,'Boreas Charger: search for Plains','searchLand');
    await ctx.g.revealToHuman({cards,ctrl:ctx.you,kind:'reveal'});const [land]=await choose(ctx.g,ctx.you,cards,1,1,'Boreas Charger: put a Plains onto the battlefield','ramp');
    if(land)await ctx.g.move(land,'battlefield',{ctrl:ctx.you,tapped:true});for(const c of cards)if(c!==land)await ctx.g.move(c,'hand');M.shuffle(ctx.you.library,ctx.g.rnd);
  }}]};
  SC['Magister of Worth']={triggers:[enterTrigger('Vote for grace or condemnation',async ctx=>{
    let grace=0,condemn=0;for(const p of ctx.g.apnapFrom(ctx.you).filter(p=>!p.lost)){const vote=await option(ctx,[{key:'grace',label:'Grace — return all creature cards'},{key:'condemnation',label:'Condemnation — destroy all other creatures'}],'vote',p,'vote');if(vote==='grace')grace++;else condemn++;}
    if(grace>condemn){const cards=ctx.g.players.flatMap(p=>p.graveyard.filter(c=>c.is('Creature')));await ctx.g.withBattlefieldEntryBatch(async()=>{for(const c of cards)await ctx.g.move(c,'battlefield',{ctrl:c.owner});});}
    else await ctx.g.destroyMany(ctx.g.creatures().filter(c=>!(c===ctx.src&&same(ctx))));
  })]};
  SC['Teysa, Envoy of Ghosts']={kws:['vigilance'],statics:[{apply:(g,c)=>c.cur.protectionFrom.push((g,source)=>source.is('Creature'))}],triggers:[{on:'combatDamageToPlayer',filter:(g,c,d)=>d.player===c.ctrl&&d.card.is('Creature'),
    desc:'Destroy the creature and create a Spirit',prepareTargets:ctx=>{ctx.c21Damager=row(ctx.data.card);},run:async ctx=>{const r=ctx.c21Damager;if(current(r)&&r.card.zone==='battlefield')await ctx.g.destroy(r.card);await ctx.g.makeTokens(token('Spirit',['Spirit'],1,1,['W','B'],['flying']),ctx.you);}}]};
  SC['Oreskos Explorer']={triggers:[enterTrigger('Search for Plains for opponents with more lands',ctx=>search(ctx,ctx.you,c=>c.hasSub('Plains'),opponents(ctx).filter(p=>ctx.g.lands(p).length>ctx.g.lands(ctx.you).length).length))]};
  SC['Incarnation Technique']={demonstrate:true,resolve:async ctx=>{await ctx.g.mill(ctx.you,5);await reanimate(ctx,ctx.you);}};
  SC['Infernal Offering']={resolve:async ctx=>{
    const p=await choosePlayer(ctx,opponents(ctx),'choose an opponent to sacrifice and draw');if(p){const dead=await sacrificeAcross(ctx,[ctx.you,p],p=>ctx.g.creatures(p));for(const r of dead)await ctx.g.draw(r.ctrl,2);}
    const other=await choosePlayer(ctx,opponents(ctx),'choose an opponent to return creatures');if(other){const selections=[];for(const p of [ctx.you,other]){const [c]=await choose(ctx.g,p,p.graveyard.filter(c=>c.is('Creature')),1,1,'Infernal Offering: return a creature','recur');if(c)selections.push({c,p});}await ctx.g.withBattlefieldEntryBatch(async()=>{for(const {c,p} of selections)await ctx.g.move(c,'battlefield',{ctrl:p});});}
  }};
  SC['Stinging Study']={resolve:async ctx=>{
    const pool=[...ctx.g.bf(),...ctx.you.command].filter(c=>c.owner===ctx.you&&c.commander),[commander]=await choose(ctx.g,ctx.you,pool,1,1,'Stinging Study: choose your commander','draw');const n=commander?.mv||0;
    await ctx.g.draw(ctx.you,n);await ctx.g.loseLife(ctx.you,n,ctx.src.name);
  }};
  SC['Inkshield']={resolve:async ctx=>{ctx.g.untilEffects.push({kind:'preventCombatToPlayer',who:ctx.you,sourceCard:ctx.src,c21Inkshield:true,expires:'eot'});}};
  SC['Oblation']={targets:[T.permanent((g,c)=>!c.is('Land'),{aiHint:{goal:'removal'}})],resolve:async ctx=>{const c=ctx.targets[0],p=c.owner;await ctx.g.move(c,'library');M.shuffle(p.library,ctx.g.rnd);await ctx.g.draw(p,2);}};
  SC['Tempting Contract']={triggers:[{on:'upkeep',filter:own,desc:'Opponents may take Treasure; receive one for each acceptance',run:async ctx=>{
    let n=0;for(const p of opponents(ctx))if(await option(ctx,[{key:'yes',label:'Create a Treasure'},{key:'no',label:'Decline'}],'accept a Treasure',p,'tempt')==='yes'){await ctx.g.makeTokens('treasure',p);n++;}
    if(n)await ctx.g.makeTokens('treasure',ctx.you,{n});
  }}]};
  SC['Pendant of Prosperity']={asEnters:async(g,c)=>{const p=await choosePlayer({g,src:c,you:c.ctrl},E.eachOpp(g,c.ctrl),'choose who controls this artifact');if(p){const from=c.ctrl,entry=from.turnState.permanentEntries.find(e=>e.iid===c.iid&&e.zoneVersion===c.zoneVersion);c.ctrl=p;
      if(entry){from.turnState.permanentEntries.splice(from.turnState.permanentEntries.indexOf(entry),1);p.turnState.permanentEntries.push(entry);if(entry.nonland){from.turnState.nonlandPermanentsEntered--;p.turnState.nonlandPermanentsEntered++;}}
    }},
    abilities:[{label:'Draw and put a land; the owner does the same',cost:{mana:'{2}',tap:true},run:async ctx=>{for(const p of [ctx.you,ctx.src.owner]){await ctx.g.draw(p,1);await landFromHand(ctx,p);}},aiScore:()=>4}]};
  SC['Victory Chimes']={c21UntapOthers:true,mana:{cost:{tap:true},produce:[{C:1}],manual:true,c21Donation:'colorless'}};
  SC['Spectral Searchlight']={mana:{cost:{tap:true},produce:['W','U','B','R','G'].map(c=>({[c]:1})),manual:true,c21Donation:'color'}};
  SC['Cunning Rhetoric']={triggers:[{on:'attackersDeclared',filter:(g,c,d)=>d.player!==c.ctrl&&d.attackers.some(a=>a.attacking===c.ctrl||a.attacking instanceof M.CardInst&&a.attacking.is('Planeswalker')&&a.attacking.ctrl===c.ctrl),
    desc:'Exile the attacking player’s top card; you may play it',run:async ctx=>grantExile(ctx,await exileTop(ctx,ctx.data.player,1),{forever:true,anyColor:true})}]};
  SC['Parasitic Impetus']={auraTarget:[T.creature({aiHint:{goal:'goadTarget'}})],attachGrant:(g,c,host)=>{host.cur.power+=2;host.cur.toughness+=2;host.cur.goadedBy=(host.cur.goadedBy||[]).concat(c.ctrl);},
    triggers:[{on:'attacks',filter:(g,c,d)=>d.card.iid===c.attachedTo,desc:'The attacker’s controller loses two; you gain two',run:async ctx=>{await ctx.g.loseLife(ctx.data.card.ctrl,2,ctx.src.name);await ctx.g.gainLife(ctx.you,2);}}]};
})();
