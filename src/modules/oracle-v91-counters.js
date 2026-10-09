'use strict';
((M)=>{
 const G=M.Game.prototype,active=c=>c?.zone==='battlefield'&&!c.phasedOut&&!c.cur?.abilitiesDisabled;
 const team=(a,b)=>a===b||a?.team!==undefined&&a.team===b?.team;
 function candidates(g,recipient,kind,by,options={}){
  const player=recipient instanceof M.Player,ctrl=player?recipient:recipient.ctrl,permanent=!player&&(recipient.zone==='battlefield'||options.entry===true),rows=[];
  const add=(s,key,label,run)=>rows.push({key:s.iid+':'+s.zoneVersion+':'+key,src:s,label:s.name+' — '+label,run});
  const bf=[...new Set([...g.bf(),...(options.entry&&recipient instanceof M.CardInst?[recipient]:[])])];
  for(const s of bf){if(!active(s)||options.entry&&s===recipient&&M.OracleV8AbilityLoss.entryCharacteristics(g,s).abilityLossTimestamp!==-Infinity)continue;
   const d=s.def;
   if(d.v90Vorinclex&&(player||permanent))add(s,'vorinclex',by===s.ctrl?'double counters':'halve counters',n=>by===s.ctrl?n*2:Math.floor(n/2));
   if(d.v86Innkeeper&&(player||permanent)&&M.OracleV20.classLevel(s)>=3&&by===s.ctrl)add(s,'innkeeper','double counters',n=>n*2);
   if(d.v91Pir&&permanent&&team(s.ctrl,ctrl))add(s,'pir','add one of each counter',n=>n+1);
   if(d.v91Laezel&&by===s.ctrl&&(player&&recipient===s.ctrl||permanent&&ctrl===s.ctrl&&(recipient.is('Creature')||recipient.is('Planeswalker'))))add(s,'laezel','add one of each counter',n=>n+1);
   if(d.v91Doc&&by===s.ctrl&&permanent&&ctrl===s.ctrl)add(s,'doc','add one of each counter',n=>n+1);
   if(d.oracleCounterDoublerV87==='all'&&options.effect!==false&&permanent&&ctrl===s.ctrl)add(s,'doubling-season','double counters from an effect',n=>n*2);
   if(d.oracleCounterDoublerV87==='typed'&&permanent&&ctrl===s.ctrl&&(recipient.is('Creature')||recipient.hasSub('Spacecraft')||recipient.hasSub('Planet')))add(s,'loading-zone','double counters',n=>n*2);
   if(d.oracleCounterAdderV87&&kind==='+1/+1'&&permanent&&ctrl===s.ctrl)add(s,'solid-ground','add a +1/+1 counter',n=>n+d.oracleCounterAdderV87);
   if(d.oracleVizierV88&&kind==='-1/-1'&&permanent&&recipient.is('Creature')&&ctrl===s.ctrl)add(s,'vizier','reduce -1/-1 counters by one',n=>Math.max(0,n-1));
   if(d.v91Melira&&player&&recipient===s.ctrl&&kind==='poison')add(s,'melira','receive one poison counter',n=>{recipient.turnState.v91PoisonBlocked=g.turnNo;return 1;});
   if(d.pomConstrictor&&ctrl===s.ctrl&&(player||permanent&&(recipient.is('Creature')||recipient.is('Artifact'))))add(s,'constrictor','add one of each counter',n=>n+1);
   if(kind==='+1/+1'&&permanent&&ctrl===s.ctrl&&d.plusCountersAdjust&&!(s.name==='Corpsejack Menace'&&!recipient.is('Creature')))add(s,'plus-adjust','adjust +1/+1 counters',n=>d.plusCountersAdjust(n,g,recipient,s));
   if(options.modular&&d.v90Zabaz&&permanent&&recipient.is('Creature')&&ctrl===s.ctrl)add(s,'zabaz','add a modular counter',n=>n+1);
  }
  if(kind==='+1/+1'&&permanent&&recipient.is('Creature'))for(const e of g.untilEffects.filter(e=>e.kind==='prairieV89'&&e.player===ctrl))rows.push({key:e,src:e.source,label:'Prairie Dog — add a +1/+1 counter',run:n=>n+1});
  return rows;
 }
 function ordered(g,recipient,rows){const p=recipient instanceof M.Player?recipient:recipient.ctrl,pref=p?.v91CounterOrder||[];return rows.slice().sort((a,b)=>{const ai=pref.indexOf(a.src.iid),bi=pref.indexOf(b.src.iid);return(ai<0?Infinity:ai)-(bi<0?Infinity:bi)||(a.src?.timestamp||0)-(b.src?.timestamp||0);});}
 function syncAmount(g,recipient,kind,n,by,options={}){if(!(n>0))return n;for(const row of ordered(g,recipient,candidates(g,recipient,kind,by,options))){if(n<=0)break;n=row.run(n);}return n;}
 async function amount(g,recipient,kind,n,by,options={}){
  if(!(n>0))return n;const actor=by||g.turnPlayer,affected=recipient instanceof M.Player?recipient:recipient.ctrl||recipient.owner,rows=candidates(g,recipient,kind,actor,options),used=new Set();
  while(n>0){const choices=rows.filter(r=>!used.has(r.key));if(!choices.length)break;const row=choices.length===1?choices[0]:await g.chooseReplacement(affected,choices,'counters',n);used.add(row.key);n=row.run(n);if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid counter replacement result');}
  return n;
 }
 const nativeAdd=G.addCounters,nativeAdjust=G.adjustPlusCounters,oldBonus=M.POM.counterBonus,oldPlayerBonus=M.POM.playerCounterBonus;
 G.adjustPlusCounters=function(c,n){return this.v91CountersApplied?n:nativeAdjust.call(this,c,n);};
 G.addCounters=function(c,kind,n,silent,by){if(this.v91CountersApplied)return nativeAdd.call(this,c,kind,n,silent,by);const actual=syncAmount(this,c,kind,n,by||this.turnPlayer,{effect:!this.v91CounterCost});const prior=this.v91CountersApplied;this.v91CountersApplied=true;try{return nativeAdd.call(this,c,kind,actual,silent,by);}finally{this.v91CountersApplied=prior;}};
 G.putCountersV91=async function(c,kind,n,{by=this.turnPlayer,effect=true,silent=false,modular=false}={}){if(!this.canPutCountersV18(c,kind)||c.zone==='battlefield'&&c.phasedOut)return 0;const zone=c.zone,version=c.zoneVersion,actual=await amount(this,c,kind,n,by,{effect,modular});if(c.zone!==zone||c.zoneVersion!==version)return 0;const prior=this.v91CountersApplied;this.v91CountersApplied=true;try{nativeAdd.call(this,c,kind,actual,silent,by);}finally{this.v91CountersApplied=prior;}return actual;};
 M.POM.counterBonus=(g,c,n)=>g.v91CountersApplied?n:syncAmount(g,c,undefined,n,c.ctrl,{effect:true,entry:!!g._entryReplacementPhase});
 M.POM.playerCounterBonus=(g,p,n,kind,by=p,opts={})=>g.v91CountersApplied?n:syncAmount(g,p,kind,n,by,opts);
 async function choosePreferences(g){for(const p of g.alivePlayers()){const rows=g.bf().filter(active).filter(s=>s.def.v90Vorinclex||s.def.v86Innkeeper||s.def.v91Pir||s.def.v91Laezel||s.def.v91Doc||s.def.oracleCounterDoublerV87||s.def.oracleCounterAdderV87||s.def.pomConstrictor||s.def.plusCountersAdjust||s.def.oracleVizierV88||s.def.v91Melira||s.def.v90Zabaz);if(rows.length<2)continue;const key=rows.map(c=>c.iid+':'+c.zoneVersion).join('|');if(p.v91CounterOrderKey===key)continue;const order=[];while(order.length<rows.length){const remaining=rows.filter(c=>!order.includes(c.iid));if(remaining.length===1){order.push(remaining[0].iid);break;}const options=remaining.map(c=>({key:String(c.iid),label:c.name,card:c})),chosen=await p.controller.decide(g,{type:'chooseOption',options,prompt:'Choose the preferred order for simultaneous counter replacements',aiHint:{kind:'replacementOrder',player:p}});if(!options.some(o=>o.key===chosen))throw Error('Invalid preferred counter replacement order');order.push(Number(chosen));}p.v91CounterOrder=order;p.v91CounterOrderKey=key;}}
 const priority=G.priorityRound;G.priorityRound=async function(...args){await choosePreferences(this);return priority.apply(this,args);};
 const resolve=G.resolveTop;G.resolveTop=async function(...args){await choosePreferences(this);return resolve.apply(this,args);};
 function modularCounters(script){for(const tr of script.triggers||[])if(tr.desc==='Modular'&&!tr.v91OrderedModular){tr.v91OrderedModular=true;tr.run=async ctx=>{const target=(ctx.targets||[]).flat(Infinity)[0],key=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Modular: put counters on the target?',options:[{key:'yes',label:'Yes'},{key:'no',label:'No'}],aiHint:{kind:'optTrigger',src:ctx.src}});if(!['yes','no'].includes(key))throw Error('Invalid modular choice');if(key==='yes'&&target)await ctx.g.putCountersV91(target,'+1/+1',ctx.data.snap.plus1||0,{by:ctx.you,effect:true,modular:true});};}return script;}
 const mechanic=M.applyOracleMechanic;M.applyOracleMechanic=function(script,operation,...args){const result=mechanic.call(this,script,operation,...args);if(result&&operation.kind==='mechanic-modular')modularCounters(script);return result;};for(const script of Object.values(M.SCRIPTS||{}))modularCounters(script);
 M.OracleV91Counters={amount,apply:async(g,recipient,kind,n,by,options)=>g.putCountersV91(recipient,kind,n,{...options,by}),syncAmount,candidates,choosePreferences};
})(globalThis.MTG||={});
