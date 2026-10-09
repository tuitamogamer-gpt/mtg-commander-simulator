const custom=(mode,more={})=>({kind:'extra-creature-v74',mode,...more,contract:['channel','process-tap'].includes(mode)?'generic-activated-effect':['grudge','council-guardian','lieutenants'].includes(mode)?'generic-trigger-effect':'generic-continuous-effect'});
export function extensionLine(card,line,h){
 if(line==='As this creature enters, choose odd or even.')return custom('parity-entry');
 if(line==='This creature has protection from each mana value of the chosen quality.')return custom('parity-protection');
 if(line==='While voting, you get an additional vote.')return custom('extra-vote');
 if(line==='While voting, you may vote an additional time.')return custom('optional-vote');
 if(line==="Whenever players finish voting, each opponent who voted for a choice you didn't vote for loses 2 life.")return custom('grudge');
 if(line==='When this creature enters, starting with you, each player votes for blue, black, red, or green. This creature gains protection from each color with the most votes or tied for most votes.')return custom('council-guardian');
 if(line==='When this creature enters, starting with you, each player votes for strength or numbers. Put a +1/+1 counter on this creature for each strength vote and create a 1/1 white Soldier creature token for each numbers vote.')return custom('lieutenants');
 if(line==="{2}{U}, Put a card an opponent owns from exile into that player's graveyard: Tap target creature.")return custom('process-tap');
 const channel=/^(?:Channel — )?(\{2\}\{G\}|\{1\}\{U\}), Discard this card: (Return target card from your graveyard to your hand\.|Return target creature to its owner's hand\.)$/.exec(line);
 if(channel)return custom('channel',{ability:{kind:'generic-ability',from:'hand',cost:{mana:channel[1]},...h.effect(card,channel[2]),contract:'generic-activated-effect'}});
 return null;
}
