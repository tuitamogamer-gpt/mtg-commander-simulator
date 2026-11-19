#!/usr/bin/env python3
"""Edit the three sounds of a staged board wipe from Fish Audio sound effects.

A mass removal is played on the table in three beats (src/modules/board-wipe.js):
the build-up, the impact, then the cards going one after another. Version 1 of
their sounds was synthesized (scripts/generate-wipe-sfx.py). Version 2 is cut
the way a sound editor works: six raw recordings generated with Fish Audio's
sound effect model are the material, and this script is the edit.

The raw material is texture, not finished gestures: two steady rumbles, a hit
that starts after a second of silence and never decays, a low drone, a bright
crack and a quiet burst of grit. The edit gives them their shape:

- charge: a rumble sped up as it plays (a tape rise), under a low-pass filter
  that opens, on a rising level, with the crack played backwards into the cut;
- impact: the crack as the transient, the hit as the body under a filter that
  closes, the drone slowed down as the low boom, and the hit's ringing second
  half as settling debris;
- shatter: the crack, a short thud from the hit and two grains of the grit.

Requires Python 3, NumPy, SciPy and FFmpeg. The sources are permanent URLs,
recorded below with their task ids, prompts and SHA-256; they are downloaded
into --sources when missing (curl, then urllib) and never committed. Reuses
the metering and encoding of generate-polished-sfx.py. The PCM is
deterministic; MP3 bytes can vary with encoder versions.

Usage: python scripts/master-wipe-sfx.py --metadata output/wipe-sfx/v2.json
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import urllib.request

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[1]
HELPER = Path(__file__).with_name("generate-polished-sfx.py")
spec = importlib.util.spec_from_file_location("polished_sfx_helpers", HELPER)
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
RATE = helpers.RATE
fade = helpers.fade

PROVIDER = "Fish Audio sound effects"
BASE = "https://platform.r2.fish.audio/task_sound_effects/"
PROMPTS = {
    "charge": "Cinematic dark fantasy riser: a low ominous rumble swelling into a rising whoosh of air and crackling arcane energy, tension building steadily to its loudest point at the very end, then an abrupt stop. No impact, no explosion, no music, no voice. Clean, dry, professional trailer sound design.",
    "impact": "Massive cinematic impact for a devastating magic spell: a sharp cracking transient at the very start, a deep sub-bass boom and heavy shockwave, crumbling stone debris, and a dark reverb tail that fades to silence. Starts instantly, no build-up, no music, no voice. Professional film sound design.",
    "shatter": "One short dry breaking hit: a brittle crack like a stone tablet snapping with a small glassy shatter, starts instantly and ends within a third of a second. Single hit only, no reverb tail, no echo, no music, no voice. Close and punchy professional foley.",
}
# name: (prompt, Fish task id, seconds asked for, SHA-256 of the WAV)
SOURCES = {
    "rumble": ("charge", "25c791e104044d818dfe0026256e1e0a", 2, "c28f2ee2b5720c277ef8edb1fc109e974057508550d6210939e87d3e265b42eb"),
    "low": ("charge", "fa4e10362b0c40dbad6d9e1959911d9b", 2, "1d1c61a6c1920be3e801c8c8f454edb8b363c7c33f910c023cde919413d58c9e"),
    "hit": ("impact", "4959e3ec86fa49c08137edaf10ce1cf0", 3, "ae82e1766ca9da2e4215d32a229121c2d1d097fa6263d3dd81fa485234feda4f"),
    "drone": ("impact", "411546b0c0854fd79cc6b54d8f46c977", 3, "6937386da8d58ce6af440fb48a8d34cfaae1eb8341ded11cdd9e976077ceb4cd"),
    "crack": ("shatter", "eb316e34cbba4b798e297857d82ff427", 1, "72ab4c406d87b5f5aa5227e5873abdf6a0ff9c0d20350c2e4bb350c8495ec470"),
    "grit": ("shatter", "69c501e14ed847cb9c54322a6340a36b", 1, "837c61df8a802499c59b13e8fb494cf31cde4e08a2a41897b3a85fb0510737b8"),
}
# id: (loudness target in LUFS, allowed duration, which sources, description, the edit in words)
EFFECTS = {
    "wipe-charge": (-23.4, (.8, 1.25), ("rumble", "low", "hit", "crack"),
        "A low rumble that climbs and opens as it swells, drawn in by a reversed crack and cut just before it peaks.",
        "Rumble played at a rising speed (0.55x to 1.7x) under a low-pass that opens from 170 Hz to 5 kHz and a level that rises over a second; the second rumble underneath; the hit's sustained noise through a band that climbs from 300 Hz to 4 kHz as the whoosh; the crack reversed into the cut."),
    "wipe-impact": (-21.8, (1.6, 2.4), ("crack", "hit", "drone"),
        "A hard crack, a heavy body that darkens as it falls away, a deep boom under it and debris that settles.",
        "The crack as the transient, with a copy an octave down as the knock; the hit from its onset under a low-pass that closes from 5.2 kHz to 420 Hz on a 0.6 s decay; the drone slowed from 1.05x to 0.6x and low-passed at 150 Hz as the boom; the hit's ringing second half, quieter and later, as the settling."),
    "wipe-shatter": (-24.2, (.2, .42), ("crack", "hit", "grit"),
        "One brittle break: a dry crack on a small thud, and two grains falling away.",
        "The crack from its loudest part; a 120 ms slice of the hit low-passed at 900 Hz as the thud; two short gated grains of the grit, band-passed 0.9-3.2 kHz. The crack is low-passed at 3.4 kHz, because the break repeats once per card."),
}


def fetch(name, directory):
    """The mono source as float64, downloaded once and checked against its hash."""
    _, task, _, digest = SOURCES[name]
    path = directory / f"{task}.wav"
    if not path.exists():
        directory.mkdir(parents=True, exist_ok=True)
        url = BASE + task + ".wav"
        if shutil.which("curl"):
            subprocess.run(["curl", "-sS", "--fail", "-m", "120", "-o", str(path), url], check=True)
        else:
            with urllib.request.urlopen(url, timeout=120) as response:
                path.write_bytes(response.read())
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise RuntimeError(f"Source {name} ({path}) is not the recorded file")
    rate, data = wavfile.read(path)
    if rate != RATE:
        raise RuntimeError(f"Source {name} is {rate} Hz, expected {RATE}")
    data = data.astype(np.float64) / 32768.0
    return data.mean(axis=1) if data.ndim > 1 else data


def lowpass(samples, hz, order=4):
    return sosfilt(butter(order, hz, btype="lowpass", fs=RATE, output="sos"), samples)


def highpass(samples, hz, order=2):
    return sosfilt(butter(order, hz, btype="highpass", fs=RATE, output="sos"), samples)


def bandpass(samples, low, high, order=2):
    return sosfilt(butter(order, [low, high], btype="bandpass", fs=RATE, output="sos"), samples)


def peak(samples, level=1.0):
    return samples * (level / max(np.max(np.abs(samples)), 1e-9))


def curve(count, begin, end, bend=1.0):
    """From begin to end over count samples, exponentially when both are positive."""
    t = np.linspace(0, 1, count) ** bend
    if begin > 0 and end > 0:
        return begin * (end / begin) ** t
    return begin + (end - begin) * t


def varispeed(samples, rates):
    """Play the source at a changing speed, like a tape: pitch follows speed."""
    position = np.concatenate(([0.0], np.cumsum(rates)[:-1]))
    position = np.clip(position, 0, len(samples) - 1.001)
    index = position.astype(np.int64)
    part = position - index
    return samples[index] * (1 - part) + samples[index + 1] * part


def swept_lowpass(samples, cutoff):
    """Two one-pole low-passes in series whose cutoff changes with every sample."""
    coefficient = 1 - np.exp(-2 * np.pi * np.asarray(cutoff) / RATE)
    out = np.empty_like(samples)
    first = second = 0.0
    for i in range(len(samples)):
        k = coefficient[i]
        first += k * (samples[i] - first)
        second += k * (first - second)
        out[i] = second
    return out


def place(track, mono, when=0.0, level=1.0):
    start = round(when * RATE)
    if start < 0:
        mono, start = mono[-start:], 0
    count = min(len(mono), len(track) - start)
    if count > 0:
        track[start:start + count] += mono[:count] * level


def trim_tail(track, floor_db=-45, hold=.07, release=.12):
    """End the sound shortly after it has fallen to the floor, with a fade."""
    level = np.abs(track)
    above = np.flatnonzero(level > level.max() * 10 ** (floor_db / 20))
    end = min(len(track), int(above[-1]) + round(hold * RATE))
    out = track[:end].copy()
    out *= fade(len(out), 0, release)
    return out


def stereo(mono, width=.16, delay=.011):
    """A little width from a delayed, thinned copy of the sound itself."""
    lag = round(delay * RATE)
    side = np.zeros_like(mono)
    side[lag:] = highpass(mono, 350)[:-lag]
    side *= width
    return np.stack([mono + side, mono - side], axis=1)


def compose(key, src):
    if key == "wipe-charge":
        length = round(1.08 * RATE)
        track = np.zeros(length)
        # The rumble as a tape rise, opening and swelling.
        rise = varispeed(src["rumble"], curve(length, .55, 1.7, 1.25))
        rise = swept_lowpass(rise, curve(length, 170, 5000, 1.6))
        rise *= curve(length, .035, 1.0, .85)
        place(track, peak(rise), 0, .8)
        # Weight underneath: the darker rumble an octave down, rising more slowly.
        under = varispeed(src["low"], curve(length, .8, 1.3))
        under = highpass(lowpass(under, 300), 70, 4) * curve(length, .08, 1.0, .7)
        place(track, peak(under), 0, .32)
        # Air on top, late: the rumble's upper half, faster still.
        air = highpass(varispeed(src["rumble"], curve(length, 1.2, 2.6, 1.4)), 1400)
        air *= curve(length, .004, 1.0, 1.9)
        place(track, peak(air), 0, .5)
        # The whoosh: the hit's sustained noise through a band that climbs.
        noise = src["hit"][round(1.32 * RATE):round(1.32 * RATE) + length].copy()
        whoosh = swept_lowpass(noise, curve(length, 700, 4200, 1.5))
        whoosh = whoosh - swept_lowpass(whoosh, curve(length, 300, 1700, 1.5))
        whoosh *= curve(length, .03, 1.0, 1.1)
        # Most of what a phone speaker plays of the charge is this layer.
        place(track, peak(whoosh), 0, .95)
        # The crack backwards: a breath drawn in, ending where the charge is cut.
        suck = lowpass(src["crack"][:round(.11 * RATE)][::-1].copy(), 5500)
        suck = np.concatenate([np.zeros(round(.19 * RATE)), suck])
        ramp = curve(len(suck), .02, 1.0, 2.4)
        place(track, peak(suck * ramp), 1.08 - len(suck) / RATE - .012, .5)
        track = highpass(track, 78, 4)
        track *= fade(length, .012, .034)
        return stereo(track, .14, .009)
    if key == "wipe-impact":
        length = round(2.2 * RATE)
        track = np.zeros(length)
        onset = round(1.1285 * RATE)
        # Body: the hit from its onset, darkening as it falls away.
        body = src["hit"][onset:onset + round(1.85 * RATE)].copy()
        body = swept_lowpass(body, curve(len(body), 5200, 420, .8))
        t = np.arange(len(body)) / RATE
        body *= np.exp(-t / .6) * fade(len(body), .0015, .2)
        place(track, peak(body), .004, 1.0)
        # Boom: the drone slowed as it plays, kept to the low octaves.
        boom = varispeed(src["drone"], curve(round(1.25 * RATE), 1.05, .6))
        boom = highpass(lowpass(boom, 150), 55, 4)
        t = np.arange(len(boom)) / RATE
        boom *= (1 - np.exp(-t / .006)) * np.exp(-t / .34)
        place(track, peak(boom), 0, .62)
        # Transient: the crack, on the first sample.
        crack = lowpass(src["crack"][round(.024 * RATE):round(.105 * RATE)].copy(), 5200)
        crack *= np.exp(-np.arange(len(crack)) / RATE / .03) * fade(len(crack), .001, .01)
        place(track, peak(crack), 0, .95)
        # The same crack an octave down, for a harder knock in the middle.
        knock = varispeed(src["crack"][round(.02 * RATE):round(.105 * RATE)].copy(), np.full(round(.16 * RATE), .5))
        knock = lowpass(knock, 2400) * np.exp(-np.arange(len(knock)) / RATE / .05) * fade(len(knock), .001, .02)
        place(track, peak(knock), .001, .6)
        # Settling: the hit's ringing second half, quieter and later.
        ring = src["hit"][round(1.9 * RATE):round(2.95 * RATE)].copy()
        ring = bandpass(ring, 220, 2600)
        t = np.arange(len(ring)) / RATE
        ring *= (1 - np.exp(-t / .05)) * np.exp(-t / .55)
        place(track, peak(ring), .42, .26)
        track = np.tanh(track * 1.25) / 1.25
        track = trim_tail(highpass(track, 52, 4), -44, .08, .16)
        return stereo(track, .18, .013)
    if key == "wipe-shatter":
        length = round(.33 * RATE)
        track = np.zeros(length)
        # Its top is taken off: the break repeats once per card, and a phone speaker is small.
        crack = lowpass(src["crack"][round(.022 * RATE):round(.105 * RATE)].copy(), 3400, 6)
        crack *= fade(len(crack), .001, .012)
        place(track, peak(crack), 0, 1.0)
        onset = round(1.1285 * RATE)
        thud = lowpass(src["hit"][onset:onset + round(.12 * RATE)].copy(), 900)
        thud *= np.exp(-np.arange(len(thud)) / RATE / .04)
        place(track, peak(thud), .002, .7)
        grit = lowpass(bandpass(src["grit"][round(.15 * RATE):round(.45 * RATE)].copy(), 900, 3200), 3600, 4)
        for when, level, decay in ((.085, .34, .03), (.17, .2, .04)):
            grain = grit[round(when * RATE):round((when + .11) * RATE)].copy()
            grain *= np.exp(-np.arange(len(grain)) / RATE / decay) * fade(len(grain), .002, .02)
            place(track, peak(grain), when, level)
        track = trim_tail(highpass(track, 70), -42, .03, .04)
        return stereo(track, .12, .006)
    raise KeyError(key)


def master(key, output_dir, sources_dir):
    target, limits, used, description, edit = EFFECTS[key]
    src = {name: fetch(name, sources_dir) for name in used}
    samples = compose(key, src).astype("<f4")
    samples[-round(.012 * RATE):] = 0
    levels = helpers.level_measure(samples)
    # Linear gain only, as in the rest of the pack: the edit's dynamics stay.
    gain = min(10 ** ((target - float(levels["input_i"])) / 20),
               10 ** (-21 / 20) / float(np.sqrt(np.mean(samples ** 2))),
               10 ** (-5 / 20) / float(np.max(np.abs(samples))))
    samples *= gain
    dest = output_dir / f"{key}-v2.mp3"
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
    # The pack's own limits (generate-wipe-sfx.py): headroom, a clean end, no
    # harsh top and no energy a phone speaker cannot play.
    if metrics["truePeakDb"] > -4 or metrics["last2msPeakDb"] > -55 or metrics["quietTailMs"] > 120:
        raise RuntimeError(f"Peak or tail check failed: {key}: {metrics}")
    if metrics["energyAbove6kHzPercent"] > .5 or metrics["energyBelow45HzPercent"] > 2:
        raise RuntimeError(f"Spectral check failed: {key}: {metrics}")
    duration = len(decoded) / RATE
    if not limits[0] <= duration <= limits[1]:
        raise RuntimeError(f"Duration outside target: {key}: {duration}")
    row = {
        "id": key, "eventId": key, "title": key.replace("-", " ").title(),
        "version": 2, "kind": "sfx", "provider": PROVIDER, "model": None,
        "source": "scripts/master-wipe-sfx.py", "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "sourceDependencies": [{"file": HELPER.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(HELPER.read_bytes()).hexdigest()}],
        "sourceRecordings": [{
            "name": name, "taskId": SOURCES[name][1], "sourceUrl": BASE + SOURCES[name][1] + ".wav",
            "prompt": PROMPTS[SOURCES[name][0]], "requestedSeconds": SOURCES[name][2], "sha256": SOURCES[name][3],
        } for name in used],
        "method": "Edited from Fish Audio sound effect generations: varispeed, swept filters, level envelopes and layering in NumPy/SciPy, then linear loudness mastering. " + edit,
        "description": description,
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
    parser.add_argument("--metadata", type=Path, default=ROOT / "output/wipe-sfx/v2.json")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "assets/audio/sfx")
    parser.add_argument("--sources", type=Path, default=ROOT / "output/wipe-sfx/sources")
    args = parser.parse_args()
    rows = [master(key, args.output_dir.resolve(), args.sources.resolve()) for key in args.only or EFFECTS]
    args.metadata.parent.mkdir(parents=True, exist_ok=True)
    args.metadata.write_text(json.dumps({"tracks": rows}, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
