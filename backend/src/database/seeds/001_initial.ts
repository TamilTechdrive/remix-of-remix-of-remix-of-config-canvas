import { Knex } from 'knex';
import argon2 from 'argon2';
import { v4 as uuid } from 'uuid';

export async function seed(knex: Knex): Promise<void> {
  await knex('user_roles').del();
  await knex('role_permissions').del();
  await knex('permissions').del();
  await knex('roles').del();
  await knex('users').del();

  // Roles
  const adminRoleId = uuid();
  const editorRoleId = uuid();
  const viewerRoleId = uuid();

  await knex('roles').insert([
    { id: adminRoleId, name: 'admin', description: 'Full system access' },
    { id: editorRoleId, name: 'editor', description: 'Can edit configurations' },
    { id: viewerRoleId, name: 'viewer', description: 'Read-only access' },
  ]);

  // Permissions
  const resources = ['configurations', 'users', 'roles', 'audit_logs'];
  const actions = ['create', 'read', 'update', 'delete', 'manage'];
  const permIds: Record<string, string> = {};

  for (const resource of resources) {
    for (const action of actions) {
      const id = uuid();
      permIds[`${resource}:${action}`] = id;
      await knex('permissions').insert({ id, resource, action, description: `${action} ${resource}` });
    }
  }

  // Admin gets all permissions
  for (const [, permId] of Object.entries(permIds)) {
    await knex('role_permissions').insert({ role_id: adminRoleId, permission_id: permId });
  }

  // Editor gets config CRUD + user read
  const editorPerms = ['configurations:create', 'configurations:read', 'configurations:update', 'configurations:delete', 'users:read'];
  for (const perm of editorPerms) {
    await knex('role_permissions').insert({ role_id: editorRoleId, permission_id: permIds[perm] });
  }

  // Viewer gets read only
  for (const resource of resources) {
    await knex('role_permissions').insert({ role_id: viewerRoleId, permission_id: permIds[`${resource}:read`] });
  }

  // Admin user
  const adminId = uuid();
  const hash = await argon2.hash('Admin@12345678!', { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
  await knex('users').insert({
    id: adminId,
    email: 'admin@configflow.dev',
    username: 'admin',
    display_name: 'System Admin',
    password_hash: hash,
    is_active: true,
    email_verified: true,
  });
  await knex('user_roles').insert({ user_id: adminId, role_id: adminRoleId });
}
