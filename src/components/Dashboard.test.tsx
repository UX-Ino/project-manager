import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Dashboard from './Dashboard';

describe('Dashboard Component', () => {
  it('renders progress percentage and completion status correctly', () => {
    render(
      <Dashboard
        totalCount={10}
        checkedCount={4}
        riskCount={2}
        docCount={3}
        extCount={1}
      />
    );

    // 4 / 10 = 40%
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('4 / 10 완료')).toBeInTheDocument();
    
    // Check remaining risks
    expect(screen.getByText('남은 리스크')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    // Check completed documents
    expect(screen.getByText('완료 산출물')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    // Check external solution issues
    expect(screen.getByText('외부 솔루션 이슈')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('handles zero totalCount gracefully without NaN', () => {
    render(
      <Dashboard
        totalCount={0}
        checkedCount={0}
        riskCount={0}
        docCount={0}
        extCount={0}
      />
    );

    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('0 / 0 완료')).toBeInTheDocument();
  });
});
