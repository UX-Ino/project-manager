'use client';
 
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useProject, Project } from '../context/ProjectContext';
import {
  Loader2, AlertCircle, Trash2, CheckCircle2, Circle, Plus,
  Calendar, Layers, Clock, ArrowRight
} from 'lucide-react';
import { ProjectModal } from '../components/Modals';
 
export default function Home() {
  const router = useRouter();
  const {
    authLoading,
    projects,
    projectsLoading,
    handleCreateProject,
    handleDeleteProject,
    handleUpdateProjectStatus
  } = useProject();
 
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
 
  // 프로젝트 정렬 로직:
  // 1순위: 진행 중(is_completed = false)인 프로젝트가 우선
  // 2순위: 생성 날짜 최신순
  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const aComp = a.is_completed ? 1 : 0;
      const bComp = b.is_completed ? 1 : 0;
      
      if (aComp !== bComp) {
        return aComp - bComp;
      }
      
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [projects]);
 
  // 미니 통계 계산
  const stats = useMemo(() => {
    const total = projects.length;
    const completed = projects.filter(p => p.is_completed).length;
    const active = total - completed;
    return { total, completed, active };
  }, [projects]);
 
  const handleCreateProjectSubmit = async (name: string, slug: string) => {
    const newProjectId = await handleCreateProject(name, slug);
    setIsProjectModalOpen(false);
    if (newProjectId) {
      router.push(`/projects/${slug}/checklist`);
    }
  };
 
  const handleDelete = async (e: React.MouseEvent, pId: string, pName: string) => {
    e.stopPropagation();
    if (!window.confirm(`정말 '${pName}' 프로젝트를 완전히 삭제하시겠습니까?\n체크리스트와 WBS 일정 등 모든 데이터가 DB에서 영구 삭제됩니다.`)) {
      return;
    }
    await handleDeleteProject(pId);
  };
 
  const handleToggleComplete = async (e: React.MouseEvent, pId: string, currentStatus: boolean) => {
    e.stopPropagation();
    await handleUpdateProjectStatus(pId, !currentStatus);
  };
 
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
 
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-[#8b95a1]">
        <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
        <span className="text-xs">인증 정보를 확인하고 있습니다...</span>
      </div>
    );
  }
 
  if (projectsLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-[#8b95a1] bg-white border border-[#e5e8eb] rounded-2xl">
        <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
        <span className="text-xs">프로젝트 목록을 불러오고 있습니다...</span>
      </div>
    );
  }
 
  return (
    <section className="space-y-6 animate-fade-in flex flex-col" style={{ minHeight: 0 }}>
      {/* Top Header & Project Count Widgets */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#e8ecf3] shrink-0">
        <div>
          <h2 className="text-xl font-extrabold font-heading text-[#101727] tracking-tight">통합 현황판</h2>
          <p className="text-xs mt-0.5 text-[#8a93a6] font-medium">
            전체 등록된 웹 접근성 프로젝트들의 진행도를 한 눈에 관리합니다.
          </p>
        </div>
 
        <button
          onClick={() => setIsProjectModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-bold rounded-xl cursor-pointer transition-colors shadow-sm focus:outline-none"
        >
          <Plus className="w-4 h-4" />
          새 프로젝트 추가
        </button>
      </div>
 
      {/* Project mini stats row */}
      {projects.length > 0 && (
        <div className="grid grid-cols-3 gap-4 shrink-0 font-sans">
          <div className="bg-white border border-[#e8ecf3] rounded-xl p-3.5 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#eaf1ff] flex items-center justify-center text-[#2563eb]">
              <Layers className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-[#8a93a6] uppercase tracking-wider">전체 프로젝트</div>
              <div className="text-lg font-black text-[#101727]">{stats.total}건</div>
            </div>
          </div>
          <div className="bg-white border border-[#e8ecf3] rounded-xl p-3.5 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#fff1f3] flex items-center justify-center text-[#d11d44]">
              <Clock className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-[#8a93a6] uppercase tracking-wider">진행중</div>
              <div className="text-lg font-black text-[#d11d44]">{stats.active}건</div>
            </div>
          </div>
          <div className="bg-white border border-[#e8ecf3] rounded-xl p-3.5 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#e6f6ee] flex items-center justify-center text-[#178055]">
              <CheckCircle2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-[#8a93a6] uppercase tracking-wider">완료됨</div>
              <div className="text-lg font-black text-[#178055]">{stats.completed}건</div>
            </div>
          </div>
        </div>
      )}
 
      {/* Projects list/card grid */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {projects.length === 0 ? (
          <div className="text-center p-20 bg-white border border-dashed border-[#e5e8eb] rounded-2xl space-y-4">
            <AlertCircle className="w-10 h-10 mx-auto text-[#8b95a1]" />
            <div className="text-sm font-semibold text-[#4e5968]">등록된 프로젝트가 없습니다.</div>
            <button
              onClick={() => setIsProjectModalOpen(true)}
              className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-medium rounded-lg cursor-pointer mx-auto transition-colors focus:outline-none"
            >
              첫 프로젝트 만들기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-8 font-sans">
            {sortedProjects.map((p) => {
              const isComp = !!p.is_completed;
              return (
                <div
                  key={p.id}
                  onClick={() => router.push(`/projects/${p.slug}/checklist`)}
                  className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 -translate-y-0 hover:-translate-y-1 cursor-pointer flex flex-col justify-between min-h-[160px] relative overflow-hidden group ${
                    isComp 
                      ? 'border-[#e2e8f0] bg-[#f8fafc]/55 opacity-75 saturate-75' 
                      : 'border-[#e8ecf3] hover:border-[#3182f6]/40'
                  }`}
                >
                  {/* Card glow highlight for active projects */}
                  {!isComp && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#2563eb] to-[#0d8a72] opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                  {isComp && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-[#94a3b8] opacity-50" />
                  )}
 
                  <div>
                    {/* Project Name and Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <h4 className={`text-[15px] font-extrabold tracking-tight truncate leading-snug flex-1 ${
                        isComp ? 'text-[#64748b] line-through decoration-1' : 'text-[#1a2030]'
                      }`} title={p.name}>
                        {p.name}
                      </h4>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 select-none ${
                        isComp 
                          ? 'bg-[#e2e8f0] text-[#64748b]' 
                          : 'bg-[#eaf1ff] text-[#2563eb]'
                      }`}>
                        {isComp ? '완료' : '진행중'}
                      </span>
                    </div>
 
                    <div className="text-[11px] text-[#8a93a6] font-semibold mt-1">
                      slug: <span className="font-mono text-[#4e5968] bg-[#f2f4f9] px-1 py-0.5 rounded text-[10px]">{p.slug}</span>
                    </div>
                  </div>
 
                  <div className="mt-6 pt-4 border-t border-[#f1f3f8] flex items-center justify-between">
                    {/* Date */}
                    <div className="flex items-center gap-1 text-[11px] text-[#9aa2b3] font-medium">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formatDate(p.created_at)}</span>
                    </div>
 
                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      {/* Check toggle */}
                      <button
                        onClick={(e) => handleToggleComplete(e, p.id, isComp)}
                        title={isComp ? '진행 중으로 변경' : '완료 처리'}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer bg-white flex items-center justify-center ${
                          isComp 
                            ? 'border-[#10b981] text-[#10b981] hover:bg-[#10b981]/10 shadow-[0_1px_3px_rgba(16,185,129,0.1)]' 
                            : 'border-[#cbd5e1] text-[#64748b] hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#f5f8ff]'
                        }`}
                      >
                        {isComp ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                      </button>
 
                      {/* Delete project */}
                      <button
                        onClick={(e) => handleDelete(e, p.id, p.name)}
                        title="프로젝트 삭제"
                        className="p-1.5 rounded-lg border border-[#cbd5e1] text-[#b6bdca] hover:border-[#ef4444] hover:text-[#ef4444] hover:bg-[#fdeaee] transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
 
                      {/* Go to checklist */}
                      <span className="p-1.5 rounded-lg border border-[#3182f6] text-[#3182f6] bg-[#f5f8ff] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ArrowRight className="w-3.5 h-3.5 animate-pulse-horizontal" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
 
            {/* Blank Slot to create new project */}
            <div
              onClick={() => setIsProjectModalOpen(true)}
              className="border-2 border-dashed border-[#d8dee9] hover:border-[#3182f6] rounded-2xl p-5 flex flex-col items-center justify-center text-[#8a93a6] hover:text-[#3182f6] transition-all duration-300 min-h-[160px] cursor-pointer hover:bg-[#f5f8ff]/25 group select-none"
            >
              <div className="w-10 h-10 rounded-full bg-[#f2f4f9] group-hover:bg-[#3182f6]/10 flex items-center justify-center mb-2.5 transition-colors">
                <Plus className="w-5 h-5 text-[#8a93a6] group-hover:text-[#3182f6] transition-colors" />
              </div>
              <span className="text-[12.5px] font-extrabold tracking-tight">새 프로젝트 추가</span>
              <span className="text-[10px] mt-0.5 text-[#9aa2b3] font-medium text-center">웹 접근성 프로젝트를 추가하세요</span>
            </div>
          </div>
        )}
      </div>
 
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
