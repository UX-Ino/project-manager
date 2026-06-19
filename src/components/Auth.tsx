'use client';

import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Mail, Lock, CheckSquare, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface AuthProps {
  onAuthSuccess: () => void;
}

export default function Auth({ onAuthSuccess }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isLogin) {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (loginError) throw loginError;
        onAuthSuccess();
      } else {
        if (!email.endsWith('@etribe.co.kr')) {
          throw new Error('이트라이브 사내 이메일(@etribe.co.kr)로만 회원가입이 가능합니다.');
        }
        if (password !== confirmPassword) {
          throw new Error('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
        }
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
          }
        });
        if (signUpError) throw signUpError;
        
        // 메일인증 안내 브라우저 알림창 출력
        alert('회원가입이 완료되었습니다!\n적어주신 이메일(@etribe.co.kr) 메일함으로 발송된 인증 링크를 확인하신 후 클릭해 주세요.\n인증이 완료되어야 로그인이 가능합니다.');
        
        setMessage('회원가입이 완료되었습니다! 이메일을 확인해 주세요.');
        setIsLogin(true);
        setConfirmPassword('');
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      setError(errorObj.message || '인증 과정에서 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{ backgroundColor: '#f9fafb' }}
      className="fixed inset-0 flex flex-col items-center justify-center p-4 z-50"
    >
      {/* Logo */}
      <div className="mb-8 text-center animate-fade-in">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
          style={{ backgroundColor: '#3182f6' }}
        >
          <CheckSquare className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-text-main tracking-tight font-heading">
          PM Checklist
        </h1>
        <p className="text-sm text-text-muted mt-1">웹 접근성 프로젝트 PM 관리 툴</p>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-[400px] rounded-2xl p-8 animate-fade-in-down"
        style={{
          backgroundColor: '#ffffff',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0,0,0,0.04)',
        }}
      >
        {/* Tab Switcher — only the inactive tab is a button to avoid duplicate button names */}
        <div
          className="flex rounded-xl p-1 mb-7"
          style={{ backgroundColor: '#f2f4f6' }}
        >
          {isLogin ? (
            <>
              <span
                className="flex-1 py-2 text-sm font-semibold rounded-lg text-center bg-white text-text-main shadow-sm"
                aria-current="true"
              >
                로그인
              </span>
              <button
                type="button"
                onClick={() => { setIsLogin(false); setError(''); setMessage(''); setConfirmPassword(''); }}
                className="flex-1 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer text-text-muted hover:text-text-sub"
              >
                회원가입
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setIsLogin(true); setError(''); setMessage(''); setConfirmPassword(''); }}
                className="flex-1 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer text-text-muted hover:text-text-sub"
              >
                로그인
              </button>
              <span
                className="flex-1 py-2 text-sm font-semibold rounded-lg text-center bg-white text-text-main shadow-sm"
                aria-current="true"
              >
                회원가입
              </span>
            </>
          )}
        </div>

        {/* Error / Success Messages */}
        {error && (
          <div
            className="mb-4 p-3 rounded-xl flex items-start gap-2.5 text-xs animate-fade-in"
            style={{ backgroundColor: '#fff2f3', color: '#f04452' }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {message && (
          <div
            className="mb-4 p-3 rounded-xl flex items-start gap-2.5 text-xs animate-fade-in"
            style={{ backgroundColor: '#e8f9f6', color: '#00b493' }}
          >
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="auth-email"
              className="block text-xs font-semibold"
              style={{ color: '#4e5968' }}
            >
              이메일
            </label>
            <div className="relative">
              <Mail
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: '#8b95a1' }}
              />
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@etribe.co.kr"
                className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border transition-all"
                style={{
                  backgroundColor: '#f9fafb',
                  borderColor: '#e5e8eb',
                  color: '#191f28',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#3182f6')}
                onBlur={(e) => (e.target.style.borderColor = '#e5e8eb')}
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="auth-password"
              className="block text-xs font-semibold"
              style={{ color: '#4e5968' }}
            >
              비밀번호
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: '#8b95a1' }}
              />
              <input
                id="auth-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border transition-all"
                style={{
                  backgroundColor: '#f9fafb',
                  borderColor: '#e5e8eb',
                  color: '#191f28',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#3182f6')}
                onBlur={(e) => (e.target.style.borderColor = '#e5e8eb')}
              />
            </div>
          </div>

          {/* Password Confirm Field (Signup only) */}
          {!isLogin && (
            <div className="space-y-1.5 animate-fade-in">
              <label
                htmlFor="auth-confirm-password"
                className="block text-xs font-semibold"
                style={{ color: '#4e5968' }}
              >
                비밀번호 확인
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: '#8b95a1' }}
                />
                <input
                  id="auth-confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border transition-all"
                  style={{
                    backgroundColor: '#f9fafb',
                    borderColor: '#e5e8eb',
                    color: '#191f28',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#3182f6')}
                  onBlur={(e) => (e.target.style.borderColor = '#e5e8eb')}
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 mt-2"
            style={{
              backgroundColor: isLogin ? '#3182f6' : '#00b493',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = isLogin ? '#1b64da' : '#009579')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isLogin ? '#3182f6' : '#00b493')}
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : isLogin ? '로그인' : '회원가입'
            }
          </button>
        </form>
      </div>

      {/* Footer note */}
      <p className="mt-6 text-xs text-text-muted animate-fade-in">
        이트라이브 사내 계정으로 이용하세요 · @etribe.co.kr
      </p>
    </div>
  );
}
