-- Applied as pm_schedule_mistake_delete. Existing history FK uses SET NULL.
grant delete on public.pm_schedules to authenticated;
create policy pm_maintainer_delete on public.pm_schedules for delete to authenticated
using (exists (
  select 1 from public.equipment e
  where e.id = pm_schedules.equipment_id
    and e.site_id is not null and public.can_work_at_site(e.site_id)
));
