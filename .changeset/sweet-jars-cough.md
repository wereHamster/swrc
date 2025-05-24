---
"saira": patch
---

Ensure multiple cache entries with same expiry time are evicted properly

Previously the evictor would only evict one cache entry if multiple had the same expiry time.
