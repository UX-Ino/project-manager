'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useProject } from '../context/ProjectContext';
import {
  LogOut, CheckSquare, LayoutDashboard, Settings, Users, ClipboardList
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, projects, showToast } = useProject();

  // 1. URL 분석하여 activeProjectSlug 및 activeMenu 추출
  // 형식: /projects/[slug]/[menu] 또는 /projects/[slug]
  const [activeProjectSlug, setActiveProjectSlug] = useState('');
  const pathParts = pathname.split('/').filter(Boolean);
  const isProjectSelected = pathParts[0] === 'projects' && !!pathParts[1];
  let activeMenu = 'dashboard';

  if (pathParts[0] === 'projects' && pathParts[1]) {
    activeMenu = pathParts[2] || 'dashboard'; // /projects/[slug] 는 프로젝트 대시보드
  } else if (pathParts[0] === 'settings') {
    activeMenu = 'settings';
  } else if (pathParts[0] === 'admin') {
    activeMenu = 'admin_users';
  }

  useEffect(() => {
    const updateSlug = () => {
      const parts = pathname.split('/').filter(Boolean);
      if (parts[0] === 'projects' && parts[1]) {
        setActiveProjectSlug(parts[1]);
        localStorage.setItem('activeProjectSlug', parts[1]);
      } else {
        const saved = localStorage.getItem('activeProjectSlug');
        if (saved) {
          setActiveProjectSlug(saved);
        } else if (projects.length > 0) {
          setActiveProjectSlug(projects[0].slug);
        }
      }
    };

    updateSlug();
    window.addEventListener('storage', updateSlug);
    return () => window.removeEventListener('storage', updateSlug);
  }, [pathname, projects]);

  // 2. 권한 확인 (is_admin 메타데이터)
  const isAdmin = !!session?.user?.user_metadata?.is_admin;

  const handleLogout = async () => {
    const { supabase } = await import('../lib/supabaseClient');
    await supabase.auth.signOut();
    showToast('로그아웃 되었습니다.');
    router.push('/');
  };

  const getMenuLink = (menuKey: string) => {
    if (menuKey === 'dashboard') return '/';
    if (menuKey === 'settings') return '/settings';
    if (menuKey === 'admin_users') return '/admin';
    
    // 프로젝트 종속 서브메뉴
    return activeProjectSlug ? `/projects/${activeProjectSlug}/${menuKey}` : '/';
  };

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#e5e8eb] flex flex-col transition-transform duration-300 md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center gap-3 px-5 py-4.5 border-b border-[#e8ecf3] shrink-0">
          <div
            className="w-9.5 h-9.5 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              boxShadow: '0 4px 10px rgba(37, 99, 235, 0.28)'
            }}
          >
            <CheckSquare className="w-5.5 h-5.5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="font-extrabold text-[15px] tracking-tight text-[#101727]">Etribe PM</div>
            <div className="text-[10.5px] text-[#8a93a6] font-medium">웹 접근성 PM 툴</div>
          </div>
        </div>

        {/* Sidebar Menu Items */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {/* Main Tab: Dashboard */}
          <div className="space-y-0.5">
            <Link
              href={getMenuLink('dashboard')}
              onClick={onClose}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
              style={
                activeMenu === 'dashboard' && pathParts[0] !== 'projects'
                  ? { backgroundColor: '#eff6ff', color: '#3182f6', fontWeight: 600 }
                  : { color: '#4e5968' }
              }
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              통합 현황판
            </Link>
          </div>

          {/* Main Tab & Submenu: Project Checklist Section */}
          {isProjectSelected && activeProjectSlug && (
            <div className="space-y-0.5">
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider mb-2 text-[#c0c8d2]">
                Checklist & WBS
              </div>
 
              <Link
                href={getMenuLink('guide')}
                onClick={onClose}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
                style={
                  ['guide','reports','wbs','a11y','weekly','deploy-slides','issues'].includes(activeMenu)
                    ? { backgroundColor: '#eff6ff', color: '#3182f6', fontWeight: 600 }
                    : { color: '#4e5968' }
                }
              >
                <ClipboardList className="w-4 h-4 shrink-0" />
                프로젝트 체크리스트
              </Link>
 
              {/* Nested Sub-menus */}
              <div className="ml-5 pl-3 py-1 space-y-0.5" style={{ borderLeft: '1.5px solid #e8ecf3' }}>
                {[
                  { key: 'reports', label: '리포트' },
                  { key: 'guide', label: '포지션별 가이드' },
                  { key: 'wbs', label: 'WBS 일정표' },
                  { key: 'a11y', label: '접근성 점검리스트' },
                  { key: 'deploy-slides', label: '배포리스트' },
                  { key: 'weekly', label: '주간보고서 생성기' },
                  { key: 'issues', label: '이슈사항' },
                ].map(({ key, label }) => {
                  const isTabActive = activeMenu === key;
                  return (
                    <Link
                      key={key}
                      href={`/projects/${activeProjectSlug}/${key}`}
                      onClick={onClose}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs transition-all block font-medium"
                      style={
                        isTabActive
                          ? { color: '#2563eb', backgroundColor: '#eff6ff', fontWeight: 700 }
                          : { color: '#8b95a1' }
                      }
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
 
          {/* Main Tab: Deliverables & Settings */}
          <div className="space-y-0.5">
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider mb-2 text-[#c0c8d2]">
              General
            </div>
 
            {[
              { key: 'settings', label: '시스템 설정', icon: <Settings className="w-4 h-4 shrink-0" /> },
            ].map(({ key, label, icon }) => {
              const isTabActive = activeMenu === key;
              return (
                <Link
                  key={key}
                  href={getMenuLink(key)}
                  onClick={onClose}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
                  style={
                    isTabActive
                      ? { backgroundColor: '#eff6ff', color: '#3182f6', fontWeight: 600 }
                      : { color: '#4e5968' }
                  }
                >
                  {icon}
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Admin Section — only visible to admin accounts */}
          {isAdmin && (
            <div className="space-y-0.5">
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider mb-2 text-[#c0c8d2]">
                Admin
              </div>
              <Link
                href={getMenuLink('admin_users')}
                onClick={onClose}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
                style={
                  activeMenu === 'admin_users'
                    ? { backgroundColor: '#fff8e6', color: '#d97706', fontWeight: 600 }
                    : { color: '#4e5968' }
                }
              >
                <Users className="w-4 h-4 shrink-0" />
                회원 관리
              </Link>
            </div>
          )}
        </nav>

        {/* Sidebar Footer */}
        {session?.user?.email && (
          <div className="p-4 shrink-0 flex flex-col gap-3" style={{ borderTop: '1px solid #eef1f6' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#dde7fb] flex items-center justify-center text-xs font-bold text-[#2563eb] shrink-0">
                {session.user.email.slice(0, 1).toUpperCase()}
              </div>
              <div className="leading-tight flex-1 min-w-0">
                <div className="text-[13px] font-bold text-[#2a3346] truncate">
                  {session.user.user_metadata?.name || session.user.email.split('@')[0]}
                </div>
                <div className="text-[11px] text-[#9aa2b3]">PM · 접근성팀</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              style={{ backgroundColor: '#f9fafb', color: '#8a93a6', border: '1px solid #e8ecf3' }}
            >
              <LogOut className="w-3.5 h-3.5" /> 로그아웃
            </button>
          </div>
        )}
      </aside>

      {/* Mobile Sidebar Overlay Drawer backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}
    </>
  );
}
