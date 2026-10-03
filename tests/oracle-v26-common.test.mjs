import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
import {createImportPlan,runtimeBatch,semanticClass} from '../scripts/import-oracle-batch.mjs';
const M=loadEngine(),rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v26-common.json',import.meta.url),'utf8'));
const plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},limit:rows.length,sequence:9957,compilerVersion:26});const batch=runtimeBatch(plan.report),absent=batch.cards.filter(entry=>!M.DEFS[entry.raw.name]);if(absent.length)M.registerOracleBatch({...batch,cards:absent});M.initData(M.RAW_DATA);
for(const row of rows)test(row.name+': whole source compilation rejects an unsupported appended instruction',()=>{
 assert.ok(semanticClass(row,{compilerVersion:26}).semanticClass);
 assert.ok(!semanticClass({...row,oracle_text:row.oracle_text+'\nWhenever an opponent sings, restart the game.'},{compilerVersion:26}).semanticClass);
});
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=100;},total=p=>Object.values(p.pool).reduce((a,b)=>a+b,0);
const paid=async(f,name,options={})=>{fund(f.a);const source=put(M,f.game,f.a,name,'hand'),before=total(f.a);assert.equal(await f.game.castSpell(f.a,source,{from:'hand',...options}),true);assert.ok(total(f.a)<before);await settle(f.game);return source;};
for(const life of [40,7])test('natural local AI pays useful entry life and keeps a positive life total at '+life,async()=>{
 const f=context(M,'ai');f.a.life=life;const source=await paid(f,'Minion of the Wastes');
 assert.ok(source.power>0);assert.ok(source.power<life);assert.equal(f.a.life,life-source.power);assert.equal(f.a.lost,false);assertGameStateInvariants(f.game);
});
test('natural local AI chooses a complete flying form',async()=>{
 const f=context(M,'ai'),source=await paid(f,'Corrupted Shapeshifter');assert.equal(source.power,3);assert.equal(source.toughness,3);assert.equal(source.kw('flying'),true);assertGameStateInvariants(f.game);
});
for(const role of ['human','ai']){
 test(role+': a token copy checkpoint retains both copied and newly chosen traits',async()=>{
  const f=context(M,role),{game,a}=f,decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.aiHint?.kind==='entryForm'?'1':decide(g,q);
  const source=await paid(f,'Primal Plasma');a.controller.decide=(g,q)=>q.aiHint?.kind==='entryForm'?'2':decide(g,q);
  const [token]=await game.copyPermanentToken(source,a);await settle(game);const snapshot=M.captureGameState(game);assert.ok(snapshot,game.log.at(-1)?.msg);
  const restored=context(M,role);M.restoreGameState(restored.game,JSON.parse(JSON.stringify(snapshot)));const copy=restored.game.byIid(token.iid);
  assert.equal(copy.isToken,true);assert.equal(copy.power,1);assert.equal(copy.toughness,6);assert.equal(copy.kw('flying'),true);assert.equal(copy.kw('defender'),true);assertGameStateInvariants(restored.game);
 });
 test(role+': chosen entry form survives a JSON checkpoint and restores its original definition after leaving',async()=>{
  const f=context(M,role),{game,a}=f,decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.aiHint?.kind==='entryForm'?'2':decide(g,q);
  const source=await paid(f,'Primal Clay'),iid=source.iid;
  const snapshot=M.captureGameState(game);assert.ok(snapshot,game.log.at(-1)?.msg);
  const restored=context(M,role);M.restoreGameState(restored.game,JSON.parse(JSON.stringify(snapshot)));
  const copy=restored.game.byIid(iid);assert.equal(copy.power,1);assert.equal(copy.toughness,6);assert.equal(copy.kw('defender'),true);assert.equal(copy.hasSub('Wall'),true);
  await restored.game.move(copy,'exile');assert.equal(copy.power,0);assert.equal(copy.kw('defender'),false);assert.equal(copy.hasSub('Wall'),false);
  const choose=restored.a.controller.decide.bind(restored.a.controller);restored.a.controller.decide=(g,q)=>q.aiHint?.kind==='entryForm'?'1':choose(g,q);
  await restored.game.putPermanentOntoBattlefield(copy,restored.a);await settle(restored.game);assert.equal(copy.power,2);assert.equal(copy.kw('flying'),true);assertGameStateInvariants(restored.game);
 });
 test(role+': chosen entry traits are copied in place and reset on a new battlefield incarnation',async()=>{
  const f=context(M,role),{game,a}=f,decide=a.controller.decide.bind(a.controller);
  a.controller.decide=(g,q)=>q.aiHint?.kind==='entryForm'?'1':decide(g,q);
  const source=await paid(f,'Primal Plasma'),bear=put(M,game,a,'Grizzly Bears');
  assert.equal(source.power,2);assert.equal(source.kw('flying'),true);assert.equal(source.isCopyOf,null);
  M.OracleV8Copies.applyCopy(game,bear,source.def);game.recalc();
  assert.equal(bear.power,2);assert.equal(bear.toughness,2);assert.equal(bear.kw('flying'),true);
  await game.move(source,'exile');assert.equal(source.power,0);assert.equal(source.kw('flying'),false);
  a.controller.decide=(g,q)=>q.aiHint?.kind==='entryForm'?'0':decide(g,q);
  await game.putPermanentOntoBattlefield(source,a);await settle(game);
  assert.equal(source.power,3);assert.equal(source.toughness,3);assert.equal(source.kw('flying'),false);assertGameStateInvariants(game);
 });
 for(const name of ['Primal Plasma','Corrupted Shapeshifter'])test(role+': entering copy of '+name+' retains copied traits and adds its newly chosen traits',async()=>{
  const f=context(M,role),{game,a}=f,decide=a.controller.decide.bind(a.controller);
  a.controller.decide=(g,q)=>q.aiHint?.kind==='entryForm'?'1':decide(g,q);
  const source=await paid(f,name);assert.equal(source.kw(name==='Primal Plasma'?'flying':'vigilance'),true);
  a.controller.decide=(g,q)=>q.aiHint?.kind==='entryForm'?'2':decide(g,q);
  const [copy]=await game.copyPermanentToken(source,a);await settle(game);game.recalc();
  const form=source.def.oracleImplementation.find(op=>op.kind==='entry-form-v26').options[2];
  assert.equal(copy.power,form.power);assert.equal(copy.toughness,form.toughness);
  assert.equal(copy.kw('defender'),true);assert.equal(copy.kw(name==='Primal Plasma'?'flying':'vigilance'),true);
  const bear=put(M,game,a,'Grizzly Bears');M.OracleV8Copies.applyCopy(game,bear,copy.isCopyOf||copy.def);game.recalc();
  assert.equal(bear.power,form.power);assert.equal(bear.kw('defender'),true);assert.equal(bear.kw(name==='Primal Plasma'?'flying':'vigilance'),true);assertGameStateInvariants(game);
 });
 test(role+': a paid Clone entry preserves the active copy layer when it chooses a new form',async()=>{
  const f=context(M,role),{game,a}=f,decide=a.controller.decide.bind(a.controller);
  a.controller.decide=(g,q)=>q.aiHint?.kind==='entryForm'?'1':decide(g,q);
  const source=await paid(f,'Primal Plasma');
  a.controller.decide=(g,q)=>q.aiHint?.kind==='entryForm'?'2':q.type==='chooseCards'&&q.from.includes(source)?[source]:decide(g,q);
  const clone=await paid(f,'Clone');game.recalc();game.recalc();
  assert.equal(clone.power,1);assert.equal(clone.toughness,6);assert.equal(clone.kw('flying'),true);assert.equal(clone.kw('defender'),true);
  await game.move(clone,'exile');assert.equal(clone.name,'Clone');assert.equal(clone.kw('flying'),false);assert.equal(clone.kw('defender'),false);assertGameStateInvariants(game);
 });
 test(role+': Aquamorph Entity chooses on native paid entry and paid face-up turn',async()=>{
  const f=context(M,role),{game,a}=f,decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.aiHint?.kind==='entryForm'?'0':decide(g,q);const ordinary=await paid(f,'Aquamorph Entity');assert.equal(ordinary.power,5);assert.equal(ordinary.toughness,1);const morph=put(M,game,a,'Aquamorph Entity','hand'),before=total(a);assert.equal(await game.castSpell(a,morph,{from:'hand',alt:game.castableList(a).find(option=>option.card===morph&&option.alt?.faceDownCast).alt}),true);await settle(game);assert.equal(total(a),before-3);assert.equal(morph.faceDown,true);assert.equal(morph.power,2);assert.equal(morph.toughness,2);a.controller.decide=(g,q)=>q.aiHint?.kind==='entryForm'?'1':decide(g,q);const cash=total(a);assert.equal(await game.turnFaceUp(a,morph,'{2}{U}','morph'),true);assert.equal(total(a),cash-3);assert.equal(morph.faceDown,false);assert.equal(morph.power,1);assert.equal(morph.toughness,5);assertGameStateInvariants(game);
 });
 test(role+': life-paid entry respects a native prohibition and zero payment',async()=>{
  const f=context(M,role),{game,a}=f;put(M,game,a,'Platinum Emperion');const life=a.life,decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>{if(q.aiHint?.kind==='entryLifePT'){assert.equal(q.max,0);return 0;}return decide(g,q);};const source=await paid(f,'Minion of the Wastes');assert.equal(a.life,life);assert.equal(source.zone,'graveyard');assert.equal(source.power,0);assertGameStateInvariants(game);
 });
 for(const heads of [true,false])test(role+': Molten Sentry uses an uncalled native coin and the full '+(heads?'heads':'tails')+' form',async()=>{
  const f=context(M,role),{game,a}=f;game.rnd=()=>heads?0:0.9;let calls=0;const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>{if(q.aiHint?.kind==='coinCall')calls++;return decide(g,q);};const source=await paid(f,'Molten Sentry');assert.equal(calls,0);assert.equal(source.power,heads?5:2);assert.equal(source.toughness,heads?2:5);assert.equal(source.kw('haste'),heads);assert.equal(source.kw('defender'),!heads);assertGameStateInvariants(game);
 });
 for(const name of ['Minion of the Wastes','Nameless Race'])test(role+': '+name+' pays legal entry life and remembers this incarnation only',async()=>{
  const f=context(M,role),{game,a,b}=f;for(let i=0;i<2;i++)put(M,game,b,'Serra Angel');put(M,game,b,'Serra Angel','graveyard');const token=put(M,game,b,'Serra Angel');token.isToken=true;put(M,game,a,'Serra Angel');game.recalc();let amount=name==='Nameless Race'?3:5;const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.aiHint?.kind==='entryLifePT'?amount:decide(g,q);
  const life=a.life,source=await paid(f,name);assert.equal(a.life,life-amount);assert.equal(source.power,amount);assert.equal(source.toughness,amount);assert.equal(source.kw('trample'),true);await game.move(source,'exile');assert.equal(source.power,0);amount=2;await game.putPermanentOntoBattlefield(source,a);await settle(game);assert.equal(source.power,2);assert.equal(a.life,life-(name==='Nameless Race'?3:5)-2);assertGameStateInvariants(game);
 });
 for(const name of ['Primal Plasma','Primal Clay','Corrupted Shapeshifter'])for(const index of [0,1,2])test(role+': '+name+' chooses complete form '+index+' before entering',async()=>{
  const f=context(M,role),{game,a}=f,decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.aiHint?.kind==='entryForm'?String(index):decide(g,q);const source=await paid(f,name),op=source.def.oracleImplementation.find(op=>op.kind==='entry-form-v26'),form=op.options[index];assert.equal(source.power,form.power);assert.equal(source.toughness,form.toughness);for(const keyword of ['flying','vigilance','defender'])assert.equal(source.kw(keyword),form.keywords.includes(keyword));if(form.addSubtypes)assert.equal(source.hasSub('Wall'),true);if(name==='Primal Clay')assert.equal(source.is('Artifact'),true);if(name==='Corrupted Shapeshifter')assert.equal(source.colors.length,0);assertGameStateInvariants(game);
 });
 test(role+': Scourge of the Skyclaves uses the current highest life total and kicked cast',async()=>{
  const f=context(M,role),{game,a,b}=f;a.life=31;b.life=35;const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='kick')?'kick':decide(g,q);const source=await paid(f,'Scourge of the Skyclaves',{kicked:true});assert.equal(a.life,15);assert.equal(b.life,17);assert.equal(source.power,3);assert.equal(source.toughness,3);await game.loseLife(b,4);game.recalc();assert.equal(source.power,5);assert.equal(source.toughness,5);assertGameStateInvariants(game);
 });
 test(role+': Malignus rounds the highest opponent life up and bypasses prevention',async()=>{
  const f=context(M,role,2),{game,a,b,others}=f;b.life=17;others[1].life=25;const source=await paid(f,'Malignus');assert.equal(source.power,13);assert.equal(source.toughness,13);await game.loseLife(others[1],10);game.recalc();assert.equal(source.power,9);assert.equal(source.toughness,9);fund(b);assert.equal(await game.castSpell(b,put(M,game,b,'Fog','hand'),{from:'hand'}),true);await settle(game);const before=b.life;await game.damagePlayer(source,b,3,{combat:true});assert.equal(b.life,before-3);assertGameStateInvariants(game);
 });
}
