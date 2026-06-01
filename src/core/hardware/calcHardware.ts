import { buildHW } from './hardwareCalc';
import type { HardwareLineItem } from '../../types/hardware';
import type { DoorById } from '../../types/doors';
import type { InteriorById, CellInteriorById } from '../../types/interior';

function countItemsOfType(
  interiorById: InteriorById,
  cellInteriorById: CellInteriorById,
  type: 'shelf' | 'drawer' | 'rod',
): number {
  let count = 0;
  for (const items of Object.values(interiorById)) {
    for (const item of items) {
      if (item.type === type) count++;
    }
  }
  for (const cells of Object.values(cellInteriorById)) {
    for (const cellItems of cells) {
      for (const item of cellItems) {
        if (item.type === type) count++;
      }
    }
  }
  return count;
}

export function calcHardware(
  doorsById: DoorById,
  interiorById: InteriorById,
  cellInteriorById: CellInteriorById,
): HardwareLineItem[] {
  const numDoors = Object.values(doorsById).filter(d => d.hasDoor).length;
  const drawers  = countItemsOfType(interiorById, cellInteriorById, 'drawer');
  const shelves  = countItemsOfType(interiorById, cellInteriorById, 'shelf');
  const rods     = countItemsOfType(interiorById, cellInteriorById, 'rod');
  return buildHW('cabinet', numDoors, drawers, shelves, rods);
}
