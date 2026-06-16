import React, { useRef, useState, useCallback, lazy, Suspense } from 'react';
import type { Room, ProductUnit, ProductPlacement } from '../../types/project';
import { useTranslation } from '../hooks/useTranslation';
import { productBounds, productSubBoxes } from '../../core/room/productBounds';
import {
  snapToWall, placementRectTopView, clampCentreToRoom, maxWallOffset,
  placementElevationRects, type RoomWall,
} from '../../core/room/roomGeometry';
import { BASE_REF_H_CM, WALL_BOTTOM_CM } from '../../core/product/kitchenFootprint';
import styles from './RoomView.module.css';

// 3D view pulls in three.js (~900 kB) — load it only when the tab is opened.
const RoomView3D = lazy(() => import('./RoomView3D').then(m => ({ default: m.RoomView3D })));

interface Props {
  room: Room;
  /** All products in the project (placed + unplaced). */
  products: ProductUnit[];
  onUpdateDims: (dims: { width?: number; depth?: number; height?: number }) => void;
  onRenameRoom?: (name: string) => void;
  onPlaceProduct: (placement: ProductPlacement) => void;
  onUpdatePlacement: (productId: string, patch: Partial<ProductPlacement>) => void;
  onRemovePlacement: (productId: string) => void;
  onOpenProduct: (productId: string) => void;
}

type ViewMode = 'top' | 'elevation' | '3d';

const WALLS: RoomWall[] = ['north', 'south', 'east', 'west'];
const PAD = 28;       // px margin around the drawing
const MAX_W = 720;    // px — max drawable width
const MAX_H = 520;    // px — max drawable height/depth

export function RoomView({
  room, products, onUpdateDims, onRenameRoom,
  onPlaceProduct, onUpdatePlacement, onRemovePlacement, onOpenProduct,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('top');
  const [viewWall, setViewWall] = useState<RoomWall>('north');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickProductId, setPickProductId] = useState<string>('');
  const dragRef = useRef<{ productId: string } | null>(null);

  // ── Room name editing ──────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  function startEditName() { setNameValue(room.name); setEditingName(true); }
  const commitName = useCallback(() => {
    const trimmed = nameValue.trim() || room.name;
    onRenameRoom?.(trimmed);
    setEditingName(false);
  }, [nameValue, room.name, onRenameRoom]);

  // ── Placement fit validation ───────────────────────────────────────────────
  function fitWarning(product: ProductUnit): string | null {
    const b = productBounds(product);
    const canFit0 = b.width <= room.width && b.depth <= room.depth;
    const canFit90 = b.width <= room.depth && b.depth <= room.width;
    if (!canFit0 && !canFit90) return t.room.productDoesNotFit(b.width, b.depth, room.width, room.depth);
    if (b.height > room.height) return t.room.productTooTall(b.height, room.height);
    return null;
  }

  function placedFitWarning(placement: ProductPlacement, product: ProductUnit): string | null {
    const b = productBounds(product);
    const turned = placement.rotationDeg === 90 || placement.rotationDeg === 270;
    const effW = turned ? b.depth : b.width;
    const effD = turned ? b.width : b.depth;
    if (effW > room.width || effD > room.depth) {
      return t.room.productDoesNotFit(b.width, b.depth, room.width, room.depth);
    }
    const y = placement.position.y ?? 0;
    if (y + b.height > room.height) return t.room.productTooTall(b.height, room.height);
    return null;
  }

  const productById = new Map(products.map(p => [p.id, p]));
  const placedIds = new Set(room.placements.map(p => p.productId));
  const unplaced = products.filter(p => !placedIds.has(p.id));

  // ── Top view (X-Z plane) ──────────────────────────────────────────────────
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
    const canFit0 = bounds.width <= room.width && bounds.depth <= room.depth;
    const wall: RoomWall = canFit0 ? 'north' : 'west';
    const snap = snapToWall(room, bounds, wall, 0);
    onPlaceProduct({ productId: product.id, ...snap });
    setSelectedId(product.id);
    setPickProductId('');
  }

  function reSnap(productId: string, wall: RoomWall, offset: number) {
    const product = productById.get(productId);
    const placement = room.placements.find(p => p.productId === productId);
    if (!product) return;
    const bounds = productBounds(product);
    // Clamp the offset so the product slides up to — but not past — the wall's
    // far corner (the wall analogue of the height-off-floor clamp).
    const clampedOffset = Math.min(Math.max(0, offset), maxWallOffset(room, wall, bounds));
    const snap = snapToWall(room, bounds, wall, clampedOffset);
    // Preserve height-off-floor (y) across wall/offset changes.
    const y = placement?.position.y;
    onUpdatePlacement(productId, {
      ...snap,
      position: y !== undefined ? { ...snap.position, y } : snap.position,
    });
  }

  // ── Top-view drag ─────────────────────────────────────────────────────────
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

  const selectedForPlace = pickProductId ? productById.get(pickProductId) ?? null : null;
  const placementWarning = selectedForPlace ? fitWarning(selectedForPlace) : null;

  const selected = selectedId ? room.placements.find(p => p.productId === selectedId) ?? null : null;
  const selectedProduct = selected ? productById.get(selected.productId) ?? null : null;

  // ── Elevation view (X-Y / Z-Y plane) ──────────────────────────────────────
  const isSideWall = viewWall === 'east' || viewWall === 'west';
  const elevSpan = isSideWall ? room.depth : room.width;
  const elevScale = Math.min(MAX_W / Math.max(elevSpan, 1), MAX_H / Math.max(room.height, 1));
  const elevSvgW = elevSpan * elevScale + PAD * 2;
  const elevSvgH = room.height * elevScale + PAD * 2;
  const pxH = (cm: number) => PAD + cm * elevScale;                 // along-wall cm → svg px
  const pxY = (cm: number) => PAD + (room.height - cm) * elevScale; // height cm → svg px (floor at bottom)

  // Per-product projected rects (one product → one or more sub-boxes).
  const elevItems = room.placements
    .map(pl => {
      const product = productById.get(pl.productId);
      if (!product) return null;
      const bounds = productBounds(product);
      const rects = placementElevationRects(pl, productSubBoxes(product), bounds, viewWall, room);
      return { pl, product, rects };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // All sub-box rects, farthest from the viewer first (so nearer draws on top).
  const elevRects = elevItems
    .flatMap(it => it.rects.map(r => ({ r, productId: it.pl.productId })))
    .sort((a, b) => b.r.depth - a.r.depth);

  const hasKitchen = elevItems.some(it => it.product.productType === 'kitchen');
  const refLines = hasKitchen ? [BASE_REF_H_CM, WALL_BOTTOM_CM].filter(y => y < room.height) : [];

  return (
    <div className={styles.container}>
      <div className={styles.body}>
        {/* ── Left: view switch + dimensions + placement controls ── */}
        <div className={styles.controls}>
          {/* Room name */}
          <div className={styles.roomNameRow}>
            {editingName ? (
              <input
                className={styles.roomNameInput}
                value={nameValue}
                autoFocus
                onChange={e => setNameValue(e.target.value)}
                onBlur={commitName}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitName();
                  if (e.key === 'Escape') setEditingName(false);
                }}
              />
            ) : (
              <span className={styles.roomNameDisplay} onClick={startEditName}>
                {room.name}<span className={styles.editHint}> ✎</span>
              </span>
            )}
          </div>

          <div className={styles.viewToggle}>
            <button type="button"
              className={`${styles.viewBtn} ${viewMode === 'top' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('top')}>{t.room.topView}</button>
            <button type="button"
              className={`${styles.viewBtn} ${viewMode === 'elevation' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('elevation')}>{t.room.elevation}</button>
            <button type="button"
              className={`${styles.viewBtn} ${viewMode === '3d' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('3d')}>{t.room.view3d}</button>
          </div>

          {viewMode === 'elevation' && (
            <div className={styles.wallTabs}>
              {WALLS.map(w => (
                <button key={w} type="button"
                  className={`${styles.wallTab} ${viewWall === w ? styles.wallTabActive : ''}`}
                  onClick={() => setViewWall(w)}>{t.room.walls[w]}</button>
              ))}
            </div>
          )}

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
            <button type="button" disabled={!pickProductId || !!placementWarning} onClick={handlePlace}>
              {t.room.placeProduct}
            </button>
          </div>
          {placementWarning && (
            <p className={styles.placeWarning}>{placementWarning}</p>
          )}

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
                    value={selected.anchorOffset ?? 0}
                    onChange={e => reSnap(selected.productId, selected.anchorWall!, Math.max(0, parseFloat(e.target.value) || 0))}
                    onFocus={ev => ev.target.select()}
                  />
                </label>
              )}
              <label className={styles.field}>
                <span>{t.room.heightOffFloor}</span>
                <input
                  type="number" min={0} value={selected.position.y ?? 0}
                  onChange={e => {
                    const ph = productBounds(selectedProduct).height;
                    const maxY = Math.max(0, room.height - ph);
                    const y = Math.min(maxY, Math.max(0, parseFloat(e.target.value) || 0));
                    onUpdatePlacement(selected.productId, { position: { ...selected.position, y } });
                  }}
                  onFocus={ev => ev.target.select()}
                />
              </label>
              <label className={styles.field}>
                <span>{t.room.rotation}</span>
                <select
                  value={selected.rotationDeg}
                  onChange={e => onUpdatePlacement(selected.productId, { rotationDeg: Number(e.target.value) })}
                >
                  {[0, 90, 180, 270].map(d => <option key={d} value={d}>{d}°</option>)}
                </select>
              </label>
              {(() => {
                const w = placedFitWarning(selected, selectedProduct);
                return w ? <p className={styles.placeWarning}>{w}</p> : null;
              })()}
              <div className={styles.selectedActions}>
                <button type="button" onClick={() => onOpenProduct(selected.productId)}>{t.room.openProduct}</button>
                <button type="button" className={styles.removeBtn} onClick={() => { onRemovePlacement(selected.productId); setSelectedId(null); }}>
                  {t.room.removeFromRoom}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: the drawing ── */}
        {viewMode === 'top' && (
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
        )}
        {viewMode === 'elevation' && (
          <svg className={styles.plan} width={elevSvgW} height={elevSvgH}>
            {/* Wall backdrop */}
            <rect x={pxH(0)} y={pxY(room.height)} width={elevSpan * elevScale} height={room.height * elevScale}
              className={styles.roomRect} onClick={() => setSelectedId(null)} />
            {/* Reference guides (countertop / wall-mount heights) */}
            {refLines.map(y => (
              <line key={y} x1={pxH(0)} x2={pxH(elevSpan)} y1={pxY(y)} y2={pxY(y)} className={styles.refLine} />
            ))}
            {/* Floor line */}
            <line x1={pxH(0)} x2={pxH(elevSpan)} y1={pxY(0)} y2={pxY(0)} className={styles.floorLine} />
            {/* Dimension labels */}
            <text x={pxH(elevSpan / 2)} y={elevSvgH - 6} className={styles.dimLabel}>{elevSpan}</text>
            <text x={PAD - 8} y={pxY(room.height / 2)} className={styles.dimLabel} transform={`rotate(-90 ${PAD - 8} ${pxY(room.height / 2)})`}>{room.height}</text>

            {/* Product sub-boxes (depth-sorted, nearest on top) */}
            {elevRects.map(({ r, productId }, i) => {
              const isSel = productId === selectedId;
              return (
                <rect key={i}
                  x={pxH(Math.min(r.h0, r.h1))} y={pxY(r.y1)}
                  width={Math.abs(r.h1 - r.h0) * elevScale} height={(r.y1 - r.y0) * elevScale}
                  className={`${styles.elevationRect} ${isSel ? styles.elevationSelected : ''}`}
                  onClick={() => setSelectedId(productId)}
                  onDoubleClick={() => onOpenProduct(productId)}
                />
              );
            })}

            {/* One label per product, at the centre of its silhouette */}
            {elevItems.map(it => {
              const hMin = Math.min(...it.rects.map(r => Math.min(r.h0, r.h1)));
              const hMax = Math.max(...it.rects.map(r => Math.max(r.h0, r.h1)));
              const yMin = Math.min(...it.rects.map(r => r.y0));
              const yMax = Math.max(...it.rects.map(r => r.y1));
              return (
                <text key={it.pl.productId} x={pxH((hMin + hMax) / 2)} y={pxY((yMin + yMax) / 2)}
                  className={styles.productLabel}>{it.product.name}</text>
              );
            })}
          </svg>
        )}
        {viewMode === '3d' && (
          <Suspense fallback={<div className={styles.canvas3d} />}>
            <RoomView3D
              room={room}
              products={products}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onOpenProduct={onOpenProduct}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
