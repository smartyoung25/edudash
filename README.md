# 2026 성장농 맞춤형과정 교육운영 관리 시스템

(주)이암허브가 운영하는 15개 농업 교육팀의 일일 수업 현황·서류·KPI·주간보고를 통합 관리하는 웹 시스템입니다. 기획서 `2026_성장농_교육운영시스템_기획서_v1.2.docx` 를 바탕으로 구축되었습니다.

> **배포 대상: Cloudflare Workers (OpenNext + D1)**. Cloudflare 환경에 맞춰 IMAP→Gmail API, 로컬 SQLite→D1, 파일 시스템 업로드→Google Drive 직접 업로드로 재구성되어 있습니다. 배포 절차는 아래 [**Cloudflare 배포**](#cloudflare-배포-d1--opennext) 섹션을 참고하세요.

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
- **Cloudflare Workers** + **@opennextjs/cloudflare** — 프로덕션 런타임
- **Cloudflare D1** (SQLite) + **Drizzle ORM** — 프로덕션 DB
- **libSQL (`@libsql/client`)** — 로컬 CLI 스크립트(migrate/seed/reset) 전용
- **iron-session** + **bcryptjs** — HTTP-only 쿠키 기반 세션
- **googleapis** — Sheets / Drive / Gmail REST 연동 (서비스 계정 JWT)
- **exceljs** — 주간보고 .xlsx 생성

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

## Cloudflare 배포 (D1 + OpenNext)

### 사전 준비

- Cloudflare 계정 (대시보드 로그인 가능)
- Google Cloud 서비스 계정 JSON 파일 (Sheets / Drive / Gmail 위임 권한 포함)
- Wrangler CLI 로그인: `npx wrangler login` (브라우저에서 OAuth 승인)

### 1. D1 데이터베이스 생성

```bash
npx wrangler d1 create edu-dash-db
```

출력에 나오는 `database_id`를 `wrangler.jsonc`의 `d1_databases[0].database_id`(현재 `PLACEHOLDER_RUN_wrangler_d1_create`) 자리에 붙여넣으세요.

### 2. 마이그레이션 적용

```bash
# 원격(프로덕션) D1
npm run d1:migrate:remote

# 로컬(미니플레어) D1 — preview 모드 테스트용
npm run d1:migrate:local
```

`./drizzle/*.sql` 가 Cloudflare D1에 적용됩니다.

### 3. Secret 등록

서비스 계정 JSON은 **한 줄 문자열**로 등록합니다. PowerShell 예시:

```powershell
$json = Get-Content "C:\keys\sa.json" -Raw
$json | npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
```

나머지 secret:

```bash
npx wrangler secret put SESSION_PASSWORD          # 32자 이상 임의 문자열
npx wrangler secret put GOOGLE_DELEGATED_USER      # 예: stepup2@iiam.co.kr
npx wrangler secret put DAILY_SHEETS_SPREADSHEET_ID
npx wrangler secret put EXPENSE_SHEETS_SPREADSHEET_ID
npx wrangler secret put DRIVE_ROOT_FOLDER_ID
npx wrangler secret put GMAIL_USER                 # 메일함 주소, 예: stepup2@iiam.co.kr
```

### 4. Gmail / Drive / Sheets 권한

Google Workspace 관리 콘솔에서 서비스 계정 client_id에 대해 **도메인 전체 위임**으로 다음 스코프를 부여:

```
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/drive
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.modify
```

`GOOGLE_DELEGATED_USER` 가 메일/시트/드라이브의 실제 소유 계정이어야 합니다.

### 5. 시드 데이터 (선택)

초기 사용자/팀 데이터는 로컬에서 시드 후 SQL 덤프를 D1에 적용하거나, 별도 API/관리 UI로 입력하세요. 현재 `npm run db:seed` 는 로컬 libsql 파일(`data/app.db`)을 대상으로 합니다.

D1에 시드 데이터를 넣는 한 가지 방법:

```bash
# 1. 로컬 libsql에 seed 실행
npm run db:migrate
npm run db:seed

# 2. data/app.db를 SQL로 덤프 (sqlite3 CLI 필요)
sqlite3 data/app.db .dump > seed.sql

# 3. CREATE TABLE / PRAGMA 라인을 제거하고 INSERT만 남긴 뒤 D1에 실행
npx wrangler d1 execute edu-dash-db --remote --file seed-inserts-only.sql
```

### 6. 배포

```bash
npm run preview   # 로컬 miniflare 미리보기 (D1 로컬 + 실 secret 미사용)
npm run deploy    # Cloudflare Workers 로 게시
```

`deploy` 명령은 `opennextjs-cloudflare build` 로 `.open-next/worker.js` 를 만들고, `wrangler deploy` 로 업로드합니다.

배포 완료 시 출력되는 `https://edu-dash.<account>.workers.dev` URL로 접속하면 됩니다. 커스텀 도메인은 Cloudflare 대시보드 > Workers > 해당 워커 > Settings > Triggers > Custom Domains 에서 연결합니다.

### 7. 메일 수집 주기

`node-cron` 은 Workers 에서 동작하지 않으므로 제거되었습니다. 주기적 메일 수집이 필요하면:

- (간단) `POST /api/integrations/mail/sync` 를 외부 크론(Cloudflare Workflows, GitHub Actions, Upstash 등) 에서 호출
- (네이티브) `wrangler.jsonc` 에 `triggers.crons` 를 추가하고 별도 worker entrypoint 에서 `fetch('/api/integrations/mail/sync')` 호출 (추가 셋업 필요)

### 트러블슈팅

- **`D1 binding 'DB' is not available`**: `wrangler.jsonc` 의 `database_id` 가 placeholder 그대로이거나, `next dev` 로 띄운 경우. `npm run preview` 사용 권장.
- **`GOOGLE_SERVICE_ACCOUNT_JSON 파싱 실패`**: secret에 JSON 따옴표/줄바꿈이 깨졌을 가능성. `wrangler secret put` 에 한 줄 문자열로 파이프하세요.
- **OpenNext 빌드의 `equals-negative-zero` warning**: 외부 라이브러리 코드의 무해한 경고로 무시 가능.

---

## 로컬 개발 (참고)

`next dev` 단독으로는 D1 바인딩이 없어 API 라우트 호출 시 에러가 납니다. 두 가지 방식 중 선택:

- **UI 전용 작업**: `npm run dev` — DB 호출이 없는 페이지만 확인
- **풀스택 미리보기**: `npm run preview` — miniflare가 로컬 D1 + 시뮬레이션 secret 제공

`.dev.vars` 에 로컬 secret 값을 넣어두면 `preview` 가 자동 로드합니다.

---

## 라이선스

(주)이암허브 사내 사용. 외부 배포 금지.
