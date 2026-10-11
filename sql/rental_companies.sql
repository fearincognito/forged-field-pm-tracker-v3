create table public.rental_companies (
 id uuid primary key default gen_random_uuid(),
 company_name text not null check (length(trim(company_name)) > 0),
 salesperson_name text,
 salesperson_phone text,
 salesperson_email text,
 parts_service_phone text,
 parts_service_email text,
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.rental_companies enable row level security;
revoke all on public.rental_companies from anon;
grant select, insert, update, delete on public.rental_companies to authenticated;
create policy rental_companies_admin_read on public.rental_companies for select to authenticated using ((select public.is_admin()));
create policy rental_companies_admin_insert on public.rental_companies for insert to authenticated with check ((select public.is_admin()));
create policy rental_companies_admin_update on public.rental_companies for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rental_companies_admin_delete on public.rental_companies for delete to authenticated using ((select public.is_admin()));
create trigger rental_companies_updated_at before update on public.rental_companies for each row execute function public.set_updated_at();
