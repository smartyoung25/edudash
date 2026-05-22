import pdfplumber, sys, os, re, json
sys.stdout.reconfigure(encoding='utf-8')

PDF_DIR = "study plan"

def parse_amount(s):
    if not s: return 0
    s = s.replace(',', '').replace('-', '').strip()
    if not s.isdigit(): return 0
    return int(s)

# 팀 매칭: 고유 키워드 우선 (순서가 중요)
TEAM_MATCH = [
    # 우유한 키워드부터 (충돌 없도록)
    ("육묘", "딸기17"),
    ("청년.*딸기", "딸기16"),
    ("진주.*딸기", "딸기12"),
    ("대박.*딸기|산청.*대박", "딸기13"),
    ("혼디베리", "딸기14"),
    ("딸기의 정석|논산", "딸기15"),
    ("딸기다락방|장성", "딸기11"),
    ("귤생귤사", "감귤4"),
    ("감귤국", "감귤5"),
    ("감귤성장농|성장농", "감귤6"),
    ("배띄워라|배1기", "배1"),
    ("배 2기", "배2"),
    ("best.*방토|방토|토마토.*7", "토마토7"),
    ("안산.*포도|포도.*3", "포도3"),
    ("우두머리|한우.*청주|한우.*6", "한우6"),
    ("한우해움|한우.*7|인제", "한우7"),
]

def match_team(filename):
    for pattern, key in TEAM_MATCH:
        if re.search(pattern, filename, re.IGNORECASE):
            return key
    return None

def extract_budget(pdf_path):
    budget = { "주임강사수당":0, "퍼실리테이터수당":0, "식대":0, "다과":0, "재료비":0, "숙박":0, "임차비":0 }
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if "예산 집행계획" not in text and "Ⅴ. 예산" not in text and "소요예산" not in text:
                continue
            for line in text.split("\n"):
                nums = re.findall(r"([\d,]+)", line)
                if not nums:
                    continue
                amount_candidates = [parse_amount(n) for n in nums if parse_amount(n) >= 10000]
                if not amount_candidates:
                    continue
                amount = max(amount_candidates)

                # 퍼실리테이터수당 (먼저 — '강사' 키워드 충돌 방지)
                if re.search(r"퍼\s*실\s*리\s*테\s*이\s*터", line):
                    budget["퍼실리테이터수당"] = max(budget["퍼실리테이터수당"], amount)
                # 주임강사수당 = 주임강사 수당 + 강사비(시간당) 합산
                elif re.search(r"주\s*임\s*강\s*사|^\s*강\s*사\s*비\b|∘.*강\s*사\s*비", line) or (
                    re.search(r"강\s*사\s*비", line) and not re.search(r"교\s*통|이\s*동", line)
                ):
                    budget["주임강사수당"] = budget["주임강사수당"] + amount
                elif re.search(r"\b식\s*비\b|\b식\s*대\b", line):
                    budget["식대"] = max(budget["식대"], amount)
                elif re.search(r"다\s*과", line):
                    budget["다과"] = max(budget["다과"], amount)
                elif re.search(r"재\s*료\s*비|교\s*재\s*비", line):
                    budget["재료비"] = max(budget["재료비"], amount)
                elif re.search(r"숙\s*박", line):
                    if amount > 0:
                        budget["숙박"] = max(budget["숙박"], amount)
                elif re.search(r"시\s*설\s*임\s*차|장소\s*임\s*차|장소\s*대\s*여", line):
                    budget["임차비"] = budget["임차비"] + amount
                elif re.search(r"차\s*량\s*임\s*차|버\s*스\s*대\s*여|차량\s*대여", line):
                    budget["임차비"] = budget["임차비"] + amount
    return budget

# 팀 키 → DB teamId 매핑 (id=24 배2 추가)
TEAM_KEY_TO_ID = {
    "딸기17": 16,
    "딸기16": 17,
    "딸기15": 18,
    "딸기14": 19,
    "딸기13": 20,
    "딸기12": 21,
    "딸기11": 22,
    "포도3": 23,
    "배2": 24,
    "배1": 25,
    "감귤6": 26,
    "감귤5": 27,
    "감귤4": 28,
    "한우7": 29,
    "한우6": 30,
    "토마토7": 31,
}

results = {}
pdfs = sorted([f for f in os.listdir(PDF_DIR) if f.endswith(".pdf")])
for fn in pdfs:
    team = match_team(fn)
    if not team:
        print(f"SKIP (팀 매칭 실패): {fn}")
        continue
    try:
        budget = extract_budget(os.path.join(PDF_DIR, fn))
        # 이미 같은 팀에 결과 있으면 덮어쓰기 (다중 파일 케이스 — 마지막 우선)
        results[team] = budget
        print(f"{team:8} ({TEAM_KEY_TO_ID.get(team,'?'):>3}) {fn}")
        for cat, amt in budget.items():
            if amt > 0:
                print(f"  {cat}: {amt:,}원")
    except Exception as e:
        print(f"ERROR {fn}: {e}")

# DB 등록용 SQL 만들기
print("\n=== DB UPDATE ===")
import json
with open("budget_results.json", "w", encoding="utf-8") as f:
    output = { TEAM_KEY_TO_ID[k]: v for k, v in results.items() if k in TEAM_KEY_TO_ID }
    json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"saved budget_results.json with {len(output)} teams")
