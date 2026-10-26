// The classic 300 W all-tube bass head. The preamp's parts and wiring come
// from J. Fleig's re-drawing of its rack-preamp version's factory
// schematic, published with an LTspice simulation (see the README); part
// names below are that drawing's. The power amp is modelled from published
// figures, not a schematic: six 6550s push-pull, about 695 V B+, 300 W,
// global negative feedback. The response checks against the maker's
// published figures: Bass ±12 dB at 40 Hz, Mid up to ±20 dB, Ultra Lo
// about −20 dB at 600 Hz, Ultra Hi about +15 dB at 8 kHz at half Gain.
//
//   input ─ U3 12AX7 ─ U5 follower ─ Ultra Lo ─ Gain (+Ultra Hi) ─ U1 12AU7 ─ bass / treble ─┐
//   ┌──────────────────────────────────────────────────────────────────────────────────────┘
//   └─ U7 12AX7 ─ U8 12AX7 ─ U9 follower ─┬─ master ─ U10 follower ─ power amp ─ speaker
//          ↑ cathode           midrange:   │
//          └── feedback ── pot + tapped inductor and capacitor at 220 / 800 / 3k
//
// The tubes that clip (U3, U1, the power stage) are curves between three
// linear networks; each network, other tubes included as their small-signal
// gain, is solved exactly from the parts and turned into filter sections.

import { audioTaper, nodeGain, transferPolys, triodeParts, type Filter, type Network, type Part } from '../combo/circuit';
import { toSections } from '../sections';

export type MidFreq = '220' | '800' | '3k';

export interface TubeBassSettings {
  gain: number; // the Volume pot, 0..1
  bass: number; // pots, 0..1, noon flat
  mid: number;
  treble: number;
  midFreq: MidFreq;
  ultraLo: boolean;
  ultraHi: boolean;
  master: number; // 0..1
}

export const DEFAULT_TUBE_BASS: TubeBassSettings = {
  gain: 0.5,
  bass: 0.5,
  mid: 0.5,
  treble: 0.5,
  midFreq: '800',
  ultraLo: false,
  ultraHi: false,
  master: 0.5,
};

// Small-signal constants near these stages' operating points.
const AX7 = { mu: 100, rp: 62.5e3 };
const AU7 = { mu: 17, rp: 7.7e3 };

const S0 = 2 * Math.PI * 1000;

// Pots as two resistors either side of the wiper; `pos` 0..1 is the
// resistance from the wiper to pin 2 as a fraction of the whole.
function pot(name: string, pin1: string, wiper: string, pin2: string, total: number, pos: number): Part[] {
  const r = Math.min(1 - 1e-4, Math.max(1e-4, pos));
  return [
    { kind: 'R', a: pin1, b: wiper, value: (1 - r) * total, name: `${name} upper` },
    { kind: 'R', a: wiper, b: pin2, value: r * total, name: `${name} lower` },
  ];
}

const R = (name: string, a: string, b: string, value: number): Part => ({ kind: 'R', a, b, value, name });
const Cap = (name: string, a: string, b: string, value: number): Part => ({ kind: 'C', a, b, value, name });
const L = (name: string, a: string, b: string, value: number): Part => ({ kind: 'L', a, b, value, name });

// The Ultra Lo switch picks one of these networks between the input buffer
// and the Gain pot (n9 → n68). Position A is flat: 47k into 150k.
// Position D, the twin-T, is the head's Ultra Lo: a deep notch near
// 600 Hz that leaves the lows standing out. The others are the rack
// version's extra settings.
export type UltraLoNetwork = 'A' | 'B' | 'C' | 'D' | 'E';
export function ultraLoParts(pos: UltraLoNetwork): Part[] {
  switch (pos) {
    case 'A':
      return [R('R50', 'n9', 'n68', 47e3), R('R51', 'n68', 'gnd', 150e3)];
    case 'B':
      return [R('R47', 'n9', 'n52', 47e3), Cap('C25', 'n52', 'n54', 0.047e-6), R('R48', 'n54', 'gnd', 150e3), Cap('C26', 'n54', 'n68', 0.01e-6)];
    case 'C':
      return [Cap('C27', 'n9', 'n56', 2.2e-9), R('R49', 'n56', 'gnd', 1e6), Cap('C28', 'n56', 'n68', 2.2e-9)];
    case 'D':
      return [
        R('R52', 'n9', 'n60', 150e3),
        R('R53', 'n60', 'n68', 150e3),
        Cap('C29', 'n60', 'gnd', 2.2e-9),
        Cap('C30', 'n9', 'n63', 2.2e-9),
        Cap('C31', 'n63', 'n68', 2.2e-9),
        R('R54', 'n63', 'gnd', 68e3),
      ];
    case 'E':
      return [R('R55', 'n9', 'n68', 150e3), Cap('C32', 'n68', 'n66', 0.01e-6), R('R56', 'n66', 'gnd', 68e3)];
  }
}

// Input stage to U1's grid: U3 (12AX7, unbypassed 3.32k cathode, 221k
// plate) direct into U5 (12AU7 follower), C3 into the line and tuner taps,
// Ultra Lo, then the Gain pot (1M audio) with the Ultra Hi bright cap.
// Driven at U3's grid, after its clipping curve.
export function inputNetwork(s: TubeBassSettings, ultraLo: UltraLoNetwork = s.ultraLo ? 'D' : 'A'): Network {
  const parts: Part[] = [
    ...triodeParts('U3', 'p3', 'g3', 'k3', AX7.mu, AX7.rp),
    R('R11', 'k3', 'gnd', 3.32e3),
    R('R12', 'p3', 'gnd', 221e3), // to B+, which is ground for signal
    ...triodeParts('U5', 'gnd', 'p3', 'k5', AU7.mu, AU7.rp),
    R('R13', 'k5', 'gnd', 47e3),
    Cap('C3', 'k5', 'n9', 0.68e-6),
    R('R24+R27', 'n9', 'gnd', 160e3), // line out tap
    R('R25+R26', 'n9', 'gnd', 230e3), // tuner tap
    ...ultraLoParts(ultraLo),
    ...pot('U2 gain', 'n68', 'g1', 'gnd', 1e6, audioTaper(s.gain)),
  ];
  // Ultra Hi: C24 across the top of the Gain pot.
  if (s.ultraHi) parts.push(Cap('C24', 'n68', 'g1', 470e-12));
  return { parts, input: 'g3', sourceR: 1 };
}

// The selected tap of the tapped toroid (cumulative 100 / 300 / 800 mH)
// and the capacitor that tunes it. At 220 Hz the 800 mH tap goes straight
// to ground and C13 / C14 tune it.
const MID_TAPS: Record<MidFreq, { l: number; c: number | null }> = {
  '3k': { l: 0.1, c: 0.033e-6 },
  '800': { l: 0.3, c: 0.15e-6 },
  '220': { l: 0.8, c: null },
};

// U1's grid to the Main output, one network because nothing between
// clips hard and the parts interact: U7's grid resistor R17 returns to its
// cathode circuit, which the midrange feedback drives.
//
// U1 (12AU7): 3.3k cathode with C5 into R2 || C4 (the stock network; the
// rack version's extra switch that grounds C5 is not on the head and is
// left out). Into the passive bass / treble network, both pots 1M audio. Then
// U7 (12AX7) → C12 → U8 (12AX7) → U9 (12AU7 follower), R34 feeding U9's
// output back to U7's cathode, and the midrange pot (50k linear) between
// U7's cathode and U9's output with its wiper into the tuned inductor.
// Then master (250k linear) and U10 (follower).
//
// Capacitors whose corners sit far below hearing are wires here: C2, C5,
// C11, C15, C16, C19 (all under ~7 Hz). Leaving them in only adds poles a
// few hertz from zero, which cost precision and change nothing audible;
// C12 (16 Hz) stays. C17 and U13 feed the post-EQ jack only.
export function postNetwork(s: TubeBassSettings): Network {
  const tap = MID_TAPS[s.midFreq];
  const parts: Part[] = [
    ...triodeParts('U1', 'p1', 'g1', 'k1', AU7.mu, AU7.rp),
    R('R1', 'p1', 'gnd', 47e3),
    R('R3', 'k1', 'gnd', 3.3e3),
    R('R2', 'k1', 'gnd', 100e3), // through C5
    Cap('C4', 'k1', 'gnd', 2.2e-9), // through C5
    R('R7', 'p1', 'n14', 220e3), // through C2
    Cap('C6', 'p1', 'n15', 470e-12), // through C2
    Cap('C7', 'n14', 'n16', 0.001e-6),
    Cap('C8', 'n16', 'n18', 0.01e-6),
    R('R14', 'n18', 'gnd', 22e3),
    ...pot('U6 bass', 'n14', 'n16', 'n18', 1e6, audioTaper(s.bass)),
    R('R10', 'n16', 'n17', 100e3),
    ...pot('U4 treble', 'n15', 'n17', 'n19', 1e6, audioTaper(s.treble)),
    Cap('C9', 'n19', 'gnd', 0.0047e-6),
    Cap('C10', 'n17', 'n19', 47e-12),
    R('R17', 'n17', 'n21', 475e3), // from g7, through C11

    ...triodeParts('U7', 'p7', 'n17', 'k7', AX7.mu, AX7.rp),
    R('R19', 'p7', 'gnd', 220e3),
    R('R18', 'k7', 'n21', 560),
    R('R15||R16', 'n21', 'gnd', 7.67e3),
    Cap('C12', 'p7', 'g8', 0.01e-6),
    R('R22', 'g8', 'gnd', 1e6),
    ...triodeParts('U8', 'p8', 'g8', 'k8', AX7.mu, AX7.rp),
    R('R21', 'k8', 'gnd', 3.3e3),
    R('R20', 'p8', 'gnd', 470e3),
    ...triodeParts('U9', 'gnd', 'p8', 'k9', AU7.mu, AU7.rp),
    R('R23', 'k9', 'n29', 39e3),
    R('R30+R31', 'n29', 'gnd', 13.6e3),
    R('R34', 'k9', 'k7', 56e3),
    Cap('C14', 'k7', 'n32', 0.68e-6),
    R('R32', 'n32', 'n33', 470),
    ...pot('U11 mid', 'n33', 'n44', 'n34', 50e3, s.mid),
    R('R33', 'n34', 'n31', 825),
    Cap('C13', 'n31', 'n29', 0.68e-6),
    L('toroid', 'n44', 'lt', tap.l),
    // 1 Ω winding resistance, as in the simulation.
    R('DCR', 'lt', tap.c === null ? 'gnd' : 'lc', 1),
    ...pot('U12 master', 'n29', 'g10', 'gnd', 250e3, s.master),
    ...triodeParts('U10', 'gnd', 'g10', 'k10', AU7.mu, AU7.rp),
    R('R35', 'k10', 'n37', 1.5e3),
    R('R36', 'n37', 'gnd', 47e3),
    R('R37', 'g10', 'n37', 220e3),
    R('R42', 'k10', 'gnd', 220e3), // Main output load
  ];
  if (tap.c !== null) parts.push(Cap('mid cap', 'lc', 'gnd', tap.c));
  return { parts, input: 'g1', sourceR: 1 };
}

// ---------------------------------------------------------------------------
// Clipping points and the power amp

// Input-referred clipping of a stage: grid conduction when the grid
// reaches the cathode bias, which an unbypassed cathode resistor spreads
// over a bigger input swing (by 1 + (mu + 1)·Rk / (Ra + rp)).
const headroom = (vk: number, mu: number, rp: number, ra: number, rk: number) => vk * (1 + ((mu + 1) * rk) / (ra + rp));

// U3: about 0.55 mA through 3.32k. U1: about 2 mA through 3.3k.
const U3_CLIP = headroom(1.8, AX7.mu, AX7.rp, 221e3, 3.32e3);
const U1_CLIP = headroom(6.5, AU7.mu, AU7.rp, 47e3, 3.3e3);

// Power amp: 300 W into 4 Ω is 49 V peak at the speaker. Closed-loop gain
// 30 from the Main output (1.6 V peak for full power) with about 19 dB of
// negative feedback; the 6550 grids clip near their 50 V bias.
export const SPEAKER_PEAK = 49;
const PA_GAIN = 30;
const PA_FORWARD = 300;
const PA_BETA = (PA_FORWARD / PA_GAIN - 1) / PA_FORWARD;
const GRID_CLIP = 50;
// The output transformer sits inside the feedback loop, so its roll-offs
// are first order: a second-order low end would turn the feedback positive
// below a few hertz and the loop would oscillate ("motorboating"), which
// real designs avoid the same way, by keeping the loop's phase shift under
// 180 degrees where it still has gain.
const OT_HP = 12; // Hz: a big output transformer
const OT_LP = 15000;
// Compensation: a roll-off in the driver stages that takes the loop gain
// under 1 (about 26 kHz) long before the loop's phase runs out; without it
// the loop oscillates. The closed loop still reaches past 20 kHz.
const DRIVER_LP = 3000;

export type TubeBassParams = {
  u3: { vpos: number; vneg: number };
  netIn: Filter[];
  u1: { vpos: number; vneg: number };
  netPost: Filter[];
  // drive: forward gain to the 6550 grids; beta: feedback from the speaker;
  // grid: grid clipping, volts; speaker: speaker peak at that point; plate:
  // the ceiling the supply allows, which sags by up to `sag`.
  pa: { drive: number; beta: number; grid: number; speaker: number; plate: number; sag: number };
  driver: Filter[];
  ot: Filter[];
  outScale: number;
};

const sections = (net: Network, node: string, fs: number) => {
  const { num, den } = transferPolys(net, node, S0);
  return toSections(num, den, fs, S0);
};

export function tubeBassParams(s: TubeBassSettings, fsOversampled: number): TubeBassParams {
  const fs = fsOversampled;
  const wh = (2 * Math.PI * OT_HP) / S0;
  const otHp = toSections([0, 1], [wh, 1], fs, S0);
  const otLp = toSections([1], [1, S0 / (2 * Math.PI * OT_LP)], fs, S0);
  return {
    u3: { vpos: U3_CLIP, vneg: U3_CLIP * 1.15 },
    netIn: sections(inputNetwork(s), 'g1', fs),
    u1: { vpos: U1_CLIP, vneg: U1_CLIP * 1.15 },
    netPost: sections(postNetwork(s), 'k10', fs),
    pa: { drive: PA_FORWARD, beta: PA_BETA, grid: GRID_CLIP, speaker: SPEAKER_PEAK, plate: SPEAKER_PEAK * 1.05, sag: 0.1 },
    driver: toSections([1], [1, S0 / (2 * Math.PI * DRIVER_LP)], fs, S0),
    ot: [...otHp, ...otLp],
    outScale: 1 / SPEAKER_PEAK,
  };
}

// Small-signal response of the preamp (input jack to Main), in dB.
export function preampResponseDb(s: TubeBassSettings, freqs: number[], ultraLo?: UltraLoNetwork) {
  const a = inputNetwork(s, ultraLo);
  const b = postNetwork(s);
  return freqs.map((f) => {
    const w = 2 * Math.PI * f;
    const g = nodeGain(a, 'g1', w);
    const h = nodeGain(b, 'k10', w);
    return 20 * Math.log10(Math.max(1e-12, Math.hypot(g.re, g.im) * Math.hypot(h.re, h.im)));
  });
}
