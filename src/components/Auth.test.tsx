/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Auth from './Auth';
import { supabase } from '../lib/supabaseClient';

// Mock Supabase client
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
  },
}));

describe('Auth Component', () => {
  const mockOnAuthSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form by default', () => {
    render(<Auth onAuthSuccess={mockOnAuthSuccess} />);
    expect(screen.getByRole('heading', { name: 'PM Checklist' })).toBeInTheDocument();
    expect(screen.getByLabelText(/이메일/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/비밀번호/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
  });

  it('allows switching to signup view and back', () => {
    render(<Auth onAuthSuccess={mockOnAuthSuccess} />);
    
    // Switch to Sign Up
    const signupBtn = screen.getByRole('button', { name: '회원가입' });
    fireEvent.click(signupBtn);
    expect(screen.getByRole('button', { name: '회원가입' })).toBeInTheDocument();
    
    // Switch back to Login
    const loginBtn = screen.getByRole('button', { name: '로그인' });
    fireEvent.click(loginBtn);
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
  });

  it('submits login request successfully and triggers callback', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: {} as any, session: {} as any },
      error: null,
    });

    render(<Auth onAuthSuccess={mockOnAuthSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('name@etribe.co.kr'), {
      target: { value: 'user@etribe.co.kr' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'user@etribe.co.kr',
        password: 'password123',
      });
      expect(mockOnAuthSuccess).toHaveBeenCalled();
    });
  });

  it('displays error message on failed login', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' } as any,
    });

    render(<Auth onAuthSuccess={mockOnAuthSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('name@etribe.co.kr'), {
      target: { value: 'user@etribe.co.kr' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'wrong-pass' },
    });

    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid login credentials')).toBeInTheDocument();
    });
  });

  it('enforces etribe.co.kr domain limit for signup', async () => {
    render(<Auth onAuthSuccess={mockOnAuthSuccess} />);
    
    // Switch to Sign Up
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    fireEvent.change(screen.getByPlaceholderText('name@etribe.co.kr'), {
      target: { value: 'test@gmail.com' },
    });
    const passwordInputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(passwordInputs[0], {
      target: { value: 'password123' },
    });
    fireEvent.change(passwordInputs[1], {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => {
      expect(screen.getByText(/이트라이브 사내 이메일\(@etribe\.co\.kr\)로만/i)).toBeInTheDocument();
      expect(supabase.auth.signUp).not.toHaveBeenCalled();
    });
  });

  it('completes signup successfully with @etribe.co.kr domain', async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: {} as any, session: null },
      error: null,
    });

    render(<Auth onAuthSuccess={mockOnAuthSuccess} />);
    
    // Switch to Sign Up
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    fireEvent.change(screen.getByPlaceholderText('name@etribe.co.kr'), {
      target: { value: 'newuser@etribe.co.kr' },
    });
    const passwordInputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(passwordInputs[0], {
      target: { value: 'password123' },
    });
    fireEvent.change(passwordInputs[1], {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => {
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'newuser@etribe.co.kr',
        password: 'password123',
        options: expect.any(Object),
      });
      expect(screen.getByText(/회원가입이 완료되었습니다/i)).toBeInTheDocument();
    });
  });
});
