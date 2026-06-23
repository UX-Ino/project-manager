'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useProject } from '../context/ProjectContext';
import { supabase } from '../lib/supabaseClient';
import { Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import { ProjectModal } from '../components/Modals';

interface ProjectStat {
  id: string;
  name: string;
  slug: string;
  total: number;
  completed: number;
  progress: number;
  risks: number;
  docs: number;
  ext: number;
  created_at: string;
}

export default function Home() {
  const router = useRouter();
  const { session, authLoading, projects, projectsLoading, handleCreateProject } = useProject();

  // Local State
  const [globalStats, setGlobalStats] = useState<ProjectStat[]>([]);
  const [globalStatsLoading, setGlobalStatsLoading] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);

  // Compute stats across all projects
  const fetchGlobalStats = useCallback(async () => {
    setGlobalStatsLoading(true);
    try {
      const { data: projectsData, error: projError } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (projError) throw projError;
      const projs = projectsData || [];

      const { data: itemsData, error: itemsError } = await supabase
        .from('checklist')
        .select('id, project_id, checked, tag, phase');

      if (itemsError) throw itemsError;
      const allItems = itemsData || [];

      const stats: ProjectStat[] = projs.map(p => {
        // Exclude accessibility checks from global PM checklist metrics
        const projectItems = allItems.filter(item => item.project_id === p.id && item.phase !== 'accessibility');
        const total = projectItems.length;
        const completed = projectItems.filter(item => item.checked).length;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
        const risks = projectItems.filter(item => item.tag === 'risk' && !item.checked).length;
        const docs = projectItems.filter(item => item.tag === 'doc' && item.checked).length;
        const ext = projectItems.filter(item => item.tag === 'ext' && !item.checked).length;

        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          total,
          completed,
          progress,
          risks,
          docs,
          ext,
          created_at: p.created_at
        };
      });

      setGlobalStats(stats);
    } catch (err: any) {
      console.error('Error fetching global stats:', err.message);
    } finally {
      setGlobalStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchGlobalStats();
    } else {
      setGlobalStats([]);
    }
  }, [session, fetchGlobalStats, projects]);

  const handleCreateProjectSubmit = async (name: string, slug: string) => {
    const newProjectId = await handleCreateProject(name, slug);
    setIsProjectModalOpen(false);
    if (newProjectId) {
      router.push(`/projects/${slug}/checklist`);
    }
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-text-muted">
        <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
        <span className="text-xs">인증 정보를 확인하고 있습니다...</span>
      </div>
    );
  }

  return (
    <section className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold font-heading" style={{ color: '#191f28' }}>전체 프로젝트 통합 현황</h2>
          <p className="text-xs mt-0.5" style={{ color: '#8b95a1' }}>등록된 모든 체크리스트 프로젝트의 진척 및 위험 상태를 한눈에 모니터링합니다.</p>
        </div>
        <button
          onClick={() => setIsProjectModalOpen(true)}
          className="px-3.5 py-1.5 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
        >
          + 새 프로젝트 생성
        </button>
      </div>

      {globalStatsLoading || projectsLoading ? (
        <div className="flex flex-col items-center justify-center p-20 gap-4 text-text-muted bg-white border border-[#e5e8eb] rounded-2xl">
          <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
          <span className="text-xs">전체 진척 정보를 계산 중입니다...</span>
        </div>
      ) : globalStats.length === 0 ? (
        <div className="text-center p-20 bg-white border border-dashed border-[#e5e8eb] rounded-2xl space-y-4">
          <AlertCircle className="w-10 h-10 mx-auto text-[#8b95a1]" />
          <div className="text-sm font-semibold text-[#4e5968]">등록된 프로젝트가 없습니다.</div>
          <button
            onClick={() => setIsProjectModalOpen(true)}
            className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-medium rounded-lg cursor-pointer mx-auto transition-colors"
          >
            첫 프로젝트 만들기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {globalStats.map(stat => (
            <div 
              key={stat.id} 
              className="bg-white border border-[#e5e8eb] rounded-2xl p-6 flex flex-col justify-between gap-5 hover:border-[#3182f6]/25 hover:shadow-lg transition-all"
            >
              <div className="space-y-2">
                <div className="flex justify-between items-start gap-4">
                  <h3 className="text-base font-bold leading-tight truncate font-heading" style={{ color: '#191f28' }}>{stat.name}</h3>
                  <span className="text-xs font-bold text-[#3182f6] bg-blue-50 px-2 py-0.5 rounded-full shrink-0">
                    {stat.progress}% 완료
                  </span>
                </div>
                <div className="text-[10px] text-[#8b95a1]">
                  생성일: {new Date(stat.created_at).toLocaleDateString('ko-KR')}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="h-2 bg-[#f2f4f6] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#3182f6] to-[#00b493] rounded-full transition-all duration-300"
                    style={{ width: `${stat.progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-[#8b95a1] font-medium">
                  <span>할 일 진척도</span>
                  <span>{stat.completed} / {stat.total} 완료</span>
                </div>
              </div>

              {/* Info Badges Grid */}
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#e5e8eb]/60 text-center">
                <div className="bg-[#f9fafb] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#8b95a1] font-semibold">위험 리스크</div>
                  <div className={`text-sm font-bold mt-0.5 ${stat.risks > 0 ? 'text-[#ef4444]' : 'text-[#8b95a1]'}`}>
                    {stat.risks > 0 ? `⚠️ ${stat.risks}` : '0'}
                  </div>
                </div>
                <div className="bg-[#f9fafb] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#8b95a1] font-semibold">수집 산출물</div>
                  <div className="text-sm font-bold mt-0.5" style={{ color: '#3182f6' }}>
                    📄 {stat.docs}
                  </div>
                </div>
                <div className="bg-[#f9fafb] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#8b95a1] font-semibold">외부 솔루션</div>
                  <div className={`text-sm font-bold mt-0.5 ${stat.ext > 0 ? 'text-[#f5a623]' : 'text-[#8b95a1]'}`}>
                    {stat.ext > 0 ? `🔗 ${stat.ext}` : '0'}
                  </div>
                </div>
              </div>

              {/* Nav Button */}
              <button
                onClick={() => {
                  router.push(`/projects/${stat.slug}/checklist`);
                }}
                className="w-full py-2 bg-[#f2f4f6] hover:bg-blue-50 hover:text-[#3182f6] text-[#4e5968] text-xs font-semibold rounded-lg border border-[#e5e8eb] hover:border-[#3182f6]/20 flex items-center justify-center gap-1 cursor-pointer transition-all mt-1"
              >
                체크리스트 상세 관리 <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {isProjectModalOpen && (
        <ProjectModal
          isOpen={isProjectModalOpen}
          onClose={() => setIsProjectModalOpen(false)}
          onSubmit={handleCreateProjectSubmit}
          existingSlugs={projects.map(p => p.slug)}
          existingNames={projects.map(p => p.name)}
        />
      )}
    </section>
  );
}
