"""Mix Virtuosity Drums mic positions into stereo one-shots for the web.
usage: build_kit.py <samples_root> <work_dir> <out_dir>
Needs macOS (afconvert) and NumPy. See README.md."""
import json, os, subprocess, sys, wave
import numpy as np

src, work, out = sys.argv[1:4]
os.makedirs(work, exist_ok=True)
os.makedirs(out, exist_ok=True)
SR = 48000

# voice -> (folder, name pattern, [(layer label, file stem parts)], mic gains, max seconds)
KIT = {
    'kick': ('kick', '{mic}_kick_snoff_vl{v}_rr{r}', [(v, r) for v in range(1, 5) for r in (1, 2)],
             {'kickmic': 1.0, 'oh': 0.7, 'room': 0.45}, 1.0),
    'snare': ('snare', '{mic}_snare_center_vl{v}', [(v, None) for v in (4, 6, 14, 16, 24, 26, 33, 35)],
              {'snaremic': 0.8, 'oh': 0.85, 'room': 0.45}, 0.9),
    'hat': ('hh', '{mic}_hh_closed_vl{v}_rr{r}', [(v, r) for v in range(1, 5) for r in (1, 2)],
            {'snaremic': 0.25, 'oh': 1.0, 'room': 0.35}, 0.45),
    'open': ('hh', '{mic}_hh_open_vl{v}_rr{r}', [(2, 1), (4, 1)],
             {'snaremic': 0.25, 'oh': 1.0, 'room': 0.35}, 1.4),
    'pedal': ('hh', '{mic}_hh_pedal_vl{v}_rr{r}', [(2, 1), (2, 2)],
              {'snaremic': 0.25, 'oh': 1.0, 'room': 0.35}, 0.5),
}


def decode(path):
    wav = os.path.join(work, os.path.basename(path) + '.wav')
    if not os.path.exists(wav):
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI24', path, wav], check=True)
    with wave.open(wav) as w:
        ch, n = w.getnchannels(), w.getnframes()
        raw = np.frombuffer(w.readframes(n), dtype=np.uint8).reshape(-1, 3)
    x = (raw[:, 0].astype(np.int32) | (raw[:, 1].astype(np.int32) << 8) | (raw[:, 2].astype(np.int32) << 16))
    x = np.where(x >= 1 << 23, x - (1 << 24), x).astype(np.float64) / (1 << 23)
    x = x.reshape(-1, ch)
    return np.repeat(x, 2, axis=1) if ch == 1 else x


def mix(folder, pattern, v, r, gains):
    total = None
    for mic, g in gains.items():
        stem = pattern.format(mic=mic, v=v, r=r)
        x = decode(os.path.join(src, mic, folder, stem + '.flac')) * g
        total = x if total is None else total[: len(x)] + x[: len(total)]
    return total


# The hi-hat sounds share one gain: they are the same cymbal on the same mics.
GROUP = {'kick': 'kick', 'snare': 'snare', 'hat': 'hihat', 'open': 'hihat', 'pedal': 'hihat'}
mixed = {voice: [(v, r, mix(folder, pattern, v, r, gains)) for v, r in layers]
         for voice, (folder, pattern, layers, gains, _) in KIT.items()}
loudest = {}
for voice, clips in mixed.items():
    g = GROUP[voice]
    loudest[g] = max(loudest.get(g, 0), max(np.abs(c).max() for _, _, c in clips))

manifest = {}
for voice, (folder, pattern, layers, gains, max_s) in KIT.items():
    clips = mixed[voice]
    entries = []
    for v, r, clip in clips:
        clip = clip / loudest[GROUP[voice]] * 0.89  # one gain per drum keeps soft hits soft
        mono = np.abs(clip).max(axis=1)
        onset = max(0, int(np.argmax(mono > mono.max() * 0.05)) - int(0.002 * SR))
        clip = clip[onset:]
        # End where the tail drops 60 dB below the peak, capped, with a fade.
        env = np.abs(clip).max(axis=1)
        quiet = np.nonzero(env > env.max() * 1e-3)[0]
        end = min(len(clip), int(max_s * SR), int(quiet[-1]) + int(0.02 * SR))
        clip = clip[:end].copy()
        fade = min(end, int(0.04 * SR))
        clip[-fade:] *= np.linspace(1, 0, fade)[:, None]
        peak = float(np.abs(clip).max())
        rms = float(np.sqrt(np.mean(clip[: int(0.05 * SR)] ** 2)))  # attack loudness
        name = f'{voice}-{v}{"-" + str(r) if r else ""}'
        pcm = os.path.join(work, name + '.pcm.wav')
        with wave.open(pcm, 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((np.clip(clip, -1, 1) * 32767).astype('<i2').tobytes())
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '160000', pcm, os.path.join(out, name + '.m4a')], check=True)
        entries.append({'file': name + '.m4a', 'layer': v, 'peak': round(peak, 3), 'level': round(rms, 4), 'seconds': round(end / SR, 3)})
    entries.sort(key=lambda e: e['level'])
    manifest[voice] = entries
    print(voice, [(e['file'], e['level']) for e in entries])

json.dump(manifest, open(os.path.join(out, 'kit.json'), 'w'), indent=1)
