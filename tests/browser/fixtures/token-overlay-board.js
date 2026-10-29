(() => {
  const M = window.MTG;
  const old = document.querySelector('#game');
  old.replaceWith(old.cloneNode(false));
  document.querySelector('#setup').style.display = 'none';
  document.body.classList.add('game-active');
  const game = new M.Game({seed: 10323, paced: false});
  const decks = ['Eternal Might', 'Quick Draw', 'Elven Council', 'Enduring Enchantments'];
  const quiet = {decide: async () => []};
  const players = ['You', 'AI Dragon', 'AI Wolf', 'AI Raven'].map((name, index) => game.addPlayer(name, {name: decks[index]}, quiet, index > 0));
  const you = players[0], ui = new M.UI();
  ui.game = game; ui.me = you; ui.commandTableView = 'table';
  you.controller = ui.controllerFor(you);
  game.turnPlayer = you; game.turnNo = 12; game.phase = 'main1'; game.step = 'main';
  window._game = game; window._ui = ui;
  const put = (name, player, zone = 'battlefield') => {
    const card = new M.CardInst(M.DEFS[name], player);
    card.ctrl = player; card.zone = zone; card.sick = false;
    if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
    return card;
  };
  const token = (key, player) => {
    const card = new M.CardInst(M.TOKENS[key], player); card.ctrl = player; card.zone = 'battlefield'; card.isToken = true; card.sick = false;
    game.battlefield.push(card); return card;
  };
  players.forEach((player, i) => {
    const commander = put(M.DECKS[decks[i]].commander, player, 'command');
    player.commanders = [commander]; commander.commander = true;
    for (const name of ['Swamp', 'Island', 'Plains', 'Forest', 'Command Tower']) put(name, player);
    for (let n = 0; n < 25; n++) put('Swamp', player, 'library');
  });
  you.commanders[0].cmdCasts = 2;
  for (let n = 0; n < 3; n++) token('soldierW', you);
  token('soldierW', you).counters['+1/+1'] = 2;
  token('cat22', you);
  token('trcKlingonWarrior', you);
  const bearer = put('Riders of Gavony', you); bearer.counters['+1/+1'] = 1;
  const aura = put('Rancor', you); aura.attachedTo = bearer.iid; bearer.attachments.push(aura);
  put('Death Baron', you).attacking = players[1];
  for (let n = 0; n < 2; n++) token('warriorR', players[1]);
  token('dogW', players[1]);
  for (const name of ['Counterspell', 'Swamp']) put(name, you, 'hand');
  game.recalc();
  void you.controller.decide(game, {type: 'main', player: you, phase: game.phase, casts: game.castableList(you), acts: [], lands: []});
  ui.render();
})();
