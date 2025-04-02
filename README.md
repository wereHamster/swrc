# Stale-While-Revalidate-Cache (SWRC)

SWRC is a library that aids implementing stale-while-revalidate style caches.

### Goals

The library is written with the following goals in mind:

- **Portable** - It only requires standard ES6 language and runtime features.
- **Agnostic to the cache key type, value type, and data loading function** - As far as the library is concerned, cache keys can be of arbitrary type, and the data loader is an async function. No further constraints are placed on your code.
- **Strictly and strongly typed** - It is written in TypeScript, and all the public interfaces have strong types and JSDoc comments.

### Demarcations

Some of these may be lifted in the future. However currently these are out of scope for this project.

- The library does not offer a way to use a shared / remote cache (eg. Redis or another K/V store). The cache is limited to a single process.
- The cache size can not be limited. You can not set the upper bound on memory or number of items in the cache.
- The library does not give visibility into the cache, nor provide ways to manually evict, update, or otherwise modify the cache.
- The types and bindings used by this library do not attempt to be globally unique. They avoid conflicts with standard JavaScript language features, but are otherwise not namespaced.

## API

The core API consists of just two functions:

- `newHandle(options)`: create a new cache handle.
- `lookup(handle, key)`: look up a key in the cache. The function returns a `Lookup<K, V>` object which contains the cache entry and some metadata that is current at time of the lookup.

Further API for your convenience:

- `lookupValue(handle, key)`: a thin wrapper around `lookup` which returns just the value. Use this instead of `lookup` when you are only interested in the value and do not need to know the details of the cache entry and other metadata.

## Usage

- **Step 1:** Decide what your cache key and values will be. Cache keys can be arbitrary JavaScript values, but you must be able to provide a function that converts the key to a store key, as well as an async function that loads the value associated with the cache key.
- **Step 2:** Create a `Handle`. This is an object which holds the cache and associated medatada. You only need to do this once (eg. during startup or initialization).
- **Step 3:** Whenever you want to look up a value in the cache, use the `lookup` function. It automatically loads the value if it's not present in the cache, and will revalidate it based on your cache control settings.

```typescript
import { newHandle, lookup, Result } from "swrc";

type Key = URL;
type Value = unknown; /* ~ JSON */

const handle = newHandle<Key, Value>({
  /*
   * The cache needs a way to convert the keys to values that can be used to index
   * a JavaScript Map. If your key is already a string, you can just return that.
   * But in this example keys are URL objects, so we need to .toJSON() them.
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

    return {
      value,
      cacheControl: {
        maxAge: 86400 /* 1 day in seconds */,
        staleWhileRevalidate: 21600 /* 6 hours in seconds */,
      },
    };
  },
});

const key: Key = new URL("https://api.github.com/");

/*
 * The first time you lookup the key, the cache fetches the value. So this lookup
 * will take a bit longer.
 */
const value1 = await lookup(handle, key);
console.log(value1);

/* After 1 second */
setTimeout(async () => {
  /*
   * The value is still in the cache and fresh. This second lookup will return
   * immediately.
   */
  const value2 = await lookup(handle, key);
  console.log(value2);
}, 1000);

/* After 1 day and 1 hour */
setTimeout(async () => {
  /*
   * The value is still in the cache, but stale. The lookup returns the (stale)
   * value but triggers revalidation in the background. So this lookup also
   * returns immediately.
   */
  const value3 = await lookup(handle, key);
  console.log(value3);
}, 86400 + 3600);
```
