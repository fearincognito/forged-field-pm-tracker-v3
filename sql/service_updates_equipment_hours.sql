-- Keep service recording and the meter update in the same transaction.
create function public.service_updates_equipment_hours() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if new.service_hours is not null and new.service_hours >= 0 then
   update public.equipment
   set current_hours = new.service_hours, updated_by = auth.uid()
   where id = new.equipment_id
     and (current_hours is null or current_hours <= new.service_hours);
 end if;
 return new;
end;
$$;
revoke all on function public.service_updates_equipment_hours() from public, anon;
create trigger service_updates_equipment_hours
 after insert on public.service_history
 for each row execute function public.service_updates_equipment_hours();
