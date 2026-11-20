export function bech32Decode(addr: string): { prefix: string; words: number[] };
export function convertBits(data: number[], from: number, to: number, pad: boolean): number[];
export function qorToEvm(addr: string): `0x${string}`;
export function evmToQor(addr: string): string;
export function tryQorToEvm(qor: string | null | undefined): `0x${string}` | undefined;
