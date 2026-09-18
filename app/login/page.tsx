"use client";

// Accesso all'area riservata. Il magic link è la via principale per i
// genitori: una password in più è la ragione numero uno per cui un
// gestionale sportivo non viene usato.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"link" | "password">("link");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMsg(null);

    if (mode === "link") {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      setMsg(error ? error.message : "Ti abbiamo inviato il link di accesso. Controlla la posta.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg("Email o password non corrette.");
      else location.href = "/";
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-5">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-bold text-[#7B1123]">Miracoli FC</h1>
        <p className="mt-1 text-sm text-slate-500">Area riservata a staff e famiglie</p>

        <label className="mt-5 block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@email.it"
          className="mt-1 w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-[#5BC0EB] focus:ring-2 focus:ring-[#5BC0EB]/30"
        />

        {mode === "password" && (
          <>
            <label className="mt-3 block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-[#5BC0EB] focus:ring-2 focus:ring-[#5BC0EB]/30"
            />
          </>
        )}

        <button
          onClick={submit}
          disabled={busy || !email}
          className="mt-5 w-full rounded-xl bg-[#7B1123] py-3.5 font-semibold text-white disabled:bg-slate-300"
        >
          {mode === "link" ? "Inviami il link di accesso" : "Entra"}
        </button>

        <button
          onClick={() => setMode(mode === "link" ? "password" : "link")}
          className="mt-3 w-full text-sm text-slate-500 underline"
        >
          {mode === "link" ? "Entra con la password" : "Entra con il link via email"}
        </button>

        {msg && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{msg}</p>}
      </div>
    </main>
  );
}
