/**
 * Parses raw JSON config into React Flow nodes and edges.
 * Uses a bottom-up tree layout: measures leaf widths first,
 * then positions parents centered over their children.
 */
import type { Node, Edge } from '@xyflow/react';
import type { RawConfig, RawOption } from './sampleConfig';
import type { ConfigNodeData } from '@/types/configTypes';

interface ParseResult {
  nodes: Node[];
  edges: Edge[];
  maxId: number;
}

const NODE_WIDTH = 200;
const NODE_GAP_X = 40;
const LEVEL_GAP_Y = 200;

const makeNodeData = (
  overrides: Partial<ConfigNodeData> & Pick<ConfigNodeData, 'label' | 'type'>
): Record<string, unknown> =>
  ({
    label: overrides.label,
    type: overrides.type,
    description: overrides.description ?? '',
    properties: overrides.properties ?? {},
    visible: overrides.visible ?? true,
  }) as unknown as Record<string, unknown>;

const edgeDefaults = {
  type: 'smoothstep' as const,
  animated: true,
  style: { strokeWidth: 2 },
};

// Tree node used for measuring widths before placing
interface LayoutNode {
  id: string;
  flowNode: Node;
  children: LayoutNode[];
  width: number; // computed subtree width
}

function measureWidth(node: LayoutNode): number {
  if (node.children.length === 0) {
    node.width = NODE_WIDTH;
    return node.width;
  }
  const childrenWidth = node.children.reduce((sum, c) => sum + measureWidth(c), 0);
  const gaps = (node.children.length - 1) * NODE_GAP_X;
  node.width = Math.max(NODE_WIDTH, childrenWidth + gaps);
  return node.width;
}

function assignPositions(node: LayoutNode, x: number, y: number) {
  // Center this node over its subtree
  node.flowNode.position = { x: x + node.width / 2 - NODE_WIDTH / 2, y };

  if (node.children.length === 0) return;

  const childY = y + LEVEL_GAP_Y;
  const totalChildWidth = node.children.reduce((s, c) => s + c.width, 0) + (node.children.length - 1) * NODE_GAP_X;
  let childX = x + (node.width - totalChildWidth) / 2;

  for (const child of node.children) {
    assignPositions(child, childX, childY);
    childX += child.width + NODE_GAP_X;
  }
}

export const parseConfigToFlow = (config: RawConfig): ParseResult => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let idCounter = 1;
  const nextId = () => `node_${idCounter++}`;

  // Build tree structure
  const containerId = nextId();
  const containerFlowNode: Node = {
    id: containerId,
    type: 'configNode',
    position: { x: 0, y: 0 },
    data: makeNodeData({
      label: 'Configuration Root',
      type: 'container',
      description: 'Root container for all modules',
      properties: { moduleCount: config.modules.length },
    }),
  };
  nodes.push(containerFlowNode);

  const containerLayout: LayoutNode = { id: containerId, flowNode: containerFlowNode, children: [], width: 0 };
  const optionKeyToNodeId: Record<string, string> = {};

  config.modules.forEach((mod) => {
    const moduleId = nextId();
    const moduleFlowNode: Node = {
      id: moduleId,
      type: 'configNode',
      position: { x: 0, y: 0 },
      data: makeNodeData({
        label: mod.name,
        type: 'module',
        description: `ID: ${mod.id} | Initial state: ${mod.initial}`,
        properties: {
          moduleId: mod.id,
          initial: mod.initial,
          rulesCount: mod.rules.length,
          statesCount: Object.keys(mod.states).length,
        },
      }),
    };
    nodes.push(moduleFlowNode);
    edges.push({ id: `edge_${containerId}_${moduleId}`, source: containerId, target: moduleId, ...edgeDefaults });

    const moduleLayout: LayoutNode = { id: moduleId, flowNode: moduleFlowNode, children: [], width: 0 };

    mod.groups.forEach((group) => {
      const groupId = nextId();
      const groupFlowNode: Node = {
        id: groupId,
        type: 'configNode',
        position: { x: 0, y: 0 },
        data: makeNodeData({
          label: group.name,
          type: 'group',
          description: `${group.options.length} option(s)`,
          properties: { groupId: group.id, optionCount: group.options.length },
        }),
      };
      nodes.push(groupFlowNode);
      edges.push({ id: `edge_${moduleId}_${groupId}`, source: moduleId, target: groupId, ...edgeDefaults });

      const groupLayout: LayoutNode = { id: groupId, flowNode: groupFlowNode, children: [], width: 0 };

      group.options.forEach((opt) => {
        const optionId = nextId();
        optionKeyToNodeId[opt.key] = optionId;

        // Extract extended source properties if present (from parser data)
        const extOpt = opt as RawOption & Record<string, unknown>;
        const sourceProps: Record<string, unknown> = {
          key: opt.key, editable: opt.editable, included: opt.included, optionId: opt.id,
        };
        if (extOpt._sourceFile) sourceProps.sourceFile = extOpt._sourceFile;
        if (extOpt._sourceLine) sourceProps.sourceLine = extOpt._sourceLine;
        if (extOpt._sourceModule) sourceProps.sourceModule = extOpt._sourceModule;
        if (extOpt._sourceFullPath) sourceProps.sourceFullPath = extOpt._sourceFullPath;
        if (extOpt._hitSrcScope) sourceProps.hitSrcScope = extOpt._hitSrcScope;
        if (extOpt._varType) sourceProps.varType = extOpt._varType;
        if (extOpt._diagnosticLevel) sourceProps.diagnosticLevel = extOpt._diagnosticLevel;
        if (extOpt._diagnosticMessage) sourceProps.diagnosticMessage = extOpt._diagnosticMessage;

        const optionFlowNode: Node = {
          id: optionId,
          type: 'configNode',
          position: { x: 0, y: 0 },
          data: makeNodeData({
            label: opt.name,
            type: 'option',
            description: opt.included ? 'Included' : 'Not included',
            properties: sourceProps,
          }),
        };
        nodes.push(optionFlowNode);
        edges.push({ id: `edge_${groupId}_${optionId}`, source: groupId, target: optionId, ...edgeDefaults });

        groupLayout.children.push({ id: optionId, flowNode: optionFlowNode, children: [], width: 0 });
      });

      moduleLayout.children.push(groupLayout);
    });

    containerLayout.children.push(moduleLayout);
  });

  // Measure and position
  measureWidth(containerLayout);
  assignPositions(containerLayout, 0, 0);

  // Rule dependency edges
  config.modules.forEach((mod) => {
    mod.rules.forEach((rule) => {
      const dependentId = optionKeyToNodeId[rule.option_key];
      (rule.requires ?? []).forEach((reqKey) => {
        const requiredId = optionKeyToNodeId[reqKey];
        if (dependentId && requiredId) {
          edges.push({
            id: `rule_${requiredId}_${dependentId}`,
            source: requiredId,
            target: dependentId,
            type: 'smoothstep',
            animated: false,
            style: { strokeWidth: 2, strokeDasharray: '6 3', stroke: 'hsl(35 80% 55%)' },
            label: 'requires',
            labelStyle: { fill: 'hsl(35 80% 55%)', fontSize: 10, fontWeight: 600 },
          });
        }
      });
      (rule.conflicts ?? []).forEach((conflictKey) => {
        const conflictId = optionKeyToNodeId[conflictKey];
        if (dependentId && conflictId) {
          edges.push({
            id: `conflict_${dependentId}_${conflictId}`,
            source: dependentId,
            target: conflictId,
            type: 'smoothstep',
            animated: false,
            style: { strokeWidth: 2, strokeDasharray: '4 4', stroke: 'hsl(0 70% 50%)' },
            label: 'conflicts',
            labelStyle: { fill: 'hsl(0 70% 50%)', fontSize: 10, fontWeight: 600 },
          });
        }
      });
    });
  });

  return { nodes, edges, maxId: idCounter };
};
