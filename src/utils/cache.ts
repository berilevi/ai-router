import crypto from 'crypto';
import { logger } from './logger';

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
  size: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  entries: number;
  hitRate: number;
  averageEntrySize: number;
  oldestEntry: number | null;
  newestEntry: number | null;
}

export interface CacheConfig {
  enabled: boolean;
  ttlMs: number;
  maxSizeBytes: number;
  maxEntries: number;
  strategy: 'lru' | 'fifo';
}

export const defaultCacheConfig: CacheConfig = {
  enabled: true,
  ttlMs: 3600000, // 1 hour
  maxSizeBytes: 100 * 1024 * 1024, // 100MB
  maxEntries: 1000,
  strategy: 'lru',
};

/**
 * LRU Cache implementation with TTL support
 */
export class ResponseCache<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private config: CacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...defaultCacheConfig, ...config };
    logger.info('Response cache initialized', {
      enabled: this.config.enabled,
      ttlMs: this.config.ttlMs,
      maxSizeBytes: this.config.maxSizeBytes,
      strategy: this.config.strategy,
    });
  }

  /**
   * Generate cache key from request data using SHA-256
   */
  generateKey(data: {
    model: string;
    messages?: any[];
    system?: string;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    provider?: string;
  }): string {
    const keyData = {
      model: data.model,
      system: data.system,
      messages: data.messages,
      temperature: data.temperature ?? 1,
      topP: data.topP ?? 1,
      maxTokens: data.maxTokens ?? 1024,
      provider: data.provider,
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(keyData))
      .digest('hex');

    return hash;
  }

  /**
   * Set a value in the cache with TTL
   */
  set(key: string, value: T, ttlMs?: number): void {
    if (!this.config.enabled) return;

    const ttl = ttlMs || this.config.ttlMs;
    const size = this.getSize(value);

    // Check if adding this entry would exceed size limit
    if (this.getTotalSize() + size > this.config.maxSizeBytes) {
      this.evictEntry();
    }

    // Check if we've exceeded max entries
    if (this.cache.size >= this.config.maxEntries) {
      this.evictEntry();
    }

    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl,
      hits: 0,
      size,
    };

    this.cache.set(key, entry);
    logger.debug(`Cache SET: ${key.substring(0, 8)}... (${size} bytes, TTL: ${ttl}ms)`);
  }

  /**
   * Get a value from the cache, checking TTL
   */
  get(key: string): T | null {
    if (!this.config.enabled) {
      this.stats.misses++;
      return null;
    }

    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      logger.debug(`Cache MISS: ${key.substring(0, 8)}...`);
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      logger.debug(`Cache EXPIRED: ${key.substring(0, 8)}...`);
      return null;
    }

    // Update hit count for LRU tracking
    entry.hits++;
    this.stats.hits++;
    logger.debug(`Cache HIT: ${key.substring(0, 8)}... (${entry.hits} hits)`);

    return entry.value;
  }

  /**
   * Delete a specific key from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info(`Cache cleared (${size} entries removed)`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const timestamps = entries.map((e) => e.timestamp);
    const sizes = entries.map((e) => e.size);

    const totalSize = sizes.reduce((sum, size) => sum + size, 0);
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests === 0 ? 0 : (this.stats.hits / totalRequests) * 100;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: totalSize,
      entries: this.cache.size,
      hitRate: Math.round(hitRate * 100) / 100,
      averageEntrySize: entries.length === 0 ? 0 : totalSize / entries.length,
      oldestEntry: timestamps.length === 0 ? null : Math.min(...timestamps),
      newestEntry: timestamps.length === 0 ? null : Math.max(...timestamps),
    };
  }

  /**
   * Get total cache size in bytes
   */
  private getTotalSize(): number {
    let total = 0;
    this.cache.forEach((entry) => {
      total += entry.size;
    });
    return total;
  }

  /**
   * Estimate size of a value in bytes
   */
  private getSize(value: any): number {
    return JSON.stringify(value).length;
  }

  /**
   * Evict an entry based on strategy (LRU or FIFO)
   */
  private evictEntry(): void {
    if (this.cache.size === 0) return;

    let keyToEvict: string | null = null;

    if (this.config.strategy === 'lru') {
      // Find least recently used (lowest hits)
      let minHits = Infinity;
      for (const [key, entry] of this.cache.entries()) {
        if (entry.hits < minHits) {
          minHits = entry.hits;
          keyToEvict = key;
        }
      }
    } else {
      // FIFO: oldest entry
      let oldestTime = Infinity;
      for (const [key, entry] of this.cache.entries()) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp;
          keyToEvict = key;
        }
      }
    }

    if (keyToEvict !== null) {
      const entry = this.cache.get(keyToEvict);
      this.cache.delete(keyToEvict);
      const size = entry?.size ?? 0;
      logger.debug(
        `Cache EVICT (${this.config.strategy}): ${keyToEvict.substring(0, 8)}... (${size} bytes)`
      );
    }
  }

  /**
   * Calculate estimated cost savings from cache hits
   * Assumes cached responses cost 10% of regular responses
   */
  calculateCostSavings(costPerToken: number = 0.00003): number {
    const savedRequests = this.stats.hits;
    const costPerRequest = 100 * costPerToken; // Assume ~100 tokens per request
    // Savings: 90% reduction per cached request
    return savedRequests * costPerRequest * 0.9;
  }
}

// Global cache instance
let globalCache: ResponseCache | null = null;

export function initializeCache(config?: Partial<CacheConfig>): ResponseCache {
  globalCache = new ResponseCache(config);
  return globalCache;
}

export function getCache(): ResponseCache {
  if (!globalCache) {
    globalCache = new ResponseCache();
  }
  return globalCache;
}

export function resetCache(): void {
  if (globalCache) {
    globalCache.clear();
  }
}
