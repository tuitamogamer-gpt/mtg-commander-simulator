'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,G=M.Game.prototype,C=M.C1920,copy=G.copySpell;
 // One instruction can make several copies, with different forced targets.
 // Each Staff replaces that instruction once, increasing its count by one.
 G.copySpellBatch=async function(so,p,options){
  if(!Array.isArray(options))throw Error('Invalid spell-copy instruction');
  if(!options.length)return [];
  const sources=this.bf().filter(s=>s.ctrl===p&&C.live(s)&&s.def.c1920Twinning),result=[];
  for(const opts of options)result.push(await copy.call(this,so,p,opts));
  for(const source of sources){const extra={...options[0],mayNewTargets:true,copySource:source};delete extra.forceTarget;result.push(await copy.call(this,so,p,extra));}
  return result;
 };
 G.copySpells=function(so,p,n,options={}){if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid spell-copy count');return this.copySpellBatch(so,p,Array.from({length:n},()=>options));};
 G.copySpell=async function(so,p,options={}){return (await this.copySpellBatch(so,p,[options]))[0];};
 M.SCRIPTS['Twinning Staff']={c1920Twinning:true,abilities:[{label:'Copy your instant or sorcery spell',cost:{mana:'{7}',tap:true},targets:[M.T.spell((g,s,p)=>s.ctrl===p&&g.isInstantSorcerySpell(s))],run:ctx=>ctx.targets[0]&&ctx.g.copySpell(ctx.targets[0],ctx.you,{mayNewTargets:true}),aiScore:()=>6}]};
 const spellColors=(g,c,a)=>{const d=g.castDefinition(c,a);return d.devoid?[]:d.colorsOverride||M.colorsOfCost(a.adventure?d.adventure.cost:d.oracleSplit?g.oracleSplitPrintedCost(c,a):d.cost);};
 const sources=(g,p,c,a,key)=>g.isInstantSorceryCast(c,a)?g.bf().filter(s=>s.ctrl===p&&C.live(s)&&s.def[key]).map(s=>({iid:s.iid,version:s.zoneVersion,controller:p.idx})):[];
 C.copyGrantActive=(g,r)=>!r||g.bf().some(s=>s.iid===r.iid&&s.zoneVersion===r.version&&s.ctrl.idx===r.controller&&C.live(s));
 C.conspireSources=(g,p,c,a)=>spellColors(g,c,a).some(k=>k==='R'||k==='G')?sources(g,p,c,a,'c1920Wort'):[];
 C.castColors=spellColors;
 C.replicatePayments=async(g,p,c,a,cost,x)=>{
  const plans=[],d=g.castDefinition(c,a),str=a.adventure?d.adventure.cost:d.oracleSplit?g.oracleSplitPrintedCost(c,a):d.cost;
  for(const source of sources(g,p,c,a,'c1920Djinn')){
   if(str===undefined||str===null||str==='')continue;
   const r=M.parseCost(str);r.generic+=(r.x||0)*x;r.x=0;
   const zero=!r.generic&&!r.pips.length;
   let max=Number.MAX_SAFE_INTEGER;
   if(!zero){let low=0,high=g.maxAffordableX(p,{...cost,generic:cost.generic+(cost.x||0)*x,x:1},c,{castOpts:a})+1;while(low+1<high){const n=low+Math.floor((high-low)/2),combined={...cost,generic:cost.generic+r.generic*n,pips:cost.pips.concat(Array.from({length:n},()=>r.pips).flat())};if(g.canPayMana(p,combined,{card:c,castOpts:a},{xVal:x}))low=n;else high=n;}max=low;}
   if(!max)continue;
   const n=await p.controller.decide(g,{type:'chooseX',min:0,max,card:c,prompt:'Replicate '+str+' — how many times?',...(zero?{preferredXValues:[0,1,2,3,5,10]}:{}),aiHint:{kind:'replicate',card:c}});
   if(!Number.isSafeInteger(n)||n<0||n>max)return null;
   if(n){cost.generic+=r.generic*n;if(r.pips.length)for(let i=0;i<n;i++)cost.pips=cost.pips.concat(r.pips);plans.push({count:n,source});}
  }
  return plans;
 };
 M.SCRIPTS['Djinn Illuminatus']={c1920Djinn:true};
 M.SCRIPTS['Wort, the Raidmother']={c1920Wort:true,triggers:[C.enterTrigger('Create two red and green Goblin Warriors',ctx=>ctx.g.makeTokens(C.token('Goblin Warrior',[C.type(ctx,'Goblin'),C.type(ctx,'Warrior')],1,1,['R','G']),ctx.you,{n:2}))]};
})();
