/**
 * Request Logger
 * JSON request/response logging middleware for debugging and monitoring
 */

import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
import { copilotConfig } from './copilotModelMapping';

interface LogEntry {
  timestamp: string;
  requestId: string;
  method: string;
  path: string;
  model?: string;
  provider?: string;
  duration?: number;
  status?: number;
  error?: string;
  request?: {
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
  };
  response?: {
    body: unknown;
  };
}

/**
 * Ensure log directory exists
 */
function ensureLogDir(logDir: string): void {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (error) {
    logger.warn(`Failed to create log directory ${logDir}:`, error);
  }
}

/**
 * Write log entry to file
 */
function writeLog(logDir: string, entry: LogEntry): void {
  try {
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `requests-${date}.jsonl`);
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(logFile, line);
  } catch (error) {
    logger.warn('Failed to write request log:', error);
  }
}

/**
 * Request logging middleware
 */
export function requestLogger() {
  const logDir = copilotConfig.logDir;
  const logRequests = copilotConfig.logRequests;
  const logResponses = copilotConfig.logResponses;

  if (!logRequests && !logResponses) {
    // No-op middleware if logging is disabled
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  // Ensure log directory exists
  ensureLogDir(logDir);

  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const requestId = (req as Request & { id?: string }).id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Capture request data
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.path,
      model: req.body?.model,
    };

    if (logRequests) {
      entry.request = {
        headers: {
          'content-type': req.headers['content-type'],
          'x-session-id': req.headers['x-session-id'] as string | undefined,
          'x-api-key': req.headers['x-api-key'] ? '[REDACTED]' : undefined,
          'authorization': req.headers['authorization'] ? '[REDACTED]' : undefined,
        },
        body: sanitizeBody(req.body),
      };
    }

    // Capture response
    const originalSend = res.send;
    const originalJson = res.json;
    let responseBody: unknown;

    res.send = function (body: unknown) {
      responseBody = body;
      return originalSend.call(this, body);
    };

    res.json = function (body: unknown) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    // Log on response finish
    res.on('finish', () => {
      entry.duration = Date.now() - startTime;
      entry.status = res.statusCode;

      if (logResponses && responseBody) {
        entry.response = {
          body: typeof responseBody === 'string'
            ? tryParseJSON(responseBody)
            : responseBody,
        };
      }

      // Log to console at debug level
      if (res.statusCode >= 400) {
        logger.warn(`[${requestId}] ${req.method} ${req.path} -> ${res.statusCode} (${entry.duration}ms)`);
      } else {
        logger.debug(`[${requestId}] ${req.method} ${req.path} -> ${res.statusCode} (${entry.duration}ms)`);
      }

      // Write to file
      writeLog(logDir, entry);
    });

    next();
  };
}

/**
 * Sanitize request body to remove sensitive data
 */
function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized = { ...body as Record<string, unknown> };

  // Remove or redact sensitive fields
  if ('api_key' in sanitized) {
    sanitized.api_key = '[REDACTED]';
  }

  // Truncate very long message content for logging
  if ('messages' in sanitized && Array.isArray(sanitized.messages)) {
    sanitized.messages = sanitized.messages.map((msg: unknown) => {
      if (typeof msg !== 'object' || !msg) return msg;
      const m = { ...(msg as Record<string, unknown>) };
      if (typeof m.content === 'string' && m.content.length > 1000) {
        m.content = m.content.substring(0, 1000) + `... [truncated, total ${(msg as { content: string }).content.length} chars]`;
      }
      // Remove base64 image data
      if (Array.isArray(m.content)) {
        m.content = (m.content as Array<Record<string, unknown>>).map((block) => {
          if (block.type === 'image' && block.source) {
            return { ...block, source: { ...block.source as Record<string, unknown>, data: '[BASE64_DATA]' } };
          }
          return block;
        });
      }
      return m;
    });
  }

  return sanitized;
}

/**
 * Try to parse JSON string
 */
function tryParseJSON(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

export default requestLogger;
