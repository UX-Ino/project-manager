'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProject } from '../../../../context/ProjectContext';
import { supabase } from '../../../../lib/supabaseClient';
import { FileSpreadsheet, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { ImageViewerModal } from '../../../../components/Modals';

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

export default function ProjectA11yPage() {
  const params = useParams();
  const projectSlug = (params?.slug as string) || '';
  const { projects, showToast, fetchProjects } = useProject();

  const currentProject = projects.find(p => p.slug === projectSlug);
  const projectId = currentProject?.id || '';

  // Local State
  const [a11yItems, setA11yItems] = useState<ChecklistItem[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [a11yViewMode, setA11yViewMode] = useState<'dashboard' | 'table' | 'sheet'>('dashboard');
  const [a11yStatusFilter, setA11yStatusFilter] = useState<string>('all');
  const [a11ySortBy, setA11ySortBy] = useState<'sheet' | 'progress'>('sheet');
  const [expandedA11yGroups, setExpandedA11yGroups] = useState<Record<string, boolean>>({});
  
  const [a11ySheetUrlInput, setA11ySheetUrlInput] = useState('');
  const [editingA11ySheetUrl, setEditingA11ySheetUrl] = useState(false);

  const [viewerImageUrl, setViewerImageUrl] = useState('');
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Sync Input when project load or change
  useEffect(() => {
    if (currentProject) {
      setA11ySheetUrlInput(currentProject.a11y_sheet_url || '');
    }
  }, [currentProject]);

  // 1. Fetch A11y Items
  const fetchA11yChecklist = useCallback(async (pId: string) => {
    if (!pId) return;
    setDataLoading(true);
    try {
      const { data, error } = await supabase
        .from('checklist')
        .select('*')
        .eq('project_id', pId)
        .eq('phase', 'accessibility')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;
      setA11yItems(data || []);
    } catch (err: any) {
      console.error('Error fetching a11y checklist:', err.message);
      showToast('접근성 점검 항목을 불러오지 못했습니다.');
    } finally {
      setDataLoading(false);
    }
  }, [showToast]);

  // Load items on mount / project change
  useEffect(() => {
    if (projectId) {
      fetchA11yChecklist(projectId);
    }
  }, [projectId, fetchA11yChecklist]);

  // 2. Realtime Subscription Setup
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`realtime-a11y-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'checklist',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          // Re-fetch to get latest public data
          fetchA11yChecklist(projectId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, fetchA11yChecklist]);

  // 3. Save URL Handler
  const handleSaveA11ySheetUrl = async (pId: string, url: string) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ a11y_sheet_url: url || null })
        .eq('id', pId);

      if (error) throw error;

      showToast('구글 접근성 시트 연동 주소가 저장되었습니다.');
      setEditingA11ySheetUrl(false);
      await fetchProjects();
    } catch (err: any) {
      console.error(err);
      showToast(`주소 저장 실패: ${err.message}`);
    }
  };

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

  return (
    <section className="animate-fade-in flex flex-col" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h2 className="text-lg font-bold font-heading" style={{ color: '#191f28' }}>웹 접근성 점검리스트 (KWCAG 2.2)</h2>
          <p className="text-xs mt-0.5" style={{ color: '#8b95a1' }}>
            {currentProject.name ? `${currentProject.name} — ` : ''}한국형 웹 콘텐츠 접근성 지침 33개 항목 점검 대장
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-[#f2f4f6] rounded-lg p-1">
            <button
              onClick={() => setA11yViewMode('dashboard')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${a11yViewMode === 'dashboard' ? 'bg-white text-[#3182f6] shadow-sm' : 'text-[#8b95a1] hover:text-[#4e5968]'}`}
            >
              대시보드
            </button>
            <button
              onClick={() => setA11yViewMode('table')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${a11yViewMode === 'table' ? 'bg-white text-[#3182f6] shadow-sm' : 'text-[#8b95a1] hover:text-[#4e5968]'}`}
            >
              내부 점검 대장
            </button>
            <button
              onClick={() => setA11yViewMode('sheet')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${a11yViewMode === 'sheet' ? 'bg-white text-[#3182f6] shadow-sm' : 'text-[#8b95a1] hover:text-[#4e5968]'}`}
            >
              구글 시트 연동
            </button>
          </div>
        </div>
      </div>

      {(() => {
        const hasUrl = !!currentProject.a11y_sheet_url;

        // 연동 주소가 없거나 수정 상태일 때 (우선적으로 연동을 먼저 진행하도록 강제)
        if (!hasUrl || editingA11ySheetUrl) {
          const templateUri = "https://docs.google.com/spreadsheets/d/13A49_Y4h7UxTsJG35CW4vQnC1S4S0UgDqhGjWL176hY/copy";
          return (
            <div className="text-center p-10 rounded-2xl max-w-2xl mx-auto bg-white border border-[#e5e8eb] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="text-[#3182f6] mb-4 flex justify-center"><FileSpreadsheet className="w-12 h-12" /></div>
              <h4 className="font-bold text-[#191f28] mb-2 text-base">구글 접근성 점검 시트 연동이 필요합니다</h4>
              <p className="text-xs text-[#4e5968] mb-6 leading-relaxed">
                구글 드라이브 보안 정책상 새로 복사된 본인 사본의 고유 URL은 자동으로 전달되지 않습니다.<br />
                아래 3단계 절차에 따라 최초 1회 연동을 완료해 주세요.
              </p>

              {/* 3단계 가이드 프로세스 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 text-left">
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
                      구글 시트에서 점검 결과를 입력·수정한 뒤, 시트 상단 메뉴에서<br />
                      <strong>[🔄 접근성 동기화] → [DB로 접근성 동기화 실행]</strong> 을 클릭하면 앱에 데이터가 전송됩니다.
                    </p>
                  </div>
                </div>
              </div>

              {/* 템플릿 바로가기 카드 */}
              <div className="mb-6 p-4 rounded-xl bg-[#f9fafb] border border-[#e5e8eb] text-left">
                <div className="flex justify-between items-center gap-4">
                  <div>
                    <p className="text-xs font-bold text-[#191f28] mb-1">접근성 점검 표준 구글 시트 템플릿</p>
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
                    value={a11ySheetUrlInput}
                    onChange={(e) => setA11ySheetUrlInput(e.target.value)}
                    className="flex-1 bg-white border border-[#e5e8eb] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#3182f6]"
                    style={{ color: '#191f28' }}
                  />
                  <button 
                    onClick={() => handleSaveA11ySheetUrl(projectId, a11ySheetUrlInput)} 
                    className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                  >
                    연동 및 저장
                  </button>
                  {hasUrl && (
                    <button 
                      onClick={() => setEditingA11ySheetUrl(false)} 
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

        // 1. 대시보드 뷰
        if (a11yViewMode === 'dashboard') {
          const uniquePages = new Set<string>();
          let totalViolations = 0;
          let unfixedCount = 0;          // 조치필요
          let fixingCount = 0;           // 수정중
          let fixCompletedCount = 0;     // 수정완료
          let actionCompletedCount = 0;  // 조치완료
          let verifiedCount = 0;         // 검수완료

          let recognition = 0;
          let operation = 0;
          let understanding = 0;
          let robustness = 0;
          let others = 0;

          const depthGroups: Record<string, {
            name: string;
            items: ChecklistItem[];
            counts: Record<string, number>;
            total: number;
            progress: number;
            minSortOrder: number;
          }> = {};

          const getA11yItemStatus = (item: ChecklistItem): string => {
            const tagStr = (item.tag || '').trim();
            if (tagStr.includes('검수완료') || tagStr.includes('검수 완료') || item.checked) {
              return '검수완료';
            } else if (tagStr.includes('조치완료') || tagStr.includes('조치 완료')) {
              return '조치완료';
            } else if (tagStr.includes('수정완료') || tagStr.includes('수정 완료')) {
              return '수정완료';
            } else if (tagStr.includes('수정중') || tagStr.includes('수정 중') || tagStr.includes('진행')) {
              return '수정중';
            } else {
              return '조치필요';
            }
          };

          a11yItems.forEach(item => {
            // 페이지명 수집
            let pageName = '';
            if (item.memo) {
              try {
                const parsed = JSON.parse(item.memo);
                pageName = parsed.page_name || '';
              } catch {
                // Ignore
              }
            }
            
            if (pageName) {
              uniquePages.add(pageName);
            } else {
              uniquePages.add(item.group_name);
            }

            // 상태 분류 (O열 tag 값 기반 분류)
            const tagStr = (item.tag || '').trim();

            if (tagStr.includes('검수완료') || tagStr.includes('검수 완료') || item.checked) {
              verifiedCount++;
            } else if (tagStr.includes('조치완료') || tagStr.includes('조치 완료')) {
              actionCompletedCount++;
            } else if (tagStr.includes('수정완료') || tagStr.includes('수정 완료')) {
              fixCompletedCount++;
            } else if (tagStr.includes('수정중') || tagStr.includes('수정 중') || tagStr.includes('진행')) {
              fixingCount++;
            } else {
              unfixedCount++; // 조치필요, 대기 등
            }

            // depth(group_name)별 그룹화 추가
            const group = item.group_name || '기타';
            if (!depthGroups[group]) {
              depthGroups[group] = {
                name: group,
                items: [],
                counts: {
                  '조치필요': 0,
                  '수정중': 0,
                  '수정완료': 0,
                  '조치완료': 0,
                  '검수완료': 0
                },
                total: 0,
                progress: 0,
                minSortOrder: item.sort_order ?? 999999
              };
            } else {
              if (item.sort_order !== null && item.sort_order !== undefined && item.sort_order < depthGroups[group].minSortOrder) {
                depthGroups[group].minSortOrder = item.sort_order;
              }
            }
            depthGroups[group].items.push(item);
            depthGroups[group].total++;
            const itemStatus = getA11yItemStatus(item);
            if (depthGroups[group].counts[itemStatus] !== undefined) {
              depthGroups[group].counts[itemStatus]++;
            }

            // 원칙별 위반 계산
            if (!item.checked) {
              totalViolations++;

              const match = item.text.match(/^(\d+)/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (num >= 1 && num <= 9) {
                  recognition++;
                } else if (num >= 10 && num <= 18) {
                  operation++;
                } else if (num >= 19 && num <= 22) {
                  understanding++;
                } else if (num >= 23 && num <= 24) {
                  robustness++;
                } else {
                  others++;
                }
              } else {
                const textCombined = (item.text + " " + item.group_name).toLowerCase();
                if (textCombined.includes('인식')) {
                  recognition++;
                } else if (textCombined.includes('운용')) {
                  operation++;
                } else if (textCombined.includes('이해')) {
                  understanding++;
                } else if (textCombined.includes('견고')) {
                  robustness++;
                } else {
                  others++;
                }
              }
            }
          });

          // 각 그룹별 진척도 계산 및 세부 정렬
          Object.values(depthGroups).forEach(g => {
            g.progress = g.total > 0 ? Math.round((g.counts['검수완료'] / g.total) * 100) : 0;
            if (a11ySortBy === 'sheet') {
              g.items.sort((a, b) => (a.sort_order ?? 999999) - (b.sort_order ?? 999999));
            } else {
              const statusOrderLocal: Record<string, number> = {
                '조치필요': 1,
                '수정중': 2,
                '수정완료': 3,
                '조치완료': 4,
                '검수완료': 5
              };
              g.items.sort((a, b) => {
                const statusA = getA11yItemStatus(a);
                const statusB = getA11yItemStatus(b);
                const orderA = statusOrderLocal[statusA] || 99;
                const orderB = statusOrderLocal[statusB] || 99;
                if (orderA !== orderB) return orderA - orderB;
                return (a.sort_order ?? 0) - (b.sort_order ?? 0);
              });
            }
          });

          const sortedGroups = Object.values(depthGroups).sort((a, b) => {
            if (a11ySortBy === 'sheet') {
              return a.minSortOrder - b.minSortOrder;
            } else {
              if (a.progress !== b.progress) return a.progress - b.progress;
              return b.total - a.total;
            }
          });

          const totalPages = uniquePages.size;

          return (
            <div className="space-y-6">
              {/* 상단 카드 Grid */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {/* 1. 총 페이지 수 */}
                <div className="bg-white p-5 rounded-2xl border border-[#e5e8eb] shadow-sm flex flex-col justify-between h-[120px] transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
                  <span className="text-xs font-semibold text-[#8b95a1]">총 페이지 수</span>
                  <span className="text-3xl font-extrabold text-[#191f28]">{totalPages} <span className="text-sm font-bold text-[#8b95a1]">개</span></span>
                </div>
                
                {/* 2. 조치필요 */}
                <div className="bg-[#fdf3f4] p-5 rounded-2xl border border-[#fce8e6] shadow-sm flex flex-col justify-between h-[120px] transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
                  <span className="text-xs font-semibold text-[#c5221f]">조치필요</span>
                  <span className="text-3xl font-extrabold text-[#c5221f]">{unfixedCount} <span className="text-sm font-bold text-[#c5221f]/70">건</span></span>
                </div>

                {/* 3. 수정중 */}
                <div className="bg-[#e8f0fe] p-5 rounded-2xl border border-[#e8f0fe] shadow-sm flex flex-col justify-between h-[120px] transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
                  <span className="text-xs font-semibold text-[#1a73e8]">수정중</span>
                  <span className="text-3xl font-extrabold text-[#1a73e8]">{fixingCount} <span className="text-sm font-bold text-[#1a73e8]/70">건</span></span>
                </div>

                {/* 4. 수정완료 */}
                <div className="bg-[#fff9eb] p-5 rounded-2xl border border-[#fef7e0] shadow-sm flex flex-col justify-between h-[120px] transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
                  <span className="text-xs font-semibold text-[#b06000]">수정완료</span>
                  <span className="text-3xl font-extrabold text-[#b06000]">{fixCompletedCount} <span className="text-sm font-bold text-[#b06000]/70">건</span></span>
                </div>

                {/* 5. 조치완료 */}
                <div className="bg-[#f3e8ff] p-5 rounded-2xl border border-[#eeddff] shadow-sm flex flex-col justify-between h-[120px] transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
                  <span className="text-xs font-semibold text-[#7e22ce]">조치완료</span>
                  <span className="text-3xl font-extrabold text-[#7e22ce]">{actionCompletedCount} <span className="text-sm font-bold text-[#7e22ce]/70">건</span></span>
                </div>

                {/* 6. 검수완료 */}
                <div className="bg-[#e6f4ea] p-5 rounded-2xl border border-[#e6f4ea] shadow-sm flex flex-col justify-between h-[120px] transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
                  <span className="text-xs font-semibold text-[#137333]">검수완료</span>
                  <span className="text-3xl font-extrabold text-[#137333]">{verifiedCount} <span className="text-sm font-bold text-[#137333]/70">건</span></span>
                </div>
              </div>

              {/* 모든 점검 항목 완벽 적합 시 배너 표시 */}
              {totalViolations === 0 && (
                <div className="bg-[#e6f4ea] p-6 rounded-2xl border border-[#137333]/10 shadow-sm flex items-center gap-4 transition-all duration-200 hover:shadow-md">
                  <div className="text-3xl">🎉</div>
                  <div>
                    <h4 className="text-sm font-bold text-[#137333]">웹 접근성 기준 완벽 적합!</h4>
                    <p className="text-[11px] text-[#137333]/80 mt-0.5 leading-relaxed">
                      현재 점검 완료된 모든 페이지의 항목이 기준을 준수하고 있습니다. 발견된 웹 접근성 위반 사항이 전혀 없습니다.
                    </p>
                  </div>
                </div>
              )}

              {/* 메뉴 Depth별 상세 조치 현황 카드 */}
              <div className="bg-white p-6 rounded-2xl border border-[#e5e8eb] shadow-sm space-y-4 transition-all duration-200 hover:shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#191f28]">메뉴 Depth별 세부 조치 현황</h3>
                    <p className="text-[11px] text-[#8b95a1] mt-0.5">각 메뉴 경로(대분류 &gt; 중분류 &gt; 소분류) 뎁스별로 조치된 내용과 잔여 오류 파악</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] font-bold text-[#4e5968]">정렬 기준:</span>
                    <select
                      value={a11ySortBy}
                      onChange={(e) => setA11ySortBy(e.target.value as 'sheet' | 'progress')}
                      className="bg-[#f2f4f6] text-[#4e5968] text-[11px] font-bold px-2.5 py-1.5 rounded-lg border-none focus:ring-1 focus:ring-[#3182f6]/30 cursor-pointer outline-none transition-all"
                    >
                      <option value="sheet">구글 시트 순서 (기본)</option>
                      <option value="progress">조치 시급 순 (진척도 낮은 순)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  {sortedGroups.map((g, idx) => {
                    const isExpanded = !!expandedA11yGroups[g.name];
                    return (
                      <div key={idx} className="border border-[#e5e8eb] rounded-xl overflow-hidden bg-[#f9fafb]">
                        {/* 그룹 헤더 */}
                        <div 
                          onClick={() => {
                            setExpandedA11yGroups(prev => ({
                              ...prev,
                              [g.name]: !prev[g.name]
                            }));
                          }}
                          className="p-4 bg-white hover:bg-[#f9fafb] cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 select-none transition-colors border-b border-[#e5e8eb]/60"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#8b95a1] font-bold">depth</span>
                            <h4 className="text-xs font-bold text-[#1a3a5c] tracking-tight">{g.name}</h4>
                            <span className="px-1.5 py-0.5 bg-[#f2f4f6] text-[#4e5968] rounded-full text-[10px] font-extrabold shrink-0">
                              총 {g.total}건
                            </span>
                          </div>

                          {/* 상태 카운트 요약 배지들 */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                            {g.counts['조치필요'] > 0 && (
                              <span className="px-1.5 py-0.5 bg-[#fdf3f4] text-[#c5221f] rounded">
                                조치필요 {g.counts['조치필요']}
                              </span>
                            )}
                            {g.counts['수정중'] > 0 && (
                              <span className="px-1.5 py-0.5 bg-[#e8f0fe] text-[#1a73e8] rounded">
                                수정중 {g.counts['수정중']}
                              </span>
                            )}
                            {g.counts['수정완료'] > 0 && (
                              <span className="px-1.5 py-0.5 bg-[#fff9eb] text-[#b06000] rounded">
                                수정완료 {g.counts['수정완료']}
                              </span>
                            )}
                            {g.counts['조치완료'] > 0 && (
                              <span className="px-1.5 py-0.5 bg-[#f3e8ff] text-[#7e22ce] rounded">
                                조치완료 {g.counts['조치완료']}
                              </span>
                            )}
                            {g.counts['검수완료'] > 0 && (
                              <span className="px-1.5 py-0.5 bg-[#e6f4ea] text-[#137333] rounded">
                                검수완료 {g.counts['검수완료']}
                              </span>
                            )}

                            {/* 진척률 바 */}
                            <div className="flex items-center gap-2 ml-2">
                              <div className="w-16 bg-[#f2f4f6] h-2 rounded-full overflow-hidden shrink-0">
                                <div 
                                  className="h-full bg-gradient-to-r from-[#3182f6] to-[#137333] rounded-full transition-all duration-300"
                                  style={{ width: `${g.progress}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-[#191f28] shrink-0 w-8 text-right">{g.progress}%</span>
                            </div>

                            <div className="text-[#8b95a1] ml-1">
                              {isExpanded ? '▲' : '▼'}
                            </div>
                          </div>
                        </div>

                        {/* 펼쳐졌을 때의 세부 항목 목록 */}
                        {isExpanded && (
                          <div className="p-3 bg-white border-t border-[#e5e8eb]/40 divide-y divide-[#e5e8eb]/40 max-h-[350px] overflow-auto">
                            {g.items.map((item, subIdx) => {
                              const status = getA11yItemStatus(item);
                              let errorMsg = '';
                              let checkStatus = '';
                              if (item.memo) {
                                try {
                                  const parsed = JSON.parse(item.memo);
                                  errorMsg = parsed.error_msg || '';
                                  checkStatus = parsed.check_status || '';
                                } catch {
                                  errorMsg = item.memo;
                                }
                              }

                              return (
                                <div key={subIdx} className="py-2.5 flex items-start justify-between gap-4 text-xs">
                                  <div className="space-y-1 min-w-0 flex-1">
                                    <div className="flex items-start gap-1.5 flex-wrap">
                                      <span className="font-extrabold text-[#8b95a1] w-4 text-right shrink-0">
                                        {item.sort_order || subIdx + 1}
                                      </span>
                                      <span className={`font-bold text-[#191f28] ${item.checked ? 'line-through text-[#8b95a1]' : ''}`}>
                                        {item.text}
                                      </span>
                                      {item.assignee && (
                                        <span className="px-1.5 py-0.5 bg-[#f2f4f6] text-[#4e5968] rounded text-[10px] shrink-0 font-medium">
                                          {item.assignee}
                                        </span>
                                      )}
                                    </div>
                                    {errorMsg && (
                                      <p className="text-[11px] text-[#ef4444] pl-5 leading-relaxed font-semibold">
                                        오류: {errorMsg}
                                      </p>
                                    )}
                                    {checkStatus && (
                                      <p className="text-[10px] text-[#4e5968] pl-5">
                                        진단: {checkStatus}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {/* 증빙 이미지 보기 버튼 */}
                                    {item.image_url && (
                                      <button
                                        onClick={() => handleViewImage(item.image_url!)}
                                        className="px-2 py-0.5 text-[9px] bg-[#eff6ff] text-[#3182f6] hover:bg-[#3182f6] hover:text-white rounded border border-[#3182f6]/20 transition-all font-semibold cursor-pointer"
                                      >
                                        증빙 ↗
                                      </button>
                                    )}
                                    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                      status === '검수완료' ? 'bg-[#e6f4ea] text-[#137333] border border-[#137333]/10' :
                                      status === '조치완료' ? 'bg-[#f3e8ff] text-[#7e22ce] border border-[#eeddff]' :
                                      status === '수정완료' ? 'bg-[#fff9eb] text-[#b06000] border border-[#fef7e0]' :
                                      status === '수정중' ? 'bg-[#e8f0fe] text-[#1a73e8] border border-[#e8f0fe]' :
                                      'bg-[#fdf3f4] text-[#c5221f] border border-[#fce8e6]'
                                    }`}>
                                      {status}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        }

        // 2. 구글 시트 연동 뷰
        if (a11yViewMode === 'sheet') {
          const sheetUrl = currentProject.a11y_sheet_url || '';
          return (
            <div className="text-center p-16 rounded-2xl max-w-2xl mx-auto bg-white border border-[#e5e8eb] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="text-[#3182f6] mb-4 flex justify-center"><ExternalLink className="w-12 h-12" /></div>
              <h4 className="font-bold text-[#191f28] mb-2 text-base">구글 스프레드시트 접근성 점검표가 연동되어 있습니다</h4>
              <p className="text-xs text-[#8b95a1] mb-6 max-w-md mx-auto leading-relaxed">
                접근성 점검 관리는 연동된 구글 시트에서 실시간으로 이루어집니다.<br />아래 버튼을 클릭하여 새 창에서 시트를 열고 편집해 주세요.
              </p>
              <div className="flex items-center justify-center gap-3">
                <a 
                  href={sheetUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  구글 접근성 시트 열기 ↗
                </a>
                <button 
                  onClick={() => { setA11ySheetUrlInput(currentProject.a11y_sheet_url || ''); setEditingA11ySheetUrl(true); }} 
                  className="px-4 py-2.5 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  연동 주소 수정
                </button>
              </div>
            </div>
          );
        }

        // 3. 내부 점검 대장 뷰
        if (dataLoading) {
          return (
            <div className="text-center p-20 rounded-2xl text-sm bg-white border border-[#e5e8eb] text-[#8b95a1]">
              접근성 점검 항목을 불러오는 중입니다...
            </div>
          );
        }

        if (a11yItems.length === 0) {
          return (
            <div className="text-center p-20 rounded-2xl text-sm bg-white border border-[#e5e8eb] text-[#8b95a1]">
              등록된 웹 접근성 점검 항목이 없습니다. 구글 시트를 연동하고 동기화를 진행해주세요.
            </div>
          );
        }

        const getA11yItemStatus = (item: ChecklistItem): string => {
          const tagStr = (item.tag || '').trim();
          if (tagStr.includes('검수완료') || tagStr.includes('검수 완료') || item.checked) {
            return '검수완료';
          } else if (tagStr.includes('조치완료') || tagStr.includes('조치 완료')) {
            return '조치완료';
          } else if (tagStr.includes('수정완료') || tagStr.includes('수정 완료')) {
            return '수정완료';
          } else if (tagStr.includes('수정중') || tagStr.includes('수정 중') || tagStr.includes('진행')) {
            return '수정중';
          } else {
            return '조치필요';
          }
        };

        const statusOrder: Record<string, number> = {
          '조치필요': 1,
          '수정중': 2,
          '수정완료': 3,
          '조치완료': 4,
          '검수완료': 5
        };

        const sortedA11yItems = [...a11yItems].sort((a, b) => {
          const statusA = getA11yItemStatus(a);
          const statusB = getA11yItemStatus(b);
          const orderA = statusOrder[statusA] || 99;
          const orderB = statusOrder[statusB] || 99;
          
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return (a.sort_order || 0) - (b.sort_order || 0);
        });

        const statusCounts = {
          all: a11yItems.length,
          '조치필요': 0,
          '수정중': 0,
          '수정완료': 0,
          '조치완료': 0,
          '검수완료': 0
        };

        a11yItems.forEach(item => {
          const status = getA11yItemStatus(item);
          if (status in statusCounts) {
            statusCounts[status as keyof typeof statusCounts]++;
          }
        });

        const filteredA11yItems = sortedA11yItems.filter(item => {
          if (a11yStatusFilter === 'all') return true;
          return getA11yItemStatus(item) === a11yStatusFilter;
        });

        return (
          <div className="space-y-4">
            {/* 상태 필터 바 */}
            <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-[#e5e8eb]">
              {[
                { key: 'all', label: '전체', count: statusCounts.all, activeBg: 'bg-[#1a3a5c]', activeText: 'text-white' },
                { key: '조치필요', label: '조치필요', count: statusCounts['조치필요'], activeBg: 'bg-[#c5221f]', activeText: 'text-white' },
                { key: '수정중', label: '수정중', count: statusCounts['수정중'], activeBg: 'bg-[#1a73e8]', activeText: 'text-white' },
                { key: '수정완료', label: '수정완료', count: statusCounts['수정완료'], activeBg: 'bg-[#b06000]', activeText: 'text-white' },
                { key: '조치완료', label: '조치완료', count: statusCounts['조치완료'], activeBg: 'bg-[#7e22ce]', activeText: 'text-white' },
                { key: '검수완료', label: '검수완료', count: statusCounts['검수완료'], activeBg: 'bg-[#137333]', activeText: 'text-white' }
              ].map(tab => {
                const isActive = a11yStatusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setA11yStatusFilter(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                      isActive 
                        ? `${tab.activeBg} ${tab.activeText} shadow-sm` 
                        : 'bg-[#f2f4f6] text-[#4e5968] hover:bg-[#e5e8eb]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${isActive ? 'bg-white/20 text-white' : 'bg-[#e5e8eb] text-[#4e5968]'}`}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl overflow-hidden shadow-sm bg-white border border-[#dde1e7]">
              <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                <table className="w-full text-left border-collapse" style={{ fontSize: '12px', minWidth: '1050px', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '55px' }} />
                    <col style={{ width: '150px' }} />
                    <col style={{ width: '180px' }} />
                    <col style={{ width: '220px' }} />
                    <col style={{ width: '80px' }} />
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '75px' }} />
                    <col style={{ width: '180px' }} />
                  </colgroup>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr style={{ backgroundColor: '#1a3a5c', color: '#ffffff', borderBottom: '2px solid #0f2b47' }}>
                      <th className="py-2.5 px-3 font-bold text-center" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>no</th>
                      <th className="py-2.5 px-3 font-bold" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>메뉴</th>
                      <th className="py-2.5 px-3 font-bold" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>지침명</th>
                      <th className="py-2.5 px-3 font-bold" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>오류사항</th>
                      <th className="py-2.5 px-3 font-bold text-center" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>담당자</th>
                      <th className="py-2.5 px-3 font-bold text-center" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>배포상태</th>
                      <th className="py-2.5 px-3 font-bold text-center" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>점검상태</th>
                      <th className="py-2.5 px-3 font-bold text-center" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>이미지</th>
                      <th className="py-2.5 px-3 font-bold text-center" style={{ fontSize: '11px' }}>비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e8eb]">
                    {filteredA11yItems.map((item, idx) => {
                      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
                      const cellBorder = '1px solid #e5e8eb';

                      // memo 파싱 로직
                      let errorMsg = '';
                      let checkStatus = '';
                      let comment = '';

                      if (item.memo) {
                        try {
                          const parsed = JSON.parse(item.memo);
                          errorMsg = parsed.error_msg || '';
                          checkStatus = parsed.check_status || '';
                          comment = parsed.comment || '';
                        } catch (e) {
                          // JSON 형식이 아닌 경우 fallback
                          errorMsg = item.memo;
                          checkStatus = item.checked ? '적합' : '진행 필요';
                          comment = '';
                        }
                      } else {
                        checkStatus = item.checked ? '적합' : '진행 필요';
                      }

                      return (
                        <tr key={item.id} style={{ backgroundColor: rowBg, borderBottom: cellBorder }}>
                          {/* 1. no */}
                          <td className="py-2 px-3 text-center text-xs text-[#374151]" style={{ borderRight: cellBorder }}>
                            {item.sort_order || idx + 1}
                          </td>

                          {/* 2. 메뉴 */}
                          <td className="py-2 px-3 text-xs font-bold text-[#1a3a5c] relative group" style={{ borderRight: cellBorder, wordBreak: 'break-all' }}>
                            <div className="truncate max-w-[140px]">
                              {item.group_name}
                            </div>
                            {item.group_name && (
                              <div className="absolute left-4 bottom-full mb-1 hidden group-hover:block z-30 bg-[#191f28] text-white text-[11px] rounded-lg px-2.5 py-1.5 max-w-sm shadow-lg pointer-events-none leading-relaxed border border-[#333d4b] whitespace-normal word-break-all">
                                {item.group_name}
                              </div>
                            )}
                          </td>

                          {/* 3. 지침명 */}
                          <td className="py-2 px-3 text-xs text-[#374151] relative group" style={{ borderRight: cellBorder, wordBreak: 'break-all' }}>
                            <div className="truncate max-w-[170px]">
                              <span className={`${item.checked ? 'line-through text-[#8b95a1]' : ''}`}>
                                {item.text}
                              </span>
                            </div>
                            {item.text && (
                              <div className="absolute left-4 bottom-full mb-1 hidden group-hover:block z-30 bg-[#191f28] text-white text-[11px] rounded-lg px-2.5 py-1.5 max-w-sm shadow-lg pointer-events-none leading-relaxed border border-[#333d4b] whitespace-normal word-break-all">
                                {item.text}
                              </div>
                            )}
                          </td>

                          {/* 4. 오류사항 */}
                          <td className="py-2 px-3 text-xs text-[#374151] relative group" style={{ borderRight: cellBorder, wordBreak: 'break-all' }}>
                            <div className="truncate max-w-[210px]">
                              {errorMsg || '—'}
                            </div>
                            {errorMsg && (
                              <div className="absolute left-4 bottom-full mb-1 hidden group-hover:block z-30 bg-[#191f28] text-white text-[11px] rounded-lg px-2.5 py-1.5 max-w-sm shadow-lg pointer-events-none leading-relaxed border border-[#333d4b] whitespace-normal word-break-all">
                                {errorMsg}
                              </div>
                            )}
                          </td>

                          {/* 5. 담당자 */}
                          <td className="py-2 px-3 text-center text-xs text-[#374151]" style={{ borderRight: cellBorder }}>
                            {item.assignee || '—'}
                          </td>

                          {/* 6. 배포상태 */}
                          <td className="py-2 px-3 text-center text-xs" style={{ borderRight: cellBorder }}>
                            {item.tag ? (
                              <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                item.tag.includes('검수완료') || item.tag.includes('검수 완료') || item.checked ? 'bg-[#e6f4ea] text-[#137333] border border-[#137333]/10' :
                                item.tag.includes('조치완료') || item.tag.includes('조치 완료') ? 'bg-[#f3e8ff] text-[#7e22ce] border border-[#eeddff]' :
                                item.tag.includes('수정완료') || item.tag.includes('수정 완료') ? 'bg-[#fff9eb] text-[#b06000] border border-[#fef7e0]' :
                                item.tag.includes('수정중') || item.tag.includes('진행') || item.tag.includes('중') ? 'bg-[#e8f0fe] text-[#1a73e8] border border-[#e8f0fe]' :
                                'bg-[#fce8e6] text-[#c5221f] border border-[#fce8e6]'
                              }`}>
                                {item.tag}
                              </span>
                            ) : '—'}
                          </td>

                          {/* 7. 점검상태 */}
                          <td className="py-2 px-3 text-center text-xs" style={{ borderRight: cellBorder }}>
                            {checkStatus ? (
                              <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                checkStatus.includes('적합') || checkStatus.includes('검수완료') || checkStatus.includes('완료') || checkStatus.includes('통과') || checkStatus.includes('OK') ? 'bg-[#e6f4ea] text-[#137333] border border-[#137333]/10' :
                                checkStatus.includes('조치필요') || checkStatus.includes('오류') || checkStatus.includes('부적합') || checkStatus.includes('미흡') || checkStatus.includes('NG') ? 'bg-[#fce8e6] text-[#c5221f] border border-[#c5221f]/10' :
                                'bg-[#fef7e0] text-[#b06000] border border-[#b06000]/10'
                              }`}>
                                {checkStatus}
                              </span>
                            ) : '—'}
                          </td>

                          {/* 8. 이미지 */}
                          <td className="py-2 px-3 text-center" style={{ borderRight: cellBorder }}>
                            {item.image_url ? (
                              <button
                                onClick={() => handleViewImage(item.image_url!)}
                                className="px-2 py-1 text-[10px] bg-[#eff6ff] text-[#3182f6] hover:bg-[#3182f6] hover:text-white rounded border border-[#3182f6]/20 transition-all font-semibold cursor-pointer"
                              >
                                증빙 ↗
                              </button>
                            ) : (
                              <span className="text-xs text-[#8b95a1]">—</span>
                            )}
                          </td>

                          {/* 9. 비고 */}
                          <td className="py-2 px-3 text-xs text-[#4e5968] relative group">
                            <div className="truncate max-w-[170px]">
                              {comment || '—'}
                            </div>
                            {comment && (
                              <div className="absolute right-4 bottom-full mb-1 hidden group-hover:block z-30 bg-[#191f28] text-white text-[11px] rounded-lg px-2.5 py-1.5 max-w-sm shadow-lg pointer-events-none leading-relaxed border border-[#333d4b] whitespace-normal word-break-all">
                                {comment}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      <ImageViewerModal
        isOpen={isViewerOpen}
        imageUrl={viewerImageUrl}
        onClose={() => setIsViewerOpen(false)}
      />
    </section>
  );
}
