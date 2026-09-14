'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG;
  // Room names and arrows come from the executable dungeon definitions.
  // Only explanatory copy and the printed map's layout live here.
  const guides = {
    mine: {
      summary: 'A short, flexible route to resources and a card draw.',
      rows: [['entrance'], ['goblin', 'tunnels'], ['storeroom', 'pool', 'fungi'], ['temple']],
      effects: {
        entrance: 'Scry 1.', goblin: 'Create a 1/1 red Goblin creature token.', tunnels: 'Create a Treasure token.',
        storeroom: 'Put a +1/+1 counter on target creature.', pool: 'Each opponent loses 1 life. You gain 1 life.',
        fungi: 'Target creature gets -4/-0 until your next turn.', temple: 'Draw a card.',
      },
    },
    mage: {
      summary: 'A longer route with repeated scrying and a powerful final room.',
      rows: [['portal'], ['level'], ['bazaar', 'twisted'], ['lost'], ['runestone', 'graveyard'], ['mines'], ['lair']],
      effects: {
        portal: 'Gain 1 life.', level: 'Scry 1.', bazaar: 'Create a Treasure token.',
        twisted: 'Target creature cannot attack until your next turn.', lost: 'Scry 2.',
        runestone: 'Exile the top two cards of your library. You may play them this turn.',
        graveyard: 'Create two 1/1 black Skeleton creature tokens.', mines: 'Scry 3.',
        lair: 'Draw three cards and reveal them. You may cast one without paying its mana cost.',
      },
    },
    tomb: {
      summary: 'A dangerous shortcut: lose resources to reach a legendary 4/4 token.',
      rows: [['entry'], ['veils', 'oubliette'], ['sandfall', null], ['cradle']],
      effects: {
        entry: 'Each player loses 1 life.', veils: 'Each player loses 2 life unless they discard a card.',
        sandfall: 'Each player loses 2 life unless they sacrifice an artifact, a creature, or a land.',
        oubliette: 'Discard a card. Sacrifice an artifact, a creature, and a land.',
        cradle: 'Create The Atropal, a legendary 4/4 black God Horror creature token with deathtouch.',
      },
    },
    undercity: {
      summary: 'Entered through initiative. Build resources toward a creature from your top ten cards.',
      rows: [['entrance'], ['forge', 'well'], ['trap', 'arena', 'stash'], ['archives', 'catacombs'], ['throne']],
      effects: {
        entrance: 'You may find a basic land in your library, reveal it, and put it into your hand. Shuffle.',
        forge: 'Put two +1/+1 counters on target creature.', well: 'Scry 2.', trap: 'Target player loses 5 life.',
        arena: 'Goad target creature.', stash: 'Create a Treasure token.', archives: 'Draw a card.',
        catacombs: 'Create a 4/1 black Skeleton creature token with menace.',
        throne: 'Reveal your top ten cards. Put a creature from them onto the battlefield with three +1/+1 counters. It gains hexproof until your next turn. Shuffle the rest into your library.',
      },
    },
  };
  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const definition = key => M.AFC?.dungeons[key];
  M.dungeonGuide = key => {
    const dungeon = definition(key), guide = guides[key];
    if (!dungeon || !guide) return null;
    const distance = room => {
      const next = dungeon.rooms[room].next;
      if (!next.length) return [1, 1];
      const lengths = next.map(distance);
      return [1 + Math.min(...lengths.map(n => n[0])), 1 + Math.max(...lengths.map(n => n[1]))];
    };
    return { ...dungeon, ...guide, key, distance, length: distance(dungeon.start) };
  };
  M.deckDungeonCards = deck => [...new Set([
    ...(deck?.commanders || []), deck?.commander, ...(deck?.cards || []).map(row => row.name),
  ].filter(Boolean))].filter(name => {
    const card = M.DEFS[name];
    return /\b(?:venture into (?:the dungeon|undercity)|(?:take|takes|have|has) the initiative|complet\w* (?:a |the |one or more )?dungeon)/i.test([card?.oracle, card?.text, card?.rulesCore].filter(Boolean).join('\n'));
  });
  const lengthText = ([min, max]) => min === max ? String(min) : `${min}–${max}`;
  const rules = `<details class="dungeonrules"><summary>How to enter, move, and finish</summary>
    <ol><li>Dungeons start outside your deck. Everyone can use them; you do not draw or add them to your 100 cards.</li>
    <li><b>Venture into the dungeon:</b> if you are outside a dungeon, choose Lost Mine, Mad Mage, or Tomb and enter its first room. Each later venture follows one arrow to the next room. A single exit advances automatically; at a fork, you choose. You cannot move backward or switch dungeons.</li>
    <li>Entering any room triggers its effect on the Stack. After the last room ability leaves the Stack, you complete the dungeon. Your next venture starts a new dungeon, including one you already completed. Venturing while the final room ability is still on the Stack also completes that dungeon and starts the next.</li>
    <li><b>Initiative:</b> taking it, even if you already have it, and your upkeep while holding it each trigger a venture into Undercity. Combat damage to its holder lets that attacking player take it. Only a venture into Undercity can start Undercity. If you are already in any dungeon, either kind of venture advances that dungeon. Losing initiative keeps your progress.</li></ol>
    <p>Each player has their own progress. One venture moves one room; entering its first room also counts.</p>
    <p><b>Scry</b> looks at that many top cards; put any on the bottom and the rest back on top in your chosen order. A <b>Treasure</b> can tap and sacrifice for one mana of any color. <b>Goad</b> requires a creature to attack each combat if able and attack someone other than you if able, until your next turn.</p>
    <p><a href="https://magic.wizards.com/en/news/feature/adventures-forgotten-realms-mechanics-2021-07-02" target="_blank" rel="noopener noreferrer">Dungeon rules</a> · <a href="https://magic.wizards.com/en/news/feature/commander-legends-battle-for-baldurs-gate-mechanics" target="_blank" rel="noopener noreferrer">Initiative rules</a></p></details>`;

  if (typeof document === 'undefined') return;
  const element = (tag, cls, html) => {
    const node = document.createElement(tag); node.className = cls;
    if (html !== undefined) node.innerHTML = html;
    return node;
  };
  // ResizeObserver follows wrapping text, browser zoom, and phone rotation.
  // Connections use actual room rectangles, so arrows always meet their rooms.
  function connectMap(map, guide, state) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('dungeonarrows'); svg.setAttribute('aria-hidden', 'true'); map.prepend(svg);
    let connected = false;
    const draw = () => {
      if (!map.isConnected) { if (connected) observer?.disconnect(); return; }
      connected = true;
      const bounds = map.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
      const path = state?.path || [];
      svg.innerHTML = Object.entries(guide.rooms).flatMap(([from, room]) => room.next.map(to => {
        const a = map.querySelector(`[data-room="${from}"]`).getBoundingClientRect();
        const b = map.querySelector(`[data-room="${to}"]`).getBoundingClientRect();
        const x = a.left + a.width / 2 - bounds.left, y = a.bottom - bounds.top;
        const tx = b.left + b.width / 2 - bounds.left, ty = b.top - bounds.top - 3, mid = (y + ty) / 2;
        const visited = path.some((key, i) => key === from && path[i + 1] === to);
        const next = state?.room === from;
        return `<g class="${visited ? 'visited' : next ? 'next' : ''}"><path d="M ${x} ${y} C ${x} ${mid}, ${tx} ${mid}, ${tx} ${ty}"/><path d="M ${tx - 4} ${ty - 5} L ${tx} ${ty} L ${tx + 4} ${ty - 5}"/></g>`;
      })).join('');
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(draw) : null;
    observer?.observe(map);
    requestAnimationFrame(draw);
  }
  M.renderDungeonExplorer = function ({ player = null, choice = null, options = [], onChoose = null, onTab = null, onRoom = null, onRules = null, rulesOpen: initialRulesOpen = false, selectedRoom = null, selectedKey = null } = {}) {
    const root = element('section', 'dungeonexplorer');
    const state = choice?.kind === 'room' ? choice : player?.afcDungeon;
    const keys = choice?.kind === 'dungeon' ? options.map(o => o.key) : choice ? [choice.key] : Object.keys(guides);
    let key = keys.includes(selectedKey) ? selectedKey : keys.includes(state?.key) ? state.key : keys[0];
    let selected = choice?.kind === 'room' ? (options.some(o => o.key === selectedRoom) ? selectedRoom : options[0]?.key) : key;
    const render = () => {
      const scrollLeft = root.querySelector('.dungeonmapscroll')?.scrollLeft || 0;
      const rulesOpen = root.querySelector('.dungeonrules')?.open ?? initialRulesOpen;
      const guide = M.dungeonGuide(key);
      if (!guide) return;
      const current = state?.key === key ? state : null;
      const next = current ? guide.rooms[current.room]?.next || [] : [];
      root.innerHTML = `<div class="dungeontabs" role="group" aria-label="Dungeon maps">${keys.map(k => {
        const g = M.dungeonGuide(k);
        return `<button type="button" data-dungeon="${k}" aria-pressed="${key === k}"><b>${esc(g.name)}</b><small>${lengthText(g.length)} ventures${g.initiativeOnly ? ' · Initiative' : ''}</small></button>`;
      }).join('')}</div><header class="dungeonintro"><div><small>${choice ? 'PLAN YOUR NEXT STEP' : 'DUNGEON MAP'}</small><h3>${esc(guide.name)}</h3><p>${esc(guide.summary)} <b>${lengthText(guide.length)} ventures from entrance to finish.</b></p></div></header>
      <p class="dungeonposition" role="status">${current ? `<b>${esc(player?.name || 'You')} · Current room: ${esc(guide.rooms[current.room].name)}</b><br>${next.length ? `Next: ${next.map(k => esc(guide.rooms[k].name)).join(' or ')}. ${lengthText(guide.distance(current.room).map(n => n - 1))} more venture(s) to the final room.` : 'Final room reached. Completion follows when its ability leaves the Stack.'}` : guide.initiativeOnly ? 'Start here only when an effect says “venture into Undercity”, usually from initiative.' : 'Available when you venture into the dungeon while outside a dungeon.'}${player ? `<br>Completed dungeons: ${Number(player.afcCompletedDungeons) || 0}.${state && !current ? ` Currently exploring ${esc(definition(state.key)?.name)}; finish it before entering another dungeon.` : ''}` : ''}</p>
      <div class="dungeonlegend"><span class="current">● Current room</span><span class="visited">✓ Visited</span><span class="next">↓ Next room</span></div>
      <p class="dungeonmaphint">Follow the arrows downward. Each room shows its effect; arrows connect the available exits.</p>`;
      const scroll = element('div', 'dungeonmapscroll');
      scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', `${guide.name} room map`);
      const map = element('div', 'dungeonmap');
      guide.rows.forEach((row, rowIndex) => row.forEach((roomKey, col) => {
        if (!roomKey) return;
        const room = guide.rooms[roomKey], isCurrent = current?.room === roomKey;
        const isNext = next.includes(roomKey), visited = current?.path?.includes(roomKey) && !isCurrent;
        const legal = choice?.kind === 'room' && options.some(o => o.key === roomKey);
        const node = element(legal ? 'button' : 'div', `dungeonroom${isCurrent ? ' current' : ''}${isNext ? ' next' : ''}${visited ? ' visited' : ''}${legal && selected === roomKey ? ' selected' : ''}`);
        node.dataset.room = roomKey;
        node.style.gridColumn = `${1 + col * (6 / row.length)} / span ${6 / row.length}`;
        node.style.gridRow = `${rowIndex + 1}${key === 'tomb' && roomKey === 'oubliette' ? ' / span 2' : ''}`;
        if (isCurrent) node.setAttribute('aria-current', 'step');
        node.innerHTML = `<small>${isCurrent ? '● CURRENT ROOM' : visited ? '✓ VISITED' : isNext ? '↓ NEXT ROOM' : roomKey === guide.start ? 'ENTRANCE' : !room.next.length ? 'FINAL ROOM' : 'ROOM'}</small><b>${esc(room.name)}</b><p>${esc(guide.effects[roomKey])}</p><em>${room.next.length ? `→ ${room.next.map(k => esc(guide.rooms[k].name)).join(' / ')}` : '✓ Complete this dungeon'}</em>`;
        if (legal) { node.type = 'button'; node.setAttribute('aria-pressed', String(selected === roomKey)); node.onclick = () => { selected = roomKey; onRoom?.(roomKey); render(); root.querySelector(`[data-room="${roomKey}"]`)?.focus({ preventScroll: true }); }; }
        map.appendChild(node);
      }));
      scroll.appendChild(map); root.appendChild(scroll); connectMap(map, guide, current);
      if (choice) {
        const entry = choice.kind === 'dungeon' ? guide.start : selected;
        const footer = element('div', 'dungeonconfirm', `<div><small>${choice.kind === 'dungeon' ? 'ENTER AT' : 'CHOSEN NEXT ROOM'}</small><b>${esc(guide.rooms[entry].name)}</b><p>${esc(guide.effects[entry])}</p></div>`);
        const confirm = element('button', 'pbtn primary', `Enter ${esc(guide.rooms[entry].name)} →`);
        confirm.type = 'button'; confirm.dataset.dungeonConfirm = selected;
        confirm.onclick = () => onChoose?.(selected);
        footer.appendChild(confirm); root.appendChild(footer);
      }
      root.insertAdjacentHTML('beforeend', rules);
      scroll.scrollLeft = scrollLeft;
      const details = root.querySelector('.dungeonrules');
      details.open = rulesOpen;
      details.ontoggle = () => { if (details.isConnected) onRules?.(details.open); };
      root.querySelectorAll('[data-dungeon]').forEach(button => { button.onclick = () => {
        key = button.dataset.dungeon; if (choice?.kind === 'dungeon') selected = key;
        onTab?.(key); render(); root.querySelector(`[data-dungeon="${key}"]`)?.focus({ preventScroll: true });
      }; });
    };
    render(); return root;
  };
})();
