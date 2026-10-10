import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

for(const role of ['human','ai'])for(const blink of [false,true])test(`${role}: paid Strionic Resonator copies share the ${blink?'blinked old':'unchanged'} Planetarium action record`,async()=>{
 const f=nativeFixture(role),planet=await f.cast('Planetarium of Wan Shi Tong',Array(6).fill('Wastes'));
 const resonator=await f.cast('Strionic Resonator',['Wastes','Wastes']),flicker=f.put('Ghostly Flicker','hand'),island=f.put('Island');
 f.put('Island');for(let i=0;i<3;i++)f.put('Wastes');
 const version=planet.zoneVersion,models=[f.put('Ornithopter','library'),f.put('Ornithopter','library')];f.put('Island','library');
 let stage=0,opportunities=0;
 f.cards=q=>{if(q.prompt?.startsWith('You may cast one of these cards')){opportunities++;return[q.from[0]];}};
 f.targets=q=>q.max===2&&q.candidates.includes(planet)&&q.candidates.includes(island)?[planet,island]:
  q.candidates.some(so=>so.kind==='trigger'&&so.srcCard===planet)?[q.candidates.find(so=>so.kind==='trigger'&&so.srcCard===planet)]:undefined;
 f.priority=q=>{
  if(q.player!==f.me)return;
  const triggers=q.stack.filter(so=>so.kind==='trigger'&&so.srcCard===planet);
  if(stage===0&&triggers.length){const entry=q.acts.find(row=>row.card===resonator);assert.ok(entry,'printed copy activation is funded and offered');stage=1;return{kind:'activate',entry};}
  if(stage===1&&triggers.length===2){
   stage=2;
   if(blink){const offer=q.casts.find(row=>row.card===flicker);assert.ok(offer);return{kind:'cast',card:flicker,from:offer.from,alt:offer.alt};}
  }
 };
 await f.cast('Opt',['Island']);
 assert.equal(stage,2);assert.equal(resonator.tapped,true,'the real {2}, tap cost is paid');
 if(blink){assert.equal(flicker.castMeta.manaSpent,3);assert.equal(planet.zoneVersion,version+2);}else assert.equal(planet.zoneVersion,version);
 assert.equal(models.filter(c=>c.zone==='battlefield').length,1,'both original-object abilities share one accepted cast');
 assert.equal(opportunities,1);
 if(blink){
  const next=f.put('Ornithopter','library');f.put('Island','library');await f.cast('Opt',['Island']);
  assert.equal(next.zone,'battlefield','the new Planetarium incarnation keeps its own action available');assert.equal(opportunities,2);
 }
});
