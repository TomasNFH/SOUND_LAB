"""Minimal Standard MIDI File reader: note-ons with absolute time in beats."""
import struct


def _varlen(data, i):
    value = 0
    while True:
        b = data[i]
        i += 1
        value = (value << 7) | (b & 0x7F)
        if not b & 0x80:
            return value, i


def read_notes(path):
    data = open(path, 'rb').read()
    assert data[:4] == b'MThd'
    _, ntracks, division = struct.unpack('>HHH', data[8:14])
    i = 14
    notes, tempos = [], []
    for _ in range(ntracks):
        assert data[i:i + 4] == b'MTrk'
        length = struct.unpack('>I', data[i + 4:i + 8])[0]
        j, end = i + 8, i + 8 + length
        tick, status = 0, 0
        while j < end:
            delta, j = _varlen(data, j)
            tick += delta
            b = data[j]
            if b == 0xFF:
                kind = data[j + 1]
                n, k = _varlen(data, j + 2)
                if kind == 0x51:
                    tempos.append((tick, int.from_bytes(data[k:k + 3], 'big')))
                j = k + n
                continue
            if b in (0xF0, 0xF7):
                n, k = _varlen(data, j + 1)
                j = k + n
                continue
            if b & 0x80:
                status = b
                j += 1
            kind = status & 0xF0
            if kind in (0xC0, 0xD0):
                j += 1
                continue
            d1, d2 = data[j], data[j + 1]
            j += 2
            if kind == 0x90 and d2 > 0:
                notes.append((tick / division, d1, d2))
        i = end
    notes.sort()
    bpm = 60_000_000 / tempos[0][1] if tempos else 120
    return notes, bpm
