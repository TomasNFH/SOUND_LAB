# Drum Lab build tools

These scripts make Drum Lab's sounds and real drummer grooves. Their output
is committed, so you only need them to change the kit or add a groove.

| Output | Made by | From |
|---|---|---|
| `web/public/drums/kit/*.m4a`, `kit.json` | `build_kit.py` | [Virtuosity Drums](https://versilian-studios.com/virtuosity-drums/), Versilian Studios, CC0 |
| `web/src/drums/grooves.ts` | `build_grooves.py` | [Groove MIDI Dataset](https://magenta.tensorflow.org/datasets/groove), Google, CC BY 4.0 |

Requirements: macOS (`afconvert` decodes the FLAC sources and encodes AAC),
Python 3 with NumPy.

## Rebuild

```sh
tools/drums/build.sh
```

The first run calls `download.sh`, which fetches the sources into
`tools/drums/.cache/` (not committed): the ~110 sample files listed in
`samples.txt` (about 20 MB, out of the 1.1 GB library) and the MIDI-only
Groove MIDI Dataset (about 3 MB).

## How the kit is made

For each hit, `build_kit.py` mixes the close mic (kick or snare), overheads
and room into stereo, trims the silence before the attack, cuts the tail
with a short fade, and encodes AAC at 160 kbps. All strengths of one drum
share one gain (the hi-hat sounds share one too), so a soft hit stays
quieter than a hard one. `kit.json` lists each file with the loudness of its
attack; the app uses it to pick the recording that matches each note.

To add or change hits: edit `KIT` in `build_kit.py`, add the files for all
four mics (`kickmic`, `snaremic`, `oh`, `room`) to `samples.txt`, then
rebuild. The mic gains and maximum lengths are set per drum in `KIT`.

## How grooves are made

`build_grooves.py` cuts two bars from a performance, lines them up with the
bar (`align.py` finds the downbeat from where the snare lands on 2 and 4),
keeps the drummer's timing, maps the Roland note numbers to five drums, and
scales velocities so the loudest snare is full strength.

To add a groove, find clean bars with `grid.py`, which prints a performance
as a step grid with how far it sits from the grid:

```sh
python3 tools/drums/grid.py tools/drums/.cache/groove/drummer7/eval_session/2_funk-groove2_105_beat_4-4.mid 4 2 4
```

The arguments are steps per beat (4 for sixteenths, 3 for a shuffle), first
bar and number of bars. Then add a line to `GROOVES` in `build_grooves.py`
and rebuild. `info.csv` in the dataset lists every performance by style and
tempo.
