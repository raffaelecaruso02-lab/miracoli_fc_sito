"use client";

/**
 * MIRACOLI FC — Registro Presenze (appello a bordo campo)
 * ---------------------------------------------------------------
 * Obiettivo: chiudere l'appello di 20 atleti in meno di 20 secondi,
 * con una mano sola, sotto il sole, con connessione instabile.
 *
 * Scelte progettuali:
 *  - "Tutti presenti" come azione primaria: l'appello parte già
 *    compilato, il mister corregge solo le eccezioni (2-3 tocchi).
 *  - Scrittura ottimistica in stato locale + coda offline: la UI non
 *    aspetta mai la rete. Il flush avviene su `online` e ogni 5s.
 *  - Upsert su (session_id, player_id): salvare due volte è innocuo.
 *  - Le note tecniche sono visibili solo allo staff (vedi RLS).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleSlash,
  CloudOff,
  FileText,
  HeartPulse,
  MessageSquare,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */
/* Tipi                                                                */
/* ------------------------------------------------------------------ */

export type AttendanceStatus = "present" | "absent" | "justified" | "injured";

export interface Player {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  cert_status: "valid" | "expiring" | "expired" | "missing";
}

export interface TrainingSession {
  id: string;
  team_id: string;
  team_name: string;
  session_date: string; // ISO
  start_time: string; // 'HH:MM'
  pitch: string;
}

interface Props {
  session: TrainingSession;
  players: Player[];
  initialAttendance?: Record<string, AttendanceStatus>;
  initialNotes?: Record<string, string>;
  /** Blocca l'atleta con certificato scaduto invece di limitarsi ad avvisare. */
  blockExpiredCertificates?: boolean;
}

interface QueuedWrite {
  player_id: string;
  status: AttendanceStatus;
  notes: string | null;
}

/* ------------------------------------------------------------------ */
/* Configurazione degli stati                                          */
/* ------------------------------------------------------------------ */

const STATES: {
  key: AttendanceStatus;
  label: string;
  short: string;
  Icon: typeof Check;
  active: string;
}[] = [
  { key: "present", label: "Presente", short: "P", Icon: Check, active: "bg-emerald-600 text-white ring-emerald-600" },
  { key: "absent", label: "Assente", short: "A", Icon: X, active: "bg-rose-600 text-white ring-rose-600" },
  { key: "justified", label: "Giustificato", short: "G", Icon: CircleSlash, active: "bg-amber-500 text-white ring-amber-500" },
  { key: "injured", label: "Infortunato", short: "I", Icon: HeartPulse, active: "bg-slate-700 text-white ring-slate-700" },
];

const CERT_BADGE: Record<Player["cert_status"], { text: string; cls: string } | null> = {
  valid: null,
  expiring: { text: "Certificato in scadenza", cls: "bg-amber-100 text-amber-800" },
  expired: { text: "Certificato scaduto", cls: "bg-rose-100 text-rose-800" },
  missing: { text: "Certificato mancante", cls: "bg-rose-100 text-rose-800" },
};

/* ------------------------------------------------------------------ */
/* Componente                                                          */
/* ------------------------------------------------------------------ */

export default function RegistroPresenze({
  session,
  players,
  initialAttendance = {},
  initialNotes = {},
  blockExpiredCertificates = false,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(initialAttendance);
  const [notes, setNotes] = useState<Record<string, string>>(initialNotes);
  const [noteOpenFor, setNoteOpenFor] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [saving, setSaving] = useState(false);

  const queue = useRef<Map<string, QueuedWrite>>(new Map());

  /* --- Sincronizzazione ------------------------------------------- */

  const flush = useCallback(async () => {
    if (queue.current.size === 0) return;
    const batch = Array.from(queue.current.values());
    queue.current.clear();
    setSaving(true);
    const { error } = await supabase.from("attendances").upsert(
      batch.map((w) => ({
        session_id: session.id,
        player_id: w.player_id,
        status: w.status,
        notes: w.notes,
      })),
      { onConflict: "session_id,player_id" },
    );
    setSaving(false);
    if (error) {
      // Rimetti in coda: nessun dato perso, si riprova al prossimo giro.
      batch.forEach((w) => queue.current.set(w.player_id, w));
      setOffline(true);
    } else {
      setOffline(false);
    }
  }, [supabase, session.id]);

  useEffect(() => {
    const timer = setInterval(flush, 5000);
    const back = () => void flush();
    window.addEventListener("online", back);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", back);
      void flush();
    };
  }, [flush]);

  /* --- Azioni ------------------------------------------------------ */

  const enqueue = (player_id: string, status: AttendanceStatus, note?: string) => {
    queue.current.set(player_id, {
      player_id,
      status,
      notes: note ?? notes[player_id] ?? null,
    });
  };

  const setStatus = (player_id: string, status: AttendanceStatus) => {
    setAttendance((prev) => ({ ...prev, [player_id]: status }));
    enqueue(player_id, status);
    if (navigator.vibrate) navigator.vibrate(8);
  };

  const markAllPresent = () => {
    const next: Record<string, AttendanceStatus> = { ...attendance };
    players.forEach((p) => {
      next[p.id] = "present";
      enqueue(p.id, "present");
    });
    setAttendance(next);
    void flush();
  };

  const saveNote = (player_id: string, text: string) => {
    setNotes((prev) => ({ ...prev, [player_id]: text }));
    enqueue(player_id, attendance[player_id] ?? "present", text);
    setNoteOpenFor(null);
    void flush();
  };

  const [closed, setClosed] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const closeSession = async () => {
    setSaving(true);
    setCloseError(null);
    await flush();

    const { error } = await supabase
      .from("training_sessions")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", session.id);

    setSaving(false);
    if (error) setCloseError(error.message);
    else setClosed(true);
  };

  /* --- Contatori --------------------------------------------------- */

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, justified: 0, injured: 0, pending: 0 };
    players.forEach((p) => {
      const s = attendance[p.id];
      if (!s) c.pending += 1;
      else c[s] += 1;
    });
    return c;
  }, [attendance, players]);

  const marked = players.length - counts.pending;
  const pct = players.length ? Math.round((counts.present / players.length) * 100) : 0;

  /* --- Render ------------------------------------------------------ */

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Intestazione seduta */}
      <header className="sticky top-0 z-20 bg-[#7B1123] px-4 pb-3 pt-4 text-white shadow-lg">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="font-semibold tracking-tight">{session.team_name}</h1>
            <p className="text-sm text-white/70">
              {new Date(session.session_date).toLocaleDateString("it-IT", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              {" · "}
              {session.start_time} · {session.pitch}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold leading-none tabular-nums text-[#78D5FA]">
              {counts.present}
              <span className="text-lg text-white/50">/{players.length}</span>
            </div>
            <p className="text-xs text-white/60">{pct}% presenti</p>
          </div>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-[#5BC0EB] transition-all duration-300"
            style={{ width: `${players.length ? (marked / players.length) * 100 : 0}%` }}
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={markAllPresent}
            className="flex-1 rounded-xl bg-[#5BC0EB] px-4 py-3 text-sm font-semibold text-[#0F172A] transition active:scale-[0.98]"
          >
            Segna tutti presenti
          </button>
          {offline && (
            <span className="flex items-center gap-1 rounded-lg bg-amber-400/90 px-2 py-2 text-xs font-medium text-amber-950">
              <CloudOff className="h-4 w-4" /> Offline
            </span>
          )}
          {saving && !offline && (
            <span className="rounded-lg bg-white/15 px-2 py-2 text-xs">Salvataggio…</span>
          )}
        </div>
      </header>

      {/* Elenco atleti */}
      <ul className="divide-y divide-slate-200">
        {players.map((player) => {
          const status = attendance[player.id];
          const badge = CERT_BADGE[player.cert_status];
          const blocked =
            blockExpiredCertificates &&
            (player.cert_status === "expired" || player.cert_status === "missing");

          return (
            <li key={player.id} className="bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold tabular-nums text-slate-500">
                  {player.jersey_number ?? "–"}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">
                    {player.last_name} {player.first_name}
                  </p>
                  {badge && (
                    <span className={`mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                      <AlertTriangle className="h-3 w-3" />
                      {badge.text}
                    </span>
                  )}
                  {notes[player.id] && (
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      <FileText className="mr-1 inline h-3 w-3" />
                      {notes[player.id]}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => setNoteOpenFor(player.id)}
                  aria-label={`Nota tecnica su ${player.first_name}`}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <MessageSquare className="h-5 w-5" />
                </button>
              </div>

              {/* Selettore di stato: 4 bersagli da 56px, raggiungibili col pollice */}
              <div className="mt-2 grid grid-cols-4 gap-2" role="group" aria-label={`Stato di ${player.last_name}`}>
                {STATES.map(({ key, label, short, Icon, active }) => {
                  const on = status === key;
                  const disabled = blocked && key === "present";
                  return (
                    <button
                      key={key}
                      disabled={disabled}
                      onClick={() => setStatus(player.id, key)}
                      aria-pressed={on}
                      title={disabled ? "Certificato medico non valido" : label}
                      className={[
                        "flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold ring-1 transition active:scale-95",
                        on ? active : "bg-slate-50 text-slate-500 ring-slate-200",
                        disabled ? "cursor-not-allowed opacity-40" : "",
                      ].join(" ")}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="sr-only">{label}</span>
                      <span aria-hidden>{short}</span>
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Riepilogo e chiusura */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mb-2 flex justify-between text-xs text-slate-500">
          <span>{counts.present} presenti</span>
          <span>{counts.absent} assenti</span>
          <span>{counts.justified} giustificati</span>
          <span>{counts.injured} infortunati</span>
        </div>
                <button
          type="button"
          onClick={closeSession}
          disabled={counts.pending > 0 || closed || saving}
          className="w-full rounded-xl bg-[#7B1123] px-4 py-3.5 font-semibold text-white transition active:scale-[0.99] disabled:bg-slate-300"
        >
          {closed
            ? "Appello inviato in segreteria ✓"
            : saving
              ? "Invio in corso…"
              : counts.pending > 0
                ? `Mancano ${counts.pending} atleti`
                : "Chiudi l'appello"}
        </button>
        {closeError && (
          <p className="mt-2 text-center text-sm text-rose-600">{closeError}</p>
        )}
          className="w-full rounded-xl bg-[#7B1123] px-4 py-3.5 font-semibold text-white transition active:scale-[0.99] disabled:bg-slate-300"
        >
          {counts.pending > 0 ? `Mancano ${counts.pending} atleti` : "Chiudi l'appello"}
        </button>
      </div>

      {/* Nota tecnica (solo staff) */}
      {noteOpenFor && (
        <NoteSheet
          player={players.find((p) => p.id === noteOpenFor)!}
          value={notes[noteOpenFor] ?? ""}
          onClose={() => setNoteOpenFor(null)}
          onSave={(text) => saveNote(noteOpenFor, text)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NoteSheet({
  player,
  value,
  onClose,
  onSave,
}: {
  player: Player;
  value: string;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(value);

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-slate-900/40" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-white p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-slate-800">
          Nota su {player.first_name} {player.last_name}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Visibile solo allo staff tecnico, mai ai genitori.
        </p>
        <textarea
          autoFocus
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Es. ha lavorato a parte, fastidio al ginocchio"
          className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#5BC0EB] focus:ring-2 focus:ring-[#5BC0EB]/30"
        />
        <div className="mt-3 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl bg-slate-100 py-3 font-medium text-slate-600">
            Annulla
          </button>
          <button
            onClick={() => onSave(text.trim())}
            className="flex-1 rounded-xl bg-[#7B1123] py-3 font-semibold text-white"
          >
            Salva nota
          </button>
        </div>
      </div>
    </div>
  );
}
