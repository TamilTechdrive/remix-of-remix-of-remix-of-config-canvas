import { useState } from 'react';
import {
  X, Plus, Trash2, Eye, EyeOff, HelpCircle, Palette,
  StickyNote, ChevronDown, ChevronRight, Copy, RotateCcw,
  Link2, Unlink, ArrowDown, ArrowUp, Paintbrush, Info,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { ConfigNodeData, ConfigNodeType } from '@/types/configTypes';
import { NODE_LABELS } from '@/types/configTypes';
import DependencySuggestions from './DependencySuggestions';
import type { Edge } from '@xyflow/react';

interface VisibilityCondition {
  id: string;
  sourceNodeId: string;
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'is_true' | 'is_false' | 'is_empty' | 'is_not_empty';
  value: string;
  logic: 'and' | 'or';
}

interface PropertiesPanelProps {
  nodeId: string;
  data: ConfigNodeData;
  onUpdate: (nodeId: string, data: Partial<ConfigNodeData>) => void;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
  onAutoAdd: (parentId: string, type: ConfigNodeType) => void;
  edges: Edge[];
  allNodes: { id: string; data: unknown }[];
}

const OPERATOR_LABELS: Record<VisibilityCondition['operator'], string> = {
  equals: '= Equals',
  not_equals: '≠ Not Equals',
  contains: '∋ Contains',
  gt: '> Greater Than',
  lt: '< Less Than',
  is_true: '✓ Is True',
  is_false: '✗ Is False',
  is_empty: '∅ Is Empty',
  is_not_empty: '◉ Is Not Empty',
};

const OPERATOR_SHORT: Record<VisibilityCondition['operator'], string> = {
  equals: '=',
  not_equals: '≠',
  contains: '∋',
  gt: '>',
  lt: '<',
  is_true: '✓',
  is_false: '✗',
  is_empty: '∅',
  is_not_empty: '◉',
};

const FIELD_LABELS: Record<string, { label: string; desc: string }> = {
  visible: { label: 'Visible', desc: 'Node visibility state' },
  included: { label: 'Included', desc: 'Whether node is active in config' },
  label: { label: 'Label', desc: 'Node display name' },
  enabled: { label: 'Enabled', desc: 'Node enabled state' },
  value: { label: 'Value', desc: 'Node current value' },
};

const NO_VALUE_OPERATORS = ['is_true', 'is_false', 'is_empty', 'is_not_empty'];

const NODE_COLOR_PRESETS = [
  { label: 'Default', value: '', color: 'bg-muted', ring: '' },
  { label: 'Blue', value: 'blue', color: 'bg-node-container', ring: 'ring-node-container' },
  { label: 'Green', value: 'green', color: 'bg-node-module', ring: 'ring-node-module' },
  { label: 'Yellow', value: 'yellow', color: 'bg-node-group', ring: 'ring-node-group' },
  { label: 'Red', value: 'red', color: 'bg-destructive', ring: 'ring-destructive' },
  { label: 'Purple', value: 'purple', color: 'bg-node-option', ring: 'ring-node-option' },
  { label: 'Orange', value: 'orange', color: 'bg-node-group', ring: 'ring-node-group' },
];

const PropertiesPanel = ({ nodeId, data, onUpdate, onClose, onDelete, onAutoAdd, edges, allNodes }: PropertiesPanelProps) => {
  const [newPropKey, setNewPropKey] = useState('');
  const [newPropValue, setNewPropValue] = useState('');
  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>({
    basic: true, visibility: true, properties: false, appearance: false, notes: false, deps: true,
  });

  const toggleSection = (key: string) =>
    setSectionsOpen((s) => ({ ...s, [key]: !s[key] }));

  const conditions: VisibilityCondition[] =
    (data.properties?.visibilityConditions as unknown as VisibilityCondition[]) || [];

  const notes: string = (data.properties?.notes as string) || '';
  const colorTag: string = (data.properties?.colorTag as string) || '';

  const addProperty = () => {
    if (!newPropKey.trim()) return;
    onUpdate(nodeId, {
      properties: { ...data.properties, [newPropKey.trim()]: newPropValue },
    });
    setNewPropKey('');
    setNewPropValue('');
  };

  const removeProperty = (key: string) => {
    const { [key]: _, ...rest } = data.properties;
    onUpdate(nodeId, { properties: rest });
  };

  const updateProperty = (key: string, value: string) => {
    onUpdate(nodeId, {
      properties: { ...data.properties, [key]: value },
    });
  };

  const addCondition = () => {
    const newCond: VisibilityCondition = {
      id: `vc_${Date.now()}`,
      sourceNodeId: '',
      field: 'visible',
      operator: 'is_true',
      value: '',
      logic: conditions.length > 0 ? 'and' : 'and',
    };
    onUpdate(nodeId, {
      properties: { ...data.properties, visibilityConditions: [...conditions, newCond] },
    });
  };

  const updateCondition = (id: string, updates: Partial<VisibilityCondition>) => {
    const updated = conditions.map((c) => (c.id === id ? { ...c, ...updates } : c));
    onUpdate(nodeId, {
      properties: { ...data.properties, visibilityConditions: updated },
    });
  };

  const removeCondition = (id: string) => {
    onUpdate(nodeId, {
      properties: { ...data.properties, visibilityConditions: conditions.filter((c) => c.id !== id) },
    });
  };

  const getNodeLabel = (nId: string) => {
    const n = allNodes.find((nd) => nd.id === nId);
    return n ? (n.data as ConfigNodeData).label : '(unknown)';
  };

  const getNodeType = (nId: string) => {
    const n = allNodes.find((nd) => nd.id === nId);
    return n ? (n.data as ConfigNodeData).type : '';
  };

  const displayProperties = Object.entries(data.properties).filter(
    ([key]) => !['visibilityConditions', 'notes', 'colorTag', 'userRules', 'impact_level', 'priority', 'tags', 'must_enable', 'must_disable'].includes(key)
  );

  // Connection stats
  const incomingEdges = edges.filter((e) => e.target === nodeId);
  const outgoingEdges = edges.filter((e) => e.source === nodeId);

  return (
    <TooltipProvider>
      <div className="w-80 bg-surface-overlay border-l border-border h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            {colorTag && (
              <div className={`w-2.5 h-2.5 rounded-full bg-node-${colorTag === 'blue' ? 'container' : colorTag === 'green' ? 'module' : colorTag === 'yellow' ? 'group' : colorTag === 'purple' ? 'option' : 'group'}`} />
            )}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {NODE_LABELS[data.type]} Properties
              </p>
              <p className="text-sm font-semibold text-foreground">{data.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => {
                  navigator.clipboard.writeText(nodeId);
                }} className="h-7 w-7">
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left"><p className="text-xs">Copy Node ID</p></TooltipContent>
            </Tooltip>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-1">
            {/* ── BASIC INFO ── */}
            <CollapsibleSection
              title="Basic Info"
              icon="📝"
              open={sectionsOpen.basic}
              onToggle={() => toggleSection('basic')}
            >
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    value={data.label}
                    onChange={(e) => onUpdate(nodeId, { label: e.target.value })}
                    className="mt-1 bg-card border-border text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <Textarea
                    value={data.description || ''}
                    onChange={(e) => onUpdate(nodeId, { description: e.target.value })}
                    className="mt-1 bg-card border-border text-sm resize-none"
                    rows={2}
                    placeholder="What does this node do?"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">Visible</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="w-3 h-3 text-muted-foreground/50" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px]">
                        <p className="text-xs">Controls whether this node is visible in the final configuration output</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex items-center gap-2">
                    {data.visible ? (
                      <Eye className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    <Switch
                      checked={data.visible}
                      onCheckedChange={(visible) => onUpdate(nodeId, { visible })}
                    />
                  </div>
                </div>

                {/* Quick connection stats */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 p-2 rounded-md bg-card border border-border">
                    <ArrowDown className="w-3.5 h-3.5 text-node-container" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Incoming</p>
                      <p className="text-xs font-semibold text-foreground">{incomingEdges.length}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-md bg-card border border-border">
                    <ArrowUp className="w-3.5 h-3.5 text-node-module" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Outgoing</p>
                      <p className="text-xs font-semibold text-foreground">{outgoingEdges.length}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            {/* ── VISIBILITY CONDITIONS ── */}
            <CollapsibleSection
              title="Visibility Rules"
              icon="👁️"
              badge={conditions.length > 0 ? String(conditions.length) : undefined}
              badgeVariant={conditions.length > 0 ? 'active' : undefined}
              open={sectionsOpen.visibility}
              onToggle={() => toggleSection('visibility')}
            >
              <div className="space-y-3">
                {/* Current status */}
                <div className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${
                  conditions.length === 0
                    ? 'bg-node-module/5 border-node-module/20'
                    : 'bg-accent/5 border-accent/20'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    conditions.length === 0 ? 'bg-node-module/10' : 'bg-accent/10'
                  }`}>
                    {conditions.length === 0 ? (
                      <Eye className="w-4 h-4 text-node-module" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-accent" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      {conditions.length === 0 ? 'Always Visible' : 'Conditional Visibility'}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      {conditions.length === 0
                        ? 'This node is always shown. Add rules to show/hide it based on other nodes.'
                        : `${conditions.length} ${conditions.length === 1 ? 'rule controls' : 'rules control'} when this node appears.`}
                    </p>
                  </div>
                </div>

                {/* Visual rule cards */}
                {conditions.map((cond, idx) => {
                  const sourceLabel = cond.sourceNodeId ? getNodeLabel(cond.sourceNodeId) : null;
                  const sourceType = cond.sourceNodeId ? getNodeType(cond.sourceNodeId) : '';
                  const opLabel = OPERATOR_SHORT[cond.operator];

                  return (
                    <div key={cond.id} className="space-y-2">
                      {/* Logic connector */}
                      {idx > 0 && (
                        <div className="flex items-center justify-center gap-2">
                          <div className="h-px flex-1 bg-border" />
                          <Select value={cond.logic} onValueChange={(v) => updateCondition(cond.id, { logic: v as 'and' | 'or' })}>
                            <SelectTrigger className="h-5 w-14 text-[9px] font-bold bg-muted border-border rounded-full px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="and">AND</SelectItem>
                              <SelectItem value="or">OR</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      )}

                      {/* Rule card */}
                      <div className="bg-card border border-border rounded-lg overflow-hidden">
                        {/* Visual summary bar */}
                        <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/50 border-b border-border text-[10px]">
                          <span className="text-muted-foreground">IF</span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-semibold">
                            {sourceLabel || '…'}
                          </Badge>
                          <span className="text-muted-foreground">.</span>
                          <span className="font-mono text-accent">{cond.field}</span>
                          <span className="font-bold text-foreground">{opLabel}</span>
                          {!NO_VALUE_OPERATORS.includes(cond.operator) && cond.value && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                              {cond.value}
                            </Badge>
                          )}
                        </div>

                        <div className="p-3 space-y-2.5">
                          {/* Source node */}
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                              <Link2 className="w-3 h-3" /> Source Node
                            </label>
                            <Select value={cond.sourceNodeId} onValueChange={(v) => updateCondition(cond.id, { sourceNodeId: v })}>
                              <SelectTrigger className="mt-1 h-8 text-xs bg-card border-border">
                                <SelectValue placeholder="Choose a node to watch…" />
                              </SelectTrigger>
                              <SelectContent className="max-h-[200px]">
                                {allNodes.filter((n) => n.id !== nodeId).map((n) => {
                                  const nd = n.data as ConfigNodeData;
                                  return (
                                    <SelectItem key={n.id} value={n.id}>
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[8px] h-3.5 px-1">{nd.type}</Badge>
                                        <span className="text-xs">{nd.label}</span>
                                      </div>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Field + Operator side by side */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-medium text-muted-foreground">Field</label>
                              <Select value={cond.field} onValueChange={(v) => updateCondition(cond.id, { field: v })}>
                                <SelectTrigger className="mt-1 h-8 text-xs bg-card border-border">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(FIELD_LABELS).map(([k, { label, desc }]) => (
                                    <SelectItem key={k} value={k}>
                                      <div>
                                        <span className="text-xs">{label}</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-[10px] font-medium text-muted-foreground">Condition</label>
                              <Select value={cond.operator} onValueChange={(v) => updateCondition(cond.id, { operator: v as VisibilityCondition['operator'] })}>
                                <SelectTrigger className="mt-1 h-8 text-xs bg-card border-border">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(OPERATOR_LABELS).map(([k, label]) => (
                                    <SelectItem key={k} value={k}>{label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Value input */}
                          {!NO_VALUE_OPERATORS.includes(cond.operator) && (
                            <div>
                              <label className="text-[10px] font-medium text-muted-foreground">Compare Value</label>
                              <Input
                                value={cond.value}
                                onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                                className="mt-1 h-8 text-xs bg-card border-border"
                                placeholder="Enter value to compare…"
                              />
                            </div>
                          )}
                        </div>

                        {/* Remove button */}
                        <div className="px-3 py-1.5 border-t border-border bg-muted/30">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] text-destructive/60 hover:text-destructive w-full"
                            onClick={() => removeCondition(cond.id)}
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Remove Rule
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs gap-1.5 border-dashed"
                  onClick={addCondition}
                >
                  <Plus className="w-3 h-3" /> Add Visibility Rule
                </Button>

                {/* Legacy raw rule input */}
                <Collapsible>
                  <CollapsibleTrigger className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1 cursor-pointer">
                    <ChevronRight className="w-3 h-3" /> Advanced: Raw Expression
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Input
                      value={data.visibilityRule || ''}
                      onChange={(e) => onUpdate(nodeId, { visibilityRule: e.target.value })}
                      placeholder="e.g. parent.enabled === true"
                      className="mt-1 bg-card border-border text-[10px] font-mono h-7"
                    />
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </CollapsibleSection>

            {/* ── CUSTOM PROPERTIES ── */}
            <CollapsibleSection
              title="Custom Properties"
              icon="⚙️"
              badge={displayProperties.length > 0 ? String(displayProperties.length) : undefined}
              open={sectionsOpen.properties}
              onToggle={() => toggleSection('properties')}
            >
              <div className="space-y-2">
                {displayProperties.map(([key, value]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-muted-foreground min-w-[50px] truncate">{key}</span>
                    <Input
                      value={String(value)}
                      onChange={(e) => updateProperty(key, e.target.value)}
                      className="h-7 text-xs bg-card border-border flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeProperty(key)}
                      className="h-7 w-7 shrink-0 text-destructive/70 hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <Input
                    value={newPropKey}
                    onChange={(e) => setNewPropKey(e.target.value)}
                    placeholder="Key"
                    className="h-7 text-xs bg-card border-border"
                  />
                  <Input
                    value={newPropValue}
                    onChange={(e) => setNewPropValue(e.target.value)}
                    placeholder="Value"
                    className="h-7 text-xs bg-card border-border"
                    onKeyDown={(e) => e.key === 'Enter' && addProperty()}
                  />
                  <Button variant="secondary" size="icon" onClick={addProperty} className="h-7 w-7 shrink-0">
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CollapsibleSection>

            {/* ── APPEARANCE ── */}
            <CollapsibleSection
              title="Appearance"
              icon="🎨"
              badge={colorTag ? colorTag : undefined}
              badgeVariant={colorTag ? 'active' : undefined}
              open={sectionsOpen.appearance}
              onToggle={() => toggleSection('appearance')}
            >
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Paintbrush className="w-3 h-3" /> Color Tag
                  </Label>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    Assign a color to visually categorize this node in the editor.
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {NODE_COLOR_PRESETS.map((c) => {
                      const isSelected = colorTag === c.value || (!colorTag && !c.value);
                      return (
                        <button
                          key={c.value || 'default'}
                          onClick={() => onUpdate(nodeId, { properties: { ...data.properties, colorTag: c.value } })}
                          className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all text-[10px] ${
                            isSelected 
                              ? 'border-primary bg-primary/5 ring-1 ring-primary/30' 
                              : 'border-border bg-card hover:border-muted-foreground/30'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full ${c.color} ${!c.value ? 'border border-border' : ''}`} />
                          <span className={isSelected ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{c.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Preview */}
                {colorTag && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-border text-[10px] text-muted-foreground">
                    <Info className="w-3 h-3 shrink-0" />
                    <span>Color tag "<strong className="text-foreground">{colorTag}</strong>" will appear as a dot indicator on the node header.</span>
                  </div>
                )}
              </div>
            </CollapsibleSection>

            {/* ── NOTES ── */}
            <CollapsibleSection
              title="Notes"
              icon="📌"
              badge={notes ? '✓' : undefined}
              open={sectionsOpen.notes}
              onToggle={() => toggleSection('notes')}
            >
              <Textarea
                value={notes}
                onChange={(e) => onUpdate(nodeId, { properties: { ...data.properties, notes: e.target.value } })}
                className="bg-card border-border text-xs resize-none"
                rows={3}
                placeholder="Add notes, reminders, or documentation for this node..."
              />
            </CollapsibleSection>

            {/* ── DEPENDENCY SUGGESTIONS ── */}
            <CollapsibleSection
              title="Dependencies"
              icon="🔗"
              open={sectionsOpen.deps}
              onToggle={() => toggleSection('deps')}
            >
              <DependencySuggestions
                nodeId={nodeId}
                nodeData={data}
                edges={edges}
                allNodes={allNodes}
                onAutoAdd={onAutoAdd}
              />
            </CollapsibleSection>

            <Separator className="my-2" />

            {/* Quick info */}
            <div className="bg-card border border-border rounded-lg p-2.5 text-[10px] text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Node ID</span>
                <span className="font-mono text-foreground">{nodeId}</span>
              </div>
              <div className="flex justify-between">
                <span>Type</span>
                <Badge variant="outline" className="text-[9px] h-4">{data.type}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Connections</span>
                <span className="text-foreground">{incomingEdges.length + outgoingEdges.length}</span>
              </div>
            </div>

            {/* Delete */}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(nodeId)}
              className="w-full mt-2"
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Delete Node
            </Button>
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
};

// Collapsible section component
const CollapsibleSection = ({
  title,
  icon,
  badge,
  badgeVariant,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: string;
  badge?: string;
  badgeVariant?: 'active' | undefined;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <Collapsible open={open} onOpenChange={onToggle}>
    <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 hover:bg-card/50 rounded-md px-2 -mx-2 transition-colors cursor-pointer">
      {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      <span className="text-sm">{icon}</span>
      <span className="text-xs font-medium text-foreground flex-1 text-left">{title}</span>
      {badge && (
        <Badge 
          variant={badgeVariant === 'active' ? 'default' : 'secondary'} 
          className={`text-[9px] h-4 px-1.5 ${badgeVariant === 'active' ? 'bg-primary/15 text-primary border-primary/30' : ''}`}
        >
          {badge}
        </Badge>
      )}
    </CollapsibleTrigger>
    <CollapsibleContent className="pl-7 pr-1 pb-3 pt-1 space-y-2">
      {children}
    </CollapsibleContent>
  </Collapsible>
);

export default PropertiesPanel;
