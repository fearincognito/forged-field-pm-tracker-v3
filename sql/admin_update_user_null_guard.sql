-- Applied to live V3 on 2026-11-13 after 21 isolated authorization tests.
-- Preserve existing grants and business logic; fail closed for inactive/missing profiles.
CREATE OR REPLACE FUNCTION public.admin_update_user(p_user_id uuid, p_full_name text, p_role app_role, p_active boolean, p_site_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_role public.app_role;
  existing_role public.app_role;
  requested_sites uuid[] := coalesce(p_site_ids, '{}'::uuid[]);
  requested_site_count integer;
  valid_site_count integer;
  active_owner_count integer;
begin
  actor_role := public.current_user_role();

  if auth.uid() is null
     or actor_role is null
     or actor_role not in ('owner'::public.app_role, 'admin'::public.app_role) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select role into existing_role
  from public.profiles
  where id = p_user_id;

  if existing_role is null then
    raise exception 'User profile not found';
  end if;

  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'Full name is required';
  end if;

  if auth.uid() = p_user_id and p_active = false then
    raise exception 'You cannot disable your own account';
  end if;

  if actor_role = 'admin'::public.app_role then
    if existing_role in ('owner'::public.app_role, 'admin'::public.app_role)
       or p_role in ('owner'::public.app_role, 'admin'::public.app_role) then
      raise exception 'Admins cannot modify or assign Owner/Admin accounts' using errcode = '42501';
    end if;
  end if;

  if existing_role = 'owner'::public.app_role
     and (p_role <> 'owner'::public.app_role or p_active = false) then
    select count(*) into active_owner_count
    from public.profiles
    where role = 'owner'::public.app_role
      and active = true;

    if active_owner_count <= 1 then
      raise exception 'At least one active Owner account is required';
    end if;
  end if;

  if p_role not in ('owner'::public.app_role, 'admin'::public.app_role, 'mechanic'::public.app_role) then
    select count(distinct x) into requested_site_count
    from unnest(requested_sites) as x;

    select count(*) into valid_site_count
    from public.sites
    where id = any(requested_sites)
      and archived = false;

    if requested_site_count <> valid_site_count then
      raise exception 'One or more selected sites are invalid or archived';
    end if;
  end if;

  update public.profiles
  set full_name = btrim(p_full_name),
      role = p_role,
      active = p_active,
      updated_at = now()
  where id = p_user_id;

  delete from public.site_members where user_id = p_user_id;

  if p_role not in ('owner'::public.app_role, 'admin'::public.app_role, 'mechanic'::public.app_role) then
    insert into public.site_members (site_id, user_id)
    select distinct x, p_user_id
    from unnest(requested_sites) as x;
  end if;

  return true;
end;
$function$
