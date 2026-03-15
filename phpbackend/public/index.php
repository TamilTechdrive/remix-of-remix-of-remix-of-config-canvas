<?php
/**
 * ConfigFlow PHP Backend - Entry Point
 * PHP 7.4 Compatible
 */

require __DIR__ . '/../vendor/autoload.php';

use Slim\Factory\AppFactory;
use Slim\Routing\RouteCollectorProxy;
use App\Config\Database;
use App\Config\Env;
use App\Middleware\AuthMiddleware;
use App\Middleware\CorsMiddleware;
use App\Middleware\JsonBodyParser;

// Load environment
Env::load(__DIR__ . '/../.env');

// Create Slim app
$app = AppFactory::create();

// Middleware
$app->addBodyParsingMiddleware();
$app->add(new JsonBodyParser());
$app->add(new CorsMiddleware());
$app->addErrorMiddleware(
    Env::get('APP_ENV', 'development') === 'development',
    true,
    true
);

// Health check
$app->get('/api/health', function ($request, $response) {
    $db = Database::getInstance();
    $dbOk = $db->testConnection();
    $data = [
        'status' => $dbOk ? 'healthy' : 'degraded',
        'timestamp' => date('c'),
        'database' => $dbOk ? 'connected' : 'disconnected',
        'version' => '1.0.0',
        'runtime' => 'PHP ' . PHP_VERSION,
    ];
    $response->getBody()->write(json_encode($data));
    return $response
        ->withHeader('Content-Type', 'application/json')
        ->withStatus($dbOk ? 200 : 503);
});

// CSRF token endpoint
$app->get('/api/csrf-token', function ($request, $response) {
    $token = bin2hex(random_bytes(32));
    $_SESSION['csrf_token'] = $token;
    $response->getBody()->write(json_encode(['csrfToken' => $token]));
    return $response->withHeader('Content-Type', 'application/json');
});

// ── Auth Routes ──
$app->group('/api/auth', function (RouteCollectorProxy $group) {
    $group->post('/register', 'App\Routes\AuthRoutes:register');
    $group->post('/login', 'App\Routes\AuthRoutes:login');
    $group->post('/refresh', 'App\Routes\AuthRoutes:refresh');
    $group->post('/logout', 'App\Routes\AuthRoutes:logout');
    $group->get('/me', 'App\Routes\AuthRoutes:me')->add(new AuthMiddleware());
    $group->post('/change-password', 'App\Routes\AuthRoutes:changePassword')->add(new AuthMiddleware());
});

// ── Parser Routes ──
$app->group('/api/parser', function (RouteCollectorProxy $group) {
    $group->post('/seed', 'App\Routes\ParserRoutes:seed');
    $group->get('/sessions', 'App\Routes\ParserRoutes:listSessions');
    $group->get('/sessions/{id}', 'App\Routes\ParserRoutes:getSession');
    $group->delete('/sessions/{id}', 'App\Routes\ParserRoutes:deleteSession');
    $group->get('/sessions/{id}/export', 'App\Routes\ParserRoutes:exportSession');
})->add(new AuthMiddleware());

// ── Project Routes ──
$app->group('/api/projects', function (RouteCollectorProxy $group) {
    $group->get('', 'App\Routes\ProjectRoutes:list');
    $group->post('', 'App\Routes\ProjectRoutes:create');
    $group->get('/{id}', 'App\Routes\ProjectRoutes:get');
    $group->put('/{id}', 'App\Routes\ProjectRoutes:update');
    $group->delete('/{id}', 'App\Routes\ProjectRoutes:delete');
    $group->post('/{id}/stb-models', 'App\Routes\ProjectRoutes:createSTBModel');
    $group->put('/stb-models/{modelId}', 'App\Routes\ProjectRoutes:updateSTBModel');
    $group->delete('/stb-models/{modelId}', 'App\Routes\ProjectRoutes:deleteSTBModel');
    $group->post('/stb-models/{modelId}/builds', 'App\Routes\ProjectRoutes:createBuild');
    $group->put('/builds/{buildId}', 'App\Routes\ProjectRoutes:updateBuild');
    $group->delete('/builds/{buildId}', 'App\Routes\ProjectRoutes:deleteBuild');
    $group->post('/builds/{buildId}/save-parser-config', 'App\Routes\ProjectRoutes:saveParserConfig');
    $group->get('/builds/{buildId}/configurations', 'App\Routes\ProjectRoutes:listBuildConfigs');
    $group->get('/configurations/{configId}/full', 'App\Routes\ProjectRoutes:loadConfig');
})->add(new AuthMiddleware());

// ── Configuration Routes ──
$app->group('/api/configurations', function (RouteCollectorProxy $group) {
    $group->get('', 'App\Routes\ConfigRoutes:list');
    $group->post('', 'App\Routes\ConfigRoutes:create');
    $group->get('/{id}', 'App\Routes\ConfigRoutes:get');
    $group->put('/{id}', 'App\Routes\ConfigRoutes:update');
    $group->delete('/{id}', 'App\Routes\ConfigRoutes:delete');
    $group->post('/{id}/save-full', 'App\Routes\ConfigRoutes:saveFull');
    $group->get('/{id}/load-full', 'App\Routes\ConfigRoutes:loadFull');
    $group->post('/{id}/snapshots', 'App\Routes\ConfigRoutes:createSnapshot');
    $group->get('/{id}/snapshots', 'App\Routes\ConfigRoutes:listSnapshots');
    $group->post('/{configId}/snapshots/{snapshotId}/restore', 'App\Routes\ConfigRoutes:restoreSnapshot');
})->add(new AuthMiddleware());

// ── User Routes ──
$app->group('/api/users', function (RouteCollectorProxy $group) {
    $group->get('', 'App\Routes\UserRoutes:list');
    $group->get('/{id}', 'App\Routes\UserRoutes:get');
    $group->patch('/{id}', 'App\Routes\UserRoutes:update');
    $group->post('/{id}/roles', 'App\Routes\UserRoutes:assignRole');
    $group->delete('/{id}/roles/{roleName}', 'App\Routes\UserRoutes:removeRole');
})->add(new AuthMiddleware());

// ── Audit Routes ──
$app->group('/api/audit', function (RouteCollectorProxy $group) {
    $group->get('', 'App\Routes\AuditRoutes:list');
    $group->get('/dashboard', 'App\Routes\AuditRoutes:dashboard');
})->add(new AuthMiddleware());

$app->run();
