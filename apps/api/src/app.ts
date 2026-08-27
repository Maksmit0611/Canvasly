import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { config, isTest } from './config.js';
import { logger } from './logger.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.routes.js';
import { ApiError } from './errors.js';

export function createApp(): Express {
  const app = express();

  // Railway terminates TLS upstream; trust it so rate limiting and `secure`
  // cookies see the real client protocol and address.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          // pdf.js runs its parser in a worker created from a blob URL.
          workerSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'", ...config.CORS_ORIGINS],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(compression());

  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin and non-browser callers send no Origin header.
        if (!origin || config.CORS_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new ApiError('FORBIDDEN', 'Origin not allowed'));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  if (!isTest) {
    app.use(pinoHttp({ logger }));
  }

  app.use('/api', generalLimiter);
  app.use('/api', healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
