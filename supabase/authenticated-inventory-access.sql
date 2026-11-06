-- Run once in your existing Supabase project's SQL Editor.
-- Adds signed-in access to the shared POS inventory; does not delete or change records.
-- Existing policies are preserved. Access remains subject to any restrictive policies.
begin;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.products to authenticated;
alter table public.products enable row level security;
drop policy if exists "pos authenticated access" on public.products;
create policy "pos authenticated access" on public.products
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on table public.customers to authenticated;
alter table public.customers enable row level security;
drop policy if exists "pos authenticated access" on public.customers;
create policy "pos authenticated access" on public.customers
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on table public.sales to authenticated;
alter table public.sales enable row level security;
drop policy if exists "pos authenticated access" on public.sales;
create policy "pos authenticated access" on public.sales
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on table public.sale_items to authenticated;
alter table public.sale_items enable row level security;
drop policy if exists "pos authenticated access" on public.sale_items;
create policy "pos authenticated access" on public.sale_items
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on table public.expenses to authenticated;
alter table public.expenses enable row level security;
drop policy if exists "pos authenticated access" on public.expenses;
create policy "pos authenticated access" on public.expenses
  for all to authenticated using (true) with check (true);
commit;
