import React from 'react';
import type { Box } from '../../types';
import type { Translations } from '../../i18n/translations';
import { useTranslation } from '../hooks/useTranslation';
import styles from './BoxesList.module.css';

interface BoxesListProps {
  boxes: Box[];
}

function buildLabel(box: Box, t: Translations): string {
  const { position, level, unitIndex } = box;

  if (level === 'plinth') {
    if (position === 'single') return t.boxes.plinth;
    if (position === 'left')   return `${t.boxes.plinth} — ${t.boxes.posLeft}`;
    if (position === 'right')  return `${t.boxes.plinth} — ${t.boxes.posRight}`;
    return `${t.boxes.plinth} — ${t.boxes.posUnit} ${unitIndex}`;
  }

  const posLabel =
    position === 'single' ? t.boxes.posSingle :
    position === 'left'   ? t.boxes.posLeft   :
    position === 'right'  ? t.boxes.posRight  :
    `${t.boxes.posUnit} ${unitIndex}`;

  const levelLabel =
    level === 'top'    ? t.boxes.levelTop    :
    level === 'bottom' ? t.boxes.levelBottom :
    '';

  return levelLabel ? `${posLabel} — ${levelLabel}` : posLabel;
}

export default function BoxesList({ boxes }: BoxesListProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <section className={styles.section}>
      <h3 className={styles.title}>{t.boxes.title}</h3>
      <ul className={styles.list}>
        {boxes.map((box, i) => (
          <li key={box.id} className={styles.item}>
            <span className={styles.index}>{i + 1}</span>
            <span className={styles.label}>{buildLabel(box, t)}</span>
            <span className={styles.dims}>
              {box.W} × {box.H} × {box.D}
              <span className={styles.unit}> {t.form.unitCm}</span>
            </span>
            {box.unitIndex !== undefined && (
              <span className={styles.note}>{box.unitIndex}/{box.unitTotal}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
