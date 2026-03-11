/**
 * Converts MakeOptCCPPFileParser JSON data into RawConfig format
 * for the config editor (Container → Module → Group → Option hierarchy).
 *
 * Mapping:
 *   Container = Parser Session Root
 *   Module    = Source File (ProcessedFiles entries)
 *   Group     = VarType category (DEFINITION, MACRO, CONDITIONAL, CONTROL, etc.)
 *   Option    = Individual DefineVar
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
  AllHitInfo: Array<{ HitMode?: string; VarType?: string; Depth?: number; HitSLNR?: string }>;
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
  // Get just the filename
  const segments = filePath.replace(/\\\\/g, '\\').split('\\');
  return segments[segments.length - 1] || filePath;
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

  // Group define vars by source file
  const varsByFile: Record<string, { varName: string; varData: ParserDefineVar }[]> = {};
  
  for (const [varName, varData] of Object.entries(defineVars)) {
    const sourceFile = extractSourceFile(varData['1stHitInfo']?.HitSLNR || '');
    if (!varsByFile[sourceFile]) varsByFile[sourceFile] = [];
    varsByFile[sourceFile].push({ varName, varData });
  }

  let groupIdCounter = 10;
  let optionIdCounter = 100;

  const modules: RawModule[] = processedFiles.map((pf, idx) => {
    const fileName = pf.FName;
    const fileVars = varsByFile[fileName] || [];

    // Group vars by VarType within this file
    const varsByType: Record<string, { varName: string; varData: ParserDefineVar }[]> = {};
    for (const v of fileVars) {
      const varType = v.varData['1stHitInfo']?.VarType || 'UNKNOWN';
      if (!varsByType[varType]) varsByType[varType] = [];
      varsByType[varType].push(v);
    }

    const groups: RawGroup[] = Object.entries(varsByType).map(([varType, vars]) => {
      const groupId = groupIdCounter++;
      const options: RawOption[] = vars.map((v) => {
        const optId = optionIdCounter++;
        const hitScope = v.varData['1stHitInfo']?.HitSrcScope || '';
        const hasCondOrd = !!v.varData['1stHitInfo']?.CondOrd;
        
        return {
          id: optId,
          key: v.varName.toLowerCase(),
          name: v.varName,
          editable: true,
          included: hitScope === 'DEF-LHS' && !hasCondOrd, // Direct defs are included, conditional ones are not
        };
      });

      return {
        id: groupId,
        name: VAR_TYPE_GROUPS[varType] || varType,
        options,
      };
    });

    // If no groups from defines, create a placeholder from file stats
    if (groups.length === 0) {
      groups.push({
        id: groupIdCounter++,
        name: 'File Properties',
        options: [
          { id: optionIdCounter++, key: `${fileName}_cond_blocks`, name: `Conditional Blocks (${pf.CondNestBlk})`, editable: false, included: pf.CondNestBlk > 0 },
          { id: optionIdCounter++, key: `${fileName}_def_hits`, name: `Define Hits (${pf.DefHitCnt})`, editable: false, included: pf.DefHitCnt > 0 },
          { id: optionIdCounter++, key: `${fileName}_macros`, name: `Macros (${pf.MacroHitCnt})`, editable: false, included: pf.MacroHitCnt > 0 },
        ],
      });
    }

    // Build rules from parent/child/sibling relationships
    const rules: RawRule[] = [];
    for (const v of fileVars) {
      const optionKey = v.varName.toLowerCase();
      
      // Parent relationships → requires
      if (v.varData.ParList?.length > 0) {
        rules.push({
          option_key: optionKey,
          requires: v.varData.ParList.map((p) => p.toLowerCase()),
          suggestion: `${v.varName} depends on parent define(s): ${v.varData.ParList.join(', ')}`,
          impact_level: 'high',
          tags: ['dependency', v.varData['1stHitInfo']?.VarType?.toLowerCase() || 'unknown'],
        });
      }

      // Sibling relationships → can be co-enabled
      if (v.varData.SibList?.length > 0) {
        rules.push({
          option_key: optionKey,
          requires: v.varData.SibList.map((s) => s.toLowerCase()),
          suggestion: `${v.varName} is related to sibling(s): ${v.varData.SibList.join(', ')}`,
          impact_level: 'low',
          tags: ['sibling'],
        });
      }

      // Conditional ordering → must_enable constraint
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

    // Build states from conditional structure
    const states: Record<string, Record<string, string>> = {
      idle: { PARSE: 'processing' },
      processing: { COMPLETE: 'resolved', ERROR: 'error' },
      resolved: { REPARSE: 'processing' },
      error: { RETRY: 'processing', RESET: 'idle' },
    };

    return {
      id: `file_${fileName.replace(/\./g, '_')}`,
      name: fileName,
      initial: 'idle',
      groups,
      rules,
      states,
    };
  });

  // Add a module for included files as well
  if (data.IncludedFiles?.length) {
    // Group includes by source file
    const includesBySource: Record<string, string[]> = {};
    for (const inc of data.IncludedFiles) {
      const src = extractSourceFile(inc.SrcLineRef);
      if (!includesBySource[src]) includesBySource[src] = [];
      includesBySource[src].push(inc.IncFName.replace(/"/g, ''));
    }

    const includeGroups: RawGroup[] = Object.entries(includesBySource).map(([srcFile, includes]) => ({
      id: groupIdCounter++,
      name: `From ${srcFile}`,
      options: includes.map((inc) => ({
        id: optionIdCounter++,
        key: `inc_${inc.replace(/[^a-zA-Z0-9]/g, '_')}`,
        name: inc,
        editable: false,
        included: true,
      })),
    }));

    modules.push({
      id: 'included_headers',
      name: 'Included Headers',
      initial: 'idle',
      groups: includeGroups,
      rules: [],
      states: {
        idle: { RESOLVE: 'resolved' },
        resolved: { REFRESH: 'idle' },
      },
    });
  }

  return { modules };
}

/**
 * Converts backend session detail (enriched) into RawConfig format.
 * Used when loading a seeded parser session into the config editor.
 */
export function sessionDetailToRawConfig(detail: any): RawConfig {
  // Reconstruct the parser JSON structure from the session detail
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

  // Reconstruct DefineVars from enriched data
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
