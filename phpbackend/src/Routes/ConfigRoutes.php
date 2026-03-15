<?php
/**
 * Configuration Routes - PHP 7.4 compatible
 */

namespace App\Routes;

use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use App\Config\Database;

class ConfigRoutes
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
        $params = $request->getQueryParams();
        $sql = 'SELECT * FROM configurations';
        $binds = [];
        $where = [];
        if (!empty($params['status'])) { $where[] = 'status = :status'; $binds['status'] = $params['status']; }
        if (!empty($where)) $sql .= ' WHERE ' . implode(' AND ', $where);
        $sql .= ' ORDER BY created_at DESC';
        $page = max(1, (int)($params['page'] ?? 1));
        $limit = min(100, max(1, (int)($params['limit'] ?? 50)));
        $sql .= sprintf(' LIMIT %d OFFSET %d', $limit, ($page - 1) * $limit);
        $configs = $db->fetchAll($sql, $binds);
        return $this->json($response, $configs);
    }

    public function create(Request $request, Response $response): Response
    {
        $body = $request->getParsedBody() ?? [];
        $userId = $request->getAttribute('userId');
        $id = $this->uuid();
        $db = Database::getInstance();
        $db->execute(
            'INSERT INTO configurations (id, name, description, config_data, status, created_by, created_at, updated_at)
             VALUES (:id, :name, :desc, :data, :status, :uid, NOW(), NOW())',
            [
                'id' => $id, 'name' => $body['name'] ?? 'Untitled',
                'desc' => $body['description'] ?? '',
                'data' => json_encode($body['configData'] ?? []),
                'status' => 'draft', 'uid' => $userId,
            ]
        );
        return $this->json($response, ['success' => true, 'id' => $id], 201);
    }

    public function get(Request $request, Response $response, array $args): Response
    {
        $db = Database::getInstance();
        $config = $db->fetchOne('SELECT * FROM configurations WHERE id = :id', ['id' => $args['id']]);
        if (!$config) return $this->json($response, ['error' => 'Not found'], 404);
        $config['config_data'] = json_decode($config['config_data'], true);
        return $this->json($response, $config);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $body = $request->getParsedBody() ?? [];
        $db = Database::getInstance();
        $sets = [];
        $params = ['id' => $args['id']];
        foreach (['name', 'description', 'status'] as $f) {
            if (isset($body[$f])) { $sets[] = "{$f} = :{$f}"; $params[$f] = $body[$f]; }
        }
        if (isset($body['configData'])) { $sets[] = 'config_data = :data'; $params['data'] = json_encode($body['configData']); }
        if (empty($sets)) return $this->json($response, ['error' => 'No fields'], 400);
        $sets[] = 'updated_at = NOW()';
        $db->execute('UPDATE configurations SET ' . implode(', ', $sets) . ' WHERE id = :id', $params);
        return $this->json($response, ['success' => true]);
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $db = Database::getInstance();
        $db->execute('DELETE FROM configurations WHERE id = :id', ['id' => $args['id']]);
        return $this->json($response, ['success' => true]);
    }

    public function saveFull(Request $request, Response $response, array $args): Response
    {
        $body = $request->getParsedBody() ?? [];
        $configId = $args['id'];
        $db = Database::getInstance();

        $db->beginTransaction();
        try {
            $db->execute('DELETE FROM config_nodes WHERE configuration_id = :cid', ['cid' => $configId]);
            $db->execute('DELETE FROM config_edges WHERE configuration_id = :cid', ['cid' => $configId]);

            foreach (($body['nodes'] ?? []) as $node) {
                $db->execute(
                    'INSERT INTO config_nodes (id, configuration_id, node_id, node_type, position_x, position_y, node_data)
                     VALUES (:id, :cid, :nid, :nt, :px, :py, :nd)',
                    [
                        'id' => $this->uuid(), 'cid' => $configId, 'nid' => $node['id'],
                        'nt' => $node['type'] ?? 'configNode',
                        'px' => $node['position']['x'] ?? 0, 'py' => $node['position']['y'] ?? 0,
                        'nd' => json_encode($node['data'] ?? []),
                    ]
                );
            }

            foreach (($body['edges'] ?? []) as $edge) {
                $db->execute(
                    'INSERT INTO config_edges (id, configuration_id, edge_id, source_node, target_node, edge_type, edge_data)
                     VALUES (:id, :cid, :eid, :src, :tgt, :et, :ed)',
                    [
                        'id' => $this->uuid(), 'cid' => $configId, 'eid' => $edge['id'],
                        'src' => $edge['source'], 'tgt' => $edge['target'],
                        'et' => $edge['type'] ?? 'smoothstep', 'ed' => json_encode($edge),
                    ]
                );
            }

            $db->execute('UPDATE configurations SET updated_at = NOW() WHERE id = :id', ['id' => $configId]);
            $db->commit();
            return $this->json($response, ['success' => true]);
        } catch (\Exception $e) {
            $db->rollBack();
            return $this->json($response, ['error' => 'Save failed', 'detail' => $e->getMessage()], 500);
        }
    }

    public function loadFull(Request $request, Response $response, array $args): Response
    {
        $configId = $args['id'];
        $db = Database::getInstance();
        $config = $db->fetchOne('SELECT * FROM configurations WHERE id = :id', ['id' => $configId]);
        if (!$config) return $this->json($response, ['error' => 'Not found'], 404);

        $nodes = $db->fetchAll('SELECT * FROM config_nodes WHERE configuration_id = :cid', ['cid' => $configId]);
        $edges = $db->fetchAll('SELECT * FROM config_edges WHERE configuration_id = :cid', ['cid' => $configId]);

        $flowNodes = array_map(fn($n) => [
            'id' => $n['node_id'], 'type' => $n['node_type'],
            'position' => ['x' => (float)$n['position_x'], 'y' => (float)$n['position_y']],
            'data' => json_decode($n['node_data'], true),
        ], $nodes);

        $flowEdges = array_map(fn($e) => array_merge(json_decode($e['edge_data'], true) ?: [], [
            'id' => $e['edge_id'], 'source' => $e['source_node'], 'target' => $e['target_node'],
        ]), $edges);

        return $this->json($response, ['config' => $config, 'nodes' => $flowNodes, 'edges' => $flowEdges]);
    }

    public function createSnapshot(Request $request, Response $response, array $args): Response
    {
        $configId = $args['id'];
        $body = $request->getParsedBody() ?? [];
        $db = Database::getInstance();
        $snapshotId = $this->uuid();

        $nodes = $db->fetchAll('SELECT * FROM config_nodes WHERE configuration_id = :cid', ['cid' => $configId]);
        $edges = $db->fetchAll('SELECT * FROM config_edges WHERE configuration_id = :cid', ['cid' => $configId]);

        $db->execute(
            'INSERT INTO config_snapshots (id, configuration_id, name, description, snapshot_data, created_at)
             VALUES (:id, :cid, :name, :desc, :data, NOW())',
            [
                'id' => $snapshotId, 'cid' => $configId,
                'name' => $body['name'] ?? 'Snapshot ' . date('Y-m-d H:i'),
                'desc' => $body['description'] ?? '',
                'data' => json_encode(['nodes' => $nodes, 'edges' => $edges]),
            ]
        );

        return $this->json($response, ['success' => true, 'snapshotId' => $snapshotId], 201);
    }

    public function listSnapshots(Request $request, Response $response, array $args): Response
    {
        $db = Database::getInstance();
        $snapshots = $db->fetchAll(
            'SELECT id, configuration_id, name, description, created_at FROM config_snapshots WHERE configuration_id = :cid ORDER BY created_at DESC',
            ['cid' => $args['id']]
        );
        return $this->json($response, $snapshots);
    }

    public function restoreSnapshot(Request $request, Response $response, array $args): Response
    {
        $db = Database::getInstance();
        $snapshot = $db->fetchOne('SELECT * FROM config_snapshots WHERE id = :id', ['id' => $args['snapshotId']]);
        if (!$snapshot) return $this->json($response, ['error' => 'Snapshot not found'], 404);

        $data = json_decode($snapshot['snapshot_data'], true);
        $configId = $args['configId'];

        $db->beginTransaction();
        try {
            $db->execute('DELETE FROM config_nodes WHERE configuration_id = :cid', ['cid' => $configId]);
            $db->execute('DELETE FROM config_edges WHERE configuration_id = :cid', ['cid' => $configId]);

            foreach (($data['nodes'] ?? []) as $node) {
                $db->execute(
                    'INSERT INTO config_nodes (id, configuration_id, node_id, node_type, position_x, position_y, node_data)
                     VALUES (:id, :cid, :nid, :nt, :px, :py, :nd)',
                    [
                        'id' => $this->uuid(), 'cid' => $configId,
                        'nid' => $node['node_id'], 'nt' => $node['node_type'],
                        'px' => $node['position_x'], 'py' => $node['position_y'],
                        'nd' => $node['node_data'],
                    ]
                );
            }
            foreach (($data['edges'] ?? []) as $edge) {
                $db->execute(
                    'INSERT INTO config_edges (id, configuration_id, edge_id, source_node, target_node, edge_type, edge_data)
                     VALUES (:id, :cid, :eid, :src, :tgt, :et, :ed)',
                    [
                        'id' => $this->uuid(), 'cid' => $configId,
                        'eid' => $edge['edge_id'], 'src' => $edge['source_node'],
                        'tgt' => $edge['target_node'], 'et' => $edge['edge_type'],
                        'ed' => $edge['edge_data'],
                    ]
                );
            }
            $db->commit();
            return $this->json($response, ['success' => true]);
        } catch (\Exception $e) {
            $db->rollBack();
            return $this->json($response, ['error' => 'Restore failed'], 500);
        }
    }
}
