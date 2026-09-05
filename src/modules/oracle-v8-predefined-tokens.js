((M)=>{
 const definitions={"Cursed":{"name":"Cursed","oracle":"Enchant creature\nEnchanted creature has base power and toughness 1/1.","operations":[{"kind":"aura-target","what":"creature","contract":"aura-targeting"},{"kind":"base-pt-static","own":false,"attached":true,"filters":null,"power":1,"toughness":1,"keywords":[],"subtypes":[],"contract":"base-pt-static"}]},"Monster":{"name":"Monster","oracle":"Enchant creature\nEnchanted creature gets +1/+1 and has trample.","operations":[{"kind":"aura-target","what":"creature","contract":"aura-targeting"},{"kind":"attachment-grant","power":1,"toughness":1,"keywords":["trample"],"contract":"attachment-continuous-effect"}]},"Royal":{"name":"Royal","oracle":"Enchant creature\nEnchanted creature gets +1/+1 and has ward {1}.","operations":[{"kind":"aura-target","what":"creature","contract":"aura-targeting"},{"kind":"attachment-grant","power":1,"toughness":1,"keywords":[],"contract":"attachment-continuous-effect"}]},"Sorcerer":{"name":"Sorcerer","oracle":"Enchant creature\nEnchanted creature gets +1/+1 and has \"Whenever this creature attacks, scry 1.\"","operations":[{"kind":"aura-target","what":"creature","contract":"aura-targeting"},{"kind":"attachment-operation","operation":{"kind":"generic-trigger","event":"attacks","eventFilter":"self","effects":[{"action":"scry","who":"you","n":1}],"targets":[],"optional":false,"contract":"generic-trigger-effect"},"contract":"attachment-granted-operation","grant":{"power":1,"toughness":1,"keywords":[]}}]},"Virtuous":{"name":"Virtuous","oracle":"Enchant creature\nEnchanted creature gets +1/+1 for each enchantment you control.","operations":[{"kind":"aura-target","what":"creature","contract":"aura-targeting"},{"kind":"attachment-grant","power":1,"toughness":1,"multiplier":{"kind":"count","zone":"battlefield","what":"permanent","filters":[{"what":"enchantment","zone":"battlefield","controller":"you","min":1}],"controller":"you"},"keywords":[],"contract":"attachment-continuous-effect"}]},"Wicked":{"name":"Wicked","oracle":"Enchant creature\nEnchanted creature gets +1/+1.\nWhen this enchantment is put into a graveyard from the battlefield, each opponent loses 1 life.","operations":[{"kind":"aura-target","what":"creature","contract":"aura-targeting"},{"kind":"attachment-grant","power":1,"toughness":1,"keywords":[],"contract":"attachment-continuous-effect"},{"kind":"generic-trigger","event":"dies","eventFilter":"self","effects":[{"action":"lose-life","who":"each-opponent","n":1}],"targets":[],"optional":false,"contract":"generic-trigger-effect"}]},"Young Hero":{"name":"Young Hero","oracle":"Enchant creature\nEnchanted creature has \"Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it.\"","operations":[{"kind":"aura-target","what":"creature","contract":"aura-targeting"},{"kind":"attachment-operation","operation":{"kind":"generic-trigger","event":"attacks","eventFilter":"self","effects":[{"action":"counter","target":"self","counter":"+1/+1","n":1}],"targets":[],"optional":false,"condition":{"kind":"source-stat-comparison","stat":"toughness","past":false,"implicit":true,"threshold":3,"comparison":"less"},"contract":"generic-trigger-effect"},"contract":"attachment-granted-operation"}]}};
 const actions=new Set(['role-token-v8']);
 const cache=new Map();
 function definition(name,h){
  if(cache.has(name))return cache.get(name);
  const printed=definitions[name];if(!printed)throw new Error('Unknown predefined Role');
  const def=h.inline({...printed,types:['Enchantment'],subtypes:['Aura','Role'],colors:[],keywords:[]});
  def.explicitTokenName=true;
  if(name==='Royal'){
   const grant=def.attachGrant;
   def.attachGrant=(game,self,host)=>{grant?.(game,self,host);host.cur.extraWards.push({mana:'{1}'});};
  }
  cache.set(name,def);return def;
 }
 async function run(ctx,effect,h){
  const hosts=effect.filters?ctx.g.bf().filter(card=>effect.filters.some(filter=>h.filter(filter,card))):h.subjects(ctx,effect.target);
  const captured=hosts.filter(card=>card instanceof M.CardInst&&card.zone==='battlefield'&&!card.phasedOut).map(card=>({card,version:card.zoneVersion})),made=[];
  await ctx.g.withBattlefieldEntryBatch(async()=>{for(const {card,version}of captured){
   if(card.zone!=='battlefield'||card.zoneVersion!==version||card.phasedOut)continue;
   const tokens=await ctx.g.makeTokens(definition(effect.role,h),ctx.you,{attachTo:card});
   made.push(...tokens.map(card=>({card,zoneVersion:card.zoneVersion})));
  }});
  ctx._oracleCreatedTokens=made;
 }

 function roleGroups(cards){
  const groups=new Map();
  for(const card of cards)if(card.zone==='battlefield'&&!card.phasedOut&&card.hasSub('Role')&&card.attachedTo){
   const key=card.ctrl.idx+':'+card.attachedTo;
   if(!groups.has(key))groups.set(key,[]);groups.get(key).push(card);
  }
  return [...groups.values()].filter(group=>group.length>1);
 }
 function stateBasedActions(game,battlefield,moves){
  // CR 704.5z is a direct graveyard move, not destruction or sacrifice.
  for(const group of roleGroups(battlefield)){
   const newest=group.reduce((last,card)=>card.timestamp>last.timestamp?card:last);
   for(const card of group)if(card!==newest)moves.set(card,'graveyard');
  }
 }
 async function orderSimultaneousRoles(game,batch){
  const entrants=[...new Set(batch.filter(event=>event.name==='etb').map(event=>event.data.card))];
  for(const player of game.apnapFrom(game.turnPlayer||game.players[0]))for(const group of roleGroups(entrants.filter(card=>card.ctrl===player))){
   const picked=await player.controller.decide(game,{type:'chooseCards',from:group,min:1,max:1,prompt:'Simultaneous Roles: choose which receives the newest timestamp',aiHint:{kind:'roleTimestamp',host:game.byIid(group[0].attachedTo)}});
   if(!Array.isArray(picked)||picked.length!==1||!group.includes(picked[0]))throw new Error('Invalid simultaneous Role timestamp choice');
   const newest=group.reduce((last,card)=>card.timestamp>last.timestamp?card:last),keep=picked[0];
   [newest.timestamp,keep.timestamp]=[keep.timestamp,newest.timestamp];
  }
  if(entrants.some(card=>card.hasSub('Role')))game.recalc();
 }
 function initialize(h){
  for(const name of Object.keys(definitions))M.TOKENS['role-'+name.toLowerCase().replace(/ /g,'-')]=definition(name,h);
  M.TOKENS.junk=M.tokenDefinitionForCreation(h.inline({"name":"Junk","types":["Artifact"],"subtypes":["Junk"],"colors":[],"keywords":[],"oracle":"{T}, Sacrifice this token: Exile the top card of your library. You may play that card this turn. Activate only as a sorcery.","operations":[{"kind":"generic-ability","cost":{"tap":true,"sacSelf":true},"effects":[{"action":"exile-top","who":"you","n":1,"permission":{"spellsOnly":false,"nextOwnTurn":false,"anyColor":false}}],"targets":[],"optional":false,"onceEachTurn":false,"sorceryOnly":true,"contract":"generic-activated-effect"}]}));
 }
 M.OracleV8PredefinedTokens={actions,run,definition,stateBasedActions,orderSimultaneousRoles,initialize};
})(globalThis.MTG||={});
