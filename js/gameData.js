// תכנון יישוב v2 - רשת מגרשים ורחובות אמיתית (טרפזים סביב כיכר, שורות מגרשים לאורך כביש
// נכנס מתעקל, ורשת רחובות משניים) - בהשראת מבנה תשריט אמיתי (אליכין 457-1194877),
// לא שכפול מדויק שלו. הצבעים והייעודים הם המצאה חופשית של המשחק, לא מהמקרא המקורי.
window.gameData = (function () {
  // ---------- כלים גיאומטריים בסיסיים ----------
  function pt(x, y) { return { x, y }; }
  function sub(a, b) { return pt(a.x - b.x, a.y - b.y); }
  function add(a, b) { return pt(a.x + b.x, a.y + b.y); }
  function scale(a, s) { return pt(a.x * s, a.y * s); }
  function vlen(a) { return Math.hypot(a.x, a.y); }
  function norm(a) { const l = vlen(a) || 1; return pt(a.x / l, a.y / l); }

  function lineIntersect(p1, d1, p2, d2) {
    const denom = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(denom) < 1e-9) return p1;
    const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom;
    return add(p1, scale(d1, t));
  }

  // מכווץ פוליגון קמור (סדר נקודות עקבי) פנימה, מרחק שונה לכל צלע (distances[i] לצלע points[i]->points[i+1])
  function insetPolygon(points, distances) {
    const n = points.length;
    const edges = [];
    for (let i = 0; i < n; i++) {
      const a = points[i], b = points[(i + 1) % n];
      const dir = norm(sub(b, a));
      const inward = pt(dir.y, -dir.x); // סימן נקבע אמפירית לפי סדר הנקודות שבו אנו מייצרים מגרשים
      const offsetA = add(a, scale(inward, distances[i]));
      edges.push({ point: offsetA, dir });
    }
    const newPts = [];
    for (let i = 0; i < n; i++) {
      const e1 = edges[(i - 1 + n) % n];
      const e2 = edges[i];
      newPts.push(lineIntersect(e1.point, e1.dir, e2.point, e2.dir));
    }
    return newPts;
  }

  function polygonArea(points) {
    let s = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s) / 2;
  }

  function pointSegDist(p, a, b) {
    const ab = sub(b, a);
    const denom = ab.x * ab.x + ab.y * ab.y || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / denom));
    const proj = add(a, scale(ab, t));
    return vlen(sub(p, proj));
  }

  function segSegDist(a, b, c, d) {
    return Math.min(pointSegDist(a, c, d), pointSegDist(b, c, d), pointSegDist(c, a, b), pointSegDist(d, a, b));
  }

  function polyPolyDist(P, Q) {
    let m = Infinity;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      for (let j = 0; j < Q.length; j++) {
        const c = Q[j], d = Q[(j + 1) % Q.length];
        m = Math.min(m, segSegDist(a, b, c, d));
      }
    }
    return m;
  }

  function pointToPolylineDist(p, polylinePts) {
    let m = Infinity;
    for (let i = 0; i < polylinePts.length - 1; i++) {
      m = Math.min(m, pointSegDist(p, polylinePts[i], polylinePts[i + 1]));
    }
    return m;
  }

  function polygonMidpoint(a, b) { return pt((a.x + b.x) / 2, (a.y + b.y) / 2); }

  function pointsToPath(points) {
    return "M " + points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ") + " Z";
  }

  // ---------- מחוללי גיאומטריה ----------
  function arcPolyline(center, radius, startDeg, endDeg, segments) {
    const a0 = (startDeg * Math.PI) / 180, a1 = (endDeg * Math.PI) / 180;
    const out = [];
    for (let i = 0; i <= segments; i++) {
      const t = a0 + ((a1 - a0) * i) / segments;
      out.push(add(center, pt(radius * Math.cos(t), radius * Math.sin(t))));
    }
    return out;
  }

  function radialPlots({ center, startDeg, endDeg, count, rInner, rOuter, streetId, idPrefix }) {
    const plots = [];
    const a0 = (startDeg * Math.PI) / 180, a1 = (endDeg * Math.PI) / 180;
    for (let i = 0; i < count; i++) {
      const t0 = a0 + ((a1 - a0) * i) / count;
      const t1 = a0 + ((a1 - a0) * (i + 1)) / count;
      const p0 = add(center, pt(rInner * Math.cos(t0), rInner * Math.sin(t0)));
      const p1 = add(center, pt(rInner * Math.cos(t1), rInner * Math.sin(t1)));
      const p2 = add(center, pt(rOuter * Math.cos(t1), rOuter * Math.sin(t1)));
      const p3 = add(center, pt(rOuter * Math.cos(t0), rOuter * Math.sin(t0)));
      plots.push({ id: `${idPrefix}${i}`, points: [p0, p1, p2, p3], streetIds: [streetId] });
    }
    return plots;
  }

  function rowPlots({ start, alongDir, perpDir, count, width, depth, gap = 5, streetId, idPrefix, side = 1 }) {
    const plots = [];
    for (let i = 0; i < count; i++) {
      const base = add(start, scale(alongDir, i * (width + gap)));
      const p0 = base;
      const p1 = add(base, scale(alongDir, width));
      const p2 = add(p1, scale(perpDir, depth * side));
      const p3 = add(p0, scale(perpDir, depth * side));
      plots.push({ id: `${idPrefix}${i}`, points: [p0, p1, p2, p3], streetIds: [streetId] });
    }
    return plots;
  }

  // ---------- הרשת עצמה ----------
  const RING_CENTER = pt(620, 210);
  const RING_R_INNER = 95;
  const RING_R_OUTER = 168;
  const RING_START_DEG = -160;
  const RING_END_DEG = 95;

  const STREETS = [
    {
      id: "ring-main",
      type: "main",
      points: arcPolyline(RING_CENTER, RING_R_INNER, RING_START_DEG, RING_END_DEG, 24),
    },
    {
      id: "entry-main",
      type: "main",
      points: [pt(520, 740), pt(520, 555), pt(553, 430), pt(590, 350)],
    },
    { id: "secondary-1", type: "secondary", points: [pt(690, 555), pt(955, 555)] },
    { id: "secondary-2", type: "secondary", points: [pt(800, 555), pt(800, 740)] },
    {
      id: "greenway-1",
      type: "greenway",
      points: [pt(RING_CENTER.x + 15, RING_CENTER.y + 55), pt(700, 340), pt(730, 430), pt(760, 530)],
    },
  ];

  function generatePlots() {
    let plots = [];

    // כיכר: 10 מגרשים טרפזיים סביב הרחוב הראשי המעוגל
    plots = plots.concat(
      radialPlots({
        center: RING_CENTER,
        startDeg: RING_START_DEG + 6,
        endDeg: RING_END_DEG - 6,
        count: 10,
        rInner: RING_R_INNER,
        rOuter: RING_R_OUTER,
        streetId: "ring-main",
        idPrefix: "ring-",
      }),
    );

    // שורות מגרשים משני צידי הכביש הראשי הנכנס (שני מקטעים ישרים בקירוב)
    const seg1a = pt(520, 740), seg1b = pt(520, 555);
    const dir1 = norm(sub(seg1b, seg1a));
    const perp1 = pt(dir1.y, -dir1.x);
    plots = plots.concat(
      rowPlots({ start: add(seg1a, scale(dir1, 8)), alongDir: dir1, perpDir: perp1, count: 3, width: 52, depth: 60, streetId: "entry-main", idPrefix: "entry-L", side: 1 }),
    );
    plots = plots.concat(
      rowPlots({ start: add(seg1a, scale(dir1, 8)), alongDir: dir1, perpDir: perp1, count: 3, width: 52, depth: 60, streetId: "entry-main", idPrefix: "entry-R", side: -1 }),
    );

    // רשת מלבנית משנית (דרום-מזרח) - שתי שורות לאורך כל רחוב משני
    const s1a = pt(690, 555), s1b = pt(955, 555);
    const dirS1 = norm(sub(s1b, s1a));
    const perpS1 = pt(dirS1.y, -dirS1.x);
    plots = plots.concat(
      rowPlots({ start: add(s1a, scale(dirS1, 6)), alongDir: dirS1, perpDir: perpS1, count: 5, width: 48, depth: 55, streetId: "secondary-1", idPrefix: "sec1-top", side: -1 }),
    );
    plots = plots.concat(
      rowPlots({ start: add(s1a, scale(dirS1, 6)), alongDir: dirS1, perpDir: perpS1, count: 5, width: 48, depth: 55, streetId: "secondary-1", idPrefix: "sec1-bot", side: 1 }),
    );

    const s2a = pt(800, 560), s2b = pt(800, 740);
    const dirS2 = norm(sub(s2b, s2a));
    const perpS2 = pt(dirS2.y, -dirS2.x);
    plots = plots.concat(
      rowPlots({ start: add(s2a, scale(dirS2, 6)), alongDir: dirS2, perpDir: perpS2, count: 3, width: 48, depth: 55, streetId: "secondary-2", idPrefix: "sec2-r", side: 1 }),
    );

    plots.forEach((p) => {
      p.landUse = null;
      p.buildingLine = null;
      p.area = polygonArea(p.points);
    });
    return plots;
  }

  const PARK_CENTER_POLYGON = arcPolyline(RING_CENTER, 62, 0, 360, 40);

  // ---------- מקרא ----------
  const BASE_LAND_USES = [
    { key: "migurim-tzmudei-karka", label: "מגורים צמודי קרקע", color: "#e8c94a", textColor: "#3a2c05" },
    { key: "migurim-ravey-komot", label: "מגורים רב-קומתי", color: "#4fb8c9", textColor: "#06282c" },
    { key: "misachar", label: "מסחר", color: "#d8622f", textColor: "#fff" },
    { key: "taasiya", label: "תעשייה / מלאכה", color: "#8a5fb0", textColor: "#fff" },
    { key: "mivne-tzibur", label: "מבנה ציבור", color: "#3f6fa8", textColor: "#fff" },
    { key: "shatach-patuach", label: 'שצ"פ', color: "#4f9f63", textColor: "#fff" },
  ];

  const RESIDENTIAL_KEYS = ["migurim-tzmudei-karka", "migurim-ravey-komot"];
  const INDUSTRIAL_KEY = "taasiya";
  const OPEN_SPACE_KEY = "shatach-patuach";

  const STREET_TYPES = [
    { key: "main", label: "רחוב ראשי", width: 34, color: "#7d7d7d", dashed: false, vehicular: true },
    { key: "secondary", label: "רחוב משני", width: 20, color: "#9a9a9a", dashed: false, vehicular: true },
    { key: "greenway", label: 'מעבר שצ"פ (הולכי רגל)', width: 12, color: "#5da36f", dashed: true, vehicular: false },
  ];

  const BUILDING_LINE_PRESETS = {
    urban: { key: "urban", label: "עירוני - קו אפס", insetFront: 3, insetSide: 3, insetBack: 3 },
    rural: { key: "rural", label: "כפרי - נסיגה קדמית וגינה", insetFront: 30, insetSide: 9, insetBack: 6 },
  };

  const MIN_OPEN_SPACE_PERCENT = 10;
  const ADJACENCY_THRESHOLD = 22;
  const STREET_ACCESS_THRESHOLD = 26;

  function streetTypeOf(streetId, streetOverrides) {
    const override = streetOverrides[streetId];
    const base = STREETS.find((s) => s.id === streetId).type;
    return override || base;
  }

  function buildingFootprint(plot, streetOverrides) {
    if (!plot.landUse || !plot.buildingLine) return null;
    const preset = BUILDING_LINE_PRESETS[plot.buildingLine];
    // סדר: [front, right, back, left] - הצלע הקדמית (0) פונה לרחוב
    const distances = [preset.insetFront, preset.insetSide, preset.insetBack, preset.insetSide];
    return insetPolygon(plot.points, distances);
  }

  const RULES = [
    {
      key: "conflict",
      title: "הפרדת שימושים סותרים",
      check(plots) {
        const painted = plots.filter((p) => p.landUse);
        const violating = new Set();
        for (let i = 0; i < painted.length; i++) {
          for (let j = i + 1; j < painted.length; j++) {
            const a = painted[i], b = painted[j];
            const pair = [a.landUse, b.landUse];
            const isConflict = pair.includes(INDUSTRIAL_KEY) && pair.some((k) => RESIDENTIAL_KEYS.includes(k));
            if (isConflict && polyPolyDist(a.points, b.points) < ADJACENCY_THRESHOLD) {
              violating.add(a.id);
              violating.add(b.id);
            }
          }
        }
        return {
          ok: violating.size === 0,
          violatingIds: [...violating],
          message:
            violating.size === 0
              ? "אין מגרשי תעשייה צמודים למגורים - טוב."
              : `${violating.size} מגרשים בהם תעשייה צמודה למגורים - מפגע סביבתי/רעש/תנועה. הפרידו ביניהם.`,
        };
      },
    },
    {
      key: "open-space",
      title: 'מינימום שצ"פ',
      check(plots) {
        const totalArea = plots.reduce((s, p) => s + p.area, 0);
        const openArea = plots.filter((p) => p.landUse === OPEN_SPACE_KEY).reduce((s, p) => s + p.area, 0);
        const percent = totalArea === 0 ? 0 : (openArea / totalArea) * 100;
        const ok = percent >= MIN_OPEN_SPACE_PERCENT;
        return {
          ok,
          violatingIds: [],
          message: ok
            ? `${percent.toFixed(0)}% שצ"פ משטח היישוב (לא כולל הכיכר הירוקה הקיימת) - עומד בדרישת המינימום (${MIN_OPEN_SPACE_PERCENT}%).`
            : `${percent.toFixed(0)}% שצ"פ בלבד, מתחת למינימום המקובל של ${MIN_OPEN_SPACE_PERCENT}% - הוסיפו עוד שטחים פתוחים.`,
        };
      },
    },
    {
      key: "access",
      title: "גישת רכב למגרשים",
      check(plots, streetOverrides) {
        const violating = [];
        plots
          .filter((p) => p.landUse && p.landUse !== OPEN_SPACE_KEY)
          .forEach((p) => {
            const hasVehicleAccess = p.streetIds.some((sid) => {
              const type = streetTypeOf(sid, streetOverrides);
              const streetDef = STREET_TYPES.find((t) => t.key === type);
              if (!streetDef.vehicular) return false;
              const street = STREETS.find((s) => s.id === sid);
              const frontMid = polygonMidpoint(p.points[0], p.points[1]);
              return pointToPolylineDist(frontMid, street.points) < STREET_ACCESS_THRESHOLD;
            });
            if (!hasVehicleAccess) violating.push(p.id);
          });
        return {
          ok: violating.length === 0,
          violatingIds: violating,
          message:
            violating.length === 0
              ? "לכל המגרשים המיועדים (מלבד שצ\"פ) יש גישת רכב מרחוב ראשי/משני - טוב."
              : `${violating.length} מגרשים מיועדים לשימוש שדורש גישת רכב אבל גובלים רק במעבר שצ"פ (הולכי רגל) - שנו את הייעוד לשצ"פ, או הפכו את הרחוב הסמוך לרחוב רכב.`,
        };
      },
    },
  ];

  return {
    STREETS,
    STREET_TYPES,
    BASE_LAND_USES,
    BUILDING_LINE_PRESETS,
    RULES,
    MIN_OPEN_SPACE_PERCENT,
    PARK_CENTER_POLYGON,
    generatePlots,
    buildingFootprint,
    pointsToPath,
    insetPolygon,
    polygonArea,
    polyPolyDist,
    pointToPolylineDist,
    streetTypeOf,
  };
})();
