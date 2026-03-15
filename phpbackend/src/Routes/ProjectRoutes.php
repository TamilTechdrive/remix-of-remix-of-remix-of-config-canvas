<?php
/**
 * Project Routes - Project → STB Model → Build hierarchy
 * PHP 7.4 compatible
 */

namespace App\Routes;

use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use App\Config\Database;

class ProjectRoutes
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
        $projects = $db->fetchAll('SELECT * FROM projects ORDER BY created_at DESC');
        foreach ($projects as &$p) {
            $p['stbModels'] = $db->fetchAll('SELECT * FROM stb_models WHERE project_id = :pid ORDER BY created_at', ['pid' => $p['id']]);
            foreach ($p['stbModels'] as &$m) {
                $m['builds'] = $db->fetchAll('SELECT * FROM builds WHERE stb_model_id = :mid ORDER BY created_at DESC', ['mid' => $m['id']]);
            }
            $p['tags'] = json_decode($p['tags'] ?? '[]', true) ?: [];
        }
        return $this->json($response, $projects);
    }

    public function create(Request $request, Response $response): Response
    {
        $body = $request->getParsedBody() ?? [];
        $userId = $request->getAttribute('userId');
        $id = $this->uuid();
        $db = Database::getInstance();
        $db->execute(
            'INSERT INTO projects (id, name, description, status, tags, created_by, created_at, updated_at)
             VALUES (:id, :name, :desc, :status, :tags, :uid, NOW(), NOW())',
            [
                'id' => $id, 'name' => $body['name'] ?? 'New Project',
                'desc' => $body['description'] ?? '', 'status' => 'active',
                'tags' => json_encode($body['tags'] ?? []), 'uid' => $userId,
            ]
        );
        return $this->json($response, ['success' => true, 'id' => $id], 201);
    }

    public function get(Request $request, Response $response, array $args): Response
    {
        $db = Database::getInstance();
        $project = $db->fetchOne('SELECT * FROM projects WHERE id = :id', ['id' => $args['id']]);
        if (!$project) return $this->json($response, ['error' => 'Not found'], 404);
        $project['tags'] = json_decode($project['tags'] ?? '[]', true) ?: [];
        $project['stbModels'] = $db->fetchAll('SELECT * FROM stb_models WHERE project_id = :pid', ['pid' => $args['id']]);
        foreach ($project['stbModels'] as &$m) {
            $m['builds'] = $db->fetchAll('SELECT * FROM builds WHERE stb_model_id = :mid ORDER BY created_at DESC', ['mid' => $m['id']]);
        }
        return $this->json($response, $project);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $body = $request->getParsedBody() ?? [];
        $db = Database::getInstance();
        $sets = [];
        $params = ['id' => $args['id']];
        foreach (['name', 'description', 'status'] as $field) {
            if (isset($body[$field])) { $sets[] = "{$field} = :{$field}"; $params[$field] = $body[$field]; }
        }
        if (isset($body['tags'])) { $sets[] = 'tags = :tags'; $params['tags'] = json_encode($body['tags']); }
        if (empty($sets)) return $this->json($response, ['error' => 'No fields to update'], 400);
        $sets[] = 'updated_at = NOW()';
        $db->execute('UPDATE projects SET ' . implode(', ', $sets) . ' WHERE id = :id', $params);
        return $this->json($response, ['success' => true]);
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $db = Database::getInstance();
        $db->execute('DELETE FROM projects WHERE id = :id', ['id' => $args['id']]);
        return $this->json($response, ['success' => true]);
    }

    public function createSTBModel(Request $request, Response $response, array $args): Response
    {
        $body = $request->getParsedBody() ?? [];
        $id = $this->uuid();
        $db = Database::getInstance();
        $db->execute(
            'INSERT INTO stb_models (id, project_id, name, description, chipset, created_at, updated_at)
             VALUES (:id, :pid, :name, :desc, :chip, NOW(), NOW())',
            ['id' => $id, 'pid' => $args['id'], 'name' => $body['name'] ?? '', 'desc' => $body['description'] ?? '', 'chip' => $body['chipset'] ?? '']
        );
        return $this->json($response, ['success' => true, 'id' => $id], 201);
    }

    public function updateSTBModel(Request $request, Response $response, array $args): Response
    {
        $body = $request->getParsedBody() ?? [];
        $db = Database::getInstance();
        $sets = [];
        $params = ['id' => $args['modelId']];
        foreach (['name', 'description', 'chipset'] as $field) {
            if (isset($body[$field])) { $sets[] = "{$field} = :{$field}"; $params[$field] = $body[$field]; }
        }
        if (empty($sets)) return $this->json($response, ['error' => 'No fields'], 400);
        $sets[] = 'updated_at = NOW()';
        $db->execute('UPDATE stb_models SET ' . implode(', ', $sets) . ' WHERE id = :id', $params);
        return $this->json($response, ['success' => true]);
    }

    public function deleteSTBModel(Request $request, Response $response, array $args): Response
    {
        $db = Database::getInstance();
        $db->execute('DELETE FROM stb_models WHERE id = :id', ['id' => $args['modelId']]);
        return $this->json($response, ['success' => true]);
    }

    public function createBuild(Request $request, Response $response, array $args): Response
    {
        $body = $request->getParsedBody() ?? [];
        $id = $this->uuid();
        $db = Database::getInstance();
        $db->execute(
            'INSERT INTO builds (id, stb_model_id, name, description, version, status, created_at, updated_at)
             VALUES (:id, :mid, :name, :desc, :ver, :status, NOW(), NOW())',
            ['id' => $id, 'mid' => $args['modelId'], 'name' => $body['name'] ?? '', 'desc' => $body['description'] ?? '',
             'ver' => $body['version'] ?? '1.0.0', 'status' => 'draft']
        );
        return $this->json($response, ['success' => true, 'id' => $id], 201);
    }

    public function updateBuild(Request $request, Response $response, array $args): Response
    {
        $body = $request->getParsedBody() ?? [];
        $db = Database::getInstance();
        $sets = [];
        $params = ['id' => $args['buildId']];
        foreach (['name', 'description', 'version', 'status'] as $field) {
            if (isset($body[$field])) { $sets[] = "{$field} = :{$field}"; $params[$field] = $body[$field]; }
        }
        if (empty($sets)) return $this->json($response, ['error' => 'No fields'], 400);
        $sets[] = 'updated_at = NOW()';
        $db->execute('UPDATE builds SET ' . implode(', ', $sets) . ' WHERE id = :id', $params);
        return $this->json($response, ['success' => true]);
    }

    public function deleteBuild(Request $request, Response $response, array $args): Response
    {
        $db = Database::getInstance();
        $db->execute('DELETE FROM builds WHERE id = :id', ['id' => $args['buildId']]);
        return $this->json($response, ['success' => true]);
    }

    public function saveParserConfig(Request $request, Response $response, array $args): Response
    {
        $body = $request->getParsedBody() ?? [];
        $userId = $request->getAttribute('userId');
        $buildId = $args['buildId'];
        $configId = $this->uuid();
        $db = Database::getInstance();

        $db->execute(
            'INSERT INTO configurations (id, name, description, config_data, status, created_by, created_at, updated_at)
             VALUES (:id, :name, :desc, :data, :status, :uid, NOW(), NOW())',
            [
                'id' => $configId, 'name' => $body['configName'] ?? 'Parser Config',
                'desc' => 'Generated from parser session', 'data' => json_encode(['buildId' => $buildId]),
                'status' => 'draft', 'uid' => $userId,
            ]
        );

        // Save nodes/edges
        if (!empty($body['nodes'])) {
            foreach ($body['nodes'] as $node) {
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
        }

        if (!empty($body['edges'])) {
            foreach ($body['edges'] as $edge) {
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
        }

        // Link to build
        $db->execute(
            'INSERT INTO build_configurations (id, build_id, configuration_id, created_at)
             VALUES (:id, :bid, :cid, NOW())',
            ['id' => $this->uuid(), 'bid' => $buildId, 'cid' => $configId]
        );

        return $this->json($response, ['success' => true, 'configId' => $configId], 201);
    }

    public function listBuildConfigs(Request $request, Response $response, array $args): Response
    {
        $db = Database::getInstance();
        $configs = $db->fetchAll(
            'SELECT c.* FROM configurations c
             INNER JOIN build_configurations bc ON bc.configuration_id = c.id
             WHERE bc.build_id = :bid ORDER BY c.created_at DESC',
            ['bid' => $args['buildId']]
        );
        return $this->json($response, $configs);
    }

    public function loadConfig(Request $request, Response $response, array $args): Response
    {
        $configId = $args['configId'];
        $db = Database::getInstance();
        $config = $db->fetchOne('SELECT * FROM configurations WHERE id = :id', ['id' => $configId]);
        if (!$config) return $this->json($response, ['error' => 'Not found'], 404);

        $nodes = $db->fetchAll('SELECT * FROM config_nodes WHERE configuration_id = :cid', ['cid' => $configId]);
        $edges = $db->fetchAll('SELECT * FROM config_edges WHERE configuration_id = :cid', ['cid' => $configId]);

        // Reconstruct ReactFlow format
        $flowNodes = array_map(function ($n) {
            return [
                'id' => $n['node_id'], 'type' => $n['node_type'],
                'position' => ['x' => (float)$n['position_x'], 'y' => (float)$n['position_y']],
                'data' => json_decode($n['node_data'], true),
            ];
        }, $nodes);

        $flowEdges = array_map(function ($e) {
            $data = json_decode($e['edge_data'], true) ?: [];
            return array_merge($data, [
                'id' => $e['edge_id'], 'source' => $e['source_node'], 'target' => $e['target_node'],
            ]);
        }, $edges);

        return $this->json($response, ['config' => $config, 'nodes' => $flowNodes, 'edges' => $flowEdges]);
    }
}
