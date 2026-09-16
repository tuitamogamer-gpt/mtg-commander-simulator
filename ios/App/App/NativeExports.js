(() => {
  'use strict';
  if (window.__commanderNativeExports) return;
  window.__commanderNativeExports = true;
  const native = window.webkit?.messageHandlers?.commanderExport;
  if (!native) return;

  // The existing game creates detached blob anchors for debug reports and AI skills.
  // Capture those blobs before their URLs are revoked and hand them to Files/share.
  const originalClick = HTMLAnchorElement.prototype.click;
  function exportAnchor(anchor) {
    if (!anchor.download || !anchor.href.startsWith('blob:')) return false;
    void (async () => {
      try {
        const blob = await (await fetch(anchor.href)).blob();
        if (blob.size > 8 * 1024 * 1024) throw new Error('The export is larger than 8 MB.');
        await native.postMessage({ filename: anchor.download, text: await blob.text() });
      } catch (error) {
        alert(`Export could not open: ${error.message || error}`);
      }
    })();
    return true;
  }
  HTMLAnchorElement.prototype.click = function () {
    if (!exportAnchor(this)) originalClick.call(this);
  };
  document.addEventListener('click', event => {
    const anchor = event.target instanceof Element ? event.target.closest('a[download]') : null;
    if (anchor && exportAnchor(anchor)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
})();
