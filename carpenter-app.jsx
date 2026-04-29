import { useState, useMemo } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_DOOR_WIDTH = 60;
const TALL_THRESHOLD = 180;
const LABOR_RATE     = 180;
const WASTE_FACTOR   = 1.10;

const WOOD_PRICES = {
  mdf18:      { name:"MDF 18mm",     pricePerSheet:120, sheetW:244, sheetH:122 },
  mdf12:      { name:"MDF 12mm",     pricePerSheet:90,  sheetW:244, sheetH:122 },
  plywood18:  { name:"עץ לבן 18mm",  pricePerSheet:180, sheetW:244, sheetH:122 },
  oak18:      { name:"אלון 18mm",    pricePerSheet:380, sheetW:244, sheetH:122 },
  melamine18: { name:"מלמין 18mm",   pricePerSheet:160, sheetW:244, sheetH:122 },
};

const FURNITURE_TYPES = [
  { id:"cabinet",     label:"ארון",           icon:"🗄️" },
  { id:"shelf",       label:"מדפייה",         icon:"📚" },
  { id:"table",       label:"שולחן",          icon:"🪑" },
  { id:"drawer_unit", label:"יחידת מגירות",   icon:"🗃️" },
  { id:"custom",      label:"מותאם אישית",    icon:"✏️" },
];

// ─── Box Decomposition Engine ─────────────────────────────────────────────────
// Sheet dimensions in cm
const SHEET_W = 122; // 122cm
const SHEET_H = 244; // 244cm
const MAX_BOX_W = 120; // split width if over 120cm
const MAX_BOX_H = 200; // split height if over 200cm

/*
  Rules:
  1. Height > 200cm → split into 2 vertical boxes:
       bottom box H = lower door height (from calcDoors)
       top box H    = total H - bottom H
  2. Width 60–120cm → split into 2 equal width boxes side by side
  3. Width > 120cm  → optimal split: try all divisors, pick split that wastes least
                       each piece must fit within 122cm (sheet width)
  4. Width ≤ 60cm   → single box (no split needed)

  Returns array of box objects: { id, label, W, H, D, role }
  role = "bottom" | "top" | "left" | "right" | "single" | "unit_N"
*/
function decomposeBoxes(W, H, D, lowerDoorH) {
  const boxes = [];

  // Step 1 — split height if needed
  let heightGroups = [];
  if (H > MAX_BOX_H) {
    const loH = lowerDoorH || Math.round(H * 0.45);
    const hiH = H - loH;
    heightGroups = [
      { H: loH, role_suffix: "תחתונה" },
      { H: hiH, role_suffix: "עליונה" },
    ];
  } else {
    heightGroups = [{ H, role_suffix: "" }];
  }

  // Step 2+3 — for each height group, split width
  heightGroups.forEach(({ H: bH, role_suffix }) => {
    const widthBoxes = splitWidth(W, bH, D, role_suffix);
    boxes.push(...widthBoxes);
  });

  return boxes;
}

function splitWidth(W, H, D, suffix) {
  const label = (role) => [role, suffix].filter(Boolean).join(" — ");

  if (W <= 60) {
    return [{ W, H, D, label: label("קופסה יחידה"), note: "" }];
  }

  if (W <= MAX_BOX_W) {
    // 60 < W ≤ 120: split into 2 equal halves
    const half = Math.round(W / 2 * 10) / 10;
    return [
      { W: half, H, D, label: label("שמאל"), note: "חצי שמאלי" },
      { W: half, H, D, label: label("ימין"),  note: "חצי ימני"  },
    ];
  }

  // W > 120: optimal split — find best number of units
  // Each unit must be ≤ SHEET_W (122cm) ideally, target ≤ 120cm
  // Try n = 2, 3, 4, ... until each piece ≤ 120cm
  const minN = Math.ceil(W / MAX_BOX_W);
  const n    = minN; // minimum number of boxes that keeps each ≤ 120cm

  // Try to split as evenly as possible, within sheet constraints
  const baseW  = Math.floor((W / n) * 10) / 10;
  const remainder = Math.round((W - baseW * n) * 10) / 10;
  const boxes  = [];
  for (let i = 0; i < n; i++) {
    const bW = i === 0 ? Math.round((baseW + remainder) * 10) / 10 : baseW;
    boxes.push({
      W: bW, H, D,
      label: label(`קופסה ${n > 2 ? (i+1) : (i===0?"שמאל":"ימין")}`),
      note: `${i+1}/${n}`,
    });
  }
  return boxes;
}

// ─── Door logic ───────────────────────────────────────────────────────────────
// W,H = outer shell dimensions (or carcass dims if no shell)
// t   = shell thickness (used to derive inner body dims)
// doors are flush-overlay on inner body, sitting inside the shell opening
function calcDoors(W, H, plinth, doorCoversPlinth, lowerH, hasShell, tShell) {
  // Door width spans the inner opening (shell reduces each side by tShell)
  const innerW  = hasShell ? W - tShell*2 : W;
  const n       = Math.ceil(innerW / MAX_DOOR_WIDTH);
  const doorW   = Math.round((innerW / n) * 10) / 10;

  const doorStart = doorCoversPlinth ? 1 : (plinth > 0 ? plinth - 0.2 : 0.2);
  const doorAreaH = H - doorStart - 0.2;
  const isTall    = doorAreaH > TALL_THRESHOLD;

  if (!isTall) {
    return { n, doorW, rows:1, doorStart,
             lowerH: Math.round(doorAreaH * 10) / 10,
             upperH: null, total: n };
  }
  const lo = lowerH || Math.round(doorAreaH * 0.45);
  const up = Math.round((doorAreaH - lo - 0.4) * 10) / 10;
  return { n, doorW, rows:2, doorStart, lowerH: lo, upperH: up, total: n * 2 };
}

// ─── Cutting list ─────────────────────────────────────────────────────────────
// When hasShell=true:
//   Shell group:  2 outer sides (full H) + 1 top panel (outer W - 2*tShell)
//   Body group:   2 inner sides + top + bottom (all derived from inner dims)
//   Doors: overlap the inner body opening
// When hasShell=false: classic carcass (sides, top, bottom, doors)
function calcCuts(type, W, H, D, shelves, drawers, hasBack,
                  plinth, doorCoversPlinth, lowerH,
                  hasShell, tShell=18, tBody=18) {
  const cuts = [];

  if (type === "cabinet") {
    const d = calcDoors(W, H, plinth, doorCoversPlinth, lowerH, hasShell, tShell);

    if (hasShell) {
      // ── OUTER SHELL ──
      // Inner dimensions of shell = outer dims minus shell thickness on each side
      const iW = W - tShell*2;   // inner width  (= outer width of inner body)
      const iH = H - tShell;     // inner height (shell has top but no separate bottom — body sits on floor)
      const iD = D - tShell;     // inner depth  (shell has back or open back)

      cuts.push({ name:"מעטפת — צד שמאל",   qty:1, w:D*10,        h:H*10,        group:"shell" });
      cuts.push({ name:"מעטפת — צד ימין",   qty:1, w:D*10,        h:H*10,        group:"shell" });
      cuts.push({ name:"מעטפת — טופ",       qty:1, w:iW*10,       h:D*10,        group:"shell" });

      // ── INNER BODY ──
      const bodyH = iH - (plinth > 0 ? plinth : 0);
      cuts.push({ name:"גוף פנימי — צד שמאל",  qty:1, w:iD*10,        h:iH*10,      group:"body" });
      cuts.push({ name:"גוף פנימי — צד ימין",  qty:1, w:iD*10,        h:iH*10,      group:"body" });
      cuts.push({ name:"גוף פנימי — עליון",    qty:1, w:iW*10-tBody*2,h:iD*10,      group:"body" });
      cuts.push({ name:"גוף פנימי — תחתון",   qty:1, w:iW*10-tBody*2,h:iD*10,
                  note: plinth>0 ? `מגובה ${plinth} ס"מ` : "",                       group:"body" });

      if (plinth > 0) {
        cuts.push({ name:"גוף פנימי — צוקל קדמי",  qty:1, w:iW*10-tBody*2, h:plinth*10, group:"body" });
        cuts.push({ name:"גוף פנימי — צוקל אחורי", qty:1, w:iW*10-tBody*2, h:plinth*10, group:"body" });
      }
      if (shelves > 0)
        cuts.push({ name:"גוף פנימי — מדף",   qty:shelves, w:iW*10-tBody*2-2, h:iD*10-20, note:"מדף צף", group:"body" });
      if (hasBack)
        cuts.push({ name:"גוף פנימי — גב",    qty:1, w:iW*10-tBody*2,  h:iH*10-tBody*2, note:"6mm", group:"body" });

    } else {
      // ── CLASSIC CARCASS (no shell) ──
      const bodyH = plinth > 0 ? H - plinth : H;
      cuts.push({ name:"צד שמאל",      qty:1, w:D*10,          h:H*10 });
      cuts.push({ name:"צד ימין",      qty:1, w:D*10,          h:H*10 });
      cuts.push({ name:"עליון",        qty:1, w:W*10-tBody*2,  h:D*10 });
      cuts.push({ name:"תחתון",        qty:1, w:W*10-tBody*2,  h:D*10,
                  note: plinth>0 ? `מגובה ${plinth} ס"מ` : "" });
      if (plinth > 0) {
        cuts.push({ name:"לוח צוקל קדמי",  qty:1, w:W*10-tBody*2, h:plinth*10 });
        cuts.push({ name:"לוח צוקל אחורי", qty:1, w:W*10-tBody*2, h:plinth*10 });
      }
      if (shelves > 0)
        cuts.push({ name:"מדף פנימי",  qty:shelves, w:W*10-tBody*2-2, h:D*10-20, note:"מדף צף" });
      if (hasBack)
        cuts.push({ name:"גב",         qty:1, w:W*10-tBody*2, h:H*10-tBody*2, note:"6mm" });
    }

    // ── DOORS (same either way — sized to opening) ──
    cuts.push({ name:"דלת" + (d.rows===2?" תחתונה":""),
                qty:d.n, w:d.doorW*10-2, h:d.lowerH*10, group:"door" });
    if (d.rows===2)
      cuts.push({ name:"דלת עליונה", qty:d.n, w:d.doorW*10-2, h:d.upperH*10, group:"door" });

    // ── DRAWERS ──
    if (drawers > 0) {
      const refH = hasShell ? H - tShell : H;
      const bodyH2 = plinth > 0 ? refH - plinth : refH;
      const dh = Math.round((bodyH2 * 0.4) / drawers);
      const refW = hasShell ? W - tShell*2 : W;
      cuts.push({ name:"חזית מגירה",  qty:drawers,   w:refW*10-4,      h:dh*10-2 });
      cuts.push({ name:"צד מגירה",    qty:drawers*2, w:D*10-40,        h:dh*10-30, note:"12mm" });
      cuts.push({ name:"גב מגירה",    qty:drawers,   w:refW*10-50,     h:dh*10-30, note:"12mm" });
      cuts.push({ name:"תחתית מגירה", qty:drawers,   w:refW*10-50,     h:D*10-40,  note:"6mm"  });
    }

  } else if (type==="shelf") {
    const t = tBody;
    cuts.push({ name:"צד",   qty:2,         w:D*10,       h:H*10 });
    cuts.push({ name:"מדף",  qty:shelves+2, w:W*10-t*2,   h:D*10 });
    if (hasBack) cuts.push({ name:"גב", qty:1, w:W*10, h:H*10, note:"4mm" });
  } else if (type==="table") {
    cuts.push({ name:"משטח",         qty:1, w:W*10,     h:D*10 });
    cuts.push({ name:"רגל",          qty:4, w:70,        h:H*10-tBody });
    cuts.push({ name:"תיפוף אורכי",  qty:2, w:W*10-140, h:80 });
    cuts.push({ name:"תיפוף רוחבי",  qty:2, w:D*10-140, h:80 });
  } else if (type==="drawer_unit") {
    const t = tBody;
    const dh = Math.round((H*10) / Math.max(drawers,1));
    cuts.push({ name:"צד",            qty:2,         w:D*10,    h:H*10 });
    cuts.push({ name:"חזית מגירה",    qty:drawers,   w:W*10-4,  h:dh-2 });
    cuts.push({ name:"צד מגירה",      qty:drawers*2, w:D*10-40, h:dh-30, note:"12mm" });
    cuts.push({ name:"גב מגירה",      qty:drawers,   w:W*10-50, h:dh-30, note:"12mm" });
    cuts.push({ name:"תחתית מגירה",   qty:drawers,   w:W*10-50, h:D*10-40, note:"6mm" });
    if (hasBack) cuts.push({ name:"גב", qty:1, w:W*10-t*2, h:H*10-t*2, note:"6mm" });
  } else {
    cuts.push({ name:"לוח ראשי", qty:1, w:W*10, h:H*10 });
    if (D>0) cuts.push({ name:"לוח צד", qty:2, w:D*10, h:H*10 });
  }
  return cuts;
}

function sheetsNeeded(cuts, mat) {
  let area = 0;
  cuts.forEach(c => {
    if (/(4mm|גב)/.test(c.note||"")) return;
    area += c.w * c.h * c.qty;
  });
  return Math.ceil((area / (mat.sheetW*10 * mat.sheetH*10)) * WASTE_FACTOR);
}

function sheetsNeededByGroup(cuts, mat, group) {
  let area = 0;
  cuts.forEach(c => {
    if (/(4mm|גב)/.test(c.note||"")) return;
    if (c.group !== group) return;
    area += c.w * c.h * c.qty;
  });
  return Math.ceil((area / (mat.sheetW*10 * mat.sheetH*10)) * WASTE_FACTOR);
}

function laborHours(type, drawers, shelves) {
  if (type==="cabinet")     return 6 + drawers*2;
  if (type==="shelf")       return 3 + shelves*0.5;
  if (type==="table")       return 5;
  if (type==="drawer_unit") return 4 + drawers*1.5;
  return 3;
}

const HW_PRESETS = {
  cabinet:     [{ n:"ציר כוס 35mm",   byD:2, u:"יח'",  p:4  },
                { n:"ידית",            byD:1, u:"יח'",  p:18 },
                { n:"מסילה טלסקופית", byDr:2,u:"זוג",  p:35 },
                { n:"גב 6mm",          f:1,  u:"לוח",  p:60 },
                { n:"פלטות הרכבה",     f:1,  u:"קופסה",p:22 },
                { n:"בורג עץ 4x40",    f:2,  u:"קופסה",p:15 }],
  shelf:       [{ n:"שידת מדף",       byS:4,u:"יח'",  p:1.5},
                { n:"גב 4mm",          f:1,  u:"לוח",  p:45 },
                { n:"בורג עץ 4x40",    f:1,  u:"קופסה",p:15 }],
  table:       [{ n:"בורג רגל",        f:16, u:"יח'",  p:2  },
                { n:"פלטת הרכבה",      f:8,  u:"יח'",  p:4  }],
  drawer_unit: [{ n:"מסילה טלסקופית", byDr:2,u:"זוג",  p:35 },
                { n:"ידית",           byDr:1,u:"יח'",  p:18 },
                { n:"גב 6mm",          f:1,  u:"לוח",  p:60 },
                { n:"בורג עץ 4x40",    f:2,  u:"קופסה",p:15 }],
  custom:      [{ n:"בורג עץ 4x40",    f:2,  u:"קופסה",p:15 },
                { n:"פלטות הרכבה",     f:1,  u:"קופסה",p:22 }],
};

function buildHW(type, numDoors, drawers, shelves) {
  return (HW_PRESETS[type]||HW_PRESETS.custom).map(h => {
    let q = h.f||0;
    if (h.byD)  q = numDoors * h.byD;
    if (h.byDr) q = drawers  * h.byDr;
    if (h.byS)  q = shelves  * h.byS;
    return { name:h.n, qty:q, unit:h.u, price:h.p, total:q*h.p };
  }).filter(h=>h.qty>0);
}

// ─── SVG Sketch ───────────────────────────────────────────────────────────────
function Sketch({ type, W, H, D, shelves, drawers, plinth, doorCoversPlinth, lowerH, hasShell, tShell }) {
  const VW = 220, VH = 245, PAD = 26;

  const scale   = Math.min((VW - PAD*2) / W, (VH - PAD*2 - 12) / H);
  const sw = W * scale;
  const sh = H * scale;
  const ox = (VW - sw) / 2;
  const oy = PAD;
  const t  = Math.max(2, Math.min(6, 1.8 * scale));
  const ts = hasShell ? Math.max(2, Math.min(6, (tShell/10) * scale)) : t; // shell thickness in px

  const di = useMemo(
    () => type==="cabinet" ? calcDoors(W, H, plinth, doorCoversPlinth, lowerH, hasShell, tShell) : null,
    [type, W, H, plinth, doorCoversPlinth, lowerH, hasShell, tShell]
  );

  const gold    = "#8b5e00";
  const fill    = "#f5ead0";    // body/carcass fill
  const shellFill="#e8dcc0";    // shell fill (slightly different shade)
  const dfill   = "#ede0bc";    // door fill
  const dim     = "#5a3a10";
  const plinthC = "#d4b870";
  const plinthS = "#8b6010";
  const floorC  = "#6a4a20";
  const shellStroke = "#5a3a00";
  const bodyStroke  = "#8b5e00";

  const els = [];
  let k = 0;

  const dline = (x1,y1,x2,y2) =>
    <line key={k++} x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={gold} strokeWidth={0.6} strokeDasharray="2.5,2" opacity={0.55}/>;

  const hinge = (cx,cy) =>
    <circle key={k++} cx={cx} cy={cy} r={2.2} fill={gold} opacity={0.85}/>;

  if (type==="cabinet" && di) {
    const plinthPx   = plinth * scale;
    const bottomY    = oy + sh;
    const plinthTopY = bottomY - plinthPx;

    if (hasShell) {
      // ── Outer shell: 2 sides + top (no bottom — body sits inside) ──
      // Left side
      els.push(<rect key={k++} x={ox} y={oy} width={ts} height={sh}
        fill={shellFill} stroke={shellStroke} strokeWidth={1.4}/>);
      // Right side
      els.push(<rect key={k++} x={ox+sw-ts} y={oy} width={ts} height={sh}
        fill={shellFill} stroke={shellStroke} strokeWidth={1.4}/>);
      // Top panel
      els.push(<rect key={k++} x={ox+ts} y={oy} width={sw-ts*2} height={ts}
        fill={shellFill} stroke={shellStroke} strokeWidth={1.4}/>);
      // Shell outline (for clarity)
      els.push(<rect key={k++} x={ox} y={oy} width={sw} height={sh}
        fill="none" stroke={shellStroke} strokeWidth={1.8}/>);

      // ── Inner body box ──
      const ibx = ox + ts;
      const iby = oy + ts;
      const ibw = sw - ts*2;
      const ibh = sh - ts;   // shell has no bottom, body goes to floor
      els.push(<rect key={k++} x={ibx} y={iby} width={ibw} height={ibh}
        fill={fill} stroke={bodyStroke} strokeWidth={1}/>);

      // Plinth inside inner body
      if (plinth > 0) {
        const innerPlinthTopY = bottomY - plinthPx;
        els.push(<rect key={k++} x={ibx+1} y={innerPlinthTopY} width={ibw-2} height={plinthPx-1}
          fill={plinthC} stroke={plinthS} strokeWidth={0.8}/>);
        els.push(<line key={k++} x1={ibx+t} y1={innerPlinthTopY} x2={ibx+ibw-t} y2={innerPlinthTopY}
          stroke={plinthS} strokeWidth={1}/>);
        els.push(<text key={k++} x={ibx+ibw/2} y={innerPlinthTopY+plinthPx/2+3}
          textAnchor="middle" fontSize={6.5} fill={plinthS} fontFamily="Georgia,serif">
          צוקל {plinth}
        </text>);
      }

      // Shelves inside inner body
      const shelfTop = iby + t;
      const shelfBot = plinth > 0 ? plinthTopY : iby + ibh - t;
      for (let i=1; i<=shelves; i++) {
        const sy = shelfTop + ((shelfBot-shelfTop)/(shelves+1))*i;
        els.push(<line key={k++} x1={ibx+t} y1={sy} x2={ibx+ibw-t} y2={sy}
          stroke={gold} strokeWidth={0.6} strokeDasharray="2.5,2" opacity={0.55}/>);
      }

      // Shell label
      els.push(<text key={k++} x={ox+ts/2} y={oy+sh/2} textAnchor="middle"
        fontSize={6} fill={shellStroke} fontFamily="Georgia,serif"
        transform={`rotate(-90,${ox+ts/2},${oy+sh/2})`}>מעטפת</text>);

    } else {
      // ── Classic carcass ──
      els.push(<rect key={k++} x={ox} y={oy} width={sw} height={sh}
        fill={fill} stroke={gold} strokeWidth={1.5}/>);
      els.push(dline(ox+t, oy+t, ox+sw-t, oy+t));

      // Plinth
      if (plinth > 0) {
        els.push(<rect key={k++} x={ox+1} y={plinthTopY} width={sw-2} height={plinthPx-1}
          fill={plinthC} stroke={plinthS} strokeWidth={0.8}/>);
        els.push(<line key={k++} x1={ox+t} y1={plinthTopY} x2={ox+sw-t} y2={plinthTopY}
          stroke={plinthS} strokeWidth={1.1}/>);
        els.push(<text key={k++} x={ox+sw/2} y={plinthTopY+plinthPx/2+3}
          textAnchor="middle" fontSize={7} fill={plinthS} fontFamily="Georgia,serif">
          צוקל {plinth} ס"מ
        </text>);
        const rx = ox+sw+5;
        els.push(<line key={k++} x1={rx} y1={plinthTopY} x2={rx} y2={bottomY} stroke={plinthS} strokeWidth={0.7}/>);
        els.push(<line key={k++} x1={rx-2} y1={plinthTopY} x2={rx+2} y2={plinthTopY} stroke={plinthS} strokeWidth={0.7}/>);
        els.push(<line key={k++} x1={rx-2} y1={bottomY} x2={rx+2} y2={bottomY} stroke={plinthS} strokeWidth={0.7}/>);
        els.push(<text key={k++} x={rx+4} y={plinthTopY+plinthPx/2+3} fontSize={6.5} fill={plinthS} fontFamily="Georgia,serif">{plinth}</text>);
      }

      // Shelves
      const shelfZoneTop = oy + t;
      const shelfZoneBot = plinth > 0 ? plinthTopY : oy + sh - t;
      for (let i=1; i<=shelves; i++) {
        const sy = shelfZoneTop + ((shelfZoneBot-shelfZoneTop)/(shelves+1))*i;
        els.push(<line key={k++} x1={ox+t} y1={sy} x2={ox+sw-t} y2={sy}
          stroke={gold} strokeWidth={0.6} strokeDasharray="2.5,2" opacity={0.55}/>);
      }
    }

    // ── Floor line ──
    const floorY = bottomY + 7;
    els.push(<line key={k++} x1={ox-6} y1={floorY} x2={ox+sw+6} y2={floorY}
      stroke={floorC} strokeWidth={1.3} strokeDasharray="4,3"/>);
    els.push(<text key={k++} x={ox+sw/2} y={floorY+9} textAnchor="middle"
      fontSize={7} fill={floorC} fontFamily="Georgia,serif">רצפה</text>);

    // ── Doors ──
    // Door x-zone: inside shell if hasShell
    const doorOx   = hasShell ? ox + ts : ox + t;
    const doorZoneW= hasShell ? sw - ts*2 : sw - t*2;
    const dw       = doorZoneW / di.n;
    const doorBotY = bottomY - (di.doorStart * scale);
    const loH_px   = di.lowerH * scale;
    const upH_px   = di.upperH ? di.upperH * scale : 0;

    for (let d=0; d<di.n; d++) {
      const dx = doorOx + dw * d;
      if (di.rows === 1) {
        const doorTopY = doorBotY - loH_px;
        els.push(<rect key={k++} x={dx+1} y={doorTopY+1} width={dw-2} height={loH_px-2}
          fill={dfill} stroke={gold} strokeWidth={0.9}/>);
        els.push(hinge(dx+4, doorTopY+10));
        els.push(hinge(dx+4, doorTopY+loH_px-10));
      } else {
        const loDoorTopY = doorBotY - loH_px;
        els.push(<rect key={k++} x={dx+1} y={loDoorTopY+1} width={dw-2} height={loH_px-2}
          fill={dfill} stroke={gold} strokeWidth={0.9}/>);
        els.push(hinge(dx+4, loDoorTopY+10));
        els.push(hinge(dx+4, loDoorTopY+loH_px-10));
        const upDoorTopY = loDoorTopY - 0.4*scale - upH_px;
        els.push(<rect key={k++} x={dx+1} y={upDoorTopY+1} width={dw-2} height={upH_px-2}
          fill={dfill} stroke={gold} strokeWidth={0.9}/>);
        els.push(hinge(dx+4, upDoorTopY+10));
        els.push(hinge(dx+4, upDoorTopY+upH_px-10));
        els.push(<line key={k++} x1={dx} y1={loDoorTopY} x2={dx+dw} y2={loDoorTopY}
          stroke={gold} strokeWidth={0.9} strokeDasharray="3,2" opacity={0.8}/>);
      }
    }

    // ── Gap annotation ──
    if (plinth > 0) {
      const gapBot = bottomY;
      const gapTop = doorBotY;
      if (Math.abs(gapTop - gapBot) > 3) {
        const ax = ox - 9;
        els.push(<line key={k++} x1={ax} y1={gapBot} x2={ax} y2={gapTop} stroke={plinthS} strokeWidth={0.7}/>);
        els.push(<line key={k++} x1={ax-2} y1={gapBot} x2={ax+2} y2={gapBot} stroke={plinthS} strokeWidth={0.7}/>);
        els.push(<line key={k++} x1={ax-2} y1={gapTop} x2={ax+2} y2={gapTop} stroke={plinthS} strokeWidth={0.7}/>);
        const gapLabel = doorCoversPlinth ? "1 ס\"מ" : `${(plinth-0.2).toFixed(1)}`;
        els.push(<text key={k++} x={ax-3} y={gapBot+(gapTop-gapBot)/2+3}
          textAnchor="middle" fontSize={6} fill={plinthS} fontFamily="Georgia,serif"
          transform={`rotate(-90,${ax-3},${gapBot+(gapTop-gapBot)/2+3})`}>{gapLabel}</text>);
      }
    }

  } else if (type==="shelf") {
    els.push(<rect key={k++} x={ox} y={oy} width={sw} height={sh} fill={fill} stroke={gold} strokeWidth={1.5}/>);
    for (let i=1; i<=shelves; i++) {
      const sy = oy + t + ((sh-t*2)/(shelves+1)) * i;
      els.push(<line key={k++} x1={ox+t} y1={sy} x2={ox+sw-t} y2={sy} stroke={gold} strokeWidth={1.4}/>);
    }
  } else if (type==="table") {
    const lw=Math.max(4,sw*0.07), th2=sh*0.09, lh=sh*0.78;
    els.push(<rect key={k++} x={ox} y={oy} width={sw} height={th2} fill={fill} stroke={gold} strokeWidth={1.4} rx={1}/>);
    els.push(<rect key={k++} x={ox+lw} y={oy+th2} width={lw} height={lh} fill={fill} stroke={gold} strokeWidth={1}/>);
    els.push(<rect key={k++} x={ox+sw-lw*2} y={oy+th2} width={lw} height={lh} fill={fill} stroke={gold} strokeWidth={1}/>);
    els.push(dline(ox+lw*2, oy+th2+lh*0.4, ox+sw-lw*2, oy+th2+lh*0.4));
  } else if (type==="drawer_unit") {
    els.push(<rect key={k++} x={ox} y={oy} width={sw} height={sh} fill={fill} stroke={gold} strokeWidth={1.5}/>);
    const dc=Math.max(drawers,1), dh=(sh-t*2)/dc;
    for (let i=0; i<dc; i++) {
      const dy = oy+t+dh*i;
      els.push(<rect key={k++} x={ox+t+2} y={dy+2} width={sw-t*2-4} height={dh-4} fill={dfill} stroke={gold} strokeWidth={0.9}/>);
      // no handle on drawers in sketch either - just horizontal line
      els.push(<line key={k++} x1={ox+sw*0.3} y1={dy+dh/2} x2={ox+sw*0.7} y2={dy+dh/2}
        stroke={gold} strokeWidth={0.7} strokeDasharray="2,2" opacity={0.5}/>);
    }
  } else {
    els.push(<rect key={k++} x={ox} y={oy} width={sw} height={sh} fill={fill} stroke={gold} strokeWidth={1.5}/>);
    els.push(dline(ox, oy, ox+sw, oy+sh));
    els.push(dline(ox+sw, oy, ox, oy+sh));
  }

  // ── Dimension annotations ──
  // For cabinet: floor line is at oy+sh+7 with label at +16, so put width arrow at +24
  const aHy = oy + sh + (type==="cabinet" ? 24 : 14);
  const aVx  = ox - 13;
  els.push(
    <g key="ann" fontSize={8.5} fill={dim} fontFamily="Georgia,serif">
      <line x1={ox} y1={aHy} x2={ox+sw} y2={aHy} stroke={dim} strokeWidth={0.7}/>
      <line x1={ox}    y1={aHy-3} x2={ox}    y2={aHy+3} stroke={dim} strokeWidth={0.7}/>
      <line x1={ox+sw} y1={aHy-3} x2={ox+sw} y2={aHy+3} stroke={dim} strokeWidth={0.7}/>
      <text x={ox+sw/2} y={aHy+9} textAnchor="middle">{W} ס"מ</text>
      <line x1={aVx} y1={oy} x2={aVx} y2={oy+sh} stroke={dim} strokeWidth={0.7}/>
      <line x1={aVx-3} y1={oy}    x2={aVx+3} y2={oy}    stroke={dim} strokeWidth={0.7}/>
      <line x1={aVx-3} y1={oy+sh} x2={aVx+3} y2={oy+sh} stroke={dim} strokeWidth={0.7}/>
      <text x={aVx-5} y={oy+sh/2} textAnchor="middle"
        transform={`rotate(-90,${aVx-5},${oy+sh/2})`}>{H} ס"מ</text>
    </g>
  );

  return (
    <svg width="100%" viewBox={`0 0 ${VW} ${VH}`} style={{display:"block"}}>
      <defs>
        <pattern id="wd" width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M0,2.5 Q2.5,1.5 5,2.5" stroke="#c8a060" strokeWidth="0.5" fill="none" opacity="0.5"/>
        </pattern>
      </defs>
      <rect x={ox} y={oy} width={sw} height={sh} fill="url(#wd)"/>
      {els}
    </svg>
  );
}

// ─── Box Interior Preview (small SVG inside card) ─────────────────────────────
function BoxInteriorPreview({ box, cfg }) {
  const VW = 180, VH = 110, PAD = 8;
  const scale = Math.min((VW-PAD*2)/box.W, (VH-PAD*2)/box.H);
  const sw = box.W*scale, sh = box.H*scale;
  const ox = (VW-sw)/2, oy = (VH-sh)/2;
  const t  = 2.5;

  const stroke = "#8b5e00";
  const fill   = "#f5ead0";
  const dfill  = "#ede0bc";
  const accent = "#c4940a";
  const blue   = "#2a5a8b";

  const els = [];
  let k = 0;

  // Carcass
  els.push(<rect key={k++} x={ox} y={oy} width={sw} height={sh} fill={fill} stroke={stroke} strokeWidth={1.2}/>);

  // Door indication based on hinge side
  if (cfg.hingeSide === "left") {
    // hinge on left, opens right — draw 2 dots on left
    els.push(<circle key={k++} cx={ox+3} cy={oy+sh*0.18} r={1.6} fill={accent}/>);
    els.push(<circle key={k++} cx={ox+3} cy={oy+sh*0.82} r={1.6} fill={accent}/>);
  } else if (cfg.hingeSide === "right") {
    els.push(<circle key={k++} cx={ox+sw-3} cy={oy+sh*0.18} r={1.6} fill={accent}/>);
    els.push(<circle key={k++} cx={ox+sw-3} cy={oy+sh*0.82} r={1.6} fill={accent}/>);
  } else {
    // double — both sides
    els.push(<circle key={k++} cx={ox+3} cy={oy+sh*0.18} r={1.6} fill={accent}/>);
    els.push(<circle key={k++} cx={ox+3} cy={oy+sh*0.82} r={1.6} fill={accent}/>);
    els.push(<circle key={k++} cx={ox+sw-3} cy={oy+sh*0.18} r={1.6} fill={accent}/>);
    els.push(<circle key={k++} cx={ox+sw-3} cy={oy+sh*0.82} r={1.6} fill={accent}/>);
    // divider
    els.push(<line key={k++} x1={ox+sw/2} y1={oy} x2={ox+sw/2} y2={oy+sh} stroke={stroke} strokeWidth={0.6} strokeDasharray="2,2" opacity={0.6}/>);
  }

  // Interior
  if (cfg.interior === "shelves") {
    if (cfg.customLayout && cfg.shelfPositions) {
      // Custom positioned shelves
      cfg.shelfPositions.forEach((s) => {
        const sy = oy + sh - s.y * scale; // y from floor → SVG y
        els.push(<line key={k++} x1={ox+t} y1={sy} x2={ox+sw-t} y2={sy}
          stroke={stroke} strokeWidth={1}/>);
      });
    } else {
      for (let i=1; i<=cfg.shelves; i++) {
        const sy = oy + t + ((sh-t*2)/(cfg.shelves+1))*i;
        els.push(<line key={k++} x1={ox+t} y1={sy} x2={ox+sw-t} y2={sy}
          stroke={stroke} strokeWidth={1}/>);
      }
    }
  } else if (cfg.interior === "drawers") {
    if (cfg.customLayout && cfg.drawerPositions) {
      // Custom positioned drawers — each has y (bottom-from-floor) and h (height)
      cfg.drawerPositions.forEach((d) => {
        const top = oy + sh - (d.y + d.h) * scale;
        const dh  = d.h * scale;
        els.push(<rect key={k++} x={ox+t+1} y={top+1} width={sw-t*2-2} height={dh-2}
          fill={dfill} stroke={stroke} strokeWidth={0.7}/>);
        els.push(<line key={k++} x1={ox+sw*0.35} y1={top+dh/2} x2={ox+sw*0.65} y2={top+dh/2}
          stroke={accent} strokeWidth={0.8}/>);
      });
    } else {
      const n = Math.max(cfg.drawers, 1);
      const custom = cfg.customDrawerH && cfg.drawerH > 0;
      const dhCm   = custom ? cfg.drawerH : (box.H / n);
      const dh     = dhCm * scale;
      for (let i=0; i<n; i++) {
        const dy = oy + sh - t - dh*(i+1);
        if (dy < oy + t) break;
        els.push(<rect key={k++} x={ox+t+1} y={dy+1} width={sw-t*2-2} height={dh-2}
          fill={dfill} stroke={stroke} strokeWidth={0.7}/>);
        els.push(<line key={k++} x1={ox+sw*0.35} y1={dy+dh/2} x2={ox+sw*0.65} y2={dy+dh/2}
          stroke={accent} strokeWidth={0.8}/>);
      }
      if (custom) {
        const totalDrH = dhCm * n;
        if (box.H - totalDrH > 0) {
          const freeBottomY = oy + sh - totalDrH * scale;
          els.push(<text key={k++} x={ox+sw/2} y={oy + (freeBottomY-oy)/2 + 3}
            textAnchor="middle" fontSize={6} fill={stroke} fontFamily="Georgia,serif" opacity={0.6}>
            חלל פנוי
          </text>);
        }
      }
    }
  } else if (cfg.interior === "hanging") {
    // Compute rod positions: use saved rodPositions, else smart default (top 10cm below ceiling, halve remaining)
    const computeRods = () => {
      if (cfg.rodPositions) return cfg.rodPositions;
      const n = Math.max(cfg.hangingRods, 1);
      const arr = [Math.max(0, box.H - 10)];
      let bot = 0, top = arr[0];
      for (let i=1; i<n; i++) {
        const mid = (bot+top)/2;
        arr.push(Math.round(mid*2)/2);
        top = mid;
      }
      return arr;
    };
    const rodYs = computeRods();
    rodYs.forEach((cmY, idx) => {
      const ry = oy + sh - cmY * scale;
      els.push(<line key={k++} x1={ox+t+2} y1={ry} x2={ox+sw-t-2} y2={ry}
        stroke={blue} strokeWidth={1.6} strokeLinecap="round"/>);
      for (let h=0; h<3; h++) {
        const hx = ox + sw*0.25 + h*(sw*0.25);
        els.push(<path key={k++} d={`M${hx},${ry} v6 q0,2 -2,2 t-2,2`}
          stroke={blue} strokeWidth={0.6} fill="none" opacity={0.6}/>);
      }
    });
  } else if (cfg.interior === "mixed") {
    // Hanging on top, drawers on bottom
    const drawerSecH = (cfg.mixedTopH/box.H) * sh;
    const hangSecH   = sh - drawerSecH;
    const splitY     = oy + hangSecH;
    // Hanging rod
    const ry = oy + hangSecH/2;
    els.push(<line key={k++} x1={ox+t+2} y1={ry} x2={ox+sw-t-2} y2={ry}
      stroke={blue} strokeWidth={1.6} strokeLinecap="round"/>);
    for (let h=0; h<3; h++) {
      const hx = ox + sw*0.25 + h*(sw*0.25);
      els.push(<path key={k++} d={`M${hx},${ry} v6 q0,2 -2,2 t-2,2`}
        stroke={blue} strokeWidth={0.6} fill="none" opacity={0.6}/>);
    }
    // Divider between sections
    els.push(<line key={k++} x1={ox+t} y1={splitY} x2={ox+sw-t} y2={splitY}
      stroke={stroke} strokeWidth={1.2}/>);
    // Drawers
    const dN = Math.max(cfg.drawers, 1);
    const dh = (drawerSecH-t)/dN;
    for (let i=0; i<dN; i++) {
      const dy = splitY + dh*i;
      els.push(<rect key={k++} x={ox+t+1} y={dy+1} width={sw-t*2-2} height={dh-2}
        fill={dfill} stroke={stroke} strokeWidth={0.7}/>);
      els.push(<line key={k++} x1={ox+sw*0.35} y1={dy+dh/2} x2={ox+sw*0.65} y2={dy+dh/2}
        stroke={accent} strokeWidth={0.8}/>);
    }
  } else if (cfg.interior === "freeform" && cfg.elements) {
    cfg.elements.forEach((el, i) => {
      if (el.type === "drawer") {
        const top = oy + sh - (el.y + el.h) * scale;
        const dh  = el.h * scale;
        els.push(<rect key={k++} x={ox+t+1} y={top+1} width={sw-t*2-2} height={dh-2}
          fill={dfill} stroke={stroke} strokeWidth={0.7}/>);
        els.push(<line key={k++} x1={ox+sw*0.35} y1={top+dh/2} x2={ox+sw*0.65} y2={top+dh/2}
          stroke={accent} strokeWidth={0.8}/>);
      } else if (el.type === "shelf") {
        const sy = oy + sh - el.y * scale;
        els.push(<line key={k++} x1={ox+t} y1={sy} x2={ox+sw-t} y2={sy}
          stroke={stroke} strokeWidth={1.2}/>);
      } else if (el.type === "rod") {
        const ry = oy + sh - el.y * scale;
        els.push(<line key={k++} x1={ox+t+2} y1={ry} x2={ox+sw-t-2} y2={ry}
          stroke={blue} strokeWidth={1.6} strokeLinecap="round"/>);
      }
    });
  }

  return (
    <svg width="100%" viewBox={`0 0 ${VW} ${VH}`}
      style={{display:"block",background:"#faf7f0",borderRadius:5,border:"1px solid #e8dcc8"}}>
      {els}
    </svg>
  );
}

// ─── Draggable Interior Layout Editor ─────────────────────────────────────────
// Big interactive SVG that lets the user drag drawers / shelves freely.
// Coordinate system: y is in cm from the BOTTOM of the box (0 = floor).
function DraggableBoxEditor({ box, cfg, onChange }) {
  const [drag, setDrag] = useState(null); // { type: "drawer"|"shelf", index, startY, currentBottomCm }

  // Big SVG dimensions
  const VW = 380, PAD_X = 60, PAD_TOP = 24, PAD_BOT = 26;
  // Maintain proportional scale based on box dimensions
  const aspectRatio = box.H / box.W;
  const innerW = VW - PAD_X*2;
  const innerH = innerW * (box.H / box.W);
  // Cap maximum height
  const finalInnerH = Math.min(innerH, 480);
  const VH = finalInnerH + PAD_TOP + PAD_BOT;

  const sw = innerW;
  const sh = finalInnerH;
  const ox = PAD_X;
  const oy = PAD_TOP;
  const t  = 4;
  const scaleY = sh / box.H;  // px per cm

  const stroke = "#8b5e00";
  const fill   = "#f5ead0";
  const dfill  = "#ede0bc";
  const accent = "#c4940a";
  const dim    = "#5a3a10";
  const dragC  = "#d65a00";
  const blue   = "#2a5a8b";

  // Convert SVG y → cm-from-bottom
  const svgYtoCm = (svgY) => {
    const yFromTop = svgY - oy;
    const yFromBot = sh - yFromTop;
    return Math.max(0, Math.min(box.H, yFromBot / scaleY));
  };
  // Convert cm-from-bottom → SVG y (top of element)
  const cmToSvgY  = (cm) => oy + sh - cm * scaleY;

  // Initialize positions if missing
  const initDrawers = () => {
    if (cfg.drawerPositions) return cfg.drawerPositions;
    const n = Math.max(cfg.drawers, 1);
    const dh = cfg.customDrawerH ? cfg.drawerH : box.H / n;
    // stack from bottom up
    const arr = [];
    for (let i=0; i<n; i++) {
      arr.push({ y: i * dh, h: dh });
    }
    return arr;
  };
  const initShelves = () => {
    if (cfg.shelfPositions) return cfg.shelfPositions;
    const n = cfg.shelves;
    const arr = [];
    for (let i=1; i<=n; i++) {
      arr.push({ y: (box.H / (n+1)) * i });
    }
    return arr;
  };
  const initElements = () => {
    if (cfg.elements) return cfg.elements;
    return [];
  };
  // Hanging rods: first one defaults to 10cm below top of box, subsequent ones
  // each subdivide the remaining bottom-half space.
  const initRods = () => {
    if (cfg.rodPositions) return cfg.rodPositions.map(y => ({ y }));
    const n = Math.max(cfg.hangingRods || 1, 1);
    const arr = [];
    const firstY = Math.max(0, box.H - 10); // 10cm below top
    arr.push(firstY);
    let remainingBot = 0;            // floor
    let remainingTop = firstY;        // first rod
    for (let i=1; i<n; i++) {
      const mid = (remainingBot + remainingTop) / 2;
      arr.push(Math.round(mid * 2) / 2);
      remainingTop = mid;
    }
    return arr.map(y => ({ y }));
  };

  const drawers  = cfg.interior==="drawers"  ? initDrawers()  : [];
  const shelves  = cfg.interior==="shelves"  ? initShelves()  : [];
  const elements = cfg.interior==="freeform" ? initElements() : [];
  const rods     = cfg.interior==="hanging"  ? initRods()     : [];

  // ── Mouse / Touch handlers ──
  const getPointerY = (e, svgEl) => {
    const rect = svgEl.getBoundingClientRect();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    // viewBox to actual pixel ratio
    const ratio = VH / rect.height;
    return (clientY - rect.top) * ratio;
  };

  const startDrag = (e, type, index) => {
    e.preventDefault();
    e.stopPropagation();
    let initialY = 0;
    if (type === "drawer")  initialY = drawers[index]?.y ?? 0;
    else if (type === "shelf")   initialY = shelves[index]?.y ?? 0;
    else if (type === "rod")     initialY = rods[index]?.y ?? 0;
    else if (type === "element") initialY = elements[index]?.y ?? 0;
    setDrag({ type, index, currentBottomCm: initialY });
  };

  const onMove = (e) => {
    if (!drag) return;
    e.preventDefault();
    const svgEl = e.currentTarget;
    const py = getPointerY(e, svgEl);
    if (drag.type === "drawer") {
      const dr  = drawers[drag.index];
      const dpx = dr.h * scaleY;
      let bottomYcm = svgYtoCm(py + dpx/2);
      bottomYcm = Math.round(bottomYcm * 2) / 2;
      bottomYcm = Math.max(0, Math.min(box.H - dr.h, bottomYcm));
      const newDrawers = [...drawers];
      newDrawers[drag.index] = { ...dr, y: bottomYcm };
      onChange({ drawerPositions: newDrawers, customLayout: true });
      setDrag({ ...drag, currentBottomCm: bottomYcm });
    } else if (drag.type === "shelf") {
      let yCm = svgYtoCm(py);
      yCm = Math.round(yCm * 2) / 2;
      yCm = Math.max(2, Math.min(box.H - 2, yCm));
      const newShelves = [...shelves];
      newShelves[drag.index] = { ...newShelves[drag.index], y: yCm };
      onChange({ shelfPositions: newShelves, customLayout: true });
      setDrag({ ...drag, currentBottomCm: yCm });
    } else if (drag.type === "rod") {
      let yCm = svgYtoCm(py);
      yCm = Math.round(yCm * 2) / 2;
      yCm = Math.max(2, Math.min(box.H - 2, yCm));
      const newRods = rods.map(r => r.y);
      newRods[drag.index] = yCm;
      onChange({ rodPositions: newRods });
      setDrag({ ...drag, currentBottomCm: yCm });
    } else if (drag.type === "element") {
      const el = elements[drag.index];
      const newElements = [...elements];
      if (el.type === "drawer") {
        const dpx = (el.h || 20) * scaleY;
        let bottomYcm = svgYtoCm(py + dpx/2);
        bottomYcm = Math.round(bottomYcm * 2) / 2;
        bottomYcm = Math.max(0, Math.min(box.H - (el.h || 20), bottomYcm));
        newElements[drag.index] = { ...el, y: bottomYcm };
        onChange({ elements: newElements });
        setDrag({ ...drag, currentBottomCm: bottomYcm });
      } else {
        // shelf or rod — point-position
        let yCm = svgYtoCm(py);
        yCm = Math.round(yCm * 2) / 2;
        yCm = Math.max(2, Math.min(box.H - 2, yCm));
        newElements[drag.index] = { ...el, y: yCm };
        onChange({ elements: newElements });
        setDrag({ ...drag, currentBottomCm: yCm });
      }
    }
  };

  const endDrag = () => setDrag(null);

  // ── Build SVG elements ──
  const els = [];
  let k = 0;

  // Wood-grain bg pattern
  els.push(<rect key={k++} x={ox} y={oy} width={sw} height={sh} fill={fill}
    stroke={stroke} strokeWidth={1.6} rx={2}/>);
  // Inner ruler ticks (every 10cm)
  for (let cm=10; cm<box.H; cm+=10) {
    const y = cmToSvgY(cm);
    const isMajor = cm % 50 === 0;
    els.push(<line key={k++} x1={ox} y1={y} x2={ox+(isMajor?7:4)} y2={y}
      stroke={dim} strokeWidth={0.5} opacity={0.5}/>);
    if (isMajor) {
      els.push(<text key={k++} x={ox-3} y={y+3} textAnchor="end" fontSize={7}
        fill={dim} fontFamily="Georgia,serif" opacity={0.7}>{cm}</text>);
    }
  }

  // Hinges based on side
  const hX_left  = ox + 4;
  const hX_right = ox + sw - 4;
  const hingeY1  = oy + sh*0.12;
  const hingeY2  = oy + sh*0.88;
  if (cfg.hingeSide==="left" || cfg.hingeSide==="double") {
    els.push(<circle key={k++} cx={hX_left} cy={hingeY1} r={2.6} fill={accent}/>);
    els.push(<circle key={k++} cx={hX_left} cy={hingeY2} r={2.6} fill={accent}/>);
  }
  if (cfg.hingeSide==="right" || cfg.hingeSide==="double") {
    els.push(<circle key={k++} cx={hX_right} cy={hingeY1} r={2.6} fill={accent}/>);
    els.push(<circle key={k++} cx={hX_right} cy={hingeY2} r={2.6} fill={accent}/>);
  }
  if (cfg.hingeSide==="double") {
    els.push(<line key={k++} x1={ox+sw/2} y1={oy+t} x2={ox+sw/2} y2={oy+sh-t}
      stroke={stroke} strokeWidth={0.7} strokeDasharray="3,2" opacity={0.5}/>);
  }

  // Drawers (draggable)
  drawers.forEach((d, i) => {
    const yTop = cmToSvgY(d.y + d.h);
    const dh   = d.h * scaleY;
    const isDragging = drag?.type==="drawer" && drag.index===i;
    els.push(
      <g key={k++}
        style={{cursor:"ns-resize"}}
        onMouseDown={(e)=>startDrag(e,"drawer",i)}
        onTouchStart={(e)=>startDrag(e,"drawer",i)}>
        <rect x={ox+t} y={yTop} width={sw-t*2} height={dh}
          fill={dfill} stroke={isDragging?dragC:stroke} strokeWidth={isDragging?2:1}/>
        {/* handle */}
        <line x1={ox+sw*0.35} y1={yTop+dh/2} x2={ox+sw*0.65} y2={yTop+dh/2}
          stroke={accent} strokeWidth={2} strokeLinecap="round"/>
        {/* drawer label */}
        <text x={ox+sw/2} y={yTop+dh/2-4} textAnchor="middle" fontSize={9}
          fill={dim} fontFamily="Georgia,serif" pointerEvents="none">
          מגירה {i+1}
        </text>
        <text x={ox+sw/2} y={yTop+dh/2+8} textAnchor="middle" fontSize={8}
          fill={dim} fontFamily="Georgia,serif" pointerEvents="none">
          {d.h} ס"מ
        </text>
        {/* bottom-from-floor indicator on right side */}
        {isDragging && (
          <g pointerEvents="none">
            <line x1={ox+sw} y1={oy+sh} x2={ox+sw+30} y2={oy+sh} stroke={dragC} strokeWidth={1}/>
            <line x1={ox+sw+22} y1={oy+sh} x2={ox+sw+22} y2={cmToSvgY(d.y)} stroke={dragC} strokeWidth={1.5}/>
            <line x1={ox+sw+18} y1={cmToSvgY(d.y)} x2={ox+sw+26} y2={cmToSvgY(d.y)} stroke={dragC} strokeWidth={1.5}/>
            <rect x={ox+sw+30} y={cmToSvgY(d.y)-9} width={50} height={18}
              fill="#fff" stroke={dragC} strokeWidth={1.5} rx={3}/>
            <text x={ox+sw+55} y={cmToSvgY(d.y)+3} textAnchor="middle" fontSize={10}
              fill={dragC} fontFamily="Georgia,serif" fontWeight="bold">
              {d.y.toFixed(1)} ס"מ
            </text>
          </g>
        )}
      </g>
    );
  });

  // ── Drawer gaps: distances between consecutive drawers + floor/ceiling
  if (cfg.interior === "drawers" && drawers.length > 0) {
    const gapColor = "#5a8b6a";
    const gapBg    = "#edf7ea";
    // Sort drawers by their bottom y
    const sorted = [...drawers].sort((a,b)=>a.y - b.y);
    // Build stops: 0 (floor) → drawer1.bottom → drawer1.top → drawer2.bottom → ... → drawerN.top → box.H (ceiling)
    const stops = [0];
    sorted.forEach(d => { stops.push(d.y); stops.push(d.y + d.h); });
    stops.push(box.H);
    // Each consecutive pair (stops[i], stops[i+1]) is either a drawer (skip) or a gap (show)
    // Skip indices that fall INSIDE a drawer (i.e. odd positions starting from 1)
    // Actually: stops alternate gap-drawer-gap-drawer-...-gap
    // i=0: floor → first drawer bottom    = GAP
    // i=1: first drawer bottom → top      = DRAWER (skip)
    // i=2: drawer top → next drawer bot   = GAP
    // ...
    // So show gaps where i is even
    const lineX = ox + 14;
    for (let i=0; i<stops.length-1; i++) {
      if (i % 2 !== 0) continue; // skip drawer slots
      const y1 = stops[i];
      const y2 = stops[i+1];
      const gapCm = Math.round((y2 - y1) * 10) / 10;
      if (gapCm <= 0) continue;
      const y1px = cmToSvgY(y1);
      const y2px = cmToSvgY(y2);
      const midY = (y1px + y2px) / 2;
      const gapHeightPx = y1px - y2px;
      if (gapHeightPx < 12) continue;
      els.push(
        <g key={`dgap-${i}`} pointerEvents="none">
          <line x1={lineX} y1={y2px+1} x2={lineX} y2={y1px-1}
            stroke={gapColor} strokeWidth={0.7} opacity={0.8}/>
          <polygon points={`${lineX-2.5},${y2px+4} ${lineX+2.5},${y2px+4} ${lineX},${y2px+1}`}
            fill={gapColor} opacity={0.85}/>
          <polygon points={`${lineX-2.5},${y1px-4} ${lineX+2.5},${y1px-4} ${lineX},${y1px-1}`}
            fill={gapColor} opacity={0.85}/>
          <rect x={lineX+4} y={midY-7} width={32} height={14}
            fill={gapBg} stroke={gapColor} strokeWidth={0.8} rx={3} opacity={0.95}/>
          <text x={lineX+20} y={midY+3} textAnchor="middle" fontSize={8.5}
            fill="#2a5a20" fontFamily="Georgia,serif" fontWeight="bold">
            {gapCm}
          </text>
        </g>
      );
    }
  }

  // Shelves (draggable)
  shelves.forEach((s, i) => {
    const y = cmToSvgY(s.y);
    const isDragging = drag?.type==="shelf" && drag.index===i;
    els.push(
      <g key={k++}
        style={{cursor:"ns-resize"}}
        onMouseDown={(e)=>startDrag(e,"shelf",i)}
        onTouchStart={(e)=>startDrag(e,"shelf",i)}>
        {/* invisible hit-zone */}
        <rect x={ox+t} y={y-7} width={sw-t*2} height={14} fill="transparent"/>
        {/* shelf line */}
        <rect x={ox+t} y={y-2} width={sw-t*2} height={4}
          fill={isDragging?dragC:"#a87838"} stroke={isDragging?dragC:stroke}
          strokeWidth={isDragging?1.5:0.8}/>
        <text x={ox+sw/2} y={y-5} textAnchor="middle" fontSize={9}
          fill={dim} fontFamily="Georgia,serif" pointerEvents="none" fontWeight="bold">
          מדף {i+1} · {s.y.toFixed(1)} ס"מ
        </text>
        {/* dragging indicator */}
        {isDragging && (
          <g pointerEvents="none">
            <line x1={ox+sw} y1={oy+sh} x2={ox+sw+30} y2={oy+sh} stroke={dragC} strokeWidth={1}/>
            <line x1={ox+sw+22} y1={oy+sh} x2={ox+sw+22} y2={y} stroke={dragC} strokeWidth={1.5}/>
            <line x1={ox+sw+18} y1={y} x2={ox+sw+26} y2={y} stroke={dragC} strokeWidth={1.5}/>
            <rect x={ox+sw+30} y={y-9} width={50} height={18}
              fill="#fff" stroke={dragC} strokeWidth={1.5} rx={3}/>
            <text x={ox+sw+55} y={y+3} textAnchor="middle" fontSize={10}
              fill={dragC} fontFamily="Georgia,serif" fontWeight="bold">
              {s.y.toFixed(1)} ס"מ
            </text>
          </g>
        )}
      </g>
    );
  });

  // ── Shelf gaps: show distance between every pair of consecutive shelves,
  //    plus floor → bottom shelf, and top shelf → ceiling. Always visible.
  if (cfg.interior === "shelves" && shelves.length > 0) {
    const gapColor = "#5a8b6a";  // soft green
    const gapBg    = "#edf7ea";
    // sort shelves by their cm y (low to high)
    const sortedShelves = [...shelves].sort((a,b)=>a.y - b.y);
    // stops in cm: 0 (floor), each shelf y, box.H (ceiling)
    const stops = [0, ...sortedShelves.map(s=>s.y), box.H];
    // labels for each gap
    const gapLabels = stops.slice(0,-1).map((y1, idx) => {
      const y2 = stops[idx+1];
      const gapCm = Math.round((y2 - y1) * 10) / 10;
      const isBottom = idx === 0;
      const isTop    = idx === stops.length - 2;
      const tag = isBottom ? "תחתית" : isTop ? "עליון" : `${idx}↔${idx+1}`;
      return { y1, y2, gapCm, tag };
    });

    // Render each gap with vertical arrow + bubble label inside the carcass on the LEFT side
    const gapXcenter = ox + 14;  // a bit inside from left edge
    const lineX      = gapXcenter;
    gapLabels.forEach((g, idx) => {
      const y1px = cmToSvgY(g.y1);
      const y2px = cmToSvgY(g.y2);
      const midY = (y1px + y2px) / 2;
      const gapHeightPx = y1px - y2px; // y1 is lower (larger SVG y), y2 higher

      // Skip if gap visual height is too small for a label
      if (gapHeightPx < 12) return;

      els.push(
        <g key={`gap-${idx}`} pointerEvents="none">
          {/* vertical line */}
          <line x1={lineX} y1={y2px+1} x2={lineX} y2={y1px-1}
            stroke={gapColor} strokeWidth={0.7} opacity={0.8}/>
          {/* arrowheads */}
          <polygon points={`${lineX-2.5},${y2px+4} ${lineX+2.5},${y2px+4} ${lineX},${y2px+1}`}
            fill={gapColor} opacity={0.85}/>
          <polygon points={`${lineX-2.5},${y1px-4} ${lineX+2.5},${y1px-4} ${lineX},${y1px-1}`}
            fill={gapColor} opacity={0.85}/>
          {/* bubble label */}
          <rect x={lineX+4} y={midY-7} width={32} height={14}
            fill={gapBg} stroke={gapColor} strokeWidth={0.8} rx={3} opacity={0.95}/>
          <text x={lineX+20} y={midY+3} textAnchor="middle" fontSize={8.5}
            fill="#2a5a20" fontFamily="Georgia,serif" fontWeight="bold">
            {g.gapCm}
          </text>
        </g>
      );
    });
  }

  // ── Hanging rods (draggable) ──
  if (cfg.interior === "hanging" && rods.length > 0) {
    rods.forEach((r, i) => {
      const y = cmToSvgY(r.y);
      const isDragging = drag?.type==="rod" && drag.index===i;
      els.push(
        <g key={`rod-${i}`}
          style={{cursor:"ns-resize"}}
          onMouseDown={(e)=>startDrag(e,"rod",i)}
          onTouchStart={(e)=>startDrag(e,"rod",i)}>
          {/* hit area */}
          <rect x={ox+t} y={y-12} width={sw-t*2} height={24} fill="transparent"/>
          {/* rod */}
          <line x1={ox+t+3} y1={y} x2={ox+sw-t-3} y2={y}
            stroke={isDragging?dragC:blue} strokeWidth={isDragging?3.2:2.4} strokeLinecap="round"/>
          {/* end caps */}
          <circle cx={ox+t+3} cy={y} r={2.4} fill={isDragging?dragC:blue}/>
          <circle cx={ox+sw-t-3} cy={y} r={2.4} fill={isDragging?dragC:blue}/>
          {/* hangers */}
          {[0.25, 0.45, 0.65, 0.85].map((p, hi) => (
            <path key={hi} d={`M${ox+sw*p},${y} v8 q0,2 -2,2 t-2,2`}
              stroke={isDragging?dragC:blue} strokeWidth={0.7} fill="none" opacity={0.55}
              pointerEvents="none"/>
          ))}
          <text x={ox+sw/2} y={y-5} textAnchor="middle" fontSize={9}
            fill={isDragging?dragC:"#1a3a6a"} fontFamily="Georgia,serif"
            pointerEvents="none" fontWeight="bold">
            👔 מוט {i+1} · {r.y.toFixed(1)} ס"מ
          </text>
          {isDragging && (
            <g pointerEvents="none">
              <line x1={ox+sw} y1={oy+sh} x2={ox+sw+30} y2={oy+sh} stroke={dragC} strokeWidth={1}/>
              <line x1={ox+sw+22} y1={oy+sh} x2={ox+sw+22} y2={y} stroke={dragC} strokeWidth={1.5}/>
              <line x1={ox+sw+18} y1={y} x2={ox+sw+26} y2={y} stroke={dragC} strokeWidth={1.5}/>
              <rect x={ox+sw+30} y={y-9} width={50} height={18}
                fill="#fff" stroke={dragC} strokeWidth={1.5} rx={3}/>
              <text x={ox+sw+55} y={y+3} textAnchor="middle" fontSize={10}
                fill={dragC} fontFamily="Georgia,serif" fontWeight="bold">
                {r.y.toFixed(1)} ס"מ
              </text>
            </g>
          )}
        </g>
      );
    });

    // Gap indicators between rods (and floor/ceiling)
    const gapColor = "#5a8b6a";
    const gapBg    = "#edf7ea";
    const sortedRods = [...rods].sort((a,b)=>a.y - b.y);
    const stops = [0, ...sortedRods.map(r=>r.y), box.H];
    const lineX = ox + 14;
    for (let i=0; i<stops.length-1; i++) {
      const y1 = stops[i];
      const y2 = stops[i+1];
      const gapCm = Math.round((y2 - y1) * 10) / 10;
      if (gapCm <= 0) continue;
      const y1px = cmToSvgY(y1);
      const y2px = cmToSvgY(y2);
      const midY = (y1px + y2px) / 2;
      if (y1px - y2px < 12) continue;
      els.push(
        <g key={`rgap-${i}`} pointerEvents="none">
          <line x1={lineX} y1={y2px+1} x2={lineX} y2={y1px-1}
            stroke={gapColor} strokeWidth={0.7} opacity={0.8}/>
          <polygon points={`${lineX-2.5},${y2px+4} ${lineX+2.5},${y2px+4} ${lineX},${y2px+1}`}
            fill={gapColor} opacity={0.85}/>
          <polygon points={`${lineX-2.5},${y1px-4} ${lineX+2.5},${y1px-4} ${lineX},${y1px-1}`}
            fill={gapColor} opacity={0.85}/>
          <rect x={lineX+4} y={midY-7} width={32} height={14}
            fill={gapBg} stroke={gapColor} strokeWidth={0.8} rx={3} opacity={0.95}/>
          <text x={lineX+20} y={midY+3} textAnchor="middle" fontSize={8.5}
            fill="#2a5a20" fontFamily="Georgia,serif" fontWeight="bold">
            {gapCm}
          </text>
        </g>
      );
    }
  }

  // ── Freeform elements (mixed drawers + shelves + rods, all draggable) ──
  if (cfg.interior === "freeform") {
    elements.forEach((el, i) => {
      const isDragging = drag?.type==="element" && drag.index===i;
      if (el.type === "drawer") {
        const yTop = cmToSvgY(el.y + el.h);
        const dh   = el.h * scaleY;
        els.push(
          <g key={`fe-${i}`}
            style={{cursor:"ns-resize"}}
            onMouseDown={(e)=>startDrag(e,"element",i)}
            onTouchStart={(e)=>startDrag(e,"element",i)}>
            <rect x={ox+t} y={yTop} width={sw-t*2} height={dh}
              fill={dfill} stroke={isDragging?dragC:stroke} strokeWidth={isDragging?2:1}/>
            <line x1={ox+sw*0.35} y1={yTop+dh/2} x2={ox+sw*0.65} y2={yTop+dh/2}
              stroke={accent} strokeWidth={2} strokeLinecap="round"/>
            <text x={ox+sw/2} y={yTop+dh/2-3} textAnchor="middle" fontSize={9}
              fill={dim} fontFamily="Georgia,serif" pointerEvents="none">
              🗃️ מגירה {el.h}ס"מ
            </text>
            {isDragging && (
              <g pointerEvents="none">
                <line x1={ox+sw} y1={oy+sh} x2={ox+sw+30} y2={oy+sh} stroke={dragC} strokeWidth={1}/>
                <line x1={ox+sw+22} y1={oy+sh} x2={ox+sw+22} y2={cmToSvgY(el.y)} stroke={dragC} strokeWidth={1.5}/>
                <line x1={ox+sw+18} y1={cmToSvgY(el.y)} x2={ox+sw+26} y2={cmToSvgY(el.y)} stroke={dragC} strokeWidth={1.5}/>
                <rect x={ox+sw+30} y={cmToSvgY(el.y)-9} width={50} height={18}
                  fill="#fff" stroke={dragC} strokeWidth={1.5} rx={3}/>
                <text x={ox+sw+55} y={cmToSvgY(el.y)+3} textAnchor="middle" fontSize={10}
                  fill={dragC} fontFamily="Georgia,serif" fontWeight="bold">
                  {el.y.toFixed(1)} ס"מ
                </text>
              </g>
            )}
          </g>
        );
      } else if (el.type === "shelf") {
        const y = cmToSvgY(el.y);
        els.push(
          <g key={`fe-${i}`}
            style={{cursor:"ns-resize"}}
            onMouseDown={(e)=>startDrag(e,"element",i)}
            onTouchStart={(e)=>startDrag(e,"element",i)}>
            <rect x={ox+t} y={y-7} width={sw-t*2} height={14} fill="transparent"/>
            <rect x={ox+t} y={y-2} width={sw-t*2} height={4}
              fill={isDragging?dragC:"#a87838"} stroke={isDragging?dragC:stroke}
              strokeWidth={isDragging?1.5:0.8}/>
            <text x={ox+sw/2} y={y-5} textAnchor="middle" fontSize={9}
              fill={dim} fontFamily="Georgia,serif" pointerEvents="none" fontWeight="bold">
              📚 מדף · {el.y.toFixed(1)} ס"מ
            </text>
            {isDragging && (
              <g pointerEvents="none">
                <line x1={ox+sw} y1={oy+sh} x2={ox+sw+30} y2={oy+sh} stroke={dragC} strokeWidth={1}/>
                <line x1={ox+sw+22} y1={oy+sh} x2={ox+sw+22} y2={y} stroke={dragC} strokeWidth={1.5}/>
                <line x1={ox+sw+18} y1={y} x2={ox+sw+26} y2={y} stroke={dragC} strokeWidth={1.5}/>
                <rect x={ox+sw+30} y={y-9} width={50} height={18}
                  fill="#fff" stroke={dragC} strokeWidth={1.5} rx={3}/>
                <text x={ox+sw+55} y={y+3} textAnchor="middle" fontSize={10}
                  fill={dragC} fontFamily="Georgia,serif" fontWeight="bold">
                  {el.y.toFixed(1)} ס"מ
                </text>
              </g>
            )}
          </g>
        );
      } else if (el.type === "rod") {
        const y = cmToSvgY(el.y);
        els.push(
          <g key={`fe-${i}`}
            style={{cursor:"ns-resize"}}
            onMouseDown={(e)=>startDrag(e,"element",i)}
            onTouchStart={(e)=>startDrag(e,"element",i)}>
            <rect x={ox+t} y={y-9} width={sw-t*2} height={18} fill="transparent"/>
            <line x1={ox+t+3} y1={y} x2={ox+sw-t-3} y2={y}
              stroke={isDragging?dragC:blue} strokeWidth={isDragging?3:2.4} strokeLinecap="round"/>
            {/* hangers */}
            {[0.3, 0.5, 0.7].map((p, hi) => (
              <path key={hi} d={`M${ox+sw*p},${y} v8 q0,2 -2,2 t-2,2`}
                stroke={isDragging?dragC:blue} strokeWidth={0.8} fill="none" opacity={0.6} pointerEvents="none"/>
            ))}
            <text x={ox+sw/2} y={y-4} textAnchor="middle" fontSize={9}
              fill={isDragging?dragC:"#1a3a6a"} fontFamily="Georgia,serif" pointerEvents="none" fontWeight="bold">
              👔 מוט תליה · {el.y.toFixed(1)} ס"מ
            </text>
            {isDragging && (
              <g pointerEvents="none">
                <line x1={ox+sw} y1={oy+sh} x2={ox+sw+30} y2={oy+sh} stroke={dragC} strokeWidth={1}/>
                <line x1={ox+sw+22} y1={oy+sh} x2={ox+sw+22} y2={y} stroke={dragC} strokeWidth={1.5}/>
                <line x1={ox+sw+18} y1={y} x2={ox+sw+26} y2={y} stroke={dragC} strokeWidth={1.5}/>
                <rect x={ox+sw+30} y={y-9} width={50} height={18}
                  fill="#fff" stroke={dragC} strokeWidth={1.5} rx={3}/>
                <text x={ox+sw+55} y={y+3} textAnchor="middle" fontSize={10}
                  fill={dragC} fontFamily="Georgia,serif" fontWeight="bold">
                  {el.y.toFixed(1)} ס"מ
                </text>
              </g>
            )}
          </g>
        );
      }
    });

    // Gap indicators for freeform: distances between consecutive horizontal markers
    // Build sorted list of "horizontal lines" — for each element, get its low/high cm
    const lines = []; // { y: cm, kind: "boundary" }
    elements.forEach(el => {
      if (el.type === "drawer") {
        lines.push({ y: el.y });
        lines.push({ y: el.y + el.h });
      } else {
        lines.push({ y: el.y }); // shelf or rod = single line
      }
    });
    lines.push({ y: 0 });        // floor
    lines.push({ y: box.H });    // ceiling
    // Dedupe and sort
    const uniqueY = [...new Set(lines.map(l => l.y))].sort((a,b)=>a-b);

    const gapColor = "#5a8b6a";
    const gapBg    = "#edf7ea";
    const lineX    = ox + 14;
    for (let i=0; i<uniqueY.length-1; i++) {
      const y1 = uniqueY[i];
      const y2 = uniqueY[i+1];
      const gapCm = Math.round((y2 - y1) * 10) / 10;
      // Skip zero gaps (e.g. drawer touching another)
      if (gapCm <= 0) continue;
      // Check whether this segment is INSIDE a drawer (skip if so)
      const insideDrawer = elements.some(el =>
        el.type === "drawer" && el.y < y2 - 0.001 && (el.y + el.h) > y1 + 0.001);
      if (insideDrawer) continue;

      const y1px = cmToSvgY(y1);
      const y2px = cmToSvgY(y2);
      const midY = (y1px + y2px) / 2;
      if (y1px - y2px < 12) continue;
      els.push(
        <g key={`fgap-${i}`} pointerEvents="none">
          <line x1={lineX} y1={y2px+1} x2={lineX} y2={y1px-1}
            stroke={gapColor} strokeWidth={0.7} opacity={0.8}/>
          <polygon points={`${lineX-2.5},${y2px+4} ${lineX+2.5},${y2px+4} ${lineX},${y2px+1}`}
            fill={gapColor} opacity={0.85}/>
          <polygon points={`${lineX-2.5},${y1px-4} ${lineX+2.5},${y1px-4} ${lineX},${y1px-1}`}
            fill={gapColor} opacity={0.85}/>
          <rect x={lineX+4} y={midY-7} width={32} height={14}
            fill={gapBg} stroke={gapColor} strokeWidth={0.8} rx={3} opacity={0.95}/>
          <text x={lineX+20} y={midY+3} textAnchor="middle" fontSize={8.5}
            fill="#2a5a20" fontFamily="Georgia,serif" fontWeight="bold">
            {gapCm}
          </text>
        </g>
      );
    }
  }

  // Floor line + label
  els.push(<line key={k++} x1={ox} y1={oy+sh} x2={ox+sw} y2={oy+sh}
    stroke={dim} strokeWidth={1.2}/>);
  els.push(<text key={k++} x={ox+sw/2} y={oy+sh+14} textAnchor="middle"
    fontSize={9} fill={dim} fontFamily="Georgia,serif">תחתית הקופסה</text>);

  // Total dimension on left
  els.push(
    <g key="dim" pointerEvents="none">
      <line x1={ox-12} y1={oy} x2={ox-12} y2={oy+sh} stroke={dim} strokeWidth={0.8}/>
      <line x1={ox-15} y1={oy} x2={ox-9} y2={oy} stroke={dim} strokeWidth={0.8}/>
      <line x1={ox-15} y1={oy+sh} x2={ox-9} y2={oy+sh} stroke={dim} strokeWidth={0.8}/>
      <text x={ox-17} y={oy+sh/2+3} textAnchor="middle" fontSize={9}
        fill={dim} fontFamily="Georgia,serif"
        transform={`rotate(-90,${ox-17},${oy+sh/2+3})`}>{box.H} ס"מ</text>
    </g>
  );

  return (
    <svg width="100%" viewBox={`0 0 ${VW} ${VH}`}
      style={{display:"block",background:"#faf7f0",borderRadius:8,
        border:"1px solid #e8dcc8",userSelect:"none",touchAction:"none"}}
      onMouseMove={onMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onTouchMove={onMove}
      onTouchEnd={endDrag}>
      {els}
    </svg>
  );
}

// ─── Box Edit Modal ───────────────────────────────────────────────────────────
function BoxEditModal({ box, cfg, onChange, onClose, isOnly }) {
  if (!box) return null;
  const overlay = {
    position:"fixed", top:0, left:0, right:0, bottom:0,
    background:"rgba(20,12,4,0.65)", display:"flex",
    alignItems:"center", justifyContent:"center", zIndex:1000, padding:16,
    backdropFilter:"blur(3px)",
  };
  const modal = {
    background:"#fff", borderRadius:12, padding:0,
    maxWidth:520, width:"100%", maxHeight:"90vh", overflowY:"auto",
    boxShadow:"0 12px 40px rgba(0,0,0,0.4)",
    direction:"rtl",
  };
  const head = {
    background:"linear-gradient(135deg,#5a3a10,#8b6914)", color:"#fff",
    padding:"14px 20px", borderRadius:"12px 12px 0 0",
    display:"flex", justifyContent:"space-between", alignItems:"center",
  };
  const body = { padding:"18px 20px" };
  const section = { marginBottom:18 };
  const sectionTitle = { fontSize:13, fontWeight:"bold", color:"#5a3a10", marginBottom:8,
                          paddingBottom:5, borderBottom:"1px solid #e8dcc8" };
  const optionGrid = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 };
  const optBtn = (sel) => ({
    padding:"10px 6px", background:sel?"#fff3d0":"#faf7f0",
    border:`2px solid ${sel?"#c4940a":"#d8c8a8"}`, borderRadius:8,
    color:sel?"#5a3000":"#5a3a10", fontWeight:"600", fontSize:12,
    cursor:"pointer", fontFamily:"inherit", textAlign:"center",
  });
  const inp = {
    width:"100%", background:"#fff", border:"2px solid #c8b898", borderRadius:6,
    padding:"8px 10px", color:"#1a1008", fontSize:14, fontFamily:"inherit", boxSizing:"border-box",
  };
  const lbl = { fontSize:11, color:"#6a4a20", display:"block", marginBottom:4, fontWeight:"600" };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e=>e.stopPropagation()}>
        <div style={head}>
          <div>
            <div style={{fontSize:11,opacity:0.85}}>עריכת קופסה</div>
            <div style={{fontSize:17,fontWeight:"bold"}}>📦 {box.label}</div>
            <div style={{fontSize:11,marginTop:2,opacity:0.9}}>{box.W} × {box.H} × {box.D} ס"מ</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",
            color:"#fff",fontSize:24,cursor:"pointer",padding:"0 8px",lineHeight:1}}>✕</button>
        </div>

        <div style={body}>
          {/* Live preview / Draggable editor */}
          {(cfg.interior==="freeform") || (cfg.interior==="hanging") || (cfg.customLayout && (cfg.interior==="drawers" || cfg.interior==="shelves")) ? (
            <div style={{marginBottom:16}}>
              <div style={{padding:"7px 12px",background:"#fff8e8",borderRadius:7,
                border:"1px solid #c4940a",fontSize:11,color:"#5a3000",marginBottom:8,fontWeight:"600"}}>
                🖐️ {cfg.interior==="freeform"
                    ? "הוסף אלמנטים מהכפתורים למטה וגרור לעמדה הרצויה"
                  : cfg.interior==="hanging"
                    ? "גרור את מוטות התליה למיקום הרצוי"
                    : `גרור את ה${cfg.interior==="drawers"?"מגירות":"מדפים"} למיקום הרצוי`}
                {" "}| הצמדה לכל 0.5 ס"מ
              </div>
              <DraggableBoxEditor box={box} cfg={cfg} onChange={onChange}/>
            </div>
          ) : (
            <div style={{marginBottom:16,background:"#faf7f0",borderRadius:8,padding:8,
              border:"1px solid #e8dcc8"}}>
              <BoxInteriorPreview box={box} cfg={cfg} />
            </div>
          )}

          {/* Hinges */}
          <div style={section}>
            <div style={sectionTitle}>🚪 מיקום צירים</div>
            <div style={optionGrid}>
              {[
                ["right","ציר ימין","🔘◀"],
                ["left", "ציר שמאל","▶🔘"],
                ["double","ציר כפול","🔘 ▶◀ 🔘"],
              ].map(([val,lblTxt,icon])=>(
                <button key={val} style={optBtn(cfg.hingeSide===val)}
                  onClick={()=>onChange({hingeSide:val})}>
                  <div style={{fontSize:14,marginBottom:3}}>{icon}</div>
                  {lblTxt}
                </button>
              ))}
            </div>
          </div>

          {/* Interior layout */}
          <div style={section}>
            <div style={sectionTitle}>📐 חלוקה פנימית</div>
            <div style={{...optionGrid, gridTemplateColumns:"1fr 1fr"}}>
              {[
                ["shelves","מדפים","📚"],
                ["drawers","מגירות","🗃️"],
                ["hanging","תליה","👔"],
                ["mixed",  "תליה + מגירות","👔🗃️"],
                ["freeform","חופשי — שלב הכל","🎨"],
              ].map(([val,lblTxt,icon])=>(
                <button key={val} style={{
                  ...optBtn(cfg.interior===val),
                  ...(val==="freeform" && cfg.interior===val ? {borderColor:"#a02080",background:"#fff0f5",color:"#700050"} : {}),
                  ...(val==="freeform" && cfg.interior!==val ? {borderColor:"#c060a0"} : {}),
                }}
                  onClick={()=>onChange({interior:val})}>
                  <div style={{fontSize:18,marginBottom:3}}>{icon}</div>
                  {lblTxt}
                </button>
              ))}
            </div>
          </div>

          {/* Interior details */}
          <div style={section}>
            {cfg.interior==="shelves" && (
              <>
                <label style={lbl}>מספר מדפים</label>
                <input type="number" min={0} max={20} value={cfg.shelves}
                  style={{...inp, opacity: cfg.customLayout ? 0.55 : 1}}
                  disabled={cfg.customLayout}
                  onChange={e=>{
                    const n = +e.target.value;
                    // reset positions when count changes
                    onChange({shelves:n, shelfPositions:null});
                  }}/>

                {/* Custom layout (drag) toggle */}
                <div style={{marginTop:12,padding:"10px 12px",background:"#fff8e8",
                  borderRadius:7,border:"1px solid #c4940a"}}>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",
                    color:"#5a3000",fontSize:12,fontWeight:"600"}}>
                    <input type="checkbox" checked={!!cfg.customLayout}
                      onChange={e=>{
                        const on = e.target.checked;
                        // initialize positions if turning on
                        if (on && !cfg.shelfPositions) {
                          const n = cfg.shelves;
                          const arr = [];
                          for (let i=1; i<=n; i++) arr.push({ y: (box.H/(n+1))*i });
                          onChange({customLayout:true, shelfPositions:arr});
                        } else {
                          onChange({customLayout:on, shelfPositions: on ? cfg.shelfPositions : null});
                        }
                      }}/>
                    🖐️ מיקום ידני (גרירה חופשית)
                  </label>
                  {cfg.customLayout && cfg.shelfPositions && (
                    <div style={{marginTop:8,fontSize:11,color:"#5a3000",lineHeight:1.7}}>
                      גרור כל מדף לעמדה הרצויה בשרטוט הגדול למעלה.
                    </div>
                  )}
                </div>
              </>
            )}
            {cfg.interior==="drawers" && (
              <>
                <label style={lbl}>מספר מגירות</label>
                <input type="number" min={1} max={12} value={cfg.drawers}
                  style={{...inp, opacity: cfg.customLayout ? 0.55 : 1}}
                  disabled={cfg.customLayout}
                  onChange={e=>{
                    const n = +e.target.value;
                    onChange({drawers:n, drawerPositions:null});
                  }}/>

                {/* Custom drawer height toggle */}
                {!cfg.customLayout && (
                  <div style={{marginTop:12,padding:"10px 12px",background:"#faf7f0",
                    borderRadius:7,border:"1px solid #e8dcc8"}}>
                    <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",
                      color:"#5a3a10",fontSize:12,fontWeight:"600",marginBottom:cfg.customDrawerH?10:0}}>
                      <input type="checkbox" checked={!!cfg.customDrawerH}
                        onChange={e=>onChange({customDrawerH:e.target.checked})}/>
                      גובה מגירה אחיד מותאם אישית
                    </label>
                    {cfg.customDrawerH && (<>
                      <label style={lbl}>גובה כל מגירה (ס"מ)</label>
                      <input type="number" min={5} max={box.H} step={0.5}
                        value={cfg.drawerH || 20} style={inp}
                        onChange={e=>onChange({drawerH:+e.target.value})}/>
                      {(() => {
                        const dH    = cfg.drawerH || 20;
                        const total = dH * cfg.drawers;
                        const free  = Math.round((box.H - total) * 10) / 10;
                        const ok    = total <= box.H;
                        return (
                          <div style={{marginTop:8,fontSize:11,lineHeight:1.7,
                            color: ok ? "#2a6020" : "#a02020",
                            background: ok ? "#edf7ea" : "#fdeaea",
                            border: `1px solid ${ok?"#90c080":"#e09090"}`,
                            borderRadius:6, padding:"6px 10px"}}>
                            {ok ? (<>
                              ✅ סה"כ מגירות: <strong>{total} ס"מ</strong> מתוך {box.H} ס"מ |{" "}
                              שטח חופשי: <strong>{free} ס"מ</strong>
                            </>) : (<>
                              ⚠️ הסכום ({total} ס"מ) חורג מגובה הקופסה ({box.H} ס"מ)!
                            </>)}
                          </div>
                        );
                      })()}
                    </>)}
                  </div>
                )}

                {/* Custom layout (drag) toggle */}
                <div style={{marginTop:12,padding:"10px 12px",background:"#fff8e8",
                  borderRadius:7,border:"1px solid #c4940a"}}>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",
                    color:"#5a3000",fontSize:12,fontWeight:"600"}}>
                    <input type="checkbox" checked={!!cfg.customLayout}
                      onChange={e=>{
                        const on = e.target.checked;
                        if (on && !cfg.drawerPositions) {
                          const n  = Math.max(cfg.drawers, 1);
                          const dh = cfg.customDrawerH ? cfg.drawerH : (box.H / n);
                          const arr = [];
                          for (let i=0; i<n; i++) arr.push({ y: i*dh, h: dh });
                          onChange({customLayout:true, drawerPositions:arr});
                        } else {
                          onChange({customLayout:on, drawerPositions: on ? cfg.drawerPositions : null});
                        }
                      }}/>
                    🖐️ מיקום ידני (גרירה חופשית)
                  </label>
                  {cfg.customLayout && cfg.drawerPositions && (
                    <div style={{marginTop:8,fontSize:11,color:"#5a3000",lineHeight:1.7}}>
                      גרור כל מגירה לעמדה הרצויה בשרטוט הגדול למעלה.
                    </div>
                  )}
                </div>

                {!cfg.customDrawerH && !cfg.customLayout && (
                  <div style={{fontSize:10,color:"#7a6040",marginTop:5}}>
                    גובה אוטומטי (חלוקה שווה): {Math.round(box.H / Math.max(cfg.drawers,1) * 10)/10} ס"מ למגירה
                  </div>
                )}
              </>
            )}
            {cfg.interior==="hanging" && (() => {
              // Get current effective rods
              const currentRods = cfg.rodPositions || (() => {
                const n = Math.max(cfg.hangingRods || 1, 1);
                const arr = [box.H - 10];
                let bot = 0, top = box.H - 10;
                for (let i=1; i<n; i++) {
                  const mid = (bot+top)/2;
                  arr.push(Math.round(mid*2)/2);
                  top = mid;
                }
                return arr;
              })();

              const updateRod = (i, val) => {
                const r = [...currentRods];
                r[i] = val;
                onChange({ rodPositions: r });
              };
              const setCount = (n) => {
                // Recompute defaults: top rod 10cm below ceiling, halve remaining
                const arr = [box.H - 10];
                let bot = 0, top = box.H - 10;
                for (let i=1; i<n; i++) {
                  const mid = (bot+top)/2;
                  arr.push(Math.round(mid*2)/2);
                  top = mid;
                }
                onChange({ hangingRods:n, rodPositions: arr });
              };
              const resetDefaults = () => setCount(currentRods.length);

              return (
                <>
                  <label style={lbl}>מספר מוטות תליה</label>
                  <input type="number" min={1} max={6} value={currentRods.length} style={inp}
                    onChange={e=>setCount(Math.max(1, +e.target.value))}/>

                  <div style={{marginTop:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <label style={{...lbl, marginBottom:0}}>גובה כל מוט מהרצפה (ס"מ)</label>
                      <button onClick={resetDefaults} style={{
                        background:"transparent",border:"1px solid #c4940a",borderRadius:5,
                        padding:"3px 9px",fontSize:10,color:"#8b5e00",cursor:"pointer",
                        fontFamily:"inherit",fontWeight:"600",
                      }}>↻ ערכי ברירת מחדל</button>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {currentRods
                        .map((y, idx) => ({y, idx}))
                        .sort((a,b) => b.y - a.y)
                        .map(({y, idx}) => (
                          <div key={idx} style={{display:"flex",gap:8,alignItems:"center",
                            background:"#e8f0ff",border:"1px solid #2a5a8b",borderRadius:7,padding:"7px 10px"}}>
                            <span style={{fontSize:18}}>👔</span>
                            <span style={{fontSize:12,fontWeight:"bold",color:"#1a3a6a",minWidth:55}}>
                              מוט {idx+1}
                            </span>
                            <span style={{fontSize:10,color:"#1a3a6a",opacity:0.7}}>גובה:</span>
                            <input type="number" min={0} max={box.H} step={0.5} value={y} style={{
                              width:80, padding:"4px 6px", border:"1px solid #2a5a8b", borderRadius:4,
                              background:"#fff", fontSize:13, fontFamily:"inherit", fontWeight:"bold", color:"#1a3a6a",
                            }} onChange={e=>updateRod(idx, +e.target.value)}/>
                            <span style={{fontSize:10,color:"#1a3a6a",opacity:0.6,marginRight:"auto"}}>
                              ס"מ מהרצפה
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div style={{marginTop:10,fontSize:11,color:"#1a3a6a",lineHeight:1.7,
                    background:"#e8f0ff",borderRadius:6,padding:"7px 10px"}}>
                    💡 ברירת מחדל: המוט הראשון 10 ס"מ מתחת לחלק העליון של הגוף.
                    מוטות נוספים: כל אחד באמצע השטח שמתחת למוט הקודם.
                    אפשר גם לגרור בשרטוט למעלה או להזין ערך מדויק כאן.
                  </div>
                </>
              );
            })()}
            {cfg.interior==="mixed" && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={lbl}>גובה אזור מגירות תחתון (ס"מ)</label>
                  <input type="number" min={20} max={box.H-30} value={cfg.mixedTopH} style={inp}
                    onChange={e=>onChange({mixedTopH:+e.target.value})}/>
                </div>
                <div>
                  <label style={lbl}>מספר מגירות באזור התחתון</label>
                  <input type="number" min={1} max={6} value={cfg.drawers||2} style={inp}
                    onChange={e=>onChange({drawers:+e.target.value})}/>
                </div>
                <div style={{gridColumn:"1/3",fontSize:10,color:"#7a6040"}}>
                  אזור עליון לתליה: {box.H - cfg.mixedTopH} ס"מ
                </div>
              </div>
            )}
            {cfg.interior==="freeform" && (() => {
              const els = cfg.elements || [];
              const addEl = (type) => {
                const usedY = els.map(e => e.type==="drawer" ? (e.y + e.h) : e.y);
                const startY = usedY.length ? Math.max(...usedY, 0) + 2 : 5;
                const newEl = type==="drawer"
                  ? { id: Date.now()+Math.random(), type:"drawer", y: Math.min(startY, box.H-22), h: 20 }
                  : { id: Date.now()+Math.random(), type, y: Math.min(startY, box.H-2) };
                onChange({ elements: [...els, newEl] });
              };
              const updateEl = (i, patch) => {
                const ne = [...els];
                ne[i] = { ...ne[i], ...patch };
                onChange({ elements: ne });
              };
              const removeEl = (i) => {
                onChange({ elements: els.filter((_,j)=>j!==i) });
              };
              return (
                <div>
                  {/* Add buttons */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
                    <button style={{...optBtn(false),borderColor:"#a87838",color:"#5a3a10",
                      padding:"10px 6px",fontWeight:"bold"}}
                      onClick={()=>addEl("shelf")}>
                      ➕ <span style={{fontSize:14}}>📚</span> מדף
                    </button>
                    <button style={{...optBtn(false),borderColor:"#c4940a",color:"#5a3000",
                      padding:"10px 6px",fontWeight:"bold"}}
                      onClick={()=>addEl("drawer")}>
                      ➕ <span style={{fontSize:14}}>🗃️</span> מגירה
                    </button>
                    <button style={{...optBtn(false),borderColor:"#2a5a8b",color:"#1a3a6a",
                      padding:"10px 6px",fontWeight:"bold"}}
                      onClick={()=>addEl("rod")}>
                      ➕ <span style={{fontSize:14}}>👔</span> מוט תליה
                    </button>
                  </div>

                  {/* Elements list */}
                  {els.length === 0 ? (
                    <div style={{padding:"14px 18px",background:"#faf7f0",borderRadius:8,
                      border:"1px dashed #c8b898",textAlign:"center",fontSize:12,color:"#7a6040"}}>
                      אין אלמנטים עדיין — הוסף מהכפתורים למעלה והם יופיעו בשרטוט הניתן לגרירה
                    </div>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {/* Sort by y descending so list shows top-to-bottom visually */}
                      {els.map((el, idx) => ({el, idx}))
                          .sort((a,b)=> b.el.y - a.el.y)
                          .map(({el, idx}) => {
                        const colors = {
                          shelf:  {bg:"#fdf6e8",bd:"#a87838",fg:"#5a3a10",icon:"📚",label:"מדף"},
                          drawer: {bg:"#fff3d0",bd:"#c4940a",fg:"#5a3000",icon:"🗃️",label:"מגירה"},
                          rod:    {bg:"#e8f0ff",bd:"#2a5a8b",fg:"#1a3a6a",icon:"👔",label:"מוט תליה"},
                        };
                        const c = colors[el.type];
                        return (
                          <div key={el.id} style={{display:"flex",gap:8,alignItems:"center",
                            background:c.bg,border:`1px solid ${c.bd}`,borderRadius:7,padding:"7px 10px"}}>
                            <span style={{fontSize:18}}>{c.icon}</span>
                            <span style={{fontSize:12,fontWeight:"bold",color:c.fg,minWidth:55}}>{c.label}</span>
                            <span style={{fontSize:10,color:c.fg,opacity:0.7}}>גובה מהרצפה:</span>
                            <input type="number" min={0} max={box.H} step={0.5} value={el.y} style={{
                              width:60,padding:"4px 6px",border:`1px solid ${c.bd}`,borderRadius:4,
                              background:"#fff",fontSize:12,fontFamily:"inherit",fontWeight:"bold",color:c.fg,
                            }} onChange={e=>updateEl(idx,{y:+e.target.value})}/>
                            {el.type==="drawer" && (<>
                              <span style={{fontSize:10,color:c.fg,opacity:0.7,marginRight:4}}>גובה:</span>
                              <input type="number" min={5} max={box.H} step={0.5} value={el.h} style={{
                                width:55,padding:"4px 6px",border:`1px solid ${c.bd}`,borderRadius:4,
                                background:"#fff",fontSize:12,fontFamily:"inherit",fontWeight:"bold",color:c.fg,
                              }} onChange={e=>updateEl(idx,{h:+e.target.value})}/>
                            </>)}
                            <button onClick={()=>removeEl(idx)} style={{
                              marginRight:"auto",background:"transparent",border:"none",
                              color:"#a02020",fontSize:16,cursor:"pointer",padding:"0 4px",lineHeight:1,
                            }} title="מחק">🗑️</button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={{marginTop:10,fontSize:10,color:"#7a6040",lineHeight:1.6,
                    background:"#faf7f0",borderRadius:6,padding:"6px 10px"}}>
                    💡 גרור את האלמנטים בשרטוט למעלה למיקום הרצוי, או הזן ערך מדויק כאן.
                    כל ערך הוא במידת סנטימטרים מתחתית הקופסה.
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Action button */}
          <button onClick={onClose} style={{
            width:"100%", padding:"12px", background:"linear-gradient(135deg,#7a5a08,#c4940a)",
            border:"none", borderRadius:8, color:"#fff8e0", fontSize:14, fontWeight:"bold",
            cursor:"pointer", fontFamily:"inherit", letterSpacing:.5,
          }}>
            ✓ שמור והמשך
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Box Layout Front View ────────────────────────────────────────────────────
// Shows all boxes side by side (or stacked) as a proportional front elevation
function BoxLayoutView({ boxes, W, H }) {
  const VW = 460, VH = 260, PAD = 30;
  const totalW = W; // total cabinet width in cm
  const totalH = H;
  const scaleX = (VW - PAD*2) / totalW;
  const scaleY = (VH - PAD*2) / totalH;
  const scale  = Math.min(scaleX, scaleY);

  const fills   = ["#f5ead0","#eadfcc","#ddd4be","#f0e8d5","#e8dfc8"];
  const strokes = ["#8b5e00","#7a5000","#6a4400","#9a6a10","#7a5800"];
  const dim     = "#5a3a10";

  // Group boxes by height group (top vs bottom if tall split)
  // Detect height split: if any two boxes have different H values and same role structure
  const heightGroups = [];
  const seen = new Set();
  boxes.forEach(b => {
    const key = String(b.H);
    if (!seen.has(key)) { seen.add(key); heightGroups.push(b.H); }
  });
  // Sort height groups from bottom to top (larger Y = lower on screen = bottom group)
  heightGroups.sort((a,b)=>a-b);

  const els = [];
  let k = 0;

  // Build rows: group consecutive boxes with same H into horizontal rows.
  // decomposeBoxes order: [bottom-boxes..., top-boxes...]  (bottom first, top last)
  // To show upper at top of SVG: reverse so top row renders first (small Y).
  const rows = [];
  let bi2 = 0;
  while (bi2 < boxes.length) {
    const h = boxes[bi2].H;
    const row = [];
    while (bi2 < boxes.length && boxes[bi2].H === h) { row.push(boxes[bi2]); bi2++; }
    rows.push({ h, boxes: row });
  }
  rows.reverse(); // top row first → small Y = visually at top ✓

  let colorIdx = 0;
  let curY = PAD;

  rows.forEach(({ h: bH, boxes: bxs }) => {
    const rowH = bH * scale;
    const rowStartY = curY;

    let rowX = PAD;
    bxs.forEach((b) => {
      const bw = b.W * scale;
      const bh = rowH;
      const fill   = fills[colorIdx % fills.length];
      const stroke = strokes[colorIdx % strokes.length];
      colorIdx++;

      // Box rectangle
      els.push(<rect key={k++} x={rowX} y={rowStartY} width={bw} height={bh}
        fill={fill} stroke={stroke} strokeWidth={1.8} rx={2}/>);

      // Inner lines (simulate panels)
      els.push(<line key={k++} x1={rowX+3} y1={rowStartY+3} x2={rowX+bw-3} y2={rowStartY+3}
        stroke={stroke} strokeWidth={0.5} strokeDasharray="3,2" opacity={0.5}/>);
      els.push(<line key={k++} x1={rowX+3} y1={rowStartY+bh-3} x2={rowX+bw-3} y2={rowStartY+bh-3}
        stroke={stroke} strokeWidth={0.5} strokeDasharray="3,2" opacity={0.5}/>);

      // Label inside box
      const labelY = rowStartY + bh/2;
      els.push(<text key={k++} x={rowX+bw/2} y={labelY-6}
        textAnchor="middle" fontSize={Math.min(9, bw*0.12)} fill={stroke}
        fontFamily="Georgia,serif" fontWeight="bold">{b.label}</text>);
      els.push(<text key={k++} x={rowX+bw/2} y={labelY+7}
        textAnchor="middle" fontSize={Math.min(8, bw*0.11)} fill={stroke}
        fontFamily="Georgia,serif">{b.W}×{b.H} ס"מ</text>);

      // Width dimension below this box
      const ady = rowStartY + bh + 8;
      els.push(<line key={k++} x1={rowX} y1={ady} x2={rowX+bw} y2={ady} stroke={dim} strokeWidth={0.7}/>);
      els.push(<line key={k++} x1={rowX} y1={ady-3} x2={rowX} y2={ady+3} stroke={dim} strokeWidth={0.7}/>);
      els.push(<line key={k++} x1={rowX+bw} y1={ady-3} x2={rowX+bw} y2={ady+3} stroke={dim} strokeWidth={0.7}/>);
      els.push(<text key={k++} x={rowX+bw/2} y={ady+10}
        textAnchor="middle" fontSize={7.5} fill={dim} fontFamily="Georgia,serif">{b.W}</text>);

      rowX += bw;
    });

    // Height dimension on right side of this row
    const rhx = PAD + totalW * scale + 6;
    els.push(<line key={k++} x1={rhx} y1={rowStartY} x2={rhx} y2={rowStartY+rowH} stroke={dim} strokeWidth={0.7}/>);
    els.push(<line key={k++} x1={rhx-3} y1={rowStartY} x2={rhx+3} y2={rowStartY} stroke={dim} strokeWidth={0.7}/>);
    els.push(<line key={k++} x1={rhx-3} y1={rowStartY+rowH} x2={rhx+3} y2={rowStartY+rowH} stroke={dim} strokeWidth={0.7}/>);
    els.push(<text key={k++} x={rhx+4} y={rowStartY+rowH/2+3}
      fontSize={7.5} fill={dim} fontFamily="Georgia,serif">{bH}</text>);

    curY += rowH;
  });

  // Total width arrow at very bottom
  const totalPx = totalW * scale;
  const tay = curY + 20;
  els.push(<line key={k++} x1={PAD} y1={tay} x2={PAD+totalPx} y2={tay} stroke={dim} strokeWidth={1}/>);
  els.push(<line key={k++} x1={PAD} y1={tay-4} x2={PAD} y2={tay+4} stroke={dim} strokeWidth={1}/>);
  els.push(<line key={k++} x1={PAD+totalPx} y1={tay-4} x2={PAD+totalPx} y2={tay+4} stroke={dim} strokeWidth={1}/>);
  els.push(<text key={k++} x={PAD+totalPx/2} y={tay+12}
    textAnchor="middle" fontSize={9} fill={dim} fontFamily="Georgia,serif" fontWeight="bold">
    {W} ס"מ
  </text>);

  return (
    <svg width="100%" viewBox={`0 0 ${VW} ${VH}`} style={{display:"block"}}>
      {els}
    </svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const C = {
  app:   { minHeight:"100vh", background:"#f5f2ee", color:"#1a1008", fontFamily:"'Georgia',serif", direction:"rtl" },
  hdr:   { background:"linear-gradient(135deg,#3d2a0e 0%,#5a3e18 50%,#3d2a0e 100%)",
           borderBottom:"2px solid #8b6914", padding:"15px 20px", display:"flex", alignItems:"center", gap:12 },
  t1:    { fontSize:20, fontWeight:"bold", color:"#f0d070", margin:0, letterSpacing:.8 },
  t2:    { fontSize:11, color:"#c4a050", margin:0, marginTop:2 },
  main:  { maxWidth:900, margin:"0 auto", padding:"18px 12px" },
  steps: { display:"flex", gap:7, marginBottom:18, justifyContent:"center" },
  badge: (a,d)=>({ padding:"5px 16px", borderRadius:18, fontSize:12, fontWeight:"bold",
    background:d?"#d4edcc":a?"#8b6914":"#e8e0d0",
    color:d?"#2a5a20":a?"#fff8e0":"#7a6040",
    border:`1px solid ${d?"#90c080":a?"#c4940a":"#c8b898"}`,
    cursor:d?"pointer":"default" }),
  row:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, alignItems:"start" },
  card:  { background:"#ffffff", border:"1px solid #d8c8a8", borderRadius:11, padding:18, marginBottom:14,
           boxShadow:"0 2px 8px rgba(0,0,0,0.07)" },
  ct:    { fontSize:13, fontWeight:"bold", color:"#5a3a10", marginBottom:12,
           paddingBottom:7, borderBottom:"1px solid #e0d0b0", display:"flex", alignItems:"center", gap:7 },
  g2:    { display:"grid", gridTemplateColumns:"1fr 1fr", gap:9 },
  g3:    { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:9 },
  g4:    { display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:9 },
  g5:    { display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:7 },
  tb:    (s)=>({ padding:"11px 5px", background:s?"#fff3d0":"#f8f4ee",
    border:`2px solid ${s?"#c4940a":"#d0c0a0"}`, borderRadius:8,
    color:s?"#7a4e00":"#7a6040",
    cursor:"pointer", textAlign:"center", fontSize:11, fontFamily:"inherit", transition:"all .15s" }),
  lbl:   { fontSize:11, color:"#6a4a20", display:"block", marginBottom:4, fontWeight:"600" },
  inp:   { width:"100%", background:"#ffffff", border:"2px solid #c8b898", borderRadius:6,
           padding:"9px 11px", color:"#1a1008", fontSize:15, fontFamily:"inherit", boxSizing:"border-box" },
  sel:   { width:"100%", background:"#ffffff", border:"2px solid #c8b898", borderRadius:6,
           padding:"9px 11px", color:"#1a1008", fontSize:13, fontFamily:"inherit", boxSizing:"border-box" },
  chk:   { display:"flex", alignItems:"center", gap:7, cursor:"pointer", color:"#3a2808", fontSize:13 },
  btn:   { width:"100%", padding:"14px", background:"linear-gradient(135deg,#8b6914,#c4940a)",
           border:"none", borderRadius:8, color:"#fff8e0", fontSize:15, fontWeight:"bold",
           cursor:"pointer", fontFamily:"inherit", letterSpacing:.8, marginTop:5,
           boxShadow:"0 3px 10px rgba(139,105,20,0.35)" },
  back:  { padding:"6px 16px", background:"transparent", border:"1px solid #c8b898",
           borderRadius:6, color:"#7a6040", cursor:"pointer", fontSize:12, fontFamily:"inherit", marginBottom:12 },
  alert: { background:"#edf7ea", border:"1px solid #90c080", borderRadius:9, padding:"12px 16px", marginTop:10 },
  palert:{ background:"#fff8e8", border:"2px solid #c4940a", borderRadius:9, padding:"14px 16px", marginTop:12 },
  tab:   (a)=>({ padding:"7px 16px", background:a?"#8b6914":"#ede8de",
    border:`1px solid ${a?"#c4940a":"#c8b898"}`, borderRadius:"7px 7px 0 0",
    color:a?"#fff8e0":"#7a6040", cursor:"pointer", fontSize:12, fontFamily:"inherit" }),
  th:    { padding:"8px 10px", background:"#f5f0e8", color:"#5a3a10", fontWeight:"700",
           textAlign:"right", borderBottom:"2px solid #d8c8a8", fontSize:12 },
  td:    { padding:"7px 10px", borderBottom:"1px solid #ede8de", color:"#1a1008", fontSize:13 },
  pr:    (tot)=>({ display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"10px 14px", marginBottom:6, background:tot?"#fff8e0":"#faf8f4",
    borderRadius:8, border:`${tot?2:1}px solid ${tot?"#c4940a":"#d8c8a8"}` }),
  tag:   { display:"inline-block", padding:"2px 7px", background:"#f0e8d0",
           border:"1px solid #c8b898", borderRadius:3, fontSize:10, color:"#5a3a10" },
  info:  { marginTop:10, padding:"8px 12px", background:"#edf7ea",
           border:"1px solid #90c080", borderRadius:6, fontSize:12, color:"#2a5a20" },
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [step,    setStep]    = useState(1);
  const [type,    setType]    = useState("cabinet");
  const [W,       setW]       = useState(80);
  const [H,       setH]       = useState(200);
  const [D,       setD]       = useState(55);
  const [shelves, setShelves] = useState(2);
  const [drawers, setDrawers] = useState(0);
  const [hasBack, setHasBack] = useState(true);
  const [plinth,  setPlinth]  = useState(10);
  const [doorCoversPlinth, setDoorCoversPlinth] = useState(false);
  const [lowerH,  setLowerH] = useState(90);
  // Shell
  const [hasShell,  setHasShell]  = useState(false);
  const [tShell,    setTShell]    = useState(18); // shell thickness mm
  const [tBody,     setTBody]     = useState(18); // body thickness mm
  // Materials per group
  const [matBody,   setMatBody]   = useState("mdf18");
  const [matShell,  setMatShell]  = useState("melamine18");
  const [matDoor,   setMatDoor]   = useState("melamine18");
  const [margin,    setMargin]    = useState(30);
  const [laborOn,   setLaborOn]   = useState(true);
  const [result,    setResult]    = useState(null);
  const [tab,       setTab]       = useState("cuts");
  // Per-box configurations (keyed by box index)
  // Each: { hingeSide: "left"|"right"|"double", interior: "shelves"|"drawers"|"hanging"|"mixed",
  //         shelves: number, drawers: number, hangingRods: number,
  //         mixedTopH: number (cm) — for "mixed" type, where the hanging rod section ends }
  const [boxConfigs, setBoxConfigs] = useState({});
  const [editingBox, setEditingBox] = useState(null); // index of box being edited

  // Default per-box config
  const getBoxConfig = (idx) => {
    if (boxConfigs[idx]) return boxConfigs[idx];
    return {
      hingeSide: "right",
      interior: "shelves",        // shelves | drawers | hanging | mixed | freeform
      shelves: 2,
      drawers: 0,
      hangingRods: 1,
      mixedTopH: 60,
      customDrawerH: false,
      drawerH: 20,
      customLayout: false,
      drawerPositions: null,
      shelfPositions: null,
      // Hanging rod positions: array of cm-from-floor values
      rodPositions: null,        // null = auto: 10cm below top, then halve remaining
      // Freeform: array of mixed elements, each { id, type: "drawer"|"shelf"|"rod", y, h }
      // y = bottom-from-floor in cm; h = height (drawers only; shelves/rods ignore h)
      elements: null,
    };
  };
  const updateBoxConfig = (idx, patch) => {
    setBoxConfigs(prev => ({ ...prev, [idx]: { ...getBoxConfig(idx), ...patch } }));
  };

  const isCabinet = type === "cabinet";
  const di        = isCabinet ? calcDoors(W, H, plinth, doorCoversPlinth, lowerH, hasShell, tShell) : null;
  const isTall    = isCabinet && di?.rows === 2;

  const goCalc = () => {
    const cuts = calcCuts(type, W, H, D, shelves, drawers, hasBack,
                          plinth, doorCoversPlinth, lowerH,
                          hasShell && isCabinet, tShell, tBody);

    // Split cuts by group for separate sheet counts
    const mBody  = WOOD_PRICES[matBody];
    const mShell = WOOD_PRICES[matShell];
    const mDoor  = WOOD_PRICES[matDoor];

    const shtsBody  = hasShell && isCabinet
      ? sheetsNeededByGroup(cuts, mBody,  "body")
      : sheetsNeeded(cuts.filter(c=>!c.group||c.group==="body"), mBody);
    const shtsShell = hasShell && isCabinet ? sheetsNeededByGroup(cuts, mShell, "shell") : 0;
    const shtsDoor  = hasShell && isCabinet ? sheetsNeededByGroup(cuts, mDoor,  "door")  : 0;

    const matCBody  = shtsBody  * mBody.pricePerSheet;
    const matCShell = shtsShell * mShell.pricePerSheet;
    const matCDoor  = shtsDoor  * mDoor.pricePerSheet;
    const matC      = matCBody + matCShell + matCDoor;

    const hw   = buildHW(type, di?.total||0, drawers, shelves);
    const hwC  = hw.reduce((s,h)=>s+h.total, 0);
    const lh   = laborOn ? laborHours(type, drawers, shelves) : 0;
    const lC   = lh * LABOR_RATE;
    const sub  = matC + hwC + lC;
    const tot  = Math.round(sub * (1+margin/100) * 1.17);

    const boxes = isCabinet
      ? decomposeBoxes(W, H, D, di?.rows===2 ? di.lowerH : null)
      : [];

    setResult({ cuts, shtsBody, shtsShell, shtsDoor, matCBody, matCShell, matCDoor, matC,
                hw, hwC, lh, lC, sub, tot,
                mBody, mShell, mDoor, boxes });
    setStep(4);
  };

  // Live boxes for step 2 preview (computed from current inputs, no need to calculate first)
  const previewBoxes = useMemo(() => {
    if (!isCabinet) return [];
    return decomposeBoxes(W, H, D, di?.rows===2 ? di.lowerH : null);
  }, [isCabinet, W, H, D, di]);

  return (
    <div style={C.app}>
      {/* Header */}
      <div style={C.hdr}>
        <span style={{fontSize:26}}>🪚</span>
        <div>
          <p style={C.t1}>WorkshopCalc</p>
          <p style={C.t2}>מחשבון נגרות · חיתוכים · חומרים · תמחור</p>
        </div>
      </div>

      <div style={C.main}>
        {/* Steps */}
        <div style={C.steps}>
          {[["① פריט ומידות",1],["② פירוק גופים",2],["③ חומרים",3],["④ תוצאות",4]].map(([l,n])=>(
            <span key={n} style={C.badge(step===n, step>n&&n<4)}
              onClick={()=>step>n&&n<4&&setStep(n)}>{l}</span>
          ))}
        </div>

        {/* ══ STEP 1 ══════════════════════════════════════════ */}
        {step===1 && (<>
          {/* Type selector */}
          <div style={C.card}>
            <div style={C.ct}>🪑 סוג הפריט</div>
            <div style={C.g5}>
              {FURNITURE_TYPES.map(f=>(
                <button key={f.id} style={C.tb(type===f.id)} onClick={()=>setType(f.id)}>
                  <div style={{fontSize:20,marginBottom:3}}>{f.icon}</div>
                  <div>{f.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Two-column layout */}
          <div style={C.row}>
            {/* LEFT: all inputs */}
            <div>
              {/* Main dimensions */}
              <div style={C.card}>
                <div style={C.ct}>📐 מידות (ס"מ)</div>
                <div style={C.g3}>
                  {[["רוחב",W,setW],["גובה",H,setH],["עומק",D,setD]].map(([lbl,val,fn])=>(
                    <div key={lbl}>
                      <label style={C.lbl}>{lbl}</label>
                      <input style={C.inp} type="number" min={1} value={val}
                        onChange={e=>fn(+e.target.value)}/>
                    </div>
                  ))}
                </div>

                {/* Plinth section — only for cabinet / drawer_unit */}
                {(isCabinet || type==="drawer_unit") && (
                  <div style={C.palert}>
                    <div style={{color:"#8b5e00",fontWeight:"bold",fontSize:13,marginBottom:11}}>
                      🦶 צוקל (Toe-kick)
                    </div>
                    <div>
                      <label style={C.lbl}>גובה צוקל (ס"מ)</label>
                      <input style={{...C.inp, border:"2px solid #c4940a", color:"#5a3000", fontWeight:"bold"}}
                        type="number" min={0} max={30} value={plinth}
                        onChange={e=>setPlinth(+e.target.value)}/>
                      <div style={{fontSize:10,color:"#8a6030",marginTop:4}}>0 = ללא צוקל</div>
                    </div>
                    {plinth > 0 && isCabinet && (
                      <div style={{marginTop:10}}>
                        <label style={{...C.lbl,marginBottom:6}}>דלת מכסה צוקל?</label>
                        <div style={{display:"flex",gap:16}}>
                          <label style={{...C.chk,fontSize:13,fontWeight:"600"}}>
                            <input type="radio" name="dcp" checked={doorCoversPlinth===true}
                              onChange={()=>setDoorCoversPlinth(true)}/> כן
                          </label>
                          <label style={{...C.chk,fontSize:13,fontWeight:"600"}}>
                            <input type="radio" name="dcp" checked={doorCoversPlinth===false}
                              onChange={()=>setDoorCoversPlinth(false)}/> לא
                          </label>
                        </div>
                      </div>
                    )}
                    {plinth > 0 && isCabinet && (
                      <div style={{marginTop:9,fontSize:11,color:"#5a3a10",lineHeight:1.7,
                        background:"#fff3d8",borderRadius:6,padding:"7px 10px"}}>
                        {doorCoversPlinth
                          ? "✓ הדלת תתחיל 1 ס\"מ מהרצפה ותכסה את הצוקל"
                          : `✓ הדלת תתחיל 2 מ\"מ מתחת לגובה הצוקל (${plinth - 0.2} ס\"מ מהרצפה)`}
                      </div>
                    )}
                  </div>
                )}

                {/* Shell section — only for cabinet */}
                {isCabinet && (
                  <div style={{...C.palert, borderColor:"#6a8fbf", background:"#f0f5ff", marginTop:12}}>
                    <div style={{color:"#1a3a6a",fontWeight:"bold",fontSize:13,marginBottom:10}}>
                      🪵 גוף פנימי (Double-box)
                    </div>
                    <div style={{display:"flex",gap:16,marginBottom:10}}>
                      {[["כן — מעטפת + גוף",true],["לא — ארון רגיל",false]].map(([lbl,val])=>(
                        <label key={String(val)} style={{...C.chk,fontWeight:"600",fontSize:13}}>
                          <input type="radio" name="hs" checked={hasShell===val}
                            onChange={()=>setHasShell(val)}/> {lbl}
                        </label>
                      ))}
                    </div>
                    {hasShell && (
                      <div style={C.g2}>
                        <div>
                          <label style={C.lbl}>עובי מעטפת (מ"מ)</label>
                          <input style={C.inp} type="number" min={12} max={36} value={tShell}
                            onChange={e=>setTShell(+e.target.value)}/>
                        </div>
                        <div>
                          <label style={C.lbl}>עובי גוף פנימי (מ"מ)</label>
                          <input style={C.inp} type="number" min={12} max={25} value={tBody}
                            onChange={e=>setTBody(+e.target.value)}/>
                        </div>
                      </div>
                    )}
                    {hasShell && (
                      <div style={{marginTop:8,fontSize:10,color:"#1a3a6a",background:"#ddeaff",
                        borderRadius:6,padding:"6px 10px",lineHeight:1.7}}>
                        מידות פנים מעטפת / חוץ גוף:{" "}
                        <strong>{W - tShell/10*2}×{H - tShell/10}×{D - tShell/10} ס"מ</strong>
                      </div>
                    )}
                  </div>
                )}
                {isTall && (
                  <div style={C.alert}>
                    <div style={{color:"#2a6020",fontWeight:"bold",fontSize:12,marginBottom:8}}>
                      📏 ארון גבוה — שני מפלסי דלתות
                    </div>
                    <label style={C.lbl}>גובה דלת תחתונה (ס"מ)</label>
                    <input style={C.inp} type="number" min={40} max={H-40}
                      value={lowerH} onChange={e=>setLowerH(+e.target.value)}/>
                    <div style={{fontSize:11,color:"#2a6020",marginTop:5}}>
                      גובה דלת עליונה:{" "}
                      <strong style={{color:"#1a5010"}}>
                        {di?.upperH} ס"מ
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: sketch */}
            <div style={{...C.card, display:"flex", flexDirection:"column"}}>
              <div style={C.ct}>🖊️ שרטוט גס</div>
              <div style={{background:"#faf7f2", borderRadius:7, padding:8,
                border:"2px solid #d8c8a8", flex:1}}>
                <Sketch
                  type={type} W={W} H={H} D={D}
                  shelves={shelves} drawers={drawers}
                  plinth={isCabinet ? plinth : 0}
                  doorCoversPlinth={doorCoversPlinth}
                  lowerH={isTall ? lowerH : null}
                  hasShell={hasShell && isCabinet}
                  tShell={tShell / 10}
                />
              </div>
              <div style={{fontSize:11,color:"#5a3a10",marginTop:7,textAlign:"center",fontWeight:"600"}}>
                {W} × {H} × {D} ס"מ
                {plinth>0&&isCabinet&&` | צוקל ${plinth} ס"מ`}
                {di && ` | ${di.n} דלתות × ${di.doorW}cm`}
                {di?.rows===2 && " (₂ מפלסים)"}
              </div>
            </div>
          </div>

          <button style={C.btn} onClick={()=>setStep(2)}>המשך לפירוק גופים ←</button>
        </>)}

        {/* ══ STEP 2 — BOX DECOMPOSITION ═══════════════════════ */}
        {step===2 && (<>
          <button style={C.back} onClick={()=>setStep(1)}>← חזור</button>

          {/* Explanation banner */}
          <div style={{padding:"12px 16px",background:"#fff8e8",border:"2px solid #c4940a",
            borderRadius:10,marginBottom:16,fontSize:12,color:"#5a3000",lineHeight:1.8}}>
            <strong style={{fontSize:13}}>📦 פירוק לקופסאות עצמאיות</strong><br/>
            <span style={{color:"#8b6030"}}>
              גובה &gt; 200 ס"מ → פיצול לגובה (תחתונה + עליונה) &nbsp;|&nbsp;
              רוחב 60–120 ס"מ → 2 חצאים שווים &nbsp;|&nbsp;
              רוחב &gt; 120 ס"מ → פיצול אופטימלי לפי פלטה 122×244 ס"מ
            </span>
          </div>

          {!isCabinet && (
            <div style={{...C.info, marginBottom:16}}>
              פירוק קופסאות רלוונטי לארונות בלבד. המשך לבחירת חומרים.
            </div>
          )}

          {isCabinet && (<>
            {previewBoxes.length === 1 ? (
              <div style={{...C.info,marginBottom:16,fontSize:13}}>
                ✅ הארון מתאים לקופסה אחת — אין צורך בפיצול
              </div>
            ) : (
              <div style={{padding:"8px 14px",background:"#edf7ea",border:"1px solid #90c080",
                borderRadius:8,marginBottom:16,fontSize:12,color:"#2a6020",fontWeight:"600"}}>
                הארון יפורק ל-{previewBoxes.length} קופסאות
              </div>
            )}

            {/* Big visual layout — front view of all boxes together */}
            <div style={C.card}>
              <div style={C.ct}>🪟 תצוגת חזית — פריסת הארון</div>
              <BoxLayoutView boxes={previewBoxes} W={W} H={H} />
            </div>

            {/* Detail cards per box — clickable to edit */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:12,marginBottom:16}}>
              {previewBoxes.map((b,i)=>{
                const isOk = b.W <= SHEET_W && b.H <= SHEET_H;
                const cfg  = getBoxConfig(i);
                const intLabel = cfg.interior==="shelves" ? `${cfg.shelves} מדפים`
                              : cfg.interior==="drawers" ? `${cfg.drawers} מגירות`
                              : cfg.interior==="hanging" ? `${cfg.hangingRods} מוטות תליה`
                              : `מעורב: תליה + ${cfg.drawers} מגירות`;
                const hingeLabel = cfg.hingeSide==="left"  ? "ציר שמאל"
                                : cfg.hingeSide==="right" ? "ציר ימין"
                                : "ציר כפול";
                return (
                  <button key={i} onClick={()=>setEditingBox(i)}
                    style={{background:"#fff",border:"2px solid #d8c8a8",
                      borderRadius:10,padding:14,boxShadow:"0 2px 6px rgba(0,0,0,0.06)",
                      cursor:"pointer",textAlign:"right",fontFamily:"inherit",
                      transition:"all .15s",direction:"rtl"}}
                    onMouseOver={e=>{e.currentTarget.style.borderColor="#c4940a";
                      e.currentTarget.style.boxShadow="0 4px 14px rgba(196,148,10,0.25)";}}
                    onMouseOut={e=>{e.currentTarget.style.borderColor="#d8c8a8";
                      e.currentTarget.style.boxShadow="0 2px 6px rgba(0,0,0,0.06)";}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                      marginBottom:9,paddingBottom:7,borderBottom:"1px solid #e8dcc8"}}>
                      <span style={{fontWeight:"bold",fontSize:13,color:"#5a3a10"}}>📦 {b.label}</span>
                      <span style={{fontSize:11,color:"#c4940a",fontWeight:"600"}}>✏️ ערוך</span>
                    </div>

                    {/* Mini interior preview */}
                    <BoxInteriorPreview box={b} cfg={cfg} />

                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,marginTop:10,marginBottom:8}}>
                      {[["W",b.W],["H",b.H],["D",b.D]].map(([lbl,val])=>(
                        <div key={lbl} style={{textAlign:"center",background:"#faf7f0",
                          borderRadius:5,padding:"4px 2px",border:"1px solid #e8dcc8"}}>
                          <div style={{fontSize:9,color:"#8b6030"}}>{lbl}</div>
                          <div style={{fontSize:14,fontWeight:"bold",color:"#3a2008"}}>{val}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
                      <span style={{...C.tag,background:"#fff3d8",borderColor:"#c4940a",color:"#5a3000"}}>
                        🚪 {hingeLabel}
                      </span>
                      <span style={{...C.tag,background:"#e8f0ff",borderColor:"#6a8fbf",color:"#1a3a6a"}}>
                        📐 {intLabel}
                      </span>
                    </div>

                    <div style={{fontSize:10,textAlign:"center",
                      color: isOk?"#2a6020":"#a02020",
                      background:isOk?"#edf7ea":"#fdeaea",
                      border:`1px solid ${isOk?"#90c080":"#e09090"}`,
                      borderRadius:5,padding:"3px 6px"}}>
                      {isOk ? "✅ מתאים לפלטה" : "⚠️ חורג מפלטה"}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Summary row */}
            <div style={{padding:"10px 16px",background:"#f5f0e8",border:"1px solid #d8c8a8",
              borderRadius:8,fontSize:12,color:"#3a2008",marginBottom:4}}>
              {previewBoxes.map((b,i)=>
                <span key={i}>{i>0?" | ":""}<strong>{b.label}:</strong> {b.W}×{b.H}×{b.D} ס"מ</span>
              )}
            </div>
          </>)}

          <button style={C.btn} onClick={()=>setStep(3)}>המשך לבחירת חומרים ←</button>
        </>)}

        {/* ══ STEP 3 — MATERIALS ═══════════════════════════════ */}
        {step===3 && (<>
          <button style={C.back} onClick={()=>setStep(2)}>← חזור</button>

          {/* Material pickers */}
          {(hasShell && isCabinet) ? (<>
            {[
              ["🪵 גוף פנימי", matBody,  setMatBody,  "body"],
              ["🧱 מעטפת חיצונית + צדדים", matShell, setMatShell, "shell"],
              ["🚪 חזיתות / דלתות", matDoor, setMatDoor, "door"],
            ].map(([title, val, fn]) => (
              <div key={title} style={C.card}>
                <div style={C.ct}>{title}</div>
                <div style={C.g2}>
                  {Object.entries(WOOD_PRICES).map(([k,v])=>(
                    <button key={k} style={{...C.tb(val===k),textAlign:"right",padding:"10px 12px"}}
                      onClick={()=>fn(k)}>
                      <div style={{fontWeight:"bold",fontSize:13,color:"#1a1008"}}>{v.name}</div>
                      <div style={{fontSize:11,color:val===k?"#8b5e00":"#7a6040",marginTop:2}}>
                        ₪{v.pricePerSheet} / לוח {v.sheetW}×{v.sheetH}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>) : (
            <div style={C.card}>
              <div style={C.ct}>🪵 חומר עיקרי</div>
              <div style={C.g2}>
                {Object.entries(WOOD_PRICES).map(([k,v])=>(
                  <button key={k} style={{...C.tb(matBody===k),textAlign:"right",padding:"10px 12px"}}
                    onClick={()=>setMatBody(k)}>
                    <div style={{fontWeight:"bold",fontSize:13,color:"#1a1008"}}>{v.name}</div>
                    <div style={{fontSize:11,color:matBody===k?"#8b5e00":"#7a6040",marginTop:2}}>
                      ₪{v.pricePerSheet} / לוח {v.sheetW}×{v.sheetH}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={C.card}>
            <div style={C.ct}>💰 תמחור</div>
            <div style={C.g2}>
              <div>
                <label style={C.lbl}>מרווח רווח (%)</label>
                <input style={C.inp} type="number" min={0} max={300}
                  value={margin} onChange={e=>setMargin(+e.target.value)}/>
              </div>
              <div>
                <label style={C.lbl}>תעריף עבודה (₪/שעה)</label>
                <input style={{...C.inp,opacity:.55,background:"#f0ece4"}} type="number" value={LABOR_RATE} disabled/>
              </div>
            </div>
            <div style={{marginTop:10}}>
              <label style={C.chk}>
                <input type="checkbox" checked={laborOn} onChange={e=>setLaborOn(e.target.checked)}/>
                כלול עלות עבודה
              </label>
            </div>
          </div>
          <button style={C.btn} onClick={goCalc}>⚡ חשב חיתוכים ותמחור</button>
        </>)}

        {/* ══ STEP 4 — RESULTS ═════════════════════════════════ */}
        {step===4 && result && (<>
          <button style={C.back} onClick={()=>setStep(3)}>← ערוך</button>

          {/* Summary */}
          <div style={{background:"linear-gradient(135deg,#5a3a10,#8b6914)",
            border:"none",borderRadius:11,padding:"14px 18px",marginBottom:14,
            display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,
            boxShadow:"0 3px 12px rgba(139,105,20,0.3)"}}>
            <div>
              <div style={{fontSize:11,color:"#f0d890"}}>פריט</div>
              <div style={{fontSize:15,fontWeight:"bold",color:"#ffffff"}}>
                {FURNITURE_TYPES.find(f=>f.id===type)?.label} — {W}×{H}×{D} ס"מ
              </div>
              <div style={{fontSize:10,color:"#f0d080",marginTop:2}}>
                {hasShell&&isCabinet
                  ? `מעטפת: ${result.shtsShell} לוחות | גוף: ${result.shtsBody} לוחות | דלתות: ${result.shtsDoor} לוחות`
                  : `${result.mBody.name} | ${result.shtsBody} לוחות`}
                {plinth>0&&isCabinet&&` | צוקל ${plinth} ס"מ`}
              </div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:10,color:"#f0d890"}}>סה"כ לוחות</div>
              <div style={{fontSize:26,fontWeight:"bold",color:"#ffffff"}}>
                {result.shtsBody + result.shtsShell + result.shtsDoor}
              </div>
            </div>
            <div style={{textAlign:"left"}}>
              <div style={{fontSize:10,color:"#f0d890"}}>מחיר ללקוח (כולל מע"מ)</div>
              <div style={{fontSize:26,fontWeight:"bold",color:"#ffffff"}}>₪{result.tot.toLocaleString()}</div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{display:"flex",gap:3,marginBottom:0,flexWrap:"wrap"}}>
            {[["cuts","✂️ חיתוכים"],["hw","🔩 פרזולים"],["price","💰 תמחור"],
              ...(isCabinet?[["boxes","📦 פירוק קופסאות"]]:[])
            ].map(([k,l])=>(
              <button key={k} style={C.tab(tab===k)} onClick={()=>setTab(k)}>{l}</button>
            ))}
          </div>

          <div style={{...C.card,borderRadius:"0 11px 11px 11px"}}>
            {/* Cutting list */}
            {tab==="cuts" && (
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr>{["חלק","קבוצה","כמות","רוחב מ\"מ","גובה מ\"מ","הערה"].map(h=>(
                    <th key={h} style={C.th}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {result.cuts.map((c,i)=>{
                    const grpLabel = c.group==="shell"?"מעטפת":c.group==="body"?"גוף":c.group==="door"?"דלת":"";
                    const grpColor = c.group==="shell"?"#1a3a6a":c.group==="body"?"#5a3a10":c.group==="door"?"#2a6020":"";
                    return (
                      <tr key={i} style={{background:i%2?"#faf7f0":"#ffffff"}}>
                        <td style={{...C.td,fontWeight:"bold",color:"#3a2008"}}>{c.name}</td>
                        <td style={C.td}>{grpLabel&&<span style={{...C.tag,color:grpColor,borderColor:grpColor}}>{grpLabel}</span>}</td>
                        <td style={{...C.td,textAlign:"center",color:"#8b5e00",fontWeight:"bold",fontSize:15}}>{c.qty}</td>
                        <td style={C.td}>{c.w}</td>
                        <td style={C.td}>{c.h}</td>
                        <td style={C.td}>{c.note&&<span style={C.tag}>{c.note}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Hardware */}
            {tab==="hw" && (
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr>{["פריט","כמות","יחידה","מחיר יח'","סה\"כ"].map(h=>(
                    <th key={h} style={C.th}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {result.hw.map((h,i)=>(
                    <tr key={i} style={{background:i%2?"#faf7f0":"#ffffff"}}>
                      <td style={{...C.td,fontWeight:"bold",color:"#3a2008"}}>{h.name}</td>
                      <td style={{...C.td,textAlign:"center",color:"#8b5e00",fontWeight:"bold",fontSize:15}}>{h.qty}</td>
                      <td style={C.td}>{h.unit}</td>
                      <td style={C.td}>₪{h.price}</td>
                      <td style={{...C.td,color:"#2a6020",fontWeight:"600"}}>₪{h.total.toFixed(0)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} style={{...C.td,fontWeight:"bold",color:"#5a3a10",borderTop:"2px solid #d8c8a8",background:"#f5f0e8"}}>סה"כ פרזולים</td>
                    <td style={{...C.td,fontWeight:"bold",color:"#5a3a10",borderTop:"2px solid #d8c8a8",background:"#f5f0e8"}}>₪{result.hwC.toFixed(0)}</td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* Box decomposition */}
            {tab==="boxes" && isCabinet && (
              <div>
                <div style={{fontSize:12,color:"#5a3a10",marginBottom:14,lineHeight:1.7,
                  padding:"10px 14px",background:"#fdf6e8",borderRadius:8,border:"1px solid #e0c888"}}>
                  <strong>פירוק לקופסאות עצמאיות</strong> — כל קופסה מיוצרת ומובלת בנפרד ומורכבת יחד באתר.<br/>
                  <span style={{color:"#8b6030"}}>
                    גובה &gt; 200 ס"מ → פיצול לגובה | רוחב 60–120 ס"מ → 2 חצאים | רוחב &gt; 120 ס"מ → פיצול אופטימלי לפי פלטה 122×244
                  </span>
                </div>

                {result.boxes.length === 1 && (
                  <div style={{...C.info,marginBottom:12}}>
                    ✅ הארון מתאים לקופסה אחת — אין צורך בפיצול
                  </div>
                )}

                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
                  {result.boxes.map((b,i)=>{
                    // visual mini-sketch
                    const scW = 100, scH = 130;
                    const sc  = Math.min(scW/b.W, scH/b.H) * 0.82;
                    const bw  = b.W*sc, bh = b.H*sc;
                    const bx  = (scW-bw)/2, by = (scH-bh)/2;
                    const isOk = b.W <= SHEET_W && b.H <= SHEET_H;
                    return (
                      <div key={i} style={{background:"#fff",border:"2px solid #d8c8a8",
                        borderRadius:10,padding:14,textAlign:"center",
                        boxShadow:"0 2px 6px rgba(0,0,0,0.06)"}}>
                        <div style={{fontWeight:"bold",fontSize:12,color:"#5a3a10",marginBottom:6}}>
                          {b.label}
                        </div>
                        {/* Mini sketch */}
                        <svg width={scW} height={scH} style={{display:"block",margin:"0 auto 8px"}}>
                          <rect x={bx} y={by} width={bw} height={bh}
                            fill="#f5ead0" stroke="#8b5e00" strokeWidth={1.5} rx={2}/>
                          <line x1={bx+3} y1={by+3} x2={bx+bw-3} y2={by+3}
                            stroke="#8b5e00" strokeWidth={0.7} strokeDasharray="2,2" opacity={0.5}/>
                          <line x1={bx+3} y1={by+bh-3} x2={bx+bw-3} y2={by+bh-3}
                            stroke="#8b5e00" strokeWidth={0.7} strokeDasharray="2,2" opacity={0.5}/>
                          {/* width arrow */}
                          <line x1={bx} y1={by+bh+7} x2={bx+bw} y2={by+bh+7} stroke="#5a3a10" strokeWidth={0.8}/>
                          <line x1={bx} y1={by+bh+4} x2={bx} y2={by+bh+10} stroke="#5a3a10" strokeWidth={0.8}/>
                          <line x1={bx+bw} y1={by+bh+4} x2={bx+bw} y2={by+bh+10} stroke="#5a3a10" strokeWidth={0.8}/>
                          <text x={bx+bw/2} y={by+bh+18} textAnchor="middle"
                            fontSize={8} fill="#5a3a10" fontFamily="Georgia,serif">{b.W} ס"מ</text>
                          {/* height arrow */}
                          <line x1={bx-7} y1={by} x2={bx-7} y2={by+bh} stroke="#5a3a10" strokeWidth={0.8}/>
                          <line x1={bx-10} y1={by} x2={bx-4} y2={by} stroke="#5a3a10" strokeWidth={0.8}/>
                          <line x1={bx-10} y1={by+bh} x2={bx-4} y2={by+bh} stroke="#5a3a10" strokeWidth={0.8}/>
                          <text x={bx-8} y={by+bh/2} textAnchor="middle" fontSize={8} fill="#5a3a10"
                            fontFamily="Georgia,serif"
                            transform={`rotate(-90,${bx-8},${by+bh/2})`}>{b.H} ס"מ</text>
                        </svg>
                        {/* Dimensions */}
                        <div style={{fontSize:13,fontWeight:"bold",color:"#3a2008",marginBottom:4}}>
                          {b.W} × {b.H} × {b.D} ס"מ
                        </div>
                        {b.note && (
                          <div style={{...C.tag,display:"inline-block",marginBottom:6}}>{b.note}</div>
                        )}
                        {/* Sheet fit check */}
                        <div style={{fontSize:11,
                          color: isOk ? "#2a6020" : "#a02020",
                          background: isOk ? "#edf7ea" : "#fdeaea",
                          border: `1px solid ${isOk?"#90c080":"#e09090"}`,
                          borderRadius:5,padding:"3px 8px",marginTop:4}}>
                          {isOk ? "✅ מתאים לפלטה" : "⚠️ גדול מפלטה — בדוק!"}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Summary */}
                <div style={{marginTop:16,padding:"10px 14px",background:"#f5f0e8",
                  border:"1px solid #d8c8a8",borderRadius:8,fontSize:12,color:"#3a2008"}}>
                  סה"כ <strong>{result.boxes.length} קופסאות</strong> |{" "}
                  {result.boxes.map((b,i)=>`${b.label}: ${b.W}×${b.H}×${b.D}`).join(" | ")}
                </div>
              </div>
            )}
            {tab==="price" && (<div>
              {hasShell && isCabinet ? (<>
                {[
                  ["🪵 גוף פנימי",  `${result.shtsBody} לוחות ${result.mBody.name}`,   result.matCBody],
                  ["🧱 מעטפת",      `${result.shtsShell} לוחות ${result.mShell.name}`, result.matCShell],
                  ["🚪 חזיתות",     `${result.shtsDoor} לוחות ${result.mDoor.name}`,   result.matCDoor],
                ].map(([lbl,sub,val],i)=>(
                  <div key={i} style={C.pr(false)}>
                    <div>
                      <div style={{color:"#5a3a10",fontSize:13,fontWeight:"600"}}>{lbl}</div>
                      <div style={{fontSize:11,color:"#7a6040"}}>{sub}</div>
                    </div>
                    <div style={{color:"#1a1008",fontSize:15,fontWeight:"bold"}}>₪{Math.round(val).toLocaleString()}</div>
                  </div>
                ))}
              </>) : (
                <div style={C.pr(false)}>
                  <div>
                    <div style={{color:"#5a3a10",fontSize:13,fontWeight:"600"}}>🪵 חומרים</div>
                    <div style={{fontSize:11,color:"#7a6040"}}>{result.shtsBody} לוחות {result.mBody.name}</div>
                  </div>
                  <div style={{color:"#1a1008",fontSize:15,fontWeight:"bold"}}>₪{Math.round(result.matCBody).toLocaleString()}</div>
                </div>
              )}
              <div style={C.pr(false)}>
                <div>
                  <div style={{color:"#5a3a10",fontSize:13,fontWeight:"600"}}>🔩 פרזולים</div>
                  <div style={{fontSize:11,color:"#7a6040"}}>ציירים, ידיות, מסילות</div>
                </div>
                <div style={{color:"#1a1008",fontSize:15,fontWeight:"bold"}}>₪{Math.round(result.hwC).toLocaleString()}</div>
              </div>
              {laborOn && (
                <div style={C.pr(false)}>
                  <div>
                    <div style={{color:"#5a3a10",fontSize:13,fontWeight:"600"}}>👷 עבודה</div>
                    <div style={{fontSize:11,color:"#7a6040"}}>{result.lh} שעות × ₪{LABOR_RATE}</div>
                  </div>
                  <div style={{color:"#1a1008",fontSize:15,fontWeight:"bold"}}>₪{Math.round(result.lC).toLocaleString()}</div>
                </div>
              )}
              <div style={{...C.pr(false),background:"#edf7ea",border:"1px solid #90c080"}}>
                <div style={{color:"#2a6020",fontSize:13,fontWeight:"600"}}>📊 עלות בסיס</div>
                <div style={{color:"#2a6020",fontSize:15,fontWeight:"bold"}}>₪{Math.round(result.sub).toLocaleString()}</div>
              </div>
              <div style={C.pr(false)}>
                <div style={{color:"#5a3a10",fontSize:13,fontWeight:"600"}}>💹 רווח ({margin}%)</div>
                <div style={{color:"#1a1008",fontSize:15,fontWeight:"bold"}}>₪{Math.round(result.sub*margin/100).toLocaleString()}</div>
              </div>
              <div style={C.pr(true)}>
                <div>
                  <div style={{color:"#5a3000",fontSize:15,fontWeight:"bold"}}>💰 מחיר ללקוח</div>
                  <div style={{fontSize:11,color:"#8b6020"}}>כולל מע"מ 17%</div>
                </div>
                <div style={{color:"#5a3000",fontSize:24,fontWeight:"bold"}}>₪{result.tot.toLocaleString()}</div>
              </div>
              <div style={{marginTop:12,padding:"11px 14px",background:"#f5f2e8",
                border:"1px dashed #c8b070",borderRadius:8,fontSize:11,color:"#3a2808",lineHeight:1.9}}>
                📋 <strong style={{color:"#5a3000"}}>תקציר להצעת מחיר:</strong><br/>
                {FURNITURE_TYPES.find(f=>f.id===type)?.label} {W}×{H}×{D} ס"מ
                {hasShell&&isCabinet&&" | מעטפת + גוף פנימי"}
                {plinth>0&&isCabinet&&` | צוקל ${plinth} ס"מ (${doorCoversPlinth?"מכוסה":"נפרד"})`}<br/>
                {hasShell&&isCabinet
                  ? `מעטפת: ${result.shtsShell} ל' ${result.mShell.name} | גוף: ${result.shtsBody} ל' ${result.mBody.name} | דלתות: ${result.shtsDoor} ל' ${result.mDoor.name}`
                  : `${result.shtsBody} לוחות ${result.mBody.name}`}
                {laborOn&&` | ${result.lh} שעות עבודה`} |{" "}
                מחיר כולל מע"מ: <strong style={{color:"#8b5e00"}}>₪{result.tot.toLocaleString()}</strong>
              </div>
            </div>)}
          </div>

          <button style={{...C.btn,background:"linear-gradient(135deg,#2a6020,#4a9030)",
            color:"#ffffff",marginTop:10}}
            onClick={()=>{setStep(1);setResult(null);setW(80);setH(200);setD(55);}}>
            🔄 חישוב חדש
          </button>
        </>)}
      </div>

      {/* Box Edit Modal */}
      {editingBox !== null && previewBoxes[editingBox] && (
        <BoxEditModal
          box={previewBoxes[editingBox]}
          cfg={getBoxConfig(editingBox)}
          onChange={(patch)=>updateBoxConfig(editingBox, patch)}
          onClose={()=>setEditingBox(null)}
          isOnly={previewBoxes.length===1}
        />
      )}
    </div>
  );
}
