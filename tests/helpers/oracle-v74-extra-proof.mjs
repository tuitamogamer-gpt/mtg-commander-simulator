import fs from 'node:fs';import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=JSON.parse(fs.readFileSync(new URL('../fixtures/oracle-v74-extra.json',import.meta.url))).map(c=>c.name);
export async function proveExtraV74(M,name,role,positive=true,h){
 let checks=0;const assert=Object.fromEntries(['equal','ok','deepEqual'].map(k=>[k,(...args)=>{checks++;strict[k](...args);} ]));
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;h?.assertControllerRole?.(M,f,name);
 for(const p of g.players){fund(p);while(p.library.length<30)put(M,p,'Forest');}g.spotlight=async()=>{};
 let aim=[],picked=[];for(const p of g.players)choose(p,q=>{
  if(q.type==='chooseTargets'&&aim.length)return {...q,candidates:aim,min:1,max:1};
  if(q.type==='chooseCards'&&q.from.some(c=>picked.includes(c)))return {...q,from:q.from.filter(c=>picked.includes(c)),min:1,max:1};
  if(q.type==='chooseOption'){
   const key=q.options.some(o=>o.key==='odd')?(positive?'odd':'even'):q.options.some(o=>o.key==='yes')?(positive?'yes':'no'):/vote/i.test(q.aiHint?.kind||'')?(p===a||!positive?q.options[0].key:q.options.at(-1).key):null;
   if(key)return {...q,options:q.options.filter(o=>o.key===key)};
  }return null;
 });
 const cast=async card=>{const before=total(a);assert.equal(await g.castSpell(a,card),true);assert.ok(total(a)<before);await settle(g);return card;};
 const source=()=>cast(put(M,a,name,'hand'));
 const donor=(p=b,extra={})=>permanent(M,g,p,def('V74 extra witness',['Creature'],extra));
 if(name==='Colossal Skyturtle'){
  const casted=await source();assert.equal(casted.kw('flying'),true);assert.ok(casted.def.ward||casted.cur.wardCost);
  const c=put(M,a,name,'hand'),target=positive?put(M,a,'Forest','graveyard'):donor();aim=[target];
  const rows=g.activatableList(a).filter(r=>r.card===c&&r.handAbility);assert.equal(rows.length,2);const row=rows.find(r=>r.idx===(positive?'hand0':'hand1'));assert.ok(row);
  const before=total(a);assert.equal(await g.activateAbility(a,row),true);assert.equal(c.zone,'graveyard');assert.equal(total(a),before-(positive?3:2));await settle(g);assert.equal(target.zone,'hand');
  assert.equal(await g.activateAbility(a,row),false,'cannot activate discarded card again');
 }else if(name==='Cryptic Cruiser'){
  const c=await source(),host=donor(),fuel=put(M,b,'Forest','exile'),own=put(M,a,'Forest','exile');picked=[fuel];aim=[host];assert.deepEqual(Array.from(c.colors),[]);
  const row=g.activatableList(a).find(r=>r.card===c&&!r.manaAbility);assert.ok(row);const before=total(a);assert.equal(await g.activateAbility(a,row),true);assert.equal(total(a),before-3);assert.equal(fuel.zone,'graveyard');assert.equal(own.zone,'exile');
  if(!positive){await g.move(host,'exile');await g.putPermanentOntoBattlefield(host,b);}await settle(g);assert.equal(host.tapped,positive);
  const refused=total(a);assert.equal(await g.activateAbility(a,row),false,'own exiled cards cannot pay processing');assert.equal(total(a),refused);
 }else if(name==='Lavabrink Venturer'){
  const c=await source();for(const mv of [0,1,2,3,4])assert.equal(g.isProtectedFrom(c,donor(b,{cost:'{'+mv+'}'})),(mv%2===1)===positive);
  M.OracleV8AbilityLoss.add(g,[c],{temporary:true});g.recalc();assert.equal(g.isProtectedFrom(c,donor(b,{cost:positive?'{1}':'{0}'})),false);
 }else if(name==='Council Guardian'){
  const c=await source();for(const color of ['U','B','R','G'])assert.equal(g.isProtectedFrom(c,donor(b,{colorsOverride:[color]})),color==='U'||positive&&color==='G');
  const v=c.zoneVersion;await g.move(c,'exile');assert.equal(g.untilEffects.some(e=>e.kind==='guardian-protection-v74'),true);assert.ok(c.zoneVersion>v);
 }else if(name==='Lieutenants of the Guard'){
  const c=await source();assert.equal(c.counters['+1/+1']||0,positive?1:2);assert.equal(g.bf().filter(c=>c.isToken&&c.hasSub('Soldier')).length,positive?1:0);
 }else if(name==='Grudge Keeper'){
  const c=await source(),life=b.life;const votes=await M.VN.vote({g,src:c,you:a},[{key:'one',label:'One'},{key:'two',label:'Two'}]);await settle(g);assert.equal(votes.length,2);assert.equal(b.life,life-(positive?2:0));
  if(positive){
   const other=donor(b),before=b.life;
   choose(a,q=>q.type==='chooseCards'&&q.aiHint?.kind==='voteExile'?{...q,from:[other],min:1,max:1}:null);
   choose(b,q=>q.type==='chooseCards'&&q.aiHint?.kind==='voteExile'?{...q,from:[c],min:1,max:1}:null);
   await cast(put(M,a,"Council's Judgment",'hand'));
   assert.equal(c.zone,'exile');assert.equal(b.life,before-2,'voting trigger survives source exile by the vote result');
  }
 }else if(name==='Ballot Broker'||name==="Brago's Representative"){
  const c=await source();if(!positive&&name!== 'Ballot Broker'){M.OracleV8AbilityLoss.add(g,[c],{temporary:true});g.recalc();}
  const options=[{key:'one',label:'One'},{key:'two',label:'Two'}],ctx={g,src:c,you:a};
  const votes=await M.VN.vote(ctx,options);assert.equal(votes.filter(r=>r.player===a).length,positive?2:1);assert.equal(votes.filter(r=>r.player===b).length,1);
  const publicVote=await M.E7.vote(g,a,c,options);assert.equal(publicVote.ballots.filter(r=>r.player===a).length,positive?2:1);
  const secret=await M.E7.secretVote(g,a,c,options);assert.equal(secret.ballots.filter(r=>r.player===a).length,positive?2:1);await settle(g);
 }else throw Error('Missing extra v74 proof '+name);
 assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return checks;
}
export async function operationProofExtraV74(M,entry,op,role,h){if(!names.includes(entry.raw.name))return null;return await proveExtraV74(M,entry.raw.name,role,true,h)+await proveExtraV74(M,entry.raw.name,role,false,h);}
