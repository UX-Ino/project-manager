'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProject } from '../../../../context/ProjectContext';
import { supabase } from '../../../../lib/supabaseClient';
import {
  Loader2, AlertCircle, Plus, X, ChevronDown,
  AlertTriangle, CircleDot, CheckCircle2, PauseCircle,
  Pencil, Trash2,
} from 'lucide-react';

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface Issue {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: '예정' | '진행중' | '완료' | '보류';
  priority: '높음' | '중간' | '낮음';
  assignee: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

type StatusType = '전체' | '예정' | '진행중' | '완료' | '보류';
type PriorityType = '전체' | '높음' | '중간' | '낮음';

const STATUS_CONFIG: Record<Issue['status'], { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  예정:   { label: '예정',  color: '#3182f6', bg: '#eef3ff', border: '#c8d8f8', icon: <CircleDot className="w-3 h-3" /> },
  진행중: { label: '진행중', color: '#c47e10', bg: '#fff7ec', border: '#f5d48a', icon: <ChevronDown className="w-3 h-3" /> },
  완료:   { label: '완료',  color: '#178055', bg: '#e6f6ee', border: '#b0dfc8', icon: <CheckCircle2 className="w-3 h-3" /> },
  보류:   { label: '보류',  color: '#8a93a5', bg: '#f0f2f6', border: '#d5dae5', icon: <PauseCircle className="w-3 h-3" /> },
};

const PRIORITY_CONFIG: Record<Issue['priority'], { label: string; color: string; bg: string }> = {
  높음: { label: '높음', color: '#d11d44', bg: '#fdeaee' },
  중간: { label: '중간', color: '#c47e10', bg: '#fff7ec' },
  낮음: { label: '낮음', color: '#6b7488', bg: '#eef0f5' },
};

// ── 빈 폼 ────────────────────────────────────────────────────────────────────

const emptyForm = () => ({
  title: '',
  description: '',
  status: '예정' as Issue['status'],
  priority: '중간' as Issue['priority'],
  assignee: '',
  due_date: '',
});

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────

export default function ProjectIssuesPage() {
  const params = useParams();
  const projectSlug = (params?.slug as string) || '';
  const { projects, showToast } = useProject();
  const currentProject = projects.find(p => p.slug === projectSlug);
  const projectId = currentProject?.id || '';

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);

  // 필터
  const [statusFilter, setStatusFilter] = useState<StatusType>('전체');
  const [priorityFilter, setPriorityFilter] = useState<PriorityType>('전체');

  // 모달
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Issue | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  // ── fetch ──

  const fetchIssues = useCallback(async (pId: string) => {
    if (!pId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('issues')
        .select('*')
        .eq('project_id', pId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setIssues((data as Issue[]) || []);
    } catch (e) {
      showToast('이슈를 불러오지 못했습니다: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { if (projectId) fetchIssues(projectId); }, [projectId, fetchIssues]);

  // ── 모달 열기 ──

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (issue: Issue) => {
    setEditTarget(issue);
    setForm({
      title: issue.title,
      description: issue.description || '',
      status: issue.status,
      priority: issue.priority,
      assignee: issue.assignee || '',
      due_date: issue.due_date || '',
    });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditTarget(null); };

  // ── 저장 ──

  const handleSave = async () => {
    if (!form.title.trim() || !projectId) return;
    setSaving(true);
    try {
      const payload = {
        project_id: projectId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        assignee: form.assignee.trim() || null,
        due_date: form.due_date || null,
        updated_at: new Date().toISOString(),
      };

      if (editTarget) {
        const { error } = await supabase.from('issues').update(payload).eq('id', editTarget.id);
        if (error) throw error;
        showToast('이슈가 수정되었습니다.');
      } else {
        const { error } = await supabase.from('issues').insert(payload);
        if (error) throw error;
        showToast('이슈가 등록되었습니다.');
      }
      closeModal();
      fetchIssues(projectId);
    } catch (e) {
      showToast('저장 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  // ── 삭제 ──

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('issues').delete().eq('id', id);
    if (error) { showToast('삭제 실패: ' + error.message); return; }
    showToast('이슈가 삭제되었습니다.');
    fetchIssues(projectId);
  };

  // ── 빠른 상태 변경 ──

  const cycleStatus = async (issue: Issue) => {
    const order: Issue['status'][] = ['예정', '진행중', '완료', '보류'];
    const idx = order.indexOf(issue.status);
    const next = order[(idx + 1) % order.length];
    const { error } = await supabase.from('issues').update({ status: next, updated_at: new Date().toISOString() }).eq('id', issue.id);
    if (error) { showToast('상태 변경 실패'); return; }
    fetchIssues(projectId);
  };

  // ── 필터링 ──

  const filtered = issues.filter(i => {
    if (statusFilter !== '전체' && i.status !== statusFilter) return false;
    if (priorityFilter !== '전체' && i.priority !== priorityFilter) return false;
    return true;
  });

  // ── 통계 ──

  const counts = {
    전체: issues.length,
    예정: issues.filter(i => i.status === '예정').length,
    진행중: issues.filter(i => i.status === '진행중').length,
    완료: issues.filter(i => i.status === '완료').length,
    보류: issues.filter(i => i.status === '보류').length,
  };

  // ── 날짜 포맷 ──

  const fmtDate = (s: string | null) => {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  const isOverdue = (due: string | null, status: Issue['status']) => {
    if (!due || status === '완료') return false;
    return new Date(due + 'T00:00:00') < new Date(new Date().toDateString());
  };

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <AlertCircle className="w-10 h-10 text-[#8b95a1]" />
        <p className="text-sm text-[#4e5968]">프로젝트를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <section className="space-y-5 animate-fade-in">

      {/* ── 헤더 ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-heading text-[#191f28]">이슈사항</h2>
          <p className="text-xs mt-0.5 text-[#8b95a1]">
            {currentProject.name} — 프로젝트 이슈를 등록하고 추적합니다.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-[12px] font-semibold rounded-xl cursor-pointer shadow transition-all shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          이슈 등록
        </button>
      </div>

      {/* ── KPI 카드 ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(['전체', '예정', '진행중', '완료', '보류'] as StatusType[]).map(s => {
          const cfg = s === '전체'
            ? { color: '#3a4358', bg: 'bg-white', border: 'border-[#e8ecf3]' }
            : { color: STATUS_CONFIG[s as Issue['status']].color, bg: 'bg-white', border: 'border-[#e8ecf3]' };
          return (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`${cfg.bg} border ${cfg.border} rounded-2xl p-4 shadow-sm text-left transition-all cursor-pointer ${statusFilter === s ? 'ring-2 ring-[#3182f6] ring-offset-1' : 'hover:shadow-md'}`}>
              <div className="text-[10.5px] font-semibold text-[#8a93a5] uppercase tracking-wide mb-1">{s}</div>
              <div className="text-[26px] font-extrabold" style={{ color: cfg.color }}>{counts[s]}</div>
            </button>
          );
        })}
      </div>

      {/* ── 우선순위 필터 ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-[#8a93a5]">우선순위</span>
        {(['전체', '높음', '중간', '낮음'] as PriorityType[]).map(p => (
          <button key={p} onClick={() => setPriorityFilter(p)}
            className={`text-[11.5px] font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              priorityFilter === p
                ? 'bg-[#3182f6] border-[#3182f6] text-white shadow-sm'
                : 'bg-white border-[#e3e7ef] text-[#5a6478] hover:border-[#b0b8c9]'
            }`}>
            {p}
          </button>
        ))}
      </div>

      {/* ── 이슈 리스트 ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 gap-4 bg-white border border-[#e5e8eb] rounded-2xl">
          <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
          <span className="text-xs text-[#8b95a1]">불러오는 중...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 bg-white border border-[#e8ecf3] rounded-2xl gap-3">
          <AlertCircle className="w-9 h-9 text-[#c5cad6]" />
          <div className="text-center">
            <p className="text-[13px] font-semibold text-[#5a6478]">
              {issues.length === 0 ? '등록된 이슈가 없습니다.' : '해당 조건의 이슈가 없습니다.'}
            </p>
            {issues.length === 0 && (
              <p className="text-[11.5px] text-[#9aa2b3] mt-1">우측 상단 "이슈 등록" 버튼으로 첫 이슈를 등록하세요.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#e8ecf3] rounded-2xl shadow-sm overflow-hidden">
          {/* 테이블 헤더 */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 px-5 py-2.5 bg-[#f4f6fa] border-b border-[#eef1f6] text-[10.5px] font-bold text-[#8a93a5] uppercase tracking-wide">
            <span>이슈</span>
            <span>상태</span>
            <span>우선순위</span>
            <span>담당자</span>
            <span>등록일</span>
            <span />
          </div>

          <div className="divide-y divide-[#f1f3f8]">
            {filtered.map(issue => {
              const sc = STATUS_CONFIG[issue.status];
              const pc = PRIORITY_CONFIG[issue.priority];
              const overdue = isOverdue(issue.due_date, issue.status);
              return (
                <div key={issue.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 items-center px-5 py-3.5 hover:bg-[#fafbfd] transition-colors">

                  {/* 제목 + 설명 */}
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-bold text-[#1a2030] truncate leading-snug">{issue.title}</p>
                    {issue.description && (
                      <p className="text-[11px] text-[#8a93a5] mt-0.5 line-clamp-1">{issue.description}</p>
                    )}
                    <p className="text-[10px] text-[#b0b8c9] mt-0.5">
                      {new Date(issue.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} 등록
                    </p>
                  </div>

                  {/* 상태 — 클릭으로 순환 변경 */}
                  <div>
                    <button onClick={() => cycleStatus(issue)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border text-[10.5px] font-bold cursor-pointer transition-all hover:opacity-80"
                      style={{ color: sc.color, backgroundColor: sc.bg, borderColor: sc.border }}>
                      {sc.icon}
                      {sc.label}
                    </button>
                  </div>

                  {/* 우선순위 */}
                  <div>
                    <span className="text-[10.5px] font-bold px-2 py-1 rounded-lg"
                      style={{ color: pc.color, backgroundColor: pc.bg }}>
                      {pc.label}
                    </span>
                  </div>

                  {/* 담당자 */}
                  <div className="text-[11.5px] text-[#5a6478] font-medium truncate">
                    {issue.assignee || <span className="text-[#c5cad6]">—</span>}
                  </div>

                  {/* 마감일 */}
                  <div className={`text-[11.5px] font-semibold ${overdue ? 'text-[#d11d44]' : 'text-[#6b7488]'}`}>
                    {issue.due_date ? (
                      <span className="flex items-center gap-1">
                        {overdue && <AlertTriangle className="w-3 h-3" />}
                        {fmtDate(issue.due_date)}
                      </span>
                    ) : <span className="text-[#c5cad6]">—</span>}
                  </div>

                  {/* 액션 */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => openEdit(issue)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-[#e3e7ef] text-[#8a93a5] hover:border-[#3182f6] hover:text-[#3182f6] transition-all cursor-pointer">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleDelete(issue.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-[#e3e7ef] text-[#8a93a5] hover:border-[#d11d44] hover:text-[#d11d44] transition-all cursor-pointer">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 등록/수정 모달 ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg z-10 flex flex-col max-h-[90vh]">

            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#eef1f6] shrink-0">
              <h3 className="text-[15px] font-extrabold text-[#1a2030]">
                {editTarget ? '이슈 수정' : '이슈 등록'}
              </h3>
              <button onClick={closeModal}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f2f4f9] text-[#9aa2b3] cursor-pointer transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 모달 바디 */}
            <div className="overflow-y-auto p-6 space-y-4">

              {/* 제목 */}
              <div>
                <label className="block text-[12px] font-bold text-[#3a4358] mb-1.5">이슈 제목 <span className="text-[#d11d44]">*</span></label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="이슈 제목을 입력하세요"
                  className="w-full text-[12.5px] border border-[#e3e7ef] rounded-xl px-3.5 py-2.5 text-[#3a4358] outline-none focus:border-[#3182f6] transition-colors"
                />
              </div>

              {/* 설명 */}
              <div>
                <label className="block text-[12px] font-bold text-[#3a4358] mb-1.5">설명</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="이슈에 대한 상세 설명을 입력하세요"
                  rows={3}
                  className="w-full text-[12.5px] border border-[#e3e7ef] rounded-xl px-3.5 py-2.5 text-[#3a4358] outline-none focus:border-[#3182f6] transition-colors resize-none"
                />
              </div>

              {/* 상태 + 우선순위 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold text-[#3a4358] mb-1.5">상태</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as Issue['status'] }))}
                    className="w-full text-[12.5px] border border-[#e3e7ef] rounded-xl px-3.5 py-2.5 text-[#3a4358] outline-none focus:border-[#3182f6] transition-colors bg-white cursor-pointer">
                    {(['예정', '진행중', '완료', '보류'] as Issue['status'][]).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-[#3a4358] mb-1.5">우선순위</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value as Issue['priority'] }))}
                    className="w-full text-[12.5px] border border-[#e3e7ef] rounded-xl px-3.5 py-2.5 text-[#3a4358] outline-none focus:border-[#3182f6] transition-colors bg-white cursor-pointer">
                    {(['높음', '중간', '낮음'] as Issue['priority'][]).map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 담당자 + 마감일 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold text-[#3a4358] mb-1.5">담당자</label>
                  <input
                    type="text"
                    value={form.assignee}
                    onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
                    placeholder="담당자 이름"
                    className="w-full text-[12.5px] border border-[#e3e7ef] rounded-xl px-3.5 py-2.5 text-[#3a4358] outline-none focus:border-[#3182f6] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-[#3a4358] mb-1.5">등록일</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full text-[12.5px] border border-[#e3e7ef] rounded-xl px-3.5 py-2.5 text-[#3a4358] outline-none focus:border-[#3182f6] transition-colors cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* 모달 푸터 */}
            <div className="flex gap-2.5 px-6 py-4 border-t border-[#eef1f6] shrink-0">
              <button onClick={closeModal}
                className="flex-1 py-2.5 text-[12.5px] font-semibold border border-[#e3e7ef] rounded-xl text-[#5a6478] hover:border-[#b0b8c9] cursor-pointer transition-all">
                취소
              </button>
              <button onClick={handleSave} disabled={!form.title.trim() || saving}
                className="flex-[2] py-2.5 text-[12.5px] font-bold bg-[#3182f6] hover:bg-[#1b64da] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {saving ? '저장 중...' : (editTarget ? '수정 완료' : '등록')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
