alter table public.equipment add column hours_recorded_at timestamptz;
update public.equipment set hours_recorded_at=now() where current_hours is not null;
create function public.stamp_equipment_hours() returns trigger language plpgsql set search_path='' as $$
begin new.hours_recorded_at=now(); return new; end $$;
create trigger equipment_hours_stamp before insert or update of current_hours on public.equipment for each row execute function public.stamp_equipment_hours();
