# 프로젝트 개발 진척 상황판 (PROGRESS.md)

> ⚠️ **에이전트 필독**: 이 파일은 여러 에이전트가 작업을 이어받기 위한 핸드오프 문서입니다.
> 작업 시작 전 **반드시 전체를 읽고**, 완료 후 **반드시 업데이트**하세요.

---

## 🎯 프로젝트 개요

**제품명**: 웹 접근성 인증 프로젝트 PM 체크리스트 관리 툴  
**목표**: 웹접근성 인증 심사 전 과정을 관리하는 내부 PM 도구  
**기술 스택**: Next.js 15 (App Router) + Tailwind CSS v4 + Supabase + TypeScript  
**로컬 실행**: `npm run dev` → http://localhost:3000  
**배포 예정**: Vercel  
**기획 문서**: `PM_Tool_PRD_v1.1.md` (PRD v1.2 기준)

---

## 📊 전체 진행 상황

| 단계 | 상태 | 진척도 |
|------|------|--------|
| 1단계: 환경 설정 | ✅ 완료 | 100% |
| 2단계: Supabase 연동 | ✅ 완료 | 100% |
| 3단계: UI 컴포넌트 개발 | ✅ 완료 | 100% |
| 4단계: 기능 구현 | ✅ 완료 | 100% |
| 5단계: 테스트 및 배포 | ✅ 완료 | 100% |
| 6단계: UI 고도화 (shadcn/ui) | ✅ 완료 | 100% |
| **전체** | **개발 완료** | **100%** |

---

## 🗂️ 핵심 파일 구조 (에이전트 참조용)

```
project-manager/
├── src/
│   ├── app/
│   │   ├── projects/[slug]/  ← 개별 프로젝트 서브 라우트
│   │   ├── page.tsx          ← 메인 앱 (통합 대시보드)
│   │   └── globals.css       ← CSS 변수 및 전역 스타일
│   ├── components/
│   │   ├── Auth.tsx          ← 로그인/회원가입 컴포넌트
│   │   ├── ChecklistSection.tsx ← 체크리스트 렌더링 (phase별 필터)
│   │   ├── Dashboard.tsx     ← 프로젝트 통계 대시보드
│   │   └── Modals.tsx        ← 프로젝트/항목 생성·수정 모달
│   └── lib/
│       └── supabaseClient.ts ← Supabase 클라이언트 + STORAGE_BUCKET 상수
├── .agent/                   ← ECC 에이전트/스킬/워크플로우 설정
├── .claude/                  ← Hookify 훅 규칙 (로컬 전용)
├── .env.local                ← Supabase 환경변수 (git 제외)
├── database.sql              ← DB 스키마 전체 (테이블/RLS/RPC)
└── PROGRESS.md               ← 이 파일 (핸드오프 문서)
```

---

## 🧭 현재 앱 구조 / 메뉴 설계

`page.tsx`에서 `activeMenu` 상태로 화면 전환:

| `activeMenu` 값 | 메뉴명 | 구현 상태 |
|-----------------|--------|-----------|
| `dashboard` | 통합 현황판 | ✅ 완료 |
| `checklist_pm` | 프로젝트 체크리스트 | ✅ 완료 (phase별 탭: pre/in_progress/review/done) |
| `checklist_wbs` | WBS 일정표 | ✅ 완료 (내부DB 테이블 + 구글시트 iframe 연동) |
| `checklist_a11y` | 웹접근성 점검리스트 | ✅ 완료 (KWCAG 2.2 자동 시딩) |
| `checklist_weekly` | 주간보고서 | ✅ 완료 (자동 텍스트 생성 + 클립보드) |
| `documents` | 산출물 보관함 | ✅ 완료 |
| `settings` | 시스템 설정 | ✅ 완료 |

---

## 🗄️ DB 스키마 요약 (Supabase)

| 테이블 | 주요 컬럼 | 비고 |
|--------|-----------|------|
| `projects` | id, name, wbs_sheet_url, created_at | RLS 적용 |
| `checklist` | id, project_id, phase, group_name, text, tag(risk/doc/ext/null), checked, image_url, memo, due_date, assignee, sort_order | phase='accessibility'는 웹접근성 항목 |
| `wbs_rows` | id, project_id, row_order, level(1~4), task_l1~l4, description, assignee, status(미진행/진행중/완료), plan_start, plan_end, actual_start, actual_end, plan_progress, actual_progress | 구글시트 WBS와 병행 운영 |

**RPC 함수**: `create_project_with_defaults(project_name)` → 프로젝트 생성 + 기본 체크리스트 자동 삽입

---

## 🎨 WBS 테이블 설계 결정 (2026-06-19 기준)

> 다음 에이전트가 WBS 관련 작업 시 반드시 참조

### 색상 체계 (구글 시트 동일 기준)
- **Level 1** (착수/진단/수정/심사/완료 등 단계): `#c9daf8` 배경 + `#1a3a5c` 텍스트
- **Level 2** (그룹): `#e8f0fe` 배경 + `#1e4976` 텍스트  
- **Level 3** (세부업무): `#f8faff` 배경 + `#374151` 텍스트
- **Level 4** (최하위): `#ffffff` 배경 + `#6b7280` 텍스트
- **헤더**: `#1a3a5c` (네이비) 2단 구조 (계획/실제 일정 그룹 레이블)

### 입력 방식 결정
- `defaultValue` 대신 **`value + onChange`** (controlled component) 사용
  - 이유: 리렌더 시 데이터 초기화 방지
  - 패턴: `onChange`로 `setWbsRows` 즉시 반영 → `onBlur`로 Supabase 저장
- **진척율**: 읽기 전용 텍스트(%) — DB에서 받은 값만 표시, 수정 불가
- **날짜 필드**: `type="date"` input, `hover:bg-white` 호버 효과

---

## 🔗 구글 시트 → DB 동기화 설계 (2026-06-19)

### 아키텍처
```
구글 시트 WBS
    ↓ (Apps Script → UrlFetchApp.fetch)
Next.js API Route: /api/wbs-sync  [POST, Bearer 토큰 인증]
    ↓ (Service Role Key로 RLS 우회)
Supabase wbs_rows 테이블 (project_id 기준 전체 교체)
```

### 관련 파일
- `scripts/wbs-sync-apps-script.gs` — 구글 시트에 붙여넣을 Apps Script
- `src/app/api/wbs-sync/route.ts` — Next.js API 엔드포인트

### 필요 환경변수 (`.env.local`에 추가)
```
SUPABASE_SERVICE_ROLE_KEY=...   # Supabase 대시보드 Settings→API에서 복사
WBS_SYNC_SECRET=...             # openssl rand -hex 32 로 생성
```

### Apps Script CONFIG 입력값 (2가지)
1. `API_ENDPOINT` — 배포된 앱 URL + `/api/wbs-sync`
2. `SYNC_SECRET` — 위 `WBS_SYNC_SECRET`과 동일
*(구글 시트 URL 주소를 기반으로 프로젝트를 자동 매핑하므로 PROJECT_ID는 기입하지 않습니다)*

### 동기화 방식
- 기존 행 **전체 삭제 후 새 데이터 삽입** (upsert 아님)
- 시트 14행부터 데이터 읽기 (1~13행은 헤더)
- 날짜 형식 자동 변환: `"2026. 5. 6"` → `"2026-05-06"`
- 진척율 자동 변환: `"49%"` 또는 `0.49` → `49`

---

## 🔄 현재 진행 중인 작업 / 다음 작업

### 🔴 즉시 해야 할 작업
- [x] **Vercel 배포**: 환경변수(`.env.local`) Vercel 대시보드에 등록 후 배포
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - 참고: Vercel 프로젝트와 GitHub 저장소 연결 필요

### 🟡 개선 검토 중
- [ ] WBS 테이블 행 추가/삭제 기능 (현재는 DB 초기화 템플릿만 존재)
- [x] 구글 시트 → 내부 DB 동기화 Apps Script 연동 (2026-06-19 완료)
- [ ] 모바일 WBS 테이블 스크롤 UX 개선

### 🟢 완료 확인 필요
- [x] WBS 테이블 데이터 깨짐 수정 (2026-06-19 완료)
- [x] Hookify 훅 설정 (stop/prompt 이벤트)

---

## ⚠️ 주의사항 / 알려진 이슈

1. **`page.tsx`가 2100+ 줄** — 파일이 매우 큼. 수정 시 `grep_search`로 대상 라인 먼저 확인 후 편집
2. **Tailwind CSS v4** 사용 중 — v3 문법(`@apply`, `theme()` 함수)과 다를 수 있음. `globals.css` 참조
3. **`wbs_rows` 테이블의 `updated_at`** — `updateWbsRow()` 호출 시 항상 포함 (`new Date().toISOString()`)
4. **접근성 항목 분리** — `phase='accessibility'`인 checklist 항목은 PM 체크리스트 집계에서 제외됨
5. **Storage 버킷명** — `supabaseClient.ts`의 `STORAGE_BUCKET` 상수 참조 (하드코딩 금지)

---

## 🛠️ 세부 항목별 진척 현황

### 1단계: 환경 설정 및 기본 파일 생성 (✅ 완료)
- [x] ECC 에이전트 및 규칙 설치 (`.agent/`)
- [x] 기획서 개정 완료 (`PM_Tool_PRD_v1.1.md` → v1.2)
- [x] 데이터베이스 스키마 SQL 작성 (`database.sql`)
- [x] GitHub Actions Keep-Alive 워크플로우 생성
- [x] Hookify 훅 설정 (`.claude/hookify.*.local.md`)

### 2단계: Supabase 설정 및 연동 (✅ 완료)
- [x] Supabase 프로젝트 생성 및 환경변수 설정 (`.env.local`)
- [x] PostgreSQL 테이블 생성 및 RLS 정책 활성화
- [x] 기본 체크리스트 자동 등록용 RPC 함수 등록
- [x] Storage 버킷 생성 및 권한 설정

### 3단계: Next.js 프로젝트 셋업 및 컴포넌트 개발 (✅ 완료)
- [x] `create-next-app` + Tailwind CSS v4 초기 셋업
- [x] Auth / Dashboard / Modals / ChecklistSection 컴포넌트 구현
- [x] 좌측 SNB 사이드바 (반응형, 모바일 드로어 포함)

### 4단계: Supabase 연동 및 기능 구현 (✅ 완료)
- [x] Auth 로그인/회원가입
- [x] 프로젝트 CRUD + 기본 체크리스트 자동 삽입 (RPC)
- [x] 체크리스트 CRUD (메모, 마감일, 담당자, 이미지 업로드)
- [x] 실시간 데이터 동기화 (Realtime 채널)
- [x] WBS 일정표 (내부 DB 테이블 + 구글시트 iframe)
- [x] KWCAG 2.2 점검리스트 자동 시딩 (22개 항목)
- [x] 주간보고서 자동 생성기

### 5단계: 통합 테스트 및 Vercel 배포 (✅ 완료)
- [x] Vitest + React Testing Library 환경 구성
- [x] 핵심 로직 테스트 코드 작성 (커버리지 93%+)
- [x] 빌드 컴파일 검증 및 ESLint 해결
- [x] **Vercel 배포 완료 및 최종 동작 테스트**

### 6단계: UI 고도화 - shadcn/ui 도입 및 리팩토링 (✅ 완료)
- [x] shadcn/ui CLI 초기화 및 Radix/Nova 프리셋 의존성 설치
- [x] globals.css Tailwind v4 테마 변수 및 키프레임 애니메이션 수동 병합 복원
- [x] ProjectModal, ItemModal, ImageViewerModal을 shadcn Dialog 컴포넌트로 리팩토링 및 포털 최적화
- [x] cascading render ESLint 오류 제거 및 31개 테스트/Next.js 프로덕션 빌드 무결성 확인

---

## 📅 업데이트 이력

> 형식: `**날짜**: [설계 결정 포함 작업 내용]`

- **2026-06-18**: 에이전트 설치 완료. PRD v1.2 개정. DB 스키마 SQL 작성. GitHub Actions Keep-Alive 설정.
- **2026-06-18**: Supabase 환경변수 설정. 테이블 생성/RLS/RPC 등록/Storage 버킷 설정 완료 (2단계).
- **2026-06-18**: Next.js + Tailwind v4 기반 Auth/Dashboard/Modals/ChecklistSection 완전 구현. Supabase Auth/CRUD/Storage/Realtime 연동 완료 (3~4단계).
- **2026-06-18**: dateUtils 분리 리팩토링. Vitest+RTL 테스트 31개 작성, 커버리지 93%+ 달성. 빌드 검증 완료.
- **2026-06-18**: SNB 사이드바 전면 도입. 통합현황판/산출물보관함/시스템설정/WBS일정표/웹접근성점검/주간보고서 탭 완성.
- **2026-06-19**: Hookify 훅 설정. WBS 테이블 재건(defaultValue→value+onChange, 색상 체계, 2단 헤더). 계획%/실제% 읽기 전용으로 변경. 헤더 rowSpan 병합. 구글시트→DB 동기화 구현: `scripts/wbs-sync-apps-script.gs`(Apps Script) + `src/app/api/wbs-sync/route.ts`(Next.js API). 환경변수 2개 추가 필요: `SUPABASE_SERVICE_ROLE_KEY`, `WBS_SYNC_SECRET`. Supabase REST API 직접 호출 시 보안 경고(Forbidden use of secret API key) 우회를 위해 Apps Script를 Next.js API Route 호출 방식으로 롤백 조치. .env.local 파일에 SUPABASE_SERVICE_ROLE_KEY 환경변수 설정 적용. Apps Script 내 잘못된 PROJECT_ID 값을 Supabase에 존재하는 실제 프로젝트 ID(롯데 GRS)로 맞춰 외래키 제약조건 위반 에러 해결. 구글 시트 상단 메뉴바에 동기화 수동 실행용 '🔄 WBS 동기화' 커스텀 메뉴 추가(onOpen). 기획자 편의성을 위해 구글 시트 URL 기반 프로젝트 자동 매핑 방식 구현 (Apps Script에서 CONFIG.PROJECT_ID 필드 제거 및 sheet_url 자동 전달, Next.js 백엔드 API에서 spreadsheetId 파싱 및 Supabase DB projects 테이블 대조 매칭 흐름 추가). WBS 연동 미완료 시 구글 스프레드시트 템플릿 열기 및 사본 복사 유도 UI 추가, 연동 완료 시 기존 iframe 뷰를 제거하고 새 창으로 연결할 수 있는 '구글 WBS 시트 열기' 버튼 UI/UX 전면 개편. 기획자 클릭 시 시트 사본을 구글 드라이브에 바로 생성하도록 URL을 /copy 주소로 변경하여 자동화 개선. 내부 WBS 테이블 뷰의 모든 인풋창(input, select)을 완전 읽기 전용(Read-Only) 텍스트 및 상태 배지 형태로 전면 교체하여 연동 데이터 안정성 확보. TASK 및 Description 열에 마우스 호버 시 잘린 텍스트가 줄바꿈 없이 한 줄로 둥실 떠서 노출되는 토스 스타일의 커스텀 CSS 툴팁 탑재.
- **2026-06-19**: 웹 접근성 점검리스트(KWCAG 2.2) 구글 시트 연동 기능 추가: `scripts/a11y-sync-apps-script.gs`(Apps Script) + `src/app/api/a11y-sync/route.ts`(Next.js API). `a11y_migration.sql` 데이터베이스 마이그레이션 스크립트 작성 및 `database.sql` 반영. `page.tsx` 웹 프론트엔드 연동 폼 및 [구글 접근성 시트 열기] 이동 버튼 UI 개편, 점검 대장 테이블 완전 읽기 전용 뷰 및 Toss-style 한 줄 말풍선 호버 툴팁 적용 완료. 공개 구글 시트 템플릿의 실제 25개 컬럼 구조 분석 결과를 기반으로 Apps Script의 수집 범위 확대(6→25열) 및 복수 상태(수정완료/검수완료) 동적 파싱 로직을 완성했으며, 내부 점검 대장 테이블 헤더(상태, 지침명, 오류 사항, 담당자, 조치일, 개선방안 및 비고) 역시 구글 시트의 실제 구조와 1:1로 완전히 통일시켜 개편 완료.
- **2026-06-19**: 웹 접근성 점검대장 컬럼 전면 개편. 구글 시트 연동 스크립트(`a11y-sync-apps-script.gs`)의 `A11Y_COL` 인덱스(A~U) 및 `_a11yReadRows` 로직을 수정하여 대분류 1~3 병합('a > b > c'), 지침 원칙-명 병합('g-h'), 이미지 및 배포상태 수집을 연동하고, '오류사항(I)', '점검상태(T)', '비고(U)'를 JSON 문자열로 패킹하여 `memo` 필드에 통합 저장함. Next.js 백엔드 API에서 `tag`, `image_url` 필드를 DB 쿼리에 추가 연동함. 웹 프론트엔드(`page.tsx`) 내 점검대장 테이블을 사용자 요청 사양에 부합하는 9개 컬럼(`no`, `메뉴`, `지침명`, `오류사항`, `담당자`, `배포상태`, `점검상태`, `이미지`, `비고`)으로 재설계하고, `memo` 필드 JSON 안전 파싱 매핑, 배포/점검상태에 스타일 배지 및 Toss-style 한 줄 말풍선 호버 툴팁을 적용하여 마무리지음.
- **2026-06-19**: 구글 시트 수집 열을 기존 P열(배포상태), T열(점검상태)에서 O열(상태)로 단일화함. O열 상태값('검수완료', '수정완료', '조치완료', '수정중', '조치필요')을 연동해 '검수완료'인 경우에만 checked = true로 판정하며, 대시보드 요약 지표를 이 5개 진행 상태 및 총 페이지 수로 이루어진 6개 카드 체계(조치필요/수정중/수정완료/조치완료/검수완료)로 전면 확장 개편하고, 테이블 배지 스타일링과 연동을 완벽히 마무리지음.
- **2026-06-19**: 접근성 점검대장 테이블 뷰에 5개 상태('조치필요', '수정중', '수정완료', '조치완료', '검수완료') 카운트가 표기되는 탭 필터를 추가하고, 테이블 로우 정렬을 개발 수명주기 순서('조치필요' -> '수정중' -> '수정완료' -> '조치완료' -> '검수완료')로 직관적으로 정렬 노출하도록 개편 완료.
- **2026-06-19**: 웹 접근성 대시보드 내 "원칙별 위반 현황"을 "메뉴 Depth별 세부 조치 현황" 아코디언 컴포넌트로 개편하여, 뎁스(대분류 > 중분류 > 소분류)별 조치 건수 집계 및 세부 위반/조치 내용(지침명, 오류사항, 담당자, 이미지 증빙 등)을 한눈에 접고 펴며 파악할 수 있도록 고도화 완료.
- **2026-06-19**: 사이드 네비게이션 바(SNB)에 "배포리스트" 서브메뉴 탭을 신규 추가하고, 해당 메뉴 선택 시 배포 슬라이드 구글 프레젠테이션 템플릿 복제 링크, 데이터 연동용 스프레드시트 템플릿 복제 링크 및 Apps Script 슬라이드 생성 작동법 상세 연동 가이드 UI와 "배포리스트" 탭의 A~I열 컬럼 명세 규격 테이블을 탑재 완료.
- **2026-06-19**: 배포리스트 가이드 탭의 구글 스프레드시트 연동 카드 UI 개선. 접근성 점검표 구글 시트가 이미 연동되어 있는 경우, 배포 데이터 연동 스프레드시트 카드의 기본 설명 텍스트 정체성을 항시 유지하면서 연동된 시트를 즉시 새 창으로 이동할 수 있는 '구글 시트 열기' 버튼을 주력으로 표시하고 '템플릿 복사' 버튼을 서브 형태로 나란히 배치 제공하여 사용성과 직관성을 대폭 개선함.
- **2026-06-19**: 슬라이드 자동화 실행 시 생성 이력 저장 및 실시간 누적 연동 완료. 신규 DB 테이블 `deploy_slides` 마이그레이션 생성, Next.js 백엔드 알림 수집 API `/api/deploy-slide-sync` 구축, 구글 Apps Script(`a11y-sync-apps-script.gs`) 내 슬라이드 생성 완료 시 API 전송 로직 탑재, 웹 프론트엔드(`page.tsx`) 내 "📊 배포 슬라이드 생성 이력" 섹션 추가 및 Supabase Realtime 실시간 동기화/갱신 렌더링 완료. 또한 배포리스트 탭에서 불필요한 구글 시트 사본 만들기 관련 템플릿 복제 링크 버튼을 전면 제거하고, 기존에 연동된 구글 시트로 바로 직행하거나 미연동 시 접근성 연동 탭으로 바로 화면 전환되는 "웹접근성 점검리스트 탭으로 이동" 버튼을 적용해 연동 동선을 깔끔하게 단일화함. 이에 덧붙여 생성된 슬라이드 히스토리 테이블 우측에 쓰레기통 아이콘 기반의 "이력 삭제" 버튼을 추가하여, 잘못 등록된 이력을 사용자가 웹 앱 상에서 직접 DB 데이터 삭제와 실시간 목록 동기화를 처리할 수 있도록 완결성을 높임. 추가적으로 배포리스트 화면에서 기존의 복잡했던 수동 연동 설명 가이드 카드 및 컬럼 규격 안내 표(A~I열 명세) 카드를 완전히 제거하여 화면을 한층 더 컴팩트하고 실무 친화적인 실행형 뷰로 개편 완료.
- **2026-06-19**: 회원가입 시 비밀번호 확인용 필드(`confirmPassword`)를 추가하여 입력 불일치 시 차단 기능 구현. 가입 완료 시 이메일 인증 안내 alert 창 연동. 깃허브 배포 동기화 완료 및 Supabase Localhost 리다이렉션 에러 원인 및 해결 가이드 작성.
- **2026-06-19**: WBS 및 접근성 점검표의 구글 시트 연동 절차를 3단계(사본 생성 -> URL 복사 -> 등록) 비주얼 가이드로 UI 보완 및 보안 한계점 대응 기술 설명 작성.
- **2026-06-22**: 배포 슬라이드 탭 내의 자동 생성 절차(4단계 요약 가이드) 및 스프레드시트 배포리스트 탭 작성용 컬럼 규격 안내(A~I열 아코디언 표)를 상세히 보완하여 사용성 개편 완료.
- **2026-06-22**: Next.js App Router 물리적 폴더 기반 nested/dynamic 라우팅 구조 개편 완료. `projects/[id]/a11y`, `projects/[id]/weekly`, `projects/[id]/deploy-slides`, `projects/[id]/documents` 개별 프로젝트 탭 및 전역 `/settings`, `/admin` 단독 페이지 이식 완료. `page.tsx` 대시보드 리팩토링 및 31개 Vitest 유닛 테스트와 Next.js optimized production build 모두 성공적으로 검증 완료.
- **2026-06-22**: UUID 기반의 프로젝트 URL 구조를 영문 식별자 기반의 직관적인 경로(/projects/[slug]/...)로 개편 완료. projects 테이블에 slug 컬럼 및 UNIQUE 제약 추가, 새 프로젝트 생성 모달(ProjectModal) 내 영문 식별자 입력 필드 및 정규식 검증 추가. Sidebar, Header, page.tsx(대시보드) 라우팅 링크를 영문 슬러그로 변경. 서브 페이지(checklist, wbs, a11y, weekly, deploy-slides, documents)에서 slug를 통해 UUID projectId 매핑 쿼리 처리 완료. Vitest 유닛 테스트 수정 및 31개 전체 테스트 통과 검증 완료.
- **2026-06-22**: 모든 모달 컴포넌트(ProjectModal, ItemModal, ImageViewerModal)에 React Portal(createPortal)과 mounted 마운트 체크 방어 로직을 전면 탑재하여, 부모 요소의 CSS 레이아웃 제약에 의해 딤(dim) 배경과 모달 팝업 위치가 부분 영역 내에 갇히거나 깨지던 UI 렌더링 오동작을 완벽하게 예방 및 해결 완료.
- **2026-06-22**: 사이드바(Sidebar.tsx)의 '통합 현황판' 링크를 무조건 홈(루트 '/')으로 연동되도록 수정하고 하이라이트 활성화 조건문을 개선하여, 프로젝트 상세 관리 서브 페이지로 이동한 뒤에도 언제든지 홈으로 원활히 복귀할 수 있도록 교정 완료.
- **2026-06-22**: 프로젝트 미선택 시(통합 현황판 등) 사이드바에서 '프로젝트 체크리스트' 및 '산출물 보관함' 탭을 자동으로 숨기고, 상단 헤더 등을 통해 프로젝트를 선택했을 때만 사이드바에 나타나도록 조건부 렌더링을 적용하여 UI/UX 동선을 최적화함.
- **2026-06-22**: 프로젝트에 shadcn/ui(Radix / Nova 프리셋)를 도입하고, globals.css 테마 변수 병합 및 기존 커스텀 모달 컴포넌트(ProjectModal, ItemModal, ImageViewerModal)를 shadcn Dialog 표준 컴포넌트로 마이그레이션 완료. cascading render ESLint 오류 해결을 위해 불필요한 mounted 상태 및 useEffect 제거 후 ESLint, 31개 단위 테스트 및 Next.js optimized production build 검증 완수.
- **2026-06-22**: 웹 접근성 대시보드의 '메뉴 Depth별 세부 조치 현황' 아코디언 및 내부 항목의 기본 정렬 기준을 구글 스프레드시트 수집 순서(sort_order 오름차순)로 변경하고, 사용자가 화면에서 실시간으로 정렬 기준(구글 시트 순서 vs 조치 시급 순)을 직접 전환할 수 있도록 셀렉트 박스 필터 컴포넌트를 UI에 탑재 완료.
- **2026-06-22**: 새 프로젝트 추가 모달(ProjectModal) 및 호출부(Header.tsx, page.tsx)에 중복 프로젝트명 검증용 existingNames 프로퍼티와 프론트엔드 유효성 검사 로직을 탑재하여, 기존 생성된 프로젝트명과 대소문자/공백 무시 기준 일치 시 '이미 존재하는 프로젝트 이름입니다...' 에러 노출 및 생성을 방지하도록 보완 완료.
- **2026-06-22**: 프로젝트 내 백엔드 API 명세(/api/wbs-sync, /api/a11y-sync, /api/deploy-slide-sync, /api/admin/users)를 제공하는 Swagger UI 문서 페이지(/api-docs)를 신규 개설하고, 개발자들의 원활한 확인을 돕기 위해 비로그인 상태에서도 접근이 가능하도록 ClientLayout 라우팅 게이트웨이 예외 처리를 반영 완료.
- **2026-06-22**: ClientLayout(AppShell) 내 authLoading early return 이후에 usePathname 훅이 호출되어 발생하던 React Rules of Hooks 순서 위반 오류(change in Hook order)를 훅 선언부 최상단 이동 처리를 통해 교정 완료.
- **2026-06-22**: WBS 구글 시트 동기화 시 Trailing Slash(/) 입력으로 인해 POST 요청이 GET 상태 체크 API로 308 리다이렉트되어 [HTTP 200] 알 수 없는 오류가 발생하던 이슈 분석 및 가이드 제공.
- **2026-06-22**: WBS 화면의 세 번째 탭을 '전체 일정 (Gantt)'으로 개편하고, 2단 시간축(월/주차), 현재선(Today Line), 마일스톤 수직 점선(★), 실제 진척도가 채워지는 가로형 태스크 바 및 말풍선 툴팁이 모두 연동된 종합 간트 차트 뷰 전면 구현 완료 (단위 테스트 32개 및 프로덕션 빌드 검증 성공).
- **2026-06-22**: WBS 간트 차트 가독성 증진을 위한 표기 레벨 제한(Level 3 이하만 노출) 및 실제 일정 제외 오직 계획 일정(`plan_start`, `plan_end`) 및 계획 진척율(`plan_progress`) 기준 렌더링 세부 필터 보완 완료.
- **2026-06-22**: 간트 차트 3가지 렌더링 버그 수정 완료. (1) 현재선·마일스톤이 태스크 바 뒤에 깔리던 z-index 문제 해결 — 오버레이 div(z-20)로 분리하여 항상 위에 표시. (2) `calc(260px + percent%)` 위치 계산 오류 수정 — 오버레이를 `left: 260px`부터 시작해 태스크 바의 left% 기준과 1:1 일치하도록 개편. (3) Phase(착수/진단/수정/심사/완료) Level 1 행에 직접 날짜가 없을 때 하위 태스크의 min/max 날짜로 자동 계산하는 `phasesComputed` 로직 추가.
- **2026-06-23**: 로컬 네트워크에서 HMR WebSocket 접속 시 연결 실패하는 오류 해결을 위해 `next.config.ts` 파일의 `allowedDevOrigins` 설정에 `192.168.20.42`를 명시적으로 등록하고, Node.js `os` 모듈을 이용해 서버의 활성 IPv4 주소들을 자동으로 수집하여 추가되도록 동적 IP 매핑 로직을 구현함.


