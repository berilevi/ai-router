import { EventEmitter } from 'events';
import { logger } from './logger';

interface RequestMetrics {
  total: number;
  successful: number;
  failed: number;
  retried: number;
  cancelled: number;
  duration: {
    total: number;
    count: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  };
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  byModel: Map<string, { requests: number; tokens: number }>;
  byProvider: Map<string, { requests: number; errors: number }>;
}

interface SystemMetrics {
  uptime: number;
  memory: {
    used: number;
    total: number;
    percent: number;
  };
  cpu: {
    usage: number;
    loadAvg: number[];
  };
  activeConnections: number;
}

interface MetricSnapshot {
  timestamp: number;
  requests: RequestMetrics;
  system: SystemMetrics;
  queue: Record<string, {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }>;
}

/**
 * Metrics Collector for monitoring and observability
 * Tracks request metrics, system metrics, and provider performance
 */
export class MetricsCollector extends EventEmitter {
  private requests: RequestMetrics;
  private durations: number[] = [];
  private maxDurations = 10000; // Keep last 10k durations for percentiles
  private startTime: number;
  private activeConnections = 0;

  constructor() {
    super();
    this.startTime = Date.now();
    
    this.requests = {
      total: 0,
      successful: 0,
      failed: 0,
      retried: 0,
      cancelled: 0,
      duration: {
        total: 0,
        count: 0,
        avg: 0,
        min: Infinity,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      },
      tokens: {
        input: 0,
        output: 0,
        total: 0,
      },
      byModel: new Map(),
      byProvider: new Map(),
    };

    this.startSystemMetricsCollection();
  }

  /**
   * Record a request start
   */
  recordRequestStart(provider: string, model: string): string {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.requests.total++;
    this.activeConnections++;

    // Update provider stats
    const providerStats = this.requests.byProvider.get(provider) || { requests: 0, errors: 0 };
    providerStats.requests++;
    this.requests.byProvider.set(provider, providerStats);

    this.emit('requestStart', { id, provider, model, timestamp: Date.now() });
    
    return id;
  }

  /**
   * Record a request completion
   */
  recordRequestComplete(
    id: string,
    provider: string,
    model: string,
    duration: number,
    tokens?: { input: number; output: number }
  ): void {
    this.requests.successful++;
    this.activeConnections--;

    // Update duration stats
    this.requests.duration.total += duration;
    this.requests.duration.count++;
    this.requests.duration.avg = this.requests.duration.total / this.requests.duration.count;
    this.requests.duration.min = Math.min(this.requests.duration.min, duration);
    this.requests.duration.max = Math.max(this.requests.duration.max, duration);

    // Store duration for percentile calculation
    this.durations.push(duration);
    if (this.durations.length > this.maxDurations) {
      this.durations.shift();
    }

    // Update percentiles
    this.calculatePercentiles();

    // Update token stats
    if (tokens) {
      this.requests.tokens.input += tokens.input;
      this.requests.tokens.output += tokens.output;
      this.requests.tokens.total += tokens.input + tokens.output;
    }

    // Update model stats
    const modelStats = this.requests.byModel.get(model) || { requests: 0, tokens: 0 };
    modelStats.requests++;
    modelStats.tokens += tokens ? (tokens.input + tokens.output) : 0;
    this.requests.byModel.set(model, modelStats);

    this.emit('requestComplete', {
      id,
      provider,
      model,
      duration,
      tokens,
      timestamp: Date.now(),
    });
  }

  /**
   * Record a request failure
   */
  recordRequestFailure(
    id: string,
    provider: string,
    model: string,
    error: Error,
    duration: number
  ): void {
    this.requests.failed++;
    this.activeConnections--;

    // Update provider error stats
    const providerStats = this.requests.byProvider.get(provider) || { requests: 0, errors: 0 };
    providerStats.errors++;
    this.requests.byProvider.set(provider, providerStats);

    this.emit('requestFailure', {
      id,
      provider,
      model,
      error: error.message,
      duration,
      timestamp: Date.now(),
    });
  }

  /**
   * Record a retry
   */
  recordRetry(id: string, provider: string, attempt: number): void {
    this.requests.retried++;
    
    this.emit('retry', {
      id,
      provider,
      attempt,
      timestamp: Date.now(),
    });
  }

  /**
   * Record a request cancellation
   */
  recordCancellation(id: string, provider: string): void {
    this.requests.cancelled++;
    this.activeConnections--;
    
    this.emit('cancellation', {
      id,
      provider,
      timestamp: Date.now(),
    });
  }

  /**
   * Calculate duration percentiles
   */
  private calculatePercentiles(): void {
    if (this.durations.length === 0) return;

    const sorted = [...this.durations].sort((a, b) => a - b);
    
    this.requests.duration.p50 = this.getPercentile(sorted, 0.5);
    this.requests.duration.p95 = this.getPercentile(sorted, 0.95);
    this.requests.duration.p99 = this.getPercentile(sorted, 0.99);
  }

  /**
   * Get a percentile from sorted array
   */
  private getPercentile(sorted: number[], percentile: number): number {
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get system metrics
   */
  getSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    
    return {
      uptime: process.uptime(),
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        total: Math.round(memUsage.heapTotal / 1024 / 1024),
        percent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      },
      cpu: {
        usage: process.cpuUsage().user / 1000000, // Convert to seconds
        loadAvg: require('os').loadavg(),
      },
      activeConnections: this.activeConnections,
    };
  }

  /**
   * Get all metrics
   */
  getMetrics(): RequestMetrics & { system: SystemMetrics } {
    return {
      ...this.requests,
      system: this.getSystemMetrics(),
    };
  }

  /**
   * Get a snapshot of current metrics
   */
  getSnapshot(): MetricSnapshot {
    return {
      timestamp: Date.now(),
      requests: { ...this.requests },
      system: this.getSystemMetrics(),
      queue: {}, // Will be populated by requestQueue
    };
  }

  /**
   * Get metrics in Prometheus format
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];
    const timestamp = Date.now();

    // Request metrics
    lines.push('# HELP ollama_bridge_requests_total Total number of requests');
    lines.push('# TYPE ollama_bridge_requests_total counter');
    lines.push(`ollama_bridge_requests_total ${this.requests.total} ${timestamp}`);

    lines.push('# HELP ollama_bridge_requests_successful Total successful requests');
    lines.push('# TYPE ollama_bridge_requests_successful counter');
    lines.push(`ollama_bridge_requests_successful ${this.requests.successful} ${timestamp}`);

    lines.push('# HELP ollama_bridge_requests_failed Total failed requests');
    lines.push('# TYPE ollama_bridge_requests_failed counter');
    lines.push(`ollama_bridge_requests_failed ${this.requests.failed} ${timestamp}`);

    lines.push('# HELP ollama_bridge_requests_retried Total retried requests');
    lines.push('# TYPE ollama_bridge_requests_retried counter');
    lines.push(`ollama_bridge_requests_retried ${this.requests.retried} ${timestamp}`);

    // Duration metrics
    lines.push('# HELP ollama_bridge_request_duration_ms Request duration in milliseconds');
    lines.push('# TYPE ollama_bridge_request_duration_ms summary');
    lines.push(`ollama_bridge_request_duration_ms_avg ${this.requests.duration.avg.toFixed(2)}`);
    lines.push(`ollama_bridge_request_duration_ms_min ${this.requests.duration.min === Infinity ? 0 : this.requests.duration.min}`);
    lines.push(`ollama_bridge_request_duration_ms_max ${this.requests.duration.max}`);
    lines.push(`ollama_bridge_request_duration_ms_p50 ${this.requests.duration.p50}`);
    lines.push(`ollama_bridge_request_duration_ms_p95 ${this.requests.duration.p95}`);
    lines.push(`ollama_bridge_request_duration_ms_p99 ${this.requests.duration.p99}`);

    // Token metrics
    lines.push('# HELP ollama_bridge_tokens_input_total Total input tokens');
    lines.push('# TYPE ollama_bridge_tokens_input_total counter');
    lines.push(`ollama_bridge_tokens_input_total ${this.requests.tokens.input} ${timestamp}`);

    lines.push('# HELP ollama_bridge_tokens_output_total Total output tokens');
    lines.push('# TYPE ollama_bridge_tokens_output_total counter');
    lines.push(`ollama_bridge_tokens_output_total ${this.requests.tokens.output} ${timestamp}`);

    lines.push('# HELP ollama_bridge_tokens_total Total tokens');
    lines.push('# TYPE ollama_bridge_tokens_total counter');
    lines.push(`ollama_bridge_tokens_total ${this.requests.tokens.total} ${timestamp}`);

    // Provider metrics
    for (const [provider, stats] of this.requests.byProvider) {
      lines.push(`ollama_bridge_provider_requests{provider="${provider}"} ${stats.requests} ${timestamp}`);
      lines.push(`ollama_bridge_provider_errors{provider="${provider}"} ${stats.errors} ${timestamp}`);
    }

    // Model metrics
    for (const [model, stats] of this.requests.byModel) {
      lines.push(`ollama_bridge_model_requests{model="${model}"} ${stats.requests} ${timestamp}`);
      lines.push(`ollama_bridge_model_tokens{model="${model}"} ${stats.tokens} ${timestamp}`);
    }

    // System metrics
    const sys = this.getSystemMetrics();
    lines.push('# HELP ollama_bridge_uptime_seconds Server uptime in seconds');
    lines.push('# TYPE ollama_bridge_uptime_seconds gauge');
    lines.push(`ollama_bridge_uptime_seconds ${sys.uptime.toFixed(0)} ${timestamp}`);

    lines.push('# HELP ollama_bridge_memory_usage_mb Memory usage in MB');
    lines.push('# TYPE ollama_bridge_memory_usage_mb gauge');
    lines.push(`ollama_bridge_memory_usage_mb ${sys.memory.used} ${timestamp}`);

    lines.push('# HELP ollama_bridge_memory_usage_percent Memory usage percentage');
    lines.push('# TYPE ollama_bridge_memory_usage_percent gauge');
    lines.push(`ollama_bridge_memory_usage_percent ${sys.memory.percent} ${timestamp}`);

    lines.push('# HELP ollama_bridge_active_connections Active connections');
    lines.push('# TYPE ollama_bridge_active_connections gauge');
    lines.push(`ollama_bridge_active_connections ${sys.activeConnections} ${timestamp}`);

    return lines.join('\n') + '\n';
  }

  /**
   * Get metrics in JSON format
   */
  getJSONMetrics(): Record<string, unknown> {
    const metrics = this.getMetrics();
    
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      requests: {
        total: metrics.total,
        successful: metrics.successful,
        failed: metrics.failed,
        retried: metrics.retried,
        cancelled: metrics.cancelled,
        success_rate: metrics.total > 0 
          ? ((metrics.successful / metrics.total) * 100).toFixed(2) + '%'
          : '0%',
      },
      duration: metrics.duration,
      tokens: metrics.tokens,
      providers: Object.fromEntries(
        Array.from(metrics.byProvider.entries()).map(([k, v]) => [
          k,
          { ...v, error_rate: v.requests > 0 ? ((v.errors / v.requests) * 100).toFixed(2) + '%' : '0%' },
        ])
      ),
      models: Object.fromEntries(metrics.byModel.entries()),
      system: metrics.system,
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.requests.total = 0;
    this.requests.successful = 0;
    this.requests.failed = 0;
    this.requests.retried = 0;
    this.requests.cancelled = 0;
    this.requests.duration = {
      total: 0,
      count: 0,
      avg: 0,
      min: Infinity,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    };
    this.requests.tokens = {
      input: 0,
      output: 0,
      total: 0,
    };
    this.requests.byModel.clear();
    this.requests.byProvider.clear();
    this.durations = [];
    this.startTime = Date.now();

    logger.info('Metrics reset');
  }

  /**
   * Start collecting system metrics
   */
  private startSystemMetricsCollection(): void {
    // Emit system metrics every 30 seconds
    setInterval(() => {
      const metrics = this.getSystemMetrics();
      this.emit('systemMetrics', metrics);
    }, 30000);
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();

export default metricsCollector;
