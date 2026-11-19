import { mldsa87 } from '@qorechain/pqc';
import { readFileSync } from 'node:fs';

const [op, ...args] = process.argv.slice(2);
const bytes = (s) => {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(s)) throw new Error('Expected 0x-prefixed bytes');
  return new Uint8Array(Buffer.from(s.slice(2), 'hex'));
};
const hex = (b) => Buffer.from(b).toString('hex');
const word = (n) => BigInt(n).toString(16).padStart(64, '0');
const dynamic = (b) => word(b.length) + hex(b).padEnd(Math.ceil(b.length / 32) * 64, '0');
const tuple = (values) => {
  let offset = values.length * 32;
  const tails = values.map(dynamic);
  const heads = tails.map((tail) => { const h = word(offset); offset += tail.length / 2; return h; });
  return heads.join('') + tails.join('');
};
let result;
switch (op) {
  case 'keygen': {
    const { publicKey, secretKey } = mldsa87.keygen(bytes(args[0]));
    result = tuple([publicKey, secretKey]);
    break;
  }
  case 'sign': result = tuple([mldsa87.sign(bytes(args[0]), bytes(args[1]))]); break;
  case 'verify': result = word(mldsa87.verify(bytes(args[0]), bytes(args[2]), bytes(args[1]))); break;
  case 'vector': {
    const v = JSON.parse(readFileSync(new URL('../test/fixtures/ml-dsa-87.json', import.meta.url))).cases[0];
    result = tuple([v.publicKey, v.signature, v.message].map((s) => bytes('0x' + s)));
    break;
  }
  default: throw new Error('Unknown operation');
}
process.stdout.write('0x' + result);
