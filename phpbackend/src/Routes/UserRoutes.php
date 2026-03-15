<?php
/**
 * User Routes - PHP 7.4 compatible
 */

namespace App\Routes;

use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use App\Config\Database;

class UserRoutes
{
    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    private function json(Response $response, $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    public function list(Request $request, Response $response): Response
    {
        $db = Database::getInstance();
        $users = $db->fetchAll('SELECT id, email, username, display_name, is_active, created_at, last_login FROM users ORDER BY created_at DESC');
        foreach ($users as &$u) {
            $roles = $db->fetchAll('SELECT role FROM user_roles WHERE user_id = :uid', ['uid' => $u['id']]);
            $u['roles'] = array_column($roles, 'role');
        }
        return $this->json($response, $users);
    }

    public function get(Request $request, Response $response, array $args): Response
    {
        $db = Database::getInstance();
        $user = $db->fetchOne(
            'SELECT id, email, username, display_name, is_active, created_at, last_login FROM users WHERE id = :id',
            ['id' => $args['id']]
        );
        if (!$user) return $this->json($response, ['error' => 'Not found'], 404);
        $roles = $db->fetchAll('SELECT role FROM user_roles WHERE user_id = :uid', ['uid' => $args['id']]);
        $user['roles'] = array_column($roles, 'role');
        return $this->json($response, $user);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $body = $request->getParsedBody() ?? [];
        $db = Database::getInstance();
        $sets = [];
        $params = ['id' => $args['id']];
        if (isset($body['displayName'])) { $sets[] = 'display_name = :dn'; $params['dn'] = $body['displayName']; }
        if (isset($body['isActive'])) { $sets[] = 'is_active = :ia'; $params['ia'] = $body['isActive'] ? 1 : 0; }
        if (empty($sets)) return $this->json($response, ['error' => 'No fields'], 400);
        $sets[] = 'updated_at = NOW()';
        $db->execute('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = :id', $params);
        return $this->json($response, ['success' => true]);
    }

    public function assignRole(Request $request, Response $response, array $args): Response
    {
        $body = $request->getParsedBody() ?? [];
        $roleName = $body['roleName'] ?? '';
        if (!in_array($roleName, ['admin', 'moderator', 'user'])) {
            return $this->json($response, ['error' => 'Invalid role'], 400);
        }
        $db = Database::getInstance();
        $existing = $db->fetchOne(
            'SELECT id FROM user_roles WHERE user_id = :uid AND role = :role',
            ['uid' => $args['id'], 'role' => $roleName]
        );
        if ($existing) return $this->json($response, ['error' => 'Role already assigned'], 409);

        $db->execute(
            'INSERT INTO user_roles (id, user_id, role) VALUES (:id, :uid, :role)',
            ['id' => $this->uuid(), 'uid' => $args['id'], 'role' => $roleName]
        );
        return $this->json($response, ['success' => true], 201);
    }

    public function removeRole(Request $request, Response $response, array $args): Response
    {
        $db = Database::getInstance();
        $db->execute(
            'DELETE FROM user_roles WHERE user_id = :uid AND role = :role',
            ['uid' => $args['id'], 'role' => $args['roleName']]
        );
        return $this->json($response, ['success' => true]);
    }
}
