// Additive v47 closed creature and spell clauses; prior successful descriptors are preserved.
import * as previous from './oracle-extensions-v46.mjs';
import * as spells from './oracle-v47-common.mjs';
export * from './oracle-extensions-v46.mjs';
const extensions = [spells];
function read(method, args) {
  for (const grammar of extensions) {
    const result = grammar[method]?.(...args);
    if (result !== null && result !== undefined) return result;
  }
  return previous[method]?.(...args) ?? null;
}
export const extensionEffect = (...args) => read('extensionEffect', args);
export const extensionLine = (...args) => read('extensionLine', args);
export const extensionCost = (...args) => read('extensionCost', args);
export const extensionCondition = (...args) => read('extensionCondition', args);
export const extensionCount = (...args) => read('extensionCount', args);
export const extensionValue = (...args) => read('extensionValue', args);
export const extensionTarget = (...args) => read('extensionTarget', args);
export const modifierOperation = (...args) => read('modifierOperation', args);
export const characteristicOperation = (...args) => read('characteristicOperation', args);
export const modalOperation = (...args) => read('modalOperation', args);
export const normalizeManaOperation = (...args) => read('normalizeManaOperation', args);
export const compileWholeCard = (...args) => read('compileWholeCard', args);
export const repairFrozenCompilation = (...args) => read('repairFrozenCompilation', args);
export function normalizeCard(card) {
  return extensions.reduce((current, grammar) => grammar.normalizeCard?.(current, card) ?? current, previous.normalizeCard(card));
}
export function finalizeCompilation(card, result) {
  result = previous.finalizeCompilation?.(card, result) ?? result;
  if (!result.semanticClass) return result;
  for (const grammar of extensions) {
    result = grammar.finalizeCompilation?.(card, result) ?? result;
    if (!result.semanticClass) return result;
  }
  return result;
}
