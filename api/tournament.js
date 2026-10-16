import { createHandler as createBaseHandler } from './fact-guard.js';
import { runTournament } from '../src/tournament.js';
export { MAX_BYTES, RATE_LIMIT } from './fact-guard.js';
export const MAX_ACTIVE = 2;
export function createHandler(options = {}) {
  return createBaseHandler({ ...options, run: options.run || runTournament, tournament: true });
}
export default createHandler();
