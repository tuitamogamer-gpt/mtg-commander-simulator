'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.WLM,G=M.Game.prototype;
 const count=(p,k)=>p?.counters?.[k]||0;
 const sources=(g,p,k)=>g.bf().filter(c=>(!p||c.ctrl===p)&&C.live(c)&&c.def[k]);
 const energy=(ctx,n,p=ctx.you)=>M.OracleV8Energy.gain(ctx.g,p,n,ctx.src);
 const payEnergy=async(ctx,n)=>M.OracleV8Energy.count(ctx.you)>=n&&await C.yes(ctx,'Pay '+n+' energy?')&&M.OracleV8Energy.spend(ctx.g,ctx.you,n,ctx.src);
 const energyX=async(ctx,min=0)=>{const max=count(ctx.you,'energy');if(max<min)return 0;const n=await ctx.you.controller.decide(ctx.g,{type:'chooseX',min:0,max,card:ctx.src,prompt:'Choose energy to pay',aiHint:{kind:'chooseX'}});if(!Number.isSafeInteger(n)||n<0||n>max||n&&n<min)throw Error('Invalid energy payment');if(n&&!M.OracleV8Energy.spend(ctx.g,ctx.you,n,ctx.src))throw Error('Energy payment failed');return n;};
 const rad=async(ctx,p,n)=>{if(!n||p.lost)return;const add=n+sources(ctx.g,p,'pomConstrictor').length;p.counters.rad=count(p,'rad')+add;ctx.g.lg(p.name+' gets '+add+' rad counters.');ctx.g.note('counter',{p,kind:'rad',n:add});await ctx.g.emit('radGained',{player:p,n:add,src:ctx.src});};
 const allRad=async(ctx,n)=>{for(const p of ctx.g.alivePlayers())await rad(ctx,p,n);};
 const mill=async(ctx,n,p=ctx.you)=>ctx.g.mill(p,Math.max(0,n));
 const both=(desc,run,extra={})=>[C.enterTrigger(desc,run,extra),C.attack(desc,run,extra)];
 const landfall=(desc,run,extra={})=>C.enterTrigger(desc,run,{filter:(g,c,d)=>d.card.ctrl===c.ctrl&&d.card.is('Land'),...extra});
 const attacks=(desc,run,extra={})=>C.trigger('attackersDeclared',desc,run,{filter:(g,c,d)=>d.player===c.ctrl&&d.attackers.length>0,...extra});
 const hitGroup=(desc,run,extra={})=>C.hit(desc,run,{filter:(g,c,d)=>d.combat&&d.src?.ctrl===c.ctrl&&d.src.is('Creature')&&C.firstDamage(g,c,d),...extra});
 const milled=(desc,run,extra={})=>C.trigger(extra.perCard?'pomMilledCard':'pomMilled',desc,run,{filter:(g,c,d)=>d.nonlands.length>0,...extra});
 const attachments=(g,c)=>c.attachments.map(id=>g.byIid(id)).filter(a=>a?.zone==='battlefield'&&(a.hasSub('Aura')||a.hasSub('Equipment')));
 const auraEquipment=c=>c.hasSub('Aura')||c.hasSub('Equipment');
 const recover=async(ctx,pool,to='hand',max=1)=>{const cs=await C.choose(ctx.g,ctx.you,pool,0,max,'Choose cards to return','recur');for(const c of cs)if(to==='battlefield')await ctx.g.putPermanentOntoBattlefield(c,ctx.you);else await ctx.g.move(c,to);return cs;};
 const landHand=async(ctx,tapped=false)=>{const[c]=await C.choose(ctx.g,ctx.you,ctx.you.hand.filter(c=>c.is('Land')),0,1,'Put a land onto the battlefield');if(c)await ctx.g.putPermanentOntoBattlefield(c,ctx.you,{tapped});};
 const stealTop=async(ctx,p,opts={})=>{const c=p.library.at(-1);if(!c)return;await ctx.g.move(c,'exile',{exileFaceDown:true,exileLookers:[ctx.you.idx]});if(c.zone==='exile')C.playGrant(ctx,c,{anyColor:true,...opts});return c;};
 const graveTypes=g=>new Set(g.players.flatMap(p=>p.graveyard.flatMap(c=>c.cur?.types||c.def.types))).size;
 const goyf={oracleCharacteristicPT:true,cdaPower:(g)=>graveTypes(g),cdaToughness:(g)=>graveTypes(g)+1};
 const tarmogoyf=C.registerToken('pomTarmogoyf',{...C.token('Tarmogoyf',['Lhurgoyf'],'*','1+*',['G']),cost:'{1}{G}',...goyf});
 const junk=C.registerToken('pomJunk',{name:'Junk',cost:null,types:['Artifact'],subtypes:['Junk'],super:[],colorsOverride:[],oracle:'{T}, Sacrifice this artifact: Exile the top card of your library. You may play that card this turn. Activate only as a sorcery.',abilities:[{label:'Exile the top card; you may play it this turn',sorcery:true,cost:{tap:true,sacSelf:true},run:async ctx=>{for(const c of await C.exileTop(ctx,1))C.playGrant(ctx,c,{turn:ctx.g.turnNo});}}]});
 const soldier=C.registerToken('pomSoldier',C.token('Human Soldier',['Human','Soldier'],1,1,['W']));
 const mutant=C.registerToken('pomMutant',C.token('Zombie Mutant',['Zombie','Mutant'],2,2,['B']));
 const sand=C.registerToken('pomSandWarrior',C.token('Sand Warrior',['Sand','Warrior'],1,1,['R','G','W']));
 const scion=C.registerToken('pomScion',C.token('Eldrazi Scion',['Eldrazi','Scion'],1,1,[],[],{mana:{cost:{sacSelf:true},produce:[{C:1}]}}));
 const junkMake=(ctx,n=1)=>ctx.g.makeTokens(junk,ctx.you,{n});
 const make=(ctx,def,n=1,opts={})=>ctx.g.makeTokens(def,ctx.you,{n,...opts});
 const targeting=(ctx,spec,run,name)=>ctx.g.queueTrigger({src:ctx.src,ctrl:ctx.you,name:name||ctx.src.name,targets:spec,run});
 const originalMill=G.mill;G.mill=async function(p,n){const cs=await originalMill.call(this,p,n);for(const c of cs)if(c.zone==='graveyard')c.meta.pomMilledTurn=this.turnNo;const nonlands=cs.filter(c=>!c.is('Land'));if(cs.length)await this.emit('pomMilled',{player:p,cards:cs,nonlands});for(const c of nonlands)await this.emit('pomMilledCard',{player:p,cards:[c],nonlands:[c]});return cs;};
 const move=G.move;G.move=async function(c,to,o={}){const from=c.zone,version=c.zoneVersion,desert=c.hasSub('Desert');const r=await move.call(this,c,to,o);if(c.zone==='graveyard'&&c.zoneVersion!==version){c.owner.turnState.pomGraveEntries=(c.owner.turnState.pomGraveEntries||0)+1;await this.emit('pomGraveEntry',{card:c,player:c.owner,from,version:c.zoneVersion,desert});}return r;};
 const emit=G.emit;G.emit=function(name,d){
  if(name==='precombatMain'&&count(d.player,'rad')>0){const p=d.player;this.queueTrigger({ctrl:p,name:'Radiation',run:async ctx=>{const cs=await this.mill(p,count(p,'rad')),n=cs.filter(c=>!c.is('Land')).length;if(sources(this,p,'pomStrong').length)await this.gainLife(p,n);else await this.loseLife(p,n);p.counters.rad=Math.max(0,count(p,'rad')-n);this.note('counter',{p,kind:'rad'});}});}
  if(name==='attacks')d.card.meta.pomAttackedTurn=this.turnNo;
  if(name==='etb'&&d.card.is('Creature'))d.card.ctrl.turnState.pomCreatureEntries=(d.card.ctrl.turnState.pomCreatureEntries||0)+1;
  if(name==='dies'&&d.snap?.ctrl){const st=d.snap.ctrl.turnState;st.pomCreatureDeaths=(st.pomCreatureDeaths||0)+1;if(!(d.card?.isToken??d.snap.isToken??d.snap.token))st.pomNontokenDeaths=(st.pomNontokenDeaths||0)+1;if(d.snap.subtypes?.includes('Human'))st.pomHumanDied=true;}
  return emit.call(this,name,d);
 };
 M.POM={...C,count,sources,energy,payEnergy,energyX,rad,allRad,mill,both,landfall,attacks,hitGroup,milled,attachments,auraEquipment,recover,landHand,stealTop,graveTypes,goyf,tarmogoyf,junk,soldier,mutant,sand,scion,junkMake,make,targeting};
})();
