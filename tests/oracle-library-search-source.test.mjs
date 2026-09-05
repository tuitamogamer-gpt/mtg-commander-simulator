import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import{semanticClass}from'../scripts/import-oracle-batch.mjs';
import{loadEngine}from'./helpers/load-engine.mjs';
import{context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
const inputs=JSON.parse(readFileSync(new URL('./fixtures/oracle-library-search-source.json',import.meta.url)));
const cards=inputs.map((c,i)=>{const result=semanticClass(c,{compilerVersion:8});assert.ok(result.semanticClass,c.name+': '+result.reason);const[type,subtypes='']=c.type_line.split(' — '),words=type.split(' ');return{position:i+1,oracleId:c.oracle_id,scryfallId:c.id,...result,raw:{name:c.name,cost:c.mana_cost,oracle:c.oracle_text,types:words.filter(w=>w!=='Legendary'),super:words.includes('Legendary')?['Legendary']:[],subtypes:subtypes.split(' ').filter(Boolean),power:c.power,toughness:c.toughness,loyalty:c.loyalty,_ci:c.color_identity},catalog:{typeLine:c.type_line,commanderLegality:'legal'}};});
const M=loadEngine(),missing=cards.filter(c=>!M.DEFS[c.raw.name]);if(missing.length){M.registerOracleBatch({id:'oracle-library-search-source',sequence:9997,cards:missing});M.initData(M.RAW_DATA);}
test('named searches preserve literal name commas while rejecting embedded instructions',()=>{
 const input={name:'Named library search boundary',type_line:'Sorcery',layout:'normal',mana_cost:'{G}'};
 const good=semanticClass({...input,oracle_text:"Search your library for a card named Urza, Lord High Artificer or Ashling, the Pilgrim, put that card into your hand, then shuffle."},{compilerVersion:8});
 assert.ok(good.semanticClass);assert.deepEqual(good.implementation[0].effects[0].names,['Urza, Lord High Artificer','Ashling, the Pilgrim']);
 for(const clause of['reveal it, exile it','draw a card','put it onto the battlefield','then discard a card']){
  const oracle_text='Search your library for a card named Elf, '+clause+', put that card into your hand, then shuffle.';
  assert.equal(semanticClass({...input,oracle_text},{compilerVersion:8}).semanticClass,undefined,oracle_text);
 }
});
const pool=p=>Object.values(p.pool).reduce((a,b)=>a+b,0),fund=p=>{for(const color of['W','U','B','R','G','C'])p.pool[color]=30;};
function world(role){const f=context(M,role);if(role==='human'){const prior=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=async(g,q)=>{if(q.type==='chooseCards'&&q.search||q.type==='chooseX'){const result=q.type==='chooseX'?Math.min(3,q.max??3):q.from.slice(0,q.max);f.trace.push({q,result});return result;}return prior(g,q);};}return f;}
function donor(f,def={}){const c=new M.CardInst({name:'Library witness '+f.a.library.length,types:['Creature'],subtypes:['Bear'],super:[],cost:'{3}',power:'3',toughness:'3',...def},f.a);c.zone='library';f.a.library.push(c);return c;}
async function cast(f,name,opts={}){const c=put(M,f.game,f.a,name,'hand');fund(f.a);const before=pool(f.a);assert.equal(await f.game.castSpell(f.a,c,{from:'hand',...opts}),true,name+': paid cast');assert.ok(pool(f.a)<before,name+': real cost consumed');await settle(f.game);return c;}
async function nextUpkeep(f){const{game,a}=f,emit=game.emit,stop=new Error('next upkeep');game.turnPlayer=a;game.emit=async function(event,data){if(event==='upkeep')throw stop;return emit.call(this,event,data);};try{await assert.rejects(game.runTurn(),error=>error===stop);}finally{game.emit=emit;}game.phase='main1';}
const searchQueries=f=>f.trace.filter(r=>r.q.type==='chooseCards'&&r.q.search);
function checkOffered(f,valid,invalid){const query=searchQueries(f).at(-1);assert.ok(query,'the printed search reached an actual chooser');for(const c of valid)assert.ok(query.q.from.includes(c),c.name+': legal');for(const c of invalid)assert.equal(query.q.from.includes(c),false,c.name+': excluded');assert.ok(query.result.length,'a card was really selected');return query;}

test('all24 complete source cards compile and unknown search predicates or unbound X stay closed',()=>{
 assert.equal(cards.length,24);
 const rhythm=inputs.find(c=>c.name==="Nature's Rhythm");
 for(const c of[
  {...rhythm,mana_cost:'{G}{G}'},
  {...rhythm,type_line:'Creature — Bear',oracle_text:'Whenever this creature attacks, search your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle.'},
  {...rhythm,type_line:'Creature — Bear',oracle_text:'{G}, {T}: Search your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle.'},
  {...rhythm,oracle_text:'Search your library for a creature card with mana value X or less, put it onto the battlefield, then become the monarch twice.'},
  {...rhythm,oracle_text:'Search your library for up to X basic land cards, where X is the number of dreams you control, put them onto the battlefield tapped, then shuffle.'},
 ])assert.equal(semanticClass(c,{compilerVersion:8}).semanticClass,undefined,c.oracle_text);
});
for(const role of['human','ai']){
 for(const name of["Nature's Rhythm",'Whir of Invention','Wargate','Reshape','Chord of Calling','Rocco, Cabaretti Caterer'])test(`${role}: ${name} uses its actually paid X and exact search quality`,async()=>{
  const f=world(role),artifact=['Whir of Invention','Reshape'].includes(name),types=artifact?['Artifact']:['Creature'];
  const yes=donor(f,{types,cost:'{3}'}),tooLarge=donor(f,{types,cost:'{4}'}),wrong=donor(f,{types:['Instant'],cost:'{1}'});
  if(name==='Reshape')put(M,f.game,f.a,'Sol Ring');
  await cast(f,name,{xVal:3});const q=checkOffered(f,[yes],[tooLarge,wrong]);assert.equal(q.result[0].zone,'battlefield');assert.equal(tooLarge.zone,'library');assert.equal(wrong.zone,'library');
 });
 for(const name of['Citanul Flute','Lin Sivvi, Defiant Hero','Fiend Artisan'])test(`${role}: ${name} binds activated X to this activation and keeps permanent qualifications`,async()=>{
  const f=world(role),source=await cast(f,name);await nextUpkeep(f);fund(f.a);
  if(name==='Fiend Artisan')put(M,f.game,f.a,'Grizzly Bears');
  const subtypes=name.startsWith('Lin Sivvi')?['Rebel']:['Bear'];
  const yes=donor(f,{subtypes,cost:'{0}'}),wrong=donor(f,{types:['Instant'],subtypes,cost:'{0}'}),tooLarge=donor(f,{subtypes,cost:'{1000}'});
  const entry=f.game.activatableList(f.a).find(row=>row.card===source&&row.ability?.cost?.mana?.includes('{X}'));assert.ok(entry);
  const before=pool(f.a);assert.equal(await f.game.activateAbility(f.a,entry),true);await settle(f.game);assert.ok(pool(f.a)<before||searchQueries(f).at(-1)?.q.max===1);
  const q=checkOffered(f,[yes],[wrong,tooLarge]);assert.equal(q.result[0].zone,name==='Citanul Flute'?'hand':'battlefield');
 });
 test(`${role}: Uncage the Menagerie enforces paid X, exact mana value and distinct names`,async()=>{
  const f=world(role),a=donor(f,{name:'First exact creature'}),duplicate=donor(f,{name:'First exact creature'}),b=donor(f,{name:'Second exact creature'}),less=donor(f,{cost:'{2}'}),more=donor(f,{cost:'{4}'}),wrong=donor(f,{types:['Artifact']});
  await cast(f,'Uncage the Menagerie',{xVal:3});const q=checkOffered(f,[a,b],[less,more,wrong]);assert.equal(q.q.from.includes(duplicate),false);assert.equal(new Set(q.result.map(c=>c.name)).size,q.result.length);assert.ok(q.result.every(c=>c.zone==='hand'));assert.ok(q.result.length<=3);
 });
 for(const[name,names,destination]of[
  ['Dragonstorm Forecaster',['Dragonstorm Globe','Boulderborn Dragon'],'hand'],
  ['Renowned Weaponsmith',['Heart-Piercer Bow','Vial of Dragonfire'],'hand'],
  ['Bogbrew Witch',['Festering Newt','Bubbling Cauldron'],'battlefield'],
 ])test(`${role}: ${name} offers either exact printed name and no other card`,async()=>{
  const f=world(role),source=await cast(f,name);await nextUpkeep(f);fund(f.a);const yes=names.map(name=>donor(f,{name})),no=donor(f,{name:names[0]+' impostor'});
  const entry=f.game.activatableList(f.a).find(row=>row.card===source&&row.ability&&JSON.stringify(row.ability.oracleGenericEffects||[]).includes('library-search-v8'))||f.game.activatableList(f.a).find(row=>row.card===source&&row.ability);assert.ok(entry);
  assert.equal(await f.game.activateAbility(f.a,entry),true);await settle(f.game);const q=checkOffered(f,yes,[no]);assert.equal(q.result[0].zone,destination);if(destination==='battlefield')assert.equal(q.result[0].tapped,true);
 });
 for(const name of['Legion Conquistador','Gathering Throng','Battalion Foot Soldier'])test(`${role}: ${name} finds any number of exact names and reveals only acquired cards`,async()=>{
  const f=world(role),yes=[donor(f,{name}),donor(f,{name})],wrong=donor(f,{name:name+' impostor'}),revealed=[];f.game.revealToHuman=async q=>revealed.push(...q.cards);
  await cast(f,name);const q=checkOffered(f,yes,[wrong]);assert.equal(q.q.min,0);assert.equal(q.q.max,2);assert.ok(q.result.every(c=>c.zone==='hand'));assert.deepEqual(new Set(revealed),new Set(q.result));
 });
 test(`${role}: Transit Mage accepts mana values4or5 and excludes adjacent values and nonartifacts`,async()=>{
  const f=world(role),yes=[donor(f,{types:['Artifact'],cost:'{4}'}),donor(f,{types:['Artifact'],cost:'{5}'})],no=[donor(f,{types:['Artifact'],cost:'{3}'}),donor(f,{types:['Artifact'],cost:'{6}'}),donor(f,{cost:'{4}'})];await cast(f,'Transit Mage');checkOffered(f,yes,no);
 });
 test(`${role}: Reach the Horizon accepts basic lands or Towns and keeps distinct names and tapped entry`,async()=>{
  const f=world(role);f.a.library=[];const yes=[donor(f,{name:'Plain basic',types:['Land'],subtypes:[],super:['Basic'],cost:''}),donor(f,{name:'Nonbasic Town',types:['Land'],subtypes:['Town'],cost:''})],no=donor(f,{types:['Land'],subtypes:[],cost:''});await cast(f,'Reach the Horizon');const q=checkOffered(f,yes,[no]);assert.ok(q.result.every(c=>c.zone==='battlefield'&&c.tapped));
 });
 test(`${role}: Boundless Realms and Harvest Season count the current qualifying public board`,async()=>{
  for(const[name,witness]of[['Boundless Realms','Forest'],['Harvest Season','Grizzly Bears']]){const f=world(role);for(let n=0;n<3;n++){const c=put(M,f.game,f.a,witness);c.tapped=true;}if(witness==='Grizzly Bears')put(M,f.game,f.a,'Grizzly Bears');put(M,f.game,f.b,witness).tapped=true;await cast(f,name);const q=searchQueries(f).at(-1);assert.ok(q);assert.equal(q.q.max,3);assert.ok(q.result.every(c=>c.zone==='battlefield'&&c.tapped));}
 });
 test(`${role}: Lifespinner pays three actual Spirits and searches only legendary Spirit permanents`,async()=>{
  const f=world(role),source=await cast(f,'Lifespinner');await nextUpkeep(f);
  for(let n=0;n<3;n++){const c=donor(f,{subtypes:['Spirit']});await f.game.move(c,'battlefield');}
  const yes=donor(f,{name:'Legendary Spirit permanent',subtypes:['Spirit'],super:['Legendary']}),no=[donor(f,{subtypes:['Spirit']}),donor(f,{types:['Instant'],subtypes:['Spirit'],super:['Legendary']}),donor(f,{super:['Legendary']})];
  const before=f.a.graveyard.length,entry=f.game.activatableList(f.a).find(row=>row.card===source&&row.ability);assert.ok(entry);assert.equal(await f.game.activateAbility(f.a,entry),true);assert.equal(f.a.graveyard.length-before,3);await settle(f.game);checkOffered(f,[yes],no);assert.equal(yes.zone,'battlefield');
 });
 test(`${role}: Prismatic Undercurrents counts live colors including its own entry exactly once`,async()=>{
  const f=world(role);put(M,f.game,f.a,'Grizzly Bears');put(M,f.game,f.a,'Sol Ring');const blue=donor(f,{types:['Artifact'],colorsOverride:['U']});await f.game.move(blue,'battlefield');put(M,f.game,f.b,'Shivan Dragon');
  await cast(f,'Prismatic Undercurrents');const q=searchQueries(f).at(-1);assert.ok(q);assert.equal(q.q.max,2);assert.ok(q.result.every(c=>c.zone==='hand'));
 });
 test(`${role}: Rampant Rejuvenator searches using its last battlefield power after a paid Murder`,async()=>{
  const f=world(role),source=await cast(f,'Rampant Rejuvenator');M.E.pumpUntilEOT(f.game,source,2,2);assert.equal(source.power,4);
  const removal=put(M,f.game,f.b,'Murder','hand');fund(f.b);const before=pool(f.b);assert.equal(await f.game.castSpell(f.b,removal,{from:'hand',quickTargets:[source]}),true);assert.ok(pool(f.b)<before);await settle(f.game);assert.equal(source.zone,'graveyard');
  const q=searchQueries(f).at(-1);assert.ok(q);assert.equal(q.q.max,4);assert.ok(q.result.every(c=>c.zone==='battlefield'));
 });
 test(`${role}: Navigation Orb searches basic lands or Gates then partitions the same selected cards`,async()=>{
  const f=world(role),source=await cast(f,'Navigation Orb');f.a.library=[];const yes=[donor(f,{name:'Basic witness',types:['Land'],subtypes:[],super:['Basic'],cost:''}),donor(f,{name:'Gate witness',types:['Land'],subtypes:['Gate'],cost:''})],no=donor(f,{types:['Land'],subtypes:['Town'],cost:''});fund(f.a);
  const entry=f.game.activatableList(f.a).find(row=>row.card===source&&row.ability);assert.ok(entry);assert.equal(await f.game.activateAbility(f.a,entry),true);assert.equal(source.zone,'graveyard');await settle(f.game);const q=checkOffered(f,yes,[no]);assert.equal(q.result.length,2);assert.equal(yes.filter(c=>c.zone==='hand').length,1);assert.equal(yes.filter(c=>c.zone==='battlefield'&&c.tapped).length,1);assert.equal(no.zone,'library');
 });
}
