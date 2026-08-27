import { app } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { closePool } from './db/pool.js';

const server = app.listen(config.PORT, () => {
  logger.info(`listening on :${config.PORT}`);
});

const shutdown = (signal: string): void => {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    void closePool().then(() => process.exit(0));
  });
  // Don't let a hung connection block the exit indefinitely.
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
