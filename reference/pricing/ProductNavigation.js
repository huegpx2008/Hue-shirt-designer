import { Box, input } from "./FormControls";

export default function ProductNavigation({
  product,
  setProduct,
  presetProduct,
  setPresetProduct,
  onProductSelect,
  productCategories,
  products,
  presetGroups,
  presetClass,
  preset,
}) {
  return (
    <>
      <h2>Product Categories</h2>
      {productCategories.map((category) => (
        <Box key={category.name} title={category.name}>
          <div className="buttonGrid">
            {category.items.map((item) => (
              <button
                key={item.id}
                className={`presetBtn ${product === item.id ? "activePreset" : ""} ${item.calculator ? "" : "comingSoonBtn"}`}
                onClick={() => (onProductSelect ? onProductSelect(item.id) : setProduct(item.id))}
              >
                {item.label} {!item.calculator ? "• Coming Soon" : ""}
              </button>
            ))}
          </div>
        </Box>
      ))}

      <h2 id="quick-presets-anchor">Custom Presets</h2>
      <label>Preset Product</label>
      <select
        style={input}
        value={presetProduct || ""}
        onChange={(e) => {
          const nextProduct = e.target.value;
          setPresetProduct(nextProduct);
          if (onProductSelect) onProductSelect(nextProduct);
          else setProduct(nextProduct);
        }}
      >
        <option value="">Select a product for presets</option>
        {Object.entries(products).map(([key, name]) => (
          <option key={key} value={key}>{name}</option>
        ))}
      </select>

      <div className="buttonGrid" style={{ marginTop: 12 }}>
        {(presetGroups[presetProduct] || []).map((p) => (
          <button
            key={`${presetProduct}-${p.label}`}
            className={presetClass(presetProduct, p.w, p.h, p.double || false)}
            onClick={() => preset(presetProduct, p.w, p.h, p.double || false)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <h2 id="quote-details-anchor">Quote Details</h2>

      <label>Product</label>
      <select style={input} value={product || ""} onChange={(e) => (onProductSelect ? onProductSelect(e.target.value) : setProduct(e.target.value))}>
        <option value="">Select a product</option>
        {productCategories.map((category) => (
          <optgroup key={category.name} label={category.name}>
            {category.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}{item.calculator ? "" : " (Coming Soon)"}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </>
  );
}
