'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProject } from '../../../../context/ProjectContext';
import { supabase } from '../../../../lib/supabaseClient';
import { Loader2, AlertCircle, Files } from 'lucide-react';
import { ImageViewerModal } from '../../../../components/Modals';
import Link from 'next/link';

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

export default function ProjectDocumentsPage() {
  const params = useParams();
  const projectSlug = (params?.slug as string) || '';
  const { projects, showToast } = useProject();

  const currentProject = projects.find(p => p.slug === projectSlug);
  const projectId = currentProject?.id || '';

  // Local State
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [viewerImageUrl, setViewerImageUrl] = useState('');
  const [isViewerOpen, setIsViewerOpen] = useState(false);

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
      console.error('Error fetching documents data:', err.message);
      showToast('산출물 데이터를 불러오지 못했습니다.');
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
      .channel(`realtime-documents-${projectId}`)
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

  const handleViewImage = (imageUrl: string) => {
    setViewerImageUrl(imageUrl);
    setIsViewerOpen(true);
  };

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-text-muted">
        <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
        <span className="text-xs">프로젝트 정보를 불러오고 있습니다...</span>
      </div>
    );
  }

  const documentItems = items.filter(item => item.tag === 'doc' && item.checked);

  return (
    <section className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h2 className="text-xl font-bold font-heading" style={{ color: '#191f28' }}>산출물 보관함 (Documents)</h2>
          <p className="text-xs mt-0.5" style={{ color: '#8b95a1' }}>
            &quot;{currentProject.name}&quot; 프로젝트의 체크 완료된 산출물(doc) 목록입니다.
          </p>
        </div>
      </div>

      {dataLoading ? (
        <div className="flex flex-col items-center justify-center p-20 gap-4 text-text-muted bg-white rounded-2xl border border-[#e5e8eb]">
          <Loader2 className="w-7 h-7 text-[#3182f6] animate-spin" />
          <span className="text-xs">데이터를 불러오는 중입니다...</span>
        </div>
      ) : documentItems.length === 0 ? (
        <div className="text-center p-20 bg-white border border-dashed border-[#e5e8eb] rounded-2xl space-y-3">
          <Files className="w-10 h-10 mx-auto text-[#8b95a1]" />
          <div className="text-sm font-semibold text-[#4e5968]">현재 완료 처리된 공식 산출물이 없습니다.</div>
          <p className="text-xs text-[#8b95a1] max-w-sm mx-auto">
            체크리스트 페이지에서 <strong>&apos;📄 산출물&apos;</strong> 태그가 부착된 항목을 완료(체크)하고, 증빙용 심사 캡처 스크린샷 이미지를 등록해 주세요.
          </p>
          <Link
            href={`/projects/${projectSlug}/checklist`}
            className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg cursor-pointer mx-auto inline-block"
          >
            체크리스트 바로가기
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-[#e5e8eb] rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-[#f9fafb] border-b border-[#e5e8eb] text-[#8b95a1] text-xs font-semibold uppercase tracking-wider">
                  <th className="p-4">단계</th>
                  <th className="p-4">그룹명</th>
                  <th className="p-4">산출물 명칭 및 요구사항</th>
                  <th className="p-4">담당자</th>
                  <th className="p-4">마감일</th>
                  <th className="p-4">메모 (수정 리포트 링크 등)</th>
                  <th className="p-4 text-center">첨부 캡처</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e8eb] text-[#374151]">
                {documentItems.map(item => (
                  <tr key={item.id} className="hover:bg-[#f9fafb]/50 transition-colors">
                    <td className="p-4 text-xs font-semibold text-[#3182f6] uppercase">
                      {item.phase === 'pre' && '착수 전'}
                      {item.phase === 'in_progress' && '진행 중'}
                      {item.phase === 'review' && '심사 단계'}
                      {item.phase === 'done' && '완료 후'}
                    </td>
                    <td className="p-4 text-xs font-medium text-[#8b95a1]">{item.group_name}</td>
                    <td className="p-4 font-medium max-w-[280px]">
                      <div className="text-[#191f28] text-sm">{item.text}</div>
                    </td>
                    <td className="p-4 text-xs">
                      {item.assignee ? (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-[#3182f6] border border-blue-100">
                          {item.assignee}
                        </span>
                      ) : (
                        <span className="text-[#8b95a1]">-</span>
                      )}
                    </td>
                    <td className="p-4 text-xs font-medium text-[#8b95a1]">{item.due_date || '-'}</td>
                    <td className="p-4 text-xs text-[#8b95a1] max-w-[200px] truncate" title={item.memo || ''}>
                      {item.memo || <span className="text-[#8b95a1]/40 font-normal">비어있음</span>}
                    </td>
                    <td className="p-4 text-center">
                      {item.image_url ? (
                        <button
                          onClick={() => handleViewImage(item.image_url!)}
                          className="px-2.5 py-1 text-[10px] font-semibold bg-[#eff6ff] hover:bg-[#3182f6]/25 text-[#3182f6] border border-[#3182f6]/15 rounded cursor-pointer transition-colors"
                        >
                          보기 (Zoom)
                        </button>
                      ) : (
                        <span className="text-xs text-[#8b95a1]/40">미첨부</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ImageViewerModal
        isOpen={isViewerOpen}
        imageUrl={viewerImageUrl}
        onClose={() => setIsViewerOpen(false)}
      />
    </section>
  );
}
