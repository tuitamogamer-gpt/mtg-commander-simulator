export function extensionCondition(text){
 return text==='you control two or more nonland, nontoken permanents with the same name as one another'?{kind:'named-group-size-v8',what:'permanent',min:2,nonland:true,nontoken:true}:null;
}
export function extensionLine(card,line,h){
 const trigger=(effects,more={})=>({kind:'generic-trigger',event:'cast',eventFilter:{kind:'your-filtered-cast',what:'card',controller:'any'},effects,targets:[],contract:'generic-trigger-effect',...more});
 let m=/^Whenever a player casts a spell, (.+), where X is (twice )?the number of cards in all graveyards with the same name as (?:that|the) spell\.$/.exec(line);
 if(m){
  const modes={"that player gains X life":'gain',"that player discards X cards":'discard',"this enchantment deals X damage to that player":'damage',"this creature deals X damage to that player":'damage',"that player creates X 1/1 green Squirrel creature tokens":'squirrel'};
  const mode=modes[m[1]]||(m[1]===card.name+' deals X damage to that player'?'damage':null);if(mode)return trigger([{action:'named-spell-trigger-v8',mode,multiply:m[2]?2:1}]);
 }
 if(line==="Whenever a nontoken creature you control enters, if it doesn't have the same name as another creature you control or a creature card in your graveyard, draw a card.")return{kind:'generic-trigger',event:'etb',eventFilter:{kind:'filtered-object',target:h.target('target nontoken creature you control'),another:false},condition:{kind:'named-event-unique-v8'},effects:[{action:'draw',who:'you',n:1}],targets:[],contract:'generic-trigger-effect'};
 if(line==='When this creature enters, if you control two or more nonland, nontoken permanents with the same name as one another, create a 4/4 colorless Construct artifact creature token.'){
  const base=h.line(card,'When this creature enters, create a 4/4 colorless Construct artifact creature token.');return base?.kind==='generic-trigger'?{...base,condition:extensionCondition('you control two or more nonland, nontoken permanents with the same name as one another')}:null;
 }
 return null;
}
export function extensionEffect(card,line,h){
 if(line==='Destroy target nonland permanent if another permanent with the same name is on the battlefield.')return{targets:[h.target('target nonland permanent')],effects:[{action:'named-if-effect-v8',target:0,effects:[{action:'destroy',target:0}]}]};
 return null;
}
