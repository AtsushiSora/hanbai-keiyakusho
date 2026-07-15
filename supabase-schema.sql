create table if not exists public.order_auto_contracts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  buyer_name text,
  vehicle_name text,
  total_price text,
  status text not null default '下書き',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.order_auto_contracts enable row level security;

drop policy if exists "order_auto_contracts_select_own" on public.order_auto_contracts;
drop policy if exists "order_auto_contracts_insert_own" on public.order_auto_contracts;
drop policy if exists "order_auto_contracts_update_own" on public.order_auto_contracts;
drop policy if exists "order_auto_contracts_delete_own" on public.order_auto_contracts;

create policy "order_auto_contracts_select_own"
on public.order_auto_contracts
for select
to authenticated
using (auth.uid() = user_id);

create policy "order_auto_contracts_insert_own"
on public.order_auto_contracts
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "order_auto_contracts_update_own"
on public.order_auto_contracts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "order_auto_contracts_delete_own"
on public.order_auto_contracts
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists order_auto_contracts_user_updated_idx
on public.order_auto_contracts (user_id, updated_at desc);
