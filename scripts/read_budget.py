import pdfplumber, sys
sys.stdout.reconfigure(encoding='utf-8')

path = sys.argv[1]
with pdfplumber.open(path) as pdf:
    for i, page in enumerate(pdf.pages, 1):
        text = page.extract_text() or ""
        # 예산 관련 페이지만
        if "예산" in text or "집행계획" in text or "식대" in text or "다과" in text:
            print(f"=== Page {i} ===")
            print(text)
            print()
