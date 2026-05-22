import openpyxl, sys
sys.stdout.reconfigure(encoding='utf-8')

wb = openpyxl.load_workbook('C:/Users/IIamHub2/Documents/네이트온 받은 파일/2026년 맞춤형과정 주간보고_이암허브.xlsx', read_only=True, data_only=True)

# Find the sheet matching "강사" or similar
for ws in wb.worksheets:
    title = ws.title
    if '강사' in title or '의견' in title or '인력' in title:
        print('=== SHEET:', title, '===')
        for i, row in enumerate(ws.iter_rows(values_only=True), 1):
            if i > 100: break
            vals = [str(c) if c is not None else '' for c in row]
            line = ' | '.join(vals)
            if line.strip():
                print(i, line[:400])
        print()
