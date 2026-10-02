'use strict';
((M)=>{
 const H=()=>M.OracleV20.helpers;
 async function openingReveals(game){
  for(const player of game.players)for(const source of player.hand.slice())for(const operation of source.def.oracleOpeningRevealsV23||[]){
   if(source.zone!=='hand'||source.owner!==player)continue;
   const answer=await player.controller.decide(game,{type:'chooseOption',prompt:'Reveal '+source.name+' from your opening hand?',options:[{key:'yes',label:'Reveal'},{key:'no',label:'Keep hidden'}],aiHint:{kind:'optTrigger',src:source}});
   if(answer!=='yes')continue;
   await game.revealToHuman({title:'Opening hand — '+source.name,cards:[source],ctrl:player,kind:'reveal'});
   const version=source.zoneVersion,meta=source.meta,castPlayers=[];
   const event=operation.timing==='own-first-main'?'precombatMain':operation.timing==='opponents-first-cast'?'cast':'upkeep';
   const view=Object.create(source);Object.defineProperties(view,{ctrl:{value:player},zoneVersion:{value:version},meta:{value:meta}});
   const trigger=H().compileGenericTrigger({...operation,kind:'generic-trigger',event,eventFilter:null,openingRevealV23:undefined});
   game.delayed.push({src:source,ctrl:player,name:source.name+' — opening hand',once:operation.timing!=='opponents-first-cast',on:event,
    filter:(g,data)=>{
     if(['own-first-main','own-first-upkeep'].includes(operation.timing)&&data.player!==player)return false;
     if(operation.timing==='opponents-first-cast'){if(data.player===player||castPlayers.includes(data.player.idx))return false;castPlayers.push(data.player.idx);}
     return !trigger.filter||trigger.filter(g,view,data);
    },
    run:ctx=>trigger.run({...ctx,you:player,sourceZoneVersion:version,sourceMeta:meta})
   });
  }
 }
 let installed=false;function install(){if(installed)return;installed=true;const previous=M.CDK.openingPermanents;M.CDK.openingPermanents=async game=>{await previous(game);await openingReveals(game);};}
 M.OracleV23Common={openingReveals,install};
 M.OracleV20.handlers.push({
  condition(game,source,condition,player,evidence){if(!['cast-origin-v23','cast-by-controller-v23'].includes(condition.kind))return undefined;return !!(evidence?.wasCast??source.castMeta?.wasCast)&&(evidence?evidence.castFrom:source.castMeta?.from)===condition.from&&(condition.kind!=='cast-by-controller-v23'||(evidence?.castByV23??source.castMeta?.castBy)===player.idx);},
  compile(operation,script,entry,h){
   if(operation.kind==='spell-origin-branches-v23'){
    const make=part=>h.compileOracleScript(h.batch,{...entry,...part}),ordinary=make(operation.ordinary),graveyard=make(operation.graveyard);
    const pick=(options,card,copy=false)=>!copy&&(options?.flashback||options?.from==='graveyard'||card.zone==='graveyard')?graveyard:ordinary;
    script.targets=(game,card,options,player)=>{const definition=pick(options,card);return typeof definition.targets==='function'?definition.targets(game,card,options,player):definition.targets||[];};
    const prior=script.prepareTargets;script.prepareTargets=async ctx=>{if(await prior?.(ctx)===false)return false;return pick(ctx.so.castOpts,ctx.src,ctx.so.isCopy).prepareTargets?.(ctx);};
    script.resolve=ctx=>pick(ctx.so.castOpts,ctx.src,ctx.so.isCopy).resolve(ctx);return true;
   }
   if(operation.kind!=='opening-reveal-v23'&&!operation.openingRevealV23)return false;(script.oracleOpeningRevealsV23||=[]).push(operation);return true;
  },
  async effect(ctx,effect){
   if(effect.action!=='opening-look-v23')return false;
   const cards=ctx.you.library.slice(-effect.n).reverse(),versions=new Map(cards.map(c=>[c,c.zoneVersion]));
   await ctx.g.revealToHuman({title:ctx.src.name,cards,ctrl:ctx.you,kind:'look'});
   const selected=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',prompt:'Keep up to one card on top; exile the rest.',from:cards,min:0,max:Math.min(1,cards.length),player:ctx.you});
   if(!Array.isArray(selected)||selected.length>1||new Set(selected).size!==selected.length||selected.some(c=>!cards.includes(c)))throw Error('Invalid opening library choice');
   for(const card of cards)if(!selected.includes(card)&&card.zone==='library'&&card.zoneVersion===versions.get(card))await ctx.g.move(card,'exile');
   return true;
  }
 });
})(MTG);
