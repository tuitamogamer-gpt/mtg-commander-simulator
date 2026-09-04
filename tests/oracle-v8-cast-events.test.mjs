import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {extensionLine} from '../scripts/oracle-v8-cast-events.mjs';
import {extensionTarget,extensionEffect} from '../scripts/oracle-extensions-v8.mjs';
const rows=[
 ['Event Both',"Whenever you cast a spell that's both red and white, you gain 2 life."],
 ['Event Main','Whenever you cast an instant spell during your main phase, you gain 2 life.'],
 ['Event X','Whenever you cast a spell with {X} in its mana cost, you gain 2 life.'],
 ['Event XChoice','Whenever you cast a spell with {X} in its mana cost, look at the top X cards of your library. Put one of them into your hand and the rest on the bottom of your library in a random order.'],
 ['Event Target','Whenever an opponent casts a spell that targets you or a creature you control, you gain 2 life.'],
 ['Event Foreign',"Whenever an opponent casts a spell from anywhere other than their hand, you gain 2 life."],
 ['Event Fly','When an opponent casts a creature spell with flying, you gain 2 life.'],
 ['Event Library','Whenever you cast a spell from your library, you gain 2 life.'],
 ['Event OwnCast','When you cast this spell, draw X cards.','Creature','{X}{G}'],
];
const M=fixtureEngine(rows);
function world(role){const ctx=context(M,role),events=[];ctx.events=events;const emit=ctx.game.emit;ctx.game.emit=async function(event,data,...args){events.push({event,data});return emit.call(this,event,data,...args);};return ctx;}
function donor(ctx,player=ctx.a,def={},zone='hand'){const c=new M.CardInst({name:'Cast-event donor',types:['Instant'],subtypes:[],super:[],cost:'{0}',...def},player);c.zone=zone;player[zone].push(c);return c;}
async function cast(ctx,card,alt={}){card.owner.pool={W:10,U:10,B:10,R:10,G:10,C:20};assert.equal(await ctx.game.castSpell(card.owner,card,{from:card.zone,alt,...(String(card.def.cost).includes('{X}')?{xVal:0}:{})}),true);return ctx.game.stack.find(so=>so.card===card&&so.kind==='spell');}
async function triggerCount(ctx,watcher){await ctx.game.flushTriggers();return ctx.game.stack.filter(so=>so.kind==='trigger'&&so.srcCard===watcher).length;}
for(const role of ['human','ai']){
 for(const [cost,want] of [['{R}{W}',1],['{R}{W}{G}',1],['{R}',0],['{W}',0],['{0}',0]])test(`${role}: both-color cast ${cost} requires both colors`,async()=>{
  const ctx=world(role),watcher=put(M,ctx.game,ctx.a,'Event Both'),life=ctx.a.life;await cast(ctx,donor(ctx,ctx.a,{cost}));assert.equal(await triggerCount(ctx,watcher),want);await settle(ctx.game);assert.equal(ctx.a.life,life+2*want);
 });
 for(const [phase,own,type,want]of [['main1',true,'Instant',1],['main2',true,'Instant',1],['combat',true,'Instant',0],['main1',false,'Instant',0],['main1',true,'Sorcery',0]])test(`${role}: main-phase cast ${phase}/${own}/${type}`,async()=>{
  const ctx=world(role),watcher=put(M,ctx.game,ctx.a,'Event Main');ctx.game.phase=phase;if(!own)ctx.game.turnPlayer=ctx.b;
  await cast(ctx,donor(ctx,ctx.a,{types:[type]}));assert.equal(await triggerCount(ctx,watcher),want);ctx.game.phase='end';const before=ctx.a.life;await settle(ctx.game);assert.equal(ctx.a.life,before+2*want);
 });
 for(const [cost,want]of [['{X}{G}',1],['{5}',0]])test(`${role}: printed ${cost}, including chosen X=0, drives X-cost trigger`,async()=>{
  const ctx=world(role),watcher=put(M,ctx.game,ctx.a,'Event X');await cast(ctx,donor(ctx,ctx.a,{cost}));assert.equal(await triggerCount(ctx,watcher),want);await settle(ctx.game);
 });
 for(const [target,want]of [['you',1],['yourCreature',1],['yourArtifact',0],['theirCreature',0],['none',0]])test(`${role}: actual opponent spell target ${target}`,async()=>{
  const ctx=world(role),watcher=put(M,ctx.game,ctx.a,'Event Target');const permanent=target==='yourCreature'?put(M,ctx.game,ctx.a,'Grizzly Bears'):target==='theirCreature'?put(M,ctx.game,ctx.b,'Grizzly Bears'):target==='yourArtifact'?put(M,ctx.game,ctx.a,'Sol Ring'):null;
  const spec=target==='you'?{what:'player',filter:(g,c)=>c===ctx.a}:permanent?{what:'permanent',filter:(g,c)=>c===permanent}:null;
  await cast(ctx,donor(ctx,ctx.b,spec?{targets:[spec]}:{}));assert.equal(await triggerCount(ctx,watcher),want);await settle(ctx.game);
 });
 for(const [flying,want]of [[true,1],[false,0]])test(`${role}: opponent creature spell flying ${flying} is actually tested`,async()=>{
  const ctx=world(role),watcher=put(M,ctx.game,ctx.a,'Event Fly');ctx.game.turnPlayer=ctx.b;
  await cast(ctx,donor(ctx,ctx.b,{types:['Creature'],power:'1',toughness:'2',kws:flying?['flying']:[]}));assert.equal(await triggerCount(ctx,watcher),want);await settle(ctx.game);
 });
 for(const [watcherName,zone,own,want]of [['Event Foreign','hand',true,0],['Event Foreign','hand',false,1],['Event Foreign','graveyard',true,1],['Event Library','library',true,1],['Event Library','library',false,0]])test(`${role}: ${watcherName} checks exact ${own?'own':'foreign'} ${zone}`,async()=>{
  const ctx=world(role),watcher=put(M,ctx.game,ctx.a,watcherName),caster=watcherName==='Event Foreign'?ctx.b:ctx.a,owner=own?caster:caster===ctx.a?ctx.b:ctx.a;
  const card=donor(ctx,owner,{cost:'{5}',resolve:async()=>{}},zone),decide=caster.controller.decide;caster.controller.decide=async(g,q)=>q.type==='chooseCards'&&q.prompt?.startsWith('You may cast one')&&!caster.isAI?[card]:decide.call(caster.controller,g,q);
  assert.equal(await M.OracleV8PlayPermissions.castOne({g:ctx.game,you:caster,src:watcher},[card],{},{}),card);assert.equal(await triggerCount(ctx,watcher),want);await settle(ctx.game);
 });
 test(`${role}: copying a spell with both colors does not trigger another cast`,async()=>{
  const ctx=world(role),watcher=put(M,ctx.game,ctx.a,'Event Both'),so=await cast(ctx,donor(ctx,ctx.a,{cost:'{R}{W}'}));assert.equal(await triggerCount(ctx,watcher),1);await ctx.game.copySpell(so,ctx.a);assert.equal(await triggerCount(ctx,watcher),1);assert.equal(ctx.events.filter(e=>e.event==='cast').length,1);await settle(ctx.game);
 });
 for(const n of [0,3])test(`${role}: cast-event body retains the triggering spell's X=${n} after counter and new incarnation`,async()=>{
  const ctx=world(role),watcher=put(M,ctx.game,ctx.a,'Event XChoice'),card=donor(ctx,ctx.a,{cost:'{X}{G}'});ctx.a.pool={W:0,U:0,B:0,R:0,G:1,C:n};
  const inspected=[];ctx.a.controller.decide=((decide)=>async(g,q)=>{if(q.type==='cardReveal'&&q.kind==='look')inspected.push([...q.cards]);return decide(g,q);})(ctx.a.controller.decide);
  assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand',xVal:n}),true);const so=ctx.game.stack.find(so=>so.card===card&&so.kind==='spell');assert.equal(await triggerCount(ctx,watcher),1);await ctx.game.counterStackObject(so);await ctx.game.move(card,'exile');card.castMeta={x:9};const before=ctx.a.hand.length;await settle(ctx.game);assert.equal(ctx.a.hand.length,before+(n?1:0));if(role==='human'&&n)assert.equal(inspected[0].length,n);
 });
 test(`${role}: self cast-trigger preserves chosen X after the original is countered`,async()=>{
  const ctx=world(role),card=put(M,ctx.game,ctx.a,'Event OwnCast','hand');ctx.a.pool={W:0,U:0,B:0,R:0,G:1,C:3};assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand',xVal:3}),true);const original=ctx.game.stack.find(so=>so.card===card&&so.kind==='spell');assert.equal(await triggerCount(ctx,card),1);await ctx.game.counterStackObject(original);const before=ctx.a.hand.length;await settle(ctx.game);assert.equal(ctx.a.hand.length,before+3);assert.equal(card.zone,'graveyard');
 });
 for(const [face,want]of [['front',0],['back',1]])test(`${role}: physical modal ${face} face alone supplies printed colors`,async()=>{
  const ctx=world(role),watcher=put(M,ctx.game,ctx.a,'Event Both'),faces={layout:'modal_dfc',canonicalName:'Cast-event modal',faces:[{key:'front',def:{name:'Red front',types:['Instant'],subtypes:[],super:[],cost:'{R}',resolve:async()=>{}}},{key:'back',def:{name:'Red white back',types:['Instant'],subtypes:[],super:[],cost:'{R}{W}',resolve:async()=>{}}}]};
  const card=donor(ctx,ctx.a,M.OracleV8Faces.faceDefinition(faces,'front'));await cast(ctx,card,{oracleFace:face});assert.equal(await triggerCount(ctx,watcher),want);await settle(ctx.game);
 });
 for(const [half,want]of [['left',0],['right',1]])test(`${role}: split ${half} half alone supplies X in printed cost`,async()=>{
  const ctx=world(role),watcher=put(M,ctx.game,ctx.a,'Event X'),card=donor(ctx,ctx.a,{cost:'{R}{X}{G}',oracleSplit:{faces:[{key:'left',name:'Left without X',cost:'{R}',types:['Instant'],targets:[],effects:[]},{key:'right',name:'Right with X',cost:'{X}{G}',types:['Instant'],targets:[],effects:[]}]}});
  await cast(ctx,card,{splitHalf:half});assert.equal(await triggerCount(ctx,watcher),want);await settle(ctx.game);
 });
 for(const [mode,want]of [['adventure',0],['creature',1]])test(`${role}: selected ${mode} face supplies colors without borrowing the other face`,async()=>{
  const ctx=world(role),watcher=put(M,ctx.game,ctx.a,'Event Both');
  const card=donor(ctx,ctx.a,{types:['Creature'],power:'1',toughness:'2',cost:'{R}{W}',adventure:{name:'Only red Adventure',types:'Instant',cost:'{R}',resolve:async()=>{}}});
  await cast(ctx,card,mode==='adventure'?{adventure:true}:{});assert.equal(await triggerCount(ctx,watcher),want);await settle(ctx.game);
 });
}
test('cast event parser consumes one whole paragraph and rejects unproven qualifiers',()=>{
 const c={name:'Boundary',type_line:'Creature',oracle_text:''},h={target:extensionTarget,effect:extensionEffect};
 for(const text of ["Whenever you cast a spell that's both red and white, you gain 2 life.\nLearn.","Whenever you cast a spell that's both red and white and blue, you gain 2 life.",'Whenever you cast a spell with cascade, you gain 2 life.','Whenever you cast a spell with {X} in its mana cost, you gain life equal to that spell\'s mana value.'])assert.equal(extensionLine(c,text,h),null,text);
});
