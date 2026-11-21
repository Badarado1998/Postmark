import { describe, it, expect, vi } from "vitest";
import { ESCROW_ADDRESS } from "../../src/chain/config";

const sdk = vi.hoisted(() => ({
  openEvmWindowMsg: vi.fn((p: unknown) => ({ typeUrl: "/qorechain.pqc.v1.MsgOpenEVMWindow", value: p })),
  encode: vi.fn(() => new Uint8Array([9, 8, 7])),
}));
vi.mock("@qorechain/sdk", () => ({
  openEvmWindowMsg: sdk.openEvmWindowMsg,
  qorechainRegistry: () => ({ encode: sdk.encode }),
}));

import {
  WINDOW_BLOCKS, WINDOW_FEE_MARGIN_UQOR, WINDOW_MAX_TXS, canEnableTransactions, enableTransactions, windowRequest,
} from "../../src/wallet/enableTransactions";

describe("window request", () => {
  it("scopes the window to the escrow with 2000 blocks and 10 txs", () => {
    const r = windowRequest("qor1abc", 0n);
    expect(r).toMatchObject({ sender: "qor1abc", blocks: 2000n, maxTxs: 10n, allowedTargets: [ESCROW_ADDRESS] });
    expect([WINDOW_BLOCKS, WINDOW_MAX_TXS]).toEqual([2000n, 10n]);
  });
  it("adds the needed value (in uqor) to the fee margin", () => {
    expect(windowRequest("qor1abc", 0n).maxValue).toBe(WINDOW_FEE_MARGIN_UQOR.toString());
    expect(windowRequest("qor1abc", 55n * 10n ** 16n).maxValue).toBe((550_000n + WINDOW_FEE_MARGIN_UQOR).toString());
  });
});

describe("enableTransactions", () => {
  it("encodes MsgOpenEVMWindow and sends it through QoreX signAndBroadcast", async () => {
    const native = {
      enable: vi.fn().mockResolvedValue(undefined),
      signAndBroadcast: vi.fn().mockResolvedValue({ txHash: "abcd", code: 0, shield: "pending" }),
    };
    const res = await enableTransactions(native as never, "qor1abc", 10n ** 17n);
    expect(res.code).toBe(0);
    expect(sdk.openEvmWindowMsg).toHaveBeenCalledWith(expect.objectContaining({
      sender: "qor1abc", blocks: 2000n, maxTxs: 10n, allowedTargets: [ESCROW_ADDRESS] }));
    expect(native.enable).toHaveBeenCalledWith("qorechain-diana");
    expect(native.signAndBroadcast).toHaveBeenCalledWith({
      chainId: "qorechain-diana",
      messages: [{ typeUrl: "/qorechain.pqc.v1.MsgOpenEVMWindow", value: new Uint8Array([9, 8, 7]) }],
    });
  });
  it("only offers itself when QoreX can sign and broadcast", () => {
    expect(canEnableTransactions({ capabilities: ["signAndBroadcast"] } as never)).toBe(true);
    expect(canEnableTransactions({ capabilities: ["signArbitrary"] } as never)).toBe(false);
    expect(canEnableTransactions(null)).toBe(false);
  });
});
