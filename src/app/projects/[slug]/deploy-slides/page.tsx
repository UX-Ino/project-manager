'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProject } from '../../../../context/ProjectContext';
import { supabase } from '../../../../lib/supabaseClient';
import { FileSpreadsheet, Loader2, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface DeploySlide {
  id: string;
  project_id: string;
  slide_title: string;
  slide_url: string;
  created_at: string;
}

export default function ProjectDeploySlidesPage() {
  const params = useParams();
  const projectSlug = (params?.slug as string) || '';
  const { projects, showToast } = useProject();

  const currentProject = projects.find(p => p.slug === projectSlug);
  const projectId = currentProject?.id || '';

  // Local State
  const [deploySlides, setDeploySlides] = useState<DeploySlide[]>([]);
  const [slidesLoading, setSlidesLoading] = useState(false);
  const [deletingSlideId, setDeletingSlideId] = useState<string | null>(null);

  // 1. Fetch Deploy Slides History
  const fetchDeploySlides = useCallback(async (pId: string) => {
    if (!pId) return;
    setSlidesLoading(true);
    try {
      const { data, error } = await supabase
        .from('deploy_slides')
        .select('*')
        .eq('project_id', pId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDeploySlides(data || []);
    } catch (err: any) {
      console.error('Deploy slides fetch error:', err.message);
      showToast('배포 슬라이드 이력을 불러오지 못했습니다.');
    } finally {
      setSlidesLoading(false);
    }
  }, [showToast]);

  // Load items on mount / project change
  useEffect(() => {
    if (projectId) {
      fetchDeploySlides(projectId);
    }
  }, [projectId, fetchDeploySlides]);

  // 2. Realtime Subscription Setup
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`realtime-deploy-slides-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deploy_slides',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          fetchDeploySlides(projectId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, fetchDeploySlides]);

  // 3. Delete slide history
  const handleDeleteSlide = async (slideId: string, title: string) => {
    if (!confirm(`"${title}" 슬라이드 생성 이력을 삭제하시겠습니까?`)) return;
    setDeletingSlideId(slideId);
    try {
      const { error } = await supabase
        .from('deploy_slides')
        .delete()
        .eq('id', slideId);
      
      if (error) throw error;
      showToast('슬라이드 이력이 삭제되었습니다.');
      setDeploySlides(prev => prev.filter(s => s.id !== slideId));
    } catch (err: any) {
      console.error('Error deleting slide history:', err.message);
      showToast('이력 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingSlideId(null);
    }
  };

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-text-muted">
        <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
        <span className="text-xs">프로젝트 정보를 불러오고 있습니다...</span>
      </div>
    );
  }

  const hasA11ySheetUrl = !!currentProject.a11y_sheet_url;
  const a11ySheetUrl = currentProject.a11y_sheet_url || '';

  return (
    <section className="space-y-6 animate-fade-in w-full">
      <div>
        <h2 className="text-xl font-bold font-heading" style={{ color: '#191f28' }}>배포 슬라이드 자동 생성</h2>
        <p className="text-xs mt-0.5" style={{ color: '#8b95a1' }}>
          연동된 구글 시트의 &quot;배포리스트&quot; 탭에서 데이터를 가공한 후, 구글 시트 상단의 커스텀 메뉴를 클릭하여 주간 배포 슬라이드를 1초 만에 자동 생성합니다.
        </p>
      </div>

      <div className="space-y-6">
        {/* 상단 카드: 스프레드시트 연동 */}
        <div className="w-full">
          <div className="bg-white p-6 rounded-2xl border border-[#e5e8eb] shadow-sm flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            {hasA11ySheetUrl ? (
              <>
                <div>
                  <div className="text-[#107c41] mb-3"><FileSpreadsheet className="w-8 h-8" /></div>
                  <h4 className="font-bold mb-1.5 text-sm font-heading" style={{ color: '#191f28' }}>배포 데이터 연동 스프레드시트</h4>
                  <p className="text-xs text-[#4e5968] leading-relaxed mb-4">
                    [웹접근성 점검리스트] 탭에서 등록한 구글 시트입니다. 해당 시트의 <strong className="text-[#107c41]">&quot;배포리스트&quot;</strong> 탭에 기록된 수정 내역과 캡처 이미지를 바탕으로 구글 프레젠테이션(슬라이드)이 자동 생성됩니다.
                  </p>
                  
                  {/* 실행 절차 요약 안내 */}
                  <div className="mb-4 p-3.5 rounded-xl bg-[#f6f8fa] border border-[#e1e4e6] text-left space-y-2">
                    <p className="text-[11px] font-bold text-[#191f28]">💡 슬라이드 생성 4단계 흐름</p>
                    <ol className="text-[10px] text-[#4e5968] space-y-1.5 list-decimal pl-3.5">
                      <li>
                        아래 <strong>[구글 시트 열기]</strong>를 눌러 연동 시트로 이동합니다.
                      </li>
                      <li>
                        시트 내 <strong>&quot;배포리스트&quot;</strong> 탭에 으로 이동합니다.
                        필터로 [웹 접근성 상세 결과] 탭의 내용을 자동으로 가지고 옵니다.
                      </li>
                      <li>
                        스프레드시트 상단 메뉴바의 <strong>[슬라이드 자동화]</strong>을 클릭하여 실행합니다.
                      </li>
                      <li>
                        Apps Script가 구글 드라이브에 슬라이드를 생성하며, 본 웹 앱의 하단 <strong>[생성 이력]</strong> 목록에 실시간 누적됩니다.
                      </li>
                    </ol>
                  </div>

                  {/* 컬럼 규격 안내 접이식 아코디언 */}
                  <details className="mb-4 text-left border border-[#e5e8eb] rounded-xl overflow-hidden bg-white">
                    <summary className="p-3 text-[11px] font-semibold text-[#191f28] hover:bg-[#f9fafb] cursor-pointer flex justify-between items-center select-none">
                      <span>📋 배포리스트 시트 컬럼 규격 안내 (A~I열)</span>
                    </summary>
                    <div className="p-3 border-t border-[#e5e8eb] bg-[#f9fafb] text-[10px] text-[#4e5968] overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[450px]">
                        <thead>
                          <tr className="border-b border-[#e5e8eb]">
                            <th className="pb-1 font-bold w-12 text-[#191f28]">열</th>
                            <th className="pb-1 font-bold w-16 text-[#191f28]">항목명</th>
                            <th className="pb-1 font-bold text-[#191f28]">작성 규칙 및 필수값 여부</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e5e8eb]/60">
                          <tr>
                            <td className="py-1.5 font-semibold text-[#3182f6]">A열</td>
                            <td className="py-1.5 font-medium text-[#191f28]">SheetNo</td>
                            <td className="py-1.5 text-[#4e5968]">웹 접근성 상세 결과 탭 No</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 font-semibold text-[#3182f6]">B열</td>
                            <td className="py-1.5 font-medium text-[#191f28]">No</td>
                            <td className="py-1.5 text-[#4e5968]">순서</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 font-semibold text-[#3182f6]">C열</td>
                            <td className="py-1.5 font-medium text-[#191f28]">분류</td>
                            <td className="py-1.5 text-[#4e5968]">수정 메뉴/위치 (예: 공통, 메인)</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 font-semibold text-[#3182f6]">D열</td>
                            <td className="py-1.5 font-medium text-[#191f28]">수정내용</td>
                            <td className="py-1.5 text-[#4e5968]">상세 수정 내역 (상세 페이지 중앙 텍스트)</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 font-semibold text-[#3182f6]">E열</td>
                            <td className="py-1.5 font-medium text-[#191f28]">작업자</td>
                            <td className="py-1.5 text-[#4e5968]">수정한 담당자 이름</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 font-semibold text-[#3182f6]">F열</td>
                            <td className="py-1.5 font-medium text-[#191f28]">URL</td>
                            <td className="py-1.5 text-[#4e5968]">해당 화면의 전체 웹 주소 (새 창 이동 연결용)</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 font-semibold text-[#3182f6]">G열</td>
                            <td className="py-1.5 font-medium text-[#191f28]">이미지</td>
                            <td className="py-1.5 text-[#e04452] font-semibold">오류 영역 캡쳐 본</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 font-semibold text-[#3182f6]">H열</td>
                            <td className="py-1.5 font-medium text-[#191f28]">이미지 URL</td>
                            <td className="py-1.5 text-[#8b95a1]">스크립트가 이미지 자동 추출 후 기입하는 영역 (직접 작성 X)</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 font-semibold text-[#3182f6]">I열</td>
                            <td className="py-1.5 font-medium text-[#191f28]">주석명</td>
                            <td className="py-1.5 text-[#4e5968]">상세 슬라이드 페이지 하단에 표기할 추가 조치/설명</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>
                <a 
                  href={a11ySheetUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full py-2.5 bg-[#107c41] hover:bg-[#0b592e] text-white text-xs font-semibold rounded-lg text-center transition-colors cursor-pointer block"
                >
                  구글 시트 열기
                </a>
              </>
            ) : (
              <>
                <div>
                  <div className="text-[#8b95a1] mb-3"><FileSpreadsheet className="w-8 h-8" /></div>
                  <h4 className="font-bold text-[#8b95a1] mb-1.5 text-sm font-heading">배포 데이터 연동 스프레드시트</h4>
                  <p className="text-xs text-[#8b95a1] leading-relaxed mb-4">
                    구글 스프레드시트가 아직 연동되지 않았습니다. <strong>[웹접근성 점검리스트] ➡ [구글 시트 연동]</strong> 메뉴에서 표준 구글 시트를 먼저 연동해 주세요.
                  </p>
                </div>
                <Link
                  href={`/projects/${projectSlug}/a11y`}
                  className="w-full py-2.5 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] text-xs font-semibold rounded-lg text-center transition-colors cursor-pointer block"
                >
                  웹접근성 점검리스트 탭으로 이동 ➡
                </Link>
              </>
            )}
          </div>
        </div>

        {/* 배포 슬라이드 생성 이력 섹션 */}
        <div className="bg-white p-6 rounded-2xl border border-[#e5e8eb] shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-1.5 font-heading" style={{ color: '#191f28' }}>
                <span>📊 배포 슬라이드 생성 이력</span>
                {slidesLoading && <Loader2 className="w-3.5 h-3.5 text-[#3182f6] animate-spin" />}
              </h3>
              <p className="text-[11px] text-[#8b95a1] mt-0.5">구글 스프레드시트에서 생성 버튼을 실행하여 누적된 슬라이드 히스토리입니다.</p>
            </div>
          </div>

          {deploySlides.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-[#e5e8eb] rounded-xl text-[#8b95a1] text-xs">
              아직 자동 생성된 배포 슬라이드가 없습니다.<br />
              연동된 구글 시트에서 슬라이드 생성을 실행해 보세요.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse border border-[#e5e8eb]">
                <colgroup>
                  <col style={{ width: '50px' }} />
                  <col style={{ width: '200px' }} />
                  <col style={{ width: '' }} />
                  <col style={{ width: '112px' }} />
                  <col style={{ width: '80px' }} />
                </colgroup>
                <thead>
                  <tr className="bg-[#f2f4f6] text-[#4e5968] font-bold border-b border-[#e5e8eb]">
                    <th className="p-2.5 border-r border-[#e5e8eb] w-12 text-center">No</th>
                    <th className="p-2.5 border-r border-[#e5e8eb] w-36">생성 일시</th>
                    <th className="p-2.5 border-r border-[#e5e8eb]">슬라이드 이름</th>
                    <th className="p-2.5 border-r border-[#e5e8eb] text-center w-28">바로가기</th>
                    <th className="p-2.5 text-center w-20">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e8eb] text-[#374151]">
                  {deploySlides.map((slide, idx) => (
                    <tr key={slide.id} className="hover:bg-[#f9fafb] transition-colors">
                      <td className="p-2.5 border-r border-[#e5e8eb] text-center font-mono text-[#8b95a1]">
                        {deploySlides.length - idx}
                      </td>
                      <td className="p-2.5 border-r border-[#e5e8eb] text-[#6b7280]">
                        {new Date(slide.created_at).toLocaleString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="p-2.5 border-r border-[#e5e8eb] font-semibold text-[#191f28]">
                        {slide.slide_title}
                      </td>
                      <td className="p-2.5 border-r border-[#e5e8eb] text-center">
                        <a
                          href={slide.slide_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1 px-3 py-1 bg-[#3182f6] hover:bg-[#1b64da] text-white text-[11px] font-semibold rounded transition-colors cursor-pointer"
                        >
                          슬라이드 열기 
                        </a>
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => handleDeleteSlide(slide.id, slide.slide_title)}
                          disabled={deletingSlideId === slide.id}
                          className="inline-flex items-center justify-center p-1.5 bg-[#f2f4f6] hover:bg-[#fee2e2] text-[#4e5968] hover:text-[#df2222] rounded transition-colors cursor-pointer"
                          title="이력 삭제"
                        >
                          {deletingSlideId === slide.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
