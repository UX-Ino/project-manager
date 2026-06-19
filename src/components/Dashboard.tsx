'use client';

import React from 'react';
import { AlertTriangle, FileText, Link } from 'lucide-react';

interface DashboardProps {
  totalCount: number;
  checkedCount: number;
  riskCount: number;
  docCount: number;
  extCount: number;
}

export default function Dashboard({
  totalCount,
  checkedCount,
  riskCount,
  docCount,
  extCount,
}: DashboardProps) {
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  return (
    <section className="mb-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {/* Progress Card */}
        <div className="bg-bg-secondary border border-border-color rounded-md p-5 flex flex-col justify-center gap-3 shadow-sm min-h-[108px]">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">전체 완료율</span>
            <span className="text-2xl font-bold font-heading text-brand-primary">{progressPercent}%</span>
          </div>
          <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-primary to-brand-accent rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          <div className="text-[11px] text-text-muted flex justify-between">
            <span>진행률 현황</span>
            <span>{checkedCount} / {totalCount} 완료</span>
          </div>
        </div>

        {/* Risk Card */}
        <div className="bg-bg-secondary border border-border-color rounded-md p-5 flex items-center gap-5 shadow-sm min-h-[108px]">
          <div className="w-12 h-12 rounded bg-bg-warning-soft text-brand-warning flex items-center justify-center text-xl shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">남은 리스크</span>
            <span className="text-2xl font-bold font-heading text-text-main">{riskCount}</span>
          </div>
        </div>

        {/* Doc Card */}
        <div className="bg-bg-secondary border border-border-color rounded-md p-5 flex items-center gap-5 shadow-sm min-h-[108px]">
          <div className="w-12 h-12 rounded bg-bg-info-soft text-brand-info flex items-center justify-center text-xl shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">완료 산출물</span>
            <span className="text-2xl font-bold font-heading text-text-main">{docCount}</span>
          </div>
        </div>

        {/* External Solution Card */}
        <div className="bg-bg-secondary border border-border-color rounded-md p-5 flex items-center gap-5 shadow-sm min-h-[108px]">
          <div className="w-12 h-12 rounded bg-bg-accent-soft text-brand-accent flex items-center justify-center text-xl shrink-0">
            <Link className="w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">외부 솔루션 이슈</span>
            <span className="text-2xl font-bold font-heading text-text-main">{extCount}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
