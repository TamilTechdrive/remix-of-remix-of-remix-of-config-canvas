import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ===== USERS TABLE =====
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('email', 255).notNullable().unique();
    table.string('username', 100).notNullable().unique();
    table.string('display_name', 200).nullable();
    table.string('password_hash', 500).notNullable();
    table.boolean('is_active').defaultTo(true);
    table.boolean('email_verified').defaultTo(false);
    table.integer('failed_login_attempts').defaultTo(0);
    table.timestamp('locked_until').nullable();
    table.timestamp('last_login_at').nullable();
    table.timestamp('password_changed_at').defaultTo(knex.fn.now());
    table.string('last_login_ip', 45).nullable();
    table.text('last_user_agent').nullable();
    table.timestamps(true, true);
  });

  // ===== ROLES TABLE =====
  await knex.schema.createTable('roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('name', 50).notNullable().unique();
    table.string('description', 255).nullable();
    table.timestamps(true, true);
  });

  // ===== USER ROLES (many-to-many) =====
  await knex.schema.createTable('user_roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
    table.unique(['user_id', 'role_id']);
    table.timestamps(true, true);
  });

  // ===== PERMISSIONS TABLE =====
  await knex.schema.createTable('permissions', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('resource', 100).notNullable();
    table.string('action', 50).notNullable(); // create, read, update, delete, manage
    table.string('description', 255).nullable();
    table.unique(['resource', 'action']);
    table.timestamps(true, true);
  });

  // ===== ROLE PERMISSIONS =====
  await knex.schema.createTable('role_permissions', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
    table.uuid('permission_id').notNullable().references('id').inTable('permissions').onDelete('CASCADE');
    table.unique(['role_id', 'permission_id']);
    table.timestamps(true, true);
  });

  // ===== REFRESH TOKENS =====
  await knex.schema.createTable('refresh_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token_hash', 500).notNullable().unique();
    table.string('device_fingerprint', 500).nullable();
    table.string('ip_address', 45).nullable();
    table.text('user_agent').nullable();
    table.timestamp('expires_at').notNullable();
    table.boolean('is_revoked').defaultTo(false);
    table.timestamps(true, true);
  });

  // ===== DEVICE FINGERPRINTS =====
  await knex.schema.createTable('device_fingerprints', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('fingerprint_hash', 500).notNullable();
    table.string('device_name', 200).nullable();
    table.boolean('is_trusted').defaultTo(false);
    table.timestamp('last_seen_at').defaultTo(knex.fn.now());
    table.string('ip_address', 45).nullable();
    table.text('user_agent').nullable();
    table.timestamps(true, true);
    table.unique(['user_id', 'fingerprint_hash']);
  });

  // ===== SECURITY AUDIT LOG =====
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('event', 100).notNullable();
    table.string('resource', 100).nullable();
    table.string('resource_id', 100).nullable();
    table.jsonb('details').nullable();
    table.string('ip_address', 45).nullable();
    table.text('user_agent').nullable();
    table.string('severity', 20).defaultTo('info'); // info, warning, critical
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index(['user_id', 'created_at']);
    table.index(['event', 'created_at']);
  });

  // ===== CONFIGURATIONS (domain data) =====
  await knex.schema.createTable('configurations', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('owner_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('name', 200).notNullable();
    table.text('description').nullable();
    table.jsonb('config_data').notNullable();
    table.boolean('is_encrypted').defaultTo(false);
    table.string('encryption_key_id', 100).nullable();
    table.integer('version').defaultTo(1);
    table.string('status', 50).defaultTo('draft');
    table.timestamps(true, true);
    table.index(['owner_id', 'status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'configurations', 'audit_logs', 'device_fingerprints',
    'refresh_tokens', 'role_permissions', 'permissions',
    'user_roles', 'roles', 'users',
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
