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
  function insetPolygonSigned(points, distances, sign) {
    const n = points.length;
    const edges = [];
    for (let i = 0; i < n; i++) {
      const a = points[i], b = points[(i + 1) % n];
      const dir = norm(sub(b, a));
      const inward = pt(dir.y * sign, -dir.x * sign);
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

  // כיוון "פנימה" תלוי בכיוון ההיקוף (CW/CCW) של הפוליגון, שמשתנה בין מגרשים שנוצרו אלגוריתמית
  // (הכיוון קבוע) לבין מגרשים שחולצו מ-DXF אמיתי (הכיוון לא מובטח). פותרים בלי להניח כיוון:
  // מנסים את שני הכיוונים ובוחרים את זה שבאמת מכווץ את הפוליגון (שטח קטן יותר מהמקור).
  function insetPolygon(points, distances) {
    const original = Math.abs(polygonArea(points));
    const optionA = insetPolygonSigned(points, distances, 1);
    const optionB = insetPolygonSigned(points, distances, -1);
    const areaA = Math.abs(polygonArea(optionA));
    const areaB = Math.abs(polygonArea(optionB));
    if (areaA <= original && (areaA <= areaB || areaB > original)) return optionA;
    return optionB;
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
      plots.push({ id: `${idPrefix}${i}`, points: [p0, p1, p2, p3], streetIds: [streetId], frontEdge: 0 });
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
      plots.push({ id: `${idPrefix}${i}`, points: [p0, p1, p2, p3], streetIds: [streetId], frontEdge: 0 });
    }
    return plots;
  }

  // ממלא מגרשים לאורך כל מקטע ישר של רחוב (פוליליין עם כמה נקודות), עם שוליים בכל קצה מקטע
  // כדי שמגרשים לא ייכנסו לצומת עם רחוב אחר. ממלא כמה שנכנס במקטע, בלי לחרוג ובלי לחצות רחוב.
  function streetSidePlots(streetPoints, { width, depth, gap = 6, margin = 20, side = 1, streetId, idPrefix }) {
    const plots = [];
    for (let i = 0; i < streetPoints.length - 1; i++) {
      const a = streetPoints[i], b = streetPoints[i + 1];
      const segDir = norm(sub(b, a));
      const perp = pt(segDir.y, -segDir.x);
      const segLen = vlen(sub(b, a));
      const usable = segLen - 2 * margin;
      if (usable < width) continue;
      const step = width + gap;
      const count = Math.max(1, Math.floor((usable + gap) / step));
      const used = count * step - gap;
      const startOffset = margin + (usable - used) / 2;
      const segStart = add(a, scale(segDir, startOffset));
      for (let k = 0; k < count; k++) {
        const base = add(segStart, scale(segDir, k * step));
        const p0 = base;
        const p1 = add(base, scale(segDir, width));
        const p2 = add(p1, scale(perp, depth * side));
        const p3 = add(p0, scale(perp, depth * side));
        plots.push({ id: `${idPrefix}-${i}-${k}`, points: [p0, p1, p2, p3], streetIds: [streetId], frontEdge: 0 });
      }
    }
    return plots;
  }

  // ---------- הרשת עצמה ----------
  // רשת רחובות אחת מחוברת ("עץ" - כל רחוב יוצא מנקודה על רחוב אחר, אין מקטעים מנותקים).
  // תכנון עצמאי, לא מבוסס על תשריט חיצוני - נועד להיות הגיוני ולא מקוטע: כל שטח שאינו
  // רחוב מחולק למגרשים לאורך הרחוב הקרוב אליו, בלי חפיפה בין רחוב למגרש.
  const SPINE = [pt(500, 745), pt(488, 600), pt(520, 460), pt(560, 340), pt(620, 220), pt(680, 120), pt(720, 55)];
  const BRANCH_EAST = [pt(520, 460), pt(650, 445), pt(820, 435), pt(965, 425)];
  const BRANCH_WEST = [pt(620, 220), pt(480, 208), pt(320, 198), pt(150, 188)];
  const BRANCH_SW = [pt(488, 600), pt(350, 622), pt(170, 652)];
  const GREENWAY = [pt(680, 120), pt(755, 155), pt(812, 205)];
  const PARK_CENTER = pt(830, 220);
  const PARK_RADIUS = 34;

  const STREETS = [
    { id: "spine", type: "main", points: SPINE },
    { id: "branch-east", type: "secondary", points: BRANCH_EAST },
    { id: "branch-west", type: "secondary", points: BRANCH_WEST },
    { id: "branch-sw", type: "secondary", points: BRANCH_SW },
    { id: "greenway-1", type: "greenway", points: GREENWAY },
  ];

  function generatePlots() {
    let plots = [];
    const P = { width: 50, depth: 58, gap: 7, margin: 22 };

    // margin 30 בד"כ; ליד שני הצמתים עם הרחובות המשניים (מקטעים 2,3 של השדרה) צריך שוליים
    // גדולים יותר כדי שמגרש לא יחפוף למגרש בתחילת הרחוב המסתעף בזווית.
    plots = plots.concat(streetSidePlots(SPINE.slice(0, 4), { ...P, margin: 30, side: 1, streetId: "spine", idPrefix: "spine-r-a" }));
    plots = plots.concat(streetSidePlots(SPINE.slice(3), { ...P, margin: 58, side: 1, streetId: "spine", idPrefix: "spine-r-b" }));
    plots = plots.concat(streetSidePlots(SPINE, { ...P, margin: 42, side: -1, streetId: "spine", idPrefix: "spine-l" }));
    plots = plots.concat(streetSidePlots(BRANCH_EAST, { ...P, margin: 36, side: 1, streetId: "branch-east", idPrefix: "east-b" }));
    plots = plots.concat(streetSidePlots(BRANCH_EAST, { ...P, margin: 36, side: -1, streetId: "branch-east", idPrefix: "east-t" }));
    plots = plots.concat(streetSidePlots(BRANCH_WEST, { ...P, margin: 36, side: 1, streetId: "branch-west", idPrefix: "west-b" }));
    plots = plots.concat(streetSidePlots(BRANCH_WEST, { ...P, margin: 36, side: -1, streetId: "branch-west", idPrefix: "west-t" }));
    plots = plots.concat(streetSidePlots(BRANCH_SW, { ...P, side: 1, streetId: "branch-sw", idPrefix: "sw-b" }));
    plots = plots.concat(streetSidePlots(BRANCH_SW, { ...P, side: -1, streetId: "branch-sw", idPrefix: "sw-t" }));

    plots.forEach((p) => {
      p.landUse = null;
      p.buildingLine = null;
      p.area = polygonArea(p.points);
    });
    return plots;
  }

  const PARK_CENTER_POLYGON = arcPolyline(PARK_CENTER, PARK_RADIUS, 0, 360, 40);

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

  function buildingFootprint(plot) {
    if (!plot.landUse || !plot.buildingLine) return null;
    const preset = BUILDING_LINE_PRESETS[plot.buildingLine];
    const n = plot.points.length;
    // מגרשים עם frontEdge מוגדר (טרפזי כיכר/שורות מלבניות) מקבלים נסיגה א-סימטרית:
    // הצלע הקדמית פונה לרחוב, הנגדית לאחור, השאר צדדים. מגרשים אמיתיים ללא frontEdge
    // (חולצו מתשריט אמיתי, לאו דווקא ריבוע) מקבלים נסיגה אחידה בכל הצלעות.
    let distances;
    if (typeof plot.frontEdge === "number" && n === 4) {
      distances = [0, 0, 0, 0];
      distances[plot.frontEdge] = preset.insetFront;
      distances[(plot.frontEdge + 1) % 4] = preset.insetSide;
      distances[(plot.frontEdge + 2) % 4] = preset.insetBack;
      distances[(plot.frontEdge + 3) % 4] = preset.insetSide;
    } else {
      distances = new Array(n).fill(preset.insetSide);
    }
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
              const minDist = Math.min(...p.points.map((pt) => pointToPolylineDist(pt, street.points)));
              return minDist < STREET_ACCESS_THRESHOLD;
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
