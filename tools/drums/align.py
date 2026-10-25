"""Find where the bars start in a performance: a small shift so notes sit on
the grid, then which beat is beat 1 (the snare lands on 2 and 4)."""


def align(notes, spb):
    best = None
    for i in range(-50, 50):
        shift = i / 100 / spb  # within half a step either way
        err = 0
        for t, _, v in notes:
            x = (t - shift) * spb
            err += (x - round(x)) ** 2 * v
        if best is None or err < best[0]:
            best = (err, shift)
    shift = best[1]
    scores = []
    for phase in range(4):
        s = 0
        for t, p, v in notes:
            if p in (38, 40):
                beat = round(t - shift - phase)
                if abs(t - shift - phase - beat) < 0.15:
                    s += v if beat % 2 == 1 else -v / 2
        scores.append(s)
    phase = scores.index(max(scores))
    return shift + phase
