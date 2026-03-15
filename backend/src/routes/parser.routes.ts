import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Utility: extract module name from path like "Samples\\eDBE\\src\\ndbfcm.c" → "eDBE" ──
function extractModule(filePath: string): string {
  if (!filePath) return 'unknown';
  const normalized = filePath.replace(/\\\\/g, '\\').replace(/\//g, '\\');
  const parts = normalized.split('\\');
  // Pattern: Samples\<MODULE>\src\file.c  or  <MODULE>\src\file.c
  const samplesIdx = parts.findIndex(p => p.toLowerCase() === 'samples');
  if (samplesIdx >= 0 && parts.length > samplesIdx + 1) {
    return parts[samplesIdx + 1];
  }
  // Fallback: second segment if exists
  if (parts.length >= 2) return parts[parts.length >= 3 ? parts.length - 3 : 0];
  return 'unknown';
}

// ── Utility: extract path prefix (directory) ──
function extractPathPrefix(filePath: string): string {
  if (!filePath) return '';
  const normalized = filePath.replace(/\\\\/g, '\\');
  const lastSep = normalized.lastIndexOf('\\');
  return lastSep >= 0 ? normalized.substring(0, lastSep) : '';
}

// ── Utility: extract file name from path ──
function extractFileName(filePath: string): string {
  if (!filePath) return 'unknown';
  const normalized = filePath.replace(/\\\\/g, '\\').replace(/\//g, '\\');
  const parts = normalized.split('\\');
  return parts[parts.length - 1] || filePath;
}

// ── Utility: parse HitSLNR like "Samples\\eDBE\\src\\ndbfcm.c:#127" ──
function parseHitSLNR(slnr: string): { filePath: string; fileName: string; lineNumber: number; module: string } {
  if (!slnr) return { filePath: '', fileName: 'unknown', lineNumber: 0, module: 'unknown' };
  const parts = slnr.split(':#');
  const filePath = parts[0] || '';
  const lineNumber = parseInt(parts[1] || '0', 10) || 0;
  return {
    filePath,
    fileName: extractFileName(filePath),
    lineNumber,
    module: extractModule(filePath),
  };
}

// ── Utility: generate diagnostic for a define var ──
function generateDiagnostic(
  varName: string,
  varType: string,
  hitSrcScope: string,
  condOrd?: { OrdDepth: number; CondDir: string; CondSLNR: string },
  parList?: string[],
  chList?: string[],
): { level: string; message: string } {
  const messages: string[] = [];
  let level = 'info';

  // Conditional defines are warnings - user needs to know they're conditionally compiled
  if (condOrd) {
    level = 'warning';
    const condParsed = parseHitSLNR(condOrd.CondSLNR);
    messages.push(
      `Conditionally defined under #${condOrd.CondDir} at ${condParsed.fileName}:${condParsed.lineNumber} (depth ${condOrd.OrdDepth}). ` +
      `If this condition is not met, ${varName} will NOT be available.`
    );
  }

  // Defines with no parents and no children that are conditional → potential orphan
  if (condOrd && (!parList || parList.length === 0) && (!chList || chList.length === 0)) {
    level = 'warning';
    messages.push(`Isolated conditional define — no parent/child relationships detected.`);
  }

  // MACRO type defines
  if (varType === 'MACRO' || varType === 'MACRO_FUNC') {
    messages.push(`This is a ${varType === 'MACRO_FUNC' ? 'macro function' : 'macro'} definition.`);
  }

  // Defines with parent dependencies
  if (parList && parList.length > 0) {
    messages.push(`Depends on: ${parList.join(', ')}. Disabling parent defines may break this option.`);
  }

  // Defines with children
  if (chList && chList.length > 0) {
    messages.push(`Required by: ${chList.join(', ')}. Disabling this may affect child defines.`);
  }

  if (messages.length === 0) {
    messages.push(`Direct ${varType} at scope ${hitSrcScope}.`);
  }

  return { level, message: messages.join(' | ') };
}

interface ProcessedFile {
  FileType: number;
  FName: string;
  FNameFull: string;
  StartTS: number;
  EndTS: number;
  TimeDelta: number;
  InpLC: number;
  UsedLC: number;
  EmpCmtLC: number;
  MultLC: number;
  MaxLL: number;
  MinLL: number;
  MaxLNR: string;
  MinLNR: string;
  CondIf: number;
  CondElse: number;
  CondElif: number;
  CondEndif: number;
  CondNestBlk: number;
  AssignDir: number;
  AssignRHS: number;
  DefVarCnt: number;
  DefHitCnt: number;
  UndefHitCnt: number;
  CtlDefHitCnt: number;
  MacroHitCnt: number;
}

interface DefineVar {
  '1stHitInfo': {
    VarType: string;
    HitSrcScope: string;
    HitSLNR: string;
    CondOrd?: {
      OrdDepth: number;
      CondDir: string;
      CondSLNR: string;
    };
  };
  AllHitInfo: Array<{
    HitMode?: string;
    VarType?: string;
    HitSrcScope?: string;
    Depth?: number;
    HitSLNR?: string;
  }>;
  ParList: string[];
  SibList: string[];
  ChList: string[];
  ValEntries: Record<string, string[]>;
}

interface ParserJSON {
  ProcessedFiles: ProcessedFile[];
  IncludedFiles: Array<{ IncFName: string; SrcLineRef: string }>;
  DefineVars: Record<string, DefineVar>;
}

// ── Seed from uploaded JSON or built-in sample ──
router.post('/seed', authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { jsonData, sessionName } = req.body;

  let parserData: ParserJSON;

  if (jsonData) {
    parserData = jsonData;
  } else {
    const samplePath = path.resolve(__dirname, '../data/MakeOptCCPPFileParser.json');
    if (!fs.existsSync(samplePath)) {
      return res.status(404).json({ error: 'Sample JSON file not found' });
    }
    parserData = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));
  }

  try {
    const result = await db.transaction(async (trx) => {
      const sessionId = uuid();

      await trx('parser_sessions').insert({
        id: sessionId,
        session_name: sessionName || `Parser Import ${new Date().toISOString()}`,
        source_file_name: 'MakeOptCCPPFileParser.json',
        total_processed_files: parserData.ProcessedFiles?.length || 0,
        total_included_files: parserData.IncludedFiles?.length || 0,
        total_define_vars: Object.keys(parserData.DefineVars || {}).length,
        created_by: userId,
      });

      // Seed ProcessedFiles with source_module extraction
      if (parserData.ProcessedFiles?.length) {
        const rows = parserData.ProcessedFiles.map((f) => ({
          id: uuid(),
          session_id: sessionId,
          file_type: f.FileType,
          file_name: f.FName,
          file_name_full: f.FNameFull,
          source_module: extractModule(f.FNameFull),
          source_path_prefix: extractPathPrefix(f.FNameFull),
          start_ts: f.StartTS,
          end_ts: f.EndTS,
          time_delta: f.TimeDelta,
          input_line_count: f.InpLC,
          used_line_count: f.UsedLC,
          empty_comment_line_count: f.EmpCmtLC,
          multi_line_count: f.MultLC,
          max_line_length: f.MaxLL,
          min_line_length: f.MinLL,
          max_line_ref: f.MaxLNR,
          min_line_ref: f.MinLNR,
          cond_if: f.CondIf,
          cond_else: f.CondElse,
          cond_elif: f.CondElif,
          cond_endif: f.CondEndif,
          cond_nest_block: f.CondNestBlk,
          assign_direct: f.AssignDir,
          assign_rhs: f.AssignRHS,
          def_var_count: f.DefVarCnt,
          def_hit_count: f.DefHitCnt,
          undef_hit_count: f.UndefHitCnt,
          ctl_def_hit_count: f.CtlDefHitCnt,
          macro_hit_count: f.MacroHitCnt,
        }));
        await trx('parser_processed_files').insert(rows);
      }

      // Seed IncludedFiles with source module extraction
      if (parserData.IncludedFiles?.length) {
        const rows = parserData.IncludedFiles.map((inc) => {
          const parsed = parseHitSLNR(inc.SrcLineRef);
          return {
            id: uuid(),
            session_id: sessionId,
            include_file_name: inc.IncFName,
            source_line_ref: inc.SrcLineRef,
            source_module: parsed.module,
            source_file_name: parsed.fileName,
            source_line_number: parsed.lineNumber,
          };
        });
        await trx('parser_included_files').insert(rows);
      }

      // Seed DefineVars with full enrichment
      if (parserData.DefineVars) {
        for (const [varName, varData] of Object.entries(parserData.DefineVars)) {
          const defVarId = uuid();
          const firstHit = varData['1stHitInfo'];
          const parsed = parseHitSLNR(firstHit?.HitSLNR || '');

          // Generate diagnostic
          const diagnostic = generateDiagnostic(
            varName,
            firstHit?.VarType || '',
            firstHit?.HitSrcScope || '',
            firstHit?.CondOrd,
            varData.ParList,
            varData.ChList,
          );

          await trx('parser_define_vars').insert({
            id: defVarId,
            session_id: sessionId,
            var_name: varName,
            first_hit_var_type: firstHit?.VarType || null,
            first_hit_src_scope: firstHit?.HitSrcScope || null,
            first_hit_slnr: firstHit?.HitSLNR || null,
            cond_ord_depth: firstHit?.CondOrd?.OrdDepth ?? null,
            cond_ord_dir: firstHit?.CondOrd?.CondDir || null,
            cond_ord_slnr: firstHit?.CondOrd?.CondSLNR || null,
            source_module: parsed.module,
            source_file_name: parsed.fileName,
            source_line_number: parsed.lineNumber,
            diagnostic_level: diagnostic.level,
            diagnostic_message: diagnostic.message,
          });

          // AllHitInfo with hit_src_scope
          if (varData.AllHitInfo?.length) {
            for (const hit of varData.AllHitInfo) {
              const hitParsed = parseHitSLNR(hit.HitSLNR || '');
              await trx('parser_define_var_hits').insert({
                id: uuid(),
                define_var_id: defVarId,
                hit_mode: hit.HitMode || null,
                var_type: hit.VarType || null,
                depth: hit.Depth || null,
                hit_slnr: hit.HitSLNR || null,
                hit_src_scope: hit.HitSrcScope || null,
                source_file_name: hitParsed.fileName,
                source_line_number: hitParsed.lineNumber,
                source_module: hitParsed.module,
              });
            }
          }

          // Relations: ParList, SibList, ChList
          for (const [relType, list] of [
            ['parent', varData.ParList],
            ['sibling', varData.SibList],
            ['child', varData.ChList],
          ] as [string, string[]][]) {
            if (list?.length) {
              for (const relName of list) {
                await trx('parser_define_var_relations').insert({
                  id: uuid(),
                  define_var_id: defVarId,
                  relation_type: relType,
                  related_var_name: relName,
                });
              }
            }
          }

          // ValEntries
          if (varData.ValEntries && Object.keys(varData.ValEntries).length) {
            for (const [valKey, valItems] of Object.entries(varData.ValEntries)) {
              await trx('parser_define_var_values').insert({
                id: uuid(),
                define_var_id: defVarId,
                value_key: valKey,
                value_items: JSON.stringify(valItems),
              });
            }
          }
        }
      }

      return {
        sessionId,
        stats: {
          processedFiles: parserData.ProcessedFiles?.length || 0,
          includedFiles: parserData.IncludedFiles?.length || 0,
          defineVars: Object.keys(parserData.DefineVars || {}).length,
        },
      };
    });

    await db('audit_logs').insert({
      user_id: userId,
      event: 'PARSER_DATA_SEEDED',
      resource: 'parser_sessions',
      resource_id: result.sessionId,
      details: JSON.stringify(result.stats),
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.status(201).json({ success: true, ...result });
  } catch (error) {
    logger.error('Parser seed failed', { error });
    res.status(500).json({ error: 'Failed to seed parser data' });
  }
});

// ── List sessions ──
router.get('/sessions', authenticate, async (_req: Request, res: Response) => {
  try {
    const sessions = await db('parser_sessions').orderBy('created_at', 'desc');
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// ── Get session detail with full enrichment ──
router.get('/sessions/:id', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const session = await db('parser_sessions').where({ id }).first();
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const processedFiles = await db('parser_processed_files').where({ session_id: id });
    const includedFiles = await db('parser_included_files').where({ session_id: id });
    const defineVars = await db('parser_define_vars').where({ session_id: id });

    // Enrich define vars
    const enrichedVars = await Promise.all(defineVars.map(async (dv: any) => {
      const hits = await db('parser_define_var_hits').where({ define_var_id: dv.id });
      const relations = await db('parser_define_var_relations').where({ define_var_id: dv.id });
      const values = await db('parser_define_var_values').where({ define_var_id: dv.id });
      return {
        ...dv,
        allHits: hits,
        parents: relations.filter((r: any) => r.relation_type === 'parent').map((r: any) => r.related_var_name),
        siblings: relations.filter((r: any) => r.relation_type === 'sibling').map((r: any) => r.related_var_name),
        children: relations.filter((r: any) => r.relation_type === 'child').map((r: any) => r.related_var_name),
        valEntries: values,
      };
    }));

    // Compute module summary
    const modules = new Set<string>();
    processedFiles.forEach((f: any) => { if (f.source_module) modules.add(f.source_module); });
    defineVars.forEach((dv: any) => { if (dv.source_module) modules.add(dv.source_module); });

    // Compute diagnostics summary
    const diagnosticsSummary = {
      errors: enrichedVars.filter((dv: any) => dv.diagnostic_level === 'error').length,
      warnings: enrichedVars.filter((dv: any) => dv.diagnostic_level === 'warning').length,
      info: enrichedVars.filter((dv: any) => dv.diagnostic_level === 'info').length,
    };

    res.json({
      session,
      processedFiles,
      includedFiles,
      defineVars: enrichedVars,
      modules: Array.from(modules),
      diagnosticsSummary,
    });
  } catch (error) {
    logger.error('Failed to load session', { error });
    res.status(500).json({ error: 'Failed to load session' });
  }
});

// ── Delete session ──
router.delete('/sessions/:id', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await db('parser_sessions').where({ id }).del();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// ── Export session as CSV ──
router.get('/sessions/:id/export', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { sheet } = req.query;

  try {
    const session = await db('parser_sessions').where({ id }).first();
    if (!session) return res.status(404).json({ error: 'Session not found' });

    let csvContent = '';
    let fileName = 'export';

    if (sheet === 'processedFiles' || !sheet) {
      const rows = await db('parser_processed_files').where({ session_id: id });
      csvContent = generateCSV(rows, [
        'file_name', 'file_name_full', 'source_module', 'file_type', 'input_line_count', 'used_line_count',
        'empty_comment_line_count', 'multi_line_count', 'max_line_length', 'min_line_length',
        'max_line_ref', 'min_line_ref', 'cond_if', 'cond_else', 'cond_elif', 'cond_endif',
        'cond_nest_block', 'assign_direct', 'assign_rhs', 'def_var_count', 'def_hit_count',
        'undef_hit_count', 'ctl_def_hit_count', 'macro_hit_count', 'time_delta',
      ]);
      fileName = 'processed_files';
    } else if (sheet === 'includedFiles') {
      const rows = await db('parser_included_files').where({ session_id: id });
      csvContent = generateCSV(rows, ['include_file_name', 'source_line_ref', 'source_module', 'source_file_name', 'source_line_number']);
      fileName = 'included_files';
    } else if (sheet === 'defineVars') {
      const rows = await db('parser_define_vars').where({ session_id: id });
      csvContent = generateCSV(rows, [
        'var_name', 'first_hit_var_type', 'first_hit_src_scope', 'first_hit_slnr',
        'source_module', 'source_file_name', 'source_line_number',
        'cond_ord_depth', 'cond_ord_dir', 'cond_ord_slnr',
        'diagnostic_level', 'diagnostic_message',
      ]);
      fileName = 'define_vars';
    } else if (sheet === 'summary') {
      const processedFiles = await db('parser_processed_files').where({ session_id: id });
      const totalLines = processedFiles.reduce((s: number, f: any) => s + (f.input_line_count || 0), 0);
      const totalCondIf = processedFiles.reduce((s: number, f: any) => s + (f.cond_if || 0), 0);
      const totalDefHits = processedFiles.reduce((s: number, f: any) => s + (f.def_hit_count || 0), 0);
      const defineVarCount = await db('parser_define_vars').where({ session_id: id }).count('* as cnt').first();
      const includedCount = await db('parser_included_files').where({ session_id: id }).count('* as cnt').first();
      const modules = await db('parser_processed_files').where({ session_id: id }).distinct('source_module');

      csvContent = [
        'Metric,Value',
        `Session Name,${escCSV(session.session_name)}`,
        `Source File,${escCSV(session.source_file_name)}`,
        `Total Processed Files,${processedFiles.length}`,
        `Total Included Files,${(includedCount as any)?.cnt || 0}`,
        `Total Define Variables,${(defineVarCount as any)?.cnt || 0}`,
        `Total Input Lines,${totalLines}`,
        `Total Conditional #if,${totalCondIf}`,
        `Total Define Hits,${totalDefHits}`,
        `Source Modules,${escCSV(modules.map((m: any) => m.source_module).filter(Boolean).join('; '))}`,
        `Created At,${session.created_at}`,
      ].join('\n');
      fileName = 'summary';
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}_${id.slice(0, 8)}.csv"`);
    res.send('\uFEFF' + csvContent);
  } catch (error) {
    logger.error('Export failed', { error });
    res.status(500).json({ error: 'Failed to export data' });
  }
});

function escCSV(val: any): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function generateCSV(rows: any[], columns: string[]): string {
  const header = columns.join(',');
  const body = rows.map((r) => columns.map((c) => escCSV(r[c])).join(',')).join('\n');
  return header + '\n' + body;
}

export default router;
