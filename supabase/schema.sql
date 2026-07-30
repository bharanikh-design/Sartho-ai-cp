create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  location text,
  headline text,
  total_experience_years numeric,
  work_authorisation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.target_lanes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  weight integer not null check (weight between 0 and 100),
  priority integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.career_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employer text not null,
  title text not null,
  location text,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  career_role_id uuid references public.career_roles(id) on delete set null,
  claim text not null,
  context text,
  metrics jsonb not null default '[]'::jsonb,
  domains jsonb not null default '[]'::jsonb,
  source_name text,
  source_locator text,
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  safe_for_resume boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text,
  source_url text,
  employer text,
  title text not null,
  location text,
  raw_description text not null,
  status text not null default 'saved',
  technical_heaviness integer check (technical_heaviness between 0 and 100),
  overall_match integer check (overall_match between 0 and 100),
  recommendation text check (recommendation in ('apply','review','skip')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_requirements (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  requirement_text text not null,
  requirement_type text not null check (requirement_type in ('mandatory','preferred','contextual')),
  category text,
  matched_evidence_ids jsonb not null default '[]'::jsonb,
  assessment text,
  confidence text check (confidence in ('low','medium','high')),
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null default 'saved',
  resume_version text,
  cover_note text,
  submitted_at timestamptz,
  confirmation_reference text,
  next_action text,
  next_action_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.target_lanes enable row level security;
alter table public.career_roles enable row level security;
alter table public.evidence_items enable row level security;
alter table public.jobs enable row level security;
alter table public.job_requirements enable row level security;
alter table public.applications enable row level security;

create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own target lanes" on public.target_lanes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own career roles" on public.career_roles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own evidence" on public.evidence_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own jobs" on public.jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own job requirements" on public.job_requirements for all using (
  exists (select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid())
);
create policy "own applications" on public.applications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
