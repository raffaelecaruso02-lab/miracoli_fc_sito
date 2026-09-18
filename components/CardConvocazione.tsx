"use client";

/**
 * MIRACOLI FC — Card Convocazione (area riservata famiglia)
 * ---------------------------------------------------------------
 * Un genitore apre la notifica in coda al supermercato e deve
 * rispondere in un tocco. Tutto il resto è contorno.
 *
 * Scelte progettuali:
 *  - Una sola domanda per schermata: "ci sarà o no?".
 *  - L'orario di RITROVO è il dato dominante, non il calcio d'inizio:
 *    è quello che il genitore deve segnare in agenda.
 *  - Aggiornamento ottimistico con rollback: la risposta appare subito,
 *    se la rete fallisce lo stato torna indietro con un messaggio.
 *  - "Segnala assenza" apre la motivazione facoltativa, non la impone.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  CheckCircle2,
  Clock,
  MapPin,
  Navigation,
  Shirt,
  StickyNote,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */

export type CallupStatus = "pending" | "confirmed" | "declined";

export interface CallupMatch {
  id: string;
  opponent: string;
  venue: "home" | "away";
  match_date: string; // ISO date
  meeting_time: string; // 'HH:MM'
  kickoff_time: string; // 'HH:MM'
  location_name: string;
  location_address: string;
  kit_color: string;
  notes: string | null;
  response_deadline: string | null; // ISO datetime
}

interface Props {
  callupId: string;
  match: CallupMatch;
  playerName: string;
  teamName: string;
  initialStatus: CallupStatus;
  initialNote?: string | null;
}

/* ------------------------------------------------------------------ */

export default function CardConvocazione({
  callupId,
  match,
  playerName,
  teamName,
  initialStatus,
  initialNote = null,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [status, setStatus] = useState<CallupStatus>(initialStatus);
  const [note, setNote] = useState<string>(initialNote ?? "");
  const [askingReason, setAskingReason] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const deadlinePassed = match.response_deadline
    ? new Date(match.response_deadline) < new Date()
    : false;

  const matchDay = new Date(`${match.match_date}T${match.kickoff_time}`);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${match.location_name}, ${match.location_address}`,
  )}`;

  async function respond(next: CallupStatus, reason?: string) {
    const previous = status;
    setStatus(next); // ottimistico
    setBusy(true);
    setError(null);

    const { error: err } = await supabase
      .from("callups")
      .update({ parent_status: next, response_note: reason ?? null })
      .eq("id", callupId);

    setBusy(false);
    if (err) {
      setStatus(previous);
      setError("Risposta non inviata. Controlla la connessione e riprova.");
      return;
    }
    if (reason !== undefined) setNote(reason ?? "");
    setAskingReason(false);
  }

  /* --- Render ------------------------------------------------------ */

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      {/* Testata gara */}
      <header className="bg-[#7B1123] px-5 py-4 text-white">
        <p className="text-xs uppercase tracking-wide text-[#78D5FA]">
          {teamName} · {match.venue === "home" ? "In casa" : "In trasferta"}
        </p>
        <h2 className="mt-1 text-xl font-bold leading-tight">
          Miracoli FC — {match.opponent}
        </h2>
        <p className="mt-1 text-sm text-white/75">
          {matchDay.toLocaleDateString("it-IT", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </header>

      {/* Ritrovo: il dato che serve davvero */}
      <div className="flex items-center gap-4 border-b border-slate-100 bg-[#F8FAFC] px-5 py-4">
        <div>
          <p className="text-xs font-medium text-slate-500">Ritrovo</p>
          <p className="text-3xl font-bold tabular-nums text-[#7B1123]">
            {match.meeting_time}
          </p>
        </div>
        <div className="h-10 w-px bg-slate-200" />
        <div>
          <p className="text-xs font-medium text-slate-500">Calcio d'inizio</p>
          <p className="text-xl font-semibold tabular-nums text-slate-700">
            {match.kickoff_time}
          </p>
        </div>
      </div>

      {/* Dettagli */}
      <dl className="space-y-3 px-5 py-4 text-sm">
        <Row icon={<MapPin className="h-4 w-4" />} label="Campo">
          <span className="text-slate-700">{match.location_name}</span>
          <span className="block text-slate-500">{match.location_address}</span>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 font-medium text-[#0E7FAE]"
          >
            <Navigation className="h-3.5 w-3.5" /> Apri in Google Maps
          </a>
        </Row>

        <Row icon={<Shirt className="h-4 w-4" />} label="Divisa">
          <span className="text-slate-700">{match.kit_color}</span>
        </Row>

        {match.notes && (
          <Row icon={<StickyNote className="h-4 w-4" />} label="Nota del mister">
            <span className="text-slate-700">{match.notes}</span>
          </Row>
        )}

        {match.response_deadline && status === "pending" && (
          <Row icon={<Clock className="h-4 w-4" />} label="Rispondi entro">
            <span className={deadlinePassed ? "text-rose-600" : "text-slate-700"}>
              {new Date(match.response_deadline).toLocaleString("it-IT", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </Row>
        )}
      </dl>

      {/* Risposta */}
      <div className="border-t border-slate-100 px-5 py-4">
        {status === "pending" && !askingReason && (
          <>
            <p className="mb-3 text-sm text-slate-600">
              {playerName} sarà presente alla gara?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                disabled={busy}
                onClick={() => respond("confirmed")}
                className="flex h-14 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
              >
                <CheckCircle2 className="h-5 w-5" /> Conferma presenza
              </button>
              <button
                disabled={busy}
                onClick={() => setAskingReason(true)}
                className="flex h-14 items-center justify-center gap-2 rounded-xl bg-white font-semibold text-rose-600 ring-1 ring-rose-200 transition active:scale-[0.98] disabled:opacity-60"
              >
                <XCircle className="h-5 w-5" /> Segnala assenza
              </button>
            </div>
          </>
        )}

        {askingReason && (
          <div>
            <label htmlFor="reason" className="text-sm font-medium text-slate-700">
              Motivo dell'assenza <span className="font-normal text-slate-400">(facoltativo)</span>
            </label>
            <textarea
              id="reason"
              autoFocus
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Es. impegno familiare"
              className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#5BC0EB] focus:ring-2 focus:ring-[#5BC0EB]/30"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setAskingReason(false)}
                className="flex-1 rounded-xl bg-slate-100 py-3 font-medium text-slate-600"
              >
                Torna indietro
              </button>
              <button
                disabled={busy}
                onClick={() => respond("declined", note.trim() || undefined)}
                className="flex-1 rounded-xl bg-rose-600 py-3 font-semibold text-white disabled:opacity-60"
              >
                Invia assenza
              </button>
            </div>
          </div>
        )}

        {status !== "pending" && !askingReason && (
          <Answered
            status={status}
            note={note}
            playerName={playerName}
            onChange={() => setStatus("pending")}
            match={match}
          />
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */

function Answered({
  status,
  note,
  playerName,
  onChange,
  match,
}: {
  status: CallupStatus;
  note: string;
  playerName: string;
  onChange: () => void;
  match: CallupMatch;
}) {
  const confirmed = status === "confirmed";

  return (
    <div
      className={`rounded-xl px-4 py-3 ${
        confirmed ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"
      }`}
    >
      <p className="flex items-center gap-2 font-semibold">
        {confirmed ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
        {confirmed ? `${playerName} è convocato e confermato` : `Assenza segnalata`}
      </p>
      {confirmed && (
        <p className="mt-1 text-sm">
          Ritrovo alle {match.meeting_time} a {match.location_name}.
        </p>
      )}
      {!confirmed && note && <p className="mt-1 text-sm">Motivo: {note}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {confirmed && (
          <a
            href={buildIcs(match, playerName)}
            download={`convocazione-${match.match_date}.ics`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200"
          >
            <CalendarPlus className="h-4 w-4" /> Aggiungi al calendario
          </a>
        )}
        <button
          onClick={onChange}
          className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200"
        >
          Cambia risposta
        </button>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium text-slate-500">{label}</dt>
        <dd className="mt-0.5">{children}</dd>
      </div>
    </div>
  );
}

/* Evento calendario generato lato client, senza dipendenze. */
function buildIcs(match: CallupMatch, playerName: string) {
  const stamp = (d: string, t: string) => `${d.replace(/-/g, "")}T${t.replace(":", "")}00`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Miracoli FC//Convocazioni//IT",
    "BEGIN:VEVENT",
    `UID:${match.id}@miracolifc.it`,
    `DTSTART:${stamp(match.match_date, match.meeting_time)}`,
    `DTEND:${stamp(match.match_date, match.kickoff_time)}`,
    `SUMMARY:Gara ${playerName} — Miracoli FC vs ${match.opponent}`,
    `LOCATION:${match.location_name}, ${match.location_address}`,
    `DESCRIPTION:Ritrovo ore ${match.meeting_time}. Divisa: ${match.kit_color}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}
