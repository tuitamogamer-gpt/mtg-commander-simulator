'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.CDK,G=M.Game.prototype;
 const registerToken=(key,def)=>M.TOKENS[key]=M.tokenDefinitionForCreation({...def,bomTokenKey:key});
 const artifacts=(g,p)=>g.bf().filter(c=>c.ctrl===p&&c.is('Artifact'));
 const uniqueTokens=(g,p)=>new Set(artifacts(g,p).filter(c=>c.isToken).map(c=>c.name)).size;
 const corrupted=(g,p)=>p.opponents(g).filter(p=>p.poison>=3);
 const insect=C.token('Phyrexian Insect',['Phyrexian','Insect'],1,1,['G'],['infect']);
 const rebel=C.token('Rebel',['Rebel'],2,2,['R']);
 const knight=C.token('Knight',['Knight'],2,2,['W'],['vigilance']);
 const powerstone=registerToken('bomPowerstone',{...C.token('Powerstone',['Powerstone'],0,0,[]),types:['Artifact'],tokenImageName:'Powerstone',mana:{cost:{tap:true},produce:[{C:1}],restrictAbilities:true,restrict:(g,spell)=>!spell||spell.isAbility||!!spell.card&&g.castHasType(spell.card,spell.castOpts||{},'Artifact')}});
 const transform=async(ctx,c=ctx.src)=>{
  if((c.def.bomDaybound||c.def.bomNightbound)&&!ctx.bomDayNight)return false;
  if(c.zone!=='battlefield'||c===ctx.src&&!C.same(ctx)||!c.oracleFaces||c.oracleFaces.layout!=='transform')return false;
  if(c.mutateState){await M.Mutate.transform(ctx.g,c);return true;}
  const face=c.oracleFace==='back'?'front':'back';
  if(!M.OracleV8Faces.setFace(c,face))return false;
  c.oracleTransformCount=(c.oracleTransformCount||0)+1;ctx.g.recalc();
  await ctx.g.emit('transformed',{card:c,face});return true;
 };
 const blinkTransform=async(ctx)=>{if(!C.same(ctx))return false;const c=ctx.src,v=c.zoneVersion;await ctx.g.move(c,'exile');if(c.zone!=='exile'||c.zoneVersion!==v+1)return false;await ctx.g.putPermanentOntoBattlefield(c,c.owner,{oracleFace:'back'});return c.zone==='battlefield'&&c.oracleFace==='back';};
 let incubator;
 {
   const front=M.tokenDefinitionForCreation({...C.token('Incubator',['Incubator'],0,0,[]),types:['Artifact'],bomTokenKey:'bomIncubator',tokenImageName:'MOC Incubator',abilities:[{label:'Transform this Incubator into a Phyrexian',cost:{mana:'{2}'},run:ctx=>transform(ctx)}]});
   const back=M.tokenDefinitionForCreation({...C.token('Phyrexian',['Phyrexian'],0,0,[]),types:['Artifact','Creature'],bomTokenKey:'bomIncubator',tokenImageName:'MOC Phyrexian'});
   const faces={layout:'transform',canonicalName:'Incubator // Phyrexian',faces:[{key:'front',def:front},{key:'back',def:back}]};
   incubator=M.OracleV8Faces.faceDefinition(faces,'front');M.TOKENS.bomIncubator=incubator;
 }
 const incubate=async(ctx,n,p=ctx.you)=>{
  return ctx.g.makeTokens(incubator,p,{additionalCounters:{'+1/+1':Math.max(0,n)},additionalCounterBy:ctx.you});
 };
 const lookTake=async(ctx,n,filter,{to='hand',random=true,tapped=false}={})=>{
  const cards=n>0?await C.look(ctx,n):[],[c]=await C.choose(ctx.g,ctx.you,cards.filter(filter),0,1,ctx.src.name+': choose a card');
  if(c){if(to==='hand')await ctx.g.revealToHuman({cards:[c],ctrl:ctx.you,kind:'reveal'});if(to==='battlefield')await ctx.g.putPermanentOntoBattlefield(c,ctx.you,{tapped});else await ctx.g.move(c,to);}
  await (random?C.randomBottom:C.bottom)(ctx,cards.filter(c=>c.zone==='library'));return c;
 };
 const planarVote=async ctx=>{const votes=await C.vote(ctx,[{key:'planeswalk',label:'Planeswalk'},{key:'chaos',label:'Chaos'}]);const outcome=votes.filter(v=>v.key==='planeswalk').length>votes.length/2?'planeswalk':'chaos';ctx.g.lg(ctx.src.name+': '+outcome+' wins the vote. No plane is active in this Commander game.','info');await ctx.g.emit(outcome,{player:ctx.you,source:ctx.src});};
 const backup=(n,triggers=[],keywords=[],count=1)=>Array.from({length:count},()=>C.enterTrigger('Backup '+n+': put counters on a creature and lend the following abilities',ctx=>{const c=ctx.targets[0];if(!c)return;C.add(ctx,c,'+1/+1',n);if(c!==ctx.src||c.zoneVersion!==ctx.sourceZoneVersion)C.grant(ctx,c,keywords,'eot',{field:'extraTriggers',grants:triggers.map(t=>({...t}))});},{targets:[M.T.creature()]}));
 const face=(name,front,back)=>{
  const entry=M.BOM_FACE_DATA[name];if(!entry)throw Error('Missing pinned faces: '+name);
  const scripts=[front,back];
  M.SCRIPTS[name]=M.OracleV8Faces.compile(entry,{layout:entry.layout,faces:entry.faces},r=>({...scripts[entry.faces.findIndex(f=>f.raw.name===r.raw.name)],colorsOverride:r.raw.colors||[]}));
 };
 const emit=G.emit;
 G.emit=async function(name,data){
  this.delayed=this.delayed.filter(r=>r.bomTurn===undefined||r.bomTurn===this.turnNo);
  if(name==='beginCombat')data.player.turnState.bomCombatCount=(data.player.turnState.bomCombatCount||0)+1;
  if(name==='etb'){data.card.meta.bomEnteredTurn=this.turnNo;data.card.meta.bomEnteredBy=data.card.ctrl.idx;}
  if(name==='dies'&&(data.snap?.subtypes?.includes('Phyrexian')||data.snap?.changeling))data.snap.ctrl.turnState.bomPhyrexianDied=true;
  if(name==='attackersDeclared'){
   data.player.turnState.bomTokenAttack ||= (data.attackers||[]).some(r=>(r.card||r).isToken);
   data.player.turnState.bomAttackedCount=(data.attackers||[]).length;
   for(const row of data.attackers||[])(row.card||row).meta.bomAttackedCombat=this.afcCombatId;
  }
  if(['dealtDamage','damageToPlayer'].includes(name)&&!this._damageEventQueue&&data.src?.name==='Chandra, Fire of Kaladesh'){const m=data.src.meta;if(m.bomChandraTurn!==this.turnNo){m.bomChandraTurn=this.turnNo;m.bomChandraDamage=0;}m.bomChandraDamage+=data.n;}
  if(name==='cast'&&data.so&&data.card){
   data.so.bomConvoke=!!data.player.turnState.bomNextConvoke;
   data.bomConvoke=!!this.castDefinition(data.card,data.so.castOpts).convoke||data.so.bomConvoke||!!M.CDK.convoke(this,data.player,data.card,data.so.castOpts||{});
   delete data.player.turnState.bomNextConvoke;
   (data.card.castMeta||={}).bomConvoked=(data.so.convokedCards||[]).map(C.row);
  }
  return emit.call(this,name,data);
 };
 const devotion=G.devotion;G.devotion=function(p,colors){return devotion.call(this,p,colors)+this.bf().filter(c=>c.ctrl===p&&C.live(c)&&c.def.bomDevotion).length;};
 const convoke=C.convoke;C.convoke=(g,p,c,a)=>!!p.turnState.bomNextConvoke||convoke(g,p,c,a);
 const tax=C.whaleCost;C.whaleCost=(g,p,targets)=>tax(g,p,targets)+[...new Set(C.flat(targets))].filter(c=>c?.zone==='battlefield'&&c.ctrl!==p&&C.live(c)&&c.def.bomTargetTax).reduce((n,c)=>n+c.def.bomTargetTax,0);
 const immediate=(ctx,cards,{filter=()=>true,...opts}={})=>C.immediate(ctx,cards,{...opts,filter:(so,g)=>filter(so.card,g,so)});
 M.BOM={...C,registerToken,look:(ctx,n,...a)=>n>0?C.look(ctx,n,...a):Promise.resolve([]),reveal:(ctx,n,...a)=>n>0?C.reveal(ctx,n,...a):Promise.resolve([]),exileTop:(ctx,n,...a)=>n>0?C.exileTop(ctx,n,...a):Promise.resolve([]),immediate,artifacts,uniqueTokens,corrupted,insect,rebel,knight,powerstone,transform,blinkTransform,incubate,lookTake,planarVote,backup,face};
})();
