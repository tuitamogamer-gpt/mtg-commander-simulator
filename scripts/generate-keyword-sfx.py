#!/usr/bin/env python3
"""Render thirteen original, short keyword sound signatures without services.

Requires Python 3, NumPy, SciPy and FFmpeg. Reuses the unchanged synthesis and
metering helpers in generate-polished-sfx.py; metadata records both source
hashes. Fixed seeds make the PCM reproducible. MP3 bytes can vary with encoder
versions. No existing assets or manifest entries are modified.

Usage: python scripts/generate-keyword-sfx.py --metadata output/keyword-sfx.json
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
HELPER = Path(__file__).with_name("generate-polished-sfx.py")
spec = importlib.util.spec_from_file_location("polished_sfx_helpers", HELPER)
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
RATE = helpers.RATE
add, air, modes, sweep = helpers.add, helpers.air, helpers.modes, helpers.sweep
EFFECTS = {
    "flying": (.78, "A light wing wash, with two soft air strokes opening across the stereo field."),
    "vigilance": (.66, "A precise, steady sentinel tone with a short warm metallic resonance."),
    "haste": (.62, "Three restrained accelerating air gestures, moving swiftly from left to right."),
    "menace": (.85, "Two compact low pulses, with a dry, slightly unsettled resonant body."),
    "reach": (.67, "A softly stretching bow string followed by a clean string-and-wood catch."),
    "first-strike": (.42, "One precise quick blade gesture, with a clean, short contact."),
    "double-strike": (.64, "Two precise blade contacts separated by a short, clearly audible gap."),
    "trample": (1.15, "A short rolling sequence of weighted stone impacts and controlled crushing texture."),
    "lifelink": (.98, "A soft restorative flow opening into warm, rounded harmonic motion."),
    "deathtouch": (.61, "A compact dark sting, closing into a dry descending resonance."),
    "infect": (.88, "A restrained pulsing alchemical texture, with a small rippling acidic shimmer."),
    "wither": (.83, "A dry granular crumble with a gently descending, drained resonance."),
    "proliferate": (.92, "A small scatter of tactile ticks building in speed and brightness."),
}


def blade(rng):
    sound = np.zeros((round(.31 * RATE), 2))
    add(sound, air(.11, rng, 650, 2800, .15, 2), .004, .55, -.12)
    add(sound, modes(.24, [330, 719, 1140], [.051, .031, .016], [.7, .18, .05], rng, .002), .042, .25, .12)
    return sound


def add_stereo(track, sound, when, level=1, flip=False):
    start = round(when * RATE)
    count = min(len(sound), len(track) - start)
    track[start:start + count] += sound[:count, ::-1] * level if flip else sound[:count] * level


def compose(key):
    rng = np.random.default_rng(461016 + list(EFFECTS).index(key))
    track = np.zeros((round(EFFECTS[key][0] * RATE), 2))
    if key == "flying":
        add(track, air(.43, rng, 500, 2450, .28, 1.7), .005, .57, -.32)
        add(track, air(.48, rng, 360, 2100, .31, 1.9), .19, .42, .32)
        add(track, sweep(.3, 190, 135, .055, rng), .027, .045, 0)
    elif key == "vigilance":
        add(track, modes(.58, [440, 660, 1117], [.17, .105, .045], [.7, .18, .045], rng, .008), .006, .4, 0)
        add(track, air(.065, rng, 700, 2300, .05, 3.8), .005, .2, -.06)
    elif key == "haste":
        for i, (when, length) in enumerate([(.006, .21), (.17, .16), (.28, .12)]):
            add(track, air(length, rng, 550 + 100 * i, 2300 + 120 * i, .25, 1.6), when, .42 + .08 * i, -.35 + .35 * i)
            add(track, sweep(length, 280 + i * 80, 500 + i * 120, .042, rng), when, .04, -.3 + .3 * i)
    elif key == "menace":
        for when, pan, level in [(.006, -.16, 1), (.23, .16, .82)]:
            add(track, sweep(.46, 140, 88, .08, rng, .035), when, .3 * level, pan)
            add(track, modes(.3, [186, 207, 370], [.08, .07, .035], [.5, .12, .08], rng), when + .005, .22 * level, pan)
    elif key == "reach":
        add(track, sweep(.29, 132, 198, .15, rng, .01), .006, .095, -.18)
        add(track, air(.25, rng, 280, 1400, .55, .4), .005, .18, -.1)
        add(track, modes(.36, [220, 445, 681], [.074, .05, .02], [1, .22, .06], rng, .003), .21, .28, .18)
        add(track, air(.11, rng, 700, 2400, .03, 3), .21, .28, .18)
    elif key == "first-strike":
        add_stereo(track, blade(rng), .003)
    elif key == "double-strike":
        hit = blade(rng)
        add_stereo(track, hit, .003, .94)
        add_stereo(track, hit, .17, .84, True)
    elif key == "trample":
        for i, when in enumerate([.006, .19, .39]):
            add(track, sweep(.47, 128 - 9 * i, 74, .09, rng, .12), when, .29 - .035 * i, -.2 + .2 * i)
            add(track, air(.26, rng, 180, 1700, .05, 2.5), when, .53 - .07 * i, -.15 + .15 * i)
        add(track, air(.36, rng, 260, 1250, .1, 2.5), .52, .2, .1)
    elif key == "lifelink":
        add(track, air(.7, rng, 350, 1600, .38, 1.5), .006, .22, -.27)
        add(track, modes(.75, [261.63, 329.63, 392], [.27, .24, .17], [.45, .2, .09], rng, .075), .08, .3, -.12)
        add(track, modes(.61, [329.63, 440], [.2, .14], [.35, .15], rng, .075), .27, .2, .24)
    elif key == "deathtouch":
        add(track, air(.16, rng, 400, 1800, .04, 3), .005, .35, -.08)
        add(track, modes(.33, [196, 209, 330], [.06, .045, .03], [.7, .18, .075], rng), .008, .27, 0)
        add(track, sweep(.42, 225, 95, .075, rng, .012), .035, .14, .08)
    elif key == "infect":
        texture = air(.68, rng, 380, 2000, .2, 1.6)
        t = np.arange(len(texture)) / RATE
        texture *= .62 + .38 * np.sin(helpers.TAU * (14 * t + 7 * t * t))
        add(track, texture, .006, .63, -.15)
        add(track, sweep(.43, 175, 285, .12, rng, .02), .02, .095, .12)
        add(track, air(.28, rng, 650, 2400, .14, 2.6), .41, .2, .24)
    elif key == "wither":
        for i, when in enumerate([.006, .072, .17, .3, .46]):
            add(track, air(.09 + i * .014, rng, 480, 2200 - i * 180, .045, 3), when, .4 * (1 - .14 * i), -.24 + .12 * i)
        add(track, sweep(.48, 210, 95, .11, rng, .025), .017, .115, 0)
    elif key == "proliferate":
        for i, when in enumerate([.006, .18, .32, .43, .51]):
            add(track, modes(.18, [480 + i * 75, 960 + i * 110], [.034, .016], [.7, .12], rng, .002), when, .15 + i * .022, -.4 + i * .2)
            add(track, air(.065, rng, 800, 2600, .04, 3), when, .14 + i * .02, -.4 + i * .2)
        add(track, air(.25, rng, 480, 1600, .1, 2.5), .56, .16, .18)
    # Consistent spectral limits and short natural releases across the pack.
    track = helpers.band(track, 55, 4000)
    track *= helpers.fade(len(track), .004, .075)[:, None]
    magnitude = np.max(np.abs(track), axis=1)
    active = np.flatnonzero(magnitude > magnitude.max() * 10 ** (-50 / 20))
    end = max(round(.25 * RATE), min(len(track), int(active[-1]) + round(.04 * RATE)))
    track = track[:end].copy()
    track *= helpers.fade(len(track), 0, .035)[:, None]
    track[-round(.006 * RATE):] = 0
    return track.astype("<f4")


def master(key, output_dir):
    samples = compose(key)
    levels = helpers.level_measure(samples)
    target = -23.0 if key in ("first-strike", "double-strike", "proliferate") else -22.8
    gain = min(10 ** ((target - float(levels["input_i"])) / 20),
               10 ** (-22 / 20) / float(np.sqrt(np.mean(samples ** 2))),
               10 ** (-5 / 20) / float(np.max(np.abs(samples))))
    samples *= gain
    dest = output_dir / f"keyword-{key}-v1.mp3"
    dest.parent.mkdir(parents=True, exist_ok=True)
    helpers.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(RATE), "-ac", "2", "-i", "-", "-ar", str(RATE), "-c:a", "libmp3lame", "-b:a", "96k", "-map_metadata", "-1", str(dest)], samples.tobytes())
    decoded = np.frombuffer(helpers.run(["ffmpeg", "-v", "error", "-i", str(dest), "-f", "f32le", "-ar", str(RATE), "-ac", "2", "-"]).stdout, dtype="<f4").reshape(-1, 2)
    levels = helpers.level_measure(decoded)
    spectrum = np.sum(np.abs(np.fft.rfft(decoded, axis=0)) ** 2, axis=1)
    frequency = np.fft.rfftfreq(len(decoded), 1 / RATE)
    total = spectrum.sum()
    magnitude = np.max(np.abs(decoded), axis=1)
    active = np.flatnonzero(magnitude > magnitude.max() * 10 ** (-50 / 20))
    metrics = {
        "integratedLufs": float(levels["input_i"]), "meterPaddingSeconds": max(0, round(.4 - len(decoded) / RATE, 6)),
        "truePeakDb": float(levels["input_tp"]), "samplePeakDb": helpers.db(magnitude.max()),
        "rmsDb": helpers.db(np.sqrt(np.mean(decoded ** 2))),
        "energyAbove6kHzPercent": round(float(spectrum[frequency >= 6000].sum() / total * 100), 5),
        "energyBelow45HzPercent": round(float(spectrum[frequency < 45].sum() / total * 100), 5),
        "spectralCentroidHz": round(float(np.sum(spectrum * frequency) / total), 1),
        "last2msPeakDb": helpers.db(np.max(np.abs(decoded[-round(.002 * RATE):]))),
        "quietTailMs": round((len(decoded) - int(active[-1]) - 1) / RATE * 1000, 2),
        "onsetMs": round(int(active[0]) / RATE * 1000, 2),
        "stereoCorrelation": round(float(np.corrcoef(decoded.T)[0, 1]), 4),
    }
    if not np.isfinite(decoded).all() or np.sqrt(np.mean(decoded ** 2)) < .001:
        raise RuntimeError(f"Invalid or silent sound: {key}")
    if metrics["truePeakDb"] > -4 or metrics["last2msPeakDb"] > -55 or metrics["quietTailMs"] > 80:
        raise RuntimeError(f"Peak or tail check failed: {key}: {metrics}")
    if metrics["energyAbove6kHzPercent"] > .5 or metrics["energyBelow45HzPercent"] > 2:
        raise RuntimeError(f"Spectral check failed: {key}: {metrics}")
    duration = len(decoded) / RATE
    if duration < .25 or duration > (1.5 if key == "trample" else 1.2):
        raise RuntimeError(f"Keyword duration outside target: {key}: {duration}")
    row = {
        "id": f"keyword-{key}", "eventId": f"keyword-{key}", "title": key.replace("-", " ").title(),
        "version": 1, "kind": "sfx", "provider": "Original local synthesis", "model": None,
        "source": "scripts/generate-keyword-sfx.py", "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "sourceDependencies": [{"file": HELPER.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(HELPER.read_bytes()).hexdigest()}],
        "method": "Deterministic damped modal synthesis, shaped noise gestures, subtle stereo placement and linear loudness mastering; no external samples.",
        "description": EFFECTS[key][1], "seed": 461016 + list(EFFECTS).index(key),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "file": dest.relative_to(ROOT).as_posix() if dest.is_relative_to(ROOT) else str(dest),
        "seconds": round(duration, 6), "bytes": dest.stat().st_size, "sha256": hashlib.sha256(dest.read_bytes()).hexdigest(),
        "sampleRate": RATE, "channels": 2, "bitrateKbps": 96, "metrics": metrics,
    }
    print(json.dumps({"id": row["id"], "seconds": row["seconds"], "bytes": row["bytes"], **metrics}), flush=True)
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="+", choices=list(EFFECTS))
    parser.add_argument("--metadata", type=Path, default=ROOT / "output/keyword-sfx/metadata.json")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "assets/audio/sfx")
    args = parser.parse_args()
    rows = [master(key, args.output_dir.resolve()) for key in args.only or EFFECTS]
    args.metadata.parent.mkdir(parents=True, exist_ok=True)
    args.metadata.write_text(json.dumps({"tracks": rows}, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
