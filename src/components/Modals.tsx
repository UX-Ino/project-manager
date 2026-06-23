'use client';

import React, { useState } from 'react';
import { X, FolderPlus, Plus, Calendar, User, Tag } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

// Shared input style helper
const inputStyle: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e8eb',
  color: '#191f28',
};

// ----------------------------------------------------
// 1. PROJECT CREATION MODAL
// ----------------------------------------------------
interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, slug: string) => Promise<void>;
  existingSlugs?: string[];
  existingNames?: string[];
}

export function ProjectModal({ isOpen, onClose, onSubmit, existingSlugs = [], existingNames = [] }: ProjectModalProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [nameError, setNameError] = useState('');
  const [slugError, setSlugError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const validateSlug = (val: string) => {
    if (!val) {
      return '영문 식별자(Slug)를 입력해주세요.';
    }
    const regex = /^[a-z0-9-]+$/;
    if (!regex.test(val)) {
      return '영문 소문자, 숫자, 하이픈(-)만 입력할 수 있습니다.';
    }
    if (existingSlugs.includes(val.trim().toLowerCase())) {
      return '이미 존재하는 식별자입니다.';
    }
    return '';
  };

  const handleSlugChange = (val: string) => {
    const cleaned = val.toLowerCase().replace(/\s+/g, '-');
    setSlug(cleaned);
    if (slugError) {
      setSlugError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    // Validate project name
    const cleanedName = name.trim().toLowerCase();
    if (existingNames.some(n => n.trim().toLowerCase() === cleanedName)) {
      setNameError('이미 존재하는 프로젝트 이름입니다. 다른 이름을 입력해주세요.');
      return;
    }

    const err = validateSlug(slug);
    if (err) {
      setSlugError(err);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(name.trim(), slug.trim().toLowerCase());
      setName('');
      setSlug('');
      setNameError('');
      setSlugError('');
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent 
        className="w-full max-w-[460px] sm:max-w-[460px] rounded-2xl overflow-hidden p-0 gap-0 border-none bg-white shadow-2xl animate-fade-in-down"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5" style={{ borderBottom: '1px solid #f2f4f6' }}>
          <DialogTitle asChild>
            <h2 className="text-base font-bold flex items-center gap-2.5" style={{ color: '#191f28' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#eff6ff' }}>
                <FolderPlus className="w-3.5 h-3.5" style={{ color: '#3182f6' }} />
              </div>
              새 프로젝트 추가
            </h2>
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-colors"
            style={{ color: '#8b95a1' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f2f4f6')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="new-project-name" className="block text-xs font-semibold" style={{ color: '#4e5968' }}>
                프로젝트명
              </label>
              <input
                type="text"
                id="new-project-name"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError('');
                }}
                placeholder="예: 롯데잇츠 웹 접근성"
                className="w-full px-4 py-2.5 rounded-xl text-sm transition-all"
                style={{
                  ...inputStyle,
                  borderColor: nameError ? '#f04438' : '#e5e8eb'
                }}
                onFocus={(e) => (e.target.style.borderColor = nameError ? '#f04438' : '#3182f6')}
                onBlur={(e) => (e.target.style.borderColor = nameError ? '#f04438' : '#e5e8eb')}
              />
              {nameError && (
                <p className="text-xs font-medium mt-1" style={{ color: '#f04438' }}>{nameError}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-project-slug" className="block text-xs font-semibold flex justify-between" style={{ color: '#4e5968' }}>
                <span>영문 식별자 (Slug)</span>
                <span className="text-[10px] font-normal" style={{ color: '#8b95a1' }}>주소창 경로로 사용됩니다.</span>
              </label>
              <input
                type="text"
                id="new-project-slug"
                required
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="예: lotte-its"
                className="w-full px-4 py-2.5 rounded-xl text-sm transition-all"
                style={{
                  ...inputStyle,
                  borderColor: slugError ? '#f04438' : '#e5e8eb'
                }}
                onFocus={(e) => (e.target.style.borderColor = slugError ? '#f04438' : '#3182f6')}
                onBlur={(e) => (e.target.style.borderColor = slugError ? '#f04438' : '#e5e8eb')}
              />
              {slugError ? (
                <p className="text-xs font-medium mt-1" style={{ color: '#f04438' }}>{slugError}</p>
              ) : slug ? (
                <p className="text-[11px] mt-1" style={{ color: '#4e5968' }}>
                  미리보기: <span className="font-semibold text-blue-600">/projects/{slug}/checklist</span>
                </p>
              ) : null}
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex justify-end gap-2.5 px-6 py-4"
            style={{ borderTop: '1px solid #f2f4f6', backgroundColor: '#fafafa' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer transition-colors"
              style={{ color: '#4e5968', border: '1px solid #e5e8eb', backgroundColor: '#ffffff' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f9fafb')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer transition-all"
              style={{ backgroundColor: '#3182f6' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1b64da')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#3182f6')}
            >
              {submitting ? '생성 중...' : '프로젝트 생성 & 기본데이터 주입'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------
// 2. CHECKLIST ITEM ADD/EDIT MODAL
// ----------------------------------------------------
export interface ItemFormData {
  id?: string;
  group_name: string;
  text: string;
  tag: string;
  assignee: string;
  due_date: string;
}

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ItemFormData) => Promise<void>;
  item?: ItemFormData | null;
  defaultGroup?: string;
}

export function ItemModal({ isOpen, onClose, onSubmit, item, defaultGroup }: ItemModalProps) {
  const [groupName, setGroupName] = useState(item?.group_name || defaultGroup || '');
  const [text, setText] = useState(item?.text || '');
  const [tag, setTag] = useState<string>(item?.tag || '');
  const [assignee, setAssignee] = useState(item?.assignee || '');
  const [dueDate, setDueDate] = useState(item?.due_date || '');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || !text.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({ id: item?.id, group_name: groupName, text, tag, assignee, due_date: dueDate });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = 'w-full px-4 py-2.5 rounded-xl text-sm transition-all';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent 
        className="w-full max-w-[500px] sm:max-w-[500px] rounded-2xl overflow-hidden p-0 gap-0 border-none bg-white shadow-2xl animate-fade-in-down"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5" style={{ borderBottom: '1px solid #f2f4f6' }}>
          <DialogTitle asChild>
            <h2 className="text-base font-bold flex items-center gap-2.5" style={{ color: '#191f28' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#eff6ff' }}>
                <Plus className="w-3.5 h-3.5" style={{ color: '#3182f6' }} />
              </div>
              {item ? '체크리스트 항목 수정' : '체크리스트 항목 추가'}
            </h2>
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-colors"
            style={{ color: '#8b95a1' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f2f4f6')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            {/* Group Name */}
            <div className="space-y-1.5">
              <label htmlFor="item-group" className="block text-xs font-semibold" style={{ color: '#4e5968' }}>
                그룹명 (카테고리)
              </label>
              <input
                type="text"
                id="item-group"
                required
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="예: 계약 & 범위, 개발 환경 사전 신청"
                className={fieldClass}
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#3182f6')}
                onBlur={(e) => (e.target.style.borderColor = '#e5e8eb')}
              />
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <label htmlFor="item-text" className="block text-xs font-semibold" style={{ color: '#4e5968' }}>
                체크리스트 내용
              </label>
              <textarea
                id="item-text"
                required
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="체크리스트에 표시할 세부 업무 내용을 입력하세요"
                className={`${fieldClass} resize-none`}
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#3182f6')}
                onBlur={(e) => (e.target.style.borderColor = '#e5e8eb')}
              />
            </div>

            {/* Tag + Assignee */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="item-tag" className="block text-xs font-semibold flex items-center gap-1" style={{ color: '#4e5968' }}>
                  <Tag className="w-3 h-3" /> 태그 설정
                </label>
                <select
                  id="item-tag"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  className={fieldClass}
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#3182f6')}
                  onBlur={(e) => (e.target.style.borderColor = '#e5e8eb')}
                >
                  <option value="">없음</option>
                  <option value="risk">⚠️ 리스크</option>
                  <option value="doc">📄 산출물</option>
                  <option value="ext">🔗 외부 솔루션</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="item-assignee" className="block text-xs font-semibold flex items-center gap-1" style={{ color: '#4e5968' }}>
                  <User className="w-3 h-3" /> 담당자
                </label>
                <input
                  type="text"
                  id="item-assignee"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="예: 정인호"
                  className={fieldClass}
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#3182f6')}
                  onBlur={(e) => (e.target.style.borderColor = '#e5e8eb')}
                />
              </div>
            </div>

            {/* Due Date */}
            <div className="space-y-1.5">
              <label htmlFor="item-due-date" className="block text-xs font-semibold flex items-center gap-1" style={{ color: '#4e5968' }}>
                <Calendar className="w-3 h-3" /> 마감일
              </label>
              <input
                type="date"
                id="item-due-date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={fieldClass}
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#3182f6')}
                onBlur={(e) => (e.target.style.borderColor = '#e5e8eb')}
              />
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex justify-end gap-2.5 px-6 py-4"
            style={{ borderTop: '1px solid #f2f4f6', backgroundColor: '#fafafa' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer"
              style={{ color: '#4e5968', border: '1px solid #e5e8eb', backgroundColor: '#ffffff' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f9fafb')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer transition-all"
              style={{ backgroundColor: '#3182f6' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1b64da')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#3182f6')}
            >
              {submitting ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------
// 3. IMAGE FULLSCREEN VIEWER MODAL
// ----------------------------------------------------
interface ImageViewerModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
}

export function ImageViewerModal({ isOpen, imageUrl, onClose }: ImageViewerModalProps) {
  if (!isOpen || !imageUrl) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent 
        className="max-w-4xl max-h-[85vh] w-full h-full border-none bg-transparent p-0 gap-0 shadow-none flex items-center justify-center z-[60]"
        overlayClassName="bg-black/85 backdrop-blur-[8px] z-[60]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">이미지 뷰어</DialogTitle>
        <div className="relative w-full h-full flex items-center justify-center cursor-zoom-out" onClick={onClose}>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="absolute -top-10 right-0 text-white p-2 cursor-pointer rounded-full transition-colors"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)')}
          >
            <X className="w-5 h-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="첨부 이미지 원본"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl cursor-default"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
