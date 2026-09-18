// → middleware.ts (nella radice del progetto, accanto a package.json)
// Fa due cose: rinnova il token di sessione a ogni richiesta e manda
// l'utente nella sua area. NON è questo a proteggere i dati — quello
// lo fa RLS nel database. Qui è solo navigazione.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const HOME_BY_ROLE: Record<string, string> = {
  admin: "/segreteria",
  coach: "/squadra",
  parent: "/famiglia",
};

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/" || path.startsWith("/login") || path.startsWith("/auth");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    const home = HOME_BY_ROLE[profile?.role ?? "parent"];

    // Già loggato ma sulla pagina di login → portalo a casa sua
    if (path.startsWith("/login")) {
      const url = request.nextUrl.clone();
      url.pathname = home;
      return NextResponse.redirect(url);
    }

    // Area non sua → rimandalo alla propria
    const areas = ["/segreteria", "/squadra", "/famiglia"];
    const area = areas.find((a) => path.startsWith(a));
    if (area && area !== home) {
      const url = request.nextUrl.clone();
      url.pathname = home;
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:png|jpg|svg|webp)$).*)"],
};
