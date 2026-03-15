<?php
/**
 * CORS Middleware - PHP 7.4 compatible
 */

namespace App\Middleware;

use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;
use App\Config\Env;
use Slim\Psr7\Response as SlimResponse;

class CorsMiddleware implements MiddlewareInterface
{
    public function process(Request $request, RequestHandler $handler): Response
    {
        $origins = array_map('trim', explode(',', Env::get('ALLOWED_ORIGINS', '*')));
        $origin = $request->getHeaderLine('Origin');
        $allowedOrigin = in_array($origin, $origins) ? $origin : ($origins[0] ?? '*');

        // Handle preflight
        if ($request->getMethod() === 'OPTIONS') {
            $response = new SlimResponse();
            return $response
                ->withHeader('Access-Control-Allow-Origin', $allowedOrigin)
                ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
                ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Fingerprint, X-CSRF-Token')
                ->withHeader('Access-Control-Allow-Credentials', 'true')
                ->withHeader('Access-Control-Max-Age', '86400')
                ->withStatus(204);
        }

        $response = $handler->handle($request);
        return $response
            ->withHeader('Access-Control-Allow-Origin', $allowedOrigin)
            ->withHeader('Access-Control-Allow-Credentials', 'true');
    }
}
