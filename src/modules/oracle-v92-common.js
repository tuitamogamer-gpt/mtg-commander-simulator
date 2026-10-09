// Complete printed clauses for the final Battles and planeswalkers.
(function(M){
 'use strict';
 const H=M.OracleV20.helpers,G=M.Game.prototype;
 const live=c=>c?.zone==='battlefield'&&!c.phasedOut,active=c=>live(c)&&!c.cur?.abilitiesDisabled&&!c.faceDown;
 const same=ctx=>H.sameBattlefieldSource(ctx),flat=ctx=>(ctx.targets||[]).flat(Infinity).filter(Boolean),first=ctx=>flat(ctx)[0];
 const lock=c=>({card:c,zone:c.zone,version:c.zoneVersion}),current=r=>r.card.zone===r.zone&&r.card.zoneVersion===r.version;
 const T=(what='creature',controller='any',extra={})=>({what,zone:what==='player'?'player':'battlefield',controller,min:1,max:1,...extra});
 const token=(name,power,toughness,subtypes,colors,kws=[],extra={})=>({name,cost:'',types:['Creature'],subtypes,super:[],power:String(power),toughness:String(toughness),colorsOverride:colors,kws,...extra});
 const knight=token('Knight',2,2,['Knight'],['W','U'],['vigilance']);
 const pick=async(ctx,from,min=0,max=1,p=ctx.you,prompt=ctx.src.name)=>{max=Math.min(max,from.length);min=Math.min(min,max);if(!max)return[];const rows=from.map(lock),out=await p.controller.decide(ctx.g,{type:'chooseCards',from,min,max,prompt,aiHint:{kind:'bestCard',src:ctx.src}});if(!Array.isArray(out)||out.length<min||out.length>max||new Set(out).size!==out.length||out.some(c=>!rows.some(r=>r.card===c&&current(r))))throw Error('Invalid v92 card selection');return out;};
 const option=async(ctx,options,p=ctx.you,prompt=ctx.src.name)=>{const key=await p.controller.decide(ctx.g,{type:'chooseOption',options,prompt,aiHint:{kind:'optTrigger',src:ctx.src}});if(!options.some(o=>o.key===key))throw Error('Invalid v92 option');return key;};
 const yes=(ctx,prompt,p=ctx.you)=>option(ctx,[{key:'yes',label:'Yes'},{key:'no',label:'No'}],p,prompt).then(k=>k==='yes');
 const count=(ctx,c,k,n=1)=>ctx.g.putCountersV91(c,k,n,{by:ctx.you,effect:true});
 const draw=(ctx,n=1,p=ctx.you)=>ctx.g.draw(p,n,ctx.src);
 const exile=async(ctx,cards)=>{const out=[];for(const c of cards){const r=lock(c);await ctx.g.move(c,'exile');if(c.zone==='exile'&&c.zoneVersion===r.version+1)out.push(c);}return out;};
 const bottom=async(ctx,cards)=>{const rows=cards.map(lock);M.shuffle(rows,ctx.g.rnd);for(const r of rows)if(current(r))await ctx.g.move(r.card,'library',{toBottom:true});};
 const inspect=async(ctx,n,predicate)=>{const cards=ctx.you.library.slice(-n).reverse(),rows=cards.map(lock);if(cards.length)await ctx.g.revealToHuman({cards,ctrl:ctx.you,kind:'look',includeLands:true});const [c]=await pick(ctx,rows.filter(current).map(r=>r.card).filter(predicate));if(c){await ctx.g.revealToHuman({cards:[c],ctrl:ctx.you,kind:'reveal'});await ctx.g.move(c,'hand');}await bottom(ctx,rows.filter(current).map(r=>r.card));};
 const search=async(ctx,predicate,n=1,{graveyard=false,outside=false,to='hand',tapped=false}={})=>{const p=ctx.you,g=ctx.g,allowed=g.canSearchLibrary(p,p,ctx)!==false,library=allowed?g.searchableLibrary(p,p):[],pool=[...library,...(graveyard?p.graveyard:[]),...(outside?p.outsideGameV87||[]:[])].filter(predicate),cards=await(async()=>{if(allowed)await g.emit('searchedLibrary',{player:p,libraryOwner:p,source:ctx.src});return pick(ctx,pool,0,n,p,'Search for '+ctx.src.name);})();if(cards.length)await g.revealToHuman({cards,ctrl:p,kind:'reveal'});for(const c of cards)if(to==='battlefield')await g.putPermanentOntoBattlefield(c,p,{tapped});else{if(c.zone==='outside-game')p.outsideGameV87=p.outsideGameV87.filter(x=>x!==c);await g.move(c,to);}M.shuffle(p.library,g.rnd);return cards;};
 const follow=(ctx,targets,run)=>ctx.g.queueTrigger({src:ctx.src,ctrl:ctx.you,sourceZoneVersion:ctx.sourceZoneVersion,sourceMeta:ctx.sourceMeta,data:ctx.data,oracleReflexive:true,name:ctx.src.name+' — when you do',targets:H.genericTargetSpecs(targets,[]),run});
 const pump=(ctx,c,p,t,kw=[])=>M.E.pumpUntilEOT(ctx.g,c,p,t,kw);
 const x=ctx=>Number(ctx.oracleSourceCapture?.castMeta?.x??ctx.src.castMeta?.x??ctx.data?.card?.castMeta?.x??ctx.so?.x??ctx.x??0);
 const damage=(ctx,c,n)=>ctx.g.damageAny(H.oracleDamageSource(ctx),c,n);
 const returnCard=(ctx,c)=>ctx.g.move(c,'hand');
 const grant=(ctx,cards,extra={})=>M.OracleV22Layouts.grant(ctx,cards,{duration:'eot',spellsOnly:false,...extra});
 const copyCards=async(ctx,cards,n=1)=>{const copies=[];for(const c of cards)for(let i=0;i<n;i++){const copy=new M.CardInst(M.OracleV8Faces.copyTokenDefinition(c),ctx.you);copy.zone='exile';copy.meta.bomCastCopy=true;copy.meta.bomPreparingCopy=true;ctx.you.exile.push(copy);(ctx.g.bomCardCopies||=[]).push(copy);copies.push(copy);}try{for(const copy of copies)await M.OracleV8PlayPermissions.castOne(ctx,[copy],{free:true},H);}finally{for(const c of copies){delete c.meta.bomPreparingCopy;if(c.zone==='exile'){ctx.g.remove(c);c.zone='ceased';}}}};
 M.OracleV92={H,live,active,same,flat,first,lock,current,T,token,knight,pick,option,yes,count,draw,exile,bottom,inspect,search,follow,pump,x,damage,returnCard,grant,copyCards};
 M.OracleV20.handlers.unshift({compile(op,script,entry,h){
  if(op.kind!=='complete-face-v92')return false;
  const tr=(on,filter,run,targets=[],extra={})=>{const t={on,filter,run,targets:H.genericTargetSpecs(targets,[]),...extra};h.triggers.push(t);return t;};
  const self=(g,s,d)=>d.card===s,own=(g,s,d)=>d.player===s.ctrl;
  const etb=(run,targets=[])=>tr('etb',self,run,targets),a=(cost,run,targets=[],extra={})=>{const ab=H.compileGenericAbility({kind:'generic-ability',cost,effects:[],targets,optional:false,...extra});ab.run=run;h.abilities.push(ab);return ab;};
  const loyalty=(n,run,targets=[],extra={})=>a({loyalty:n},run,targets,{loyalty:n,sorceryOnly:true,...extra});
  const st=(apply,phase=5)=>h.statics.push({phase,apply});
  const A={script,h,tr,self,own,etb,a,loyalty,st};
  for(const line of op.clauses)if(!install(op.name,line,A)&&!M.installPlaneswalkerV92?.(op.name,line,A))throw Error('Unimplemented v92 printed clause '+op.name+': '+line);
  return true;
 },target(g,c,p,s,n,evidence){
  if(n.kind==='v92-battle-opponent')return c instanceof M.Player?c!==p:c.is('Battle')&&c!==s;
  if(n.kind==='v92-creature-walker')return c.is('Creature')||c.is('Planeswalker');
  if(n.kind==='v92-artifact-creature')return c.is('Artifact')||c.is('Creature');
  if(n.kind==='v92-nonbattle-permanent')return (n.allowBattle||!c.is('Battle'))&&['Artifact','Battle','Creature','Enchantment','Land','Planeswalker'].some(k=>c.is(k));
  if(n.kind==='v92-not-two-colors')return !c.is('Land')&&c.colors.length!==2;
  if(n.kind==='v92-lorwyn')return !c.hasSub('Elf')&&c.power<=g.lands(p).length;
  if(n.kind==='v92-teferi')return !c.is('Land')&&c.mv<=(evidence?.oracleContext?.data?.v92Tapped??0);
 },damageReplacementCandidates({g,data}){return g.bf().filter(c=>active(c)&&c.def.v92Disciples&&c.ctrl===data.src?.ctrl&&!data.src?.is?.('Creature')&&(data.target instanceof M.Player?data.target!==c.ctrl:data.target?.is('Creature')||data.target?.is('Battle'))).map(src=>({key:src,src,label:src.name+' — add 2 damage',apply:async()=>{data.n+=2;}}));}});
 function install(name,line,A){
  const {script,h,tr,self,own,etb,a,loyalty,st}=A;
  if(name.startsWith('Invasion of ')){
   switch(name){
    case 'Invasion of Azgol':etb(async ctx=>{const p=first(ctx);if(!p)return;const [c]=await pick(ctx,ctx.g.bf().filter(c=>c.ctrl===p&&(c.is('Creature')||c.is('Planeswalker'))&&ctx.g.canSacrifice(c)),1,1,p,'Sacrifice a creature or planeswalker');if(c)await ctx.g.sacrifice(p,c);await ctx.g.loseLife(p,1,ctx.src.name);},[T('player')]);return true;
    case 'Invasion of Ixalan':etb(ctx=>inspect(ctx,5,c=>['Artifact','Battle','Creature','Enchantment','Land','Planeswalker'].some(k=>c.is(k))));return true;
    case 'Invasion of Ikoria':etb(ctx=>search(ctx,c=>c.is('Creature')&&!c.hasSub('Human')&&c.mv<=x(ctx),1,{graveyard:true,to:'battlefield'}));return true;
    case 'Invasion of Karsus':etb(ctx=>ctx.g.damageBatch(ctx.g.bf().filter(c=>c.is('Creature')||c.is('Planeswalker')).map(target=>({src:H.oracleDamageSource(ctx),target,n:3}))));return true;
    case 'Invasion of Muraganda':etb(async ctx=>{const [c,other]=flat(ctx);if(c)await count(ctx,c,'+1/+1');if(c&&other)await H.runGenericEffect({...ctx,targets:[c,other]},{action:'fight',target:0,otherTarget:1});},[T('creature','you'),T('creature','opponent',{min:0,max:1})]);return true;
    case 'Invasion of Pyrulea':etb(async ctx=>{await M.E.scry(ctx.g,ctx.you,3);const c=ctx.you.library.at(-1);if(c){await ctx.g.revealToHuman({cards:[c],ctrl:ctx.you,kind:'reveal',includeLands:true});if(c.is('Land')||c.oracleFaces)await draw(ctx);}});return true;
    case 'Invasion of Eldraine':etb(async ctx=>{const p=first(ctx);if(p)await ctx.g.discard(p,await pick(ctx,p.hand,2,2,p,'Discard two cards'));},[T('player','opponent')]);return true;
    case 'Invasion of Kamigawa':etb(async ctx=>{const c=first(ctx);if(c){ctx.g.tap(c);await count(ctx,c,'stun');}},[T('permanent','opponent',{v20:{kind:'v92-artifact-creature'}})]);return true;
    case 'Invasion of New Phyrexia':etb(ctx=>ctx.g.makeTokens(knight,ctx.you,{n:x(ctx)}));return true;
    case 'Invasion of Zendikar':etb(ctx=>search(ctx,c=>c.is('Land')&&(c.cur?.super||c.def.super||[]).includes('Basic'),2,{to:'battlefield',tapped:true}));return true;
    case 'Invasion of Regatha':etb(async ctx=>{const [battle,creature]=flat(ctx);const packets=[];if(battle)packets.push({src:H.oracleDamageSource(ctx),target:battle,n:4});if(creature)packets.push({src:H.oracleDamageSource(ctx),target:creature,n:1});await ctx.g.damageBatch(packets);},[T('any','any',{v20:{kind:'v92-battle-opponent'}}),T('creature','any',{min:0,max:1})]);return true;
    case 'Invasion of New Capenna':etb(async ctx=>{const [c]=await pick(ctx,ctx.g.bf().filter(c=>c.ctrl===ctx.you&&(c.is('Artifact')||c.is('Creature'))&&ctx.g.canSacrifice(c)));if(c&&await ctx.g.sacrifice(ctx.you,c))follow(ctx,[T('permanent','opponent',{v20:{kind:'v92-artifact-creature'}})],next=>{const target=first(next);if(target)return exile(next,[target]);});});return true;
    case 'Invasion of Tarkir':etb(async ctx=>{const cards=await pick(ctx,ctx.you.hand.filter(c=>c.hasSub('Dragon')),0,ctx.you.hand.length);if(cards.length)await ctx.g.revealToHuman({cards,ctrl:ctx.you,kind:'reveal'});follow(ctx,[T('any','any',{excludeSelf:true})],next=>{const c=first(next);if(c)return damage(next,c,cards.length+2);});});return true;
    case 'Invasion of Kaldheim':etb(async ctx=>{const cards=await exile(ctx,ctx.you.hand.slice());await draw(ctx,cards.length);grant(ctx,cards,{duration:'next-turn'});});return true;
    case 'Invasion of Fiora':etb(async ctx=>{const mode=await option(ctx,[{key:'legendary',label:'Destroy legendary creatures'},{key:'nonlegendary',label:'Destroy nonlegendary creatures'},{key:'both',label:'Destroy all creatures'}]);await ctx.g.destroyMany(ctx.g.creatures().filter(c=>mode==='both'||c.cur.super.includes('Legendary')===(mode==='legendary')));});return true;
    case 'Invasion of Vryn':etb(async ctx=>{await draw(ctx,3);await ctx.g.discard(ctx.you,await pick(ctx,ctx.you.hand,1,1,ctx.you,'Discard a card'));});return true;
    case 'Invasion of Ravnica':etb(ctx=>first(ctx)&&exile(ctx,[first(ctx)]),[T('permanent','opponent',{v20:{kind:'v92-not-two-colors'}})]);return true;
    case 'Invasion of Segovia':etb(ctx=>ctx.g.makeTokens(token('Kraken',1,1,['Kraken'],['U'],['trample']),ctx.you,{n:2}));return true;
    case 'Invasion of Tolvada':etb(ctx=>first(ctx)&&ctx.g.putPermanentOntoBattlefield(first(ctx),ctx.you),[T('card','you',{zone:'graveyard',v20:{kind:'v92-nonbattle-permanent'}})]);return true;
    case 'Invasion of Gobakhan':etb(async ctx=>{const p=first(ctx);if(!p)return;await ctx.g.revealToHuman({cards:p.hand,ctrl:ctx.you,kind:'look',includeLands:true});const [c]=await pick(ctx,p.hand.filter(c=>!c.is('Land')));if(c){const cards=await exile(ctx,[c]);grant({...ctx,you:c.owner},cards,{duration:'persistent'});if(cards.length)c.meta.v92Gobakhan=c.zoneVersion;}},[T('player','opponent')]);return true;
    case 'Invasion of Xerex':etb(ctx=>first(ctx)&&returnCard(ctx,first(ctx)),[T('creature','any',{min:0,max:1})]);return true;
    case 'Invasion of Alara':etb(async ctx=>{const cards=[],matches=[];for(const c of ctx.you.library.slice().reverse()){const out=await exile(ctx,[c]);cards.push(...out);if(out.length&&!c.is('Land')&&c.mv<=4)matches.push(c);if(matches.length===2)break;}const locked=cards.map(lock);await M.OracleV8PlayPermissions.castOne(ctx,matches,{free:true},H);const available=matches.filter(c=>locked.some(r=>r.card===c&&current(r))),[toHand]=await pick(ctx,available,Math.min(1,available.length),1,ctx.you,'Put one of the two cards into your hand');if(toHand)await returnCard(ctx,toHand);await bottom(ctx,locked.filter(current).map(r=>r.card));});return true;
    case 'Invasion of Arcavios':etb(ctx=>search(ctx,c=>c.is('Instant')||c.is('Sorcery'),1,{graveyard:true,outside:true}));return true;
    case 'Invasion of Innistrad':if(line==='Flash'){script.flash=true;script.kws=[...new Set([...(script.kws||[]),'flash'])];}else etb(ctx=>{if(first(ctx))pump(ctx,first(ctx),-13,-13);},[T('creature','opponent')]);return true;
    case 'Invasion of Moag':etb(async ctx=>{for(const c of ctx.g.creatures(ctx.you))await count(ctx,c,'+1/+1');});return true;
    case 'Invasion of Shandalar':etb(async ctx=>{for(const c of flat(ctx))await returnCard(ctx,c);},[T('card','you',{zone:'graveyard',min:0,max:3,v20:{kind:'v92-nonbattle-permanent',allowBattle:true}})]);return true;
    case 'Invasion of Theros':etb(ctx=>search(ctx,c=>c.hasSub('Aura')||c.hasSub('God')||c.hasSub('Demigod')));return true;
    case 'Invasion of Kaladesh':etb(ctx=>ctx.g.makeTokens(token('Thopter',1,1,['Thopter'],[],['flying'],{types:['Artifact','Creature']}),ctx.you));return true;
    case 'Invasion of Lorwyn':etb(ctx=>first(ctx)&&ctx.g.destroy(first(ctx)),[T('creature','opponent',{v20:{kind:'v92-lorwyn'}})]);return true;
    case 'Invasion of Dominaria':etb(async ctx=>{await ctx.g.gainLife(ctx.you,4);await draw(ctx);});return true;
    case 'Invasion of Mercadia':etb(async ctx=>{const [c]=await pick(ctx,ctx.you.hand);if(c){const cards=await ctx.g.discard(ctx.you,[c]);if(cards.length)await draw(ctx,2);}});return true;
    case 'Invasion of Belenon':etb(ctx=>ctx.g.makeTokens(knight,ctx.you));return true;
    case 'Invasion of Ulgrotha':etb(async ctx=>{if(first(ctx))await damage(ctx,first(ctx),3);await ctx.g.gainLife(ctx.you,3);},[T('any','any',{excludeSelf:true})]);return true;
    case 'Invasion of Amonkhet':etb(async ctx=>{for(const p of ctx.g.apnapFrom(ctx.you).filter(p=>!p.lost))await ctx.g.mill(p,3,ctx.src);for(const p of ctx.you.opponents(ctx.g))await ctx.g.discard(p,await pick(ctx,p.hand,1,1,p,'Discard a card'));await draw(ctx);});return true;
    case 'Invasion of Ergamon':etb(async ctx=>{await ctx.g.makeTokens(M.TOKENS.treasure,ctx.you);const [c]=await pick(ctx,ctx.you.hand);if(c){const cards=await ctx.g.discard(ctx.you,[c]);if(cards.length)await draw(ctx);}});return true;
    case 'Invasion of Kylem':etb(ctx=>{for(const c of flat(ctx))pump(ctx,c,2,0,['vigilance','haste']);},[T('creature','any',{min:0,max:2})]);return true;
   }
  }
  switch(name){
   case 'Ashen Reaper':tr('endStep',(g,s,d)=>own(g,s,d)&&(g.v92PermanentToGraveTurn===g.turnNo),ctx=>same(ctx)&&count(ctx,ctx.src,'+1/+1'));return true;
   case 'Zilortha, Apex of Ikoria':script.v92Zilortha=true;return true;
   case 'Primordial Plasm':tr('beginCombat',own,ctx=>{const c=first(ctx);if(c){pump(ctx,c,2,2);M.OracleV8AbilityLoss.add(ctx.g,[c],{temporary:true});}},[T('creature','any',{excludeSelf:true})]);return true;
   case 'Gargantuan Slabhorn':st((g,s,bf)=>{for(const c of bf)if(c!==s&&c.ctrl===s.ctrl&&c.oracleFace==='back'){c.cur.kw.add('trample');c.cur.extraWards.push({mana:'{2}'});}});return true;
   case 'Teferi Akosa of Zhalfir':if(line.startsWith('−2:'))loyalty(-2,ctx=>H.runGenericEffect(ctx,{action:'create-emblem-v11',text:'Knights you control get +1/+0 and have ward {1}.',operations:[{kind:'generic-static',scope:'filtered-permanents',filters:[T('creature','you',{subtype:'Knight'})],power:1,toughness:0,wardV9:{mana:'{1}'},contract:'generic-continuous-effect'}]}));else loyalty(-3,async ctx=>{const cards=await pick(ctx,ctx.g.creatures(ctx.you).filter(c=>!c.tapped),0,ctx.g.creatures(ctx.you).length,ctx.you,'Tap any number of untapped creatures');for(const c of cards)ctx.g.tap(c);follow({...ctx,data:{...ctx.data,v92Tapped:cards.length}},[T('permanent','opponent',{v20:{kind:'v92-teferi'}})],async next=>{const c=first(next);if(c){await next.g.move(c,'library');M.shuffle(c.owner.library,next.g.rnd);}});});return true;
   case 'Awakened Skyclave':st((g,s)=>{if(!s.cur.types.includes('Land'))s.cur.types.push('Land');},1);return true;
   case 'Disciples of the Inferno':script.v92Disciples=true;return true;
   case 'Holy Frazzle-Cannon':tr('attacks',(g,s,d)=>s.attachedTo===d.card.iid,async ctx=>{const c=ctx.data.card,snapshot=c.battlefieldLKI?.get(ctx.eventCardZoneVersion),subs=live(c)?c.cur.subtypes:snapshot?.subtypes||[],all=live(c)&&c.cur.allCreatureTypes;for(const card of ctx.g.creatures(ctx.you))if(card===c||all||card.cur.allCreatureTypes||subs.some(t=>M.CREATURE_SUBTYPES.has(t)&&card.hasSub(t)))await count(ctx,card,'+1/+1');});return true;
   case 'Marchesa, Resolute Monarch':tr('upkeep',(g,s,d)=>own(g,s,d)&&!(s.ctrl.v92LastCombatDamageTurn!==undefined&&s.ctrl.v92LastCombatDamageTurn>=(s.ctrl.v92PreviousTurnStart??-Infinity)),async ctx=>{await draw(ctx);await ctx.g.loseLife(ctx.you,1,ctx.src.name);});return true;
   case 'Guildpact Paragon':tr('cast',(g,s,d)=>d.player===s.ctrl&&d.so&&M.C1920.castColors(g,d.card,d.so.castOpts).length===2,ctx=>inspect(ctx,6,c=>c.colors.length===2));return true;
   case 'Caetus, Sea Tyrant of Segovia':script.v92Caetus=true;return true;
   case 'Invocation of the Founders':tr('cast',(g,s,d)=>d.player===s.ctrl&&d.card.castMeta?.from==='hand'&&g.isInstantSorcerySpell(d.so),async ctx=>{if(ctx.g.stack.includes(ctx.data.so)&&await yes(ctx,'Copy the spell?'))await ctx.g.copySpell(ctx.data.so,ctx.you,{mayNewTargets:true});});return true;
   case 'Deluge of the Dead':a({mana:'{2}{B}'},async ctx=>{const c=first(ctx);if(c){const creature=c.is('Creature'),cards=await exile(ctx,[c]);if(creature&&cards.length)await ctx.g.makeTokens(token('Zombie',2,2,['Zombie'],['B']),ctx.you);}},[T('card','any',{zone:'graveyard'})]);return true;
   case 'Awaken the Maelstrom':if(line==='Awaken the Maelstrom is all colors.'){script.colorsOverride=['W','U','B','R','G'];return true;}h.spellFragments.push({oracleOperation:{},targetOffset:0,targets:H.genericTargetSpecs([T('player'),T('permanent','opponent')],[]),run:async ctx=>{const [p,enemy]=flat(ctx);if(p)await draw(ctx,2,p);const [artifact]=await pick(ctx,ctx.you.hand.filter(c=>c.is('Artifact')));if(artifact)await ctx.g.putPermanentOntoBattlefield(artifact,ctx.you);const [copy]=await pick(ctx,ctx.g.bf().filter(c=>c.ctrl===ctx.you),Math.min(1,ctx.g.bf().filter(c=>c.ctrl===ctx.you).length),1);if(copy)await ctx.g.copyPermanentToken(copy,ctx.you);const creatures=ctx.g.creatures(ctx.you),chosen=await pick(ctx,creatures,Math.min(1,creatures.length),Math.min(3,creatures.length),ctx.you,'Choose creatures to receive three counters');let left=3;for(let i=0;i<chosen.length;i++){const max=left-(chosen.length-i-1),n=i===chosen.length-1?left:Number(await ctx.you.controller.decide(ctx.g,{type:'chooseX',min:1,max,prompt:'Counters for '+chosen[i].name,aiHint:{kind:'chooseX'}}));if(!Number.isInteger(n)||n<1||n>max)throw Error('Invalid Maelstrom counter division');await count(ctx,chosen[i],'+1/+1',n);left-=n;}if(enemy)await ctx.g.destroy(enemy);}});return true;
  }
  return false;
 }
 const spellCost=G.spellCost;G.spellCost=function(p,c,opts={}){const cost=spellCost.call(this,p,c,opts);if(c.meta.v92Gobakhan===c.zoneVersion&&c.zone==='exile')cost.generic+=2;return cost;};
 M.oracleConvokeV92=(g,p,so)=>!g.castHasType(so.card,so.castOpts||{},'Creature')&&g.bf().some(s=>active(s)&&s.ctrl===p&&s.def.v92Caetus);
 const emit=G.emit;G.emit=async function(event,d,...args){if(event==='cardToGraveyard'&&d.from==='battlefield'||event==='lto'&&d.died)this.v92PermanentToGraveTurn=this.turnNo;if(event==='dealtDamage'&&d.combat&&d.n>0&&d.target instanceof M.Player)d.target.v92LastCombatDamageTurn=this.turnNo;return emit.call(this,event,d,...args);};
 const beginning=G.runBeginningPhase;G.runBeginningPhase=async function(p,opts={}){if(!opts.additional){p.v92PreviousTurnStart=p.v92CurrentTurnStart??-Infinity;p.v92CurrentTurnStart=this.turnNo;}return beginning.call(this,p,opts);};
})(globalThis.MTG||={});
