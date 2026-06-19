// ==========================================
// ⚙️ 설정 (본인 환경에 맞게 수정해 주세요)
// ==========================================
// 1. Supabase 프로젝트 URL (대시보드 Settings > API 참조)
const SUPABASE_URL = 'https://[본인의_프로젝트_ID].supabase.co/rest/v1/wbs_rows';

// 2. Supabase anon (public) 키
const SUPABASE_KEY = '[본인의_SUPABASE_ANON_KEY]';

// 3. 동기화할 대상 PM 툴의 Project ID (UUID)
// PM 툴에서 해당 프로젝트 선택 시 URL이나 DB에서 확인할 수 있습니다.
const PROJECT_ID = '여기에_프로젝트_ID_입력'; 

// ==========================================
// 🗺️ 컬럼 매핑 (구글 시트 열 번호 -> DB 필드명)
// ==========================================
const COLUMN_MAP = {
  2: 'task_l1',          // B열: TASK
  3: 'description',      // C열: Description
  4: 'assignee',         // D열: R/R
  5: 'status',           // E열: Status
  6: 'plan_start',       // F열: 계획 시작 (YYYY-MM-DD 형식 권장)
  7: 'plan_end',         // G열: 계획 완료
  8: 'actual_start',     // H열: 실제 시작
  9: 'actual_end',       // I열: 실제 완료
  10: 'plan_progress',   // J열: 계획(%)
  11: 'actual_progress'  // K열: 실제(%)
};

// ⚠️ 이 함수는 외부 HTTP 통신을 하므로 '설치 가능한 트리거'로 등록해야 합니다.
function handleEditEvent(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  const col = e.range.getColumn();
  const row = e.range.getRow();
  
  // 1행(제목 헤더) 변경은 무시
  if (row <= 1) return;

  // 매핑된 컬럼인지 확인 (아니면 무시)
  const fieldName = COLUMN_MAP[col];
  if (!fieldName) return;

  // A열(1번 컬럼)에 있는 No(row_order) 값을 읽어와 식별자로 사용
  const rowOrder = sheet.getRange(row, 1).getValue();
  if (!rowOrder) return;

  // 변경된 값 가져오기 (지웠을 경우 null 처리)
  let updateValue = e.value;
  if (updateValue === undefined || updateValue === "") {
    updateValue = null;
  }

  // Supabase로 업데이트 요청
  updateSupabase(rowOrder, fieldName, updateValue);
}

function updateSupabase(rowOrder, field, value) {
  const payload = {};
  payload[field] = value;

  const options = {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  // project_id와 row_order가 일치하는 행을 업데이트
  const url = `${SUPABASE_URL}?project_id=eq.&row_order=eq.`;

  try {
    const response = UrlFetchApp.fetch(url, options);
    console.log(`Row  / Field  업데이트 성공. (상태: ${response.getResponseCode()})`);
  } catch (error) {
    console.error('Supabase 연동 실패:', error.message);
  }
}
# PM 관리 툴 — PRD v1.2

> 웹 접근성 인증 프로젝트 PM 체크리스트 관리 툴  
> Project Requirements Document

| 항목 | 내용 |
|---|---|
| 작성자 | 정인호 매니저 (이트라이브) |
| 작성일 | 2026년 6월 |
| 버전 | v1.2 |
| 상태 | 초안 (Draft) |
| 참조 프로젝트 | 롯데잇츠 웹 접근성 구축사업 (2026.02–04) |
| 변경 이력 | v1.1: 기술 스택 Supabase + Vercel 확정, GitHub Actions Keep-Alive 추가<br>v1.2: Supabase Auth 도입, RLS 보안 정책 강화, DB 스키마 확장(메모/마감일/담당자), 실시간 동기화 및 Storage 최적화 정책 추가 |

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [확정 기술 스택](#2-확정-기술-스택)
3. [GitHub Actions Keep-Alive](#3-github-actions-keep-alive)
4. [기능 요구사항](#4-기능-요구사항)
5. [Supabase 데이터 구조](#5-supabase-데이터-구조)
6. [비기능 요구사항](#6-비기능-요구사항)
7. [개발 로드맵](#7-개발-로드맵)
8. [UI 구조](#8-ui-구조)
9. [기본 체크리스트 데이터](#9-기본-체크리스트-데이터)
10. [제약 사항](#10-제약-사항)

---

## 1. 프로젝트 개요

### 1.1 배경

롯데잇츠 웹 접근성 프로젝트(KWCAG 2.2, 웹와치 인증) 수행 중 PM이 단계별로 챙겨야 할 체크리스트·이슈 관리·산출물 추적·이미지 첨부 등의 업무가 노션·엑셀·카카오톡에 분산되어 관리 효율이 낮았습니다. 이를 하나의 웹 툴로 통합하여 다음 접근성 인증 프로젝트에서 즉시 활용합니다.

### 1.2 목적

- 접근성 인증 프로젝트 전 단계(착수 전 → 진행 중 → 심사 → 완료)의 PM 체크리스트를 웹에서 통합 관리
- 프로젝트별(롯데잇츠, 롯데GRS 등) 독립 데이터 분리
- 체크리스트 항목 CRUD, 체크 상태 저장, 이미지 첨부를 웹 페이지에서 모두 처리
- 팀 내부 공유 URL로 팀원 누구나 접근 가능

### 1.3 범위

- 대상 플랫폼: 웹 브라우저 (PC 우선, 모바일 반응형 고려)
- 대상 사용자: 이트라이브 PM 및 팀원 (사내 내부용)
- 기준: KWCAG 2.2 + 모바일 앱 접근성 지침 2.0 / 웹와치 인증

---

## 2. 확정 기술 스택

### 2.1 최종 선택

| 레이어 | 기술 | 역할 | 비용 |
|---|---|---|---|
| DB | Supabase (PostgreSQL) | 데이터 저장, REST API 자동 생성, Swagger UI 포함 | 무료 티어 |
| 인증/보안 | Supabase Auth | 이트라이브 사내 이메일 가입 및 로그인 | 무료 티어 |
| 이미지 저장 | Supabase Storage | 첨부 이미지 저장 (1GB 무료) | 무료 티어 |
| 프론트엔드 | HTML + Vanilla JS | 체크리스트 UI, CRUD, 이미지 업로드, Supabase Auth 연동 | 없음 |
| 배포 | Vercel | 프론트 정적 배포, 자동 HTTPS | 무료 티어 |
| API 문서 | Swagger UI | Supabase에서 자동 생성됨 | 없음 |
| Keep-Alive | GitHub Actions | 주 2회 DB 핑 — 일시정지 방지 | 없음 |

### 2.2 아키텍처 구조

```
브라우저 (Vercel 배포)
  ├─ Supabase Auth (이메일 인증 및 JWT 획득)
  └─ fetch() 호출 (JWT Authorization 헤더 포함)
      └─ Supabase PostgREST (REST API 자동 생성 + Swagger UI + RLS 필터링)
          ├─ PostgreSQL (프로젝트·체크리스트 데이터)
          └─ Storage (이미지 파일)

GitHub Actions (스케줄)
  └─ 주 2회 GET /rest/v1/checklist?limit=1 → Keep-Alive 핑
```

### 2.3 기술 선택 이유

| 항목 | 구글 시트 + Apps Script | Firebase | Supabase ✓ 채택 |
|---|---|---|---|
| DB 종류 | 스프레드시트 | NoSQL (Firestore) | PostgreSQL (SQL) |
| REST API 자동 생성 | 없음 | 없음 (SDK 방식) | 있음 (자동) |
| Swagger UI | 없음 | 없음 | 있음 (자동 포함) |
| 실시간 동기화 | 없음 | 있음 | 있음 (Realtime 채널) |
| SQL 사용 | 불가 | 불가 | 가능 |
| 무료 API 호출 | 2만 건/일 | 5만 읽기/일 | 무제한 |
| 일시정지 위험 | 없음 | 없음 | 1주 비활성 시 → Actions로 해결 |

---

## 3. GitHub Actions Keep-Alive

### 3.1 목적

Supabase 무료 티어는 7일간 API 요청이 없으면 프로젝트가 일시정지됩니다.  
GitHub Actions 스케줄 워크플로우로 **주 2회 자동으로 DB에 핑**을 보내 일시정지를 방지합니다.  
제3자 서비스 없이 완전 무료로 동작합니다.

### 3.2 설정 방법

#### Step 1 — GitHub Secrets 등록

GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret

| Secret 이름 | 값 |
|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL (예: `https://xxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Supabase 대시보드 → Settings → API → anon public 키 |

#### Step 2 — 워크플로우 파일 생성

저장소 루트에 `.github/workflows/keep-alive.yml` 파일 생성:

```yaml
name: Supabase Keep Alive

on:
  schedule:
    - cron: '0 0 * * 1,4'  # 매주 월·목 오전 9시 (KST = UTC+9, cron은 UTC 기준)
  workflow_dispatch:         # 수동 실행 가능

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase DB
        run: |
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            "${{ secrets.SUPABASE_URL }}/rest/v1/checklist?limit=1" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}")
          echo "HTTP Status: $STATUS"
          if [ "$STATUS" != "200" ]; then
            echo "Ping failed with status $STATUS"
            exit 1
          fi
          echo "Supabase is alive!"
```

#### Step 3 — 동작 확인

- GitHub 저장소 → Actions 탭에서 워크플로우 확인
- `Run workflow` 버튼으로 수동 실행 테스트
- HTTP Status 200 반환 시 정상

### 3.3 정지 시 복구 방법 (참고)

만약 일시정지가 발생하더라도 **결제 없이 복구 가능**합니다.

1. Supabase 대시보드 접속
2. 해당 프로젝트 → `Restore project` 버튼 클릭
3. 2~3분 대기 후 자동 복구 (데이터 유지됨)

> 정지 후 **90일 이내**라면 언제든 무료 복구 가능

---

## 4. 기능 요구사항

### 4.1 인증 및 접근 권한 관리
- [ ] 사내 이메일(@etribe.co.kr 등) 기반 회원가입 및 로그인 (Supabase Auth)
- [ ] 로그인 세션 유지 및 로그아웃 기능
- [ ] 미인증 사용자 접근 제어 및 로그인 페이지 리다이렉트

### 4.2 프로젝트 관리
- [ ] 프로젝트 목록 조회 및 전환 (드롭다운)
- [ ] 프로젝트 추가·삭제 (Supabase `projects` 테이블에 행 추가)
- [ ] 프로젝트별 전체 진행률 표시
- [ ] 프로젝트 생성 시 기본 체크리스트 자동 삽입 (Supabase Database RPC 호출)

### 4.3 체크리스트 CRUD 및 관리
- [ ] 단계별 탭: 착수 전 / 진행 중 / 심사 / 완료 후
- [ ] 항목 조회: 단계별 그룹 및 태그(리스크·산출물·외부) 표시
- [ ] 항목 추가·수정·삭제 (Supabase REST API 호출)
- [ ] 상세 메모(`memo`) 입력 및 수정
- [ ] 담당자(`assignee`) 지정 및 필터링
- [ ] 마감일(`due_date`) 설정 및 D-Day(디데이) 표시
- [ ] 체크 상태 저장: 체크박스 클릭 즉시 `PATCH` 요청
- [ ] 완료 항목 취소선 처리 및 진행률 실시간 갱신
- [ ] **실시간 동기화 (Realtime Sync)**: 타 사용자의 상태 변경을 실시간 반영

### 4.4 이미지 첨부 및 Storage 최적화
- [ ] 항목별 이미지 첨부 (Supabase Storage 업로드, 파일당 최대 5MB 제한)
- [ ] 첨부 이미지 썸네일 미리보기 및 원본 보기
- [ ] 이미지 교체 및 삭제 기능
- [ ] **Storage 잔재 정리**: 이미지 교체/삭제 혹은 항목 삭제 시 스토리지 원본 파일 자동 제거
- [ ] Supabase Storage 영구 공개 URL 사용 (만료 없음)

### 4.5 진행률 대시보드
- [ ] 전체 완료율 프로그레스 바
- [ ] 단계별 완료 항목 수 / 전체 항목 수 뱃지
- [ ] 태그별 미완료 항목 강조 및 마감 임박 항목 시각화

### 4.6 Keep-Alive 자동화
- [ ] GitHub Actions 주 2회 스케줄 실행
- [ ] Supabase REST API GET 요청으로 비활성 방지
- [ ] 실패 시 GitHub Actions 알림 수신

---

## 5. Supabase 데이터 구조

### 5.1 테이블 설계

#### projects 테이블

```sql
create table projects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz default now()
);
```

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid (PK) | 프로젝트 고유 ID (자동 생성) |
| `name` | text | 프로젝트명 (예: 롯데잇츠) |
| `created_at` | timestamptz | 생성일시 (자동) |

#### checklist 테이블

```sql
create table checklist (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references projects(id) on delete cascade,
  phase        text not null,       -- pre / in_progress / review / done
  group_name   text not null,
  text         text not null,
  tag          text,                -- risk / doc / ext / null
  checked      boolean default false,
  image_url    text,
  memo         text,                -- 심사 지적사항 상세 또는 추가 업무 내용 메모
  due_date     date,                -- 완료 마감일 (일정 수립용)
  assignee     text,                -- 담당 실무자 이름
  sort_order   integer default 0,
  updated_at   timestamptz default now()
);
```

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid (PK) | 항목 고유 ID (자동 생성) |
| `project_id` | uuid (FK) | projects.id 참조 |
| `phase` | text | 단계 (pre / in_progress / review / done) |
| `group_name` | text | 그룹명 (계약&범위, 이슈관리 등) |
| `text` | text | 항목 내용 |
| `tag` | text | 태그 (risk / doc / ext / null) |
| `checked` | boolean | 체크 여부 (기본값 false) |
| `image_url` | text | Supabase Storage 이미지 URL |
| `memo` | text | 심사 지적사항 상세 및 조치 내용 메모 |
| `due_date` | date | 완료 마감일 |
| `assignee` | text | 담당자 이름 |
| `sort_order` | integer | 항목 정렬 순서 |
| `updated_at` | timestamptz | 최종 수정일시 (자동) |

### 5.2 기본 체크리스트 자동 생성을 위한 RPC 함수 (Database Function)

프로젝트 생성 시 기본 체크리스트 데이터 무결성과 트랜잭션 보장을 위해 Supabase DB 단에 다음 SQL 함수를 생성하여 호출합니다.

```sql
create or replace function create_project_with_defaults(project_name text)
returns uuid as $$
declare
  new_project_id uuid;
begin
  -- 1. 프로젝트 생성 및 ID 반환
  insert into projects (name)
  values (project_name)
  returning id into new_project_id;

  -- 2. 해당 프로젝트에 대한 기본 체크리스트 데이터 삽입 (기획서 9항 기준)
  -- 착수 전
  insert into checklist (project_id, phase, group_name, text, tag, sort_order) values
  (new_project_id, 'pre', '계약 & 범위', '웹 페이지 수 / 앱 뷰 수 기준으로 심사 범위 확정 후 계약 진행', null, 1),
  (new_project_id, 'pre', '계약 & 범위', '심사비 납부 주체 확인 (발주처 vs 에이전시)', 'risk', 2),
  (new_project_id, 'pre', '계약 & 범위', '웹와치 신청 시 사이트 소유·운영 기관 정보 클라이언트에게 수령', 'doc', 3),
  (new_project_id, 'pre', '외부 솔루션 사전 식별', '자체 수정 불가 외부 솔루션 목록화 — 보안 키패드, 결제 iframe, 유튜브 자막 등', 'ext', 4),
  (new_project_id, 'pre', '외부 솔루션 사전 식별', '외부 솔루션별 접근성 지원 여부 확인 — 착수 즉시 벤더사 문의 시작', 'ext', 5),
  (new_project_id, 'pre', '개발 환경 사전 신청', 'GitLab/GitHub 계정 신청 및 권한 부여', null, 6),
  (new_project_id, 'pre', '개발 환경 사전 신청', 'STG 서버 접근 계정 발급 (VPN/방화벽 포함)', null, 7),
  (new_project_id, 'pre', '개발 환경 사전 신청', '테스트플라이트 계정 등록 및 앱 배포 초대 확인', null, 8),
  (new_project_id, 'pre', '개발 환경 사전 신청', '테스트용 서비스 로그인 계정 생성', null, 9),
  (new_project_id, 'pre', '개발 환경 사전 신청', '클라이언트 측 배포 스케줄 공유 요청', 'risk', 10),
  (new_project_id, 'pre', '개발 환경 사전 신청', '모바일 테스트 환경 구축 (Android USB 디버깅, iOS VoiceOver)', null, 11),
  (new_project_id, 'pre', '디자인 가이드 & 원본 요청', 'Figma 원본 파일 Edit 권한 공유 요청', null, 12),
  (new_project_id, 'pre', '디자인 가이드 & 원본 요청', '디자인 가이드 문서 수령 (컬러, 타이포, 컴포넌트)', 'doc', 13),
  (new_project_id, 'pre', '디자인 가이드 & 원본 요청', '브랜드 가이드라인 수령 (로고, 컬러 팔레트 HEX/RGB)', null, 14),
  (new_project_id, 'pre', '디자인 가이드 & 원본 요청', '아이콘·이미지 에셋 원본 요청 (SVG/PNG)', null, 15),
  (new_project_id, 'pre', 'WBS 작성', 'WBS 초안 수립 — 사전 진단 → 개선 → 심사 신청 → 1차 심사 → 재심사 → 인증', 'doc', 16),
  (new_project_id, 'pre', 'WBS 작성', '포지션별 투입 인원 확정 (퍼블리셔, 스크립터, 개발자, 디자이너, QA)', null, 17),
  (new_project_id, 'pre', 'WBS 작성', '클라이언트 담당 PM 및 실무 창구 확인', null, 18);

  -- 진행 중
  insert into checklist (project_id, phase, group_name, text, tag, sort_order) values
  (new_project_id, 'in_progress', '보고 & 커뮤니케이션', '주간 보고 체계 수립 — 포지션별 완료 항목 집계 + 이슈 공유', 'doc', 19),
  (new_project_id, 'in_progress', '보고 & 커뮤니케이션', '진척 지연 시 지연 사유 + 만회 가능성 함께 브리핑', null, 20),
  (new_project_id, 'in_progress', '보고 & 커뮤니케이션', '내부 이슈 에스컬레이션 기준 사전 정의', null, 21),
  (new_project_id, 'in_progress', '이슈 관리', '외부 솔루션 벤더사 협의 진행 상황 추적', 'ext', 22),
  (new_project_id, 'in_progress', '이슈 관리', '클라이언트 배포 일정과 수정 완료 시점 싱크 관리', 'risk', 23),
  (new_project_id, 'in_progress', '이슈 관리', '이슈 로그 관리 — 발견 → 담당자 배분 → 수정 확인', 'doc', 24),
  (new_project_id, 'in_progress', '디자인 & 협업', '디자인 가이드 및 Figma 권한 수령 확인 (미수령 시 재요청)', null, 25),
  (new_project_id, 'in_progress', '디자인 & 협업', '디자이너-퍼블리셔 간 피드백 루프 조율 (PM이 중간 창구)', null, 26);

  -- 심사
  insert into checklist (project_id, phase, group_name, text, tag, sort_order) values
  (new_project_id, 'review', '심사 신청', '웹와치 심사 방식 최종 협의 (원격/파견, APK/테스트플라이트) — 심사 한 달 전', null, 27),
  (new_project_id, 'review', '심사 신청', '웹와치 심사 신청 (웹/앱 각각 별도 신청)', null, 28),
  (new_project_id, 'review', '심사 신청', '심사용 계정 별도 생성 요청', null, 29),
  (new_project_id, 'review', '심사 신청', '심사 당일 웹와치 담당자 연락 채널 확보', null, 30),
  (new_project_id, 'review', '심사 후 대응', '1차 심사 리포트 수령 후 지적 항목 포지션별 배분', 'doc', 31),
  (new_project_id, 'review', '심사 후 대응', '재심사 일정(약 1주) 역산하여 수정 마감 설정', 'risk', 32),
  (new_project_id, 'review', '심사 후 대응', '재심사 전 수정 항목 전수 확인 — QA와 교차 확인', null, 33);

  -- 완료 후
  insert into checklist (project_id, phase, group_name, text, tag, sort_order) values
  (new_project_id, 'done', '산출물 정리', '완료 보고서 작성 (AS-IS/TO-BE, 개선율, 인증 마크 3종)', 'doc', 34),
  (new_project_id, 'done', '산출물 정리', '사용자 매뉴얼 / 디자인 가이드 등 인수인계 문서 작성', 'doc', 35),
  (new_project_id, 'done', '산출물 정리', '내부 상급자 검토 → 승인 후 클라이언트 PM 전달 (순서 준수)', null, 36),
  (new_project_id, 'done', '클라이언트 인계', '인증 마크 게시 위치 및 갱신 일정 클라이언트에 안내', null, 37),
  (new_project_id, 'done', '클라이언트 인계', '회고 작성 — 이슈 원인 및 다음 프로젝트 개선점', 'doc', 38);

  return new_project_id;
end;
$$ language plpgsql;
```

### 5.3 자동 생성 REST API 엔드포인트

Supabase PostgREST가 테이블 생성 즉시 아래 엔드포인트를 자동으로 생성합니다.

| 메서드 | 엔드포인트 | 설명 |
|---|---|---|
| GET | `/rest/v1/projects` | 프로젝트 목록 조회 |
| POST | `/rest/v1/projects` | 프로젝트 추가 |
| DELETE | `/rest/v1/projects?id=eq.{id}` | 프로젝트 삭제 |
| GET | `/rest/v1/checklist?project_id=eq.{id}` | 항목 목록 조회 |
| POST | `/rest/v1/checklist` | 항목 추가 |
| PATCH | `/rest/v1/checklist?id=eq.{id}` | 항목 수정 / 체크 상태 변경 / 메모/마감일/담당자 수정 |
| DELETE | `/rest/v1/checklist?id=eq.{id}` | 항목 삭제 |
| POST | `/rest/v1/rpc/create_project_with_defaults` | 기본 체크리스트를 포함한 새 프로젝트 생성 (DB Function 호출) |
| POST | `/storage/v1/object/images/{path}` | 이미지 업로드 |
| DELETE | `/storage/v1/object/images/{path}` | 이미지 삭제 |

### 5.4 Swagger UI 접근

- URL: `https://{프로젝트ID}.supabase.co/rest/v1/`
- Supabase 대시보드 → API Docs 에서도 자동 문서 확인 가능
- `anon key` 및 로그인 세션 `JWT` 토큰을 Authorize 버튼에 입력 후 모든 엔드포인트 직접 테스트 가능

### 5.5 RLS 정책 (Row Level Security)

```sql
-- RLS 활성화
alter table projects enable row level security;
alter table checklist enable row level security;

-- 사내 내부용: 로그인(인증)된 유저만 읽기·쓰기·수정·삭제 가능하도록 설정 변경
create policy "Allow authenticated users" on projects for all to authenticated using (true) with check (true);
create policy "Allow authenticated users" on checklist for all to authenticated using (true) with check (true);
```

---

## 6. 비기능 요구사항

| 항목 | 요구사항 | 비고 |
|---|---|---|
| 보안 | Supabase Auth를 통한 사용자 인증 및 RLS 적용 | API Key와 DB 정보 보안 유지, 인증된 사용자만 CRUD 가능 |
| 이미지 URL | Supabase Storage 영구 공개 URL 사용 | 노션 API 1시간 만료 문제 없음 |
| 파일 크기 제한 | 첨부 이미지 크기 최대 5MB 제한 및 webp/png/jpg만 허용 | 무료 스토리지 용량(1GB) 절약 및 뷰 레이아웃 손상 방지 |
| 파편 파일 제어 | 이미지 수정/삭제 혹은 항목 삭제 시 Storage 원본 삭제 자동화 | 스토리지 내 고립(Orphaned) 파일 생성 방지 |
| 응답 속도 | 항목 조회 2초 이내, 체크 저장 1초 이내 | PostgREST 직접 호출로 콜드스타트 없음 |
| 실시간 연동 | Supabase Realtime 채널을 통한 상태 실시간 변경 | 다중 접속자 작업 시 데이터 덮어쓰기 방지 및 정합성 유지 |
| 일시정지 방지 | GitHub Actions 주 2회 Keep-Alive 핑 | 실패 시 Actions 알림으로 즉시 감지 |
| 브라우저 지원 | Chrome 최신, Edge 최신 | IE 미지원 |
| 배포 | Vercel 자동 HTTPS, GitHub 연동 자동 배포 | main 브랜치 푸시 시 자동 배포 |

---

## 7. 개발 로드맵

| 단계 | 목표 | 주요 작업 | 예상 기간 |
|---|---|---|---|
| 1단계 | 환경 세팅 | Supabase 프로젝트 생성 / 테이블 설계 / Vercel 연동 / GitHub Actions Keep-Alive 설정 | 1~2일 |
| 2단계 | MVP | 프로젝트 전환 + 체크리스트 조회 / 체크 상태 저장 (PATCH) | 3~5일 |
| 3단계 | CRUD | 항목 추가·수정·삭제 UI / 이미지 업로드 (Storage) | 1~2주 |
| 4단계 | 대시보드 | 단계별 완료율 / 태그별 미완료 강조 / 진행률 차트 | 3~5일 |
| 5단계 | 고도화 | 기본 체크리스트 자동 삽입 / 프로젝트 복사 / 주간보고 초안 생성 | 추후 검토 |

---

## 8. UI 구조

### 8.1 전체 레이아웃

```
┌─────────────────────────────────────────────┐
│  PM 체크리스트   [롯데잇츠 ▼]   ████░░ 64%  │  ← 헤더
├─────────────────────────────────────────────┤
│  착수 전 (5/9)  진행 중 (3/5)  심사  완료 후 │  ← 단계 탭
├─────────────────────────────────────────────┤
│  계약 & 범위                                 │
│  ☑ 심사 범위 확정 후 계약 진행               │
│  ☐ 심사비 납부 주체 확인       ⚠️ 리스크    │
│  ☑ 사이트 소유 기관 정보 수령  📄 산출물    │
│                                              │
│  외부 솔루션 사전 식별                       │
│  ☐ 외부 솔루션 목록화          🔗 외부      │
│                                [+ 항목 추가] │
└─────────────────────────────────────────────┘
```

### 8.2 체크리스트 항목 카드

- 체크박스 + 항목 내용 텍스트
- 태그 뱃지 (리스크 · 산출물 · 외부)
- 이미지 첨부 아이콘 (클릭 시 업로드)
- 수정·삭제 액션 (호버 시 노출)
- 완료 시 취소선 + 흐린 색상 처리

---

## 9. 기본 체크리스트 데이터

> 프로젝트 최초 생성 시 아래 항목이 자동 삽입됩니다.  
> 기준: KWCAG 2.2 / 웹와치 / 웹 + iOS + Android

### 착수 전

#### 계약 & 범위

- [ ] 웹 페이지 수 / 앱 뷰 수 기준으로 심사 범위 확정 후 계약 진행
- [ ] 심사비 납부 주체 확인 (발주처 vs 에이전시) `⚠️ 리스크`
- [ ] 웹와치 신청 시 사이트 소유·운영 기관 정보 클라이언트에게 수령 `📄 산출물`

#### 외부 솔루션 사전 식별

- [ ] 자체 수정 불가 외부 솔루션 목록화 — 보안 키패드, 결제 iframe, 유튜브 자막 등 `🔗 외부`
- [ ] 외부 솔루션별 접근성 지원 여부 확인 — 착수 즉시 벤더사 문의 시작 `🔗 외부`

#### 개발 환경 사전 신청

- [ ] GitLab/GitHub 계정 신청 및 권한 부여
- [ ] STG 서버 접근 계정 발급 (VPN/방화벽 포함)
- [ ] 테스트플라이트 계정 등록 및 앱 배포 초대 확인
- [ ] 테스트용 서비스 로그인 계정 생성
- [ ] 클라이언트 측 배포 스케줄 공유 요청 `⚠️ 리스크`
- [ ] 모바일 테스트 환경 구축 (Android USB 디버깅, iOS VoiceOver)

#### 디자인 가이드 & 원본 요청

- [ ] Figma 원본 파일 Edit 권한 공유 요청
- [ ] 디자인 가이드 문서 수령 (컬러, 타이포, 컴포넌트) `📄 산출물`
- [ ] 브랜드 가이드라인 수령 (로고, 컬러 팔레트 HEX/RGB)
- [ ] 아이콘·이미지 에셋 원본 요청 (SVG/PNG)

#### WBS 작성

- [ ] WBS 초안 수립 — 사전 진단 → 개선 → 심사 신청 → 1차 심사 → 재심사 → 인증 `📄 산출물`
- [ ] 포지션별 투입 인원 확정 (퍼블리셔, 스크립터, 개발자, 디자이너, QA)
- [ ] 클라이언트 담당 PM 및 실무 창구 확인

### 진행 중

#### 보고 & 커뮤니케이션

- [ ] 주간 보고 체계 수립 — 포지션별 완료 항목 집계 + 이슈 공유 `📄 산출물`
- [ ] 진척 지연 시 지연 사유 + 만회 가능성 함께 브리핑
- [ ] 내부 이슈 에스컬레이션 기준 사전 정의

#### 이슈 관리

- [ ] 외부 솔루션 벤더사 협의 진행 상황 추적 `🔗 외부`
- [ ] 클라이언트 배포 일정과 수정 완료 시점 싱크 관리 `⚠️ 리스크`
- [ ] 이슈 로그 관리 — 발견 → 담당자 배분 → 수정 확인 `📄 산출물`

#### 디자인 & 협업

- [ ] 디자인 가이드 및 Figma 권한 수령 확인 (미수령 시 재요청)
- [ ] 디자이너-퍼블리셔 간 피드백 루프 조율 (PM이 중간 창구)

### 심사

#### 심사 신청

- [ ] 웹와치 심사 방식 최종 협의 (원격/파견, APK/테스트플라이트) — 심사 한 달 전
- [ ] 웹와치 심사 신청 (웹/앱 각각 별도 신청)
- [ ] 심사용 계정 별도 생성 요청
- [ ] 심사 당일 웹와치 담당자 연락 채널 확보

#### 심사 후 대응

- [ ] 1차 심사 리포트 수령 후 지적 항목 포지션별 배분 `📄 산출물`
- [ ] 재심사 일정(약 1주) 역산하여 수정 마감 설정 `⚠️ 리스크`
- [ ] 재심사 전 수정 항목 전수 확인 — QA와 교차 확인

### 완료 후

#### 산출물 정리

- [ ] 완료 보고서 작성 (AS-IS/TO-BE, 개선율, 인증 마크 3종) `📄 산출물`
- [ ] 사용자 매뉴얼 / 디자인 가이드 등 인수인계 문서 작성 `📄 산출물`
- [ ] 내부 상급자 검토 → 승인 후 클라이언트 PM 전달 (순서 준수)

#### 클라이언트 인계

- [ ] 인증 마크 게시 위치 및 갱신 일정 클라이언트에 안내
- [ ] 회고 작성 — 이슈 원인 및 다음 프로젝트 개선점 `📄 산출물`

---

## 10. 제약 사항

### 10.1 Supabase 무료 티어 한도

| 항목 | 한도 |
|---|---|
| DB 저장 | 500MB |
| Storage | 1GB |
| API 호출 | 무제한 |
| 비활성 일시정지 | 7일 → GitHub Actions Keep-Alive로 방지 |
| 정지 후 복구 | 90일 이내 무료 복구 (Restore project 버튼) |

### 10.2 Vercel 무료 티어 한도

| 항목 | 한도 |
|---|---|
| Functions 실행 시간 | 10초 |
| 대역폭 | 월 100GB |
| 배포 | GitHub 연동 자동 배포 (main 브랜치 푸시 시) |

### 10.3 개발 환경

| 항목 | 내용 |
|---|---|
| IDE | 안티그레비티 (Antigravity IDE) |
| 언어 | HTML, Vanilla JavaScript |
| 버전 관리 | Git / GitHub |
| 배포 | Vercel (GitHub 연동) |
| DB | Supabase (PostgreSQL + Storage) |
| 자동화 | GitHub Actions (Keep-Alive) |

---

*이트라이브 · 정인호 매니저 · 2026년 6월 · v1.1*
