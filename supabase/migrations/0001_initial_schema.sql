create extension if not exists pgcrypto;

create type public.condo_role as enum ('manager', 'maintenance');
create type public.maintenance_status as enum ('open', 'in_progress', 'done');
create type public.maintenance_priority as enum ('low', 'medium', 'high');
create type public.stock_category as enum ('cleaning', 'maintenance');
create type public.stock_movement_type as enum ('in', 'out');

create table public.condos (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  address text not null default '',
  created_at timestamptz not null default now()
);

create table public.condo_members (
  condo_id uuid not null references public.condos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.condo_role not null,
  created_at timestamptz not null default now(),
  primary key (condo_id, user_id)
);

create table public.daily_visits (
  id uuid primary key default gen_random_uuid(),
  condo_id uuid not null references public.condos(id) on delete cascade,
  visited_at timestamptz not null default now(),
  responsible text not null check (length(trim(responsible)) between 1 and 160),
  activities text[] not null default '{}',
  checked_areas text[] not null default '{}',
  attention_areas text[] not null default '{}',
  notes text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.daily_visits
  add column photo_paths text[] not null default '{}';

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  condo_id uuid not null references public.condos(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  location text not null default '',
  assignee text not null default '',
  priority public.maintenance_priority not null default 'medium',
  status public.maintenance_status not null default 'open',
  due_date date,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.maintenance_requests
  add column photo_paths text[] not null default '{}';

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  condo_id uuid not null references public.condos(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  category public.stock_category not null,
  unit text not null default 'un.',
  quantity integer not null default 0 check (quantity >= 0),
  minimum_quantity integer not null default 0 check (minimum_quantity >= 0),
  created_at timestamptz not null default now(),
  unique (condo_id, name),
  unique (id, condo_id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  condo_id uuid not null references public.condos(id) on delete cascade,
  item_id uuid not null,
  movement_type public.stock_movement_type not null,
  quantity integer not null check (quantity > 0),
  note text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (item_id, condo_id) references public.stock_items(id, condo_id) on delete cascade
);

create index daily_visits_condo_date_idx on public.daily_visits (condo_id, visited_at desc);
create index maintenance_condo_schedule_idx on public.maintenance_requests (condo_id, scheduled_at);
create index maintenance_condo_status_idx on public.maintenance_requests (condo_id, status, due_date);
create index stock_items_condo_category_idx on public.stock_items (condo_id, category);
create index stock_movements_condo_created_idx on public.stock_movements (condo_id, created_at desc);

create function public.is_condo_member(target_condo uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.condo_members m
    where m.condo_id = target_condo
      and m.user_id = (select auth.uid())
  );
$$;

create function public.is_condo_manager(target_condo uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.condo_members m
    where m.condo_id = target_condo
      and m.user_id = (select auth.uid())
      and m.role = 'manager'
  );
$$;

create function public.create_condo_for_current_user(condo_name text, condo_address text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_condo_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(coalesce(condo_name, ''))) not between 2 and 120 then
    raise exception 'Condo name must contain between 2 and 120 characters';
  end if;
  insert into public.condos (name, address)
  values (trim(condo_name), coalesce(trim(condo_address), ''))
  returning id into created_condo_id;
  insert into public.condo_members (condo_id, user_id, role)
  values (created_condo_id, auth.uid(), 'manager');
  return created_condo_id;
end;
$$;

revoke all on function public.is_condo_member(uuid) from public;
revoke all on function public.is_condo_manager(uuid) from public;
revoke all on function public.create_condo_for_current_user(text, text) from public;
grant execute on function public.is_condo_member(uuid) to authenticated;
grant execute on function public.is_condo_manager(uuid) to authenticated;
grant execute on function public.create_condo_for_current_user(text, text) to authenticated;

alter table public.condos enable row level security;
alter table public.condo_members enable row level security;
alter table public.daily_visits enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;

revoke insert, update on public.stock_items from authenticated;
grant insert (condo_id, name, category, unit, minimum_quantity)
  on public.stock_items to authenticated;
grant update (name, category, unit, minimum_quantity)
  on public.stock_items to authenticated;

create policy "Members can read their condos"
  on public.condos for select to authenticated
  using (public.is_condo_member(id));
create policy "Managers can update their condos"
  on public.condos for update to authenticated
  using (public.is_condo_manager(id))
  with check (public.is_condo_manager(id));
create policy "Managers can delete their condos"
  on public.condos for delete to authenticated
  using (public.is_condo_manager(id));

create policy "Members can read memberships in their condos"
  on public.condo_members for select to authenticated
  using (public.is_condo_member(condo_id));
create policy "Managers can add condo members"
  on public.condo_members for insert to authenticated
  with check (public.is_condo_manager(condo_id));
create policy "Managers can remove condo members"
  on public.condo_members for delete to authenticated
  using (public.is_condo_manager(condo_id));

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

create policy "Members can read maintenance requests"
  on public.maintenance_requests for select to authenticated
  using (public.is_condo_member(condo_id));
create policy "Members can create maintenance requests"
  on public.maintenance_requests for insert to authenticated
  with check (public.is_condo_member(condo_id) and created_by = (select auth.uid()));
create policy "Members can update maintenance requests"
  on public.maintenance_requests for update to authenticated
  using (public.is_condo_member(condo_id))
  with check (public.is_condo_member(condo_id));
create policy "Managers can delete maintenance requests"
  on public.maintenance_requests for delete to authenticated
  using (public.is_condo_manager(condo_id));

create policy "Members can read stock items"
  on public.stock_items for select to authenticated
  using (public.is_condo_member(condo_id));
create policy "Members can create stock items"
  on public.stock_items for insert to authenticated
  with check (public.is_condo_member(condo_id));
create policy "Members can update stock items"
  on public.stock_items for update to authenticated
  using (public.is_condo_member(condo_id))
  with check (public.is_condo_member(condo_id));
create policy "Managers can delete stock items"
  on public.stock_items for delete to authenticated
  using (public.is_condo_manager(condo_id));

create policy "Members can read stock movements"
  on public.stock_movements for select to authenticated
  using (public.is_condo_member(condo_id));
create policy "Members can create stock movements"
  on public.stock_movements for insert to authenticated
  with check (public.is_condo_member(condo_id) and created_by = (select auth.uid()));

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

create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  update public.stock_items
     set quantity = quantity + case when new.movement_type = 'in' then new.quantity else -new.quantity end
   where id = new.item_id
     and condo_id = new.condo_id
     and (new.movement_type = 'in' or quantity >= new.quantity);
  get diagnostics changed_rows = row_count;
  if changed_rows = 0 then
    raise exception 'Item not found or insufficient stock';
  end if;
  return new;
end;
$$;

create trigger stock_movement_updates_quantity
  before insert on public.stock_movements
  for each row execute function public.apply_stock_movement();
