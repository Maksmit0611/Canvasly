import pino from 'pino';
import { config, isProduction, isTest } from './config.js';

export const logger = pino({
  level: isTest ? 'silent' : isProduction ? 'info' : 'debug',
  transport: isProduction || isTest ? undefined : { target: 'pino-pretty', options: { colorize: true } },
  base: { env: config.NODE_ENV },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.credential',
    ],
    censor: '[redacted]',
  },
});
