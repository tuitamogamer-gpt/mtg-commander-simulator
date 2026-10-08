import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFixturePlan,registerCanonicalFixturePlan} from './helpers/oracle-fixture-plan.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,settle} from './helpers/oracle-v8-fixtures.mjs';
import {fund,total,put,choose} from './helpers/oracle-v30-permanents-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v74-extra.json',import.meta.url))).filter(c=>c.name==="Brago's Representative");
const plan=createFixturePlan(rows,74,9978),M=loadEngine();registerCanonicalFixturePlan(M,plan);
for(const role of ['human','ai'])for(const name of ['Erestor of the Council','Model of Unity'])test(`${role}: ${name} compares every actual ballot and preserves optional decisions`,async()=>{
 const {game:g,a,b}=context(M,role);fund(a);fund(b);g.spotlight=async()=>{};
 if(b.controller===a.controller)b.controller={decide:b.controller.decide.bind(b.controller)};
 let av=[],bv=[],allowOpponent=true,scryA=[],scryB=[];
 for(const p of [a,b])choose(p,q=>{
  if(q.type==='chooseOption'&&q.aiHint?.kind==='vote'){const key=(p===a?av:bv).shift();assert.ok(q.options.some(o=>o.key===key));return {...q,options:q.options.filter(o=>o.key===key)};}
  if(q.type==='chooseOption'&&q.aiHint?.kind==='mayScry')return {...q,options:q.options.filter(o=>o.key===(p===a||allowOpponent?'yes':'no'))};
  if(q.type==='scry')(p===a?scryA:scryB).push(q.cards.length);
  return null;
 });
 const cast=async(p,name)=>{g.turnPlayer=p;g.phase='main1';const c=put(M,p,name,'hand'),before=total(p);assert.equal(await g.castSpell(p,c,{from:'hand'}),true);assert.ok(total(p)<before);await settle(g);return c;};
 const source=await cast(a,name);await cast(a,"Brago's Representative");
 const vote=async()=>{const hand=a.hand.length;await M.VN.vote({g,src:source,you:a},[{key:'one',label:'One'},{key:'two',label:'Two'}]);await settle(g);if(name==='Erestor of the Council')assert.equal(a.hand.length,hand+1);};
 av=['one','two'];bv=['one'];await vote();
 if(name==='Erestor of the Council'){assert.equal(g.bf().filter(c=>c.ctrl===b&&c.hasSub('Treasure')).length,1);assert.deepEqual(scryA,[]);}else{assert.deepEqual(scryA,[2]);assert.deepEqual(scryB,[2]);}
 await cast(b,"Brago's Representative");av=['one','one'];bv=['one','two'];allowOpponent=false;await vote();
 if(name==='Erestor of the Council'){assert.equal(g.bf().filter(c=>c.ctrl===b&&c.hasSub('Treasure')).length,2,'an opponent can match one vote and differ on another');assert.deepEqual(scryA,[1]);}else{assert.deepEqual(scryA,[2,2]);assert.deepEqual(scryB,[2],'opponent independently declines their scry');}
 assert.equal(a.controller instanceof M.AIController,role==='ai');
});
