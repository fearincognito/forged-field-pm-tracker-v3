alter table public.equipment add column rental_company_id uuid references public.rental_companies(id) on delete set null;
create index equipment_rental_company_idx on public.equipment(rental_company_id) where rental_company_id is not null;
create function public.rental_company_options() returns table(id uuid,company_name text)
language sql stable security definer set search_path = '' as $$
 select r.id,r.company_name from public.rental_companies r
 where auth.uid() is not null and public.is_mechanic_or_above()
 order by r.company_name,r.id;
$$;
revoke all on function public.rental_company_options() from public, anon;
grant execute on function public.rental_company_options() to authenticated;
