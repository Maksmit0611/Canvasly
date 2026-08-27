import { app } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { closePool } from './db/pool.js';
import { attachCollabServer } from './collab/yjsServer.js';

const server = app.listen(config.PORT, () => {
  logger.info(`listening on :${config.PORT}`);
});

// Collaboration shares the HTTP server, so one port serves both.
const collabServer = attachCollabServer(server);

const shutdown = (signal: string): void => {
  logger.info(`${signal} received, shutting down`);
  collabServer.close();
  server.close(() => {
    void closePool().then(() => process.exit(0));
  });
  // Don't let a hung connection block the exit indefinitely.
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
