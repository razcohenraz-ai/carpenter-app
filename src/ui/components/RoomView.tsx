import React, { useRef, useState } from 'react';
import type { Room, ProductUnit, ProductPlacement } from '../../types/project';
import { useTranslation } from '../hooks/useTranslation';
import { productBounds } from '../../core/room/productBounds';
import {
  snapToWall, placementRectTopView, clampCentreToRoom, type RoomWall,
} from '../../core/room/roomGeometry';
import styles from './RoomView.module.css';

interface Props {
  room: Room;
  /** All products in the project (placed + unplaced). */
  products: ProductUnit[];
  onUpdateDims: (dims: { width?: number; depth?: number; height?: number }) => void;
  onPlaceProduct: (placement: ProductPlacement) => void;
  onUpdatePlacement: (productId: string, patch: Partial<ProductPlacement>) => void;
  onRemovePlacement: (productId: string) => void;
  onOpenProduct: (productId: string) => void;
}

const WALLS: RoomWall[] = ['north', 'south', 'east', 'west'];
const PAD = 28;       // px margin around the room rectangle
const MAX_W = 720;    // px — max drawable width
const MAX_H = 520;    // px — max drawable depth

export function RoomView({
  room, products, onUpdateDims,
  onPlaceProduct, onUpdatePlacement, onRemovePlacement, onOpenProduct,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickProductId, setPickProductId] = useState<string>('');
  const dragRef = useRef<{ productId: string } | null>(null);

  const productById = new Map(products.map(p => [p.id, p]));
  const placedIds = new Set(room.placements.map(p => p.productId));
  const unplaced = products.filter(p => !placedIds.has(p.id));

  const scale = Math.min(MAX_W / Math.max(room.width, 1), MAX_H / Math.max(room.depth, 1));
  const svgW = room.width * scale + PAD * 2;
  const svgH = room.depth * scale + PAD * 2;
  const px = (cm: number) => PAD + cm * scale;   // cm (X or Z) → svg px

  /** Pointer position → room cm (the svg is drawn 1:1 in px). */
  function pointerToCm(e: React.PointerEvent): { x: number; z: number } {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - PAD) / scale,
      z: (e.clientY - rect.top - PAD) / scale,
    };
  }

  function handlePlace() {
    const product = productById.get(pickProductId);
    if (!product) return;
    const bounds = productBounds(product);
    const snap = snapToWall(room, bounds, 'north', 0);
    onPlaceProduct({ productId: product.id, ...snap });
    setSelectedId(product.id);
    setPickProductId('');
  }

  function reSnap(productId: string, wall: RoomWall, offset: number) {
    const product = productById.get(productId);
    if (!product) return;
    const snap = snapToWall(room, productBounds(product), wall, offset);
    onUpdatePlacement(productId, snap);
  }

  // ── Drag ────────────────────────────────────────────────────────────────────
  function onRectPointerDown(e: React.PointerEvent, productId: string) {
    e.preventDefault();
    setSelectedId(productId);
    dragRef.current = { productId };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onSvgPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const product = productById.get(drag.productId);
    const placement = room.placements.find(p => p.productId === drag.productId);
    if (!product || !placement) return;
    const cm = pointerToCm(e);
    const clamped = clampCentreToRoom(room, productBounds(product), placement.rotationDeg, cm);
    onUpdatePlacement(drag.productId, { position: { ...placement.position, ...clamped } });
  }
  function onSvgPointerUp() { dragRef.current = null; }

  const selected = selectedId ? room.placements.find(p => p.productId === selectedId) ?? null : null;
  const selectedProduct = selected ? productById.get(selected.productId) ?? null : null;

  return (
    <div className={styles.container}>
      <div className={styles.body}>
        {/* ── Left: dimensions + placement controls ── */}
        <div className={styles.controls}>
          <div className={styles.dimsRow}>
            {(['width', 'depth', 'height'] as const).map(key => (
              <label key={key} className={styles.dimField}>
                <span>{t.room[key]}</span>
                <input
                  type="number" min={1} value={room[key]}
                  onChange={e => onUpdateDims({ [key]: Math.max(1, parseFloat(e.target.value) || 1) })}
                  onFocus={e => e.target.select()}
                />
              </label>
            ))}
          </div>

          <div className={styles.placeRow}>
            <select value={pickProductId} onChange={e => setPickProductId(e.target.value)}>
              <option value="">{unplaced.length ? t.room.selectProduct : t.room.allPlaced}</option>
              {unplaced.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({t.project.productTypes[p.productType] ?? p.productType})
                </option>
              ))}
            </select>
            <button type="button" disabled={!pickProductId} onClick={handlePlace}>
              {t.room.placeProduct}
            </button>
          </div>

          {selected && selectedProduct && (
            <div className={styles.selectedPanel}>
              <div className={styles.selectedName}>{selectedProduct.name}</div>
              <label className={styles.field}>
                <span>{t.room.wall}</span>
                <select
                  value={selected.anchorWall ?? ''}
                  onChange={e => reSnap(selected.productId, e.target.value as RoomWall, 0)}
                >
                  <option value="">—</option>
                  {WALLS.map(w => <option key={w} value={w}>{t.room.walls[w]}</option>)}
                </select>
              </label>
              {selected.anchorWall && (
                <label className={styles.field}>
                  <span>{t.room.offsetFromCorner}</span>
                  <input
                    type="number" min={0}
                    onChange={e => reSnap(selected.productId, selected.anchorWall!, Math.max(0, parseFloat(e.target.value) || 0))}
                    onFocus={ev => ev.target.select()}
                  />
                </label>
              )}
              <label className={styles.field}>
                <span>{t.room.rotation}</span>
                <select
                  value={selected.rotationDeg}
                  onChange={e => onUpdatePlacement(selected.productId, { rotationDeg: Number(e.target.value) })}
                >
                  {[0, 90, 180, 270].map(d => <option key={d} value={d}>{d}°</option>)}
                </select>
              </label>
              <div className={styles.selectedActions}>
                <button type="button" onClick={() => onOpenProduct(selected.productId)}>{t.room.openProduct}</button>
                <button type="button" className={styles.removeBtn} onClick={() => { onRemovePlacement(selected.productId); setSelectedId(null); }}>
                  {t.room.removeFromRoom}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: top-view floor plan ── */}
        <svg
          ref={svgRef}
          className={styles.plan}
          width={svgW} height={svgH}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerLeave={onSvgPointerUp}
        >
          {/* Room rectangle */}
          <rect x={px(0)} y={px(0)} width={room.width * scale} height={room.depth * scale}
            className={styles.roomRect} onClick={() => setSelectedId(null)} />
          {/* Dimension labels */}
          <text x={px(room.width / 2)} y={PAD - 8} className={styles.dimLabel}>{room.width}</text>
          <text x={PAD - 8} y={px(room.depth / 2)} className={styles.dimLabel} transform={`rotate(-90 ${PAD - 8} ${px(room.depth / 2)})`}>{room.depth}</text>

          {/* Placed products */}
          {room.placements.map(pl => {
            const product = productById.get(pl.productId);
            if (!product) return null;
            const rect = placementRectTopView(pl, productBounds(product));
            const cx = px(rect.cx), cz = px(rect.cz);
            const isSel = pl.productId === selectedId;
            return (
              <g key={pl.productId} transform={`rotate(${rect.rotationDeg} ${cx} ${cz})`}>
                <rect
                  x={px(rect.cx - rect.w / 2)} y={px(rect.cz - rect.d / 2)}
                  width={rect.w * scale} height={rect.d * scale}
                  className={`${styles.productRect} ${isSel ? styles.productSelected : ''}`}
                  onPointerDown={e => onRectPointerDown(e, pl.productId)}
                  onDoubleClick={() => onOpenProduct(pl.productId)}
                />
                <text x={cx} y={cz} className={styles.productLabel}
                  transform={`rotate(${-rect.rotationDeg} ${cx} ${cz})`}>{product.name}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
