'use strict';
((M)=>{
 const H=M.OracleV20.helpers,G=M.Game.prototype;
 async function choose(ctx,p,from,min=0,max=from.length,prompt='Choose cards'){if(!from.length)return [];const versions=new Map(from.map(c=>[c,c.zoneVersion])),cards=await p.controller.decide(ctx.g,{type:'chooseCards',from,min:Math.min(min,from.length),max:Math.min(max,from.length),prompt:ctx.src.name+': '+prompt,aiHint:{kind:'bestCard',src:ctx.src}});if(!Array.isArray(cards)||cards.length<Math.min(min,from.length)||cards.length>max||new Set(cards).size!==cards.length||cards.some(c=>!versions.has(c)||versions.get(c)!==c.zoneVersion))throw Error('Invalid v52 cards');return cards;}
 async function option(ctx,p,prompt,options=[{key:'yes',label:'Yes'},{key:'no',label:'No'}]){const key=await p.controller.decide(ctx.g,{type:'chooseOption',prompt:ctx.src.name+': '+prompt,options,aiHint:{kind:'confirm',src:ctx.src}});if(!options.some(o=>o.key===key))throw Error('Invalid v52 option');return key;}
 const damage=G.recordDamageResult;G.recordDamageResult=function(src,target,n,opts){for(const witness of this.oracleDamageWitnessV52||[])if(witness.src===src&&witness.target===target&&n>0){witness.n+=n;witness.werewolf ||= target.hasSub?.('Werewolf');}return damage.call(this,src,target,n,opts);};
 M.OracleV20.handlers.push({
  amount(v,ctx){if(v.kind==='urza-lands-v52')return ctx.g.lands(ctx.you).filter(c=>c.hasSub("Urza's")).length;},
  compile(op,script){
   if(op.kind!=='common-entry-v52')return false;const previous=script.asEnters;
   script.asEnters=async(g,s)=>{if(previous)await previous(g,s);const ctx={g,src:s,you:s.ctrl},p=s.ctrl;
    if(op.mode==='reveal-Goblin'){const rows=await choose(ctx,p,p.hand.filter(c=>c.hasSub('Goblin')),0,1,'Reveal a Goblin or enter tapped');if(rows.length)await g.revealToHuman({cards:rows,ctrl:p,kind:'reveal',includeLands:true});else s.tapped=true;}
    else if(op.mode==='sacrifice-counters'){const rows=await choose(ctx,p,g.bf().filter(c=>c!==s&&c.ctrl===p&&g.canSacrifice(c)),0,99,'Sacrifice permanents as this enters'),versions=new Map(rows.map(c=>[c,c.zoneVersion]));await g.sacrificeMany(p,rows);s.meta.entrySacrificedV52={version:s.zoneVersion,n:rows.filter(c=>c.zoneVersion!==versions.get(c)).length};}
    else throw Error('Unknown v52 entry '+op.mode);
   };
   if(op.mode==='sacrifice-counters')script.etbCounters={kind:'+1/+1',n:(g,s)=>s.meta.entrySacrificedV52?.version===s.zoneVersion?s.meta.entrySacrificedV52.n:0};
   return true;
  },
  targetHint(e){if(e.action==='common-effects-v52')return {goal:['move-aura','host-damage-owner','damage-werewolf','destroy-blockers','bounce-with-auras'].includes(e.mode)?'removal':'buff'};},
  async effect(ctx,e){
   if(e.action!=='common-effects-v52')return false;
   const g=ctx.g,p=ctx.you,s=ctx.src,c=H.genericEffectSubjects(ctx,e.target)[0],same=()=>H.sameBattlefieldSource(ctx),sacSelf=async()=>{if(same()&&s.ctrl===p)await g.sacrifice(p,s);},defender=()=>ctx.data?.defender instanceof M.Player?ctx.data.defender:ctx.data?.defender?.ctrl||H.genericEffectSubjects(ctx,'defending-player')[0];
   switch(e.mode){
    case 'move-aura':if(c){const host=g.byIid(c.attachedTo),types=e.hostTypes?.filter(t=>host?.is(t));if(e.gainControl){M.OracleV8Control.gain(g,c,p);g.recalc();}const pool=g.bf().filter(x=>x!==host&&(!types||types.some(t=>x.is(t)))&&g.legalEntryAttachment(c,x,p)),next=(await choose(ctx,p,pool,1,1,'Choose another permanent to enchant'))[0];if(next)await g.attach(c,next);}break;
    case 'hand-aura':if(same()){const aura=(await choose(ctx,p,p.hand.filter(x=>x.hasSub('Aura')&&g.legalEntryAttachment(x,s,p)),0,1,'Put an Aura onto this creature'))[0];if(aura)await g.move(aura,'battlefield',{ctrl:p,attachTo:s});}break;
    case 'grave-aura':if(c){const host=(await choose(ctx,p,g.creatures(p).filter(x=>g.legalEntryAttachment(c,x,p)),1,1,'Choose a creature to enchant'))[0];if(host)await g.move(c,'battlefield',{ctrl:p,attachTo:host});}break;
    case 'exile-return-spirits':if(s.zone==='graveyard'&&s.zoneVersion===ctx.sourceZoneVersion){await g.move(s,'exile');await g.moveGraveyardBatch(H.genericEffectSubjects(ctx,e.target).filter(x=>x.zone==='graveyard'),'hand');}break;
    case 'shuffle-chosen-type':{const key=await option(ctx,p,'Choose a creature type',M.RULES_CREATURE_TYPES.map(key=>({key,label:key})));await g.moveGraveyardBatch(p.graveyard.filter(x=>x.is('Creature')&&x.hasSub(key)),'library');M.shuffle(p.library,g.rnd);break;}
    case 'destroy-blockers':if(c)await g.destroyMany(g.creatures().filter(x=>x.blocking===c.iid&&!x.hasSub('Wall')));break;
    case 'upkeep-mana-cost':{const cost=s.def.cost;if(!cost||!g.canPayMana(p,M.parseCost(cost),null)||await option(ctx,p,'Pay '+cost+'?')!=='yes'||!await g.payMana(p,M.parseCost(cost),null))await sacSelf();break;}
    case 'host-damage-owner':if(c)await g.damageBatch([{src:c,target:c.owner,n:1}],{deferSBA:true});break;
    case 'bounce-with-auras':if(c)await g.bounceMany([...g.bf().filter(x=>x.hasSub('Aura')&&x.attachedTo===c.iid),c]);break;
    case 'self-target-shuffle':{const rows=[...(same()?[s]:[]),...(c?[c]:[])],owners=[...new Set(rows.map(x=>x.owner))];await H.runGenericEffect({...ctx,targets:[[...new Set(rows)]]},{action:'move-to-library',target:0});for(const q of owners)M.shuffle(q.library,g.rnd);break;}
    case 'mill-pump':if(c){const rows=await g.mill(c,1),n=rows[0]?.mv||0;if(same())M.E.pumpUntilEOT(g,s,n,n,[]);}break;
    case 'damage-werewolf':if(c){const witness={src:H.oracleDamageSource(ctx),target:c,n:0,werewolf:false};(g.oracleDamageWitnessV52||=[]).push(witness);try{await g.damageBatch([{src:witness.src,target:c,n:3}],{deferSBA:true});}finally{g.oracleDamageWitnessV52.splice(g.oracleDamageWitnessV52.indexOf(witness),1);}if(witness.n&&witness.werewolf)await g.destroy(c);}break;
    case 'opponent-hand-permanent':for(const q of g.apnapFrom(g.turnPlayer||p).filter(q=>q!==p)){const rows=await choose(ctx,q,q.hand.filter(x=>x.is('Artifact')||x.is('Enchantment')),0,1,'Put an artifact or enchantment onto the battlefield');if(rows[0])await g.putPermanentOntoBattlefield(rows[0],q);}break;
    case 'pay-or-unblockable':{const q=defender();if(q&&(!g.canPayMana(q,M.parseCost('{4}'),null)||await option(ctx,q,'Pay {4}?')!=='yes'||!await g.payMana(q,M.parseCost('{4}'),null)))await H.runGenericEffect(ctx,{action:'unblockable-until-eot',target:'self'});break;}
    case 'defender-least-power':{const q=defender();if(q){const creatures=g.creatures(q),least=Math.min(...creatures.map(c=>c.power)),rows=await choose(ctx,q,creatures.filter(c=>c.power===least&&g.canSacrifice(c)),1,1,'Sacrifice a creature with the least power');if(rows[0])await g.sacrifice(q,rows[0]);}break;}
    case 'animate-lands':if(c)for(const land of g.lands(c))g.addOracleAnimation(land,{types:['Creature'],subtypes:[],keywords:[],power:3,toughness:3,retainTypes:true,retainAllSubtypes:true,temporary:true});break;
    case 'colors-protection':if(c)await H.runGenericEffect(ctx,{action:'grant-protection',filters:[{what:'creature',zone:'battlefield',controller:'you',min:1}],qualities:c.colors.map(value=>({kind:'color',value}))});break;
    case 'black-shade':for(const card of g.creatures(p)){g.addOracleAnimation(card,{types:[],subtypes:['Shade'],colors:['B'],retainTypes:true,retainAllSubtypes:false,replaceCreatureSubtypes:true,temporary:true});await H.runGenericEffect({...ctx,targets:[card]},{action:'grant-operation',target:0,operation:{kind:'generic-ability',cost:{mana:'{B}'},targets:[],effects:[{action:'pump',target:'self',power:1,toughness:1,keywords:[]}],contract:'generic-activated-effect'}});}break;
    case 'reveal-chroma':{const rows=await choose(ctx,p,p.hand,0,p.hand.length,'Reveal cards for chroma');if(rows.length)await g.revealToHuman({cards:rows,ctrl:p,kind:'reveal',includeLands:true});const n=rows.reduce((n,c)=>n+[...(c.def.cost||'').matchAll(/\{([^}]+)\}/g)].filter(m=>m[1].split('/').includes('G')).length,0);await g.gainLife(p,2*n,s);break;}
    case 'grave-library-order':{const rows=H.genericEffectSubjects(ctx,e.target),order=await choose(ctx,p,rows,rows.length,rows.length,'Order cards top first');await g.moveGraveyardBatch(order.slice().reverse(),'library');break;}
    case 'look-combat-faces':if(await option(ctx,p,'Look at face-down combat creatures?')==='yes'){const rows=g.creatures().filter(c=>c.faceDown&&(c.attacking||c.blocking)).map(c=>Object.assign(Object.create(c),{def:c.meta.mutateFaceUpDefinition||c.meta.faceDownDef,faceDown:false}));if(rows.length)await g.revealToHuman({cards:rows,ctrl:p,kind:'look',includeLands:true});}break;
    case 'remove-counter-upkeep':{const from=g.bf().filter(c=>c.ctrl===p&&Object.values(c.counters).some(n=>n>0));if(!from.length||await option(ctx,p,'Remove a counter?')!=='yes'){await sacSelf();break;}const card=(await choose(ctx,p,from,1,1,'Choose a permanent'))[0],key=await option(ctx,p,'Choose a counter',Object.keys(card.counters).filter(k=>card.counters[k]>0).map(key=>({key,label:key})));const before=card.counters[key]||0;g.removeCounters(card,key,1);if((card.counters[key]||0)>=before)await sacSelf();break;}
    case 'sacrifice-power':{let pool=g.creatures(p).filter(c=>g.canSacrifice(c)),rows=[],power=0;if(pool.reduce((n,c)=>n+Math.max(0,c.power),0)>=12&&await option(ctx,p,'Sacrifice creatures with total power at least 12?')==='yes')while(pool.length){const chosen=await choose(ctx,p,pool,power>=12?0:1,1,'Total power '+power+'; choose another creature'+(power>=12?' or finish':''));if(!chosen.length)break;rows.push(chosen[0]);power+=chosen[0].power;pool=pool.filter(c=>c!==chosen[0]);}if(power>=12)await g.sacrificeMany(p,rows);else await sacSelf();break;}
    case 'player-sacrifice-two':{for(const q of g.apnapFrom(g.turnPlayer||p)){const pool=g.creatures(q).filter(c=>g.canSacrifice(c));if(pool.length>=2&&await option(ctx,q,'Sacrifice two creatures?')==='yes'){await g.sacrificeMany(q,await choose(ctx,q,pool,2,2,'Sacrifice two creatures'));await sacSelf();break;}}break;}
    default:throw Error('Unknown v52 effect '+e.mode);
   }return true;
  }
 });
})(globalThis.MTG ||= {});
