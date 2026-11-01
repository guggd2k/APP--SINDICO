create table if not exists public.condo_due_items (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null,
  condo_id uuid not null references public.condos(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '',
  due_date date not null,
  recurrence text not null check (recurrence in ('once', 'semiannual', 'annual', 'biennial', 'triennial')),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  pdf_path text,
  pdf_name text,
  paid_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check ((pdf_path is null) = (pdf_name is null))
);

create index if not exists condo_due_items_condo_date_idx
  on public.condo_due_items (condo_id, due_date);
create index if not exists condo_due_items_series_idx
  on public.condo_due_items (series_id, due_date);

alter table public.condo_due_items enable row level security;

drop policy if exists "Members can read condo due items" on public.condo_due_items;
drop policy if exists "Members can create condo due items" on public.condo_due_items;
drop policy if exists "Members can update condo due items" on public.condo_due_items;
drop policy if exists "Managers can delete condo due items" on public.condo_due_items;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'condo-due-documents',
  'condo-due-documents',
  false,
  15728640,
  array['application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Condo members can read due documents" on storage.objects;
drop policy if exists "Condo members can upload due documents" on storage.objects;
drop policy if exists "Uploaders can remove due documents" on storage.objects;

create policy "Condo members can read due documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'condo-due-documents'
    and public.is_condo_member(((storage.foldername(name))[1])::uuid)
  );
create policy "Condo members can upload due documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'condo-due-documents'
    and public.is_condo_member(((storage.foldername(name))[1])::uuid)
    and lower(storage.extension(name)) = 'pdf'
  );
create policy "Uploaders can remove due documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'condo-due-documents'
    and owner_id = (select auth.uid()::text)
    and public.is_condo_member(((storage.foldername(name))[1])::uuid)
  );

create policy "Members can read condo due items"
  on public.condo_due_items for select to authenticated
  using (public.is_condo_member(condo_id));
create policy "Members can create condo due items"
  on public.condo_due_items for insert to authenticated
  with check (public.is_condo_member(condo_id) and created_by = (select auth.uid()));
create policy "Members can update condo due items"
  on public.condo_due_items for update to authenticated
  using (public.is_condo_member(condo_id))
  with check (public.is_condo_member(condo_id));
create policy "Managers can delete condo due items"
  on public.condo_due_items for delete to authenticated
  using (public.is_condo_manager(condo_id));

grant select, insert, update, delete on public.condo_due_items to authenticated;
revoke all on public.condo_due_items from anon;
  