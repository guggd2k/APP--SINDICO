import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (!supabaseConfigured || !supabaseUrl || !supabaseAnonKey) return null;
  client ??= createClient(supabaseUrl, supabaseAnonKey);
  return client;
}
