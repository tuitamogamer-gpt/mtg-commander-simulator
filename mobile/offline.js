// Included only in the generated iOS bundle, before the game's entry module.
(() => {
  'use strict';
  document.documentElement.dataset.iosOffline = 'true';
  const onlineSelector = '[data-menu-action="live"], [data-mode="online"], .mainmenu-account';
  document.addEventListener('click', event => {
    const control = event.target instanceof Element ? event.target.closest(onlineSelector) : null;
    if (!control) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    alert('For accounts and private Live rooms, return to the app home screen and choose Play online.');
  }, true);
})();
