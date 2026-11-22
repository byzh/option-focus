// Strategy registry. A strategy implements:
//   { id, name, description, paramSchema, defaultParams, warmupBars(params), detect(candles, params) -> number[] }
// Adding a strategy = adding one entry here; the engine and UI stay unchanged.
import { pocketPivot } from './pocketPivot';

export const STRATEGIES = [pocketPivot];

export function getStrategy(id) {
  return STRATEGIES.find(s => s.id === id) ?? null;
}
