import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
const M=loadEngine();
// Costs are announced and revalidated before resources move. A stale UI action
// cannot spend mana, life, or a replacement incarnation of a hand card.
import {context,settle} from './helpers/oracle-v8-fixtures.mjs';
import {fund,put,permanent,def,total,choose} from './helpers/oracle-v30-permanents-proof.mjs';
for(const role of ['human','ai'])test(role+': v56 costs reject stale hand and locked life payments',async()=>{
 const {game:g,a,b}=context(M,role);fund(a);fund(b);
 const leash=permanent(M,g,a,M.DEFS.Leashling),card=put(M,a,'Forest','hand');
 const row=g.activatableList(a).find(r=>r.card===leash);assert.ok(row);
 await g.move(card,'graveyard');assert.equal(await g.activateAbility(a,row),false);assert.equal(leash.zone,'battlefield');
 await g.move(card,'hand');const version=card.zoneVersion,before=total(a),prior=a.controller.decide.bind(a.controller);
 a.controller.decide=async(game,q)=>{const answer=await prior(game,q);if(q.type==='chooseCards'&&q.from.includes(card)){await g.move(card,'exile');await g.move(card,'hand');}return answer;};
 assert.equal(await g.activateAbility(a,row),false);assert.ok(card.zoneVersion>version);assert.equal(card.zone,'hand');assert.equal(total(a),before);a.controller.decide=prior;
 const betrayal=permanent(M,g,a,M.DEFS['Murderous Betrayal']),target=permanent(M,g,b,def('V56 legal nonblack target'));
 const costRow=g.activatableList(a).find(r=>r.card===betrayal);assert.ok(costRow);
 g.untilEffects.push({kind:'c1719LifeLock',who:a,expires:'eot'});const life=a.life,mana=total(a);
 assert.equal(g.activatableList(a).some(r=>r.card===betrayal),false);assert.equal(await g.activateAbility(a,costRow),false);
 assert.equal(a.life,life);assert.equal(total(a),mana);assert.equal(target.zone,'battlefield');
});
for(const role of ['human','ai'])test(role+': Siren requirements allow tied destinations and survive a control change',async()=>{
 const {game:g,a,b,others}=context(M,role,2),third=others[1];for(const p of g.players)fund(p);
 const host=permanent(M,g,b,def('V56 forced attacker',['Creature'],{kws:['haste']}));
 for(const p of [a,third]){const siren=permanent(M,g,p,M.DEFS['Alluring Siren']);choose(p,q=>q.type==='chooseTargets'?{...q,candidates:[host],min:1,max:1}:null);const r=g.activatableList(p).find(r=>r.card===siren);assert.ok(r);assert.equal(await g.activateAbility(p,r),true);await settle(g);}
 g.turnPlayer=b;assert.equal(g.canAttackTarget(host,a),true);assert.equal(g.canAttackTarget(host,third),true);assert.equal(g.hasAttackRequirement(host),true);
 M.OracleV8Control.gain(g,host,third);g.recalc();g.turnPlayer=third;assert.equal(g.canAttackTarget(host,a),true);assert.equal(g.canAttackTarget(host,b),false);assert.equal(g.hasAttackRequirement(host),true);
});
