create function public.rental_company_contact_details(p_company_id uuid)
returns table(id uuid,company_name text,salesperson_name text,salesperson_phone text,salesperson_email text,parts_service_phone text,parts_service_email text,notes text)
language sql stable security definer set search_path = '' as $$
 select r.id,r.company_name,r.salesperson_name,r.salesperson_phone,r.salesperson_email,r.parts_service_phone,r.parts_service_email,r.notes
 from public.rental_companies r
 where r.id=p_company_id and auth.uid() is not null and (
 public.is_mechanic_or_above() or exists (
 select 1 from public.equipment e where e.rental_company_id=r.id and e.ownership='rental' and public.can_access_site(e.site_id)
 ));
$$;
revoke all on function public.rental_company_contact_details(uuid) from public, anon;
grant execute on function public.rental_company_contact_details(uuid) to authenticated;
