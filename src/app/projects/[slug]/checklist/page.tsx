'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProject } from '../../../../context/ProjectContext';
import { supabase, STORAGE_BUCKET } from '../../../../lib/supabaseClient';
import { Loader2, AlertCircle, LayoutGrid, List, CheckSquare, Square } from 'lucide-react';
import Dashboard from '../../../../components/Dashboard';
import ChecklistSection from '../../../../components/ChecklistSection';
import { ItemModal, ImageViewerModal, ItemFormData } from '../../../../components/Modals';

interface ChecklistItem {
  id: string;
  project_id: string;
  phase: string;
  group_name: string;
  text: string;
  tag: string | null;
  checked: boolean;
  image_url: string | null;
  memo: string | null;
  due_date: string | null;
  assignee: string | null;
  sort_order?: number | null;
}

// ── Board view constants ──────────────────────────────────────────────────────
const BOARD_PHASES = [
  { id: 'pre',         label: '착수 전',  dot: '#8a93a5' },
  { id: 'in_progress', label: '진행 중',  dot: '#3182f6' },
  { id: 'review',      label: '심사',     dot: '#d98a2b' },
  { id: 'done',        label: '완료 후',  dot: '#1f9d6b' },
] as const;

const TAG_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  risk: { color: '#d98a2b', bg: '#fbf0e1', label: '⚠️ 리스크' },
  doc:  { color: '#3182f6', bg: '#eff6ff', label: '📄 산출물' },
  ext:  { color: '#1f9d6b', bg: '#e7f6ef', label: '🔗 외부'   },
};

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

function dueDateLabel(due: string | null): { text: string; urgent: boolean } | null {
  if (!due) return null;
  const d     = new Date(due);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0)   return { text: `D+${Math.abs(diff)}`, urgent: true  };
  if (diff === 0) return { text: 'D-Day',                urgent: true  };
  if (diff <= 3)  return { text: `D-${diff}`,            urgent: true  };
  return                { text: `D-${diff}`,            urgent: false };
}

export default function ProjectChecklistPage() {
  const router      = useRouter();
  const params      = useParams();
  const projectSlug = (params?.slug as string) || '';
  const { projects, showToast } = useProject();

  useEffect(() => {
    if (projectSlug) {
      router.replace(`/projects/${projectSlug}/guide`);
    }
  }, [projectSlug, router]);

  const currentProject = projects.find(p => p.slug === projectSlug);
  const projectId      = currentProject?.id || '';

  // ── State ─────────────────────────────────────────────────────────────────
  const [items, setItems]                     = useState<ChecklistItem[]>([]);
  const [dataLoading, setDataLoading]         = useState(false);
  const [activePhase, setActivePhase]         = useState<string>('pre');
  const [activeView, setActiveView]           = useState<'list' | 'board'>('list');
  const [boardToggling, setBoardToggling]     = useState<string | null>(null);

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem]         = useState<ItemFormData | null>(null);
  const [defaultGroup, setDefaultGroup]       = useState<string>('');
  const [viewerImageUrl, setViewerImageUrl]   = useState<string>('');
  const [isViewerOpen, setIsViewerOpen]       = useState(false);
  const [savingFieldId, setSavingFieldId]     = useState<string | null>(null);
  const [uploadingId, setUploadingId]         = useState<string | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchChecklist = useCallback(async (pId: string) => {
    if (!pId) return;
    setDataLoading(true);
    try {
      const { data, error } = await supabase
        .from('checklist')
        .select('*')
        .eq('project_id', pId)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (err: unknown) {
      console.error('fetchChecklist error:', err);
      showToast('체크리스트 항목을 불러오지 못했습니다.');
    } finally {
      setDataLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (projectId) fetchChecklist(projectId);
  }, [projectId, fetchChecklist]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`realtime-checklist-${projectId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'checklist',
        filter: `project_id=eq.${projectId}`,
      }, (payload) => {
        fetchChecklist(projectId);

        if (payload.eventType === 'UPDATE') {
          const changed = payload.new as ChecklistItem;
          const oldItem = items.find(i => i.id === changed.id);
          if (oldItem && oldItem.checked !== changed.checked) {
            showToast(`"${changed.text.substring(0, 15)}..." 항목이 ${changed.checked ? '완료' : '진행 필요'}로 변경되었습니다.`);
          } else {
            showToast('체크리스트가 실시간 업데이트되었습니다.');
          }
        } else if (payload.eventType === 'INSERT') {
          showToast('새로운 체크리스트 항목이 추가되었습니다.');
        } else if (payload.eventType === 'DELETE') {
          showToast('체크리스트 항목이 삭제되었습니다.');
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [projectId, fetchChecklist, items, showToast]);

  // ── CRUD handlers ─────────────────────────────────────────────────────────
  const handleToggleCheck = async (itemId: string, checked: boolean) => {
    try {
      setItems(prev => prev.map(item => item.id === itemId ? { ...item, checked } : item));
      const { error } = await supabase.from('checklist').update({ checked }).eq('id', itemId);
      if (error) throw error;
    } catch (err: unknown) {
      console.error(err);
      showToast('상태 업데이트 실패. 다시 시도해 주세요.');
      setItems(prev => prev.map(item => item.id === itemId ? { ...item, checked: !checked } : item));
    }
  };

  const boardToggleCheck = async (item: ChecklistItem) => {
    if (boardToggling) return;
    setBoardToggling(item.id);
    try {
      await handleToggleCheck(item.id, !item.checked);
    } finally {
      setBoardToggling(null);
    }
  };

  const handleUpdateMemo = async (itemId: string, memo: string) => {
    try {
      setItems(prev => prev.map(item => item.id === itemId ? { ...item, memo } : item));
      const { error } = await supabase.from('checklist').update({ memo: memo || null }).eq('id', itemId);
      if (error) throw error;
      showToast('메모가 저장되었습니다.');
    } catch (err: unknown) {
      console.error(err);
      showToast('메모 저장에 실패했습니다.');
    }
  };

  const handleInlineFieldChange = async (itemId: string, fieldName: keyof ChecklistItem, value: string | null) => {
    setSavingFieldId(`${itemId}-${fieldName}`);
    try {
      setItems(prev => prev.map(item => item.id === itemId ? { ...item, [fieldName]: value || null } : item));
      const { error } = await supabase.from('checklist').update({ [fieldName]: value || null }).eq('id', itemId);
      if (error) throw error;
    } catch (err: unknown) {
      console.error(err);
      showToast('정보 업데이트에 실패했습니다.');
    } finally {
      setSavingFieldId(null);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('해당 체크리스트 항목을 영구 삭제하시겠습니까?')) return;
    try {
      const item = items.find(i => i.id === itemId);
      if (item?.image_url) await deleteImageFile(item.image_url);
      const { error } = await supabase.from('checklist').delete().eq('id', itemId);
      if (error) throw error;
      showToast('체크리스트 항목이 삭제되었습니다.');
    } catch (err: unknown) {
      console.error(err);
      showToast('항목 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleSaveItemModal = async (formData: ItemFormData) => {
    try {
      if (formData.id) {
        const { error } = await supabase.from('checklist').update({
          group_name:  formData.group_name,
          text:        formData.text,
          tag:         formData.tag || null,
          assignee:    formData.assignee || null,
          due_date:    formData.due_date || null,
          updated_at:  new Date().toISOString(),
        }).eq('id', formData.id);
        if (error) throw error;
        showToast('체크리스트 항목이 수정되었습니다.');
      } else {
        const { error } = await supabase.from('checklist').insert({
          project_id: projectId,
          phase:      activePhase,
          group_name: formData.group_name,
          text:       formData.text,
          tag:        formData.tag || null,
          assignee:   formData.assignee || null,
          due_date:   formData.due_date || null,
          checked:    false,
        });
        if (error) throw error;
        showToast('체크리스트 항목이 새로 추가되었습니다.');
      }
    } catch (err: unknown) {
      console.error(err);
      showToast('저장 중 오류가 발생했습니다.');
    }
  };

  const deleteImageFile = async (imageUrl: string) => {
    try {
      const parts = imageUrl.split(`/storage/v1/object/public/${STORAGE_BUCKET}/`);
      if (parts.length > 1) {
        await supabase.storage.from(STORAGE_BUCKET).remove([parts[1]]);
      }
    } catch { /* no-op */ }
  };

  const handleUploadImage = async (itemId: string, file: File) => {
    setUploadingId(itemId);
    try {
      const item = items.find(i => i.id === itemId);
      if (item?.image_url) await deleteImageFile(item.image_url);

      const fileExt  = file.name.split('.').pop();
      const filePath = `${projectId}/${itemId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET).upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
      const { error: updateError } = await supabase.from('checklist')
        .update({ image_url: data.publicUrl }).eq('id', itemId);
      if (updateError) throw updateError;

      showToast('이미지 업로드가 완료되었습니다.');
    } catch (err: unknown) {
      if (err instanceof Error) showToast(`이미지 업로드 실패: ${err.message}`);
    } finally {
      setUploadingId(null);
    }
  };

  const handleDeleteImage = async (itemId: string, imageUrl: string) => {
    try {
      await deleteImageFile(imageUrl);
      const { error } = await supabase.from('checklist').update({ image_url: null }).eq('id', itemId);
      if (error) throw error;
      showToast('이미지가 삭제되었습니다.');
    } catch (err: unknown) {
      console.error(err);
      showToast('이미지 삭제에 실패했습니다.');
    }
  };

  const handleViewImage = (imageUrl: string) => {
    setViewerImageUrl(imageUrl);
    setIsViewerOpen(true);
  };

  const handleInlineFileChange = async (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('파일 크기는 최대 5MB까지 업로드할 수 있습니다.');
      return;
    }
    await handleUploadImage(itemId, file);
  };

  // ── Computed values ──────────────────────────────────────────────────────
  const getPhaseKorean = (phaseCode: string) => {
    switch (phaseCode) {
      case 'pre':         return '1. 계약 & 범위 정의';
      case 'in_progress': return '2. 디자인 & 개발 준비';
      case 'review':      return '3. 디자인 & 마크업 검수';
      case 'done':        return '4. 개발 완료 및 심사 대기';
      default:            return '';
    }
  };

  const projectItems = items.filter(item => item.phase !== 'accessibility');

  const totalCount   = projectItems.length;
  const checkedCount = projectItems.filter(item => item.checked).length;
  const riskCount    = projectItems.filter(item => item.tag === 'risk' && !item.checked).length;
  const docCount     = projectItems.filter(item => item.tag === 'doc'  &&  item.checked).length;
  const extCount     = projectItems.filter(item => item.tag === 'ext'  && !item.checked).length;

  const filteredItems = projectItems.filter(item => item.phase === activePhase);

  const getPhaseStats = (phaseCode: string) => {
    const phaseItems = projectItems.filter(item => item.phase === phaseCode);
    return `${phaseItems.filter(item => item.checked).length}/${phaseItems.length}`;
  };

  const columns = useMemo(() =>
    BOARD_PHASES.map(phase => ({
      ...phase,
      items: items.filter(i => i.phase === phase.id),
    })),
  [items]);

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-text-muted">
        <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
        <span className="text-xs">프로젝트 정보를 불러오고 있습니다...</span>
      </div>
    );
  }

  return (
    <>
      <Dashboard
        totalCount={totalCount}
        checkedCount={checkedCount}
        riskCount={riskCount}
        docCount={docCount}
        extCount={extCount}
      />

      {/* Tabs & view-toggle bar */}
      <nav className="flex items-center border-b border-border-color bg-[#f9fafb] sticky top-[60px] z-30 pt-2 pb-0">

        {/* Phase tabs — only shown in list view */}
        {activeView === 'list' && ['pre', 'in_progress', 'review', 'done'].map((phaseCode) => (
          <button
            key={phaseCode}
            onClick={() => setActivePhase(phaseCode)}
            className={`py-3.5 px-6 text-sm font-medium transition-all flex items-center gap-2 cursor-pointer relative ${
              activePhase === phaseCode ? 'text-[#3182f6] font-bold' : 'text-text-muted hover:text-text-main'
            }`}
          >
            {getPhaseKorean(phaseCode)}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              activePhase === phaseCode
                ? 'bg-blue-50 text-[#3182f6] font-bold'
                : 'bg-[#f2f4f6] text-text-muted'
            }`}>
              {getPhaseStats(phaseCode)}
            </span>
            {activePhase === phaseCode && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3182f6] drop-shadow-[0_0_2px_rgba(49,130,246,1)]" />
            )}
          </button>
        ))}

        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex items-center pb-2 pr-4">
          <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: '#eef1f5' }}>
            <button
              onClick={() => setActiveView('list')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all"
              style={activeView === 'list'
                ? { background: '#fff', color: '#191f28', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }
                : { color: '#7a8396' }
              }
            >
              <List className="w-3.5 h-3.5" /> 목록
            </button>
            <button
              onClick={() => setActiveView('board')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all"
              style={activeView === 'board'
                ? { background: '#fff', color: '#191f28', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }
                : { color: '#7a8396' }
              }
            >
              <LayoutGrid className="w-3.5 h-3.5" /> 보드
            </button>
          </div>
        </div>
      </nav>

      {/* ── Board view ───────────────────────────────────────────────────── */}
      {activeView === 'board' && (
        <div className="pt-4">
          {dataLoading ? (
            <div className="flex flex-col items-center justify-center p-20 gap-4 bg-white border border-[#e5e8eb] rounded-2xl">
              <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
              <span className="text-xs text-[#8b95a1]">항목을 불러오는 중...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
              {columns.map(col => {
                const colDone  = col.items.filter(i => i.checked).length;
                const colTotal = col.items.length;
                return (
                  <div key={col.id} className="rounded-xl p-3" style={{ background: '#eef1f5' }}>
                    {/* Column header */}
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.dot }} />
                      <span className="text-[13px] font-semibold" style={{ color: '#46506a' }}>{col.label}</span>
                      <span
                        className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: '#fff', color: '#8a93a5' }}
                      >
                        {colDone}/{colTotal}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="flex flex-col gap-2">
                      {col.items.length === 0 && (
                        <div
                          className="text-center text-xs py-8 rounded-lg border border-dashed"
                          style={{ color: '#aab2c0', borderColor: '#d6dbe2' }}
                        >
                          항목 없음
                        </div>
                      )}
                      {col.items.map(item => {
                        const tag        = item.tag ? TAG_STYLE[item.tag] : null;
                        const due        = dueDateLabel(item.due_date);
                        const isToggling = boardToggling === item.id;

                        return (
                          <div
                            key={item.id}
                            className="rounded-xl p-3"
                            style={{
                              background: '#fff',
                              border: '1px solid #e9ecf1',
                              boxShadow: '0 1px 2px rgba(0,0,0,.04)',
                              opacity: item.checked ? 0.6 : 1,
                              transition: 'opacity 0.15s',
                            }}
                          >
                            {/* Group badge + due chip */}
                            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                              <span
                                className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md"
                                style={{ background: '#f1f3f6', color: '#56607a' }}
                              >
                                {item.group_name}
                              </span>
                              {due && (
                                <span
                                  className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded"
                                  style={{
                                    color:      due.urgent ? '#e0413f' : '#8a93a5',
                                    background: due.urgent ? '#fce8e7' : '#f1f3f6',
                                  }}
                                >
                                  {due.text}
                                </span>
                              )}
                            </div>

                            {/* Text */}
                            <p
                              className="text-[13px] font-medium leading-snug mb-3"
                              style={{
                                color:          '#1a2030',
                                textDecoration: item.checked ? 'line-through' : 'none',
                              }}
                            >
                              {item.text}
                            </p>

                            {/* Assignee + tag + check */}
                            <div className="flex items-center gap-1.5">
                              {item.assignee && (
                                <div
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                  style={{ background: '#dde3ec', color: '#46506a' }}
                                  title={item.assignee}
                                >
                                  {initials(item.assignee)}
                                </div>
                              )}
                              {tag && (
                                <span
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                  style={{ color: tag.color, background: tag.bg }}
                                >
                                  {tag.label}
                                </span>
                              )}
                              <button
                                onClick={() => boardToggleCheck(item)}
                                disabled={isToggling}
                                className="ml-auto flex items-center gap-1 cursor-pointer transition-opacity"
                                style={{
                                  color:   item.checked ? '#1f9d6b' : '#cdd4e0',
                                  opacity: isToggling ? 0.4 : 1,
                                }}
                                title={item.checked ? '완료 취소' : '완료 처리'}
                              >
                                {item.checked
                                  ? <CheckSquare className="w-4 h-4" />
                                  : <Square      className="w-4 h-4" />
                                }
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── List view ────────────────────────────────────────────────────── */}
      {activeView === 'list' && (
        dataLoading ? (
          <div className="flex flex-col items-center justify-center p-20 gap-4 text-text-muted bg-white rounded-2xl border border-[#e5e8eb]">
            <Loader2 className="w-7 h-7 text-[#3182f6] animate-spin" />
            <span className="text-xs">데이터를 불러오는 중입니다...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-20 bg-white border border-[#e5e8eb] rounded-2xl space-y-4">
            <div className="text-text-muted"><AlertCircle className="w-10 h-10" /></div>
            <div>
              <h4 className="font-semibold text-text-main">등록된 체크리스트 항목이 없습니다</h4>
              <p className="text-xs text-text-muted mt-1">이 단계에 새로운 체크리스트 업무를 추가해 보세요.</p>
            </div>
            <button
              onClick={() => {
                setDefaultGroup('');
                setEditingItem(null);
                setIsItemModalOpen(true);
              }}
              className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
            >
              + 새 업무 항목 추가
            </button>
          </div>
        ) : (
          <ChecklistSection
            items={filteredItems}
            onToggleCheck={handleToggleCheck}
            onUpdateMemo={handleUpdateMemo}
            onDeleteItem={handleDeleteItem}
            onEditItem={(item) => {
              setEditingItem({
                id:         item.id,
                group_name: item.group_name,
                text:       item.text,
                tag:        item.tag      || '',
                assignee:   item.assignee || '',
                due_date:   item.due_date || '',
              });
              setIsItemModalOpen(true);
            }}
            onAddItemClick={(groupName) => {
              setDefaultGroup(groupName);
              setEditingItem(null);
              setIsItemModalOpen(true);
            }}
            onUploadImage={handleUploadImage}
            onDeleteImage={handleDeleteImage}
            onViewImage={handleViewImage}
          />
        )
      )}

      <ItemModal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        onSubmit={handleSaveItemModal}
        item={editingItem}
        defaultGroup={defaultGroup}
      />

      <ImageViewerModal
        isOpen={isViewerOpen}
        imageUrl={viewerImageUrl}
        onClose={() => setIsViewerOpen(false)}
      />
    </>
  );
}
