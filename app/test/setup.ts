import "@testing-library/jest-dom/vitest";

// jsdom has no IntersectionObserver; motion's whileInView needs one.
class StubIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
globalThis.IntersectionObserver ??= StubIntersectionObserver as unknown as typeof IntersectionObserver;
