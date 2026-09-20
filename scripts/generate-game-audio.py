"""Rebuild the original Higgsfield soundtrack. Requires higgsfield, ffmpeg, numpy.

Run with --generate to submit missing jobs (uses the signed-in Higgsfield account).
Completed jobs/raw downloads are cached in output/game-audio/raw; ordinary runs
only download completed results and master them into the public asset directory.
"""
import json
import hashlib
import pathlib
import argparse
import shutil
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / 'output/game-audio/raw'
BASE = ROOT / 'assets/audio'
RAW.mkdir(parents=True, exist_ok=True)

MUSIC = [
    ('moonlit-grove', 'Moonlit Grove', 'Warm felt piano, wooden harp, brushed drums, mellow upright bass, airy forest pads; D dorian and gentle ninth chords, 72 BPM.'),
    ('astral-library', 'Astral Library', 'Dusty Rhodes electric piano, soft celesta, distant glass chimes, round bass, restrained swung lo-fi drums, floating analog pads; F minor with warm seventh and ninth chords, 68 BPM. A quiet wizard library among the stars.'),
    ('ember-sanctum', 'Ember Sanctum', 'Muted nylon guitar, warm low felt piano, soft hand percussion, dark velvet synth pads, restrained downtempo beat, deep round bass; A minor with suspended and ninth chords, 74 BPM. Quiet embers in an ancient stone sanctuary, contemplative rather than frightening.'),
]
SFX = [
    ('summon', 2.8, 'Single warm fantasy summoning portal opening, a low rounded magical swell blooming into delicate shimmering chimes and a soft bass arrival. Powerful but elegant, short game ability stinger.'),
    ('heavy-impact', 1.8, 'One heavy fantasy creature impact against a stone shield: deep compact thump, low stone crunch, brief metallic rattle and low bass tail. Large hit with a clear immediate transient, controlled dynamics.'),
    ('explosion', 2.8, 'One large fantasy fire spell detonation, immediate rounded bass impact followed by a short rushing fire burst and falling ember crackle. Compact cinematic magical explosion, no piercing frequencies, no long rumble.'),
    ('victory', 3.5, 'Very short original fantasy victory stinger, warm harp arpeggio and three resolving celesta chords with a gentle low orchestral swell. Restrained and satisfying, no bombastic fanfare.'),
    ('combat', 1.3, 'A single swift sword swing meeting a steel shield: a brief airy swish, one compact rounded metallic clash, and a short low resonant tail. Restrained fantasy tabletop combat cue, crisp immediate attack, no ringing high frequencies.'),
    ('venture', 2.0, 'A single ancient stone dungeon doorway unlocking with a soft stone shift and a tiny ascending magical shimmer revealing a new room. Intimate mysterious fantasy discovery cue with a gentle low pulse, immediate onset and a short fading tail.'),
    ('counters', 1.1, 'A single enchanted glass token clicking into place, a soft tactile tick blooming into a tiny bright crystalline sparkle. Subtle satisfying fantasy game upgrade cue, compact immediate attack, warm and delicate rather than piercing.'),
    ('counterspell', 1.6, 'A single magical spell being abruptly nullified: a fast inward suction whoosh meeting a rounded arcane snap, followed by a delicate descending crystalline dissolve into silence. Clear decisive fantasy cancellation cue, short and controlled without a loud explosion.'),
    ('instant', 1.0, 'A single quick arcane spell cast: immediate soft finger-snap-like magical spark, a nimble airy energy swoosh, and a tiny luminous chime tail. Fast precise fantasy card-game cue, warm clean transient and no piercing treble.'),
]
jobs = []
for key, title, detail in MUSIC:
    prompt = ('Original instrumental fantasy lo-fi background music for a thoughtful tabletop card game. ' + title + ': ' + detail +
              ' Intimate, calm, magical, spacious, unobtrusive. Continuous steady groove suitable for seamless looping, no dramatic intro or ending, no vocals, no speech, no recognizable existing melody, no harsh transients. Full stereo instrumental music.')
    jobs.append(dict(id=key, title=title, model='sonilo_music', duration=90, prompt=prompt, kind='music'))
for key, duration, detail in SFX:
    jobs.append(dict(id=key, model='mirelo_text_to_audio', duration=duration, kind='sfx',
                     prompt=detail + ' Isolated sound effect on silence. Exactly one event, not a sequence. No music, no speech, no ambience. Game-ready audio.'))

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--generate', action='store_true')
parser.add_argument('--generate-only', action='store_true')
parser.add_argument('--only', nargs='+', choices=[job['id'] for job in jobs], help='Generate/master only these assets; retain other manifest entries.')
args = parser.parse_args()
if args.only:
    jobs = [job for job in jobs if job['id'] in args.only]

def records(raw):
    # Without --wait the CLI returns job IDs; get/wait return full objects.
    rows = raw if isinstance(raw, list) else [raw]
    return [dict(id=row, status='pending') if isinstance(row, str) else row for row in rows]

def generate(job):
    path = RAW / (job['id'] + '.json')
    saved = records(json.loads(path.read_text(encoding='utf-8-sig'))) if path.exists() else None
    if saved and saved[0].get('status') == 'completed':
        return
    cli = shutil.which('higgsfield.cmd') or shutil.which('higgsfield')
    if not cli:
        raise RuntimeError('Higgsfield CLI is not installed.')
    if not saved:
        command = [cli, 'generate', 'create', job['model'], '--prompt', job['prompt'],
                   '--duration', str(job['duration']), '--json']
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
        if result.returncode:
            raise RuntimeError(job['id'] + ': ' + result.stderr)
        # Retain even an unfamiliar response before parsing it. It must be
        # reconciled with the provider before another submission is allowed.
        path.write_text(result.stdout, encoding='utf-8')
        saved = records(json.loads(result.stdout))
        if len(saved) != 1 or not saved[0].get('id'):
            raise RuntimeError('No generation job returned for ' + job['id'])
        # Persist the submitted ID before waiting so an interrupted run cannot
        # silently submit and charge for the same asset again.
        path.write_text(json.dumps(saved, indent=2), encoding='utf-8')
        print('Submitted ' + job['id'] + ': ' + saved[0]['id'], flush=True)
    result = subprocess.run([cli, 'generate', 'wait', saved[0]['id'], '--timeout', '20m', '--json'],
                            capture_output=True, text=True, encoding='utf-8')
    if result.returncode:
        raise RuntimeError(job['id'] + ': ' + result.stderr)
    completed = records(json.loads(result.stdout))
    if completed[0].get('status') != 'completed':
        raise RuntimeError('Generation incomplete: ' + job['id'])
    path.write_text(json.dumps(completed, indent=2), encoding='utf-8')
    print('Generated ' + job['id'], flush=True)

if args.generate:
    # The account's audio queue allows one concurrent job. Resume completed
    # entries without submitting or charging for them again.
    for job in jobs:
        generate(job)

if args.generate_only:
    sys.exit(0)

import numpy as np

manifest_path = BASE / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))['tracks'] if args.only and manifest_path.exists() else []
for job in jobs:
    saved = records(json.loads((RAW / (job['id'] + '.json')).read_text(encoding='utf-8-sig')))[0]
    if saved['status'] != 'completed':
        raise RuntimeError('Generation incomplete: ' + job['id'])
    url = saved['result_url']
    source = RAW / (job['id'] + pathlib.Path(url.split('?')[0]).suffix)
    if not source.exists():
        urllib.request.urlretrieve(url, source)
    dest = BASE / job['kind'] / (job['id'] + '.mp3')
    dest.parent.mkdir(parents=True, exist_ok=True)
    if job['kind'] == 'music':
        pcm = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(source), '-f', 'f32le', '-ar', '44100', '-ac', '2', '-'])
        samples = np.frombuffer(pcm, dtype='<f4').reshape(-1, 2).copy()
        # Bake a circular two-second crossfade. Web Audio loops decoded PCM
        # sample-accurately; the head and tail retain the same waveform slope.
        overlap = 2 * 44100
        ramp = np.linspace(0, 1, overlap, endpoint=False)[:, None]
        blend = samples[-overlap:] * (1-ramp) + samples[:overlap] * ramp
        samples = np.concatenate([samples[overlap:-overlap], blend]).astype('<f4')
        args = ['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', '44100', '-ac', '2', '-i', '-', '-af',
                'loudnorm=I=-22:TP=-3:LRA=7', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', str(dest)]
        subprocess.run(args, input=samples.tobytes(), check=True)
    else:
        pcm = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(source), '-f', 'f32le', '-ar', '44100', '-ac', '1', '-'])
        samples = np.frombuffer(pcm, dtype='<f4').copy()
        peak = float(np.max(np.abs(samples)))
        if peak < 0.00001:
            raise RuntimeError('Silent source: ' + job['id'])
        # Relative trimming handles Mirelo's very quiet paper/foley outputs.
        audible = np.flatnonzero(np.abs(samples) > peak * 0.015)
        samples = samples[max(0, audible[0]-220):min(len(samples), audible[-1]+2205)]
        rms = float(np.sqrt(np.mean(samples*samples)))
        samples *= min(0.65/peak, 0.09/max(rms, 0.00001))
        attack = min(220, len(samples)//4); release = min(2205, len(samples)//4)
        samples[:attack] *= np.linspace(0, 1, attack)
        samples[-release:] *= np.linspace(1, 0, release)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', '44100', '-ac', '1', '-i', '-',
                        '-c:a', 'libmp3lame', '-b:a', '96k', str(dest)], input=samples.astype('<f4').tobytes(), check=True)
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-of', 'json', str(dest)]))
    manifest = [entry for entry in manifest if entry['id'] != job['id']]
    manifest.append({**job, 'prompt': saved['params']['prompt'], 'jobId': saved['id'], 'generatedAt': saved['created_at'],
                     'file': dest.relative_to(ROOT).as_posix(), 'seconds': float(probe['format']['duration']), 'bytes': dest.stat().st_size,
                     'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()})
    print('Mastered ' + job['id'], flush=True)
manifest_path.write_text(json.dumps({'provider': 'Higgsfield', 'tracks': manifest}, indent=2) + '\n', encoding='utf-8', newline='\n')
