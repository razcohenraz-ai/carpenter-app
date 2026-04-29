import type { HardwarePresets } from "../../types/hardware";
import rawPresets from "./presets.json";

// נתוני ערכות הפרזולים טעונים מ-presets.json.
// לעדכון מחירים, הוספת פריט, או שינוי כמויות — ערוך את הקובץ JSON בלבד.

export const HW_PRESETS: HardwarePresets = rawPresets as HardwarePresets;
