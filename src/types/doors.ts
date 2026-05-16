export interface Hinge {
  id: string;
  positionFromBottom: number; // cm from door bottom
  isManual: boolean;          // true = user-set, never auto-adjusted
}

export interface Door {
  id: string;
  boxId: string;
  frontIndex: number;  // 0 = rightmost front, 1, 2, ... left-to-right (RTL order)
  height: number; // cm — door panel height (= box.H)
  width: number;  // cm — door panel width per front
  hingeSide: 'right' | 'left';
  hingeCount: number | 'auto'; // 'auto' = derived from height; number = user-set, preserved
  hinges: Hinge[];
  hasDoor: boolean; // false = open/no front panel
  coversSkirt: boolean; // true = this door extends down to cover the plinth
  gapMm?: number;           // door gap setting; needed by getDoorVisualHeight for skirt correction
  thicknessOverride?: string; // materialId; undefined = use global cabinet material
}

export type DoorById = Record<string, Door>;
