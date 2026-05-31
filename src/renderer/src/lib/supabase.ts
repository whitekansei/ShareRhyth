import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = !!(url && key);

// supabase は設定済みの場合のみ有効なクライアントを返す
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, key!)
  : null;
