// app/(coach)/squadra/[teamId]/appello/[sessionId]/page.tsx
//
// Server Component: carica seduta, rosa e presenze già registrate, poi
// passa tutto al componente client. Nessun filtro esplicito sui permessi:
// se il mister non è assegnato a questo gruppo, RLS restituisce zero righe.

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RegistroPresenze, {
  type AttendanceStatus,
  type Player,
} from "@/components/RegistroPresenze";

export const dynamic = "force-dynamic";

export default async function AppelloPage({
  params,
}: {
  params: Promise<{ teamId: string; sessionId: string }>;
}) {
  const { teamId, sessionId } = await params;
  const supabase = await createClient();

  const [sessionRes, playersRes, attendanceRes] = await Promise.all([
    supabase
      .from("training_sessions")
      .select("id, team_id, session_date, start_time, pitch, teams_categories(name)")
      .eq("id", sessionId)
      .single(),
    supabase
      .from("players_with_cert_status")
      .select("id, first_name, last_name, jersey_number, cert_status")
      .eq("team_id", teamId)
      .eq("status", "active")
      .order("last_name"),
    supabase
      .from("attendances")
      .select("player_id, status, notes")
      .eq("session_id", sessionId),
  ]);

  if (sessionRes.error || !sessionRes.data) notFound();

  const initialAttendance: Record<string, AttendanceStatus> = {};
  const initialNotes: Record<string, string> = {};
  (attendanceRes.data ?? []).forEach((a) => {
    initialAttendance[a.player_id] = a.status as AttendanceStatus;
    if (a.notes) initialNotes[a.player_id] = a.notes;
  });

  const s = sessionRes.data as any;

  return (
    <RegistroPresenze
      session={{
        id: s.id,
        team_id: s.team_id,
        team_name: s.teams_categories?.name ?? "Squadra",
        session_date: s.session_date,
        start_time: String(s.start_time).slice(0, 5),
        pitch: s.pitch,
      }}
      players={(playersRes.data ?? []) as Player[]}
      initialAttendance={initialAttendance}
      initialNotes={initialNotes}
      blockExpiredCertificates={false}
    />
  );
}
