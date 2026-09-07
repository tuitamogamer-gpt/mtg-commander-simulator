"""Rebuild the original Higgsfield soundtrack. Requires higgsfield, ffmpeg, numpy.

Run with --generate to submit missing jobs (uses the signed-in Higgsfield account).
Completed jobs/raw downloads are cached in output/game-audio/raw; ordinary runs
only download completed results and master them into the public asset directory.
"""
import json
import hashlib
import pathlib
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
]
jobs = []
for key, title, detail in MUSIC:
    prompt = ('Original instrumental fantasy lo-fi background music for a thoughtful tabletop card game. ' + title + ': ' + detail +
              ' Intimate, calm, magical, spacious, unobtrusive. Continuous steady groove suitable for seamless looping, no dramatic intro or ending, no vocals, no speech, no recognizable existing melody, no harsh transients. Full stereo instrumental music.')
    jobs.append(dict(id=key, title=title, model='sonilo_music', duration=90, prompt=prompt, kind='music'))
for key, duration, detail in SFX:
    jobs.append(dict(id=key, model='mirelo_text_to_audio', duration=duration, kind='sfx',
                     prompt=detail + ' Isolated sound effect on silence. Exactly one event, not a sequence. No music, no speech, no ambience. Game-ready audio.'))

def generate(job):
    path = RAW / (job['id'] + '.json')
    if path.exists() and json.loads(path.read_text())[0].get('status') == 'completed':
        return
    command = ['higgsfield', 'generate', 'create', job['model'], '--prompt', job['prompt'],
               '--duration', str(job['duration']), '--wait', '--wait-timeout', '20m', '--json']
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(job['id'] + ': ' + result.stderr)
    path.write_text(result.stdout)
    print('Generated ' + job['id'], flush=True)

if '--generate' in sys.argv:
    # The account's audio queue allows one concurrent job. Resume completed
    # entries without submitting or charging for them again.
    for job in jobs:
        generate(job)

if '--generate-only' in sys.argv:
    sys.exit(0)

import numpy as np

manifest = []
for job in jobs:
    saved = json.loads((RAW / (job['id'] + '.json')).read_text())[0]
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
    manifest.append({**job, 'prompt': saved['params']['prompt'], 'jobId': saved['id'], 'generatedAt': saved['created_at'],
                     'file': str(dest.relative_to(ROOT)), 'seconds': float(probe['format']['duration']), 'bytes': dest.stat().st_size,
                     'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()})
    print('Mastered ' + job['id'], flush=True)
(BASE / 'manifest.json').write_text(json.dumps({'provider': 'Higgsfield', 'tracks': manifest}, indent=2) + '\n')
