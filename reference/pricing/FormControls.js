const input = { width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ccc", fontSize: 16 };

function Field({ label, value, setValue }) {
  return (
    <div>
      <label>{label}</label>
      <input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" style={input} />
    </div>
  );
}

function Check({ label, value, setValue }) {
  return (
    <label style={{ display: "block", marginTop: 12 }}>
      <input type="checkbox" checked={value} onChange={(e) => setValue(e.target.checked)} /> {label}
    </label>
  );
}

function Box({ title, children }) {
  return (
    <div className="optionBox" style={{ marginTop: 20, padding: 15, borderRadius: 12 }}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

const detailsBox = {
  marginTop: 16,
  padding: 16,
  borderRadius: 16,
  background: "rgba(255,255,255,0.08)",
  color: "#e5e7eb",
  fontSize: 14,
  lineHeight: 1.35,
};

function SelectedDetails({ details }) {
  return (
    <div style={detailsBox}>
      <h3 style={{ marginTop: 0 }}>Selected Details</h3>
      <p><strong>Product:</strong> {details.productName}</p>
      <p><strong>Size:</strong> {details.size}</p>
      <p><strong>Quantity:</strong> {details.qty}</p>
      <p><strong>Material:</strong> {details.material}</p>
      <p><strong>Options:</strong> {details.options.length ? details.options.join(", ") : "None"}</p>
    </div>
  );
}

export { Box, Check, Field, SelectedDetails, input };
