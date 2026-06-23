'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProject } from '../../../../context/ProjectContext';
import { supabase } from '../../../../lib/supabaseClient';
import { FileSpreadsheet, Loader2, ExternalLink, ChevronRight, AlertCircle } from 'lucide-react';

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

export default function ProjectWbsPage() {
  const params = useParams();
  const projectSlug = (params?.slug as string) || '';
  
  const { projects, showToast, fetchProjects } = useProject();
  const currentProject = projects.find(p => p.slug === projectSlug);
  const activeProjectName = currentProject?.name || '';
  const projectId = currentProject?.id || '';

  // Local State
  const [wbsRows, setWbsRows] = useState<WBSRow[]>([]);
  const [wbsLoading, setWbsLoading] = useState(false);
  const [wbsSavingId, setWbsSavingId] = useState<string | null>(null);
  const [wbsViewMode, setWbsViewMode] = useState<'table' | 'sheet' | 'gantt'>('table');
  const [editingSheetUrl, setEditingSheetUrl] = useState(false);
  const [sheetUrlInput, setSheetUrlInput] = useState('');

  // Extract date range from WBS rows
  const ganttDates = React.useMemo(() => {
    let minDateStr = '';
    let maxDateStr = '';

    wbsRows.forEach(row => {
      // actual_start, actual_end 날짜는 차트 기간 계산에서 제외하고 plan_start, plan_end만으로 범위를 계산합니다.
      const dates = [row.plan_start, row.plan_end].filter(Boolean) as string[];
      dates.forEach(d => {
        if (!minDateStr || d < minDateStr) minDateStr = d;
        if (!maxDateStr || d > maxDateStr) maxDateStr = d;
      });
    });

    if (!minDateStr || !maxDateStr) {
      const today = new Date();
      const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const twoMonthsLater = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      
      const formatDate = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };

      minDateStr = formatDate(threeMonthsAgo);
      maxDateStr = formatDate(twoMonthsLater);
    }

    const minDate = new Date(minDateStr);
    const maxDate = new Date(maxDateStr);
    
    const diffTime = Math.abs(maxDate.getTime() - minDate.getTime());
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    return {
      minDateStr,
      maxDateStr,
      minDate,
      maxDate,
      totalDays
    };
  }, [wbsRows]);

  const ganttTimeline = React.useMemo(() => {
    const { minDate, totalDays } = ganttDates;
    const timelineWeeks: { weekNum: number; label: string; dateRange: string; leftPercent: number; widthPercent: number }[] = [];
    const timelineMonths: { year: number; month: number; label: string; leftPercent: number; widthPercent: number }[] = [];

    const fmtMD = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

    const numWeeks = Math.ceil(totalDays / 7);
    for (let i = 0; i < numWeeks; i++) {
      const startDayIdx = i * 7;
      const endDayIdx = Math.min(startDayIdx + 6, totalDays - 1);
      const leftPercent = (startDayIdx / totalDays) * 100;
      const widthPercent = (Math.min(7, totalDays - startDayIdx) / totalDays) * 100;

      const weekStart = new Date(minDate);
      weekStart.setDate(minDate.getDate() + startDayIdx);
      const weekEnd = new Date(minDate);
      weekEnd.setDate(minDate.getDate() + endDayIdx);

      timelineWeeks.push({
        weekNum: i + 1,
        label: `W${i + 1}`,
        dateRange: `${fmtMD(weekStart)} ~ ${fmtMD(weekEnd)}`,
        leftPercent,
        widthPercent
      });
    }

    let currentDay = new Date(minDate);
    const endDay = new Date(ganttDates.maxDate);
    
    let currentMonthStart = new Date(currentDay);
    let daysInMonth = 0;
    
    while (currentDay <= endDay) {
      daysInMonth++;
      
      const nextDay = new Date(currentDay);
      nextDay.setDate(currentDay.getDate() + 1);
      
      if (nextDay.getMonth() !== currentDay.getMonth() || nextDay > endDay) {
        const startDiff = (currentMonthStart.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
        const leftPercent = (startDiff / totalDays) * 100;
        const widthPercent = (daysInMonth / totalDays) * 100;
        
        timelineMonths.push({
          year: currentMonthStart.getFullYear(),
          month: currentMonthStart.getMonth() + 1,
          label: `${currentMonthStart.getMonth() + 1}월`,
          leftPercent,
          widthPercent
        });
        
        currentMonthStart = new Date(nextDay);
        daysInMonth = 0;
      }
      
      currentDay = nextDay;
    }

    return {
      weeks: timelineWeeks,
      months: timelineMonths
    };
  }, [ganttDates]);

  const todayPercent = React.useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const { minDate, maxDate, totalDays } = ganttDates;
    
    if (today < minDate || today > maxDate) return null;
    
    const diffTime = today.getTime() - minDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return (diffDays / totalDays) * 100;
  }, [ganttDates]);

  const getGanttPosition = React.useCallback((startStr: string | null, endStr: string | null) => {
    if (!startStr || !endStr) return null;
    const { minDate, totalDays } = ganttDates;
    const start = new Date(startStr);
    const end = new Date(endStr);
    
    const clampStart = start < minDate ? minDate : start;
    const clampEnd = end > ganttDates.maxDate ? ganttDates.maxDate : end;
    
    if (clampStart > clampEnd) return null;
    
    const leftDiff = (clampStart.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
    const spanDiff = (clampEnd.getTime() - clampStart.getTime()) / (1000 * 60 * 60 * 24) + 1;
    
    return {
      left: (leftDiff / totalDays) * 100,
      width: (spanDiff / totalDays) * 100
    };
  }, [ganttDates]);



  // 1. Fetch WBS Rows
  const fetchWbs = useCallback(async (pId: string) => {
    if (!pId) return;
    setWbsLoading(true);
    try {
      const { data, error } = await supabase
        .from('wbs_rows')
        .select('*')
        .eq('project_id', pId)
        .order('row_order', { ascending: true });
      if (error) throw error;
      setWbsRows(data || []);
    } catch (err: any) {
      console.error('WBS fetch error:', err.message);
      showToast('WBS 데이터를 불러오지 못했습니다.');
    } finally {
      setWbsLoading(false);
    }
  }, [showToast]);

  // Load WBS rows on mounting or changing projectId
  useEffect(() => {
    if (projectId) {
      fetchWbs(projectId);
      setSheetUrlInput(currentProject?.wbs_sheet_url || '');
    }
  }, [projectId, fetchWbs, currentProject?.wbs_sheet_url]);

  // 2. Save Sheet URL
  const handleSaveSheetUrl = async (pId: string, url: string) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ wbs_sheet_url: url || null })
        .eq('id', pId);

      if (error) throw error;
      showToast('구글 WBS 시트 주소가 연동되었습니다.');
      await fetchProjects(); // Refresh project info globally
      setEditingSheetUrl(false);
    } catch (err: any) {
      console.error(err);
      showToast('주소 저장 중 오류가 발생했습니다.');
    }
  };

  // 3. Seeding initial WBS rows
  const initializeWbs = async (pId: string, pName: string) => {
    try {
      const wbsInitialData = [
        { project_id: pId, row_order: 1, level: 1, task_l1: '1. 프로젝트 착수', task_l2: '', task_l3: '', task_l4: '', description: '프로젝트 킥오프 및 요구사항 확인' },
        { project_id: pId, row_order: 2, level: 2, task_l1: '', task_l2: '요구사항 분석', task_l3: '', task_l4: '', description: '기능 정의서 작성' },
        { project_id: pId, row_order: 3, level: 1, task_l1: '2. 디자인 및 기획', task_l2: '', task_l3: '', task_l4: '', description: 'UI/UX 디자인' },
        { project_id: pId, row_order: 4, level: 2, task_l1: '', task_l2: '화면 설계', task_l3: '', task_l4: '', description: '화면 설계서 작성' },
        { project_id: pId, row_order: 5, level: 1, task_l1: '3. 개발', task_l2: '', task_l3: '', task_l4: '', description: '프론트/백엔드 개발' },
        { project_id: pId, row_order: 6, level: 1, task_l1: '4. 테스트 및 접근성 심사', task_l2: '', task_l3: '', task_l4: '', description: '접근성 검사 및 보완 조치' },
      ];

      const { error } = await supabase
        .from('wbs_rows')
        .insert(wbsInitialData);

      if (error) throw error;
      showToast('기본 WBS 테이블 생성에 성공했습니다.');
    } catch (err: any) {
      console.error('Error seeding WBS:', err.message);
      showToast('기본 WBS 테이블 생성에 실패했습니다.');
    }
  };

  // Realtime subscription for WBS rows
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`realtime-wbs-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wbs_rows',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          fetchWbs(projectId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, fetchWbs]);

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-text-muted">
        <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
        <span className="text-xs">프로젝트 정보를 불러오고 있습니다...</span>
      </div>
    );
  }

  const hasUrl = !!currentProject.wbs_sheet_url;

  return (
    <section className="animate-fade-in flex flex-col" style={{ minHeight: 0 }}>
      {/* Header toolbar */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h2 className="text-lg font-bold font-heading" style={{ color: '#191f28' }}>WBS 일정표</h2>
          <p className="text-xs mt-0.5" style={{ color: '#8b95a1' }}>
            {activeProjectName ? `${activeProjectName} — ` : ''}구글 시트 WBS 기반 프로젝트 일정 관리
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-[#f2f4f6] rounded-lg p-1">
            <button
              onClick={() => setWbsViewMode('table')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${wbsViewMode === 'table' ? 'bg-white text-[#3182f6] shadow-sm' : 'text-[#8b95a1] hover:text-[#4e5968]'}`}
            >
              내부 WBS 테이블
            </button>
            <button
              onClick={() => setWbsViewMode('sheet')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${wbsViewMode === 'sheet' ? 'bg-white text-[#3182f6] shadow-sm' : 'text-[#8b95a1] hover:text-[#4e5968]'}`}
            >
              구글 시트 연동 뷰
            </button>
            <button
              onClick={() => setWbsViewMode('gantt')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${wbsViewMode === 'gantt' ? 'bg-white text-[#3182f6] shadow-sm' : 'text-[#8b95a1] hover:text-[#4e5968]'}`}
            >
              전체 일정 (Gantt)
            </button>
          </div>
          {wbsSavingId && wbsViewMode === 'table' && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-xl animate-pulse"
              style={{ backgroundColor: '#eff6ff', color: '#3182f6' }}>
              저장 중...
            </span>
          )}
        </div>
      </div>

      {/* Main Connection / Data Panel */}
      {(() => {
        // 1. URL이 없거나 수정 모드일 때
        if (!hasUrl || editingSheetUrl) {
          const templateUri = "https://docs.google.com/spreadsheets/d/16lGiOWfQhGhGuVdHnP6pqhNeuJ3_GXUFwYeUTXyBH5M/copy";
          return (
            <div className="text-center p-10 rounded-2xl max-w-2xl mx-auto" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e8eb', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div className="text-[#3182f6] mb-4 flex justify-center"><FileSpreadsheet className="w-12 h-12" /></div>
              <h4 className="font-bold text-[#191f28] mb-2 text-base">구글 WBS 시트 연동이 필요합니다</h4>
              <p className="text-xs text-[#4e5968] mb-6 leading-relaxed">
                구글 드라이브 보안 정책상 새로 복사된 본인 사본의 고유 URL은 자동으로 전달되지 않습니다.<br />
                아래 3단계 절차에 따라 최초 1회 연동을 완료해 주세요.
              </p>

              {/* 3단계 가이드 프로세스 */}
              <div className="grid grid-cols-3 gap-3 mb-6 text-left">
                <div className="p-3.5 rounded-xl bg-[#f2f4f6] border border-[#e5e8eb]">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-5 h-5 flex items-center justify-center rounded-full bg-[#3182f6] text-white text-[10px] font-bold">1</span>
                    <span className="text-[11px] font-bold text-[#191f28]">사본 만들기</span>
                  </div>
                  <p className="text-[10px] text-[#4e5968] leading-relaxed">
                    아래 카드의 **[사본 만들기]** 버튼을 눌러 개인 드라이브에 시트를 복제합니다.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#f2f4f6] border border-[#e5e8eb]">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-5 h-5 flex items-center justify-center rounded-full bg-[#3182f6] text-white text-[10px] font-bold">2</span>
                    <span className="text-[11px] font-bold text-[#191f28]">시트 URL 복사</span>
                  </div>
                  <p className="text-[10px] text-[#4e5968] leading-relaxed">
                    복제된 시트 화면 상단의 **웹 브라우저 주소(URL)**를 전체 복사합니다.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#f2f4f6] border border-[#e5e8eb]">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-5 h-5 flex items-center justify-center rounded-full bg-[#3182f6] text-white text-[10px] font-bold">3</span>
                    <span className="text-[11px] font-bold text-[#191f28]">이곳에 등록</span>
                  </div>
                  <p className="text-[10px] text-[#4e5968] leading-relaxed">
                    아래 입력 필드에 주소를 붙여넣은 뒤 **[연동 및 저장]**을 누르면 연동 끝!
                  </p>
                </div>
              </div>
              
              {/* Apps Script 동기화 안내 */}
              <div className="mb-6 p-4 rounded-xl bg-[#fffbeb] border border-[#fcd34d] text-left">
                <div className="flex items-start gap-2.5">
                  <span className="text-[#d97706] text-sm shrink-0 mt-0.5">⚡</span>
                  <div>
                    <p className="text-xs font-bold text-[#92400e] mb-1">연동 후 데이터 동기화 방법</p>
                    <p className="text-[11px] text-[#78350f] leading-relaxed">
                      사본 시트를 등록한 후에도 <strong>데이터는 자동으로 반영되지 않습니다.</strong><br />
                      구글 시트에서 데이터를 입력·수정한 뒤, 시트 상단 메뉴에서<br />
                      <strong>[🔄 WBS 동기화] → [DB로 동기화 실행]</strong> 을 클릭하면 앱에 데이터가 전송됩니다.
                    </p>
                  </div>
                </div>
              </div>

              {/* 템플릿 바로가기 카드 */}
              <div className="mb-6 p-4 rounded-xl bg-[#f9fafb] border border-[#e5e8eb] text-left">
                <div className="flex justify-between items-center gap-4">
                  <div>
                    <p className="text-xs font-bold text-[#191f28] mb-1">WBS 표준 구글 시트 템플릿</p>
                    <p className="text-[11px] text-[#8b95a1] leading-normal">
                      버튼을 클릭하면 사본 생성 확인 페이지로 이동합니다. **[사본 만들기]** 버튼을 누르시면 본인의 구글 드라이브에 시트가 즉시 복제됩니다.
                    </p>
                  </div>
                  <a
                    href={templateUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    사본 만들기 ↗
                  </a>
                </div>
              </div>

              {/* 주소 등록 입력 폼 */}
              <div className="flex flex-col gap-2 max-w-lg mx-auto text-left">
                <label className="text-[11px] font-bold text-[#4e5968] ml-0.5">복사한 구글 시트 URL 입력</label>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={sheetUrlInput}
                    onChange={(e) => setSheetUrlInput(e.target.value)}
                    className="flex-1 bg-white border border-[#e5e8eb] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#3182f6]"
                    style={{ color: '#191f28' }}
                  />
                  <button 
                    onClick={() => handleSaveSheetUrl(projectId, sheetUrlInput)} 
                    className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                  >
                    연동 및 저장
                  </button>
                  {hasUrl && (
                    <button 
                      onClick={() => setEditingSheetUrl(false)} 
                      className="px-4 py-2 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                    >
                      취소
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        }

        // 2. 구글 시트 연동 Iframe 연결 뷰
        if (wbsViewMode === 'sheet') {
          const sheetUrl = currentProject.wbs_sheet_url || '';
          return (
            <div className="text-center p-16 rounded-2xl max-w-2xl mx-auto"
              style={{ backgroundColor: '#ffffff', border: '1px solid #e5e8eb', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div className="text-[#3182f6] mb-4 flex justify-center"><ExternalLink className="w-12 h-12" /></div>
              <h4 className="font-bold text-[#191f28] mb-2 text-base">구글 스프레드시트 WBS가 연동되어 있습니다</h4>
              <p className="text-xs text-[#8b95a1] mb-6 max-w-md mx-auto leading-relaxed">
                WBS 일정 관리는 연동된 구글 시트에서 실시간으로 이루어집니다.<br />아래 버튼을 클릭하여 새 창에서 시트를 열고 편집해 주세요.
              </p>
              <div className="flex items-center justify-center gap-3">
                <a 
                  href={sheetUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  구글 WBS 시트 열기 ↗
                </a>
                <button 
                  onClick={() => { setSheetUrlInput(currentProject.wbs_sheet_url || ''); setEditingSheetUrl(true); }} 
                  className="px-4 py-2.5 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  연동 주소 수정
                </button>
              </div>
            </div>
          );
        }

        // 2.5. WBS 종합 간트 차트 뷰
        if (wbsViewMode === 'gantt') {
          if (wbsLoading) {
            return (
              <div className="text-center p-20 rounded-2xl text-xs bg-white border border-[#e5e8eb]">
                <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin mx-auto mb-2" />
                간트 차트 로딩 중...
              </div>
            );
          }

          const hasValidDates = wbsRows.some(row => row.plan_start && row.plan_end);
          if (wbsRows.length === 0 || !hasValidDates) {
            return (
              <div className="text-center p-16 rounded-2xl bg-white border border-dashed border-[#e5e8eb]">
                <p className="text-sm font-semibold mb-2" style={{ color: '#4e5968' }}>표시할 일정 데이터가 없습니다</p>
                <p className="text-xs" style={{ color: '#8b95a1' }}>
                  WBS 테이블에 계획 시작일과 종료일이 등록된 업무 항목이 있으면 자동으로 간트 차트가 구성됩니다.
                </p>
              </div>
            );
          }

          const { minDateStr, maxDateStr, totalDays } = ganttDates;
          const { weeks, months } = ganttTimeline;

          // Phase 및 주요 마일스톤 분류 (Level 3 이하만 추출)
          const phases = wbsRows.filter(r => r.level === 1);

          // Phase에 plan_start/plan_end가 없으면 하위 태스크 날짜 범위로 자동 계산
          const phasesComputed = phases.map(ph => {
            if (ph.plan_start && ph.plan_end) return ph;
            const phIdx = wbsRows.findIndex(w => w.id === ph.id);
            const nextL1Idx = wbsRows.findIndex((w, i) => i > phIdx && w.level === 1);
            const children = wbsRows.filter((_, i) =>
              i > phIdx && (nextL1Idx === -1 || i < nextL1Idx) && wbsRows[i].plan_start && wbsRows[i].plan_end
            );
            if (children.length === 0) return ph;
            const minStart = children.reduce((min, c) => (c.plan_start! < min ? c.plan_start! : min), children[0].plan_start!);
            const maxEnd = children.reduce((max, c) => (c.plan_end! > max ? c.plan_end! : max), children[0].plan_end!);
            return { ...ph, plan_start: minStart, plan_end: maxEnd };
          });
          // 마일스톤: 명시적 키워드이거나 plan_start == plan_end(단일 시점 이벤트)인 행
          const MILESTONE_KEYWORDS = ['마일스톤', 'milestone', '킥오프', 'kick-off', 'kickoff'];
          const isMilestoneRow = (row: WBSRow) => {
            if (row.level === 1 || row.level > 3) return false;
            const taskText = (row.task_l1 || row.task_l2 || row.task_l3 || row.task_l4 || '').toLowerCase();
            const hasKeyword = MILESTONE_KEYWORDS.some(k => taskText.includes(k));
            const isSingleDay = !!row.plan_start && row.plan_start === row.plan_end;
            return (hasKeyword || isSingleDay) && !!row.plan_start;
          };
          const milestones = wbsRows.filter(isMilestoneRow);

          // 일반 태스크 (Level 3 이하이면서 Phase와 마일스톤이 아닌, 날짜가 있는 하위 업무들)
          const tasks = wbsRows.filter(row => {
            if (row.level === 1 || row.level > 3) return false;
            return !isMilestoneRow(row) && !!row.plan_start && !!row.plan_end;
          });

          return (
            <div className="bg-white rounded-2xl border border-[#e5e8eb] shadow-sm overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 220px)' }}>
              {/* 기간 정보 요약 */}
              <div className="px-6 py-4 border-b border-[#e5e8eb] bg-[#f9fafb] flex items-center justify-between">
                <span className="text-xs font-semibold text-[#4e5968]">
                  📅 프로젝트 전체 일정 범위: <span className="text-[#3182f6]">{minDateStr}</span> ~ <span className="text-[#3182f6]">{maxDateStr}</span> ({totalDays}일)
                </span>
                <span className="text-[11px] text-[#8b95a1]">
                  * 구글 시트 데이터 연동에 따라 실시간으로 타임라인 범위를 계산합니다.
                </span>
              </div>

              {/* 간트 차트 컨테이너 */}
              <div className="overflow-auto flex-1 relative">
                <div className="min-w-[1100px] relative flex flex-col" style={{ minHeight: '400px' }}>
                  
                  {/* Grid Layout: Left (260px) | Right (1fr) */}
                  <div className="flex border-b border-[#e5e8eb] bg-[#f9fafb] sticky top-0 z-20">
                    <div className="w-[260px] shrink-0 border-r border-[#e5e8eb] p-3 flex items-end font-bold text-[#191f28] text-xs">
                      구분 / 태스크
                    </div>
                    {/* 시간 축 영역 */}
                    <div className="flex-1 relative flex flex-col text-xs text-[#4e5968]">
                      {/* 1단: 월 헤더 */}
                      <div className="flex border-b border-[#e5e8eb] h-8 relative">
                        {months.map((m, idx) => (
                          <div
                            key={idx}
                            className="h-full border-r border-[#e5e8eb]/70 flex items-center justify-center font-bold text-[#191f28] truncate px-1"
                            style={{ width: `${m.widthPercent}%` }}
                          >
                            {m.label}
                          </div>
                        ))}
                      </div>
                      {/* 2단: 주차 헤더 */}
                      <div className="flex h-8 relative">
                        {weeks.map((w, idx) => (
                          <div
                            key={idx}
                            className="h-full border-r border-[#e5e8eb]/40 flex flex-col items-center justify-center font-semibold text-[#8b95a1] relative group/week overflow-hidden"
                            style={{ width: `${w.widthPercent}%` }}
                          >
                            <span className="text-[10px] leading-none">{w.label}</span>
                            <span className="text-[8px] leading-none mt-0.5 opacity-60 truncate px-0.5">{w.dateRange}</span>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/week:block bg-[#191f28] text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-30 shadow-md pointer-events-none">
                              {w.label}: {w.dateRange}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 차트 본체 */}
                  <div className="flex-1 relative flex flex-col">
                    
                    {/* 뒷배경 수직 격자선 */}
                    <div className="absolute inset-0 flex pointer-events-none z-0">
                      <div className="w-[260px] shrink-0 border-r border-[#e5e8eb] h-full bg-[#f9fafb]/30" />
                      <div className="flex-1 relative h-full flex">
                        {weeks.map((w, idx) => (
                          <div
                            key={idx}
                            className="h-full border-r border-[#e5e8eb]/30"
                            style={{ width: `${w.widthPercent}%` }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Phase (Level 1) 단계 바 */}
                    <div className="flex border-b border-[#e5e8eb] h-12 relative items-center">
                      <div className="w-[260px] shrink-0 border-r border-[#e5e8eb] px-3 font-bold text-[#191f28] text-xs">
                        Phase
                      </div>
                      <div className="flex-1 h-full relative flex items-center">
                        {phasesComputed.map(ph => {
                          const pos = getGanttPosition(ph.plan_start, ph.plan_end);
                          if (!pos) return null;
                          const text = ph.task_l1 || ph.task_l2 || '';
                          return (
                            <div
                              key={ph.id}
                              className="absolute h-8 rounded-lg flex items-center justify-center font-bold text-[11px] border border-[#a4c2f4] bg-[#c9daf8] text-[#1a3a5c] shadow-sm px-2 truncate group"
                              style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                            >
                              <span>{text}</span>
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1.5 hidden group-hover:block bg-[#191f28] text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-30 shadow-md">
                                {text} ({ph.plan_start} ~ {ph.plan_end})
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 세부 태스크 리스트 */}
                    <div className="flex flex-col relative">
                      {tasks.map(t => {
                        const pos = getGanttPosition(t.plan_start, t.plan_end);
                        const taskText = t.task_l1 || t.task_l2 || t.task_l3 || t.task_l4 || '';
                        const indentPx = Math.max(0, t.level - 2) * 12;

                        return (
                          <div key={t.id} className="flex border-b border-[#e5e8eb]/60 h-14 items-center hover:bg-[#f9fafb]/50 group transition-colors">
                            <div 
                              className="w-[260px] shrink-0 border-r border-[#e5e8eb] h-full px-3 flex items-center text-xs text-[#374151] font-medium"
                              style={{ paddingLeft: `${12 + indentPx}px` }}
                            >
                              <span className="truncate max-w-[230px]" title={taskText}>
                                {t.level === 3 && <span className="text-[#8b95a1] mr-1.5">▪</span>}
                                {t.level === 4 && <span className="text-[#cbd5e1] mr-1.5">▫</span>}
                                {taskText}
                              </span>
                            </div>

                            <div className="flex-1 h-full relative flex items-center">
                              {pos && (
                                <div
                                  className="absolute h-7 rounded-md border border-[#cbd5e1] bg-[#e8f0fe] shadow-sm overflow-hidden group/bar"
                                  style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                                >
                                  {/* 계획 진척율(plan_progress)을 바탕으로 바 음영을 채웁니다. */}
                                  <div 
                                    className="h-full bg-gradient-to-r from-[#3b7dd8] to-[#1e4976] opacity-90 transition-all duration-500"
                                    style={{ width: `${t.plan_progress}%` }}
                                  />

                                  <div className="absolute inset-0 flex items-center justify-between px-2 text-[9px] font-bold text-[#1a3a5c] pointer-events-none select-none">
                                    <span className="truncate max-w-[80%] drop-shadow-sm text-white">
                                      {taskText}
                                    </span>
                                    <span className="shrink-0 text-white font-mono bg-black/20 px-1 rounded ml-1">
                                      {t.plan_progress}%
                                    </span>
                                  </div>

                                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1.5 hidden group-hover/bar:block bg-[#191f28] text-white text-[10px] rounded-lg p-2.5 whitespace-nowrap z-30 shadow-lg border border-[#333d4b] leading-normal font-sans">
                                    <p className="font-bold text-[#3182f6] mb-0.5">{taskText}</p>
                                    <p className="text-white text-[9px] font-semibold">
                                      계획 일정: {t.plan_start} ~ {t.plan_end} ({Math.ceil(Math.abs(new Date(t.plan_end || '').getTime() - new Date(t.plan_start || '').getTime()) / (1000 * 60 * 60 * 24)) + 1}일)
                                    </p>
                                    <p className="text-white mt-1 text-[9px]">담당: {t.assignee || '—'} | 상태: {t.status} | 계획 진척율: {t.plan_progress}%</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 현재선 + 마일스톤 오버레이 — 태스크 바보다 항상 위(z-20)에 표시 */}
                    {/* left: 260px 기준으로 잡아야 태스크 바의 left% 계산과 1:1 매칭됨 */}
                    <div className="absolute inset-y-0 right-0 z-20 pointer-events-none" style={{ left: '260px' }}>
                      {todayPercent !== null && (
                        <div
                          className="absolute top-0 bottom-0 flex flex-col items-center"
                          style={{ left: `${todayPercent}%`, transform: 'translateX(-50%)' }}
                        >
                          <div className="bg-[#3182f6] text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm select-none whitespace-nowrap mt-1">
                            현재
                          </div>
                          <div className="w-1.5 h-1.5 rotate-45 bg-[#3182f6] shrink-0" />
                          <div className="w-[1.5px] flex-1 border-l border-dashed border-[#3182f6]" />
                        </div>
                      )}
                      {milestones.map(ms => {
                        const pos = getGanttPosition(ms.plan_start, ms.plan_start);
                        if (!pos) return null;
                        const taskText = ms.task_l1 || ms.task_l2 || ms.task_l3 || ms.task_l4 || '';
                        return (
                          <div
                            key={ms.id}
                            className="absolute top-0 bottom-0 flex flex-col items-center"
                            style={{ left: `${pos.left}%`, transform: 'translateX(-50%)' }}
                          >
                            <div className="bg-[#fff5f5] border border-[#ffc9c9] rounded px-1.5 py-0.5 shadow-sm select-none whitespace-nowrap mt-1">
                              <span className="text-[#e03131] text-[9px] font-bold">★ {taskText}</span>
                            </div>
                            <div className="w-[1.5px] flex-1 border-l border-dotted border-[#fa5252] opacity-80" />
                          </div>
                        );
                      })}
                    </div>

                  </div>
                </div>
              </div>
            </div>
          );
        }

        // 3. 내부 WBS 테이블 뷰
        if (wbsLoading) {
          return (
            <div className="text-center p-20 rounded-2xl text-xs bg-white border border-[#e5e8eb]">
              <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin mx-auto mb-2" />
              WBS 데이터 로딩 중...
            </div>
          );
        }

        if (wbsRows.length === 0) {
          return (
            <div className="text-center p-16 rounded-2xl bg-white border border-dashed border-[#e5e8eb]">
              <p className="text-sm font-semibold mb-2" style={{ color: '#4e5968' }}>DB에 등록된 WBS 데이터가 없습니다</p>
              <p className="text-xs mb-4" style={{ color: '#8b95a1' }}>
                구글 시트 연동이 완료되었습니다! Apps Script를 통해 구글 시트에서 데이터를 동기화하거나,<br/>아래 버튼을 눌러 내부 DB에 기본 템플릿을 생성할 수 있습니다.
              </p>
              <button
                onClick={async () => {
                  await initializeWbs(projectId, activeProjectName);
                  fetchWbs(projectId);
                }}
                className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
              >
                + 기본 WBS DB 생성하기
              </button>
            </div>
          );
        }

        return (
          <div className="rounded-2xl overflow-hidden bg-white shadow-sm border border-[#e5e8eb]">
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
              <table className="w-full text-left border-collapse text-xs min-w-[980px] table-layout-fixed" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '36px' }} />
                  <col style={{ width: '30px' }} />
                  <col style={{ width: '260px' }} />
                  <col style={{ width: '150px' }} />
                  <col style={{ width: '68px' }} />
                  <col style={{ width: '84px' }} />
                  <col style={{ width: '98px' }} />
                  <col style={{ width: '98px' }} />
                  <col style={{ width: '98px' }} />
                  <col style={{ width: '98px' }} />
                  <col style={{ width: '88px' }} />
                  <col style={{ width: '88px' }} />
                </colgroup>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ backgroundColor: '#1a3a5c', borderBottom: '1px solid #2d5a8e' }}>
                    <th className="py-2 px-2 font-bold text-center text-white border-r border-[#2d5a8e] text-[11px] align-middle" rowSpan={2}>No</th>
                    <th className="py-2 px-1 font-bold text-center text-white border-r border-[#2d5a8e] text-[11px] align-middle" rowSpan={2}>Lv</th>
                    <th className="py-2 px-3 font-bold text-white border-r border-[#2d5a8e] text-[11px] align-middle" rowSpan={2}>TASK (Work specification)</th>
                    <th className="py-2 px-3 font-bold text-white border-r border-[#2d5a8e] text-[11px] align-middle" rowSpan={2}>Description / Outputs</th>
                    <th className="py-2 px-2 font-bold text-center text-white border-r border-[#2d5a8e] text-[11px] align-middle" rowSpan={2}>R/R</th>
                    <th className="py-2 px-2 font-bold text-center text-white border-r border-[#2d5a8e] text-[11px] align-middle" rowSpan={2}>Status</th>
                    <th className="py-2 px-2 font-bold text-center text-white border-r border-[#2d5a8e] text-[11px] border-b border-[#2d5a8e]" colSpan={2}>계획 일정</th>
                    <th className="py-2 px-2 font-bold text-center text-white border-r border-[#2d5a8e] text-[11px] border-b border-[#2d5a8e]" colSpan={2}>실제 일정</th>
                    <th className="py-2 px-2 font-bold text-center text-white border-r border-[#2d5a8e] text-[11px] align-middle" rowSpan={2}>계획(%)</th>
                    <th className="py-2 px-2 font-bold text-center text-white text-[11px] align-middle" rowSpan={2}>실제(%)</th>
                  </tr>
                  <tr style={{ backgroundColor: '#1e4976', borderBottom: '2px solid #0f2b47' }}>
                    <th className="py-1 px-2 font-semibold text-center text-[#93c5fd] text-[10px] border-r border-[#2d5a8e]">시작</th>
                    <th className="py-1 px-2 font-semibold text-center text-[#93c5fd] text-[10px] border-r border-[#2d5a8e]">완료</th>
                    <th className="py-1 px-2 font-semibold text-center text-[#6ee7b7] text-[10px] border-r border-[#2d5a8e]">시작</th>
                    <th className="py-1 px-2 font-semibold text-center text-[#6ee7b7] text-[10px] border-r border-[#2d5a8e]">완료</th>
                  </tr>
                </thead>
                <tbody>
                  {wbsRows.map((row) => {
                    const isL1 = row.level === 1;
                    const isL2 = row.level === 2;
                    const isL3 = row.level === 3;
                    const taskText = row.task_l1 || row.task_l2 || row.task_l3 || row.task_l4 || '';
                    const indentPx = Math.max(0, row.level - 1) * 14;

                    let rowBg = '#ffffff';
                    let rowBorderColor = '#e8ecf0';
                    if (isL1) { rowBg = '#c9daf8'; rowBorderColor = '#a4c2f4'; }
                    else if (isL2) { rowBg = '#e8f0fe'; rowBorderColor = '#d0e0fd'; }
                    else if (isL3) { rowBg = '#f8faff'; rowBorderColor = '#edf2fc'; }

                    const statusMap: Record<string, { bg: string; text: string }> = {
                      '완료':   { bg: '#d4edda', text: '#155724' },
                      '진행중': { bg: '#cce5ff', text: '#004085' },
                      '미진행': { bg: '#f1f3f5', text: '#6c757d' },
                    };
                    const sc = statusMap[row.status] || statusMap['미진행'];

                    const taskFw = isL1 ? '700' : isL2 ? '600' : '400';
                    const taskColor = isL1 ? '#1a3a5c' : isL2 ? '#1e4976' : isL3 ? '#374151' : '#6b7280';
                    const taskFs = isL1 ? '13px' : '12px';
                    const cellBorder = `1px solid ${rowBorderColor}`;

                    return (
                      <tr key={row.id} style={{ backgroundColor: rowBg, borderBottom: cellBorder }}>
                        {/* No */}
                        <td className="py-1.5 px-2 text-center text-[#9ca3af] text-[11px] font-medium" style={{ borderRight: cellBorder }}>
                          {row.row_order}
                        </td>

                        {/* Level badge */}
                        <td className="py-1.5 px-1 text-center" style={{ borderRight: cellBorder }}>
                          <span className="inline-flex items-center justify-center rounded text-white font-bold text-[9px] w-[18px] h-[18px]"
                            style={{
                              backgroundColor: isL1 ? '#1a3a5c' : isL2 ? '#3b7dd8' : isL3 ? '#6ca0dc' : '#9ec3eb'
                            }}>
                            L{row.level}
                          </span>
                        </td>

                        {/* TASK */}
                        <td className="py-1.5 relative group" style={{ borderRight: cellBorder, paddingLeft: `${10 + indentPx}px`, paddingRight: '8px' }}>
                          <div className="truncate max-w-[280px]">
                            <span style={{ fontWeight: taskFw, color: taskColor, fontSize: taskFs }}>
                              {isL1 && <span style={{ marginRight: '5px', opacity: 0.7 }}>■</span>}
                              {isL2 && <span style={{ marginRight: '4px', opacity: 0.5 }}>▸</span>}
                              {!isL1 && !isL2 && <span style={{ marginRight: '4px', color: '#9ca3af' }}>·</span>}
                              {taskText}
                            </span>
                          </div>
                          {taskText && (
                            <div className="absolute left-4 bottom-full mb-1 hidden group-hover:block z-30 bg-[#191f28] text-white text-[11px] rounded-lg px-2.5 py-1.5 max-w-none w-max whitespace-nowrap shadow-lg pointer-events-none leading-relaxed border border-[#333d4b]">
                              {taskText}
                            </div>
                          )}
                        </td>

                        {/* Description */}
                        <td className="py-1.5 px-2.5 text-xs text-[#374151] relative group" style={{ borderRight: cellBorder }}>
                          <div className="truncate max-w-[280px]">
                            {row.description || '—'}
                          </div>
                          {row.description && (
                            <div className="absolute left-4 bottom-full mb-1 hidden group-hover:block z-30 bg-[#191f28] text-white text-[11px] rounded-lg px-2.5 py-1.5 max-w-none w-max whitespace-nowrap shadow-lg pointer-events-none leading-relaxed border border-[#333d4b]">
                              {row.description}
                            </div>
                          )}
                        </td>

                        {/* R/R */}
                        <td className="py-1.5 px-1.5 text-center text-xs text-[#374151]" style={{ borderRight: cellBorder }}>
                          {row.assignee || '—'}
                        </td>

                        {/* Status */}
                        <td className="py-1.5 px-1 text-center" style={{ borderRight: cellBorder }}>
                          <span 
                            className="px-2 py-0.5 rounded-md inline-block font-semibold text-[10px]" 
                            style={{ backgroundColor: sc.bg, color: sc.text }}
                          >
                            {row.status}
                          </span>
                        </td>

                        {/* 계획 시작 */}
                        <td className="py-1.5 px-1 text-center text-xs text-[#4e5968] text-[11px]" style={{ borderRight: cellBorder }}>
                          {row.plan_start || '—'}
                        </td>

                        {/* 계획 완료 */}
                        <td className="py-1.5 px-1 text-center text-xs text-[#4e5968] text-[11px]" style={{ borderRight: cellBorder }}>
                          {row.plan_end || '—'}
                        </td>

                        {/* 실제 시작 */}
                        <td className="py-1.5 px-1 text-center text-xs text-[#059669] text-[11px]" style={{ borderRight: cellBorder }}>
                          {row.actual_start || '—'}
                        </td>

                        {/* 실제 완료 */}
                        <td className="py-1.5 px-1 text-center text-xs text-[#059669] text-[11px]" style={{ borderRight: cellBorder }}>
                          {row.actual_end || '—'}
                        </td>

                        {/* 계획 진척율 — 읽기 전용 */}
                        <td className="py-1.5 px-2 text-center" style={{ borderRight: cellBorder }}>
                          <span className="font-semibold text-[12px] text-[#2563eb]">
                            {row.plan_progress}%
                          </span>
                        </td>

                        {/* 실제 진척율 — 읽기 전용 */}
                        <td className="py-1.5 px-2 text-center">
                          <span className="font-semibold text-[12px] text-[#059669]">
                            {row.actual_progress}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
