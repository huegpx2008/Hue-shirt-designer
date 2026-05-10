import { Box, Check, Field, input } from "./FormControls";
import { acrylicStandOffOptions, acmOptions, bannerOptions, pvcOptions, vinylOptions } from "../data/productConfig";
import { money } from "../utils/pricingHelpers";
import DTFTransfers from "./products/DTFTransfers";
import ScreenPrinting from "./products/ScreenPrinting";

export default function ProductOptions(props) {
  const {
    activeProduct,
    grid,
    vinylType,
    setVinylType,
    vinylLaminate,
    setVinylLaminate,
    vinylContour,
    setVinylContour,
    vinylRush,
    setVinylRush,
    gangVinyl,
    setGangVinyl,
    contourPadding,
    setContourPadding,
    gangWastePercent,
    setGangWastePercent,
    coroFlute,
    setCoroFlute,
    coroDouble,
    setCoroDouble,
    stakes,
    setStakes,
    heavyStakes,
    setHeavyStakes,
    grommets,
    setGrommets,
    gloss,
    setGloss,
    coroContour,
    setCoroContour,
    coroRush,
    setCoroRush,
    bannerType,
    setBannerType,
    polePocket,
    setPolePocket,
    rope,
    setRope,
    windSlits,
    setWindSlits,
    bannerRush,
    setBannerRush,
    acmType,
    setAcmType,
    acmSqFtPrice,
    setAcmSqFtPrice,
    acmContour,
    setAcmContour,
    roundedCorners,
    setRoundedCorners,
    acrylicContour,
    setAcrylicContour,
    acrylicRoundedCorners,
    setAcrylicRoundedCorners,
    acrylicStandOffs,
    setAcrylicStandOffs,
    acrylicStandOffQty,
    setAcrylicStandOffQty,
    acrylicStandOffColor,
    setAcrylicStandOffColor,
    meshPolePocket,
    setMeshPolePocket,
    meshGrommets,
    setMeshGrommets,
    meshWelding,
    setMeshWelding,
    meshRope,
    setMeshRope,
    meshWebbing,
    setMeshWebbing,
    meshRush,
    setMeshRush,
    posterRush,
    setPosterRush,
    foamcoreDouble,
    setFoamcoreDouble,
    foamcoreContour,
    setFoamcoreContour,
    foamcoreGloss,
    setFoamcoreGloss,
    foamcoreRush,
    setFoamcoreRush,
    foamcoreCustomCut,
    setFoamcoreCustomCut,
    pvcType,
    setPvcType,
    pvcContour,
    setPvcContour,
    pvcRush,
    setPvcRush,
    pvcCustomCut,
    setPvcCustomCut,
    vehicleMagnetMode,
    setVehicleMagnetMode,
    vehicleMagnetPreset,
    setVehicleMagnetPreset,
    vehicleMagnetContour,
    setVehicleMagnetContour,
    vehicleMagnetRoundedCorners,
    setVehicleMagnetRoundedCorners,
    vehicleMagnetRush,
    setVehicleMagnetRush,
    vehicleMagnetNotes,
    setVehicleMagnetNotes,
    businessCardQty,
    setBusinessCardQty,
    businessCardSides,
    setBusinessCardSides,
    businessCardCoating,
    setBusinessCardCoating,
    businessCardOrientation,
    setBusinessCardOrientation,
    businessCardRush,
    setBusinessCardRush,
    handheldPaperSize,
    handheldPaperSizeKey,
    setHandheldPaperSizeKey,
    handheldPaperSides,
    setHandheldPaperSides,
    handheldPaperCoating,
    setHandheldPaperCoating,
    handheldPaperOrientation,
    setHandheldPaperOrientation,
    handheldPaperRush,
    setHandheldPaperRush,
    qty,
    onDtfSummaryChange,
    margin,
    multiplier,
    isAdminView,
  } = props;

  return (
    <>
      {(["vinyl", "reflective", "footprints"].includes(activeProduct)) && (
        <Box title={activeProduct === "reflective" ? "Reflective Vinyl Options" : activeProduct === "footprints" ? "Footprints Vinyl Options" : "Printed Vinyl Options"}>
          {(activeProduct === "vinyl") && (
            <>
              <label>Vinyl Type</label>
              <select style={input} value={vinylType} onChange={(e) => setVinylType(e.target.value)}>
                {Object.entries(vinylOptions).map(([key, v]) => (
                  <option key={key} value={key}>
                    {v.name} — {money(v.retail)}/sq ft
                  </option>
                ))}
              </select>

              <label>Laminate</label>
              <select style={input} value={vinylLaminate} onChange={(e) => setVinylLaminate(e.target.value)}>
                <option>Gloss Laminate</option>
                <option>Matte Laminate</option>
                <option>No Laminate</option>
              </select>
            </>
          )}

          <Check label="Contour Cut (+10%)" value={vinylContour} setValue={setVinylContour} />
          <Check label="Rush Order (2x)" value={vinylRush} setValue={setVinylRush} />
          <Check label="Gang Vinyl Layout" value={gangVinyl} setValue={setGangVinyl} />

          {vinylContour && gangVinyl && (
            <div className="formGrid" style={grid}>
              <Field label="Contour Padding Inches" value={contourPadding} setValue={setContourPadding} />
              <Field label="Gang Waste %" value={gangWastePercent} setValue={setGangWastePercent} />
            </div>
          )}
        </Box>
      )}

      {activeProduct === "coro" && (
        <Box title="Coro Options">
          <label>Flute Direction</label>
          <select style={input} value={coroFlute} onChange={(e) => setCoroFlute(e.target.value)}>
            <option value="vertical">Vertical Flutes / Stakes</option>
            <option value="horizontal">Horizontal Flutes</option>
            <option value="best">Best Fit / Does Not Matter</option>
          </select>

          <Check label="Double Sided" value={coroDouble} setValue={setCoroDouble} />
          <Check label="Standard Stakes" value={stakes} setValue={setStakes} />
          <Check label="Heavy Duty Stakes" value={heavyStakes} setValue={setHeavyStakes} />
          <Check label="Grommets" value={grommets} setValue={setGrommets} />
          <Check label="Gloss Finish" value={gloss} setValue={setGloss} />
          <Check label="Contour Cut (+10%)" value={coroContour} setValue={setCoroContour} />
          <Check label="Rush Order (2x)" value={coroRush} setValue={setCoroRush} />
        </Box>
      )}

      {activeProduct === "banner" && (
        <Box title="Banner Options">
          <label>Banner Material</label>
          <select style={input} value={bannerType} onChange={(e) => setBannerType(e.target.value)}>
            {Object.entries(bannerOptions).map(([key, b]) => (
              <option key={key} value={key}>{b.name} — {money(b.retail)}/sq ft</option>
            ))}
          </select>
          <Check label="Pole Pocket" value={polePocket} setValue={setPolePocket} />
          <Check label="Rope" value={rope} setValue={setRope} />
          <Check label="Wind Slits" value={windSlits} setValue={setWindSlits} />
          <Check label="Rush Order (2x)" value={bannerRush} setValue={setBannerRush} />
        </Box>
      )}

      {activeProduct === "acm" && (
        <Box title="ACM Options">
          <label>ACM Type</label>
          <select style={input} value={acmType} onChange={(e) => setAcmType(e.target.value)}>
            {Object.entries(acmOptions).map(([key, a]) => (
              <option key={key} value={key}>{a.name}</option>
            ))}
          </select>
          <Field label="Shop $ Per Sq Ft" value={acmSqFtPrice} setValue={setAcmSqFtPrice} />
          <Check label="Contour Cut (+10%)" value={acmContour} setValue={setAcmContour} />
          <Check label="Rounded Corners (+$5)" value={roundedCorners} setValue={setRoundedCorners} />
        </Box>
      )}

      {activeProduct === "acrylic" && (
        <Box title="Acrylic Options">
          <Check label="Contour Cut (+10%)" value={acrylicContour} setValue={setAcrylicContour} />
          <Check label="Rounded Corners (+$5)" value={acrylicRoundedCorners} setValue={setAcrylicRoundedCorners} />
          <Check label="Enable Stand-Offs" value={acrylicStandOffs} setValue={setAcrylicStandOffs} />
          {acrylicStandOffs && (
            <div className="formGrid" style={grid}>
              <Field label="Stand-Off Quantity" value={acrylicStandOffQty} setValue={setAcrylicStandOffQty} />
              <div>
                <label>Stand-Off Color</label>
                <select style={input} value={acrylicStandOffColor} onChange={(e) => setAcrylicStandOffColor(e.target.value)}>
                  {Object.entries(acrylicStandOffOptions).map(([key, option]) => (
                    <option key={key} value={key}>{option.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </Box>
      )}

      {activeProduct === "meshBanner" && (
        <Box title="Mesh Banner Options">
          <Check label="Pole Pocket (+$1/linear ft + $10 setup)" value={meshPolePocket} setValue={setMeshPolePocket} />
          <Check label="Grommets (No additional cost)" value={meshGrommets} setValue={setMeshGrommets} />
          <Check label="Welding (No additional cost)" value={meshWelding} setValue={setMeshWelding} />
          <Check label="Rope (+$1/linear ft)" value={meshRope} setValue={setMeshRope} />
          <Check label="Webbing (+$1/linear ft)" value={meshWebbing} setValue={setMeshWebbing} />
          <Check label="Rush Order (2x)" value={meshRush} setValue={setMeshRush} />
        </Box>
      )}

      {activeProduct === "poster" && (
        <Box title="Poster Paper Options">
          <Check label="Rush Order (2x)" value={posterRush} setValue={setPosterRush} />
        </Box>
      )}
      {activeProduct === "businessCards" && (
        <Box title="Business Cards Options">
          <label>Quantity</label>
          <select style={input} value={businessCardQty} onChange={(e) => setBusinessCardQty(Number(e.target.value))}>
            <option value={250}>250</option><option value={500}>500</option><option value={1000}>1000</option>
          </select>
          <label>Print Sides</label>
          <select style={input} value={businessCardSides} onChange={(e) => setBusinessCardSides(e.target.value)}>
            <option value="single">Single Sided</option><option value="double">Double Sided</option>
          </select>
          <label>Coating</label><select style={input} value={businessCardCoating} onChange={(e) => setBusinessCardCoating(e.target.value)}><option>Gloss Laminate</option><option>No Coating</option></select>
          <label>Orientation</label><select style={input} value={businessCardOrientation} onChange={(e) => setBusinessCardOrientation(e.target.value)}><option>Landscape</option><option>Portrait</option></select>
          <Check label="Rush Order (2x)" value={businessCardRush} setValue={setBusinessCardRush} />
        </Box>
      )}
      {activeProduct === "handheld16ptPaper" && (
        <Box title="Handheld 16pt Paper Options">
          <label>Size</label>
          <select style={input} value={handheldPaperSizeKey} onChange={(e) => setHandheldPaperSizeKey(e.target.value)}>
            {props.handheldPaperSizes.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.perSheet} per sheet)</option>)}
          </select>
          <p style={{ margin: "6px 0" }}><strong>{handheldPaperSize?.perSheet || 1} per sheet</strong></p>
          {(Number(qty) % (handheldPaperSize?.perSheet || 1) !== 0) && (
            <div style={{ margin: "4px 0 10px", fontSize: 13, opacity: 0.9 }}>
              <div>Next full sheet quantity: {Math.ceil(Number(qty || 1) / (handheldPaperSize?.perSheet || 1)) * (handheldPaperSize?.perSheet || 1)}</div>
              <div>Add {(Math.ceil(Number(qty || 1) / (handheldPaperSize?.perSheet || 1)) * (handheldPaperSize?.perSheet || 1)) - Number(qty || 1)} more to fill the sheet for best value.</div>
            </div>
          )}
          <label>Print Sides</label><select style={input} value={handheldPaperSides} onChange={(e) => setHandheldPaperSides(e.target.value)}><option value="single">Single Sided</option><option value="double">Double Sided</option></select>
          <label>Coating</label><select style={input} value={handheldPaperCoating} onChange={(e) => setHandheldPaperCoating(e.target.value)}><option>Gloss Laminate</option><option>No Coating</option></select>
          <label>Orientation</label><select style={input} value={handheldPaperOrientation} onChange={(e) => setHandheldPaperOrientation(e.target.value)}><option>Landscape</option><option>Portrait</option></select>
          <Check label="Rush Order (2x)" value={handheldPaperRush} setValue={setHandheldPaperRush} />
        </Box>
      )}

      {activeProduct === "foamcore" && (
        <Box title="Foamcore Options">
          <Check label="Double-Sided" value={foamcoreDouble} setValue={setFoamcoreDouble} />
          <Check label="Contour Cut (+10%)" value={foamcoreContour} setValue={setFoamcoreContour} />
          <Check label="Gloss Finish (+$4 each)" value={foamcoreGloss} setValue={setFoamcoreGloss} />
          <Check label="Rush Order (2x)" value={foamcoreRush} setValue={setFoamcoreRush} />
          <Check label="Custom Cut (No additional cost)" value={foamcoreCustomCut} setValue={setFoamcoreCustomCut} />
        </Box>
      )}


      {activeProduct === "screenPrinting" && <ScreenPrinting margin={margin} multiplier={multiplier} onSummaryChange={onDtfSummaryChange} />}

      {activeProduct === "dtfTransfers" && <DTFTransfers onSummaryChange={onDtfSummaryChange} isAdminView={isAdminView} />}

      {activeProduct === "pvc" && (
        <Box title="PVC Options">
          <label>PVC Type</label>
          <select style={input} value={pvcType} onChange={(e) => setPvcType(e.target.value)}>
            {Object.entries(pvcOptions).map(([key, p]) => (
              <option key={key} value={key}>{p.name}</option>
            ))}
          </select>
          <Check label="Contour Cut (+10%)" value={pvcContour} setValue={setPvcContour} />
          <Check label="Rush Order (2x)" value={pvcRush} setValue={setPvcRush} />
          <Check label="Custom Cut (No additional cost)" value={pvcCustomCut} setValue={setPvcCustomCut} />
        </Box>
      )}
      {activeProduct === "vehicleMagnets" && (
        <Box title="Vehicle Magnets">
          <label>Pricing Mode</label>
          <select style={input} value={vehicleMagnetMode} onChange={(e) => setVehicleMagnetMode(e.target.value)}>
            <option value="standard">Standard Vehicle Magnets</option>
            <option value="custom">Custom Cut Vehicle Magnets</option>
          </select>
          {vehicleMagnetMode === "standard" && (
            <>
              <label>Preset Magnet Size</label>
              <select style={input} value={vehicleMagnetPreset} onChange={(e) => setVehicleMagnetPreset(e.target.value)}>
                <option value="18x12">18x12</option>
                <option value="24x12">24x12</option>
                <option value="24x18">24x18</option>
                <option value="42x12">42x12</option>
                <option value="72x24">72x24</option>
              </select>
            </>
          )}
          {vehicleMagnetMode === "custom" && <Check label="Contour Cut (+10%)" value={vehicleMagnetContour} setValue={setVehicleMagnetContour} />}
          <Check label="Rounded Corners (No additional cost)" value={vehicleMagnetRoundedCorners} setValue={setVehicleMagnetRoundedCorners} />
          <Check label="Rush Order (2x)" value={vehicleMagnetRush} setValue={setVehicleMagnetRush} />
          <label>Optional Notes</label>
          <input style={input} placeholder="Add notes for this item..." value={vehicleMagnetNotes} onChange={(e) => setVehicleMagnetNotes(e.target.value)} />
        </Box>
      )}
    </>
  );
}
