<?php
/**
 * Parser Routes - Full C/C++ preprocessor parser with relationship mapping
 * PHP 7.4 compatible
 */

namespace App\Routes;

use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use App\Config\Database;

class ParserRoutes
{
    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    private function extractModule(string $filePath): string
    {
        if (!$filePath) return 'unknown';
        $normalized = str_replace(['\\\\', '/'], '\\', $filePath);
        $parts = explode('\\', $normalized);
        $samplesIdx = array_search('samples', array_map('strtolower', $parts));
        if ($samplesIdx !== false && count($parts) > $samplesIdx + 1) {
            return $parts[$samplesIdx + 1];
        }
        if (count($parts) >= 2) return $parts[count($parts) >= 3 ? count($parts) - 3 : 0];
        return 'unknown';
    }

    private function extractFileName(string $filePath): string
    {
        if (!$filePath) return 'unknown';
        $normalized = str_replace(['\\\\', '/'], '\\', $filePath);
        $parts = explode('\\', $normalized);
        return end($parts) ?: $filePath;
    }

    private function parseHitSLNR(string $slnr): array
    {
        if (!$slnr) return ['filePath' => '', 'fileName' => 'unknown', 'lineNumber' => 0, 'module' => 'unknown'];
        $parts = explode(':#', $slnr, 2);
        $filePath = $parts[0] ?? '';
        $lineNumber = isset($parts[1]) ? (int)$parts[1] : 0;
        return [
            'filePath' => $filePath,
            'fileName' => $this->extractFileName($filePath),
            'lineNumber' => $lineNumber,
            'module' => $this->extractModule($filePath),
        ];
    }

    private function generateDiagnostic(string $varName, string $varType, string $hitSrcScope, ?array $condOrd, ?array $parList, ?array $chList): array
    {
        $messages = [];
        $level = 'info';

        if ($condOrd) {
            $level = 'warning';
            $condParsed = $this->parseHitSLNR($condOrd['CondSLNR'] ?? '');
            $messages[] = sprintf(
                'Conditionally defined under #%s at %s:%d (depth %d). If condition not met, %s will NOT be available.',
                $condOrd['CondDir'] ?? '', $condParsed['fileName'], $condParsed['lineNumber'],
                $condOrd['OrdDepth'] ?? 0, $varName
            );
        }

        if ($condOrd && empty($parList) && empty($chList)) {
            $level = 'warning';
            $messages[] = 'Isolated conditional define — no parent/child relationships detected.';
        }

        if (in_array($varType, ['MACRO', 'MACRO_FUNC'])) {
            $messages[] = sprintf('This is a %s definition.', $varType === 'MACRO_FUNC' ? 'macro function' : 'macro');
        }

        if (!empty($parList)) {
            $messages[] = 'Depends on: ' . implode(', ', $parList) . '. Disabling parent defines may break this option.';
        }

        if (!empty($chList)) {
            $messages[] = 'Required by: ' . implode(', ', $chList) . '. Disabling this may affect child defines.';
        }

        if (empty($messages)) {
            $messages[] = sprintf('Direct %s at scope %s.', $varType, $hitSrcScope);
        }

        return ['level' => $level, 'message' => implode(' | ', $messages)];
    }

    public function seed(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('userId');
        $body = $request->getParsedBody() ?? [];
        $jsonData = $body['jsonData'] ?? null;
        $sessionName = $body['sessionName'] ?? null;

        if (!$jsonData) {
            $samplePath = __DIR__ . '/../../data/MakeOptCCPPFileParser.json';
            if (!file_exists($samplePath)) {
                $response->getBody()->write(json_encode(['error' => 'Sample JSON file not found']));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
            }
            $jsonData = json_decode(file_get_contents($samplePath), true);
        }

        $db = Database::getInstance();

        try {
            $db->beginTransaction();
            $sessionId = $this->uuid();

            $db->execute(
                'INSERT INTO parser_sessions (id, session_name, source_file_name, total_processed_files, total_included_files, total_define_vars, created_by, created_at)
                 VALUES (:id, :name, :src, :pf, :if, :dv, :uid, NOW())',
                [
                    'id' => $sessionId,
                    'name' => $sessionName ?? 'Parser Import ' . date('c'),
                    'src' => 'MakeOptCCPPFileParser.json',
                    'pf' => count($jsonData['ProcessedFiles'] ?? []),
                    'if' => count($jsonData['IncludedFiles'] ?? []),
                    'dv' => count($jsonData['DefineVars'] ?? []),
                    'uid' => $userId,
                ]
            );

            // Seed ProcessedFiles
            foreach (($jsonData['ProcessedFiles'] ?? []) as $f) {
                $db->execute(
                    'INSERT INTO parser_processed_files (id, session_id, file_type, file_name, file_name_full, source_module, source_path_prefix,
                     start_ts, end_ts, time_delta, input_line_count, used_line_count, empty_comment_line_count, multi_line_count,
                     max_line_length, min_line_length, max_line_ref, min_line_ref, cond_if, cond_else, cond_elif, cond_endif,
                     cond_nest_block, assign_direct, assign_rhs, def_var_count, def_hit_count, undef_hit_count, ctl_def_hit_count, macro_hit_count)
                     VALUES (:id, :sid, :ft, :fn, :fnf, :sm, :spp, :sts, :ets, :td, :ilc, :ulc, :eclc, :mlc, :mxll, :mnll, :mxlr, :mnlr,
                     :ci, :ce, :cel, :cen, :cnb, :ad, :ar, :dvc, :dhc, :uhc, :cdhc, :mhc)',
                    [
                        'id' => $this->uuid(), 'sid' => $sessionId,
                        'ft' => $f['FileType'] ?? 0, 'fn' => $f['FName'] ?? '',
                        'fnf' => $f['FNameFull'] ?? '',
                        'sm' => $this->extractModule($f['FNameFull'] ?? ''),
                        'spp' => dirname(str_replace('\\', '/', $f['FNameFull'] ?? '')),
                        'sts' => $f['StartTS'] ?? 0, 'ets' => $f['EndTS'] ?? 0, 'td' => $f['TimeDelta'] ?? 0,
                        'ilc' => $f['InpLC'] ?? 0, 'ulc' => $f['UsedLC'] ?? 0,
                        'eclc' => $f['EmpCmtLC'] ?? 0, 'mlc' => $f['MultLC'] ?? 0,
                        'mxll' => $f['MaxLL'] ?? 0, 'mnll' => $f['MinLL'] ?? 0,
                        'mxlr' => $f['MaxLNR'] ?? '', 'mnlr' => $f['MinLNR'] ?? '',
                        'ci' => $f['CondIf'] ?? 0, 'ce' => $f['CondElse'] ?? 0,
                        'cel' => $f['CondElif'] ?? 0, 'cen' => $f['CondEndif'] ?? 0,
                        'cnb' => $f['CondNestBlk'] ?? 0, 'ad' => $f['AssignDir'] ?? 0,
                        'ar' => $f['AssignRHS'] ?? 0, 'dvc' => $f['DefVarCnt'] ?? 0,
                        'dhc' => $f['DefHitCnt'] ?? 0, 'uhc' => $f['UndefHitCnt'] ?? 0,
                        'cdhc' => $f['CtlDefHitCnt'] ?? 0, 'mhc' => $f['MacroHitCnt'] ?? 0,
                    ]
                );
            }

            // Seed IncludedFiles
            foreach (($jsonData['IncludedFiles'] ?? []) as $inc) {
                $parsed = $this->parseHitSLNR($inc['SrcLineRef'] ?? '');
                $db->execute(
                    'INSERT INTO parser_included_files (id, session_id, include_file_name, source_line_ref, source_module, source_file_name, source_line_number)
                     VALUES (:id, :sid, :ifn, :slr, :sm, :sfn, :sln)',
                    [
                        'id' => $this->uuid(), 'sid' => $sessionId,
                        'ifn' => $inc['IncFName'] ?? '', 'slr' => $inc['SrcLineRef'] ?? '',
                        'sm' => $parsed['module'], 'sfn' => $parsed['fileName'], 'sln' => $parsed['lineNumber'],
                    ]
                );
            }

            // Seed DefineVars
            foreach (($jsonData['DefineVars'] ?? []) as $varName => $varData) {
                $defVarId = $this->uuid();
                $firstHit = $varData['1stHitInfo'] ?? [];
                $parsed = $this->parseHitSLNR($firstHit['HitSLNR'] ?? '');
                $condOrd = $firstHit['CondOrd'] ?? null;
                $parList = $varData['ParList'] ?? [];
                $chList = $varData['ChList'] ?? [];
                $diagnostic = $this->generateDiagnostic($varName, $firstHit['VarType'] ?? '', $firstHit['HitSrcScope'] ?? '', $condOrd, $parList, $chList);

                $db->execute(
                    'INSERT INTO parser_define_vars (id, session_id, var_name, first_hit_var_type, first_hit_src_scope, first_hit_slnr,
                     cond_ord_depth, cond_ord_dir, cond_ord_slnr, source_module, source_file_name, source_line_number,
                     diagnostic_level, diagnostic_message)
                     VALUES (:id, :sid, :vn, :fhvt, :fhss, :fhs, :cod, :codir, :cos, :sm, :sfn, :sln, :dl, :dm)',
                    [
                        'id' => $defVarId, 'sid' => $sessionId, 'vn' => $varName,
                        'fhvt' => $firstHit['VarType'] ?? null, 'fhss' => $firstHit['HitSrcScope'] ?? null,
                        'fhs' => $firstHit['HitSLNR'] ?? null,
                        'cod' => $condOrd ? ($condOrd['OrdDepth'] ?? null) : null,
                        'codir' => $condOrd ? ($condOrd['CondDir'] ?? null) : null,
                        'cos' => $condOrd ? ($condOrd['CondSLNR'] ?? null) : null,
                        'sm' => $parsed['module'], 'sfn' => $parsed['fileName'], 'sln' => $parsed['lineNumber'],
                        'dl' => $diagnostic['level'], 'dm' => $diagnostic['message'],
                    ]
                );

                // AllHitInfo
                foreach (($varData['AllHitInfo'] ?? []) as $hit) {
                    $hitParsed = $this->parseHitSLNR($hit['HitSLNR'] ?? '');
                    $db->execute(
                        'INSERT INTO parser_define_var_hits (id, define_var_id, hit_mode, var_type, depth, hit_slnr, hit_src_scope, source_file_name, source_line_number, source_module)
                         VALUES (:id, :dvid, :hm, :vt, :d, :hs, :hss, :sfn, :sln, :sm)',
                        [
                            'id' => $this->uuid(), 'dvid' => $defVarId,
                            'hm' => $hit['HitMode'] ?? null, 'vt' => $hit['VarType'] ?? null,
                            'd' => $hit['Depth'] ?? null, 'hs' => $hit['HitSLNR'] ?? null,
                            'hss' => $hit['HitSrcScope'] ?? null, 'sfn' => $hitParsed['fileName'],
                            'sln' => $hitParsed['lineNumber'], 'sm' => $hitParsed['module'],
                        ]
                    );
                }

                // Relations
                foreach (['parent' => 'ParList', 'sibling' => 'SibList', 'child' => 'ChList'] as $relType => $key) {
                    foreach (($varData[$key] ?? []) as $relName) {
                        $db->execute(
                            'INSERT INTO parser_define_var_relations (id, define_var_id, relation_type, related_var_name) VALUES (:id, :dvid, :rt, :rvn)',
                            ['id' => $this->uuid(), 'dvid' => $defVarId, 'rt' => $relType, 'rvn' => $relName]
                        );
                    }
                }

                // ValEntries
                foreach (($varData['ValEntries'] ?? []) as $valKey => $valItems) {
                    $db->execute(
                        'INSERT INTO parser_define_var_values (id, define_var_id, value_key, value_items) VALUES (:id, :dvid, :vk, :vi)',
                        ['id' => $this->uuid(), 'dvid' => $defVarId, 'vk' => $valKey, 'vi' => json_encode($valItems)]
                    );
                }
            }

            $db->commit();

            $stats = [
                'processedFiles' => count($jsonData['ProcessedFiles'] ?? []),
                'includedFiles' => count($jsonData['IncludedFiles'] ?? []),
                'defineVars' => count($jsonData['DefineVars'] ?? []),
            ];

            $response->getBody()->write(json_encode(['success' => true, 'sessionId' => $sessionId, 'stats' => $stats]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(201);
        } catch (\Exception $e) {
            $db->rollBack();
            $response->getBody()->write(json_encode(['error' => 'Failed to seed parser data', 'detail' => $e->getMessage()]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
        }
    }

    public function listSessions(Request $request, Response $response): Response
    {
        $db = Database::getInstance();
        $sessions = $db->fetchAll('SELECT * FROM parser_sessions ORDER BY created_at DESC');
        $response->getBody()->write(json_encode($sessions));
        return $response->withHeader('Content-Type', 'application/json');
    }

    public function getSession(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $db = Database::getInstance();

        $session = $db->fetchOne('SELECT * FROM parser_sessions WHERE id = :id', ['id' => $id]);
        if (!$session) {
            $response->getBody()->write(json_encode(['error' => 'Session not found']));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
        }

        $processedFiles = $db->fetchAll('SELECT * FROM parser_processed_files WHERE session_id = :sid', ['sid' => $id]);
        $includedFiles = $db->fetchAll('SELECT * FROM parser_included_files WHERE session_id = :sid', ['sid' => $id]);
        $defineVars = $db->fetchAll('SELECT * FROM parser_define_vars WHERE session_id = :sid', ['sid' => $id]);

        // Enrich define vars
        $enrichedVars = [];
        foreach ($defineVars as $dv) {
            $hits = $db->fetchAll('SELECT * FROM parser_define_var_hits WHERE define_var_id = :dvid', ['dvid' => $dv['id']]);
            $relations = $db->fetchAll('SELECT * FROM parser_define_var_relations WHERE define_var_id = :dvid', ['dvid' => $dv['id']]);
            $values = $db->fetchAll('SELECT * FROM parser_define_var_values WHERE define_var_id = :dvid', ['dvid' => $dv['id']]);

            $dv['allHits'] = $hits;
            $dv['parents'] = array_values(array_column(array_filter($relations, fn($r) => $r['relation_type'] === 'parent'), 'related_var_name'));
            $dv['siblings'] = array_values(array_column(array_filter($relations, fn($r) => $r['relation_type'] === 'sibling'), 'related_var_name'));
            $dv['children'] = array_values(array_column(array_filter($relations, fn($r) => $r['relation_type'] === 'child'), 'related_var_name'));
            $dv['valEntries'] = $values;
            $enrichedVars[] = $dv;
        }

        // Module summary
        $modules = [];
        foreach ($processedFiles as $f) {
            if (!empty($f['source_module'])) $modules[$f['source_module']] = true;
        }
        foreach ($defineVars as $dv) {
            if (!empty($dv['source_module'])) $modules[$dv['source_module']] = true;
        }

        // Diagnostics summary
        $diagSummary = ['errors' => 0, 'warnings' => 0, 'info' => 0];
        foreach ($enrichedVars as $dv) {
            $lvl = $dv['diagnostic_level'] ?? 'info';
            if ($lvl === 'error') $diagSummary['errors']++;
            elseif ($lvl === 'warning') $diagSummary['warnings']++;
            else $diagSummary['info']++;
        }

        $result = [
            'session' => $session,
            'processedFiles' => $processedFiles,
            'includedFiles' => $includedFiles,
            'defineVars' => $enrichedVars,
            'modules' => array_keys($modules),
            'diagnosticsSummary' => $diagSummary,
        ];

        $response->getBody()->write(json_encode($result));
        return $response->withHeader('Content-Type', 'application/json');
    }

    public function deleteSession(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $db = Database::getInstance();
        $db->execute('DELETE FROM parser_sessions WHERE id = :id', ['id' => $id]);
        $response->getBody()->write(json_encode(['success' => true]));
        return $response->withHeader('Content-Type', 'application/json');
    }

    public function exportSession(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $sheet = $request->getQueryParams()['sheet'] ?? 'defineVars';
        $db = Database::getInstance();

        $session = $db->fetchOne('SELECT * FROM parser_sessions WHERE id = :id', ['id' => $id]);
        if (!$session) {
            $response->getBody()->write(json_encode(['error' => 'Session not found']));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
        }

        $rows = [];
        $fileName = 'export';

        if ($sheet === 'processedFiles') {
            $rows = $db->fetchAll('SELECT * FROM parser_processed_files WHERE session_id = :sid', ['sid' => $id]);
            $fileName = 'processed_files';
        } elseif ($sheet === 'includedFiles') {
            $rows = $db->fetchAll('SELECT * FROM parser_included_files WHERE session_id = :sid', ['sid' => $id]);
            $fileName = 'included_files';
        } else {
            $rows = $db->fetchAll('SELECT * FROM parser_define_vars WHERE session_id = :sid', ['sid' => $id]);
            $fileName = 'define_vars';
        }

        // Generate CSV
        $csv = '';
        if (!empty($rows)) {
            $csv .= implode(',', array_keys($rows[0])) . "\n";
            foreach ($rows as $row) {
                $csv .= implode(',', array_map(function ($v) {
                    return '"' . str_replace('"', '""', (string)$v) . '"';
                }, array_values($row))) . "\n";
            }
        }

        $response->getBody()->write($csv);
        return $response
            ->withHeader('Content-Type', 'text/csv')
            ->withHeader('Content-Disposition', "attachment; filename={$fileName}.csv");
    }
}
