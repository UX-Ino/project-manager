'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, STORAGE_BUCKET } from '../lib/supabaseClient';

export interface Project {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  is_completed?: boolean;
  wbs_sheet_url?: string | null;
  a11y_sheet_url?: string | null;
  wbs_weeks?: { week_num: number; label: string; date_range: string }[] | null;
}

export interface ToastMessage {
  id: string;
  message: string;
}

interface ProjectContextType {
  session: any;
  authLoading: boolean;
  projects: Project[];
  projectsLoading: boolean;
  toasts: ToastMessage[];
  showToast: (msg: string) => void;
  fetchProjects: () => Promise<void>;
  handleCreateProject: (name: string, slug: string) => Promise<string | null>;
  handleDeleteProject: (id: string) => Promise<boolean>;
  handleUpdateProjectStatus: (id: string, isCompleted: boolean) => Promise<boolean>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // 1. Toast Notification Helper
  const showToast = useCallback((msg: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message: msg }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // 2. Fetch Projects
  const fetchProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (err: any) {
      console.error('Error fetching projects:', err.message);
      showToast('프로젝트 목록을 불러오지 못했습니다.');
    } finally {
      setProjectsLoading(false);
    }
  }, [showToast]);

  // 3. Auth Session Monitoring
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
      if (session) {
        fetchProjects();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
      if (session) {
        fetchProjects();
      } else {
        setProjects([]);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProjects]);

  // Helper for deleting image files from Supabase Storage
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

  // Helper for seeding initial WBS template
  const initializeWbs = async (projectId: string, projectName: string) => {
    try {
      const wbsInitialData = [
        { project_id: projectId, row_order: 1, level: 1, task_l1: '1. 프로젝트 착수', task_l2: '', task_l3: '', task_l4: '', description: '프로젝트 킥오프 및 요구사항 확인' },
        { project_id: projectId, row_order: 2, level: 2, task_l1: '', task_l2: '요구사항 분석', task_l3: '', task_l4: '', description: '기능 정의서 작성' },
        { project_id: projectId, row_order: 3, level: 1, task_l1: '2. 디자인 및 기획', task_l2: '', task_l3: '', task_l4: '', description: 'UI/UX 디자인' },
        { project_id: projectId, row_order: 4, level: 2, task_l1: '', task_l2: '화면 설계', task_l3: '', task_l4: '', description: '화면 설계서 작성' },
        { project_id: projectId, row_order: 5, level: 1, task_l1: '3. 개발', task_l2: '', task_l3: '', task_l4: '', description: '프론트/백엔드 개발' },
        { project_id: projectId, row_order: 6, level: 1, task_l1: '4. 테스트 및 접근성 심사', task_l2: '', task_l3: '', task_l4: '', description: '접근성 검사 및 보완 조치' },
      ];

      const { error } = await supabase
        .from('wbs_rows')
        .insert(wbsInitialData);

      if (error) throw error;
      console.log(`WBS initialized for project: ${projectName}`);
    } catch (err: any) {
      console.error('Error seeding WBS:', err.message);
    }
  };

  // 4. Create Project
  const handleCreateProject = useCallback(async (projectName: string, projectSlug: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.rpc('create_project_with_defaults', {
        project_name: projectName,
        project_slug: projectSlug,
      });

      if (error) throw error;
      
      if (data) {
        await initializeWbs(data, projectName);
      }

      showToast('프로젝트 생성 및 기본 데이터 삽입이 완료되었습니다.');
      await fetchProjects();
      return data; // Return the new project ID
    } catch (err: any) {
      console.error(err);
      showToast(`프로젝트 생성 실패: ${err.message}`);
      return null;
    }
  }, [fetchProjects, showToast]);

  // 5. Delete Project
  const handleDeleteProject = useCallback(async (projectId: string): Promise<boolean> => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return false;

    if (!confirm(`"${project.name}" 프로젝트와 이에 연결된 모든 체크리스트 데이터를 영구 삭제하시겠습니까?`)) {
      return false;
    }

    try {
      // 5.1. Fetch project checklist items with images and delete files in storage
      const { data: items, error: itemsFetchError } = await supabase
        .from('checklist')
        .select('image_url')
        .eq('project_id', projectId)
        .is('image_url', 'not.null');

      if (!itemsFetchError && items) {
        for (const item of items) {
          if (item.image_url) {
            await deleteImageFile(item.image_url);
          }
        }
      }

      // 5.2. Delete project row in DB (cascades deletion to checklist, wbs_rows, deploy_slides tables)
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);

      if (error) throw error;

      showToast('프로젝트가 영구적으로 삭제되었습니다.');
      await fetchProjects();
      return true;
    } catch (err: any) {
      console.error(err);
      showToast(`프로젝트 삭제 오류: ${err.message}`);
      return false;
    }
  }, [projects, fetchProjects, showToast]);

  const handleUpdateProjectStatus = useCallback(async (projectId: string, isCompleted: boolean): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ is_completed: isCompleted })
        .eq('id', projectId);

      if (error) throw error;
      
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, is_completed: isCompleted } : p));
      showToast(isCompleted ? '프로젝트가 완료 처리되었습니다.' : '프로젝트가 진행 중으로 변경되었습니다.');
      return true;
    } catch (err: any) {
      console.error(err);
      showToast(`프로젝트 상태 업데이트 실패: ${err.message}`);
      return false;
    }
  }, [showToast]);

  return (
    <ProjectContext.Provider value={{
      session,
      authLoading,
      projects,
      projectsLoading,
      toasts,
      showToast,
      fetchProjects,
      handleCreateProject,
      handleDeleteProject,
      handleUpdateProjectStatus
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
