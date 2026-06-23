import { useState, useEffect } from 'react';
import type { MaterialId, CustomMaterial } from '../../types/materials';
import { MATERIALS } from '../../catalog';
import { runnerIds, getRunner } from '../../catalog/runners';
import { liftMechanismIds } from '../../catalog/liftMechanisms';

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
  // Which drawer-runner systems the carpenter offers when adding a drawer
  enabledRunnerIds: string[];
  // Per-runner price overrides (₪), keyed by runner id; each value is a band
  // array aligned to that runner's `priceByNlMm` (index 0 = first NL band, …).
  // Missing runner / band → the catalog price is used.
  runnerPriceOverrides: Record<string, number[]>;
  // Which lift-mechanism systems (AVENTOS) the carpenter offers on a wall cabinet
  enabledLiftMechanismIds: string[];
  // Per-lift-mechanism price overrides (₪), keyed by family id; missing → catalog.
  liftMechanismPriceOverrides: Record<string, number>;
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
    enabledRunnerIds: runnerIds(),
    runnerPriceOverrides: {},
    enabledLiftMechanismIds: liftMechanismIds(),
    liftMechanismPriceOverrides: {},
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
        enabledRunnerIds: parsed.enabledRunnerIds ?? runnerIds(),
        runnerPriceOverrides: parsed.runnerPriceOverrides ?? {},
        enabledLiftMechanismIds: parsed.enabledLiftMechanismIds ?? liftMechanismIds(),
        liftMechanismPriceOverrides: parsed.liftMechanismPriceOverrides ?? {},
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

    // ── Toggle which drawer-runner systems are offered ────────────────────────
    toggleRunner: (id: string) => {
      setSettingsState(prev => ({
        ...prev,
        enabledRunnerIds: toggleId(prev.enabledRunnerIds, id),
      }));
    },

    // ── Per-runner price overrides (one ₪ value per NL band) ──────────────────
    setRunnerBandPrice: (runnerId: string, bandIndex: number, price: number) => {
      setSettingsState(prev => {
        const spec = getRunner(runnerId);
        if (!spec) return prev;
        // Rebuild a full-length band array from the current effective prices so
        // it always stays aligned to the catalog's bands, then set this one.
        const current = prev.runnerPriceOverrides[runnerId];
        const bands = spec.priceByNlMm.map((b, i) => current?.[i] ?? b.priceShekel);
        bands[bandIndex] = price;
        return {
          ...prev,
          runnerPriceOverrides: { ...prev.runnerPriceOverrides, [runnerId]: bands },
        };
      });
    },
    resetRunnerPrices: (runnerId: string) => {
      setSettingsState(prev => {
        const { [runnerId]: _, ...rest } = prev.runnerPriceOverrides;
        return { ...prev, runnerPriceOverrides: rest };
      });
    },

    // ── Lift mechanisms (AVENTOS) — offered set + price override ───────────────
    toggleLiftMechanism: (id: string) => {
      setSettingsState(prev => ({
        ...prev,
        enabledLiftMechanismIds: toggleId(prev.enabledLiftMechanismIds, id),
      }));
    },
    setLiftMechanismPrice: (id: string, price: number) => {
      setSettingsState(prev => ({
        ...prev,
        liftMechanismPriceOverrides: { ...prev.liftMechanismPriceOverrides, [id]: price },
      }));
    },
    resetLiftMechanismPrice: (id: string) => {
      setSettingsState(prev => {
        const { [id]: _, ...rest } = prev.liftMechanismPriceOverrides;
        return { ...prev, liftMechanismPriceOverrides: rest };
      });
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
