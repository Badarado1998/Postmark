import { vi, describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderApp } from "../fixtures";
import { Hero } from "../../src/pages/landing/Hero";
import { ProductFrame } from "../../src/pages/landing/ProductFrame";
import { BuiltOn, HowItWorks, ValueProp } from "../../src/pages/landing/Narrative";
import { Disputes, Features } from "../../src/pages/landing/Features";
import { Faq, Proof } from "../../src/pages/landing/ProofFaq";
import { CtaBand, Footer } from "../../src/pages/landing/Closing";
import { FadeIn } from "../../src/pages/landing/FadeIn";
import { BUILT_ON, FAQ, FEATURES, PROOF, STEPS } from "../../src/pages/landing/content";

vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => true }));

describe("landing content", () => {
  it("lists the five steps, six features and six FAQ answers", () => {
    expect(STEPS.map(([t]) => t)).toEqual(["Fund", "Claim", "Verify 2 of 3", "24h challenge", "Withdraw"]);
    expect(FEATURES).toHaveLength(6);
    expect(FAQ).toHaveLength(6);
    expect(BUILT_ON).toContain("ML-DSA-87");
    expect(PROOF.some((p) => p.href?.includes("/address/"))).toBe(true);
  });
});

describe("landing sections", () => {
  it("Hero highlights verified and links to create and explore", () => {
    renderApp(<Hero />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bounties that pay when the work is verified.");
    expect(screen.getByRole("link", { name: "Fund a bounty" })).toHaveAttribute("href", "/create");
    expect(screen.getByRole("link", { name: "Browse bounties" })).toHaveAttribute("href", "/explore");
  });

  it("ProductFrame is labelled as an example", () => {
    render(<ProductFrame />);
    expect(screen.getByText(/Example · bounty detail/)).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("Narrative sections render their claims", () => {
    renderApp(<><BuiltOn /><ValueProp /><HowItWorks /></>);
    expect(screen.getByText("QoreChain diana")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /leaked key/ })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(STEPS.length);
  });

  it("Features and Disputes show every card and the dispute outcome", () => {
    render(<><Features /><Disputes /></>);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(FEATURES.length);
    expect(screen.getByText(/DisputeResolved\(upheld=false\)/)).toBeInTheDocument();
  });

  it("Proof and Faq render links and questions", () => {
    render(<><Proof /><Faq /></>);
    expect(screen.getByRole("link", { name: "resolveDispute" })).toBeInTheDocument();
    expect(screen.getByText("Why a local signer?")).toBeInTheDocument();
  });

  it("CtaBand and Footer link into the app", () => {
    renderApp(<><CtaBand /><Footer /></>);
    expect(screen.getByRole("heading", { name: "Fund your first bounty in minutes." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Escrow contract" })).toBeInTheDocument();
  });

  it("FadeIn always renders its children", () => {
    render(<FadeIn className="x"><p>content</p></FadeIn>);
    expect(screen.getByText("content")).toBeVisible();
  });
});
