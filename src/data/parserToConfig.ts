/**
 * Converts MakeOptCCPPFileParser JSON data into RawConfig format
 * for the config editor (Container → Module → Group → Option hierarchy).
 *
 * Mapping:
 *   Container = Parser Session Root
 *   Module    = Source Module (eDBE, epress, egos, eintr, ekernal, etc.)
 *   Group     = VarType category per source file (DEFINITION, MACRO, CONDITIONAL, etc.)
 *   Option    = Individual DefineVar
 *
 * IncludedFiles are NOT options - they are metadata references showing
 * which files include this source and at what line. They are stored
 * as properties on the module for diagnostic/reference purposes.
 */
import type { RawConfig, RawModule, RawGroup, RawOption, RawRule } from './sampleConfig';

interface ParserProcessedFile {
  FileType: number;
  FName: string;
  FNameFull: string;
  CondIf: number;
  CondElse: number;
  CondEndif: number;
  CondNestBlk: number;
  DefHitCnt: number;
  MacroHitCnt: number;
  InpLC: number;
  [key: string]: unknown;
}

interface ParserDefineVar {
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
  ProcessedFiles: ParserProcessedFile[];
  IncludedFiles: Array<{ IncFName: string; SrcLineRef: string }>;
  DefineVars: Record<string, ParserDefineVar>;
}

// Extract source file from a HitSLNR like "Samples\\eDBE\\src\\ndbfcm.c:#127"
function extractSourceFile(slnr: string): string {
  if (!slnr) return 'unknown';
  const parts = slnr.split(':#');
  const filePath = parts[0] || 'unknown';
  const segments = filePath.replace(/\\\\/g, '\\').split('\\');
  return segments[segments.length - 1] || filePath;
}

// Extract line number from HitSLNR
function extractLineNumber(slnr: string): number {
  if (!slnr) return 0;
  const parts = slnr.split(':#');
  return parseInt(parts[1] || '0', 10) || 0;
}

// Extract module name from full path like "Samples\\eDBE\\src\\..." → "eDBE"
function extractModule(filePath: string): string {
  if (!filePath) return 'unknown';
  const normalized = filePath.replace(/\\\\/g, '\\').replace(/\//g, '\\');
  const parts = normalized.split('\\');
  const samplesIdx = parts.findIndex(p => p.toLowerCase() === 'samples');
  if (samplesIdx >= 0 && parts.length > samplesIdx + 1) {
    return parts[samplesIdx + 1];
  }
  if (parts.length >= 2) return parts[parts.length >= 3 ? parts.length - 3 : 0];
  return 'unknown';
}

// Categorize VarType into user-friendly group names
const VAR_TYPE_GROUPS: Record<string, string> = {
  DEFINITION: 'Definitions (#define)',
  MACRO: 'Macros (#define func)',
  CONDITIONAL: 'Conditional (#if/#ifdef)',
  CONTROL: 'Control Flags',
  ABS_VAL_CONST: 'Absolute Value Constants',
  REF_DERIVED_VAL: 'Derived/Referenced Values',
  MACRO_FUNC: 'Macro Functions',
};

export function parserJsonToRawConfig(data: ParserJSON, sessionName?: string): RawConfig {
  const defineVars = data.DefineVars || {};
  const processedFiles = data.ProcessedFiles || [];

  // Build includedFiles lookup: which files are included in which source
  const includesBySource: Record<string, { name: string; lineRef: string; lineNumber: number }[]> = {};
  if (data.IncludedFiles?.length) {
    for (const inc of data.IncludedFiles) {
      const srcFile = extractSourceFile(inc.SrcLineRef);
      if (!includesBySource[srcFile]) includesBySource[srcFile] = [];
      includesBySource[srcFile].push({
        name: inc.IncFName.replace(/"/g, ''),
        lineRef: inc.SrcLineRef,
        lineNumber: extractLineNumber(inc.SrcLineRef),
      });
    }
  }

  // Group processed files by module
  const filesByModule: Record<string, ParserProcessedFile[]> = {};
  for (const pf of processedFiles) {
    const mod = extractModule(pf.FNameFull);
    if (!filesByModule[mod]) filesByModule[mod] = [];
    filesByModule[mod].push(pf);
  }

  // Group define vars by module, then by source file
  const varsByModuleAndFile: Record<string, Record<string, { varName: string; varData: ParserDefineVar }[]>> = {};
  for (const [varName, varData] of Object.entries(defineVars)) {
    const slnr = varData['1stHitInfo']?.HitSLNR || '';
    const mod = extractModule(slnr.split(':#')[0] || '');
    const sourceFile = extractSourceFile(slnr);
    if (!varsByModuleAndFile[mod]) varsByModuleAndFile[mod] = {};
    if (!varsByModuleAndFile[mod][sourceFile]) varsByModuleAndFile[mod][sourceFile] = [];
    varsByModuleAndFile[mod][sourceFile].push({ varName, varData });
  }

  let groupIdCounter = 10;
  let optionIdCounter = 100;

  // Build modules grouped by source module (eDBE, epress, etc.)
  const allModuleNames = new Set<string>();
  Object.keys(filesByModule).forEach(m => allModuleNames.add(m));
  Object.keys(varsByModuleAndFile).forEach(m => allModuleNames.add(m));

  const modules: RawModule[] = Array.from(allModuleNames).map((moduleName) => {
    const moduleFiles = filesByModule[moduleName] || [];
    const moduleVars = varsByModuleAndFile[moduleName] || {};

    const groups: RawGroup[] = [];
    const rules: RawRule[] = [];

    // For each source file in this module, create groups by VarType
    for (const pf of moduleFiles) {
      const fileName = pf.FName;
      const fileVars = moduleVars[fileName] || [];

      // Get includes for this file (metadata, NOT options)
      const fileIncludes = includesBySource[fileName] || [];

      // Group vars by VarType within this file
      const varsByType: Record<string, { varName: string; varData: ParserDefineVar }[]> = {};
      for (const v of fileVars) {
        const varType = v.varData['1stHitInfo']?.VarType || 'UNKNOWN';
        if (!varsByType[varType]) varsByType[varType] = [];
        varsByType[varType].push(v);
      }

      for (const [varType, vars] of Object.entries(varsByType)) {
        const groupId = groupIdCounter++;
        const options: RawOption[] = vars.map((v) => {
          const optId = optionIdCounter++;
          const hitScope = v.varData['1stHitInfo']?.HitSrcScope || '';
          const hasCondOrd = !!v.varData['1stHitInfo']?.CondOrd;
          const lineNum = extractLineNumber(v.varData['1stHitInfo']?.HitSLNR || '');
          const srcFile = extractSourceFile(v.varData['1stHitInfo']?.HitSLNR || '');
          const fullPath = (v.varData['1stHitInfo']?.HitSLNR || '').split(':#')[0] || '';
          const mod = extractModule(fullPath);

          // Generate diagnostic message
          const diagParts: string[] = [];
          let diagLevel = 'info';
          if (hasCondOrd) {
            diagLevel = 'warning';
            const condDir = v.varData['1stHitInfo']?.CondOrd?.CondDir || '';
            diagParts.push(`Conditionally defined under #${condDir}. May not be available if condition is not met.`);
          }
          if (v.varData.ParList?.length > 0) {
            diagParts.push(`Depends on: ${v.varData.ParList.join(', ')}`);
          }
          if (v.varData.ChList?.length > 0) {
            diagParts.push(`Required by: ${v.varData.ChList.join(', ')}`);
          }

          return {
            id: optId,
            key: v.varName.toLowerCase(),
            name: v.varName,
            editable: true,
            included: hitScope === 'DEF-LHS' && !hasCondOrd,
            // Extended source properties (will be passed through to node data)
            _sourceFile: srcFile,
            _sourceLine: lineNum,
            _sourceModule: mod,
            _sourceFullPath: fullPath,
            _hitSrcScope: hitScope,
            _varType: v.varData['1stHitInfo']?.VarType || '',
            _diagnosticLevel: diagLevel,
            _diagnosticMessage: diagParts.join(' | ') || `Direct ${v.varData['1stHitInfo']?.VarType || 'DEFINE'} at scope ${hitScope}.`,
          } as RawOption & Record<string, unknown>;
        });

        groups.push({
          id: groupId,
          name: `${fileName} → ${VAR_TYPE_GROUPS[varType] || varType}`,
          options,
        });
      }

      // If this file has no defines but has stats, add a file properties group
      if (Object.keys(varsByType).length === 0 && (pf.CondNestBlk > 0 || pf.DefHitCnt > 0 || pf.MacroHitCnt > 0)) {
        groups.push({
          id: groupIdCounter++,
          name: `${fileName} → File Properties`,
          options: [
            { id: optionIdCounter++, key: `${fileName}_cond_blocks`, name: `Conditional Blocks (${pf.CondNestBlk})`, editable: false, included: pf.CondNestBlk > 0 },
            { id: optionIdCounter++, key: `${fileName}_def_hits`, name: `Define Hits (${pf.DefHitCnt})`, editable: false, included: pf.DefHitCnt > 0 },
            { id: optionIdCounter++, key: `${fileName}_macros`, name: `Macros (${pf.MacroHitCnt})`, editable: false, included: pf.MacroHitCnt > 0 },
          ],
        });
      }

      // Build rules from relationships
      for (const v of fileVars) {
        const optionKey = v.varName.toLowerCase();

        if (v.varData.ParList?.length > 0) {
          rules.push({
            option_key: optionKey,
            requires: v.varData.ParList.map((p) => p.toLowerCase()),
            suggestion: `${v.varName} depends on parent define(s): ${v.varData.ParList.join(', ')}`,
            impact_level: 'high',
            tags: ['dependency', v.varData['1stHitInfo']?.VarType?.toLowerCase() || 'unknown'],
          });
        }

        if (v.varData.SibList?.length > 0) {
          rules.push({
            option_key: optionKey,
            requires: v.varData.SibList.map((s) => s.toLowerCase()),
            suggestion: `${v.varName} is related to sibling(s): ${v.varData.SibList.join(', ')}`,
            impact_level: 'low',
            tags: ['sibling'],
          });
        }

        if (v.varData['1stHitInfo']?.CondOrd) {
          const condDir = v.varData['1stHitInfo'].CondOrd.CondDir;
          if (condDir === 'else' || condDir === 'elif') {
            rules.push({
              option_key: optionKey,
              must_disable: true,
              suggestion: `${v.varName} is in a #${condDir} branch — may be conditionally excluded`,
              impact_level: 'medium',
              tags: ['conditional', condDir],
            });
          }
        }
      }
    }

    const states: Record<string, Record<string, string>> = {
      idle: { PARSE: 'processing' },
      processing: { COMPLETE: 'resolved', ERROR: 'error' },
      resolved: { REPARSE: 'processing' },
      error: { RETRY: 'processing', RESET: 'idle' },
    };

    return {
      id: `module_${moduleName.replace(/[^a-zA-Z0-9]/g, '_')}`,
      name: moduleName,
      initial: 'idle',
      groups,
      rules,
      states,
    };
  });

  return { modules };
}

/**
 * Converts backend session detail (enriched) into RawConfig format.
 * Used when loading a seeded parser session into the config editor.
 */
export function sessionDetailToRawConfig(detail: any): RawConfig {
  const parserJson: ParserJSON = {
    ProcessedFiles: (detail.processedFiles || []).map((f: any) => ({
      FileType: f.file_type,
      FName: f.file_name,
      FNameFull: f.file_name_full,
      CondIf: f.cond_if,
      CondElse: f.cond_else,
      CondEndif: f.cond_endif,
      CondNestBlk: f.cond_nest_block,
      DefHitCnt: f.def_hit_count,
      MacroHitCnt: f.macro_hit_count,
      InpLC: f.input_line_count,
    })),
    IncludedFiles: (detail.includedFiles || []).map((inc: any) => ({
      IncFName: inc.include_file_name,
      SrcLineRef: inc.source_line_ref,
    })),
    DefineVars: {},
  };

  for (const dv of (detail.defineVars || [])) {
    parserJson.DefineVars[dv.var_name] = {
      '1stHitInfo': {
        VarType: dv.first_hit_var_type || '',
        HitSrcScope: dv.first_hit_src_scope || '',
        HitSLNR: dv.first_hit_slnr || '',
        ...(dv.cond_ord_depth != null ? {
          CondOrd: {
            OrdDepth: dv.cond_ord_depth,
            CondDir: dv.cond_ord_dir || '',
            CondSLNR: dv.cond_ord_slnr || '',
          },
        } : {}),
      },
      AllHitInfo: (dv.allHits || []).map((h: any) => ({
        HitMode: h.hit_mode,
        VarType: h.var_type,
        HitSrcScope: h.hit_src_scope,
        Depth: h.depth,
        HitSLNR: h.hit_slnr,
      })),
      ParList: dv.parents || [],
      SibList: dv.siblings || [],
      ChList: dv.children || [],
      ValEntries: (dv.valEntries || []).reduce((acc: Record<string, string[]>, v: any) => {
        acc[v.value_key] = typeof v.value_items === 'string' ? JSON.parse(v.value_items) : (v.value_items || []);
        return acc;
      }, {}),
    };
  }

  return parserJsonToRawConfig(parserJson, detail.session?.session_name);
}
