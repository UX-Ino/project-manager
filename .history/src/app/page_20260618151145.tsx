'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase, STORAGE_BUCKET } from '../lib/supabaseClient';
import { 
  LogOut, User, FolderPlus, Trash2, CheckSquare, Loader2, 
  AlertCircle, LayoutDashboard, Files, Settings, 
  Menu, ChevronRight, ShieldAlert, ClipboardCopy,
  ClipboardList, ImagePlus, Trash
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
}

interface ChecklistItem {
  id: string;
  project_id: string;
  phase: string;
  group_name: string;
  text: string;
  tag: 'risk' | 'doc' | 'ext' | null;
  checked: boolean;
  image_url: string | null;
  memo: string | null;
  due_date: string | null;
  assignee: string | null;
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
  const [activeMenu, setActiveMenu] = useState<'dashboard' | 'checklist_pm' | 'checklist_wbs' | 'checklist_a11y' | 'checklist_weekly' | 'documents' | 'settings'>('checklist_pm');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // WBS State
  const [wbsRows, setWbsRows] = useState<WBSRow[]>([]);
  const [wbsLoading, setWbsLoading] = useState(false);
  const [wbsSavingId, setWbsSavingId] = useState<string | null>(null);
  const [wbsViewMode, setWbsViewMode] = useState<'table' | 'sheet'>('table');
  const [editingSheetUrl, setEditingSheetUrl] = useState(false);
  const [sheetUrlInput, setSheetUrlInput] = useState('');

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

  // Fetch checklist when active project changes
  useEffect(() => {
    if (activeProjectId) {
      fetchChecklist(activeProjectId);
    } else {
      setItems([]);
    }
  }, [activeProjectId, fetchChecklist]);

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

  // WBS: Load when switching to WBS menu
  useEffect(() => {
    if (activeMenu === 'checklist_wbs' && activeProjectId) {
      fetchWbs(activeProjectId);
    }
  }, [activeMenu, activeProjectId, fetchWbs]);

  // 4. Realtime Subscription Setup
  useEffect(() => {
    if (!activeProjectId) return;

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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeProjectId, fetchChecklist, fetchGlobalStats, showToast, items]);

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
              style={activeMenu.startsWith('checklist_')
                ? { backgroundColor: '#eff6ff', color: '#3182f6', fontWeight: 600 }
                : { color: '#4e5968' }
              }
              onMouseEnter={(e) => {
                if (!activeMenu.startsWith('checklist_')) e.currentTarget.style.backgroundColor = '#f9fafb';
              }}
              onMouseLeave={(e) => {
                if (!activeMenu.startsWith('checklist_')) e.currentTarget.style.backgroundColor = 'transparent';
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
                {activeMenu === 'dashboard' && '통합 현황판'}
                {activeMenu === 'documents' && '산출물 보관함'}
                {activeMenu === 'settings' && '시스템 설정'}
              </span>
            </div>
          </div>

          {/* Project Picker */}
          {(activeMenu.startsWith('checklist_') || activeMenu === 'documents') && projects.length > 0 && (
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

              {wbsViewMode === 'sheet' ? (
                (() => {
                  const project = projects.find(p => p.id === activeProjectId);
                  const hasUrl = !!project?.wbs_sheet_url;

                  if (!hasUrl || editingSheetUrl) {
                    return (
                      <div className="text-center p-20 rounded-2xl" style={{ backgroundColor: '#f9fafb', border: '1.5px dashed #e5e8eb' }}>
                        <div className="text-text-muted mb-4 flex justify-center"><ClipboardCopy className="w-10 h-10" /></div>
                        <h4 className="font-bold text-[#191f28] mb-2">해당 프로젝트용 구글 시트 주소 등록</h4>
                        <p className="text-xs text-[#8b95a1] mb-6">
                          구글 드라이브에서 템플릿을 복사한 후, 생성된 시트의 브라우저 주소(URL)를 복사하여 아래에 입력해 주세요.
                        </p>
                        <div className="flex items-center justify-center gap-2 max-w-lg mx-auto">
                          <input
                            type="url"
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            value={sheetUrlInput}
                            onChange={(e) => setSheetUrlInput(e.target.value)}
                            className="flex-1 bg-white border border-[#e5e8eb] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#3182f6]"
                            style={{ color: '#191f28' }}
                          />
                          <button onClick={() => handleSaveSheetUrl(activeProjectId, sheetUrlInput)} className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors">
                            저장
                          </button>
                          {hasUrl && (
                            <button onClick={() => setEditingSheetUrl(false)} className="px-4 py-2 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] text-xs font-semibold rounded-lg cursor-pointer transition-colors">
                              취소
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  let iframeUrl = project.wbs_sheet_url || '';
                  if (iframeUrl.includes('edit') && !iframeUrl.includes('rm=minimal')) {
                    iframeUrl = iframeUrl + (iframeUrl.includes('?') ? '&' : '?') + 'rm=minimal';
                  }

                  return (
                    <div className="rounded-2xl overflow-hidden relative group" style={{ backgroundColor: '#ffffff', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #e5e8eb', height: 'calc(100vh - 200px)' }}>
                      <iframe src={iframeUrl} className="w-full h-full border-none absolute inset-0" title="Google Sheets WBS" />
                      <button onClick={() => { setSheetUrlInput(project.wbs_sheet_url || ''); setEditingSheetUrl(true); }} className="absolute top-4 right-4 px-3 py-1.5 bg-black/60 hover:bg-black/80 text-white text-xs font-semibold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm cursor-pointer z-10">
                        주소 수정
                      </button>
                    </div>
                  );
                })()
              ) : !activeProjectId ? (
                <div className="text-center p-20 rounded-2xl text-sm"
                  style={{ backgroundColor: '#ffffff', border: '1.5px dashed #e5e8eb', color: '#8b95a1' }}>
                  프로젝트를 먼저 선택해 주세요.
                </div>
              ) : wbsLoading ? (
                <div className="text-center p-20 rounded-2xl text-sm"
                  style={{ backgroundColor: '#ffffff', color: '#8b95a1' }}>
                  WBS 데이터 로딩 중...
                </div>
              ) : wbsRows.length === 0 ? (
                <div className="text-center p-16 rounded-2xl"
                  style={{ backgroundColor: '#ffffff', border: '1.5px dashed #e5e8eb' }}>
                  <p className="text-sm font-semibold mb-2" style={{ color: '#4e5968' }}>WBS 데이터가 없습니다</p>
                  <p className="text-xs mb-4" style={{ color: '#8b95a1' }}>
                    현재 프로젝트에 등록된 WBS 일정이 없습니다. 기본 템플릿을 생성해 보세요.
                  </p>
                  <button
                    onClick={async () => {
                      await initializeWbs(activeProjectId, activeProjectName);
                      fetchWbs(activeProjectId);
                    }}
                    className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white text-xs font-semibold rounded cursor-pointer transition-colors"
                  >
                    + 기본 WBS 생성하기
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#ffffff', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #e5e8eb' }}>
                  <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                    <table className="w-full text-left border-collapse" style={{ fontSize: '12px', minWidth: '900px' }}>
                      {/* Sticky header */}
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e8eb' }}>
                          <th className="py-2.5 px-3 font-bold text-center" style={{ color: '#8b95a1', width: '40px', borderRight: '1px solid #e5e8eb' }}>No</th>
                          <th className="py-2.5 px-3 font-bold" style={{ color: '#4e5968', minWidth: '280px', borderRight: '1px solid #e5e8eb' }}>TASK</th>
                          <th className="py-2.5 px-3 font-bold" style={{ color: '#4e5968', width: '160px', borderRight: '1px solid #e5e8eb' }}>Description / Outputs</th>
                          <th className="py-2.5 px-3 font-bold text-center" style={{ color: '#4e5968', width: '70px', borderRight: '1px solid #e5e8eb' }}>R/R</th>
                          <th className="py-2.5 px-3 font-bold text-center" style={{ color: '#4e5968', width: '80px', borderRight: '1px solid #e5e8eb' }}>Status</th>
                          <th className="py-2.5 px-3 font-bold text-center" style={{ color: '#4e5968', width: '104px', borderRight: '1px solid #e5e8eb' }}>계획 시작</th>
                          <th className="py-2.5 px-3 font-bold text-center" style={{ color: '#4e5968', width: '104px', borderRight: '1px solid #e5e8eb' }}>계획 완료</th>
                          <th className="py-2.5 px-3 font-bold text-center" style={{ color: '#4e5968', width: '104px', borderRight: '1px solid #e5e8eb' }}>실제 시작</th>
                          <th className="py-2.5 px-3 font-bold text-center" style={{ color: '#4e5968', width: '104px', borderRight: '1px solid #e5e8eb' }}>실제 완료</th>
                          <th className="py-2.5 px-3 font-bold text-center" style={{ color: '#4e5968', width: '80px', borderRight: '1px solid #e5e8eb' }}>계획(%)</th>
                          <th className="py-2.5 px-3 font-bold text-center" style={{ color: '#4e5968', width: '80px' }}>실제(%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wbsRows.map((row, idx) => {
                          // Level-based styling
                          const isL1 = row.level === 1;
                          const isL2 = row.level === 2;
                          const taskText = row.task_l1 || row.task_l2 || row.task_l3 || row.task_l4 || '';
                          const indentPx = (row.level - 1) * 16;

                          // Row background by level
                          let rowBg = '#ffffff';
                          if (isL1) rowBg = '#eef2ff';
                          else if (isL2) rowBg = '#f8faff';

                          const statusColor: Record<string, { bg: string; text: string }> = {
                            '완료': { bg: '#e8f9f6', text: '#00b493' },
                            '진행중': { bg: '#eff6ff', text: '#3182f6' },
                            '미진행': { bg: '#f9fafb', text: '#8b95a1' },
                          };
                          const sc = statusColor[row.status] || statusColor['미진행'];

                          return (
                            <tr key={row.id}
                              style={{
                                backgroundColor: rowBg,
                                borderBottom: '1px solid #f2f4f6',
                              }}
                            >
                              {/* No */}
                              <td className="py-1.5 px-3 text-center font-medium" style={{ color: '#c0c8d2', borderRight: '1px solid #e5e8eb' }}>
                                {idx + 1}
                              </td>

                              {/* TASK name — indented */}
                              <td className="py-1.5" style={{ borderRight: '1px solid #e5e8eb', paddingLeft: `${12 + indentPx}px`, paddingRight: '12px' }}>
                                <span
                                  className={isL1 ? 'font-bold' : isL2 ? 'font-semibold' : 'font-normal'}
                                  style={{ color: isL1 ? '#1b64da' : isL2 ? '#191f28' : '#4e5968' }}
                                >
                                  {isL1 && <span className="mr-1.5 opacity-60">▪</span>}
                                  {taskText}
                                </span>
                              </td>

                              {/* Description */}
                              <td className="py-1.5 px-3 text-xs" style={{ color: '#8b95a1', borderRight: '1px solid #e5e8eb' }}>
                                <input
                                  type="text"
                                  defaultValue={row.description || ''}
                                  onBlur={e => updateWbsRow(row.id, 'description', e.target.value || null)}
                                  placeholder="—"
                                  className="w-full bg-transparent outline-none text-xs"
                                  style={{ color: '#4e5968' }}
                                />
                              </td>

                              {/* R/R (담당) */}
                              <td className="py-1.5 px-3 text-center" style={{ borderRight: '1px solid #e5e8eb' }}>
                                <input
                                  type="text"
                                  defaultValue={row.assignee || ''}
                                  onBlur={e => updateWbsRow(row.id, 'assignee', e.target.value || null)}
                                  placeholder="—"
                                  className="w-full text-center bg-transparent outline-none text-xs font-medium"
                                  style={{ color: '#4e5968' }}
                                />
                              </td>

                              {/* Status */}
                              <td className="py-1.5 px-2 text-center" style={{ borderRight: '1px solid #e5e8eb' }}>
                                <select
                                  value={row.status}
                                  onChange={e => updateWbsRow(row.id, 'status', e.target.value)}
                                  className="w-full text-center text-xs font-semibold rounded-lg py-0.5 cursor-pointer outline-none"
                                  style={{ backgroundColor: sc.bg, color: sc.text, border: 'none' }}
                                >
                                  <option value="미진행">미진행</option>
                                  <option value="진행중">진행중</option>
                                  <option value="완료">완료</option>
                                </select>
                              </td>

                              {/* 계획 시작 */}
                              <td className="py-1.5 px-2 text-center" style={{ borderRight: '1px solid #e5e8eb' }}>
                                <input
                                  type="date"
                                  defaultValue={row.plan_start || ''}
                                  onBlur={e => updateWbsRow(row.id, 'plan_start', e.target.value || null)}
                                  className="w-full text-center bg-transparent outline-none text-xs cursor-pointer"
                                  style={{ color: '#4e5968' }}
                                />
                              </td>

                              {/* 계획 완료 */}
                              <td className="py-1.5 px-2 text-center" style={{ borderRight: '1px solid #e5e8eb' }}>
                                <input
                                  type="date"
                                  defaultValue={row.plan_end || ''}
                                  onBlur={e => updateWbsRow(row.id, 'plan_end', e.target.value || null)}
                                  className="w-full text-center bg-transparent outline-none text-xs cursor-pointer"
                                  style={{ color: '#4e5968' }}
                                />
                              </td>

                              {/* 실제 시작 */}
                              <td className="py-1.5 px-2 text-center" style={{ borderRight: '1px solid #e5e8eb' }}>
                                <input
                                  type="date"
                                  defaultValue={row.actual_start || ''}
                                  onBlur={e => updateWbsRow(row.id, 'actual_start', e.target.value || null)}
                                  className="w-full text-center bg-transparent outline-none text-xs cursor-pointer"
                                  style={{ color: '#00b493' }}
                                />
                              </td>

                              {/* 실제 완료 */}
                              <td className="py-1.5 px-2 text-center" style={{ borderRight: '1px solid #e5e8eb' }}>
                                <input
                                  type="date"
                                  defaultValue={row.actual_end || ''}
                                  onBlur={e => updateWbsRow(row.id, 'actual_end', e.target.value || null)}
                                  className="w-full text-center bg-transparent outline-none text-xs cursor-pointer"
                                  style={{ color: '#00b493' }}
                                />
                              </td>

                              {/* 계획 진척율 */}
                              <td className="py-1.5 px-2 text-center" style={{ borderRight: '1px solid #e5e8eb' }}>
                                <div className="flex items-center gap-1">
                                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#e5e8eb' }}>
                                    <div className="h-full rounded-full" style={{ width: `${row.plan_progress}%`, backgroundColor: '#3182f6' }} />
                                  </div>
                                  <input
                                    type="number"
                                    min={0} max={100}
                                    defaultValue={row.plan_progress}
                                    onBlur={e => updateWbsRow(row.id, 'plan_progress', parseInt(e.target.value) || 0)}
                                    className="w-8 text-right bg-transparent outline-none text-xs font-semibold"
                                    style={{ color: '#3182f6' }}
                                  />
                                  <span className="text-xs" style={{ color: '#c0c8d2' }}>%</span>
                                </div>
                              </td>

                              {/* 실제 진척율 */}
                              <td className="py-1.5 px-2 text-center">
                                <div className="flex items-center gap-1">
                                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#e5e8eb' }}>
                                    <div className="h-full rounded-full" style={{ width: `${row.actual_progress}%`, backgroundColor: '#00b493' }} />
                                  </div>
                                  <input
                                    type="number"
                                    min={0} max={100}
                                    defaultValue={row.actual_progress}
                                    onBlur={e => updateWbsRow(row.id, 'actual_progress', parseInt(e.target.value) || 0)}
                                    className="w-8 text-right bg-transparent outline-none text-xs font-semibold"
                                    style={{ color: '#00b493' }}
                                  />
                                  <span className="text-xs" style={{ color: '#c0c8d2' }}>%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ========================================================
              MENU 1-3: ACCESSIBILITY SPREADSHEET AUDIT SUB-TAB
             ======================================================== */}
          {activeMenu === 'checklist_a11y' && (
            <section className="space-y-6 animate-fade-in">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-text-main font-heading">웹 접근성 점검리스트 (KWCAG 2.2)</h2>
                  <p className="text-xs text-text-muted mt-0.5">
                    한국형 웹 콘텐츠 접근성 지침 22개(또는 18개 핵심) 항목에 대한 실무 점검 대장입니다.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-text-muted font-semibold">점검률 현황</div>
                  <div className="text-lg font-bold text-brand-accent mt-0.5">{a11yPassed} / {a11yTotal} 적합 ({a11yProgress}%)</div>
                </div>
              </div>

              {!activeProjectId ? (
                <div className="text-center p-20 bg-bg-secondary border border-dashed border-border-color rounded-lg text-text-muted">
                  프로젝트를 먼저 선택해 주세요.
                </div>
              ) : a11yItems.length === 0 ? (
                <div className="text-center p-20 bg-bg-secondary border border-dashed border-border-color rounded-lg text-text-muted">
                  접근성 점검 항목을 불러오는 중입니다...
                </div>
              ) : (
                <div className="bg-bg-secondary border border-border-color rounded-md overflow-hidden shadow-md">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse min-w-[900px]">
                      <thead>
                        <tr className="bg-bg-tertiary border-b border-border-color text-text-muted text-xs font-semibold uppercase tracking-wider">
                          <th className="p-3 w-16 text-center">적합</th>
                          <th className="p-3 w-40">지침 원칙</th>
                          <th className="p-3 w-72">검증 기준 요약</th>
                          <th className="p-3 w-32">담당 실무자</th>
                          <th className="p-3 w-36">마감 예정일</th>
                          <th className="p-3">지적사항 및 개선조치 메모</th>
                          <th className="p-3 w-32 text-center">스크린샷 첨부</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-color/30">
                        {a11yItems.map(item => {
                          return (
                            <tr 
                              key={item.id} 
                              className={`hover:bg-bg-tertiary/15 transition-colors ${
                                item.checked ? 'bg-bg-accent-soft/5' : ''
                              }`}
                            >
                              {/* 1. Status Checkbox */}
                              <td className="p-3 text-center">
                                <label className="relative inline-flex items-center justify-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={item.checked}
                                    onChange={(e) => handleToggleCheck(item.id, e.target.checked)}
                                    className="sr-only"
                                  />
                                  <div
                                    className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-all ${
                                      item.checked
                                        ? 'bg-brand-accent border-brand-accent text-bg-primary shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                                        : 'border-text-muted hover:border-text-main'
                                    }`}
                                  >
                                    {item.checked && <CheckSquare className="w-3.5 h-3.5 text-white" />}
                                  </div>
                                </label>
                              </td>

                              {/* 2. Principle Title */}
                              <td className="p-3 text-xs font-bold text-text-muted uppercase">
                                {item.group_name}
                              </td>

                              {/* 3. Success Criterion Text */}
                              <td className="p-3 pr-4">
                                <div className={`text-xs leading-relaxed font-medium ${item.checked ? 'line-through text-text-muted' : 'text-text-main'}`}>
                                  {item.text}
                                </div>
                                {item.tag && (
                                  <span className={`inline-block text-[9px] px-1.5 py-0.2 rounded font-semibold mt-1 ${
                                    item.tag === 'risk' ? 'bg-bg-danger-soft text-brand-danger border border-brand-danger/10' :
                                    item.tag === 'doc' ? 'bg-bg-info-soft text-brand-info border border-brand-info/10' :
                                    'bg-bg-warning-soft text-brand-warning border border-brand-warning/10'
                                  }`}>
                                    {item.tag === 'risk' && '⚠️ 리스크'}
                                    {item.tag === 'doc' && '📄 산출물'}
                                    {item.tag === 'ext' && '🔗 외부솔루션'}
                                  </span>
                                )}
                              </td>

                              {/* 4. Assignee Inline Edit */}
                              <td className="p-3">
                                <input
                                  type="text"
                                  defaultValue={item.assignee || ''}
                                  disabled={savingFieldId === `${item.id}-assignee`}
                                  onBlur={(e) => {
                                    if (e.target.value !== (item.assignee || '')) {
                                      handleInlineFieldChange(item.id, 'assignee', e.target.value);
                                    }
                                  }}
                                  placeholder="실무 담당자"
                                  className="w-full bg-bg-tertiary border border-border-color rounded px-2 py-1 text-xs text-text-main outline-none focus:border-brand-primary disabled:opacity-50"
                                />
                              </td>

                              {/* 5. Due Date Inline Edit */}
                              <td className="p-3">
                                <input
                                  type="date"
                                  defaultValue={item.due_date || ''}
                                  disabled={savingFieldId === `${item.id}-due_date`}
                                  onChange={(e) => {
                                    if (e.target.value !== (item.due_date || '')) {
                                      handleInlineFieldChange(item.id, 'due_date', e.target.value);
                                    }
                                  }}
                                  className="w-full bg-bg-tertiary border border-border-color rounded px-2 py-1 text-xs text-text-main outline-none focus:border-brand-primary font-medium disabled:opacity-50"
                                />
                              </td>

                              {/* 6. Memo Inline Edit */}
                              <td className="p-3">
                                <textarea
                                  defaultValue={item.memo || ''}
                                  rows={1}
                                  disabled={savingFieldId === `${item.id}-memo`}
                                  onBlur={(e) => {
                                    if (e.target.value !== (item.memo || '')) {
                                      handleInlineFieldChange(item.id, 'memo', e.target.value);
                                    }
                                  }}
                                  placeholder="지적사항 및 수정내용 기록..."
                                  className="w-full bg-transparent border-b border-border-color focus:border-brand-primary py-1 text-xs text-text-main placeholder:text-text-muted/40 outline-none resize-none disabled:opacity-50"
                                />
                              </td>

                              {/* 7. Image Upload / View inline */}
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {item.image_url ? (
                                    <div className="relative group/img flex items-center gap-1">
                                      <button
                                        onClick={() => handleViewImage(item.image_url!)}
                                        className="px-2 py-1 text-[10px] bg-bg-primary-soft text-brand-primary hover:bg-brand-primary hover:text-white rounded border border-brand-primary/20 transition-all font-semibold"
                                      >
                                        증빙
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (confirm('첨부 이미지를 삭제하시겠습니까?')) {
                                            handleDeleteImage(item.id, item.image_url!);
                                          }
                                        }}
                                        title="이미지 삭제"
                                        className="w-5 h-5 rounded bg-bg-danger-soft text-brand-danger hover:bg-brand-danger hover:text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity cursor-pointer"
                                      >
                                        <Trash className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <label className="w-7 h-7 bg-bg-tertiary hover:bg-bg-primary-soft hover:text-brand-primary border border-border-color rounded flex items-center justify-center text-text-muted transition-colors cursor-pointer">
                                      {uploadingId === item.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <ImagePlus className="w-3.5 h-3.5" />
                                      )}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        disabled={uploadingId !== null}
                                        onChange={(e) => handleInlineFileChange(item.id, e)}
                                        className="hidden"
                                      />
                                    </label>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
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
