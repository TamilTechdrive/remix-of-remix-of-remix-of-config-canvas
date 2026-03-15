<?php
/**
 * JWT Authentication Service - PHP 7.4 compatible
 */

namespace App\Services;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use App\Config\Database;
use App\Config\Env;

class AuthService
{
    private Database $db;
    private string $jwtSecret;
    private int $jwtExpiry;
    private int $refreshExpiry;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->jwtSecret = Env::get('JWT_SECRET', 'default-secret');
        $this->jwtExpiry = Env::getInt('JWT_EXPIRY', 900);
        $this->refreshExpiry = Env::getInt('JWT_REFRESH_EXPIRY', 604800);
    }

    /**
     * @param array{email: string, username: string, password: string, displayName?: string} $data
     * @return array{success: bool, userId?: string, error?: string}
     */
    public function register(array $data): array
    {
        $existing = $this->db->fetchOne(
            'SELECT id FROM users WHERE email = :email OR username = :username',
            ['email' => $data['email'], 'username' => $data['username']]
        );
        if ($existing) {
            return ['success' => false, 'error' => 'Email or username already exists'];
        }

        $userId = $this->generateUuid();
        $passwordHash = password_hash($data['password'], PASSWORD_BCRYPT, ['cost' => 12]);

        $this->db->execute(
            'INSERT INTO users (id, email, username, password_hash, display_name, created_at, updated_at) 
             VALUES (:id, :email, :username, :password_hash, :display_name, NOW(), NOW())',
            [
                'id' => $userId,
                'email' => $data['email'],
                'username' => $data['username'],
                'password_hash' => $passwordHash,
                'display_name' => $data['displayName'] ?? $data['username'],
            ]
        );

        // Assign default role
        $this->db->execute(
            'INSERT INTO user_roles (id, user_id, role) VALUES (:id, :user_id, :role)',
            ['id' => $this->generateUuid(), 'user_id' => $userId, 'role' => 'user']
        );

        return ['success' => true, 'userId' => $userId];
    }

    /**
     * @param string $email
     * @param string $password
     * @param string|null $fingerprint
     * @return array{success: bool, accessToken?: string, refreshToken?: string, user?: array, error?: string}
     */
    public function login(string $email, string $password, ?string $fingerprint = null): array
    {
        $user = $this->db->fetchOne(
            'SELECT * FROM users WHERE email = :email AND is_active = 1',
            ['email' => $email]
        );

        if (!$user || !password_verify($password, $user['password_hash'])) {
            // Track failed attempt
            if ($user) {
                $this->db->execute(
                    'UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = :id',
                    ['id' => $user['id']]
                );
            }
            return ['success' => false, 'error' => 'Invalid credentials'];
        }

        // Check lockout
        if ((int)$user['failed_login_attempts'] >= 5) {
            return ['success' => false, 'error' => 'Account locked due to too many failed attempts'];
        }

        // Reset failed attempts
        $this->db->execute(
            'UPDATE users SET failed_login_attempts = 0, last_login = NOW() WHERE id = :id',
            ['id' => $user['id']]
        );

        $accessToken = $this->generateAccessToken($user['id'], $user['email']);
        $refreshToken = $this->generateRefreshToken($user['id'], $fingerprint);

        // Get roles
        $roles = $this->db->fetchAll(
            'SELECT role FROM user_roles WHERE user_id = :uid',
            ['uid' => $user['id']]
        );

        return [
            'success' => true,
            'accessToken' => $accessToken,
            'refreshToken' => $refreshToken,
            'user' => [
                'id' => $user['id'],
                'email' => $user['email'],
                'username' => $user['username'],
                'displayName' => $user['display_name'],
                'roles' => array_column($roles, 'role'),
            ],
        ];
    }

    public function generateAccessToken(string $userId, string $email): string
    {
        $payload = [
            'sub' => $userId,
            'email' => $email,
            'iat' => time(),
            'exp' => time() + $this->jwtExpiry,
            'type' => 'access',
        ];
        return JWT::encode($payload, $this->jwtSecret, 'HS256');
    }

    public function generateRefreshToken(string $userId, ?string $fingerprint = null): string
    {
        $tokenId = $this->generateUuid();
        $expiresAt = date('Y-m-d H:i:s', time() + $this->refreshExpiry);

        $this->db->execute(
            'INSERT INTO refresh_tokens (id, user_id, device_fingerprint, expires_at, created_at) 
             VALUES (:id, :user_id, :fingerprint, :expires_at, NOW())',
            [
                'id' => $tokenId,
                'user_id' => $userId,
                'fingerprint' => $fingerprint,
                'expires_at' => $expiresAt,
            ]
        );

        $payload = [
            'sub' => $userId,
            'jti' => $tokenId,
            'iat' => time(),
            'exp' => time() + $this->refreshExpiry,
            'type' => 'refresh',
        ];
        return JWT::encode($payload, $this->jwtSecret, 'HS256');
    }

    /**
     * @param string $token
     * @return array{userId: string, email: string}|null
     */
    public function verifyAccessToken(string $token): ?array
    {
        try {
            $decoded = JWT::decode($token, new Key($this->jwtSecret, 'HS256'));
            if ($decoded->type !== 'access') return null;
            return ['userId' => $decoded->sub, 'email' => $decoded->email];
        } catch (\Exception $e) {
            return null;
        }
    }

    /**
     * @param string $token
     * @return array{accessToken: string, refreshToken: string, user: array}|null
     */
    public function refreshAccessToken(string $token): ?array
    {
        try {
            $decoded = JWT::decode($token, new Key($this->jwtSecret, 'HS256'));
            if ($decoded->type !== 'refresh') return null;

            // Check if refresh token exists and isn't revoked
            $stored = $this->db->fetchOne(
                'SELECT * FROM refresh_tokens WHERE id = :id AND revoked = 0 AND expires_at > NOW()',
                ['id' => $decoded->jti]
            );
            if (!$stored) return null;

            // Revoke old token and issue new pair
            $this->db->execute(
                'UPDATE refresh_tokens SET revoked = 1 WHERE id = :id',
                ['id' => $decoded->jti]
            );

            $user = $this->db->fetchOne('SELECT * FROM users WHERE id = :id', ['id' => $decoded->sub]);
            if (!$user) return null;

            $newAccess = $this->generateAccessToken($user['id'], $user['email']);
            $newRefresh = $this->generateRefreshToken($user['id'], $stored['device_fingerprint']);

            $roles = $this->db->fetchAll(
                'SELECT role FROM user_roles WHERE user_id = :uid',
                ['uid' => $user['id']]
            );

            return [
                'accessToken' => $newAccess,
                'refreshToken' => $newRefresh,
                'user' => [
                    'id' => $user['id'],
                    'email' => $user['email'],
                    'username' => $user['username'],
                    'displayName' => $user['display_name'],
                    'roles' => array_column($roles, 'role'),
                ],
            ];
        } catch (\Exception $e) {
            return null;
        }
    }

    public function logout(string $userId): void
    {
        $this->db->execute(
            'UPDATE refresh_tokens SET revoked = 1 WHERE user_id = :uid',
            ['uid' => $userId]
        );
    }

    private function generateUuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
