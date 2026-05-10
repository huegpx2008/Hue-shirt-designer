from __future__ import annotations

import json
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List

XLSX_PATH = Path('public/data/SanMar_SDL_N_main_downsize.xlsx')
CATALOG_DIR = Path('public/data/catalog')
AUDIT_PATH = CATALOG_DIR / 'catalog-audit.generated.json'
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
            yield values


def _read_generated_file_stats() -> Dict[str, Dict[str, int]]:
    stats: Dict[str, Dict[str, int]] = {}
    if not CATALOG_DIR.exists():
        return stats

    for path in sorted(CATALOG_DIR.glob('*.generated.json')):
        if path.name == AUDIT_PATH.name:
            continue

        try:
            parsed = json.loads(path.read_text(encoding='utf-8'))
        except Exception:
            stats[path.name] = {'rows': 0, 'uniqueStyles': 0}
            continue

        if not isinstance(parsed, list):
            stats[path.name] = {'rows': 0, 'uniqueStyles': 0}
            continue

        styles = {
            str(item.get('styleNumber', '')).strip()
            for item in parsed
            if isinstance(item, dict) and str(item.get('styleNumber', '')).strip()
        }
        stats[path.name] = {'rows': len(parsed), 'uniqueStyles': len(styles)}

    return stats


def build_audit() -> Dict[str, object]:
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

        total_spreadsheet_rows = 0
        total_usable_catalog_rows = 0
        missing_unclassified_row_count = 0

        category_rows = Counter()
        category_styles = defaultdict(set)
        brand_rows = Counter()
        brand_styles = defaultdict(set)
        unique_styles = set()

        seen_style_color = set()

        for row in row_iter:
            if not row:
                continue

            total_spreadsheet_rows += 1

            style_number = val(row, 'STYLE#').strip()
            product_name = val(row, 'PRODUCT_TITLE').strip()
            color_name = val(row, 'COLOR_NAME').strip()
            category = val(row, 'CATEGORY_NAME').strip() or 'Unclassified'
            brand = val(row, 'MILL').strip() or 'Unclassified'

            key = (style_number, color_name)
            if not style_number or not product_name or not color_name or key in seen_style_color:
                missing_unclassified_row_count += 1
                continue

            seen_style_color.add(key)
            total_usable_catalog_rows += 1
            unique_styles.add(style_number)

            category_rows[category] += 1
            category_styles[category].add(style_number)

            brand_rows[brand] += 1
            brand_styles[brand].add(style_number)

    generated_file_stats = _read_generated_file_stats()

    return {
        'totalSpreadsheetRows': total_spreadsheet_rows,
        'totalUsableCatalogRows': total_usable_catalog_rows,
        'totalUniqueStyles': len(unique_styles),
        'detectedCategoriesWithRowCounts': dict(sorted(category_rows.items())),
        'detectedCategoriesWithUniqueStyleCounts': {
            category: len(styles) for category, styles in sorted(category_styles.items())
        },
        'detectedBrandsWithRowCounts': dict(sorted(brand_rows.items())),
        'detectedBrandsWithUniqueStyleCounts': {
            brand: len(styles) for brand, styles in sorted(brand_styles.items())
        },
        'currentlyGeneratedCatalogFilesFound': sorted(generated_file_stats.keys()),
        'generatedRowsStylesPerExistingGeneratedFile': generated_file_stats,
        'missingUnclassifiedRowCount': missing_unclassified_row_count,
    }


def main() -> None:
    CATALOG_DIR.mkdir(parents=True, exist_ok=True)
    audit = build_audit()
    AUDIT_PATH.write_text(json.dumps(audit, indent=2), encoding='utf-8')
    print(f'Wrote catalog audit to {AUDIT_PATH}')


if __name__ == '__main__':
    main()
