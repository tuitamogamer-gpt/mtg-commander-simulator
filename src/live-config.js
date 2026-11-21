// Where Commander Live rooms are served. Empty: this page's own origin
// (/api/ws). `npm run build` writes the address from COMMANDER_LIVE_ORIGIN.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
MTG.LIVE_ORIGIN = "";
// '' or an origin such as https://live.example.com; anything else is ignored.
MTG.liveOrigin = () => /^https:\/\/[a-z0-9.-]+(?::\d+)?$|^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(MTG.LIVE_ORIGIN)
  ? MTG.LIVE_ORIGIN : '';
