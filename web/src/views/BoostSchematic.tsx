import { boostValues } from '../audio/boost/boost4558';
import { STOCK_BOOST, type BoostSettings } from '../audio/settings';
import { Cap, Dot, farads, Ground, Label, ohms, OpAmp, Resistor, Wire } from './schematicParts';

type Props = { boost: BoostSettings };

// The complete clean_boost_4558.cir schematic, drawn from the current
// settings: values update live and parts that differ from the netlist are
// highlighted.

// --- The circuit -----------------------------------------------------------

export function BoostSchematic({ boost: b }: Props) {
  const s = STOCK_BOOST;
  const v = boostValues(b);
  const hot = (k: keyof BoostSettings) => b[k] !== s[k];

  // Op-amp U1A: + input at (OA_X, PLUS_Y), − at (OA_X, MINUS_Y), out at (OUT_X, OUT_Y).
  const OA_X = 230;
  const OA_Y = 115;
  const OA_H = 80;
  const PLUS_Y = OA_Y + OA_H * 0.3;
  const MINUS_Y = OA_Y + OA_H * 0.7;
  const OUT_X = OA_X + OA_H * 0.95;
  const OUT_Y = OA_Y + OA_H / 2;
  const NN_X = 200; // inverting-input node
  const FB_Y = 62; // feedback rail above the op-amp
  const VOL_X = 470;
  const volTop = OUT_Y;
  const volBot = 300;
  const wiperY = volTop + (volBot - volTop) * (1 - b.volPos);

  return (
    <svg className="schematic" viewBox="0 0 800 360" role="img" aria-label="Schematic of the JRC4558 clean boost">
      {/* Input jack, C1, R1 to VREF */}
      <circle className="sch-part" cx="24" cy={PLUS_Y} r="6" />
      <Label x={10} y={PLUS_Y - 14}>
        IN
      </Label>
      <Wire d={`M30 ${PLUS_Y} H60`} />
      <Cap x1={60} y1={PLUS_Y} x2={110} y2={PLUS_Y} hot={hot('c1')} />
      <Label x={85} y={PLUS_Y - 16} anchor="middle" hot={hot('c1')}>
        C1 {farads(b.c1)}F
      </Label>
      <Wire d={`M110 ${PLUS_Y} H${OA_X}`} />
      <Dot x={130} y={PLUS_Y} />
      <Resistor x1={130} y1={PLUS_Y} x2={130} y2={PLUS_Y + 80} hot={hot('r1')} />
      <Label x={120} y={PLUS_Y + 38} anchor="end" hot={hot('r1')}>
        R1 {ohms(b.r1)}
      </Label>
      <Label x={120} y={PLUS_Y + 52} anchor="end">
        {b.r1 === s.r1 ? '2 × 3.3M' : ''}
      </Label>
      <Wire d={`M130 ${PLUS_Y + 80} V${PLUS_Y + 92}`} />
      <Label x={130} y={PLUS_Y + 106} anchor="middle">
        VREF
      </Label>

      {/* U1A and its pins */}
      <OpAmp x={OA_X} y={OA_Y} h={OA_H} name="U1A" />
      <text className="sch-pin" x={OA_X - 14} y={PLUS_Y - 4}>
        3
      </text>
      <text className="sch-pin" x={OA_X - 14} y={MINUS_Y - 4}>
        2
      </text>
      <text className="sch-pin" x={OUT_X + 4} y={OUT_Y - 6}>
        1
      </text>
      <Label x={OA_X + 6} y={OA_Y + OA_H + 20}>
        JRC4558 · pin 8 +{b.supply} V · pin 4 gnd
      </Label>

      {/* Feedback: Rgain (gain pot as a variable resistor), R2, C2 */}
      <Wire d={`M${OA_X} ${MINUS_Y} H${NN_X} V${FB_Y} H232`} />
      <Dot x={NN_X} y={MINUS_Y} />
      <Resistor x1={232} y1={FB_Y} x2={292} y2={FB_Y} hot={hot('gainPot')} />
      <path className="sch-part" d={`M248 ${FB_Y + 14} L278 ${FB_Y - 14} M278 ${FB_Y - 14} l-7 1 M278 ${FB_Y - 14} l-1 7`} />
      <Label x={262} y={FB_Y - 20} anchor="middle" hot={hot('gainPot')}>
        Gain A{ohms(b.gainPot)} → {ohms(v.rGain)}
      </Label>
      <Wire d={`M292 ${FB_Y} H${OUT_X + 30} V${OUT_Y}`} />
      <Wire d={`M${NN_X} ${MINUS_Y} V${MINUS_Y + 10}`} />
      <Resistor x1={NN_X} y1={MINUS_Y + 10} x2={NN_X} y2={MINUS_Y + 70} hot={hot('r2')} />
      <Label x={NN_X - 10} y={MINUS_Y + 44} anchor="end" hot={hot('r2')}>
        R2 {ohms(b.r2)}
      </Label>
      <Cap x1={NN_X} y1={MINUS_Y + 70} x2={NN_X} y2={MINUS_Y + 104} hot={hot('c2')} polar="start" />
      <Label x={NN_X - 14} y={MINUS_Y + 91} anchor="end" hot={hot('c2')}>
        C2 {farads(b.c2)}F
      </Label>
      <Ground x={NN_X} y={MINUS_Y + 104} />

      {/* Output: C3 into the volume pot, wiper to the jack */}
      <Wire d={`M${OUT_X} ${OUT_Y} H${OUT_X + 30}`} />
      <Dot x={OUT_X + 30} y={OUT_Y} />
      <Wire d={`M${OUT_X + 30} ${OUT_Y} H390`} />
      <Cap x1={390} y1={OUT_Y} x2={440} y2={OUT_Y} hot={hot('c3')} polar="start" />
      <Label x={415} y={OUT_Y - 16} anchor="middle" hot={hot('c3')}>
        C3 {farads(b.c3)}F
      </Label>
      <Wire d={`M440 ${OUT_Y} H${VOL_X}`} />
      <Resistor x1={VOL_X} y1={volTop} x2={VOL_X} y2={volBot} hot={hot('volPot')} />
      <Ground x={VOL_X} y={volBot} />
      <path className="sch-part" d={`M${VOL_X + 24} ${wiperY} H${VOL_X + 8} M${VOL_X + 8} ${wiperY} l6 -4 M${VOL_X + 8} ${wiperY} l6 4`} />
      <Label x={VOL_X - 10} y={(volTop + volBot) / 2 + 12} anchor="end" hot={hot('volPot')}>
        Volume A{ohms(b.volPot)}
      </Label>
      <Label x={VOL_X - 10} y={(volTop + volBot) / 2 + 26} anchor="end">
        at {Math.round(b.volPos * 100)}%
      </Label>
      <Wire d={`M${VOL_X + 24} ${wiperY} H540`} />
      <circle className="sch-part" cx="546" cy={wiperY} r="6" />
      <Label x={540} y={wiperY - 14}>
        OUT
      </Label>
      <Label x={540} y={wiperY + 22}>
        → amp (1 MΩ)
      </Label>

      {/* Supply: 9 V, C100, VREF divider and C47 */}
      <Label x={580} y={26}>
        Supply
      </Label>
      <Wire d={`M600 54 H740`} />
      <Label x={604} y={48}>
        +{b.supply} V
      </Label>
      <path className={`sch-part ${hot('supply') ? 'hot' : ''}`} d="M600 54 V80 M588 80 H612 M593 87 H607 M588 94 H612 M593 101 H607 M600 101 V126" />
      <Ground x={600} y={126} />
      <Cap x1={680} y1={54} x2={680} y2={126} polar="start" />
      <Label x={664} y={86} anchor="end">
        C100
      </Label>
      <Label x={664} y={99} anchor="end">
        100µF
      </Label>
      <Ground x={680} y={126} />
      <Dot x={680} y={54} />
      <Resistor x1={740} y1={54} x2={740} y2={140} />
      <Label x={750} y={102}>
        RD1 10k
      </Label>
      <Dot x={740} y={140} />
      <Label x={750} y={144}>
        VREF
      </Label>
      <Label x={750} y={157}>
        4.5 V
      </Label>
      <Resistor x1={740} y1={140} x2={740} y2={226} />
      <Label x={750} y={196}>
        RD2 10k
      </Label>
      <Ground x={740} y={226} />
      <Cap x1={700} y1={140} x2={700} y2={226} polar="start" />
      <Wire d={`M700 140 H740`} />
      <Label x={684} y={186} anchor="end">
        C47
      </Label>
      <Label x={684} y={199} anchor="end">
        47µF
      </Label>
      <Ground x={700} y={226} />

      {/* U1B: the unused half, a follower on VREF */}
      <OpAmp x={640} y={262} h={48} name="U1B" />
      <Wire d={`M640 276 H620 V258`} />
      <Label x={604} y={252}>
        VREF
      </Label>
      <Wire d={`M686 286 H700 V320 H630 V296 H640`} />
      <Label x={708} y={300}>
        unused, a
      </Label>
      <Label x={708} y={313}>
        follower on VREF
      </Label>
      <Label x={622} y={340}>
        pins 5, 6, 7
      </Label>
    </svg>
  );
}
