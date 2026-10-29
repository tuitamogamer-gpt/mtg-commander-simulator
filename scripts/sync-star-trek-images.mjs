import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';

const root = new URL('../', import.meta.url);
const sourceDir = new URL('../reports/decks/precon-trc-2026-10-29/', import.meta.url);
const decks = JSON.parse(fs.readFileSync(new URL('decklists.json', sourceDir))).decks;
const records = JSON.parse(fs.readFileSync(new URL('oracle.json', sourceDir))).cards;
const file = new URL('../src/card-images.js', import.meta.url);
let text = fs.readFileSync(file, 'utf8');
const maps = Object.fromEntries(['CARD_IMAGE_PATHS', 'CARD_ART_PATHS'].map(key => [key,
  JSON.parse(text.match(new RegExp('MTG\\.' + key + ' = Object\\.freeze\\((\\{[\\s\\S]*?\\})\\);'))[1]),
]));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const slug = name => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72) + '-' + sha(name).slice(0, 10) + '.webp';
const metadata = new Map(records.flatMap(record => [
  [record.requestedName, record], [record.canonicalName, record],
  ...(record.faces || []).map(face => [face.name, {...record, ...face}]),
]));
const names = [...new Set(decks.flatMap(deck => deck.cards.map(card => card.name)))];
const jobs = [];
// These preview tokens have no published Scryfall printing on the snapshot
// date. Their explicit art aliases and canonical names use the missing-art
// sentinel until a verified printing becomes available.
const unpublishedTokens = [
  'Borg', 'Klingon Warrior', 'Officer', 'Spacecraft Illusion', 'Tribble',
  'Borg Token', 'Klingon Warrior Token', 'Officer Token', 'Spacecraft Illusion Token', 'Tribble Token',
  'TRC Klingon Warrior', 'TRC Officer', 'TRC Spacecraft Illusion', 'TRC Tribble',
];
for (const [key, wanted, variant, folder] of [
  ['CARD_IMAGE_PATHS', names, 'normal', ''],
  ['CARD_ART_PATHS', decks.map(deck => deck.commander), 'art_crop', 'art/'],
]) for (const name of wanted) {
  const record = metadata.get(name);
  if (!record) throw Error('Missing pinned Scryfall printing: ' + name);
  const front = record.faces?.[0]?.name || record.raw.name;
  let relative = maps[key][name] || maps[key][front];
  if (!relative || relative.includes('card-back') || !fs.existsSync(new URL(relative, root))) {
    const source = record.imageUris?.[variant] || record.faces?.[0]?.imageUris?.[variant];
    if (!source) throw Error('Missing pinned image URI: ' + name);
    relative = './assets/cards/' + folder + slug(front);
    jobs.push({name: front, variant, relative, source, scryfallId: record.scryfallId,
      set: record.set, collectorNumber: record.collectorNumber});
  }
  maps[key][name] = relative;
  if (key === 'CARD_IMAGE_PATHS') for (const face of record.faces || []) maps[key][face.name] ||= relative;
}

// Python's standard HTTP client observes HTTPS_PROXY in environments where Node
// fetch does not. No shell is involved, and the pinned source URLs arrive on stdin.
const downloader = String.raw`
import concurrent.futures, json, os, subprocess, sys, time, urllib.request
payload = json.load(sys.stdin)
def download(job):
    destination = os.path.join(payload['root'], job['relative'])
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    if os.path.exists(destination): return
    temporary = destination + '.tmp.webp'
    for attempt in range(3):
        try:
            request = urllib.request.Request(job['source'], headers={
                'User-Agent': 'MTGCommanderSimulator/0.1 (pinned precon image sync)',
                'Accept': 'image/*'})
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read()
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
                '-frames:v', '1', '-c:v', 'libwebp', '-quality', '78', '-compression_level', '6',
                '-preset', 'picture', '-y', temporary], input=data, check=True, capture_output=True)
            os.replace(temporary, destination)
            return
        except Exception:
            if os.path.exists(temporary): os.unlink(temporary)
            if attempt == 2: raise
            time.sleep(attempt + 1)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(download, payload['jobs']))
`;
if (jobs.length) await new Promise((resolve, reject) => {
  const child = spawn('python3', ['-c', downloader], {stdio: ['pipe', 'ignore', 'pipe']});
  let error = '';
  child.stderr.on('data', chunk => { error += chunk; });
  child.on('error', reject);
  child.on('close', code => code ? reject(Error(error || 'Image download failed: ' + code)) : resolve());
  child.stdin.end(JSON.stringify({root: root.pathname, jobs}));
});
for (const job of jobs) job.sha256 = sha(fs.readFileSync(new URL(job.relative, root)));
for (const [key, map] of Object.entries(maps)) text = text.replace(
  new RegExp('MTG\\.' + key + ' = Object\\.freeze\\(\\{[\\s\\S]*?\\}\\);'),
  'MTG.' + key + ' = Object.freeze(' + JSON.stringify(Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => a.localeCompare(b))), null, 2) + ');');
const unpublishedDeclaration = 'MTG.CARD_IMAGE_UNPUBLISHED_TOKENS = Object.freeze(' + JSON.stringify(unpublishedTokens, null, 2) + ');';
if (text.includes('MTG.CARD_IMAGE_UNPUBLISHED_TOKENS =')) text = text.replace(
  /MTG\.CARD_IMAGE_UNPUBLISHED_TOKENS = Object\.freeze\(\[[\s\S]*?\]\);/, unpublishedDeclaration);
else text = text.replace('MTG.CARD_IMAGE_PLACEHOLDER =',
  '// Preview token faces awaiting a verified Scryfall printing; use the missing-art sentinel.\n' + unpublishedDeclaration + '\nMTG.CARD_IMAGE_PLACEHOLDER =');
fs.writeFileSync(file, text);
const reportFile = new URL('images.json', sourceDir);
const previous = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile)).added : [];
const added = [...new Map([...previous, ...jobs].map(job => [job.relative, job])).values()];
fs.writeFileSync(reportFile, JSON.stringify({
  date: '2026-10-29', source: 'Pinned Scryfall printing metadata', added,
  addedCount: added.length, sourceCardsWithLocalImages: names.length,
  commanderArtCount: decks.length, existingImagesUnchanged: true,
  unpublishedTokenArt: unpublishedTokens,
  tokenArtStatus: 'No linked token printings in pinned Scryfall responses; set:ttrc and Borg/Officer/Klingon/Tribble token searches returned HTTP 404 on 2026-10-29.',
}, null, 2) + '\n');
console.log(JSON.stringify({addedThisRun: jobs.length, addedTotal: added.length, cardsWithLocalImages: names.length}));
