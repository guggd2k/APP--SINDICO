create table if not exists public.daily_visits (
  id uuid primary key default gen_random_uuid(),
  condo_id uuid not null references public.condos(id) on delete cascade,
  visited_at timestamptz not null default now(),
  responsible text not null check (length(trim(responsible)) between 1 and 160),
  activities text[] not null default '{}',
  checked_areas text[] not null default '{}',
  attention_areas text[] not null default '{}',
  notes text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  photo_paths text[] not null default '{}'
);

alter table public.daily_visits
  add column if not exists photo_paths text[] not null default '{}';
alter table public.maintenance_requests
  add column if not exists scheduled_at timestamptz not null default now(),
  add column if not exists duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  add column if not exists photo_paths text[] not null default '{}';

create index if not exists daily_visits_condo_date_idx
  on public.daily_visits (condo_id, visited_at desc);
create index if not exists maintenance_condo_schedule_idx
  on public.maintenance_requests (condo_id, scheduled_at);

alter table public.daily_visits enable row level security;

drop policy if exists "Members can read daily visits" on public.daily_visits;
drop policy if exists "Members can register daily visits" on public.daily_visits;
drop policy if exists "Members can update daily visits" on public.daily_visits;
drop policy if exists "Managers can delete daily visits" on public.daily_visits;

create policy "Members can read daily visits"
  on public.daily_visits for select to authenticated
  using (public.is_condo_member(condo_id));
create policy "Members can register daily visits"
  on public.daily_visits for insert to authenticated
  with check (public.is_condo_member(condo_id) and created_by = (select auth.uid()));
create policy "Members can update daily visits"
  on public.daily_visits for update to authenticated
  using (public.is_condo_member(condo_id))
  with check (public.is_condo_member(condo_id));
create policy "Managers can delete daily visits"
  on public.daily_visits for delete to authenticated
  using (public.is_condo_manager(condo_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'condo-record-photos',
  'condo-record-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'image/bmp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Condo members can read record photos" on storage.objects;
drop policy if exists "Condo members can upload record photos" on storage.objects;
drop policy if exists "Uploaders can remove their record photos" on storage.objects;

create policy "Condo members can read record photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'condo-record-photos'
    and public.is_condo_member(((storage.foldername(name))[1])::uuid)
  );
create policy "Condo members can upload record photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'condo-record-photos'
    and public.is_condo_member(((storage.foldername(name))[1])::uuid)
  );
create policy "Uploaders can remove their record photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'condo-record-photos'
    and owner_id = (select auth.uid()::text)
    and public.is_condo_member(((storage.foldername(name))[1])::uuid)
  );
