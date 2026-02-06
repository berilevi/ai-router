import { Router, Request, Response } from 'express';
import { ProviderFactory } from '../providers';
import { providerConfigs, getAvailableModels } from '../utils/config';
import { requestQueue } from '../utils/requestQueue';
import { sessionManager } from '../utils/sessionManager';
import { metricsCollector } from '../utils/metrics';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /health - Health check endpoint
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const providers = ProviderFactory.getAvailableProviders();
    const allModels = getAvailableModels();
    const systemMetrics = metricsCollector.getSystemMetrics();

    const health = {
      status: providers.length > 0 ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      system: {
        memory: systemMetrics.memory,
        cpu: {
          loadAvg: systemMetrics.cpu.loadAvg,
        },
        activeConnections: systemMetrics.activeConnections,
      },
      providers: providers.map((p) => ({
        name: p.getInfo().name,
        type: p.getInfo().type,
        available: p.isAvailable(),
      })),
      models: {
        total: allModels.length,
        available: allModels,
      },
    };

    res.status(providers.length > 0 ? 200 : 503).json(health);
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: (error as Error).message,
    });
  }
});

/**
 * GET /health/providers - Detailed provider status
 */
router.get('/providers', async (_req: Request, res: Response) => {
  try {
    const providerStatus = providerConfigs.map((config) => {
      const provider = ProviderFactory.getProvider(config.type);
      const queueStatus = requestQueue.getStatus(config.type);
      
      return {
        name: config.name,
        type: config.type,
        enabled: config.enabled,
        available: provider?.isAvailable() || false,
        models: config.models,
        default_model: config.defaultModel,
        priority: config.priority,
        queue: queueStatus,
      };
    });

    res.json({
      providers: providerStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Provider status error:', error);
    res.status(500).json({ error: 'Failed to get provider status' });
  }
});

/**
 * GET /health/queue - Queue status
 */
router.get('/queue', async (_req: Request, res: Response) => {
  try {
    const queueMetrics = requestQueue.getMetrics();
    
    res.json({
      queues: queueMetrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Queue status error:', error);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

/**
 * GET /health/sessions - Session status
 */
router.get('/sessions', async (_req: Request, res: Response) => {
  try {
    const sessions = await sessionManager.listSessions();
    
    res.json({
      sessions: sessions.map((s) => ({
        provider: s.provider,
        age_hours: Math.round(s.age / 3600000),
        age_days: (s.age / 86400000).toFixed(1),
        valid: s.age < 7 * 24 * 60 * 60 * 1000, // 7 days
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Session status error:', error);
    res.status(500).json({ error: 'Failed to get session status' });
  }
});

/**
 * GET /health/ready - Readiness probe for Kubernetes
 */
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    const providers = ProviderFactory.getAvailableProviders();
    
    if (providers.length === 0) {
      return res.status(503).json({
        ready: false,
        reason: 'No providers available',
      });
    }

    res.json({
      ready: true,
      providers: providers.length,
    });
  } catch (error) {
    res.status(503).json({
      ready: false,
      reason: (error as Error).message,
    });
  }
});

/**
 * GET /health/live - Liveness probe for Kubernetes
 */
router.get('/live', async (_req: Request, res: Response) => {
  // Simple liveness check - if we can respond, we're alive
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
  });
});

export default router;
