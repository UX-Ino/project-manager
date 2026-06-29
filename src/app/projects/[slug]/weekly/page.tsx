'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useProject } from '../../../../context/ProjectContext';
import { supabase } from '../../../../lib/supabaseClient';
import { Loader2, AlertCircle, ClipboardCopy, Calendar, FileText, CheckCircle2, XCircle, Clock, BookmarkCheck, Trash2, X, ChevronDown } from 'lucide-react';

interface WbsRow {
  id: string;
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

interface WeeklyIssue {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string | null;
  due_date: string | null;
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
  sort_order?: number | null;
}

type Preset = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'all';

export default function ProjectWeeklyPage() {
  const params = useParams();
  const projectSlug = (params?.slug as string) || '';
  const { projects, showToast } = useProject();
  const currentProject = projects.find(p => p.slug === projectSlug);
  const projectId = currentProject?.id || '';

  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [wbsRows, setWbsRows] = useState<WbsRow[]>([]);
  const [activeIssues, setActiveIssues] = useState<WeeklyIssue[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // 저장된 보고서 목록
  const [savedReports, setSavedReports] = useState<Array<{
    id: string; week_label: string; period_from: string; period_to: string;
    cumulative_done: number; cumulative_fail: number; period_done: number;
    created_at: string; report_text: string;
  }>>([]);

  // 저장 모달 상태
  const [showModal, setShowModal] = useState(false);
  const [weekLabel, setWeekLabel] = useState('');

  // 영역별 아코디언 (펼쳐진 그룹명 Set — 기본 전체 접힘)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (group: string) =>
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });

  // 보고서 뷰 모달 상태
  const [viewReport, setViewReport] = useState<{
    id: string; week_label: string; period_from: string; period_to: string;
    cumulative_done: number; cumulative_fail: number; period_done: number;
    created_at: string; report_text: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ── 날짜 범위 ──
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

  const getPresetRange = (preset: Preset) => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const day = today.getDay();
    if (preset === 'thisWeek') return getThisWeek();
    if (preset === 'lastWeek') {
      const mon = new Date(today);
      mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1) - 7);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return { from: fmt(mon), to: fmt(sun) };
    }
    if (preset === 'thisMonth') {
      return {
        from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)),
        to:   fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      };
    }
    return { from: '', to: '' };
  };

  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(getThisWeek);

  const applyPreset = (preset: Preset) => setDateRange(getPresetRange(preset));

  const isActivePreset = (preset: Preset) => {
    if (preset === 'all') return !dateRange.from && !dateRange.to;
    const pr = getPresetRange(preset);
    return dateRange.from === pr.from && dateRange.to === pr.to;
  };

  // 주차 자동 추정 (1주차 = 종료일의 주의 순서)
  const autoWeekLabel = useMemo(() => {
    if (!savedReports.length) return '1';
    const max = Math.max(
      ...savedReports
        .map(r => parseInt(r.week_label.replace(/[^0-9]/g, '')) || 0)
        .filter(n => !isNaN(n))
    );
    return String(max + 1);
  }, [savedReports]);

  // ── 데이터 로딩 ──
  const fetchChecklist = useCallback(async (pId: string) => {
    if (!pId) return;
    setDataLoading(true);
    try {
      const { data, error } = await supabase
        .from('checklist')
        .select('*')
        .eq('project_id', pId)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      setItems(data || []);
    } catch (err: unknown) {
      if (err instanceof Error) showToast('체크리스트 항목을 불러오지 못했습니다: ' + err.message);
    } finally {
      setDataLoading(false);
    }
  }, [showToast]);

  useEffect(() => { if (projectId) fetchChecklist(projectId); }, [projectId, fetchChecklist]);

  // WBS 행 조회
  const fetchWbsRows = useCallback(async (pId: string) => {
    if (!pId) return;
    const { data } = await supabase
      .from('wbs_rows')
      .select('*')
      .eq('project_id', pId)
      .order('row_order', { ascending: true });
    setWbsRows(data || []);
  }, []);

  useEffect(() => { if (projectId) fetchWbsRows(projectId); }, [projectId, fetchWbsRows]);

  // 저장된 보고서 조회
  const fetchSavedReports = useCallback(async (pId: string) => {
    if (!pId) return;
    const res = await fetch(`/api/weekly-reports?project_id=${pId}`);
    if (res.ok) {
      const json = await res.json();
      setSavedReports(json.data || []);
    }
  }, []);

  useEffect(() => { if (projectId) fetchSavedReports(projectId); }, [projectId, fetchSavedReports]);

  // 이슈 조회 (완료 제외)
  const fetchActiveIssues = useCallback(async (pId: string) => {
    if (!pId) return;
    const { data } = await supabase
      .from('issues')
      .select('id, title, status, priority, assignee, due_date')
      .eq('project_id', pId)
      .neq('status', '완료')
      .order('due_date', { ascending: true });
    setActiveIssues((data as WeeklyIssue[]) || []);
  }, []);

  useEffect(() => { if (projectId) fetchActiveIssues(projectId); }, [projectId, fetchActiveIssues]);

  // ── 접근성 항목 상태 판별 ──
  const getA11yStatus = (item: ChecklistItem): 'pass' | 'fail' | 'na' | 'unchecked' | 'skip' => {
    let checkStatus = '';
    if (item.memo) {
      try { const p = JSON.parse(item.memo); checkStatus = p.check_status || ''; } catch {}
    }
    if (checkStatus.includes('현행유지') || checkStatus.includes('현행 유지')) return 'skip';
    const tag = (item.tag || '').trim();
    if (tag.includes('검수완료') || tag.includes('조치완료') || item.checked) return 'pass';
    if (tag.includes('조치필요') || tag.includes('오류') || tag.includes('실패')) return 'fail';
    if (tag.includes('해당없음')) return 'na';
    return 'unchecked';
  };

  // ── 날짜 기준 필터링 ──
  const a11yAll = useMemo(() => items.filter(i => i.phase === 'accessibility'), [items]);

  // 선택 기간(from~to) 내 항목 → 영역별 상세 표시용
  const a11yFiltered = useMemo(() => {
    const fromDate = dateRange.from ? new Date(dateRange.from + 'T00:00:00') : null;
    const toDate   = dateRange.to   ? new Date(dateRange.to   + 'T23:59:59') : null;

    return a11yAll.filter(item => {
      if (!item.due_date) return false;
      const d = new Date(item.due_date + 'T00:00:00');
      return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
    });
  }, [a11yAll, dateRange]);

  // 종료일까지 누적 항목 → 조치 완료 눈적 스태이지만 stats용
  const a11yCumulative = useMemo(() => {
    const toDate = dateRange.to ? new Date(dateRange.to + 'T23:59:59') : null;
    return a11yAll.filter(item => {
      if (!item.due_date) return false;
      const d = new Date(item.due_date + 'T00:00:00');
      return !toDate || d <= toDate;
    });
  }, [a11yAll, dateRange]);

  // ── 통계 ──
  const stats = useMemo(() => {
    const total = a11yAll.length;

    // 누적 완료 수 (종료일까지 ~ 날짜 없는 완료 항목 포함)
    const cumulativePass = a11yCumulative.filter(i => getA11yStatus(i) === 'pass').length;
    const cumulativeSkip = a11yCumulative.filter(i => getA11yStatus(i) === 'skip').length;
    const cumulativeDone = cumulativePass + cumulativeSkip;
    const cumulativeFail = a11yCumulative.filter(i => getA11yStatus(i) === 'fail').length;

    // 선택 기간(from~to) 내 항목
    const periodTotal    = a11yFiltered.length;
    const periodPass     = a11yFiltered.filter(i => getA11yStatus(i) === 'pass').length;
    const periodSkip     = a11yFiltered.filter(i => getA11yStatus(i) === 'skip').length;
    const periodDone     = periodPass + periodSkip;
    const periodFail     = a11yFiltered.filter(i => getA11yStatus(i) === 'fail').length;
    const periodNa       = a11yFiltered.filter(i => getA11yStatus(i) === 'na').length;
    const periodUnchecked = a11yFiltered.filter(i => getA11yStatus(i) === 'unchecked').length;

    const wbsPlannedPct = total > 0 ? Math.round((a11yCumulative.length / total) * 100) : 0;
    const wbsActualPct  = total > 0 ? Math.round((cumulativeDone / total) * 100) : 0;

    return {
      total,
      cumulativeDone, cumulativeFail,
      periodTotal, periodDone, periodPass, periodSkip, periodFail, periodNa, periodUnchecked,
      wbsPlannedPct, wbsActualPct,
    };
  }, [a11yAll, a11yCumulative, a11yFiltered]);

  // ── 차주 WBS 항목 ──
  const nextWeekWbsItems = useMemo(() => {
    if (!dateRange.to) return [];
    const toDate = new Date(dateRange.to + 'T23:59:59');
    const nextFrom = new Date(toDate);
    nextFrom.setDate(nextFrom.getDate() + 1);
    nextFrom.setHours(0, 0, 0, 0);
    const nextTo = new Date(toDate);
    nextTo.setDate(nextTo.getDate() + 7);
    nextTo.setHours(23, 59, 59, 999);
    return wbsRows.filter(row => {
      if (!row.plan_end) return false;
      const d = new Date(row.plan_end + 'T00:00:00');
      return d >= nextFrom && d <= nextTo;
    });
  }, [wbsRows, dateRange.to]);

  // ── 그룹별 집계 ──
  const groupedItems = useMemo(() => {
    const map: Record<string, {
      pass: Array<{ text: string; assignee: string; due: string }>;
      fail: Array<{ text: string; assignee: string; due: string }>;
      na:   Array<{ text: string; assignee: string; due: string }>;
      unchecked: Array<{ text: string; assignee: string; due: string }>;
    }> = {};

    a11yFiltered.forEach(item => {
      const group = item.group_name || '기타';
      if (!map[group]) map[group] = { pass: [], fail: [], na: [], unchecked: [] };
      const status = getA11yStatus(item);
      if (status === 'skip') return;
      const due = item.due_date
        ? (() => { const d = new Date(item.due_date! + 'T00:00:00'); return `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; })()
        : '';
      const entry = { text: item.text, assignee: item.assignee || '미지정', due };
      if (status === 'pass') map[group].pass.push(entry);
      else if (status === 'fail') map[group].fail.push(entry);
      else if (status === 'na') map[group].na.push(entry);
      else map[group].unchecked.push(entry);
    });

    return map;
  }, [a11yFiltered]);

  // ── 보고서 텍스트 생성 ──
  const generateReport = () => {
    if (!currentProject) return '';
    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const periodLabel = dateRange.from && dateRange.to
      ? `${dateRange.from} ~ ${dateRange.to}`
      : dateRange.from ? `${dateRange.from} 이후` : '전체 기간';

    const lines: string[] = [];
    lines.push(`[웹 접근성 주간 점검 보고]`);
    lines.push(`프로젝트명: ${currentProject.name}`);
    lines.push(`작성일: ${today}`);
    lines.push(`점검 기간: ${periodLabel}`);
    lines.push(`${'─'.repeat(54)}`);
    lines.push('');
    const completionPct = stats.total > 0 ? Math.round((stats.cumulativeDone / stats.total) * 100) : 0;
    lines.push(`■ 전체 진행 현황 (~${dateRange.to || '전체'})`);
    lines.push(`  - 현재 개선 완료 항목 ${stats.cumulativeDone}건 (${completionPct}%)`);
    lines.push(`  - 누적 미완료 오류: ${stats.cumulativeFail}건`);
    lines.push('');
    lines.push(`■ 금주 신규 조치 내역 (${periodLabel})`);
    lines.push(`  - 해당 기간 조치 완료: ${stats.periodDone}건`);
    lines.push(`  - 잔여 오류(미조치): ${stats.periodFail}건`);
    lines.push(`  - 진도율: 계획 ${stats.wbsPlannedPct}% / 실시 ${stats.wbsActualPct}%`);
    if (stats.periodNa > 0) lines.push(`  - 해당없음 처리: ${stats.periodNa}건`);
    if (stats.periodSkip > 0) lines.push(`  - 현행유지: ${stats.periodSkip}건 (완료 처리)`);
    lines.push('');

    const groups = Object.entries(groupedItems).filter(([, v]) => v.pass.length + v.fail.length + v.na.length + v.unchecked.length > 0);
    if (groups.length > 0) {
      lines.push(`■ 영역별 상세 조치 내역`);
      groups.forEach(([group, { pass, fail, na, unchecked }]) => {
        lines.push(``);
        lines.push(`  ▶ ${group}`);
        if (pass.length > 0) {
          lines.push(`    [조치 완료 - ${pass.length}건]`);
          [...new Set(pass.map(i => i.text))].forEach(text => lines.push(`      - ${text}`));
        }
        if (fail.length > 0) {
          lines.push(`    [미조치 오류 - ${fail.length}건]`);
          [...new Set(fail.map(i => i.text))].forEach(text => lines.push(`      - ${text}`));
        }
        if (na.length > 0) {
          lines.push(`    [해당없음 - ${na.length}건]`);
          [...new Set(na.map(i => i.text))].forEach(text => lines.push(`      - ${text}`));
        }
        if (unchecked.length > 0) {
          lines.push(`    [미점검 - ${unchecked.length}건]`);
          [...new Set(unchecked.map(i => i.text))].forEach(text => lines.push(`      - ${text}`));
        }
      });
    } else {
      lines.push(`■ 영역별 상세 조치 내역`);
      lines.push(`  - 선택한 기간에 조치일이 기록된 항목이 없습니다.`);
    }

    lines.push('');
    if (dateRange.to) {
      const nextFrom = new Date(dateRange.to + 'T00:00:00');
      nextFrom.setDate(nextFrom.getDate() + 1);
      const nextTo = new Date(dateRange.to + 'T00:00:00');
      nextTo.setDate(nextTo.getDate() + 7);
      const fmt2 = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      lines.push(`■ 차주 진행 계획 (${fmt2(nextFrom)} ~ ${fmt2(nextTo)})`);
      lines.push(`  [WBS 예정 항목]`);
      if (nextWeekWbsItems.length > 0) {
        nextWeekWbsItems.forEach((row: WbsRow) => {
          const taskName = row.task_l4 || row.task_l3 || row.task_l2 || row.task_l1 || '-';
          const due = row.plan_end
            ? (() => { const d = new Date(row.plan_end! + 'T00:00:00'); return `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; })()
            : '';
          const assignee = row.assignee ? ` (${row.assignee})` : '';
          const progress = row.plan_progress > 0 ? ` [계획 ${row.plan_progress}%]` : '';
          lines.push(`  - [${due}] ${taskName}${assignee}${progress}`);
        });
      } else {
        lines.push(`  - 차주 예정 WBS 항목 없음`);
      }
      lines.push('');
      lines.push(`  [이슈 사항]`);
      if (activeIssues.length > 0) {
        activeIssues.forEach(issue => {
          const due = issue.due_date
            ? (() => { const d = new Date(issue.due_date! + 'T00:00:00'); return ` (${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')})`; })()
            : '';
          const assignee = issue.assignee ? ` / ${issue.assignee}` : '';
          lines.push(`  - [${issue.status}] ${issue.title}${due}${assignee}`);
        });
      } else {
        lines.push(`  - 진행 중인 이슈 없음`);
      }
      lines.push('');
    }
    lines.push(`${'─'.repeat(54)}`);
    lines.push(`* 본 보고서는 PM Tool 접근성 점검 데이터(조치일 기준)를 바탕으로 자동 생성되었습니다.`);
    return lines.join('\n');
  };

const openSaveModal = () => {
    setWeekLabel(autoWeekLabel);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!weekLabel.trim() || !projectId) return;
    setIsSaving(true);
    const reportText = generateReport();
    try {
      // 클립보드 복사
      await navigator.clipboard.writeText(reportText);
      // DB 저장
      const res = await fetch('/api/weekly-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          week_label: weekLabel.includes('주차') ? weekLabel : `${weekLabel}주차`,
          period_from: dateRange.from || null,
          period_to: dateRange.to || null,
          report_text: reportText,
          cumulative_done: stats.cumulativeDone,
          cumulative_fail: stats.cumulativeFail,
          period_done: stats.periodDone,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast(`클립보드 복사 + ${weekLabel.includes('주차') ? weekLabel : `${weekLabel}주차`} 저장 완료!`);
      setShowModal(false);
      fetchSavedReports(projectId);
    } catch (e) {
      showToast('저장 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    const res = await fetch(`/api/weekly-reports?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('보고서가 삭제되었습니다.');
      fetchSavedReports(projectId);
    }
  };

  // ── 날짜 레이블 ──
  const periodLabel = dateRange.from && dateRange.to
    ? `${dateRange.from} ~ ${dateRange.to}`
    : dateRange.from ? `${dateRange.from} 이후` : '전체 기간';

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <AlertCircle className="w-10 h-10 text-[#8b95a1]" />
        <p className="text-sm text-[#4e5968]">프로젝트를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <section className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-heading text-[#191f28]">주간보고서 자동 생성기</h2>
          <p className="text-xs mt-0.5 text-[#8b95a1]">
            {currentProject.name} — 접근성 점검 데이터(조치일 기준)로 주간보고서를 자동 작성합니다.
          </p>
        </div>
        <button
          onClick={openSaveModal}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-[12px] font-semibold rounded-xl cursor-pointer shadow transition-all shrink-0"
        >
          <ClipboardCopy className="w-3.5 h-3.5" />
          보고서 저장
        </button>
      </div>

      {/* 날짜 필터 카드 */}
      <div className="bg-white border border-[#e8ecf3] rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-3.5 h-3.5 text-[#3182f6]" />
          <span className="text-[12.5px] font-bold text-[#3a4358]">점검 기간 선택</span>
          <span className="text-[11px] text-[#9aa2b3] font-medium">— 조치일(N열) 기준</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['thisWeek', 'lastWeek', 'thisMonth', 'all'] as const).map(preset => {
            const labels = { thisWeek: '이번 주', lastWeek: '지난 주', thisMonth: '이번 달', all: '전체' };
            return (
              <button key={preset} onClick={() => applyPreset(preset)}
                className={`text-[11.5px] font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                  isActivePreset(preset)
                    ? 'bg-[#3182f6] border-[#3182f6] text-white shadow-sm'
                    : 'bg-white border-[#e3e7ef] text-[#5a6478] hover:border-[#b0b8c9]'
                }`}>
                {labels[preset]}
              </button>
            );
          })}
          <div className="w-px h-5 bg-[#e3e7ef] mx-0.5" />
          <div className="flex items-center gap-1.5 font-sans">
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

      {dataLoading ? (
        <div className="flex flex-col items-center justify-center p-20 gap-4 bg-white border border-[#e5e8eb] rounded-2xl">
          <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
          <span className="text-xs text-[#8b95a1]">데이터를 불러오는 중...</span>
        </div>
      ) : (
        <>
          {/* KPI 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* 전체 */}
            <div className="bg-white border border-[#e8ecf3] rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-1.5 mb-2">
                <FileText className="w-3.5 h-3.5 text-[#3182f6]" />
                <span className="text-[10.5px] font-semibold text-[#8a93a5] uppercase tracking-wide">전체 항목</span>
              </div>
              <div className="text-[28px] font-extrabold text-[#1a2030]">{stats.total}</div>
              <div className="text-[11px] text-[#9aa2b3] mt-0.5">전체 점검 대상</div>
            </div>
            {/* 누적 조치 완료 */}
            <div className="bg-[#f0faf5] border border-[#c8e8d8] rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#178055]" />
                <span className="text-[10.5px] font-semibold text-[#1a8a5a] uppercase tracking-wide">누적 완료</span>
              </div>
              <div className="text-[28px] font-extrabold text-[#178055]">{stats.cumulativeDone}</div>
              <div className="text-[11px] text-[#4aaa7a] mt-0.5">~{dateRange.to || '전체'} 조치일 기준</div>
            </div>
            {/* 기간 내 미조치 오류 */}
            <div className="bg-[#fdf1f3] border border-[#f0c0cb] rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-1.5 mb-2">
                <XCircle className="w-3.5 h-3.5 text-[#d11d44]" />
                <span className="text-[10.5px] font-semibold text-[#c81e44] uppercase tracking-wide">미조치 오류</span>
              </div>
              <div className="text-[28px] font-extrabold text-[#d11d44]">{stats.periodFail}</div>
              <div className="text-[11px] text-[#e06070] mt-0.5">{periodLabel}</div>
            </div>
            {/* 누적 완료율 */}
            <div className="bg-white border border-[#e8ecf3] rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="w-3.5 h-3.5 text-[#6b7488]" />
                <span className="text-[10.5px] font-semibold text-[#8a93a5] uppercase tracking-wide">누적 완료율</span>
              </div>
              <div className="text-[28px] font-extrabold text-[#1a2030]">
                {stats.total > 0 ? Math.round((stats.cumulativeDone / stats.total) * 100) : 0}%
              </div>
              <div className="text-[11px] text-[#9aa2b3] mt-0.5">{stats.cumulativeDone} / {stats.total}건</div>
            </div>
          </div>

          {/* 기간 내 항목이 없을 때 */}
          {stats.periodTotal === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 bg-white border border-[#e8ecf3] rounded-2xl gap-3">
              <AlertCircle className="w-9 h-9 text-[#c5cad6]" />
              <div className="text-center">
                <p className="text-[13px] font-semibold text-[#5a6478]">선택 기간에 조치일이 기록된 항목이 없습니다.</p>
                <p className="text-[11.5px] text-[#9aa2b3] mt-1">다른 기간을 선택하거나, 접근성 점검 시트에서 조치일(N열)을 입력 후 동기화해 주세요.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

              {/* 영역별 상세 카드 */}
              <section className="bg-white border border-[#e8ecf3] rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#eef1f6] bg-[#fafbfd]">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-extrabold text-[#1a2030]">영역별 조치 내역</span>
                    <span className="text-[11px] text-[#9aa2b3]">{periodLabel}</span>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#e6f6ee] text-[#178055]">
                    완료 {stats.periodDone}건
                  </span>
                </div>
                <div className="overflow-y-auto max-h-[600px]">
                  {Object.entries(groupedItems)
                    .filter(([, v]) => v.pass.length + v.fail.length + v.na.length + v.unchecked.length > 0)
                    .map(([group, { pass, fail, na, unchecked }]) => {
                      const isOpen = expandedGroups.has(group);
                      return (
                        <div key={group}>
                          {/* 그룹 헤더 — 아코디언 토글 */}
                          <button
                            onClick={() => toggleGroup(group)}
                            className="w-full flex items-center justify-between px-4 py-2.5 bg-[#f4f6fa] border-b border-[#eef1f6] sticky top-0 z-10 hover:bg-[#edf0f7] transition-colors cursor-pointer text-left">
                            <div className="flex items-center gap-2 min-w-0">
                              <ChevronDown className={`w-3.5 h-3.5 text-[#8a93a5] shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
                              <span className="text-[11.5px] font-bold text-[#3a4358] truncate">{group}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {pass.length > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#e6f6ee] text-[#178055]">완료 {pass.length}</span>}
                              {fail.length > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#fdeaee] text-[#d11d44]">오류 {fail.length}</span>}
                              {na.length > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#fff7ec] text-[#c47e10]">해당없음 {na.length}</span>}
                              {unchecked.length > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#eef0f5] text-[#5a6478]">미점검 {unchecked.length}</span>}
                            </div>
                          </button>
                          {/* 항목 — 아코디언 바디 */}
                          {isOpen && [
                            ...pass.map(i => ({ ...i, status: 'pass' as const })),
                            ...fail.map(i => ({ ...i, status: 'fail' as const })),
                            ...na.map(i => ({ ...i, status: 'na' as const })),
                            ...unchecked.map(i => ({ ...i, status: 'unchecked' as const })),
                          ].map((item, idx) => {
                            const statusConfig = {
                              pass:      { label: '완료',    color: '#178055', bg: '#e6f6ee' },
                              fail:      { label: '오류',    color: '#d11d44', bg: '#fdeaee' },
                              na:        { label: '해당없음', color: '#c47e10', bg: '#fff7ec' },
                              unchecked: { label: '미점검',  color: '#5a6478', bg: '#eef0f5' },
                            }[item.status];
                            return (
                              <div key={idx} className="flex items-start gap-3 px-4 py-2.5 border-b border-[#f4f6fa] hover:bg-[#fafbfd] transition-colors">
                                <span style={{ color: statusConfig.color, backgroundColor: statusConfig.bg }}
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 whitespace-nowrap">
                                  {statusConfig.label}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11.5px] font-semibold text-[#22304a] leading-snug">{item.text}</p>
                                  {item.assignee !== '미지정' && (
                                    <span className="text-[10.5px] text-[#9aa2b3]">{item.assignee}</span>
                                  )}
                                </div>
                                {item.due && (
                                  <span className="text-[10.5px] text-[#b0b8c9] font-medium shrink-0">{item.due}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                </div>
              </section>

              {/* 보고서 텍스트 미리보기 */}
              <section className="bg-white border border-[#e8ecf3] rounded-2xl shadow-sm overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#eef1f6] bg-[#fafbfd]">
                  <span className="text-[13.5px] font-extrabold text-[#1a2030]">보고서 미리보기</span>
                  <button onClick={() => { navigator.clipboard.writeText(generateReport()); showToast('클립보드에 복사되었습니다.'); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3182f6] hover:bg-[#1b64da] text-white text-[11px] font-semibold rounded-lg cursor-pointer transition-all">
                    <ClipboardCopy className="w-3 h-3" /> 복사
                  </button>
                </div>
                <pre className="text-[11.5px] font-mono text-[#3a4358] leading-relaxed p-5 overflow-y-auto max-h-[600px] whitespace-pre-wrap selection:bg-[#3182f6]/20 bg-[#fafbfd]">
                  {generateReport()}
                </pre>
              </section>

            </div>
          )}
        </>
      )}

      {/* ── 저장된 보고서 이력 ── */}
      {savedReports.length > 0 && (
        <section className="bg-white border border-[#e8ecf3] rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[#eef1f6] bg-[#fafbfd]">
            <BookmarkCheck className="w-4 h-4 text-[#3182f6]" />
            <span className="text-[13.5px] font-extrabold text-[#1a2030]">저장된 주간보고서</span>
            <span className="text-[11px] font-semibold text-[#9aa2b3] bg-[#f2f4f9] px-2 py-0.5 rounded-md ml-auto">
              {savedReports.length}건
            </span>
          </div>
          <div className="divide-y divide-[#f1f3f8]">
            {savedReports.map(r => {
              const createdAt = new Date(r.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              const period = r.period_from && r.period_to ? `${r.period_from} ~ ${r.period_to}` : r.period_from || '기간 미지정';
              return (
                <div key={r.id} onClick={() => setViewReport(r)}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-[#f4f7ff] transition-colors cursor-pointer">
                  {/* 주차 배지 */}
                  <div className="w-14 h-14 rounded-xl bg-[#eef3ff] border border-[#c8d8f8] flex flex-col items-center justify-center shrink-0">
                    <span className="text-[18px] font-extrabold text-[#3182f6] leading-none">{r.week_label.replace('주차', '')}</span>
                    <span className="text-[9px] font-bold text-[#6b9ce8] mt-0.5">주차</span>
                  </div>
                  {/* 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] font-bold text-[#1a2030]">{r.week_label} 보고서</span>
                      <span className="text-[10.5px] text-[#9aa2b3]">{createdAt} 저장</span>
                    </div>
                    <div className="text-[11px] text-[#6b7488] font-medium">점검 기간: {period}</div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-[#e6f6ee] text-[#178055]">누적완료 {r.cumulative_done}건</span>
                      <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-[#fdeaee] text-[#d11d44]">미조치 {r.cumulative_fail}건</span>
                      <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-[#eef3ff] text-[#3182f6]">금주 +{r.period_done}건</span>
                    </div>
                  </div>
                  {/* 액션 */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(r.report_text); showToast('클립보드에 복사됐습니다.'); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold border border-[#e3e7ef] rounded-lg text-[#5a6478] hover:border-[#3182f6] hover:text-[#3182f6] transition-all cursor-pointer">
                      <ClipboardCopy className="w-3 h-3" /> 복사
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteReport(r.id); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold border border-[#e3e7ef] rounded-lg text-[#9aa2b3] hover:border-[#d11d44] hover:text-[#d11d44] transition-all cursor-pointer">
                      <Trash2 className="w-3 h-3" /> 삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 저장 모달 ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
            <button onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f2f4f9] text-[#9aa2b3] cursor-pointer transition-colors">
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[#eef3ff] flex items-center justify-center">
                <BookmarkCheck className="w-5 h-5 text-[#3182f6]" />
              </div>
              <div>
                <h3 className="text-[15px] font-extrabold text-[#1a2030]">주간보고서 저장</h3>
                <p className="text-[11.5px] text-[#9aa2b3] mt-0.5">클립보드에 복사되고 DB에 저장됩니다</p>
              </div>
            </div>

            {/* 점검 기간 */}
            <div className="bg-[#f8f9fc] border border-[#e8ecf3] rounded-xl p-3.5 mb-4">
              <div className="text-[10.5px] font-semibold text-[#9aa2b3] mb-1">점검 기간</div>
              <div className="text-[12.5px] font-bold text-[#3a4358]">
                {dateRange.from && dateRange.to ? `${dateRange.from} ~ ${dateRange.to}` : dateRange.from || '전체 기간'}
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-[10.5px] px-2 py-0.5 rounded-md bg-[#e6f6ee] text-[#178055] font-semibold">누적완료 {stats.cumulativeDone}건</span>
                <span className="text-[10.5px] px-2 py-0.5 rounded-md bg-[#fdeaee] text-[#d11d44] font-semibold">미조치 {stats.cumulativeFail}건</span>
                <span className="text-[10.5px] px-2 py-0.5 rounded-md bg-[#eef3ff] text-[#3182f6] font-semibold">금주 +{stats.periodDone}건</span>
              </div>
            </div>

            {/* 주차 선택 */}
            <div className="mb-5">
              <label className="block text-[12px] font-bold text-[#3a4358] mb-2">주차 선택</label>
              <div className="grid grid-cols-5 gap-1.5 mb-3">
                {Array.from({ length: 20 }, (_, i) => String(i + 1)).map(n => (
                  <button key={n} onClick={() => setWeekLabel(n)}
                    className={`text-[11.5px] font-bold py-1.5 rounded-lg border transition-all cursor-pointer ${
                      weekLabel === n ? 'bg-[#3182f6] border-[#3182f6] text-white' : 'bg-white border-[#e3e7ef] text-[#5a6478] hover:border-[#3182f6]'
                    }`}>
                    {n}주
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="text" value={weekLabel}
                  onChange={e => setWeekLabel(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="주차 번호 직접 입력"
                  className="flex-1 text-[12px] border border-[#e3e7ef] rounded-lg px-3 py-2 text-[#3a4358] outline-none focus:border-[#3182f6] transition-colors font-semibold" />
                <span className="text-[12px] text-[#6b7488] font-semibold shrink-0">주차</span>
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-2.5">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 text-[12.5px] font-semibold border border-[#e3e7ef] rounded-xl text-[#5a6478] hover:border-[#b0b8c9] cursor-pointer transition-all">
                취소
              </button>
              <button onClick={handleSave} disabled={!weekLabel.trim() || isSaving}
                className="flex-[2] py-2.5 px-6 text-[12.5px] font-bold bg-[#3182f6] hover:bg-[#1b64da] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2">
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                {isSaving ? '저장 중...' : '복사 & 저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 보고서 상세 뷰 모달 ── */}
      {viewReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setViewReport(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col z-10 max-h-[90vh]">
            {/* 헤더 */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-[#eef1f6] shrink-0">
              <div className="w-10 h-10 rounded-xl bg-[#eef3ff] border border-[#c8d8f8] flex flex-col items-center justify-center shrink-0">
                <span className="text-[15px] font-extrabold text-[#3182f6] leading-none">{viewReport.week_label.replace('주차', '')}</span>
                <span className="text-[8px] font-bold text-[#6b9ce8]">주차</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-extrabold text-[#1a2030]">{viewReport.week_label} 보고서</h3>
                <p className="text-[11px] text-[#9aa2b3] mt-0.5">
                  {viewReport.period_from && viewReport.period_to
                    ? `${viewReport.period_from} ~ ${viewReport.period_to}`
                    : viewReport.period_from || '기간 미지정'}
                  {' · '}
                  {new Date(viewReport.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 저장
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { navigator.clipboard.writeText(viewReport.report_text); showToast('클립보드에 복사됐습니다.'); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-semibold bg-[#3182f6] hover:bg-[#1b64da] text-white rounded-lg cursor-pointer transition-all">
                  <ClipboardCopy className="w-3.5 h-3.5" /> 복사
                </button>
                <button onClick={() => setViewReport(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f2f4f9] text-[#9aa2b3] cursor-pointer transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 통계 배지 */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-[#f1f3f8] bg-[#fafbfd] shrink-0">
              <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-md bg-[#e6f6ee] text-[#178055]">누적완료 {viewReport.cumulative_done}건</span>
              <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-md bg-[#fdeaee] text-[#d11d44]">미조치 {viewReport.cumulative_fail}건</span>
              <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-md bg-[#eef3ff] text-[#3182f6]">금주 +{viewReport.period_done}건</span>
            </div>

            {/* 보고서 본문 */}
            <pre className="text-[12px] font-mono text-[#3a4358] leading-relaxed p-6 overflow-y-auto whitespace-pre-wrap selection:bg-[#3182f6]/20">
              {viewReport.report_text}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
