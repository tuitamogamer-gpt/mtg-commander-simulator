// Optional, restart-safe acceleration. Source hashing, selection and provenance
// verification still run; a changed source row or compiler gets a new cache key.
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {serialize, deserialize} from 'node:v8';
import {fileURLToPath} from 'node:url';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');

export function oracleCompilerFingerprint(directory = scriptRoot, compilerVersion = Infinity) {
  const files = fs.readdirSync(directory).filter(name =>
    /^(?:oracle.*\.(?:mjs|json)|import-oracle-batch\.mjs|source-audit\.mjs)$/.test(name)
    && (!/-v(\d+)(?:[.-]|$)/.test(name) || Number(/-v(\d+)(?:[.-]|$)/.exec(name)[1]) <= compilerVersion)).sort();
  return hash(files.map(name => `${name}\t${hash(fs.readFileSync(path.join(directory, name)))}`).join('\n'));
}

export function createOracleCompilerCache({directory, compilerVersion, compilerDirectory = scriptRoot}) {
  const fingerprint = oracleCompilerFingerprint(compilerDirectory, compilerVersion);
  const namespace = path.join(directory, `v${compilerVersion}-${fingerprint}`);
  const key = card => hash(JSON.stringify(card));
  return {
    fingerprint,
    get(card) {
      const digest = key(card);
      try {
        const saved = deserialize(fs.readFileSync(path.join(namespace, `${digest}.bin`)));
        if (saved.schema !== 1 || saved.compilerVersion !== compilerVersion || saved.fingerprint !== fingerprint || saved.digest !== digest) return undefined;
        if (!Buffer.isBuffer(saved.payload) || hash(saved.payload) !== saved.checksum) return undefined;
        const result = deserialize(saved.payload);
        if (!result || typeof result !== 'object' || !(result.semanticClass || result.reason)) return undefined;
        return result;
      } catch (error) {
        // A corrupt or interrupted cache is a miss, never a certification.
        if (error.code && error.code !== 'ENOENT') throw error;
        return undefined;
      }
    },
    set(card, result) {
      fs.mkdirSync(namespace, {recursive: true});
      const digest = key(card), payload = serialize(result);
      const target = path.join(namespace, `${digest}.bin`);
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
      const saved = {schema: 1, compilerVersion, fingerprint, digest, payload, checksum: hash(payload)};
      try { fs.writeFileSync(temporary, serialize(saved)); fs.renameSync(temporary, target); }
      finally { fs.rmSync(temporary, {force: true}); }
    },
  };
}
