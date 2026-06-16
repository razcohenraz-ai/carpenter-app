import { useState, useEffect, useCallback } from 'react';
import type { Cabinet, Project, ProductUnit, MaterialId } from '../../types';
import type { ProductType, Room, ProductPlacement } from '../../types/project';
import { serializeProject, deserializeProject } from '../../core/project/serialize';
import { CURRENT_SCHEMA_VERSION } from '../../core/project/migrations';
import { defaultInputForType, emptyCabinetState } from '../../core/product/productDefaults';
import { kitchenModuleInput, kitchenModuleState, type KitchenModuleType } from '../../core/product/kitchenModules';
import type { KitchenUnit } from '../../types/project';
import { productBounds } from '../../core/room/productBounds';
import { clampCentreToRoom, snapToWall, maxWallOffset } from '../../core/room/roomGeometry';

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
    rooms: [],
  };
}

/** A fresh room with sensible default dimensions (cm). */
function emptyRoom(name: string): Room {
  return { id: generateId(), name, width: 300, depth: 400, height: 250, placements: [] };
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
  addKitchenUnit: (productId: string, moduleType: KitchenModuleType, name: string, W?: number, materials?: { bodyMaterialId?: MaterialId; frontMaterialId?: MaterialId }) => string;
  removeKitchenUnit: (productId: string, unitId: string) => void;
  updateKitchenUnit: (productId: string, unitId: string, cabinet: import('../../types').Cabinet) => void;
  renameKitchenUnit: (productId: string, unitId: string, name: string) => void;
  reorderKitchenUnit: (productId: string, unitId: string, direction: 'left' | 'right') => void;
  removeProduct: (id: string) => void;
  updateProductCabinet: (id: string, cabinet: Cabinet) => void;
  // ── Rooms (floor plan) ──
  addRoom: (name: string) => string;
  removeRoom: (id: string) => void;
  renameRoom: (id: string, name: string) => void;
  updateRoomDims: (id: string, dims: { width?: number; depth?: number; height?: number }) => void;
  placeProduct: (roomId: string, placement: ProductPlacement) => void;
  updatePlacement: (roomId: string, productId: string, patch: Partial<ProductPlacement>) => void;
  removePlacement: (roomId: string, productId: string) => void;
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
    materials?: { bodyMaterialId?: MaterialId; frontMaterialId?: MaterialId },
  ): string => {
    const unitId = generateId();
    // New units inherit the kitchen-wide material (passed by KitchenEditor when
    // all existing units share one) so adding a unit keeps the kitchen uniform.
    const baseInput = kitchenModuleInput(moduleType, W);
    const input = materials ? { ...baseInput, ...materials } : baseInput;
    const newUnit: KitchenUnit = {
      id: unitId, name, moduleType,
      cabinet: { input, state: kitchenModuleState(moduleType) },
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

  const reorderKitchenUnit = useCallback((productId: string, unitId: string, direction: 'left' | 'right') => {
    setProject(prev => ({
      ...prev,
      products: prev.products.map(p => {
        if (p.id !== productId) return p;
        const arr = [...(p.kitchenUnits ?? [])];
        const idx = arr.findIndex(u => u.id === unitId);
        if (idx < 0) return p;
        const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= arr.length) return p;
        [arr[idx], arr[swapIdx]] = [arr[swapIdx]!, arr[idx]!];
        return { ...p, kitchenUnits: arr };
      }),
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
    // Also drop any room placements that referenced the deleted product, so no
    // placement is left pointing at a product that no longer exists.
    setProject(prev => ({
      ...prev,
      products: prev.products.filter(p => p.id !== id),
      rooms: (prev.rooms ?? []).map(r => ({
        ...r,
        placements: r.placements.filter(pl => pl.productId !== id),
      })),
    }));
    setActiveProductId(cur => (cur === id ? null : cur));
  }, []);

  // ── Rooms (floor plan) ──────────────────────────────────────────────────────
  const addRoom = useCallback((name: string): string => {
    const room = emptyRoom(name);
    setProject(prev => ({ ...prev, rooms: [...(prev.rooms ?? []), room] }));
    return room.id;
  }, []);

  const removeRoom = useCallback((id: string) => {
    setProject(prev => ({ ...prev, rooms: (prev.rooms ?? []).filter(r => r.id !== id) }));
  }, []);

  const renameRoom = useCallback((id: string, name: string) => {
    setProject(prev => ({
      ...prev,
      rooms: (prev.rooms ?? []).map(r => r.id === id ? { ...r, name } : r),
    }));
  }, []);

  const updateRoomDims = useCallback((id: string, dims: { width?: number; depth?: number; height?: number }) => {
    setProject(prev => {
      const rooms = (prev.rooms ?? []).map(r => {
        if (r.id !== id) return r;
        const newRoom = { ...r, ...dims };
        const placements = r.placements.map(pl => {
          const product = prev.products.find(p => p.id === pl.productId);
          if (!product) return pl;
          const bounds = productBounds(product);
          let newPl: ProductPlacement;
          if (pl.anchorWall) {
            // Re-snap to the wall in the resized room, clamping the offset so the
            // product doesn't slide past the end of the wall.
            const offset = Math.min(pl.anchorOffset ?? 0, maxWallOffset(newRoom, pl.anchorWall, bounds));
            const snap = snapToWall(newRoom, bounds, pl.anchorWall, offset);
            const y = pl.position.y;
            newPl = { ...pl, ...snap, position: y !== undefined ? { ...snap.position, y } : snap.position };
          } else {
            const clamped = clampCentreToRoom(newRoom, bounds, pl.rotationDeg, pl.position);
            newPl = { ...pl, position: { ...pl.position, ...clamped } };
          }
          // Clamp height off floor when ceiling lowers.
          if (newPl.position.y !== undefined) {
            const maxY = Math.max(0, newRoom.height - bounds.height);
            if (newPl.position.y > maxY) {
              newPl = { ...newPl, position: { ...newPl.position, y: maxY } };
            }
          }
          return newPl;
        });
        return { ...newRoom, placements };
      });
      return { ...prev, rooms };
    });
  }, []);

  const placeProduct = useCallback((roomId: string, placement: ProductPlacement) => {
    setProject(prev => ({
      ...prev,
      rooms: (prev.rooms ?? []).map(r => {
        if (r.id !== roomId) return r;
        // One placement per product: replace if already placed, else append.
        const others = r.placements.filter(p => p.productId !== placement.productId);
        return { ...r, placements: [...others, placement] };
      }),
    }));
  }, []);

  const updatePlacement = useCallback((roomId: string, productId: string, patch: Partial<ProductPlacement>) => {
    setProject(prev => ({
      ...prev,
      rooms: (prev.rooms ?? []).map(r => r.id === roomId
        ? { ...r, placements: r.placements.map(p => p.productId === productId ? { ...p, ...patch } : p) }
        : r),
    }));
  }, []);

  const removePlacement = useCallback((roomId: string, productId: string) => {
    setProject(prev => ({
      ...prev,
      rooms: (prev.rooms ?? []).map(r => r.id === roomId
        ? { ...r, placements: r.placements.filter(p => p.productId !== productId) }
        : r),
    }));
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
    addRoom, removeRoom, renameRoom, updateRoomDims,
    placeProduct, updatePlacement, removePlacement,
    addKitchenUnit, removeKitchenUnit, updateKitchenUnit, renameKitchenUnit, reorderKitchenUnit,
    renameProject, renameProduct,
    newProject, exportProject, importProject,
  };
}
