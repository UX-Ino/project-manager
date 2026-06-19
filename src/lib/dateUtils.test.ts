import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDDay } from './dateUtils';

describe('getDDay', () => {
  beforeEach(() => {
    // Mock system time to 2026-06-18
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00+09:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return null if date string is null or empty', () => {
    expect(getDDay(null)).toBeNull();
    expect(getDDay('')).toBeNull();
  });

  it('should return D-Day for today', () => {
    const res = getDDay('2026-06-18');
    expect(res).toEqual({ text: 'D-Day', status: 'imminent' });
  });

  it('should return D-1 for tomorrow (imminent)', () => {
    const res = getDDay('2026-06-19');
    expect(res).toEqual({ text: 'D-1', status: 'imminent' });
  });

  it('should return D-3 for date in 3 days (imminent)', () => {
    const res = getDDay('2026-06-21');
    expect(res).toEqual({ text: 'D-3', status: 'imminent' });
  });

  it('should return D-4 for date in 4 days (normal)', () => {
    const res = getDDay('2026-06-22');
    expect(res).toEqual({ text: 'D-4', status: 'normal' });
  });

  it('should return D+1 for yesterday (overdue)', () => {
    const res = getDDay('2026-06-17');
    expect(res).toEqual({ text: 'D+1', status: 'overdue' });
  });

  it('should return D+5 for 5 days ago (overdue)', () => {
    const res = getDDay('2026-06-13');
    expect(res).toEqual({ text: 'D+5', status: 'overdue' });
  });
});
