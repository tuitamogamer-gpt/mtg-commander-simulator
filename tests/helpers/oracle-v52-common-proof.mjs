import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=['Crown of the Ages','Enchantment Alteration','Aura Graft','Academy Researchers','Nomad Mythmaker','Iname, Life Aspect','Elvish Soultiller','Coils of the Medusa','Pendrell Flux','Disruption Aura','Enslave','Portal of Sanctuary','Void Stalker','Mindshrieker','Silver Bolt','Charmed Griffin','Hoarding Recluse','Shrouded Serpent','Witch-king, Bringer of Ruin','Jolrael, Empress of Beasts','Samite Elder','Toph, Greatest Earthbender',"Shade's Breath",'Kitsune Ace','Phosphorescent Feast',"Drafna's Restoration",'Chisei, Heart of Oceans','Phyrexian Dreadnought','Prowling Pangolin','Shimatsu the Bloodcloaked','Revealing Wind',"Auntie's Hovel","Urza's Workshop"];
export async function proveCommonV52(M,name,role,positive=true,h,assert=strict){
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
 for(const p of g.players){fund(p);while(p.library.length<65)put(M,p,'Forest');}
 g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
 let aims=[],picks=[],enemyPicks=[],yes='yes',opponentYes=positive?'yes':'no';
 choose(a,q=>{
  if(q.type==='chooseTargets'&&aims.length){const picked=[aims.shift()].flat();assert.ok(picked.every(c=>q.candidates.includes(c)),'legal targets');return {...q,candidates:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseCards'&&picks.length){const picked=picks.shift();assert.ok(picked.every(c=>q.from.includes(c)),'legal cards '+q.prompt);return {...q,from:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseOption'&&q.options.some(o=>o.key===yes))return {...q,options:q.options.filter(o=>o.key===yes)};
  if(q.type==='chooseOption'&&name==='Elvish Soultiller'&&q.options.some(o=>o.key==='Elf'))return {...q,options:q.options.filter(o=>o.key===(positive?'Elf':'Zombie'))};
  if(q.type==='chooseOption'&&name==='Kitsune Ace'&&q.options.length===2)return {...q,options:[q.options[positive?0:1]]};
  return null;
 });
 choose(b,q=>{if(q.type==='chooseCards'&&enemyPicks.length){const picked=enemyPicks.shift();assert.ok(picked.every(c=>q.from.includes(c)));return {...q,from:picked,min:picked.length,max:picked.length};}return q.type==='chooseOption'&&q.options.some(o=>o.key===opponentYes)?{...q,options:q.options.filter(o=>o.key===opponentYes)}:null;});
 const donor=(p=a,extra={})=>permanent(M,g,p,def('V52 witness',['Creature'],{power:'3',toughness:'20',...extra}));
 const cast=async(n=name,{aim=[],resolve=true,opts={},card}={})=>{aims=aim.slice();card ||=put(M,a,n,'hand');const before=total(a);if(card.is('Land')){assert.equal(await g.playLand(a,card),true);assert.equal(total(a),before);}else{assert.equal(await g.castSpell(a,card,{from:card.zone,...opts}),true,typeof n==='string'?n:n.name);assert.ok(total(a)<before,'paid cast');}if(resolve)await settle(g);card.sick=false;return card;};
 const activate=async(c,aim=[],resolve=true)=>{aims=aim.slice();const row=g.activatableList(a).find(r=>r.card===c&&!r.manaAbility);assert.ok(row,'legal activation '+c.name);assert.equal(await g.activateAbility(a,row),true);if(resolve)await settle(g);return row;};
 const auraDef=def('V52 creature Aura',['Enchantment'],{subtypes:['Aura'],cost:'{U}',auraTarget:[M.T.creature()]});
 const attach=async(p,host)=>{const c=put(M,p,auraDef,'hand');await g.move(c,'battlefield',{ctrl:p,attachTo:host});await settle(g);assert.equal(c.attachedTo,host.iid);return c;};
 const attack=async(c,player=a,target=b)=>{g.phase='combat';g.step='attackers';c.attacking=target;c.blockedBy=[];c.wasBlocked=false;g.combat={attackers:[c],declaredAttackTargets:[target]};g.recordCombatObjectEvent(c,'attacks');g.recalc();await g.emit('attacks',{player,card:c,defender:target});await settle(g);};
 if(['Crown of the Ages','Enchantment Alteration','Aura Graft'].includes(name)){
  const first=donor(b),second=donor(),aura=await attach(b,first),third=positive?second:permanent(M,g,a,M.DEFS.Forest);picks=[[second]];if(name==='Crown of the Ages'){const c=await cast();await activate(c,[aura]);assert.equal(c.tapped,true);}else await cast(name,{aim:[aura]});assert.equal(aura.attachedTo,second.iid);assert.equal(aura.ctrl,name==='Aura Graft'?a:b);if(!positive)assert.equal(g.legalEntryAttachment(aura,third,a),false);
 }else if(name==='Academy Researchers'){
  const aura=put(M,a,auraDef,'hand');picks=[positive?[aura]:[]];const c=await cast();assert.equal(aura.zone,positive?'battlefield':'hand');if(positive)assert.equal(aura.attachedTo,c.iid);
 }else if(name==='Nomad Mythmaker'){
  const c=await cast(),host=donor(),aura=put(M,b,auraDef,'graveyard');picks=[[host]];await activate(c,[aura],positive);if(!positive){await g.move(aura,'exile');await settle(g);}assert.equal(aura.zone,positive?'battlefield':'exile');if(positive){assert.equal(aura.ctrl,a);assert.equal(aura.attachedTo,host.iid);}
 }else if(name==='Iname, Life Aspect'){
  const c=await cast(),spirit=put(M,a,def('V52 dead Spirit',['Creature'],{subtypes:['Spirit']}),'graveyard'),land=put(M,a,'Forest','graveyard');aims=[[spirit]];yes=positive?'yes':'no';await g.destroy(c);await settle(g);assert.equal(c.zone,positive?'exile':'graveyard');assert.equal(spirit.zone,positive?'hand':'graveyard');assert.equal(land.zone,'graveyard');
 }else if(name==='Elvish Soultiller'){
  const c=await cast(),elf=put(M,a,def('V52 dead Elf',['Creature'],{subtypes:['Elf']}),'graveyard'),land=put(M,a,'Forest','graveyard');await g.destroy(c);await settle(g);assert.equal(c.zone,positive?'library':'graveyard');assert.equal(elf.zone,positive?'library':'graveyard');assert.equal(land.zone,'graveyard');
 }else if(name==='Coils of the Medusa'){
  const host=donor(),enemy=donor(b),wall=donor(b,{subtypes:['Wall']}),c=await cast(name,{aim:[host]});assert.equal(host.power,4);assert.equal(host.toughness,19);host.attacking=b;host.blockedBy=[enemy,wall];enemy.blocking=wall.blocking=host.iid;g.combat={attackers:[host]};if(!positive)enemy.blocking=null;await activate(c);assert.equal(c.zone,'graveyard');assert.equal(enemy.zone,positive?'graveyard':'battlefield');assert.equal(wall.zone,'battlefield');
 }else if(name==='Pendrell Flux'||name==='Disruption Aura'){
  const host=donor(b,{types:name==='Pendrell Flux'?['Creature']:['Artifact'],cost:'{2}{G}'}),c=await cast(name,{aim:[host]}),before=total(b);await g.emit('upkeep',{player:b});await settle(g);assert.equal(host.zone,positive?'battlefield':'graveyard');assert.equal(total(b),before-(positive?3:0));assert.equal(c.zone,positive?'battlefield':'graveyard');
 }else if(name==='Enslave'){
  const host=donor(b),c=await cast(name,{aim:[host]}),life=b.life;assert.equal(host.ctrl,a);await g.emit('upkeep',{player:positive?a:b});await settle(g);assert.equal(b.life,life-(positive?1:0));assert.equal(c.attachedTo,host.iid);
 }else if(name==='Portal of Sanctuary'){
  const c=await cast(),host=donor(),aura=await attach(b,host);g.turnPlayer=b;assert.equal(g.activatableList(a).some(r=>r.card===c),false);g.turnPlayer=a;await activate(c,[host],positive);if(!positive){await g.move(host,'exile');await settle(g);await g.checkSBA();}assert.equal(host.zone,positive?'hand':'exile');assert.equal(aura.zone,positive?'hand':'graveyard');
 }else if(name==='Void Stalker'){
  const c=await cast(),target=donor(b);await activate(c,[target],positive);if(!positive){await g.move(target,'exile');await settle(g);}assert.equal(c.zone,positive?'library':'battlefield');assert.equal(target.zone,positive?'library':'exile');
 }else if(name==='Mindshrieker'){
  const c=await cast(),top=put(M,b,positive?def('V52 milled value',['Creature'],{cost:'{4}{G}'}):M.DEFS.Forest),power=c.power;await activate(c,[b]);assert.equal(top.zone,'graveyard');assert.equal(c.power,power+(positive?5:0));assert.equal(c.kw('flying'),true);
 }else if(name==='Silver Bolt'){
  const c=await cast(),target=donor(b,{subtypes:[positive?'Werewolf':'Wolf']});await activate(c,[target]);assert.equal(c.zone,'graveyard');assert.equal(target.zone,positive?'graveyard':'battlefield');if(!positive)assert.equal(target.damage,3);
 }else if(name==='Charmed Griffin'){
  const target=put(M,b,'Sol Ring','hand');enemyPicks=[positive?[target]:[]];const c=await cast();assert.equal(target.zone,positive?'battlefield':'hand');assert.equal(c.kw('flying'),true);
 }else if(name==='Hoarding Recluse'){
  const c=await cast(),dead=put(M,b,'Forest','graveyard');aims=[positive?[dead]:[]];await g.destroy(c);await settle(g);assert.equal(dead.zone,positive?'library':'graveyard');if(positive)assert.equal(b.library[0],dead);assert.equal(c.zone,'graveyard');
 }else if(name==='Shrouded Serpent'){
  const c=await cast(),mana=total(b);await attack(c);assert.equal(c.cur.unblockable,!positive);assert.equal(total(b),mana-(positive?4:0));
 }else if(name==='Witch-king, Bringer of Ruin'){
  const c=await cast(),weak=donor(b,{power:'1'}),strong=donor(b,{power:'6'});if(positive){await attack(c);assert.equal(weak.zone,'graveyard');}else{const pw=donor(b,{types:['Planeswalker'],loyalty:'10'});g.addCounters(pw,'loyalty',10);await attack(c,a,pw);assert.equal(weak.zone,'graveyard');}assert.equal(strong.zone,'battlefield');
 }else if(name==='Jolrael, Empress of Beasts'){
  const c=await cast(),land=permanent(M,g,b,M.DEFS.Forest),own=permanent(M,g,a,M.DEFS.Forest),one=put(M,a,'Forest','hand'),two=put(M,a,'Forest','hand');picks=[[one,two]];await activate(c,[b]);assert.equal(land.power,3);assert.equal(land.toughness,3);assert.equal(land.is('Land'),true);assert.equal(own.is('Creature'),false);assert.equal(one.zone,'graveyard');assert.equal(two.zone,'graveyard');
 }else if(name==='Samite Elder'){
  const c=await cast(),source=donor(a,{colorsOverride:['R','G']}),enemy=donor(b,{colorsOverride:positive?['R']:['U']}),ally=donor();await activate(c,[source]);const life=ally.damage;await g.damageBatch([{src:enemy,target:ally,n:2}],{deferSBA:true});assert.equal(ally.damage,life+(positive?0:2));
 }else if(name==='Toph, Greatest Earthbender'){
  const land=permanent(M,g,a,M.DEFS.Forest),c=await cast(name,{aim:[land]});assert.equal(land.counters['+1/+1'],c.castMeta.manaSpent);assert.equal(land.is('Creature'),true);assert.equal(land.kw('double strike'),true);if(!positive){await g.move(c,'exile');assert.equal(land.kw('double strike'),false);}await g.destroy(land);await settle(g);assert.equal(land.zone,'battlefield');assert.equal(land.tapped,true);assert.equal(land.is('Creature'),false);
 }else if(name==="Shade's Breath"){
  const own=donor(a,{subtypes:['Elf'],colorsOverride:['G']}),enemy=donor(b,{subtypes:['Elf']});await cast();assert.equal(own.hasSub('Shade'),true);assert.equal(own.hasSub('Elf'),false);assert.equal(own.colors.join(','),'B');assert.equal(enemy.hasSub('Shade'),false);const power=own.power;await activate(own);assert.equal(own.power,power+1);
 }else if(name==='Kitsune Ace'){
  const c=await cast(),vehicle=donor(a,{types:['Artifact','Creature'],subtypes:['Vehicle']});g.tap(c);await attack(vehicle);assert.equal(vehicle.kw('first strike'),positive);assert.equal(c.tapped,positive);
 }else if(name==='Phosphorescent Feast'){
  const green=put(M,a,def('V52 green mana symbols',['Creature'],{cost:'{2}{G}{G/W}{G/P}'}),'hand'),blue=put(M,a,def('V52 blue',['Creature'],{cost:'{U}'}),'hand');picks=[positive?[green,blue]:[blue]];const life=a.life;await cast();assert.equal(a.life,life+(positive?6:0));assert.equal(green.zone,'hand');
 }else if(name==="Drafna's Restoration"){
  const one=put(M,b,'Sol Ring','graveyard'),two=put(M,b,'Arcane Signet','graveyard'),wrong=put(M,a,'Sol Ring','graveyard');picks=positive?[[two,one]]:[];await cast(name,{aim:[b,positive?[one,two]:[]]});assert.equal(one.zone,positive?'library':'graveyard');assert.equal(wrong.zone,'graveyard');if(positive){assert.equal(b.library.at(-1),two);assert.equal(b.library.at(-2),one);}
 }else if(name==='Chisei, Heart of Oceans'){
  const c=await cast(),host=donor();g.addCounters(host,'+1/+1',2);yes=positive?'yes':'no';picks=positive?[[host]]:[];await g.emit('upkeep',{player:a});await settle(g);assert.equal(c.zone,positive?'battlefield':'graveyard');assert.equal(host.counters['+1/+1'],positive?1:2);
 }else if(name==='Phyrexian Dreadnought'){
  const donor12=donor(a,{power:'12'});yes=positive?'yes':'no';picks=positive?[[donor12],[]]:[];const c=await cast();assert.equal(c.zone,positive?'battlefield':'graveyard');assert.equal(donor12.zone,positive?'graveyard':'battlefield');
 }else if(name==='Prowling Pangolin'){
  const one=donor(b),two=donor(b);yes='no';enemyPicks=positive?[[one,two]]:[];const c=await cast();assert.equal(c.zone,positive?'graveyard':'battlefield');assert.equal(one.zone,positive?'graveyard':'battlefield');assert.equal(two.zone,positive?'graveyard':'battlefield');
 }else if(name==='Shimatsu the Bloodcloaked'){
  const one=donor(),two=permanent(M,g,a,M.DEFS.Forest);picks=[positive?[one,two]:[]];const c=await cast();assert.equal(c.zone,positive?'battlefield':'graveyard');if(positive){assert.equal(c.counters['+1/+1'],2);assert.equal(c.power,2);assert.equal(one.zone,'graveyard');assert.equal(two.zone,'graveyard');}
 }else if(name==='Revealing Wind'){
  const hidden=put(M,a,def('V52 hidden creature'));await M.OracleV20.helpers.runGenericEffect({g,src:hidden,you:a,targets:[]},{action:'face-down',kind:'manifest',who:'you',n:1});await settle(g);hidden.attacking=b;g.combat={attackers:[hidden]};let looked=[];const reveal=g.revealToHuman;g.revealToHuman=async function(q){if(q.kind==='look')looked.push(...q.cards);return reveal.call(this,q);};yes=positive?'yes':'no';await cast();assert.equal(looked.length,positive?1:0);assert.equal(hidden.faceDown,true);const life=b.life;await g.damageBatch([{src:hidden,target:b,n:2}],{combat:true,deferSBA:true});assert.equal(b.life,life);
 }else if(name==="Auntie's Hovel"){
  const goblin=put(M,a,def('V52 Goblin',['Creature'],{subtypes:['Goblin']}),'hand');picks=[positive?[goblin]:[]];const c=await cast();assert.equal(c.tapped,!positive);assert.equal(goblin.zone,'hand');if(positive){const row=g.manaSources(a).find(r=>r.card===c),before=a.pool.R;assert.ok(row);assert.equal(await g.activateManaSource(a,row,{R:1}),true);assert.equal(a.pool.R,before+1);}
 }else if(name==="Urza's Workshop"){
  const c=await cast();permanent(M,g,a,def('V52 Urza land',['Land'],{subtypes:["Urza's"]}));for(let i=0;i<(positive?3:2);i++)permanent(M,g,a,M.DEFS['Sol Ring']);const rows=g.manaSources(a).filter(r=>r.card===c);assert.equal(rows.length,positive?2:1);const row=rows.at(-1),before=a.pool.C;assert.equal(await g.activateManaSource(a,row,{C:positive?2:1}),true);assert.equal(a.pool.C,before+(positive?2:1));
 }else throw Error('Missing v52 proof '+name);
 assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV52(M,entry,op,role,h){if(!names.includes(entry.raw.name))return null;let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));for(const positive of[true,false])await proveCommonV52(M,entry.raw.name,role,positive,h,assert);return count;}
