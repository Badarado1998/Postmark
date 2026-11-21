import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Lifecycle, lifecycleSteps } from "../../src/pages/bounty/Lifecycle";
import { progress } from "../../src/pages/bounty/Sidebar";

describe("lifecycle stepper", () => {
  it("walks Open → Claimed → Pending → Paid", () => {
    expect(lifecycleSteps(0)).toMatchObject({ current: 0 });
    expect(lifecycleSteps(2).steps.map((s) => s.name)).toEqual(["Open", "Claimed", "Pending", "Paid"]);
    expect(lifecycleSteps(5).steps.at(-1)?.name).toBe("Refunded");
  });
  it("shows the dispute branch only for disputed bounties", () => {
    expect(lifecycleSteps(3).steps.map((s) => s.name)).toEqual(["Open", "Claimed", "Pending", "Disputed", "Paid"]);
    expect(lifecycleSteps(2).steps.map((s) => s.name)).not.toContain("Disputed");
  });
  it("marks the current step for assistive tech and completes settled bounties", () => {
    const { unmount } = render(<Lifecycle state={1} />);
    expect(screen.getByText("Claimed").closest("li")).toHaveAttribute("aria-current", "step");
    unmount();
    render(<Lifecycle state={4} />);
    expect(document.querySelector("[aria-current]")).toBeNull();
  });
});

describe("progress", () => {
  it("clamps elapsed time to 0..1", () => {
    expect(progress(0n, 100n, 50n)).toBe(0.5);
    expect(progress(0n, 100n, 500n)).toBe(1);
    expect(progress(10n, 100n, 0n)).toBe(0);
    expect(progress(100n, 100n, 5n)).toBe(1);
  });
});
