'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProject } from '../../../../context/ProjectContext';
import { supabase } from '../../../../lib/supabaseClient';
import { Loader2, AlertCircle, ClipboardCopy } from 'lucide-react';

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

export default function ProjectWeeklyPage() {
  const params = useParams();
  const projectSlug = (params?.slug as string) || '';
  const { projects, showToast } = useProject();

  const currentProject = projects.find(p => p.slug === projectSlug);
  const projectId = currentProject?.id || '';

  // Local State
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // 1. Fetch Checklist Items
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
    } catch (err: any) {
      console.error('Error fetching checklist for weekly report:', err.message);
      showToast('체크리스트 항목을 불러오지 못했습니다.');
    } finally {
      setDataLoading(false);
    }
  }, [showToast]);

  // Load items on mount / project change
  useEffect(() => {
    if (projectId) {
      fetchChecklist(projectId);
    }
  }, [projectId, fetchChecklist]);

  // Realtime Subscription Setup
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`realtime-weekly-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'checklist',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          fetchChecklist(projectId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, fetchChecklist]);

  const getPhaseKorean = (phaseStr: string) => {
    switch (phaseStr) {
      case 'pre': return '착수 전';
      case 'in_progress': return '진행 중';
      case 'review': return '심사 단계';
      case 'done': return '완료 후';
      default: return phaseStr;
    }
  };

  const pmItems = items.filter(item => item.phase !== 'accessibility');

  // Weekly Report Generation text
  const generateWeeklyReportText = () => {
    if (!currentProject) return '';
    const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // 1. Completed items (last 7 days checked or checked items)
    const completedList = pmItems.filter(item => item.checked);
    const completedText = completedList.length > 0
      ? completedList.map(item => `- [${getPhaseKorean(item.phase)} > ${item.group_name}] ${item.text} (${item.assignee || '담당자 미정'})`).join('\n')
      : '- 금주 신규 완료된 주요 점검 항목이 없습니다.';

    // 2. Scheduled/In Progress items
    const scheduledList = pmItems.filter(item => !item.checked && (item.phase === 'in_progress' || item.phase === 'review'));
    const scheduledText = scheduledList.length > 0
      ? scheduledList.map(item => `- [${getPhaseKorean(item.phase)} > ${item.group_name}] ${item.text} (예정일: ${item.due_date || '미정'} / 담당: ${item.assignee || '미정'})`).join('\n')
      : '- 진행 예정인 대기 항목이 없습니다.';

    // 3. Risks & External Solutions
    const riskList = pmItems.filter(item => !item.checked && (item.tag === 'risk' || item.tag === 'ext'));
    const riskText = riskList.length > 0
      ? riskList.map(item => `- [${item.tag === 'risk' ? '⚠️ 리스크' : '🔗 외부솔루션'} > ${item.group_name}] ${item.text} (담당: ${item.assignee || '미정'})`).join('\n')
      : '- 현재 보고된 미완료 리스크 및 외부 솔루션 대기 이슈가 없습니다.';

    // 4. Completed Docs
    const docList = pmItems.filter(item => item.tag === 'doc' && item.checked);
    const docText = docList.length > 0
      ? docList.map(item => `- [${item.group_name}] ${item.text} (인도자: ${item.assignee || '미정'})`).join('\n')
      : '- 현재 인도 및 확보된 공식 산출물이 없습니다.';

    return `[이트라이브 웹 접근성 프로젝트 주간 진척 보고]
프로젝트명: ${currentProject.name}
작성일자: ${todayStr}
------------------------------------------------------

1. 금주 완료 및 조치 사항
${completedText}

2. 차주 예정 및 추진 사항
${scheduledText}

3. 주요 리스크 및 미결 이슈
${riskText}

4. 공식 프로젝트 산출물 현황
${docText}

------------------------------------------------------
* 본 보고서는 Etribe PM Tool에 등록된 실시간 체크리스트 데이터를 바탕으로 자동 생성되었습니다.`;
  };

  const handleCopyWeeklyReport = () => {
    const reportText = generateWeeklyReportText();
    navigator.clipboard.writeText(reportText);
    showToast('주간보고 내용이 클립보드에 복사되었습니다.');
  };

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-text-muted">
        <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
        <span className="text-xs">프로젝트 정보를 불러오고 있습니다...</span>
      </div>
    );
  }

  return (
    <section className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold font-heading" style={{ color: '#191f28' }}>주간보고서 자동 생성기</h2>
          <p className="text-xs mt-0.5" style={{ color: '#8b95a1' }}>체크리스트 상태에 근거하여 이메일 및 메신저 공유용 주간보고서 텍스트를 구성합니다.</p>
        </div>
        <button
          onClick={handleCopyWeeklyReport}
          className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded flex items-center gap-1.5 cursor-pointer shadow transition-all"
        >
          <ClipboardCopy className="w-4 h-4" /> 클립보드에 복사하기
        </button>
      </div>

      {dataLoading ? (
        <div className="flex flex-col items-center justify-center p-20 gap-4 text-text-muted bg-white rounded-2xl border border-[#e5e8eb]">
          <Loader2 className="w-7 h-7 text-[#3182f6] animate-spin" />
          <span className="text-xs">데이터를 불러오는 중입니다...</span>
        </div>
      ) : pmItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-20 bg-white border border-[#e5e8eb] rounded-2xl space-y-4">
          <div className="text-text-muted"><AlertCircle className="w-10 h-10" /></div>
          <div>
            <h4 className="font-semibold text-text-main">체크리스트 데이터가 비어 있습니다</h4>
            <p className="text-xs text-text-muted mt-1">프로젝트의 체크리스트를 먼저 확인하고 체크해주세요.</p>
          </div>
        </div>
      ) : (
        <div className="bg-[#f9fafb] border border-[#e5e8eb] rounded-md p-6 relative">
          <pre className="text-xs font-mono text-[#191f28] leading-relaxed bg-white border border-[#e5e8eb] p-5 rounded overflow-x-auto whitespace-pre-wrap selection:bg-[#3182f6]/30">
            {generateWeeklyReportText()}
          </pre>
        </div>
      )}
    </section>
  );
}
