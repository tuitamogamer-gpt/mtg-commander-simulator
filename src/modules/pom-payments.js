'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.POM,G=M.Game.prototype,S=M.SCRIPTS,T=M.T;
 C.clearPlayerCounters=(g,p)=>{const energy=C.count(p,'energy');p.turnState.energyLost=(p.turnState.energyLost||0)+energy;p.poison=0;p.counters={};g.note('counter',{p});};
 C.exileCards=async(ctx,cards)=>{const rows=[...new Set(cards)].map(C.row),bf=rows.filter(r=>r.card.zone==='battlefield');if(bf.length)await ctx.g.exileMany(bf.map(r=>r.card));await ctx.g.moveGraveyardBatch(rows.filter(r=>C.current(r)&&r.card.zone==='graveyard').map(r=>r.card),'exile');for(const r of rows)if(C.current(r)&&r.card.zone!=='exile')await ctx.g.move(r.card,'exile');};
 C.exileSpell=async(ctx,so)=>{if(so?.kind!=='spell'||!ctx.g.stack.includes(so))return false;ctx.g.stack.splice(ctx.g.stack.indexOf(so),1);if(!so.isCopy&&so.card?.zone==='stack')await ctx.g.move(so.card,'exile');ctx.g.lg(so.name+' is exiled.');ctx.g.note('stack',{});M.StateTriggers?.settle(ctx.g);return true;};
 C.flag=(ctx,c,key)=>{const iid=c.iid,v=c.zoneVersion;ctx.g.untilEffects.push({kind:'pomFlag',expires:'eot',apply:(g,bf)=>{const c=bf.find(c=>c.iid===iid&&c.zoneVersion===v);if(c)c.cur[key]=true;}});ctx.g.recalc();};
 C.counterBonus=(g,c,n)=>n>0&&(c.is('Creature')||c.is('Artifact'))?n+C.sources(g,c.ctrl,'pomConstrictor').filter(s=>s!==c).length:n;
 C.playerCounterBonus=(g,p,n)=>n>0?n+C.sources(g,p,'pomConstrictor').length:n;
 C.entryCounters=(g,c)=>{
  let n=c.meta.pomMimeoplasm||0;
  if(c.is('Creature')&&!c.colors.length&&c.ctrl.opponents(g).some(p=>p.turnState.damageTaken>0||p.turnState.damageReceived>0))n+=2*C.sources(g,c.ctrl,'pomBloodthirst').filter(s=>s!==c).length;
  return n;
 };
 C.plotCost=(g,p,c)=>{const cost=M.parseCost(c.def.plot);cost.generic=Math.max(0,cost.generic-C.sources(g,p,'pomPlotDiscount').reduce((n,c)=>n+c.def.pomPlotDiscount,0));return cost;};
 C.prepareCast=async(g,p,c,a,cost,x)=>{
  const d=g.castDefinition(c,a),plan={},ctx={g,src:c,you:p};
  if(a.pomEnergyCost!==undefined&&(!a.oracleImmediateCast||!M.OracleV8PlayPermissions.allowed(g,p,c,a)||!Number.isSafeInteger(a.pomEnergyCost)||a.pomEnergyCost<0||C.count(p,'energy')<a.pomEnergyCost))return null;
  if(d.pomSquad&&!a.adventure&&!a.faceDownCast){
   const zone=d.pomSquad==='grave'?'graveyard':'hand',each=d.pomSquad==='grave'?4:1,pool=p[zone].filter(x=>x!==c);
   let max=Math.floor(pool.length/each);
   if(zone==='hand')max=Math.min(max,g.maxAffordableX(p,{...cost,x:1},c,{castOpts:a}));
   const n=max?await p.controller.decide(g,{type:'chooseX',min:0,max,card:c,prompt:c.name+': pay squad how many times?',aiHint:{kind:'squad',card:c}}):0;
   if(!Number.isSafeInteger(n)||n<0||n>max)return null;
   plan.pomSquad=n;
   if(n){const rows=(await C.choose(g,p,pool,n*each,n*each,'Squad: '+(zone==='hand'?'discard':'exile')+' cards',zone==='hand'?'discard':'delve')).map(C.row);plan[zone==='hand'?'pomDiscard':'pomExile']=rows;if(zone==='hand')cost.generic+=n;}
  }
  if(d.pomTwoKickers&&!a.adventure&&!a.faceDownCast)for(const [field,raw]of [['pomKickerGreen','{G}'],['pomKickerBlue','{1}{U}']]){
   const add=M.parseCost(raw),total={...cost,generic:cost.generic+add.generic,pips:cost.pips.concat(add.pips)};
   if(g.canPayMana(p,total,{card:c,castOpts:a},{xVal:x})&&await C.yes(ctx,'Pay kicker '+raw+'?')){Object.assign(cost,total);plan[field]=true;}
  }
  return plan;
 };
 C.validateCast=(g,p,c,so)=>[...(so.pomDiscard||[]),...(so.pomExile||[])].every(r=>C.current(r)&&r.card.owner===p&&r.card!==c)&&(!so.castOpts.pomEnergyCost||C.count(p,'energy')>=so.castOpts.pomEnergyCost);
 C.prepareMana=async(g,p,s,prepared)=>{
  const n=s.extraCost?.pomExileGY;if(!n)return [];
  if(prepared?.pomExiles){const rows=prepared.pomExiles;return rows.length===n&&rows.every(r=>C.current(r)&&r.card.owner===p&&r.card.zone==='graveyard')?rows:null;}
  if(p.graveyard.length<n)return null;
  const rows=(await C.choose(g,p,p.graveyard,n,n,'Sunken Palace: exile seven cards','delve')).map(C.row);
  return rows.length===n&&rows.every(C.current)?rows:null;
 };
 C.spent=(g,p,action,unit)=>{if(!action)return;for(const k of ['pomDesertMana','pomTreasureMana','pomCopyMana'])if(unit[k])action[k]=(action[k]||0)+1;};
 const pay=G.payMana;G.payMana=function(p,cost,action,...args){if(action)action.player=p;return pay.call(this,p,cost,action,...args);};
 S['Thieving Varmint'].mana.restrict=(g,s,source)=>!!s?.card&&!s.isAbility&&s.card.owner!==source.ctrl;
 const abilityCost=G.abilityManaCost;G.abilityManaCost=function(p,s,raw,ctx={}){
  const cost=abilityCost.call(this,p,s,raw,ctx);
  if(ctx.kind==='equip'||ctx.ability?.oracleEquip){const hosts=new Map();for(const aura of C.sources(this,p,'pomStrongBack'))if(!ctx.targets?.length||ctx.targets.flat(Infinity).some(c=>c.iid===aura.attachedTo))hosts.set(aura.attachedTo,(hosts.get(aura.attachedTo)||0)+3);cost.generic=Math.max(0,cost.generic-Math.max(0,...hosts.values()));}
  return cost;
 };
 const spellCost=G.spellCost;G.spellCost=function(p,c,a={}){const cost=spellCost.call(this,p,c,a);if(this.castDefinition(c,a).subtypes?.includes('Aura')){const hosts=new Map(),specs=this.spellTargetSpecs(c,a,p);for(const aura of C.sources(this,p,'pomStrongBack')){const h=this.byIid(aura.attachedTo);if(h&&specs.some(s=>this.legalTargets(s,c,p).includes(h)))hosts.set(h,(hosts.get(h)||0)+3);}const n=Math.min(cost.generic,Math.max(0,...hosts.values()));if(n){cost.pomAuraReduced=n;cost.generic-=n;}}return cost;};
 C.auraDiscount=(g,p,c,so,cost)=>{cost.generic+=cost.pomAuraReduced||0;if(g.castDefinition(c,so.castOpts).subtypes?.includes('Aura'))for(const s of C.sources(g,p,'pomStrongBack'))if(so.targets?.flat(Infinity).some(c=>c.iid===s.attachedTo))cost.generic=Math.max(0,cost.generic-3);};
 // Use the standard graveyard ability path, including sorcery timing and exile replacement.
 M.TOKENS.pomTarmogoyf&&(M.TOKENS.pomTarmogoyf.tokenImageName='POM Tarmogoyf');
 M.TOKENS.pomJunk&&(M.TOKENS.pomJunk.tokenImageName='POM Junk');
 M.TOKENS.pomSoldier&&(M.TOKENS.pomSoldier.tokenImageName='POM Human Soldier');
 M.TOKENS.pomMutant&&(M.TOKENS.pomMutant.tokenImageName='POM Zombie Mutant');
 M.TOKENS.pomSandWarrior&&(M.TOKENS.pomSandWarrior.tokenImageName='POM Sand Warrior');
 M.TOKENS.pomScion&&(M.TOKENS.pomScion.tokenImageName='POM Eldrazi Scion');
 M.TOKENS.pomAttackSoldier&&(M.TOKENS.pomAttackSoldier.tokenImageName='POM Soldier RW');
 const unearth=C.unearth('{0}').gyAbility;
 S['Salvation Colossus'].gyAbility={...unearth,label:'Unearth — pay eight energy',extraCost:{energy:8}};
 S['Young Deathclaws'].grantsGraveyardAbility={filter:(g,s,c,p)=>c.owner===p&&c.is('Creature')&&!!c.def.cost,make:(g,s,c)=>({label:'Scavenge '+c.def.cost,cost:c.def.cost,sorcery:true,targets:[T.creature()],run:ctx=>C.add(ctx,ctx.targets[0],'+1/+1',Math.max(0,ctx.graveyardSourcePower))})};
 const oldPut=G.putPermanentOntoBattlefield;
 G.putPermanentOntoBattlefield=async function(c,p,opts={}){
  if(!opts.pomHarold)return oldPut.call(this,c,p,opts);
  const original=c.def,host=opts.attachTo;
  if(!host||host.zone!=='battlefield'||host.ctrl!==p||!host.hasSub('Forest'))return false;
  c.def={...original,types:['Enchantment'],subtypes:['Aura'],power:undefined,toughness:undefined,keywords:[],triggers:[],abilities:[],statics:[],replace:[],auraTarget:[T.permanent((g,x,who)=>x.ctrl===who&&x.hasSub('Forest'))],attachGrant:(g,a,h)=>h.cur.extraMana.push({cost:{tap:true},produce:['W','U','B','R','G'].map(k=>({[k]:3})),afterProduce:(g,s,who)=>C.rad({g,src:s,you:who},who,2)})};
  try{const result=await oldPut.call(this,c,p,opts);if(c.zone==='battlefield')c.meta.characteristicOriginalDef=original;else c.def=original;return result;}catch(e){c.def=original;throw e;}
 };
 const grist=S['Grist, the Hunger Tide'];Object.assign(grist,{power:'1',toughness:'1'});
 const hasSub=M.CardInst.prototype.hasSub;M.CardInst.prototype.hasSub=function(t){return t==='Insect'&&this.def.pomGrist&&this.zone!=='battlefield'||hasSub.call(this,t);};
 const castDefinition=G.castDefinition;G.castDefinition=function(c,a){const d=castDefinition.call(this,c,a);return d.pomGrist?{...d,types:[...new Set(d.types.concat('Creature'))],subtypes:[...new Set(d.subtypes.concat('Insect'))]}:d;};
 const emit=G.emit;G.emit=function(on,d){
  if(on==='cast'||on==='abilityActivated'&&!d.isMana){const so=on==='cast'?d.so:d.stackObject,n=on==='cast'?so?.pomCopyMana:so?.ctx?.pomCopyMana;if(n&&so)for(let i=0;i<n;i++)this.queueTrigger({src:d.card,ctrl:d.player,name:'Sunken Palace: copy',run:ctx=>so.kind==='spell'?ctx.g.copySpell(so,ctx.you,{mayNewTargets:true}):ctx.g.copyStackAbility(so,ctx.you,{mayNewTargets:true})});}
  return emit.call(this,on,d);
 };
 // Modes and opponent-selected targets are announced before the trigger is stacked.
 S['Brotherhood Outcast'].triggers=[C.enterTrigger('Choose an Aura or Equipment to return, or a creature for a shield counter',null,{modes:{list:[
  {label:'Return an Aura or Equipment',targets:[C.grave(c=>C.auraEquipment(c)&&c.mv<=3)],run:ctx=>ctx.g.putPermanentOntoBattlefield(ctx.targets[0],ctx.you)},
  {label:'Put a shield counter on a creature',targets:[T.creature()],run:ctx=>C.add(ctx,ctx.targets[0],'shield')}
 ]}})];
 const blade=S['Bladegriff Prototype'].triggers[0];blade.targets=[];
 blade.prepareTargets=async ctx=>{const spec=T.permanent((g,c)=>c.ctrl!==ctx.you&&!c.is('Land')),pool=ctx.g.legalTargets(spec,ctx.src,ctx.you);if(!pool.length)return false;const cs=await ctx.data.player.controller.decide(ctx.g,{type:'chooseTargets',player:ctx.data.player,candidates:pool,min:1,max:1,prompt:'Bladegriff Prototype: choose a permanent to destroy',aiHint:{goal:'destroy'}});if(!Array.isArray(cs)||cs.length!==1||!pool.includes(cs[0]))return false;ctx.targets=cs;ctx.boundTargetSpecs=[spec];return true;};
 S['Talon Gates of Madara'].handAbility.pomPutFromHand=true;
 S['Expert-Level Safe'].abilities[0].prepareTargets=ctx=>{ctx.sourceMeta=ctx.src.meta;};
 S['Talon Gates of Madara'].handAbility.run=ctx=>ctx.src.zone==='hand'&&ctx.src.zoneVersion===ctx.sourceZoneVersion&&ctx.g.putPermanentOntoBattlefield(ctx.src,ctx.you);
 S['Planar Nexus'].pomNexus=true;
 for(const script of Object.values(S))if(script.devoid&&!script.colorsOverride)script.colorsOverride=[];
 const subtype=M.CardInst.prototype.hasSub;M.CardInst.prototype.hasSub=function(t){return this.def.pomNexus&&C.nonbasicLandTypes.includes(t)||subtype.call(this,t);};
 C.snapshotBlockers=g=>[
  ...(g.pomNukeGrants||[]).some(r=>!g.players[r.player].lost&&g.players[r.player].turnsStarted<=r.throughTurn)?['Nuka-Nuke Launcher casting triggers']:[],
  ...(g.pomSingleCombat||[]).some(r=>g.players[r.player].turnsStarted<=r.throughTurn)?['Single Combat casting restriction']:[],
  ...(g.pomNoAttack||[]).some(r=>r.turn===g.turnNo&&r.combat===(g.cdkCombatSerial||0))?['Overencumbered combat restriction']:[]
 ];
})();
