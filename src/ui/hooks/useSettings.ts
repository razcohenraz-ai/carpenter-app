import { useState, useEffect } from 'react';
import type { MaterialId, CustomMaterial } from '../../types/materials';
import { MATERIALS } from '../../catalog';

interface AppSettings {
  // Master list of custom materials (shared across body & front)
  customMaterials: CustomMaterial[];
  // Which material IDs (catalog or custom) appear in each dropdown
  bodyEnabledMaterialIds: string[];
  frontEnabledMaterialIds: string[];
  // Price overrides for catalog materials
  bodyMaterialPriceOverrides: Partial<Record<MaterialId, number>>;
  frontMaterialPriceOverrides: Partial<Record<MaterialId, number>>;
  // Hardware
  hardwarePriceOverrides: Partial<Record<string, number>>;
}

export type { AppSettings };

const SETTINGS_KEY = 'carpenter-settings-v2';

const DEFAULT_CATALOG_IDS = Object.keys(MATERIALS);

function defaultSettings(): AppSettings {
  return {
    customMaterials: [],
    bodyEnabledMaterialIds: [...DEFAULT_CATALOG_IDS],
    frontEnabledMaterialIds: [...DEFAULT_CATALOG_IDS],
    bodyMaterialPriceOverrides: {},
    frontMaterialPriceOverrides: {},
    hardwarePriceOverrides: {},
  };
}

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<AppSettings>;
      return {
        customMaterials: parsed.customMaterials ?? [],
        bodyEnabledMaterialIds: parsed.bodyEnabledMaterialIds ?? [...DEFAULT_CATALOG_IDS],
        frontEnabledMaterialIds: parsed.frontEnabledMaterialIds ?? [...DEFAULT_CATALOG_IDS],
        bodyMaterialPriceOverrides: parsed.bodyMaterialPriceOverrides ?? {},
        frontMaterialPriceOverrides: parsed.frontMaterialPriceOverrides ?? {},
        hardwarePriceOverrides: parsed.hardwarePriceOverrides ?? {},
      };
    }
  } catch {
    // Corrupt storage, ignore
  }
  return defaultSettings();
}

function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage error, silently fail
  }
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(() => loadSettings());

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  return {
    settings,

    // ── Toggle which materials appear in each dropdown ────────────────────────
    toggleBodyMaterial: (id: string) => {
      setSettingsState(prev => ({
        ...prev,
        bodyEnabledMaterialIds: toggleId(prev.bodyEnabledMaterialIds, id),
      }));
    },
    toggleFrontMaterial: (id: string) => {
      setSettingsState(prev => ({
        ...prev,
        frontEnabledMaterialIds: toggleId(prev.frontEnabledMaterialIds, id),
      }));
    },

    // ── Price overrides for catalog materials ─────────────────────────────────
    setBodyMaterialPrice: (id: MaterialId, price: number) => {
      setSettingsState(prev => ({
        ...prev,
        bodyMaterialPriceOverrides: { ...prev.bodyMaterialPriceOverrides, [id]: price },
      }));
    },
    resetBodyMaterialPrice: (id: MaterialId) => {
      setSettingsState(prev => {
        const { [id]: _, ...rest } = prev.bodyMaterialPriceOverrides;
        return { ...prev, bodyMaterialPriceOverrides: rest };
      });
    },
    setFrontMaterialPrice: (id: MaterialId, price: number) => {
      setSettingsState(prev => ({
        ...prev,
        frontMaterialPriceOverrides: { ...prev.frontMaterialPriceOverrides, [id]: price },
      }));
    },
    resetFrontMaterialPrice: (id: MaterialId) => {
      setSettingsState(prev => {
        const { [id]: _, ...rest } = prev.frontMaterialPriceOverrides;
        return { ...prev, frontMaterialPriceOverrides: rest };
      });
    },

    // ── Custom materials (shared master list) ─────────────────────────────────
    addCustomMaterial: (material: CustomMaterial) => {
      setSettingsState(prev => ({
        ...prev,
        customMaterials: [...prev.customMaterials, material],
      }));
    },
    removeCustomMaterial: (id: string) => {
      setSettingsState(prev => ({
        ...prev,
        customMaterials: prev.customMaterials.filter(m => m.id !== id),
        // also remove from enabled lists
        bodyEnabledMaterialIds: prev.bodyEnabledMaterialIds.filter(x => x !== id),
        frontEnabledMaterialIds: prev.frontEnabledMaterialIds.filter(x => x !== id),
      }));
    },
    updateCustomMaterial: (id: string, updates: Partial<CustomMaterial>) => {
      setSettingsState(prev => ({
        ...prev,
        customMaterials: prev.customMaterials.map(m =>
          m.id === id ? { ...m, ...updates } : m
        ),
      }));
    },

    // ── Hardware ──────────────────────────────────────────────────────────────
    setHardwarePrice: (id: string, price: number) => {
      setSettingsState(prev => ({
        ...prev,
        hardwarePriceOverrides: { ...prev.hardwarePriceOverrides, [id]: price },
      }));
    },
    resetHardwarePrice: (id: string) => {
      setSettingsState(prev => {
        const { [id]: _, ...rest } = prev.hardwarePriceOverrides;
        return { ...prev, hardwarePriceOverrides: rest };
      });
    },
  };
}
