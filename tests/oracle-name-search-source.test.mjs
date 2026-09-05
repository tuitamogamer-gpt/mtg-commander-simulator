import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import{loadEngine}from'./helpers/load-engine.mjs';import{context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';import{semanticClass,createImportPlan}from'../scripts/import-oracle-batch.mjs';
const M=loadEngine(),sources=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-name-search-source.json',import.meta.url)));
for(const card of sources)assert.ok(semanticClass(card).semanticClass,card.name+': exact whole source');
const {report}=createImportPlan({cards:sources,baseNames:new Set(),bulk:{type:'oracle_cards',updated_at:'2026-08-30T09:01:56.964+00:00'},limit:sources.length,sequence:9994,compilerVersion:8}),rows=report.cards;
const missing=rows.filter(row=>!M.DEFS[row.raw.name]);if(missing.length){M.registerOracleBatch({...report,cards:missing});M.initData(M.RAW_DATA);}
const effects=row=>row.implementation.flatMap(op=>op.effects||[]).filter(e=>e.action==='same-name-search-v8');
for(const [original,from,to]of[
 ['Splinter','that artifact','that land'],['Counterbore','that spell','that creature'],
 ['Splinter',"its controller's","another player's"],['Splinter','graveyard, hand, and library','exile, hand, and library'],
 ['Pack Hunt','up to three','up to four'],['Remembrance','that creature','another card'],
])test(`${original}: unsupported changed reference or scope is rejected`,()=>{const source=sources.find(card=>card.name===original);assert.ok(source);const changed={...source,oracle_text:source.oracle_text.replace(from,to)};assert.notEqual(changed.oracle_text,source.oracle_text);assert.equal(semanticClass(changed).semanticClass,undefined);});
async function cast(c,p,name,{resolve=true,...options}={}){const card=put(M,c.game,p,name,'hand');for(const k of'WUBRGC')p.pool[k]=30;const total=()=>Object.values(p.pool).reduce((a,b)=>a+b,0),before=total();if(!c.game.stack.length)c.game.turnPlayer=p;assert.equal(await c.game.castSpell(p,card,{from:'hand',...options}),true);assert.ok(total()<before);if(resolve)await settle(c.game);return card;}
function choose(c){for(const p of c.game.players)if(!p.isAI){const original=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>{if(q.type==='chooseTargets'&&q.candidates.includes(c.b)&&p===c.a)return[c.b];if(q.type==='chooseCards'&&(q.search||q.prompt?.startsWith('Choose revealed card')||q.prompt?.startsWith('Choose a permanent or card to copy as this enters'))){const picks=[];for(const card of q.from)if(picks.length<q.max&&(!q.aiHint?.canPayRemaining||q.aiHint.canPayRemaining([...picks,card])))picks.push(card);return picks;}return original(g,q);};}}
for(const role of ['human','ai'])for(const row of rows.filter(row=>effects(row).some(e=>typeof e.target==='number'&&!e.namesFrom)))test(`${role}: paid ${row.raw.name} executes its exact named search`,async()=>{
 const c=context(M,role);choose(c);const e=effects(row)[0];assert.ok(e);let target,searchOwner=e.owner==='you'?c.a:c.b,model;
 if(e.prior==='counter'){model='Giant Growth';put(M,c.game,c.b,'Grizzly Bears');target=await cast(c,c.b,model,{resolve:false});}
 else{const noun=row.implementation.find(op=>op.kind==='spell-generic').targets[0];model=noun.what==='land'?'Command Tower':noun.what==='enchantment'?'Ghostly Prison':noun.what==='artifact'?'Sol Ring':'Colossal Dreadmaw';target=put(M,c.game,e.owner==='you'?c.a:c.b,model,noun.zone);}
 const matching=e.zones.map(zone=>put(M,c.game,searchOwner,model,zone)),other=put(M,c.game,searchOwner,'Forest','graveyard');if(row.raw.name==='Mask of the Mimic'){const sacrifice=put(M,c.game,c.a,'Grizzly Bears');if(role==='human'){const decide=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=(g,q)=>q.type==='chooseCards'&&q.from.includes(sacrifice)?[sacrifice]:decide(g,q);}}
 const source=await cast(c,c.a,row.raw.name,{resolve:false});assert.ok(c.game.stack.some(so=>so.card===source));const handBefore=searchOwner.hand.length;await settle(c.game);
 for(const card of matching)assert.equal(card.zone,e.destination,row.raw.name+' from printed zone');assert.equal(other.zone,'graveyard');
 if(e.prior==='exile')assert.equal(target.zone,'exile');if(e.prior==='counter')assert.equal(target.zone,'exile');
 if(e.handDraw)assert.equal(searchOwner.hand.length,handBefore,'exact replacement draws for exiled hand cards');
});
for(const role of ['human','ai'])test(`${role}: countering an uncounterable spell still searches by its captured spell name`,async()=>{
 const c=context(M,role);choose(c);await cast(c,c.b,'Carnage Tyrant',{resolve:false});const copy=put(M,c.game,c.b,'Carnage Tyrant','graveyard');await cast(c,c.a,'Counterbore');assert.equal(copy.zone,'exile');assert.ok(c.game.bf().some(card=>card.name==='Carnage Tyrant'));
});
test('human: all requires public graveyard matches even when hidden matches are declined',async()=>{
 const c=context(M);const target=put(M,c.game,c.b,'Sol Ring'),grave=put(M,c.game,c.b,'Sol Ring','graveyard'),hand=put(M,c.game,c.b,'Sol Ring','hand'),library=put(M,c.game,c.b,'Sol Ring','library');await cast(c,c.a,'Splinter');assert.equal(target.zone,'exile');assert.equal(grave.zone,'exile');assert.equal(hand.zone,'hand');assert.equal(library.zone,'library');
});
test('human: any number permits leaving every matching card including the graveyard target',async()=>{
 const c=context(M),target=put(M,c.game,c.b,'Sol Ring','graveyard');await cast(c,c.a,'Surgical Extraction');assert.equal(target.zone,'graveyard');
});
for(const role of ['human','ai']){
 test(`${role}: a paid Cloudshift response invalidates extraction before any search`,async()=>{
  const c=context(M,role);choose(c);const target=put(M,c.game,c.b,'Colossal Dreadmaw'),copies=['hand','library','graveyard'].map(zone=>put(M,c.game,c.b,target.name,zone));await cast(c,c.a,'Eradicate',{resolve:false});await cast(c,c.b,'Cloudshift');assert.equal(target.zone,'battlefield');assert.deepEqual(copies.map(card=>card.zone),['hand','library','graveyard']);
 });
 test(`${role}: Counterbore captures the cast split half before its physical card reaches the graveyard`,async()=>{
  const c=context(M,role);choose(c);put(M,c.game,c.a,'Sol Ring');const spell=put(M,c.game,c.b,'Fire // Ice','hand');for(const k of'WUBRGC')c.b.pool[k]=20;const offer=c.game.castableList(c.b).find(row=>row.card===spell&&row.alt?.name==='Ice');assert.ok(offer);assert.equal(await c.game.castSpell(c.b,spell,{from:'hand',alt:offer.alt}),true);const copies=['hand','library','graveyard'].map(zone=>put(M,c.game,c.b,'Fire // Ice',zone));await cast(c,c.a,'Counterbore');assert.ok([spell,...copies].every(card=>card.zone==='exile'));
 });
 test(`${role}: Counterbore cannot find a nameless Morph's newly revealed printed name`,async()=>{
  const c=context(M,role);choose(c);const spell=put(M,c.game,c.b,'Abzan Guide','hand');for(const k of'WUBRGC')c.b.pool[k]=20;c.game.turnPlayer=c.b;const offer=c.game.castableList(c.b).find(row=>row.card===spell&&row.alt?.faceDownCast);assert.ok(offer);assert.equal(await c.game.castSpell(c.b,spell,{from:'hand',alt:offer.alt}),true);const copy=put(M,c.game,c.b,'Abzan Guide','graveyard');await cast(c,c.a,'Counterbore');assert.equal(copy.zone,'graveyard');assert.equal(spell.zone,'graveyard');
 });
 test(`${role}: Remembrance searches the copied battlefield name after a real paid Murder`,async()=>{
  const c=context(M,role);choose(c);await cast(c,c.a,'Remembrance');put(M,c.game,c.b,'Colossal Dreadmaw');const source=await cast(c,c.a,'Clone');assert.equal(source.name,'Colossal Dreadmaw');const copy=put(M,c.game,c.a,'Colossal Dreadmaw','library'),printed=put(M,c.game,c.a,'Clone','library');const decide=c.b.controller.decide.bind(c.b.controller);c.b.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(source)?[source]:decide(g,q);await cast(c,c.b,'Murder');assert.equal(source.name,'Clone');assert.equal(copy.zone,'hand');assert.equal(printed.zone,'library');
 });
 test(`${role}: a paid Control Magic makes extraction search the last controller's zones`,async()=>{
  const c=context(M,role);choose(c);const target=put(M,c.game,c.b,'Colossal Dreadmaw');await cast(c,c.a,'Control Magic');assert.equal(target.ctrl,c.a);const controllerCopy=put(M,c.game,c.a,'Colossal Dreadmaw','graveyard'),ownerCopy=put(M,c.game,c.b,'Colossal Dreadmaw','graveyard');await cast(c,c.b,'Eradicate');assert.equal(target.zone,'exile');assert.equal(controllerCopy.zone,'exile');assert.equal(ownerCopy.zone,'graveyard');
 });
 for(const name of ['Remembrance','Verdant Succession'])test(`${role}: paid ${name} searches from the dead creature's battlefield name`,async()=>{
  const c=context(M,role);choose(c);await cast(c,c.a,name);const victim=await cast(c,c.a,'Colossal Dreadmaw'),match=put(M,c.game,c.a,'Colossal Dreadmaw','library');await cast(c,c.b,'Murder');assert.equal(victim.zone,'graveyard');assert.equal(match.zone,name==='Remembrance'?'hand':'battlefield');
 });
 test(`${role}: paid Pattern Matcher finds another friendly creature's name`,async()=>{
  const c=context(M,role);choose(c);put(M,c.game,c.a,'Colossal Dreadmaw');const match=put(M,c.game,c.a,'Colossal Dreadmaw','library'),own=put(M,c.game,c.a,'Pattern Matcher','library');await cast(c,c.a,'Pattern Matcher');assert.equal(match.zone,'hand');assert.equal(own.zone,'library');
 });
 test(`${role}: paid Doubling Chant finds exactly one card per original creature`,async()=>{
  const c=context(M,role);choose(c);put(M,c.game,c.a,'Colossal Dreadmaw');put(M,c.game,c.a,'Colossal Dreadmaw');const copies=Array.from({length:3},()=>put(M,c.game,c.a,'Colossal Dreadmaw','library'));await cast(c,c.a,'Doubling Chant');assert.equal(copies.filter(card=>card.zone==='battlefield').length,2);assert.equal(copies.filter(card=>card.zone==='library').length,1);
 });
 test(`${role}: paid Clarion Ultimatum locks five original models and enters matching cards tapped`,async()=>{
  const c=context(M,role);choose(c);const originals=['Colossal Dreadmaw','Sol Ring','Forest','Island','Ghostly Prison'].map(name=>put(M,c.game,c.a,name));for(const card of originals)put(M,c.game,c.a,card.name,'library');
  const before=new Set(c.game.bf());await cast(c,c.a,'Clarion Ultimatum');const added=c.game.bf().filter(card=>!before.has(card));assert.equal(added.length,5);assert.equal(new Set(added.map(card=>card.name)).size,5);assert.ok(added.every(card=>card.tapped));
 });
 for(const name of ['Lobotomy','Reap Intellect'])test(`${role}: paid ${name} reveals, chooses, and extracts only matching opponent cards`,async()=>{
  const c=context(M,role);choose(c);const copies=['hand','library','graveyard'].map(zone=>put(M,c.game,c.b,'Colossal Dreadmaw',zone));put(M,c.game,c.b,'Forest','hand');await cast(c,c.a,name,{xVal:1});assert.ok(copies.every(card=>card.zone==='exile'));assert.equal(c.b.hand.length,1);assert.equal(c.b.hand[0].name,'Forest');
 });
 test(`${role}: paid Haunting Echoes keeps basic lands and extracts each exiled name from the library`,async()=>{
  const c=context(M,role);choose(c);const originals=['Colossal Dreadmaw','Sol Ring'].map(name=>put(M,c.game,c.b,name,'graveyard')),matches=originals.map(card=>put(M,c.game,c.b,card.name,'library')),basic=put(M,c.game,c.b,'Forest','graveyard');await cast(c,c.a,'Haunting Echoes');assert.ok([...originals,...matches].every(card=>card.zone==='exile'));assert.equal(basic.zone,'graveyard');
 });
 test(`${role}: paid Assembly Hall activation reveals its hand model then searches once`,async()=>{
  const c=context(M,role);choose(c);const source=await cast(c,c.a,'Assembly Hall'),original=put(M,c.game,c.a,'Colossal Dreadmaw','hand'),match=put(M,c.game,c.a,'Colossal Dreadmaw','library');const ability=c.game.activatableList(c.a).find(row=>row.card===source);assert.ok(ability);const before=c.a.pool.C;assert.equal(await c.game.activateAbility(c.a,ability),true);assert.equal(source.tapped,true);assert.equal(c.a.pool.C,before-4);await settle(c.game);assert.equal(original.zone,'hand');assert.equal(match.zone,'hand');
 });
 test(`${role}: paid Retraced Image reveals a card and checks live permanent names`,async()=>{
  const c=context(M,role);choose(c);put(M,c.game,c.b,'Colossal Dreadmaw');const card=put(M,c.game,c.a,'Colossal Dreadmaw','hand');await cast(c,c.a,'Retraced Image');assert.equal(card.zone,'battlefield');
 });
 test(`${role}: paid Shimian Specter combat damage extracts from the damaged player's hand and zones`,async()=>{
  const c=context(M,role);choose(c);const source=await cast(c,c.a,'Shimian Specter'),copies=['hand','library','graveyard'].map(zone=>put(M,c.game,c.b,'Colossal Dreadmaw',zone));source.sick=false;if(role==='human'){const decide=c.a.controller.decide.bind(c.a.controller);c.a.controller.decide=(g,q)=>q.type==='attackers'?[{card:source,target:c.b}]:decide(g,q);}await c.game.combatPhase(c.a);await settle(c.game);assert.ok(copies.every(card=>card.zone==='exile'));assert.equal(c.b.life,38);
 });
}
