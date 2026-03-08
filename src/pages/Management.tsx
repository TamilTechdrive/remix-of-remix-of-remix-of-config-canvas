import { useState } from 'react';
import {
  Settings, Plus, Search, Trash2, Edit, Eye, Copy,
  FolderOpen, Clock, Filter, MoreVertical, Archive,
  CheckCircle2, FileText, Download, LayoutGrid, List,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface ConfigItem {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'draft' | 'archived';
  nodes: number;
  edges: number;
  lastModified: string;
  createdBy: string;
  encrypted: boolean;
  version: number;
}

const initialConfigs: ConfigItem[] = [
  { id: '1', name: 'Streaming Pipeline v2.1', description: 'Main video streaming config with adaptive bitrate', status: 'active', nodes: 48, edges: 42, lastModified: '2 hours ago', createdBy: 'admin', encrypted: true, version: 12 },
  { id: '2', name: 'CDN Edge Config', description: 'Content delivery network edge routing settings', status: 'active', nodes: 32, edges: 28, lastModified: '1 day ago', createdBy: 'admin', encrypted: false, version: 8 },
  { id: '3', name: 'Auth Service Config', description: 'Authentication service parameters and rules', status: 'draft', nodes: 24, edges: 18, lastModified: '3 days ago', createdBy: 'editor1', encrypted: true, version: 3 },
  { id: '4', name: 'Video Encoder Settings', description: 'Hardware & software encoder options', status: 'active', nodes: 56, edges: 52, lastModified: '1 week ago', createdBy: 'admin', encrypted: false, version: 21 },
  { id: '5', name: 'Legacy Pipeline (v1)', description: 'Deprecated streaming config', status: 'archived', nodes: 38, edges: 34, lastModified: '1 month ago', createdBy: 'admin', encrypted: false, version: 45 },
  { id: '6', name: 'Analytics Pipeline', description: 'Data analytics and metrics collection', status: 'active', nodes: 18, edges: 14, lastModified: '5 hours ago', createdBy: 'editor1', encrypted: false, version: 6 },
];

const statusColors: Record<string, string> = {
  active: 'bg-node-module/15 text-node-module border-node-module/20',
  draft: 'bg-node-group/15 text-node-group border-node-group/20',
  archived: 'bg-muted text-muted-foreground border-border',
};

const Management = () => {
  const [configs, setConfigs] = useState(initialConfigs);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newConfigName, setNewConfigName] = useState('');
  const [newConfigDesc, setNewConfigDesc] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  const filtered = configs.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.description.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleCreate = () => {
    if (!newConfigName.trim()) return;
    const newConfig: ConfigItem = {
      id: String(Date.now()),
      name: newConfigName,
      description: newConfigDesc,
      status: 'draft',
      nodes: 0,
      edges: 0,
      lastModified: 'just now',
      createdBy: 'admin',
      encrypted: false,
      version: 1,
    };
    setConfigs(prev => [newConfig, ...prev]);
    setNewConfigName('');
    setNewConfigDesc('');
    setCreateOpen(false);
    toast.success('Configuration created');
  };

  const handleDelete = (id: string) => {
    setConfigs(prev => prev.filter(c => c.id !== id));
    setSelectedIds(prev => prev.filter(i => i !== id));
    toast.success('Configuration deleted');
  };

  const handleDuplicate = (config: ConfigItem) => {
    const dup = { ...config, id: String(Date.now()), name: `${config.name} (copy)`, status: 'draft' as const, version: 1, lastModified: 'just now' };
    setConfigs(prev => [dup, ...prev]);
    toast.success('Configuration duplicated');
  };

  const handleBulkDelete = () => {
    setConfigs(prev => prev.filter(c => !selectedIds.includes(c.id)));
    setSelectedIds([]);
    toast.success(`Deleted ${selectedIds.length} configurations`);
  };

  const handleArchive = (id: string) => {
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, status: 'archived' as const } : c));
    toast.success('Configuration archived');
  };

  const totalNodes = configs.reduce((a, c) => a + c.nodes, 0);
  const totalEdges = configs.reduce((a, c) => a + c.edges, 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" />
            Configuration Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Create, edit, and manage your configurations</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> New Configuration
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Configuration</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newConfigName} onChange={e => setNewConfigName(e.target.value)} placeholder="e.g. API Gateway Config" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={newConfigDesc} onChange={e => setNewConfigDesc(e.target.value)} placeholder="Brief description..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!newConfigName.trim()}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Configs', value: configs.length, color: 'text-primary' },
          { label: 'Active', value: configs.filter(c => c.status === 'active').length, color: 'text-node-module' },
          { label: 'Total Nodes', value: totalNodes, color: 'text-node-container' },
          { label: 'Total Edges', value: totalEdges, color: 'text-accent' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters & Actions */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search configurations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card border-border"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 bg-card border-border">
            <Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center border border-border rounded-lg overflow-hidden">
          <button onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'} transition-colors`}>
            <List className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'} transition-colors`}>
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
        {selectedIds.length > 0 && (
          <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> Delete {selectedIds.length}
          </Button>
        )}
      </div>

      {/* Config List */}
      {viewMode === 'list' ? (
        <div className="space-y-2">
          {filtered.map((config) => (
            <Card key={config.id} className={`bg-card border-border hover:border-primary/30 transition-all ${selectedIds.includes(config.id) ? 'ring-1 ring-primary/40' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(config.id)}
                    onChange={() => toggleSelect(config.id)}
                    className="w-4 h-4 rounded border-border accent-primary shrink-0"
                  />
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <FolderOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate('/editor')}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground truncate">{config.name}</h3>
                      <Badge className={`text-[10px] border ${statusColors[config.status]}`}>
                        {config.status}
                      </Badge>
                      {config.encrypted && (
                        <Badge variant="outline" className="text-[9px] gap-0.5">🔒 Encrypted</Badge>
                      )}
                      <Badge variant="outline" className="text-[9px] font-mono">v{config.version}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{config.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
                      <span>{config.nodes} nodes</span>
                      <span>{config.edges} edges</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {config.lastModified}</span>
                      <span>by {config.createdBy}</span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate('/editor')} className="gap-2">
                        <Edit className="w-3.5 h-3.5" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/editor')} className="gap-2">
                        <Eye className="w-3.5 h-3.5" /> View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(config)} className="gap-2">
                        <Copy className="w-3.5 h-3.5" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2">
                        <Download className="w-3.5 h-3.5" /> Export
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {config.status !== 'archived' && (
                        <DropdownMenuItem onClick={() => handleArchive(config.id)} className="gap-2">
                          <Archive className="w-3.5 h-3.5" /> Archive
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleDelete(config.id)} className="gap-2 text-destructive">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((config) => (
            <Card key={config.id} className="bg-card border-border hover:border-primary/30 transition-all cursor-pointer group" onClick={() => navigate('/editor')}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                    <FolderOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex gap-1.5">
                    <Badge className={`text-[10px] border ${statusColors[config.status]}`}>
                      {config.status}
                    </Badge>
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-foreground truncate">{config.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{config.description}</p>
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{config.nodes} nodes · {config.edges} edges</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {config.lastModified}</span>
                </div>
                <div className="mt-2 flex gap-1">
                  {config.encrypted && <Badge variant="outline" className="text-[9px]">🔒</Badge>}
                  <Badge variant="outline" className="text-[9px] font-mono">v{config.version}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No configurations found</p>
          <p className="text-xs mt-1">Try adjusting your search or filters</p>
        </div>
      )}
    </div>
  );
};

export default Management;
