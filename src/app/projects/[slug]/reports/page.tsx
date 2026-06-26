'use client';
 
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useProject } from '../../../../context/ProjectContext';
import { supabase } from '../../../../lib/supabaseClient';
import {
  Loader2, AlertCircle, Calendar
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

  // ── 공통 날짜 헬퍼 ──
  const getThisWeek = () => {
    const today = new Date();
    const day = today.getDay();
    const mon = new Date(today);
    mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { from: fmt(mon), to: fmt(sun) };
  };

  const getPresetRange = (preset: 'thisWeek' | 'nextWeek' | 'thisMonth' | 'all') => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const day = today.getDay();
    if (preset === 'thisWeek') {
      return getThisWeek();
    } else if (preset === 'nextWeek') {
      const nextMon = new Date(today);
      nextMon.setDate(today.getDate() + (day === 0 ? 1 : 8 - day));
      const nextSun = new Date(nextMon);
      nextSun.setDate(nextMon.getDate() + 6);
      return { from: fmt(nextMon), to: fmt(nextSun) };
    } else if (preset === 'thisMonth') {
      return {
        from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)),
        to:   fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      };
    }
    return { from: '', to: '' };
  };

  // ── WBS 날짜 범위 필터 ──
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(getThisWeek);
  const [showCompleted, setShowCompleted] = useState(false);

  const applyPreset = (preset: 'thisWeek' | 'nextWeek' | 'thisMonth' | 'all') => {
    setDateRange(getPresetRange(preset));
  };

  // ── 접근성 날짜 범위 필터 ──
  const [a11yDateRange, setA11yDateRange] = useState<{ from: string; to: string }>(getThisWeek);

  const applyA11yPreset = (preset: 'thisWeek' | 'nextWeek' | 'thisMonth' | 'all') => {
    setA11yDateRange(getPresetRange(preset));
  };

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

    return { total, completed, rate, pending, phases };
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
  const getA11yStatus = (item: ChecklistItem): 'pass' | 'fail' | 'na' | 'unchecked' | 'skip' => {
    let checkStatus = '';
    if (item.memo) {
      try {
        const parsed = JSON.parse(item.memo);
        checkStatus = parsed.check_status || '';
      } catch {}
    }
    if (checkStatus.includes('현행유지') || checkStatus.includes('현행 유지')) {
      return 'skip';
    }

    const tagStr = (item.tag || '').trim();
    if (
      tagStr.includes('검수완료') ||
      tagStr.includes('검수 완료') ||
      tagStr.includes('조치완료') ||
      tagStr.includes('조치 완료') ||
      item.checked
    ) {
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
    const zeroA11y = {
      web:     { pass: 0, fail: 0, na: 0, unchecked: 0, total: 0 },
      ios:     { pass: 0, fail: 0, na: 0, unchecked: 0, total: 0 },
      android: { pass: 0, fail: 0, na: 0, unchecked: 0, total: 0 },
    };

    if (a11yItems.length === 0) {
      return zeroA11y;
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
      if (status !== 'skip') {
        stats[platform].total++;
        stats[platform][status]++;
      }
    });

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

    const fromDate = dateRange.from ? new Date(dateRange.from + 'T00:00:00') : null;
    const toDate   = dateRange.to   ? new Date(dateRange.to   + 'T23:59:59') : null;

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

      const endDate = new Date(endStr);
      endDate.setHours(0,0,0,0);
      const inRange = (!fromDate || endDate >= fromDate) && (!toDate || endDate <= toDate);

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
        inRange,
      };
    });

    return resolved
      .filter(item => item.inRange && (showCompleted || item.statusLabel !== '완료'))
      .sort((a, b) => a.rawDdayNum - b.rawDdayNum);
  }, [wbsRows, dateRange, showCompleted]);

  const deadlineCount = useMemo(() => {
    return wbsDeadlineItems.filter(item => item.dday === 'D-DAY' || item.dday.startsWith('D+') || item.dday === 'D-1').length;
  }, [wbsDeadlineItems]);

  // ── 접근성 항목 (due_date 기준 필터) ──
  const a11yFilteredItems = useMemo(() => {
    const a11yItems = items.filter(i => i.phase === 'accessibility');
    const fromDate = a11yDateRange.from ? new Date(a11yDateRange.from + 'T00:00:00') : null;
    const toDate   = a11yDateRange.to   ? new Date(a11yDateRange.to   + 'T23:59:59') : null;

    const getStatus = (item: ChecklistItem): { label: string; color: string; bg: string } => {
      let checkStatus = '';
      if (item.memo) {
        try { const p = JSON.parse(item.memo); checkStatus = p.check_status || ''; } catch {}
      }
      if (checkStatus.includes('현행유지') || checkStatus.includes('현행 유지'))
        return { label: '현행유지', color: '#6b7488', bg: '#f2f4f9' };

      const tag = (item.tag || '').trim();
      if (tag.includes('검수완료') || tag.includes('조치완료') || item.checked)
        return { label: '통과', color: '#178055', bg: '#e6f6ee' };
      if (tag.includes('조치필요') || tag.includes('오류') || tag.includes('실패'))
        return { label: '실패', color: '#d11d44', bg: '#fdeaee' };
      if (tag.includes('해당없음'))
        return { label: '해당없음', color: '#c47e10', bg: '#fff7ec' };
      return { label: '미점검', color: '#5a6478', bg: '#eef0f5' };
    };

    const filtered = a11yItems.filter(item => {
      if (!item.due_date) return false;
      const d = new Date(item.due_date + 'T00:00:00');
      return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
    });

    // 그룹명별로 병합
    const groups: Record<string, { items: Array<{ id: string; text: string; due: string; assignee: string; status: ReturnType<typeof getStatus> }> }> = {};
    filtered.forEach(item => {
      const group = item.group_name || '기타';
      if (!groups[group]) groups[group] = { items: [] };
      const d = new Date(item.due_date! + 'T00:00:00');
      const due = `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
      groups[group].items.push({
        id: item.id,
        text: item.text,
        due,
        assignee: item.assignee || '미지정',
        status: getStatus(item),
      });
    });

    return { groups, total: filtered.length };
  }, [items, a11yDateRange]);

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



          {/* WBS 마감 + 접근성 리스트 좌우 배치 */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">

          {/* WBS 마감 항목 테이블 */}
          <section className="bg-white border border-[#e8ecf3] rounded-2xl shadow-sm overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex flex-col gap-3 p-4 border-b border-[#eef1f6] shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-[14px] font-extrabold text-[#101727]">WBS 마감 항목</h3>
                  {deadlineCount > 0 && (
                    <span className="text-[11px] font-bold text-[#c81e44] bg-[#fdf1f3] px-2.5 py-0.5 rounded-full font-sans">
                      마감 임박 {deadlineCount}건
                    </span>
                  )}
                  <span className="text-[11px] font-semibold text-[#6b7488] bg-[#f2f4f9] px-2 py-0.5 rounded-md font-sans">
                    총 {wbsDeadlineItems.length}건
                  </span>
                </div>
                {/* 완료 포함 토글 */}
                <button
                  onClick={() => setShowCompleted(v => !v)}
                  className={`flex items-center gap-1.5 text-[11.5px] font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                    showCompleted
                      ? 'bg-[#e6f6ee] border-[#b6e0cc] text-[#178055]'
                      : 'bg-[#f5f6f9] border-[#e3e7ef] text-[#6b7488] hover:border-[#c5c9d6]'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                    showCompleted ? 'bg-[#22a06b] border-[#22a06b]' : 'border-[#b0b8c9] bg-white'
                  }`}>
                    {showCompleted && <span className="text-white text-[9px] font-black">✓</span>}
                  </span>
                  완료 포함
                </button>
              </div>

              {/* 날짜 필터 컨트롤 */}
              <div className="flex flex-wrap items-center gap-2">
                {(['thisWeek', 'nextWeek', 'thisMonth', 'all'] as const).map(preset => {
                  const labels = { thisWeek: '이번 주', nextWeek: '다음 주', thisMonth: '이번 달', all: '전체' };
                  const pr = getPresetRange(preset);
                  const isActive = preset === 'all'
                    ? !dateRange.from && !dateRange.to
                    : dateRange.from === pr.from && dateRange.to === pr.to;
                  return (
                    <button key={preset} onClick={() => applyPreset(preset)}
                      className={`text-[11.5px] font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                        isActive ? 'bg-[#3182f6] border-[#3182f6] text-white shadow-sm' : 'bg-white border-[#e3e7ef] text-[#5a6478] hover:border-[#b0b8c9]'
                      }`}>
                      {labels[preset]}
                    </button>
                  );
                })}
                <div className="w-px h-5 bg-[#e3e7ef] mx-0.5" />
                <div className="flex items-center gap-1.5 font-sans">
                  <Calendar className="w-3.5 h-3.5 text-[#9aa2b3] shrink-0" />
                  <input type="date" value={dateRange.from}
                    onChange={e => setDateRange(v => ({ ...v, from: e.target.value }))}
                    className="text-[11.5px] border border-[#e3e7ef] rounded-lg px-2.5 py-1.5 text-[#3a4358] bg-white outline-none focus:border-[#3182f6] transition-colors cursor-pointer" />
                  <span className="text-[11px] text-[#9aa2b3] font-medium">~</span>
                  <input type="date" value={dateRange.to}
                    onChange={e => setDateRange(v => ({ ...v, to: e.target.value }))}
                    className="text-[11.5px] border border-[#e3e7ef] rounded-lg px-2.5 py-1.5 text-[#3a4358] bg-white outline-none focus:border-[#3182f6] transition-colors cursor-pointer" />
                </div>
              </div>
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
                  선택한 기간에 해당하는 WBS 항목이 없습니다.
                </div>
              ) : (
                wbsDeadlineItems.map((r) => (
                  <div key={r.id}
                    className="grid grid-cols-[80px_1fr_100px_100px_130px_80px] items-center px-5 py-3.5 text-xs hover:bg-[#fafbfd] transition-colors">
                    <div>
                      <span style={{ color: r.phaseColor, backgroundColor: r.phaseBg }}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md">{r.phase}</span>
                    </div>
                    <div className="font-bold text-[#22304a] truncate pr-4 leading-normal" title={r.task}>{r.task}</div>
                    <div className="text-[#5a6478] font-medium">{r.assignee}</div>
                    <div className="text-[#5a6478] font-medium flex items-center gap-1.5">
                      {r.due}
                      <span style={{ color: r.ddayColor }} className="text-[10.5px] font-extrabold">{r.dday}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 h-1.5 bg-[#eef0f5] rounded-full overflow-hidden">
                        <div style={{ width: `${r.progress}%`, backgroundColor: r.barColor }}
                          className="h-full rounded-full transition-all duration-300" />
                      </div>
                      <span className="text-[10.5px] font-bold text-[#5a6478] w-8 text-right shrink-0">{r.progress}%</span>
                    </div>
                    <div className="text-right">
                      <span style={{ color: r.statusColor, backgroundColor: r.statusBg }}
                        className="text-[10.5px] font-bold px-2.5 py-1 rounded-full inline-block">{r.statusLabel}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* 접근성 점검 리스트 */}
          <section className="bg-white border border-[#e8ecf3] rounded-2xl shadow-sm overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex flex-col gap-3 p-4 border-b border-[#eef1f6] shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-[14px] font-extrabold text-[#101727]">접근성 점검 리스트</h3>
                  <span className="text-[10.5px] font-medium text-[#9aa2b3]">· KWCAG 2.2</span>
                  <span className="text-[11px] font-semibold text-[#6b7488] bg-[#f2f4f9] px-2 py-0.5 rounded-md font-sans">
                    총 {a11yFilteredItems.total}건
                  </span>
                </div>
              </div>

              {/* 날짜 필터 */}
              <div className="flex flex-wrap items-center gap-2">
                {(['thisWeek', 'nextWeek', 'thisMonth', 'all'] as const).map(preset => {
                  const labels = { thisWeek: '이번 주', nextWeek: '다음 주', thisMonth: '이번 달', all: '전체' };
                  const pr = getPresetRange(preset);
                  const isActive = preset === 'all'
                    ? !a11yDateRange.from && !a11yDateRange.to
                    : a11yDateRange.from === pr.from && a11yDateRange.to === pr.to;
                  return (
                    <button key={preset} onClick={() => applyA11yPreset(preset)}
                      className={`text-[11.5px] font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                        isActive ? 'bg-[#3182f6] border-[#3182f6] text-white shadow-sm' : 'bg-white border-[#e3e7ef] text-[#5a6478] hover:border-[#b0b8c9]'
                      }`}>
                      {labels[preset]}
                    </button>
                  );
                })}
                <div className="w-px h-5 bg-[#e3e7ef] mx-0.5" />
                <div className="flex items-center gap-1.5 font-sans">
                  <Calendar className="w-3.5 h-3.5 text-[#9aa2b3] shrink-0" />
                  <input type="date" value={a11yDateRange.from}
                    onChange={e => setA11yDateRange(v => ({ ...v, from: e.target.value }))}
                    className="text-[11.5px] border border-[#e3e7ef] rounded-lg px-2.5 py-1.5 text-[#3a4358] bg-white outline-none focus:border-[#3182f6] transition-colors cursor-pointer" />
                  <span className="text-[11px] text-[#9aa2b3] font-medium">~</span>
                  <input type="date" value={a11yDateRange.to}
                    onChange={e => setA11yDateRange(v => ({ ...v, to: e.target.value }))}
                    className="text-[11.5px] border border-[#e3e7ef] rounded-lg px-2.5 py-1.5 text-[#3a4358] bg-white outline-none focus:border-[#3182f6] transition-colors cursor-pointer" />
                </div>
              </div>
            </div>

            {/* 접근성 목록 본문 */}
            <div className="overflow-y-auto flex-1">
              {a11yFilteredItems.total === 0 ? (
                <div className="p-10 text-center text-xs text-[#9aa2b3] font-semibold">
                  선택한 기간에 해당하는 접근성 항목이 없습니다.
                </div>
              ) : (
                Object.entries(a11yFilteredItems.groups).map(([group, { items: gItems }]) => (
                  <div key={group}>
                    {/* 그룹 헤더 */}
                    <div className="flex items-center justify-between px-4 py-2 bg-[#f8f9fc] border-b border-[#eef1f6] sticky top-0 z-10">
                      <span className="text-[11px] font-bold text-[#3a4358] truncate">{group}</span>
                      <span className="text-[10.5px] font-semibold text-[#9aa2b3] shrink-0 ml-2">{gItems.length}건</span>
                    </div>
                    {/* 그룹 항목 */}
                    {gItems.map(item => (
                      <div key={item.id}
                        className="flex items-start gap-3 px-4 py-3 border-b border-[#f1f3f8] hover:bg-[#fafbfd] transition-colors">
                        {/* 상태 배지 */}
                        <span
                          style={{ color: item.status.color, backgroundColor: item.status.bg }}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 mt-0.5 whitespace-nowrap">
                          {item.status.label}
                        </span>
                        {/* 항목명 */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-[#22304a] leading-snug break-words">{item.text}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10.5px] text-[#9aa2b3] font-medium">{item.due}</span>
                            {item.assignee !== '미지정' && (
                              <span className="text-[10.5px] text-[#6b7488] font-medium">· {item.assignee}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </section>

          </div>{/* end 2-col grid */}
        </>
      )}
    </section>
  );
}
