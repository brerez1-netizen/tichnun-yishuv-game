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
  // 112 מגרשים אמיתיים, חולצו בעזרת הפקודה BOUNDARY באוטוקאד מתוך תשריט אליכין
  // (457-1194877) - ארז לחץ בפנים כל מגרש בתשריט המקורי וקיבל פוליליין סגור מדויק
  // סביבו. אלה הצורות והגדלים האמיתיים, לא סימולציה. הרחובות עצמם לא נלחצו בתשריט
  // (הם הרווח הריק בין המגרשים) - כאן הם נבנו ידנית כדי לעבור בדיוק דרך הרווחים.
  const REAL_PLOTS_RAW = [
    { id: "rp0", points: [pt(648.9,264.7), pt(637.1,229.6), pt(634.7,221.6), pt(560.9,244.4), pt(572.3,283.0), pt(586.3,320.7), pt(658.9,289.5)] },
    { id: "rp1", points: [pt(731.1,261.5), pt(660.3,292.6), pt(698.2,364.3), pt(763.6,323.0)] },
    { id: "rp2", points: [pt(619.9,153.6), pt(546.3,166.6), pt(560.9,244.4), pt(634.7,221.6)] },
    { id: "rp5", points: [pt(342.2,417.8), pt(312.5,443.2), pt(290.3,477.3), pt(282.4,499.3), pt(292.2,501.2), pt(296.8,507.9), pt(334.7,515.0), pt(347.8,486.3), pt(369.9,464.8)] },
    { id: "rp8", points: [pt(464.3,605.3), pt(435.7,617.5), pt(412.6,619.5), pt(404.7,618.8), pt(397.4,656.6), pt(402.0,663.3), pt(400.2,673.0), pt(455.6,668.3), pt(495.5,649.3)] },
    { id: "rp9", points: [pt(332.4,542.3), pt(332.9,523.3), pt(295.2,516.0), pt(288.4,520.6), pt(278.6,518.7), pt(278.4,549.3), pt(285.5,580.8), pt(301.7,613.0), pt(346.7,582.6)] },
    { id: "rp10", points: [pt(396.7,617.2), pt(368.4,604.5), pt(346.5,582.7), pt(301.6,613.0), pt(309.1,623.0), pt(346.4,655.0), pt(380.7,669.2), pt(382.6,659.6), pt(389.4,655.0)] },
    { id: "rp11", points: [pt(911.7,132.5), pt(908.6,109.7), pt(899.9,104.0), pt(896.3,95.3), pt(844.2,85.2), pt(837.0,122.3), pt(851.5,125.0), pt(868.5,172.6), pt(917.2,155.3)] },
    { id: "rp12", points: [pt(802.1,77.0), pt(720.6,61.2), pt(715.8,74.1), pt(718.3,117.8), pt(722.5,138.2), pt(727.1,139.0), pt(756.0,128.6), pt(760.0,107.6), pt(794.9,114.2)] },
    { id: "rp13", points: [pt(692.5,114.6), pt(657.5,104.4), pt(623.0,109.7), pt(629.4,151.9), pt(619.9,153.6), pt(621.7,164.7), pt(623.7,175.7), pt(699.1,159.4)] },
    { id: "rp14", points: [pt(281.3,166.3), pt(243.7,159.1), pt(236.9,194.7), pt(331.5,212.8), pt(338.3,177.3), pt(300.7,170.0), pt(295.4,198.2), pt(307.5,134.6), pt(288.1,130.8)] },
    { id: "rp17", points: [pt(581.8,72.9), pt(574.1,101.3), pt(548.5,105.5), pt(542.3,100.7), pt(543.0,127.5), pt(580.9,116.9), pt(657.5,104.4), pt(692.5,114.6), pt(690.8,93.2)] },
    { id: "rp19", points: [pt(851.5,125.0), pt(760.0,107.6), pt(756.0,128.6), pt(727.1,139.0), pt(720.1,132.3), pt(725.1,161.0), pt(765.7,146.4), pt(796.6,136.9), pt(807.9,140.9), pt(815.4,151.0), pt(855.5,136.1)] },
    { id: "rp22", points: [pt(699.1,159.4), pt(623.7,175.7), pt(633.8,218.3), pt(707.6,195.8)] },
    { id: "rp23", points: [pt(362.1,242.1), pt(340.8,238.2), pt(333.5,276.8), pt(342.5,307.2), pt(399.7,290.1), pt(386.8,256.8)] },
    { id: "rp27", points: [pt(812.5,246.5), pt(797.1,253.8), pt(784.2,238.8), pt(760.4,248.5), pt(757.0,258.5), pt(783.3,307.6), pt(829.6,278.7)] },
    { id: "rp30", points: [pt(901.5,311.8), pt(892.5,300.6), pt(861.8,325.0), pt(862.3,341.3), pt(889.4,374.5), pt(927.6,343.8)] },
    { id: "rp31", points: [pt(840.0,217.1), pt(805.8,233.9), pt(788.7,222.3), pt(775.2,184.4), pt(821.9,168.3)] },
    { id: "rp32", points: [pt(834.2,286.0), pt(787.8,314.7), pt(815.7,353.4), pt(823.2,355.2), pt(845.8,337.6), pt(842.4,326.0), pt(855.4,316.0)] },
    { id: "rp33", points: [pt(259.3,414.1), pt(206.1,370.5), pt(196.1,422.7), pt(239.4,445.7)] },
    { id: "rp35", points: [pt(342.5,307.2), pt(333.5,276.9), pt(296.1,269.9), pt(294.5,278.0), pt(278.8,288.6), pt(302.8,324.3)] },
    { id: "rp36", points: [pt(255.5,357.7), pt(231.0,320.9), pt(222.6,326.5), pt(214.8,324.9), pt(207.7,362.1), pt(206.1,370.5), pt(227.4,388.0)] },
    { id: "rp37", points: [pt(176.8,199.9), pt(131.7,191.2), pt(116.5,227.8), pt(167.6,237.6), pt(168.9,233.2)] },
    { id: "rp38", points: [pt(840.4,218.0), pt(805.8,233.9), pt(829.6,278.7), pt(861.8,258.5)] },
    { id: "rp39", points: [pt(239.4,445.7), pt(196.1,422.7), pt(186.8,470.8), pt(223.8,477.6), pt(227.2,473.7)] },
    { id: "rp40", points: [pt(623.0,109.7), pt(580.9,116.9), pt(588.4,159.2), pt(629.4,151.9)] },
    { id: "rp41", points: [pt(281.9,380.1), pt(261.1,355.6), pt(227.4,388.0), pt(259.3,414.1), pt(264.4,407.8), pt(282.7,387.8)] },
    { id: "rp42", points: [pt(765.7,146.4), pt(725.1,161.0), pt(731.8,189.2), pt(734.5,198.5), pt(779.6,182.9)] },
    { id: "rp43", points: [pt(319.8,315.9), pt(283.6,336.0), pt(283.2,346.1), pt(303.9,370.3), pt(336.2,353.6)] },
    { id: "rp44", points: [pt(381.7,185.7), pt(338.3,177.3), pt(331.5,212.8), pt(377.3,218.9), pt(384.7,215.3)] },
    { id: "rp45", points: [pt(580.9,116.9), pt(547.4,123.3), pt(543.0,127.5), pt(544.3,147.1), pt(546.3,166.6), pt(588.4,159.2)] },
    { id: "rp46", points: [pt(877.2,281.9), pt(866.3,266.1), pt(834.2,286.0), pt(861.8,325.0), pt(892.5,300.6)] },
    { id: "rp47", points: [pt(408.1,321.1), pt(399.6,290.1), pt(360.1,302.1), pt(371.2,341.8), pt(403.1,331.2)] },
    { id: "rp48", points: [pt(815.4,151.0), pt(807.9,140.9), pt(796.6,136.9), pt(765.7,146.4), pt(779.6,182.9), pt(821.9,168.3)] },
    { id: "rp49", points: [pt(855.5,136.1), pt(815.4,151.0), pt(828.9,187.1), pt(868.5,172.6)] },
    { id: "rp50", points: [pt(94.0,399.2), pt(48.8,390.5), pt(40.0,424.2), pt(85.9,433.0)] },
    { id: "rp51", points: [pt(360.1,301.9), pt(319.8,315.9), pt(336.2,353.6), pt(344.7,350.0), pt(371.2,341.8)] },
    { id: "rp52", points: [pt(932.1,286.9), pt(901.5,311.8), pt(927.6,343.8), pt(958.2,318.9)] },
    { id: "rp53", points: [pt(844.2,85.2), pt(802.1,77.0), pt(794.9,114.2), pt(837.0,122.3)] },
    { id: "rp54", points: [pt(862.3,341.2), pt(834.8,369.3), pt(834.5,375.3), pt(848.4,390.0), pt(864.6,393.0), pt(889.5,374.5)] },
    { id: "rp55", points: [pt(652.3,48.0), pt(610.1,40.0), pt(603.1,76.9), pt(645.1,84.7)] },
    { id: "rp56", points: [pt(690.1,64.3), pt(687.9,54.8), pt(652.3,48.0), pt(645.1,84.7), pt(690.8,93.2)] },
    { id: "rp57", points: [pt(430.0,170.0), pt(400.4,171.5), pt(404.5,212.6), pt(414.2,217.6), pt(421.0,226.1), pt(437.9,222.8)] },
    { id: "rp58", points: [pt(266.2,223.8), pt(227.0,216.3), pt(222.4,216.2), pt(218.8,234.5), pt(234.9,258.2), pt(258.7,262.7)] },
    { id: "rp59", points: [pt(210.7,240.0), pt(192.4,236.5), pt(190.6,241.5), pt(183.2,280.1), pt(222.0,287.6), pt(226.7,263.6)] },
    { id: "rp60", points: [pt(185.4,154.8), pt(149.6,147.9), pt(134.8,183.4), pt(178.4,191.7)] },
    { id: "rp61", points: [pt(278.7,551.6), pt(277.7,534.3), pt(278.6,518.8), pt(246.1,512.8), pt(244.7,538.9), pt(247.2,564.9), pt(279.6,558.3)] },
    { id: "rp62", points: [pt(344.3,653.7), pt(326.7,681.7), pt(374.5,701.8), pt(380.7,669.2)] },
    { id: "rp63", points: [pt(301.3,612.6), pt(294.5,601.4), pt(290.8,594.1), pt(261.7,609.7), pt(267.5,620.8), pt(289.7,651.1), pt(313.9,628.6)] },
    { id: "rp64", points: [pt(303.5,230.9), pt(266.2,223.8), pt(258.7,262.7), pt(296.0,269.9)] },
    { id: "rp65", points: [pt(340.8,238.2), pt(303.5,230.9), pt(296.0,269.9), pt(333.5,276.9)] },
    { id: "rp66", points: [pt(200.5,399.4), pt(161.6,392.0), pt(154.5,429.3), pt(193.4,436.7)] },
    { id: "rp67", points: [pt(206.1,370.5), pt(207.7,362.1), pt(168.9,354.7), pt(161.6,392.0), pt(200.5,399.4)] },
    { id: "rp68", points: [pt(214.8,324.9), pt(176.0,317.4), pt(168.9,354.7), pt(207.7,362.1)] },
    { id: "rp69", points: [pt(102.1,365.5), pt(62.4,357.8), pt(48.8,390.5), pt(94.0,399.2)] },
    { id: "rp70", points: [pt(135.2,407.2), pt(94.0,399.2), pt(85.9,433.0), pt(128.6,441.3)] },
    { id: "rp71", points: [pt(269.7,445.6), pt(249.8,493.1), pt(282.4,499.4), pt(288.6,481.1), pt(296.4,465.7)] },
    { id: "rp72", points: [pt(141.7,373.2), pt(102.1,365.5), pt(94.0,399.2), pt(135.2,407.2)] },
    { id: "rp73", points: [pt(316.2,439.2), pt(320.1,435.3), pt(299.2,409.4), pt(283.2,426.5), pt(269.7,445.6), pt(296.4,465.7), pt(303.5,454.6)] },
    { id: "rp74", points: [pt(243.7,159.1), pt(206.3,151.9), pt(201.1,180.6), pt(210.5,193.0), pt(236.9,194.7)] },
    { id: "rp75", points: [pt(377.9,148.1), pt(345.2,141.8), pt(338.3,177.3), pt(381.7,185.7)] },
    { id: "rp76", points: [pt(284.3,577.5), pt(279.6,558.3), pt(247.2,564.9), pt(256.9,598.9), pt(261.7,609.7), pt(290.7,594.2)] },
    { id: "rp77", points: [pt(288.1,130.8), pt(250.6,123.6), pt(243.7,159.1), pt(281.3,166.3)] },
    { id: "rp78", points: [pt(250.6,123.6), pt(213.0,116.4), pt(206.2,151.9), pt(243.7,159.1)] },
    { id: "rp79", points: [pt(345.2,141.8), pt(307.5,134.6), pt(300.7,170.0), pt(338.3,177.3)] },
    { id: "rp80", points: [pt(193.6,112.7), pt(166.1,107.4), pt(149.6,147.9), pt(185.4,154.8)] },
    { id: "rp81", points: [pt(85.9,433.0), pt(40.0,424.2), pt(41.2,450.9), pt(50.5,458.5), pt(78.4,464.3)] },
    { id: "rp82", points: [pt(442.2,239.9), pt(423.2,242.0), pt(416.8,253.7), pt(414.7,260.4), pt(424.6,291.0), pt(453.8,283.2)] },
    { id: "rp83", points: [pt(427.4,134.1), pt(389.7,126.9), pt(391.2,150.6), pt(398.3,151.9), pt(400.5,171.5), pt(430.0,170.0)] },
    { id: "rp84", points: [pt(148.3,339.0), pt(112.2,332.1), pt(102.1,365.5), pt(141.7,373.2)] },
    { id: "rp85", points: [pt(112.2,332.1), pt(76.0,325.1), pt(62.4,357.8), pt(102.1,365.5)] },
    { id: "rp86", points: [pt(128.6,441.3), pt(85.9,433.0), pt(78.4,464.3), pt(114.1,467.7), pt(123.5,459.8)] },
    { id: "rp87", points: [pt(434.8,672.7), pt(403.1,673.3), pt(393.9,705.5), pt(416.0,707.0), pt(438.1,705.7)] },
    { id: "rp88", points: [pt(467.7,664.2), pt(434.8,672.7), pt(438.1,705.7), pt(480.5,694.7)] },
    { id: "rp89", points: [pt(462.3,280.9), pt(424.6,291.0), pt(431.3,311.8), pt(439.3,320.5), pt(449.5,320.8), pt(471.2,315.0)] },
    { id: "rp90", points: [pt(400.4,171.5), pt(398.3,151.9), pt(377.9,148.1), pt(381.7,185.7), pt(384.7,215.4), pt(404.5,212.6)] },
    { id: "rp92", points: [pt(505.7,170.9), pt(477.4,173.5), pt(484.2,217.8), pt(512.0,212.5)] },
    { id: "rp93", points: [pt(122.2,298.8), pt(89.6,292.5), pt(76.0,325.1), pt(112.2,332.1)] },
    { id: "rp94", points: [pt(154.8,305.0), pt(122.2,298.8), pt(112.2,332.1), pt(148.3,339.0)] },
    { id: "rp95", points: [pt(470.4,236.8), pt(442.2,239.9), pt(453.8,283.2), pt(481.1,275.9)] },
    { id: "rp96", points: [pt(484.2,217.6), pt(512.0,212.5), pt(518.3,241.9), pt(520.7,251.6), pt(493.4,259.3)] },
    { id: "rp97", points: [pt(805.8,233.9), pt(796.3,224.7), pt(780.0,222.8), pt(754.8,232.8), pt(745.0,229.6), pt(750.7,244.1), pt(757.0,258.5), pt(760.4,248.5), pt(784.2,238.8), pt(797.1,253.8), pt(812.5,246.5)] },
    { id: "rp98", points: [pt(349.5,119.1), pt(302.2,110.1), pt(297.9,132.7), pt(307.5,134.6), pt(345.2,141.8)] },
    { id: "rp99", points: [pt(255.0,101.0), pt(207.7,91.8), pt(203.3,114.5), pt(213.0,116.4), pt(250.6,123.6)] },
    { id: "rp100", points: [pt(302.2,110.1), pt(255.0,101.0), pt(250.6,123.6), pt(288.1,130.8), pt(297.9,132.7)] },
    { id: "rp101", points: [pt(132.0,266.5), pt(102.8,260.8), pt(89.6,292.5), pt(122.2,298.8)] },
    { id: "rp102", points: [pt(161.2,272.1), pt(132.0,266.5), pt(122.2,298.8), pt(154.8,305.0)] },
    { id: "rp103", points: [pt(142.2,232.7), pt(116.5,227.8), pt(102.8,260.8), pt(132.0,266.5)] },
    { id: "rp104", points: [pt(167.7,238.4), pt(142.2,232.7), pt(132.0,266.5), pt(161.2,272.1)] },
    { id: "rp105", points: [pt(402.0,663.3), pt(389.4,655.0), pt(382.6,659.6), pt(374.5,701.8), pt(379.3,702.9), pt(393.9,705.5)] },
    { id: "rp106", points: [pt(383.0,125.6), pt(349.5,119.1), pt(345.2,141.8), pt(377.9,148.1), pt(384.5,149.4)] },
    { id: "rp107", points: [pt(207.7,91.8), pt(173.8,85.4), pt(166.1,107.4), pt(203.3,114.5)] },
    { id: "rp108", points: [pt(503.5,148.8), pt(474.6,143.2), pt(477.4,173.5), pt(505.7,170.9), pt(505.0,165.4)] },
    { id: "rp109", points: [pt(178.4,191.7), pt(134.8,183.4), pt(131.6,191.2), pt(176.8,199.9)] },
    { id: "rp110", points: [pt(296.8,507.9), pt(295.2,516.0), pt(333.0,523.3), pt(334.4,515.1)] },
    { id: "rp111", points: [pt(223.8,477.6), pt(186.8,470.8), pt(185.3,478.9), pt(210.7,483.0)] },
  ];

  // הרחובות עצמם - נבנו ידנית לאורך הרווחים הריקים בין מקבצי המגרשים. הכיכר (רדיוס 95)
  // מתחברת בנקודה משותפת בדיוק לכביש שבא מצפון-מערב, ומסתעפת ממנה נקודת חיבור נוספת
  // לכיוון צפון-מזרח שמובילה לשני המקבצים הנוספים - כל הרשת רצף אחד מחובר.
  const ROUNDABOUT_CENTER = pt(390, 590);
  const ROUNDABOUT_R = 95;
  const RING_A = arcPolyline(ROUNDABOUT_CENTER, ROUNDABOUT_R, -150, -60, 14);
  const RING_B = arcPolyline(ROUNDABOUT_CENTER, ROUNDABOUT_R, -60, 150, 30);
  const RING = [...RING_A, ...RING_B.slice(1)];
  const NW_STREET = [pt(215, 90), pt(245, 160), pt(285, 225), pt(300, 280), pt(295, 335), pt(260, 390), pt(255, 435), RING[0]];
  const MID_CONNECTOR = [RING_A[RING_A.length - 1], pt(480, 415), pt(520, 345), pt(560, 275), pt(600, 235)];
  const NE_STREET = [pt(700, 90), pt(650, 130), pt(618, 175), pt(605, 245), MID_CONNECTOR[MID_CONNECTOR.length - 1]];
  const FAR_NE_STREET = [NE_STREET[0], pt(760, 110), pt(810, 140), pt(860, 180)];

  const STREETS = [
    { id: "roundabout", type: "main", points: RING },
    { id: "nw-street", type: "secondary", points: NW_STREET },
    { id: "mid-connector", type: "secondary", points: MID_CONNECTOR },
    { id: "ne-street", type: "secondary", points: NE_STREET },
    { id: "far-ne-street", type: "greenway", points: FAR_NE_STREET },
  ];

  // כל מגרש מקבל אוטומטית את הרחוב הקרוב אליו ביותר (לפי מרחק מהצומת שלו) - אין צורך
  // בשיוך ידני, וזה גם מתקן את עצמו אם קואורדינטות הרחוב מתעדכנות.
  function nearestStreetId(plot) {
    let best = null, bestD = Infinity;
    STREETS.forEach((s) => {
      const d = Math.min(...plot.points.map((pnt) => pointToPolylineDist(pnt, s.points)));
      if (d < bestD) { bestD = d; best = s.id; }
    });
    return best;
  }

  function generatePlots() {
    const plots = REAL_PLOTS_RAW.map((p) => ({ ...p, points: p.points }));
    plots.forEach((p) => {
      p.streetIds = [nearestStreetId(p)];
      p.landUse = null;
      p.buildingLine = null;
      p.area = polygonArea(p.points);
    });
    return plots;
  }

  const PARK_POLYGONS = [arcPolyline(ROUNDABOUT_CENTER, 28, 0, 360, 36)];

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
            ? `${percent.toFixed(0)}% שצ"פ משטח היישוב (לא כולל השטחים הירוקים הקיימים) - עומד בדרישת המינימום (${MIN_OPEN_SPACE_PERCENT}%).`
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
    PARK_POLYGONS,
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
