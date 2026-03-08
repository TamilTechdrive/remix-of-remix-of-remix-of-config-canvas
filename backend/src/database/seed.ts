import { db } from './connection.js';
import { logger } from '../utils/logger.js';

async function runSeeds() {
  await db.seed.run();
  logger.info('Seeds completed');
  await db.destroy();
}

runSeeds().catch((err) => {
  logger.error('Seed failed', { error: err });
  process.exit(1);
});
