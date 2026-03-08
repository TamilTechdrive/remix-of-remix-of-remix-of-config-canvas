import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Pencil, Copy, GitBranch,
  Package, Settings2, Download, ChevronRight, Power,
  PowerOff, Boxes,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProjectStore } from '@/hooks/useProjectStore';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import type { Build, BuildModule, ModuleType } from '@/types/projectTypes';
import { BUILD_STATUS_META, MODULE_TYPE_META, PROJECT_STATUS_META } from '@/types/projectTypes';
import { toast } from 'sonner';

const ProjectDetail = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const store = useProjectStore();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const project = store.getProject(projectId || '');

  const [selectedBuildId, setSelectedBuildId] = useState<string | null>(null);
  const [createBuildOpen, setCreateBuildOpen] = useState(false);
  const [editBuildOpen, setEditBuildOpen] = useState<Build | null>(null);
  const [addModuleOpen, setAddModuleOpen] = useState(false);

  // Build form
  const [buildName, setBuildName] = useState('');
  const [buildVersion, setBuildVersion] = useState('1.0.0');
  const [buildDesc, setBuildDesc] = useState('');

  // Module form
  const [modName, setModName] = useState('');
  const [modType, setModType] = useState<ModuleType>('egos');
  const [modDesc, setModDesc] = useState('');

  if (!project) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Project not found</p>
        <Button variant="outline" onClick={() => navigate('/projects')} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Projects
        </Button>
      </div>
    );
  }

  const selectedBuild = project.builds.find(b => b.id === selectedBuildId);

  // ── Build actions ──────────────────────────────

  const handleCreateBuild = () => {
    if (!buildName.trim()) return;
    const build = store.createBuild(project.id, {
      name: buildName.trim(),
      version: buildVersion.trim() || '1.0.0',
      description: buildDesc.trim(),
    });
    setCreateBuildOpen(false);
    if (build) setSelectedBuildId(build.id);
    setBuildName('');
    setBuildVersion('1.0.0');
    setBuildDesc('');
  };

  const handleEditBuild = () => {
    if (!editBuildOpen || !buildName.trim()) return;
    store.updateBuild(project.id, editBuildOpen.id, {
      name: buildName.trim(),
      version: buildVersion.trim(),
      description: buildDesc.trim(),
    });
    setEditBuildOpen(null);
  };

  const handleDeleteBuild = async (build: Build) => {
    const ok = await confirm({
      title: 'Delete Build',
      description: `Delete "${build.name} v${build.version}" and all its modules? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (ok) {
      store.deleteBuild(project.id, build.id);
      if (selectedBuildId === build.id) setSelectedBuildId(null);
    }
  };

  const handleVersionBuild = async (build: Build) => {
    const ok = await confirm({
      title: 'Create New Version',
      description: `Clone "${build.name} v${build.version}" as a new version? All modules will be copied.`,
      confirmLabel: 'Create Version',
    });
    if (ok) {
      const clone = store.cloneBuild(project.id, build.id);
      if (clone) setSelectedBuildId(clone.id);
    }
  };

  // ── Module actions ──────────────────────────────

  const handleAddModule = () => {
    if (!selectedBuildId || !modName.trim()) return;
    store.addModule(project.id, selectedBuildId, {
      name: modName.trim(),
      type: modType,
      description: modDesc.trim(),
    });
    setAddModuleOpen(false);
    setModName('');
    setModType('egos');
    setModDesc('');
  };

  const handleDeleteModule = async (mod: BuildModule) => {
    const ok = await confirm({
      title: 'Delete Module',
      description: `Delete "${mod.name}" and all its configuration? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (ok && selectedBuildId) {
      store.deleteModule(project.id, selectedBuildId, mod.id);
    }
  };

  const handleToggleModule = (mod: BuildModule) => {
    if (!selectedBuildId) return;
    store.updateModule(project.id, selectedBuildId, mod.id, { enabled: !mod.enabled });
  };

  const openModuleEditor = (mod: BuildModule) => {
    navigate(`/projects/${project.id}/builds/${selectedBuildId}/modules/${mod.id}/editor`);
  };

  // ── Export ──────────────────────────────

  const exportBuild = (build: Build) => {
    const data = { project: { id: project.id, name: project.name }, build, exportedAt: new Date().toISOString() };
    downloadJSON(data, `${project.name}-${build.name}-v${build.version}.json`);
    toast.success('Build Exported');
  };

  const exportProject = () => {
    const data = { project, exportedAt: new Date().toISOString() };
    downloadJSON(data, `${project.name}-full.json`);
    toast.success('Project Exported');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/projects')} className="shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground truncate">{project.name}</h1>
            <Badge className={`text-[10px] ${PROJECT_STATUS_META[project.status].color}`}>
              {PROJECT_STATUS_META[project.status].label}
            </Badge>
          </div>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{project.description}</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={exportProject} className="gap-1.5">
          <Download className="w-3.5 h-3.5" /> Export Project
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Builds sidebar */}
        <div className="col-span-12 lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-primary" /> Builds
              <Badge variant="secondary" className="text-[10px]">{project.builds.length}</Badge>
            </h2>
            <Button size="sm" onClick={() => { setBuildName(''); setBuildVersion('1.0.0'); setBuildDesc(''); setCreateBuildOpen(true); }} className="gap-1 h-7 text-xs">
              <Plus className="w-3 h-3" /> New Build
            </Button>
          </div>

          {project.builds.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border rounded-lg">
              <Boxes className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No builds yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {project.builds
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map(build => (
                <Card
                  key={build.id}
                  className={`cursor-pointer transition-all ${selectedBuildId === build.id ? 'border-primary ring-1 ring-primary/20' : 'hover:border-primary/30'}`}
                  onClick={() => setSelectedBuildId(build.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{build.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[9px] h-4 font-mono">v{build.version}</Badge>
                          <Badge className={`text-[9px] h-4 ${BUILD_STATUS_META[build.status].color}`}>
                            {BUILD_STATUS_META[build.status].label}
                          </Badge>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <Settings2 className="w-3 h-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => {
                            setBuildName(build.name);
                            setBuildVersion(build.version);
                            setBuildDesc(build.description);
                            setEditBuildOpen(build);
                          }}>
                            <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleVersionBuild(build)}>
                            <GitBranch className="w-3.5 h-3.5 mr-2" /> New Version
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportBuild(build)}>
                            <Download className="w-3.5 h-3.5 mr-2" /> Export
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteBuild(build)}>
                            <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                      <span>{build.modules.length} module{build.modules.length !== 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span>{new Date(build.updatedAt).toLocaleDateString()}</span>
                      {build.parentBuildId && (
                        <>
                          <span>·</span>
                          <GitBranch className="w-2.5 h-2.5" />
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Module area */}
        <div className="col-span-12 lg:col-span-8">
          {!selectedBuild ? (
            <div className="text-center py-20 border border-dashed border-border rounded-lg">
              <ChevronRight className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Select a build to manage its modules</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    {selectedBuild.name}
                    <Badge variant="outline" className="text-[10px] font-mono">v{selectedBuild.version}</Badge>
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedBuild.description || 'No description'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedBuild.status}
                    onValueChange={v => store.updateBuild(project.id, selectedBuild.id, { status: v as Build['status'] })}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="review">Review</SelectItem>
                      <SelectItem value="released">Released</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={() => { setModName(''); setModType('egos'); setModDesc(''); setAddModuleOpen(true); }} className="gap-1 h-8 text-xs">
                    <Plus className="w-3 h-3" /> Add Module
                  </Button>
                </div>
              </div>

              <Separator />

              {selectedBuild.modules.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-border rounded-lg">
                  <Package className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No modules in this build</p>
                  <Button size="sm" variant="outline" className="mt-3 gap-1"
                    onClick={() => { setModName(''); setModType('egos'); setModDesc(''); setAddModuleOpen(true); }}>
                    <Plus className="w-3 h-3" /> Add Module
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedBuild.modules.map(mod => {
                    const meta = MODULE_TYPE_META[mod.type];
                    return (
                      <Card key={mod.id} className={`transition-all ${!mod.enabled ? 'opacity-50' : 'hover:border-primary/30'}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                                style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                              >
                                {meta.icon}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{mod.name}</p>
                                <Badge variant="outline" className="text-[9px] h-4" style={{ borderColor: `${meta.color}40`, color: meta.color }}>
                                  {meta.label}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleToggleModule(mod)}
                                title={mod.enabled ? 'Disable module' : 'Enable module'}
                              >
                                {mod.enabled ? <Power className="w-3 h-3 text-node-module" /> : <PowerOff className="w-3 h-3 text-muted-foreground" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive/60 hover:text-destructive"
                                onClick={() => handleDeleteModule(mod)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>

                          {mod.description && (
                            <p className="text-[11px] text-muted-foreground mb-3 line-clamp-2">{mod.description}</p>
                          )}

                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">
                              {mod.nodes.length} nodes · {mod.edges.length} edges
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => openModuleEditor(mod)}
                              disabled={!mod.enabled}
                            >
                              <Settings2 className="w-3 h-3" /> Configure
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Build Dialog */}
      <Dialog open={createBuildOpen} onOpenChange={setCreateBuildOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Build</DialogTitle>
            <DialogDescription>Create a new build for {project.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Build Name</Label>
              <Input value={buildName} onChange={e => setBuildName(e.target.value)} placeholder="e.g. Main ECU Build" className="mt-1" />
            </div>
            <div>
              <Label>Version</Label>
              <Input value={buildVersion} onChange={e => setBuildVersion(e.target.value)} placeholder="1.0.0" className="mt-1 font-mono" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={buildDesc} onChange={e => setBuildDesc(e.target.value)} placeholder="Build description..." className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateBuildOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateBuild} disabled={!buildName.trim()}>Create Build</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Build Dialog */}
      <Dialog open={!!editBuildOpen} onOpenChange={v => { if (!v) setEditBuildOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Build</DialogTitle>
            <DialogDescription>Update build details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Build Name</Label>
              <Input value={buildName} onChange={e => setBuildName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Version</Label>
              <Input value={buildVersion} onChange={e => setBuildVersion(e.target.value)} className="mt-1 font-mono" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={buildDesc} onChange={e => setBuildDesc(e.target.value)} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBuildOpen(null)}>Cancel</Button>
            <Button onClick={handleEditBuild} disabled={!buildName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Module Dialog */}
      <Dialog open={addModuleOpen} onOpenChange={setAddModuleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Module</DialogTitle>
            <DialogDescription>Add a new module to {selectedBuild?.name || 'this build'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Module Name</Label>
              <Input value={modName} onChange={e => setModName(e.target.value)} placeholder="e.g. Body Control" className="mt-1" />
            </div>
            <div>
              <Label>Module Type</Label>
              <Select value={modType} onValueChange={v => setModType(v as ModuleType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MODULE_TYPE_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <span>{meta.icon}</span>
                        <span>{meta.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={modDesc} onChange={e => setModDesc(e.target.value)} placeholder="What this module does..." className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModuleOpen(false)}>Cancel</Button>
            <Button onClick={handleAddModule} disabled={!modName.trim()}>Add Module</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </div>
  );
};

function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default ProjectDetail;
