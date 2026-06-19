import { createClient } from '@supabase/supabase-js';

// 빌드 타임에 환경변수가 누락되더라도 tsc/prerender 빌드가 에러를 뿜으며 깨지지 않도록 placeholder를 제공합니다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('⚠️ [Supabase] Missing environment variables. Using placeholder values for build/prerendering time.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const STORAGE_BUCKET = 'images';
