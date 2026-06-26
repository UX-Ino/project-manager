# Etribe PM — 웹 접근성 ERP 구현 가이드

> **기준 화면**: 사이드바 구조 (통합현황판 / 체크리스트&WBS / 산출물보관함 / 시스템설정 / 회원관리)  
> **목표**: 웹 접근성 인증 프로젝트 전 과정을 하나의 툴로 관리하는 내부 ERP

---

## 1. 기술 스택

| 레이어 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Next.js 14 (App Router)** | SSR/SSG 혼용, 기존 경험 |
| 스타일 | **Tailwind CSS** | 유틸리티 클래스, 빠른 개발 |
| DB / Auth | **Supabase** | PostgreSQL + Auth + Storage + RLS 일체형 |
| 배포 | **Vercel** | GitHub 연동, Edge Functions 지원 |
| CI/CD | **GitHub Actions** | Keep-alive + 자동 배포 |
| 리포트 생성 | **프롬프트 빌더 + 클립보드 복사** | API 비용 없음, 데이터 외부 전송 없음 |
| 파일 출력 | **xlsx / pptxgenjs** | 산출물 내보내기 |

---

## 2. 디렉토리 구조

```
etribe-pm/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   └── (app)/
│       ├── layout.tsx              ← 사이드바 공통 레이아웃
│       ├── page.tsx                ← 통합 현황판
│       ├── checklist/
│       │   ├── page.tsx            ← 프로젝트 체크리스트 (허브)
│       │   ├── pm/page.tsx         ← PM 체크리스트
│       │   ├── wbs/page.tsx        ← WBS 일정표
│       │   ├── accessibility/page.tsx  ← 접근성 점검리스트
│       │   ├── deploy/page.tsx     ← 배포리스트
│       │   └── weekly-report/page.tsx ← 주간보고서 생성기
│       ├── deliverables/page.tsx   ← 산출물 보관함
│       ├── settings/page.tsx       ← 시스템 설정
│       └── admin/
│           └── members/page.tsx    ← 회원 관리
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── SidebarItem.tsx
│   │   └── ProjectSwitcher.tsx     ← 상단 프로젝트 선택
│   ├── dashboard/
│   │   ├── ProjectCard.tsx
│   │   └── ProgressRing.tsx
│   ├── checklist/
│   │   ├── ChecklistItem.tsx
│   │   ├── WBSTable.tsx
│   │   └── AccessibilityTable.tsx
│   └── ui/                         ← shadcn/ui 또는 커스텀
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts               ← createBrowserClient
│   │   └── server.ts               ← createServerClient
│   └── utils/
│       ├── date.ts
│       ├── prompt-builder.ts       ← 주간보고서 프롬프트 조합
│       └── export.ts               ← Excel/PPTX 생성
│
└── supabase/
    └── migrations/
        ├── 001_projects.sql
        ├── 002_checklist.sql
        ├── 003_wbs.sql
        ├── 004_accessibility.sql
        └── 005_deliverables.sql
```

---

## 3. DB 스키마 설계

### 3-1. 프로젝트 테이블

```sql
-- 프로젝트 마스터
CREATE TABLE projects (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,                  -- 예: '롯데GRS 접근성 인증'
  client_name TEXT,                           -- 예: '롯데GRS'
  status      TEXT DEFAULT 'active',          -- active | completed | on_hold
  platforms   TEXT[] DEFAULT '{}',            -- ['web', 'ios', 'android']
  start_date  DATE,
  end_date    DATE,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 프로젝트 멤버
CREATE TABLE project_members (
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id),
  role        TEXT DEFAULT 'member',          -- pm | member | reviewer
  PRIMARY KEY (project_id, user_id)
);
```

### 3-2. PM 체크리스트

```sql
CREATE TABLE pm_checklist_items (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  phase         TEXT NOT NULL,      -- '착수' | '분석' | '구축' | '검수' | '종료'
  item          TEXT NOT NULL,      -- 체크 항목
  is_completed  BOOLEAN DEFAULT false,
  completed_at  TIMESTAMPTZ,
  completed_by  UUID REFERENCES auth.users(id),
  notes         TEXT,
  order_index   INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 템플릿 (신규 프로젝트 생성 시 자동 복사용)
CREATE TABLE pm_checklist_templates (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phase       TEXT NOT NULL,
  item        TEXT NOT NULL,
  order_index INTEGER DEFAULT 0
);
```

### 3-3. WBS 일정표

```sql
CREATE TABLE wbs_items (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_id       UUID REFERENCES wbs_items(id),  -- 중단계 → 세부 구조
  phase           TEXT,             -- '분석' | '구축' | '검수' 등
  task            TEXT NOT NULL,
  assignee_id     UUID REFERENCES auth.users(id),
  planned_start   DATE,
  planned_end     DATE,
  actual_start    DATE,
  actual_end      DATE,
  progress        SMALLINT DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  status          TEXT DEFAULT 'not_started',
                  -- not_started | in_progress | completed | delayed
  notes           TEXT,
  order_index     INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### 3-4. 접근성 점검리스트

```sql
CREATE TABLE accessibility_checks (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,      -- 'web' | 'ios' | 'android'
  kwcag_id      TEXT,               -- 예: '1.1.1', '4.1.2'
  principle     TEXT,               -- '인식의 용이성' 등
  criteria      TEXT NOT NULL,      -- 검사 항목명
  page_url      TEXT,               -- 해당 페이지 URL
  status        TEXT DEFAULT 'unchecked',
                -- unchecked | pass | fail | na
  issue_count   INTEGER DEFAULT 0,
  severity      TEXT,               -- 'critical' | 'major' | 'minor'
  notes         TEXT,
  checked_by    UUID REFERENCES auth.users(id),
  checked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 접근성 기준 마스터 (KWCAG 2.2 33개 항목)
CREATE TABLE accessibility_criteria (
  kwcag_id    TEXT PRIMARY KEY,     -- '1.1.1'
  principle   TEXT,
  guideline   TEXT,
  criteria    TEXT NOT NULL,
  platforms   TEXT[] DEFAULT '{web, ios, android}'
);
```

### 3-5. 배포리스트

```sql
CREATE TABLE deploy_items (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  platform      TEXT,               -- 'web' | 'ios' | 'android'
  category      TEXT,               -- '소스 확인' | '환경 설정' | '최종 확인'
  item          TEXT NOT NULL,
  is_completed  BOOLEAN DEFAULT false,
  completed_at  TIMESTAMPTZ,
  completed_by  UUID REFERENCES auth.users(id),
  notes         TEXT,
  order_index   INTEGER DEFAULT 0
);
```

### 3-6. 주간보고서

```sql
CREATE TABLE weekly_reports (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  report_date     DATE NOT NULL,
  week_number     INTEGER,
  period_start    DATE,
  period_end      DATE,
  content         JSONB,            -- 구조화된 보고서 내용
  generated_by    UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 3-7. 산출물 & 회원

```sql
-- 산출물 보관함
CREATE TABLE deliverables (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  file_type     TEXT,               -- 'excel' | 'pptx' | 'pdf' | 'doc' | 'zip'
  storage_path  TEXT,               -- Supabase Storage 경로
  file_size     BIGINT,
  version       TEXT,               -- 'v1.0', 'v1.1'
  description   TEXT,
  uploaded_by   UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 사용자 프로필 (auth.users 확장)
CREATE TABLE profiles (
  id        UUID REFERENCES auth.users(id) PRIMARY KEY,
  name      TEXT NOT NULL,
  email     TEXT,
  role      TEXT DEFAULT 'member',  -- 'admin' | 'pm' | 'member'
  team      TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3-8. RLS 정책 (기본)

```sql
-- 프로젝트: 멤버만 조회 가능
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_member_select" ON projects
  FOR SELECT USING (
    id IN (
      SELECT project_id FROM project_members WHERE user_id = auth.uid()
    )
  );

-- admin은 전체 조회
CREATE POLICY "admin_all" ON projects
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
```

---

## 4. 각 모듈 구현 포인트

### 4-1. 통합 현황판

**보여줄 데이터:**
- 참여 프로젝트 목록 + 전체 진행률 (WBS progress 평균)
- 접근성 점검 현황: 통과/실패/미점검 건수 (플랫폼별)
- 이번 주 WBS 마감 항목
- 미완료 PM 체크리스트 수

**핵심 쿼리 패턴:**
```typescript
// WBS 진행률 집계
const { data: wbsProgress } = await supabase
  .from('wbs_items')
  .select('project_id, progress, status')
  .eq('project_id', projectId);

const avgProgress = wbsProgress.reduce((acc, i) => acc + i.progress, 0)
  / wbsProgress.length;

// 접근성 점검 현황 집계
const { data: a11yStats } = await supabase
  .from('accessibility_checks')
  .select('platform, status')
  .eq('project_id', projectId);
```

---

### 4-2. PM 체크리스트

**UX 흐름:**
1. 상단에서 프로젝트 선택 (ProjectSwitcher)
2. 단계 탭 (착수/분석/구축/검수/종료)으로 필터
3. 체크박스 클릭 → 즉시 DB 업데이트 + 완료자/날짜 기록
4. 미완료 항목 빨간 뱃지 표시

**신규 프로젝트 생성 시 템플릿 자동 복사:**
```typescript
async function createProjectFromTemplate(projectId: string) {
  const { data: templates } = await supabase
    .from('pm_checklist_templates')
    .select('*')
    .order('phase, order_index');

  const items = templates.map(t => ({
    project_id: projectId,
    phase: t.phase,
    item: t.item,
    order_index: t.order_index,
  }));

  await supabase.from('pm_checklist_items').insert(items);
}
```

---

### 4-3. WBS 일정표

**뷰 전환:**
- **테이블 뷰**: 기본. 인라인 편집 (날짜, 진행률, 담당자)
- **간트 뷰**: 선택. `gantt-task-react` 또는 커스텀 SVG 렌더링

**지연 감지 로직:**
```typescript
function getWBSStatus(item: WBSItem): 'delayed' | 'in_progress' | 'completed' | 'not_started' {
  const today = new Date();
  if (item.progress === 100) return 'completed';
  if (item.planned_end && new Date(item.planned_end) < today && item.progress < 100)
    return 'delayed';
  if (item.progress > 0) return 'in_progress';
  return 'not_started';
}
```

**Excel 내보내기:**
```typescript
// lib/utils/export.ts
import * as XLSX from 'xlsx';

export function exportWBSToExcel(items: WBSItem[]) {
  const ws = XLSX.utils.json_to_sheet(items.map(i => ({
    '단계': i.phase,
    '업무': i.task,
    '담당자': i.assignee_name,
    '계획 시작': i.planned_start,
    '계획 완료': i.planned_end,
    '진행률': `${i.progress}%`,
    '상태': i.status,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'WBS');
  XLSX.writeFile(wb, 'WBS_일정표.xlsx');
}
```

---

### 4-4. 접근성 점검리스트

**KWCAG 2.2 기준 초기 데이터 (33개 항목) 삽입:**
기존에 작성한 axe-core JSON ruleset을 그대로 활용해 `accessibility_criteria` 테이블에 seed 데이터로 삽입.

**UI 구성:**
- 상단: 플랫폼 탭 (PC 웹 / iOS / Android)
- 원칙별 그룹 (인식 / 운용 / 이해 / 견고성)
- 각 항목: 상태 토글 버튼 (통과/실패/해당없음) + 비고 입력

**통계 요약 바:**
```
총 33개 항목  |  통과 25  |  실패 6  |  해당없음 2  |  미점검 0
진행률: ████████░░ 75.7%
```

---

### 4-5. 배포리스트

PM 체크리스트와 동일한 패턴.  
플랫폼별 배포 전 체크 항목 (소스 확인 → 환경 설정 → 최종 확인) 단계로 구성.

**특이점**: 모든 항목 완료 시 "배포 승인 확정" 버튼 활성화 → 완료 타임스탬프 일괄 기록.

---

### 4-6. 주간보고서 생성기 ⭐ 핵심 기능

**설계 방향: API 연동 없음 — 프롬프트 빌더 방식**

앱이 DB 데이터를 모아서 AI에게 붙여넣을 수 있는 텍스트로 조합해준다.  
사람이 Gemini / Claude 중 원하는 곳에 붙여넣어서 결과를 받는다.  
API 키 불필요, 비용 없음, 클라이언트 데이터 외부 전송 없음.

```
① 기간 선택
② [프롬프트 생성] 클릭 → WBS·접근성·PM 데이터 자동 집계
③ 프롬프트 미리보기 (필요시 직접 수정)
④ [복사] 클릭
⑤ Gemini 또는 Claude 탭 열기 → 붙여넣기
```

**프롬프트 빌더 유틸 (lib/utils/prompt-builder.ts):**

```typescript
export function buildWeeklyReportPrompt({
  project,
  period,
  wbs,
  a11y,
  pmCheck,
}: ReportData): string {
  return `
아래 데이터를 바탕으로 웹 접근성 인증 프로젝트 주간 보고서를 작성해줘.
클라이언트에게 전달하는 공식 보고서 형식으로,
완료 현황 / 다음 주 예정 / 이슈 및 요청사항 순서로 정리해줘.

===== 프로젝트 정보 =====
프로젝트명: ${project.name}
보고 기간: ${period.start} ~ ${period.end}
클라이언트: ${project.client_name}

===== WBS 진행 현황 =====
전체 진행률: ${wbs.avgProgress}%

완료 항목:
${wbs.completed.map(i => `- [${i.phase}] ${i.task}`).join('\n')}

진행 중:
${wbs.inProgress.map(i => `- [${i.phase}] ${i.task} (${i.progress}%)`).join('\n')}

지연 항목:
${wbs.delayed.length > 0
  ? wbs.delayed.map(i => `- ${i.task} (계획 완료: ${i.planned_end})`).join('\n')
  : '없음'}

===== 접근성 점검 현황 =====
PC 웹:   통과 ${a11y.web.pass} / 실패 ${a11y.web.fail} / 전체 ${a11y.web.total}
iOS:     통과 ${a11y.ios.pass} / 실패 ${a11y.ios.fail} / 전체 ${a11y.ios.total}
Android: 통과 ${a11y.android.pass} / 실패 ${a11y.android.fail} / 전체 ${a11y.android.total}

주요 미해결 이슈:
${a11y.failItems.length > 0
  ? a11y.failItems.map(i => `- [${i.kwcag_id}] ${i.criteria} (${i.page_url})`).join('\n')
  : '없음'}

===== PM 체크리스트 =====
완료: ${pmCheck.completed}건 / 전체: ${pmCheck.total}건

미완료 항목:
${pmCheck.pending.length > 0
  ? pmCheck.pending.map(i => `- [${i.phase}] ${i.item}`).join('\n')
  : '없음'}
`.trim();
}
```

**페이지 컴포넌트 (app/checklist/weekly-report/page.tsx):**

```tsx
'use client';

export default function WeeklyReportPage() {
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleBuild() {
    setLoading(true);
    const [wbs, a11y, pmCheck] = await Promise.all([
      getWBSProgress(projectId, period),
      getAccessibilityStats(projectId),
      getPMChecklistStatus(projectId),
    ]);

    const text = buildWeeklyReportPrompt({ project, period, wbs, a11y, pmCheck });
    setPrompt(text);
    setLoading(false);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* 기간 선택 */}
      <div className="flex gap-3 items-center">
        <input type="date" value={period.start} onChange={...} />
        <span>~</span>
        <input type="date" value={period.end} onChange={...} />
        <button onClick={handleBuild} disabled={loading}>
          {loading ? '집계 중...' : '프롬프트 생성'}
        </button>
      </div>

      {prompt && (
        <>
          {/* 프롬프트 미리보기 (직접 수정 가능) */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={24}
            className="w-full font-mono text-sm border rounded p-3"
          />

          {/* 액션 버튼 */}
          <div className="flex gap-3">
            <button onClick={handleCopy} className="btn-primary">
              {copied ? '✓ 복사됨' : '클립보드에 복사'}
            </button>
            <a
              href="https://gemini.google.com"
              target="_blank"
              className="btn-secondary"
            >
              Gemini 열기 →
            </a>
            <a
              href="https://claude.ai"
              target="_blank"
              className="btn-secondary"
            >
              Claude 열기 →
            </a>
          </div>
        </>
      )}
    </div>
  );
}
```

---

### 4-7. 산출물 보관함

**Supabase Storage 설정:**
```typescript
// 버킷 생성: deliverables (비공개)
const BUCKET = 'deliverables';

// 업로드
async function uploadDeliverable(projectId: string, file: File) {
  const path = `${projectId}/${Date.now()}_${file.name}`;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file);

  if (error) throw error;

  // DB 기록
  await supabase.from('deliverables').insert({
    project_id: projectId,
    name: file.name,
    file_type: file.name.split('.').pop(),
    storage_path: data.path,
    file_size: file.size,
    uploaded_by: (await supabase.auth.getUser()).data.user?.id,
  });
}

// 다운로드 URL 생성 (1시간 유효)
async function getDownloadUrl(storagePath: string) {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  return data?.signedUrl;
}
```

---

### 4-8. 회원 관리 (Admin)

**기능:**
- 사용자 목록 조회 / 역할 변경 (admin/pm/member)
- 프로젝트 멤버 추가/제거
- 비활성화 처리

**Supabase Auth Admin API 활용** (서버 사이드에서만):
```typescript
import { createClient } from '@supabase/supabase-js';

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // 서버에서만!
);

// 사용자 목록
const { data: { users } } = await adminClient.auth.admin.listUsers();
```

---

## 5. 사이드바 컴포넌트 구현

```tsx
// components/layout/Sidebar.tsx
'use client';

const navItems = [
  { 
    label: '통합 현황판', 
    href: '/', 
    icon: LayoutDashboard 
  },
  {
    label: '프로젝트 체크리스트',
    icon: ClipboardList,
    section: 'CHECKLIST & WBS',
    children: [
      { label: 'PM 체크리스트',       href: '/checklist/pm' },
      { label: 'WBS 일정표',          href: '/checklist/wbs' },
      { label: '접근성 점검리스트',    href: '/checklist/accessibility' },
      { label: '배포리스트',           href: '/checklist/deploy' },
      { label: '주간보고서 생성기',    href: '/checklist/weekly-report' },
    ],
  },
  {
    label: '산출물 보관함',
    href: '/deliverables',
    icon: Archive,
    section: 'GENERAL',
  },
  { label: '시스템 설정', href: '/settings', icon: Settings },
  {
    label: '회원 관리',
    href: '/admin/members',
    icon: Users,
    section: 'ADMIN',
    adminOnly: true,
  },
];
```

---

## 6. 개발 로드맵

### Phase 1 — 뼈대 (1주)
- [ ] Supabase 프로젝트 생성 + 스키마 마이그레이션
- [ ] Next.js + Tailwind 초기 설정
- [ ] Supabase Auth 연동 (이메일 로그인)
- [ ] 사이드바 레이아웃 + 프로젝트 선택 컴포넌트
- [ ] 프로젝트 CRUD

### Phase 2 — 핵심 기능 (2주)
- [ ] PM 체크리스트 (템플릿 자동 복사 포함)
- [ ] WBS 일정표 (테이블 뷰 + 인라인 편집)
- [ ] 접근성 점검리스트 (KWCAG 2.2 seed 데이터 포함)
- [ ] 배포리스트

### Phase 3 — 고급 기능 (2주)
- [ ] 통합 현황판 (집계 쿼리 + 차트)
- [ ] 주간보고서 생성기 (프롬프트 빌더 + 클립보드 복사)
- [ ] 산출물 보관함 (파일 업로드/다운로드)

### Phase 4 — 마무리 (1주)
- [ ] 회원 관리 (Admin)
- [ ] Excel/PPTX 내보내기
- [ ] 알림 기능 (마감 D-3 등)
- [ ] 모바일 반응형 정리

---

## 7. 환경 변수 (.env.local)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # 서버 전용
# AI API 키 불필요 — 프롬프트 빌더 방식 사용
```

---

## 8. 빠른 시작 체크리스트

```
□ Supabase 프로젝트 생성
□ GitHub 레포 생성 + Vercel 연결
□ npx create-next-app@latest etribe-pm --typescript --tailwind --app
□ npm install @supabase/supabase-js @supabase/ssr
□ supabase/migrations/ 에 SQL 파일 작성 후 supabase db push
□ 사이드바 레이아웃 구현
□ 프로젝트 선택 상태관리 (Zustand 또는 Context)
```

---

**[근거]** 기술 스택은 인호님이 기존에 확정한 Supabase + Vercel + GitHub Actions 기반이며, Next.js 14 App Router 패턴을 적용했습니다. 주간보고서 생성기는 API 비용·데이터 보안 이슈를 피하기 위해 프롬프트 빌더 + 클립보드 복사 방식으로 변경했습니다.  
**[한계점]** Gantt 차트 라이브러리 선택(`gantt-task-react` vs 커스텀 SVG)은 기능 요구사항에 따라 재검토가 필요합니다. 주간보고서는 사람이 직접 붙여넣어야 하므로 완전 자동화는 아닙니다.
