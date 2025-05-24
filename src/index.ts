export interface Options<K, V> {
  /**
   * A function which converts your key into a value that is used to index
   * the store (in the current implementation a JavaScript Map).
   *
   * If your key is one of the primitive JavaScript types (eg. string),
   * then this function can be identity. Otherwise a good choice is to
   * convert your key into a string.
   *
   * You can also return non-primitive types (eg. an object). But you have
   * to make sure that two keys that are equal (by your own definition)
   * convert to values that are equal according to the "SameValue(x, y)"
   * abstract operation.
   */
  readonly storeKey: (key: K) => unknown;

  /**
   * A function which loads the value or the given key.
   *
   * The function must return what is essentially a tuple of the raw value,
   * and cache control settings (for how long the value can be cached).
   *
   * The function may throw.
   */
  readonly loader: (key: K) => Promise<Result<V>>;
}

export interface Handle<K, V> {
  /**
   * A reference to the options that were passed during construction
   * of the Handle.
   */
  readonly options: Options<K, V>;

  readonly cache: Map<unknown, CacheEntry<K, V>>;

  /**
   * A timer which fires when the next cache entry needs to be evicted.
   *
   * We store the 'runAt' time to be able to quickly determine if we need
   * to re-schedule it or not (when a cache entry is addded or updated).
   *
   * We only keep a single timer (for when the next cache entry needs to
   * be evicted). When it fires, it schedules the next timer or sets this
   * field to 'undefined' (if the cache becomes empty).
   */
  evictor:
    | undefined
    | { runAt: Timestamp; timeoutId: ReturnType<typeof setTimeout> };
}

/**
 * A cache entry can be one of three kinds. See the individual cases for
 * more details.
 */
type CacheEntry<K, V> = Loading<K, V> | Present<K, V> | Revalidating<K, V>;

/**
 * The cache is loading the value. The 'fn' Promise will resolve with the
 * value (or reject). If multiple users are interested in the same key,
 * they can subscribe to the 'fn' Promise. This will effectively deduplicate
 * requests for the same key.
 */
interface Loading<K, V> {
  readonly kind: "Loading";

  readonly key: K;

  /**
   * A promise which resolves once the cache has been updated.
   */
  readonly promise: Promise<Present<K, V>>;
}

function mkLoading<K, V>(
  key: K,
  promise: Promise<Present<K, V>>,
): Loading<K, V> {
  return {
    kind: "Loading",

    key,
    promise,
  };
}

/**
 * The value has been loaded into the cache. Though note that it can be either
 * fresh or stale. To know that state, you need to consult the createdAt timestamp,
 * as well as the cache control settings (maxAge, staleWhileRevalidate).
 */
interface Present<K, V> {
  readonly kind: "Present";

  readonly key: K;
  readonly result: Result<V>;
  readonly createdAt: Timestamp;
}

function mkPresent<K, V>(key: K, result: Result<V>): Present<K, V> {
  return {
    kind: "Present",

    key,
    result,
    createdAt: currentTimestamp(),
  };
}

/**
 * The value is in the cache, but is being revalidated.
 */
interface Revalidating<K, V> {
  readonly kind: "Revalidating";

  readonly key: K;
  readonly result: Result<V>;
  readonly createdAt: Timestamp;

  /**
   * A promise which resolves once the cache has been updated.
   */
  readonly promise: Promise<Present<K, V>>;
}

function mkRevalidating<K, V>(
  cacheEntry: Present<K, V>,
  promise: Promise<Present<K, V>>,
): Revalidating<K, V> {
  return {
    kind: "Revalidating",

    key: cacheEntry.key,
    result: cacheEntry.result,
    createdAt: cacheEntry.createdAt,
    promise,
  };
}

export interface Result<V> {
  readonly value: V;

  readonly cacheControl?: {
    readonly maxAge?: number;
    readonly staleWhileRevalidate?: number;
  };
}

/**
 * Timestamps are whole numbers, seconds since an arbitrary epoch. We do not
 * need sub-second precision.
 */
type Timestamp = number;

function currentTimestamp(): Timestamp {
  return Math.floor(Date.now() / 1000);
}

export function newHandle<K, V>(options: Options<K, V>): Handle<K, V> {
  return {
    options,
    cache: new Map(),
    evictor: undefined,
  };
}

function scheduleEvictor<K, V>(
  h: Handle<K, V>,
  keyValue: unknown,
  cacheEntry: Present<K, V>,
): void {
  const { maxAge = 0, staleWhileRevalidate = 0 } =
    cacheEntry.result.cacheControl ?? {};
  const runAt = cacheEntry.createdAt + maxAge + staleWhileRevalidate;
  if (!h.evictor || h.evictor.runAt > runAt) {
    if (h.evictor) {
      clearTimeout(h.evictor.timeoutId);
    }

    h.evictor = {
      runAt,
      timeoutId: setTimeout(
        () => {
          h.evictor = undefined;

          const cacheEntry = h.cache.get(keyValue);

          /*
           * Do not delete the cache entry if it's Loading or Revalidating!
           */
          if (cacheEntry && cacheEntry.kind === "Present") {
            h.cache.delete(keyValue);
          }

          const entries = [...h.cache.entries()].flatMap(([k, v]) => {
            switch (v.kind) {
              case "Loading": {
                return [];
              }
              case "Present": {
                const { maxAge = 0, staleWhileRevalidate = 0 } =
                  v.result.cacheControl ?? {};

                return [
                  {
                    keyValue: k,
                    cacheEntry: v,
                    runAt: v.createdAt + maxAge + staleWhileRevalidate,
                  },
                ];
              }
              case "Revalidating": {
                return [];
              }
            }
          });

          entries.sort((a, b) => b.runAt - a.runAt);

          const [head] = entries;
          if (head) {
            scheduleEvictor(h, head.keyValue, head.cacheEntry);
          }
        },
        (runAt - currentTimestamp()) * 1000,
      ),
    };
  }
}

type State = "Fresh" | "Stale" | "Expired";

function cacheEntryState<K, V>(
  cacheEntry: Present<K, V> | Revalidating<K, V>,
): State {
  const now = currentTimestamp();
  const { maxAge = 0, staleWhileRevalidate = 0 } =
    cacheEntry.result.cacheControl ?? {};

  switch (true) {
    case now <= cacheEntry.createdAt + maxAge:
      return "Fresh";
    case now <= cacheEntry.createdAt + maxAge + staleWhileRevalidate:
      return "Stale";
    default:
      return "Expired";
  }
}

export interface Lookup<K, V> {
  readonly cacheEntry: Present<K, V> | Revalidating<K, V>;

  /**
   * The state of the cache entry at time of lookup.
   */
  readonly state: State;
}

export function lookup<K, V>(h: Handle<K, V>, key: K): Promise<Lookup<K, V>> {
  const storeKey = h.options.storeKey(key);

  const cacheEntry = h.cache.get(storeKey);
  if (!cacheEntry) {
    return startLoading();
  }

  /*
   * Now that we know a cache entry exists, we have a couple cases that we
   * need to handle.
   *
   * case (Kind, State) of
   *
   *   (Loading,      _      ) -> Trigger loading; Return the value from the loading promise.
   *   (_,            Fresh  ) -> Return the value from the cache entry.
   *   (Present,      Stale  ) -> Trigger revalidation; Return the value from the cache entry.
   *   (Revalidating, Stale  ) -> Return the value from the cache entry.
   *   (Revalidating, Expired) -> Change kind to Loading; Return the value from the loading promise;
   *   (_,            Expired) -> Trigger loading; Return the value from the loading promise.
   *
   * The last case should only happend under race conditions. The evictor
   * should be removing expired entries from the cache. But because the
   * evictor is using setTimeout(), it's possible that a cache entry is
   * technically expired but still present in the cache.
   */

  /*
   * Case: Kind=Loading, State=*
   *
   * If we are loading the value, return the value from the promise (when
   * it resolves). This is what de-duplicates requests to the same key
   * (while they are being initially loaded).
   */
  if (cacheEntry.kind === "Loading") {
    return cacheEntry.promise.then((cacheEntry) => ({
      cacheEntry,
      state: cacheEntryState(cacheEntry),
    }));
  }

  const state = cacheEntryState(cacheEntry);

  /*
   * Case: Kind=*, State=Fresh
   */
  if (state === "Fresh") {
    return Promise.resolve({ cacheEntry, state });
  }

  /*
   * Case: Kind=Present|Revalidating, State=Stale
   */
  if (state === "Stale") {
    if (cacheEntry.kind === "Present") {
      startRevalidating(cacheEntry);
    }

    return Promise.resolve({ cacheEntry, state });
  }

  if (state === "Expired") {
    /*
     * Case: Kind=Revalidating, State=Expired
     *
     * The cache entry is expired (past its max-age and stale-while-revalidate).
     * We should not return the cache entry anymore. But if we're revalidating it,
     * there is a request in-flight and we can return its result (when it
     * resolves).
     */
    if (cacheEntry.kind === "Revalidating") {
      /*
       * Change the cache entry kind to Loading. The Revalidating kind holds
       * the result which is expired and should not be used. By changing the
       * kind to Loading we make it clear that the result is no longer available
       * (to subsequent lookups). It also releases a reference to the value
       * and allows the system to free the memory.
       */
      h.cache.set(storeKey, mkLoading(key, cacheEntry.promise));

      return cacheEntry.promise.then((cacheEntry) => ({
        cacheEntry,
        state: cacheEntryState(cacheEntry),
      }));
    }

    /*
     * Case: Kind=Present, State=Expired
     *
     * The cache entry is Present, but expired beyond use. We can't return
     * its value anymore. We have to start from the beginning again (Loading).
     */
    return startLoading();
  }

  return Promise.reject(new Error("Unreachable"));

  function startLoading(): Promise<Lookup<K, V>> {
    const cacheEntryPromise = h.options.loader(key).then((result) => {
      const cacheEntry = mkPresent(key, result);

      h.cache.set(storeKey, cacheEntry);

      scheduleEvictor(h, storeKey, cacheEntry);

      return cacheEntry;
    });

    cacheEntryPromise.catch(() => {
      h.cache.delete(storeKey);
    });

    h.cache.set(storeKey, mkLoading(key, cacheEntryPromise));

    return cacheEntryPromise.then((cacheEntry) => ({
      cacheEntry,
      state: cacheEntryState(cacheEntry),
    }));
  }

  function startRevalidating(cacheEntry: Present<K, V>): void {
    const cacheEntryPromise = h.options.loader(key).then((result) => {
      const cacheEntry = mkPresent(key, result);

      h.cache.set(storeKey, cacheEntry);

      scheduleEvictor(h, storeKey, cacheEntry);

      return cacheEntry;
    });

    cacheEntryPromise.catch(() => {
      const state = cacheEntryState(cacheEntry);

      /*
       * If the cache entry is expired by now, drop it from the cache.
       * Otherwise restore the old entry so next time this key will be
       * requested, we'll try revalidating again.
       */
      if (state === "Expired") {
        h.cache.delete(storeKey);
      } else {
        h.cache.set(storeKey, cacheEntry);
      }

      scheduleEvictor(h, storeKey, cacheEntry);
    });

    h.cache.set(storeKey, mkRevalidating(cacheEntry, cacheEntryPromise));
  }
}

/**
 * Return the value associated with the key. This is a convenience wrapper
 * around 'lookup'. Use this if you are not interested in the cache entry
 * state.
 */
export async function lookupValue<K, V>(h: Handle<K, V>, key: K): Promise<V> {
  return lookup(h, key).then(({ cacheEntry }) => cacheEntry.result.value);
}
