import { boostResponseDb, boostValues } from '../audio/boost/boost4558';
import { STOCK_BOOST, type BoostSettings } from '../audio/settings';
import { CompareResponseView } from './CompareResponseView';

// The boost's response: current values vs the netlist.
export function BoostResponseView({ boost }: { boost: BoostSettings }) {
  const c = boostValues(boost).corners;
  return (
    <CompareResponseView
      current={(f) => boostResponseDb(boost, f)}
      stock={(f) => boostResponseDb(STOCK_BOOST, f)}
      marks={[
        [c.input, 'C1·R1'],
        [c.shelfLow, 'C2'],
        [c.output, 'C3'],
        [c.bandwidth, 'GBW'],
      ]}
      dbMin={-24}
      dbMax={36}
    />
  );
}
