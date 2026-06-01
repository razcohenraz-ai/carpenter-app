import { useState, useEffect, useCallback } from 'react';
import type { Cabinet, Project, ProductUnit } from '../../types';
import type { ProductType } from '../../types/project';
import { serializeProject, deserializeProject } from '../../core/project/serialize';
import { CURRENT_SCHEMA_VERSION } from '../../core/project/migrations';
import { defaultInputForType, emptyCabinetState } from '../../core/product/productDefaults';
import { kitchenModuleInput, kitchenModuleState, type KitchenModuleType } from '../../core/product/kitchenModules';
import type { KitchenUnit } from '../../types/project';

const STORAGE_KEY = 'carpenter-project-v2';

function generateId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 11);
}

function emptyProject(name: string): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectName: name,
    products: [],
  };
}

function loadFromStorage(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return deserializeProject(raw);
  } catch {
    return null;
  }
}

export interface UseProjectReturn {
  project: Project;
  activeProductId: string | null;
  setActiveProduct: (id: string) => void;
  clearActiveProduct: () => void;
  addProduct: (type: ProductType, name: string) => string;
  addKitchenUnit: (productId: string, moduleType: KitchenModuleType, name: string, W?: number) => string;
  removeKitchenUnit: (productId: string, unitId: string) => void;
  updateKitchenUnit: (productId: string, unitId: string, cabinet: import('../../types').Cabinet) => void;
  renameKitchenUnit: (productId: string, unitId: string, name: string) => void;
  removeProduct: (id: string) => void;
  updateProductCabinet: (id: string, cabinet: Cabinet) => void;
  renameProject: (name: string) => void;
  renameProduct: (id: string, name: string) => void;
  newProject: (name: string) => void;
  exportProject: () => void;
  importProject: (file: File) => Promise<void>;
}

export function useProject(): UseProjectReturn {
  const [project, setProject] = useState<Project>(
    () => loadFromStorage() ?? emptyProject('פרויקט חדש'),
  );
  const [activeProductId, setActiveProductId] = useState<string | null>(null);

  // Auto-save to localStorage on every project change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeProject(project));
    } catch {
      // localStorage unavailable (private mode, quota exceeded) — silent
    }
  }, [project]);

  const setActiveProduct = useCallback((id: string) => {
    setActiveProductId(id);
  }, []);

  const clearActiveProduct = useCallback(() => {
    setActiveProductId(null);
  }, []);

  const addProduct = useCallback((type: ProductType, name: string): string => {
    const id = generateId();
    const unit: ProductUnit = {
      id, name, productType: type,
      cabinet: { input: defaultInputForType(type), state: emptyCabinetState() },
      ...(type === 'kitchen' ? { kitchenUnits: [] } : {}),
    };
    setProject(prev => ({ ...prev, products: [...prev.products, unit] }));
    return id;
  }, []);

  const addKitchenUnit = useCallback((
    productId: string, moduleType: KitchenModuleType, name: string, W?: number,
  ): string => {
    const unitId = generateId();
    const newUnit: KitchenUnit = {
      id: unitId, name, moduleType,
      cabinet: { input: kitchenModuleInput(moduleType, W), state: kitchenModuleState(moduleType) },
    };
    setProject(prev => ({
      ...prev,
      products: prev.products.map(p =>
        p.id === productId
          ? { ...p, kitchenUnits: [...(p.kitchenUnits ?? []), newUnit] }
          : p,
      ),
    }));
    return unitId;
  }, []);

  const removeKitchenUnit = useCallback((productId: string, unitId: string) => {
    setProject(prev => ({
      ...prev,
      products: prev.products.map(p =>
        p.id === productId
          ? { ...p, kitchenUnits: (p.kitchenUnits ?? []).filter(u => u.id !== unitId) }
          : p,
      ),
    }));
  }, []);

  const updateKitchenUnit = useCallback((
    productId: string, unitId: string, cabinet: import('../../types').Cabinet,
  ) => {
    setProject(prev => ({
      ...prev,
      products: prev.products.map(p =>
        p.id === productId
          ? { ...p, kitchenUnits: (p.kitchenUnits ?? []).map(u => u.id === unitId ? { ...u, cabinet } : u) }
          : p,
      ),
    }));
  }, []);

  const renameKitchenUnit = useCallback((productId: string, unitId: string, name: string) => {
    setProject(prev => ({
      ...prev,
      products: prev.products.map(p =>
        p.id === productId
          ? { ...p, kitchenUnits: (p.kitchenUnits ?? []).map(u => u.id === unitId ? { ...u, name } : u) }
          : p,
      ),
    }));
  }, []);

  const removeProduct = useCallback((id: string) => {
    setProject(prev => ({ ...prev, products: prev.products.filter(p => p.id !== id) }));
    setActiveProductId(cur => (cur === id ? null : cur));
  }, []);

  const updateProductCabinet = useCallback((id: string, cabinet: Cabinet) => {
    setProject(prev => ({
      ...prev,
      products: prev.products.map(p => p.id === id ? { ...p, cabinet } : p),
    }));
  }, []);

  const renameProject = useCallback((name: string) => {
    setProject(prev => ({ ...prev, projectName: name }));
  }, []);

  const renameProduct = useCallback((id: string, name: string) => {
    setProject(prev => ({
      ...prev,
      products: prev.products.map(p => p.id === id ? { ...p, name } : p),
    }));
  }, []);

  const newProject = useCallback((name: string) => {
    setProject(emptyProject(name));
    setActiveProductId(null);
  }, []);

  const exportProject = useCallback(() => {
    try {
      const json = serializeProject(project);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.projectName.replace(/[^\w֐-׾\s-]/g, '')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, [project]);

  const importProject = useCallback(async (file: File): Promise<void> => {
    const text = await file.text();
    const loaded = deserializeProject(text);
    setProject(loaded);
    setActiveProductId(null);
  }, []);

  return {
    project, activeProductId,
    setActiveProduct, clearActiveProduct,
    addProduct, removeProduct, updateProductCabinet,
    addKitchenUnit, removeKitchenUnit, updateKitchenUnit, renameKitchenUnit,
    renameProject, renameProduct,
    newProject, exportProject, importProject,
  };
}
