// Public casting history and exact combat windows. New descriptors remain
// separate from the frozen historical casting-condition grammar.
const COLORS={white:'W',blue:'U',black:'B',red:'R',green:'G'};

export function extensionCondition(text) {
  const match=/^you(?:'ve| have) cast another (white|blue|black|red|green) spell this turn$/.exec(text);
  return match?{kind:'casting-spell-history-v8',players:'you',color:COLORS[match[1]]}:null;
}

export function modifierOperation(card,line) {
  const limit=/^(Each player|You) can't cast more than one spell each turn\.$/.exec(line);
  if(limit)return {kind:'spell-limit-v8',players:limit[1]==='You'?'you':'all',max:1,contract:'spell-limit-v8'};
  const windows={
    'during the declare attackers step':{window:'attackers'},
    "during the declare attackers step and only if you've been attacked this step":{window:'attackers',attacked:true},
    'during the declare blockers step':{window:'blockers'},
    "during the declare blockers step on an opponent's turn":{window:'blockers',turn:'opponent'},
    'during combat after blockers are declared':{window:'after-blockers'},
    'before the combat damage step':{window:'before-damage'},
    'during combat':{window:'combat'},
    'during combat on your turn':{window:'combat',turn:'you'},
    "during combat on an opponent's turn":{window:'combat',turn:'opponent'},
    'during your turn':{window:'turn',turn:'you'},
    "during an opponent's turn":{window:'turn',turn:'opponent'},
  };
  const match=/^Cast this spell only (.+)\.$/.exec(line),condition=match&&windows[match[1]];
  return condition?{kind:'casting-restriction-v8',condition:{kind:'casting-window-v8',...condition},contract:'casting-restriction-v8'}:null;
}
