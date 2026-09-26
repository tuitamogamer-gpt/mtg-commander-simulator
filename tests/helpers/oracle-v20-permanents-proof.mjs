import assert from 'node:assert/strict';
import {countValue as proofCount,stageCount as stageProofCount} from './oracle-v5-proof.mjs';
export function permanentTargetMatchesV20(ctx,source,target,card){
 const node=target?.v20;if(!node)return undefined;
 if(node.test==='relative-stat'){const stats=ctx.countSnapshot?.cards.get(card)||card,left=stats[node.left],right=node.right.startsWith('base ')?card.cur[node.right==='base power'?'basePower':'baseToughness']:stats[node.right];return left>right;}
 if(node.test==='greatest-stat')return card[node.stat]>=Math.max(...ctx.game.bf().filter(c=>c.is('Creature')).map(c=>c[node.stat]));
 if(node.test==='adventure')return !!card.def.adventure;
 if(node.test==='no-abilities')return !card.cur.kw.size&&!card.cur.extraAbilities.length&&!card.cur.extraTriggers.length&&!card.cur.extraMana.length&&(card.cur.abilitiesDisabled||!card.def.oracle&&!card.def.mana&&!card.def.abilities?.length&&!card.def.triggers?.length&&!card.def.statics?.length);
 assert.fail('Unknown permanent target fixture '+node.test);
}
export function stagePermanentTargetV20(M,ctx,target,index,effect,h){
 if(!target.v20)return null;
 const {v20,...base}=target,c=h.stageGenericTarget(M,ctx,base,index,effect);
 if(v20.test==='relative-stat')c.def={...c.def,power:v20.left==='power'?'3':'1',toughness:v20.left==='toughness'?'3':'1'};
 if(v20.test==='greatest-stat')c.def={...c.def,...(v20.stat==='mv'?{cost:'{30}'}:{[v20.stat]:'30000'})};
 if(v20.test==='adventure')c.def={...c.def,adventure:{name:'Witness Adventure',types:'Instant',cost:'{G}',resolve:async()=>{}}};
 if(v20.test==='no-abilities')c.def=h.fixtureDefinition(c.name,['Creature'],{power:'2',toughness:'20'});
 ctx.game.recalc();if(v20.test==='relative-stat'&&v20.right.startsWith('base '))ctx.game.addCounters(c,'+1/+1',1);return c;
}
export function stagePermanentEffectV20(M,ctx,effect,h){
 if(effect.action==='permanent-dynamic-animation-v20'){
  if(effect.operation.count.kind==='count')for(let i=0;i<2;i++)h.permanent(M,ctx.game,ctx.a,'Forest');
  return true;
 }
 if(effect.action!=='permanent-copy-event-counters-v20')return false;
 if(!ctx.permanentCounterDeparturesV20){ctx.permanentCounterDeparturesV20=[];const emit=ctx.game.emit;ctx.game.emit=async function(name,data){if(['dies','lto'].includes(name)&&data.snap)ctx.permanentCounterDeparturesV20.push({event:name,card:data.card,counters:{...data.snap.counters}});return emit.call(this,name,data);};}
 return true;
}
export async function assertPermanentEffectV20(M,ctx,entry,effect,source,targets,damaged,before,trace,label){
 if(effect.action==='permanent-dynamic-animation-v20'){
  const card=effect.animation.target==='self'?source:[targets[effect.animation.target]].flat()[0],node=effect.operation.count;
  assert.equal(card.zone,'battlefield',label+': animation resolves on the existing permanent');assert.equal(card.is('Creature'),true);for(const type of effect.animation.types)assert.equal(card.is(type),true);for(const subtype of effect.animation.subtypes)assert.equal(card.hasSub(subtype),true);for(const keyword of effect.animation.keywords)assert.equal(card.kw(keyword),true);
  const expected=()=>node.kind==='source-counters'?(card.counters[node.counter]||0):ctx.game.bf().filter(row=>row.ctrl===card.ctrl&&row.is('Land')).length;
  const check=()=>{ctx.game.recalc();assert.equal(card.cur.basePower,expected(),label+': granted definition uses live count');assert.equal(card.cur.baseToughness,expected());};
  check();const old=card.cur.basePower;if(node.kind==='source-counters')ctx.game.addCounters(card,node.counter,1);else{const land=new M.CardInst(M.DEFS.Forest,card.ctrl);land.zone='battlefield';ctx.game.battlefield.push(land);}check();assert.equal(card.cur.basePower,old+1);return true;
 }
 if(effect.action==='suspect'&&effect.target==='created-tokens'){
  const tokens=ctx.game.bf().filter(card=>card.isToken&&!before.battlefield.includes(card));assert.ok(tokens.length,label+': the created token is available to suspect');
  for(const token of tokens){assert.equal(token.meta.suspected,true,label+': created token is suspected');assert.equal(token.kw('menace'),true);assert.equal(token.cur.cantBlock,true);}return true;
 }
 if(effect.action!=='permanent-copy-event-counters-v20')return false;
 const row=ctx.permanentCounterDeparturesV20?.find(row=>row.card===(ctx.eventCard||source));assert.ok(row,label+': counters captured from actual departing permanent');
 const cards=effect.target==='self'?[source]:[targets[effect.target]].flat().filter(Boolean);
 assert.ok(cards.length,label+': counter recipient selected');
 for(const card of cards)for(const [kind,n]of Object.entries(row.counters))if(n>0&&(!effect.counter||effect.counter===kind))assert.equal(card.counters[kind]||0,(before.cards.get(card)?.counters[kind]||0)+n,label+': full '+kind+' counter amount copied'+(process.env.ORACLE_PROOF_DEBUG?' '+JSON.stringify({recipient:card.name,iid:card.iid,zone:card.zone,counters:card.counters,departing:row.card.name,source:source.name,trace:trace.filter(x=>x.query?.type==='chooseTargets').map(x=>({candidates:x.query.candidates.map(c=>c.name),result:x.result?.map(c=>c.name)}))}):''));
 return true;
}
export function stagePermanentConditionV20(M,ctx,node,source,h,value=true){
 if(node?.kind!=='permanent-condition-v20')return false;
 const {game,a,b}=ctx,add=(types=['Creature'],extras={},player=a)=>h.permanent(M,game,player,h.fixtureDefinition('Permanent condition witness '+game.bf().length,types,{power:'1',toughness:'20',...extras}));
 switch(node.test){
  case 'no-ring-bearer':for(const card of game.creatures(a))card.meta.ringBearer=false;if(!value)add().meta.ringBearer=true;break;
  case 'surveilled':a.turnState.surveilEvents=value?1:0;break;
  case 'another-flying-entry':a.turnState.oracleFlyingEntriesV20=value?[{iid:-1,version:1}]:[];break;
  case 'attacked-spacecraft':a.turnState.oracleAttackedSpacecraftV20=value;break;
  case 'shared-creature-type':if(value){for(let i=0;i<(node.min||2);i++)add(['Creature'],{subtypes:['Bear']});}else for(const c of game.creatures(a))c.def={...c.def,subtypes:[],changeling:false};break;
  case 'borrowed-permanents':if(value)for(let i=0;i<node.min;i++){const card=add(['Artifact'],{},b);M.OracleV8Control.gain(game,card,a,{});}else for(const card of game.bf().filter(card=>card.ctrl===a&&card.owner!==a))M.OracleV8Control.gain(game,card,card.owner,{});break;
  case 'not-suspected':source.meta.suspected=!value;break;
  case 'cast-ordinal':source.castMeta={...source.castMeta,wasCast:true,oracleCastOrdinalV20:value?node.n:node.n+1,oracleCastTurnV20:game.turnNo};break;
  case 'any-player-discarded':for(const p of game.players)p.turnState.discardedN=0;if(value)b.turnState.discardedN=1;break;
  case 'any-player-life-lost':for(const p of game.players)p.turnState.lifeLost=0;if(value)b.turnState.lifeLost=node.min;break;
  case 'ring-bearer':source.meta.ringBearer=value;break;
  case 'never-dealt-damage':source.meta.oracleEverDealtDamageV20=!value;break;
  case 'only-grave-creature':if(!value)h.zoneCard(M,a,'Grizzly Bears','graveyard');else for(const c of a.graveyard.filter(c=>c!==source&&c.is('Creature'))){a.graveyard.splice(a.graveyard.indexOf(c),1);c.zone='hand';a.hand.push(c);}break;
  case 'all-nonlands-white':if(value)game.untilEffects.push({expires:'eot',apply(g,bf){for(const c of bf)if(c.ctrl===a&&!c.is('Land'))c.cur.colors=['W'];}});else add(['Artifact']);break;
  case 'each-color':if(value)for(const color of ['W','U','B','R','G'])add(['Artifact'],{colorsOverride:[color]});else for(const c of game.bf().filter(c=>c.ctrl===a))c.def={...c.def,colorsOverride:[]};break;
  case 'pumped-creature':if(value)game.addCounters(add(),'+1/+1',1);else for(const c of game.creatures(a))c.counters={};break;
  case 'attacker-total':game.turnPlayer.turnState.oracleAttackersV10={turn:game.turnNo,count:value?node.min:0};break;
  case 'damage-sources':a.turnState.oracleDamageSourcesV20=value?Array.from({length:node.min},(_,i)=>'proof:'+i):[];break;
  case 'grave-creature-total':for(const p of game.players)p.turnState.oracleGraveEntriesV20=[];if(value)a.turnState.oracleGraveEntriesV20=Array.from({length:node.min},()=>({types:['Creature'],from:'hand'}));break;
  case 'instant-sorcery-cast-total':a.turnState.spellsCastList=value?Array.from({length:node.min},()=>({isInstantSorcery:true,types:['Instant']})):[];break;
  case 'no-suspected-subtype':if(value){for(const c of game.creatures(a))if(c.hasSub(node.subtype))c.meta.suspected=false;}else add(['Creature'],{subtypes:[node.subtype]}).meta.suspected=true;break;
  case 'no-permanent-left':for(const p of game.players)p.turnState.oracleDeparturesV20=[];if(!value)a.turnState.oracleDeparturesV20.push({types:['Artifact']});break;
  case 'grave-entry':a.turnState.oracleGraveEntriesV20=value?[{types:[node.type==='Permanent'?'Artifact':node.type],from:'hand'}]:[];break;
  case 'departed':case 'died-owned':case 'creature-died':for(const p of game.players)p.turnState.oracleDeparturesV20=[];if(value)a.turnState.oracleDeparturesV20.push({owner:a.idx,to:'graveyard',types:[node.type||'Creature'],subtypes:[],names:['History witness'],changeling:false});break;
  case 'typed-entry':a.turnState.oraclePermanentEntries=value?[{types:['Creature'],subtypes:node.subtypes.slice(0,1),iid:-1,version:1}]:[];break;
  case 'attacked-battle':source.meta.oracleAttackedBattleV20=value?game.turnNo:game.turnNo-1;break;
  case 'soulbond-paired':{if(!value){delete source.meta.oracleSoulbond;break;}const other=h.permanent(M,game,a,'Silverblade Paladin');for(const [one,two]of [[source,other],[other,source]])one.meta.oracleSoulbond={iid:two.iid,version:two.zoneVersion,selfVersion:one.zoneVersion,controller:a.idx,phaseEpoch:two.meta.oraclePhaseEpoch||0,selfPhaseEpoch:one.meta.oraclePhaseEpoch||0};break;}
  case 'unlocked-doors':if(value)add(['Enchantment'],{subtypes:['Room']}).meta.bdfUnlocked=['left','right'];else for(const c of game.bf())if(c.hasSub('Room'))c.meta.bdfUnlocked=[];break;
  case 'party-entry':a.turnState.oraclePermanentEntries=value?[{iid:-1,version:1,types:['Creature'],subtypes:['Wizard'],changeling:false}]:[];break;
  case 'entries':a.turnState.oraclePermanentEntries=value?Array.from({length:node.min},(_,i)=>({iid:-i-1,version:1,types:[node.type||'Creature'],subtypes:[]})):[];break;
  case 'source-received-damage':source.meta.oracleReceivedDamageV20={turn:game.turnNo,n:value?node.min:0};break;
  case 'player-damage':a.turnState.oracleDamageV20=value?node.min:0;break;
  case 'opponent-damage':for(const p of game.players)p.turnState.oracleDamageV20=0;if(value)b.turnState.oracleDamageV20=node.min;break;
  case 'own-counter-put':a.turnState.oracleCounterRecipientsV20=value?[{counter:node.counter}]:[];break;
  case 'bounced-to-you':a.turnState.oracleBouncedV20=value;break;
  case 'artifact-or-creature-died':for(const p of game.players)p.turnState.oracleArtifactCreatureDiedV20=false;if(value)b.turnState.oracleArtifactCreatureDiedV20=true;break;
  case 'linked-exile-count':case 'linked-exile-types':{game.oracleLinkedExiles=(game.oracleLinkedExiles||[]).filter(row=>row.sourceIid!==source.iid);if(value){const types=['Creature','Artifact','Enchantment','Land','Instant','Sorcery','Planeswalker','Battle'],cards=Array.from({length:node.min},(_,i)=>h.zoneCard(M,a,h.fixtureDefinition('Linked evidence '+i,[types[i]],{power:'1',toughness:'2'}),'exile'));game.oracleLinkedExiles.push({sourceIid:source.iid,sourceZoneVersion:source.zoneVersion,lifetime:'native',cards:cards.map(card=>({card,zoneVersion:card.zoneVersion}))});}break;}
  default:assert.fail('Unknown permanent condition fixture '+node.test);
 }
 game.recalc();return true;
}
export function stagePermanentCountV20(M,ctx,node,h){
 if(node?.kind==='permanent-amount-v20'&&node.test==='apocalypse-x')return true;
 if(node?.kind!=='permanent-count-v20')return false;
 const {game,a,b}=ctx,add=(player=a,extras={})=>h.permanent(M,game,player,h.fixtureDefinition('Permanent count witness '+game.bf().length,['Creature'],{power:'1',toughness:'20',...extras}));
  switch(node.test){
  case 'life-minus-opponent-max':a.life=43;for(const p of game.players.filter(p=>p!==a))p.life=37;break;
  case 'chosen-player':stageProofCount(M,{...ctx,a:b,b:a},node.count,h);break;
  case 'grave-spells-and-exile-flashback':h.zoneCard(M,a,'Lightning Bolt','graveyard');h.zoneCard(M,a,'Ancient Grudge','exile');break;
  case 'highest-life':b.life=47;break;
  case 'controlled-loyalty':{const card=h.permanent(M,game,a,h.fixtureDefinition('Counted planeswalker',['Planeswalker'],{loyalty:'3'}));card.counters.loyalty=3;break;}
  case 'opponent-max-hand':for(let i=0;i<3;i++)h.zoneCard(M,b,'Forest','hand');break;
  case 'greater-toughness-creatures':add();break;
  case 'attacked-players':{const c=add();c.attacking=b;game.combat={attackers:[c],defenders:new Map([[c.iid,b]])};break;}
  case 'opponents-lost-life':b.turnState.lifeLost=3;break;
  case 'all-life-lost':a.turnState.lifeLost=2;b.turnState.lifeLost=3;break;
  case 'player-damage':a.turnState.oracleDamageV20=3;break;
  case 'cast-types':a.turnState.oracleCastTypesV20=['Creature','Artifact','Creature'];break;
  case 'other-named-creatures':add(a,{name:node.name});break;
  default:assert.fail('Unknown permanent count fixture '+node.test);
 }
 game.recalc();return true;
}
export function permanentCountValueV20(ctx,source,node,snapshot){
 if(node?.kind==='permanent-amount-v20'&&node.test==='apocalypse-x'){const x=source.castMeta?.x||0;return x>=5?x*2:x;}
 if(node?.kind!=='permanent-count-v20')return undefined;
 const {game,a}=ctx,bf=snapshot?.battlefield||game.bf(),stats=p=>snapshot?.players.get(p)?.oraclePermanentV20||p.turnState;
  switch(node.test){
  case 'life-minus-opponent-max':return (snapshot?.players.get(a)?.life??a.life)-Math.max(...game.alivePlayers().filter(p=>p!==a).map(p=>snapshot?.players.get(p)?.life??p.life));
  case 'chosen-player':{const choice=source.meta?.oracleChosenOpponentV20,p=source.zone==='battlefield'&&choice?.version===source.zoneVersion?game.players.find(p=>!p.lost&&p.idx===choice.player):null;return p?proofCount({...ctx,a:p,b:a},source,node.count,snapshot):0;}
  case 'grave-spells-and-exile-flashback':return (snapshot?.players.get(a)?.graveyardCards||a.graveyard).filter(card=>card.def.types.includes('Instant')||card.def.types.includes('Sorcery')).length+(snapshot?.players.get(a)?.exileCards||a.exile).filter(card=>card.def.flashback!==undefined).length;
  case 'highest-life':return Math.max(...game.alivePlayers().map(p=>snapshot?.players.get(p)?.life??p.life));
  case 'controlled-loyalty':return bf.filter(card=>card.ctrl===a&&card.is('Planeswalker')).reduce((n,card)=>n+((snapshot?.cards.get(card)?.counters||card.counters).loyalty||0),0);
  case 'opponent-max-hand':return Math.max(0,...game.alivePlayers().filter(p=>p!==a).map(p=>snapshot?.players.get(p)?.hand??p.hand.length));
  case 'greater-toughness-creatures':return bf.filter(c=>c.ctrl===a&&c.is('Creature')&&(snapshot?.cards.get(c)?.toughness??c.toughness)>(snapshot?.cards.get(c)?.power??c.power)).length;
  case 'attacked-players':return new Set(bf.filter(c=>c.is('Creature')&&game.players.includes(c.attacking)).map(c=>c.attacking)).size;
  case 'opponents-lost-life':return game.players.filter(p=>p!==a&&stats(p).lifeLost>0).length;
  case 'all-life-lost':return game.players.reduce((n,p)=>n+(stats(p).lifeLost||0),0);
  case 'player-damage':return stats(a).oracleDamageV20||0;
  case 'cast-types':return new Set(stats(a).oracleCastTypesV20||[]).size;
  case 'other-named-creatures':return bf.filter(c=>c!==source&&c.is('Creature')&&!c.faceDown&&(c.rulesNames||[c.name]).includes(node.name)).length;
  default:assert.fail('Unknown permanent expected count '+node.test);
 }
}
export async function provePermanentTokenCdaV20(M,context,token,op,h){
 const {game}=context,ctx={...context,a:token.ctrl,b:game.players.find(p=>p!==token.ctrl)};
 assert.equal(token.def.oracleCharacteristicPT,true,'the token has an actual printed characteristic ability');
 const check=()=>{game.recalc();const value=h.countValue(ctx,token,op.count)*op.multiply+op.offset;if(op.power)assert.equal(token.cur.basePower,value,'dynamic token power follows its own controller');if(op.toughness)assert.equal(token.cur.baseToughness,value+op.toughnessOffset,'dynamic token toughness includes the printed offset');return value;};
 const before=check(),node=op.count;
 if(node.kind==='life-total')await game.gainLife(ctx.a,3,token);
 else if(node.kind==='count'&&node.unique==='types')h.zoneCard(M,ctx.a,h.fixtureDefinition('Token CDA new card type',['Battle']),'graveyard');
 else if(node.kind==='count'&&node.zone==='battlefield')h.stageGenericTarget(M,ctx,node.filters?.[0]||{what:node.what,zone:'battlefield',controller:'you'},'token-cda-live');
 else if(node.kind==='count'&&node.zone==='graveyard')h.zoneCard(M,ctx.a,'Grizzly Bears','graveyard');
 else if(node.kind==='count'&&node.zone==='hand'||node.kind==='sum'&&node.values.every(row=>row.kind==='count'&&row.zone==='hand'))h.zoneCard(M,ctx.a,'Forest','hand');
 else if(node.kind==='permanent-count-v20'&&node.test==='grave-spells-and-exile-flashback')h.zoneCard(M,ctx.a,'Opt','graveyard');
 else assert.fail('Unstaged token CDA live transition '+JSON.stringify(node));
 assert.ok(check()>before,'a later real zone or life change increases the existing token, without creating another token');
 return 5;
}
export async function operationProofV20(M,entry,op,role,h){
 if(op.kind==='generic-trigger'&&op.permanentGraveTriggerV20){
  let checks=0;for(const stale of [false,true]){const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,20);const rule=op.permanentGraveTriggerV20,source=op.zone==='battlefield'?h.permanent(M,game,a,entry.raw.name):h.zoneCard(M,a,entry.raw.name,'graveyard'),life=a.life;
   const enter=async(player,name,zone='hand',controller=player)=>{const card=h.zoneCard(M,player,name,zone);await game.putPermanentOntoBattlefield(card,controller);return card;};
   if(rule==='gate'){await enter(b,'Azorius Guildgate');await enter(a,'Forest');await h.resolveAll(game);assert.equal(source.zone,'graveyard');await enter(a,'Azorius Guildgate');}
   else if(rule==='second-creature'){const cast=async name=>{const card=h.zoneCard(M,a,name,'hand');assert.equal(await game.castSpell(a,card,{from:'hand'}),true);return card;};await cast('Llanowar Elves');await h.resolveAll(game);await cast('Opt');await h.resolveAll(game);assert.equal(source.zone,'graveyard');await cast('Grizzly Bears');await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===source));const flash=h.zoneCard(M,a,h.fixtureDefinition('Flash creature witness',['Creature'],{cost:'{G}',power:'1',toughness:'1',kws:['flash']}),'hand');assert.equal(await game.castSpell(a,flash,{from:'hand'}),true);assert.equal(a.turnState.spellsCastList.filter(row=>row.isCreature).length,3);}
   else if(rule==='only-creature'){const other=h.zoneCard(M,a,'Grizzly Bears','graveyard');await game.emit('upkeep',{player:a});await h.resolveAll(game);assert.equal(source.zone,'graveyard');await game.move(other,'hand');await game.emit('upkeep',{player:b});await h.resolveAll(game);assert.equal(source.zone,'graveyard');await game.emit('upkeep',{player:a});}
   else if(rule==='dual-zone-life'){await game.emit('upkeep',{player:b});await h.resolveAll(game);assert.equal(a.life,life);await game.emit('upkeep',{player:a});}
   else if(rule==='exile-black'){h.zoneCard(M,a,'Grizzly Bears','graveyard');await game.emit('upkeep',{player:a});await h.resolveAll(game);assert.equal(source.zone,'graveyard','the source cannot exile itself, and a green card cannot pay');ctx.black=h.zoneCard(M,a,'Walking Corpse','graveyard');await game.emit('upkeep',{player:b});await h.resolveAll(game);assert.equal(source.zone,'graveyard');await game.emit('upkeep',{player:a});}
   else if(rule==='entered-from-grave'){await enter(b,'Grizzly Bears','graveyard');await enter(a,'Grizzly Bears');await h.resolveAll(game);assert.equal(game.delayed.length,0);await enter(a,'Grizzly Bears','graveyard',b);}
   else if(rule==='scry-exile'){await M.E.scry(game,a,1);await h.resolveAll(game);assert.equal(source.zone,'graveyard');h.permanent(M,game,a,'Island');await M.E.scry(game,b,1);await h.resolveAll(game);assert.equal(source.zone,'graveyard');await M.E.scry(game,a,1);}
   else if(rule==='milled-exile'){await game.move(source,'hand');await game.discard(a,[source]);await h.resolveAll(game);assert.equal(a.life,life);await game.move(source,'library');await game.mill(a,1);}
   else assert.fail('Unproved grave trigger '+rule);
   await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===source),'the qualifying event queues the printed trigger');
   if(stale){await game.move(source,'exile');await game.move(source,op.zone==='battlefield'?'battlefield':'graveyard',{ctrl:a});}
   await h.resolveAll(game);
   if(rule==='entered-from-grave'){assert.equal(source.zone,'graveyard');assert.ok(game.delayed.length);await game.emit('endStep',{player:b});await h.resolveAll(game);}
   if(rule==='dual-zone-life')assert.equal(a.life,life+(stale?0:1));
   else if(rule==='milled-exile'){assert.equal(source.zone,stale?'graveyard':'exile');assert.equal(a.life,life+(stale?0:3));assert.equal(b.life,40-(stale?0:3));}
   else if(rule==='scry-exile'){assert.equal(source.zone,stale?'graveyard':'exile');assert.equal(a.hand.length,stale?0:1);}
   else {assert.equal(source.zone,stale?'graveyard':rule==='gate'?'library':'battlefield');if(!stale&&rule==='gate')assert.equal(a.library.at(-1).iid,source.iid);if(!stale&&rule==='entered-from-grave')assert.equal(source.tapped,true);if(rule==='exile-black'){assert.equal(ctx.black.zone,stale?'graveyard':'exile');if(!stale){await game.emit('endStep',{player:b});await h.resolveAll(game);assert.equal(source.zone,'graveyard','the returned Ichorid sacrifices itself at the end step');}}}
   checks+=8;
  }return checks;
 }
 const alternateCondition=op.condition?.kind==='cast-flag-v10'?op.condition:op.effects?.length===1&&op.effects[0].action==='conditional'&&op.effects[0].condition?.kind==='cast-flag-v10'?op.effects[0].condition:null;
 if(op.kind==='generic-trigger'&&alternateCondition&&['spectacle','surge'].includes(alternateCondition.flag)&&(op.effects[0]?.action==='damage'||op.effects[0]?.effects?.some(effect=>effect.action==='discard-hand'))){
  let checks=0;for(const paid of [false,true]){const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,20);if(alternateCondition.flag==='spectacle')await game.loseLife(b,1,'enable spectacle');else {const spell=h.zoneCard(M,a,'Opt','hand');assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await h.resolveAll(game);}for(let i=0;i<4;i++)h.zoneCard(M,a,'Forest','hand');const old=a.hand.slice(),life=b.life,decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:decide(g,q);const source=h.zoneCard(M,a,entry.raw.name,'hand'),option=paid?game.castableList(a).find(row=>row.card===source&&row.alt?.[alternateCondition.flag]):null;if(paid)assert.ok(option);assert.equal(await game.castSpell(a,source,{from:'hand',...(paid?{alt:option.alt}:{})}),true);await h.resolveAll(game);assert.equal(!!source.castMeta.alt?.[alternateCondition.flag],paid);if(op.effects[0].action==='damage')assert.equal(b.life,life-(paid?op.effects[0].n:0));else {assert.equal(old.filter(card=>card.zone==='graveyard').length,paid?old.length:1);assert.equal(a.hand.length,paid?3:old.length);assert.equal(a.hand.filter(card=>!old.includes(card)).length,paid?3:1);}checks+=6;}return checks;
 }
 if(op.kind==='generic-trigger'&&op.condition?.test==='event-creature-mana'){
  let checks=0;for(const n of [2,3]){const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fillLibrary(M,a,20);h.permanent(M,game,a,entry.raw.name);for(let i=0;i<3;i++){const producer=h.permanent(M,game,a,i<n?'Llanowar Elves':'Forest'),mana=game.manaSources(a).find(row=>row.card===producer&&row.produce?.some(value=>value.G===1));assert.ok(mana);assert.equal(await game.activateManaSource(a,mana,mana.produce.find(value=>value.G===1)),true);}const card=h.zoneCard(M,a,h.fixtureDefinition('Creature mana witness',['Creature'],{cost:'{3}',power:'1',toughness:'2'}),'hand');assert.equal(await game.castSpell(a,card,{from:'hand'}),true);assert.equal(card.castMeta.oracleCreatureManaV20,n,'the printed trigger observes the mana actually produced by creatures');await h.resolveAll(game);assert.equal(a.hand.length,n>=3?1:0);checks+=6;}return checks;
 }
 if(op.kind==='generic-trigger'&&op.condition?.test==='cast-ordinal'){
  let checks=0;for(const ordinal of [1,2,3]){const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,20);const target=h.permanent(M,game,a,'Grizzly Bears'),decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:decide(g,q);for(let i=1;i<ordinal;i++){const spell=h.zoneCard(M,a,'Opt','hand');assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await h.resolveAll(game);}const source=h.zoneCard(M,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(target.counters['+1/+1']||0,ordinal===2?1:0);assert.equal(source.castMeta.oracleCastOrdinalV20,ordinal);checks+=4;}return checks;
 }
 if(op.kind==='generic-trigger'&&op.condition?.kind==='cast-flag-v10'&&['spectacle','surge'].includes(op.condition.flag)){
  let checks=0;for(const paid of [false,true]){const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,20);for(let i=0;i<3;i++)h.zoneCard(M,b,'Forest','hand');const host=h.permanent(M,game,a,'Grizzly Bears'),other=h.permanent(M,game,b,'Grizzly Bears');if(op.condition.flag==='spectacle')await game.loseLife(b,1,'enable spectacle');else {const prior=h.zoneCard(M,a,'Opt','hand');assert.equal(await game.castSpell(a,prior,{from:'hand'}),true);await h.resolveAll(game);}const source=h.zoneCard(M,a,entry.raw.name,'hand'),option=paid?game.castableList(a).find(row=>row.card===source&&row.alt?.[op.condition.flag]):null;if(paid)assert.ok(option,'the printed alternate cost is genuinely offered');assert.equal(await game.castSpell(a,source,{from:'hand',...(paid?{alt:option.alt}:{})}),true);await h.resolveAll(game);assert.equal(!!source.castMeta.alt?.[op.condition.flag],paid);if(op.condition.flag==='spectacle')assert.equal(b.hand.length,paid?2:3);else {assert.equal(host.power,paid?3:2);assert.equal(host.kw('haste'),paid);assert.equal(other.power,2);assert.equal(source.power,Number(entry.raw.power));}checks+=5;}return checks;
 }
 if(op.kind==='permanent-discard-replacement-v20'){
  let checks=0;for(const order of ['alone','self','exile']){const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(b,100);const source=op.subject==='self'?h.zoneCard(M,a,entry.raw.name,'hand'):h.permanent(M,game,a,entry.raw.name),card=op.subject==='self'?source:h.zoneCard(M,a,'Grizzly Bears','hand');if(order==='alone'){await game.discard(a,[card]);await h.resolveAll(game);assert.equal(card.zone,'graveyard','your own discard does not qualify');await game.move(card,'hand');}else h.permanent(M,game,b,'Rest in Peace');const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>{if(q.type==='chooseOption'&&q.aiHint?.kind==='replacementOrder'){const i=q.options.findIndex(row=>order==='exile'?row.label.startsWith('Rest in Peace'):row.label.startsWith(source.name));return q.options[Math.max(0,i)].key;}if(q.type==='chooseOption'&&q.options.some(row=>row.key==='yes'))return 'yes';return decide(g,q);};game.turnPlayer=b;const spell=h.zoneCard(M,b,'Mind Rot','hand');assert.equal(await game.castSpell(b,spell,{from:'hand'}),true);await h.resolveAll(game);const expected=op.subject==='controller'?'library':order==='exile'?'exile':'battlefield';assert.equal(card.zone,expected,'the affected player orders all applicable discard replacements');if(expected==='battlefield'){assert.equal(card.ctrl.idx,a.idx);assert.equal(card.counters['+1/+1']||0,op.n);}if(expected==='library')assert.equal(a.library.at(-1)?.iid,card.iid);assert.equal(a.turnState.discardedN,order==='alone'?2:1,'replacement does not stop this being a discard');checks+=5;}return checks;
 }
 if(op.kind==='generic-trigger'&&op.permanentOpponentDiscardV20){
  let checks=0;
  for(const stale of [false,...(op.effects.some(effect=>effect.action==='permanent-discard-return-v20')?[true]:[])]){
   const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(b,100);h.fillLibrary(M,a,20);
   const source=op.zone==='event-source-v20'?h.zoneCard(M,a,entry.raw.name,'hand'):h.permanent(M,game,a,entry.raw.name),card=op.zone==='event-source-v20'?source:h.zoneCard(M,a,'Grizzly Bears','hand'),effect=op.effects[0];
   if(op.condition)h.stageCondition(M,ctx,op.condition,source,h.v8Helpers());
   const before=a.life,opponentBefore=b.life,decide=a.controller.decide.bind(a.controller);
   if(effect.action==='damage')a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:decide(g,q);
   await game.discard(a,[card]);await h.resolveAll(game);assert.equal(game.bf().filter(row=>row.isToken).length,0);assert.equal(a.life,before);assert.equal(b.life,opponentBefore,'a voluntary discard does not cause opponent-discard damage');assert.equal(card.zone,'graveyard');
   await game.move(card,'hand');game.turnPlayer=b;const spell=h.zoneCard(M,b,'Mind Rot','hand');assert.equal(await game.castSpell(b,spell,{from:'hand'}),true);await game.resolveTop();await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===source));
   if(stale){await game.move(source,'exile');await game.move(source,'graveyard');}await h.resolveAll(game);
   if(effect.action==='permanent-discard-return-v20'){if(effect.delay){assert.equal(source.zone,'graveyard');await game.emit('endStep',{player:b});await h.resolveAll(game);}assert.equal(source.zone,stale?'graveyard':effect.to);if(!stale&&effect.counter)assert.equal(source.counters[effect.counter],effect.n);}
   else if(effect.action==='token-inline'){const tokens=game.bf().filter(row=>row.isToken);assert.equal(tokens.length,effect.n);for(const token of tokens){assert.equal(token.power,Number(effect.token.power));assert.equal(token.toughness,Number(effect.token.toughness));for(const keyword of effect.token.keywords)assert.equal(token.kw(keyword),true);}}
   else if(effect.action==='damage'){assert.equal(b.life,opponentBefore-effect.n,'the real opponent-discard trigger deals its exact printed damage');assert.equal(a.life,before);assert.equal(a.hand.length,0,'discard damage does not draw a card');}
   else if(effect.action==='gain-life'){assert.equal(a.life,before+effect.n);assert.equal(a.hand.length,1,'the optional follow-up draw resolves after the discard');}
   else assert.fail('Unsupported opponent-discard proof effect: '+effect.action);
   checks+=8;
  }
  return checks;
 }
 if(op.kind==='permanent-static-v20'&&op.rule==='source-colors'){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);const source=h.permanent(M,game,a,entry.raw.name),printed=source.colors.slice(),gy=Array.from({length:7},()=>h.zoneCard(M,a,'Forest','graveyard'));game.recalc();assert.deepEqual(source.colors,op.colors);await game.move(gy[0],'hand');assert.deepEqual(source.colors,printed);assert.equal(source.is('Creature'),true);return 4;
 }
 if(op.kind==='permanent-static-v20'&&op.rule==='food-creatures'){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);const source=h.permanent(M,game,a,entry.raw.name),own=h.permanent(M,game,a,'Grizzly Bears'),opposing=h.permanent(M,game,b,'Grizzly Bears'),rock=h.permanent(M,game,a,'Sol Ring');for(const card of [own,opposing]){assert.equal(card.is('Artifact'),true);assert.equal(card.hasSub('Food'),true);assert.equal(card.is('Creature'),true);}assert.equal(source.hasSub('Food'),false);assert.equal(rock.hasSub('Food'),false);const life=a.life,food=game.activatableList(a).find(row=>row.card===own&&row.ability?.oracleOperation?.effects?.some(effect=>effect.action==='gain-life'));assert.ok(food);assert.equal(await game.activateAbility(a,food),true);await h.resolveAll(game);assert.equal(own.zone,'graveyard');assert.equal(a.life,life+3);assert.equal(source.counters['+1/+1'],2,'the sacrificed creature really was a Food');await game.move(source,'hand');assert.equal(opposing.hasSub('Food'),false);assert.equal(opposing.is('Artifact'),false);return 14;
 }
 if(op.kind==='generic-static'&&op.grantedOperation?.permanentFirstTapV20){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);const host=h.permanent(M,game,a,'Grizzly Bears');game.tap(host);await h.resolveAll(game);h.permanent(M,game,a,entry.raw.name);game.untap(host);game.tap(host);await h.resolveAll(game);assert.equal(host.counters['+1/+1']||0,0,'tapping before gaining the ability still consumes the first tap');game.turnNo++;game.untap(host);game.tap(host);await h.resolveAll(game);assert.equal(host.counters['+1/+1'],1);game.untap(host);game.tap(host);await h.resolveAll(game);assert.equal(host.counters['+1/+1'],1);game.turnNo++;game.turnPlayer=b;game.untap(host);game.tap(host);await h.resolveAll(game);assert.equal(host.counters['+1/+1'],1,'only your own turn qualifies');return 5;
 }
 if(op.kind==='generic-static'&&op.grantedOperation&&op.filters?.[0]?.controller==='opponent'&&op.grantedOperation.event==='targeted'){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.permanent(M,game,a,entry.raw.name);const own=h.permanent(M,game,a,'Grizzly Bears'),other=h.permanent(M,game,b,'Grizzly Bears'),decide=a.controller.decide.bind(a.controller);for(const target of [own,other]){a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:decide(g,q);const spell=h.zoneCard(M,a,'Giant Growth','hand');assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await h.resolveAll(game);assert.equal(target.zone,target===own?'battlefield':'graveyard');}return 5;
 }
 if(op.kind==='generic-static'&&op.typeChange?.colors&&op.grantedOperation){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);const source=h.permanent(M,game,a,entry.raw.name),printed=source.colors.slice(),ability=()=>game.activatableList(a).find(row=>row.card===source&&row.ability?.oracleOperation===op.grantedOperation);assert.deepEqual(source.colors,printed);assert.equal(ability(),undefined);const gy=Array.from({length:7},()=>h.zoneCard(M,a,'Forest','graveyard'));game.recalc();assert.deepEqual(source.colors,op.typeChange.colors);assert.equal(source.is('Creature'),true);const target=h.permanent(M,game,b,h.fixtureDefinition('Black target',['Creature'],{colorsOverride:['B'],power:'2',toughness:'2'})),decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:decide(g,q);assert.ok(ability());assert.equal(await game.activateAbility(a,ability()),true);await h.resolveAll(game);assert.equal(target.zone,'graveyard');await game.move(gy[0],'hand');game.untap(source);game.recalc();assert.deepEqual(source.colors,printed);assert.equal(ability(),undefined);return 9;
 }
 if(op.kind==='generic-static'&&op.grantedOperation&&JSON.stringify(op.grantedOperation).includes('"action":"permanent-self-return-v20"')){
  let checks=0;for(const stale of [false,true]){const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);const source=h.permanent(M,game,a,entry.raw.name);await game.destroy(source);await h.resolveAll(game);assert.equal(source.zone,'graveyard','without threshold the return trigger is absent');await game.putPermanentOntoBattlefield(source,a);for(let i=0;i<7;i++)h.zoneCard(M,a,'Forest','graveyard');game.recalc();const before=Object.values(a.pool).reduce((n,x)=>n+x,0);await game.destroy(source);await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===source));if(stale){await game.move(source,'exile');await game.move(source,'graveyard');}await h.resolveAll(game);assert.equal(source.zone,stale?'graveyard':'battlefield');assert.equal(Object.values(a.pool).reduce((n,x)=>n+x,0),before-2,'the optional return actually pays WW');checks+=5;}return checks;
 }
 if(op.kind==='generic-trigger'&&op.event==='lifeLost'&&op.effects?.some(effect=>effect.action==='conditional'&&effect.effects?.some(child=>child.action==='lose-game-v10'))){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);const source=h.permanent(M,game,a,entry.raw.name);for(let i=0;i<3;i++)h.zoneCard(M,a,'Forest','hand');await game.loseLife(b,2,'opposing loss');await h.resolveAll(game);assert.equal(a.hand.length,3);await game.loseLife(a,2,'own loss');await h.resolveAll(game);assert.equal(a.hand.length,1,'the triggered loss discards exactly the life lost');assert.equal(a.graveyard.length,2);assert.equal(a.lost,false);await game.loseLife(a,1,'last card');await h.resolveAll(game);assert.equal(a.hand.length,0);assert.equal(a.lost,true,'discarding the final card causes actual elimination');return 7;
 }
 if(op.kind==='permanent-native-trigger-v20'){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fillLibrary(M,a,30);h.fillLibrary(M,b,30);const source=h.permanent(M,game,a,entry.raw.name);source.sick=false;const decide=a.controller.decide.bind(a.controller);
  if(op.nativeSubject==='crewer'){
   const vehicle=h.permanent(M,game,a,"Smuggler's Copter"),other=h.permanent(M,game,a,'Grizzly Bears'),effect=op.effects[0];a.controller.decide=(g,q)=>q.type==='attackers'?[]:q.type==='chooseCards'&&q.aiHint?.kind==='crew'?[source]:decide(g,q);
   assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===vehicle&&row.crew)),true);assert.equal(source.tapped,true);assert.ok(game.stack.some(row=>row.srcCard===source),'the printed trigger is queued by paying the crew cost');const crew=game.stack.find(row=>row.srcCard===vehicle);assert.ok(crew);await game.counterStackObject(crew);await h.resolveAll(game);
   assert.equal(vehicle.is('Creature'),false,'countering Crew does not undo having crewed');for(const keyword of effect.keywords)assert.equal(vehicle.kw(keyword),true);assert.equal(vehicle.power,3+effect.power);assert.equal(vehicle.toughness,3+effect.toughness);
   a.controller.decide=(g,q)=>q.type==='attackers'?[]:q.type==='chooseCards'&&q.aiHint?.kind==='crew'?[other]:decide(g,q);assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===vehicle&&row.crew)),true);assert.equal(game.stack.some(row=>row.srcCard===source),false,'another creature crewing does not cause this ability');await h.resolveAll(game);assert.equal(vehicle.power,3+effect.power);await game.runTurn();for(const keyword of effect.keywords)assert.equal(vehicle.kw(keyword),false);assert.equal(vehicle.power,3);return 9;
  }
  const helper=h.permanent(M,game,a,'Grizzly Bears');helper.sick=false;let scried=0;a.controller.decide=(g,q)=>{if(q.type==='attackers')return [{card:source,target:b}];if(q.type==='chooseCards'&&q.aiHint?.kind==='enlist')return [helper];if(q.type==='scry')scried+=q.cards.length;return decide(g,q);};await game.combatPhase(a);await h.resolveAll(game);assert.equal(helper.tapped,true);assert.equal(scried,op.effects[0].n);assert.equal(source.power,4);return 5;
 }
 if(op.kind==='generic-trigger'&&op.permanentEntryFromV20){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fillLibrary(M,a,20);const self=op.eventFilter==='self',source=self?h.zoneCard(M,a,entry.raw.name,'hand'):h.permanent(M,game,a,entry.raw.name),host=self?source:h.zoneCard(M,a,'Grizzly Bears','hand');await game.putPermanentOntoBattlefield(host,a);await h.resolveAll(game);assert.equal(self?host.ctrl.idx:source.attachedTo,self?a.idx:null,'entry from hand does not qualify');await game.move(host,'graveyard');await game.putPermanentOntoBattlefield(host,a);await h.resolveAll(game);assert.equal(self?host.ctrl.idx:source.attachedTo,self?b.idx:host.iid,'entry from the required graveyard causes the real printed effect');
  if(!self){const opposing=h.zoneCard(M,b,'Grizzly Bears','graveyard');await game.putPermanentOntoBattlefield(opposing,b);await h.resolveAll(game);assert.equal(source.attachedTo,host.iid,'an opposing graveyard is excluded');await game.move(host,'graveyard');await game.putPermanentOntoBattlefield(host,a);await game.flushTriggers();await game.move(host,'exile');await game.putPermanentOntoBattlefield(host,a);await h.resolveAll(game);assert.equal(source.attachedTo,null,'a new entrant incarnation is not the original trigger object');}
  return self?4:7;
 }
 if(op.kind==='generic-trigger'&&op.permanentAuraSpellV20){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,20);const source=h.permanent(M,game,a,entry.raw.name),decide=a.controller.decide.bind(a.controller);source.def={...source.def,toughness:'20'};game.recalc();a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(source)?[source]:decide(g,q);
  for(const [name,draws]of [['Lightning Bolt',0],['Pacifism',1]]){const spell=h.zoneCard(M,a,name,'hand'),before=a.hand.length;assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await h.resolveAll(game);assert.equal(a.hand.length,before-1+draws,name+': only Aura spells cause the draw');}return 4;
 }
 if(op.kind==='generic-trigger'&&op.zone==='hand'&&op.event==='cardLeftGraveyard'){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);const source=h.zoneCard(M,a,entry.raw.name,'graveyard'),life=a.life;await game.move(source,'exile');await h.resolveAll(game);assert.equal(a.life,life);await game.move(source,'graveyard');await game.move(source,'hand');await h.resolveAll(game);assert.equal(a.life,life+2);await game.move(source,'library');await game.move(source,'hand');await h.resolveAll(game);assert.equal(a.life,life+2);return 4;
 }
 if(op.kind==='generic-trigger'&&op.zone==='graveyard'&&op.event==='cardToGraveyard'&&op.eventFilter?.subject==='self'&&op.effects?.[0]?.action==='reanimate'){
  let checks=0;for(const stale of [false,true]){const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);const source=h.zoneCard(M,a,entry.raw.name,'hand');await game.discard(a,[source]);await h.resolveAll(game);assert.equal(source.zone,'graveyard','discarding is not milling');await game.move(source,'library');await game.mill(a,1);await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===source));if(stale){await game.move(source,'exile');await game.move(source,'graveyard');}await h.resolveAll(game);assert.equal(source.zone,stale?'graveyard':'battlefield','the milled card must retain its graveyard incarnation');checks+=4;}return checks;
 }
 if(op.kind==='generic-trigger'&&op.zone==='event-source-v20'&&op.event==='discarded'&&op.effects?.[0]?.action==='reflexive-cost'){
  let checks=0;for(const branch of ['unpaid','paid','stale-target']){const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);a.pool.B=branch==='unpaid'?0:1;const source=h.zoneCard(M,a,entry.raw.name,'hand'),target=h.zoneCard(M,a,'Grizzly Bears','graveyard'),decide=a.controller.decide.bind(a.controller);let selected=0;a.controller.decide=(g,q)=>{if(q.type==='chooseTargets'&&q.candidates.includes(target)){selected++;return [target];}return decide(g,q);};await game.move(source,'graveyard');await h.resolveAll(game);assert.equal(selected,0);await game.move(source,'hand');await game.discard(a,[source]);await game.flushTriggers();assert.equal(selected,0,'the initial discard trigger does not choose the later reflexive target');assert.ok(game.stack.some(row=>row.srcCard===source));await game.resolveTop();await game.flushTriggers();if(branch==='unpaid'){assert.equal(selected,0);assert.equal(game.stack.length,0);}else {assert.equal(selected,1);assert.equal(a.pool.B,0,'the printed black mana is paid before the new trigger is created');assert.ok(game.stack.some(row=>row.srcCard===source));if(branch==='stale-target'){await game.move(target,'exile');await game.move(target,'graveyard');}}await h.resolveAll(game);assert.equal(source.zone,'graveyard');assert.equal(target.zone,branch==='paid'?'hand':'graveyard');checks+=7;}return checks;
 }
 if(op.kind==='generic-trigger'&&op.zone==='event-source-v20'&&op.event==='discarded'&&op.effects?.length===1&&(op.effects[0].action==='token-key'&&op.effects[0].tokenKey==='food'||op.effects[0].action==='token-inline'&&op.effects[0].token.subtypes?.includes('Food'))){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);const source=h.zoneCard(M,a,entry.raw.name,'hand'),food=()=>game.bf().filter(card=>card.ctrl===a&&card.hasSub('Food')).length;await game.move(source,'graveyard');await h.resolveAll(game);assert.equal(food(),0);await game.move(source,'hand');await game.discard(a,[source]);await h.resolveAll(game);assert.equal(food(),1);const replacement=h.permanent(M,game,a,h.fixtureDefinition('Discard replacement',['Enchantment'],{discardToLibraryTop:true})),decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseOption'&&q.options.some(row=>row.key==='top')?'top':decide(g,q);await game.move(source,'hand');await game.discard(a,[source]);await h.resolveAll(game);assert.equal(source.zone,'library');assert.equal(food(),2,'the self-discard trigger follows the discard even through a replacement');assert.equal(replacement.zone,'battlefield');return 7;
 }
 if(op.kind==='generic-trigger'&&(op.permanentCastCountV20||op.permanentFirstCastV20||op.permanentCopyAlsoV20)){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);for(const player of [a,b]){h.fund(player,100);h.fillLibrary(M,player,30);}const source=h.permanent(M,game,a,entry.raw.name),cast=async(player,name='Opt')=>{game.turnPlayer=player;game.phase='main1';const card=h.zoneCard(M,player,name,'hand');assert.equal(await game.castSpell(player,card,{from:'hand'}),true);return card;};
  if(op.permanentCastCountV20){const life=b.life;for(let i=1;i<=2;i++){await cast(b);await h.resolveAll(game);assert.equal(b.life,life-i*(i+1)/2);}const before=b.life;await cast(b,'Grizzly Bears');await h.resolveAll(game);assert.equal(b.life,before-(op.permanentCastCountV20==='all'?3:0));for(const player of [a,b])player.turnState=player.freshTurnState();await cast(b);await h.resolveAll(game);assert.equal(b.life,before-(op.permanentCastCountV20==='all'?3:0)-1);return 8;}
  if(op.permanentCopyAlsoV20){const life=b.life,ownLife=a.life,spell=await cast(b),stack=game.stack.find(row=>row.card===spell);assert.ok(stack);await game.copySpell(stack,b,{mayNewTargets:false});await game.copySpell(stack,a,{mayNewTargets:false});await h.resolveAll(game);assert.equal(b.life,life-2,'casting and an opposing copy each trigger; your own copy does not');assert.equal(a.life,ownLife);return 6;}
  if(op.permanentFirstCastV20.quality==='noncreature'){const before=b.hand.length;await cast(b,'Grizzly Bears');await h.resolveAll(game);assert.equal(b.hand.length,before);const first=await cast(b);await h.resolveAll(game);assert.equal(first.zone,'graveyard');assert.equal(b.hand.length,before,'the first noncreature spell is countered');const hand=a.hand.length;await cast(a);await h.resolveAll(game);assert.equal(a.hand.length,hand+1,'the second noncreature spell resolves even for another player');return 7;}
  const spellDef=h.fixtureDefinition('Multicolored cast witness',['Sorcery'],{cost:'{G}{U}',colorsOverride:['G','U']});for(const [player,draw]of [[b,true],[b,false],[a,true]]){const first=a.hand.length,second=b.hand.length;await cast(player,spellDef);await h.resolveAll(game);assert.equal(a.hand.length,first+(draw&&player!==a?1:0));assert.equal(b.hand.length,second+(draw&&player!==b?1:0));}return 9;
 }
 if(op.kind==='generic-ability'&&op.effects?.[0]?.action==='permanent-borrow-abilities-v20'){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,30);const donor=h.permanent(M,game,b,'Prodigal Sorcerer'),source=h.permanent(M,game,a,entry.raw.name),decide=a.controller.decide.bind(a.controller);source.sick=false;a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(donor)?[donor]:decide(g,q);assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===source&&!row.ability?.oracleBorrowedV20)),true);await h.resolveAll(game);const granted=()=>game.activatableList(a).find(row=>row.card===source&&row.ability?.oracleBorrowedV20);assert.ok(granted());await game.move(donor,'hand');assert.ok(granted(),'the resolving gain snapshots abilities and survives donor removal');a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:decide(g,q);const life=b.life;assert.equal(await game.activateAbility(a,granted()),true);await h.resolveAll(game);assert.equal(b.life,life-1);source.tapped=false;await game.runTurn();assert.equal(granted(),undefined,'temporary inherited abilities expire at cleanup');return 7;
 }
 if(op.kind==='permanent-choose-object-v20'||op.kind==='permanent-static-v20'&&['disable-chosen-activation','disable-nonmana'].includes(op.rule)){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fund(b,100);h.fillLibrary(M,a,20);const selected=h.permanent(M,game,b,h.fixtureDefinition('Selected permanent',[op.rule==='disable-nonmana'?'Land':'Artifact'],{abilities:M.DEFS['Prodigal Sorcerer'].abilities,mana:M.DEFS['Llanowar Elves'].mana,kws:['shroud']})),other=h.permanent(M,game,a,h.fixtureDefinition('Unaffected permanent',['Artifact'],{abilities:M.DEFS['Prodigal Sorcerer'].abilities}));const source=h.zoneCard(M,a,entry.raw.name,'hand'),decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseCards'&&q.from.includes(selected)?[selected]:decide(g,q);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);
  assert.equal(game.activatableList(b).some(row=>row.card===selected&&row.ability),false);assert.equal(game.manaSources(b).some(row=>row.card===selected),op.rule==='disable-nonmana');assert.ok(game.activatableList(a).some(row=>row.card===other),'unselected permanent retains its own activated ability');
  if(op.rule!=='disable-nonmana'){assert.equal(source.meta.oracleChosenObjectV20.iid,selected.iid,'entry choice can name a permanent with shroud');await game.move(selected,'hand');await game.putPermanentOntoBattlefield(selected,b);assert.ok(game.activatableList(b).some(row=>row.card===selected&&row.ability),'a returning chosen object is a new permanent');}
  M.OracleV8AbilityLoss.add(game,[source],{});assert.ok(game.activatableList(b).some(row=>row.card===selected&&row.ability));return 7;
 }
 if(op.kind==='permanent-static-v20'&&op.rule==='borrow-abilities'){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,30);
  const ping=M.DEFS['Prodigal Sorcerer'].abilities[0],mana=M.DEFS['Llanowar Elves'].mana,types=op.filter.what==='land'?['Land']:['Artifact','Creature'];
  const donorDef=h.fixtureDefinition('Borrowed ability witness',types,{cost:'{2}',super:op.filter.legendary?['Legendary']:[],subtypes:op.filter.subtype?[op.filter.subtype]:[],power:'2',toughness:'20',abilities:[ping],mana});
  const controller=op.filter.controller==='opponent'?b:a,acquire=entry.implementation.find(row=>row.effects?.some(effect=>effect.action==='linked-exile'||effect.action==='exile-reflexive-v20'));
  const zone=['battlefield','chosen'].includes(op.zone)?'battlefield':op.zone==='graveyard'?'graveyard':op.zone==='top'?'library':op.zone==='craft'?'exile':acquire?.targets?.[0]?.zone;
  assert.ok(zone,'borrowed source is staged in its printed acquisition zone');
  const donor=zone==='battlefield'?h.permanent(M,game,controller,donorDef):h.zoneCard(M,controller,donorDef,zone);
  if(op.filter.hasCounter)game.addCounters(donor,op.filter.hasCounter,1);
  const source=h.zoneCard(M,a,entry.raw.name,'hand'),decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseCards'&&op.zone==='chosen'&&q.from.includes(donor)?[donor]:q.type==='chooseTargets'&&q.candidates.includes(donor)?[donor]:q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:decide(g,q);
  assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);source.sick=false;
  if(op.zone==='linked'&&donor.zone!=='exile'){const action=game.activatableList(a).find(row=>row.card===source&&row.ability?.oracleOperation?.effects?.some(effect=>['linked-exile','exile-reflexive-v20'].includes(effect.action)));assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await h.resolveAll(game);source.tapped=false;game.recalc();}
  if(op.zone==='craft'){source.meta.oracleCraftV20={version:source.zoneVersion,rows:[{card:donor,version:donor.zoneVersion}]};game.recalc();}
  a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:decide(g,q);
  const receiver=op.receivers?h.permanent(M,game,a,h.fixtureDefinition('Borrowing receiver',['Creature'],{power:'3',toughness:'20'})):source;if(op.receivers)game.addCounters(receiver,'+1/+1',1);receiver.sick=false;
  const inherited=()=>game.activatableList(a).find(row=>row.card===receiver&&row.ability?.oracleBorrowedV20&&row.ability.oracleBorrowedDonorV20===donor.iid&&row.ability.label===ping.label);
  let ability=inherited();assert.ok(ability,entry.raw.name+': donor activated ability is genuinely available');game.recalc();assert.equal(inherited().ability,ability.ability,'recalculation retains the granted activation identity');const start=b.life;
  assert.equal(await game.activateAbility(a,ability),true);assert.equal(receiver.tapped,true);assert.equal(donor.tapped,false,'a copied tap cost taps its new source only');await h.resolveAll(game);assert.equal(b.life,start-1);
  receiver.tapped=false;game.recalc();const manaSource=game.manaSources(a).find(row=>row.card===receiver&&row.m?.oracleBorrowedV20&&row.m.oracleBorrowedDonorV20===donor.iid);
  if(op.excludeMana)assert.equal(manaSource,undefined);else{assert.ok(manaSource);const before=a.pool.G;assert.equal(await game.activateManaSource(a,manaSource,manaSource.produce[0]),true);assert.equal(a.pool.G,before+1);assert.equal(receiver.tapped,true);}
  receiver.tapped=false;game.recalc();if(op.once){assert.equal(inherited(),undefined,'this particular inherited ability is usable only once each turn');game.turnNo++;}
  ability=inherited();assert.ok(ability);assert.equal(await game.activateAbility(a,ability),true);const life=b.life;await game.move(donor,'hand');receiver.tapped=false;game.recalc();assert.equal(inherited(),undefined,'removing the exact donor removes new activations');await h.resolveAll(game);assert.equal(b.life,life-1,'an already activated ability survives donor removal');
  if(op.zone==='linked'||op.zone==='craft'){await game.move(donor,'exile');game.recalc();assert.equal(inherited(),undefined,'a new exiled incarnation does not renew its old link');}
  return 16;
 }
 if(op.kind==='generic-trigger'&&op.permanentDuringCombatV20){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fillLibrary(M,a,20);h.permanent(M,game,a,entry.raw.name);assert.equal(op.effects.length,1);assert.equal(op.effects[0].action,'draw');
  for(const phase of ['main1','combat']){game.phase=phase;const card=h.zoneCard(M,a,'Grizzly Bears','hand'),before=a.hand.length;await game.putPermanentOntoBattlefield(card,a);await h.resolveAll(game);assert.equal(a.hand.length,before-1+(phase==='combat'?op.effects[0].n:0));}const before=a.hand.length;await game.makeTokens('Soldier',a,{n:1});await h.resolveAll(game);assert.equal(a.hand.length,before,'a token entering during combat does not qualify');return 6;
 }
 if(op.kind==='generic-trigger'&&op.effects?.[0]?.action==='permanent-grave-aura-v20'){
  let checks=0;
  for(const stale of [null,'source','host']){const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fillLibrary(M,a,20);const source=h.zoneCard(M,a,entry.raw.name,'graveyard'),filter=op.eventFilter.target,controller=filter.controller==='you'?a:b;
   const weak=h.zoneCard(M,controller,h.fixtureDefinition('Small non-Ninja entrant',['Creature'],{cost:'{1}',power:'1',toughness:'2'}),'hand');await game.putPermanentOntoBattlefield(weak,controller);await h.resolveAll(game);assert.equal(source.zone,'graveyard');
   const host=h.zoneCard(M,controller,h.fixtureDefinition('Valid aura entrant',['Creature'],{cost:'{6}',power:'5',toughness:'5',subtypes:filter.subtype?[filter.subtype]:['Giant'],kws:['shroud','hexproof']}),'hand');await game.putPermanentOntoBattlefield(host,controller);await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===source));
   if(stale==='source'){await game.move(source,'exile');await game.move(source,'graveyard');}if(stale==='host'){await game.move(host,'exile');host.def={...host.def,cost:'{1}',subtypes:['Bear']};await game.putPermanentOntoBattlefield(host,controller);await game.flushTriggers();}
   await h.resolveAll(game);assert.equal(source.zone,stale?'graveyard':'battlefield',entry.raw.name+': return follows only the original graveyard and entrant incarnations');if(!stale){assert.equal(source.attachedTo,host.iid);assert.equal(source.ctrl.idx,a.idx,'Aura stays controlled by the trigger controller even on an opposing host');assert.equal(host.kw('shroud'),true,'this nontargeted attachment works on a creature with shroud');}checks+=6;
  }return checks;
 }
 if(op.kind==='generic-trigger'&&op.effects?.[0]?.action==='permanent-host-death-return-v20'){
  let checks=0;
  for(const stale of [false,true]){const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,20);const effect=op.effects[0],target=entry.implementation.find(row=>row.kind==='aura-target'),host=h.stageGenericTarget(M,ctx,target.targetV9||{what:target.what,zone:'battlefield',controller:'you',min:1},'host'),source=h.zoneCard(M,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(source.attachedTo,host.iid);await game.destroy(host);await game.checkSBA();await game.flushTriggers();assert.equal(source.zone,'graveyard');assert.ok(game.stack.some(row=>row.srcCard===source));if(stale){await game.move(source,'hand');await game.move(source,'graveyard');}await h.resolveAll(game);assert.equal(source.zone,stale?'graveyard':effect.transformed?'battlefield':'hand','Aura returns only from the graveyard caused by this host departure');if(!stale&&effect.transformed){assert.equal(source.oracleFace,'back');if(effect.target!==undefined)assert.equal(source.meta.cursedPlayer?.idx,b.idx);}checks+=6;}return checks;
 }
 if(op.kind==='generic-trigger'&&op.zone==='graveyard'&&op.event==='upkeep'&&op.condition?.test==='in-own-graveyard'){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,20);const source=h.zoneCard(M,a,entry.raw.name,'graveyard');await game.emit('upkeep',{player:b});await h.resolveAll(game);assert.equal(source.zone,'graveyard');const before=Object.values(a.pool).reduce((n,x)=>n+x,0);await game.emit('upkeep',{player:a});await h.resolveAll(game);assert.equal(source.zone,'hand');assert.equal(before-Object.values(a.pool).reduce((n,x)=>n+x,0),M.mv(op.effects[0].payment.mana));await game.move(source,'graveyard');await game.emit('upkeep',{player:a});await game.flushTriggers();await game.move(source,'exile');await game.move(source,'graveyard');const next=Object.values(a.pool).reduce((n,x)=>n+x,0);await h.resolveAll(game);assert.equal(source.zone,'graveyard');assert.equal(Object.values(a.pool).reduce((n,x)=>n+x,0),next,'intervening-if fails for a new graveyard incarnation');return 8;
 }
 const tax=op.kind==='permanent-combat-tax-v20'?op:op.effects?.length===1&&op.effects[0].action==='permanent-combat-tax-v20'?op.effects[0].rule:null;
 if(tax){
  let checks=0;
  for(const mode of ['attack','block'].filter(mode=>tax.mode===mode||tax.mode==='both'))for(const paid of [false,true]){
   const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,30);
   const host=tax.subject==='attached'?h.permanent(M,game,a,h.fixtureDefinition('Taxed creature',['Creature'],{power:'4',toughness:'30'})):null,source=h.zoneCard(M,a,entry.raw.name,'hand'),decide=a.controller.decide.bind(a.controller);
   a.controller.decide=(g,q)=>q.type==='chooseX'?3:q.type==='chooseTargets'&&host&&q.candidates.includes(host)?[host]:decide(g,q);
   assert.equal(await game.castSpell(a,source,{from:'hand',...(entry.raw.cost.includes('{X}')?{xVal:3}:{})}),true);await h.resolveAll(game);assert.equal(source.zone,'battlefield');
   if(op.kind==='generic-ability'){const action=game.activatableList(a).find(row=>row.card===source&&row.ability.oracleOperation?.effects?.[0]?.action==='permanent-combat-tax-v20');assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await h.resolveAll(game);}
   let multiplier=1;
   if(tax.multiply?.counter){const c=host||source;game.addCounters(c,tax.multiply.counter,Math.max(0,3-(c.counters[tax.multiply.counter]||0)));multiplier=c.counters[tax.multiply.counter];}
   else if(tax.multiply?.zone==='hand'){while(a.hand.length<2)h.zoneCard(M,a,'Forest','hand');multiplier=a.hand.length;}
   else if(tax.multiply?.unique==='basic-land-types'){h.permanent(M,game,a,'Plains');h.permanent(M,game,a,'Forest');multiplier=2;}
   const expected=(typeof tax.mana==='number'?tax.mana:3)*multiplier,subject=host||source,fixture=h.fixtureDefinition('Combat tax witness',['Creature'],{power:'4',toughness:'30'});
   const attacker=mode==='block'?h.permanent(M,game,b,fixture):tax.subject==='all'?h.permanent(M,game,b,fixture):subject,payer=mode==='block'?subject.ctrl:attacker.ctrl,defender=attacker.ctrl===a?b:a;
   for(const p of game.players)for(const color of Object.keys(p.pool))p.pool[color]=0;for(const card of game.bf())if(card.is('Land'))card.tapped=true;payer.pool.C=paid?expected:Math.max(0,expected-1);attacker.sick=false;subject.sick=false;game.turnPlayer=attacker.ctrl;
   for(const player of game.players){const prior=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>q.type==='attackers'?[{card:attacker,target:defender}]:q.type==='blockers'?mode==='block'?[{blocker:subject,attacker}]:[]:prior(g,q);}
   const events=[],payments=[],emit=game.emit,pay=game.payMana;game.emit=async function(name,data){if(name==='attacks'||name==='blocks')events.push({name,data});return emit.call(this,name,data);};game.payMana=async function(player,cost,...args){const before=Object.values(player.pool).reduce((n,x)=>n+x,0),result=await pay.call(this,player,cost,...args);payments.push({player,cost,result,spent:before-Object.values(player.pool).reduce((n,x)=>n+x,0)});return result;};
   await game.combatPhase(attacker.ctrl);await h.resolveAll(game);
   assert.equal(events.some(row=>mode==='attack'?row.name==='attacks'&&row.data.card===attacker:row.name==='blocks'&&row.data.blocker===subject),paid,entry.raw.name+': a real '+mode+' declaration requires its full tax');
   if(paid)assert.ok(payments.some(row=>row.player===payer&&row.result&&row.cost.generic===expected&&row.spent===expected),entry.raw.name+': exact tax was actually paid');else assert.equal(payments.some(row=>row.player===payer&&row.result),false,'an unaffordable declaration consumes no partial payment');
   if(op.effects?.[0]?.duration){if(op.effects[0].duration==='next-turn')a.turnsStarted++;else game.turnNo++;assert.equal(M.OracleV20Permanents.attackTax(game,attacker,defender),0,'the temporary tax expires at its exact boundary');}
   checks+=5;
  }
  return checks;
 }
 if(op.kind==='generic-trigger'&&op.effects?.[0]?.action==='permanent-self-return-v20'&&op.effects.every(effect=>['permanent-self-return-v20','skip-v10'].includes(effect.action))){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,30);const effect=op.effects[0],source=h.zoneCard(M,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);const beforeVersion=source.zoneVersion,counters=source.counters[effect.fewerCounter]||0;
  if(op.event==='sacrificed')await game.sacrifice(a,source);else await game.destroy(source);await h.resolveAll(game);
  for(const skip of op.effects.filter(effect=>effect.action==='skip-v10')){assert.equal(skip.who,'you');assert.equal(game.oracleShouldSkipV10(b,skip.phase),false,'the opposing player keeps their step');for(let i=0;i<skip.n;i++)assert.equal(game.oracleShouldSkipV10(a,skip.phase),true,'death also consumes the printed number of upcoming steps');assert.equal(game.oracleShouldSkipV10(a,skip.phase),false,'the following step is restored');}
  if(effect.delay){assert.equal(source.zone,'graveyard');if(effect.delay==='owner-upkeep'){await game.emit('upkeep',{player:b});await h.resolveAll(game);assert.equal(source.zone,'graveyard');}await game.emit(effect.delay==='owner-upkeep'?'upkeep':'endStep',{player:a});await h.resolveAll(game);}
  assert.equal(source.zone,'battlefield');assert.ok(source.zoneVersion>beforeVersion);assert.equal(source.ctrl.idx,a.idx);assert.equal(source.tapped,!!effect.tapped);if(effect.transformed)assert.equal(source.oracleFace,'back');if(effect.counter)assert.equal(source.counters[effect.counter],effect.n);if(effect.fewerCounter)assert.equal(source.counters[effect.fewerCounter]||0,counters-1);if(effect.subtype)assert.equal(source.hasSub(effect.subtype),true);if(effect.loseAbilities){assert.equal(source.cur.abilitiesDisabled,true);for(const kw of effect.keywords)assert.equal(source.kw(kw),true);}
  if(op.condition||effect.loseAbilities){if(effect.fewerCounter)game.removeCounters(source,effect.fewerCounter,source.counters[effect.fewerCounter]);await game.destroy(source);await h.resolveAll(game);await game.emit('endStep',{player:a});await h.resolveAll(game);assert.equal(source.zone,'graveyard','the returning incarnation no longer meets the printed death predicate');}
  const stale=h.zoneCard(M,a,entry.raw.name,'hand');h.fund(a,100);assert.equal(await game.castSpell(a,stale,{from:'hand'}),true);await h.resolveAll(game);if(op.event==='sacrificed')await game.sacrifice(a,stale);else await game.destroy(stale);await game.flushTriggers();await game.move(stale,'hand');await game.move(stale,'graveyard');await h.resolveAll(game);if(effect.delay){await game.emit(effect.delay==='owner-upkeep'?'upkeep':'endStep',{player:a});await h.resolveAll(game);}assert.equal(stale.zone,'graveyard','old death trigger cannot return a different graveyard incarnation');return 10;
 }
 if(op.kind==='generic-trigger'&&op.permanentGraveWatcherV20){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,30);const source=h.zoneCard(M,a,entry.raw.name,'graveyard'),exile=op.effects[0].action==='permanent-grave-exile-v20',tokens=op.effects[0].action==='token-inline';
  const victim=h.permanent(M,game,exile?b:a,'Grizzly Bears');if(tokens||exile)M.OracleV8Control.gain(game,victim,exile?a:b,{});await game.destroy(victim);await h.resolveAll(game);
  if(exile)assert.equal(source.zone,'exile');else if(tokens){assert.equal(source.zone,'graveyard');const zombies=game.creatures(a).filter(card=>card.isToken&&card.hasSub('Zombie'));assert.equal(zombies.length,1);assert.equal(zombies[0].power,2);assert.equal(zombies[0].toughness,2);}else assert.equal(source.zone,'hand');
  if(source.zone!=='graveyard')await game.move(source,'graveyard');const next=h.permanent(M,game,exile?b:a,'Grizzly Bears'),before=game.bf().filter(card=>card.isToken).length;await game.destroy(next);await game.flushTriggers();await game.move(source,'exile');await h.resolveAll(game);assert.equal(source.zone,'exile');assert.equal(game.bf().filter(card=>card.isToken).length,before,'intervening source removal prevents the graveyard reward');return 6;
 }
 if(op.kind==='permanent-choose-card-type-v20'){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,30);const card=h.zoneCard(M,b,'Forest','hand'),looks=[],questions=[],decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>{questions.push(q);return decide(g,q);};const reveal=game.revealToHuman;game.revealToHuman=async function(opts){looks.push(opts);return reveal.call(this,opts);};
  const source=h.zoneCard(M,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(source.zone,'battlefield');const choice=source.meta.oracleChosenCardTypeV20;assert.equal(choice.version,source.zoneVersion);assert.equal(op.exclude.includes(choice.choice),false);assert.ok(['Artifact','Battle','Creature','Enchantment','Instant','Kindred','Land','Planeswalker','Sorcery'].includes(choice.choice));
  const question=questions.find(q=>q.type==='chooseOption'&&q.prompt===source.name+': choose a card type');assert.ok(question);for(const excluded of op.exclude)assert.equal(question.options.some(option=>option.key===excluded),false);
  if(op.lookHand)assert.ok(looks.some(row=>row.kind==='look'&&row.ctrl===a&&row.cards.includes(card)),'only the source controller looks at the selected opponent hand');await game.move(source,'hand');assert.notEqual(choice.version,source.zoneVersion);return 6;
 }
 if(op.kind==='permanent-choose-opponent-v20'||op.kind==='generic-trigger'&&op.permanentChosenUpkeepV20||op.kind==='generic-static'&&op.multiplier?.test==='chosen-player'){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,30);for(let i=0;i<2;i++){h.zoneCard(M,b,'Forest','hand');h.zoneCard(M,b,'Grizzly Bears','graveyard');const land=h.permanent(M,game,b,h.fixtureDefinition('Chosen nonbasic '+i,['Land'],{}));land.tapped=true;}
  const source=h.zoneCard(M,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(source.zone,'battlefield');assert.equal(source.meta.oracleChosenOpponentV20?.player,b.idx);assert.equal(source.meta.oracleChosenOpponentV20?.version,source.zoneVersion);
  if(op.kind==='permanent-choose-opponent-v20'){await game.move(source,'hand');assert.notEqual(source.meta.oracleChosenOpponentV20?.version,source.zoneVersion);await game.putPermanentOntoBattlefield(source,a);await h.resolveAll(game);assert.equal(source.meta.oracleChosenOpponentV20?.version,source.zoneVersion);return 6;}
  if(op.kind==='generic-static'){const base=Number(entry.raw.power);assert.equal(source.power,base+op.power*2);await game.discard(b,[b.hand[0]]);game.recalc();assert.equal(source.power,base+op.power);M.OracleV8Control.gain(game,source,b,{});game.recalc();assert.equal(source.power,base+op.power,'control change preserves the originally chosen player');await game.move(source,'graveyard');assert.equal(source.power,base);return 7;}
  const rule=op.effects[0].rule,start=b.life;await game.emit('upkeep',{player:a});await h.resolveAll(game);assert.equal(b.life,start,'the unchosen player upkeep causes no chosen-player damage');game.addCounters(source,'vortex',3);await game.emit('upkeep',{player:b});await h.resolveAll(game);assert.equal(b.life,start-(rule==='rack'?1:3));
  if(rule==='rack'){while(b.hand.length<4)h.zoneCard(M,b,'Forest','hand');const life=b.life;await game.emit('upkeep',{player:b});await h.resolveAll(game);assert.equal(b.life,life,'a large chosen hand produces zero damage');}
  else {h.fund(b,30);const life=b.life,mana=Object.values(b.pool).reduce((sum,n)=>sum+n,0);await game.emit('upkeep',{player:b});await h.resolveAll(game);assert.equal(b.life,life);assert.equal(Object.values(b.pool).reduce((sum,n)=>sum+n,0),mana-3,'the chosen player pays the exact live counter total');}
  return 8;
 }
 if(op.kind==='permanent-unattach-trigger-v20'){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);
  const source=h.permanent(M,game,a,entry.raw.name),first=h.permanent(M,game,a,'Grizzly Bears'),second=h.permanent(M,game,a,'Grizzly Bears');
  assert.equal(await game.attach(source,first),true);await h.resolveAll(game);assert.equal(first.zone,'battlefield');assert.equal(await game.attach(source,second),true);await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===source));await h.resolveAll(game);assert.equal(first.zone,'graveyard');assert.equal(second.zone,'battlefield');
  const third=h.permanent(M,game,a,'Grizzly Bears');await game.attach(source,third);await game.flushTriggers();await game.move(second,'exile');await game.putPermanentOntoBattlefield(second,a);await h.resolveAll(game);assert.equal(second.zone,'battlefield');
  M.OracleV8AbilityLoss.add(game,[source],{});await game.attach(source,second);await h.resolveAll(game);assert.equal(third.zone,'battlefield');return 7;
 }
 if(op.kind==='permanent-daystart-v20'){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,20);
  const source=h.zoneCard(M,a,entry.raw.name,'hand');assert.equal(!!game.bomDayNight,false);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(game.bomDayNight,'day');assert.equal(source.zone,'battlefield');
  await game.move(source,'hand');game.bomDayNight='night';await game.putPermanentOntoBattlefield(source,a);await h.resolveAll(game);assert.equal(game.bomDayNight,'night');return 5;
 }
 if(op.kind==='permanent-haunt-v20'||op.kind==='permanent-haunt-trigger-v20'){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fillLibrary(M,a,20);
  const source=h.permanent(M,game,a,entry.raw.name),haunted=h.permanent(M,game,b,h.fixtureDefinition('Haunted permanent',['Creature'],{power:'2',toughness:'20'}));
  const hauntedVersion=haunted.zoneVersion;await game.destroy(source);await game.flushTriggers();
  assert.ok(game.stack.some(row=>row.srcCard===source&&row.kind==='trigger'),entry.raw.name+': Haunt uses the death-trigger stack');await h.resolveAll(game);
  assert.equal(source.zone,'exile');assert.equal(source.meta.oracleHauntV20?.sourceVersion,source.zoneVersion);assert.equal(source.meta.oracleHauntV20?.hauntedIid,haunted.iid);assert.equal(source.meta.oracleHauntV20?.hauntedVersion,hauntedVersion);
  if(op.kind==='permanent-haunt-v20')return 5;
  const targets=(op.targets||[]).map((filter,index)=>h.stageGenericTarget(M,ctx,filter,'haunt-'+index,op.effects.find(effect=>effect.target===index)));
  const witness=h.permanent(M,game,a,h.fixtureDefinition('Haunt continuous witness',['Creature'],{power:'3',toughness:'20'}));
  const life=[];for(const method of ['loseLife','gainLife']){const prior=game[method];game[method]=async function(player,n,...args){const result=await prior.call(this,player,n,...args);life.push({method,player,n});return result;};}
  const wrong=h.permanent(M,game,b,h.fixtureDefinition('Unhaunted permanent',['Creature'],{power:'1',toughness:'20'}));await game.destroy(wrong);await game.flushTriggers();assert.equal(game.stack.some(row=>row.srcCard===source),false,entry.raw.name+': another death does not fire the linked trigger');
  const tokens=game.bf().filter(c=>c.isToken).length;await game.destroy(haunted);await game.flushTriggers();const trigger=game.stack.find(row=>row.srcCard===source);assert.ok(trigger,entry.raw.name+': exiled card observes the haunted incarnation dying');const chosen=trigger.targets||[];await h.resolveAll(game);
  for(const effect of op.effects){
   const index=typeof effect.target==='number'?effect.target:effect.who,target=typeof index==='number'?[chosen[index]].flat()[0]:null;
   if(effect.action==='destroy')assert.equal(target?.zone,'graveyard');
   else if(effect.action==='move-to-hand')assert.equal(target?.zone,'hand');
   else if(effect.action==='lose-life')assert.ok(life.some(row=>row.method==='loseLife'&&row.player===target&&row.n===effect.n));
   else if(effect.action==='gain-life')assert.ok(life.some(row=>row.method==='gainLife'&&row.player===a&&row.n===effect.n));
   else if(effect.action==='token-inline'){const made=game.bf().filter(c=>c.isToken);assert.equal(made.length,tokens+effect.n);for(const token of made){assert.equal(token.ctrl,a);assert.equal(token.power,1);assert.equal(token.toughness,1);assert.equal(token.kw('flying'),true);}}
   else if(effect.action==='base-pt'){assert.equal(witness.power,1);assert.equal(witness.toughness,1);game.untilEffects=[];game.recalc();assert.equal(witness.power,3);assert.equal(witness.toughness,20);}
   else assert.fail('Missing Haunt reward evidence '+effect.action);
  }
  assert.equal(source.zone,'exile');return 8+op.effects.length;
 }
 if(op.kind==='enters-with-counters'&&op.n?.kind==='permanent-amount-v20'){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fillLibrary(M,a,20);
  for(const x of [4,5]){h.fund(a,100);const source=h.zoneCard(M,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand',xVal:x}),true);await h.resolveAll(game);assert.equal(source.zone,'battlefield');assert.equal(source.counters[op.counter],x>=5?2*x:x);}return 6;
 }
 if(op.kind==='generic-ability'&&entry.implementation.some(row=>row.kind==='enters-with-counters'&&row.n?.kind==='permanent-amount-v20'))return h.genericRuntimeOperationProof(M,{...entry,implementation:entry.implementation.map(row=>row.kind==='enters-with-counters'&&row.n?.kind==='permanent-amount-v20'?{...row,n:'X'}:row)},op,role);
 if(op.kind==='generic-static'&&op.multiplierSubject==='affected'&&op.multiplier?.kind==='source-counters'){
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.permanent(M,game,a,entry.raw.name);
  const other=h.permanent(M,game,b,h.fixtureDefinition('Counted opposing creature',['Creature'],{power:'5',toughness:'20'})),own=h.permanent(M,game,a,h.fixtureDefinition('Unaffected own creature',['Creature'],{power:'5',toughness:'20'}));game.addCounters(other,op.multiplier.counter,2);game.addCounters(own,op.multiplier.counter,2);assert.equal(other.power,5+op.power*2);assert.equal(own.power,5);game.removeCounters(other,op.multiplier.counter,1);assert.equal(other.power,5+op.power);return 3;
 }
 if(op.kind==='permanent-event-trigger-v20'){
  const generic={...op,kind:'generic-trigger',eventFilter:{kind:'v8-event',subject:'self',counter:op.filter.counter,minAmount:op.filter.reaches}};
  return h.genericRuntimeOperationProof(M,{...entry,implementation:entry.implementation.map(row=>row===op?generic:row)},generic,role);
 }
 if(!['permanent-rule-v20','permanent-static-v20','permanent-counter-replacement-v20','permanent-trigger-doubler-v20'].includes(op.kind))return null;
 const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;h.assertControllerRole(M,ctx,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,20);
 const source=h.permanent(M,game,a,entry.raw.name),add=(player=a,types=['Creature'],extras={})=>h.permanent(M,game,player,h.fixtureDefinition('Permanent proof '+game.bf().length,types,{cost:'{2}',power:'2',toughness:'20',...extras}));
 if(op.kind==='permanent-counter-replacement-v20'){
  const c=op.self?source:h.stageGenericTarget(M,ctx,op.filter,'replacement'),before=c.plus1();game.addCounters(c,'+1/+1',2);assert.equal(c.plus1(),before+2*op.multiply+op.add);
  const other=add(b);game.addCounters(other,'+1/+1',2);assert.equal(other.plus1(),2);M.OracleV8AbilityLoss.add(game,[source],{});const after=c.plus1();game.addCounters(c,'+1/+1',1);assert.equal(c.plus1(),after+1);return 3;
 }
 if(op.kind==='permanent-trigger-doubler-v20'){
  const witness=op.filter?h.stageGenericTarget(M,ctx,op.filter,'doubled'):add();let fired=0;
  witness.def={...witness.def,triggers:[{on:op.entryFilter?'etb':'upkeep',filter:(g,c,d)=>op.entryFilter?d.card!==c:d.player===c.ctrl,run:async()=>fired++}]};game.recalc();if(op.attached)assert.equal(await game.attach(source,witness),true);
  const emit=async()=>{if(op.entryFilter){const visitor=h.stageGenericTarget(M,ctx,op.entryFilter,'entry-caused');await game.move(visitor,'hand');await game.putPermanentOntoBattlefield(visitor,a);}else await game.emit('upkeep',{player:a});await h.resolveAll(game);};
  await emit();assert.equal(fired,2);M.OracleV8AbilityLoss.add(game,[source],{});await emit();assert.equal(fired,3);return 3;
 }
 if(op.kind==='permanent-rule-v20'){
  if(op.rule==='cant-equip'){const equipment=add(a,['Artifact'],{subtypes:['Equipment']});assert.equal(await game.attach(equipment,source),false);assert.equal(game.legalEntryAttachment(equipment,source,a),false);M.OracleV8AbilityLoss.add(game,[source],{});assert.equal(await game.attach(equipment,source),true);return 3;}
  let died=0,entered=0;add(a,['Artifact'],{triggers:[{on:'dies',run:async()=>died++},{on:'etb',run:async()=>entered++}]});const c=add();await game.destroy(c);await h.resolveAll(game);assert.equal(died,0);const visitor=h.zoneCard(M,a,'Grizzly Bears','hand');await game.putPermanentOntoBattlefield(visitor,a);await h.resolveAll(game);assert.equal(entered,0);await game.destroyMany([source,visitor]);await h.resolveAll(game);assert.equal(died,0);const after=add();await game.destroy(after);await h.resolveAll(game);assert.equal(died,1);return 4;
 }
 if(op.rule==='artifact-lands'){const own=add(a,['Artifact']),other=add(b,['Artifact']),token=add(a,['Artifact']);token.isToken=true;game.recalc();assert.equal(own.is('Land'),true);assert.equal(other.is('Land'),false);assert.equal(token.is('Land'),false);await game.move(source,'exile');assert.equal(own.is('Land'),false);return 4;}
 if(op.rule==='abilityless-pump'){const blank=add(a,['Creature'],{toughness:'2'}),ability=add(a,['Creature'],{kws:['flying'],toughness:'2'});assert.equal(blank.power,4);assert.equal(ability.power,2);game.addCounters(blank,'flying',1);assert.equal(blank.power,2);return 3;}
 if(op.rule==='greatest-mv-protection'){const big=add(a,['Creature'],{cost:'{12}'}),small=add(b),spell=h.zoneCard(M,b,'Lightning Bolt','hand');assert.equal(game.isProtectedFrom(big,spell),true);assert.equal(game.isProtectedFrom(small,spell),false);await game.move(big,'exile');assert.equal(game.isProtectedFrom(small,spell),true);return 3;}
 if(op.rule==='your-aura-base'){const host=add(a,['Creature'],{toughness:'2'}),aura=h.permanent(M,game,a,'Pacifism');await game.attach(aura,host);game.addCounters(host,'+1/+1',1);assert.equal(host.power,op.power+1);assert.equal(host.toughness,op.toughness+1);for(const kw of op.keywords)assert.equal(host.kw(kw),true);aura.ctrl=b;game.recalc();assert.equal(host.power,3);return 3+op.keywords.length;}
 if(op.rule==='nameless-blockers'){const named=add(b),nameless=add(b,['Creature'],{rulesNoName:true});source.attacking=b;assert.equal(game.canBlock(named,source),true);assert.equal(game.canBlock(nameless,source),false);return 2;}
 if(op.rule==='linked-keywords'||op.rule==='linked-protection-types'){
  const card=h.zoneCard(M,a,h.fixtureDefinition('Linked ability witness',['Artifact','Creature'],{kws:['flying','lifelink'],power:'1',toughness:'1'}),'graveyard'),decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(card)?[card]:q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':decide(g,q);
  await game.emit('etb',{card:source});await h.resolveAll(game);assert.equal(card.zone,'exile');game.recalc();
  if(op.rule==='linked-keywords'){assert.equal(source.kw('flying'),true);assert.equal(source.kw('lifelink'),true);}else{const artifact=add(b,['Artifact']),creature=add(b),instant=h.zoneCard(M,b,'Lightning Bolt','hand');assert.equal(game.isProtectedFrom(source,artifact),true);assert.equal(game.isProtectedFrom(source,creature),true);assert.equal(game.isProtectedFrom(source,instant),false);}
  await game.move(card,'hand');await game.move(card,'exile');game.recalc();if(op.rule==='linked-keywords')assert.equal(source.kw('lifelink'),false);else assert.equal(game.isProtectedFrom(source,add(b)),false);return op.rule==='linked-keywords'?4:5;
 }
 assert.fail('Missing permanent static proof '+op.rule);
}
