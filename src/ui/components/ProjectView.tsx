import { useState, useRef } from 'react';
import type { Project, ProductUnit } from '../../types';
import type { ProductType } from '../../types/project';
import { useTranslation } from '../hooks/useTranslation';
import { AddProductDialog } from './AddProductDialog';
import styles from './ProjectView.module.css';

interface Props {
  project: Project;
  onOpenProduct: (id: string) => void;
  onAddProduct: (type: ProductType, name: string) => void;
  onRemoveProduct: (id: string) => void;
  onRenameProject: (name: string) => void;
  onNewProject: (name: string) => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
}

export function ProjectView({
  project, onOpenProduct, onAddProduct, onRemoveProduct,
  onRenameProject, onNewProject, onExport, onImport,
}: Props) {
  const { t } = useTranslation();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(project.projectName);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function commitName() {
    const trimmed = nameValue.trim() || t.project.unnamed;
    setNameValue(trimmed);
    onRenameProject(trimmed);
    setEditingName(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImportError(null);
      await onImport(file);
    } catch {
      setImportError(t.project.importError);
    }
    // reset input so same file can be re-imported
    e.target.value = '';
  }

  function handleNewProject() {
    const name = prompt(t.project.newProjectPlaceholder, t.project.newProject);
    if (name !== null) onNewProject(name.trim() || t.project.newProject);
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          {editingName ? (
            <input
              className={styles.titleInput}
              value={nameValue}
              autoFocus
              onChange={e => setNameValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
            />
          ) : (
            <h1 className={styles.title} onClick={() => { setNameValue(project.projectName); setEditingName(true); }}>
              {project.projectName}
              <span className={styles.editHint}>✎</span>
            </h1>
          )}
        </div>

        <div className={styles.headerActions}>
          <button type="button" className={styles.actionBtn} onClick={handleNewProject}>
            {t.project.newProject}
          </button>
          <button type="button" className={styles.actionBtn} onClick={onExport}>
            {t.project.export}
          </button>
          <button type="button" className={styles.actionBtn} onClick={() => fileInputRef.current?.click()}>
            {t.project.import}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      </div>

      {importError && (
        <div className={styles.errorBanner}>
          {importError}
          <button type="button" onClick={() => setImportError(null)}>✕</button>
        </div>
      )}

      {/* Products grid */}
      {project.products.length === 0 ? (
        <p className={styles.empty}>{t.project.noProducts}</p>
      ) : (
        <div className={styles.grid}>
          {project.products.map(pu => (
            <ProductCard
              key={pu.id}
              product={pu}
              onOpen={() => onOpenProduct(pu.id)}
              onDelete={() => {
                if (window.confirm(t.project.deleteConfirm)) onRemoveProduct(pu.id);
              }}
              typeName={t.project.productTypes[pu.productType] ?? pu.productType}
            />
          ))}
        </div>
      )}

      {/* Add product button */}
      <button
        type="button"
        className={styles.addBtn}
        onClick={() => setShowAddDialog(true)}
      >
        {t.project.addProduct}
      </button>

      {showAddDialog && (
        <AddProductDialog
          onAdd={onAddProduct}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}

function ProductCard({ product, onOpen, onDelete, typeName }: {
  product: ProductUnit;
  onOpen: () => void;
  onDelete: () => void;
  typeName: string;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardType}>{typeName}</div>
      <div className={styles.cardName}>{product.name}</div>
      <div className={styles.cardDims}>
        {product.cabinet.input.W} × {product.cabinet.input.H} × {product.cabinet.input.D} ס"מ
      </div>
      <div className={styles.cardActions}>
        <button type="button" className={styles.openBtn} onClick={onOpen}>
          עריכה →
        </button>
        <button type="button" className={styles.deleteBtn} onClick={onDelete}>
          ✕
        </button>
      </div>
    </div>
  );
}
