const num = (v, fallback = 0) => {
  if (v === "" || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export default function FullSheetLayoutPreview({ calc, sheetW = 48, sheetH = 96, title = "Sheet Layout Preview" }) {
  if (!calc.sheetAcross || !calc.sheetDown || !calc.previewPieceW || !calc.previewPieceH) return null;

  const scale = 3;
  const boardW = sheetW * scale;
  const boardH = sheetH * scale;
  const pieceW = calc.previewPieceW * scale;
  const pieceH = calc.previewPieceH * scale;

  const maxPreviewHeight = 240;
  const fitScale = boardH > maxPreviewHeight ? maxPreviewHeight / boardH : 1;
  const totalSlots = calc.sheetAcross * calc.sheetDown;
  const roundedSheets = Math.max(num(calc.sheetsRounded, 1), 1);
  const totalQty = Math.max(num(calc.quantity, 0), 0);
  const remainderOnFinalSheet = totalQty % totalSlots;
  const finalSheetUsedSlots =
    roundedSheets > 1 ? (remainderOnFinalSheet === 0 ? totalSlots : remainderOnFinalSheet) : totalQty;
  const usedSlots = Math.min(Math.max(finalSheetUsedSlots, 0), totalSlots);
  const backSheetCount = Math.min(Math.max(roundedSheets - 1, 0), 3);
  const hiddenSheets = Math.max(roundedSheets - 1 - backSheetCount, 0);
  const stackOffsetX = 8;
  const stackOffsetY = 8;
  const stackContainerW = boardW * fitScale + backSheetCount * stackOffsetX;
  const stackContainerH = boardH * fitScale + backSheetCount * stackOffsetY;

  return (
    <div style={previewBox}>
      <h4 style={{ marginTop: 0, marginBottom: 10 }}>{title}</h4>
      <div style={{ fontSize: 12, marginBottom: 8, color: "#cbd5e1" }}>
        {sheetW}" x {sheetH}" sheet • {calc.sheetLayout}
      </div>

      <div style={{ maxWidth: "100%", overflowX: "auto", border: "2px solid #38bdf8", padding: 8 }}>
        <div style={{ width: stackContainerW, height: stackContainerH, margin: "0 auto", position: "relative" }}>
          {Array.from({ length: backSheetCount }).map((_, i) => {
            const depth = backSheetCount - i;
            return (
              <div
                key={`back-sheet-${depth}`}
                style={{
                  position: "absolute",
                  left: depth * stackOffsetX,
                  top: depth * stackOffsetY,
                  width: boardW * fitScale,
                  height: boardH * fitScale,
                  background: "rgba(255,255,255,0.02)",
                  border: "2px solid rgba(148,163,184,0.45)",
                  opacity: 0.75 - depth * 0.12,
                  boxSizing: "border-box",
                }}
              />
            );
          })}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: boardW * fitScale,
              height: boardH * fitScale,
              background: "rgba(255,255,255,0.06)",
              border: "2px solid rgba(148,163,184,0.9)",
              display: "grid",
              gridTemplateColumns: `repeat(${calc.sheetAcross}, ${pieceW * fitScale}px)`,
              gridAutoRows: `${pieceH * fitScale}px`,
              justifyContent: "start",
              alignContent: "start",
              gap: 0,
              boxSizing: "border-box",
            }}
          >
            {Array.from({ length: calc.sheetAcross * calc.sheetDown }).map((_, i) => (
              <div
                key={i}
                title={`${calc.previewPieceW}" x ${calc.previewPieceH}"`}
                style={{
                  width: pieceW * fitScale,
                  height: pieceH * fitScale,
                  border: "1px dashed #94a3b8",
                  background: i < usedSlots ? "rgba(56,189,248,0.4)" : "rgba(255,255,255,0.06)",
                  boxSizing: "border-box",
                }}
              />
            ))}
          </div>
        </div>
      </div>
      {hiddenSheets > 0 && (
        <p style={{ margin: "6px 0", fontSize: 12, color: "#cbd5e1" }}>+ {hiddenSheets} more sheets</p>
      )}

      <p style={{ margin: "6px 0", fontSize: 13 }}>Pieces per sheet: {calc.piecesPerSheet}</p>
      <p style={{ margin: "6px 0", fontSize: 13 }}>Sheets used: {calc.sheetsUsed?.toFixed(2)}</p>
      <p style={{ margin: "6px 0", fontSize: 13 }}>Sheets rounded: {calc.sheetsRounded}</p>
      <p style={{ margin: "6px 0", fontSize: 13 }}>
        Piece orientation: {calc.previewPieceW}" × {calc.previewPieceH}"{calc.sheetRotated ? " (rotated)" : ""}
      </p>
      <p style={{ margin: "6px 0", fontSize: 12, color: "#cbd5e1" }}>
        {roundedSheets > 1
          ? `Showing final sheet layout: ${usedSlots} of ${totalSlots} slots used (Sheet ${roundedSheets} of ${roundedSheets})`
          : `Showing sheet layout: ${usedSlots} of ${totalSlots} slots used`}
      </p>
    </div>
  );
}

const previewBox = {
  marginTop: 20,
  padding: 15,
  background: "rgba(255,255,255,0.05)",
  borderRadius: 12,
};
