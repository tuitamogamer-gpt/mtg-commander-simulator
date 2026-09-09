'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.VN,G=M.Game.prototype;
 const roles=['Cleric','Rogue','Warrior','Wizard'];
 // A multiclass creature fills one slot, so use a bipartite matching.
 const party=cards=>{let states=new Set([0]);for(const c of new Set(cards)){const next=new Set(states);for(const mask of states)for(let i=0;i<roles.length;i++)if(!(mask&(1<<i))&&c.hasSub(roles[i]))next.add(mask|(1<<i));if(next.has(15))return 4;states=next;}return Math.max(...[...states].map(mask=>mask.toString(2).replaceAll('0','').length));};
 const legendary=c=>(c.cur?.super||c.def.super||[]).includes('Legendary');
 const defender=c=>c.attacking instanceof M.Player?c.attacking:c.attacking?.ctrl;
 const damage=(ctx,targets,n)=>ctx.g.damageBatch(targets.map(target=>({src:ctx.src,target,n})));
 const death=(desc,run,extra={})=>({on:'dies',filter:(g,c,d)=>d.card===c,desc,run,...extra});
 const hit=(desc,run,extra={})=>({on:'damageToPlayer',filter:C.hit,desc,run,...extra});
 const ravenous=script=>{if(!M.applyOracleMechanic(script,{kind:'ravenous'}))throw Error('Ravenous registration failed');return script;};
 const unearth=(cost,script={})=>{if(!M.applyOracleMechanic(script,{kind:'unearth',cost}))throw Error('Unearth registration failed');return script;};
 const token=(name,subs,p,t,colors,kw=[],extra={})=>({...C.token(name,subs,p,t,colors,kw),...extra});
 const necron=token('Necron Warrior',['Necron','Warrior'],2,2,['B'],[],{types:['Artifact','Creature'],tokenImageName:'40K Necron Warrior'});
 const astartes=token('Astartes Warrior',['Astartes','Warrior'],2,2,['W'],['vigilance'],{tokenImageName:'40K Astartes Warrior'});
 const plague=token('Plaguebearer of Nurgle',['Demon'],1,3,['B'],[],{explicitTokenName:true,tokenImageName:'Plaguebearer of Nurgle'});
 const reveal=async(ctx,n,p=ctx.you)=>{const cards=p.library.slice(-n).reverse();await ctx.g.revealToHuman({cards,ctrl:p,kind:'reveal'});return cards;};
 const look=async(ctx,n,p=ctx.you)=>{const cards=p.library.slice(-n).reverse();if(!p.isAI&&cards.length)await p.controller.decide(ctx.g,{type:'cardReveal',player:p,cards,kind:'look',private:true});return cards;};
 const exileTop=async(ctx,n,p=ctx.you,opts={})=>{const cards=p.library.slice(-n).reverse(),out=[];for(const c of cards){await ctx.g.move(c,'exile');if(c.zone==='exile'){out.push(c);if(opts.play)C.playGrant(ctx,c,opts);}}return out;};
 const returnLater=(ctx,c,to='battlefield',ctrl=c.owner,tapped=false)=>{const r=C.row(c);ctx.g.delayed.push({on:'endStep',once:true,src:ctx.src,ctrl:ctx.you,name:ctx.src.name+': return '+c.name,run:next=>C.current(r)&&(to==='battlefield'?next.g.putPermanentOntoBattlefield(c,ctrl,{tapped}):next.g.move(c,to))});};
 const emit=G.emit;
 G.emit=async function(name,data){
  if(name==='etb'){data.playedLand=this.cdkLandPlay?.card===data.card;data.cdkEntryFrom=data.playedLand?this.cdkLandPlay.from:data.card.meta._enteredFromZone;data.cdkEntryVersion=data.card.zoneVersion;data.card.meta.cdkEnteredTurn=this.turnNo;if(data.card.is('Creature'))data.card.ctrl.turnState.cdkCreatureEntered=true;}
  if(name==='dies')for(const p of this.players)p.turnState.cdkDeaths=(p.turnState.cdkDeaths||0)+1;
  if(name==='cast'){
   const state=data.player.turnState;data.cdkArtifactNth=this.castHasType(data.card,data.so?.castOpts||{},'Artifact')?(state.cdkArtifactSpells=(state.cdkArtifactSpells||0)+1):0;
   data.cdkCreatureNth=data.isCreature?(state.cdkCreatureSpells=(state.cdkCreatureSpells||0)+1):0;
   data.cdkNoncreatureNth=!data.isCreature?(state.cdkNoncreatureSpells=(state.cdkNoncreatureSpells||0)+1):0;
  }
  return emit.call(this,name,data);
 };
 const budgetTargets=(spec,n,budget,metric)=>Array.from({length:n},()=>({...spec,count:1,min:0,upTo:true,differentFromAllPrevious:true,dependentFilter:(g,c,prior)=>metric(c)+C.flat(prior).reduce((s,c)=>s+metric(c),0)<=budget}));
 M.CDK={...C,budgetTargets,roles,party,legendary,defender,damage,death,hit,ravenous,unearth,token,necron,astartes,plague,reveal,look,exileTop,returnLater};
 M.CDK.nextCascade=(ctx,filter)=>{const turn=ctx.g.turnNo,f=(g,c,d)=>g.turnNo===turn&&filter(g,c,d);f.cdkTurn=turn;(ctx.you.nextCascade||=[]).push(f);};
 M.CDK.explore=async(ctx,c)=>{const r=C.row(c),top=ctx.you.library.at(-1);if(!top){if(C.current(r))ctx.g.addCounters(c,'+1/+1',1,ctx.you);await ctx.g.emit('explored',{card:c,player:ctx.you});return;}await ctx.g.revealToHuman({cards:[top],ctrl:ctx.you,kind:'reveal'});if(top.is('Land'))await ctx.g.move(top,'hand');else{if(C.current(r))ctx.g.addCounters(c,'+1/+1',1,ctx.you);if(await M.CDK.yes(ctx,'Put '+top.name+' into your graveyard?'))await ctx.g.move(top,'graveyard');}await ctx.g.emit('explored',{card:c,player:ctx.you});};
 M.CDK.immediate=(ctx,cards,{free=true,filter=()=>true,...options}={})=>M.OracleV8PlayPermissions.castOne(ctx,cards,{free,filter:{},...options},{target:()=>({filter:(g,so)=>filter(so,g)})});
})();
