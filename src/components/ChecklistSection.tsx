'use client';

import React, { useState } from 'react';
import { 
  Check, Edit3, Trash2, ImagePlus, 
  MessageSquare, User, Calendar, Save, Loader2, Trash
} from 'lucide-react';
import { getDDay } from '../lib/dateUtils';

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

interface ChecklistSectionProps {
  items: ChecklistItem[];
  onToggleCheck: (id: string, checked: boolean) => Promise<void>;
  onUpdateMemo: (id: string, memo: string) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onEditItem: (item: ChecklistItem) => void;
  onAddItemClick: (groupName: string) => void;
  onUploadImage: (id: string, file: File) => Promise<void>;
  onDeleteImage: (id: string, imageUrl: string) => Promise<void>;
  onViewImage: (imageUrl: string) => void;
}

export default function ChecklistSection({
  items,
  onToggleCheck,
  onUpdateMemo,
  onDeleteItem,
  onEditItem,
  onAddItemClick,
  onUploadImage,
  onDeleteImage,
  onViewImage,
}: ChecklistSectionProps) {
  // Memo toggle state: stores active item IDs
  const [activeMemos, setActiveMemos] = useState<Record<string, boolean>>({});
  const [memoTexts, setMemoTexts] = useState<Record<string, string>>({});
  const [savingMemoId, setSavingMemoId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // Group items by group_name
  const groups = items.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    if (!acc[item.group_name]) {
      acc[item.group_name] = [];
    }
    acc[item.group_name].push(item);
    return acc;
  }, {});

  const toggleMemo = (itemId: string, initialText: string) => {
    setActiveMemos(prev => ({ ...prev, [itemId]: !prev[itemId] }));
    if (memoTexts[itemId] === undefined) {
      setMemoTexts(prev => ({ ...prev, [itemId]: initialText }));
    }
  };

  const handleSaveMemo = async (itemId: string) => {
    setSavingMemoId(itemId);
    try {
      await onUpdateMemo(itemId, memoTexts[itemId] || '');
      setActiveMemos(prev => ({ ...prev, [itemId]: false }));
    } catch (err) {
      console.error(err);
    } finally {
      setSavingMemoId(null);
    }
  };

  const handleFileChange = async (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('파일 크기는 최대 5MB까지 업로드할 수 있습니다.');
      return;
    }

    setUploadingId(itemId);
    try {
      await onUploadImage(itemId, file);
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingId(null);
    }
  };

  const sortedGroupNames = Object.keys(groups).sort();

  return (
    <div className="space-y-8 animate-fade-in">
      {sortedGroupNames.map(groupName => {
        const groupItems = groups[groupName];
        return (
          <div key={groupName} className="flex flex-col gap-3">
            {/* Group Header */}
            <div className="flex justify-between items-center border-l-3 border-brand-primary pl-3 mb-1">
              <h3 className="text-base font-semibold text-text-main font-heading">{groupName}</h3>
              <button
                onClick={() => onAddItemClick(groupName)}
                className="px-2.5 py-1 text-xs font-semibold text-brand-primary hover:text-brand-primary-hover bg-bg-primary-soft hover:bg-brand-primary/25 border border-brand-primary/10 rounded flex items-center gap-1 cursor-pointer transition-colors"
              >
                + 항목 추가
              </button>
            </div>

            {/* Item List */}
            <div className="space-y-3">
              {groupItems.map(item => {
                const dDay = getDDay(item.due_date);
                const isMemoOpen = !!activeMemos[item.id];
                const memoText = memoTexts[item.id] !== undefined ? memoTexts[item.id] : (item.memo || '');

                return (
                  <div
                    key={item.id}
                    className={`bg-bg-secondary border border-border-color rounded-md p-4 flex gap-4 items-start transition-all hover:translate-x-0.5 hover:border-brand-primary/20 hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)] group relative overflow-hidden ${
                      item.checked ? 'bg-bg-secondary/40 border-border-color/40' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <div className="mt-1 flex items-center justify-center">
                      <label className="relative flex items-center justify-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={(e) => onToggleCheck(item.id, e.target.checked)}
                          className="sr-only"
                        />
                        <div
                          className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-all ${
                            item.checked
                              ? 'bg-brand-accent border-brand-accent text-bg-primary shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                              : 'border-text-muted hover:border-text-main'
                          }`}
                        >
                          {item.checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </label>
                    </div>

                    {/* Card Content */}
                    <div className="flex-1 space-y-2.5">
                      <div className="flex justify-between items-start gap-4">
                        <span
                          className={`text-sm leading-relaxed text-text-main transition-colors ${
                            item.checked ? 'text-text-muted line-through' : ''
                          }`}
                        >
                          {item.text}
                        </span>

                        {/* Hover Actions */}
                        <div className="flex gap-1 shrink-0 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onEditItem(item)}
                            title="수정"
                            className="w-7 h-7 bg-bg-tertiary hover:bg-bg-primary-soft hover:text-brand-primary border border-border-color rounded flex items-center justify-center text-text-muted transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('이 항목을 삭제하시겠습니까?')) {
                                onDeleteItem(item.id);
                              }
                            }}
                            title="삭제"
                            className="w-7 h-7 bg-bg-tertiary hover:bg-bg-danger-soft hover:text-brand-danger border border-border-color rounded flex items-center justify-center text-text-muted transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Badges and Actions Row */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {/* Tag Badge */}
                        {item.tag === 'risk' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-bg-danger-soft text-brand-danger border border-brand-danger/10">
                            ⚠️ 리스크
                          </span>
                        )}
                        {item.tag === 'doc' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-bg-info-soft text-brand-info border border-brand-info/10">
                            📄 산출물
                          </span>
                        )}
                        {item.tag === 'ext' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-bg-warning-soft text-brand-warning border border-brand-warning/10">
                            🔗 외부 솔루션
                          </span>
                        )}

                        {/* Assignee Badge */}
                        {item.assignee && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-bg-primary-soft text-brand-primary border border-brand-primary/10 flex items-center gap-1">
                            <User className="w-3 h-3" /> {item.assignee}
                          </span>
                        )}

                        {/* D-Day / Due Date Badge */}
                        {dDay && (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] border flex items-center gap-1 font-semibold ${
                              dDay.status === 'overdue'
                                ? 'bg-bg-danger-soft text-brand-danger border-brand-danger/10'
                                : dDay.status === 'imminent'
                                ? 'bg-bg-warning-soft text-brand-warning border-brand-warning/10'
                                : 'bg-bg-tertiary text-text-muted border-border-color'
                            }`}
                          >
                            <Calendar className="w-3 h-3" /> {item.due_date} ({dDay.text})
                          </span>
                        )}

                        {/* Image Preview & Upload Panel */}
                        <div className="flex items-center gap-2">
                          {item.image_url ? (
                            <div className="relative group/img flex items-center gap-1">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.image_url}
                                alt="첨부 이미지"
                                onClick={() => onViewImage(item.image_url!)}
                                className="w-10 h-10 object-cover rounded border border-border-color cursor-zoom-in hover:scale-105 transition-transform"
                              />
                              <button
                                onClick={() => {
                                  if (confirm('첨부된 이미지를 삭제하시겠습니까?')) {
                                    onDeleteImage(item.id, item.image_url!);
                                  }
                                }}
                                title="이미지 삭제"
                                className="w-6 h-6 rounded bg-bg-danger-soft text-brand-danger hover:bg-brand-danger hover:text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity cursor-pointer border border-brand-danger/10"
                              >
                                <Trash className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <label className="w-7 h-7 bg-bg-tertiary hover:bg-bg-primary-soft hover:text-brand-primary border border-border-color rounded flex items-center justify-center text-text-muted transition-colors cursor-pointer">
                              {uploadingId === item.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ImagePlus className="w-3.5 h-3.5" />
                              )}
                              <input
                                type="file"
                                accept="image/*"
                                disabled={uploadingId !== null}
                                onChange={(e) => handleFileChange(item.id, e)}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>

                        {/* Memo Button */}
                        <button
                          onClick={() => toggleMemo(item.id, item.memo || '')}
                          className={`px-2 py-1 bg-bg-tertiary hover:bg-bg-primary-soft hover:text-brand-primary border border-border-color rounded flex items-center gap-1 transition-colors cursor-pointer ${
                            item.memo ? 'text-brand-primary border-brand-primary/20 bg-bg-primary-soft' : 'text-text-muted'
                          }`}
                        >
                          <MessageSquare className="w-3 h-3" />
                          {item.memo ? '메모 있음' : '메모 추가'}
                        </button>
                      </div>

                      {/* Collapsible Memo Area */}
                      {isMemoOpen && (
                        <div className="relative mt-2 p-3 bg-bg-primary border border-border-color rounded-sm animate-fade-in space-y-2">
                          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                            심사 지적사항 및 조치 메모
                          </div>
                          <textarea
                            value={memoText}
                            onChange={(e) => setMemoTexts(prev => ({ ...prev, [item.id]: e.target.value }))}
                            rows={2}
                            placeholder="메모 내용을 입력하세요..."
                            className="w-full bg-transparent text-sm border-none p-0 outline-none resize-y text-text-main placeholder:text-text-muted/50 focus:ring-0"
                          />
                          <div className="flex justify-end pt-1">
                            <button
                              onClick={() => handleSaveMemo(item.id)}
                              disabled={savingMemoId === item.id}
                              className="px-2 py-1 text-xs text-brand-accent hover:text-brand-accent-hover bg-bg-accent-soft hover:bg-brand-accent/25 border border-brand-accent/15 rounded flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              {savingMemoId === item.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Save className="w-3 h-3" />
                              )}
                              저장
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
