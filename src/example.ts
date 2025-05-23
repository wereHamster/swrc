import { type Result, newHandle, lookup } from "./index.js";

type Key = URL;
type Value = unknown;

const handle = newHandle<Key, Value>({
  /*
   * The cache needs a way to convert the keys to strings (to use as keys in a Map).
   * If your key is already a string, you can just return that. But in this example
   * keys are URL objects, so we need to .toJSON() them.
   */
  storeKey: (url: Key): string => url.toJSON(),

  /*
   * This is your function which fetches the value for the given key. The function
   * must return the value, along with cache control settings. The cache control
   * settings are not set per-cache, but you can choose different settings for each
   * key (or even extract the max-age and stale-while-revalidate numbers from the
   * HTTP response, to honor the origin server).
   */
  loader: async (url: Key): Promise<Result<unknown>> => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("Not OK");
    }

    const value = await res.json();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
      value,
      cacheControl: {
        maxAge: 2,
        staleWhileRevalidate: 3,
      },
    };
  },
});

async function main() {
  const key: Key = new URL("https://api.github.com/");

  /*
   * The first time you look up the key, the cache fetches the value. So this lookup
   * will take a bit longer (slightly more than 1 second).
   */
  console.time("lookup1");
  const value1 = await lookup(handle, key);
  console.timeEnd("lookup1");
  console.log({ value1 });

  /*
   * Wait 1 second.
   */
  await new Promise((resolve) => setTimeout(resolve, 1000));

  /*
   * The value is still in the cache and fresh. This second lookup will return
   * immediately.
   */
  console.time("lookup2");
  const value2 = await lookup(handle, key);
  console.timeEnd("lookup2");
  console.log({ value2 });

  /*
   * Wait 3 seconds.
   */
  await new Promise((resolve) => setTimeout(resolve, 3000));

  /*
   * The value is still in the cache, but stale. The lookup returns the (stale)
   * value but triggers revalidation in the background. So this lookup also
   * returns immediately.
   */
  console.time("lookup3");
  const value3 = await lookup(handle, key);
  console.timeEnd("lookup3");
  console.log({ value3 });

  /*
   * The cache entry is now revalidating. It will indicate this in its kind.
   */
  console.time("lookup4");
  const value4 = await lookup(handle, key);
  console.timeEnd("lookup4");
  console.log({ value4 });

  /*
   * Wait 10 seconds.
   */
  await new Promise((resolve) => setTimeout(resolve, 10000));

  /*
   * The value has now been evicted from the cache. The lookup will trigger
   * the initial load again.
   */
  console.time("lookup5");
  const value5 = await lookup(handle, key);
  console.timeEnd("lookup5");
  console.log({ value5 });
}

main();
