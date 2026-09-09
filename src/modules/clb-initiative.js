'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.CDK,G=M.Game.prototype,T=M.T,E=M.E,room=(name,next,run,targets=[])=>({name,next,run,targets});
 M.AFC.dungeons.undercity={name:'Undercity',initiativeOnly:true,start:'entrance',rooms:{
  entrance:room('Secret Entrance',['forge','well'],ctx=>C.search(ctx,ctx.you,C.basic,1)),
  forge:room('Forge',['trap','arena'],ctx=>ctx.targets[0]&&C.add(ctx,ctx.targets[0],'+1/+1',2),[T.creature()]),
  well:room('Lost Well',['arena','stash'],ctx=>E.scry(ctx.g,ctx.you,2)),
  trap:room('Trap!',['archives'],ctx=>ctx.targets[0]&&ctx.g.loseLife(ctx.targets[0],5,'Undercity trap'),[T.player()]),
  arena:room('Arena',['archives','catacombs'],ctx=>ctx.targets[0]&&E.goad(ctx.g,ctx.targets[0],ctx.you),[T.creature()]),
  stash:room('Stash',['catacombs'],ctx=>ctx.g.makeTokens(M.TOKENS.treasure,ctx.you)),
  archives:room('Archives',['throne'],ctx=>ctx.g.draw(ctx.you,1,ctx.src)),
  catacombs:room('Catacombs',['throne'],ctx=>ctx.g.makeTokens(C.token('Skeleton',['Skeleton'],4,1,['B'],['menace'],{tokenImageName:'CLB Skeleton'}),ctx.you)),
  throne:room('Throne of the Dead Three',[],async ctx=>{const cards=await C.reveal(ctx,10),[c]=await C.choose(ctx.g,ctx.you,cards.filter(c=>c.is('Creature')),Math.min(1,cards.filter(c=>c.is('Creature')).length),1,'Throne of the Dead Three: put a creature onto the battlefield');if(c){await ctx.g.putPermanentOntoBattlefield(c,ctx.you,{additionalCounters:{'+1/+1':3},additionalCounterBy:ctx.you});if(c.zone==='battlefield')C.grant(ctx,c,['hexproof'],'untilTurnOf',{whoTurn:ctx.you});}M.shuffle(ctx.you.library,ctx.g.rnd);})
 }};
 G.takeInitiative=async function(p,source=null){if(!p||p.lost)return;this.initiative=p;this.lg(p.name+' takes the initiative.','info');this.note('initiative',{player:p});this.queueTrigger({src:null,ctrl:p,name:'Initiative: venture into Undercity',run:ctx=>ctx.g.venture(ctx.you,source,true)});await this.emit('initiativeTaken',{player:p,source});};
 const emit=G.emit;G.emit=async function(name,data){
  if(name==='upkeep'&&data.player===this.initiative)this.queueTrigger({src:null,ctrl:data.player,name:'Initiative upkeep: venture into Undercity',run:ctx=>ctx.g.venture(ctx.you,null,true)});
  if(name==='damageToPlayer'&&data.combat&&data.player===this.initiative&&data.src?.ctrl!==data.player){const p=data.src.ctrl;this.queueTrigger({src:null,ctrl:p,name:'Take the initiative after combat damage',run:ctx=>ctx.g.takeInitiative(ctx.you)});}
  return emit.call(this,name,data);
 };
 const SC=M.SCRIPTS;
 SC["Sarevok's Tome"]={mana:{cost:{tap:true},produce:(g,c,p)=>[{C:g.initiative===p?2:1}]},triggers:[C.enterTrigger('Take the initiative',ctx=>ctx.g.takeInitiative(ctx.you,ctx.src))],abilities:[{label:'Exile to a nonland card and cast it free after completing a dungeon',cost:{mana:'{3}',tap:true},cond:(g,c,p)=>p.afcCompletedDungeons>0,run:async ctx=>{let card;while(ctx.you.library.length){card=ctx.you.library.at(-1);await ctx.g.move(card,'exile');if(!card.is('Land'))break;}if(card&&!card.is('Land')&&card.zone==='exile')await C.immediate(ctx,[card]);}}]};
 SC['Loot Dispute']={triggers:[C.enterTrigger('Take the initiative and create a Treasure',async ctx=>{await ctx.g.takeInitiative(ctx.you,ctx.src);await ctx.g.makeTokens(M.TOKENS.treasure,ctx.you);} ),{on:'attackersDeclared',filter:(g,c,d)=>d.player===c.ctrl&&d.attackers.some(r=>(r.card||r).attacking===g.initiative),desc:'Create a Treasure for attacking the initiative holder',run:ctx=>ctx.g.makeTokens(M.TOKENS.treasure,ctx.you)},{on:'dungeonCompleted',filter:C.own,desc:'Create a 5/5 flying Dragon',run:ctx=>ctx.g.makeTokens(C.token('Dragon',['Dragon'],5,5,['R'],['flying'],{tokenImageName:'CLB Dragon'}),ctx.you)}]};
 SC['Seasoned Dungeoneer']={triggers:[C.enterTrigger('Take the initiative',ctx=>ctx.g.takeInitiative(ctx.you,ctx.src)),{on:'attackersDeclared',filter:C.own,desc:'An attacking party creature gains protection from creatures and explores',targets:[T.creature({filter:(g,c)=>!!c.attacking&&C.roles.some(t=>c.hasSub(t))})],run:async ctx=>{const c=ctx.targets[0];if(!c)return;C.effectOn(ctx,c,(g,c)=>c.cur.protectionFrom.push((g,s)=>s?.is?.('Creature')));await C.explore(ctx,c);}}]};
})();
