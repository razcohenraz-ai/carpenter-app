export interface Hinge {
  id: string;
  positionFromBottom: number; // cm from door bottom
  isManual: boolean;          // true = user-set, never auto-adjusted
}

export interface Door {
  id: string;
  boxId: string;
  height: number; // cm — door panel height (= box.H)
  width: number;  // cm — door panel width  (= box.W)
  hingeSide: 'right' | 'left';
  hingeCount: number | 'auto'; // 'auto' = derived from height; number = user-set, preserved
  hinges: Hinge[];
  hasDoor: boolean; // false = open/no front panel
  coversSkirt: boolean; // true = this door extends down to cover the plinth
  thicknessOverride?: string; // materialId; undefined = use global cabinet material
}

export type DoorById = Record<string, Door>;
