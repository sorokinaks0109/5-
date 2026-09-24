-- =====================================================================
-- «Идейные игры — Пять вершин». Схема базы данных для Supabase.
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Файл можно запускать повторно: он ничего не удаляет.
--
-- Защита строк (RLS) включена на всех таблицах:
--   * участник видит только свои строки;
--   * жюри видит только работы этапа 5 (без имён) и свои оценки;
--   * организатор видит всё.
-- Записывать в таблицы из браузера нельзя никому: все изменения делает
-- серверная функция «game» после проверки прав и правил игры.
-- =====================================================================

create extension if not exists pgcrypto;

-- Состояние тура (всегда одна строка)
create table if not exists public.tour (
  id int primary key default 1 check (id = 1),
  state text not null default 'draft' check (state in ('draft', 'open', 'closed')),
  opens_at timestamptz,
  closes_at timestamptz,
  results_published boolean not null default false,
  salt text not null default encode(gen_random_bytes(8), 'hex')
);
insert into public.tour (id) values (1) on conflict (id) do nothing;

-- Учётные записи: только код, роль, ник и подразделение. Никаких ФИО, телефонов и почты.
create table if not exists public.accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique,
  role text not null check (role in ('participant', 'jury', 'organizer')),
  number int not null,
  nick text,
  department text,
  created_at timestamptz not null default now()
);
create unique index if not exists accounts_nick_unique
  on public.accounts (lower(nick)) where role = 'participant' and nick is not null;

-- Прохождение этапов. assignment — какие задания выпали (без правильных ответов).
create table if not exists public.stage_runs (
  account_id uuid not null references public.accounts (id) on delete cascade,
  stage int not null check (stage between 1 and 5),
  started_at timestamptz not null,
  deadline timestamptz not null,
  finished_at timestamptz,
  assignment jsonb not null,
  answers jsonb not null default '{}'::jsonb,
  hints jsonb not null default '[]'::jsonb,
  primary key (account_id, stage)
);

-- Идеи этапа 5. work_no — анонимный номер работы для жюри.
create table if not exists public.ideas (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  work_no int not null unique,
  fields jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Оценки жюри
create table if not exists public.idea_scores (
  idea_account_id uuid not null references public.ideas (account_id) on delete cascade,
  jury_id uuid not null references public.accounts (id) on delete cascade,
  scores jsonb not null,
  comment text not null default '',
  updated_at timestamptz not null default now(),
  primary key (idea_account_id, jury_id)
);

-- Роль текущего пользователя берётся из защищённых метаданных Supabase Auth
create or replace function public.app_role() returns text
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

alter table public.tour enable row level security;
alter table public.accounts enable row level security;
alter table public.stage_runs enable row level security;
alter table public.ideas enable row level security;
alter table public.idea_scores enable row level security;

drop policy if exists tour_read on public.tour;
create policy tour_read on public.tour for select to authenticated
  using (public.app_role() = 'organizer');

drop policy if exists accounts_read on public.accounts;
create policy accounts_read on public.accounts for select to authenticated
  using (id = auth.uid() or public.app_role() = 'organizer');

drop policy if exists runs_read on public.stage_runs;
create policy runs_read on public.stage_runs for select to authenticated
  using (account_id = auth.uid() or public.app_role() = 'organizer');

drop policy if exists ideas_read on public.ideas;
create policy ideas_read on public.ideas for select to authenticated
  using (
    account_id = auth.uid()
    or public.app_role() = 'organizer'
    or (public.app_role() = 'jury' and submitted_at is not null)
  );

drop policy if exists scores_read on public.idea_scores;
create policy scores_read on public.idea_scores for select to authenticated
  using (jury_id = auth.uid() or public.app_role() = 'organizer');

-- Анонимным посетителям — ничего
revoke all on public.tour, public.accounts, public.stage_runs, public.ideas, public.idea_scores from anon;
