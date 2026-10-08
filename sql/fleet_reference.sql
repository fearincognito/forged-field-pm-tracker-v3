-- Applied through Supabase MCP as add_fleet_reference_catalog.
-- Immutable source snapshots; operational equipment is created only on selection.
create table public.fleet_reference (
  id text primary key,
  unit_number text not null,
  description text not null,
  data jsonb not null,
  has_photo boolean not null default false,
  imported_at timestamptz not null default now()
);
create table public.fleet_reference_photos (
  reference_id text primary key references public.fleet_reference(id),
  photos jsonb not null
);
alter table public.equipment add column fleet_reference_id text
  references public.fleet_reference(id);
create unique index equipment_fleet_reference_unique
  on public.equipment(fleet_reference_id) where fleet_reference_id is not null;
alter table public.fleet_reference enable row level security;
alter table public.fleet_reference_photos enable row level security;
grant select on public.fleet_reference, public.fleet_reference_photos to authenticated;
revoke all on public.fleet_reference, public.fleet_reference_photos from anon;
create policy fleet_reference_read on public.fleet_reference
  for select to authenticated using (
    (select public.is_mechanic_or_above()) or exists (
      select 1 from public.equipment e where e.fleet_reference_id = fleet_reference.id
    )
  );
create policy fleet_reference_photo_read on public.fleet_reference_photos
  for select to authenticated using (
    (select public.is_mechanic_or_above()) or exists (
      select 1 from public.equipment e where e.fleet_reference_id = fleet_reference_photos.reference_id
    )
  );
-- No client INSERT/UPDATE/DELETE grants or policies on source snapshots.
