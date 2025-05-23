import { describe, it } from "node:test";
import assert from "node:assert";

import { newHandle, lookup } from "./index.js";

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
    assert.equal("Fresh", l.state);
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

  it.skip("should transition to Stale state after maxAge", () => {
    // TODO
  });

  it.skip("should transition to Expired state after maxAge + staleWhileRevalidate", () => {
    // TODO
  });

  it.skip("should return the stale value if revalidation fails", () => {
    // TODO
  });

  it.skip("should de-duplicate concurrent initial lookups", () => {
    // TODO
  });

  it.skip("should de-duplicate concurrent lookups during revalidation", () => {
    // TODO
  });

  it.skip("should evict expired entries", () => {
    // TODO
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
