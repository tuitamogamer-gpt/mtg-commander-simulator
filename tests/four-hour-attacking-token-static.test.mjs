import test from 'node:test';
import {loadEngine} from './helpers/load-engine.mjs';
import {proveAttackingTokenStatic} from './helpers/attacking-token-static-proof.mjs';
const M=loadEngine();
for(const role of ['human','ai'])for(const name of ['Bone-Cairn Butcher','Starry-Eyed Skyrider'])test(`${role}: paid ${name} affects only native attacking tokens`,()=>proveAttackingTokenStatic(M,name,role));
