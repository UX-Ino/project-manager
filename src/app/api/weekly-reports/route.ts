import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET: 프로젝트의 저장된 주간보고서 목록 조회
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('weekly_reports')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST: 주간보고서 저장
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { project_id, week_label, period_from, period_to, report_text, cumulative_done, cumulative_fail, period_done } = body;

    if (!project_id || !week_label || !report_text) {
      return NextResponse.json({ error: 'project_id, week_label, report_text are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('weekly_reports')
      .insert({
        project_id,
        week_label,
        period_from: period_from || null,
        period_to: period_to || null,
        report_text,
        cumulative_done: cumulative_done ?? 0,
        cumulative_fail: cumulative_fail ?? 0,
        period_done: period_done ?? 0,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

// DELETE: 주간보고서 삭제
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase.from('weekly_reports').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
