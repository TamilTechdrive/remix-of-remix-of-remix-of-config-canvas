<?php
/**
 * Environment configuration loader - PHP 7.4 compatible
 */

namespace App\Config;

class Env
{
    /** @var array<string, string> */
    private static array $vars = [];

    public static function load(string $path): void
    {
        if (!file_exists($path)) {
            return;
        }
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if (strpos($line, '#') === 0) continue;
            if (strpos($line, '=') === false) continue;
            [$key, $value] = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);
            self::$vars[$key] = $value;
            if (!getenv($key)) {
                putenv("{$key}={$value}");
            }
        }
    }

    public static function get(string $key, string $default = ''): string
    {
        return self::$vars[$key] ?? getenv($key) ?: $default;
    }

    public static function getInt(string $key, int $default = 0): int
    {
        $val = self::get($key);
        return $val !== '' ? (int)$val : $default;
    }

    public static function getBool(string $key, bool $default = false): bool
    {
        $val = self::get($key);
        if ($val === '') return $default;
        return in_array(strtolower($val), ['true', '1', 'yes'], true);
    }
}
