import { Router, Request, Response } from 'express';
import { metricsCollector } from '../utils/metrics';
import { requestQueue } from '../utils/requestQueue';
import { getCache } from '../utils/cache';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /metrics - Prometheus-compatible metrics endpoint
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const metrics = metricsCollector.getPrometheusMetrics();
    const cacheStats = getCache().getStats();

    // Add cache metrics to Prometheus output
    const cacheMetrics = `
# HELP cache_hits_total Total number of cache hits
# TYPE cache_hits_total counter
cache_hits_total ${cacheStats.hits}

# HELP cache_misses_total Total number of cache misses
# TYPE cache_misses_total counter
cache_misses_total ${cacheStats.misses}

# HELP cache_hit_rate Current cache hit rate percentage
# TYPE cache_hit_rate gauge
cache_hit_rate ${cacheStats.hitRate}

# HELP cache_size_bytes Current cache size in bytes
# TYPE cache_size_bytes gauge
cache_size_bytes ${cacheStats.size}

# HELP cache_entries Number of cached entries
# TYPE cache_entries gauge
cache_entries ${cacheStats.entries}

# HELP cache_avg_entry_size_bytes Average entry size in bytes
# TYPE cache_avg_entry_size_bytes gauge
cache_avg_entry_size_bytes ${cacheStats.averageEntrySize}
`;

    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics + cacheMetrics);
  } catch (error) {
    logger.error('Error generating Prometheus metrics:', error);
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

/**
 * GET /metrics/json - JSON format metrics
 */
router.get('/json', async (_req: Request, res: Response) => {
  try {
    const metrics = metricsCollector.getJSONMetrics();

    // Add queue metrics
    const queueMetrics = requestQueue.getMetrics();

    // Add cache metrics
    const cacheStats = getCache().getStats();
    const costSavings = getCache().calculateCostSavings();

    res.json({
      ...metrics,
      queues: queueMetrics,
      cache: {
        ...cacheStats,
        estimatedCostSavingsUSD: Math.round(costSavings * 10000) / 10000,
      },
    });
  } catch (error) {
    logger.error('Error generating JSON metrics:', error);
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

/**
 * GET /metrics/summary - Human-readable metrics summary
 */
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const metrics = metricsCollector.getMetrics();
    const queueMetrics = requestQueue.getMetrics();
    
    const summary = {
      timestamp: new Date().toISOString(),
      uptime: formatUptime(process.uptime()),
      requests: {
        total: metrics.total,
        successful: metrics.successful,
        failed: metrics.failed,
        success_rate: metrics.total > 0 
          ? ((metrics.successful / metrics.total) * 100).toFixed(1) + '%'
          : '0%',
      },
      performance: {
        avg_response_time: Math.round(metrics.duration.avg) + 'ms',
        p95_response_time: Math.round(metrics.duration.p95) + 'ms',
        p99_response_time: Math.round(metrics.duration.p99) + 'ms',
      },
      tokens: {
        input: metrics.tokens.input.toLocaleString(),
        output: metrics.tokens.output.toLocaleString(),
        total: metrics.tokens.total.toLocaleString(),
      },
      system: {
        memory_usage: metrics.system.memory.used + 'MB',
        memory_percent: metrics.system.memory.percent + '%',
        active_connections: metrics.system.activeConnections,
      },
      queues: queueMetrics,
    };
    
    res.json(summary);
  } catch (error) {
    logger.error('Error generating metrics summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

/**
 * POST /metrics/reset - Reset all metrics (admin only)
 */
router.post('/reset', async (req: Request, res: Response) => {
  try {
    // In production, this should require authentication
    if (process.env.NODE_ENV === 'production') {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${process.env.METRICS_RESET_TOKEN}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    metricsCollector.reset();
    
    res.json({
      message: 'Metrics reset successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error resetting metrics:', error);
    res.status(500).json({ error: 'Failed to reset metrics' });
  }
});

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

export default router;
