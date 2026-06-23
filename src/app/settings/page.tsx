'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useProject } from '../../context/ProjectContext';
import { supabase } from '../../lib/supabaseClient';
import { Loader2, ShieldAlert } from 'lucide-react';

interface ProjectStat {
  id: string;
  name: string;
  total: number;
  completed: number;
  progress: number;
  risks: number;
  docs: number;
  ext: number;
  created_at: string;
}

export default function SettingsPage() {
  const { session, projects, projectsLoading } = useProject();

  const [globalStats, setGlobalStats] = useState<ProjectStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchGlobalStats = useCallback(async () => {
    setStatsLoading(true);
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
      console.error('Error fetching global stats in settings:', err.message);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchGlobalStats();
    }
  }, [session, fetchGlobalStats]);

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-text-muted">
        <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
        <span className="text-xs">계정 세션을 불러오고 있습니다...</span>
      </div>
    );
  }

  const totalProjects = projects.length;
  const totalTasks = globalStats.reduce((sum, item) => sum + item.total, 0);
  const avgProgress = totalProjects > 0 
    ? `${Math.round(globalStats.reduce((sum, item) => sum + item.progress, 0) / totalProjects)}%`
    : '0%';

  return (
    <section className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h2 className="text-xl font-bold font-heading" style={{ color: '#191f28' }}>시스템 설정</h2>
        <p className="text-xs mt-0.5" style={{ color: '#8b95a1' }}>PM 툴 계정 정보 및 데이터 통계를 관리하고 설정을 조율합니다.</p>
      </div>

      {/* Account Card */}
      <div className="bg-[#f9fafb] border border-[#e5e8eb] rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold border-l-2 border-[#3182f6] pl-2.5" style={{ color: '#191f28' }}>사용자 계정 정보</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-[#8b95a1]">로그인 이메일</div>
            <div className="font-semibold mt-1" style={{ color: '#191f28' }}>{session.user?.email}</div>
          </div>
          <div>
            <div className="text-[#8b95a1]">보안 인증 기관</div>
            <div className="font-semibold mt-1 flex items-center gap-1" style={{ color: '#ef4444' }}>
              <ShieldAlert className="w-3.5 h-3.5" /> 이트라이브 사내망
            </div>
          </div>
        </div>
      </div>

      {/* Data Statistics Card */}
      <div className="bg-[#f9fafb] border border-[#e5e8eb] rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold border-l-2 border-[#3182f6] pl-2.5" style={{ color: '#191f28' }}>데이터베이스 현황 통계</h3>
        {statsLoading || projectsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-[#3182f6] animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-white rounded-lg p-4 border border-[#e5e8eb]">
              <div className="text-[10px] font-semibold text-[#8b95a1] uppercase">총 프로젝트</div>
              <div className="text-xl font-extrabold text-[#3182f6] mt-1">{totalProjects}개</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-[#e5e8eb]">
              <div className="text-[10px] font-semibold text-[#8b95a1] uppercase">현재 할 일 항목</div>
              <div className="text-xl font-extrabold text-[#f14343] mt-1">{totalTasks}개</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-[#e5e8eb]">
              <div className="text-[10px] font-semibold text-[#8b95a1] uppercase">완료율 평균</div>
              <div className="text-xl font-extrabold text-[#00b493] mt-1">{avgProgress}</div>
            </div>
          </div>
        )}
      </div>

      {/* Features Toggle Panel */}
      <div className="bg-[#f9fafb] border border-[#e5e8eb] rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold border-l-2 border-[#3182f6] pl-2.5" style={{ color: '#191f28' }}>도구 기본 환경 설정</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center text-xs">
            <div>
              <div className="font-semibold" style={{ color: '#191f28' }}>실시간 데이터 동기화 (PostgreSQL Realtime)</div>
              <div className="text-[#8b95a1] mt-0.5">웹소켓 채널을 통해 다중 기기에서의 편집 데이터를 즉시 동기화합니다.</div>
            </div>
            <span className="px-2 py-1 bg-blue-50 text-[#3182f6] border border-blue-100 rounded font-bold">
              활성화됨
            </span>
          </div>

          <div className="flex justify-between items-center text-xs border-t border-[#e5e8eb] pt-4">
            <div>
              <div className="font-semibold" style={{ color: '#191f28' }}>파일 자동 정리 크론봇</div>
              <div className="text-[#8b95a1] mt-0.5">첨부 이미지를 변경하거나 삭제할 시 스토리지에서 잔여 고립 파일을 자동 폐기합니다.</div>
            </div>
            <span className="px-2 py-1 bg-blue-50 text-[#3182f6] border border-blue-100 rounded font-bold">
              동작 중
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
