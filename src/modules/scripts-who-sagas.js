'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.CWW,SC=M.SCRIPTS,T=M.T;
 const part=async ctx=>{for(const c of await C.exileTop(ctx,5))if(!c.is('Land'))await C.suspend(ctx,c,c.mv);};
 SC['The Parting of the Ways']={saga:[{run:part},{run:ctx=>C.timeTravel(ctx,2)},{targets:(g,c)=>c.ctrl.opponents(g).map(p=>T.permanent((g,c)=>c.ctrl===p&&c.is('Artifact'),{count:1,min:0,upTo:true})),run:ctx=>ctx.g.destroyMany(C.flat(ctx.targets),{source:ctx.src})}]};
 const day={run:async ctx=>{const cards=[];let hit;for(const c of ctx.you.library.slice().reverse()){await ctx.g.move(c,'exile');if(c.zone!=='exile')continue;cards.push(c);if(C.legendary(c)){hit=c;break;}}if(hit&&C.same(ctx))C.playGrant(ctx,hit,{source:ctx.src.iid,sourceVersion:ctx.sourceZoneVersion});await C.randomBottom(ctx,cards.filter(c=>c!==hit));}};
 SC['The Day of the Doctor']={saga:[day,day,day,{run:async ctx=>{const keep=await C.choose(ctx.g,ctx.you,ctx.g.creatures().filter(c=>c.hasSub('Doctor')),0,3,'Choose up to three Doctors to keep');if(await C.yes(ctx,'Exile all other creatures and take thirteen damage?')){await ctx.g.exileMany(ctx.g.creatures().filter(c=>!keep.includes(c)));await ctx.g.damageAny(ctx.src,ctx.you,13);}}}]};
 const human=C.registerToken('cwwDoctorHuman',C.token('Human',['Human'],1,1,['W'],[],{tokenImageName:'WHO Human',spellCostMod:(g,s,c,p,a)=>p===s.ctrl&&g.castDefinition(c,a).subtypes.includes('Doctor')?-1:0}));
 SC['The Eleventh Hour']={saga:[{run:ctx=>C.search(ctx,ctx.you,c=>c.hasSub('Doctor'),1)},{run:async ctx=>{await ctx.g.makeTokens(M.TOKENS.food,ctx.you);await ctx.g.makeTokens(human,ctx.you);}},{targets:[T.creature()],run:ctx=>{const c=ctx.targets[0];if(c)return C.copy(ctx,c,{definition:M.OracleV8Faces.copyTokenDefinition(c,d=>({...d,name:'Prisoner Zero',rulesNoName:undefined,super:[...new Set([...(d.super||[]),'Legendary'])],subtypes:['Alien'],explicitTokenName:true}))});}}]};
 const noble=C.registerToken('cwwNoble',C.vanish(3,C.token('Human Noble',['Human','Noble'],1,1,['W'],[],{cwwPreventDamage:true,tokenImageName:'WHO Human Noble'})));
 const horse=C.registerToken('cwwHorse',C.token('Horse',['Horse'],2,2,['W'],[],{tokenImageName:'WHO Horse',statics:[{apply:(g,c,bf)=>{for(const x of bf)if(x.ctrl===c.ctrl&&x.is('Creature')&&x.hasSub('Doctor'))x.cur.kw.add('horsemanship');}}]}));
 SC['The Girl in the Fireplace']={saga:[{run:ctx=>ctx.g.makeTokens(noble,ctx.you)},{run:ctx=>ctx.g.makeTokens(horse,ctx.you)},{run:ctx=>ctx.g.delayed.push({on:'damageToPlayer',once:false,expires:'eot',src:ctx.src,ctrl:ctx.you,name:'The Girl in the Fireplace: time travel',filter:(g,d,r)=>d.combat&&d.src?.ctrl===r.ctrl&&d.src.is('Creature'),run:next=>C.timeTravel(next)})}]};
})();
