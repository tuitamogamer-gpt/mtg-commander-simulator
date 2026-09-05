// CR 111.4 is independent of token size, color and type-changing effects.
// Explicit names and copied names are covered separately by paid source tests.
export function printedTokenName(token) {
 const subtypes=(token.subtypes||[]).join(' ');
 return !token.explicitTokenName&&token.name===subtypes?(subtypes?subtypes+' ':'')+'Token':token.name;
}
