import strict from 'node:assert/strict';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
const total=p=>Object.values(p.pool).reduce((a,b)=>a+b,0);
export async function operationProofV26(M,entry,operation,role,h){
 if(!/common-count-v26|entry-life-v26|entry-form-v26/.test(JSON.stringify(entry.implementation)))return null;
 let checks=0;const assert={equal:(...args)=>{checks++;strict.equal(...args);},ok:(...args)=>{checks++;strict.ok(...args);}};
 const fresh=()=>{const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'});h.fillLibrary(M,f.a,30);h.fillLibrary(M,f.b,30);h.fund(f.a,100);return f;};
 const put=(f,p,name,zone='battlefield')=>zone==='battlefield'?h.permanent(M,f.game,p,name):h.zoneCard(M,p,name,zone);
 const paid=async(f,name,opts={})=>{const source=put(f,f.a,name,'hand'),before=total(f.a);assert.equal(await f.game.castSpell(f.a,source,{from:'hand',...opts}),true);assert.ok(total(f.a)<before);await h.resolveAll(f.game);return source;};
 const finish=f=>{assertGameStateInvariants(f.game);h.assertControllerRole(M,f,entry.raw.name);};
 const form=entry.implementation.find(op=>op.kind==='entry-form-v26'),name=entry.raw.name;
 if(form){
  for(const [i,row] of form.options.entries()){
   const f=fresh(),{game,a}=f,decide=a.controller.decide.bind(a.controller);
   if(form.coin)game.rnd=()=>i===0?0:0.9;
   a.controller.decide=(g,q)=>q.aiHint?.kind==='entryForm'?String(i):decide(g,q);
   const source=await paid(f,name);assert.equal(source.power,row.power);assert.equal(source.toughness,row.toughness);
   for(const keyword of ['flying','vigilance','defender','haste'])assert.equal(source.kw(keyword),row.keywords.includes(keyword));
   for(const type of row.addSubtypes||[])assert.equal(source.hasSub(type),true);
   const witness=put(f,a,'Grizzly Bears');M.OracleV8Copies.applyCopy(game,witness,source.isCopyOf||source.def);game.recalc();
   assert.equal(witness.power,row.power);assert.equal(witness.toughness,row.toughness);for(const keyword of row.keywords)assert.equal(witness.kw(keyword),true);
   await game.move(source,'exile');assert.equal(source.power,0);assert.equal(source.kw('flying'),false);await game.putPermanentOntoBattlefield(source,a);await h.resolveAll(game);assert.equal(source.power,row.power);finish(f);
  }
  if(form.faceUp){
   const f=fresh(),{game,a}=f,source=put(f,a,name,'hand'),before=total(a);
   const alt=game.castableList(a).find(row=>row.card===source&&row.alt?.faceDownCast)?.alt;assert.ok(alt);
   assert.equal(await game.castSpell(a,source,{from:'hand',alt}),true);await h.resolveAll(game);assert.equal(total(a),before-3);assert.equal(source.faceDown,true);assert.equal(source.power,2);
   const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.aiHint?.kind==='entryForm'?'1':decide(g,q);
   const cash=total(a);assert.equal(await game.turnFaceUp(a,source,'{2}{U}','morph'),true);assert.equal(total(a),cash-3);assert.equal(source.power,1);assert.equal(source.toughness,5);finish(f);
  }
 }else if(name==='Minion of the Wastes'||name==='Nameless Race'){
  for(const n of [0,3]){
   const f=fresh(),{game,a,b}=f;for(let i=0;i<2;i++)put(f,b,'Serra Angel');put(f,b,'Serra Angel','graveyard');const token=put(f,b,'Serra Angel');token.isToken=true;put(f,a,'Serra Angel');game.recalc();
   const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>{if(q.aiHint?.kind==='entryLifePT'){if(name==='Nameless Race')assert.equal(q.max,3);return n;}return decide(g,q);};
   const life=a.life,source=await paid(f,name);assert.equal(a.life,life-n);assert.equal(source.power,n);assert.equal(source.toughness,n);assert.equal(source.zone,n?'battlefield':'graveyard');
   if(n){await game.move(source,'exile');assert.equal(source.power,0);await game.putPermanentOntoBattlefield(source,a);await h.resolveAll(game);assert.equal(source.power,n);assert.equal(a.life,life-2*n);}finish(f);
  }
 }else if(name==='Scourge of the Skyclaves'){
  const f=fresh(),{game,a,b}=f;a.life=31;b.life=35;const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='kick')?'kick':decide(g,q);
  const source=await paid(f,name,{kicked:true});assert.equal(a.life,15);assert.equal(b.life,17);assert.equal(source.power,3);await game.loseLife(b,4);game.recalc();assert.equal(source.power,5);finish(f);
 }else if(name==='Malignus'){
  const f=fresh(),{game,a,b}=f;b.life=17;const other=game.addPlayer('Third',{name:'Third'},h.decision(),false);h.fillLibrary(M,other,30);other.life=25;
  const source=await paid(f,name);assert.equal(source.power,13);assert.equal(source.toughness,13);await game.loseLife(other,10);game.recalc();assert.equal(source.power,9);
  h.fund(b,100);assert.equal(await game.castSpell(b,put(f,b,'Fog','hand'),{from:'hand'}),true);await h.resolveAll(game);const life=b.life;await game.damagePlayer(source,b,3,{combat:true});assert.equal(b.life,life-3);finish(f);
 }else throw Error('Unproved v26 common source '+name);
 return checks;
}
