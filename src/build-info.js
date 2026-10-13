// Unbuilt source checkout. Packaging replaces this module with its source revision.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
if (!Object.prototype.hasOwnProperty.call(MTG, 'BUILD_INFO')) {
  Object.defineProperty(MTG, 'BUILD_INFO', {
    value: Object.freeze({ version: '0.1.0', revision: null, source: 'development', dirty: null }),
    enumerable: true,
  });
}
