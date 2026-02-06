import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { serverConfig } from './utils/config';
import { configValidator } from './utils/configValidator';
import { logger, morganStream } from './utils/logger';
import { ProviderFactory } from './providers';
import { sessionManager } from './utils/sessionManager';
import { copilotSessionManager } from './utils/copilotSessionManager';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import apiRoutes from './routes/api';
import healthRoutes from './routes/health';
import metricsRoutes from './routes/metrics';
import anthropicRoutes from './routes/anthropic';

class Server {
  public app: Application;

  constructor() {
    this.app = express();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares(): void {
    // Security middleware with comprehensive headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      dnsPrefetchControl: { allow: false },
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
    }));

    // CORS configuration
    this.app.use(cors({
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Allow all origins in development
        if (process.env.NODE_ENV === 'development') {
          callback(null, true);
          return;
        }
        
        // In production, you might want to restrict origins
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
      ],
      exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
      ],
      credentials: true,
      maxAge: 86400, // 24 hours
    }));

    // Rate limiting with custom headers
    const limiter = rateLimit({
      windowMs: serverConfig.rateLimitWindowMs,
      max: serverConfig.rateLimitMaxRequests,
      message: {
        error: 'Too many requests, please try again later.',
        retryAfter: Math.ceil(serverConfig.rateLimitWindowMs / 1000),
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req: Request, res: Response) => {
        logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil(serverConfig.rateLimitWindowMs / 1000),
        });
      },
    });
    this.app.use(limiter);

    // Body parsing with size limits
    this.app.use(express.json({ 
      limit: '50mb',
      strict: true,
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '50mb',
    }));

    // Request logging
    this.app.use(morgan('combined', { stream: morganStream }));

    // Add request ID for tracing
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      (req as Request & { id: string }).id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-ID', (req as Request & { id: string }).id);
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check
    this.app.use('/health', healthRoutes);

    // Metrics endpoints
    this.app.use('/metrics', metricsRoutes);

    // Ollama-compatible API routes
    this.app.use('/api', apiRoutes);

    // Anthropic Messages API routes (for Claude Code compatibility)
    this.app.use('/v1', anthropicRoutes);

    // Root endpoint with API documentation
    this.app.get('/', (_req: Request, res: Response) => {
      res.json({
        name: 'AI Router',
        description: 'Multi-provider AI router with Ollama and Anthropic API compatibility',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        endpoints: {
          'GET /health': 'Health check',
          'GET /health/providers': 'Provider status',
          'GET /metrics': 'Prometheus metrics',
          'GET /metrics/json': 'JSON metrics',
          'GET /metrics/summary': 'Metrics summary',
          'GET /api/tags': 'List available models (Ollama API)',
          'POST /api/generate': 'Generate completion (Ollama API)',
          'POST /api/chat': 'Chat completion (Ollama API)',
          'POST /api/embed': 'Generate embeddings (Ollama API)',
          'POST /v1/messages': 'Create message (Anthropic API)',
          'GET /v1/models': 'List models (Anthropic API)',
        },
        documentation: 'https://github.com/yourusername/ai-router',
        features: [
          'Multi-provider support (Copilot, Gemini, OpenAI, Anthropic)',
          'Anthropic Messages API compatibility for Claude Code',
          'Request queue with rate limiting',
          'Session persistence for conversations',
          'True streaming responses with SSE',
          'Error recovery and retry logic',
          'Comprehensive metrics and monitoring',
        ],
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Validate configuration
      logger.info('Validating configuration...');
      const validation = configValidator.validate();
      
      if (!validation.valid) {
        logger.error('Configuration validation failed:');
        validation.errors.forEach((err) => logger.error(`  - ${err}`));
        process.exit(1);
      }

      if (validation.warnings.length > 0) {
        logger.warn('Configuration warnings:');
        validation.warnings.forEach((warn) => logger.warn(`  - ${warn}`));
      }

      // Log configuration summary
      const summary = configValidator.getConfigSummary();
      logger.info('Configuration:', JSON.stringify(summary, null, 2));

      // Clean up expired sessions
      await sessionManager.cleanupExpiredSessions();

      // Initialize all providers
      await ProviderFactory.initializeAll();

      // Start server
      this.app.listen(serverConfig.port, () => {
        logger.info(`🚀 AI Router running on port ${serverConfig.port}`);
        logger.info(`📚 API Documentation: http://localhost:${serverConfig.port}/`);
        logger.info(`❤️  Health Check: http://localhost:${serverConfig.port}/health`);
        logger.info(`📊 Metrics: http://localhost:${serverConfig.port}/metrics`);
        logger.info(`🤖 Ollama API: http://localhost:${serverConfig.port}/api`);
        logger.info(`🔮 Anthropic API: http://localhost:${serverConfig.port}/v1/messages`);
        logger.info(`📍 Claude Code config: ANTHROPIC_BASE_URL=http://localhost:${serverConfig.port}`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    logger.info('Shutting down server...');

    // Stop auto-save
    sessionManager.stopAutoSave();

    // Clean up Copilot sessions
    await copilotSessionManager.cleanupAll();

    // Clean up providers
    await ProviderFactory.cleanupAll();

    logger.info('Server stopped');
  }
}

// Create and start server
const server = new Server();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  server.stop().then(() => process.exit(1));
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
server.start();

export default server;
