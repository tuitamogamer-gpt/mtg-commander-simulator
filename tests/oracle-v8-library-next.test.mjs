import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
const rows=[
 ['Library Power','When this creature enters, look at the top four cards of your library. You may reveal a creature card with power 2 or less from among them and put it into your hand. Put the rest on the bottom of your library in a random order.'],
 ['Library Historic','When this creature enters, look at the top four cards of your library. You may reveal a historic card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.'],
 ['Library StatSearch','Search your library for a creature card with power or toughness 6 or greater, reveal it, put it into your hand, then shuffle.','Sorcery'],
 ['Library BasicType','Search your library for a land card with a basic land type, reveal it, put it into your hand, then shuffle.','Sorcery'],
 ['Library SpiritSearch','Search your library for any number of Spirit cards, put them into your graveyard, then shuffle.','Sorcery'],
 ['Library TopLand','When this creature enters, you may look at the top four cards of your library. If you do, reveal up to one land card from among them, then put that card on top of your library and the rest on the bottom in a random order.'],
 ['Library ManaTop','When this creature enters, look at the top four cards of your library. You may reveal a creature card with mana value 3 or less from among them and put it into your hand. Put the rest on the bottom of your library in a random order.'],
];
const M=fixtureEngine(rows);
function world(role){const ctx=context(M,role);if(role==='human'){const decide=ctx.a.controller.decide;ctx.a.controller.decide=async(g,q)=>{if(q.type==='chooseCards'&&(q.search||q.prompt?.startsWith('Choose inspected'))){const result=q.from.slice(0,q.max);ctx.trace.push({q,result});return result;}return decide(g,q);};}return ctx;}
function donor(ctx,def){const card=new M.CardInst({name:'Library selection donor '+ctx.a.library.length,types:['Creature'],subtypes:[],super:[],cost:'{4}',power:'2',toughness:'3',...def},ctx.a);card.zone='library';ctx.a.library.push(card);return card;}
async function cast(ctx,name){const c=put(M,ctx.game,ctx.a,name,'hand');ctx.a.pool.G=1;assert.equal(await ctx.game.castSpell(ctx.a,c,{from:'hand'}),true);await settle(ctx.game);return c;}
for(const role of ['human','ai']){
 for(const [name,valid,invalid]of [['Library Power',{power:'2',toughness:'8'},{power:'3',toughness:'2'}],['Library ManaTop',{cost:'{3}'},{cost:'{4}'}]])test(`${role}: ${name} uses exact printed stat and no cards beyond the inspected top`,async()=>{
  const ctx=world(role),unseen=donor(ctx,valid),match=donor(ctx,valid),miss=donor(ctx,invalid),land=donor(ctx,{types:['Land'],cost:''}),spell=donor(ctx,{types:['Instant']});await cast(ctx,name);assert.equal(match.zone,'hand');assert.equal(unseen.zone,'library');assert.ok([miss,land,spell].every(c=>c.zone==='library'));const q=ctx.trace.find(r=>r.q.prompt?.startsWith('Choose inspected'));assert.deepEqual([...q.q.from],[match]);
 });
 for(const def of [{types:['Artifact']},{types:['Instant'],super:['Legendary']},{types:['Enchantment'],subtypes:['Saga']}])test(`${role}: historic selection accepts ${def.types[0]} ${def.super||def.subtypes||''} by its actual quality`,async()=>{
  const ctx=world(role),match=donor(ctx,def),miss=donor(ctx,{types:['Enchantment']}),spell=donor(ctx,{types:['Instant']}),creature=donor(ctx,{});await cast(ctx,'Library Historic');assert.equal(match.zone,'hand');assert.ok([miss,spell,creature].every(c=>c.zone==='library'));const q=ctx.trace.find(r=>r.q.prompt?.startsWith('Choose inspected'));assert.deepEqual([...q.q.from],[match]);
 });
 test(`${role}: power-or-toughness search includes either threshold and excludes neither`,async()=>{
  const ctx=world(role),a=donor(ctx,{power:'6',toughness:'1'}),b=donor(ctx,{power:'1',toughness:'6'}),miss=donor(ctx,{power:'5',toughness:'5'});await cast(ctx,'Library StatSearch');const q=ctx.trace.find(r=>r.q.search);assert.deepEqual(new Set(q.q.from),new Set([a,b]));assert.equal(q.result.length,1);assert.equal(q.result[0].zone,'hand');assert.equal(miss.zone,'library');
 });
 test(`${role}: a nonbasic typed land is eligible but an untyped nonbasic is not`,async()=>{
  const ctx=world(role);ctx.a.library=[];const typed=donor(ctx,{types:['Land'],subtypes:['Island','Mountain'],cost:''}),miss=donor(ctx,{types:['Land'],cost:''});await cast(ctx,'Library BasicType');const q=ctx.trace.find(r=>r.q.search);assert.deepEqual([...q.q.from],[typed]);assert.equal(typed.zone,'hand');assert.equal(miss.zone,'library');
 });
 test(`${role}: any-number Spirit search moves exact selected cohort into graveyard`,async()=>{
  const ctx=world(role),a=donor(ctx,{subtypes:['Spirit']}),b=donor(ctx,{subtypes:['Spirit']}),miss=donor(ctx,{subtypes:['Human']});await cast(ctx,'Library SpiritSearch');const q=ctx.trace.find(r=>r.q.search);assert.deepEqual(new Set(q.q.from),new Set([a,b]));assert.equal(q.q.min,0);assert.equal(q.q.max,2);assert.equal(q.result.length,2);assert.equal(a.zone,'graveyard');assert.equal(b.zone,'graveyard');assert.equal(miss.zone,'library');
 });
 test(`${role}: optional inspected land goes on top with every other inspected card on bottom`,async()=>{
  const ctx=world(role);const bottom=ctx.a.library[0],spell=donor(ctx,{types:['Instant']}),a=donor(ctx,{}),b=donor(ctx,{}),land=donor(ctx,{types:['Land'],cost:''});await cast(ctx,'Library TopLand');assert.equal(ctx.a.library.at(-1),land);assert.ok(ctx.a.library.slice(0,3).includes(spell)&&ctx.a.library.slice(0,3).includes(a)&&ctx.a.library.slice(0,3).includes(b));assert.equal(ctx.a.library[3],bottom);
 });
}
test('new library grammar rejects unknown post-selection clauses',()=>{
 for(const [name,oracle,type,cost]of rows){const c={name,oracle_text:oracle+' Then become the monarch twice.',type_line:type||'Creature',mana_cost:cost||'{G}',layout:'normal',power:'2',toughness:'3'};assert.equal(semanticClass(c).semanticClass,undefined,name);}
});
