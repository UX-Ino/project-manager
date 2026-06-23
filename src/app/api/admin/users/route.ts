import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify the caller's JWT and check admin flag
  const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.user_metadata?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: { users }, error: listError } = await adminSupabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }

  const sanitized = users.map(u => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    email_confirmed_at: u.email_confirmed_at,
    is_admin: u.user_metadata?.is_admin === true,
  }));

  return NextResponse.json({ users: sanitized });
}

export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify caller is admin
  const { data: { user: caller }, error: authError } = await adminSupabase.auth.getUser(token);
  if (authError || !caller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!caller.user_metadata?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as { userId: string; is_admin: boolean };
  const { userId, is_admin } = body;

  if (!userId || typeof is_admin !== 'boolean') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Prevent self-demotion
  if (userId === caller.id && !is_admin) {
    return NextResponse.json({ error: '자신의 관리자 권한은 해제할 수 없습니다.' }, { status: 400 });
  }

  const { data: { user: target }, error: fetchError } = await adminSupabase.auth.admin.getUserById(userId);
  if (fetchError || !target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { error: updateError } = await adminSupabase.auth.admin.updateUserById(userId, {
    user_metadata: { ...target.user_metadata, is_admin },
  });

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
