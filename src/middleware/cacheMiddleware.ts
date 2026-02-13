import { Request, Response, NextFunction } from 'express';
import { getCache } from '../utils/cache';
import { logger } from '../utils/logger';

/**
 * Cache middleware for request/response caching
 * Intercepts /api/chat and /api/generate requests
 */
export function cacheMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only cache specific endpoints
  const cacheable = req.path === '/api/chat' || req.path === '/api/generate';

  if (!cacheable) {
    next();
    return;
  }

  // Don't cache streaming requests
  if (req.body?.stream === true) {
    next();
    return;
  }

  // Don't cache requests with tools/functions
  if (req.body?.tools && Array.isArray(req.body.tools) && req.body.tools.length > 0) {
    next();
    return;
  }

  // Don't cache requests with empty messages
  if (!req.body?.messages || !Array.isArray(req.body.messages) || req.body.messages.length === 0) {
    next();
    return;
  }

  const cache = getCache();

  // Generate cache key
  const cacheKey = cache.generateKey({
    model: req.body.model,
    messages: req.body.messages,
    system: req.body.system,
    temperature: req.body.temperature,
    topP: req.body.top_p,
    maxTokens: req.body.max_tokens,
    provider: req.body.provider,
  });

  // Check cache first
  const cachedResponse = cache.get(cacheKey);

  if (cachedResponse) {
    // Add cache headers
    res.set('X-Cache-Status', 'HIT');
    res.set('X-Cache-Key', cacheKey.substring(0, 16));

    logger.debug(`Serving cached response for ${req.path}`, {
      key: cacheKey.substring(0, 8),
      model: req.body.model,
    });

    res.json(cachedResponse);
    return;
  }

  // Cache miss - intercept response before sending
  const originalJson = res.json;

  res.json = function (body: any) {
    // Only cache successful responses (200-299)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      // Don't cache error responses or empty bodies
      if (body && !body.error) {
        cache.set(cacheKey, body);

        logger.debug(`Cached response for ${req.path}`, {
          key: cacheKey.substring(0, 8),
          model: req.body.model,
          size: JSON.stringify(body).length,
        });
      }
    }

    // Add cache headers
    res.set('X-Cache-Status', 'MISS');
    res.set('X-Cache-Key', cacheKey.substring(0, 16));

    // Call original json method
    return originalJson.call(this, body);
  };

  next();
}

/**
 * Middleware to add cache statistics endpoint
 */
export function cacheStatsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/cache/stats') {
    const cache = getCache();
    const stats = cache.getStats();
    const costSavings = cache.calculateCostSavings();

    res.json({
      cache: {
        ...stats,
        costSavingUSD: Math.round(costSavings * 10000) / 10000,
      },
    });
    return;
  }

  if (req.path === '/cache/clear' && req.method === 'POST') {
    const cache = getCache();
    cache.clear();
    logger.info('Cache cleared via API');
    res.json({ message: 'Cache cleared successfully' });
    return;
  }

  next();
}
