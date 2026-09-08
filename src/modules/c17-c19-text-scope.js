'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
MTG.c1719TextType=function(context,value){const g=context?.g||context?.game||context?.owner?.game||context;for(const change of g?.c1719TextContext||[])if(value===change.from)value=change.to;return value;};
