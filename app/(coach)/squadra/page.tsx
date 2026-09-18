// Elenco dei gruppi squadra assegnati al tecnico, con l'azione che serve
// il 90% delle volte: aprire l'appello di oggi.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function apriSeduta(formData: FormData) {
  "use server";
  const teamId = String(formData.get("teamId"));
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("training_sessions")
    .select("id")
    .eq("team_id", teamId)
    .eq("session_date", today)
    .maybeSingle();

  let sessionId = existing?.id;

  if (!sessionId) {
    const { data } = await supabase
      .from("training_sessions")
      .insert({ team_id: teamId, session_date: today })
      .select("id")
      .single();
    sessionId = data?.id;
  }

  redirect(`/squadra/${teamId}/appello/${sessionId}`);
}

export default async function SquadrePage() {
  const supabase = await createClient();

  // Nessun filtro sull'utente: ci pensa la policy `teams_read` insieme
  // a `is_staff_of`, che restituisce solo i gruppi assegnati.
  const { data: teams } = await supabase
    .from("teams_categories")
    .select("id, name, age_group, players(count)")
    .order("name");

  return (
    <main className="mx-auto max-w-lg p-4">
      <h1 className="mb-4 text-lg font-semibold text-slate-800">Le tue squadre</h1>

      {(teams ?? []).length === 0 && (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">
          Non hai ancora gruppi assegnati. Scrivi alla segreteria per farti
          associare a una categoria.
        </p>
      )}

      <ul className="space-y-3">
        {(teams ?? []).map((t: any) => (
          <li key={t.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <p className="font-semibold text-slate-800">{t.name}</p>
            <p className="text-sm text-slate-500">
              {t.age_group} · {t.players?.[0]?.count ?? 0} atleti
            </p>
            <form action={apriSeduta} className="mt-3">
              <input type="hidden" name="teamId" value={t.id} />
              <button className="w-full rounded-xl bg-[#7B1123] py-3 font-semibold text-white">
                Fai l'appello di oggi
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
