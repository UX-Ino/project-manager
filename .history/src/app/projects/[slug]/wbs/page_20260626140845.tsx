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
  
  // WBS 아코디언(접기/펴기) 상태
  const [collapsedRowIds, setCollapsedRowIds] = useState<Set<string>>(new Set());

  // 접혀있는 부모 행에 의해 숨겨져야 할 자식 행들의 ID 계산
  const hiddenRowIds = React.useMemo(() => {
    const hidden = new Set<string>();
    let activeCollapseLevel = 999;

    wbsRows.forEach(row => {
      if (row.level > activeCollapseLevel) {
        hidden.add(row.id);
      } else {
        activeCollapseLevel = 999;
      }

      if (collapsedRowIds.has(row.id)) {
        activeCollapseLevel = Math.min(activeCollapseLevel, row.level);
      }
    });

    return hidden;
  }, [wbsRows, collapsedRowIds]);

  // 해당 인덱스의 행이 하위 자식 노드를 가졌는지 체크
  const hasChildren = (index: number) => {
    if (index >= wbsRows.length - 1) return false;
    return wbsRows[index + 1].level > wbsRows[index].level;
  };

  // 행 접기/펴기 토글 함수
  const toggleRowCollapse = (rowId: string) => {
    setCollapsedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  // Helper to format date as M/D
  const fmtMDStr = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // Helper to get number of days
  const getDiffDays = (startStr: string | null, endStr: string | null) => {
    if (!startStr || !endStr) return 0;
    const s = new Date(startStr);
    const e = new Date(endStr);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    const diff = Math.abs(e.getTime() - s.getTime());
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  };

  // Helper to calculate computed dates for L1 Phase row (both plan and actual)
  const getComputedDatesForL1 = (ph: WBSRow, allRows: WBSRow[]) => {
    let plan_start = ph.plan_start;
    let plan_end = ph.plan_end;
    let actual_start = ph.actual_start;
    let actual_end = ph.actual_end;

    const phIdx = allRows.findIndex(w => w.id === ph.id);
    if (phIdx !== -1) {
      const nextL1Idx = allRows.findIndex((w, i) => i > phIdx && w.level === 1);
      const subRows = allRows.filter((_, i) => i > phIdx && (nextL1Idx === -1 || i < nextL1Idx));
      
      if (!plan_start || !plan_end) {
        const planChildren = subRows.filter(c => c.plan_start && c.plan_end);
        if (planChildren.length > 0) {
          plan_start = planChildren.reduce((min, c) => (c.plan_start! < min ? c.plan_start! : min), planChildren[0].plan_start!);
          plan_end = planChildren.reduce((max, c) => (c.plan_end! > max ? c.plan_end! : max), planChildren[0].plan_end!);
        }
      }

      if (!actual_start || !actual_end) {
        const actualChildren = subRows.filter(c => c.actual_start && c.actual_end);
        if (actualChildren.length > 0) {
          actual_start = actualChildren.reduce((min, c) => (c.actual_start! < min ? c.actual_start! : min), actualChildren[0].actual_start!);
          actual_end = actualChildren.reduce((max, c) => (c.actual_end! > max ? c.actual_end! : max), actualChildren[0].actual_end!);
        }
      }
    }

    return { plan_start, plan_end, actual_start, actual_end };
  };

  // Colors for Gantt phases
  const phaseColors = ['#7c4dff', '#2563eb', '#0d8a72', '#c47e10', '#178055', '#db2777', '#4b5563'];
  const getPhaseColor = (index: number) => {
    return phaseColors[index % phaseColors.length];
  };

  // Milestone check
  const MILESTONE_KEYWORDS = ['마일스톤', 'milestone', '킥오프', 'kick-off', 'kickoff'];
  const isMilestone = (row: WBSRow) => {
    if (row.level === 1 || row.level > 3) return false;
    const taskText = (row.task_l1 || row.task_l2 || row.task_l3 || row.task_l4 || '').toLowerCase();
    const hasKeyword = MILESTONE_KEYWORDS.some(k => taskText.includes(k));
    const isSingleDay = !!row.plan_start && row.plan_start === row.plan_end;
    return (hasKeyword || isSingleDay) && !!row.plan_start;
  };

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

    const formatDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    if (minDateStr && maxDateStr) {
      // 데이터가 있는 경우, 시작일이 속한 주의 월요일과 종료일이 속한 주의 일요일로 기간을 채워 확장합니다.
      const parsedMin = new Date(minDateStr);
      const day = parsedMin.getDay();
      const diff = parsedMin.getDate() - day + (day === 0 ? -6 : 1);
      const startOfMinWeek = new Date(parsedMin.getFullYear(), parsedMin.getMonth(), diff);
      
      const parsedMax = new Date(maxDateStr);
      const dayMax = parsedMax.getDay();
      const diffMax = parsedMax.getDate() + (dayMax === 0 ? 0 : 7 - dayMax);
      const endOfMaxWeek = new Date(parsedMax.getFullYear(), parsedMax.getMonth(), diffMax);
      
      minDateStr = formatDate(startOfMinWeek);
      maxDateStr = formatDate(endOfMaxWeek);
    } else {
      // 데이터가 없는 경우의 기본값 설정 (이전 1개월 ~ 이후 2개월)
      const today = new Date();
      const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const day = threeMonthsAgo.getDay();
      const diff = threeMonthsAgo.getDate() - day + (day === 0 ? -6 : 1);
      const startOfThreeMonthsAgoWeek = new Date(threeMonthsAgo.getFullYear(), threeMonthsAgo.getMonth(), diff);
      
      const twoMonthsLater = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      const dayMax = twoMonthsLater.getDay();
      const diffMax = twoMonthsLater.getDate() + (dayMax === 0 ? 0 : 7 - dayMax);
      const endOfTwoMonthsLaterWeek = new Date(twoMonthsLater.getFullYear(), twoMonthsLater.getMonth(), diffMax);

      minDateStr = formatDate(startOfThreeMonthsAgoWeek);
      maxDateStr = formatDate(endOfTwoMonthsLaterWeek);
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

  // Parse project.wbs_weeks to concrete Date boundaries
  const parsedWeeks = React.useMemo(() => {
    if (!currentProject?.wbs_weeks || currentProject.wbs_weeks.length === 0) return [];
    
    const baselineYear = ganttDates.minDate ? ganttDates.minDate.getFullYear() : new Date().getFullYear();
    let currentYear = baselineYear;
    let lastMonth = -1;

    return currentProject.wbs_weeks.map((w) => {
      const rangeStr = w.date_range || '';
      const parts = rangeStr.split('~').map(s => s.trim());
      
      let startVal = parts[0];
      let endVal = parts[1] || parts[0];

      const parseSingleDate = (str: string, defaultYear: number) => {
        const ymdMatch = str.match(/(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
        if (ymdMatch) {
          return new Date(parseInt(ymdMatch[1]), parseInt(ymdMatch[2]) - 1, parseInt(ymdMatch[3]));
        }
        const mdMatch = str.match(/(\d{1,2})[./](\d{1,2})/);
        if (mdMatch) {
          const m = parseInt(mdMatch[1]);
          const d = parseInt(mdMatch[2]);
          
          if (lastMonth !== -1 && m < lastMonth && lastMonth - m > 6) {
            currentYear++;
          }
          lastMonth = m;
          return new Date(currentYear, m - 1, d);
        }
        return null;
      };

      const startDate = parseSingleDate(startVal, currentYear) || new Date();
      lastMonth = startDate.getMonth() + 1;
      const endDate = parseSingleDate(endVal, currentYear) || new Date(startDate.getTime() + 4 * 24 * 3600 * 1000);

      return {
        weekNum: w.week_num,
        label: w.label,
        dateRange: w.date_range,
        startDate,
        endDate
      };
    });
  }, [currentProject?.wbs_weeks, ganttDates]);

  const ganttTimeline = React.useMemo(() => {
    if (parsedWeeks && parsedWeeks.length > 0) {
      const numWeeks = parsedWeeks.length;
      const weekWidth = 100 / numWeeks;
      
      const timelineWeeks = parsedWeeks.map((w, idx) => ({
        weekNum: w.weekNum,
        label: w.label,
        dateRange: w.dateRange,
        leftPercent: idx * weekWidth,
        widthPercent: weekWidth
      }));

      // Group weeks by month for Month Header Alignment
      const groups: { year: number; month: number; label: string; startIdx: number; count: number }[] = [];
      parsedWeeks.forEach((w, idx) => {
        const m = w.startDate.getMonth() + 1;
        const y = w.startDate.getFullYear();
        const label = `${m}월`;
        
        if (groups.length === 0) {
          groups.push({ year: y, month: m, label, startIdx: idx, count: 1 });
        } else {
          const lastGroup = groups[groups.length - 1];
          if (lastGroup.month === m && lastGroup.year === y) {
            lastGroup.count++;
          } else {
            groups.push({ year: y, month: m, label, startIdx: idx, count: 1 });
          }
        }
      });

      const timelineMonths = groups.map(g => ({
        year: g.year,
        month: g.month,
        label: g.label,
        leftPercent: g.startIdx * weekWidth,
        widthPercent: g.count * weekWidth
      }));

      return {
        weeks: timelineWeeks,
        months: timelineMonths
      };
    }

    // Fallback to standard 7-day calendar weeks
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
  }, [ganttDates, parsedWeeks]);

  const todayPercent = React.useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    if (parsedWeeks && parsedWeeks.length > 0) {
      const numWeeks = parsedWeeks.length;
      const weekWidth = 100 / numWeeks;
      const firstWeekStart = parsedWeeks[0].startDate.getTime();
      const lastWeekEnd = parsedWeeks[numWeeks - 1].endDate.getTime();
      
      if (today.getTime() < firstWeekStart || today.getTime() > lastWeekEnd) return null;
      
      let weekIdx = -1;
      for (let i = 0; i < numWeeks; i++) {
        const sMs = parsedWeeks[i].startDate.getTime();
        const eMs = parsedWeeks[i].endDate.getTime();
        if (today.getTime() >= sMs && today.getTime() <= eMs) {
          weekIdx = i;
          break;
        }
      }
      
      if (weekIdx === -1) {
        for (let i = 0; i < numWeeks; i++) {
          if (today.getTime() < parsedWeeks[i].startDate.getTime()) {
            weekIdx = i - 1;
            break;
          }
        }
        if (weekIdx === -1) weekIdx = numWeeks - 1;
      }
      
      const week = parsedWeeks[weekIdx];
      const workingDays: Date[] = [];
      let curr = new Date(week.startDate);
      while (curr <= week.endDate) {
        const day = curr.getDay();
        if (day !== 0 && day !== 6) workingDays.push(new Date(curr));
        curr.setDate(curr.getDate() + 1);
      }
      
      if (workingDays.length === 0) {
        const totalMs = week.endDate.getTime() - week.startDate.getTime() || 1;
        const progress = (today.getTime() - week.startDate.getTime()) / totalMs;
        return (weekIdx + progress) * weekWidth;
      }
      
      let dayIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < workingDays.length; i++) {
        const diff = Math.abs(workingDays[i].getTime() - today.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          dayIdx = i;
        }
      }
      
      return (weekIdx + ((dayIdx + 0.5) / workingDays.length)) * weekWidth;
    }
    
    // Fallback
    const { minDate, maxDate, totalDays } = ganttDates;
    if (today < minDate || today > maxDate) return null;
    
    const diffTime = today.getTime() - minDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return (diffDays / totalDays) * 100;
  }, [parsedWeeks, ganttDates]);

  const getGanttPosition = React.useCallback((startStr: string | null, endStr: string | null) => {
    if (!startStr || !endStr) return null;
    
    if (!parsedWeeks || parsedWeeks.length === 0) {
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
    }
    
    const start = new Date(startStr);
    const end = new Date(endStr);
    
    const getLeftPercent = (date: Date) => {
      const dateMs = date.getTime();
      const numWeeks = parsedWeeks.length;
      const weekWidth = 100 / numWeeks;
      const firstWeekStart = parsedWeeks[0].startDate.getTime();
      const lastWeekEnd = parsedWeeks[numWeeks - 1].endDate.getTime();
      
      if (dateMs <= firstWeekStart) return 0;
      if (dateMs >= lastWeekEnd) return 100;
      
      let weekIdx = -1;
      for (let i = 0; i < numWeeks; i++) {
        const sMs = parsedWeeks[i].startDate.getTime();
        const eMs = parsedWeeks[i].endDate.getTime();
        if (dateMs >= sMs && dateMs <= eMs) {
          weekIdx = i;
          break;
        }
      }
      
      if (weekIdx === -1) {
        for (let i = 0; i < numWeeks; i++) {
          if (dateMs < parsedWeeks[i].startDate.getTime()) {
            weekIdx = i - 1;
            break;
          }
        }
        if (weekIdx === -1) weekIdx = numWeeks - 1;
      }
      
      const week = parsedWeeks[weekIdx];
      const workingDays: Date[] = [];
      let curr = new Date(week.startDate);
      while (curr <= week.endDate) {
        const day = curr.getDay();
        if (day !== 0 && day !== 6) workingDays.push(new Date(curr));
        curr.setDate(curr.getDate() + 1);
      }
      
      if (workingDays.length === 0) {
        const totalMs = week.endDate.getTime() - week.startDate.getTime() || 1;
        const progress = (dateMs - week.startDate.getTime()) / totalMs;
        return (weekIdx + progress) * weekWidth;
      }
      
      let dayIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < workingDays.length; i++) {
        const diff = Math.abs(workingDays[i].getTime() - dateMs);
        if (diff < minDiff) {
          minDiff = diff;
          dayIdx = i;
        }
      }
      
      return (weekIdx + (dayIdx / workingDays.length)) * weekWidth;
    };
    
    const getRightPercent = (date: Date) => {
      const dateMs = date.getTime();
      const numWeeks = parsedWeeks.length;
      const weekWidth = 100 / numWeeks;
      const firstWeekStart = parsedWeeks[0].startDate.getTime();
      const lastWeekEnd = parsedWeeks[numWeeks - 1].endDate.getTime();
      
      if (dateMs <= firstWeekStart) return 0;
      if (dateMs >= lastWeekEnd) return 100;
      
      let weekIdx = -1;
      for (let i = 0; i < numWeeks; i++) {
        const sMs = parsedWeeks[i].startDate.getTime();
        const eMs = parsedWeeks[i].endDate.getTime();
        if (dateMs >= sMs && dateMs <= eMs) {
          weekIdx = i;
          break;
        }
      }
      
      if (weekIdx === -1) {
        for (let i = 0; i < numWeeks; i++) {
          if (dateMs < parsedWeeks[i].startDate.getTime()) {
            weekIdx = i - 1;
            break;
          }
        }
        if (weekIdx === -1) weekIdx = numWeeks - 1;
      }
      
      const week = parsedWeeks[weekIdx];
      const workingDays: Date[] = [];
      let curr = new Date(week.startDate);
      while (curr <= week.endDate) {
        const day = curr.getDay();
        if (day !== 0 && day !== 6) workingDays.push(new Date(curr));
        curr.setDate(curr.getDate() + 1);
      }
      
      if (workingDays.length === 0) {
        const totalMs = week.endDate.getTime() - week.startDate.getTime() || 1;
        const progress = (dateMs - week.startDate.getTime()) / totalMs;
        return (weekIdx + progress) * weekWidth;
      }
      
      let dayIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < workingDays.length; i++) {
        const diff = Math.abs(workingDays[i].getTime() - dateMs);
        if (diff < minDiff) {
          minDiff = diff;
          dayIdx = i;
        }
      }
      
      return (weekIdx + ((dayIdx + 1) / workingDays.length)) * weekWidth;
    };
    
    const left = getLeftPercent(start);
    const right = getRightPercent(end);
    
    return {
      left,
      width: Math.max(0.1, right - left)
    };
  }, [parsedWeeks, ganttDates]);



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

  // WBS Stats calculations
  const totalCount = wbsRows.length;
  const completedCount = wbsRows.filter(r => r.status === '완료').length;
  const inProgressCount = wbsRows.filter(r => r.status === '진행중').length;
  const notStartedCount = totalCount - completedCount - inProgressCount;
  
  const completedPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const inProgressPct = totalCount > 0 ? (inProgressCount / totalCount) * 100 : 0;
  const overallProgress = totalCount > 0 ? Math.round(wbsRows.reduce((sum, r) => sum + (r.actual_progress || 0), 0) / totalCount) : 0;

  // modern-screenshot Gantt Capture Function
  const captureGantt = async () => {
    const el = document.getElementById('gantt-capture');
    if (!el) return;

    try {
      const { domToPng } = await import('modern-screenshot');

      const dataUrl = await domToPng(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        style: {
          fontFamily: "'Apple SD Gothic Neo', 'Malgun Gothic', '맑은 고딕', sans-serif",
          letterSpacing: '0px',
          wordSpacing: '0px',
        },
        width: el.scrollWidth,
        height: el.scrollHeight,
      });

      const a = document.createElement('a');
      a.download = `WBS_간트차트_${currentProject?.name || ''}_${new Date().toISOString().slice(0, 10)}.png`;
      a.href = dataUrl;
      a.click();
      showToast('간트 차트 이미지가 저장되었습니다.');
    } catch (err) {
      console.error('Gantt capture error:', err);
      showToast('간트 차트 이미지 캡처 중 오류가 발생했습니다.');
    }
  };

  return (
    <section className="animate-fade-in flex flex-col" style={{ minHeight: 0 }}>
      {/* Header toolbar */}
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-[#101727]">
            WBS 일정표 <span className="text-xs font-semibold text-[#8b95a1] ml-1">· 전체 {totalCount}개 업무</span>
          </h2>
          <p className="text-xs text-[#8a93a6] mt-1">
            {activeProjectName ? `${activeProjectName} — ` : ''}구글 시트 WBS 기반 프로젝트 일정 관리
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-[#eaedf3] rounded-xl p-1 gap-0.5">
            <button
              onClick={() => setWbsViewMode('table')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${wbsViewMode === 'table' ? 'bg-white text-[#2563eb] shadow-[0_1px_3px_rgba(28,40,64,0.14)]' : 'text-[#7b8499] hover:text-[#2a3346]'}`}
            >
              내부 WBS 테이블
            </button>
            <button
              onClick={() => setWbsViewMode('gantt')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${wbsViewMode === 'gantt' ? 'bg-white text-[#2563eb] shadow-[0_1px_3px_rgba(28,40,64,0.14)]' : 'text-[#7b8499] hover:text-[#2a3346]'}`}
            >
              전체 일정 (Gantt)
            </button>
            <button
              onClick={() => setWbsViewMode('sheet')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${wbsViewMode === 'sheet' ? 'bg-white text-[#2563eb] shadow-[0_1px_3px_rgba(28,40,64,0.14)]' : 'text-[#7b8499] hover:text-[#2a3346]'}`}
            >
              구글 시트 연동 뷰
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

      {/* Stat Strip */}
      {wbsViewMode !== 'sheet' && hasUrl && wbsRows.length > 0 && (
        <div className="flex items-stretch gap-3 mb-4 shrink-0">
          <div className="flex items-center gap-4.5 px-4.5 py-3 bg-white border border-[#e8ecf3] rounded-2xl shadow-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-[#8a93a6] font-bold">전체 업무</span>
              <span className="text-xl font-extrabold text-[#101727] leading-none">
                {totalCount}<span className="text-xs text-[#9aa2b3] font-semibold ml-0.5"> 건</span>
              </span>
            </div>
            <div className="w-[1px] h-9.5 bg-[#eef1f6]" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-[#178055] font-bold">완료</span>
              <span className="text-xl font-extrabold text-[#178055] leading-none">{completedCount}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-[#2563eb] font-bold">진행중</span>
              <span className="text-xl font-extrabold text-[#2563eb] leading-none">{inProgressCount}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-[#6b7488] font-bold">미진행</span>
              <span className="text-xl font-extrabold text-[#6b7488] leading-none">{notStartedCount}</span>
            </div>
          </div>
          
          <div className="flex-1 flex items-center gap-4.5 px-5 py-3 bg-white border border-[#e8ecf3] rounded-2xl shadow-sm">
            <div className="flex flex-col gap-0.5 shrink-0">
              <span className="text-[11px] text-[#8a93a6] font-bold">평균 실제 진척율</span>
              <span className="text-xl font-extrabold text-[#178055] leading-none">
                {overallProgress}<span className="text-xs text-[#9aa2b3] font-semibold">%</span>
              </span>
            </div>
            <div className="flex-1 h-2 bg-[#eef0f5] rounded-full overflow-hidden flex">
              <div style={{ width: `${completedPct}%` }} className="bg-[#22a06b] h-full" />
              <div style={{ width: `${inProgressPct}%` }} className="bg-[#3b82f6] h-full" />
            </div>
            <div className="flex items-center gap-3.5 shrink-0 text-xs font-semibold text-[#5a6478]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#22a06b]" />
                <span>완료 업무 <b className="text-[#22304a]">{completedCount}</b></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                <span>진행중 업무 <b className="text-[#22304a]">{inProgressCount}</b></span>
              </div>
            </div>
          </div>
        </div>
      )}

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

          return (
            <div className="bg-white rounded-2xl border border-[#e5e8eb] shadow-sm overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 250px)' }}>
              
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#eef1f6] bg-[#fafbfd] shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[#101727]">개선 및 관리 일정 (간트)</span>
                  <span className="text-[11px] text-[#9aa2b3] font-semibold">{minDateStr} ~ {maxDateStr} ({totalDays}일)</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-4 text-xs font-semibold text-[#5a6478]">
                    <div className="flex items-center gap-1.5"><span className="w-3.5 h-2 rounded bg-[#22a06b]"></span><span>완료</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3.5 h-2 rounded bg-[#3b82f6]"></span><span>진행중</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3.5 h-2 rounded bg-[#cbd5e1]"></span><span>예정</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#7c4dff] rotate-45 rounded-sm"></span><span>마일스톤</span></div>
                  </div>
                  
                  {/* 아코디언 일괄 제어 */}
                  <div className="flex bg-[#eaedf3] rounded-lg p-0.5 gap-0.5 select-none">
                    <button 
                      onClick={() => {
                        const allCollapsibleIds = wbsRows
                          .filter((_, idx) => hasChildren(idx))
                          .map(r => r.id);
                        setCollapsedRowIds(new Set(allCollapsibleIds));
                      }}
                      className="px-2 py-1 text-[10px] font-bold rounded-md bg-white hover:bg-[#f1f3f7] text-[#4e5968] cursor-pointer shadow-[0_1px_2px_rgba(28,40,64,0.08)] transition-all"
                    >
                      모두 접기
                    </button>
                    <button 
                      onClick={() => setCollapsedRowIds(new Set())}
                      className="px-2 py-1 text-[10px] font-bold rounded-md hover:bg-white hover:shadow-[0_1px_2px_rgba(28,40,64,0.08)] text-[#7b8499] hover:text-[#2563eb] cursor-pointer transition-all"
                    >
                      모두 펴기
                    </button>
                  </div>

                  <button onClick={captureGantt} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2563eb] text-white border-none rounded-lg cursor-pointer font-semibold text-[11.5px] hover:bg-[#1d4ed8] shadow-sm">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    간트 캡처
                  </button>
                </div>
              </div>

              <div className="overflow-auto flex-1 relative">
                <div id="gantt-capture" className="min-w-[1040px] bg-white relative flex flex-col" style={{ minHeight: '400px' }}>
                  
                  <div className="flex border-b border-[#e5e8eb] bg-[#f9fafb] sticky top-0 z-30">
                    <div className="w-[300px] shrink-0 border-r border-[#e5e8eb] p-3.5 flex items-end font-bold text-[#7b8499] text-xs">
                      작업 / 담당
                    </div>
                    <div className="flex-1 relative flex flex-col text-xs text-[#4e5968] h-11.5">
                      <div className="flex border-b border-[#e5e8eb]/70 h-6 relative">
                        {months.map((m, idx) => (
                          <div
                            key={idx}
                            className="absolute h-full border-r border-[#dfe5ee] flex items-center justify-center font-bold text-[#3a4358] text-[11.5px] truncate"
                            style={{ left: `${m.leftPercent}%`, width: `${m.widthPercent}%` }}
                          >
                            {m.label}
                          </div>
                        ))}
                      </div>
                      <div className="flex h-5.5 relative">
                        {weeks.map((w, idx) => (
                          <div
                            key={idx}
                            className="absolute bottom-0 h-full border-r border-[#eef1f6] flex flex-col items-center justify-center text-[#9aa2b3] text-[9.5px] font-semibold text-center select-none leading-none"
                            style={{ left: `${w.leftPercent}%`, width: `${w.widthPercent}%` }}
                          >
                            <span>{w.label}</span>
                            {w.dateRange && (
                              <span className="text-[7.5px] text-[#b2bac7] font-medium mt-0.5 scale-90">
                                {w.dateRange.replace(/\s+/g, '')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      

                    </div>
                  </div>

                  <div className="flex-1 relative flex flex-col">
                    <div className="absolute inset-0 pointer-events-none z-0" style={{ left: '300px' }}>
                      {weeks.map((w, idx) => (
                        <div
                          key={idx}
                          className="absolute top-0 bottom-0 border-l border-[#f1f3f8]"
                          style={{ left: `${w.leftPercent}%` }}
                        />
                      ))}
                    </div>
                    {todayPercent !== null && (
                      <div className="absolute inset-0 pointer-events-none z-20" style={{ left: '300px' }}>
                        <div
                          className="absolute top-[25px] bottom-0 w-[1.5px] bg-[#e11d48]"
                          style={{ left: `${todayPercent}%` }}
                        />
                      </div>
                    )}

                    {(() => {
                      let phaseIndex = -1;
                      let currentPhaseColor = '#2563eb';
                      
                      return wbsRows.map((row, idx) => {
                        if (hiddenRowIds.has(row.id)) return null;
                        const isCollapsed = collapsedRowIds.has(row.id);
                        const rowHasChildren = hasChildren(idx);
                        
                        const isL1 = row.level === 1;
                        const taskText = row.task_l1 || row.task_l2 || row.task_l3 || row.task_l4 || '';
                        
                        if (isL1) {
                          phaseIndex++;
                          currentPhaseColor = getPhaseColor(phaseIndex);
                          
                          const comp = getComputedDatesForL1(row, wbsRows);
                          const posPlan = getGanttPosition(comp.plan_start, comp.plan_end);
                          const posActual = getGanttPosition(comp.actual_start, comp.actual_end);
                          
                          return (
                            <div
                              key={row.id}
                              className="flex items-stretch bg-[#fafbfd] border-b border-[#eef1f6] relative z-10 h-10 shrink-0"
                            >
                              <div 
                                className={`w-[300px] shrink-0 border-r border-[#eef1f6] px-4 flex items-center gap-2 ${rowHasChildren ? 'cursor-pointer hover:bg-[#f1f3f7] select-none' : ''}`}
                                onClick={() => rowHasChildren && toggleRowCollapse(row.id)}
                              >
                                {rowHasChildren ? (
                                  <ChevronRight 
                                    className={`w-3.5 h-3.5 text-[#5a6478] transition-transform shrink-0 ${isCollapsed ? '' : 'rotate-90'}`} 
                                  />
                                ) : (
                                  <span
                                    className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                                    style={{ backgroundColor: currentPhaseColor }}
                                  />
                                )}
                                <span className="font-bold text-[#22304a] text-[13px] truncate" title={taskText}>
                                  {taskText}
                                </span>
                              </div>
                              <div className="flex-1 relative h-full flex items-center">
                                {posPlan && (
                                  <div
                                    className="absolute h-[4px] rounded-md transition-all duration-500"
                                    style={{
                                      left: `${posPlan.left}%`,
                                      width: `${posPlan.width}%`,
                                      backgroundColor: `${currentPhaseColor}33`,
                                      top: posActual ? '12px' : '18px'
                                    }}
                                  />
                                )}
                                {posActual && (
                                  <div
                                    className="absolute h-[4px] rounded-md transition-all duration-500"
                                    style={{
                                      left: `${posActual.left}%`,
                                      width: `${posActual.width}%`,
                                      backgroundColor: currentPhaseColor,
                                      top: posPlan ? '24px' : '18px'
                                    }}
                                  />
                                )}
                                {phaseIndex === 0 && todayPercent !== null && (
                                  <div
                                    className="absolute -translate-x-1/2 bg-[#e11d48] text-white text-[9.5px] font-bold px-1.5 py-0.5 rounded shadow-[0_1px_3px_rgba(225,29,72,0.35)] whitespace-nowrap z-50"
                                    style={{ left: `${todayPercent}%` }}
                                  >
                                    오늘 {new Date().getMonth() + 1}/{new Date().getDate()}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        } else {
                          const indentPx = (row.level - 2) * 14 + 16;
                          const isMilestoneRow = isMilestone(row);
                          const posPlan = getGanttPosition(row.plan_start, row.plan_end);
                          const posActual = getGanttPosition(row.actual_start, row.actual_end);
                          const pos = posPlan; // For milestone row compatibility
                          
                          const statusColors: Record<string, { track: string; bar: string }> = {
                            '완료': { track: 'rgba(34, 160, 107, 0.15)', bar: '#22a06b' },
                            '진행중': { track: 'rgba(59, 130, 246, 0.15)', bar: '#3b82f6' },
                            '미진행': { track: '#f2f4f9', bar: '#cbd5e1' }
                          };
                          const sc = statusColors[row.status] || statusColors['미진행'];
                          
                          return (
                            <div
                              key={row.id}
                              className="flex items-stretch border-b border-[#f1f3f8] relative z-10 h-[38px] hover:bg-[#f9fafc] group transition-colors shrink-0"
                            >
                              <div 
                                className={`w-[300px] shrink-0 border-r border-[#eef1f6] px-4 flex items-center justify-between gap-2 bg-white group-hover:bg-[#f9fafc] transition-colors ${rowHasChildren ? 'cursor-pointer hover:bg-[#f1f3f7] select-none' : ''}`}
                                onClick={() => rowHasChildren && toggleRowCollapse(row.id)}
                              >
                                <div
                                  className="flex items-center text-xs font-semibold text-[#3a4358] truncate"
                                  style={{ paddingLeft: `${indentPx}px` }}
                                >
                                  {rowHasChildren ? (
                                    <ChevronRight 
                                      className={`w-3 h-3 text-[#8a93a6] transition-transform mr-1 shrink-0 ${isCollapsed ? '' : 'rotate-90'}`} 
                                    />
                                  ) : (
                                    <>
                                      {row.level === 3 && <span className="text-[#8b95a1] mr-1.5">▪</span>}
                                      {row.level === 4 && <span className="text-[#cbd5e1] mr-1.5">▫</span>}
                                    </>
                                  )}
                                  <span className="truncate" title={taskText}>{taskText}</span>
                                </div>
                                <span className="text-[11px] text-[#9aa2b3] font-semibold shrink-0">
                                  {row.assignee || '—'}
                                </span>
                              </div>
                              <div className="flex-1 relative h-full flex items-center">
                                {isMilestoneRow && pos && (
                                  <div
                                    className="absolute top-1/2 -translate-y-1/2 flex items-center gap-2 group/ms"
                                    style={{ left: `${pos.left}%`, transform: 'translate(-5px, -50%)' }}
                                  >
                                    <div
                                      className="w-3.5 h-3.5 rotate-45 rounded-[2px] shadow-[0_1px_3px_rgba(0,0,0,0.18)]"
                                      style={{ backgroundColor: '#7c4dff' }}
                                    />
                                    <span className="text-[10px] font-bold text-[#5a6478] bg-white/80 px-1 rounded">
                                      {row.plan_start ? fmtMDStr(row.plan_start) : ''}
                                    </span>
                                    
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 hidden group-hover/ms:block bg-[#191f28] text-white text-[11px] rounded-lg p-2.5 whitespace-nowrap z-50 shadow-xl border border-[#333d4b] leading-normal font-sans pointer-events-none">
                                      <p className="font-bold text-[#7c4dff] mb-0.5">★ 마일스톤</p>
                                      <p className="font-bold text-white mb-1">{taskText}</p>
                                      <p className="text-[10px] text-[#8b95a1]">일자: {row.plan_start} | 담당: {row.assignee || '—'}</p>
                                    </div>
                                  </div>
                                )}
                                
                                {!isMilestoneRow && (
                                  <>
                                    {/* 계획 일정 바 (Plan Bar) */}
                                    {posPlan && (() => {
                                      const isNarrow = posPlan.width < 15;
                                      const hasActual = !!posActual;
                                      const barHeight = hasActual ? 'h-[11px]' : 'h-[16px]';
                                      const topPos = hasActual ? 'top-[5px]' : 'top-[11px]';
                                      
                                      return (
                                        <div
                                          className={`absolute ${barHeight} ${topPos} rounded-[4px] flex items-center group/plan shadow-sm overflow-visible`}
                                          style={{
                                            left: `${posPlan.left}%`,
                                            width: `${posPlan.width}%`,
                                          }}
                                        >
                                          {/* Progress bar wrapper with overflow-hidden */}
                                          <div className="absolute inset-0 rounded-[4px] overflow-hidden pointer-events-none">
                                            {/* Track background */}
                                            <div className="absolute inset-0 bg-[#e2e8f0]" style={{ border: '1px solid #cbd5e1' }} />
                                            {/* Progress bar */}
                                            {row.plan_progress > 0 && (
                                              <div
                                                className="h-full transition-all duration-500"
                                                style={{
                                                  width: `${row.plan_progress}%`,
                                                  backgroundColor: '#94a3b8'
                                                }}
                                              />
                                            )}
                                          </div>
 
                                          {/* Text label */}
                                          <span
                                            className={`absolute font-bold text-[8px] select-none pointer-events-none ${isNarrow ? 'left-full ml-2 whitespace-nowrap text-[#64748b]' : 'left-1.5 truncate pr-1.5'}`}
                                            style={{
                                              color: isNarrow ? '#64748b' : (row.plan_progress >= 50 ? '#fff' : '#475569')
                                            }}
                                          >
                                            계획: {row.plan_start ? fmtMDStr(row.plan_start) : ''}
                                            {row.plan_start !== row.plan_end && ` ~ ${row.plan_end ? fmtMDStr(row.plan_end) : ''}`}
                                            {` (${row.plan_progress}%)`}
                                          </span>
 
                                          {/* Tooltip */}
                                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 hidden group-hover/plan:block bg-[#191f28] text-white text-[11px] rounded-lg p-2.5 whitespace-nowrap z-50 shadow-xl border border-[#333d4b] leading-normal font-sans pointer-events-none">
                                            <p className="font-bold text-[#64748b] mb-0.5">{taskText} (계획)</p>
                                            <p className="text-white text-[10px] font-semibold">
                                              계획 일정: {row.plan_start} ~ {row.plan_end} ({row.plan_start && row.plan_end ? getDiffDays(row.plan_start, row.plan_end) : 0}일간)
                                            </p>
                                            <p className="text-[10px] text-[#8b95a1] mt-1">
                                              담당: {row.assignee || '—'} | 계획 진척율: {row.plan_progress}%
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    })()}
 
                                    {/* 실제 일정 바 (Actual Bar) */}
                                    {posActual && (() => {
                                      const isNarrow = posActual.width < 15;
                                      const hasPlan = !!posPlan;
                                      const barHeight = hasPlan ? 'h-[11px]' : 'h-[16px]';
                                      const topPos = hasPlan ? 'top-[21px]' : 'top-[11px]';
                                      const actualProgress = row.actual_progress ?? 0;
                                      
                                      return (
                                        <div
                                          className={`absolute ${barHeight} ${topPos} rounded-[4px] flex items-center group/actual shadow-sm overflow-visible`}
                                          style={{
                                            left: `${posActual.left}%`,
                                            width: `${posActual.width}%`,
                                          }}
                                        >
                                          {/* Progress bar wrapper with overflow-hidden */}
                                          <div className="absolute inset-0 rounded-[4px] overflow-hidden pointer-events-none">
                                            {/* Track background */}
                                            <div className="absolute inset-0" style={{ backgroundColor: sc.track, border: row.status === '미진행' ? '1px solid #e5e8eb' : 'none' }} />
                                            {/* Progress bar */}
                                            {row.status !== '미진행' && (
                                              <div
                                                className="h-full transition-all duration-500"
                                                style={{
                                                  width: `${actualProgress}%`,
                                                  backgroundColor: sc.bar
                                                }}
                                              />
                                            )}
                                          </div>
 
                                          {/* Text label */}
                                          <span
                                            className={`absolute font-bold text-[8px] select-none pointer-events-none ${isNarrow ? 'left-full ml-2 whitespace-nowrap' : 'left-1.5 truncate pr-1.5'}`}
                                            style={{
                                              color: isNarrow ? sc.bar : (row.status === '완료' || (row.status === '진행중' && actualProgress >= 50) ? '#fff' : '#334155')
                                            }}
                                          >
                                            실제: {row.actual_start ? fmtMDStr(row.actual_start) : ''}
                                            {row.actual_start !== row.actual_end && ` ~ ${row.actual_end ? fmtMDStr(row.actual_end) : ''}`}
                                            {` (${actualProgress}%)`}
                                          </span>
 
                                          {/* Tooltip */}
                                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 hidden group-hover/actual:block bg-[#191f28] text-white text-[11px] rounded-lg p-2.5 whitespace-nowrap z-50 shadow-xl border border-[#333d4b] leading-normal font-sans pointer-events-none">
                                            <p className="font-bold text-[#22a06b] mb-0.5">{taskText} (실제)</p>
                                            <p className="text-white text-[10px] font-semibold">
                                              실제 일정: {row.actual_start} ~ {row.actual_end} ({row.actual_start && row.actual_end ? getDiffDays(row.actual_start, row.actual_end) : 0}일간)
                                            </p>
                                            <p className="text-[10px] text-[#8b95a1] mt-1">
                                              담당: {row.assignee || '—'} | 상태: {row.status} | 실제 진척율: {actualProgress}%
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        }
                      });
                    })()}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5 border-t border-[#eef1f6] bg-[#fafbfd] text-[11.5px] text-[#8a93a6] shrink-0">
                <span>총 {wbsRows.filter(r => r.level !== 1).length}개 작업 · {wbsRows.filter(r => r.level === 1).length}개 단계</span>
                <span>출처: 내부 WBS 일정 타임라인</span>
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
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 250px)' }}>
              <table className="w-full text-left border-collapse text-xs min-w-[980px]" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '42px' }} />
                  <col style={{ width: '40px' }} />
                  <col style={{ width: '260px' }} />
                  <col style={{ width: '180px' }} />
                  <col style={{ width: '76px' }} />
                  <col style={{ width: '84px' }} />
                  <col style={{ width: '92px' }} />
                  <col style={{ width: '92px' }} />
                  <col style={{ width: '92px' }} />
                  <col style={{ width: '92px' }} />
                  <col style={{ width: '68px' }} />
                  <col style={{ width: '68px' }} />
                </colgroup>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ backgroundColor: '#f4f7fb', borderBottom: '1px solid #dfe5ee' }}>
                    <th className="py-3 px-2 font-bold text-center border-r border-[#dfe5ee] text-[11px] align-middle text-[#7b8499]" rowSpan={2}>No</th>
                    <th className="py-3 px-1 font-bold text-center border-r border-[#dfe5ee] text-[11px] align-middle text-[#7b8499]" rowSpan={2}>Lv</th>
                    <th className="py-3 px-3 font-bold border-r border-[#dfe5ee] text-[11px] align-middle text-[#7b8499]" rowSpan={2}>TASK (Work specification)</th>
                    <th className="py-3 px-3 font-bold border-r border-[#dfe5ee] text-[11px] align-middle text-[#7b8499]" rowSpan={2}>Description / Outputs</th>
                    <th className="py-3 px-2 font-bold text-center border-r border-[#dfe5ee] text-[11px] align-middle text-[#7b8499]" rowSpan={2}>R/R</th>
                    <th className="py-3 px-2 font-bold text-center border-r border-[#dfe5ee] text-[11px] align-middle text-[#7b8499]" rowSpan={2}>Status</th>
                    <th className="py-2 px-2 font-bold text-center border-r border-[#dfe5ee] text-[11px] border-b border-[#dfe5ee] text-[#7b8499]" colSpan={2}>계획 일정</th>
                    <th className="py-2 px-2 font-bold text-center border-r border-[#dfe5ee] text-[11px] border-b border-[#dfe5ee] text-[#7b8499]" colSpan={2}>실제 일정</th>
                    <th className="py-3 px-2 font-bold text-center border-r border-[#dfe5ee] text-[11px] align-middle text-[#7b8499]" rowSpan={2}>계획(%)</th>
                    <th className="py-3 px-2 font-bold text-center text-[11px] align-middle text-[#7b8499]" rowSpan={2}>실제(%)</th>
                  </tr>
                  <tr style={{ backgroundColor: '#f4f7fb', borderBottom: '1.5px solid #dfe5ee' }}>
                    <th className="py-1 px-2 font-semibold text-center text-[#7b8499] text-[10px] border-r border-[#dfe5ee]">시작</th>
                    <th className="py-1 px-2 font-semibold text-center text-[#7b8499] text-[10px] border-r border-[#dfe5ee]">완료</th>
                    <th className="py-1 px-2 font-semibold text-center text-[#7b8499] text-[10px] border-r border-[#dfe5ee]">시작</th>
                    <th className="py-1 px-2 font-semibold text-center text-[#7b8499] text-[10px] border-r border-[#dfe5ee]">완료</th>
                  </tr>
                </thead>
                <tbody>
                  {wbsRows.map((row, idx) => {
                    if (hiddenRowIds.has(row.id)) return null;
                    const isCollapsed = collapsedRowIds.has(row.id);
                    const rowHasChildren = hasChildren(idx);

                    const isL1 = row.level === 1;
                    const isL2 = row.level === 2;
                    const isL3 = row.level === 3;
                    const taskText = row.task_l1 || row.task_l2 || row.task_l3 || row.task_l4 || '';
                    const indentPx = Math.max(0, row.level - 1) * 14;

                    let rowBg = '#ffffff';
                    let rowBorderColor = '#eef1f6';
                    if (isL1) { rowBg = '#c9daf8'; rowBorderColor = '#a4c2f4'; }
                    else if (isL2) { rowBg = '#e8f0fe'; rowBorderColor = '#d0e0fd'; }
                    else if (isL3) { rowBg = '#f8faff'; rowBorderColor = '#edf2fc'; }

                    const statusMap: Record<string, { bg: string; text: string }> = {
                      '완료':   { bg: '#e6f6ee', text: '#178055' },
                      '진행중': { bg: '#eaf1ff', text: '#2563eb' },
                      '미진행': { bg: '#f2f4f9', text: '#6b7488' },
                    };
                    const sc = statusMap[row.status] || statusMap['미진행'];

                    const taskFw = isL1 ? '700' : isL2 ? '600' : '400';
                    const taskColor = isL1 ? '#1a3a5c' : isL2 ? '#1e4976' : isL3 ? '#374151' : '#6b7280';
                    const taskFs = isL1 ? '13px' : '12px';
                    const cellBorder = `1px solid ${rowBorderColor}`;

                    return (
                      <tr key={row.id} style={{ backgroundColor: rowBg, borderBottom: cellBorder }} className="hover:bg-[#f7f9fc]/50 transition-colors">
                        <td className="py-2 px-2 text-center text-[#aab1bf] text-[11px] font-medium" style={{ borderRight: cellBorder }}>
                          {row.row_order}
                        </td>
                        <td className="py-2 px-1 text-center" style={{ borderRight: cellBorder }}>
                          <span className="inline-flex items-center justify-center rounded-md font-bold text-[10px] px-1.5 py-0.5"
                            style={{
                              backgroundColor: isL1 ? '#eaf1ff' : isL2 ? '#e6f6ee' : isL3 ? '#fdf3e2' : '#f2f4f9',
                              color: isL1 ? '#2f6bed' : isL2 ? '#178055' : isL3 ? '#bd7c12' : '#5a6478',
                            }}>
                            L{row.level}
                          </span>
                        </td>
                        <td 
                          className={`py-2 relative group ${rowHasChildren ? 'cursor-pointer select-none hover:bg-black/5' : ''}`}
                          style={{ borderRight: cellBorder, paddingLeft: `${10 + indentPx}px`, paddingRight: '8px' }}
                          onClick={() => rowHasChildren && toggleRowCollapse(row.id)}
                        >
                          <div className="truncate max-w-[280px] flex items-center gap-1">
                            {rowHasChildren ? (
                              <ChevronRight 
                                className={`w-3.5 h-3.5 text-[#5a6478]/80 transition-transform shrink-0 ${isCollapsed ? '' : 'rotate-90'}`} 
                              />
                            ) : (
                              <>
                                {isL1 && <span style={{ marginRight: '5px', opacity: 0.7 }}>■</span>}
                                {isL2 && <span style={{ marginRight: '4px', opacity: 0.5 }}>▸</span>}
                                {!isL1 && !isL2 && <span style={{ marginRight: '4px', color: '#cbd5e1' }}>·</span>}
                              </>
                            )}
                            <span style={{ fontWeight: taskFw, color: taskColor, fontSize: taskFs }} className="truncate">
                              {taskText}
                            </span>
                          </div>
                          {taskText && (
                            <div className="absolute left-4 bottom-full mb-1.5 hidden group-hover:block z-30 bg-[#191f28] text-white text-[11px] rounded-lg px-2.5 py-1.5 max-w-none w-max whitespace-nowrap shadow-lg pointer-events-none leading-relaxed border border-[#333d4b]">
                              {taskText}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-xs text-[#3a4358] relative group" style={{ borderRight: cellBorder }}>
                          <div className="truncate max-w-[280px]">
                            {row.description || '—'}
                          </div>
                          {row.description && (
                            <div className="absolute left-4 bottom-full mb-1.5 hidden group-hover:block z-30 bg-[#191f28] text-white text-[11px] rounded-lg px-2.5 py-1.5 max-w-none w-max whitespace-nowrap shadow-lg pointer-events-none leading-relaxed border border-[#333d4b]">
                              {row.description}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-1.5 text-center text-xs text-[#3a4358]" style={{ borderRight: cellBorder }}>
                          {row.assignee || '—'}
                        </td>
                        <td className="py-2 px-1 text-center" style={{ borderRight: cellBorder }}>
                          <span 
                            className="px-2 py-0.5 rounded-md inline-block font-semibold text-[10px]" 
                            style={{ backgroundColor: sc.bg, color: sc.text }}
                          >
                            {row.status}
                          </span>
                        </td>

                        {/* 계획 시작 */}
                        <td className="py-2 px-1 text-center text-xs text-[#5a6478] text-[11px]" style={{ borderRight: cellBorder }}>
                          {row.plan_start || '—'}
                        </td>

                        {/* 계획 완료 */}
                        <td className="py-2 px-1 text-center text-xs text-[#5a6478] text-[11px]" style={{ borderRight: cellBorder }}>
                          {row.plan_end || '—'}
                        </td>

                        {/* 실제 시작 */}
                        <td className="py-2 px-1 text-center text-xs text-[#178055] text-[11px]" style={{ borderRight: cellBorder }}>
                          {row.actual_start || '—'}
                        </td>

                        {/* 실제 완료 */}
                        <td className="py-2 px-1 text-center text-xs text-[#178055] text-[11px]" style={{ borderRight: cellBorder }}>
                          {row.actual_end || '—'}
                        </td>

                        {/* 계획 진척율 */}
                        <td className="py-2 px-2 text-center" style={{ borderRight: cellBorder }}>
                          <span className="font-bold text-[11.5px] text-[#2563eb]">
                            {row.plan_progress}%
                          </span>
                        </td>

                        {/* 실제 진척율 */}
                        <td className="py-2 px-2 text-center">
                          <span className="font-bold text-[11.5px] text-[#178055]">
                            {row.actual_progress}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-5 py-2.5 border-t border-[#eef1f6] bg-[#fafbfd] text-[11px] text-[#8a93a6] shrink-0">
              <span>표시 <b className="text-[#3a4358]">{wbsRows.length}</b>개 업무</span>
              <span>출처: 프로젝트 WBS 상세 테이블</span>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
