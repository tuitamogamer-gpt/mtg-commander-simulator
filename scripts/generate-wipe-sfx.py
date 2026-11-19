#!/usr/bin/env python3
"""Render the three original sounds of a staged board wipe without services.

A mass removal is played on the table in three beats (src/modules/board-wipe.js):
the build-up, the impact, then the cards going one after another. Each beat has
its own sound, so the runtime can follow the game's speed and the number of
cards: a rising charge, one weighted impact with a rolling tail, and a short
brittle break that is repeated per card at slightly different pitches.

Requires Python 3, NumPy, SciPy and FFmpeg. Reuses the unchanged synthesis and
metering helpers in generate-polished-sfx.py; metadata records both source
hashes. Fixed seeds make the PCM reproducible. MP3 bytes can vary with encoder
versions. No existing assets or manifest entries are modified.

Usage: python scripts/generate-wipe-sfx.py --metadata output/wipe-sfx.json
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
add, air, band, fade, modes, sweep = helpers.add, helpers.air, helpers.band, helpers.fade, helpers.modes, helpers.sweep
# id: (length in seconds, loudness target in LUFS, allowed duration, description)
EFFECTS = {
    "wipe-charge": (1.04, -23.4, (.8, 1.2), "A slow inward draw of air over a rising low tone, with a few quickening dry ticks, cut just before it peaks."),
    "wipe-impact": (2.15, -21.8, (1.6, 2.4), "One broad weighted strike with a deep falling body, a wide burst of air and a long rolling tail of settling debris."),
    "wipe-shatter": (.34, -24.2, (.2, .42), "A short brittle break: a dry crack, a small stone-and-glass body and two grains falling away."),
}


def rising(length, begin, end, rng, grit=0):
    """A tone that grows as it climbs: a decaying sweep played backwards."""
    return sweep(length, end, begin, length * .42, rng, grit)[::-1].copy()


def rumble(length, rng, low=58, high=210, rate=8.5):
    t = np.arange(round(length * RATE)) / RATE
    wave = band(rng.normal(0, 1, len(t)), low, high)
    roll = .62 + .38 * np.sin(helpers.TAU * (rate * t - 2.2 * t * t))
    return wave * roll * np.exp(-t / (length * .36)) * fade(len(t), .02, .12)


def compose(key):
    rng = np.random.default_rng(561118 + list(EFFECTS).index(key))
    track = np.zeros((round(EFFECTS[key][0] * RATE), 2))
    if key == "wipe-charge":
        add(track, air(.98, rng, 170, 2500, .93, .1), .006, .62, -.2)
        add(track, air(.9, rng, 320, 2900, .95, .08), .09, .34, .26)
        add(track, rising(.96, 58, 176, rng, .02), .006, .3, 0)
        add(track, rising(.7, 116, 262, rng), .27, .09, .1)
        for i, when in enumerate([.1, .36, .56, .71, .82, .9, .955]):
            add(track, modes(.12, [360 + i * 58, 742 + i * 96], [.03, .014], [.7, .16], rng, .002), when, .1 + i * .028, -.42 + i * .14)
            add(track, air(.05, rng, 800, 2700, .04, 3), when, .08 + i * .022, -.42 + i * .14)
    elif key == "wipe-impact":
        add(track, air(.1, rng, 650, 3300, .03, 3.2), .004, .95, -.05)
        add(track, sweep(1.32, 152, 47, .3, rng, .17), .005, .62, 0)
        add(track, modes(.95, [98, 147, 196, 311], [.5, .38, .26, .1], [.62, .3, .17, .06], rng, .004), .008, .34, .06)
        add(track, air(.98, rng, 120, 2300, .04, 2.2), .006, .9, -.3)
        add(track, air(1.12, rng, 220, 2050, .12, 2), .07, .55, .34)
        add(track, rumble(1.9, rng), .12, 1.05, 0)
        add(track, rumble(1.5, rng, 90, 320, 6.2), .3, .4, .22)
        for i in range(9):
            add(track, air(.085 + .006 * i, rng, 480, 2400 - i * 110, .04, 3.4), .34 + i * .152, .26 * (1 - i / 11), -.46 + (i % 3) * .46)
            add(track, modes(.11, [286 - i * 9, 611 - i * 17], [.026, .013], [.6, .14], rng, .002), .35 + i * .152, .07 * (1 - i / 12), .4 - (i % 3) * .4)
    elif key == "wipe-shatter":
        add(track, air(.055, rng, 880, 3500, .03, 3.4), .003, .85, -.08)
        add(track, modes(.27, [412, 733, 1187, 1790], [.05, .035, .02, .012], [.8, .4, .2, .1], rng, .0015), .004, .36, .08)
        add(track, sweep(.17, 182, 88, .042, rng, .05), .005, .2, 0)
        for when, pan, level in [(.09, -.34, .3), (.165, .3, .2)]:
            add(track, air(.05, rng, 700, 2800, .04, 3.2), when, level, pan)
    # The pack's spectral limits, then a natural release after the last
    # sample above -50 dB relative to the peak.
    track = band(track, 55, 4000)
    track *= fade(len(track), .004, .09 if key != "wipe-charge" else .028)[:, None]
    magnitude = np.max(np.abs(track), axis=1)
    active = np.flatnonzero(magnitude > magnitude.max() * 10 ** (-50 / 20))
    end = max(round(.2 * RATE), min(len(track), int(active[-1]) + round(.04 * RATE)))
    track = track[:end].copy()
    track *= fade(len(track), 0, .035 if key != "wipe-charge" else .022)[:, None]
    track[-round(.006 * RATE):] = 0
    return track.astype("<f4")


def master(key, output_dir):
    _, target, limits, description = EFFECTS[key]
    samples = compose(key)
    levels = helpers.level_measure(samples)
    gain = min(10 ** ((target - float(levels["input_i"])) / 20),
               10 ** (-21 / 20) / float(np.sqrt(np.mean(samples ** 2))),
               10 ** (-5 / 20) / float(np.max(np.abs(samples))))
    samples *= gain
    dest = output_dir / f"{key}-v1.mp3"
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
    if not limits[0] <= duration <= limits[1]:
        raise RuntimeError(f"Duration outside target: {key}: {duration}")
    row = {
        "id": key, "eventId": key, "title": key.replace("-", " ").title(),
        "version": 1, "kind": "sfx", "provider": "Original local synthesis", "model": None,
        "source": "scripts/generate-wipe-sfx.py", "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "sourceDependencies": [{"file": HELPER.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(HELPER.read_bytes()).hexdigest()}],
        "method": "Deterministic damped modal synthesis, shaped noise gestures, stereo placement and linear loudness mastering; no external samples.",
        "description": description, "seed": 561118 + list(EFFECTS).index(key),
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
    parser.add_argument("--metadata", type=Path, default=ROOT / "output/wipe-sfx/metadata.json")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "assets/audio/sfx")
    args = parser.parse_args()
    rows = [master(key, args.output_dir.resolve()) for key in args.only or EFFECTS]
    args.metadata.parent.mkdir(parents=True, exist_ok=True)
    args.metadata.write_text(json.dumps({"tracks": rows}, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
