// Cruscotto di segreteria: parte dai certificati, che sono l'unica cosa
// che può bloccare un atleta il sabato mattina.

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ETICHETTA: Record<string, string> = {
  missing: "Mancante",
  expired: "Scaduto",
  expiring: "In scadenza",
};

export default async function SegreteriaPage() {
  const supabase = await createClient();

  const { data: alerts } = await supabase
    .from("certificates_alert")
    .select("id, first_name, last_name, medical_cert_expiry, cert_status, cert_days_left")
    .order("cert_days_left", { nullsFirst: true });

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="text-lg font-semibold text-slate-800">Segreteria</h1>

      <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <h2 className="font-medium text-slate-800">Certificati medici da sistemare</h2>

        {(alerts ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Tutti i certificati sono in regola.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {(alerts ?? []).map((a: any) => (
              <li key={a.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-700">
                  {a.last_name} {a.first_name}
                </span>
                <span
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    a.cert_status === "expiring"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {ETICHETTA[a.cert_status]}
                  {a.medical_cert_expiry &&
                    ` · ${new Date(a.medical_cert_expiry).toLocaleDateString("it-IT")}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
