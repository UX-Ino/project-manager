'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useProject } from '../../context/ProjectContext';
import { Loader2, ShieldAlert } from 'lucide-react';

interface AdminUser {
  id: string;
  email: string | undefined;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  is_admin: boolean;
}

export default function AdminPage() {
  const { session, showToast } = useProject();

  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [updatingAdminId, setUpdatingAdminId] = useState<string | null>(null);

  const isAdmin = session?.user?.user_metadata?.is_admin === true;

  const fetchAdminUsers = useCallback(async () => {
    if (!session?.access_token) return;
    setAdminUsersLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '회원 목록 조회 실패');
      }
      setAdminUsers(data.users || []);
    } catch (err: any) {
      console.error('Error fetching admin users:', err.message);
      showToast('회원 목록을 불러오지 못했습니다.');
    } finally {
      setAdminUsersLoading(false);
    }
  }, [session?.access_token, showToast]);

  const handleToggleAdmin = useCallback(async (userId: string, currentIsAdmin: boolean) => {
    if (!session?.access_token) return;
    setUpdatingAdminId(userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId, is_admin: !currentIsAdmin }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || '권한 변경에 실패했습니다.');
        return;
      }
      setAdminUsers(prev =>
        prev.map(u => u.id === userId ? { ...u, is_admin: !currentIsAdmin } : u)
      );
      showToast(!currentIsAdmin ? '관리자 권한을 부여했습니다.' : '관리자 권한을 해제했습니다.');
    } catch (err: any) {
      showToast('권한 변경 중 오류가 발생했습니다.');
      console.error('Error toggling admin:', err.message);
    } finally {
      setUpdatingAdminId(null);
    }
  }, [session?.access_token, showToast]);

  useEffect(() => {
    if (isAdmin) {
      fetchAdminUsers();
    }
  }, [isAdmin, fetchAdminUsers]);

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-text-muted">
        <Loader2 className="w-8 h-8 text-[#3182f6] animate-spin" />
        <span className="text-xs">계정 세션을 불러오고 있습니다...</span>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-center max-w-md mx-auto">
        <ShieldAlert className="w-12 h-12 text-[#ef4444]" />
        <h3 className="text-base font-bold" style={{ color: '#191f28' }}>접근 권한이 없습니다</h3>
        <p className="text-xs text-[#8b95a1] leading-relaxed">
          이 페이지는 관리자 권한을 가진 계정만 접근할 수 있습니다. 권한 획득이 필요한 경우 시스템 관리자에게 문의해 주세요.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h2 className="text-xl font-bold font-heading" style={{ color: '#191f28' }}>회원 관리</h2>
        <p className="text-xs mt-0.5" style={{ color: '#8b95a1' }}>가입된 모든 사용자 계정을 조회합니다. (관리자 전용)</p>
      </div>

      {/* Admin badge */}
      <div
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
        style={{ backgroundColor: '#fff8e6', color: '#d97706', border: '1px solid #fde68a' }}
      >
        <ShieldAlert className="w-3.5 h-3.5" />
        관리자 계정으로 로그인됨
      </div>

      {/* Users Table */}
      <div className="bg-white border border-[#e5e8eb] rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-[#e5e8eb] flex items-center justify-between">
          <h3 className="text-sm font-bold" style={{ color: '#191f28' }}>전체 가입 회원 목록</h3>
          <button
            onClick={fetchAdminUsers}
            className="text-xs font-semibold transition-colors text-[#3182f6] hover:text-[#1b64da] cursor-pointer"
          >
            새로고침
          </button>
        </div>

        {adminUsersLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-[#3182f6]" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-[#f9fafb] text-[#8b95a1] border-b border-[#e5e8eb]">
                  <th className="px-4 py-3 font-bold">이메일</th>
                  <th className="px-4 py-3 font-bold">가입일</th>
                  <th className="px-4 py-3 font-bold">최근 로그인</th>
                  <th className="px-4 py-3 text-center font-bold">이메일 인증</th>
                  <th className="px-4 py-3 text-center font-bold">권한</th>
                  <th className="px-4 py-3 text-center font-bold">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e8eb] text-[#374151]">
                {adminUsers.map((u) => {
                  const isSelf = u.email === session.user?.email;
                  const isUpdating = updatingAdminId === u.id;
                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-[#f9fafb]/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-semibold text-[#191f28]">
                        {u.email || '-'}
                        {isSelf && (
                          <span
                            className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-bold bg-[#eff6ff] text-[#3182f6]"
                          >
                            나
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#8b95a1]">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('ko-KR') : '-'}
                      </td>
                      <td className="px-4 py-3 text-[#8b95a1]">
                        {u.last_sign_in_at
                          ? new Date(u.last_sign_in_at).toLocaleDateString('ko-KR')
                          : '없음'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="px-2 py-1 rounded text-[10px] font-bold"
                          style={u.email_confirmed_at
                            ? { backgroundColor: '#e8f9f6', color: '#00b493' }
                            : { backgroundColor: '#fff2f3', color: '#f04452' }
                          }
                        >
                          {u.email_confirmed_at ? '인증됨' : '미인증'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {u.is_admin ? (
                          <span
                            className="px-2 py-1 rounded text-[10px] font-bold bg-[#fff8e6] text-[#d97706]"
                          >
                            관리자
                          </span>
                        ) : (
                          <span className="text-[#8b95a1] text-[11px]">일반</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isSelf ? (
                          <span className="text-[11px] text-[#8b95a1]">-</span>
                        ) : (
                          <button
                            onClick={() => handleToggleAdmin(u.id, u.is_admin)}
                            disabled={isUpdating}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            style={u.is_admin
                              ? { borderColor: '#fde68a', color: '#d97706', backgroundColor: '#fffbeb' }
                              : { borderColor: '#e5e8eb', color: '#4e5968', backgroundColor: '#f9fafb' }
                            }
                            onMouseEnter={(e) => {
                              if (!isUpdating) e.currentTarget.style.backgroundColor = u.is_admin ? '#fef3c7' : '#f2f4f6';
                            }}
                            onMouseLeave={(e) => {
                              if (!isUpdating) e.currentTarget.style.backgroundColor = u.is_admin ? '#fffbeb' : '#f9fafb';
                            }}
                          >
                            {isUpdating
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : u.is_admin ? '관리자 해제' : '관리자 지정'
                            }
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {adminUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[#8b95a1]">
                      가입된 회원이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 py-2.5 border-t border-[#e5e8eb] text-[11px] text-[#8b95a1]">
          총 {adminUsers.length}명
        </div>
      </div>

      {/* Notice */}
      <div className="rounded-xl px-4 py-3 text-[11px] flex items-start gap-2 bg-[#fff8e6] text-[#92400e]">
        <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          권한 변경은 즉시 DB에 저장됩니다. 단, 변경 대상 계정은 <strong>로그아웃 후 재로그인</strong>해야 새 권한이 적용됩니다.
          자신의 계정은 관리자 해제가 불가능합니다.
        </span>
      </div>
    </section>
  );
}
