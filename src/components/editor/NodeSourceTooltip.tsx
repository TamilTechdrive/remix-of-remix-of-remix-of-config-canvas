/**
 * Hover tooltip showing source location, parent/child/sibling relationships,
 * and diagnostic messages for a config node. Appears on mouse hover.
 */
import { useMemo } from 'react';
import {
  MapPin, GitBranch, ArrowUpRight, ArrowDownRight, ArrowLeftRight,
  AlertTriangle, AlertCircle, Info, FileCode,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Node, Edge } from '@xyflow/react';
import type { ConfigNodeData } from '@/types/configTypes';

interface NodeSourceTooltipProps {
  nodeId: string;
  nodes: Node[];
  edges: Edge[];
}

// Extract source info from node properties (populated by parser)
function getSourceInfo(data: ConfigNodeData) {
  const props = data.properties || {};
  return {
    sourceFile: (props.sourceFile as string) || '',
    sourceLine: (props.sourceLine as number) || 0,
    sourceModule: (props.sourceModule as string) || '',
    sourceFullPath: (props.sourceFullPath as string) || '',
    diagnosticLevel: (props.diagnosticLevel as string) || 'info',
    diagnosticMessage: (props.diagnosticMessage as string) || '',
    hitSrcScope: (props.hitSrcScope as string) || '',
  };
}

function getRelationships(nodeId: string, nodes: Node[], edges: Edge[]) {
  const parentIds = edges.filter((e) => e.target === nodeId).map((e) => e.source);
  const childIds = edges.filter((e) => e.source === nodeId).map((e) => e.target);

  const parents = parentIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter(Boolean)
    .map((n) => {
      const d = n!.data as unknown as ConfigNodeData;
      const src = getSourceInfo(d);
      return { id: n!.id, label: d.label, type: d.type, sourceFile: src.sourceFile, sourceLine: src.sourceLine };
    });

  const children = childIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter(Boolean)
    .map((n) => {
      const d = n!.data as unknown as ConfigNodeData;
      const src = getSourceInfo(d);
      return { id: n!.id, label: d.label, type: d.type, sourceFile: src.sourceFile, sourceLine: src.sourceLine };
    });

  // Siblings = other children of the same parent(s)
  const siblingIds = new Set<string>();
  for (const pid of parentIds) {
    edges.filter((e) => e.source === pid && e.target !== nodeId).forEach((e) => siblingIds.add(e.target));
  }
  const siblings = Array.from(siblingIds)
    .map((id) => nodes.find((n) => n.id === id))
    .filter(Boolean)
    .map((n) => {
      const d = n!.data as unknown as ConfigNodeData;
      const src = getSourceInfo(d);
      return { id: n!.id, label: d.label, type: d.type, sourceFile: src.sourceFile, sourceLine: src.sourceLine };
    });

  return { parents, children, siblings };
}

const diagIcon: Record<string, React.ElementType> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const diagColor: Record<string, string> = {
  error: 'text-destructive',
  warning: 'text-node-group',
  info: 'text-node-container',
};

type RelNode = { id: string; label: string; type: string; sourceFile: string; sourceLine: number };

const RelSection = ({ icon: Icon, title, items, color }: { icon: React.ElementType; title: string; items: RelNode[]; color: string }) => {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Icon className={`w-3 h-3 ${color}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title} ({items.length})</span>
      </div>
      {items.slice(0, 4).map((item) => (
        <div key={item.id} className="flex items-center gap-1.5 pl-4 text-[10px]">
          <span className="text-foreground font-medium truncate max-w-[120px]">{item.label}</span>
          {item.sourceFile && (
            <span className="text-muted-foreground font-mono">
              {item.sourceFile}{item.sourceLine > 0 ? `:${item.sourceLine}` : ''}
            </span>
          )}
        </div>
      ))}
      {items.length > 4 && (
        <p className="pl-4 text-[9px] text-muted-foreground">+{items.length - 4} more…</p>
      )}
    </div>
  );
};

const NodeSourceTooltip = ({ nodeId, nodes, edges }: NodeSourceTooltipProps) => {
  const { parents, children, siblings } = useMemo(
    () => getRelationships(nodeId, nodes, edges),
    [nodeId, nodes, edges]
  );

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const data = node.data as unknown as ConfigNodeData;
  const src = getSourceInfo(data);

  const DiagIcon = diagIcon[src.diagnosticLevel] || Info;
  const hasSourceInfo = src.sourceFile || src.sourceModule;
  const hasRelations = parents.length > 0 || children.length > 0 || siblings.length > 0;

  if (!hasSourceInfo && !hasRelations && !src.diagnosticMessage) {
    return (
      <div className="p-2 text-[10px] text-muted-foreground">
        No source or relationship data available
      </div>
    );
  }

  return (
    <div className="w-[280px] space-y-2 p-0.5">
      {/* Source Location */}
      {hasSourceInfo && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-card border border-border">
          <MapPin className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-foreground flex items-center gap-1">
              <FileCode className="w-3 h-3" />
              {src.sourceFile || 'Unknown file'}
              {src.sourceLine > 0 && (
                <Badge variant="secondary" className="text-[8px] h-3.5 px-1 font-mono">
                  :{src.sourceLine}
                </Badge>
              )}
            </p>
            {src.sourceModule && (
              <p className="text-[9px] text-muted-foreground mt-0.5">
                Module: <span className="text-primary font-semibold">{src.sourceModule}</span>
              </p>
            )}
            {src.sourceFullPath && (
              <p className="text-[9px] text-muted-foreground font-mono truncate mt-0.5">{src.sourceFullPath}</p>
            )}
            {src.hitSrcScope && (
              <Badge variant="outline" className="text-[8px] h-3.5 px-1 mt-1">{src.hitSrcScope}</Badge>
            )}
          </div>
        </div>
      )}

      {/* Diagnostic Message */}
      {src.diagnosticMessage && (
        <div className={`flex items-start gap-1.5 p-2 rounded-md border ${
          src.diagnosticLevel === 'error' ? 'bg-destructive/5 border-destructive/20' :
          src.diagnosticLevel === 'warning' ? 'bg-node-group/5 border-node-group/20' :
          'bg-node-container/5 border-node-container/20'
        }`}>
          <DiagIcon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${diagColor[src.diagnosticLevel] || 'text-muted-foreground'}`} />
          <p className="text-[10px] text-foreground leading-relaxed">{src.diagnosticMessage}</p>
        </div>
      )}

      {/* Relationships */}
      {hasRelations && (
        <div className="p-2 rounded-md bg-card border border-border space-y-2">
          <div className="flex items-center gap-1">
            <GitBranch className="w-3 h-3 text-accent" />
            <span className="text-[10px] font-semibold text-foreground">Connections</span>
          </div>
          <RelSection icon={ArrowUpRight} title="Parents" items={parents} color="text-node-container" />
          <RelSection icon={ArrowDownRight} title="Children" items={children} color="text-node-module" />
          <RelSection icon={ArrowLeftRight} title="Siblings" items={siblings} color="text-node-group" />
        </div>
      )}

      {/* Quick action hint */}
      <p className="text-[9px] text-muted-foreground text-center">Click to open full details panel</p>
    </div>
  );
};

export default NodeSourceTooltip;
