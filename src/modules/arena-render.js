// Preserve connected arena surfaces. Interactive subtrees are kept whole or
// replaced whole: their callbacks may close over their original DOM nodes.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const stableAreas = '.arenaheader, .mobileviewtabs, .oppsouter, .myboard, .handwrap, .ct-seat-ribbon';
  // These containers have no event listeners closing over descendants. Do not
  // add dialogs, forms or card controls here; fresh callbacks need fresh nodes.
  const shells = new Set([
    'topbar', 'mobileviewtabs',
    'oppsouter', 'oppswrap', 'opprow', 'oppstrip', 'boardlane', 'boardlanecards',
    'oppresources', 'oppresourcecards', 'myboard', 'cardrow', 'landrow',
    'resourcezone', 'landstrip', 'manaartifactstrip', 'playerrail', 'czrow',
    'handwrap', 'hand', 'ct-player-head', 'ct-seat-ribbon',
    'ct-decision-rail', 'ct-decision-content',
  ]);
  const key = node => {
    if (node.nodeType !== 1) return `#${node.nodeType}`;
    const identity = ['iid', 'playerId', 'focusPlayer'].map(name => node.dataset[name] ?? '').join('/');
    const lane = [...node.classList].find(name => /^(creature|support|resource)lane$/.test(name)) || '';
    return `${node.tagName}/${node.id}/${node.classList[0] || ''}/${lane}/${identity}`;
  };
  const same = (old, fresh) => old.isEqualNode(fresh) &&
    [...old.querySelectorAll('input, select, option')].every((control, index) => {
      const next = fresh.querySelectorAll('input, select, option')[index];
      return control.value === next.value && control.checked === next.checked && control.selected === next.selected;
    });
  const attributes = (old, fresh) => {
    for (const attr of [...old.attributes]) if (!fresh.hasAttribute(attr.name)) old.removeAttribute(attr.name);
    for (const attr of fresh.attributes) if (old.getAttribute(attr.name) !== attr.value) old.setAttribute(attr.name, attr.value);
    old._arenaDropTarget = fresh._arenaDropTarget;
  };
  const scrollSelector = '.hand, .myboard, .oppsouter, .oppswrap, .oppstrip, .boardlanecards, .oppresourcecards, .manaartifactstrip, .landstrip, .ct-decision-content, .actionstageinfo, .sidebar, .sidelog, .overlay, .modal, .sheet, .quickmenu';
  const path = (node, root) => {
    const parts = [];
    while (node && node !== root) {
      const identity = key(node);
      const peers = [...node.parentNode.children].filter(peer => key(peer) === identity);
      parts.push(`${identity}:${peers.indexOf(node)}`);
      node = node.parentNode;
    }
    return parts.reverse().join('|');
  };

  MTG.commitArenaRender = function (root, fresh, options) {
    const scroll = new Map([...root.querySelectorAll(scrollSelector)].map(node => [path(node, root), [node.scrollLeft, node.scrollTop]]));
    const active = root.contains(document.activeElement) ? document.activeElement : null;
    const activePath = active && path(active, root);
    const patch = (parent, nextParent) => {
      const pool = new Map();
      for (const child of parent.childNodes) {
        const identity = key(child);
        if (!pool.has(identity)) pool.set(identity, []);
        pool.get(identity).push(child);
      }
      const desired = [];
      for (const next of [...nextParent.childNodes]) {
        const old = pool.get(key(next))?.shift();
        let result = next;
        if (old?.nodeType === 1 && next.nodeType === 1) {
          if (old.tagName === 'IMG' && old.getAttribute('src') === next.getAttribute('src')) {
            attributes(old, next);
            old.onerror = next.onerror; old.onload = next.onload;
            result = old;
          } else if (options.retain && next.closest(stableAreas) && same(old, next)) result = old;
          else if (options.sameGame && shells.has(next.classList[0])) {
            attributes(old, next);
            patch(old, next);
            result = old;
          } else {
            if (old.matches('.overlay, .quickmenuov') && next.matches('.overlay, .quickmenuov')) {
              old._dialogReplaced = true;
              next._dialogReturnFocus = old._dialogReturnFocus;
            }
            options.reuseImages(next, options.captureImages(old));
          }
        } else if (old && old.nodeValue === next.nodeValue) result = old;
        desired.push(result);
      }
      // Remove changed/absent siblings first. Leaving an obsolete header as
      // the cursor would move every surviving panel in front of it, stopping
      // touch momentum and replaying media even though identity was retained.
      const survivors = new Set(desired);
      for (const child of [...parent.childNodes]) if (!survivors.has(child)) child.remove();
      let cursor = parent.firstChild;
      for (const result of desired) {
        if (result === cursor) cursor = cursor.nextSibling;
        else parent.insertBefore(result, cursor);
      }
    };
    attributes(root, fresh);
    patch(root, fresh);
    for (const node of root.querySelectorAll(scrollSelector)) {
      const position = scroll.get(path(node, root));
      if (position) {
        // Avoid resetting momentum scrolling when the connected node stayed put.
        if (node.scrollLeft !== position[0]) node.scrollLeft = position[0];
        if (node.scrollTop !== position[1]) node.scrollTop = position[1];
      }
    }
    if (activePath && !active.isConnected && options.retain) {
      const replacement = [...root.querySelectorAll('button, [tabindex], input, select, textarea')].find(node => path(node, root) === activePath);
      // Dialog removal observers run before this microtask; the new dialog's
      // first-focus animation frame then sees the restored control in place.
      queueMicrotask(() => { if (replacement?.isConnected) replacement.focus({ preventScroll: true }); });
    }
  };
})();
