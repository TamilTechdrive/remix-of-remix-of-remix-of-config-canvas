<?php
/**
 * Auth Routes - PHP 7.4 compatible
 */

namespace App\Routes;

use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use App\Services\AuthService;
use App\Config\Database;

class AuthRoutes
{
    public function register(Request $request, Response $response): Response
    {
        $body = $request->getParsedBody() ?? [];
        $email = $body['email'] ?? '';
        $username = $body['username'] ?? '';
        $password = $body['password'] ?? '';
        $displayName = $body['displayName'] ?? null;

        if (!$email || !$username || !$password) {
            $response->getBody()->write(json_encode(['error' => 'email, username, and password are required']));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
        }

        if (strlen($password) < 8) {
            $response->getBody()->write(json_encode(['error' => 'Password must be at least 8 characters']));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
        }

        $auth = new AuthService();
        $result = $auth->register([
            'email' => $email,
            'username' => $username,
            'password' => $password,
            'displayName' => $displayName,
        ]);

        if (!$result['success']) {
            $response->getBody()->write(json_encode(['error' => $result['error']]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(409);
        }

        $this->auditLog($result['userId'], 'USER_REGISTERED', 'users', $result['userId'], $request);

        $response->getBody()->write(json_encode(['success' => true, 'userId' => $result['userId']]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(201);
    }

    public function login(Request $request, Response $response): Response
    {
        $body = $request->getParsedBody() ?? [];
        $email = $body['email'] ?? '';
        $password = $body['password'] ?? '';
        $fingerprint = $body['deviceFingerprint'] ?? null;

        $auth = new AuthService();
        $result = $auth->login($email, $password, $fingerprint);

        if (!$result['success']) {
            $response->getBody()->write(json_encode(['error' => $result['error']]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(401);
        }

        $this->auditLog($result['user']['id'], 'USER_LOGIN', 'users', $result['user']['id'], $request);

        $response->getBody()->write(json_encode([
            'accessToken' => $result['accessToken'],
            'user' => $result['user'],
        ]));

        // Set refresh token as httpOnly cookie
        $cookie = sprintf(
            '__configflow_refresh=%s; HttpOnly; SameSite=Strict; Path=/; Max-Age=%d%s',
            $result['refreshToken'],
            604800,
            getenv('APP_ENV') === 'production' ? '; Secure' : ''
        );

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('Set-Cookie', $cookie);
    }

    public function refresh(Request $request, Response $response): Response
    {
        $cookies = $request->getCookieParams();
        $refreshToken = $cookies['__configflow_refresh'] ?? '';

        if (!$refreshToken) {
            $response->getBody()->write(json_encode(['error' => 'No refresh token']));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(401);
        }

        $auth = new AuthService();
        $result = $auth->refreshAccessToken($refreshToken);

        if (!$result) {
            $response->getBody()->write(json_encode(['error' => 'Invalid refresh token']));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(401);
        }

        $response->getBody()->write(json_encode([
            'accessToken' => $result['accessToken'],
            'user' => $result['user'],
        ]));

        $cookie = sprintf(
            '__configflow_refresh=%s; HttpOnly; SameSite=Strict; Path=/; Max-Age=%d%s',
            $result['refreshToken'],
            604800,
            getenv('APP_ENV') === 'production' ? '; Secure' : ''
        );

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('Set-Cookie', $cookie);
    }

    public function logout(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('userId');
        if ($userId) {
            $auth = new AuthService();
            $auth->logout($userId);
        }

        $cookie = '__configflow_refresh=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
        $response->getBody()->write(json_encode(['success' => true]));
        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('Set-Cookie', $cookie);
    }

    public function me(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('userId');
        $db = Database::getInstance();
        $user = $db->fetchOne('SELECT id, email, username, display_name, created_at FROM users WHERE id = :id', ['id' => $userId]);
        if (!$user) {
            $response->getBody()->write(json_encode(['error' => 'User not found']));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
        }
        $roles = $db->fetchAll('SELECT role FROM user_roles WHERE user_id = :uid', ['uid' => $userId]);
        $user['roles'] = array_column($roles, 'role');

        $response->getBody()->write(json_encode($user));
        return $response->withHeader('Content-Type', 'application/json');
    }

    public function changePassword(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('userId');
        $body = $request->getParsedBody() ?? [];
        $currentPassword = $body['currentPassword'] ?? '';
        $newPassword = $body['password'] ?? '';

        $db = Database::getInstance();
        $user = $db->fetchOne('SELECT password_hash FROM users WHERE id = :id', ['id' => $userId]);
        if (!$user || !password_verify($currentPassword, $user['password_hash'])) {
            $response->getBody()->write(json_encode(['error' => 'Current password is incorrect']));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
        }

        $hash = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);
        $db->execute('UPDATE users SET password_hash = :hash, updated_at = NOW() WHERE id = :id', ['hash' => $hash, 'id' => $userId]);

        $response->getBody()->write(json_encode(['success' => true]));
        return $response->withHeader('Content-Type', 'application/json');
    }

    private function auditLog(string $userId, string $event, string $resource, string $resourceId, Request $request): void
    {
        $db = Database::getInstance();
        $db->execute(
            'INSERT INTO audit_logs (user_id, event, resource, resource_id, ip_address, user_agent, created_at) 
             VALUES (:uid, :event, :resource, :rid, :ip, :ua, NOW())',
            [
                'uid' => $userId,
                'event' => $event,
                'resource' => $resource,
                'rid' => $resourceId,
                'ip' => $request->getServerParams()['REMOTE_ADDR'] ?? '',
                'ua' => $request->getHeaderLine('User-Agent'),
            ]
        );
    }
}
