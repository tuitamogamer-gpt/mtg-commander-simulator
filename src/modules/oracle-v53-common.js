'use strict';
((M)=>{
 const H=M.OracleV20.helpers;
 async function choose(ctx,p,from,min=0,max=from.length){if(!from.length)return [];const versions=new Map(from.map(c=>[c,c.zoneVersion])),cards=await p.controller.decide(ctx.g,{type:'chooseCards',from,min:Math.min(min,from.length),max:Math.min(max,from.length),prompt:ctx.src.name+': choose cards',aiHint:{kind:'bestCard',src:ctx.src}});if(!Array.isArray(cards)||cards.length<Math.min(min,from.length)||cards.length>max||new Set(cards).size!==cards.length||cards.some(c=>!versions.has(c)||versions.get(c)!==c.zoneVersion))throw Error('Invalid v53 cards');return cards;}
 async function option(ctx,p,prompt,options=[{key:'yes',label:'Yes'},{key:'no',label:'No'}]){const key=await p.controller.decide(ctx.g,{type:'chooseOption',prompt:ctx.src.name+': '+prompt,options,aiHint:{kind:'confirm',src:ctx.src}});if(!options.some(o=>o.key===key))throw Error('Invalid v53 option');return key;}
 const sea=c=>['Kraken','Leviathan','Octopus','Serpent'].some(t=>c.hasSub(t));
 function amount(g,s,p,v){if(v.kind==='greatest-creature-power-v53')return Math.max(0,...g.creatures(p).filter(c=>c!==s).concat(p.graveyard.filter(c=>c.is('Creature'))).map(c=>c.power));if(v.kind==='owner-creatures-died-v53')return g.diedThisTurn.filter(r=>r.owner===p&&r.types.includes('Creature')).length;}
 const search=(ctx,filter,destination,extra={})=>H.runGenericEffect(ctx,{action:'library-search-v8',who:'you',n:1,filter,placements:[{n:'all',destination}],...extra});
 M.OracleV20.handlers.push({
  amount(v,ctx){return amount(ctx.g,ctx.src,ctx.you,v);},count:amount,
  target(g,c,p,s,v){if(v.kind==='not-sea-family-v53')return !sea(c);if(v.kind==='not-commander-v53')return !c.commander;if(v.kind==='flashback-disturb-v53')return !!(c.def.flashback||c.def.disturb||c.def.bomDisturb||c.def.oracleDisturbV20);},
  compile(op,script,entry,h){
   if(op.kind==='common-static-v53'){
    const sacrifice=op.mode==='cultist'?h.compileGenericTrigger({kind:'generic-trigger',event:'upkeep',eventFilter:'your-upkeep',targets:[],effects:[{action:'choose-permanents',who:'you',operation:'sacrifice',n:1,filter:{what:'creature',zone:'battlefield',controller:'you',min:1}}]}):null;
    h.statics.push({apply(g,s,bf){const host=g.byIid(s.attachedTo);if(op.mode==='black-host-block'&&host?.zone==='battlefield'&&host.colors.includes('B'))host.cur.cantBlock=true;if(op.mode==='other-aura-keywords'&&host?.zone==='battlefield'&&bf.some(c=>c!==s&&c.hasSub('Aura')&&c.attachedTo===host.iid)){host.cur.kw.add('first strike');host.cur.kw.add('lifelink');}if(op.mode==='cultist')for(const c of bf)if(c.commander&&c.owner===s.ctrl&&c.is('Creature')){c.cur.power+=3;c.cur.toughness+=3;c.cur.kw.add('flying');c.cur.kw.add('deathtouch');g.grantWard(c,{life:3});c.cur.extraTriggers.push(sacrifice);}}});return true;
   }
   if(op.kind!=='generic-trigger'||!op.eventTestV53&&!op.onceObjectV53)return false;
   const t=h.compileGenericTrigger(op),filter=t.filter,run=t.run;
   const matches=(g,s,d)=>op.eventTestV53==='own-ability-target'?d.byPlayer===s.ctrl&&!d.isSpell&&(d.isActivatedAbility||d.isTriggeredAbility)&&(d.card instanceof M.Player||d.card?.zone==='battlefield'):
    op.eventTestV53==='player-nonblack'?g.bf().some(c=>c.ctrl===d.player&&!c.is('Land')&&!c.colors.includes('B')):
    op.eventTestV53==='you-counter-another'?d.by===s.ctrl&&d.card!==s&&d.card?.is('Creature')&&d.kind==='+1/+1'&&d.n>0:
    op.eventTestV53==='adventure-or-dragon'?!!d.so&&(d.so.castOpts?.adventure||g.castSubtypesV16(d.card,d.so.castOpts).includes('Dragon')||g.castChangelingV16(d.card,d.so.castOpts)):!op.eventTestV53;
   t.filter=(g,s,d)=>matches(g,s,d)&&filter(g,s,d);
   if(op.interveningV53)t.run=ctx=>matches(ctx.g,ctx.src,ctx.data)?run(ctx):undefined;
   if(op.onceObjectV53)t.oncePerObjectTriggerV53=true;
   h.triggers.push(t);return true;
  },
  targetHint(e){if(e.action==='common-effects-v53')return {goal:['grave-exile-life','damage-gain-discard','single-creature-debuff','coin-damage','bounce-die-scry'].includes(e.mode)?'removal':'buff'};},
  async effect(ctx,e){
   if(e.action!=='common-effects-v53')return false;const g=ctx.g,p=ctx.you,s=ctx.src,c=H.genericEffectSubjects(ctx,e.target)[0],same=()=>H.sameBattlefieldSource(ctx),src=H.oracleDamageSource(ctx),apnap=()=>g.apnapFrom(g.turnPlayer||p);
   switch(e.mode){
    case 'self-grave-aura':if(c&&same()&&g.legalEntryAttachment(c,s,p))await g.move(c,'battlefield',{ctrl:p,attachTo:s});break;
    case 'bounce-own-auras':if(c)await g.bounceMany([...g.bf().filter(x=>x.ctrl===p&&x.hasSub('Aura')&&x.attachedTo===c.iid),c]);break;
    case 'targeter-damage':if(ctx.data.byPlayer)await g.damageBatch([{src,target:ctx.data.byPlayer,n:3}],{deferSBA:true});break;
    case 'targeter-sacrifice':if(ctx.data.byPlayer){const q=ctx.data.byPlayer,rows=await choose(ctx,q,g.lands(q).filter(c=>g.canSacrifice(c)),1,1);if(rows[0])await g.sacrifice(q,rows[0]);}break;
    case 'creature-hit-backlash':{const q=ctx.oracleSourceCapture?.eventController;if(q)await g.damageBatch([{src,target:q,n:3},{src,target:p,n:3}],{deferSBA:true});break;}
    case 'grave-exile-life':if(c){const creature=c.is('Creature'),owner=c.owner;await g.move(c,'exile');if(creature)await g.loseLife(owner,1,s.name);}break;
    case 'grave-enchantment-permission':if(c)c.meta.emryCastTurn=g.turnNo;break;
    case 'ignore-defender':if(same()){const version=s.zoneVersion;g.untilEffects.push({expires:'eot',apply:(game,bf)=>{const c=bf.find(c=>c===s&&c.zoneVersion===version);if(c)c.cur.defenderCanAttack=true;}});g.recalc();}break;
    case 'upkeep-basics':{const q=ctx.data.player;if(g.lands(q).filter(c=>c.cur.super.includes('Basic')).length<2)await g.damageBatch([{src,target:q,n:2}],{deferSBA:true});break;}
    case 'attach-entrant':{const card=H.genericEffectSubjects(ctx,'event-card')[0];if(card&&same()&&g.legalEntryAttachment(s,card,p))await g.attach(s,card);break;}
    case 'sac-unless-attacked':if(same()&&s.ctrl===p&&s.meta._attackedTurn!==g.turnNo)await g.sacrifice(p,s);break;
    case 'discard-creature-counters':{const rows=await choose(ctx,p,p.hand.filter(c=>c.is('Creature'))),before=p.turnState.discardedN||0;await g.discard(p,rows);const n=(p.turnState.discardedN||0)-before;if(same())g.addCounters(s,'+1/+1',2*n,false,p);break;}
    case 'mill-artifact-top':{await g.mill(p,5);const [card]=await choose(ctx,p,p.graveyard.filter(c=>c.is('Artifact')),0,1);if(card)await g.move(card,'library');break;}
    case 'exile-is-next-turn':{const card=p.library.at(-1);if(card){await g.move(card,'exile');if(card.zone==='exile')M.OracleV22Layouts.grant(ctx,[card],{duration:'next-turn-start',spellsOnly:true,filter:{what:'spell',zone:'stack',spellFilter:{what:'card',zone:'graveyard',alternatives:[{what:'instant',zone:'graveyard'},{what:'sorcery',zone:'graveyard'}]}}});}break;}
    case 'exile-search-walker':if(s.zone==='graveyard'&&s.zoneVersion===ctx.sourceZoneVersion){await g.move(s,'exile');await search(ctx,{what:'planeswalker',zone:'graveyard',min:1},'battlefield');}break;
    case 'bounce-nongiants':await g.bounceMany(g.bf().filter(c=>!c.is('Land')&&!c.hasSub('Giant')&&!c.hasSub('Wizard')));break;
    case 'search-flashback-disturb':await search(ctx,{what:'card',zone:'graveyard',min:1,v20:{kind:'flashback-disturb-v53'}},'graveyard');break;
    case 'upkeep-nonblack':await g.damageBatch([{src,target:ctx.data.player,n:1}],{deferSBA:true});break;
    case 'bounce-die-scry':if(c){await g.bounceMany([c]);const [n]=await g.rollDice(p,6,1,{source:s});if(n<=3)await M.E.scry(g,p,n);}break;
    case 'chosen-types-reanimate':{const types=[];for(const q of apnap())types.push(await option(ctx,q,'Choose a creature type',M.RULES_CREATURE_TYPES.map(key=>({key,label:key}))));const cards=apnap().flatMap(q=>q.graveyard.filter(c=>c.is('Creature')&&types.some(t=>c.hasSub(t))).map(card=>({card,opts:{ctrl:q}})));await g.moveBattlefieldBatch(cards);break;}
    case 'pay-life-bounce':{const q=ctx.data.player;if(g.canPayLife(q,2)&&await option(ctx,q,'Pay 2 life?')==='yes')await g.loseLife(q,2,s.name);else{const [card]=await choose(ctx,q,g.bf().filter(c=>c.ctrl===q),1,1);if(card)await g.bounceMany([card]);}break;}
    case 'coin-damage':{const r=await g.flipCoin(p,{source:s});if(r.won&&c)await g.damageBatch([{src,target:c,n:2}],{deferSBA:true});else if(!r.won&&same())await g.damageBatch([{src,target:s,n:2}],{deferSBA:true});break;}
    case 'coin-attackers':{let n=0;for(let i=0;i<3;i++)if((await g.flipCoin(p,{source:s})).won)n++;await H.runGenericEffect(ctx,{action:'token-inline',who:'you',n,tapped:true,attacking:true,token:{name:'Goblin',cost:'',types:['Creature'],subtypes:['Goblin'],colors:['R'],power:'1',toughness:'1',keywords:[]}});break;}
    case 'delayed-coin-control':{const version=ctx.sourceZoneVersion;g.delayed.push({on:'endCombat',once:true,src:s,ctrl:p,name:s.name+' — flip a coin',run:async child=>{const r=await child.g.flipCoin(p,{source:s});if(!r.won&&s.zone==='battlefield'&&s.zoneVersion===version){const opponents=p.opponents(child.g);if(opponents.length){const key=await option(child,p,'Choose an opponent',opponents.map(q=>({key:String(q.idx),label:q.name})));M.OracleV8Control.gain(child.g,s,opponents.find(q=>String(q.idx)===key));child.g.recalc();}}}});break;}
    case 'die-pump':{const [n]=await g.rollDice(p,6,1,{source:s});if(same())M.E.pumpUntilEOT(g,s,n-1,0,[]);break;}
    case 'counter-each-kind':if(c)for(const key of Object.keys(c.counters).filter(k=>c.counters[k]>0)){if(await option(ctx,p,'Add or remove a '+key+' counter?',[{key:'add',label:'Add'},{key:'remove',label:'Remove'}])==='add')g.addCounters(c,key,1,false,p);else g.removeCounters(c,key,1);}break;
    case 'same-name-reanimate':{const names=ctx.oracleSourceCapture?.eventRulesNames||[];await g.moveBattlefieldBatch(apnap().flatMap(q=>q.graveyard.filter(c=>M.OracleV8NameGroups.names(c).some(n=>names.includes(n))).map(card=>({card,opts:{ctrl:q}}))));break;}
    case 'damage-gain-discard':{const results=[];if(c)await g.damageBatch([{src,target:c,n:2}],{deferSBA:true,damageResults:results});await g.gainLife(p,2,s);for(const row of results)if(row.target instanceof M.Player&&row.amount>0)await H.runGenericEffect({...ctx,targets:[row.target]},{action:'discard',who:0,n:1});break;}
    case 'opponent-boars':for(const opponent of p.opponents(g))await g.makeTokens({name:'Boar',cost:'',super:[],types:['Creature'],subtypes:['Boar'],colorsOverride:['G'],power:'2',toughness:'2'},p,{n:1,tapped:true,attacking:opponent});break;
    case 'return-died-cards':await g.moveGraveyardBatch(p.graveyard.filter(c=>c.is('Creature')&&c.meta.oracleGraveEntryV22?.turn===g.turnNo&&c.meta.oracleGraveEntryV22.version===c.zoneVersion&&c.meta.oracleGraveEntryV22.fromBattlefield),'hand');break;
    case 'reveal-dinosaur':{const rows=await choose(ctx,p,p.hand.filter(c=>c.hasSub('Dinosaur')),0,1);if(rows.length)await g.revealToHuman({cards:rows,ctrl:p,kind:'reveal',includeLands:true});if(rows.length||g.bf().some(c=>c!==s&&c.ctrl===p&&c.hasSub('Dinosaur')))await g.gainLife(p,3,s);break;}
    case 'reveal-discard-mv':if(c){const n=ctx.oracleSourceCapture?.eventSpellMvV10,rows=c.hand.slice();if(rows.length)await g.revealToHuman({cards:rows,ctrl:c,kind:'reveal',includeLands:true});await g.discard(c,rows.filter(c=>c.mv===n));}break;
    case 'empire-control':if(c){if(['Scepter of Empires','Throne of Empires'].every(name=>g.bf().some(c=>c.ctrl===p&&c.is('Artifact')&&M.OracleV8NameGroups.names(c).includes(name)))){M.OracleV8Control.gain(g,c,p);g.recalc();}else g.tap(c);}break;
    case 'upkeep-pay-control':{const q=ctx.data.player,options=[...(g.canPayMana(q,M.parseCost('{R}{R}'),null)?[{key:'mana',label:'Pay {R}{R}'}]:[]),...(g.canPayLife(q,2)?[{key:'life',label:'Pay 2 life'}]:[]),{key:'no',label:'Decline'}],key=await option(ctx,q,'Gain control?',options);if(key==='no')break;if(key==='life')await g.loseLife(q,2,s.name);else if(!await g.payMana(q,M.parseCost('{R}{R}'),null))break;if(same()){M.OracleV8Control.gain(g,s,q);g.recalc();}break;}
    case 'players-search-land':for(const q of H.genericEffectSubjects(ctx,e.target))await search({...ctx,you:q},{what:'land',zone:'graveyard',basic:true},'battlefield',{optionalSearch:true});break;
    case 'chosen-indestructible':{const row=(ctx.sourceMeta||s.meta).oracleChosenObjectV20,card=row&&g.byIid(row.iid);if(row?.version===ctx.sourceZoneVersion&&card?.zone==='battlefield'&&card.zoneVersion===row.objectVersion)M.E.pumpUntilEOT(g,card,0,0,['indestructible']);break;}
    case 'grave-exile-unless':if(c){const q=c.ctrl;if(g.canPayMana(q,M.parseCost('{2}'),null)&&await option(ctx,q,'Pay {2}?')==='yes'&&await g.payMana(q,M.parseCost('{2}'),null))break;await g.exileMany([c]);if(s.zone==='graveyard'&&s.zoneVersion===ctx.sourceZoneVersion)await g.move(s,'exile');}break;
    case 'single-creature-debuff':if(c&&g.creatures(c.ctrl).length===1)M.E.pumpUntilEOT(g,c,-2,-2,[]);break;
    default:throw Error('Unknown v53 effect '+e.mode);
   }return true;
  }
 });
})(globalThis.MTG ||= {});
