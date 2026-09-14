// Show the physical order of a merged permanent without creating extra game objects.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG, P = U.UI?.prototype;
  if (!P) return;
  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const element = (tag, className, html) => {
    const node = document.createElement(tag);
    node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  };
  const name = row => row.hidden ? 'Face-down card' : row.name;
  // A face-down component may be inspected by its controller; the marker is
  // kept separate from cardArtHTML's concealment flag for that private view.
  const art = row => U.cardArtHTML({...row, name: name(row), faceDown: false, isToken: row.token}, '', !!row.hidden);
  const components = (ui, card) => card.mutateState
    ? U.Mutate.present(card, ui.me) : card.meta?.mutateComponents || [];
  const previewRows = rows => rows.length <= 4 ? rows : [
    ...rows.slice(0, 2), {omitted: rows.length - 3}, rows.at(-1),
  ];

  function stackHTML(rows, incomingId) {
    return `<div class="mutate-stack" style="--mutate-count:${rows.length}" aria-label="Cards from top to bottom">
      ${rows.map((row, index) => `<div class="mutate-layer${row.iid === incomingId ? ' incoming' : ''}${row.hidden ? ' hidden-card' : ''}" style="--mutate-layer:${index}" data-component-id="${row.iid ?? ''}">
        ${row.omitted ? '<div class="mutate-omitted">More cards underneath</div>' : art(row)}
        <span class="mutate-layer-name">${row.omitted ? `+${row.omitted} cards between` : `${index ? 'Under' : 'Top'} · ${esc(name(row))}`}</span>
      </div>`).join('')}
    </div>`;
  }

  P.renderMutateOrder = function (q) {
    const {incoming, components: existing} = q.mutateChoice;
    const panel = element('div', 'mutate-order');
    panel.innerHTML = `<div class="mutate-kicker">MUTATE · ${existing.length + 1} CARDS, ONE CREATURE</div>
      <div class="mtitle">Choose the top card</div>
      <p class="mutate-explanation">The top card sets the creature’s name, color, types and base power/toughness. It has the abilities of every card in the pile.</p>`;
    const choices = element('div', 'mutate-order-choices');
    for (const option of q.options) {
      const over = option.key === 'over';
      const rows = over ? [incoming, ...existing] : [...existing, incoming];
      const button = element('button', 'mutate-order-choice');
      button.type = 'button';
      button.dataset.choiceKey = option.key;
      button.setAttribute('aria-label', option.label);
      button.innerHTML = `<span class="mutate-choice-title">${over ? 'Put on top' : 'Put underneath'}</span>
        ${stackHTML(previewRows(rows), incoming.iid)}
        <span class="mutate-choice-result">Top: <strong>${esc(name(rows[0]))}</strong></span>`;
      button.onclick = () => this.resolvePending(option.key);
      choices.appendChild(button);
    }
    panel.appendChild(choices);
    panel.appendChild(element('p', 'mutate-order-foot', `Highlighted card: ${esc(name(incoming))}. Choose a pile to confirm.`));
    return panel;
  };

  const miniCard = P.miniCard;
  P.miniCard = function (g, card, opts = {}) {
    const node = miniCard.call(this, g, card, opts);
    const rows = components(this, card);
    if (rows.length < 2) return node;
    const under = rows.slice(1, 4);
    node.classList.add('mutated');
    node.dataset.mutateCount = String(rows.length);
    node.style.setProperty('--mutate-peek-count', String(under.length));
    under.forEach((row, index) => {
      const layer = element('span', `mutate-underlay${row.hidden ? ' hidden-card' : ''}`,
        `${art(row)}<span>${esc(name(row))}</span>`);
      layer.style.setProperty('--mutate-layer', String(index + 1));
      layer.dataset.componentId = String(row.iid);
      layer.setAttribute('aria-hidden', 'true');
      node.prepend(layer);
    });
    node.setAttribute('aria-label', `${node.getAttribute('aria-label') || card.name} Merged permanent, ${rows.length} cards. Top to bottom: ${rows.map(name).join(', ')}.`);
    return node;
  };

  const renderCardSheet = P.renderCardSheet;
  P.renderCardSheet = function (g) {
    const overlay = renderCardSheet.call(this, g);
    const card = this.sheet?.card;
    if (!card) return overlay;
    const rows = components(this, card);
    if (rows.length < 2) return overlay;
    const sheet = overlay.querySelector('.sheet');
    sheet.classList.add('mutate-sheet');
    sheet.querySelectorAll(':scope > .sheetimg').forEach(node => node.remove());
    const visual = element('div', 'mutate-sheet-visual', `<div class="mutate-kicker">MERGED PERMANENT · ${rows.length} CARDS</div>${stackHTML(rows)}`);
    sheet.prepend(visual);
    const list = element('section', 'mutate-components', '<h3>Cards, top to bottom</h3><p>One permanent. The top card sets its characteristics; the cards underneath add their abilities.</p>');
    rows.forEach((row, index) => {
      const details = element('details', 'mutate-component');
      details.dataset.componentId = String(row.iid);
      details.innerHTML = `<summary><span class="mutate-component-position">${index ? `UNDER ${index}` : 'TOP'}</span>
        <strong>${esc(name(row))}</strong>${row.faceDown ? '<small>Face down</small>' : ''}</summary>
        <div class="mutate-component-body${row.hidden ? ' hidden-card' : ''}">${art(row)}
          <p>${esc(row.hidden ? 'This card’s identity is hidden.' : row.oracle || 'No printed abilities.').replace(/\n/g, '<br>')}</p>
        </div>`;
      details.open = !!this.sheet.mutateExpanded?.includes(row.iid);
      details.ontoggle = () => {
        if (!details.isConnected || this.sheet?.card !== card) return;
        const expanded = new Set(this.sheet.mutateExpanded || []);
        if (details.open) expanded.add(row.iid); else expanded.delete(row.iid);
        this.sheet.mutateExpanded = [...expanded];
      };
      list.appendChild(details);
    });
    sheet.querySelector('.sheetinfo').appendChild(list);
    return overlay;
  };
})();
