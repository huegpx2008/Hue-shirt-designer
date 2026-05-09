from __future__ import annotations

import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, Iterable, List

XLSX_PATH = Path('public/data/SanMar_SDL_N_main_downsize.xlsx')
OUTPUT_PATH = Path('public/data/catalog-preview-25.json')
SAMPLE_SIZE = 25
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


def build_preview() -> List[Dict[str, str]]:
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

        preview: List[Dict[str, str]] = []
        seen = set()

        for row in row_iter:
            style_number = val(row, 'STYLE#')
            product_name = val(row, 'PRODUCT_TITLE')
            brand = val(row, 'MILL')
            color = val(row, 'COLOR_NAME')
            front_image = val(row, 'FRONT_MODEL_IMAGE_URL') or val(row, 'PRODUCT_IMAGE')

            key = (style_number, color)
            if not style_number or not product_name or not color or not front_image or key in seen:
                continue
            seen.add(key)

            preview.append(
                {
                    'styleNumber': style_number,
                    'productName': product_name,
                    'brand': brand,
                    'color': color,
                    'firstImageUrl': front_image,
                }
            )
            if len(preview) >= SAMPLE_SIZE:
                break

        return preview


def main() -> None:
    preview = build_preview()
    OUTPUT_PATH.write_text(json.dumps(preview, indent=2), encoding='utf-8')
    print(f'Wrote {len(preview)} rows to {OUTPUT_PATH}')


if __name__ == '__main__':
    main()
