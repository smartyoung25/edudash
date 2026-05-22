import openpyxl, sys
sys.stdout.reconfigure(encoding='utf-8')

wb = openpyxl.load_workbook('C:/Users/IIamHub2/Documents/네이트온 받은 파일/2026년 맞춤형과정 주간보고_이암허브.xlsx', read_only=True, data_only=True)

for ws in wb.worksheets:
    print('=== SHEET:', ws.title, '===')
    found = False
    for i, row in enumerate(ws.iter_rows(values_only=True), 1):
        if i > 500: break
        vals = [str(c) if c is not None else '' for c in row]
        line = ' | '.join(vals)
        if '강사' in line or '주임교수' in line or '코디' in line:
            print(i, line[:400])
            found = True
    if not found: print('  (no match)')
    print()
