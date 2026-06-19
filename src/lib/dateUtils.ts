/**
 * Calculates the D-Day for a given target date string relative to today.
 * 
 * @param dateStr Target date in YYYY-MM-DD or equivalent format
 * @returns An object containing the display text and status ('imminent' | 'overdue' | 'normal'), or null if the date is invalid or empty.
 */
export function getDDay(dateStr: string | null): { text: string; status: 'imminent' | 'overdue' | 'normal' } | null {
  if (!dateStr) return null;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return null;
  target.setHours(0, 0, 0, 0);
  
  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { text: 'D-Day', status: 'imminent' };
  if (diffDays < 0) return { text: `D+${Math.abs(diffDays)}`, status: 'overdue' };
  return { text: `D-${diffDays}`, status: diffDays <= 3 ? 'imminent' : 'normal' };
}
