<?php
/**
 * JWT Auth Middleware - PHP 7.4 compatible
 */

namespace App\Middleware;

use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;
use App\Services\AuthService;
use Slim\Psr7\Response as SlimResponse;

class AuthMiddleware implements MiddlewareInterface
{
    public function process(Request $request, RequestHandler $handler): Response
    {
        $auth = $request->getHeaderLine('Authorization');
        if (!$auth || strpos($auth, 'Bearer ') !== 0) {
            $response = new SlimResponse();
            $response->getBody()->write(json_encode(['error' => 'Authentication required']));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(401);
        }

        $token = substr($auth, 7);
        $authService = new AuthService();
        $payload = $authService->verifyAccessToken($token);

        if (!$payload) {
            $response = new SlimResponse();
            $response->getBody()->write(json_encode(['error' => 'Invalid or expired token']));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(401);
        }

        // Attach user info to request
        $request = $request->withAttribute('userId', $payload['userId']);
        $request = $request->withAttribute('email', $payload['email']);

        return $handler->handle($request);
    }
}
