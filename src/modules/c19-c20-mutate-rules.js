'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,G=M.Game.prototype,C=M.C1920;
 const characteristic=new Set(['name','cost','mv','colors','colorsOverride','colorIdentity','super','types','subtypes','power','toughness','oracle','oracleFaces','oracleFace','oracleCanonicalName','rulesNoName','image','imageKey','imageName','imageUrl','art','artUrl','imported','autoScripted','simplified','source','oracleImplementation','oracleId','scryfallId','_oracleId','_scryfallId','_layout','_commanderLegality']);
 const arrays=new Set(['abilities','triggers','statics','replace','mana','altCosts']);
 function aggregate(top,under){
  const def={...top};delete def.oracleFaces;delete def.oracleFace;delete def.oracleCanonicalName;
  for(const [key,value]of Object.entries(under)){
   if(characteristic.has(key)||key.startsWith('_'))continue;
   if(arrays.has(key))def[key]=[...([def[key]].flat().filter(Boolean)),...([value].flat().filter(Boolean)).map(v=>({...v}))];
   else if(key==='kws')def.kws=[...new Set([...(def.kws||[]),...value])];
   else if(def[key]===undefined)def[key]=value;
   else if(key==='costReduction'&&typeof value==='function'){const prior=def[key];def[key]=(...args)=>(prior(...args)||0)+(value(...args)||0);}
  }
  def.oracle=[top.oracle,under.oracle].filter(Boolean).join('\n');return def;
 }
 const physical=c=>({card:c,def:M.nativeGraveyardBaseDefinition(c.meta.characteristicOriginalDef||c.meta.faceDownDef||c.def),copiableDef:c.meta.faceDownDef||C.snapshotCopy(c),isToken:c.isToken,commander:c.commander,oracleFaces:c.oracleFaces,oracleFace:c.oracleFace,faceDown:!!c.faceDown});
 const components=c=>c.mutateState?.components||[physical(c)];
 const follow=c=>components(c).map(r=>({card:r.card,zoneVersion:r.card.zoneVersion+1}));
 const snapshot=G.snapshot;G.snapshot=function(c,attachments=true){const s=snapshot.call(this,c,attachments);if(c.mutateState)s.mutateComponents=follow(c);return s;};
 const deathObjects=data=>(data.snap?.mutateComponents||[{card:data.card,zoneVersion:data.graveyardZoneVersion}]).filter(r=>!r.card.isToken&&r.card.zone==='graveyard'&&r.card.zoneVersion===r.zoneVersion).map(r=>r.card);
 async function moveDeath(ctx,to='battlefield',opts={}){const cards=deathObjects(ctx.data);const run=async()=>{for(const card of cards)await ctx.g.move(card,to,{ctrl:card.owner,...opts});};if(to==='battlefield')await ctx.g.withBattlefieldEntryBatch(run);else await run();return cards.filter(c=>c.zone===to);}
 for(const helper of [M.C14,M.C1516,M.C1719,C]){helper.currentDeath=ctx=>deathObjects(ctx.data).length>0;helper.returnDeath=(ctx,p=ctx.you)=>moveDeath(ctx,'battlefield',{ctrl:p});}

 const targetSpec=owner=>{const ownerIndex=owner.idx;return M.T.creature({filter:(g,c)=>c.owner.idx===ownerIndex&&!c.hasSub('Human'),aiHint:{goal:'buff'}});};
 const targets=G.spellTargetSpecs;G.spellTargetSpecs=function(c,a,p){return a?.mutate?[targetSpec(c.owner)]:targets.call(this,c,a,p);};
 const cast=G.castSpell;G.castSpell=function(p,c,options={}){const a=options.alt||options;if(a.mutate&&(!c.def.mutate||a.altCostStr!==c.def.mutate||a.free||a.faceDownCast||a.bestow||a.adventure))return Promise.resolve(false);return cast.call(this,p,c,options);};
 const lookup=G.byIid;G.byIid=function(id){return lookup.call(this,id)||this.battlefield.flatMap(c=>c.mutateState?.components||[]).find(r=>r.card.iid===id)?.card||null;};
 async function resolve(g,so,host){
  if(!host||host.zone!=='battlefield'||!host.is('Creature')||host.hasSub('Human')||host.owner!==(so.isCopy?so.ctrl:so.card.owner))return false;
  const definition=so.oracleDefinition||so.card.def;
  const choice=await so.ctrl.controller.decide(g,{type:'chooseOption',player:so.ctrl,options:[{key:'over',label:'Put '+definition.name+' on top'},{key:'under',label:'Put '+definition.name+' underneath'}],prompt:'Choose the top card of the merged creature',aiHint:{kind:'mutateOrder',card:so.card,host,definition}});
  if(!['over','under'].includes(choice))throw Error('Invalid mutate order');
  const previous=C.snapshotCopy(host),faceDown=host.faceDown,previousFaceUp=host.mutateState?.faceUpDefinition||host.meta.faceDownDef||previous;
  let incoming=so.card;
  if(so.isCopy){incoming=new M.CardInst(definition,so.ctrl);incoming.isToken=true;incoming.zone='stack';}
  const state=host.mutateState||{components:[physical(host)]},record=physical(incoming);
  const def=choice==='over'?aggregate(definition,previous):aggregate(faceDown?previousFaceUp:previous,definition);
  state.faceUpDefinition=choice==='over'?aggregate(definition,previousFaceUp):aggregate(previousFaceUp,definition);
  if(choice==='over')state.components.unshift(record);else state.components.push(record);
  g.remove(incoming);incoming.zone='merged';incoming.zoneVersion++;incoming.cur=null;
  host.mutateState=state;host.meta.c1920Mutations=(host.meta.c1920Mutations||0)+1;
  host.isToken=state.components[0].isToken;host.commander=state.components.some(r=>r.commander);
  // A merged permanent is not a double-faced permanent. Its physical cards
  // retain their own faces for subsequent zone changes.
  host.oracleFaces=null;host.oracleFace=null;
  if(choice==='over'&&faceDown){host.faceDown=false;delete host.meta.faceDownDef;delete host.meta.faceDownKind;}
  const layer=M.OracleV8Copies.applyCopy(g,host,def);layer.c1920Merge=true;
  g.recalc();await g.emit('mutated',{card:host,component:incoming,player:so.ctrl,n:host.meta.c1920Mutations});g.note('mutated',{card:host});return true;
 }
 const move=G.move;
 G.move=async function(card,to,opts={}){
  if(!card.mutateState||card.zone!=='battlefield'||to==='battlefield'||card.phasedOut)return move.call(this,card,to,opts);
  const state=card.mutateState,snap=opts.battlefieldSnapshot||(this._simultaneousLeaveSources||[]).find(r=>r.card===card)?.snap||this.snapshot(card);
  const replacement=await M.OracleV8ZoneReplacements.apply(this,card,to,snap,opts),destination=replacement.toZone;
  const records=state.components.slice(),root=records.find(r=>r.card===card);
  // Every component receives the same replacement, while commander choices
  // still apply independently to the physical commander cards.
  delete card.mutateState;
  for(const r of records){const c=r.card;c.def=r.def;c.isToken=r.isToken;c.commander=r.commander;c.oracleFaces=r.oracleFaces;c.oracleFace=r.oracleFace;c.isCopyOf=null;delete c.meta.characteristicOriginalDef;delete c.meta.faceDownDef;delete c.meta.oracleCopyState;}
  const prior=this._simultaneousLeaveSources;
  this._simultaneousLeaveSources=[...(prior||[]),{card,ctrl:snap.ctrl,snap}];
  try{
   await this.withGraveyardEntryBatch(async()=>{
    // Other components structurally arrive before the single LTB/dies event.
    for(const r of records.filter(r=>r!==root))await move.call(this,r.card,destination,{...replacement.opts,c1920MergedOrigin:true,c1920ZoneReplacement:{...replacement,c1719Slimes:[],shuffleOwners:[]}});
    await move.call(this,card,destination,{...replacement.opts,battlefieldSnapshot:snap,c1920ZoneReplacement:replacement});
   });
  }finally{this._simultaneousLeaveSources=prior;await this.returnOracleExiles();}
  for(const owner of new Set(records.map(r=>r.card.owner)))if(['library','graveyard'].includes(destination)&&!replacement.shuffleOwners.length){
   const cards=records.map(r=>r.card).filter(c=>c.owner===owner&&c.zone===destination);if(cards.length<2)continue;
   const order=await owner.controller.decide(this,{type:'scry',cards,player:owner,prompt:'Order the cards from the merged permanent'}),ordered=[...(order?.top||[]),...(order?.bottom||[])];
   if(ordered.length!==cards.length||new Set(ordered).size!==cards.length||ordered.some(c=>!cards.includes(c)))throw Error('Invalid merged card order');
   const arr=owner[destination],positions=cards.map(c=>arr.indexOf(c)).sort((a,b)=>a-b);positions.forEach((index,i)=>{arr[index]=ordered[i];});
  }
  this.recalc();return card;
 };
 // Save files do not yet encode component identity graphs or these lasting
 // cast permissions; reject such snapshots instead of silently losing cards.
 const blockers=C.snapshotBlockers;
 C.snapshotBlockers=g=>[...(blockers?.(g)||[]),...(g.battlefield.some(c=>c.mutateState)?['Merged permanent components']:[]),...((g.c1920CastGrants||[]).some(r=>!r.used&&g.byIid(r.card)?.zoneVersion===r.version&&g.byIid(r.card)?.zone===r.zone)?['C19-C20 cast permissions']:[])];
 const present=(c,viewer)=>c.mutateState?.components.map(r=>({iid:r.card.iid,name:r.faceDown&&c.ctrl!==viewer?'Hidden card':r.def.name,hidden:r.faceDown&&c.ctrl!==viewer,commander:r.commander,token:r.isToken}))||[];
 async function transform(g,c){
  const state=c.mutateState;if(!state||c.faceDown)return false;let changed=false;
  for(const r of state.components)if(r.oracleFaces?.layout==='transform'&&!r.faceDown){r.oracleFace=r.oracleFace==='back'?'front':'back';r.copiableDef=M.OracleV8Faces.faceDefinition(r.oracleFaces,r.oracleFace);changed=true;}
  if(!changed)return false;
  const defs=state.components.map(r=>r.faceDown?g.faceDownCreatureDef('morph'):r.copiableDef),definition=defs.slice(1).reduce(aggregate,defs[0]);state.faceUpDefinition=definition;
  const layer=g.untilEffects.filter(e=>e.c1920Merge&&e.iid===c.iid&&e.zoneVersion===c.zoneVersion).at(-1);if(layer)layer.definition=definition;
  c.oracleTransformCount=(c.oracleTransformCount||0)+1;g.recalc();await g.emit('transformed',{card:c});return true;
 }
 function departed(g,c){
  const records=c.mutateState?.components;if(!records)return;delete c.mutateState;
  for(const r of records){const part=r.card;part.def=r.def;part.isToken=r.isToken;part.commander=r.commander;part.oracleFaces=r.oracleFaces;part.oracleFace=r.oracleFace;part.isCopyOf=null;delete part.meta.characteristicOriginalDef;delete part.meta.faceDownDef;delete part.meta.oracleCopyState;
   if(part!==c){part.zoneVersion++;part.faceDown=false;part.counters={};part.cur=null;part.ctrl=part.owner;if(part.oracleFaces)M.OracleV8Faces.setFace(part,'front');part.zone=part.isToken?'ceased':'exile';if(!part.isToken)part.owner.exile.push(part);}
  }
 }
 M.Mutate={aggregate,components,follow,deathObjects,moveDeath,targetSpec,resolve,present,transform,departed};
 const down=C.faceDown;
 C.faceDown=(g,c)=>{if(c.oracleFaces||c.mutateState?.components.some(r=>r.oracleFaces))return;if(c.mutateState)for(const r of c.mutateState.components)r.faceDown=true;return down(g,c);};
 M.C14.faceDown=M.C1516.faceDown=M.C1719.faceDown=C.faceDown;
 const upCosts=G.faceUpCosts;G.faceUpCosts=function(c){if(c.mutateState?.components.some(r=>r.def.types.some(t=>t==='Instant'||t==='Sorcery')))return [];return upCosts.call(this,c);};
 const up=G.turnFaceUp;G.turnFaceUp=async function(p,c,cost,kind){
  if(c.mutateState&&c.faceDown){if(!this.faceUpCosts(c).length)return false;const layer=this.untilEffects.filter(e=>e.c1920Merge&&e.iid===c.iid&&e.zoneVersion===c.zoneVersion).at(-1);if(layer){layer.definition=c.mutateState.faceUpDefinition;c.meta.faceDownDef=layer.definition;}}
  const result=await up.call(this,p,c,cost,kind);if(result&&!c.faceDown&&c.mutateState)for(const r of c.mutateState.components)r.faceDown=false;return result;
 };
})();
