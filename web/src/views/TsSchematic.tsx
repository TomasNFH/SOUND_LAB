import { tsValues } from '../audio/ts4558/ts4558';
import { STOCK_TS4558, type Ts4558Settings } from '../audio/settings';
import { Cap, Diode, Dot, farads, Ground, Label, Npn, ohms, OpAmp, Resistor, Wire } from './schematicParts';

type Props = { ts: Ts4558Settings };

// The complete 4558 mid-hump overdrive, drawn from the current settings:
// values update live and parts that differ from stock are highlighted.
// Bypass switching and the power filtering are left out.

export function TsSchematic({ ts: t }: Props) {
  const s = STOCK_TS4558;
  const v = tsValues(t);
  const hot = (k: keyof Ts4558Settings) => t[k] !== s[k];

  const Y = 174; // signal line, the op-amps' + inputs
  const OA_H = 80;
  const OA_Y = Y - OA_H * 0.3;
  const MINUS_Y = OA_Y + OA_H * 0.7;
  const OUT_Y = OA_Y + OA_H / 2;
  const OA_W = OA_H * 0.95;

  // Input buffer Q1: base at (130, Y), emitter node at (154, E_Y).
  const E_Y = 236;
  // IC1a: + at (A_X, Y), − node N at (N_X, MINUS_Y), output node at A_OUT.
  const A_X = 340;
  const N_X = 310;
  const A_OUT = A_X + OA_W + 24;
  const FB = [52, 88, 124]; // feedback rails: drive, 51 pF, diodes
  // IC1b: + at (B_X, Y), − node at (B_N, MINUS_Y), output node at B_OUT.
  const B_X = 680;
  const B_N = 660;
  const B_OUT = B_X + OA_W + 20;
  const P_X = 640; // + input node, top of the tone pot
  const potTop = 240;
  const potBot = 330;
  const wiperY = potTop + (potBot - potTop) * t.tone;
  const LVL_X = 940;
  const lvlBot = 320;
  const lvlWiper = OUT_Y + (lvlBot - OUT_Y) * (1 - t.level);
  const d = t.diodes;

  return (
    <svg className="schematic" viewBox="0 0 1040 480" role="img" aria-label="Schematic of the mid-hump overdrive built around a JRC4558">
      {/* Input: jack, C_in, R_in to VREF, Q1 emitter follower */}
      <circle className="sch-part" cx="20" cy={Y} r="6" />
      <Label x={8} y={Y - 14}>
        IN
      </Label>
      <Wire d={`M26 ${Y} H40`} />
      <Cap x1={40} y1={Y} x2={88} y2={Y} hot={hot('cIn')} />
      <Label x={64} y={Y - 16} anchor="middle" hot={hot('cIn')}>
        {farads(t.cIn)}F
      </Label>
      <Wire d={`M88 ${Y} H130`} />
      <Dot x={104} y={Y} />
      <Resistor x1={104} y1={Y} x2={104} y2={Y + 76} hot={hot('rIn')} />
      <Label x={96} y={Y + 42} anchor="end" hot={hot('rIn')}>
        {ohms(t.rIn)}
      </Label>
      <Wire d={`M104 ${Y + 76} V${Y + 86}`} />
      <Label x={104} y={Y + 100} anchor="middle">
        VREF
      </Label>
      <Npn x={130} y={Y} name="Q1" />
      <Wire d={`M154 ${Y - 18} V${Y - 50}`} />
      <Label x={154} y={Y - 56} anchor="middle">
        +{t.supply} V
      </Label>
      <Wire d={`M154 ${Y + 18} V${E_Y}`} />
      <Dot x={154} y={E_Y} />
      <Resistor x1={154} y1={E_Y} x2={154} y2={E_Y + 66} />
      <Label x={146} y={E_Y + 38} anchor="end">
        10k
      </Label>
      <Ground x={154} y={E_Y + 66} />

      {/* Coupling cap and IC1a bias */}
      <Wire d={`M154 ${E_Y} H180`} />
      <Cap x1={180} y1={E_Y} x2={228} y2={E_Y} hot={hot('cCouple')} />
      <Label x={204} y={E_Y - 16} anchor="middle" hot={hot('cCouple')}>
        {farads(t.cCouple)}F
      </Label>
      <Wire d={`M228 ${E_Y} H270`} />
      <Dot x={250} y={E_Y} />
      <Resistor x1={250} y1={E_Y} x2={250} y2={E_Y + 66} hot={hot('rBias')} />
      <Label x={242} y={E_Y + 38} anchor="end" hot={hot('rBias')}>
        {ohms(t.rBias)}
      </Label>
      <Wire d={`M250 ${E_Y + 66} V${E_Y + 76}`} />
      <Label x={250} y={E_Y + 90} anchor="middle">
        VREF
      </Label>
      {/* up to the + input, hopping over the feedback node's wire */}
      <Wire d={`M270 ${E_Y} V${Y} H${N_X - 6} a6 6 0 0 1 12 0 H${A_X}`} />

      {/* IC1a, the clipping stage */}
      <OpAmp x={A_X} y={OA_Y} h={OA_H} name="IC1a" />
      <Wire d={`M${A_X} ${MINUS_Y} H${N_X}`} />
      <Dot x={N_X} y={MINUS_Y} />
      <Wire d={`M${N_X} ${MINUS_Y} V${FB[0]} H${N_X + 20}`} />
      <Wire d={`M${A_X + OA_W} ${OUT_Y} H${A_OUT}`} />
      <Dot x={A_OUT} y={OUT_Y} />
      <Wire d={`M${A_OUT} ${OUT_Y} V${FB[0]} H${A_OUT - 30}`} />
      {/* rail 1: R_fixed + drive pot */}
      <Resistor x1={N_X + 20} y1={FB[0]} x2={N_X + 70} y2={FB[0]} hot={hot('rFixed')} />
      <Label x={N_X + 45} y={FB[0] - 14} anchor="middle" hot={hot('rFixed')}>
        {ohms(t.rFixed)}
      </Label>
      <Resistor x1={N_X + 76} y1={FB[0]} x2={A_OUT - 30} y2={FB[0]} hot={hot('drivePot')} />
      <Wire d={`M${N_X + 70} ${FB[0]} H${N_X + 76}`} />
      <path className="sch-part" d={`M${N_X + 88} ${FB[0] + 12} L${N_X + 114} ${FB[0] - 12} l-7 1 M${N_X + 114} ${FB[0] - 12} l-1 7`} />
      <Label x={N_X + 101} y={FB[0] - 14} anchor="middle" hot={hot('drivePot')}>
        Drive A{ohms(t.drivePot)}
      </Label>
      {/* rail 2: C_fb */}
      <Dot x={N_X} y={FB[1]} />
      <Dot x={A_OUT} y={FB[1]} />
      <Wire d={`M${N_X} ${FB[1]} H${N_X + 60}`} />
      <Cap x1={N_X + 60} y1={FB[1]} x2={N_X + 100} y2={FB[1]} hot={hot('cFb')} />
      <Wire d={`M${N_X + 100} ${FB[1]} H${A_OUT}`} />
      <Label x={N_X + 80} y={FB[1] - 13} anchor="middle" hot={hot('cFb')}>
        {farads(t.cFb)}F
      </Label>
      {/* rail 3: the diodes */}
      <Dot x={N_X} y={FB[2]} />
      <Dot x={A_OUT} y={FB[2]} />
      {d === 'none' ? (
        <>
          <Wire d={`M${N_X} ${FB[2]} H${N_X + 40} M${A_OUT - 40} ${FB[2]} H${A_OUT}`} />
          <Label x={(N_X + A_OUT) / 2} y={FB[2] + 4} anchor="middle" hot>
            no diodes
          </Label>
        </>
      ) : (
        <>
          <Wire d={`M${N_X} ${FB[2]} H${N_X + 40} M${N_X + 40} ${FB[2] - 9} V${FB[2] + 9} M${A_OUT - 40} ${FB[2] - 9} V${FB[2] + 9} M${A_OUT - 40} ${FB[2]} H${A_OUT}`} />
          {/* forward pair on top, reverse below (two in series when asymmetric) */}
          <Wire d={`M${N_X + 40} ${FB[2] - 9} H${A_OUT - 40} M${N_X + 40} ${FB[2] + 9} H${A_OUT - 40}`} />
          <Diode x={(N_X + A_OUT) / 2} y={FB[2] - 9} dir={1} hot={hot('diodes')} led={d === 'led'} />
          {d === 'asym' ? (
            <>
              <Diode x={(N_X + A_OUT) / 2 - 12} y={FB[2] + 9} dir={-1} hot />
              <Diode x={(N_X + A_OUT) / 2 + 12} y={FB[2] + 9} dir={-1} hot />
            </>
          ) : (
            <Diode x={(N_X + A_OUT) / 2} y={FB[2] + 9} dir={-1} hot={hot('diodes')} led={d === 'led'} />
          )}
        </>
      )}
      <Label x={A_OUT + 8} y={FB[2] + 4} hot={hot('diodes')}>
        {d === 'si' ? '2 × 1N914' : d === 'ge' ? 'germanium' : d === 'led' ? 'LEDs' : d === 'asym' ? '1 + 2 Si' : ''}
      </Label>
      {/* leg to ground: R_gnd + C_gnd */}
      <Resistor x1={N_X} y1={MINUS_Y} x2={N_X} y2={MINUS_Y + 66} hot={hot('rGnd')} />
      <Label x={N_X - 10} y={MINUS_Y + 40} anchor="end" hot={hot('rGnd')}>
        {ohms(t.rGnd)}
      </Label>
      <Cap x1={N_X} y1={MINUS_Y + 66} x2={N_X} y2={MINUS_Y + 100} hot={hot('cGnd')} />
      <Label x={N_X - 14} y={MINUS_Y + 88} anchor="end" hot={hot('cGnd')}>
        {farads(t.cGnd)}F
      </Label>
      <Wire d={`M${N_X} ${MINUS_Y + 100} V${MINUS_Y + 110}`} />
      <Label x={N_X} y={MINUS_Y + 124} anchor="middle">
        VREF
      </Label>
      <Label x={A_X} y={OA_Y + OA_H + 70}>
        gain ×{v.gain.toFixed(1)} above {Math.round(v.corners.hump)} Hz
      </Label>

      {/* R7 / C6 passive lowpass and R_tone into IC1b */}
      <Wire d={`M${A_OUT} ${OUT_Y} V${Y} H460`} />
      <Resistor x1={460} y1={Y} x2={510} y2={Y} hot={hot('r7')} />
      <Label x={485} y={Y - 14} anchor="middle" hot={hot('r7')}>
        {ohms(t.r7)}
      </Label>
      <Wire d={`M510 ${Y} H560`} />
      <Dot x={530} y={Y} />
      <Cap x1={530} y1={Y} x2={530} y2={Y + 50} hot={hot('c6')} />
      <Label x={538} y={Y + 30} hot={hot('c6')}>
        {farads(t.c6)}F
      </Label>
      <Ground x={530} y={Y + 50} />
      <Resistor x1={560} y1={Y} x2={610} y2={Y} hot={hot('rTone')} />
      <Label x={585} y={Y - 14} anchor="middle" hot={hot('rTone')}>
        {ohms(t.rTone)}
      </Label>
      <Wire d={`M610 ${Y} H${B_X}`} />

      {/* IC1b, the tone stage: tone pot between its inputs, wiper to R8 + C7 */}
      <OpAmp x={B_X} y={OA_Y} h={OA_H} name="IC1b" />
      <Dot x={P_X} y={Y} />
      <Wire d={`M${P_X} ${Y} V${potTop}`} />
      <Resistor x1={P_X} y1={potTop} x2={P_X} y2={potBot} hot={hot('tonePot')} />
      <Wire d={`M${P_X} ${potBot} V${potBot + 16} H${B_N} V${MINUS_Y} H${B_X}`} />
      <Dot x={B_N} y={MINUS_Y} />
      <path className="sch-part" d={`M${P_X - 24} ${wiperY} H${P_X - 8} M${P_X - 8} ${wiperY} l-6 -4 M${P_X - 8} ${wiperY} l-6 4`} />
      <Label x={B_N + 8} y={(potTop + potBot) / 2 + 4} hot={hot('tonePot')}>
        Tone {ohms(t.tonePot)}
      </Label>
      <Label x={B_N + 8} y={(potTop + potBot) / 2 + 18}>
        {t.tone < 0.5 ? 'dark' : t.tone > 0.5 ? 'bright' : 'middle'}
      </Label>
      <Wire d={`M${P_X - 24} ${wiperY} H${P_X - 40} V${potBot + 10}`} />
      <Resistor x1={P_X - 40} y1={potBot + 10} x2={P_X - 40} y2={potBot + 60} hot={hot('r8')} />
      <Label x={P_X - 50} y={potBot + 40} anchor="end" hot={hot('r8')}>
        {ohms(t.r8)}
      </Label>
      <Cap x1={P_X - 40} y1={potBot + 60} x2={P_X - 40} y2={potBot + 90} hot={hot('c7')} />
      <Label x={P_X - 54} y={potBot + 79} anchor="end" hot={hot('c7')}>
        {farads(t.c7)}F
      </Label>
      <Wire d={`M${P_X - 40} ${potBot + 90} V${potBot + 98}`} />
      <Label x={P_X - 40} y={potBot + 112} anchor="middle">
        VREF
      </Label>
      {/* IC1b feedback */}
      <Wire d={`M${B_N} ${MINUS_Y} V${FB[1]} H${B_X + 10}`} />
      <Resistor x1={B_X + 10} y1={FB[1]} x2={B_X + 60} y2={FB[1]} hot={hot('rToneFb')} />
      <Label x={B_X + 35} y={FB[1] - 14} anchor="middle" hot={hot('rToneFb')}>
        {ohms(t.rToneFb)}
      </Label>
      <Wire d={`M${B_X + 60} ${FB[1]} H${B_OUT} V${OUT_Y}`} />
      <Wire d={`M${B_X + OA_W} ${OUT_Y} H${B_OUT}`} />
      <Dot x={B_OUT} y={OUT_Y} />

      {/* Output: C_out, R_out, level pot, Q2 buffer */}
      <Wire d={`M${B_OUT} ${OUT_Y} H800`} />
      <Cap x1={800} y1={OUT_Y} x2={844} y2={OUT_Y} hot={hot('cOut')} />
      <Label x={822} y={OUT_Y - 16} anchor="middle" hot={hot('cOut')}>
        {farads(t.cOut)}F
      </Label>
      <Resistor x1={850} y1={OUT_Y} x2={900} y2={OUT_Y} hot={hot('rOut')} />
      <Wire d={`M844 ${OUT_Y} H850`} />
      <Label x={875} y={OUT_Y - 14} anchor="middle" hot={hot('rOut')}>
        {ohms(t.rOut)}
      </Label>
      <Wire d={`M900 ${OUT_Y} H${LVL_X}`} />
      <Resistor x1={LVL_X} y1={OUT_Y} x2={LVL_X} y2={lvlBot} hot={hot('levelPot')} />
      <Ground x={LVL_X} y={lvlBot} />
      <path className="sch-part" d={`M${LVL_X + 24} ${lvlWiper} H${LVL_X + 8} M${LVL_X + 8} ${lvlWiper} l6 -4 M${LVL_X + 8} ${lvlWiper} l6 4`} />
      <Label x={LVL_X - 10} y={(OUT_Y + lvlBot) / 2 + 4} anchor="end" hot={hot('levelPot')}>
        Level A{ohms(t.levelPot)}
      </Label>
      <Label x={LVL_X - 10} y={(OUT_Y + lvlBot) / 2 + 18} anchor="end">
        at {Math.round(t.level * 100)}%
      </Label>
      <Wire d={`M${LVL_X + 24} ${lvlWiper} H${LVL_X + 40}`} />
      <Label x={LVL_X + 30} y={lvlWiper + 22} anchor="middle">
        Q2 buffer
      </Label>
      <circle className="sch-part" cx={LVL_X + 46} cy={lvlWiper} r="6" />
      <Label x={LVL_X + 34} y={lvlWiper - 14}>
        OUT
      </Label>

      <Label x={8} y={470}>
        JRC4558 (IC1a + IC1b) on +{t.supply} V · VREF = {t.supply / 2} V from a 10k/10k divider · op-amps swing to ±{v.headroom.toFixed(1)} V
      </Label>
    </svg>
  );
}
