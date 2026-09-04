import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
const MTG=fixtureEngine([
 ['Forecast Draw','Draw two cards.\nForecast — {1}{U}, Reveal this card from your hand: Draw a card.','Sorcery','{3}{U}'],
 ['Forecast Tap','Forecast — Tap two untapped white and/or blue creatures you control, Reveal this creature from your hand: Draw a card.','Creature — Bird','{5}{U}'],
 ['Forecast Pump','Forecast — {W}, Reveal this creature from your hand: Target creature gets +1/+1 until end of turn.','Creature — Bird','{5}{W}'],
 ['Forecast Blue','','Creature — Bear','{U}'],['Forecast White','','Creature — Bear','{W}'],['Forecast Red','','Creature — Bear','{R}'],
]);
const own=(ctx,name,zone='battlefield')=>put(MTG,ctx.game,ctx.a,name,zone);
function ready(role,name='Forecast Draw'){const ctx=context(MTG,role);ctx.game.phase='upkeep';ctx.a.pool={W:1,U:1,B:0,R:0,G:0,C:1};return{...ctx,source:own(ctx,name,'hand')};}
const action=ctx=>ctx.game.activatableList(ctx.a).find(o=>o.card===ctx.source&&o.handAbility);
for(const role of ['human','ai']){
 test(`Forecast ${role}: reveals and retains the paid source, resolves through Stack and enforces own upkeep once`,async()=>{
  const ctx=ready(role),hidden=own(ctx,'Forecast Red','hand'),reveals=[];ctx.game.revealToHuman=async q=>reveals.push(q);
  ctx.game.phase='main1';assert.equal(action(ctx),undefined);assert.equal(await ctx.game.activateAbility(ctx.a,{card:ctx.source,handAbility:true}),false);
  ctx.game.phase='upkeep';ctx.game.turnPlayer=ctx.b;assert.equal(action(ctx),undefined);ctx.game.turnPlayer=ctx.a;
  assert.equal(await ctx.game.activateAbility(ctx.a,action(ctx)),true);assert.equal(ctx.source.zone,'hand');assert.equal(ctx.a.pool.C+ctx.a.pool.U,0);assert.deepEqual(reveals.map(q=>q.cards[0]),[ctx.source]);
  assert.ok(ctx.game.stack.some(o=>o.kind==='ability'));assert.equal(ctx.a.hand.length,2);assert.equal(action(ctx),undefined);
  assert.equal(await ctx.game.activateAbility(ctx.a,{card:ctx.source,handAbility:true}),false);await settle(ctx.game);assert.equal(ctx.a.hand.length,3);
  assert.deepEqual(Array.from(ctx.game.forecastRevealedCards()),[ctx.source]);const view=MTG.createBotPlayerView(ctx.game,ctx.b.idx),row=view.players.find(p=>p.id===ctx.a.idx);
  assert.equal(row.hand,undefined);assert.deepEqual(Array.from(row.revealedHand,c=>c.name),['Forecast Draw']);assert.ok(!JSON.stringify(row).includes(hidden.name));
  ctx.game.phase='draw';assert.equal(ctx.game.forecastRevealedCards().length,0);assert.equal(MTG.createBotPlayerView(ctx.game,ctx.b.idx).players.find(p=>p.id===ctx.a.idx).revealedHand,undefined);
  ctx.game.phase='upkeep';ctx.game.turnNo++;ctx.a.pool.U=1;ctx.a.pool.C=1;assert.ok(action(ctx));
 });
 test(`Forecast ${role}: Sky Hussar cost taps exactly two eligible creatures without summoning-sickness restrictions`,async()=>{
  const ctx=ready(role,'Forecast Tap');ctx.a.pool={W:0,U:0,B:0,R:0,G:0,C:0};const blue=own(ctx,'Forecast Blue'),red=own(ctx,'Forecast Red');blue.sick=true;
  put(MTG,ctx.game,ctx.b,'Forecast White');assert.equal(action(ctx),undefined);
  const white=own(ctx,'Forecast White');white.sick=true;white.tapped=true;assert.equal(action(ctx),undefined);white.tapped=false;
  assert.equal(await ctx.game.activateAbility(ctx.a,action(ctx)),true);assert.equal(blue.tapped,true);assert.equal(white.tapped,true);assert.equal(red.tapped,false);assert.equal(ctx.source.zone,'hand');
  await settle(ctx.game);assert.equal(ctx.a.hand.length,2);
 });
 test(`Forecast ${role}: ability keeps its target identity after source leaves the revealed hand`,async()=>{
  const ctx=ready(role,'Forecast Pump'),target=own(ctx,'Forecast Blue'),before=target.power;
  assert.equal(await ctx.game.activateAbility(ctx.a,action(ctx)),true);await ctx.game.move(ctx.source,'graveyard');assert.equal(ctx.game.forecastRevealedCards().length,0);await settle(ctx.game);assert.equal(target.power,before+1);
  await ctx.game.move(ctx.source,'hand');ctx.a.pool.W=1;assert.ok(action(ctx),'a new hand object can forecast again');assert.equal(await ctx.game.activateAbility(ctx.a,action(ctx)),true);
  await ctx.game.move(target,'exile');await ctx.game.move(target,'battlefield');await settle(ctx.game);assert.equal(target.power,before,'a returning target is a different object');
 });
}
test('Forecast rejects duplicate tap costs, moved payment objects, and forged targets before mana payment',async()=>{
 const ctx=ready('human','Forecast Tap'),blue=own(ctx,'Forecast Blue'),white=own(ctx,'Forecast White');ctx.a.controller.decide=async(g,q)=>q.type==='chooseCards'?[blue,blue]:[];
 assert.equal(await ctx.game.activateAbility(ctx.a,action(ctx)),false);assert.equal(blue.tapped,false);assert.equal(white.tapped,false);assert.equal(ctx.game.forecastRevealedCards().length,0);
 ctx.a.controller.decide=async(g,q)=>{if(q.type==='chooseCards'){await g.move(blue,'exile');await g.move(blue,'battlefield');return[blue,white];}return[];};
 assert.equal(await ctx.game.activateAbility(ctx.a,action(ctx)),false);assert.equal(blue.tapped,false);
 const pump=ready('human','Forecast Pump');assert.equal(action(pump),undefined);
 assert.equal(await pump.game.activateAbility(pump.a,{card:pump.source,handAbility:true},[pump.b]),false);assert.equal(pump.a.pool.W,1);
});
test('Forecast local AI chooses a real upkeep activation and keeps its card',async()=>{
 const ctx=ready('ai');const acts=ctx.game.activatableList(ctx.a);const selected=await ctx.a.controller.decide(ctx.game,{type:'priority',player:ctx.a,phase:ctx.game.phase,casts:[],acts,stack:[]});
 assert.equal(selected.kind,'activate');assert.equal(selected.entry.card,ctx.source);await ctx.game.performAction(ctx.a,selected);assert.equal(ctx.source.zone,'hand');await settle(ctx.game);assert.equal(ctx.a.hand.length,2);
});
test('Forecast parser closes unknown cost, missing self-reveal and variable mana',()=>{
 for(const text of ['Forecast — {X}{U}, Reveal this card from your hand: Draw a card.','Forecast — {U}: Draw a card.','Forecast — Sacrifice a creature, Reveal this card from your hand: Draw a card.'])assert.equal(!!semanticClass({name:'UnknownForecast',layout:'normal',type_line:'Creature — Bird',mana_cost:'{3}{U}',oracle_text:text,power:'2',toughness:'2'}).semanticClass,false);
});

test('Forecast UI keeps only revealed hand cards inspectable and removes the tray when disclosure expires',async()=>{
 const ctx=ready('human');own(ctx,'Forecast Red','hand');await ctx.game.activateAbility(ctx.a,action(ctx));
 function node(tagName){const el={tagName,children:[],className:'',innerHTML:'',dataset:{},style:{setProperty(){}},appendChild(child){this.children.push(child);return child;},setAttribute(){},querySelector(selector){const classes=selector.split(',').map(s=>s.trim().slice(1));return this.children.find(child=>classes.some(c=>child.className.split(' ').includes(c)))||this.children.map(child=>child.querySelector(selector)).find(Boolean)||null;}};el.classList={add(...names){el.className+=' '+names.join(' ');},contains(name){return el.className.split(' ').includes(name);}};return el;}
 const runtime={...MTG},document={readyState:'loading',addEventListener(){},querySelector(){return null;},createElement:node};
 vm.runInNewContext(fs.readFileSync(new URL('../src/modules/ui.js',import.meta.url),'utf8'),{MTG:runtime,document,window:{addEventListener(){}},console,setTimeout,clearTimeout,localStorage:{getItem(){return null;},setItem(){}}});
 const ui=new runtime.UI();ui.me=ctx.b;ui.game=ctx.game;ui.render=()=>{};
 const tray=ui.renderHand(ctx.game).querySelector('.forecasttray');assert.ok(tray);
 const button=tray.children[1].children[0];assert.equal(button.dataset.cname,'Forecast Draw');assert.equal(tray.children[1].children.length,1);button.onclick();assert.equal(ui.sheet.card,ctx.source);
 ctx.game.phase='draw';assert.equal(ui.renderHand(ctx.game).querySelector('.forecasttray'),null);
 ctx.game.phase='upkeep';await ctx.game.move(ctx.source,'graveyard');assert.equal(ui.renderHand(ctx.game).querySelector('.forecasttray'),null);
});
