# 2026 성장농 맞춤형과정 교육운영 관리 시스템

(주)이암허브가 운영하는 15개 농업 교육팀의 일일 수업 현황·서류·KPI·주간보고를 통합 관리하는 웹 시스템입니다. 기획서 `2026_성장농_교육운영시스템_기획서_v1.2.docx` 를 바탕으로 구축되었습니다.

## 빠른 시작

```bash
# 1. 의존성 설치 (최초 1회, 약 1~2분 소요)
npm install

# 2. DB 생성 + 시드 데이터 적재 (15개 팀 + 가상 교육생)
npm run db:migrate
npm run db:seed

# 3. 개발 서버 실행
npm run dev
```

브라우저에서 `http://localhost:3000` 접속.

### 테스트 계정 (비밀번호 모두 `1234`)

| ID       | 역할          | 접근 가능 메뉴                                         |
|----------|---------------|--------------------------------------------------------|
| `admin`  | 관리자        | 대시보드, 일일현황, KPI, 서류, 주간보고, 연락망, 설정 |
| `coord1` | 코디네이터    | 대시보드, 일일현황, KPI, 서류 (담당팀만)              |
| `prof1`  | 주임교수      | 대시보드, 일일현황, KPI, 서류 (담당팀만)              |
| `funder` | 발주기관(농정원) | 대시보드, 일일현황, KPI, 주간보고 (조회/다운로드만)  |

---

## 주요 기능

| 모듈        | 경로            | 설명                                                                  |
|-------------|-----------------|-----------------------------------------------------------------------|
| 대시보드    | `/dashboard`    | 15개 팀 진행률, 품목별 필터(7개), 팀 카드 클릭 → 상세 페이지 진입     |
| 팀 상세     | `/teams/[id]`   | 4개 탭: 팀원 / 교육일정 / KPI / 서류                                  |
| 일일현황    | `/daily`        | 구글 시트 자동 연동 또는 수동 입력. 5분 간격 폴링                     |
| 서류제출    | `/documents`    | 메일 자동 수집 + 수동 업로드. 팀×월 매트릭스, 미분류 처리             |
| 주간보고    | `/reports`      | 발주기관 제출용 4시트 .xlsx 자동 생성                                 |
| 연락망      | `/contacts`     | 주임강사 + 내부 운영인력 (관리자 전용)                                |
| 연동 설정   | `/settings`     | Google/IMAP/OCR 연동 활성/비활성 상태 확인                            |

---

## 기술 스택

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS** + shadcn/ui 스타일 컴포넌트
- **SQLite** (libSQL) + **Drizzle ORM** — `data/app.db` 파일 하나로 동작
- **iron-session** + **bcryptjs** — HTTP-only 쿠키 기반 세션
- **googleapis** + **imapflow** + **mailparser** — 외부 연동
- **exceljs** — 주간보고 .xlsx 생성
- **node-cron** — 5분 간격 폴링 (옵션)

---

## 외부 연동 자격증명 발급 가이드

`.env.example` 을 `.env.local` 로 복사한 뒤 아래 절차로 채워넣으면 자동으로 활성화됩니다. **자격증명이 비어 있어도 앱은 정상 동작**하며, 해당 연동만 비활성 상태로 표시됩니다.

### 1. 세션 암호화 키 (필수)

```
SESSION_PASSWORD=<32자 이상 임의 문자열>
```

PowerShell로 생성:
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 2. Google Sheets / Drive 연동 (선택)

#### A. Google Cloud 프로젝트 + 서비스 계정

1. [Google Cloud Console](https://console.cloud.google.com) 접속 → 프로젝트 생성
2. **API 및 서비스 → 라이브러리** 에서 다음 활성화:
   - Google Sheets API
   - Google Drive API
3. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → 서비스 계정**
4. 서비스 계정 생성 후 → **키 → 새 키 만들기 → JSON** → 다운로드한 JSON 파일을 안전한 위치에 저장 (예: `C:\keys\sa.json`)

#### B. 도메인 차원의 위임 (Google Workspace 필요)

서비스 계정이 stepup2@iiam.co.kr 처럼 동작하려면 위임 설정이 필요합니다.

1. Google Workspace 관리 콘솔 → **보안 → 액세스 및 데이터 제어 → API 제어 → 도메인 전체 위임**
2. **새로 추가** 클릭 → 클라이언트 ID(서비스 계정의 `client_id`)와 OAuth 범위 입력:
   ```
   https://www.googleapis.com/auth/spreadsheets,
   https://www.googleapis.com/auth/drive
   ```

#### C. 스프레드시트/폴더 ID 확보

- **DAILY_SHEETS_SPREADSHEET_ID**: 일일현황 시트 URL `https://docs.google.com/spreadsheets/d/{ID}/edit` 의 ID
- **EXPENSE_SHEETS_SPREADSHEET_ID**: 경비 관리 시트 ID
- **DRIVE_ROOT_FOLDER_ID**: "2026 성장농" 폴더 URL `https://drive.google.com/drive/folders/{ID}` 의 ID

세 항목 모두 **stepup2@iiam.co.kr이 편집 권한을 가져야** 합니다.

#### D. .env.local에 입력

```
GOOGLE_SERVICE_ACCOUNT_JSON_PATH=C:\keys\sa.json
GOOGLE_DELEGATED_USER=stepup2@iiam.co.kr
DAILY_SHEETS_SPREADSHEET_ID=1aBcDeFgHiJkLmNoPqRsTuVwXyZ
EXPENSE_SHEETS_SPREADSHEET_ID=2aBcDeFgHiJkLmNoPqRsTuVwXyZ
DRIVE_ROOT_FOLDER_ID=3aBcDeFgHiJkLmNoPqRsTuVwXyZ
```

#### E. 일일현황 시트 양식 (Sheet1)

A2 행부터 다음 9개 열로 입력:

| A 교육일자 | B 팀명 | C 차시 | D 수업주제 | E 출석인원 | F 불참인원 | G 불참자명 | H 불참사유 | I 비고 |
|------------|--------|--------|------------|------------|------------|------------|------------|--------|
| 2026-05-12 | 감귤국 | 8 | 스마트센서 설치 실습 | 6 | 0 | | | 전원출석 |

### 3. IMAP 메일 수집 (선택)

Gmail 사용 시 **앱 비밀번호** 발급 필요:

1. https://myaccount.google.com/apppasswords 접속
2. 2단계 인증 활성화 후 → 앱 비밀번호 생성
3. 생성된 16자 비밀번호를 `IMAP_PASSWORD` 에 입력

```
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=stepup2@iiam.co.kr
IMAP_PASSWORD=xxxxxxxxxxxxxxxx
```

### 4. OCR (옵션, 영수증 자동 파싱)

Vision API 키 JSON 파일 경로:
```
GOOGLE_VISION_KEY_PATH=C:\keys\vision.json
```

미설정 시 영수증은 메일 수집까지만 진행되고, 금액/일자는 관리자가 수동 보정합니다.

### 5. 자동 폴링 활성화

```
ENABLE_SCHEDULER=true
```

설정하면 서버 부팅 시 5분 간격으로 일일현황 시트와 IMAP 메일을 자동 폴링합니다.

---

## 폴더 구조 (요약)

```
src/
├── app/
│   ├── login/                  로그인
│   ├── (app)/
│   │   ├── dashboard/          대시보드
│   │   ├── teams/[teamId]/     팀 상세 (members/schedule/kpi/documents)
│   │   ├── daily/              일일현황
│   │   ├── documents/          서류제출
│   │   ├── reports/            주간보고
│   │   ├── contacts/           연락망
│   │   └── settings/           연동 설정
│   └── api/                    REST API 엔드포인트
├── components/                 UI 컴포넌트
├── db/                         Drizzle 스키마/시드/마이그레이션
└── lib/
    ├── auth.ts                 iron-session
    ├── permissions.ts          역할별 권한 매트릭스 (기획서 5장)
    ├── teams.ts                15개 팀 정적 데이터 (기획서 4장)
    ├── kpi.ts                  진도율 계산
    ├── reports.ts              주간보고 .xlsx 생성
    └── integrations/           Google/IMAP/OCR 연동
```

---

## DB 관리

```bash
# 스키마 변경 시 마이그레이션 생성
npm run db:generate

# 마이그레이션 적용
npm run db:migrate

# DB 초기화 (data/app.db 삭제)
npm run db:reset

# 시드 재적재
npm run db:seed
```

DB 파일 위치: `./data/app.db`

---

## 라이선스

(주)이암허브 사내 사용. 외부 배포 금지.
