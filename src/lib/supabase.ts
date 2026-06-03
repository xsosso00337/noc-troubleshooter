import { createClient } from "@supabase/supabase-js";

const fallbackSupabaseUrl = "https://untrhzfuyliujlczyjyz.supabase.co";
const fallbackSupabasePublishableKey = "sb_publishable_GVR9X7viY3SmRGQu_RLTOw_avJvsy0G";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || fallbackSupabaseUrl;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  fallbackSupabasePublishableKey;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  },
);
