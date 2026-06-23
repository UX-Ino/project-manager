'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useProject } from '../context/ProjectContext';
import {
  LogOut, User, CheckSquare, LayoutDashboard, Files, Settings, Users, ClipboardList
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
  const pathParts = pathname.split('/').filter(Boolean);
  let activeProjectSlug = '';
  let activeMenu = 'dashboard';

  if (pathParts[0] === 'projects' && pathParts[1]) {
    activeProjectSlug = pathParts[1];
    activeMenu = pathParts[2] || 'dashboard'; // /projects/[slug] 는 프로젝트 대시보드
  } else if (pathParts[0] === 'settings') {
    activeMenu = 'settings';
  } else if (pathParts[0] === 'admin') {
    activeMenu = 'admin_users';
  }

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
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#e5e8eb] flex flex-col transition-transform duration-300 md:translate-x-0 md:static ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="h-[60px] border-b border-[#e5e8eb] flex items-center gap-2.5 px-6 shrink-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: '#3182f6' }}
          >
            <CheckSquare className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight text-[#191f28]">Etribe PM</div>
            <div className="text-[10px] text-[#8b95a1]">웹 접근성 PM 툴</div>
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
          {activeProjectSlug && (
            <div className="space-y-0.5">
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider mb-2 text-[#c0c8d2]">
                Checklist & WBS
              </div>

              <Link
                href={getMenuLink('checklist')}
                onClick={onClose}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
                style={
                  activeMenu === 'checklist' || activeMenu === 'wbs' || activeMenu === 'a11y' || activeMenu === 'weekly' || activeMenu === 'deploy-slides'
                    ? { backgroundColor: '#eff6ff', color: '#3182f6', fontWeight: 600 }
                    : { color: '#4e5968' }
                }
              >
                <ClipboardList className="w-4 h-4 shrink-0" />
                프로젝트 체크리스트
              </Link>

              {/* Nested Sub-menus */}
              <div className="ml-5 pl-3 py-1 space-y-0.5" style={{ borderLeft: '1.5px solid #e5e8eb' }}>
                {[
                  { key: 'checklist', label: 'PM 체크리스트' },
                  { key: 'wbs', label: 'WBS 일정표' },
                  { key: 'a11y', label: '접근성 점검리스트' },
                  { key: 'deploy-slides', label: '배포리스트' },
                  { key: 'weekly', label: '주간보고서 생성기' },
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
                          ? { color: '#3182f6', backgroundColor: '#eff6ff', fontWeight: 700 }
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
              ...(activeProjectSlug ? [{ key: 'documents', label: '산출물 보관함', icon: <Files className="w-4 h-4 shrink-0" /> }] : []),
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
          <div className="p-3 shrink-0" style={{ borderTop: '1px solid #e5e8eb' }}>
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs overflow-hidden mb-2"
              style={{ backgroundColor: '#f9fafb', color: '#8b95a1' }}
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate" title={session.user.email}>{session.user.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className="w-full py-2.5 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all"
              style={{ backgroundColor: '#f9fafb', color: '#8b95a1', border: '1px solid #e5e8eb' }}
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
