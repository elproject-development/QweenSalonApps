import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://your-project-ref.supabase.co";

const supabaseKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  "your-anon-key";

export const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;
