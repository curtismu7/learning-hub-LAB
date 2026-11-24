import "@testing-library/jest-dom/vitest";

// Some Node versions expose a broken global localStorage that shadows jsdom's; use a plain in-memory one.
if (typeof localStorage === "undefined" || typeof localStorage.clear !== "function") {
  const store = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() },
  });
}
