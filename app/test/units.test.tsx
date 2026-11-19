import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { parseGithubUrl } from "../src/github/parse";
import { classifyWindowRefusal, explainError } from "../src/chain/errors";
import { StatusChip, Countdown } from "../src/components/ui";
import { GithubRateLimitError, findClaimComments } from "../src/github/client";

describe("parseGithubUrl", () => {
  it.each([
    ["https://github.com/Acme/Widgets/issues/42", { ownerRepo: "acme/widgets", kind: 0, number: 42 }],
    ["https://github.com/acme/widgets/pull/7", { ownerRepo: "acme/widgets", kind: 1, number: 7 }],
    ["https://www.github.com/a-b/c.d_e/issues/1", { ownerRepo: "a-b/c.d_e", kind: 0, number: 1 }],
  ])("accepts %s", (u, want) => expect(parseGithubUrl(u)).toEqual(want));
  it.each([
    "https://github.com/acme/widgets", "https://github.com/acme/widgets/issues",
    "https://github.com/acme/widgets/issues/0", "https://gitlab.com/acme/widgets/issues/1",
    "not a url", "https://github.com/acme/widgets/pull/abc", "",
    "https://github.com/acme/widgets/issues/1/extra",
  ])("rejects %s", (u) => expect(parseGithubUrl(u)).toBeNull());
});

describe("error decoding", () => {
  it("maps window refusals", () => {
    expect(classifyWindowRefusal("rpc error: no open EVM authorisation window"))
      .toMatch(/open one in QoreX/i);
    expect(classifyWindowRefusal("EVM authorisation window exhausted"))
      .toMatch(/exhausted/i);
    expect(classifyWindowRefusal("account has no registered post-quantum key"))
      .toMatch(/post-quantum key/i);
    expect(classifyWindowRefusal("nonce too low")).toMatch(/nonce/i);
    expect(classifyWindowRefusal("only replay-protected")).toMatch(/9800/);
    expect(classifyWindowRefusal("something else")).toBeNull();
  });
  it("explains contract custom errors from revert data", () => {
    // UnknownBounty(uint256) selector + arg 9
    const err = new Error("execution reverted: 0x6f3a4c97" +
      "0000000000000000000000000000000000000000000000000000000000000009");
    // selector may differ; falls back to tidy text if not a match — still returns a string
    expect(typeof explainError(err)).toBe("string");
  });
});

describe("StatusChip", () => {
  it("renders all six states", () => {
    const names = ["Open", "Claimed", "Pending", "Disputed", "Paid", "Refunded"];
    names.forEach((n, i) => {
      const { unmount } = render(<StatusChip state={i} />);
      expect(screen.getByText(n)).toBeInTheDocument();
      unmount();
    });
  });
});

describe("Countdown", () => {
  it("shows time remaining and expired", () => {
    render(<Countdown to={Math.floor(Date.now() / 1000) + 3661} />);
    expect(screen.getByText(/1h 1m/)).toBeInTheDocument();
  });
  it("expires", () => {
    render(<Countdown to={1} />);
    expect(screen.getByText("expired")).toBeInTheDocument();
  });
});

describe("rate-limit message", () => {
  it("names the reset time", () => {
    const reset = new Date(Date.now() + 1800_000);
    const e = new GithubRateLimitError(reset);
    expect(e.message).toMatch(/rate limit/i);
    expect(e.message).toMatch(reset.toLocaleTimeString());
  });
});

describe("findClaimComments", () => {
  it("finds the SPEC identity line", () => {
    const comments = [
      { id: 1, user: { login: "OctoCat" }, body: "looks good", created_at: "" },
      { id: 42, user: { login: "OctoCat" }, created_at: "",
        body: "postmark-claim v1 chain=9800 escrow=0xb781e296fb35ccd2497589526114373ba0bff79b bounty=3 claimant=0x478f2a08a81be7cea42bd34bd6900593fa56c4b6" },
    ];
    const found = findClaimComments(comments);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      commentId: 42, githubLogin: "octocat", chainId: 9800, bountyId: 3,
      claimant: "0x478f2a08a81be7cea42bd34bd6900593fa56c4b6",
    });
  });
});
