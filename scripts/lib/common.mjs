// Small helpers shared by the Postmark CLI scripts.
import { createHash } from 'node:crypto';

export const hex = (b) => Buffer.from(b).toString('hex');
export const toBytes = (h) => Uint8Array.from(Buffer.from(String(h).replace(/^0x/, ''), 'hex'));
export const utf8 = (s) => Uint8Array.from(Buffer.from(s, 'utf8'));
export const sha256hex = (b) => createHash('sha256').update(b).digest('hex');

/** JSON.stringify that renders bigints as decimal strings. */
export const json = (o) => JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);

/** Parse `NAME=value` lines (NAME in [A-Z0-9_]) into an object; other lines are ignored. */
export function parseEnv(text) {
  const vars = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) vars[m[1]] = m[2];
  }
  return vars;
}

/** A `die(msg, code)` that prints `<prefix>: msg` to stderr and exits. */
export const makeDie = (prefix) => (msg, code = 2) => {
  console.error(`${prefix}: ${msg}`);
  process.exit(code);
};
