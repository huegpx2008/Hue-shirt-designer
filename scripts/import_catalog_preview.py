from __future__ import annotations

import argparse
import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, Iterable, List

XLSX_PATH = Path('public/data/SanMar_SDL_N_main_downsize.xlsx')
OUTPUT_PATH = Path('public/data/sanmar-catalog.sample.generated.json')
MAX_ROWS_DEFAULT = 500
MAX_STYLES_DEFAULT = 200
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def _column_index(column_ref: str) -> int:
    index = 0
    for ch in column_ref:
        if ch.isalpha():
            index = index * 26 + (ord(ch.upper()) - 64)
    return index


def _load_shared_strings(archive: zipfile.ZipFile) -> List[str]:
    shared_strings: List[str] = []
    with archive.open('xl/sharedStrings.xml') as handle:
        for _, element in ET.iterparse(handle, events=('end',)):
            if element.tag == f'{NS}si':
                shared_strings.append(''.join((text.text or '') for text in element.iter(f'{NS}t')))
                element.clear()
    return shared_strings


def _iter_sheet_rows(archive: zipfile.ZipFile, shared_strings: List[str]) -> Iterable[Dict[str, str]]:
    with archive.open('xl/worksheets/sheet1.xml') as handle:
        for _, row in ET.iterparse(handle, events=('end',)):
            if row.tag != f'{NS}row':
                continue
            values: Dict[str, str] = {}
            for cell in row.findall(f'{NS}c'):
                ref = cell.attrib.get('r', '')
                col = ''.join(ch for ch in ref if ch.isalpha())
                value_node = cell.find(f'{NS}v')
                if not col or value_node is None:
                    continue
                value = value_node.text or ''
                if cell.attrib.get('t') == 's' and value.isdigit():
                    idx = int(value)
                    value = shared_strings[idx] if 0 <= idx < len(shared_strings) else value
                values[col] = value.strip()
            row.clear()
            if values:
                yield values


def build_preview(max_rows: int, max_styles: int) -> List[Dict[str, object]]:
    with zipfile.ZipFile(XLSX_PATH) as archive:
        shared_strings = _load_shared_strings(archive)
        row_iter = _iter_sheet_rows(archive, shared_strings)
        header_row = next(row_iter)

        sorted_columns = sorted(header_row.keys(), key=_column_index)
        headers_by_col = {col: header_row.get(col, '') for col in sorted_columns}

        def val(row: Dict[str, str], name: str) -> str:
            for col, header in headers_by_col.items():
                if header == name:
                    return row.get(col, '')
            return ''

        preview: List[Dict[str, object]] = []
        seen_style_color = set()
        seen_styles = set()

        for row in row_iter:
            style_number = val(row, 'STYLE#')
            product_name = val(row, 'PRODUCT_TITLE')
            brand = val(row, 'MILL')
            category = val(row, 'CATEGORY_NAME')
            color_name = val(row, 'COLOR_NAME')
            available_sizes = [size.strip() for size in val(row, 'AVAILABLE_SIZES').split('|') if size.strip()]
            front_model = val(row, 'FRONT_MODEL_IMAGE_URL')
            back_model = val(row, 'BACK_MODEL_IMAGE_URL')
            front_flat = val(row, 'FRONT_FLAT_IMAGE_URL')
            back_flat = val(row, 'BACK_FLAT_IMAGE_URL')
            product_image = val(row, 'PRODUCT_IMAGE')
            swatch = val(row, 'SWATCH_IMAGE_URL')

            key = (style_number, color_name)
            if not style_number or not product_name or not color_name or key in seen_style_color:
                continue

            if style_number not in seen_styles and len(seen_styles) >= max_styles:
                continue

            seen_style_color.add(key)
            seen_styles.add(style_number)
            preview.append(
                {
                    'styleNumber': style_number,
                    'productName': product_name,
                    'brand': brand,
                    'category': category,
                    'colorName': color_name,
                    'availableSizes': available_sizes,
                    'frontModelImageUrl': front_model,
                    'backModelImageUrl': back_model,
                    'frontFlatImageUrl': front_flat,
                    'backFlatImageUrl': back_flat,
                    'productImageUrl': product_image,
                    'colorSwatchImageUrl': swatch,
                }
            )
            if len(preview) >= max_rows:
                break

        return preview


def main() -> None:
    parser = argparse.ArgumentParser(description='Generate a small SanMar sample catalog JSON.')
    parser.add_argument('--max-rows', type=int, default=MAX_ROWS_DEFAULT)
    parser.add_argument('--max-styles', type=int, default=MAX_STYLES_DEFAULT)
    parser.add_argument('--output', type=Path, default=OUTPUT_PATH)
    args = parser.parse_args()

    preview = build_preview(max_rows=args.max_rows, max_styles=args.max_styles)
    args.output.write_text(json.dumps(preview, indent=2), encoding='utf-8')
    unique_styles = len({item['styleNumber'] for item in preview})
    print(f'Wrote {len(preview)} rows ({unique_styles} unique styles) to {args.output}')


if __name__ == '__main__':
    main()
