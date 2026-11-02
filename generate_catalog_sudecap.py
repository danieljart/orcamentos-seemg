"""
Builds public/catalogo_sudecap.json from the SUDECAP unit price table (.xls).

The sheet lists, in order, categories ("01"), groups ("01.01") and services
("01.01.13"); only services carry a unit and a price. The nesting is read off
the dotted code, and the output follows the same shape as catalogo_setop.json
so the editor can treat both external bases alike: a level-0 entry per
category, a level-1 entry per group, then the services pointing at both.

Uso: python generate_catalog_sudecap.py <tabela.xls>
Requer: pip install xlrd
"""
import json
import re
import sys
from pathlib import Path

import xlrd

CODE_RE = re.compile(r'^\d+(?:\.\d+)*$')
UNITS = {'M2': 'M²', 'M3': 'M³'}


def clean(text):
    return re.sub(r'\s+', ' ', str(text)).strip()


def parse(path):
    sheet = xlrd.open_workbook(path).sheet_by_index(0)
    catalog = []
    categories = {}
    groups = {}
    skipped = []

    for r in range(sheet.nrows):
        code = clean(sheet.cell_value(r, 0))
        if not CODE_RE.match(code):
            continue  # title block, header row, blank spacer rows

        description = clean(sheet.cell_value(r, 2))
        unit = clean(sheet.cell_value(r, 3))
        price = sheet.cell_value(r, 4)
        depth = code.count('.') + 1

        if depth == 1:
            entry = {
                'item': f'SUDECAP-{code}', 'code': code, 'description': description,
                'unit': '', 'price': 0, 'isCategory': True, 'rows': [],
                'source': 'SUDECAP', 'level': 0,
            }
            categories[code] = entry
            catalog.append(entry)
        elif depth == 2:
            parent = categories.get(code.split('.')[0])
            entry = {
                'item': f'SUDECAP-{code}', 'code': code, 'description': description,
                'unit': '', 'price': 0, 'isCategory': True, 'rows': [],
                'source': 'SUDECAP', 'table': parent['item'] if parent else '', 'level': 1,
            }
            groups[code] = entry
            catalog.append(entry)
        else:
            if not isinstance(price, float) or not unit:
                skipped.append((code, description))
                continue
            group_code = '.'.join(code.split('.')[:2])
            group = groups.get(group_code)
            catalog.append({
                'item': f'SU-{code}', 'description': description,
                'unit': UNITS.get(unit, unit), 'price': round(price, 2),
                'isCategory': False, 'rows': [], 'source': 'SUDECAP',
                'table': group['table'] if group else '',
                'group': group['item'] if group else '',
            })
    return catalog, skipped


def main():
    if len(sys.argv) < 2:
        sys.exit('Uso: python generate_catalog_sudecap.py <tabela.xls>')

    catalog, skipped = parse(sys.argv[1])
    out = Path(__file__).resolve().parent / 'public' / 'catalogo_sudecap.json'
    out.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    items = [c for c in catalog if not c['isCategory']]
    codes = [c['item'] for c in items]
    print(f'Gerado {out}')
    print(f"  Categorias: {sum(1 for c in catalog if c.get('level') == 0)}, "
          f"Grupos: {sum(1 for c in catalog if c.get('level') == 1)}, Itens: {len(items)}")
    print(f'  Codigos duplicados: {len(codes) - len(set(codes))}')
    print(f"  Itens sem grupo: {sum(1 for c in items if not c['group'])}, "
          f"sem categoria: {sum(1 for c in items if not c['table'])}")
    print(f"  Sem preco: {sum(1 for c in items if not c['price'] > 0)}, ignorados: {len(skipped)}")
    print('  Unidades:', ' '.join(sorted({c['unit'] for c in items})))


if __name__ == '__main__':
    main()
