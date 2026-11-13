-- Account History, forward-only. No passwords, tokens, links or auth payloads.
create schema if not exists account_audit_private;
revoke all on schema account_audit_private from public, anon, authenticated, service_role;

create table account_audit_private.operations (
 id uuid primary key default gen_random_uuid(),
 actor_user_id uuid not null, actor_name text not null,
 mode text not null check (mode in ('invite','manual_viewer')),
 full_name text not null, role public.app_role not null, site_ids uuid[] not null,
 status text not null default 'requested' check (status in ('requested','succeeded','failed')),
 target_user_id uuid, created_at timestamptz not null default clock_timestamp(), finished_at timestamptz
);
create table account_audit_private.events (
 id bigint generated always as identity primary key,
 occurred_at timestamptz not null default clock_timestamp(),
 operation_id uuid,
 actor_user_id uuid, actor_name text not null,
 target_user_id uuid, target_name text not null,
 event_type text not null, outcome text not null check(outcome in ('requested','succeeded','failed')),
 before_values jsonb, after_values jsonb, detail text
);
alter table account_audit_private.operations enable row level security;
alter table account_audit_private.events enable row level security;
revoke all on all tables in schema account_audit_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema account_audit_private from public,anon,authenticated,service_role;
create index account_audit_target_idx on account_audit_private.events(target_user_id,id desc);
create unique index account_audit_operation_outcome_idx on account_audit_private.events(operation_id,event_type,coalesce(detail,''))
 where operation_id is not null and (event_type like 'invitation_%' or event_type like 'manual_account_%');

create function account_audit_private.write_event(p_target uuid,p_target_name text,p_type text,p_outcome text,p_before jsonb,p_after jsonb,p_detail text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_actor_name text; v_op uuid; v_context text;
begin
 v_actor:=auth.uid();
 if v_actor is not null then
  select full_name into v_actor_name from public.profiles where id=v_actor;
  v_actor_name:=coalesce(v_actor_name,'Authenticated user');
 elsif auth.role() = 'service_role' then
  v_context:=nullif(current_setting('app.account_audit_operation',true),'');
  if v_context is not null then
   v_op:=v_context::uuid;
   select actor_user_id,actor_name into v_actor,v_actor_name from account_audit_private.operations where id=v_op;
   if not found then raise exception 'Invalid audit context'; end if;
  end if;
 end if;
 insert into account_audit_private.events(operation_id,actor_user_id,actor_name,target_user_id,target_name,event_type,outcome,before_values,after_values,detail)
 values(v_op,v_actor,coalesce(v_actor_name,'System / administrator'),p_target,coalesce(p_target_name,'Account'),p_type,p_outcome,p_before,p_after,p_detail);
end $$;
revoke all on function account_audit_private.write_event(uuid,text,text,text,jsonb,jsonb,text) from public,anon,authenticated,service_role;

create function account_audit_private.profile_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb; a jsonb;
begin
 if tg_op <> 'INSERT' then b:=jsonb_build_object('full_name',old.full_name,'role',old.role,'active',old.active); end if;
 if tg_op <> 'DELETE' then a:=jsonb_build_object('full_name',new.full_name,'role',new.role,'active',new.active); end if;
 if tg_op='UPDATE' and b=a then return new; end if;
 if tg_op='DELETE' then
  perform account_audit_private.write_event(old.id,old.full_name,'account_deleted','succeeded',b,null);
  return old;
 end if;
 perform account_audit_private.write_event(new.id,new.full_name,case when tg_op='INSERT' then 'account_created' else 'account_updated' end,'succeeded',b,a);
 return new;
end $$;
revoke all on function account_audit_private.profile_changed() from public,anon,authenticated,service_role;
create trigger account_history_profile after insert or update or delete on public.profiles for each row execute function account_audit_private.profile_changed();

create function account_audit_private.site_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid; s uuid; n text; sn text; v jsonb;
begin
 if tg_op='UPDATE' then
  if old.site_id=new.site_id and old.user_id=new.user_id then return new; end if;
  select full_name into n from public.profiles where id=old.user_id;
  select name into sn from public.sites where id=old.site_id;
  perform account_audit_private.write_event(old.user_id,n,'site_access_removed','succeeded',jsonb_build_object('site_ids',jsonb_build_array(old.site_id),'site_names',jsonb_build_array(coalesce(sn,'Deleted site'))),null);
 end if;
 if tg_op='DELETE' then u:=old.user_id; s:=old.site_id; else u:=new.user_id; s:=new.site_id; end if;
 select full_name into n from public.profiles where id=u;
 select name into sn from public.sites where id=s;
 v:=jsonb_build_object('site_ids',jsonb_build_array(s),'site_names',jsonb_build_array(coalesce(sn,'Deleted site')));
 perform account_audit_private.write_event(u,n,case when tg_op='DELETE' then 'site_access_removed' else 'site_access_added' end,'succeeded',case when tg_op='DELETE' then v else null end,case when tg_op<>'DELETE' then v else null end);
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function account_audit_private.site_changed() from public,anon,authenticated,service_role;
create trigger account_history_site after insert or update or delete on public.site_members for each row execute function account_audit_private.site_changed();

-- Direct browser writes bypassed the guarded RPC's Owner/Admin boundaries.
revoke all on public.profiles from anon,authenticated;
grant select on public.profiles to authenticated;
revoke all on public.site_members from anon,authenticated;

create function public.owner_account_history(p_limit integer default 50,p_before_id bigint default null)
returns table(id bigint,occurred_at timestamptz,actor_user_id uuid,actor_name text,target_user_id uuid,target_name text,event_type text,outcome text,before_values jsonb,after_values jsonb,detail text)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.current_user_role() is distinct from 'owner'::public.app_role then
  raise exception 'Owner access required' using errcode='42501';
 end if;
 return query select e.id,e.occurred_at,e.actor_user_id,e.actor_name,e.target_user_id,e.target_name,e.event_type,e.outcome,e.before_values,e.after_values,e.detail
 from account_audit_private.events e where p_before_id is null or e.id<p_before_id
 order by e.id desc limit greatest(1,least(coalesce(p_limit,50),100));
end $$;
revoke all on function public.owner_account_history(integer,bigint) from public,anon,service_role;
grant execute on function public.owner_account_history(integer,bigint) to authenticated;

create function public.account_audit_begin(p_actor_user_id uuid,p_mode text,p_full_name text,p_role public.app_role,p_site_ids uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare ar public.app_role; an text; op uuid; ss uuid[]; valid_sites integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
 select role,full_name into ar,an from public.profiles where id=p_actor_user_id and active=true;
 if ar is null or ar not in ('owner','admin') then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_mode is null or p_mode not in ('invite','manual_viewer') or p_role is null or nullif(btrim(p_full_name),'') is null then raise exception 'Invalid account request'; end if;
 if ar='admin' and p_role in ('owner','admin') then raise exception 'Admins cannot assign Owner/Admin' using errcode='42501'; end if;
 if p_mode='manual_viewer' and (ar<>'owner' or p_role<>'viewer') then raise exception 'Manual accounts require Owner and Viewer role' using errcode='42501'; end if;
 ss:=array(select distinct x from unnest(coalesce(p_site_ids,'{}'::uuid[])) x where x is not null order by x);
 if p_role in ('owner','admin','mechanic') then ss:='{}'::uuid[];
 else
  select count(*) into valid_sites from public.sites where id=any(ss) and archived=false;
  if valid_sites<>cardinality(ss) then raise exception 'Invalid or archived site'; end if;
 end if;
 insert into account_audit_private.operations(actor_user_id,actor_name,mode,full_name,role,site_ids)
 values(p_actor_user_id,an,p_mode,btrim(p_full_name),p_role,ss) returning id into op;
 perform set_config('app.account_audit_operation',op::text,true);
 perform account_audit_private.write_event(null,btrim(p_full_name),case when p_mode='invite' then 'invitation_requested' else 'manual_account_requested' end,'requested',null,jsonb_build_object('full_name',btrim(p_full_name),'role',p_role,'active',true,'site_ids',ss));
 return op;
end $$;
revoke all on function public.account_audit_begin(uuid,text,text,public.app_role,uuid[]) from public,anon,authenticated;
grant execute on function public.account_audit_begin(uuid,text,text,public.app_role,uuid[]) to service_role;

create function public.account_audit_finalize(p_operation_id uuid,p_target_user_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare op account_audit_private.operations%rowtype; ar public.app_role; er public.app_role; sn text[];
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
 select * into op from account_audit_private.operations where id=p_operation_id for update;
 if not found then raise exception 'Account operation not found'; end if;
 if op.status='succeeded' and op.target_user_id=p_target_user_id then return true; end if;
 if op.status<>'requested' then raise exception 'Account operation already finished'; end if;
 select role into ar from public.profiles where id=op.actor_user_id and active=true;
 if ar is null or ar not in ('owner','admin') then raise exception 'Not authorized' using errcode='42501'; end if;
 if ar='admin' and op.role in ('owner','admin') then raise exception 'Admins cannot assign Owner/Admin' using errcode='42501'; end if;
 if op.mode='manual_viewer' and (ar<>'owner' or op.role<>'viewer') then raise exception 'Not authorized' using errcode='42501'; end if;
 select role into er from public.profiles where id=p_target_user_id;
 if er is null then raise exception 'Created account profile not found'; end if;
 if ar='admin' and er in ('owner','admin') then raise exception 'Admins cannot change Owner/Admin' using errcode='42501'; end if;
 if exists(select 1 from unnest(op.site_ids) x left join public.sites s on s.id=x where s.id is null or s.archived) then raise exception 'Invalid or archived site'; end if;
 perform set_config('app.account_audit_operation',op.id::text,true);
 update public.profiles set full_name=op.full_name,role=op.role,active=true,updated_at=now() where id=p_target_user_id;
 delete from public.site_members where user_id=p_target_user_id and not (site_id=any(op.site_ids));
 insert into public.site_members(site_id,user_id) select x,p_target_user_id from unnest(op.site_ids) x on conflict do nothing;
 select array_agg(name order by name) into sn from public.sites where id=any(op.site_ids);
 perform account_audit_private.write_event(p_target_user_id,op.full_name,case when op.mode='invite' then 'invitation_succeeded' else 'manual_account_succeeded' end,'succeeded',null,jsonb_build_object('full_name',op.full_name,'role',op.role,'active',true,'site_ids',op.site_ids,'site_names',coalesce(sn,'{}'::text[])));
 update account_audit_private.operations set status='succeeded',target_user_id=p_target_user_id,finished_at=clock_timestamp() where id=op.id;
 return true;
end $$;
revoke all on function public.account_audit_finalize(uuid,uuid) from public,anon,authenticated;
grant execute on function public.account_audit_finalize(uuid,uuid) to service_role;

create function public.account_audit_fail(p_operation_id uuid,p_target_user_id uuid,p_error_code text)
returns void language plpgsql security definer set search_path='' as $$
declare op account_audit_private.operations%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
 if p_error_code is null or p_error_code not in ('provider_failed','setup_failed','cleanup_failed') then raise exception 'Invalid failure code'; end if;
 select * into op from account_audit_private.operations where id=p_operation_id for update;
 if not found then raise exception 'Account operation not found'; end if;
 if op.status='succeeded' then return; end if;
 perform set_config('app.account_audit_operation',op.id::text,true);
 if not exists(select 1 from account_audit_private.events where operation_id=op.id and detail=p_error_code) then
  perform account_audit_private.write_event(p_target_user_id,op.full_name,case when op.mode='invite' then 'invitation_failed' else 'manual_account_failed' end,'failed',null,null,p_error_code);
 end if;
 update account_audit_private.operations set status='failed',target_user_id=coalesce(p_target_user_id,target_user_id),finished_at=clock_timestamp() where id=op.id;
end $$;
revoke all on function public.account_audit_fail(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.account_audit_fail(uuid,uuid,text) to service_role;
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

  delete from public.site_members
  where user_id = p_user_id
    and (p_role in ('owner'::public.app_role, 'admin'::public.app_role, 'mechanic'::public.app_role)
         or not (site_id = any(requested_sites)));

  if p_role not in ('owner'::public.app_role, 'admin'::public.app_role, 'mechanic'::public.app_role) then
    insert into public.site_members (site_id, user_id)
    select distinct x, p_user_id
    from unnest(requested_sites) as x
    on conflict do nothing;
  end if;

  return true;
end;
$function$

