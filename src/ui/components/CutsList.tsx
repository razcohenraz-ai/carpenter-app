import React from 'react';
import type { CutItem } from '../../types/cuts';
import type { MaterialId } from '../../types/materials';
import { MATERIALS } from '../../catalog';
import { mergeCutItems } from '../../core/cuts/mergeCutItems';
import { useTranslation } from '../hooks/useTranslation';
import styles from './CutsList.module.css';

interface CutsListProps {
  cuts: CutItem[];
}

interface MaterialGroup {
  /** materialId, or null when the cut is not bound to a catalog material
   *  (drawer-box parts at fixed 12mm/6mm). */
  materialId: MaterialId | null;
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
  // Catalog materials first (in MATERIALS insertion order), "other" last.
  const ordered: MaterialGroup[] = [];
  for (const id of Object.keys(MATERIALS) as MaterialId[]) {
    const g = buckets.get(id);
    if (g) ordered.push(g);
  }
  const none = buckets.get('__none__');
  if (none) ordered.push(none);
  return ordered;
}

export default function CutsList({ cuts }: CutsListProps): React.JSX.Element {
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
          const name = group.materialId !== null
            ? (MATERIALS[group.materialId]?.name ?? group.materialId)
            : t.cutsList.noMaterial;
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
                          <span className={styles.dimW}>{lengthCm.toFixed(1)}</span>
                          {' × '}
                          <span className={styles.dimH}>{widthCm.toFixed(1)}</span>
                        </td>
                        <td className={styles.colQty}>{c.qty}</td>
                        <td className={styles.colArea}>{Math.round(areaCm2).toLocaleString()}</td>
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
                      {Math.round(totalAreaCm2).toLocaleString()}
                    </td>
                  </tr>
                  <tr>
                    <td className={styles.footerLabel} colSpan={3}>
                      {t.cutsList.totalArea}
                    </td>
                    <td className={styles.colArea}>
                      {Math.round(totalAreaCm2).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}
