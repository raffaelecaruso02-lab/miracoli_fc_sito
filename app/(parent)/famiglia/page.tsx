// app/(parent)/famiglia/page.tsx
//
// L'area riservata della famiglia: convocazioni aperte per i propri figli
// e bacheca del mister. La query non nomina mai il genitore: è la policy
// `callups_read` a restringere le righe ai figli dell'utente loggato.

import { createClient } from "@/lib/supabase/server";
import CardConvocazione, { type CallupMatch } from "@/components/CardConvocazione";

export const dynamic = "force-dynamic";

export default async function FamigliaPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: callups } = await supabase
    .from("callups")
    .select(
      `id, parent_status, response_note,
       players ( first_name, teams_categories ( name ) ),
       matches ( id, opponent, venue, match_date, meeting_time, kickoff_time,
                 location_name, location_address, kit_color, notes, response_deadline )`,
    )
    .gte("matches.match_date", today)
    .order("match_date", { referencedTable: "matches", ascending: true });

  const { data: announcements } = await supabase
    .from("team_announcements")
    .select("id, title, message, priority, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  const open = (callups ?? []).filter((c: any) => c.matches);

  return (
    <main className="mx-auto max-w-lg space-y-4 bg-slate-50 p-4">
      <h1 className="font-semibold text-slate-800">Convocazioni</h1>

      {open.length === 0 && (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">
          Nessuna gara in programma. Quando il mister pubblica una convocazione
          la trovi qui.
        </p>
      )}

      {open.map((c: any) => (
        <CardConvocazione
          key={c.id}
          callupId={c.id}
          match={
            {
              ...c.matches,
              meeting_time: String(c.matches.meeting_time).slice(0, 5),
              kickoff_time: String(c.matches.kickoff_time).slice(0, 5),
            } as CallupMatch
          }
          playerName={c.players.first_name}
          teamName={c.players.teams_categories?.name ?? ""}
          initialStatus={c.parent_status}
          initialNote={c.response_note}
        />
      ))}

      <section className="pt-2">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">
          Bacheca del mister
        </h2>
        {(announcements ?? []).map((a) => (
          <article
            key={a.id}
            className={`mb-2 rounded-xl bg-white p-4 ring-1 ring-slate-200 ${
              a.priority === "urgent" ? "border-l-4 border-rose-600" : ""
            }`}
          >
            <h3 className="font-medium text-slate-800">{a.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{a.message}</p>
            <time className="mt-2 block text-xs text-slate-400">
              {new Date(a.created_at).toLocaleString("it-IT", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </article>
        ))}
      </section>
    </main>
  );
}
