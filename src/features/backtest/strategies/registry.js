// Strategy registry. A strategy implements:
//   { id, name, description, help: string[], paramSchema, defaultParams,
//     warmupBars(params), detect(candles, params) -> number[] }
// Optional, for strategies with their own exit rule (enables trade simulation):
//   makeExitRule(candles, params) -> (signalIdx) => exitIdx | null
//   maxHoldBars(params) -> number
// Adding a strategy = adding one entry here; the engine and UI stay unchanged.
import { rsi2Pullback } from './rsi2Pullback';
import { pocketPivot } from './pocketPivot';

export const STRATEGIES = [rsi2Pullback, pocketPivot];

export function getStrategy(id) {
  return STRATEGIES.find(s => s.id === id) ?? null;
}
