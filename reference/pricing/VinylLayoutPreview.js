export default function VinylLayoutPreview({ calc }) {
  if (!calc.piecesAcross || !calc.rows || !calc.pieceW || !calc.pieceH) return null;

  const scale = 3;
  const rollW = 52 * scale;
  const boxW = calc.pieceW * scale;
  const boxH = calc.pieceH * scale;

  return (
    <div style={previewBox}>
      <h4 style={{ marginTop: 0, marginBottom: 10 }}>Layout Preview</h4>

      <div style={{ fontSize: 12, marginBottom: 8, color: "#cbd5e1" }}>
        52" roll width • {calc.layoutHeight}" long
      </div>

      <div style={{ width: rollW, maxWidth: "100%", overflowX: "auto", border: "2px solid #38bdf8", padding: 5 }}>
        {Array.from({ length: calc.rows }).map((_, row) => (
          <div key={row} style={{ display: "flex" }}>
            {Array.from({ length: calc.piecesAcross }).map((_, col) => (
              <div
                key={col}
                title={`${calc.pieceW.toFixed(1)}" x ${calc.pieceH.toFixed(1)}"`}
                style={{
                  width: boxW,
                  height: boxH,
                  border: "1px dashed #94a3b8",
                  margin: 2,
                  background: "rgba(255,255,255,0.08)",
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        ))}
      </div>

      <p style={{ marginTop: 10, fontSize: 13 }}>{calc.billingMode}</p>
    </div>
  );
}

const previewBox = {
  marginTop: 20,
  padding: 15,
  background: "rgba(255,255,255,0.05)",
  borderRadius: 12,
};
