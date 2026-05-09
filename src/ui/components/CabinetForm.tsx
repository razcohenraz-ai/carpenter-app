import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useCabinet } from '../hooks/useCabinet';
import { MATERIALS } from '../../catalog';
import type { MaterialId } from '../../types';
import type { Box } from '../../types/geometry';
import BoxesList from './BoxesList';
import CabinetSketch from './CabinetSketch';
import CabinetFrontsSketch from './CabinetFrontsSketch';
import BoxThumbnail from './BoxThumbnail';
import BoxInteriorEditor from './BoxInteriorEditor';
import DoorThumbnail from './DoorThumbnail';
import DoorEditor from './DoorEditor';
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
  doorCoversPlinth: boolean;
  materialId: MaterialId;
  doorsPerColumn: DoorsPerColumn;
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
    doorsById, displayNumbers,
    setDoorHingeSide, setDoorHingeCount, setHingeManual, resetHingeToAuto, setDoorHasDoor,
    setDoorThickness, setCoversSkirt,
  } = useCabinet();

  const [view, setView]               = useState<'main' | 'editor' | 'doorEditor'>('main');
  const [editingBox, setEditingBox]   = useState<Box | null>(null);
  const [editingDoorId, setEditingDoorId] = useState<string | null>(null);
  const [sketchMode, setSketchMode]   = useState<'bodies' | 'fronts'>('bodies');

  function openEditor(box: Box): void {
    setEditingBox(box);
    setView('editor');
  }

  function openDoorEditor(boxId: string): void {
    setEditingDoorId(boxId);
    setView('doorEditor');
  }

  const [form, setForm] = useState<FormState>({
    W: '240', H: '220', D: '60',
    plinth: '10', lowerDoorH: '110', middleDoorH: '80',
    hasShell: true, doorCoversPlinth: false,
    materialId: 'mdf18', doorsPerColumn: 'auto',
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
      materialId: form.materialId,
      plinth,
      doorCoversPlinth: form.doorCoversPlinth,
      lowerDoorH: needsLo ? loDoor : undefined,
      middleDoorH: needsMid ? midDoor : undefined,
      doorsPerColumn,
    });
  }

  // ── derived values ─────────────────────────────────────────────────────────

  const needsLower  = showLowerDoor(form.doorsPerColumn, form.H);
  const needsMiddle = form.doorsPerColumn === '3';
  const lowerLabel  = form.doorsPerColumn === '3'
    ? t.form.lowerDoorHeightMulti
    : t.form.lowerDoorHeight;
  const totalPieces = result?.cuts.reduce((sum, c) => sum + c.qty, 0) ?? 0;

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
            interiorItems={interiorById[editingDoorId] ?? []}
            displayNumber={displayNumbers.get(editingDoorId) ?? ''}
            globalMaterialId={form.materialId}
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
              <label className={styles.fieldLabel} htmlFor="input-material">
                {t.form.material}
              </label>
              <select
                id="input-material"
                className={styles.select}
                value={form.materialId}
                onChange={e =>
                  setForm(p => ({ ...p, materialId: e.target.value as MaterialId }))
                }
              >
                {materialsArray.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* צ'קבוקסים — משתרעים על כל הרוחב */}
            <div className={styles.checkboxRow}>
              {checkbox(
                'input-shell',
                form.hasShell,
                t.form.hasShell,
                v => setForm(p => ({ ...p, hasShell: v })),
              )}
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
                  onClick={() => openEditor(box)}
                />
                );
              })}
            </div>
          )}

          {bodyBoxes.length > 0 && sketchMode === 'fronts' && result && (
            <div className={styles.thumbRow}>
              {bodyBoxes.map(box => {
                const door = doorsById[box.id];
                if (!door) return null;
                return (
                  <DoorThumbnail
                    key={box.id}
                    door={door}
                    displayNumber={displayNumbers.get(box.id) ?? ''}
                    globalMaterialId={form.materialId}
                    plinthHeight={parseFloat(form.plinth) || 0}
                    onClick={() => openDoorEditor(box.id)}
                  />
                );
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
          <BoxesList boxes={result.boxes} />
        </>
      )}
    </form>
  );
}
