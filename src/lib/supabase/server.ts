import { createClient } from "@supabase/supabase-js";

// Server client — uses service role key, bypasses RLS.
// Only for use in Server Components, Route Handlers, and Server Actions.
// NEVER import this in Client Components or expose to the browser.
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: (url: RequestInfo | URL, options: RequestInit = {}) =>
          fetch(url, { ...options, cache: "no-store" }),
      },
    }
  );
}
