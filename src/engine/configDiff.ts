import type { Node, Edge } from '@xyflow/react';
import type { ConfigNodeData } from '@/types/configTypes';

export type DiffAction = 'import' | 'omit' | 'remove' | 'replace';

export interface DiffItem {
  id: string;
  type: 'node_added' | 'node_removed' | 'node_changed' | 'edge_added' | 'edge_removed';
  label: string;
  description: string;
  sourceValue?: string;
  targetValue?: string;
  nodeId?: string;
  edgeId?: string;
  sourceNode?: Node;
  targetNode?: Node;
  sourceEdge?: Edge;
  targetEdge?: Edge;
  suggestedAction: DiffAction;
}

/**
 * Compare two sets of nodes/edges and produce actionable diff items.
 * "source" = the external config to import FROM
 * "target" = the current working config
 */
export function diffConfigs(
  sourceNodes: Node[],
  sourceEdges: Edge[],
  targetNodes: Node[],
  targetEdges: Edge[],
): DiffItem[] {
  const items: DiffItem[] = [];

  const targetNodeMap = new Map(targetNodes.map(n => [getNodeKey(n), n]));
  const sourceNodeMap = new Map(sourceNodes.map(n => [getNodeKey(n), n]));

  // Nodes in source but not in target → can import
  for (const [key, sNode] of sourceNodeMap) {
    const sData = sNode.data as unknown as ConfigNodeData;
    const tNode = targetNodeMap.get(key);
    if (!tNode) {
      items.push({
        id: `add_node_${sNode.id}`,
        type: 'node_added',
        label: sData.label,
        description: `Node "${sData.label}" (${sData.type}) exists in source but not in current config`,
        sourceNode: sNode,
        sourceValue: formatNodeSummary(sData),
        suggestedAction: 'import',
      });
    } else {
      // Both exist — check for differences
      const tData = tNode.data as unknown as ConfigNodeData;
      const changes = getNodeChanges(sData, tData);
      if (changes.length > 0) {
        items.push({
          id: `change_node_${sNode.id}`,
          type: 'node_changed',
          label: sData.label,
          description: `${changes.length} difference(s): ${changes.join(', ')}`,
          sourceNode: sNode,
          targetNode: tNode,
          sourceValue: formatNodeSummary(sData),
          targetValue: formatNodeSummary(tData),
          nodeId: tNode.id,
          suggestedAction: 'replace',
        });
      }
    }
  }

  // Nodes in target but not in source → might want to remove
  for (const [key, tNode] of targetNodeMap) {
    if (!sourceNodeMap.has(key)) {
      const tData = tNode.data as unknown as ConfigNodeData;
      items.push({
        id: `remove_node_${tNode.id}`,
        type: 'node_removed',
        label: tData.label,
        description: `Node "${tData.label}" (${tData.type}) exists in current config but not in source`,
        targetNode: tNode,
        targetValue: formatNodeSummary(tData),
        nodeId: tNode.id,
        suggestedAction: 'omit',
      });
    }
  }

  // Edge diffs
  const targetEdgeKeys = new Set(targetEdges.map(e => `${e.source}→${e.target}`));
  const sourceEdgeKeys = new Set(sourceEdges.map(e => `${e.source}→${e.target}`));

  for (const sEdge of sourceEdges) {
    const key = `${sEdge.source}→${sEdge.target}`;
    if (!targetEdgeKeys.has(key)) {
      const srcLabel = (sourceNodeMap.get(getNodeKeyById(sEdge.source, sourceNodes))?.data as unknown as ConfigNodeData)?.label || sEdge.source;
      const tgtLabel = (sourceNodeMap.get(getNodeKeyById(sEdge.target, sourceNodes))?.data as unknown as ConfigNodeData)?.label || sEdge.target;
      items.push({
        id: `add_edge_${sEdge.id}`,
        type: 'edge_added',
        label: `${srcLabel} → ${tgtLabel}`,
        description: `Connection exists in source but not in current config`,
        sourceEdge: sEdge,
        suggestedAction: 'import',
      });
    }
  }

  for (const tEdge of targetEdges) {
    const key = `${tEdge.source}→${tEdge.target}`;
    if (!sourceEdgeKeys.has(key)) {
      const srcLabel = (targetNodeMap.get(getNodeKeyById(tEdge.source, targetNodes))?.data as unknown as ConfigNodeData)?.label || tEdge.source;
      const tgtLabel = (targetNodeMap.get(getNodeKeyById(tEdge.target, targetNodes))?.data as unknown as ConfigNodeData)?.label || tEdge.target;
      items.push({
        id: `remove_edge_${tEdge.id}`,
        type: 'edge_removed',
        label: `${srcLabel} → ${tgtLabel}`,
        description: `Connection exists in current config but not in source`,
        sourceEdge: tEdge,
        edgeId: tEdge.id,
        suggestedAction: 'omit',
      });
    }
  }

  return items;
}

function getNodeKey(node: Node): string {
  const data = node.data as unknown as ConfigNodeData;
  return `${data.type}::${data.label}`;
}

function getNodeKeyById(id: string, nodes: Node[]): string {
  const node = nodes.find(n => n.id === id);
  return node ? getNodeKey(node) : id;
}

function getNodeChanges(source: ConfigNodeData, target: ConfigNodeData): string[] {
  const changes: string[] = [];
  if (source.description !== target.description) changes.push('description');
  if (source.visible !== target.visible) changes.push('visibility');

  const sProps = source.properties || {};
  const tProps = target.properties || {};
  const allKeys = new Set([...Object.keys(sProps), ...Object.keys(tProps)]);
  for (const key of allKeys) {
    if (key === 'userRules') continue;
    if (JSON.stringify(sProps[key]) !== JSON.stringify(tProps[key])) {
      changes.push(`property "${key}"`);
    }
  }
  return changes;
}

function formatNodeSummary(data: ConfigNodeData): string {
  const props = Object.entries(data.properties || {})
    .filter(([k]) => k !== 'userRules')
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(', ');
  return `[${data.type}] ${data.label}${props ? ` (${props})` : ''}`;
}

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  total: number;
}

export function getDiffSummary(items: DiffItem[]): DiffSummary {
  return {
    added: items.filter(i => i.type === 'node_added' || i.type === 'edge_added').length,
    removed: items.filter(i => i.type === 'node_removed' || i.type === 'edge_removed').length,
    changed: items.filter(i => i.type === 'node_changed').length,
    total: items.length,
  };
}
