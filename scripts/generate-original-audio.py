#!/usr/bin/env python3
"""Render the original October 2026 instrumental loops and game effects.

Requires Python 3, numpy, scipy, ffmpeg and ffprobe. No account, network,
samples, external composition or generative service is used. Each arrangement
and instrument is specified below; fixed random seeds make the source PCM
reproducible. MP3 bytes can vary between ffmpeg/libmp3lame versions.

Usage: python scripts/generate-original-audio.py --metadata output/audio.json
Use --only ID ... to render a subset. This script never edits manifest.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
from datetime import datetime, timezone

import numpy as np
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[1]
RATE = 44100
TAU = 2 * math.pi

MUSIC = {
    "council-at-dusk": {
        "title": "Council at Dusk", "bpm": 88, "seed": 1601,
        "description": "An original D-dorian council theme: softly damped harp, felt keys, warm suspended pads, round bass and brushed wooden percussion.",
        "roots": [38, 41, 36, 43, 40, 45, 43, 38],
        "chords": [[62, 65, 69, 72, 76], [60, 64, 65, 69, 72], [60, 64, 67, 71, 74], [62, 67, 69, 71, 74], [59, 62, 64, 67, 71], [60, 64, 67, 69, 72], [59, 62, 67, 69, 74], [60, 62, 65, 69, 76]],
    },
    "aether-tides": {
        "title": "Aether Tides", "bpm": 80, "seed": 1602,
        "description": "An original weightless E-minor astral theme: rounded glass keys, slow stereo pads, sparse bell answers, soft heartbeat bass and delicate filtered air.",
        "roots": [40, 36, 43, 38, 45, 40, 36, 35],
        "chords": [[64, 67, 71, 74, 78], [60, 64, 67, 71, 74], [62, 67, 69, 71, 74], [62, 66, 69, 73, 76], [60, 64, 67, 69, 74], [59, 64, 67, 71, 74], [60, 64, 67, 71, 76], [59, 62, 66, 69, 73]],
    },
    "emberwatch": {
        "title": "Emberwatch", "bpm": 90, "seed": 1603,
        "description": "An original A-minor hearth theme: muted nylon-like plucks, low velvet keys, slow hand drums and warm bass, with a restrained melodic answer.",
        "roots": [33, 41, 36, 43, 38, 33, 41, 40],
        "chords": [[57, 60, 64, 67, 71], [57, 60, 64, 65, 69], [55, 60, 64, 67, 71], [55, 59, 62, 67, 69], [57, 60, 62, 65, 69], [57, 60, 64, 67, 71], [57, 60, 64, 65, 69], [56, 59, 62, 64, 71]],
    },
}
EFFECTS = {
    "summon-v2": (1.9, "Warm rising portal, rounded arrival and three gently shimmering harmonics."),
    "heavy-impact-v2": (0.95, "Compact low stone impact with a damped bronze resonance."),
    "explosion-v2": (1.55, "Rounded fire burst, low bloom and a short scattering of soft embers."),
    "victory-v2": (2.45, "Original ascending five-note harp figure resolving to a gentle major-sixth chord."),
    "combat-v2": (0.8, "Short blade swish into a controlled wooden and metallic shield strike."),
    "venture-v2": (1.8, "Low doorway movement and a small ascending luminous discovery phrase."),
    "counters-v2": (0.52, "Soft token click with two compact crystalline overtones."),
    "counterspell-v2": (1.15, "Inward arcane rush, muted snap and descending glass dissolve."),
    "instant-v2": (0.7, "Fast airy arcane flick with a warm, precise two-tone sparkle."),
}


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def lowpass(samples, cutoff):
    return sosfilt(butter(2, cutoff, fs=RATE, output="sos"), samples, axis=0)


def env(length, attack=0.01, release=0.06):
    result = np.ones(length)
    a, r = min(int(attack * RATE), length // 2), min(int(release * RATE), length // 2)
    if a:
        result[:a] = np.sin(np.linspace(0, math.pi / 2, a)) ** 2
    if r:
        result[-r:] = np.cos(np.linspace(0, math.pi / 2, r)) ** 2
    return result


def instrument(note, duration, kind, rng):
    t = np.arange(round(duration * RATE)) / RATE
    frequency = hz(note)
    if kind in ("harp", "nylon", "felt", "glass"):
        partials = {
            "harp": [(1, 1, 1.6), (2, .32, .9), (3, .12, .6), (4, .055, .4)],
            "nylon": [(1, 1, 1.25), (2, .23, .7), (3, .095, .45), (4, .03, .25)],
            "felt": [(1, 1, 2.4), (2.002, .20, 1.15), (3.008, .06, .65)],
            "glass": [(1, 1, 2), (2.005, .13, .9), (3.99, .038, .5)],
        }[kind]
        output = np.zeros(len(t))
        # Higher partials decay sooner, keeping repeated notes soft and clear.
        for harmonic, level, decay in partials:
            output += level * np.sin(TAU * frequency * harmonic * t + rng.uniform(-.08, .08)) * np.exp(-t / decay)
        if kind in ("harp", "nylon"):
            output += lowpass(rng.normal(0, .12, len(t)), 1800) * np.exp(-t / .017)
        return output * env(len(t), .008 if kind != "felt" else .024, .12)
    if kind == "pad":
        output = (np.sin(TAU * frequency * t) + .28 * np.sin(TAU * frequency * 1.0018 * t)
                  + .14 * np.sin(TAU * frequency * 2 * t))
        return output * env(len(t), min(.8, duration * .18), min(1.5, duration * .3))
    if kind == "bass":
        return (np.sin(TAU * frequency * t) + .12 * np.sin(TAU * frequency * 2 * t)) * np.exp(-t / 1.2) * env(len(t), .035, .25)
    raise ValueError(kind)


def add(track, sound, seconds, level=1, pan=0, circular=False):
    """Equal-power stereo placement; circular tails preserve loop continuity."""
    stereo = np.asarray(sound, dtype=np.float32)
    if stereo.ndim == 1:
        angle = (pan + 1) * math.pi / 4
        stereo = stereo[:, None] * np.array([math.cos(angle), math.sin(angle)], dtype=np.float32)
    stereo = stereo * level
    start = round(seconds * RATE)
    if circular:
        start %= len(track)
        while len(stereo):
            count = min(len(stereo), len(track) - start)
            track[start:start + count] += stereo[:count]
            stereo = stereo[count:]
            start = 0
    elif start < len(track):
        count = min(len(stereo), len(track) - start)
        track[start:start + count] += stereo[:count]


def drum(kind, rng, strength=1):
    duration = {"low": .7, "wood": .24, "brush": .13}[kind]
    t = np.arange(round(duration * RATE)) / RATE
    noise = rng.normal(0, 1, len(t))
    if kind == "low":
        phase = TAU * (64 * t + 32 * .025 * (1 - np.exp(-t / .025)))
        wave = np.sin(phase) * np.exp(-t / .15) + .08 * lowpass(noise, 800) * np.exp(-t / .025)
    elif kind == "wood":
        wave = (.65 * np.sin(TAU * 185 * t) + .25 * np.sin(TAU * 311 * t)) * np.exp(-t / .048)
        wave += .1 * lowpass(noise, 1300) * np.exp(-t / .015)
    else:
        wave = (lowpass(noise, 2700) - lowpass(noise, 900)) * np.exp(-t / .028)
    return wave * env(len(t), .003, .04) * strength


def space(track, beat):
    """Circular diffuse reflections without an intro, tail gap or loop fade."""
    dry = track.copy()
    for seconds, gain, swap in [(beat * .75, .14, True), (beat * 1.5, .075, True), (.113, .09, False), (.227, .07, True), (.389, .045, False)]:
        reflection = np.roll(dry[:, ::-1] if swap else dry, round(seconds * RATE), axis=0)
        track += reflection * gain
    return track


def render_music(key):
    config = MUSIC[key]
    rng = np.random.default_rng(config["seed"])
    beat = 60 / config["bpm"]
    track = np.zeros((round(32 * 4 * beat * RATE), 2), dtype=np.float32)
    kind = {"council-at-dusk": "harp", "aether-tides": "glass", "emberwatch": "nylon"}[key]
    for bar in range(32):
        chord = config["chords"][bar % 8]
        root = config["roots"][bar % 8]
        start = bar * 4 * beat
        section = bar // 8
        # A modest arc across the arrangement, returning to the starting mood.
        energy = [.82, .94, 1, .86][section]
        for index, note in enumerate(chord[:4]):
            add(track, instrument(note - 12, 6 * beat, "pad", rng), start, .026 * energy, -.65 + index * .43, True)
        add(track, instrument(root, 3.2 * beat, "bass", rng), start, .11 * energy, 0, True)
        if key != "aether-tides" or bar % 2:
            add(track, instrument(root + (7 if bar % 4 == 3 else 0), 1.6 * beat, "bass", rng), start + 2.5 * beat, .055 * energy, 0, True)

        # Voiced arpeggios vary with each eight-bar pass; not random scales.
        if key == "council-at-dusk":
            pattern = [(0, 0), (.75, 2), (1.5, 1), (2.5, 3), (3.25, 2)]
        elif key == "aether-tides":
            pattern = [(.25, 0), (1.75, 3), (3.0, 2)]
        else:
            pattern = [(0, 0), (.75, 2), (1.5, 1), (2.25, 3), (3.5, 2)]
        for index, (offset, degree) in enumerate(pattern):
            if section == 2 and index == len(pattern) - 1:
                degree = 4
            note = chord[degree]
            pan = [-.35, .28, -.12, .42, -.24][index]
            add(track, instrument(note, 3 * beat, kind, rng), start + offset * beat, .063 * energy * rng.uniform(.91, 1.03), pan, True)

        # Short original question/answer motifs leave several bars of space.
        if bar % 8 in (2, 3, 5, 6) and (section != 0 or bar >= 5):
            motif = [(1.25, 4), (2.75, 3)] if bar % 2 == 0 else [(.5, 2), (2.5, 1), (3.5, 2)]
            for offset, degree in motif:
                note = chord[degree] + (12 if key == "aether-tides" else 0)
                add(track, instrument(note, 3.5 * beat, "felt" if key != "aether-tides" else "glass", rng), start + offset * beat, .036 * energy, .18, True)

        if key == "emberwatch":
            for offset, level in [(0, .075), (2.5, .045)]:
                add(track, drum("low", rng), start + offset * beat, level * energy, -.08, True)
            for offset, level in [(1, .027), (3, .035)]:
                add(track, drum("wood", rng), start + offset * beat, level * energy, .22, True)
        elif key == "council-at-dusk":
            add(track, drum("low", rng), start, .04 * energy, 0, True)
            add(track, drum("wood", rng), start + 2 * beat, .019 * energy, .15, True)
        for offset in ([.5, 1.5, 2.5, 3.5] if key != "aether-tides" else [1.5, 3.5]):
            add(track, drum("brush", rng), start + (offset + .025) * beat, .026 * energy, -.45 if offset < 2 else .45, True)
    return space(track, beat)


def chirp(duration, start, end, decay, rng, noise_level=0):
    t = np.arange(round(duration * RATE)) / RATE
    frequency = start * (end / start) ** (t / duration)
    phase = TAU * np.cumsum(frequency) / RATE
    wave = np.sin(phase) * np.exp(-t / decay)
    if noise_level:
        wave += noise_level * lowpass(rng.normal(0, 1, len(t)), 2200) * np.exp(-t / (decay * .65))
    return wave * env(len(t), .006, .08)


def render_effect(key):
    duration, _ = EFFECTS[key]
    rng = np.random.default_rng(2600 + list(EFFECTS).index(key))
    track = np.zeros((round(duration * RATE), 2), dtype=np.float32)
    def tone(note, offset, level=.3, length=.9, pan=0, kind="glass"):
        add(track, instrument(note, length, kind, rng), offset, level, pan)
    def rush(offset, length, level, ascending=False):
        t = np.arange(round(length * RATE)) / RATE
        wave = lowpass(rng.normal(0, 1, len(t)), 1800)
        contour = np.sin(np.linspace(0, math.pi, len(t))) ** 1.5
        if ascending:
            contour *= np.linspace(.2, 1, len(t))
        add(track, wave * contour, offset, level, -.1)
    if key == "summon-v2":
        rush(0, .6, .2, True)
        add(track, chirp(1.1, 90, 60, .35, rng), .25, .46)
        for i, note in enumerate([62, 69, 76]):
            tone(note, .16 + i * .13, .22, 1.3, (i - 1) * .4)
    elif key == "heavy-impact-v2":
        add(track, chirp(.85, 120, 48, .14, rng, .5), 0, 1)
        for note, level in [(45, .24), (52, .12), (58, .06)]:
            tone(note, .012, level, .65, kind="nylon")
    elif key == "explosion-v2":
        add(track, chirp(1.2, 95, 35, .25, rng, .35), 0, .8)
        rush(0, .75, .7)
        for i in range(7):
            add(track, drum("brush", rng), .15 + i * .12, .25 * (1 - i / 8), rng.uniform(-.7, .7))
    elif key == "victory-v2":
        for i, note in enumerate([60, 64, 67, 72, 76]):
            tone(note, i * .105, .27, 1.7, -.35 + i * .175, "harp")
        for note in [48, 60, 64, 67, 69]:
            tone(note, .5, .13, 1.9, kind="felt")
    elif key == "combat-v2":
        rush(0, .15, .35, True)
        add(track, chirp(.55, 180, 105, .075, rng, .7), .09, .65)
        tone(64, .1, .17, .55, .25, "nylon")
    elif key == "venture-v2":
        rush(0, .55, .18)
        add(track, chirp(.65, 65, 48, .2, rng), 0, .35)
        for i, note in enumerate([57, 64, 69]):
            tone(note, .12 + i * .15, .3, 1.2, -.3 + i * .3)
    elif key == "counters-v2":
        add(track, drum("wood", rng), 0, .3)
        tone(81, .008, .35, .48, -.15)
        tone(88, .035, .12, .4, .2)
    elif key == "counterspell-v2":
        rush(0, .32, .5, True)
        add(track, chirp(.55, 200, 70, .13, rng, .2), .18, .5)
        for i, note in enumerate([79, 74, 67]):
            tone(note, .2 + .1 * i, .17, .6, .35 - i * .35)
    elif key == "instant-v2":
        rush(0, .16, .28)
        tone(76, .005, .35, .65, -.2)
        tone(83, .055, .18, .58, .3)
    # Effects have a defined end; trim abrupt synth tails with a quiet release.
    track *= env(len(track), .004, min(.16, duration * .18))[:, None]
    peak = float(np.max(np.abs(track)))
    rms = float(np.sqrt(np.mean(track ** 2)))
    track *= min(.57 / peak, .085 / rms)
    return track


def command(args, data=None):
    return subprocess.run(args, input=data, capture_output=True, check=True)


def loudness(path):
    result = command(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "loudnorm=I=-22:TP=-3:LRA=7:print_format=json", "-f", "null", "-"])
    raw = result.stderr.decode()
    return json.loads(raw[raw.rfind("{"):raw.rfind("}") + 1])


def master(key, samples, output_dir):
    kind = "music" if key in MUSIC else "sfx"
    dest = output_dir / kind / (key + ".mp3")
    dest.parent.mkdir(parents=True, exist_ok=True)
    if kind == "music":
        # MP3 starts/ends have independent codec history. A four-millisecond
        # smooth taper suppresses the resulting high-frequency join transient;
        # the circular arrangement and reflections retain the full bar length.
        samples = samples.copy()
        edge = round(.004 * RATE)
        ramp = np.sin(np.linspace(0, math.pi / 2, edge)) ** 2
        samples[:edge] *= ramp[:, None]
        samples[-edge:] *= ramp[::-1, None]
    pcm = samples.astype("<f4").tobytes()
    input_args = ["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(RATE), "-ac", "2", "-i", "-"]
    filters = []
    if kind == "music":
        measure = command(input_args[:-1] + ["-", "-af", "loudnorm=I=-22:TP=-3:LRA=7:print_format=json", "-f", "null", "-", "-loglevel", "info"], pcm).stderr.decode()
        measured = json.loads(measure[measure.rfind("{"):measure.rfind("}") + 1])
        filters = ["-af", "loudnorm=I=-22:TP=-3:LRA=7:linear=true:measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset}".format(**measured)]
    command(input_args + filters + ["-ar", str(RATE), "-c:a", "libmp3lame", "-b:a", "96k", "-map_metadata", "-1", str(dest)], pcm)
    decoded = np.frombuffer(command(["ffmpeg", "-v", "error", "-i", str(dest), "-f", "f32le", "-ar", str(RATE), "-ac", "2", "-" ]).stdout, dtype="<f4").reshape(-1, 2)
    levels = loudness(dest)
    peak = float(np.max(np.abs(decoded)))
    if not np.isfinite(decoded).all() or peak >= .708:
        raise RuntimeError(f"Invalid audio or peak above -3 dBFS: {key}: {peak}")
    metrics = {
        "integratedLufs": float(levels["input_i"]),
        "truePeakDb": float(levels["input_tp"]),
        "samplePeakDb": round(20 * math.log10(max(peak, 1e-12)), 2),
        "rmsDb": round(20 * math.log10(float(np.sqrt(np.mean(decoded ** 2)))), 2),
        "loopBoundaryDelta": round(float(np.max(np.abs(decoded[0] - decoded[-1]))), 6) if kind == "music" else None,
        "loudnessRangeLu": float(levels["input_lra"]),
    }
    if kind == "music" and abs(metrics["integratedLufs"] + 22) > 1:
        raise RuntimeError(f"Music loudness outside tolerance: {key}: {metrics}")
    config = MUSIC.get(key, {})
    row = {
        "id": key, "title": config.get("title", key.removesuffix("-v2").replace("-", " ").title()),
        "kind": kind, "provider": "Original local synthesis", "model": None,
        "source": "scripts/generate-original-audio.py", "method": "Deterministic additive/modal synthesis, original arrangement, stereo mixing and MP3 mastering; no external samples.",
        "description": config.get("description") or EFFECTS[key][1],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "file": dest.relative_to(ROOT).as_posix() if dest.is_relative_to(ROOT) else str(dest),
        "seconds": round(len(decoded) / RATE, 6), "bytes": dest.stat().st_size,
        "sha256": hashlib.sha256(dest.read_bytes()).hexdigest(),
        "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "sampleRate": RATE, "channels": 2, "bitrateKbps": 96, "metrics": metrics,
    }
    if kind == "music":
        row.update(bpm=config["bpm"], bars=32, seamlessLoop=True, seed=config["seed"],
                   loopMastering="Circular instrument tails and reflections, with a 4 ms smooth codec-edge taper.")
    else:
        row["eventId"] = key.removesuffix("-v2")
    print(json.dumps({"id": key, "seconds": row["seconds"], "bytes": row["bytes"], **metrics}), flush=True)
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="+", choices=[*MUSIC, *EFFECTS])
    parser.add_argument("--metadata", type=Path, default=ROOT / "output/original-audio/metadata.json")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "assets/audio")
    args = parser.parse_args()
    rows = []
    for key in args.only or [*MUSIC, *EFFECTS]:
        samples = render_music(key) if key in MUSIC else render_effect(key)
        rows.append(master(key, samples, args.output_dir.resolve()))
    args.metadata.parent.mkdir(parents=True, exist_ok=True)
    args.metadata.write_text(json.dumps({"tracks": rows}, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
