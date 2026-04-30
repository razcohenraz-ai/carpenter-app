import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useCabinet } from '../hooks/useCabinet';
import { MATERIALS } from '../../catalog';
import type { MaterialId } from '../../types';
import BoxesList from './BoxesList';
import CabinetSketch from './CabinetSketch';
import styles from './CabinetForm.module.css';

type DoorsPerColumn = 'auto' | '1' | '2' | '3';

interface FormState {
  W: string;
  H: string;
  D: string;
  plinth: string;
  lowerDoorH: string;
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
}

const NO_ERRORS: FormErrors = { W: '', H: '', D: '', plinth: '', lowerDoorH: '' };
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
  const { result, calculate } = useCabinet();

  const [form, setForm] = useState<FormState>({
    W: '240', H: '220', D: '60',
    plinth: '10', lowerDoorH: '110',
    hasShell: true, doorCoversPlinth: false,
    materialId: 'mdf18', doorsPerColumn: 'auto',
  });

  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  // ── handlers ──────────────────────────────────────────────────────────────

  function setStr(field: keyof FormErrors, value: string): void {
    if (field === 'W') setForm(p => ({ ...p, W: value }));
    else if (field === 'H') setForm(p => ({ ...p, H: value }));
    else if (field === 'D') setForm(p => ({ ...p, D: value }));
    else if (field === 'plinth') setForm(p => ({ ...p, plinth: value }));
    else setForm(p => ({ ...p, lowerDoorH: value }));

    if (errors[field]) {
      if (field === 'W') setErrors(p => ({ ...p, W: '' }));
      else if (field === 'H') setErrors(p => ({ ...p, H: '' }));
      else if (field === 'D') setErrors(p => ({ ...p, D: '' }));
      else if (field === 'plinth') setErrors(p => ({ ...p, plinth: '' }));
      else setErrors(p => ({ ...p, lowerDoorH: '' }));
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();

    const W      = parseFloat(form.W);
    const H      = parseFloat(form.H);
    const D      = parseFloat(form.D);
    const plinth = parseFloat(form.plinth);
    const loDoor = parseFloat(form.lowerDoorH);
    const needsLo = showLowerDoor(form.doorsPerColumn, form.H);

    const loDoorErr = needsLo
      ? (isNaN(loDoor) || loDoor <= 0 ? t.form.errorInvalid
         : (!isNaN(H) && loDoor >= H ? t.form.errorMustBeLessThanH : ''))
      : '';

    const newErrors: FormErrors = {
      W:        isNaN(W)      || W      <= 0 ? t.form.errorInvalid : '',
      H:        isNaN(H)      || H      <= 0 ? t.form.errorInvalid : '',
      D:        isNaN(D)      || D      <= 0 ? t.form.errorInvalid : '',
      plinth:   isNaN(plinth) || plinth  < 0 ? t.form.errorInvalid : '',
      lowerDoorH: loDoorErr,
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
      doorsPerColumn,
    });
  }

  // ── derived values ─────────────────────────────────────────────────────────

  const needsLower = showLowerDoor(form.doorsPerColumn, form.H);
  const lowerLabel = form.doorsPerColumn === '3'
    ? t.form.lowerDoorHeightMulti
    : t.form.lowerDoorHeight;
  const totalPieces = result?.cuts.reduce((sum, c) => sum + c.qty, 0) ?? 0;

  // ── helpers ────────────────────────────────────────────────────────────────

  function numInput(
    id: string,
    field: keyof FormErrors,
    label: string,
    min = 0.1,
  ): React.JSX.Element {
    const err = errors[field];
    return (
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={id}>{label}</label>
        <input
          id={id}
          className={`${styles.input}${err ? ` ${styles.inputError}` : ''}`}
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
  ): React.JSX.Element {
    return (
      <label className={styles.checkboxLabel} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className={styles.checkbox}
          checked={checked}
          onChange={e => onChange(e.target.checked)}
        />
        {label}
      </label>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className={styles.form} noValidate>
      <h2 className={styles.formTitle}>{t.form.title}</h2>

      <div className={styles.twoCol}>
        <div className={styles.formCol}>
          <div className={styles.grid}>

            {/* שורה 1: W, H, D */}
            {numInput('input-W', 'W', t.form.width)}
            {numInput('input-H', 'H', t.form.height)}
            {numInput('input-D', 'D', t.form.depth)}

            {/* שורה 2: צוקל, דלתות לגובה, חומר */}
            {numInput('input-plinth', 'plinth', t.form.plinthHeight, 0)}

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
                v => setForm(p => ({ ...p, doorCoversPlinth: v })),
              )}
            </div>

            {/* שדה מותנה: גובה דלת תחתונה */}
            {needsLower && numInput('input-lower-door', 'lowerDoorH', lowerLabel)}

          </div>
        </div>

        <CabinetSketch
          W={form.W}
          H={form.H}
          D={form.D}
          plinth={form.plinth}
          {...(needsLower ? { lowerDoorH: form.lowerDoorH } : {})}
        />
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
