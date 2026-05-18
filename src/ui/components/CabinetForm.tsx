import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useCabinet } from '../hooks/useCabinet';
import { MATERIALS, getMaterial } from '../../catalog';
import type { MaterialId } from '../../types';
import type { Box } from '../../types/geometry';
import { makeDoorId } from '../../core/doors/doorUtils';
import BoxesList from './BoxesList';
import CabinetSketch from './CabinetSketch';
import CabinetFrontsSketch from './CabinetFrontsSketch';
import BoxThumbnail from './BoxThumbnail';
import BoxInteriorEditor from './BoxInteriorEditor';
import DoorThumbnail from './DoorThumbnail';
import DoorEditor from './DoorEditor';
import DoorsList from './DoorsList';
import ExternalDrawerEditor from './ExternalDrawerEditor';
import styles from './CabinetForm.module.css';

type DoorsPerColumn = 'auto' | '1' | '2' | '3';

const MAX_THUMB_W    = 120;
const MAX_THUMB_H    = 160;
const MIN_THUMB_PX   = 30;
const DEFAULT_THUMB_W = 70;
const DEFAULT_THUMB_H = 110;

function computeThumbSizes(boxes: Box[]): Map<string, { w: number; h: number }> {
  if (boxes.length === 0) return new Map();
  const maxW  = Math.max(...boxes.map(b => b.W));
  const maxH  = Math.max(...boxes.map(b => b.H));
  const scale = Math.min(MAX_THUMB_W / maxW, MAX_THUMB_H / maxH);
  return new Map(boxes.map(b => [b.id, {
    w: Math.max(b.W * scale, MIN_THUMB_PX),
    h: Math.max(b.H * scale, MIN_THUMB_PX),
  }]));
}

interface FormState {
  W: string;
  H: string;
  D: string;
  plinth: string;
  lowerDoorH: string;
  middleDoorH: string;
  hasShell: boolean;
  hasEnvelopeTop: boolean;
  doorCoversPlinth: boolean;
  bodyMaterialId: MaterialId;
  frontMaterialId: MaterialId;
  doorsPerColumn: DoorsPerColumn;
  doorGap: string;
  doorGapManuallySet: boolean;
  maxDoorWidth: string;
}

interface FormErrors {
  W: string;
  H: string;
  D: string;
  plinth: string;
  lowerDoorH: string;
  middleDoorH: string;
}

const NO_ERRORS: FormErrors = { W: '', H: '', D: '', plinth: '', lowerDoorH: '', middleDoorH: '' };
const materialsArray = Object.values(MATERIALS);

function showLowerDoor(doorsPerColumn: DoorsPerColumn, rawH: string): boolean {
  if (doorsPerColumn === '2' || doorsPerColumn === '3') return true;
  if (doorsPerColumn === 'auto') {
    const h = parseFloat(rawH);
    return !isNaN(h) && h > 180;
  }
  return false;
}

export default function CabinetForm(): React.JSX.Element {
  const { t } = useTranslation();
  const {
    result, calculate,
    interiorById, setBoxInterior,
    cellInteriorById, addPartition, removePartition, setCellItems,
    doorsById, drawerFrontsById, displayNumbers, numFrontsPerBox,
    partitionsById,
    setDoorHingeSide, setDoorHingeCount, setHingeManual, resetHingeToAuto, setDoorHasDoor,
    setDoorThickness, setCoversSkirt,
    setDrawerHeight, setDrawerFrontThickness, deleteDrawer,
  } = useCabinet();

  const [view, setView]               = useState<'main' | 'editor' | 'doorEditor'>('main');
  const [editingBox, setEditingBox]   = useState<Box | null>(null);
  const [editingDoorId, setEditingDoorId] = useState<string | null>(null);
  const [editingDrawerId, setEditingDrawerId] = useState<string | null>(null);
  const [sketchMode, setSketchMode]   = useState<'bodies' | 'fronts'>('bodies');

  function openEditor(box: Box): void {
    setEditingBox(box);
    setView('editor');
  }

  function openDoorEditor(boxId: string): void {
    setEditingDoorId(boxId);
    setView('doorEditor');
  }

  // Lookup of all DrawerItems by id (across body interiors and partitioned
  // cells), so the modal can read drawerHeight/frontThicknessOverride from
  // the source-of-truth and the doors list can compute per-front thickness.
  const drawerById = React.useMemo(() => {
    const out: Record<string, import('../../types/interior').DrawerItem> = {};
    for (const items of Object.values(interiorById)) {
      for (const item of items) {
        if (item.type === 'drawer') out[item.id] = item;
      }
    }
    for (const cells of Object.values(cellInteriorById)) {
      for (const cellItems of cells) {
        for (const item of cellItems) {
          if (item.type === 'drawer') out[item.id] = item;
        }
      }
    }
    return out;
  }, [interiorById, cellInteriorById]);

  const [form, setForm] = useState<FormState>({
    W: '240', H: '220', D: '60',
    plinth: '10', lowerDoorH: '110', middleDoorH: '80',
    hasShell: true, hasEnvelopeTop: false, doorCoversPlinth: false,
    bodyMaterialId: 'mdf18', frontMaterialId: 'mdf18', doorsPerColumn: 'auto',
    doorGap: '2', doorGapManuallySet: false,
    maxDoorWidth: '60',
  });

  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  // ── handlers ──────────────────────────────────────────────────────────────

  function setStr(field: keyof FormErrors, value: string): void {
    if (field === 'W') setForm(p => ({ ...p, W: value }));
    else if (field === 'H') setForm(p => ({ ...p, H: value }));
    else if (field === 'D') setForm(p => ({ ...p, D: value }));
    else if (field === 'plinth') {
      const p = parseFloat(value);
      setForm(prev => {
        const base = { ...prev, plinth: value };
        if ((isNaN(p) || p <= 0) && prev.doorCoversPlinth) {
          return { ...base, doorCoversPlinth: false };
        }
        return base;
      });
      if (isNaN(p) || p <= 0) setCoversSkirt(false);
    }
    else if (field === 'lowerDoorH') setForm(p => ({ ...p, lowerDoorH: value }));
    else setForm(p => ({ ...p, middleDoorH: value }));

    if (errors[field]) {
      if (field === 'W') setErrors(p => ({ ...p, W: '' }));
      else if (field === 'H') setErrors(p => ({ ...p, H: '' }));
      else if (field === 'D') setErrors(p => ({ ...p, D: '' }));
      else if (field === 'plinth') setErrors(p => ({ ...p, plinth: '' }));
      else if (field === 'lowerDoorH') setErrors(p => ({ ...p, lowerDoorH: '' }));
      else setErrors(p => ({ ...p, middleDoorH: '' }));
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();

    const W      = parseFloat(form.W);
    const H      = parseFloat(form.H);
    const D      = parseFloat(form.D);
    const plinth = parseFloat(form.plinth);
    const loDoor = parseFloat(form.lowerDoorH);
    const midDoor = parseFloat(form.middleDoorH);
    const needsLo  = showLowerDoor(form.doorsPerColumn, form.H);
    const needsMid = form.doorsPerColumn === '3';

    const loDoorErr = needsLo
      ? (isNaN(loDoor) || loDoor <= 0 ? t.form.errorInvalid
         : (!isNaN(H) && loDoor >= H ? t.form.errorMustBeLessThanH : ''))
      : '';

    const midDoorErr = needsMid
      ? (isNaN(midDoor) || midDoor <= 0 ? t.form.errorInvalid
         : (!isNaN(H) && !isNaN(loDoor) && loDoor + midDoor >= H
            ? t.form.errorSumTooLarge : ''))
      : '';

    const newErrors: FormErrors = {
      W:        isNaN(W)      || W      <= 0 ? t.form.errorInvalid : '',
      H:        isNaN(H)      || H      <= 0 ? t.form.errorInvalid : '',
      D:        isNaN(D)      || D      <= 0 ? t.form.errorInvalid : '',
      plinth:   isNaN(plinth) || plinth  < 0 ? t.form.errorInvalid : '',
      lowerDoorH: loDoorErr,
      middleDoorH: midDoorErr,
    };

    setErrors(newErrors);
    if (Object.values(newErrors).some(v => v !== '')) return;

    const doorsPerColumn: 'auto' | 1 | 2 | 3 =
      form.doorsPerColumn === '1' ? 1 :
      form.doorsPerColumn === '2' ? 2 :
      form.doorsPerColumn === '3' ? 3 : 'auto';

    calculate({
      W, H, D,
      hasShell: form.hasShell,
      hasEnvelopeTop: form.hasEnvelopeTop && form.hasShell,
      bodyMaterialId: form.bodyMaterialId,
      frontMaterialId: form.frontMaterialId,
      plinth,
      doorCoversPlinth: form.doorCoversPlinth,
      lowerDoorH: needsLo ? loDoor : undefined,
      middleDoorH: needsMid ? midDoor : undefined,
      doorsPerColumn,
      doorGapMm: parseFloat(form.doorGap) || 0,
      maxDoorWidth: Math.max(parseFloat(form.maxDoorWidth) || 60, 10),
    });
  }

  // ── derived values ─────────────────────────────────────────────────────────

  const needsLower  = showLowerDoor(form.doorsPerColumn, form.H);
  const needsMiddle = form.doorsPerColumn === '3';
  const lowerLabel  = form.doorsPerColumn === '3'
    ? t.form.lowerDoorHeightMulti
    : t.form.lowerDoorHeight;
  const totalPieces = result?.cuts.reduce((sum, c) => sum + c.qty, 0) ?? 0;

  const frontThicknessCm = (MATERIALS[form.frontMaterialId]?.thickness ?? 18) / 10;
  const parsedW = parseFloat(form.W);
  const innerBodyW = form.hasShell && !isNaN(parsedW) ? parsedW - 2 * frontThicknessCm : parsedW;
  const shellWidthWarning = form.hasShell && !isNaN(parsedW) && innerBodyW < 30
    ? t.form.shellWidthWarning(innerBodyW)
    : null;

  const parsedH     = parseFloat(form.H);
  const parsedPlinth = parseFloat(form.plinth) || 0;
  const parsedLo    = parseFloat(form.lowerDoorH) || 0;
  const parsedMid   = parseFloat(form.middleDoorH) || 0;
  const topBoxH = needsMiddle
    ? parsedH - parsedLo - parsedMid
    : needsLower
      ? parsedH - parsedLo
      : parsedH - parsedPlinth;
  const innerTopH = form.hasEnvelopeTop && form.hasShell ? topBoxH - frontThicknessCm : topBoxH;
  const envelopeTopWarning = form.hasEnvelopeTop && form.hasShell && !isNaN(innerTopH) && innerTopH < 20
    ? t.form.envelopeTopWarn(innerTopH)
    : null;

  // ── helpers ────────────────────────────────────────────────────────────────

  function numInput(
    id: string,
    field: keyof FormErrors,
    label: string,
    min = 0.1,
    axis?: 'width' | 'height' | 'depth',
  ): React.JSX.Element {
    const err = errors[field];
    const axisKey = axis ? axis.charAt(0).toUpperCase() + axis.slice(1) : '';
    const labelClass = axis
      ? `${styles.fieldLabel} ${styles[`label${axisKey}`]}`
      : styles.fieldLabel;
    const borderClass = !err && axis ? styles[`border${axisKey}`] : '';
    const inputClass = [styles.input, err ? styles.inputError : borderClass]
      .filter(Boolean)
      .join(' ');
    return (
      <div className={styles.field}>
        <label className={labelClass} htmlFor={id}>{label}</label>
        <input
          id={id}
          className={inputClass}
          type="number"
          value={form[field]}
          step={0.1}
          min={min}
          onChange={e => setStr(field, e.target.value)}
          onFocus={e => e.target.select()}
        />
        {err && <span className={styles.errorMsg}>{err}</span>}
      </div>
    );
  }

  function checkbox(
    id: string,
    checked: boolean,
    label: string,
    onChange: (v: boolean) => void,
    disabled?: boolean,
  ): React.JSX.Element {
    return (
      <label
        className={styles.checkboxLabel}
        htmlFor={id}
        style={disabled ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
      >
        <input
          id={id}
          type="checkbox"
          className={styles.checkbox}
          checked={checked}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
        />
        {label}
      </label>
    );
  }

  // ── editor views ───────────────────────────────────────────────────────────

  if (view === 'editor' && editingBox) {
    return (
      <div className={styles.form}>
        <BoxInteriorEditor
          box={editingBox}
          items={interiorById[editingBox.id] ?? []}
          onChange={items => setBoxInterior(editingBox.id, items)}
          onBack={() => setView('main')}
          numFronts={numFrontsPerBox.get(editingBox.id) ?? 1}
          hasPartitions={partitionsById.get(editingBox.id) ?? false}
          onAddPartition={() => addPartition(editingBox.id)}
          onRemovePartition={() => removePartition(editingBox.id)}
          cellItems={cellInteriorById[editingBox.id] ?? [[], []]}
          onCellItemsChange={(ci, items) => setCellItems(editingBox.id, ci, items)}
          tBody={getMaterial(form.bodyMaterialId).thickness / 10}
        />
      </div>
    );
  }

  if (view === 'doorEditor' && editingDoorId) {
    const door = doorsById[editingDoorId];
    if (door) {
      return (
        <div className={styles.form}>
          <DoorEditor
            door={door}
            interiorItems={interiorById[door.boxId] ?? []}
            displayNumber={displayNumbers.get(editingDoorId) ?? ''}
            globalMaterialId={form.frontMaterialId}
            plinthHeight={parseFloat(form.plinth) || 0}
            onHingeSide={side => setDoorHingeSide(editingDoorId, side)}
            onHingeCount={count => setDoorHingeCount(editingDoorId, count)}
            onHingeManual={(hingeId, pos) => setHingeManual(editingDoorId, hingeId, pos)}
            onResetAuto={hingeId => resetHingeToAuto(editingDoorId, hingeId)}
            onHasDoor={v => setDoorHasDoor(editingDoorId, v)}
            onThickness={matId => setDoorThickness(editingDoorId, matId)}
            onBack={() => setView('main')}
          />
        </div>
      );
    }
  }

  // ── main view ──────────────────────────────────────────────────────────────

  const bodyBoxes = result?.boxes.filter(b => b.level !== 'plinth') ?? [];
  const thumbSizes = computeThumbSizes(bodyBoxes);

  return (
    <form onSubmit={handleSubmit} className={styles.form} noValidate>
      <h2 className={styles.formTitle}>{t.form.title}</h2>

      <div className={styles.twoCol}>
        <div className={styles.formCol}>
          <div className={styles.grid}>

            {/* שורה 1: W, H, D */}
            {numInput('input-W', 'W', t.form.width, 0.1, 'width')}
            {numInput('input-H', 'H', t.form.height, 0.1, 'height')}
            {numInput('input-D', 'D', t.form.depth, 0.1, 'depth')}

            {/* שורה 2: צוקל, דלתות לגובה, חומר */}
            {numInput('input-plinth', 'plinth', t.form.plinthHeight, 0, 'height')}

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="input-doors-per-col">
                {t.form.doorsPerColumn}
              </label>
              <select
                id="input-doors-per-col"
                className={styles.select}
                value={form.doorsPerColumn}
                onChange={e =>
                  setForm(p => ({ ...p, doorsPerColumn: e.target.value as DoorsPerColumn }))
                }
              >
                <option value="auto">{t.form.auto}</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="input-body-material">
                {t.form.bodyMaterial}
              </label>
              <select
                id="input-body-material"
                className={styles.select}
                value={form.bodyMaterialId}
                onChange={e =>
                  setForm(p => ({ ...p, bodyMaterialId: e.target.value as MaterialId }))
                }
              >
                {materialsArray.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="input-front-material">
                {t.form.frontMaterial}
              </label>
              <select
                id="input-front-material"
                className={styles.select}
                value={form.frontMaterialId}
                onChange={e =>
                  setForm(p => ({ ...p, frontMaterialId: e.target.value as MaterialId }))
                }
              >
                {materialsArray.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* צ'קבוקסים — משתרעים על כל הרוחב */}
            <div className={styles.checkboxRow}>
              <div className={styles.checkboxWithWarn}>
                {checkbox(
                  'input-shell',
                  form.hasShell,
                  t.form.hasShell,
                  v => setForm(p => ({
                    ...p,
                    hasShell: v,
                    ...(v ? {} : { hasEnvelopeTop: false }),
                    ...(p.doorGapManuallySet ? {} : { doorGap: v ? '2' : '0' }),
                  })),
                )}
                {shellWidthWarning && (
                  <span className={styles.warnMsg}>{shellWidthWarning}</span>
                )}
              </div>
              {checkbox(
                'input-covers-plinth',
                form.doorCoversPlinth,
                t.form.doorCoversPlinth,
                v => {
                  setForm(p => ({ ...p, doorCoversPlinth: v }));
                  setCoversSkirt(v);
                },
                parseFloat(form.plinth) <= 0 || isNaN(parseFloat(form.plinth)),
              )}
              <div className={styles.checkboxWithWarn}>
                {checkbox(
                  'input-envelope-top',
                  form.hasEnvelopeTop,
                  t.form.hasEnvelopeTop,
                  v => setForm(p => ({ ...p, hasEnvelopeTop: v })),
                  !form.hasShell,
                )}
                {envelopeTopWarning && (
                  <span className={styles.warnMsg}>{envelopeTopWarning}</span>
                )}
              </div>
            </div>

            {/* רווח בין דלתות */}
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="input-door-gap">
                {t.form.doorGap}
              </label>
              <input
                id="input-door-gap"
                className={styles.input}
                type="number"
                value={form.doorGap}
                step={0.5}
                min={0}
                onChange={e => setForm(p => ({ ...p, doorGap: e.target.value, doorGapManuallySet: true }))}
                onFocus={e => e.target.select()}
              />
              {(parseFloat(form.doorGap) || 0) > 4 && (
                <span className={styles.warnMsg}>{t.form.doorGapWarn}</span>
              )}
            </div>

            {/* רוחב מקסימלי לחזית */}
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="input-max-door-width">
                {t.form.maxDoorWidth}
              </label>
              <input
                id="input-max-door-width"
                className={styles.input}
                type="number"
                value={form.maxDoorWidth}
                step={5}
                min={10}
                onChange={e => setForm(p => ({ ...p, maxDoorWidth: e.target.value }))}
                onFocus={e => e.target.select()}
              />
            </div>

            {/* שדות מותנים: גובה קומות */}
            {needsLower  && numInput('input-lower-door',  'lowerDoorH',  lowerLabel,              0.1, 'height')}
            {needsMiddle && numInput('input-middle-door', 'middleDoorH', t.form.middleDoorHeight, 0.1, 'height')}

          </div>
        </div>

        <div className={styles.sketchStack}>
          {/* Mode toggle — shown only after first calculation */}
          {result && (
            <div className={styles.modeToggle}>
              <button
                type="button"
                className={`${styles.modeBtn} ${styles.modeBtnBodies} ${sketchMode === 'bodies' ? styles.modeBtnActive : ''}`}
                onClick={() => setSketchMode('bodies')}
              >
                {t.doors.bodies}
              </button>
              <button
                type="button"
                className={`${styles.modeBtn} ${styles.modeBtnFronts} ${sketchMode === 'fronts' ? styles.modeBtnActive : ''}`}
                onClick={() => setSketchMode('fronts')}
              >
                {t.doors.fronts}
              </button>
            </div>
          )}

          {/* Main sketch */}
          {sketchMode === 'bodies' || !result ? (
            <CabinetSketch
              W={form.W}
              H={form.H}
              D={form.D}
              plinth={form.plinth}
              doorsPerColumn={form.doorsPerColumn}
              {...(needsLower  ? { lowerDoorH:  form.lowerDoorH  } : {})}
              {...(needsMiddle ? { middleDoorH: form.middleDoorH } : {})}
              interiorById={result ? interiorById : undefined}
              {...(result ? { cellInteriorById, partitionsById } : {})}
              hasShell={form.hasShell}
              frontMaterialThickness={frontThicknessCm}
              {...(form.hasEnvelopeTop && form.hasShell ? { hasEnvelopeTop: true } : {})}
            />
          ) : (
            <CabinetFrontsSketch
              W={form.W}
              H={form.H}
              D={form.D}
              plinth={form.plinth}
              doorsPerColumn={form.doorsPerColumn}
              {...(needsLower  ? { lowerDoorH:  form.lowerDoorH  } : {})}
              {...(needsMiddle ? { middleDoorH: form.middleDoorH } : {})}
              doorsById={doorsById}
              displayNumbers={displayNumbers}
              drawerFrontsById={drawerFrontsById}
              onDrawerFrontClick={setEditingDrawerId}
            />
          )}

          {/* Thumbnails row */}
          {bodyBoxes.length > 0 && sketchMode === 'bodies' && (
            <div className={styles.thumbRow}>
              {bodyBoxes.map(box => {
                const { w, h } = thumbSizes.get(box.id) ?? { w: DEFAULT_THUMB_W, h: DEFAULT_THUMB_H };
                return (
                <BoxThumbnail
                  key={box.id}
                  box={box}
                  items={interiorById[box.id] ?? []}
                  svgWidth={w}
                  svgHeight={h}
                  hasPartition={partitionsById.get(box.id) ?? false}
                  {...(cellInteriorById[box.id] ? { cellItems: cellInteriorById[box.id] } : {})}
                  onClick={() => openEditor(box)}
                />
                );
              })}
            </div>
          )}

          {bodyBoxes.length > 0 && sketchMode === 'fronts' && result && (
            <div className={styles.thumbRow}>
              {bodyBoxes.flatMap(box => {
                const nf = numFrontsPerBox.get(box.id) ?? 1;
                return Array.from({ length: nf }, (_, fi) => {
                  const doorId = makeDoorId(box.id, fi);
                  const door = doorsById[doorId];
                  if (!door) return null;
                  return (
                    <DoorThumbnail
                      key={doorId}
                      door={door}
                      displayNumber={displayNumbers.get(doorId) ?? ''}
                      globalMaterialId={form.frontMaterialId}
                      plinthHeight={parseFloat(form.plinth) || 0}
                      onClick={() => openDoorEditor(doorId)}
                    />
                  );
                });
              })}
            </div>
          )}
        </div>
      </div>

      <button type="submit" className={styles.submitBtn}>
        {t.form.calculate}
      </button>

      {result !== null && (
        <>
          <p className={styles.summary}>
            {t.results.summary(result.boxes.length, totalPieces)}
          </p>
          {sketchMode === 'bodies'
            ? <BoxesList boxes={result.boxes} />
            : <DoorsList
                bodyBoxes={bodyBoxes}
                doorsById={doorsById}
                drawerFrontsById={drawerFrontsById}
                drawerById={drawerById}
                displayNumbers={displayNumbers}
                globalMaterialId={form.frontMaterialId}
                plinthHeight={parseFloat(form.plinth) || 0}
                numFrontsPerBox={numFrontsPerBox}
                hasShell={form.hasShell}
                {...(form.hasEnvelopeTop && form.hasShell ? { hasEnvelopeTop: true } : {})}
                {...(parsedW > 0 ? { cabinetW: parsedW, cabinetH: parseFloat(form.H) || 0, cabinetD: parseFloat(form.D) || 0 } : {})}
                frontMaterialThickness={frontThicknessCm}
                onDrawerFrontClick={setEditingDrawerId}
              />
          }
        </>
      )}
      {editingDrawerId && drawerById[editingDrawerId] && (
        <ExternalDrawerEditor
          drawer={drawerById[editingDrawerId]!}
          onSetHeight={h => setDrawerHeight(editingDrawerId, h)}
          onSetThicknessOverride={mid => setDrawerFrontThickness(editingDrawerId, mid)}
          onDelete={() => { deleteDrawer(editingDrawerId); setEditingDrawerId(null); }}
          onClose={() => setEditingDrawerId(null)}
        />
      )}
    </form>
  );
}
