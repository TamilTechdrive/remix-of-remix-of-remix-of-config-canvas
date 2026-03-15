import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  Upload, Database, FileCode, FileText, Download, Trash2, ChevronDown, ChevronRight,
  Layers, GitBranch, Hash, Eye, Loader2, RefreshCw, FileSpreadsheet, ExternalLink,
  Save, Plus, AlertTriangle, AlertCircle, Info, Package, MapPin, ArrowRight,
} from 'lucide-react';
import api, { projectApi } from '@/services/api';
import { sessionDetailToRawConfig } from '@/data/parserToConfig';
import { parseConfigToFlow } from '@/data/configParser';

interface ParserSession {
  id: string;
  session_name: string;
  source_file_name: string;
  total_processed_files: number;
  total_included_files: number;
  total_define_vars: number;
  created_at: string;
}

const parserApi = {
  seed: (data: { jsonData?: any; sessionName?: string }) =>
    api.post('/parser/seed', data),
  listSessions: () => api.get('/parser/sessions'),
  getSession: (id: string) => api.get(`/parser/sessions/${id}`),
  deleteSession: (id: string) => api.delete(`/parser/sessions/${id}`),
  exportCSV: (id: string, sheet: string) =>
    api.get(`/parser/sessions/${id}/export`, { params: { sheet }, responseType: 'blob' }),
};

// Module color mapping for known STB modules
const MODULE_COLORS: Record<string, string> = {
  eDBE: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  epress: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  egos: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  eintr: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  ekernal: 'bg-red-500/10 text-red-400 border-red-500/30',
  ekernel: 'bg-red-500/10 text-red-400 border-red-500/30',
};

function getModuleColor(mod: string): string {
  return MODULE_COLORS[mod] || 'bg-muted text-muted-foreground border-border';
}

// Diagnostic level icons and colors
function DiagnosticIcon({ level }: { level: string }) {
  if (level === 'error') return <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;
  if (level === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
  return <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
}

function diagnosticBadgeClass(level: string): string {
  if (level === 'error') return 'bg-destructive/10 text-destructive border-destructive/30';
  if (level === 'warning') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
}

export default function ParserData() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sessionName, setSessionName] = useState('');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [uploadedJson, setUploadedJson] = useState<any>(null);
  const [fileName, setFileName] = useState('');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveSessionId, setSaveSessionId] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [diagnosticFilter, setDiagnosticFilter] = useState<string>('all');

  const { data: sessions, isLoading: loadingSessions } = useQuery({
    queryKey: ['parser-sessions'],
    queryFn: async () => (await parserApi.listSessions()).data as ParserSession[],
  });

  const { data: sessionDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['parser-session', selectedSession],
    queryFn: async () => (await parserApi.getSession(selectedSession!)).data,
    enabled: !!selectedSession,
  });

  const seedMutation = useMutation({
    mutationFn: (data: { jsonData?: any; sessionName?: string }) => parserApi.seed(data),
    onSuccess: (res) => {
      toast.success(`Seeded successfully! ${res.data.stats.processedFiles} files, ${res.data.stats.defineVars} defines`);
      queryClient.invalidateQueries({ queryKey: ['parser-sessions'] });
      setSelectedSession(res.data.sessionId);
    },
    onError: () => toast.error('Seed failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => parserApi.deleteSession(id),
    onSuccess: () => {
      toast.success('Session deleted');
      queryClient.invalidateQueries({ queryKey: ['parser-sessions'] });
      setSelectedSession(null);
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        setUploadedJson(json);
        toast.success(`Parsed ${file.name} successfully`);
      } catch {
        toast.error('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  const handleSeed = () => {
    seedMutation.mutate({
      jsonData: uploadedJson || undefined,
      sessionName: sessionName || `Import ${new Date().toLocaleString()}`,
    });
  };

  const handleExport = async (sheet: string) => {
    if (!selectedSession) return;
    try {
      const res = await parserApi.exportCSV(selectedSession, sheet);
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sheet}_${selectedSession.slice(0, 8)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${sheet} as CSV`);
    } catch {
      toast.error('Export failed');
    }
  };

  const openSaveDialog = (sessionId: string) => {
    setSaveSessionId(sessionId);
    setSaveDialogOpen(true);
  };

  // Filtered define vars
  const filteredDefineVars = useMemo(() => {
    if (!sessionDetail?.defineVars) return [];
    let vars = sessionDetail.defineVars;
    if (moduleFilter !== 'all') {
      vars = vars.filter((dv: any) => dv.source_module === moduleFilter);
    }
    if (diagnosticFilter !== 'all') {
      vars = vars.filter((dv: any) => dv.diagnostic_level === diagnosticFilter);
    }
    return vars;
  }, [sessionDetail?.defineVars, moduleFilter, diagnosticFilter]);

  // Filtered processed files
  const filteredProcessedFiles = useMemo(() => {
    if (!sessionDetail?.processedFiles) return [];
    if (moduleFilter === 'all') return sessionDetail.processedFiles;
    return sessionDetail.processedFiles.filter((f: any) => f.source_module === moduleFilter);
  }, [sessionDetail?.processedFiles, moduleFilter]);

  // Filtered included files
  const filteredIncludedFiles = useMemo(() => {
    if (!sessionDetail?.includedFiles) return [];
    if (moduleFilter === 'all') return sessionDetail.includedFiles;
    return sessionDetail.includedFiles.filter((f: any) => f.source_module === moduleFilter);
  }, [sessionDetail?.includedFiles, moduleFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileCode className="h-6 w-6 text-primary" />
          C/C++ Parser Data Manager
        </h1>
        <p className="text-muted-foreground mt-1">
          Import, seed, and analyze MakeOpt C/C++ preprocessor parser data — track defines, source locations, and module relationships
        </p>
      </div>

      {/* Import Section */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="h-5 w-5" /> Import & Seed
          </CardTitle>
          <CardDescription>
            Upload a MakeOptCCPPFileParser.json or use the built-in sample data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input type="file" accept=".json" onChange={handleFileUpload} className="cursor-pointer" />
              {fileName && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> {fileName}
                  {uploadedJson && <Badge variant="outline" className="text-xs ml-1">Ready</Badge>}
                </p>
              )}
            </div>
            <Input
              placeholder="Session name (optional)"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              className="sm:w-64"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSeed} disabled={seedMutation.isPending}>
              {seedMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Seeding...</>
              ) : (
                <><Database className="h-4 w-4 mr-2" /> {uploadedJson ? 'Seed Uploaded JSON' : 'Seed Sample Data'}</>
              )}
            </Button>
            {uploadedJson && (
              <Button variant="ghost" onClick={() => { setUploadedJson(null); setFileName(''); }}>
                Clear Upload
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sessions List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="h-5 w-5" /> Seeded Sessions
            <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['parser-sessions'] })}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSessions ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
          ) : !sessions?.length ? (
            <p className="text-muted-foreground">No sessions yet. Import and seed data to get started.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedSession === s.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedSession(s.id)}
                >
                  <div>
                    <p className="font-medium text-foreground">{s.session_name}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1"><FileCode className="h-3 w-3" /> {s.total_processed_files} files</span>
                      <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {s.total_included_files} includes</span>
                      <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {s.total_define_vars} defines</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/editor?parserSession=${s.id}`); }} title="Preview in Config Editor">
                      <ExternalLink className="h-4 w-4 mr-1" /> Preview
                    </Button>
                    <Button variant="default" size="sm" onClick={(e) => { e.stopPropagation(); openSaveDialog(s.id); }} title="Save to Project/Build">
                      <Save className="h-4 w-4 mr-1" /> Save to Build
                    </Button>
                    <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</span>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(s.id); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Detail */}
      {selectedSession && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="h-5 w-5" /> Session Data
                </CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={() => navigate(`/editor?parserSession=${selectedSession}`)}>
                    <ExternalLink className="h-4 w-4 mr-1" /> Preview in Editor
                  </Button>
                  <Button size="sm" variant="default" onClick={() => openSaveDialog(selectedSession)}>
                    <Save className="h-4 w-4 mr-1" /> Save to Build
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleExport('summary')}>
                    <FileSpreadsheet className="h-4 w-4 mr-1" /> Summary
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleExport('processedFiles')}>
                    <Download className="h-4 w-4 mr-1" /> Files CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleExport('includedFiles')}>
                    <Download className="h-4 w-4 mr-1" /> Includes CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleExport('defineVars')}>
                    <Download className="h-4 w-4 mr-1" /> Defines CSV
                  </Button>
                </div>
              </div>

              {/* Diagnostics Summary & Module Filter Bar */}
              {!loadingDetail && sessionDetail && (
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Diagnostics Summary */}
                  {sessionDetail.diagnosticsSummary && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-medium">Diagnostics:</span>
                      <Badge variant="outline" className={diagnosticBadgeClass('error')} onClick={() => setDiagnosticFilter(diagnosticFilter === 'error' ? 'all' : 'error')}>
                        <AlertCircle className="h-3 w-3 mr-1" /> {sessionDetail.diagnosticsSummary.errors} errors
                      </Badge>
                      <Badge variant="outline" className={diagnosticBadgeClass('warning')} onClick={() => setDiagnosticFilter(diagnosticFilter === 'warning' ? 'all' : 'warning')}>
                        <AlertTriangle className="h-3 w-3 mr-1" /> {sessionDetail.diagnosticsSummary.warnings} warnings
                      </Badge>
                      <Badge variant="outline" className={diagnosticBadgeClass('info')} onClick={() => setDiagnosticFilter(diagnosticFilter === 'info' ? 'all' : 'info')}>
                        <Info className="h-3 w-3 mr-1" /> {sessionDetail.diagnosticsSummary.info} info
                      </Badge>
                      {diagnosticFilter !== 'all' && (
                        <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1" onClick={() => setDiagnosticFilter('all')}>
                          Clear
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Module Filter */}
                  {sessionDetail.modules?.length > 0 && (
                    <div className="flex items-center gap-2 ml-auto">
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-medium">Module:</span>
                      <Badge
                        variant="outline"
                        className={`cursor-pointer text-[10px] ${moduleFilter === 'all' ? 'bg-primary/10 text-primary border-primary/30' : ''}`}
                        onClick={() => setModuleFilter('all')}
                      >
                        All
                      </Badge>
                      {sessionDetail.modules.map((mod: string) => (
                        <Badge
                          key={mod}
                          variant="outline"
                          className={`cursor-pointer text-[10px] ${moduleFilter === mod ? getModuleColor(mod) : 'opacity-60 hover:opacity-100'}`}
                          onClick={() => setModuleFilter(moduleFilter === mod ? 'all' : mod)}
                        >
                          {mod}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingDetail ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
            ) : sessionDetail ? (
              <Tabs defaultValue="processed" className="w-full">
                <TabsList>
                  <TabsTrigger value="processed">
                    Processed Files ({filteredProcessedFiles?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="included">
                    Included Files ({filteredIncludedFiles?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="defines">
                    Define Variables ({filteredDefineVars?.length || 0})
                  </TabsTrigger>
                </TabsList>

                {/* Processed Files Tab */}
                <TabsContent value="processed">
                  <ScrollArea className="h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Module</TableHead>
                          <TableHead>File Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Lines</TableHead>
                          <TableHead className="text-right">#if</TableHead>
                          <TableHead className="text-right">#else</TableHead>
                          <TableHead className="text-right">#endif</TableHead>
                          <TableHead className="text-right">Nested Blk</TableHead>
                          <TableHead className="text-right">Def Hits</TableHead>
                          <TableHead className="text-right">Macros</TableHead>
                          <TableHead className="text-right">Time (s)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProcessedFiles?.map((f: any) => (
                          <TableRow key={f.id}>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] ${getModuleColor(f.source_module || '')}`}>
                                {f.source_module || '—'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <span className="font-mono text-xs">{f.file_name}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-sm">
                                    <p className="font-mono text-xs">{f.file_name_full}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                            <TableCell><Badge variant="outline">{f.file_type}</Badge></TableCell>
                            <TableCell className="text-right">{f.input_line_count?.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{f.cond_if}</TableCell>
                            <TableCell className="text-right">{f.cond_else}</TableCell>
                            <TableCell className="text-right">{f.cond_endif}</TableCell>
                            <TableCell className="text-right">{f.cond_nest_block}</TableCell>
                            <TableCell className="text-right">{f.def_hit_count}</TableCell>
                            <TableCell className="text-right">{f.macro_hit_count}</TableCell>
                            <TableCell className="text-right">{Number(f.time_delta).toFixed(4)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </TabsContent>

                {/* Included Files Tab - metadata references, NOT options */}
                <TabsContent value="included">
                  <div className="mb-2 p-2 rounded bg-muted/50 text-xs text-muted-foreground flex items-center gap-2">
                    <Info className="h-3.5 w-3.5" />
                    Included files show where #include directives are found in source files. These are reference metadata to help locate where options are used.
                  </div>
                  <ScrollArea className="h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Module</TableHead>
                          <TableHead>Include File</TableHead>
                          <TableHead>Source File</TableHead>
                          <TableHead>Line #</TableHead>
                          <TableHead>Full Reference</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredIncludedFiles?.map((inc: any) => (
                          <TableRow key={inc.id}>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] ${getModuleColor(inc.source_module || '')}`}>
                                {inc.source_module || '—'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs font-medium text-foreground">{inc.include_file_name}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{inc.source_file_name || '—'}</TableCell>
                            <TableCell>
                              {inc.source_line_number ? (
                                <Badge variant="outline" className="text-[10px] font-mono">
                                  <MapPin className="h-2.5 w-2.5 mr-0.5" />#{inc.source_line_number}
                                </Badge>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="font-mono text-[10px] text-muted-foreground">{inc.source_line_ref}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </TabsContent>

                {/* Define Variables Tab */}
                <TabsContent value="defines">
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-1">
                      {filteredDefineVars?.map((dv: any) => (
                        <DefineVarRow key={dv.id} dv={dv} />
                      ))}
                      {filteredDefineVars?.length === 0 && (
                        <p className="text-muted-foreground text-sm p-4">No define variables match the current filters.</p>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Save to Project Dialog */}
      <SaveToProjectDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        parserSessionId={saveSessionId}
        onSaved={(configId) => {
          toast.success('Config saved to build!');
          navigate(`/editor?configId=${configId}`);
        }}
      />
    </div>
  );
}

// ── Save to Project/Build Dialog ──
function SaveToProjectDialog({
  open,
  onOpenChange,
  parserSessionId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parserSessionId: string | null;
  onSaved: (configId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedBuild, setSelectedBuild] = useState<string>('');
  const [configName, setConfigName] = useState('');
  const [saving, setSaving] = useState(false);

  const [newProjectName, setNewProjectName] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelChipset, setNewModelChipset] = useState('');
  const [newBuildName, setNewBuildName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingModel, setCreatingModel] = useState(false);
  const [creatingBuild, setCreatingBuild] = useState(false);

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await projectApi.list()).data,
    enabled: open,
  });

  const { data: projectDetail } = useQuery({
    queryKey: ['project-detail', selectedProject],
    queryFn: async () => (await projectApi.get(selectedProject)).data,
    enabled: !!selectedProject,
  });

  const stbModels = projectDetail?.stbModels || [];
  const selectedModelData = stbModels.find((m: any) => m.id === selectedModel);
  const builds = selectedModelData?.builds || [];

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      const res = await projectApi.create({ name: newProjectName });
      setSelectedProject(res.data.id);
      setNewProjectName('');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project created');
    } catch { toast.error('Failed to create project'); }
    setCreatingProject(false);
  };

  const handleCreateModel = async () => {
    if (!newModelName.trim() || !selectedProject) return;
    setCreatingModel(true);
    try {
      const res = await projectApi.createSTBModel(selectedProject, { name: newModelName, chipset: newModelChipset || undefined });
      setSelectedModel(res.data.id);
      setNewModelName('');
      setNewModelChipset('');
      queryClient.invalidateQueries({ queryKey: ['project-detail', selectedProject] });
      toast.success('STB Model created');
    } catch { toast.error('Failed to create STB model'); }
    setCreatingModel(false);
  };

  const handleCreateBuild = async () => {
    if (!newBuildName.trim() || !selectedModel) return;
    setCreatingBuild(true);
    try {
      const res = await projectApi.createBuild(selectedModel, { name: newBuildName });
      setSelectedBuild(res.data.id);
      setNewBuildName('');
      queryClient.invalidateQueries({ queryKey: ['project-detail', selectedProject] });
      toast.success('Build created');
    } catch { toast.error('Failed to create build'); }
    setCreatingBuild(false);
  };

  const handleSave = async () => {
    if (!selectedBuild || !parserSessionId) return;
    setSaving(true);
    try {
      const sessionRes = await api.get(`/parser/sessions/${parserSessionId}`);
      const rawConfig = sessionDetailToRawConfig(sessionRes.data);
      const { nodes, edges } = parseConfigToFlow(rawConfig);
      const res = await projectApi.saveParserConfig(selectedBuild, {
        parserSessionId,
        configName: configName || `Parser Config ${new Date().toLocaleString()}`,
        nodes,
        edges,
      });
      onSaved(res.data.configId);
      onOpenChange(false);
    } catch {
      toast.error('Failed to save config to build');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5 text-primary" /> Save Config to Build
          </DialogTitle>
          <DialogDescription>
            Convert parser data to configuration nodes and save to a Project → STB Model → Build
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Configuration Name</Label>
            <Input placeholder="e.g., ndbfcm.c Parser Config" value={configName} onChange={(e) => setConfigName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Project</Label>
            <div className="flex gap-2">
              <Select value={selectedProject} onValueChange={(v) => { setSelectedProject(v); setSelectedModel(''); setSelectedBuild(''); }}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select project..." /></SelectTrigger>
                <SelectContent>
                  {(projects || []).map((p: any) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 mt-1">
              <Input placeholder="New project name" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="flex-1 text-xs h-8" />
              <Button size="sm" variant="outline" onClick={handleCreateProject} disabled={creatingProject || !newProjectName.trim()}>
                <Plus className="h-3 w-3 mr-1" /> Create
              </Button>
            </div>
          </div>

          {selectedProject && (
            <div className="space-y-1.5">
              <Label>STB Model</Label>
              <Select value={selectedModel} onValueChange={(v) => { setSelectedModel(v); setSelectedBuild(''); }}>
                <SelectTrigger><SelectValue placeholder="Select STB model..." /></SelectTrigger>
                <SelectContent>
                  {stbModels.map((m: any) => (<SelectItem key={m.id} value={m.id}>{m.name}{m.chipset ? ` (${m.chipset})` : ''}</SelectItem>))}
                </SelectContent>
              </Select>
              <div className="flex gap-2 mt-1">
                <Input placeholder="Model name" value={newModelName} onChange={(e) => setNewModelName(e.target.value)} className="flex-1 text-xs h-8" />
                <Input placeholder="Chipset" value={newModelChipset} onChange={(e) => setNewModelChipset(e.target.value)} className="w-28 text-xs h-8" />
                <Button size="sm" variant="outline" onClick={handleCreateModel} disabled={creatingModel || !newModelName.trim()}>
                  <Plus className="h-3 w-3 mr-1" /> Create
                </Button>
              </div>
            </div>
          )}

          {selectedModel && (
            <div className="space-y-1.5">
              <Label>Build</Label>
              <Select value={selectedBuild} onValueChange={setSelectedBuild}>
                <SelectTrigger><SelectValue placeholder="Select build..." /></SelectTrigger>
                <SelectContent>
                  {builds.map((b: any) => (<SelectItem key={b.id} value={b.id}>{b.name} ({b.version})</SelectItem>))}
                </SelectContent>
              </Select>
              <div className="flex gap-2 mt-1">
                <Input placeholder="Build name" value={newBuildName} onChange={(e) => setNewBuildName(e.target.value)} className="flex-1 text-xs h-8" />
                <Button size="sm" variant="outline" onClick={handleCreateBuild} disabled={creatingBuild || !newBuildName.trim()}>
                  <Plus className="h-3 w-3 mr-1" /> Create
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !selectedBuild}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : <><Save className="h-4 w-4 mr-2" /> Save & Open Editor</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── DefineVar row component with full diagnostic display ──
function DefineVarRow({ dv }: { dv: any }) {
  const [open, setOpen] = useState(false);

  const typeColor: Record<string, string> = {
    DEFINITION: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    MACRO: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    MACRO_FUNC: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    CONDITIONAL: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    CONTROL: 'bg-green-500/10 text-green-400 border-green-500/30',
    ABS_VAL_CONST: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    REF_DERIVED_VAL: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 transition-colors text-left w-full">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}

          {/* Diagnostic icon */}
          <DiagnosticIcon level={dv.diagnostic_level || 'info'} />

          {/* Module badge */}
          {dv.source_module && (
            <Badge variant="outline" className={`text-[10px] ${getModuleColor(dv.source_module)}`}>
              {dv.source_module}
            </Badge>
          )}

          <span className="font-mono text-sm font-medium text-foreground">{dv.var_name}</span>
          <Badge className={`text-[10px] ${typeColor[dv.first_hit_var_type] || ''}`} variant="outline">
            {dv.first_hit_var_type}
          </Badge>
          {dv.cond_ord_depth != null && (
            <Badge variant="outline" className="text-[10px]">Depth: {dv.cond_ord_depth}</Badge>
          )}
          {dv.cond_ord_dir && (
            <Badge variant="secondary" className="text-[10px]">#{dv.cond_ord_dir}</Badge>
          )}

          {/* Source location */}
          <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
            <MapPin className="h-2.5 w-2.5" />
            {dv.source_file_name}:{dv.source_line_number}
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-6 pl-4 border-l border-border space-y-3 py-2">
          {/* Diagnostic Message */}
          {dv.diagnostic_message && (
            <div className={`p-2 rounded text-xs flex items-start gap-2 ${
              dv.diagnostic_level === 'error' ? 'bg-destructive/10 text-destructive' :
              dv.diagnostic_level === 'warning' ? 'bg-amber-500/10 text-amber-300' :
              'bg-blue-500/10 text-blue-300'
            }`}>
              <DiagnosticIcon level={dv.diagnostic_level || 'info'} />
              <span>{dv.diagnostic_message}</span>
            </div>
          )}

          {/* Source Details */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-muted-foreground">Scope:</span> <span className="text-foreground">{dv.first_hit_src_scope}</span></div>
            <div>
              <span className="text-muted-foreground">Source:</span>{' '}
              <span className="font-mono text-foreground">{dv.source_file_name}:{dv.source_line_number}</span>
            </div>
            {dv.source_module && (
              <div><span className="text-muted-foreground">Module:</span> <Badge variant="outline" className={`text-[10px] ${getModuleColor(dv.source_module)}`}>{dv.source_module}</Badge></div>
            )}
            <div><span className="text-muted-foreground">Full Ref:</span> <span className="font-mono text-[10px] text-foreground">{dv.first_hit_slnr}</span></div>
            {dv.cond_ord_dir && (
              <>
                <div><span className="text-muted-foreground">Cond Dir:</span> <span className="text-foreground">#{dv.cond_ord_dir}</span></div>
                <div><span className="text-muted-foreground">Cond Ref:</span> <span className="font-mono text-foreground">{dv.cond_ord_slnr}</span></div>
              </>
            )}
          </div>

          {/* Relations */}
          {(dv.parents?.length > 0 || dv.siblings?.length > 0 || dv.children?.length > 0) && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <GitBranch className="h-3 w-3" /> Relationships
              </p>
              {dv.parents?.length > 0 && (
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="text-[10px] text-muted-foreground w-14">Parents:</span>
                  {dv.parents.map((p: string) => (
                    <Badge key={p} variant="outline" className="text-[10px] flex items-center gap-0.5">
                      <ArrowRight className="h-2 w-2" />{p}
                    </Badge>
                  ))}
                </div>
              )}
              {dv.siblings?.length > 0 && (
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="text-[10px] text-muted-foreground w-14">Siblings:</span>
                  {dv.siblings.map((s: string) => (<Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>))}
                </div>
              )}
              {dv.children?.length > 0 && (
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="text-[10px] text-muted-foreground w-14">Children:</span>
                  {dv.children.map((c: string) => (
                    <Badge key={c} variant="outline" className="text-[10px] flex items-center gap-0.5">
                      <ArrowRight className="h-2 w-2 rotate-180" />{c}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* All Hits */}
          {dv.allHits?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">All Occurrences ({dv.allHits.length})</p>
              <div className="space-y-0.5">
                {dv.allHits.map((h: any, i: number) => (
                  <div key={i} className="text-xs text-foreground flex items-center gap-2 p-1 rounded hover:bg-muted/30">
                    <Badge variant="outline" className={`text-[10px] ${getModuleColor(h.source_module || '')}`}>
                      {h.source_module || '—'}
                    </Badge>
                    <span className="text-muted-foreground">{h.hit_mode || h.var_type}</span>
                    {h.hit_src_scope && <Badge variant="secondary" className="text-[10px]">{h.hit_src_scope}</Badge>}
                    <span className="text-muted-foreground">depth:{h.depth}</span>
                    <span className="font-mono text-[10px] ml-auto flex items-center gap-1">
                      <MapPin className="h-2.5 w-2.5" />
                      {h.source_file_name}:{h.source_line_number}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Value Entries */}
          {dv.valEntries?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Value Entries</p>
              {dv.valEntries.map((v: any) => (
                <div key={v.id} className="text-xs text-foreground">
                  <span className="text-muted-foreground">{v.value_key}:</span>{' '}
                  <span className="font-mono">{typeof v.value_items === 'string' ? v.value_items : JSON.stringify(v.value_items)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
