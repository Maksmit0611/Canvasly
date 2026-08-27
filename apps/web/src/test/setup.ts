import '@testing-library/jest-dom/vitest';

/**
 * jsdom in this environment does not expose localStorage, and Node's own
 * implementation needs a flag. Tests need a working store, so provide a plain
 * in-memory one when it is missing.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();

  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage,
    configurable: true,
  });
}
