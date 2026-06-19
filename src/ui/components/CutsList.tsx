import React from 'react';
import type { CutItem } from '../../types/cuts';
import type { MaterialId } from '../../types/materials';
import { MATERIALS, getMaterialWithCustom } from '../../catalog';
import { mergeCutItems } from '../../core/cuts/mergeCutItems';
import { sheetsNeeded as sheetsForGroup } from '../../core/cuts/sheetCalculator';
import { useTranslation } from '../hooks/useTranslation';
import styles from './CutsList.module.css';

interface CutsListProps {
  cuts: CutItem[];
  settings?: {
    bodyMaterialPriceOverrides?: Partial<Record<MaterialId, number>> | undefined;
    bodyCustomMaterials?: import('../../types/materials').CustomMaterial[] | undefined;
    frontMaterialPriceOverrides?: Partial<Record<MaterialId, number>> | undefined;
    frontCustomMaterials?: import('../../types/materials').CustomMaterial[] | undefined;
  };
}

/** Display-only formatter: always 2 decimals, round-half-up for positive
 *  values (`Math.round` rounds toward +∞ on `.5`, which is the carpenter
 *  intuition — `29.925 → "29.93"`, NOT banker's `"29.92"`). The intermediate
 *  `× 100 / 100` collapses float noise from the `mm → cm` conversion
 *  (`c.w / 10`) before `toFixed` locks in the trailing zero. */
function format2(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2);
}

/** Display-only: convert an area from cm² to m² with 2 decimals (the
 *  carpenter-facing sheet-area unit). 10 000 cm² = 1 m². Same round-half-up
 *  behaviour as {@link format2}. */
function formatM2(areaCm2: number): string {
  return (Math.round(areaCm2 / 100) / 100).toFixed(2);
}

interface MaterialGroup {
  /** materialId (catalog or custom) or null when the cut is not bound to any material
   *  (drawer-box parts at fixed 12mm/6mm). */
  materialId: MaterialId | string | null;
  cuts: CutItem[];
}

function groupByMaterial(cuts: CutItem[]): MaterialGroup[] {
  const buckets = new Map<string, MaterialGroup>();
  for (const c of cuts) {
    const key = c.materialId ?? '__none__';
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { materialId: c.materialId ?? null, cuts: [] };
      buckets.set(key, bucket);
    }
    bucket.cuts.push(c);
  }
  // Catalog materials first (in MATERIALS insertion order), then custom
  // materials (any remaining non-catalog, non-none keys), "other" last.
  const ordered: MaterialGroup[] = [];
  const catalogIds = new Set(Object.keys(MATERIALS));
  for (const id of Object.keys(MATERIALS) as MaterialId[]) {
    const g = buckets.get(id);
    if (g) ordered.push(g);
  }
  // Add custom material groups (ids not in catalog and not '__none__')
  for (const [key, g] of buckets.entries()) {
    if (!catalogIds.has(key) && key !== '__none__') {
      ordered.push(g);
    }
  }
  const none = buckets.get('__none__');
  if (none) ordered.push(none);
  return ordered;
}

export default function CutsList({ cuts, settings }: CutsListProps): React.JSX.Element {
  const { t } = useTranslation();
  // Collapse identical pieces (same material + dims + name) into a single row
  // with summed qty BEFORE grouping by material. The merge logic lives in
  // core so other consumers (sheet calculator, export) see the same compact
  // list. Pair labels (top+bottom, sides, envelope sides) come from the
  // translations so the combined row reads correctly in HE / EN.
  const groups = groupByMaterial(mergeCutItems(cuts, {
    topBottom: t.cutsList.pairTopBottom,
    sides: t.cutsList.pairSides,
    envelopeSides: t.cutsList.pairEnvelopeSides,
    plinthGables: t.cutsList.pairPlinthGables,
    sinkTraverses: t.cutsList.pairSinkTraverses,
  }));

  function handleExportPdf(): void {
    window.print();
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.title}>{t.cutsList.tab}</h3>
        <button
          type="button"
          className={styles.exportBtn}
          onClick={handleExportPdf}
        >
          {t.cutsList.exportPdf}
        </button>
      </div>

      <div className={styles.printable}>
        {groups.map(group => {
          let name: string;
          if (group.materialId !== null) {
            const allCustomMaterials = [
              ...(settings?.bodyCustomMaterials ?? []),
              ...(settings?.frontCustomMaterials ?? []),
            ];
            const mat = getMaterialWithCustom(group.materialId, allCustomMaterials);
            name = mat.name;
          } else {
            name = t.cutsList.noMaterial;
          }
          let totalPieces = 0;
          let totalAreaCm2 = 0;
          for (const c of group.cuts) {
            const lengthCm = c.w / 10;
            const widthCm = c.h / 10;
            totalPieces += c.qty;
            totalAreaCm2 += lengthCm * widthCm * c.qty;
          }
          return (
            <div key={(group.materialId ?? '__none__')} className={styles.group}>
              <h4 className={styles.groupTitle}>
                <span className={styles.groupLabel}>{t.cutsList.materialGroup}:</span> {name}
              </h4>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.colDesc}>{t.cutsList.description}</th>
                    <th className={styles.colDims}>{t.cutsList.dimensions}</th>
                    <th className={styles.colQty}>{t.cutsList.quantity}</th>
                    <th className={styles.colArea}>{t.cutsList.area}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.cuts.map((c, i) => {
                    const lengthCm = c.w / 10;
                    const widthCm = c.h / 10;
                    const areaCm2 = lengthCm * widthCm * c.qty;
                    return (
                      <tr key={i}>
                        <td className={styles.colDesc}>
                          {c.name}
                          {c.note && <span className={styles.note}> ({c.note})</span>}
                        </td>
                        <td className={styles.colDims}>
                          <span className={styles.dimW}>{format2(lengthCm)}</span>
                          {' × '}
                          <span className={styles.dimH}>{format2(widthCm)}</span>
                        </td>
                        <td className={styles.colQty}>{c.qty}</td>
                        <td className={styles.colArea}>{formatM2(areaCm2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className={styles.footerLabel} colSpan={2}>
                      {t.cutsList.totalPieces}: {totalPieces}
                    </td>
                    <td className={styles.colQty}>{totalPieces}</td>
                    <td className={styles.colArea}>
                      {formatM2(totalAreaCm2)}
                    </td>
                  </tr>
                  <tr>
                    <td className={styles.footerLabel} colSpan={3}>
                      {t.cutsList.totalArea}
                    </td>
                    <td className={styles.colArea}>
                      {formatM2(totalAreaCm2)}
                    </td>
                  </tr>
                  {(() => {
                    if (!group.materialId) return null;

                    // Get material with custom overrides
                    const allCustomMaterials = [
                      ...(settings?.bodyCustomMaterials ?? []),
                      ...(settings?.frontCustomMaterials ?? []),
                    ];
                    const mat = getMaterialWithCustom(group.materialId, allCustomMaterials);

                    // For custom materials, use their pricePerSheet directly (already updated in settings)
                    // For catalog materials, apply price overrides if they exist
                    let effectivePrice = mat.pricePerSheet;
                    if (!mat.isCustom && group.materialId) {
                      const allPriceOverrides = {
                        ...(settings?.bodyMaterialPriceOverrides ?? {}),
                        ...(settings?.frontMaterialPriceOverrides ?? {}),
                      };
                      effectivePrice = allPriceOverrides[group.materialId as MaterialId] ?? mat.pricePerSheet;
                    }

                    // Sheets + cost via the shared core calculator: it excludes
                    // the thin back panel (different stock — shares the body
                    // materialId but is 4mm, not the 18mm sheet) and adds the
                    // 10% waste margin (APP_DEFAULTS.wasteFactor). Single source
                    // of truth — see core/cuts/sheetCalculator.ts.
                    const sheetsNeeded = sheetsForGroup(group.cuts, mat);
                    const woodCost = sheetsNeeded * effectivePrice;
                    return (
                      <>
                        <tr>
                          <td className={styles.footerLabel} colSpan={3}>
                            {t.cutsList.sheetsNeeded}
                          </td>
                          <td className={styles.colArea}>
                            {sheetsNeeded}
                          </td>
                        </tr>
                        <tr>
                          <td className={styles.footerLabel} colSpan={3}>
                            {t.cutsList.woodCost}
                          </td>
                          <td className={styles.colArea}>
                            ₪{woodCost.toLocaleString()}
                          </td>
                        </tr>
                      </>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}
