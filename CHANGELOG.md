# saira

## 0.0.3

### Patch Changes

- **Ensure multiple cache entries with same expiry time are evicted properly** ([#14](https://github.com/wereHamster/saira/pull/14)) - Previously the evictor would only evict one cache entry if multiple had the same expiry time.
