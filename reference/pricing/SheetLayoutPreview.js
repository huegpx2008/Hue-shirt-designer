import FullSheetLayoutPreview from "./FullSheetLayoutPreview";

export default function SheetLayoutPreview({ calc }) {
  return <FullSheetLayoutPreview calc={calc} sheetW={48} sheetH={96} title="Sheet Layout Preview" />;
}
