<?php
/**
 * Audit Routes - PHP 7.4 compatible
 */

namespace App\Routes;

use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use App\Config\Database;

class AuditRoutes
{
    private function json(Response $response, $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    public function list(Request $request, Response $response): Response
    {
        $db = Database::getInstance();
        $params = $request->getQueryParams();
        $sql = 'SELECT a.*, u.email, u.username FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id';
        $binds = [];
        $where = [];
        if (!empty($params['event'])) { $where[] = 'a.event = :event'; $binds['event'] = $params['event']; }
        if (!empty($where)) $sql .= ' WHERE ' . implode(' AND ', $where);
        $sql .= ' ORDER BY a.created_at DESC';
        $page = max(1, (int)($params['page'] ?? 1));
        $limit = min(100, max(1, (int)($params['limit'] ?? 50)));
        $sql .= sprintf(' LIMIT %d OFFSET %d', $limit, ($page - 1) * $limit);
        $logs = $db->fetchAll($sql, $binds);
        return $this->json($response, $logs);
    }

    public function dashboard(Request $request, Response $response): Response
    {
        $db = Database::getInstance();
        $totalEvents = $db->fetchOne('SELECT COUNT(*) as cnt FROM audit_logs');
        $recentEvents = $db->fetchAll(
            'SELECT event, COUNT(*) as cnt FROM audit_logs WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) GROUP BY event ORDER BY cnt DESC'
        );
        $topUsers = $db->fetchAll(
            'SELECT u.username, COUNT(*) as cnt FROM audit_logs a JOIN users u ON a.user_id = u.id WHERE a.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY u.username ORDER BY cnt DESC LIMIT 10'
        );
        return $this->json($response, [
            'totalEvents' => $totalEvents['cnt'] ?? 0,
            'recentEvents' => $recentEvents,
            'topUsers' => $topUsers,
        ]);
    }
}
