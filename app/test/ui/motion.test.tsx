import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatQor } from "../../src/components/qor";

const state = vi.hoisted(() => ({ reduce: true }));
vi.mock("motion/react", async (orig) => ({
  ...(await orig<typeof import("motion/react")>()),
  useReducedMotion: () => state.reduce,
}));
vi.mock("../../src/components/reactbits/LogoLoop", () => ({
  default: ({ logos, ariaLabel }: { logos: { title: string }[]; ariaLabel: string }) => (
    <div role="region" aria-label={ariaLabel}>
      <ul>{logos.map((l) => <li key={l.title}>{l.title}</li>)}</ul>
      <ul aria-hidden="true">{logos.map((l) => <li key={l.title}>{l.title}</li>)}</ul>
    </div>
  ),
}));

import {
  AnimatedQor, BlurHeadline, CountText, ScrambleText, TextMarquee, countProps,
} from "../../src/components/motion";

beforeEach(() => { state.reduce = true; });

describe("reduced motion renders final content", () => {
  it("BlurHeadline shows the full headline with the accent word", () => {
    render(<h1><BlurHeadline line1="Bounties pay when" line2="the work is" accent="verified" tail="." accentClass="text-deep" /></h1>);
    expect(screen.getByRole("heading")).toHaveTextContent("Bounties pay when the work is verified.");
    expect(screen.getByText("verified")).toHaveClass("text-deep");
  });
  it("ScrambleText shows the real value", () => {
    render(<ScrambleText text="0xabc123" />);
    expect(screen.getByText("0xabc123")).toBeInTheDocument();
  });
  it("CountText shows its final value", () => {
    render(<CountText text="2.56" suffix=" x" />);
    expect(screen.getByText("2.56 x")).toBeInTheDocument();
  });
  it("AnimatedQor equals formatQor and keeps the exact tooltip", () => {
    const wei = 2_560_000_000_000_000_000n;
    render(<AnimatedQor wei={wei} />);
    expect(screen.getByTitle(/2.56 QOR \(2560000000000000000 wei\)/)).toHaveTextContent(`${formatQor(wei)} QOR`);
  });
  it("TextMarquee shows one static labelled list", () => {
    render(<TextMarquee items={["a", "b"]} ariaLabel="Built on" />);
    expect(screen.getByRole("list", { name: "Built on" }).querySelectorAll("li")).toHaveLength(2);
  });
});

describe("animated path", () => {
  beforeEach(() => { state.reduce = false; });
  it("BlurHeadline exposes the real text to assistive tech", () => {
    render(<h1><BlurHeadline line1="Bounties" line2="pay" accent="verified" tail="." accentClass="text-deep" /></h1>);
    expect(screen.getByRole("heading", { name: "Bounties pay verified." })).toBeInTheDocument();
  });
  it("CountText exposes the final value and hides the counter", () => {
    const { container } = render(<CountText text="18" />);
    expect(container.querySelector(".sr-only")).toHaveTextContent("18");
    expect(container.querySelector("[aria-hidden]")).not.toBeNull();
  });
  it("TextMarquee duplicates are aria-hidden", async () => {
    const { container } = render(<TextMarquee items={["a", "b"]} ariaLabel="Built on" />);
    expect(await screen.findByRole("region", { name: "Built on" })).toBeInTheDocument();
    expect(container.querySelectorAll('ul[aria-hidden="true"]')).toHaveLength(1);
  });
});

describe("countProps", () => {
  it("counts plain numbers with matching decimals and skips dust or odd strings", () => {
    expect(countProps("2.56")).toEqual({ to: 2.56, decimals: 2 });
    expect(countProps("18")).toEqual({ to: 18, decimals: 0 });
    expect(countProps("<0.0001")).toBeNull();
    for (const wei of [0n, 1_500_000_000_000_000_000n, 123_456_000_000_000_000n]) {
      const c = countProps(formatQor(wei));
      if (c) expect(c.to.toFixed(c.decimals)).toBe(formatQor(wei));
    }
  });
});
