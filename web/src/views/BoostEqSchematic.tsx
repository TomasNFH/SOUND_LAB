import { boostEqValues } from '../audio/boost/boostEq';
import { STOCK_BOOST_EQ, type BoostEqSettings } from '../audio/settings';
import { hz } from '../components/parts';
import { Cap, Dot, farads, Ground, Label, ohms, OpAmp, Resistor, Wire } from './schematicParts';

type Props = { eq: BoostEqSettings };

// The complete boost_eq_cortes_bypass_2x4558.cir schematic in two rows,
// drawn from the current settings: values and knob positions update live,
// parts that differ from the netlist are highlighted. Top row: input,
// U2A boost, the cut block and its bypass switch. Bottom row: the U2B
// Baxandall, U1A mids with the U1B gyrator, and the volume.

// A variable resistor's arrow across a resistor centred at (x, y).
const Variable = ({ x, y, vertical }: { x: number; y: number; vertical?: boolean }) =>
  vertical ? (
    <path className="sch-part" d={`M${x - 12} ${y + 14} L${x + 12} ${y - 14} l-7 1 M${x + 12} ${y - 14} l-1 7`} />
  ) : (
    <path className="sch-part" d={`M${x - 14} ${y + 12} L${x + 14} ${y - 12} l-7 1 M${x + 14} ${y - 12} l-1 7`} />
  );

// A pot wiper: a line ending in an arrowhead at (x, y), coming from `dir`.
function Wiper({ x, y, from }: { x: number; y: number; from: 'left' | 'right' | 'above' | 'below' }) {
  const L = 16;
  const d =
    from === 'left'
      ? `M${x - L} ${y} H${x} l-6 -4 M${x} ${y} l-6 4`
      : from === 'right'
        ? `M${x + L} ${y} H${x} l6 -4 M${x} ${y} l6 4`
        : from === 'above'
          ? `M${x} ${y - L} V${y} l-4 -6 M${x} ${y} l4 -6`
          : `M${x} ${y + L} V${y} l-4 6 M${x} ${y} l4 6`;
  return <path className="sch-part" d={d} />;
}

const VrefTag = ({ x, y }: { x: number; y: number }) => (
  <>
    <Wire d={`M${x} ${y} V${y + 8}`} />
    <Label x={x} y={y + 22} anchor="middle">
      VREF
    </Label>
  </>
);

const centred = (v: number) => (Math.abs(v - 0.5) < 0.005 ? 'flat' : `${v > 0.5 ? '+' : '−'}${Math.round(Math.abs(v - 0.5) * 200)}%`);
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function BoostEqSchematic({ eq: e }: Props) {
  const s = STOCK_BOOST_EQ;
  const v = boostEqValues(e);
  const hot = (k: keyof BoostEqSettings) => e[k] !== s[k];

  // --- Top row ---------------------------------------------------------
  const Y1 = 120;
  const A_X = 200; // U2A
  const A_H = 80;
  const A_OUT = 300;
  const N_X = 176; // U2A − node
  const FB = 50;
  const RAIL = 24; // bypass wire
  const LC = 400;
  const LP = 550;
  const POLE_X = 600;
  const POLE_A = 136; // through the cuts
  const POLE_B = 108; // bypassed
  const COM_X = 640;
  const COM_Y = 122;

  // --- Bottom row: Baxandall -------------------------------------------
  const BIN_X = 60;
  const BASS_Y = 330;
  const CAPB_Y = 380;
  const J_Y = 440;
  const TREB_Y = 530;
  const B_X = 400; // U2B
  const B_H = 70;
  const B_Y = J_Y - B_H * 0.7;
  const O2B_X = 490;
  const O2B_Y = B_Y + B_H / 2;

  // --- Bottom row: mids and gyrator -------------------------------------
  const M_Y = O2B_Y; // U1A + input level
  const P_X = 590;
  const NN_X = 660;
  const M_X = 700; // U1A
  const M_Y0 = M_Y - B_H * 0.3;
  const MINUS_M = M_Y0 + B_H * 0.7;
  const O1A_X = 790;
  const O1A_Y = M_Y0 + B_H / 2;
  const RB_Y = 350;
  const midTop = 470;
  const midBot = 550;
  const midWiper = midTop + (midBot - midTop) * e.mid;
  const CH_X = 566; // resonant arm
  const X_Y = 700;
  const GP_Y = 750;
  const G_X = 640; // U1B
  const G_Y0 = GP_Y - B_H * 0.3;
  const G_MINUS = G_Y0 + B_H * 0.7;
  const GO_X = 730;
  const GO_Y = G_Y0 + B_H / 2;

  // --- Output -----------------------------------------------------------
  const VOL_X = 900;
  const volBot = 580;
  const volWiper = O1A_Y + (volBot - O1A_Y) * (1 - e.volPos);

  return (
    <svg className="schematic" viewBox="0 0 1000 890" role="img" aria-label="Schematic of the two-JRC4558 boost with cuts, Baxandall and mids">
      {/* ===== Input, C1, R1 ===== */}
      <circle className="sch-part" cx="20" cy={Y1} r="6" />
      <Label x={8} y={Y1 - 14}>
        IN
      </Label>
      <Wire d={`M26 ${Y1} H40`} />
      <Cap x1={40} y1={Y1} x2={88} y2={Y1} hot={hot('c1')} />
      <Label x={64} y={Y1 - 16} anchor="middle" hot={hot('c1')}>
        C1 {farads(e.c1)}
      </Label>
      <Wire d={`M88 ${Y1} H${N_X - 6} a6 6 0 0 1 12 0 H${A_X}`} />
      <Dot x={104} y={Y1} />
      <Resistor x1={104} y1={Y1} x2={104} y2={Y1 + 70} hot={hot('r1')} />
      <Label x={96} y={Y1 + 40} anchor="end" hot={hot('r1')}>
        R1 {ohms(e.r1)}
      </Label>
      <VrefTag x={104} y={Y1 + 70} />

      {/* ===== U2A boost ===== */}
      <OpAmp x={A_X} y={Y1 - A_H * 0.3} h={A_H} name="U2A" />
      <Wire d={`M${A_X} ${Y1 + A_H * 0.4} H${N_X}`} />
      <Dot x={N_X} y={Y1 + A_H * 0.4} />
      <Wire d={`M${N_X} ${Y1 + A_H * 0.4} V${FB} H${N_X + 20}`} />
      <Resistor x1={N_X + 20} y1={FB} x2={N_X + 88} y2={FB} hot={hot('gainPot')} />
      <Variable x={N_X + 54} y={FB} />
      <Label x={N_X + 54} y={FB - 16} anchor="middle" hot={hot('gainPot')}>
        Boost A{ohms(e.gainPot)} → {ohms(v.rGain)}
      </Label>
      <Wire d={`M${N_X + 88} ${FB} H${A_OUT} V${Y1 + A_H * 0.2}`} />
      <Wire d={`M${A_X + A_H * 0.95} ${Y1 + A_H * 0.2} H${A_OUT}`} />
      <Dot x={A_OUT} y={Y1 + A_H * 0.2} />
      <Dot x={A_OUT} y={FB} />
      <Resistor x1={N_X} y1={Y1 + A_H * 0.4} x2={N_X} y2={Y1 + A_H * 0.4 + 60} hot={hot('r2')} />
      <Label x={N_X - 8} y={Y1 + A_H * 0.4 + 34} anchor="end" hot={hot('r2')}>
        R2 {ohms(e.r2)}
      </Label>
      <Cap x1={N_X} y1={Y1 + A_H * 0.4 + 60} x2={N_X} y2={Y1 + A_H * 0.4 + 94} hot={hot('c2')} polar="start" />
      <Label x={N_X - 14} y={Y1 + A_H * 0.4 + 81} anchor="end" hot={hot('c2')}>
        C2 {farads(e.c2)}
      </Label>
      <Ground x={N_X} y={Y1 + A_H * 0.4 + 94} />

      {/* ===== Cut block ===== */}
      <Wire d={`M${A_OUT} ${POLE_A} H330`} />
      <Cap x1={330} y1={POLE_A} x2={378} y2={POLE_A} hot={hot('clc')} />
      <Label x={354} y={POLE_A - 16} anchor="middle" hot={hot('clc')}>
        CLC {farads(e.clc)}
      </Label>
      <Wire d={`M378 ${POLE_A} H416`} />
      <Dot x={LC} y={POLE_A} />
      <Resistor x1={LC} y1={POLE_A} x2={LC} y2={POLE_A + 44} hot={hot('rlc')} />
      <Label x={LC + 10} y={POLE_A + 26} hot={hot('rlc')}>
        RLC {ohms(e.rlc)}
      </Label>
      <Resistor x1={LC} y1={POLE_A + 50} x2={LC} y2={POLE_A + 110} hot={hot('lowCutPot')} />
      <Wire d={`M${LC} ${POLE_A + 44} V${POLE_A + 50}`} />
      <Variable x={LC} y={POLE_A + 80} vertical />
      <Label x={LC + 16} y={POLE_A + 78} hot={hot('lowCutPot')}>
        Low cut B{ohms(e.lowCutPot)}
      </Label>
      <Label x={LC + 16} y={POLE_A + 92}>
        at {pct(e.lowCut)}
      </Label>
      <VrefTag x={LC} y={POLE_A + 110} />
      <Resistor x1={416} y1={POLE_A} x2={460} y2={POLE_A} hot={hot('rhc')} />
      <Label x={438} y={POLE_A - 14} anchor="middle" hot={hot('rhc')}>
        RHC {ohms(e.rhc)}
      </Label>
      <Wire d={`M460 ${POLE_A} H466`} />
      <Resistor x1={466} y1={POLE_A} x2={530} y2={POLE_A} hot={hot('highCutPot')} />
      <Variable x={498} y={POLE_A} />
      <Label x={498} y={POLE_A - 32} anchor="middle" hot={hot('highCutPot')}>
        High cut B{ohms(e.highCutPot)} · {pct(e.highCut)}
      </Label>
      <Wire d={`M530 ${POLE_A} H${POLE_X - 3}`} />
      <Dot x={LP} y={POLE_A} />
      <Cap x1={LP} y1={POLE_A} x2={LP} y2={POLE_A + 44} hot={hot('chc')} />
      <Label x={LP - 14} y={POLE_A + 26} anchor="end" hot={hot('chc')}>
        CHC {farads(e.chc)}
      </Label>
      <VrefTag x={LP} y={POLE_A + 44} />

      {/* ===== Bypass switch (SPDT) ===== */}
      <Wire d={`M${A_OUT} ${FB} V${RAIL} H${POLE_X} V${POLE_B - 3}`} />
      <Label x={450} y={RAIL - 6} anchor="middle">
        bypass: straight from U2A
      </Label>
      <circle className="sch-part" cx={POLE_X} cy={POLE_B} r="3" />
      <circle className="sch-part" cx={POLE_X} cy={POLE_A} r="3" />
      <circle className="sch-part" cx={COM_X} cy={COM_Y} r="3" />
      <path className={`sch-part ${e.bypass ? 'hot' : ''}`} d={`M${COM_X - 3} ${COM_Y} L${POLE_X + 3} ${e.bypass ? POLE_B : POLE_A}`} />
      <Label x={POLE_X - 6} y={POLE_B - 8} anchor="end">
        B
      </Label>
      <Label x={POLE_X - 6} y={POLE_A + 16} anchor="end">
        A
      </Label>
      <Label x={COM_X + 6} y={COM_Y + 28} hot={e.bypass}>
        SPDT: {e.bypass ? 'cuts bypassed' : 'cuts active'}
      </Label>
      <Wire d={`M${COM_X + 3} ${COM_Y} H690`} />
      <Label x={696} y={COM_Y + 4}>
        BIN ▶ Baxandall (below)
      </Label>

      {/* ===== Supply notes ===== */}
      <Label x={720} y={200}>
        U2 JRC4558: U2A boost · U2B Baxandall
      </Label>
      <Label x={720} y={216}>
        U1 JRC4558: U1A mids · U1B gyrator
      </Label>
      <Label x={720} y={232} hot={hot('supply')}>
        +{e.supply} V with C100 100µ · VREF {e.supply / 2} V
      </Label>
      <Label x={720} y={248}>
        from RD1 / RD2 10k and C47 47µ
      </Label>
      <Label x={720} y={264}>
        op-amps swing ±{v.headroom.toFixed(1)} V around VREF
      </Label>

      {/* ===== U2B Baxandall ===== */}
      <Label x={20} y={BASS_Y - 14}>
        ▶ BIN
      </Label>
      <Wire d={`M28 ${BASS_Y} H${BIN_X} V${TREB_Y}`} />
      <Dot x={BIN_X} y={BASS_Y} />
      {/* bass ladder */}
      <Resistor x1={BIN_X} y1={BASS_Y} x2={120} y2={BASS_Y} hot={hot('rb1')} />
      <Label x={90} y={BASS_Y - 14} anchor="middle" hot={hot('rb1')}>
        RB1 {ohms(e.rb1)}
      </Label>
      <Wire d={`M120 ${BASS_Y} H130`} />
      <Dot x={130} y={BASS_Y} />
      <Resistor x1={130} y1={BASS_Y} x2={250} y2={BASS_Y} hot={hot('bassPot')} />
      <Label x={190} y={BASS_Y - 14} anchor="middle" hot={hot('bassPot')}>
        Bass B{ohms(e.bassPot)} · {centred(e.bass)}
      </Label>
      <Wiper x={190} y={BASS_Y + 8} from="below" />
      <Wire d={`M190 ${BASS_Y + 24} V${CAPB_Y}`} />
      <Dot x={250} y={BASS_Y} />
      <Wire d={`M130 ${BASS_Y} V${CAPB_Y} M250 ${BASS_Y} V${CAPB_Y}`} />
      <Cap x1={130} y1={CAPB_Y} x2={190} y2={CAPB_Y} hot={hot('cb1')} />
      <Cap x1={190} y1={CAPB_Y} x2={250} y2={CAPB_Y} hot={hot('cb2')} />
      <Label x={160} y={CAPB_Y - 13} anchor="middle" hot={hot('cb1')}>
        {farads(e.cb1)}
      </Label>
      <Label x={220} y={CAPB_Y - 13} anchor="middle" hot={hot('cb2')}>
        {farads(e.cb2)}
      </Label>
      <Dot x={190} y={CAPB_Y} />
      <Resistor x1={250} y1={BASS_Y} x2={310} y2={BASS_Y} hot={hot('rb2')} />
      <Label x={280} y={BASS_Y - 14} anchor="middle" hot={hot('rb2')}>
        RB2 {ohms(e.rb2)}
      </Label>
      <Wire d={`M310 ${BASS_Y} H${O2B_X} V${O2B_Y}`} />
      <Resistor x1={190} y1={CAPB_Y} x2={190} y2={J_Y} hot={hot('rb3')} />
      <Label x={198} y={(CAPB_Y + J_Y) / 2 + 4} hot={hot('rb3')}>
        RB3 {ohms(e.rb3)}
      </Label>
      <Dot x={190} y={J_Y} />
      {/* treble ladder */}
      <Cap x1={BIN_X} y1={TREB_Y} x2={124} y2={TREB_Y} hot={hot('ct1')} />
      <Label x={92} y={TREB_Y + 24} anchor="middle" hot={hot('ct1')}>
        CT1 {farads(e.ct1)}
      </Label>
      <Wire d={`M124 ${TREB_Y} H130`} />
      <Resistor x1={130} y1={TREB_Y} x2={250} y2={TREB_Y} hot={hot('treblePot')} />
      <Label x={190} y={TREB_Y + 24} anchor="middle" hot={hot('treblePot')}>
        Treble B{ohms(e.treblePot)} · {centred(e.treble)}
      </Label>
      <Wiper x={190} y={TREB_Y - 8} from="above" />
      <Cap x1={250} y1={TREB_Y} x2={314} y2={TREB_Y} hot={hot('ct2')} />
      <Label x={282} y={TREB_Y + 24} anchor="middle" hot={hot('ct2')}>
        CT2 {farads(e.ct2)}
      </Label>
      <Wire d={`M314 ${TREB_Y} H${O2B_X} V${O2B_Y}`} />
      <Resistor x1={190} y1={J_Y} x2={190} y2={TREB_Y - 24} hot={hot('rt3')} />
      <Label x={198} y={(J_Y + TREB_Y - 24) / 2 + 4} hot={hot('rt3')}>
        RT3 {ohms(e.rt3)}
      </Label>
      {/* the op-amp */}
      <Wire d={`M190 ${J_Y} H${B_X}`} />
      <OpAmp x={B_X} y={B_Y} h={B_H} name="U2B" />
      <Wire d={`M${B_X} ${B_Y + B_H * 0.3} H${B_X - 20}`} />
      <Label x={B_X - 24} y={B_Y + B_H * 0.3 + 4} anchor="end">
        VREF
      </Label>
      <Wire d={`M${B_X + B_H * 0.95} ${O2B_Y} H${O2B_X}`} />
      <Dot x={O2B_X} y={O2B_Y} />

      {/* ===== U1A mids ===== */}
      <Wire d={`M${O2B_X} ${M_Y} H500`} />
      <Resistor x1={500} y1={M_Y} x2={550} y2={M_Y} hot={hot('ra')} />
      <Label x={525} y={M_Y - 14} anchor="middle" hot={hot('ra')}>
        RA {ohms(e.ra)}
      </Label>
      <Wire d={`M550 ${M_Y} H${NN_X - 6} a6 6 0 0 1 12 0 H${M_X}`} />
      <Dot x={P_X} y={M_Y} />
      <OpAmp x={M_X} y={M_Y0} h={B_H} name="U1A" />
      <Wire d={`M${M_X} ${MINUS_M} H${NN_X}`} />
      <Dot x={NN_X} y={MINUS_M} />
      <Wire d={`M${NN_X} ${MINUS_M} V${RB_Y} H690`} />
      <Resistor x1={690} y1={RB_Y} x2={750} y2={RB_Y} hot={hot('rb')} />
      <Label x={720} y={RB_Y - 14} anchor="middle" hot={hot('rb')}>
        RB {ohms(e.rb)}
      </Label>
      <Wire d={`M750 ${RB_Y} H${O1A_X} V${O1A_Y}`} />
      <Wire d={`M${M_X + B_H * 0.95} ${O1A_Y} H${O1A_X}`} />
      <Dot x={O1A_X} y={O1A_Y} />
      {/* mid pot between the inputs, wiper to the resonant arm */}
      <Wire d={`M${P_X} ${M_Y} V${midTop}`} />
      <Resistor x1={P_X} y1={midTop} x2={P_X} y2={midBot} hot={hot('midPot')} />
      <Wire d={`M${P_X} ${midBot} V565 H${NN_X} V${MINUS_M}`} />
      <Label x={P_X + 8} y={(midTop + midBot) / 2 - 4} hot={hot('midPot')}>
        Mid B{ohms(e.midPot)}
      </Label>
      <Label x={P_X + 8} y={(midTop + midBot) / 2 + 10}>
        {centred(e.mid)}
      </Label>
      <Wiper x={P_X - 8} y={midWiper} from="left" />
      <Wire d={`M${CH_X} ${midWiper} V575`} />
      <Resistor x1={CH_X} y1={575} x2={CH_X} y2={612} hot={hot('rq')} />
      <Label x={CH_X - 10} y={597} anchor="end" hot={hot('rq')}>
        RQ {ohms(e.rq)}
      </Label>
      <Wire d={`M${CH_X} 612 V616`} />
      <Resistor x1={CH_X} y1={616} x2={CH_X} y2={660} hot={hot('qPot')} />
      <Variable x={CH_X} y={638} vertical />
      <Label x={CH_X - 16} y={636} anchor="end" hot={hot('qPot')}>
        Q B{ohms(e.qPot)}
      </Label>
      <Label x={CH_X - 16} y={650} anchor="end">
        at {pct(e.width)}
      </Label>
      <Cap x1={CH_X} y1={664} x2={CH_X} y2={694} hot={hot('cres')} />
      <Wire d={`M${CH_X} 660 V664 M${CH_X} 694 V${X_Y}`} />
      <Label x={CH_X - 14} y={683} anchor="end" hot={hot('cres')}>
        CRES {farads(e.cres)}
      </Label>
      <Dot x={CH_X} y={X_Y} />

      {/* ===== U1B gyrator ===== */}
      <Cap x1={CH_X} y1={X_Y} x2={CH_X} y2={GP_Y - 6} hot={hot('ca')} />
      <Wire d={`M${CH_X} ${GP_Y - 6} V${GP_Y}`} />
      <Label x={CH_X - 14} y={X_Y + 27} anchor="end" hot={hot('ca')}>
        CA {farads(e.ca)}
      </Label>
      <Dot x={CH_X} y={GP_Y} />
      <Wire d={`M${CH_X} ${GP_Y} H${G_X}`} />
      <OpAmp x={G_X} y={G_Y0} h={B_H} name="U1B" />
      <Wire d={`M${G_X + B_H * 0.95} ${GO_Y} H${GO_X}`} />
      <Dot x={GO_X} y={GO_Y} />
      <Wire d={`M${GO_X} ${GO_Y} V800 H620 V${G_MINUS} H${G_X}`} />
      <Wire d={`M${CH_X} ${X_Y} H600`} />
      <Resistor x1={600} y1={X_Y} x2={660} y2={X_Y} hot={hot('rs')} />
      <Label x={630} y={X_Y - 14} anchor="middle" hot={hot('rs')}>
        RS {ohms(e.rs)}
      </Label>
      <Wire d={`M660 ${X_Y} H${GO_X} V${GO_Y}`} />
      <Resistor x1={CH_X} y1={GP_Y} x2={CH_X} y2={GP_Y + 40} hot={hot('rf')} />
      <Label x={CH_X - 10} y={GP_Y + 24} anchor="end" hot={hot('rf')}>
        RF {ohms(e.rf)}
      </Label>
      <Wire d={`M${CH_X} ${GP_Y + 40} V${GP_Y + 46}`} />
      <Resistor x1={CH_X} y1={GP_Y + 46} x2={CH_X} y2={GP_Y + 96} hot={hot('freqPot')} />
      <Variable x={CH_X} y={GP_Y + 71} vertical />
      <Label x={CH_X - 16} y={GP_Y + 68} anchor="end" hot={hot('freqPot')}>
        Freq B{ohms(e.freqPot)}
      </Label>
      <Label x={CH_X - 16} y={GP_Y + 82} anchor="end">
        {ohms(v.frec)} used
      </Label>
      <VrefTag x={CH_X} y={GP_Y + 96} />
      <Label x={760} y={740}>
        U1B with CA, RF and RS acts as an
      </Label>
      <Label x={760} y={754}>
        inductor: L = RS · (RF + Freq) · CA
      </Label>
      <Label x={760} y={768}>
        = {v.inductance.toFixed(2)} H, resonating with CRES
      </Label>
      <Label x={760} y={782}>
        at {hz(v.corners.mid)}
      </Label>

      {/* ===== Output ===== */}
      <Wire d={`M${O1A_X} ${O1A_Y} H810`} />
      <Cap x1={810} y1={O1A_Y} x2={858} y2={O1A_Y} hot={hot('c3')} polar="start" />
      <Label x={834} y={O1A_Y - 16} anchor="middle" hot={hot('c3')}>
        C3 {farads(e.c3)}
      </Label>
      <Wire d={`M858 ${O1A_Y} H${VOL_X}`} />
      <Resistor x1={VOL_X} y1={O1A_Y} x2={VOL_X} y2={volBot} hot={hot('volPot')} />
      <Ground x={VOL_X} y={volBot} />
      <Wiper x={VOL_X + 8} y={volWiper} from="right" />
      <Label x={VOL_X - 10} y={(O1A_Y + volBot) / 2 + 4} anchor="end" hot={hot('volPot')}>
        Volume A{ohms(e.volPot)}
      </Label>
      <Label x={VOL_X - 10} y={(O1A_Y + volBot) / 2 + 18} anchor="end">
        at {pct(e.volPos)}
      </Label>
      <Wire d={`M${VOL_X + 24} ${volWiper} H950`} />
      <circle className="sch-part" cx="956" cy={volWiper} r="6" />
      <Label x={944} y={volWiper - 14}>
        OUT
      </Label>
      <Label x={930} y={volWiper + 22}>
        → amp 1M
      </Label>
    </svg>
  );
}
