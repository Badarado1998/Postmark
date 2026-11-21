import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FRESH_MS, getAllComments, getIssue } from "../../src/github/client";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(status === 304 ? null : JSON.stringify(body), { status, headers: { etag: '"e1"', ...headers } });

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("GitHub read cache", () => {
  it("serves issue reads from the cache without a request while fresh, then revalidates", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ number: 1 })).mockResolvedValue(json(null, 304));
    vi.stubGlobal("fetch", fetchMock);
    await getIssue("o/r", 1);
    await getIssue("o/r", 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(FRESH_MS + 1000);
    await expect(getIssue("o/r", 1)).resolves.toEqual({ number: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![1].headers["if-none-match"]).toBe('"e1"');
    await getIssue("o/r", 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("always revalidates comment scans so a freshly posted claim line is found", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json([]));
    vi.stubGlobal("fetch", fetchMock);
    await getAllComments("o/r", 1);
    await getAllComments("o/r", 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
