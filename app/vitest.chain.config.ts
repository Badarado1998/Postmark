import { defineConfig } from "vitest/config";

// Live-diana checks: the message builders are compared to the deployed
// contract's claimMessage/verdictMessage over the public RPC.
export default defineConfig({
  test: {
    include: ["test-chain/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 30000,
  },
});
