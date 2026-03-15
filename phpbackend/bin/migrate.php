<?php
/**
 * MySQL Database Migration Script
 * Creates all tables for ConfigFlow PHP Backend
 * PHP 7.4 compatible
 */

require __DIR__ . '/../vendor/autoload.php';

use App\Config\Env;
use App\Config\Database;

Env::load(__DIR__ . '/../.env');

$db = Database::getInstance();
$pdo = $db->getPdo();

if (!$pdo) {
    echo "❌ Database connection failed. Check .env settings.\n";
    exit(1);
}

echo "🔄 Running migrations...\n";

$migrations = [
    // ── Users ──
    "CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        username VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) DEFAULT NULL,
        is_active TINYINT(1) DEFAULT 1,
        failed_login_attempts INT DEFAULT 0,
        last_login DATETIME DEFAULT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        INDEX idx_users_email (email),
        INDEX idx_users_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── User Roles (separate table per security best practice) ──
    "CREATE TABLE IF NOT EXISTS user_roles (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        role ENUM('admin', 'moderator', 'user') NOT NULL,
        UNIQUE KEY unique_user_role (user_id, role),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_roles_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Refresh Tokens ──
    "CREATE TABLE IF NOT EXISTS refresh_tokens (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        device_fingerprint VARCHAR(255) DEFAULT NULL,
        revoked TINYINT(1) DEFAULT 0,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_refresh_user (user_id),
        INDEX idx_refresh_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Projects ──
    "CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        status ENUM('active', 'archived', 'draft') DEFAULT 'active',
        tags JSON DEFAULT NULL,
        created_by VARCHAR(36) DEFAULT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_projects_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── STB Models ──
    "CREATE TABLE IF NOT EXISTS stb_models (
        id VARCHAR(36) PRIMARY KEY,
        project_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        chipset VARCHAR(100) DEFAULT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        INDEX idx_stb_project (project_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Builds ──
    "CREATE TABLE IF NOT EXISTS builds (
        id VARCHAR(36) PRIMARY KEY,
        stb_model_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        version VARCHAR(50) DEFAULT '1.0.0',
        status ENUM('draft', 'in_progress', 'review', 'released') DEFAULT 'draft',
        parent_build_id VARCHAR(36) DEFAULT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        FOREIGN KEY (stb_model_id) REFERENCES stb_models(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_build_id) REFERENCES builds(id) ON DELETE SET NULL,
        INDEX idx_builds_model (stb_model_id),
        INDEX idx_builds_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Configurations ──
    "CREATE TABLE IF NOT EXISTS configurations (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        config_data LONGTEXT DEFAULT NULL,
        status ENUM('draft', 'active', 'archived') DEFAULT 'draft',
        is_encrypted TINYINT(1) DEFAULT 0,
        created_by VARCHAR(36) DEFAULT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_config_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Build ↔ Configuration link ──
    "CREATE TABLE IF NOT EXISTS build_configurations (
        id VARCHAR(36) PRIMARY KEY,
        build_id VARCHAR(36) NOT NULL,
        configuration_id VARCHAR(36) NOT NULL,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE,
        FOREIGN KEY (configuration_id) REFERENCES configurations(id) ON DELETE CASCADE,
        INDEX idx_bc_build (build_id),
        INDEX idx_bc_config (configuration_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Config Nodes (ReactFlow nodes) ──
    "CREATE TABLE IF NOT EXISTS config_nodes (
        id VARCHAR(36) PRIMARY KEY,
        configuration_id VARCHAR(36) NOT NULL,
        node_id VARCHAR(100) NOT NULL,
        node_type VARCHAR(50) DEFAULT 'configNode',
        position_x DOUBLE DEFAULT 0,
        position_y DOUBLE DEFAULT 0,
        node_data LONGTEXT DEFAULT NULL,
        FOREIGN KEY (configuration_id) REFERENCES configurations(id) ON DELETE CASCADE,
        INDEX idx_cn_config (configuration_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Config Edges (ReactFlow edges) ──
    "CREATE TABLE IF NOT EXISTS config_edges (
        id VARCHAR(36) PRIMARY KEY,
        configuration_id VARCHAR(36) NOT NULL,
        edge_id VARCHAR(100) NOT NULL,
        source_node VARCHAR(100) NOT NULL,
        target_node VARCHAR(100) NOT NULL,
        edge_type VARCHAR(50) DEFAULT 'smoothstep',
        edge_data LONGTEXT DEFAULT NULL,
        FOREIGN KEY (configuration_id) REFERENCES configurations(id) ON DELETE CASCADE,
        INDEX idx_ce_config (configuration_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Config Snapshots ──
    "CREATE TABLE IF NOT EXISTS config_snapshots (
        id VARCHAR(36) PRIMARY KEY,
        configuration_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        snapshot_data LONGTEXT NOT NULL,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (configuration_id) REFERENCES configurations(id) ON DELETE CASCADE,
        INDEX idx_snap_config (configuration_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Parser Sessions ──
    "CREATE TABLE IF NOT EXISTS parser_sessions (
        id VARCHAR(36) PRIMARY KEY,
        session_name VARCHAR(255) NOT NULL,
        source_file_name VARCHAR(500) DEFAULT NULL,
        total_processed_files INT DEFAULT 0,
        total_included_files INT DEFAULT 0,
        total_define_vars INT DEFAULT 0,
        created_by VARCHAR(36) DEFAULT NULL,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_ps_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Parser Processed Files ──
    "CREATE TABLE IF NOT EXISTS parser_processed_files (
        id VARCHAR(36) PRIMARY KEY,
        session_id VARCHAR(36) NOT NULL,
        file_type INT DEFAULT 0,
        file_name VARCHAR(255) NOT NULL,
        file_name_full VARCHAR(500) DEFAULT NULL,
        source_module VARCHAR(100) DEFAULT NULL,
        source_path_prefix VARCHAR(500) DEFAULT NULL,
        start_ts BIGINT DEFAULT 0,
        end_ts BIGINT DEFAULT 0,
        time_delta BIGINT DEFAULT 0,
        input_line_count INT DEFAULT 0,
        used_line_count INT DEFAULT 0,
        empty_comment_line_count INT DEFAULT 0,
        multi_line_count INT DEFAULT 0,
        max_line_length INT DEFAULT 0,
        min_line_length INT DEFAULT 0,
        max_line_ref VARCHAR(100) DEFAULT NULL,
        min_line_ref VARCHAR(100) DEFAULT NULL,
        cond_if INT DEFAULT 0,
        cond_else INT DEFAULT 0,
        cond_elif INT DEFAULT 0,
        cond_endif INT DEFAULT 0,
        cond_nest_block INT DEFAULT 0,
        assign_direct INT DEFAULT 0,
        assign_rhs INT DEFAULT 0,
        def_var_count INT DEFAULT 0,
        def_hit_count INT DEFAULT 0,
        undef_hit_count INT DEFAULT 0,
        ctl_def_hit_count INT DEFAULT 0,
        macro_hit_count INT DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES parser_sessions(id) ON DELETE CASCADE,
        INDEX idx_ppf_session (session_id),
        INDEX idx_ppf_module (source_module)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Parser Included Files ──
    "CREATE TABLE IF NOT EXISTS parser_included_files (
        id VARCHAR(36) PRIMARY KEY,
        session_id VARCHAR(36) NOT NULL,
        include_file_name VARCHAR(500) NOT NULL,
        source_line_ref VARCHAR(500) DEFAULT NULL,
        source_module VARCHAR(100) DEFAULT NULL,
        source_file_name VARCHAR(500) DEFAULT NULL,
        source_line_number INT DEFAULT NULL,
        FOREIGN KEY (session_id) REFERENCES parser_sessions(id) ON DELETE CASCADE,
        INDEX idx_pif_session (session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Parser Define Vars ──
    "CREATE TABLE IF NOT EXISTS parser_define_vars (
        id VARCHAR(36) PRIMARY KEY,
        session_id VARCHAR(36) NOT NULL,
        var_name VARCHAR(255) NOT NULL,
        first_hit_var_type VARCHAR(50) DEFAULT NULL,
        first_hit_src_scope VARCHAR(100) DEFAULT NULL,
        first_hit_slnr VARCHAR(500) DEFAULT NULL,
        cond_ord_depth INT DEFAULT NULL,
        cond_ord_dir VARCHAR(20) DEFAULT NULL,
        cond_ord_slnr VARCHAR(500) DEFAULT NULL,
        source_module VARCHAR(100) DEFAULT NULL,
        source_file_name VARCHAR(500) DEFAULT NULL,
        source_line_number INT DEFAULT NULL,
        diagnostic_level VARCHAR(20) DEFAULT 'info',
        diagnostic_message TEXT DEFAULT NULL,
        FOREIGN KEY (session_id) REFERENCES parser_sessions(id) ON DELETE CASCADE,
        INDEX idx_pdv_session (session_id),
        INDEX idx_pdv_module (source_module),
        INDEX idx_pdv_diag (diagnostic_level)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Parser Define Var Hits ──
    "CREATE TABLE IF NOT EXISTS parser_define_var_hits (
        id VARCHAR(36) PRIMARY KEY,
        define_var_id VARCHAR(36) NOT NULL,
        hit_mode VARCHAR(50) DEFAULT NULL,
        var_type VARCHAR(50) DEFAULT NULL,
        depth INT DEFAULT NULL,
        hit_slnr VARCHAR(500) DEFAULT NULL,
        hit_src_scope VARCHAR(100) DEFAULT NULL,
        source_file_name VARCHAR(500) DEFAULT NULL,
        source_line_number INT DEFAULT NULL,
        source_module VARCHAR(100) DEFAULT NULL,
        FOREIGN KEY (define_var_id) REFERENCES parser_define_vars(id) ON DELETE CASCADE,
        INDEX idx_pdvh_var (define_var_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Parser Define Var Relations ──
    "CREATE TABLE IF NOT EXISTS parser_define_var_relations (
        id VARCHAR(36) PRIMARY KEY,
        define_var_id VARCHAR(36) NOT NULL,
        relation_type ENUM('parent', 'sibling', 'child') NOT NULL,
        related_var_name VARCHAR(255) NOT NULL,
        FOREIGN KEY (define_var_id) REFERENCES parser_define_vars(id) ON DELETE CASCADE,
        INDEX idx_pdvr_var (define_var_id),
        INDEX idx_pdvr_type (relation_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Parser Define Var Values ──
    "CREATE TABLE IF NOT EXISTS parser_define_var_values (
        id VARCHAR(36) PRIMARY KEY,
        define_var_id VARCHAR(36) NOT NULL,
        value_key VARCHAR(255) NOT NULL,
        value_items TEXT DEFAULT NULL,
        FOREIGN KEY (define_var_id) REFERENCES parser_define_vars(id) ON DELETE CASCADE,
        INDEX idx_pdvv_var (define_var_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── Audit Logs ──
    "CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(36) DEFAULT NULL,
        event VARCHAR(100) NOT NULL,
        resource VARCHAR(100) DEFAULT NULL,
        resource_id VARCHAR(36) DEFAULT NULL,
        details TEXT DEFAULT NULL,
        ip_address VARCHAR(45) DEFAULT NULL,
        user_agent TEXT DEFAULT NULL,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_audit_user (user_id),
        INDEX idx_audit_event (event),
        INDEX idx_audit_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
];

$success = 0;
$failed = 0;

foreach ($migrations as $sql) {
    try {
        $pdo->exec($sql);
        $success++;
        // Extract table name for display
        preg_match('/CREATE TABLE IF NOT EXISTS (\w+)/', $sql, $matches);
        echo "  ✅ {$matches[1]}\n";
    } catch (\PDOException $e) {
        $failed++;
        preg_match('/CREATE TABLE IF NOT EXISTS (\w+)/', $sql, $matches);
        echo "  ❌ {$matches[1]}: {$e->getMessage()}\n";
    }
}

echo "\n✅ Migration complete: {$success} tables created, {$failed} failed.\n";
