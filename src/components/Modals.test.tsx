import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProjectModal, ItemModal, ImageViewerModal, ItemFormData } from './Modals';

describe('ProjectModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ProjectModal isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly and handles submission', async () => {
    const mockOnSubmit = vi.fn().mockResolvedValue(undefined);
    const mockOnClose = vi.fn();
    
    render(<ProjectModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />);
    
    expect(screen.getByText('새 프로젝트 추가')).toBeInTheDocument();
    
    const nameInput = screen.getByLabelText('프로젝트명');
    fireEvent.change(nameInput, { target: { value: 'New Project' } });

    const slugInput = screen.getByLabelText(/영문 식별자/);
    fireEvent.change(slugInput, { target: { value: 'new-project' } });
    
    const submitBtn = screen.getByRole('button', { name: '프로젝트 생성 & 기본데이터 주입' });
    fireEvent.click(submitBtn);
    
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith('New Project', 'new-project');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('validates against duplicate project names', async () => {
    const mockOnSubmit = vi.fn().mockResolvedValue(undefined);
    const mockOnClose = vi.fn();
    const existingNames = ['Duplicate Project', 'Other Project'];

    render(
      <ProjectModal 
        isOpen={true} 
        onClose={mockOnClose} 
        onSubmit={mockOnSubmit} 
        existingNames={existingNames} 
      />
    );

    const nameInput = screen.getByLabelText('프로젝트명');
    fireEvent.change(nameInput, { target: { value: 'Duplicate Project' } });

    const slugInput = screen.getByLabelText(/영문 식별자/);
    fireEvent.change(slugInput, { target: { value: 'unique-slug' } });

    const submitBtn = screen.getByRole('button', { name: '프로젝트 생성 & 기본데이터 주입' });
    fireEvent.click(submitBtn);

    expect(screen.getByText('이미 존재하는 프로젝트 이름입니다. 다른 이름을 입력해주세요.')).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});

describe('ItemModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ItemModal isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders in add mode with default group and handles submission', async () => {
    const mockOnSubmit = vi.fn().mockResolvedValue(undefined);
    const mockOnClose = vi.fn();
    
    render(
      <ItemModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        defaultGroup="Testing Group"
      />
    );
    
    expect(screen.getByText('체크리스트 항목 추가')).toBeInTheDocument();
    
    const groupInput = screen.getByLabelText('그룹명 (카테고리)');
    expect(groupInput).toHaveValue('Testing Group');
    
    const contentInput = screen.getByLabelText('체크리스트 내용');
    fireEvent.change(contentInput, { target: { value: 'New Checklist Task' } });
    
    const tagSelect = screen.getByLabelText('태그 설정');
    fireEvent.change(tagSelect, { target: { value: 'risk' } });
    
    const assigneeInput = screen.getByLabelText('담당자');
    fireEvent.change(assigneeInput, { target: { value: 'John Doe' } });
    
    const dateInput = screen.getByLabelText('마감일');
    fireEvent.change(dateInput, { target: { value: '2026-06-30' } });
    
    const submitBtn = screen.getByRole('button', { name: '저장' });
    fireEvent.click(submitBtn);
    
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        id: undefined,
        group_name: 'Testing Group',
        text: 'New Checklist Task',
        tag: 'risk',
        assignee: 'John Doe',
        due_date: '2026-06-30',
      });
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('pre-fills data and edits item in edit mode', async () => {
    const mockOnSubmit = vi.fn().mockResolvedValue(undefined);
    const mockOnClose = vi.fn();
    const existingItem: ItemFormData = {
      id: 'item-123',
      group_name: 'Existing Group',
      text: 'Existing Task',
      tag: 'doc',
      assignee: 'Jane Doe',
      due_date: '2026-06-25',
    };
    
    render(
      <ItemModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        item={existingItem}
      />
    );
    
    expect(screen.getByText('체크리스트 항목 수정')).toBeInTheDocument();
    
    const contentInput = screen.getByLabelText('체크리스트 내용');
    expect(contentInput).toHaveValue('Existing Task');
    fireEvent.change(contentInput, { target: { value: 'Updated Task Text' } });
    
    const submitBtn = screen.getByRole('button', { name: '저장' });
    fireEvent.click(submitBtn);
    
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        id: 'item-123',
        group_name: 'Existing Group',
        text: 'Updated Task Text',
        tag: 'doc',
        assignee: 'Jane Doe',
        due_date: '2026-06-25',
      });
    });
  });
});

describe('ImageViewerModal Component', () => {
  it('does not render when isOpen is false or imageUrl is empty', () => {
    const { container: container1 } = render(
      <ImageViewerModal isOpen={false} imageUrl="http://example.com/img.png" onClose={vi.fn()} />
    );
    expect(container1.firstChild).toBeNull();
    
    const { container: container2 } = render(
      <ImageViewerModal isOpen={true} imageUrl="" onClose={vi.fn()} />
    );
    expect(container2.firstChild).toBeNull();
  });

  it('renders image and triggers onClose when clicked', () => {
    const mockOnClose = vi.fn();
    render(
      <ImageViewerModal
        isOpen={true}
        imageUrl="http://example.com/image.png"
        onClose={mockOnClose}
      />
    );
    
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'http://example.com/image.png');
    
    // Close button click
    const closeBtn = screen.getByRole('button');
    fireEvent.click(closeBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
