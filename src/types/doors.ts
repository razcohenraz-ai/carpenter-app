export interface Hinge {
  id: string;
  positionFromBottom: number; // cm from door bottom
  isManual: boolean;          // true = user-set, never auto-adjusted
}

export interface Door {
  id: string;
  boxId: string;
  frontIndex: number;     // 0 = rightmost front, 1, 2, ... left-to-right (RTL order)
  sectionIndex?: number;  // 0 = bottom section; >0 for split doors at internalShelves (default: 0)
  /** Bottom of this section in box-local cm (from body bottom). 0 for si=0.
   *  Used by sketches to position section-doors without re-deriving shelf geometry. */
  sectionY0?: number;
  height: number; // cm — door panel height
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

// ── Drawer fronts (derived facade panels of external drawers) ─────────────────
// A `DrawerFront` is the front-of-cabinet panel that belongs to a `DrawerItem`
// with `mount === 'external'`. It is **derived** from the items+geometry on
// every `calculate()`; the persistent source-of-truth is the DrawerItem itself.

export interface DrawerFront {
  id: string;                    // identical to the source drawerId
  drawerId: string;              // the DrawerItem this front belongs to
  boxId: string;
  frontIndex: number;            // which column-front of the box (same convention as Door)
  cellIndex?: 0 | 1;             // set when the drawer lives in a partitioned cell
  positionFromBoxBottom: number; // cm — y-offset of the panel's bottom edge from the box's bottom
  height: number;                // cm — structural panel height (= drawerHeight; visual extension via coversSkirt)
  width: number;                 // cm — panel width
  coversSkirt: boolean;          // true → panel extends down over the plinth (visual only)
  gapMm: number;                 // gap between fronts; needed for skirt visual extension
  thicknessOverride?: string;    // materialId; mirrors Door.thicknessOverride for external drawers
}

export type DrawerFrontById = Record<string, DrawerFront>;
