import { memo, useMemo, useCallback, useState } from 'react';
import { Handle, Position, type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { Box, Puzzle, Layers, ToggleLeft, GripVertical, AlertCircle, AlertTriangle, CheckCircle2, X, Power, MapPin } from 'lucide-react';
import type { ConfigNodeData, ConfigNodeType } from '@/types/configTypes';
import { analyzeNode } from '@/engine/ruleEngine';
import { SAMPLE_CONFIG } from '@/data/sampleConfig';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import NodeSourceTooltip from './NodeSourceTooltip';
const iconMap: Record<ConfigNodeType, React.ElementType> = {
  container: Box,
  module: Puzzle,
  group: Layers,
  option: ToggleLeft,
};

const colorClassMap: Record<ConfigNodeType, string> = {
  container: 'border-node-container/60 shadow-[0_0_20px_-4px] shadow-node-container/20',
  module: 'border-node-module/60 shadow-[0_0_20px_-4px] shadow-node-module/20',
  group: 'border-node-group/60 shadow-[0_0_20px_-4px] shadow-node-group/20',
  option: 'border-node-option/60 shadow-[0_0_20px_-4px] shadow-node-option/20',
};

const iconColorMap: Record<ConfigNodeType, string> = {
  container: 'text-node-container',
  module: 'text-node-module',
  group: 'text-node-group',
  option: 'text-node-option',
};

const ConfigNode = ({ id, data, selected }: NodeProps) => {
  const nodeData = data as unknown as ConfigNodeData;
  const Icon = iconMap[nodeData.type];
  const { setNodes, setEdges } = useReactFlow();

  const nodes = useNodes();
  const edges = useEdges();

  const analysis = useMemo(
    () => analyzeNode(id, nodes, edges, SAMPLE_CONFIG),
    [id, nodes, edges]
  );

  const errorCount = analysis.issues.filter((i) => i.severity === 'error').length;
  const warningCount = analysis.issues.filter((i) => i.severity === 'warning').length;
  const isIncluded = nodeData.properties?.included === true;
  const isExcluded = nodeData.properties?.included === false;
  const hasSourceInfo = !!(nodeData.properties?.sourceFile || nodeData.properties?.sourceModule);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  }, [id, setNodes, setEdges]);

  return (
    <TooltipProvider delayDuration={600}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`
              relative bg-card border-2 rounded-lg min-w-[200px] transition-all duration-200 group overflow-visible
              ${colorClassMap[nodeData.type]}
              ${selected ? 'ring-2 ring-primary/50 scale-[1.02]' : ''}
              ${!nodeData.visible ? 'opacity-40' : ''}
              ${isExcluded ? 'opacity-50 border-dashed' : ''}
            `}
            style={{ zIndex: selected ? 50 : 1 }}
          >
            {/* Top target handle */}
            <Handle
              type="target"
              position={Position.Top}
              className="!w-3 !h-3 !bg-muted-foreground/50 !border-2 !border-card hover:!bg-primary hover:!w-4 hover:!h-4 transition-all"
            />

            {/* Delete button - top right corner, visible on hover */}
            <button
              onClick={handleDelete}
              className="absolute -top-2.5 -right-2.5 z-20 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 shadow-md"
              title="Delete node"
            >
              <X className="w-3 h-3" />
            </button>

            {/* Top-left: Include/Exclude badge for ALL node types */}
            <div className="absolute -top-3 -left-2 z-30">
              {isIncluded && (
                <span className="flex items-center gap-0.5 bg-node-module text-primary-foreground text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                  <Power className="w-2.5 h-2.5" /> ON
                </span>
              )}
              {isExcluded && (
                <span className="flex items-center gap-0.5 bg-muted text-muted-foreground text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                  OFF
                </span>
              )}
            </div>

            {/* Health badges */}
            {(errorCount > 0 || warningCount > 0) && (
              <div className="absolute -top-3 right-5 z-30 flex gap-0.5">
                {errorCount > 0 && (
                  <span className="flex items-center gap-0.5 bg-destructive text-destructive-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    <AlertCircle className="w-2.5 h-2.5" />
                    {errorCount}
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="flex items-center gap-0.5 bg-node-group text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    {warningCount}
                  </span>
                )}
              </div>
            )}
            {errorCount === 0 && warningCount === 0 && (
              <div className="absolute -top-3 right-5 z-30">
                <span className="flex items-center bg-node-module text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                </span>
              </div>
            )}

            <div className="px-3 py-2 flex items-center gap-2 border-b border-border/50">
              <GripVertical className="w-3 h-3 text-muted-foreground/40 cursor-grab" />
              <Icon className={`w-4 h-4 ${iconColorMap[nodeData.type]}`} />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {nodeData.type}
              </span>
              {/* Source location pin indicator */}
              {hasSourceInfo && (
                <MapPin className="w-3 h-3 text-primary/60 ml-auto" />
              )}
            </div>

            <div className="px-3 py-2.5">
              <p className="text-sm font-semibold text-foreground truncate">{nodeData.label}</p>
              {nodeData.description && (
                <p className="text-xs text-muted-foreground mt-1 truncate max-w-[180px]">
                  {nodeData.description}
                </p>
              )}
              {/* Source file:line quick reference */}
              {hasSourceInfo && (
                <p className="text-[10px] text-muted-foreground font-mono mt-1 truncate flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5 shrink-0" />
                  {nodeData.properties?.sourceFile as string}
                  {(nodeData.properties?.sourceLine as number) > 0 && (
                    <span className="text-primary">:{nodeData.properties?.sourceLine as number}</span>
                  )}
                </p>
              )}
            </div>

            {Object.keys(nodeData.properties).length > 0 && (
              <div className="px-3 pb-2 flex flex-wrap gap-1">
                {Object.entries(nodeData.properties).filter(([k]) => !['included', 'visibilityConditions', 'notes', 'colorTag', 'userRules', 'impact_level', 'priority', 'tags', 'must_enable', 'must_disable', 'sourceFile', 'sourceLine', 'sourceModule', 'sourceFullPath', 'diagnosticLevel', 'diagnosticMessage', 'hitSrcScope', 'varType'].includes(k)).slice(0, 3).map(([key]) => (
                  <span
                    key={key}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-mono"
                  >
                    {key}
                  </span>
                ))}
              </div>
            )}

            {/* Bottom source handle */}
            <Handle
              type="source"
              position={Position.Bottom}
              className="!w-3 !h-3 !bg-muted-foreground/50 !border-2 !border-card hover:!bg-primary hover:!w-4 hover:!h-4 transition-all"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" align="start" className="p-0 bg-popover border-border shadow-lg max-w-[300px]">
          <NodeSourceTooltip nodeId={id} nodes={nodes} edges={edges} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default memo(ConfigNode);
