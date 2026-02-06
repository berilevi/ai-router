import { EventEmitter } from 'events';
import { logger } from './logger';

interface QueuedRequest<T> {
  id: string;
  execute: () => T | Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  priority: number;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  provider: string;
}

interface RateLimitConfig {
  maxConcurrent: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  cooldownMs: number;
}

interface QueueMetrics {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  retried: number;
  averageWaitTime: number;
  averageProcessingTime: number;
}

/**
 * Request Queue with rate limiting and concurrency control
 * Prevents provider bans and handles high concurrency gracefully
 */
export class RequestQueue extends EventEmitter {
  private queue: Map<string, QueuedRequest<unknown>[]> = new Map();
  private processing: Map<string, Set<string>> = new Map();
  private rateLimits: Map<string, RateLimitConfig> = new Map();
  private requestTimestamps: Map<string, number[]> = new Map();
  private metrics: Map<string, QueueMetrics> = new Map();
  private isProcessing: Map<string, boolean> = new Map();

  constructor() {
    super();
    this.startCleanupInterval();
  }

  /**
   * Configure rate limits for a provider
   */
  setRateLimit(provider: string, config: Partial<RateLimitConfig>): void {
    const defaultConfig: RateLimitConfig = {
      maxConcurrent: 3,
      requestsPerMinute: 20,
      requestsPerHour: 500,
      cooldownMs: 1000,
    };

    this.rateLimits.set(provider, { ...defaultConfig, ...config });
    this.queue.set(provider, []);
    this.processing.set(provider, new Set());
    this.requestTimestamps.set(provider, []);
    this.metrics.set(provider, {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      averageWaitTime: 0,
      averageProcessingTime: 0,
    });
    this.isProcessing.set(provider, false);
  }

  /**
   * Add a request to the queue
   */
  async enqueue<T>(
    provider: string,
    execute: () => T | Promise<T>,
    options: {
      priority?: number;
      maxRetries?: number;
    } = {}
  ): Promise<T> {
    if (!this.rateLimits.has(provider)) {
      this.setRateLimit(provider, {});
    }

    const id = `${provider}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { priority = 5, maxRetries = 3 } = options;

    return new Promise((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id,
        execute,
        resolve: resolve as (value: unknown) => void,
        reject: reject as (error: Error) => void,
        priority,
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries,
        provider,
      };

      const providerQueue = this.queue.get(provider)!;
      providerQueue.push(request as QueuedRequest<unknown>);
      
      // Sort by priority (lower number = higher priority)
      providerQueue.sort((a, b) => a.priority - b.priority);

      this.updateMetrics(provider);
      logger.debug(`Request ${id} queued for ${provider} (priority: ${priority})`);

      this.emit('enqueued', { id, provider, priority });
      this.processQueue(provider);
    });
  }

  /**
   * Process the queue for a provider
   */
  private async processQueue(provider: string): Promise<void> {
    if (this.isProcessing.get(provider)) {
      return;
    }

    this.isProcessing.set(provider, true);

    try {
      const rateLimit = this.rateLimits.get(provider)!;
      const processing = this.processing.get(provider)!;
      const queue = this.queue.get(provider)!;

      while (queue.length > 0) {
        // Check concurrency limit
        if (processing.size >= rateLimit.maxConcurrent) {
          logger.debug(`Concurrency limit reached for ${provider}, waiting...`);
          await this.wait(100);
          continue;
        }

        // Check rate limits
        if (!this.canMakeRequest(provider)) {
          const waitTime = this.getWaitTime(provider);
          logger.debug(`Rate limit hit for ${provider}, waiting ${waitTime}ms`);
          this.emit('rateLimit', { provider, waitTime });
          await this.wait(Math.min(waitTime, 5000));
          continue;
        }

        // Get next request
        const request = queue.shift();
        if (!request) continue;

        processing.add(request.id);
        this.recordRequest(provider);
        this.updateMetrics(provider);

        // Execute request
        this.executeRequest(request);
      }
    } finally {
      this.isProcessing.set(provider, false);
    }
  }

  /**
   * Execute a single request with retry logic
   */
  private async executeRequest<T>(request: QueuedRequest<T>): Promise<void> {
    const startTime = Date.now();
    const processing = this.processing.get(request.provider)!;

    try {
      logger.debug(`Executing request ${request.id}`);
      this.emit('processing', { id: request.id, provider: request.provider });

      const result = await request.execute();
      
      const processingTime = Date.now() - startTime;
      this.updateProcessingTime(request.provider, processingTime);
      
      request.resolve(result);
      this.emit('completed', { 
        id: request.id, 
        provider: request.provider, 
        processingTime 
      });
      
      logger.debug(`Request ${request.id} completed in ${processingTime}ms`);
    } catch (error) {
      const shouldRetry = request.retryCount < request.maxRetries;
      
      if (shouldRetry && this.isRetryableError(error as Error)) {
        request.retryCount++;
        
        const metrics = this.metrics.get(request.provider)!;
        metrics.retried++;
        
        const delay = Math.pow(2, request.retryCount) * 1000; // Exponential backoff
        logger.warn(`Request ${request.id} failed, retrying (${request.retryCount}/${request.maxRetries}) after ${delay}ms`);
        
        this.emit('retry', { 
          id: request.id, 
          provider: request.provider, 
          retryCount: request.retryCount,
          delay 
        });
        
        await this.wait(delay);
        
        // Re-queue with higher priority
        const queue = this.queue.get(request.provider)!;
        request.priority = Math.max(1, request.priority - 1);
        queue.push(request as QueuedRequest<unknown>);
        queue.sort((a, b) => a.priority - b.priority);
      } else {
        request.reject(error as Error);
        this.emit('failed', { 
          id: request.id, 
          provider: request.provider, 
          error 
        });
        
        const metrics = this.metrics.get(request.provider)!;
        metrics.failed++;
        
        logger.error(`Request ${request.id} failed permanently:`, error);
      }
    } finally {
      processing.delete(request.id);
      this.updateMetrics(request.provider);
      
      // Continue processing queue
      setImmediate(() => this.processQueue(request.provider));
    }
  }

  /**
   * Check if we can make a request based on rate limits
   */
  private canMakeRequest(provider: string): boolean {
    const rateLimit = this.rateLimits.get(provider)!;
    const timestamps = this.requestTimestamps.get(provider)!;
    const now = Date.now();

    // Clean old timestamps
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;
    
    const recentRequests = timestamps.filter((t) => t > oneMinuteAgo);
    const hourlyRequests = timestamps.filter((t) => t > oneHourAgo);

    return (
      recentRequests.length < rateLimit.requestsPerMinute &&
      hourlyRequests.length < rateLimit.requestsPerHour
    );
  }

  /**
   * Get wait time until next request can be made
   */
  private getWaitTime(provider: string): number {
    const rateLimit = this.rateLimits.get(provider)!;
    const timestamps = this.requestTimestamps.get(provider)!;
    const now = Date.now();

    const oneMinuteAgo = now - 60000;
    const recentRequests = timestamps.filter((t) => t > oneMinuteAgo);

    if (recentRequests.length >= rateLimit.requestsPerMinute) {
      const oldestRecent = Math.min(...recentRequests);
      return 60000 - (now - oldestRecent) + 100;
    }

    return rateLimit.cooldownMs;
  }

  /**
   * Record a request timestamp
   */
  private recordRequest(provider: string): void {
    const timestamps = this.requestTimestamps.get(provider)!;
    timestamps.push(Date.now());
    
    // Keep only last hour of timestamps
    const oneHourAgo = Date.now() - 3600000;
    const filtered = timestamps.filter((t) => t > oneHourAgo);
    this.requestTimestamps.set(provider, filtered);
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const retryableMessages = [
      'timeout',
      'rate limit',
      'too many requests',
      '429',
      '503',
      '502',
      '504',
      'network error',
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
    ];

    const errorMessage = error.message.toLowerCase();
    return retryableMessages.some((msg) => errorMessage.includes(msg));
  }

  /**
   * Wait for a specified duration
   */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Update metrics for a provider
   */
  private updateMetrics(provider: string): void {
    const queue = this.queue.get(provider) || [];
    const processing = this.processing.get(provider) || new Set();
    const metrics = this.metrics.get(provider)!;

    metrics.pending = queue.length;
    metrics.processing = processing.size;
  }

  /**
   * Update average processing time
   */
  private updateProcessingTime(provider: string, time: number): void {
    const metrics = this.metrics.get(provider)!;
    const completed = metrics.completed;
    
    metrics.averageProcessingTime = 
      (metrics.averageProcessingTime * completed + time) / (completed + 1);
    metrics.completed++;
  }

  /**
   * Get metrics for all providers or a specific provider
   */
  getMetrics(provider?: string): Record<string, QueueMetrics> | QueueMetrics | null {
    if (provider) {
      return this.metrics.get(provider) || null;
    }
    
    const result: Record<string, QueueMetrics> = {};
    for (const [key, value] of this.metrics) {
      result[key] = { ...value };
    }
    return result;
  }

  /**
   * Get queue status for a provider
   */
  getStatus(provider: string): {
    queued: number;
    processing: number;
    rateLimit: RateLimitConfig | undefined;
  } {
    return {
      queued: this.queue.get(provider)?.length || 0,
      processing: this.processing.get(provider)?.size || 0,
      rateLimit: this.rateLimits.get(provider),
    };
  }

  /**
   * Clear all queues and reset metrics
   */
  clear(): void {
    for (const [, queue] of this.queue) {
      // Reject all pending requests
      for (const request of queue) {
        request.reject(new Error('Queue cleared'));
      }
      queue.length = 0;
    }
    
    for (const processing of this.processing.values()) {
      processing.clear();
    }
    
    logger.info('Request queue cleared');
  }

  /**
   * Start cleanup interval for old timestamps
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const oneHourAgo = Date.now() - 3600000;

      for (const [provider, timestamps] of this.requestTimestamps) {
        const filtered = timestamps.filter((t) => t > oneHourAgo);
        this.requestTimestamps.set(provider, filtered);
      }
    }, 60000); // Clean every minute
  }
}

// Singleton instance
export const requestQueue = new RequestQueue();

export default requestQueue;
