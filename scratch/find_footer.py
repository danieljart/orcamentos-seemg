import openpyxl

wb = openpyxl.load_Context('public/template.xlsx', data_only=True)
ws = wb['Plan1']

for row in ws.iter_rows(min_row=700, max_row=800, min_col=1, max_col=10):
    for cell in row:
        if cell.value and isinstance(cell.value, str):
            val = cell.value.lower()
            if 'nome do' in val or 'crea' in val or 'data' in val:
                print(f"Row {cell.row}, Col {cell.column_letter}: {cell.value}")
