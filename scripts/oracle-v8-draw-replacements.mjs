const op=(mode,fields={})=>({kind:'draw-replacement-v8',mode,...fields,contract:'ordered-draw-replacement'});
export function extensionLine(card,line,h){
 const exact={
  'If you would draw a card, draw two cards instead.':op('multiply',{n:2}),
  'If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.':op('multiply',{n:2,exceptFirst:true}),
  'If an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card.':op('redirect',{opponents:true,exceptFirst:true}),
  'If you would draw a card, you may skip that draw instead.':op('skip',{optional:true}),
  'If you would draw a card while your library has no cards in it, you win the game instead.':op('win-empty'),
  'If you would draw a card while you have no cards in hand, instead you draw two cards and you lose 1 life.':op('empty-hand',{n:2,loseLife:1}),
  'If you would draw a card, look at the top three cards of your library instead. Put one of those cards into your hand and the rest on the bottom of your library in any order.':op('look-three',{rest:'bottom'}),
  'If you would draw a card, instead look at the top three cards of your library, then put one into your hand and the rest into your graveyard.':op('look-three',{rest:'graveyard'}),
  'If you would draw a card, instead reveal the top three cards of your library. Put all creature cards revealed this way into your hand and the rest on the bottom of your library in any order.':op('reveal-creatures'),
  'If you would draw a card, exile the top two cards of your library instead. You may play those cards this turn.':op('impulse',{n:2}),
 };
 if(exact[line])return exact[line];
 if(/^Remove three study counters from (?:this (?:enchantment|creature)|Pursuit of Knowledge), Sacrifice (?:this (?:enchantment|creature)|Pursuit of Knowledge): Draw seven cards\.$/.test(line))return {kind:'generic-ability',cost:{sacSelf:true,oracleCounterPayment:{n:3,kinds:['study'],self:true,among:false}},effects:[{action:'draw',who:'you',n:7}],targets:[],sorceryOnly:false,contract:'generic-activated-effect'};
 const counter=/^If you would draw a card, you may put a study counter on (?:this (?:enchantment|creature)|Pursuit of Knowledge) instead\.$/.exec(line);
 if(counter)return op('study',{optional:true});
 return null;
}
export function extensionEffect(card,line,h){
 const modes={
  'The next time you would draw a card this turn, you gain 5 life instead.':'gain-life',
  'The next time you would draw a card this turn, each opponent discards a card instead.':'discard-opponents',
  "The next time you would draw a card this turn, each player returns a permanent they control to its owner's hand instead.":'bounce-each',
  'The next time you would draw a card this turn, create a 2/2 green Bear creature token instead.':'bear',
 };
 if(modes[line])return {effects:[{action:'next-draw-replacement-v8',mode:modes[line],who:'you'}],targets:[],optional:false};
 if(line==='Until end of turn, if target player would draw a card, instead that player skips that draw and you draw a card.')return {effects:[{action:'next-draw-replacement-v8',mode:'redirect',who:0,allTurn:true}],targets:[h.target('target player')],optional:false};
 return null;
}
