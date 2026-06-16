import React from 'react';
import CabinetSketch from './CabinetSketch';
import { CabinetFrontsOverlay } from './CabinetFrontsOverlay';
import { buildCabinetSketchModel } from '../../core/product/cabinetSketchModel';
import { kitchenElevationLayout } from '../../core/product/kitchenFootprint';
import type { ProductUnit, KitchenUnit } from '../../types/project';
import type { CustomMaterial } from '../../types/materials';
import type { CabinetInput } from '../../types/cabinet';
import type { SavedCabinetState } from '../../types';

interface Props {
  product: ProductUnit;
  mode: 'bodies' | 'fronts';
  customMaterials: CustomMaterial[];
  /** Apply horizontal mirror (for south / east wall view). */
  mirrored?: boolean;
}

export function ProductElevation({ product, mode, customMaterials, mirrored }: Props): React.JSX.Element {
  const content =
    product.productType === 'kitchen'
      ? <KitchenElevation units={product.kitchenUnits ?? []} mode={mode} customMaterials={customMaterials} />
      : <SingleCabinetElevation input={product.cabinet.input} state={product.cabinet.state} mode={mode} customMaterials={customMaterials} />;

  return (
    <div style={{ width: '100%', height: '100%', transform: mirrored ? 'scaleX(-1)' : undefined }}>
      {content}
    </div>
  );
}

// ── Single cabinet ────────────────────────────────────────────────────────────

function SingleCabinetElevation({
  input, state, mode, customMaterials,
}: {
  input: CabinetInput;
  state: SavedCabinetState;
  mode: 'bodies' | 'fronts';
  customMaterials: CustomMaterial[];
}): React.JSX.Element {
  const m = buildCabinetSketchModel(input, state, customMaterials);
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <CabinetSketch
        embedded
        W={String(input.W)}
        H={String(input.H)}
        D={String(input.D)}
        backThicknessCm={input.backThickness}
        plinth={String(input.plinth)}
        doorsPerColumn={String(input.doorsPerColumn)}
        {...(input.lowerDoorH !== undefined ? { lowerDoorH: String(input.lowerDoorH) } : {})}
        {...(input.middleDoorH !== undefined ? { middleDoorH: String(input.middleDoorH) } : {})}
        interiorById={m.interiorById}
        cellInteriorById={m.cellInteriorById}
        partitionsById={m.partitionsById}
        hasShell={m.hasAnyShell}
        hasShellLeft={m.sides.left}
        hasShellRight={m.sides.right}
        frontMaterialThickness={m.tFront}
        {...(input.hasEnvelopeTop ? { hasEnvelopeTop: true } : {})}
        {...(input.hasWallEnvelope && input.mount === 'wall' ? { wallEnvelopeCm: m.tFront } : {})}
        frontLayoutByRow={m.frontLayoutByRow}
        numFrontsPerBox={m.numFrontsPerBox}
        bodyMaterialId={input.bodyMaterialId}
        frontMaterialId={input.frontMaterialId}
        boardOverrides={m.boardOverrides}
        boxDimensionOverrides={m.boxDimensionOverrides}
        {...(input.topVariant ? { topVariant: input.topVariant } : {})}
        {...(input.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: input.sinkTraverseWidthCm } : {})}
        {...(input.hasBack !== undefined ? { hasBack: input.hasBack } : {})}
        {...(input.hasBottom !== undefined ? { hasBottom: input.hasBottom } : {})}
        customMaterials={customMaterials}
      />
      {mode === 'fronts' && (
        <CabinetFrontsOverlay
          input={input}
          state={state}
          customMaterials={customMaterials}
          viewBoxW={m.outerCabW}
          viewBoxH={m.effH}
        />
      )}
    </div>
  );
}

// ── Kitchen (multiple units) ──────────────────────────────────────────────────

function KitchenElevation({
  units, mode, customMaterials,
}: {
  units: ReadonlyArray<KitchenUnit>;
  mode: 'bodies' | 'fronts';
  customMaterials: CustomMaterial[];
}): React.JSX.Element {
  const elevLayout = kitchenElevationLayout(units);
  const totalW = Math.max(1, ...elevLayout.map(b => b.xCm + b.w));
  const totalH = Math.max(1, ...elevLayout.map(b => b.yBottomCm + b.h));

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {units.map(unit => {
        const box = elevLayout.find(b => b.unitId === unit.id);
        if (!box) return null;
        const inp = unit.cabinet.input;
        const st = unit.cabinet.state;
        const m = buildCabinetSketchModel(inp, st, customMaterials);

        return (
          <div
            key={unit.id}
            style={{
              position: 'absolute',
              left: `${(box.xCm / totalW) * 100}%`,
              bottom: `${(box.yBottomCm / totalH) * 100}%`,
              width: `${(box.w / totalW) * 100}%`,
              height: `${(box.h / totalH) * 100}%`,
            }}
          >
            <CabinetSketch
              embedded
              W={String(inp.W)}
              H={String(inp.H)}
              D={String(inp.D)}
              backThicknessCm={inp.backThickness}
              plinth={String(inp.plinth)}
              doorsPerColumn={String(inp.doorsPerColumn)}
              {...(inp.lowerDoorH !== undefined ? { lowerDoorH: String(inp.lowerDoorH) } : {})}
              {...(inp.middleDoorH !== undefined ? { middleDoorH: String(inp.middleDoorH) } : {})}
              interiorById={m.interiorById}
              cellInteriorById={m.cellInteriorById}
              partitionsById={m.partitionsById}
              hasShell={m.hasAnyShell}
              hasShellLeft={m.sides.left}
              hasShellRight={m.sides.right}
              frontMaterialThickness={m.tFront}
              {...(inp.hasEnvelopeTop ? { hasEnvelopeTop: true } : {})}
              {...(inp.hasWallEnvelope && inp.mount === 'wall' ? { wallEnvelopeCm: m.tFront } : {})}
              frontLayoutByRow={m.frontLayoutByRow}
              numFrontsPerBox={m.numFrontsPerBox}
              bodyMaterialId={inp.bodyMaterialId}
              frontMaterialId={inp.frontMaterialId}
              boardOverrides={m.boardOverrides}
              boxDimensionOverrides={m.boxDimensionOverrides}
              {...(inp.topVariant ? { topVariant: inp.topVariant } : {})}
              {...(inp.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: inp.sinkTraverseWidthCm } : {})}
              {...(inp.hasBack !== undefined ? { hasBack: inp.hasBack } : {})}
              {...(inp.hasBottom !== undefined ? { hasBottom: inp.hasBottom } : {})}
              customMaterials={customMaterials}
              unifiedPlinth
            />
            {mode === 'fronts' && (
              <CabinetFrontsOverlay
                input={inp}
                state={st}
                customMaterials={customMaterials}
                viewBoxW={m.outerCabW}
                viewBoxH={m.effH}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
