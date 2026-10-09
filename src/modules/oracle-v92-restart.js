// Restart unwinds the old turn before rebuilding the game on the same object.
(function(M){
 'use strict';
 M.Game.prototype.performRestartV92=async function(){
  const request=this.v92RestartPending,alive=this.alivePlayers().slice();
  if(!request||!alive.includes(request.player))throw Error('Invalid game restart');
  const saved=alive.map(p=>({p,controller:p._controller,deck:p.deck,chosen:(p.commanderNames||p.commanders.map(c=>c.oracleFaces?.canonicalName||c.def.oracleCanonicalName||c.name)).slice(),isAI:p.isAI,name:p.name,idx:p.idx,startingLife:p.startingLife,onlineSeat:p.onlineSeat,onlineConnected:p.onlineConnected,aiStyle:p.aiStyle,deckName:p.deckName}));
  const kept=request.cards.map(c=>({owner:c.owner,name:c.oracleFaces?.canonicalName||c.def.oracleCanonicalName||c.name,definition:c.oracleFaces?M.OracleV8Faces.faceDefinition(c.oracleFaces,'front'):c._isCopyOf||c.def,commander:!!c.commander}));
  const keep={onEvent:this.onEvent,uiHooks:this.uiHooks,onTurnCheckpoint:this.onTurnCheckpoint,maxTurns:this.maxTurns,paced:this.paced,houseRules:this.houseRules,speedFactor:this.speedFactor,rnd:this.rnd,diplomacyEnabled:!!this.diplomacy?.enabled};
  const fresh=new M.Game(keep);
  for(const k of Object.keys(this))delete this[k];
  Object.assign(this,fresh,keep);M.initializeContinuousEffects(this,this.untilEffects);delete this.diplomacyEnabled;
  this.players=alive;
  for(const row of saved){
   const p=row.p;
   for(const k of Object.keys(p))delete p[k];
   Object.assign(p,new M.Player(row.name,saved.indexOf(row)));
   p.game=this;p.controller=row.controller;p.isAI=row.isAI;p.deck=row.deck;p.deckName=row.deckName;p.chosenCommanders=row.chosen;p.startingLife=row.startingLife;p.life=row.startingLife;p.onlineSeat=row.onlineSeat;p.onlineConnected=row.onlineConnected;p.aiStyle=row.aiStyle;
   this.buildDeck(p,p.deck,M.DEFS,row.chosen);
  }
  const exiled=[];
  for(const row of kept){
   const p=row.owner;if(!this.players.includes(p))continue;
   const candidate=[...p.library,...p.command,...(p.outsideGameV87||[])].find(c=>(c.oracleFaces?.canonicalName||c.name)===row.name);
   let c=candidate;
   if(c){this.remove(c);if(p.companionV87===c){p.companionV87=null;p.v91CompanionTaken=true;}}else c=new M.CardInst(M.DEFS[row.name]||row.definition,p);
   c.zone='exile';c.commander=row.commander;c.cmdCasts=0;p.exile.push(c);exiled.push(c);
   if(row.commander&&!p.commanders.includes(c))p.commanders.push(c);
  }
  if(M.initDiplomacy)M.initDiplomacy(this,keep.diplomacyEnabled);
  for(const p of this.players){M.shuffle(p.library,this.rnd);await this.openingHand(p);}
  await M.CDK?.openingPermanents(this);
  this.turnPlayer=request.player;this.turn=this.players.indexOf(request.player);
  await this.withBattlefieldEntryBatch(async()=>{for(const c of exiled)await this.putPermanentOntoBattlefield(c,request.player);});
  this.lg('Karn Liberated restarts the game. '+request.player.name+' takes the first turn.');
  this.note('restart',{player:request.player});
 };
})(globalThis.MTG||={});
