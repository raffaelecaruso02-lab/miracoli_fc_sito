// → lib/supabase/server.ts
// Usato dai Server Components e dalle Route Handler: legge la sessione
// dai cookie, così le query partono già con l'utente autenticato e le
// policy RLS filtrano i dati senza che tu scriva un solo `where`.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chiamato da un Server Component: se ne occupa il middleware.
          }
        },
      },
    },
  );
}

/** Ruolo dell'utente corrente, o null se non autenticato. */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single();

  return profile ?? null;
}
