<?php
/**
 * Database Seeder - Creates admin user and sample data
 * PHP 7.4 compatible
 */

require __DIR__ . '/../vendor/autoload.php';

use App\Config\Env;
use App\Config\Database;
use App\Services\AuthService;

Env::load(__DIR__ . '/../.env');

$db = Database::getInstance();

if (!$db->testConnection()) {
    echo "❌ Database connection failed.\n";
    exit(1);
}

echo "🌱 Running seeds...\n";

// Create admin user
$auth = new AuthService();
$existing = $db->fetchOne('SELECT id FROM users WHERE email = :email', ['email' => 'admin@configflow.dev']);
if (!$existing) {
    $result = $auth->register([
        'email' => 'admin@configflow.dev',
        'username' => 'admin',
        'password' => 'Admin@123456',
        'displayName' => 'System Admin',
    ]);
    if ($result['success']) {
        // Promote to admin
        $db->execute(
            'INSERT INTO user_roles (id, user_id, role) VALUES (:id, :uid, :role)',
            ['id' => bin2hex(random_bytes(18)), 'uid' => $result['userId'], 'role' => 'admin']
        );
        echo "  ✅ Admin user created (admin@configflow.dev / Admin@123456)\n";
    }
} else {
    echo "  ⏭️  Admin user already exists\n";
}

// Create sample project
$existingProject = $db->fetchOne('SELECT id FROM projects LIMIT 1');
if (!$existingProject) {
    $projectId = bin2hex(random_bytes(18));
    $db->execute(
        'INSERT INTO projects (id, name, description, status, tags, created_at, updated_at)
         VALUES (:id, :name, :desc, :status, :tags, NOW(), NOW())',
        [
            'id' => $projectId,
            'name' => 'STB Reference Platform',
            'desc' => 'Reference configuration for STB hardware platforms',
            'status' => 'active',
            'tags' => json_encode(['stb', 'reference', 'embedded']),
        ]
    );
    echo "  ✅ Sample project created\n";

    // Add STB Model
    $modelId = bin2hex(random_bytes(18));
    $db->execute(
        'INSERT INTO stb_models (id, project_id, name, description, chipset, created_at, updated_at)
         VALUES (:id, :pid, :name, :desc, :chip, NOW(), NOW())',
        ['id' => $modelId, 'pid' => $projectId, 'name' => 'STB-4K-Pro', 'desc' => '4K HDR Set-Top Box', 'chip' => 'Broadcom BCM7278']
    );
    echo "  ✅ Sample STB Model created\n";

    // Add Build
    $buildId = bin2hex(random_bytes(18));
    $db->execute(
        'INSERT INTO builds (id, stb_model_id, name, description, version, status, created_at, updated_at)
         VALUES (:id, :mid, :name, :desc, :ver, :status, NOW(), NOW())',
        ['id' => $buildId, 'mid' => $modelId, 'name' => 'v2.1.0-beta', 'desc' => 'Beta release with eDBE support', 'ver' => '2.1.0', 'status' => 'in_progress']
    );
    echo "  ✅ Sample Build created\n";
} else {
    echo "  ⏭️  Sample data already exists\n";
}

echo "\n✅ Seeding complete.\n";
