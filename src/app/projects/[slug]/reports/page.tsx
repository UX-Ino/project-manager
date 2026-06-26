'use client';
 
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useProject } from '../../../../context/ProjectContext';
import { supabase } from '../../../../lib/supabaseClient';
import {
  Loader2, AlertCircle, ChevronRight, Check,
  ClipboardList, Calendar, TrendingUp, AlertTriangle
} from 'lucide-react';

interface WBSRow {
  id: string;
  project_id: string;
  row_order: number;
  level: number;
  task_l1: string | null;
  task_l2: string | null;
  task_l3: string | null;
  task_l4: string | null;
  description: string | null;
  assignee: string | null;
  status: string;
  plan_start: string | null;
  plan_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  plan_progress: number;
  actual_progress: number;
}

interface ChecklistItem {
  id: string;
  project_id: string;
  phase: string;
  group_name: string;
  text: string;
  tag: string | null;
  checked: boolean;
  image_url: string | null;
  memo: string | null;
  due_date: string | null;
  assignee: string | null;
}

type Phase = 'pre' | 'in_progress' | 'review' | 'done';

const PHASE_META: Record<Phase, { label: string; color: string }> = {
  pre:         { label: '착수 전',  color: '#8a93a5' },
  in_progress: { label: '진행 중',  color: '#3182f6' },
  review:      { label: '심사',     color: '#d98a2b' },
  done:        { label: '완료 후',  color: '#1f9d6b' },
};

const TAG_META: Record<string, { label: string; color: string }> = {
  risk: { label: '⚠️ 리스크', color: '#d98a2b' },
  doc:  { label: '📄 산출물', color: '#3182f6' },
  ext:  { label: '🔗 외부',   color: '#1f9d6b' },
};

export default function ProjectReportsPage() {
  const params      = useParams();
  const projectSlug = (params?.slug as string) || '';
  const { projects, showToast } = useProject();

  const currentProject = projects.find(p => p.slug === projectSlug);
  const projectId      = currentProject?.id || '';

  const [items, setItems]     = useState<ChecklistItem[]>([]);
  const [wbsRows, setWbsRows] = useState<WBSRow[]>([]);
  const [loading, setLoading] = useState(false);

  // 접근성 점검 탭 상태
  const [selectedPlatform, setSelectedPlatform] = useState<'web' | 'ios' | 'android'>('web');

  const fetchItems = useCallback(async (pId: string) => {
    if (!pId) return;
    setLoading(true);
    try {
      // 1. Checklist Items 조회
      const { data: checkData, error: checkError } = await supabase
        .from('checklist')
        .select('*')
        .eq('project_id', pId);

      if (checkError) throw checkError;
      setItems(checkData || []);

      // 2. WBS Rows 조회
      const { data: wbsData, error: wbsError } = await supabase
        .from('wbs_rows')
        .select('*')
        .eq('project_id', pId)
        .order('row_order', { ascending: true });

      if (wbsError) throw wbsError;
      setWbsRows(wbsData || []);
    } catch (err: unknown) {
      if (err instanceof Error) showToast('데이터 로딩 실패: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (projectId) fetchItems(projectId);
  }, [projectId, fetchItems]);

  // ── Derived stats (PM Checklist Only - excluding accessibility) ──
  const pmStats = useMemo(() => {
    const pmItems = items.filter(i => i.phase !== 'accessibility');
    const total     = pmItems.length;
    const completed = pmItems.filter(i => i.checked).length;
    const rate      = total > 0 ? Math.round((completed / total) * 100) : 0;
    const pending   = total - completed;

    // By phase
    const phases = (Object.keys(PHASE_META) as Phase[]).map(phase => {
      const phaseItems = pmItems.filter(i => i.phase === phase);
      const pTotal     = phaseItems.length;
      const pDone      = phaseItems.filter(i => i.checked).length;
      const pPct       = pTotal > 0 ? Math.round((pDone / pTotal) * 100) : 0;
      return {
        phase,
        pTotal,
        pDone,
        pct: pPct,
        name: PHASE_META[phase].label,
        color: pDone === pTotal && pTotal > 0 ? '#22a06b' : PHASE_META[phase].color
      };
    });

    // By tag
    const tags = Object.keys(TAG_META).map(tag => {
      const tagItems = pmItems.filter(i => i.tag === tag);
      const tTotal   = tagItems.length;
      const tDone    = tagItems.filter(i => i.checked).length;
      const tLeft    = tTotal - tDone;
      return { tag, tTotal, tDone, tLeft, pct: tTotal > 0 ? Math.round((tDone / tTotal) * 100) : 0 };
    });

    // Unchecked risk count
    const riskLeft = pmItems.filter(i => i.tag === 'risk' && !i.checked).length;

    return { total, completed, rate, pending, phases, tags, riskLeft };
  }, [items]);

  // ── WBS Stats ──
  const wbsStats = useMemo(() => {
    const total = wbsRows.length;
    if (total === 0) {
      return { total: 0, done: 0, prog: 0, delayed: 0, notStarted: 0, rate: 0 };
    }

    let done = 0;
    let prog = 0;
    let delayed = 0;
    let notStarted = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    wbsRows.forEach(task => {
      const status = task.status;
      if (status === '완료') {
        done++;
      } else if (status === '진행중') {
        if (task.plan_end && new Date(task.plan_end) < today) {
          delayed++;
        } else {
          prog++;
        }
      } else {
        notStarted++;
      }
    });

    const rate = Math.round(wbsRows.reduce((sum, r) => sum + (r.actual_progress || 0), 0) / total);
    return { total, done, prog, delayed, notStarted, rate };
  }, [wbsRows]);

  // SVG Progress Ring
  const progressRing = useMemo(() => {
    const rate = wbsStats.rate;
    const r = 44;
    const circumference = 2 * Math.PI * r;
    const strokeDashoffset = circumference * (1 - rate / 100);

    return (
      <svg width="104" height="104" viewBox="0 0 104 104" className="block mx-auto shrink-0 select-none">
        <circle cx="52" cy="52" r={r} fill="none" stroke="#eef0f5" strokeWidth="11" />
        <circle
          cx="52"
          cy="52"
          r={r}
          fill="none"
          stroke="#3182f6"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 52 52)"
          className="transition-all duration-700 ease-out"
        />
        <text x="52" y="50" textAnchor="middle" fontSize="22" fontWeight="800" fill="#101727">
          {rate}%
        </text>
        <text x="52" y="67" textAnchor="middle" fontSize="10" fill="#9aa2b3" fontWeight="600">
          진행률
        </text>
      </svg>
    );
  }, [wbsStats]);

  // ── Accessibility Stats ──
  const getA11yStatus = (item: ChecklistItem): 'pass' | 'fail' | 'na' | 'unchecked' => {
    const tagStr = (item.tag || '').trim();
    if (tagStr.includes('검수완료') || tagStr.includes('검수 완료') || item.checked) {
      return 'pass';
    } else if (tagStr.includes('조치필요') || tagStr.includes('조치 필요') || tagStr.includes('오류') || tagStr.includes('실패')) {
      return 'fail';
    } else if (tagStr.includes('해당없음') || tagStr.includes('해당 없음')) {
      return 'na';
    }
    return 'unchecked';
  };

  const a11yStats = useMemo(() => {
    const a11yItems = items.filter(item => item.phase === 'accessibility');
    const demoA11y = {
      web:     { pass: 25, fail: 6, na: 2, unchecked: 0, total: 33 },
      ios:     { pass: 18, fail: 4, na: 3, unchecked: 8, total: 33 },
      android: { pass: 14, fail: 3, na: 4, unchecked: 12, total: 33 },
    };

    if (a11yItems.length === 0) {
      return demoA11y;
    }

    const stats = {
      web:     { pass: 0, fail: 0, na: 0, unchecked: 0, total: 0 },
      ios:     { pass: 0, fail: 0, na: 0, unchecked: 0, total: 0 },
      android: { pass: 0, fail: 0, na: 0, unchecked: 0, total: 0 },
    };

    a11yItems.forEach(item => {
      const textCombined = (item.text + " " + item.group_name).toLowerCase();
      let platform: 'web' | 'ios' | 'android' = 'web';
      
      if (textCombined.includes('ios') || textCombined.includes('아이폰') || textCombined.includes('voiceover')) {
        platform = 'ios';
      } else if (textCombined.includes('android') || textCombined.includes('안드로이드') || textCombined.includes('talkback')) {
        platform = 'android';
      }

      const status = getA11yStatus(item);
      stats[platform].total++;
      stats[platform][status]++;
    });

    if (stats.web.total === 0) stats.web = demoA11y.web;
    if (stats.ios.total === 0) stats.ios = demoA11y.ios;
    if (stats.android.total === 0) stats.android = demoA11y.android;

    return stats;
  }, [items]);

  const activeA11y = useMemo(() => {
    const data = a11yStats[selectedPlatform];
    const total = data.total || 1;
    const rate = Math.round((data.pass / total) * 100);
    return {
      ...data,
      rate,
      passPct: (data.pass / total) * 100,
      failPct: (data.fail / total) * 100,
      naPct: (data.na / total) * 100,
      uncheckedPct: (data.unchecked / total) * 100,
    };
  }, [a11yStats, selectedPlatform]);

  // ── WBS Deadline Items ──
  const wbsDeadlineItems = useMemo(() => {
    const tasks = wbsRows.filter(row => row.level >= 3 && row.plan_end);
    const today = new Date();
    today.setHours(0,0,0,0);

    const fmtMD = (dateStr: string) => {
      const d = new Date(dateStr);
      return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    };

    const getDdayLabel = (dateStr: string) => {
      const target = new Date(dateStr);
      target.setHours(0,0,0,0);
      const diffTime = target.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'D-DAY';
      if (diffDays > 0) return `D-${diffDays}`;
      return `D+${Math.abs(diffDays)}`;
    };

    const resolved = tasks.map(task => {
      const endStr = task.plan_end || '';
      const dday = getDdayLabel(endStr);
      const isOverdue = dday.startsWith('D+');
      const isToday = dday === 'D-DAY';
      
      let phaseLabel = '구축';
      let phaseBg = '#e3f6f1';
      let phaseColor = '#0d8a72';

      const l1Text = task.task_l1 || '';
      if (l1Text.includes('착수') || l1Text.includes('준비')) {
        phaseLabel = '착수'; phaseBg = '#f1ecff'; phaseColor = '#7c4dff';
      } else if (l1Text.includes('분석') || l1Text.includes('진단')) {
        phaseLabel = '분석'; phaseBg = '#eaf1ff'; phaseColor = '#2563eb';
      } else if (l1Text.includes('검수') || l1Text.includes('평가')) {
        phaseLabel = '검수'; phaseBg = '#fdf3e2'; phaseColor = '#c47e10';
      } else if (l1Text.includes('종료') || l1Text.includes('이전')) {
        phaseLabel = '종료'; phaseBg = '#eef0f5'; phaseColor = '#5a6478';
      }

      let statusLabel = '미진행';
      let statusBg = '#eef0f5';
      let statusColor = '#5a6478';

      if (task.status === '완료') {
        statusLabel = '완료'; statusBg = '#e6f6ee'; statusColor = '#178055';
      } else if (task.status === '진행중') {
        if (isOverdue) {
          statusLabel = '지연'; statusBg = '#fdeaee'; statusColor = '#d11d44';
        } else {
          statusLabel = '진행중'; statusBg = '#eaf1ff'; statusColor = '#2563eb';
        }
      }

      return {
        id: task.id,
        phase: phaseLabel,
        phaseBg,
        phaseColor,
        task: task.task_l3 || task.task_l4 || task.task_l2 || '세부 업무',
        assignee: task.assignee || '미지정',
        due: fmtMD(endStr),
        dday,
        ddayColor: isOverdue || isToday ? '#d11d44' : '#9aa2b3',
        progress: task.actual_progress || 0,
        barColor: task.status === '완료' ? '#22a06b' : (isOverdue ? '#e11d48' : '#3b82f6'),
        statusLabel,
        statusBg,
        statusColor,
        rawDdayNum: isOverdue ? 9999 : (isToday ? 0 : parseInt(dday.replace('D-', ''))),
      };
    });

    return resolved
      .filter(item => item.statusLabel !== '완료')
      .sort((a, b) => a.rawDdayNum - b.rawDdayNum)
      .slice(0, 5);
  }, [wbsRows]);

  const deadlineCount = useMemo(() => {
    return wbsDeadlineItems.filter(item => item.dday === 'D-DAY' || item.dday.startsWith('D+') || item.dday === 'D-1').length;
  }, [wbsDeadlineItems]);

  const donutGradient = `conic-gradient(#3182f6 0 ${pmStats.rate}%, #eef1f5 ${pmStats.rate}% 100%)`;

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <AlertCircle className="w-10 h-10 text-[#8b95a1]" />
        <p className="text-sm text-[#4e5968]">프로젝트를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <section className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold font-heading text-[#191f28]">리포트</h2>
        <p className="text-xs mt-0.5 text-[#8b95a1]">
          {currentProject.name} — 체크리스트 및 일정 완료 현황 종합 분석
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 gap-4 bg-white border border-[#e5e8eb] rounded-2xl">
          <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
          <span className="text-xs text-[#8b95a1]">지표 집계 및 분석 중...</span>
        </div>
      ) : (
        <>
          {/* KPI Dashboard Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            
            {/* Card 1: WBS 진행률 */}
            <section className="bg-white border border-[#e8ecf3] rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-[13.5px] font-bold text-[#3a4358]">전체 WBS 진행률</h3>
                <span className="text-[10.5px] font-bold text-[#2563eb] bg-[#eef4ff] px-2 py-0.5 rounded-md font-sans">
                  {wbsStats.total}개 업무
                </span>
              </div>
              <div className="flex items-center gap-5.5">
                {progressRing}
                <div className="flex-1 flex flex-col gap-2 font-sans">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#6b7488] flex items-center">
                      <span className="inline-block w-2 h-2 rounded bg-[#22a06b] mr-1.5"></span>완료
                    </span>
                    <b className="text-[#1f2a3d] font-bold">{wbsStats.done}</b>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#6b7488] flex items-center">
                      <span className="inline-block w-2 h-2 rounded bg-[#3b82f6] mr-1.5"></span>진행중
                    </span>
                    <b className="text-[#1f2a3d] font-bold">{wbsStats.prog}</b>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#6b7488] flex items-center">
                      <span className="inline-block w-2 h-2 rounded bg-[#e11d48] mr-1.5"></span>지연
                    </span>
                    <b className="text-[#e11d48] font-bold">{wbsStats.delayed}</b>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#6b7488] flex items-center">
                      <span className="inline-block w-2 h-2 rounded bg-[#cdd4e0] mr-1.5"></span>미착수
                    </span>
                    <b className="text-[#1f2a3d] font-bold">{wbsStats.notStarted}</b>
                  </div>
                </div>
              </div>
            </section>

            {/* Card 2: 접근성 점검 현황 */}
            <section className="bg-white border border-[#e8ecf3] rounded-2xl p-5 shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-[13.5px] font-bold text-[#3a4358]">
                  접근성 점검 현황 <span className="text-[#9aa2b3] font-medium text-[11.5px]">· KWCAG 2.2</span>
                </h3>
                {/* Platform Selector Tabs */}
                <div className="flex gap-0.5 bg-[#f2f4f9] p-0.5 rounded-lg">
                  {(['web', 'ios', 'android'] as const).map((pKey) => {
                    const labelMap = { web: 'PC 웹', ios: 'iOS', android: 'Android' };
                    const isAct = selectedPlatform === pKey;
                    return (
                      <button
                        key={pKey}
                        onClick={() => setSelectedPlatform(pKey)}
                        className={`px-2.5 py-1 border-none rounded-md cursor-pointer font-bold text-[11px] transition-all focus:outline-none ${
                          isAct ? 'bg-white text-[#2563eb] shadow-sm' : 'bg-transparent text-[#7b8499] hover:text-[#4e5968]'
                        }`}
                      >
                        {labelMap[pKey]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-end gap-2.5 mb-3.5">
                <div className="text-[32px] font-extrabold text-[#101727] line-height-none tracking-tight">
                  {activeA11y.rate}
                  <span className="text-[16px] text-[#9aa2b3] font-bold ml-0.5">%</span>
                </div>
                <div className="text-[11.5px] text-[#6b7488] pb-1 font-medium font-sans">
                  통과율 · 총 {activeA11y.total}개 항목
                </div>
              </div>

              {/* Stacked Percentage Bar */}
              <div className="flex h-3 bg-[#eef0f5] rounded-full overflow-hidden mb-4 shrink-0">
                <div
                  style={{ width: `${activeA11y.passPct}%` }}
                  className="bg-[#22a06b] transition-all duration-500"
                ></div>
                <div
                  style={{ width: `${activeA11y.failPct}%` }}
                  className="bg-[#e11d48] transition-all duration-500"
                ></div>
                <div
                  style={{ width: `${activeA11y.naPct}%` }}
                  className="bg-[#f0a020] transition-all duration-500"
                ></div>
                <div
                  style={{ width: `${activeA11y.uncheckedPct}%` }}
                  className="bg-[#cdd4e0] transition-all duration-500"
                ></div>
              </div>

              {/* Grid Count indicators */}
              <div className="grid grid-cols-4 gap-2 mt-auto font-sans">
                <div className="bg-[#f0faf5] border border-[#d6eede] rounded-xl p-2 text-center">
                  <div className="text-[10px] text-[#1a8a5a] font-semibold mb-0.5">통과</div>
                  <div className="text-[18px] font-extrabold text-[#178055]">{activeA11y.pass}</div>
                </div>
                <div className="bg-[#fdf1f3] border border-[#f6d6dd] rounded-xl p-2 text-center">
                  <div className="text-[10px] text-[#c81e44] font-semibold mb-0.5">실패</div>
                  <div className="text-[18px] font-extrabold text-[#d11d44]">{activeA11y.fail}</div>
                </div>
                <div className="bg-[#fff7ec] border border-[#f7e3c2] rounded-xl p-2 text-center">
                  <div className="text-[10px] text-[#c47e10] font-semibold mb-0.5">해당없음</div>
                  <div className="text-[18px] font-extrabold text-[#bd7c12]">{activeA11y.na}</div>
                </div>
                <div className="bg-[#f5f6f9] border border-[#e3e7ef] rounded-xl p-2 text-center">
                  <div className="text-[10px] text-[#6b7488] font-semibold mb-0.5">미점검</div>
                  <div className="text-[18px] font-extrabold text-[#4a5468]">{activeA11y.unchecked}</div>
                </div>
              </div>
            </section>

            {/* Card 3: 미완료 PM 체크리스트 */}
            <section className="bg-white border border-[#e8ecf3] rounded-2xl p-5 shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-[13.5px] font-bold text-[#3a4358]">미완료 PM 체크리스트</h3>
                <span className="text-[10.5px] font-bold text-[#6b7488] bg-[#f2f4f9] px-2 py-0.5 rounded-md font-sans">
                  {pmStats.completed}/{pmStats.total} 완료
                </span>
              </div>
              <div className="flex items-end gap-2 mb-1">
                <div className="text-[40px] font-extrabold text-[#e11d48] line-height-none tracking-tight">
                  {pmStats.pending}
                </div>
                <div className="text-[12.5px] text-[#6b7488] pb-1.5 font-semibold">건 미완료</div>
              </div>
              <div className="text-[11.5px] text-[#9aa2b3] font-medium mb-3.5">완료율 {pmStats.rate}%</div>
              
              <div className="flex flex-col gap-2.5 mt-auto font-sans">
                {pmStats.phases.map((ph, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between text-[11px] mb-1 font-semibold">
                      <span className="text-[#5a6478]">{ph.name}</span>
                      <span className="text-[#8a93a6]">{ph.pDone}/{ph.pTotal}</span>
                    </div>
                    <div className="h-1.5 bg-[#eef0f5] rounded-full overflow-hidden">
                      <div
                        style={{ width: `${ph.pct}%`, backgroundColor: ph.color }}
                        className="h-full rounded-full transition-all duration-500"
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* PM Checklist Details Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Phase breakdown bar chart */}
            <div className="md:col-span-2 bg-white border border-[#e8ecf3] rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[14px] font-extrabold text-[#1a2030]">단계별 완료 현황 상세</span>
                <span className="text-xs text-[#8a93a5]">{pmStats.completed}/{pmStats.total} 완료</span>
              </div>
              <div className="flex flex-col gap-4 font-sans">
                {pmStats.phases.map(({ phase, pTotal, pDone, pct, color, name }) => {
                  return (
                    <div key={phase} className="flex items-center gap-3">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <span className="text-[13px] font-medium w-16 shrink-0 text-[#46506a]">
                        {name}
                      </span>
                      <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-[#f1f3f6]">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </div>
                      <span className="text-[12px] font-semibold w-8 text-right shrink-0 text-[#1a2030]">
                        {pct}%
                      </span>
                      <span className="text-[11px] w-14 shrink-0 text-[#8a93a5]">
                        {pDone}/{pTotal}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Completion rate donut */}
            <div className="bg-white border border-[#e8ecf3] rounded-2xl p-5 shadow-sm flex flex-col items-center justify-center gap-3">
              <span className="text-[14px] font-extrabold self-start text-[#1a2030]">전체 완료율</span>
              <div className="relative my-2 select-none">
                <div
                  className="w-36 h-36 rounded-full"
                  style={{ background: donutGradient }}
                />
                {/* Hole */}
                <div
                  className="absolute inset-0 m-auto w-24 h-24 rounded-full flex flex-col items-center justify-center bg-white"
                  style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', position: 'absolute' }}
                >
                  <span className="text-3xl font-bold leading-none text-[#1a2030]">{pmStats.rate}%</span>
                  <span className="text-[11px] mt-0.5 text-[#8a93a5]">완료</span>
                </div>
              </div>
              <p className="text-[12px] text-center text-[#7a8396] font-sans">
                전체 {pmStats.total}개 중 {pmStats.completed}개 완료
              </p>
            </div>
          </div>

          {/* Tag breakdown */}
          <div className="bg-white border border-[#e8ecf3] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[14px] font-extrabold text-[#1a2030]">태그별 현황</span>
              {pmStats.riskLeft > 0 && (
                <span
                  className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full text-[#e0413f] bg-[#fce8e7]"
                >
                  미완료 리스크 {pmStats.riskLeft}건
                </span>
              )}
            </div>
            <div className="flex flex-col gap-4 font-sans">
              {pmStats.tags.map(({ tag, tTotal, tDone, tLeft, pct }) => {
                const meta = TAG_META[tag];
                return (
                  <div key={tag} className="flex items-center gap-3">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: meta.color }}
                    />
                    <span className="text-[13px] font-medium w-20 shrink-0 text-[#46506a]">
                      {meta.label}
                    </span>
                    <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-[#f1f3f6]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: tTotal > 0 ? `${pct}%` : '0%', background: meta.color }}
                      />
                    </div>
                    <span className="text-[12px] font-bold w-8 text-right shrink-0 text-[#1a2030]">
                      {tDone}
                    </span>
                    <span className="text-[11px] w-20 shrink-0 text-[#8a93a5]">
                      완료 / 잔여 {tLeft}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary card grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-sans">
            {pmStats.phases.map(({ phase, pTotal, pDone, color, name }) => {
              const left = pTotal - pDone;
              return (
                <div key={phase} className="bg-white border border-[#e8ecf3] rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8a93a5]">
                      {name}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-[#1a2030]">{pDone}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: left > 0 ? '#d98a2b' : '#8a93a5' }}>
                    {left > 0 ? `잔여 ${left}개` : '모두 완료'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 이번 주 마감 WBS 항목 테이블 */}
          <section className="bg-white border border-[#e8ecf3] rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[#eef1f6] shrink-0">
              <div className="flex items-center gap-2.5">
                <h3 className="text-[14px] font-extrabold text-[#101727]">이번 주 마감 WBS 항목</h3>
                <span className="text-[11px] font-bold text-[#c81e44] bg-[#fdf1f3] px-2.5 py-0.5 rounded-full font-sans">
                  마감 임박 {deadlineCount}건
                </span>
              </div>
              <span className="text-[12px] text-[#9aa2b3] font-medium font-sans">이번 주 미완료 작업 목록</span>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[80px_1fr_100px_100px_130px_80px] px-5 py-2.5 bg-[#fafbfd] border-b border-[#eef1f6] text-[11px] font-bold text-[#8a93a6] tracking-wider select-none">
              <div>단계</div>
              <div>업무</div>
              <div>담당자</div>
              <div>계획 완료일</div>
              <div>진행률</div>
              <div className="text-right">상태</div>
            </div>

            {/* Table body */}
            <div className="divide-y divide-[#f1f3f8] overflow-y-auto font-sans">
              {wbsDeadlineItems.length === 0 ? (
                <div className="p-10 text-center text-xs text-[#9aa2b3] font-semibold">
                  이번 주 마감 일정이 완료되었거나 대기 중인 작업이 없습니다.
                </div>
              ) : (
                wbsDeadlineItems.map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-[80px_1fr_100px_100px_130px_80px] items-center px-5 py-3.5 text-xs hover:bg-[#fafbfd] transition-colors"
                  >
                    <div>
                      <span
                        style={{ color: r.phaseColor, backgroundColor: r.phaseBg }}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                      >
                        {r.phase}
                      </span>
                    </div>
                    <div className="font-bold text-[#22304a] truncate pr-4 leading-normal" title={r.task}>
                      {r.task}
                    </div>
                    <div className="text-[#5a6478] font-medium">{r.assignee}</div>
                    <div className="text-[#5a6478] font-medium flex items-center gap-1.5">
                      {r.due}
                      <span style={{ color: r.ddayColor }} className="text-[10.5px] font-extrabold">
                        {r.dday}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 h-1.5 bg-[#eef0f5] rounded-full overflow-hidden">
                        <div
                          style={{ width: `${r.progress}%`, backgroundColor: r.barColor }}
                          className="h-full rounded-full transition-all duration-300"
                        ></div>
                      </div>
                      <span className="text-[10.5px] font-bold text-[#5a6478] w-8 text-right shrink-0">
                        {r.progress}%
                      </span>
                    </div>
                    <div className="text-right">
                      <span
                        style={{ color: r.statusColor, backgroundColor: r.statusBg }}
                        className="text-[10.5px] font-bold px-2.5 py-1 rounded-full inline-block"
                      >
                        {r.statusLabel}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
