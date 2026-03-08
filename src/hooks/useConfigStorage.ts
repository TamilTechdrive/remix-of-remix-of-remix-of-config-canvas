import { configApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useCallback, useState } from 'react';

interface SavedConfig {
  id: string;
  name: string;
  description?: string;
  version: number;
  status: string;
  is_encrypted: boolean;
  created_at: string;
  updated_at: string;
}

export function useConfigStorage() {
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentConfigId, setCurrentConfigId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchConfigs = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const res = await configApi.list({ page, limit: 50 });
      setSavedConfigs(res.data.data);
      return res.data;
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to fetch configurations', variant: 'destructive' });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const saveConfig = useCallback(async (
    name: string,
    configData: Record<string, unknown>,
    options?: { description?: string; encrypt?: boolean; encryptionKey?: string }
  ) => {
    setIsLoading(true);
    try {
      if (currentConfigId) {
        // Update existing
        const res = await configApi.update(currentConfigId, {
          name,
          description: options?.description,
          configData,
        });
        toast({ title: 'Saved', description: `Configuration updated to v${res.data.version}` });
        return res.data;
      } else {
        // Create new
        const res = await configApi.create({
          name,
          description: options?.description,
          configData,
          encrypt: options?.encrypt,
          encryptionKey: options?.encryptionKey,
        });
        setCurrentConfigId(res.data.id);
        toast({ title: 'Saved', description: 'Configuration saved to server' });
        return res.data;
      }
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.response?.data?.error || 'Could not save', variant: 'destructive' });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [currentConfigId, toast]);

  const loadConfig = useCallback(async (id: string, encryptionKey?: string) => {
    setIsLoading(true);
    try {
      const res = await configApi.get(id, encryptionKey);
      setCurrentConfigId(id);
      toast({ title: 'Loaded', description: `Configuration "${res.data.name}" loaded` });
      return res.data;
    } catch (err: any) {
      toast({ title: 'Load failed', description: err.response?.data?.error || 'Could not load', variant: 'destructive' });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const deleteConfig = useCallback(async (id: string) => {
    try {
      await configApi.delete(id);
      if (currentConfigId === id) setCurrentConfigId(null);
      setSavedConfigs((prev) => prev.filter((c) => c.id !== id));
      toast({ title: 'Deleted', description: 'Configuration removed' });
      return true;
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.response?.data?.error || 'Could not delete', variant: 'destructive' });
      return false;
    }
  }, [currentConfigId, toast]);

  return {
    savedConfigs, isLoading, currentConfigId,
    fetchConfigs, saveConfig, loadConfig, deleteConfig,
    setCurrentConfigId,
  };
}
