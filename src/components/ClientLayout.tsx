'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { ProjectProvider, useProject } from '../context/ProjectContext';
import Sidebar from './Sidebar';
import Header from './Header';
import Auth from './Auth';
import { Loader2 } from 'lucide-react';

function AppShell({ children }: { children: React.ReactNode }) {
  const { session, authLoading, toasts } = useProject();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();

  // 1. Auth Loading Spinner
  if (authLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#f9fafb] z-50">
        <Loader2 className="w-10 h-10 text-[#3182f6] animate-spin mb-4" />
        <p className="text-xs text-[#8b95a1] font-semibold">인증 상태 확인 중...</p>
      </div>
    );
  }

  const isPublicRoute = pathname === '/api-docs';

  // 2. Gateway to Authentication
  if (!session) {
    if (isPublicRoute) {
      return (
        <div className="min-h-screen bg-[#f9fafb] text-[#191f28] antialiased">
          <main className="min-h-screen w-full">
            {children}
          </main>
        </div>
      );
    }
    return <Auth onAuthSuccess={() => {}} />;
  }

  // 3. Authenticated App Layout (Sidebar + Header + Content)
  return (
    <div className="min-h-screen flex bg-[#f9fafb] text-[#191f28] antialiased">
      {/* Sidebar navigation */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main container */}
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden md:pl-64">
        {/* Top Header bar */}
        <Header onMenuToggle={() => setIsSidebarOpen(prev => !prev)} />

        {/* Dynamic page contents */}
        <main className="flex-1 px-6 md:px-10 py-6 max-w-7xl mx-auto w-full space-y-6">
          {children}
        </main>
      </div>

      {/* Global Toast Notifications */}
      <div className="fixed bottom-6 right-6 z-55 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="px-4 py-3 rounded-xl text-xs font-semibold text-white shadow-lg flex items-center gap-2 max-w-[320px] animate-fade-in-up"
            style={{ backgroundColor: '#191f28' }}
          >
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProjectProvider>
      <AppShell>{children}</AppShell>
    </ProjectProvider>
  );
}
