import {proveCommonV69} from './oracle-v69-common-proof.mjs';

export const names = ['Teachings of the Kirin // Kirin-Touched Orochi'];
export async function proveReady0259(M, name, role, positive = true, h) {
  if (!names.includes(name)) throw new Error('Unknown ready card: ' + name);
  return proveCommonV69(M, name, role, positive, h);
}
export async function operationProofReady0259(M, entry, op, role, h) {
  if (!names.includes(entry.raw.name)) return null;
  return await proveReady0259(M, entry.raw.name, role, true, h) + await proveReady0259(M, entry.raw.name, role, false, h);
}
