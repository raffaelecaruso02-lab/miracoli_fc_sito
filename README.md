# Miracoli FC — gestionale scuola calcio

Web app per l'appello a bordo campo, le convocazioni alle gare e le
comunicazioni alle famiglie. Next.js (App Router) + Supabase.

Questo archivio **non è un progetto Next.js completo**: contiene il codice,
non le dipendenze né i file di configurazione, che cambiano a ogni versione
di Next. Si crea prima un progetto pulito e poi ci si versa dentro questo
contenuto. Sotto c'è la procedura, passo per passo.

---

## 1. Crea il progetto vuoto

Serve Node 18.18 o superiore (`node -v` per controllare).

```bash
npx create-next-app@latest miracoli-fc
```

Rispondi così alle domande:

| Domanda | Risposta |
|---|---|
| TypeScript | **Yes** |
| ESLint | Yes |
| Tailwind CSS | **Yes** |
| `src/` directory | **No** |
| App Router | **Yes** |
| Turbopack | Yes |
| Import alias | **No** (lascia il predefinito `@/*`) |

Le tre risposte in grassetto contano: se sbagli quelle, i percorsi dei file
di questo archivio non corrispondono.

## 2. Versa dentro il contenuto dell'archivio

Scompatta lo zip e copia **tutto quello che c'è dentro la cartella
`miracoli-fc/`** dentro il progetto appena creato, sovrascrivendo quando
te lo chiede (`app/layout.tsx`, `app/page.tsx` e `app/globals.css` vanno
sostituiti: sono quelli di esempio di Next).

```bash
cp -r miracoli-fc/. /percorso/del/tuo/miracoli-fc/
```

## 3. Installa le dipendenze aggiuntive

```bash
cd miracoli-fc
npm install @supabase/supabase-js @supabase/ssr lucide-react
```

## 4. Crea il database su Supabase

1. Vai su [supabase.com](https://supabase.com), crea un account e un nuovo
   progetto. Scegli come regione **Frankfurt** o **Milan**: sono le più
   vicine, e sulla latenza a bordo campo si sente.
2. Annota la password del database che ti fa scegliere (non serve subito,
   ma recuperarla dopo è una seccatura).
3. Apri la sezione **SQL Editor** → **New query**.
4. Incolla tutto il contenuto di `supabase/migrations/0001_init.sql` e
   premi **Run**. Deve girare in un colpo solo: l'ordine delle istruzioni
   è già quello giusto.

Se il progetto è nuovo non dovresti avere errori. Se ne compare uno su un
tipo già esistente, il file è stato eseguito due volte: cancella lo schema
e ripeti.

## 5. Collega le chiavi

In Supabase apri **Project Settings → API** e copia i due valori.
Nel progetto, rinomina `.env.local.example` in `.env.local` e incollali:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

La `anon key` è pubblica per progetto ed è normale che finisca nel browser:
a proteggere i dati sono le policy RLS, non il segreto della chiave.
La `service_role key` invece non deve entrare **mai** in una variabile che
inizia per `NEXT_PUBLIC_`, né finire su Git.

## 6. Avvia

```bash
npm run dev
```

Apri `http://localhost:3000`. Vedi la pagina della società con il pulsante
di accesso: significa che tutto è al suo posto.

## 7. Crea il primo utente e diventa amministratore

1. Vai su `/login`, inserisci la tua email e chiedi il link di accesso.
   In sviluppo la mail arriva dal servizio di prova di Supabase; se non la
   trovi, la leggi da **Authentication → Users** oppure dai log.
2. Una volta registrato, torna nello SQL Editor e lancia:

   ```sql
   update public.users set role = 'admin' where email = 'tua@email.it';
   ```

3. Fai logout e login di nuovo: adesso atterri in `/segreteria`.

## 8. Metti dentro dei dati di prova

Sempre dallo SQL Editor, così vedi subito se le policy ti lasciano passare:

```sql
-- stagione corrente
insert into seasons (label, starts_on, ends_on, is_current)
values ('2026/2027', '2026-09-01', '2027-06-30', true);

-- un gruppo squadra, con te come responsabile tecnico
insert into teams_categories (name, age_group, season_id, coach_id)
select 'Pulcini 2016 — Gruppo A', 'Pulcini', s.id, u.id
from seasons s, users u
where s.is_current and u.email = 'tua@email.it';

-- quattro atleti
insert into players (first_name, last_name, birth_date, team_id, jersey_number, medical_cert_expiry)
select v.nome, v.cognome, v.nato, t.id, v.numero, v.cert
from teams_categories t,
(values
  ('Leonardo','Bianchi',  date '2016-03-12', 7,  date '2027-05-01'),
  ('Mattia',  'Caruso',   date '2016-07-04', 11, date '2026-10-05'),
  ('Riccardo','D''Amico', date '2016-01-30', 4,  date '2027-02-20'),
  ('Tommaso', 'Ferrara',  date '2016-11-09', 2,  date '2026-08-01')
) as v(nome, cognome, nato, numero, cert)
where t.name = 'Pulcini 2016 — Gruppo A';
```

Ora vai su `/squadra`: vedi il gruppo, premi «Fai l'appello di oggi» e ti
ritrovi il registro presenze. Ferrara comparirà segnalato in rosso, perché
il suo certificato è scaduto.

> Se la lista delle squadre è vuota ma non ci sono errori, quasi sempre è
> RLS: vuol dire che il tuo utente non risulta `coach_id` di quel gruppo
> né presente in `team_staff`. È il comportamento giusto, non un bug.

## 9. Pubblica online

```bash
git init && git add -A && git commit -m "Miracoli FC"
```

Crea una repo su GitHub, fai push, poi su [vercel.com](https://vercel.com)
importa la repo. In **Environment Variables** incolla le stesse due righe
del `.env.local`, e pubblica. Il dominio (`miracolifc.it`) lo colleghi da
Vercel → Domains. Il piano gratuito di Vercel e Supabase regge
tranquillamente una scuola calcio.

---

## Cosa c'è dentro

```
app/
  layout.tsx                     impostazioni globali, font, PWA
  page.tsx                       pagina pubblica della società
  login/page.tsx                 accesso con magic link o password
  auth/callback/route.ts         chiude il giro del magic link
  (coach)/squadra/               area tecnica: squadre e appello
  (parent)/famiglia/             area famiglia: convocazioni e bacheca
  (admin)/segreteria/            cruscotto certificati
components/
  RegistroPresenze.tsx           appello mobile con coda offline
  CardConvocazione.tsx           card gara con conferma in un tocco
lib/supabase/
  client.ts / server.ts          accesso al database, browser e server
middleware.ts                    rinnovo sessione e instradamento per ruolo
public/manifest.json             installazione come app sullo smartphone
supabase/migrations/0001_init.sql  schema completo con RLS
```

Le cartelle fra parentesi — `(coach)`, `(parent)`, `(admin)` — non
compaiono nell'URL: servono solo a dare a ciascun ruolo una barra di
navigazione diversa. L'indirizzo resta `/squadra`, `/famiglia`,
`/segreteria`.

## Cosa manca ancora

- Creazione gara e selezione convocati dall'area tecnica
- Invio della comunicazione in bacheca e condivisione su WhatsApp
- Anagrafiche e quote nell'area segreteria, con export Excel
- Service worker per l'uso offline vero (il manifest c'è già)
- Icone PWA in `public/icons/` (192, 512 e 512 maskable)
