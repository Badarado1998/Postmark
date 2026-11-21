import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider, useToast, MAX_TOASTS, TOAST_DURATION_MS, type ToastInput } from "../../src/components/Toasts";
import { GithubRateLimitToast, RATE_LIMIT_TOAST } from "../../src/components/GithubRateLimitToast";
import { GithubRateLimitError } from "../../src/github/client";
import { CANCELLED_MESSAGE, isUserRejection } from "../../src/chain/errors";

const state = vi.hoisted(() => ({ reduce: false }));
vi.mock("motion/react", async (orig) => ({
  ...(await orig<typeof import("motion/react")>()),
  useReducedMotion: () => state.reduce,
}));

let last: (t: ToastInput) => void = () => {};
function Capture() { last = useToast(); return null; }
const mount = () => render(<ToastProvider><Capture /></ToastProvider>);
const push = (t: ToastInput) => act(() => { last(t); });

beforeEach(() => { vi.useFakeTimers(); state.reduce = false; });
afterEach(() => vi.useRealTimers());

describe("toasts", () => {
  it("appears, and disappears at exactly 4000 ms", async () => {
    state.reduce = true;
    mount();
    push({ kind: "success", text: "saved" });
    expect(screen.getByText("saved")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(TOAST_DURATION_MS - 1); });
    expect(screen.getByText("saved")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(screen.queryByText("saved")).toBeNull();
  });

  it("closes from the close button", async () => {
    state.reduce = true;
    mount();
    push({ kind: "info", text: "bye" });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(screen.queryByText("bye")).toBeNull();
  });

  it("keeps at most three, newest first", async () => {
    state.reduce = true;
    mount();
    for (const n of [1, 2, 3, 4]) push({ kind: "info", text: `toast ${n}` });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const items = screen.getAllByRole("status");
    expect(items).toHaveLength(MAX_TOASTS);
    expect(items[0]).toHaveTextContent("toast 4");
    expect(screen.queryByText("toast 1")).toBeNull();
  });

  it("uses friendly default titles and role alert for errors", () => {
    mount();
    push({ kind: "error", text: "boom" });
    push({ kind: "warning", text: "careful" });
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("accepts a custom title and ignores identical duplicates", () => {
    mount();
    push({ kind: "success", title: "Copied", text: "Link copied" });
    push({ kind: "success", title: "Copied", text: "Link copied" });
    expect(screen.getAllByText("Copied")).toHaveLength(1);
  });

  it("renders without animation under reduced motion and still auto-dismisses", async () => {
    state.reduce = true;
    const { container } = mount();
    push({ kind: "success", text: "calm" });
    expect(screen.getByText("calm")).toBeInTheDocument();
    expect(container.querySelector(".toast-progress")).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(TOAST_DURATION_MS + 50); });
    expect(screen.queryByText("calm")).toBeNull();
  });

  it("is a no-op outside a provider", () => {
    render(<Capture />);
    expect(() => last({ kind: "info", text: "x" })).not.toThrow();
  });
});

describe("user rejection mapping", () => {
  it("recognises EIP-1193 4001, viem names and nested causes", () => {
    expect(isUserRejection(Object.assign(new Error("x"), { code: 4001 }))).toBe(true);
    expect(isUserRejection(Object.assign(new Error("x"), { name: "UserRejectedRequestError" }))).toBe(true);
    expect(isUserRejection(new Error("User rejected the request."))).toBe(true);
    expect(isUserRejection(new Error("outer", { cause: new Error("User denied transaction signature") }))).toBe(true);
    expect(isUserRejection(new Error("insufficient funds"))).toBe(false);
    expect(CANCELLED_MESSAGE).toBe("You cancelled the request in your wallet.");
  });
});

describe("GitHub rate-limit toast", () => {
  it("warns once when a GitHub query hits the rate limit", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider><GithubRateLimitToast /></ToastProvider>
      </QueryClientProvider>);
    await act(async () => {
      await qc.fetchQuery({ queryKey: ["gh"], queryFn: () => { throw new GithubRateLimitError(new Date()); } }).catch(() => {});
    });
    expect(screen.getByText(RATE_LIMIT_TOAST)).toBeInTheDocument();
    expect(screen.getByText("GitHub is busy")).toBeInTheDocument();
  });
});
