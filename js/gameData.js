// תכנון יישוב - נתוני המשחק: רשת מגרשים סכמטית, מקרא ייעודי קרקע, וכללי הערכה אוטומטית.
// הרשת אינה מייצגת מקום אמיתי - היא תרגיל לימודי סכמטי לתרגול עקרונות ייעוד קרקע מהשיעור.
window.gameData = (function () {
  const ROWS = 9;
  const COLS = 11;

  // עמודות הרחובות המקומיים (אנכי) ושורת הרחוב הראשי (אופקי)
  const MAIN_STREET_ROW = 4;
  const LOCAL_STREET_COLS = [2, 5, 8];

  // פינה שמורה (למשל מדרון/שטח טבע) - לא ניתנת לבנייה
  function isNatural(row, col) {
    return row <= 1 && col >= 9;
  }

  function generateGrid() {
    const cells = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        let type = "plot";
        if (isNatural(row, col)) {
          type = "natural";
        } else if (row === MAIN_STREET_ROW) {
          type = "street";
        } else if (LOCAL_STREET_COLS.includes(col)) {
          type = "street";
        }
        cells.push({
          id: `r${row}c${col}`,
          row,
          col,
          type, // 'plot' | 'street' | 'natural'
          streetWidth: type === "street" ? (row === MAIN_STREET_ROW ? "main" : "local") : null,
          landUse: null, // מתמלא ע"י השחקן, אחד ממפתחות LAND_USES
          setback: false, // נסיגה מקו הרחוב - עיצובי, לא מקבל ציון
        });
      }
    }
    return cells;
  }

  const LAND_USES = [
    { key: "migurim", label: "מגורים", color: "#e8c94a", textColor: "#3a2c05" },
    { key: "misachar", label: "מסחר", color: "#d8622f", textColor: "#fff" },
    { key: "taasiya", label: "תעשייה", color: "#8a5fb0", textColor: "#fff" },
    { key: "shatach-patuach", label: 'שצ"פ - שטח ציבורי פתוח', color: "#4f9f63", textColor: "#fff" },
    { key: "mivne-tzibur", label: "מבנה ציבור", color: "#3f6fa8", textColor: "#fff" },
  ];

  const MIN_OPEN_SPACE_PERCENT = 10;

  // כללי הערכה - כל כלל מקבל את כל התאים ומחזיר { ok, violatingCellIds, message }
  const RULES = [
    {
      key: "conflict",
      title: "הפרדת שימושים סותרים",
      check(cells) {
        const byId = new Map(cells.map((c) => [c.id, c]));
        const violating = new Set();
        cells
          .filter((c) => c.type === "plot" && c.landUse)
          .forEach((c) => {
            neighbors(c, byId).forEach((n) => {
              if (n.type === "plot" && n.landUse) {
                if (
                  (c.landUse === "taasiya" && n.landUse === "migurim") ||
                  (c.landUse === "migurim" && n.landUse === "taasiya")
                ) {
                  violating.add(c.id);
                  violating.add(n.id);
                }
              }
            });
          });
        return {
          ok: violating.size === 0,
          violatingCellIds: [...violating],
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
      check(cells) {
        const totalPlots = cells.filter((c) => c.type === "plot").length;
        const openPlots = cells.filter((c) => c.type === "plot" && c.landUse === "shatach-patuach").length;
        const percent = totalPlots === 0 ? 0 : (openPlots / totalPlots) * 100;
        const ok = percent >= MIN_OPEN_SPACE_PERCENT;
        return {
          ok,
          violatingCellIds: [],
          message: ok
            ? `${percent.toFixed(0)}% שצ"פ מתוך שטח היישוב - עומד בדרישת המינימום (${MIN_OPEN_SPACE_PERCENT}%).`
            : `${percent.toFixed(0)}% שצ"פ בלבד, מתחת למינימום המקובל של ${MIN_OPEN_SPACE_PERCENT}% - הוסיפו עוד שטחים פתוחים.`,
        };
      },
    },
    {
      key: "connectivity",
      title: "חיבור מגרשים לרחוב",
      check(cells) {
        const byId = new Map(cells.map((c) => [c.id, c]));
        const violating = [];
        cells
          .filter((c) => c.type === "plot" && c.landUse)
          .forEach((c) => {
            const hasStreetNeighbor = neighbors(c, byId).some((n) => n.type === "street");
            if (!hasStreetNeighbor) violating.push(c.id);
          });
        return {
          ok: violating.length === 0,
          violatingCellIds: violating,
          message:
            violating.length === 0
              ? "כל המגרשים המיועדים גובלים ברחוב - טוב."
              : `${violating.length} מגרשים מיועדים לא גובלים בשום רחוב - אי אפשר להוציא להם היתר גישה. שנו את הייעוד או השאירו ריק.`,
        };
      },
    },
  ];

  function neighbors(cell, byId) {
    const deltas = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    return deltas
      .map(([dr, dc]) => byId.get(`r${cell.row + dr}c${cell.col + dc}`))
      .filter(Boolean);
  }

  return {
    ROWS,
    COLS,
    MAIN_STREET_ROW,
    LOCAL_STREET_COLS,
    generateGrid,
    LAND_USES,
    RULES,
    MIN_OPEN_SPACE_PERCENT,
    neighbors,
  };
})();
