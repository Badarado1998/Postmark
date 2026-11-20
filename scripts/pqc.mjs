// ML-DSA-87 helper for the Foundry ffi tests: keygen, sign, verify and the
// bundled test vector, ABI-encoded as hex on stdout.
import { mldsa87 } from "@qorechain/pqc";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { hex } from "./lib/common.mjs";

const bytes = (s) => {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(s)) throw new Error("Expected 0x-prefixed bytes");
  return new Uint8Array(Buffer.from(s.slice(2), "hex"));
};
const word = (n) => BigInt(n).toString(16).padStart(64, "0");
const dynamic = (b) => word(b.length) + hex(b).padEnd(Math.ceil(b.length / 32) * 64, "0");

/** ABI-encode a tuple of dynamic `bytes` values (head offsets, then tails). */
export const tuple = (values) => {
  let offset = values.length * 32;
  const tails = values.map(dynamic);
  const heads = tails.map((tail) => { const h = word(offset); offset += tail.length / 2; return h; });
  return heads.join("") + tails.join("");
};

const VECTOR_FILE = new URL("../test/fixtures/ml-dsa-87.json", import.meta.url);

const operations = {
  keygen([seed]) {
    const { publicKey, secretKey } = mldsa87.keygen(bytes(seed));
    return tuple([publicKey, secretKey]);
  },
  sign: ([secretKey, message]) => tuple([mldsa87.sign(bytes(secretKey), bytes(message))]),
  verify: ([publicKey, signature, message]) =>
    word(mldsa87.verify(bytes(publicKey), bytes(message), bytes(signature))),
  vector() {
    const v = JSON.parse(readFileSync(VECTOR_FILE)).cases[0];
    return tuple([v.publicKey, v.signature, v.message].map((s) => bytes("0x" + s)));
  },
};

/** Run one operation and return its `0x`-prefixed hex result. */
export function run(op, args) {
  if (!Object.hasOwn(operations, op)) throw new Error("Unknown operation");
  return "0x" + operations[op](args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [op, ...args] = process.argv.slice(2);
  process.stdout.write(run(op, args));
}
