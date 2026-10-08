-- Applied through Supabase MCP as equipment_mistake_removal.
-- Preserve equipment with operational history, even during concurrent writes.
alter table public.service_history drop constraint service_history_equipment_id_fkey;
alter table public.service_history add constraint service_history_equipment_id_fkey
  foreign key(equipment_id) references public.equipment(id) on delete restrict;
alter table public.work_tickets drop constraint work_tickets_equipment_id_fkey;
alter table public.work_tickets add constraint work_tickets_equipment_id_fkey
  foreign key(equipment_id) references public.equipment(id) on delete restrict;
grant delete on public.equipment to authenticated;
create policy equipment_mistake_delete on public.equipment for delete to authenticated
  using ((select public.is_mechanic_or_above()) and site_id is not null and public.can_access_site(site_id));
