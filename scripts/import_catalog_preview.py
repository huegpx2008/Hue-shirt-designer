from __future__ import annotations

import argparse
import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, Iterable, List

XLSX_PATH = Path('public/data/SanMar_SDL_N_main_downsize.xlsx')
OUTPUT_PATH = Path('public/data/sanmar-catalog.sample.generated.json')
CATALOG_DIR = Path('public/data/catalog')
MAX_ROWS_DEFAULT = 500
MAX_STYLES_DEFAULT = 200
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

# NOTE: This PR intentionally generates only the t-shirts chunk.
# We'll add the other category files in follow-up PRs to keep diffs reviewable.
SUPPORTED_CATEGORY_CHUNKS = ('t-shirts',)


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


def _category_slug(category_name: str) -> str:
    lowered = category_name.lower()
    if 't-shirt' in lowered or 'tee' in lowered:
        return 't-shirts'
    if 'hoodie' in lowered:
        return 'hoodies'
    if 'long sleeve' in lowered:
        return 'long-sleeve'
    if 'sweatshirt' in lowered or 'crewneck' in lowered:
        return 'sweatshirts'
    if 'polo' in lowered:
        return 'polos'
    if 'bag' in lowered:
        return 'bags'
    return 'other'


def _extract_catalog_rows() -> List[Dict[str, object]]:
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

        rows: List[Dict[str, object]] = []
        seen_style_color = set()
        for row in row_iter:
            style_number = val(row, 'STYLE#')
            product_name = val(row, 'PRODUCT_TITLE')
            brand = val(row, 'MILL')
            category = val(row, 'CATEGORY_NAME')
            color_name = val(row, 'COLOR_NAME')
            available_sizes = [size.strip() for size in val(row, 'AVAILABLE_SIZES').split('|') if size.strip()]
            key = (style_number, color_name)
            if not style_number or not product_name or not color_name or key in seen_style_color:
                continue

            seen_style_color.add(key)
            rows.append(
                {
                    'styleNumber': style_number,
                    'productName': product_name,
                    'brand': brand,
                    'category': category,
                    'colorName': color_name,
                    'availableSizes': available_sizes,
                    'frontModelImageUrl': val(row, 'FRONT_MODEL_IMAGE_URL'),
                    'backModelImageUrl': val(row, 'BACK_MODEL_IMAGE_URL'),
                    'frontFlatImageUrl': val(row, 'FRONT_FLAT_IMAGE_URL'),
                    'backFlatImageUrl': val(row, 'BACK_FLAT_IMAGE_URL'),
                    'productImageUrl': val(row, 'PRODUCT_IMAGE'),
                    'colorSwatchImageUrl': val(row, 'SWATCH_IMAGE_URL'),
                }
            )

        return rows


def build_preview(max_rows: int, max_styles: int) -> List[Dict[str, object]]:
    preview: List[Dict[str, object]] = []
    seen_styles = set()
    for item in _extract_catalog_rows():
        style_number = str(item['styleNumber'])
        if style_number not in seen_styles and len(seen_styles) >= max_styles:
            continue
        seen_styles.add(style_number)
        preview.append(item)
        if len(preview) >= max_rows:
            break
    return preview


def build_category_chunk(category_slug: str, max_rows: int, max_styles: int) -> List[Dict[str, object]]:
    chunk: List[Dict[str, object]] = []
    seen_styles = set()
    for item in _extract_catalog_rows():
        item_category_slug = _category_slug(str(item['category']))
        if item_category_slug != category_slug:
            continue

        style_number = str(item['styleNumber'])
        if style_number not in seen_styles and len(seen_styles) >= max_styles:
            break

        seen_styles.add(style_number)
        chunk.append(item)
        if len(chunk) >= max_rows:
            break
    return chunk


def main() -> None:
    parser = argparse.ArgumentParser(description='Generate SanMar catalog JSON files (sample + chunked).')
    parser.add_argument('--max-rows', type=int, default=MAX_ROWS_DEFAULT)
    parser.add_argument('--max-styles', type=int, default=MAX_STYLES_DEFAULT)
    parser.add_argument('--output', type=Path, default=OUTPUT_PATH)
    parser.add_argument('--category', choices=SUPPORTED_CATEGORY_CHUNKS, default='t-shirts')
    args = parser.parse_args()

    preview = build_preview(max_rows=args.max_rows, max_styles=args.max_styles)
    args.output.write_text(json.dumps(preview, indent=2), encoding='utf-8')

    CATALOG_DIR.mkdir(parents=True, exist_ok=True)
    category_rows = build_category_chunk(args.category, max_rows=args.max_rows, max_styles=args.max_styles)
    chunk_path = CATALOG_DIR / f'{args.category}.generated.json'
    chunk_path.write_text(json.dumps(category_rows, indent=2), encoding='utf-8')

    preview_styles = len({item['styleNumber'] for item in preview})
    category_styles = len({item['styleNumber'] for item in category_rows})
    print(f'Wrote {len(preview)} rows ({preview_styles} unique styles) to {args.output}')
    print(f'Wrote {len(category_rows)} rows ({category_styles} unique styles) to {chunk_path}')


if __name__ == '__main__':
    main()
