'use client';

import React, { useState } from 'react';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { useProject } from '../context/ProjectContext';
import { Menu, ChevronRight, FolderPlus, Trash2 } from 'lucide-react';
import { ProjectModal } from './Modals';

interface HeaderProps {
  onMenuToggle: () => void;
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  
  const { projects, handleCreateProject, handleDeleteProject } = useProject();
  const [isProjModalOpen, setIsProjModalOpen] = useState(false);

  // 1. URL 정보 분석
  // 형식: /projects/[slug]/[menu] 또는 /projects/[slug]
  const pathParts = pathname.split('/').filter(Boolean);
  const activeProjectSlug = (params?.slug as string) || '';
  let activeMenu = 'dashboard';

  if (pathParts[0] === 'projects') {
    activeMenu = pathParts[2] || 'dashboard';
  } else if (pathParts[0] === 'settings') {
    activeMenu = 'settings';
  } else if (pathParts[0] === 'admin') {
    activeMenu = 'admin_users';
  }

  const currentProject = projects.find(p => p.slug === activeProjectSlug);

  // 2. 브레드크럼 라벨 매핑
  const getMenuLabel = () => {
    switch (activeMenu) {
      case 'checklist': return 'PM 체크리스트';
      case 'wbs': return 'WBS 일정표';
      case 'a11y': return '접근성 점검리스트';
      case 'weekly': return '주간보고서 생성기';
      case 'deploy-slides': return '배포리스트';
      case 'dashboard': return '프로젝트 현황판';
      case 'documents': return '산출물 보관함';
      case 'settings': return '시스템 설정';
      case 'admin_users': return '회원 관리';
      default: return '통합 현황판';
    }
  };

  // 3. 프로젝트 선택 변경 핸들러
  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextProjectSlug = e.target.value;
    if (!nextProjectSlug) {
      router.push('/');
      return;
    }

    // 현재 메뉴 탭을 유지하며 프로젝트만 교체
    if (activeMenu && activeMenu !== 'dashboard' && activeMenu !== 'settings' && activeMenu !== 'admin_users') {
      router.push(`/projects/${nextProjectSlug}/${activeMenu}`);
    } else {
      router.push(`/projects/${nextProjectSlug}`);
    }
  };

  // 4. 프로젝트 생성 핸들러
  const handleCreateSubmit = async (name: string, slug: string) => {
    const newId = await handleCreateProject(name, slug);
    if (newId) {
      // 신규 생성된 프로젝트의 대시보드 또는 체크리스트로 이동
      router.push(`/projects/${slug}/checklist`);
    }
  };

  // 5. 프로젝트 삭제 핸들러
  const handleDeleteClick = async () => {
    if (!currentProject) return;
    const isDeleted = await handleDeleteProject(currentProject.id);
    if (isDeleted) {
      router.push('/'); // 삭제 성공 시 메인 대시보드로 이동
    }
  };

  const isProjectRelatedMenu = 
    activeMenu === 'checklist' || 
    activeMenu === 'guide' ||
    activeMenu === 'wbs' || 
    activeMenu === 'a11y' || 
    activeMenu === 'weekly' || 
    activeMenu === 'deploy-slides' || 
    activeMenu === 'documents' ||
    activeMenu === 'reports' ||
    (pathParts[0] === 'projects' && pathParts.length === 2); // /projects/[slug]

  return (
    <header
      className="flex items-center justify-between px-5 md:px-8 py-3.5 sticky top-0 z-40"
      style={{
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderBottom: '1px solid #e5e8eb',
        backdropFilter: 'blur(16px)',
        minHeight: '60px',
      }}
    >
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger Button */}
        <button
          onClick={onMenuToggle}
          className="md:hidden p-1.5 rounded-lg cursor-pointer transition-colors"
          style={{ color: '#8b95a1', border: '1px solid #e5e8eb' }}
        >
          <Menu className="w-4.5 h-4.5" />
        </button>

        {/* Desktop Breadcrumbs */}
        <div className="hidden md:flex items-center gap-1.5 text-xs">
          <span style={{ color: '#8b95a1' }}>PM Tool</span>
          <ChevronRight className="w-3.5 h-3.5" style={{ color: '#c0c8d2' }} />
          <span className="font-semibold" style={{ color: '#191f28' }}>
            {getMenuLabel()}
          </span>
        </div>
      </div>

      {/* Project Selector Box */}
      {isProjectRelatedMenu && projects.length > 0 && (
        <div className="flex-1 max-w-[360px] mx-4 md:mx-8">
          <div className="flex gap-2">
            <select
              value={activeProjectSlug}
              onChange={handleProjectChange}
              className="w-full rounded-xl px-3 py-2 text-xs font-medium cursor-pointer transition-all"
              style={{
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e8eb',
                color: '#191f28',
              }}
            >
              <option value="">프로젝트 선택...</option>
              {projects.map(p => (
                <option key={p.id} value={p.slug}>{p.name}</option>
              ))}
            </select>

            {/* Project Quick Edit Controls (Checklist tab only) */}
            {activeMenu === 'checklist' && (
              <>
                <button
                  onClick={() => setIsProjModalOpen(true)}
                  title="새 프로젝트 추가"
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition-all"
                  style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e8eb', color: '#4e5968' }}
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
                {activeProjectSlug && (
                  <button
                    onClick={handleDeleteClick}
                    title="프로젝트 삭제"
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition-all"
                    style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e8eb', color: '#4e5968' }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Empty space filler if no dropdown */}
      {(!isProjectRelatedMenu || projects.length === 0) && (
        <div className="flex-1" />
      )}

      {/* Live Badge */}
      {!isProjectRelatedMenu && (
        <div
          className="text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shrink-0"
          style={{ backgroundColor: '#f0fdf9', color: '#00b493', border: '1px solid rgba(0,180,147,0.15)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse" />
          Live
        </div>
      )}

      {/* New Project Dialog */}
      <ProjectModal 
        isOpen={isProjModalOpen}
        onClose={() => setIsProjModalOpen(false)}
        onSubmit={handleCreateSubmit}
        existingSlugs={projects.map(p => p.slug)}
        existingNames={projects.map(p => p.name)}
      />
    </header>
  );
}
