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
  // ארז צבע את התשריט לפי שכבות - כחול=כבישים, ירוק=שצ"פ קיים, חום=מבני ציבור קיימים -
  // והריץ BOUNDARY על כולם. הרחובות (STREETS) קבועים ולא אינטראקטיביים - זה כבר הרוחב
  // האמיתי מהתשריט, אין למה "להרחיב או להצר". כל שאר הצורות (מגרשי בנייה "rp", שצ"פ
  // קיים "park", מבני ציבור קיימים "bld") הן מגרשים לכל דבר - ניתנות לבחירה ולשינוי
  // ייעוד על ידי הסטודנט; לשצ"פ/מבני ציבור פשוט יש ייעוד התחלתי (presetLandUse) שמשקף
  // את המצב הקיים בפועל. "gap" הם אזורים שהיו רווח ריק בתשריט המקורי (בלי פוליגון) -
  // זוהו אוטומטית כשטחים סגורים בין מגרשים/רחובות קיימים ונוספו כמגרשים ריקים לבחירה.
  const REAL_PLOTS_RAW = [
    { id: "rp0", points: [pt(343.8,266.8), pt(305.6,259.4), pt(299.6,290.7), pt(339.9,296.1), pt(346.5,292.9)] },
    { id: "rp1", points: [pt(300.4,581.0), pt(300.8,564.2), pt(267.6,557.9), pt(261.6,561.8), pt(253.0,560.2), pt(252.8,587.2), pt(259.1,614.9), pt(273.3,643.3), pt(313.0,616.5)] },
    { id: "rp2", points: [pt(309.1,471.3), pt(282.9,493.7), pt(263.3,523.7), pt(256.4,543.1), pt(265.0,544.8), pt(269.0,550.7), pt(302.4,557.0), pt(313.9,531.7), pt(333.5,512.7)] },
    { id: "rp3", points: [pt(839.9,346.9), pt(828.7,356.0), pt(851.7,384.2), pt(862.9,375.0)] },
    { id: "rp4", points: [pt(828.7,356.0), pt(801.8,377.9), pt(824.8,406.1), pt(851.7,384.2)] },
    { id: "rp5", points: [pt(888.3,346.0), pt(865.9,325.8), pt(839.9,346.9), pt(862.9,375.0), pt(884.3,357.0)] },
    { id: "rp6", points: [pt(340.5,233.7), pt(311.7,228.2), pt(305.6,259.4), pt(343.8,266.8)] },
    { id: "rp7", points: [pt(311.7,228.2), pt(278.5,221.8), pt(272.5,253.1), pt(305.6,259.4)] },
    { id: "rp8", points: [pt(272.5,253.1), pt(278.5,221.8), pt(261.4,218.5), pt(249.4,281.1), pt(255.4,249.8), pt(222.3,243.4), pt(216.3,274.7), pt(272.4,285.5), pt(299.6,290.7), pt(305.6,259.4), pt(272.5,253.1), pt(266.8,284.5)] },
    { id: "rp9", points: [pt(170.9,239.6), pt(139.4,233.5), pt(126.4,264.8), pt(164.7,272.1)] },
    { id: "rp10", points: [pt(164.7,272.1), pt(126.4,264.8), pt(123.5,271.7), pt(163.3,279.3)] },
    { id: "rp11", points: [pt(163.3,279.3), pt(123.6,271.7), pt(110.2,303.9), pt(155.3,312.6), pt(156.4,308.7)] },
    { id: "rp12", points: [pt(155.3,313.3), pt(132.8,308.3), pt(123.8,338.0), pt(149.6,343.0)] },
    { id: "rp13", points: [pt(132.8,308.3), pt(110.2,303.9), pt(98.1,333.0), pt(123.8,338.0)] },
    { id: "rp14", points: [pt(123.8,338.0), pt(98.1,333.0), pt(86.5,360.9), pt(115.2,366.4)] },
    { id: "rp15", points: [pt(149.6,343.0), pt(123.8,338.0), pt(115.2,366.4), pt(144.0,372.0)] },
    { id: "rp16", points: [pt(144.0,372.0), pt(115.2,366.4), pt(106.4,395.8), pt(138.2,401.9)] },
    { id: "rp17", points: [pt(115.2,366.4), pt(86.5,360.9), pt(74.5,389.7), pt(106.4,395.8)] },
    { id: "rp18", points: [pt(106.4,395.8), pt(74.5,389.7), pt(62.5,418.5), pt(97.5,425.2)] },
    { id: "rp19", points: [pt(138.2,401.9), pt(106.4,395.8), pt(97.5,425.2), pt(132.4,432.0)] },
    { id: "rp20", points: [pt(132.4,432.0), pt(97.5,425.2), pt(90.4,455.0), pt(126.7,462.0)] },
    { id: "rp21", points: [pt(97.5,425.2), pt(62.5,418.5), pt(50.5,447.3), pt(90.4,455.0)] },
    { id: "rp22", points: [pt(126.7,462.0), pt(90.4,455.0), pt(83.2,484.7), pt(120.9,492.0)] },
    { id: "rp23", points: [pt(90.4,455.0), pt(50.5,447.3), pt(42.8,477.0), pt(83.2,484.7)] },
    { id: "rp24", points: [pt(83.2,484.7), pt(42.8,477.0), pt(43.9,500.4), pt(52.1,507.1), pt(76.6,512.3)] },
    { id: "rp25", points: [pt(120.9,492.0), pt(83.2,484.7), pt(76.6,512.3), pt(108.0,515.2), pt(116.3,508.3)] },
    { id: "rp26", points: [pt(196.8,389.4), pt(162.6,382.8), pt(156.3,415.7), pt(190.5,422.3)] },
    { id: "rp27", points: [pt(189.1,429.7), pt(190.5,422.3), pt(156.3,415.7), pt(150.0,448.6), pt(184.2,455.1)] },
    { id: "rp28", points: [pt(184.2,455.1), pt(150.0,448.6), pt(143.7,481.4), pt(177.9,488.0)] },
    { id: "rp29", points: [pt(204.7,524.0), pt(172.2,518.0), pt(170.8,525.1), pt(193.2,528.8)] },
    { id: "rp30", points: [pt(218.5,495.9), pt(180.3,475.6), pt(172.2,518.0), pt(204.7,524.0), pt(207.7,520.5)] },
    { id: "rp31", points: [pt(236.0,468.0), pt(189.1,429.7), pt(180.3,475.6), pt(218.5,495.9)] },
    { id: "rp32", points: [pt(255.9,438.1), pt(237.6,416.5), pt(207.9,445.0), pt(236.0,468.0), pt(240.5,462.5), pt(256.6,444.9)] },
    { id: "rp33", points: [pt(232.6,418.4), pt(211.1,386.0), pt(203.7,390.9), pt(196.8,389.4), pt(190.5,422.3), pt(189.1,429.7), pt(207.9,445.0)] },
    { id: "rp34", points: [pt(307.8,313.1), pt(274.9,306.7), pt(268.4,341.0), pt(301.3,347.2)] },
    { id: "rp35", points: [pt(274.9,306.7), pt(242.1,300.4), pt(235.5,334.7), pt(268.4,341.0)] },
    { id: "rp36", points: [pt(242.1,300.4), pt(207.5,293.8), pt(203.5,293.7), pt(200.4,309.8), pt(214.5,330.7), pt(235.5,334.7)] },
    { id: "rp37", points: [pt(193.2,314.7), pt(177.1,311.6), pt(175.5,316.0), pt(169.0,350.0), pt(203.2,356.6), pt(207.2,335.5)] },
    { id: "rp38", points: [pt(963.5,355.7), pt(947.6,336.3), pt(920.6,358.2), pt(936.3,377.5)] },
    { id: "rp39", points: [pt(936.4,377.6), pt(920.5,358.2), pt(893.5,380.1), pt(909.3,399.4)] },
    { id: "rp40", points: [pt(909.3,399.4), pt(893.5,380.1), pt(866.4,402.1), pt(882.1,421.3)] },
    { id: "rp41", points: [pt(882.1,421.3), pt(866.4,402.1), pt(839.4,424.0), pt(855.0,443.1)] },
    { id: "rp42", points: [pt(855.0,443.1), pt(839.4,424.0), pt(812.3,446.0), pt(827.8,465.0)] },
    { id: "rp43", points: [pt(827.8,465.0), pt(812.3,446.0), pt(785.3,467.9), pt(800.7,486.9)] },
    { id: "rp44", points: [pt(651.6,333.6), pt(588.0,358.3), pt(622.7,424.2), pt(680.3,387.8)] },
    { id: "rp45", points: [pt(623.4,243.7), pt(557.0,258.0), pt(565.9,295.5), pt(631.0,275.7)] },
    { id: "rp46", points: [pt(747.6,294.5), pt(717.5,309.3), pt(702.4,299.1), pt(690.5,265.7), pt(731.6,251.5)] },
    { id: "rp47", points: [pt(513.9,501.2), pt(488.0,517.4), pt(508.2,546.1), pt(533.7,527.9)] },
    { id: "rp48", points: [pt(558.6,516.4), pt(536.9,532.2), pt(543.1,540.8), pt(563.2,566.2), pt(584.3,549.3)] },
    { id: "rp49", points: [pt(518.0,649.5), pt(505.8,626.7), pt(474.8,651.2), pt(492.9,673.7)] },
    { id: "rp50", points: [pt(492.9,673.7), pt(474.8,651.2), pt(447.7,672.8), pt(464.8,696.3)] },
    { id: "rp51", points: [pt(310.9,679.1), pt(295.4,703.8), pt(337.5,721.5), pt(343.0,692.8)] },
    { id: "rp52", points: [pt(253.1,589.2), pt(252.2,574.0), pt(253.0,560.2), pt(224.3,555.0), pt(223.1,578.0), pt(225.4,600.9), pt(253.9,595.0)] },
    { id: "rp53", points: [pt(357.0,646.9), pt(332.1,635.8), pt(312.9,616.5), pt(273.3,643.3), pt(279.8,652.1), pt(312.8,680.2), pt(343.0,692.8), pt(344.6,684.3), pt(350.6,680.2)] },
    { id: "rp54", points: [pt(416.6,636.5), pt(391.4,647.3), pt(371.1,649.0), pt(364.1,648.4), pt(357.7,681.7), pt(361.8,687.6), pt(360.1,696.1), pt(409.0,692.0), pt(444.1,675.3)] },
    { id: "rp55", points: [pt(556.4,199.8), pt(519.3,206.2), pt(526.0,243.5), pt(562.0,237.0)] },
    { id: "rp56", points: [pt(519.3,206.2), pt(489.8,211.8), pt(485.9,215.5), pt(487.1,232.8), pt(488.9,250.1), pt(526.0,243.5)] },
    { id: "rp57", points: [pt(520.1,167.5), pt(513.3,192.5), pt(490.8,196.2), pt(485.3,191.9), pt(485.9,215.5), pt(519.3,206.2), pt(586.8,195.3), pt(617.6,204.2), pt(616.1,185.4)] },
    { id: "rp58", points: [pt(615.5,159.9), pt(613.6,151.5), pt(582.2,145.6), pt(575.9,177.9), pt(616.1,185.4)] },
    { id: "rp59", points: [pt(582.2,145.6), pt(545.0,138.5), pt(538.8,171.0), pt(575.9,177.9)] },
    { id: "rp60", points: [pt(801.8,377.9), pt(793.8,368.1), pt(766.8,389.5), pt(767.2,403.9), pt(791.1,433.2), pt(824.8,406.1)] },
    { id: "rp61", points: [pt(780.3,351.6), pt(770.8,337.7), pt(742.5,355.2), pt(766.8,389.5), pt(793.8,368.1)] },
    { id: "rp62", points: [pt(761.2,223.2), pt(725.9,236.3), pt(737.8,268.1), pt(772.7,255.3)] },
    { id: "rp63", points: [pt(810.8,219.9), pt(808.0,199.8), pt(800.3,194.9), pt(797.2,187.2), pt(751.3,178.3), pt(744.9,211.0), pt(757.7,213.4), pt(772.7,255.3), pt(815.6,240.0)] },
    { id: "rp64", points: [pt(751.3,178.3), pt(714.2,171.1), pt(707.8,203.9), pt(744.9,211.0)] },
    { id: "rp65", points: [pt(190.5,184.2), pt(160.7,178.5), pt(153.9,197.9), pt(186.7,204.1)] },
    { id: "rp66", points: [pt(178.1,202.5), pt(153.9,197.9), pt(139.4,233.5), pt(170.9,239.6)] },
    { id: "rp67", points: [pt(228.3,212.1), pt(195.3,205.8), pt(189.2,237.1), pt(222.3,243.4)] },
    { id: "rp68", points: [pt(232.2,192.2), pt(190.5,184.2), pt(186.7,204.1), pt(195.3,205.8), pt(228.3,212.1)] },
    { id: "rp69", points: [pt(261.4,218.5), pt(228.3,212.1), pt(222.3,243.4), pt(255.4,249.8)] },
    { id: "rp70", points: [pt(273.8,200.2), pt(232.2,192.2), pt(228.3,212.1), pt(261.4,218.5), pt(270.0,220.1)] },
    { id: "rp71", points: [pt(315.4,208.2), pt(273.8,200.2), pt(270.0,220.1), pt(278.5,221.8), pt(311.7,228.2)] },
    { id: "rp72", points: [pt(345.0,213.9), pt(315.4,208.2), pt(311.7,228.2), pt(340.5,233.7), pt(346.3,234.8)] },
    { id: "rp73", points: [pt(384.1,221.4), pt(350.9,215.0), pt(352.2,236.0), pt(358.5,237.1), pt(360.4,254.3), pt(386.4,253.0)] },
    { id: "rp74", points: [pt(360.3,254.3), pt(358.5,237.1), pt(340.5,233.7), pt(343.8,266.8), pt(346.5,293.0), pt(363.9,290.5)] },
    { id: "rp75", points: [pt(414.8,350.7), pt(381.6,359.6), pt(387.5,377.9), pt(394.5,385.6), pt(403.5,385.9), pt(422.6,380.7)] },
    { id: "rp76", points: [pt(422.0,311.9), pt(397.1,314.6), pt(407.3,352.7), pt(431.4,346.3)] },
    { id: "rp77", points: [pt(458.6,290.5), pt(434.1,295.1), pt(442.2,331.7), pt(466.3,324.9), pt(464.1,316.3)] },
    { id: "rp78", points: [pt(451.2,234.3), pt(425.7,229.4), pt(428.1,256.1), pt(453.0,253.8), pt(452.5,249.0)] },
    { id: "rp79", points: [pt(727.0,449.3), pt(708.8,427.9), pt(654.6,469.5), pt(673.4,491.8)] },
    { id: "rp80", points: [pt(691.9,513.0), pt(673.3,491.8), pt(618.5,535.3), pt(632.1,548.0), pt(648.6,547.6)] },
    { id: "rp81", points: [pt(719.0,552.6), pt(703.7,533.6), pt(669.9,561.6), pt(668.0,581.4), pt(674.4,588.5)] },
    { id: "rp82", points: [pt(730.9,511.8), pt(703.7,533.7), pt(719.0,552.6), pt(746.2,530.7)] },
    { id: "rp83", points: [pt(758.1,489.8), pt(730.9,511.8), pt(746.2,530.7), pt(773.3,508.9)] },
    { id: "rp84", points: [pt(800.7,486.9), pt(785.3,467.9), pt(758.1,489.8), pt(773.3,508.9)] },
    { id: "rp85", points: [pt(367.1,386.1), pt(359.6,358.8), pt(324.8,369.4), pt(334.6,404.4), pt(362.6,395.1)] },
    { id: "rp86", points: [pt(488.0,517.4), pt(462.1,533.6), pt(477.6,556.6), pt(482.9,564.1), pt(508.1,546.0)] },
    { id: "rp87", points: [pt(515.9,448.3), pt(492.2,461.1), pt(506.0,485.1), pt(529.2,471.8), pt(525.8,466.0)] },
    { id: "rp88", points: [pt(467.5,481.7), pt(438.9,495.5), pt(453.4,519.8), pt(458.4,527.8), pt(484.9,511.2)] },
    { id: "rp89", points: [pt(495.5,466.9), pt(467.5,481.7), pt(484.9,511.2), pt(511.3,494.5)] },
    { id: "rp90", points: [pt(538.8,585.7), pt(516.8,557.8), pt(491.5,575.9), pt(502.8,590.7), pt(514.4,605.3)] },
    { id: "rp91", points: [pt(579.2,336.4), pt(568.8,305.5), pt(566.7,298.5), pt(501.7,318.5), pt(511.8,352.5), pt(524.1,385.7), pt(588.0,358.3)] },
    { id: "rp92", points: [pt(309.3,373.9), pt(301.3,347.2), pt(268.4,341.0), pt(267.0,348.1), pt(253.1,357.5), pt(274.4,388.9)] },
    { id: "rp93", points: [pt(324.8,369.2), pt(289.3,381.6), pt(303.7,414.7), pt(311.3,411.6), pt(334.6,404.3)] },
    { id: "rp94", points: [pt(326.5,316.6), pt(307.8,313.1), pt(301.3,347.1), pt(309.3,373.9), pt(359.6,358.8), pt(348.3,329.4)] },
    { id: "rp95", points: [pt(397.1,314.6), pt(380.4,316.4), pt(374.7,326.8), pt(372.9,332.7), pt(381.6,359.6), pt(407.3,352.7)] },
    { id: "rp96", points: [pt(289.3,381.6), pt(257.4,399.3), pt(257.0,408.2), pt(275.3,429.5), pt(303.7,414.7)] },
    { id: "rp97", points: [pt(222.3,243.4), pt(189.3,237.1), pt(184.7,262.4), pt(193.0,273.3), pt(216.3,274.7)] },
    { id: "rp98", points: [pt(453.0,253.8), pt(428.1,256.1), pt(434.1,295.1), pt(458.6,290.5)] },
    { id: "rp99", points: [pt(386.4,253.0), pt(360.3,254.3), pt(363.9,290.5), pt(372.5,294.9), pt(378.4,302.4), pt(393.3,299.5)] },
    { id: "rp100", points: [pt(286.1,490.2), pt(289.6,486.7), pt(271.1,463.9), pt(257.1,479.0), pt(245.2,495.8), pt(268.7,513.5), pt(274.9,503.7)] },
    { id: "rp101", points: [pt(245.2,495.8), pt(227.6,537.7), pt(256.3,543.2), pt(261.9,527.1), pt(268.7,513.5)] },
    { id: "rp102", points: [pt(767.2,403.9), pt(743.0,428.6), pt(742.7,433.9), pt(755.0,446.9), pt(769.3,449.5), pt(791.1,433.2)] },
    { id: "rp103", points: [pt(673.4,491.8), pt(654.6,469.5), pt(605.0,507.5), pt(602.9,517.2), pt(606.7,521.8), pt(618.5,535.3)] },
    { id: "rp104", points: [pt(541.3,491.2), pt(529.2,471.8), pt(506.0,485.1), pt(519.5,508.8), pt(543.4,494.4)] },
    { id: "rp105", points: [pt(543.4,494.4), pt(520.5,510.2), pt(536.9,532.2), pt(558.6,516.4)] },
    { id: "rp106", points: [pt(597.5,564.4), pt(584.3,549.3), pt(563.2,566.2), pt(589.4,596.0), pt(598.0,588.5), pt(602.1,574.4)] },
    { id: "rp107", points: [pt(682.1,232.2), pt(646.3,245.1), pt(652.3,269.9), pt(654.6,278.1), pt(694.3,264.4)] },
    { id: "rp108", points: [pt(725.9,236.3), pt(719.3,227.4), pt(709.4,223.9), pt(682.1,232.2), pt(694.3,264.4), pt(731.6,251.5)] },
    { id: "rp109", points: [pt(757.7,213.4), pt(677.1,198.0), pt(673.6,216.5), pt(648.1,225.7), pt(641.9,219.8), pt(646.3,245.1), pt(682.1,232.2), pt(709.4,223.9), pt(719.3,227.4), pt(725.9,236.3), pt(761.2,223.2)] },
    { id: "rp110", points: [pt(714.2,171.1), pt(642.4,157.2), pt(638.1,168.6), pt(640.4,207.0), pt(644.1,225.0), pt(648.1,225.7), pt(673.6,216.5), pt(677.1,198.0), pt(707.8,203.9)] },
    { id: "rp111", points: [pt(747.9,295.3), pt(717.4,309.3), pt(738.4,348.7), pt(766.8,331.0)] },
    { id: "rp112", points: [pt(723.3,320.4), pt(709.8,326.9), pt(698.5,313.7), pt(677.4,322.2), pt(674.5,331.0), pt(697.7,374.3), pt(738.4,348.7)] },
    { id: "rp113", points: [pt(717.4,309.3), pt(709.1,301.2), pt(694.8,299.5), pt(672.5,308.3), pt(663.8,305.5), pt(668.9,318.3), pt(674.5,331.0), pt(677.4,322.2), pt(698.5,313.7), pt(709.8,326.9), pt(723.3,320.4)] },
    { id: "rp114", points: [pt(742.5,355.2), pt(701.6,380.5), pt(726.2,414.6), pt(732.8,416.1), pt(752.7,400.7), pt(749.7,390.5), pt(761.2,381.6)] },
    { id: "rp115", points: [pt(563.2,566.2), pt(538.8,585.7), pt(565.0,615.6), pt(589.4,596.0)] },
    { id: "rp116", points: [pt(538.8,585.7), pt(514.4,605.3), pt(539.1,629.4), pt(549.9,627.7), pt(565.0,615.6)] },
    { id: "rp117", points: [pt(447.7,672.8), pt(419.6,688.4), pt(430.8,715.3), pt(464.8,696.3)] },
    { id: "rp118", points: [pt(419.6,688.4), pt(390.6,695.9), pt(393.5,724.9), pt(430.8,715.3)] },
    { id: "rp119", points: [pt(273.0,642.9), pt(267.0,633.1), pt(263.8,626.7), pt(238.1,640.4), pt(243.2,650.2), pt(262.8,676.9), pt(284.1,657.0)] },
    { id: "rp120", points: [pt(258.0,612.0), pt(253.9,595.0), pt(225.4,600.9), pt(233.9,630.8), pt(238.1,640.4), pt(263.6,626.7)] },
    { id: "rp121", points: [pt(553.6,238.5), pt(488.9,250.1), pt(501.7,318.5), pt(566.7,298.5)] },
    { id: "rp122", points: [pt(617.6,204.2), pt(586.8,195.3), pt(556.4,199.8), pt(562.0,237.0), pt(553.6,238.5), pt(555.2,248.3), pt(557.0,258.1), pt(623.4,243.7)] },
    { id: "rp123", points: [pt(727.0,449.3), pt(739.2,462.8), pt(740.1,471.9), pt(691.9,513.0), pt(673.3,491.8)] },
    { id: "rp124", points: [pt(588.0,358.3), pt(524.1,385.7), pt(573.0,477.2), pt(558.6,451.7), pt(588.4,436.5), pt(592.5,443.2), pt(622.4,423.7)] },
    { id: "rp125", points: [pt(631.0,275.7), pt(565.9,295.5), pt(576.6,329.3), pt(588.0,358.3), pt(651.6,333.6)] },
    // מגרשים שהיו רווח ריק לא-מוסבר (בלי פוליגון בתשריט המקורי) - זוהו אוטומטית כשטחים
    // סגורים בין מגרשים/רחובות קיימים ונוספו כמגרשים לבחירת הסטודנט, לפי בקשת ארז.
    // כולל גם את הרווחים הגדולים שדילגתי עליהם קודם (ארז ביקש לסמן גם אותם כמגרשים).
    { id: "gap0", points: [pt(333.0,513.0), pt(314.0,531.5), pt(301.0,563.0), pt(300.5,581.5), pt(313.0,616.5), pt(332.0,635.0), pt(363.0,647.5), pt(391.5,646.5), pt(415.5,636.5)] },
    { id: "gap1", points: [pt(678.5,384.0), pt(679.5,388.5), pt(593.0,443.0), pt(588.0,436.5), pt(560.0,451.0), pt(586.0,494.5), pt(598.0,493.5), pt(700.0,416.0)] },
    { id: "gap2", points: [pt(487.5,387.5), pt(430.5,403.0), pt(458.5,465.0), pt(487.0,452.0), pt(493.0,460.0), pt(515.0,448.0)] },
    { id: "gap3", points: [pt(815.5,240.5), pt(738.5,268.0), pt(758.5,315.0), pt(832.5,280.0)] },
    { id: "gap4", points: [pt(845.5,300.0), pt(780.5,351.5), pt(801.5,377.0), pt(864.0,326.0), pt(868.0,327.5)] },
    { id: "gap5", points: [pt(544.0,138.5), pt(491.5,128.5), pt(488.5,135.0), pt(487.0,192.5), pt(492.0,195.5), pt(512.5,192.0), pt(520.0,167.0), pt(538.0,170.5)] },
    { id: "gap6", points: [pt(384.5,221.5), pt(393.5,299.0), pt(415.0,295.5), pt(410.0,226.5)] },
    { id: "gap7", points: [pt(689.5,266.0), pt(655.5,278.0), pt(665.0,305.5), pt(673.0,307.5), pt(694.0,299.0), pt(703.0,300.0)] },
    { id: "gap8", points: [pt(283.5,656.0), pt(284.5,657.0), pt(263.0,676.5), pt(295.0,702.5), pt(310.0,678.5)] },
    { id: "gap9", points: [pt(306.5,441.0), pt(287.0,451.0), pt(272.5,464.5), pt(290.0,486.5), pt(287.5,489.0), pt(318.0,465.0)] },
    { id: "gap10", points: [pt(542.0,540.0), pt(517.0,557.5), pt(538.5,585.0), pt(562.5,566.0)] },
    { id: "gap11", points: [pt(397.0,693.5), pt(360.5,696.5), pt(355.0,723.5), pt(392.5,723.5), pt(390.0,695.5)] },
    { id: "gap12", points: [pt(465.5,325.0), pt(443.5,331.5), pt(453.5,370.5), pt(470.0,365.5), pt(474.0,351.5), pt(480.0,366.5)] },
    // שצ"פ קיים (שכבה ירוקה בתשריט) - מגיע עם ייעוד ראשוני, אבל ניתן לשינוי כמו כל מגרש אחר.
    { id: "park0", points: [pt(267.0,348.1), pt(268.4,341.0), pt(214.5,330.7), pt(200.4,309.8), pt(203.5,293.6), pt(191.1,296.4), pt(181.2,304.2), pt(176.7,311.5), pt(193.2,314.7), pt(207.2,335.5), pt(196.8,389.4), pt(203.7,390.9)], presetLandUse: "shatach-patuach" },
    { id: "park1", points: [pt(364.1,648.3), pt(357.0,646.9), pt(350.6,680.2), pt(344.6,684.3), pt(337.5,721.5), pt(354.6,724.8), pt(361.8,687.6), pt(357.7,681.7)], presetLandUse: "shatach-patuach" },
    { id: "park2", points: [pt(514.8,500.7), pt(511.3,494.5), pt(458.4,527.8), pt(459.3,529.3), pt(462.1,533.6)], presetLandUse: "shatach-patuach" },
    { id: "park3", points: [pt(267.6,557.9), pt(269.0,550.7), pt(302.1,557.1), pt(300.9,564.2)], presetLandUse: "shatach-patuach" },
    { id: "park4", points: [pt(269.0,550.7), pt(265.0,544.8), pt(227.8,537.7), pt(224.6,555.1), pt(261.6,561.8), pt(267.6,557.9)], presetLandUse: "shatach-patuach" },
    { id: "park5", points: [pt(833.0,280.8), pt(845.5,300.9), pt(780.3,351.6), pt(771.5,337.2), pt(701.6,380.5), pt(697.7,374.3), pt(766.8,331.0), pt(758.0,315.9)], presetLandUse: "shatach-patuach" },
    { id: "park6", points: [pt(225.5,69.5), pt(221.2,75.8), pt(451.6,120.3), pt(450.6,118.5), pt(445.6,112.0)], presetLandUse: "shatach-patuach" },
    { id: "park7", points: [pt(503.1,123.0), pt(491.4,128.3), pt(613.6,151.5), pt(611.6,148.4), pt(602.6,142.2)], presetLandUse: "shatach-patuach" },
    { id: "park8", points: [pt(655.6,152.4), pt(648.4,153.2), pt(642.4,157.2), pt(797.2,187.2), pt(800.3,194.9), pt(808.1,199.9), pt(814.0,233.0), pt(816.0,239.9), pt(822.5,237.4), pt(817.9,218.3), pt(814.4,192.5), pt(811.6,187.0), pt(807.0,182.8), pt(801.1,180.4)], presetLandUse: "shatach-patuach" },
    { id: "park9", points: [pt(825.2,245.8), pt(818.7,248.4), pt(833.0,280.8), pt(855.3,313.7), pt(882.4,341.3), pt(888.3,346.0), pt(884.8,334.7), pt(863.9,313.1), pt(848.2,292.4), pt(835.2,269.9)], presetLandUse: "shatach-patuach" },
    { id: "park10", points: [pt(822.5,237.4), pt(816.0,239.9), pt(818.7,248.4), pt(825.2,245.8)], presetLandUse: "shatach-patuach" },
    // מבני ציבור קיימים (שכבה חומה בתשריט) - אותו עיקרון, ייעוד ראשוני שניתן לשנות.
    { id: "bld0", points: [pt(160.7,178.5), pt(232.2,192.2), pt(451.2,234.3), pt(453.6,129.1), pt(453.6,128.3), pt(453.6,127.4), pt(453.4,125.5), pt(453.0,123.7), pt(452.4,122.0), pt(451.6,120.3), pt(451.6,120.3), pt(451.1,119.3), pt(450.6,118.5), pt(450.0,117.6), pt(445.6,112.0), pt(225.5,69.5), pt(184.0,113.1)], presetLandUse: "mivne-tzibur" },
    { id: "bld1", points: [pt(389.4,443.6), pt(318.8,465.4), pt(309.1,471.4), pt(333.5,512.7), pt(418.1,638.6), pt(418.1,638.6), pt(418.1,638.6), pt(444.1,675.3), pt(445.7,674.1), pt(447.4,672.9), pt(449.0,671.7), pt(450.6,670.4), pt(474.8,651.2), pt(505.8,626.7), pt(488.6,605.5), pt(472.2,583.9), pt(456.5,561.7), pt(441.5,539.0), pt(427.3,515.8), pt(413.9,492.2), pt(401.2,468.1), pt(389.4,443.6)], presetLandUse: "mivne-tzibur" },
  ];

  // רחובות קיימים - שכבה כחולה בתשריט, פוליגונים סגורים (לא קווי מרכז). קבועים,
  // לא אינטראקטיביים - בדיוק הרוחב והצורה האמיתיים.
  const STREETS = [
    [pt(76.6,512.3), pt(49.6,505.9), pt(43.1,499.2), pt(40.7,490.0), pt(35.0,518.5), pt(112.7,534.1), pt(119.0,501.7), pt(114.0,511.2), pt(104.6,516.3)],
    [pt(708.8,427.9), pt(699.8,416.3), pt(647.9,456.1), pt(656.9,467.7)],
    [pt(488.1,135.6), pt(491.8,127.6), pt(503.4,122.9), pt(445.4,111.8), pt(453.5,121.5), pt(449.7,205.7), pt(456.8,280.2), pt(467.4,329.1), pt(501.7,318.5), pt(491.2,267.3), pt(486.3,221.5)],
    [pt(189.3,237.1), pt(195.3,205.8), pt(178.1,202.5), pt(158.5,303.4), pt(173.1,283.6), pt(195.1,273.7), pt(187.8,270.0), pt(185.0,264.5)],
    [pt(654.6,469.5), pt(656.5,467.2), pt(647.9,456.0), pt(596.6,495.4), pt(585.7,495.2), pt(602.9,517.2), pt(605.0,507.5)],
    [pt(703.7,533.6), pt(781.3,470.8), pt(764.6,450.2), pt(755.0,446.9), pt(747.1,438.6), pt(711.5,395.2), pt(691.5,363.9), pt(667.1,313.9), pt(650.0,261.0), pt(640.3,206.0), pt(638.3,165.4), pt(644.9,155.0), pt(653.8,152.3), pt(600.5,141.6), pt(609.1,145.8), pt(615.2,156.6), pt(617.7,205.0), pt(624.6,249.4), pt(640.9,306.9), pt(665.2,361.7), pt(694.1,408.4), pt(740.7,467.3), pt(737.7,475.9), pt(651.6,545.6), pt(639.3,549.7), pt(627.3,544.8), pt(671.9,586.5), pt(666.3,576.3), pt(667.9,564.7)],
    [pt(627.3,544.8), pt(584.8,493.9), pt(549.8,439.2), pt(522.0,380.5), pt(501.7,318.5), pt(467.4,329.1), pt(493.9,403.0), pt(515.9,448.4), pt(541.3,491.2), pt(597.5,564.4), pt(642.3,608.2), pt(694.1,642.1), pt(691.9,600.5), pt(672.3,586.8)],
    [pt(355.4,343.2), pt(367.0,381.9), pt(366.3,390.0), pt(361.9,395.7), pt(303.7,414.7), pt(267.1,436.7), pt(234.8,469.7), pt(218.1,496.8), pt(207.7,520.5), pt(201.2,526.5), pt(188.9,528.5), pt(149.2,520.9), pt(140.5,514.1), pt(139.2,504.3), pt(175.9,313.9), pt(184.0,301.3), pt(194.7,295.0), pt(206.4,293.7), pt(326.5,316.6), pt(344.8,325.7)],
    [pt(378.4,302.4), pt(372.5,294.9), pt(363.9,290.5), pt(350.6,291.1), pt(337.8,298.1), pt(207.4,273.1), pt(190.1,274.8), pt(171.4,285.0), pt(162.8,294.9), pt(155.7,310.7), pt(112.7,534.1), pt(185.1,548.5), pt(196.0,555.2), pt(199.8,564.1), pt(204.9,616.7), pt(217.4,651.0), pt(244.4,691.2), pt(282.1,722.9), pt(315.9,739.2), pt(351.6,747.8), pt(388.1,748.8), pt(423.9,742.2), pt(457.9,728.1), pt(479.0,714.7), pt(613.8,606.1), pt(628.2,603.1), pt(642.1,608.1), pt(597.5,564.4), pt(602.1,574.4), pt(598.0,588.5), pt(464.3,696.6), pt(432.0,714.8), pt(396.9,724.4), pt(360.7,725.5), pt(324.9,717.8), pt(291.4,701.2), pt(262.8,677.0), pt(247.8,657.6), pt(236.2,636.3), pt(225.5,601.7), pt(223.1,577.5), pt(224.6,552.9), pt(230.3,528.4), pt(240.7,503.6), pt(257.1,479.0), pt(286.6,451.3), pt(321.6,432.7), pt(487.5,387.5), pt(474.3,352.4), pt(473.5,362.0), pt(470.3,366.2), pt(403.5,385.9), pt(394.5,385.6), pt(387.5,377.9), pt(372.9,332.7), pt(380.4,316.4)],
    [pt(274.4,388.9), pt(253.1,357.5), pt(211.1,386.0), pt(232.6,418.4), pt(237.6,416.5), pt(242.5,418.5), pt(256.9,440.3), pt(255.2,446.9), pt(261.3,441.4), pt(277.6,429.1), pt(269.3,426.3), pt(255.5,402.9)],
    [pt(533.1,626.5), pt(497.1,583.3), pt(463.2,535.3), pt(409.5,439.8), pt(394.6,426.8), pt(380.0,423.2), pt(340.7,427.0), pt(306.3,439.4), pt(318.8,465.4), pt(389.4,443.6), pt(441.5,539.0), pt(518.0,643.4), pt(513.7,656.9), pt(549.9,627.7), pt(539.1,629.4)],
    [pt(804.8,145.2), pt(795.9,179.4), pt(225.5,69.5), pt(232.1,35.0)],
    [pt(839.4,424.0), pt(920.5,358.2), pt(888.3,345.5), pt(884.3,357.0), pt(851.7,384.2), pt(773.5,447.4), pt(764.6,450.2), pt(781.5,471.0)],
    [pt(767.3,403.7), pt(766.8,389.6), pt(761.2,381.6), pt(749.7,390.5), pt(752.8,394.5), pt(752.7,400.7), pt(735.5,416.1), pt(726.2,414.6), pt(742.7,433.9), pt(745.2,425.3), pt(763.4,410.4)],
    [pt(717.3,309.0), pt(709.1,301.2), pt(694.8,299.5), pt(672.5,308.3), pt(663.8,305.5), pt(668.9,318.3), pt(674.5,331.0), pt(677.4,322.2), pt(698.5,313.7), pt(704.9,316.7), pt(709.8,326.9), pt(723.3,320.4)],
    [pt(757.7,213.4), pt(677.1,198.0), pt(673.6,216.5), pt(648.1,225.7), pt(644.1,225.0), pt(641.9,219.8), pt(646.3,245.1), pt(682.1,232.2), pt(709.4,223.9), pt(719.3,227.4), pt(725.9,236.3), pt(761.2,223.2)],
    [pt(616.1,185.4), pt(520.1,167.5), pt(513.3,192.5), pt(490.8,196.2), pt(485.3,191.9), pt(485.9,215.5), pt(489.8,211.8), pt(586.8,195.3), pt(617.6,204.2)],
    [pt(542.3,539.6), pt(533.7,527.9), pt(482.9,564.1), pt(491.5,575.9)],
  ];

  function generatePlots() {
    const plots = REAL_PLOTS_RAW.map((p) => ({ ...p, points: p.points }));
    plots.forEach((p) => {
      p.landUse = p.presetLandUse || null;
      p.buildingLine = p.landUse ? "urban" : null;
      p.area = polygonArea(p.points);
    });
    return plots;
  }

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

  const BUILDING_LINE_PRESETS = {
    urban: { key: "urban", label: "עירוני - קו אפס", insetFront: 3, insetSide: 3, insetBack: 3 },
    rural: { key: "rural", label: "כפרי - נסיגה קדמית וגינה", insetFront: 30, insetSide: 9, insetBack: 6 },
  };

  const MIN_OPEN_SPACE_PERCENT = 10;
  const ADJACENCY_THRESHOLD = 22;
  const STREET_ACCESS_THRESHOLD = 40;

  function buildingFootprint(plot) {
    if (!plot.landUse || !plot.buildingLine) return null;
    const preset = BUILDING_LINE_PRESETS[plot.buildingLine];
    const n = plot.points.length;
    const distances = new Array(n).fill(preset.insetSide);
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
            ? `${percent.toFixed(0)}% שצ"פ משטח היישוב (כולל השצ"פ הקיים) - עומד בדרישת המינימום (${MIN_OPEN_SPACE_PERCENT}%).`
            : `${percent.toFixed(0)}% שצ"פ בלבד (כולל הקיים), מתחת למינימום המקובל של ${MIN_OPEN_SPACE_PERCENT}% - הוסיפו עוד שטחים פתוחים.`,
        };
      },
    },
    {
      key: "access",
      title: "גישת רכב למגרשים",
      check(plots) {
        const violating = [];
        plots
          .filter((p) => p.landUse && p.landUse !== OPEN_SPACE_KEY)
          .forEach((p) => {
            const minDist = Math.min(...STREETS.map((street) => polyPolyDist(p.points, street)));
            if (minDist >= STREET_ACCESS_THRESHOLD) violating.push(p.id);
          });
        return {
          ok: violating.length === 0,
          violatingIds: violating,
          message:
            violating.length === 0
              ? 'לכל המגרשים המיועדים (מלבד שצ"פ) יש גישת רכב מרחוב - טוב.'
              : `${violating.length} מגרשים מיועדים לשימוש שדורש גישת רכב אבל לא גובלים בשום רחוב - שנו את הייעוד לשצ"פ, או בדקו את מיקום המגרש.`,
        };
      },
    },
  ];

  return {
    STREETS,
    BASE_LAND_USES,
    BUILDING_LINE_PRESETS,
    RULES,
    MIN_OPEN_SPACE_PERCENT,
    generatePlots,
    buildingFootprint,
    pointsToPath,
    insetPolygon,
    polygonArea,
    polyPolyDist,
    pointToPolylineDist,
  };
})();
