import { useState } from 'react';
import type { ProductType } from '../../types/project';
import { useTranslation } from '../hooks/useTranslation';
import styles from './AddProductDialog.module.css';

interface Props {
  onAdd: (type: ProductType, name: string) => void;
  onClose: () => void;
}

const PRODUCT_TYPES: ProductType[] = ['wardrobe', 'bookcase', 'sideboard', 'kitchen', 'free-build'];

export function AddProductDialog({ onAdd, onClose }: Props) {
  const { t } = useTranslation();
  const [selectedType, setSelectedType] = useState<ProductType>('wardrobe');
  const [name, setName] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalName = name.trim() || t.project.productTypes[selectedType] || selectedType;
    onAdd(selectedType, finalName);
    onClose();
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>{t.project.addProduct}</h2>

        <div className={styles.typeGrid}>
          {PRODUCT_TYPES.map(type => (
            <button
              key={type}
              type="button"
              className={`${styles.typeBtn} ${selectedType === type ? styles.typeBtnActive : ''}`}
              onClick={() => setSelectedType(type)}
            >
              {t.project.productTypes[type] ?? type}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            className={styles.nameInput}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t.project.productTypes[selectedType] ?? selectedType}
            autoFocus
          />
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              {t.interior.cancel}
            </button>
            <button type="submit" className={styles.confirmBtn}>
              {t.project.addProduct}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
