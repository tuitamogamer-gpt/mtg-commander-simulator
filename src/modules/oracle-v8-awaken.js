(function(){
 'use strict';
 const MTG=globalThis.MTG;
 const chosen=(script,options)=>options?.oracleAwaken===true&&options.oracleAlternativeCost===true&&
   script.altCosts?.some(alt=>alt.oracleAwaken&&alt.oracleAlternativeId===options.oracleAlternativeId&&alt.altCostStr===options.altCostStr);
 function install(script,operation){
  if(script.oracleAwaken||operation.contract!=='mechanic-awaken-v8'||
    Object.keys(operation).some(key=>!['kind','n','cost','contract'].includes(key))||
    !Number.isSafeInteger(operation.n)||operation.n<1||
    !/^(?:\{(?:0|[1-9][0-9]*|[WUBRGC])\})+$/.test(operation.cost))throw new Error('Invalid Awaken descriptor');
  script.oracleAwaken={n:operation.n,cost:operation.cost};
  const alternatives=script.altCosts||(script.altCosts=[]);
  alternatives.push({oracleAlternativeId:'oracle-alt-'+alternatives.length,oracleAlternativeCost:true,
    oracleAwaken:true,altCostStr:operation.cost,label:'Awaken '+operation.n+' — '+operation.cost,
    oraclePrepareCosts:async()=>true});
 }
 function finish(script){
  if(!script.oracleAwaken)return;
  if(script.modes||script.adventure||script.splitHalves||typeof script.resolve!=='function')throw new Error('Awaken requires a compiled nonmodal spell');
  const originalTargets=script.targets,resolve=script.resolve,{n}=script.oracleAwaken;
  script.targets=(game,card,options,caster)=>{
    const targets=typeof originalTargets==='function'?originalTargets(game,card,options,caster):originalTargets;
    if(!chosen(script,options))return targets||null;
    return [...(targets||[]),{what:'permanent',zone:'battlefield',count:1,min:1,
      prompt:'Awaken — choose a land you control',aiHint:{goal:'buff'},
      filter:(g,target,player)=>target.is('Land')&&target.ctrl===player}];
  };
  script.resolve=async ctx=>{
    if(!chosen(script,ctx.so?.castOpts))return resolve(ctx);
    const target=ctx.targets.at(-1),version=target?.zoneVersion;
    // Resolution legality is checked once by the Stack. A later instruction
    // may change the target's types/control, but cannot adopt a new object.
    await resolve({...ctx,targets:ctx.targets.slice(0,-1)});
    if(!target||target.zone!=='battlefield'||target.zoneVersion!==version)return;
    ctx.g.addCounters(target,'+1/+1',n,false,ctx.you);
    ctx.g.addOracleAnimation(target,{power:0,toughness:0,types:['Creature'],subtypes:['Elemental'],
      keywords:['haste'],colors:null,retainTypes:true,retainAllSubtypes:true,temporary:false});
  };
 }
 MTG.OracleV8Awaken={install,finish};
})();
