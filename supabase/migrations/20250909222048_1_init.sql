
BEGIN;

create extension if not exists "pgcrypto";

-- 1) Links (the short linker)
create table if not exists public.links (
  id         text primary key, 
  original   text not null check (original ~* '^https?://'),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  meta       jsonb not null default '{}'
);
create index if not exists idx_links_created_by on public.links(created_by);

-- 2) Jobs (one per processed HTML)
create table if not exists public.html_jobs (
  id         uuid primary key default gen_random_uuid(),
  filename   text,
  bytes_in   integer not null,
  bytes_out  integer not null,
  link_count integer not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_jobs_created_by on public.html_jobs(created_by);

-- 3) Job→Link mapping
create table if not exists public.html_links (
  job_id   uuid references public.html_jobs(id) on delete cascade,
  link_id  text references public.links(id),
  original text not null,
  created_at timestamptz not null default now(),
  primary key (job_id, link_id)
);

-- 4) Optional click analytics (append-only)
create table if not exists public.click_events (
  id       bigserial primary key,
  link_id  text references public.links(id),
  ts       timestamptz not null default now(),
  ua       text,
  ip_hash  text,
  referer  text
);
create index if not exists idx_clicks_link_ts on public.click_events(link_id, ts);

-- RLS
alter table public.links enable row level security;
alter table public.html_jobs enable row level security;
alter table public.html_links enable row level security;
alter table public.click_events enable row level security;

-- Policies
create policy "links_owner_read" on public.links
for select using (auth.uid() = created_by);
create policy "links_owner_write" on public.links
for insert with check (auth.uid() = created_by);

create policy "jobs_owner_read" on public.html_jobs
for select using (auth.uid() = created_by);
create policy "jobs_owner_write" on public.html_jobs
for insert with check (auth.uid() = created_by);

create policy "map_owner_read" on public.html_links
for select using (
  exists(
    select 1 from public.html_jobs j
    where j.id = html_links.job_id and j.created_by = auth.uid()
  )
);
create policy "map_owner_write" on public.html_links
for insert with check (
  exists(
    select 1 from public.html_jobs j
    where j.id = html_links.job_id and j.created_by = auth.uid()
  )
);

-- Allow anonymous insert for click logging
create policy "clicks_any_insert" on public.click_events
for insert to anon with check (true);

COMMIT;
