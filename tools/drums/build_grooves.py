"""Cut 2-bar loops from Groove MIDI Dataset performances into a TS module.
usage: build_grooves.py <gmd_root> <out.ts>
To add a groove, find clean bars with grid.py, then add a line to GROOVES."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from midi import read_notes
from align import align

VOICE = {36: 'kick', 38: 'snare', 40: 'snare', 42: 'hat', 22: 'hat', 46: 'open', 26: 'open', 44: 'pedal'}

GROOVES = [
    # id, label, description, file, steps per beat, first bar
    ('rock', 'Rock', 'Straight eighths with a busy kick.', 'drummer9/session1/25_rock_90_beat_4-4.mid', 4, 4),
    ('pop', 'Pop', 'Steady eighths, four on the floor feel.', 'drummer8/eval_session/7_pop-groove7_138_beat_4-4.mid', 4, 2),
    ('funk', 'Funk', 'Sixteenth-note kick, open hi-hat on the and of 3.', 'drummer7/eval_session/2_funk-groove2_105_beat_4-4.mid', 4, 2),
    ('shuffle', 'Shuffle', 'Rock shuffle with ghost notes on the snare.', 'drummer8/session1/21_rock-shuffle_112_beat_4-4.mid', 3, 5),
]

root, out = sys.argv[1], sys.argv[2]
items = []
for gid, label, desc, path, spb, first in GROOVES:
    notes, bpm = read_notes(os.path.join(root, path))
    offset = align(notes, spb)
    start = first * 4
    events, dropped = [], {}
    for t, p, v in notes:
        beat = t - offset - start
        if not -0.5 / spb <= beat < 8 - 0.5 / spb:
            continue
        if p not in VOICE:
            dropped[p] = dropped.get(p, 0) + 1
            continue
        events.append([round(beat, 4), VOICE[p], v])
    # Scale so the loudest backbeat is full strength: drummers recorded at
    # different levels, and the snare is what sets how loud a groove feels.
    top = max(v for _, voice, v in events if voice == 'snare')
    events = [[b, voice, round(min(1, v / top), 3)] for b, voice, v in events]
    drummer = path.split('/')[0].replace('drummer', 'Drummer ')
    items.append({'id': gid, 'label': label, 'description': desc, 'bpm': round(bpm), 'beats': 8, 'stepsPerBeat': spb,
                  'source': f'{drummer}, {os.path.basename(path)}', 'events': events})
    print(gid, len(events), 'events, dropped', dropped)

def fmt(g):
    head = ',\n'.join(f'    {json.dumps(k)}: {json.dumps(v)}' for k, v in g.items() if k != 'events')
    rows = ',\n'.join('      ' + json.dumps(e) for e in g['events'])
    return '  {\n' + head + ',\n    "events": [\n' + rows + '\n    ]\n  }'


body = '[\n' + ',\n'.join(fmt(g) for g in items) + '\n]'
open(out, 'w').write(
    '// Generated from the Groove MIDI Dataset (Google, CC BY 4.0): two bars cut\n'
    '// from real drummers\' performances, timing and dynamics as played.\n'
    '// [beat from loop start, voice, velocity 0-1]. Do not edit by hand.\n'
    "import type { Groove } from './patterns';\n\n"
    f'export const GROOVES: Groove[] = {body};\n'
)
