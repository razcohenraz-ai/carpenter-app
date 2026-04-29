import React from 'react';
import type { Box } from '../../types';
import { useTranslation } from '../hooks/useTranslation';
import styles from './BoxesList.module.css';

interface BoxesListProps {
  boxes: Box[];
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
            <span className={styles.label}>{box.label}</span>
            <span className={styles.dims}>
              {box.W} × {box.H} × {box.D}
              <span className={styles.unit}> {t.form.unitCm}</span>
            </span>
            {box.note !== undefined && (
              <span className={styles.note}>{box.note}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
