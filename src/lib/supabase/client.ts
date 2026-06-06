import { createClient } from "@supabase/supabase-js";

// Browser client — uses anon key, respects RLS.
// Only for use in Client Components.
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
