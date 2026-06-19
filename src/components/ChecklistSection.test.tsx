import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ChecklistSection from './ChecklistSection';

describe('ChecklistSection Component', () => {
  const mockItems = [
    {
      id: '1',
      project_id: 'proj-1',
      phase: 'pre',
      group_name: 'Group A',
      text: 'Task 1',
      tag: 'risk' as const,
      checked: false,
      image_url: null,
      memo: null,
      due_date: '2026-06-18', // today (mocked to 2026-06-18 in setup or test)
      assignee: 'Alice',
    },
    {
      id: '2',
      project_id: 'proj-1',
      phase: 'pre',
      group_name: 'Group B',
      text: 'Task 2',
      tag: 'doc' as const,
      checked: true,
      image_url: 'http://example.com/item2.png',
      memo: 'Some important note',
      due_date: '2026-06-25', // in future
      assignee: 'Bob',
    },
  ];

  const mockOnToggleCheck = vi.fn();
  const mockOnUpdateMemo = vi.fn();
  const mockOnDeleteItem = vi.fn();
  const mockOnEditItem = vi.fn();
  const mockOnAddItemClick = vi.fn();
  const mockOnUploadImage = vi.fn();
  const mockOnDeleteImage = vi.fn();
  const mockOnViewImage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-18T12:00:00+09:00'));
    
    // Spy on window.confirm and window.alert
    vi.spyOn(window, 'confirm');
    vi.spyOn(window, 'alert');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders groups and checklist items with correct details', () => {
    render(
      <ChecklistSection
        items={mockItems}
        onToggleCheck={mockOnToggleCheck}
        onUpdateMemo={mockOnUpdateMemo}
        onDeleteItem={mockOnDeleteItem}
        onEditItem={mockOnEditItem}
        onAddItemClick={mockOnAddItemClick}
        onUploadImage={mockOnUploadImage}
        onDeleteImage={mockOnDeleteImage}
        onViewImage={mockOnViewImage}
      />
    );

    // Group names
    expect(screen.getByText('Group A')).toBeInTheDocument();
    expect(screen.getByText('Group B')).toBeInTheDocument();

    // Task texts
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Task 2')).toBeInTheDocument();

    // Tags
    expect(screen.getByText(/리스크/)).toBeInTheDocument();
    expect(screen.getByText(/산출물/)).toBeInTheDocument();

    // Assignees
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();

    // D-Day text
    expect(screen.getByText(/D-Day/)).toBeInTheDocument(); // Today
    expect(screen.getByText(/D-7/)).toBeInTheDocument();  // 2026-06-25 (June 18 + 7 days)
  });

  it('calls onToggleCheck when checking a task', () => {
    render(
      <ChecklistSection
        items={mockItems}
        onToggleCheck={mockOnToggleCheck}
        onUpdateMemo={mockOnUpdateMemo}
        onDeleteItem={mockOnDeleteItem}
        onEditItem={mockOnEditItem}
        onAddItemClick={mockOnAddItemClick}
        onUploadImage={mockOnUploadImage}
        onDeleteImage={mockOnDeleteImage}
        onViewImage={mockOnViewImage}
      />
    );

    const checkbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(checkbox);
    expect(mockOnToggleCheck).toHaveBeenCalledWith('1', true);
  });

  it('calls onAddItemClick when group add item button is clicked', () => {
    render(
      <ChecklistSection
        items={mockItems}
        onToggleCheck={mockOnToggleCheck}
        onUpdateMemo={mockOnUpdateMemo}
        onDeleteItem={mockOnDeleteItem}
        onEditItem={mockOnEditItem}
        onAddItemClick={mockOnAddItemClick}
        onUploadImage={mockOnUploadImage}
        onDeleteImage={mockOnDeleteImage}
        onViewImage={mockOnViewImage}
      />
    );

    const addBtns = screen.getAllByRole('button', { name: /\+ 항목 추가/ });
    fireEvent.click(addBtns[0]);
    expect(mockOnAddItemClick).toHaveBeenCalledWith('Group A');
  });

  it('calls onEditItem when edit button is clicked', () => {
    render(
      <ChecklistSection
        items={mockItems}
        onToggleCheck={mockOnToggleCheck}
        onUpdateMemo={mockOnUpdateMemo}
        onDeleteItem={mockOnDeleteItem}
        onEditItem={mockOnEditItem}
        onAddItemClick={mockOnAddItemClick}
        onUploadImage={mockOnUploadImage}
        onDeleteImage={mockOnDeleteImage}
        onViewImage={mockOnViewImage}
      />
    );

    const editBtns = screen.getAllByTitle('수정');
    fireEvent.click(editBtns[0]);
    expect(mockOnEditItem).toHaveBeenCalledWith(mockItems[0]);
  });

  it('calls onDeleteItem when delete button is clicked and confirmed', () => {
    vi.mocked(window.confirm).mockReturnValue(true);

    render(
      <ChecklistSection
        items={mockItems}
        onToggleCheck={mockOnToggleCheck}
        onUpdateMemo={mockOnUpdateMemo}
        onDeleteItem={mockOnDeleteItem}
        onEditItem={mockOnEditItem}
        onAddItemClick={mockOnAddItemClick}
        onUploadImage={mockOnUploadImage}
        onDeleteImage={mockOnDeleteImage}
        onViewImage={mockOnViewImage}
      />
    );

    const deleteBtns = screen.getAllByTitle('삭제');
    fireEvent.click(deleteBtns[0]);

    expect(window.confirm).toHaveBeenCalledWith('이 항목을 삭제하시겠습니까?');
    expect(mockOnDeleteItem).toHaveBeenCalledWith('1');
  });

  it('does not call onDeleteItem when delete is cancelled', () => {
    vi.mocked(window.confirm).mockReturnValue(false);

    render(
      <ChecklistSection
        items={mockItems}
        onToggleCheck={mockOnToggleCheck}
        onUpdateMemo={mockOnUpdateMemo}
        onDeleteItem={mockOnDeleteItem}
        onEditItem={mockOnEditItem}
        onAddItemClick={mockOnAddItemClick}
        onUploadImage={mockOnUploadImage}
        onDeleteImage={mockOnDeleteImage}
        onViewImage={mockOnViewImage}
      />
    );

    const deleteBtns = screen.getAllByTitle('삭제');
    fireEvent.click(deleteBtns[0]);

    expect(mockOnDeleteItem).not.toHaveBeenCalled();
  });

  it('toggles memo box, typing text and saving triggers onUpdateMemo', async () => {
    mockOnUpdateMemo.mockResolvedValue(undefined);

    render(
      <ChecklistSection
        items={mockItems}
        onToggleCheck={mockOnToggleCheck}
        onUpdateMemo={mockOnUpdateMemo}
        onDeleteItem={mockOnDeleteItem}
        onEditItem={mockOnEditItem}
        onAddItemClick={mockOnAddItemClick}
        onUploadImage={mockOnUploadImage}
        onDeleteImage={mockOnDeleteImage}
        onViewImage={mockOnViewImage}
      />
    );

    // Task 1 has no memo, button text is "메모 추가"
    const addMemoBtn = screen.getByRole('button', { name: /메모 추가/ });
    fireEvent.click(addMemoBtn);

    const textarea = screen.getByPlaceholderText('메모 내용을 입력하세요...');
    expect(textarea).toBeInTheDocument();
    
    fireEvent.change(textarea, { target: { value: 'New Test Memo Content' } });

    const saveBtn = screen.getByRole('button', { name: /저장/ });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockOnUpdateMemo).toHaveBeenCalledWith('1', 'New Test Memo Content');
    });
  });

  it('calls onViewImage when clicking thumbnail, and onDeleteImage when clicking image trash icon', async () => {
    vi.mocked(window.confirm).mockReturnValue(true);

    render(
      <ChecklistSection
        items={mockItems}
        onToggleCheck={mockOnToggleCheck}
        onUpdateMemo={mockOnUpdateMemo}
        onDeleteItem={mockOnDeleteItem}
        onEditItem={mockOnEditItem}
        onAddItemClick={mockOnAddItemClick}
        onUploadImage={mockOnUploadImage}
        onDeleteImage={mockOnDeleteImage}
        onViewImage={mockOnViewImage}
      />
    );

    // Task 2 has image_url, click on image to view
    const thumbnail = screen.getByAltText('첨부 이미지');
    fireEvent.click(thumbnail);
    expect(mockOnViewImage).toHaveBeenCalledWith('http://example.com/item2.png');

    // Click delete image icon
    const delImgBtn = screen.getByTitle('이미지 삭제');
    fireEvent.click(delImgBtn);
    expect(window.confirm).toHaveBeenCalledWith('첨부된 이미지를 삭제하시겠습니까?');
    expect(mockOnDeleteImage).toHaveBeenCalledWith('2', 'http://example.com/item2.png');
  });

  it('rejects files larger than 5MB and alerts user, otherwise uploads successfully', async () => {
    mockOnUploadImage.mockResolvedValue(undefined);

    const { container } = render(
      <ChecklistSection
        items={mockItems}
        onToggleCheck={mockOnToggleCheck}
        onUpdateMemo={mockOnUpdateMemo}
        onDeleteItem={mockOnDeleteItem}
        onEditItem={mockOnEditItem}
        onAddItemClick={mockOnAddItemClick}
        onUploadImage={mockOnUploadImage}
        onDeleteImage={mockOnDeleteImage}
        onViewImage={mockOnViewImage}
      />
    );

    // Find upload file input for Task 1 (no image)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    // 1. File too large
    const largeFile = new File(['a'.repeat(6 * 1024 * 1024)], 'large.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [largeFile] } });
    
    expect(window.alert).toHaveBeenCalledWith('파일 크기는 최대 5MB까지 업로드할 수 있습니다.');
    expect(mockOnUploadImage).not.toHaveBeenCalled();

    // 2. Valid file
    const validFile = new File(['a'.repeat(1 * 1024 * 1024)], 'small.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [validFile] } });
    
    await waitFor(() => {
      expect(mockOnUploadImage).toHaveBeenCalledWith('1', validFile);
    });
  });
});
