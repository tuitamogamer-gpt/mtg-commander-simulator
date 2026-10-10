'use strict';
((M)=>{
 const G=M.Game.prototype,H=M.OracleV20.helpers,COLORS=['W','U','B','R','G'];
 const sheets=new Map(),programs=new Map();
 const live=c=>c?.zone==='battlefield'&&!c.phasedOut,active=c=>live(c)&&!c.cur?.abilitiesDisabled;
 const lock=c=>({card:c,version:c.zoneVersion,zone:c.zone}),current=r=>r.card.zone===r.zone&&r.card.zoneVersion===r.version;
 const fx=(mode,extra={})=>({action:'permanent-effects-v87',mode,...extra});
 const spec=(what='creature',zone='battlefield',controller='any',extra={})=>{const {filter,...rules}=extra,out=H.genericTargetSpec({what,zone,controller,min:1,max:1,...rules},[],0);if(filter){const prior=out.filter;out.filter=(...args)=>prior(...args)&&filter(...args);}return out;};
 const flat=ctx=>(ctx.targets||[]).flat(Infinity).filter(Boolean);
 async function option(ctx,prompt,options=[{key:'yes',label:'Yes'},{key:'no',label:'No'}],p=ctx.you){const key=await p.controller.decide(ctx.g,{type:'chooseOption',prompt,options,aiHint:{kind:'optTrigger',card:ctx.src}});if(!options.some(o=>o.key===key))throw Error('Invalid v87 choice');return key;}
 async function pick(ctx,from,min=0,max=1,p=ctx.you,prompt='Choose a card'){max=Math.min(max,from.length);min=Math.min(min,max);if(!max)return [];const versions=new Map(from.map(c=>[c,c.zoneVersion]));const rows=await p.controller.decide(ctx.g,{type:'chooseCards',from,min,max,prompt,aiHint:{kind:'bestCard',card:ctx.src}});if(!Array.isArray(rows)||rows.length<min||rows.length>max||new Set(rows).size!==rows.length||rows.some(c=>!from.includes(c)||c.zoneVersion!==versions.get(c)))throw Error('Invalid v87 card choice');return rows;}
 const token=(name,types,subtypes,power,toughness,colors,kws=[])=>({name,cost:'',super:[],types,subtypes,power:String(power),toughness:String(toughness),colorsOverride:colors,kws});
 const clown=()=>token('Clown Robot',['Artifact','Creature'],['Clown','Robot'],1,1,['W']);
 const nameStickers=c=>(c?.meta.stickersV87||[]).filter(r=>r.kind==='name');
 const nameLetters=(c,letter)=>nameStickers(c).reduce((n,r)=>n+(r.text.toLowerCase().match(new RegExp(letter,'g'))||[]).length,0);
 const countLetters=s=>(s.match(/[a-z]/gi)||[]).length;
 const put=async(g,c,k,n,p)=>g.putCountersV91?g.putCountersV91(c,k,n,{by:p,effect:true}):g.addCounters(c,k,n,false,p);
 const trigger=(event,filter,mode,targets=[],extra={})=>{const t=H.compileGenericTrigger({kind:'generic-trigger',event,eventFilter:null,effects:[fx(mode)],targets:targets.map(r=>({what:'card',zone:r.zone||'battlefield',min:1,max:1})),optional:false,...extra}),prior=t.filter;if(targets.length)t.targets=targets;t.filter=(g,s,d)=>prior(g,s,d)&&(!filter||filter(g,s,d));return t;};
 const ability=(cost,mode,targets=[],extra={})=>{const a=H.compileGenericAbility({kind:'generic-ability',cost,effects:[fx(mode)],targets:[],optional:false,...extra});a.targets=targets;return a;};
 const self=(g,s,d)=>d.card===s,own=(g,s,d)=>d.player===s.ctrl;
 const delayed=(ctx,on,rows,run,extra={})=>ctx.g.delayed.push({on,once:true,src:ctx.src,ctrl:ctx.you,name:ctx.src.name+' delayed effect',...extra,run:next=>run(next,rows.filter(current))});
 const grant=(ctx,cards,extra={})=>M.OracleV22Layouts.grant(ctx,cards,{duration:'eot',...extra});
 function sheetDefinition(name){const s=sheets.get(name);if(!s)throw Error('Unknown sticker sheet '+name);return s;}
 function available(g,p){const used=new Set(g.players.flatMap(q=>[...q.library,...q.hand,...q.graveyard,...q.exile,...q.command,...(q.junkyardV87||[])]).concat(g.battlefield,g.stack.map(x=>x.card).filter(Boolean)).flatMap(c=>(c.meta.stickersV87||[]).filter(r=>c.owner===p).map(r=>r.sheet+':'+r.index)));return (p.availableStickerSheetsV87||[]).flatMap(name=>sheetDefinition(name).stickers).filter(s=>!used.has(s.sheet+':'+s.index));}
 M.OracleV87={sheets,programs,nameStickers,nameLetters,countLetters,companionValidators:new Map(),diceReplacements:[],
  additionalCosts(g,p,c,opts={},info={}){const out=[],rows=g.bf().filter(s=>active(s)&&s.def.oracleDroughtV87),printed=info.ability?.oraclePrintedManaV87??info.cost?.mana,mana=info.isAbility?(typeof printed==='function'?printed(g,c):printed||''):((opts.adventure?g.castDefinition(c,opts).adventure:g.castDefinition(c,opts))?.cost||'');const black=typeof mana==='string'?(mana.match(/\{[^}]*B[^}]*\}/g)||[]).length:(mana?.pips||[]).filter(pip=>pip.includes('B')).length,n=rows.length*black;if(n)out.push({id:'drought-swamps-v87',kind:'sacrifice',quantity:{min:n,max:n},object:{kind:'permanent',types:['Land'],qualifier:{subtypes:['Swamp']}}});const rebels=info.isAbility&&!c.isToken&&c.hasSub('Rebel')?g.bf().filter(s=>active(s)&&s.def.oracleBrutalSuppressionV87).length:0;if(rebels)out.push({id:'brutal-lands-v87',kind:'sacrifice',quantity:{min:rebels,max:rebels},object:{kind:'permanent',types:['Land']}});return out;},
  stickerRows:c=>(c.meta.stickersV87||[]).slice(),
 };
 G.stickersV87=function(p){return available(this,p);};
 G.getTicketsV87=async function(p,n,{source=null}={}){if(!Number.isInteger(n)||n<0)throw Error('Invalid ticket amount');if(!n||!this.canPutPlayerCountersV66(p,'ticket'))return 0;const before=p.counters.ticket||0,amount=M.OracleV91Counters?await M.OracleV91Counters.amount(this,p,'ticket',n,p,{effect:true}):(M.POM?.playerCounterBonus(this,p,n)??n);if(!amount)return 0;p.counters.ticket=before+amount;this.note('counter',{p,kind:'ticket'});await this.emit('playerCountersPlaced',{player:p,kind:'ticket',n:amount,before,after:p.counters.ticket,by:p,source});return amount;};
 G.placeStickerV87=async function(ctx,card,{kind='any',maxCost=Infinity,free=false,min=0,max=1}={}){
  if(!card||card.owner!==ctx.you||!['battlefield','graveyard','exile','stack','command'].includes(card.zone))return [];
  const rows=[];for(let i=0;i<max;i++){
   const from=this.stickersV87(ctx.you).filter(r=>(kind==='any'||r.kind===kind)&&r.cost<=maxCost&&(free||r.cost<=(ctx.you.counters.ticket||0)));
   if(!from.length)break;const options=from.map(r=>({key:r.sheet+':'+r.index,label:r.text+' — '+r.cost+' tickets',sticker:r}));if(i>=min)options.unshift({key:'none',label:'No sticker'});
   const key=await option(ctx,'Put a sticker on '+card.name,options);if(key==='none')break;const r=from.find(r=>r.sheet+':'+r.index===key);if(!r||!this.stickersV87(ctx.you).includes(r)||card.owner!==ctx.you||!['battlefield','graveyard','exile','stack','command'].includes(card.zone))break;
   if(!free){if((ctx.you.counters.ticket||0)<r.cost)break;ctx.you.counters.ticket-=r.cost;}
   const row={...r,timestamp:this.nextOracleTimestamp()};if(r.kind==='name'){const words=card.def.rulesNoName?[]:card.name.replace(/_+/g,'').trim().split(/\s+/).filter(Boolean),positions=Array.from({length:words.length+1},(_,position)=>({key:String(position),label:[...words.slice(0,position),r.text,...words.slice(position)].join(' ')}));row.position=Number(await option(ctx,'Choose the new name',positions,['battlefield','stack'].includes(card.zone)?card.ctrl:card.owner));}
   (card.meta.stickersV87||=[]).push(row);rows.push(row);this.recalc();this.note('sticker',{card,sticker:row,player:ctx.you});await this.emit('stickerPlacedV87',{card,sticker:row,player:ctx.you,source:ctx.src});
  }return rows;
 };
 G.openAttractionV87=async function(p,n=1,{source=null}={}){const made=[];for(let i=0;i<n;i++){const c=p.attractionDeckV87?.at(-1);if(!c)break;await this.putPermanentOntoBattlefield(c,p);if(c.zone==='battlefield'){made.push(c);await this.emit('attractionOpenedV87',{card:c,player:p,source});}}return made;};
 G.visitAttractionV87=async function(c,{source=null}={}){if(!live(c)||!c.hasSub('Attraction'))return false;const p=c.ctrl;p.turnState.attractionsVisitedV87=(p.turnState.attractionsVisitedV87||0)+1;c.meta.visitedV87={turn:this.turnNo,version:c.zoneVersion};await this.emit('attractionVisitedV87',{card:c,player:p,source,visits:p.turnState.attractionsVisitedV87});return true;};
 G.rollAttractionsV87=async function(p,{source=null}={}){if(!this.bf().some(c=>c.ctrl===p&&c.hasSub('Attraction')))return null;const [n]=await this.rollDice(p,6,1,{source});await this.emit('attractionsRolledV87',{player:p,value:n,source});for(const c of this.bf().filter(c=>c.ctrl===p&&c.hasSub('Attraction')&&(c.def.attractionLightsV87||[]).includes(n)))await this.visitAttractionV87(c,{source});return n;};
 G.initializeAuxiliaryV87=function(p,config={},defs=M.DEFS){
  p.auxiliaryV87=config;p.oracleDraftV87=config.draft||{};p.stickerSheetsV87=(config.stickers||[]).slice();p.availableStickerSheetsV87=M.shuffle(p.stickerSheetsV87.slice(),this.rnd).slice(0,3);
  p.attractionDeckV87=(config.attractions||[]).map(name=>{const c=new M.CardInst(defs[name],p);c.zone='command';c.meta.attractionDeckV87=true;c.attractionBackV87=true;return c;});M.shuffle(p.attractionDeckV87,this.rnd);p.junkyardV87=[];
  p.outsideGameV87=(config.outsideGame||[]).map(name=>{const c=new M.CardInst(defs[name],p);c.zone='outside-game';return c;});
  p['outside-game']=p.outsideGameV87;p.companionV87=config.companion?new M.CardInst(defs[config.companion],p):null;if(p.companionV87){p.companionV87.zone='outside-game';p.outsideGameV87.push(p.companionV87);}
  for(const c of [...p.library,...p.command,...p.attractionDeckV87,...p.outsideGameV87]){if(config.draft?.[c.def.name])c.meta.draftV87=structuredClone(config.draft[c.def.name]);if(config.colors?.[c.def.name])c.meta.colorsV87=config.colors[c.def.name].slice();}
 };
 const buildDeck=G.buildDeck;G.buildDeck=function(p,deck,defs,...args){const out=buildDeck.call(this,p,deck,defs,...args);this.initializeAuxiliaryV87(p,deck.auxiliaryV87||{},defs);return out;};
 const remove=G.remove;G.remove=function(c,...args){for(const p of this.players)for(const key of ['attractionDeckV87','outsideGameV87','junkyardV87'])if(p[key]){const i=p[key].indexOf(c);if(i>=0)p[key].splice(i,1);}return remove.call(this,c,...args);};
 const move=G.move;G.move=async function(c,to,opts={}){const stickers=(c.meta.stickersV87||[]).map(r=>({...r})),components=stickers.length&&c.zone==='battlefield'&&to!=='battlefield'?(c.mutateState?.components||[]).map(r=>r.card):[],draft=c.meta.draftV87,colors=c.meta.colorsV87;if(to==='battlefield')opts={...opts,entryMeta:{...opts.entryMeta,...(stickers.length?{stickersV87:stickers}:{}),...(draft?{draftV87:draft}:{}),...(colors?{colorsV87:colors}:{})}};let stickerRecipient=c;if(components.length>1&&['graveyard','exile','command'].includes(to)){const from=components.filter(x=>!x.isToken);if(from.length){const key=await option({g:this,you:c.owner,src:c},'Choose which card retains the stickers',from.map(x=>({key:String(x.iid),label:(c.mutateState.components.find(r=>r.card===x)?.def.name)||x.name})),c.owner);stickerRecipient=from.find(x=>String(x.iid)===key);}}const out=await move.call(this,c,to,opts);if(c.zone!=='battlefield'){let d=c.def;while(d){if(d.lastVoyageBaseV87){c.def=d.lastVoyageBaseV87;break;}d=d.stickerBaseV87||d.c1719TextBase||d.exchangeBaseV87;}}if(components.length>1&&c.zone!=='battlefield'){for(const x of components){delete x.meta.stickersV87;if(x.def.stickerBaseV87)x.def=x.def.stickerBaseV87;}if(stickerRecipient&&!['hand','library','ceased'].includes(stickerRecipient.zone))stickerRecipient.meta.stickersV87=stickers;}if(draft)c.meta.draftV87=draft;if(colors)c.meta.colorsV87=colors;if(stickers.length){if(['hand','library'].includes(c.zone)){delete c.meta.stickersV87;if(c.def.stickerBaseV87)c.def=c.def.stickerBaseV87;}else if(components.length<2||c.zone==='battlefield')c.meta.stickersV87=stickers;}if(c.zone==='command'&&c.meta.attractionJunkyardV87){this.remove(c);c.zone='command';(c.owner.junkyardV87||=[]).push(c);}this.recalc();return out;};
 const zoneReplacements={zoneReplacements(g,c,to,snap){if(c.attractionBackV87&&!['battlefield','exile','command'].includes(to))return [{key:'attraction-junkyard-v87',label:'Put the Attraction in the junkyard',run:async()=>{c.meta.attractionJunkyardV87=true;return {toZone:'command'};}}];return [];}};
 // CR 717.6: the junkyard is a face-up command-zone pile, distinct from the
 // face-down Attraction deck. Exile remains exile and is never redirected.
 const byIid=G.byIid;G.byIid=function(id){return byIid.call(this,id)||this.players.flatMap(p=>[...(p.attractionDeckV87||[]),...(p.junkyardV87||[]),...(p.outsideGameV87||[])]).find(c=>c.iid===id);};
 const phaseInCandidates=G.phaseInCandidates;G.phaseInCandidates=function(p){return phaseInCandidates.call(this,p).filter(c=>!c.meta.ferrisWheelV87);};
 const emit=G.emit;G.emit=async function(event,data,...args){
  if(event==='precombatMain')await this.rollAttractionsV87(data.player);
  if(event==='diceRolled'&&(data.results||[]).includes(1)){this.untilEffects=this.untilEffects.filter(e=>e.kind!=='drop-tower-v87');this.recalc();}
  if(event==='attractionsRolledV87'&&data.value<=3){const returning=this.battlefield.filter(c=>c.phasedOut&&c.meta.ferrisWheelV87?.player===data.player.idx);for(const c of returning)delete c.meta.ferrisWheelV87;this.phaseInFor(data.player,{returning});}
  if(event==='beginCombat'){data.player.turnState.combatPhasesV87=(data.player.turnState.combatPhasesV87||0)+1;if(this._oracleCurrentAdditionalPhaseV80?.swingingShipV87)for(const card of this.creatures())if(card.meta._attackedTurn===this.turnNo)this.untap(card);}
  if(event==='endCombat'&&data.player.turnState.combatPhasesV87===1){for(const row of (this.swingingShipsV87||[]).filter(r=>r.turn===this.turnNo&&r.player===data.player.idx)){this.scheduleAdditionalCombat();this._additionalPhases[0].swingingShipV87=true;}this.swingingShipsV87=(this.swingingShipsV87||[]).filter(r=>r.turn!==this.turnNo||r.player!==data.player.idx);}
  return emit.call(this,event,data,...args);
 };
 // Every ignored die is excluded from roll-trigger events; replacement
 // controllers choose their ignored die before result-modifying effects.
 G.rollDice=async function(p,faces,count=1,{source=null,ignore=0}={}){
  if(!Number.isInteger(faces)||faces<2||!Number.isInteger(count)||count<1)throw Error('Invalid dice roll');
  const nativeExtra=this.bf().filter(c=>active(c)&&c.ctrl===p&&c.def.afcExtraDie).length;
  const rows=(this.dieReplacementsV87||[]).filter(r=>r.player===p.idx&&r.turn===this.turnNo),bamboo=this.untilEffects.filter(r=>r.kind==='extraIgnoredDieV88'&&r.player===p);
  this.dieReplacementsV87=(this.dieReplacementsV87||[]).filter(r=>!rows.includes(r)&&r.turn===this.turnNo);this.untilEffects=this.untilEffects.filter(r=>!bamboo.includes(r));
  const raw=Array.from({length:count+nativeExtra+rows.length+bamboo.length},()=>1+Math.floor(this.rnd()*faces)),kept=raw.map((value,index)=>({value,index})),ignored=[];
  for(const row of rows.concat(bamboo)){const chooser=row.chooser||this.players[row.controller]||p,options=kept.map(d=>({key:String(d.index),label:'Ignore die '+(d.index+1)+' ('+d.value+')'})),key=await option({g:this,you:chooser,src:source},'Choose a die to ignore',options,chooser),i=kept.findIndex(d=>String(d.index)===key);ignored.push(kept.splice(i,1)[0].value);}
  kept.sort((a,b)=>a.value-b.value);ignored.push(...kept.splice(0,Math.min(ignore+nativeExtra,kept.length-1)).map(d=>d.value));const results=kept.sort((a,b)=>a.index-b.index).map(d=>d.value);
  if(M.OracleV88?.diceAdjust)await M.OracleV88.diceAdjust(this,p,faces,results,source);
  const data={player:p,source,sides:faces,results,raw,ignored};this.note('diceRolled',data);await this.emit('diceRolled',data);return results;
 };
 G.controlNextTurnV87=function(controller,player){(this.c1516TurnControls||=[]).push({subject:player.idx,controller:controller.idx});};
 const copyDefinition=M.OracleV8Faces.copyTokenDefinition;M.OracleV8Faces.copyTokenDefinition=function(c,...args){if(c?.def?.stickerBaseV87||c?.def?.exchangeBaseV87||c?.def?.lastVoyageBaseV87){let d=c.def;while(d.stickerBaseV87||d.exchangeBaseV87||d.lastVoyageBaseV87)d=d.stickerBaseV87||d.exchangeBaseV87||d.lastVoyageBaseV87;c=Object.assign(Object.create(c),{def:d});}return copyDefinition.call(this,c,...args);};
 function combine(base,program){const out={...base};for(const key of ['abilities','triggers','statics','replace','mana'])if(program[key]?.length)out[key]=[].concat(base[key]||[],program[key]);out.kws=[...new Set([...(base.kws||[]),...(program.kws||[])])];if(program.castFromGraveV87)out.castFromGraveV87=true;return out;}
 const textDefinition=M.C1719.textDefinition;M.C1719.textDefinition=function(c){if(c.def.stickerBaseV87)c.def=c.def.stickerBaseV87;const g=c.owner.game,changes=(c.meta.c1719TextChanges||[]).filter(r=>!r.swirlV87),swirls=g.bf().filter(s=>(['battlefield','stack'].includes(c.zone)||c.meta.swirlSpellViewV88)&&s.def.oracleSwirlV87&&!s.phasedOut&&!s.cur?.abilitiesDisabled&&s.meta.swirlColorV87).sort((a,b)=>a.timestamp-b.timestamp);if(swirls.length){c.meta.c1719TextChanges=[...changes,...swirls.flatMap(s=>['white','blue','black','red','green'].filter(color=>color!==s.meta.swirlColorV87).map(color=>({from:color,to:s.meta.swirlColorV87,swirlV87:true})))];}if(!swirls.length)c.meta.c1719TextChanges=changes;textDefinition(c);
  const stickers=c.meta.stickersV87||[];if(!stickers.length)return;const base=c.def;let def={...base};if(c.zone!=='battlefield')for(const row of stickers)if(row.kind==='ability')def=combine(def,programFor(row.sheet,row.index));
  const pt=stickers.filter(r=>r.kind==='power-toughness').sort((a,b)=>a.timestamp-b.timestamp).at(-1);if(pt&&c.zone!=='battlefield'&&(c.is('Creature')||c.hasSub('Vehicle'))){def.power=String(pt.power);def.toughness=String(pt.toughness);}let words=base.rulesNoName?[]:base.name.replace(/_+/g,'').trim().split(/\s+/).filter(Boolean);for(const row of stickers.filter(r=>r.kind==='name').sort((a,b)=>a.timestamp-b.timestamp))words.splice(Math.min(row.position??0,words.length),0,row.text);if(stickers.some(r=>r.kind==='name')){def.name=words.join(' ');delete def.rulesNoName;};def.stickerBaseV87=base;c.def=def;
 };
 const recalc=G.recalc;G.recalc=function(...args){for(const c of this.battlefield||[])if(c.zone==='battlefield')for(const row of c.meta.stickersV87||[])if(row.kind==='power-toughness'&&!this.untilEffects.some(e=>e.stickerPTV87===row.sheet+':'+row.index&&e.iid===c.iid&&e.zoneVersion===c.zoneVersion))this.untilEffects.push({kind:'oracleBasePT',stickerPTV87:row.sheet+':'+row.index,iid:c.iid,zoneVersion:c.zoneVersion,power:row.power,toughness:row.toughness,timestamp:row.timestamp,expires:'object'});return recalc.apply(this,args);};
 M.OracleV87.applyStickerLayers=(g,bf,at,stage='abilities')=>{for(const c of bf)for(const row of c.meta.stickersV87||[])if(row.kind==='ability'&&row.timestamp>=(c.cur.oracleAbilityLossTimestamp??-Infinity))at(row.timestamp,()=>{const program=programFor(row.sheet,row.index);if(stage==='stats'){for(const st of program.statics)if(st.phase===2)st.apply(g,c,bf);}else applyProgram(g,c,program);});};

 // Sticker abilities are printed abilities of the stickered object. Each
 // exact sheet has two closed programs; repeated mechanics remain repeated.
 function programFor(sheet,index){const key=sheet+':'+index;if(programs.has(key))return programs.get(key);const p={kws:[],abilities:[],triggers:[],statics:[],mana:[]},n=index-6;
  const kw=(...k)=>p.kws.push(...k),a=(cost,mode,targets=[],extra={})=>p.abilities.push(ability(cost,mode,targets,extra)),t=(event,filter,mode,targets=[],extra={})=>p.triggers.push(trigger(event,filter,mode,targets,extra)),st=(apply,phase=5)=>p.statics.push({phase,apply});
  const mechanic=(kind,count=1)=>M.applyOracleMechanic(p,{kind,n:count});
  const attack=(mode,targets=[])=>t('attacks',self,mode,targets),leave=(mode,targets=[])=>t('lto',self,mode,targets),die=(mode,targets=[])=>t('dies',self,mode,targets),hit=(mode,targets=[])=>t('combatDamageToPlayer',self,mode,targets);
  switch(sheet){
   case 'Playable Delusionary Hydra':if(n===0)a({tap:true},'sticker-loot');else attack('sticker-life-draw-3');break;
   case 'Notorious Sliver War':if(n===0)a({mana:'{5}'},'sticker-team-1');else st((g,s)=>s.cur.protectionFrom.push((game,c)=>c?.is?.('Creature')&&(c.cur?.allCreatureTypes||new Set((c.cur?.subtypes||c.def.subtypes||[]).filter(x=>M.CREATURE_SUBTYPES.has(x))).size>=2)));break;
   case 'Demonic Tourist Laser':if(n===0)a({mana:'{1}',tap:true},'sticker-counter-1',[],{sorceryOnly:true});else die('sticker-tickets-7');break;
   case 'Night Brushwagg Ringmaster':if(n===0)kw('menace');else t('dies',(g,s,d)=>d.card===s&&!(d.snap?.counters?.['-1/-1']>0),'sticker-persist');break;
   case 'Sassy Gremlin Blood':if(n===0)attack('sticker-treasure');else a({mana:'{3}'},'sticker-flying',[spec()]);break;
   case 'Giant Mana Cake':if(n===0)leave('sticker-food-2');else die('sticker-destroy',[spec('permanent','battlefield','any',{nonland:true})]);break;
   case 'Weird Angel Flame':if(n===0)t('cast',(g,s,d)=>d.player===s.ctrl&&(d.so?.targets||[]).flat(Infinity).includes(s),'sticker-counter-2');else st((g,s)=>s.cur.protectionFrom.push((game,c)=>!!c&&c.mv%2===0));break;
   case 'Slimy Burrito Illusion':if(n===0)mechanic('mechanic-bushido',2);else kw('double strike');break;
   case 'Narrow-Minded Baloney Fireworks':if(n===0)attack('sticker-life-2');else kw('vigilance','reach');break;
   case 'Sticky Kavu Daredevil':if(n===0)t('dies',self,'sticker-bounce',[spec()],{optional:true});else attack('sticker-team-1');break;
   case 'Snazzy Aether Homunculus':if(n===0)a({mana:'{1}'},'sticker-all-types',[spec()]);else for(const e of ['cast','spellCopied'])t(e,(g,s,d)=>{const c=d.card||d.so?.card;return (d.player||d.ctrl)===s.ctrl&&c&&(c.is('Instant')||c.is('Sorcery'));},'sticker-draw');break;
   case 'Familiar Beeble Mascot':if(n===0)attack('sticker-untap',[spec('permanent')]);else t('etb',(g,s,d)=>d.card.ctrl===s.ctrl&&d.card.is('Creature'),'sticker-team-1');break;
   case 'Deep-Fried Plague Myr':if(n===0)attack('sticker-scry');else t('lto',self,'sticker-destroy',[spec('permanent','battlefield','any',{filter:(g,c)=>c.is('Artifact')||c.is('Enchantment')})],{optional:true});break;
   case 'Unsanctioned Ancient Juggler':if(n===0)attack('sticker-bolster');else kw('indestructible');break;
   case 'Ancestral Hot Dog Minotaur':if(n===0)mechanic('mechanic-afflict',2);else kw('flying');break;
   case 'Yawgmoth Merfolk Soul':if(n===0)leave('sticker-discard',[spec('player','player')]);else leave('sticker-clown-5');break;
   case 'Cursed Firebreathing Yogurt':if(n===0){mechanic('mechanic-prowess-v10');mechanic('mechanic-prowess-v10');}else a({mana:'{2}',tap:true},'sticker-damage-2',[spec('any')]);break;
   case 'Wild Ogre Bupkis':if(n===0)attack('sticker-counter-1');else st((g,s)=>{if(g.bf().filter(c=>c.ctrl===s.ctrl&&c.is('Artifact')).length>=3)s.cur.protectionFrom.push((game,c)=>live(c)&&!c.is('Creature'));});break;
   case 'Elemental Time Flamingo':if(n===0)a({exileSelf:true},'sticker-play-grave',[spec('card','graveyard','you',{nonland:true})]);else t('dies',(g,s,d)=>d.snap?.ctrl===s.ctrl&&d.snap.types.includes('Creature'),'sticker-drain');break;
   case 'Squid Fire Knight':if(n===0)a({tap:true},'sticker-die-replacement',[spec('player','player')]);else st((g,s)=>s.cur.protectionFrom.push((game,c)=>!!c&&c.mv%2===1));break;
   case 'Eternal Acrobat Toast':if(n===0)hit('sticker-blink',[spec('creature','battlefield','you')]);else a({tap:true},'sticker-untap',[spec('permanent','battlefield','any',{excludeSelf:true})]);break;
   case 'Misunderstood Trapeze Elf':if(n===0)t('cast',own,'sticker-generic-pump');else kw('hexproof');break;
   case 'Eldrazi Guacamole Tightrope':if(n===0)kw('haste');else p.castFromGraveV87=true;break;
   case 'Contortionist Otter Storm':if(n===0)a({tap:true},'sticker-haste',[spec()]);else kw('deathtouch','lifelink');break;
   case 'Unstable Robot Dragon':if(n===0)a({mana:'{1}'},'sticker-switch');else attack('sticker-pump-5');break;
   case 'Unassuming Gelatinous Serpent':if(n===0)die('sticker-return',[spec('card','graveyard','you',{noncreature:true,nonland:true})]);else hit('sticker-mill-double');break;
   case 'Spooky Clown Mox':if(n===0)kw('vigilance');else a({mana:'{1}',tap:true},'sticker-tap',[spec()]);break;
   case 'Zombie Cheese Magician':if(n===0)kw('first strike');else hit('sticker-draw-damage');break;
   case 'Trained Blessed Mind':if(n===0)a({tap:true},'sticker-exile',[spec('card','graveyard')]);else st((g,s)=>{if(s.ctrl.graveyard.length>=7){s.cur.power+=4;s.cur.kw.add('trample');}},2);break;
   case "Urza's Dark Cannonball":if(n===0){mechanic('mechanic-exalted');mechanic('mechanic-exalted');}else kw('shadow');break;
   case 'Goblin Coward Parade':if(n===0)mechanic('mechanic-mentor');else t('lto',self,'sticker-destroy',[spec('creature','battlefield','any',{stat:'power',comparison:'greater',threshold:4})],{optional:true});break;
   case 'Carnival Elephant Meteor':if(n===0)a({sacSelf:true},'sticker-draw-2');else attack('sticker-proliferate');break;
   case 'Unique Charmed Pants':if(n===0)p.mana.push({cost:{tap:true},produce:[{ANY:true,n:1}]});else t('attacks',(g,s,d)=>d.card===s&&!s.hasSub('Brushwagg'),'sticker-types-pump');break;
   case 'Werewolf Lightning Mage':if(n===0)t('landfall',(g,s,d)=>d.player===s.ctrl,'sticker-counter-1');else t('blocks',(g,s,d)=>d.attacker===s,'sticker-blocker-minus-4');break;
   case 'Primal Elder Kitty':if(n===0)a({mana:'{1}'},'sticker-pump-1-minus');else t('dies',self,'sticker-death-power',[spec()],{optional:true});break;
   case 'Cool Fluffy Loxodon':if(n===0)leave('sticker-draw');else t('etb',(g,s,d)=>d.card.ctrl===s.ctrl&&d.card.is('Creature'),'sticker-eldrazi');break;
   case 'Vampire Champion Fury':if(n===0)st((g,s)=>{if(!s.ctrl.hand.length){s.cur.power+=3;s.cur.toughness+=3;}},2);else{const a1=ability({mana:'{2}',sacSelf:true},'sticker-divide-damage',[spec('creature','battlefield','any',{min:0,max:999,unbounded:true})]);a1.prepareTargets=async ctx=>{ctx.stickerPowerV87=ctx.src.power;let remaining=Math.max(0,ctx.src.power),cards=flat(ctx);ctx.stickerDivisionV87=[];for(const [i,c]of cards.entries()){const min=cards.length?1:0,max=remaining-(cards.length-i-1);if(max<min)return false;const n=i===cards.length-1?remaining:await ctx.you.controller.decide(ctx.g,{type:'chooseX',min,max,prompt:'Assign damage to '+c.name,aiHint:{kind:'chooseX'}});if(!Number.isInteger(n)||n<min||n>max)return false;ctx.stickerDivisionV87.push({card:c,version:c.zoneVersion,n});remaining-=n;}return !cards.length||remaining===0;};p.abilities.push(a1);}break;
   case 'Geek Lotus Warrior':if(n===0)a({mana:'{2}'},'sticker-pump-2');else t('etb',(g,s,d)=>d.card.ctrl===s.ctrl&&d.card.is('Creature'),'sticker-damage-2',[spec('player','player')]);break;
   case 'Happy Dead Squirrel':if(n===0)p.mana.push({cost:{tap:true},produce:[{C:2}],restrict:(g,a)=>!!a?.card&&!a.isAbility&&!g.castHasType(a.card,a.castOpts||a,'Creature')});else kw('infect');break;
   case 'Mystic Doom Sandwich':if(n===0)kw('lifelink');else{st((g,s)=>s.cur.mustBeBlocked=true);t('becomesBlocked',(g,s,d)=>d.attacker===s,'sticker-blocker-pump');}break;
   case 'Squishy Sphinx Ninja':if(n===0)st((g,s)=>g.grantWard(s,'{2}'));else attack('sticker-provoke',[spec('creature','battlefield','defending-player')]);break;
   case 'Phyrexian Midway Bamboozle':if(n===0)attack('sticker-tickets-1');else t('dies',(g,s,d)=>d.card===s&&!(d.snap?.counters?.['+1/+1']>0),'sticker-undying');break;
   case 'Unhinged Beast Hunt':if(n===0)a({tap:true},'sticker-life-1');else attack('sticker-tap-stats');break;
   case 'Unglued Pea-Brained Dinosaur':if(n===0)p.mana.push({cost:{tap:true},produce:[{C:2}],restrict:(g,a)=>!!a?.card&&!a.isAbility&&g.castHasType(a.card,a.castOpts||a,'Creature')});else t('beginCombat',own,'sticker-artifact-4',[spec('artifact','battlefield','you',{noncreature:true})]);break;
   case 'Trendy Circus Pirate':if(n===0)kw('deathtouch');else hit('sticker-squirrels');break;
   case 'Wrinkly Monkey Shenanigans':if(n===0)a({mana:'{1}'},'sticker-cant-block',[spec()]);else t('endStep',(g,s)=>s.is('Creature')&&g.players.some(p=>p.turnState.creaturesDiedUnder>0),'sticker-morbid');break;
   case 'Space Fungus Snickerdoodle':if(n===0)kw('skulk');else mechanic('mechanic-battle-cry');break;
   case 'Jetpack Death Seltzer':if(n===0)kw('trample');else a({mana:'{3}'},'sticker-monstrosity-3');break;
   default:throw Error('Unknown v87 sticker ability '+sheet);
  }programs.set(key,p);return p;
 }

 M.OracleV20.handlers.unshift({...zoneReplacements,
  compile(op,script,entry,h){
   if(op.kind!=='permanent-rule-v87')return false;
   const t=(e,f,m,targets=[],extra={})=>{const tr=trigger(e,f,m,targets,extra);h.triggers.push(tr);return tr;},a=(cost,m,targets=[],extra={})=>{const ab=ability(cost,m,targets,extra);h.abilities.push(ab);return ab;},st=apply=>h.statics.push({phase:5,apply});
   if(op.stickers){const stickers=[...op.names.map((text,index)=>({sheet:op.mode,index,kind:'name',text,cost:0})),...Array.from({length:3},(_,i)=>({sheet:op.mode,index:i+3,kind:'art',text:'Artwork '+(i+1)+' from '+op.mode,cost:0})),...op.stickers.map(r=>({...r,sheet:op.mode}))];sheets.set(op.mode,{name:op.mode,stickers});script.stickerSheetV87=true;script.stickersV87=stickers;for(const r of op.stickers)if(r.kind==='ability')programFor(op.mode,r.index);return true;}
   if(op.lights){script.attractionLightsV87=op.lights;const tr=t('attractionVisitedV87',self,op.mode,attractionTargets(op.mode));if(op.mode==='Balloon Stand')tr.modes={list:[{label:'Create a Balloon',targets:[]},{label:'Sacrifice a Balloon; target creature gains flying',targets:[spec()]}]};if(op.mode==='Ferris Wheel')tr.targets=(g,s)=>[spec('creature','battlefield','any',{filter:(game,c)=>!(s.meta.ferrisTargetsV87||[]).some(r=>r.iid===c.iid&&r.version===c.zoneVersion)})];return true;}
   switch(op.mode){
    case 'Doubling Season':script.oracleCounterDoublerV87='all';(script.replace||=[]).push({event:'createToken',applies:(g,defs,p,s)=>p===s.ctrl,run:(g,defs)=>defs.concat(defs.slice())});break;
    case 'Loading Zone':script.oracleCounterDoublerV87='typed';break;
    case 'Solid Ground':script.oracleCounterAdderV87=1;t('etb',self,'solid-ground',[spec('land','battlefield','you')]);break;
    case 'Cooperation':st((g,s)=>{const c=g.byIid(s.attachedTo);if(live(c))c.cur.kw.add('banding');});break;
    case 'Fortified Area':h.statics.push({phase:2,apply:(g,s,bf)=>{for(const c of bf)if(c.ctrl===s.ctrl&&c.is('Creature')&&c.hasSub('Wall'))c.cur.power++;}});st((g,s,bf)=>{for(const c of bf)if(c.ctrl===s.ctrl&&c.is('Creature')&&c.hasSub('Wall'))c.cur.kw.add('banding');});break;
    case 'Baton of Morale':a({mana:'{2}'},'grant-banding',[spec()]);break;
    case 'Helm of Chatzuk':a({mana:'{1}',tap:true},'grant-banding',[spec()]);break;
    case 'Cathedral of Serra':case 'Seafarer\'s Quay':case 'Unholy Citadel':case 'Mountain Stronghold':case 'Adventurers\' Guildhouse':{const color={'Cathedral of Serra':'W',"Seafarer's Quay":'U','Unholy Citadel':'B','Mountain Stronghold':'R',"Adventurers' Guildhouse":'G'}[op.mode];st((g,s,bf)=>{for(const c of bf)if(c.ctrl===s.ctrl&&c.is('Creature')&&c.cur.super.includes('Legendary')&&c.colors.includes(color))c.cur.kw.add('bands with other legendary creatures');});break;}
    case '_____ _____ Rocketship':t('etb',self,'rocketship-stickers');t('attacks',self,'rocketship-pump');break;
    case 'Done for the Day':t('endStep',(g,s,d)=>own(g,s,d)&&g.bf().some(c=>c.ctrl===s.ctrl&&['Employee','Performer','Robot'].some(k=>c.hasSub(k))),'done-for-day');break;
    case '_____ Balls of Fire':t('etb',self,'name-sticker');t('stickerPlacedV87',self,'balls-fire',[spec('any')]);break;
    case 'Make a _____ Splash':t('etb',self,'name-sticker');{const tr=t('stickerPlacedV87',self,'make-splash');tr.targets=(g,s)=>[spec('creature','battlefield','any',{min:0,max:nameLetters(s,'u')})];}break;
    case 'Fight the _____ Fight':t('etb',self,'fight-name');h.statics.push({phase:2,apply:(g,s)=>{const c=g.byIid(s.attachedTo);if(live(c))c.cur.toughness+=2*nameStickers(s).filter(r=>countLetters(r.text)>=8).length;}});break;
    case 'Last Voyage of the _____':script.oracleLastVoyageV87=true;t('etb',self,'last-voyage');h.statics.push({phase:2,apply:(g,s)=>{const c=g.byIid(s.attachedTo);if(live(c))c.cur.power+=2*nameStickers(s).filter(r=>countLetters(r.text)<=7).length;}});{const tr=t('lto',self,'last-voyage-leave');const f=tr.filter;tr.filter=(g,s,d)=>{if(!f(g,s,d))return false;(d.lastVoyageHostV87||={})[s.iid]=d.snap?.attachedTo;return true;};}break;
    case 'Pin Collection':t('etb',self,'pin-collection');h.statics.push({phase:2,apply:(g,s)=>{const c=g.byIid(s.attachedTo);if(live(c)){c.cur.power++;c.cur.toughness++;for(const row of s.meta.stickersV87||[])if(row.kind==='ability')for(const st of programFor(row.sheet,row.index).statics)if(st.phase===2)st.apply(g,c,g.bf());}}});st((g,s)=>{const host=g.byIid(s.attachedTo);if(!live(host))return;for(const row of s.meta.stickersV87||[])if(row.kind==='ability')applyProgram(g,host,programFor(row.sheet,row.index));});break;
    case 'Motion Sickness':t('etb',self,'motion-tap');st((g,s)=>{const c=g.byIid(s.attachedTo);if(live(c))c.cur.cantUntap=true;});t('attractionVisitedV87',own,'motion-attach',[spec('creature','battlefield','any',{tapped:true})],{optional:true});break;
    case 'Cryptic Spires':script.entersTapped=true;script.mana={cost:{tap:true},produce:(g,s)=>(s.meta.colorsV87||[]).map(c=>({[c]:1}))};break;
    case 'Paliano, the High City':script.mana={cost:{tap:true},produce:(g,s)=>[...new Set((s.owner.oracleDraftV87?.palianoColors||[]).concat(s.meta.colorsV87||[]))].map(c=>({[c]:1}))};break;
    case 'Brutal Suppression':script.oracleBrutalSuppressionV87=true;break;
    case 'Coalition Flag':script.oracleCoalitionFlagV87=true;st((g,s)=>{const c=g.byIid(s.attachedTo);if(live(c)&&!c.cur.subtypes.includes('Flagbearer'))c.cur.subtypes.push('Flagbearer');});break;
    case 'Drought':script.oracleDroughtV87=true;t('upkeep',own,'drought-upkeep');break;
    case 'Swirl the Mists':script.oracleSwirlV87=true;script.asEnters=async(g,s)=>{s.meta.swirlColorV87=await option({g,you:s.ctrl,src:s},'Choose a color word',['white','blue','black','red','green'].map(key=>({key,label:key})));};break;
    case 'Exchange of Words':t('etb',self,'exchange-words',[spec('creature','battlefield','any',{min:2,max:2})]);break;
    case 'Equinox':st((g,s)=>{const host=g.byIid(s.attachedTo);if(live(host))host.cur.extraAbilities.push(ability({tap:true},'equinox',[{zone:'stack',what:'spell',min:1,max:1,filter:(game,so)=>so.kind==='spell'}]));});break;
    case 'Spellweaver Volute':script.oracleSpellweaverV87=true;script.auraTarget=[spec('instant','graveyard')];script.wlmAnimate=true;{const tr=t('cast',(g,s,d)=>d.player===s.ctrl&&g.castHasType(d.card,d.so?.castOpts||{},'Sorcery'),'spellweaver'),prior=tr.filter;tr.filter=(g,s,d)=>{if(!prior(g,s,d))return false;const c=g.byIid(s.attachedTo);(d.spellweaverLinksV87||={})[s.iid]=c?lock(c):null;return true;};}break;
    case 'Construct a Cosmic Cube':t('draw',(g,s,d)=>d.player===s.ctrl&&d.nth===2,'cosmic-draw');{const tr=t('countersPlaced',(g,s,d)=>d.card===s&&d.kind==='plan'&&d.before<7&&d.after>=7,'cosmic-seventh');}break;
    case 'The Dominion Bracelet':h.statics.push({phase:2,apply:(g,s)=>{const c=g.byIid(s.attachedTo);if(live(c)){c.cur.power++;c.cur.toughness++;}}});st((g,s)=>{const c=g.byIid(s.attachedTo);if(!live(c))return;const ab=ability({mana:'{15}'},'dominion-control',[spec('opponent','player')],{sorceryOnly:true});ab.cost.additionalCostV20={kind:'v87-bracelet',source:s,version:s.zoneVersion};ab.oracleBraceletV87={source:s,version:s.zoneVersion};c.cur.extraAbilities.push(ab);});break;
    default:throw Error('Unknown v87 permanent '+op.mode);
   }return true;
  },
  async effect(ctx,e){if(e.action!=='permanent-effects-v87')return false;await runEffect(ctx,e);return true;}
 });
 M.OracleV87.programFor=programFor;M.OracleV87.applyProgram=applyProgram;
 function applyProgram(g,c,p){for(const k of p.kws||[])c.cur.kw.add(k);c.cur.extraAbilities.push(...p.abilities);c.cur.extraTriggers.push(...p.triggers);c.cur.extraMana.push(...p.mana);for(const st of p.statics)if(st.phase!==2)st.apply(g,c,g.bf());}
 function attractionTargets(name){switch(name){case 'Hall of Mirrors':return [spec('creature','battlefield','you')];case 'Drop Tower':case 'Ferris Wheel':case 'Bumper Cars':return [spec()];case 'Foam Weapons Kiosk':return [spec('creature','battlefield','you')];case 'Spinny Ride':return [spec('creature','battlefield','opponent')];case 'Haunted House':return [spec('creature','graveyard','you')];default:return [];}}
 async function runEffect(ctx,e){
  const {g,you:p,src:s}=ctx,c=flat(ctx)[0],same=()=>H.sameBattlefieldSource(ctx),mode=e.mode;
  switch(mode){
   case 'sticker-loot':await g.draw(p,1,s);await H.runGenericEffect(ctx,{action:'discard',who:'you',n:1});break;
   case 'sticker-life-draw-3':await g.gainLife(p,3,s);await g.draw(p,1,s);break;
   case 'sticker-life-1':case 'sticker-life-2':await g.gainLife(p,mode==='sticker-life-1'?1:2,s);break;
   case 'sticker-counter-1':case 'sticker-counter-2':if(same())await put(g,s,'+1/+1',mode==='sticker-counter-1'?1:2,p);break;
   case 'sticker-tickets-1':case 'sticker-tickets-7':await g.getTicketsV87(p,mode==='sticker-tickets-1'?1:7,{source:s});break;
   case 'sticker-team-1':for(const x of g.creatures(p))M.E.pumpUntilEOT(g,x,1,1,[]);break;
   case 'sticker-pump-5':case 'sticker-pump-2':case 'sticker-pump-1-minus':if(same())M.E.pumpUntilEOT(g,s,mode==='sticker-pump-5'?5:mode==='sticker-pump-2'?2:1,mode==='sticker-pump-5'?5:mode==='sticker-pump-2'?0:-1,[]);break;
   case 'sticker-draw':case 'sticker-draw-2':await g.draw(p,mode==='sticker-draw-2'?2:1,s);break;
   case 'sticker-treasure':await g.makeTokens('treasure',p);break;
   case 'sticker-food-2':await g.makeTokens('food',p,{n:2});break;
   case 'sticker-clown-5':await g.makeTokens(clown(),p,{n:5});break;
   case 'sticker-flying':case 'sticker-haste':if(c)M.E.pumpUntilEOT(g,c,0,0,[mode==='sticker-flying'?'flying':'haste']);break;
   case 'sticker-tap':if(c)g.tap(c);break;
   case 'sticker-untap':if(c)g.untap(c);break;
   case 'sticker-exile':if(c)await g.move(c,'exile');break;
   case 'sticker-destroy':if(c)await g.destroy(c,{source:H.oracleDamageSource(ctx)});break;
   case 'sticker-bounce':if(c)await g.move(c,'hand');break;
   case 'sticker-return':if(c)await g.move(c,'hand');break;
   case 'sticker-discard':if(c)await H.runGenericEffect({...ctx,you:c},{action:'discard',who:'you',n:1});break;
   case 'sticker-damage-2':if(c)await g.damageAny(H.oracleDamageSource(ctx),c,2);break;
   case 'sticker-all-types':if(c){const r=lock(c);g.untilEffects.push({expires:'eot',apply:()=>{if(current(r))c.cur.allCreatureTypes=true;}});g.recalc();}break;
   case 'sticker-scry':await M.E.scry(g,p,1);break;
   case 'sticker-bolster':{const cards=g.creatures(p);if(cards.length){const low=Math.min(...cards.map(x=>x.toughness)),[x]=await pick(ctx,cards.filter(x=>x.toughness===low),1,1,p,'Bolster 1');if(x)await put(g,x,'+1/+1',1,p);}break;}
   case 'sticker-persist':case 'sticker-undying':{const kind=mode==='sticker-persist'?'-1/-1':'+1/+1',d=ctx.data,snap=d.snap;if((snap?.counters?.[kind]||0)>0)break;const version=(snap?.zoneVersion??ctx.sourceZoneVersion)+1;if(s.zone==='graveyard'&&s.zoneVersion===version&&!s.isToken)await g.putPermanentOntoBattlefield(s,s.owner,{additionalCounters:{[kind]:1}});break;}
   case 'sticker-drain':for(const q of p.opponents(g))await g.loseLife(q,1,s);await g.gainLife(p,1,s);break;
   case 'sticker-play-grave':if(c)grant(ctx,[c]);break;
   case 'sticker-generic-pump':{const n=M.parseCost(g.castDefinition(ctx.data.card,ctx.data.so?.castOpts||{}).cost||'').generic;if(same())M.E.pumpUntilEOT(g,s,n,n,[]);break;}
   case 'sticker-switch':if(same())await H.runGenericEffect(ctx,{action:'switch-pt',target:'self'});break;
   case 'sticker-mill-double':await g.mill(ctx.data.player,2*(ctx.data.n||0),s);break;
   case 'sticker-draw-damage':await g.draw(p,ctx.data.n||0,s);break;
   case 'sticker-proliferate':await M.E.proliferate(g,p);break;
   case 'sticker-types-pump':if(same()&&!s.hasSub('Brushwagg'))M.E.pumpUntilEOT(g,s,new Set([...s.cur.super,...s.cur.types,...s.cur.subtypes]).size,0,[]);break;
   case 'sticker-blocker-minus-4':if(ctx.data.blocker)M.E.pumpUntilEOT(g,ctx.data.blocker,-4,-4,[]);break;
   case 'sticker-death-power':if(c)await put(g,c,'+1/+1',Math.max(0,ctx.data.snap?.power||0),p);break;
   case 'sticker-eldrazi':if(same())g.addOracleAnimation(s,{types:['Creature'],subtypes:['Eldrazi'],retainTypes:true,retainAllSubtypes:true,power:13,toughness:13,temporary:true,keywords:[]});break;
   case 'sticker-divide-damage':await g.damageBatch((ctx.stickerDivisionV87||[]).filter(r=>live(r.card)&&r.card.zoneVersion===r.version&&flat(ctx).includes(r.card)).map(r=>({src:H.oracleDamageSource(ctx),target:r.card,n:r.n})));break;
   case 'sticker-blocker-pump':if(same()){const n=(ctx.data.blockers||s.blockedBy||[]).length;M.E.pumpUntilEOT(g,s,n,n,[]);}break;
   case 'sticker-provoke':if(c&&await option(ctx,'Untap the creature and have it block this creature?')==='yes'){g.untap(c);await H.runGenericEffect(ctx,{action:'combat-restriction',target:0,duration:'eot',restriction:{combatRule:{kind:'source-block',mode:'require'}}});}break;
   case 'sticker-tap-stats':{const power=H.genericAmount({kind:'source-stat',stat:'power'},ctx),toughness=H.genericAmount({kind:'source-stat',stat:'toughness'},ctx);for(const x of g.creatures().filter(x=>x.ctrl!==p&&(x.power===power||x.toughness===toughness)))g.tap(x);break;}
   case 'sticker-artifact-4':if(c)g.addOracleAnimation(c,{power:4,toughness:4,types:['Creature'],subtypes:[],retainTypes:true,retainAllSubtypes:true,keywords:['flying'],temporary:true});break;
   case 'sticker-squirrels':await g.makeTokens(token('Squirrel',['Creature'],['Squirrel'],1,1,['G']),p,{n:ctx.data.n||0});break;
   case 'sticker-cant-block':if(c&&same()){const r=lock(c),source=lock(s);g.untilEffects.push({expires:'eot',apply:()=>{if(current(r)&&current(source)){const previous=s.cur.cantBeBlockedBy;s.cur.cantBeBlockedBy=(game,b)=>b===c||!!previous?.(game,b);}}});g.recalc();}break;
   case 'sticker-morbid':if(same()&&s.is('Creature')){await put(g,s,'-1/-1',1,p);await g.draw(p,1,s);}break;
   case 'sticker-monstrosity-3':if(same()&&!s.meta.monstrous){s.meta.monstrous=true;await put(g,s,'+1/+1',3,p);await g.emit('monstrous',{card:s,player:p,n:3});}break;
   case 'sticker-blink':if(c){const r=lock(c);await g.move(c,'exile');if(c.zone==='exile'&&c.zoneVersion===r.version+1&&!c.isToken)await g.putPermanentOntoBattlefield(c,c.owner);}break;
   case 'sticker-die-replacement':if(c)(g.dieReplacementsV87||=[]).push({player:c.idx,controller:p.idx,turn:g.turnNo,source:s.iid});break;
   default:await permanentEffect(ctx,mode);break;
  }
 }
 async function permanentEffect(ctx,mode){
  const {g,you:p,src:s}=ctx,c=flat(ctx)[0],same=()=>H.sameBattlefieldSource(ctx);
  switch(mode){
   case 'Information Booth':await g.draw(p,1,s);break;
   case 'Concession Stand':await g.makeTokens('food',p);break;
   case 'Clown Extruder':await g.makeTokens(clown(),p);break;
   case 'Costume Shop':{const [card]=await pick(ctx,g.bf().filter(x=>x.owner===p&&!x.is('Land')),0,1,p,'Choose a permanent for a sticker');if(card)await g.placeStickerV87(ctx,card);break;}
   case 'Hall of Mirrors':if(c){const definition=M.OracleV8Faces.copyTokenDefinition(c,d=>({...d,super:(d.super||[]).filter(x=>x!=='Legendary')}));for(const x of g.creatures(p).filter(x=>x!==c))M.OracleV8Copies.applyCopy(g,x,definition,{duration:'eot'});g.recalc();}break;
   case 'Pick-a-Beeble':{const [n]=await g.rollDice(p,6,1,{source:s});if(same())await put(g,s,'luck',n,p);await g.makeTokens('treasure',p);if(same()&&(s.counters.luck||0)>=6){await g.emit('attractionPrizeV87',{card:s,player:p,source:s});await g.makeTokens('treasure',p,{n:2});if(same())await g.sacrifice(p,s);await g.openAttractionV87(p,1,{source:s});}break;}
   case 'Storybook Ride':{const n=p.turnState.attractionsVisitedV87||0,rows=[];for(const card of p.library.slice(-n).reverse()){const r=lock(card);await g.move(card,'exile');if(card.zone==='exile'&&card.zoneVersion===r.version+1)rows.push(lock(card));}grant(ctx,rows.map(r=>r.card));delayed(ctx,'endStep',rows,async(next,remaining)=>{if(!remaining.length)return;const from=remaining.map(r=>r.card),order=await pick(next,from,from.length,from.length,next.you,'Order these cards on the bottom of your library');for(const card of order)if(remaining.some(r=>r.card===card&&current(r)))await next.g.move(card,'library',{toBottom:true});});break;}
   case 'Drop Tower':if(c){const r=lock(c);g.untilEffects.push({kind:'drop-tower-v87',expires:'eot',timestamp:g.nextOracleTimestamp(),apply:()=>{if(current(r))c.cur.kw.add('flying');}});g.recalc();}break;
   case 'Swinging Ship':{const install=()=>{g.scheduleAdditionalCombat();const phase=g._additionalPhases?.[0];if(phase)phase.swingingShipV87=true;};if(g.phase==='combat'&&p.turnState.combatPhasesV87===1)install();else if(!(p.turnState.combatPhasesV87>0))(g.swingingShipsV87||=[]).push({player:p.idx,turn:g.turnNo});break;}
   case 'Roller Coaster':case 'Kiddie Coaster':for(const x of g.creatures(p))M.E.pumpUntilEOT(g,x,mode==='Roller Coaster'?2:1,0,[]);break;
   case 'Foam Weapons Kiosk':if(c){await put(g,c,'+1/+1',1,p);M.E.pumpUntilEOT(g,c,0,0,['vigilance']);}break;
   case 'Ferris Wheel':if(c&&same()){const seen=s.meta.ferrisTargetsV87||=[];if(seen.some(r=>r.iid===c.iid&&r.version===c.zoneVersion))break;seen.push({iid:c.iid,version:c.zoneVersion});for(const x of g.phaseOutMany([c]))x.meta.ferrisWheelV87={player:p.idx,source:s.iid,sourceVersion:ctx.sourceZoneVersion};}break;
   case 'Fortune Teller':await M.E.scry(g,p,1);break;
   case 'Balloon Stand':if(ctx.mode===0)await g.makeTokens(token('Balloon',['Creature'],['Balloon'],1,1,['R'],['flying']),p);else if(c){const [balloon]=await pick(ctx,g.bf().filter(x=>x.ctrl===p&&x.hasSub('Balloon')&&g.canSacrifice(x)),1,1,p,'Sacrifice a Balloon');if(balloon&&await g.sacrifice(p,balloon))M.E.pumpUntilEOT(g,c,0,0,['flying']);}break;
   case 'Bounce Chamber':{const from=g.creatures().filter(x=>x.ctrl!==p);if(!from.length)break;const min=Math.min(...from.map(x=>x.toughness)),[card]=await pick(ctx,from.filter(x=>x.toughness===min),1,1,p,'Return a creature with the lowest toughness');if(card)await g.move(card,'hand');break;}
   case 'Spinny Ride':if(c)g.tap(c);break;
   case 'Tunnel of Love':{const opponents=p.opponents(g);if(!opponents.length)break;const key=await option(ctx,'Choose an opponent',opponents.map(q=>({key:String(q.idx),label:q.name}))),q=opponents.find(q=>String(q.idx)===key),[other]=await pick(ctx,g.creatures(q),1,1,q,'Tunnel of Love: choose your creature'),[your]=await pick(ctx,g.creatures(p),1,1,p,'Tunnel of Love: choose your creature');if(!other&&!your)break;if(await option(ctx,'Exile both creatures until the next end step?')==='yes'){const rows=[];await g.withBattlefieldEntryBatch(async()=>{for(const x of [other,your].filter(Boolean)){const r=lock(x);await g.move(x,'exile');if(x.zone==='exile'&&x.zoneVersion===r.version+1&&!x.isToken)rows.push(lock(x));}});delayed(ctx,'endStep',rows,async(next,remaining)=>next.g.withBattlefieldEntryBatch(async()=>{for(const r of remaining)if(current(r))await next.g.putPermanentOntoBattlefield(r.card,r.card.owner);}));}else await fight(g,other,your);break;}
   case 'Trash Bin':await g.mill(p,2,s);if(p.graveyard.length){const card=p.graveyard[Math.floor(g.rnd()*p.graveyard.length)];await g.move(card,'hand');}break;
   case 'Bumper Cars':if(c){const r=lock(c);g.untilEffects.push({expires:'eot',apply:()=>{if(current(r))c.cur.mustBeBlocked=true;}});g.recalc();}break;
   case 'Merry-Go-Round':for(const x of g.creatures(p).filter(x=>x.power<=2))M.E.pumpUntilEOT(g,x,0,0,['horsemanship']);break;
   case 'Haunted House':if(c){await g.putPermanentOntoBattlefield(c,p);if(live(c)){M.E.pumpUntilEOT(g,c,0,0,['haste']);delayed(ctx,'endStep',[lock(c)],async(next,rows)=>{for(const r of rows)await next.g.move(r.card,'exile');},{filter:(game,d)=>d.player===p});}}break;
   case 'grant-banding':if(c)M.E.pumpUntilEOT(g,c,0,0,['banding']);break;
   case 'solid-ground':if(c)await H.runGenericEffect(ctx,{action:'earthbend-v10',target:0,n:3});break;
   case 'rocketship-stickers':if(same())await g.placeStickerV87(ctx,s,{kind:'name',max:2});break;
   case 'name-sticker':if(same())await g.placeStickerV87(ctx,s,{kind:'name'});break;
   case 'rocketship-pump':{const letter=await option(ctx,'Choose a letter',Array.from({length:26},(_,i)=>String.fromCharCode(65+i)).map(key=>({key,label:key})));if(same()){const n=nameStickers(s).filter(r=>r.text[0].toUpperCase()===letter).length;M.E.pumpUntilEOT(g,s,n,n,[]);}break;}
   case 'done-for-day':{const owned=g.bf().filter(x=>x.ctrl===p),has=k=>owned.some(x=>x.hasSub(k)),kinds=['Employee','Performer','Robot'];if(!kinds.some(has))break;const key=await option(ctx,'Get a ticket or create a Treasure?',[{key:'none',label:'Decline'},{key:'ticket',label:'Get a ticket'},{key:'treasure',label:'Create a Treasure'}]);if(key==='ticket')await g.getTicketsV87(p,1,{source:s});if(key==='treasure')await g.makeTokens('treasure',p);if(kinds.every(has)){const [card]=await pick(ctx,g.bf().filter(x=>x.owner===p&&!x.is('Land')),0,1,p,'Choose a permanent for a sticker');if(card)await g.placeStickerV87(ctx,card);}break;}
   case 'balls-fire':if(c){const names=(ctx.sourceMeta?.stickersV87||s.meta.stickersV87||[]).filter(r=>r.kind==='name');await g.damageAny(H.oracleDamageSource(ctx),c,names.reduce((n,r)=>n+(r.text.toLowerCase().match(/o/g)||[]).length,0));}break;
   case 'make-splash':for(const card of flat(ctx))g.tap(card);break;
   case 'fight-name':if(same()){const placed=await g.placeStickerV87(ctx,s,{kind:'name'});if(placed.length)g.queueTrigger({src:s,ctrl:p,sourceZoneVersion:ctx.sourceZoneVersion,oracleReflexive:true,name:'Fight the _____ Fight — fight',targets:[spec('creature','battlefield','opponent',{min:0})],run:async next=>{const host=next.g.byIid(next.src.attachedTo),target=flat(next)[0];if(host&&target&&H.sameBattlefieldSource(next))await fight(next.g,host,target);}});}break;
   case 'last-voyage':if(same()){await g.placeStickerV87(ctx,s,{kind:'name'});if(!same())break;s.meta.lastVoyageV87={version:s.zoneVersion};s.def={...s.def,auraTarget:[spec()],lastVoyageBaseV87:s.def};g.addOracleAnimation(s,{types:[],subtypes:['Aura'],retainTypes:true,retainAllSubtypes:true,keywords:[],temporary:false});const [card]=await pick(ctx,p.graveyard.filter(x=>x.is('Creature')),1,1,p,'Return a creature to attach Last Voyage');if(card){await g.putPermanentOntoBattlefield(card,p);if(live(card)&&same()&&g.legalEntryAttachment(s,card,p))await g.attach(s,card);}}break;
   case 'last-voyage-leave':{const snap=ctx.data.snap,host=g.byIid(snap?.attachedTo??ctx.sourceMeta?._lastAttachedTo);if(live(host)&&host.zoneVersion===snap?.attachedHostVersion)await g.sacrifice(host.ctrl,host);break;}
   case 'pin-collection':if(same())await g.placeStickerV87(ctx,s,{kind:'ability',maxCost:ctx.oracleSourceCapture?.castX??s.castMeta?.x??0,free:true});break;
   case 'motion-tap':{const host=g.byIid(s.attachedTo);if(live(host))g.tap(host);break;}
   case 'motion-attach':if(c&&same())await g.attach(s,c);break;
   case 'drought-upkeep':if(await option(ctx,'Pay {W}{W} for Drought?')==='yes'&&await g.payMana(p,M.parseCost('{W}{W}')))break;if(same())await g.sacrifice(p,s);break;
   case 'cosmic-draw':await g.makeTokens(token('Villain',['Creature'],['Villain'],2,1,['B'],['menace']),p);if(same())await put(g,s,'plan',1,p);break;
   case 'cosmic-seventh':if(same()&&await g.sacrifice(p,s))g.queueTrigger({src:s,ctrl:p,oracleReflexive:true,name:'Construct a Cosmic Cube — control a turn',targets:[spec('opponent','player')],run:async next=>{const opponent=flat(next)[0];if(opponent)next.g.controlNextTurnV87(next.you,opponent);}});break;
   case 'dominion-control':if(c)g.controlNextTurnV87(p,c);break;
   case 'exchange-words':if(same()&&flat(ctx).length===2){const [a,b]=flat(ctx);(g.exchangesV87||=[]).push({source:s,sourceVersion:ctx.sourceZoneVersion,rows:[lock(a),lock(b)],texts:[textBox(a.def),textBox(b.def)],timestamp:g.nextOracleTimestamp()});g.recalc();}break;
   case 'spellweaver':{const row=ctx.data.spellweaverLinksV87?.[s.iid];if(!row||!current(row)||row.card.zone!=='graveyard')break;const card=row.card,copy=new M.CardInst(M.OracleV8Faces.copyTokenDefinition(card),p);copy.zone='exile';copy.meta.bomCastCopy=true;copy.meta.bomPreparingCopy=true;p.exile.push(copy);(g.bomCardCopies||=[]).push(copy);let cast=false;try{cast=!!await M.OracleV8PlayPermissions.castOne(ctx,[copy],{free:true},{target:H.genericTargetSpec});}finally{delete copy.meta.bomPreparingCopy;if(copy.zone==='exile'){g.remove(copy);copy.zone='ceased';}}if(cast&&current(row)){await g.move(card,'exile');if(same()){const [next]=await pick(ctx,g.players.flatMap(q=>q.graveyard).filter(x=>x.is('Instant')),1,1,p,'Attach Spellweaver Volute to an instant card');if(next)await g.attach(s,next);}}break;}
   case 'equinox':if(c&&g.stack.includes(c)&&willDestroyLand(g,p,c))await g.counterStackObject(c);break;
   default:throw Error('Unknown v87 effect '+mode);
  }
 }
 const textExcluded=new Set(['name','cost','types','subtypes','super','power','toughness','colorsOverride','oracleId','oracleBatch','oracleContracts','oracleImportEligible','stickerBaseV87','c1719TextBase']);
 function textBox(def){const out={};for(const [k,v]of Object.entries(def.stickerBaseV87||def))if(!textExcluded.has(k))out[k]=v;return out;}
 function exchangeDefinition(g,c){if(c.def.exchangeBaseV87)c.def=c.def.exchangeBaseV87;const rows=(g.exchangesV87||[]).filter(r=>r.source.zone==='battlefield'&&r.source.zoneVersion===r.sourceVersion&&r.rows.some(x=>x.card===c&&current(x))).sort((a,b)=>a.timestamp-b.timestamp);if(!rows.length)return;const base=c.def;let d=base;for(const r of rows){const index=r.rows.findIndex(x=>x.card===c&&current(x));d=Object.fromEntries(Object.entries(d).filter(([k])=>textExcluded.has(k)));Object.assign(d,r.texts[1-index]);}c.def={...d,exchangeBaseV87:base};}
 const textBeforeExchange=M.C1719.textDefinition;M.C1719.textDefinition=function(c){if(c.def.stickerBaseV87)c.def=c.def.stickerBaseV87;exchangeDefinition(c.owner.game,c);return textBeforeExchange(c);};
 const auraLegal=M.WLM.reanimationAuraLegal;M.WLM.reanimationAuraLegal=function(g,a,c){if(a.def.oracleSpellweaverV87)return !!c&&c.zone==='graveyard'&&c.is('Instant')&&!a.is('Creature');return auraLegal(g,a,c);};
 async function fight(g,a,b){if(!live(a)||!live(b)||!a.is('Creature')||!b.is('Creature'))return;await g.damageBatch([{src:a,target:b,n:Math.max(0,a.power)},{src:b,target:a,n:Math.max(0,b.power)}]);}
 // Equinox reads the announced spell program without resolving it. Only
 // mandatory destruction instructions in the selected modes can qualify.
 M.OracleV87.destructionPredictors=[];
 function willDestroyLand(g,p,so){
  if(!g.isInstantSorcerySpell(so))return false;const checked=g.revalidateTargets(so.targets||[],so.targetSpecs,so.card,so.ctrl,so.targetIdentities);if(checked.anyChosen&&!checked.anyLegal)return false;
  const ctx={g,you:so.ctrl,src:so.card,so,targets:checked.targets,x:so.x||0,mode:so.mode,kicked:so.kicked},def=so.oracleDefinition||g.castDefinition(so.card,so.castOpts||{}),attempts=[];
  const add=(cards,noRegen=false)=>attempts.push({cards:[...new Set(cards)],noRegen});
  const subjects=(local,reference)=>H.genericEffectSubjects(local,reference);
  function condition(e,local){const subject=e.conditionTarget===undefined?local.src:subjects(local,e.conditionTarget)[0],evidence={zoneVersion:subject?.zoneVersion,stats:{power:subject?.power,toughness:subject?.toughness,mv:subject===local.src?g.stackSpellManaValue(so):subject?.mv},castFrom:so.from,castX:so.x,wasCast:!so.isCopy,manaSpent:so.manaSpent,paymentColorCounts:so.paymentColorCounts,kicked:so.kicked,castFlagsV10:so.castOpts};return !!subject&&H.genericCondition(g,subject,e.condition,local.you,evidence);}
  function effects(rows,local){for(const e of rows||[]){if(e.action==='conditional'){effects(condition(e,local)?e.effects:e.elseEffects,local);continue;}if(e.action==='destroy'){add(subjects(local,e.target),!!e.noRegen);continue;}
    if(e.action==='battlefield-group'&&e.operation==='destroy'){const filters=(e.filters||[]).map(f=>H.genericTargetSpec(f,[],0,{oracleContext:local}).filter),players=e.target!==undefined&&!e.attachedToV12?subjects(local,e.target):null,hosts=e.attachedToV12?subjects(local,e.target):null,preserved=(e.excludeTargetsV11||[]).flatMap(ref=>subjects(local,ref));add(g.bf().filter(c=>!preserved.includes(c)&&(!e.ownerPlayerV18||subjects(local,e.ownerPlayerV18.target).includes(c.owner))&&(!players||players.includes(c.ctrl))&&(e.includeHostV14&&hosts?.includes(c)||(!hosts||hosts.some(h=>h.iid===c.attachedTo))&&filters.some(f=>f(g,c,local.you,local.src)))),!!e.noRegen);continue;}
    if(e.optional||['resolution-cost','optional-payment','optional-effect-v20','delayed','grant-operation','reflexive-trigger-v9'].includes(e.action))continue;
    for(const predictor of M.OracleV87.destructionPredictors){const rows=predictor(local,e);if(rows)for(const row of rows)add(row.cards,!!row.noRegen);}
    // Closed spell handlers retain their exact destruction instruction in
    // Oracle. Their target reference is already the native announced group.
    if(typeof e.mode==='string'&&e.mode.startsWith('destroy-')&&!/destroy-(?:or|unless|choose)/.test(e.mode)&&/\b[Dd]estroy (?:target|up to|each|all)\b/.test(def.oracle||'')){if(e.target!==undefined)add(subjects(local,e.target),!!e.noRegen);else if(e.mode==='destroy-plains')add(g.lands().filter(c=>c.hasSub('Plains')));else if(e.mode==='destroy-spell-value')add(g.bf().filter(c=>c.mv===g.stackSpellManaValue(so)));}
   }}
  function v4(op){const top=op.operations?.[0],map=new Map((op.effects||[]).map(e=>[e.id,e]));if(!top)return;const options=top.kind==='sequence'?[{effectIds:top.effectIds,targetIds:(op.targets||[]).map(t=>t.id).filter(id=>(top.effectIds||[]).some(eid=>map.get(eid)?.targetIds.includes(id)))}]:(Array.isArray(so.mode)?so.mode:[so.mode]).filter(Number.isInteger).sort((a,b)=>a-b).map(i=>top.options[i]).filter(Boolean);let offset=0;
   for(const option of options){const selected=new Map(option.targetIds.map((id,i)=>[id,[ctx.targets[offset+i]].flat().filter(Boolean)]));offset+=option.targetIds.length;for(const id of option.effectIds||[]){const e=map.get(id);if(e?.kind==='destroy')add(e.targetIds.flatMap(id=>selected.get(id)||[]),e.canRegenerate===false);else if(e?.kind==='destroyAll'){const scope=e.scope||{},types=scope.types||scope.cardTypes||[];add(g.bf().filter(c=>(scope.controller!=='you'||c.ctrl===ctx.you)&&(scope.controller!=='opponent'||c.ctrl!==ctx.you)&&(!types.length||types.some(t=>t==='Permanent'||c.is(t)))&&(!scope.filters?.nonland||!c.is('Land'))));}}}
  }
  let offset=0;for(const op of def.oracleImplementation||[]){if(op.kind==='spell-v4'){v4(op);continue;}if(op.kind==='spell-modal-generic'){let cursor=0;for(const i of (Array.isArray(so.mode)?so.mode:[so.mode]).filter(Number.isInteger).sort((a,b)=>a-b)){const mode=op.modes[i];if(!mode)continue;effects(mode.body.effects,{...ctx,targets:ctx.targets.slice(cursor,cursor+mode.body.targets.length)});cursor+=mode.body.targets.length;}continue;}if(op.kind==='spell-generic'){const n=(op.targets||[]).length,body=op.optionalBodyV14&&so.castOpts?.oracleOptionalCostV14?op.optionalBodyV14:op.cleaveBodyV10&&so.castOpts?.oracleCleaveV10?op.cleaveBodyV10:op.overloadedBody&&so.castOpts?.overloaded?op.overloadedBody:op;effects(body.effects,{...ctx,targets:ctx.targets.slice(offset,offset+n)});offset+=n;continue;}if(op.kind==='spell-destroy'){add([ctx.targets[offset]].flat().filter(Boolean),!!op.noRegen);offset++;continue;}if(op.kind==='spell-destroy-all'){const type=op.what[0].toUpperCase()+op.what.slice(1,-1);add(g.bf().filter(c=>c.is(type)),!!op.noRegen);continue;}if(op.kind?.startsWith('spell-')){try{offset+=H.compileSpell(op)?.targets?.length||0;}catch{/* Extension spell handlers supply their own prediction or printed imperative. */}}}
  // Native handwritten spells still expose their removal target hints and
  // printed imperative; restrict the fallback to an actual destroy clause.
  if(!attempts.length&&/^Destroy all lands[.,]/i.test(def.oracle||''))add(g.lands(),/can't be regenerated/i.test(def.oracle));
  if(!attempts.length&&/^Destroy target (?:land|permanent)\b/i.test(def.oracle||''))add([ctx.targets[0]].flat().filter(Boolean),/can't be regenerated/i.test(def.oracle));
  const protection=new Map();for(const attempt of attempts)for(const c of attempt.cards){if(!live(c)||!c.is('Land')||c.ctrl!==p||c.kw('indestructible'))continue;let r=protection.get(c);if(!r){r={shield:c.counters.shield||0,regen:c.regenShield||0,armor:g.bf().filter(a=>a.attachedTo===c.iid&&active(a)&&((typeof a.def.umbraArmor==='function'?a.def.umbraArmor(g,a,c):a.def.umbraArmor)||a.def.totemArmor||a.hasSub('Aura')&&g.bf().some(s=>active(s)&&s.ctrl===c.ctrl&&s.def.cwwUmbraMystic))).length};protection.set(c,r);}if(r.shield){r.shield--;continue;}if(r.armor){r.armor--;continue;}const noRegen=attempt.noRegen||M.oracleCantRegenerateV15?.(g,c);if(!noRegen&&r.regen){r.regen--;continue;}if(!noRegen&&g.hasAutomaticRegenerationV82?.(c))continue;return true;}return false;
 }


 // Costs use the existing announcement/validation/commit transaction. Printed
 // mana is retained separately from all discounts and alternative payments.
 const costs=M.OracleV20Costs,originalCosts={feasible:costs.activationFeasible,prepare:costs.prepareActivation,validate:costs.validateActivation,commit:costs.commitActivation};
 const plainCost=c=>({...c,additionalCostV20:c.additionalCostV20?.base});
 const globalCost=c=>c.additionalCostV20?.kind==='v87-global';
 const braceletCost=c=>c.additionalCostV20?.kind==='v87-bracelet';
 const destructiveRows=plan=>!plan||plan.kind==='blight'||String(plan.kind).startsWith('counter-')?[]:plan.destructiveRowsV87||plan.rows||[];
 const braceletLive=(ctx,cost)=>{const r=cost.additionalCostV20;return live(ctx.src)&&ctx.src.ctrl===ctx.you&&live(r.source)&&r.source.zoneVersion===r.version&&r.source.attachedTo===ctx.src.iid&&r.source.attachedHostVersion===ctx.src.zoneVersion;};
 function auxiliaryCtx(ctx){return {...ctx,so:ctx.v87CostSo,allowSourceSacrifice:!ctx.v87CostMain.sacSelf,reservedCards:ctx.v87CostReservations||[]};}
 function descriptors(ctx,cost){return M.OracleV87.additionalCosts(ctx.g,ctx.you,ctx.src,{}, {isAbility:true,ability:ctx.ability,cost});}
 costs.activationFeasible=function(g,p,src,cost,mana,a){
  if(braceletCost(cost))return braceletLive({g,you:p,src},cost)&&(!mana||g.canPayMana(p,mana,{card:src,isAbility:true,ability:a},{protectedSacrifices:[cost.additionalCostV20.source]}));
  if(!globalCost(cost))return originalCosts.feasible.call(this,g,p,src,cost,mana,a);
  const base=plainCost(cost);if(!this.activationFeasible(g,p,src,base,mana,a))return false;const rows=descriptors({g,you:p,src,ability:a},cost);return !rows.length||M.compileOracleAdditionalCosts(rows).canPayContext({g,you:p,src,allowSourceSacrifice:!cost.sacSelf,x:0,so:{x:0}});
 };
 costs.prepareActivation=async function(ctx,cost){
  if(braceletCost(cost)){if(!braceletLive(ctx,cost))return false;const c=cost.additionalCostV20.source;ctx.oracleActivationPlanV20={sourceVersion:ctx.src.zoneVersion,sourceZone:ctx.src.zone,kind:'v87-bracelet',rows:[lock(c)]};return true;}
  if(!globalCost(cost))return originalCosts.prepare.call(this,ctx,cost);
  const base=plainCost(cost);if(!await this.prepareActivation(ctx,base))return false;ctx.v87BaseCostPlan=ctx.oracleActivationPlanV20;ctx.v87CostMain=cost;ctx.v87CostReservations=destructiveRows(ctx.oracleActivationPlanV20).map(r=>r.card).concat(cost.sacSelf?[ctx.src]:[]);
  ctx.v87CostSo={kind:'ability',card:ctx.src,x:ctx.x||0,castOpts:{},oracleCostPlans:[]};const rows=descriptors(ctx,cost),sub=auxiliaryCtx(ctx);
  if(rows.length){const dummy={sacrifices:ctx.v87CostReservations,discards:[],exiles:[],returns:[],handExiles:[],life:cost.life||0,selections:[],choices:[]};ctx.v87CostSo.oracleCostPlans.push(dummy);if(!await M.compileOracleAdditionalCosts(rows).prepareTargets({...sub,strictCostChoices:true}))return false;ctx.v87CostSo.oracleCostPlans.shift();}
  const selected=(ctx.v87CostSo.oracleCostPlans||[]).flatMap(r=>r.sacrifices.concat(r.discards,r.exiles,r.returns||[],r.handExiles||[]));ctx.oracleActivationPlanV20={sourceVersion:ctx.src.zoneVersion,sourceZone:ctx.src.zone,kind:'v87-global',rows:(ctx.v87BaseCostPlan?.rows||[]).concat(selected.map(lock)),destructiveRowsV87:destructiveRows(ctx.v87BaseCostPlan).concat(selected.map(lock))};return this.validateActivation(ctx,cost);
 };
 costs.validateActivation=function(ctx,cost){
  if(braceletCost(cost))return braceletLive(ctx,cost)&&ctx.oracleActivationPlanV20?.rows.every(current);
  if(!globalCost(cost))return originalCosts.validate.call(this,ctx,cost);
  if(!ctx.v87CostSo||ctx.src.zoneVersion!==ctx.oracleActivationPlanV20?.sourceVersion||ctx.src.zone!==ctx.oracleActivationPlanV20.sourceZone)return false;
  const combined=ctx.oracleActivationPlanV20;ctx.oracleActivationPlanV20=ctx.v87BaseCostPlan;let baseOK;try{baseOK=this.validateActivation(ctx,plainCost(cost));}finally{ctx.oracleActivationPlanV20=combined;}return baseOK&&M.validateOracleAdditionalCostPlans(auxiliaryCtx(ctx));
 };
 costs.commitActivation=async function(ctx,cost){
  if(!this.validateActivation(ctx,cost))return false;
  if(braceletCost(cost)){await ctx.g.move(cost.additionalCostV20.source,'exile',{noCmdReplace:true});return true;}
  if(!globalCost(cost))return originalCosts.commit.call(this,ctx,cost);
  const combined=ctx.oracleActivationPlanV20;ctx.oracleActivationPlanV20=ctx.v87BaseCostPlan;try{if(!await this.commitActivation(ctx,plainCost(cost)))return false;}finally{ctx.oracleActivationPlanV20=combined;}
  return M.commitOracleAdditionalCosts(auxiliaryCtx(ctx));
 };
 const decorated=new WeakSet();
 function decorateAbility(a){if(!a||decorated.has(a)||!a.cost)return;decorated.add(a);a.oraclePrintedManaV87=a.oracleOperation?.cost?.mana??a.oraclePrintedManaV87??a.cost.mana??'';if(!globalCost(a.cost))a.cost={...a.cost,additionalCostV20:{kind:'v87-global',base:a.cost.additionalCostV20}};const cond=a.cond;a.cond=(g,s,p)=>(!cond||cond(g,s,p))&&costs.activationFeasible(g,p,s,a.cost,a.cost.mana?g.abilityManaCost(p,s,typeof a.cost.mana==='function'?a.cost.mana(g,s):a.cost.mana,{ability:a}):null,a);}
 function decorateSources(g){for(const c of g.bf())for(const a of [].concat(c.def.abilities||[],c.cur?.extraAbilities||[]))decorateAbility(a);}
 const activationList=G.activatableList;G.activatableList=function(...args){decorateSources(this);return activationList.apply(this,args);};
 const activate=G.activateAbility;G.activateAbility=function(p,entry,...args){decorateAbility(entry.ability);return activate.call(this,p,entry,...args);};
 const sourceRows=G.manaSources,manaDecorated=new WeakMap();G.manaSources=function(p,forSpell,...args){for(const c of this.bf())for(const m of [].concat(c.def.mana||[],c.cur?.extraMana||[])){if(!manaDecorated.has(m))manaDecorated.set(m,{cost:m.cost,flag:m.activationPaymentV20,printed:m.oracleOperationV20?.activationCost?.mana??m.cost?.mana??''});const old=manaDecorated.get(m);m.oraclePrintedManaV87=old.printed;const rows=M.OracleV87.additionalCosts(this,c.ctrl,c,{}, {isAbility:true,ability:m,cost:old.cost||{}});m.cost=rows.length&&!globalCost(old.cost||{})?{...old.cost,additionalCostV20:{kind:'v87-global',base:old.cost?.additionalCostV20}}:old.cost;m.activationPaymentV20=rows.length||old.flag;}
  return sourceRows.call(this,p,forSpell,...args).filter(r=>!globalCost(r.extraCost||{})||costs.activationFeasible(this,p,r.card,r.extraCost,r.extraCost.mana?this.abilityManaCost(p,r.card,r.extraCost.mana,{ability:r.m}):null,r.m));};
 const abilityMana=G.abilityManaCost;G.abilityManaCost=function(p,c,raw,ctx={}){const out=abilityMana.call(this,p,c,raw,ctx);if(ctx.ability?.oracleBraceletV87)return {...out,generic:Math.max(0,out.generic-Math.max(0,c.power))};return out;};
 const costDefinitionFunctions=new WeakMap();
 function definitionCosts(def){if(!def)return def;if(def.adventure&& !costDefinitionFunctions.has(def.adventure.prepareTargets)){const prepare=def.adventure.prepareTargets;def.adventure={...def.adventure,prepareTargets:async ctx=>{if(prepare&&await prepare(ctx)===false)return false;const rows=M.OracleV87.additionalCosts(ctx.g,ctx.you,ctx.src,{...ctx.so.castOpts,adventure:true});return !rows.length||M.compileOracleAdditionalCosts(rows).prepareTargets({...ctx,strictCostChoices:true});}};costDefinitionFunctions.set(def.adventure.prepareTargets,prepare);}if(costDefinitionFunctions.has(def.castCond)&&costDefinitionFunctions.has(def.prepareTargets))return def;const cond=costDefinitionFunctions.has(def.castCond)?costDefinitionFunctions.get(def.castCond):def.castCond,prepare=costDefinitionFunctions.has(def.prepareTargets)?costDefinitionFunctions.get(def.prepareTargets):def.prepareTargets;
  def.castCond=(g,p,c,opts={})=>{if(cond&&!cond(g,p,c,opts))return false;const rows=M.OracleV87.additionalCosts(g,p,c,opts);return !rows.length||M.compileOracleAdditionalCosts(rows).castCond(g,p,c);};
  def.prepareTargets=async ctx=>{if(prepare&&await prepare(ctx)===false)return false;const rows=M.OracleV87.additionalCosts(ctx.g,ctx.you,ctx.src,ctx.so.castOpts||{});return !rows.length||M.compileOracleAdditionalCosts(rows).prepareTargets({...ctx,strictCostChoices:true});};costDefinitionFunctions.set(def.castCond,cond);costDefinitionFunctions.set(def.prepareTargets,prepare);return def;
 }
 const definitions=M.buildDefs;M.buildDefs=function(...args){const out=definitions.apply(this,args);for(const def of Object.values(out))definitionCosts(def);return out;};
 const definition=G.castDefinition;G.castDefinition=function(...args){return definitionCosts(definition.apply(this,args));};
 // Ability stickers survive exile/graveyard transitions. This is a casting
 // permission with an additional life payment, never an alternative mana cost.
 const starter=M.StarterCasting,oldStarter={offers:starter.offers,allowed:starter.allowed,prepare:starter.prepare,validate:starter.validate,commit:starter.commit};
 const graveAllowed=(g,p,c,a)=>a.starterPermission==='sticker-grave-v87'&&c.owner===p&&c.zone==='graveyard'&&c.zoneVersion===a.starterCardVersion&&c.def.castFromGraveV87&&g.canCastTiming(p,c,a)&&g.canPayLife(p,2);
 starter.offers=(g,p)=>oldStarter.offers(g,p).concat(p.graveyard.filter(c=>c.def.castFromGraveV87).flatMap(c=>M.VN.castVariants(g,c,{starterPermission:'sticker-grave-v87',starterCardVersion:c.zoneVersion,label:'Ability sticker — cast from graveyard; pay 2 life'}).map(alt=>({card:c,from:'graveyard',alt}))));
 starter.allowed=(g,p,c,a)=>a?.starterPermission==='sticker-grave-v87'?graveAllowed(g,p,c,a):oldStarter.allowed(g,p,c,a);
 starter.prepare=async(ctx,paid)=>ctx.so.castOpts?.starterPermission==='sticker-grave-v87'?graveAllowed(ctx.g,ctx.you,ctx.src,ctx.so.castOpts)&&M.compileOracleAdditionalCosts([{id:'sticker-grave-life-v87',kind:'payLife',amount:{kind:'number',value:2}}]).prepareTargets(ctx):oldStarter.prepare(ctx,paid);
 starter.validate=ctx=>ctx.so.castOpts?.starterPermission==='sticker-grave-v87'?graveAllowed(ctx.g,ctx.you,ctx.src,ctx.so.castOpts):oldStarter.validate(ctx);
 starter.commit=ctx=>ctx.so.castOpts?.starterPermission==='sticker-grave-v87'?undefined:oldStarter.commit(ctx);
 const castChoice=M.OracleV8Faces.castChoiceAllowed;M.OracleV8Faces.castChoiceAllowed=(g,p,c,a)=>a?.starterPermission==='sticker-grave-v87'?graveAllowed(g,p,c,a):castChoice(g,p,c,a);
const ruleNames=M.OracleV8NameGroups.names;M.OracleV8NameGroups.names=function(object){const c=object?.kind==='spell'?object.card:object;if(c?.faceDown&&nameStickers(c).length)return [c.name];return ruleNames(object);};
M.OracleV87.mergeStickers=(result,components)=>{const cards=[...new Set(components.map(r=>r.card||r))],rows=cards.flatMap(c=>c.meta.stickersV87||[]).sort((a,b)=>a.timestamp-b.timestamp);for(const c of cards)if(c!==result){delete c.meta.stickersV87;if(c.def.stickerBaseV87)c.def=c.def.stickerBaseV87;}if(rows.length)result.meta.stickersV87=rows;return rows;};
 const mutate=M.Mutate.resolve;M.Mutate.resolve=async function(g,so,host){const prior=host?.meta.stickersV87,incoming=so.isCopy?[]:(so.card.meta.stickersV87||[]);if(host&&incoming.length)host.meta.stickersV87=[...(prior||[]),...incoming].sort((a,b)=>a.timestamp-b.timestamp);const out=await mutate(g,so,host);if(out){if(incoming.length)delete so.card.meta.stickersV87;g.recalc();}else if(host)host.meta.stickersV87=prior;return out;};
})(MTG);
