// Minimal BIP-173 bech32 decode for qor1 addresses (same logic as scripts/key-status.mjs).
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
function polymod(vals: number[]): number {
  let chk = 1;
  for (const v of vals) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i]!;
  }
  return chk;
}
function hrpExpand(hrp: string): number[] {
  const out = hrp.split("").map((c) => c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}
const CHARM = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

export function bech32Decode(addr: string): { prefix: string; words: number[] } {
  if (addr.length > 90 || addr !== addr.toLowerCase()) throw new Error("bad bech32 case/length");
  const pos = addr.lastIndexOf("1");
  if (pos < 1) throw new Error("no bech32 separator");
  const prefix = addr.slice(0, pos);
  const data = addr.slice(pos + 1).split("").map((c) => {
    const i = CHARM.indexOf(c);
    if (i < 0) throw new Error(`bad bech32 char ${c}`);
    return i;
  });
  if (polymod([...hrpExpand(prefix), ...data]) !== 1) throw new Error("bech32 checksum mismatch");
  return { prefix, words: data.slice(0, -6) };
}
export function convertBits(data: number[], from: number, to: number, pad: boolean): number[] {
  let acc = 0, bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) { bits -= to; out.push((acc >>> bits) & maxv); }
  }
  if (pad && bits > 0) out.push((acc << (to - bits)) & maxv);
  else if (!pad && (bits >= from || ((acc << (to - bits)) & maxv))) throw new Error("invalid padding");
  return out;
}
export function qorToEvm(addr: string): `0x${string}` {
  const { prefix, words } = bech32Decode(addr);
  if (prefix !== "qor") throw new Error(`expected qor prefix, got ${prefix}`);
  const bytes = convertBits(words, 5, 8, false);
  if (bytes.length !== 20) throw new Error(`expected 20 bytes, got ${bytes.length}`);
  return `0x${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
export function evmToQor(addr: string): string {
  const h = addr.replace(/^0x/, "");
  const bytes: number[] = [];
  for (let i = 0; i < h.length; i += 2) bytes.push(parseInt(h.slice(i, i + 2), 16));
  const words = convertBits(bytes, 8, 5, true);
  const data = [...hrpExpand("qor"), ...words];
  const mod = polymod([...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const chk = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31);
  return `qor1${[...words, ...chk].map((w) => CHARM[w]).join("")}`;
}

/** qorToEvm, or undefined when the input is missing or not a valid qor1 address. */
export function tryQorToEvm(qor: string | null | undefined): `0x${string}` | undefined {
  try { return qor ? qorToEvm(qor) : undefined; } catch { return undefined; }
}
