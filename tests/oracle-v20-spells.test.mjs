import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
import {operationProofV20} from './helpers/oracle-v20-spells-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v20-spells.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(c=>!M.DEFS[c.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9936,limit:absent.length,compilerVersion:20});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);}M.initData(M.RAW_DATA);
function choose(p,fn){const old=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>fn(g,q)??old(g,q);}
function fund(p){for(const k of ['W','U','B','R','G','C'])p.pool[k]=50;}
async function cast(f,name,targets=[],opts={}){const c=put(M,f.game,f.a,name,'hand');fund(f.a);choose(f.a,(g,q)=>q.type==='chooseTargets'?targets.filter(t=>q.candidates.includes(t)).slice(0,q.max??q.count??1):undefined);assert.equal(await f.game.castSpell(f.a,c,{from:'hand',...opts}),true,name);return c;}
function creature(f,p,{name='Grizzly Bears',power=3,toughness=20,types=['Creature'],subtypes=['Bear'],kws=[]}={}){const c=put(M,f.game,p,name);c.def={...c.def,power:String(power),toughness:String(toughness),types,subtypes,kws};f.game.recalc();return c;}
async function pendingDividedSpell(f,targets){
 const spell=put(M,f.game,f.b,'Shock','hand'),effects=[{action:'divided-damage-v8',target:0,n:5}];spell.def={...spell.def,name:'Retarget allocation witness',cost:'{0}',targets:[M.T.creature({min:2,count:2,aiHint:{goal:'damage'}})],prepareTargets:c=>M.OracleV20.helpers.prepareGenericDivisions(c,effects),resolve:c=>M.OracleV20.helpers.runGenericEffects(c,effects)};
 choose(f.b,(g,q)=>q.type==='chooseTargets'?targets:q.type==='chooseX'?(q.allocation.index===0?2:3):undefined);assert.equal(await f.game.castSpell(f.b,spell,{from:'hand'}),true);return f.game.stack.find(o=>o.card===spell);
}

test('v20 spell compositions consume exact full Oracle text and reject unknown suffixes',()=>{
 for(const c of rows){assert.ok(semanticClass(c,{compilerVersion:20}).semanticClass,c.name);const invalid=c.card_faces?c.card_faces.map((_,i)=>({...c,card_faces:c.card_faces.map((face,j)=>i===j?{...face,oracle_text:face.oracle_text+'\nDo an unsupported thing.'}:face)})):[{...c,oracle_text:c.oracle_text+'\nDo an unsupported thing.'}];for(const bad of invalid)assert.equal(semanticClass(bad,{compilerVersion:20}).semanticClass,undefined,c.name);}
});
test('spell proof leaves outer card layouts to their own drivers',async()=>{
 for(const kind of ['double-faced-v8','saga-chapters','adventure-face','generic-static'])assert.equal(await operationProofV20(M,{raw:{name:'Outer layout witness'}},{kind,nested:{effects:[{action:'player-consequence-v20'}]}},'human',{genericRuntimeOperationProof:()=>assert.fail('outer layout must keep its original driver')}),null);
});
for(const role of ['human','ai']){
 test(role+': kicked stun counters bind only the tapped targets and zero targets still draw',async()=>{
  for(const kicked of [false,true])for(const count of [0,2]){const f=context(M,role),targets=Array.from({length:count},()=>creature(f,f.b)),untargeted=creature(f,f.b);choose(f.a,(g,q)=>q.aiHint?.kind==='kicker'?(kicked?'yes':'no'):undefined);await cast(f,'Stall for Time',targets);await settle(f.game);for(const target of targets){assert.equal(target.tapped,true);assert.equal(target.counters.stun||0,kicked?1:0);}assert.equal(untargeted.tapped,false);assert.equal(untargeted.counters.stun||0,0);assert.equal(f.a.hand.length,1);assertGameStateInvariants(f.game);}
 });
 test(role+': subtype damage uses the target and damages its controller even after lethal damage',async()=>{
  for(const spirit of [false,true]){const f=context(M,role),target=creature(f,f.b,{toughness:2,subtypes:[spirit?'Spirit':'Bear']});await cast(f,'Rending Flame',[target]);await settle(f.game);assert.equal(target.zone,'graveyard');assert.equal(f.b.life,spirit?38:40);assert.equal(f.a.life,40);assertGameStateInvariants(f.game);}
 });
 test(role+': converged bound X counts actual paid colors including colorless zero',async()=>{
  for(const colors of [0,2]){const f=context(M,role),source=put(M,f.game,f.a,'Together as One','hand');for(const color of ['W','U','B','R','G','C'])f.a.pool[color]=0;if(colors){f.a.pool.W=3;f.a.pool.U=3;}else f.a.pool.C=6;let target=0;choose(f.a,(g,q)=>q.type==='chooseTargets'?[target++===0?f.a:f.b]:undefined);assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await settle(f.game);assert.equal(f.a.hand.length,colors);assert.equal(f.a.life,40+colors);assert.equal(f.b.life,40-colors);assertGameStateInvariants(f.game);}
 });
 test(role+': hand deficit damage has positive and zero bound X results',async()=>{
  for(const name of ['Rackling','Wheel of Torture'])for(const cards of [1,4]){const f=context(M,role);put(M,f.game,f.a,name);for(let i=0;i<cards;i++)put(M,f.game,f.b,'Forest','hand');await f.game.emit('upkeep',{player:f.a});await settle(f.game);assert.equal(f.b.life,40);await f.game.emit('upkeep',{player:f.b});await settle(f.game);assert.equal(f.b.life,40-Math.max(0,3-cards));assertGameStateInvariants(f.game);}
 });
 test(role+': parity choices include zero as even and preserve the other parity',async()=>{
  for(const parity of ['odd','even']){const f=context(M,role),cards=Array.from({length:4},(_,i)=>{const card=creature(f,f.b);card.def={...card.def,cost:'{'+i+'}'};return card;});choose(f.a,(g,q)=>q.prompt==='Choose a parity'?parity:undefined);await cast(f,'Extinction Event');await settle(f.game);for(const [mv,card]of cards.entries())assert.equal(card.zone,mv%2===(parity==='odd'?1:0)?'exile':'battlefield');assertGameStateInvariants(f.game);}
 });
 test(role+': Catastrophe prevents creature regeneration while noncreature lands can regenerate',async()=>{
  const f=context(M,role),land=put(M,f.game,f.b,'Forest'),animated=creature(f,f.b,{types:['Land','Creature']}),indestructible=creature(f,f.b,{types:['Land','Creature'],kws:['indestructible']});land.regenShield=animated.regenShield=indestructible.regenShield=1;choose(f.a,(g,q)=>q.prompt==='Choose a permanent type'?'lands':undefined);await cast(f,'Catastrophe');await settle(f.game);assert.equal(land.zone,'battlefield');assert.equal(land.regenShield,0);assert.equal(animated.zone,'graveyard');assert.equal(indestructible.zone,'battlefield');assert.equal(indestructible.regenShield,1);assert.equal(M.oracleCantRegenerateV15(f.game,indestructible),false);assertGameStateInvariants(f.game);
 });
 test(role+': named random and top-card checks execute only the matching branch',async()=>{
  for(const match of [false,true]){const f=context(M,role),source=put(M,f.game,f.a,'Magus of the Scroll'),target=creature(f,f.b),card=put(M,f.game,f.a,match?'Grizzly Bears':'Forest','hand');fund(f.a);choose(f.a,(g,q)=>q.prompt?.endsWith(': choose a card name')?'Grizzly Bears':q.type==='chooseTargets'?[target]:undefined);const action=f.game.activatableList(f.a).find(action=>action.card===source);assert.equal(await f.game.activateAbility(f.a,action),true);await settle(f.game);assert.equal(target.damage,match?2:0);assert.equal(card.zone,'hand');assertGameStateInvariants(f.game);}
  for(const match of [false,true]){const f=context(M,role),source=put(M,f.game,f.a,"Diviner's Lockbox"),card=put(M,f.game,f.a,match?'Grizzly Bears':'Forest','library');fund(f.a);choose(f.a,(g,q)=>q.prompt?.endsWith(': choose a card name')?'Grizzly Bears':undefined);const action=f.game.activatableList(f.a).find(action=>action.card===source);assert.equal(await f.game.activateAbility(f.a,action),true);await settle(f.game);assert.equal(source.zone,match?'graveyard':'battlefield');assert.equal(f.a.hand.length,match?3:0);assert.equal(card.zone,match?'hand':'library');assertGameStateInvariants(f.game);}
 });
 test(role+': half-library and half-life effects round up separately',async()=>{
  const f=context(M,role);f.b.life=39;put(M,f.game,f.b,'Forest','library');const size=f.b.library.length;await cast(f,'Peer into the Abyss',[f.b]);await settle(f.game);assert.equal(f.b.hand.length,Math.ceil(size/2));assert.equal(f.b.life,19);assertGameStateInvariants(f.game);
 });
 test(role+': failed discards reward only the opponents who could not discard',async()=>{
  const f=context(M,role,2),card=put(M,f.game,f.b,'Forest','hand');await cast(f,'Refurbished Familiar');await settle(f.game);assert.equal(card.zone,'graveyard');assert.equal(f.a.hand.length,1);assert.equal(f.others[1].hand.length,0);assertGameStateInvariants(f.game);
 });
 test(role+': typed discard consequences distinguish creatures, noncreatures and empty hands',async()=>{
  for(const name of ['Grizzly Bears','Forest',null]){const f=context(M,role);if(name)put(M,f.game,f.b,name,'hand');put(M,f.game,f.a,'Grizzly Bears','hand');await cast(f,'Strongarm Tactics');await settle(f.game);assert.equal(f.a.life,40);assert.equal(f.b.life,name==='Grizzly Bears'?40:36);assertGameStateInvariants(f.game);}
 });
 test(role+': Invoke Despair resolves each sacrifice category and binds the draw to its caster',async()=>{
  const f=context(M,role),victim=creature(f,f.b),enchantment=put(M,f.game,f.b,'Glorious Anthem');await cast(f,'Invoke Despair',[f.b]);await settle(f.game);assert.equal(victim.zone,'graveyard');assert.equal(enchantment.zone,'graveyard');assert.equal(f.b.life,38);assert.equal(f.a.hand.length,1);assert.equal(f.b.hand.length,0);assertGameStateInvariants(f.game);
 });
 test(role+': upkeep sacrifices exclude their source when printed and do not use an opponent creature',async()=>{
  for(const available of [false,true]){const f=context(M,role),source=put(M,f.game,f.a,'Lord of the Pit'),victim=creature(f,available?f.a:f.b);await f.game.emit('upkeep',{player:f.a});await settle(f.game);assert.equal(source.zone,'battlefield');assert.equal(victim.zone,available?'graveyard':'battlefield');assert.equal(f.a.life,available?40:33);assertGameStateInvariants(f.game);}
  const f=context(M,role),source=put(M,f.game,f.a,'Woebringer Demon');await f.game.emit('upkeep',{player:f.b});await settle(f.game);assert.equal(source.zone,'graveyard');assertGameStateInvariants(f.game);
 });
 test(role+': Doom Foretold binds the failing player while the source controller receives the reward',async()=>{
  const f=context(M,role),source=put(M,f.game,f.a,'Doom Foretold'),hand=put(M,f.game,f.b,'Forest','hand');await f.game.emit('upkeep',{player:f.b});await settle(f.game);assert.equal(source.zone,'graveyard');assert.equal(hand.zone,'graveyard');assert.equal(f.b.life,38);assert.equal(f.a.life,42);assert.equal(f.a.hand.length,1);const tokens=f.game.bf().filter(card=>card.isToken&&card.hasSub('Knight'));assert.equal(tokens.length,1);assert.equal(tokens[0].ctrl.idx,f.a.idx);assert.ok(tokens[0].kw('vigilance'));assertGameStateInvariants(f.game);
 });
 test(role+': one triggered discard can target multiple opponents and counts each qualified result',async()=>{
  const f=context(M,role,2),high=put(M,f.game,f.b,'Grizzly Bears','hand'),low=put(M,f.game,f.others[1],'Forest','hand');high.def={...high.def,cost:'{4}'};await cast(f,'Hollow Marauder',[f.b,f.others[1]]);await settle(f.game);assert.equal(high.zone,'graveyard');assert.equal(low.zone,'graveyard');assert.equal(f.a.hand.length,1);assertGameStateInvariants(f.game);
 });
 test(role+': Awaken the Erstwhile counts each player own discarded cards',async()=>{
  const f=context(M,role);for(let i=0;i<3;i++)put(M,f.game,f.a,'Forest','hand');put(M,f.game,f.b,'Forest','hand');await cast(f,'Awaken the Erstwhile');await settle(f.game);assert.equal(f.a.hand.length,0);assert.equal(f.b.hand.length,0);assert.equal(f.game.bf().filter(card=>card.isToken&&card.hasSub('Zombie')&&card.ctrl===f.a).length,3);assert.equal(f.game.bf().filter(card=>card.isToken&&card.hasSub('Zombie')&&card.ctrl===f.b).length,1);assertGameStateInvariants(f.game);
 });
 test(role+': native name choices remain legal when Forest is excluded by the printed restriction',async()=>{
  const f=context(M,role);for(const options of [[{key:'Sol Ring',label:'Sol Ring'}],[{key:'Grizzly Bears',label:'Grizzly Bears'},{key:'Shock',label:'Shock'}]]){const answer=await f.a.controller.decide(f.game,{type:'chooseOption',prompt:'Choose a nonland card name',options,searchableChoices:true,aiHint:{kind:'cardName'}});assert.ok(options.some(option=>option.key===answer));}
 });
 test(role+': named exile preserves fail-to-find in hidden zones and requires matching public graveyard cards',async()=>{
  const f=context(M,role),hand=put(M,f.game,f.b,'Grizzly Bears','hand'),grave=put(M,f.game,f.b,'Grizzly Bears','graveyard'),library=put(M,f.game,f.b,'Grizzly Bears','library'),wrong=put(M,f.game,f.b,'Shock','graveyard');let options;choose(f.a,(g,q)=>{if(q.prompt?.endsWith(': choose a card name')){options=q.options;return 'Grizzly Bears';}if(q.prompt==='Choose matching cards to exile')return [];});await cast(f,'Cranial Extraction',[f.b]);await settle(f.game);assert.equal(options.some(option=>option.key==='Forest'),false);assert.equal(grave.zone,'exile');assert.equal(hand.zone,'hand');assert.equal(library.zone,'library');assert.equal(wrong.zone,'graveyard');assertGameStateInvariants(f.game);
 });
 test(role+': named exile rewards count only selected cards from hand and enforce the printed cap',async()=>{
  const f=context(M,role),cards=Array.from({length:5},()=>put(M,f.game,f.b,'Grizzly Bears','hand')),grave=put(M,f.game,f.b,'Grizzly Bears','graveyard'),top=put(M,f.game,f.b,'Grizzly Bears','library');let max;choose(f.a,(g,q)=>{if(q.prompt?.endsWith(': choose a card name'))return 'Grizzly Bears';if(q.prompt==='Choose matching cards to exile'){max=q.max;return [cards[0],cards[1],grave,top];}});await cast(f,'Unmoored Ego',[f.b]);await settle(f.game);assert.equal(max,4);assert.equal(f.b.hand.length,5);assert.equal(f.b.exile.length,4);assert.ok(cards.slice(2).every(card=>card.zone==='hand'));assertGameStateInvariants(f.game);
 });
 test(role+': named discard and mill execute the matching branch and preserve a nonmatch',async()=>{
  for(const matching of [false,true]){const f=context(M,role),card=put(M,f.game,f.b,matching?'Grizzly Bears':'Forest','hand');choose(f.a,(g,q)=>q.prompt?.endsWith(': choose a card name')?'Grizzly Bears':undefined);await cast(f,'Brain Pry',[f.b]);await settle(f.game);assert.equal(card.zone,matching?'graveyard':'hand');assert.equal(f.a.hand.length,matching?0:1);const milled=put(M,f.game,f.b,matching?'Grizzly Bears':'Forest','library');await cast(f,'Lammastide Weave',[f.b]);await settle(f.game);assert.equal(milled.zone,'graveyard');assert.equal(f.a.life,matching?42:40);assertGameStateInvariants(f.game);}
 });
 test(role+': named reveal-until handles missing names and Tunnel Vision preserves library order when it finds the card',async()=>{
  for(const matching of [false,true]){const f=context(M,role),card=matching?put(M,f.game,f.a,'Grizzly Bears','library'):null;put(M,f.game,f.a,'Forest','library');const count=f.a.library.length;choose(f.a,(g,q)=>q.prompt?.endsWith(': choose a card name')?'Grizzly Bears':undefined);await cast(f,'Spoils of the Vault');await settle(f.game);assert.equal(f.a.life,40-(matching?1:count));assert.equal(f.a.exile.length,matching?1:count);if(card)assert.equal(card.zone,'hand');assertGameStateInvariants(f.game);}
  const f=context(M,role),named=put(M,f.game,f.b,'Grizzly Bears','library'),extra=put(M,f.game,f.b,'Forest','library');choose(f.a,(g,q)=>q.prompt?.endsWith(': choose a card name')?'Grizzly Bears':undefined);await cast(f,'Tunnel Vision',[f.b]);await settle(f.game);assert.equal(extra.zone,'graveyard');assert.equal(f.b.library.at(-1).iid,named.iid);assertGameStateInvariants(f.game);
 });
 test(role+': partial hand reveals let the affected player choose the subset and restrict the discard to that subset',async()=>{
  for(const count of [0,2,5]){const f=context(M,role),cards=Array.from({length:count},()=>put(M,f.game,f.b,'Grizzly Bears','hand')),revealed=cards.slice(-3);let offered;choose(f.b,(g,q)=>q.prompt==='Choose hand cards to reveal'?revealed:undefined);choose(f.a,(g,q)=>{if(q.prompt==='Choose revealed hand cards'){offered=q.from;return revealed.slice(0,1);}});await cast(f,'Blackmail',[f.b]);await settle(f.game);assert.deepEqual(Array.from(offered,c=>c.iid),revealed.map(c=>c.iid));assert.equal(f.b.graveyard.length,Math.min(1,count));assert.ok(cards.filter(c=>!revealed.includes(c)).every(c=>c.zone==='hand'));assertGameStateInvariants(f.game);}
 });
 test(role+': differently qualified hand selections discard one card in each mana-value range',async()=>{
  const f=context(M,role),low=put(M,f.game,f.b,'Shock','hand'),high=put(M,f.game,f.b,'Grizzly Bears','hand'),land=put(M,f.game,f.b,'Forest','hand');high.def={...high.def,cost:'{7}'};choose(f.a,(g,q)=>q.prompt==='Choose revealed hand cards'?[q.from.includes(low)?low:high]:undefined);await cast(f,'Distended Mindbender',[f.b]);await settle(f.game);assert.equal(low.zone,'graveyard');assert.equal(high.zone,'graveyard');assert.equal(land.zone,'hand');assertGameStateInvariants(f.game);
 });
 test(role+': Pulse checks remaining hand sizes after the discard and only then returns the spell',async()=>{
  for(const count of [1,4]){const f=context(M,role);for(let i=0;i<count;i++)put(M,f.game,f.b,'Grizzly Bears','hand');choose(f.b,(g,q)=>q.prompt==='Choose hand cards to reveal'?q.from.slice(0,q.min):undefined);choose(f.a,(g,q)=>q.prompt==='Choose revealed hand cards'?q.from.slice(0,q.min):undefined);const source=await cast(f,'Pulse of the Dross',[f.b]);await settle(f.game);assert.equal(source.zone,count===4?'hand':'graveyard');assert.equal(f.b.hand.length,count-1);assertGameStateInvariants(f.game);}
 });
 test(role+': chosen revealed-card counts exclude wrong colors and permit revealing zero',async()=>{
  for(const n of [0,2]){const f=context(M,role),white=[put(M,f.game,f.a,'Suntail Hawk','hand'),put(M,f.game,f.a,'Suntail Hawk','hand')],other=put(M,f.game,f.a,'Forest','hand'),reveals=[];let choices;f.game.revealToHuman=async data=>reveals.push(data);choose(f.a,(g,q)=>{if(q.prompt==='Choose any number of cards to reveal'){choices=q.from;return white.slice(0,n);}});await cast(f,'Scent of Jasmine');await settle(f.game);assert.equal(choices.includes(other),false);assert.equal(f.a.life,40+2*n);assert.ok(white.every(c=>c.zone==='hand'));assert.equal(reveals.length,n?1:0);if(n)assert.deepEqual(Array.from(reveals[0].cards,c=>c.iid),white.map(c=>c.iid));assertGameStateInvariants(f.game);}
 });
 test(role+': random hand reveals bind the actual revealed mana value and an empty hand has no effect',async()=>{
  for(const random of [0,.999]){const f=context(M,role),source=put(M,f.game,f.a,"Planeswalker's Mirth"),cards=[put(M,f.game,f.b,'Shock','hand'),put(M,f.game,f.b,'Grizzly Bears','hand')];cards[0].def={...cards[0].def,cost:'{3}'};cards[1].def={...cards[1].def,cost:'{7}'};f.game.rnd=()=>random;fund(f.a);choose(f.a,(g,q)=>q.type==='chooseTargets'?[f.b]:undefined);const ability=f.game.activatableList(f.a).find(a=>a.card===source);assert.ok(ability);assert.equal(await f.game.activateAbility(f.a,ability),true);await settle(f.game);assert.equal(f.a.life,random?47:43);assert.ok(cards.every(c=>c.zone==='hand'));for(const card of cards)await f.game.move(card,'graveyard');assert.equal(await f.game.activateAbility(f.a,ability),true);await settle(f.game);assert.equal(f.a.life,random?47:43);assertGameStateInvariants(f.game);}
 });
 test(role+': inspected-card fallback distinguishes mandatory movement from an optional move',async()=>{
  for(const name of ["Vivien's Grizzly",'Bucolic Ranch'])for(const matching of [false,true]){const f=context(M,role),source=put(M,f.game,f.a,name),card=put(M,f.game,f.a,matching?'Grizzly Bears':'Shock','library');if(name==='Bucolic Ranch'&&matching)card.def={...card.def,subtypes:['Mount']};fund(f.a);choose(f.a,(g,q)=>q.type==='chooseOption'&&q.prompt.startsWith('Move the inspected card')?'no':undefined);const ability=f.game.activatableList(f.a).find(a=>a.card===source&&a.ability&&!a.manaAbility);assert.ok(ability);assert.equal(await f.game.activateAbility(f.a,ability),true);await settle(f.game);assert.equal(card.zone,'library');assert.equal((name==="Vivien's Grizzly"?f.a.library[0]:f.a.library.at(-1)).iid,card.iid);assertGameStateInvariants(f.game);}
 });
 test(role+': graveyard exile creates a separately targeted reflexive trigger only for an actually exiled creature',async()=>{
  for(const kind of ['creature','noncreature','illegal']){const f=context(M,role),source=put(M,f.game,f.a,"Agatha's Soul Cauldron"),recipient=creature(f,f.a),card=put(M,f.game,f.b,kind==='noncreature'?'Shock':'Grizzly Bears','graveyard');let selections=0;choose(f.a,(g,q)=>{if(q.type==='chooseTargets'){selections++;return q.candidates.includes(card)?[card]:[recipient];}});const ability=f.game.activatableList(f.a).find(a=>a.card===source&&a.ability);assert.ok(ability);assert.equal(await f.game.activateAbility(f.a,ability),true);assert.equal(selections,1);if(kind==='illegal')await f.game.move(card,'hand');await f.game.resolveTop();assert.equal(recipient.counters['+1/+1']||0,0);await settle(f.game);assert.equal(card.zone,kind==='illegal'?'hand':'exile');assert.equal(recipient.counters['+1/+1']||0,kind==='creature'?1:0);assert.equal(selections,kind==='creature'?2:1);assertGameStateInvariants(f.game);}
 });
 test(role+': retarget retains an illegal target identity and the announced damage allocation',async()=>{
  for(const blink of [false,true]){const f=context(M,role),old=creature(f,f.a),second=creature(f,f.a),next=creature(f,f.b),object=await pendingDividedSpell(f,[old,second]),identity=object.targetIdentities[0][0],division=Array.from(object.damageDivision,r=>r.n);
   await f.game.move(old,'exile');if(blink)await f.game.putPermanentOntoBattlefield(old,f.a);const source=await cast(f,'Redirect',[object]);choose(f.a,(g,q)=>q.type==='chooseOption'&&q.prompt.includes(': keep or change target ')?q.prompt.includes('1.1?')?'no':'yes':q.type==='chooseTargets'&&q.prompt.endsWith(': choose a new target')?[next]:undefined);await f.game.resolveTop();assert.equal(source.zone,'graveyard');assert.equal(object.targets[0].length,2);assert.equal(object.targets[0][0].iid,old.iid);assert.equal(object.targetIdentities[0][0].zoneVersion,identity.zoneVersion);assert.equal(object.targets[0][1].iid,next.iid);assert.deepEqual(Array.from(object.damageDivision,r=>r.n),division);assert.equal(object.damageDivision[1].iid,next.iid);await settle(f.game);assert.equal(next.damage,3);assert.equal(second.damage,0);assert.equal(old.damage,0);assertGameStateInvariants(f.game);
  }
 });
 test(role+': retarget is atomic on an invalid new choice and retained targets do not trigger targeting again',async()=>{
  const f=context(M,role),one=creature(f,f.a),two=creature(f,f.a),next=creature(f,f.b),object=await pendingDividedSpell(f,[one,two]);const announced=Array.from(object.targets[0],c=>c.iid),original=f.game.emit.bind(f.game),events=[];f.game.emit=async(event,data)=>{if(event==='targeted')events.push(data.card.iid);return original(event,data);};
  await cast(f,'Redirect',[object]);choose(f.a,(g,q)=>q.type==='chooseOption'&&q.prompt.includes(': keep or change target ')?'yes':q.type==='chooseTargets'&&q.prompt.endsWith(': choose a new target')?[next,next]:undefined);await f.game.resolveTop();assert.deepEqual(Array.from(object.targets[0],c=>c.iid),announced);assert.equal(events.includes(next.iid),false);
  await cast(f,'Redirect',[object]);choose(f.a,(g,q)=>q.type==='chooseOption'&&q.prompt.includes(': keep or change target ')?q.prompt.includes('1.1?')?'yes':'no':q.type==='chooseTargets'&&q.prompt.endsWith(': choose a new target')?[next]:undefined);await f.game.resolveTop();assert.equal(events.filter(iid=>iid===next.iid).length,1);assert.equal(events.includes(two.iid),false);await settle(f.game);assert.equal(next.damage,2);assert.equal(two.damage,3);assertGameStateInvariants(f.game);
 });
 test(role+': Commandeer changes spell control while preserving ownership and a permanent resolves under its new controller',async()=>{
  const f=context(M,role),artifact=put(M,f.game,f.b,'Sol Ring','hand');fund(f.b);f.game.turnPlayer=f.b;assert.equal(await f.game.castSpell(f.b,artifact,{from:'hand'}),true);const object=f.game.stack.find(o=>o.card===artifact);await cast(f,'Commandeer',[object]);await settle(f.game);assert.equal(object.ctrl.idx,f.a.idx);assert.equal(artifact.zone,'battlefield');assert.equal(artifact.ctrl.idx,f.a.idx);assert.equal(artifact.owner.idx,f.b.idx);assertGameStateInvariants(f.game);
 });
 test(role+': linked hand exile returns the original card and cannot begin after the source leaves',async()=>{
  for(const name of ['Brain Maggot','Kitesail Freebooter','Deep-Cavern Bat']){const f=context(M,role),land=put(M,f.game,f.b,'Forest','hand'),chosen=put(M,f.game,f.b,'Shock','hand');let query;choose(f.a,(g,q)=>{if(q.prompt==='Choose a card from the indicated zones'){query=q;return [chosen];}});const source=await cast(f,name,[f.b]);await settle(f.game);assert.equal(chosen.zone,'exile',name);assert.equal(land.zone,'hand');assert.equal(query.from.includes(land),false);await f.game.move(source,'graveyard');await settle(f.game);assert.equal(chosen.zone,'hand');
   const late=await cast(f,name,[f.b]);await f.game.resolveTop();await f.game.move(late,'graveyard');await settle(f.game);assert.equal(chosen.zone,'hand',name+' duration ended before exile');assertGameStateInvariants(f.game);
  }
 });
 test(role+': hand selections preserve shared color constraints and use selected toughness before discarding',async()=>{
  const f=context(M,role),greenSpell=put(M,f.game,f.b,'Giant Growth','hand'),greenCreature=put(M,f.game,f.b,'Grizzly Bears','hand'),whiteCreature=put(M,f.game,f.b,'Suntail Hawk','hand');greenCreature.def={...greenCreature.def,toughness:'7'};let candidates;choose(f.a,(g,q)=>{if(q.prompt==='Choose a card from the indicated zones'){candidates=q.from;return [greenCreature];}});await cast(f,"Talara's Bane",[f.b]);await settle(f.game);assert.equal(candidates.includes(greenSpell),false);assert.ok(candidates.includes(greenCreature));assert.ok(candidates.includes(whiteCreature));assert.equal(greenCreature.zone,'graveyard');assert.equal(f.a.life,47);assert.equal(greenSpell.zone,'hand');assertGameStateInvariants(f.game);
 });
 test(role+': library hand choices use top, third and bottom positions and expose only the top library card',async()=>{
  for(const [name,index]of [['Painful Memories',-1],['Lost Hours',-3]]){const f=context(M,role),card=put(M,f.game,f.b,'Shock','hand');choose(f.a,(g,q)=>q.prompt==='Choose a card from the indicated zones'?[card]:undefined);await cast(f,name,[f.b]);await settle(f.game);assert.equal(f.b.library.at(index)?.iid,card.iid);assertGameStateInvariants(f.game);}
  for(const top of [false,true]){const f=context(M,role),hand=put(M,f.game,f.b,'Shock','hand'),library=f.b.library.at(-1),deep=f.b.library.at(-2);let candidates;choose(f.a,(g,q)=>{if(q.prompt==='Choose a card from the indicated zones'){candidates=q.from;return [top?library:hand];}});await cast(f,'Psychotic Episode',[f.b]);await settle(f.game);assert.ok(candidates.includes(library));assert.equal(candidates.includes(deep),false);assert.equal(f.b.library[0]?.iid,(top?library:hand).iid);assertGameStateInvariants(f.game);}
 });
 test(role+': the damaged player is bound without a new target and every compiled target is nonnull',async()=>{
  for(const card of rows){const plan=semanticClass(card,{compilerVersion:20});const visit=node=>{if(!node||typeof node!=='object')return;if(node.targets)assert.ok(node.targets.every(Boolean),card.name);for(const child of Object.values(node))if(typeof child==='object')Array.isArray(child)?child.forEach(visit):visit(child);};visit(plan.implementation);}
  const f=context(M,role,2),source=put(M,f.game,f.a,'Ghastlord of Fugue'),one=put(M,f.game,f.b,'Forest','hand'),other=put(M,f.game,f.others[1],'Forest','hand');await f.game.emit('combatDamageToPlayer',{card:source,player:f.b,n:4});await settle(f.game);assert.equal(one.zone,'exile');assert.equal(other.zone,'hand');assert.equal(f.trace.filter(row=>row.q.type==='chooseTargets').length,0);assertGameStateInvariants(f.game);
 });
 test(role+': per-player targets retain their announced player and exclude other targets from that player',async()=>{
  for(const change of ['none','control','blink']){const f=context(M,role,2),one=creature(f,f.b,{types:['Artifact','Creature']}),duplicate=creature(f,f.b,{types:['Artifact','Creature']}),two=creature(f,f.others[1],{types:['Artifact','Creature']});await cast(f,"Bilbo's Burglaring",[one,two]);if(change==='control')M.OracleV8Control.gain(f.game,one,f.others[1]);if(change==='blink'){await f.game.move(one,'exile');await f.game.putPermanentOntoBattlefield(one,f.b);}await settle(f.game);assert.equal(two.ctrl,f.a);assert.equal(one.ctrl,change==='none'?f.a:change==='control'?f.others[1]:f.b);assert.equal(duplicate.ctrl,f.b);assertGameStateInvariants(f.game);}
  const f=context(M,role,2),one=creature(f,f.b,{types:['Artifact','Creature']}),two=creature(f,f.b,{types:['Artifact','Creature']}),card=put(M,f.game,f.a,"Bilbo's Burglaring",'hand');fund(f.a);choose(f.a,(g,q)=>q.type==='chooseTargets'?[one,two]:undefined);assert.equal(await f.game.castSpell(f.a,card,{from:'hand'}),false);assert.equal(card.zone,'hand');assertGameStateInvariants(f.game);
 });
 test(role+': per-player exile gives each original controller its creature power and control effects process all players',async()=>{
  const f=context(M,role,2),one=creature(f,f.b,{power:3}),two=creature(f,f.others[1],{power:7});await cast(f,'Luminate Primordial',[one,two]);await settle(f.game);assert.equal(one.zone,'exile');assert.equal(two.zone,'exile');assert.equal(f.b.life,43);assert.equal(f.others[1].life,47);assert.equal(f.a.life,40);
  const g=context(M,role,2),a=creature(g,g.b),b=creature(g,g.others[1]);a.tapped=b.tapped=true;await cast(g,'Molten Primordial',[a,b]);await settle(g.game);assert.equal(a.ctrl,g.a);assert.equal(b.ctrl,g.a);assert.equal(a.tapped,false);assert.equal(b.tapped,false);assert.ok(a.kw('haste'));assert.ok(b.kw('haste'));assertGameStateInvariants(f.game);assertGameStateInvariants(g.game);
 });
 test(role+': counter-and-damage uses the creature spell power captured before it leaves the stack',async()=>{
  const f=context(M,role),creatureSpell=put(M,f.game,f.b,'Grizzly Bears','hand');creatureSpell.def={...creatureSpell.def,power:'6',toughness:'8'};f.game.turnPlayer=f.b;fund(f.b);assert.equal(await f.game.castSpell(f.b,creatureSpell,{from:'hand'}),true);const pending=f.game.stack.at(-1);await cast(f,'Essence Backlash',[pending]);await settle(f.game);assert.equal(creatureSpell.zone,'graveyard');assert.equal(f.b.life,34);assertGameStateInvariants(f.game);
 });
 test(role+': an existential graveyard condition remains true after milling a second Elf',async()=>{
  for(const elves of [0,2]){const f=context(M,role);for(let i=0;i<elves;i++){const c=put(M,f.game,f.a,'Grizzly Bears',i===0?'graveyard':'library');c.def={...c.def,subtypes:['Elf']};}await cast(f,'Trystan, Callous Cultivator // Trystan, Penitent Culler');await settle(f.game);assert.equal(f.a.graveyard.filter(c=>c.hasSub('Elf')).length,elves);assert.equal(f.a.life,elves?42:40);assertGameStateInvariants(f.game);}
 });
 test(role+': hand and graveyard choices respect card filters and an empty selection keeps independent instructions',async()=>{
  const f=context(M,role),land=put(M,f.game,f.b,'Forest','hand'),grave=put(M,f.game,f.b,'Grizzly Bears','graveyard'),legendary=put(M,f.game,f.b,'Grizzly Bears','hand'),plain=put(M,f.game,f.b,'Grizzly Bears','hand');legendary.def={...legendary.def,super:['Legendary']};f.game.recalc();
  choose(f.a,(g,q)=>q.prompt==='Choose a card from the indicated zones'?[q.from.includes(grave)?grave:plain].filter(c=>q.from.includes(c)):undefined);await cast(f,'Never Happened',[f.b]);await settle(f.game);assert.equal(grave.zone,'exile');assert.equal(land.zone,'hand');
  await cast(f,'Lay Bare the Heart',[f.b]);await settle(f.game);assert.equal(plain.zone,'graveyard');assert.equal(legendary.zone,'hand');assert.equal(land.zone,'hand');
  const empty=context(M,role);await cast(empty,'Agonizing Remorse',[empty.b]);await settle(empty.game);assert.equal(empty.a.life,39);assert.equal(empty.b.life,40);assertGameStateInvariants(f.game);assertGameStateInvariants(empty.game);
 });
 test(role+': choosing or declining a revealed card executes exactly the corresponding branch',async()=>{
  for(const accept of [true,false]){const f=context(M,role),cards=Array.from({length:3},()=>put(M,f.game,f.b,'Grizzly Bears','hand'));choose(f.a,(g,q)=>q.prompt==='Choose a card from the indicated zones'?(accept?[cards[0]]:[]):undefined);await cast(f,'Nightsnare',[f.b]);await settle(f.game);assert.equal(f.b.graveyard.length,accept?1:2);assert.equal(f.b.hand.length,accept?2:1);assertGameStateInvariants(f.game);}
  for(const instant of [true,false]){const f=context(M,role),card=put(M,f.game,f.b,instant?'Shock':'Grizzly Bears','hand');choose(f.a,(g,q)=>q.prompt==='Choose a card from the indicated zones'?[card]:undefined);await cast(f,'Check for Traps',[f.b]);await settle(f.game);assert.equal(card.zone,'exile');assert.equal(f.a.life,instant?40:39);assert.equal(f.b.life,instant?39:40);assertGameStateInvariants(f.game);}
 });
 test(role+': a hand-size emblem survives its planeswalker and applies only to its controller',async()=>{
  const f=context(M,role),walker=put(M,f.game,f.a,'Mordenkainen');f.game.addCounters(walker,'loyalty',10);for(let i=0;i<3;i++)put(M,f.game,f.a,'Grizzly Bears','hand');const hand=Array.from(f.a.hand),library=Array.from(f.a.library),ability=f.game.activatableList(f.a).find(e=>e.card===walker&&e.ability?.loyalty===-10);assert.ok(ability);assert.equal(await f.game.activateAbility(f.a,ability),true);await settle(f.game);assert.equal(f.a.hand.length,library.length);assert.equal(f.a.library.length,hand.length);assert.ok(library.every(c=>c.zone==='hand'));assert.ok(hand.every(c=>c.zone==='library'));assert.equal(f.a.emblems.length,1);await f.game.move(walker,'graveyard');assert.equal(f.game.maximumHandSize(f.a),Infinity);assert.equal(f.game.maximumHandSize(f.b),7);assert.equal(f.a.emblems[0].zone,'command');assertGameStateInvariants(f.game);
 });
 test(role+': hand redraw choices preserve bottom order, draw the chosen count and allow choosing zero',async()=>{
  for(const count of [0,2]){const f=context(M,role),hand=Array.from({length:3},()=>put(M,f.game,f.a,'Grizzly Bears','hand'));
   choose(f.a,(g,q)=>q.type==='chooseOption'&&q.aiHint?.kind==='mode'?'1':q.type==='chooseCards'&&q.prompt.startsWith('Choose hand cards')?hand.slice(0,count):undefined);
   await cast(f,'Into the Fire');await settle(f.game);assert.equal(f.a.hand.length,4);assert.deepEqual(Array.from(f.a.library.slice(0,count)),hand.slice(0,count));assert.ok(hand.slice(count).every(c=>c.zone==='hand'));assert.equal(f.b.hand.length,0);assertGameStateInvariants(f.game);
  }
 });
 test(role+': each-player hand shuffle preserves each player\'s own count and exiled-hand permissions expire',async()=>{
  const f=context(M,role),warrior=put(M,f.game,f.a,'Whirlpool Warrior');for(let i=0;i<3;i++)put(M,f.game,f.a,'Grizzly Bears','hand');for(let i=0;i<2;i++)put(M,f.game,f.b,'Grizzly Bears','hand');fund(f.a);
  const ability=f.game.activatableList(f.a).find(e=>e.card===warrior&&e.ability);assert.equal(await f.game.activateAbility(f.a,ability),true);await settle(f.game);assert.equal(f.a.hand.length,3);assert.equal(f.b.hand.length,2);assert.equal(warrior.zone,'graveyard');
  const hand=Array.from(f.a.hand);await cast(f,'Hex Magic');await settle(f.game);assert.equal(f.a.hand.length,3);assert.ok(hand.every(c=>c.zone==='exile'&&c.meta.playableBy===f.a));assert.equal(f.b.hand.length,2);const allowed=f.game.playableLands(f.a).filter(c=>hand.includes(c));assert.ok(allowed.length);f.a.turnsStarted+=2;assert.equal(f.game.playableLands(f.a).filter(c=>hand.includes(c)).length,0);assertGameStateInvariants(f.game);
 });
 test(role+': a unique modal optional effect can be declined while still consuming the mode',async()=>{
  const f=context(M,role),gandalf=put(M,f.game,f.a,'Gandalf the Grey'),target=creature(f,f.b),options=[];
  choose(f.a,(g,q)=>{if(q.type==='chooseOption'&&q.aiHint?.kind==='mode'){options.push(q.options.map(o=>o.key));return q.options[0].key;}if(q.prompt==='Use this optional effect?')return 'no';if(q.type==='chooseTargets')return [q.spec?.what==='permanent'?target:f.b].filter(c=>q.candidates.includes(c));});
  fund(f.a);let spell=put(M,f.game,f.a,'Shock','hand');assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);await settle(f.game);assert.equal(target.tapped,false);assert.deepEqual(options[0],['0','1','2','3']);spell=put(M,f.game,f.a,'Shock','hand');assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);await settle(f.game);assert.deepEqual(options[1],['1','2','3']);assert.equal(gandalf.zone,'battlefield');assertGameStateInvariants(f.game);
 });
 test(role+': reanimated Vehicle delay follows the returned object and only its controller\'s end step',async()=>{
  const f=context(M,role),greasefang=put(M,f.game,f.a,'Greasefang, Okiba Boss'),vehicle=put(M,f.game,f.a,'Grizzly Bears','graveyard');vehicle.def={...vehicle.def,types:['Artifact'],subtypes:['Vehicle']};f.game.recalc();choose(f.a,(g,q)=>q.type==='chooseTargets'?[vehicle].filter(c=>q.candidates.includes(c)):undefined);
  await f.game.emit('beginCombat',{player:f.a});await settle(f.game);assert.equal(vehicle.zone,'battlefield');assert.equal(vehicle.kw('haste'),true);await f.game.emit('endStep',{player:f.b});await settle(f.game);assert.equal(vehicle.zone,'battlefield');await f.game.emit('endStep',{player:f.a});await settle(f.game);assert.equal(vehicle.zone,'hand');assert.equal(greasefang.zone,'battlefield');assertGameStateInvariants(f.game);
 });
 test(role+': created tokens keep their named characteristics and delayed instructions execute at the printed step',async()=>{
  const f=context(M,role),caterpillar=put(M,f.game,f.a,'Giant Caterpillar');fund(f.a);let entry=f.game.activatableList(f.a).find(e=>e.card===caterpillar&&e.ability);assert.ok(entry);assert.equal(await f.game.activateAbility(f.a,entry),true);await settle(f.game);assert.equal(caterpillar.zone,'graveyard');assert.equal(f.game.bf().filter(c=>c.isToken).length,0);
  await f.game.emit('endStep',{player:f.a});await settle(f.game);const butterfly=f.game.bf().find(c=>c.name==='Butterfly');assert.ok(butterfly);assert.equal(butterfly.kw('flying'),true);await f.game.emit('endStep',{player:f.b});await settle(f.game);assert.equal(f.game.bf().filter(c=>c.name==='Butterfly').length,1);
  const cannon=put(M,f.game,f.a,'Hornet Cannon');entry=f.game.activatableList(f.a).find(e=>e.card===cannon&&e.ability);assert.equal(await f.game.activateAbility(f.a,entry),true);await settle(f.game);const hornet=f.game.bf().find(c=>c.name==='Hornet');assert.ok(hornet);assert.equal(hornet.kw('haste'),true);await f.game.emit('endStep',{player:f.a});await settle(f.game);assert.equal(hornet.zone,'ceased');assert.equal(butterfly.zone,'battlefield');
  await cast(f,'Waylay');await settle(f.game);const knights=f.game.bf().filter(c=>c.isToken&&c.hasSub('Knight'));assert.equal(knights.length,3,JSON.stringify(f.game.bf().map(c=>({name:c.name,token:c.isToken,types:c.cur.subtypes}))));await f.game.emit('endStep',{player:f.a});await settle(f.game);assert.ok(knights.every(c=>c.zone==='battlefield'));await f.game.emit('cleanupStep',{player:f.a});await settle(f.game);assert.ok(knights.every(c=>c.zone==='ceased'));assertGameStateInvariants(f.game);
 });
 test(role+': a delayed target-player draw stays bound to the announced player and triggers once',async()=>{
  const f=context(M,role);choose(f.a,(g,q)=>q.type==='chooseOption'&&q.aiHint?.kind==='mode'?'0':undefined);await cast(f,'Sapphire Charm',[f.b]);await settle(f.game);assert.equal(f.b.hand.length,0);await f.game.emit('upkeep',{player:f.a});await settle(f.game);assert.equal(f.b.hand.length,1);assert.equal(f.a.hand.length,0);await f.game.emit('upkeep',{player:f.b});await settle(f.game);assert.equal(f.b.hand.length,1);assertGameStateInvariants(f.game);
 });
 test(role+': a chosen exiled card alone gains play permission and the printed duration expires',async()=>{
  const f=context(M,role);choose(f.a,(g,q)=>q.type==='chooseOption'&&q.aiHint?.kind==='mode'?'0':undefined);await cast(f,"Heroes' Hangout");await settle(f.game);assert.equal(f.a.exile.length,2);const allowed=f.a.exile.filter(c=>c.meta.playableBy===f.a);assert.equal(allowed.length,1);assert.ok(f.game.playableLands(f.a).includes(allowed[0]));assert.equal(f.game.playableLands(f.a).filter(c=>f.a.exile.includes(c)).length,1);f.a.turnsStarted+=2;assert.equal(f.game.playableLands(f.a).filter(c=>f.a.exile.includes(c)).length,0);assertGameStateInvariants(f.game);
 });
 test(role+': copying another unique-mode source creates a fresh instance of its ability',async()=>{
  const f=context(M,role),one=put(M,f.game,f.a,'Silent Hallcreeper'),two=put(M,f.game,f.a,'Silent Hallcreeper'),options=[];
  choose(f.a,(g,q)=>{if(q.type==='chooseOption'&&q.aiHint?.kind==='mode'){options.push(q.options.map(o=>o.key));return q.options[0].key;}if(q.type==='chooseTargets')return [two].filter(c=>q.candidates.includes(c));});
  for(let i=0;i<4;i++){const dealt=await f.game.damagePlayer(one,f.b,1,{combat:true});await f.game.emit('combatDamageToPlayer',{card:one,player:f.b,n:dealt});await settle(f.game);}
  assert.deepEqual(options,[['0','1','2'],['1','2'],['2'],['0','1','2']]);assert.equal(one.counters['+1/+1'],4);assert.equal(one.isCopyOf.name,'Silent Hallcreeper');assertGameStateInvariants(f.game);
 });
 test(role+': unique modal triggers record choices while stacking, suppress exhausted choices and reset each turn',async()=>{
  const f=context(M,role),gala=put(M,f.game,f.a,'Gala Greeters'),witness=creature(f,f.a),options=[];
  choose(f.a,(g,q)=>{if(q.type==='chooseOption'&&q.aiHint?.kind==='mode'){options.push(q.options.map(o=>o.key));return q.options[0].key;}});
  for(let i=0;i<4;i++)await f.game.emit('etb',{card:witness});
  await f.game.flushTriggers();assert.deepEqual(options,[['0','1','2'],['1','2'],['2']]);assert.equal(f.game.stack.length,3);
  const countered=f.game.stack.at(-1);assert.equal(await f.game.counterStackObject(countered),true);await settle(f.game);
  assert.equal(gala.counters['+1/+1'],1);assert.equal(f.game.bf().filter(c=>c.isToken&&c.hasSub('Treasure')).length,1);assert.equal(f.a.life,40);
  await f.game.emit('etb',{card:witness});await settle(f.game);assert.equal(options.length,3,'countered mode remains chosen');
  f.game.turnNo++;await f.game.emit('etb',{card:witness});await settle(f.game);assert.deepEqual(options.at(-1),['0','1','2']);assert.equal(gala.counters['+1/+1'],2);
  await f.game.move(gala,'exile');await f.game.putPermanentOntoBattlefield(gala,f.a);await f.game.emit('etb',{card:witness});await settle(f.game);assert.deepEqual(options.at(-1),['0','1','2']);assert.equal(gala.counters['+1/+1'],1);assertGameStateInvariants(f.game);
 });
 test(role+': object-scoped modal history survives turns but resets for a new battlefield object',async()=>{
  const f=context(M,role),pact=put(M,f.game,f.a,'Demonic Pact'),options=[];
  choose(f.a,(g,q)=>{if(q.type==='chooseOption'&&q.aiHint?.kind==='mode'){options.push(q.options.map(o=>o.key));return q.options[0].key;}});
  for(let i=0;i<4;i++){await f.game.emit('upkeep',{player:f.a});await f.game.flushTriggers();assert.equal(f.game.stack.length,1);assert.equal(await f.game.counterStackObject(f.game.stack[0]),true);f.game.turnNo++;}
  assert.deepEqual(options,[['0','1','2','3'],['1','2','3'],['2','3'],['3']]);await f.game.emit('upkeep',{player:f.a});await settle(f.game);assert.equal(options.length,4);
  await f.game.move(pact,'exile');await f.game.putPermanentOntoBattlefield(pact,f.a);await f.game.emit('upkeep',{player:f.a});await f.game.flushTriggers();assert.deepEqual(options.at(-1),['0','1','2','3']);await f.game.counterStackObject(f.game.stack[0]);assertGameStateInvariants(f.game);
 });
 test(role+': graveyard power ranges use card characteristics and no-counter targets reject every counter kind',async()=>{
  const f=context(M,role),small=put(M,f.game,f.a,'Grizzly Bears','graveyard'),large=put(M,f.game,f.a,'Grizzly Bears','graveyard');small.def={...small.def,power:'2',toughness:'3'};large.def={...large.def,power:'4',toughness:'5'};choose(f.a,(g,q)=>q.type==='chooseOption'&&q.aiHint?.kind==='mode'?'1':undefined);await cast(f,'Graceful Restoration',[small,large]);await settle(f.game);assert.equal(small.zone,'battlefield');assert.equal(large.zone,'graveyard');
  const protectedByCounter=creature(f,f.b);f.game.addCounters(protectedByCounter,'charge',1);choose(f.a,(g,q)=>q.type==='chooseOption'&&q.aiHint?.kind==='mode'?'0':undefined);const c=put(M,f.game,f.a,'Heartless Act','hand');fund(f.a);choose(f.a,(g,q)=>q.type==='chooseTargets'?[protectedByCounter]:undefined);assert.equal(await f.game.castSpell(f.a,c,{from:'hand'}),false);assert.equal(c.zone,'hand');assertGameStateInvariants(f.game);
 });
 test(role+': dice tables execute every printed outcome using the engine dice event',async()=>{
  for(const rolled of [1,10,20]){const f=context(M,role);f.game.rnd=()=>((rolled-.5)/20);const events=[];const emit=f.game.emit.bind(f.game);f.game.emit=async(name,data,...args)=>{if(name==='diceRolled')events.push(data);return emit(name,data,...args);};await cast(f,'Contact Other Plane');await settle(f.game);assert.equal(events.length,1);assert.equal(events[0].results[0],rolled);assert.equal(f.a.hand.length,rolled===20?3:2);assertGameStateInvariants(f.game);}
 });
 test(role+': Mutiny reevaluates the relationship between the controllers of both targets',async()=>{
  for(const change of ['first','both','blink','leave']){
   const f=context(M,role,2),source=creature(f,f.b,{power:4}),victim=creature(f,f.b),third=f.others[1];await cast(f,'Mutiny',[source,victim]);
   if(change==='first'||change==='both'){M.OracleV8Control.gain(f.game,source,third);if(change==='both')M.OracleV8Control.gain(f.game,victim,third);}
   if(change==='blink'){await f.game.move(source,'exile');await f.game.putPermanentOntoBattlefield(source,f.b);}
   if(change==='leave')await f.game.move(source,'graveyard');
   await settle(f.game);assert.equal(victim.damage,change==='both'?4:0,change);assertGameStateInvariants(f.game);
  }
 });
 test(role+': delayed death triggers track the original object and its controller at death',async()=>{
  const f=context(M,role),victim=creature(f,f.b,{toughness:20});await cast(f,'Searing Blood',[victim]);await settle(f.game);assert.equal(f.b.life,40);M.OracleV8Control.gain(f.game,victim,f.a);f.game.recalc();await f.game.destroy(victim);await settle(f.game);assert.equal(f.a.life,37);assert.equal(f.b.life,40);
  const blink=creature(f,f.b);await cast(f,'Make Your Mark',[blink]);await settle(f.game);await f.game.move(blink,'exile');await f.game.putPermanentOntoBattlefield(blink,f.b);await f.game.destroy(blink);await settle(f.game);assert.equal(f.game.bf().filter(c=>c.isToken&&c.hasSub('Spirit')).length,0);assertGameStateInvariants(f.game);
 });
 test(role+': Graceful Reprieve returns a dying target once and Burn Away exiles its graveyard',async()=>{
  const f=context(M,role),victim=creature(f,f.b,{toughness:2});await cast(f,'Graceful Reprieve',[victim]);await settle(f.game);await f.game.destroy(victim);await settle(f.game);assert.equal(victim.zone,'battlefield');await f.game.destroy(victim);await settle(f.game);assert.equal(victim.zone,'graveyard');const burned=creature(f,f.b,{toughness:2});await cast(f,'Burn Away',[burned]);await settle(f.game);assert.equal(burned.zone,'exile');assert.equal(victim.zone,'exile');assert.equal(f.b.graveyard.length,0);assertGameStateInvariants(f.game);
 });
 test(role+': Soulshriek sacrifice respects delayed control and original identity',async()=>{
  for(const change of ['none','controller','blink']){const f=context(M,role),victim=creature(f,f.a);put(M,f.game,f.a,'Grizzly Bears','graveyard');await cast(f,'Soulshriek',[victim]);await settle(f.game);assert.equal(victim.power,4);if(change==='controller')M.OracleV8Control.gain(f.game,victim,f.b);if(change==='blink'){await f.game.move(victim,'exile');await f.game.putPermanentOntoBattlefield(victim,f.a);}await f.game.emit('endStep',{player:f.a});await settle(f.game);assert.equal(victim.zone,change==='none'?'graveyard':'battlefield',change);assertGameStateInvariants(f.game);}
 });
 test(role+': Laquatus snapshots hand size before drawing and does not double the discard count',async()=>{
  const f=context(M,role);for(let i=0;i<3;i++)put(M,f.game,f.b,'Island','hand');await cast(f,"Laquatus's Creativity",[f.b]);await settle(f.game);assert.equal(f.b.hand.length,3);assert.equal(f.b.graveyard.length,3);assert.equal(f.b.library.length,27);assertGameStateInvariants(f.game);
 });
 test(role+': Public Execution remembers the destroyed creature controller and excludes the original object',async()=>{
  const f=context(M,role,2),victim=creature(f,f.b),ally=creature(f,f.b),unrelated=creature(f,f.others[1]),own=creature(f,f.a);await cast(f,'Public Execution',[victim]);await settle(f.game);assert.equal(victim.zone,'graveyard');assert.equal(ally.power,1);assert.equal(unrelated.power,3);assert.equal(own.power,3);assertGameStateInvariants(f.game);
 });
 test(role+': Public Execution preserves an indestructible original and only weakens its other creatures',async()=>{
  const f=context(M,role),victim=creature(f,f.b,{kws:['indestructible']}),ally=creature(f,f.b);await cast(f,'Public Execution',[victim]);await settle(f.game);assert.equal(victim.zone,'battlefield');assert.equal(victim.power,3);assert.equal(ally.power,1);assertGameStateInvariants(f.game);
 });
 test(role+': multi-recipient bite simultaneously damages every legal locked target',async()=>{
  const f=context(M,role),source=creature(f,f.a,{power:4}),one=creature(f,f.b),two=creature(f,f.b);await cast(f,'Betrayal at the Vault',[source,one,two]);await settle(f.game);assert.equal(one.damage,4);assert.equal(two.damage,4);assert.equal(source.damage,0);assertGameStateInvariants(f.game);
 });
 test(role+': a vanished bite source deals no damage, while a vanished victim does not suppress the other victim',async()=>{
  const f=context(M,role),source=creature(f,f.a,{power:4}),one=creature(f,f.b),two=creature(f,f.b);await cast(f,'Betrayal at the Vault',[source,one,two]);await f.game.move(one,'exile');await settle(f.game);assert.equal(two.damage,4);two.damage=0;const three=creature(f,f.b);await cast(f,'Betrayal at the Vault',[source,two,three]);await f.game.move(source,'exile');await settle(f.game);assert.equal(two.damage,0);assert.equal(three.damage,0);assertGameStateInvariants(f.game);
 });
 test(role+': chosen Giants deal damage without being targeted and no Giant means no damage',async()=>{
  const f=context(M,role),giant=creature(f,f.a,{power:7,subtypes:['Giant'],kws:['shroud']}),victim=creature(f,f.b);await cast(f,'Crush Underfoot',[victim]);await settle(f.game);assert.equal(victim.damage,7);await f.game.move(giant,'exile');victim.damage=0;await cast(f,'Crush Underfoot',[victim]);await settle(f.game);assert.equal(victim.damage,0);assertGameStateInvariants(f.game);
 });
 test(role+': sacrifice categories consume distinct creatures and leave unrelated permanents',async()=>{
  const f=context(M,role),artifact=creature(f,f.b,{types:['Artifact','Creature']}),ordinary=creature(f,f.b),extra=put(M,f.game,f.b,'Sol Ring'),own=creature(f,f.a);await cast(f,'Perilous Predicament');await settle(f.game);assert.equal(artifact.zone,'graveyard');assert.equal(ordinary.zone,'graveyard');assert.equal(extra.zone,'battlefield');assert.equal(own.zone,'battlefield');assertGameStateInvariants(f.game);
 });
 test(role+': Devour Flesh uses sacrificed last-known toughness and gives no life without a creature',async()=>{
  const f=context(M,role),victim=creature(f,f.b,{toughness:6});await cast(f,'Devour Flesh',[f.b]);await settle(f.game);assert.equal(victim.zone,'graveyard');assert.equal(f.b.life,46);await cast(f,'Devour Flesh',[f.b]);await settle(f.game);assert.equal(f.b.life,46);assertGameStateInvariants(f.game);
 });
 test(role+': Killing Wave offers each permanent payment and refuses unavailable life',async()=>{
  const f=context(M,role),keep=creature(f,f.a),lose=creature(f,f.b);f.b.life=2;choose(f.a,(g,q)=>q.type==='chooseOption'&&q.prompt.startsWith('Pay ')?'yes':undefined);choose(f.b,(g,q)=>q.type==='chooseOption'?'yes':undefined);await cast(f,'Killing Wave',[],{xVal:3});await settle(f.game);assert.equal(keep.zone,'battlefield');assert.equal(f.a.life,37);assert.equal(lose.zone,'graveyard');assert.equal(f.b.life,2);assertGameStateInvariants(f.game);
 });
 test(role+': Rhystic Tutor lets an opponent pay before searching and respects a declined payment',async()=>{
  const f=context(M,role);choose(f.a,(g,q)=>q.type==='chooseOption'?'no':undefined);fund(f.b);choose(f.b,(g,q)=>q.type==='chooseOption'?'yes':undefined);await cast(f,'Rhystic Tutor');await settle(f.game);assert.equal(f.a.hand.length,0);choose(f.b,(g,q)=>q.type==='chooseOption'?'no':undefined);await cast(f,'Rhystic Tutor');await settle(f.game);assert.equal(f.a.hand.length,1);assertGameStateInvariants(f.game);
 });
 test(role+': number choice permits zero without sacrifices and applies a positive shared number',async()=>{
  const f=context(M,role),a=creature(f,f.a),b=creature(f,f.b);choose(f.a,(g,q)=>q.type==='chooseOption'&&q.prompt==='Choose a number'?'0':undefined);await cast(f,'By Invitation Only');await settle(f.game);assert.equal(a.zone,'battlefield');assert.equal(b.zone,'battlefield');choose(f.a,(g,q)=>q.type==='chooseOption'&&q.prompt==='Choose a number'?'1':undefined);await cast(f,'By Invitation Only');await settle(f.game);assert.equal(a.zone,'graveyard');assert.equal(b.zone,'graveyard');assertGameStateInvariants(f.game);
 });
 test(role+': Fossil Find returns exactly one random card and orders the remaining graveyard',async()=>{
  const f=context(M,role);for(const name of ['Island','Forest','Grizzly Bears'])put(M,f.game,f.a,name,'graveyard');await cast(f,'Fossil Find');await settle(f.game);assert.equal(f.a.hand.length,1);assert.equal(f.a.graveyard.length,3);assertGameStateInvariants(f.game);
 });
}



