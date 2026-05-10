"use client";

export default function ProductVisual({ product, comingSoon }) {
  if (comingSoon) {
    return <div style={visualBox}><p style={visualLabel}>Pricing coming soon for this product.</p></div>;
  }
  if (product === "coro") {
    return (
      <div style={visualBox}>
        <div style={coroSign}>
          <div style={signPanel}>CORO</div>
          <div style={stakeLeft}></div>
          <div style={stakeRight}></div>
        </div>
        <p style={visualLabel}>Coroplast Yard Sign Selected</p>
      </div>
    );
  }

  if (product === "banner") {
    return (
      <div style={visualBox}>
        <div style={bannerVisual}>BANNER</div>
        <p style={visualLabel}>Vinyl Banner Selected</p>
      </div>
    );
  }

  if (product === "vinyl") {
    return (
      <div style={visualBox}>
        <div style={vinylVisual}>VINYL</div>
        <p style={visualLabel}>Printed Vinyl Selected</p>
      </div>
    );
  }
  if (product === "reflective") {
    return (
      <div style={visualBox}>
        <div style={reflectiveVisual}>REFLECTIVE</div>
        <p style={visualLabel}>Reflective Vinyl Selected</p>
      </div>
    );
  }

  if (product === "poster") {
    return (
      <div style={visualBox}>
        <div style={posterVisual}>POSTER</div>
        <p style={visualLabel}>Poster Paper Selected</p>
      </div>
    );
  }

  if (product === "meshBanner") {
    return (
      <div style={visualBox}>
        <div style={meshBannerVisual}>MESH</div>
        <p style={visualLabel}>Mesh Banner Selected</p>
      </div>
    );
  }

  if (product === "acm") {
    return (
      <div style={visualBox}>
        <div style={acmVisual}>ACM</div>
        <p style={visualLabel}>ACM / Maxmetal Selected</p>
      </div>
    );
  }
  if (product === "foamcore") {
    return (
      <div style={visualBox}>
        <div style={foamcoreVisual}>FOAMCORE</div>
        <p style={visualLabel}>Foamcore Selected</p>
      </div>
    );
  }
  if (product === "pvc") {
    return (
      <div style={visualBox}>
        <div style={pvcVisual}>PVC</div>
        <p style={visualLabel}>PVC Selected</p>
      </div>
    );
  }

  if (product === "dtfTransfers") {
    return (
      <div style={visualBox}>
        <div style={dtfVisual}>DTF</div>
        <p style={visualLabel}>DTF Transfers Selected</p>
      </div>
    );
  }

  if (product === "acrylic") {
    return (
      <div style={visualBox}>
        <div style={acrylicVisual}>ACRYLIC</div>
        <p style={visualLabel}>Acrylic Selected</p>
      </div>
    );
  }

  return null;
}


const visualBox = {
  marginTop: 25,
  padding: 18,
  borderRadius: 16,
  background: "rgba(255,255,255,0.08)",
  textAlign: "center",
};

const visualLabel = { marginTop: 12, fontSize: 14, color: "#cbd5e1" };
const coroSign = { display: "inline-block", position: "relative", height: 120, width: 180 };

const signPanel = {
  background: "white",
  color: "#0f172a",
  borderRadius: 8,
  padding: "28px 10px",
  fontSize: 30,
  fontWeight: "bold",
  border: "4px solid #38bdf8",
};

const stakeLeft = { position: "absolute", left: 55, top: 80, width: 5, height: 55, background: "#94a3b8" };
const stakeRight = { position: "absolute", right: 55, top: 80, width: 5, height: 55, background: "#94a3b8" };

const bannerVisual = {
  display: "inline-block",
  background: "white",
  color: "#0f172a",
  borderRadius: 8,
  padding: "30px 45px",
  fontSize: 28,
  fontWeight: "bold",
  borderTop: "8px solid #38bdf8",
  borderBottom: "8px solid #38bdf8",
};

const vinylVisual = {
  display: "inline-block",
  background: "linear-gradient(135deg, #ffffff, #dbeafe)",
  color: "#0f172a",
  borderRadius: 8,
  padding: "30px 45px",
  fontSize: 28,
  fontWeight: "bold",
  border: "4px dashed #38bdf8",
};


const posterVisual = {
  display: "inline-block",
  background: "linear-gradient(135deg, #f8fafc, #cbd5e1)",
  color: "#0b1f4d",
  borderRadius: 10,
  padding: "28px 36px",
  fontSize: 30,
  fontWeight: "bold",
  border: "4px solid rgba(255,255,255,0.9)",
  boxShadow: "inset 0 0 16px rgba(0,0,0,.12)",
};

const acmVisual = {
  display: "inline-block",
  background: "linear-gradient(135deg, #e5e7eb, #94a3b8)",
  color: "#0f172a",
  borderRadius: 10,
  padding: "35px 55px",
  fontSize: 34,
  fontWeight: "bold",
  border: "4px solid white",
  boxShadow: "inset 0 0 20px rgba(0,0,0,.2)",
};

const meshBannerVisual = {
  display: "inline-block",
  background: "repeating-linear-gradient(45deg, #dbeafe, #dbeafe 8px, #bfdbfe 8px, #bfdbfe 16px)",
  color: "#0f172a",
  borderRadius: 8,
  padding: "30px 45px",
  fontSize: 28,
  fontWeight: "bold",
  border: "4px solid #38bdf8",
};

const foamcoreVisual = {
  display: "inline-block",
  background: "linear-gradient(135deg, #fef3c7, #fde68a)",
  color: "#422006",
  borderRadius: 10,
  padding: "32px 42px",
  fontSize: 28,
  fontWeight: "bold",
  border: "4px solid #f59e0b",
};

const acrylicVisual = {
  display: "inline-block",
  background: "linear-gradient(135deg, rgba(186,230,253,.8), rgba(224,242,254,.45))",
  color: "#0f172a",
  borderRadius: 10,
  padding: "34px 44px",
  fontSize: 30,
  fontWeight: "bold",
  border: "3px solid rgba(125,211,252,.9)",
  boxShadow: "inset 0 0 18px rgba(14,116,144,.18)",
};

const pvcVisual = {
  display: "inline-block",
  background: "linear-gradient(135deg, #ecfeff, #bae6fd)",
  color: "#082f49",
  borderRadius: 10,
  padding: "34px 44px",
  fontSize: 30,
  fontWeight: "bold",
  border: "3px solid #0ea5e9",
};


const dtfVisual = {
  display: "inline-block",
  background: "linear-gradient(135deg, #ecfccb, #bbf7d0)",
  color: "#14532d",
  borderRadius: 10,
  padding: "34px 44px",
  fontSize: 30,
  fontWeight: "bold",
  border: "3px solid #22c55e",
};

const reflectiveVisual = {
  display: "inline-block",
  background: "linear-gradient(135deg, #f8fafc, #d1d5db)",
  color: "#111827",
  borderRadius: 8,
  padding: "30px 45px",
  fontSize: 28,
  fontWeight: "bold",
  border: "4px dashed #94a3b8",
};
