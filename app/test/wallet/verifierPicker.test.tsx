import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { VERIFIERS, becomeVerifierUrl, BECOME_VERIFIER_URL } from "../../src/data/verifiers";
import { CLAIMANT } from "../fixtures";

const m = vi.hoisted(() => ({ live: {} as Record<string, boolean | undefined>, toast: vi.fn() }));
vi.mock("../../src/hooks/queries", () => ({
  usePqcStatus: (a: string) => ({ data: m.live[a] === undefined ? undefined : { live: m.live[a] } }),
}));
vi.mock("../../src/components/Toasts", () => ({ useToast: () => m.toast }));

import {
  VerifierPicker, toggleVerifier, pickForMe, inviteMessage, MAX_VERIFIERS,
} from "../../src/wallet/VerifierPicker";

const [A, B, C] = VERIFIERS.map((v) => v.address);

function Harness({ connected = CLAIMANT as string | undefined }) {
  const [slots, setSlots] = useState(["", "", ""]);
  return (
    <>
      <VerifierPicker slots={slots} onChange={setSlots} connected={connected} />
      <output data-testid="slots">{slots.join(",")}</output>
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.live = { [A!]: true, [B!]: true, [C!]: true };
});

describe("verifier list", () => {
  it("seeds the three e2e test verifiers", () => {
    expect(VERIFIERS.map((v) => v.name)).toEqual([
      "Postmark test verifier 1", "Postmark test verifier 2", "Postmark test verifier 3"]);
    expect(VERIFIERS[0]!.address).toBe("0x01B451550bEf4cc51Bb24B8C5E5b4b23a368a9cE");
  });
  it("prefills the address field of the issue form", () => {
    expect(becomeVerifierUrl()).toBe(BECOME_VERIFIER_URL);
    expect(becomeVerifierUrl("0xabc")).toBe(`${BECOME_VERIFIER_URL}&address=0xabc`);
    expect(BECOME_VERIFIER_URL).toContain("template=become-a-verifier.yml");
  });
});

describe("picker helpers", () => {
  it("toggles into the first empty slot and out again", () => {
    expect(toggleVerifier(["", "", ""], "0xA")).toEqual(["0xA", "", ""]);
    expect(toggleVerifier(["0xA", "", ""], "0xB")).toEqual(["0xA", "0xB", ""]);
    expect(toggleVerifier(["0xA", "0xB", ""], "0xa")).toEqual(["", "0xB", ""]);
  });
  it("never adds a fourth", () => {
    const full = ["0xA", "0xB", "0xC"];
    expect(toggleVerifier(full, "0xD")).toBe(full);
    expect(MAX_VERIFIERS).toBe(3);
  });
  it("picks live verifiers and excludes the connected account", () => {
    const c = [{ address: "0x1", live: true }, { address: "0x2", live: false }, { address: "0x3", live: undefined },
      { address: "0x4", live: true }, { address: "0x5", live: true }, { address: "0x6", live: true }];
    expect(pickForMe(c, "0x4")).toEqual(["0x1", "0x5", "0x6"]);
    expect(pickForMe(c.slice(0, 3), undefined)).toEqual(["0x1"]);
  });
  it("explains how to become a verifier in the invite", () => {
    const text = inviteMessage("https://example.test/form");
    expect(text).toMatch(/QoreX/);
    expect(text).toMatch(/one send/);
    expect(text).toContain("https://example.test/form");
  });
});

describe("VerifierPicker", () => {
  it("toggles cards with aria-pressed and caps the choice at three", () => {
    render(<Harness />);
    const card = (n: number) => screen.getByRole("button", { name: new RegExp(`Postmark test verifier ${n}`) });
    fireEvent.click(card(1));
    expect(card(1)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(card(1));
    expect(card(1)).toHaveAttribute("aria-pressed", "false");
    [1, 2, 3].forEach((n) => fireEvent.click(card(n)));
    expect(screen.getByText("3 of 3 chosen")).toBeInTheDocument();
    expect(screen.getByTestId("slots")).toHaveTextContent(`${A},${B},${C}`);
  });

  it("Pick 3 for me fills live verifiers and skips the connected account", () => {
    render(<Harness connected={B} />);
    fireEvent.click(screen.getByRole("button", { name: "Pick 3 for me" }));
    expect(screen.getByTestId("slots")).toHaveTextContent(`${A},${C},`);
  });

  it("warns when no listed verifier is live", () => {
    m.live = { [A!]: false, [B!]: false, [C!]: false };
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Pick 3 for me" }));
    expect(m.toast).toHaveBeenCalledWith(expect.objectContaining({ kind: "warning" }));
    expect(screen.getByTestId("slots")).toHaveTextContent(",,");
  });

  it("copies the invite and links the prefilled become-a-verifier form", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Ask a friend to verify" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("QoreX"));
    expect(screen.getByRole("link", { name: "Become a verifier" }))
      .toHaveAttribute("href", becomeVerifierUrl(CLAIMANT));
  });
});
