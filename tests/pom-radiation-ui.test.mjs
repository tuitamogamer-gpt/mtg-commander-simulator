import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {loadEngine} from './helpers/load-engine.mjs';
const M=loadEngine();
runInNewContext(readFileSync(new URL('../src/modules/ui.js',import.meta.url),'utf8'),{
  MTG:M,document:{readyState:'loading',addEventListener(){}},window:{addEventListener(){}},console,setTimeout,clearTimeout,
  localStorage:{getItem(){return null;},setItem(){}},
});
test('radiation HUD hides invalid or zero counts and exposes a labeled positive count',()=>{
  const ui=M.UI.prototype;
  for(const rad of [undefined,0,-1,NaN,Infinity])assert.equal(ui.radBadge({counters:{rad}}),'');
  assert.match(ui.radBadge({counters:{rad:4}}),/aria-label="4 rad counters"/);
  assert.match(ui.radBadge({counters:{rad:4}}),/<b>4<\/b><small>RAD<\/small>/);
});
test('public player details explain radiation and remove it when counters are gone',()=>{
  const g=new M.Game({seed:12,paced:false}),p=g.addPlayer('You',{name:'Radiation'},null,false);
  p.counters.rad=3;
  const effects=M.UI.prototype.playerStatusEffects.call(M.UI.prototype,g,p);
  assert.match(effects.find(e=>e.key==='rad').detail,/3 rad counters.*precombat main phase.*nonland/);
  p.counters.rad=0;
  assert.equal(M.UI.prototype.playerStatusEffects.call(M.UI.prototype,g,p).some(e=>e.key==='rad'),false);
});
