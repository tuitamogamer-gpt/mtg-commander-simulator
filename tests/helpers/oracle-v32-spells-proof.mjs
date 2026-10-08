import strict from 'node:assert/strict';
import {context, settle} from './oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import TEXT from '../../scripts/oracle-v32-spell-text.json' with {type:'json'};
export const wholeSourcesV32 = new Set(Object.keys(TEXT));

export async function proveSpellV32(M,name,role,positive,h,assert=strict) {
  const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
  fund(a);fund(b);for(const p of g.players)while(p.library.length<30)put(M,p,'Forest');
  const make=(p,extra={},zone='battlefield')=>zone==='battlefield'?permanent(M,g,p,def('V32 witness',['Creature'],{toughness:'20',...extra})):put(M,p,def('V32 witness',['Creature'],extra),zone);
  const own=make(a),enemy=make(b),other=make(b),source=put(M,a,name,'hand');
  let target=[enemy],extra=[],picked=[],n=0;
  if(name==='Blow Your House Down'){
    enemy.def={...enemy.def,subtypes:['Wall']};other.def={...other.def,subtypes:['Wall'],kws:['indestructible']};target=positive?[enemy,other,own]:[];
  }
  if(['Baleful Stare','Withering Gaze'].includes(name)){
    target=[b];const subtype=name==='Baleful Stare'?'Mountain':'Forest',color=name==='Baleful Stare'?'R':'G';
    extra=[make(b,{types:['Land'],subtypes:[subtype],colorsOverride:[color]},'hand'),make(b,{colorsOverride:[positive?color:'B']},'hand'),make(b,{colorsOverride:['W']},'hand')];
  }
  if(name==='Whirlwind Denial'){
    target=[];
    for(let i=0;i<2;i++){
      const spell=put(M,b,def('Opposing instant '+i,['Instant'],{cost:'{1}',resolve:async()=>{b.v32Resolved=(b.v32Resolved||0)+1;}}),'hand');
      assert.equal(await g.castSpell(b,spell,{from:'hand'}),true);extra.push(spell);
    }
    enemy.def={...enemy.def,abilities:[{label:'V32 paid ability',cost:{mana:'{1}'},run:async()=>{b.v32Resolved=(b.v32Resolved||0)+1;}}]};g.recalc();
    assert.equal(await g.activateAbility(b,g.activatableList(b).find(row=>row.card===enemy)),true);
    const spell=put(M,a,def('Friendly instant',['Instant'],{cost:'{1}',resolve:async()=>{a.v32Resolved=true;}}),'hand');
    assert.equal(await g.castSpell(a,spell,{from:'hand'}),true);
  }
  if(name==='Split the Party'){target=[b];extra=[enemy,other,make(b),make(b)];if(positive)extra.push(make(b));}
  if(["Eunuchs' Intrigues",'Goblin War Cry'].includes(name)){
    target=[b];extra=[enemy,other,make(b)];if(!positive)for(const c of extra)await g.move(c,'exile');
  }
  if(name==='Book Burning')target=[b];
  if(name==='Coalition Victory'){
    target=[];own.def={...own.def,colorsOverride:positive?['W','U','B','R','G']:['W','U','B','R']};
    extra=[make(a,{types:['Land'],subtypes:['Plains','Island','Swamp','Mountain','Forest'],power:undefined,toughness:undefined})];
  }
  if(name==='Worldfire'){
    target=[];a.life=positive?1:17;b.life=positive?50:1;
    extra=[make(a,{},'hand'),make(b,{},'hand'),make(a,{},'graveyard'),make(b,{},'graveyard')];
  }
  if(name==="Kaervek's Hex"){
    target=[];own.def={...own.def,colorsOverride:['B','G']};enemy.def={...enemy.def,colorsOverride:['G']};other.def={...other.def,colorsOverride:['B']};extra=[make(b,{colorsOverride:['U']})];
    if(!positive)g.untilEffects.push({kind:'oraclePreventNextAmount',target:enemy,zoneVersion:enemy.zoneVersion,remaining:1,expires:'eot'});
  }
  if(['Planar Overlay','Global Ruin'].includes(name)){
    target=[];
    const dual=make(a,{types:['Land'],subtypes:['Forest','Island'],power:undefined,toughness:undefined}),forest=permanent(M,g,a,M.DEFS.Forest),utility=make(a,{types:['Land'],power:undefined,toughness:undefined}),swamp=permanent(M,g,b,M.DEFS.Swamp);
    extra=[dual,forest,utility,swamp];picked=positive?[dual,swamp]:[forest,dual,swamp];
  }
  if(name==='Broadcast Takeover'){
    target=[];enemy.def={...enemy.def,types:['Artifact','Creature']};own.def={...own.def,types:['Artifact','Creature']};g.tap(enemy);g.tap(own);
    extra=[make(b,{types:['Artifact'],power:undefined,toughness:undefined})];g.tap(extra[0]);
  }
  if(name==='Tune Up'){
    extra=[make(a,{types:['Artifact'],subtypes:positive?['Vehicle']:[],power:positive?'4':undefined,toughness:positive?'4':undefined},'graveyard')];target=extra;
  }
  if(name==='Blightning'){
    if(positive){enemy.def={...enemy.def,types:['Planeswalker'],power:undefined,toughness:undefined,loyalty:'3'};enemy.counters.loyalty=3;target=[enemy];}else target=[b];
    extra=[make(b,{},'hand'),make(b,{},'hand'),make(b,{},'hand')];
  }
  if(name==='Consign to Dream')enemy.def={...enemy.def,colorsOverride:positive?['G']:['U']};
  if(name==='Sweep Away')enemy.attacking=positive?a:null;
  if(name==='Light of Judgment'){
    enemy.def={...enemy.def,toughness:'3'};extra=[make(a,{types:['Artifact'],subtypes:['Equipment'],power:undefined,toughness:undefined}),make(b,{types:['Artifact'],subtypes:['Equipment'],power:undefined,toughness:undefined})];
    for(const c of extra)assert.equal(await g.attach(c,enemy),true);
  }
  g.recalc();
  const questions=[];
  for(const p of [a,b])choose(p,q=>{
    questions.push({p,q});
    if(q.type==='chooseTargets')return {...q,candidates:target,min:target.length,max:target.length};
    if(q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')){
      const accept=name==='Book Burning'?p===b&&positive:name==='Whirlwind Denial'?positive:name==='Sweep Away'?positive:false;
      return {...q,options:q.options.filter(o=>o.key===(accept?'yes':'no'))};
    }
    if(q.type==='chooseCards'&&q.prompt.startsWith(name+':')){
      let from=q.from,min=q.min,max=q.max;
      if(['Planar Overlay','Global Ruin'].includes(name))from=[picked.find(c=>q.from.includes(c))];
      if(name==='Light of Judgment'){from=positive?[extra[0]]:[];min=max=from.length;}
      return {...q,from,min,max};
    }
    return null;
  });
  const before={life:a.life,bLife:b.life,hand:a.hand.length,bHand:b.hand.length,library:b.library.length,mana:total(a),bMana:total(b)};
  assert.equal(await g.castSpell(a,source,{from:'hand'}),true,name+' actual paid cast');
  assert.ok(total(a)<before.mana,name+' mana consumed');await settle(g);
  switch(name){
    case 'Blow Your House Down':assert.equal(enemy.zone,positive?'graveyard':'battlefield');assert.equal(other.zone,'battlefield');assert.equal(!!other.cur.cantBlock,positive);assert.equal(!!own.cur.cantBlock,positive);break;
    case 'Baleful Stare':case 'Withering Gaze':assert.equal(a.hand.length,before.hand-1+(positive?2:1));assert.equal(b.hand.length,3);break;
    case 'Whirlwind Denial':assert.equal(b.v32Resolved||0,positive?3:0);assert.equal(a.v32Resolved,true);assert.equal(before.bMana-total(b),positive?12:0);assert.equal(extra.every(c=>c.zone==='graveyard'),true);break;
    case 'Split the Party':assert.equal(extra.filter(c=>c.zone==='hand').length,positive?3:2);assert.equal(own.zone,'battlefield');break;
    case "Eunuchs' Intrigues":case 'Goblin War Cry':assert.equal(extra.filter(c=>c.zone==='battlefield'&&c.cur.cantBlock).length,positive?2:0);assert.equal(!!own.cur.cantBlock,false);break;
    case 'Book Burning':assert.equal(a.life,before.life);assert.equal(b.life,before.bLife-(positive?6:0));assert.equal(b.library.length,before.library-(positive?0:6));break;
    case 'Coalition Victory':assert.equal(!!g.gameOver,positive);assert.equal(!!b.lost,positive);break;
    case 'Worldfire':for(const c of [own,enemy,other,...extra])assert.equal(c.zone,'exile');assert.equal(a.life,1);assert.equal(b.life,1);assert.equal(source.zone,'graveyard');break;
    case "Kaervek's Hex":assert.equal(own.damage,1);assert.equal(enemy.damage,positive?2:1);assert.equal(other.damage,0);assert.equal(extra[0].damage,1);break;
    case 'Planar Overlay':assert.equal(extra[0].zone,'hand');assert.equal(extra[1].zone,positive?'battlefield':'hand');assert.equal(extra[2].zone,'battlefield');assert.equal(extra[3].zone,'hand');break;
    case 'Global Ruin':assert.equal(extra[0].zone,'battlefield');assert.equal(extra[1].zone,positive?'graveyard':'battlefield');assert.equal(extra[2].zone,'graveyard');assert.equal(extra[3].zone,'battlefield');break;
    case 'Broadcast Takeover':assert.equal(enemy.ctrl,a);assert.equal(extra[0].ctrl,a);assert.equal(enemy.tapped,false);assert.equal(extra[0].tapped,false);assert.equal(enemy.kw('haste'),true);assert.equal(other.ctrl,b);assert.equal(own.tapped,true);assert.equal(own.kw('haste'),false);break;
    case 'Tune Up':assert.equal(extra[0].zone,'battlefield');assert.equal(extra[0].ctrl,a);assert.equal(extra[0].is('Creature'),positive);break;
    case 'Blightning':assert.equal(b.hand.length,1);assert.equal(b.life,before.bLife-(positive?0:3));if(positive)assert.equal(enemy.zone,'graveyard');break;
    case 'Consign to Dream':case 'Sweep Away':assert.equal(enemy.zone,positive?'library':'hand');if(positive)assert.equal(b.library.at(-1),enemy);break;
    case 'Light of Judgment':assert.equal(enemy.zone,'graveyard');assert.equal(extra[0].zone,positive?'graveyard':'battlefield');assert.equal(extra[1].zone,'battlefield');break;
    default:throw Error('Missing v32 spell proof '+name);
  }
  assertGameStateInvariants(g);if(h)h.assertControllerRole(M,f,name);
  return f;
}

export async function operationProofV32(M,entry,op,role,h){
  if(!wholeSourcesV32.has(entry.raw.name))return null;
  let checks=0;const assert=Object.fromEntries(['equal','ok'].map(key=>[key,(...args)=>{checks++;strict[key](...args);} ]));
  for(const positive of [false,true])await proveSpellV32(M,entry.raw.name,role,positive,h,assert);
  return checks;
}
