"""Print a GMD performance bar by bar as a step grid, to pick clean loops.
usage: grid.py <midi> <steps_per_beat> <first_bar> <bars>"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from midi import read_notes
from align import align

# Roland TD-11 note numbers used by the Groove MIDI Dataset -> our voices.
VOICE = {
    36: 'kick', 38: 'snare', 40: 'snare', 37: 'xstick',
    42: 'hat', 22: 'hat', 46: 'open', 26: 'open', 44: 'pedal',
    49: 'crash', 55: 'crash', 57: 'crash', 52: 'crash',
    51: 'ride', 59: 'ride', 53: 'bell',
    48: 'tomhi', 50: 'tomhi', 45: 'tomhi', 47: 'tomhi', 43: 'tomlo', 58: 'tomlo',
}
ORDER = ['crash', 'ride', 'bell', 'open', 'hat', 'pedal', 'snare', 'xstick', 'tomhi', 'tomlo', 'kick']

path, spb, first, count = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
notes, bpm = read_notes(path)
offset = align(notes, spb)
notes = [(t - offset, p, v) for t, p, v in notes]
print(path.split('/')[-1], 'bpm', round(bpm, 1), 'offset beats', round(offset, 3))
for bar in range(first, first + count):
    rows = {}
    offs = []
    for t, p, v in notes:
        if not bar * 4 - 0.5 / spb <= t < (bar + 1) * 4 - 0.5 / spb:
            continue
        step = round((t - bar * 4) * spb)
        offs.append((t - bar * 4) * spb - step)
        name = VOICE.get(p, f'?{p}')
        row = rows.setdefault(name, ['.'] * (4 * spb))
        row[step % (4 * spb)] = str(min(9, v * 10 // 128))
    ms = sum(abs(o) for o in offs) / max(1, len(offs)) * 60000 / bpm / spb
    print(f'-- bar {bar}  mean |offset| {ms:.0f} ms')
    for name in ORDER + sorted(set(rows) - set(ORDER)):
        if name in rows:
            cells = ''.join(rows[name])
            print(f'  {name:<6} ' + ' '.join(cells[i:i + spb] for i in range(0, len(cells), spb)))
