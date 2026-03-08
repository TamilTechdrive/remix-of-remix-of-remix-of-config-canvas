import knex, { Knex } from 'knex';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

function getConnectionConfig(): Knex.Config {
  const common: Partial<Knex.Config> = {
    migrations: { directory: './src/database/migrations', extension: 'ts' },
    seeds: { directory: './src/database/seeds', extension: 'ts' },
    pool: { min: 2, max: 10 },
  };

  if (env.DB_CLIENT === 'pg') {
    return {
      ...common,
      client: 'pg',
      connection: {
        host: env.PG_HOST,
        port: env.PG_PORT,
        user: env.PG_USER,
        password: env.PG_PASSWORD,
        database: env.PG_DATABASE,
        ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      },
    };
  }

  return {
    ...common,
    client: 'mysql2',
    connection: {
      host: env.MYSQL_HOST,
      port: env.MYSQL_PORT,
      user: env.MYSQL_USER,
      password: env.MYSQL_PASSWORD,
      database: env.MYSQL_DATABASE,
    },
  };
}

export const db = knex(getConnectionConfig());

export async function testConnection(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    logger.info(`Database connected (${env.DB_CLIENT})`);
    return true;
  } catch (error) {
    logger.error('Database connection failed', { error });
    return false;
  }
}

// Database abstraction layer — switch between PG and MySQL with DB_CLIENT env var
export { db as default };
