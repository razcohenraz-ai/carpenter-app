import type { HardwareLineItem } from '../../types/hardware';
import { useTranslation } from '../hooks/useTranslation';
import styles from './HardwareList.module.css';

interface HardwareListProps {
  items: HardwareLineItem[];
}

export function HardwareList({ items }: HardwareListProps) {
  const { t } = useTranslation();
  const tl = t.hardwareList;

  const grandTotal = items.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className={styles.container}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.colItem}>{tl.item}</th>
            <th className={styles.colQty}>{tl.qty}</th>
            <th className={styles.colUnit}>{tl.unit}</th>
            <th className={styles.colPrice}>{tl.unitPrice} (₪)</th>
            <th className={styles.colTotal}>{tl.total} (₪)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={`${item.specId}-${i}`}>
              <td className={styles.colItem}>{item.name}</td>
              <td className={styles.colQty}>{item.qty}</td>
              <td className={styles.colUnit}>{item.unit}</td>
              <td className={styles.colPrice}>{item.unitPrice.toFixed(2)}</td>
              <td className={styles.colTotal}>{item.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className={styles.footerLabel}>{tl.grandTotal}</td>
            <td className={styles.colTotal}>{grandTotal.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
