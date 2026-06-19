'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase, STORAGE_BUCKET } from '../lib/supabaseClient';
import { 
  LogOut, User, FolderPlus, Trash2, CheckSquare, Loader2, 
  AlertCircle, LayoutDashboard, Files, Settings, 
  Menu, ChevronRight, ShieldAlert, ClipboardCopy,
  ClipboardList, ImagePlus, Trash, ExternalLink, FileSpreadsheet
} from 'lucide-react';
import Auth from '../components/Auth';
import Dashboard from '../components/Dashboard';
import ChecklistSection from '../components/ChecklistSection';
import { ProjectModal, ItemModal, ImageViewerModal, ItemFormData } from '../components/Modals';

interface Project {
  id: string;
  name: string;
  created_at: string;
  wbs_sheet_url?: string | null;
  a11y_sheet_url?: string | null;
}

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

interface ToastMessage {
  id: string;
  message: string;
}

interface ProjectStat {
  id: string;
  name: string;
  total: number;
  completed: number;
  progress: number;
  risks: number;
  docs: number;
  ext: number;
  created_at: string;
}

interface WBSRow {
  id: string;
  project_id: string;
  row_order: number;
  level: number;
  task_l1: string | null;
  task_l2: string | null;
  task_l3: string | null;
  task_l4: string | null;
  description: string | null;
  assignee: string | null;
  status: string;
  plan_start: string | null;
  plan_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  plan_progress: number;
  actual_progress: number;
}

interface DeploySlide {
  id: string;
  project_id: string;
  slide_title: string;
  slide_url: string;
  created_at: string;
}

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App Data State
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [activePhase, setActivePhase] = useState<string>('pre');

  // Navigation State
  const [activeMenu, setActiveMenu] = useState<'dashboard' | 'checklist_pm' | 'checklist_wbs' | 'checklist_a11y' | 'checklist_weekly' | 'deploy_slide' | 'documents' | 'settings'>('checklist_pm');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // WBS State
  const [wbsRows, setWbsRows] = useState<WBSRow[]>([]);
  const [wbsLoading, setWbsLoading] = useState(false);
  const [wbsSavingId, setWbsSavingId] = useState<string | null>(null);
  const [wbsViewMode, setWbsViewMode] = useState<'table' | 'sheet'>('table');
  const [editingSheetUrl, setEditingSheetUrl] = useState(false);
  const [sheetUrlInput, setSheetUrlInput] = useState('');

  // A11y State
  const [a11yViewMode, setA11yViewMode] = useState<'table' | 'sheet' | 'dashboard'>('dashboard');
  const [editingA11ySheetUrl, setEditingA11ySheetUrl] = useState(false);
  const [a11ySheetUrlInput, setA11ySheetUrlInput] = useState('');
  const [a11yStatusFilter, setA11yStatusFilter] = useState<string>('all');

  // Deploy Slide History State
  const [deploySlides, setDeploySlides] = useState<DeploySlide[]>([]);
  const [slidesLoading, setSlidesLoading] = useState(false);
  const [deletingSlideId, setDeletingSlideId] = useState<string | null>(null);
  const [expandedA11yGroups, setExpandedA11yGroups] = useState<Record<string, boolean>>({});

  // Global Statistics State
  const [globalStats, setGlobalStats] = useState<ProjectStat[]>([]);
  const [globalStatsLoading, setGlobalStatsLoading] = useState(false);

  // Modals visibility
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemFormData | null>(null);
  const [defaultGroup, setDefaultGroup] = useState<string>('');
  
  // Image Viewer Modal
  const [viewerImageUrl, setViewerImageUrl] = useState<string>('');
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Inline saving states
  const [savingFieldId, setSavingFieldId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Show Toast helper
  const showToast = useCallback((msg: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message: msg }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // Compute stats across all projects
  const fetchGlobalStats = useCallback(async () => {
    setGlobalStatsLoading(true);
    try {
      const { data: projectsData, error: projError } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (projError) throw projError;
      const projs = projectsData || [];

      const { data: itemsData, error: itemsError } = await supabase
        .from('checklist')
        .select('id, project_id, checked, tag, phase');

      if (itemsError) throw itemsError;
      const allItems = itemsData || [];

      const stats: ProjectStat[] = projs.map(p => {
        // Exclude accessibility checks from global PM checklist metrics
        const projectItems = allItems.filter(item => item.project_id === p.id && item.phase !== 'accessibility');
        const total = projectItems.length;
        const completed = projectItems.filter(item => item.checked).length;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
        const risks = projectItems.filter(item => item.tag === 'risk' && !item.checked).length;
        const docs = projectItems.filter(item => item.tag === 'doc' && item.checked).length;
        const ext = projectItems.filter(item => item.tag === 'ext' && !item.checked).length;

        return {
          id: p.id,
          name: p.name,
          total,
          completed,
          progress,
          risks,
          docs,
          ext,
          created_at: p.created_at
        };
      });

      setGlobalStats(stats);
    } catch (err: any) {
      console.error('Error fetching global stats:', err.message);
    } finally {
      setGlobalStatsLoading(false);
    }
  }, []);

  // 1. Auth Monitoring
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    // Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 2. Fetch Projects
  const fetchProjects = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);

      // Auto select latest project if none is active
      if (data && data.length > 0 && !activeProjectId) {
        setActiveProjectId(data[0].id);
      }
    } catch (err: any) {
      console.error('Error fetching projects:', err.message);
      showToast('프로젝트 목록을 불러오지 못했습니다.');
    }
  }, [activeProjectId, showToast]);

  // Fetch projects on auth success
  useEffect(() => {
    if (session) {
      fetchProjects();
      fetchGlobalStats();
    } else {
      setProjects([]);
      setItems([]);
      setActiveProjectId('');
      setGlobalStats([]);
    }
  }, [session, fetchProjects, fetchGlobalStats]);

  // 3. Fetch Checklist items
  const fetchChecklist = useCallback(async (projectId: string) => {
    if (!projectId) return;
    setDataLoading(true);
    try {
      const { data, error } = await supabase
        .from('checklist')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      console.error('Error fetching checklist:', err.message);
      showToast('체크리스트 항목을 불러오지 못했습니다.');
    } finally {
      setDataLoading(false);
    }
  }, [showToast]);

  // WBS: Fetch rows
  const fetchWbs = useCallback(async (projectId: string) => {
    if (!projectId) return;
    setWbsLoading(true);
    try {
      const { data, error } = await supabase
        .from('wbs_rows')
        .select('*')
        .eq('project_id', projectId)
        .order('row_order', { ascending: true });
      if (error) throw error;
      setWbsRows(data || []);
    } catch (err: any) {
      console.error('WBS fetch error:', err.message);
    } finally {
      setWbsLoading(false);
    }
  }, []);

  // Fetch Deploy Slides History
  const fetchDeploySlides = useCallback(async (projectId: string) => {
    if (!projectId) return;
    setSlidesLoading(true);
    try {
      const { data, error } = await supabase
        .from('deploy_slides')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDeploySlides(data || []);
    } catch (err: any) {
      console.error('Deploy slides fetch error:', err.message);
    } finally {
      setSlidesLoading(false);
    }
  }, []);

  // Delete slide history
  const handleDeleteSlide = useCallback(async (slideId: string, title: string) => {
    if (!confirm(`"${title}" 슬라이드 생성 이력을 삭제하시겠습니까?`)) return;
    setDeletingSlideId(slideId);
    try {
      const { error } = await supabase
        .from('deploy_slides')
        .delete()
        .eq('id', slideId);
      
      if (error) throw error;
      showToast('슬라이드 이력이 삭제되었습니다.');
      setDeploySlides(prev => prev.filter(s => s.id !== slideId));
    } catch (err: any) {
      console.error('Error deleting slide history:', err.message);
      showToast('이력 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingSlideId(null);
    }
  }, [showToast]);

  // Fetch checklist & slides when active project changes
  useEffect(() => {
    if (activeProjectId) {
      fetchChecklist(activeProjectId);
      if (activeMenu === 'deploy_slide') {
        fetchDeploySlides(activeProjectId);
      }
    } else {
      setItems([]);
      setDeploySlides([]);
    }
  }, [activeProjectId, activeMenu, fetchChecklist, fetchDeploySlides]);

  // WBS: Update single field
  const updateWbsRow = useCallback(async (rowId: string, field: string, value: string | number | null) => {
    setWbsSavingId(rowId);
    try {
      const { error } = await supabase
        .from('wbs_rows')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', rowId);
      if (error) throw error;
      setWbsRows(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value } : r));
    } catch (err: any) {
      console.error('WBS update error:', err.message);
    } finally {
      setWbsSavingId(null);
    }
  }, []);

  // Load when switching to WBS or slide menu
  useEffect(() => {
    if (activeMenu === 'checklist_wbs' && activeProjectId) {
      fetchWbs(activeProjectId);
    }
    if (activeMenu === 'deploy_slide' && activeProjectId) {
      fetchDeploySlides(activeProjectId);
    }
  }, [activeMenu, activeProjectId, fetchWbs, fetchDeploySlides]);

  // 4. Realtime Subscription Setup
  useEffect(() => {
    if (!activeProjectId) return;

    // 1) Checklist Realtime Channel
    const channel = supabase
      .channel(`realtime-checklist-${activeProjectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'checklist',
          filter: `project_id=eq.${activeProjectId}`,
        },
        (payload) => {
          fetchChecklist(activeProjectId);
          fetchGlobalStats();

          if (payload.eventType === 'UPDATE') {
            const oldItem = items.find(i => i.id === (payload.new as any).id);
            if (oldItem && oldItem.checked !== (payload.new as any).checked) {
              const statusText = (payload.new as any).checked ? '완료' : '진행 필요';
              showToast(`"${(payload.new as any).text.substring(0, 15)}..." 항목이 ${statusText}로 변경되었습니다.`);
            } else {
              showToast('체크리스트가 실시간 업데이트되었습니다.');
            }
          } else if (payload.eventType === 'INSERT') {
            showToast('새로운 체크리스트 항목이 추가되었습니다.');
          } else if (payload.eventType === 'DELETE') {
            showToast('체크리스트 항목이 삭제되었습니다.');
          }
        }
      )
      .subscribe();

    // 2) Deploy Slides Realtime Channel
    const slideChannel = supabase
      .channel(`realtime-slides-${activeProjectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deploy_slides',
          filter: `project_id=eq.${activeProjectId}`,
        },
        (payload) => {
          fetchDeploySlides(activeProjectId);
          if (payload.eventType === 'INSERT') {
            showToast(`새로운 배포 슬라이드 "${(payload.new as any).slide_title}"가 생성되어 이력에 추가되었습니다!`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(slideChannel);
    };
  }, [activeProjectId, fetchChecklist, fetchGlobalStats, fetchDeploySlides, showToast, items]);

  // Seeding WBS rows for new projects
  const initializeWbs = useCallback(async (projectId: string, projectName: string) => {
    if (!projectId) return;
    try {
      const wbsInitialData = [
        { project_id: projectId, row_order: 1, level: 1, task_l1: '1. 프로젝트 착수', task_l2: '', task_l3: '', task_l4: '', description: '프로젝트 킥오프 및 요구사항 확인' },
        { project_id: projectId, row_order: 2, level: 2, task_l1: '', task_l2: '요구사항 분석', task_l3: '', task_l4: '', description: '기능 정의서 작성' },
        { project_id: projectId, row_order: 3, level: 1, task_l1: '2. 디자인 및 기획', task_l2: '', task_l3: '', task_l4: '', description: 'UI/UX 디자인' },
        { project_id: projectId, row_order: 4, level: 2, task_l1: '', task_l2: '화면 설계', task_l3: '', task_l4: '', description: '와이어프레임 작성' },
        { project_id: projectId, row_order: 5, level: 1, task_l1: '3. 개발', task_l2: '', task_l3: '', task_l4: '', description: '프론트/백엔드 개발' },
        { project_id: projectId, row_order: 6, level: 1, task_l1: '4. 테스트 및 접근성 심사', task_l2: '', task_l3: '', task_l4: '', description: '접근성 검증 및 수정' },
      ];

      const { error } = await supabase
        .from('wbs_rows')
        .insert(wbsInitialData);

      if (error) throw error;
      console.log(`WBS initialized for project: ${projectName}`);
    } catch (err: any) {
      console.error('Error seeding WBS:', err.message);
    }
  }, []);

  // Seeding Accessibility Checklist guidelines if they don't exist
  const initializeA11yChecklist = useCallback(async (projectId: string) => {
    if (!projectId) return;
    try {
      const { data, error } = await supabase
        .from('checklist')
        .select('id')
        .eq('project_id', projectId)
        .eq('phase', 'accessibility')
        .limit(1);

      if (error) throw error;

      if (!data || data.length === 0) {
        const a11yItems = [
          // 1. 인식의 용이성
          { phase: 'accessibility', group_name: '1. 인식의 용이성', text: '대체 텍스트: 텍스트가 아닌 콘텐츠에는 대체 텍스트를 제공해야 한다.', tag: 'doc', sort_order: 101 },
          { phase: 'accessibility', group_name: '1. 인식의 용이성', text: '멀티미디어 대체수단: 동영상, 오디오 등 멀티미디어에는 자막, 대본 또는 수어를 제공해야 한다.', tag: 'doc', sort_order: 102 },
          { phase: 'accessibility', group_name: '1. 인식의 용이성', text: '색에 무관한 콘텐츠 인식: 콘텐츠는 색에 관계없이 인식될 수 있어야 한다.', tag: null, sort_order: 103 },
          { phase: 'accessibility', group_name: '1. 인식의 용이성', text: '명도 대비: 텍스트 콘텐츠와 배경 간의 명도 대비는 4.5 대 1 이상이어야 한다.', tag: null, sort_order: 104 },
          { phase: 'accessibility', group_name: '1. 인식의 용이성', text: '자동 재생 금지: 자동으로 소리가 재생되지 않아야 한다.', tag: null, sort_order: 105 },
          { phase: 'accessibility', group_name: '1. 인식의 용이성', text: '콘텐츠 간의 구분: 이웃한 콘텐츠는 시각적으로 구별될 수 있어야 한다.', tag: null, sort_order: 106 },
          { phase: 'accessibility', group_name: '1. 인식의 용이성', text: '표의 구성: 표는 이해하기 쉽게 구성해야 한다.', tag: null, sort_order: 107 },
          { phase: 'accessibility', group_name: '1. 인식의 용이성', text: '콘텐츠의 선형 구조: 콘텐츠는 논리적인 순서로 제공해야 한다.', tag: null, sort_order: 108 },
          { phase: 'accessibility', group_name: '1. 인식의 용이성', text: '명료한 지시사항 제공: 지시사항은 모양, 크기, 위치, 소리 등에 관계없이 인식될 수 있어야 한다.', tag: null, sort_order: 109 },
          // 2. 운용의 용이성
          { phase: 'accessibility', group_name: '2. 운용의 용이성', text: '키보드 사용 보장: 모든 기능은 키보드만으로도 사용할 수 있어야 한다.', tag: 'risk', sort_order: 201 },
          { phase: 'accessibility', group_name: '2. 운용의 용이성', text: '초점 이동: 키보드에 의한 초점은 논리적으로 이동해야 하며, 시각적으로 구별할 수 있어야 한다.', tag: null, sort_order: 202 },
          { phase: 'accessibility', group_name: '2. 운용의 용이성', text: '조작 가능: 사용자 입력 및 컨트롤은 조작 가능하도록 제공되어야 한다.', tag: null, sort_order: 203 },
          { phase: 'accessibility', group_name: '2. 운용의 용이성', text: '문자 단축키: 문자 단축키는 오동작으로 인한 오류를 방지해야 한다.', tag: null, sort_order: 204 },
          { phase: 'accessibility', group_name: '2. 운용의 용이성', text: '응답시간 조절: 시간제한이 있는 콘텐츠는 응답시간을 조절할 수 있어야 한다.', tag: 'risk', sort_order: 205 },
          { phase: 'accessibility', group_name: '2. 운용의 용이성', text: '정지 기능 제공: 자동으로 변경되는 콘텐츠는 움직임을 제어할 수 있어야 한다.', tag: null, sort_order: 206 },
          { phase: 'accessibility', group_name: '2. 운용의 용이성', text: '깜빡임과 번쩍임 사용 제한: 초당 3회 미만으로 깜빡이거나 번쩍이는 콘텐츠를 제공해야 한다.', tag: 'risk', sort_order: 207 },
          { phase: 'accessibility', group_name: '2. 운용의 용이성', text: '반복 영역 건너뛰기: 콘텐츠의 반복되는 영역은 건너뛸 수 있어야 한다.', tag: null, sort_order: 208 },
          { phase: 'accessibility', group_name: '2. 운용의 용이성', text: '제목 제공: 페이지, 프레임, 콘텐츠 블록에는 적절한 제목을 제공해야 한다.', tag: 'doc', sort_order: 209 },
          { phase: 'accessibility', group_name: '2. 운용의 용이성', text: '적절한 링크 텍스트: 링크 텍스트는 용도나 목적을 이해할 수 있도록 제공해야 한다.', tag: null, sort_order: 210 },
          { phase: 'accessibility', group_name: '2. 운용의 용이성', text: '고정된 참조 위치 정보: 동일한 웹 사이트 내에서 고정된 영역의 참조 위치는 일관성을 유지해야 한다.', tag: null, sort_order: 211 },
          { phase: 'accessibility', group_name: '2. 운용의 용이성', text: '단일 포인터 입력 지원: 복잡한 포인터 제스처 없이 단일 포인터로 조작 가능해야 한다.', tag: null, sort_order: 212 },
          { phase: 'accessibility', group_name: '2. 운용의 용이성', text: '포인터 입력 취소: 포인터 입력은 취소하거나 되돌릴 수 있어야 한다.', tag: null, sort_order: 213 },
          { phase: 'accessibility', group_name: '2. 운용의 용이성', text: '동작기반 작동: 동작(기울기, 흔들기 등)으로만 작동하는 기능은 대체 조작 방법을 제공해야 한다.', tag: null, sort_order: 214 },
          // 3. 이해의 용이성
          { phase: 'accessibility', group_name: '3. 이해의 용이성', text: '기본 언어 표시: 주로 사용하는 언어를 명시해야 한다 (html lang 속성).', tag: null, sort_order: 301 },
          { phase: 'accessibility', group_name: '3. 이해의 용이성', text: '사용자 요구에 따른 실행: 사용자가 의도하지 않은 기능(팝업 등)은 실행되지 않아야 한다.', tag: null, sort_order: 302 },
          { phase: 'accessibility', group_name: '3. 이해의 용이성', text: '일관성 있는 내비게이션: 웹 사이트 내의 내비게이션 구조는 일관되게 제공해야 한다.', tag: null, sort_order: 303 },
          { phase: 'accessibility', group_name: '3. 이해의 용이성', text: '일관성 있는 기능식별: 동일한 기능의 구성요소는 일관되게 식별 가능해야 한다.', tag: null, sort_order: 304 },
          { phase: 'accessibility', group_name: '3. 이해의 용이성', text: '입력 오류 방지: 서식 입력 시 오류를 방지할 수 있는 적절한 설명을 제공해야 한다.', tag: null, sort_order: 305 },
          { phase: 'accessibility', group_name: '3. 이해의 용이성', text: '레이블 제공: 사용자 입력 서식에는 대응하는 레이블을 제공해야 한다.', tag: 'doc', sort_order: 306 },
          { phase: 'accessibility', group_name: '3. 이해의 용이성', text: '오류 정정 안내: 입력 오류 발생 시 오류의 원인과 정정 방법을 알려주어야 한다.', tag: null, sort_order: 307 },
          { phase: 'accessibility', group_name: '3. 이해의 용이성', text: '오류 예방: 중요 거래나 데이터 제출 시 취소 또는 확인 단계를 제공해야 한다.', tag: null, sort_order: 308 },
          // 4. 견고성
          { phase: 'accessibility', group_name: '4. 견고성', text: '마크업 오류 방지: 마크업 언어의 요소는 열고 닫음, 중첩 관계 및 속성 선언 문법을 준수해야 한다.', tag: null, sort_order: 401 },
          { phase: 'accessibility', group_name: '4. 견고성', text: '웹 애플리케이션 접근성 준수: 콘텐츠에 포함된 웹 프로그램(스크립트 등)은 접근성을 준수해야 한다.', tag: 'ext', sort_order: 402 }
        ].map(item => ({ ...item, project_id: projectId, checked: false }));

        const { error: insertError } = await supabase
          .from('checklist')
          .insert(a11yItems);

        if (insertError) throw insertError;
        showToast('접근성 가이드라인 항목이 자동으로 활성화되었습니다.');
        fetchChecklist(projectId);
      }
    } catch (err: any) {
      console.error('Error seeding a11y checklist:', err.message);
    }
  }, [fetchChecklist, showToast]);

  // Seeding triggering when entering accessibility menu
  useEffect(() => {
    if (activeMenu === 'checklist_a11y' && activeProjectId) {
      initializeA11yChecklist(activeProjectId);
    }
  }, [activeMenu, activeProjectId, initializeA11yChecklist]);

  // 5. Actions Handlers
  const handleLogout = async () => {
    await supabase.auth.signOut();
    showToast('로그아웃 되었습니다.');
  };

  const handleCreateProject = async (projectName: string) => {
    try {
      const { data, error } = await supabase.rpc('create_project_with_defaults', {
        project_name: projectName,
      });

      if (error) throw error;
      // Seed WBS template for the new project
      if (data) {
        await initializeWbs(data, projectName);
      }

      showToast('프로젝트 생성 및 기본 데이터 삽입이 완료되었습니다.');
      await fetchProjects();
      await fetchGlobalStats();
      if (data) {
        setActiveProjectId(data);
      }
    } catch (err: any) {
      console.error(err);
      showToast(`프로젝트 생성 실패: ${err.message}`);
    }
  };

  const handleDeleteProject = async () => {
    if (!activeProjectId) return;
    const project = projects.find(p => p.id === activeProjectId);
    if (!project) return;

    if (!confirm(`"${project.name}" 프로젝트와 이에 연결된 모든 체크리스트 데이터를 영구 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const projectItemsWithImages = items.filter(i => i.image_url);
      for (const item of projectItemsWithImages) {
        if (item.image_url) {
          await deleteImageFile(item.image_url);
        }
      }

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', activeProjectId);

      if (error) throw error;

      showToast('프로젝트가 영구적으로 삭제되었습니다.');
      setActiveProjectId('');
      await fetchProjects();
      await fetchGlobalStats();
    } catch (err: any) {
      console.error(err);
      showToast(`프로젝트 삭제 오류: ${err.message}`);
    }
  };

  const handleToggleCheck = async (itemId: string, checked: boolean) => {
    try {
      setItems(prev => prev.map(item => item.id === itemId ? { ...item, checked } : item));

      const { error } = await supabase
        .from('checklist')
        .update({ checked })
        .eq('id', itemId);

      if (error) throw error;
      await fetchGlobalStats();
    } catch (err: any) {
      console.error(err);
      showToast('상태 업데이트 실패. 다시 시도해 주세요.');
      setItems(prev => prev.map(item => item.id === itemId ? { ...item, checked: !checked } : item));
    }
  };

  const handleUpdateMemo = async (itemId: string, memo: string) => {
    try {
      setItems(prev => prev.map(item => item.id === itemId ? { ...item, memo } : item));

      const { error } = await supabase
        .from('checklist')
        .update({ memo: memo || null })
        .eq('id', itemId);

      if (error) throw error;
      showToast('메모가 저장되었습니다.');
      await fetchGlobalStats();
    } catch (err: any) {
      console.error(err);
      showToast('메모 저장에 실패했습니다.');
    }
  };

  const handleInlineFieldChange = async (itemId: string, fieldName: keyof ChecklistItem, value: any) => {
    setSavingFieldId(`${itemId}-${fieldName}`);
    try {
      setItems(prev => prev.map(item => item.id === itemId ? { ...item, [fieldName]: value || null } : item));

      const { error } = await supabase
        .from('checklist')
        .update({ [fieldName]: value || null })
        .eq('id', itemId);

      if (error) throw error;
    } catch (err: any) {
      console.error(err);
      showToast('정보 업데이트에 실패했습니다.');
    } finally {
      setSavingFieldId(null);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const item = items.find(i => i.id === itemId);
      if (item?.image_url) {
        await deleteImageFile(item.image_url);
      }

      const { error } = await supabase
        .from('checklist')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      showToast('체크리스트 항목이 삭제되었습니다.');
      await fetchGlobalStats();
    } catch (err: any) {
      console.error(err);
      showToast('항목 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleSaveItemModal = async (formData: ItemFormData) => {
    try {
      if (formData.id) {
        const { error } = await supabase
          .from('checklist')
          .update({
            group_name: formData.group_name,
            text: formData.text,
            tag: formData.tag || null,
            assignee: formData.assignee || null,
            due_date: formData.due_date || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', formData.id);

        if (error) throw error;
        showToast('체크리스트 항목이 수정되었습니다.');
      } else {
        const { error } = await supabase
          .from('checklist')
          .insert({
            project_id: activeProjectId,
            phase: activePhase,
            group_name: formData.group_name,
            text: formData.text,
            tag: formData.tag || null,
            assignee: formData.assignee || null,
            due_date: formData.due_date || null,
            checked: false,
          });

        if (error) throw error;
        showToast('체크리스트 항목이 새로 추가되었습니다.');
      }
      await fetchGlobalStats();
    } catch (err: any) {
      console.error(err);
      showToast('저장 중 오류가 발생했습니다.');
    }
  };

  const deleteImageFile = async (imageUrl: string) => {
    try {
      const parts = imageUrl.split(`/storage/v1/object/public/${STORAGE_BUCKET}/`);
      if (parts.length > 1) {
        const storagePath = parts[1];
        const { error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([storagePath]);
        if (error) {
          console.error('Storage file deletion error:', error.message);
        }
      }
    } catch (err) {
      console.error('Image URL parsing error:', err);
    }
  };

  const handleUploadImage = async (itemId: string, file: File) => {
    setUploadingId(itemId);
    try {
      const item = items.find(i => i.id === itemId);
      if (item?.image_url) {
        await deleteImageFile(item.image_url);
      }

      const fileExt = file.name.split('.').pop();
      const filePath = `${activeProjectId}/${itemId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(filePath);

      const publicUrl = data.publicUrl;

      const { error: updateError } = await supabase
        .from('checklist')
        .update({ image_url: publicUrl })
        .eq('id', itemId);

      if (updateError) throw updateError;

      showToast('이미지 업로드가 완료되었습니다.');
      await fetchGlobalStats();
    } catch (err: any) {
      console.error(err);
      showToast(`이미지 업로드 실패: ${err.message}`);
    } finally {
      setUploadingId(null);
    }
  };

  const handleDeleteImage = async (itemId: string, imageUrl: string) => {
    try {
      await deleteImageFile(imageUrl);

      const { error } = await supabase
        .from('checklist')
        .update({ image_url: null })
        .eq('id', itemId);

      if (error) throw error;
      showToast('이미지가 삭제되었습니다.');
      await fetchGlobalStats();
    } catch (err: any) {
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

  const handleSaveSheetUrl = async (projectId: string, url: string) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ wbs_sheet_url: url || null })
        .eq('id', projectId);

      if (error) throw error;

      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, wbs_sheet_url: url } : p));
      showToast('구글 시트 연동 주소가 저장되었습니다.');
      setEditingSheetUrl(false);
    } catch (err: any) {
      console.error(err);
      showToast(`주소 저장 실패: ${err.message}`);
    }
  };

  const handleSaveA11ySheetUrl = async (projectId: string, url: string) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ a11y_sheet_url: url || null })
        .eq('id', projectId);

      if (error) throw error;

      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, a11y_sheet_url: url } : p));
      showToast('구글 접근성 시트 연동 주소가 저장되었습니다.');
      setEditingA11ySheetUrl(false);
    } catch (err: any) {
      console.error(err);
      showToast(`주소 저장 실패: ${err.message}`);
    }
  };

  // 6. Computing Metrics for Dashboard
  const pmItems = items.filter(item => item.phase !== 'accessibility');
  const totalCount = pmItems.length;
  const checkedCount = pmItems.filter(i => i.checked).length;
  const riskCount = pmItems.filter(i => i.tag === 'risk' && !i.checked).length;
  const docCount = pmItems.filter(i => i.tag === 'doc' && i.checked).length;
  const extCount = pmItems.filter(i => i.tag === 'ext' && !i.checked).length;

  // Accessibility metrics
  const a11yItems = items.filter(item => item.phase === 'accessibility');
  const a11yTotal = a11yItems.length;
  const a11yPassed = a11yItems.filter(item => item.checked).length;
  const a11yProgress = a11yTotal > 0 ? Math.round((a11yPassed / a11yTotal) * 100) : 0;

  // Phase Tab Completion stats
  const getPhaseStats = (phase: string) => {
    const phaseItems = items.filter(i => i.phase === phase);
    const total = phaseItems.length;
    const completed = phaseItems.filter(i => i.checked).length;
    return `${completed}/${total}`;
  };

  // Filter items for current active tab
  const filteredItems = items.filter(item => item.phase === activePhase);

  // Filter items that are completed documents for the "Documents Archive"
  const documentItems = items.filter(item => item.tag === 'doc' && item.checked);

  const activeProjectName = projects.find(p => p.id === activeProjectId)?.name || '';

  // WBS Grouping computation
  const wbsGroups = pmItems.reduce<Record<string, { phase: string; total: number; completed: number; minDate: string | null; maxDate: string | null; assignees: Set<string> }>>((acc, item) => {
    if (!acc[item.group_name]) {
      acc[item.group_name] = { phase: item.phase, total: 0, completed: 0, minDate: null, maxDate: null, assignees: new Set() };
    }
    const g = acc[item.group_name];
    g.total += 1;
    if (item.checked) g.completed += 1;
    if (item.assignee) g.assignees.add(item.assignee);
    if (item.due_date) {
      if (!g.minDate || item.due_date < g.minDate) g.minDate = item.due_date;
      if (!g.maxDate || item.due_date > g.maxDate) g.maxDate = item.due_date;
    }
    return acc;
  }, {});

  const sortedWbsGroupNames = Object.keys(wbsGroups).sort();

  const getPhaseKorean = (phaseStr: string) => {
    switch (phaseStr) {
      case 'pre': return '착수 전';
      case 'in_progress': return '진행 중';
      case 'review': return '심사 단계';
      case 'done': return '완료 후';
      default: return phaseStr;
    }
  };

  // Weekly Report Generation text
  const generateWeeklyReportText = () => {
    const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // 1. Completed items (last 7 days checked or checked items)
    const completedList = pmItems.filter(item => item.checked);
    const completedText = completedList.length > 0
      ? completedList.map(item => `- [${getPhaseKorean(item.phase)} > ${item.group_name}] ${item.text} (${item.assignee || '담당자 미정'})`).join('\n')
      : '- 금주 신규 완료된 주요 점검 항목이 없습니다.';

    // 2. Scheduled/In Progress items
    const scheduledList = pmItems.filter(item => !item.checked && (item.phase === 'in_progress' || item.phase === 'review'));
    const scheduledText = scheduledList.length > 0
      ? scheduledList.map(item => `- [${getPhaseKorean(item.phase)} > ${item.group_name}] ${item.text} (예정일: ${item.due_date || '미정'} / 담당: ${item.assignee || '미정'})`).join('\n')
      : '- 진행 예정인 대기 항목이 없습니다.';

    // 3. Risks & External Solutions
    const riskList = pmItems.filter(item => !item.checked && (item.tag === 'risk' || item.tag === 'ext'));
    const riskText = riskList.length > 0
      ? riskList.map(item => `- [${item.tag === 'risk' ? '⚠️ 리스크' : '🔗 외부솔루션'} > ${item.group_name}] ${item.text} (담당: ${item.assignee || '미정'})`).join('\n')
      : '- 현재 보고된 미완료 리스크 및 외부 솔루션 대기 이슈가 없습니다.';

    // 4. Completed Docs
    const docList = pmItems.filter(item => item.tag === 'doc' && item.checked);
    const docText = docList.length > 0
      ? docList.map(item => `- [${item.group_name}] ${item.text} (인도자: ${item.assignee || '미정'})`).join('\n')
      : '- 현재 인도 및 확보된 공식 산출물이 없습니다.';

    return `[이트라이브 웹 접근성 프로젝트 주간 진척 보고]
프로젝트명: ${activeProjectName}
작성일자: ${todayStr}
------------------------------------------------------

1. 금주 완료 및 조치 사항
${completedText}

2. 차주 예정 및 추진 사항
${scheduledText}

3. 주요 리스크 및 미결 이슈
${riskText}

4. 공식 프로젝트 산출물 현황
${docText}

------------------------------------------------------
* 본 보고서는 Etribe PM Tool에 등록된 실시간 체크리스트 데이터를 바탕으로 자동 생성되었습니다.`;
  };

  const handleCopyWeeklyReport = () => {
    const reportText = generateWeeklyReportText();
    navigator.clipboard.writeText(reportText);
    showToast('주간보고 내용이 클립보드에 복사되었습니다.');
  };

  // Loading Screen
  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-bg-primary flex flex-col items-center justify-center gap-4 text-text-muted">
        <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
        <span className="text-sm font-medium">인증 상태를 확인 중입니다...</span>
      </div>
    );
  }

  // Not Logged In Screen
  if (!session) {
    return <Auth onAuthSuccess={() => fetchProjects()} />;
  }

  return (
    <div className="min-h-screen flex bg-bg-primary text-text-main font-sans">
      
      {/* 1. SIDE NAVIGATION BAR (SNB) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col w-64 border-r transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ backgroundColor: '#ffffff', borderColor: '#e5e8eb' }}
      >
        {/* Sidebar Header */}
        <div className="flex items-center gap-3 px-5 py-4 shrink-0" style={{ borderBottom: '1px solid #e5e8eb' }}>
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: '#3182f6' }}
          >
            <CheckSquare className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight" style={{ color: '#191f28' }}>Etribe PM</div>
            <div className="text-[10px]" style={{ color: '#8b95a1' }}>웹 접근성 PM 툴</div>
          </div>
        </div>

        {/* Sidebar Menu Items */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {/* Main Tab: Dashboard */}
          <div className="space-y-0.5">
            <button
              onClick={() => {
                setActiveMenu('dashboard');
                setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer"
              style={activeMenu === 'dashboard'
                ? { backgroundColor: '#eff6ff', color: '#3182f6', fontWeight: 600 }
                : { color: '#4e5968' }
              }
              onMouseEnter={(e) => {
                if (activeMenu !== 'dashboard') e.currentTarget.style.backgroundColor = '#f9fafb';
              }}
              onMouseLeave={(e) => {
                if (activeMenu !== 'dashboard') e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              통합 현황판
            </button>
          </div>

          {/* Main Tab & Submenu: Project Checklist Section */}
          <div className="space-y-0.5">
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#c0c8d2' }}>
              Checklist & WBS
            </div>

            <button
              onClick={() => {
                setActiveMenu('checklist_pm');
                setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer"
              style={(activeMenu.startsWith('checklist_') || activeMenu === 'deploy_slide')
                ? { backgroundColor: '#eff6ff', color: '#3182f6', fontWeight: 600 }
                : { color: '#4e5968' }
              }
              onMouseEnter={(e) => {
                if (!(activeMenu.startsWith('checklist_') || activeMenu === 'deploy_slide')) e.currentTarget.style.backgroundColor = '#f9fafb';
              }}
              onMouseLeave={(e) => {
                if (!(activeMenu.startsWith('checklist_') || activeMenu === 'deploy_slide')) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              프로젝트 체크리스트
            </button>

            {/* Nested Sub-menus */}
            {activeProjectId && (
              <div className="ml-5 pl-3 py-1 space-y-0.5" style={{ borderLeft: '1.5px solid #e5e8eb' }}>
                {[
                  { key: 'checklist_pm', label: 'PM 체크리스트' },
                  { key: 'checklist_wbs', label: 'WBS 일정표' },
                  { key: 'checklist_a11y', label: '접근성 점검리스트' },
                  { key: 'deploy_slide', label: '배포리스트' },
                  { key: 'checklist_weekly', label: '주간보고서 생성기' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setActiveMenu(key as typeof activeMenu); setIsSidebarOpen(false); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs transition-all cursor-pointer block font-medium"
                    style={activeMenu === key
                      ? { color: '#3182f6', backgroundColor: '#eff6ff', fontWeight: 700 }
                      : { color: '#8b95a1' }
                    }
                    onMouseEnter={(e) => {
                      if (activeMenu !== key) e.currentTarget.style.backgroundColor = '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      if (activeMenu !== key) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Main Tab: Deliverables & Settings */}
          <div className="space-y-0.5">
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#c0c8d2' }}>
              General
            </div>

            {[
              { key: 'documents', label: '산출물 보관함', icon: <Files className="w-4 h-4 shrink-0" /> },
              { key: 'settings', label: '시스템 설정', icon: <Settings className="w-4 h-4 shrink-0" /> },
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => { setActiveMenu(key as typeof activeMenu); setIsSidebarOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer"
                style={activeMenu === key
                  ? { backgroundColor: '#eff6ff', color: '#3182f6', fontWeight: 600 }
                  : { color: '#4e5968' }
                }
                onMouseEnter={(e) => {
                  if (activeMenu !== key) e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  if (activeMenu !== key) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </nav>

        {/* Sidebar Footer */}
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
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#fff2f3';
              e.currentTarget.style.color = '#f04452';
              e.currentTarget.style.borderColor = 'rgba(240,68,82,0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f9fafb';
              e.currentTarget.style.color = '#8b95a1';
              e.currentTarget.style.borderColor = '#e5e8eb';
            }}
          >
            <LogOut className="w-3.5 h-3.5" /> 로그아웃
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay Drawer backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* 2. MAIN CONTENT AREA CONTAINER */}
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">

        {/* Top Header Bar */}
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
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-lg cursor-pointer transition-colors"
              style={{ color: '#8b95a1', border: '1px solid #e5e8eb' }}
            >
              <Menu className="w-4.5 h-4.5" />
            </button>

            <div className="hidden md:flex items-center gap-1.5 text-xs">
              <span style={{ color: '#8b95a1' }}>PM Tool</span>
              <ChevronRight className="w-3.5 h-3.5" style={{ color: '#c0c8d2' }} />
              <span className="font-semibold" style={{ color: '#191f28' }}>
                {activeMenu === 'checklist_pm' && 'PM 체크리스트'}
                {activeMenu === 'checklist_wbs' && 'WBS 일정표'}
                {activeMenu === 'checklist_a11y' && '접근성 점검리스트'}
                {activeMenu === 'checklist_weekly' && '주간보고서 생성기'}
                {activeMenu === 'deploy_slide' && '배포리스트'}
                {activeMenu === 'dashboard' && '통합 현황판'}
                {activeMenu === 'documents' && '산출물 보관함'}
                {activeMenu === 'settings' && '시스템 설정'}
              </span>
            </div>
          </div>

          {/* Project Picker */}
          {(activeMenu.startsWith('checklist_') || activeMenu === 'deploy_slide' || activeMenu === 'documents') && projects.length > 0 && (
            <div className="flex-1 max-w-[360px] mx-4 md:mx-8">
              <div className="flex gap-2">
                <select
                  value={activeProjectId}
                  onChange={(e) => { setActiveProjectId(e.target.value); setItems([]); }}
                  className="w-full rounded-xl px-3 py-2 text-xs font-medium cursor-pointer transition-all"
                  style={{
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e8eb',
                    color: '#191f28',
                  }}
                >
                  <option value="">프로젝트 선택...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                {activeMenu === 'checklist_pm' && (
                  <>
                    <button
                      onClick={() => setIsProjectModalOpen(true)}
                      title="새 프로젝트 추가"
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition-all"
                      style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e8eb', color: '#4e5968' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#eff6ff'; e.currentTarget.style.color = '#3182f6'; e.currentTarget.style.borderColor = 'rgba(49,130,246,0.3)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f9fafb'; e.currentTarget.style.color = '#4e5968'; e.currentTarget.style.borderColor = '#e5e8eb'; }}
                    >
                      <FolderPlus className="w-4 h-4" />
                    </button>
                    {activeProjectId && (
                      <button
                        onClick={handleDeleteProject}
                        title="프로젝트 삭제"
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition-all"
                        style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e8eb', color: '#4e5968' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fff2f3'; e.currentTarget.style.color = '#f04452'; e.currentTarget.style.borderColor = 'rgba(240,68,82,0.2)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f9fafb'; e.currentTarget.style.color = '#4e5968'; e.currentTarget.style.borderColor = '#e5e8eb'; }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {(!((activeMenu.startsWith('checklist_') || activeMenu === 'documents') && projects.length > 0)) && (
            <div className="flex-1" />
          )}

          {/* Live Badge */}
          <div
            className="text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5"
            style={{ backgroundColor: '#f0fdf9', color: '#00b493', border: '1px solid rgba(0,180,147,0.15)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse" />
            Live
          </div>
        </header>

        {/* 3. DYNAMIC CONTENT SWITCHER */}
        <main className="flex-1 px-6 md:px-10 py-6 max-w-7xl mx-auto w-full space-y-6">
          
          {/* ========================================================
              MENU 1-1: PM CHECKLIST SUB-TAB
             ======================================================== */}
          {activeMenu === 'checklist_pm' && (
            <>
              {!activeProjectId ? (
                <div className="flex flex-col items-center justify-center text-center p-20 bg-bg-secondary border border-dashed border-border-color rounded-lg mt-8 space-y-5 animate-fade-in-down">
                  <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center text-text-muted">
                    <FolderPlus className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-text-main font-heading">선택된 프로젝트가 없거나 생성되지 않았습니다</h3>
                    <p className="text-sm text-text-muted max-w-md">새 프로젝트를 추가하거나 생성된 프로젝트를 선택해 주세요.</p>
                  </div>
                  <button
                    onClick={() => setIsProjectModalOpen(true)}
                    className="px-5 py-2.5 bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-semibold rounded shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer"
                  >
                    + 새 프로젝트 만들기
                  </button>
                </div>
              ) : (
                <>
                  <Dashboard
                    totalCount={totalCount}
                    checkedCount={checkedCount}
                    riskCount={riskCount}
                    docCount={docCount}
                    extCount={extCount}
                  />

                  {/* Phase Tabs Bar */}
                  <nav className="flex border-b border-border-color bg-bg-primary sticky top-[69px] z-30 pt-2 pb-0">
                    {['pre', 'in_progress', 'review', 'done'].map((phaseCode) => (
                      <button
                        key={phaseCode}
                        onClick={() => setActivePhase(phaseCode)}
                        className={`py-3.5 px-6 text-sm font-medium transition-all flex items-center gap-2 cursor-pointer relative ${
                          activePhase === phaseCode ? 'text-brand-primary font-bold' : 'text-text-muted hover:text-text-main'
                        }`}
                      >
                        {getPhaseKorean(phaseCode)}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          activePhase === phaseCode ? 'bg-bg-primary-soft text-brand-primary font-bold' : 'bg-bg-tertiary text-text-muted'
                        }`}>{getPhaseStats(phaseCode)}</span>
                        {activePhase === phaseCode && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary drop-shadow-[0_0_2px_rgba(99,102,241,1)]" />}
                      </button>
                    ))}
                  </nav>

                  {/* Items Content Section */}
                  {dataLoading ? (
                    <div className="flex flex-col items-center justify-center p-20 gap-4 text-text-muted">
                      <Loader2 className="w-7 h-7 text-brand-primary animate-spin" />
                      <span className="text-xs">데이터를 불러오는 중입니다...</span>
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center p-20 bg-bg-secondary border border-dashed border-border-color rounded-lg mt-4 space-y-4">
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
                        className="px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-semibold rounded flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        + 항목 추가하기
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
                          id: item.id,
                          group_name: item.group_name,
                          text: item.text,
                          tag: item.tag || '',
                          assignee: item.assignee || '',
                          due_date: item.due_date || '',
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
                  )}
                </>
              )}
            </>
          )}

          {/* ========================================================
              MENU 1-2: WBS SCHEDULE TIMELINE — 구글 시트 스타일
             ======================================================== */}
          {activeMenu === 'checklist_wbs' && (
            <section className="animate-fade-in flex flex-col" style={{ minHeight: 0 }}>
              {/* Header */}
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                  <h2 className="text-lg font-bold font-heading" style={{ color: '#191f28' }}>WBS 일정표</h2>
                  <p className="text-xs mt-0.5" style={{ color: '#8b95a1' }}>
                    {activeProjectName ? `${activeProjectName} — ` : ''}구글 시트 WBS 기반 프로젝트 일정 관리
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex bg-[#f2f4f6] rounded-lg p-1">
                    <button
                      onClick={() => setWbsViewMode('table')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${wbsViewMode === 'table' ? 'bg-white text-[#3182f6] shadow-sm' : 'text-[#8b95a1] hover:text-[#4e5968]'}`}
                    >
                      내부 WBS 테이블
                    </button>
                    <button
                      onClick={() => setWbsViewMode('sheet')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${wbsViewMode === 'sheet' ? 'bg-white text-[#3182f6] shadow-sm' : 'text-[#8b95a1] hover:text-[#4e5968]'}`}
                    >
                      구글 시트 연동 뷰
                    </button>
                  </div>
                  {wbsSavingId && wbsViewMode === 'table' && (
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-xl animate-pulse"
                      style={{ backgroundColor: '#eff6ff', color: '#3182f6' }}>
                      저장 중...
                    </span>
                  )}
                </div>
              </div>

          {!activeProjectId ? (
                <div className="text-center p-20 rounded-2xl text-sm"
                  style={{ backgroundColor: '#ffffff', border: '1.5px dashed #e5e8eb', color: '#8b95a1' }}>
                  프로젝트를 먼저 선택해 주세요.
                </div>
          ) : (
            (() => {
              const project = projects.find(p => p.id === activeProjectId);
              const hasUrl = !!project?.wbs_sheet_url;

              // 1. URL이 없으면 무조건 연동 주소 입력창 먼저 띄우기
              if (!hasUrl || editingSheetUrl) {
                const templateUri = "https://docs.google.com/spreadsheets/d/16lGiOWfQhGhGuVdHnP6pqhNeuJ3_GXUFwYeUTXyBH5M/copy";
                return (
                  <div className="text-center p-12 rounded-2xl max-w-2xl mx-auto" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e8eb', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                    <div className="text-[#3182f6] mb-4 flex justify-center"><FileSpreadsheet className="w-12 h-12" /></div>
                    <h4 className="font-bold text-[#191f28] mb-2 text-base">구글 WBS 시트 연동이 필요합니다</h4>
                    <p className="text-xs text-[#4e5968] mb-6 leading-relaxed">
                      WBS 연동을 완료하려면 아래 버튼을 통해 템플릿 사본을 본인의 구글 드라이브에 복사한 후,<br />
                      새로 복사된 구글 시트의 웹 브라우저 주소(URL)를 아래 입력창에 등록해 주세요.
                    </p>
                    
                    {/* 템플릿 바로가기 카드 */}
                    <div className="mb-6 p-4 rounded-xl bg-[#f9fafb] border border-[#e5e8eb] text-left">
                      <div className="flex justify-between items-center gap-4">
                        <div>
                          <p className="text-xs font-bold text-[#191f28] mb-1">WBS 표준 구글 시트 템플릿</p>
                          <p className="text-[11px] text-[#8b95a1] leading-normal">
                            버튼을 클릭하면 사본 생성 확인 페이지로 이동합니다. **[사본 만들기]** 버튼을 누르시면 본인의 구글 드라이브에 시트가 즉시 복제됩니다.
                          </p>
                        </div>
                        <a 
                          href={templateUri} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          사본 만들기 ↗
                        </a>
                      </div>
                    </div>

                    {/* 주소 등록 입력 폼 */}
                    <div className="flex flex-col gap-2 max-w-lg mx-auto text-left">
                      <label className="text-[11px] font-bold text-[#4e5968] ml-0.5">복사한 구글 시트 URL 입력</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          placeholder="https://docs.google.com/spreadsheets/d/..."
                          value={sheetUrlInput}
                          onChange={(e) => setSheetUrlInput(e.target.value)}
                          className="flex-1 bg-white border border-[#e5e8eb] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#3182f6]"
                          style={{ color: '#191f28' }}
                        />
                        <button 
                          onClick={() => handleSaveSheetUrl(activeProjectId, sheetUrlInput)} 
                          className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                        >
                          연동 및 저장
                        </button>
                        {hasUrl && (
                          <button 
                            onClick={() => setEditingSheetUrl(false)} 
                            className="px-4 py-2 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                          >
                            취소
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              // 2. 구글 시트 연동 뷰 (Iframe 대신 새 창 열기 버튼으로 변경)
              if (wbsViewMode === 'sheet') {
                const sheetUrl = project.wbs_sheet_url || '';
                return (
                  <div className="text-center p-16 rounded-2xl max-w-2xl mx-auto"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #e5e8eb', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                    <div className="text-[#3182f6] mb-4 flex justify-center"><ExternalLink className="w-12 h-12" /></div>
                    <h4 className="font-bold text-[#191f28] mb-2 text-base">구글 스프레드시트 WBS가 연동되어 있습니다</h4>
                    <p className="text-xs text-[#8b95a1] mb-6 max-w-md mx-auto leading-relaxed">
                      WBS 일정 관리는 연동된 구글 시트에서 실시간으로 이루어집니다.<br />아래 버튼을 클릭하여 새 창에서 시트를 열고 편집해 주세요.
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <a 
                        href={sheetUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        구글 WBS 시트 열기 ↗
                      </a>
                      <button 
                        onClick={() => { setSheetUrlInput(project.wbs_sheet_url || ''); setEditingSheetUrl(true); }} 
                        className="px-4 py-2.5 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        연동 주소 수정
                      </button>
                    </div>
                  </div>
                );
              }

              // 3. 내부 WBS 테이블 뷰
              if (wbsLoading) {
                return (
                  <div className="text-center p-20 rounded-2xl text-sm"
                    style={{ backgroundColor: '#ffffff', color: '#8b95a1' }}>
                    WBS 데이터 로딩 중...
                  </div>
                );
              }

              if (wbsRows.length === 0) {
                return (
                  <div className="text-center p-16 rounded-2xl"
                    style={{ backgroundColor: '#ffffff', border: '1.5px dashed #e5e8eb' }}>
                    <p className="text-sm font-semibold mb-2" style={{ color: '#4e5968' }}>DB에 등록된 WBS 데이터가 없습니다</p>
                    <p className="text-xs mb-4" style={{ color: '#8b95a1' }}>
                      구글 시트 연동이 완료되었습니다! Apps Script를 통해 구글 시트에서 데이터를 동기화하거나,<br/>아래 버튼을 눌러 내부 DB에 기본 템플릿을 생성할 수 있습니다.
                    </p>
                    <button
                      onClick={async () => {
                        await initializeWbs(activeProjectId, activeProjectName);
                        fetchWbs(activeProjectId);
                      }}
                      className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded cursor-pointer transition-colors"
                    >
                      + 기본 WBS DB 생성하기
                    </button>
                  </div>
                );
              }

              return (
                <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#ffffff', boxShadow: '0 2px 16px rgba(0,0,0,0.08)', border: '1px solid #dde1e7' }}>
                  <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                    <table className="w-full text-left border-collapse" style={{ fontSize: '12px', minWidth: '980px', tableLayout: 'fixed' }}>
                      {/* Column widths */}
                      <colgroup>
                        <col style={{ width: '36px' }} />
                        <col style={{ width: '30px' }} />
                        <col style={{ width: '260px' }} />
                        <col style={{ width: '150px' }} />
                        <col style={{ width: '68px' }} />
                        <col style={{ width: '84px' }} />
                        <col style={{ width: '98px' }} />
                        <col style={{ width: '98px' }} />
                        <col style={{ width: '98px' }} />
                        <col style={{ width: '98px' }} />
                        <col style={{ width: '88px' }} />
                        <col style={{ width: '88px' }} />
                      </colgroup>
                      {/* Sticky header — 2 rows like Google Sheets */}
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr style={{ backgroundColor: '#1a3a5c', borderBottom: '1px solid #2d5a8e' }}>
                          <th className="py-2 px-2 font-bold text-center text-white" rowSpan={2} style={{ borderRight: '1px solid #2d5a8e', fontSize: '11px', verticalAlign: 'middle' }}>No</th>
                          <th className="py-2 px-1 font-bold text-center text-white" rowSpan={2} style={{ borderRight: '1px solid #2d5a8e', fontSize: '11px', verticalAlign: 'middle' }}>Lv</th>
                          <th className="py-2 px-3 font-bold text-white" rowSpan={2} style={{ borderRight: '1px solid #2d5a8e', fontSize: '11px', verticalAlign: 'middle' }}>TASK (Work specification)</th>
                          <th className="py-2 px-3 font-bold text-white" rowSpan={2} style={{ borderRight: '1px solid #2d5a8e', fontSize: '11px', verticalAlign: 'middle' }}>Description / Outputs</th>
                          <th className="py-2 px-2 font-bold text-center text-white" rowSpan={2} style={{ borderRight: '1px solid #2d5a8e', fontSize: '11px', verticalAlign: 'middle' }}>R/R</th>
                          <th className="py-2 px-2 font-bold text-center text-white" rowSpan={2} style={{ borderRight: '1px solid #2d5a8e', fontSize: '11px', verticalAlign: 'middle' }}>Status</th>
                          <th className="py-2 px-2 font-bold text-center text-white" colSpan={2} style={{ borderRight: '1px solid #2d5a8e', fontSize: '11px', borderBottom: '1px solid #2d5a8e' }}>계획 일정</th>
                          <th className="py-2 px-2 font-bold text-center text-white" colSpan={2} style={{ borderRight: '1px solid #2d5a8e', fontSize: '11px', borderBottom: '1px solid #2d5a8e' }}>실제 일정</th>
                          <th className="py-2 px-2 font-bold text-center text-white" rowSpan={2} style={{ borderRight: '1px solid #2d5a8e', fontSize: '11px', verticalAlign: 'middle' }}>계획(%)</th>
                          <th className="py-2 px-2 font-bold text-center text-white" rowSpan={2} style={{ fontSize: '11px', verticalAlign: 'middle' }}>실제(%)</th>
                        </tr>
                        <tr style={{ backgroundColor: '#1e4976', borderBottom: '2px solid #0f2b47' }}>
                          <th className="py-1 px-2 font-semibold text-center" style={{ color: '#93c5fd', fontSize: '10px', borderRight: '1px solid #2d5a8e' }}>시작</th>
                          <th className="py-1 px-2 font-semibold text-center" style={{ color: '#93c5fd', fontSize: '10px', borderRight: '1px solid #2d5a8e' }}>완료</th>
                          <th className="py-1 px-2 font-semibold text-center" style={{ color: '#6ee7b7', fontSize: '10px', borderRight: '1px solid #2d5a8e' }}>시작</th>
                          <th className="py-1 px-2 font-semibold text-center" style={{ color: '#6ee7b7', fontSize: '10px', borderRight: '1px solid #2d5a8e' }}>완료</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wbsRows.map((row) => {
                          const isL1 = row.level === 1;
                          const isL2 = row.level === 2;
                          const isL3 = row.level === 3;
                          const taskText = row.task_l1 || row.task_l2 || row.task_l3 || row.task_l4 || '';
                          const indentPx = Math.max(0, row.level - 1) * 14;

                          // Google Sheets matching color scheme
                          let rowBg = '#ffffff';
                          let rowBorderColor = '#e8ecf0';
                          if (isL1) { rowBg = '#c9daf8'; rowBorderColor = '#a4c2f4'; }
                          else if (isL2) { rowBg = '#e8f0fe'; rowBorderColor = '#d0e0fd'; }
                          else if (isL3) { rowBg = '#f8faff'; rowBorderColor = '#edf2fc'; }

                          const statusMap: Record<string, { bg: string; text: string }> = {
                            '완료':   { bg: '#d4edda', text: '#155724' },
                            '진행중': { bg: '#cce5ff', text: '#004085' },
                            '미진행': { bg: '#f1f3f5', text: '#6c757d' },
                          };
                          const sc = statusMap[row.status] || statusMap['미진행'];

                          const taskFw = isL1 ? '700' : isL2 ? '600' : '400';
                          const taskColor = isL1 ? '#1a3a5c' : isL2 ? '#1e4976' : isL3 ? '#374151' : '#6b7280';
                          const taskFs = isL1 ? '13px' : '12px';
                          const cellBorder = `1px solid ${rowBorderColor}`;
                          const inputStyle = { color: '#374151', fontSize: '11px' };

                          return (
                            <tr key={row.id} style={{ backgroundColor: rowBg, borderBottom: cellBorder }}>
                              {/* No */}
                              <td className="py-1.5 px-2 text-center" style={{ color: '#9ca3af', borderRight: cellBorder, fontSize: '11px', fontWeight: 500 }}>
                                {row.row_order}
                              </td>

                              {/* Level badge */}
                              <td className="py-1.5 px-1 text-center" style={{ borderRight: cellBorder }}>
                                <span className="inline-flex items-center justify-center rounded text-white font-bold"
                                  style={{
                                    fontSize: '9px', width: '18px', height: '18px',
                                    backgroundColor: isL1 ? '#1a3a5c' : isL2 ? '#3b7dd8' : isL3 ? '#6ca0dc' : '#9ec3eb'
                                  }}>
                                  L{row.level}
                                </span>
                              </td>

                              {/* TASK */}
                              <td className="py-1.5 relative group" style={{ borderRight: cellBorder, paddingLeft: `${10 + indentPx}px`, paddingRight: '8px' }}>
                                <div className="truncate max-w-[280px]">
                                  <span style={{ fontWeight: taskFw, color: taskColor, fontSize: taskFs }}>
                                    {isL1 && <span style={{ marginRight: '5px', opacity: 0.7 }}>■</span>}
                                    {isL2 && <span style={{ marginRight: '4px', opacity: 0.5 }}>▸</span>}
                                    {!isL1 && !isL2 && <span style={{ marginRight: '4px', color: '#9ca3af' }}>·</span>}
                                    {taskText}
                                  </span>
                                </div>
                                {taskText && (
                                  <div className="absolute left-4 bottom-full mb-1 hidden group-hover:block z-30 bg-[#191f28] text-white text-[11px] rounded-lg px-2.5 py-1.5 max-w-none w-max whitespace-nowrap shadow-lg pointer-events-none leading-relaxed border border-[#333d4b]">
                                    {taskText}
                                  </div>
                                )}
                              </td>

                              {/* Description */}
                              <td className="py-1.5 px-2.5 text-xs text-[#374151] relative group" style={{ borderRight: cellBorder }}>
                                <div className="truncate max-w-[280px]">
                                  {row.description || '—'}
                                </div>
                                {row.description && (
                                  <div className="absolute left-4 bottom-full mb-1 hidden group-hover:block z-30 bg-[#191f28] text-white text-[11px] rounded-lg px-2.5 py-1.5 max-w-none w-max whitespace-nowrap shadow-lg pointer-events-none leading-relaxed border border-[#333d4b]">
                                    {row.description}
                                  </div>
                                )}
                              </td>

                              {/* R/R */}
                              <td className="py-1.5 px-1.5 text-center text-xs text-[#374151]" style={{ borderRight: cellBorder }}>
                                {row.assignee || '—'}
                              </td>

                              {/* Status */}
                              <td className="py-1.5 px-1 text-center" style={{ borderRight: cellBorder }}>
                                <span 
                                  className="px-2 py-0.5 rounded-md inline-block font-semibold" 
                                  style={{ backgroundColor: sc.bg, color: sc.text, fontSize: '10px' }}
                                >
                                  {row.status}
                                </span>
                              </td>

                              {/* 계획 시작 */}
                              <td className="py-1.5 px-1 text-center text-xs text-[#4e5968]" style={{ borderRight: cellBorder, fontSize: '11px' }}>
                                {row.plan_start || '—'}
                              </td>

                              {/* 계획 완료 */}
                              <td className="py-1.5 px-1 text-center text-xs text-[#4e5968]" style={{ borderRight: cellBorder, fontSize: '11px' }}>
                                {row.plan_end || '—'}
                              </td>

                              {/* 실제 시작 */}
                              <td className="py-1.5 px-1 text-center text-xs text-[#059669]" style={{ borderRight: cellBorder, fontSize: '11px' }}>
                                {row.actual_start || '—'}
                              </td>

                              {/* 실제 완료 */}
                              <td className="py-1.5 px-1 text-center text-xs text-[#059669]" style={{ borderRight: cellBorder, fontSize: '11px' }}>
                                {row.actual_end || '—'}
                              </td>

                              {/* 계획 진척율 — 읽기 전용 */}
                              <td className="py-1.5 px-2 text-center" style={{ borderRight: cellBorder }}>
                                <span className="font-semibold" style={{ color: '#2563eb', fontSize: '12px' }}>
                                  {row.plan_progress}%
                                </span>
                              </td>

                              {/* 실제 진척율 — 읽기 전용 */}
                              <td className="py-1.5 px-2 text-center">
                                <span className="font-semibold" style={{ color: '#059669', fontSize: '12px' }}>
                                  {row.actual_progress}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()
              )}
            </section>
          )}

          {/* ========================================================
              MENU 1-3: ACCESSIBILITY SPREADSHEET AUDIT SUB-TAB
             ======================================================== */}
          {activeMenu === 'checklist_a11y' && (
            <section className="animate-fade-in flex flex-col" style={{ minHeight: 0 }}>
              {/* Header */}
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                  <h2 className="text-lg font-bold font-heading" style={{ color: '#191f28' }}>웹 접근성 점검리스트 (KWCAG 2.2)</h2>
                  <p className="text-xs mt-0.5" style={{ color: '#8b95a1' }}>
                    {activeProjectName ? `${activeProjectName} — ` : ''}한국형 웹 콘텐츠 접근성 지침 33개 항목 점검 대장
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex bg-[#f2f4f6] rounded-lg p-1">
                    <button
                      onClick={() => setA11yViewMode('dashboard')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${a11yViewMode === 'dashboard' ? 'bg-white text-[#3182f6] shadow-sm' : 'text-[#8b95a1] hover:text-[#4e5968]'}`}
                    >
                      대시보드
                    </button>
                    <button
                      onClick={() => setA11yViewMode('table')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${a11yViewMode === 'table' ? 'bg-white text-[#3182f6] shadow-sm' : 'text-[#8b95a1] hover:text-[#4e5968]'}`}
                    >
                      내부 점검 대장
                    </button>
                    <button
                      onClick={() => setA11yViewMode('sheet')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${a11yViewMode === 'sheet' ? 'bg-white text-[#3182f6] shadow-sm' : 'text-[#8b95a1] hover:text-[#4e5968]'}`}
                    >
                      구글 시트 연동
                    </button>
                  </div>
                </div>
              </div>

              {!activeProjectId ? (
                <div className="text-center p-20 rounded-2xl text-sm"
                  style={{ backgroundColor: '#ffffff', border: '1.5px dashed #e5e8eb', color: '#8b95a1' }}>
                  프로젝트를 먼저 선택해 주세요.
                </div>
              ) : (
                (() => {
                  const project = projects.find(p => p.id === activeProjectId);
                  const hasUrl = !!project?.a11y_sheet_url;

                  // 연동 주소가 없거나 수정 상태일 때 (우선적으로 연동을 먼저 진행하도록 강제)
                  if (!hasUrl || editingA11ySheetUrl) {
                    const templateUri = "https://docs.google.com/spreadsheets/d/13A49_Y4h7UxTsJG35CW4vQnC1S4S0UgDqhGjWL176hY/copy";
                    return (
                      <div className="text-center p-12 rounded-2xl max-w-2xl mx-auto" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e8eb', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                        <div className="text-[#3182f6] mb-4 flex justify-center"><FileSpreadsheet className="w-12 h-12" /></div>
                        <h4 className="font-bold text-[#191f28] mb-2 text-base">구글 접근성 점검 시트 연동이 필요합니다</h4>
                        <p className="text-xs text-[#4e5968] mb-6 leading-relaxed">
                          접근성 점검리스트 연동을 완료하려면 아래 버튼을 통해 템플릿 사본을 본인의 구글 드라이브에 복사한 후,<br />
                          새로 복사된 구글 시트의 웹 브라우저 주소(URL)를 아래 입력창에 등록해 주세요.
                        </p>
                        
                        {/* 템플릿 바로가기 카드 */}
                        <div className="mb-6 p-4 rounded-xl bg-[#f9fafb] border border-[#e5e8eb] text-left">
                          <div className="flex justify-between items-center gap-4">
                            <div>
                              <p className="text-xs font-bold text-[#191f28] mb-1">접근성 점검 표준 구글 시트 템플릿</p>
                              <p className="text-[11px] text-[#8b95a1] leading-normal">
                                버튼을 클릭하면 사본 생성 확인 페이지로 이동합니다. **[사본 만들기]** 버튼을 누르시면 본인의 구글 드라이브에 시트가 즉시 복제됩니다.
                              </p>
                            </div>
                            <a 
                              href={templateUri} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
                            >
                              사본 만들기 ↗
                            </a>
                          </div>
                        </div>

                        {/* 주소 등록 입력 폼 */}
                        <div className="flex flex-col gap-2 max-w-lg mx-auto text-left">
                          <label className="text-[11px] font-bold text-[#4e5968] ml-0.5">복사한 구글 시트 URL 입력</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="url"
                              placeholder="https://docs.google.com/spreadsheets/d/..."
                              value={a11ySheetUrlInput}
                              onChange={(e) => setA11ySheetUrlInput(e.target.value)}
                              className="flex-1 bg-white border border-[#e5e8eb] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#3182f6]"
                              style={{ color: '#191f28' }}
                            />
                            <button 
                              onClick={() => handleSaveA11ySheetUrl(activeProjectId, a11ySheetUrlInput)} 
                              className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                            >
                              연동 및 저장
                            </button>
                            {hasUrl && (
                              <button 
                                onClick={() => setEditingA11ySheetUrl(false)} 
                                className="px-4 py-2 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                              >
                                취소
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // 1. 대시보드 뷰
                  if (a11yViewMode === 'dashboard') {
                    const uniquePages = new Set<string>();
                    let totalViolations = 0;
                    let unfixedCount = 0;          // 조치필요
                    let fixingCount = 0;           // 수정중
                    let fixCompletedCount = 0;     // 수정완료
                    let actionCompletedCount = 0;  // 조치완료
                    let verifiedCount = 0;         // 검수완료

                    let recognition = 0;
                    let operation = 0;
                    let understanding = 0;
                    let robustness = 0;
                    let others = 0;

                    const depthGroups: Record<string, {
                      name: string;
                      items: typeof a11yItems;
                      counts: Record<string, number>;
                      total: number;
                      progress: number;
                    }> = {};

                    const getA11yItemStatus = (item: any): string => {
                      const tagStr = (item.tag || '').trim();
                      if (tagStr.includes('검수완료') || tagStr.includes('검수 완료') || item.checked) {
                        return '검수완료';
                      } else if (tagStr.includes('조치완료') || tagStr.includes('조치 완료')) {
                        return '조치완료';
                      } else if (tagStr.includes('수정완료') || tagStr.includes('수정 완료')) {
                        return '수정완료';
                      } else if (tagStr.includes('수정중') || tagStr.includes('수정 중') || tagStr.includes('진행')) {
                        return '수정중';
                      } else {
                        return '조치필요';
                      }
                    };

                    a11yItems.forEach(item => {
                      // 페이지명 수집
                      let pageName = '';
                      let errorMsg = '';
                      if (item.memo) {
                        try {
                          const parsed = JSON.parse(item.memo);
                          pageName = parsed.page_name || '';
                          errorMsg = parsed.error_msg || '';
                        } catch {
                          errorMsg = item.memo;
                        }
                      }
                      
                      if (pageName) {
                        uniquePages.add(pageName);
                      } else {
                        uniquePages.add(item.group_name);
                      }

                      // 상태 분류 (O열 tag 값 기반 분류)
                      const tagStr = (item.tag || '').trim();

                      if (tagStr.includes('검수완료') || tagStr.includes('검수 완료') || item.checked) {
                        verifiedCount++;
                      } else if (tagStr.includes('조치완료') || tagStr.includes('조치 완료')) {
                        actionCompletedCount++;
                      } else if (tagStr.includes('수정완료') || tagStr.includes('수정 완료')) {
                        fixCompletedCount++;
                      } else if (tagStr.includes('수정중') || tagStr.includes('수정 중') || tagStr.includes('진행')) {
                        fixingCount++;
                      } else {
                        unfixedCount++; // 조치필요, 대기 등
                      }

                      // depth(group_name)별 그룹화 추가
                      const group = item.group_name || '기타';
                      if (!depthGroups[group]) {
                        depthGroups[group] = {
                          name: group,
                          items: [],
                          counts: {
                            '조치필요': 0,
                            '수정중': 0,
                            '수정완료': 0,
                            '조치완료': 0,
                            '검수완료': 0
                          },
                          total: 0,
                          progress: 0
                        };
                      }
                      depthGroups[group].items.push(item);
                      depthGroups[group].total++;
                      const itemStatus = getA11yItemStatus(item);
                      if (depthGroups[group].counts[itemStatus] !== undefined) {
                        depthGroups[group].counts[itemStatus]++;
                      }

                      // 원칙별 위반 계산
                      if (!item.checked) {
                        totalViolations++;

                        const match = item.text.match(/^(\d+)/);
                        if (match) {
                          const num = parseInt(match[1], 10);
                          if (num >= 1 && num <= 9) {
                            recognition++;
                          } else if (num >= 10 && num <= 18) {
                            operation++;
                          } else if (num >= 19 && num <= 22) {
                            understanding++;
                          } else if (num >= 23 && num <= 24) {
                            robustness++;
                          } else {
                            others++;
                          }
                        } else {
                          const textCombined = (item.text + " " + item.group_name).toLowerCase();
                          if (textCombined.includes('인식')) {
                            recognition++;
                          } else if (textCombined.includes('운용')) {
                            operation++;
                          } else if (textCombined.includes('이해')) {
                            understanding++;
                          } else if (textCombined.includes('견고')) {
                            robustness++;
                          } else {
                            others++;
                          }
                        }
                      }
                    });

                    // 각 그룹별 진척도 계산 및 세부 정렬
                    Object.values(depthGroups).forEach(g => {
                      g.progress = Math.round((g.counts['검수완료'] / g.total) * 100);
                      const statusOrderLocal: Record<string, number> = {
                        '조치필요': 1,
                        '수정중': 2,
                        '수정완료': 3,
                        '조치완료': 4,
                        '검수완료': 5
                      };
                      g.items.sort((a, b) => {
                        const statusA = getA11yItemStatus(a);
                        const statusB = getA11yItemStatus(b);
                        const orderA = statusOrderLocal[statusA] || 99;
                        const orderB = statusOrderLocal[statusB] || 99;
                        if (orderA !== orderB) return orderA - orderB;
                        return (a.sort_order || 0) - (b.sort_order || 0);
                      });
                    });

                    const sortedGroups = Object.values(depthGroups).sort((a, b) => {
                      if (a.progress !== b.progress) return a.progress - b.progress;
                      return b.total - a.total;
                    });

                    const totalPages = uniquePages.size;
                    const maxVal = Math.max(recognition, operation, understanding, robustness, others, 1);

                    return (
                      <div className="space-y-6">
                        {/* 상단 카드 Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                          {/* 1. 총 페이지 수 */}
                          <div className="bg-white p-5 rounded-2xl border border-[#e5e8eb] shadow-sm flex flex-col justify-between h-[120px] transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
                            <span className="text-xs font-semibold text-[#8b95a1]">총 페이지 수</span>
                            <span className="text-3xl font-extrabold text-[#191f28]">{totalPages} <span className="text-sm font-bold text-[#8b95a1]">개</span></span>
                          </div>
                          
                          {/* 2. 조치필요 */}
                          <div className="bg-[#fdf3f4] p-5 rounded-2xl border border-[#fce8e6] shadow-sm flex flex-col justify-between h-[120px] transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
                            <span className="text-xs font-semibold text-[#c5221f]">조치필요</span>
                            <span className="text-3xl font-extrabold text-[#c5221f]">{unfixedCount} <span className="text-sm font-bold text-[#c5221f]/70">건</span></span>
                          </div>

                          {/* 3. 수정중 */}
                          <div className="bg-[#e8f0fe] p-5 rounded-2xl border border-[#e8f0fe] shadow-sm flex flex-col justify-between h-[120px] transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
                            <span className="text-xs font-semibold text-[#1a73e8]">수정중</span>
                            <span className="text-3xl font-extrabold text-[#1a73e8]">{fixingCount} <span className="text-sm font-bold text-[#1a73e8]/70">건</span></span>
                          </div>

                          {/* 4. 수정완료 */}
                          <div className="bg-[#fff9eb] p-5 rounded-2xl border border-[#fef7e0] shadow-sm flex flex-col justify-between h-[120px] transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
                            <span className="text-xs font-semibold text-[#b06000]">수정완료</span>
                            <span className="text-3xl font-extrabold text-[#b06000]">{fixCompletedCount} <span className="text-sm font-bold text-[#b06000]/70">건</span></span>
                          </div>

                          {/* 5. 조치완료 */}
                          <div className="bg-[#f3e8ff] p-5 rounded-2xl border border-[#eeddff] shadow-sm flex flex-col justify-between h-[120px] transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
                            <span className="text-xs font-semibold text-[#7e22ce]">조치완료</span>
                            <span className="text-3xl font-extrabold text-[#7e22ce]">{actionCompletedCount} <span className="text-sm font-bold text-[#7e22ce]/70">건</span></span>
                          </div>

                          {/* 6. 검수완료 */}
                          <div className="bg-[#e6f4ea] p-5 rounded-2xl border border-[#e6f4ea] shadow-sm flex flex-col justify-between h-[120px] transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
                            <span className="text-xs font-semibold text-[#137333]">검수완료</span>
                            <span className="text-3xl font-extrabold text-[#137333]">{verifiedCount} <span className="text-sm font-bold text-[#137333]/70">건</span></span>
                          </div>
                        </div>

                        {/* 모든 점검 항목 완벽 적합 시 배너 표시 */}
                        {totalViolations === 0 && (
                          <div className="bg-[#e6f4ea] p-6 rounded-2xl border border-[#137333]/10 shadow-sm flex items-center gap-4 transition-all duration-200 hover:shadow-md">
                            <div className="text-3xl">🎉</div>
                            <div>
                              <h4 className="text-sm font-bold text-[#137333]">웹 접근성 기준 완벽 적합!</h4>
                              <p className="text-[11px] text-[#137333]/80 mt-0.5 leading-relaxed">
                                현재 점검 완료된 모든 페이지의 항목이 기준을 준수하고 있습니다. 발견된 웹 접근성 위반 사항이 전혀 없습니다.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* 메뉴 Depth별 상세 조치 현황 카드 */}
                        <div className="bg-white p-6 rounded-2xl border border-[#e5e8eb] shadow-sm space-y-4 transition-all duration-200 hover:shadow-md">
                          <div>
                            <h3 className="text-sm font-bold text-[#191f28]">메뉴 Depth별 세부 조치 현황</h3>
                            <p className="text-[11px] text-[#8b95a1] mt-0.5">각 메뉴 경로(대분류 &gt; 중분류 &gt; 소분류) 뎁스별로 조치된 내용과 잔여 오류 파악</p>
                          </div>

                          <div className="space-y-3">
                            {sortedGroups.map((g, idx) => {
                              const isExpanded = !!expandedA11yGroups[g.name];
                              return (
                                <div key={idx} className="border border-[#e5e8eb] rounded-xl overflow-hidden bg-[#f9fafb]">
                                  {/* 그룹 헤더 */}
                                  <div 
                                    onClick={() => {
                                      setExpandedA11yGroups(prev => ({
                                        ...prev,
                                        [g.name]: !prev[g.name]
                                      }));
                                    }}
                                    className="p-4 bg-white hover:bg-[#f9fafb] cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 select-none transition-colors border-b border-[#e5e8eb]/60"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-[#8b95a1] font-bold">depth</span>
                                      <h4 className="text-xs font-bold text-[#1a3a5c] tracking-tight">{g.name}</h4>
                                      <span className="px-1.5 py-0.5 bg-[#f2f4f6] text-[#4e5968] rounded-full text-[10px] font-extrabold shrink-0">
                                        총 {g.total}건
                                      </span>
                                    </div>

                                    {/* 상태 카운트 요약 배지들 */}
                                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                                      {g.counts['조치필요'] > 0 && (
                                        <span className="px-1.5 py-0.5 bg-[#fdf3f4] text-[#c5221f] rounded">
                                          조치필요 {g.counts['조치필요']}
                                        </span>
                                      )}
                                      {g.counts['수정중'] > 0 && (
                                        <span className="px-1.5 py-0.5 bg-[#e8f0fe] text-[#1a73e8] rounded">
                                          수정중 {g.counts['수정중']}
                                        </span>
                                      )}
                                      {g.counts['수정완료'] > 0 && (
                                        <span className="px-1.5 py-0.5 bg-[#fff9eb] text-[#b06000] rounded">
                                          수정완료 {g.counts['수정완료']}
                                        </span>
                                      )}
                                      {g.counts['조치완료'] > 0 && (
                                        <span className="px-1.5 py-0.5 bg-[#f3e8ff] text-[#7e22ce] rounded">
                                          조치완료 {g.counts['조치완료']}
                                        </span>
                                      )}
                                      {g.counts['검수완료'] > 0 && (
                                        <span className="px-1.5 py-0.5 bg-[#e6f4ea] text-[#137333] rounded">
                                          검수완료 {g.counts['검수완료']}
                                        </span>
                                      )}

                                      {/* 진척률 바 */}
                                      <div className="flex items-center gap-2 ml-2">
                                        <div className="w-16 bg-[#f2f4f6] h-2 rounded-full overflow-hidden shrink-0">
                                          <div 
                                            className="h-full bg-gradient-to-r from-[#3182f6] to-[#137333] rounded-full transition-all duration-300"
                                            style={{ width: `${g.progress}%` }}
                                          />
                                        </div>
                                        <span className="text-[10px] font-bold text-[#191f28] shrink-0 w-8 text-right">{g.progress}%</span>
                                      </div>

                                      <div className="text-[#8b95a1] ml-1">
                                        {isExpanded ? '▲' : '▼'}
                                      </div>
                                    </div>
                                  </div>

                                  {/* 펼쳐졌을 때의 세부 항목 목록 */}
                                  {isExpanded && (
                                    <div className="p-3 bg-white border-t border-[#e5e8eb]/40 divide-y divide-[#e5e8eb]/40 max-h-[350px] overflow-auto">
                                      {g.items.map((item, subIdx) => {
                                        const status = getA11yItemStatus(item);
                                        let errorMsg = '';
                                        let checkStatus = '';
                                        if (item.memo) {
                                          try {
                                            const parsed = JSON.parse(item.memo);
                                            errorMsg = parsed.error_msg || '';
                                            checkStatus = parsed.check_status || '';
                                          } catch {
                                            errorMsg = item.memo;
                                          }
                                        }

                                        return (
                                          <div key={subIdx} className="py-2.5 flex items-start justify-between gap-4 text-xs">
                                            <div className="space-y-1 min-w-0 flex-1">
                                              <div className="flex items-start gap-1.5 flex-wrap">
                                                <span className="font-extrabold text-[#8b95a1] w-4 text-right shrink-0">
                                                  {item.sort_order || subIdx + 1}
                                                </span>
                                                <span className={`font-bold text-[#191f28] ${item.checked ? 'line-through text-[#8b95a1]' : ''}`}>
                                                  {item.text}
                                                </span>
                                                {item.assignee && (
                                                  <span className="px-1.5 py-0.5 bg-[#f2f4f6] text-[#4e5968] rounded text-[10px] shrink-0 font-medium">
                                                    {item.assignee}
                                                  </span>
                                                )}
                                              </div>
                                              {errorMsg && (
                                                <p className="text-[11px] text-[#ef4444] pl-5 leading-relaxed font-semibold">
                                                  오류: {errorMsg}
                                                </p>
                                              )}
                                              {checkStatus && (
                                                <p className="text-[10px] text-[#4e5968] pl-5">
                                                  진단: {checkStatus}
                                                </p>
                                              )}
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                              {/* 증빙 이미지 보기 버튼 */}
                                              {item.image_url && (
                                                <button
                                                  onClick={() => handleViewImage(item.image_url!)}
                                                  className="px-2 py-0.5 text-[9px] bg-[#eff6ff] text-[#3182f6] hover:bg-[#3182f6] hover:text-white rounded border border-[#3182f6]/20 transition-all font-semibold cursor-pointer"
                                                >
                                                  증빙 ↗
                                                </button>
                                              )}
                                              <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                                status === '검수완료' ? 'bg-[#e6f4ea] text-[#137333] border border-[#137333]/10' :
                                                status === '조치완료' ? 'bg-[#f3e8ff] text-[#7e22ce] border border-[#eeddff]' :
                                                status === '수정완료' ? 'bg-[#fff9eb] text-[#b06000] border border-[#fef7e0]' :
                                                status === '수정중' ? 'bg-[#e8f0fe] text-[#1a73e8] border border-[#e8f0fe]' :
                                                'bg-[#fdf3f4] text-[#c5221f] border border-[#fce8e6]'
                                              }`}>
                                                {status}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // 2. 구글 시트 연동 뷰
                  if (a11yViewMode === 'sheet') {
                    const sheetUrl = project.a11y_sheet_url || '';
                    return (
                      <div className="text-center p-16 rounded-2xl max-w-2xl mx-auto"
                        style={{ backgroundColor: '#ffffff', border: '1px solid #e5e8eb', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                        <div className="text-[#3182f6] mb-4 flex justify-center"><ExternalLink className="w-12 h-12" /></div>
                        <h4 className="font-bold text-[#191f28] mb-2 text-base">구글 스프레드시트 접근성 점검표가 연동되어 있습니다</h4>
                        <p className="text-xs text-[#8b95a1] mb-6 max-w-md mx-auto leading-relaxed">
                          접근성 점검 관리는 연동된 구글 시트에서 실시간으로 이루어집니다.<br />아래 버튼을 클릭하여 새 창에서 시트를 열고 편집해 주세요.
                        </p>
                        <div className="flex items-center justify-center gap-3">
                          <a 
                            href={sheetUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                            구글 접근성 시트 열기 ↗
                          </a>
                          <button 
                            onClick={() => { setA11ySheetUrlInput(project.a11y_sheet_url || ''); setEditingA11ySheetUrl(true); }} 
                            className="px-4 py-2.5 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                          >
                            연동 주소 수정
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // 3. 내부 점검 대장 뷰
                  if (a11yItems.length === 0) {
                    return (
                      <div className="text-center p-20 rounded-2xl text-sm"
                        style={{ backgroundColor: '#ffffff', color: '#8b95a1' }}>
                        접근성 점검 항목을 불러오는 중입니다...
                      </div>
                    );
                  }

                  const getA11yItemStatus = (item: any): string => {
                    const tagStr = (item.tag || '').trim();
                    if (tagStr.includes('검수완료') || tagStr.includes('검수 완료') || item.checked) {
                      return '검수완료';
                    } else if (tagStr.includes('조치완료') || tagStr.includes('조치 완료')) {
                      return '조치완료';
                    } else if (tagStr.includes('수정완료') || tagStr.includes('수정 완료')) {
                      return '수정완료';
                    } else if (tagStr.includes('수정중') || tagStr.includes('수정 중') || tagStr.includes('진행')) {
                      return '수정중';
                    } else {
                      return '조치필요';
                    }
                  };

                  const statusOrder: Record<string, number> = {
                    '조치필요': 1,
                    '수정중': 2,
                    '수정완료': 3,
                    '조치완료': 4,
                    '검수완료': 5
                  };

                  const sortedA11yItems = [...a11yItems].sort((a, b) => {
                    const statusA = getA11yItemStatus(a);
                    const statusB = getA11yItemStatus(b);
                    const orderA = statusOrder[statusA] || 99;
                    const orderB = statusOrder[statusB] || 99;
                    
                    if (orderA !== orderB) {
                      return orderA - orderB;
                    }
                    return (a.sort_order || 0) - (b.sort_order || 0);
                  });

                  const statusCounts = {
                    all: a11yItems.length,
                    '조치필요': 0,
                    '수정중': 0,
                    '수정완료': 0,
                    '조치완료': 0,
                    '검수완료': 0
                  };

                  a11yItems.forEach(item => {
                    const status = getA11yItemStatus(item);
                    if (status in statusCounts) {
                      statusCounts[status as keyof typeof statusCounts]++;
                    }
                  });

                  const filteredA11yItems = sortedA11yItems.filter(item => {
                    if (a11yStatusFilter === 'all') return true;
                    return getA11yItemStatus(item) === a11yStatusFilter;
                  });

                  return (
                    <div className="space-y-4">
                      {/* 상태 필터 바 */}
                      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-[#e5e8eb]">
                        {[
                          { key: 'all', label: '전체', count: statusCounts.all, activeBg: 'bg-[#1a3a5c]', activeText: 'text-white' },
                          { key: '조치필요', label: '조치필요', count: statusCounts['조치필요'], activeBg: 'bg-[#c5221f]', activeText: 'text-white' },
                          { key: '수정중', label: '수정중', count: statusCounts['수정중'], activeBg: 'bg-[#1a73e8]', activeText: 'text-white' },
                          { key: '수정완료', label: '수정완료', count: statusCounts['수정완료'], activeBg: 'bg-[#b06000]', activeText: 'text-white' },
                          { key: '조치완료', label: '조치완료', count: statusCounts['조치완료'], activeBg: 'bg-[#7e22ce]', activeText: 'text-white' },
                          { key: '검수완료', label: '검수완료', count: statusCounts['검수완료'], activeBg: 'bg-[#137333]', activeText: 'text-white' }
                        ].map(tab => {
                          const isActive = a11yStatusFilter === tab.key;
                          return (
                            <button
                              key={tab.key}
                              onClick={() => setA11yStatusFilter(tab.key)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                                isActive 
                                  ? `${tab.activeBg} ${tab.activeText} shadow-sm` 
                                  : 'bg-[#f2f4f6] text-[#4e5968] hover:bg-[#e5e8eb]'
                              }`}
                            >
                              <span>{tab.label}</span>
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${isActive ? 'bg-white/20 text-white' : 'bg-[#e5e8eb] text-[#4e5968]'}`}>
                                {tab.count}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #dde1e7' }}>
                        <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                          <table className="w-full text-left border-collapse" style={{ fontSize: '12px', minWidth: '1050px', tableLayout: 'fixed' }}>
                            <colgroup>
                              <col style={{ width: '55px' }} />
                              <col style={{ width: '150px' }} />
                              <col style={{ width: '180px' }} />
                              <col style={{ width: '220px' }} />
                              <col style={{ width: '80px' }} />
                              <col style={{ width: '90px' }} />
                              <col style={{ width: '90px' }} />
                              <col style={{ width: '75px' }} />
                              <col style={{ width: '180px' }} />
                            </colgroup>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                              <tr style={{ backgroundColor: '#1a3a5c', color: '#ffffff', borderBottom: '2px solid #0f2b47' }}>
                                <th className="py-2.5 px-3 font-bold text-center" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>no</th>
                                <th className="py-2.5 px-3 font-bold" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>메뉴</th>
                                <th className="py-2.5 px-3 font-bold" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>지침명</th>
                                <th className="py-2.5 px-3 font-bold" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>오류사항</th>
                                <th className="py-2.5 px-3 font-bold text-center" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>담당자</th>
                                <th className="py-2.5 px-3 font-bold text-center" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>배포상태</th>
                                <th className="py-2.5 px-3 font-bold text-center" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>점검상태</th>
                                <th className="py-2.5 px-3 font-bold text-center" style={{ fontSize: '11px', borderRight: '1px solid #2d5a8e' }}>이미지</th>
                                <th className="py-2.5 px-3 font-bold text-center" style={{ fontSize: '11px' }}>비고</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e5e8eb]">
                              {filteredA11yItems.map((item, idx) => {
                                const rowBg = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
                                const cellBorder = '1px solid #e5e8eb';

                                // memo 파싱 로직
                                let errorMsg = '';
                                let checkStatus = '';
                                let comment = '';

                                if (item.memo) {
                                  try {
                                    const parsed = JSON.parse(item.memo);
                                    errorMsg = parsed.error_msg || '';
                                    checkStatus = parsed.check_status || '';
                                    comment = parsed.comment || '';
                                  } catch (e) {
                                    // JSON 형식이 아닌 경우 fallback
                                    errorMsg = item.memo;
                                    checkStatus = item.checked ? '적합' : '진행 필요';
                                    comment = '';
                                  }
                                } else {
                                  checkStatus = item.checked ? '적합' : '진행 필요';
                                }

                                return (
                                  <tr key={item.id} style={{ backgroundColor: rowBg, borderBottom: cellBorder }}>
                                    {/* 1. no */}
                                    <td className="py-2 px-3 text-center text-xs text-[#374151]" style={{ borderRight: cellBorder }}>
                                      {item.sort_order || idx + 1}
                                    </td>

                                    {/* 2. 메뉴 */}
                                    <td className="py-2 px-3 text-xs font-bold text-[#1a3a5c] relative group" style={{ borderRight: cellBorder, wordBreak: 'break-all' }}>
                                      <div className="truncate max-w-[140px]">
                                        {item.group_name}
                                      </div>
                                      {item.group_name && (
                                        <div className="absolute left-4 bottom-full mb-1 hidden group-hover:block z-30 bg-[#191f28] text-white text-[11px] rounded-lg px-2.5 py-1.5 max-w-sm shadow-lg pointer-events-none leading-relaxed border border-[#333d4b] whitespace-normal word-break-all">
                                          {item.group_name}
                                        </div>
                                      )}
                                    </td>

                                    {/* 3. 지침명 */}
                                    <td className="py-2 px-3 text-xs text-[#374151] relative group" style={{ borderRight: cellBorder, wordBreak: 'break-all' }}>
                                      <div className="truncate max-w-[170px]">
                                        <span className={`${item.checked ? 'line-through text-[#8b95a1]' : ''}`}>
                                          {item.text}
                                        </span>
                                      </div>
                                      {item.text && (
                                        <div className="absolute left-4 bottom-full mb-1 hidden group-hover:block z-30 bg-[#191f28] text-white text-[11px] rounded-lg px-2.5 py-1.5 max-w-sm shadow-lg pointer-events-none leading-relaxed border border-[#333d4b] whitespace-normal word-break-all">
                                          {item.text}
                                        </div>
                                      )}
                                    </td>

                                    {/* 4. 오류사항 */}
                                    <td className="py-2 px-3 text-xs text-[#374151] relative group" style={{ borderRight: cellBorder, wordBreak: 'break-all' }}>
                                      <div className="truncate max-w-[210px]">
                                        {errorMsg || '—'}
                                      </div>
                                      {errorMsg && (
                                        <div className="absolute left-4 bottom-full mb-1 hidden group-hover:block z-30 bg-[#191f28] text-white text-[11px] rounded-lg px-2.5 py-1.5 max-w-sm shadow-lg pointer-events-none leading-relaxed border border-[#333d4b] whitespace-normal word-break-all">
                                          {errorMsg}
                                        </div>
                                      )}
                                    </td>

                                    {/* 5. 담당자 */}
                                    <td className="py-2 px-3 text-center text-xs text-[#374151]" style={{ borderRight: cellBorder }}>
                                      {item.assignee || '—'}
                                    </td>

                                    {/* 6. 배포상태 */}
                                    <td className="py-2 px-3 text-center text-xs" style={{ borderRight: cellBorder }}>
                                      {item.tag ? (
                                        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                          item.tag.includes('검수완료') || item.tag.includes('검수 완료') || item.checked ? 'bg-[#e6f4ea] text-[#137333] border border-[#137333]/10' :
                                          item.tag.includes('조치완료') || item.tag.includes('조치 완료') ? 'bg-[#f3e8ff] text-[#7e22ce] border border-[#eeddff]' :
                                          item.tag.includes('수정완료') || item.tag.includes('수정 완료') ? 'bg-[#fff9eb] text-[#b06000] border border-[#fef7e0]' :
                                          item.tag.includes('수정중') || item.tag.includes('진행') || item.tag.includes('중') ? 'bg-[#e8f0fe] text-[#1a73e8] border border-[#e8f0fe]' :
                                          'bg-[#fce8e6] text-[#c5221f] border border-[#fce8e6]'
                                        }`}>
                                          {item.tag}
                                        </span>
                                      ) : '—'}
                                    </td>

                                    {/* 7. 점검상태 */}
                                    <td className="py-2 px-3 text-center text-xs" style={{ borderRight: cellBorder }}>
                                      {checkStatus ? (
                                        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                          checkStatus.includes('적합') || checkStatus.includes('검수완료') || checkStatus.includes('완료') || checkStatus.includes('통과') || checkStatus.includes('OK') ? 'bg-[#e6f4ea] text-[#137333] border border-[#137333]/10' :
                                          checkStatus.includes('조치필요') || checkStatus.includes('오류') || checkStatus.includes('부적합') || checkStatus.includes('미흡') || checkStatus.includes('NG') ? 'bg-[#fce8e6] text-[#c5221f] border border-[#c5221f]/10' :
                                          'bg-[#fef7e0] text-[#b06000] border border-[#b06000]/10'
                                        }`}>
                                          {checkStatus}
                                        </span>
                                      ) : '—'}
                                    </td>

                                    {/* 8. 이미지 */}
                                    <td className="py-2 px-3 text-center" style={{ borderRight: cellBorder }}>
                                      {item.image_url ? (
                                        <button
                                          onClick={() => handleViewImage(item.image_url!)}
                                          className="px-2 py-1 text-[10px] bg-[#eff6ff] text-[#3182f6] hover:bg-[#3182f6] hover:text-white rounded border border-[#3182f6]/20 transition-all font-semibold cursor-pointer"
                                        >
                                          증빙 ↗
                                        </button>
                                      ) : (
                                        <span className="text-xs text-[#8b95a1]">—</span>
                                      )}
                                    </td>

                                    {/* 9. 비고 */}
                                    <td className="py-2 px-3 text-xs text-[#4e5968] relative group">
                                      <div className="truncate max-w-[170px]">
                                        {comment || '—'}
                                      </div>
                                      {comment && (
                                        <div className="absolute right-4 bottom-full mb-1 hidden group-hover:block z-30 bg-[#191f28] text-white text-[11px] rounded-lg px-2.5 py-1.5 max-w-sm shadow-lg pointer-events-none leading-relaxed border border-[#333d4b] whitespace-normal word-break-all">
                                          {comment}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </section>
          )}

          {/* ========================================================
              MENU 1-4: WEEKLY PROGRESS REPORT GENERATOR SUB-TAB
             ======================================================== */}
          {activeMenu === 'checklist_weekly' && (
            <section className="space-y-6 animate-fade-in max-w-3xl">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-text-main font-heading">주간보고서 자동 생성기</h2>
                  <p className="text-xs text-text-muted mt-0.5">체크리스트 상태에 근거하여 이메일 및 메신저 공유용 주간보고서 텍스트를 구성합니다.</p>
                </div>
                {activeProjectId && (
                  <button
                    onClick={handleCopyWeeklyReport}
                    className="px-4 py-2 bg-brand-accent hover:bg-brand-accent-hover text-white text-xs font-semibold rounded flex items-center gap-1.5 cursor-pointer shadow transition-all"
                  >
                    <ClipboardCopy className="w-4 h-4" /> 클립보드에 복사하기
                  </button>
                )}
              </div>

              {!activeProjectId ? (
                <div className="text-center p-20 bg-bg-secondary border border-dashed border-border-color rounded-lg text-text-muted">
                  프로젝트를 먼저 선택해 주세요.
                </div>
              ) : (
                <div className="bg-bg-secondary border border-border-color rounded-md p-6 relative">
                  <pre className="text-xs font-mono text-text-main leading-relaxed bg-bg-primary/50 border border-border-color p-5 rounded overflow-x-auto whitespace-pre-wrap selection:bg-brand-primary/30">
                    {generateWeeklyReportText()}
                  </pre>
                </div>
              )}
            </section>
          )}

          {/* ========================================================
              MENU 1-5: DEPLOY SLIDE GENERATOR GUIDE SUB-TAB
             ======================================================== */}
          {activeMenu === 'deploy_slide' && (
            <section className="space-y-6 animate-fade-in max-w-4xl">
              <div>
                <h2 className="text-xl font-bold text-text-main font-heading">배포 슬라이드 자동 생성</h2>
                <p className="text-xs text-text-muted mt-0.5">
                  연동된 스프레드시트를 열어 데이터를 입력하고 슬라이드 생성을 실행하면 이력에 자동 누적됩니다.
                </p>
              </div>

              {!activeProjectId ? (
                <div className="text-center p-20 bg-bg-secondary border border-dashed border-border-color rounded-lg text-text-muted">
                  프로젝트를 먼저 선택해 주세요.
                </div>
              ) : (
                (() => {
                  const currentProject = projects.find(p => p.id === activeProjectId);
                  const hasA11ySheetUrl = !!currentProject?.a11y_sheet_url;
                  const a11ySheetUrl = currentProject?.a11y_sheet_url || '';

                  return (
                    <div className="space-y-6">
                      {/* 상단 카드: 스프레드시트 연동 */}
                      <div className="max-w-2xl">
                        {/* 구글 시트 배포리스트 샘플 */}
                        <div className="bg-white p-6 rounded-2xl border border-[#e5e8eb] shadow-sm flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                          {hasA11ySheetUrl ? (
                            <>
                              <div>
                                <div className="text-[#107c41] mb-3"><FileSpreadsheet className="w-8 h-8" /></div>
                                <h4 className="font-bold text-[#191f28] mb-1.5 text-sm font-heading">배포 데이터 연동 스프레드시트</h4>
                                <p className="text-xs text-[#4e5968] leading-relaxed mb-4">
                                  웹접근성 점검리스트 탭에서 이미 연동을 완료한 구글 시트입니다. 해당 시트 내에 <strong>&quot;배포리스트&quot;</strong> 탭을 생성하고 규격에 맞춰 데이터를 입력하시면 배포 슬라이드를 바로 생성할 수 있습니다.
                                </p>
                              </div>
                              <a 
                                href={a11ySheetUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="w-full py-2.5 bg-[#107c41] hover:bg-[#0b592e] text-white text-xs font-semibold rounded-lg text-center transition-colors cursor-pointer block"
                              >
                                구글 시트 열기 ↗
                              </a>
                            </>
                          ) : (
                            <>
                              <div>
                                <div className="text-[#8b95a1] mb-3"><FileSpreadsheet className="w-8 h-8" /></div>
                                <h4 className="font-bold text-[#8b95a1] mb-1.5 text-sm font-heading">배포 데이터 연동 스프레드시트</h4>
                                <p className="text-xs text-[#8b95a1] leading-relaxed mb-4">
                                  구글 스프레드시트가 아직 연동되지 않았습니다. <strong>[웹접근성 점검리스트] ➡ [구글 시트 연동]</strong> 메뉴에서 표준 구글 시트를 먼저 연동해 주세요.
                                </p>
                              </div>
                              <button 
                                onClick={() => setActiveMenu('checklist_a11y')}
                                className="w-full py-2.5 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] text-xs font-semibold rounded-lg text-center transition-colors cursor-pointer block"
                              >
                                웹접근성 점검리스트 탭으로 이동 ➡
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 배포 슬라이드 생성 이력 섹션 */}
                      <div className="bg-white p-6 rounded-2xl border border-[#e5e8eb] shadow-sm space-y-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="text-sm font-bold text-[#191f28] flex items-center gap-1.5 font-heading">
                              <span>📊 배포 슬라이드 생성 이력</span>
                              {slidesLoading && <Loader2 className="w-3.5 h-3.5 text-brand-primary animate-spin" />}
                            </h3>
                            <p className="text-[11px] text-[#8b95a1] mt-0.5">구글 스프레드시트에서 생성 버튼을 실행하여 누적된 슬라이드 히스토리입니다.</p>
                          </div>
                        </div>

                        {deploySlides.length === 0 ? (
                          <div className="text-center py-10 border border-dashed border-[#e5e8eb] rounded-xl text-[#8b95a1] text-xs">
                            아직 자동 생성된 배포 슬라이드가 없습니다.<br />
                            연동된 구글 시트에서 슬라이드 생성을 실행해 보세요.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse border border-[#e5e8eb]">
                              <thead>
                                <tr className="bg-[#f2f4f6] text-[#4e5968] font-bold border-b border-[#e5e8eb]">
                                  <th className="p-2.5 border-r border-[#e5e8eb] w-12 text-center">No</th>
                                  <th className="p-2.5 border-r border-[#e5e8eb] w-36">생성 일시</th>
                                  <th className="p-2.5 border-r border-[#e5e8eb]">슬라이드 이름</th>
                                  <th className="p-2.5 border-r border-[#e5e8eb] text-center w-28">바로가기</th>
                                  <th className="p-2.5 text-center w-20">관리</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#e5e8eb] text-[#374151]">
                                {deploySlides.map((slide, idx) => (
                                  <tr key={slide.id} className="hover:bg-[#f9fafb] transition-colors">
                                    <td className="p-2.5 border-r border-[#e5e8eb] text-center font-mono text-[#8b95a1]">
                                      {deploySlides.length - idx}
                                    </td>
                                    <td className="p-2.5 border-r border-[#e5e8eb] text-[#6b7280]">
                                      {new Date(slide.created_at).toLocaleString('ko-KR', {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </td>
                                    <td className="p-2.5 border-r border-[#e5e8eb] font-semibold text-[#191f28]">
                                      {slide.slide_title}
                                    </td>
                                    <td className="p-2.5 border-r border-[#e5e8eb] text-center">
                                      <a
                                        href={slide.slide_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-1 px-3 py-1 bg-[#3182f6] hover:bg-[#1b64da] text-white text-[11px] font-semibold rounded transition-colors cursor-pointer"
                                      >
                                        슬라이드 열기 ↗
                                      </a>
                                    </td>
                                    <td className="p-2.5 text-center">
                                      <button
                                        onClick={() => handleDeleteSlide(slide.id, slide.slide_title)}
                                        disabled={deletingSlideId === slide.id}
                                        className="inline-flex items-center justify-center p-1.5 bg-[#f2f4f6] hover:bg-[#fee2e2] text-[#4e5968] hover:text-[#df2222] rounded transition-colors cursor-pointer"
                                        title="이력 삭제"
                                      >
                                        {deletingSlideId === slide.id ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                    </div>
                  );
                })()
              )}
            </section>
          )}

          {/* ========================================================
              MENU 2: GLOBAL PROJECTS DASHBOARD PAGE
             ======================================================== */}
          {activeMenu === 'dashboard' && (
            <section className="space-y-6 animate-fade-in">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-text-main font-heading">전체 프로젝트 통합 현황</h2>
                  <p className="text-xs text-text-muted mt-0.5">등록된 모든 체크리스트 프로젝트의 진척 및 위험 상태를 한눈에 모니터링합니다.</p>
                </div>
                <button
                  onClick={() => setIsProjectModalOpen(true)}
                  className="px-3.5 py-1.5 bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-semibold rounded flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  + 새 프로젝트 생성
                </button>
              </div>

              {globalStatsLoading ? (
                <div className="flex flex-col items-center justify-center p-20 gap-4 text-text-muted">
                  <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
                  <span className="text-xs">전체 진척 정보를 계산 중입니다...</span>
                </div>
              ) : globalStats.length === 0 ? (
                <div className="text-center p-20 bg-bg-secondary border border-dashed border-border-color rounded-lg space-y-4">
                  <AlertCircle className="w-10 h-10 text-text-muted mx-auto" />
                  <div className="text-sm font-semibold">등록된 프로젝트가 없습니다.</div>
                  <button
                    onClick={() => setIsProjectModalOpen(true)}
                    className="px-4 py-2 bg-brand-primary text-white text-xs font-medium rounded cursor-pointer mx-auto"
                  >
                    첫 프로젝트 만들기
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {globalStats.map(stat => (
                    <div 
                      key={stat.id} 
                      className="bg-bg-secondary border border-border-color rounded-md p-6 flex flex-col justify-between gap-5 hover:border-brand-primary/25 hover:shadow-lg transition-all"
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start gap-4">
                          <h3 className="text-base font-bold text-text-main leading-tight truncate">{stat.name}</h3>
                          <span className="text-xs font-bold text-brand-primary bg-bg-primary-soft px-2 py-0.5 rounded shrink-0">
                            {stat.progress}% 완료
                          </span>
                        </div>
                        <div className="text-[10px] text-text-muted">
                          생성일: {new Date(stat.created_at).toLocaleDateString('ko-KR')}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-brand-primary to-brand-accent rounded-full transition-all duration-300"
                            style={{ width: `${stat.progress}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] text-text-muted font-medium">
                          <span>할 일 진척도</span>
                          <span>{stat.completed} / {stat.total} 완료</span>
                        </div>
                      </div>

                      {/* Info Badges Grid */}
                      <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border-color/60 text-center">
                        <div className="bg-bg-primary/45 rounded p-2.5">
                          <div className="text-[10px] text-text-muted font-semibold">위험 리스크</div>
                          <div className={`text-sm font-bold mt-0.5 ${stat.risks > 0 ? 'text-brand-danger' : 'text-text-muted'}`}>
                            {stat.risks > 0 ? `⚠️ ${stat.risks}` : '0'}
                          </div>
                        </div>
                        <div className="bg-bg-primary/45 rounded p-2.5">
                          <div className="text-[10px] text-text-muted font-semibold">수집 산출물</div>
                          <div className="text-sm font-bold text-brand-info mt-0.5">
                            📄 {stat.docs}
                          </div>
                        </div>
                        <div className="bg-bg-primary/45 rounded p-2.5">
                          <div className="text-[10px] text-text-muted font-semibold">외부 솔루션</div>
                          <div className={`text-sm font-bold mt-0.5 ${stat.ext > 0 ? 'text-brand-warning' : 'text-text-muted'}`}>
                            {stat.ext > 0 ? `🔗 ${stat.ext}` : '0'}
                          </div>
                        </div>
                      </div>

                      {/* Nav Button */}
                      <button
                        onClick={() => {
                          setActiveProjectId(stat.id);
                          setItems([]); // Force reload on navigation
                          setActiveMenu('checklist_pm');
                        }}
                        className="w-full py-2 bg-bg-tertiary hover:bg-bg-primary-soft hover:text-brand-primary text-xs font-semibold rounded border border-border-color hover:border-brand-primary/20 flex items-center justify-center gap-1 cursor-pointer transition-all mt-1"
                      >
                        체크리스트 상세 관리 <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ========================================================
              MENU 3: DELIVERABLE ARTIFACTS ARCHIVE PAGE
             ======================================================== */}
          {activeMenu === 'documents' && (
            <section className="space-y-6 animate-fade-in">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h2 className="text-xl font-bold text-text-main font-heading">산출물 보관함 (Documents)</h2>
                  <p className="text-xs text-text-muted mt-0.5">
                    {activeProjectId 
                      ? `"${activeProjectName}" 프로젝트의 체크 완료된 산출물(doc) 목록입니다.`
                      : '선택된 프로젝트가 없습니다.'
                    }
                  </p>
                </div>
              </div>

              {!activeProjectId ? (
                <div className="text-center p-20 bg-bg-secondary border border-dashed border-border-color rounded-lg text-text-muted">
                  프로젝트를 먼저 선택해 주세요.
                </div>
              ) : documentItems.length === 0 ? (
                <div className="text-center p-20 bg-bg-secondary border border-dashed border-border-color rounded-lg space-y-3">
                  <Files className="w-10 h-10 text-text-muted mx-auto" />
                  <div className="text-sm font-semibold text-text-muted">현재 완료 처리된 공식 산출물이 없습니다.</div>
                  <p className="text-xs text-text-muted max-w-sm mx-auto">
                    체크리스트 페이지에서 <strong>&apos;📄 산출물&apos;</strong> 태그가 부착된 항목을 완료(체크)하고, 증빙용 심사 캡처 스크린샷 이미지를 등록해 주세요.
                  </p>
                  <button
                    onClick={() => setActiveMenu('checklist_pm')}
                    className="px-4 py-2 bg-brand-primary text-white text-xs font-semibold rounded cursor-pointer mx-auto"
                  >
                    체크리스트 바로가기
                  </button>
                </div>
              ) : (
                <div className="bg-bg-secondary border border-border-color rounded-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-bg-tertiary border-b border-border-color text-text-muted text-xs font-semibold uppercase tracking-wider">
                          <th className="p-4">단계</th>
                          <th className="p-4">그룹명</th>
                          <th className="p-4">산출물 명칭 및 요구사항</th>
                          <th className="p-4">담당자</th>
                          <th className="p-4">마감일</th>
                          <th className="p-4">메모 (수정 리포트 링크 등)</th>
                          <th className="p-4 text-center">첨부 캡처</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-color/40">
                        {documentItems.map(item => (
                          <tr key={item.id} className="hover:bg-bg-tertiary/20 transition-colors">
                            <td className="p-4 text-xs font-semibold text-brand-primary uppercase">
                              {item.phase === 'pre' && '착수 전'}
                              {item.phase === 'in_progress' && '진행 중'}
                              {item.phase === 'review' && '심사 단계'}
                              {item.phase === 'done' && '완료 후'}
                            </td>
                            <td className="p-4 text-xs font-medium text-text-muted">{item.group_name}</td>
                            <td className="p-4 font-medium max-w-[280px]">
                              <div className="text-text-main text-sm">{item.text}</div>
                            </td>
                            <td className="p-4 text-xs">
                              {item.assignee ? (
                                <span className="px-2 py-0.5 rounded bg-bg-primary-soft text-brand-primary border border-brand-primary/10">
                                  {item.assignee}
                                </span>
                              ) : (
                                <span className="text-text-muted">-</span>
                              )}
                            </td>
                            <td className="p-4 text-xs font-medium text-text-muted">{item.due_date || '-'}</td>
                            <td className="p-4 text-xs text-text-muted max-w-[200px] truncate" title={item.memo || ''}>
                              {item.memo || <span className="text-text-muted/40 font-normal">비어있음</span>}
                            </td>
                            <td className="p-4 text-center">
                              {item.image_url ? (
                                <button
                                  onClick={() => handleViewImage(item.image_url!)}
                                  className="px-2.5 py-1 text-[10px] font-semibold bg-bg-accent-soft hover:bg-brand-accent/25 text-brand-accent border border-brand-accent/15 rounded cursor-pointer transition-colors"
                                >
                                  보기 (Zoom)
                                </button>
                              ) : (
                                <span className="text-xs text-text-muted/40">미첨부</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ========================================================
              MENU 4: SYSTEM SETTINGS PAGE
             ======================================================== */}
          {activeMenu === 'settings' && (
            <section className="space-y-6 animate-fade-in max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-text-main font-heading">시스템 설정</h2>
                <p className="text-xs text-text-muted mt-0.5">PM 툴 계정 정보 및 데이터 통계를 관리하고 설정을 조율합니다.</p>
              </div>

              {/* Account Card */}
              <div className="bg-bg-secondary border border-border-color rounded-md p-5 space-y-4">
                <h3 className="text-sm font-bold border-l-2 border-brand-primary pl-2.5">사용자 계정 정보</h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-text-muted">로그인 이메일</div>
                    <div className="font-semibold text-text-main mt-1">{session.user.email}</div>
                  </div>
                  <div>
                    <div className="text-text-muted">보안 인증 기관</div>
                    <div className="font-semibold text-brand-accent mt-1 flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5" /> 이트라이브 사내망
                    </div>
                  </div>
                </div>
              </div>

              {/* Data Statistics Card */}
              <div className="bg-bg-secondary border border-border-color rounded-md p-5 space-y-4">
                <h3 className="text-sm font-bold border-l-2 border-brand-primary pl-2.5">데이터베이스 현황 통계</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-bg-primary rounded p-4 border border-border-color/40">
                    <div className="text-[10px] font-semibold text-text-muted uppercase">총 프로젝트</div>
                    <div className="text-xl font-extrabold text-brand-primary mt-1">{projects.length}개</div>
                  </div>
                  <div className="bg-bg-primary rounded p-4 border border-border-color/40">
                    <div className="text-[10px] font-semibold text-text-muted uppercase">현재 할 일 항목</div>
                    <div className="text-xl font-extrabold text-brand-accent mt-1">
                      {globalStats.reduce((sum, item) => sum + item.total, 0)}개
                    </div>
                  </div>
                  <div className="bg-bg-primary rounded p-4 border border-border-color/40">
                    <div className="text-[10px] font-semibold text-text-muted uppercase">완료율 평균</div>
                    <div className="text-xl font-extrabold text-brand-info mt-1">
                      {projects.length > 0 
                        ? `${Math.round(globalStats.reduce((sum, item) => sum + item.progress, 0) / projects.length)}%`
                        : '0%'
                      }
                    </div>
                  </div>
                </div>
              </div>

              {/* Features Toggle Panel */}
              <div className="bg-bg-secondary border border-border-color rounded-md p-5 space-y-4">
                <h3 className="text-sm font-bold border-l-2 border-brand-primary pl-2.5">도구 기본 환경 설정</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-xs">
                    <div>
                      <div className="font-semibold text-text-main">실시간 데이터 동기화 (PostgreSQL Realtime)</div>
                      <div className="text-text-muted mt-0.5">웹소켓 채널을 통해 다중 기기에서의 편집 데이터를 즉시 동기화합니다.</div>
                    </div>
                    <span className="px-2 py-1 bg-bg-accent-soft text-brand-accent border border-brand-accent/20 rounded font-bold">
                      활성화됨
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs border-t border-border-color/40 pt-4">
                    <div>
                      <div className="font-semibold text-text-main">파일 자동 정리 크론봇</div>
                      <div className="text-text-muted mt-0.5">첨부 이미지를 변경하거나 삭제할 시 스토리지에서 잔여 고립 파일을 자동 폐기합니다.</div>
                    </div>
                    <span className="px-2 py-1 bg-bg-accent-soft text-brand-accent border border-brand-accent/20 rounded font-bold">
                      동작 중
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}

        </main>
      </div>

      {/* ========================================================
          MODALS & TOAST LAYERS
         ======================================================== */}
      
      {isProjectModalOpen && (
        <ProjectModal
          isOpen={isProjectModalOpen}
          onClose={() => setIsProjectModalOpen(false)}
          onSubmit={handleCreateProject}
        />
      )}

      {isItemModalOpen && (
        <ItemModal
          isOpen={isItemModalOpen}
          onClose={() => setIsItemModalOpen(false)}
          onSubmit={handleSaveItemModal}
          item={editingItem}
          defaultGroup={defaultGroup}
        />
      )}

      <ImageViewerModal
        isOpen={isViewerOpen}
        imageUrl={viewerImageUrl}
        onClose={() => setIsViewerOpen(false)}
      />

      {/* Real-time Notification Toast Box */}
      <div className="fixed bottom-5 right-5 space-y-2.5 z-55 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="flex items-center gap-2 p-4 bg-bg-secondary border border-border-color text-text-main text-xs font-medium rounded-lg shadow-lg pointer-events-auto animate-fade-in-down"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
            {toast.message}
          </div>
        ))}
      </div>

    </div>
  );
}
