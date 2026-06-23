/// A small server-side read-through cache for upstream data (e.g. the Predict
/// server). Built for SSR loaders that would otherwise hit an upstream API once
/// per page view. Three properties matter here:
///
/// - TTL: a fresh value is served without touching upstream until it expires.
/// - Single-flight: concurrent misses for the same key share one upstream call,
///   so a burst of visitors collapses into a single request.
/// - Stale-on-error: if the refresh fails but we still hold a recent value, we
///   serve it (within a grace window) instead of failing the page.
///
/// The store is pluggable: the default keeps entries in process memory, which is
/// shared across requests on a long-lived server and per-isolate on edge
/// runtimes. Swap in a KV / Redis-backed `CacheStore` later without changing any
/// call site.

export interface CacheEntry {
  /** Parsed upstream value. Typed as unknown; keys map 1:1 to a value shape. */
  value: unknown
  /** Epoch ms until which the value is fresh and served without a refresh. */
  freshUntil: number
  /** Epoch ms until which a stale value may be served if a refresh fails. */
  staleUntil: number
}

export interface CacheStore {
  get(key: string): CacheEntry | undefined
  set(key: string, entry: CacheEntry): void
  delete(key: string): void
}

export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, CacheEntry>()

  get(key: string): CacheEntry | undefined {
    return this.entries.get(key)
  }

  set(key: string, entry: CacheEntry): void {
    this.entries.set(key, entry)
  }

  delete(key: string): void {
    this.entries.delete(key)
  }
}

export interface CacheOptions {
  /** How long a value stays fresh, in milliseconds. */
  ttlMs: number
  /**
   * Extra window past freshness during which a stale value is served if the
   * refresh throws. Defaults to 0 (no stale fallback).
   */
  staleMs?: number
}

export class TtlCache {
  private readonly store: CacheStore
  private readonly inflight = new Map<string, Promise<unknown>>()

  constructor(store: CacheStore = new MemoryCacheStore()) {
    this.store = store
  }

  /// Return a fresh cached value if present, otherwise load it. Concurrent calls
  /// for the same key await a single load. On loader failure, a stale value is
  /// returned when one exists within its grace window; otherwise the error
  /// propagates.
  async fetch<T>(
    key: string,
    loader: () => Promise<T>,
    options: CacheOptions
  ): Promise<T> {
    const cached = this.store.get(key)
    if (cached !== undefined && cached.freshUntil > Date.now()) {
      return cached.value as T
    }

    const existing = this.inflight.get(key)
    if (existing !== undefined) {
      return existing as Promise<T>
    }

    const staleMs = options.staleMs ?? 0
    const load = loader()
      .then((value): T => {
        const now = Date.now()
        this.store.set(key, {
          freshUntil: now + options.ttlMs,
          staleUntil: now + options.ttlMs + staleMs,
          value,
        })
        return value
      })
      .catch((error: unknown): T => {
        const stale = this.store.get(key)
        if (stale !== undefined && stale.staleUntil > Date.now()) {
          return stale.value as T
        }
        throw error
      })
      .finally(() => {
        this.inflight.delete(key)
      })

    this.inflight.set(key, load)
    return load
  }

  /// Synchronously return a still-fresh cached value, or undefined. Lets a
  /// caller skip its loading state / fetch entirely when the data is already in
  /// hand (e.g. seed component state on mount).
  peek<T>(key: string): T | undefined {
    const cached = this.store.get(key)
    if (cached !== undefined && cached.freshUntil > Date.now()) {
      return cached.value as T
    }
    return undefined
  }

  /// Drop a cached entry so the next read refetches. Useful after a mutation
  /// that should be reflected immediately.
  invalidate(key: string): void {
    this.store.delete(key)
  }
}
