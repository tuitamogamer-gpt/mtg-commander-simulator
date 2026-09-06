import assert from 'node:assert/strict';
import {loadEngine} from './load-engine.mjs';
import {context,put,settle} from './oracle-v8-fixtures.mjs';
export {settle};
export const M=loadEngine(),covered=new Set();
export const mana=p=>Object.values(p.pool).reduce((n,v)=>n+v,0);
export const fuel=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=30;};
export function setup(role='human',n=2){const f=context(M,role,n);f.x=3;
 for(const p of f.game.players){const original=p.controller.decide.bind(p.controller);p.controller={decide:async(g,q)=>{
   const value=await f.decide?.(p,q);if(value!==undefined)return value;
   if(p.isAI)return original(g,q);
   if(q.type==='chooseTargets')return q.quickTarget?[q.quickTarget]:q.candidates.slice(0,Math.min(q.max,q.candidates.length));
   if(q.type==='chooseCards')return q.from.slice(0,q.min||Math.min(q.max,q.from.length));
   if(q.type==='chooseX')return Math.min(f.x,q.max);
   if(q.type==='chooseOption'&&/demonstrate/i.test(q.prompt)&&q.options.some(o=>o.key==='no'))return 'no';
   return original(g,q);
 }};}return f;
}
export const card=(f,name,zone='battlefield',p=f.a)=>{const c=put(M,f.game,p,name,zone);f.game.recalc();return c;};
export const body=(f,p=f.a)=>card(f,'Grizzly Bears','battlefield',p);
export async function play(f,name,opts={}){const p=opts.player||f.a,c=opts.card||card(f,name,opts.from||'hand',p);fuel(p);const before=mana(p);
 assert.equal(await f.game.castSpell(p,c,{from:c.zone,...opts}),true,name+' casts');assert.ok(f.game.stack.some(so=>so.card===c),name+' uses Stack');assert.ok(mana(p)<before||opts.alt?.free,name+' pays mana');
 await settle(f.game);covered.add(name);return c;
}
export async function activate(f,c,index=0){fuel(c.ctrl);const entry=f.game.activatableList(c.ctrl).find(e=>e.card===c&&(typeof index==='function'?index(e):e.ability===c.def.abilities?.[index]));
 assert.ok(entry,c.name+' activation available');assert.equal(await f.game.activateAbility(c.ctrl,entry),true,c.name+' activates');await settle(f.game);covered.add(c.name);return entry;
}
export async function event(f,name,data){await f.game.emit(name,data);await settle(f.game);}
