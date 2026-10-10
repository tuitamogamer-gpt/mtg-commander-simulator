// Pin audited native token art through the existing WebP manifest contract.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pins = [
  {name: 'Rock', printedName: 'Rock', id: '661cbde4-9444-4259-b2cf-7c8f9814a071',
    type: 'Token Artifact — Equipment', variants: ['normal', 'art_crop'],
    source: 'Pinned Scryfall Commander Legends Rock Equipment token'},
  {name: 'Imp Token', printedName: 'Imp', id: '47a1385b-2be2-49a8-8400-186cd5525dad',
    type: 'Token Creature — Imp', variants: ['normal'],
    source: 'Pinned Scryfall Murders at Karlov Manor Judith Imp token'},
  {name: 'Shard Token', printedName: 'Shard', id: '6a198942-049c-4537-b5b1-d35df32d45d5',
    type: 'Token Enchantment — Shard', variants: ['normal'],
    source: 'Pinned Scryfall Duskmourn Niko Shard token'},
];
const headers = {Accept: 'application/json,image/*', 'User-Agent': 'MTGCommanderSimulator/0.1 (pinned token image sync)'};
const download = url => new Promise((resolve, reject) => {
  // curl honors the execution environment's HTTP proxy as well as direct network access.
  const child = spawn('curl', ['--fail', '--silent', '--show-error', '--location',
    ...Object.entries(headers).flatMap(([key, value]) => ['--header', key + ': ' + value]), url]);
  const chunks = []; let error = '';
  child.stdout.on('data', bytes => chunks.push(bytes)); child.stderr.on('data', bytes => error += bytes);
  child.on('error', reject); child.on('close', code => code ? reject(Error(error)) : resolve(Buffer.concat(chunks)));
});
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const slug = name => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72) + '-' + sha(name).slice(0, 10) + '.webp';
const jobs = [];
for (const pin of pins) {
  const reportDir = path.join(root, 'reports/cards/token-' + pin.printedName.toLowerCase() + '-2026-10-10');
  fs.mkdirSync(reportDir, {recursive: true});
  const metadataFile = path.join(reportDir, 'print.json');
  let print;
  if (fs.existsSync(metadataFile)) print = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
  else {
    print = JSON.parse(await download('https://api.scryfall.com/cards/' + pin.id));
    fs.writeFileSync(metadataFile, JSON.stringify(print, null, 2) + '\n');
  }
  assert.equal(print.id, pin.id); assert.equal(print.name, pin.printedName);
  assert.equal(print.type_line, pin.type);
  const added = [];
  for (const variant of pin.variants) {
    const source = print.image_uris?.[variant]; assert.ok(source, variant + ': pinned ' + pin.name + ' image');
    const key = variant === 'normal' ? 'CARD_IMAGE_PATHS' : 'CARD_ART_PATHS', directory = variant === 'normal' ? '' : 'art/';
    const relative = './assets/cards/' + directory + slug(pin.name), target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    if (!fs.existsSync(target) || process.argv.includes('--force')) {
      const bytes = await download(source), temporary = target + '.tmp.webp';
      await new Promise((resolve, reject) => {
        const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-frames:v', '1',
          '-c:v', 'libwebp', '-quality', '78', '-compression_level', '6', '-preset', 'picture', '-y', temporary]);
        let error = ''; child.stderr.on('data', bytes => error += bytes);
        child.on('error', reject); child.on('close', code => code ? reject(Error(error)) : resolve());
        child.stdin.end(bytes);
      });
      fs.renameSync(temporary, target);
    }
    const bytes = fs.readFileSync(target);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
    const job = {key, variant, relative, source, scryfallId: pin.id, set: print.set,
      collectorNumber: print.collector_number, sha256: sha(bytes)};
    added.push(job); jobs.push({...job, name: pin.name});
  }
  fs.writeFileSync(path.join(reportDir, 'images.json'), JSON.stringify({date: '2026-10-10',
    source: pin.source, added, existingImagesUnchanged: true}, null, 2) + '\n');
}
const manifestFile = path.join(root, 'src/card-images.js');
let manifest = fs.readFileSync(manifestFile, 'utf8');
for (const job of jobs) {
  const expression = new RegExp('(MTG\\.' + job.key + ' = Object\\.freeze\\()({[\\s\\S]*?})(\\);)');
  assert.match(manifest, expression);
  manifest = manifest.replace(expression, (_match, before, encoded, after) => {
    const entries = Object.entries(JSON.parse(encoded)), inserted = [];
    let present = entries.some(([key]) => key === job.name);
    for (const [key, value] of entries) {
      if (!present && key.localeCompare(job.name) > 0) { inserted.push([job.name, job.relative]); present = true; }
      inserted.push([key, key === job.name ? job.relative : value]);
    }
    if (!present) inserted.push([job.name, job.relative]);
    return before + JSON.stringify(Object.fromEntries(inserted), null, 2) + after;
  });
}
fs.writeFileSync(manifestFile, manifest);
console.log(JSON.stringify({tokens: pins.map(pin => pin.name), assets: jobs.map(job => ({path: job.relative, sha256: job.sha256}))}));
