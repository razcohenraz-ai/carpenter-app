import React from 'react';

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

export default function DimensionValue({ value, axis }: Props): React.JSX.Element {
  return <span style={{ color: COLOR_VAR[axis] }}>{value}</span>;
}
