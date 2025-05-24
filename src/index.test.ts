import { describe, it } from "node:test";
import assert from "node:assert";

import { newHandle, lookup } from "./index.js";
import { setTimeout } from "node:timers/promises";

describe("lookup", () => {
  it("should return a cache entry in fresh state on initial lookup", async () => {
    const handle = newHandle<string, unknown>({
      storeKey: (x) => x,
      loader: async () => {
        return {
          value: {},
        };
      },
    });

    const l = await lookup(handle, "key");
    assert.strictEqual(l.state, "Fresh");
  });

  it("should propagate loader rejection on initial lookup", async () => {
    const handle = newHandle<string, unknown>({
      storeKey: (x) => x,
      loader: async () => {
        throw new Error("Failed");
      },
    });

    await assert.rejects(lookup(handle, "key"), /Failed/);
  });

  it("should transition to Stale state after maxAge", async () => {
    const handle = newHandle<string, unknown>({
      storeKey: (x) => x,
      loader: async () => {
        return {
          value: {},
          cacheControl: {
            maxAge: 0,
            staleWhileRevalidate: 5,
          },
        };
      },
    });

    await lookup(handle, "key");
    await setTimeout(2000);
    const l = await lookup(handle, "key");
    assert.strictEqual(l.state, "Stale");
  });

  it.skip("should transition to Expired state after maxAge + staleWhileRevalidate", () => {
    // TODO
  });

  it.skip("should return the stale value if revalidation fails", () => {
    // TODO
  });

  it("should de-duplicate concurrent initial lookups", async () => {
    let counter = 0;
    const handle = newHandle<string, unknown>({
      storeKey: (x) => x,
      loader: async () => {
        await setTimeout(10);
        return {
          value: counter++,
        };
      },
    });

    const [a, b] = await Promise.all([
      lookup(handle, "key"),
      lookup(handle, "key"),
    ]);
    assert.strictEqual(a.cacheEntry.result.value, 0);
    assert.strictEqual(b.cacheEntry.result.value, 0);
  });

  it.skip("should de-duplicate concurrent lookups during revalidation", () => {
    // TODO
  });

  it("should evict expired entries", async () => {
    const handle = newHandle<string, unknown>({
      storeKey: (x) => x,
      loader: async () => {
        return {
          value: {},
          cacheControl: {
            maxAge: 1,
          },
        };
      },
    });

    await lookup(handle, "key1");
    await lookup(handle, "key2");
    assert.strictEqual(handle.cache.size, 2);
    await setTimeout(2000);
    assert.strictEqual(handle.cache.size, 0);
  });

  it.skip("should trigger a new load if looking up an expired entry before eviction", () => {
    // TODO
  });

  it.skip("should handle cache control with only maxAge", () => {
    // TODO
  });

  it.skip("should handle cache control with only staleWhileRevalidate", () => {
    // TODO
  });

  it.skip("should handle cache control with no cacheControl options", () => {
    // TODO
  });

  it.skip("should work correctly with multiple different keys", () => {
    // TODO
  });
});
