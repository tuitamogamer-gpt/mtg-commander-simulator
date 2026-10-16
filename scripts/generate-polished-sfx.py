#!/usr/bin/env python3
"""Render the original v3 tactile fantasy sound effects, without network calls.

Requires Python 3, NumPy, SciPy, FFmpeg and FFprobe. Instruments, gestures and
fixed noise seeds are specified here; there are no samples or borrowed tunes.
Existing music, previous sound effects, and manifest.json are never changed.
MP3 bytes may differ between FFmpeg/libmp3lame versions.

Usage: python scripts/generate-polished-sfx.py --metadata output/sfx-v3.json
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import subprocess

import numpy as np
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[1]
RATE = 44100
TAU = 2 * math.pi
EFFECTS = {
    "combat": (.62, "A softened blade swish and short, damped wood-and-bronze shield contact."),
    "venture": (1.22, "An intimate wooden latch, short stone movement and a low luminous room reveal."),
    "counters": (.27, "One precise tactile token click, with a tiny warm crystalline body."),
    "counterspell": (.95, "An inward air rush ending in an arcane cut and low descending collapse."),
    "instant": (.43, "A fast arcane flick: a light tactile onset and a short rising air gesture."),
    "sorcery": (1.36, "A deeper restrained charge followed by a warm, broad magical release."),
    "spell-copy": (.88, "Two short matching arcane impressions mirrored across the stereo field."),
    "summon": (1.46, "A broad warm portal whoosh that opens into a rounded, softly resonant arrival."),
    "heavy-impact": (.78, "One compact weighted impact, with a low stone body and brief dry grit."),
    "explosion": (1.42, "A controlled low magical burst, short fire texture and softly falling debris."),
    "victory": (2.2, "A restrained original ascending felt-key figure resolving into a warm major-sixth chord."),
    "defeat": (1.96, "A gentle original descending felt-key figure and a quiet minor chord, without a dramatic sting."),
}


def seconds(length):
    return np.arange(round(length * RATE), dtype=np.float64) / RATE


def fade(length, attack=.003, release=.04):
    envelope = np.ones(length)
    a = min(round(attack * RATE), length // 2)
    r = min(round(release * RATE), length // 2)
    if a:
        envelope[:a] = np.sin(np.linspace(0, math.pi / 2, a)) ** 2
    if r:
        envelope[-r:] = np.cos(np.linspace(0, math.pi / 2, r)) ** 2
    return envelope


def band(samples, low, high):
    return sosfilt(butter(3, [low, high], btype="bandpass", fs=RATE, output="sos"), samples, axis=0)


def add(track, mono, when=0, level=1, pan=0):
    start = round(when * RATE)
    count = min(len(mono), len(track) - start)
    if count <= 0:
        return
    angle = (pan + 1) * math.pi / 4
    track[start:start + count] += mono[:count, None] * np.array([math.cos(angle), math.sin(angle)]) * level


def modes(length, frequencies, decays, weights, rng, attack=.003):
    """Damped physical-style resonances; unequal partials avoid a bell preset."""
    t = seconds(length)
    output = np.zeros(len(t))
    for frequency, decay, weight in zip(frequencies, decays, weights):
        output += weight * np.sin(TAU * frequency * t + rng.uniform(-.1, .1)) * np.exp(-t / decay)
    return output * fade(len(t), attack, min(.07, length * .25))


def air(length, rng, low=160, high=2400, rise=.18, fall=2):
    t = np.linspace(0, 1, round(length * RATE))
    wave = band(rng.normal(0, 1, len(t)), low, high)
    contour = np.minimum(t / rise, 1) ** .8 * (1 - t) ** fall
    return wave * contour * fade(len(t), .004, .025)


def sweep(length, begin, end, decay, rng, grit=0):
    t = seconds(length)
    freq = begin * (end / begin) ** (t / length)
    wave = np.sin(TAU * np.cumsum(freq) / RATE) * np.exp(-t / decay)
    if grit:
        wave += grit * band(rng.normal(0, 1, len(t)), 170, 1700) * np.exp(-t / (decay * .4))
    return wave * fade(len(t), .004, .08)


def felt(note, length, rng):
    frequency = 440 * 2 ** ((note - 69) / 12)
    return modes(length, [frequency, frequency * 2.003, frequency * 3.008],
                 [.66, .23, .12], [1, .12, .025], rng, attack=.014)


def compose(key):
    length = EFFECTS[key][0]
    rng = np.random.default_rng(361016 + list(EFFECTS).index(key))
    track = np.zeros((round(length * RATE), 2))
    if key == "combat":
        add(track, air(.17, rng, 500, 2900, .36, .8), .006, .85, -.22)
        add(track, modes(.38, [195, 327, 583, 973], [.078, .062, .045, .025], [1, .48, .19, .07], rng), .092, .45, .12)
        add(track, air(.18, rng, 320, 1800, .035, 4), .09, .5, .1)
    elif key == "venture":
        add(track, modes(.2, [310, 470, 820], [.035, .025, .015], [1, .3, .1], rng), .006, .38, -.2)
        add(track, air(.55, rng, 100, 1200, .12, 1.8), .11, .4, .18)
        add(track, modes(.88, [196, 293.66, 392], [.23, .27, .15], [.55, .18, .07], rng, .06), .29, .65, .05)
    elif key == "counters":
        add(track, air(.075, rng, 900, 3400, .04, 3), .005, .7, -.06)
        add(track, modes(.24, [780, 1320, 2190], [.032, .018, .01], [1, .22, .07], rng, .0015), .005, .32, .06)
    elif key == "counterspell":
        inward = air(.34, rng, 240, 2800, .7, .1)
        add(track, inward, .006, .6, .2)
        add(track, modes(.12, [270, 525, 1030], [.024, .018, .009], [1, .2, .07], rng), .285, .45, 0)
        add(track, sweep(.55, 275, 85, .14, rng, .08), .3, .23, -.15)
        add(track, air(.43, rng, 500, 1650, .05, 2.8), .31, .24, -.25)
    elif key == "instant":
        add(track, air(.08, rng, 700, 3300, .055, 3.2), .005, .7, -.15)
        add(track, sweep(.29, 370, 830, .075, rng, .015), .014, .17, .15)
        add(track, air(.27, rng, 450, 2450, .18, 2.2), .015, .32, .24)
    elif key == "sorcery":
        add(track, air(.52, rng, 130, 1800, .75, .2), .006, .35, -.17)
        add(track, modes(.55, [112, 168, 224], [.7, .5, .2], [.5, .14, .08], rng, .18), .006, .28, -.12)
        add(track, air(.83, rng, 180, 2400, .08, 2), .38, .7, .18)
        add(track, sweep(.88, 190, 110, .26, rng, .035), .36, .25, .02)
        add(track, modes(.81, [220, 329.63, 440], [.3, .21, .12], [.4, .14, .06], rng, .015), .41, .26, .17)
    elif key == "spell-copy":
        impression = air(.27, rng, 400, 2500, .12, 2.7)
        pulse = sweep(.34, 380, 560, .067, rng, .02)
        for when, pan, level in [(.006, -.48, 1), (.19, .48, .88)]:
            add(track, impression, when, .65 * level, pan)
            add(track, pulse, when + .014, .16 * level, pan)
        add(track, air(.38, rng, 230, 1300, .1, 3), .35, .18, 0)
    elif key == "summon":
        add(track, air(.88, rng, 120, 1950, .43, .9), .006, .55, -.26)
        add(track, air(.86, rng, 190, 2500, .38, 1.4), .19, .3, .35)
        add(track, modes(.99, [130.81, 196, 261.63, 392], [.36, .32, .24, .13], [.6, .22, .15, .04], rng, .1), .36, .45, .02)
    elif key == "heavy-impact":
        add(track, sweep(.63, 145, 72, .095, rng, .16), .005, .53, 0)
        add(track, modes(.43, [218, 347, 531], [.06, .045, .02], [.5, .22, .1], rng), .009, .31, .12)
        add(track, air(.18, rng, 210, 1900, .045, 3.2), .005, .75, -.12)
    elif key == "explosion":
        add(track, sweep(.81, 135, 64, .15, rng, .13), .005, .46, 0)
        add(track, air(.67, rng, 140, 2300, .055, 2.5), .006, .95, -.15)
        add(track, air(.71, rng, 270, 2000, .18, 2.4), .12, .45, .22)
        for i in range(5):
            add(track, air(.1, rng, 500, 2400, .04, 3.5), .21 + i * .15, .2 * (1 - i / 6), -.35 + i * .17)
    elif key == "victory":
        for i, note in enumerate([60, 64, 67, 72]):
            add(track, felt(note, 1.35, rng), .006 + i * .12, .15, -.3 + i * .2)
        for note, level in [(48, .045), (60, .065), (64, .055), (69, .045)]:
            add(track, felt(note, 1.52, rng), .54, level, 0)
    elif key == "defeat":
        for i, note in enumerate([69, 67, 62]):
            add(track, felt(note, 1.27, rng), .006 + i * .21, .135, .18 - i * .18)
        for note, level in [(50, .04), (57, .045), (65, .035)]:
            add(track, felt(note, 1.24, rng), .57, level, 0)
    # Remove infrasonic energy and soften the whole pack's upper edge. Final
    # fade is applied after filters so neither boundary can carry filter ringing.
    track = band(track, 55, 4100)
    track *= fade(len(track), .004, min(.12, length * .22))[:, None]
    # Keep a short natural release after the last sample above -50 dB relative
    # to the event peak. Silent padding should not occupy an effect voice while
    # several game actions resolve quickly. Tiny token cues retain at least 200 ms.
    magnitude = np.max(np.abs(track), axis=1)
    audible = np.flatnonzero(magnitude > magnitude.max() * 10 ** (-50 / 20))
    end = max(round(.2 * RATE), min(len(track), int(audible[-1]) + round(.04 * RATE)))
    track = track[:end].copy()
    track *= fade(len(track), 0, .035)[:, None]
    track[-round(.006 * RATE):] = 0
    return track.astype("<f4")


def run(args, data=None):
    return subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)


def level_measure(samples):
    # EBU R128 needs 400 ms; shorter cues are measured with zero padding only
    # for metering. Their exported files retain the short responsive duration.
    padded = np.pad(samples, ((0, max(0, round(.4 * RATE) - len(samples))), (0, 0)))
    result = run(["ffmpeg", "-hide_banner", "-nostats", "-f", "f32le", "-ar", str(RATE), "-ac", "2", "-i", "-", "-af", "loudnorm=I=-22:TP=-4:LRA=7:print_format=json", "-f", "null", "-"], padded.astype("<f4").tobytes())
    raw = result.stderr.decode()
    return json.loads(raw[raw.rfind("{"):raw.rfind("}") + 1])


def db(value):
    return round(20 * math.log10(max(float(value), 1e-12)), 3)


def master(key, output_dir):
    samples = compose(key)
    measured = level_measure(samples)
    rms = float(np.sqrt(np.mean(samples ** 2)))
    peak = float(np.max(np.abs(samples)))
    target = -22.5 if key not in ("counters", "instant") else -23.5
    # Linear gain preserves tactile attacks. RMS and peak ceilings keep low
    # impacts and very short clicks from being over-amplified by loudness gating.
    gain = min(10 ** ((target - float(measured["input_i"])) / 20), 10 ** (-21.5 / 20) / rms, 10 ** (-5 / 20) / peak)
    samples *= gain
    dest = output_dir / f"{key}-v3.mp3"
    dest.parent.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(RATE), "-ac", "2", "-i", "-", "-ar", str(RATE), "-c:a", "libmp3lame", "-b:a", "96k", "-map_metadata", "-1", str(dest)], samples.tobytes())
    decoded = np.frombuffer(run(["ffmpeg", "-v", "error", "-i", str(dest), "-f", "f32le", "-ar", str(RATE), "-ac", "2", "-" ]).stdout, dtype="<f4").reshape(-1, 2)
    levels = level_measure(decoded)
    spectrum = np.sum(np.abs(np.fft.rfft(decoded, axis=0)) ** 2, axis=1)
    frequency = np.fft.rfftfreq(len(decoded), 1 / RATE)
    total = spectrum.sum()
    rms = float(np.sqrt(np.mean(decoded ** 2)))
    magnitude = np.max(np.abs(decoded), axis=1)
    audible = np.flatnonzero(magnitude > magnitude.max() * 10 ** (-50 / 20))
    metrics = {
        "integratedLufs": float(levels["input_i"]), "meterPaddingSeconds": max(0, round(.4 - len(decoded) / RATE, 6)),
        "truePeakDb": float(levels["input_tp"]), "samplePeakDb": db(np.max(np.abs(decoded))), "rmsDb": db(rms),
        "energyAbove6kHzPercent": round(float(spectrum[frequency >= 6000].sum() / total * 100), 5),
        "energyBelow45HzPercent": round(float(spectrum[frequency < 45].sum() / total * 100), 5),
        "spectralCentroidHz": round(float(np.sum(spectrum * frequency) / total), 1),
        "last2msPeakDb": db(np.max(np.abs(decoded[-round(.002 * RATE):]))),
        "quietTailMs": round((len(decoded) - int(audible[-1]) - 1) / RATE * 1000, 2),
        "onsetMs": round(int(audible[0]) / RATE * 1000, 2),
        "stereoCorrelation": round(float(np.corrcoef(decoded.T)[0, 1]), 4),
    }
    if not np.isfinite(decoded).all() or rms < .001:
        raise RuntimeError(f"Invalid or silent sound: {key}")
    if metrics["truePeakDb"] > -4 or metrics["last2msPeakDb"] > -55:
        raise RuntimeError(f"Peak/tail check failed: {key}: {metrics}")
    if metrics["energyAbove6kHzPercent"] > .5 or metrics["energyBelow45HzPercent"] > 2:
        raise RuntimeError(f"Spectral check failed: {key}: {metrics}")
    if metrics["quietTailMs"] > 80:
        raise RuntimeError(f"Excessive silent tail: {key}: {metrics}")
    row = {
        "id": key, "eventId": key, "title": key.replace("-", " ").title(), "version": 3, "kind": "sfx",
        "provider": "Original local synthesis", "model": None, "source": "scripts/generate-polished-sfx.py",
        "method": "Deterministic damped modal synthesis, filtered noise gestures, original note figures, stereo placement and linear loudness mastering; no external samples.",
        "description": EFFECTS[key][1], "seed": 361016 + list(EFFECTS).index(key),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "file": dest.relative_to(ROOT).as_posix() if dest.is_relative_to(ROOT) else str(dest),
        "seconds": round(len(decoded) / RATE, 6), "bytes": dest.stat().st_size,
        "sha256": hashlib.sha256(dest.read_bytes()).hexdigest(), "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "sampleRate": RATE, "channels": 2, "bitrateKbps": 96, "metrics": metrics,
    }
    print(json.dumps({"id": key, "seconds": row["seconds"], "bytes": row["bytes"], **metrics}), flush=True)
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="+", choices=list(EFFECTS))
    parser.add_argument("--metadata", type=Path, default=ROOT / "output/sfx-v3/metadata.json")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "assets/audio/sfx")
    args = parser.parse_args()
    rows = [master(key, args.output_dir.resolve()) for key in args.only or EFFECTS]
    args.metadata.parent.mkdir(parents=True, exist_ok=True)
    args.metadata.write_text(json.dumps({"tracks": rows}, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
