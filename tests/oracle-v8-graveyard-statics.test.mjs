import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const M=loadEngine(),sources=[['Brawn','Trample','trample','Forest'],['Wonder','Flying','flying','Island'],['Filth','Swampwalk','swampwalk','Swamp'],['Valor','First strike','first strike','Plains'],['Anger','Haste','haste','Mountain'],['Portal','','','']];
const entries=sources.map(([label,printed,keyword,land],i)=>{
  const type_line=label==='Portal'?'Land':'Creature — Incarnation',oracle_text=label==='Portal'?'{T}: Add {C}.\nAs long as this card is in your graveyard, lands you control have "{T}: Add {G} or {W}."':printed+'\nAs long as this card is in your graveyard and you control a '+land+', creatures you control have '+keyword+'.';
  const card={name:'Graveyard Proof '+label,type_line,oracle_text,mana_cost:label==='Portal'?'':'{3}{G}',power:'3',toughness:'3',layout:'normal'},semantic=semanticClass(card,{compilerVersion:8});assert.ok(semantic.semanticClass,label+': '+semantic.reason);
  return {position:i+1,oracleId:'graveyard-static-'+i,scryfallId:'graveyard-static-print-'+i,...semantic,raw:{name:card.name,cost:card.mana_cost,oracle:oracle_text,types:[label==='Portal'?'Land':'Creature'],subtypes:label==='Portal'?[]:['Incarnation'],super:[],power:'3',toughness:'3',_ci:[]},catalog:{typeLine:type_line,commanderLegality:'legal'}};
});
M.registerOracleBatch({id:'oracle-graveyard-static-fixtures',sequence:9982,cards:entries});M.initData(M.RAW_DATA);
function setup(role){const human={async decide(g,q){if(q.type==='chooseTargets')return q.candidates.slice(0,q.min??1);if(q.type==='chooseCards')return q.from.slice(0,q.min??1);if(q.type==='chooseOption')return q.options[0].key;return null;}};const game=new M.Game({seed:162,paced:false}),a=game.addPlayer('A',{name:'A'},human,role==='ai'),b=game.addPlayer('B',{name:'B'},human,false);if(role==='ai')a.controller=new M.AIController(a,{difficulty:'hard',style:'balanced'});game.turnNo=5;game.turnPlayer=a;game.phase='main1';game.step='main';game.priorityRound=async()=>{};game.spotlight=async()=>{};game.pace=async()=>{};return{game,a,b};}
const creature={name:'Graveyard recipient',cost:'{1}',types:['Creature'],subtypes:['Bear'],super:[],power:'2',toughness:'20',kws:[],oracle:''};
function put(ctx,name,player=ctx.a,zone='battlefield'){const card=new M.CardInst(typeof name==='string'?M.DEFS[name]:name,player);card.ctrl=player;card.zone=zone;card.sick=false;if(zone==='battlefield'){ctx.game.battlefield.push(card);ctx.game.recalc();}else player[zone].push(card);return card;}
for(const role of ['human','ai']){
  for(const[label,,keyword,land]of sources.filter(s=>s[0]!=='Portal'))test(role+': '+label+' works from the owner graveyard after ability loss, and follows live land control',async()=>{
    const ctx=setup(role),{game,a,b}=ctx,source=put(ctx,'Graveyard Proof '+label),host=put(ctx,creature),foreign=put(ctx,creature,b),support=put(ctx,land),aura=put(ctx,'Lignify');
    await game.attach(aura,source);assert.equal(source.cur.abilitiesDisabled,true);M.OracleV8Control.gain(game,source,b);game.recalc();assert.equal(host.kw(keyword),false);
    await game.sacrifice(b,source);assert.equal(source.zone,'graveyard');assert.equal(source.owner===a,true);assert.equal(host.kw(keyword),true);assert.equal(foreign.kw(keyword),false);
    M.OracleV8Control.gain(game,support,b);game.recalc();assert.equal(host.kw(keyword),false);M.OracleV8Control.gain(game,support,a);game.recalc();assert.equal(host.kw(keyword),true);
    await game.move(source,'exile');assert.equal(host.kw(keyword),false);await game.move(source,'graveyard');assert.equal(host.kw(keyword),true);
    await game.move(host,'exile');await game.move(host,'battlefield');assert.equal(host.kw(keyword),true,'the static grant sees later entrants');
  });
  test(role+': Portal adds real green and white mana options to owner lands and removes them on exile',async()=>{
    const ctx=setup(role),{game,a,b}=ctx,portal=put(ctx,'Graveyard Proof Portal'),land={name:'Colorless land',cost:'',types:['Land'],subtypes:[],super:[],kws:[],oracle:'',mana:[{C:1}]},first=put(ctx,land),second=put(ctx,land),foreign=put(ctx,land,b);
    assert.equal(first.cur.extraMana.length,0);await game.move(portal,'graveyard');assert.equal(first.cur.extraMana.length,1);assert.equal(second.cur.extraMana.length,1);assert.equal(foreign.cur.extraMana.length,0);
    assert.equal(await game.payMana(a,M.parseCost('{G}{W}'),{isAbility:true}),true);assert.equal(first.tapped,true);assert.equal(second.tapped,true);assert.equal(Object.values(a.pool).reduce((sum,n)=>sum+n,0),0);
    first.tapped=second.tapped=false;await game.move(portal,'exile');assert.equal(first.cur.extraMana.length,0);assert.equal(await game.payMana(a,M.parseCost('{G}'),{isAbility:true}),false);assert.equal(first.tapped,false);
    assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);
  });
}
