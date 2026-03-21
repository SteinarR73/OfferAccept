// Minimal stub for pg-boss — prevents ESM parse errors in Jest's CJS environment.
// Tests that need pg-boss functionality should mock it directly.
import { EventEmitter } from 'events';

class PgBoss extends EventEmitter {
  start = jest.fn().mockResolvedValue(undefined);
  stop = jest.fn().mockResolvedValue(undefined);
  createQueue = jest.fn().mockResolvedValue(undefined);
  send = jest.fn().mockResolvedValue('job_id');
  work = jest.fn().mockResolvedValue(undefined);
  schedule = jest.fn().mockResolvedValue(undefined);
}

export default PgBoss;
export { PgBoss };
export type SendOptions = Record<string, unknown>;
