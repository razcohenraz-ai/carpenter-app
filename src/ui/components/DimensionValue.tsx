import React from 'react';
import { formatDim } from '../../core/utils/round';

export type DimensionAxis = 'width' | 'height' | 'depth';

const COLOR_VAR: Record<DimensionAxis, string> = {
  width:  'var(--color-width)',
  height: 'var(--color-height)',
  depth:  'var(--color-depth)',
};

interface Props {
  value: number | string;
  axis: DimensionAxis;
}

/** Renders a single dimension value in its axis colour. Numeric inputs are
 *  scrubbed through `formatDim` so IEEE-754 noise (e.g. `57.40000000000006`
 *  from the carcass-depth calculation) never reaches the screen. Strings
 *  pass through unchanged — callers that already pre-format (e.g.
 *  `value.toFixed(1)`) keep their explicit formatting. */
export default function DimensionValue({ value, axis }: Props): React.JSX.Element {
  const display = typeof value === 'number' ? formatDim(value) : value;
  return <span style={{ color: COLOR_VAR[axis] }}>{display}</span>;
}
