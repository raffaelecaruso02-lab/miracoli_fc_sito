-- =====================================================================
-- MIRACOLI FC — Scuola Calcio e Settore Giovanile
-- Schema PostgreSQL / Supabase (DDL + Row Level Security)
-- Target: PostgreSQL 15+ con estensione Supabase Auth (schema `auth`)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. TIPI ENUMERATI
-- ---------------------------------------------------------------------
create type user_role             as enum ('admin', 'coach', 'parent');
create type staff_role            as enum ('head_coach', 'assistant', 'athletic_trainer', 'manager');
create type player_status         as enum ('active', 'suspended', 'withdrawn');
create type certificate_type      as enum ('agonistico', 'non_agonistico');
create type attendance_status     as enum ('present', 'absent', 'justified', 'injured');
create type callup_status         as enum ('pending', 'confirmed', 'declined');
create type announcement_priority as enum ('normal', 'urgent');
create type match_venue           as enum ('home', 'away');

-- ---------------------------------------------------------------------
-- 2. UTENTI
-- Le password NON sono gestite qui: l'autenticazione è delegata a
-- Supabase Auth (auth.users). Questa tabella è il profilo applicativo,
-- collegato 1:1 tramite id. Con Firebase vale lo stesso principio
-- (collezione `users` con docId = uid).
-- ---------------------------------------------------------------------
create table public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text        not null unique,
  full_name   text        not null,
  role        user_role   not null default 'parent',
  phone       text,
  avatar_url  text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Profilo creato automaticamente alla registrazione
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'parent')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 3. STAGIONI E GRUPPI SQUADRA
-- ---------------------------------------------------------------------
create table public.seasons (
  id         uuid primary key default gen_random_uuid(),
  label      text    not null unique,          -- es. '2026/2027'
  starts_on  date    not null,
  ends_on    date    not null,
  is_current boolean not null default false,
  check (ends_on > starts_on)
);

create unique index one_current_season
  on public.seasons (is_current) where is_current;

create table public.teams_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,                    -- 'Pulcini 2016 A'
  age_group  text not null,                    -- 'Piccoli Amici' | 'Primi Calci' | 'Pulcini' | 'Esordienti' | 'Agonistica'
  season_id  uuid not null references public.seasons (id) on delete restrict,
  coach_id   uuid references public.users (id) on delete set null,   -- responsabile tecnico
  color_tag  text,                             -- badge di categoria in UI
  created_at timestamptz not null default now(),
  unique (name, season_id)
);

-- Staff assegnato al gruppo: più tecnici/dirigenti per squadra
create table public.team_staff (
  team_id      uuid not null references public.teams_categories (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  role_in_team staff_role not null default 'assistant',
  assigned_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- ---------------------------------------------------------------------
-- 4. ATLETI E TUTORI
-- ---------------------------------------------------------------------
create table public.players (
  id                   uuid primary key default gen_random_uuid(),
  first_name           text not null,
  last_name            text not null,
  birth_date           date not null,
  team_id              uuid references public.teams_categories (id) on delete set null,
  parent_id            uuid references public.users (id) on delete set null, -- tutore principale
  medical_cert_type    certificate_type not null default 'non_agonistico',
  medical_cert_expiry  date,
  jersey_number        smallint check (jersey_number between 1 and 99),
  status               player_status not null default 'active',
  fee_paid_until       date,                   -- quota di iscrizione
  notes                text,                   -- note di segreteria
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (team_id, jersey_number)
);

-- Un atleta può avere due genitori/tutori con accesso all'area riservata
create table public.player_guardians (
  player_id     uuid not null references public.players (id) on delete cascade,
  guardian_id   uuid not null references public.users (id) on delete cascade,
  relationship  text,                          -- 'madre', 'padre', 'tutore'
  is_primary    boolean not null default false,
  primary key (player_id, guardian_id)
);

-- Il tutore principale è sempre anche un guardian
create or replace function public.sync_primary_guardian()
returns trigger language plpgsql as $$
begin
  if new.parent_id is not null then
    insert into public.player_guardians (player_id, guardian_id, is_primary)
    values (new.id, new.parent_id, true)
    on conflict (player_id, guardian_id) do update set is_primary = true;
  end if;
  return new;
end;
$$;

create trigger players_sync_guardian
  after insert or update of parent_id on public.players
  for each row execute function public.sync_primary_guardian();

-- Stato certificato medico calcolato, usato per alert e blocchi
create or replace view public.players_with_cert_status as
select
  p.*,
  case
    when p.medical_cert_expiry is null                        then 'missing'
    when p.medical_cert_expiry <  current_date                then 'expired'
    when p.medical_cert_expiry <= current_date + interval '30 days' then 'expiring'
    else 'valid'
  end as cert_status,
  (p.medical_cert_expiry - current_date) as cert_days_left
from public.players p;

-- ---------------------------------------------------------------------
-- 5. ALLENAMENTI E PRESENZE
-- ---------------------------------------------------------------------
create table public.training_sessions (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams_categories (id) on delete cascade,
  session_date date not null,
  start_time   time not null default '17:00',
  end_time     time,
  pitch        text not null default 'Campo dei Miracoli',
  notes        text,
  created_by   uuid references public.users (id) on delete set null,
  closed_at    timestamptz,                    -- appello chiuso/confermato
  created_at   timestamptz not null default now(),
  unique (team_id, session_date, start_time)
);

create table public.attendances (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  status     attendance_status not null,
  notes      text,                             -- nota tecnica: SOLO staff
  marked_by  uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (session_id, player_id)               -- upsert idempotente dal campo
);

create index attendances_player_idx on public.attendances (player_id);

-- Percentuale di frequenza per atleta (usata in scheda atleta e report)
create or replace view public.player_attendance_stats as
select
  a.player_id,
  ts.team_id,
  date_trunc('month', ts.session_date)::date as month,
  count(*)                                              as sessions_total,
  count(*) filter (where a.status = 'present')          as sessions_present,
  round(100.0 * count(*) filter (where a.status = 'present') / nullif(count(*), 0), 1) as attendance_pct
from public.attendances a
join public.training_sessions ts on ts.id = a.session_id
group by a.player_id, ts.team_id, date_trunc('month', ts.session_date);

-- ---------------------------------------------------------------------
-- 6. GARE E CONVOCAZIONI
-- ---------------------------------------------------------------------
create table public.matches (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.teams_categories (id) on delete cascade,
  opponent         text not null,
  venue            match_venue not null default 'home',
  match_date       date not null,
  meeting_time     time not null,              -- orario di ritrovo
  kickoff_time     time not null,              -- calcio d'inizio
  location_name    text not null default 'Campo dei Miracoli',
  location_address text not null default 'Via Poggio Verde, Roma',
  location_lat     numeric(9,6),
  location_lng     numeric(9,6),
  kit_color        text not null default 'Bordeaux (1ª divisa)',
  notes            text,
  response_deadline timestamptz,               -- scadenza risposta genitori
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  check (kickoff_time >= meeting_time)
);

create index matches_team_date_idx on public.matches (team_id, match_date desc);

create table public.callups (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.matches (id) on delete cascade,
  player_id     uuid not null references public.players (id) on delete cascade,
  parent_status callup_status not null default 'pending',
  response_note text,
  responded_by  uuid references public.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  unique (match_id, player_id)
);

create index callups_player_idx on public.callups (player_id);

-- ---------------------------------------------------------------------
-- 7. BACHECA COMUNICAZIONI
-- ---------------------------------------------------------------------
create table public.team_announcements (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams_categories (id) on delete cascade,
  author_id   uuid references public.users (id) on delete set null,
  title       text not null,
  message     text not null,
  priority    announcement_priority not null default 'normal',
  player_id   uuid references public.players (id) on delete cascade, -- se valorizzato: messaggio al singolo
  created_at  timestamptz not null default now()
);

create index announcements_team_idx on public.team_announcements (team_id, created_at desc);

-- ---------------------------------------------------------------------
-- 8. TRIGGER updated_at
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_touch       before update on public.users       for each row execute function public.touch_updated_at();
create trigger players_touch     before update on public.players     for each row execute function public.touch_updated_at();
create trigger attendances_touch before update on public.attendances for each row execute function public.touch_updated_at();
create trigger callups_touch     before update on public.callups     for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 9. FUNZIONI DI SUPPORTO RLS
-- SECURITY DEFINER per evitare ricorsione fra policy che leggono
-- le stesse tabelle su cui la policy è definita.
-- ---------------------------------------------------------------------
create or replace function public.current_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.users where id = auth.uid()), false);
$$;

create or replace function public.is_staff_of(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.teams_categories t
     where t.id = p_team and t.coach_id = auth.uid()
    union all
    select 1 from public.team_staff s
     where s.team_id = p_team and s.user_id = auth.uid()
  );
$$;

create or replace function public.is_guardian_of(p_player uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.player_guardians g
     where g.player_id = p_player and g.guardian_id = auth.uid()
  );
$$;

create or replace function public.team_of_player(p_player uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.players where id = p_player;
$$;

create or replace function public.team_of_session(p_session uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.training_sessions where id = p_session;
$$;

create or replace function public.team_of_match(p_match uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.matches where id = p_match;
$$;

-- ---------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY
-- Principio: admin vede tutto; lo staff vede solo i propri gruppi;
-- il genitore vede solo i propri figli, e mai le note tecniche.
-- ---------------------------------------------------------------------
alter table public.users              enable row level security;
alter table public.seasons            enable row level security;
alter table public.teams_categories   enable row level security;
alter table public.team_staff         enable row level security;
alter table public.players            enable row level security;
alter table public.player_guardians   enable row level security;
alter table public.training_sessions  enable row level security;
alter table public.attendances        enable row level security;
alter table public.matches            enable row level security;
alter table public.callups            enable row level security;
alter table public.team_announcements enable row level security;

-- --- users -----------------------------------------------------------
create policy users_self_read on public.users
  for select using (id = auth.uid() or public.is_admin());

create policy users_self_update on public.users
  for update using (id = auth.uid()) with check (id = auth.uid() and role = public.current_role());

create policy users_admin_all on public.users
  for all using (public.is_admin()) with check (public.is_admin());

-- --- seasons / teams -------------------------------------------------
create policy seasons_read on public.seasons
  for select using (auth.uid() is not null);

create policy seasons_admin on public.seasons
  for all using (public.is_admin()) with check (public.is_admin());

create policy teams_read on public.teams_categories
  for select using (auth.uid() is not null);

create policy teams_admin on public.teams_categories
  for all using (public.is_admin()) with check (public.is_admin());

create policy team_staff_read on public.team_staff
  for select using (public.is_admin() or user_id = auth.uid() or public.is_staff_of(team_id));

create policy team_staff_admin on public.team_staff
  for all using (public.is_admin()) with check (public.is_admin());

-- --- players ---------------------------------------------------------
create policy players_read on public.players
  for select using (
    public.is_admin()
    or public.is_staff_of(team_id)
    or public.is_guardian_of(id)
  );

create policy players_admin_write on public.players
  for all using (public.is_admin()) with check (public.is_admin());

create policy player_guardians_read on public.player_guardians
  for select using (
    public.is_admin()
    or guardian_id = auth.uid()
    or public.is_staff_of(public.team_of_player(player_id))
  );

create policy player_guardians_admin on public.player_guardians
  for all using (public.is_admin()) with check (public.is_admin());

-- --- allenamenti -----------------------------------------------------
create policy sessions_read on public.training_sessions
  for select using (
    public.is_admin()
    or public.is_staff_of(team_id)
    or exists (
      select 1 from public.players p
       where p.team_id = training_sessions.team_id
         and public.is_guardian_of(p.id)
    )
  );

create policy sessions_staff_write on public.training_sessions
  for all using (public.is_admin() or public.is_staff_of(team_id))
  with check (public.is_admin() or public.is_staff_of(team_id));

-- Le note tecniche sono riservate: il genitore legge le presenze del
-- proprio figlio tramite la vista `my_child_attendance` (senza `notes`),
-- non direttamente dalla tabella.
create policy attendances_staff_read on public.attendances
  for select using (
    public.is_admin() or public.is_staff_of(public.team_of_session(session_id))
  );

create policy attendances_staff_write on public.attendances
  for all using (
    public.is_admin() or public.is_staff_of(public.team_of_session(session_id))
  ) with check (
    public.is_admin() or public.is_staff_of(public.team_of_session(session_id))
  );

create or replace view public.my_child_attendance
with (security_invoker = off) as
select a.session_id, a.player_id, a.status, ts.session_date, ts.pitch, ts.team_id
from public.attendances a
join public.training_sessions ts on ts.id = a.session_id
where public.is_guardian_of(a.player_id)
   or public.is_admin()
   or public.is_staff_of(ts.team_id);

-- --- gare e convocazioni ---------------------------------------------
create policy matches_read on public.matches
  for select using (
    public.is_admin()
    or public.is_staff_of(team_id)
    or exists (
      select 1 from public.callups c
       where c.match_id = matches.id and public.is_guardian_of(c.player_id)
    )
  );

create policy matches_staff_write on public.matches
  for all using (public.is_admin() or public.is_staff_of(team_id))
  with check (public.is_admin() or public.is_staff_of(team_id));

create policy callups_read on public.callups
  for select using (
    public.is_admin()
    or public.is_staff_of(public.team_of_match(match_id))
    or public.is_guardian_of(player_id)
  );

create policy callups_staff_write on public.callups
  for all using (
    public.is_admin() or public.is_staff_of(public.team_of_match(match_id))
  ) with check (
    public.is_admin() or public.is_staff_of(public.team_of_match(match_id))
  );

-- Il genitore può SOLO rispondere alla convocazione del proprio figlio
create policy callups_parent_respond on public.callups
  for update using (public.is_guardian_of(player_id))
  with check (public.is_guardian_of(player_id));

-- Blocca la modifica di campi non consentiti al genitore
create or replace function public.guard_callup_parent_update()
returns trigger language plpgsql as $$
begin
  if public.is_admin() or public.is_staff_of(public.team_of_match(new.match_id)) then
    return new;
  end if;
  if new.match_id is distinct from old.match_id
     or new.player_id is distinct from old.player_id then
    raise exception 'Il tutore può aggiornare solo la propria risposta alla convocazione';
  end if;
  new.responded_by := auth.uid();
  return new;
end;
$$;

create trigger callups_guard_parent
  before update on public.callups
  for each row execute function public.guard_callup_parent_update();

-- --- bacheca ---------------------------------------------------------
create policy announcements_read on public.team_announcements
  for select using (
    public.is_admin()
    or public.is_staff_of(team_id)
    or (
      player_id is null and exists (
        select 1 from public.players p
         where p.team_id = team_announcements.team_id and public.is_guardian_of(p.id)
      )
    )
    or (player_id is not null and public.is_guardian_of(player_id))
  );

create policy announcements_staff_write on public.team_announcements
  for all using (public.is_admin() or public.is_staff_of(team_id))
  with check (public.is_admin() or public.is_staff_of(team_id));

-- ---------------------------------------------------------------------
-- 11. REPORT SEGRETERIA (export mensile presenze)
-- ---------------------------------------------------------------------
create or replace function public.monthly_attendance_report(p_team uuid, p_month date)
returns table (
  atleta text,
  categoria text,
  allenamenti int,
  presenze int,
  assenze int,
  giustificate int,
  infortuni int,
  frequenza_pct numeric,
  certificato date
)
language sql stable security definer set search_path = public as $$
  select
    p.last_name || ' ' || p.first_name,
    t.name,
    count(a.id)::int,
    count(*) filter (where a.status = 'present')::int,
    count(*) filter (where a.status = 'absent')::int,
    count(*) filter (where a.status = 'justified')::int,
    count(*) filter (where a.status = 'injured')::int,
    round(100.0 * count(*) filter (where a.status = 'present') / nullif(count(a.id), 0), 1),
    p.medical_cert_expiry
  from public.players p
  join public.teams_categories t on t.id = p.team_id
  left join public.attendances a on a.player_id = p.id
  left join public.training_sessions ts on ts.id = a.session_id
   and date_trunc('month', ts.session_date) = date_trunc('month', p_month)
  where p.team_id = p_team
    and (public.is_admin() or public.is_staff_of(p_team))
  group by p.id, p.last_name, p.first_name, t.name, p.medical_cert_expiry
  order by p.last_name;
$$;

-- Atleti con certificato scaduto o in scadenza entro 30 giorni
create or replace view public.certificates_alert as
select id, first_name, last_name, team_id, medical_cert_type,
       medical_cert_expiry, cert_status, cert_days_left
from public.players_with_cert_status
where cert_status in ('missing', 'expired', 'expiring')
  and status = 'active';
