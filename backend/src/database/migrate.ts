import { db, testConnection } from './connection.js';
import { logger } from '../utils/logger.js';

export async function migrate() {
  const connected = await testConnection();
  if (!connected) {
    logger.error('Cannot run migrations - database not connected');
    process.exit(1);
  }
  await db.migrate.latest();
  logger.info('Migrations completed');
  await db.destroy();
}

migrate().catch((err) => {
  logger.error('Migration failed', { error: err });
  process.exit(1);
});
