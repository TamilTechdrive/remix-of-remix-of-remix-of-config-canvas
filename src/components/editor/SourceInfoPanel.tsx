/**
 * Side panel showing detailed source location info, parent/child/sibling
 * relationships with source file:line references, and diagnostics.
 * Opened by clicking a node (alongside existing Properties/AI Actions tabs).
 */
import { useMemo } from 'react';
import {
  MapPin, GitBranch, ArrowUpRight, ArrowDownRight, ArrowLeftRight,
  AlertTriangle, AlertCircle, Info, FileCode, X, ExternalLink,
  ChevronRight, Package, Layers,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Node, Edge } from '@xyflow/react';
import type { ConfigNodeData } from '@/types/configTypes';
import { NODE_LABELS } from '@/types/configTypes';

interface SourceInfoPanelProps {
  nodeId: string;
  nodes: Node[];
  edges: Edge[];
  onClose: () => void;
  onFocusNode: (nodeId: string) => void;
}

function getSourceInfo(data: ConfigNodeData) {
  const props = data.properties || {};
  return {
    sourceFile: (props.sourceFile as string) || '',
    sourceLine: (props.sourceLine as number) || 0,
    sourceModule: (props.sourceModule as string) || '',
    sourceFullPath: (props.sourceFullPath as string) || '',
    diagnosticLevel: (props.diagnosticLevel as string) || '',
    diagnosticMessage: (props.diagnosticMessage as string) || '',
    hitSrcScope: (props.hitSrcScope as string) || '',
    varType: (props.varType as string) || '',
  };
}

function getRelationships(nodeId: string, nodes: Node[], edges: Edge[]) {
  const parentIds = edges.filter((e) => e.target === nodeId).map((e) => e.source);
  const childIds = edges.filter((e) => e.source === nodeId).map((e) => e.target);

  const resolve = (ids: string[]) =>
    ids
      .map((id) => nodes.find((n) => n.id === id))
      .filter(Boolean)
      .map((n) => {
        const d = n!.data as unknown as ConfigNodeData;
        const src = getSourceInfo(d);
        return {
          id: n!.id,
          label: d.label,
          type: d.type,
          sourceFile: src.sourceFile,
          sourceLine: src.sourceLine,
          sourceModule: src.sourceModule,
          diagnosticLevel: src.diagnosticLevel,
          included: d.properties?.included === true,
        };
      });

  const parents = resolve(parentIds);
  const children = resolve(childIds);

  const siblingIds = new Set<string>();
  for (const pid of parentIds) {
    edges.filter((e) => e.source === pid && e.target !== nodeId).forEach((e) => siblingIds.add(e.target));
  }
  const siblings = resolve(Array.from(siblingIds));

  return { parents, children, siblings };
}

const MODULE_BADGE_COLORS: Record<string, string> = {
  eDBE: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  epress: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  egos: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  eintr: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  ekernal: 'bg-red-500/10 text-red-400 border-red-500/30',
  ekernel: 'bg-red-500/10 text-red-400 border-red-500/30',
};

function getModuleBadgeColor(mod: string) {
  return MODULE_BADGE_COLORS[mod] || 'bg-muted text-muted-foreground border-border';
}

type RelNode = {
  id: string; label: string; type: string;
  sourceFile: string; sourceLine: number; sourceModule: string;
  diagnosticLevel: string; included: boolean;
};

const RelationCard = ({
  item,
  direction,
  onFocusNode,
}: {
  item: RelNode;
  direction: 'parent' | 'child' | 'sibling';
  onFocusNode: (id: string) => void;
}) => {
  const dirIcon = direction === 'parent' ? ArrowUpRight : direction === 'child' ? ArrowDownRight : ArrowLeftRight;
  const DirIcon = dirIcon;
  const dirColor = direction === 'parent' ? 'text-node-container' : direction === 'child' ? 'text-node-module' : 'text-node-group';

  return (
    <div
      className="flex items-center gap-2 p-2.5 rounded-md border border-border bg-card hover:bg-card/80 cursor-pointer transition-colors group"
      onClick={() => onFocusNode(item.id)}
    >
      <DirIcon className={`w-4 h-4 shrink-0 ${dirColor}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground truncate">{item.label}</span>
          <Badge variant="outline" className="text-[8px] h-3.5 px-1 shrink-0">{item.type}</Badge>
          {!item.included && (
            <Badge variant="secondary" className="text-[8px] h-3.5 px-1 text-muted-foreground">OFF</Badge>
          )}
        </div>
        {item.sourceFile && (
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin className="w-2.5 h-2.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-mono">
              {item.sourceFile}{item.sourceLine > 0 ? `:${item.sourceLine}` : ''}
            </span>
            {item.sourceModule && (
              <Badge className={`text-[8px] h-3.5 px-1 border ${getModuleBadgeColor(item.sourceModule)}`}>
                {item.sourceModule}
              </Badge>
            )}
          </div>
        )}
        {item.diagnosticLevel === 'warning' && (
          <div className="flex items-center gap-1 mt-0.5">
            <AlertTriangle className="w-2.5 h-2.5 text-node-group" />
            <span className="text-[9px] text-node-group">Has warnings — enable parent first</span>
          </div>
        )}
        {item.diagnosticLevel === 'error' && (
          <div className="flex items-center gap-1 mt-0.5">
            <AlertCircle className="w-2.5 h-2.5 text-destructive" />
            <span className="text-[9px] text-destructive">Has errors</span>
          </div>
        )}
      </div>
      <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </div>
  );
};

const SourceInfoPanel = ({ nodeId, nodes, edges, onClose, onFocusNode }: SourceInfoPanelProps) => {
  const { parents, children, siblings } = useMemo(
    () => getRelationships(nodeId, nodes, edges),
    [nodeId, nodes, edges]
  );

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const data = node.data as unknown as ConfigNodeData;
  const src = getSourceInfo(data);

  const totalConnections = parents.length + children.length + siblings.length;
  const disabledParents = parents.filter((p) => !p.included);

  return (
    <div className="w-[360px] bg-surface-overlay border-l border-border h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-primary" />
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Source & Relationships
            </p>
            <p className="text-sm font-semibold text-foreground">{data.label}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Source Location Card */}
          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">Source Location</span>
            </div>

            {src.sourceFile ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <FileCode className="w-4 h-4 text-accent shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono font-semibold text-foreground">
                      {src.sourceFile}
                      {src.sourceLine > 0 && (
                        <span className="text-primary ml-1">:{src.sourceLine}</span>
                      )}
                    </p>
                    {src.sourceFullPath && (
                      <p className="text-[10px] text-muted-foreground font-mono truncate">{src.sourceFullPath}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {src.sourceModule && (
                    <Badge className={`text-[10px] h-5 px-2 border ${getModuleBadgeColor(src.sourceModule)}`}>
                      <Package className="w-3 h-3 mr-1" />
                      {src.sourceModule}
                    </Badge>
                  )}
                  {src.hitSrcScope && (
                    <Badge variant="outline" className="text-[10px] h-5 px-2">
                      {src.hitSrcScope}
                    </Badge>
                  )}
                  {src.varType && (
                    <Badge variant="secondary" className="text-[10px] h-5 px-2">
                      {src.varType}
                    </Badge>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground p-2">
                No source location data. This node was not loaded from parsed data.
              </p>
            )}
          </div>

          {/* Diagnostic Message */}
          {src.diagnosticMessage && (
            <div className={`rounded-lg border p-3 space-y-1 ${
              src.diagnosticLevel === 'error' ? 'bg-destructive/5 border-destructive/20' :
              src.diagnosticLevel === 'warning' ? 'bg-node-group/5 border-node-group/20' :
              'bg-node-container/5 border-node-container/20'
            }`}>
              <div className="flex items-center gap-1.5">
                {src.diagnosticLevel === 'error' && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
                {src.diagnosticLevel === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-node-group" />}
                {src.diagnosticLevel === 'info' && <Info className="w-3.5 h-3.5 text-node-container" />}
                <span className="text-xs font-semibold text-foreground capitalize">{src.diagnosticLevel} Diagnostic</span>
              </div>
              <p className="text-xs text-foreground leading-relaxed">{src.diagnosticMessage}</p>
            </div>
          )}

          {/* Warning: disabled parents */}
          {disabledParents.length > 0 && (
            <div className="rounded-lg border border-node-group/30 bg-node-group/5 p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-node-group" />
                <span className="text-xs font-semibold text-node-group">Parent Not Enabled</span>
              </div>
              <p className="text-xs text-foreground">
                {disabledParents.map((p) => `"${p.label}"`).join(', ')} {disabledParents.length === 1 ? 'is' : 'are'} disabled.
                Enable {disabledParents.length === 1 ? 'it' : 'them'} first before using this option.
              </p>
              {disabledParents.map((p) => (
                <Button
                  key={p.id}
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] gap-1 mt-1"
                  onClick={() => onFocusNode(p.id)}
                >
                  <ExternalLink className="w-3 h-3" /> Go to {p.label}
                </Button>
              ))}
            </div>
          )}

          <Separator />

          {/* Relationships */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-semibold text-foreground">
                Relationships ({totalConnections})
              </span>
            </div>

            {/* Parents */}
            {parents.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <ArrowUpRight className="w-3 h-3 text-node-container" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Parents ({parents.length})
                  </span>
                </div>
                {parents.map((p) => (
                  <RelationCard key={p.id} item={p} direction="parent" onFocusNode={onFocusNode} />
                ))}
              </div>
            )}

            {/* Children */}
            {children.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <ArrowDownRight className="w-3 h-3 text-node-module" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Children ({children.length})
                  </span>
                </div>
                {children.map((c) => (
                  <RelationCard key={c.id} item={c} direction="child" onFocusNode={onFocusNode} />
                ))}
              </div>
            )}

            {/* Siblings */}
            {siblings.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <ArrowLeftRight className="w-3 h-3 text-node-group" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Siblings ({siblings.length})
                  </span>
                </div>
                {siblings.map((s) => (
                  <RelationCard key={s.id} item={s} direction="sibling" onFocusNode={onFocusNode} />
                ))}
              </div>
            )}

            {totalConnections === 0 && (
              <div className="text-center py-6">
                <Layers className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">No connections found</p>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default SourceInfoPanel;
