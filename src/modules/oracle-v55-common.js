'use strict';
((M)=>{
 const H=M.OracleV20.helpers,G=M.Game.prototype;
 const alive=(c,v)=>c?.zone==='battlefield'&&c.zoneVersion===v;
 const permanent=c=>['Artifact','Battle','Creature','Enchantment','Land','Planeswalker'].some(t=>c.is(t));
 const token=(name,subtypes,power,toughness,colors,extra={})=>({name,cost:'',types:['Creature'],subtypes,super:[],power:String(power),toughness:String(toughness),colorsOverride:colors,...extra});
 async function choose(ctx,p,from,min=0,max=from.length,prompt='Choose cards'){if(!from.length)return [];const versions=new Map(from.map(c=>[c,c.zoneVersion])),cards=await p.controller.decide(ctx.g,{type:'chooseCards',from,min:Math.min(min,from.length),max:Math.min(max,from.length),prompt:ctx.src.name+': '+prompt,aiHint:{kind:'bestCard',src:ctx.src}});if(!Array.isArray(cards)||cards.length<Math.min(min,from.length)||cards.length>max||new Set(cards).size!==cards.length||cards.some(c=>!versions.has(c)||versions.get(c)!==c.zoneVersion))throw Error('Invalid v55 cards');return cards;}
 async function option(ctx,p,prompt,options=[{key:'yes',label:'Yes'},{key:'no',label:'No'}]){const key=await p.controller.decide(ctx.g,{type:'chooseOption',prompt:ctx.src.name+': '+prompt,options,aiHint:{kind:'confirm',src:ctx.src}});if(!options.some(o=>o.key===key))throw Error('Invalid v55 option');return key;}
 async function opponent(ctx){const rows=ctx.you.opponents(ctx.g);if(!rows.length)return null;const key=await option(ctx,ctx.you,'Choose an opponent',rows.map(p=>({key:String(p.idx),label:p.name})));return rows.find(p=>String(p.idx)===key);}
 const shield=(ctx,card,n='all',combat)=>H.runGenericEffect({...ctx,targets:[card]},{action:'damage-rule-v20',mode:'prevent',source:{ref:0},recipient:{all:true},n,...(combat?{combat:'combat'}:{})});
 async function search(ctx,filter,destination,placeBattlefield){return M.OracleV8Library.search(ctx,{action:'library-search-v8',n:1,filter,placements:[{n:'all',destination}],reveal:destination==='hand'},{target:H.genericTargetSpec,amount:H.genericAmount},ctx.you,ctx.you,{placeBattlefield});}
 async function milled(ctx,p,n){return (await ctx.g.mill(p,n)).filter(c=>['graveyard','exile'].includes(c.zone)&&!c.faceDown);}
 const mostLands=(g,p)=>!!p&&p.opponents(g).every(q=>g.lands(p).length>g.lands(q).length);
 const hasEmpires=(g,p,names)=>names.every(name=>g.bf().some(c=>c.ctrl===p&&c.is('Artifact')&&M.OracleV8NameGroups.names(c).includes(name)));
 const maxHand=G.maximumHandSize;G.maximumHandSize=function(p){return this.untilEffects.some(e=>e.kind==='no-max-hand-v55'&&e.ctrl===p)?Infinity:maxHand.call(this,p);};
 const canGain=G.canGainLife;G.canGainLife=function(p){return !this.bf().some(c=>!c.cur?.abilitiesDisabled&&c.def.oracleNoEnchantedLifeV55&&c.meta.cursedPlayer===p)&&canGain.call(this,p);};
 const emit=G.emit;G.emit=async function(event,data,...args){const out=await emit.call(this,event,data,...args);if(event==='cardsToGraveyard')for(const card of data.cards)await this.emit('graveCardV55',{card,player:card.owner});return out;};
 M.OracleV20.handlers.push({
  amount(v,ctx){if(v.kind==='one-less-v55')return H.genericAmount(v.value,ctx,true)-1;},
  condition(g,s,c,p){if(c.kind==='creature-and-noncreature-v55'){const rows=p.turnState.spellsCastList||[];return rows.some(r=>r.isCreature)&&rows.some(r=>!r.isCreature);}if(c.kind==='you-attacked-v55')return !!p.turnState.attacked;},
  target(g,c,p,s,v){if(v.kind==='spell-names-v55'){const names=M.OracleV8NameGroups.names({...c,name:c.castOpts?.name||g.castDefinition(c.card,c.castOpts||{}).name});return names.some(n=>v.names.includes(n));}if(v.kind==='not-owned-v55')return c.owner!==p;if(v.kind==='enchant-creature-v55')return !!(c.hasSub('Aura')&&c.def.oracleEnchantCreatureV55);},
  compile(op,script,entry,h){
   if(op.kind==='aura-target'){if(op.what==='creature'&&!op.targetV9)script.oracleEnchantCreatureV55=true;return false;}
   if(op.kind==='common-static-v55'){
    if(op.mode==='no-enchanted-life'){script.oracleNoEnchantedLifeV55=true;return true;}
    const upkeep=op.mode==='host-upkeep'?h.compileGenericTrigger({kind:'generic-trigger',event:'upkeep',eventFilter:'your-upkeep',targets:[],effects:[{action:'common-effects-v55',mode:'pay-source-cost'}]}):null;
    h.statics.push({phase:5,apply(g,s,bf){const host=g.byIid(s.attachedTo);if(op.mode==='host-upkeep'&&host?.zone==='battlefield'&&host.colors.some(c=>['R','G'].includes(c)))host.cur.extraTriggers.push(upkeep);
     if(op.mode==='uncommon-host-color'&&host?.zone==='battlefield'){const counts=Object.fromEntries([...'WUBRG'].map(k=>[k,bf.filter(c=>c.colors.includes(k)).length])),n=Math.max(...Object.values(counts));if(!host.colors.some(k=>counts[k]===n)){host.cur.power+=3;host.cur.toughness+=3;}}
     if(op.mode==='chosen-defender-pump'&&s.meta.chosenOpponentV55?.version===s.zoneVersion)for(const c of bf)if(c.is('Creature')&&c.attacking===s.meta.chosenOpponentV55.player)c.cur.power++;
    }});return true;
   }
   if(op.kind==='common-entry-v55'){const prior=script.asEnters;script.asEnters=async(g,s)=>{if(prior)await prior(g,s);const ctx={g,src:s,you:s.ctrl},[c]=await choose(ctx,s.ctrl,g.bf().filter(c=>c!==s&&c.ctrl===s.ctrl&&!c.is('Land')),0,1),v=c?.zoneVersion;if(c)await g.bounceMany([c]);s.meta.returnCounterV55={version:s.zoneVersion,n:c&&c.zoneVersion!==v?1:0};};script.etbCounters={kind:'+1/+1',n:(g,s)=>s.meta.returnCounterV55?.version===s.zoneVersion?s.meta.returnCounterV55.n:0};return true;}
   if(op.kind!=='generic-trigger'||!op.testV55)return false;
   const t=h.compileGenericTrigger(op),base=t.filter,run=t.run;
   const matches=(g,s,d)=>op.testV55==='most-lands'?mostLands(g,d.player):op.testV55==='same-source'?s.zone==='battlefield':op.testV55==='aura-host'?d.host===s&&d.att?.hasSub('Aura'):op.testV55==='enchanted-damage'?d.hits?.some(h=>h.target===s.meta.cursedPlayer):false;
   t.filter=(g,s,d)=>base(g,s,d)&&matches(g,s,d);if(op.interveningV55)t.run=ctx=>(op.testV55==='same-source'?H.sameBattlefieldSource(ctx):matches(ctx.g,ctx.src,ctx.data))?run(ctx):undefined;h.triggers.push(t);return true;
  },
  targetHint(e){if(e.action==='common-effects-v55')return {goal:['empire-damage','plains-library-depth','radiance-no-block','exile-owner-free','exchange-self'].includes(e.mode)?'removal':'buff'};},
  async effect(ctx,e){
   if(e.action!=='common-effects-v55')return false;const g=ctx.g,p=ctx.you,s=ctx.src,c=H.genericEffectSubjects(ctx,e.target)[0],same=()=>H.sameBattlefieldSource(ctx),src=H.oracleDamageSource(ctx),apnap=()=>g.apnapFrom(g.turnPlayer||p);
   switch(e.mode){
    case 'pirate-commander-pump':for(const x of g.creatures(p).filter(c=>c.hasSub('Pirate')))M.E.pumpUntilEOT(g,x,p.commanderCasts,p.commanderCasts,[]);break;
    case 'most-lands-token':await g.makeTokens(token('Saproling',['Saproling'],1,1,['G']),ctx.data.player);break;
    case 'empire-tokens':await g.makeTokens(token('Soldier',['Soldier'],1,1,['W']),p,{n:hasEmpires(g,p,['Crown of Empires','Scepter of Empires'])?5:1});break;
    case 'empire-damage':if(c)await g.damageBatch([{src,target:c,n:hasEmpires(g,p,['Crown of Empires','Throne of Empires'])?3:1}],{deferSBA:true});break;
    case 'mill-minions':{const q=ctx.data.player,rows=await milled(ctx,q,1),n=rows.reduce((n,c)=>n+c.mv,0);await g.makeTokens(token('Minion',['Minion'],1,1,['B']),q,{n});break;}
    case 'return-servitors':await g.moveBattlefieldBatch(apnap().flatMap(q=>q.graveyard.filter(c=>M.OracleV8NameGroups.names(c).includes('Myr Servitor')).map(card=>({card,opts:{ctrl:q}}))));break;
    case 'power-hand-bounce':{const q=ctx.data.player;await g.bounceMany(g.creatures(q).filter(c=>c.power>q.hand.length));break;}
    case 'plains-library-depth':if(c){const n=g.lands(p).filter(c=>c.hasSub('Plains')).length,v=c.zoneVersion;await g.move(c,'library');if(c.zone==='library'&&c.zoneVersion===v+1){const lib=c.owner.library;lib.splice(lib.indexOf(c),1);lib.splice(Math.max(0,lib.length-n),0,c);}}break;
    case 'death-counter-return':if(s.zone==='graveyard'&&s.zoneVersion===ctx.sourceZoneVersion){if(ctx.data.snap?.counters?.death>0)await g.move(s,'exile');else{await g.putPermanentOntoBattlefield(s,p);if(s.zone==='battlefield')g.addCounters(s,'death',1,false,p);}}break;
    case 'three-tokens':await g.withBattlefieldEntryBatch(async()=>{for(const key of ['clue','food','treasure'])await g.makeTokens(M.TOKENS[key],p);});break;
    case 'coin-damage-control':{if(c)await g.damageBatch([{src,target:c,n:1}],{deferSBA:true});const result=await g.flipCoin(p,{source:s});if(!result.won){const q=await opponent(ctx);if(q&&same()){M.OracleV8Control.gain(g,s,q);g.recalc();}}break;}
    case 'search-creature-aura':await search(ctx,{what:'enchantment',zone:'graveyard',v20:{kind:'enchant-creature-v55'}},'hand');break;
    case 'draw-or-counter':{const n=g.creatures(p).some(c=>Object.values(c.counters).some(n=>n>0))?await g.draw(p,1,s):0;if(!n&&same())g.addCounters(s,'+1/+1',1,false,p);break;}
    case 'linked-all-life':{const n=await g.loseLife(p,Math.max(0,p.life-1),s.name);(ctx.sourceMeta||s.meta).lifeLossV55={version:ctx.sourceZoneVersion,n};break;}
    case 'linked-life-return':{const snap=ctx.data.snap,r=(snap?.sourceMeta||ctx.sourceMeta||s.meta).lifeLossV55;if(r?.version===(snap?.zoneVersion??ctx.sourceZoneVersion))await g.gainLife(p,r.n,s);break;}
    case 'exile-creature-or-tap':{const [card]=await choose(ctx,p,g.players.flatMap(q=>q.graveyard.filter(c=>c.is('Creature'))),0,1),v=card?.zoneVersion;if(card)await g.move(card,'exile');if(same()){if(card&&card.zone==='exile'&&card.zoneVersion===v+1)g.addCounters(s,'+1/+1',1,false,p);else g.tap(s);}break;}
    case 'pay-source-cost':if(same()){const cost=M.parseCost(s.def.cost||'');if(g.canPayMana(p,cost,null)&&await option(ctx,p,'Pay the mana cost?')==='yes'&&await g.payMana(p,cost,null))break;await g.sacrifice(p,s);}break;
    case 'hand-grave-attachment':if(same()){const [card]=await choose(ctx,p,[...p.hand,...p.graveyard].filter(c=>(c.hasSub('Aura')||c.hasSub('Equipment'))&&g.legalEntryAttachment(c,s,p)),0,1);if(card&&same())await g.move(card,'battlefield',{ctrl:p,attachTo:s});}break;
    case 'aura-dragon':await g.makeTokens(token('Dragon',['Dragon'],2,2,['R'],{kws:['flying'],abilities:[{cost:{mana:'{R}'},run:next=>H.runGenericEffect(next,{action:'pump',target:'self',power:1,toughness:0,keywords:[]})}]}),p);break;
    case 'pay-sac-construct':{const cost=M.parseCost('{1}'),eligible=g.bf().filter(c=>c.ctrl===p&&c.is('Artifact')&&g.canSacrifice(c)&&g.canPayMana(p,cost,null,{protectedSacrifices:[c]}));if(!eligible.length||await option(ctx,p,'Pay {1} and sacrifice an artifact?')!=='yes')break;const [card]=await choose(ctx,p,eligible,1,1),v=card.zoneVersion;if(await g.payMana(p,cost,null,{protectedSacrifices:[card]})){await g.sacrifice(p,card);if(card.zoneVersion!==v)await g.makeTokens(token('Construct',['Construct'],3,1,['R'],{types:['Artifact','Creature'],kws:['haste']}),p);}break;}
    case 'grave-exile-no-damage':for(const q of apnap()){if(q.graveyard.length<e.n||await option(ctx,q,'Exile '+e.n+' cards?')!=='yes')continue;const cards=await choose(ctx,q,q.graveyard.slice(),e.n,e.n);for(const card of cards)await g.move(card,'exile');if(same())await H.runGenericEffect(ctx,{action:'no-combat-assignment-v19'});break;}break;
    case 'hero-toughness-pump':{const n=H.genericAmount({kind:'source-stat',stat:'toughness'},ctx,true);for(const x of g.creatures(p).filter(c=>c!==s&&c.hasSub('Hero')))M.E.pumpUntilEOT(g,x,n,n,[]);break;}
    case 'human-base-pt':if(c)g.addOracleBasePT(c,{power:H.genericAmount({kind:'source-stat',stat:'power'},ctx,true),toughness:H.genericAmount({kind:'source-stat',stat:'toughness'},ctx,true),temporary:true});break;
    case 'two-keywords':{const kw=await option(ctx,p,'Choose a keyword',['first strike','lifelink'].map(key=>({key,label:key})));for(const x of [...new Set([...(same()?[s]:[]),...(c?[c]:[])])])M.E.pumpUntilEOT(g,x,0,0,[kw]);break;}
    case 'opponent-life-mana':await H.runGenericEffect({...ctx,you:ctx.data.player},{action:'add-mana',produce:{C:2*p.opponents(g).filter(q=>q.turnState.lifeLost>0).length}});break;
    case 'draw-discard-quality':{await g.draw(p,2,s);const valid=p.hand.filter(c=>c.is('Instant')||c.is('Sorcery')||c.is('Creature')&&c.kw('flying')),single=valid.length&&await option(ctx,p,'Discard one instant, sorcery, or flying creature?')==='yes',cards=await choose(ctx,p,single?valid:p.hand.slice(),single?1:2,single?1:2);await g.discard(p,cards);break;}
    case 'return-dies':if(c){const v=c.zoneVersion;g.delayed.push({on:'dies',expires:'eot',src:s,ctrl:p,name:s.name+' — return creature',filter:(g,d)=>d.card===c&&d.snap?.zoneVersion===v&&c.owner===p,run:async next=>{if(c.zone==='graveyard'&&c.zoneVersion===v+1)await g.putPermanentOntoBattlefield(c,p);}});}break;
    case 'exile-source-play':if(c){const v=c.zoneVersion;await g.move(c,'exile');if(c.zone==='exile'&&c.zoneVersion===v+1)M.OracleV22Layouts.grant(ctx,[c],{duration:'source-control'});}break;
    case 'move-all-auras':if(c){const cards=g.bf().filter(x=>x.hasSub('Aura')&&x.attachedTo===c.iid),[host]=await choose(ctx,p,g.bf().filter(x=>x!==c&&x.ctrl===c.ctrl),1,1);if(host)for(const card of cards)if(g.legalEntryAttachment(card,host,card.ctrl))await g.attach(card,host);}break;
    case 'grave-two-choice':if(c){const cards=p.graveyard.slice(-2),[chosen]=await choose(ctx,c,cards,1,1);if(chosen)await g.move(chosen,'exile');for(const card of cards.filter(x=>x!==chosen))await g.move(card,'hand');}break;
    case 'green-prevent':if(c)await H.runGenericEffect(ctx,{action:'damage-rule-v20',mode:'prevent',source:{all:true},recipient:{ref:0},n:c instanceof M.CardInst&&c.is('Creature')&&c.colors.includes('G')?2:1});break;
    case 'cast-same-name':{const names=[...new Set(g.players.flatMap(p=>p.turnState.spellsCastList||[]).flatMap(r=>M.OracleV8NameGroups.names({...r.so,name:r.name})))];await M.OracleV8PlayPermissions.castOne(ctx,p.hand.slice(),{free:true,filter:{what:'spell',zone:'stack',v20:{kind:'spell-names-v55',names}}},{target:H.genericTargetSpec});break;}
    case 'mill-pay-hand':{const cards=await milled(ctx,p,3),versions=new Map(cards.map(c=>[c,c.zoneVersion])),cost=M.parseCost('{1}');if(g.canPayLife(p,3)&&g.canPayMana(p,cost,null,{reservedLife:3})&&await option(ctx,p,'Pay {1} and 3 life?')==='yes'&&await g.payMana(p,cost,null,{reservedLife:3})){await g.loseLife(p,3,s.name);const [card]=await choose(ctx,p,cards.filter(c=>['graveyard','exile'].includes(c.zone)&&c.zoneVersion===versions.get(c)&&!c.faceDown),1,1);if(card)await g.move(card,'hand');}break;}
    case 'player-damage-or-pump':{let accepted=false;for(const q of apnap())if(await option(ctx,q,'Have this creature deal 4 damage to you?')==='yes'){await g.damageBatch([{src,target:q,n:4}],{deferSBA:true});accepted=true;break;}if(!accepted&&same())M.E.pumpUntilEOT(g,s,2,2,[]);break;}
    case 'grave-life-delay':{const turn=g.turnNo;g.delayed.push({on:'graveCardV55',once:false,expires:'eot',src:s,ctrl:p,name:s.name+' — graveyard life loss',filter:(g,d)=>g.turnNo===turn&&d.player!==p,run:next=>g.loseLife(next.data.player,1,s.name)});break;}
    case 'exchange-self':if(c&&same()&&c.ctrl!==p&&c.owner!==p){const q=c.ctrl;M.OracleV8Control.gain(g,c,p);M.OracleV8Control.gain(g,s,q);g.recalc();}break;
    case 'search-curse':if(c)await search(ctx,{what:'card',zone:'graveyard',subtype:'Curse'},'battlefield',card=>g.move(card,'battlefield',{ctrl:p,cursedPlayer:c}));break;
    case 'blocker-toughness':if(c&&same())g.addOracleBasePT(s,{toughness:c.power+1,temporary:false});break;
    case 'choose-opponent':{const q=await opponent(ctx);if(q&&same()){s.meta.chosenOpponentV55={version:s.zoneVersion,player:q};g.recalc();}break;}
    case 'battle-attacker':if(c){if(c.attacking instanceof M.CardInst&&c.attacking.is('Battle'))g.addCounters(c,'+1/+1',1,false,p);else M.E.pumpUntilEOT(g,c,1,1,[]);}break;
    case 'enchanted-half-life':{const q=ctx.data.hits?.[0]?.target;if(q instanceof M.Player)await g.loseLife(q,Math.ceil(q.life/2),s.name);break;}
    case 'axe-token':await g.makeTokens({name:'Axe',cost:'',types:['Artifact'],subtypes:['Equipment'],super:[],colorsOverride:[],equip:'{2}',attachGrant:(g,s,h)=>{h.cur.power++;}},p);break;
    case 'search-attach-equipment':await search(ctx,{what:'artifact',zone:'graveyard',subtype:'Equipment'},'battlefield',async card=>{await g.putPermanentOntoBattlefield(card,p);if(card.zone==='battlefield'){const [host]=await choose(ctx,p,g.creatures(p).filter(c=>g.legalEntryAttachment(card,c,p)),1,1);if(host)await g.attach(card,host);}});break;
    case 'chosen-color-prevent':if(c){const [card]=await choose(ctx,p,g.bf().filter(c=>c.ctrl===p),1,1);if(card&&c.colors.some(k=>card.colors.includes(k)))await shield(ctx,c,'all',true);}break;
    case 'opponent-debuff-attack':for(const card of g.creatures().filter(c=>c.ctrl!==p)){M.E.pumpUntilEOT(g,card,-1,-1,[]);card.meta.mustAttackTurn=g.turnNo;}break;
    case 'random-grave-return':{M.shuffle(p.graveyard,g.rnd);const cards=p.graveyard;if(cards.length){const card=cards[Math.floor(g.rnd()*cards.length)];if(card.is('Creature'))await g.putPermanentOntoBattlefield(card,p);else await g.move(card,'exile');}break;}
    case 'draw-library':{await g.draw(p,p.library.length,s);const [card]=await choose(ctx,p,p.hand.slice(),1,1);if(card)await g.move(card,'library');g.untilEffects.push({kind:'no-max-hand-v55',ctrl:p,expires:'yourNext'});break;}
    case 'converge-grave-hand':{const n=H.genericAmount({kind:'paid-colors'},ctx),cards=await choose(ctx,p,p.graveyard.filter(permanent),0,n);await g.moveGraveyardBatch(cards,'hand');break;}
    case 'sunrise':await g.moveBattlefieldBatch(apnap().flatMap(q=>q.graveyard.filter(c=>['Artifact','Creature','Enchantment','Land'].some(t=>c.is(t))&&c.meta.oracleGraveEntryV22?.turn===g.turnNo&&c.meta.oracleGraveEntryV22.version===c.zoneVersion&&c.meta.oracleGraveEntryV22.fromBattlefield).map(card=>({card,opts:{ctrl:q}}))));break;
    case 'exile-owner-free':if(c){const v=c.zoneVersion;await g.move(c,'exile');if(c.zone==='exile'&&c.zoneVersion===v+1)M.OracleV22Layouts.grant({...ctx,you:c.owner},[c],{duration:'forever',spellsOnly:true,free:true});}break;
    case 'hand-exile-return':{const cards=[];for(const card of p.hand.slice()){const v=card.zoneVersion;await g.move(card,'exile',{exileFaceDown:true});if(card.zone==='exile'&&card.zoneVersion===v+1)cards.push({card,version:card.zoneVersion});}g.delayed.push({on:'endStep',src:s,ctrl:p,name:s.name+' — return hand',run:async()=>{for(const r of cards)if(r.card.zone==='exile'&&r.card.zoneVersion===r.version)await g.move(r.card,'hand');await g.draw(p,1,s);}});break;}
    case 'coin-prevention':for(const card of g.creatures().filter(c=>c.blocking))if((await g.flipCoin(p,{source:s})).won)await shield(ctx,card,'all',true);break;
    case 'damage-echo':if(c){const v=c.zoneVersion;g.delayed.push({on:'oracleDamageHit',once:false,expires:'eot',src:s,ctrl:p,name:s.name+' — echo damage',filter:(g,d)=>d.hits.some(h=>h.target===c&&h.targetVersion===v),run:async next=>{const hit=next.data.hits.find(h=>h.target===c&&h.targetVersion===v),source=H.oracleDamageSource({...ctx,src:c,sourceZoneVersion:v,data:{card:c,snap:hit.targetSnap}});await g.damageBatch([...g.creatures().filter(x=>x!==c||x.zoneVersion!==v),...g.alivePlayers()].map(target=>({src:source,target,n:hit.n})),{deferSBA:true});}});}break;
    case 'pump-return-leaving':if(c){M.E.pumpUntilEOT(g,c,2,0,[]);await H.runGenericEffect(ctx,{action:'grant-operation',target:0,operation:{kind:'generic-trigger',event:'lto',eventFilter:{kind:'observation-v9',self:true,diedOrExiledV10:true},effects:[{action:'common-effects-v55',mode:'leave-to-hand'}],targets:[],optional:false,contract:'generic-trigger-effect'}});}break;
    case 'leave-to-hand':if(['graveyard','exile'].includes(s.zone)&&s.zoneVersion===ctx.sourceZoneVersion)await g.move(s,'hand');break;
    case 'blocked-pump':if(c){const v=c.zoneVersion;g.delayed.push({on:'becomesBlocked',expires:'eot',src:s,ctrl:p,name:s.name+' — blocked bonus',filter:(g,d)=>d.attacker===c&&alive(c,v),run:()=>{if(alive(c,v)){const n=c.blockedBy?.length||0;M.E.pumpUntilEOT(g,c,n,n,[]);}}});}break;
    case 'blockers-prevent':if(c){const rows=[c,...(c.blockedBy||[]).filter(c=>c?.zone==='battlefield')];for(const x of rows){if(x!==c)g.tap(x);await shield(ctx,x,'all',true);}}break;
    case 'radiance-no-block':if(c){const colors=c.colors.slice();for(const card of g.creatures().filter(x=>x===c||x.colors.some(k=>colors.includes(k))))await H.runGenericEffect({...ctx,targets:[card]},{action:'cant-block-until-eot',target:0});}break;
    default:throw Error('Unknown v55 effect '+e.mode);
   }return true;
  }
 });
})(globalThis.MTG ||= {});
