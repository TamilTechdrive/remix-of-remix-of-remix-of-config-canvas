import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DB_CLIENT: z.enum(['pg', 'mysql2']).default('pg'),

  PG_HOST: z.string().default('localhost'),
  PG_PORT: z.coerce.number().default(5432),
  PG_USER: z.string().default('postgres'),
  PG_PASSWORD: z.string().default(''),
  PG_DATABASE: z.string().default('configflow'),

  MYSQL_HOST: z.string().default('localhost'),
  MYSQL_PORT: z.coerce.number().default(3306),
  MYSQL_USER: z.string().default('root'),
  MYSQL_PASSWORD: z.string().default(''),
  MYSQL_DATABASE: z.string().default('configflow'),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  SESSION_SECRET: z.string().min(16),

  CSRF_SECRET: z.string().min(16),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().default(5),
  LOCK_DURATION_MINUTES: z.coerce.number().default(30),
  PASSWORD_MIN_LENGTH: z.coerce.number().default(12),
  SESSION_MAX_AGE_MS: z.coerce.number().default(3600000),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
